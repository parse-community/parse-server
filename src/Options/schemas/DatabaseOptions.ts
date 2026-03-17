import { z } from 'zod';
import { option } from '../schemaUtils';

export const DatabaseOptionsClientMetadataSchema = z
  .object({
    name: option(z.string(), {
      env: 'PARSE_SERVER_DATABASE_CLIENT_METADATA_NAME',
      help: 'Application name sent to the database server, visible in database connection logs.',
    }),
    version: option(z.string(), {
      env: 'PARSE_SERVER_DATABASE_CLIENT_METADATA_VERSION',
      help: 'Application version sent to the database server for connection metadata.',
    }),
  })
  .loose();

export type DatabaseOptionsClientMetadata = z.infer<typeof DatabaseOptionsClientMetadataSchema>;

export const LogClientEventSchema = z
  .object({
    keys: option(z.array(z.string()).optional(), {
      env: 'PARSE_SERVER_DATABASE_LOG_CLIENT_EVENTS_KEYS',
      help: 'Dot-notation paths to extract from the MongoDB driver event for logging.',
    }),
    logLevel: option(z.string().default('info'), {
      env: 'PARSE_SERVER_DATABASE_LOG_CLIENT_EVENTS_LOG_LEVEL',
      help: 'Log level to use when logging this database client event.',
    }),
    name: option(z.string(), {
      env: 'PARSE_SERVER_DATABASE_LOG_CLIENT_EVENTS_NAME',
      help: "The MongoDB driver event name to subscribe to (e.g. 'commandStarted', 'connectionReady').",
    }),
  })
  .loose();

export type LogClientEvent = z.infer<typeof LogClientEventSchema>;

