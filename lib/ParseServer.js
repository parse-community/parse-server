'use strict';

Object.defineProperty(exports, "__esModule", {
  value: true
});

var _createClass = function () { function defineProperties(target, props) { for (var i = 0; i < props.length; i++) { var descriptor = props[i]; descriptor.enumerable = descriptor.enumerable || false; descriptor.configurable = true; if ("value" in descriptor) descriptor.writable = true; Object.defineProperty(target, descriptor.key, descriptor); } } return function (Constructor, protoProps, staticProps) { if (protoProps) defineProperties(Constructor.prototype, protoProps); if (staticProps) defineProperties(Constructor, staticProps); return Constructor; }; }();

var _defaults = require('./defaults');

var _defaults2 = _interopRequireDefault(_defaults);

var _logger = require('./logger');

var logging = _interopRequireWildcard(_logger);

var _cache = require('./cache');

var _cache2 = _interopRequireDefault(_cache);

var _Config = require('./Config');

var _Config2 = _interopRequireDefault(_Config);

var _package = require('../package.json');

var _package2 = _interopRequireDefault(_package);

var _PromiseRouter = require('./PromiseRouter');

var _PromiseRouter2 = _interopRequireDefault(_PromiseRouter);

var _requiredParameter = require('./requiredParameter');

var _requiredParameter2 = _interopRequireDefault(_requiredParameter);

var _AnalyticsRouter = require('./Routers/AnalyticsRouter');

var _ClassesRouter = require('./Routers/ClassesRouter');

var _FeaturesRouter = require('./Routers/FeaturesRouter');

var _InMemoryCacheAdapter = require('./Adapters/Cache/InMemoryCacheAdapter');

var _AnalyticsController = require('./Controllers/AnalyticsController');

var _CacheController = require('./Controllers/CacheController');

var _AnalyticsAdapter = require('./Adapters/Analytics/AnalyticsAdapter');

var _WinstonLoggerAdapter = require('./Adapters/Logger/WinstonLoggerAdapter');

var _FilesController = require('./Controllers/FilesController');

var _FilesRouter = require('./Routers/FilesRouter');

var _FunctionsRouter = require('./Routers/FunctionsRouter');

var _GlobalConfigRouter = require('./Routers/GlobalConfigRouter');

var _GridStoreAdapter = require('./Adapters/Files/GridStoreAdapter');

var _HooksController = require('./Controllers/HooksController');

var _HooksRouter = require('./Routers/HooksRouter');

var _IAPValidationRouter = require('./Routers/IAPValidationRouter');

var _InstallationsRouter = require('./Routers/InstallationsRouter');

var _AdapterLoader = require('./Adapters/AdapterLoader');

var _LiveQueryController = require('./Controllers/LiveQueryController');

var _LoggerController = require('./Controllers/LoggerController');

var _LogsRouter = require('./Routers/LogsRouter');

var _ParseLiveQueryServer = require('./LiveQuery/ParseLiveQueryServer');

var _PublicAPIRouter = require('./Routers/PublicAPIRouter');

var _PushController = require('./Controllers/PushController');

var _PushRouter = require('./Routers/PushRouter');

var _CloudCodeRouter = require('./Routers/CloudCodeRouter');

var _cryptoUtils = require('./cryptoUtils');

var _RolesRouter = require('./Routers/RolesRouter');

var _SchemasRouter = require('./Routers/SchemasRouter');

var _SessionsRouter = require('./Routers/SessionsRouter');

var _UserController = require('./Controllers/UserController');

var _UsersRouter = require('./Routers/UsersRouter');

var _PurgeRouter = require('./Routers/PurgeRouter');

var _DatabaseController = require('./Controllers/DatabaseController');

var _DatabaseController2 = _interopRequireDefault(_DatabaseController);

var _SchemaCache = require('./Controllers/SchemaCache');

var _SchemaCache2 = _interopRequireDefault(_SchemaCache);

var _parseServerPushAdapter = require('parse-server-push-adapter');

var _parseServerPushAdapter2 = _interopRequireDefault(_parseServerPushAdapter);

var _MongoStorageAdapter = require('./Adapters/Storage/Mongo/MongoStorageAdapter');

