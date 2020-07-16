"use strict";

Object.defineProperty(exports, "__esModule", {
  value: true
});
exports.addFunction = addFunction;
exports.addJob = addJob;
exports.addTrigger = addTrigger;
exports.addFileTrigger = addFileTrigger;
exports.addLiveQueryEventHandler = addLiveQueryEventHandler;
exports.removeFunction = removeFunction;
exports.removeTrigger = removeTrigger;
exports._unregisterAll = _unregisterAll;
exports.getTrigger = getTrigger;
exports.getFileTrigger = getFileTrigger;
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
exports.getRequestFileObject = getRequestFileObject;
exports.maybeRunFileTrigger = maybeRunFileTrigger;
exports.Types = void 0;

var _node = _interopRequireDefault(require("parse/node"));

var _logger = require("./logger");

function _interopRequireDefault(obj) { return obj && obj.__esModule ? obj : { default: obj }; }

function ownKeys(object, enumerableOnly) { var keys = Object.keys(object); if (Object.getOwnPropertySymbols) { var symbols = Object.getOwnPropertySymbols(object); if (enumerableOnly) symbols = symbols.filter(function (sym) { return Object.getOwnPropertyDescriptor(object, sym).enumerable; }); keys.push.apply(keys, symbols); } return keys; }

function _objectSpread(target) { for (var i = 1; i < arguments.length; i++) { var source = arguments[i] != null ? arguments[i] : {}; if (i % 2) { ownKeys(Object(source), true).forEach(function (key) { _defineProperty(target, key, source[key]); }); } else if (Object.getOwnPropertyDescriptors) { Object.defineProperties(target, Object.getOwnPropertyDescriptors(source)); } else { ownKeys(Object(source)).forEach(function (key) { Object.defineProperty(target, key, Object.getOwnPropertyDescriptor(source, key)); }); } } return target; }

function _defineProperty(obj, key, value) { if (key in obj) { Object.defineProperty(obj, key, { value: value, enumerable: true, configurable: true, writable: true }); } else { obj[key] = value; } return obj; }

const Types = {
  beforeLogin: 'beforeLogin',
  afterLogin: 'afterLogin',
  afterLogout: 'afterLogout',
  beforeSave: 'beforeSave',
  afterSave: 'afterSave',
  beforeDelete: 'beforeDelete',
  afterDelete: 'afterDelete',
  beforeFind: 'beforeFind',
  afterFind: 'afterFind',
  beforeSaveFile: 'beforeSaveFile',
  afterSaveFile: 'afterSaveFile',
  beforeDeleteFile: 'beforeDeleteFile',
  afterDeleteFile: 'afterDeleteFile'
};
exports.Types = Types;
const FileClassName = '@File';

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

