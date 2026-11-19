// ParseServer - open-source compatible API Server for Parse apps

var batch = require('./batch'),
  express = require('express'),
  middlewares = require('./middlewares'),
  Parse = require('parse/node').Parse,
  { parse } = require('graphql'),
  path = require('path'),
  fs = require('fs');

import { ParseServerOptions, LiveQueryServerOptions } from './Options';
import { setRegexTimeout } from './LiveQuery/QueryTools';
import defaults, { DatabaseOptionDefaults } from './defaults';
import * as logging from './logger';
import Config from './Config';
import PromiseRouter from './PromiseRouter';
import requiredParameter from './requiredParameter';
import { AnalyticsRouter } from './Routers/AnalyticsRouter';
import { ClassesRouter } from './Routers/ClassesRouter';
import { FeaturesRouter } from './Routers/FeaturesRouter';
import { FilesRouter } from './Routers/FilesRouter';
import { FunctionsRouter } from './Routers/FunctionsRouter';
import { GlobalConfigRouter } from './Routers/GlobalConfigRouter';
import { GraphQLRouter } from './Routers/GraphQLRouter';
import { HooksRouter } from './Routers/HooksRouter';
import { IAPValidationRouter } from './Routers/IAPValidationRouter';
import { InstallationsRouter } from './Routers/InstallationsRouter';
import { LogsRouter } from './Routers/LogsRouter';
import { ParseLiveQueryServer } from './LiveQuery/ParseLiveQueryServer';
import { PagesRouter } from './Routers/PagesRouter';
import { PushRouter } from './Routers/PushRouter';
import { CloudCodeRouter } from './Routers/CloudCodeRouter';
import { RolesRouter } from './Routers/RolesRouter';
import { SchemasRouter } from './Routers/SchemasRouter';
import { SessionsRouter } from './Routers/SessionsRouter';
import { UsersRouter } from './Routers/UsersRouter';
import { PurgeRouter } from './Routers/PurgeRouter';
import { AudiencesRouter } from './Routers/AudiencesRouter';
import { AggregateRouter } from './Routers/AggregateRouter';
import { ParseServerRESTController } from './ParseServerRESTController';
import * as controllers from './Controllers';
import { ParseGraphQLServer } from './GraphQL/ParseGraphQLServer';
import { SecurityRouter } from './Routers/SecurityRouter';
import CheckRunner from './Security/CheckRunner';
import Deprecator from './Deprecator/Deprecator';
import { DefinedSchemas } from './SchemaMigrations/DefinedSchemas';
import OptionsDefinitions from './Options/Definitions';
import { Connections, sleep } from './TestUtils';
import { constants as osConstants } from 'os';

// Mutate the Parse object to add the Cloud Code handlers
addParseCloud();


