var Parse = require("parse/node");
var triggers = require("../triggers");

function validateClassNameForTriggers(className) {
  const restrictedClassNames = [ '_Session' ];
  if (restrictedClassNames.indexOf(className) != -1) {
    throw `Triggers are not supported for ${className} class.`;
  }
  return className;
}

function getClassName(parseClass) {
  if (parseClass && parseClass.className) {
    return validateClassNameForTriggers(parseClass.className);
  }
  return validateClassNameForTriggers(parseClass);
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
  
ParseCloud._removeHook = function(category, name, type, applicationId) {
  applicationId = applicationId || Parse.applicationId;
  triggers._unregister(applicationId, category, name, type);
};

ParseCloud.httpRequest = require("./httpRequest");

module.exports = ParseCloud;