function addFileTrigger(type, handler, applicationId) {
  add(Category.Triggers, `${type}.${FileClassName}`, handler, applicationId);
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

function getFileTrigger(type, applicationId) {
  return getTrigger(FileClassName, type, applicationId);
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

  if (triggerType === Types.beforeSave || triggerType === Types.afterSave || triggerType === Types.beforeDelete || triggerType === Types.afterDelete) {
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

function getRequestQueryObject(triggerType, auth, query, count, config, context, isGet) {
  isGet = !!isGet;
  var request = {
    triggerName: triggerType,
    query,
    master: false,
    count,
    log: config.loggerController,
    isGet,
    headers: config.headers,
    ip: config.ip,
    context: context || {}
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

function maybeRunQueryTrigger(triggerType, className, restWhere, restOptions, config, auth, context, isGet) {
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

  const requestObject = getRequestQueryObject(triggerType, auth, parseQuery, count, config, context, isGet);
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

      if (triggerType === Types.beforeSave || triggerType === Types.afterSave || triggerType === Types.beforeDelete || triggerType === Types.afterDelete) {
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

function getRequestFileObject(triggerType, auth, fileObject, config) {
  const request = _objectSpread(_objectSpread({}, fileObject), {}, {
    triggerName: triggerType,
    master: false,
    log: config.loggerController,
    headers: config.headers,
    ip: config.ip
  });

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

async function maybeRunFileTrigger(triggerType, fileObject, config, auth) {
  const fileTrigger = getFileTrigger(triggerType, config.applicationId);

  if (typeof fileTrigger === 'function') {
    try {
      const request = getRequestFileObject(triggerType, auth, fileObject, config);
      const result = await fileTrigger(request);
      logTriggerSuccessBeforeHook(triggerType, 'Parse.File', _objectSpread(_objectSpread({}, fileObject.file.toJSON()), {}, {
        fileSize: fileObject.fileSize
      }), result, auth);
      return result || fileObject;
    } catch (error) {
      logTriggerErrorBeforeHook(triggerType, 'Parse.File', _objectSpread(_objectSpread({}, fileObject.file.toJSON()), {}, {
        fileSize: fileObject.fileSize
      }), auth, error);
      throw error;
    }
  }

  return fileObject;
}
//# sourceMappingURL=data:application/json;charset=utf-8;base64,eyJ2ZXJzaW9uIjozLCJzb3VyY2VzIjpbIi4uL3NyYy90cmlnZ2Vycy5qcyJdLCJuYW1lcyI6WyJUeXBlcyIsImJlZm9yZUxvZ2luIiwiYWZ0ZXJMb2dpbiIsImFmdGVyTG9nb3V0IiwiYmVmb3JlU2F2ZSIsImFmdGVyU2F2ZSIsImJlZm9yZURlbGV0ZSIsImFmdGVyRGVsZXRlIiwiYmVmb3JlRmluZCIsImFmdGVyRmluZCIsImJlZm9yZVNhdmVGaWxlIiwiYWZ0ZXJTYXZlRmlsZSIsImJlZm9yZURlbGV0ZUZpbGUiLCJhZnRlckRlbGV0ZUZpbGUiLCJGaWxlQ2xhc3NOYW1lIiwiYmFzZVN0b3JlIiwiVmFsaWRhdG9ycyIsIkZ1bmN0aW9ucyIsIkpvYnMiLCJMaXZlUXVlcnkiLCJUcmlnZ2VycyIsIk9iamVjdCIsImtleXMiLCJyZWR1Y2UiLCJiYXNlIiwia2V5IiwiZnJlZXplIiwidmFsaWRhdGVDbGFzc05hbWVGb3JUcmlnZ2VycyIsImNsYXNzTmFtZSIsInR5cGUiLCJfdHJpZ2dlclN0b3JlIiwiQ2F0ZWdvcnkiLCJnZXRTdG9yZSIsImNhdGVnb3J5IiwibmFtZSIsImFwcGxpY2F0aW9uSWQiLCJwYXRoIiwic3BsaXQiLCJzcGxpY2UiLCJQYXJzZSIsInN0b3JlIiwiY29tcG9uZW50IiwidW5kZWZpbmVkIiwiYWRkIiwiaGFuZGxlciIsImxhc3RDb21wb25lbnQiLCJyZW1vdmUiLCJnZXQiLCJhZGRGdW5jdGlvbiIsImZ1bmN0aW9uTmFtZSIsInZhbGlkYXRpb25IYW5kbGVyIiwiYWRkSm9iIiwiam9iTmFtZSIsImFkZFRyaWdnZXIiLCJhZGRGaWxlVHJpZ2dlciIsImFkZExpdmVRdWVyeUV2ZW50SGFuZGxlciIsInB1c2giLCJyZW1vdmVGdW5jdGlvbiIsInJlbW92ZVRyaWdnZXIiLCJfdW5yZWdpc3RlckFsbCIsImZvckVhY2giLCJhcHBJZCIsImdldFRyaWdnZXIiLCJ0cmlnZ2VyVHlwZSIsImdldEZpbGVUcmlnZ2VyIiwidHJpZ2dlckV4aXN0cyIsImdldEZ1bmN0aW9uIiwiZ2V0RnVuY3Rpb25OYW1lcyIsImZ1bmN0aW9uTmFtZXMiLCJleHRyYWN0RnVuY3Rpb25OYW1lcyIsIm5hbWVzcGFjZSIsInZhbHVlIiwiZ2V0Sm9iIiwiZ2V0Sm9icyIsIm1hbmFnZXIiLCJnZXRWYWxpZGF0b3IiLCJnZXRSZXF1ZXN0T2JqZWN0IiwiYXV0aCIsInBhcnNlT2JqZWN0Iiwib3JpZ2luYWxQYXJzZU9iamVjdCIsImNvbmZpZyIsImNvbnRleHQiLCJyZXF1ZXN0IiwidHJpZ2dlck5hbWUiLCJvYmplY3QiLCJtYXN0ZXIiLCJsb2ciLCJsb2dnZXJDb250cm9sbGVyIiwiaGVhZGVycyIsImlwIiwib3JpZ2luYWwiLCJhc3NpZ24iLCJpc01hc3RlciIsInVzZXIiLCJpbnN0YWxsYXRpb25JZCIsImdldFJlcXVlc3RRdWVyeU9iamVjdCIsInF1ZXJ5IiwiY291bnQiLCJpc0dldCIsImdldFJlc3BvbnNlT2JqZWN0IiwicmVzb2x2ZSIsInJlamVjdCIsInN1Y2Nlc3MiLCJyZXNwb25zZSIsIm9iamVjdHMiLCJtYXAiLCJ0b0pTT04iLCJlcXVhbHMiLCJfZ2V0U2F2ZUpTT04iLCJlcnJvciIsIkVycm9yIiwiU0NSSVBUX0ZBSUxFRCIsIm1lc3NhZ2UiLCJ1c2VySWRGb3JMb2ciLCJpZCIsImxvZ1RyaWdnZXJBZnRlckhvb2siLCJpbnB1dCIsImNsZWFuSW5wdXQiLCJsb2dnZXIiLCJ0cnVuY2F0ZUxvZ01lc3NhZ2UiLCJKU09OIiwic3RyaW5naWZ5IiwiaW5mbyIsImxvZ1RyaWdnZXJTdWNjZXNzQmVmb3JlSG9vayIsInJlc3VsdCIsImNsZWFuUmVzdWx0IiwibG9nVHJpZ2dlckVycm9yQmVmb3JlSG9vayIsIm1heWJlUnVuQWZ0ZXJGaW5kVHJpZ2dlciIsIlByb21pc2UiLCJ0cmlnZ2VyIiwiZnJvbUpTT04iLCJ0aGVuIiwicmVzdWx0cyIsIm1heWJlUnVuUXVlcnlUcmlnZ2VyIiwicmVzdFdoZXJlIiwicmVzdE9wdGlvbnMiLCJqc29uIiwid2hlcmUiLCJwYXJzZVF1ZXJ5IiwiUXVlcnkiLCJ3aXRoSlNPTiIsInJlcXVlc3RPYmplY3QiLCJxdWVyeVJlc3VsdCIsImpzb25RdWVyeSIsImxpbWl0Iiwic2tpcCIsImluY2x1ZGUiLCJleGNsdWRlS2V5cyIsImV4cGxhaW4iLCJvcmRlciIsImhpbnQiLCJyZWFkUHJlZmVyZW5jZSIsImluY2x1ZGVSZWFkUHJlZmVyZW5jZSIsInN1YnF1ZXJ5UmVhZFByZWZlcmVuY2UiLCJlcnIiLCJtYXliZVJ1blRyaWdnZXIiLCJwcm9taXNlIiwiaW5mbGF0ZSIsImRhdGEiLCJyZXN0T2JqZWN0IiwiY29weSIsInJ1bkxpdmVRdWVyeUV2ZW50SGFuZGxlcnMiLCJnZXRSZXF1ZXN0RmlsZU9iamVjdCIsImZpbGVPYmplY3QiLCJtYXliZVJ1bkZpbGVUcmlnZ2VyIiwiZmlsZVRyaWdnZXIiLCJmaWxlIiwiZmlsZVNpemUiXSwibWFwcGluZ3MiOiI7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7OztBQUNBOztBQUNBOzs7Ozs7Ozs7O0FBRU8sTUFBTUEsS0FBSyxHQUFHO0FBQ25CQyxFQUFBQSxXQUFXLEVBQUUsYUFETTtBQUVuQkMsRUFBQUEsVUFBVSxFQUFFLFlBRk87QUFHbkJDLEVBQUFBLFdBQVcsRUFBRSxhQUhNO0FBSW5CQyxFQUFBQSxVQUFVLEVBQUUsWUFKTztBQUtuQkMsRUFBQUEsU0FBUyxFQUFFLFdBTFE7QUFNbkJDLEVBQUFBLFlBQVksRUFBRSxjQU5LO0FBT25CQyxFQUFBQSxXQUFXLEVBQUUsYUFQTTtBQVFuQkMsRUFBQUEsVUFBVSxFQUFFLFlBUk87QUFTbkJDLEVBQUFBLFNBQVMsRUFBRSxXQVRRO0FBVW5CQyxFQUFBQSxjQUFjLEVBQUUsZ0JBVkc7QUFXbkJDLEVBQUFBLGFBQWEsRUFBRSxlQVhJO0FBWW5CQyxFQUFBQSxnQkFBZ0IsRUFBRSxrQkFaQztBQWFuQkMsRUFBQUEsZUFBZSxFQUFFO0FBYkUsQ0FBZDs7QUFnQlAsTUFBTUMsYUFBYSxHQUFHLE9BQXRCOztBQUVBLE1BQU1DLFNBQVMsR0FBRyxZQUFXO0FBQzNCLFFBQU1DLFVBQVUsR0FBRyxFQUFuQjtBQUNBLFFBQU1DLFNBQVMsR0FBRyxFQUFsQjtBQUNBLFFBQU1DLElBQUksR0FBRyxFQUFiO0FBQ0EsUUFBTUMsU0FBUyxHQUFHLEVBQWxCO0FBQ0EsUUFBTUMsUUFBUSxHQUFHQyxNQUFNLENBQUNDLElBQVAsQ0FBWXRCLEtBQVosRUFBbUJ1QixNQUFuQixDQUEwQixVQUFTQyxJQUFULEVBQWVDLEdBQWYsRUFBb0I7QUFDN0RELElBQUFBLElBQUksQ0FBQ0MsR0FBRCxDQUFKLEdBQVksRUFBWjtBQUNBLFdBQU9ELElBQVA7QUFDRCxHQUhnQixFQUdkLEVBSGMsQ0FBakI7QUFLQSxTQUFPSCxNQUFNLENBQUNLLE1BQVAsQ0FBYztBQUNuQlQsSUFBQUEsU0FEbUI7QUFFbkJDLElBQUFBLElBRm1CO0FBR25CRixJQUFBQSxVQUhtQjtBQUluQkksSUFBQUEsUUFKbUI7QUFLbkJELElBQUFBO0FBTG1CLEdBQWQsQ0FBUDtBQU9ELENBakJEOztBQW1CQSxTQUFTUSw0QkFBVCxDQUFzQ0MsU0FBdEMsRUFBaURDLElBQWpELEVBQXVEO0FBQ3JELE1BQUlBLElBQUksSUFBSTdCLEtBQUssQ0FBQ0ksVUFBZCxJQUE0QndCLFNBQVMsS0FBSyxhQUE5QyxFQUE2RDtBQUMzRDtBQUNBO0FBQ0E7QUFDQSxVQUFNLDBDQUFOO0FBQ0Q7O0FBQ0QsTUFDRSxDQUFDQyxJQUFJLEtBQUs3QixLQUFLLENBQUNDLFdBQWYsSUFBOEI0QixJQUFJLEtBQUs3QixLQUFLLENBQUNFLFVBQTlDLEtBQ0EwQixTQUFTLEtBQUssT0FGaEIsRUFHRTtBQUNBO0FBQ0E7QUFDQSxVQUFNLDZFQUFOO0FBQ0Q7O0FBQ0QsTUFBSUMsSUFBSSxLQUFLN0IsS0FBSyxDQUFDRyxXQUFmLElBQThCeUIsU0FBUyxLQUFLLFVBQWhELEVBQTREO0FBQzFEO0FBQ0E7QUFDQSxVQUFNLGlFQUFOO0FBQ0Q7O0FBQ0QsTUFBSUEsU0FBUyxLQUFLLFVBQWQsSUFBNEJDLElBQUksS0FBSzdCLEtBQUssQ0FBQ0csV0FBL0MsRUFBNEQ7QUFDMUQ7QUFDQTtBQUNBLFVBQU0saUVBQU47QUFDRDs7QUFDRCxTQUFPeUIsU0FBUDtBQUNEOztBQUVELE1BQU1FLGFBQWEsR0FBRyxFQUF0QjtBQUVBLE1BQU1DLFFBQVEsR0FBRztBQUNmZCxFQUFBQSxTQUFTLEVBQUUsV0FESTtBQUVmRCxFQUFBQSxVQUFVLEVBQUUsWUFGRztBQUdmRSxFQUFBQSxJQUFJLEVBQUUsTUFIUztBQUlmRSxFQUFBQSxRQUFRLEVBQUU7QUFKSyxDQUFqQjs7QUFPQSxTQUFTWSxRQUFULENBQWtCQyxRQUFsQixFQUE0QkMsSUFBNUIsRUFBa0NDLGFBQWxDLEVBQWlEO0FBQy9DLFFBQU1DLElBQUksR0FBR0YsSUFBSSxDQUFDRyxLQUFMLENBQVcsR0FBWCxDQUFiO0FBQ0FELEVBQUFBLElBQUksQ0FBQ0UsTUFBTCxDQUFZLENBQUMsQ0FBYixFQUYrQyxDQUU5Qjs7QUFDakJILEVBQUFBLGFBQWEsR0FBR0EsYUFBYSxJQUFJSSxjQUFNSixhQUF2QztBQUNBTCxFQUFBQSxhQUFhLENBQUNLLGFBQUQsQ0FBYixHQUErQkwsYUFBYSxDQUFDSyxhQUFELENBQWIsSUFBZ0NwQixTQUFTLEVBQXhFO0FBQ0EsTUFBSXlCLEtBQUssR0FBR1YsYUFBYSxDQUFDSyxhQUFELENBQWIsQ0FBNkJGLFFBQTdCLENBQVo7O0FBQ0EsT0FBSyxNQUFNUSxTQUFYLElBQXdCTCxJQUF4QixFQUE4QjtBQUM1QkksSUFBQUEsS0FBSyxHQUFHQSxLQUFLLENBQUNDLFNBQUQsQ0FBYjs7QUFDQSxRQUFJLENBQUNELEtBQUwsRUFBWTtBQUNWLGFBQU9FLFNBQVA7QUFDRDtBQUNGOztBQUNELFNBQU9GLEtBQVA7QUFDRDs7QUFFRCxTQUFTRyxHQUFULENBQWFWLFFBQWIsRUFBdUJDLElBQXZCLEVBQTZCVSxPQUE3QixFQUFzQ1QsYUFBdEMsRUFBcUQ7QUFDbkQsUUFBTVUsYUFBYSxHQUFHWCxJQUFJLENBQUNHLEtBQUwsQ0FBVyxHQUFYLEVBQWdCQyxNQUFoQixDQUF1QixDQUFDLENBQXhCLENBQXRCO0FBQ0EsUUFBTUUsS0FBSyxHQUFHUixRQUFRLENBQUNDLFFBQUQsRUFBV0MsSUFBWCxFQUFpQkMsYUFBakIsQ0FBdEI7QUFDQUssRUFBQUEsS0FBSyxDQUFDSyxhQUFELENBQUwsR0FBdUJELE9BQXZCO0FBQ0Q7O0FBRUQsU0FBU0UsTUFBVCxDQUFnQmIsUUFBaEIsRUFBMEJDLElBQTFCLEVBQWdDQyxhQUFoQyxFQUErQztBQUM3QyxRQUFNVSxhQUFhLEdBQUdYLElBQUksQ0FBQ0csS0FBTCxDQUFXLEdBQVgsRUFBZ0JDLE1BQWhCLENBQXVCLENBQUMsQ0FBeEIsQ0FBdEI7QUFDQSxRQUFNRSxLQUFLLEdBQUdSLFFBQVEsQ0FBQ0MsUUFBRCxFQUFXQyxJQUFYLEVBQWlCQyxhQUFqQixDQUF0QjtBQUNBLFNBQU9LLEtBQUssQ0FBQ0ssYUFBRCxDQUFaO0FBQ0Q7O0FBRUQsU0FBU0UsR0FBVCxDQUFhZCxRQUFiLEVBQXVCQyxJQUF2QixFQUE2QkMsYUFBN0IsRUFBNEM7QUFDMUMsUUFBTVUsYUFBYSxHQUFHWCxJQUFJLENBQUNHLEtBQUwsQ0FBVyxHQUFYLEVBQWdCQyxNQUFoQixDQUF1QixDQUFDLENBQXhCLENBQXRCO0FBQ0EsUUFBTUUsS0FBSyxHQUFHUixRQUFRLENBQUNDLFFBQUQsRUFBV0MsSUFBWCxFQUFpQkMsYUFBakIsQ0FBdEI7QUFDQSxTQUFPSyxLQUFLLENBQUNLLGFBQUQsQ0FBWjtBQUNEOztBQUVNLFNBQVNHLFdBQVQsQ0FDTEMsWUFESyxFQUVMTCxPQUZLLEVBR0xNLGlCQUhLLEVBSUxmLGFBSkssRUFLTDtBQUNBUSxFQUFBQSxHQUFHLENBQUNaLFFBQVEsQ0FBQ2QsU0FBVixFQUFxQmdDLFlBQXJCLEVBQW1DTCxPQUFuQyxFQUE0Q1QsYUFBNUMsQ0FBSDtBQUNBUSxFQUFBQSxHQUFHLENBQUNaLFFBQVEsQ0FBQ2YsVUFBVixFQUFzQmlDLFlBQXRCLEVBQW9DQyxpQkFBcEMsRUFBdURmLGFBQXZELENBQUg7QUFDRDs7QUFFTSxTQUFTZ0IsTUFBVCxDQUFnQkMsT0FBaEIsRUFBeUJSLE9BQXpCLEVBQWtDVCxhQUFsQyxFQUFpRDtBQUN0RFEsRUFBQUEsR0FBRyxDQUFDWixRQUFRLENBQUNiLElBQVYsRUFBZ0JrQyxPQUFoQixFQUF5QlIsT0FBekIsRUFBa0NULGFBQWxDLENBQUg7QUFDRDs7QUFFTSxTQUFTa0IsVUFBVCxDQUFvQnhCLElBQXBCLEVBQTBCRCxTQUExQixFQUFxQ2dCLE9BQXJDLEVBQThDVCxhQUE5QyxFQUE2RDtBQUNsRVIsRUFBQUEsNEJBQTRCLENBQUNDLFNBQUQsRUFBWUMsSUFBWixDQUE1QjtBQUNBYyxFQUFBQSxHQUFHLENBQUNaLFFBQVEsQ0FBQ1gsUUFBVixFQUFxQixHQUFFUyxJQUFLLElBQUdELFNBQVUsRUFBekMsRUFBNENnQixPQUE1QyxFQUFxRFQsYUFBckQsQ0FBSDtBQUNEOztBQUVNLFNBQVNtQixjQUFULENBQXdCekIsSUFBeEIsRUFBOEJlLE9BQTlCLEVBQXVDVCxhQUF2QyxFQUFzRDtBQUMzRFEsRUFBQUEsR0FBRyxDQUFDWixRQUFRLENBQUNYLFFBQVYsRUFBcUIsR0FBRVMsSUFBSyxJQUFHZixhQUFjLEVBQTdDLEVBQWdEOEIsT0FBaEQsRUFBeURULGFBQXpELENBQUg7QUFDRDs7QUFFTSxTQUFTb0Isd0JBQVQsQ0FBa0NYLE9BQWxDLEVBQTJDVCxhQUEzQyxFQUEwRDtBQUMvREEsRUFBQUEsYUFBYSxHQUFHQSxhQUFhLElBQUlJLGNBQU1KLGFBQXZDO0FBQ0FMLEVBQUFBLGFBQWEsQ0FBQ0ssYUFBRCxDQUFiLEdBQStCTCxhQUFhLENBQUNLLGFBQUQsQ0FBYixJQUFnQ3BCLFNBQVMsRUFBeEU7O0FBQ0FlLEVBQUFBLGFBQWEsQ0FBQ0ssYUFBRCxDQUFiLENBQTZCaEIsU0FBN0IsQ0FBdUNxQyxJQUF2QyxDQUE0Q1osT0FBNUM7QUFDRDs7QUFFTSxTQUFTYSxjQUFULENBQXdCUixZQUF4QixFQUFzQ2QsYUFBdEMsRUFBcUQ7QUFDMURXLEVBQUFBLE1BQU0sQ0FBQ2YsUUFBUSxDQUFDZCxTQUFWLEVBQXFCZ0MsWUFBckIsRUFBbUNkLGFBQW5DLENBQU47QUFDRDs7QUFFTSxTQUFTdUIsYUFBVCxDQUF1QjdCLElBQXZCLEVBQTZCRCxTQUE3QixFQUF3Q08sYUFBeEMsRUFBdUQ7QUFDNURXLEVBQUFBLE1BQU0sQ0FBQ2YsUUFBUSxDQUFDWCxRQUFWLEVBQXFCLEdBQUVTLElBQUssSUFBR0QsU0FBVSxFQUF6QyxFQUE0Q08sYUFBNUMsQ0FBTjtBQUNEOztBQUVNLFNBQVN3QixjQUFULEdBQTBCO0FBQy9CdEMsRUFBQUEsTUFBTSxDQUFDQyxJQUFQLENBQVlRLGFBQVosRUFBMkI4QixPQUEzQixDQUFtQ0MsS0FBSyxJQUFJLE9BQU8vQixhQUFhLENBQUMrQixLQUFELENBQWhFO0FBQ0Q7O0FBRU0sU0FBU0MsVUFBVCxDQUFvQmxDLFNBQXBCLEVBQStCbUMsV0FBL0IsRUFBNEM1QixhQUE1QyxFQUEyRDtBQUNoRSxNQUFJLENBQUNBLGFBQUwsRUFBb0I7QUFDbEIsVUFBTSx1QkFBTjtBQUNEOztBQUNELFNBQU9ZLEdBQUcsQ0FBQ2hCLFFBQVEsQ0FBQ1gsUUFBVixFQUFxQixHQUFFMkMsV0FBWSxJQUFHbkMsU0FBVSxFQUFoRCxFQUFtRE8sYUFBbkQsQ0FBVjtBQUNEOztBQUVNLFNBQVM2QixjQUFULENBQXdCbkMsSUFBeEIsRUFBOEJNLGFBQTlCLEVBQTZDO0FBQ2xELFNBQU8yQixVQUFVLENBQUNoRCxhQUFELEVBQWdCZSxJQUFoQixFQUFzQk0sYUFBdEIsQ0FBakI7QUFDRDs7QUFFTSxTQUFTOEIsYUFBVCxDQUNMckMsU0FESyxFQUVMQyxJQUZLLEVBR0xNLGFBSEssRUFJSTtBQUNULFNBQU8yQixVQUFVLENBQUNsQyxTQUFELEVBQVlDLElBQVosRUFBa0JNLGFBQWxCLENBQVYsSUFBOENPLFNBQXJEO0FBQ0Q7O0FBRU0sU0FBU3dCLFdBQVQsQ0FBcUJqQixZQUFyQixFQUFtQ2QsYUFBbkMsRUFBa0Q7QUFDdkQsU0FBT1ksR0FBRyxDQUFDaEIsUUFBUSxDQUFDZCxTQUFWLEVBQXFCZ0MsWUFBckIsRUFBbUNkLGFBQW5DLENBQVY7QUFDRDs7QUFFTSxTQUFTZ0MsZ0JBQVQsQ0FBMEJoQyxhQUExQixFQUF5QztBQUM5QyxRQUFNSyxLQUFLLEdBQ1JWLGFBQWEsQ0FBQ0ssYUFBRCxDQUFiLElBQ0NMLGFBQWEsQ0FBQ0ssYUFBRCxDQUFiLENBQTZCSixRQUFRLENBQUNkLFNBQXRDLENBREYsSUFFQSxFQUhGO0FBSUEsUUFBTW1ELGFBQWEsR0FBRyxFQUF0Qjs7QUFDQSxRQUFNQyxvQkFBb0IsR0FBRyxDQUFDQyxTQUFELEVBQVk5QixLQUFaLEtBQXNCO0FBQ2pEbkIsSUFBQUEsTUFBTSxDQUFDQyxJQUFQLENBQVlrQixLQUFaLEVBQW1Cb0IsT0FBbkIsQ0FBMkIxQixJQUFJLElBQUk7QUFDakMsWUFBTXFDLEtBQUssR0FBRy9CLEtBQUssQ0FBQ04sSUFBRCxDQUFuQjs7QUFDQSxVQUFJb0MsU0FBSixFQUFlO0FBQ2JwQyxRQUFBQSxJQUFJLEdBQUksR0FBRW9DLFNBQVUsSUFBR3BDLElBQUssRUFBNUI7QUFDRDs7QUFDRCxVQUFJLE9BQU9xQyxLQUFQLEtBQWlCLFVBQXJCLEVBQWlDO0FBQy9CSCxRQUFBQSxhQUFhLENBQUNaLElBQWQsQ0FBbUJ0QixJQUFuQjtBQUNELE9BRkQsTUFFTztBQUNMbUMsUUFBQUEsb0JBQW9CLENBQUNuQyxJQUFELEVBQU9xQyxLQUFQLENBQXBCO0FBQ0Q7QUFDRixLQVZEO0FBV0QsR0FaRDs7QUFhQUYsRUFBQUEsb0JBQW9CLENBQUMsSUFBRCxFQUFPN0IsS0FBUCxDQUFwQjtBQUNBLFNBQU80QixhQUFQO0FBQ0Q7O0FBRU0sU0FBU0ksTUFBVCxDQUFnQnBCLE9BQWhCLEVBQXlCakIsYUFBekIsRUFBd0M7QUFDN0MsU0FBT1ksR0FBRyxDQUFDaEIsUUFBUSxDQUFDYixJQUFWLEVBQWdCa0MsT0FBaEIsRUFBeUJqQixhQUF6QixDQUFWO0FBQ0Q7O0FBRU0sU0FBU3NDLE9BQVQsQ0FBaUJ0QyxhQUFqQixFQUFnQztBQUNyQyxNQUFJdUMsT0FBTyxHQUFHNUMsYUFBYSxDQUFDSyxhQUFELENBQTNCOztBQUNBLE1BQUl1QyxPQUFPLElBQUlBLE9BQU8sQ0FBQ3hELElBQXZCLEVBQTZCO0FBQzNCLFdBQU93RCxPQUFPLENBQUN4RCxJQUFmO0FBQ0Q7O0FBQ0QsU0FBT3dCLFNBQVA7QUFDRDs7QUFFTSxTQUFTaUMsWUFBVCxDQUFzQjFCLFlBQXRCLEVBQW9DZCxhQUFwQyxFQUFtRDtBQUN4RCxTQUFPWSxHQUFHLENBQUNoQixRQUFRLENBQUNmLFVBQVYsRUFBc0JpQyxZQUF0QixFQUFvQ2QsYUFBcEMsQ0FBVjtBQUNEOztBQUVNLFNBQVN5QyxnQkFBVCxDQUNMYixXQURLLEVBRUxjLElBRkssRUFHTEMsV0FISyxFQUlMQyxtQkFKSyxFQUtMQyxNQUxLLEVBTUxDLE9BTkssRUFPTDtBQUNBLFFBQU1DLE9BQU8sR0FBRztBQUNkQyxJQUFBQSxXQUFXLEVBQUVwQixXQURDO0FBRWRxQixJQUFBQSxNQUFNLEVBQUVOLFdBRk07QUFHZE8sSUFBQUEsTUFBTSxFQUFFLEtBSE07QUFJZEMsSUFBQUEsR0FBRyxFQUFFTixNQUFNLENBQUNPLGdCQUpFO0FBS2RDLElBQUFBLE9BQU8sRUFBRVIsTUFBTSxDQUFDUSxPQUxGO0FBTWRDLElBQUFBLEVBQUUsRUFBRVQsTUFBTSxDQUFDUztBQU5HLEdBQWhCOztBQVNBLE1BQUlWLG1CQUFKLEVBQXlCO0FBQ3ZCRyxJQUFBQSxPQUFPLENBQUNRLFFBQVIsR0FBbUJYLG1CQUFuQjtBQUNEOztBQUVELE1BQUloQixXQUFXLEtBQUsvRCxLQUFLLENBQUNJLFVBQXRCLElBQ0YyRCxXQUFXLEtBQUsvRCxLQUFLLENBQUNLLFNBRHBCLElBRUYwRCxXQUFXLEtBQUsvRCxLQUFLLENBQUNNLFlBRnBCLElBR0Z5RCxXQUFXLEtBQUsvRCxLQUFLLENBQUNPLFdBSHhCLEVBR3FDO0FBQ25DO0FBQ0EyRSxJQUFBQSxPQUFPLENBQUNELE9BQVIsR0FBa0I1RCxNQUFNLENBQUNzRSxNQUFQLENBQWMsRUFBZCxFQUFrQlYsT0FBbEIsQ0FBbEI7QUFDRDs7QUFFRCxNQUFJLENBQUNKLElBQUwsRUFBVztBQUNULFdBQU9LLE9BQVA7QUFDRDs7QUFDRCxNQUFJTCxJQUFJLENBQUNlLFFBQVQsRUFBbUI7QUFDakJWLElBQUFBLE9BQU8sQ0FBQyxRQUFELENBQVAsR0FBb0IsSUFBcEI7QUFDRDs7QUFDRCxNQUFJTCxJQUFJLENBQUNnQixJQUFULEVBQWU7QUFDYlgsSUFBQUEsT0FBTyxDQUFDLE1BQUQsQ0FBUCxHQUFrQkwsSUFBSSxDQUFDZ0IsSUFBdkI7QUFDRDs7QUFDRCxNQUFJaEIsSUFBSSxDQUFDaUIsY0FBVCxFQUF5QjtBQUN2QlosSUFBQUEsT0FBTyxDQUFDLGdCQUFELENBQVAsR0FBNEJMLElBQUksQ0FBQ2lCLGNBQWpDO0FBQ0Q7O0FBQ0QsU0FBT1osT0FBUDtBQUNEOztBQUVNLFNBQVNhLHFCQUFULENBQ0xoQyxXQURLLEVBRUxjLElBRkssRUFHTG1CLEtBSEssRUFJTEMsS0FKSyxFQUtMakIsTUFMSyxFQU1MQyxPQU5LLEVBT0xpQixLQVBLLEVBUUw7QUFDQUEsRUFBQUEsS0FBSyxHQUFHLENBQUMsQ0FBQ0EsS0FBVjtBQUVBLE1BQUloQixPQUFPLEdBQUc7QUFDWkMsSUFBQUEsV0FBVyxFQUFFcEIsV0FERDtBQUVaaUMsSUFBQUEsS0FGWTtBQUdaWCxJQUFBQSxNQUFNLEVBQUUsS0FISTtBQUlaWSxJQUFBQSxLQUpZO0FBS1pYLElBQUFBLEdBQUcsRUFBRU4sTUFBTSxDQUFDTyxnQkFMQTtBQU1aVyxJQUFBQSxLQU5ZO0FBT1pWLElBQUFBLE9BQU8sRUFBRVIsTUFBTSxDQUFDUSxPQVBKO0FBUVpDLElBQUFBLEVBQUUsRUFBRVQsTUFBTSxDQUFDUyxFQVJDO0FBU1pSLElBQUFBLE9BQU8sRUFBRUEsT0FBTyxJQUFJO0FBVFIsR0FBZDs7QUFZQSxNQUFJLENBQUNKLElBQUwsRUFBVztBQUNULFdBQU9LLE9BQVA7QUFDRDs7QUFDRCxNQUFJTCxJQUFJLENBQUNlLFFBQVQsRUFBbUI7QUFDakJWLElBQUFBLE9BQU8sQ0FBQyxRQUFELENBQVAsR0FBb0IsSUFBcEI7QUFDRDs7QUFDRCxNQUFJTCxJQUFJLENBQUNnQixJQUFULEVBQWU7QUFDYlgsSUFBQUEsT0FBTyxDQUFDLE1BQUQsQ0FBUCxHQUFrQkwsSUFBSSxDQUFDZ0IsSUFBdkI7QUFDRDs7QUFDRCxNQUFJaEIsSUFBSSxDQUFDaUIsY0FBVCxFQUF5QjtBQUN2QlosSUFBQUEsT0FBTyxDQUFDLGdCQUFELENBQVAsR0FBNEJMLElBQUksQ0FBQ2lCLGNBQWpDO0FBQ0Q7O0FBQ0QsU0FBT1osT0FBUDtBQUNELEMsQ0FFRDtBQUNBO0FBQ0E7QUFDQTs7O0FBQ08sU0FBU2lCLGlCQUFULENBQTJCakIsT0FBM0IsRUFBb0NrQixPQUFwQyxFQUE2Q0MsTUFBN0MsRUFBcUQ7QUFDMUQsU0FBTztBQUNMQyxJQUFBQSxPQUFPLEVBQUUsVUFBU0MsUUFBVCxFQUFtQjtBQUMxQixVQUFJckIsT0FBTyxDQUFDQyxXQUFSLEtBQXdCbkYsS0FBSyxDQUFDUyxTQUFsQyxFQUE2QztBQUMzQyxZQUFJLENBQUM4RixRQUFMLEVBQWU7QUFDYkEsVUFBQUEsUUFBUSxHQUFHckIsT0FBTyxDQUFDc0IsT0FBbkI7QUFDRDs7QUFDREQsUUFBQUEsUUFBUSxHQUFHQSxRQUFRLENBQUNFLEdBQVQsQ0FBYXJCLE1BQU0sSUFBSTtBQUNoQyxpQkFBT0EsTUFBTSxDQUFDc0IsTUFBUCxFQUFQO0FBQ0QsU0FGVSxDQUFYO0FBR0EsZUFBT04sT0FBTyxDQUFDRyxRQUFELENBQWQ7QUFDRCxPQVR5QixDQVUxQjs7O0FBQ0EsVUFDRUEsUUFBUSxJQUNSLE9BQU9BLFFBQVAsS0FBb0IsUUFEcEIsSUFFQSxDQUFDckIsT0FBTyxDQUFDRSxNQUFSLENBQWV1QixNQUFmLENBQXNCSixRQUF0QixDQUZELElBR0FyQixPQUFPLENBQUNDLFdBQVIsS0FBd0JuRixLQUFLLENBQUNJLFVBSmhDLEVBS0U7QUFDQSxlQUFPZ0csT0FBTyxDQUFDRyxRQUFELENBQWQ7QUFDRDs7QUFDRCxVQUNFQSxRQUFRLElBQ1IsT0FBT0EsUUFBUCxLQUFvQixRQURwQixJQUVBckIsT0FBTyxDQUFDQyxXQUFSLEtBQXdCbkYsS0FBSyxDQUFDSyxTQUhoQyxFQUlFO0FBQ0EsZUFBTytGLE9BQU8sQ0FBQ0csUUFBRCxDQUFkO0FBQ0Q7O0FBQ0QsVUFBSXJCLE9BQU8sQ0FBQ0MsV0FBUixLQUF3Qm5GLEtBQUssQ0FBQ0ssU0FBbEMsRUFBNkM7QUFDM0MsZUFBTytGLE9BQU8sRUFBZDtBQUNEOztBQUNERyxNQUFBQSxRQUFRLEdBQUcsRUFBWDs7QUFDQSxVQUFJckIsT0FBTyxDQUFDQyxXQUFSLEtBQXdCbkYsS0FBSyxDQUFDSSxVQUFsQyxFQUE4QztBQUM1Q21HLFFBQUFBLFFBQVEsQ0FBQyxRQUFELENBQVIsR0FBcUJyQixPQUFPLENBQUNFLE1BQVIsQ0FBZXdCLFlBQWYsRUFBckI7QUFDRDs7QUFDRCxhQUFPUixPQUFPLENBQUNHLFFBQUQsQ0FBZDtBQUNELEtBbkNJO0FBb0NMTSxJQUFBQSxLQUFLLEVBQUUsVUFBU0EsS0FBVCxFQUFnQjtBQUNyQixVQUFJQSxLQUFLLFlBQVl0RSxjQUFNdUUsS0FBM0IsRUFBa0M7QUFDaENULFFBQUFBLE1BQU0sQ0FBQ1EsS0FBRCxDQUFOO0FBQ0QsT0FGRCxNQUVPLElBQUlBLEtBQUssWUFBWUMsS0FBckIsRUFBNEI7QUFDakNULFFBQUFBLE1BQU0sQ0FBQyxJQUFJOUQsY0FBTXVFLEtBQVYsQ0FBZ0J2RSxjQUFNdUUsS0FBTixDQUFZQyxhQUE1QixFQUEyQ0YsS0FBSyxDQUFDRyxPQUFqRCxDQUFELENBQU47QUFDRCxPQUZNLE1BRUE7QUFDTFgsUUFBQUEsTUFBTSxDQUFDLElBQUk5RCxjQUFNdUUsS0FBVixDQUFnQnZFLGNBQU11RSxLQUFOLENBQVlDLGFBQTVCLEVBQTJDRixLQUEzQyxDQUFELENBQU47QUFDRDtBQUNGO0FBNUNJLEdBQVA7QUE4Q0Q7O0FBRUQsU0FBU0ksWUFBVCxDQUFzQnBDLElBQXRCLEVBQTRCO0FBQzFCLFNBQU9BLElBQUksSUFBSUEsSUFBSSxDQUFDZ0IsSUFBYixHQUFvQmhCLElBQUksQ0FBQ2dCLElBQUwsQ0FBVXFCLEVBQTlCLEdBQW1DeEUsU0FBMUM7QUFDRDs7QUFFRCxTQUFTeUUsbUJBQVQsQ0FBNkJwRCxXQUE3QixFQUEwQ25DLFNBQTFDLEVBQXFEd0YsS0FBckQsRUFBNER2QyxJQUE1RCxFQUFrRTtBQUNoRSxRQUFNd0MsVUFBVSxHQUFHQyxlQUFPQyxrQkFBUCxDQUEwQkMsSUFBSSxDQUFDQyxTQUFMLENBQWVMLEtBQWYsQ0FBMUIsQ0FBbkI7O0FBQ0FFLGlCQUFPSSxJQUFQLENBQ0csR0FBRTNELFdBQVksa0JBQWlCbkMsU0FBVSxhQUFZcUYsWUFBWSxDQUNoRXBDLElBRGdFLENBRWhFLGVBQWN3QyxVQUFXLEVBSDdCLEVBSUU7QUFDRXpGLElBQUFBLFNBREY7QUFFRW1DLElBQUFBLFdBRkY7QUFHRThCLElBQUFBLElBQUksRUFBRW9CLFlBQVksQ0FBQ3BDLElBQUQ7QUFIcEIsR0FKRjtBQVVEOztBQUVELFNBQVM4QywyQkFBVCxDQUNFNUQsV0FERixFQUVFbkMsU0FGRixFQUdFd0YsS0FIRixFQUlFUSxNQUpGLEVBS0UvQyxJQUxGLEVBTUU7QUFDQSxRQUFNd0MsVUFBVSxHQUFHQyxlQUFPQyxrQkFBUCxDQUEwQkMsSUFBSSxDQUFDQyxTQUFMLENBQWVMLEtBQWYsQ0FBMUIsQ0FBbkI7O0FBQ0EsUUFBTVMsV0FBVyxHQUFHUCxlQUFPQyxrQkFBUCxDQUEwQkMsSUFBSSxDQUFDQyxTQUFMLENBQWVHLE1BQWYsQ0FBMUIsQ0FBcEI7O0FBQ0FOLGlCQUFPSSxJQUFQLENBQ0csR0FBRTNELFdBQVksa0JBQWlCbkMsU0FBVSxhQUFZcUYsWUFBWSxDQUNoRXBDLElBRGdFLENBRWhFLGVBQWN3QyxVQUFXLGVBQWNRLFdBQVksRUFIdkQsRUFJRTtBQUNFakcsSUFBQUEsU0FERjtBQUVFbUMsSUFBQUEsV0FGRjtBQUdFOEIsSUFBQUEsSUFBSSxFQUFFb0IsWUFBWSxDQUFDcEMsSUFBRDtBQUhwQixHQUpGO0FBVUQ7O0FBRUQsU0FBU2lELHlCQUFULENBQW1DL0QsV0FBbkMsRUFBZ0RuQyxTQUFoRCxFQUEyRHdGLEtBQTNELEVBQWtFdkMsSUFBbEUsRUFBd0VnQyxLQUF4RSxFQUErRTtBQUM3RSxRQUFNUSxVQUFVLEdBQUdDLGVBQU9DLGtCQUFQLENBQTBCQyxJQUFJLENBQUNDLFNBQUwsQ0FBZUwsS0FBZixDQUExQixDQUFuQjs7QUFDQUUsaUJBQU9ULEtBQVAsQ0FDRyxHQUFFOUMsV0FBWSxlQUFjbkMsU0FBVSxhQUFZcUYsWUFBWSxDQUM3RHBDLElBRDZELENBRTdELGVBQWN3QyxVQUFXLGNBQWFHLElBQUksQ0FBQ0MsU0FBTCxDQUFlWixLQUFmLENBQXNCLEVBSGhFLEVBSUU7QUFDRWpGLElBQUFBLFNBREY7QUFFRW1DLElBQUFBLFdBRkY7QUFHRThDLElBQUFBLEtBSEY7QUFJRWhCLElBQUFBLElBQUksRUFBRW9CLFlBQVksQ0FBQ3BDLElBQUQ7QUFKcEIsR0FKRjtBQVdEOztBQUVNLFNBQVNrRCx3QkFBVCxDQUNMaEUsV0FESyxFQUVMYyxJQUZLLEVBR0xqRCxTQUhLLEVBSUw0RSxPQUpLLEVBS0x4QixNQUxLLEVBTUw7QUFDQSxTQUFPLElBQUlnRCxPQUFKLENBQVksQ0FBQzVCLE9BQUQsRUFBVUMsTUFBVixLQUFxQjtBQUN0QyxVQUFNNEIsT0FBTyxHQUFHbkUsVUFBVSxDQUFDbEMsU0FBRCxFQUFZbUMsV0FBWixFQUF5QmlCLE1BQU0sQ0FBQzdDLGFBQWhDLENBQTFCOztBQUNBLFFBQUksQ0FBQzhGLE9BQUwsRUFBYztBQUNaLGFBQU83QixPQUFPLEVBQWQ7QUFDRDs7QUFDRCxVQUFNbEIsT0FBTyxHQUFHTixnQkFBZ0IsQ0FBQ2IsV0FBRCxFQUFjYyxJQUFkLEVBQW9CLElBQXBCLEVBQTBCLElBQTFCLEVBQWdDRyxNQUFoQyxDQUFoQztBQUNBLFVBQU07QUFBRXNCLE1BQUFBLE9BQUY7QUFBV08sTUFBQUE7QUFBWCxRQUFxQlYsaUJBQWlCLENBQzFDakIsT0FEMEMsRUFFMUNFLE1BQU0sSUFBSTtBQUNSZ0IsTUFBQUEsT0FBTyxDQUFDaEIsTUFBRCxDQUFQO0FBQ0QsS0FKeUMsRUFLMUN5QixLQUFLLElBQUk7QUFDUFIsTUFBQUEsTUFBTSxDQUFDUSxLQUFELENBQU47QUFDRCxLQVB5QyxDQUE1QztBQVNBYyxJQUFBQSwyQkFBMkIsQ0FDekI1RCxXQUR5QixFQUV6Qm5DLFNBRnlCLEVBR3pCLFdBSHlCLEVBSXpCNEYsSUFBSSxDQUFDQyxTQUFMLENBQWVqQixPQUFmLENBSnlCLEVBS3pCM0IsSUFMeUIsQ0FBM0I7QUFPQUssSUFBQUEsT0FBTyxDQUFDc0IsT0FBUixHQUFrQkEsT0FBTyxDQUFDQyxHQUFSLENBQVlyQixNQUFNLElBQUk7QUFDdEM7QUFDQUEsTUFBQUEsTUFBTSxDQUFDeEQsU0FBUCxHQUFtQkEsU0FBbkI7QUFDQSxhQUFPVyxjQUFNbEIsTUFBTixDQUFhNkcsUUFBYixDQUFzQjlDLE1BQXRCLENBQVA7QUFDRCxLQUppQixDQUFsQjtBQUtBLFdBQU80QyxPQUFPLENBQUM1QixPQUFSLEdBQ0orQixJQURJLENBQ0MsTUFBTTtBQUNWLFlBQU01QixRQUFRLEdBQUcwQixPQUFPLENBQUMvQyxPQUFELENBQXhCOztBQUNBLFVBQUlxQixRQUFRLElBQUksT0FBT0EsUUFBUSxDQUFDNEIsSUFBaEIsS0FBeUIsVUFBekMsRUFBcUQ7QUFDbkQsZUFBTzVCLFFBQVEsQ0FBQzRCLElBQVQsQ0FBY0MsT0FBTyxJQUFJO0FBQzlCLGNBQUksQ0FBQ0EsT0FBTCxFQUFjO0FBQ1osa0JBQU0sSUFBSTdGLGNBQU11RSxLQUFWLENBQ0p2RSxjQUFNdUUsS0FBTixDQUFZQyxhQURSLEVBRUosd0RBRkksQ0FBTjtBQUlEOztBQUNELGlCQUFPcUIsT0FBUDtBQUNELFNBUk0sQ0FBUDtBQVNEOztBQUNELGFBQU83QixRQUFQO0FBQ0QsS0FmSSxFQWdCSjRCLElBaEJJLENBZ0JDN0IsT0FoQkQsRUFnQlVPLEtBaEJWLENBQVA7QUFpQkQsR0E1Q00sRUE0Q0pzQixJQTVDSSxDQTRDQ0MsT0FBTyxJQUFJO0FBQ2pCakIsSUFBQUEsbUJBQW1CLENBQUNwRCxXQUFELEVBQWNuQyxTQUFkLEVBQXlCNEYsSUFBSSxDQUFDQyxTQUFMLENBQWVXLE9BQWYsQ0FBekIsRUFBa0R2RCxJQUFsRCxDQUFuQjtBQUNBLFdBQU91RCxPQUFQO0FBQ0QsR0EvQ00sQ0FBUDtBQWdERDs7QUFFTSxTQUFTQyxvQkFBVCxDQUNMdEUsV0FESyxFQUVMbkMsU0FGSyxFQUdMMEcsU0FISyxFQUlMQyxXQUpLLEVBS0x2RCxNQUxLLEVBTUxILElBTkssRUFPTEksT0FQSyxFQVFMaUIsS0FSSyxFQVNMO0FBQ0EsUUFBTStCLE9BQU8sR0FBR25FLFVBQVUsQ0FBQ2xDLFNBQUQsRUFBWW1DLFdBQVosRUFBeUJpQixNQUFNLENBQUM3QyxhQUFoQyxDQUExQjs7QUFDQSxNQUFJLENBQUM4RixPQUFMLEVBQWM7QUFDWixXQUFPRCxPQUFPLENBQUM1QixPQUFSLENBQWdCO0FBQ3JCa0MsTUFBQUEsU0FEcUI7QUFFckJDLE1BQUFBO0FBRnFCLEtBQWhCLENBQVA7QUFJRDs7QUFDRCxRQUFNQyxJQUFJLEdBQUduSCxNQUFNLENBQUNzRSxNQUFQLENBQWMsRUFBZCxFQUFrQjRDLFdBQWxCLENBQWI7QUFDQUMsRUFBQUEsSUFBSSxDQUFDQyxLQUFMLEdBQWFILFNBQWI7QUFFQSxRQUFNSSxVQUFVLEdBQUcsSUFBSW5HLGNBQU1vRyxLQUFWLENBQWdCL0csU0FBaEIsQ0FBbkI7QUFDQThHLEVBQUFBLFVBQVUsQ0FBQ0UsUUFBWCxDQUFvQkosSUFBcEI7QUFFQSxNQUFJdkMsS0FBSyxHQUFHLEtBQVo7O0FBQ0EsTUFBSXNDLFdBQUosRUFBaUI7QUFDZnRDLElBQUFBLEtBQUssR0FBRyxDQUFDLENBQUNzQyxXQUFXLENBQUN0QyxLQUF0QjtBQUNEOztBQUNELFFBQU00QyxhQUFhLEdBQUc5QyxxQkFBcUIsQ0FDekNoQyxXQUR5QyxFQUV6Q2MsSUFGeUMsRUFHekM2RCxVQUh5QyxFQUl6Q3pDLEtBSnlDLEVBS3pDakIsTUFMeUMsRUFNekNDLE9BTnlDLEVBT3pDaUIsS0FQeUMsQ0FBM0M7QUFTQSxTQUFPOEIsT0FBTyxDQUFDNUIsT0FBUixHQUNKK0IsSUFESSxDQUNDLE1BQU07QUFDVixXQUFPRixPQUFPLENBQUNZLGFBQUQsQ0FBZDtBQUNELEdBSEksRUFJSlYsSUFKSSxDQUtIUCxNQUFNLElBQUk7QUFDUixRQUFJa0IsV0FBVyxHQUFHSixVQUFsQjs7QUFDQSxRQUFJZCxNQUFNLElBQUlBLE1BQU0sWUFBWXJGLGNBQU1vRyxLQUF0QyxFQUE2QztBQUMzQ0csTUFBQUEsV0FBVyxHQUFHbEIsTUFBZDtBQUNEOztBQUNELFVBQU1tQixTQUFTLEdBQUdELFdBQVcsQ0FBQ3BDLE1BQVosRUFBbEI7O0FBQ0EsUUFBSXFDLFNBQVMsQ0FBQ04sS0FBZCxFQUFxQjtBQUNuQkgsTUFBQUEsU0FBUyxHQUFHUyxTQUFTLENBQUNOLEtBQXRCO0FBQ0Q7O0FBQ0QsUUFBSU0sU0FBUyxDQUFDQyxLQUFkLEVBQXFCO0FBQ25CVCxNQUFBQSxXQUFXLEdBQUdBLFdBQVcsSUFBSSxFQUE3QjtBQUNBQSxNQUFBQSxXQUFXLENBQUNTLEtBQVosR0FBb0JELFNBQVMsQ0FBQ0MsS0FBOUI7QUFDRDs7QUFDRCxRQUFJRCxTQUFTLENBQUNFLElBQWQsRUFBb0I7QUFDbEJWLE1BQUFBLFdBQVcsR0FBR0EsV0FBVyxJQUFJLEVBQTdCO0FBQ0FBLE1BQUFBLFdBQVcsQ0FBQ1UsSUFBWixHQUFtQkYsU0FBUyxDQUFDRSxJQUE3QjtBQUNEOztBQUNELFFBQUlGLFNBQVMsQ0FBQ0csT0FBZCxFQUF1QjtBQUNyQlgsTUFBQUEsV0FBVyxHQUFHQSxXQUFXLElBQUksRUFBN0I7QUFDQUEsTUFBQUEsV0FBVyxDQUFDVyxPQUFaLEdBQXNCSCxTQUFTLENBQUNHLE9BQWhDO0FBQ0Q7O0FBQ0QsUUFBSUgsU0FBUyxDQUFDSSxXQUFkLEVBQTJCO0FBQ3pCWixNQUFBQSxXQUFXLEdBQUdBLFdBQVcsSUFBSSxFQUE3QjtBQUNBQSxNQUFBQSxXQUFXLENBQUNZLFdBQVosR0FBMEJKLFNBQVMsQ0FBQ0ksV0FBcEM7QUFDRDs7QUFDRCxRQUFJSixTQUFTLENBQUNLLE9BQWQsRUFBdUI7QUFDckJiLE1BQUFBLFdBQVcsR0FBR0EsV0FBVyxJQUFJLEVBQTdCO0FBQ0FBLE1BQUFBLFdBQVcsQ0FBQ2EsT0FBWixHQUFzQkwsU0FBUyxDQUFDSyxPQUFoQztBQUNEOztBQUNELFFBQUlMLFNBQVMsQ0FBQ3pILElBQWQsRUFBb0I7QUFDbEJpSCxNQUFBQSxXQUFXLEdBQUdBLFdBQVcsSUFBSSxFQUE3QjtBQUNBQSxNQUFBQSxXQUFXLENBQUNqSCxJQUFaLEdBQW1CeUgsU0FBUyxDQUFDekgsSUFBN0I7QUFDRDs7QUFDRCxRQUFJeUgsU0FBUyxDQUFDTSxLQUFkLEVBQXFCO0FBQ25CZCxNQUFBQSxXQUFXLEdBQUdBLFdBQVcsSUFBSSxFQUE3QjtBQUNBQSxNQUFBQSxXQUFXLENBQUNjLEtBQVosR0FBb0JOLFNBQVMsQ0FBQ00sS0FBOUI7QUFDRDs7QUFDRCxRQUFJTixTQUFTLENBQUNPLElBQWQsRUFBb0I7QUFDbEJmLE1BQUFBLFdBQVcsR0FBR0EsV0FBVyxJQUFJLEVBQTdCO0FBQ0FBLE1BQUFBLFdBQVcsQ0FBQ2UsSUFBWixHQUFtQlAsU0FBUyxDQUFDTyxJQUE3QjtBQUNEOztBQUNELFFBQUlULGFBQWEsQ0FBQ1UsY0FBbEIsRUFBa0M7QUFDaENoQixNQUFBQSxXQUFXLEdBQUdBLFdBQVcsSUFBSSxFQUE3QjtBQUNBQSxNQUFBQSxXQUFXLENBQUNnQixjQUFaLEdBQTZCVixhQUFhLENBQUNVLGNBQTNDO0FBQ0Q7O0FBQ0QsUUFBSVYsYUFBYSxDQUFDVyxxQkFBbEIsRUFBeUM7QUFDdkNqQixNQUFBQSxXQUFXLEdBQUdBLFdBQVcsSUFBSSxFQUE3QjtBQUNBQSxNQUFBQSxXQUFXLENBQUNpQixxQkFBWixHQUNFWCxhQUFhLENBQUNXLHFCQURoQjtBQUVEOztBQUNELFFBQUlYLGFBQWEsQ0FBQ1ksc0JBQWxCLEVBQTBDO0FBQ3hDbEIsTUFBQUEsV0FBVyxHQUFHQSxXQUFXLElBQUksRUFBN0I7QUFDQUEsTUFBQUEsV0FBVyxDQUFDa0Isc0JBQVosR0FDRVosYUFBYSxDQUFDWSxzQkFEaEI7QUFFRDs7QUFDRCxXQUFPO0FBQ0xuQixNQUFBQSxTQURLO0FBRUxDLE1BQUFBO0FBRkssS0FBUDtBQUlELEdBaEVFLEVBaUVIbUIsR0FBRyxJQUFJO0FBQ0wsUUFBSSxPQUFPQSxHQUFQLEtBQWUsUUFBbkIsRUFBNkI7QUFDM0IsWUFBTSxJQUFJbkgsY0FBTXVFLEtBQVYsQ0FBZ0IsQ0FBaEIsRUFBbUI0QyxHQUFuQixDQUFOO0FBQ0QsS0FGRCxNQUVPO0FBQ0wsWUFBTUEsR0FBTjtBQUNEO0FBQ0YsR0F2RUUsQ0FBUDtBQXlFRCxDLENBRUQ7QUFDQTtBQUNBO0FBQ0E7QUFDQTs7O0FBQ08sU0FBU0MsZUFBVCxDQUNMNUYsV0FESyxFQUVMYyxJQUZLLEVBR0xDLFdBSEssRUFJTEMsbUJBSkssRUFLTEMsTUFMSyxFQU1MQyxPQU5LLEVBT0w7QUFDQSxNQUFJLENBQUNILFdBQUwsRUFBa0I7QUFDaEIsV0FBT2tELE9BQU8sQ0FBQzVCLE9BQVIsQ0FBZ0IsRUFBaEIsQ0FBUDtBQUNEOztBQUNELFNBQU8sSUFBSTRCLE9BQUosQ0FBWSxVQUFTNUIsT0FBVCxFQUFrQkMsTUFBbEIsRUFBMEI7QUFDM0MsUUFBSTRCLE9BQU8sR0FBR25FLFVBQVUsQ0FDdEJnQixXQUFXLENBQUNsRCxTQURVLEVBRXRCbUMsV0FGc0IsRUFHdEJpQixNQUFNLENBQUM3QyxhQUhlLENBQXhCO0FBS0EsUUFBSSxDQUFDOEYsT0FBTCxFQUFjLE9BQU83QixPQUFPLEVBQWQ7QUFDZCxRQUFJbEIsT0FBTyxHQUFHTixnQkFBZ0IsQ0FDNUJiLFdBRDRCLEVBRTVCYyxJQUY0QixFQUc1QkMsV0FINEIsRUFJNUJDLG1CQUo0QixFQUs1QkMsTUFMNEIsRUFNNUJDLE9BTjRCLENBQTlCO0FBUUEsUUFBSTtBQUFFcUIsTUFBQUEsT0FBRjtBQUFXTyxNQUFBQTtBQUFYLFFBQXFCVixpQkFBaUIsQ0FDeENqQixPQUR3QyxFQUV4Q0UsTUFBTSxJQUFJO0FBQ1J1QyxNQUFBQSwyQkFBMkIsQ0FDekI1RCxXQUR5QixFQUV6QmUsV0FBVyxDQUFDbEQsU0FGYSxFQUd6QmtELFdBQVcsQ0FBQzRCLE1BQVosRUFIeUIsRUFJekJ0QixNQUp5QixFQUt6QlAsSUFMeUIsQ0FBM0I7O0FBT0EsVUFDRWQsV0FBVyxLQUFLL0QsS0FBSyxDQUFDSSxVQUF0QixJQUNBMkQsV0FBVyxLQUFLL0QsS0FBSyxDQUFDSyxTQUR0QixJQUVBMEQsV0FBVyxLQUFLL0QsS0FBSyxDQUFDTSxZQUZ0QixJQUdBeUQsV0FBVyxLQUFLL0QsS0FBSyxDQUFDTyxXQUp4QixFQUtFO0FBQ0FjLFFBQUFBLE1BQU0sQ0FBQ3NFLE1BQVAsQ0FBY1YsT0FBZCxFQUF1QkMsT0FBTyxDQUFDRCxPQUEvQjtBQUNEOztBQUNEbUIsTUFBQUEsT0FBTyxDQUFDaEIsTUFBRCxDQUFQO0FBQ0QsS0FuQnVDLEVBb0J4Q3lCLEtBQUssSUFBSTtBQUNQaUIsTUFBQUEseUJBQXlCLENBQ3ZCL0QsV0FEdUIsRUFFdkJlLFdBQVcsQ0FBQ2xELFNBRlcsRUFHdkJrRCxXQUFXLENBQUM0QixNQUFaLEVBSHVCLEVBSXZCN0IsSUFKdUIsRUFLdkJnQyxLQUx1QixDQUF6QjtBQU9BUixNQUFBQSxNQUFNLENBQUNRLEtBQUQsQ0FBTjtBQUNELEtBN0J1QyxDQUExQyxDQWYyQyxDQStDM0M7QUFDQTtBQUNBO0FBQ0E7QUFDQTs7QUFDQSxXQUFPbUIsT0FBTyxDQUFDNUIsT0FBUixHQUNKK0IsSUFESSxDQUNDLE1BQU07QUFDVixZQUFNeUIsT0FBTyxHQUFHM0IsT0FBTyxDQUFDL0MsT0FBRCxDQUF2Qjs7QUFDQSxVQUNFbkIsV0FBVyxLQUFLL0QsS0FBSyxDQUFDSyxTQUF0QixJQUNBMEQsV0FBVyxLQUFLL0QsS0FBSyxDQUFDTyxXQUR0QixJQUVBd0QsV0FBVyxLQUFLL0QsS0FBSyxDQUFDRSxVQUh4QixFQUlFO0FBQ0FpSCxRQUFBQSxtQkFBbUIsQ0FDakJwRCxXQURpQixFQUVqQmUsV0FBVyxDQUFDbEQsU0FGSyxFQUdqQmtELFdBQVcsQ0FBQzRCLE1BQVosRUFIaUIsRUFJakI3QixJQUppQixDQUFuQjtBQU1ELE9BYlMsQ0FjVjs7O0FBQ0EsVUFBSWQsV0FBVyxLQUFLL0QsS0FBSyxDQUFDSSxVQUExQixFQUFzQztBQUNwQyxZQUFJd0osT0FBTyxJQUFJLE9BQU9BLE9BQU8sQ0FBQ3pCLElBQWYsS0FBd0IsVUFBdkMsRUFBbUQ7QUFDakQsaUJBQU95QixPQUFPLENBQUN6QixJQUFSLENBQWE1QixRQUFRLElBQUk7QUFDOUI7QUFDQSxnQkFBSUEsUUFBUSxJQUFJQSxRQUFRLENBQUNuQixNQUF6QixFQUFpQztBQUMvQixxQkFBT21CLFFBQVA7QUFDRDs7QUFDRCxtQkFBTyxJQUFQO0FBQ0QsV0FOTSxDQUFQO0FBT0Q7O0FBQ0QsZUFBTyxJQUFQO0FBQ0Q7O0FBRUQsYUFBT3FELE9BQVA7QUFDRCxLQTlCSSxFQStCSnpCLElBL0JJLENBK0JDN0IsT0EvQkQsRUErQlVPLEtBL0JWLENBQVA7QUFnQ0QsR0FwRk0sQ0FBUDtBQXFGRCxDLENBRUQ7QUFDQTs7O0FBQ08sU0FBU2dELE9BQVQsQ0FBaUJDLElBQWpCLEVBQXVCQyxVQUF2QixFQUFtQztBQUN4QyxNQUFJQyxJQUFJLEdBQUcsT0FBT0YsSUFBUCxJQUFlLFFBQWYsR0FBMEJBLElBQTFCLEdBQWlDO0FBQUVsSSxJQUFBQSxTQUFTLEVBQUVrSTtBQUFiLEdBQTVDOztBQUNBLE9BQUssSUFBSXJJLEdBQVQsSUFBZ0JzSSxVQUFoQixFQUE0QjtBQUMxQkMsSUFBQUEsSUFBSSxDQUFDdkksR0FBRCxDQUFKLEdBQVlzSSxVQUFVLENBQUN0SSxHQUFELENBQXRCO0FBQ0Q7O0FBQ0QsU0FBT2MsY0FBTWxCLE1BQU4sQ0FBYTZHLFFBQWIsQ0FBc0I4QixJQUF0QixDQUFQO0FBQ0Q7O0FBRU0sU0FBU0MseUJBQVQsQ0FDTEgsSUFESyxFQUVMM0gsYUFBYSxHQUFHSSxjQUFNSixhQUZqQixFQUdMO0FBQ0EsTUFDRSxDQUFDTCxhQUFELElBQ0EsQ0FBQ0EsYUFBYSxDQUFDSyxhQUFELENBRGQsSUFFQSxDQUFDTCxhQUFhLENBQUNLLGFBQUQsQ0FBYixDQUE2QmhCLFNBSGhDLEVBSUU7QUFDQTtBQUNEOztBQUNEVyxFQUFBQSxhQUFhLENBQUNLLGFBQUQsQ0FBYixDQUE2QmhCLFNBQTdCLENBQXVDeUMsT0FBdkMsQ0FBK0NoQixPQUFPLElBQUlBLE9BQU8sQ0FBQ2tILElBQUQsQ0FBakU7QUFDRDs7QUFFTSxTQUFTSSxvQkFBVCxDQUE4Qm5HLFdBQTlCLEVBQTJDYyxJQUEzQyxFQUFpRHNGLFVBQWpELEVBQTZEbkYsTUFBN0QsRUFBcUU7QUFDMUUsUUFBTUUsT0FBTyxtQ0FDUmlGLFVBRFE7QUFFWGhGLElBQUFBLFdBQVcsRUFBRXBCLFdBRkY7QUFHWHNCLElBQUFBLE1BQU0sRUFBRSxLQUhHO0FBSVhDLElBQUFBLEdBQUcsRUFBRU4sTUFBTSxDQUFDTyxnQkFKRDtBQUtYQyxJQUFBQSxPQUFPLEVBQUVSLE1BQU0sQ0FBQ1EsT0FMTDtBQU1YQyxJQUFBQSxFQUFFLEVBQUVULE1BQU0sQ0FBQ1M7QUFOQSxJQUFiOztBQVNBLE1BQUksQ0FBQ1osSUFBTCxFQUFXO0FBQ1QsV0FBT0ssT0FBUDtBQUNEOztBQUNELE1BQUlMLElBQUksQ0FBQ2UsUUFBVCxFQUFtQjtBQUNqQlYsSUFBQUEsT0FBTyxDQUFDLFFBQUQsQ0FBUCxHQUFvQixJQUFwQjtBQUNEOztBQUNELE1BQUlMLElBQUksQ0FBQ2dCLElBQVQsRUFBZTtBQUNiWCxJQUFBQSxPQUFPLENBQUMsTUFBRCxDQUFQLEdBQWtCTCxJQUFJLENBQUNnQixJQUF2QjtBQUNEOztBQUNELE1BQUloQixJQUFJLENBQUNpQixjQUFULEVBQXlCO0FBQ3ZCWixJQUFBQSxPQUFPLENBQUMsZ0JBQUQsQ0FBUCxHQUE0QkwsSUFBSSxDQUFDaUIsY0FBakM7QUFDRDs7QUFDRCxTQUFPWixPQUFQO0FBQ0Q7O0FBRU0sZUFBZWtGLG1CQUFmLENBQW1DckcsV0FBbkMsRUFBZ0RvRyxVQUFoRCxFQUE0RG5GLE1BQTVELEVBQW9FSCxJQUFwRSxFQUEwRTtBQUMvRSxRQUFNd0YsV0FBVyxHQUFHckcsY0FBYyxDQUFDRCxXQUFELEVBQWNpQixNQUFNLENBQUM3QyxhQUFyQixDQUFsQzs7QUFDQSxNQUFJLE9BQU9rSSxXQUFQLEtBQXVCLFVBQTNCLEVBQXVDO0FBQ3JDLFFBQUk7QUFDRixZQUFNbkYsT0FBTyxHQUFHZ0Ysb0JBQW9CLENBQ2xDbkcsV0FEa0MsRUFFbENjLElBRmtDLEVBR2xDc0YsVUFIa0MsRUFJbENuRixNQUprQyxDQUFwQztBQU1BLFlBQU00QyxNQUFNLEdBQUcsTUFBTXlDLFdBQVcsQ0FBQ25GLE9BQUQsQ0FBaEM7QUFDQXlDLE1BQUFBLDJCQUEyQixDQUN6QjVELFdBRHlCLEVBRXpCLFlBRnlCLGtDQUdwQm9HLFVBQVUsQ0FBQ0csSUFBWCxDQUFnQjVELE1BQWhCLEVBSG9CO0FBR002RCxRQUFBQSxRQUFRLEVBQUVKLFVBQVUsQ0FBQ0k7QUFIM0IsVUFJekIzQyxNQUp5QixFQUt6Qi9DLElBTHlCLENBQTNCO0FBT0EsYUFBTytDLE1BQU0sSUFBSXVDLFVBQWpCO0FBQ0QsS0FoQkQsQ0FnQkUsT0FBT3RELEtBQVAsRUFBYztBQUNkaUIsTUFBQUEseUJBQXlCLENBQ3ZCL0QsV0FEdUIsRUFFdkIsWUFGdUIsa0NBR2xCb0csVUFBVSxDQUFDRyxJQUFYLENBQWdCNUQsTUFBaEIsRUFIa0I7QUFHUTZELFFBQUFBLFFBQVEsRUFBRUosVUFBVSxDQUFDSTtBQUg3QixVQUl2QjFGLElBSnVCLEVBS3ZCZ0MsS0FMdUIsQ0FBekI7QUFPQSxZQUFNQSxLQUFOO0FBQ0Q7QUFDRjs7QUFDRCxTQUFPc0QsVUFBUDtBQUNEIiwic291cmNlc0NvbnRlbnQiOlsiLy8gdHJpZ2dlcnMuanNcbmltcG9ydCBQYXJzZSBmcm9tICdwYXJzZS9ub2RlJztcbmltcG9ydCB7IGxvZ2dlciB9IGZyb20gJy4vbG9nZ2VyJztcblxuZXhwb3J0IGNvbnN0IFR5cGVzID0ge1xuICBiZWZvcmVMb2dpbjogJ2JlZm9yZUxvZ2luJyxcbiAgYWZ0ZXJMb2dpbjogJ2FmdGVyTG9naW4nLFxuICBhZnRlckxvZ291dDogJ2FmdGVyTG9nb3V0JyxcbiAgYmVmb3JlU2F2ZTogJ2JlZm9yZVNhdmUnLFxuICBhZnRlclNhdmU6ICdhZnRlclNhdmUnLFxuICBiZWZvcmVEZWxldGU6ICdiZWZvcmVEZWxldGUnLFxuICBhZnRlckRlbGV0ZTogJ2FmdGVyRGVsZXRlJyxcbiAgYmVmb3JlRmluZDogJ2JlZm9yZUZpbmQnLFxuICBhZnRlckZpbmQ6ICdhZnRlckZpbmQnLFxuICBiZWZvcmVTYXZlRmlsZTogJ2JlZm9yZVNhdmVGaWxlJyxcbiAgYWZ0ZXJTYXZlRmlsZTogJ2FmdGVyU2F2ZUZpbGUnLFxuICBiZWZvcmVEZWxldGVGaWxlOiAnYmVmb3JlRGVsZXRlRmlsZScsXG4gIGFmdGVyRGVsZXRlRmlsZTogJ2FmdGVyRGVsZXRlRmlsZScsXG59O1xuXG5jb25zdCBGaWxlQ2xhc3NOYW1lID0gJ0BGaWxlJztcblxuY29uc3QgYmFzZVN0b3JlID0gZnVuY3Rpb24oKSB7XG4gIGNvbnN0IFZhbGlkYXRvcnMgPSB7fTtcbiAgY29uc3QgRnVuY3Rpb25zID0ge307XG4gIGNvbnN0IEpvYnMgPSB7fTtcbiAgY29uc3QgTGl2ZVF1ZXJ5ID0gW107XG4gIGNvbnN0IFRyaWdnZXJzID0gT2JqZWN0LmtleXMoVHlwZXMpLnJlZHVjZShmdW5jdGlvbihiYXNlLCBrZXkpIHtcbiAgICBiYXNlW2tleV0gPSB7fTtcbiAgICByZXR1cm4gYmFzZTtcbiAgfSwge30pO1xuXG4gIHJldHVybiBPYmplY3QuZnJlZXplKHtcbiAgICBGdW5jdGlvbnMsXG4gICAgSm9icyxcbiAgICBWYWxpZGF0b3JzLFxuICAgIFRyaWdnZXJzLFxuICAgIExpdmVRdWVyeSxcbiAgfSk7XG59O1xuXG5mdW5jdGlvbiB2YWxpZGF0ZUNsYXNzTmFtZUZvclRyaWdnZXJzKGNsYXNzTmFtZSwgdHlwZSkge1xuICBpZiAodHlwZSA9PSBUeXBlcy5iZWZvcmVTYXZlICYmIGNsYXNzTmFtZSA9PT0gJ19QdXNoU3RhdHVzJykge1xuICAgIC8vIF9QdXNoU3RhdHVzIHVzZXMgdW5kb2N1bWVudGVkIG5lc3RlZCBrZXkgaW5jcmVtZW50IG9wc1xuICAgIC8vIGFsbG93aW5nIGJlZm9yZVNhdmUgd291bGQgbWVzcyB1cCB0aGUgb2JqZWN0cyBiaWcgdGltZVxuICAgIC8vIFRPRE86IEFsbG93IHByb3BlciBkb2N1bWVudGVkIHdheSBvZiB1c2luZyBuZXN0ZWQgaW5jcmVtZW50IG9wc1xuICAgIHRocm93ICdPbmx5IGFmdGVyU2F2ZSBpcyBhbGxvd2VkIG9uIF9QdXNoU3RhdHVzJztcbiAgfVxuICBpZiAoXG4gICAgKHR5cGUgPT09IFR5cGVzLmJlZm9yZUxvZ2luIHx8IHR5cGUgPT09IFR5cGVzLmFmdGVyTG9naW4pICYmXG4gICAgY2xhc3NOYW1lICE9PSAnX1VzZXInXG4gICkge1xuICAgIC8vIFRPRE86IGNoZWNrIGlmIHVwc3RyZWFtIGNvZGUgd2lsbCBoYW5kbGUgYEVycm9yYCBpbnN0YW5jZSByYXRoZXJcbiAgICAvLyB0aGFuIHRoaXMgYW50aS1wYXR0ZXJuIG9mIHRocm93aW5nIHN0cmluZ3NcbiAgICB0aHJvdyAnT25seSB0aGUgX1VzZXIgY2xhc3MgaXMgYWxsb3dlZCBmb3IgdGhlIGJlZm9yZUxvZ2luIGFuZCBhZnRlckxvZ2luIHRyaWdnZXJzJztcbiAgfVxuICBpZiAodHlwZSA9PT0gVHlwZXMuYWZ0ZXJMb2dvdXQgJiYgY2xhc3NOYW1lICE9PSAnX1Nlc3Npb24nKSB7XG4gICAgLy8gVE9ETzogY2hlY2sgaWYgdXBzdHJlYW0gY29kZSB3aWxsIGhhbmRsZSBgRXJyb3JgIGluc3RhbmNlIHJhdGhlclxuICAgIC8vIHRoYW4gdGhpcyBhbnRpLXBhdHRlcm4gb2YgdGhyb3dpbmcgc3RyaW5nc1xuICAgIHRocm93ICdPbmx5IHRoZSBfU2Vzc2lvbiBjbGFzcyBpcyBhbGxvd2VkIGZvciB0aGUgYWZ0ZXJMb2dvdXQgdHJpZ2dlci4nO1xuICB9XG4gIGlmIChjbGFzc05hbWUgPT09ICdfU2Vzc2lvbicgJiYgdHlwZSAhPT0gVHlwZXMuYWZ0ZXJMb2dvdXQpIHtcbiAgICAvLyBUT0RPOiBjaGVjayBpZiB1cHN0cmVhbSBjb2RlIHdpbGwgaGFuZGxlIGBFcnJvcmAgaW5zdGFuY2UgcmF0aGVyXG4gICAgLy8gdGhhbiB0aGlzIGFudGktcGF0dGVybiBvZiB0aHJvd2luZyBzdHJpbmdzXG4gICAgdGhyb3cgJ09ubHkgdGhlIGFmdGVyTG9nb3V0IHRyaWdnZXIgaXMgYWxsb3dlZCBmb3IgdGhlIF9TZXNzaW9uIGNsYXNzLic7XG4gIH1cbiAgcmV0dXJuIGNsYXNzTmFtZTtcbn1cblxuY29uc3QgX3RyaWdnZXJTdG9yZSA9IHt9O1xuXG5jb25zdCBDYXRlZ29yeSA9IHtcbiAgRnVuY3Rpb25zOiAnRnVuY3Rpb25zJyxcbiAgVmFsaWRhdG9yczogJ1ZhbGlkYXRvcnMnLFxuICBKb2JzOiAnSm9icycsXG4gIFRyaWdnZXJzOiAnVHJpZ2dlcnMnLFxufTtcblxuZnVuY3Rpb24gZ2V0U3RvcmUoY2F0ZWdvcnksIG5hbWUsIGFwcGxpY2F0aW9uSWQpIHtcbiAgY29uc3QgcGF0aCA9IG5hbWUuc3BsaXQoJy4nKTtcbiAgcGF0aC5zcGxpY2UoLTEpOyAvLyByZW1vdmUgbGFzdCBjb21wb25lbnRcbiAgYXBwbGljYXRpb25JZCA9IGFwcGxpY2F0aW9uSWQgfHwgUGFyc2UuYXBwbGljYXRpb25JZDtcbiAgX3RyaWdnZXJTdG9yZVthcHBsaWNhdGlvbklkXSA9IF90cmlnZ2VyU3RvcmVbYXBwbGljYXRpb25JZF0gfHwgYmFzZVN0b3JlKCk7XG4gIGxldCBzdG9yZSA9IF90cmlnZ2VyU3RvcmVbYXBwbGljYXRpb25JZF1bY2F0ZWdvcnldO1xuICBmb3IgKGNvbnN0IGNvbXBvbmVudCBvZiBwYXRoKSB7XG4gICAgc3RvcmUgPSBzdG9yZVtjb21wb25lbnRdO1xuICAgIGlmICghc3RvcmUpIHtcbiAgICAgIHJldHVybiB1bmRlZmluZWQ7XG4gICAgfVxuICB9XG4gIHJldHVybiBzdG9yZTtcbn1cblxuZnVuY3Rpb24gYWRkKGNhdGVnb3J5LCBuYW1lLCBoYW5kbGVyLCBhcHBsaWNhdGlvbklkKSB7XG4gIGNvbnN0IGxhc3RDb21wb25lbnQgPSBuYW1lLnNwbGl0KCcuJykuc3BsaWNlKC0xKTtcbiAgY29uc3Qgc3RvcmUgPSBnZXRTdG9yZShjYXRlZ29yeSwgbmFtZSwgYXBwbGljYXRpb25JZCk7XG4gIHN0b3JlW2xhc3RDb21wb25lbnRdID0gaGFuZGxlcjtcbn1cblxuZnVuY3Rpb24gcmVtb3ZlKGNhdGVnb3J5LCBuYW1lLCBhcHBsaWNhdGlvbklkKSB7XG4gIGNvbnN0IGxhc3RDb21wb25lbnQgPSBuYW1lLnNwbGl0KCcuJykuc3BsaWNlKC0xKTtcbiAgY29uc3Qgc3RvcmUgPSBnZXRTdG9yZShjYXRlZ29yeSwgbmFtZSwgYXBwbGljYXRpb25JZCk7XG4gIGRlbGV0ZSBzdG9yZVtsYXN0Q29tcG9uZW50XTtcbn1cblxuZnVuY3Rpb24gZ2V0KGNhdGVnb3J5LCBuYW1lLCBhcHBsaWNhdGlvbklkKSB7XG4gIGNvbnN0IGxhc3RDb21wb25lbnQgPSBuYW1lLnNwbGl0KCcuJykuc3BsaWNlKC0xKTtcbiAgY29uc3Qgc3RvcmUgPSBnZXRTdG9yZShjYXRlZ29yeSwgbmFtZSwgYXBwbGljYXRpb25JZCk7XG4gIHJldHVybiBzdG9yZVtsYXN0Q29tcG9uZW50XTtcbn1cblxuZXhwb3J0IGZ1bmN0aW9uIGFkZEZ1bmN0aW9uKFxuICBmdW5jdGlvbk5hbWUsXG4gIGhhbmRsZXIsXG4gIHZhbGlkYXRpb25IYW5kbGVyLFxuICBhcHBsaWNhdGlvbklkXG4pIHtcbiAgYWRkKENhdGVnb3J5LkZ1bmN0aW9ucywgZnVuY3Rpb25OYW1lLCBoYW5kbGVyLCBhcHBsaWNhdGlvbklkKTtcbiAgYWRkKENhdGVnb3J5LlZhbGlkYXRvcnMsIGZ1bmN0aW9uTmFtZSwgdmFsaWRhdGlvbkhhbmRsZXIsIGFwcGxpY2F0aW9uSWQpO1xufVxuXG5leHBvcnQgZnVuY3Rpb24gYWRkSm9iKGpvYk5hbWUsIGhhbmRsZXIsIGFwcGxpY2F0aW9uSWQpIHtcbiAgYWRkKENhdGVnb3J5LkpvYnMsIGpvYk5hbWUsIGhhbmRsZXIsIGFwcGxpY2F0aW9uSWQpO1xufVxuXG5leHBvcnQgZnVuY3Rpb24gYWRkVHJpZ2dlcih0eXBlLCBjbGFzc05hbWUsIGhhbmRsZXIsIGFwcGxpY2F0aW9uSWQpIHtcbiAgdmFsaWRhdGVDbGFzc05hbWVGb3JUcmlnZ2VycyhjbGFzc05hbWUsIHR5cGUpO1xuICBhZGQoQ2F0ZWdvcnkuVHJpZ2dlcnMsIGAke3R5cGV9LiR7Y2xhc3NOYW1lfWAsIGhhbmRsZXIsIGFwcGxpY2F0aW9uSWQpO1xufVxuXG5leHBvcnQgZnVuY3Rpb24gYWRkRmlsZVRyaWdnZXIodHlwZSwgaGFuZGxlciwgYXBwbGljYXRpb25JZCkge1xuICBhZGQoQ2F0ZWdvcnkuVHJpZ2dlcnMsIGAke3R5cGV9LiR7RmlsZUNsYXNzTmFtZX1gLCBoYW5kbGVyLCBhcHBsaWNhdGlvbklkKTtcbn1cblxuZXhwb3J0IGZ1bmN0aW9uIGFkZExpdmVRdWVyeUV2ZW50SGFuZGxlcihoYW5kbGVyLCBhcHBsaWNhdGlvbklkKSB7XG4gIGFwcGxpY2F0aW9uSWQgPSBhcHBsaWNhdGlvbklkIHx8IFBhcnNlLmFwcGxpY2F0aW9uSWQ7XG4gIF90cmlnZ2VyU3RvcmVbYXBwbGljYXRpb25JZF0gPSBfdHJpZ2dlclN0b3JlW2FwcGxpY2F0aW9uSWRdIHx8IGJhc2VTdG9yZSgpO1xuICBfdHJpZ2dlclN0b3JlW2FwcGxpY2F0aW9uSWRdLkxpdmVRdWVyeS5wdXNoKGhhbmRsZXIpO1xufVxuXG5leHBvcnQgZnVuY3Rpb24gcmVtb3ZlRnVuY3Rpb24oZnVuY3Rpb25OYW1lLCBhcHBsaWNhdGlvbklkKSB7XG4gIHJlbW92ZShDYXRlZ29yeS5GdW5jdGlvbnMsIGZ1bmN0aW9uTmFtZSwgYXBwbGljYXRpb25JZCk7XG59XG5cbmV4cG9ydCBmdW5jdGlvbiByZW1vdmVUcmlnZ2VyKHR5cGUsIGNsYXNzTmFtZSwgYXBwbGljYXRpb25JZCkge1xuICByZW1vdmUoQ2F0ZWdvcnkuVHJpZ2dlcnMsIGAke3R5cGV9LiR7Y2xhc3NOYW1lfWAsIGFwcGxpY2F0aW9uSWQpO1xufVxuXG5leHBvcnQgZnVuY3Rpb24gX3VucmVnaXN0ZXJBbGwoKSB7XG4gIE9iamVjdC5rZXlzKF90cmlnZ2VyU3RvcmUpLmZvckVhY2goYXBwSWQgPT4gZGVsZXRlIF90cmlnZ2VyU3RvcmVbYXBwSWRdKTtcbn1cblxuZXhwb3J0IGZ1bmN0aW9uIGdldFRyaWdnZXIoY2xhc3NOYW1lLCB0cmlnZ2VyVHlwZSwgYXBwbGljYXRpb25JZCkge1xuICBpZiAoIWFwcGxpY2F0aW9uSWQpIHtcbiAgICB0aHJvdyAnTWlzc2luZyBBcHBsaWNhdGlvbklEJztcbiAgfVxuICByZXR1cm4gZ2V0KENhdGVnb3J5LlRyaWdnZXJzLCBgJHt0cmlnZ2VyVHlwZX0uJHtjbGFzc05hbWV9YCwgYXBwbGljYXRpb25JZCk7XG59XG5cbmV4cG9ydCBmdW5jdGlvbiBnZXRGaWxlVHJpZ2dlcih0eXBlLCBhcHBsaWNhdGlvbklkKSB7XG4gIHJldHVybiBnZXRUcmlnZ2VyKEZpbGVDbGFzc05hbWUsIHR5cGUsIGFwcGxpY2F0aW9uSWQpO1xufVxuXG5leHBvcnQgZnVuY3Rpb24gdHJpZ2dlckV4aXN0cyhcbiAgY2xhc3NOYW1lOiBzdHJpbmcsXG4gIHR5cGU6IHN0cmluZyxcbiAgYXBwbGljYXRpb25JZDogc3RyaW5nXG4pOiBib29sZWFuIHtcbiAgcmV0dXJuIGdldFRyaWdnZXIoY2xhc3NOYW1lLCB0eXBlLCBhcHBsaWNhdGlvbklkKSAhPSB1bmRlZmluZWQ7XG59XG5cbmV4cG9ydCBmdW5jdGlvbiBnZXRGdW5jdGlvbihmdW5jdGlvbk5hbWUsIGFwcGxpY2F0aW9uSWQpIHtcbiAgcmV0dXJuIGdldChDYXRlZ29yeS5GdW5jdGlvbnMsIGZ1bmN0aW9uTmFtZSwgYXBwbGljYXRpb25JZCk7XG59XG5cbmV4cG9ydCBmdW5jdGlvbiBnZXRGdW5jdGlvbk5hbWVzKGFwcGxpY2F0aW9uSWQpIHtcbiAgY29uc3Qgc3RvcmUgPVxuICAgIChfdHJpZ2dlclN0b3JlW2FwcGxpY2F0aW9uSWRdICYmXG4gICAgICBfdHJpZ2dlclN0b3JlW2FwcGxpY2F0aW9uSWRdW0NhdGVnb3J5LkZ1bmN0aW9uc10pIHx8XG4gICAge307XG4gIGNvbnN0IGZ1bmN0aW9uTmFtZXMgPSBbXTtcbiAgY29uc3QgZXh0cmFjdEZ1bmN0aW9uTmFtZXMgPSAobmFtZXNwYWNlLCBzdG9yZSkgPT4ge1xuICAgIE9iamVjdC5rZXlzKHN0b3JlKS5mb3JFYWNoKG5hbWUgPT4ge1xuICAgICAgY29uc3QgdmFsdWUgPSBzdG9yZVtuYW1lXTtcbiAgICAgIGlmIChuYW1lc3BhY2UpIHtcbiAgICAgICAgbmFtZSA9IGAke25hbWVzcGFjZX0uJHtuYW1lfWA7XG4gICAgICB9XG4gICAgICBpZiAodHlwZW9mIHZhbHVlID09PSAnZnVuY3Rpb24nKSB7XG4gICAgICAgIGZ1bmN0aW9uTmFtZXMucHVzaChuYW1lKTtcbiAgICAgIH0gZWxzZSB7XG4gICAgICAgIGV4dHJhY3RGdW5jdGlvbk5hbWVzKG5hbWUsIHZhbHVlKTtcbiAgICAgIH1cbiAgICB9KTtcbiAgfTtcbiAgZXh0cmFjdEZ1bmN0aW9uTmFtZXMobnVsbCwgc3RvcmUpO1xuICByZXR1cm4gZnVuY3Rpb25OYW1lcztcbn1cblxuZXhwb3J0IGZ1bmN0aW9uIGdldEpvYihqb2JOYW1lLCBhcHBsaWNhdGlvbklkKSB7XG4gIHJldHVybiBnZXQoQ2F0ZWdvcnkuSm9icywgam9iTmFtZSwgYXBwbGljYXRpb25JZCk7XG59XG5cbmV4cG9ydCBmdW5jdGlvbiBnZXRKb2JzKGFwcGxpY2F0aW9uSWQpIHtcbiAgdmFyIG1hbmFnZXIgPSBfdHJpZ2dlclN0b3JlW2FwcGxpY2F0aW9uSWRdO1xuICBpZiAobWFuYWdlciAmJiBtYW5hZ2VyLkpvYnMpIHtcbiAgICByZXR1cm4gbWFuYWdlci5Kb2JzO1xuICB9XG4gIHJldHVybiB1bmRlZmluZWQ7XG59XG5cbmV4cG9ydCBmdW5jdGlvbiBnZXRWYWxpZGF0b3IoZnVuY3Rpb25OYW1lLCBhcHBsaWNhdGlvbklkKSB7XG4gIHJldHVybiBnZXQoQ2F0ZWdvcnkuVmFsaWRhdG9ycywgZnVuY3Rpb25OYW1lLCBhcHBsaWNhdGlvbklkKTtcbn1cblxuZXhwb3J0IGZ1bmN0aW9uIGdldFJlcXVlc3RPYmplY3QoXG4gIHRyaWdnZXJUeXBlLFxuICBhdXRoLFxuICBwYXJzZU9iamVjdCxcbiAgb3JpZ2luYWxQYXJzZU9iamVjdCxcbiAgY29uZmlnLFxuICBjb250ZXh0XG4pIHtcbiAgY29uc3QgcmVxdWVzdCA9IHtcbiAgICB0cmlnZ2VyTmFtZTogdHJpZ2dlclR5cGUsXG4gICAgb2JqZWN0OiBwYXJzZU9iamVjdCxcbiAgICBtYXN0ZXI6IGZhbHNlLFxuICAgIGxvZzogY29uZmlnLmxvZ2dlckNvbnRyb2xsZXIsXG4gICAgaGVhZGVyczogY29uZmlnLmhlYWRlcnMsXG4gICAgaXA6IGNvbmZpZy5pcCxcbiAgfTtcblxuICBpZiAob3JpZ2luYWxQYXJzZU9iamVjdCkge1xuICAgIHJlcXVlc3Qub3JpZ2luYWwgPSBvcmlnaW5hbFBhcnNlT2JqZWN0O1xuICB9XG5cbiAgaWYgKHRyaWdnZXJUeXBlID09PSBUeXBlcy5iZWZvcmVTYXZlIHx8XG4gICAgdHJpZ2dlclR5cGUgPT09IFR5cGVzLmFmdGVyU2F2ZSB8fFxuICAgIHRyaWdnZXJUeXBlID09PSBUeXBlcy5iZWZvcmVEZWxldGUgfHxcbiAgICB0cmlnZ2VyVHlwZSA9PT0gVHlwZXMuYWZ0ZXJEZWxldGUpIHtcbiAgICAvLyBTZXQgYSBjb3B5IG9mIHRoZSBjb250ZXh0IG9uIHRoZSByZXF1ZXN0IG9iamVjdC5cbiAgICByZXF1ZXN0LmNvbnRleHQgPSBPYmplY3QuYXNzaWduKHt9LCBjb250ZXh0KTtcbiAgfVxuXG4gIGlmICghYXV0aCkge1xuICAgIHJldHVybiByZXF1ZXN0O1xuICB9XG4gIGlmIChhdXRoLmlzTWFzdGVyKSB7XG4gICAgcmVxdWVzdFsnbWFzdGVyJ10gPSB0cnVlO1xuICB9XG4gIGlmIChhdXRoLnVzZXIpIHtcbiAgICByZXF1ZXN0Wyd1c2VyJ10gPSBhdXRoLnVzZXI7XG4gIH1cbiAgaWYgKGF1dGguaW5zdGFsbGF0aW9uSWQpIHtcbiAgICByZXF1ZXN0WydpbnN0YWxsYXRpb25JZCddID0gYXV0aC5pbnN0YWxsYXRpb25JZDtcbiAgfVxuICByZXR1cm4gcmVxdWVzdDtcbn1cblxuZXhwb3J0IGZ1bmN0aW9uIGdldFJlcXVlc3RRdWVyeU9iamVjdChcbiAgdHJpZ2dlclR5cGUsXG4gIGF1dGgsXG4gIHF1ZXJ5LFxuICBjb3VudCxcbiAgY29uZmlnLFxuICBjb250ZXh0LFxuICBpc0dldFxuKSB7XG4gIGlzR2V0ID0gISFpc0dldDtcblxuICB2YXIgcmVxdWVzdCA9IHtcbiAgICB0cmlnZ2VyTmFtZTogdHJpZ2dlclR5cGUsXG4gICAgcXVlcnksXG4gICAgbWFzdGVyOiBmYWxzZSxcbiAgICBjb3VudCxcbiAgICBsb2c6IGNvbmZpZy5sb2dnZXJDb250cm9sbGVyLFxuICAgIGlzR2V0LFxuICAgIGhlYWRlcnM6IGNvbmZpZy5oZWFkZXJzLFxuICAgIGlwOiBjb25maWcuaXAsXG4gICAgY29udGV4dDogY29udGV4dCB8fCB7fSxcbiAgfTtcblxuICBpZiAoIWF1dGgpIHtcbiAgICByZXR1cm4gcmVxdWVzdDtcbiAgfVxuICBpZiAoYXV0aC5pc01hc3Rlcikge1xuICAgIHJlcXVlc3RbJ21hc3RlciddID0gdHJ1ZTtcbiAgfVxuICBpZiAoYXV0aC51c2VyKSB7XG4gICAgcmVxdWVzdFsndXNlciddID0gYXV0aC51c2VyO1xuICB9XG4gIGlmIChhdXRoLmluc3RhbGxhdGlvbklkKSB7XG4gICAgcmVxdWVzdFsnaW5zdGFsbGF0aW9uSWQnXSA9IGF1dGguaW5zdGFsbGF0aW9uSWQ7XG4gIH1cbiAgcmV0dXJuIHJlcXVlc3Q7XG59XG5cbi8vIENyZWF0ZXMgdGhlIHJlc3BvbnNlIG9iamVjdCwgYW5kIHVzZXMgdGhlIHJlcXVlc3Qgb2JqZWN0IHRvIHBhc3MgZGF0YVxuLy8gVGhlIEFQSSB3aWxsIGNhbGwgdGhpcyB3aXRoIFJFU1QgQVBJIGZvcm1hdHRlZCBvYmplY3RzLCB0aGlzIHdpbGxcbi8vIHRyYW5zZm9ybSB0aGVtIHRvIFBhcnNlLk9iamVjdCBpbnN0YW5jZXMgZXhwZWN0ZWQgYnkgQ2xvdWQgQ29kZS5cbi8vIEFueSBjaGFuZ2VzIG1hZGUgdG8gdGhlIG9iamVjdCBpbiBhIGJlZm9yZVNhdmUgd2lsbCBiZSBpbmNsdWRlZC5cbmV4cG9ydCBmdW5jdGlvbiBnZXRSZXNwb25zZU9iamVjdChyZXF1ZXN0LCByZXNvbHZlLCByZWplY3QpIHtcbiAgcmV0dXJuIHtcbiAgICBzdWNjZXNzOiBmdW5jdGlvbihyZXNwb25zZSkge1xuICAgICAgaWYgKHJlcXVlc3QudHJpZ2dlck5hbWUgPT09IFR5cGVzLmFmdGVyRmluZCkge1xuICAgICAgICBpZiAoIXJlc3BvbnNlKSB7XG4gICAgICAgICAgcmVzcG9uc2UgPSByZXF1ZXN0Lm9iamVjdHM7XG4gICAgICAgIH1cbiAgICAgICAgcmVzcG9uc2UgPSByZXNwb25zZS5tYXAob2JqZWN0ID0+IHtcbiAgICAgICAgICByZXR1cm4gb2JqZWN0LnRvSlNPTigpO1xuICAgICAgICB9KTtcbiAgICAgICAgcmV0dXJuIHJlc29sdmUocmVzcG9uc2UpO1xuICAgICAgfVxuICAgICAgLy8gVXNlIHRoZSBKU09OIHJlc3BvbnNlXG4gICAgICBpZiAoXG4gICAgICAgIHJlc3BvbnNlICYmXG4gICAgICAgIHR5cGVvZiByZXNwb25zZSA9PT0gJ29iamVjdCcgJiZcbiAgICAgICAgIXJlcXVlc3Qub2JqZWN0LmVxdWFscyhyZXNwb25zZSkgJiZcbiAgICAgICAgcmVxdWVzdC50cmlnZ2VyTmFtZSA9PT0gVHlwZXMuYmVmb3JlU2F2ZVxuICAgICAgKSB7XG4gICAgICAgIHJldHVybiByZXNvbHZlKHJlc3BvbnNlKTtcbiAgICAgIH1cbiAgICAgIGlmIChcbiAgICAgICAgcmVzcG9uc2UgJiZcbiAgICAgICAgdHlwZW9mIHJlc3BvbnNlID09PSAnb2JqZWN0JyAmJlxuICAgICAgICByZXF1ZXN0LnRyaWdnZXJOYW1lID09PSBUeXBlcy5hZnRlclNhdmVcbiAgICAgICkge1xuICAgICAgICByZXR1cm4gcmVzb2x2ZShyZXNwb25zZSk7XG4gICAgICB9XG4gICAgICBpZiAocmVxdWVzdC50cmlnZ2VyTmFtZSA9PT0gVHlwZXMuYWZ0ZXJTYXZlKSB7XG4gICAgICAgIHJldHVybiByZXNvbHZlKCk7XG4gICAgICB9XG4gICAgICByZXNwb25zZSA9IHt9O1xuICAgICAgaWYgKHJlcXVlc3QudHJpZ2dlck5hbWUgPT09IFR5cGVzLmJlZm9yZVNhdmUpIHtcbiAgICAgICAgcmVzcG9uc2VbJ29iamVjdCddID0gcmVxdWVzdC5vYmplY3QuX2dldFNhdmVKU09OKCk7XG4gICAgICB9XG4gICAgICByZXR1cm4gcmVzb2x2ZShyZXNwb25zZSk7XG4gICAgfSxcbiAgICBlcnJvcjogZnVuY3Rpb24oZXJyb3IpIHtcbiAgICAgIGlmIChlcnJvciBpbnN0YW5jZW9mIFBhcnNlLkVycm9yKSB7XG4gICAgICAgIHJlamVjdChlcnJvcik7XG4gICAgICB9IGVsc2UgaWYgKGVycm9yIGluc3RhbmNlb2YgRXJyb3IpIHtcbiAgICAgICAgcmVqZWN0KG5ldyBQYXJzZS5FcnJvcihQYXJzZS5FcnJvci5TQ1JJUFRfRkFJTEVELCBlcnJvci5tZXNzYWdlKSk7XG4gICAgICB9IGVsc2Uge1xuICAgICAgICByZWplY3QobmV3IFBhcnNlLkVycm9yKFBhcnNlLkVycm9yLlNDUklQVF9GQUlMRUQsIGVycm9yKSk7XG4gICAgICB9XG4gICAgfSxcbiAgfTtcbn1cblxuZnVuY3Rpb24gdXNlcklkRm9yTG9nKGF1dGgpIHtcbiAgcmV0dXJuIGF1dGggJiYgYXV0aC51c2VyID8gYXV0aC51c2VyLmlkIDogdW5kZWZpbmVkO1xufVxuXG5mdW5jdGlvbiBsb2dUcmlnZ2VyQWZ0ZXJIb29rKHRyaWdnZXJUeXBlLCBjbGFzc05hbWUsIGlucHV0LCBhdXRoKSB7XG4gIGNvbnN0IGNsZWFuSW5wdXQgPSBsb2dnZXIudHJ1bmNhdGVMb2dNZXNzYWdlKEpTT04uc3RyaW5naWZ5KGlucHV0KSk7XG4gIGxvZ2dlci5pbmZvKFxuICAgIGAke3RyaWdnZXJUeXBlfSB0cmlnZ2VyZWQgZm9yICR7Y2xhc3NOYW1lfSBmb3IgdXNlciAke3VzZXJJZEZvckxvZyhcbiAgICAgIGF1dGhcbiAgICApfTpcXG4gIElucHV0OiAke2NsZWFuSW5wdXR9YCxcbiAgICB7XG4gICAgICBjbGFzc05hbWUsXG4gICAgICB0cmlnZ2VyVHlwZSxcbiAgICAgIHVzZXI6IHVzZXJJZEZvckxvZyhhdXRoKSxcbiAgICB9XG4gICk7XG59XG5cbmZ1bmN0aW9uIGxvZ1RyaWdnZXJTdWNjZXNzQmVmb3JlSG9vayhcbiAgdHJpZ2dlclR5cGUsXG4gIGNsYXNzTmFtZSxcbiAgaW5wdXQsXG4gIHJlc3VsdCxcbiAgYXV0aFxuKSB7XG4gIGNvbnN0IGNsZWFuSW5wdXQgPSBsb2dnZXIudHJ1bmNhdGVMb2dNZXNzYWdlKEpTT04uc3RyaW5naWZ5KGlucHV0KSk7XG4gIGNvbnN0IGNsZWFuUmVzdWx0ID0gbG9nZ2VyLnRydW5jYXRlTG9nTWVzc2FnZShKU09OLnN0cmluZ2lmeShyZXN1bHQpKTtcbiAgbG9nZ2VyLmluZm8oXG4gICAgYCR7dHJpZ2dlclR5cGV9IHRyaWdnZXJlZCBmb3IgJHtjbGFzc05hbWV9IGZvciB1c2VyICR7dXNlcklkRm9yTG9nKFxuICAgICAgYXV0aFxuICAgICl9OlxcbiAgSW5wdXQ6ICR7Y2xlYW5JbnB1dH1cXG4gIFJlc3VsdDogJHtjbGVhblJlc3VsdH1gLFxuICAgIHtcbiAgICAgIGNsYXNzTmFtZSxcbiAgICAgIHRyaWdnZXJUeXBlLFxuICAgICAgdXNlcjogdXNlcklkRm9yTG9nKGF1dGgpLFxuICAgIH1cbiAgKTtcbn1cblxuZnVuY3Rpb24gbG9nVHJpZ2dlckVycm9yQmVmb3JlSG9vayh0cmlnZ2VyVHlwZSwgY2xhc3NOYW1lLCBpbnB1dCwgYXV0aCwgZXJyb3IpIHtcbiAgY29uc3QgY2xlYW5JbnB1dCA9IGxvZ2dlci50cnVuY2F0ZUxvZ01lc3NhZ2UoSlNPTi5zdHJpbmdpZnkoaW5wdXQpKTtcbiAgbG9nZ2VyLmVycm9yKFxuICAgIGAke3RyaWdnZXJUeXBlfSBmYWlsZWQgZm9yICR7Y2xhc3NOYW1lfSBmb3IgdXNlciAke3VzZXJJZEZvckxvZyhcbiAgICAgIGF1dGhcbiAgICApfTpcXG4gIElucHV0OiAke2NsZWFuSW5wdXR9XFxuICBFcnJvcjogJHtKU09OLnN0cmluZ2lmeShlcnJvcil9YCxcbiAgICB7XG4gICAgICBjbGFzc05hbWUsXG4gICAgICB0cmlnZ2VyVHlwZSxcbiAgICAgIGVycm9yLFxuICAgICAgdXNlcjogdXNlcklkRm9yTG9nKGF1dGgpLFxuICAgIH1cbiAgKTtcbn1cblxuZXhwb3J0IGZ1bmN0aW9uIG1heWJlUnVuQWZ0ZXJGaW5kVHJpZ2dlcihcbiAgdHJpZ2dlclR5cGUsXG4gIGF1dGgsXG4gIGNsYXNzTmFtZSxcbiAgb2JqZWN0cyxcbiAgY29uZmlnXG4pIHtcbiAgcmV0dXJuIG5ldyBQcm9taXNlKChyZXNvbHZlLCByZWplY3QpID0+IHtcbiAgICBjb25zdCB0cmlnZ2VyID0gZ2V0VHJpZ2dlcihjbGFzc05hbWUsIHRyaWdnZXJUeXBlLCBjb25maWcuYXBwbGljYXRpb25JZCk7XG4gICAgaWYgKCF0cmlnZ2VyKSB7XG4gICAgICByZXR1cm4gcmVzb2x2ZSgpO1xuICAgIH1cbiAgICBjb25zdCByZXF1ZXN0ID0gZ2V0UmVxdWVzdE9iamVjdCh0cmlnZ2VyVHlwZSwgYXV0aCwgbnVsbCwgbnVsbCwgY29uZmlnKTtcbiAgICBjb25zdCB7IHN1Y2Nlc3MsIGVycm9yIH0gPSBnZXRSZXNwb25zZU9iamVjdChcbiAgICAgIHJlcXVlc3QsXG4gICAgICBvYmplY3QgPT4ge1xuICAgICAgICByZXNvbHZlKG9iamVjdCk7XG4gICAgICB9LFxuICAgICAgZXJyb3IgPT4ge1xuICAgICAgICByZWplY3QoZXJyb3IpO1xuICAgICAgfVxuICAgICk7XG4gICAgbG9nVHJpZ2dlclN1Y2Nlc3NCZWZvcmVIb29rKFxuICAgICAgdHJpZ2dlclR5cGUsXG4gICAgICBjbGFzc05hbWUsXG4gICAgICAnQWZ0ZXJGaW5kJyxcbiAgICAgIEpTT04uc3RyaW5naWZ5KG9iamVjdHMpLFxuICAgICAgYXV0aFxuICAgICk7XG4gICAgcmVxdWVzdC5vYmplY3RzID0gb2JqZWN0cy5tYXAob2JqZWN0ID0+IHtcbiAgICAgIC8vc2V0dGluZyB0aGUgY2xhc3MgbmFtZSB0byB0cmFuc2Zvcm0gaW50byBwYXJzZSBvYmplY3RcbiAgICAgIG9iamVjdC5jbGFzc05hbWUgPSBjbGFzc05hbWU7XG4gICAgICByZXR1cm4gUGFyc2UuT2JqZWN0LmZyb21KU09OKG9iamVjdCk7XG4gICAgfSk7XG4gICAgcmV0dXJuIFByb21pc2UucmVzb2x2ZSgpXG4gICAgICAudGhlbigoKSA9PiB7XG4gICAgICAgIGNvbnN0IHJlc3BvbnNlID0gdHJpZ2dlcihyZXF1ZXN0KTtcbiAgICAgICAgaWYgKHJlc3BvbnNlICYmIHR5cGVvZiByZXNwb25zZS50aGVuID09PSAnZnVuY3Rpb24nKSB7XG4gICAgICAgICAgcmV0dXJuIHJlc3BvbnNlLnRoZW4ocmVzdWx0cyA9PiB7XG4gICAgICAgICAgICBpZiAoIXJlc3VsdHMpIHtcbiAgICAgICAgICAgICAgdGhyb3cgbmV3IFBhcnNlLkVycm9yKFxuICAgICAgICAgICAgICAgIFBhcnNlLkVycm9yLlNDUklQVF9GQUlMRUQsXG4gICAgICAgICAgICAgICAgJ0FmdGVyRmluZCBleHBlY3QgcmVzdWx0cyB0byBiZSByZXR1cm5lZCBpbiB0aGUgcHJvbWlzZSdcbiAgICAgICAgICAgICAgKTtcbiAgICAgICAgICAgIH1cbiAgICAgICAgICAgIHJldHVybiByZXN1bHRzO1xuICAgICAgICAgIH0pO1xuICAgICAgICB9XG4gICAgICAgIHJldHVybiByZXNwb25zZTtcbiAgICAgIH0pXG4gICAgICAudGhlbihzdWNjZXNzLCBlcnJvcik7XG4gIH0pLnRoZW4ocmVzdWx0cyA9PiB7XG4gICAgbG9nVHJpZ2dlckFmdGVySG9vayh0cmlnZ2VyVHlwZSwgY2xhc3NOYW1lLCBKU09OLnN0cmluZ2lmeShyZXN1bHRzKSwgYXV0aCk7XG4gICAgcmV0dXJuIHJlc3VsdHM7XG4gIH0pO1xufVxuXG5leHBvcnQgZnVuY3Rpb24gbWF5YmVSdW5RdWVyeVRyaWdnZXIoXG4gIHRyaWdnZXJUeXBlLFxuICBjbGFzc05hbWUsXG4gIHJlc3RXaGVyZSxcbiAgcmVzdE9wdGlvbnMsXG4gIGNvbmZpZyxcbiAgYXV0aCxcbiAgY29udGV4dCxcbiAgaXNHZXRcbikge1xuICBjb25zdCB0cmlnZ2VyID0gZ2V0VHJpZ2dlcihjbGFzc05hbWUsIHRyaWdnZXJUeXBlLCBjb25maWcuYXBwbGljYXRpb25JZCk7XG4gIGlmICghdHJpZ2dlcikge1xuICAgIHJldHVybiBQcm9taXNlLnJlc29sdmUoe1xuICAgICAgcmVzdFdoZXJlLFxuICAgICAgcmVzdE9wdGlvbnMsXG4gICAgfSk7XG4gIH1cbiAgY29uc3QganNvbiA9IE9iamVjdC5hc3NpZ24oe30sIHJlc3RPcHRpb25zKTtcbiAganNvbi53aGVyZSA9IHJlc3RXaGVyZTtcblxuICBjb25zdCBwYXJzZVF1ZXJ5ID0gbmV3IFBhcnNlLlF1ZXJ5KGNsYXNzTmFtZSk7XG4gIHBhcnNlUXVlcnkud2l0aEpTT04oanNvbik7XG5cbiAgbGV0IGNvdW50ID0gZmFsc2U7XG4gIGlmIChyZXN0T3B0aW9ucykge1xuICAgIGNvdW50ID0gISFyZXN0T3B0aW9ucy5jb3VudDtcbiAgfVxuICBjb25zdCByZXF1ZXN0T2JqZWN0ID0gZ2V0UmVxdWVzdFF1ZXJ5T2JqZWN0KFxuICAgIHRyaWdnZXJUeXBlLFxuICAgIGF1dGgsXG4gICAgcGFyc2VRdWVyeSxcbiAgICBjb3VudCxcbiAgICBjb25maWcsXG4gICAgY29udGV4dCxcbiAgICBpc0dldFxuICApO1xuICByZXR1cm4gUHJvbWlzZS5yZXNvbHZlKClcbiAgICAudGhlbigoKSA9PiB7XG4gICAgICByZXR1cm4gdHJpZ2dlcihyZXF1ZXN0T2JqZWN0KTtcbiAgICB9KVxuICAgIC50aGVuKFxuICAgICAgcmVzdWx0ID0+IHtcbiAgICAgICAgbGV0IHF1ZXJ5UmVzdWx0ID0gcGFyc2VRdWVyeTtcbiAgICAgICAgaWYgKHJlc3VsdCAmJiByZXN1bHQgaW5zdGFuY2VvZiBQYXJzZS5RdWVyeSkge1xuICAgICAgICAgIHF1ZXJ5UmVzdWx0ID0gcmVzdWx0O1xuICAgICAgICB9XG4gICAgICAgIGNvbnN0IGpzb25RdWVyeSA9IHF1ZXJ5UmVzdWx0LnRvSlNPTigpO1xuICAgICAgICBpZiAoanNvblF1ZXJ5LndoZXJlKSB7XG4gICAgICAgICAgcmVzdFdoZXJlID0ganNvblF1ZXJ5LndoZXJlO1xuICAgICAgICB9XG4gICAgICAgIGlmIChqc29uUXVlcnkubGltaXQpIHtcbiAgICAgICAgICByZXN0T3B0aW9ucyA9IHJlc3RPcHRpb25zIHx8IHt9O1xuICAgICAgICAgIHJlc3RPcHRpb25zLmxpbWl0ID0ganNvblF1ZXJ5LmxpbWl0O1xuICAgICAgICB9XG4gICAgICAgIGlmIChqc29uUXVlcnkuc2tpcCkge1xuICAgICAgICAgIHJlc3RPcHRpb25zID0gcmVzdE9wdGlvbnMgfHwge307XG4gICAgICAgICAgcmVzdE9wdGlvbnMuc2tpcCA9IGpzb25RdWVyeS5za2lwO1xuICAgICAgICB9XG4gICAgICAgIGlmIChqc29uUXVlcnkuaW5jbHVkZSkge1xuICAgICAgICAgIHJlc3RPcHRpb25zID0gcmVzdE9wdGlvbnMgfHwge307XG4gICAgICAgICAgcmVzdE9wdGlvbnMuaW5jbHVkZSA9IGpzb25RdWVyeS5pbmNsdWRlO1xuICAgICAgICB9XG4gICAgICAgIGlmIChqc29uUXVlcnkuZXhjbHVkZUtleXMpIHtcbiAgICAgICAgICByZXN0T3B0aW9ucyA9IHJlc3RPcHRpb25zIHx8IHt9O1xuICAgICAgICAgIHJlc3RPcHRpb25zLmV4Y2x1ZGVLZXlzID0ganNvblF1ZXJ5LmV4Y2x1ZGVLZXlzO1xuICAgICAgICB9XG4gICAgICAgIGlmIChqc29uUXVlcnkuZXhwbGFpbikge1xuICAgICAgICAgIHJlc3RPcHRpb25zID0gcmVzdE9wdGlvbnMgfHwge307XG4gICAgICAgICAgcmVzdE9wdGlvbnMuZXhwbGFpbiA9IGpzb25RdWVyeS5leHBsYWluO1xuICAgICAgICB9XG4gICAgICAgIGlmIChqc29uUXVlcnkua2V5cykge1xuICAgICAgICAgIHJlc3RPcHRpb25zID0gcmVzdE9wdGlvbnMgfHwge307XG4gICAgICAgICAgcmVzdE9wdGlvbnMua2V5cyA9IGpzb25RdWVyeS5rZXlzO1xuICAgICAgICB9XG4gICAgICAgIGlmIChqc29uUXVlcnkub3JkZXIpIHtcbiAgICAgICAgICByZXN0T3B0aW9ucyA9IHJlc3RPcHRpb25zIHx8IHt9O1xuICAgICAgICAgIHJlc3RPcHRpb25zLm9yZGVyID0ganNvblF1ZXJ5Lm9yZGVyO1xuICAgICAgICB9XG4gICAgICAgIGlmIChqc29uUXVlcnkuaGludCkge1xuICAgICAgICAgIHJlc3RPcHRpb25zID0gcmVzdE9wdGlvbnMgfHwge307XG4gICAgICAgICAgcmVzdE9wdGlvbnMuaGludCA9IGpzb25RdWVyeS5oaW50O1xuICAgICAgICB9XG4gICAgICAgIGlmIChyZXF1ZXN0T2JqZWN0LnJlYWRQcmVmZXJlbmNlKSB7XG4gICAgICAgICAgcmVzdE9wdGlvbnMgPSByZXN0T3B0aW9ucyB8fCB7fTtcbiAgICAgICAgICByZXN0T3B0aW9ucy5yZWFkUHJlZmVyZW5jZSA9IHJlcXVlc3RPYmplY3QucmVhZFByZWZlcmVuY2U7XG4gICAgICAgIH1cbiAgICAgICAgaWYgKHJlcXVlc3RPYmplY3QuaW5jbHVkZVJlYWRQcmVmZXJlbmNlKSB7XG4gICAgICAgICAgcmVzdE9wdGlvbnMgPSByZXN0T3B0aW9ucyB8fCB7fTtcbiAgICAgICAgICByZXN0T3B0aW9ucy5pbmNsdWRlUmVhZFByZWZlcmVuY2UgPVxuICAgICAgICAgICAgcmVxdWVzdE9iamVjdC5pbmNsdWRlUmVhZFByZWZlcmVuY2U7XG4gICAgICAgIH1cbiAgICAgICAgaWYgKHJlcXVlc3RPYmplY3Quc3VicXVlcnlSZWFkUHJlZmVyZW5jZSkge1xuICAgICAgICAgIHJlc3RPcHRpb25zID0gcmVzdE9wdGlvbnMgfHwge307XG4gICAgICAgICAgcmVzdE9wdGlvbnMuc3VicXVlcnlSZWFkUHJlZmVyZW5jZSA9XG4gICAgICAgICAgICByZXF1ZXN0T2JqZWN0LnN1YnF1ZXJ5UmVhZFByZWZlcmVuY2U7XG4gICAgICAgIH1cbiAgICAgICAgcmV0dXJuIHtcbiAgICAgICAgICByZXN0V2hlcmUsXG4gICAgICAgICAgcmVzdE9wdGlvbnMsXG4gICAgICAgIH07XG4gICAgICB9LFxuICAgICAgZXJyID0+IHtcbiAgICAgICAgaWYgKHR5cGVvZiBlcnIgPT09ICdzdHJpbmcnKSB7XG4gICAgICAgICAgdGhyb3cgbmV3IFBhcnNlLkVycm9yKDEsIGVycik7XG4gICAgICAgIH0gZWxzZSB7XG4gICAgICAgICAgdGhyb3cgZXJyO1xuICAgICAgICB9XG4gICAgICB9XG4gICAgKTtcbn1cblxuLy8gVG8gYmUgdXNlZCBhcyBwYXJ0IG9mIHRoZSBwcm9taXNlIGNoYWluIHdoZW4gc2F2aW5nL2RlbGV0aW5nIGFuIG9iamVjdFxuLy8gV2lsbCByZXNvbHZlIHN1Y2Nlc3NmdWxseSBpZiBubyB0cmlnZ2VyIGlzIGNvbmZpZ3VyZWRcbi8vIFJlc29sdmVzIHRvIGFuIG9iamVjdCwgZW1wdHkgb3IgY29udGFpbmluZyBhbiBvYmplY3Qga2V5LiBBIGJlZm9yZVNhdmVcbi8vIHRyaWdnZXIgd2lsbCBzZXQgdGhlIG9iamVjdCBrZXkgdG8gdGhlIHJlc3QgZm9ybWF0IG9iamVjdCB0byBzYXZlLlxuLy8gb3JpZ2luYWxQYXJzZU9iamVjdCBpcyBvcHRpb25hbCwgd2Ugb25seSBuZWVkIHRoYXQgZm9yIGJlZm9yZS9hZnRlclNhdmUgZnVuY3Rpb25zXG5leHBvcnQgZnVuY3Rpb24gbWF5YmVSdW5UcmlnZ2VyKFxuICB0cmlnZ2VyVHlwZSxcbiAgYXV0aCxcbiAgcGFyc2VPYmplY3QsXG4gIG9yaWdpbmFsUGFyc2VPYmplY3QsXG4gIGNvbmZpZyxcbiAgY29udGV4dFxuKSB7XG4gIGlmICghcGFyc2VPYmplY3QpIHtcbiAgICByZXR1cm4gUHJvbWlzZS5yZXNvbHZlKHt9KTtcbiAgfVxuICByZXR1cm4gbmV3IFByb21pc2UoZnVuY3Rpb24ocmVzb2x2ZSwgcmVqZWN0KSB7XG4gICAgdmFyIHRyaWdnZXIgPSBnZXRUcmlnZ2VyKFxuICAgICAgcGFyc2VPYmplY3QuY2xhc3NOYW1lLFxuICAgICAgdHJpZ2dlclR5cGUsXG4gICAgICBjb25maWcuYXBwbGljYXRpb25JZFxuICAgICk7XG4gICAgaWYgKCF0cmlnZ2VyKSByZXR1cm4gcmVzb2x2ZSgpO1xuICAgIHZhciByZXF1ZXN0ID0gZ2V0UmVxdWVzdE9iamVjdChcbiAgICAgIHRyaWdnZXJUeXBlLFxuICAgICAgYXV0aCxcbiAgICAgIHBhcnNlT2JqZWN0LFxuICAgICAgb3JpZ2luYWxQYXJzZU9iamVjdCxcbiAgICAgIGNvbmZpZyxcbiAgICAgIGNvbnRleHRcbiAgICApO1xuICAgIHZhciB7IHN1Y2Nlc3MsIGVycm9yIH0gPSBnZXRSZXNwb25zZU9iamVjdChcbiAgICAgIHJlcXVlc3QsXG4gICAgICBvYmplY3QgPT4ge1xuICAgICAgICBsb2dUcmlnZ2VyU3VjY2Vzc0JlZm9yZUhvb2soXG4gICAgICAgICAgdHJpZ2dlclR5cGUsXG4gICAgICAgICAgcGFyc2VPYmplY3QuY2xhc3NOYW1lLFxuICAgICAgICAgIHBhcnNlT2JqZWN0LnRvSlNPTigpLFxuICAgICAgICAgIG9iamVjdCxcbiAgICAgICAgICBhdXRoXG4gICAgICAgICk7XG4gICAgICAgIGlmIChcbiAgICAgICAgICB0cmlnZ2VyVHlwZSA9PT0gVHlwZXMuYmVmb3JlU2F2ZSB8fFxuICAgICAgICAgIHRyaWdnZXJUeXBlID09PSBUeXBlcy5hZnRlclNhdmUgfHxcbiAgICAgICAgICB0cmlnZ2VyVHlwZSA9PT0gVHlwZXMuYmVmb3JlRGVsZXRlIHx8XG4gICAgICAgICAgdHJpZ2dlclR5cGUgPT09IFR5cGVzLmFmdGVyRGVsZXRlXG4gICAgICAgICkge1xuICAgICAgICAgIE9iamVjdC5hc3NpZ24oY29udGV4dCwgcmVxdWVzdC5jb250ZXh0KTtcbiAgICAgICAgfVxuICAgICAgICByZXNvbHZlKG9iamVjdCk7XG4gICAgICB9LFxuICAgICAgZXJyb3IgPT4ge1xuICAgICAgICBsb2dUcmlnZ2VyRXJyb3JCZWZvcmVIb29rKFxuICAgICAgICAgIHRyaWdnZXJUeXBlLFxuICAgICAgICAgIHBhcnNlT2JqZWN0LmNsYXNzTmFtZSxcbiAgICAgICAgICBwYXJzZU9iamVjdC50b0pTT04oKSxcbiAgICAgICAgICBhdXRoLFxuICAgICAgICAgIGVycm9yXG4gICAgICAgICk7XG4gICAgICAgIHJlamVjdChlcnJvcik7XG4gICAgICB9XG4gICAgKTtcblxuICAgIC8vIEFmdGVyU2F2ZSBhbmQgYWZ0ZXJEZWxldGUgdHJpZ2dlcnMgY2FuIHJldHVybiBhIHByb21pc2UsIHdoaWNoIGlmIHRoZXlcbiAgICAvLyBkbywgbmVlZHMgdG8gYmUgcmVzb2x2ZWQgYmVmb3JlIHRoaXMgcHJvbWlzZSBpcyByZXNvbHZlZCxcbiAgICAvLyBzbyB0cmlnZ2VyIGV4ZWN1dGlvbiBpcyBzeW5jZWQgd2l0aCBSZXN0V3JpdGUuZXhlY3V0ZSgpIGNhbGwuXG4gICAgLy8gSWYgdHJpZ2dlcnMgZG8gbm90IHJldHVybiBhIHByb21pc2UsIHRoZXkgY2FuIHJ1biBhc3luYyBjb2RlIHBhcmFsbGVsXG4gICAgLy8gdG8gdGhlIFJlc3RXcml0ZS5leGVjdXRlKCkgY2FsbC5cbiAgICByZXR1cm4gUHJvbWlzZS5yZXNvbHZlKClcbiAgICAgIC50aGVuKCgpID0+IHtcbiAgICAgICAgY29uc3QgcHJvbWlzZSA9IHRyaWdnZXIocmVxdWVzdCk7XG4gICAgICAgIGlmIChcbiAgICAgICAgICB0cmlnZ2VyVHlwZSA9PT0gVHlwZXMuYWZ0ZXJTYXZlIHx8XG4gICAgICAgICAgdHJpZ2dlclR5cGUgPT09IFR5cGVzLmFmdGVyRGVsZXRlIHx8XG4gICAgICAgICAgdHJpZ2dlclR5cGUgPT09IFR5cGVzLmFmdGVyTG9naW5cbiAgICAgICAgKSB7XG4gICAgICAgICAgbG9nVHJpZ2dlckFmdGVySG9vayhcbiAgICAgICAgICAgIHRyaWdnZXJUeXBlLFxuICAgICAgICAgICAgcGFyc2VPYmplY3QuY2xhc3NOYW1lLFxuICAgICAgICAgICAgcGFyc2VPYmplY3QudG9KU09OKCksXG4gICAgICAgICAgICBhdXRoXG4gICAgICAgICAgKTtcbiAgICAgICAgfVxuICAgICAgICAvLyBiZWZvcmVTYXZlIGlzIGV4cGVjdGVkIHRvIHJldHVybiBudWxsIChub3RoaW5nKVxuICAgICAgICBpZiAodHJpZ2dlclR5cGUgPT09IFR5cGVzLmJlZm9yZVNhdmUpIHtcbiAgICAgICAgICBpZiAocHJvbWlzZSAmJiB0eXBlb2YgcHJvbWlzZS50aGVuID09PSAnZnVuY3Rpb24nKSB7XG4gICAgICAgICAgICByZXR1cm4gcHJvbWlzZS50aGVuKHJlc3BvbnNlID0+IHtcbiAgICAgICAgICAgICAgLy8gcmVzcG9uc2Uub2JqZWN0IG1heSBjb21lIGZyb20gZXhwcmVzcyByb3V0aW5nIGJlZm9yZSBob29rXG4gICAgICAgICAgICAgIGlmIChyZXNwb25zZSAmJiByZXNwb25zZS5vYmplY3QpIHtcbiAgICAgICAgICAgICAgICByZXR1cm4gcmVzcG9uc2U7XG4gICAgICAgICAgICAgIH1cbiAgICAgICAgICAgICAgcmV0dXJuIG51bGw7XG4gICAgICAgICAgICB9KTtcbiAgICAgICAgICB9XG4gICAgICAgICAgcmV0dXJuIG51bGw7XG4gICAgICAgIH1cblxuICAgICAgICByZXR1cm4gcHJvbWlzZTtcbiAgICAgIH0pXG4gICAgICAudGhlbihzdWNjZXNzLCBlcnJvcik7XG4gIH0pO1xufVxuXG4vLyBDb252ZXJ0cyBhIFJFU1QtZm9ybWF0IG9iamVjdCB0byBhIFBhcnNlLk9iamVjdFxuLy8gZGF0YSBpcyBlaXRoZXIgY2xhc3NOYW1lIG9yIGFuIG9iamVjdFxuZXhwb3J0IGZ1bmN0aW9uIGluZmxhdGUoZGF0YSwgcmVzdE9iamVjdCkge1xuICB2YXIgY29weSA9IHR5cGVvZiBkYXRhID09ICdvYmplY3QnID8gZGF0YSA6IHsgY2xhc3NOYW1lOiBkYXRhIH07XG4gIGZvciAodmFyIGtleSBpbiByZXN0T2JqZWN0KSB7XG4gICAgY29weVtrZXldID0gcmVzdE9iamVjdFtrZXldO1xuICB9XG4gIHJldHVybiBQYXJzZS5PYmplY3QuZnJvbUpTT04oY29weSk7XG59XG5cbmV4cG9ydCBmdW5jdGlvbiBydW5MaXZlUXVlcnlFdmVudEhhbmRsZXJzKFxuICBkYXRhLFxuICBhcHBsaWNhdGlvbklkID0gUGFyc2UuYXBwbGljYXRpb25JZFxuKSB7XG4gIGlmIChcbiAgICAhX3RyaWdnZXJTdG9yZSB8fFxuICAgICFfdHJpZ2dlclN0b3JlW2FwcGxpY2F0aW9uSWRdIHx8XG4gICAgIV90cmlnZ2VyU3RvcmVbYXBwbGljYXRpb25JZF0uTGl2ZVF1ZXJ5XG4gICkge1xuICAgIHJldHVybjtcbiAgfVxuICBfdHJpZ2dlclN0b3JlW2FwcGxpY2F0aW9uSWRdLkxpdmVRdWVyeS5mb3JFYWNoKGhhbmRsZXIgPT4gaGFuZGxlcihkYXRhKSk7XG59XG5cbmV4cG9ydCBmdW5jdGlvbiBnZXRSZXF1ZXN0RmlsZU9iamVjdCh0cmlnZ2VyVHlwZSwgYXV0aCwgZmlsZU9iamVjdCwgY29uZmlnKSB7XG4gIGNvbnN0IHJlcXVlc3QgPSB7XG4gICAgLi4uZmlsZU9iamVjdCxcbiAgICB0cmlnZ2VyTmFtZTogdHJpZ2dlclR5cGUsXG4gICAgbWFzdGVyOiBmYWxzZSxcbiAgICBsb2c6IGNvbmZpZy5sb2dnZXJDb250cm9sbGVyLFxuICAgIGhlYWRlcnM6IGNvbmZpZy5oZWFkZXJzLFxuICAgIGlwOiBjb25maWcuaXAsXG4gIH07XG5cbiAgaWYgKCFhdXRoKSB7XG4gICAgcmV0dXJuIHJlcXVlc3Q7XG4gIH1cbiAgaWYgKGF1dGguaXNNYXN0ZXIpIHtcbiAgICByZXF1ZXN0WydtYXN0ZXInXSA9IHRydWU7XG4gIH1cbiAgaWYgKGF1dGgudXNlcikge1xuICAgIHJlcXVlc3RbJ3VzZXInXSA9IGF1dGgudXNlcjtcbiAgfVxuICBpZiAoYXV0aC5pbnN0YWxsYXRpb25JZCkge1xuICAgIHJlcXVlc3RbJ2luc3RhbGxhdGlvbklkJ10gPSBhdXRoLmluc3RhbGxhdGlvbklkO1xuICB9XG4gIHJldHVybiByZXF1ZXN0O1xufVxuXG5leHBvcnQgYXN5bmMgZnVuY3Rpb24gbWF5YmVSdW5GaWxlVHJpZ2dlcih0cmlnZ2VyVHlwZSwgZmlsZU9iamVjdCwgY29uZmlnLCBhdXRoKSB7XG4gIGNvbnN0IGZpbGVUcmlnZ2VyID0gZ2V0RmlsZVRyaWdnZXIodHJpZ2dlclR5cGUsIGNvbmZpZy5hcHBsaWNhdGlvbklkKTtcbiAgaWYgKHR5cGVvZiBmaWxlVHJpZ2dlciA9PT0gJ2Z1bmN0aW9uJykge1xuICAgIHRyeSB7XG4gICAgICBjb25zdCByZXF1ZXN0ID0gZ2V0UmVxdWVzdEZpbGVPYmplY3QoXG4gICAgICAgIHRyaWdnZXJUeXBlLFxuICAgICAgICBhdXRoLFxuICAgICAgICBmaWxlT2JqZWN0LFxuICAgICAgICBjb25maWdcbiAgICAgICk7XG4gICAgICBjb25zdCByZXN1bHQgPSBhd2FpdCBmaWxlVHJpZ2dlcihyZXF1ZXN0KTtcbiAgICAgIGxvZ1RyaWdnZXJTdWNjZXNzQmVmb3JlSG9vayhcbiAgICAgICAgdHJpZ2dlclR5cGUsXG4gICAgICAgICdQYXJzZS5GaWxlJyxcbiAgICAgICAgeyAuLi5maWxlT2JqZWN0LmZpbGUudG9KU09OKCksIGZpbGVTaXplOiBmaWxlT2JqZWN0LmZpbGVTaXplIH0sXG4gICAgICAgIHJlc3VsdCxcbiAgICAgICAgYXV0aCxcbiAgICAgIClcbiAgICAgIHJldHVybiByZXN1bHQgfHwgZmlsZU9iamVjdDtcbiAgICB9IGNhdGNoIChlcnJvcikge1xuICAgICAgbG9nVHJpZ2dlckVycm9yQmVmb3JlSG9vayhcbiAgICAgICAgdHJpZ2dlclR5cGUsXG4gICAgICAgICdQYXJzZS5GaWxlJyxcbiAgICAgICAgeyAuLi5maWxlT2JqZWN0LmZpbGUudG9KU09OKCksIGZpbGVTaXplOiBmaWxlT2JqZWN0LmZpbGVTaXplIH0sXG4gICAgICAgIGF1dGgsXG4gICAgICAgIGVycm9yLFxuICAgICAgKTtcbiAgICAgIHRocm93IGVycm9yO1xuICAgIH1cbiAgfVxuICByZXR1cm4gZmlsZU9iamVjdDtcbn1cbiJdfQ==