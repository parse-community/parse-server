import authDataManager          from '../Adapters/Auth';
import { ParseServerOptions }   from '../Options';
import { loadAdapter }          from '../Adapters/AdapterLoader';
import defaults                 from '../defaults';
import url                      from 'url';
// Controllers
import { LoggerController }     from './LoggerController';
import { FilesController }      from './FilesController';
import { HooksController }      from './HooksController';
import { UserController }       from './UserController';
import { CacheController }      from './CacheController';
import { LiveQueryController }  from './LiveQueryController';
import { AnalyticsController }  from './AnalyticsController';
import { PushController }       from './PushController';
import { PushQueue }            from '../Push/PushQueue';
import { PushWorker }           from '../Push/PushWorker';
import DatabaseController       from './DatabaseController';
import SchemaCache              from './SchemaCache';

// Adapters
import { GridStoreAdapter }     from '../Adapters/Files/GridStoreAdapter';
import { WinstonLoggerAdapter } from '../Adapters/Logger/WinstonLoggerAdapter';
import { InMemoryCacheAdapter } from '../Adapters/Cache/InMemoryCacheAdapter';
import { AnalyticsAdapter }     from '../Adapters/Analytics/AnalyticsAdapter';
import MongoStorageAdapter      from '../Adapters/Storage/Mongo/MongoStorageAdapter';
import PostgresStorageAdapter   from '../Adapters/Storage/Postgres/PostgresStorageAdapter';
import ParsePushAdapter         from '@parse/push-adapter';

export function getControllers(options: ParseServerOptions) {
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
    authDataManager,
  };
}

export function getLoggerController(options: ParseServerOptions): LoggerController {
  const {
    appId,
    jsonLogs,
    logsFolder,
    verbose,
    logLevel,
    silent,
    loggerAdapter,
  } = options;
  const loggerOptions = { jsonLogs, logsFolder, verbose, logLevel, silent };
  const loggerControllerAdapter = loadAdapter(loggerAdapter, WinstonLoggerAdapter, loggerOptions);
  return new LoggerController(loggerControllerAdapter, appId, loggerOptions);
}

export function getFilesController(options: ParseServerOptions): FilesController {
  const {
    appId,
    databaseURI,
    filesAdapter,
    databaseAdapter,
  } = options;
  if (!filesAdapter && databaseAdapter) {
    throw 'When using an explicit database adapter, you must also use an explicit filesAdapter.';
  }
  const filesControllerAdapter = loadAdapter(filesAdapter, () => {
    return new GridStoreAdapter(databaseURI);
  });
  return new FilesController(filesControllerAdapter, appId);
}

export function getUserController(options: ParseServerOptions): UserController {
  const {
    appId,
    emailAdapter,
    verifyUserEmails,
  } = options;
  const emailControllerAdapter = loadAdapter(emailAdapter);
  return new UserController(emailControllerAdapter, appId, { verifyUserEmails });
}

export function getCacheController(options: ParseServerOptions): CacheController {
  const {
    appId,
    cacheAdapter,
    cacheTTL,
    cacheMaxSize,
  } = options;
  const cacheControllerAdapter = loadAdapter(cacheAdapter, InMemoryCacheAdapter, {appId: appId, ttl: cacheTTL, maxSize: cacheMaxSize });
  return new CacheController(cacheControllerAdapter, appId);
}

export function getAnalyticsController(options: ParseServerOptions): AnalyticsController {
  const {
    analyticsAdapter,
  } = options;
  const analyticsControllerAdapter = loadAdapter(analyticsAdapter, AnalyticsAdapter);
  return new AnalyticsController(analyticsControllerAdapter);
}

export function getLiveQueryController(options: ParseServerOptions): LiveQueryController {
  return new LiveQueryController(options.liveQuery);
}

export function getDatabaseController(options: ParseServerOptions, cacheController: CacheController): DatabaseController {
  const {
    databaseURI,
    databaseOptions,
    collectionPrefix,
    schemaCacheTTL,
    enableSingleSchemaCache,
  } = options;
  let {
    databaseAdapter
  } = options;
  if ((databaseOptions || (databaseURI && databaseURI !== defaults.databaseURI) || collectionPrefix !== defaults.collectionPrefix) && databaseAdapter) {
    throw 'You cannot specify both a databaseAdapter and a databaseURI/databaseOptions/collectionPrefix.';
  } else if (!databaseAdapter) {
    databaseAdapter = getDatabaseAdapter(databaseURI, collectionPrefix, databaseOptions)
  } else {
    databaseAdapter = loadAdapter(databaseAdapter)
  }
  return new DatabaseController(databaseAdapter, new SchemaCache(cacheController, schemaCacheTTL, enableSingleSchemaCache));
}

export function getHooksController(options: ParseServerOptions, databaseController: DatabaseController): HooksController {
  const {
    appId,
    webhookKey
  } = options;
  return new HooksController(appId, databaseController, webhookKey);
}

interface PushControlling {
  pushController: PushController,
  hasPushScheduledSupport: boolean,
  pushControllerQueue: PushQueue,
  pushWorker: PushWorker
}

export function getPushController(options: ParseServerOptions): PushControlling {
  const {
    scheduledPush,
    push,
  } = options;

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
  return {
    pushController,
    hasPushSupport,
    hasPushScheduledSupport,
    pushControllerQueue,
    pushWorker
  }
}

export function getAuthDataManager(options: ParseServerOptions) {
  const {
    auth,
    enableAnonymousUsers
  } = options;
  return authDataManager(auth, enableAnonymousUsers)
}

export function getDatabaseAdapter(databaseURI, collectionPrefix, databaseOptions) {
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

