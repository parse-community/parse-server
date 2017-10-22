// ParseServer - open-source compatible API Server for Parse apps

var batch = require('./batch'),
  bodyParser = require('body-parser'),
  express = require('express'),
  middlewares = require('./middlewares'),
  Parse = require('parse/node').Parse,
  path = require('path'),
  url = require('url'),
  authDataManager = require('./Adapters/Auth');

import { ParseServerOptions,
  LiveQueryServerOptions }      from './Options';
import defaults                 from './defaults';
import * as logging             from './logger';
import AppCache                 from './cache';
import Config                   from './Config';
import PromiseRouter            from './PromiseRouter';
import requiredParameter        from './requiredParameter';
import { AnalyticsRouter }      from './Routers/AnalyticsRouter';
import { ClassesRouter }        from './Routers/ClassesRouter';
import { FeaturesRouter }       from './Routers/FeaturesRouter';
import { InMemoryCacheAdapter } from './Adapters/Cache/InMemoryCacheAdapter';
import { AnalyticsController }  from './Controllers/AnalyticsController';
import { CacheController }      from './Controllers/CacheController';
import { AnalyticsAdapter }     from './Adapters/Analytics/AnalyticsAdapter';
import { WinstonLoggerAdapter } from './Adapters/Logger/WinstonLoggerAdapter';
import { FilesController }      from './Controllers/FilesController';
import { FilesRouter }          from './Routers/FilesRouter';
import { FunctionsRouter }      from './Routers/FunctionsRouter';
import { GlobalConfigRouter }   from './Routers/GlobalConfigRouter';
import { GridStoreAdapter }     from './Adapters/Files/GridStoreAdapter';
import { HooksController }      from './Controllers/HooksController';
import { HooksRouter }          from './Routers/HooksRouter';
import { IAPValidationRouter }  from './Routers/IAPValidationRouter';
import { InstallationsRouter }  from './Routers/InstallationsRouter';
import { loadAdapter }          from './Adapters/AdapterLoader';
import { LiveQueryController }  from './Controllers/LiveQueryController';
import { LoggerController }     from './Controllers/LoggerController';
import { LogsRouter }           from './Routers/LogsRouter';
import { ParseLiveQueryServer } from './LiveQuery/ParseLiveQueryServer';
import { PublicAPIRouter }      from './Routers/PublicAPIRouter';
import { PushController }       from './Controllers/PushController';
import { PushQueue }            from './Push/PushQueue';
import { PushWorker }           from './Push/PushWorker';
import { PushRouter }           from './Routers/PushRouter';
import { CloudCodeRouter }      from './Routers/CloudCodeRouter';
import { RolesRouter }          from './Routers/RolesRouter';
import { SchemasRouter }        from './Routers/SchemasRouter';
import { SessionsRouter }       from './Routers/SessionsRouter';
import { UserController }       from './Controllers/UserController';
import { UsersRouter }          from './Routers/UsersRouter';
import { PurgeRouter }          from './Routers/PurgeRouter';
import { AudiencesRouter }          from './Routers/AudiencesRouter';

import DatabaseController       from './Controllers/DatabaseController';
import SchemaCache              from './Controllers/SchemaCache';
import ParsePushAdapter         from 'parse-server-push-adapter';
import MongoStorageAdapter      from './Adapters/Storage/Mongo/MongoStorageAdapter';
import PostgresStorageAdapter   from './Adapters/Storage/Postgres/PostgresStorageAdapter';

import { ParseServerRESTController } from './ParseServerRESTController';
// Mutate the Parse object to add the Cloud Code handlers
addParseCloud();

// ParseServer works like a constructor of an express app.
// The args that we understand are:
// "analyticsAdapter": an adapter class for analytics
// "filesAdapter": a class like GridStoreAdapter providing create, get,
//                 and delete
// "loggerAdapter": a class like WinstonLoggerAdapter providing info, error,
//                 and query
// "jsonLogs": log as structured JSON objects
// "databaseURI": a uri like mongodb://localhost:27017/dbname to tell us
//          what database this Parse API connects to.
// "cloud": relative location to cloud code to require, or a function
//          that is given an instance of Parse as a parameter.  Use this instance of Parse
//          to register your cloud code hooks and functions.
// "appId": the application id to host
// "masterKey": the master key for requests to this app
// "collectionPrefix": optional prefix for database collection names
// "fileKey": optional key from Parse dashboard for supporting older files
//            hosted by Parse
// "clientKey": optional key from Parse dashboard
// "dotNetKey": optional key from Parse dashboard
// "restAPIKey": optional key from Parse dashboard
// "webhookKey": optional key from Parse dashboard
// "javascriptKey": optional key from Parse dashboard
// "push": optional key from configure push
// "sessionLength": optional length in seconds for how long Sessions should be valid for
// "maxLimit": optional upper bound for what can be specified for the 'limit' parameter on queries

