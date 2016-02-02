// ParseServer - open-source compatible API Server for Parse apps

var batch = require('./batch'),
    bodyParser = require('body-parser'),
    cache = require('./cache'),
    DatabaseAdapter = require('./DatabaseAdapter'),
    express = require('express'),
    FilesAdapter = require('./FilesAdapter'),
    S3Adapter = require('./S3Adapter'),
    middlewares = require('./middlewares'),
    multer = require('multer'),
    Parse = require('parse/node').Parse,
    PromiseRouter = require('./PromiseRouter'),
    request = require('request'),
    path = require('path');

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
// "emailSender": optional function to be called with the parameters required to send a password reset or confirmation email
function ParseServer(args) {
  if (!args.appId || !args.masterKey) {
    throw 'You must provide an appId and masterKey!';
  }

  if (args.databaseAdapter) {
    DatabaseAdapter.setAdapter(args.databaseAdapter);
  }
  if (args.filesAdapter) {
    FilesAdapter.setAdapter(args.filesAdapter);
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

  cache.apps[args.appId] = {
    masterKey: args.masterKey,
    collectionPrefix: args.collectionPrefix || '',
    clientKey: args.clientKey || '',
    javascriptKey: args.javascriptKey || '',
    dotNetKey: args.dotNetKey || '',
    restAPIKey: args.restAPIKey || '',
    fileKey: args.fileKey || 'invalid-file-key',
    facebookAppIds: args.facebookAppIds || [],
    emailSender: args.emailSender
  };

  // To maintain compatibility. TODO: Remove in v2.1
  if (process.env.FACEBOOK_APP_ID) {
    cache.apps[args.appId]['facebookAppIds'].push(process.env.FACEBOOK_APP_ID);
  }

  // Initialize the node client SDK automatically
  Parse.initialize(args.appId, args.javascriptKey || '', args.masterKey);

  // This app serves the Parse API directly.
  // It's the equivalent of https://api.parse.com/1 in the hosted Parse API.
  var api = express();

  // File handling needs to be before default middlewares are applied
  api.use('/', require('./files').router);
  api.set('views', path.join(__dirname, 'views'));
  api.use("/request_password_reset", require('./passwordReset').reset(args.appName, args.appId));
  api.get("/password_reset_success", require('./passwordReset').success);
  api.get("/verify_email", require('./verifyEmail')(args.appId));

  // TODO: separate this from the regular ParseServer object
  if (process.env.TESTING == 1) {
    console.log('enabling integration testing-routes');
    api.use('/', require('./testing-routes').router);
  }

  api.use(bodyParser.json({ 'type': '*/*' }));
  api.use(middlewares.allowCrossDomain);
  api.use(middlewares.allowMethodOverride);
  api.use(middlewares.handleParseHeaders);
  api.set('view engine', 'jade');

  var router = new PromiseRouter();

  router.merge(require('./classes'));
  router.merge(require('./users'));
  router.merge(require('./sessions'));
  router.merge(require('./roles'));
  router.merge(require('./analytics'));
  router.merge(require('./push'));
  router.merge(require('./installations'));
  router.merge(require('./functions'));

  batch.mountOnto(router);

  router.mountOnto(api);

  api.use(middlewares.handleParseErrors);

  return api;
}

function addParseCloud() {
  Parse.Cloud.Functions = {};
  Parse.Cloud.Triggers = {
    beforeSave: {},
    beforeDelete: {},
    afterSave: {},
    afterDelete: {}
  };
  Parse.Cloud.define = function(functionName, handler) {
    Parse.Cloud.Functions[functionName] = handler;
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
  Parse.Cloud.httpRequest = function(options) {
    var promise = new Parse.Promise();
    var callbacks = {
      success: options.success,
      error: options.error
    };
    delete options.success;
    delete options.error;
    if (options.uri && !options.url) {
      options.uri = options.url;
      delete options.url;
    }
    if (typeof options.body === 'object') {
      options.body = JSON.stringify(options.body);
    }
    request(options, (error, response, body) => {
      if (error) {
        if (callbacks.error) {
          return callbacks.error(error);
        }
        return promise.reject(error);
      } else {
        if (callbacks.success) {
          return callbacks.success(body);
        }
        return promise.resolve(body);
      }
    });
    return promise;
  };
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
  Constants: require('./Constants'),
  S3Adapter: S3Adapter
};
