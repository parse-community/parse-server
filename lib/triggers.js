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
  afterLogin: 'afterLogin',
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

  if ((type === Types.beforeLogin || type === Types.afterLogin) && className !== '_User') {
    // TODO: check if upstream code will handle `Error` instance rather
    // than this anti-pattern of throwing strings
    throw 'Only the _User class is allowed for the beforeLogin and afterLogin triggers';
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

      if (triggerType === Types.afterSave || triggerType === Types.afterDelete || triggerType === Types.afterLogin) {
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
//# sourceMappingURL=data:application/json;charset=utf-8;base64,eyJ2ZXJzaW9uIjozLCJzb3VyY2VzIjpbIi4uL3NyYy90cmlnZ2Vycy5qcyJdLCJuYW1lcyI6WyJUeXBlcyIsImJlZm9yZUxvZ2luIiwiYWZ0ZXJMb2dpbiIsImFmdGVyTG9nb3V0IiwiYmVmb3JlU2F2ZSIsImFmdGVyU2F2ZSIsImJlZm9yZURlbGV0ZSIsImFmdGVyRGVsZXRlIiwiYmVmb3JlRmluZCIsImFmdGVyRmluZCIsImJhc2VTdG9yZSIsIlZhbGlkYXRvcnMiLCJGdW5jdGlvbnMiLCJKb2JzIiwiTGl2ZVF1ZXJ5IiwiVHJpZ2dlcnMiLCJPYmplY3QiLCJrZXlzIiwicmVkdWNlIiwiYmFzZSIsImtleSIsImZyZWV6ZSIsInZhbGlkYXRlQ2xhc3NOYW1lRm9yVHJpZ2dlcnMiLCJjbGFzc05hbWUiLCJ0eXBlIiwiX3RyaWdnZXJTdG9yZSIsIkNhdGVnb3J5IiwiZ2V0U3RvcmUiLCJjYXRlZ29yeSIsIm5hbWUiLCJhcHBsaWNhdGlvbklkIiwicGF0aCIsInNwbGl0Iiwic3BsaWNlIiwiUGFyc2UiLCJzdG9yZSIsImNvbXBvbmVudCIsInVuZGVmaW5lZCIsImFkZCIsImhhbmRsZXIiLCJsYXN0Q29tcG9uZW50IiwicmVtb3ZlIiwiZ2V0IiwiYWRkRnVuY3Rpb24iLCJmdW5jdGlvbk5hbWUiLCJ2YWxpZGF0aW9uSGFuZGxlciIsImFkZEpvYiIsImpvYk5hbWUiLCJhZGRUcmlnZ2VyIiwiYWRkTGl2ZVF1ZXJ5RXZlbnRIYW5kbGVyIiwicHVzaCIsInJlbW92ZUZ1bmN0aW9uIiwicmVtb3ZlVHJpZ2dlciIsIl91bnJlZ2lzdGVyQWxsIiwiZm9yRWFjaCIsImFwcElkIiwiZ2V0VHJpZ2dlciIsInRyaWdnZXJUeXBlIiwidHJpZ2dlckV4aXN0cyIsImdldEZ1bmN0aW9uIiwiZ2V0RnVuY3Rpb25OYW1lcyIsImZ1bmN0aW9uTmFtZXMiLCJleHRyYWN0RnVuY3Rpb25OYW1lcyIsIm5hbWVzcGFjZSIsInZhbHVlIiwiZ2V0Sm9iIiwiZ2V0Sm9icyIsIm1hbmFnZXIiLCJnZXRWYWxpZGF0b3IiLCJnZXRSZXF1ZXN0T2JqZWN0IiwiYXV0aCIsInBhcnNlT2JqZWN0Iiwib3JpZ2luYWxQYXJzZU9iamVjdCIsImNvbmZpZyIsImNvbnRleHQiLCJyZXF1ZXN0IiwidHJpZ2dlck5hbWUiLCJvYmplY3QiLCJtYXN0ZXIiLCJsb2ciLCJsb2dnZXJDb250cm9sbGVyIiwiaGVhZGVycyIsImlwIiwib3JpZ2luYWwiLCJhc3NpZ24iLCJpc01hc3RlciIsInVzZXIiLCJpbnN0YWxsYXRpb25JZCIsImdldFJlcXVlc3RRdWVyeU9iamVjdCIsInF1ZXJ5IiwiY291bnQiLCJpc0dldCIsImdldFJlc3BvbnNlT2JqZWN0IiwicmVzb2x2ZSIsInJlamVjdCIsInN1Y2Nlc3MiLCJyZXNwb25zZSIsIm9iamVjdHMiLCJtYXAiLCJ0b0pTT04iLCJlcXVhbHMiLCJfZ2V0U2F2ZUpTT04iLCJlcnJvciIsIkVycm9yIiwiU0NSSVBUX0ZBSUxFRCIsIm1lc3NhZ2UiLCJ1c2VySWRGb3JMb2ciLCJpZCIsImxvZ1RyaWdnZXJBZnRlckhvb2siLCJpbnB1dCIsImNsZWFuSW5wdXQiLCJsb2dnZXIiLCJ0cnVuY2F0ZUxvZ01lc3NhZ2UiLCJKU09OIiwic3RyaW5naWZ5IiwiaW5mbyIsImxvZ1RyaWdnZXJTdWNjZXNzQmVmb3JlSG9vayIsInJlc3VsdCIsImNsZWFuUmVzdWx0IiwibG9nVHJpZ2dlckVycm9yQmVmb3JlSG9vayIsIm1heWJlUnVuQWZ0ZXJGaW5kVHJpZ2dlciIsIlByb21pc2UiLCJ0cmlnZ2VyIiwiZnJvbUpTT04iLCJ0aGVuIiwicmVzdWx0cyIsIm1heWJlUnVuUXVlcnlUcmlnZ2VyIiwicmVzdFdoZXJlIiwicmVzdE9wdGlvbnMiLCJqc29uIiwid2hlcmUiLCJwYXJzZVF1ZXJ5IiwiUXVlcnkiLCJ3aXRoSlNPTiIsInJlcXVlc3RPYmplY3QiLCJxdWVyeVJlc3VsdCIsImpzb25RdWVyeSIsImxpbWl0Iiwic2tpcCIsImluY2x1ZGUiLCJleGNsdWRlS2V5cyIsImV4cGxhaW4iLCJvcmRlciIsImhpbnQiLCJyZWFkUHJlZmVyZW5jZSIsImluY2x1ZGVSZWFkUHJlZmVyZW5jZSIsInN1YnF1ZXJ5UmVhZFByZWZlcmVuY2UiLCJlcnIiLCJtYXliZVJ1blRyaWdnZXIiLCJwcm9taXNlIiwiaW5mbGF0ZSIsImRhdGEiLCJyZXN0T2JqZWN0IiwiY29weSIsInJ1bkxpdmVRdWVyeUV2ZW50SGFuZGxlcnMiXSwibWFwcGluZ3MiOiI7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7O0FBQ0E7O0FBQ0E7Ozs7QUFGQTtBQUlPLE1BQU1BLEtBQUssR0FBRztBQUNuQkMsRUFBQUEsV0FBVyxFQUFFLGFBRE07QUFFbkJDLEVBQUFBLFVBQVUsRUFBRSxZQUZPO0FBR25CQyxFQUFBQSxXQUFXLEVBQUUsYUFITTtBQUluQkMsRUFBQUEsVUFBVSxFQUFFLFlBSk87QUFLbkJDLEVBQUFBLFNBQVMsRUFBRSxXQUxRO0FBTW5CQyxFQUFBQSxZQUFZLEVBQUUsY0FOSztBQU9uQkMsRUFBQUEsV0FBVyxFQUFFLGFBUE07QUFRbkJDLEVBQUFBLFVBQVUsRUFBRSxZQVJPO0FBU25CQyxFQUFBQSxTQUFTLEVBQUU7QUFUUSxDQUFkOzs7QUFZUCxNQUFNQyxTQUFTLEdBQUcsWUFBVztBQUMzQixRQUFNQyxVQUFVLEdBQUcsRUFBbkI7QUFDQSxRQUFNQyxTQUFTLEdBQUcsRUFBbEI7QUFDQSxRQUFNQyxJQUFJLEdBQUcsRUFBYjtBQUNBLFFBQU1DLFNBQVMsR0FBRyxFQUFsQjtBQUNBLFFBQU1DLFFBQVEsR0FBR0MsTUFBTSxDQUFDQyxJQUFQLENBQVlqQixLQUFaLEVBQW1Ca0IsTUFBbkIsQ0FBMEIsVUFBU0MsSUFBVCxFQUFlQyxHQUFmLEVBQW9CO0FBQzdERCxJQUFBQSxJQUFJLENBQUNDLEdBQUQsQ0FBSixHQUFZLEVBQVo7QUFDQSxXQUFPRCxJQUFQO0FBQ0QsR0FIZ0IsRUFHZCxFQUhjLENBQWpCO0FBS0EsU0FBT0gsTUFBTSxDQUFDSyxNQUFQLENBQWM7QUFDbkJULElBQUFBLFNBRG1CO0FBRW5CQyxJQUFBQSxJQUZtQjtBQUduQkYsSUFBQUEsVUFIbUI7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RCxDQUFiLENBQTZCaEIsU0FBN0IsQ0FBdUN3QyxPQUF2QyxDQUErQ2YsT0FBTyxJQUFJQSxPQUFPLENBQUNnSCxJQUFELENBQWpFO0FBQ0QiLCJzb3VyY2VzQ29udGVudCI6WyIvLyB0cmlnZ2Vycy5qc1xuaW1wb3J0IFBhcnNlIGZyb20gJ3BhcnNlL25vZGUnO1xuaW1wb3J0IHsgbG9nZ2VyIH0gZnJvbSAnLi9sb2dnZXInO1xuXG5leHBvcnQgY29uc3QgVHlwZXMgPSB7XG4gIGJlZm9yZUxvZ2luOiAnYmVmb3JlTG9naW4nLFxuICBhZnRlckxvZ2luOiAnYWZ0ZXJMb2dpbicsXG4gIGFmdGVyTG9nb3V0OiAnYWZ0ZXJMb2dvdXQnLFxuICBiZWZvcmVTYXZlOiAnYmVmb3JlU2F2ZScsXG4gIGFmdGVyU2F2ZTogJ2FmdGVyU2F2ZScsXG4gIGJlZm9yZURlbGV0ZTogJ2JlZm9yZURlbGV0ZScsXG4gIGFmdGVyRGVsZXRlOiAnYWZ0ZXJEZWxldGUnLFxuICBiZWZvcmVGaW5kOiAnYmVmb3JlRmluZCcsXG4gIGFmdGVyRmluZDogJ2FmdGVyRmluZCcsXG59O1xuXG5jb25zdCBiYXNlU3RvcmUgPSBmdW5jdGlvbigpIHtcbiAgY29uc3QgVmFsaWRhdG9ycyA9IHt9O1xuICBjb25zdCBGdW5jdGlvbnMgPSB7fTtcbiAgY29uc3QgSm9icyA9IHt9O1xuICBjb25zdCBMaXZlUXVlcnkgPSBbXTtcbiAgY29uc3QgVHJpZ2dlcnMgPSBPYmplY3Qua2V5cyhUeXBlcykucmVkdWNlKGZ1bmN0aW9uKGJhc2UsIGtleSkge1xuICAgIGJhc2Vba2V5XSA9IHt9O1xuICAgIHJldHVybiBiYXNlO1xuICB9LCB7fSk7XG5cbiAgcmV0dXJuIE9iamVjdC5mcmVlemUoe1xuICAgIEZ1bmN0aW9ucyxcbiAgICBKb2JzLFxuICAgIFZhbGlkYXRvcnMsXG4gICAgVHJpZ2dlcnMsXG4gICAgTGl2ZVF1ZXJ5LFxuICB9KTtcbn07XG5cbmZ1bmN0aW9uIHZhbGlkYXRlQ2xhc3NOYW1lRm9yVHJpZ2dlcnMoY2xhc3NOYW1lLCB0eXBlKSB7XG4gIGlmICh0eXBlID09IFR5cGVzLmJlZm9yZVNhdmUgJiYgY2xhc3NOYW1lID09PSAnX1B1c2hTdGF0dXMnKSB7XG4gICAgLy8gX1B1c2hTdGF0dXMgdXNlcyB1bmRvY3VtZW50ZWQgbmVzdGVkIGtleSBpbmNyZW1lbnQgb3BzXG4gICAgLy8gYWxsb3dpbmcgYmVmb3JlU2F2ZSB3b3VsZCBtZXNzIHVwIHRoZSBvYmplY3RzIGJpZyB0aW1lXG4gICAgLy8gVE9ETzogQWxsb3cgcHJvcGVyIGRvY3VtZW50ZWQgd2F5IG9mIHVzaW5nIG5lc3RlZCBpbmNyZW1lbnQgb3BzXG4gICAgdGhyb3cgJ09ubHkgYWZ0ZXJTYXZlIGlzIGFsbG93ZWQgb24gX1B1c2hTdGF0dXMnO1xuICB9XG4gIGlmIChcbiAgICAodHlwZSA9PT0gVHlwZXMuYmVmb3JlTG9naW4gfHwgdHlwZSA9PT0gVHlwZXMuYWZ0ZXJMb2dpbikgJiZcbiAgICBjbGFzc05hbWUgIT09ICdfVXNlcidcbiAgKSB7XG4gICAgLy8gVE9ETzogY2hlY2sgaWYgdXBzdHJlYW0gY29kZSB3aWxsIGhhbmRsZSBgRXJyb3JgIGluc3RhbmNlIHJhdGhlclxuICAgIC8vIHRoYW4gdGhpcyBhbnRpLXBhdHRlcm4gb2YgdGhyb3dpbmcgc3RyaW5nc1xuICAgIHRocm93ICdPbmx5IHRoZSBfVXNlciBjbGFzcyBpcyBhbGxvd2VkIGZvciB0aGUgYmVmb3JlTG9naW4gYW5kIGFmdGVyTG9naW4gdHJpZ2dlcnMnO1xuICB9XG4gIGlmICh0eXBlID09PSBUeXBlcy5hZnRlckxvZ291dCAmJiBjbGFzc05hbWUgIT09ICdfU2Vzc2lvbicpIHtcbiAgICAvLyBUT0RPOiBjaGVjayBpZiB1cHN0cmVhbSBjb2RlIHdpbGwgaGFuZGxlIGBFcnJvcmAgaW5zdGFuY2UgcmF0aGVyXG4gICAgLy8gdGhhbiB0aGlzIGFudGktcGF0dGVybiBvZiB0aHJvd2luZyBzdHJpbmdzXG4gICAgdGhyb3cgJ09ubHkgdGhlIF9TZXNzaW9uIGNsYXNzIGlzIGFsbG93ZWQgZm9yIHRoZSBhZnRlckxvZ291dCB0cmlnZ2VyLic7XG4gIH1cbiAgaWYgKGNsYXNzTmFtZSA9PT0gJ19TZXNzaW9uJyAmJiB0eXBlICE9PSBUeXBlcy5hZnRlckxvZ291dCkge1xuICAgIC8vIFRPRE86IGNoZWNrIGlmIHVwc3RyZWFtIGNvZGUgd2lsbCBoYW5kbGUgYEVycm9yYCBpbnN0YW5jZSByYXRoZXJcbiAgICAvLyB0aGFuIHRoaXMgYW50aS1wYXR0ZXJuIG9mIHRocm93aW5nIHN0cmluZ3NcbiAgICB0aHJvdyAnT25seSB0aGUgYWZ0ZXJMb2dvdXQgdHJpZ2dlciBpcyBhbGxvd2VkIGZvciB0aGUgX1Nlc3Npb24gY2xhc3MuJztcbiAgfVxuICByZXR1cm4gY2xhc3NOYW1lO1xufVxuXG5jb25zdCBfdHJpZ2dlclN0b3JlID0ge307XG5cbmNvbnN0IENhdGVnb3J5ID0ge1xuICBGdW5jdGlvbnM6ICdGdW5jdGlvbnMnLFxuICBWYWxpZGF0b3JzOiAnVmFsaWRhdG9ycycsXG4gIEpvYnM6ICdKb2JzJyxcbiAgVHJpZ2dlcnM6ICdUcmlnZ2VycycsXG59O1xuXG5mdW5jdGlvbiBnZXRTdG9yZShjYXRlZ29yeSwgbmFtZSwgYXBwbGljYXRpb25JZCkge1xuICBjb25zdCBwYXRoID0gbmFtZS5zcGxpdCgnLicpO1xuICBwYXRoLnNwbGljZSgtMSk7IC8vIHJlbW92ZSBsYXN0IGNvbXBvbmVudFxuICBhcHBsaWNhdGlvbklkID0gYXBwbGljYXRpb25JZCB8fCBQYXJzZS5hcHBsaWNhdGlvbklkO1xuICBfdHJpZ2dlclN0b3JlW2FwcGxpY2F0aW9uSWRdID0gX3RyaWdnZXJTdG9yZVthcHBsaWNhdGlvbklkXSB8fCBiYXNlU3RvcmUoKTtcbiAgbGV0IHN0b3JlID0gX3RyaWdnZXJTdG9yZVthcHBsaWNhdGlvbklkXVtjYXRlZ29yeV07XG4gIGZvciAoY29uc3QgY29tcG9uZW50IG9mIHBhdGgpIHtcbiAgICBzdG9yZSA9IHN0b3JlW2NvbXBvbmVudF07XG4gICAgaWYgKCFzdG9yZSkge1xuICAgICAgcmV0dXJuIHVuZGVmaW5lZDtcbiAgICB9XG4gIH1cbiAgcmV0dXJuIHN0b3JlO1xufVxuXG5mdW5jdGlvbiBhZGQoY2F0ZWdvcnksIG5hbWUsIGhhbmRsZXIsIGFwcGxpY2F0aW9uSWQpIHtcbiAgY29uc3QgbGFzdENvbXBvbmVudCA9IG5hbWUuc3BsaXQoJy4nKS5zcGxpY2UoLTEpO1xuICBjb25zdCBzdG9yZSA9IGdldFN0b3JlKGNhdGVnb3J5LCBuYW1lLCBhcHBsaWNhdGlvbklkKTtcbiAgc3RvcmVbbGFzdENvbXBvbmVudF0gPSBoYW5kbGVyO1xufVxuXG5mdW5jdGlvbiByZW1vdmUoY2F0ZWdvcnksIG5hbWUsIGFwcGxpY2F0aW9uSWQpIHtcbiAgY29uc3QgbGFzdENvbXBvbmVudCA9IG5hbWUuc3BsaXQoJy4nKS5zcGxpY2UoLTEpO1xuICBjb25zdCBzdG9yZSA9IGdldFN0b3JlKGNhdGVnb3J5LCBuYW1lLCBhcHBsaWNhdGlvbklkKTtcbiAgZGVsZXRlIHN0b3JlW2xhc3RDb21wb25lbnRdO1xufVxuXG5mdW5jdGlvbiBnZXQoY2F0ZWdvcnksIG5hbWUsIGFwcGxpY2F0aW9uSWQpIHtcbiAgY29uc3QgbGFzdENvbXBvbmVudCA9IG5hbWUuc3BsaXQoJy4nKS5zcGxpY2UoLTEpO1xuICBjb25zdCBzdG9yZSA9IGdldFN0b3JlKGNhdGVnb3J5LCBuYW1lLCBhcHBsaWNhdGlvbklkKTtcbiAgcmV0dXJuIHN0b3JlW2xhc3RDb21wb25lbnRdO1xufVxuXG5leHBvcnQgZnVuY3Rpb24gYWRkRnVuY3Rpb24oXG4gIGZ1bmN0aW9uTmFtZSxcbiAgaGFuZGxlcixcbiAgdmFsaWRhdGlvbkhhbmRsZXIsXG4gIGFwcGxpY2F0aW9uSWRcbikge1xuICBhZGQoQ2F0ZWdvcnkuRnVuY3Rpb25zLCBmdW5jdGlvbk5hbWUsIGhhbmRsZXIsIGFwcGxpY2F0aW9uSWQpO1xuICBhZGQoQ2F0ZWdvcnkuVmFsaWRhdG9ycywgZnVuY3Rpb25OYW1lLCB2YWxpZGF0aW9uSGFuZGxlciwgYXBwbGljYXRpb25JZCk7XG59XG5cbmV4cG9ydCBmdW5jdGlvbiBhZGRKb2Ioam9iTmFtZSwgaGFuZGxlciwgYXBwbGljYXRpb25JZCkge1xuICBhZGQoQ2F0ZWdvcnkuSm9icywgam9iTmFtZSwgaGFuZGxlciwgYXBwbGljYXRpb25JZCk7XG59XG5cbmV4cG9ydCBmdW5jdGlvbiBhZGRUcmlnZ2VyKHR5cGUsIGNsYXNzTmFtZSwgaGFuZGxlciwgYXBwbGljYXRpb25JZCkge1xuICB2YWxpZGF0ZUNsYXNzTmFtZUZvclRyaWdnZXJzKGNsYXNzTmFtZSwgdHlwZSk7XG4gIGFkZChDYXRlZ29yeS5UcmlnZ2VycywgYCR7dHlwZX0uJHtjbGFzc05hbWV9YCwgaGFuZGxlciwgYXBwbGljYXRpb25JZCk7XG59XG5cbmV4cG9ydCBmdW5jdGlvbiBhZGRMaXZlUXVlcnlFdmVudEhhbmRsZXIoaGFuZGxlciwgYXBwbGljYXRpb25JZCkge1xuICBhcHBsaWNhdGlvbklkID0gYXBwbGljYXRpb25JZCB8fCBQYXJzZS5hcHBsaWNhdGlvbklkO1xuICBfdHJpZ2dlclN0b3JlW2FwcGxpY2F0aW9uSWRdID0gX3RyaWdnZXJTdG9yZVthcHBsaWNhdGlvbklkXSB8fCBiYXNlU3RvcmUoKTtcbiAgX3RyaWdnZXJTdG9yZVthcHBsaWNhdGlvbklkXS5MaXZlUXVlcnkucHVzaChoYW5kbGVyKTtcbn1cblxuZXhwb3J0IGZ1bmN0aW9uIHJlbW92ZUZ1bmN0aW9uKGZ1bmN0aW9uTmFtZSwgYXBwbGljYXRpb25JZCkge1xuICByZW1vdmUoQ2F0ZWdvcnkuRnVuY3Rpb25zLCBmdW5jdGlvbk5hbWUsIGFwcGxpY2F0aW9uSWQpO1xufVxuXG5leHBvcnQgZnVuY3Rpb24gcmVtb3ZlVHJpZ2dlcih0eXBlLCBjbGFzc05hbWUsIGFwcGxpY2F0aW9uSWQpIHtcbiAgcmVtb3ZlKENhdGVnb3J5LlRyaWdnZXJzLCBgJHt0eXBlfS4ke2NsYXNzTmFtZX1gLCBhcHBsaWNhdGlvbklkKTtcbn1cblxuZXhwb3J0IGZ1bmN0aW9uIF91bnJlZ2lzdGVyQWxsKCkge1xuICBPYmplY3Qua2V5cyhfdHJpZ2dlclN0b3JlKS5mb3JFYWNoKGFwcElkID0+IGRlbGV0ZSBfdHJpZ2dlclN0b3JlW2FwcElkXSk7XG59XG5cbmV4cG9ydCBmdW5jdGlvbiBnZXRUcmlnZ2VyKGNsYXNzTmFtZSwgdHJpZ2dlclR5cGUsIGFwcGxpY2F0aW9uSWQpIHtcbiAgaWYgKCFhcHBsaWNhdGlvbklkKSB7XG4gICAgdGhyb3cgJ01pc3NpbmcgQXBwbGljYXRpb25JRCc7XG4gIH1cbiAgcmV0dXJuIGdldChDYXRlZ29yeS5UcmlnZ2VycywgYCR7dHJpZ2dlclR5cGV9LiR7Y2xhc3NOYW1lfWAsIGFwcGxpY2F0aW9uSWQpO1xufVxuXG5leHBvcnQgZnVuY3Rpb24gdHJpZ2dlckV4aXN0cyhcbiAgY2xhc3NOYW1lOiBzdHJpbmcsXG4gIHR5cGU6IHN0cmluZyxcbiAgYXBwbGljYXRpb25JZDogc3RyaW5nXG4pOiBib29sZWFuIHtcbiAgcmV0dXJuIGdldFRyaWdnZXIoY2xhc3NOYW1lLCB0eXBlLCBhcHBsaWNhdGlvbklkKSAhPSB1bmRlZmluZWQ7XG59XG5cbmV4cG9ydCBmdW5jdGlvbiBnZXRGdW5jdGlvbihmdW5jdGlvbk5hbWUsIGFwcGxpY2F0aW9uSWQpIHtcbiAgcmV0dXJuIGdldChDYXRlZ29yeS5GdW5jdGlvbnMsIGZ1bmN0aW9uTmFtZSwgYXBwbGljYXRpb25JZCk7XG59XG5cbmV4cG9ydCBmdW5jdGlvbiBnZXRGdW5jdGlvbk5hbWVzKGFwcGxpY2F0aW9uSWQpIHtcbiAgY29uc3Qgc3RvcmUgPVxuICAgIChfdHJpZ2dlclN0b3JlW2FwcGxpY2F0aW9uSWRdICYmXG4gICAgICBfdHJpZ2dlclN0b3JlW2FwcGxpY2F0aW9uSWRdW0NhdGVnb3J5LkZ1bmN0aW9uc10pIHx8XG4gICAge307XG4gIGNvbnN0IGZ1bmN0aW9uTmFtZXMgPSBbXTtcbiAgY29uc3QgZXh0cmFjdEZ1bmN0aW9uTmFtZXMgPSAobmFtZXNwYWNlLCBzdG9yZSkgPT4ge1xuICAgIE9iamVjdC5rZXlzKHN0b3JlKS5mb3JFYWNoKG5hbWUgPT4ge1xuICAgICAgY29uc3QgdmFsdWUgPSBzdG9yZVtuYW1lXTtcbiAgICAgIGlmIChuYW1lc3BhY2UpIHtcbiAgICAgICAgbmFtZSA9IGAke25hbWVzcGFjZX0uJHtuYW1lfWA7XG4gICAgICB9XG4gICAgICBpZiAodHlwZW9mIHZhbHVlID09PSAnZnVuY3Rpb24nKSB7XG4gICAgICAgIGZ1bmN0aW9uTmFtZXMucHVzaChuYW1lKTtcbiAgICAgIH0gZWxzZSB7XG4gICAgICAgIGV4dHJhY3RGdW5jdGlvbk5hbWVzKG5hbWUsIHZhbHVlKTtcbiAgICAgIH1cbiAgICB9KTtcbiAgfTtcbiAgZXh0cmFjdEZ1bmN0aW9uTmFtZXMobnVsbCwgc3RvcmUpO1xuICByZXR1cm4gZnVuY3Rpb25OYW1lcztcbn1cblxuZXhwb3J0IGZ1bmN0aW9uIGdldEpvYihqb2JOYW1lLCBhcHBsaWNhdGlvbklkKSB7XG4gIHJldHVybiBnZXQoQ2F0ZWdvcnkuSm9icywgam9iTmFtZSwgYXBwbGljYXRpb25JZCk7XG59XG5cbmV4cG9ydCBmdW5jdGlvbiBnZXRKb2JzKGFwcGxpY2F0aW9uSWQpIHtcbiAgdmFyIG1hbmFnZXIgPSBfdHJpZ2dlclN0b3JlW2FwcGxpY2F0aW9uSWRdO1xuICBpZiAobWFuYWdlciAmJiBtYW5hZ2VyLkpvYnMpIHtcbiAgICByZXR1cm4gbWFuYWdlci5Kb2JzO1xuICB9XG4gIHJldHVybiB1bmRlZmluZWQ7XG59XG5cbmV4cG9ydCBmdW5jdGlvbiBnZXRWYWxpZGF0b3IoZnVuY3Rpb25OYW1lLCBhcHBsaWNhdGlvbklkKSB7XG4gIHJldHVybiBnZXQoQ2F0ZWdvcnkuVmFsaWRhdG9ycywgZnVuY3Rpb25OYW1lLCBhcHBsaWNhdGlvbklkKTtcbn1cblxuZXhwb3J0IGZ1bmN0aW9uIGdldFJlcXVlc3RPYmplY3QoXG4gIHRyaWdnZXJUeXBlLFxuICBhdXRoLFxuICBwYXJzZU9iamVjdCxcbiAgb3JpZ2luYWxQYXJzZU9iamVjdCxcbiAgY29uZmlnLFxuICBjb250ZXh0XG4pIHtcbiAgY29uc3QgcmVxdWVzdCA9IHtcbiAgICB0cmlnZ2VyTmFtZTogdHJpZ2dlclR5cGUsXG4gICAgb2JqZWN0OiBwYXJzZU9iamVjdCxcbiAgICBtYXN0ZXI6IGZhbHNlLFxuICAgIGxvZzogY29uZmlnLmxvZ2dlckNvbnRyb2xsZXIsXG4gICAgaGVhZGVyczogY29uZmlnLmhlYWRlcnMsXG4gICAgaXA6IGNvbmZpZy5pcCxcbiAgfTtcblxuICBpZiAob3JpZ2luYWxQYXJzZU9iamVjdCkge1xuICAgIHJlcXVlc3Qub3JpZ2luYWwgPSBvcmlnaW5hbFBhcnNlT2JqZWN0O1xuICB9XG5cbiAgaWYgKHRyaWdnZXJUeXBlID09PSBUeXBlcy5iZWZvcmVTYXZlIHx8IHRyaWdnZXJUeXBlID09PSBUeXBlcy5hZnRlclNhdmUpIHtcbiAgICAvLyBTZXQgYSBjb3B5IG9mIHRoZSBjb250ZXh0IG9uIHRoZSByZXF1ZXN0IG9iamVjdC5cbiAgICByZXF1ZXN0LmNvbnRleHQgPSBPYmplY3QuYXNzaWduKHt9LCBjb250ZXh0KTtcbiAgfVxuXG4gIGlmICghYXV0aCkge1xuICAgIHJldHVybiByZXF1ZXN0O1xuICB9XG4gIGlmIChhdXRoLmlzTWFzdGVyKSB7XG4gICAgcmVxdWVzdFsnbWFzdGVyJ10gPSB0cnVlO1xuICB9XG4gIGlmIChhdXRoLnVzZXIpIHtcbiAgICByZXF1ZXN0Wyd1c2VyJ10gPSBhdXRoLnVzZXI7XG4gIH1cbiAgaWYgKGF1dGguaW5zdGFsbGF0aW9uSWQpIHtcbiAgICByZXF1ZXN0WydpbnN0YWxsYXRpb25JZCddID0gYXV0aC5pbnN0YWxsYXRpb25JZDtcbiAgfVxuICByZXR1cm4gcmVxdWVzdDtcbn1cblxuZXhwb3J0IGZ1bmN0aW9uIGdldFJlcXVlc3RRdWVyeU9iamVjdChcbiAgdHJpZ2dlclR5cGUsXG4gIGF1dGgsXG4gIHF1ZXJ5LFxuICBjb3VudCxcbiAgY29uZmlnLFxuICBpc0dldFxuKSB7XG4gIGlzR2V0ID0gISFpc0dldDtcblxuICB2YXIgcmVxdWVzdCA9IHtcbiAgICB0cmlnZ2VyTmFtZTogdHJpZ2dlclR5cGUsXG4gICAgcXVlcnksXG4gICAgbWFzdGVyOiBmYWxzZSxcbiAgICBjb3VudCxcbiAgICBsb2c6IGNvbmZpZy5sb2dnZXJDb250cm9sbGVyLFxuICAgIGlzR2V0LFxuICAgIGhlYWRlcnM6IGNvbmZpZy5oZWFkZXJzLFxuICAgIGlwOiBjb25maWcuaXAsXG4gIH07XG5cbiAgaWYgKCFhdXRoKSB7XG4gICAgcmV0dXJuIHJlcXVlc3Q7XG4gIH1cbiAgaWYgKGF1dGguaXNNYXN0ZXIpIHtcbiAgICByZXF1ZXN0WydtYXN0ZXInXSA9IHRydWU7XG4gIH1cbiAgaWYgKGF1dGgudXNlcikge1xuICAgIHJlcXVlc3RbJ3VzZXInXSA9IGF1dGgudXNlcjtcbiAgfVxuICBpZiAoYXV0aC5pbnN0YWxsYXRpb25JZCkge1xuICAgIHJlcXVlc3RbJ2luc3RhbGxhdGlvbklkJ10gPSBhdXRoLmluc3RhbGxhdGlvbklkO1xuICB9XG4gIHJldHVybiByZXF1ZXN0O1xufVxuXG4vLyBDcmVhdGVzIHRoZSByZXNwb25zZSBvYmplY3QsIGFuZCB1c2VzIHRoZSByZXF1ZXN0IG9iamVjdCB0byBwYXNzIGRhdGFcbi8vIFRoZSBBUEkgd2lsbCBjYWxsIHRoaXMgd2l0aCBSRVNUIEFQSSBmb3JtYXR0ZWQgb2JqZWN0cywgdGhpcyB3aWxsXG4vLyB0cmFuc2Zvcm0gdGhlbSB0byBQYXJzZS5PYmplY3QgaW5zdGFuY2VzIGV4cGVjdGVkIGJ5IENsb3VkIENvZGUuXG4vLyBBbnkgY2hhbmdlcyBtYWRlIHRvIHRoZSBvYmplY3QgaW4gYSBiZWZvcmVTYXZlIHdpbGwgYmUgaW5jbHVkZWQuXG5leHBvcnQgZnVuY3Rpb24gZ2V0UmVzcG9uc2VPYmplY3QocmVxdWVzdCwgcmVzb2x2ZSwgcmVqZWN0KSB7XG4gIHJldHVybiB7XG4gICAgc3VjY2VzczogZnVuY3Rpb24ocmVzcG9uc2UpIHtcbiAgICAgIGlmIChyZXF1ZXN0LnRyaWdnZXJOYW1lID09PSBUeXBlcy5hZnRlckZpbmQpIHtcbiAgICAgICAgaWYgKCFyZXNwb25zZSkge1xuICAgICAgICAgIHJlc3BvbnNlID0gcmVxdWVzdC5vYmplY3RzO1xuICAgICAgICB9XG4gICAgICAgIHJlc3BvbnNlID0gcmVzcG9uc2UubWFwKG9iamVjdCA9PiB7XG4gICAgICAgICAgcmV0dXJuIG9iamVjdC50b0pTT04oKTtcbiAgICAgICAgfSk7XG4gICAgICAgIHJldHVybiByZXNvbHZlKHJlc3BvbnNlKTtcbiAgICAgIH1cbiAgICAgIC8vIFVzZSB0aGUgSlNPTiByZXNwb25zZVxuICAgICAgaWYgKFxuICAgICAgICByZXNwb25zZSAmJlxuICAgICAgICB0eXBlb2YgcmVzcG9uc2UgPT09ICdvYmplY3QnICYmXG4gICAgICAgICFyZXF1ZXN0Lm9iamVjdC5lcXVhbHMocmVzcG9uc2UpICYmXG4gICAgICAgIHJlcXVlc3QudHJpZ2dlck5hbWUgPT09IFR5cGVzLmJlZm9yZVNhdmVcbiAgICAgICkge1xuICAgICAgICByZXR1cm4gcmVzb2x2ZShyZXNwb25zZSk7XG4gICAgICB9XG4gICAgICBpZiAoXG4gICAgICAgIHJlc3BvbnNlICYmXG4gICAgICAgIHR5cGVvZiByZXNwb25zZSA9PT0gJ29iamVjdCcgJiZcbiAgICAgICAgcmVxdWVzdC50cmlnZ2VyTmFtZSA9PT0gVHlwZXMuYWZ0ZXJTYXZlXG4gICAgICApIHtcbiAgICAgICAgcmV0dXJuIHJlc29sdmUocmVzcG9uc2UpO1xuICAgICAgfVxuICAgICAgaWYgKHJlcXVlc3QudHJpZ2dlck5hbWUgPT09IFR5cGVzLmFmdGVyU2F2ZSkge1xuICAgICAgICByZXR1cm4gcmVzb2x2ZSgpO1xuICAgICAgfVxuICAgICAgcmVzcG9uc2UgPSB7fTtcbiAgICAgIGlmIChyZXF1ZXN0LnRyaWdnZXJOYW1lID09PSBUeXBlcy5iZWZvcmVTYXZlKSB7XG4gICAgICAgIHJlc3BvbnNlWydvYmplY3QnXSA9IHJlcXVlc3Qub2JqZWN0Ll9nZXRTYXZlSlNPTigpO1xuICAgICAgfVxuICAgICAgcmV0dXJuIHJlc29sdmUocmVzcG9uc2UpO1xuICAgIH0sXG4gICAgZXJyb3I6IGZ1bmN0aW9uKGVycm9yKSB7XG4gICAgICBpZiAoZXJyb3IgaW5zdGFuY2VvZiBQYXJzZS5FcnJvcikge1xuICAgICAgICByZWplY3QoZXJyb3IpO1xuICAgICAgfSBlbHNlIGlmIChlcnJvciBpbnN0YW5jZW9mIEVycm9yKSB7XG4gICAgICAgIHJlamVjdChuZXcgUGFyc2UuRXJyb3IoUGFyc2UuRXJyb3IuU0NSSVBUX0ZBSUxFRCwgZXJyb3IubWVzc2FnZSkpO1xuICAgICAgfSBlbHNlIHtcbiAgICAgICAgcmVqZWN0KG5ldyBQYXJzZS5FcnJvcihQYXJzZS5FcnJvci5TQ1JJUFRfRkFJTEVELCBlcnJvcikpO1xuICAgICAgfVxuICAgIH0sXG4gIH07XG59XG5cbmZ1bmN0aW9uIHVzZXJJZEZvckxvZyhhdXRoKSB7XG4gIHJldHVybiBhdXRoICYmIGF1dGgudXNlciA/IGF1dGgudXNlci5pZCA6IHVuZGVmaW5lZDtcbn1cblxuZnVuY3Rpb24gbG9nVHJpZ2dlckFmdGVySG9vayh0cmlnZ2VyVHlwZSwgY2xhc3NOYW1lLCBpbnB1dCwgYXV0aCkge1xuICBjb25zdCBjbGVhbklucHV0ID0gbG9nZ2VyLnRydW5jYXRlTG9nTWVzc2FnZShKU09OLnN0cmluZ2lmeShpbnB1dCkpO1xuICBsb2dnZXIuaW5mbyhcbiAgICBgJHt0cmlnZ2VyVHlwZX0gdHJpZ2dlcmVkIGZvciAke2NsYXNzTmFtZX0gZm9yIHVzZXIgJHt1c2VySWRGb3JMb2coXG4gICAgICBhdXRoXG4gICAgKX06XFxuICBJbnB1dDogJHtjbGVhbklucHV0fWAsXG4gICAge1xuICAgICAgY2xhc3NOYW1lLFxuICAgICAgdHJpZ2dlclR5cGUsXG4gICAgICB1c2VyOiB1c2VySWRGb3JMb2coYXV0aCksXG4gICAgfVxuICApO1xufVxuXG5mdW5jdGlvbiBsb2dUcmlnZ2VyU3VjY2Vzc0JlZm9yZUhvb2soXG4gIHRyaWdnZXJUeXBlLFxuICBjbGFzc05hbWUsXG4gIGlucHV0LFxuICByZXN1bHQsXG4gIGF1dGhcbikge1xuICBjb25zdCBjbGVhbklucHV0ID0gbG9nZ2VyLnRydW5jYXRlTG9nTWVzc2FnZShKU09OLnN0cmluZ2lmeShpbnB1dCkpO1xuICBjb25zdCBjbGVhblJlc3VsdCA9IGxvZ2dlci50cnVuY2F0ZUxvZ01lc3NhZ2UoSlNPTi5zdHJpbmdpZnkocmVzdWx0KSk7XG4gIGxvZ2dlci5pbmZvKFxuICAgIGAke3RyaWdnZXJUeXBlfSB0cmlnZ2VyZWQgZm9yICR7Y2xhc3NOYW1lfSBmb3IgdXNlciAke3VzZXJJZEZvckxvZyhcbiAgICAgIGF1dGhcbiAgICApfTpcXG4gIElucHV0OiAke2NsZWFuSW5wdXR9XFxuICBSZXN1bHQ6ICR7Y2xlYW5SZXN1bHR9YCxcbiAgICB7XG4gICAgICBjbGFzc05hbWUsXG4gICAgICB0cmlnZ2VyVHlwZSxcbiAgICAgIHVzZXI6IHVzZXJJZEZvckxvZyhhdXRoKSxcbiAgICB9XG4gICk7XG59XG5cbmZ1bmN0aW9uIGxvZ1RyaWdnZXJFcnJvckJlZm9yZUhvb2sodHJpZ2dlclR5cGUsIGNsYXNzTmFtZSwgaW5wdXQsIGF1dGgsIGVycm9yKSB7XG4gIGNvbnN0IGNsZWFuSW5wdXQgPSBsb2dnZXIudHJ1bmNhdGVMb2dNZXNzYWdlKEpTT04uc3RyaW5naWZ5KGlucHV0KSk7XG4gIGxvZ2dlci5lcnJvcihcbiAgICBgJHt0cmlnZ2VyVHlwZX0gZmFpbGVkIGZvciAke2NsYXNzTmFtZX0gZm9yIHVzZXIgJHt1c2VySWRGb3JMb2coXG4gICAgICBhdXRoXG4gICAgKX06XFxuICBJbnB1dDogJHtjbGVhbklucHV0fVxcbiAgRXJyb3I6ICR7SlNPTi5zdHJpbmdpZnkoZXJyb3IpfWAsXG4gICAge1xuICAgICAgY2xhc3NOYW1lLFxuICAgICAgdHJpZ2dlclR5cGUsXG4gICAgICBlcnJvcixcbiAgICAgIHVzZXI6IHVzZXJJZEZvckxvZyhhdXRoKSxcbiAgICB9XG4gICk7XG59XG5cbmV4cG9ydCBmdW5jdGlvbiBtYXliZVJ1bkFmdGVyRmluZFRyaWdnZXIoXG4gIHRyaWdnZXJUeXBlLFxuICBhdXRoLFxuICBjbGFzc05hbWUsXG4gIG9iamVjdHMsXG4gIGNvbmZpZ1xuKSB7XG4gIHJldHVybiBuZXcgUHJvbWlzZSgocmVzb2x2ZSwgcmVqZWN0KSA9PiB7XG4gICAgY29uc3QgdHJpZ2dlciA9IGdldFRyaWdnZXIoY2xhc3NOYW1lLCB0cmlnZ2VyVHlwZSwgY29uZmlnLmFwcGxpY2F0aW9uSWQpO1xuICAgIGlmICghdHJpZ2dlcikge1xuICAgICAgcmV0dXJuIHJlc29sdmUoKTtcbiAgICB9XG4gICAgY29uc3QgcmVxdWVzdCA9IGdldFJlcXVlc3RPYmplY3QodHJpZ2dlclR5cGUsIGF1dGgsIG51bGwsIG51bGwsIGNvbmZpZyk7XG4gICAgY29uc3QgeyBzdWNjZXNzLCBlcnJvciB9ID0gZ2V0UmVzcG9uc2VPYmplY3QoXG4gICAgICByZXF1ZXN0LFxuICAgICAgb2JqZWN0ID0+IHtcbiAgICAgICAgcmVzb2x2ZShvYmplY3QpO1xuICAgICAgfSxcbiAgICAgIGVycm9yID0+IHtcbiAgICAgICAgcmVqZWN0KGVycm9yKTtcbiAgICAgIH1cbiAgICApO1xuICAgIGxvZ1RyaWdnZXJTdWNjZXNzQmVmb3JlSG9vayhcbiAgICAgIHRyaWdnZXJUeXBlLFxuICAgICAgY2xhc3NOYW1lLFxuICAgICAgJ0FmdGVyRmluZCcsXG4gICAgICBKU09OLnN0cmluZ2lmeShvYmplY3RzKSxcbiAgICAgIGF1dGhcbiAgICApO1xuICAgIHJlcXVlc3Qub2JqZWN0cyA9IG9iamVjdHMubWFwKG9iamVjdCA9PiB7XG4gICAgICAvL3NldHRpbmcgdGhlIGNsYXNzIG5hbWUgdG8gdHJhbnNmb3JtIGludG8gcGFyc2Ugb2JqZWN0XG4gICAgICBvYmplY3QuY2xhc3NOYW1lID0gY2xhc3NOYW1lO1xuICAgICAgcmV0dXJuIFBhcnNlLk9iamVjdC5mcm9tSlNPTihvYmplY3QpO1xuICAgIH0pO1xuICAgIHJldHVybiBQcm9taXNlLnJlc29sdmUoKVxuICAgICAgLnRoZW4oKCkgPT4ge1xuICAgICAgICBjb25zdCByZXNwb25zZSA9IHRyaWdnZXIocmVxdWVzdCk7XG4gICAgICAgIGlmIChyZXNwb25zZSAmJiB0eXBlb2YgcmVzcG9uc2UudGhlbiA9PT0gJ2Z1bmN0aW9uJykge1xuICAgICAgICAgIHJldHVybiByZXNwb25zZS50aGVuKHJlc3VsdHMgPT4ge1xuICAgICAgICAgICAgaWYgKCFyZXN1bHRzKSB7XG4gICAgICAgICAgICAgIHRocm93IG5ldyBQYXJzZS5FcnJvcihcbiAgICAgICAgICAgICAgICBQYXJzZS5FcnJvci5TQ1JJUFRfRkFJTEVELFxuICAgICAgICAgICAgICAgICdBZnRlckZpbmQgZXhwZWN0IHJlc3VsdHMgdG8gYmUgcmV0dXJuZWQgaW4gdGhlIHByb21pc2UnXG4gICAgICAgICAgICAgICk7XG4gICAgICAgICAgICB9XG4gICAgICAgICAgICByZXR1cm4gcmVzdWx0cztcbiAgICAgICAgICB9KTtcbiAgICAgICAgfVxuICAgICAgICByZXR1cm4gcmVzcG9uc2U7XG4gICAgICB9KVxuICAgICAgLnRoZW4oc3VjY2VzcywgZXJyb3IpO1xuICB9KS50aGVuKHJlc3VsdHMgPT4ge1xuICAgIGxvZ1RyaWdnZXJBZnRlckhvb2sodHJpZ2dlclR5cGUsIGNsYXNzTmFtZSwgSlNPTi5zdHJpbmdpZnkocmVzdWx0cyksIGF1dGgpO1xuICAgIHJldHVybiByZXN1bHRzO1xuICB9KTtcbn1cblxuZXhwb3J0IGZ1bmN0aW9uIG1heWJlUnVuUXVlcnlUcmlnZ2VyKFxuICB0cmlnZ2VyVHlwZSxcbiAgY2xhc3NOYW1lLFxuICByZXN0V2hlcmUsXG4gIHJlc3RPcHRpb25zLFxuICBjb25maWcsXG4gIGF1dGgsXG4gIGlzR2V0XG4pIHtcbiAgY29uc3QgdHJpZ2dlciA9IGdldFRyaWdnZXIoY2xhc3NOYW1lLCB0cmlnZ2VyVHlwZSwgY29uZmlnLmFwcGxpY2F0aW9uSWQpO1xuICBpZiAoIXRyaWdnZXIpIHtcbiAgICByZXR1cm4gUHJvbWlzZS5yZXNvbHZlKHtcbiAgICAgIHJlc3RXaGVyZSxcbiAgICAgIHJlc3RPcHRpb25zLFxuICAgIH0pO1xuICB9XG4gIGNvbnN0IGpzb24gPSBPYmplY3QuYXNzaWduKHt9LCByZXN0T3B0aW9ucyk7XG4gIGpzb24ud2hlcmUgPSByZXN0V2hlcmU7XG5cbiAgY29uc3QgcGFyc2VRdWVyeSA9IG5ldyBQYXJzZS5RdWVyeShjbGFzc05hbWUpO1xuICBwYXJzZVF1ZXJ5LndpdGhKU09OKGpzb24pO1xuXG4gIGxldCBjb3VudCA9IGZhbHNlO1xuICBpZiAocmVzdE9wdGlvbnMpIHtcbiAgICBjb3VudCA9ICEhcmVzdE9wdGlvbnMuY291bnQ7XG4gIH1cbiAgY29uc3QgcmVxdWVzdE9iamVjdCA9IGdldFJlcXVlc3RRdWVyeU9iamVjdChcbiAgICB0cmlnZ2VyVHlwZSxcbiAgICBhdXRoLFxuICAgIHBhcnNlUXVlcnksXG4gICAgY291bnQsXG4gICAgY29uZmlnLFxuICAgIGlzR2V0XG4gICk7XG4gIHJldHVybiBQcm9taXNlLnJlc29sdmUoKVxuICAgIC50aGVuKCgpID0+IHtcbiAgICAgIHJldHVybiB0cmlnZ2VyKHJlcXVlc3RPYmplY3QpO1xuICAgIH0pXG4gICAgLnRoZW4oXG4gICAgICByZXN1bHQgPT4ge1xuICAgICAgICBsZXQgcXVlcnlSZXN1bHQgPSBwYXJzZVF1ZXJ5O1xuICAgICAgICBpZiAocmVzdWx0ICYmIHJlc3VsdCBpbnN0YW5jZW9mIFBhcnNlLlF1ZXJ5KSB7XG4gICAgICAgICAgcXVlcnlSZXN1bHQgPSByZXN1bHQ7XG4gICAgICAgIH1cbiAgICAgICAgY29uc3QganNvblF1ZXJ5ID0gcXVlcnlSZXN1bHQudG9KU09OKCk7XG4gICAgICAgIGlmIChqc29uUXVlcnkud2hlcmUpIHtcbiAgICAgICAgICByZXN0V2hlcmUgPSBqc29uUXVlcnkud2hlcmU7XG4gICAgICAgIH1cbiAgICAgICAgaWYgKGpzb25RdWVyeS5saW1pdCkge1xuICAgICAgICAgIHJlc3RPcHRpb25zID0gcmVzdE9wdGlvbnMgfHwge307XG4gICAgICAgICAgcmVzdE9wdGlvbnMubGltaXQgPSBqc29uUXVlcnkubGltaXQ7XG4gICAgICAgIH1cbiAgICAgICAgaWYgKGpzb25RdWVyeS5za2lwKSB7XG4gICAgICAgICAgcmVzdE9wdGlvbnMgPSByZXN0T3B0aW9ucyB8fCB7fTtcbiAgICAgICAgICByZXN0T3B0aW9ucy5za2lwID0ganNvblF1ZXJ5LnNraXA7XG4gICAgICAgIH1cbiAgICAgICAgaWYgKGpzb25RdWVyeS5pbmNsdWRlKSB7XG4gICAgICAgICAgcmVzdE9wdGlvbnMgPSByZXN0T3B0aW9ucyB8fCB7fTtcbiAgICAgICAgICByZXN0T3B0aW9ucy5pbmNsdWRlID0ganNvblF1ZXJ5LmluY2x1ZGU7XG4gICAgICAgIH1cbiAgICAgICAgaWYgKGpzb25RdWVyeS5leGNsdWRlS2V5cykge1xuICAgICAgICAgIHJlc3RPcHRpb25zID0gcmVzdE9wdGlvbnMgfHwge307XG4gICAgICAgICAgcmVzdE9wdGlvbnMuZXhjbHVkZUtleXMgPSBqc29uUXVlcnkuZXhjbHVkZUtleXM7XG4gICAgICAgIH1cbiAgICAgICAgaWYgKGpzb25RdWVyeS5leHBsYWluKSB7XG4gICAgICAgICAgcmVzdE9wdGlvbnMgPSByZXN0T3B0aW9ucyB8fCB7fTtcbiAgICAgICAgICByZXN0T3B0aW9ucy5leHBsYWluID0ganNvblF1ZXJ5LmV4cGxhaW47XG4gICAgICAgIH1cbiAgICAgICAgaWYgKGpzb25RdWVyeS5rZXlzKSB7XG4gICAgICAgICAgcmVzdE9wdGlvbnMgPSByZXN0T3B0aW9ucyB8fCB7fTtcbiAgICAgICAgICByZXN0T3B0aW9ucy5rZXlzID0ganNvblF1ZXJ5LmtleXM7XG4gICAgICAgIH1cbiAgICAgICAgaWYgKGpzb25RdWVyeS5vcmRlcikge1xuICAgICAgICAgIHJlc3RPcHRpb25zID0gcmVzdE9wdGlvbnMgfHwge307XG4gICAgICAgICAgcmVzdE9wdGlvbnMub3JkZXIgPSBqc29uUXVlcnkub3JkZXI7XG4gICAgICAgIH1cbiAgICAgICAgaWYgKGpzb25RdWVyeS5oaW50KSB7XG4gICAgICAgICAgcmVzdE9wdGlvbnMgPSByZXN0T3B0aW9ucyB8fCB7fTtcbiAgICAgICAgICByZXN0T3B0aW9ucy5oaW50ID0ganNvblF1ZXJ5LmhpbnQ7XG4gICAgICAgIH1cbiAgICAgICAgaWYgKHJlcXVlc3RPYmplY3QucmVhZFByZWZlcmVuY2UpIHtcbiAgICAgICAgICByZXN0T3B0aW9ucyA9IHJlc3RPcHRpb25zIHx8IHt9O1xuICAgICAgICAgIHJlc3RPcHRpb25zLnJlYWRQcmVmZXJlbmNlID0gcmVxdWVzdE9iamVjdC5yZWFkUHJlZmVyZW5jZTtcbiAgICAgICAgfVxuICAgICAgICBpZiAocmVxdWVzdE9iamVjdC5pbmNsdWRlUmVhZFByZWZlcmVuY2UpIHtcbiAgICAgICAgICByZXN0T3B0aW9ucyA9IHJlc3RPcHRpb25zIHx8IHt9O1xuICAgICAgICAgIHJlc3RPcHRpb25zLmluY2x1ZGVSZWFkUHJlZmVyZW5jZSA9XG4gICAgICAgICAgICByZXF1ZXN0T2JqZWN0LmluY2x1ZGVSZWFkUHJlZmVyZW5jZTtcbiAgICAgICAgfVxuICAgICAgICBpZiAocmVxdWVzdE9iamVjdC5zdWJxdWVyeVJlYWRQcmVmZXJlbmNlKSB7XG4gICAgICAgICAgcmVzdE9wdGlvbnMgPSByZXN0T3B0aW9ucyB8fCB7fTtcbiAgICAgICAgICByZXN0T3B0aW9ucy5zdWJxdWVyeVJlYWRQcmVmZXJlbmNlID1cbiAgICAgICAgICAgIHJlcXVlc3RPYmplY3Quc3VicXVlcnlSZWFkUHJlZmVyZW5jZTtcbiAgICAgICAgfVxuICAgICAgICByZXR1cm4ge1xuICAgICAgICAgIHJlc3RXaGVyZSxcbiAgICAgICAgICByZXN0T3B0aW9ucyxcbiAgICAgICAgfTtcbiAgICAgIH0sXG4gICAgICBlcnIgPT4ge1xuICAgICAgICBpZiAodHlwZW9mIGVyciA9PT0gJ3N0cmluZycpIHtcbiAgICAgICAgICB0aHJvdyBuZXcgUGFyc2UuRXJyb3IoMSwgZXJyKTtcbiAgICAgICAgfSBlbHNlIHtcbiAgICAgICAgICB0aHJvdyBlcnI7XG4gICAgICAgIH1cbiAgICAgIH1cbiAgICApO1xufVxuXG4vLyBUbyBiZSB1c2VkIGFzIHBhcnQgb2YgdGhlIHByb21pc2UgY2hhaW4gd2hlbiBzYXZpbmcvZGVsZXRpbmcgYW4gb2JqZWN0XG4vLyBXaWxsIHJlc29sdmUgc3VjY2Vzc2Z1bGx5IGlmIG5vIHRyaWdnZXIgaXMgY29uZmlndXJlZFxuLy8gUmVzb2x2ZXMgdG8gYW4gb2JqZWN0LCBlbXB0eSBvciBjb250YWluaW5nIGFuIG9iamVjdCBrZXkuIEEgYmVmb3JlU2F2ZVxuLy8gdHJpZ2dlciB3aWxsIHNldCB0aGUgb2JqZWN0IGtleSB0byB0aGUgcmVzdCBmb3JtYXQgb2JqZWN0IHRvIHNhdmUuXG4vLyBvcmlnaW5hbFBhcnNlT2JqZWN0IGlzIG9wdGlvbmFsLCB3ZSBvbmx5IG5lZWQgdGhhdCBmb3IgYmVmb3JlL2FmdGVyU2F2ZSBmdW5jdGlvbnNcbmV4cG9ydCBmdW5jdGlvbiBtYXliZVJ1blRyaWdnZXIoXG4gIHRyaWdnZXJUeXBlLFxuICBhdXRoLFxuICBwYXJzZU9iamVjdCxcbiAgb3JpZ2luYWxQYXJzZU9iamVjdCxcbiAgY29uZmlnLFxuICBjb250ZXh0XG4pIHtcbiAgaWYgKCFwYXJzZU9iamVjdCkge1xuICAgIHJldHVybiBQcm9taXNlLnJlc29sdmUoe30pO1xuICB9XG4gIHJldHVybiBuZXcgUHJvbWlzZShmdW5jdGlvbihyZXNvbHZlLCByZWplY3QpIHtcbiAgICB2YXIgdHJpZ2dlciA9IGdldFRyaWdnZXIoXG4gICAgICBwYXJzZU9iamVjdC5jbGFzc05hbWUsXG4gICAgICB0cmlnZ2VyVHlwZSxcbiAgICAgIGNvbmZpZy5hcHBsaWNhdGlvbklkXG4gICAgKTtcbiAgICBpZiAoIXRyaWdnZXIpIHJldHVybiByZXNvbHZlKCk7XG4gICAgdmFyIHJlcXVlc3QgPSBnZXRSZXF1ZXN0T2JqZWN0KFxuICAgICAgdHJpZ2dlclR5cGUsXG4gICAgICBhdXRoLFxuICAgICAgcGFyc2VPYmplY3QsXG4gICAgICBvcmlnaW5hbFBhcnNlT2JqZWN0LFxuICAgICAgY29uZmlnLFxuICAgICAgY29udGV4dFxuICAgICk7XG4gICAgdmFyIHsgc3VjY2VzcywgZXJyb3IgfSA9IGdldFJlc3BvbnNlT2JqZWN0KFxuICAgICAgcmVxdWVzdCxcbiAgICAgIG9iamVjdCA9PiB7XG4gICAgICAgIGxvZ1RyaWdnZXJTdWNjZXNzQmVmb3JlSG9vayhcbiAgICAgICAgICB0cmlnZ2VyVHlwZSxcbiAgICAgICAgICBwYXJzZU9iamVjdC5jbGFzc05hbWUsXG4gICAgICAgICAgcGFyc2VPYmplY3QudG9KU09OKCksXG4gICAgICAgICAgb2JqZWN0LFxuICAgICAgICAgIGF1dGhcbiAgICAgICAgKTtcbiAgICAgICAgaWYgKFxuICAgICAgICAgIHRyaWdnZXJUeXBlID09PSBUeXBlcy5iZWZvcmVTYXZlIHx8XG4gICAgICAgICAgdHJpZ2dlclR5cGUgPT09IFR5cGVzLmFmdGVyU2F2ZVxuICAgICAgICApIHtcbiAgICAgICAgICBPYmplY3QuYXNzaWduKGNvbnRleHQsIHJlcXVlc3QuY29udGV4dCk7XG4gICAgICAgIH1cbiAgICAgICAgcmVzb2x2ZShvYmplY3QpO1xuICAgICAgfSxcbiAgICAgIGVycm9yID0+IHtcbiAgICAgICAgbG9nVHJpZ2dlckVycm9yQmVmb3JlSG9vayhcbiAgICAgICAgICB0cmlnZ2VyVHlwZSxcbiAgICAgICAgICBwYXJzZU9iamVjdC5jbGFzc05hbWUsXG4gICAgICAgICAgcGFyc2VPYmplY3QudG9KU09OKCksXG4gICAgICAgICAgYXV0aCxcbiAgICAgICAgICBlcnJvclxuICAgICAgICApO1xuICAgICAgICByZWplY3QoZXJyb3IpO1xuICAgICAgfVxuICAgICk7XG5cbiAgICAvLyBBZnRlclNhdmUgYW5kIGFmdGVyRGVsZXRlIHRyaWdnZXJzIGNhbiByZXR1cm4gYSBwcm9taXNlLCB3aGljaCBpZiB0aGV5XG4gICAgLy8gZG8sIG5lZWRzIHRvIGJlIHJlc29sdmVkIGJlZm9yZSB0aGlzIHByb21pc2UgaXMgcmVzb2x2ZWQsXG4gICAgLy8gc28gdHJpZ2dlciBleGVjdXRpb24gaXMgc3luY2VkIHdpdGggUmVzdFdyaXRlLmV4ZWN1dGUoKSBjYWxsLlxuICAgIC8vIElmIHRyaWdnZXJzIGRvIG5vdCByZXR1cm4gYSBwcm9taXNlLCB0aGV5IGNhbiBydW4gYXN5bmMgY29kZSBwYXJhbGxlbFxuICAgIC8vIHRvIHRoZSBSZXN0V3JpdGUuZXhlY3V0ZSgpIGNhbGwuXG4gICAgcmV0dXJuIFByb21pc2UucmVzb2x2ZSgpXG4gICAgICAudGhlbigoKSA9PiB7XG4gICAgICAgIGNvbnN0IHByb21pc2UgPSB0cmlnZ2VyKHJlcXVlc3QpO1xuICAgICAgICBpZiAoXG4gICAgICAgICAgdHJpZ2dlclR5cGUgPT09IFR5cGVzLmFmdGVyU2F2ZSB8fFxuICAgICAgICAgIHRyaWdnZXJUeXBlID09PSBUeXBlcy5hZnRlckRlbGV0ZSB8fFxuICAgICAgICAgIHRyaWdnZXJUeXBlID09PSBUeXBlcy5hZnRlckxvZ2luXG4gICAgICAgICkge1xuICAgICAgICAgIGxvZ1RyaWdnZXJBZnRlckhvb2soXG4gICAgICAgICAgICB0cmlnZ2VyVHlwZSxcbiAgICAgICAgICAgIHBhcnNlT2JqZWN0LmNsYXNzTmFtZSxcbiAgICAgICAgICAgIHBhcnNlT2JqZWN0LnRvSlNPTigpLFxuICAgICAgICAgICAgYXV0aFxuICAgICAgICAgICk7XG4gICAgICAgIH1cbiAgICAgICAgLy8gYmVmb3JlU2F2ZSBpcyBleHBlY3RlZCB0byByZXR1cm4gbnVsbCAobm90aGluZylcbiAgICAgICAgaWYgKHRyaWdnZXJUeXBlID09PSBUeXBlcy5iZWZvcmVTYXZlKSB7XG4gICAgICAgICAgaWYgKHByb21pc2UgJiYgdHlwZW9mIHByb21pc2UudGhlbiA9PT0gJ2Z1bmN0aW9uJykge1xuICAgICAgICAgICAgcmV0dXJuIHByb21pc2UudGhlbihyZXNwb25zZSA9PiB7XG4gICAgICAgICAgICAgIC8vIHJlc3BvbnNlLm9iamVjdCBtYXkgY29tZSBmcm9tIGV4cHJlc3Mgcm91dGluZyBiZWZvcmUgaG9va1xuICAgICAgICAgICAgICBpZiAocmVzcG9uc2UgJiYgcmVzcG9uc2Uub2JqZWN0KSB7XG4gICAgICAgICAgICAgICAgcmV0dXJuIHJlc3BvbnNlO1xuICAgICAgICAgICAgICB9XG4gICAgICAgICAgICAgIHJldHVybiBudWxsO1xuICAgICAgICAgICAgfSk7XG4gICAgICAgICAgfVxuICAgICAgICAgIHJldHVybiBudWxsO1xuICAgICAgICB9XG5cbiAgICAgICAgcmV0dXJuIHByb21pc2U7XG4gICAgICB9KVxuICAgICAgLnRoZW4oc3VjY2VzcywgZXJyb3IpO1xuICB9KTtcbn1cblxuLy8gQ29udmVydHMgYSBSRVNULWZvcm1hdCBvYmplY3QgdG8gYSBQYXJzZS5PYmplY3Rcbi8vIGRhdGEgaXMgZWl0aGVyIGNsYXNzTmFtZSBvciBhbiBvYmplY3RcbmV4cG9ydCBmdW5jdGlvbiBpbmZsYXRlKGRhdGEsIHJlc3RPYmplY3QpIHtcbiAgdmFyIGNvcHkgPSB0eXBlb2YgZGF0YSA9PSAnb2JqZWN0JyA/IGRhdGEgOiB7IGNsYXNzTmFtZTogZGF0YSB9O1xuICBmb3IgKHZhciBrZXkgaW4gcmVzdE9iamVjdCkge1xuICAgIGNvcHlba2V5XSA9IHJlc3RPYmplY3Rba2V5XTtcbiAgfVxuICByZXR1cm4gUGFyc2UuT2JqZWN0LmZyb21KU09OKGNvcHkpO1xufVxuXG5leHBvcnQgZnVuY3Rpb24gcnVuTGl2ZVF1ZXJ5RXZlbnRIYW5kbGVycyhcbiAgZGF0YSxcbiAgYXBwbGljYXRpb25JZCA9IFBhcnNlLmFwcGxpY2F0aW9uSWRcbikge1xuICBpZiAoXG4gICAgIV90cmlnZ2VyU3RvcmUgfHxcbiAgICAhX3RyaWdnZXJTdG9yZVthcHBsaWNhdGlvbklkXSB8fFxuICAgICFfdHJpZ2dlclN0b3JlW2FwcGxpY2F0aW9uSWRdLkxpdmVRdWVyeVxuICApIHtcbiAgICByZXR1cm47XG4gIH1cbiAgX3RyaWdnZXJTdG9yZVthcHBsaWNhdGlvbklkXS5MaXZlUXVlcnkuZm9yRWFjaChoYW5kbGVyID0+IGhhbmRsZXIoZGF0YSkpO1xufVxuIl19