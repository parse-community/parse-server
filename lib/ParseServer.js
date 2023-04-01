"use strict";

Object.defineProperty(exports, "__esModule", {
  value: true
});
exports.default = void 0;
var _Options = require("./Options");
var _defaults = _interopRequireDefault(require("./defaults"));
var logging = _interopRequireWildcard(require("./logger"));
var _Config = _interopRequireDefault(require("./Config"));
var _PromiseRouter = _interopRequireDefault(require("./PromiseRouter"));
var _requiredParameter = _interopRequireDefault(require("./requiredParameter"));
var _AnalyticsRouter = require("./Routers/AnalyticsRouter");
var _ClassesRouter = require("./Routers/ClassesRouter");
var _FeaturesRouter = require("./Routers/FeaturesRouter");
var _FilesRouter = require("./Routers/FilesRouter");
var _FunctionsRouter = require("./Routers/FunctionsRouter");
var _GlobalConfigRouter = require("./Routers/GlobalConfigRouter");
var _GraphQLRouter = require("./Routers/GraphQLRouter");
var _HooksRouter = require("./Routers/HooksRouter");
var _IAPValidationRouter = require("./Routers/IAPValidationRouter");
var _InstallationsRouter = require("./Routers/InstallationsRouter");
var _LogsRouter = require("./Routers/LogsRouter");
var _ParseLiveQueryServer = require("./LiveQuery/ParseLiveQueryServer");
var _PagesRouter = require("./Routers/PagesRouter");
var _PublicAPIRouter = require("./Routers/PublicAPIRouter");
var _PushRouter = require("./Routers/PushRouter");
var _CloudCodeRouter = require("./Routers/CloudCodeRouter");
var _RolesRouter = require("./Routers/RolesRouter");
var _SchemasRouter = require("./Routers/SchemasRouter");
var _SessionsRouter = require("./Routers/SessionsRouter");
var _UsersRouter = require("./Routers/UsersRouter");
var _PurgeRouter = require("./Routers/PurgeRouter");
var _AudiencesRouter = require("./Routers/AudiencesRouter");
var _AggregateRouter = require("./Routers/AggregateRouter");
var _ParseServerRESTController = require("./ParseServerRESTController");
var controllers = _interopRequireWildcard(require("./Controllers"));
var _ParseGraphQLServer = require("./GraphQL/ParseGraphQLServer");
var _SecurityRouter = require("./Routers/SecurityRouter");
var _CheckRunner = _interopRequireDefault(require("./Security/CheckRunner"));
var _Deprecator = _interopRequireDefault(require("./Deprecator/Deprecator"));
var _DefinedSchemas = require("./SchemaMigrations/DefinedSchemas");
function _getRequireWildcardCache(nodeInterop) { if (typeof WeakMap !== "function") return null; var cacheBabelInterop = new WeakMap(); var cacheNodeInterop = new WeakMap(); return (_getRequireWildcardCache = function (nodeInterop) { return nodeInterop ? cacheNodeInterop : cacheBabelInterop; })(nodeInterop); }
function _interopRequireWildcard(obj, nodeInterop) { if (!nodeInterop && obj && obj.__esModule) { return obj; } if (obj === null || typeof obj !== "object" && typeof obj !== "function") { return { default: obj }; } var cache = _getRequireWildcardCache(nodeInterop); if (cache && cache.has(obj)) { return cache.get(obj); } var newObj = {}; var hasPropertyDescriptor = Object.defineProperty && Object.getOwnPropertyDescriptor; for (var key in obj) { if (key !== "default" && Object.prototype.hasOwnProperty.call(obj, key)) { var desc = hasPropertyDescriptor ? Object.getOwnPropertyDescriptor(obj, key) : null; if (desc && (desc.get || desc.set)) { Object.defineProperty(newObj, key, desc); } else { newObj[key] = obj[key]; } } } newObj.default = obj; if (cache) { cache.set(obj, newObj); } return newObj; }
function _interopRequireDefault(obj) { return obj && obj.__esModule ? obj : { default: obj }; }
// ParseServer - open-source compatible API Server for Parse apps

var batch = require('./batch'),
  bodyParser = require('body-parser'),
  express = require('express'),
  middlewares = require('./middlewares'),
  Parse = require('parse/node').Parse,
  {
    parse
  } = require('graphql'),
  path = require('path'),
  fs = require('fs');
// Mutate the Parse object to add the Cloud Code handlers
addParseCloud();

// ParseServer works like a constructor of an express app.
// https://parseplatform.org/parse-server/api/master/ParseServerOptions.html
class ParseServer {
  /**
   * @constructor
   * @param {ParseServerOptions} options the parse server initialization options
   */
  constructor(options) {
    // Scan for deprecated Parse Server options
    _Deprecator.default.scanParseServerOptions(options);
    // Set option defaults
    injectDefaults(options);
    const {
      appId = (0, _requiredParameter.default)('You must provide an appId!'),
      masterKey = (0, _requiredParameter.default)('You must provide a masterKey!'),
      javascriptKey,
      serverURL = (0, _requiredParameter.default)('You must provide a serverURL!')
    } = options;
    // Initialize the node client SDK automatically
    Parse.initialize(appId, javascriptKey || 'unused', masterKey);
    Parse.serverURL = serverURL;
    _Config.default.validateOptions(options);
    const allControllers = controllers.getControllers(options);
    options.state = 'initialized';
    this.config = _Config.default.put(Object.assign({}, options, allControllers));
    logging.setLogger(allControllers.loggerController);
  }

  /**
   * Starts Parse Server as an express app; this promise resolves when Parse Server is ready to accept requests.
   */

  async start() {
    try {
      if (this.config.state === 'ok') {
        return this;
      }
      this.config.state = 'starting';
      _Config.default.put(this.config);
      const {
        databaseController,
        hooksController,
        cloud,
        security,
        schema,
        cacheAdapter,
        liveQueryController
      } = this.config;
      try {
        await databaseController.performInitialization();
      } catch (e) {
        if (e.code !== Parse.Error.DUPLICATE_VALUE) {
          throw e;
        }
      }
      await hooksController.load();
      const startupPromises = [];
      if (schema) {
        startupPromises.push(new _DefinedSchemas.DefinedSchemas(schema, this.config).execute());
      }
      if (cacheAdapter !== null && cacheAdapter !== void 0 && cacheAdapter.connect && typeof cacheAdapter.connect === 'function') {
        startupPromises.push(cacheAdapter.connect());
      }
      startupPromises.push(liveQueryController.connect());
      await Promise.all(startupPromises);
      if (cloud) {
        addParseCloud();
        if (typeof cloud === 'function') {
          await Promise.resolve(cloud(Parse));
        } else if (typeof cloud === 'string') {
          var _json;
          let json;
          if (process.env.npm_package_json) {
            json = require(process.env.npm_package_json);
          }
          if (process.env.npm_package_type === 'module' || ((_json = json) === null || _json === void 0 ? void 0 : _json.type) === 'module') {
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
        new _CheckRunner.default(security).run();
      }
      this.config.state = 'ok';
      _Config.default.put(this.config);
      return this;
    } catch (error) {
      console.error(error);
      this.config.state = 'error';
      throw error;
    }
  }
  get app() {
    if (!this._app) {
      this._app = ParseServer.app(this.config);
    }
    return this._app;
  }
  handleShutdown() {
    const promises = [];
    const {
      adapter: databaseAdapter
    } = this.config.databaseController;
    if (databaseAdapter && typeof databaseAdapter.handleShutdown === 'function') {
      promises.push(databaseAdapter.handleShutdown());
    }
    const {
      adapter: fileAdapter
    } = this.config.filesController;
    if (fileAdapter && typeof fileAdapter.handleShutdown === 'function') {
      promises.push(fileAdapter.handleShutdown());
    }
    const {
      adapter: cacheAdapter
    } = this.config.cacheController;
    if (cacheAdapter && typeof cacheAdapter.handleShutdown === 'function') {
      promises.push(cacheAdapter.handleShutdown());
    }
    return (promises.length > 0 ? Promise.all(promises) : Promise.resolve()).then(() => {
      if (this.config.serverCloseComplete) {
        this.config.serverCloseComplete();
      }
    });
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
      rateLimit = []
    } = options;
    // This app serves the Parse API directly.
    // It's the equivalent of https://api.parse.com/1 in the hosted Parse API.
    var api = express();
    //api.use("/apps", express.static(__dirname + "/public"));
    api.use(middlewares.allowCrossDomain(appId));
    // File handling needs to be before default middlewares are applied
    api.use('/', new _FilesRouter.FilesRouter().expressRouter({
      maxUploadSize: maxUploadSize
    }));
    api.use('/health', function (req, res) {
      res.status(options.state === 'ok' ? 200 : 503);
      if (options.state === 'starting') {
        res.set('Retry-After', 1);
      }
      res.json({
        status: options.state
      });
    });
    api.use('/', bodyParser.urlencoded({
      extended: false
    }), pages.enableRouter ? new _PagesRouter.PagesRouter(pages).expressRouter() : new _PublicAPIRouter.PublicAPIRouter().expressRouter());
    api.use(bodyParser.json({
      type: '*/*',
      limit: maxUploadSize
    }));
    api.use(middlewares.allowMethodOverride);
    api.use(middlewares.handleParseHeaders);
    const routes = Array.isArray(rateLimit) ? rateLimit : [rateLimit];
    for (const route of routes) {
      middlewares.addRateLimit(route, options);
    }
    api.use(middlewares.handleParseSession);
    this.applyRequestContextMiddleware(api, options);
    const appRouter = ParseServer.promiseRouter({
      appId
    });
    api.use(appRouter.expressRouter());
    api.use(middlewares.handleParseErrors);

    // run the following when not testing
    if (!process.env.TESTING) {
      //This causes tests to spew some useless warnings, so disable in test
      /* istanbul ignore next */
      process.on('uncaughtException', err => {
        if (err.code === 'EADDRINUSE') {
          // user-friendly message for this common error
          process.stderr.write(`Unable to listen on port ${err.port}. The port is already in use.`);
          process.exit(0);
        } else {
          throw err;
        }
      });
      // verify the server url after a 'mount' event is received
      /* istanbul ignore next */
      // api.on('mount', async function () {
      //   await new Promise(resolve => setTimeout(resolve, 1000));
      //   ParseServer.verifyServerUrl();
      // });
    }

    if (process.env.PARSE_SERVER_ENABLE_EXPERIMENTAL_DIRECT_ACCESS === '1' || directAccess) {
      Parse.CoreManager.setRESTController((0, _ParseServerRESTController.ParseServerRESTController)(appId, appRouter));
    }
    return api;
  }
  static promiseRouter({
    appId
  }) {
    const routers = [new _ClassesRouter.ClassesRouter(), new _UsersRouter.UsersRouter(), new _SessionsRouter.SessionsRouter(), new _RolesRouter.RolesRouter(), new _AnalyticsRouter.AnalyticsRouter(), new _InstallationsRouter.InstallationsRouter(), new _FunctionsRouter.FunctionsRouter(), new _SchemasRouter.SchemasRouter(), new _PushRouter.PushRouter(), new _LogsRouter.LogsRouter(), new _IAPValidationRouter.IAPValidationRouter(), new _FeaturesRouter.FeaturesRouter(), new _GlobalConfigRouter.GlobalConfigRouter(), new _GraphQLRouter.GraphQLRouter(), new _PurgeRouter.PurgeRouter(), new _HooksRouter.HooksRouter(), new _CloudCodeRouter.CloudCodeRouter(), new _AudiencesRouter.AudiencesRouter(), new _AggregateRouter.AggregateRouter(), new _SecurityRouter.SecurityRouter()];
    const routes = routers.reduce((memo, router) => {
      return memo.concat(router.routes);
    }, []);
    const appRouter = new _PromiseRouter.default(routes, appId);
    batch.mountOnto(appRouter);
    return appRouter;
  }

  /**
   * starts the parse server's express app
   * @param {ParseServerOptions} options to use to start the server
   * @returns {ParseServer} the parse server instance
   */

  async startApp(options) {
    try {
      await this.start();
    } catch (e) {
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
      } else if (typeof options.graphQLSchema === 'object' || typeof options.graphQLSchema === 'function') {
        graphQLCustomTypeDefs = options.graphQLSchema;
      }
      const parseGraphQLServer = new _ParseGraphQLServer.ParseGraphQLServer(this, {
        graphQLPath: options.graphQLPath,
        playgroundPath: options.playgroundPath,
        graphQLCustomTypeDefs
      });
      if (options.mountGraphQL) {
        parseGraphQLServer.applyGraphQL(app);
      }
      if (options.mountPlayground) {
        parseGraphQLServer.applyPlayground(app);
      }
    }
    const server = await new Promise(resolve => {
      app.listen(options.port, options.host, function () {
        resolve(this);
      });
    });
    this.server = server;
    if (options.startLiveQueryServer || options.liveQueryServerOptions) {
      this.liveQueryServer = await ParseServer.createLiveQueryServer(server, options.liveQueryServerOptions, options);
    }
    if (options.trustProxy) {
      app.set('trust proxy', options.trustProxy);
    }
    /* istanbul ignore next */
    if (!process.env.TESTING) {
      configureListeners(this);
    }
    this.expressApp = app;
    return this;
  }

