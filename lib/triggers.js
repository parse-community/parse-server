"use strict";

Object.defineProperty(exports, "__esModule", {
  value: true
});
exports.addFunction = addFunction;
exports.addJob = addJob;
exports.addTrigger = addTrigger;
exports.addFileTrigger = addFileTrigger;
exports.addConnectTrigger = addConnectTrigger;
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
exports.resolveError = resolveError;
exports.maybeRunValidator = maybeRunValidator;
exports.maybeRunTrigger = maybeRunTrigger;
exports.inflate = inflate;
exports.runLiveQueryEventHandlers = runLiveQueryEventHandlers;
exports.getRequestFileObject = getRequestFileObject;
exports.maybeRunFileTrigger = maybeRunFileTrigger;
exports.maybeRunConnectTrigger = maybeRunConnectTrigger;
exports.maybeRunSubscribeTrigger = maybeRunSubscribeTrigger;
exports.maybeRunAfterEventTrigger = maybeRunAfterEventTrigger;
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
  afterDeleteFile: 'afterDeleteFile',
  beforeConnect: 'beforeConnect',
  beforeSubscribe: 'beforeSubscribe',
  afterEvent: 'afterEvent'
};
exports.Types = Types;
const FileClassName = '@File';
const ConnectClassName = '@Connect';

