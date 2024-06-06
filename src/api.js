import express from 'express';
import * as middlewares from './middlewares';
import { FilesRouter } from './Routers/FilesRouter';
import bodyParser from 'body-parser';
import PagesRouter from './Routers/PagesRouter';
import PublicappRouter from './PromiseRouter';
import { AnalyticsRouter } from './Routers/AnalyticsRouter';
import { FunctionsRouter } from './Routers/FunctionsRouter';
import { SchemasRouter } from './Routers/SchemasRouter';
import { IAPValidationRouter } from './Routers/IAPValidationRouter';
import { FeaturesRouter } from './Routers/FeaturesRouter';
import { CloudCodeRouter } from './Routers/CloudCodeRouter';
import PromiseRouter from './PromiseRouter';
import batch from './batch';
import { UsersRouter } from '../lib/Routers/UsersRouter';
import { ClassesRouter } from '../lib/Routers/ClassesRouter';
import { RolesRouter } from '../lib/Routers/RolesRouter';
import { SessionsRouter } from '../lib/Routers/SessionsRouter';
import { InstallationsRouter } from '../lib/Routers/InstallationsRouter';
import { PushRouter } from '../lib/Routers/PushRouter';
import { LogsRouter } from '../lib/Routers/LogsRouter';
import { PurgeRouter } from '../lib/Routers/PurgeRouter';
import { GraphQLRouter } from '../lib/Routers/GraphQLRouter';
import { GlobalConfigRouter } from '../lib/Routers/GlobalConfigRouter';
import { AudiencesRouter } from '../lib/Routers/AudiencesRouter';
import { HooksRouter } from '../lib/Routers/HooksRouter';
import { AggregateRouter } from '../lib/Routers/AggregateRouter';
import { SecurityRouter } from '../lib/Routers/SecurityRouter';

export const promiseRouter = ({ appId }) => {
  const routers = [
    new ClassesRouter(),
    new UsersRouter(),
    new SessionsRouter(),
    new RolesRouter(),
    new AnalyticsRouter(),
    new InstallationsRouter(),
    new FunctionsRouter(),
    new SchemasRouter(),
    new PushRouter(),
    new LogsRouter(),
    new IAPValidationRouter(),
    new FeaturesRouter(),
    new GlobalConfigRouter(),
    new GraphQLRouter(),
    new PurgeRouter(),
    new HooksRouter(),
    new CloudCodeRouter(),
    new AudiencesRouter(),
    new AggregateRouter(),
    new SecurityRouter(),
  ];

  const routes = routers.reduce((memo, router) => {
    return memo.concat(router.routes);
  }, []);

  const appRouter = new PromiseRouter(routes, appId);

  batch.mountOnto(appRouter);
  return appRouter;
}

var api = express();
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
  restappKey: 'TEST_REST_app_KEY',
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

const { maxUploadSize = '20mb', appId, directAccess, pages, rateLimit = [] } = options;
// This api serves the Parse api directly.
// It's the equivalent of https://app.parse.com/1 in the hosted Parse api.
//api.use("/apps", express.static(__dirname + "/public"));
api.use(middlewares.allowCrossDomain(appId));
// File handling needs to be before default middlewares are applied
api.use(
  '/',
  new FilesRouter().expressRouter({
    maxUploadSize: maxUploadSize,
  })
);

api.use('/health', function (req, res) {
  res.status(options.state === 'ok' ? 200 : 503);
  if (options.state === 'starting') {
    res.set('Retry-After', 1);
  }
  res.json({
    status: options.state,
  });
});

api.use(
  '/',
  bodyParser.urlencoded({ extended: false }),
  pages.enableRouter
    ? new PagesRouter(pages).expressRouter()
    : new PublicappRouter().expressRouter()
);

api.use(bodyParser.json({ type: '*/*', limit: maxUploadSize }));
api.use(middlewares.allowMethodOverride);
api.use(middlewares.handleParseHeaders);
const routes = Array.isArray(rateLimit) ? rateLimit : [rateLimit];
for (const route of routes) {
  middlewares.addRateLimit(route, options);
}
api.use(middlewares.handleParseSession);

const appRouter = promiseRouter({ appId });
api.use(appRouter.expressRouter());

api.use(middlewares.handleParseErrors);

// run the following when not testing
if (!process.env.TESTING) {
  //This causes tests to spew some useless warnings, so disable in test
  /* istanbul ignore next */
  process.on('uncaughtException', err => {
    if (err.code === 'EADDRINUSE') {
      // user-friendly message for this common error
      process.stderr.write(`Unable to listen on port ${err.port}. The port is already in use.`);
      process.exit(0);
    } else {
      if (err.message) {
        process.stderr.write('An uncaught exception occurred: ' + err.message);
      }
      if (err.stack) {
        process.stderr.write('Stack Trace:\n' + err.stack);
      } else {
        process.stderr.write(err);
      }
      process.exit(1);
    }
  });
  // verify the server url after a 'mount' event is received
  /* istanbul ignore next */
  // api.on('mount', async function () {
  //   await new Promise(resolve => setTimeout(resolve, 1000));
  //   ParseServer.verifyServerUrl();
  // });
}
// if (process.env.PARSE_SERVER_ENABLE_EXPERIMENTAL_DIRECT_ACCESS === '1' || directAccess) {
//   Parse.CoreManager.setRESTController(ParseServerRESTController(appId, appRouter));
// }

export { api };