// ParseServer works like a constructor of an express app.
// https://parseplatform.org/parse-server/api/master/ParseServerOptions.html
class ParseServer {
  _app: any;
  config: any;
  _server: any;
  expressApp: any;
  liveQueryServer: any;
  _connections: Connections;
  _startPromise: Promise<this> | undefined;
  _startAppPromise: Promise<this> | undefined;
  _shutdownPromise: Promise<void> | undefined;
  _shutdownController: AbortController;
  /**
   * @constructor
   * @param {ParseServerOptions} options the parse server initialization options
   */
  constructor(options: ParseServerOptions) {
    // Scan for deprecated Parse Server options
    Deprecator.scanParseServerOptions(options);

    const interfaces = JSON.parse(JSON.stringify(OptionsDefinitions));

    function getValidObject(root) {
      const result = {};
      for (const key in root) {
        if (Object.prototype.hasOwnProperty.call(root[key], 'type')) {
          if (root[key].type.endsWith('[]')) {
            result[key] = [getValidObject(interfaces[root[key].type.slice(0, -2)])];
          } else {
            result[key] = getValidObject(interfaces[root[key].type]);
          }
        } else {
          result[key] = '';
        }
      }
      return result;
    }

    const optionsBlueprint = getValidObject(interfaces['ParseServerOptions']);

    function validateKeyNames(original, ref, name = '') {
      let result = [];
      const prefix = name + (name !== '' ? '.' : '');
      for (const key in original) {
        if (!Object.prototype.hasOwnProperty.call(ref, key)) {
          result.push(prefix + key);
        } else {
          if (ref[key] === '') { continue; }
          let res = [];
          if (Array.isArray(original[key]) && Array.isArray(ref[key])) {
            const type = ref[key][0];
            original[key].forEach((item, idx) => {
              if (typeof item === 'object' && item !== null) {
                res = res.concat(validateKeyNames(item, type, prefix + key + `[${idx}]`));
              }
            });
          } else if (typeof original[key] === 'object' && typeof ref[key] === 'object') {
            res = validateKeyNames(original[key], ref[key], prefix + key);
          }
          result = result.concat(res);
        }
      }
      return result;
    }

    const diff = validateKeyNames(options, optionsBlueprint);
    if (diff.length > 0) {
      const logger = (logging as any).logger;
      logger.error(`Invalid key(s) found in Parse Server configuration: ${diff.join(', ')}`);
    }

    // Set option defaults
    injectDefaults(options);
    const {
      appId = requiredParameter('You must provide an appId!'),
      masterKey = requiredParameter('You must provide a masterKey!'),
      javascriptKey,
      serverURL = requiredParameter('You must provide a serverURL!'),
    } = options;
    // Initialize the node client SDK automatically
    Parse.initialize(appId, javascriptKey || 'unused', masterKey);
    Parse.serverURL = serverURL;
    Config.validateOptions(options);
    const allControllers = controllers.getControllers(options);

    (options as any).state = 'initialized';
    this.config = Config.put(Object.assign({}, options, allControllers));
    this.config.masterKeyIpsStore = new Map();
    this._connections = new Connections();
    this._shutdownController = new AbortController();
    this.config.maintenanceKeyIpsStore = new Map();
    this.config.readOnlyMasterKeyIpsStore = new Map();
    setRegexTimeout(options.liveQuery?.regexTimeout);
    logging.setLogger(allControllers.loggerController);
  }

  /**
   * Starts Parse Server as an express app; this promise resolves when Parse Server is ready to accept requests.
   */

  async start(): Promise<this> {
    if (this._shutdownPromise) {
      throw new Error('Parse Server cannot be started after handleShutdown() has been called');
    }
    if (!this._startPromise) {
      this._startPromise = this._start().finally(() => {
        this._startPromise = undefined;
      });
    }
    return this._startPromise;
  }

  async _start(): Promise<this> {
    try {
      if (this.config.state === 'ok') {
        return this;
      }
      this.config.state = 'starting';
      Config.put(this.config);
      const {
        databaseController,
        hooksController,
        cacheController,
        cloud,
        security,
        schema,
        liveQueryController,
      } = this.config;
      try {
        await databaseController.performInitialization();
      } catch (e) {
        if (e.code !== Parse.Error.DUPLICATE_VALUE) {
          throw e;
        }
      }
      const pushController = await controllers.getPushController(this.config);
      await hooksController.load();
      const startupPromises = [this.config.loadMasterKey?.()];
      if (schema) {
        startupPromises.push(new DefinedSchemas(schema, this.config).execute());
      }
      if (
        cacheController.adapter?.connect &&
        typeof cacheController.adapter.connect === 'function'
      ) {
        startupPromises.push(cacheController.adapter.connect());
      }
      startupPromises.push(liveQueryController.connect());
      // The first failure is reported, but only once every startup operation has settled, so that
      // a shutdown following the failure does not run concurrently with an operation still in
      // progress, such as the cache adapter connecting
      let failure;
      const startup = Promise.all(startupPromises).catch(error => {
        failure = { error };
      });
      await Promise.all([
        startup,
        ...startupPromises.map(promise => Promise.resolve(promise).catch(() => {})),
      ]);
      if (failure) {
        throw failure.error;
      }
      if (cloud) {
        addParseCloud();
        if (typeof cloud === 'function') {
          await Promise.resolve(cloud(Parse));
        } else if (typeof cloud === 'string') {
          let json;
          if (process.env.npm_package_json) {
            json = require(process.env.npm_package_json);
          }
          if (process.env.npm_package_type === 'module' || json?.type === 'module') {
            await import(path.resolve(process.cwd(), cloud));
          } else {
            require(path.resolve(process.cwd(), cloud));
          }
        } else {
          throw "argument 'cloud' must either be a string or a function";
        }
        await new Promise(resolve => setTimeout(resolve, 10));
      }
      if (security && security.enableCheck && security.enableCheckLog) {
        new CheckRunner(security).run();
      }
      this.config.state = 'ok';
      // Merge in place: the express app and the health endpoint hold a reference to this object
      Object.assign(this.config, pushController);
      Config.put(this.config);
      return this;
    } catch (error) {
      // eslint-disable-next-line no-console
      console.error(error);
      this.config.state = 'error';
      throw error;
    }
  }