var _MongoStorageAdapter2 = _interopRequireDefault(_MongoStorageAdapter);

var _PostgresStorageAdapter = require('./Adapters/Storage/Postgres/PostgresStorageAdapter');

var _PostgresStorageAdapter2 = _interopRequireDefault(_PostgresStorageAdapter);

var _ParseServerRESTController = require('./ParseServerRESTController');

function _interopRequireWildcard(obj) { if (obj && obj.__esModule) { return obj; } else { var newObj = {}; if (obj != null) { for (var key in obj) { if (Object.prototype.hasOwnProperty.call(obj, key)) newObj[key] = obj[key]; } } newObj.default = obj; return newObj; } }

function _interopRequireDefault(obj) { return obj && obj.__esModule ? obj : { default: obj }; }

function _classCallCheck(instance, Constructor) { if (!(instance instanceof Constructor)) { throw new TypeError("Cannot call a class as a function"); } }

// ParseServer - open-source compatible API Server for Parse apps

var batch = require('./batch'),
    bodyParser = require('body-parser'),
    express = require('express'),
    middlewares = require('./middlewares'),
    multer = require('multer'),
    Parse = require('parse/node').Parse,
    path = require('path'),
    url = require('url'),
    authDataManager = require('./authDataManager');

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
// "facebookAppIds": an array of valid Facebook Application IDs, required
//                   if using Facebook login
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

