"use strict";

Object.defineProperty(exports, "__esModule", {
  value: true
});
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
exports.getFunctionNames = getFunctionNames;
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
exports.Types = void 0;

var _node = _interopRequireDefault(require("parse/node"));

var _logger = require("./logger");

function _interopRequireDefault(obj) { return obj && obj.__esModule ? obj : { default: obj }; }

// triggers.js
const Types = {
  beforeLogin: 'beforeLogin',
  afterLogout: 'afterLogout',
  beforeSave: 'beforeSave',
  afterSave: 'afterSave',
  beforeDelete: 'beforeDelete',
  afterDelete: 'afterDelete',
  beforeFind: 'beforeFind',
  afterFind: 'afterFind'
};
exports.Types = Types;

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
  if (type == Types.beforeSave && className === '_PushStatus') {
    // _PushStatus uses undocumented nested key increment ops
    // allowing beforeSave would mess up the objects big time
    // TODO: Allow proper documented way of using nested increment ops
    throw 'Only afterSave is allowed on _PushStatus';
  }

  if (type === Types.beforeLogin && className !== '_User') {
    // TODO: check if upstream code will handle `Error` instance rather
    // than this anti-pattern of throwing strings
    throw 'Only the _User class is allowed for the beforeLogin trigger';
  }

  if (type === Types.afterLogout && className !== '_Session') {
    // TODO: check if upstream code will handle `Error` instance rather
    // than this anti-pattern of throwing strings
    throw 'Only the _Session class is allowed for the afterLogout trigger.';
  }

  if (className === '_Session' && type !== Types.afterLogout) {
    // TODO: check if upstream code will handle `Error` instance rather
    // than this anti-pattern of throwing strings
    throw 'Only the afterLogout trigger is allowed for the _Session class.';
  }

  return className;
}

const _triggerStore = {};
const Category = {
  Functions: 'Functions',
  Validators: 'Validators',
  Jobs: 'Jobs',
  Triggers: 'Triggers'
};

function getStore(category, name, applicationId) {
  const path = name.split('.');
  path.splice(-1); // remove last component

  applicationId = applicationId || _node.default.applicationId;
  _triggerStore[applicationId] = _triggerStore[applicationId] || baseStore();
  let store = _triggerStore[applicationId][category];

  for (const component of path) {
    store = store[component];

    if (!store) {
      return undefined;
    }
  }

  return store;
}

function add(category, name, handler, applicationId) {
  const lastComponent = name.split('.').splice(-1);
  const store = getStore(category, name, applicationId);
  store[lastComponent] = handler;
}

function remove(category, name, applicationId) {
  const lastComponent = name.split('.').splice(-1);
  const store = getStore(category, name, applicationId);
  delete store[lastComponent];
}

function get(category, name, applicationId) {
  const lastComponent = name.split('.').splice(-1);
  const store = getStore(category, name, applicationId);
  return store[lastComponent];
}

function addFunction(functionName, handler, validationHandler, applicationId) {
  add(Category.Functions, functionName, handler, applicationId);
  add(Category.Validators, functionName, validationHandler, applicationId);
}

function addJob(jobName, handler, applicationId) {
  add(Category.Jobs, jobName, handler, applicationId);
}

function addTrigger(type, className, handler, applicationId) {
  validateClassNameForTriggers(className, type);
  add(Category.Triggers, `${type}.${className}`, handler, applicationId);
}

function addLiveQueryEventHandler(handler, applicationId) {
  applicationId = applicationId || _node.default.applicationId;
  _triggerStore[applicationId] = _triggerStore[applicationId] || baseStore();

  _triggerStore[applicationId].LiveQuery.push(handler);
}

function removeFunction(functionName, applicationId) {
  remove(Category.Functions, functionName, applicationId);
}

function removeTrigger(type, className, applicationId) {
  remove(Category.Triggers, `${type}.${className}`, applicationId);
}

function _unregisterAll() {
  Object.keys(_triggerStore).forEach(appId => delete _triggerStore[appId]);
}

function getTrigger(className, triggerType, applicationId) {
  if (!applicationId) {
    throw 'Missing ApplicationID';
  }

  return get(Category.Triggers, `${triggerType}.${className}`, applicationId);
}

function triggerExists(className, type, applicationId) {
  return getTrigger(className, type, applicationId) != undefined;
}

function getFunction(functionName, applicationId) {
  return get(Category.Functions, functionName, applicationId);
}

function getFunctionNames(applicationId) {
  const store = _triggerStore[applicationId] && _triggerStore[applicationId][Category.Functions] || {};
  const functionNames = [];

  const extractFunctionNames = (namespace, store) => {
    Object.keys(store).forEach(name => {
      const value = store[name];

      if (namespace) {
        name = `${namespace}.${name}`;
      }

      if (typeof value === 'function') {
        functionNames.push(name);
      } else {
        extractFunctionNames(name, value);
      }
    });
  };

  extractFunctionNames(null, store);
  return functionNames;
}

function getJob(jobName, applicationId) {
  return get(Category.Jobs, jobName, applicationId);
}

function getJobs(applicationId) {
  var manager = _triggerStore[applicationId];

  if (manager && manager.Jobs) {
    return manager.Jobs;
  }

  return undefined;
}

function getValidator(functionName, applicationId) {
  return get(Category.Validators, functionName, applicationId);
}