  /**
   * The HTTP server that serves this Parse Server. Set automatically by `startApp()`. When Parse
   * Server is mounted into an existing express app, assign the server returned by `listen()` here
   * so that `handleShutdown()` can drain and close it; connections are tracked from that moment on.
   */
  get server() {
    return this._server;
  }

  set server(server: any) {
    if (server && server !== this._server) {
      this._connections.track(server);
    }
    this._server = server;
  }

  get app() {
    if (!this._app) {
      this._app = ParseServer.app(this.config);
    }
    return this._app;
  }

  /**
   * Stops the parse server, cancels any ongoing requests and closes all connections.
   *
   * The shutdown happens in phases:
   * 1. The server state is set to `draining`. The health endpoint responds with HTTP status `503`
   *    while all other requests are still served, so that load balancers and orchestrators can stop
   *    routing new traffic to this instance. This phase lasts `shutdownDrainDelay` milliseconds.
   * 2. The HTTP server stops accepting new connections, LiveQuery clients are closed and idle
   *    keep-alive connections are closed. Requests that are still in-flight are allowed to complete
   *    for up to `shutdownTimeout` milliseconds, after which any remaining connections are destroyed.
   * 3. The database, file and cache adapters are shut down, the state is set to `closed` and
   *    `serverCloseComplete` is called.
   *
   * With the default option values of `0` the shutdown is immediate.
   *
   * If Parse Server is mounted into an existing Express app and the HTTP server is created outside
   * of Parse Server, assign that HTTP server to `parseServer.server` after calling `listen()` so
   * that it can be drained and closed here.
   *
   * Calling this method more than once returns the promise of the first call. A shutdown that is
   * requested while `start()` or `startApp()` is in progress waits for the start to complete, except
   * for the verification of the server URL which is aborted, and the server cannot be started again
   * afterwards. Every step runs even if a previous step failed;
   * the promise is rejected with an `AggregateError` of the collected errors once the shutdown has
   * completed.
   *
   * @returns {Promise<void>} a promise that resolves once the server has shut down.
   */
  handleShutdown(): Promise<void> {
    if (!this._shutdownPromise) {
      // Aborts the server URL verification of a start in progress so that it cannot delay the shutdown
      this._shutdownController.abort();
      this._shutdownPromise = this._handleShutdown();
    }
    return this._shutdownPromise;
  }

