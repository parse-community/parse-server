// @flow
type Adapter = string|any;
type NumberOrBoolean = number|boolean;

export interface ParseServerOptions {
  /* Your Parse Application ID
  :ENV: PARSE_SERVER_APPLICATION_ID */
  appId: string;
  /* Your Parse Master Key */
  masterKey: string;
  /* URL to your parse server with http:// or https://.
  :ENV: PARSE_SERVER_URL */
  serverURL: string;
  /* Restrict masterKey to be used by only these ips. defaults to [] (allow all ips) */
  masterKeyIps: ?string[]; // = []
  /* Sets the app name */
  appName: ?string;
  /* Adapter module for the analytics */
  analyticsAdapter: ?Adapter;
  /* Adapter module for the files sub-system */
  filesAdapter: ?Adapter;
  /* Configuration for push, as stringified JSON. See http://docs.parseplatform.org/parse-server/guide/#push-notifications */
  push: ?any;
  /* Configuration for push scheduling. Defaults to false. */
  scheduledPush: ?boolean; // = false
  /* Adapter module for the logging sub-system */
  loggerAdapter: ?Adapter;
  /* Log as structured JSON objects
  :ENV: JSON_LOGS */
  jsonLogs: ?boolean;
  /* Folder for the logs (defaults to './logs'); set to null to disable file based logging
  :ENV: PARSE_SERVER_LOGS_FOLDER */
  logsFolder: ?string; // = ./logs
  /* Set the logging to verbose
  :ENV: VERBOSE */
  verbose: ?boolean;
  /* Sets the level for logs */
  logLevel: ?string;
  /* Disables console output
  :ENV: SILENT */
  silent: ?boolean;
  /* The full URI to your mongodb database */
  databaseURI: string; // = mongodb://localhost:27017/parse
  /* Options to pass to the mongodb client */
  databaseOptions: ?any;
  /* Adapter module for the database */
  databaseAdapter: ?Adapter;
  /* Full path to your cloud code main.js */
  cloud: ?string;
  /* A collection prefix for the classes */
  collectionPrefix: ?string; // = ''
  /* Key for iOS, MacOS, tvOS clients */
  clientKey: ?string;
  /* Key for the Javascript SDK */
  javascriptKey: ?string;
  /* Key for Unity and .Net SDK */
  dotNetKey: ?string;
  /* Key for REST calls
  :ENV: PARSE_SERVER_REST_API_KEY */
  restAPIKey: ?string;
  /* Read-only key, which has the same capabilities as MasterKey without writes */
  readOnlyMasterKey: ?string;
  /* Key sent with outgoing webhook calls */
  webhookKey: ?string;
  /* Key for your files */
  fileKey: ?string;
  /* Personally identifiable information fields in the user table the should be removed for non-authorized users. */
  userSensitiveFields: ?string[]; // = ["email"]
  /* Enable (or disable) anon users, defaults to true
  :ENV: PARSE_SERVER_ENABLE_ANON_USERS */
  enableAnonymousUsers: ?boolean; // = true
  /* Enable (or disable) client class creation, defaults to true
  :ENV: PARSE_SERVER_ALLOW_CLIENT_CLASS_CREATION */
  allowClientClassCreation: ?boolean; // = true
  /* Configuration for your authentication providers, as stringified JSON. See http://docs.parseplatform.org/parse-server/guide/#oauth-and-3rd-party-authentication
  :ENV: PARSE_SERVER_AUTH_PROVIDERS */
  auth: ?any;
  /* Max file size for uploads. defaults to 20mb */
  maxUploadSize: ?string; // = 20mb
  /* Enable (or disable) user email validation, defaults to false */
  verifyUserEmails: ?boolean; // = false
  /* Prevent user from login if email is not verified and PARSE_SERVER_VERIFY_USER_EMAILS is true, defaults to false */
  preventLoginWithUnverifiedEmail: ?boolean; // = false
  /* Email verification token validity duration */
  emailVerifyTokenValidityDuration: ?number;
  /* account lockout policy for failed login attempts */
  accountLockout: ?any;
  /* Password policy for enforcing password related rules */
  passwordPolicy: ?any;
  /* Adapter module for the cache */
  cacheAdapter: ?Adapter;
  /* Adapter module for the email sending */
  emailAdapter: ?Adapter;
  /* Public URL to your parse server with http:// or https://.
  :ENV: PARSE_PUBLIC_SERVER_URL */
  publicServerURL: ?string;
  /* custom pages for password validation and reset */
  customPages: ?CustomPagesOptions; // = {}
  /* parse-server's LiveQuery configuration object */
  liveQuery: ?LiveQueryOptions;
  /* Session duration, in seconds, defaults to 1 year */
  sessionLength: ?number; // = 31536000
  /* Max value for limit option on queries, defaults to unlimited */
  maxLimit: ?number;
  /* Sets wether we should expire the inactive sessions, defaults to true */
  expireInactiveSessions: ?boolean; // = true
  /* When a user changes their password, either through the reset password email or while logged in, all sessions are revoked if this is true. Set to false if you don't want to revoke sessions. */
  revokeSessionOnPasswordReset: ?boolean; // = true
  /* The TTL for caching the schema for optimizing read/write operations. You should put a long TTL when your DB is in production. default to 5000; set 0 to disable. */
  schemaCacheTTL: ?number; // = 5000
  /* Sets the TTL for the in memory cache (in ms), defaults to 5000 (5 seconds) */
  cacheTTL: ?number; // = 5000
  /* Sets the maximum size for the in memory cache, defaults to 10000 */
  cacheMaxSize : ?number; // = 10000
  /* Use a single schema cache shared across requests. Reduces number of queries made to _SCHEMA. Defaults to false, i.e. unique schema cache per request. */
  enableSingleSchemaCache: ?boolean; // = false
  /* Sets the number of characters in generated object id's, default 10 */
  objectIdSize: ?number; // = 10
  /* The port to run the ParseServer. defaults to 1337.
  :ENV: PORT */
  port: ?number; // = 1337
  /* The host to serve ParseServer on. defaults to 0.0.0.0 */
  host: ?string; // = 0.0.0.0
  /* Mount path for the server, defaults to /parse */
  mountPath: ?string; // = /parse
  /* Run with cluster, optionally set the number of processes default to os.cpus().length */
  cluster: ?NumberOrBoolean;
  /* middleware for express server, can be string or function */
  middleware: ?((()=>void)|string);
  /* Starts the liveQuery server */
  startLiveQueryServer: ?boolean;
  /* Live query server configuration options (will start the liveQuery server) */
  liveQueryServerOptions: ?LiveQueryServerOptions;

