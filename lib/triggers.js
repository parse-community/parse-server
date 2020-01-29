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

    if (jsonQuery.explain) {
      restOptions = restOptions || {};
      restOptions.explain = jsonQuery.explain;
    }

    if (jsonQuery.keys) {
      restOptions = restOptions || {};
      restOptions.keys = jsonQuery.keys;
    }

    if (jsonQuery.order) {
      restOptions = restOptions || {};
      restOptions.order = jsonQuery.order;
    }

    if (jsonQuery.hint) {
      restOptions = restOptions || {};
      restOptions.hint = jsonQuery.hint;
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
//# sourceMappingURL=data:application/json;charset=utf-8;base64,eyJ2ZXJzaW9uIjozLCJzb3VyY2VzIjpbIi4uL3NyYy90cmlnZ2Vycy5qcyJdLCJuYW1lcyI6WyJUeXBlcyIsImJlZm9yZUxvZ2luIiwiYWZ0ZXJMb2dvdXQiLCJiZWZvcmVTYXZlIiwiYWZ0ZXJTYXZlIiwiYmVmb3JlRGVsZXRlIiwiYWZ0ZXJEZWxldGUiLCJiZWZvcmVGaW5kIiwiYWZ0ZXJGaW5kIiwiYmFzZVN0b3JlIiwiVmFsaWRhdG9ycyIsIkZ1bmN0aW9ucyIsIkpvYnMiLCJMaXZlUXVlcnkiLCJUcmlnZ2VycyIsIk9iamVjdCIsImtleXMiLCJyZWR1Y2UiLCJiYXNlIiwia2V5IiwiZnJlZXplIiwidmFsaWRhdGVDbGFzc05hbWVGb3JUcmlnZ2VycyIsImNsYXNzTmFtZSIsInR5cGUiLCJfdHJpZ2dlclN0b3JlIiwiQ2F0ZWdvcnkiLCJnZXRTdG9yZSIsImNhdGVnb3J5IiwibmFtZSIsImFwcGxpY2F0aW9uSWQiLCJwYXRoIiwic3BsaXQiLCJzcGxpY2UiLCJQYXJzZSIsInN0b3JlIiwiY29tcG9uZW50IiwidW5kZWZpbmVkIiwiYWRkIiwiaGFuZGxlciIsImxhc3RDb21wb25lbnQiLCJyZW1vdmUiLCJnZXQiLCJhZGRGdW5jdGlvbiIsImZ1bmN0aW9uTmFtZSIsInZhbGlkYXRpb25IYW5kbGVyIiwiYWRkSm9iIiwiam9iTmFtZSIsImFkZFRyaWdnZXIiLCJhZGRMaXZlUXVlcnlFdmVudEhhbmRsZXIiLCJwdXNoIiwicmVtb3ZlRnVuY3Rpb24iLCJyZW1vdmVUcmlnZ2VyIiwiX3VucmVnaXN0ZXJBbGwiLCJmb3JFYWNoIiwiYXBwSWQiLCJnZXRUcmlnZ2VyIiwidHJpZ2dlclR5cGUiLCJ0cmlnZ2VyRXhpc3RzIiwiZ2V0RnVuY3Rpb24iLCJnZXRGdW5jdGlvbk5hbWVzIiwiZnVuY3Rpb25OYW1lcyIsImV4dHJhY3RGdW5jdGlvbk5hbWVzIiwibmFtZXNwYWNlIiwidmFsdWUiLCJnZXRKb2IiLCJnZXRKb2JzIiwibWFuYWdlciIsImdldFZhbGlkYXRvciIsImdldFJlcXVlc3RPYmplY3QiLCJhdXRoIiwicGFyc2VPYmplY3QiLCJvcmlnaW5hbFBhcnNlT2JqZWN0IiwiY29uZmlnIiwiY29udGV4dCIsInJlcXVlc3QiLCJ0cmlnZ2VyTmFtZSIsIm9iamVjdCIsIm1hc3RlciIsImxvZyIsImxvZ2dlckNvbnRyb2xsZXIiLCJoZWFkZXJzIiwiaXAiLCJvcmlnaW5hbCIsImFzc2lnbiIsImlzTWFzdGVyIiwidXNlciIsImluc3RhbGxhdGlvbklkIiwiZ2V0UmVxdWVzdFF1ZXJ5T2JqZWN0IiwicXVlcnkiLCJjb3VudCIsImlzR2V0IiwiZ2V0UmVzcG9uc2VPYmplY3QiLCJyZXNvbHZlIiwicmVqZWN0Iiwic3VjY2VzcyIsInJlc3BvbnNlIiwib2JqZWN0cyIsIm1hcCIsInRvSlNPTiIsImVxdWFscyIsIl9nZXRTYXZlSlNPTiIsImVycm9yIiwiRXJyb3IiLCJTQ1JJUFRfRkFJTEVEIiwibWVzc2FnZSIsInVzZXJJZEZvckxvZyIsImlkIiwibG9nVHJpZ2dlckFmdGVySG9vayIsImlucHV0IiwiY2xlYW5JbnB1dCIsImxvZ2dlciIsInRydW5jYXRlTG9nTWVzc2FnZSIsIkpTT04iLCJzdHJpbmdpZnkiLCJpbmZvIiwibG9nVHJpZ2dlclN1Y2Nlc3NCZWZvcmVIb29rIiwicmVzdWx0IiwiY2xlYW5SZXN1bHQiLCJsb2dUcmlnZ2VyRXJyb3JCZWZvcmVIb29rIiwibWF5YmVSdW5BZnRlckZpbmRUcmlnZ2VyIiwiUHJvbWlzZSIsInRyaWdnZXIiLCJmcm9tSlNPTiIsInRoZW4iLCJyZXN1bHRzIiwibWF5YmVSdW5RdWVyeVRyaWdnZXIiLCJyZXN0V2hlcmUiLCJyZXN0T3B0aW9ucyIsImpzb24iLCJ3aGVyZSIsInBhcnNlUXVlcnkiLCJRdWVyeSIsIndpdGhKU09OIiwicmVxdWVzdE9iamVjdCIsInF1ZXJ5UmVzdWx0IiwianNvblF1ZXJ5IiwibGltaXQiLCJza2lwIiwiaW5jbHVkZSIsImV4Y2x1ZGVLZXlzIiwiZXhwbGFpbiIsIm9yZGVyIiwiaGludCIsInJlYWRQcmVmZXJlbmNlIiwiaW5jbHVkZVJlYWRQcmVmZXJlbmNlIiwic3VicXVlcnlSZWFkUHJlZmVyZW5jZSIsImVyciIsIm1heWJlUnVuVHJpZ2dlciIsInByb21pc2UiLCJpbmZsYXRlIiwiZGF0YSIsInJlc3RPYmplY3QiLCJjb3B5IiwicnVuTGl2ZVF1ZXJ5RXZlbnRIYW5kbGVycyJdLCJtYXBwaW5ncyI6Ijs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7QUFDQTs7QUFDQTs7OztBQUZBO0FBSU8sTUFBTUEsS0FBSyxHQUFHO0FBQ25CQyxFQUFBQSxXQUFXLEVBQUUsYUFETTtBQUVuQkMsRUFBQUEsV0FBVyxFQUFFLGFBRk07QUFHbkJDLEVBQUFBLFVBQVUsRUFBRSxZQUhPO0FBSW5CQyxFQUFBQSxTQUFTLEVBQUUsV0FKUTtBQUtuQkMsRUFBQUEsWUFBWSxFQUFFLGNBTEs7QUFNbkJDLEVBQUFBLFdBQVcsRUFBRSxhQU5NO0FBT25CQyxFQUFBQSxVQUFVLEVBQUUsWUFQTztBQVFuQkMsRUFBQUEsU0FBUyxFQUFFO0FBUlEsQ0FBZDs7O0FBV1AsTUFBTUMsU0FBUyxHQUFHLFlBQVc7QUFDM0IsUUFBTUMsVUFBVSxHQUFHLEVBQW5CO0FBQ0EsUUFBTUMsU0FBUyxHQUFHLEVBQWxCO0FBQ0EsUUFBTUMsSUFBSSxHQUFHLEVBQWI7QUFDQSxRQUFNQyxTQUFTLEdBQUcsRUFBbEI7QUFDQSxRQUFNQyxRQUFRLEdBQUdDLE1BQU0sQ0FBQ0MsSUFBUCxDQUFZaEIsS0FBWixFQUFtQmlCLE1BQW5CLENBQTBCLFVBQVNDLElBQVQsRUFBZUMsR0FBZixFQUFvQjtBQUM3REQsSUFBQUEsSUFBSSxDQUFDQyxHQUFELENBQUosR0FBWSxFQUFaO0FBQ0EsV0FBT0QsSUFBUDtBQUNELEdBSGdCLEVBR2QsRUFIYyxDQUFqQjtBQUtBLFNBQU9ILE1BQU0sQ0FBQ0ssTUFBUCxDQUFjO0FBQ25CVCxJQUFBQSxTQURtQjtBQUVuQkMsSUFBQUEsSUFGbUI7QUFHbkJGLElBQUFBLFVBSG1CO0FBSW5CSSxJQUFBQSxRQUptQjtBQUtuQkQsSUFBQUE7QUFMbUIsR0FB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bmltcG9ydCBQYXJzZSBmcm9tICdwYXJzZS9ub2RlJztcbmltcG9ydCB7IGxvZ2dlciB9IGZyb20gJy4vbG9nZ2VyJztcblxuZXhwb3J0IGNvbnN0IFR5cGVzID0ge1xuICBiZWZvcmVMb2dpbjogJ2JlZm9yZUxvZ2luJyxcbiAgYWZ0ZXJMb2dvdXQ6ICdhZnRlckxvZ291dCcsXG4gIGJlZm9yZVNhdmU6ICdiZWZvcmVTYXZlJyxcbiAgYWZ0ZXJTYXZlOiAnYWZ0ZXJTYXZlJyxcbiAgYmVmb3JlRGVsZXRlOiAnYmVmb3JlRGVsZXRlJyxcbiAgYWZ0ZXJEZWxldGU6ICdhZnRlckRlbGV0ZScsXG4gIGJlZm9yZUZpbmQ6ICdiZWZvcmVGaW5kJyxcbiAgYWZ0ZXJGaW5kOiAnYWZ0ZXJGaW5kJyxcbn07XG5cbmNvbnN0IGJhc2VTdG9yZSA9IGZ1bmN0aW9uKCkge1xuICBjb25zdCBWYWxpZGF0b3JzID0ge307XG4gIGNvbnN0IEZ1bmN0aW9ucyA9IHt9O1xuICBjb25zdCBKb2JzID0ge307XG4gIGNvbnN0IExpdmVRdWVyeSA9IFtdO1xuICBjb25zdCBUcmlnZ2VycyA9IE9iamVjdC5rZXlzKFR5cGVzKS5yZWR1Y2UoZnVuY3Rpb24oYmFzZSwga2V5KSB7XG4gICAgYmFzZVtrZXldID0ge307XG4gICAgcmV0dXJuIGJhc2U7XG4gIH0sIHt9KTtcblxuICByZXR1cm4gT2JqZWN0LmZyZWV6ZSh7XG4gICAgRnVuY3Rpb25zLFxuICAgIEpvYnMsXG4gICAgVmFsaWRhdG9ycyxcbiAgICBUcmlnZ2VycyxcbiAgICBMaXZlUXVlcnksXG4gIH0pO1xufTtcblxuZnVuY3Rpb24gdmFsaWRhdGVDbGFzc05hbWVGb3JUcmlnZ2VycyhjbGFzc05hbWUsIHR5cGUpIHtcbiAgaWYgKHR5cGUgPT0gVHlwZXMuYmVmb3JlU2F2ZSAmJiBjbGFzc05hbWUgPT09ICdfUHVzaFN0YXR1cycpIHtcbiAgICAvLyBfUHVzaFN0YXR1cyB1c2VzIHVuZG9jdW1lbnRlZCBuZXN0ZWQga2V5IGluY3JlbWVudCBvcHNcbiAgICAvLyBhbGxvd2luZyBiZWZvcmVTYXZlIHdvdWxkIG1lc3MgdXAgdGhlIG9iamVjdHMgYmlnIHRpbWVcbiAgICAvLyBUT0RPOiBBbGxvdyBwcm9wZXIgZG9jdW1lbnRlZCB3YXkgb2YgdXNpbmcgbmVzdGVkIGluY3JlbWVudCBvcHNcbiAgICB0aHJvdyAnT25seSBhZnRlclNhdmUgaXMgYWxsb3dlZCBvbiBfUHVzaFN0YXR1cyc7XG4gIH1cbiAgaWYgKHR5cGUgPT09IFR5cGVzLmJlZm9yZUxvZ2luICYmIGNsYXNzTmFtZSAhPT0gJ19Vc2VyJykge1xuICAgIC8vIFRPRE86IGNoZWNrIGlmIHVwc3RyZWFtIGNvZGUgd2lsbCBoYW5kbGUgYEVycm9yYCBpbnN0YW5jZSByYXRoZXJcbiAgICAvLyB0aGFuIHRoaXMgYW50aS1wYXR0ZXJuIG9mIHRocm93aW5nIHN0cmluZ3NcbiAgICB0aHJvdyAnT25seSB0aGUgX1VzZXIgY2xhc3MgaXMgYWxsb3dlZCBmb3IgdGhlIGJlZm9yZUxvZ2luIHRyaWdnZXInO1xuICB9XG4gIGlmICh0eXBlID09PSBUeXBlcy5hZnRlckxvZ291dCAmJiBjbGFzc05hbWUgIT09ICdfU2Vzc2lvbicpIHtcbiAgICAvLyBUT0RPOiBjaGVjayBpZiB1cHN0cmVhbSBjb2RlIHdpbGwgaGFuZGxlIGBFcnJvcmAgaW5zdGFuY2UgcmF0aGVyXG4gICAgLy8gdGhhbiB0aGlzIGFudGktcGF0dGVybiBvZiB0aHJvd2luZyBzdHJpbmdzXG4gICAgdGhyb3cgJ09ubHkgdGhlIF9TZXNzaW9uIGNsYXNzIGlzIGFsbG93ZWQgZm9yIHRoZSBhZnRlckxvZ291dCB0cmlnZ2VyLic7XG4gIH1cbiAgaWYgKGNsYXNzTmFtZSA9PT0gJ19TZXNzaW9uJyAmJiB0eXBlICE9PSBUeXBlcy5hZnRlckxvZ291dCkge1xuICAgIC8vIFRPRE86IGNoZWNrIGlmIHVwc3RyZWFtIGNvZGUgd2lsbCBoYW5kbGUgYEVycm9yYCBpbnN0YW5jZSByYXRoZXJcbiAgICAvLyB0aGFuIHRoaXMgYW50aS1wYXR0ZXJuIG9mIHRocm93aW5nIHN0cmluZ3NcbiAgICB0aHJvdyAnT25seSB0aGUgYWZ0ZXJMb2dvdXQgdHJpZ2dlciBpcyBhbGxvd2VkIGZvciB0aGUgX1Nlc3Npb24gY2xhc3MuJztcbiAgfVxuICByZXR1cm4gY2xhc3NOYW1lO1xufVxuXG5jb25zdCBfdHJpZ2dlclN0b3JlID0ge307XG5cbmNvbnN0IENhdGVnb3J5ID0ge1xuICBGdW5jdGlvbnM6ICdGdW5jdGlvbnMnLFxuICBWYWxpZGF0b3JzOiAnVmFsaWRhdG9ycycsXG4gIEpvYnM6ICdKb2JzJyxcbiAgVHJpZ2dlcnM6ICdUcmlnZ2VycycsXG59O1xuXG5mdW5jdGlvbiBnZXRTdG9yZShjYXRlZ29yeSwgbmFtZSwgYXBwbGljYXRpb25JZCkge1xuICBjb25zdCBwYXRoID0gbmFtZS5zcGxpdCgnLicpO1xuICBwYXRoLnNwbGljZSgtMSk7IC8vIHJlbW92ZSBsYXN0IGNvbXBvbmVudFxuICBhcHBsaWNhdGlvbklkID0gYXBwbGljYXRpb25JZCB8fCBQYXJzZS5hcHBsaWNhdGlvbklkO1xuICBfdHJpZ2dlclN0b3JlW2FwcGxpY2F0aW9uSWRdID0gX3RyaWdnZXJTdG9yZVthcHBsaWNhdGlvbklkXSB8fCBiYXNlU3RvcmUoKTtcbiAgbGV0IHN0b3JlID0gX3RyaWdnZXJTdG9yZVthcHBsaWNhdGlvbklkXVtjYXRlZ29yeV07XG4gIGZvciAoY29uc3QgY29tcG9uZW50IG9mIHBhdGgpIHtcbiAgICBzdG9yZSA9IHN0b3JlW2NvbXBvbmVudF07XG4gICAgaWYgKCFzdG9yZSkge1xuICAgICAgcmV0dXJuIHVuZGVmaW5lZDtcbiAgICB9XG4gIH1cbiAgcmV0dXJuIHN0b3JlO1xufVxuXG5mdW5jdGlvbiBhZGQoY2F0ZWdvcnksIG5hbWUsIGhhbmRsZXIsIGFwcGxpY2F0aW9uSWQpIHtcbiAgY29uc3QgbGFzdENvbXBvbmVudCA9IG5hbWUuc3BsaXQoJy4nKS5zcGxpY2UoLTEpO1xuICBjb25zdCBzdG9yZSA9IGdldFN0b3JlKGNhdGVnb3J5LCBuYW1lLCBhcHBsaWNhdGlvbklkKTtcbiAgc3RvcmVbbGFzdENvbXBvbmVudF0gPSBoYW5kbGVyO1xufVxuXG5mdW5jdGlvbiByZW1vdmUoY2F0ZWdvcnksIG5hbWUsIGFwcGxpY2F0aW9uSWQpIHtcbiAgY29uc3QgbGFzdENvbXBvbmVudCA9IG5hbWUuc3BsaXQoJy4nKS5zcGxpY2UoLTEpO1xuICBjb25zdCBzdG9yZSA9IGdldFN0b3JlKGNhdGVnb3J5LCBuYW1lLCBhcHBsaWNhdGlvbklkKTtcbiAgZGVsZXRlIHN0b3JlW2xhc3RDb21wb25lbnRdO1xufVxuXG5mdW5jdGlvbiBnZXQoY2F0ZWdvcnksIG5hbWUsIGFwcGxpY2F0aW9uSWQpIHtcbiAgY29uc3QgbGFzdENvbXBvbmVudCA9IG5hbWUuc3BsaXQoJy4nKS5zcGxpY2UoLTEpO1xuICBjb25zdCBzdG9yZSA9IGdldFN0b3JlKGNhdGVnb3J5LCBuYW1lLCBhcHBsaWNhdGlvbklkKTtcbiAgcmV0dXJuIHN0b3JlW2xhc3RDb21wb25lbnRdO1xufVxuXG5leHBvcnQgZnVuY3Rpb24gYWRkRnVuY3Rpb24oXG4gIGZ1bmN0aW9uTmFtZSxcbiAgaGFuZGxlcixcbiAgdmFsaWRhdGlvbkhhbmRsZXIsXG4gIGFwcGxpY2F0aW9uSWRcbikge1xuICBhZGQoQ2F0ZWdvcnkuRnVuY3Rpb25zLCBmdW5jdGlvbk5hbWUsIGhhbmRsZXIsIGFwcGxpY2F0aW9uSWQpO1xuICBhZGQoQ2F0ZWdvcnkuVmFsaWRhdG9ycywgZnVuY3Rpb25OYW1lLCB2YWxpZGF0aW9uSGFuZGxlciwgYXBwbGljYXRpb25JZCk7XG59XG5cbmV4cG9ydCBmdW5jdGlvbiBhZGRKb2Ioam9iTmFtZSwgaGFuZGxlciwgYXBwbGljYXRpb25JZCkge1xuICBhZGQoQ2F0ZWdvcnkuSm9icywgam9iTmFtZSwgaGFuZGxlciwgYXBwbGljYXRpb25JZCk7XG59XG5cbmV4cG9ydCBmdW5jdGlvbiBhZGRUcmlnZ2VyKHR5cGUsIGNsYXNzTmFtZSwgaGFuZGxlciwgYXBwbGljYXRpb25JZCkge1xuICB2YWxpZGF0ZUNsYXNzTmFtZUZvclRyaWdnZXJzKGNsYXNzTmFtZSwgdHlwZSk7XG4gIGFkZChDYXRlZ29yeS5UcmlnZ2VycywgYCR7dHlwZX0uJHtjbGFzc05hbWV9YCwgaGFuZGxlciwgYXBwbGljYXRpb25JZCk7XG59XG5cbmV4cG9ydCBmdW5jdGlvbiBhZGRMaXZlUXVlcnlFdmVudEhhbmRsZXIoaGFuZGxlciwgYXBwbGljYXRpb25JZCkge1xuICBhcHBsaWNhdGlvbklkID0gYXBwbGljYXRpb25JZCB8fCBQYXJzZS5hcHBsaWNhdGlvbklkO1xuICBfdHJpZ2dlclN0b3JlW2FwcGxpY2F0aW9uSWRdID0gX3RyaWdnZXJTdG9yZVthcHBsaWNhdGlvbklkXSB8fCBiYXNlU3RvcmUoKTtcbiAgX3RyaWdnZXJTdG9yZVthcHBsaWNhdGlvbklkXS5MaXZlUXVlcnkucHVzaChoYW5kbGVyKTtcbn1cblxuZXhwb3J0IGZ1bmN0aW9uIHJlbW92ZUZ1bmN0aW9uKGZ1bmN0aW9uTmFtZSwgYXBwbGljYXRpb25JZCkge1xuICByZW1vdmUoQ2F0ZWdvcnkuRnVuY3Rpb25zLCBmdW5jdGlvbk5hbWUsIGFwcGxpY2F0aW9uSWQpO1xufVxuXG5leHBvcnQgZnVuY3Rpb24gcmVtb3ZlVHJpZ2dlcih0eXBlLCBjbGFzc05hbWUsIGFwcGxpY2F0aW9uSWQpIHtcbiAgcmVtb3ZlKENhdGVnb3J5LlRyaWdnZXJzLCBgJHt0eXBlfS4ke2NsYXNzTmFtZX1gLCBhcHBsaWNhdGlvbklkKTtcbn1cblxuZXhwb3J0IGZ1bmN0aW9uIF91bnJlZ2lzdGVyQWxsKCkge1xuICBPYmplY3Qua2V5cyhfdHJpZ2dlclN0b3JlKS5mb3JFYWNoKGFwcElkID0+IGRlbGV0ZSBfdHJpZ2dlclN0b3JlW2FwcElkXSk7XG59XG5cbmV4cG9ydCBmdW5jdGlvbiBnZXRUcmlnZ2VyKGNsYXNzTmFtZSwgdHJpZ2dlclR5cGUsIGFwcGxpY2F0aW9uSWQpIHtcbiAgaWYgKCFhcHBsaWNhdGlvbklkKSB7XG4gICAgdGhyb3cgJ01pc3NpbmcgQXBwbGljYXRpb25JRCc7XG4gIH1cbiAgcmV0dXJuIGdldChDYXRlZ29yeS5UcmlnZ2VycywgYCR7dHJpZ2dlclR5cGV9LiR7Y2xhc3NOYW1lfWAsIGFwcGxpY2F0aW9uSWQpO1xufVxuXG5leHBvcnQgZnVuY3Rpb24gdHJpZ2dlckV4aXN0cyhcbiAgY2xhc3NOYW1lOiBzdHJpbmcsXG4gIHR5cGU6IHN0cmluZyxcbiAgYXBwbGljYXRpb25JZDogc3RyaW5nXG4pOiBib29sZWFuIHtcbiAgcmV0dXJuIGdldFRyaWdnZXIoY2xhc3NOYW1lLCB0eXBlLCBhcHBsaWNhdGlvbklkKSAhPSB1bmRlZmluZWQ7XG59XG5cbmV4cG9ydCBmdW5jdGlvbiBnZXRGdW5jdGlvbihmdW5jdGlvbk5hbWUsIGFwcGxpY2F0aW9uSWQpIHtcbiAgcmV0dXJuIGdldChDYXRlZ29yeS5GdW5jdGlvbnMsIGZ1bmN0aW9uTmFtZSwgYXBwbGljYXRpb25JZCk7XG59XG5cbmV4cG9ydCBmdW5jdGlvbiBnZXRGdW5jdGlvbk5hbWVzKGFwcGxpY2F0aW9uSWQpIHtcbiAgY29uc3Qgc3RvcmUgPVxuICAgIChfdHJpZ2dlclN0b3JlW2FwcGxpY2F0aW9uSWRdICYmXG4gICAgICBfdHJpZ2dlclN0b3JlW2FwcGxpY2F0aW9uSWRdW0NhdGVnb3J5LkZ1bmN0aW9uc10pIHx8XG4gICAge307XG4gIGNvbnN0IGZ1bmN0aW9uTmFtZXMgPSBbXTtcbiAgY29uc3QgZXh0cmFjdEZ1bmN0aW9uTmFtZXMgPSAobmFtZXNwYWNlLCBzdG9yZSkgPT4ge1xuICAgIE9iamVjdC5rZXlzKHN0b3JlKS5mb3JFYWNoKG5hbWUgPT4ge1xuICAgICAgY29uc3QgdmFsdWUgPSBzdG9yZVtuYW1lXTtcbiAgICAgIGlmIChuYW1lc3BhY2UpIHtcbiAgICAgICAgbmFtZSA9IGAke25hbWVzcGFjZX0uJHtuYW1lfWA7XG4gICAgICB9XG4gICAgICBpZiAodHlwZW9mIHZhbHVlID09PSAnZnVuY3Rpb24nKSB7XG4gICAgICAgIGZ1bmN0aW9uTmFtZXMucHVzaChuYW1lKTtcbiAgICAgIH0gZWxzZSB7XG4gICAgICAgIGV4dHJhY3RGdW5jdGlvbk5hbWVzKG5hbWUsIHZhbHVlKTtcbiAgICAgIH1cbiAgICB9KTtcbiAgfTtcbiAgZXh0cmFjdEZ1bmN0aW9uTmFtZXMobnVsbCwgc3RvcmUpO1xuICByZXR1cm4gZnVuY3Rpb25OYW1lcztcbn1cblxuZXhwb3J0IGZ1bmN0aW9uIGdldEpvYihqb2JOYW1lLCBhcHBsaWNhdGlvbklkKSB7XG4gIHJldHVybiBnZXQoQ2F0ZWdvcnkuSm9icywgam9iTmFtZSwgYXBwbGljYXRpb25JZCk7XG59XG5cbmV4cG9ydCBmdW5jdGlvbiBnZXRKb2JzKGFwcGxpY2F0aW9uSWQpIHtcbiAgdmFyIG1hbmFnZXIgPSBfdHJpZ2dlclN0b3JlW2FwcGxpY2F0aW9uSWRdO1xuICBpZiAobWFuYWdlciAmJiBtYW5hZ2VyLkpvYnMpIHtcbiAgICByZXR1cm4gbWFuYWdlci5Kb2JzO1xuICB9XG4gIHJldHVybiB1bmRlZmluZWQ7XG59XG5cbmV4cG9ydCBmdW5jdGlvbiBnZXRWYWxpZGF0b3IoZnVuY3Rpb25OYW1lLCBhcHBsaWNhdGlvbklkKSB7XG4gIHJldHVybiBnZXQoQ2F0ZWdvcnkuVmFsaWRhdG9ycywgZnVuY3Rpb25OYW1lLCBhcHBsaWNhdGlvbklkKTtcbn1cblxuZXhwb3J0IGZ1bmN0aW9uIGdldFJlcXVlc3RPYmplY3QoXG4gIHRyaWdnZXJUeXBlLFxuICBhdXRoLFxuICBwYXJzZU9iamVjdCxcbiAgb3JpZ2luYWxQYXJzZU9iamVjdCxcbiAgY29uZmlnLFxuICBjb250ZXh0XG4pIHtcbiAgY29uc3QgcmVxdWVzdCA9IHtcbiAgICB0cmlnZ2VyTmFtZTogdHJpZ2dlclR5cGUsXG4gICAgb2JqZWN0OiBwYXJzZU9iamVjdCxcbiAgICBtYXN0ZXI6IGZhbHNlLFxuICAgIGxvZzogY29uZmlnLmxvZ2dlckNvbnRyb2xsZXIsXG4gICAgaGVhZGVyczogY29uZmlnLmhlYWRlcnMsXG4gICAgaXA6IGNvbmZpZy5pcCxcbiAgfTtcblxuICBpZiAob3JpZ2luYWxQYXJzZU9iamVjdCkge1xuICAgIHJlcXVlc3Qub3JpZ2luYWwgPSBvcmlnaW5hbFBhcnNlT2JqZWN0O1xuICB9XG5cbiAgaWYgKHRyaWdnZXJUeXBlID09PSBUeXBlcy5iZWZvcmVTYXZlIHx8IHRyaWdnZXJUeXBlID09PSBUeXBlcy5hZnRlclNhdmUpIHtcbiAgICAvLyBTZXQgYSBjb3B5IG9mIHRoZSBjb250ZXh0IG9uIHRoZSByZXF1ZXN0IG9iamVjdC5cbiAgICByZXF1ZXN0LmNvbnRleHQgPSBPYmplY3QuYXNzaWduKHt9LCBjb250ZXh0KTtcbiAgfVxuXG4gIGlmICghYXV0aCkge1xuICAgIHJldHVybiByZXF1ZXN0O1xuICB9XG4gIGlmIChhdXRoLmlzTWFzdGVyKSB7XG4gICAgcmVxdWVzdFsnbWFzdGVyJ10gPSB0cnVlO1xuICB9XG4gIGlmIChhdXRoLnVzZXIpIHtcbiAgICByZXF1ZXN0Wyd1c2VyJ10gPSBhdXRoLnVzZXI7XG4gIH1cbiAgaWYgKGF1dGguaW5zdGFsbGF0aW9uSWQpIHtcbiAgICByZXF1ZXN0WydpbnN0YWxsYXRpb25JZCddID0gYXV0aC5pbnN0YWxsYXRpb25JZDtcbiAgfVxuICByZXR1cm4gcmVxdWVzdDtcbn1cblxuZXhwb3J0IGZ1bmN0aW9uIGdldFJlcXVlc3RRdWVyeU9iamVjdChcbiAgdHJpZ2dlclR5cGUsXG4gIGF1dGgsXG4gIHF1ZXJ5LFxuICBjb3VudCxcbiAgY29uZmlnLFxuICBpc0dldFxuKSB7XG4gIGlzR2V0ID0gISFpc0dldDtcblxuICB2YXIgcmVxdWVzdCA9IHtcbiAgICB0cmlnZ2VyTmFtZTogdHJpZ2dlclR5cGUsXG4gICAgcXVlcnksXG4gICAgbWFzdGVyOiBmYWxzZSxcbiAgICBjb3VudCxcbiAgICBsb2c6IGNvbmZpZy5sb2dnZXJDb250cm9sbGVyLFxuICAgIGlzR2V0LFxuICAgIGhlYWRlcnM6IGNvbmZpZy5oZWFkZXJzLFxuICAgIGlwOiBjb25maWcuaXAsXG4gIH07XG5cbiAgaWYgKCFhdXRoKSB7XG4gICAgcmV0dXJuIHJlcXVlc3Q7XG4gIH1cbiAgaWYgKGF1dGguaXNNYXN0ZXIpIHtcbiAgICByZXF1ZXN0WydtYXN0ZXInXSA9IHRydWU7XG4gIH1cbiAgaWYgKGF1dGgudXNlcikge1xuICAgIHJlcXVlc3RbJ3VzZXInXSA9IGF1dGgudXNlcjtcbiAgfVxuICBpZiAoYXV0aC5pbnN0YWxsYXRpb25JZCkge1xuICAgIHJlcXVlc3RbJ2luc3RhbGxhdGlvbklkJ10gPSBhdXRoLmluc3RhbGxhdGlvbklkO1xuICB9XG4gIHJldHVybiByZXF1ZXN0O1xufVxuXG4vLyBDcmVhdGVzIHRoZSByZXNwb25zZSBvYmplY3QsIGFuZCB1c2VzIHRoZSByZXF1ZXN0IG9iamVjdCB0byBwYXNzIGRhdGFcbi8vIFRoZSBBUEkgd2lsbCBjYWxsIHRoaXMgd2l0aCBSRVNUIEFQSSBmb3JtYXR0ZWQgb2JqZWN0cywgdGhpcyB3aWxsXG4vLyB0cmFuc2Zvcm0gdGhlbSB0byBQYXJzZS5PYmplY3QgaW5zdGFuY2VzIGV4cGVjdGVkIGJ5IENsb3VkIENvZGUuXG4vLyBBbnkgY2hhbmdlcyBtYWRlIHRvIHRoZSBvYmplY3QgaW4gYSBiZWZvcmVTYXZlIHdpbGwgYmUgaW5jbHVkZWQuXG5leHBvcnQgZnVuY3Rpb24gZ2V0UmVzcG9uc2VPYmplY3QocmVxdWVzdCwgcmVzb2x2ZSwgcmVqZWN0KSB7XG4gIHJldHVybiB7XG4gICAgc3VjY2VzczogZnVuY3Rpb24ocmVzcG9uc2UpIHtcbiAgICAgIGlmIChyZXF1ZXN0LnRyaWdnZXJOYW1lID09PSBUeXBlcy5hZnRlckZpbmQpIHtcbiAgICAgICAgaWYgKCFyZXNwb25zZSkge1xuICAgICAgICAgIHJlc3BvbnNlID0gcmVxdWVzdC5vYmplY3RzO1xuICAgICAgICB9XG4gICAgICAgIHJlc3BvbnNlID0gcmVzcG9uc2UubWFwKG9iamVjdCA9PiB7XG4gICAgICAgICAgcmV0dXJuIG9iamVjdC50b0pTT04oKTtcbiAgICAgICAgfSk7XG4gICAgICAgIHJldHVybiByZXNvbHZlKHJlc3BvbnNlKTtcbiAgICAgIH1cbiAgICAgIC8vIFVzZSB0aGUgSlNPTiByZXNwb25zZVxuICAgICAgaWYgKFxuICAgICAgICByZXNwb25zZSAmJlxuICAgICAgICB0eXBlb2YgcmVzcG9uc2UgPT09ICdvYmplY3QnICYmXG4gICAgICAgICFyZXF1ZXN0Lm9iamVjdC5lcXVhbHMocmVzcG9uc2UpICYmXG4gICAgICAgIHJlcXVlc3QudHJpZ2dlck5hbWUgPT09IFR5cGVzLmJlZm9yZVNhdmVcbiAgICAgICkge1xuICAgICAgICByZXR1cm4gcmVzb2x2ZShyZXNwb25zZSk7XG4gICAgICB9XG4gICAgICBpZiAoXG4gICAgICAgIHJlc3BvbnNlICYmXG4gICAgICAgIHR5cGVvZiByZXNwb25zZSA9PT0gJ29iamVjdCcgJiZcbiAgICAgICAgcmVxdWVzdC50cmlnZ2VyTmFtZSA9PT0gVHlwZXMuYWZ0ZXJTYXZlXG4gICAgICApIHtcbiAgICAgICAgcmV0dXJuIHJlc29sdmUocmVzcG9uc2UpO1xuICAgICAgfVxuICAgICAgaWYgKHJlcXVlc3QudHJpZ2dlck5hbWUgPT09IFR5cGVzLmFmdGVyU2F2ZSkge1xuICAgICAgICByZXR1cm4gcmVzb2x2ZSgpO1xuICAgICAgfVxuICAgICAgcmVzcG9uc2UgPSB7fTtcbiAgICAgIGlmIChyZXF1ZXN0LnRyaWdnZXJOYW1lID09PSBUeXBlcy5iZWZvcmVTYXZlKSB7XG4gICAgICAgIHJlc3BvbnNlWydvYmplY3QnXSA9IHJlcXVlc3Qub2JqZWN0Ll9nZXRTYXZlSlNPTigpO1xuICAgICAgfVxuICAgICAgcmV0dXJuIHJlc29sdmUocmVzcG9uc2UpO1xuICAgIH0sXG4gICAgZXJyb3I6IGZ1bmN0aW9uKGVycm9yKSB7XG4gICAgICBpZiAoZXJyb3IgaW5zdGFuY2VvZiBQYXJzZS5FcnJvcikge1xuICAgICAgICByZWplY3QoZXJyb3IpO1xuICAgICAgfSBlbHNlIGlmIChlcnJvciBpbnN0YW5jZW9mIEVycm9yKSB7XG4gICAgICAgIHJlamVjdChuZXcgUGFyc2UuRXJyb3IoUGFyc2UuRXJyb3IuU0NSSVBUX0ZBSUxFRCwgZXJyb3IubWVzc2FnZSkpO1xuICAgICAgfSBlbHNlIHtcbiAgICAgICAgcmVqZWN0KG5ldyBQYXJzZS5FcnJvcihQYXJzZS5FcnJvci5TQ1JJUFRfRkFJTEVELCBlcnJvcikpO1xuICAgICAgfVxuICAgIH0sXG4gIH07XG59XG5cbmZ1bmN0aW9uIHVzZXJJZEZvckxvZyhhdXRoKSB7XG4gIHJldHVybiBhdXRoICYmIGF1dGgudXNlciA/IGF1dGgudXNlci5pZCA6IHVuZGVmaW5lZDtcbn1cblxuZnVuY3Rpb24gbG9nVHJpZ2dlckFmdGVySG9vayh0cmlnZ2VyVHlwZSwgY2xhc3NOYW1lLCBpbnB1dCwgYXV0aCkge1xuICBjb25zdCBjbGVhbklucHV0ID0gbG9nZ2VyLnRydW5jYXRlTG9nTWVzc2FnZShKU09OLnN0cmluZ2lmeShpbnB1dCkpO1xuICBsb2dnZXIuaW5mbyhcbiAgICBgJHt0cmlnZ2VyVHlwZX0gdHJpZ2dlcmVkIGZvciAke2NsYXNzTmFtZX0gZm9yIHVzZXIgJHt1c2VySWRGb3JMb2coXG4gICAgICBhdXRoXG4gICAgKX06XFxuICBJbnB1dDogJHtjbGVhbklucHV0fWAsXG4gICAge1xuICAgICAgY2xhc3NOYW1lLFxuICAgICAgdHJpZ2dlclR5cGUsXG4gICAgICB1c2VyOiB1c2VySWRGb3JMb2coYXV0aCksXG4gICAgfVxuICApO1xufVxuXG5mdW5jdGlvbiBsb2dUcmlnZ2VyU3VjY2Vzc0JlZm9yZUhvb2soXG4gIHRyaWdnZXJUeXBlLFxuICBjbGFzc05hbWUsXG4gIGlucHV0LFxuICByZXN1bHQsXG4gIGF1dGhcbikge1xuICBjb25zdCBjbGVhbklucHV0ID0gbG9nZ2VyLnRydW5jYXRlTG9nTWVzc2FnZShKU09OLnN0cmluZ2lmeShpbnB1dCkpO1xuICBjb25zdCBjbGVhblJlc3VsdCA9IGxvZ2dlci50cnVuY2F0ZUxvZ01lc3NhZ2UoSlNPTi5zdHJpbmdpZnkocmVzdWx0KSk7XG4gIGxvZ2dlci5pbmZvKFxuICAgIGAke3RyaWdnZXJUeXBlfSB0cmlnZ2VyZWQgZm9yICR7Y2xhc3NOYW1lfSBmb3IgdXNlciAke3VzZXJJZEZvckxvZyhcbiAgICAgIGF1dGhcbiAgICApfTpcXG4gIElucHV0OiAke2NsZWFuSW5wdXR9XFxuICBSZXN1bHQ6ICR7Y2xlYW5SZXN1bHR9YCxcbiAgICB7XG4gICAgICBjbGFzc05hbWUsXG4gICAgICB0cmlnZ2VyVHlwZSxcbiAgICAgIHVzZXI6IHVzZXJJZEZvckxvZyhhdXRoKSxcbiAgICB9XG4gICk7XG59XG5cbmZ1bmN0aW9uIGxvZ1RyaWdnZXJFcnJvckJlZm9yZUhvb2sodHJpZ2dlclR5cGUsIGNsYXNzTmFtZSwgaW5wdXQsIGF1dGgsIGVycm9yKSB7XG4gIGNvbnN0IGNsZWFuSW5wdXQgPSBsb2dnZXIudHJ1bmNhdGVMb2dNZXNzYWdlKEpTT04uc3RyaW5naWZ5KGlucHV0KSk7XG4gIGxvZ2dlci5lcnJvcihcbiAgICBgJHt0cmlnZ2VyVHlwZX0gZmFpbGVkIGZvciAke2NsYXNzTmFtZX0gZm9yIHVzZXIgJHt1c2VySWRGb3JMb2coXG4gICAgICBhdXRoXG4gICAgKX06XFxuICBJbnB1dDogJHtjbGVhbklucHV0fVxcbiAgRXJyb3I6ICR7SlNPTi5zdHJpbmdpZnkoZXJyb3IpfWAsXG4gICAge1xuICAgICAgY2xhc3NOYW1lLFxuICAgICAgdHJpZ2dlclR5cGUsXG4gICAgICBlcnJvcixcbiAgICAgIHVzZXI6IHVzZXJJZEZvckxvZyhhdXRoKSxcbiAgICB9XG4gICk7XG59XG5cbmV4cG9ydCBmdW5jdGlvbiBtYXliZVJ1bkFmdGVyRmluZFRyaWdnZXIoXG4gIHRyaWdnZXJUeXBlLFxuICBhdXRoLFxuICBjbGFzc05hbWUsXG4gIG9iamVjdHMsXG4gIGNvbmZpZ1xuKSB7XG4gIHJldHVybiBuZXcgUHJvbWlzZSgocmVzb2x2ZSwgcmVqZWN0KSA9PiB7XG4gICAgY29uc3QgdHJpZ2dlciA9IGdldFRyaWdnZXIoY2xhc3NOYW1lLCB0cmlnZ2VyVHlwZSwgY29uZmlnLmFwcGxpY2F0aW9uSWQpO1xuICAgIGlmICghdHJpZ2dlcikge1xuICAgICAgcmV0dXJuIHJlc29sdmUoKTtcbiAgICB9XG4gICAgY29uc3QgcmVxdWVzdCA9IGdldFJlcXVlc3RPYmplY3QodHJpZ2dlclR5cGUsIGF1dGgsIG51bGwsIG51bGwsIGNvbmZpZyk7XG4gICAgY29uc3QgeyBzdWNjZXNzLCBlcnJvciB9ID0gZ2V0UmVzcG9uc2VPYmplY3QoXG4gICAgICByZXF1ZXN0LFxuICAgICAgb2JqZWN0ID0+IHtcbiAgICAgICAgcmVzb2x2ZShvYmplY3QpO1xuICAgICAgfSxcbiAgICAgIGVycm9yID0+IHtcbiAgICAgICAgcmVqZWN0KGVycm9yKTtcbiAgICAgIH1cbiAgICApO1xuICAgIGxvZ1RyaWdnZXJTdWNjZXNzQmVmb3JlSG9vayhcbiAgICAgIHRyaWdnZXJUeXBlLFxuICAgICAgY2xhc3NOYW1lLFxuICAgICAgJ0FmdGVyRmluZCcsXG4gICAgICBKU09OLnN0cmluZ2lmeShvYmplY3RzKSxcbiAgICAgIGF1dGhcbiAgICApO1xuICAgIHJlcXVlc3Qub2JqZWN0cyA9IG9iamVjdHMubWFwKG9iamVjdCA9PiB7XG4gICAgICAvL3NldHRpbmcgdGhlIGNsYXNzIG5hbWUgdG8gdHJhbnNmb3JtIGludG8gcGFyc2Ugb2JqZWN0XG4gICAgICBvYmplY3QuY2xhc3NOYW1lID0gY2xhc3NOYW1lO1xuICAgICAgcmV0dXJuIFBhcnNlLk9iamVjdC5mcm9tSlNPTihvYmplY3QpO1xuICAgIH0pO1xuICAgIHJldHVybiBQcm9taXNlLnJlc29sdmUoKVxuICAgICAgLnRoZW4oKCkgPT4ge1xuICAgICAgICBjb25zdCByZXNwb25zZSA9IHRyaWdnZXIocmVxdWVzdCk7XG4gICAgICAgIGlmIChyZXNwb25zZSAmJiB0eXBlb2YgcmVzcG9uc2UudGhlbiA9PT0gJ2Z1bmN0aW9uJykge1xuICAgICAgICAgIHJldHVybiByZXNwb25zZS50aGVuKHJlc3VsdHMgPT4ge1xuICAgICAgICAgICAgaWYgKCFyZXN1bHRzKSB7XG4gICAgICAgICAgICAgIHRocm93IG5ldyBQYXJzZS5FcnJvcihcbiAgICAgICAgICAgICAgICBQYXJzZS5FcnJvci5TQ1JJUFRfRkFJTEVELFxuICAgICAgICAgICAgICAgICdBZnRlckZpbmQgZXhwZWN0IHJlc3VsdHMgdG8gYmUgcmV0dXJuZWQgaW4gdGhlIHByb21pc2UnXG4gICAgICAgICAgICAgICk7XG4gICAgICAgICAgICB9XG4gICAgICAgICAgICByZXR1cm4gcmVzdWx0cztcbiAgICAgICAgICB9KTtcbiAgICAgICAgfVxuICAgICAgICByZXR1cm4gcmVzcG9uc2U7XG4gICAgICB9KVxuICAgICAgLnRoZW4oc3VjY2VzcywgZXJyb3IpO1xuICB9KS50aGVuKHJlc3VsdHMgPT4ge1xuICAgIGxvZ1RyaWdnZXJBZnRlckhvb2sodHJpZ2dlclR5cGUsIGNsYXNzTmFtZSwgSlNPTi5zdHJpbmdpZnkocmVzdWx0cyksIGF1dGgpO1xuICAgIHJldHVybiByZXN1bHRzO1xuICB9KTtcbn1cblxuZXhwb3J0IGZ1bmN0aW9uIG1heWJlUnVuUXVlcnlUcmlnZ2VyKFxuICB0cmlnZ2VyVHlwZSxcbiAgY2xhc3NOYW1lLFxuICByZXN0V2hlcmUsXG4gIHJlc3RPcHRpb25zLFxuICBjb25maWcsXG4gIGF1dGgsXG4gIGlzR2V0XG4pIHtcbiAgY29uc3QgdHJpZ2dlciA9IGdldFRyaWdnZXIoY2xhc3NOYW1lLCB0cmlnZ2VyVHlwZSwgY29uZmlnLmFwcGxpY2F0aW9uSWQpO1xuICBpZiAoIXRyaWdnZXIpIHtcbiAgICByZXR1cm4gUHJvbWlzZS5yZXNvbHZlKHtcbiAgICAgIHJlc3RXaGVyZSxcbiAgICAgIHJlc3RPcHRpb25zLFxuICAgIH0pO1xuICB9XG4gIGNvbnN0IGpzb24gPSBPYmplY3QuYXNzaWduKHt9LCByZXN0T3B0aW9ucyk7XG4gIGpzb24ud2hlcmUgPSByZXN0V2hlcmU7XG5cbiAgY29uc3QgcGFyc2VRdWVyeSA9IG5ldyBQYXJzZS5RdWVyeShjbGFzc05hbWUpO1xuICBwYXJzZVF1ZXJ5LndpdGhKU09OKGpzb24pO1xuXG4gIGxldCBjb3VudCA9IGZhbHNlO1xuICBpZiAocmVzdE9wdGlvbnMpIHtcbiAgICBjb3VudCA9ICEhcmVzdE9wdGlvbnMuY291bnQ7XG4gIH1cbiAgY29uc3QgcmVxdWVzdE9iamVjdCA9IGdldFJlcXVlc3RRdWVyeU9iamVjdChcbiAgICB0cmlnZ2VyVHlwZSxcbiAgICBhdXRoLFxuICAgIHBhcnNlUXVlcnksXG4gICAgY291bnQsXG4gICAgY29uZmlnLFxuICAgIGlzR2V0XG4gICk7XG4gIHJldHVybiBQcm9taXNlLnJlc29sdmUoKVxuICAgIC50aGVuKCgpID0+IHtcbiAgICAgIHJldHVybiB0cmlnZ2VyKHJlcXVlc3RPYmplY3QpO1xuICAgIH0pXG4gICAgLnRoZW4oXG4gICAgICByZXN1bHQgPT4ge1xuICAgICAgICBsZXQgcXVlcnlSZXN1bHQgPSBwYXJzZVF1ZXJ5O1xuICAgICAgICBpZiAocmVzdWx0ICYmIHJlc3VsdCBpbnN0YW5jZW9mIFBhcnNlLlF1ZXJ5KSB7XG4gICAgICAgICAgcXVlcnlSZXN1bHQgPSByZXN1bHQ7XG4gICAgICAgIH1cbiAgICAgICAgY29uc3QganNvblF1ZXJ5ID0gcXVlcnlSZXN1bHQudG9KU09OKCk7XG4gICAgICAgIGlmIChqc29uUXVlcnkud2hlcmUpIHtcbiAgICAgICAgICByZXN0V2hlcmUgPSBqc29uUXVlcnkud2hlcmU7XG4gICAgICAgIH1cbiAgICAgICAgaWYgKGpzb25RdWVyeS5saW1pdCkge1xuICAgICAgICAgIHJlc3RPcHRpb25zID0gcmVzdE9wdGlvbnMgfHwge307XG4gICAgICAgICAgcmVzdE9wdGlvbnMubGltaXQgPSBqc29uUXVlcnkubGltaXQ7XG4gICAgICAgIH1cbiAgICAgICAgaWYgKGpzb25RdWVyeS5za2lwKSB7XG4gICAgICAgICAgcmVzdE9wdGlvbnMgPSByZXN0T3B0aW9ucyB8fCB7fTtcbiAgICAgICAgICByZXN0T3B0aW9ucy5za2lwID0ganNvblF1ZXJ5LnNraXA7XG4gICAgICAgIH1cbiAgICAgICAgaWYgKGpzb25RdWVyeS5pbmNsdWRlKSB7XG4gICAgICAgICAgcmVzdE9wdGlvbnMgPSByZXN0T3B0aW9ucyB8fCB7fTtcbiAgICAgICAgICByZXN0T3B0aW9ucy5pbmNsdWRlID0ganNvblF1ZXJ5LmluY2x1ZGU7XG4gICAgICAgIH1cbiAgICAgICAgaWYgKGpzb25RdWVyeS5leGNsdWRlS2V5cykge1xuICAgICAgICAgIHJlc3RPcHRpb25zID0gcmVzdE9wdGlvbnMgfHwge307XG4gICAgICAgICAgcmVzdE9wdGlvbnMuZXhjbHVkZUtleXMgPSBqc29uUXVlcnkuZXhjbHVkZUtleXM7XG4gICAgICAgIH1cbiAgICAgICAgaWYgKGpzb25RdWVyeS5leHBsYWluKSB7XG4gICAgICAgICAgcmVzdE9wdGlvbnMgPSByZXN0T3B0aW9ucyB8fCB7fTtcbiAgICAgICAgICByZXN0T3B0aW9ucy5leHBsYWluID0ganNvblF1ZXJ5LmV4cGxhaW47XG4gICAgICAgIH1cbiAgICAgICAgaWYgKGpzb25RdWVyeS5rZXlzKSB7XG4gICAgICAgICAgcmVzdE9wdGlvbnMgPSByZXN0T3B0aW9ucyB8fCB7fTtcbiAgICAgICAgICByZXN0T3B0aW9ucy5rZXlzID0ganNvblF1ZXJ5LmtleXM7XG4gICAgICAgIH1cbiAgICAgICAgaWYgKGpzb25RdWVyeS5vcmRlcikge1xuICAgICAgICAgIHJlc3RPcHRpb25zID0gcmVzdE9wdGlvbnMgfHwge307XG4gICAgICAgICAgcmVzdE9wdGlvbnMub3JkZXIgPSBqc29uUXVlcnkub3JkZXI7XG4gICAgICAgIH1cbiAgICAgICAgaWYgKGpzb25RdWVyeS5oaW50KSB7XG4gICAgICAgICAgcmVzdE9wdGlvbnMgPSByZXN0T3B0aW9ucyB8fCB7fTtcbiAgICAgICAgICByZXN0T3B0aW9ucy5oaW50ID0ganNvblF1ZXJ5LmhpbnQ7XG4gICAgICAgIH1cbiAgICAgICAgaWYgKHJlcXVlc3RPYmplY3QucmVhZFByZWZlcmVuY2UpIHtcbiAgICAgICAgICByZXN0T3B0aW9ucyA9IHJlc3RPcHRpb25zIHx8IHt9O1xuICAgICAgICAgIHJlc3RPcHRpb25zLnJlYWRQcmVmZXJlbmNlID0gcmVxdWVzdE9iamVjdC5yZWFkUHJlZmVyZW5jZTtcbiAgICAgICAgfVxuICAgICAgICBpZiAocmVxdWVzdE9iamVjdC5pbmNsdWRlUmVhZFByZWZlcmVuY2UpIHtcbiAgICAgICAgICByZXN0T3B0aW9ucyA9IHJlc3RPcHRpb25zIHx8IHt9O1xuICAgICAgICAgIHJlc3RPcHRpb25zLmluY2x1ZGVSZWFkUHJlZmVyZW5jZSA9XG4gICAgICAgICAgICByZXF1ZXN0T2JqZWN0LmluY2x1ZGVSZWFkUHJlZmVyZW5jZTtcbiAgICAgICAgfVxuICAgICAgICBpZiAocmVxdWVzdE9iamVjdC5zdWJxdWVyeVJlYWRQcmVmZXJlbmNlKSB7XG4gICAgICAgICAgcmVzdE9wdGlvbnMgPSByZXN0T3B0aW9ucyB8fCB7fTtcbiAgICAgICAgICByZXN0T3B0aW9ucy5zdWJxdWVyeVJlYWRQcmVmZXJlbmNlID1cbiAgICAgICAgICAgIHJlcXVlc3RPYmplY3Quc3VicXVlcnlSZWFkUHJlZmVyZW5jZTtcbiAgICAgICAgfVxuICAgICAgICByZXR1cm4ge1xuICAgICAgICAgIHJlc3RXaGVyZSxcbiAgICAgICAgICByZXN0T3B0aW9ucyxcbiAgICAgICAgfTtcbiAgICAgIH0sXG4gICAgICBlcnIgPT4ge1xuICAgICAgICBpZiAodHlwZW9mIGVyciA9PT0gJ3N0cmluZycpIHtcbiAgICAgICAgICB0aHJvdyBuZXcgUGFyc2UuRXJyb3IoMSwgZXJyKTtcbiAgICAgICAgfSBlbHNlIHtcbiAgICAgICAgICB0aHJvdyBlcnI7XG4gICAgICAgIH1cbiAgICAgIH1cbiAgICApO1xufVxuXG4vLyBUbyBiZSB1c2VkIGFzIHBhcnQgb2YgdGhlIHByb21pc2UgY2hhaW4gd2hlbiBzYXZpbmcvZGVsZXRpbmcgYW4gb2JqZWN0XG4vLyBXaWxsIHJlc29sdmUgc3VjY2Vzc2Z1bGx5IGlmIG5vIHRyaWdnZXIgaXMgY29uZmlndXJlZFxuLy8gUmVzb2x2ZXMgdG8gYW4gb2JqZWN0LCBlbXB0eSBvciBjb250YWluaW5nIGFuIG9iamVjdCBrZXkuIEEgYmVmb3JlU2F2ZVxuLy8gdHJpZ2dlciB3aWxsIHNldCB0aGUgb2JqZWN0IGtleSB0byB0aGUgcmVzdCBmb3JtYXQgb2JqZWN0IHRvIHNhdmUuXG4vLyBvcmlnaW5hbFBhcnNlT2JqZWN0IGlzIG9wdGlvbmFsLCB3ZSBvbmx5IG5lZWQgdGhhdCBmb3IgYmVmb3JlL2FmdGVyU2F2ZSBmdW5jdGlvbnNcbmV4cG9ydCBmdW5jdGlvbiBtYXliZVJ1blRyaWdnZXIoXG4gIHRyaWdnZXJUeXBlLFxuICBhdXRoLFxuICBwYXJzZU9iamVjdCxcbiAgb3JpZ2luYWxQYXJzZU9iamVjdCxcbiAgY29uZmlnLFxuICBjb250ZXh0XG4pIHtcbiAgaWYgKCFwYXJzZU9iamVjdCkge1xuICAgIHJldHVybiBQcm9taXNlLnJlc29sdmUoe30pO1xuICB9XG4gIHJldHVybiBuZXcgUHJvbWlzZShmdW5jdGlvbihyZXNvbHZlLCByZWplY3QpIHtcbiAgICB2YXIgdHJpZ2dlciA9IGdldFRyaWdnZXIoXG4gICAgICBwYXJzZU9iamVjdC5jbGFzc05hbWUsXG4gICAgICB0cmlnZ2VyVHlwZSxcbiAgICAgIGNvbmZpZy5hcHBsaWNhdGlvbklkXG4gICAgKTtcbiAgICBpZiAoIXRyaWdnZXIpIHJldHVybiByZXNvbHZlKCk7XG4gICAgdmFyIHJlcXVlc3QgPSBnZXRSZXF1ZXN0T2JqZWN0KFxuICAgICAgdHJpZ2dlclR5cGUsXG4gICAgICBhdXRoLFxuICAgICAgcGFyc2VPYmplY3QsXG4gICAgICBvcmlnaW5hbFBhcnNlT2JqZWN0LFxuICAgICAgY29uZmlnLFxuICAgICAgY29udGV4dFxuICAgICk7XG4gICAgdmFyIHsgc3VjY2VzcywgZXJyb3IgfSA9IGdldFJlc3BvbnNlT2JqZWN0KFxuICAgICAgcmVxdWVzdCxcbiAgICAgIG9iamVjdCA9PiB7XG4gICAgICAgIGxvZ1RyaWdnZXJTdWNjZXNzQmVmb3JlSG9vayhcbiAgICAgICAgICB0cmlnZ2VyVHlwZSxcbiAgICAgICAgICBwYXJzZU9iamVjdC5jbGFzc05hbWUsXG4gICAgICAgICAgcGFyc2VPYmplY3QudG9KU09OKCksXG4gICAgICAgICAgb2JqZWN0LFxuICAgICAgICAgIGF1dGhcbiAgICAgICAgKTtcbiAgICAgICAgaWYgKFxuICAgICAgICAgIHRyaWdnZXJUeXBlID09PSBUeXBlcy5iZWZvcmVTYXZlIHx8XG4gICAgICAgICAgdHJpZ2dlclR5cGUgPT09IFR5cGVzLmFmdGVyU2F2ZVxuICAgICAgICApIHtcbiAgICAgICAgICBPYmplY3QuYXNzaWduKGNvbnRleHQsIHJlcXVlc3QuY29udGV4dCk7XG4gICAgICAgIH1cbiAgICAgICAgcmVzb2x2ZShvYmplY3QpO1xuICAgICAgfSxcbiAgICAgIGVycm9yID0+IHtcbiAgICAgICAgbG9nVHJpZ2dlckVycm9yQmVmb3JlSG9vayhcbiAgICAgICAgICB0cmlnZ2VyVHlwZSxcbiAgICAgICAgICBwYXJzZU9iamVjdC5jbGFzc05hbWUsXG4gICAgICAgICAgcGFyc2VPYmplY3QudG9KU09OKCksXG4gICAgICAgICAgYXV0aCxcbiAgICAgICAgICBlcnJvclxuICAgICAgICApO1xuICAgICAgICByZWplY3QoZXJyb3IpO1xuICAgICAgfVxuICAgICk7XG5cbiAgICAvLyBBZnRlclNhdmUgYW5kIGFmdGVyRGVsZXRlIHRyaWdnZXJzIGNhbiByZXR1cm4gYSBwcm9taXNlLCB3aGljaCBpZiB0aGV5XG4gICAgLy8gZG8sIG5lZWRzIHRvIGJlIHJlc29sdmVkIGJlZm9yZSB0aGlzIHByb21pc2UgaXMgcmVzb2x2ZWQsXG4gICAgLy8gc28gdHJpZ2dlciBleGVjdXRpb24gaXMgc3luY2VkIHdpdGggUmVzdFdyaXRlLmV4ZWN1dGUoKSBjYWxsLlxuICAgIC8vIElmIHRyaWdnZXJzIGRvIG5vdCByZXR1cm4gYSBwcm9taXNlLCB0aGV5IGNhbiBydW4gYXN5bmMgY29kZSBwYXJhbGxlbFxuICAgIC8vIHRvIHRoZSBSZXN0V3JpdGUuZXhlY3V0ZSgpIGNhbGwuXG4gICAgcmV0dXJuIFByb21pc2UucmVzb2x2ZSgpXG4gICAgICAudGhlbigoKSA9PiB7XG4gICAgICAgIGNvbnN0IHByb21pc2UgPSB0cmlnZ2VyKHJlcXVlc3QpO1xuICAgICAgICBpZiAoXG4gICAgICAgICAgdHJpZ2dlclR5cGUgPT09IFR5cGVzLmFmdGVyU2F2ZSB8fFxuICAgICAgICAgIHRyaWdnZXJUeXBlID09PSBUeXBlcy5hZnRlckRlbGV0ZVxuICAgICAgICApIHtcbiAgICAgICAgICBsb2dUcmlnZ2VyQWZ0ZXJIb29rKFxuICAgICAgICAgICAgdHJpZ2dlclR5cGUsXG4gICAgICAgICAgICBwYXJzZU9iamVjdC5jbGFzc05hbWUsXG4gICAgICAgICAgICBwYXJzZU9iamVjdC50b0pTT04oKSxcbiAgICAgICAgICAgIGF1dGhcbiAgICAgICAgICApO1xuICAgICAgICB9XG4gICAgICAgIC8vIGJlZm9yZVNhdmUgaXMgZXhwZWN0ZWQgdG8gcmV0dXJuIG51bGwgKG5vdGhpbmcpXG4gICAgICAgIGlmICh0cmlnZ2VyVHlwZSA9PT0gVHlwZXMuYmVmb3JlU2F2ZSkge1xuICAgICAgICAgIGlmIChwcm9taXNlICYmIHR5cGVvZiBwcm9taXNlLnRoZW4gPT09ICdmdW5jdGlvbicpIHtcbiAgICAgICAgICAgIHJldHVybiBwcm9taXNlLnRoZW4ocmVzcG9uc2UgPT4ge1xuICAgICAgICAgICAgICAvLyByZXNwb25zZS5vYmplY3QgbWF5IGNvbWUgZnJvbSBleHByZXNzIHJvdXRpbmcgYmVmb3JlIGhvb2tcbiAgICAgICAgICAgICAgaWYgKHJlc3BvbnNlICYmIHJlc3BvbnNlLm9iamVjdCkge1xuICAgICAgICAgICAgICAgIHJldHVybiByZXNwb25zZTtcbiAgICAgICAgICAgICAgfVxuICAgICAgICAgICAgICByZXR1cm4gbnVsbDtcbiAgICAgICAgICAgIH0pO1xuICAgICAgICAgIH1cbiAgICAgICAgICByZXR1cm4gbnVsbDtcbiAgICAgICAgfVxuXG4gICAgICAgIHJldHVybiBwcm9taXNlO1xuICAgICAgfSlcbiAgICAgIC50aGVuKHN1Y2Nlc3MsIGVycm9yKTtcbiAgfSk7XG59XG5cbi8vIENvbnZlcnRzIGEgUkVTVC1mb3JtYXQgb2JqZWN0IHRvIGEgUGFyc2UuT2JqZWN0XG4vLyBkYXRhIGlzIGVpdGhlciBjbGFzc05hbWUgb3IgYW4gb2JqZWN0XG5leHBvcnQgZnVuY3Rpb24gaW5mbGF0ZShkYXRhLCByZXN0T2JqZWN0KSB7XG4gIHZhciBjb3B5ID0gdHlwZW9mIGRhdGEgPT0gJ29iamVjdCcgPyBkYXRhIDogeyBjbGFzc05hbWU6IGRhdGEgfTtcbiAgZm9yICh2YXIga2V5IGluIHJlc3RPYmplY3QpIHtcbiAgICBjb3B5W2tleV0gPSByZXN0T2JqZWN0W2tleV07XG4gIH1cbiAgcmV0dXJuIFBhcnNlLk9iamVjdC5mcm9tSlNPTihjb3B5KTtcbn1cblxuZXhwb3J0IGZ1bmN0aW9uIHJ1bkxpdmVRdWVyeUV2ZW50SGFuZGxlcnMoXG4gIGRhdGEsXG4gIGFwcGxpY2F0aW9uSWQgPSBQYXJzZS5hcHBsaWNhdGlvbklkXG4pIHtcbiAgaWYgKFxuICAgICFfdHJpZ2dlclN0b3JlIHx8XG4gICAgIV90cmlnZ2VyU3RvcmVbYXBwbGljYXRpb25JZF0gfHxcbiAgICAhX3RyaWdnZXJTdG9yZVthcHBsaWNhdGlvbklkXS5MaXZlUXVlcnlcbiAgKSB7XG4gICAgcmV0dXJuO1xuICB9XG4gIF90cmlnZ2VyU3RvcmVbYXBwbGljYXRpb25JZF0uTGl2ZVF1ZXJ5LmZvckVhY2goaGFuZGxlciA9PiBoYW5kbGVyKGRhdGEpKTtcbn1cbiJdfQ==