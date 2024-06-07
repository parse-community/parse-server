// // @ts-ignore
// import { api } from '../../api';
// @ts-ignore
import ParseServer from '../../index';
// @ts-ignore
import { app } from '../../app'
import pg from "pg";

const minOptions = { appId: 'APP_ID', masterKey: 'MASTER_KEY', restAPIKey: 'TEST_REST_API_KEY', databaseURI: ' postgresql://postgres:postgres@localhost:5431/postgres' }
const options = {
  allowClientClassCreation: false,
  allowCustomObjectId: false,
  allowExpiredAuthDataToken: false,
  appId: 'APP_ID',
  cacheMaxSize: 10000,
  cacheTTL: 5000,
  collectionPrefix: '',
  convertEmailToLowercase: false,
  convertUsernameToLowercase: false,
  customPages: {},
  databaseURI: 'postgresql://postgres:postgres@localhost:5431/postgres',
  defaultLimit: 100,
  directAccess: true,
  emailVerifyTokenReuseIfValid: false,
  enableAnonymousUsers: true,
  enableCollationCaseComparison: false,
  enableExpressErrorHandler: false,
  encodeParseObjectInCloudFunction: false,
  enforcePrivateUsers: true,
  expireInactiveSessions: true,
  extendSessionOnUse: false,
  fileUpload: { "enableForAnonymousUser":false,"enableForPublic":false,"enableForAuthenticatedUser":true,"fileExtensions":["^(?!(h|H)(t|T)(m|M)(l|L)?$)"] },
  graphQLPath: '/graphql',
  host: '0.0.0.0',
  idempotencyOptions: { "ttl":300,"paths":[] },
  logLevels: { "cloudFunctionError":"error","cloudFunctionSuccess":"info","triggerAfter":"info","triggerBeforeError":"error","triggerBeforeSuccess":"info" },
  logsFolder: './logs',
  maintenanceKeyIps: ["127.0.0.1","::1"],
  masterKey: 'MASTER_KEY',
  masterKeyIps: ["127.0.0.1","::1"],
  maxUploadSize: '20mb',
  mountGraphQL: false,
  mountPath: '/parse',
  mountPlayground: false,
  objectIdSize: 10,
  pages: { "enableRouter":false,"enableLocalization":false,"localizationFallbackLocale":"en","placeholders":{},"forceRedirect":false,"pagesPath":"./public","pagesEndpoint":"apps","customUrls":{},"customRoutes":[] },
  playgroundPath: '/playground',
  port: 1337,
  preserveFileName: false,
  preventLoginWithUnverifiedEmail: false,
  preventSignupWithUnverifiedEmail: false,
  protectedFields: { "_User":{ "*":["email"] } },
  rateLimit: [],
  requestKeywordDenylist: [{ "key":"_bsontype","value":"Code" },{ "key":"constructor" },{ "key":"__proto__" }],
  restAPIKey: 'TEST_REST_API_KEY',
  revokeSessionOnPasswordReset: true,
  scheduledPush: false,
  security: { "enableCheck":false,"enableCheckLog":false },
  sendUserEmailVerification: true,
  serverURL: 'http://localhost:1337/parse',
  sessionLength: 31536000,
  trustProxy: [],
  verbose: true,
  verifyUserEmails: false,
  jsonLogs: false,
}

const getApp = async () => {
  await ParseServer.startApp(options);
  return app;
}

export { getApp, app };