  __indexBuildCompletionCallbackForTests: ?()=>void;
}

export interface CustomPagesOptions {
  /* invalid link page path */
  invalidLink: ?string;
  /* verify email success page path */
  verifyEmailSuccess: ?string;
  /* choose password page path */
  choosePassword: ?string;
  /* password reset success page path */
  passwordResetSuccess: ?string;
}

export interface LiveQueryOptions {
  /* parse-server's LiveQuery classNames
  :ENV: PARSE_SERVER_LIVEQUERY_CLASSNAMES */
  classNames: ?string[],
  /* parse-server's LiveQuery redisURL */
  redisURL: ?string,
  /* LiveQuery pubsub adapter */
  pubSubAdapter: ?Adapter,
}

export interface LiveQueryServerOptions {
  /* This string should match the appId in use by your Parse Server. If you deploy the LiveQuery server alongside Parse Server, the LiveQuery server will try to use the same appId.*/
  appId: ?string,
  /* This string should match the masterKey in use by your Parse Server. If you deploy the LiveQuery server alongside Parse Server, the LiveQuery server will try to use the same masterKey.*/
  masterKey: ?string,
  /* This string should match the serverURL in use by your Parse Server. If you deploy the LiveQuery server alongside Parse Server, the LiveQuery server will try to use the same serverURL.*/
  serverURL: ?string,
  /* A JSON object that serves as a whitelist of keys. It is used for validating clients when they try to connect to the LiveQuery server. Check the following Security section and our protocol specification for details.*/
  keyPairs: ?any,
  /* Number of milliseconds between ping/pong frames. The WebSocket server sends ping/pong frames to the clients to keep the WebSocket alive. This value defines the interval of the ping/pong frame from the server to clients. Defaults to 10 * 1000 ms (10 s).*/
  websocketTimeout: ?number,
  /* Number in milliseconds. When clients provide the sessionToken to the LiveQuery server, the LiveQuery server will try to fetch its ParseUser's objectId from parse server and store it in the cache. The value defines the duration of the cache. Check the following Security section and our protocol specification for details. Defaults to 30 * 24 * 60 * 60 * 1000 ms (~30 days).*/
  cacheTimeout: ?number,
  /* This string defines the log level of the LiveQuery server. We support VERBOSE, INFO, ERROR, NONE. Defaults to INFO.*/
  logLevel: ?string,
  /* The port to run the ParseServer. defaults to 1337.*/
  port: ?number, // = 1337
  /* parse-server's LiveQuery redisURL */
  redisURL: ?string,
  /* LiveQuery pubsub adapter */
  pubSubAdapter: ?Adapter,
}