class ParseServer {

  constructor(options: ParseServerOptions) {
    options = mergeWithDefaults(options);
    const {
      appId = requiredParameter('You must provide an appId!'),
      masterKey = requiredParameter('You must provide a masterKey!'),
      appName,
      analyticsAdapter,
      filesAdapter,
      push,
      scheduledPush,
      loggerAdapter,
      jsonLogs,
      logsFolder,
      verbose,
      logLevel,
      silent,
      databaseURI,
      databaseOptions,
      cloud,
      collectionPrefix,
      clientKey,
      javascriptKey,
      dotNetKey,
      restAPIKey,
      webhookKey,
      fileKey,
      enableAnonymousUsers,
      allowClientClassCreation,
      auth,
      serverURL = requiredParameter('You must provide a serverURL!'),
      maxUploadSize,
      verifyUserEmails,
      preventLoginWithUnverifiedEmail,
      emailVerifyTokenValidityDuration,
      accountLockout,
      passwordPolicy,
      cacheAdapter,
      emailAdapter,
      publicServerURL,
      customPages,
      liveQuery,
      sessionLength, // 1 Year in seconds
      maxLimit,
      expireInactiveSessions,
      revokeSessionOnPasswordReset,
      schemaCacheTTL, // cache for 5s
      cacheTTL, // cache for 5s
      cacheMaxSize, // 10000
      enableSingleSchemaCache,
      objectIdSize,
      masterKeyIps,
      userSensitiveFields,
      __indexBuildCompletionCallbackForTests = () => {},
    } = options;

    let {
      databaseAdapter,
    } = options;
    // Initialize the node client SDK automatically
    Parse.initialize(appId, javascriptKey || 'unused', masterKey);
    Parse.serverURL = serverURL;
    if ((databaseOptions || (databaseURI && databaseURI !== defaults.databaseURI) || collectionPrefix !== defaults.collectionPrefix) && databaseAdapter) {
      throw 'You cannot specify both a databaseAdapter and a databaseURI/databaseOptions/collectionPrefix.';
    } else if (!databaseAdapter) {
      databaseAdapter = this.getDatabaseAdapter(databaseURI, collectionPrefix, databaseOptions)
    } else {
      databaseAdapter = loadAdapter(databaseAdapter)
    }

    if (!filesAdapter && !databaseURI) {
      throw 'When using an explicit database adapter, you must also use an explicit filesAdapter.';
    }

    const loggerOptions = { jsonLogs, logsFolder, verbose, logLevel, silent };
    const loggerControllerAdapter = loadAdapter(loggerAdapter, WinstonLoggerAdapter, loggerOptions);
    const loggerController = new LoggerController(loggerControllerAdapter, appId, loggerOptions);
    logging.setLogger(loggerController);

    const filesControllerAdapter = loadAdapter(filesAdapter, () => {
      return new GridStoreAdapter(databaseURI);
    });
    const filesController = new FilesController(filesControllerAdapter, appId);

    const pushOptions = Object.assign({}, push);
    const pushQueueOptions = pushOptions.queueOptions || {};
    if (pushOptions.queueOptions) {
      delete pushOptions.queueOptions;
    }
    // Pass the push options too as it works with the default
    const pushAdapter = loadAdapter(pushOptions && pushOptions.adapter, ParsePushAdapter, pushOptions);
    // We pass the options and the base class for the adatper,
    // Note that passing an instance would work too
    const pushController = new PushController();
    const hasPushSupport = !!(pushAdapter && push);
    const hasPushScheduledSupport = hasPushSupport && (scheduledPush === true);

    const {
      disablePushWorker
    } = pushQueueOptions;

    const pushControllerQueue = new PushQueue(pushQueueOptions);
    let pushWorker;
    if (!disablePushWorker) {
      pushWorker = new PushWorker(pushAdapter, pushQueueOptions);
    }

    const emailControllerAdapter = loadAdapter(emailAdapter);
    const userController = new UserController(emailControllerAdapter, appId, { verifyUserEmails });

    const cacheControllerAdapter = loadAdapter(cacheAdapter, InMemoryCacheAdapter, {appId: appId, ttl: cacheTTL, maxSize: cacheMaxSize });
    const cacheController = new CacheController(cacheControllerAdapter, appId);

    const analyticsControllerAdapter = loadAdapter(analyticsAdapter, AnalyticsAdapter);
    const analyticsController = new AnalyticsController(analyticsControllerAdapter);

    const liveQueryController = new LiveQueryController(liveQuery);
    const databaseController = new DatabaseController(databaseAdapter, new SchemaCache(cacheController, schemaCacheTTL, enableSingleSchemaCache));
    const hooksController = new HooksController(appId, databaseController, webhookKey);

    const dbInitPromise = databaseController.performInitialization();

    AppCache.put(appId, {
      appId,
      masterKey: masterKey,
      masterKeyIps:masterKeyIps,
      serverURL: serverURL,
      collectionPrefix: collectionPrefix,
      clientKey: clientKey,
      javascriptKey: javascriptKey,
      dotNetKey: dotNetKey,
      restAPIKey: restAPIKey,
      webhookKey: webhookKey,
      fileKey: fileKey,
      analyticsController: analyticsController,
      cacheController: cacheController,
      filesController: filesController,
      pushController: pushController,
      loggerController: loggerController,
      hooksController: hooksController,
      userController: userController,
      verifyUserEmails: verifyUserEmails,
      preventLoginWithUnverifiedEmail: preventLoginWithUnverifiedEmail,
      emailVerifyTokenValidityDuration: emailVerifyTokenValidityDuration,
      accountLockout: accountLockout,
      passwordPolicy: passwordPolicy,
      allowClientClassCreation: allowClientClassCreation,
      authDataManager: authDataManager(auth, enableAnonymousUsers),
      appName: appName,
      publicServerURL: publicServerURL,
      customPages: customPages,
      maxUploadSize: maxUploadSize,
      liveQueryController: liveQueryController,
      sessionLength: Number(sessionLength),
      maxLimit: Number(maxLimit),
      expireInactiveSessions: expireInactiveSessions,
      jsonLogs,
      revokeSessionOnPasswordReset,
      databaseController,
      schemaCacheTTL,
      enableSingleSchemaCache,
      userSensitiveFields,
      pushWorker,
      pushControllerQueue,
      hasPushSupport,
      hasPushScheduledSupport,
      objectIdSize
    });

    Config.validate(AppCache.get(appId));
    this.config = AppCache.get(appId);
    Config.setupPasswordValidator(this.config.passwordPolicy);
    hooksController.load();

    // Note: Tests will start to fail if any validation happens after this is called.
    if (process.env.TESTING) {
      __indexBuildCompletionCallbackForTests(dbInitPromise);
    }

    if (cloud) {
      addParseCloud();
      if (typeof cloud === 'function') {
        cloud(Parse)
      } else if (typeof cloud === 'string') {
        require(path.resolve(process.cwd(), cloud));
      } else {
        throw "argument 'cloud' must either be a string or a function";
      }
    }
  }

