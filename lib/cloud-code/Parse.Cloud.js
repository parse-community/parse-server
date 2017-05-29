'use strict';

var _node = require('parse/node');

var _triggers = require('../triggers');

var triggers = _interopRequireWildcard(_triggers);

function _interopRequireWildcard(obj) { if (obj && obj.__esModule) { return obj; } else { var newObj = {}; if (obj != null) { for (var key in obj) { if (Object.prototype.hasOwnProperty.call(obj, key)) newObj[key] = obj[key]; } } newObj.default = obj; return newObj; } }

function validateClassNameForTriggers(className) {
  var restrictedClassNames = ['_Session'];
  if (restrictedClassNames.indexOf(className) != -1) {
    throw 'Triggers are not supported for ' + className + ' class.';
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
ParseCloud.define = function (functionName, handler, validationHandler) {
  triggers.addFunction(functionName, handler, validationHandler, _node.Parse.applicationId);
};

ParseCloud.job = function (functionName, handler) {
  triggers.addJob(functionName, handler, _node.Parse.applicationId);
};

ParseCloud.beforeSave = function (parseClass, handler) {
  var className = getClassName(parseClass);
  triggers.addTrigger(triggers.Types.beforeSave, className, handler, _node.Parse.applicationId);
};

ParseCloud.beforeDelete = function (parseClass, handler) {
  var className = getClassName(parseClass);
  triggers.addTrigger(triggers.Types.beforeDelete, className, handler, _node.Parse.applicationId);
};

ParseCloud.afterSave = function (parseClass, handler) {
  var className = getClassName(parseClass);
  triggers.addTrigger(triggers.Types.afterSave, className, handler, _node.Parse.applicationId);
};

ParseCloud.afterDelete = function (parseClass, handler) {
  var className = getClassName(parseClass);
  triggers.addTrigger(triggers.Types.afterDelete, className, handler, _node.Parse.applicationId);
};

ParseCloud.beforeFind = function (parseClass, handler) {
  var className = getClassName(parseClass);
  triggers.addTrigger(triggers.Types.beforeFind, className, handler, _node.Parse.applicationId);
};

ParseCloud.afterFind = function (parseClass, handler) {
  var className = getClassName(parseClass);
  triggers.addTrigger(triggers.Types.afterFind, className, handler, _node.Parse.applicationId);
};

ParseCloud._removeAllHooks = function () {
  triggers._unregisterAll();
};

ParseCloud.useMasterKey = function () {
  // eslint-disable-next-line
  console.warn("Parse.Cloud.useMasterKey is deprecated (and has no effect anymore) on parse-server, please refer to the cloud code migration notes: https://github.com/ParsePlatform/parse-server/wiki/Compatibility-with-Hosted-Parse#cloud-code");
};

ParseCloud.httpRequest = require("./httpRequest");

module.exports = ParseCloud;