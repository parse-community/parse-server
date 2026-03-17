import { z } from 'zod';
import { isIP } from 'net';
import { option } from '../schemaUtils';
import { SchemaOptionsSchema } from './SchemaOptions';
import { AccountLockoutOptionsSchema } from './AccountLockoutOptions';
import { PasswordPolicyOptionsSchema } from './PasswordPolicyOptions';
import { FileUploadOptionsSchema } from './FileUploadOptions';
import { IdempotencyOptionsSchema } from './IdempotencyOptions';
import { SecurityOptionsSchema } from './SecurityOptions';
import { RequestComplexityOptionsSchema } from './RequestComplexityOptions';
import { PagesOptionsSchema, CustomPagesOptionsSchema } from './PagesOptions';
import { LiveQueryOptionsSchema, LiveQueryServerOptionsSchema } from './LiveQueryOptions';
import { RateLimitOptionsSchema } from './RateLimitOptions';
import { LogLevelsSchema } from './LogLevels';
import { DatabaseOptionsSchema } from './DatabaseOptions';

/** Schema for adapter fields that accept a module path string, config object, or class instance. */
const adapterSchema = z.union([
  z.string(),
  z.record(z.string(), z.any()),
  // Deliberately permissive: adapters may be runtime class instances or other
  // non-serializable values that stricter Zod validators would reject.
  z.custom<any>(() => true),
]).optional();

/** Validates an array of IP addresses, supporting CIDR notation. */
const ipArraySchema = (fieldName: string) =>
  z.array(z.string()).refine(
    ips => {
      return ips.every(ip => {
        const bare = ip.includes('/') ? ip.split('/')[0] : ip;
        return isIP(bare);
      });
    },
    {
      message: `The option "${fieldName}" contains an invalid IP address. All entries must be valid IPv4 or IPv6 addresses, optionally with CIDR notation.`,
    }
  );