  getDatabaseAdapter(databaseURI, collectionPrefix, databaseOptions) {
    let protocol;
    try {
      const parsedURI = url.parse(databaseURI);
      protocol = parsedURI.protocol ? parsedURI.protocol.toLowerCase() : null;
    } catch(e) { /* */ }
    switch (protocol) {
    case 'postgres:':
      return new PostgresStorageAdapter({
        uri: databaseURI,
        collectionPrefix,
        databaseOptions
      });
    default:
      return new MongoStorageAdapter({
        uri: databaseURI,
        collectionPrefix,
        mongoOptions: databaseOptions,
      });
    }
  }

  get app() {
    if (!this._app) {
      this._app = ParseServer.app(this.config);
    }
    return this._app;
  }

  handleShutdown() {
    const { adapter } = this.config.databaseController;
    if (adapter && typeof adapter.handleShutdown === 'function') {
      adapter.handleShutdown();
    }
  }

  static app({maxUploadSize = '20mb', appId}) {
    // This app serves the Parse API directly.
    // It's the equivalent of https://api.parse.com/1 in the hosted Parse API.
    var api = express();
    //api.use("/apps", express.static(__dirname + "/public"));
    // File handling needs to be before default middlewares are applied
    api.use('/', middlewares.allowCrossDomain, new FilesRouter().expressRouter({
      maxUploadSize: maxUploadSize
    }));

    api.use('/health', (req, res) => res.sendStatus(200));

    api.use('/', bodyParser.urlencoded({extended: false}), new PublicAPIRouter().expressRouter());

    api.use(bodyParser.json({ 'type': '*/*' , limit: maxUploadSize }));
    api.use(middlewares.allowCrossDomain);
    api.use(middlewares.allowMethodOverride);
    api.use(middlewares.handleParseHeaders);

    const appRouter = ParseServer.promiseRouter({ appId });
    api.use(appRouter.expressRouter());

    api.use(middlewares.handleParseErrors);

    // run the following when not testing
    if (!process.env.TESTING) {
      //This causes tests to spew some useless warnings, so disable in test
      /* istanbul ignore next */
      process.on('uncaughtException', (err) => {
        if (err.code === "EADDRINUSE") { // user-friendly message for this common error
          process.stderr.write(`Unable to listen on port ${err.port}. The port is already in use.`);
          process.exit(0);
        } else {
          throw err;
        }
      });
      // verify the server url after a 'mount' event is received
      api.on('mount', function() {
        ParseServer.verifyServerUrl();
      });
    }
    if (process.env.PARSE_SERVER_ENABLE_EXPERIMENTAL_DIRECT_ACCESS === '1') {
      Parse.CoreManager.setRESTController(ParseServerRESTController(appId, appRouter));
    }
    return api;
  }

