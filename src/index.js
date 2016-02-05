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
    httpRequest = require("parse-cloud-express/lib/httpRequest"),
    triggers = require('./triggers'),
    hooks = require('./hooks'),
    path = require("path"),
    CloudCodeLauncher = require("./cloud-code/launcher");

import { GridStoreAdapter } from './Adapters/Files/GridStoreAdapter';
import { S3Adapter } from './Adapters/Files/S3Adapter';
import { FilesController } from './Controllers/FilesController';
import { JSONStorageProvider, JSONStorageController } from './Controllers/JSONStorageController';

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

  loadConfiguration(args);
  
  // This app serves the Parse API directly.
  // It's the equivalent of https://api.parse.com/1 in the hosted Parse API.
	var api = express(); 
  
  // File handling needs to be before default middlewares are applied
  api.use(FilesController.getExpressRouter());

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
    require('./hooks'),
    PushController.getExpressRouter()
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

function loadConfiguration(args) {
  
  if (args.applications) {
    var port = parseInt(process.env.PORT) || 8080;
    port++;
    args.applications.forEach(function(app){
      if (typeof app.cloud === "string") {
        app.cloud = {
          main: path.resolve(app.cloud),
          // Increment the port for the sub processes
          port: port++,
          hooksCreationStrategy: "always"
        }
      }
      if (app.cloud) {
        // Setup the defaults if needed for light cloud configurations
        app.cloud.applicationId = app.cloud.applicationId || app.appId;
        app.cloud.javascriptKey = app.cloud.javascriptKey || app.javascriptKey;
        app.cloud.masterKey = app.cloud.masterKey || app.masterKey;
        app.cloud.serverURL = app.cloud.serverURL || app.serverURL;
      }
   
      // Global configuration
      app.databaseAdapter = app.databaseAdapter || args.databaseAdapter;
      app.filesAdapter = app.filesAdapter || args.filesAdapter;
      app.jsonCacheDir = app.jsonCacheDir || args.jsonCacheDir;
      loadConfiguration(app);
    });
    return;
  }
  
  if (!args.appId || !args.masterKey) {
    throw 'You must provide an appId and masterKey!';
  }

  if (args.databaseAdapter) {
    DatabaseAdapter.setAdapter(args.databaseAdapter);
  }

  // Make files adapter
  let filesAdapter = args.filesAdapter || new GridStoreAdapter();
  let filesController = new FilesController(filesAdapter);
  
  // Make push adapter
  let pushConfig = args.push;
  let pushAdapter;
  if (pushConfig && pushConfig.adapter) {
    pushAdapter = pushConfig.adapter;
  } else if (pushConfig) {
    pushAdapter = new ParsePushAdapter(pushConfig)
  }
  
  let pushController = new PushController(pushAdapter);

  // Make logger adapter
  let loggerAdapter = args.loggerAdapter || new FileLoggerAdapter();
  
  if (args.databaseURI) {
    DatabaseAdapter.setAppDatabaseURI(args.appId, args.databaseURI);
  }
  
  JSONStorageProvider.setAdapter(new JSONStorageController(args.jsonCacheDir || "./.cache"));

  if (args.cloud) {
    if (typeof args.cloud === 'object') {
      CloudCodeLauncher(args.cloud);
    } else if (typeof args.cloud === 'function') {
      addParseCloud();
      args.cloud(Parse)
    } else if (typeof args.cloud === 'string') {
      addParseCloud();
      require(args.cloud);
    } else {
      throw "argument 'cloud' must either be a string or a function or an object";
    }
  }

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
    pushController: pushController,
    enableAnonymousUsers: args.enableAnonymousUsers || true,
    oauth: args.oauth || {},
  };

  // To maintain compatibility. TODO: Remove in v2.1
  if (process.env.FACEBOOK_APP_ID) {
    cache.apps[args.appId]['facebookAppIds'].push(process.env.FACEBOOK_APP_ID);
  }
  
  require("./hooks").load(args.appId);
}

function addParseCloud() {

  Parse.Cloud.define = function(functionName, handler, validationHandler) {
    triggers.addFunction(functionName, handler, validationHandler, Parse.applicationId);
  };
  Parse.Cloud.beforeSave = function(parseClass, handler) {
    var className = getClassName(parseClass);
    triggers.addTrigger('beforeSave', className, handler, Parse.applicationId);
  };
  Parse.Cloud.beforeDelete = function(parseClass, handler) {
    var className = getClassName(parseClass);
    triggers.addTrigger('beforeDelete', className, handler, Parse.applicationId);
  };
  Parse.Cloud.afterSave = function(parseClass, handler) {
    var className = getClassName(parseClass);
    triggers.addTrigger('afterSave', className, handler, Parse.applicationId);
  };
  Parse.Cloud.afterDelete = function(parseClass, handler) {
    var className = getClassName(parseClass);
    triggers.addTrigger('afterDelete', className, handler, Parse.applicationId);
  };
  if (process.env.NODE_ENV == "test") {
    Parse.Hooks = Parse.Hooks || {};
    Parse.Cloud._removeHook = function(category, name, type, applicationId) {
      applicationId = applicationId || Parse.applicationId;
      triggers._unregister(applicationId, category, name, type);
    }
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
