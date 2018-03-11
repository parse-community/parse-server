'use strict';

Object.defineProperty(exports, "__esModule", {
  value: true
});
exports.getControllers = getControllers;
exports.getLoggerController = getLoggerController;
exports.getFilesController = getFilesController;
exports.getUserController = getUserController;
exports.getCacheController = getCacheController;
exports.getAnalyticsController = getAnalyticsController;
exports.getLiveQueryController = getLiveQueryController;
exports.getDatabaseController = getDatabaseController;
exports.getHooksController = getHooksController;
exports.getPushController = getPushController;
exports.getAuthDataManager = getAuthDataManager;
exports.getDatabaseAdapter = getDatabaseAdapter;

var _Auth = require('../Adapters/Auth');

var _Auth2 = _interopRequireDefault(_Auth);

var _Options = require('../Options');

var _AdapterLoader = require('../Adapters/AdapterLoader');

var _defaults = require('../defaults');

var _defaults2 = _interopRequireDefault(_defaults);

var _url = require('url');

var _url2 = _interopRequireDefault(_url);

var _LoggerController = require('./LoggerController');

var _FilesController = require('./FilesController');

var _HooksController = require('./HooksController');

var _UserController = require('./UserController');

var _CacheController = require('./CacheController');

var _LiveQueryController = require('./LiveQueryController');

var _AnalyticsController = require('./AnalyticsController');

var _PushController = require('./PushController');

var _PushQueue = require('../Push/PushQueue');

var _PushWorker = require('../Push/PushWorker');

var _DatabaseController = require('./DatabaseController');

var _DatabaseController2 = _interopRequireDefault(_DatabaseController);

var _SchemaCache = require('./SchemaCache');

var _SchemaCache2 = _interopRequireDefault(_SchemaCache);

var _GridStoreAdapter = require('../Adapters/Files/GridStoreAdapter');

var _WinstonLoggerAdapter = require('../Adapters/Logger/WinstonLoggerAdapter');

var _InMemoryCacheAdapter = require('../Adapters/Cache/InMemoryCacheAdapter');

var _AnalyticsAdapter = require('../Adapters/Analytics/AnalyticsAdapter');

var _MongoStorageAdapter = require('../Adapters/Storage/Mongo/MongoStorageAdapter');

var _MongoStorageAdapter2 = _interopRequireDefault(_MongoStorageAdapter);

var _PostgresStorageAdapter = require('../Adapters/Storage/Postgres/PostgresStorageAdapter');

var _PostgresStorageAdapter2 = _interopRequireDefault(_PostgresStorageAdapter);

var _pushAdapter = require('@parse/push-adapter');

var _pushAdapter2 = _interopRequireDefault(_pushAdapter);

function _interopRequireDefault(obj) { return obj && obj.__esModule ? obj : { default: obj }; }

function getControllers(options) {
  const loggerController = getLoggerController(options);
  const filesController = getFilesController(options);
  const userController = getUserController(options);
  const {
    pushController,
    hasPushScheduledSupport,
    hasPushSupport,
    pushControllerQueue,
    pushWorker
  } = getPushController(options);
  const cacheController = getCacheController(options);
  const analyticsController = getAnalyticsController(options);
  const liveQueryController = getLiveQueryController(options);
  const databaseController = getDatabaseController(options, cacheController);
  const hooksController = getHooksController(options, databaseController);
  const authDataManager = getAuthDataManager(options);
  return {
    loggerController,
    filesController,
    userController,
    pushController,
    hasPushScheduledSupport,
    hasPushSupport,
    pushWorker,
    pushControllerQueue,
    analyticsController,
    cacheController,
    liveQueryController,
    databaseController,
    hooksController,
    authDataManager
  };
}

// Adapters

// Controllers
function getLoggerController(options) {
  const {
    appId,
    jsonLogs,
    logsFolder,
    verbose,
    logLevel,
    silent,
    loggerAdapter
  } = options;
  const loggerOptions = { jsonLogs, logsFolder, verbose, logLevel, silent };
  const loggerControllerAdapter = (0, _AdapterLoader.loadAdapter)(loggerAdapter, _WinstonLoggerAdapter.WinstonLoggerAdapter, loggerOptions);
  return new _LoggerController.LoggerController(loggerControllerAdapter, appId, loggerOptions);
}

function getFilesController(options) {
  const {
    appId,
    databaseURI,
    filesAdapter,
    databaseAdapter
  } = options;
  if (!filesAdapter && databaseAdapter) {
    throw 'When using an explicit database adapter, you must also use an explicit filesAdapter.';
  }
  const filesControllerAdapter = (0, _AdapterLoader.loadAdapter)(filesAdapter, () => {
    return new _GridStoreAdapter.GridStoreAdapter(databaseURI);
  });
  return new _FilesController.FilesController(filesControllerAdapter, appId);
}