const baseStore = function () {
  const Validators = Object.keys(Types).reduce(function (base, key) {
    base[key] = {};
    return base;
  }, {});
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

  if (store[lastComponent]) {
    _logger.logger.warn(`Warning: Duplicate cloud functions exist for ${lastComponent}. Only the last one will be used and the others will be ignored.`);
  }

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

function addTrigger(type, className, handler, applicationId, validationHandler) {
  validateClassNameForTriggers(className, type);
  add(Category.Triggers, `${type}.${className}`, handler, applicationId);
  add(Category.Validators, `${type}.${className}`, validationHandler, applicationId);
}

function addFileTrigger(type, handler, applicationId, validationHandler) {
  add(Category.Triggers, `${type}.${FileClassName}`, handler, applicationId);
  add(Category.Validators, `${type}.${FileClassName}`, validationHandler, applicationId);
}

function addConnectTrigger(type, handler, applicationId, validationHandler) {
  add(Category.Triggers, `${type}.${ConnectClassName}`, handler, applicationId);
  add(Category.Validators, `${type}.${ConnectClassName}`, validationHandler, applicationId);
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
      const e = resolveError(error, {
        code: _node.default.Error.SCRIPT_FAILED,
        message: 'Script failed. Unknown error.'
      });
      reject(e);
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

function maybeRunAfterFindTrigger(triggerType, auth, className, objects, config, query) {
  return new Promise((resolve, reject) => {
    const trigger = getTrigger(className, triggerType, config.applicationId);

    if (!trigger) {
      return resolve();
    }

    const request = getRequestObject(triggerType, auth, null, null, config);

    if (query) {
      request.query = query;
    }

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
      return maybeRunValidator(request, `${triggerType}.${className}`);
    }).then(() => {
      if (request.skipWithMasterKey) {
        return request.objects;
      }

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
    return maybeRunValidator(requestObject, `${triggerType}.${className}`);
  }).then(() => {
    if (requestObject.skipWithMasterKey) {
      return requestObject.query;
    }

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
    const error = resolveError(err, {
      code: _node.default.Error.SCRIPT_FAILED,
      message: 'Script failed. Unknown error.'
    });
    throw error;
  });
}

function resolveError(message, defaultOpts) {
  if (!defaultOpts) {
    defaultOpts = {};
  }

  if (!message) {
    return new _node.default.Error(defaultOpts.code || _node.default.Error.SCRIPT_FAILED, defaultOpts.message || 'Script failed.');
  }

  if (message instanceof _node.default.Error) {
    return message;
  }

  const code = defaultOpts.code || _node.default.Error.SCRIPT_FAILED; // If it's an error, mark it as a script failed

  if (typeof message === 'string') {
    return new _node.default.Error(code, message);
  }

  const error = new _node.default.Error(code, message.message || message);

  if (message instanceof Error) {
    error.stack = message.stack;
  }

  return error;
}

function maybeRunValidator(request, functionName) {
  const theValidator = getValidator(functionName, _node.default.applicationId);

  if (!theValidator) {
    return;
  }

  if (typeof theValidator === 'object' && theValidator.skipWithMasterKey && request.master) {
    request.skipWithMasterKey = true;
  }

  return new Promise((resolve, reject) => {
    return Promise.resolve().then(() => {
      return typeof theValidator === 'object' ? builtInTriggerValidator(theValidator, request) : theValidator(request);
    }).then(() => {
      resolve();
    }).catch(e => {
      const error = resolveError(e, {
        code: _node.default.Error.VALIDATION_ERROR,
        message: 'Validation failed.'
      });
      reject(error);
    });
  });
}

function builtInTriggerValidator(options, request) {
  if (request.master && !options.validateMasterKey) {
    return;
  }

  let reqUser = request.user;

  if (!reqUser && request.object && request.object.className === '_User' && !request.object.existed()) {
    reqUser = request.object;
  }

  if (options.requireUser && !reqUser) {
    throw 'Validation failed. Please login to continue.';
  }

  if (options.requireMaster && !request.master) {
    throw 'Validation failed. Master key is required to complete this request.';
  }

  let params = request.params || {};

  if (request.object) {
    params = request.object.toJSON();
  }

  const requiredParam = key => {
    const value = params[key];

    if (value == null) {
      throw `Validation failed. Please specify data for ${key}.`;
    }
  };

  const validateOptions = (opt, key, val) => {
    let opts = opt.options;

    if (typeof opts === 'function') {
      try {
        const result = opts(val);

        if (!result && result != null) {
          throw opt.error || `Validation failed. Invalid value for ${key}.`;
        }
      } catch (e) {
        if (!e) {
          throw opt.error || `Validation failed. Invalid value for ${key}.`;
        }

        throw opt.error || e.message || e;
      }

      return;
    }

    if (!Array.isArray(opts)) {
      opts = [opt.options];
    }

    if (!opts.includes(val)) {
      throw opt.error || `Validation failed. Invalid option for ${key}. Expected: ${opts.join(', ')}`;
    }
  };

  const getType = fn => {
    const match = fn && fn.toString().match(/^\s*function (\w+)/);
    return (match ? match[1] : '').toLowerCase();
  };

  if (Array.isArray(options.fields)) {
    for (const key of options.fields) {
      requiredParam(key);
    }
  } else {
    for (const key in options.fields) {
      const opt = options.fields[key];
      let val = params[key];

      if (typeof opt === 'string') {
        requiredParam(opt);
      }

      if (typeof opt === 'object') {
        if (opt.default != null && val == null) {
          val = opt.default;
          params[key] = val;

          if (request.object) {
            request.object.set(key, val);
          }
        }

        if (opt.constant && request.object) {
          if (request.original) {
            request.object.set(key, request.original.get(key));
          } else if (opt.default != null) {
            request.object.set(key, opt.default);
          }
        }

        if (opt.required) {
          requiredParam(key);
        }

        if (opt.type) {
          const type = getType(opt.type);

          if (type == 'array' && !Array.isArray(val)) {
            throw `Validation failed. Invalid type for ${key}. Expected: array`;
          } else if (typeof val !== type) {
            throw `Validation failed. Invalid type for ${key}. Expected: ${type}`;
          }
        }

        if (opt.options) {
          validateOptions(opt, key, val);
        }
      }
    }
  }

  const userKeys = options.requireUserKeys || [];

  if (Array.isArray(userKeys)) {
    for (const key of userKeys) {
      if (!reqUser) {
        throw 'Please login to make this request.';
      }

      if (reqUser.get(key) == null) {
        throw `Validation failed. Please set data for ${key} on your account.`;
      }
    }
  } else if (typeof userKeys === 'object') {
    for (const key in options.requireUserKeys) {
      const opt = options.requireUserKeys[key];

      if (opt.options) {
        validateOptions(opt, key, reqUser.get(key));
      }
    }
  }
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
      return maybeRunValidator(request, `${triggerType}.${parseObject.className}`);
    }).then(() => {
      if (request.skipWithMasterKey) {
        return Promise.resolve();
      }

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
      await maybeRunValidator(request, `${triggerType}.${FileClassName}`);

      if (request.skipWithMasterKey) {
        return fileObject;
      }

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

async function maybeRunConnectTrigger(triggerType, request) {
  const trigger = getTrigger(ConnectClassName, triggerType, _node.default.applicationId);

  if (!trigger) {
    return;
  }

  request.user = await userForSessionToken(request.sessionToken);
  await maybeRunValidator(request, `${triggerType}.${ConnectClassName}`);

  if (request.skipWithMasterKey) {
    return;
  }

  return trigger(request);
}

async function maybeRunSubscribeTrigger(triggerType, className, request) {
  const trigger = getTrigger(className, triggerType, _node.default.applicationId);

  if (!trigger) {
    return;
  }

  const parseQuery = new _node.default.Query(className);
  parseQuery.withJSON(request.query);
  request.query = parseQuery;
  request.user = await userForSessionToken(request.sessionToken);
  await maybeRunValidator(request, `${triggerType}.${className}`);

  if (request.skipWithMasterKey) {
    return;
  }

  await trigger(request);
  const query = request.query.toJSON();

  if (query.keys) {
    query.fields = query.keys.split(',');
  }

  request.query = query;
}

async function maybeRunAfterEventTrigger(triggerType, className, request) {
  const trigger = getTrigger(className, triggerType, _node.default.applicationId);

  if (!trigger) {
    return;
  }

  if (request.object) {
    request.object = _node.default.Object.fromJSON(request.object);
  }

  if (request.original) {
    request.original = _node.default.Object.fromJSON(request.original);
  }

  request.user = await userForSessionToken(request.sessionToken);
  await maybeRunValidator(request, `${triggerType}.${className}`);

  if (request.skipWithMasterKey) {
    return;
  }

  return trigger(request);
}

async function userForSessionToken(sessionToken) {
  if (!sessionToken) {
    return;
  }

  const q = new _node.default.Query('_Session');
  q.equalTo('sessionToken', sessionToken);
  const session = await q.first({
    useMasterKey: true
  });

  if (!session) {
    return;
  }

  const user = session.get('user');

  if (!user) {
    return;
  }

  await user.fetch({
    useMasterKey: true
  });
  return user;
}
//# sourceMappingURL=data:application/json;charset=utf-8;base64,eyJ2ZXJzaW9uIjozLCJzb3VyY2VzIjpbIi4uL3NyYy90cmlnZ2Vycy5qcyJdLCJuYW1lcyI6WyJUeXBlcyIsImJlZm9yZUxvZ2luIiwiYWZ0ZXJMb2dpbiIsImFmdGVyTG9nb3V0IiwiYmVmb3JlU2F2ZSIsImFmdGVyU2F2ZSIsImJlZm9yZURlbGV0ZSIsImFmdGVyRGVsZXRlIiwiYmVmb3JlRmluZCIsImFmdGVyRmluZCIsImJlZm9yZVNhdmVGaWxlIiwiYWZ0ZXJTYXZlRmlsZSIsImJlZm9yZURlbGV0ZUZpbGUiLCJhZnRlckRlbGV0ZUZpbGUiLCJiZWZvcmVDb25uZWN0IiwiYmVmb3JlU3Vic2NyaWJlIiwiYWZ0ZXJFdmVudCIsIkZpbGVDbGFzc05hbWUiLCJDb25uZWN0Q2xhc3NOYW1lIiwiYmFzZVN0b3JlIiwiVmFsaWRhdG9ycyIsIk9iamVjdCIsImtleXMiLCJyZWR1Y2UiLCJiYXNlIiwia2V5IiwiRnVuY3Rpb25zIiwiSm9icyIsIkxpdmVRdWVyeSIsIlRyaWdnZXJzIiwiZnJlZXplIiwidmFsaWRhdGVDbGFzc05hbWVGb3JUcmlnZ2VycyIsImNsYXNzTmFtZSIsInR5cGUiLCJfdHJpZ2dlclN0b3JlIiwiQ2F0ZWdvcnkiLCJnZXRTdG9yZSIsImNhdGVnb3J5IiwibmFtZSIsImFwcGxpY2F0aW9uSWQiLCJwYXRoIiwic3BsaXQiLCJzcGxpY2UiLCJQYXJzZSIsInN0b3JlIiwiY29tcG9uZW50IiwidW5kZWZpbmVkIiwiYWRkIiwiaGFuZGxlciIsImxhc3RDb21wb25lbnQiLCJsb2dnZXIiLCJ3YXJuIiwicmVtb3ZlIiwiZ2V0IiwiYWRkRnVuY3Rpb24iLCJmdW5jdGlvbk5hbWUiLCJ2YWxpZGF0aW9uSGFuZGxlciIsImFkZEpvYiIsImpvYk5hbWUiLCJhZGRUcmlnZ2VyIiwiYWRkRmlsZVRyaWdnZXIiLCJhZGRDb25uZWN0VHJpZ2dlciIsImFkZExpdmVRdWVyeUV2ZW50SGFuZGxlciIsInB1c2giLCJyZW1vdmVGdW5jdGlvbiIsInJlbW92ZVRyaWdnZXIiLCJfdW5yZWdpc3RlckFsbCIsImZvckVhY2giLCJhcHBJZCIsImdldFRyaWdnZXIiLCJ0cmlnZ2VyVHlwZSIsImdldEZpbGVUcmlnZ2VyIiwidHJpZ2dlckV4aXN0cyIsImdldEZ1bmN0aW9uIiwiZ2V0RnVuY3Rpb25OYW1lcyIsImZ1bmN0aW9uTmFtZXMiLCJleHRyYWN0RnVuY3Rpb25OYW1lcyIsIm5hbWVzcGFjZSIsInZhbHVlIiwiZ2V0Sm9iIiwiZ2V0Sm9icyIsIm1hbmFnZXIiLCJnZXRWYWxpZGF0b3IiLCJnZXRSZXF1ZXN0T2JqZWN0IiwiYXV0aCIsInBhcnNlT2JqZWN0Iiwib3JpZ2luYWxQYXJzZU9iamVjdCIsImNvbmZpZyIsImNvbnRleHQiLCJyZXF1ZXN0IiwidHJpZ2dlck5hbWUiLCJvYmplY3QiLCJtYXN0ZXIiLCJsb2ciLCJsb2dnZXJDb250cm9sbGVyIiwiaGVhZGVycyIsImlwIiwib3JpZ2luYWwiLCJhc3NpZ24iLCJpc01hc3RlciIsInVzZXIiLCJpbnN0YWxsYXRpb25JZCIsImdldFJlcXVlc3RRdWVyeU9iamVjdCIsInF1ZXJ5IiwiY291bnQiLCJpc0dldCIsImdldFJlc3BvbnNlT2JqZWN0IiwicmVzb2x2ZSIsInJlamVjdCIsInN1Y2Nlc3MiLCJyZXNwb25zZSIsIm9iamVjdHMiLCJtYXAiLCJ0b0pTT04iLCJlcXVhbHMiLCJfZ2V0U2F2ZUpTT04iLCJlcnJvciIsImUiLCJyZXNvbHZlRXJyb3IiLCJjb2RlIiwiRXJyb3IiLCJTQ1JJUFRfRkFJTEVEIiwibWVzc2FnZSIsInVzZXJJZEZvckxvZyIsImlkIiwibG9nVHJpZ2dlckFmdGVySG9vayIsImlucHV0IiwiY2xlYW5JbnB1dCIsInRydW5jYXRlTG9nTWVzc2FnZSIsIkpTT04iLCJzdHJpbmdpZnkiLCJpbmZvIiwibG9nVHJpZ2dlclN1Y2Nlc3NCZWZvcmVIb29rIiwicmVzdWx0IiwiY2xlYW5SZXN1bHQiLCJsb2dUcmlnZ2VyRXJyb3JCZWZvcmVIb29rIiwibWF5YmVSdW5BZnRlckZpbmRUcmlnZ2VyIiwiUHJvbWlzZSIsInRyaWdnZXIiLCJmcm9tSlNPTiIsInRoZW4iLCJtYXliZVJ1blZhbGlkYXRvciIsInNraXBXaXRoTWFzdGVyS2V5IiwicmVzdWx0cyIsIm1heWJlUnVuUXVlcnlUcmlnZ2VyIiwicmVzdFdoZXJlIiwicmVzdE9wdGlvbnMiLCJqc29uIiwid2hlcmUiLCJwYXJzZVF1ZXJ5IiwiUXVlcnkiLCJ3aXRoSlNPTiIsInJlcXVlc3RPYmplY3QiLCJxdWVyeVJlc3VsdCIsImpzb25RdWVyeSIsImxpbWl0Iiwic2tpcCIsImluY2x1ZGUiLCJleGNsdWRlS2V5cyIsImV4cGxhaW4iLCJvcmRlciIsImhpbnQiLCJyZWFkUHJlZmVyZW5jZSIsImluY2x1ZGVSZWFkUHJlZmVyZW5jZSIsInN1YnF1ZXJ5UmVhZFByZWZlcmVuY2UiLCJlcnIiLCJkZWZhdWx0T3B0cyIsInN0YWNrIiwidGhlVmFsaWRhdG9yIiwiYnVpbHRJblRyaWdnZXJWYWxpZGF0b3IiLCJjYXRjaCIsIlZBTElEQVRJT05fRVJST1IiLCJvcHRpb25zIiwidmFsaWRhdGVNYXN0ZXJLZXkiLCJyZXFVc2VyIiwiZXhpc3RlZCIsInJlcXVpcmVVc2VyIiwicmVxdWlyZU1hc3RlciIsInBhcmFtcyIsInJlcXVpcmVkUGFyYW0iLCJ2YWxpZGF0ZU9wdGlvbnMiLCJvcHQiLCJ2YWwiLCJvcHRzIiwiQXJyYXkiLCJpc0FycmF5IiwiaW5jbHVkZXMiLCJqb2luIiwiZ2V0VHlwZSIsImZuIiwibWF0Y2giLCJ0b1N0cmluZyIsInRvTG93ZXJDYXNlIiwiZmllbGRzIiwiZGVmYXVsdCIsInNldCIsImNvbnN0YW50IiwicmVxdWlyZWQiLCJ1c2VyS2V5cyIsInJlcXVpcmVVc2VyS2V5cyIsIm1heWJlUnVuVHJpZ2dlciIsInByb21pc2UiLCJpbmZsYXRlIiwiZGF0YSIsInJlc3RPYmplY3QiLCJjb3B5IiwicnVuTGl2ZVF1ZXJ5RXZlbnRIYW5kbGVycyIsImdldFJlcXVlc3RGaWxlT2JqZWN0IiwiZmlsZU9iamVjdCIsIm1heWJlUnVuRmlsZVRyaWdnZXIiLCJmaWxlVHJpZ2dlciIsImZpbGUiLCJmaWxlU2l6ZSIsIm1heWJlUnVuQ29ubmVjdFRyaWdnZXIiLCJ1c2VyRm9yU2Vzc2lvblRva2VuIiwic2Vzc2lvblRva2VuIiwibWF5YmVSdW5TdWJzY3JpYmVUcmlnZ2VyIiwibWF5YmVSdW5BZnRlckV2ZW50VHJpZ2dlciIsInEiLCJlcXVhbFRvIiwic2Vzc2lvbiIsImZpcnN0IiwidXNlTWFzdGVyS2V5IiwiZmV0Y2giXSwibWFwcGluZ3MiOiI7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7OztBQUNBOztBQUNBOzs7Ozs7Ozs7O0FBRU8sTUFBTUEsS0FBSyxHQUFHO0FBQ25CQyxFQUFBQSxXQUFXLEVBQUUsYUFETTtBQUVuQkMsRUFBQUEsVUFBVSxFQUFFLFlBRk87QUFHbkJDLEVBQUFBLFdBQVcsRUFBRSxhQUhNO0FBSW5CQyxFQUFBQSxVQUFVLEVBQUUsWUFKTztBQUtuQkMsRUFBQUEsU0FBUyxFQUFFLFdBTFE7QUFNbkJDLEVBQUFBLFlBQVksRUFBRSxjQU5LO0FBT25CQyxFQUFBQSxXQUFXLEVBQUUsYUFQTTtBQVFuQkMsRUFBQUEsVUFBVSxFQUFFLFlBUk87QUFTbkJDLEVBQUFBLFNBQVMsRUFBRSxXQVRRO0FBVW5CQyxFQUFBQSxjQUFjLEVBQUUsZ0JBVkc7QUFXbkJDLEVBQUFBLGFBQWEsRUFBRSxlQVhJO0FBWW5CQyxFQUFBQSxnQkFBZ0IsRUFBRSxrQkFaQztBQWFuQkMsRUFBQUEsZUFBZSxFQUFFLGlCQWJFO0FBY25CQyxFQUFBQSxhQUFhLEVBQUUsZUFkSTtBQWVuQkMsRUFBQUEsZUFBZSxFQUFFLGlCQWZFO0FBZ0JuQkMsRUFBQUEsVUFBVSxFQUFFO0FBaEJPLENBQWQ7O0FBbUJQLE1BQU1DLGFBQWEsR0FBRyxPQUF0QjtBQUNBLE1BQU1DLGdCQUFnQixHQUFHLFVBQXpCOztBQUVBLE1BQU1DLFNBQVMsR0FBRyxZQUFZO0FBQzVCLFFBQU1DLFVBQVUsR0FBR0MsTUFBTSxDQUFDQyxJQUFQLENBQVl0QixLQUFaLEVBQW1CdUIsTUFBbkIsQ0FBMEIsVUFBVUMs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QUFZLEVBQUU7QUFBaEIsR0FBWCxDQUFOO0FBQ0EsU0FBTzFILElBQVA7QUFDRCIsInNvdXJjZXNDb250ZW50IjpbIi8vIHRyaWdnZXJzLmpzXG5pbXBvcnQgUGFyc2UgZnJvbSAncGFyc2Uvbm9kZSc7XG5pbXBvcnQgeyBsb2dnZXIgfSBmcm9tICcuL2xvZ2dlcic7XG5cbmV4cG9ydCBjb25zdCBUeXBlcyA9IHtcbiAgYmVmb3JlTG9naW46ICdiZWZvcmVMb2dpbicsXG4gIGFmdGVyTG9naW46ICdhZnRlckxvZ2luJyxcbiAgYWZ0ZXJMb2dvdXQ6ICdhZnRlckxvZ291dCcsXG4gIGJlZm9yZVNhdmU6ICdiZWZvcmVTYXZlJyxcbiAgYWZ0ZXJTYXZlOiAnYWZ0ZXJTYXZlJyxcbiAgYmVmb3JlRGVsZXRlOiAnYmVmb3JlRGVsZXRlJyxcbiAgYWZ0ZXJEZWxldGU6ICdhZnRlckRlbGV0ZScsXG4gIGJlZm9yZUZpbmQ6ICdiZWZvcmVGaW5kJyxcbiAgYWZ0ZXJGaW5kOiAnYWZ0ZXJGaW5kJyxcbiAgYmVmb3JlU2F2ZUZpbGU6ICdiZWZvcmVTYXZlRmlsZScsXG4gIGFmdGVyU2F2ZUZpbGU6ICdhZnRlclNhdmVGaWxlJyxcbiAgYmVmb3JlRGVsZXRlRmlsZTogJ2JlZm9yZURlbGV0ZUZpbGUnLFxuICBhZnRlckRlbGV0ZUZpbGU6ICdhZnRlckRlbGV0ZUZpbGUnLFxuICBiZWZvcmVDb25uZWN0OiAnYmVmb3JlQ29ubmVjdCcsXG4gIGJlZm9yZVN1YnNjcmliZTogJ2JlZm9yZVN1YnNjcmliZScsXG4gIGFmdGVyRXZlbnQ6ICdhZnRlckV2ZW50Jyxcbn07XG5cbmNvbnN0IEZpbGVDbGFzc05hbWUgPSAnQEZpbGUnO1xuY29uc3QgQ29ubmVjdENsYXNzTmFtZSA9ICdAQ29ubmVjdCc7XG5cbmNvbnN0IGJhc2VTdG9yZSA9IGZ1bmN0aW9uICgpIHtcbiAgY29uc3QgVmFsaWRhdG9ycyA9IE9iamVjdC5rZXlzKFR5cGVzKS5yZWR1Y2UoZnVuY3Rpb24gKGJhc2UsIGtleSkge1xuICAgIGJhc2Vba2V5XSA9IHt9O1xuICAgIHJldHVybiBiYXNlO1xuICB9LCB7fSk7XG4gIGNvbnN0IEZ1bmN0aW9ucyA9IHt9O1xuICBjb25zdCBKb2JzID0ge307XG4gIGNvbnN0IExpdmVRdWVyeSA9IFtdO1xuICBjb25zdCBUcmlnZ2VycyA9IE9iamVjdC5rZXlzKFR5cGVzKS5yZWR1Y2UoZnVuY3Rpb24gKGJhc2UsIGtleSkge1xuICAgIGJhc2Vba2V5XSA9IHt9O1xuICAgIHJldHVybiBiYXNlO1xuICB9LCB7fSk7XG5cbiAgcmV0dXJuIE9iamVjdC5mcmVlemUoe1xuICAgIEZ1bmN0aW9ucyxcbiAgICBKb2JzLFxuICAgIFZhbGlkYXRvcnMsXG4gICAgVHJpZ2dlcnMsXG4gICAgTGl2ZVF1ZXJ5LFxuICB9KTtcbn07XG5cbmZ1bmN0aW9uIHZhbGlkYXRlQ2xhc3NOYW1lRm9yVHJpZ2dlcnMoY2xhc3NOYW1lLCB0eXBlKSB7XG4gIGlmICh0eXBlID09IFR5cGVzLmJlZm9yZVNhdmUgJiYgY2xhc3NOYW1lID09PSAnX1B1c2hTdGF0dXMnKSB7XG4gICAgLy8gX1B1c2hTdGF0dXMgdXNlcyB1bmRvY3VtZW50ZWQgbmVzdGVkIGtleSBpbmNyZW1lbnQgb3BzXG4gICAgLy8gYWxsb3dpbmcgYmVmb3JlU2F2ZSB3b3VsZCBtZXNzIHVwIHRoZSBvYmplY3RzIGJpZyB0aW1lXG4gICAgLy8gVE9ETzogQWxsb3cgcHJvcGVyIGRvY3VtZW50ZWQgd2F5IG9mIHVzaW5nIG5lc3RlZCBpbmNyZW1lbnQgb3BzXG4gICAgdGhyb3cgJ09ubHkgYWZ0ZXJTYXZlIGlzIGFsbG93ZWQgb24gX1B1c2hTdGF0dXMnO1xuICB9XG4gIGlmICgodHlwZSA9PT0gVHlwZXMuYmVmb3JlTG9naW4gfHwgdHlwZSA9PT0gVHlwZXMuYWZ0ZXJMb2dpbikgJiYgY2xhc3NOYW1lICE9PSAnX1VzZXInKSB7XG4gICAgLy8gVE9ETzogY2hlY2sgaWYgdXBzdHJlYW0gY29kZSB3aWxsIGhhbmRsZSBgRXJyb3JgIGluc3RhbmNlIHJhdGhlclxuICAgIC8vIHRoYW4gdGhpcyBhbnRpLXBhdHRlcm4gb2YgdGhyb3dpbmcgc3RyaW5nc1xuICAgIHRocm93ICdPbmx5IHRoZSBfVXNlciBjbGFzcyBpcyBhbGxvd2VkIGZvciB0aGUgYmVmb3JlTG9naW4gYW5kIGFmdGVyTG9naW4gdHJpZ2dlcnMnO1xuICB9XG4gIGlmICh0eXBlID09PSBUeXBlcy5hZnRlckxvZ291dCAmJiBjbGFzc05hbWUgIT09ICdfU2Vzc2lvbicpIHtcbiAgICAvLyBUT0RPOiBjaGVjayBpZiB1cHN0cmVhbSBjb2RlIHdpbGwgaGFuZGxlIGBFcnJvcmAgaW5zdGFuY2UgcmF0aGVyXG4gICAgLy8gdGhhbiB0aGlzIGFudGktcGF0dGVybiBvZiB0aHJvd2luZyBzdHJpbmdzXG4gICAgdGhyb3cgJ09ubHkgdGhlIF9TZXNzaW9uIGNsYXNzIGlzIGFsbG93ZWQgZm9yIHRoZSBhZnRlckxvZ291dCB0cmlnZ2VyLic7XG4gIH1cbiAgaWYgKGNsYXNzTmFtZSA9PT0gJ19TZXNzaW9uJyAmJiB0eXBlICE9PSBUeXBlcy5hZnRlckxvZ291dCkge1xuICAgIC8vIFRPRE86IGNoZWNrIGlmIHVwc3RyZWFtIGNvZGUgd2lsbCBoYW5kbGUgYEVycm9yYCBpbnN0YW5jZSByYXRoZXJcbiAgICAvLyB0aGFuIHRoaXMgYW50aS1wYXR0ZXJuIG9mIHRocm93aW5nIHN0cmluZ3NcbiAgICB0aHJvdyAnT25seSB0aGUgYWZ0ZXJMb2dvdXQgdHJpZ2dlciBpcyBhbGxvd2VkIGZvciB0aGUgX1Nlc3Npb24gY2xhc3MuJztcbiAgfVxuICByZXR1cm4gY2xhc3NOYW1lO1xufVxuXG5jb25zdCBfdHJpZ2dlclN0b3JlID0ge307XG5cbmNvbnN0IENhdGVnb3J5ID0ge1xuICBGdW5jdGlvbnM6ICdGdW5jdGlvbnMnLFxuICBWYWxpZGF0b3JzOiAnVmFsaWRhdG9ycycsXG4gIEpvYnM6ICdKb2JzJyxcbiAgVHJpZ2dlcnM6ICdUcmlnZ2VycycsXG59O1xuXG5mdW5jdGlvbiBnZXRTdG9yZShjYXRlZ29yeSwgbmFtZSwgYXBwbGljYXRpb25JZCkge1xuICBjb25zdCBwYXRoID0gbmFtZS5zcGxpdCgnLicpO1xuICBwYXRoLnNwbGljZSgtMSk7IC8vIHJlbW92ZSBsYXN0IGNvbXBvbmVudFxuICBhcHBsaWNhdGlvbklkID0gYXBwbGljYXRpb25JZCB8fCBQYXJzZS5hcHBsaWNhdGlvbklkO1xuICBfdHJpZ2dlclN0b3JlW2FwcGxpY2F0aW9uSWRdID0gX3RyaWdnZXJTdG9yZVthcHBsaWNhdGlvbklkXSB8fCBiYXNlU3RvcmUoKTtcbiAgbGV0IHN0b3JlID0gX3RyaWdnZXJTdG9yZVthcHBsaWNhdGlvbklkXVtjYXRlZ29yeV07XG4gIGZvciAoY29uc3QgY29tcG9uZW50IG9mIHBhdGgpIHtcbiAgICBzdG9yZSA9IHN0b3JlW2NvbXBvbmVudF07XG4gICAgaWYgKCFzdG9yZSkge1xuICAgICAgcmV0dXJuIHVuZGVmaW5lZDtcbiAgICB9XG4gIH1cbiAgcmV0dXJuIHN0b3JlO1xufVxuXG5mdW5jdGlvbiBhZGQoY2F0ZWdvcnksIG5hbWUsIGhhbmRsZXIsIGFwcGxpY2F0aW9uSWQpIHtcbiAgY29uc3QgbGFzdENvbXBvbmVudCA9IG5hbWUuc3BsaXQoJy4nKS5zcGxpY2UoLTEpO1xuICBjb25zdCBzdG9yZSA9IGdldFN0b3JlKGNhdGVnb3J5LCBuYW1lLCBhcHBsaWNhdGlvbklkKTtcbiAgaWYgKHN0b3JlW2xhc3RDb21wb25lbnRdKSB7XG4gICAgbG9nZ2VyLndhcm4oXG4gICAgICBgV2FybmluZzogRHVwbGljYXRlIGNsb3VkIGZ1bmN0aW9ucyBleGlzdCBmb3IgJHtsYXN0Q29tcG9uZW50fS4gT25seSB0aGUgbGFzdCBvbmUgd2lsbCBiZSB1c2VkIGFuZCB0aGUgb3RoZXJzIHdpbGwgYmUgaWdub3JlZC5gXG4gICAgKTtcbiAgfVxuICBzdG9yZVtsYXN0Q29tcG9uZW50XSA9IGhhbmRsZXI7XG59XG5cbmZ1bmN0aW9uIHJlbW92ZShjYXRlZ29yeSwgbmFtZSwgYXBwbGljYXRpb25JZCkge1xuICBjb25zdCBsYXN0Q29tcG9uZW50ID0gbmFtZS5zcGxpdCgnLicpLnNwbGljZSgtMSk7XG4gIGNvbnN0IHN0b3JlID0gZ2V0U3RvcmUoY2F0ZWdvcnksIG5hbWUsIGFwcGxpY2F0aW9uSWQpO1xuICBkZWxldGUgc3RvcmVbbGFzdENvbXBvbmVudF07XG59XG5cbmZ1bmN0aW9uIGdldChjYXRlZ29yeSwgbmFtZSwgYXBwbGljYXRpb25JZCkge1xuICBjb25zdCBsYXN0Q29tcG9uZW50ID0gbmFtZS5zcGxpdCgnLicpLnNwbGljZSgtMSk7XG4gIGNvbnN0IHN0b3JlID0gZ2V0U3RvcmUoY2F0ZWdvcnksIG5hbWUsIGFwcGxpY2F0aW9uSWQpO1xuICByZXR1cm4gc3RvcmVbbGFzdENvbXBvbmVudF07XG59XG5cbmV4cG9ydCBmdW5jdGlvbiBhZGRGdW5jdGlvbihmdW5jdGlvbk5hbWUsIGhhbmRsZXIsIHZhbGlkYXRpb25IYW5kbGVyLCBhcHBsaWNhdGlvbklkKSB7XG4gIGFkZChDYXRlZ29yeS5GdW5jdGlvbnMsIGZ1bmN0aW9uTmFtZSwgaGFuZGxlciwgYXBwbGljYXRpb25JZCk7XG4gIGFkZChDYXRlZ29yeS5WYWxpZGF0b3JzLCBmdW5jdGlvbk5hbWUsIHZhbGlkYXRpb25IYW5kbGVyLCBhcHBsaWNhdGlvbklkKTtcbn1cblxuZXhwb3J0IGZ1bmN0aW9uIGFkZEpvYihqb2JOYW1lLCBoYW5kbGVyLCBhcHBsaWNhdGlvbklkKSB7XG4gIGFkZChDYXRlZ29yeS5Kb2JzLCBqb2JOYW1lLCBoYW5kbGVyLCBhcHBsaWNhdGlvbklkKTtcbn1cblxuZXhwb3J0IGZ1bmN0aW9uIGFkZFRyaWdnZXIodHlwZSwgY2xhc3NOYW1lLCBoYW5kbGVyLCBhcHBsaWNhdGlvbklkLCB2YWxpZGF0aW9uSGFuZGxlcikge1xuICB2YWxpZGF0ZUNsYXNzTmFtZUZvclRyaWdnZXJzKGNsYXNzTmFtZSwgdHlwZSk7XG4gIGFkZChDYXRlZ29yeS5UcmlnZ2VycywgYCR7dHlwZX0uJHtjbGFzc05hbWV9YCwgaGFuZGxlciwgYXBwbGljYXRpb25JZCk7XG4gIGFkZChDYXRlZ29yeS5WYWxpZGF0b3JzLCBgJHt0eXBlfS4ke2NsYXNzTmFtZX1gLCB2YWxpZGF0aW9uSGFuZGxlciwgYXBwbGljYXRpb25JZCk7XG59XG5cbmV4cG9ydCBmdW5jdGlvbiBhZGRGaWxlVHJpZ2dlcih0eXBlLCBoYW5kbGVyLCBhcHBsaWNhdGlvbklkLCB2YWxpZGF0aW9uSGFuZGxlcikge1xuICBhZGQoQ2F0ZWdvcnkuVHJpZ2dlcnMsIGAke3R5cGV9LiR7RmlsZUNsYXNzTmFtZX1gLCBoYW5kbGVyLCBhcHBsaWNhdGlvbklkKTtcbiAgYWRkKENhdGVnb3J5LlZhbGlkYXRvcnMsIGAke3R5cGV9LiR7RmlsZUNsYXNzTmFtZX1gLCB2YWxpZGF0aW9uSGFuZGxlciwgYXBwbGljYXRpb25JZCk7XG59XG5cbmV4cG9ydCBmdW5jdGlvbiBhZGRDb25uZWN0VHJpZ2dlcih0eXBlLCBoYW5kbGVyLCBhcHBsaWNhdGlvbklkLCB2YWxpZGF0aW9uSGFuZGxlcikge1xuICBhZGQoQ2F0ZWdvcnkuVHJpZ2dlcnMsIGAke3R5cGV9LiR7Q29ubmVjdENsYXNzTmFtZX1gLCBoYW5kbGVyLCBhcHBsaWNhdGlvbklkKTtcbiAgYWRkKENhdGVnb3J5LlZhbGlkYXRvcnMsIGAke3R5cGV9LiR7Q29ubmVjdENsYXNzTmFtZX1gLCB2YWxpZGF0aW9uSGFuZGxlciwgYXBwbGljYXRpb25JZCk7XG59XG5cbmV4cG9ydCBmdW5jdGlvbiBhZGRMaXZlUXVlcnlFdmVudEhhbmRsZXIoaGFuZGxlciwgYXBwbGljYXRpb25JZCkge1xuICBhcHBsaWNhdGlvbklkID0gYXBwbGljYXRpb25JZCB8fCBQYXJzZS5hcHBsaWNhdGlvbklkO1xuICBfdHJpZ2dlclN0b3JlW2FwcGxpY2F0aW9uSWRdID0gX3RyaWdnZXJTdG9yZVthcHBsaWNhdGlvbklkXSB8fCBiYXNlU3RvcmUoKTtcbiAgX3RyaWdnZXJTdG9yZVthcHBsaWNhdGlvbklkXS5MaXZlUXVlcnkucHVzaChoYW5kbGVyKTtcbn1cblxuZXhwb3J0IGZ1bmN0aW9uIHJlbW92ZUZ1bmN0aW9uKGZ1bmN0aW9uTmFtZSwgYXBwbGljYXRpb25JZCkge1xuICByZW1vdmUoQ2F0ZWdvcnkuRnVuY3Rpb25zLCBmdW5jdGlvbk5hbWUsIGFwcGxpY2F0aW9uSWQpO1xufVxuXG5leHBvcnQgZnVuY3Rpb24gcmVtb3ZlVHJpZ2dlcih0eXBlLCBjbGFzc05hbWUsIGFwcGxpY2F0aW9uSWQpIHtcbiAgcmVtb3ZlKENhdGVnb3J5LlRyaWdnZXJzLCBgJHt0eXBlfS4ke2NsYXNzTmFtZX1gLCBhcHBsaWNhdGlvbklkKTtcbn1cblxuZXhwb3J0IGZ1bmN0aW9uIF91bnJlZ2lzdGVyQWxsKCkge1xuICBPYmplY3Qua2V5cyhfdHJpZ2dlclN0b3JlKS5mb3JFYWNoKGFwcElkID0+IGRlbGV0ZSBfdHJpZ2dlclN0b3JlW2FwcElkXSk7XG59XG5cbmV4cG9ydCBmdW5jdGlvbiBnZXRUcmlnZ2VyKGNsYXNzTmFtZSwgdHJpZ2dlclR5cGUsIGFwcGxpY2F0aW9uSWQpIHtcbiAgaWYgKCFhcHBsaWNhdGlvbklkKSB7XG4gICAgdGhyb3cgJ01pc3NpbmcgQXBwbGljYXRpb25JRCc7XG4gIH1cbiAgcmV0dXJuIGdldChDYXRlZ29yeS5UcmlnZ2VycywgYCR7dHJpZ2dlclR5cGV9LiR7Y2xhc3NOYW1lfWAsIGFwcGxpY2F0aW9uSWQpO1xufVxuXG5leHBvcnQgZnVuY3Rpb24gZ2V0RmlsZVRyaWdnZXIodHlwZSwgYXBwbGljYXRpb25JZCkge1xuICByZXR1cm4gZ2V0VHJpZ2dlcihGaWxlQ2xhc3NOYW1lLCB0eXBlLCBhcHBsaWNhdGlvbklkKTtcbn1cblxuZXhwb3J0IGZ1bmN0aW9uIHRyaWdnZXJFeGlzdHMoY2xhc3NOYW1lOiBzdHJpbmcsIHR5cGU6IHN0cmluZywgYXBwbGljYXRpb25JZDogc3RyaW5nKTogYm9vbGVhbiB7XG4gIHJldHVybiBnZXRUcmlnZ2VyKGNsYXNzTmFtZSwgdHlwZSwgYXBwbGljYXRpb25JZCkgIT0gdW5kZWZpbmVkO1xufVxuXG5leHBvcnQgZnVuY3Rpb24gZ2V0RnVuY3Rpb24oZnVuY3Rpb25OYW1lLCBhcHBsaWNhdGlvbklkKSB7XG4gIHJldHVybiBnZXQoQ2F0ZWdvcnkuRnVuY3Rpb25zLCBmdW5jdGlvbk5hbWUsIGFwcGxpY2F0aW9uSWQpO1xufVxuXG5leHBvcnQgZnVuY3Rpb24gZ2V0RnVuY3Rpb25OYW1lcyhhcHBsaWNhdGlvbklkKSB7XG4gIGNvbnN0IHN0b3JlID1cbiAgICAoX3RyaWdnZXJTdG9yZVthcHBsaWNhdGlvbklkXSAmJiBfdHJpZ2dlclN0b3JlW2FwcGxpY2F0aW9uSWRdW0NhdGVnb3J5LkZ1bmN0aW9uc10pIHx8IHt9O1xuICBjb25zdCBmdW5jdGlvbk5hbWVzID0gW107XG4gIGNvbnN0IGV4dHJhY3RGdW5jdGlvbk5hbWVzID0gKG5hbWVzcGFjZSwgc3RvcmUpID0+IHtcbiAgICBPYmplY3Qua2V5cyhzdG9yZSkuZm9yRWFjaChuYW1lID0+IHtcbiAgICAgIGNvbnN0IHZhbHVlID0gc3RvcmVbbmFtZV07XG4gICAgICBpZiAobmFtZXNwYWNlKSB7XG4gICAgICAgIG5hbWUgPSBgJHtuYW1lc3BhY2V9LiR7bmFtZX1gO1xuICAgICAgfVxuICAgICAgaWYgKHR5cGVvZiB2YWx1ZSA9PT0gJ2Z1bmN0aW9uJykge1xuICAgICAgICBmdW5jdGlvbk5hbWVzLnB1c2gobmFtZSk7XG4gICAgICB9IGVsc2Uge1xuICAgICAgICBleHRyYWN0RnVuY3Rpb25OYW1lcyhuYW1lLCB2YWx1ZSk7XG4gICAgICB9XG4gICAgfSk7XG4gIH07XG4gIGV4dHJhY3RGdW5jdGlvbk5hbWVzKG51bGwsIHN0b3JlKTtcbiAgcmV0dXJuIGZ1bmN0aW9uTmFtZXM7XG59XG5cbmV4cG9ydCBmdW5jdGlvbiBnZXRKb2Ioam9iTmFtZSwgYXBwbGljYXRpb25JZCkge1xuICByZXR1cm4gZ2V0KENhdGVnb3J5LkpvYnMsIGpvYk5hbWUsIGFwcGxpY2F0aW9uSWQpO1xufVxuXG5leHBvcnQgZnVuY3Rpb24gZ2V0Sm9icyhhcHBsaWNhdGlvbklkKSB7XG4gIHZhciBtYW5hZ2VyID0gX3RyaWdnZXJTdG9yZVthcHBsaWNhdGlvbklkXTtcbiAgaWYgKG1hbmFnZXIgJiYgbWFuYWdlci5Kb2JzKSB7XG4gICAgcmV0dXJuIG1hbmFnZXIuSm9icztcbiAgfVxuICByZXR1cm4gdW5kZWZpbmVkO1xufVxuXG5leHBvcnQgZnVuY3Rpb24gZ2V0VmFsaWRhdG9yKGZ1bmN0aW9uTmFtZSwgYXBwbGljYXRpb25JZCkge1xuICByZXR1cm4gZ2V0KENhdGVnb3J5LlZhbGlkYXRvcnMsIGZ1bmN0aW9uTmFtZSwgYXBwbGljYXRpb25JZCk7XG59XG5cbmV4cG9ydCBmdW5jdGlvbiBnZXRSZXF1ZXN0T2JqZWN0KFxuICB0cmlnZ2VyVHlwZSxcbiAgYXV0aCxcbiAgcGFyc2VPYmplY3QsXG4gIG9yaWdpbmFsUGFyc2VPYmplY3QsXG4gIGNvbmZpZyxcbiAgY29udGV4dFxuKSB7XG4gIGNvbnN0IHJlcXVlc3QgPSB7XG4gICAgdHJpZ2dlck5hbWU6IHRyaWdnZXJUeXBlLFxuICAgIG9iamVjdDogcGFyc2VPYmplY3QsXG4gICAgbWFzdGVyOiBmYWxzZSxcbiAgICBsb2c6IGNvbmZpZy5sb2dnZXJDb250cm9sbGVyLFxuICAgIGhlYWRlcnM6IGNvbmZpZy5oZWFkZXJzLFxuICAgIGlwOiBjb25maWcuaXAsXG4gIH07XG5cbiAgaWYgKG9yaWdpbmFsUGFyc2VPYmplY3QpIHtcbiAgICByZXF1ZXN0Lm9yaWdpbmFsID0gb3JpZ2luYWxQYXJzZU9iamVjdDtcbiAgfVxuXG4gIGlmIChcbiAgICB0cmlnZ2VyVHlwZSA9PT0gVHlwZXMuYmVmb3JlU2F2ZSB8fFxuICAgIHRyaWdnZXJUeXBlID09PSBUeXBlcy5hZnRlclNhdmUgfHxcbiAgICB0cmlnZ2VyVHlwZSA9PT0gVHlwZXMuYmVmb3JlRGVsZXRlIHx8XG4gICAgdHJpZ2dlclR5cGUgPT09IFR5cGVzLmFmdGVyRGVsZXRlXG4gICkge1xuICAgIC8vIFNldCBhIGNvcHkgb2YgdGhlIGNvbnRleHQgb24gdGhlIHJlcXVlc3Qgb2JqZWN0LlxuICAgIHJlcXVlc3QuY29udGV4dCA9IE9iamVjdC5hc3NpZ24oe30sIGNvbnRleHQpO1xuICB9XG5cbiAgaWYgKCFhdXRoKSB7XG4gICAgcmV0dXJuIHJlcXVlc3Q7XG4gIH1cbiAgaWYgKGF1dGguaXNNYXN0ZXIpIHtcbiAgICByZXF1ZXN0WydtYXN0ZXInXSA9IHRydWU7XG4gIH1cbiAgaWYgKGF1dGgudXNlcikge1xuICAgIHJlcXVlc3RbJ3VzZXInXSA9IGF1dGgudXNlcjtcbiAgfVxuICBpZiAoYXV0aC5pbnN0YWxsYXRpb25JZCkge1xuICAgIHJlcXVlc3RbJ2luc3RhbGxhdGlvbklkJ10gPSBhdXRoLmluc3RhbGxhdGlvbklkO1xuICB9XG4gIHJldHVybiByZXF1ZXN0O1xufVxuXG5leHBvcnQgZnVuY3Rpb24gZ2V0UmVxdWVzdFF1ZXJ5T2JqZWN0KHRyaWdnZXJUeXBlLCBhdXRoLCBxdWVyeSwgY291bnQsIGNvbmZpZywgY29udGV4dCwgaXNHZXQpIHtcbiAgaXNHZXQgPSAhIWlzR2V0O1xuXG4gIHZhciByZXF1ZXN0ID0ge1xuICAgIHRyaWdnZXJOYW1lOiB0cmlnZ2VyVHlwZSxcbiAgICBxdWVyeSxcbiAgICBtYXN0ZXI6IGZhbHNlLFxuICAgIGNvdW50LFxuICAgIGxvZzogY29uZmlnLmxvZ2dlckNvbnRyb2xsZXIsXG4gICAgaXNHZXQsXG4gICAgaGVhZGVyczogY29uZmlnLmhlYWRlcnMsXG4gICAgaXA6IGNvbmZpZy5pcCxcbiAgICBjb250ZXh0OiBjb250ZXh0IHx8IHt9LFxuICB9O1xuXG4gIGlmICghYXV0aCkge1xuICAgIHJldHVybiByZXF1ZXN0O1xuICB9XG4gIGlmIChhdXRoLmlzTWFzdGVyKSB7XG4gICAgcmVxdWVzdFsnbWFzdGVyJ10gPSB0cnVlO1xuICB9XG4gIGlmIChhdXRoLnVzZXIpIHtcbiAgICByZXF1ZXN0Wyd1c2VyJ10gPSBhdXRoLnVzZXI7XG4gIH1cbiAgaWYgKGF1dGguaW5zdGFsbGF0aW9uSWQpIHtcbiAgICByZXF1ZXN0WydpbnN0YWxsYXRpb25JZCddID0gYXV0aC5pbnN0YWxsYXRpb25JZDtcbiAgfVxuICByZXR1cm4gcmVxdWVzdDtcbn1cblxuLy8gQ3JlYXRlcyB0aGUgcmVzcG9uc2Ugb2JqZWN0LCBhbmQgdXNlcyB0aGUgcmVxdWVzdCBvYmplY3QgdG8gcGFzcyBkYXRhXG4vLyBUaGUgQVBJIHdpbGwgY2FsbCB0aGlzIHdpdGggUkVTVCBBUEkgZm9ybWF0dGVkIG9iamVjdHMsIHRoaXMgd2lsbFxuLy8gdHJhbnNmb3JtIHRoZW0gdG8gUGFyc2UuT2JqZWN0IGluc3RhbmNlcyBleHBlY3RlZCBieSBDbG91ZCBDb2RlLlxuLy8gQW55IGNoYW5nZXMgbWFkZSB0byB0aGUgb2JqZWN0IGluIGEgYmVmb3JlU2F2ZSB3aWxsIGJlIGluY2x1ZGVkLlxuZXhwb3J0IGZ1bmN0aW9uIGdldFJlc3BvbnNlT2JqZWN0KHJlcXVlc3QsIHJlc29sdmUsIHJlamVjdCkge1xuICByZXR1cm4ge1xuICAgIHN1Y2Nlc3M6IGZ1bmN0aW9uIChyZXNwb25zZSkge1xuICAgICAgaWYgKHJlcXVlc3QudHJpZ2dlck5hbWUgPT09IFR5cGVzLmFmdGVyRmluZCkge1xuICAgICAgICBpZiAoIXJlc3BvbnNlKSB7XG4gICAgICAgICAgcmVzcG9uc2UgPSByZXF1ZXN0Lm9iamVjdHM7XG4gICAgICAgIH1cbiAgICAgICAgcmVzcG9uc2UgPSByZXNwb25zZS5tYXAob2JqZWN0ID0+IHtcbiAgICAgICAgICByZXR1cm4gb2JqZWN0LnRvSlNPTigpO1xuICAgICAgICB9KTtcbiAgICAgICAgcmV0dXJuIHJlc29sdmUocmVzcG9uc2UpO1xuICAgICAgfVxuICAgICAgLy8gVXNlIHRoZSBKU09OIHJlc3BvbnNlXG4gICAgICBpZiAoXG4gICAgICAgIHJlc3BvbnNlICYmXG4gICAgICAgIHR5cGVvZiByZXNwb25zZSA9PT0gJ29iamVjdCcgJiZcbiAgICAgICAgIXJlcXVlc3Qub2JqZWN0LmVxdWFscyhyZXNwb25zZSkgJiZcbiAgICAgICAgcmVxdWVzdC50cmlnZ2VyTmFtZSA9PT0gVHlwZXMuYmVmb3JlU2F2ZVxuICAgICAgKSB7XG4gICAgICAgIHJldHVybiByZXNvbHZlKHJlc3BvbnNlKTtcbiAgICAgIH1cbiAgICAgIGlmIChyZXNwb25zZSAmJiB0eXBlb2YgcmVzcG9uc2UgPT09ICdvYmplY3QnICYmIHJlcXVlc3QudHJpZ2dlck5hbWUgPT09IFR5cGVzLmFmdGVyU2F2ZSkge1xuICAgICAgICByZXR1cm4gcmVzb2x2ZShyZXNwb25zZSk7XG4gICAgICB9XG4gICAgICBpZiAocmVxdWVzdC50cmlnZ2VyTmFtZSA9PT0gVHlwZXMuYWZ0ZXJTYXZlKSB7XG4gICAgICAgIHJldHVybiByZXNvbHZlKCk7XG4gICAgICB9XG4gICAgICByZXNwb25zZSA9IHt9O1xuICAgICAgaWYgKHJlcXVlc3QudHJpZ2dlck5hbWUgPT09IFR5cGVzLmJlZm9yZVNhdmUpIHtcbiAgICAgICAgcmVzcG9uc2VbJ29iamVjdCddID0gcmVxdWVzdC5vYmplY3QuX2dldFNhdmVKU09OKCk7XG4gICAgICB9XG4gICAgICByZXR1cm4gcmVzb2x2ZShyZXNwb25zZSk7XG4gICAgfSxcbiAgICBlcnJvcjogZnVuY3Rpb24gKGVycm9yKSB7XG4gICAgICBjb25zdCBlID0gcmVzb2x2ZUVycm9yKGVycm9yLCB7XG4gICAgICAgIGNvZGU6IFBhcnNlLkVycm9yLlNDUklQVF9GQUlMRUQsXG4gICAgICAgIG1lc3NhZ2U6ICdTY3JpcHQgZmFpbGVkLiBVbmtub3duIGVycm9yLicsXG4gICAgICB9KTtcbiAgICAgIHJlamVjdChlKTtcbiAgICB9LFxuICB9O1xufVxuXG5mdW5jdGlvbiB1c2VySWRGb3JMb2coYXV0aCkge1xuICByZXR1cm4gYXV0aCAmJiBhdXRoLnVzZXIgPyBhdXRoLnVzZXIuaWQgOiB1bmRlZmluZWQ7XG59XG5cbmZ1bmN0aW9uIGxvZ1RyaWdnZXJBZnRlckhvb2sodHJpZ2dlclR5cGUsIGNsYXNzTmFtZSwgaW5wdXQsIGF1dGgpIHtcbiAgY29uc3QgY2xlYW5JbnB1dCA9IGxvZ2dlci50cnVuY2F0ZUxvZ01lc3NhZ2UoSlNPTi5zdHJpbmdpZnkoaW5wdXQpKTtcbiAgbG9nZ2VyLmluZm8oXG4gICAgYCR7dHJpZ2dlclR5cGV9IHRyaWdnZXJlZCBmb3IgJHtjbGFzc05hbWV9IGZvciB1c2VyICR7dXNlcklkRm9yTG9nKFxuICAgICAgYXV0aFxuICAgICl9OlxcbiAgSW5wdXQ6ICR7Y2xlYW5JbnB1dH1gLFxuICAgIHtcbiAgICAgIGNsYXNzTmFtZSxcbiAgICAgIHRyaWdnZXJUeXBlLFxuICAgICAgdXNlcjogdXNlcklkRm9yTG9nKGF1dGgpLFxuICAgIH1cbiAgKTtcbn1cblxuZnVuY3Rpb24gbG9nVHJpZ2dlclN1Y2Nlc3NCZWZvcmVIb29rKHRyaWdnZXJUeXBlLCBjbGFzc05hbWUsIGlucHV0LCByZXN1bHQsIGF1dGgpIHtcbiAgY29uc3QgY2xlYW5JbnB1dCA9IGxvZ2dlci50cnVuY2F0ZUxvZ01lc3NhZ2UoSlNPTi5zdHJpbmdpZnkoaW5wdXQpKTtcbiAgY29uc3QgY2xlYW5SZXN1bHQgPSBsb2dnZXIudHJ1bmNhdGVMb2dNZXNzYWdlKEpTT04uc3RyaW5naWZ5KHJlc3VsdCkpO1xuICBsb2dnZXIuaW5mbyhcbiAgICBgJHt0cmlnZ2VyVHlwZX0gdHJpZ2dlcmVkIGZvciAke2NsYXNzTmFtZX0gZm9yIHVzZXIgJHt1c2VySWRGb3JMb2coXG4gICAgICBhdXRoXG4gICAgKX06XFxuICBJbnB1dDogJHtjbGVhbklucHV0fVxcbiAgUmVzdWx0OiAke2NsZWFuUmVzdWx0fWAsXG4gICAge1xuICAgICAgY2xhc3NOYW1lLFxuICAgICAgdHJpZ2dlclR5cGUsXG4gICAgICB1c2VyOiB1c2VySWRGb3JMb2coYXV0aCksXG4gICAgfVxuICApO1xufVxuXG5mdW5jdGlvbiBsb2dUcmlnZ2VyRXJyb3JCZWZvcmVIb29rKHRyaWdnZXJUeXBlLCBjbGFzc05hbWUsIGlucHV0LCBhdXRoLCBlcnJvcikge1xuICBjb25zdCBjbGVhbklucHV0ID0gbG9nZ2VyLnRydW5jYXRlTG9nTWVzc2FnZShKU09OLnN0cmluZ2lmeShpbnB1dCkpO1xuICBsb2dnZXIuZXJyb3IoXG4gICAgYCR7dHJpZ2dlclR5cGV9IGZhaWxlZCBmb3IgJHtjbGFzc05hbWV9IGZvciB1c2VyICR7dXNlcklkRm9yTG9nKFxuICAgICAgYXV0aFxuICAgICl9OlxcbiAgSW5wdXQ6ICR7Y2xlYW5JbnB1dH1cXG4gIEVycm9yOiAke0pTT04uc3RyaW5naWZ5KGVycm9yKX1gLFxuICAgIHtcbiAgICAgIGNsYXNzTmFtZSxcbiAgICAgIHRyaWdnZXJUeXBlLFxuICAgICAgZXJyb3IsXG4gICAgICB1c2VyOiB1c2VySWRGb3JMb2coYXV0aCksXG4gICAgfVxuICApO1xufVxuXG5leHBvcnQgZnVuY3Rpb24gbWF5YmVSdW5BZnRlckZpbmRUcmlnZ2VyKHRyaWdnZXJUeXBlLCBhdXRoLCBjbGFzc05hbWUsIG9iamVjdHMsIGNvbmZpZywgcXVlcnkpIHtcbiAgcmV0dXJuIG5ldyBQcm9taXNlKChyZXNvbHZlLCByZWplY3QpID0+IHtcbiAgICBjb25zdCB0cmlnZ2VyID0gZ2V0VHJpZ2dlcihjbGFzc05hbWUsIHRyaWdnZXJUeXBlLCBjb25maWcuYXBwbGljYXRpb25JZCk7XG4gICAgaWYgKCF0cmlnZ2VyKSB7XG4gICAgICByZXR1cm4gcmVzb2x2ZSgpO1xuICAgIH1cbiAgICBjb25zdCByZXF1ZXN0ID0gZ2V0UmVxdWVzdE9iamVjdCh0cmlnZ2VyVHlwZSwgYXV0aCwgbnVsbCwgbnVsbCwgY29uZmlnKTtcbiAgICBpZiAocXVlcnkpIHtcbiAgICAgIHJlcXVlc3QucXVlcnkgPSBxdWVyeTtcbiAgICB9XG4gICAgY29uc3QgeyBzdWNjZXNzLCBlcnJvciB9ID0gZ2V0UmVzcG9uc2VPYmplY3QoXG4gICAgICByZXF1ZXN0LFxuICAgICAgb2JqZWN0ID0+IHtcbiAgICAgICAgcmVzb2x2ZShvYmplY3QpO1xuICAgICAgfSxcbiAgICAgIGVycm9yID0+IHtcbiAgICAgICAgcmVqZWN0KGVycm9yKTtcbiAgICAgIH1cbiAgICApO1xuICAgIGxvZ1RyaWdnZXJTdWNjZXNzQmVmb3JlSG9vayh0cmlnZ2VyVHlwZSwgY2xhc3NOYW1lLCAnQWZ0ZXJGaW5kJywgSlNPTi5zdHJpbmdpZnkob2JqZWN0cyksIGF1dGgpO1xuICAgIHJlcXVlc3Qub2JqZWN0cyA9IG9iamVjdHMubWFwKG9iamVjdCA9PiB7XG4gICAgICAvL3NldHRpbmcgdGhlIGNsYXNzIG5hbWUgdG8gdHJhbnNmb3JtIGludG8gcGFyc2Ugb2JqZWN0XG4gICAgICBvYmplY3QuY2xhc3NOYW1lID0gY2xhc3NOYW1lO1xuICAgICAgcmV0dXJuIFBhcnNlLk9iamVjdC5mcm9tSlNPTihvYmplY3QpO1xuICAgIH0pO1xuICAgIHJldHVybiBQcm9taXNlLnJlc29sdmUoKVxuICAgICAgLnRoZW4oKCkgPT4ge1xuICAgICAgICByZXR1cm4gbWF5YmVSdW5WYWxpZGF0b3IocmVxdWVzdCwgYCR7dHJpZ2dlclR5cGV9LiR7Y2xhc3NOYW1lfWApO1xuICAgICAgfSlcbiAgICAgIC50aGVuKCgpID0+IHtcbiAgICAgICAgaWYgKHJlcXVlc3Quc2tpcFdpdGhNYXN0ZXJLZXkpIHtcbiAgICAgICAgICByZXR1cm4gcmVxdWVzdC5vYmplY3RzO1xuICAgICAgICB9XG4gICAgICAgIGNvbnN0IHJlc3BvbnNlID0gdHJpZ2dlcihyZXF1ZXN0KTtcbiAgICAgICAgaWYgKHJlc3BvbnNlICYmIHR5cGVvZiByZXNwb25zZS50aGVuID09PSAnZnVuY3Rpb24nKSB7XG4gICAgICAgICAgcmV0dXJuIHJlc3BvbnNlLnRoZW4ocmVzdWx0cyA9PiB7XG4gICAgICAgICAgICBpZiAoIXJlc3VsdHMpIHtcbiAgICAgICAgICAgICAgdGhyb3cgbmV3IFBhcnNlLkVycm9yKFxuICAgICAgICAgICAgICAgIFBhcnNlLkVycm9yLlNDUklQVF9GQUlMRUQsXG4gICAgICAgICAgICAgICAgJ0FmdGVyRmluZCBleHBlY3QgcmVzdWx0cyB0byBiZSByZXR1cm5lZCBpbiB0aGUgcHJvbWlzZSdcbiAgICAgICAgICAgICAgKTtcbiAgICAgICAgICAgIH1cbiAgICAgICAgICAgIHJldHVybiByZXN1bHRzO1xuICAgICAgICAgIH0pO1xuICAgICAgICB9XG4gICAgICAgIHJldHVybiByZXNwb25zZTtcbiAgICAgIH0pXG4gICAgICAudGhlbihzdWNjZXNzLCBlcnJvcik7XG4gIH0pLnRoZW4ocmVzdWx0cyA9PiB7XG4gICAgbG9nVHJpZ2dlckFmdGVySG9vayh0cmlnZ2VyVHlwZSwgY2xhc3NOYW1lLCBKU09OLnN0cmluZ2lmeShyZXN1bHRzKSwgYXV0aCk7XG4gICAgcmV0dXJuIHJlc3VsdHM7XG4gIH0pO1xufVxuXG5leHBvcnQgZnVuY3Rpb24gbWF5YmVSdW5RdWVyeVRyaWdnZXIoXG4gIHRyaWdnZXJUeXBlLFxuICBjbGFzc05hbWUsXG4gIHJlc3RXaGVyZSxcbiAgcmVzdE9wdGlvbnMsXG4gIGNvbmZpZyxcbiAgYXV0aCxcbiAgY29udGV4dCxcbiAgaXNHZXRcbikge1xuICBjb25zdCB0cmlnZ2VyID0gZ2V0VHJpZ2dlcihjbGFzc05hbWUsIHRyaWdnZXJUeXBlLCBjb25maWcuYXBwbGljYXRpb25JZCk7XG4gIGlmICghdHJpZ2dlcikge1xuICAgIHJldHVybiBQcm9taXNlLnJlc29sdmUoe1xuICAgICAgcmVzdFdoZXJlLFxuICAgICAgcmVzdE9wdGlvbnMsXG4gICAgfSk7XG4gIH1cbiAgY29uc3QganNvbiA9IE9iamVjdC5hc3NpZ24oe30sIHJlc3RPcHRpb25zKTtcbiAganNvbi53aGVyZSA9IHJlc3RXaGVyZTtcblxuICBjb25zdCBwYXJzZVF1ZXJ5ID0gbmV3IFBhcnNlLlF1ZXJ5KGNsYXNzTmFtZSk7XG4gIHBhcnNlUXVlcnkud2l0aEpTT04oanNvbik7XG5cbiAgbGV0IGNvdW50ID0gZmFsc2U7XG4gIGlmIChyZXN0T3B0aW9ucykge1xuICAgIGNvdW50ID0gISFyZXN0T3B0aW9ucy5jb3VudDtcbiAgfVxuICBjb25zdCByZXF1ZXN0T2JqZWN0ID0gZ2V0UmVxdWVzdFF1ZXJ5T2JqZWN0KFxuICAgIHRyaWdnZXJUeXBlLFxuICAgIGF1dGgsXG4gICAgcGFyc2VRdWVyeSxcbiAgICBjb3VudCxcbiAgICBjb25maWcsXG4gICAgY29udGV4dCxcbiAgICBpc0dldFxuICApO1xuICByZXR1cm4gUHJvbWlzZS5yZXNvbHZlKClcbiAgICAudGhlbigoKSA9PiB7XG4gICAgICByZXR1cm4gbWF5YmVSdW5WYWxpZGF0b3IocmVxdWVzdE9iamVjdCwgYCR7dHJpZ2dlclR5cGV9LiR7Y2xhc3NOYW1lfWApO1xuICAgIH0pXG4gICAgLnRoZW4oKCkgPT4ge1xuICAgICAgaWYgKHJlcXVlc3RPYmplY3Quc2tpcFdpdGhNYXN0ZXJLZXkpIHtcbiAgICAgICAgcmV0dXJuIHJlcXVlc3RPYmplY3QucXVlcnk7XG4gICAgICB9XG4gICAgICByZXR1cm4gdHJpZ2dlcihyZXF1ZXN0T2JqZWN0KTtcbiAgICB9KVxuICAgIC50aGVuKFxuICAgICAgcmVzdWx0ID0+IHtcbiAgICAgICAgbGV0IHF1ZXJ5UmVzdWx0ID0gcGFyc2VRdWVyeTtcbiAgICAgICAgaWYgKHJlc3VsdCAmJiByZXN1bHQgaW5zdGFuY2VvZiBQYXJzZS5RdWVyeSkge1xuICAgICAgICAgIHF1ZXJ5UmVzdWx0ID0gcmVzdWx0O1xuICAgICAgICB9XG4gICAgICAgIGNvbnN0IGpzb25RdWVyeSA9IHF1ZXJ5UmVzdWx0LnRvSlNPTigpO1xuICAgICAgICBpZiAoanNvblF1ZXJ5LndoZXJlKSB7XG4gICAgICAgICAgcmVzdFdoZXJlID0ganNvblF1ZXJ5LndoZXJlO1xuICAgICAgICB9XG4gICAgICAgIGlmIChqc29uUXVlcnkubGltaXQpIHtcbiAgICAgICAgICByZXN0T3B0aW9ucyA9IHJlc3RPcHRpb25zIHx8IHt9O1xuICAgICAgICAgIHJlc3RPcHRpb25zLmxpbWl0ID0ganNvblF1ZXJ5LmxpbWl0O1xuICAgICAgICB9XG4gICAgICAgIGlmIChqc29uUXVlcnkuc2tpcCkge1xuICAgICAgICAgIHJlc3RPcHRpb25zID0gcmVzdE9wdGlvbnMgfHwge307XG4gICAgICAgICAgcmVzdE9wdGlvbnMuc2tpcCA9IGpzb25RdWVyeS5za2lwO1xuICAgICAgICB9XG4gICAgICAgIGlmIChqc29uUXVlcnkuaW5jbHVkZSkge1xuICAgICAgICAgIHJlc3RPcHRpb25zID0gcmVzdE9wdGlvbnMgfHwge307XG4gICAgICAgICAgcmVzdE9wdGlvbnMuaW5jbHVkZSA9IGpzb25RdWVyeS5pbmNsdWRlO1xuICAgICAgICB9XG4gICAgICAgIGlmIChqc29uUXVlcnkuZXhjbHVkZUtleXMpIHtcbiAgICAgICAgICByZXN0T3B0aW9ucyA9IHJlc3RPcHRpb25zIHx8IHt9O1xuICAgICAgICAgIHJlc3RPcHRpb25zLmV4Y2x1ZGVLZXlzID0ganNvblF1ZXJ5LmV4Y2x1ZGVLZXlzO1xuICAgICAgICB9XG4gICAgICAgIGlmIChqc29uUXVlcnkuZXhwbGFpbikge1xuICAgICAgICAgIHJlc3RPcHRpb25zID0gcmVzdE9wdGlvbnMgfHwge307XG4gICAgICAgICAgcmVzdE9wdGlvbnMuZXhwbGFpbiA9IGpzb25RdWVyeS5leHBsYWluO1xuICAgICAgICB9XG4gICAgICAgIGlmIChqc29uUXVlcnkua2V5cykge1xuICAgICAgICAgIHJlc3RPcHRpb25zID0gcmVzdE9wdGlvbnMgfHwge307XG4gICAgICAgICAgcmVzdE9wdGlvbnMua2V5cyA9IGpzb25RdWVyeS5rZXlzO1xuICAgICAgICB9XG4gICAgICAgIGlmIChqc29uUXVlcnkub3JkZXIpIHtcbiAgICAgICAgICByZXN0T3B0aW9ucyA9IHJlc3RPcHRpb25zIHx8IHt9O1xuICAgICAgICAgIHJlc3RPcHRpb25zLm9yZGVyID0ganNvblF1ZXJ5Lm9yZGVyO1xuICAgICAgICB9XG4gICAgICAgIGlmIChqc29uUXVlcnkuaGludCkge1xuICAgICAgICAgIHJlc3RPcHRpb25zID0gcmVzdE9wdGlvbnMgfHwge307XG4gICAgICAgICAgcmVzdE9wdGlvbnMuaGludCA9IGpzb25RdWVyeS5oaW50O1xuICAgICAgICB9XG4gICAgICAgIGlmIChyZXF1ZXN0T2JqZWN0LnJlYWRQcmVmZXJlbmNlKSB7XG4gICAgICAgICAgcmVzdE9wdGlvbnMgPSByZXN0T3B0aW9ucyB8fCB7fTtcbiAgICAgICAgICByZXN0T3B0aW9ucy5yZWFkUHJlZmVyZW5jZSA9IHJlcXVlc3RPYmplY3QucmVhZFByZWZlcmVuY2U7XG4gICAgICAgIH1cbiAgICAgICAgaWYgKHJlcXVlc3RPYmplY3QuaW5jbHVkZVJlYWRQcmVmZXJlbmNlKSB7XG4gICAgICAgICAgcmVzdE9wdGlvbnMgPSByZXN0T3B0aW9ucyB8fCB7fTtcbiAgICAgICAgICByZXN0T3B0aW9ucy5pbmNsdWRlUmVhZFByZWZlcmVuY2UgPSByZXF1ZXN0T2JqZWN0LmluY2x1ZGVSZWFkUHJlZmVyZW5jZTtcbiAgICAgICAgfVxuICAgICAgICBpZiAocmVxdWVzdE9iamVjdC5zdWJxdWVyeVJlYWRQcmVmZXJlbmNlKSB7XG4gICAgICAgICAgcmVzdE9wdGlvbnMgPSByZXN0T3B0aW9ucyB8fCB7fTtcbiAgICAgICAgICByZXN0T3B0aW9ucy5zdWJxdWVyeVJlYWRQcmVmZXJlbmNlID0gcmVxdWVzdE9iamVjdC5zdWJxdWVyeVJlYWRQcmVmZXJlbmNlO1xuICAgICAgICB9XG4gICAgICAgIHJldHVybiB7XG4gICAgICAgICAgcmVzdFdoZXJlLFxuICAgICAgICAgIHJlc3RPcHRpb25zLFxuICAgICAgICB9O1xuICAgICAgfSxcbiAgICAgIGVyciA9PiB7XG4gICAgICAgIGNvbnN0IGVycm9yID0gcmVzb2x2ZUVycm9yKGVyciwge1xuICAgICAgICAgIGNvZGU6IFBhcnNlLkVycm9yLlNDUklQVF9GQUlMRUQsXG4gICAgICAgICAgbWVzc2FnZTogJ1NjcmlwdCBmYWlsZWQuIFVua25vd24gZXJyb3IuJyxcbiAgICAgICAgfSk7XG4gICAgICAgIHRocm93IGVycm9yO1xuICAgICAgfVxuICAgICk7XG59XG5cbmV4cG9ydCBmdW5jdGlvbiByZXNvbHZlRXJyb3IobWVzc2FnZSwgZGVmYXVsdE9wdHMpIHtcbiAgaWYgKCFkZWZhdWx0T3B0cykge1xuICAgIGRlZmF1bHRPcHRzID0ge307XG4gIH1cbiAgaWYgKCFtZXNzYWdlKSB7XG4gICAgcmV0dXJuIG5ldyBQYXJzZS5FcnJvcihcbiAgICAgIGRlZmF1bHRPcHRzLmNvZGUgfHwgUGFyc2UuRXJyb3IuU0NSSVBUX0ZBSUxFRCxcbiAgICAgIGRlZmF1bHRPcHRzLm1lc3NhZ2UgfHwgJ1NjcmlwdCBmYWlsZWQuJ1xuICAgICk7XG4gIH1cbiAgaWYgKG1lc3NhZ2UgaW5zdGFuY2VvZiBQYXJzZS5FcnJvcikge1xuICAgIHJldHVybiBtZXNzYWdlO1xuICB9XG5cbiAgY29uc3QgY29kZSA9IGRlZmF1bHRPcHRzLmNvZGUgfHwgUGFyc2UuRXJyb3IuU0NSSVBUX0ZBSUxFRDtcbiAgLy8gSWYgaXQncyBhbiBlcnJvciwgbWFyayBpdCBhcyBhIHNjcmlwdCBmYWlsZWRcbiAgaWYgKHR5cGVvZiBtZXNzYWdlID09PSAnc3RyaW5nJykge1xuICAgIHJldHVybiBuZXcgUGFyc2UuRXJyb3IoY29kZSwgbWVzc2FnZSk7XG4gIH1cbiAgY29uc3QgZXJyb3IgPSBuZXcgUGFyc2UuRXJyb3IoY29kZSwgbWVzc2FnZS5tZXNzYWdlIHx8IG1lc3NhZ2UpO1xuICBpZiAobWVzc2FnZSBpbnN0YW5jZW9mIEVycm9yKSB7XG4gICAgZXJyb3Iuc3RhY2sgPSBtZXNzYWdlLnN0YWNrO1xuICB9XG4gIHJldHVybiBlcnJvcjtcbn1cbmV4cG9ydCBmdW5jdGlvbiBtYXliZVJ1blZhbGlkYXRvcihyZXF1ZXN0LCBmdW5jdGlvbk5hbWUpIHtcbiAgY29uc3QgdGhlVmFsaWRhdG9yID0gZ2V0VmFsaWRhdG9yKGZ1bmN0aW9uTmFtZSwgUGFyc2UuYXBwbGljYXRpb25JZCk7XG4gIGlmICghdGhlVmFsaWRhdG9yKSB7XG4gICAgcmV0dXJuO1xuICB9XG4gIGlmICh0eXBlb2YgdGhlVmFsaWRhdG9yID09PSAnb2JqZWN0JyAmJiB0aGVWYWxpZGF0b3Iuc2tpcFdpdGhNYXN0ZXJLZXkgJiYgcmVxdWVzdC5tYXN0ZXIpIHtcbiAgICByZXF1ZXN0LnNraXBXaXRoTWFzdGVyS2V5ID0gdHJ1ZTtcbiAgfVxuICByZXR1cm4gbmV3IFByb21pc2UoKHJlc29sdmUsIHJlamVjdCkgPT4ge1xuICAgIHJldHVybiBQcm9taXNlLnJlc29sdmUoKVxuICAgICAgLnRoZW4oKCkgPT4ge1xuICAgICAgICByZXR1cm4gdHlwZW9mIHRoZVZhbGlkYXRvciA9PT0gJ29iamVjdCdcbiAgICAgICAgICA/IGJ1aWx0SW5UcmlnZ2VyVmFsaWRhdG9yKHRoZVZhbGlkYXRvciwgcmVxdWVzdClcbiAgICAgICAgICA6IHRoZVZhbGlkYXRvcihyZXF1ZXN0KTtcbiAgICAgIH0pXG4gICAgICAudGhlbigoKSA9PiB7XG4gICAgICAgIHJlc29sdmUoKTtcbiAgICAgIH0pXG4gICAgICAuY2F0Y2goZSA9PiB7XG4gICAgICAgIGNvbnN0IGVycm9yID0gcmVzb2x2ZUVycm9yKGUsIHtcbiAgICAgICAgICBjb2RlOiBQYXJzZS5FcnJvci5WQUxJREFUSU9OX0VSUk9SLFxuICAgICAgICAgIG1lc3NhZ2U6ICdWYWxpZGF0aW9uIGZhaWxlZC4nLFxuICAgICAgICB9KTtcbiAgICAgICAgcmVqZWN0KGVycm9yKTtcbiAgICAgIH0pO1xuICB9KTtcbn1cbmZ1bmN0aW9uIGJ1aWx0SW5UcmlnZ2VyVmFsaWRhdG9yKG9wdGlvbnMsIHJlcXVlc3QpIHtcbiAgaWYgKHJlcXVlc3QubWFzdGVyICYmICFvcHRpb25zLnZhbGlkYXRlTWFzdGVyS2V5KSB7XG4gICAgcmV0dXJuO1xuICB9XG4gIGxldCByZXFVc2VyID0gcmVxdWVzdC51c2VyO1xuICBpZiAoXG4gICAgIXJlcVVzZXIgJiZcbiAgICByZXF1ZXN0Lm9iamVjdCAmJlxuICAgIHJlcXVlc3Qub2JqZWN0LmNsYXNzTmFtZSA9PT0gJ19Vc2VyJyAmJlxuICAgICFyZXF1ZXN0Lm9iamVjdC5leGlzdGVkKClcbiAgKSB7XG4gICAgcmVxVXNlciA9IHJlcXVlc3Qub2JqZWN0O1xuICB9XG4gIGlmIChvcHRpb25zLnJlcXVpcmVVc2VyICYmICFyZXFVc2VyKSB7XG4gICAgdGhyb3cgJ1ZhbGlkYXRpb24gZmFpbGVkLiBQbGVhc2UgbG9naW4gdG8gY29udGludWUuJztcbiAgfVxuICBpZiAob3B0aW9ucy5yZXF1aXJlTWFzdGVyICYmICFyZXF1ZXN0Lm1hc3Rlcikge1xuICAgIHRocm93ICdWYWxpZGF0aW9uIGZhaWxlZC4gTWFzdGVyIGtleSBpcyByZXF1aXJlZCB0byBjb21wbGV0ZSB0aGlzIHJlcXVlc3QuJztcbiAgfVxuICBsZXQgcGFyYW1zID0gcmVxdWVzdC5wYXJhbXMgfHwge307XG4gIGlmIChyZXF1ZXN0Lm9iamVjdCkge1xuICAgIHBhcmFtcyA9IHJlcXVlc3Qub2JqZWN0LnRvSlNPTigpO1xuICB9XG4gIGNvbnN0IHJlcXVpcmVkUGFyYW0gPSBrZXkgPT4ge1xuICAgIGNvbnN0IHZhbHVlID0gcGFyYW1zW2tleV07XG4gICAgaWYgKHZhbHVlID09IG51bGwpIHtcbiAgICAgIHRocm93IGBWYWxpZGF0aW9uIGZhaWxlZC4gUGxlYXNlIHNwZWNpZnkgZGF0YSBmb3IgJHtrZXl9LmA7XG4gICAgfVxuICB9O1xuXG4gIGNvbnN0IHZhbGlkYXRlT3B0aW9ucyA9IChvcHQsIGtleSwgdmFsKSA9PiB7XG4gICAgbGV0IG9wdHMgPSBvcHQub3B0aW9ucztcbiAgICBpZiAodHlwZW9mIG9wdHMgPT09ICdmdW5jdGlvbicpIHtcbiAgICAgIHRyeSB7XG4gICAgICAgIGNvbnN0IHJlc3VsdCA9IG9wdHModmFsKTtcbiAgICAgICAgaWYgKCFyZXN1bHQgJiYgcmVzdWx0ICE9IG51bGwpIHtcbiAgICAgICAgICB0aHJvdyBvcHQuZXJyb3IgfHwgYFZhbGlkYXRpb24gZmFpbGVkLiBJbnZhbGlkIHZhbHVlIGZvciAke2tleX0uYDtcbiAgICAgICAgfVxuICAgICAgfSBjYXRjaCAoZSkge1xuICAgICAgICBpZiAoIWUpIHtcbiAgICAgICAgICB0aHJvdyBvcHQuZXJyb3IgfHwgYFZhbGlkYXRpb24gZmFpbGVkLiBJbnZhbGlkIHZhbHVlIGZvciAke2tleX0uYDtcbiAgICAgICAgfVxuXG4gICAgICAgIHRocm93IG9wdC5lcnJvciB8fCBlLm1lc3NhZ2UgfHwgZTtcbiAgICAgIH1cbiAgICAgIHJldHVybjtcbiAgICB9XG4gICAgaWYgKCFBcnJheS5pc0FycmF5KG9wdHMpKSB7XG4gICAgICBvcHRzID0gW29wdC5vcHRpb25zXTtcbiAgICB9XG5cbiAgICBpZiAoIW9wdHMuaW5jbHVkZXModmFsKSkge1xuICAgICAgdGhyb3cgKFxuICAgICAgICBvcHQuZXJyb3IgfHwgYFZhbGlkYXRpb24gZmFpbGVkLiBJbnZhbGlkIG9wdGlvbiBmb3IgJHtrZXl9LiBFeHBlY3RlZDogJHtvcHRzLmpvaW4oJywgJyl9YFxuICAgICAgKTtcbiAgICB9XG4gIH07XG5cbiAgY29uc3QgZ2V0VHlwZSA9IGZuID0+IHtcbiAgICBjb25zdCBtYXRjaCA9IGZuICYmIGZuLnRvU3RyaW5nKCkubWF0Y2goL15cXHMqZnVuY3Rpb24gKFxcdyspLyk7XG4gICAgcmV0dXJuIChtYXRjaCA/IG1hdGNoWzFdIDogJycpLnRvTG93ZXJDYXNlKCk7XG4gIH07XG4gIGlmIChBcnJheS5pc0FycmF5KG9wdGlvbnMuZmllbGRzKSkge1xuICAgIGZvciAoY29uc3Qga2V5IG9mIG9wdGlvbnMuZmllbGRzKSB7XG4gICAgICByZXF1aXJlZFBhcmFtKGtleSk7XG4gICAgfVxuICB9IGVsc2Uge1xuICAgIGZvciAoY29uc3Qga2V5IGluIG9wdGlvbnMuZmllbGRzKSB7XG4gICAgICBjb25zdCBvcHQgPSBvcHRpb25zLmZpZWxkc1trZXldO1xuICAgICAgbGV0IHZhbCA9IHBhcmFtc1trZXldO1xuICAgICAgaWYgKHR5cGVvZiBvcHQgPT09ICdzdHJpbmcnKSB7XG4gICAgICAgIHJlcXVpcmVkUGFyYW0ob3B0KTtcbiAgICAgIH1cbiAgICAgIGlmICh0eXBlb2Ygb3B0ID09PSAnb2JqZWN0Jykge1xuICAgICAgICBpZiAob3B0LmRlZmF1bHQgIT0gbnVsbCAmJiB2YWwgPT0gbnVsbCkge1xuICAgICAgICAgIHZhbCA9IG9wdC5kZWZhdWx0O1xuICAgICAgICAgIHBhcmFtc1trZXldID0gdmFsO1xuICAgICAgICAgIGlmIChyZXF1ZXN0Lm9iamVjdCkge1xuICAgICAgICAgICAgcmVxdWVzdC5vYmplY3Quc2V0KGtleSwgdmFsKTtcbiAgICAgICAgICB9XG4gICAgICAgIH1cbiAgICAgICAgaWYgKG9wdC5jb25zdGFudCAmJiByZXF1ZXN0Lm9iamVjdCkge1xuICAgICAgICAgIGlmIChyZXF1ZXN0Lm9yaWdpbmFsKSB7XG4gICAgICAgICAgICByZXF1ZXN0Lm9iamVjdC5zZXQoa2V5LCByZXF1ZXN0Lm9yaWdpbmFsLmdldChrZXkpKTtcbiAgICAgICAgICB9IGVsc2UgaWYgKG9wdC5kZWZhdWx0ICE9IG51bGwpIHtcbiAgICAgICAgICAgIHJlcXVlc3Qub2JqZWN0LnNldChrZXksIG9wdC5kZWZhdWx0KTtcbiAgICAgICAgICB9XG4gICAgICAgIH1cbiAgICAgICAgaWYgKG9wdC5yZXF1aXJlZCkge1xuICAgICAgICAgIHJlcXVpcmVkUGFyYW0oa2V5KTtcbiAgICAgICAgfVxuICAgICAgICBpZiAob3B0LnR5cGUpIHtcbiAgICAgICAgICBjb25zdCB0eXBlID0gZ2V0VHlwZShvcHQudHlwZSk7XG4gICAgICAgICAgaWYgKHR5cGUgPT0gJ2FycmF5JyAmJiAhQXJyYXkuaXNBcnJheSh2YWwpKSB7XG4gICAgICAgICAgICB0aHJvdyBgVmFsaWRhdGlvbiBmYWlsZWQuIEludmFsaWQgdHlwZSBmb3IgJHtrZXl9LiBFeHBlY3RlZDogYXJyYXlgO1xuICAgICAgICAgIH0gZWxzZSBpZiAodHlwZW9mIHZhbCAhPT0gdHlwZSkge1xuICAgICAgICAgICAgdGhyb3cgYFZhbGlkYXRpb24gZmFpbGVkLiBJbnZhbGlkIHR5cGUgZm9yICR7a2V5fS4gRXhwZWN0ZWQ6ICR7dHlwZX1gO1xuICAgICAgICAgIH1cbiAgICAgICAgfVxuICAgICAgICBpZiAob3B0Lm9wdGlvbnMpIHtcbiAgICAgICAgICB2YWxpZGF0ZU9wdGlvbnMob3B0LCBrZXksIHZhbCk7XG4gICAgICAgIH1cbiAgICAgIH1cbiAgICB9XG4gIH1cbiAgY29uc3QgdXNlcktleXMgPSBvcHRpb25zLnJlcXVpcmVVc2VyS2V5cyB8fCBbXTtcbiAgaWYgKEFycmF5LmlzQXJyYXkodXNlcktleXMpKSB7XG4gICAgZm9yIChjb25zdCBrZXkgb2YgdXNlcktleXMpIHtcbiAgICAgIGlmICghcmVxVXNlcikge1xuICAgICAgICB0aHJvdyAnUGxlYXNlIGxvZ2luIHRvIG1ha2UgdGhpcyByZXF1ZXN0Lic7XG4gICAgICB9XG5cbiAgICAgIGlmIChyZXFVc2VyLmdldChrZXkpID09IG51bGwpIHtcbiAgICAgICAgdGhyb3cgYFZhbGlkYXRpb24gZmFpbGVkLiBQbGVhc2Ugc2V0IGRhdGEgZm9yICR7a2V5fSBvbiB5b3VyIGFjY291bnQuYDtcbiAgICAgIH1cbiAgICB9XG4gIH0gZWxzZSBpZiAodHlwZW9mIHVzZXJLZXlzID09PSAnb2JqZWN0Jykge1xuICAgIGZvciAoY29uc3Qga2V5IGluIG9wdGlvbnMucmVxdWlyZVVzZXJLZXlzKSB7XG4gICAgICBjb25zdCBvcHQgPSBvcHRpb25zLnJlcXVpcmVVc2VyS2V5c1trZXldO1xuICAgICAgaWYgKG9wdC5vcHRpb25zKSB7XG4gICAgICAgIHZhbGlkYXRlT3B0aW9ucyhvcHQsIGtleSwgcmVxVXNlci5nZXQoa2V5KSk7XG4gICAgICB9XG4gICAgfVxuICB9XG59XG5cbi8vIFRvIGJlIHVzZWQgYXMgcGFydCBvZiB0aGUgcHJvbWlzZSBjaGFpbiB3aGVuIHNhdmluZy9kZWxldGluZyBhbiBvYmplY3Rcbi8vIFdpbGwgcmVzb2x2ZSBzdWNjZXNzZnVsbHkgaWYgbm8gdHJpZ2dlciBpcyBjb25maWd1cmVkXG4vLyBSZXNvbHZlcyB0byBhbiBvYmplY3QsIGVtcHR5IG9yIGNvbnRhaW5pbmcgYW4gb2JqZWN0IGtleS4gQSBiZWZvcmVTYXZlXG4vLyB0cmlnZ2VyIHdpbGwgc2V0IHRoZSBvYmplY3Qga2V5IHRvIHRoZSByZXN0IGZvcm1hdCBvYmplY3QgdG8gc2F2ZS5cbi8vIG9yaWdpbmFsUGFyc2VPYmplY3QgaXMgb3B0aW9uYWwsIHdlIG9ubHkgbmVlZCB0aGF0IGZvciBiZWZvcmUvYWZ0ZXJTYXZlIGZ1bmN0aW9uc1xuZXhwb3J0IGZ1bmN0aW9uIG1heWJlUnVuVHJpZ2dlcihcbiAgdHJpZ2dlclR5cGUsXG4gIGF1dGgsXG4gIHBhcnNlT2JqZWN0LFxuICBvcmlnaW5hbFBhcnNlT2JqZWN0LFxuICBjb25maWcsXG4gIGNvbnRleHRcbikge1xuICBpZiAoIXBhcnNlT2JqZWN0KSB7XG4gICAgcmV0dXJuIFByb21pc2UucmVzb2x2ZSh7fSk7XG4gIH1cbiAgcmV0dXJuIG5ldyBQcm9taXNlKGZ1bmN0aW9uIChyZXNvbHZlLCByZWplY3QpIHtcbiAgICB2YXIgdHJpZ2dlciA9IGdldFRyaWdnZXIocGFyc2VPYmplY3QuY2xhc3NOYW1lLCB0cmlnZ2VyVHlwZSwgY29uZmlnLmFwcGxpY2F0aW9uSWQpO1xuICAgIGlmICghdHJpZ2dlcikgcmV0dXJuIHJlc29sdmUoKTtcbiAgICB2YXIgcmVxdWVzdCA9IGdldFJlcXVlc3RPYmplY3QoXG4gICAgICB0cmlnZ2VyVHlwZSxcbiAgICAgIGF1dGgsXG4gICAgICBwYXJzZU9iamVjdCxcbiAgICAgIG9yaWdpbmFsUGFyc2VPYmplY3QsXG4gICAgICBjb25maWcsXG4gICAgICBjb250ZXh0XG4gICAgKTtcbiAgICB2YXIgeyBzdWNjZXNzLCBlcnJvciB9ID0gZ2V0UmVzcG9uc2VPYmplY3QoXG4gICAgICByZXF1ZXN0LFxuICAgICAgb2JqZWN0ID0+IHtcbiAgICAgICAgbG9nVHJpZ2dlclN1Y2Nlc3NCZWZvcmVIb29rKFxuICAgICAgICAgIHRyaWdnZXJUeXBlLFxuICAgICAgICAgIHBhcnNlT2JqZWN0LmNsYXNzTmFtZSxcbiAgICAgICAgICBwYXJzZU9iamVjdC50b0pTT04oKSxcbiAgICAgICAgICBvYmplY3QsXG4gICAgICAgICAgYXV0aFxuICAgICAgICApO1xuICAgICAgICBpZiAoXG4gICAgICAgICAgdHJpZ2dlclR5cGUgPT09IFR5cGVzLmJlZm9yZVNhdmUgfHxcbiAgICAgICAgICB0cmlnZ2VyVHlwZSA9PT0gVHlwZXMuYWZ0ZXJTYXZlIHx8XG4gICAgICAgICAgdHJpZ2dlclR5cGUgPT09IFR5cGVzLmJlZm9yZURlbGV0ZSB8fFxuICAgICAgICAgIHRyaWdnZXJUeXBlID09PSBUeXBlcy5hZnRlckRlbGV0ZVxuICAgICAgICApIHtcbiAgICAgICAgICBPYmplY3QuYXNzaWduKGNvbnRleHQsIHJlcXVlc3QuY29udGV4dCk7XG4gICAgICAgIH1cbiAgICAgICAgcmVzb2x2ZShvYmplY3QpO1xuICAgICAgfSxcbiAgICAgIGVycm9yID0+IHtcbiAgICAgICAgbG9nVHJpZ2dlckVycm9yQmVmb3JlSG9vayhcbiAgICAgICAgICB0cmlnZ2VyVHlwZSxcbiAgICAgICAgICBwYXJzZU9iamVjdC5jbGFzc05hbWUsXG4gICAgICAgICAgcGFyc2VPYmplY3QudG9KU09OKCksXG4gICAgICAgICAgYXV0aCxcbiAgICAgICAgICBlcnJvclxuICAgICAgICApO1xuICAgICAgICByZWplY3QoZXJyb3IpO1xuICAgICAgfVxuICAgICk7XG5cbiAgICAvLyBBZnRlclNhdmUgYW5kIGFmdGVyRGVsZXRlIHRyaWdnZXJzIGNhbiByZXR1cm4gYSBwcm9taXNlLCB3aGljaCBpZiB0aGV5XG4gICAgLy8gZG8sIG5lZWRzIHRvIGJlIHJlc29sdmVkIGJlZm9yZSB0aGlzIHByb21pc2UgaXMgcmVzb2x2ZWQsXG4gICAgLy8gc28gdHJpZ2dlciBleGVjdXRpb24gaXMgc3luY2VkIHdpdGggUmVzdFdyaXRlLmV4ZWN1dGUoKSBjYWxsLlxuICAgIC8vIElmIHRyaWdnZXJzIGRvIG5vdCByZXR1cm4gYSBwcm9taXNlLCB0aGV5IGNhbiBydW4gYXN5bmMgY29kZSBwYXJhbGxlbFxuICAgIC8vIHRvIHRoZSBSZXN0V3JpdGUuZXhlY3V0ZSgpIGNhbGwuXG4gICAgcmV0dXJuIFByb21pc2UucmVzb2x2ZSgpXG4gICAgICAudGhlbigoKSA9PiB7XG4gICAgICAgIHJldHVybiBtYXliZVJ1blZhbGlkYXRvcihyZXF1ZXN0LCBgJHt0cmlnZ2VyVHlwZX0uJHtwYXJzZU9iamVjdC5jbGFzc05hbWV9YCk7XG4gICAgICB9KVxuICAgICAgLnRoZW4oKCkgPT4ge1xuICAgICAgICBpZiAocmVxdWVzdC5za2lwV2l0aE1hc3RlcktleSkge1xuICAgICAgICAgIHJldHVybiBQcm9taXNlLnJlc29sdmUoKTtcbiAgICAgICAgfVxuICAgICAgICBjb25zdCBwcm9taXNlID0gdHJpZ2dlcihyZXF1ZXN0KTtcbiAgICAgICAgaWYgKFxuICAgICAgICAgIHRyaWdnZXJUeXBlID09PSBUeXBlcy5hZnRlclNhdmUgfHxcbiAgICAgICAgICB0cmlnZ2VyVHlwZSA9PT0gVHlwZXMuYWZ0ZXJEZWxldGUgfHxcbiAgICAgICAgICB0cmlnZ2VyVHlwZSA9PT0gVHlwZXMuYWZ0ZXJMb2dpblxuICAgICAgICApIHtcbiAgICAgICAgICBsb2dUcmlnZ2VyQWZ0ZXJIb29rKHRyaWdnZXJUeXBlLCBwYXJzZU9iamVjdC5jbGFzc05hbWUsIHBhcnNlT2JqZWN0LnRvSlNPTigpLCBhdXRoKTtcbiAgICAgICAgfVxuICAgICAgICAvLyBiZWZvcmVTYXZlIGlzIGV4cGVjdGVkIHRvIHJldHVybiBudWxsIChub3RoaW5nKVxuICAgICAgICBpZiAodHJpZ2dlclR5cGUgPT09IFR5cGVzLmJlZm9yZVNhdmUpIHtcbiAgICAgICAgICBpZiAocHJvbWlzZSAmJiB0eXBlb2YgcHJvbWlzZS50aGVuID09PSAnZnVuY3Rpb24nKSB7XG4gICAgICAgICAgICByZXR1cm4gcHJvbWlzZS50aGVuKHJlc3BvbnNlID0+IHtcbiAgICAgICAgICAgICAgLy8gcmVzcG9uc2Uub2JqZWN0IG1heSBjb21lIGZyb20gZXhwcmVzcyByb3V0aW5nIGJlZm9yZSBob29rXG4gICAgICAgICAgICAgIGlmIChyZXNwb25zZSAmJiByZXNwb25zZS5vYmplY3QpIHtcbiAgICAgICAgICAgICAgICByZXR1cm4gcmVzcG9uc2U7XG4gICAgICAgICAgICAgIH1cbiAgICAgICAgICAgICAgcmV0dXJuIG51bGw7XG4gICAgICAgICAgICB9KTtcbiAgICAgICAgICB9XG4gICAgICAgICAgcmV0dXJuIG51bGw7XG4gICAgICAgIH1cblxuICAgICAgICByZXR1cm4gcHJvbWlzZTtcbiAgICAgIH0pXG4gICAgICAudGhlbihzdWNjZXNzLCBlcnJvcik7XG4gIH0pO1xufVxuXG4vLyBDb252ZXJ0cyBhIFJFU1QtZm9ybWF0IG9iamVjdCB0byBhIFBhcnNlLk9iamVjdFxuLy8gZGF0YSBpcyBlaXRoZXIgY2xhc3NOYW1lIG9yIGFuIG9iamVjdFxuZXhwb3J0IGZ1bmN0aW9uIGluZmxhdGUoZGF0YSwgcmVzdE9iamVjdCkge1xuICB2YXIgY29weSA9IHR5cGVvZiBkYXRhID09ICdvYmplY3QnID8gZGF0YSA6IHsgY2xhc3NOYW1lOiBkYXRhIH07XG4gIGZvciAodmFyIGtleSBpbiByZXN0T2JqZWN0KSB7XG4gICAgY29weVtrZXldID0gcmVzdE9iamVjdFtrZXldO1xuICB9XG4gIHJldHVybiBQYXJzZS5PYmplY3QuZnJvbUpTT04oY29weSk7XG59XG5cbmV4cG9ydCBmdW5jdGlvbiBydW5MaXZlUXVlcnlFdmVudEhhbmRsZXJzKGRhdGEsIGFwcGxpY2F0aW9uSWQgPSBQYXJzZS5hcHBsaWNhdGlvbklkKSB7XG4gIGlmICghX3RyaWdnZXJTdG9yZSB8fCAhX3RyaWdnZXJTdG9yZVthcHBsaWNhdGlvbklkXSB8fCAhX3RyaWdnZXJTdG9yZVthcHBsaWNhdGlvbklkXS5MaXZlUXVlcnkpIHtcbiAgICByZXR1cm47XG4gIH1cbiAgX3RyaWdnZXJTdG9yZVthcHBsaWNhdGlvbklkXS5MaXZlUXVlcnkuZm9yRWFjaChoYW5kbGVyID0+IGhhbmRsZXIoZGF0YSkpO1xufVxuXG5leHBvcnQgZnVuY3Rpb24gZ2V0UmVxdWVzdEZpbGVPYmplY3QodHJpZ2dlclR5cGUsIGF1dGgsIGZpbGVPYmplY3QsIGNvbmZpZykge1xuICBjb25zdCByZXF1ZXN0ID0ge1xuICAgIC4uLmZpbGVPYmplY3QsXG4gICAgdHJpZ2dlck5hbWU6IHRyaWdnZXJUeXBlLFxuICAgIG1hc3RlcjogZmFsc2UsXG4gICAgbG9nOiBjb25maWcubG9nZ2VyQ29udHJvbGxlcixcbiAgICBoZWFkZXJzOiBjb25maWcuaGVhZGVycyxcbiAgICBpcDogY29uZmlnLmlwLFxuICB9O1xuXG4gIGlmICghYXV0aCkge1xuICAgIHJldHVybiByZXF1ZXN0O1xuICB9XG4gIGlmIChhdXRoLmlzTWFzdGVyKSB7XG4gICAgcmVxdWVzdFsnbWFzdGVyJ10gPSB0cnVlO1xuICB9XG4gIGlmIChhdXRoLnVzZXIpIHtcbiAgICByZXF1ZXN0Wyd1c2VyJ10gPSBhdXRoLnVzZXI7XG4gIH1cbiAgaWYgKGF1dGguaW5zdGFsbGF0aW9uSWQpIHtcbiAgICByZXF1ZXN0WydpbnN0YWxsYXRpb25JZCddID0gYXV0aC5pbnN0YWxsYXRpb25JZDtcbiAgfVxuICByZXR1cm4gcmVxdWVzdDtcbn1cblxuZXhwb3J0IGFzeW5jIGZ1bmN0aW9uIG1heWJlUnVuRmlsZVRyaWdnZXIodHJpZ2dlclR5cGUsIGZpbGVPYmplY3QsIGNvbmZpZywgYXV0aCkge1xuICBjb25zdCBmaWxlVHJpZ2dlciA9IGdldEZpbGVUcmlnZ2VyKHRyaWdnZXJUeXBlLCBjb25maWcuYXBwbGljYXRpb25JZCk7XG4gIGlmICh0eXBlb2YgZmlsZVRyaWdnZXIgPT09ICdmdW5jdGlvbicpIHtcbiAgICB0cnkge1xuICAgICAgY29uc3QgcmVxdWVzdCA9IGdldFJlcXVlc3RGaWxlT2JqZWN0KHRyaWdnZXJUeXBlLCBhdXRoLCBmaWxlT2JqZWN0LCBjb25maWcpO1xuICAgICAgYXdhaXQgbWF5YmVSdW5WYWxpZGF0b3IocmVxdWVzdCwgYCR7dHJpZ2dlclR5cGV9LiR7RmlsZUNsYXNzTmFtZX1gKTtcbiAgICAgIGlmIChyZXF1ZXN0LnNraXBXaXRoTWFzdGVyS2V5KSB7XG4gICAgICAgIHJldHVybiBmaWxlT2JqZWN0O1xuICAgICAgfVxuICAgICAgY29uc3QgcmVzdWx0ID0gYXdhaXQgZmlsZVRyaWdnZXIocmVxdWVzdCk7XG4gICAgICBsb2dUcmlnZ2VyU3VjY2Vzc0JlZm9yZUhvb2soXG4gICAgICAgIHRyaWdnZXJUeXBlLFxuICAgICAgICAnUGFyc2UuRmlsZScsXG4gICAgICAgIHsgLi4uZmlsZU9iamVjdC5maWxlLnRvSlNPTigpLCBmaWxlU2l6ZTogZmlsZU9iamVjdC5maWxlU2l6ZSB9LFxuICAgICAgICByZXN1bHQsXG4gICAgICAgIGF1dGhcbiAgICAgICk7XG4gICAgICByZXR1cm4gcmVzdWx0IHx8IGZpbGVPYmplY3Q7XG4gICAgfSBjYXRjaCAoZXJyb3IpIHtcbiAgICAgIGxvZ1RyaWdnZXJFcnJvckJlZm9yZUhvb2soXG4gICAgICAgIHRyaWdnZXJUeXBlLFxuICAgICAgICAnUGFyc2UuRmlsZScsXG4gICAgICAgIHsgLi4uZmlsZU9iamVjdC5maWxlLnRvSlNPTigpLCBmaWxlU2l6ZTogZmlsZU9iamVjdC5maWxlU2l6ZSB9LFxuICAgICAgICBhdXRoLFxuICAgICAgICBlcnJvclxuICAgICAgKTtcbiAgICAgIHRocm93IGVycm9yO1xuICAgIH1cbiAgfVxuICByZXR1cm4gZmlsZU9iamVjdDtcbn1cblxuZXhwb3J0IGFzeW5jIGZ1bmN0aW9uIG1heWJlUnVuQ29ubmVjdFRyaWdnZXIodHJpZ2dlclR5cGUsIHJlcXVlc3QpIHtcbiAgY29uc3QgdHJpZ2dlciA9IGdldFRyaWdnZXIoQ29ubmVjdENsYXNzTmFtZSwgdHJpZ2dlclR5cGUsIFBhcnNlLmFwcGxpY2F0aW9uSWQpO1xuICBpZiAoIXRyaWdnZXIpIHtcbiAgICByZXR1cm47XG4gIH1cbiAgcmVxdWVzdC51c2VyID0gYXdhaXQgdXNlckZvclNlc3Npb25Ub2tlbihyZXF1ZXN0LnNlc3Npb25Ub2tlbik7XG4gIGF3YWl0IG1heWJlUnVuVmFsaWRhdG9yKHJlcXVlc3QsIGAke3RyaWdnZXJUeXBlfS4ke0Nvbm5lY3RDbGFzc05hbWV9YCk7XG4gIGlmIChyZXF1ZXN0LnNraXBXaXRoTWFzdGVyS2V5KSB7XG4gICAgcmV0dXJuO1xuICB9XG4gIHJldHVybiB0cmlnZ2VyKHJlcXVlc3QpO1xufVxuXG5leHBvcnQgYXN5bmMgZnVuY3Rpb24gbWF5YmVSdW5TdWJzY3JpYmVUcmlnZ2VyKHRyaWdnZXJUeXBlLCBjbGFzc05hbWUsIHJlcXVlc3QpIHtcbiAgY29uc3QgdHJpZ2dlciA9IGdldFRyaWdnZXIoY2xhc3NOYW1lLCB0cmlnZ2VyVHlwZSwgUGFyc2UuYXBwbGljYXRpb25JZCk7XG4gIGlmICghdHJpZ2dlcikge1xuICAgIHJldHVybjtcbiAgfVxuICBjb25zdCBwYXJzZVF1ZXJ5ID0gbmV3IFBhcnNlLlF1ZXJ5KGNsYXNzTmFtZSk7XG4gIHBhcnNlUXVlcnkud2l0aEpTT04ocmVxdWVzdC5xdWVyeSk7XG4gIHJlcXVlc3QucXVlcnkgPSBwYXJzZVF1ZXJ5O1xuICByZXF1ZXN0LnVzZXIgPSBhd2FpdCB1c2VyRm9yU2Vzc2lvblRva2VuKHJlcXVlc3Quc2Vzc2lvblRva2VuKTtcbiAgYXdhaXQgbWF5YmVSdW5WYWxpZGF0b3IocmVxdWVzdCwgYCR7dHJpZ2dlclR5cGV9LiR7Y2xhc3NOYW1lfWApO1xuICBpZiAocmVxdWVzdC5za2lwV2l0aE1hc3RlcktleSkge1xuICAgIHJldHVybjtcbiAgfVxuICBhd2FpdCB0cmlnZ2VyKHJlcXVlc3QpO1xuICBjb25zdCBxdWVyeSA9IHJlcXVlc3QucXVlcnkudG9KU09OKCk7XG4gIGlmIChxdWVyeS5rZXlzKSB7XG4gICAgcXVlcnkuZmllbGRzID0gcXVlcnkua2V5cy5zcGxpdCgnLCcpO1xuICB9XG4gIHJlcXVlc3QucXVlcnkgPSBxdWVyeTtcbn1cblxuZXhwb3J0IGFzeW5jIGZ1bmN0aW9uIG1heWJlUnVuQWZ0ZXJFdmVudFRyaWdnZXIodHJpZ2dlclR5cGUsIGNsYXNzTmFtZSwgcmVxdWVzdCkge1xuICBjb25zdCB0cmlnZ2VyID0gZ2V0VHJpZ2dlcihjbGFzc05hbWUsIHRyaWdnZXJUeXBlLCBQYXJzZS5hcHBsaWNhdGlvbklkKTtcbiAgaWYgKCF0cmlnZ2VyKSB7XG4gICAgcmV0dXJuO1xuICB9XG4gIGlmIChyZXF1ZXN0Lm9iamVjdCkge1xuICAgIHJlcXVlc3Qub2JqZWN0ID0gUGFyc2UuT2JqZWN0LmZyb21KU09OKHJlcXVlc3Qub2JqZWN0KTtcbiAgfVxuICBpZiAocmVxdWVzdC5vcmlnaW5hbCkge1xuICAgIHJlcXVlc3Qub3JpZ2luYWwgPSBQYXJzZS5PYmplY3QuZnJvbUpTT04ocmVxdWVzdC5vcmlnaW5hbCk7XG4gIH1cbiAgcmVxdWVzdC51c2VyID0gYXdhaXQgdXNlckZvclNlc3Npb25Ub2tlbihyZXF1ZXN0LnNlc3Npb25Ub2tlbik7XG4gIGF3YWl0IG1heWJlUnVuVmFsaWRhdG9yKHJlcXVlc3QsIGAke3RyaWdnZXJUeXBlfS4ke2NsYXNzTmFtZX1gKTtcbiAgaWYgKHJlcXVlc3Quc2tpcFdpdGhNYXN0ZXJLZXkpIHtcbiAgICByZXR1cm47XG4gIH1cbiAgcmV0dXJuIHRyaWdnZXIocmVxdWVzdCk7XG59XG5cbmFzeW5jIGZ1bmN0aW9uIHVzZXJGb3JTZXNzaW9uVG9rZW4oc2Vzc2lvblRva2VuKSB7XG4gIGlmICghc2Vzc2lvblRva2VuKSB7XG4gICAgcmV0dXJuO1xuICB9XG4gIGNvbnN0IHEgPSBuZXcgUGFyc2UuUXVlcnkoJ19TZXNzaW9uJyk7XG4gIHEuZXF1YWxUbygnc2Vzc2lvblRva2VuJywgc2Vzc2lvblRva2VuKTtcbiAgY29uc3Qgc2Vzc2lvbiA9IGF3YWl0IHEuZmlyc3QoeyB1c2VNYXN0ZXJLZXk6IHRydWUgfSk7XG4gIGlmICghc2Vzc2lvbikge1xuICAgIHJldHVybjtcbiAgfVxuICBjb25zdCB1c2VyID0gc2Vzc2lvbi5nZXQoJ3VzZXInKTtcbiAgaWYgKCF1c2VyKSB7XG4gICAgcmV0dXJuO1xuICB9XG4gIGF3YWl0IHVzZXIuZmV0Y2goeyB1c2VNYXN0ZXJLZXk6IHRydWUgfSk7XG4gIHJldHVybiB1c2VyO1xufVxuIl19