export const DatabaseOptionsSchema = z
  .object({
    allowPublicExplain: option(z.boolean().default(false), {
      env: 'PARSE_SERVER_DATABASE_ALLOW_PUBLIC_EXPLAIN',
      help: 'Allow Parse.Query.explain() without the master key, useful for debugging query performance.',
    }),
    appName: option(z.string().optional(), {
      env: 'PARSE_SERVER_DATABASE_APP_NAME',
      help: 'Application name sent to MongoDB in the connection handshake, visible in db.currentOp() and logs.',
    }),
    authMechanism: option(z.string().optional(), {
      env: 'PARSE_SERVER_DATABASE_AUTH_MECHANISM',
      help: "MongoDB authentication mechanism (e.g. 'SCRAM-SHA-256', 'MONGODB-X509').",
    }),
    authMechanismProperties: option(z.record(z.any()).optional(), {
      env: 'PARSE_SERVER_DATABASE_AUTH_MECHANISM_PROPERTIES',
      help: 'Additional properties for the selected MongoDB authentication mechanism.',
    }),
    authSource: option(z.string().optional(), {
      env: 'PARSE_SERVER_DATABASE_AUTH_SOURCE',
      help: 'The database used to authenticate the MongoDB connection credentials.',
    }),
    autoSelectFamily: option(z.boolean().optional(), {
      env: 'PARSE_SERVER_DATABASE_AUTO_SELECT_FAMILY',
      help: 'Automatically select between IPv4 and IPv6 when connecting to the database.',
    }),
    autoSelectFamilyAttemptTimeout: option(z.number().optional(), {
      env: 'PARSE_SERVER_DATABASE_AUTO_SELECT_FAMILY_ATTEMPT_TIMEOUT',
      help: 'Timeout in milliseconds for the IPv4/IPv6 auto-selection attempt.',
    }),
    batchSize: option(z.number().default(1000), {
      env: 'PARSE_SERVER_DATABASE_BATCH_SIZE',
      help: 'Number of documents returned per batch in MongoDB cursor getMore operations.',
    }),
    clientMetadata: option(DatabaseOptionsClientMetadataSchema.optional(), {
      env: 'PARSE_SERVER_DATABASE_CLIENT_METADATA',
      help: 'Custom application metadata sent to MongoDB in the connection handshake.',
    }),
    compressors: option(z.string().optional(), {
      env: 'PARSE_SERVER_DATABASE_COMPRESSORS',
      help: "Comma-separated list of compression algorithms for network traffic (e.g. 'snappy,zstd,zlib').",
    }),
    connectTimeoutMS: option(z.number().optional(), {
      env: 'PARSE_SERVER_DATABASE_CONNECT_TIMEOUT_MS',
      help: 'Timeout in milliseconds for establishing a new TCP connection to MongoDB.',
    }),
    createIndexAuthDataUniqueness: option(z.boolean().default(true), {
      env: 'PARSE_SERVER_DATABASE_CREATE_INDEX_AUTH_DATA_UNIQUENESS',
      help: 'Automatically create unique indexes on auth data fields to enforce provider uniqueness.',
    }),
    createIndexRoleName: option(z.boolean().default(true), {
      env: 'PARSE_SERVER_DATABASE_CREATE_INDEX_ROLE_NAME',
      help: "Automatically create a unique index on the Role class 'name' field.",
    }),
    createIndexUserEmail: option(z.boolean().default(true), {
      env: 'PARSE_SERVER_DATABASE_CREATE_INDEX_USER_EMAIL',
      help: "Automatically create an index on the User class 'email' field.",
    }),
    createIndexUserEmailCaseInsensitive: option(z.boolean().default(true), {
      env: 'PARSE_SERVER_DATABASE_CREATE_INDEX_USER_EMAIL_CASE_INSENSITIVE',
      help: "Automatically create a case-insensitive index on the User class 'email' field.",
    }),
    createIndexUserEmailVerifyToken: option(z.boolean().default(true), {
      env: 'PARSE_SERVER_DATABASE_CREATE_INDEX_USER_EMAIL_VERIFY_TOKEN',
      help: 'Automatically create an index on the User class email verification token field.',
    }),
    createIndexUserPasswordResetToken: option(z.boolean().default(true), {
      env: 'PARSE_SERVER_DATABASE_CREATE_INDEX_USER_PASSWORD_RESET_TOKEN',
      help: 'Automatically create an index on the User class password reset token field.',
    }),
    createIndexUserUsername: option(z.boolean().default(true), {
      env: 'PARSE_SERVER_DATABASE_CREATE_INDEX_USER_USERNAME',
      help: "Automatically create a unique index on the User class 'username' field.",
    }),
    createIndexUserUsernameCaseInsensitive: option(z.boolean().default(true), {
      env: 'PARSE_SERVER_DATABASE_CREATE_INDEX_USER_USERNAME_CASE_INSENSITIVE',
      help: "Automatically create a case-insensitive index on the User class 'username' field.",
    }),
    directConnection: option(z.boolean().optional(), {
      env: 'PARSE_SERVER_DATABASE_DIRECT_CONNECTION',
      help: 'Connect directly to a single MongoDB server, bypassing replica set topology discovery.',
    }),
    disableIndexFieldValidation: option(z.boolean().optional(), {
      env: 'PARSE_SERVER_DATABASE_DISABLE_INDEX_FIELD_VALIDATION',
      help: 'Skip validation of index field names against the schema, allowing indexes on any field.',
    }),
    enableSchemaHooks: option(z.boolean().default(false), {
      env: 'PARSE_SERVER_DATABASE_ENABLE_SCHEMA_HOOKS',
      help: 'Enable real-time schema change notifications across server instances via database polling.',
    }),
    forceServerObjectId: option(z.boolean().optional(), {
      env: 'PARSE_SERVER_DATABASE_FORCE_SERVER_OBJECT_ID',
      help: 'Force MongoDB to generate _id values instead of the driver.',
    }),
    heartbeatFrequencyMS: option(z.number().optional(), {
      env: 'PARSE_SERVER_DATABASE_HEARTBEAT_FREQUENCY_MS',
      help: 'Interval in milliseconds between server monitoring heartbeat checks.',
    }),
    loadBalanced: option(z.boolean().optional(), {
      env: 'PARSE_SERVER_DATABASE_LOAD_BALANCED',
      help: 'Enable load-balanced connection mode for MongoDB Atlas or similar services.',
    }),
    localThresholdMS: option(z.number().optional(), {
      env: 'PARSE_SERVER_DATABASE_LOCAL_THRESHOLD_MS',
      help: 'Latency window in milliseconds for selecting among multiple suitable read replicas.',
    }),
    logClientEvents: option(z.array(LogClientEventSchema).optional(), {
      env: 'PARSE_SERVER_DATABASE_LOG_CLIENT_EVENTS',
      help: 'Array of MongoDB driver events to log, with configurable log level and field extraction.',
    }),
    maxConnecting: option(z.number().optional(), {
      env: 'PARSE_SERVER_DATABASE_MAX_CONNECTING',
      help: 'Maximum number of connections that can be established concurrently to the database.',
    }),
    maxIdleTimeMS: option(z.number().optional(), {
      env: 'PARSE_SERVER_DATABASE_MAX_IDLE_TIME_MS',
      help: 'Maximum time in milliseconds a connection can remain idle before being closed.',
    }),
    maxPoolSize: option(z.number().optional(), {
      env: 'PARSE_SERVER_DATABASE_MAX_POOL_SIZE',
      help: 'Maximum number of connections in the MongoDB connection pool.',
    }),
    maxStalenessSeconds: option(z.number().optional(), {
      env: 'PARSE_SERVER_DATABASE_MAX_STALENESS_SECONDS',
      help: 'Maximum acceptable replication lag in seconds when reading from secondaries.',
    }),
    maxTimeMS: option(z.number().optional(), {
      env: 'PARSE_SERVER_DATABASE_MAX_TIME_MS',
      help: 'Maximum cumulative time in milliseconds allowed for cursor operations on the server.',
    }),
    minPoolSize: option(z.number().optional(), {
      env: 'PARSE_SERVER_DATABASE_MIN_POOL_SIZE',
      help: 'Minimum number of connections maintained in the MongoDB connection pool.',
    }),
    proxyHost: option(z.string().optional(), {
      env: 'PARSE_SERVER_DATABASE_PROXY_HOST',
      help: 'SOCKS5 proxy hostname for routing database connections.',
    }),
    proxyPassword: option(z.string().optional(), {
      env: 'PARSE_SERVER_DATABASE_PROXY_PASSWORD',
      help: 'Password for SOCKS5 proxy authentication.',
    }),
    proxyPort: option(z.number().optional(), {
      env: 'PARSE_SERVER_DATABASE_PROXY_PORT',
      help: 'SOCKS5 proxy port number.',
    }),
    proxyUsername: option(z.string().optional(), {
      env: 'PARSE_SERVER_DATABASE_PROXY_USERNAME',
      help: 'Username for SOCKS5 proxy authentication.',
    }),
    readConcernLevel: option(z.string().optional(), {
      env: 'PARSE_SERVER_DATABASE_READ_CONCERN_LEVEL',
      help: "MongoDB read concern level (e.g. 'local', 'majority', 'linearizable').",
    }),
    readPreference: option(z.string().optional(), {
      env: 'PARSE_SERVER_DATABASE_READ_PREFERENCE',
      help: "MongoDB read preference for distributing reads (e.g. 'primary', 'secondary', 'nearest').",
    }),
    readPreferenceTags: option(z.array(z.any()).optional(), {
      env: 'PARSE_SERVER_DATABASE_READ_PREFERENCE_TAGS',
      help: 'Tag sets for filtering which replica set members are eligible for reads.',
    }),
    replicaSet: option(z.string().optional(), {
      env: 'PARSE_SERVER_DATABASE_REPLICA_SET',
      help: 'Name of the MongoDB replica set to connect to.',
    }),
    retryReads: option(z.boolean().optional(), {
      env: 'PARSE_SERVER_DATABASE_RETRY_READS',
      help: 'Automatically retry failed read operations once on transient errors.',
    }),
    retryWrites: option(z.boolean().optional(), {
      env: 'PARSE_SERVER_DATABASE_RETRY_WRITES',
      help: 'Automatically retry failed write operations once on transient errors.',
    }),
    schemaCacheTtl: option(z.number().optional(), {
      env: 'PARSE_SERVER_DATABASE_SCHEMA_CACHE_TTL',
      help: 'Duration in seconds to cache the database schema before refreshing.',
    }),
    serverMonitoringMode: option(z.string().optional(), {
      env: 'PARSE_SERVER_DATABASE_SERVER_MONITORING_MODE',
      help: "MongoDB server monitoring mode ('auto', 'poll', or 'stream').",
    }),
    serverSelectionTimeoutMS: option(z.number().optional(), {
      env: 'PARSE_SERVER_DATABASE_SERVER_SELECTION_TIMEOUT_MS',
      help: 'Timeout in milliseconds for selecting a suitable server from the topology.',
    }),
    socketTimeoutMS: option(z.number().optional(), {
      env: 'PARSE_SERVER_DATABASE_SOCKET_TIMEOUT_MS',
      help: 'Timeout in milliseconds for send/receive operations on an established socket.',
    }),
    srvMaxHosts: option(z.number().optional(), {
      env: 'PARSE_SERVER_DATABASE_SRV_MAX_HOSTS',
      help: 'Maximum number of hosts to connect to when using a mongodb+srv:// connection string.',
    }),
    srvServiceName: option(z.string().optional(), {
      env: 'PARSE_SERVER_DATABASE_SRV_SERVICE_NAME',
      help: 'SRV service name',
    }),
    ssl: option(z.boolean().optional(), {
      env: 'PARSE_SERVER_DATABASE_SSL',
      help: 'Enable SSL/TLS',
    }),
    tls: option(z.boolean().optional(), {
      env: 'PARSE_SERVER_DATABASE_TLS',
      help: 'Enable TLS',
    }),
    tlsAllowInvalidCertificates: option(z.boolean().optional(), {
      env: 'PARSE_SERVER_DATABASE_TLS_ALLOW_INVALID_CERTIFICATES',
      help: 'Allow invalid certificates',
    }),
    tlsAllowInvalidHostnames: option(z.boolean().optional(), {
      env: 'PARSE_SERVER_DATABASE_TLS_ALLOW_INVALID_HOSTNAMES',
      help: 'Allow invalid hostnames',
    }),
    tlsCAFile: option(z.string().optional(), {
      env: 'PARSE_SERVER_DATABASE_TLS_CAFILE',
      help: 'CA file path',
    }),
    tlsCertificateKeyFile: option(z.string().optional(), {
      env: 'PARSE_SERVER_DATABASE_TLS_CERTIFICATE_KEY_FILE',
      help: 'Client cert/key file',
    }),
    tlsCertificateKeyFilePassword: option(z.string().optional(), {
      env: 'PARSE_SERVER_DATABASE_TLS_CERTIFICATE_KEY_FILE_PASSWORD',
      help: 'Client cert key password',
    }),
    tlsInsecure: option(z.boolean().optional(), {
      env: 'PARSE_SERVER_DATABASE_TLS_INSECURE',
      help: 'Disable certificate validations',
    }),
    waitQueueTimeoutMS: option(z.number().optional(), {
      env: 'PARSE_SERVER_DATABASE_WAIT_QUEUE_TIMEOUT_MS',
      help: 'Wait queue timeout',
    }),
    zlibCompressionLevel: option(z.number().optional(), {
      env: 'PARSE_SERVER_DATABASE_ZLIB_COMPRESSION_LEVEL',
      help: 'Zlib compression level (0-9)',
    }),
  })
  .loose();

export type DatabaseOptions = z.infer<typeof DatabaseOptionsSchema>;

export const LogLevelSchema = z
  .object({
    debug: option(z.string(), {
      env: 'PARSE_SERVER_LOG_LEVEL_DEBUG',
      help: 'Debug level',
    }),
    error: option(z.string(), {
      env: 'PARSE_SERVER_LOG_LEVEL_ERROR',
      help: 'Error level',
    }),
    info: option(z.string(), {
      env: 'PARSE_SERVER_LOG_LEVEL_INFO',
      help: 'Info level',
    }),
    silly: option(z.string(), {
      env: 'PARSE_SERVER_LOG_LEVEL_SILLY',
      help: 'Silly level',
    }),
    verbose: option(z.string(), {
      env: 'PARSE_SERVER_LOG_LEVEL_VERBOSE',
      help: 'Verbose level',
    }),
    warn: option(z.string(), {
      env: 'PARSE_SERVER_LOG_LEVEL_WARN',
      help: 'Warning level',
    }),
  })
  .loose();

export type LogLevel = z.infer<typeof LogLevelSchema>;
