/**
 * @interface ParseServerOptions
 * @property {String} appId Your Parse Application ID
 * @property {String} masterKey Your Parse Master Key
 * @property {String} serverURL URL to your parse server with http:// or https://.
 * @property {String[]} masterKeyIps Restrict masterKey to be used by only these ips, defaults to [] (allow all ips)
 * @property {String} appName Sets the app name
 * @property {Adapter<AnalyticsAdapter>} analyticsAdapter Adapter module for the analytics
 * @property {Adapter<FilesAdapter>} filesAdapter Adapter module for the files sub-system
 * @property {Any} push Configuration for push, as stringified JSON. See http://docs.parseplatform.org/parse-server/guide/#push-notifications
 * @property {Boolean} scheduledPush Configuration for push scheduling, defaults to false.
 * @property {Adapter<LoggerAdapter>} loggerAdapter Adapter module for the logging sub-system
 * @property {Boolean} jsonLogs Log as structured JSON objects
 * @property {String} logsFolder Folder for the logs (defaults to './logs'); set to null to disable file based logging
 * @property {Boolean} verbose Set the logging to verbose
 * @property {String} logLevel Sets the level for logs
 * @property {Boolean} silent Disables console output
 * @property {String} databaseURI The full URI to your database. Supported databases are mongodb or postgres.
 * @property {Any} databaseOptions Options to pass to the mongodb client
 * @property {Adapter<StorageAdapter>} databaseAdapter Adapter module for the database
 * @property {String} cloud Full path to your cloud code main.js
 * @property {String} collectionPrefix A collection prefix for the classes
 * @property {String} clientKey Key for iOS, MacOS, tvOS clients
 * @property {String} javascriptKey Key for the Javascript SDK
 * @property {String} dotNetKey Key for Unity and .Net SDK
 * @property {String} restAPIKey Key for REST calls
 * @property {String} readOnlyMasterKey Read-only key, which has the same capabilities as MasterKey without writes
 * @property {String} webhookKey Key sent with outgoing webhook calls
 * @property {String} fileKey Key for your files
 * @property {Boolean} preserveFileName Enable (or disable) the addition of a unique hash to the file names
 * @property {String[]} userSensitiveFields Personally identifiable information fields in the user table the should be removed for non-authorized users.
 * @property {Boolean} enableAnonymousUsers Enable (or disable) anon users, defaults to true
 * @property {Boolean} allowClientClassCreation Enable (or disable) client class creation, defaults to true
 * @property {Any} auth Configuration for your authentication providers, as stringified JSON. See http://docs.parseplatform.org/parse-server/guide/#oauth-and-3rd-party-authentication
 * @property {String} maxUploadSize Max file size for uploads, defaults to 20mb
 * @property {Boolean} verifyUserEmails Enable (or disable) user email validation, defaults to false
 * @property {Boolean} preventLoginWithUnverifiedEmail Prevent user from login if email is not verified and PARSE_SERVER_VERIFY_USER_EMAILS is true, defaults to false
 * @property {Number} emailVerifyTokenValidityDuration Email verification token validity duration, in seconds
 * @property {Any} accountLockout account lockout policy for failed login attempts
 * @property {Any} passwordPolicy Password policy for enforcing password related rules
 * @property {Adapter<CacheAdapter>} cacheAdapter Adapter module for the cache
 * @property {Adapter<MailAdapter>} emailAdapter Adapter module for email sending
 * @property {String} publicServerURL Public URL to your parse server with http:// or https://.
 * @property {CustomPagesOptions} customPages custom pages for password validation and reset
 * @property {LiveQueryOptions} liveQuery parse-server's LiveQuery configuration object
 * @property {Number} sessionLength Session duration, in seconds, defaults to 1 year
 * @property {Number} maxLimit Max value for limit option on queries, defaults to unlimited
 * @property {Boolean} expireInactiveSessions Sets wether we should expire the inactive sessions, defaults to true
 * @property {Boolean} revokeSessionOnPasswordReset When a user changes their password, either through the reset password email or while logged in, all sessions are revoked if this is true. Set to false if you don't want to revoke sessions.
 * @property {Number} schemaCacheTTL The TTL for caching the schema for optimizing read/write operations. You should put a long TTL when your DB is in production. default to 5000; set 0 to disable.
 * @property {Number} cacheTTL Sets the TTL for the in memory cache (in ms), defaults to 5000 (5 seconds)
 * @property {Number} cacheMaxSize Sets the maximum size for the in memory cache, defaults to 10000
 * @property {Boolean} enableSingleSchemaCache Use a single schema cache shared across requests. Reduces number of queries made to _SCHEMA, defaults to false, i.e. unique schema cache per request.
 * @property {Boolean} enableExpressErrorHandler Enables the default express error handler for all errors
 * @property {Number} objectIdSize Sets the number of characters in generated object id's, default 10
 * @property {Number} port The port to run the ParseServer, defaults to 1337.
 * @property {Boolean} enableGraphQL Set to true to enable the graphql endpoint
 * @property {Boolean} enableGraphQLI Set to true to enable the graphqli interface
  this will also enable graphql
 * @property {String} host The host to serve ParseServer on, defaults to 0.0.0.0
 * @property {String} mountPath Mount path for the server, defaults to /parse
 * @property {Number|Boolean} cluster Run with cluster, optionally set the number of processes default to os.cpus().length
 * @property {Union} middleware middleware for express server, can be string or function
 * @property {Boolean} startLiveQueryServer Starts the liveQuery server
 * @property {LiveQueryServerOptions} liveQueryServerOptions Live query server configuration options (will start the liveQuery server)
 */