export const ParseServerOptionsSchema = z.object({
  accountLockout: option(AccountLockoutOptionsSchema.optional(), {
    env: 'PARSE_SERVER_ACCOUNT_LOCKOUT',
    help: 'Configures account lockout policy to temporarily disable login after repeated failed attempts.',
  }),
  allowClientClassCreation: option(z.boolean().default(false), {
    env: 'PARSE_SERVER_ALLOW_CLIENT_CLASS_CREATION',
    help: 'Allow clients to create new classes on the server. Disable in production to prevent schema pollution.',
  }),
  allowCustomObjectId: option(z.boolean().default(false), {
    env: 'PARSE_SERVER_ALLOW_CUSTOM_OBJECT_ID',
    help: 'Allow clients to provide a custom objectId on create, instead of auto-generating one.',
  }),
  allowExpiredAuthDataToken: option(z.boolean().default(false), {
    env: 'PARSE_SERVER_ALLOW_EXPIRED_AUTH_DATA_TOKEN',
    help: 'Allow a user to log in even if the 3rd party auth token has expired.',
  }),
  allowHeaders: option(z.array(z.string().min(1, 'Allow headers must not contain empty strings')).optional(), {
    env: 'PARSE_SERVER_ALLOW_HEADERS',
    help: 'Additional headers to allow in CORS requests, beyond the default set.',
  }),
  allowOrigin: option(z.array(z.string()).optional(), {
    env: 'PARSE_SERVER_ALLOW_ORIGIN',
    help: 'Sets the allowed origins for CORS requests to the server.',
    docType: 'String|String[]',
  }),
  analyticsAdapter: option(adapterSchema, {
    env: 'PARSE_SERVER_ANALYTICS_ADAPTER',
    help: 'Adapter module for handling analytics events from clients.',
    docType: 'Adapter<AnalyticsAdapter>',
  }),
  appId: option(z.string(), {
    env: 'PARSE_SERVER_APPLICATION_ID',
    help: 'A unique identifier for your Parse application.',
  }),
  appName: option(z.string().optional(), {
    env: 'PARSE_SERVER_APP_NAME',
    help: 'The display name of your app, used in email templates and verification links.',
  }),
  auth: option(z.record(z.string(), z.any()).optional(), {
    env: 'PARSE_SERVER_AUTH_PROVIDERS',
    help: 'Configuration for 3rd party authentication providers such as Google, Facebook, or Apple.',
  }),
  cacheAdapter: option(adapterSchema, {
    env: 'PARSE_SERVER_CACHE_ADAPTER',
    help: 'Adapter module for caching query results and schema data.',
    docType: 'Adapter<CacheAdapter>',
  }),
  cacheMaxSize: option(z.number().default(10000), {
    env: 'PARSE_SERVER_CACHE_MAX_SIZE',
    help: 'Maximum number of entries to store in the in-memory cache.',
  }),
  cacheTTL: option(z.number().default(5000), {
    env: 'PARSE_SERVER_CACHE_TTL',
    help: 'Duration in milliseconds that cached values remain valid before being refreshed.',
  }),
  clientKey: option(z.string().optional(), {
    env: 'PARSE_SERVER_CLIENT_KEY',
    help: 'Key used to authenticate requests from iOS, macOS, and tvOS clients.',
  }),
  cloud: option(z.string().optional(), {
    env: 'PARSE_SERVER_CLOUD',
    help: 'Path to the cloud code file (e.g. ./cloud/main.js) containing triggers and functions.',
  }),
  cluster: option(z.union([z.number(), z.boolean()]).optional(), {
    env: 'PARSE_SERVER_CLUSTER',
    help: 'Run Parse Server in cluster mode across multiple processes. Set to true for auto-detect or a number for specific worker count.',
    applicableTo: ['cli'],
  }),
  collectionPrefix: option(z.string().default(''), {
    env: 'PARSE_SERVER_COLLECTION_PREFIX',
    help: 'A prefix added to all database collection names, useful for shared databases.',
  }),
  convertEmailToLowercase: option(z.boolean().default(false), {
    env: 'PARSE_SERVER_CONVERT_EMAIL_TO_LOWERCASE',
    help: 'Automatically convert user email addresses to lowercase on signup and login.',
  }),
  convertUsernameToLowercase: option(z.boolean().default(false), {
    env: 'PARSE_SERVER_CONVERT_USERNAME_TO_LOWERCASE',
    help: 'Automatically convert usernames to lowercase on signup and login.',
  }),
  customPages: option(CustomPagesOptionsSchema.optional(), {
    env: 'PARSE_SERVER_CUSTOM_PAGES',
    help: 'Custom page URLs for password reset and email verification user-facing pages.',
  }),
  databaseAdapter: option(adapterSchema, {
    env: 'PARSE_SERVER_DATABASE_ADAPTER',
    help: 'Adapter module for the database connection, overrides databaseURI.',
    docType: 'Adapter<StorageAdapter>',
  }),
  databaseOptions: option(DatabaseOptionsSchema.optional(), {
    env: 'PARSE_SERVER_DATABASE_OPTIONS',
    help: 'Options passed to the MongoDB driver, such as connection pool size and TLS settings.',
  }),
  databaseURI: option(z.string().default('mongodb://localhost:27017/parse'), {
    env: 'PARSE_SERVER_DATABASE_URI',
    help: 'The full MongoDB connection URI, including host, port, and database name.',
  }),
  defaultLimit: option(z.number().min(1, 'Default limit must be a value greater than 0.').default(100), {
    env: 'PARSE_SERVER_DEFAULT_LIMIT',
    help: 'Default number of results returned per query when no limit is specified by the client.',
  }),
  directAccess: option(z.boolean().default(true), {
    env: 'PARSE_SERVER_DIRECT_ACCESS',
    help: 'Route internal Parse requests directly to the server handler, bypassing the HTTP layer for better performance.',
  }),
  dotNetKey: option(z.string().optional(), {
    env: 'PARSE_SERVER_DOT_NET_KEY',
    help: 'Key used to authenticate requests from Unity and .NET SDK clients.',
  }),
  emailAdapter: option(adapterSchema, {
    env: 'PARSE_SERVER_EMAIL_ADAPTER',
    help: 'Adapter module for sending emails, required for password reset and email verification.',
    docType: 'Adapter<MailAdapter>',
  }),
  emailVerifySuccessOnInvalidEmail: option(z.boolean().default(true), {
    env: 'PARSE_SERVER_EMAIL_VERIFY_SUCCESS_ON_INVALID_EMAIL',
    help: 'Return a success response for email verification requests even if the email address is not found.',
  }),
  emailVerifyTokenReuseIfValid: option(z.boolean().default(false), {
    env: 'PARSE_SERVER_EMAIL_VERIFY_TOKEN_REUSE_IF_VALID',
    help: 'Reuse an existing email verification token if it is still valid, instead of generating a new one.',
  }),
  emailVerifyTokenValidityDuration: option(z.number().optional(), {
    env: 'PARSE_SERVER_EMAIL_VERIFY_TOKEN_VALIDITY_DURATION',
    help: 'Duration in seconds that an email verification token remains valid.',
  }),
  enableAnonymousUsers: option(z.boolean().default(true), {
    env: 'PARSE_SERVER_ENABLE_ANON_USERS',
    help: 'Allow clients to create and use anonymous user accounts.',
  }),
  enableCollationCaseComparison: option(z.boolean().default(false), {
    env: 'PARSE_SERVER_ENABLE_COLLATION_CASE_COMPARISON',
    help: 'Use database collation for case-insensitive string comparisons in queries.',
  }),
  enableExpressErrorHandler: option(z.boolean().default(false), {
    env: 'PARSE_SERVER_ENABLE_EXPRESS_ERROR_HANDLER',
    help: 'Enable the default Express error handler for unhandled errors in middleware.',
  }),
  enableInsecureAuthAdapters: option(z.boolean().default(false), {
    env: 'PARSE_SERVER_ENABLE_INSECURE_AUTH_ADAPTERS',
    help: 'Allow legacy auth adapters that transmit sensitive data insecurely.',
  }),
  enableProductPurchaseLegacyApi: option(z.boolean().default(true), {
    env: 'PARSE_SERVER_ENABLE_PRODUCT_PURCHASE_LEGACY_API',
    help: 'Enable the deprecated in-app purchase validation API endpoints.',
  }),
  enableSanitizedErrorResponse: option(z.boolean().default(true), {
    env: 'PARSE_SERVER_ENABLE_SANITIZED_ERROR_RESPONSE',
    help: 'Strip internal error details from API responses to avoid leaking server information.',
  }),
  encryptionKey: option(z.string().optional(), {
    env: 'PARSE_SERVER_ENCRYPTION_KEY',
    help: 'A key used to encrypt files stored via the files adapter.',
  }),
  enforcePrivateUsers: option(z.boolean().default(true), {
    env: 'PARSE_SERVER_ENFORCE_PRIVATE_USERS',
    help: 'Set new user ACLs to private by default, preventing public read access to user records.',
  }),
  expireInactiveSessions: option(z.boolean().default(true), {
    env: 'PARSE_SERVER_EXPIRE_INACTIVE_SESSIONS',
    help: 'Automatically expire session tokens that have not been used within the session length.',
  }),
  extendSessionOnUse: option(z.boolean().default(false), {
    env: 'PARSE_SERVER_EXTEND_SESSION_ON_USE',
    help: 'Extend the session expiration each time the session token is used in a request.',
  }),
  fileKey: option(z.string().optional(), {
    env: 'PARSE_SERVER_FILE_KEY',
    help: 'Key used by the files adapter for file access control.',
  }),
  filesAdapter: option(adapterSchema, {
    env: 'PARSE_SERVER_FILES_ADAPTER',
    help: 'Adapter module for file storage, such as S3 or GridFS.',
    docType: 'Adapter<FilesAdapter>',
  }),
  fileUpload: option(FileUploadOptionsSchema.optional(), {
    env: 'PARSE_SERVER_FILE_UPLOAD_OPTIONS',
    help: 'Options for controlling file upload permissions and allowed file types.',
  }),
  graphQLPath: option(z.string().default('/graphql'), {
    env: 'PARSE_SERVER_GRAPHQL_PATH',
    help: 'The URL path where the GraphQL API endpoint is mounted.',
  }),
  graphQLPublicIntrospection: option(z.boolean().default(false), {
    env: 'PARSE_SERVER_GRAPHQL_PUBLIC_INTROSPECTION',
    help: 'Allow GraphQL introspection queries without requiring authentication.',
  }),
  graphQLSchema: option(z.string().optional(), {
    env: 'PARSE_SERVER_GRAPH_QLSCHEMA',
    help: 'Path to a custom GraphQL schema definition file to extend the auto-generated schema.',
  }),
  host: option(z.string().default('0.0.0.0'), {
    env: 'PARSE_SERVER_HOST',
    help: 'The hostname or IP address the server binds to.',
  }),
  idempotencyOptions: option(IdempotencyOptionsSchema.optional(), {
    env: 'PARSE_SERVER_EXPERIMENTAL_IDEMPOTENCY_OPTIONS',
    help: 'Options for request idempotency to prevent duplicate operations from retried requests.',
  }),
  javascriptKey: option(z.string().optional(), {
    env: 'PARSE_SERVER_JAVASCRIPT_KEY',
    help: 'Key used to authenticate requests from the JavaScript SDK.',
  }),
  jsonLogs: option(z.boolean().optional(), {
    env: 'JSON_LOGS',
    help: 'Output logs as structured JSON objects instead of plain text, useful for log aggregation.',
  }),
  liveQuery: option(LiveQueryOptionsSchema.optional(), {
    env: 'PARSE_SERVER_LIVE_QUERY',
    help: 'Configuration for LiveQuery, including class subscriptions and pub/sub adapter.',
  }),
  liveQueryServerOptions: option(LiveQueryServerOptionsSchema.optional(), {
    env: 'PARSE_SERVER_LIVE_QUERY_SERVER_OPTIONS',
    help: 'Options for the standalone LiveQuery server, such as port and WebSocket settings.',
  }),
  loggerAdapter: option(adapterSchema, {
    env: 'PARSE_SERVER_LOGGER_ADAPTER',
    help: 'Adapter module for custom log transport, replacing the default Winston file logger.',
    docType: 'Adapter<LoggerAdapter>',
  }),
  logLevel: option(z.string().optional(), {
    env: 'PARSE_SERVER_LOG_LEVEL',
    help: 'Sets the minimum log level for output (e.g. error, warn, info, verbose, debug, silly).',
  }),
  logLevels: option(LogLevelsSchema.optional(), {
    env: 'PARSE_SERVER_LOG_LEVELS',
    help: 'Override log levels for specific internal events like cloud function results and triggers.',
  }),
  logsFolder: option(z.string().default('./logs'), {
    env: 'PARSE_SERVER_LOGS_FOLDER',
    help: 'Directory path where log files are stored.',
  }),
  maintenanceKey: option(z.string(), {
    env: 'PARSE_SERVER_MAINTENANCE_KEY',
    help: 'A key for maintenance operations like clearing caches. Must differ from masterKey.',
  }),
  maintenanceKeyIps: option(ipArraySchema('maintenanceKeyIps').default(['127.0.0.1', '::1']), {
    env: 'PARSE_SERVER_MAINTENANCE_KEY_IPS',
    help: 'IP addresses allowed to use the maintenance key. Defaults to localhost only.',
  }),
  masterKey: option(z.union([z.string(), z.custom<Function>(v => typeof v === 'function')]), {
    env: 'PARSE_SERVER_MASTER_KEY',
    help: 'The master key grants unrestricted access to all data and operations. Keep it secret. Can be a function for rotation.',
    dynamic: true,
  }),
  masterKeyIps: option(ipArraySchema('masterKeyIps').default(['127.0.0.1', '::1']), {
    env: 'PARSE_SERVER_MASTER_KEY_IPS',
    help: 'IP addresses allowed to use the master key. Defaults to localhost only.',
  }),
  masterKeyTtl: option(z.number().optional(), {
    env: 'PARSE_SERVER_MASTER_KEY_TTL',
    help: 'Cache duration in seconds when masterKey is provided as a function.',
  }),
  maxLimit: option(z.number().min(1, 'Max limit must be a value greater than 0.').optional(), {
    env: 'PARSE_SERVER_MAX_LIMIT',
    help: 'Maximum value a client can set for query limit. Prevents excessively large result sets.',
  }),
  maxLogFiles: option(z.union([z.number(), z.string()]).optional(), {
    env: 'PARSE_SERVER_MAX_LOG_FILES',
    help: 'Maximum number of log files to retain before rotating old files.',
  }),
  maxUploadSize: option(z.string().default('20mb'), {
    env: 'PARSE_SERVER_MAX_UPLOAD_SIZE',
    help: "Maximum file upload size (e.g. '20mb', '1gb').",
  }),
  middleware: option(z.any().optional(), {
    env: 'PARSE_SERVER_MIDDLEWARE',
    help: 'Custom Express middleware function applied to all Parse Server routes.',
  }),
  mountGraphQL: option(z.boolean().default(false), {
    env: 'PARSE_SERVER_MOUNT_GRAPHQL',
    help: 'Enable the GraphQL API endpoint alongside the REST API.',
  }),
  mountPath: option(z.string().default('/parse'), {
    env: 'PARSE_SERVER_MOUNT_PATH',
    help: "The URL path where the Parse REST API is mounted (e.g. '/parse').",
  }),
  mountPlayground: option(z.boolean().default(false), {
    env: 'PARSE_SERVER_MOUNT_PLAYGROUND',
    help: 'Deprecated. Enable the GraphQL Playground IDE at the playground path.',
  }),
  objectIdSize: option(z.number().default(10), {
    env: 'PARSE_SERVER_OBJECT_ID_SIZE',
    help: 'Number of characters in auto-generated object IDs. Default is 10.',
  }),
  pages: option(PagesOptionsSchema.optional(), {
    env: 'PARSE_SERVER_PAGES',
    help: 'Configuration for server-rendered pages like password reset and email verification forms.',
  }),
  passwordPolicy: option(PasswordPolicyOptionsSchema.optional(), {
    env: 'PARSE_SERVER_PASSWORD_POLICY',
    help: 'Password policy rules such as minimum strength, history, and expiration.',
  }),
  playgroundPath: option(z.string().default('/playground'), {
    env: 'PARSE_SERVER_PLAYGROUND_PATH',
    help: 'Deprecated. URL path for the GraphQL Playground IDE.',
  }),
  port: option(z.number().default(1337), {
    env: 'PORT',
    help: 'The port number the server listens on.',
  }),
  preserveFileName: option(z.boolean().default(false), {
    env: 'PARSE_SERVER_PRESERVE_FILE_NAME',
    help: 'Keep original file names when uploading, instead of generating random names.',
  }),
  preventLoginWithUnverifiedEmail: option(z.union([z.boolean(), z.custom<Function>(v => typeof v === 'function')]).default(false), {
    env: 'PARSE_SERVER_PREVENT_LOGIN_WITH_UNVERIFIED_EMAIL',
    help: 'Reject login attempts from users whose email has not been verified. Can be a function for custom logic.',
  }),
  preventSignupWithUnverifiedEmail: option(z.boolean().default(false), {
    env: 'PARSE_SERVER_PREVENT_SIGNUP_WITH_UNVERIFIED_EMAIL',
    help: 'Reject signup attempts if the email cannot be verified.',
  }),
  protectedFields: option(z.record(z.string(), z.any()).default({ _User: { '*': ['email'] } }), {
    env: 'PARSE_SERVER_PROTECTED_FIELDS',
    help: 'Fields hidden from API responses for non-authorized users, keyed by class name and access level.',
  }),
  publicServerURL: option(z.union([
    z.string().refine(v => v.startsWith('http://') || v.startsWith('https://'), {
      message: 'publicServerURL must start with http:// or https://',
    }),
    z.custom<Function>(v => typeof v === 'function'),
  ]).optional(), {
    env: 'PARSE_PUBLIC_SERVER_URL',
    help: 'The public-facing URL of the server, used in email links and verification URLs. Must start with http:// or https://.',
    dynamic: true,
  }),
  push: option(z.record(z.string(), z.any()).optional(), {
    env: 'PARSE_SERVER_PUSH',
    help: 'Configuration for push notification providers such as APNs and FCM.',
  }),
  rateLimit: option(z.array(RateLimitOptionsSchema).default([]), {
    env: 'PARSE_SERVER_RATE_LIMIT',
    help: 'Rate limiting rules to throttle requests by IP, user, or session.',
  }),
  readOnlyMasterKey: option(z.string().optional(), {
    env: 'PARSE_SERVER_READ_ONLY_MASTER_KEY',
    help: 'A master key that only allows read operations, useful for dashboards and monitoring.',
  }),
  readOnlyMasterKeyIps: option(ipArraySchema('readOnlyMasterKeyIps').default(['0.0.0.0/0', '::0']), {
    env: 'PARSE_SERVER_READ_ONLY_MASTER_KEY_IPS',
    help: 'IP addresses allowed to use the read-only master key.',
  }),
  requestComplexity: option(RequestComplexityOptionsSchema.optional(), {
    env: 'PARSE_SERVER_REQUEST_COMPLEXITY',
    help: 'Limits on query complexity to prevent expensive operations, such as include depth and subquery nesting.',
  }),
  requestContextMiddleware: option(z.any().optional(), {
    env: 'PARSE_SERVER_REQUEST_CONTEXT_MIDDLEWARE',
    help: 'Middleware to inject custom context into every Parse request before processing.',
  }),
  requestKeywordDenylist: option(
    z.array(z.any()).default([
      { key: '_bsontype', value: 'Code' },
      { key: 'constructor' },
      { key: '__proto__' },
    ]),
    {
      env: 'PARSE_SERVER_REQUEST_KEYWORD_DENYLIST',
      help: 'Blocked keywords in request payloads to prevent injection attacks like prototype pollution.',
    }
  ),
  restAPIKey: option(z.string().optional(), {
    env: 'PARSE_SERVER_REST_API_KEY',
    help: 'Key used to authenticate REST API requests.',
  }),
  revokeSessionOnPasswordReset: option(z.boolean().default(true), {
    env: 'PARSE_SERVER_REVOKE_SESSION_ON_PASSWORD_RESET',
    help: 'Invalidate all active sessions when a user resets their password.',
  }),
  scheduledPush: option(z.boolean().default(false), {
    env: 'PARSE_SERVER_SCHEDULED_PUSH',
    help: 'Allow push notifications to be scheduled for future delivery.',
  }),
  schema: option(SchemaOptionsSchema.optional(), {
    env: 'PARSE_SERVER_SCHEMA',
    help: 'Schema migration options, including class definitions and migration callbacks.',
  }),
  security: option(SecurityOptionsSchema.optional(), {
    env: 'PARSE_SERVER_SECURITY',
    help: 'Security check options to audit the server configuration for common vulnerabilities.',
  }),
  sendUserEmailVerification: option(z.union([z.boolean(), z.custom<Function>(v => typeof v === 'function')]).default(true), {
    env: 'PARSE_SERVER_SEND_USER_EMAIL_VERIFICATION',
    help: 'Send a verification email when a user signs up or changes their email. Can be a function for custom logic.',
  }),
  serverCloseComplete: option(z.any().optional(), {
    env: 'PARSE_SERVER_SERVER_CLOSE_COMPLETE',
    help: 'Callback function called after the server has fully shut down.',
  }),
  serverURL: option(z.string(), {
    env: 'PARSE_SERVER_URL',
    help: 'The URL where Parse Server is accessible, used for internal requests.',
  }),
  sessionLength: option(z.number().min(1, 'Session length must be a value greater than 0.').default(31536000), {
    env: 'PARSE_SERVER_SESSION_LENGTH',
    help: 'Duration in seconds before a session token expires. Default is 1 year.',
  }),
  silent: option(z.boolean().optional(), {
    env: 'SILENT',
    help: 'Suppress all console output from the server.',
  }),
  startLiveQueryServer: option(z.boolean().optional(), {
    env: 'PARSE_SERVER_START_LIVE_QUERY_SERVER',
    help: 'Automatically start a LiveQuery WebSocket server alongside the HTTP server.',
    applicableTo: ['cli'],
  }),
  trustProxy: option(z.any().default([]), {
    env: 'PARSE_SERVER_TRUST_PROXY',
    help: 'Express trust proxy setting for running behind a reverse proxy or load balancer.',
  }),
  userSensitiveFields: option(z.array(z.string()).optional(), {
    env: 'PARSE_SERVER_USER_SENSITIVE_FIELDS',
    help: 'Deprecated. Use protectedFields instead. List of user fields excluded from API responses.',
  }),
  verbose: option(z.boolean().optional(), {
    env: 'VERBOSE',
    help: 'Enable verbose logging, printing all configuration options on startup.',
  }),
  verifyServerUrl: option(z.boolean().default(true), {
    env: 'PARSE_SERVER_VERIFY_SERVER_URL',
    help: 'Verify that the serverURL is reachable when the server launches.',
  }),
  verifyUserEmails: option(z.union([z.boolean(), z.custom<Function>(v => typeof v === 'function')]).default(false), {
    env: 'PARSE_SERVER_VERIFY_USER_EMAILS',
    help: 'Require users to verify their email address before they can log in. Can be a function for custom logic.',
  }),
  webhookKey: option(z.string().optional(), {
    env: 'PARSE_SERVER_WEBHOOK_KEY',
    help: 'Key sent with outgoing webhook requests for authentication.',
  }),
}).superRefine((data, ctx) => {
  if (data.masterKey && data.readOnlyMasterKey && data.masterKey === data.readOnlyMasterKey) {
    ctx.addIssue({
      code: 'custom',
      message: 'masterKey and readOnlyMasterKey should be different',
      path: ['readOnlyMasterKey'],
    });
  }
  if (data.masterKey && data.maintenanceKey && data.masterKey === data.maintenanceKey) {
    ctx.addIssue({
      code: 'custom',
      message: 'masterKey and maintenanceKey should be different',
      path: ['maintenanceKey'],
    });
  }
  if (data.maintenanceKey && data.readOnlyMasterKey && data.maintenanceKey === data.readOnlyMasterKey) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      message: 'maintenanceKey and readOnlyMasterKey should be different',
      path: ['maintenanceKey'],
    });
  }
}).loose();

export type ParseServerOptions = z.infer<typeof ParseServerOptionsSchema>;
