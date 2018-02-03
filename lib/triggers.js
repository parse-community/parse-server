'use strict';

Object.defineProperty(exports, "__esModule", {
  value: true
});
exports.Types = undefined;
exports.addFunction = addFunction;
exports.addJob = addJob;
exports.addTrigger = addTrigger;
exports.addLiveQueryEventHandler = addLiveQueryEventHandler;
exports.removeFunction = removeFunction;
exports.removeTrigger = removeTrigger;
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
exports.runLiveQueryEventHandlers = runLiveQueryEventHandlers;

var _node = require('parse/node');

var _node2 = _interopRequireDefault(_node);

var _logger = require('./logger');

function _interopRequireDefault(obj) { return obj && obj.__esModule ? obj : { default: obj }; }

// triggers.js
const Types = exports.Types = {
  beforeSave: 'beforeSave',
  afterSave: 'afterSave',
  beforeDelete: 'beforeDelete',
  afterDelete: 'afterDelete',
  beforeFind: 'beforeFind',
  afterFind: 'afterFind'
};

const baseStore = function () {
  const Validators = {};
  const Functions = {};
  const Jobs = {};
  const LiveQuery = [];
  const Triggers = Object.keys(Types).reduce(function (base, key) {
    base[key] = {};
    return base;
  }, {});

  return Object.freeze({
    Functions,
    Jobs,
    Validators,
    Triggers,
    LiveQuery
  });
};

function validateClassNameForTriggers(className, type) {
  const restrictedClassNames = ['_Session'];
  if (restrictedClassNames.indexOf(className) != -1) {
    throw `Triggers are not supported for ${className} class.`;
  }
  if (type == Types.beforeSave && className === '_PushStatus') {
    // _PushStatus uses undocumented nested key increment ops
    // allowing beforeSave would mess up the objects big time
    // TODO: Allow proper documented way of using nested increment ops
    throw 'Only afterSave is allowed on _PushStatus';
  }
  return className;
}

const _triggerStore = {};

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
  validateClassNameForTriggers(className, type);
  applicationId = applicationId || _node2.default.applicationId;
  _triggerStore[applicationId] = _triggerStore[applicationId] || baseStore();
  _triggerStore[applicationId].Triggers[type][className] = handler;
}

function addLiveQueryEventHandler(handler, applicationId) {
  applicationId = applicationId || _node2.default.applicationId;
  _triggerStore[applicationId] = _triggerStore[applicationId] || baseStore();
  _triggerStore[applicationId].LiveQuery.push(handler);
}

function removeFunction(functionName, applicationId) {
  applicationId = applicationId || _node2.default.applicationId;
  delete _triggerStore[applicationId].Functions[functionName];
}

function removeTrigger(type, className, applicationId) {
  applicationId = applicationId || _node2.default.applicationId;
  delete _triggerStore[applicationId].Triggers[type][className];
}

