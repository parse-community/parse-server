import { AnalyticsAdapter } from '../Adapters/Analytics/AnalyticsAdapter';
import { FilesAdapter } from '../Adapters/Files/FilesAdapter';
import { LoggerAdapter } from '../Adapters/Logger/LoggerAdapter';
import { StorageAdapter } from '../Adapters/Storage/StorageAdapter';
import { CacheAdapter } from '../Adapters/Cache/CacheAdapter';
import { MailAdapter } from '../Adapters/Email/MailAdapter';
import { PubSubAdapter } from '../Adapters/PubSub/PubSubAdapter';
import { WSSAdapter } from '../Adapters/WebSocketServer/WSSAdapter';

// @flow
type Adapter<T> = string | any | T;
type NumberOrBoolean = number | boolean;
type ProtectedFields = any;

export interface ParseServerOptions {
  /* Your Parse Application ID
  :ENV: PARSE_SERVER_APPLICATION_ID */
  appId: string;
  /* Your Parse Master Key */
  masterKey: string;
  /* URL to your parse server with http:// or https://.
  :ENV: PARSE_SERVER_URL */
  serverURL: string;
  /* Restrict masterKey to be used by only these ips, defaults to [] (allow all ips)
  :DEFAULT: [] */
  masterKeyIps: ?(string[]);
  /* Sets the app name */
  appName: ?string;
  /* Adapter module for the analytics */
  analyticsAdapter: ?Adapter<AnalyticsAdapter>;
  /* Adapter module for the files sub-system */
  filesAdapter: ?Adapter<FilesAdapter>;
  /* Configuration for push, as stringified JSON. See http://docs.parseplatform.org/parse-server/guide/#push-notifications */
  push: ?any;
  /* Configuration for push scheduling, defaults to false.
  :DEFAULT: false */
  scheduledPush: ?boolean;
  /* Adapter module for the logging sub-system */
  loggerAdapter: ?Adapter<LoggerAdapter>;
  /* Log as structured JSON objects
  :ENV: JSON_LOGS */
  jsonLogs: ?boolean;
  /* Folder for the logs (defaults to './logs'); set to null to disable file based logging
  :ENV: PARSE_SERVER_LOGS_FOLDER
  :DEFAULT: ./logs */
  logsFolder: ?string;
  /* Set the logging to verbose
  :ENV: VERBOSE */
  verbose: ?boolean;
  /* Sets the level for logs */
  logLevel: ?string;
  /* Disables console output
  :ENV: SILENT */
  silent: ?boolean;
  /* The full URI to your database. Supported databases are mongodb or postgres.
  :DEFAULT: mongodb://localhost:27017/parse */
  databaseURI: string;
  /* Options to pass to the mongodb client */
  databaseOptions: ?any;
  /* Adapter module for the database */
  databaseAdapter: ?Adapter<StorageAdapter>;
  /* Circumvent Parse workaround for historical MongoDB bug SERVER-13732
  :ENV: PARSE_SKIP_MONGODB_SERVER_13732_WORKAROUND
  :DEFAULT: false */
  skipMongoDBServer13732Workaround: ?boolean;
  /* Full path to your cloud code main.js */
  cloud: ?string;
  /* A collection prefix for the classes
  :DEFAULT: '' */
  collectionPrefix: ?string;
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
  /* Enable (or disable) the addition of a unique hash to the file names
  :ENV: PARSE_SERVER_PRESERVE_FILE_NAME
  :DEFAULT: false */
  preserveFileName: ?boolean;
  /* Personally identifiable information fields in the user table the should be removed for non-authorized users. Deprecated @see protectedFields */
  userSensitiveFields: ?(string[]);
  /* Protected fields that should be treated with extra security when fetching details.
  :DEFAULT: {"_User": {"*": ["email"]}} */
  protectedFields: ?ProtectedFields;
  /* Enable (or disable) anon users, defaults to true
  :ENV: PARSE_SERVER_ENABLE_ANON_USERS
  :DEFAULT: true */
  enableAnonymousUsers: ?boolean;
  /* Enable (or disable) client class creation, defaults to true
  :ENV: PARSE_SERVER_ALLOW_CLIENT_CLASS_CREATION
  :DEFAULT: true */
  allowClientClassCreation: ?boolean;
  /* Configuration for your authentication providers, as stringified JSON. See http://docs.parseplatform.org/parse-server/guide/#oauth-and-3rd-party-authentication
  :ENV: PARSE_SERVER_AUTH_PROVIDERS */
  auth: ?any;
  /* Max file size for uploads, defaults to 20mb
  :DEFAULT: 20mb */
  maxUploadSize: ?string;
  /* Enable (or disable) user email validation, defaults to false
  :DEFAULT: false */
  verifyUserEmails: ?boolean;
  /* Prevent user from login if email is not verified and PARSE_SERVER_VERIFY_USER_EMAILS is true, defaults to false
  :DEFAULT: false */
  preventLoginWithUnverifiedEmail: ?boolean;
  /* Email verification token validity duration, in seconds */
  emailVerifyTokenValidityDuration: ?number;
  /* account lockout policy for failed login attempts */
  accountLockout: ?any;
  /* Password policy for enforcing password related rules */
  passwordPolicy: ?any;
  /* Adapter module for the cache */
  cacheAdapter: ?Adapter<CacheAdapter>;
  /* Adapter module for email sending */
  emailAdapter: ?Adapter<MailAdapter>;
  /* Public URL to your parse server with http:// or https://.
  :ENV: PARSE_PUBLIC_SERVER_URL */
  publicServerURL: ?string;
  /* custom pages for password validation and reset
  :DEFAULT: {} */
  customPages: ?CustomPagesOptions;
  /* parse-server's LiveQuery configuration object */
  liveQuery: ?LiveQueryOptions;
  /* Session duration, in seconds, defaults to 1 year
  :DEFAULT: 31536000 */
  sessionLength: ?number;
  /* Max value for limit option on queries, defaults to unlimited */
  maxLimit: ?number;
  /* Sets wether we should expire the inactive sessions, defaults to true
  :DEFAULT: true */
  expireInactiveSessions: ?boolean;
  /* When a user changes their password, either through the reset password email or while logged in, all sessions are revoked if this is true. Set to false if you don't want to revoke sessions.
  :DEFAULT: true */
  revokeSessionOnPasswordReset: ?boolean;
  /* The TTL for caching the schema for optimizing read/write operations. You should put a long TTL when your DB is in production. default to 5000; set 0 to disable.
  :DEFAULT: 5000 */
  schemaCacheTTL: ?number;
  /* Sets the TTL for the in memory cache (in ms), defaults to 5000 (5 seconds)
  :DEFAULT: 5000 */
  cacheTTL: ?number;
  /* Sets the maximum size for the in memory cache, defaults to 10000
  :DEFAULT: 10000 */
  cacheMaxSize: ?number;
  /* Replace HTTP Interface when using JS SDK in current node runtime, defaults to false. Caution, this is an experimental feature that may not be appropriate for production.
  :ENV: PARSE_SERVER_ENABLE_EXPERIMENTAL_DIRECT_ACCESS
  :DEFAULT: false */
  directAccess: ?boolean;
  /* Use a single schema cache shared across requests. Reduces number of queries made to _SCHEMA, defaults to false, i.e. unique schema cache per request.
  :DEFAULT: false */
  enableSingleSchemaCache: ?boolean;
  /* Enables the default express error handler for all errors
  :DEFAULT: false */
  enableExpressErrorHandler: ?boolean;
  /* Sets the number of characters in generated object id's, default 10
  :DEFAULT: 10 */
  objectIdSize: ?number;
  /* The port to run the ParseServer, defaults to 1337.
  :ENV: PORT
  :DEFAULT: 1337 */
  port: ?number;
  /* The host to serve ParseServer on, defaults to 0.0.0.0
  :DEFAULT: 0.0.0.0 */
  host: ?string;
  /* Mount path for the server, defaults to /parse
  :DEFAULT: /parse */
  mountPath: ?string;
  /* Run with cluster, optionally set the number of processes default to os.cpus().length */
  cluster: ?NumberOrBoolean;
  /* middleware for express server, can be string or function */
  middleware: ?((() => void) | string);
  /* Starts the liveQuery server */
  startLiveQueryServer: ?boolean;
  /* Live query server configuration options (will start the liveQuery server) */
  liveQueryServerOptions: ?LiveQueryServerOptions;
  /* Full path to your GraphQL custom schema.graphql file */
  graphQLSchema: ?string;
  /* Mounts the GraphQL endpoint
  :ENV: PARSE_SERVER_MOUNT_GRAPHQL
  :DEFAULT: false */
  mountGraphQL: ?boolean;
  /* Mount path for the GraphQL endpoint, defaults to /graphql
  :ENV: PARSE_SERVER_GRAPHQL_PATH
  :DEFAULT: /graphql */
  graphQLPath: ?string;
  /* Mounts the GraphQL Playground - never use this option in production
  :ENV: PARSE_SERVER_MOUNT_PLAYGROUND
  :DEFAULT: false */
  mountPlayground: ?boolean;
  /* Mount path for the GraphQL Playground, defaults to /playground
  :ENV: PARSE_SERVER_PLAYGROUND_PATH
  :DEFAULT: /playground */
  playgroundPath: ?string;
  /* Callback when server has started */
  serverStartComplete: ?(error: ?Error) => void;
  /* Callback when server has closed */
  serverCloseComplete: ?() => void;
}

