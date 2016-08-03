'use strict';

Object.defineProperty(exports, "__esModule", {
  value: true
});

var _createClass = function () { function defineProperties(target, props) { for (var i = 0; i < props.length; i++) { var descriptor = props[i]; descriptor.enumerable = descriptor.enumerable || false; descriptor.configurable = true; if ("value" in descriptor) descriptor.writable = true; Object.defineProperty(target, descriptor.key, descriptor); } } return function (Constructor, protoProps, staticProps) { if (protoProps) defineProperties(Constructor.prototype, protoProps); if (staticProps) defineProperties(Constructor, staticProps); return Constructor; }; }();

var _extends = Object.assign || function (target) { for (var i = 1; i < arguments.length; i++) { var source = arguments[i]; for (var key in source) { if (Object.prototype.hasOwnProperty.call(source, key)) { target[key] = source[key]; } } } return target; };

var _logger = require('./logger');

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

var _FileLoggerAdapter = require('./Adapters/Logger/FileLoggerAdapter');

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

function _interopRequireDefault(obj) { return obj && obj.__esModule ? obj : { default: obj }; }

function _classCallCheck(instance, Constructor) { if (!(instance instanceof Constructor)) { throw new TypeError("Cannot call a class as a function"); } }

// ParseServer - open-source compatible API Server for Parse apps

var batch = require('./batch'),
    bodyParser = require('body-parser'),
    DatabaseAdapter = require('./DatabaseAdapter'),
    express = require('express'),
    middlewares = require('./middlewares'),
    multer = require('multer'),
    Parse = require('parse/node').Parse,
    path = require('path'),
    authDataManager = require('./authDataManager');

if (!global._babelPolyfill) {
  require('babel-polyfill');
}

var SchemaController = require('./Controllers/SchemaController');

// Mutate the Parse object to add the Cloud Code handlers
addParseCloud();

var requiredUserFields = { fields: _extends({}, SchemaController.defaultColumns._Default, SchemaController.defaultColumns._User) };

