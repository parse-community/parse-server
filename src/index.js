// ParseServer - open-source compatible API Server for Parse apps

import 'babel-polyfill';

var batch = require('./batch'),
    bodyParser = require('body-parser'),
    DatabaseAdapter = require('./DatabaseAdapter'),
    express = require('express'),
    middlewares = require('./middlewares'),
    multer = require('multer'),
    Parse = require('parse/node').Parse;

//import passwordReset           from './passwordReset';
import cache                   from './cache';
import parseServerPackage      from '../package.json';
import ParsePushAdapter        from './Adapters/Push/ParsePushAdapter';
import PromiseRouter           from './PromiseRouter';
import requiredParameter       from './requiredParameter';
import { AnalyticsRouter }     from './Routers/AnalyticsRouter';
import { ClassesRouter }       from './Routers/ClassesRouter';
import { FeaturesRouter }      from './Routers/FeaturesRouter';
import { FileLoggerAdapter }   from './Adapters/Logger/FileLoggerAdapter';
import { FilesController }     from './Controllers/FilesController';
import { FilesRouter }         from './Routers/FilesRouter';
import { FunctionsRouter }     from './Routers/FunctionsRouter';
import { GlobalConfigRouter }  from './Routers/GlobalConfigRouter';
import { GridStoreAdapter }    from './Adapters/Files/GridStoreAdapter';
import { HooksController }     from './Controllers/HooksController';
import { HooksRouter }         from './Routers/HooksRouter';
import { IAPValidationRouter } from './Routers/IAPValidationRouter';
import { InstallationsRouter } from './Routers/InstallationsRouter';
import { loadAdapter }         from './Adapters/AdapterLoader';
import { LoggerController }    from './Controllers/LoggerController';
import { LogsRouter }          from './Routers/LogsRouter';
import { PublicAPIRouter }     from './Routers/PublicAPIRouter';
import { PushController }      from './Controllers/PushController';
import { PushRouter }          from './Routers/PushRouter';
import { randomString }        from './cryptoUtils';
import { RolesRouter }         from './Routers/RolesRouter';
import { S3Adapter }           from './Adapters/Files/S3Adapter';
import { SchemasRouter }       from './Routers/SchemasRouter';
import { SessionsRouter }      from './Routers/SessionsRouter';
import { setFeature }          from './features';
import { UserController }      from './Controllers/UserController';
import { UsersRouter }         from './Routers/UsersRouter';

// Mutate the Parse object to add the Cloud Code handlers
addParseCloud();

// ParseServer works like a constructor of an express app.
// The args that we understand are:
// "databaseAdapter": a class like DatabaseController providing create, find,
//                    update, and delete
// "filesAdapter": a class like GridStoreAdapter providing create, get,
//                 and delete
// "loggerAdapter": a class like FileLoggerAdapter providing info, error,
//                 and query
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

class ParseServer {
  