  async _handleShutdown() {
    // Both options are validated in Config.validateOptions
    const drainDelay = this.config.shutdownDrainDelay || 0;
    const timeout = this.config.shutdownTimeout || 0;
    const errors = [];
    // One failing step must not prevent the remaining steps from running
    const attempt = async (step: string, fn: () => any) => {
      try {
        await fn();
      } catch (error) {
        // eslint-disable-next-line no-console
        console.error(`Error during shutdown while ${step}`, error);
        errors.push(error);
      }
    };
    const waitAtMost = async (promise: Promise<any>, ms: number, onTimeout?: () => void) => {
      let timer;
      await Promise.race([
        promise,
        new Promise<void>(resolve => {
          timer = setTimeout(() => {
            onTimeout?.();
            resolve();
          }, ms);
        }),
      ]);
      clearTimeout(timer);
    };

    // A shutdown that is requested while the server is starting waits for the start to complete,
    // whether it succeeds or fails, so that the two never run concurrently.
    const starting = this._startAppPromise || this._startPromise;
    if (starting) {
      await starting.catch(() => {});
    }

    // Phase 1: announce the shutdown via the health endpoint while still serving requests. A server
    // that is not serving (never started, failed to start) must not start serving now.
    if (this.config.state === 'ok') {
      this.config.state = 'draining';
      if (drainDelay > 0) {
        await sleep(drainDelay);
      }
    }

    // Phase 2: stop accepting new connections and let in-flight requests complete. LiveQuery
    // clients are closed at the same time because their upgraded sockets keep the HTTP server open.
    const servers = [];
    if (this.server) {
      servers.push(this.server);
    }
    if (this.liveQueryServer?.server?.close && this.liveQueryServer.server !== this.server) {
      servers.push(this.liveQueryServer.server);
    }
    if (servers.length === 0) {
      logging
        .getLogger()
        .warn(
          'Parse Server has no HTTP server to close. Assign the server returned by listen() to parseServer.server when mounting Parse Server into an existing express app.'
        );
    }
    const serversClosed = Promise.all(
      servers.map(
        server =>
          new Promise<void>(resolve => {
            server.close((error: any) => {
              /* istanbul ignore next */
              if (error) {
                // eslint-disable-next-line no-console
                console.error('Error while closing server', error);
              }
              resolve();
            });
          })
      )
    );
    const liveQueryClosed = this.liveQueryServer
      ? attempt('shutting down the LiveQuery server', () => this.liveQueryServer.shutdown())
      : Promise.resolve();
    const allClosed = Promise.all([serversClosed, liveQueryClosed]);
    if (timeout > 0) {
      // Keep-alive connections that become idle after their current request completes are closed
      // periodically, so that the shutdown does not wait for the client to close them.
      const closeIdleInterval = setInterval(() => {
        for (const server of servers) {
          // Not available on http2 servers
          if (typeof server.closeIdleConnections === 'function') {
            server.closeIdleConnections();
          }
        }
      }, 100);
      await waitAtMost(allClosed, timeout);
      clearInterval(closeIdleInterval);
    }

    // Phase 3: destroy remaining connections, including upgraded WebSocket sockets that
    // closeAllConnections() does not cover, then shut down the adapters.
    this._connections.destroyAll();
    for (const server of servers) {
      // Not available on http2 servers
      if (typeof server.closeAllConnections === 'function') {
        server.closeAllConnections();
      }
    }
    // The LiveQuery teardown is bounded as well: its pub/sub adapter may never settle when the
    // Redis server is unreachable. Its errors are collected by attempt(); a timeout is reported too.
    await waitAtMost(liveQueryClosed, 1000, () => {
      const error = new Error('The LiveQuery server did not shut down in time');
      // eslint-disable-next-line no-console
      console.error('Error during shutdown while shutting down the LiveQuery server', error);
      errors.push(error);
    });
    // Connections opened before the server was tracked cannot be destroyed; do not wait forever.
    await waitAtMost(serversClosed, 1000, /* istanbul ignore next */ () => {
      logging
        .getLogger()
        .warn('Shutdown proceeds with connections still open; they could not be closed.');
    });
    const { adapter: databaseAdapter } = this.config.databaseController;
    const { adapter: fileAdapter } = this.config.filesController;
    const { adapter: cacheAdapter } = this.config.cacheController;
    await Promise.all(
      [
        ['database', databaseAdapter],
        ['files', fileAdapter],
        ['cache', cacheAdapter],
      ]
        .filter(([, adapter]) => adapter && typeof adapter.handleShutdown === 'function')
        .map(([name, adapter]) =>
          attempt(`shutting down the ${name} adapter`, () => adapter.handleShutdown())
        )
    );
    this.config.state = 'closed';
    if (this.config.serverCloseComplete) {
      // Not awaited: the callback has always been fire-and-forget
      await attempt('running serverCloseComplete', () => {
        this.config.serverCloseComplete();
      });
    }
    if (errors.length > 0) {
      // AggregateError is not in the TypeScript lib used by this project
      throw new (globalThis as any).AggregateError(
        errors,
        'Parse Server shutdown completed with errors'
      );
    }
  }