function getRequestObject(triggerType, auth, parseObject, originalParseObject, config, context) {
  const request = {
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

  if (triggerType === Types.beforeSave || triggerType === Types.afterSave) {
    // Set a copy of the context on the request object.
    request.context = Object.assign({}, context);
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
} // Creates the response object, and uses the request object to pass data
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
      } // Use the JSON response


      if (response && typeof response === 'object' && !request.object.equals(response) && request.triggerName === Types.beforeSave) {
        return resolve(response);
      }

      if (response && typeof response === 'object' && request.triggerName === Types.afterSave) {
        return resolve(response);
      }

      if (request.triggerName === Types.afterSave) {
        return resolve();
      }

      response = {};

      if (request.triggerName === Types.beforeSave) {
        response['object'] = request.object._getSaveJSON();
      }

      return resolve(response);
    },
    error: function (error) {
      if (error instanceof _node.default.Error) {
        reject(error);
      } else if (error instanceof Error) {
        reject(new _node.default.Error(_node.default.Error.SCRIPT_FAILED, error.message));
      } else {
        reject(new _node.default.Error(_node.default.Error.SCRIPT_FAILED, error));
      }
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
    const {
      success,
      error
    } = getResponseObject(request, object => {
      resolve(object);
    }, error => {
      reject(error);
    });
    logTriggerSuccessBeforeHook(triggerType, className, 'AfterFind', JSON.stringify(objects), auth);
    request.objects = objects.map(object => {
      //setting the class name to transform into parse object
      object.className = className;
      return _node.default.Object.fromJSON(object);
    });
    return Promise.resolve().then(() => {
      const response = trigger(request);

      if (response && typeof response.then === 'function') {
        return response.then(results => {
          if (!results) {
            throw new _node.default.Error(_node.default.Error.SCRIPT_FAILED, 'AfterFind expect results to be returned in the promise');
          }

          return results;
        });
      }

      return response;
    }).then(success, error);
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

  const json = Object.assign({}, restOptions);
  json.where = restWhere;
  const parseQuery = new _node.default.Query(className);
  parseQuery.withJSON(json);
  let count = false;

  if (restOptions) {
    count = !!restOptions.count;
  }

  const requestObject = getRequestQueryObject(triggerType, auth, parseQuery, count, config, isGet);
  return Promise.resolve().then(() => {
    return trigger(requestObject);
  }).then(result => {
    let queryResult = parseQuery;

    if (result && result instanceof _node.default.Query) {
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

    if (jsonQuery.excludeKeys) {
      restOptions = restOptions || {};
      restOptions.excludeKeys = jsonQuery.excludeKeys;
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
      throw new _node.default.Error(1, err);
    } else {
      throw err;
    }
  });
} // To be used as part of the promise chain when saving/deleting an object
// Will resolve successfully if no trigger is configured
// Resolves to an object, empty or containing an object key. A beforeSave
// trigger will set the object key to the rest format object to save.
// originalParseObject is optional, we only need that for before/afterSave functions


function maybeRunTrigger(triggerType, auth, parseObject, originalParseObject, config, context) {
  if (!parseObject) {
    return Promise.resolve({});
  }

  return new Promise(function (resolve, reject) {
    var trigger = getTrigger(parseObject.className, triggerType, config.applicationId);
    if (!trigger) return resolve();
    var request = getRequestObject(triggerType, auth, parseObject, originalParseObject, config, context);
    var {
      success,
      error
    } = getResponseObject(request, object => {
      logTriggerSuccessBeforeHook(triggerType, parseObject.className, parseObject.toJSON(), object, auth);

      if (triggerType === Types.beforeSave || triggerType === Types.afterSave) {
        Object.assign(context, request.context);
      }

      resolve(object);
    }, error => {
      logTriggerErrorBeforeHook(triggerType, parseObject.className, parseObject.toJSON(), auth, error);
      reject(error);
    }); // AfterSave and afterDelete triggers can return a promise, which if they
    // do, needs to be resolved before this promise is resolved,
    // so trigger execution is synced with RestWrite.execute() call.
    // If triggers do not return a promise, they can run async code parallel
    // to the RestWrite.execute() call.

    return Promise.resolve().then(() => {
      const promise = trigger(request);

      if (triggerType === Types.afterSave || triggerType === Types.afterDelete) {
        logTriggerAfterHook(triggerType, parseObject.className, parseObject.toJSON(), auth);
      } // beforeSave is expected to return null (nothing)


      if (triggerType === Types.beforeSave) {
        if (promise && typeof promise.then === 'function') {
          return promise.then(response => {
            // response.object may come from express routing before hook
            if (response && response.object) {
              return response;
            }

            return null;
          });
        }

        return null;
      }

      return promise;
    }).then(success, error);
  });
} // Converts a REST-format object to a Parse.Object
// data is either className or an object


function inflate(data, restObject) {
  var copy = typeof data == 'object' ? data : {
    className: data
  };

  for (var key in restObject) {
    copy[key] = restObject[key];
  }

  return _node.default.Object.fromJSON(copy);
}

function runLiveQueryEventHandlers(data, applicationId = _node.default.applicationId) {
  if (!_triggerStore || !_triggerStore[applicationId] || !_triggerStore[applicationId].LiveQuery) {
    return;
  }

  _triggerStore[applicationId].LiveQuery.forEach(handler => handler(data));
}
//# sourceMappingURL=data:application/json;charset=utf-8;base64,eyJ2ZXJzaW9uIjozLCJzb3VyY2VzIjpbIi4uL3NyYy90cmlnZ2Vycy5qcyJdLCJuYW1lcyI6WyJUeXBlcyIsImJlZm9yZUxvZ2luIiwiYWZ0ZXJMb2dvdXQiLCJiZWZvcmVTYXZlIiwiYWZ0ZXJTYXZlIiwiYmVmb3JlRGVsZXRlIiwiYWZ0ZXJEZWxldGUiLCJiZWZvcmVGaW5kIiwiYWZ0ZXJGaW5kIiwiYmFzZVN0b3JlIiwiVmFsaWRhdG9ycyIsIkZ1bmN0aW9ucyIsIkpvYnMiLCJMaXZlUXVlcnkiLCJUcmlnZ2VycyIsIk9iamVjdCIsImtleXMiLCJyZWR1Y2UiLCJiYXNlIiwia2V5IiwiZnJlZXplIiwidmFsaWRhdGVDbGFzc05hbWVGb3JUcmlnZ2VycyIsImNsYXNzTmFtZSIsInR5cGUiLCJfdHJpZ2dlclN0b3JlIiwiQ2F0ZWdvcnkiLCJnZXRTdG9yZSIsImNhdGVnb3J5IiwibmFtZSIsImFwcGxpY2F0aW9uSWQiLCJwYXRoIiwic3BsaXQiLCJzcGxpY2UiLCJQYXJzZSIsInN0b3JlIiwiY29tcG9uZW50IiwidW5kZWZpbmVkIiwiYWRkIiwiaGFuZGxlciIsImxhc3RDb21wb25lbnQiLCJyZW1vdmUiLCJnZXQiLCJhZGRGdW5jdGlvbiIsImZ1bmN0aW9uTmFtZSIsInZhbGlkYXRpb25IYW5kbGVyIiwiYWRkSm9iIiwiam9iTmFtZSIsImFkZFRyaWdnZXIiLCJhZGRMaXZlUXVlcnlFdmVudEhhbmRsZXIiLCJwdXNoIiwicmVtb3ZlRnVuY3Rpb24iLCJyZW1vdmVUcmlnZ2VyIiwiX3VucmVnaXN0ZXJBbGwiLCJmb3JFYWNoIiwiYXBwSWQiLCJnZXRUcmlnZ2VyIiwidHJpZ2dlclR5cGUiLCJ0cmlnZ2VyRXhpc3RzIiwiZ2V0RnVuY3Rpb24iLCJnZXRGdW5jdGlvbk5hbWVzIiwiZnVuY3Rpb25OYW1lcyIsImV4dHJhY3RGdW5jdGlvbk5hbWVzIiwibmFtZXNwYWNlIiwidmFsdWUiLCJnZXRKb2IiLCJnZXRKb2JzIiwibWFuYWdlciIsImdldFZhbGlkYXRvciIsImdldFJlcXVlc3RPYmplY3QiLCJhdXRoIiwicGFyc2VPYmplY3QiLCJvcmlnaW5hbFBhcnNlT2JqZWN0IiwiY29uZmlnIiwiY29udGV4dCIsInJlcXVlc3QiLCJ0cmlnZ2VyTmFtZSIsIm9iamVjdCIsIm1hc3RlciIsImxvZyIsImxvZ2dlckNvbnRyb2xsZXIiLCJoZWFkZXJzIiwiaXAiLCJvcmlnaW5hbCIsImFzc2lnbiIsImlzTWFzdGVyIiwidXNlciIsImluc3RhbGxhdGlvbklkIiwiZ2V0UmVxdWVzdFF1ZXJ5T2JqZWN0IiwicXVlcnkiLCJjb3VudCIsImlzR2V0IiwiZ2V0UmVzcG9uc2VPYmplY3QiLCJyZXNvbHZlIiwicmVqZWN0Iiwic3VjY2VzcyIsInJlc3BvbnNlIiwib2JqZWN0cyIsIm1hcCIsInRvSlNPTiIsImVxdWFscyIsIl9nZXRTYXZlSlNPTiIsImVycm9yIiwiRXJyb3IiLCJTQ1JJUFRfRkFJTEVEIiwibWVzc2FnZSIsInVzZXJJZEZvckxvZyIsImlkIiwibG9nVHJpZ2dlckFmdGVySG9vayIsImlucHV0IiwiY2xlYW5JbnB1dCIsImxvZ2dlciIsInRydW5jYXRlTG9nTWVzc2FnZSIsIkpTT04iLCJzdHJpbmdpZnkiLCJpbmZvIiwibG9nVHJpZ2dlclN1Y2Nlc3NCZWZvcmVIb29rIiwicmVzdWx0IiwiY2xlYW5SZXN1bHQiLCJsb2dUcmlnZ2VyRXJyb3JCZWZvcmVIb29rIiwibWF5YmVSdW5BZnRlckZpbmRUcmlnZ2VyIiwiUHJvbWlzZSIsInRyaWdnZXIiLCJmcm9tSlNPTiIsInRoZW4iLCJyZXN1bHRzIiwibWF5YmVSdW5RdWVyeVRyaWdnZXIiLCJyZXN0V2hlcmUiLCJyZXN0T3B0aW9ucyIsImpzb24iLCJ3aGVyZSIsInBhcnNlUXVlcnkiLCJRdWVyeSIsIndpdGhKU09OIiwicmVxdWVzdE9iamVjdCIsInF1ZXJ5UmVzdWx0IiwianNvblF1ZXJ5IiwibGltaXQiLCJza2lwIiwiaW5jbHVkZSIsImV4Y2x1ZGVLZXlzIiwib3JkZXIiLCJyZWFkUHJlZmVyZW5jZSIsImluY2x1ZGVSZWFkUHJlZmVyZW5jZSIsInN1YnF1ZXJ5UmVhZFByZWZlcmVuY2UiLCJlcnIiLCJtYXliZVJ1blRyaWdnZXIiLCJwcm9taXNlIiwiaW5mbGF0ZSIsImRhdGEiLCJyZXN0T2JqZWN0IiwiY29weSIsInJ1bkxpdmVRdWVyeUV2ZW50SGFuZGxlcnMiXSwibWFwcGluZ3MiOiI7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7O0FBQ0E7O0FBQ0E7Ozs7QUFGQTtBQUlPLE1BQU1BLEtBQUssR0FBRztBQUNuQkMsRUFBQUEsV0FBVyxFQUFFLGFBRE07QUFFbkJDLEVBQUFBLFdBQVcsRUFBRSxhQUZNO0FBR25CQyxFQUFBQSxVQUFVLEVBQUUsWUFITztBQUluQkMsRUFBQUEsU0FBUyxFQUFFLFdBSlE7QUFLbkJDLEVBQUFBLFlBQVksRUFBRSxjQUxLO0FBTW5CQyxFQUFBQSxXQUFXLEVBQUUsYUFOTTtBQU9uQkMsRUFBQUEsVUFBVSxFQUFFLFlBUE87QUFRbkJDLEVBQUFBLFNBQVMsRUFBRTtBQVJRLENBQWQ7OztBQVdQLE1BQU1DLFNBQVMsR0FBRyxZQUFXO0FBQzNCLFFBQU1DLFVBQVUsR0FBRyxFQUFuQjtBQUNBLFFBQU1DLFNBQVMsR0FBRyxFQUFsQjtBQUNBLFFBQU1DLElBQUksR0FBRyxFQUFiO0FBQ0EsUUFBTUMsU0FBUyxHQUFHLEVBQWxCO0FBQ0EsUUFBTUMsUUFBUSxHQUFHQyxNQUFNLENBQUNDLElBQVAsQ0FBWWhCLEtBQVosRUFBbUJpQixNQUFuQixDQUEwQixVQUFTQyxJQUFULEVBQWVDLEdBQWYsRUFBb0I7QUFDN0RELElBQUFBLElBQUksQ0FBQ0MsR0FBRCxDQUFKLEdBQVksRUFBWjtBQUNBLFdBQU9ELElBQVA7QUFDRCxHQUhnQixFQUdkLEVBSGMsQ0FBakI7QUFLQSxTQUFPSCxNQUFNLENBQUNLLE1BQVAsQ0FBYztBQUNuQlQsSUFBQUEsU0FEbUI7QUFFbkJDLElBQUFBLElBRm1CO0FBR25CRixJQUFBQSxVQUhtQjtBQUluQkksSUFBQUEsUUFKbUI7QUFLbkJELElBQUFBO0FBTG1CLEdBQWQsQ0FBUDtBQU9ELENBakJE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SUFBakIsRUFBdUJDLFVBQXZCLEVBQW1DO0FBQ3hDLE1BQUlDLElBQUksR0FBRyxPQUFPRixJQUFQLElBQWUsUUFBZixHQUEwQkEsSUFBMUIsR0FBaUM7QUFBRTlILElBQUFBLFNBQVMsRUFBRThIO0FBQWIsR0FBNUM7O0FBQ0EsT0FBSyxJQUFJakksR0FBVCxJQUFnQmtJLFVBQWhCLEVBQTRCO0FBQzFCQyxJQUFBQSxJQUFJLENBQUNuSSxHQUFELENBQUosR0FBWWtJLFVBQVUsQ0FBQ2xJLEdBQUQsQ0FBdEI7QUFDRDs7QUFDRCxTQUFPYyxjQUFNbEIsTUFBTixDQUFhMkcsUUFBYixDQUFzQjRCLElBQXRCLENBQVA7QUFDRDs7QUFFTSxTQUFTQyx5QkFBVCxDQUNMSCxJQURLLEVBRUx2SCxhQUFhLEdBQUdJLGNBQU1KLGFBRmpCLEVBR0w7QUFDQSxNQUNFLENBQUNMLGFBQUQsSUFDQSxDQUFDQSxhQUFhLENBQUNLLGFBQUQsQ0FEZCxJQUVBLENBQUNMLGFBQWEsQ0FBQ0ssYUFBRCxDQUFiLENBQTZCaEIsU0FIaEMsRUFJRTtBQUNBO0FBQ0Q7O0FBQ0RXLEVBQUFBLGFBQWEsQ0FBQ0ssYUFBRCxDQUFiLENBQTZCaEIsU0FBN0IsQ0FBdUN3QyxPQUF2QyxDQUErQ2YsT0FBTyxJQUFJQSxPQUFPLENBQUM4RyxJQUFELENBQWpFO0FBQ0QiLCJzb3VyY2VzQ29udGVudCI6WyIvLyB0cmlnZ2Vycy5qc1xuaW1wb3J0IFBhcnNlIGZyb20gJ3BhcnNlL25vZGUnO1xuaW1wb3J0IHsgbG9nZ2VyIH0gZnJvbSAnLi9sb2dnZXInO1xuXG5leHBvcnQgY29uc3QgVHlwZXMgPSB7XG4gIGJlZm9yZUxvZ2luOiAnYmVmb3JlTG9naW4nLFxuICBhZnRlckxvZ291dDogJ2FmdGVyTG9nb3V0JyxcbiAgYmVmb3JlU2F2ZTogJ2JlZm9yZVNhdmUnLFxuICBhZnRlclNhdmU6ICdhZnRlclNhdmUnLFxuICBiZWZvcmVEZWxldGU6ICdiZWZvcmVEZWxldGUnLFxuICBhZnRlckRlbGV0ZTogJ2FmdGVyRGVsZXRlJyxcbiAgYmVmb3JlRmluZDogJ2JlZm9yZUZpbmQnLFxuICBhZnRlckZpbmQ6ICdhZnRlckZpbmQnLFxufTtcblxuY29uc3QgYmFzZVN0b3JlID0gZnVuY3Rpb24oKSB7XG4gIGNvbnN0IFZhbGlkYXRvcnMgPSB7fTtcbiAgY29uc3QgRnVuY3Rpb25zID0ge307XG4gIGNvbnN0IEpvYnMgPSB7fTtcbiAgY29uc3QgTGl2ZVF1ZXJ5ID0gW107XG4gIGNvbnN0IFRyaWdnZXJzID0gT2JqZWN0LmtleXMoVHlwZXMpLnJlZHVjZShmdW5jdGlvbihiYXNlLCBrZXkpIHtcbiAgICBiYXNlW2tleV0gPSB7fTtcbiAgICByZXR1cm4gYmFzZTtcbiAgfSwge30pO1xuXG4gIHJldHVybiBPYmplY3QuZnJlZXplKHtcbiAgICBGdW5jdGlvbnMsXG4gICAgSm9icyxcbiAgICBWYWxpZGF0b3JzLFxuICAgIFRyaWdnZXJzLFxuICAgIExpdmVRdWVyeSxcbiAgfSk7XG59O1xuXG5mdW5jdGlvbiB2YWxpZGF0ZUNsYXNzTmFtZUZvclRyaWdnZXJzKGNsYXNzTmFtZSwgdHlwZSkge1xuICBpZiAodHlwZSA9PSBUeXBlcy5iZWZvcmVTYXZlICYmIGNsYXNzTmFtZSA9PT0gJ19QdXNoU3RhdHVzJykge1xuICAgIC8vIF9QdXNoU3RhdHVzIHVzZXMgdW5kb2N1bWVudGVkIG5lc3RlZCBrZXkgaW5jcmVtZW50IG9wc1xuICAgIC8vIGFsbG93aW5nIGJlZm9yZVNhdmUgd291bGQgbWVzcyB1cCB0aGUgb2JqZWN0cyBiaWcgdGltZVxuICAgIC8vIFRPRE86IEFsbG93IHByb3BlciBkb2N1bWVudGVkIHdheSBvZiB1c2luZyBuZXN0ZWQgaW5jcmVtZW50IG9wc1xuICAgIHRocm93ICdPbmx5IGFmdGVyU2F2ZSBpcyBhbGxvd2VkIG9uIF9QdXNoU3RhdHVzJztcbiAgfVxuICBpZiAodHlwZSA9PT0gVHlwZXMuYmVmb3JlTG9naW4gJiYgY2xhc3NOYW1lICE9PSAnX1VzZXInKSB7XG4gICAgLy8gVE9ETzogY2hlY2sgaWYgdXBzdHJlYW0gY29kZSB3aWxsIGhhbmRsZSBgRXJyb3JgIGluc3RhbmNlIHJhdGhlclxuICAgIC8vIHRoYW4gdGhpcyBhbnRpLXBhdHRlcm4gb2YgdGhyb3dpbmcgc3RyaW5nc1xuICAgIHRocm93ICdPbmx5IHRoZSBfVXNlciBjbGFzcyBpcyBhbGxvd2VkIGZvciB0aGUgYmVmb3JlTG9naW4gdHJpZ2dlcic7XG4gIH1cbiAgaWYgKHR5cGUgPT09IFR5cGVzLmFmdGVyTG9nb3V0ICYmIGNsYXNzTmFtZSAhPT0gJ19TZXNzaW9uJykge1xuICAgIC8vIFRPRE86IGNoZWNrIGlmIHVwc3RyZWFtIGNvZGUgd2lsbCBoYW5kbGUgYEVycm9yYCBpbnN0YW5jZSByYXRoZXJcbiAgICAvLyB0aGFuIHRoaXMgYW50aS1wYXR0ZXJuIG9mIHRocm93aW5nIHN0cmluZ3NcbiAgICB0aHJvdyAnT25seSB0aGUgX1Nlc3Npb24gY2xhc3MgaXMgYWxsb3dlZCBmb3IgdGhlIGFmdGVyTG9nb3V0IHRyaWdnZXIuJztcbiAgfVxuICBpZiAoY2xhc3NOYW1lID09PSAnX1Nlc3Npb24nICYmIHR5cGUgIT09IFR5cGVzLmFmdGVyTG9nb3V0KSB7XG4gICAgLy8gVE9ETzogY2hlY2sgaWYgdXBzdHJlYW0gY29kZSB3aWxsIGhhbmRsZSBgRXJyb3JgIGluc3RhbmNlIHJhdGhlclxuICAgIC8vIHRoYW4gdGhpcyBhbnRpLXBhdHRlcm4gb2YgdGhyb3dpbmcgc3RyaW5nc1xuICAgIHRocm93ICdPbmx5IHRoZSBhZnRlckxvZ291dCB0cmlnZ2VyIGlzIGFsbG93ZWQgZm9yIHRoZSBfU2Vzc2lvbiBjbGFzcy4nO1xuICB9XG4gIHJldHVybiBjbGFzc05hbWU7XG59XG5cbmNvbnN0IF90cmlnZ2VyU3RvcmUgPSB7fTtcblxuY29uc3QgQ2F0ZWdvcnkgPSB7XG4gIEZ1bmN0aW9uczogJ0Z1bmN0aW9ucycsXG4gIFZhbGlkYXRvcnM6ICdWYWxpZGF0b3JzJyxcbiAgSm9iczogJ0pvYnMnLFxuICBUcmlnZ2VyczogJ1RyaWdnZXJzJyxcbn07XG5cbmZ1bmN0aW9uIGdldFN0b3JlKGNhdGVnb3J5LCBuYW1lLCBhcHBsaWNhdGlvbklkKSB7XG4gIGNvbnN0IHBhdGggPSBuYW1lLnNwbGl0KCcuJyk7XG4gIHBhdGguc3BsaWNlKC0xKTsgLy8gcmVtb3ZlIGxhc3QgY29tcG9uZW50XG4gIGFwcGxpY2F0aW9uSWQgPSBhcHBsaWNhdGlvbklkIHx8IFBhcnNlLmFwcGxpY2F0aW9uSWQ7XG4gIF90cmlnZ2VyU3RvcmVbYXBwbGljYXRpb25JZF0gPSBfdHJpZ2dlclN0b3JlW2FwcGxpY2F0aW9uSWRdIHx8IGJhc2VTdG9yZSgpO1xuICBsZXQgc3RvcmUgPSBfdHJpZ2dlclN0b3JlW2FwcGxpY2F0aW9uSWRdW2NhdGVnb3J5XTtcbiAgZm9yIChjb25zdCBjb21wb25lbnQgb2YgcGF0aCkge1xuICAgIHN0b3JlID0gc3RvcmVbY29tcG9uZW50XTtcbiAgICBpZiAoIXN0b3JlKSB7XG4gICAgICByZXR1cm4gdW5kZWZpbmVkO1xuICAgIH1cbiAgfVxuICByZXR1cm4gc3RvcmU7XG59XG5cbmZ1bmN0aW9uIGFkZChjYXRlZ29yeSwgbmFtZSwgaGFuZGxlciwgYXBwbGljYXRpb25JZCkge1xuICBjb25zdCBsYXN0Q29tcG9uZW50ID0gbmFtZS5zcGxpdCgnLicpLnNwbGljZSgtMSk7XG4gIGNvbnN0IHN0b3JlID0gZ2V0U3RvcmUoY2F0ZWdvcnksIG5hbWUsIGFwcGxpY2F0aW9uSWQpO1xuICBzdG9yZVtsYXN0Q29tcG9uZW50XSA9IGhhbmRsZXI7XG59XG5cbmZ1bmN0aW9uIHJlbW92ZShjYXRlZ29yeSwgbmFtZSwgYXBwbGljYXRpb25JZCkge1xuICBjb25zdCBsYXN0Q29tcG9uZW50ID0gbmFtZS5zcGxpdCgnLicpLnNwbGljZSgtMSk7XG4gIGNvbnN0IHN0b3JlID0gZ2V0U3RvcmUoY2F0ZWdvcnksIG5hbWUsIGFwcGxpY2F0aW9uSWQpO1xuICBkZWxldGUgc3RvcmVbbGFzdENvbXBvbmVudF07XG59XG5cbmZ1bmN0aW9uIGdldChjYXRlZ29yeSwgbmFtZSwgYXBwbGljYXRpb25JZCkge1xuICBjb25zdCBsYXN0Q29tcG9uZW50ID0gbmFtZS5zcGxpdCgnLicpLnNwbGljZSgtMSk7XG4gIGNvbnN0IHN0b3JlID0gZ2V0U3RvcmUoY2F0ZWdvcnksIG5hbWUsIGFwcGxpY2F0aW9uSWQpO1xuICByZXR1cm4gc3RvcmVbbGFzdENvbXBvbmVudF07XG59XG5cbmV4cG9ydCBmdW5jdGlvbiBhZGRGdW5jdGlvbihcbiAgZnVuY3Rpb25OYW1lLFxuICBoYW5kbGVyLFxuICB2YWxpZGF0aW9uSGFuZGxlcixcbiAgYXBwbGljYXRpb25JZFxuKSB7XG4gIGFkZChDYXRlZ29yeS5GdW5jdGlvbnMsIGZ1bmN0aW9uTmFtZSwgaGFuZGxlciwgYXBwbGljYXRpb25JZCk7XG4gIGFkZChDYXRlZ29yeS5WYWxpZGF0b3JzLCBmdW5jdGlvbk5hbWUsIHZhbGlkYXRpb25IYW5kbGVyLCBhcHBsaWNhdGlvbklkKTtcbn1cblxuZXhwb3J0IGZ1bmN0aW9uIGFkZEpvYihqb2JOYW1lLCBoYW5kbGVyLCBhcHBsaWNhdGlvbklkKSB7XG4gIGFkZChDYXRlZ29yeS5Kb2JzLCBqb2JOYW1lLCBoYW5kbGVyLCBhcHBsaWNhdGlvbklkKTtcbn1cblxuZXhwb3J0IGZ1bmN0aW9uIGFkZFRyaWdnZXIodHlwZSwgY2xhc3NOYW1lLCBoYW5kbGVyLCBhcHBsaWNhdGlvbklkKSB7XG4gIHZhbGlkYXRlQ2xhc3NOYW1lRm9yVHJpZ2dlcnMoY2xhc3NOYW1lLCB0eXBlKTtcbiAgYWRkKENhdGVnb3J5LlRyaWdnZXJzLCBgJHt0eXBlfS4ke2NsYXNzTmFtZX1gLCBoYW5kbGVyLCBhcHBsaWNhdGlvbklkKTtcbn1cblxuZXhwb3J0IGZ1bmN0aW9uIGFkZExpdmVRdWVyeUV2ZW50SGFuZGxlcihoYW5kbGVyLCBhcHBsaWNhdGlvbklkKSB7XG4gIGFwcGxpY2F0aW9uSWQgPSBhcHBsaWNhdGlvbklkIHx8IFBhcnNlLmFwcGxpY2F0aW9uSWQ7XG4gIF90cmlnZ2VyU3RvcmVbYXBwbGljYXRpb25JZF0gPSBfdHJpZ2dlclN0b3JlW2FwcGxpY2F0aW9uSWRdIHx8IGJhc2VTdG9yZSgpO1xuICBfdHJpZ2dlclN0b3JlW2FwcGxpY2F0aW9uSWRdLkxpdmVRdWVyeS5wdXNoKGhhbmRsZXIpO1xufVxuXG5leHBvcnQgZnVuY3Rpb24gcmVtb3ZlRnVuY3Rpb24oZnVuY3Rpb25OYW1lLCBhcHBsaWNhdGlvbklkKSB7XG4gIHJlbW92ZShDYXRlZ29yeS5GdW5jdGlvbnMsIGZ1bmN0aW9uTmFtZSwgYXBwbGljYXRpb25JZCk7XG59XG5cbmV4cG9ydCBmdW5jdGlvbiByZW1vdmVUcmlnZ2VyKHR5cGUsIGNsYXNzTmFtZSwgYXBwbGljYXRpb25JZCkge1xuICByZW1vdmUoQ2F0ZWdvcnkuVHJpZ2dlcnMsIGAke3R5cGV9LiR7Y2xhc3NOYW1lfWAsIGFwcGxpY2F0aW9uSWQpO1xufVxuXG5leHBvcnQgZnVuY3Rpb24gX3VucmVnaXN0ZXJBbGwoKSB7XG4gIE9iamVjdC5rZXlzKF90cmlnZ2VyU3RvcmUpLmZvckVhY2goYXBwSWQgPT4gZGVsZXRlIF90cmlnZ2VyU3RvcmVbYXBwSWRdKTtcbn1cblxuZXhwb3J0IGZ1bmN0aW9uIGdldFRyaWdnZXIoY2xhc3NOYW1lLCB0cmlnZ2VyVHlwZSwgYXBwbGljYXRpb25JZCkge1xuICBpZiAoIWFwcGxpY2F0aW9uSWQpIHtcbiAgICB0aHJvdyAnTWlzc2luZyBBcHBsaWNhdGlvbklEJztcbiAgfVxuICByZXR1cm4gZ2V0KENhdGVnb3J5LlRyaWdnZXJzLCBgJHt0cmlnZ2VyVHlwZX0uJHtjbGFzc05hbWV9YCwgYXBwbGljYXRpb25JZCk7XG59XG5cbmV4cG9ydCBmdW5jdGlvbiB0cmlnZ2VyRXhpc3RzKFxuICBjbGFzc05hbWU6IHN0cmluZyxcbiAgdHlwZTogc3RyaW5nLFxuICBhcHBsaWNhdGlvbklkOiBzdHJpbmdcbik6IGJvb2xlYW4ge1xuICByZXR1cm4gZ2V0VHJpZ2dlcihjbGFzc05hbWUsIHR5cGUsIGFwcGxpY2F0aW9uSWQpICE9IHVuZGVmaW5lZDtcbn1cblxuZXhwb3J0IGZ1bmN0aW9uIGdldEZ1bmN0aW9uKGZ1bmN0aW9uTmFtZSwgYXBwbGljYXRpb25JZCkge1xuICByZXR1cm4gZ2V0KENhdGVnb3J5LkZ1bmN0aW9ucywgZnVuY3Rpb25OYW1lLCBhcHBsaWNhdGlvbklkKTtcbn1cblxuZXhwb3J0IGZ1bmN0aW9uIGdldEZ1bmN0aW9uTmFtZXMoYXBwbGljYXRpb25JZCkge1xuICBjb25zdCBzdG9yZSA9XG4gICAgKF90cmlnZ2VyU3RvcmVbYXBwbGljYXRpb25JZF0gJiZcbiAgICAgIF90cmlnZ2VyU3RvcmVbYXBwbGljYXRpb25JZF1bQ2F0ZWdvcnkuRnVuY3Rpb25zXSkgfHxcbiAgICB7fTtcbiAgY29uc3QgZnVuY3Rpb25OYW1lcyA9IFtdO1xuICBjb25zdCBleHRyYWN0RnVuY3Rpb25OYW1lcyA9IChuYW1lc3BhY2UsIHN0b3JlKSA9PiB7XG4gICAgT2JqZWN0LmtleXMoc3RvcmUpLmZvckVhY2gobmFtZSA9PiB7XG4gICAgICBjb25zdCB2YWx1ZSA9IHN0b3JlW25hbWVdO1xuICAgICAgaWYgKG5hbWVzcGFjZSkge1xuICAgICAgICBuYW1lID0gYCR7bmFtZXNwYWNlfS4ke25hbWV9YDtcbiAgICAgIH1cbiAgICAgIGlmICh0eXBlb2YgdmFsdWUgPT09ICdmdW5jdGlvbicpIHtcbiAgICAgICAgZnVuY3Rpb25OYW1lcy5wdXNoKG5hbWUpO1xuICAgICAgfSBlbHNlIHtcbiAgICAgICAgZXh0cmFjdEZ1bmN0aW9uTmFtZXMobmFtZSwgdmFsdWUpO1xuICAgICAgfVxuICAgIH0pO1xuICB9O1xuICBleHRyYWN0RnVuY3Rpb25OYW1lcyhudWxsLCBzdG9yZSk7XG4gIHJldHVybiBmdW5jdGlvbk5hbWVzO1xufVxuXG5leHBvcnQgZnVuY3Rpb24gZ2V0Sm9iKGpvYk5hbWUsIGFwcGxpY2F0aW9uSWQpIHtcbiAgcmV0dXJuIGdldChDYXRlZ29yeS5Kb2JzLCBqb2JOYW1lLCBhcHBsaWNhdGlvbklkKTtcbn1cblxuZXhwb3J0IGZ1bmN0aW9uIGdldEpvYnMoYXBwbGljYXRpb25JZCkge1xuICB2YXIgbWFuYWdlciA9IF90cmlnZ2VyU3RvcmVbYXBwbGljYXRpb25JZF07XG4gIGlmIChtYW5hZ2VyICYmIG1hbmFnZXIuSm9icykge1xuICAgIHJldHVybiBtYW5hZ2VyLkpvYnM7XG4gIH1cbiAgcmV0dXJuIHVuZGVmaW5lZDtcbn1cblxuZXhwb3J0IGZ1bmN0aW9uIGdldFZhbGlkYXRvcihmdW5jdGlvbk5hbWUsIGFwcGxpY2F0aW9uSWQpIHtcbiAgcmV0dXJuIGdldChDYXRlZ29yeS5WYWxpZGF0b3JzLCBmdW5jdGlvbk5hbWUsIGFwcGxpY2F0aW9uSWQpO1xufVxuXG5leHBvcnQgZnVuY3Rpb24gZ2V0UmVxdWVzdE9iamVjdChcbiAgdHJpZ2dlclR5cGUsXG4gIGF1dGgsXG4gIHBhcnNlT2JqZWN0LFxuICBvcmlnaW5hbFBhcnNlT2JqZWN0LFxuICBjb25maWcsXG4gIGNvbnRleHRcbikge1xuICBjb25zdCByZXF1ZXN0ID0ge1xuICAgIHRyaWdnZXJOYW1lOiB0cmlnZ2VyVHlwZSxcbiAgICBvYmplY3Q6IHBhcnNlT2JqZWN0LFxuICAgIG1hc3RlcjogZmFsc2UsXG4gICAgbG9nOiBjb25maWcubG9nZ2VyQ29udHJvbGxlcixcbiAgICBoZWFkZXJzOiBjb25maWcuaGVhZGVycyxcbiAgICBpcDogY29uZmlnLmlwLFxuICB9O1xuXG4gIGlmIChvcmlnaW5hbFBhcnNlT2JqZWN0KSB7XG4gICAgcmVxdWVzdC5vcmlnaW5hbCA9IG9yaWdpbmFsUGFyc2VPYmplY3Q7XG4gIH1cblxuICBpZiAodHJpZ2dlclR5cGUgPT09IFR5cGVzLmJlZm9yZVNhdmUgfHwgdHJpZ2dlclR5cGUgPT09IFR5cGVzLmFmdGVyU2F2ZSkge1xuICAgIC8vIFNldCBhIGNvcHkgb2YgdGhlIGNvbnRleHQgb24gdGhlIHJlcXVlc3Qgb2JqZWN0LlxuICAgIHJlcXVlc3QuY29udGV4dCA9IE9iamVjdC5hc3NpZ24oe30sIGNvbnRleHQpO1xuICB9XG5cbiAgaWYgKCFhdXRoKSB7XG4gICAgcmV0dXJuIHJlcXVlc3Q7XG4gIH1cbiAgaWYgKGF1dGguaXNNYXN0ZXIpIHtcbiAgICByZXF1ZXN0WydtYXN0ZXInXSA9IHRydWU7XG4gIH1cbiAgaWYgKGF1dGgudXNlcikge1xuICAgIHJlcXVlc3RbJ3VzZXInXSA9IGF1dGgudXNlcjtcbiAgfVxuICBpZiAoYXV0aC5pbnN0YWxsYXRpb25JZCkge1xuICAgIHJlcXVlc3RbJ2luc3RhbGxhdGlvbklkJ10gPSBhdXRoLmluc3RhbGxhdGlvbklkO1xuICB9XG4gIHJldHVybiByZXF1ZXN0O1xufVxuXG5leHBvcnQgZnVuY3Rpb24gZ2V0UmVxdWVzdFF1ZXJ5T2JqZWN0KFxuICB0cmlnZ2VyVHlwZSxcbiAgYXV0aCxcbiAgcXVlcnksXG4gIGNvdW50LFxuICBjb25maWcsXG4gIGlzR2V0XG4pIHtcbiAgaXNHZXQgPSAhIWlzR2V0O1xuXG4gIHZhciByZXF1ZXN0ID0ge1xuICAgIHRyaWdnZXJOYW1lOiB0cmlnZ2VyVHlwZSxcbiAgICBxdWVyeSxcbiAgICBtYXN0ZXI6IGZhbHNlLFxuICAgIGNvdW50LFxuICAgIGxvZzogY29uZmlnLmxvZ2dlckNvbnRyb2xsZXIsXG4gICAgaXNHZXQsXG4gICAgaGVhZGVyczogY29uZmlnLmhlYWRlcnMsXG4gICAgaXA6IGNvbmZpZy5pcCxcbiAgfTtcblxuICBpZiAoIWF1dGgpIHtcbiAgICByZXR1cm4gcmVxdWVzdDtcbiAgfVxuICBpZiAoYXV0aC5pc01hc3Rlcikge1xuICAgIHJlcXVlc3RbJ21hc3RlciddID0gdHJ1ZTtcbiAgfVxuICBpZiAoYXV0aC51c2VyKSB7XG4gICAgcmVxdWVzdFsndXNlciddID0gYXV0aC51c2VyO1xuICB9XG4gIGlmIChhdXRoLmluc3RhbGxhdGlvbklkKSB7XG4gICAgcmVxdWVzdFsnaW5zdGFsbGF0aW9uSWQnXSA9IGF1dGguaW5zdGFsbGF0aW9uSWQ7XG4gIH1cbiAgcmV0dXJuIHJlcXVlc3Q7XG59XG5cbi8vIENyZWF0ZXMgdGhlIHJlc3BvbnNlIG9iamVjdCwgYW5kIHVzZXMgdGhlIHJlcXVlc3Qgb2JqZWN0IHRvIHBhc3MgZGF0YVxuLy8gVGhlIEFQSSB3aWxsIGNhbGwgdGhpcyB3aXRoIFJFU1QgQVBJIGZvcm1hdHRlZCBvYmplY3RzLCB0aGlzIHdpbGxcbi8vIHRyYW5zZm9ybSB0aGVtIHRvIFBhcnNlLk9iamVjdCBpbnN0YW5jZXMgZXhwZWN0ZWQgYnkgQ2xvdWQgQ29kZS5cbi8vIEFueSBjaGFuZ2VzIG1hZGUgdG8gdGhlIG9iamVjdCBpbiBhIGJlZm9yZVNhdmUgd2lsbCBiZSBpbmNsdWRlZC5cbmV4cG9ydCBmdW5jdGlvbiBnZXRSZXNwb25zZU9iamVjdChyZXF1ZXN0LCByZXNvbHZlLCByZWplY3QpIHtcbiAgcmV0dXJuIHtcbiAgICBzdWNjZXNzOiBmdW5jdGlvbihyZXNwb25zZSkge1xuICAgICAgaWYgKHJlcXVlc3QudHJpZ2dlck5hbWUgPT09IFR5cGVzLmFmdGVyRmluZCkge1xuICAgICAgICBpZiAoIXJlc3BvbnNlKSB7XG4gICAgICAgICAgcmVzcG9uc2UgPSByZXF1ZXN0Lm9iamVjdHM7XG4gICAgICAgIH1cbiAgICAgICAgcmVzcG9uc2UgPSByZXNwb25zZS5tYXAob2JqZWN0ID0+IHtcbiAgICAgICAgICByZXR1cm4gb2JqZWN0LnRvSlNPTigpO1xuICAgICAgICB9KTtcbiAgICAgICAgcmV0dXJuIHJlc29sdmUocmVzcG9uc2UpO1xuICAgICAgfVxuICAgICAgLy8gVXNlIHRoZSBKU09OIHJlc3BvbnNlXG4gICAgICBpZiAoXG4gICAgICAgIHJlc3BvbnNlICYmXG4gICAgICAgIHR5cGVvZiByZXNwb25zZSA9PT0gJ29iamVjdCcgJiZcbiAgICAgICAgIXJlcXVlc3Qub2JqZWN0LmVxdWFscyhyZXNwb25zZSkgJiZcbiAgICAgICAgcmVxdWVzdC50cmlnZ2VyTmFtZSA9PT0gVHlwZXMuYmVmb3JlU2F2ZVxuICAgICAgKSB7XG4gICAgICAgIHJldHVybiByZXNvbHZlKHJlc3BvbnNlKTtcbiAgICAgIH1cbiAgICAgIGlmIChcbiAgICAgICAgcmVzcG9uc2UgJiZcbiAgICAgICAgdHlwZW9mIHJlc3BvbnNlID09PSAnb2JqZWN0JyAmJlxuICAgICAgICByZXF1ZXN0LnRyaWdnZXJOYW1lID09PSBUeXBlcy5hZnRlclNhdmVcbiAgICAgICkge1xuICAgICAgICByZXR1cm4gcmVzb2x2ZShyZXNwb25zZSk7XG4gICAgICB9XG4gICAgICBpZiAocmVxdWVzdC50cmlnZ2VyTmFtZSA9PT0gVHlwZXMuYWZ0ZXJTYXZlKSB7XG4gICAgICAgIHJldHVybiByZXNvbHZlKCk7XG4gICAgICB9XG4gICAgICByZXNwb25zZSA9IHt9O1xuICAgICAgaWYgKHJlcXVlc3QudHJpZ2dlck5hbWUgPT09IFR5cGVzLmJlZm9yZVNhdmUpIHtcbiAgICAgICAgcmVzcG9uc2VbJ29iamVjdCddID0gcmVxdWVzdC5vYmplY3QuX2dldFNhdmVKU09OKCk7XG4gICAgICB9XG4gICAgICByZXR1cm4gcmVzb2x2ZShyZXNwb25zZSk7XG4gICAgfSxcbiAgICBlcnJvcjogZnVuY3Rpb24oZXJyb3IpIHtcbiAgICAgIGlmIChlcnJvciBpbnN0YW5jZW9mIFBhcnNlLkVycm9yKSB7XG4gICAgICAgIHJlamVjdChlcnJvcik7XG4gICAgICB9IGVsc2UgaWYgKGVycm9yIGluc3RhbmNlb2YgRXJyb3IpIHtcbiAgICAgICAgcmVqZWN0KG5ldyBQYXJzZS5FcnJvcihQYXJzZS5FcnJvci5TQ1JJUFRfRkFJTEVELCBlcnJvci5tZXNzYWdlKSk7XG4gICAgICB9IGVsc2Uge1xuICAgICAgICByZWplY3QobmV3IFBhcnNlLkVycm9yKFBhcnNlLkVycm9yLlNDUklQVF9GQUlMRUQsIGVycm9yKSk7XG4gICAgICB9XG4gICAgfSxcbiAgfTtcbn1cblxuZnVuY3Rpb24gdXNlcklkRm9yTG9nKGF1dGgpIHtcbiAgcmV0dXJuIGF1dGggJiYgYXV0aC51c2VyID8gYXV0aC51c2VyLmlkIDogdW5kZWZpbmVkO1xufVxuXG5mdW5jdGlvbiBsb2dUcmlnZ2VyQWZ0ZXJIb29rKHRyaWdnZXJUeXBlLCBjbGFzc05hbWUsIGlucHV0LCBhdXRoKSB7XG4gIGNvbnN0IGNsZWFuSW5wdXQgPSBsb2dnZXIudHJ1bmNhdGVMb2dNZXNzYWdlKEpTT04uc3RyaW5naWZ5KGlucHV0KSk7XG4gIGxvZ2dlci5pbmZvKFxuICAgIGAke3RyaWdnZXJUeXBlfSB0cmlnZ2VyZWQgZm9yICR7Y2xhc3NOYW1lfSBmb3IgdXNlciAke3VzZXJJZEZvckxvZyhcbiAgICAgIGF1dGhcbiAgICApfTpcXG4gIElucHV0OiAke2NsZWFuSW5wdXR9YCxcbiAgICB7XG4gICAgICBjbGFzc05hbWUsXG4gICAgICB0cmlnZ2VyVHlwZSxcbiAgICAgIHVzZXI6IHVzZXJJZEZvckxvZyhhdXRoKSxcbiAgICB9XG4gICk7XG59XG5cbmZ1bmN0aW9uIGxvZ1RyaWdnZXJTdWNjZXNzQmVmb3JlSG9vayhcbiAgdHJpZ2dlclR5cGUsXG4gIGNsYXNzTmFtZSxcbiAgaW5wdXQsXG4gIHJlc3VsdCxcbiAgYXV0aFxuKSB7XG4gIGNvbnN0IGNsZWFuSW5wdXQgPSBsb2dnZXIudHJ1bmNhdGVMb2dNZXNzYWdlKEpTT04uc3RyaW5naWZ5KGlucHV0KSk7XG4gIGNvbnN0IGNsZWFuUmVzdWx0ID0gbG9nZ2VyLnRydW5jYXRlTG9nTWVzc2FnZShKU09OLnN0cmluZ2lmeShyZXN1bHQpKTtcbiAgbG9nZ2VyLmluZm8oXG4gICAgYCR7dHJpZ2dlclR5cGV9IHRyaWdnZXJlZCBmb3IgJHtjbGFzc05hbWV9IGZvciB1c2VyICR7dXNlcklkRm9yTG9nKFxuICAgICAgYXV0aFxuICAgICl9OlxcbiAgSW5wdXQ6ICR7Y2xlYW5JbnB1dH1cXG4gIFJlc3VsdDogJHtjbGVhblJlc3VsdH1gLFxuICAgIHtcbiAgICAgIGNsYXNzTmFtZSxcbiAgICAgIHRyaWdnZXJUeXBlLFxuICAgICAgdXNlcjogdXNlcklkRm9yTG9nKGF1dGgpLFxuICAgIH1cbiAgKTtcbn1cblxuZnVuY3Rpb24gbG9nVHJpZ2dlckVycm9yQmVmb3JlSG9vayh0cmlnZ2VyVHlwZSwgY2xhc3NOYW1lLCBpbnB1dCwgYXV0aCwgZXJyb3IpIHtcbiAgY29uc3QgY2xlYW5JbnB1dCA9IGxvZ2dlci50cnVuY2F0ZUxvZ01lc3NhZ2UoSlNPTi5zdHJpbmdpZnkoaW5wdXQpKTtcbiAgbG9nZ2VyLmVycm9yKFxuICAgIGAke3RyaWdnZXJUeXBlfSBmYWlsZWQgZm9yICR7Y2xhc3NOYW1lfSBmb3IgdXNlciAke3VzZXJJZEZvckxvZyhcbiAgICAgIGF1dGhcbiAgICApfTpcXG4gIElucHV0OiAke2NsZWFuSW5wdXR9XFxuICBFcnJvcjogJHtKU09OLnN0cmluZ2lmeShlcnJvcil9YCxcbiAgICB7XG4gICAgICBjbGFzc05hbWUsXG4gICAgICB0cmlnZ2VyVHlwZSxcbiAgICAgIGVycm9yLFxuICAgICAgdXNlcjogdXNlcklkRm9yTG9nKGF1dGgpLFxuICAgIH1cbiAgKTtcbn1cblxuZXhwb3J0IGZ1bmN0aW9uIG1heWJlUnVuQWZ0ZXJGaW5kVHJpZ2dlcihcbiAgdHJpZ2dlclR5cGUsXG4gIGF1dGgsXG4gIGNsYXNzTmFtZSxcbiAgb2JqZWN0cyxcbiAgY29uZmlnXG4pIHtcbiAgcmV0dXJuIG5ldyBQcm9taXNlKChyZXNvbHZlLCByZWplY3QpID0+IHtcbiAgICBjb25zdCB0cmlnZ2VyID0gZ2V0VHJpZ2dlcihjbGFzc05hbWUsIHRyaWdnZXJUeXBlLCBjb25maWcuYXBwbGljYXRpb25JZCk7XG4gICAgaWYgKCF0cmlnZ2VyKSB7XG4gICAgICByZXR1cm4gcmVzb2x2ZSgpO1xuICAgIH1cbiAgICBjb25zdCByZXF1ZXN0ID0gZ2V0UmVxdWVzdE9iamVjdCh0cmlnZ2VyVHlwZSwgYXV0aCwgbnVsbCwgbnVsbCwgY29uZmlnKTtcbiAgICBjb25zdCB7IHN1Y2Nlc3MsIGVycm9yIH0gPSBnZXRSZXNwb25zZU9iamVjdChcbiAgICAgIHJlcXVlc3QsXG4gICAgICBvYmplY3QgPT4ge1xuICAgICAgICByZXNvbHZlKG9iamVjdCk7XG4gICAgICB9LFxuICAgICAgZXJyb3IgPT4ge1xuICAgICAgICByZWplY3QoZXJyb3IpO1xuICAgICAgfVxuICAgICk7XG4gICAgbG9nVHJpZ2dlclN1Y2Nlc3NCZWZvcmVIb29rKFxuICAgICAgdHJpZ2dlclR5cGUsXG4gICAgICBjbGFzc05hbWUsXG4gICAgICAnQWZ0ZXJGaW5kJyxcbiAgICAgIEpTT04uc3RyaW5naWZ5KG9iamVjdHMpLFxuICAgICAgYXV0aFxuICAgICk7XG4gICAgcmVxdWVzdC5vYmplY3RzID0gb2JqZWN0cy5tYXAob2JqZWN0ID0+IHtcbiAgICAgIC8vc2V0dGluZyB0aGUgY2xhc3MgbmFtZSB0byB0cmFuc2Zvcm0gaW50byBwYXJzZSBvYmplY3RcbiAgICAgIG9iamVjdC5jbGFzc05hbWUgPSBjbGFzc05hbWU7XG4gICAgICByZXR1cm4gUGFyc2UuT2JqZWN0LmZyb21KU09OKG9iamVjdCk7XG4gICAgfSk7XG4gICAgcmV0dXJuIFByb21pc2UucmVzb2x2ZSgpXG4gICAgICAudGhlbigoKSA9PiB7XG4gICAgICAgIGNvbnN0IHJlc3BvbnNlID0gdHJpZ2dlcihyZXF1ZXN0KTtcbiAgICAgICAgaWYgKHJlc3BvbnNlICYmIHR5cGVvZiByZXNwb25zZS50aGVuID09PSAnZnVuY3Rpb24nKSB7XG4gICAgICAgICAgcmV0dXJuIHJlc3BvbnNlLnRoZW4ocmVzdWx0cyA9PiB7XG4gICAgICAgICAgICBpZiAoIXJlc3VsdHMpIHtcbiAgICAgICAgICAgICAgdGhyb3cgbmV3IFBhcnNlLkVycm9yKFxuICAgICAgICAgICAgICAgIFBhcnNlLkVycm9yLlNDUklQVF9GQUlMRUQsXG4gICAgICAgICAgICAgICAgJ0FmdGVyRmluZCBleHBlY3QgcmVzdWx0cyB0byBiZSByZXR1cm5lZCBpbiB0aGUgcHJvbWlzZSdcbiAgICAgICAgICAgICAgKTtcbiAgICAgICAgICAgIH1cbiAgICAgICAgICAgIHJldHVybiByZXN1bHRzO1xuICAgICAgICAgIH0pO1xuICAgICAgICB9XG4gICAgICAgIHJldHVybiByZXNwb25zZTtcbiAgICAgIH0pXG4gICAgICAudGhlbihzdWNjZXNzLCBlcnJvcik7XG4gIH0pLnRoZW4ocmVzdWx0cyA9PiB7XG4gICAgbG9nVHJpZ2dlckFmdGVySG9vayh0cmlnZ2VyVHlwZSwgY2xhc3NOYW1lLCBKU09OLnN0cmluZ2lmeShyZXN1bHRzKSwgYXV0aCk7XG4gICAgcmV0dXJuIHJlc3VsdHM7XG4gIH0pO1xufVxuXG5leHBvcnQgZnVuY3Rpb24gbWF5YmVSdW5RdWVyeVRyaWdnZXIoXG4gIHRyaWdnZXJUeXBlLFxuICBjbGFzc05hbWUsXG4gIHJlc3RXaGVyZSxcbiAgcmVzdE9wdGlvbnMsXG4gIGNvbmZpZyxcbiAgYXV0aCxcbiAgaXNHZXRcbikge1xuICBjb25zdCB0cmlnZ2VyID0gZ2V0VHJpZ2dlcihjbGFzc05hbWUsIHRyaWdnZXJUeXBlLCBjb25maWcuYXBwbGljYXRpb25JZCk7XG4gIGlmICghdHJpZ2dlcikge1xuICAgIHJldHVybiBQcm9taXNlLnJlc29sdmUoe1xuICAgICAgcmVzdFdoZXJlLFxuICAgICAgcmVzdE9wdGlvbnMsXG4gICAgfSk7XG4gIH1cbiAgY29uc3QganNvbiA9IE9iamVjdC5hc3NpZ24oe30sIHJlc3RPcHRpb25zKTtcbiAganNvbi53aGVyZSA9IHJlc3RXaGVyZTtcblxuICBjb25zdCBwYXJzZVF1ZXJ5ID0gbmV3IFBhcnNlLlF1ZXJ5KGNsYXNzTmFtZSk7XG4gIHBhcnNlUXVlcnkud2l0aEpTT04oanNvbik7XG5cbiAgbGV0IGNvdW50ID0gZmFsc2U7XG4gIGlmIChyZXN0T3B0aW9ucykge1xuICAgIGNvdW50ID0gISFyZXN0T3B0aW9ucy5jb3VudDtcbiAgfVxuICBjb25zdCByZXF1ZXN0T2JqZWN0ID0gZ2V0UmVxdWVzdFF1ZXJ5T2JqZWN0KFxuICAgIHRyaWdnZXJUeXBlLFxuICAgIGF1dGgsXG4gICAgcGFyc2VRdWVyeSxcbiAgICBjb3VudCxcbiAgICBjb25maWcsXG4gICAgaXNHZXRcbiAgKTtcbiAgcmV0dXJuIFByb21pc2UucmVzb2x2ZSgpXG4gICAgLnRoZW4oKCkgPT4ge1xuICAgICAgcmV0dXJuIHRyaWdnZXIocmVxdWVzdE9iamVjdCk7XG4gICAgfSlcbiAgICAudGhlbihcbiAgICAgIHJlc3VsdCA9PiB7XG4gICAgICAgIGxldCBxdWVyeVJlc3VsdCA9IHBhcnNlUXVlcnk7XG4gICAgICAgIGlmIChyZXN1bHQgJiYgcmVzdWx0IGluc3RhbmNlb2YgUGFyc2UuUXVlcnkpIHtcbiAgICAgICAgICBxdWVyeVJlc3VsdCA9IHJlc3VsdDtcbiAgICAgICAgfVxuICAgICAgICBjb25zdCBqc29uUXVlcnkgPSBxdWVyeVJlc3VsdC50b0pTT04oKTtcbiAgICAgICAgaWYgKGpzb25RdWVyeS53aGVyZSkge1xuICAgICAgICAgIHJlc3RXaGVyZSA9IGpzb25RdWVyeS53aGVyZTtcbiAgICAgICAgfVxuICAgICAgICBpZiAoanNvblF1ZXJ5LmxpbWl0KSB7XG4gICAgICAgICAgcmVzdE9wdGlvbnMgPSByZXN0T3B0aW9ucyB8fCB7fTtcbiAgICAgICAgICByZXN0T3B0aW9ucy5saW1pdCA9IGpzb25RdWVyeS5saW1pdDtcbiAgICAgICAgfVxuICAgICAgICBpZiAoanNvblF1ZXJ5LnNraXApIHtcbiAgICAgICAgICByZXN0T3B0aW9ucyA9IHJlc3RPcHRpb25zIHx8IHt9O1xuICAgICAgICAgIHJlc3RPcHRpb25zLnNraXAgPSBqc29uUXVlcnkuc2tpcDtcbiAgICAgICAgfVxuICAgICAgICBpZiAoanNvblF1ZXJ5LmluY2x1ZGUpIHtcbiAgICAgICAgICByZXN0T3B0aW9ucyA9IHJlc3RPcHRpb25zIHx8IHt9O1xuICAgICAgICAgIHJlc3RPcHRpb25zLmluY2x1ZGUgPSBqc29uUXVlcnkuaW5jbHVkZTtcbiAgICAgICAgfVxuICAgICAgICBpZiAoanNvblF1ZXJ5LmV4Y2x1ZGVLZXlzKSB7XG4gICAgICAgICAgcmVzdE9wdGlvbnMgPSByZXN0T3B0aW9ucyB8fCB7fTtcbiAgICAgICAgICByZXN0T3B0aW9ucy5leGNsdWRlS2V5cyA9IGpzb25RdWVyeS5leGNsdWRlS2V5cztcbiAgICAgICAgfVxuICAgICAgICBpZiAoanNvblF1ZXJ5LmtleXMpIHtcbiAgICAgICAgICByZXN0T3B0aW9ucyA9IHJlc3RPcHRpb25zIHx8IHt9O1xuICAgICAgICAgIHJlc3RPcHRpb25zLmtleXMgPSBqc29uUXVlcnkua2V5cztcbiAgICAgICAgfVxuICAgICAgICBpZiAoanNvblF1ZXJ5Lm9yZGVyKSB7XG4gICAgICAgICAgcmVzdE9wdGlvbnMgPSByZXN0T3B0aW9ucyB8fCB7fTtcbiAgICAgICAgICByZXN0T3B0aW9ucy5vcmRlciA9IGpzb25RdWVyeS5vcmRlcjtcbiAgICAgICAgfVxuICAgICAgICBpZiAocmVxdWVzdE9iamVjdC5yZWFkUHJlZmVyZW5jZSkge1xuICAgICAgICAgIHJlc3RPcHRpb25zID0gcmVzdE9wdGlvbnMgfHwge307XG4gICAgICAgICAgcmVzdE9wdGlvbnMucmVhZFByZWZlcmVuY2UgPSByZXF1ZXN0T2JqZWN0LnJlYWRQcmVmZXJlbmNlO1xuICAgICAgICB9XG4gICAgICAgIGlmIChyZXF1ZXN0T2JqZWN0LmluY2x1ZGVSZWFkUHJlZmVyZW5jZSkge1xuICAgICAgICAgIHJlc3RPcHRpb25zID0gcmVzdE9wdGlvbnMgfHwge307XG4gICAgICAgICAgcmVzdE9wdGlvbnMuaW5jbHVkZVJlYWRQcmVmZXJlbmNlID1cbiAgICAgICAgICAgIHJlcXVlc3RPYmplY3QuaW5jbHVkZVJlYWRQcmVmZXJlbmNlO1xuICAgICAgICB9XG4gICAgICAgIGlmIChyZXF1ZXN0T2JqZWN0LnN1YnF1ZXJ5UmVhZFByZWZlcmVuY2UpIHtcbiAgICAgICAgICByZXN0T3B0aW9ucyA9IHJlc3RPcHRpb25zIHx8IHt9O1xuICAgICAgICAgIHJlc3RPcHRpb25zLnN1YnF1ZXJ5UmVhZFByZWZlcmVuY2UgPVxuICAgICAgICAgICAgcmVxdWVzdE9iamVjdC5zdWJxdWVyeVJlYWRQcmVmZXJlbmNlO1xuICAgICAgICB9XG4gICAgICAgIHJldHVybiB7XG4gICAgICAgICAgcmVzdFdoZXJlLFxuICAgICAgICAgIHJlc3RPcHRpb25zLFxuICAgICAgICB9O1xuICAgICAgfSxcbiAgICAgIGVyciA9PiB7XG4gICAgICAgIGlmICh0eXBlb2YgZXJyID09PSAnc3RyaW5nJykge1xuICAgICAgICAgIHRocm93IG5ldyBQYXJzZS5FcnJvcigxLCBlcnIpO1xuICAgICAgICB9IGVsc2Uge1xuICAgICAgICAgIHRocm93IGVycjtcbiAgICAgICAgfVxuICAgICAgfVxuICAgICk7XG59XG5cbi8vIFRvIGJlIHVzZWQgYXMgcGFydCBvZiB0aGUgcHJvbWlzZSBjaGFpbiB3aGVuIHNhdmluZy9kZWxldGluZyBhbiBvYmplY3Rcbi8vIFdpbGwgcmVzb2x2ZSBzdWNjZXNzZnVsbHkgaWYgbm8gdHJpZ2dlciBpcyBjb25maWd1cmVkXG4vLyBSZXNvbHZlcyB0byBhbiBvYmplY3QsIGVtcHR5IG9yIGNvbnRhaW5pbmcgYW4gb2JqZWN0IGtleS4gQSBiZWZvcmVTYXZlXG4vLyB0cmlnZ2VyIHdpbGwgc2V0IHRoZSBvYmplY3Qga2V5IHRvIHRoZSByZXN0IGZvcm1hdCBvYmplY3QgdG8gc2F2ZS5cbi8vIG9yaWdpbmFsUGFyc2VPYmplY3QgaXMgb3B0aW9uYWwsIHdlIG9ubHkgbmVlZCB0aGF0IGZvciBiZWZvcmUvYWZ0ZXJTYXZlIGZ1bmN0aW9uc1xuZXhwb3J0IGZ1bmN0aW9uIG1heWJlUnVuVHJpZ2dlcihcbiAgdHJpZ2dlclR5cGUsXG4gIGF1dGgsXG4gIHBhcnNlT2JqZWN0LFxuICBvcmlnaW5hbFBhcnNlT2JqZWN0LFxuICBjb25maWcsXG4gIGNvbnRleHRcbikge1xuICBpZiAoIXBhcnNlT2JqZWN0KSB7XG4gICAgcmV0dXJuIFByb21pc2UucmVzb2x2ZSh7fSk7XG4gIH1cbiAgcmV0dXJuIG5ldyBQcm9taXNlKGZ1bmN0aW9uKHJlc29sdmUsIHJlamVjdCkge1xuICAgIHZhciB0cmlnZ2VyID0gZ2V0VHJpZ2dlcihcbiAgICAgIHBhcnNlT2JqZWN0LmNsYXNzTmFtZSxcbiAgICAgIHRyaWdnZXJUeXBlLFxuICAgICAgY29uZmlnLmFwcGxpY2F0aW9uSWRcbiAgICApO1xuICAgIGlmICghdHJpZ2dlcikgcmV0dXJuIHJlc29sdmUoKTtcbiAgICB2YXIgcmVxdWVzdCA9IGdldFJlcXVlc3RPYmplY3QoXG4gICAgICB0cmlnZ2VyVHlwZSxcbiAgICAgIGF1dGgsXG4gICAgICBwYXJzZU9iamVjdCxcbiAgICAgIG9yaWdpbmFsUGFyc2VPYmplY3QsXG4gICAgICBjb25maWcsXG4gICAgICBjb250ZXh0XG4gICAgKTtcbiAgICB2YXIgeyBzdWNjZXNzLCBlcnJvciB9ID0gZ2V0UmVzcG9uc2VPYmplY3QoXG4gICAgICByZXF1ZXN0LFxuICAgICAgb2JqZWN0ID0+IHtcbiAgICAgICAgbG9nVHJpZ2dlclN1Y2Nlc3NCZWZvcmVIb29rKFxuICAgICAgICAgIHRyaWdnZXJUeXBlLFxuICAgICAgICAgIHBhcnNlT2JqZWN0LmNsYXNzTmFtZSxcbiAgICAgICAgICBwYXJzZU9iamVjdC50b0pTT04oKSxcbiAgICAgICAgICBvYmplY3QsXG4gICAgICAgICAgYXV0aFxuICAgICAgICApO1xuICAgICAgICBpZiAoXG4gICAgICAgICAgdHJpZ2dlclR5cGUgPT09IFR5cGVzLmJlZm9yZVNhdmUgfHxcbiAgICAgICAgICB0cmlnZ2VyVHlwZSA9PT0gVHlwZXMuYWZ0ZXJTYXZlXG4gICAgICAgICkge1xuICAgICAgICAgIE9iamVjdC5hc3NpZ24oY29udGV4dCwgcmVxdWVzdC5jb250ZXh0KTtcbiAgICAgICAgfVxuICAgICAgICByZXNvbHZlKG9iamVjdCk7XG4gICAgICB9LFxuICAgICAgZXJyb3IgPT4ge1xuICAgICAgICBsb2dUcmlnZ2VyRXJyb3JCZWZvcmVIb29rKFxuICAgICAgICAgIHRyaWdnZXJUeXBlLFxuICAgICAgICAgIHBhcnNlT2JqZWN0LmNsYXNzTmFtZSxcbiAgICAgICAgICBwYXJzZU9iamVjdC50b0pTT04oKSxcbiAgICAgICAgICBhdXRoLFxuICAgICAgICAgIGVycm9yXG4gICAgICAgICk7XG4gICAgICAgIHJlamVjdChlcnJvcik7XG4gICAgICB9XG4gICAgKTtcblxuICAgIC8vIEFmdGVyU2F2ZSBhbmQgYWZ0ZXJEZWxldGUgdHJpZ2dlcnMgY2FuIHJldHVybiBhIHByb21pc2UsIHdoaWNoIGlmIHRoZXlcbiAgICAvLyBkbywgbmVlZHMgdG8gYmUgcmVzb2x2ZWQgYmVmb3JlIHRoaXMgcHJvbWlzZSBpcyByZXNvbHZlZCxcbiAgICAvLyBzbyB0cmlnZ2VyIGV4ZWN1dGlvbiBpcyBzeW5jZWQgd2l0aCBSZXN0V3JpdGUuZXhlY3V0ZSgpIGNhbGwuXG4gICAgLy8gSWYgdHJpZ2dlcnMgZG8gbm90IHJldHVybiBhIHByb21pc2UsIHRoZXkgY2FuIHJ1biBhc3luYyBjb2RlIHBhcmFsbGVsXG4gICAgLy8gdG8gdGhlIFJlc3RXcml0ZS5leGVjdXRlKCkgY2FsbC5cbiAgICByZXR1cm4gUHJvbWlzZS5yZXNvbHZlKClcbiAgICAgIC50aGVuKCgpID0+IHtcbiAgICAgICAgY29uc3QgcHJvbWlzZSA9IHRyaWdnZXIocmVxdWVzdCk7XG4gICAgICAgIGlmIChcbiAgICAgICAgICB0cmlnZ2VyVHlwZSA9PT0gVHlwZXMuYWZ0ZXJTYXZlIHx8XG4gICAgICAgICAgdHJpZ2dlclR5cGUgPT09IFR5cGVzLmFmdGVyRGVsZXRlXG4gICAgICAgICkge1xuICAgICAgICAgIGxvZ1RyaWdnZXJBZnRlckhvb2soXG4gICAgICAgICAgICB0cmlnZ2VyVHlwZSxcbiAgICAgICAgICAgIHBhcnNlT2JqZWN0LmNsYXNzTmFtZSxcbiAgICAgICAgICAgIHBhcnNlT2JqZWN0LnRvSlNPTigpLFxuICAgICAgICAgICAgYXV0aFxuICAgICAgICAgICk7XG4gICAgICAgIH1cbiAgICAgICAgLy8gYmVmb3JlU2F2ZSBpcyBleHBlY3RlZCB0byByZXR1cm4gbnVsbCAobm90aGluZylcbiAgICAgICAgaWYgKHRyaWdnZXJUeXBlID09PSBUeXBlcy5iZWZvcmVTYXZlKSB7XG4gICAgICAgICAgaWYgKHByb21pc2UgJiYgdHlwZW9mIHByb21pc2UudGhlbiA9PT0gJ2Z1bmN0aW9uJykge1xuICAgICAgICAgICAgcmV0dXJuIHByb21pc2UudGhlbihyZXNwb25zZSA9PiB7XG4gICAgICAgICAgICAgIC8vIHJlc3BvbnNlLm9iamVjdCBtYXkgY29tZSBmcm9tIGV4cHJlc3Mgcm91dGluZyBiZWZvcmUgaG9va1xuICAgICAgICAgICAgICBpZiAocmVzcG9uc2UgJiYgcmVzcG9uc2Uub2JqZWN0KSB7XG4gICAgICAgICAgICAgICAgcmV0dXJuIHJlc3BvbnNlO1xuICAgICAgICAgICAgICB9XG4gICAgICAgICAgICAgIHJldHVybiBudWxsO1xuICAgICAgICAgICAgfSk7XG4gICAgICAgICAgfVxuICAgICAgICAgIHJldHVybiBudWxsO1xuICAgICAgICB9XG5cbiAgICAgICAgcmV0dXJuIHByb21pc2U7XG4gICAgICB9KVxuICAgICAgLnRoZW4oc3VjY2VzcywgZXJyb3IpO1xuICB9KTtcbn1cblxuLy8gQ29udmVydHMgYSBSRVNULWZvcm1hdCBvYmplY3QgdG8gYSBQYXJzZS5PYmplY3Rcbi8vIGRhdGEgaXMgZWl0aGVyIGNsYXNzTmFtZSBvciBhbiBvYmplY3RcbmV4cG9ydCBmdW5jdGlvbiBpbmZsYXRlKGRhdGEsIHJlc3RPYmplY3QpIHtcbiAgdmFyIGNvcHkgPSB0eXBlb2YgZGF0YSA9PSAnb2JqZWN0JyA/IGRhdGEgOiB7IGNsYXNzTmFtZTogZGF0YSB9O1xuICBmb3IgKHZhciBrZXkgaW4gcmVzdE9iamVjdCkge1xuICAgIGNvcHlba2V5XSA9IHJlc3RPYmplY3Rba2V5XTtcbiAgfVxuICByZXR1cm4gUGFyc2UuT2JqZWN0LmZyb21KU09OKGNvcHkpO1xufVxuXG5leHBvcnQgZnVuY3Rpb24gcnVuTGl2ZVF1ZXJ5RXZlbnRIYW5kbGVycyhcbiAgZGF0YSxcbiAgYXBwbGljYXRpb25JZCA9IFBhcnNlLmFwcGxpY2F0aW9uSWRcbikge1xuICBpZiAoXG4gICAgIV90cmlnZ2VyU3RvcmUgfHxcbiAgICAhX3RyaWdnZXJTdG9yZVthcHBsaWNhdGlvbklkXSB8fFxuICAgICFfdHJpZ2dlclN0b3JlW2FwcGxpY2F0aW9uSWRdLkxpdmVRdWVyeVxuICApIHtcbiAgICByZXR1cm47XG4gIH1cbiAgX3RyaWdnZXJTdG9yZVthcHBsaWNhdGlvbklkXS5MaXZlUXVlcnkuZm9yRWFjaChoYW5kbGVyID0+IGhhbmRsZXIoZGF0YSkpO1xufVxuIl19