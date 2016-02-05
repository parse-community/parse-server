var ParseCloudExpress = require("parse-cloud-express");
var Parse = ParseCloudExpress.Parse;
Parse.Hooks = require("./Parse.Hooks")

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

Parse.Cloud.hooksCreationStrategy = hooksCreationStrategy;

module.exports = ParseCloudExpress.Parse.Cloud;
module.exports.injectAutoRegistration = function(config) {

  Parse.initialize(config.applicationId, config.javascriptKey, config.masterKey);
  Parse.serverURL = config.serverURL;
  
  var buildURL = function(name, trigger) {
    trigger = trigger || "function";
    var URL = config.mountPath+"/"+trigger+"_"+name;
    return URL;
  }

  var registerHook = function(type, name, trigger, cloudServerURL, creationStrategy) {

    var url = "";
    var hookURL;
    var data = {};

    if (type === "function") {
      url = "/hooks/functions";
      data.functionName = name;
      hookURL = buildURL(name);
      creationStrategy = cloudServerURL;
      cloudServerURL = trigger;
    } else if (type == "trigger") {
      url = "/hooks/triggers";
      data.className = name;
      data.triggerName = trigger;
      hookURL = buildURL(name, trigger);
    }
    
    // No creation strategy, do nothing
    if (!creationStrategy || creationStrategy == hooksCreationStrategy.never) {
      return Parse.Promise.as();
    }

    data.url = cloudServerURL + hookURL;
    return Parse.Hooks.create(data).fail(function(err){
      if (creationStrategy == hooksCreationStrategy.always) {
        return Parse.Hooks.update(data);
      }
      // Ignore the error then
      return Parse.Promise.as(err);
    });
  }

  var wrapHandler = function(handler) {
    return function(request, response) {
      var _success = response.success;

      Parse.initialize(config.applicationId, config.javascriptKey, config.masterKey);
      Parse.serverURL = config.serverURL;

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

      return handler(request, response);
    };
  };

  var ParseCloudOverrides = PARSE_CLOUD_OVERRIDES.reduce(function(cloud, triggerName){
      var currentTrigger = PARSE_CLOUD_FUNCTIONS[triggerName];
      cloud[triggerName] = function(name, handler, creationStrategy) {
        creationStrategy = creationStrategy || config.hooksCreationStrategy;
        var promise;
        if (triggerName === "define") {
          promise = registerHook("function", name, config.cloudServerURL, creationStrategy);
        } else {
          promise = registerHook("trigger", name, triggerName, config.cloudServerURL, creationStrategy);
        }
        if (triggerName == "beforeSave") {
          handler = wrapHandler(handler);
        };
        currentTrigger(name, handler);
        return promise;
      }
      return cloud;
  }, {});
  // mount the overrides on the ParseCloudExpress.Parse.Cloud
  Object.assign(ParseCloudExpress.Parse.Cloud, ParseCloudOverrides);
  Parse.Cloud = ParseCloudExpress.Parse.Cloud;
}