  /**
   * Creates a new ParseServer and starts it.
   * @param {ParseServerOptions} options used to start the server
   * @returns {ParseServer} the parse server instance
   */
  static async startApp(options) {
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
  static async createLiveQueryServer(httpServer, config, options) {
    if (!httpServer || config && config.port) {
      var app = express();
      httpServer = require('http').createServer(app);
      httpServer.listen(config.port);
    }
    const server = new _ParseLiveQueryServer.ParseLiveQueryServer(httpServer, config, options);
    await server.connect();
    return server;
  }
  static async verifyServerUrl() {
    // perform a health check on the serverURL value
    if (Parse.serverURL) {
      var _response$headers;
      const isValidHttpUrl = string => {
        let url;
        try {
          url = new URL(string);
        } catch (_) {
          return false;
        }
        return url.protocol === 'http:' || url.protocol === 'https:';
      };
      const url = `${Parse.serverURL.replace(/\/$/, '')}/health`;
      if (!isValidHttpUrl(url)) {
        console.warn(`\nWARNING, Unable to connect to '${Parse.serverURL}' as the URL is invalid.` + ` Cloud code and push notifications may be unavailable!\n`);
        return;
      }
      const request = require('./request');
      const response = await request({
        url
      }).catch(response => response);
      const json = response.data || null;
      const retry = (_response$headers = response.headers) === null || _response$headers === void 0 ? void 0 : _response$headers['retry-after'];
      if (retry) {
        await new Promise(resolve => setTimeout(resolve, retry * 1000));
        return this.verifyServerUrl();
      }
      if (response.status !== 200 || (json === null || json === void 0 ? void 0 : json.status) !== 'ok') {
        /* eslint-disable no-console */
        console.warn(`\nWARNING, Unable to connect to '${Parse.serverURL}'.` + ` Cloud code and push notifications may be unavailable!\n`);
        /* eslint-enable no-console */
        return;
      }
      return true;
    }
  }
}
function addParseCloud() {
  const ParseCloud = require('./cloud-code/Parse.Cloud');
  Object.defineProperty(Parse, 'Server', {
    get() {
      return _Config.default.get(Parse.applicationId);
    },
    set(newVal) {
      newVal.appId = Parse.applicationId;
      _Config.default.put(newVal);
    },
    configurable: true
  });
  Object.assign(Parse.Cloud, ParseCloud);
  global.Parse = Parse;
}
function injectDefaults(options) {
  Object.keys(_defaults.default).forEach(key => {
    if (!Object.prototype.hasOwnProperty.call(options, key)) {
      options[key] = _defaults.default[key];
    }
  });
  if (!Object.prototype.hasOwnProperty.call(options, 'serverURL')) {
    options.serverURL = `http://localhost:${options.port}${options.mountPath}`;
  }

  // Reserved Characters
  if (options.appId) {
    const regex = /[!#$%'()*+&/:;=?@[\]{}^,|<>]/g;
    if (options.appId.match(regex)) {
      console.warn(`\nWARNING, appId that contains special characters can cause issues while using with urls.\n`);
    }
  }

  // Backwards compatibility
  if (options.userSensitiveFields) {
    /* eslint-disable no-console */
    !process.env.TESTING && console.warn(`\nDEPRECATED: userSensitiveFields has been replaced by protectedFields allowing the ability to protect fields in all classes with CLP. \n`);
    /* eslint-enable no-console */

    const userSensitiveFields = Array.from(new Set([...(_defaults.default.userSensitiveFields || []), ...(options.userSensitiveFields || [])]));

    // If the options.protectedFields is unset,
    // it'll be assigned the default above.
    // Here, protect against the case where protectedFields
    // is set, but doesn't have _User.
    if (!('_User' in options.protectedFields)) {
      options.protectedFields = Object.assign({
        _User: []
      }, options.protectedFields);
    }
    options.protectedFields['_User']['*'] = Array.from(new Set([...(options.protectedFields['_User']['*'] || []), ...userSensitiveFields]));
  }

  // Merge protectedFields options with defaults.
  Object.keys(_defaults.default.protectedFields).forEach(c => {
    const cur = options.protectedFields[c];
    if (!cur) {
      options.protectedFields[c] = _defaults.default.protectedFields[c];
    } else {
      Object.keys(_defaults.default.protectedFields[c]).forEach(r => {
        const unq = new Set([...(options.protectedFields[c][r] || []), ..._defaults.default.protectedFields[c][r]]);
        options.protectedFields[c][r] = Array.from(unq);
      });
    }
  });
}

// Those can't be tested as it requires a subprocess
/* istanbul ignore next */
function configureListeners(parseServer) {
  const server = parseServer.server;
  const sockets = {};
  /* Currently, express doesn't shut down immediately after receiving SIGINT/SIGTERM if it has client connections that haven't timed out. (This is a known issue with node - https://github.com/nodejs/node/issues/2642)
    This function, along with `destroyAliveConnections()`, intend to fix this behavior such that parse server will close all open connections and initiate the shutdown process as soon as it receives a SIGINT/SIGTERM signal. */
  server.on('connection', socket => {
    const socketId = socket.remoteAddress + ':' + socket.remotePort;
    sockets[socketId] = socket;
    socket.on('close', () => {
      delete sockets[socketId];
    });
  });
  const destroyAliveConnections = function () {
    for (const socketId in sockets) {
      try {
        sockets[socketId].destroy();
      } catch (e) {
        /* */
      }
    }
  };
  const handleShutdown = function () {
    process.stdout.write('Termination signal received. Shutting down.');
    destroyAliveConnections();
    server.close();
    parseServer.handleShutdown();
  };
  process.on('SIGTERM', handleShutdown);
  process.on('SIGINT', handleShutdown);
}
var _default = ParseServer;
exports.default = _default;
//# sourceMappingURL=data:application/json;charset=utf-8;base64,eyJ2ZXJzaW9uIjozLCJuYW1lcyI6WyJiYXRjaCIsInJlcXVpcmUiLCJib2R5UGFyc2VyIiwiZXhwcmVzcyIsIm1pZGRsZXdhcmVzIiwiUGFyc2UiLCJwYXJzZSIsInBhdGgiLCJmcyIsImFkZFBhcnNlQ2xvdWQiLCJQYXJzZVNlcnZlciIsImNvbnN0cnVjdG9yIiwib3B0aW9ucyIsIkRlcHJlY2F0b3IiLCJzY2FuUGFyc2VTZXJ2ZXJPcHRpb25zIiwiaW5qZWN0RGVmYXVsdHMiLCJhcHBJZCIsInJlcXVpcmVkUGFyYW1ldGVyIiwibWFzdGVyS2V5IiwiamF2YXNjcmlwdEtleSIsInNlcnZlclVSTCIsImluaXRpYWxpemUiLCJDb25maWciLCJ2YWxpZGF0ZU9wdGlvbnMiLCJhbGxDb250cm9sbGVycyIsImNvbnRyb2xsZXJzIiwiZ2V0Q29udHJvbGxlcnMiLCJzdGF0ZSIsImNvbmZpZyIsInB1dCIsIk9iamVjdCIsImFzc2lnbiIsImxvZ2dpbmciLCJzZXRMb2dnZXIiLCJsb2dnZXJDb250cm9sbGVyIiwic3RhcnQiLCJkYXRhYmFzZUNvbnRyb2xsZXIiLCJob29rc0NvbnRyb2xsZXIiLCJjbG91ZCIsInNlY3VyaXR5Iiwic2NoZW1hIiwiY2FjaGVBZGFwdGVyIiwibGl2ZVF1ZXJ5Q29udHJvbGxlciIsInBlcmZvcm1Jbml0aWFsaXphdGlvbiIsImUiLCJjb2RlIiwiRXJyb3IiLCJEVVBMSUNBVEVfVkFMVUUiLCJsb2FkIiwic3RhcnR1cFByb21pc2VzIiwicHVzaCIsIkRlZmluZWRTY2hlbWFzIiwiZXhlY3V0ZSIsImNvbm5lY3QiLCJQcm9taXNlIiwiYWxsIiwicmVzb2x2ZSIsImpzb24iLCJwcm9jZXNzIiwiZW52IiwibnBtX3BhY2thZ2VfanNvbiIsIm5wbV9wYWNrYWdlX3R5cGUiLCJ0eXBlIiwiY3dkIiwic2V0VGltZW91dCIsImVuYWJsZUNoZWNrIiwiZW5hYmxlQ2hlY2tMb2ciLCJDaGVja1J1bm5lciIsInJ1biIsImVycm9yIiwiY29uc29sZSIsImFwcCIsIl9hcHAiLCJoYW5kbGVTaHV0ZG93biIsInByb21pc2VzIiwiYWRhcHRlciIsImRhdGFiYXNlQWRhcHRlciIsImZpbGVBZGFwdGVyIiwiZmlsZXNDb250cm9sbGVyIiwiY2FjaGVDb250cm9sbGVyIiwibGVuZ3RoIiwidGhlbiIsInNlcnZlckNsb3NlQ29tcGxldGUiLCJhcHBseVJlcXVlc3RDb250ZXh0TWlkZGxld2FyZSIsImFwaSIsInJlcXVlc3RDb250ZXh0TWlkZGxld2FyZSIsInVzZSIsIm1heFVwbG9hZFNpemUiLCJkaXJlY3RBY2Nlc3MiLCJwYWdlcyIsInJhdGVMaW1pdCIsImFsbG93Q3Jvc3NEb21haW4iLCJGaWxlc1JvdXRlciIsImV4cHJlc3NSb3V0ZXIiLCJyZXEiLCJyZXMiLCJzdGF0dXMiLCJzZXQiLCJ1cmxlbmNvZGVkIiwiZXh0ZW5kZWQiLCJlbmFibGVSb3V0ZXIiLCJQYWdlc1JvdXRlciIsIlB1YmxpY0FQSVJvdXRlciIsImxpbWl0IiwiYWxsb3dNZXRob2RPdmVycmlkZSIsImhhbmRsZVBhcnNlSGVhZGVycyIsInJvdXRlcyIsIkFycmF5IiwiaXNBcnJheSIsInJvdXRlIiwiYWRkUmF0ZUxpbWl0IiwiaGFuZGxlUGFyc2VTZXNzaW9uIiwiYXBwUm91dGVyIiwicHJvbWlzZVJvdXRlciIsImhhbmRsZVBhcnNlRXJyb3JzIiwiVEVTVElORyIsIm9uIiwiZXJyIiwic3RkZXJyIiwid3JpdGUiLCJwb3J0IiwiZXhpdCIsIlBBUlNFX1NFUlZFUl9FTkFCTEVfRVhQRVJJTUVOVEFMX0RJUkVDVF9BQ0NFU1MiLCJDb3JlTWFuYWdlciIsInNldFJFU1RDb250cm9sbGVyIiwiUGFyc2VTZXJ2ZXJSRVNUQ29udHJvbGxlciIsInJvdXRlcnMiLCJDbGFzc2VzUm91dGVyIiwiVXNlcnNSb3V0ZXIiLCJTZXNzaW9uc1JvdXRlciIsIlJvbGVzUm91dGVyIiwiQW5hbHl0aWNzUm91dGVyIiwiSW5zdGFsbGF0aW9uc1JvdXRlciIsIkZ1bmN0aW9uc1JvdXRlciIsIlNjaGVtYXNSb3V0ZXIiLCJQdXNoUm91dGVyIiwiTG9nc1JvdXRlciIsIklBUFZhbGlkYXRpb25Sb3V0ZXIiLCJGZWF0dXJlc1JvdXRlciIsIkdsb2JhbENvbmZpZ1JvdXRlciIsIkdyYXBoUUxSb3V0ZXIiLCJQdXJnZVJvdXRlciIsIkhvb2tzUm91dGVyIiwiQ2xvdWRDb2RlUm91dGVyIiwiQXVkaWVuY2VzUm91dGVyIiwiQWdncmVnYXRlUm91dGVyIiwiU2VjdXJpdHlSb3V0ZXIiLCJyZWR1Y2UiLCJtZW1vIiwicm91dGVyIiwiY29uY2F0IiwiUHJvbWlzZVJvdXRlciIsIm1vdW50T250byIsInN0YXJ0QXBwIiwibWlkZGxld2FyZSIsIm1vdW50UGF0aCIsIm1vdW50R3JhcGhRTCIsIm1vdW50UGxheWdyb3VuZCIsImdyYXBoUUxDdXN0b21UeXBlRGVmcyIsInVuZGVmaW5lZCIsImdyYXBoUUxTY2hlbWEiLCJyZWFkRmlsZVN5bmMiLCJwYXJzZUdyYXBoUUxTZXJ2ZXIiLCJQYXJzZUdyYXBoUUxTZXJ2ZXIiLCJncmFwaFFMUGF0aCIsInBsYXlncm91bmRQYXRoIiwiYXBwbHlHcmFwaFFMIiwiYXBwbHlQbGF5Z3JvdW5kIiwic2VydmVyIiwibGlzdGVuIiwiaG9zdCIsInN0YXJ0TGl2ZVF1ZXJ5U2VydmVyIiwibGl2ZVF1ZXJ5U2VydmVyT3B0aW9ucyIsImxpdmVRdWVyeVNlcnZlciIsImNyZWF0ZUxpdmVRdWVyeVNlcnZlciIsInRydXN0UHJveHkiLCJjb25maWd1cmVMaXN0ZW5lcnMiLCJleHByZXNzQXBwIiwicGFyc2VTZXJ2ZXIiLCJodHRwU2VydmVyIiwiY3JlYXRlU2VydmVyIiwiUGFyc2VMaXZlUXVlcnlTZXJ2ZXIiLCJ2ZXJpZnlTZXJ2ZXJVcmwiLCJpc1ZhbGlkSHR0cFVybCIsInN0cmluZyIsInVybCIsIlVSTCIsIl8iLCJwcm90b2NvbCIsInJlcGxhY2UiLCJ3YXJuIiwicmVxdWVzdCIsInJlc3BvbnNlIiwiY2F0Y2giLCJkYXRhIiwicmV0cnkiLCJoZWFkZXJzIiwiUGFyc2VDbG91ZCIsImRlZmluZVByb3BlcnR5IiwiZ2V0IiwiYXBwbGljYXRpb25JZCIsIm5ld1ZhbCIsImNvbmZpZ3VyYWJsZSIsIkNsb3VkIiwiZ2xvYmFsIiwia2V5cyIsImRlZmF1bHRzIiwiZm9yRWFjaCIsImtleSIsInByb3RvdHlwZSIsImhhc093blByb3BlcnR5IiwiY2FsbCIsInJlZ2V4IiwibWF0Y2giLCJ1c2VyU2Vuc2l0aXZlRmllbGRzIiwiZnJvbSIsIlNldCIsInByb3RlY3RlZEZpZWxkcyIsIl9Vc2VyIiwiYyIsImN1ciIsInIiLCJ1bnEiLCJzb2NrZXRzIiwic29ja2V0Iiwic29ja2V0SWQiLCJyZW1vdGVBZGRyZXNzIiwicmVtb3RlUG9ydCIsImRlc3Ryb3lBbGl2ZUNvbm5lY3Rpb25zIiwiZGVzdHJveSIsInN0ZG91dCIsImNsb3NlIl0sInNvdXJjZXMiOlsiLi4vc3JjL1BhcnNlU2VydmVyLmpzIl0sInNvdXJjZXNDb250ZW50IjpbIi8vIFBhcnNlU2VydmVyIC0gb3Blbi1zb3VyY2UgY29tcGF0aWJsZSBBUEkgU2VydmVyIGZvciBQYXJzZSBhcHBzXG5cbnZhciBiYXRjaCA9IHJlcXVpcmUoJy4vYmF0Y2gnKSxcbiAgYm9keVBhcnNlciA9IHJlcXVpcmUoJ2JvZHktcGFyc2VyJyksXG4gIGV4cHJlc3MgPSByZXF1aXJlKCdleHByZXNzJyksXG4gIG1pZGRsZXdhcmVzID0gcmVxdWlyZSgnLi9taWRkbGV3YXJlcycpLFxuICBQYXJzZSA9IHJlcXVpcmUoJ3BhcnNlL25vZGUnKS5QYXJzZSxcbiAgeyBwYXJzZSB9ID0gcmVxdWlyZSgnZ3JhcGhxbCcpLFxuICBwYXRoID0gcmVxdWlyZSgncGF0aCcpLFxuICBmcyA9IHJlcXVpcmUoJ2ZzJyk7XG5cbmltcG9ydCB7IFBhcnNlU2VydmVyT3B0aW9ucywgTGl2ZVF1ZXJ5U2VydmVyT3B0aW9ucyB9IGZyb20gJy4vT3B0aW9ucyc7XG5pbXBvcnQgZGVmYXVsdHMgZnJvbSAnLi9kZWZhdWx0cyc7XG5pbXBvcnQgKiBhcyBsb2dnaW5nIGZyb20gJy4vbG9nZ2VyJztcbmltcG9ydCBDb25maWcgZnJvbSAnLi9Db25maWcnO1xuaW1wb3J0IFByb21pc2VSb3V0ZXIgZnJvbSAnLi9Qcm9taXNlUm91dGVyJztcbmltcG9ydCByZXF1aXJlZFBhcmFtZXRlciBmcm9tICcuL3JlcXVpcmVkUGFyYW1ldGVyJztcbmltcG9ydCB7IEFuYWx5dGljc1JvdXRlciB9IGZyb20gJy4vUm91dGVycy9BbmFseXRpY3NSb3V0ZXInO1xuaW1wb3J0IHsgQ2xhc3Nlc1JvdXRlciB9IGZyb20gJy4vUm91dGVycy9DbGFzc2VzUm91dGVyJztcbmltcG9ydCB7IEZlYXR1cmVzUm91dGVyIH0gZnJvbSAnLi9Sb3V0ZXJzL0ZlYXR1cmVzUm91dGVyJztcbmltcG9ydCB7IEZpbGVzUm91dGVyIH0gZnJvbSAnLi9Sb3V0ZXJzL0ZpbGVzUm91dGVyJztcbmltcG9ydCB7IEZ1bmN0aW9uc1JvdXRlciB9IGZyb20gJy4vUm91dGVycy9GdW5jdGlvbnNSb3V0ZXInO1xuaW1wb3J0IHsgR2xvYmFsQ29uZmlnUm91dGVyIH0gZnJvbSAnLi9Sb3V0ZXJzL0dsb2JhbENvbmZpZ1JvdXRlcic7XG5pbXBvcnQgeyBHcmFwaFFMUm91dGVyIH0gZnJvbSAnLi9Sb3V0ZXJzL0dyYXBoUUxSb3V0ZXInO1xuaW1wb3J0IHsgSG9va3NSb3V0ZXIgfSBmcm9tICcuL1JvdXRlcnMvSG9va3NSb3V0ZXInO1xuaW1wb3J0IHsgSUFQVmFsaWRhdGlvblJvdXRlciB9IGZyb20gJy4vUm91dGVycy9JQVBWYWxpZGF0aW9uUm91dGVyJztcbmltcG9ydCB7IEluc3RhbGxhdGlvbnNSb3V0ZXIgfSBmcm9tICcuL1JvdXRlcnMvSW5zdGFsbGF0aW9uc1JvdXRlcic7XG5pbXBvcnQgeyBMb2dzUm91dGVyIH0gZnJvbSAnLi9Sb3V0ZXJzL0xvZ3NSb3V0ZXInO1xuaW1wb3J0IHsgUGFyc2VMaXZlUXVlcnlTZXJ2ZXIgfSBmcm9tICcuL0xpdmVRdWVyeS9QYXJzZUxpdmVRdWVyeVNlcnZlcic7XG5pbXBvcnQgeyBQYWdlc1JvdXRlciB9IGZyb20gJy4vUm91dGVycy9QYWdlc1JvdXRlcic7XG5pbXBvcnQgeyBQdWJsaWNBUElSb3V0ZXIgfSBmcm9tICcuL1JvdXRlcnMvUHVibGljQVBJUm91dGVyJztcbmltcG9ydCB7IFB1c2hSb3V0ZXIgfSBmcm9tICcuL1JvdXRlcnMvUHVzaFJvdXRlcic7XG5pbXBvcnQgeyBDbG91ZENvZGVSb3V0ZXIgfSBmcm9tICcuL1JvdXRlcnMvQ2xvdWRDb2RlUm91dGVyJztcbmltcG9ydCB7IFJvbGVzUm91dGVyIH0gZnJvbSAnLi9Sb3V0ZXJzL1JvbGVzUm91dGVyJztcbmltcG9ydCB7IFNjaGVtYXNSb3V0ZXIgfSBmcm9tICcuL1JvdXRlcnMvU2NoZW1hc1JvdXRlcic7XG5pbXBvcnQgeyBTZXNzaW9uc1JvdXRlciB9IGZyb20gJy4vUm91dGVycy9TZXNzaW9uc1JvdXRlcic7XG5pbXBvcnQgeyBVc2Vyc1JvdXRlciB9IGZyb20gJy4vUm91dGVycy9Vc2Vyc1JvdXRlcic7XG5pbXBvcnQgeyBQdXJnZVJvdXRlciB9IGZyb20gJy4vUm91dGVycy9QdXJnZVJvdXRlcic7XG5pbXBvcnQgeyBBdWRpZW5jZXNSb3V0ZXIgfSBmcm9tICcuL1JvdXRlcnMvQXVkaWVuY2VzUm91dGVyJztcbmltcG9ydCB7IEFnZ3JlZ2F0ZVJvdXRlciB9IGZyb20gJy4vUm91dGVycy9BZ2dyZWdhdGVSb3V0ZXInO1xuaW1wb3J0IHsgUGFyc2VTZXJ2ZXJSRVNUQ29udHJvbGxlciB9IGZyb20gJy4vUGFyc2VTZXJ2ZXJSRVNUQ29udHJvbGxlcic7XG5pbXBvcnQgKiBhcyBjb250cm9sbGVycyBmcm9tICcuL0NvbnRyb2xsZXJzJztcbmltcG9ydCB7IFBhcnNlR3JhcGhRTFNlcnZlciB9IGZyb20gJy4vR3JhcGhRTC9QYXJzZUdyYXBoUUxTZXJ2ZXInO1xuaW1wb3J0IHsgU2VjdXJpdHlSb3V0ZXIgfSBmcm9tICcuL1JvdXRlcnMvU2VjdXJpdHlSb3V0ZXInO1xuaW1wb3J0IENoZWNrUnVubmVyIGZyb20gJy4vU2VjdXJpdHkvQ2hlY2tSdW5uZXInO1xuaW1wb3J0IERlcHJlY2F0b3IgZnJvbSAnLi9EZXByZWNhdG9yL0RlcHJlY2F0b3InO1xuaW1wb3J0IHsgRGVmaW5lZFNjaGVtYXMgfSBmcm9tICcuL1NjaGVtYU1pZ3JhdGlvbnMvRGVmaW5lZFNjaGVtYXMnO1xuXG4vLyBNdXRhdGUgdGhlIFBhcnNlIG9iamVjdCB0byBhZGQgdGhlIENsb3VkIENvZGUgaGFuZGxlcnNcbmFkZFBhcnNlQ2xvdWQoKTtcblxuLy8gUGFyc2VTZXJ2ZXIgd29ya3MgbGlrZSBhIGNvbnN0cnVjdG9yIG9mIGFuIGV4cHJlc3MgYXBwLlxuLy8gaHR0cHM6Ly9wYXJzZXBsYXRmb3JtLm9yZy9wYXJzZS1zZXJ2ZXIvYXBpL21hc3Rlci9QYXJzZVNlcnZlck9wdGlvbnMuaHRtbFxuY2xhc3MgUGFyc2VTZXJ2ZXIge1xuICAvKipcbiAgICogQGNvbnN0cnVjdG9yXG4gICAqIEBwYXJhbSB7UGFyc2VTZXJ2ZXJPcHRpb25zfSBvcHRpb25zIHRoZSBwYXJzZSBzZXJ2ZXIgaW5pdGlhbGl6YXRpb24gb3B0aW9uc1xuICAgKi9cbiAgY29uc3RydWN0b3Iob3B0aW9uczogUGFyc2VTZXJ2ZXJPcHRpb25zKSB7XG4gICAgLy8gU2NhbiBmb3IgZGVwcmVjYXRlZCBQYXJzZSBTZXJ2ZXIgb3B0aW9uc1xuICAgIERlcHJlY2F0b3Iuc2NhblBhcnNlU2VydmVyT3B0aW9ucyhvcHRpb25zKTtcbiAgICAvLyBTZXQgb3B0aW9uIGRlZmF1bHRzXG4gICAgaW5qZWN0RGVmYXVsdHMob3B0aW9ucyk7XG4gICAgY29uc3Qge1xuICAgICAgYXBwSWQgPSByZXF1aXJlZFBhcmFtZXRlcignWW91IG11c3QgcHJvdmlkZSBhbiBhcHBJZCEnKSxcbiAgICAgIG1hc3RlcktleSA9IHJlcXVpcmVkUGFyYW1ldGVyKCdZb3UgbXVzdCBwcm92aWRlIGEgbWFzdGVyS2V5IScpLFxuICAgICAgamF2YXNjcmlwdEtleSxcbiAgICAgIHNlcnZlclVSTCA9IHJlcXVpcmVkUGFyYW1ldGVyKCdZb3UgbXVzdCBwcm92aWRlIGEgc2VydmVyVVJMIScpLFxuICAgIH0gPSBvcHRpb25zO1xuICAgIC8vIEluaXRpYWxpemUgdGhlIG5vZGUgY2xpZW50IFNESyBhdXRvbWF0aWNhbGx5XG4gICAgUGFyc2UuaW5pdGlhbGl6ZShhcHBJZCwgamF2YXNjcmlwdEtleSB8fCAndW51c2VkJywgbWFzdGVyS2V5KTtcbiAgICBQYXJzZS5zZXJ2ZXJVUkwgPSBzZXJ2ZXJVUkw7XG5cbiAgICBDb25maWcudmFsaWRhdGVPcHRpb25zKG9wdGlvbnMpO1xuICAgIGNvbnN0IGFsbENvbnRyb2xsZXJzID0gY29udHJvbGxlcnMuZ2V0Q29udHJvbGxlcnMob3B0aW9ucyk7XG4gICAgb3B0aW9ucy5zdGF0ZSA9ICdpbml0aWFsaXplZCc7XG4gICAgdGhpcy5jb25maWcgPSBDb25maWcucHV0KE9iamVjdC5hc3NpZ24oe30sIG9wdGlvbnMsIGFsbENvbnRyb2xsZXJzKSk7XG4gICAgbG9nZ2luZy5zZXRMb2dnZXIoYWxsQ29udHJvbGxlcnMubG9nZ2VyQ29udHJvbGxlcik7XG4gIH1cblxuICAvKipcbiAgICogU3RhcnRzIFBhcnNlIFNlcnZlciBhcyBhbiBleHByZXNzIGFwcDsgdGhpcyBwcm9taXNlIHJlc29sdmVzIHdoZW4gUGFyc2UgU2VydmVyIGlzIHJlYWR5IHRvIGFjY2VwdCByZXF1ZXN0cy5cbiAgICovXG5cbiAgYXN5bmMgc3RhcnQoKSB7XG4gICAgdHJ5IHtcbiAgICAgIGlmICh0aGlzLmNvbmZpZy5zdGF0ZSA9PT0gJ29rJykge1xuICAgICAgICByZXR1cm4gdGhpcztcbiAgICAgIH1cbiAgICAgIHRoaXMuY29uZmlnLnN0YXRlID0gJ3N0YXJ0aW5nJztcbiAgICAgIENvbmZpZy5wdXQodGhpcy5jb25maWcpO1xuICAgICAgY29uc3Qge1xuICAgICAgICBkYXRhYmFzZUNvbnRyb2xsZXIsXG4gICAgICAgIGhvb2tzQ29udHJvbGxlcixcbiAgICAgICAgY2xvdWQsXG4gICAgICAgIHNlY3VyaXR5LFxuICAgICAgICBzY2hlbWEsXG4gICAgICAgIGNhY2hlQWRhcHRlcixcbiAgICAgICAgbGl2ZVF1ZXJ5Q29udHJvbGxlcixcbiAgICAgIH0gPSB0aGlzLmNvbmZpZztcbiAgICAgIHRyeSB7XG4gICAgICAgIGF3YWl0IGRhdGFiYXNlQ29udHJvbGxlci5wZXJmb3JtSW5pdGlhbGl6YXRpb24oKTtcbiAgICAgIH0gY2F0Y2ggKGUpIHtcbiAgICAgICAgaWYgKGUuY29kZSAhPT0gUGFyc2UuRXJyb3IuRFVQTElDQVRFX1ZBTFVFKSB7XG4gICAgICAgICAgdGhyb3cgZTtcbiAgICAgICAgfVxuICAgICAgfVxuICAgICAgYXdhaXQgaG9va3NDb250cm9sbGVyLmxvYWQoKTtcbiAgICAgIGNvbnN0IHN0YXJ0dXBQcm9taXNlcyA9IFtdO1xuICAgICAgaWYgKHNjaGVtYSkge1xuICAgICAgICBzdGFydHVwUHJvbWlzZXMucHVzaChuZXcgRGVmaW5lZFNjaGVtYXMoc2NoZW1hLCB0aGlzLmNvbmZpZykuZXhlY3V0ZSgpKTtcbiAgICAgIH1cbiAgICAgIGlmIChjYWNoZUFkYXB0ZXI/LmNvbm5lY3QgJiYgdHlwZW9mIGNhY2hlQWRhcHRlci5jb25uZWN0ID09PSAnZnVuY3Rpb24nKSB7XG4gICAgICAgIHN0YXJ0dXBQcm9taXNlcy5wdXNoKGNhY2hlQWRhcHRlci5jb25uZWN0KCkpO1xuICAgICAgfVxuICAgICAgc3RhcnR1cFByb21pc2VzLnB1c2gobGl2ZVF1ZXJ5Q29udHJvbGxlci5jb25uZWN0KCkpO1xuICAgICAgYXdhaXQgUHJvbWlzZS5hbGwoc3RhcnR1cFByb21pc2VzKTtcbiAgICAgIGlmIChjbG91ZCkge1xuICAgICAgICBhZGRQYXJzZUNsb3VkKCk7XG4gICAgICAgIGlmICh0eXBlb2YgY2xvdWQgPT09ICdmdW5jdGlvbicpIHtcbiAgICAgICAgICBhd2FpdCBQcm9taXNlLnJlc29sdmUoY2xvdWQoUGFyc2UpKTtcbiAgICAgICAgfSBlbHNlIGlmICh0eXBlb2YgY2xvdWQgPT09ICdzdHJpbmcnKSB7XG4gICAgICAgICAgbGV0IGpzb247XG4gICAgICAgICAgaWYgKHByb2Nlc3MuZW52Lm5wbV9wYWNrYWdlX2pzb24pIHtcbiAgICAgICAgICAgIGpzb24gPSByZXF1aXJlKHByb2Nlc3MuZW52Lm5wbV9wYWNrYWdlX2pzb24pO1xuICAgICAgICAgIH1cbiAgICAgICAgICBpZiAocHJvY2Vzcy5lbnYubnBtX3BhY2thZ2VfdHlwZSA9PT0gJ21vZHVsZScgfHwganNvbj8udHlwZSA9PT0gJ21vZHVsZScpIHtcbiAgICAgICAgICAgIGF3YWl0IGltcG9ydChwYXRoLnJlc29sdmUocHJvY2Vzcy5jd2QoKSwgY2xvdWQpKTtcbiAgICAgICAgICB9IGVsc2Uge1xuICAgICAgICAgICAgcmVxdWlyZShwYXRoLnJlc29sdmUocHJvY2Vzcy5jd2QoKSwgY2xvdWQpKTtcbiAgICAgICAgICB9XG4gICAgICAgIH0gZWxzZSB7XG4gICAgICAgICAgdGhyb3cgXCJhcmd1bWVudCAnY2xvdWQnIG11c3QgZWl0aGVyIGJlIGEgc3RyaW5nIG9yIGEgZnVuY3Rpb25cIjtcbiAgICAgICAgfVxuICAgICAgICBhd2FpdCBuZXcgUHJvbWlzZShyZXNvbHZlID0+IHNldFRpbWVvdXQocmVzb2x2ZSwgMTApKTtcbiAgICAgIH1cbiAgICAgIGlmIChzZWN1cml0eSAmJiBzZWN1cml0eS5lbmFibGVDaGVjayAmJiBzZWN1cml0eS5lbmFibGVDaGVja0xvZykge1xuICAgICAgICBuZXcgQ2hlY2tSdW5uZXIoc2VjdXJpdHkpLnJ1bigpO1xuICAgICAgfVxuICAgICAgdGhpcy5jb25maWcuc3RhdGUgPSAnb2snO1xuICAgICAgQ29uZmlnLnB1dCh0aGlzLmNvbmZpZyk7XG4gICAgICByZXR1cm4gdGhpcztcbiAgICB9IGNhdGNoIChlcnJvcikge1xuICAgICAgY29uc29sZS5lcnJvcihlcnJvcik7XG4gICAgICB0aGlzLmNvbmZpZy5zdGF0ZSA9ICdlcnJvcic7XG4gICAgICB0aHJvdyBlcnJvcjtcbiAgICB9XG4gIH1cblxuICBnZXQgYXBwKCkge1xuICAgIGlmICghdGhpcy5fYXBwKSB7XG4gICAgICB0aGlzLl9hcHAgPSBQYXJzZVNlcnZlci5hcHAodGhpcy5jb25maWcpO1xuICAgIH1cbiAgICByZXR1cm4gdGhpcy5fYXBwO1xuICB9XG5cbiAgaGFuZGxlU2h1dGRvd24oKSB7XG4gICAgY29uc3QgcHJvbWlzZXMgPSBbXTtcbiAgICBjb25zdCB7IGFkYXB0ZXI6IGRhdGFiYXNlQWRhcHRlciB9ID0gdGhpcy5jb25maWcuZGF0YWJhc2VDb250cm9sbGVyO1xuICAgIGlmIChkYXRhYmFzZUFkYXB0ZXIgJiYgdHlwZW9mIGRhdGFiYXNlQWRhcHRlci5oYW5kbGVTaHV0ZG93biA9PT0gJ2Z1bmN0aW9uJykge1xuICAgICAgcHJvbWlzZXMucHVzaChkYXRhYmFzZUFkYXB0ZXIuaGFuZGxlU2h1dGRvd24oKSk7XG4gICAgfVxuICAgIGNvbnN0IHsgYWRhcHRlcjogZmlsZUFkYXB0ZXIgfSA9IHRoaXMuY29uZmlnLmZpbGVzQ29udHJvbGxlcjtcbiAgICBpZiAoZmlsZUFkYXB0ZXIgJiYgdHlwZW9mIGZpbGVBZGFwdGVyLmhhbmRsZVNodXRkb3duID09PSAnZnVuY3Rpb24nKSB7XG4gICAgICBwcm9taXNlcy5wdXNoKGZpbGVBZGFwdGVyLmhhbmRsZVNodXRkb3duKCkpO1xuICAgIH1cbiAgICBjb25zdCB7IGFkYXB0ZXI6IGNhY2hlQWRhcHRlciB9ID0gdGhpcy5jb25maWcuY2FjaGVDb250cm9sbGVyO1xuICAgIGlmIChjYWNoZUFkYXB0ZXIgJiYgdHlwZW9mIGNhY2hlQWRhcHRlci5oYW5kbGVTaHV0ZG93biA9PT0gJ2Z1bmN0aW9uJykge1xuICAgICAgcHJvbWlzZXMucHVzaChjYWNoZUFkYXB0ZXIuaGFuZGxlU2h1dGRvd24oKSk7XG4gICAgfVxuICAgIHJldHVybiAocHJvbWlzZXMubGVuZ3RoID4gMCA/IFByb21pc2UuYWxsKHByb21pc2VzKSA6IFByb21pc2UucmVzb2x2ZSgpKS50aGVuKCgpID0+IHtcbiAgICAgIGlmICh0aGlzLmNvbmZpZy5zZXJ2ZXJDbG9zZUNvbXBsZXRlKSB7XG4gICAgICAgIHRoaXMuY29uZmlnLnNlcnZlckNsb3NlQ29tcGxldGUoKTtcbiAgICAgIH1cbiAgICB9KTtcbiAgfVxuXG4gIC8qKlxuICAgKiBAc3RhdGljXG4gICAqIEFsbG93IGRldmVsb3BlcnMgdG8gY3VzdG9taXplIGVhY2ggcmVxdWVzdCB3aXRoIGludmVyc2lvbiBvZiBjb250cm9sL2RlcGVuZGVuY3kgaW5qZWN0aW9uXG4gICAqL1xuICBzdGF0aWMgYXBwbHlSZXF1ZXN0Q29udGV4dE1pZGRsZXdhcmUoYXBpLCBvcHRpb25zKSB7XG4gICAgaWYgKG9wdGlvbnMucmVxdWVzdENvbnRleHRNaWRkbGV3YXJlKSB7XG4gICAgICBpZiAodHlwZW9mIG9wdGlvbnMucmVxdWVzdENvbnRleHRNaWRkbGV3YXJlICE9PSAnZnVuY3Rpb24nKSB7XG4gICAgICAgIHRocm93IG5ldyBFcnJvcigncmVxdWVzdENvbnRleHRNaWRkbGV3YXJlIG11c3QgYmUgYSBmdW5jdGlvbicpO1xuICAgICAgfVxuICAgICAgYXBpLnVzZShvcHRpb25zLnJlcXVlc3RDb250ZXh0TWlkZGxld2FyZSk7XG4gICAgfVxuICB9XG4gIC8qKlxuICAgKiBAc3RhdGljXG4gICAqIENyZWF0ZSBhbiBleHByZXNzIGFwcCBmb3IgdGhlIHBhcnNlIHNlcnZlclxuICAgKiBAcGFyYW0ge09iamVjdH0gb3B0aW9ucyBsZXQgeW91IHNwZWNpZnkgdGhlIG1heFVwbG9hZFNpemUgd2hlbiBjcmVhdGluZyB0aGUgZXhwcmVzcyBhcHAgICovXG4gIHN0YXRpYyBhcHAob3B0aW9ucykge1xuICAgIGNvbnN0IHsgbWF4VXBsb2FkU2l6ZSA9ICcyMG1iJywgYXBwSWQsIGRpcmVjdEFjY2VzcywgcGFnZXMsIHJhdGVMaW1pdCA9IFtdIH0gPSBvcHRpb25zO1xuICAgIC8vIFRoaXMgYXBwIHNlcnZlcyB0aGUgUGFyc2UgQVBJIGRpcmVjdGx5LlxuICAgIC8vIEl0J3MgdGhlIGVxdWl2YWxlbnQgb2YgaHR0cHM6Ly9hcGkucGFyc2UuY29tLzEgaW4gdGhlIGhvc3RlZCBQYXJzZSBBUEkuXG4gICAgdmFyIGFwaSA9IGV4cHJlc3MoKTtcbiAgICAvL2FwaS51c2UoXCIvYXBwc1wiLCBleHByZXNzLnN0YXRpYyhfX2Rpcm5hbWUgKyBcIi9wdWJsaWNcIikpO1xuICAgIGFwaS51c2UobWlkZGxld2FyZXMuYWxsb3dDcm9zc0RvbWFpbihhcHBJZCkpO1xuICAgIC8vIEZpbGUgaGFuZGxpbmcgbmVlZHMgdG8gYmUgYmVmb3JlIGRlZmF1bHQgbWlkZGxld2FyZXMgYXJlIGFwcGxpZWRcbiAgICBhcGkudXNlKFxuICAgICAgJy8nLFxuICAgICAgbmV3IEZpbGVzUm91dGVyKCkuZXhwcmVzc1JvdXRlcih7XG4gICAgICAgIG1heFVwbG9hZFNpemU6IG1heFVwbG9hZFNpemUsXG4gICAgICB9KVxuICAgICk7XG5cbiAgICBhcGkudXNlKCcvaGVhbHRoJywgZnVuY3Rpb24gKHJlcSwgcmVzKSB7XG4gICAgICByZXMuc3RhdHVzKG9wdGlvbnMuc3RhdGUgPT09ICdvaycgPyAyMDAgOiA1MDMpO1xuICAgICAgaWYgKG9wdGlvbnMuc3RhdGUgPT09ICdzdGFydGluZycpIHtcbiAgICAgICAgcmVzLnNldCgnUmV0cnktQWZ0ZXInLCAxKTtcbiAgICAgIH1cbiAgICAgIHJlcy5qc29uKHtcbiAgICAgICAgc3RhdHVzOiBvcHRpb25zLnN0YXRlLFxuICAgICAgfSk7XG4gICAgfSk7XG5cbiAgICBhcGkudXNlKFxuICAgICAgJy8nLFxuICAgICAgYm9keVBhcnNlci51cmxlbmNvZGVkKHsgZXh0ZW5kZWQ6IGZhbHNlIH0pLFxuICAgICAgcGFnZXMuZW5hYmxlUm91dGVyXG4gICAgICAgID8gbmV3IFBhZ2VzUm91dGVyKHBhZ2VzKS5leHByZXNzUm91dGVyKClcbiAgICAgICAgOiBuZXcgUHVibGljQVBJUm91dGVyKCkuZXhwcmVzc1JvdXRlcigpXG4gICAgKTtcblxuICAgIGFwaS51c2UoYm9keVBhcnNlci5qc29uKHsgdHlwZTogJyovKicsIGxpbWl0OiBtYXhVcGxvYWRTaXplIH0pKTtcbiAgICBhcGkudXNlKG1pZGRsZXdhcmVzLmFsbG93TWV0aG9kT3ZlcnJpZGUpO1xuICAgIGFwaS51c2UobWlkZGxld2FyZXMuaGFuZGxlUGFyc2VIZWFkZXJzKTtcbiAgICBjb25zdCByb3V0ZXMgPSBBcnJheS5pc0FycmF5KHJhdGVMaW1pdCkgPyByYXRlTGltaXQgOiBbcmF0ZUxpbWl0XTtcbiAgICBmb3IgKGNvbnN0IHJvdXRlIG9mIHJvdXRlcykge1xuICAgICAgbWlkZGxld2FyZXMuYWRkUmF0ZUxpbWl0KHJvdXRlLCBvcHRpb25zKTtcbiAgICB9XG4gICAgYXBpLnVzZShtaWRkbGV3YXJlcy5oYW5kbGVQYXJzZVNlc3Npb24pO1xuICAgIHRoaXMuYXBwbHlSZXF1ZXN0Q29udGV4dE1pZGRsZXdhcmUoYXBpLCBvcHRpb25zKTtcbiAgICBjb25zdCBhcHBSb3V0ZXIgPSBQYXJzZVNlcnZlci5wcm9taXNlUm91dGVyKHsgYXBwSWQgfSk7XG4gICAgYXBpLnVzZShhcHBSb3V0ZXIuZXhwcmVzc1JvdXRlcigpKTtcblxuICAgIGFwaS51c2UobWlkZGxld2FyZXMuaGFuZGxlUGFyc2VFcnJvcnMpO1xuXG4gICAgLy8gcnVuIHRoZSBmb2xsb3dpbmcgd2hlbiBub3QgdGVzdGluZ1xuICAgIGlmICghcHJvY2Vzcy5lbnYuVEVTVElORykge1xuICAgICAgLy9UaGlzIGNhdXNlcyB0ZXN0cyB0byBzcGV3IHNvbWUgdXNlbGVzcyB3YXJuaW5ncywgc28gZGlzYWJsZSBpbiB0ZXN0XG4gICAgICAvKiBpc3RhbmJ1bCBpZ25vcmUgbmV4dCAqL1xuICAgICAgcHJvY2Vzcy5vbigndW5jYXVnaHRFeGNlcHRpb24nLCBlcnIgPT4ge1xuICAgICAgICBpZiAoZXJyLmNvZGUgPT09ICdFQUREUklOVVNFJykge1xuICAgICAgICAgIC8vIHVzZXItZnJpZW5kbHkgbWVzc2FnZSBmb3IgdGhpcyBjb21tb24gZXJyb3JcbiAgICAgICAgICBwcm9jZXNzLnN0ZGVyci53cml0ZShgVW5hYmxlIHRvIGxpc3RlbiBvbiBwb3J0ICR7ZXJyLnBvcnR9LiBUaGUgcG9ydCBpcyBhbHJlYWR5IGluIHVzZS5gKTtcbiAgICAgICAgICBwcm9jZXNzLmV4aXQoMCk7XG4gICAgICAgIH0gZWxzZSB7XG4gICAgICAgICAgdGhyb3cgZXJyO1xuICAgICAgICB9XG4gICAgICB9KTtcbiAgICAgIC8vIHZlcmlmeSB0aGUgc2VydmVyIHVybCBhZnRlciBhICdtb3VudCcgZXZlbnQgaXMgcmVjZWl2ZWRcbiAgICAgIC8qIGlzdGFuYnVsIGlnbm9yZSBuZXh0ICovXG4gICAgICAvLyBhcGkub24oJ21vdW50JywgYXN5bmMgZnVuY3Rpb24gKCkge1xuICAgICAgLy8gICBhd2FpdCBuZXcgUHJvbWlzZShyZXNvbHZlID0+IHNldFRpbWVvdXQocmVzb2x2ZSwgMTAwMCkpO1xuICAgICAgLy8gICBQYXJzZVNlcnZlci52ZXJpZnlTZXJ2ZXJVcmwoKTtcbiAgICAgIC8vIH0pO1xuICAgIH1cbiAgICBpZiAocHJvY2Vzcy5lbnYuUEFSU0VfU0VSVkVSX0VOQUJMRV9FWFBFUklNRU5UQUxfRElSRUNUX0FDQ0VTUyA9PT0gJzEnIHx8IGRpcmVjdEFjY2Vzcykge1xuICAgICAgUGFyc2UuQ29yZU1hbmFnZXIuc2V0UkVTVENvbnRyb2xsZXIoUGFyc2VTZXJ2ZXJSRVNUQ29udHJvbGxlcihhcHBJZCwgYXBwUm91dGVyKSk7XG4gICAgfVxuICAgIHJldHVybiBhcGk7XG4gIH1cblxuICBzdGF0aWMgcHJvbWlzZVJvdXRlcih7IGFwcElkIH0pIHtcbiAgICBjb25zdCByb3V0ZXJzID0gW1xuICAgICAgbmV3IENsYXNzZXNSb3V0ZXIoKSxcbiAgICAgIG5ldyBVc2Vyc1JvdXRlcigpLFxuICAgICAgbmV3IFNlc3Npb25zUm91dGVyKCksXG4gICAgICBuZXcgUm9sZXNSb3V0ZXIoKSxcbiAgICAgIG5ldyBBbmFseXRpY3NSb3V0ZXIoKSxcbiAgICAgIG5ldyBJbnN0YWxsYXRpb25zUm91dGVyKCksXG4gICAgICBuZXcgRnVuY3Rpb25zUm91dGVyKCksXG4gICAgICBuZXcgU2NoZW1hc1JvdXRlcigpLFxuICAgICAgbmV3IFB1c2hSb3V0ZXIoKSxcbiAgICAgIG5ldyBMb2dzUm91dGVyKCksXG4gICAgICBuZXcgSUFQVmFsaWRhdGlvblJvdXRlcigpLFxuICAgICAgbmV3IEZlYXR1cmVzUm91dGVyKCksXG4gICAgICBuZXcgR2xvYmFsQ29uZmlnUm91dGVyKCksXG4gICAgICBuZXcgR3JhcGhRTFJvdXRlcigpLFxuICAgICAgbmV3IFB1cmdlUm91dGVyKCksXG4gICAgICBuZXcgSG9va3NSb3V0ZXIoKSxcbiAgICAgIG5ldyBDbG91ZENvZGVSb3V0ZXIoKSxcbiAgICAgIG5ldyBBdWRpZW5jZXNSb3V0ZXIoKSxcbiAgICAgIG5ldyBBZ2dyZWdhdGVSb3V0ZXIoKSxcbiAgICAgIG5ldyBTZWN1cml0eVJvdXRlcigpLFxuICAgIF07XG5cbiAgICBjb25zdCByb3V0ZXMgPSByb3V0ZXJzLnJlZHVjZSgobWVtbywgcm91dGVyKSA9PiB7XG4gICAgICByZXR1cm4gbWVtby5jb25jYXQocm91dGVyLnJvdXRlcyk7XG4gICAgfSwgW10pO1xuXG4gICAgY29uc3QgYXBwUm91dGVyID0gbmV3IFByb21pc2VSb3V0ZXIocm91dGVzLCBhcHBJZCk7XG5cbiAgICBiYXRjaC5tb3VudE9udG8oYXBwUm91dGVyKTtcbiAgICByZXR1cm4gYXBwUm91dGVyO1xuICB9XG5cbiAgLyoqXG4gICAqIHN0YXJ0cyB0aGUgcGFyc2Ugc2VydmVyJ3MgZXhwcmVzcyBhcHBcbiAgICogQHBhcmFtIHtQYXJzZVNlcnZlck9wdGlvbnN9IG9wdGlvbnMgdG8gdXNlIHRvIHN0YXJ0IHRoZSBzZXJ2ZXJcbiAgICogQHJldHVybnMge1BhcnNlU2VydmVyfSB0aGUgcGFyc2Ugc2VydmVyIGluc3RhbmNlXG4gICAqL1xuXG4gIGFzeW5jIHN0YXJ0QXBwKG9wdGlvbnM6IFBhcnNlU2VydmVyT3B0aW9ucykge1xuICAgIHRyeSB7XG4gICAgICBhd2FpdCB0aGlzLnN0YXJ0KCk7XG4gICAgfSBjYXRjaCAoZSkge1xuICAgICAgY29uc29sZS5lcnJvcignRXJyb3Igb24gUGFyc2VTZXJ2ZXIuc3RhcnRBcHA6ICcsIGUpO1xuICAgICAgdGhyb3cgZTtcbiAgICB9XG4gICAgY29uc3QgYXBwID0gZXhwcmVzcygpO1xuICAgIGlmIChvcHRpb25zLm1pZGRsZXdhcmUpIHtcbiAgICAgIGxldCBtaWRkbGV3YXJlO1xuICAgICAgaWYgKHR5cGVvZiBvcHRpb25zLm1pZGRsZXdhcmUgPT0gJ3N0cmluZycpIHtcbiAgICAgICAgbWlkZGxld2FyZSA9IHJlcXVpcmUocGF0aC5yZXNvbHZlKHByb2Nlc3MuY3dkKCksIG9wdGlvbnMubWlkZGxld2FyZSkpO1xuICAgICAgfSBlbHNlIHtcbiAgICAgICAgbWlkZGxld2FyZSA9IG9wdGlvbnMubWlkZGxld2FyZTsgLy8gdXNlIGFzLWlzIGxldCBleHByZXNzIGZhaWxcbiAgICAgIH1cbiAgICAgIGFwcC51c2UobWlkZGxld2FyZSk7XG4gICAgfVxuICAgIGFwcC51c2Uob3B0aW9ucy5tb3VudFBhdGgsIHRoaXMuYXBwKTtcblxuICAgIGlmIChvcHRpb25zLm1vdW50R3JhcGhRTCA9PT0gdHJ1ZSB8fCBvcHRpb25zLm1vdW50UGxheWdyb3VuZCA9PT0gdHJ1ZSkge1xuICAgICAgbGV0IGdyYXBoUUxDdXN0b21UeXBlRGVmcyA9IHVuZGVmaW5lZDtcbiAgICAgIGlmICh0eXBlb2Ygb3B0aW9ucy5ncmFwaFFMU2NoZW1hID09PSAnc3RyaW5nJykge1xuICAgICAgICBncmFwaFFMQ3VzdG9tVHlwZURlZnMgPSBwYXJzZShmcy5yZWFkRmlsZVN5bmMob3B0aW9ucy5ncmFwaFFMU2NoZW1hLCAndXRmOCcpKTtcbiAgICAgIH0gZWxzZSBpZiAoXG4gICAgICAgIHR5cGVvZiBvcHRpb25zLmdyYXBoUUxTY2hlbWEgPT09ICdvYmplY3QnIHx8XG4gICAgICAgIHR5cGVvZiBvcHRpb25zLmdyYXBoUUxTY2hlbWEgPT09ICdmdW5jdGlvbidcbiAgICAgICkge1xuICAgICAgICBncmFwaFFMQ3VzdG9tVHlwZURlZnMgPSBvcHRpb25zLmdyYXBoUUxTY2hlbWE7XG4gICAgICB9XG5cbiAgICAgIGNvbnN0IHBhcnNlR3JhcGhRTFNlcnZlciA9IG5ldyBQYXJzZUdyYXBoUUxTZXJ2ZXIodGhpcywge1xuICAgICAgICBncmFwaFFMUGF0aDogb3B0aW9ucy5ncmFwaFFMUGF0aCxcbiAgICAgICAgcGxheWdyb3VuZFBhdGg6IG9wdGlvbnMucGxheWdyb3VuZFBhdGgsXG4gICAgICAgIGdyYXBoUUxDdXN0b21UeXBlRGVmcyxcbiAgICAgIH0pO1xuXG4gICAgICBpZiAob3B0aW9ucy5tb3VudEdyYXBoUUwpIHtcbiAgICAgICAgcGFyc2VHcmFwaFFMU2VydmVyLmFwcGx5R3JhcGhRTChhcHApO1xuICAgICAgfVxuXG4gICAgICBpZiAob3B0aW9ucy5tb3VudFBsYXlncm91bmQpIHtcbiAgICAgICAgcGFyc2VHcmFwaFFMU2VydmVyLmFwcGx5UGxheWdyb3VuZChhcHApO1xuICAgICAgfVxuICAgIH1cbiAgICBjb25zdCBzZXJ2ZXIgPSBhd2FpdCBuZXcgUHJvbWlzZShyZXNvbHZlID0+IHtcbiAgICAgIGFwcC5saXN0ZW4ob3B0aW9ucy5wb3J0LCBvcHRpb25zLmhvc3QsIGZ1bmN0aW9uICgpIHtcbiAgICAgICAgcmVzb2x2ZSh0aGlzKTtcbiAgICAgIH0pO1xuICAgIH0pO1xuICAgIHRoaXMuc2VydmVyID0gc2VydmVyO1xuXG4gICAgaWYgKG9wdGlvbnMuc3RhcnRMaXZlUXVlcnlTZXJ2ZXIgfHwgb3B0aW9ucy5saXZlUXVlcnlTZXJ2ZXJPcHRpb25zKSB7XG4gICAgICB0aGlzLmxpdmVRdWVyeVNlcnZlciA9IGF3YWl0IFBhcnNlU2VydmVyLmNyZWF0ZUxpdmVRdWVyeVNlcnZlcihcbiAgICAgICAgc2VydmVyLFxuICAgICAgICBvcHRpb25zLmxpdmVRdWVyeVNlcnZlck9wdGlvbnMsXG4gICAgICAgIG9wdGlvbnNcbiAgICAgICk7XG4gICAgfVxuICAgIGlmIChvcHRpb25zLnRydXN0UHJveHkpIHtcbiAgICAgIGFwcC5zZXQoJ3RydXN0IHByb3h5Jywgb3B0aW9ucy50cnVzdFByb3h5KTtcbiAgICB9XG4gICAgLyogaXN0YW5idWwgaWdub3JlIG5leHQgKi9cbiAgICBpZiAoIXByb2Nlc3MuZW52LlRFU1RJTkcpIHtcbiAgICAgIGNvbmZpZ3VyZUxpc3RlbmVycyh0aGlzKTtcbiAgICB9XG4gICAgdGhpcy5leHByZXNzQXBwID0gYXBwO1xuICAgIHJldHVybiB0aGlzO1xuICB9XG5cbiAgLyoqXG4gICAqIENyZWF0ZXMgYSBuZXcgUGFyc2VTZXJ2ZXIgYW5kIHN0YXJ0cyBpdC5cbiAgICogQHBhcmFtIHtQYXJzZVNlcnZlck9wdGlvbnN9IG9wdGlvbnMgdXNlZCB0byBzdGFydCB0aGUgc2VydmVyXG4gICAqIEByZXR1cm5zIHtQYXJzZVNlcnZlcn0gdGhlIHBhcnNlIHNlcnZlciBpbnN0YW5jZVxuICAgKi9cbiAgc3RhdGljIGFzeW5jIHN0YXJ0QXBwKG9wdGlvbnM6IFBhcnNlU2VydmVyT3B0aW9ucykge1xuICAgIGNvbnN0IHBhcnNlU2VydmVyID0gbmV3IFBhcnNlU2VydmVyKG9wdGlvbnMpO1xuICAgIHJldHVybiBwYXJzZVNlcnZlci5zdGFydEFwcChvcHRpb25zKTtcbiAgfVxuXG4gIC8qKlxuICAgKiBIZWxwZXIgbWV0aG9kIHRvIGNyZWF0ZSBhIGxpdmVRdWVyeSBzZXJ2ZXJcbiAgICogQHN0YXRpY1xuICAgKiBAcGFyYW0ge1NlcnZlcn0gaHR0cFNlcnZlciBhbiBvcHRpb25hbCBodHRwIHNlcnZlciB0byBwYXNzXG4gICAqIEBwYXJhbSB7TGl2ZVF1ZXJ5U2VydmVyT3B0aW9uc30gY29uZmlnIG9wdGlvbnMgZm9yIHRoZSBsaXZlUXVlcnlTZXJ2ZXJcbiAgICogQHBhcmFtIHtQYXJzZVNlcnZlck9wdGlvbnN9IG9wdGlvbnMgb3B0aW9ucyBmb3IgdGhlIFBhcnNlU2VydmVyXG4gICAqIEByZXR1cm5zIHtQcm9taXNlPFBhcnNlTGl2ZVF1ZXJ5U2VydmVyPn0gdGhlIGxpdmUgcXVlcnkgc2VydmVyIGluc3RhbmNlXG4gICAqL1xuICBzdGF0aWMgYXN5bmMgY3JlYXRlTGl2ZVF1ZXJ5U2VydmVyKFxuICAgIGh0dHBTZXJ2ZXIsXG4gICAgY29uZmlnOiBMaXZlUXVlcnlTZXJ2ZXJPcHRpb25zLFxuICAgIG9wdGlvbnM6IFBhcnNlU2VydmVyT3B0aW9uc1xuICApIHtcbiAgICBpZiAoIWh0dHBTZXJ2ZXIgfHwgKGNvbmZpZyAmJiBjb25maWcucG9ydCkpIHtcbiAgICAgIHZhciBhcHAgPSBleHByZXNzKCk7XG4gICAgICBodHRwU2VydmVyID0gcmVxdWlyZSgnaHR0cCcpLmNyZWF0ZVNlcnZlcihhcHApO1xuICAgICAgaHR0cFNlcnZlci5saXN0ZW4oY29uZmlnLnBvcnQpO1xuICAgIH1cbiAgICBjb25zdCBzZXJ2ZXIgPSBuZXcgUGFyc2VMaXZlUXVlcnlTZXJ2ZXIoaHR0cFNlcnZlciwgY29uZmlnLCBvcHRpb25zKTtcbiAgICBhd2FpdCBzZXJ2ZXIuY29ubmVjdCgpO1xuICAgIHJldHVybiBzZXJ2ZXI7XG4gIH1cblxuICBzdGF0aWMgYXN5bmMgdmVyaWZ5U2VydmVyVXJsKCkge1xuICAgIC8vIHBlcmZvcm0gYSBoZWFsdGggY2hlY2sgb24gdGhlIHNlcnZlclVSTCB2YWx1ZVxuICAgIGlmIChQYXJzZS5zZXJ2ZXJVUkwpIHtcbiAgICAgIGNvbnN0IGlzVmFsaWRIdHRwVXJsID0gc3RyaW5nID0+IHtcbiAgICAgICAgbGV0IHVybDtcbiAgICAgICAgdHJ5IHtcbiAgICAgICAgICB1cmwgPSBuZXcgVVJMKHN0cmluZyk7XG4gICAgICAgIH0gY2F0Y2ggKF8pIHtcbiAgICAgICAgICByZXR1cm4gZmFsc2U7XG4gICAgICAgIH1cbiAgICAgICAgcmV0dXJuIHVybC5wcm90b2NvbCA9PT0gJ2h0dHA6JyB8fCB1cmwucHJvdG9jb2wgPT09ICdodHRwczonO1xuICAgICAgfTtcbiAgICAgIGNvbnN0IHVybCA9IGAke1BhcnNlLnNlcnZlclVSTC5yZXBsYWNlKC9cXC8kLywgJycpfS9oZWFsdGhgO1xuICAgICAgaWYgKCFpc1ZhbGlkSHR0cFVybCh1cmwpKSB7XG4gICAgICAgIGNvbnNvbGUud2FybihcbiAgICAgICAgICBgXFxuV0FSTklORywgVW5hYmxlIHRvIGNvbm5lY3QgdG8gJyR7UGFyc2Uuc2VydmVyVVJMfScgYXMgdGhlIFVSTCBpcyBpbnZhbGlkLmAgK1xuICAgICAgICAgIGAgQ2xvdWQgY29kZSBhbmQgcHVzaCBub3RpZmljYXRpb25zIG1heSBiZSB1bmF2YWlsYWJsZSFcXG5gXG4gICAgICAgICk7XG4gICAgICAgIHJldHVybjtcbiAgICAgIH1cbiAgICAgIGNvbnN0IHJlcXVlc3QgPSByZXF1aXJlKCcuL3JlcXVlc3QnKTtcbiAgICAgIGNvbnN0IHJlc3BvbnNlID0gYXdhaXQgcmVxdWVzdCh7IHVybCB9KS5jYXRjaChyZXNwb25zZSA9PiByZXNwb25zZSk7XG4gICAgICBjb25zdCBqc29uID0gcmVzcG9uc2UuZGF0YSB8fCBudWxsO1xuICAgICAgY29uc3QgcmV0cnkgPSByZXNwb25zZS5oZWFkZXJzPy5bJ3JldHJ5LWFmdGVyJ107XG4gICAgICBpZiAocmV0cnkpIHtcbiAgICAgICAgYXdhaXQgbmV3IFByb21pc2UocmVzb2x2ZSA9PiBzZXRUaW1lb3V0KHJlc29sdmUsIHJldHJ5ICogMTAwMCkpO1xuICAgICAgICByZXR1cm4gdGhpcy52ZXJpZnlTZXJ2ZXJVcmwoKTtcbiAgICAgIH1cbiAgICAgIGlmIChyZXNwb25zZS5zdGF0dXMgIT09IDIwMCB8fCBqc29uPy5zdGF0dXMgIT09ICdvaycpIHtcbiAgICAgICAgLyogZXNsaW50LWRpc2FibGUgbm8tY29uc29sZSAqL1xuICAgICAgICBjb25zb2xlLndhcm4oXG4gICAgICAgICAgYFxcbldBUk5JTkcsIFVuYWJsZSB0byBjb25uZWN0IHRvICcke1BhcnNlLnNlcnZlclVSTH0nLmAgK1xuICAgICAgICAgIGAgQ2xvdWQgY29kZSBhbmQgcHVzaCBub3RpZmljYXRpb25zIG1heSBiZSB1bmF2YWlsYWJsZSFcXG5gXG4gICAgICAgICk7XG4gICAgICAgIC8qIGVzbGludC1lbmFibGUgbm8tY29uc29sZSAqL1xuICAgICAgICByZXR1cm47XG4gICAgICB9XG4gICAgICByZXR1cm4gdHJ1ZTtcbiAgICB9XG4gIH1cbn1cblxuZnVuY3Rpb24gYWRkUGFyc2VDbG91ZCgpIHtcbiAgY29uc3QgUGFyc2VDbG91ZCA9IHJlcXVpcmUoJy4vY2xvdWQtY29kZS9QYXJzZS5DbG91ZCcpO1xuICBPYmplY3QuZGVmaW5lUHJvcGVydHkoUGFyc2UsICdTZXJ2ZXInLCB7XG4gICAgZ2V0KCkge1xuICAgICAgcmV0dXJuIENvbmZpZy5nZXQoUGFyc2UuYXBwbGljYXRpb25JZCk7XG4gICAgfSxcbiAgICBzZXQobmV3VmFsKSB7XG4gICAgICBuZXdWYWwuYXBwSWQgPSBQYXJzZS5hcHBsaWNhdGlvbklkO1xuICAgICAgQ29uZmlnLnB1dChuZXdWYWwpO1xuICAgIH0sXG4gICAgY29uZmlndXJhYmxlOiB0cnVlLFxuICB9KTtcbiAgT2JqZWN0LmFzc2lnbihQYXJzZS5DbG91ZCwgUGFyc2VDbG91ZCk7XG4gIGdsb2JhbC5QYXJzZSA9IFBhcnNlO1xufVxuXG5mdW5jdGlvbiBpbmplY3REZWZhdWx0cyhvcHRpb25zOiBQYXJzZVNlcnZlck9wdGlvbnMpIHtcbiAgT2JqZWN0LmtleXMoZGVmYXVsdHMpLmZvckVhY2goa2V5ID0+IHtcbiAgICBpZiAoIU9iamVjdC5wcm90b3R5cGUuaGFzT3duUHJvcGVydHkuY2FsbChvcHRpb25zLCBrZXkpKSB7XG4gICAgICBvcHRpb25zW2tleV0gPSBkZWZhdWx0c1trZXldO1xuICAgIH1cbiAgfSk7XG5cbiAgaWYgKCFPYmplY3QucHJvdG90eXBlLmhhc093blByb3BlcnR5LmNhbGwob3B0aW9ucywgJ3NlcnZlclVSTCcpKSB7XG4gICAgb3B0aW9ucy5zZXJ2ZXJVUkwgPSBgaHR0cDovL2xvY2FsaG9zdDoke29wdGlvbnMucG9ydH0ke29wdGlvbnMubW91bnRQYXRofWA7XG4gIH1cblxuICAvLyBSZXNlcnZlZCBDaGFyYWN0ZXJzXG4gIGlmIChvcHRpb25zLmFwcElkKSB7XG4gICAgY29uc3QgcmVnZXggPSAvWyEjJCUnKCkqKyYvOjs9P0BbXFxde31eLHw8Pl0vZztcbiAgICBpZiAob3B0aW9ucy5hcHBJZC5tYXRjaChyZWdleCkpIHtcbiAgICAgIGNvbnNvbGUud2FybihcbiAgICAgICAgYFxcbldBUk5JTkcsIGFwcElkIHRoYXQgY29udGFpbnMgc3BlY2lhbCBjaGFyYWN0ZXJzIGNhbiBjYXVzZSBpc3N1ZXMgd2hpbGUgdXNpbmcgd2l0aCB1cmxzLlxcbmBcbiAgICAgICk7XG4gICAgfVxuICB9XG5cbiAgLy8gQmFja3dhcmRzIGNvbXBhdGliaWxpdHlcbiAgaWYgKG9wdGlvbnMudXNlclNlbnNpdGl2ZUZpZWxkcykge1xuICAgIC8qIGVzbGludC1kaXNhYmxlIG5vLWNvbnNvbGUgKi9cbiAgICAhcHJvY2Vzcy5lbnYuVEVTVElORyAmJlxuICAgICAgY29uc29sZS53YXJuKFxuICAgICAgICBgXFxuREVQUkVDQVRFRDogdXNlclNlbnNpdGl2ZUZpZWxkcyBoYXMgYmVlbiByZXBsYWNlZCBieSBwcm90ZWN0ZWRGaWVsZHMgYWxsb3dpbmcgdGhlIGFiaWxpdHkgdG8gcHJvdGVjdCBmaWVsZHMgaW4gYWxsIGNsYXNzZXMgd2l0aCBDTFAuIFxcbmBcbiAgICAgICk7XG4gICAgLyogZXNsaW50LWVuYWJsZSBuby1jb25zb2xlICovXG5cbiAgICBjb25zdCB1c2VyU2Vuc2l0aXZlRmllbGRzID0gQXJyYXkuZnJvbShcbiAgICAgIG5ldyBTZXQoWy4uLihkZWZhdWx0cy51c2VyU2Vuc2l0aXZlRmllbGRzIHx8IFtdKSwgLi4uKG9wdGlvbnMudXNlclNlbnNpdGl2ZUZpZWxkcyB8fCBbXSldKVxuICAgICk7XG5cbiAgICAvLyBJZiB0aGUgb3B0aW9ucy5wcm90ZWN0ZWRGaWVsZHMgaXMgdW5zZXQsXG4gICAgLy8gaXQnbGwgYmUgYXNzaWduZWQgdGhlIGRlZmF1bHQgYWJvdmUuXG4gICAgLy8gSGVyZSwgcHJvdGVjdCBhZ2FpbnN0IHRoZSBjYXNlIHdoZXJlIHByb3RlY3RlZEZpZWxkc1xuICAgIC8vIGlzIHNldCwgYnV0IGRvZXNuJ3QgaGF2ZSBfVXNlci5cbiAgICBpZiAoISgnX1VzZXInIGluIG9wdGlvbnMucHJvdGVjdGVkRmllbGRzKSkge1xuICAgICAgb3B0aW9ucy5wcm90ZWN0ZWRGaWVsZHMgPSBPYmplY3QuYXNzaWduKHsgX1VzZXI6IFtdIH0sIG9wdGlvbnMucHJvdGVjdGVkRmllbGRzKTtcbiAgICB9XG5cbiAgICBvcHRpb25zLnByb3RlY3RlZEZpZWxkc1snX1VzZXInXVsnKiddID0gQXJyYXkuZnJvbShcbiAgICAgIG5ldyBTZXQoWy4uLihvcHRpb25zLnByb3RlY3RlZEZpZWxkc1snX1VzZXInXVsnKiddIHx8IFtdKSwgLi4udXNlclNlbnNpdGl2ZUZpZWxkc10pXG4gICAgKTtcbiAgfVxuXG4gIC8vIE1lcmdlIHByb3RlY3RlZEZpZWxkcyBvcHRpb25zIHdpdGggZGVmYXVsdHMuXG4gIE9iamVjdC5rZXlzKGRlZmF1bHRzLnByb3RlY3RlZEZpZWxkcykuZm9yRWFjaChjID0+IHtcbiAgICBjb25zdCBjdXIgPSBvcHRpb25zLnByb3RlY3RlZEZpZWxkc1tjXTtcbiAgICBpZiAoIWN1cikge1xuICAgICAgb3B0aW9ucy5wcm90ZWN0ZWRGaWVsZHNbY10gPSBkZWZhdWx0cy5wcm90ZWN0ZWRGaWVsZHNbY107XG4gICAgfSBlbHNlIHtcbiAgICAgIE9iamVjdC5rZXlzKGRlZmF1bHRzLnByb3RlY3RlZEZpZWxkc1tjXSkuZm9yRWFjaChyID0+IHtcbiAgICAgICAgY29uc3QgdW5xID0gbmV3IFNldChbXG4gICAgICAgICAgLi4uKG9wdGlvbnMucHJvdGVjdGVkRmllbGRzW2NdW3JdIHx8IFtdKSxcbiAgICAgICAgICAuLi5kZWZhdWx0cy5wcm90ZWN0ZWRGaWVsZHNbY11bcl0sXG4gICAgICAgIF0pO1xuICAgICAgICBvcHRpb25zLnByb3RlY3RlZEZpZWxkc1tjXVtyXSA9IEFycmF5LmZyb20odW5xKTtcbiAgICAgIH0pO1xuICAgIH1cbiAgfSk7XG59XG5cbi8vIFRob3NlIGNhbid0IGJlIHRlc3RlZCBhcyBpdCByZXF1aXJlcyBhIHN1YnByb2Nlc3Ncbi8qIGlzdGFuYnVsIGlnbm9yZSBuZXh0ICovXG5mdW5jdGlvbiBjb25maWd1cmVMaXN0ZW5lcnMocGFyc2VTZXJ2ZXIpIHtcbiAgY29uc3Qgc2VydmVyID0gcGFyc2VTZXJ2ZXIuc2VydmVyO1xuICBjb25zdCBzb2NrZXRzID0ge307XG4gIC8qIEN1cnJlbnRseSwgZXhwcmVzcyBkb2Vzbid0IHNodXQgZG93biBpbW1lZGlhdGVseSBhZnRlciByZWNlaXZpbmcgU0lHSU5UL1NJR1RFUk0gaWYgaXQgaGFzIGNsaWVudCBjb25uZWN0aW9ucyB0aGF0IGhhdmVuJ3QgdGltZWQgb3V0LiAoVGhpcyBpcyBhIGtub3duIGlzc3VlIHdpdGggbm9kZSAtIGh0dHBzOi8vZ2l0aHViLmNvbS9ub2RlanMvbm9kZS9pc3N1ZXMvMjY0MilcbiAgICBUaGlzIGZ1bmN0aW9uLCBhbG9uZyB3aXRoIGBkZXN0cm95QWxpdmVDb25uZWN0aW9ucygpYCwgaW50ZW5kIHRvIGZpeCB0aGlzIGJlaGF2aW9yIHN1Y2ggdGhhdCBwYXJzZSBzZXJ2ZXIgd2lsbCBjbG9zZSBhbGwgb3BlbiBjb25uZWN0aW9ucyBhbmQgaW5pdGlhdGUgdGhlIHNodXRkb3duIHByb2Nlc3MgYXMgc29vbiBhcyBpdCByZWNlaXZlcyBhIFNJR0lOVC9TSUdURVJNIHNpZ25hbC4gKi9cbiAgc2VydmVyLm9uKCdjb25uZWN0aW9uJywgc29ja2V0ID0+IHtcbiAgICBjb25zdCBzb2NrZXRJZCA9IHNvY2tldC5yZW1vdGVBZGRyZXNzICsgJzonICsgc29ja2V0LnJlbW90ZVBvcnQ7XG4gICAgc29ja2V0c1tzb2NrZXRJZF0gPSBzb2NrZXQ7XG4gICAgc29ja2V0Lm9uKCdjbG9zZScsICgpID0+IHtcbiAgICAgIGRlbGV0ZSBzb2NrZXRzW3NvY2tldElkXTtcbiAgICB9KTtcbiAgfSk7XG5cbiAgY29uc3QgZGVzdHJveUFsaXZlQ29ubmVjdGlvbnMgPSBmdW5jdGlvbiAoKSB7XG4gICAgZm9yIChjb25zdCBzb2NrZXRJZCBpbiBzb2NrZXRzKSB7XG4gICAgICB0cnkge1xuICAgICAgICBzb2NrZXRzW3NvY2tldElkXS5kZXN0cm95KCk7XG4gICAgICB9IGNhdGNoIChlKSB7XG4gICAgICAgIC8qICovXG4gICAgICB9XG4gICAgfVxuICB9O1xuXG4gIGNvbnN0IGhhbmRsZVNodXRkb3duID0gZnVuY3Rpb24gKCkge1xuICAgIHByb2Nlc3Muc3Rkb3V0LndyaXRlKCdUZXJtaW5hdGlvbiBzaWduYWwgcmVjZWl2ZWQuIFNodXR0aW5nIGRvd24uJyk7XG4gICAgZGVzdHJveUFsaXZlQ29ubmVjdGlvbnMoKTtcbiAgICBzZXJ2ZXIuY2xvc2UoKTtcbiAgICBwYXJzZVNlcnZlci5oYW5kbGVTaHV0ZG93bigpO1xuICB9O1xuICBwcm9jZXNzLm9uKCdTSUdURVJNJywgaGFuZGxlU2h1dGRvd24pO1xuICBwcm9jZXNzLm9uKCdTSUdJTlQnLCBoYW5kbGVTaHV0ZG93bik7XG59XG5cbmV4cG9ydCBkZWZhdWx0IFBhcnNlU2VydmVyO1xuIl0sIm1hcHBpbmdzIjoiOzs7Ozs7QUFXQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFBbUU7QUFBQTtBQUFBO0FBOUNuRTs7QUFFQSxJQUFJQSxLQUFLLEdBQUdDLE9BQU8sQ0FBQyxTQUFTLENBQUM7RUFDNUJDLFVBQVUsR0FBR0QsT0FBTyxDQUFDLGFBQWEsQ0FBQztFQUNuQ0UsT0FBTyxHQUFHRixPQUFPLENBQUMsU0FBUyxDQUFDO0VBQzVCRyxXQUFXLEdBQUdILE9BQU8sQ0FBQyxlQUFlLENBQUM7RUFDdENJLEtBQUss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