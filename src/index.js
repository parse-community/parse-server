// ParseServer - open-source compatible API Server for Parse apps

import 'babel-polyfill';

var batch = require('./batch'),
    bodyParser = require('body-parser'),
    cache = require('./cache'),
    DatabaseAdapter = require('./DatabaseAdapter'),
    express = require('express'),
    middlewares = require('./middlewares'),
    multer = require('multer'),
    Parse = require('parse/node').Parse,
    httpRequest = require('./httpRequest');

import ParsePushAdapter        from './Adapters/Push/ParsePushAdapter';
//import passwordReset           from './passwordReset';
import PromiseRouter           from './PromiseRouter';
import SimpleMailgunAdapter    from './Adapters/Email/SimpleMailgunAdapter';
import verifyEmail             from './verifyEmail';
import { AnalyticsRouter }     from './Routers/AnalyticsRouter';
import { ClassesRouter }       from './Routers/ClassesRouter';
import { FileLoggerAdapter }   from './Adapters/Logger/FileLoggerAdapter';
import { FilesController }     from './Controllers/FilesController';
import { FilesRouter }         from './Routers/FilesRouter';
import { FunctionsRouter }     from './Routers/FunctionsRouter';
import { GridStoreAdapter }    from './Adapters/Files/GridStoreAdapter';
import { IAPValidationRouter } from './Routers/IAPValidationRouter';
import { InstallationsRouter } from './Routers/InstallationsRouter';
import { loadAdapter }         from './Adapters/AdapterLoader';
import { LoggerController }    from './Controllers/LoggerController';
import { LogsRouter }          from './Routers/LogsRouter';
import { PushController }      from './Controllers/PushController';
import { PushRouter }          from './Routers/PushRouter';
import { RolesRouter }         from './Routers/RolesRouter';
import { S3Adapter }           from './Adapters/Files/S3Adapter';
import { SchemasRouter }       from './Routers/SchemasRouter';
import { SessionsRouter }      from './Routers/SessionsRouter';
import { UsersRouter }         from './Routers/UsersRouter';

// Mutate the Parse object to add the Cloud Code handlers
addParseCloud();

// ParseServer works like a constructor of an express app.
// The args that we understand are:
// "databaseAdapter": a class like ExportAdapter providing create, find,
//                    update, and delete
// "filesAdapter": a class like GridStoreAdapter providing create, get,
//                 and delete
// "databaseURI": a uri like mongodb://localhost:27017/dbname to tell us
//          what database this Parse API connects to.
// "cloud": relative location to cloud code to require, or a function
//          that is given an instance of Parse as a parameter.  Use this instance of Parse
//          to register your cloud code hooks and functions.
// "appId": the application id to host
// "masterKey": the master key for requests to this app
// "facebookAppIds": an array of valid Facebook Application IDs, required
//                   if using Facebook login
// "collectionPrefix": optional prefix for database collection names
// "fileKey": optional key from Parse dashboard for supporting older files
//            hosted by Parse
// "clientKey": optional key from Parse dashboard
// "dotNetKey": optional key from Parse dashboard
// "restAPIKey": optional key from Parse dashboard
// "javascriptKey": optional key from Parse dashboard
// "push": optional key from configure push