var ParseServer = function () {
  function ParseServer(_ref) {
    var _ref$appId = _ref.appId,
        appId = _ref$appId === undefined ? (0, _requiredParameter2.default)('You must provide an appId!') : _ref$appId,
        _ref$masterKey = _ref.masterKey,
        masterKey = _ref$masterKey === undefined ? (0, _requiredParameter2.default)('You must provide a masterKey!') : _ref$masterKey,
        appName = _ref.appName,
        analyticsAdapter = _ref.analyticsAdapter,
        filesAdapter = _ref.filesAdapter,
        push = _ref.push,
        loggerAdapter = _ref.loggerAdapter,
        _ref$jsonLogs = _ref.jsonLogs,
        jsonLogs = _ref$jsonLogs === undefined ? _defaults2.default.jsonLogs : _ref$jsonLogs,
        _ref$logsFolder = _ref.logsFolder,
        logsFolder = _ref$logsFolder === undefined ? _defaults2.default.logsFolder : _ref$logsFolder,
        _ref$verbose = _ref.verbose,
        verbose = _ref$verbose === undefined ? _defaults2.default.verbose : _ref$verbose,
        _ref$logLevel = _ref.logLevel,
        logLevel = _ref$logLevel === undefined ? _defaults2.default.level : _ref$logLevel,
        _ref$silent = _ref.silent,
        silent = _ref$silent === undefined ? _defaults2.default.silent : _ref$silent,
        _ref$databaseURI = _ref.databaseURI,
        databaseURI = _ref$databaseURI === undefined ? _defaults2.default.DefaultMongoURI : _ref$databaseURI,
        databaseOptions = _ref.databaseOptions,
        databaseAdapter = _ref.databaseAdapter,
        cloud = _ref.cloud,
        _ref$collectionPrefix = _ref.collectionPrefix,
        collectionPrefix = _ref$collectionPrefix === undefined ? '' : _ref$collectionPrefix,
        clientKey = _ref.clientKey,
        javascriptKey = _ref.javascriptKey,
        dotNetKey = _ref.dotNetKey,
        restAPIKey = _ref.restAPIKey,
        webhookKey = _ref.webhookKey,
        fileKey = _ref.fileKey,
        _ref$facebookAppIds = _ref.facebookAppIds,
        facebookAppIds = _ref$facebookAppIds === undefined ? [] : _ref$facebookAppIds,
        _ref$enableAnonymousU = _ref.enableAnonymousUsers,
        enableAnonymousUsers = _ref$enableAnonymousU === undefined ? _defaults2.default.enableAnonymousUsers : _ref$enableAnonymousU,
        _ref$allowClientClass = _ref.allowClientClassCreation,
        allowClientClassCreation = _ref$allowClientClass === undefined ? _defaults2.default.allowClientClassCreation : _ref$allowClientClass,
        _ref$oauth = _ref.oauth,
        oauth = _ref$oauth === undefined ? {} : _ref$oauth,
        _ref$serverURL = _ref.serverURL,
        serverURL = _ref$serverURL === undefined ? (0, _requiredParameter2.default)('You must provide a serverURL!') : _ref$serverURL,
        _ref$maxUploadSize = _ref.maxUploadSize,
        maxUploadSize = _ref$maxUploadSize === undefined ? _defaults2.default.maxUploadSize : _ref$maxUploadSize,
        _ref$verifyUserEmails = _ref.verifyUserEmails,
        verifyUserEmails = _ref$verifyUserEmails === undefined ? _defaults2.default.verifyUserEmails : _ref$verifyUserEmails,
        _ref$preventLoginWith = _ref.preventLoginWithUnverifiedEmail,
        preventLoginWithUnverifiedEmail = _ref$preventLoginWith === undefined ? _defaults2.default.preventLoginWithUnverifiedEmail : _ref$preventLoginWith,
        emailVerifyTokenValidityDuration = _ref.emailVerifyTokenValidityDuration,
        accountLockout = _ref.accountLockout,
        cacheAdapter = _ref.cacheAdapter,
        emailAdapter = _ref.emailAdapter,
        publicServerURL = _ref.publicServerURL,
        _ref$customPages = _ref.customPages,
        customPages = _ref$customPages === undefined ? {
      invalidLink: undefined,
      verifyEmailSuccess: undefined,
      choosePassword: undefined,
      passwordResetSuccess: undefined
    } : _ref$customPages,
        _ref$liveQuery = _ref.liveQuery,
        liveQuery = _ref$liveQuery === undefined ? {} : _ref$liveQuery,
        _ref$sessionLength = _ref.sessionLength,
        sessionLength = _ref$sessionLength === undefined ? _defaults2.default.sessionLength : _ref$sessionLength,
        _ref$expireInactiveSe = _ref.expireInactiveSessions,
        expireInactiveSessions = _ref$expireInactiveSe === undefined ? _defaults2.default.expireInactiveSessions : _ref$expireInactiveSe,
        _ref$revokeSessionOnP = _ref.revokeSessionOnPasswordReset,
        revokeSessionOnPasswordReset = _ref$revokeSessionOnP === undefined ? _defaults2.default.revokeSessionOnPasswordReset : _ref$revokeSessionOnP,
        _ref$schemaCacheTTL = _ref.schemaCacheTTL,
        schemaCacheTTL = _ref$schemaCacheTTL === undefined ? _defaults2.default.schemaCacheTTL : _ref$schemaCacheTTL,
        _ref$__indexBuildComp = _ref.__indexBuildCompletionCallbackForTests,
        __indexBuildCompletionCallbackForTests = _ref$__indexBuildComp === undefined ? function () {} : _ref$__indexBuildComp;

    _classCallCheck(this, ParseServer);

    // Initialize the node client SDK automatically
    Parse.initialize(appId, javascriptKey || 'unused', masterKey);
    Parse.serverURL = serverURL;
    if ((databaseOptions || databaseURI && databaseURI != _defaults2.default.DefaultMongoURI || collectionPrefix !== '') && databaseAdapter) {
      throw 'You cannot specify both a databaseAdapter and a databaseURI/databaseOptions/collectionPrefix.';
    } else if (!databaseAdapter) {
      databaseAdapter = this.getDatabaseAdapter(databaseURI, collectionPrefix, databaseOptions);
    } else {
      databaseAdapter = (0, _AdapterLoader.loadAdapter)(databaseAdapter);
    }

    if (!filesAdapter && !databaseURI) {
      throw 'When using an explicit database adapter, you must also use and explicit filesAdapter.';
    }

    var loggerControllerAdapter = (0, _AdapterLoader.loadAdapter)(loggerAdapter, _WinstonLoggerAdapter.WinstonLoggerAdapter, { jsonLogs: jsonLogs, logsFolder: logsFolder, verbose: verbose, logLevel: logLevel, silent: silent });
    var loggerController = new _LoggerController.LoggerController(loggerControllerAdapter, appId);
    logging.setLogger(loggerController);

    var filesControllerAdapter = (0, _AdapterLoader.loadAdapter)(filesAdapter, function () {
      return new _GridStoreAdapter.GridStoreAdapter(databaseURI);
    });
    var filesController = new _FilesController.FilesController(filesControllerAdapter, appId);

    // Pass the push options too as it works with the default
    var pushControllerAdapter = (0, _AdapterLoader.loadAdapter)(push && push.adapter, _parseServerPushAdapter2.default, push || {});
    // We pass the options and the base class for the adatper,
    // Note that passing an instance would work too
    var pushController = new _PushController.PushController(pushControllerAdapter, appId, push);

    var emailControllerAdapter = (0, _AdapterLoader.loadAdapter)(emailAdapter);
    var userController = new _UserController.UserController(emailControllerAdapter, appId, { verifyUserEmails: verifyUserEmails });

    var cacheControllerAdapter = (0, _AdapterLoader.loadAdapter)(cacheAdapter, _InMemoryCacheAdapter.InMemoryCacheAdapter, { appId: appId });
    var cacheController = new _CacheController.CacheController(cacheControllerAdapter, appId);

    var analyticsControllerAdapter = (0, _AdapterLoader.loadAdapter)(analyticsAdapter, _AnalyticsAdapter.AnalyticsAdapter);
    var analyticsController = new _AnalyticsController.AnalyticsController(analyticsControllerAdapter);

    var liveQueryController = new _LiveQueryController.LiveQueryController(liveQuery);
    var databaseController = new _DatabaseController2.default(databaseAdapter, new _SchemaCache2.default(cacheController, schemaCacheTTL));
    var hooksController = new _HooksController.HooksController(appId, databaseController, webhookKey);

    var dbInitPromise = databaseController.performInitizalization();

    _cache2.default.put(appId, {
      appId: appId,
      masterKey: masterKey,
      serverURL: serverURL,
      collectionPrefix: collectionPrefix,
      clientKey: clientKey,
      javascriptKey: javascriptKey,
      dotNetKey: dotNetKey,
      restAPIKey: restAPIKey,
      webhookKey: webhookKey,
      fileKey: fileKey,
      facebookAppIds: facebookAppIds,
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
      allowClientClassCreation: allowClientClassCreation,
      authDataManager: authDataManager(oauth, enableAnonymousUsers),
      appName: appName,
      publicServerURL: publicServerURL,
      customPages: customPages,
      maxUploadSize: maxUploadSize,
      liveQueryController: liveQueryController,
      sessionLength: Number(sessionLength),
      expireInactiveSessions: expireInactiveSessions,
      jsonLogs: jsonLogs,
      revokeSessionOnPasswordReset: revokeSessionOnPasswordReset,
      databaseController: databaseController,
      schemaCacheTTL: schemaCacheTTL
    });

    // To maintain compatibility. TODO: Remove in some version that breaks backwards compatability
    if (process.env.FACEBOOK_APP_ID) {
      _cache2.default.get(appId)['facebookAppIds'].push(process.env.FACEBOOK_APP_ID);
    }

    _Config2.default.validate(_cache2.default.get(appId));
    this.config = _cache2.default.get(appId);
    hooksController.load();

    // Note: Tests will start to fail if any validation happens after this is called.
    if (process.env.TESTING) {
      __indexBuildCompletionCallbackForTests(dbInitPromise);
    }

    if (cloud) {
      addParseCloud();
      if (typeof cloud === 'function') {
        cloud(Parse);
      } else if (typeof cloud === 'string') {
        require(path.resolve(process.cwd(), cloud));
      } else {
        throw "argument 'cloud' must either be a string or a function";
      }
    }
  }

  _createClass(ParseServer, [{
    key: 'getDatabaseAdapter',
    value: function getDatabaseAdapter(databaseURI, collectionPrefix, databaseOptions) {
      var protocol = void 0;
      try {
        var parsedURI = url.parse(databaseURI);
        protocol = parsedURI.protocol ? parsedURI.protocol.toLowerCase() : null;
      } catch (e) {}
      switch (protocol) {
        case 'postgres:':
          return new _PostgresStorageAdapter2.default({
            uri: databaseURI,
            collectionPrefix: collectionPrefix,
            databaseOptions: databaseOptions
          });
        default:
          return new _MongoStorageAdapter2.default({
            uri: databaseURI,
            collectionPrefix: collectionPrefix,
            mongoOptions: databaseOptions
          });
      }
    }
  }, {
    key: 'app',
    get: function get() {
      return ParseServer.app(this.config);
    }
  }], [{
    key: 'app',
    value: function app(_ref2) {
      var _ref2$maxUploadSize = _ref2.maxUploadSize,
          maxUploadSize = _ref2$maxUploadSize === undefined ? '20mb' : _ref2$maxUploadSize,
          appId = _ref2.appId;

      // This app serves the Parse API directly.
      // It's the equivalent of https://api.parse.com/1 in the hosted Parse API.
      var api = express();
      //api.use("/apps", express.static(__dirname + "/public"));
      // File handling needs to be before default middlewares are applied
      api.use('/', middlewares.allowCrossDomain, new _FilesRouter.FilesRouter().expressRouter({
        maxUploadSize: maxUploadSize
      }));

      api.use('/', bodyParser.urlencoded({ extended: false }), new _PublicAPIRouter.PublicAPIRouter().expressRouter());

      api.use(bodyParser.json({ 'type': '*/*', limit: maxUploadSize }));
      api.use(middlewares.allowCrossDomain);
      api.use(middlewares.allowMethodOverride);
      api.use(middlewares.handleParseHeaders);

      var appRouter = ParseServer.promiseRouter({ appId: appId });
      api.use(appRouter.expressRouter());

      api.use(middlewares.handleParseErrors);

      //This causes tests to spew some useless warnings, so disable in test
      if (!process.env.TESTING) {
        process.on('uncaughtException', function (err) {
          if (err.code === "EADDRINUSE") {
            // user-friendly message for this common error
            console.error('Unable to listen on port ' + err.port + '. The port is already in use.');
            process.exit(0);
          } else {
            throw err;
          }
        });
      }
      if (process.env.PARSE_SERVER_ENABLE_EXPERIMENTAL_DIRECT_ACCESS === '1') {
        Parse.CoreManager.setRESTController((0, _ParseServerRESTController.ParseServerRESTController)(appId, appRouter));
      }
      return api;
    }
  }, {
    key: 'promiseRouter',
    value: function promiseRouter(_ref3) {
      var appId = _ref3.appId;

      var routers = [new _ClassesRouter.ClassesRouter(), new _UsersRouter.UsersRouter(), new _SessionsRouter.SessionsRouter(), new _RolesRouter.RolesRouter(), new _AnalyticsRouter.AnalyticsRouter(), new _InstallationsRouter.InstallationsRouter(), new _FunctionsRouter.FunctionsRouter(), new _SchemasRouter.SchemasRouter(), new _PushRouter.PushRouter(), new _LogsRouter.LogsRouter(), new _IAPValidationRouter.IAPValidationRouter(), new _FeaturesRouter.FeaturesRouter(), new _GlobalConfigRouter.GlobalConfigRouter(), new _PurgeRouter.PurgeRouter(), new _HooksRouter.HooksRouter(), new _CloudCodeRouter.CloudCodeRouter()];

      var routes = routers.reduce(function (memo, router) {
        return memo.concat(router.routes);
      }, []);

      var appRouter = new _PromiseRouter2.default(routes, appId);

      batch.mountOnto(appRouter);
      return appRouter;
    }
  }, {
    key: 'createLiveQueryServer',
    value: function createLiveQueryServer(httpServer, config) {
      return new _ParseLiveQueryServer.ParseLiveQueryServer(httpServer, config);
    }
  }]);

  return ParseServer;
}();

function addParseCloud() {
  var ParseCloud = require("./cloud-code/Parse.Cloud");
  Object.assign(Parse.Cloud, ParseCloud);
  global.Parse = Parse;
}

exports.default = ParseServer;