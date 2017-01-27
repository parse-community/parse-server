'use strict';

Object.defineProperty(exports, "__esModule", {
  value: true
});
exports.Types = undefined;

var _typeof = typeof Symbol === "function" && typeof Symbol.iterator === "symbol" ? function (obj) { return typeof obj; } : function (obj) { return obj && typeof Symbol === "function" && obj.constructor === Symbol && obj !== Symbol.prototype ? "symbol" : typeof obj; }; // triggers.js


exports.addFunction = addFunction;
exports.addJob = addJob;
exports.addTrigger = addTrigger;
exports.removeFunction = removeFunction;
exports.removeJob = removeJob;
exports.removeTrigger = removeTrigger;
exports._unregister = _unregister;
exports._unregisterAll = _unregisterAll;
exports.getTrigger = getTrigger;
exports.triggerExists = triggerExists;
exports.getFunction = getFunction;
exports.getJob = getJob;
exports.getJobs = getJobs;
exports.getValidator = getValidator;
exports.getRequestObject = getRequestObject;
exports.getRequestQueryObject = getRequestQueryObject;
exports.getResponseObject = getResponseObject;
exports.maybeRunAfterFindTrigger = maybeRunAfterFindTrigger;
exports.maybeRunQueryTrigger = maybeRunQueryTrigger;
exports.maybeRunTrigger = maybeRunTrigger;
exports.inflate = inflate;

var _node = require('parse/node');

var _node2 = _interopRequireDefault(_node);

var _logger = require('./logger');

function _interopRequireDefault(obj) { return obj && obj.__esModule ? obj : { default: obj }; }

var Types = exports.Types = {
  beforeSave: 'beforeSave',
  afterSave: 'afterSave',
  beforeDelete: 'beforeDelete',
  afterDelete: 'afterDelete',
  beforeFind: 'beforeFind',
  afterFind: 'afterFind'
};

var baseStore = function baseStore() {
  var Validators = {};
  var Functions = {};
  var Jobs = {};
  var Triggers = Object.keys(Types).reduce(function (base, key) {
    base[key] = {};
    return base;
  }, {});

  return Object.freeze({
    Functions: Functions,
    Jobs: Jobs,
    Validators: Validators,
    Triggers: Triggers
  });
};

var _triggerStore = {};

function addFunction(functionName, handler, validationHandler, applicationId) {
  applicationId = applicationId || _node2.default.applicationId;
  _triggerStore[applicationId] = _triggerStore[applicationId] || baseStore();
  _triggerStore[applicationId].Functions[functionName] = handler;
  _triggerStore[applicationId].Validators[functionName] = validationHandler;
}

function addJob(jobName, handler, applicationId) {
  applicationId = applicationId || _node2.default.applicationId;
  _triggerStore[applicationId] = _triggerStore[applicationId] || baseStore();
  _triggerStore[applicationId].Jobs[jobName] = handler;
}

function addTrigger(type, className, handler, applicationId) {
  applicationId = applicationId || _node2.default.applicationId;
  _triggerStore[applicationId] = _triggerStore[applicationId] || baseStore();
  _triggerStore[applicationId].Triggers[type][className] = handler;
}

function removeFunction(functionName, applicationId) {
  applicationId = applicationId || _node2.default.applicationId;
  delete _triggerStore[applicationId].Functions[functionName];
}

function removeJob(jobName, applicationId) {
  applicationId = applicationId || _node2.default.applicationId;
  delete _triggerStore[applicationId].Jobs[jobName];
}

function removeTrigger(type, className, applicationId) {
  applicationId = applicationId || _node2.default.applicationId;
  delete _triggerStore[applicationId].Triggers[type][className];
}

function _unregister(appId, category, className, type) {
  if (type) {
    removeTrigger(className, type, appId);
    delete _triggerStore[appId][category][className][type];
  } else {
    delete _triggerStore[appId][category][className];
  }
}

function _unregisterAll() {
  Object.keys(_triggerStore).forEach(function (appId) {
    return delete _triggerStore[appId];
  });
}

function getTrigger(className, triggerType, applicationId) {
  if (!applicationId) {
    throw "Missing ApplicationID";
  }
  var manager = _triggerStore[applicationId];
  if (manager && manager.Triggers && manager.Triggers[triggerType] && manager.Triggers[triggerType][className]) {
    return manager.Triggers[triggerType][className];
  }
  return undefined;
}

function triggerExists(className, type, applicationId) {
  return getTrigger(className, type, applicationId) != undefined;
}

function getFunction(functionName, applicationId) {
  var manager = _triggerStore[applicationId];
  if (manager && manager.Functions) {
    return manager.Functions[functionName];
  }
  return undefined;
}

