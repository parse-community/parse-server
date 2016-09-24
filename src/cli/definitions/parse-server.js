import {
  numberParser,
  numberOrBoolParser,
  objectParser,
  arrayParser,
  moduleOrObjectParser,
  booleanParser,
  nullParser
} from '../utils/parsers';


export default {
  "appId": {
    env: "PARSE_SERVER_APPLICATION_ID",
    help: "Your Parse Application ID",
    required: true
  },
  "masterKey": {
    env: "PARSE_SERVER_MASTER_KEY",
    help: "Your Parse Master Key",
    required: true
  },
  "port": {
     env: "PORT",
     help: "The port to run the ParseServer. defaults to 1337.",
     default: 1337,
     action: numberParser("port")
  },
  "databaseURI": {
    env: "PARSE_SERVER_DATABASE_URI",
    help: "The full URI to your mongodb database"
  },
  "databaseOptions": {
    env: "PARSE_SERVER_DATABASE_OPTIONS",
    help: "Options to pass to the mongodb client",
    action: objectParser
  },
  "collectionPrefix": {
    env: "PARSE_SERVER_COLLECTION_PREFIX",
    help: 'A collection prefix for the classes'
  },
  "serverURL": {
    env: "PARSE_SERVER_URL",
    help: "URL to your parse server with http:// or https://.",
  },
  "publicServerURL": {
    env: "PARSE_PUBLIC_SERVER_URL",
    help: "Public URL to your parse server with http:// or https://.",
  },
  "clientKey": {
    env: "PARSE_SERVER_CLIENT_KEY",
    help: "Key for iOS, MacOS, tvOS clients"
  },
  "javascriptKey": {
    env: "PARSE_SERVER_JAVASCRIPT_KEY",
    help: "Key for the Javascript SDK"
  },
  "restAPIKey": {
    env: "PARSE_SERVER_REST_API_KEY",
    help: "Key for REST calls"
  },
  "dotNetKey": {
    env: "PARSE_SERVER_DOT_NET_KEY",
    help: "Key for Unity and .Net SDK"
  },
  "webhookKey": {
    env: "PARSE_SERVER_WEBHOOK_KEY",
    help: "Key sent with outgoing webhook calls"
  },
  "cloud": {
    env: "PARSE_SERVER_CLOUD_CODE_MAIN",
    help: "Full path to your cloud code main.js"
  },
  "push": {
    env: "PARSE_SERVER_PUSH",
    help: "Configuration for push, as stringified JSON. See https://github.com/ParsePlatform/parse-server/wiki/Push",
    action: objectParser
  },
  "oauth": {
    env: "PARSE_SERVER_OAUTH_PROVIDERS",
    help: "Configuration for your oAuth providers, as stringified JSON. See https://github.com/ParsePlatform/parse-server/wiki/Parse-Server-Guide#oauth",
    action: objectParser
  },
  "fileKey": {
    env: "PARSE_SERVER_FILE_KEY",
    help: "Key for your files",
  },
  "facebookAppIds": {
    env: "PARSE_SERVER_FACEBOOK_APP_IDS",
    help: "Comma separated list for your facebook app Ids",
    type: "list",
    action: arrayParser
  },
  "enableAnonymousUsers": {
    env: "PARSE_SERVER_ENABLE_ANON_USERS",
    help: "Enable (or disable) anon users, defaults to true",
    action: booleanParser
  },
  "allowClientClassCreation": {
    env: "PARSE_SERVER_ALLOW_CLIENT_CLASS_CREATION",
    help: "Enable (or disable) client class creation, defaults to true",
    action: booleanParser
  },
  "mountPath": {
    env: "PARSE_SERVER_MOUNT_PATH",
    help: "Mount path for the server, defaults to /parse",
    default: "/parse"
  },
  "filesAdapter": {
    env: "PARSE_SERVER_FILES_ADAPTER",
    help: "Adapter module for the files sub-system",
    action: moduleOrObjectParser
  },
  "emailAdapter": {
    env: "PARSE_SERVER_EMAIL_ADAPTER",
    help: "Adapter module for the email sending",
    action: moduleOrObjectParser
  },
  "verifyUserEmails": {
    env: "PARSE_SERVER_VERIFY_USER_EMAILS",
    help: "Enable (or disable) user email validation, defaults to false",
    action: booleanParser
  },
  "preventLoginWithUnverifiedEmail": {
    env: "PARSE_SERVER_PREVENT_LOGIN_WITH_UNVERIFIED_EMAIL",
    help: "Prevent user from login if email is not verified and PARSE_SERVER_VERIFY_USER_EMAILS is true, defaults to false",
    action: booleanParser
  },
  "emailVerifyTokenValidityDuration": {
    env: "PARSE_SERVER_EMAIL_VERIFY_TOKEN_VALIDITY_DURATION",
    help: "Email verification token validity duration",
    action: numberParser("emailVerifyTokenValidityDuration")
  },
  "accountLockout": {
    env: "PARSE_SERVER_ACCOUNT_LOCKOUT",
    help: "account lockout policy for failed login attempts",
    action: objectParser
  },
  "appName": {
    env: "PARSE_SERVER_APP_NAME",
    help: "Sets the app name"
  },
  "loggerAdapter": {
    env: "PARSE_SERVER_LOGGER_ADAPTER",
    help: "Adapter module for the logging sub-system",
    action: moduleOrObjectParser
  },
  "liveQuery": {
    env: "PARSE_SERVER_LIVE_QUERY_OPTIONS",
    help: "liveQuery options",
    action: objectParser
  },
  "customPages": {
    env: "PARSE_SERVER_CUSTOM_PAGES",
    help: "custom pages for password validation and reset",
    action: objectParser
  },
  "maxUploadSize": {
    env: "PARSE_SERVER_MAX_UPLOAD_SIZE",
    help: "Max file size for uploads.",
    default: "20mb"
  },
  "sessionLength": {
    env: "PARSE_SERVER_SESSION_LENGTH",
    help: "Session duration, defaults to 1 year",
    action: numberParser("sessionLength")
  },
  "verbose": {
    env: "VERBOSE",
    help: "Set the logging to verbose"
  },
  "jsonLogs": {
    env: "JSON_LOGS",
    help: "Log as structured JSON objects"
  },
  "logLevel": {
    env: "PARSE_SERVER_LOG_LEVEL",
    help: "Sets the level for logs"
  },
  "logsFolder": {
    env: "PARSE_SERVER_LOGS_FOLDER",
    help: "Folder for the logs (defaults to './logs'); set to null to disable file based logging",
    action: nullParser
  },
  "silent": {
    help: "Disables console output",
  },
  "revokeSessionOnPasswordReset": {
    env: "PARSE_SERVER_REVOKE_SESSION_ON_PASSWORD_RESET",
    help: "When a user changes their password, either through the reset password email or while logged in, all sessions are revoked if this is true. Set to false if you don't want to revoke sessions.",
    action: booleanParser
  },
  "schemaCacheTTL": {
    env: "PARSE_SERVER_SCHEMA_CACHE_TTL",
    help: "The TTL for caching the schema for optimizing read/write operations. You should put a long TTL when your DB is in production. default to 0; disabled.",
    action: numberParser("schemaCacheTTL"),
  },
  "cluster": {
    help: "Run with cluster, optionally set the number of processes default to os.cpus().length",
    action: numberOrBoolParser("cluster")
  },
   "liveQuery.classNames": {
    help: "parse-server's LiveQuery configuration object",
    action: objectParser
  },
  "liveQuery.classNames": {
    help: "parse-server's LiveQuery classNames",
    action: arrayParser
  },
  "liveQuery.redisURL": {
    help: "parse-server's LiveQuery redisURL",
  },
  "startLiveQueryServer": {
    help: "Starts the liveQuery server",
    action: booleanParser
  },
  "liveQueryServerOptions": {
    help: "Live query server configuration options (will start the liveQuery server)",
    action: objectParser
  },
};
