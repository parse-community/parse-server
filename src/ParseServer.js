// ParseServer - open-source compatible API Server for Parse apps

var batch = require('./batch'),
  bodyParser = require('body-parser'),
  express = require('express'),
  middlewares = require('./middlewares'),
  Parse = require('parse/node').Parse,
  path = require('path'),
  url = require('url'),
  authDataManager = require('./Adapters/Auth');

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

class ParseServer {

  constructor({
    appId = requiredParameter('You must provide an appId!'),
    masterKey = requiredParameter('You must provide a masterKey!'),
    masterKeyIps = [],
    appName,
    analyticsAdapter,
    filesAdapter,
    push,
    scheduledPush = false,
    loggerAdapter,
    jsonLogs = defaults.jsonLogs,
    logsFolder = defaults.logsFolder,
    verbose = defaults.verbose,
    logLevel = defaults.level,
    silent = defaults.silent,
    databaseURI = defaults.DefaultMongoURI,
    databaseOptions,
    databaseAdapter,
    cloud,
    collectionPrefix = '',
    clientKey,
    javascriptKey,
    dotNetKey,
    restAPIKey,
    webhookKey,
    fileKey,
    userSensitiveFields = [],
    enableAnonymousUsers = defaults.enableAnonymousUsers,
    allowClientClassCreation = defaults.allowClientClassCreation,
    oauth = {},
    auth = {},
    serverURL = requiredParameter('You must provide a serverURL!'),
    maxUploadSize = defaults.maxUploadSize,
    verifyUserEmails = defaults.verifyUserEmails,
    preventLoginWithUnverifiedEmail = defaults.preventLoginWithUnverifiedEmail,
    emailVerifyTokenValidityDuration,
    accountLockout,
    passwordPolicy,
    cacheAdapter,
    emailAdapter,
    publicServerURL,
    customPages = {
      invalidLink: undefined,
      verifyEmailSuccess: undefined,
      choosePassword: undefined,
      passwordResetSuccess: undefined
    },
    liveQuery = {},
    sessionLength = defaults.sessionLength, // 1 Year in seconds
    expireInactiveSessions = defaults.expireInactiveSessions,
    revokeSessionOnPasswordReset = defaults.revokeSessionOnPasswordReset,
    schemaCacheTTL = defaults.schemaCacheTTL, // cache for 5s
    cacheTTL = defaults.cacheTTL, // cache for 5s
    cacheMaxSize = defaults.cacheMaxSize, // 10000
    enableSingleSchemaCache = false,
    objectIdSize = defaults.objectIdSize,
    __indexBuildCompletionCallbackForTests = () => {},
  }) {

    // Initialize the node client SDK automatically
    Parse.initialize(appId, javascriptKey || 'unused', masterKey);
    Parse.serverURL = serverURL;
    if ((databaseOptions || (databaseURI && databaseURI != defaults.DefaultMongoURI) || collectionPrefix !== '') && databaseAdapter) {
      throw 'You cannot specify both a databaseAdapter and a databaseURI/databaseOptions/collectionPrefix.';
    } else if (!databaseAdapter) {
      databaseAdapter = this.getDatabaseAdapter(databaseURI, collectionPrefix, databaseOptions)
    } else {
      databaseAdapter = loadAdapter(databaseAdapter)
    }

    if (!filesAdapter && !databaseURI) {
      throw 'When using an explicit database adapter, you must also use an explicit filesAdapter.';
    }

    userSensitiveFields = Array.from(new Set(userSensitiveFields.concat(
      defaults.userSensitiveFields,
      userSensitiveFields
    )));

    masterKeyIps = Array.from(new Set(masterKeyIps.concat(
      defaults.masterKeyIps,
      masterKeyIps
    )));

    const loggerControllerAdapter = loadAdapter(loggerAdapter, WinstonLoggerAdapter, { jsonLogs, logsFolder, verbose, logLevel, silent });
    const loggerController = new LoggerController(loggerControllerAdapter, appId);
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

    if (Object.keys(oauth).length > 0) {
      /* eslint-disable no-console */
      console.warn('oauth option is deprecated and will be removed in a future release, please use auth option instead');
      if (Object.keys(auth).length > 0) {
        console.warn('You should use only the auth option.');
      }
      /* eslint-enable */
    }

    auth = Object.assign({}, oauth, auth);

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
    return ParseServer.app(this.config);
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

    //This causes tests to spew some useless warnings, so disable in test
    if (!process.env.TESTING) {
      process.on('uncaughtException', (err) => {
        if (err.code === "EADDRINUSE") { // user-friendly message for this common error
          /* eslint-disable no-console */
          console.error(`Unable to listen on port ${err.port}. The port is already in use.`);
          /* eslint-enable no-console */
          process.exit(0);
        } else {
          throw err;
        }
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

  static createLiveQueryServer(httpServer, config) {
    return new ParseLiveQueryServer(httpServer, config);
  }
}

function addParseCloud() {
  const ParseCloud = require("./cloud-code/Parse.Cloud");
  Object.assign(Parse.Cloud, ParseCloud);
  global.Parse = Parse;
}

export default ParseServer;
