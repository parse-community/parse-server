// @flow
import defaults from './defaults';
import { DefaultMongoURI } from './defaults';

export interface ParseServerOptions {
  appId: string;
  masterKey: string;
  serverURL: string;
  masterKeyIps: ?[string];
  appName: ?string;
  analyticsAdapter: ?any;
  filesAdapter: ?any;
  push: ?any;
  scheduledPush: ?boolean;
  loggerAdapter: ?any;
  jsonLogs: ?boolean;
  logsFolder: ?string;
  verbose: ?boolean;
  logLevel: ?string;
  silent: ?boolean;
  databaseURI: string;
  databaseOptions: ?any;
  databaseAdapter: ?any;
  cloud: ?any;
  collectionPrefix: ?string;
  clientKey: ?string;
  javascriptKey: ?string;
  dotNetKey: ?string;
  restAPIKey: ?string;
  webhookKey: ?string;
  fileKey: ?string;
  userSensitiveFields: ?[string];
  enableAnonymousUsers: ?boolean;
  allowClientClassCreation: ?boolean;
  oauth: ?any;
  auth: ?any;
  maxUploadSize: ?string;
  verifyUserEmails: ?boolean;
  preventLoginWithUnverifiedEmail: ?boolean;
  emailVerifyTokenValidityDuration: ?number;
  accountLockout: ?any;
  passwordPolicy: ?any;
  cacheAdapter: ?any;
  emailAdapter: ?any;
  publicServerURL: ?string;
  customPages: ?CustomPagesOptions;
  liveQuery: ?LiveQueryOptions;
  sessionLength: ?number; // 1 Year in seconds
  maxLimit: ?number;
  expireInactiveSessions: ?boolean;
  revokeSessionOnPasswordReset: ?boolean;
  schemaCacheTTL: ?number; // cache for 5s
  cacheTTL: ?number; // cache for 5s
  cacheMaxSize : ?number; // 10000
  enableSingleSchemaCache: ?boolean;
  objectIdSize: ?number;
  __indexBuildCompletionCallbackForTests: ?()=>void;
}

export interface CustomPagesOptions {
  invalidLink: ?string;
  verifyEmailSuccess: ?string;
  choosePassword: ?string;
  passwordResetSuccess: ?string;
}

export interface PubSubOptions {
  redisURL: ?string,
  pubSubAdapter: ?any,
}

export interface LiveQueryOptions extends PubSubOptions {
  classNames: ?[string],
}

export interface LiveQueryServerOptions extends PubSubOptions {
  appId: ?string,
  masterKey: ?string,
  serverURL: ?string,
  keyPairs: ?any,
  websocketTimeout: ?number,
  cacheTimeout: ?number,
  logLevel: ?string,
  port: ?number
}

export function mergeWithDefaults(options: ParseServerOptions): ParseServerOptions {
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

export { DefaultMongoURI };