function getJob(jobName, applicationId) {
  var manager = _triggerStore[applicationId];
  if (manager && manager.Jobs) {
    return manager.Jobs[jobName];
  }
  return undefined;
}

function getJobs(applicationId) {
  var manager = _triggerStore[applicationId];
  if (manager && manager.Jobs) {
    return manager.Jobs;
  }
  return undefined;
}

function getValidator(functionName, applicationId) {
  var manager = _triggerStore[applicationId];
  if (manager && manager.Validators) {
    return manager.Validators[functionName];
  }
  return undefined;
}

function getRequestObject(triggerType, auth, parseObject, originalParseObject, config) {
  var request = {
    triggerName: triggerType,
    object: parseObject,
    master: false,
    log: config.loggerController
  };

  if (originalParseObject) {
    request.original = originalParseObject;
  }

  if (!auth) {
    return request;
  }
  if (auth.isMaster) {
    request['master'] = true;
  }
  if (auth.user) {
    request['user'] = auth.user;
  }
  if (auth.installationId) {
    request['installationId'] = auth.installationId;
  }
  return request;
}

function getRequestQueryObject(triggerType, auth, query, config) {
  var request = {
    triggerName: triggerType,
    query: query,
    master: false,
    log: config.loggerController
  };

  if (!auth) {
    return request;
  }
  if (auth.isMaster) {
    request['master'] = true;
  }
  if (auth.user) {
    request['user'] = auth.user;
  }
  if (auth.installationId) {
    request['installationId'] = auth.installationId;
  }
  return request;
}

// Creates the response object, and uses the request object to pass data
// The API will call this with REST API formatted objects, this will
// transform them to Parse.Object instances expected by Cloud Code.
// Any changes made to the object in a beforeSave will be included.
function getResponseObject(request, resolve, reject) {
  return {
    success: function success(response) {
      if (request.triggerName === Types.afterFind) {
        if (!response) {
          response = request.objects;
        }
        response = response.map(function (object) {
          return object.toJSON();
        });
        return resolve(response);
      }
      // Use the JSON response
      if (response && !request.object.equals(response) && request.triggerName === Types.beforeSave) {
        return resolve(response);
      }
      response = {};
      if (request.triggerName === Types.beforeSave) {
        response['object'] = request.object._getSaveJSON();
      }
      return resolve(response);
    },
    error: function error(code, message) {
      if (!message) {
        message = code;
        code = _node2.default.Error.SCRIPT_FAILED;
      }
      var scriptError = new _node2.default.Error(code, message);
      return reject(scriptError);
    }
  };
}

function userIdForLog(auth) {
  return auth && auth.user ? auth.user.id : undefined;
}

function logTriggerAfterHook(triggerType, className, input, auth) {
  var cleanInput = _logger.logger.truncateLogMessage(JSON.stringify(input));
  _logger.logger.info(triggerType + ' triggered for ' + className + ' for user ' + userIdForLog(auth) + ':\n  Input: ' + cleanInput, {
    className: className,
    triggerType: triggerType,
    user: userIdForLog(auth)
  });
}

function logTriggerSuccessBeforeHook(triggerType, className, input, result, auth) {
  var cleanInput = _logger.logger.truncateLogMessage(JSON.stringify(input));
  var cleanResult = _logger.logger.truncateLogMessage(JSON.stringify(result));
  _logger.logger.info(triggerType + ' triggered for ' + className + ' for user ' + userIdForLog(auth) + ':\n  Input: ' + cleanInput + '\n  Result: ' + cleanResult, {
    className: className,
    triggerType: triggerType,
    user: userIdForLog(auth)
  });
}

function logTriggerErrorBeforeHook(triggerType, className, input, auth, error) {
  var cleanInput = _logger.logger.truncateLogMessage(JSON.stringify(input));
  _logger.logger.error(triggerType + ' failed for ' + className + ' for user ' + userIdForLog(auth) + ':\n  Input: ' + cleanInput + '\n  Error: ' + JSON.stringify(error), {
    className: className,
    triggerType: triggerType,
    error: error,
    user: userIdForLog(auth)
  });
}

function maybeRunAfterFindTrigger(triggerType, auth, className, objects, config) {
  return new Promise(function (resolve, reject) {
    var trigger = getTrigger(className, triggerType, config.applicationId);
    if (!trigger) {
      return resolve();
    }
    var request = getRequestObject(triggerType, auth, null, null, config);
    var response = getResponseObject(request, function (object) {
      resolve(object);
    }, function (error) {
      reject(error);
    });
    logTriggerSuccessBeforeHook(triggerType, className, 'AfterFind', JSON.stringify(objects), auth);
    request.objects = objects.map(function (object) {
      //setting the class name to transform into parse object
      object.className = className;
      return _node2.default.Object.fromJSON(object);
    });
    var triggerPromise = trigger(request, response);
    if (triggerPromise && typeof triggerPromise.then === "function") {
      return triggerPromise.then(function (promiseResults) {
        if (promiseResults) {
          resolve(promiseResults);
        } else {
          return reject(new _node2.default.Error(_node2.default.Error.SCRIPT_FAILED, "AfterFind expect results to be returned in the promise"));
        }
      });
    }
  }).then(function (results) {
    logTriggerAfterHook(triggerType, className, JSON.stringify(results), auth);
    return results;
  });
}