  /**
   * @static
   * Allow developers to customize each request with inversion of control/dependency injection
   */
  static applyRequestContextMiddleware(api, options) {
    if (options.requestContextMiddleware) {
      if (typeof options.requestContextMiddleware !== 'function') {
        throw new Error('requestContextMiddleware must be a function');
      }
      api.use(options.requestContextMiddleware);
    }
  }
  /**
   * @static
   * Create an express app for the parse server
   * @param {Object} options let you specify the maxUploadSize when creating the express app  */
  static app(options) {
    const {
      maxUploadSize = '20mb',
      appId,
      directAccess,
      pages,
      rateLimit = [],
    } = options;
    // This app serves the Parse API directly.
    // It's the equivalent of https://api.parse.com/1 in the hosted Parse API.
    var api = express();
    //api.use("/apps", express.static(__dirname + "/public"));
    api.use(middlewares.allowCrossDomain(appId));
    api.use(middlewares.allowDoubleForwardSlash);
    api.use(middlewares.handleParseAuth(appId));
    // File handling needs to be before the default JSON body parser because file
    // uploads send binary data that should not be parsed as JSON.
    api.use(
      '/',
      new FilesRouter().expressRouter({
        maxUploadSize: maxUploadSize,
      })
    );

    api.use('/health', middlewares.enforceRouteAllowList, middlewares.handleParseHealth(options));

    api.use(
      '/',
      express.urlencoded({ extended: false }),
      new PagesRouter(pages).expressRouter()
    );

    api.use(express.json({ type: req => !req.is('multipart/form-data'), limit: maxUploadSize }));
    api.use(middlewares.allowMethodOverride);
    api.use(middlewares.handleParseHeaders);
    api.use(middlewares.enforceRouteAllowList);
    api.set('query parser', 'extended');
    const routes = Array.isArray(rateLimit) ? rateLimit : [rateLimit];
    for (const route of routes) {
      middlewares.addRateLimit(route, options);
    }
    api.use(middlewares.handleParseSession);
    this.applyRequestContextMiddleware(api, options);
    const appRouter = ParseServer.promiseRouter({ appId, options });
    api.use(appRouter.expressRouter());

    api.use(middlewares.handleParseErrors);

    // run the following when not testing
    if (!process.env.TESTING) {
      //This causes tests to spew some useless warnings, so disable in test
      /* istanbul ignore next */
      process.on('uncaughtException', (err: any) => {
        if (err.code === 'EADDRINUSE') {
          // user-friendly message for this common error
          process.stderr.write(`Unable to listen on port ${err.port}. The port is already in use.`);
          process.exit(0);
        } else {
          if (err.message) {
            process.stderr.write('An uncaught exception occurred: ' + err.message);
          }
          if (err.stack) {
            process.stderr.write('Stack Trace:\n' + err.stack);
          } else {
            process.stderr.write(err);
          }
          process.exit(1);
        }
      });
    }
    if (process.env.PARSE_SERVER_ENABLE_EXPERIMENTAL_DIRECT_ACCESS === '1' || directAccess) {
      Parse.CoreManager.setRESTController(ParseServerRESTController(appId, appRouter));
    }
    return api;
  }