// ParseServer works like a constructor of an express app.
// The args that we understand are:
// "analyticsAdapter": an adapter class for analytics
// "filesAdapter": a class like GridStoreAdapter providing create, get,
//                 and delete
// "loggerAdapter": a class like FileLoggerAdapter providing info, error,
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
    var _ref$appId = _ref.appId;
    var appId = _ref$appId === undefined ? (0, _requiredParameter2.default)('You must provide an appId!') : _ref$appId;
    var _ref$masterKey = _ref.masterKey;
    var masterKey = _ref$masterKey === undefined ? (0, _requiredParameter2.default)('You must provide a masterKey!') : _ref$masterKey;
    var appName = _ref.appName;
    var _ref$analyticsAdapter = _ref.analyticsAdapter;
    var analyticsAdapter = _ref$analyticsAdapter === undefined ? undefined : _ref$analyticsAdapter;
    var filesAdapter = _ref.filesAdapter;
    var push = _ref.push;
    var loggerAdapter = _ref.loggerAdapter;
    var jsonLogs = _ref.jsonLogs;
    var logsFolder = _ref.logsFolder;
    var databaseURI = _ref.databaseURI;
    var databaseOptions = _ref.databaseOptions;
    var databaseAdapter = _ref.databaseAdapter;
    var cloud = _ref.cloud;
    var _ref$collectionPrefix = _ref.collectionPrefix;
    var collectionPrefix = _ref$collectionPrefix === undefined ? '' : _ref$collectionPrefix;
    var clientKey = _ref.clientKey;
    var javascriptKey = _ref.javascriptKey;
    var dotNetKey = _ref.dotNetKey;
    var restAPIKey = _ref.restAPIKey;
    var webhookKey = _ref.webhookKey;
    var _ref$fileKey = _ref.fileKey;
    var fileKey = _ref$fileKey === undefined ? undefined : _ref$fileKey;
    var _ref$facebookAppIds = _ref.facebookAppIds;
    var facebookAppIds = _ref$facebookAppIds === undefined ? [] : _ref$facebookAppIds;
    var _ref$enableAnonymousU = _ref.enableAnonymousUsers;
    var enableAnonymousUsers = _ref$enableAnonymousU === undefined ? true : _ref$enableAnonymousU;
    var _ref$allowClientClass = _ref.allowClientClassCreation;
    var allowClientClassCreation = _ref$allowClientClass === undefined ? true : _ref$allowClientClass;
    var _ref$oauth = _ref.oauth;
    var oauth = _ref$oauth === undefined ? {} : _ref$oauth;
    var _ref$serverURL = _ref.serverURL;
    var serverURL = _ref$serverURL === undefined ? (0, _requiredParameter2.default)('You must provide a serverURL!') : _ref$serverURL;
    var _ref$maxUploadSize = _ref.maxUploadSize;
    var maxUploadSize = _ref$maxUploadSize === undefined ? '20mb' : _ref$maxUploadSize;
    var _ref$verifyUserEmails = _ref.verifyUserEmails;
    var verifyUserEmails = _ref$verifyUserEmails === undefined ? false : _ref$verifyUserEmails;
    var _ref$preventLoginWith = _ref.preventLoginWithUnverifiedEmail;
    var preventLoginWithUnverifiedEmail = _ref$preventLoginWith === undefined ? false : _ref$preventLoginWith;
    var emailVerifyTokenValidityDuration = _ref.emailVerifyTokenValidityDuration;
    var cacheAdapter = _ref.cacheAdapter;
    var emailAdapter = _ref.emailAdapter;
    var publicServerURL = _ref.publicServerURL;
    var _ref$customPages = _ref.customPages;
    var customPages = _ref$customPages === undefined ? {
      invalidLink: undefined,
      verifyEmailSuccess: undefined,
      choosePassword: undefined,
      passwordResetSuccess: undefined
    } : _ref$customPages;
    var _ref$liveQuery = _ref.liveQuery;
    var liveQuery = _ref$liveQuery === undefined ? {} : _ref$liveQuery;
    var _ref$sessionLength = _ref.sessionLength;
    var sessionLength = _ref$sessionLength === undefined ? 31536000 : _ref$sessionLength;
    var _ref$expireInactiveSe = _ref.expireInactiveSessions;
    var expireInactiveSessions = _ref$expireInactiveSe === undefined ? true : _ref$expireInactiveSe;
    var _ref$verbose = _ref.verbose;
    var verbose = _ref$verbose === undefined ? false : _ref$verbose;
    var _ref$revokeSessionOnP = _ref.revokeSessionOnPasswordReset;
    var revokeSessionOnPasswordReset = _ref$revokeSessionOnP === undefined ? true : _ref$revokeSessionOnP;
    var _ref$schemaCacheTTL = _ref.schemaCacheTTL;
    var schemaCacheTTL = _ref$schemaCacheTTL === undefined ? 5 : _ref$schemaCacheTTL;
    var _ref$__indexBuildComp = _ref.__indexBuildCompletionCallbackForTests;

    var __indexBuildCompletionCallbackForTests = _ref$__indexBuildComp === undefined ? function () {} : _ref$__indexBuildComp;

    _classCallCheck(this, ParseServer);

    // Initialize the node client SDK automatically
    Parse.initialize(appId, javascriptKey || 'unused', masterKey);
    Parse.serverURL = serverURL;
    if ((databaseOptions || databaseURI || collectionPrefix !== '') && databaseAdapter) {
      throw 'You cannot specify both a databaseAdapter and a databaseURI/databaseOptions/connectionPrefix.';
    } else if (!databaseAdapter) {
      databaseAdapter = new _MongoStorageAdapter2.default({
        uri: databaseURI,
        collectionPrefix: collectionPrefix,
        mongoOptions: databaseOptions
      });
    } else {
      databaseAdapter = (0, _AdapterLoader.loadAdapter)(databaseAdapter);
    }

    if (!filesAdapter && !databaseURI) {
      throw 'When using an explicit database adapter, you must also use and explicit filesAdapter.';
    }

    if (logsFolder) {
      (0, _logger.configureLogger)({ logsFolder: logsFolder, jsonLogs: jsonLogs });
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

    if (verbose || process.env.VERBOSE || process.env.VERBOSE_PARSE_SERVER) {
      (0, _logger.configureLogger)({ level: 'silly', jsonLogs: jsonLogs });
    }

    var filesControllerAdapter = (0, _AdapterLoader.loadAdapter)(filesAdapter, function () {
      return new _GridStoreAdapter.GridStoreAdapter(databaseURI);
    });
    // Pass the push options too as it works with the default
    var pushControllerAdapter = (0, _AdapterLoader.loadAdapter)(push && push.adapter, _parseServerPushAdapter2.default, push || {});
    var loggerControllerAdapter = (0, _AdapterLoader.loadAdapter)(loggerAdapter, _FileLoggerAdapter.FileLoggerAdapter);
    var emailControllerAdapter = (0, _AdapterLoader.loadAdapter)(emailAdapter);
    var cacheControllerAdapter = (0, _AdapterLoader.loadAdapter)(cacheAdapter, _InMemoryCacheAdapter.InMemoryCacheAdapter, { appId: appId });
    var analyticsControllerAdapter = (0, _AdapterLoader.loadAdapter)(analyticsAdapter, _AnalyticsAdapter.AnalyticsAdapter);

    // We pass the options and the base class for the adatper,
    // Note that passing an instance would work too
    var filesController = new _FilesController.FilesController(filesControllerAdapter, appId);
    var pushController = new _PushController.PushController(pushControllerAdapter, appId, push);
    var loggerController = new _LoggerController.LoggerController(loggerControllerAdapter, appId);
    var userController = new _UserController.UserController(emailControllerAdapter, appId, { verifyUserEmails: verifyUserEmails });
    var liveQueryController = new _LiveQueryController.LiveQueryController(liveQuery);
    var cacheController = new _CacheController.CacheController(cacheControllerAdapter, appId);
    var databaseController = new _DatabaseController2.default(databaseAdapter, new _SchemaCache2.default(cacheController, schemaCacheTTL));
    var hooksController = new _HooksController.HooksController(appId, databaseController, webhookKey);
    var analyticsController = new _AnalyticsController.AnalyticsController(analyticsControllerAdapter);

    // TODO: create indexes on first creation of a _User object. Otherwise it's impossible to
    // have a Parse app without it having a _User collection.
    var userClassPromise = databaseController.loadSchema().then(function (schema) {
      return schema.enforceClassExists('_User');
    });

    var usernameUniqueness = userClassPromise.then(function () {
      return databaseController.adapter.ensureUniqueness('_User', requiredUserFields, ['username']);
    }).catch(function (error) {
      _logger.logger.warn('Unable to ensure uniqueness for usernames: ', error);
      return Promise.reject(error);
    });

    var emailUniqueness = userClassPromise.then(function () {
      return databaseController.adapter.ensureUniqueness('_User', requiredUserFields, ['email']);
    }).catch(function (error) {
      _logger.logger.warn('Unable to ensure uniqueness for user email addresses: ', error);
      return Promise.reject(error);
    });

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
      __indexBuildCompletionCallbackForTests(Promise.all([usernameUniqueness, emailUniqueness]));
    }
  }

  _createClass(ParseServer, [{
    key: 'app',
    get: function get() {
      return ParseServer.app(this.config);
    }
  }], [{
    key: 'app',
    value: function app(_ref2) {
      var _ref2$maxUploadSize = _ref2.maxUploadSize;
      var maxUploadSize = _ref2$maxUploadSize === undefined ? '20mb' : _ref2$maxUploadSize;
      var appId = _ref2.appId;

      // This app serves the Parse API directly.
      // It's the equivalent of https://api.parse.com/1 in the hosted Parse API.
      var api = express();
      //api.use("/apps", express.static(__dirname + "/public"));
      // File handling needs to be before default middlewares are applied
      api.use('/', middlewares.allowCrossDomain, new _FilesRouter.FilesRouter().getExpressRouter({
        maxUploadSize: maxUploadSize
      }));

      api.use('/', bodyParser.urlencoded({ extended: false }), new _PublicAPIRouter.PublicAPIRouter().expressApp());

      // TODO: separate this from the regular ParseServer object
      if (process.env.TESTING == 1) {
        api.use('/', require('./testing-routes').router);
      }

      api.use(bodyParser.json({ 'type': '*/*', limit: maxUploadSize }));
      api.use(middlewares.allowCrossDomain);
      api.use(middlewares.allowMethodOverride);
      api.use(middlewares.handleParseHeaders);

      var routers = [new _ClassesRouter.ClassesRouter(), new _UsersRouter.UsersRouter(), new _SessionsRouter.SessionsRouter(), new _RolesRouter.RolesRouter(), new _AnalyticsRouter.AnalyticsRouter(), new _InstallationsRouter.InstallationsRouter(), new _FunctionsRouter.FunctionsRouter(), new _SchemasRouter.SchemasRouter(), new _PushRouter.PushRouter(), new _LogsRouter.LogsRouter(), new _IAPValidationRouter.IAPValidationRouter(), new _FeaturesRouter.FeaturesRouter(), new _GlobalConfigRouter.GlobalConfigRouter(), new _PurgeRouter.PurgeRouter()];

      if (process.env.PARSE_EXPERIMENTAL_HOOKS_ENABLED || process.env.TESTING) {
        routers.push(new _HooksRouter.HooksRouter());
      }

      var routes = routers.reduce(function (memo, router) {
        return memo.concat(router.routes);
      }, []);

      var appRouter = new _PromiseRouter2.default(routes, appId);

      batch.mountOnto(appRouter);

      api.use(appRouter.expressApp());

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
      return api;
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