function ParseServer({
  appId,
  appName,
  masterKey,
  databaseAdapter,
  filesAdapter,
  push,
  loggerAdapter,
  databaseURI,
  cloud,
  collectionPrefix = '',
  clientKey = '',
  javascriptKey = '',
  dotNetKey = '',
  restAPIKey = '',
  fileKey = 'invalid-file-key',
  facebookAppIds = [],
  enableAnonymousUsers = true,
  oauth = {},
  serverURL = '',
  verifyUserEmails = false,
  emailAdapter,
}) {
  if (!appId || !masterKey) {
    throw 'You must provide an appId and masterKey!';
  }

  if (databaseAdapter) {
    DatabaseAdapter.setAdapter(databaseAdapter);
  }

  if (databaseURI) {
    DatabaseAdapter.setAppDatabaseURI(appId, databaseURI);
  }
  if (cloud) {
    addParseCloud();
    if (typeof cloud === 'function') {
      cloud(Parse)
    } else if (typeof cloud === 'string') {
      require(cloud);
    } else {
      throw "argument 'cloud' must either be a string or a function";
    }
  }

  const filesControllerAdapter = loadAdapter(filesAdapter, GridStoreAdapter);
  const pushControllerAdapter = loadAdapter(push, ParsePushAdapter);
  const loggerControllerAdapter = loadAdapter(loggerAdapter, FileLoggerAdapter);

  // We pass the options and the base class for the adatper,
  // Note that passing an instance would work too
  const filesController = new FilesController(filesControllerAdapter);
  const pushController = new PushController(pushControllerAdapter);
  const loggerController = new LoggerController(loggerControllerAdapter);

  if (verifyUserEmails) {
    if (typeof appName !== 'string') {
      throw 'An app name is required when using email verification.';
    }
    if (!emailAdapter) {
      throw 'User email verification was enabled, but no email adapter was provided';
    }
    if (typeof emailAdapter.sendVerificationEmail !== 'function') {
      throw 'Invalid email adapter: no sendVerificationEmail() function was provided';
    }
  }

  cache.apps[appId] = {
    masterKey: masterKey,
    collectionPrefix: collectionPrefix,
    clientKey: clientKey,
    javascriptKey: javascriptKey,
    dotNetKey: dotNetKey,
    restAPIKey: restAPIKey,
    fileKey: fileKey,
    facebookAppIds: facebookAppIds,
    filesController: filesController,
    pushController: pushController,
    loggerController: loggerController,
    enableAnonymousUsers: enableAnonymousUsers,
    oauth: oauth,
    verifyUserEmails: verifyUserEmails,
    emailAdapter: emailAdapter,
    appName: appName,
  };

  // To maintain compatibility. TODO: Remove in some version that breaks backwards compatability
  if (process.env.FACEBOOK_APP_ID) {
    cache.apps[appId]['facebookAppIds'].push(process.env.FACEBOOK_APP_ID);
  }

  // Initialize the node client SDK automatically
  Parse.initialize(appId, javascriptKey, masterKey);
  Parse.serverURL = serverURL;

  // This app serves the Parse API directly.
  // It's the equivalent of https://api.parse.com/1 in the hosted Parse API.
  var api = express();

  // File handling needs to be before default middlewares are applied
  api.use('/', new FilesRouter().getExpressRouter());
  if (process.env.PARSE_EXPERIMENTAL_EMAIL_VERIFICATION_ENABLED || process.env.TESTING == 1) {
    //api.use('/request_password_reset', passwordReset.reset(appName, appId));
    //api.get('/password_reset_success', passwordReset.success);
    api.get('/verify_email', verifyEmail(appId, serverURL));
  }

  // TODO: separate this from the regular ParseServer object
  if (process.env.TESTING == 1) {
    api.use('/', require('./testing-routes').router);
  }

  api.use(bodyParser.json({ 'type': '*/*' }));
  api.use(middlewares.allowCrossDomain);
  api.use(middlewares.allowMethodOverride);
  api.use(middlewares.handleParseHeaders);

  let routers = [
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
    new IAPValidationRouter()
  ];

  if (process.env.PARSE_EXPERIMENTAL_CONFIG_ENABLED || process.env.TESTING) {
    routers.push(require('./global_config'));
  }

  let appRouter = new PromiseRouter();
  routers.forEach((router) => {
    appRouter.merge(router);
  });
  batch.mountOnto(appRouter);

  appRouter.mountOnto(api);

  api.use(middlewares.handleParseErrors);


  process.on('uncaughtException', (err) => {
    if( err.code === "EADDRINUSE" ) { // user-friendly message for this common error
      console.log(`Unable to listen on port ${err.port}. The port is already in use.`);
      process.exit(0);
    }
    else {
      throw err;
    }
  });

  return api;
}

function addParseCloud() {
  Parse.Cloud.Functions = {};
  Parse.Cloud.Validators = {};
  Parse.Cloud.Triggers = {
    beforeSave: {},
    beforeDelete: {},
    afterSave: {},
    afterDelete: {}
  };

  Parse.Cloud.define = function(functionName, handler, validationHandler) {
    Parse.Cloud.Functions[functionName] = handler;
    Parse.Cloud.Validators[functionName] = validationHandler;
  };
  Parse.Cloud.beforeSave = function(parseClass, handler) {
    var className = getClassName(parseClass);
    Parse.Cloud.Triggers.beforeSave[className] = handler;
  };
  Parse.Cloud.beforeDelete = function(parseClass, handler) {
    var className = getClassName(parseClass);
    Parse.Cloud.Triggers.beforeDelete[className] = handler;
  };
  Parse.Cloud.afterSave = function(parseClass, handler) {
    var className = getClassName(parseClass);
    Parse.Cloud.Triggers.afterSave[className] = handler;
  };
  Parse.Cloud.afterDelete = function(parseClass, handler) {
    var className = getClassName(parseClass);
    Parse.Cloud.Triggers.afterDelete[className] = handler;
  };
  Parse.Cloud.httpRequest = httpRequest;
  global.Parse = Parse;
}

function getClassName(parseClass) {
  if (parseClass && parseClass.className) {
    return parseClass.className;
  }
  return parseClass;
}

module.exports = {
  ParseServer: ParseServer,
  S3Adapter: S3Adapter,
  SimpleMailgunAdapter: SimpleMailgunAdapter,
};