  static promiseRouter({ appId, options }) {
    const routers = [
      new ClassesRouter(),
      new UsersRouter(),
      new SessionsRouter(),
      new RolesRouter(),
      new AnalyticsRouter(),
      new InstallationsRouter(),
      new FunctionsRouter(),
      new SchemasRouter(),
      new PushRouter(),
      new LogsRouter(),
      new FeaturesRouter(),
      new GlobalConfigRouter(),
      new GraphQLRouter(),
      new PurgeRouter(),
      new HooksRouter(),
      new CloudCodeRouter(),
      new AudiencesRouter(),
      new AggregateRouter(),
      new SecurityRouter(),
    ];

    if (options?.enableProductPurchaseLegacyApi !== false) {
      routers.push(new IAPValidationRouter());
    }

    const routes = routers.reduce((memo, router) => {
      return memo.concat(router.routes);
    }, []);

    const appRouter = new PromiseRouter(routes, appId);

    batch.mountOnto(appRouter);
    return appRouter;
  }

  /**
   * starts the parse server's express app
   * @param {ParseServerOptions} options to use to start the server
   * @returns {ParseServer} the parse server instance
   */

  async startApp(options: ParseServerOptions) {
    if (this._shutdownPromise) {
      throw new Error('Parse Server cannot be started after handleShutdown() has been called');
    }
    if (!this._startAppPromise) {
      this._startAppPromise = this._startApp(options).finally(() => {
        this._startAppPromise = undefined;
      });
    }
    return this._startAppPromise;
  }

  async _startApp(options: ParseServerOptions) {
    try {
      await this.start();
    } catch (e) {
      // eslint-disable-next-line no-console
      console.error('Error on ParseServer.startApp: ', e);
      throw e;
    }
    const app = express();
    if (options.middleware) {
      let middleware;
      if (typeof options.middleware == 'string') {
        middleware = require(path.resolve(process.cwd(), options.middleware));
      } else {
        middleware = options.middleware; // use as-is let express fail
      }
      app.use(middleware);
    }
    app.use(options.mountPath, this.app);

    if (options.mountGraphQL === true || options.mountPlayground === true) {
      let graphQLCustomTypeDefs = undefined;
      if (typeof options.graphQLSchema === 'string') {
        graphQLCustomTypeDefs = parse(fs.readFileSync(options.graphQLSchema, 'utf8'));
      } else if (
        typeof options.graphQLSchema === 'object' ||
        typeof options.graphQLSchema === 'function'
      ) {
        graphQLCustomTypeDefs = options.graphQLSchema;
      }

      const parseGraphQLServer = new ParseGraphQLServer(this, {
        graphQLPath: options.graphQLPath,
        playgroundPath: options.playgroundPath,
        graphQLCustomTypeDefs,
      });

      if (options.mountGraphQL) {
        parseGraphQLServer.applyGraphQL(app);
      }

      if (options.mountPlayground) {
        parseGraphQLServer.applyPlayground(app);
        logging.getLogger().warn(
          'GraphQL Playground is deprecated and will be removed in a future version. It exposes the master key in the browser. Use Parse Dashboard as GraphQL IDE or configure a third-party GraphQL client with custom request headers.'
        );
      }
    }
    const server = await new Promise(resolve => {
      app.listen(options.port, options.host, function () {
        resolve(this);
      });
    });
    this.server = server;

    if (options.startLiveQueryServer || options.liveQueryServerOptions) {
      this.liveQueryServer = await ParseServer.createLiveQueryServer(
        server,
        options.liveQueryServerOptions,
        options
      );
      if (this.liveQueryServer.server !== this.server) {
        this._connections.track(this.liveQueryServer.server);
      }
    }
    if (options.trustProxy) {
      app.set('trust proxy', options.trustProxy);
    }
    /* istanbul ignore next */
    if (!process.env.TESTING) {
      configureListeners(this);
      if (options.verifyServerUrl !== false) {
        await ParseServer.verifyServerUrl(this._shutdownController.signal);
      }
    }
    this.expressApp = app;
    return this;
  }