  static promiseRouter({appId}) {
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
      new IAPValidationRouter(),
      new FeaturesRouter(),
      new GlobalConfigRouter(),
      new PurgeRouter(),
      new HooksRouter(),
      new CloudCodeRouter(),
      new AudiencesRouter()
    ];

    const routes = routers.reduce((memo, router) => {
      return memo.concat(router.routes);
    }, []);

    const appRouter = new PromiseRouter(routes, appId);

    batch.mountOnto(appRouter);
    return appRouter;
  }

  start(options: ParseServerOptions, callback: ?()=>void) {
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
    const server = app.listen(options.port, options.host, callback);
    this.server = server;

    if (options.startLiveQueryServer || options.liveQueryServerOptions) {
      this.liveQueryServer = ParseServer.createLiveQueryServer(server, options.liveQueryServerOptions);
    }
    /* istanbul ignore next */
    if (!process.env.TESTING) {
      configureListeners(this);
    }
    this.expressApp = app;
    return this;
  }

  static start(options: ParseServerOptions, callback: ?()=>void) {
    const parseServer = new ParseServer(options);
    return parseServer.start(options, callback);
  }

  static createLiveQueryServer(httpServer, config: LiveQueryServerOptions) {
    if (!httpServer || (config && config.port)) {
      var app = express();
      httpServer = require('http').createServer(app);
      httpServer.listen(config.port);
    }
    return new ParseLiveQueryServer(httpServer, config);
  }

  static verifyServerUrl(callback) {
    // perform a health check on the serverURL value
    if(Parse.serverURL) {
      const request = require('request');
      request(Parse.serverURL.replace(/\/$/, "") + "/health", function (error, response, body) {
        if (error || response.statusCode !== 200 || body !== "OK") {
          /* eslint-disable no-console */
          console.warn(`\nWARNING, Unable to connect to '${Parse.serverURL}'.` +
            ` Cloud code and push notifications may be unavailable!\n`);
          if(callback) {
            callback(false);
          }
        } else {
          if(callback) {
            callback(true);
          }
        }
      });
    }
  }
}

function addParseCloud() {
  const ParseCloud = require("./cloud-code/Parse.Cloud");
  Object.assign(Parse.Cloud, ParseCloud);
  global.Parse = Parse;
}

function mergeWithDefaults(options: ParseServerOptions): ParseServerOptions {
  options = Object.assign({}, defaults, options);

  options.userSensitiveFields = Array.from(new Set(options.userSensitiveFields.concat(
    defaults.userSensitiveFields,
    options.userSensitiveFields
  )));

  options.masterKeyIps = Array.from(new Set(options.masterKeyIps.concat(
    defaults.masterKeyIps,
    options.masterKeyIps
  )));

  return options;
}

// Those can't be tested as it requires a subprocess
/* istanbul ignore next */
function configureListeners(parseServer) {
  const server = parseServer.server;
  const sockets = {};
  /* Currently, express doesn't shut down immediately after receiving SIGINT/SIGTERM if it has client connections that haven't timed out. (This is a known issue with node - https://github.com/nodejs/node/issues/2642)
    This function, along with `destroyAliveConnections()`, intend to fix this behavior such that parse server will close all open connections and initiate the shutdown process as soon as it receives a SIGINT/SIGTERM signal. */
  server.on('connection', (socket) => {
    const socketId = socket.remoteAddress + ':' + socket.remotePort;
    sockets[socketId] = socket;
    socket.on('close', () => {
      delete sockets[socketId];
    });
  });

  const destroyAliveConnections = function() {
    for (const socketId in sockets) {
      try {
        sockets[socketId].destroy();
      } catch (e) { /* */ }
    }
  }

  const handleShutdown = function() {
    process.stdout.write('Termination signal received. Shutting down.');
    destroyAliveConnections();
    server.close();
    parseServer.handleShutdown();
  };
  process.on('SIGTERM', handleShutdown);
  process.on('SIGINT', handleShutdown);
}

export default ParseServer;