/**
 * @interface CustomPagesOptions
 * @property {String} invalidLink invalid link page path
 * @property {String} verifyEmailSuccess verify email success page path
 * @property {String} choosePassword choose password page path
 * @property {String} passwordResetSuccess password reset success page path
 */

/**
 * @interface LiveQueryOptions
 * @property {String[]} classNames parse-server's LiveQuery classNames
 * @property {String} redisURL parse-server's LiveQuery redisURL
 * @property {Adapter<PubSubAdapter>} pubSubAdapter LiveQuery pubsub adapter
 */

/**
 * @interface LiveQueryServerOptions
 * @property {String} appId This string should match the appId in use by your Parse Server. If you deploy the LiveQuery server alongside Parse Server, the LiveQuery server will try to use the same appId.
 * @property {String} masterKey This string should match the masterKey in use by your Parse Server. If you deploy the LiveQuery server alongside Parse Server, the LiveQuery server will try to use the same masterKey.
 * @property {String} serverURL This string should match the serverURL in use by your Parse Server. If you deploy the LiveQuery server alongside Parse Server, the LiveQuery server will try to use the same serverURL.
 * @property {Any} keyPairs A JSON object that serves as a whitelist of keys. It is used for validating clients when they try to connect to the LiveQuery server. Check the following Security section and our protocol specification for details.
 * @property {Number} websocketTimeout Number of milliseconds between ping/pong frames. The WebSocket server sends ping/pong frames to the clients to keep the WebSocket alive. This value defines the interval of the ping/pong frame from the server to clients, defaults to 10 * 1000 ms (10 s).
 * @property {Number} cacheTimeout Number in milliseconds. When clients provide the sessionToken to the LiveQuery server, the LiveQuery server will try to fetch its ParseUser's objectId from parse server and store it in the cache. The value defines the duration of the cache. Check the following Security section and our protocol specification for details, defaults to 30 * 24 * 60 * 60 * 1000 ms (~30 days).
 * @property {String} logLevel This string defines the log level of the LiveQuery server. We support VERBOSE, INFO, ERROR, NONE, defaults to INFO.
 * @property {Number} port The port to run the LiveQuery server, defaults to 1337.
 * @property {String} redisURL parse-server's LiveQuery redisURL
 * @property {Adapter<PubSubAdapter>} pubSubAdapter LiveQuery pubsub adapter
 */