  /**
   * Creates a new ParseServer and starts it.
   * @param {ParseServerOptions} options used to start the server
   * @returns {ParseServer} the parse server instance
   */
  static async startApp(options: ParseServerOptions) {
    const parseServer = new ParseServer(options);
    return parseServer.startApp(options);
  }

  /**
   * Helper method to create a liveQuery server
   * @static
   * @param {Server} httpServer an optional http server to pass
   * @param {LiveQueryServerOptions} config options for the liveQueryServer
   * @param {ParseServerOptions} options options for the ParseServer
   * @returns {Promise<ParseLiveQueryServer>} the live query server instance
   */
  static async createLiveQueryServer(
    httpServer,
    config: LiveQueryServerOptions,
    options: ParseServerOptions
  ): Promise<ParseLiveQueryServer> {
    if (!httpServer || (config && config.port)) {
      var app = express();
      httpServer = require('http').createServer(app);
      httpServer.listen(config.port);
    }
    const server = new ParseLiveQueryServer(httpServer, config, options);
    await server.connect();
    return server;
  }

  /**
   * Verifies that the server URL responds to a health check; retries while the server is starting.
   * @param {AbortSignal} [signal] Aborts the verification, including a pending request and the wait
   * before a retry, in which case the verification resolves without a result.
   */
  static async verifyServerUrl(signal?: AbortSignal) {
    // perform a health check on the serverURL value
    if (Parse.serverURL) {
      const isValidHttpUrl = string => {
        let url;
        try {
          url = new URL(string);
        } catch {
          return false;
        }
        return url.protocol === 'http:' || url.protocol === 'https:';
      };
      const url = `${Parse.serverURL.replace(/\/$/, '')}/health`;
      if (!isValidHttpUrl(url)) {
        // eslint-disable-next-line no-console
        console.warn(
          `\nWARNING, Unable to connect to '${Parse.serverURL}' as the URL is invalid.` +
            ` Cloud code and push notifications may be unavailable!\n`
        );
        return;
      }
      const request = require('./request');
      const response = await request({ url, signal }).catch(response => response);
      if (signal?.aborted) {
        return;
      }
      const json = response.data || null;
      const retry = response.headers?.['retry-after'];
      if (retry) {
        await new Promise<void>(resolve => {
          const onAbort = () => {
            clearTimeout(timer);
            resolve();
          };
          const timer = setTimeout(() => {
            signal?.removeEventListener('abort', onAbort);
            resolve();
          }, retry * 1000);
          signal?.addEventListener('abort', onAbort, { once: true });
        });
        if (signal?.aborted) {
          return;
        }
        return this.verifyServerUrl(signal);
      }
      if (response.status !== 200 || json?.status !== 'ok') {
        /* eslint-disable no-console */
        console.warn(
          `\nWARNING, Unable to connect to '${Parse.serverURL}'.` +
            ` Cloud code and push notifications may be unavailable!\n`
        );
        /* eslint-enable no-console */
        return;
      }
      return true;
    }
  }
}

function addParseCloud() {
  const ParseCloud = require('./cloud-code/Parse.Cloud');
  const ParseServer = require('./cloud-code/Parse.Server');
  Object.defineProperty(Parse, 'Server', {
    get() {
      const conf = Config.get(Parse.applicationId);
      return { ...conf, ...ParseServer };
    },
    set(newVal) {
      newVal.appId = Parse.applicationId;
      Config.put(newVal);
    },
    configurable: true,
  });
  Object.assign(Parse.Cloud, ParseCloud);
  global.Parse = Parse;
}

