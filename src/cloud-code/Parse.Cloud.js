var Parse = require("parse/node");
var ParseCloudExpress = require("parse-cloud-express");
Parse.Hooks = require("./Parse.Hooks");
var triggers = require("../triggers");

// The In memory ParseCloud

function getClassName(parseClass) {
  if (parseClass && parseClass.className) {
    return parseClass.className;
  }
  return parseClass;
}

var ParseCloud = {};
ParseCloud.define = function(functionName, handler, validationHandler) {
  triggers.addFunction(functionName, handler, validationHandler, Parse.applicationId);
};

ParseCloud.beforeSave = function(parseClass, handler) {
  var className = getClassName(parseClass);
  triggers.addTrigger('beforeSave', className, handler, Parse.applicationId);
};

ParseCloud.beforeDelete = function(parseClass, handler) {
  var className = getClassName(parseClass);
  triggers.addTrigger('beforeDelete', className, handler, Parse.applicationId);
};

ParseCloud.afterSave = function(parseClass, handler) {
  var className = getClassName(parseClass);
  triggers.addTrigger('afterSave', className, handler, Parse.applicationId);
};

ParseCloud.afterDelete = function(parseClass, handler) {
  var className = getClassName(parseClass);
  triggers.addTrigger('afterDelete', className, handler, Parse.applicationId);
};
  
Parse.Cloud._removeHook = function(category, name, type, applicationId) {
  applicationId = applicationId || Parse.applicationId;
  triggers._unregister(applicationId, category, name, type);
};

// Store the original Parse Cloud instance 
// to prevent multiple wrapping
const PARSE_CLOUD_OVERRIDES = ["define", "beforeSave", "afterSave", "beforeDelete", "afterDelete"];

const PARSE_CLOUD_FUNCTIONS = PARSE_CLOUD_OVERRIDES.reduce(function(a, b){
  a[b] = ParseCloudExpress.Parse.Cloud[b];
  return a;
}, {});

var hooksCreationStrategy = {
  'never': 'never', // never create hooks, has to manually
  'always': 'always', // try to always update the hooks (POST then PUT)
  'try': 'try', // try to create a hook, but don't override if exists
};

function buildURL(name, trigger, config) {
  trigger = trigger || "function";
  var URL = config.mountPath+"/"+trigger+"_"+name;
  return URL;
}

function registerHook(type, name, trigger, cloudServerURL, creationStrategy, config) {

  var url = "";
  var hookURL;
  var data = {};

  if (type === "function") {
    url = "/hooks/functions";
    data.functionName = name;
    hookURL = buildURL(name, "function", config);

  } else if (type == "trigger") {
    url = "/hooks/triggers";
    data.className = name;
    data.triggerName = trigger;
    hookURL = buildURL(name, trigger, config);
  }
  
  // No creation strategy, do nothing
  if (!creationStrategy || creationStrategy == hooksCreationStrategy.never) {
    return Parse.Promise.as();
  }

  data.url = cloudServerURL + hookURL;
	          
  Parse.initialize(config.applicationId, config.javascriptKey, config.masterKey);
  Parse.serverURL = config.serverURL; 
  return Parse.Hooks.create(data).fail(function(err){
    if (creationStrategy == hooksCreationStrategy.always) {
      Parse.initialize(config.applicationId, config.javascriptKey, config.masterKey);
      Parse.serverURL = config.serverURL; 
      return Parse.Hooks.update(data);
    }
    // Ignore the error then
    return Parse.Promise.as(err);
  });
}

function wrapHandler(handler, config) {
    return (request, response) => {
      const _success = response.success;
      
      response.success = function(args) {
        var responseValue = args;
        if (request.object) {
          // If the response was set with the update
          // As the original API
          request.object.set(args);
          responseValue = {object: request.object.toJSON()};
        }
        _success(responseValue);
      }
      
      Parse.initialize(config.applicationId, config.javascriptKey, config.masterKey);
      Parse.serverURL = config.serverURL;
      return handler(request, response);
    };
};

var CONFIGURATIONS = {};

Parse.Cloud.hooksCreationStrategy = hooksCreationStrategy;

PARSE_CLOUD_OVERRIDES.map(function(triggerName){
  Object.defineProperty(Parse.Cloud, triggerName, {
    get() {
      return function(name, handler, creationStrategy) {
        	const config = CONFIGURATIONS[Parse.applicationId];
          if (!config) {
            ParseCloud[triggerName](name, handler, creationStrategy);
            return Parse.Promise.as();
          }
          const cloudServerURL = Parse.Cloud.serverURL;
          
          config.mountPath =  config.mountPath || "/_hooks";
          creationStrategy = creationStrategy || config.hooksCreationStrategy;
          var promise;
          if (triggerName === "define") {
            promise = registerHook("function", name, null, cloudServerURL, creationStrategy, config);
          } else {
            name = getClassName(name);
            promise = registerHook("trigger", name, triggerName, cloudServerURL, creationStrategy, config);
          }
          
          Parse.initialize(config.applicationId, config.javascriptKey, config.masterKey);
          Parse.serverURL = config.serverURL; 
          handler = wrapHandler(handler, config);
          PARSE_CLOUD_FUNCTIONS[triggerName](name, handler);
          return promise;
       }
    }
  });
});

Object.defineProperty(Parse.Cloud, "serverURL", {
  get() {
    const config = CONFIGURATIONS[Parse.applicationId];
    if (config) {
      return config.cloudServerURL || `http://localhost:${config.port}`;
    }
    return;
  }
})

Parse.Cloud.registerConfiguration = function(config) {
  CONFIGURATIONS[config.applicationId] = config;
}

Parse.Cloud.unregisterApplicationId = function(applicationId) {
  delete CONFIGURATIONS[applicationId];
}

module.exports = Parse.Cloud;