export interface CustomPagesOptions {
  /* invalid link page path */
  invalidLink: ?string;
  /* verify email success page path */
  verifyEmailSuccess: ?string;
  /* invalid verification link page path */
  invalidVerificationLink: ?string;
  /* verification link send success page path */
  linkSendSuccess: ?string;
  /* verification link send fail page path */
  linkSendFail: ?string;
  /* choose password page path */
  choosePassword: ?string;
  /* password reset success page path */
  passwordResetSuccess: ?string;
  /* for masking user-facing pages */
  parseFrameURL: ?string;
}

export interface LiveQueryOptions {
  /* parse-server's LiveQuery classNames
  :ENV: PARSE_SERVER_LIVEQUERY_CLASSNAMES */
  classNames: ?(string[]);
  /* parse-server's LiveQuery redisOptions */
  redisOptions: ?any;
  /* parse-server's LiveQuery redisURL */
  redisURL: ?string;
  /* LiveQuery pubsub adapter */
  pubSubAdapter: ?Adapter<PubSubAdapter>;
  /* Adapter module for the WebSocketServer */
  wssAdapter: ?Adapter<WSSAdapter>;
}

export interface LiveQueryServerOptions {
  /* This string should match the appId in use by your Parse Server. If you deploy the LiveQuery server alongside Parse Server, the LiveQuery server will try to use the same appId.*/
  appId: ?string;
  /* This string should match the masterKey in use by your Parse Server. If you deploy the LiveQuery server alongside Parse Server, the LiveQuery server will try to use the same masterKey.*/
  masterKey: ?string;
  /* This string should match the serverURL in use by your Parse Server. If you deploy the LiveQuery server alongside Parse Server, the LiveQuery server will try to use the same serverURL.*/
  serverURL: ?string;
  /* A JSON object that serves as a whitelist of keys. It is used for validating clients when they try to connect to the LiveQuery server. Check the following Security section and our protocol specification for details.*/
  keyPairs: ?any;
  /* Number of milliseconds between ping/pong frames. The WebSocket server sends ping/pong frames to the clients to keep the WebSocket alive. This value defines the interval of the ping/pong frame from the server to clients, defaults to 10 * 1000 ms (10 s).*/
  websocketTimeout: ?number;
  /* Number in milliseconds. When clients provide the sessionToken to the LiveQuery server, the LiveQuery server will try to fetch its ParseUser's objectId from parse server and store it in the cache. The value defines the duration of the cache. Check the following Security section and our protocol specification for details, defaults to 30 * 24 * 60 * 60 * 1000 ms (~30 days).*/
  cacheTimeout: ?number;
  /* This string defines the log level of the LiveQuery server. We support VERBOSE, INFO, ERROR, NONE, defaults to INFO.*/
  logLevel: ?string;
  /* The port to run the LiveQuery server, defaults to 1337.
  :DEFAULT: 1337 */
  port: ?number;
  /* parse-server's LiveQuery redisOptions */
  redisOptions: ?any;
  /* parse-server's LiveQuery redisURL */
  redisURL: ?string;
  /* LiveQuery pubsub adapter */
  pubSubAdapter: ?Adapter<PubSubAdapter>;
  /* Adapter module for the WebSocketServer */
  wssAdapter: ?Adapter<WSSAdapter>;
}