function injectDefaults(options: ParseServerOptions) {
  Object.keys(defaults).forEach(key => {
    if (!Object.prototype.hasOwnProperty.call(options, key)) {
      options[key] = defaults[key];
    }
  });

  // Inject defaults for database options; only when no explicit database adapter is set,
  // because an explicit adapter manages its own options and passing databaseOptions alongside
  // it would cause a conflict error in getDatabaseController.
  if (!options.databaseAdapter) {
    if (options.databaseOptions == null) {
      options.databaseOptions = {};
    }
    if (typeof options.databaseOptions === 'object' && !Array.isArray(options.databaseOptions)) {
      Object.keys(DatabaseOptionDefaults).forEach(key => {
        if (!Object.prototype.hasOwnProperty.call(options.databaseOptions, key)) {
          options.databaseOptions[key] = DatabaseOptionDefaults[key];
        }
      });
    }
  }

  if (!Object.prototype.hasOwnProperty.call(options, 'serverURL')) {
    options.serverURL = `http://localhost:${options.port}${options.mountPath}`;
  }

  // Reserved Characters
  if (options.appId) {
    const regex = /[!#$%'()*+&/:;=?@[\]{}^,|<>]/g;
    if (options.appId.match(regex)) {
      // eslint-disable-next-line no-console
      console.warn(
        `\nWARNING, appId that contains special characters can cause issues while using with urls.\n`
      );
    }
  }

  // Backwards compatibility
  if (options.userSensitiveFields) {
    /* eslint-disable no-console */
    !process.env.TESTING &&
      console.warn(
        `\nDEPRECATED: userSensitiveFields has been replaced by protectedFields allowing the ability to protect fields in all classes with CLP. \n`
      );
    /* eslint-enable no-console */

    const userSensitiveFields = Array.from(
      new Set([...(defaults.userSensitiveFields || []), ...(options.userSensitiveFields || [])])
    );

    // If the options.protectedFields is unset,
    // it'll be assigned the default above.
    // Here, protect against the case where protectedFields
    // is set, but doesn't have _User.
    if (!('_User' in options.protectedFields)) {
      options.protectedFields = Object.assign({ _User: [] }, options.protectedFields);
    }

    options.protectedFields['_User']['*'] = Array.from(
      new Set([...(options.protectedFields['_User']['*'] || []), ...userSensitiveFields])
    );
  }

  // Merge protectedFields options with defaults.
  Object.keys(defaults.protectedFields).forEach(c => {
    const cur = options.protectedFields[c];
    if (!cur) {
      options.protectedFields[c] = defaults.protectedFields[c];
    } else {
      Object.keys(defaults.protectedFields[c]).forEach(r => {
        if (options.protectedFields[c][r] && options.protectedFieldsOwnerExempt === false) {
          return;
        }
        const unq = new Set([
          ...(options.protectedFields[c][r] || []),
          ...defaults.protectedFields[c][r],
        ]);
        options.protectedFields[c][r] = Array.from(unq);
      });
    }
  });
}

// Those can't be tested as it requires a subprocess
/* istanbul ignore next */
function configureListeners(parseServer) {
  let shuttingDown = false;
  const handleShutdown = function (signal) {
    if (shuttingDown) {
      // A second signal aborts a graceful shutdown that is still in progress
      process.stdout.write('Second termination signal received. Exiting immediately.\n');
      process.exit(128 + (osConstants.signals[signal] || 15));
    }
    shuttingDown = true;
    process.stdout.write('Termination signal received. Shutting down.\n');
    parseServer
      .handleShutdown()
      .catch(error => {
        // eslint-disable-next-line no-console
        console.error('Error during shutdown', error);
        // The process exits once the remaining handles are closed; report the failure in the exit status
        process.exitCode = 1;
      })
      .finally(() => {
        shuttingDown = false;
      });
  };
  process.on('SIGTERM', handleShutdown);
  process.on('SIGINT', handleShutdown);
}

export default ParseServer;
