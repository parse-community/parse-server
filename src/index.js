// ParseServer - open-source compatible API Server for Parse apps

var batch = require('./batch'),
    bodyParser = require('body-parser'),
    CacheProvider = require('./classes/CacheProvider'),
    DatabaseAdapter = require('./DatabaseAdapter'),
    express = require('express'),
    S3Adapter = require('./S3Adapter'),
    middlewares = require('./middlewares'),
    multer = require('multer'),
    Parse = require('parse/node').Parse,
    PromiseRouter = require('./PromiseRouter'),
    httpRequest = require('./httpRequest');

import { setAdapter as setFilesAdapter } from './FilesAdapter';
import { default as GridStoreAdapter } from './GridStoreAdapter';

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

var DefaultCacheAdapter = require('./classes/MemoryCache');

function ParseServer(args) {
  if (!args.appId || !args.masterKey) {
    throw 'You must provide an appId and masterKey!';
  }

  this.setupCache(args.cache);

  var cache = this.cacheProvider.getAdapter();

  if (args.databaseAdapter) {
    DatabaseAdapter.setAdapter(args.databaseAdapter);
  }
  if (args.filesAdapter) {
    setFilesAdapter(args.filesAdapter);
  } else {
    setFilesAdapter(new GridStoreAdapter());
  }
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

  var appInfo = {
    masterKey: args.masterKey,
    collectionPrefix: args.collectionPrefix || '',
    clientKey: args.clientKey || '',
    javascriptKey: args.javascriptKey || '',
    dotNetKey: args.dotNetKey || '',
    restAPIKey: args.restAPIKey || '',
    fileKey: args.fileKey || 'invalid-file-key',
    facebookAppIds: args.facebookAppIds || []
  };

  // To maintain compatibility. TODO: Remove in v2.1
  if (process.env.FACEBOOK_APP_ID) {
    appInfo['facebookAppIds'].push(process.env.FACEBOOK_APP_ID);
  }

  cache.put(args.appId, appInfo, Infinity);

  // Initialize the node client SDK automatically
  Parse.initialize(args.appId, args.javascriptKey || '', args.masterKey);
  if(args.serverURL) {
    Parse.serverURL = args.serverURL;
  }

  // This app serves the Parse API directly.
  // It's the equivalent of https://api.parse.com/1 in the hosted Parse API.
  var api = express();

  // File handling needs to be before default middlewares are applied
  api.use('/', require('./files').router);

  // TODO: separate this from the regular ParseServer object
  if (process.env.TESTING == 1) {
    console.log('enabling integration testing-routes');
    api.use('/', require('./testing-routes').router);
  }

  api.use(bodyParser.json({ 'type': '*/*' }));
  api.use(middlewares.allowCrossDomain);
  api.use(middlewares.allowMethodOverride);
  api.use(middlewares.handleParseHeaders);

  var router = new PromiseRouter();

  router.merge(require('./classes'));
  router.merge(require('./users'));
  router.merge(require('./sessions'));
  router.merge(require('./roles'));
  router.merge(require('./analytics'));
  router.merge(require('./push').router);
  router.merge(require('./installations'));
  router.merge(require('./functions'));
  router.merge(require('./schemas'));

  batch.mountOnto(router);

  router.mountOnto(api);

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

function resolveAdapter(adapter, options) {
    // Support passing in adapter paths
    if (typeof adapter === 'string') {
        adapter = require(adapter);
    }

    // Instantiate the adapter if the class got passed instead of an instance
    if (typeof adapter === 'function') {
        adapter = new adapter(options);
    }

    return adapter;
}

// TODO: Add configurable TTLs for cache entries
function setupCache(config) {
  config = config || {};
  config.adapter = config.adapter || DefaultCacheAdapter;

  var adapter = this.resolveAdapter(config.adapter, config.options);
  CacheProvider.setAdapter(adapter);
  this.cacheProvider = CacheProvider;
}

ParseServer.prototype.setupCache = setupCache;
ParseServer.prototype.resolveAdapter = resolveAdapter;

module.exports = {
  ParseServer: ParseServer,
  S3Adapter: S3Adapter
};
