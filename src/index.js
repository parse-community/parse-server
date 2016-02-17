// ParseServer - open-source compatible API Server for Parse apps

var batch = require('./batch'),
    bodyParser = require('body-parser'),
    cache = require('./cache'),
    DatabaseAdapter = require('./DatabaseAdapter'),
    express = require('express'),
    middlewares = require('./middlewares'),
    multer = require('multer'),
    Parse = require('parse/node').Parse,
    PromiseRouter = require('./PromiseRouter'),
    httpRequest = require('./httpRequest');

import { GridStoreAdapter } from './Adapters/Files/GridStoreAdapter';
import { S3Adapter } from './Adapters/Files/S3Adapter';
import { FilesController } from './Controllers/FilesController';

import ParsePushAdapter from './Adapters/Push/ParsePushAdapter';
import { PushController } from './Controllers/PushController';

import { ClassesRouter } from './Routers/ClassesRouter';
import { InstallationsRouter } from './Routers/InstallationsRouter';
import { UsersRouter } from './Routers/UsersRouter';
import { SessionsRouter } from './Routers/SessionsRouter';
import { RolesRouter } from './Routers/RolesRouter';

import { FileLoggerAdapter } from './Adapters/Logger/FileLoggerAdapter';
import { LoggerController } from './Controllers/LoggerController';

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

function ParseServer(args) {
  if (!args.appId || !args.masterKey) {
    throw 'You must provide an appId and masterKey!';
  }

  if (args.databaseAdapter) {
    DatabaseAdapter.setAdapter(args.databaseAdapter);
  }

  // Make files adapter
  let filesAdapter = args.filesAdapter || new GridStoreAdapter();

  // Make push adapter
  let pushConfig = args.push;
  let pushAdapter;
  if (pushConfig && pushConfig.adapter) {
    pushAdapter = pushConfig.adapter;
  } else if (pushConfig) {
    pushAdapter = new ParsePushAdapter(pushConfig)
  }

  // Make logger adapter
  let loggerAdapter = args.loggerAdapter || new FileLoggerAdapter();
  
  if (args.databaseURI) {
    DatabaseAdapter.setAppDatabaseURI(args.appId, args.databaseURI);
  }
  if (args.cloud) {
    addParseCloud();
    if (typeof args.cloud === 'function') {
      args.cloud(Parse)
    } else if (typeof args.cloud === 'string') {
      require(args.cloud);
    } else {
      throw "argument 'cloud' must either be a string or a function";
    }

  }

  let filesController = new FilesController(filesAdapter);

  cache.apps[args.appId] = {
    masterKey: args.masterKey,
    collectionPrefix: args.collectionPrefix || '',
    clientKey: args.clientKey || '',
    javascriptKey: args.javascriptKey || '',
    dotNetKey: args.dotNetKey || '',
    restAPIKey: args.restAPIKey || '',
    fileKey: args.fileKey || 'invalid-file-key',
    facebookAppIds: args.facebookAppIds || [],
    filesController: filesController,
    enableAnonymousUsers: args.enableAnonymousUsers || true
  };

  // To maintain compatibility. TODO: Remove in v2.1
  if (process.env.FACEBOOK_APP_ID) {
    cache.apps[args.appId]['facebookAppIds'].push(process.env.FACEBOOK_APP_ID);
  }

  // Initialize the node client SDK automatically
  Parse.initialize(args.appId, args.javascriptKey || '', args.masterKey);
  Parse.serverURL = args.serverURL || '';

  // This app serves the Parse API directly.
  // It's the equivalent of https://api.parse.com/1 in the hosted Parse API.
  var api = express();

  // File handling needs to be before default middlewares are applied
  api.use('/', filesController.getExpressRouter());

  // TODO: separate this from the regular ParseServer object
  if (process.env.TESTING == 1) {
    console.log('enabling integration testing-routes');
    api.use('/', require('./testing-routes').router);
  }

  api.use(bodyParser.json({ 'type': '*/*' }));
  api.use(middlewares.allowCrossDomain);
  api.use(middlewares.allowMethodOverride);
  api.use(middlewares.handleParseHeaders);

  let routers = [
    new ClassesRouter().getExpressRouter(),
    new UsersRouter().getExpressRouter(),
    new SessionsRouter().getExpressRouter(),
    new RolesRouter().getExpressRouter(),
    require('./analytics'),
    new InstallationsRouter().getExpressRouter(),
    require('./functions'),
    require('./schemas'),
    new PushController(pushAdapter).getExpressRouter(),
    new LoggerController(loggerAdapter).getExpressRouter()
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
  S3Adapter: S3Adapter
};