function _unregisterAll() {
  Object.keys(_triggerStore).forEach(appId => delete _triggerStore[appId]);
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
    log: config.loggerController,
    headers: config.headers,
    ip: config.ip
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

function getRequestQueryObject(triggerType, auth, query, count, config, isGet) {
  isGet = !!isGet;

  var request = {
    triggerName: triggerType,
    query,
    master: false,
    count,
    log: config.loggerController,
    isGet,
    headers: config.headers,
    ip: config.ip
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
    success: function (response) {
      if (request.triggerName === Types.afterFind) {
        if (!response) {
          response = request.objects;
        }
        response = response.map(object => {
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
    error: function (code, message) {
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
  const cleanInput = _logger.logger.truncateLogMessage(JSON.stringify(input));
  _logger.logger.info(`${triggerType} triggered for ${className} for user ${userIdForLog(auth)}:\n  Input: ${cleanInput}`, {
    className,
    triggerType,
    user: userIdForLog(auth)
  });
}

function logTriggerSuccessBeforeHook(triggerType, className, input, result, auth) {
  const cleanInput = _logger.logger.truncateLogMessage(JSON.stringify(input));
  const cleanResult = _logger.logger.truncateLogMessage(JSON.stringify(result));
  _logger.logger.info(`${triggerType} triggered for ${className} for user ${userIdForLog(auth)}:\n  Input: ${cleanInput}\n  Result: ${cleanResult}`, {
    className,
    triggerType,
    user: userIdForLog(auth)
  });
}

function logTriggerErrorBeforeHook(triggerType, className, input, auth, error) {
  const cleanInput = _logger.logger.truncateLogMessage(JSON.stringify(input));
  _logger.logger.error(`${triggerType} failed for ${className} for user ${userIdForLog(auth)}:\n  Input: ${cleanInput}\n  Error: ${JSON.stringify(error)}`, {
    className,
    triggerType,
    error,
    user: userIdForLog(auth)
  });
}

function maybeRunAfterFindTrigger(triggerType, auth, className, objects, config) {
  return new Promise((resolve, reject) => {
    const trigger = getTrigger(className, triggerType, config.applicationId);
    if (!trigger) {
      return resolve();
    }
    const request = getRequestObject(triggerType, auth, null, null, config);
    const response = getResponseObject(request, object => {
      resolve(object);
    }, error => {
      reject(error);
    });
    logTriggerSuccessBeforeHook(triggerType, className, 'AfterFind', JSON.stringify(objects), auth);
    request.objects = objects.map(object => {
      //setting the class name to transform into parse object
      object.className = className;
      return _node2.default.Object.fromJSON(object);
    });
    const triggerPromise = trigger(request, response);
    if (triggerPromise && typeof triggerPromise.then === "function") {
      return triggerPromise.then(promiseResults => {
        if (promiseResults) {
          resolve(promiseResults);
        } else {
          return reject(new _node2.default.Error(_node2.default.Error.SCRIPT_FAILED, "AfterFind expect results to be returned in the promise"));
        }
      });
    }
  }).then(results => {
    logTriggerAfterHook(triggerType, className, JSON.stringify(results), auth);
    return results;
  });
}

function maybeRunQueryTrigger(triggerType, className, restWhere, restOptions, config, auth, isGet) {
  const trigger = getTrigger(className, triggerType, config.applicationId);
  if (!trigger) {
    return Promise.resolve({
      restWhere,
      restOptions
    });
  }

  const parseQuery = new _node2.default.Query(className);
  if (restWhere) {
    parseQuery._where = restWhere;
  }
  let count = false;
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
    count = !!restOptions.count;
  }
  const requestObject = getRequestQueryObject(triggerType, auth, parseQuery, count, config, isGet);
  return Promise.resolve().then(() => {
    return trigger(requestObject);
  }).then(result => {
    let queryResult = parseQuery;
    if (result && result instanceof _node2.default.Query) {
      queryResult = result;
    }
    const jsonQuery = queryResult.toJSON();
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
    if (jsonQuery.order) {
      restOptions = restOptions || {};
      restOptions.order = jsonQuery.order;
    }
    if (requestObject.readPreference) {
      restOptions = restOptions || {};
      restOptions.readPreference = requestObject.readPreference;
    }
    if (requestObject.includeReadPreference) {
      restOptions = restOptions || {};
      restOptions.includeReadPreference = requestObject.includeReadPreference;
    }
    if (requestObject.subqueryReadPreference) {
      restOptions = restOptions || {};
      restOptions.subqueryReadPreference = requestObject.subqueryReadPreference;
    }
    return {
      restWhere,
      restOptions
    };
  }, err => {
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
    var response = getResponseObject(request, object => {
      logTriggerSuccessBeforeHook(triggerType, parseObject.className, parseObject.toJSON(), object, auth);
      resolve(object);
    }, error => {
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
  var copy = typeof data == 'object' ? data : { className: data };
  for (var key in restObject) {
    copy[key] = restObject[key];
  }
  return _node2.default.Object.fromJSON(copy);
}

function runLiveQueryEventHandlers(data, applicationId = _node2.default.applicationId) {
  if (!_triggerStore || !_triggerStore[applicationId] || !_triggerStore[applicationId].LiveQuery) {
    return;
  }
  _triggerStore[applicationId].LiveQuery.forEach(handler => handler(data));
}