function getUserController(options) {
  const {
    appId,
    emailAdapter,
    verifyUserEmails
  } = options;
  const emailControllerAdapter = (0, _AdapterLoader.loadAdapter)(emailAdapter);
  return new _UserController.UserController(emailControllerAdapter, appId, { verifyUserEmails });
}

function getCacheController(options) {
  const {
    appId,
    cacheAdapter,
    cacheTTL,
    cacheMaxSize
  } = options;
  const cacheControllerAdapter = (0, _AdapterLoader.loadAdapter)(cacheAdapter, _InMemoryCacheAdapter.InMemoryCacheAdapter, { appId: appId, ttl: cacheTTL, maxSize: cacheMaxSize });
  return new _CacheController.CacheController(cacheControllerAdapter, appId);
}

function getAnalyticsController(options) {
  const {
    analyticsAdapter
  } = options;
  const analyticsControllerAdapter = (0, _AdapterLoader.loadAdapter)(analyticsAdapter, _AnalyticsAdapter.AnalyticsAdapter);
  return new _AnalyticsController.AnalyticsController(analyticsControllerAdapter);
}

function getLiveQueryController(options) {
  return new _LiveQueryController.LiveQueryController(options.liveQuery);
}

function getDatabaseController(options, cacheController) {
  const {
    databaseURI,
    databaseOptions,
    collectionPrefix,
    schemaCacheTTL,
    enableSingleSchemaCache
  } = options;
  let {
    databaseAdapter
  } = options;
  if ((databaseOptions || databaseURI && databaseURI !== _defaults2.default.databaseURI || collectionPrefix !== _defaults2.default.collectionPrefix) && databaseAdapter) {
    throw 'You cannot specify both a databaseAdapter and a databaseURI/databaseOptions/collectionPrefix.';
  } else if (!databaseAdapter) {
    databaseAdapter = getDatabaseAdapter(databaseURI, collectionPrefix, databaseOptions);
  } else {
    databaseAdapter = (0, _AdapterLoader.loadAdapter)(databaseAdapter);
  }
  return new _DatabaseController2.default(databaseAdapter, new _SchemaCache2.default(cacheController, schemaCacheTTL, enableSingleSchemaCache));
}

function getHooksController(options, databaseController) {
  const {
    appId,
    webhookKey
  } = options;
  return new _HooksController.HooksController(appId, databaseController, webhookKey);
}

function getPushController(options) {
  const {
    scheduledPush,
    push
  } = options;

  const pushOptions = Object.assign({}, push);
  const pushQueueOptions = pushOptions.queueOptions || {};
  if (pushOptions.queueOptions) {
    delete pushOptions.queueOptions;
  }

  // Pass the push options too as it works with the default
  const pushAdapter = (0, _AdapterLoader.loadAdapter)(pushOptions && pushOptions.adapter, _pushAdapter2.default, pushOptions);
  // We pass the options and the base class for the adatper,
  // Note that passing an instance would work too
  const pushController = new _PushController.PushController();
  const hasPushSupport = !!(pushAdapter && push);
  const hasPushScheduledSupport = hasPushSupport && scheduledPush === true;

  const {
    disablePushWorker
  } = pushQueueOptions;

  const pushControllerQueue = new _PushQueue.PushQueue(pushQueueOptions);
  let pushWorker;
  if (!disablePushWorker) {
    pushWorker = new _PushWorker.PushWorker(pushAdapter, pushQueueOptions);
  }
  return {
    pushController,
    hasPushSupport,
    hasPushScheduledSupport,
    pushControllerQueue,
    pushWorker
  };
}

function getAuthDataManager(options) {
  const {
    auth,
    enableAnonymousUsers
  } = options;
  return (0, _Auth2.default)(auth, enableAnonymousUsers);
}

function getDatabaseAdapter(databaseURI, collectionPrefix, databaseOptions) {
  let protocol;
  try {
    const parsedURI = _url2.default.parse(databaseURI);
    protocol = parsedURI.protocol ? parsedURI.protocol.toLowerCase() : null;
  } catch (e) {/* */}
  switch (protocol) {
    case 'postgres:':
      return new _PostgresStorageAdapter2.default({
        uri: databaseURI,
        collectionPrefix,
        databaseOptions
      });
    default:
      return new _MongoStorageAdapter2.default({
        uri: databaseURI,
        collectionPrefix,
        mongoOptions: databaseOptions
      });
  }
}