function maybeRunQueryTrigger(triggerType, className, restWhere, restOptions, config, auth) {
  var trigger = getTrigger(className, triggerType, config.applicationId);
  if (!trigger) {
    return Promise.resolve({
      restWhere: restWhere,
      restOptions: restOptions
    });
  }

  var parseQuery = new _node2.default.Query(className);
  if (restWhere) {
    parseQuery._where = restWhere;
  }
  if (restOptions) {
    if (restOptions.include && restOptions.include.length > 0) {
      parseQuery._include = restOptions.include.split(',');
    }
    if (restOptions.skip) {
      parseQuery._skip = restOptions.skip;
    }
    if (restOptions.limit) {
      parseQuery._limit = restOptions.limit;
    }
  }
  var requestObject = getRequestQueryObject(triggerType, auth, parseQuery, config);
  return Promise.resolve().then(function () {
    return trigger(requestObject);
  }).then(function (result) {
    var queryResult = parseQuery;
    if (result && result instanceof _node2.default.Query) {
      queryResult = result;
    }
    var jsonQuery = queryResult.toJSON();
    if (jsonQuery.where) {
      restWhere = jsonQuery.where;
    }
    if (jsonQuery.limit) {
      restOptions = restOptions || {};
      restOptions.limit = jsonQuery.limit;
    }
    if (jsonQuery.skip) {
      restOptions = restOptions || {};
      restOptions.skip = jsonQuery.skip;
    }
    if (jsonQuery.include) {
      restOptions = restOptions || {};
      restOptions.include = jsonQuery.include;
    }
    if (jsonQuery.keys) {
      restOptions = restOptions || {};
      restOptions.keys = jsonQuery.keys;
    }
    return {
      restWhere: restWhere,
      restOptions: restOptions
    };
  }, function (err) {
    if (typeof err === 'string') {
      throw new _node2.default.Error(1, err);
    } else {
      throw err;
    }
  });
}

// To be used as part of the promise chain when saving/deleting an object
// Will resolve successfully if no trigger is configured
// Resolves to an object, empty or containing an object key. A beforeSave
// trigger will set the object key to the rest format object to save.
// originalParseObject is optional, we only need that for before/afterSave functions
function maybeRunTrigger(triggerType, auth, parseObject, originalParseObject, config) {
  if (!parseObject) {
    return Promise.resolve({});
  }
  return new Promise(function (resolve, reject) {
    var trigger = getTrigger(parseObject.className, triggerType, config.applicationId);
    if (!trigger) return resolve();
    var request = getRequestObject(triggerType, auth, parseObject, originalParseObject, config);
    var response = getResponseObject(request, function (object) {
      logTriggerSuccessBeforeHook(triggerType, parseObject.className, parseObject.toJSON(), object, auth);
      resolve(object);
    }, function (error) {
      logTriggerErrorBeforeHook(triggerType, parseObject.className, parseObject.toJSON(), auth, error);
      reject(error);
    });
    // Force the current Parse app before the trigger
    _node2.default.applicationId = config.applicationId;
    _node2.default.javascriptKey = config.javascriptKey || '';
    _node2.default.masterKey = config.masterKey;

    // AfterSave and afterDelete triggers can return a promise, which if they
    // do, needs to be resolved before this promise is resolved,
    // so trigger execution is synced with RestWrite.execute() call.
    // If triggers do not return a promise, they can run async code parallel
    // to the RestWrite.execute() call.
    var triggerPromise = trigger(request, response);
    if (triggerType === Types.afterSave || triggerType === Types.afterDelete) {
      logTriggerAfterHook(triggerType, parseObject.className, parseObject.toJSON(), auth);
      if (triggerPromise && typeof triggerPromise.then === "function") {
        return triggerPromise.then(resolve, resolve);
      } else {
        return resolve();
      }
    }
  });
}

// Converts a REST-format object to a Parse.Object
// data is either className or an object
function inflate(data, restObject) {
  var copy = (typeof data === 'undefined' ? 'undefined' : _typeof(data)) == 'object' ? data : { className: data };
  for (var key in restObject) {
    copy[key] = restObject[key];
  }
  return _node2.default.Object.fromJSON(copy);
}