  constructor({
    appId = requiredParameter('You must provide an appId!'),
    masterKey = requiredParameter('You must provide a masterKey!'),
    appName,
    databaseAdapter,
    filesAdapter,
    push,
    loggerAdapter,
    databaseURI = DatabaseAdapter.defaultDatabaseURI,
    cloud,
    collectionPrefix = '',
    clientKey,
    javascriptKey,
    dotNetKey,
    restAPIKey,
    fileKey = 'invalid-file-key',
    facebookAppIds = [],
    enableAnonymousUsers = true,
    allowClientClassCreation = true,
    oauth = {},
    serverURL = requiredParameter('You must provide a serverURL!'),
    maxUploadSize = '20mb',
    verifyUserEmails = false,
    emailAdapter,
    publicServerURL,
    customPages = {
      invalidLink: undefined,
      verifyEmailSuccess: undefined,
      choosePassword: undefined,
      passwordResetSuccess: undefined
    },
  }) {

    setFeature('serverVersion', parseServerPackage.version);
    // Initialize the node client SDK automatically
    Parse.initialize(appId, javascriptKey || 'unused', masterKey);
    Parse.serverURL = serverURL;

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

    let filesControllerAdapter = loadAdapter(filesAdapter, () => {
      return new GridStoreAdapter(databaseURI);
    });
    let pushControllerAdapter = loadAdapter(push, ParsePushAdapter);
    let loggerControllerAdapter = loadAdapter(loggerAdapter, FileLoggerAdapter);
    let emailControllerAdapter = loadAdapter(emailAdapter);
    // We pass the options and the base class for the adatper,
    // Note that passing an instance would work too
    this.filesController = new FilesController(filesControllerAdapter, appId);
    this.pushController = new PushController(pushControllerAdapter, appId);
    this.loggerController = new LoggerController(loggerControllerAdapter, appId);
    this.hooksController = new HooksController(appId, collectionPrefix);
    this.userController = new UserController(emailControllerAdapter, appId, { verifyUserEmails });

    this.masterKey = masterKey;
    this.serverURL = serverURL;
    this.collectionPrefix = collectionPrefix;
    this.clientKey = clientKey;
    this.applicationId = appId;
    this.appId = appId;
    this.restAPIKey = restAPIKey;
    this.javascriptKey = javascriptKey;
    this.dotNetKey = dotNetKey;
    this.restAPIKey = restAPIKey;
    this.fileKey = fileKey;
    this.facebookAppIds = facebookAppIds;
    this.verifyUserEmails = verifyUserEmails;
    this.enableAnonymousUsers = enableAnonymousUsers;
    this.allowClientClassCreation = allowClientClassCreation;
    this.oauth = oauth;
    this.appName = appName;
    this.publicServerURL = publicServerURL;
    this.customPages = customPages;
    this.maxUploadSize = maxUploadSize;
    this.database = DatabaseAdapter.getDatabaseConnection(appId, collectionPrefix);
    cache.apps.set(appId, this);

    // To maintain compatibility. TODO: Remove in some version that breaks backwards compatability
    if (process.env.FACEBOOK_APP_ID) {
      cache.apps.get(appId)['facebookAppIds'].push(process.env.FACEBOOK_APP_ID);
    }

    ParseServer.validate(cache.apps.get(appId));

    // This app serves the Parse API directly.
    // It's the equivalent of https://api.parse.com/1 in the hosted Parse API.
    var api = express();
    //api.use("/apps", express.static(__dirname + "/public"));
    // File handling needs to be before default middlewares are applied
    api.use('/', new FilesRouter().getExpressRouter({
      maxUploadSize: maxUploadSize
    }));

    api.use('/', bodyParser.urlencoded({extended: false}), new PublicAPIRouter().expressApp());

    // TODO: separate this from the regular ParseServer object
    if (process.env.TESTING == 1) {
      api.use('/', require('./testing-routes').router);
    }

    api.use(bodyParser.json({ 'type': '*/*' , limit: maxUploadSize }));
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
      new IAPValidationRouter(),
      new FeaturesRouter(),
    ];

    if (process.env.PARSE_EXPERIMENTAL_CONFIG_ENABLED || process.env.TESTING) {
      routers.push(new GlobalConfigRouter());
    }

    if (process.env.PARSE_EXPERIMENTAL_HOOKS_ENABLED || process.env.TESTING) {
      routers.push(new HooksRouter());
    }

    let routes = routers.reduce((memo, router) => {
      return memo.concat(router.routes);
    }, []);

    let appRouter = new PromiseRouter(routes);

    batch.mountOnto(appRouter);

    api.use(appRouter.expressApp());

    api.use(middlewares.handleParseErrors);

  //This causes tests to spew some useless warnings, so disable in test
  if (!process.env.TESTING) {
    process.on('uncaughtException', (err) => {
      if( err.code === "EADDRINUSE" ) { // user-friendly message for this common error
        console.log(`Unable to listen on port ${err.port}. The port is already in use.`);
        process.exit(0);
      }
      else {
        throw err;
      }
    });
    this.hooksController.load();

    return api;
  }
  
  static validate(options) {
    this.validateEmailConfiguration({verifyUserEmails: options.verifyUserEmails, 
                                appName: options.appName, 
                                publicServerURL: options.publicServerURL})
  }
  
  static validateEmailConfiguration({verifyUserEmails, appName, publicServerURL}) {
    if (verifyUserEmails) {
      if (typeof appName !== 'string') {
        throw 'An app name is required when using email verification.';
      }
      if (typeof publicServerURL !== 'string') {
        throw 'A public server url is required when using email verification.';
      }
    }
  }

  get invalidLinkURL() {
    return this.customPages.invalidLink || `${this.publicServerURL}/apps/invalid_link.html`;
  }
  
  get verifyEmailSuccessURL() {
    return this.customPages.verifyEmailSuccess || `${this.publicServerURL}/apps/verify_email_success.html`;
  }
  
  get choosePasswordURL() {
    return this.customPages.choosePassword || `${this.publicServerURL}/apps/choose_password`;
  }
  
  get requestResetPasswordURL() {
    return `${this.publicServerURL}/apps/${this.applicationId}/request_password_reset`;
  }
  
  get passwordResetSuccessURL() {
    return this.customPages.passwordResetSuccess || `${this.publicServerURL}/apps/password_reset_success.html`;
  }
  
  get verifyEmailURL() {
    return `${this.publicServerURL}/apps/${this.applicationId}/verify_email`;
  }
}

function addParseCloud() {
  const ParseCloud = require("./cloud-code/Parse.Cloud");
  Object.assign(Parse.Cloud, ParseCloud);
  global.Parse = Parse;
}

module.exports = {
  ParseServer: ParseServer,
  S3Adapter: S3Adapter,
};
