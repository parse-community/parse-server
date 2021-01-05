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

  if (triggerType === Types.beforeSave || triggerType === Types.afterSave || triggerType === Types.beforeDelete || triggerType === Types.afterDelete || triggerType === Types.afterFind) {
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

function maybeRunAfterFindTrigger(triggerType, auth, className, objects, config, query, context) {
  return new Promise((resolve, reject) => {
    const trigger = getTrigger(className, triggerType, config.applicationId);

    if (!trigger) {
      return resolve();
    }

    const request = getRequestObject(triggerType, auth, null, null, config, context);

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
  q.include('user');
  const session = await q.first({
    useMasterKey: true
  });

  if (!session) {
    return;
  }

  return session.get('user');
}
//# sourceMappingURL=data:application/json;charset=utf-8;base64,eyJ2ZXJzaW9uIjozLCJzb3VyY2VzIjpbIi4uL3NyYy90cmlnZ2Vycy5qcyJdLCJuYW1lcyI6WyJUeXBlcyIsImJlZm9yZUxvZ2luIiwiYWZ0ZXJMb2dpbiIsImFmdGVyTG9nb3V0IiwiYmVmb3JlU2F2ZSIsImFmdGVyU2F2ZSIsImJlZm9yZURlbGV0ZSIsImFmdGVyRGVsZXRlIiwiYmVmb3JlRmluZCIsImFmdGVyRmluZCIsImJlZm9yZVNhdmVGaWxlIiwiYWZ0ZXJTYXZlRmlsZSIsImJlZm9yZURlbGV0ZUZpbGUiLCJhZnRlckRlbGV0ZUZpbGUiLCJiZWZvcmVDb25uZWN0IiwiYmVmb3JlU3Vic2NyaWJlIiwiYWZ0ZXJFdmVudCIsIkZpbGVDbGFzc05hbWUiLCJDb25uZWN0Q2xhc3NOYW1lIiwiYmFzZVN0b3JlIiwiVmFsaWRhdG9ycyIsIk9iamVjdCIsImtleXMiLCJyZWR1Y2UiLCJiYXNlIiwia2V5IiwiRnVuY3Rpb25zIiwiSm9icyIsIkxpdmVRdWVyeSIsIlRyaWdnZXJzIiwiZnJlZXplIiwidmFsaWRhdGVDbGFzc05hbWVGb3JUcmlnZ2VycyIsImNsYXNzTmFtZSIsInR5cGUiLCJfdHJpZ2dlclN0b3JlIiwiQ2F0ZWdvcnkiLCJnZXRTdG9yZSIsImNhdGVnb3J5IiwibmFtZSIsImFwcGxpY2F0aW9uSWQiLCJwYXRoIiwic3BsaXQiLCJzcGxpY2UiLCJQYXJzZSIsInN0b3JlIiwiY29tcG9uZW50IiwidW5kZWZpbmVkIiwiYWRkIiwiaGFuZGxlciIsImxhc3RDb21wb25lbnQiLCJsb2dnZXIiLCJ3YXJuIiwicmVtb3ZlIiwiZ2V0IiwiYWRkRnVuY3Rpb24iLCJmdW5jdGlvbk5hbWUiLCJ2YWxpZGF0aW9uSGFuZGxlciIsImFkZEpvYiIsImpvYk5hbWUiLCJhZGRUcmlnZ2VyIiwiYWRkRmlsZVRyaWdnZXIiLCJhZGRDb25uZWN0VHJpZ2dlciIsImFkZExpdmVRdWVyeUV2ZW50SGFuZGxlciIsInB1c2giLCJyZW1vdmVGdW5jdGlvbiIsInJlbW92ZVRyaWdnZXIiLCJfdW5yZWdpc3RlckFsbCIsImZvckVhY2giLCJhcHBJZCIsImdldFRyaWdnZXIiLCJ0cmlnZ2VyVHlwZSIsImdldEZpbGVUcmlnZ2VyIiwidHJpZ2dlckV4aXN0cyIsImdldEZ1bmN0aW9uIiwiZ2V0RnVuY3Rpb25OYW1lcyIsImZ1bmN0aW9uTmFtZXMiLCJleHRyYWN0RnVuY3Rpb25OYW1lcyIsIm5hbWVzcGFjZSIsInZhbHVlIiwiZ2V0Sm9iIiwiZ2V0Sm9icyIsIm1hbmFnZXIiLCJnZXRWYWxpZGF0b3IiLCJnZXRSZXF1ZXN0T2JqZWN0IiwiYXV0aCIsInBhcnNlT2JqZWN0Iiwib3JpZ2luYWxQYXJzZU9iamVjdCIsImNvbmZpZyIsImNvbnRleHQiLCJyZXF1ZXN0IiwidHJpZ2dlck5hbWUiLCJvYmplY3QiLCJtYXN0ZXIiLCJsb2ciLCJsb2dnZXJDb250cm9sbGVyIiwiaGVhZGVycyIsImlwIiwib3JpZ2luYWwiLCJhc3NpZ24iLCJpc01hc3RlciIsInVzZXIiLCJpbnN0YWxsYXRpb25JZCIsImdldFJlcXVlc3RRdWVyeU9iamVjdCIsInF1ZXJ5IiwiY291bnQiLCJpc0dldCIsImdldFJlc3BvbnNlT2JqZWN0IiwicmVzb2x2ZSIsInJlamVjdCIsInN1Y2Nlc3MiLCJyZXNwb25zZSIsIm9iamVjdHMiLCJtYXAiLCJ0b0pTT04iLCJlcXVhbHMiLCJfZ2V0U2F2ZUpTT04iLCJlcnJvciIsImUiLCJyZXNvbHZlRXJyb3IiLCJjb2RlIiwiRXJyb3IiLCJTQ1JJUFRfRkFJTEVEIiwibWVzc2FnZSIsInVzZXJJZEZvckxvZyIsImlkIiwibG9nVHJpZ2dlckFmdGVySG9vayIsImlucHV0IiwiY2xlYW5JbnB1dCIsInRydW5jYXRlTG9nTWVzc2FnZSIsIkpTT04iLCJzdHJpbmdpZnkiLCJpbmZvIiwibG9nVHJpZ2dlclN1Y2Nlc3NCZWZvcmVIb29rIiwicmVzdWx0IiwiY2xlYW5SZXN1bHQiLCJsb2dUcmlnZ2VyRXJyb3JCZWZvcmVIb29rIiwibWF5YmVSdW5BZnRlckZpbmRUcmlnZ2VyIiwiUHJvbWlzZSIsInRyaWdnZXIiLCJmcm9tSlNPTiIsInRoZW4iLCJtYXliZVJ1blZhbGlkYXRvciIsInNraXBXaXRoTWFzdGVyS2V5IiwicmVzdWx0cyIsIm1heWJlUnVuUXVlcnlUcmlnZ2VyIiwicmVzdFdoZXJlIiwicmVzdE9wdGlvbnMiLCJqc29uIiwid2hlcmUiLCJwYXJzZVF1ZXJ5IiwiUXVlcnkiLCJ3aXRoSlNPTiIsInJlcXVlc3RPYmplY3QiLCJxdWVyeVJlc3VsdCIsImpzb25RdWVyeSIsImxpbWl0Iiwic2tpcCIsImluY2x1ZGUiLCJleGNsdWRlS2V5cyIsImV4cGxhaW4iLCJvcmRlciIsImhpbnQiLCJyZWFkUHJlZmVyZW5jZSIsImluY2x1ZGVSZWFkUHJlZmVyZW5jZSIsInN1YnF1ZXJ5UmVhZFByZWZlcmVuY2UiLCJlcnIiLCJkZWZhdWx0T3B0cyIsInN0YWNrIiwidGhlVmFsaWRhdG9yIiwiYnVpbHRJblRyaWdnZXJWYWxpZGF0b3IiLCJjYXRjaCIsIlZBTElEQVRJT05fRVJST1IiLCJvcHRpb25zIiwidmFsaWRhdGVNYXN0ZXJLZXkiLCJyZXFVc2VyIiwiZXhpc3RlZCIsInJlcXVpcmVVc2VyIiwicmVxdWlyZU1hc3RlciIsInBhcmFtcyIsInJlcXVpcmVkUGFyYW0iLCJ2YWxpZGF0ZU9wdGlvbnMiLCJvcHQiLCJ2YWwiLCJvcHRzIiwiQXJyYXkiLCJpc0FycmF5IiwiaW5jbHVkZXMiLCJqb2luIiwiZ2V0VHlwZSIsImZuIiwibWF0Y2giLCJ0b1N0cmluZyIsInRvTG93ZXJDYXNlIiwiZmllbGRzIiwiZGVmYXVsdCIsInNldCIsImNvbnN0YW50IiwicmVxdWlyZWQiLCJ1c2VyS2V5cyIsInJlcXVpcmVVc2VyS2V5cyIsIm1heWJlUnVuVHJpZ2dlciIsInByb21pc2UiLCJpbmZsYXRlIiwiZGF0YSIsInJlc3RPYmplY3QiLCJjb3B5IiwicnVuTGl2ZVF1ZXJ5RXZlbnRIYW5kbGVycyIsImdldFJlcXVlc3RGaWxlT2JqZWN0IiwiZmlsZU9iamVjdCIsIm1heWJlUnVuRmlsZVRyaWdnZXIiLCJmaWxlVHJpZ2dlciIsImZpbGUiLCJmaWxlU2l6ZSIsIm1heWJlUnVuQ29ubmVjdFRyaWdnZXIiLCJ1c2VyRm9yU2Vzc2lvblRva2VuIiwic2Vzc2lvblRva2VuIiwibWF5YmVSdW5TdWJzY3JpYmVUcmlnZ2VyIiwibWF5YmVSdW5BZnRlckV2ZW50VHJpZ2dlciIsInEiLCJlcXVhbFRvIiwic2Vzc2lvbiIsImZpcnN0IiwidXNlTWFzdGVyS2V5Il0sIm1hcHBpbmdzIjoiOzs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7QUFDQTs7QUFDQTs7Ozs7Ozs7OztBQUVPLE1BQU1BLEtBQUssR0FBRztBQUNuQkMsRUFBQUEsV0FBVyxFQUFFLGFBRE07QUFFbkJDLEVBQUFBLFVBQVUsRUFBRSxZQUZPO0FBR25CQyxFQUFBQSxXQUFXLEVBQUUsYUFITTtBQUluQkMsRUFBQUEsVUFBVSxFQUFFLFlBSk87QUFLbkJDLEVBQUFBLFNBQVMsRUFBRSxXQUxRO0FBTW5CQyxFQUFBQSxZQUFZLEVBQUUsY0FOSztBQU9uQkMsRUFBQUEsV0FBVyxFQUFFLGFBUE07QUFRbkJDLEVBQUFBLFVBQVUsRUFBRSxZQVJPO0FBU25CQyxFQUFBQSxTQUFTLEVBQUUsV0FUUTtBQVVuQkMsRUFBQUEsY0FBYyxFQUFFLGdCQVZHO0FBV25CQyxFQUFBQSxhQUFhLEVBQUUsZUFYSTtBQVluQkMsRUFBQUEsZ0JBQWdCLEVBQUUsa0JBWkM7QUFhbkJDLEVBQUFBLGVBQWUsRUFBRSxpQkFiRTtBQWNuQkMsRUFBQUEsYUFBYSxFQUFFLGVBZEk7QUFlbkJDLEVBQUFBLGVBQWUsRUFBRSxpQkFmRTtBQWdCbkJDLEVBQUFBLFVBQVUsRUFBRTtBQWhCTyxDQUFkOztBQW1CUCxNQUFNQyxhQUFhLEdBQUcsT0FBdEI7QUFDQSxNQUFNQyxnQkFBZ0IsR0FBRyxVQUF6Qjs7QUFFQSxNQUFNQyxTQUFTLEdBQUcsWUFBWTtBQUM1QixRQUFNQyxVQUFVLEdBQUdDLE1BQU0sQ0FBQ0MsSUFBUCxDQUFZdEIsS0FBWixFQUFtQnVCLE1BQW5CLENBQTBCLFVBQVVDLElBQVYsRUFB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IjpbIi8vIHRyaWdnZXJzLmpzXG5pbXBvcnQgUGFyc2UgZnJvbSAncGFyc2Uvbm9kZSc7XG5pbXBvcnQgeyBsb2dnZXIgfSBmcm9tICcuL2xvZ2dlcic7XG5cbmV4cG9ydCBjb25zdCBUeXBlcyA9IHtcbiAgYmVmb3JlTG9naW46ICdiZWZvcmVMb2dpbicsXG4gIGFmdGVyTG9naW46ICdhZnRlckxvZ2luJyxcbiAgYWZ0ZXJMb2dvdXQ6ICdhZnRlckxvZ291dCcsXG4gIGJlZm9yZVNhdmU6ICdiZWZvcmVTYXZlJyxcbiAgYWZ0ZXJTYXZlOiAnYWZ0ZXJTYXZlJyxcbiAgYmVmb3JlRGVsZXRlOiAnYmVmb3JlRGVsZXRlJyxcbiAgYWZ0ZXJEZWxldGU6ICdhZnRlckRlbGV0ZScsXG4gIGJlZm9yZUZpbmQ6ICdiZWZvcmVGaW5kJyxcbiAgYWZ0ZXJGaW5kOiAnYWZ0ZXJGaW5kJyxcbiAgYmVmb3JlU2F2ZUZpbGU6ICdiZWZvcmVTYXZlRmlsZScsXG4gIGFmdGVyU2F2ZUZpbGU6ICdhZnRlclNhdmVGaWxlJyxcbiAgYmVmb3JlRGVsZXRlRmlsZTogJ2JlZm9yZURlbGV0ZUZpbGUnLFxuICBhZnRlckRlbGV0ZUZpbGU6ICdhZnRlckRlbGV0ZUZpbGUnLFxuICBiZWZvcmVDb25uZWN0OiAnYmVmb3JlQ29ubmVjdCcsXG4gIGJlZm9yZVN1YnNjcmliZTogJ2JlZm9yZVN1YnNjcmliZScsXG4gIGFmdGVyRXZlbnQ6ICdhZnRlckV2ZW50Jyxcbn07XG5cbmNvbnN0IEZpbGVDbGFzc05hbWUgPSAnQEZpbGUnO1xuY29uc3QgQ29ubmVjdENsYXNzTmFtZSA9ICdAQ29ubmVjdCc7XG5cbmNvbnN0IGJhc2VTdG9yZSA9IGZ1bmN0aW9uICgpIHtcbiAgY29uc3QgVmFsaWRhdG9ycyA9IE9iamVjdC5rZXlzKFR5cGVzKS5yZWR1Y2UoZnVuY3Rpb24gKGJhc2UsIGtleSkge1xuICAgIGJhc2Vba2V5XSA9IHt9O1xuICAgIHJldHVybiBiYXNlO1xuICB9LCB7fSk7XG4gIGNvbnN0IEZ1bmN0aW9ucyA9IHt9O1xuICBjb25zdCBKb2JzID0ge307XG4gIGNvbnN0IExpdmVRdWVyeSA9IFtdO1xuICBjb25zdCBUcmlnZ2VycyA9IE9iamVjdC5rZXlzKFR5cGVzKS5yZWR1Y2UoZnVuY3Rpb24gKGJhc2UsIGtleSkge1xuICAgIGJhc2Vba2V5XSA9IHt9O1xuICAgIHJldHVybiBiYXNlO1xuICB9LCB7fSk7XG5cbiAgcmV0dXJuIE9iamVjdC5mcmVlemUoe1xuICAgIEZ1bmN0aW9ucyxcbiAgICBKb2JzLFxuICAgIFZhbGlkYXRvcnMsXG4gICAgVHJpZ2dlcnMsXG4gICAgTGl2ZVF1ZXJ5LFxuICB9KTtcbn07XG5cbmZ1bmN0aW9uIHZhbGlkYXRlQ2xhc3NOYW1lRm9yVHJpZ2dlcnMoY2xhc3NOYW1lLCB0eXBlKSB7XG4gIGlmICh0eXBlID09IFR5cGVzLmJlZm9yZVNhdmUgJiYgY2xhc3NOYW1lID09PSAnX1B1c2hTdGF0dXMnKSB7XG4gICAgLy8gX1B1c2hTdGF0dXMgdXNlcyB1bmRvY3VtZW50ZWQgbmVzdGVkIGtleSBpbmNyZW1lbnQgb3BzXG4gICAgLy8gYWxsb3dpbmcgYmVmb3JlU2F2ZSB3b3VsZCBtZXNzIHVwIHRoZSBvYmplY3RzIGJpZyB0aW1lXG4gICAgLy8gVE9ETzogQWxsb3cgcHJvcGVyIGRvY3VtZW50ZWQgd2F5IG9mIHVzaW5nIG5lc3RlZCBpbmNyZW1lbnQgb3BzXG4gICAgdGhyb3cgJ09ubHkgYWZ0ZXJTYXZlIGlzIGFsbG93ZWQgb24gX1B1c2hTdGF0dXMnO1xuICB9XG4gIGlmICgodHlwZSA9PT0gVHlwZXMuYmVmb3JlTG9naW4gfHwgdHlwZSA9PT0gVHlwZXMuYWZ0ZXJMb2dpbikgJiYgY2xhc3NOYW1lICE9PSAnX1VzZXInKSB7XG4gICAgLy8gVE9ETzogY2hlY2sgaWYgdXBzdHJlYW0gY29kZSB3aWxsIGhhbmRsZSBgRXJyb3JgIGluc3RhbmNlIHJhdGhlclxuICAgIC8vIHRoYW4gdGhpcyBhbnRpLXBhdHRlcm4gb2YgdGhyb3dpbmcgc3RyaW5nc1xuICAgIHRocm93ICdPbmx5IHRoZSBfVXNlciBjbGFzcyBpcyBhbGxvd2VkIGZvciB0aGUgYmVmb3JlTG9naW4gYW5kIGFmdGVyTG9naW4gdHJpZ2dlcnMnO1xuICB9XG4gIGlmICh0eXBlID09PSBUeXBlcy5hZnRlckxvZ291dCAmJiBjbGFzc05hbWUgIT09ICdfU2Vzc2lvbicpIHtcbiAgICAvLyBUT0RPOiBjaGVjayBpZiB1cHN0cmVhbSBjb2RlIHdpbGwgaGFuZGxlIGBFcnJvcmAgaW5zdGFuY2UgcmF0aGVyXG4gICAgLy8gdGhhbiB0aGlzIGFudGktcGF0dGVybiBvZiB0aHJvd2luZyBzdHJpbmdzXG4gICAgdGhyb3cgJ09ubHkgdGhlIF9TZXNzaW9uIGNsYXNzIGlzIGFsbG93ZWQgZm9yIHRoZSBhZnRlckxvZ291dCB0cmlnZ2VyLic7XG4gIH1cbiAgaWYgKGNsYXNzTmFtZSA9PT0gJ19TZXNzaW9uJyAmJiB0eXBlICE9PSBUeXBlcy5hZnRlckxvZ291dCkge1xuICAgIC8vIFRPRE86IGNoZWNrIGlmIHVwc3RyZWFtIGNvZGUgd2lsbCBoYW5kbGUgYEVycm9yYCBpbnN0YW5jZSByYXRoZXJcbiAgICAvLyB0aGFuIHRoaXMgYW50aS1wYXR0ZXJuIG9mIHRocm93aW5nIHN0cmluZ3NcbiAgICB0aHJvdyAnT25seSB0aGUgYWZ0ZXJMb2dvdXQgdHJpZ2dlciBpcyBhbGxvd2VkIGZvciB0aGUgX1Nlc3Npb24gY2xhc3MuJztcbiAgfVxuICByZXR1cm4gY2xhc3NOYW1lO1xufVxuXG5jb25zdCBfdHJpZ2dlclN0b3JlID0ge307XG5cbmNvbnN0IENhdGVnb3J5ID0ge1xuICBGdW5jdGlvbnM6ICdGdW5jdGlvbnMnLFxuICBWYWxpZGF0b3JzOiAnVmFsaWRhdG9ycycsXG4gIEpvYnM6ICdKb2JzJyxcbiAgVHJpZ2dlcnM6ICdUcmlnZ2VycycsXG59O1xuXG5mdW5jdGlvbiBnZXRTdG9yZShjYXRlZ29yeSwgbmFtZSwgYXBwbGljYXRpb25JZCkge1xuICBjb25zdCBwYXRoID0gbmFtZS5zcGxpdCgnLicpO1xuICBwYXRoLnNwbGljZSgtMSk7IC8vIHJlbW92ZSBsYXN0IGNvbXBvbmVudFxuICBhcHBsaWNhdGlvbklkID0gYXBwbGljYXRpb25JZCB8fCBQYXJzZS5hcHBsaWNhdGlvbklkO1xuICBfdHJpZ2dlclN0b3JlW2FwcGxpY2F0aW9uSWRdID0gX3RyaWdnZXJTdG9yZVthcHBsaWNhdGlvbklkXSB8fCBiYXNlU3RvcmUoKTtcbiAgbGV0IHN0b3JlID0gX3RyaWdnZXJTdG9yZVthcHBsaWNhdGlvbklkXVtjYXRlZ29yeV07XG4gIGZvciAoY29uc3QgY29tcG9uZW50IG9mIHBhdGgpIHtcbiAgICBzdG9yZSA9IHN0b3JlW2NvbXBvbmVudF07XG4gICAgaWYgKCFzdG9yZSkge1xuICAgICAgcmV0dXJuIHVuZGVmaW5lZDtcbiAgICB9XG4gIH1cbiAgcmV0dXJuIHN0b3JlO1xufVxuXG5mdW5jdGlvbiBhZGQoY2F0ZWdvcnksIG5hbWUsIGhhbmRsZXIsIGFwcGxpY2F0aW9uSWQpIHtcbiAgY29uc3QgbGFzdENvbXBvbmVudCA9IG5hbWUuc3BsaXQoJy4nKS5zcGxpY2UoLTEpO1xuICBjb25zdCBzdG9yZSA9IGdldFN0b3JlKGNhdGVnb3J5LCBuYW1lLCBhcHBsaWNhdGlvbklkKTtcbiAgaWYgKHN0b3JlW2xhc3RDb21wb25lbnRdKSB7XG4gICAgbG9nZ2VyLndhcm4oXG4gICAgICBgV2FybmluZzogRHVwbGljYXRlIGNsb3VkIGZ1bmN0aW9ucyBleGlzdCBmb3IgJHtsYXN0Q29tcG9uZW50fS4gT25seSB0aGUgbGFzdCBvbmUgd2lsbCBiZSB1c2VkIGFuZCB0aGUgb3RoZXJzIHdpbGwgYmUgaWdub3JlZC5gXG4gICAgKTtcbiAgfVxuICBzdG9yZVtsYXN0Q29tcG9uZW50XSA9IGhhbmRsZXI7XG59XG5cbmZ1bmN0aW9uIHJlbW92ZShjYXRlZ29yeSwgbmFtZSwgYXBwbGljYXRpb25JZCkge1xuICBjb25zdCBsYXN0Q29tcG9uZW50ID0gbmFtZS5zcGxpdCgnLicpLnNwbGljZSgtMSk7XG4gIGNvbnN0IHN0b3JlID0gZ2V0U3RvcmUoY2F0ZWdvcnksIG5hbWUsIGFwcGxpY2F0aW9uSWQpO1xuICBkZWxldGUgc3RvcmVbbGFzdENvbXBvbmVudF07XG59XG5cbmZ1bmN0aW9uIGdldChjYXRlZ29yeSwgbmFtZSwgYXBwbGljYXRpb25JZCkge1xuICBjb25zdCBsYXN0Q29tcG9uZW50ID0gbmFtZS5zcGxpdCgnLicpLnNwbGljZSgtMSk7XG4gIGNvbnN0IHN0b3JlID0gZ2V0U3RvcmUoY2F0ZWdvcnksIG5hbWUsIGFwcGxpY2F0aW9uSWQpO1xuICByZXR1cm4gc3RvcmVbbGFzdENvbXBvbmVudF07XG59XG5cbmV4cG9ydCBmdW5jdGlvbiBhZGRGdW5jdGlvbihmdW5jdGlvbk5hbWUsIGhhbmRsZXIsIHZhbGlkYXRpb25IYW5kbGVyLCBhcHBsaWNhdGlvbklkKSB7XG4gIGFkZChDYXRlZ29yeS5GdW5jdGlvbnMsIGZ1bmN0aW9uTmFtZSwgaGFuZGxlciwgYXBwbGljYXRpb25JZCk7XG4gIGFkZChDYXRlZ29yeS5WYWxpZGF0b3JzLCBmdW5jdGlvbk5hbWUsIHZhbGlkYXRpb25IYW5kbGVyLCBhcHBsaWNhdGlvbklkKTtcbn1cblxuZXhwb3J0IGZ1bmN0aW9uIGFkZEpvYihqb2JOYW1lLCBoYW5kbGVyLCBhcHBsaWNhdGlvbklkKSB7XG4gIGFkZChDYXRlZ29yeS5Kb2JzLCBqb2JOYW1lLCBoYW5kbGVyLCBhcHBsaWNhdGlvbklkKTtcbn1cblxuZXhwb3J0IGZ1bmN0aW9uIGFkZFRyaWdnZXIodHlwZSwgY2xhc3NOYW1lLCBoYW5kbGVyLCBhcHBsaWNhdGlvbklkLCB2YWxpZGF0aW9uSGFuZGxlcikge1xuICB2YWxpZGF0ZUNsYXNzTmFtZUZvclRyaWdnZXJzKGNsYXNzTmFtZSwgdHlwZSk7XG4gIGFkZChDYXRlZ29yeS5UcmlnZ2VycywgYCR7dHlwZX0uJHtjbGFzc05hbWV9YCwgaGFuZGxlciwgYXBwbGljYXRpb25JZCk7XG4gIGFkZChDYXRlZ29yeS5WYWxpZGF0b3JzLCBgJHt0eXBlfS4ke2NsYXNzTmFtZX1gLCB2YWxpZGF0aW9uSGFuZGxlciwgYXBwbGljYXRpb25JZCk7XG59XG5cbmV4cG9ydCBmdW5jdGlvbiBhZGRGaWxlVHJpZ2dlcih0eXBlLCBoYW5kbGVyLCBhcHBsaWNhdGlvbklkLCB2YWxpZGF0aW9uSGFuZGxlcikge1xuICBhZGQoQ2F0ZWdvcnkuVHJpZ2dlcnMsIGAke3R5cGV9LiR7RmlsZUNsYXNzTmFtZX1gLCBoYW5kbGVyLCBhcHBsaWNhdGlvbklkKTtcbiAgYWRkKENhdGVnb3J5LlZhbGlkYXRvcnMsIGAke3R5cGV9LiR7RmlsZUNsYXNzTmFtZX1gLCB2YWxpZGF0aW9uSGFuZGxlciwgYXBwbGljYXRpb25JZCk7XG59XG5cbmV4cG9ydCBmdW5jdGlvbiBhZGRDb25uZWN0VHJpZ2dlcih0eXBlLCBoYW5kbGVyLCBhcHBsaWNhdGlvbklkLCB2YWxpZGF0aW9uSGFuZGxlcikge1xuICBhZGQoQ2F0ZWdvcnkuVHJpZ2dlcnMsIGAke3R5cGV9LiR7Q29ubmVjdENsYXNzTmFtZX1gLCBoYW5kbGVyLCBhcHBsaWNhdGlvbklkKTtcbiAgYWRkKENhdGVnb3J5LlZhbGlkYXRvcnMsIGAke3R5cGV9LiR7Q29ubmVjdENsYXNzTmFtZX1gLCB2YWxpZGF0aW9uSGFuZGxlciwgYXBwbGljYXRpb25JZCk7XG59XG5cbmV4cG9ydCBmdW5jdGlvbiBhZGRMaXZlUXVlcnlFdmVudEhhbmRsZXIoaGFuZGxlciwgYXBwbGljYXRpb25JZCkge1xuICBhcHBsaWNhdGlvbklkID0gYXBwbGljYXRpb25JZCB8fCBQYXJzZS5hcHBsaWNhdGlvbklkO1xuICBfdHJpZ2dlclN0b3JlW2FwcGxpY2F0aW9uSWRdID0gX3RyaWdnZXJTdG9yZVthcHBsaWNhdGlvbklkXSB8fCBiYXNlU3RvcmUoKTtcbiAgX3RyaWdnZXJTdG9yZVthcHBsaWNhdGlvbklkXS5MaXZlUXVlcnkucHVzaChoYW5kbGVyKTtcbn1cblxuZXhwb3J0IGZ1bmN0aW9uIHJlbW92ZUZ1bmN0aW9uKGZ1bmN0aW9uTmFtZSwgYXBwbGljYXRpb25JZCkge1xuICByZW1vdmUoQ2F0ZWdvcnkuRnVuY3Rpb25zLCBmdW5jdGlvbk5hbWUsIGFwcGxpY2F0aW9uSWQpO1xufVxuXG5leHBvcnQgZnVuY3Rpb24gcmVtb3ZlVHJpZ2dlcih0eXBlLCBjbGFzc05hbWUsIGFwcGxpY2F0aW9uSWQpIHtcbiAgcmVtb3ZlKENhdGVnb3J5LlRyaWdnZXJzLCBgJHt0eXBlfS4ke2NsYXNzTmFtZX1gLCBhcHBsaWNhdGlvbklkKTtcbn1cblxuZXhwb3J0IGZ1bmN0aW9uIF91bnJlZ2lzdGVyQWxsKCkge1xuICBPYmplY3Qua2V5cyhfdHJpZ2dlclN0b3JlKS5mb3JFYWNoKGFwcElkID0+IGRlbGV0ZSBfdHJpZ2dlclN0b3JlW2FwcElkXSk7XG59XG5cbmV4cG9ydCBmdW5jdGlvbiBnZXRUcmlnZ2VyKGNsYXNzTmFtZSwgdHJpZ2dlclR5cGUsIGFwcGxpY2F0aW9uSWQpIHtcbiAgaWYgKCFhcHBsaWNhdGlvbklkKSB7XG4gICAgdGhyb3cgJ01pc3NpbmcgQXBwbGljYXRpb25JRCc7XG4gIH1cbiAgcmV0dXJuIGdldChDYXRlZ29yeS5UcmlnZ2VycywgYCR7dHJpZ2dlclR5cGV9LiR7Y2xhc3NOYW1lfWAsIGFwcGxpY2F0aW9uSWQpO1xufVxuXG5leHBvcnQgZnVuY3Rpb24gZ2V0RmlsZVRyaWdnZXIodHlwZSwgYXBwbGljYXRpb25JZCkge1xuICByZXR1cm4gZ2V0VHJpZ2dlcihGaWxlQ2xhc3NOYW1lLCB0eXBlLCBhcHBsaWNhdGlvbklkKTtcbn1cblxuZXhwb3J0IGZ1bmN0aW9uIHRyaWdnZXJFeGlzdHMoY2xhc3NOYW1lOiBzdHJpbmcsIHR5cGU6IHN0cmluZywgYXBwbGljYXRpb25JZDogc3RyaW5nKTogYm9vbGVhbiB7XG4gIHJldHVybiBnZXRUcmlnZ2VyKGNsYXNzTmFtZSwgdHlwZSwgYXBwbGljYXRpb25JZCkgIT0gdW5kZWZpbmVkO1xufVxuXG5leHBvcnQgZnVuY3Rpb24gZ2V0RnVuY3Rpb24oZnVuY3Rpb25OYW1lLCBhcHBsaWNhdGlvbklkKSB7XG4gIHJldHVybiBnZXQoQ2F0ZWdvcnkuRnVuY3Rpb25zLCBmdW5jdGlvbk5hbWUsIGFwcGxpY2F0aW9uSWQpO1xufVxuXG5leHBvcnQgZnVuY3Rpb24gZ2V0RnVuY3Rpb25OYW1lcyhhcHBsaWNhdGlvbklkKSB7XG4gIGNvbnN0IHN0b3JlID1cbiAgICAoX3RyaWdnZXJTdG9yZVthcHBsaWNhdGlvbklkXSAmJiBfdHJpZ2dlclN0b3JlW2FwcGxpY2F0aW9uSWRdW0NhdGVnb3J5LkZ1bmN0aW9uc10pIHx8IHt9O1xuICBjb25zdCBmdW5jdGlvbk5hbWVzID0gW107XG4gIGNvbnN0IGV4dHJhY3RGdW5jdGlvbk5hbWVzID0gKG5hbWVzcGFjZSwgc3RvcmUpID0+IHtcbiAgICBPYmplY3Qua2V5cyhzdG9yZSkuZm9yRWFjaChuYW1lID0+IHtcbiAgICAgIGNvbnN0IHZhbHVlID0gc3RvcmVbbmFtZV07XG4gICAgICBpZiAobmFtZXNwYWNlKSB7XG4gICAgICAgIG5hbWUgPSBgJHtuYW1lc3BhY2V9LiR7bmFtZX1gO1xuICAgICAgfVxuICAgICAgaWYgKHR5cGVvZiB2YWx1ZSA9PT0gJ2Z1bmN0aW9uJykge1xuICAgICAgICBmdW5jdGlvbk5hbWVzLnB1c2gobmFtZSk7XG4gICAgICB9IGVsc2Uge1xuICAgICAgICBleHRyYWN0RnVuY3Rpb25OYW1lcyhuYW1lLCB2YWx1ZSk7XG4gICAgICB9XG4gICAgfSk7XG4gIH07XG4gIGV4dHJhY3RGdW5jdGlvbk5hbWVzKG51bGwsIHN0b3JlKTtcbiAgcmV0dXJuIGZ1bmN0aW9uTmFtZXM7XG59XG5cbmV4cG9ydCBmdW5jdGlvbiBnZXRKb2Ioam9iTmFtZSwgYXBwbGljYXRpb25JZCkge1xuICByZXR1cm4gZ2V0KENhdGVnb3J5LkpvYnMsIGpvYk5hbWUsIGFwcGxpY2F0aW9uSWQpO1xufVxuXG5leHBvcnQgZnVuY3Rpb24gZ2V0Sm9icyhhcHBsaWNhdGlvbklkKSB7XG4gIHZhciBtYW5hZ2VyID0gX3RyaWdnZXJTdG9yZVthcHBsaWNhdGlvbklkXTtcbiAgaWYgKG1hbmFnZXIgJiYgbWFuYWdlci5Kb2JzKSB7XG4gICAgcmV0dXJuIG1hbmFnZXIuSm9icztcbiAgfVxuICByZXR1cm4gdW5kZWZpbmVkO1xufVxuXG5leHBvcnQgZnVuY3Rpb24gZ2V0VmFsaWRhdG9yKGZ1bmN0aW9uTmFtZSwgYXBwbGljYXRpb25JZCkge1xuICByZXR1cm4gZ2V0KENhdGVnb3J5LlZhbGlkYXRvcnMsIGZ1bmN0aW9uTmFtZSwgYXBwbGljYXRpb25JZCk7XG59XG5cbmV4cG9ydCBmdW5jdGlvbiBnZXRSZXF1ZXN0T2JqZWN0KFxuICB0cmlnZ2VyVHlwZSxcbiAgYXV0aCxcbiAgcGFyc2VPYmplY3QsXG4gIG9yaWdpbmFsUGFyc2VPYmplY3QsXG4gIGNvbmZpZyxcbiAgY29udGV4dFxuKSB7XG4gIGNvbnN0IHJlcXVlc3QgPSB7XG4gICAgdHJpZ2dlck5hbWU6IHRyaWdnZXJUeXBlLFxuICAgIG9iamVjdDogcGFyc2VPYmplY3QsXG4gICAgbWFzdGVyOiBmYWxzZSxcbiAgICBsb2c6IGNvbmZpZy5sb2dnZXJDb250cm9sbGVyLFxuICAgIGhlYWRlcnM6IGNvbmZpZy5oZWFkZXJzLFxuICAgIGlwOiBjb25maWcuaXAsXG4gIH07XG5cbiAgaWYgKG9yaWdpbmFsUGFyc2VPYmplY3QpIHtcbiAgICByZXF1ZXN0Lm9yaWdpbmFsID0gb3JpZ2luYWxQYXJzZU9iamVjdDtcbiAgfVxuICBpZiAoXG4gICAgdHJpZ2dlclR5cGUgPT09IFR5cGVzLmJlZm9yZVNhdmUgfHxcbiAgICB0cmlnZ2VyVHlwZSA9PT0gVHlwZXMuYWZ0ZXJTYXZlIHx8XG4gICAgdHJpZ2dlclR5cGUgPT09IFR5cGVzLmJlZm9yZURlbGV0ZSB8fFxuICAgIHRyaWdnZXJUeXBlID09PSBUeXBlcy5hZnRlckRlbGV0ZSB8fFxuICAgIHRyaWdnZXJUeXBlID09PSBUeXBlcy5hZnRlckZpbmRcbiAgKSB7XG4gICAgLy8gU2V0IGEgY29weSBvZiB0aGUgY29udGV4dCBvbiB0aGUgcmVxdWVzdCBvYmplY3QuXG4gICAgcmVxdWVzdC5jb250ZXh0ID0gT2JqZWN0LmFzc2lnbih7fSwgY29udGV4dCk7XG4gIH1cblxuICBpZiAoIWF1dGgpIHtcbiAgICByZXR1cm4gcmVxdWVzdDtcbiAgfVxuICBpZiAoYXV0aC5pc01hc3Rlcikge1xuICAgIHJlcXVlc3RbJ21hc3RlciddID0gdHJ1ZTtcbiAgfVxuICBpZiAoYXV0aC51c2VyKSB7XG4gICAgcmVxdWVzdFsndXNlciddID0gYXV0aC51c2VyO1xuICB9XG4gIGlmIChhdXRoLmluc3RhbGxhdGlvbklkKSB7XG4gICAgcmVxdWVzdFsnaW5zdGFsbGF0aW9uSWQnXSA9IGF1dGguaW5zdGFsbGF0aW9uSWQ7XG4gIH1cbiAgcmV0dXJuIHJlcXVlc3Q7XG59XG5cbmV4cG9ydCBmdW5jdGlvbiBnZXRSZXF1ZXN0UXVlcnlPYmplY3QodHJpZ2dlclR5cGUsIGF1dGgsIHF1ZXJ5LCBjb3VudCwgY29uZmlnLCBjb250ZXh0LCBpc0dldCkge1xuICBpc0dldCA9ICEhaXNHZXQ7XG5cbiAgdmFyIHJlcXVlc3QgPSB7XG4gICAgdHJpZ2dlck5hbWU6IHRyaWdnZXJUeXBlLFxuICAgIHF1ZXJ5LFxuICAgIG1hc3RlcjogZmFsc2UsXG4gICAgY291bnQsXG4gICAgbG9nOiBjb25maWcubG9nZ2VyQ29udHJvbGxlcixcbiAgICBpc0dldCxcbiAgICBoZWFkZXJzOiBjb25maWcuaGVhZGVycyxcbiAgICBpcDogY29uZmlnLmlwLFxuICAgIGNvbnRleHQ6IGNvbnRleHQgfHwge30sXG4gIH07XG5cbiAgaWYgKCFhdXRoKSB7XG4gICAgcmV0dXJuIHJlcXVlc3Q7XG4gIH1cbiAgaWYgKGF1dGguaXNNYXN0ZXIpIHtcbiAgICByZXF1ZXN0WydtYXN0ZXInXSA9IHRydWU7XG4gIH1cbiAgaWYgKGF1dGgudXNlcikge1xuICAgIHJlcXVlc3RbJ3VzZXInXSA9IGF1dGgudXNlcjtcbiAgfVxuICBpZiAoYXV0aC5pbnN0YWxsYXRpb25JZCkge1xuICAgIHJlcXVlc3RbJ2luc3RhbGxhdGlvbklkJ10gPSBhdXRoLmluc3RhbGxhdGlvbklkO1xuICB9XG4gIHJldHVybiByZXF1ZXN0O1xufVxuXG4vLyBDcmVhdGVzIHRoZSByZXNwb25zZSBvYmplY3QsIGFuZCB1c2VzIHRoZSByZXF1ZXN0IG9iamVjdCB0byBwYXNzIGRhdGFcbi8vIFRoZSBBUEkgd2lsbCBjYWxsIHRoaXMgd2l0aCBSRVNUIEFQSSBmb3JtYXR0ZWQgb2JqZWN0cywgdGhpcyB3aWxsXG4vLyB0cmFuc2Zvcm0gdGhlbSB0byBQYXJzZS5PYmplY3QgaW5zdGFuY2VzIGV4cGVjdGVkIGJ5IENsb3VkIENvZGUuXG4vLyBBbnkgY2hhbmdlcyBtYWRlIHRvIHRoZSBvYmplY3QgaW4gYSBiZWZvcmVTYXZlIHdpbGwgYmUgaW5jbHVkZWQuXG5leHBvcnQgZnVuY3Rpb24gZ2V0UmVzcG9uc2VPYmplY3QocmVxdWVzdCwgcmVzb2x2ZSwgcmVqZWN0KSB7XG4gIHJldHVybiB7XG4gICAgc3VjY2VzczogZnVuY3Rpb24gKHJlc3BvbnNlKSB7XG4gICAgICBpZiAocmVxdWVzdC50cmlnZ2VyTmFtZSA9PT0gVHlwZXMuYWZ0ZXJGaW5kKSB7XG4gICAgICAgIGlmICghcmVzcG9uc2UpIHtcbiAgICAgICAgICByZXNwb25zZSA9IHJlcXVlc3Qub2JqZWN0cztcbiAgICAgICAgfVxuICAgICAgICByZXNwb25zZSA9IHJlc3BvbnNlLm1hcChvYmplY3QgPT4ge1xuICAgICAgICAgIHJldHVybiBvYmplY3QudG9KU09OKCk7XG4gICAgICAgIH0pO1xuICAgICAgICByZXR1cm4gcmVzb2x2ZShyZXNwb25zZSk7XG4gICAgICB9XG4gICAgICAvLyBVc2UgdGhlIEpTT04gcmVzcG9uc2VcbiAgICAgIGlmIChcbiAgICAgICAgcmVzcG9uc2UgJiZcbiAgICAgICAgdHlwZW9mIHJlc3BvbnNlID09PSAnb2JqZWN0JyAmJlxuICAgICAgICAhcmVxdWVzdC5vYmplY3QuZXF1YWxzKHJlc3BvbnNlKSAmJlxuICAgICAgICByZXF1ZXN0LnRyaWdnZXJOYW1lID09PSBUeXBlcy5iZWZvcmVTYXZlXG4gICAgICApIHtcbiAgICAgICAgcmV0dXJuIHJlc29sdmUocmVzcG9uc2UpO1xuICAgICAgfVxuICAgICAgaWYgKHJlc3BvbnNlICYmIHR5cGVvZiByZXNwb25zZSA9PT0gJ29iamVjdCcgJiYgcmVxdWVzdC50cmlnZ2VyTmFtZSA9PT0gVHlwZXMuYWZ0ZXJTYXZlKSB7XG4gICAgICAgIHJldHVybiByZXNvbHZlKHJlc3BvbnNlKTtcbiAgICAgIH1cbiAgICAgIGlmIChyZXF1ZXN0LnRyaWdnZXJOYW1lID09PSBUeXBlcy5hZnRlclNhdmUpIHtcbiAgICAgICAgcmV0dXJuIHJlc29sdmUoKTtcbiAgICAgIH1cbiAgICAgIHJlc3BvbnNlID0ge307XG4gICAgICBpZiAocmVxdWVzdC50cmlnZ2VyTmFtZSA9PT0gVHlwZXMuYmVmb3JlU2F2ZSkge1xuICAgICAgICByZXNwb25zZVsnb2JqZWN0J10gPSByZXF1ZXN0Lm9iamVjdC5fZ2V0U2F2ZUpTT04oKTtcbiAgICAgIH1cbiAgICAgIHJldHVybiByZXNvbHZlKHJlc3BvbnNlKTtcbiAgICB9LFxuICAgIGVycm9yOiBmdW5jdGlvbiAoZXJyb3IpIHtcbiAgICAgIGNvbnN0IGUgPSByZXNvbHZlRXJyb3IoZXJyb3IsIHtcbiAgICAgICAgY29kZTogUGFyc2UuRXJyb3IuU0NSSVBUX0ZBSUxFRCxcbiAgICAgICAgbWVzc2FnZTogJ1NjcmlwdCBmYWlsZWQuIFVua25vd24gZXJyb3IuJyxcbiAgICAgIH0pO1xuICAgICAgcmVqZWN0KGUpO1xuICAgIH0sXG4gIH07XG59XG5cbmZ1bmN0aW9uIHVzZXJJZEZvckxvZyhhdXRoKSB7XG4gIHJldHVybiBhdXRoICYmIGF1dGgudXNlciA/IGF1dGgudXNlci5pZCA6IHVuZGVmaW5lZDtcbn1cblxuZnVuY3Rpb24gbG9nVHJpZ2dlckFmdGVySG9vayh0cmlnZ2VyVHlwZSwgY2xhc3NOYW1lLCBpbnB1dCwgYXV0aCkge1xuICBjb25zdCBjbGVhbklucHV0ID0gbG9nZ2VyLnRydW5jYXRlTG9nTWVzc2FnZShKU09OLnN0cmluZ2lmeShpbnB1dCkpO1xuICBsb2dnZXIuaW5mbyhcbiAgICBgJHt0cmlnZ2VyVHlwZX0gdHJpZ2dlcmVkIGZvciAke2NsYXNzTmFtZX0gZm9yIHVzZXIgJHt1c2VySWRGb3JMb2coXG4gICAgICBhdXRoXG4gICAgKX06XFxuICBJbnB1dDogJHtjbGVhbklucHV0fWAsXG4gICAge1xuICAgICAgY2xhc3NOYW1lLFxuICAgICAgdHJpZ2dlclR5cGUsXG4gICAgICB1c2VyOiB1c2VySWRGb3JMb2coYXV0aCksXG4gICAgfVxuICApO1xufVxuXG5mdW5jdGlvbiBsb2dUcmlnZ2VyU3VjY2Vzc0JlZm9yZUhvb2sodHJpZ2dlclR5cGUsIGNsYXNzTmFtZSwgaW5wdXQsIHJlc3VsdCwgYXV0aCkge1xuICBjb25zdCBjbGVhbklucHV0ID0gbG9nZ2VyLnRydW5jYXRlTG9nTWVzc2FnZShKU09OLnN0cmluZ2lmeShpbnB1dCkpO1xuICBjb25zdCBjbGVhblJlc3VsdCA9IGxvZ2dlci50cnVuY2F0ZUxvZ01lc3NhZ2UoSlNPTi5zdHJpbmdpZnkocmVzdWx0KSk7XG4gIGxvZ2dlci5pbmZvKFxuICAgIGAke3RyaWdnZXJUeXBlfSB0cmlnZ2VyZWQgZm9yICR7Y2xhc3NOYW1lfSBmb3IgdXNlciAke3VzZXJJZEZvckxvZyhcbiAgICAgIGF1dGhcbiAgICApfTpcXG4gIElucHV0OiAke2NsZWFuSW5wdXR9XFxuICBSZXN1bHQ6ICR7Y2xlYW5SZXN1bHR9YCxcbiAgICB7XG4gICAgICBjbGFzc05hbWUsXG4gICAgICB0cmlnZ2VyVHlwZSxcbiAgICAgIHVzZXI6IHVzZXJJZEZvckxvZyhhdXRoKSxcbiAgICB9XG4gICk7XG59XG5cbmZ1bmN0aW9uIGxvZ1RyaWdnZXJFcnJvckJlZm9yZUhvb2sodHJpZ2dlclR5cGUsIGNsYXNzTmFtZSwgaW5wdXQsIGF1dGgsIGVycm9yKSB7XG4gIGNvbnN0IGNsZWFuSW5wdXQgPSBsb2dnZXIudHJ1bmNhdGVMb2dNZXNzYWdlKEpTT04uc3RyaW5naWZ5KGlucHV0KSk7XG4gIGxvZ2dlci5lcnJvcihcbiAgICBgJHt0cmlnZ2VyVHlwZX0gZmFpbGVkIGZvciAke2NsYXNzTmFtZX0gZm9yIHVzZXIgJHt1c2VySWRGb3JMb2coXG4gICAgICBhdXRoXG4gICAgKX06XFxuICBJbnB1dDogJHtjbGVhbklucHV0fVxcbiAgRXJyb3I6ICR7SlNPTi5zdHJpbmdpZnkoZXJyb3IpfWAsXG4gICAge1xuICAgICAgY2xhc3NOYW1lLFxuICAgICAgdHJpZ2dlclR5cGUsXG4gICAgICBlcnJvcixcbiAgICAgIHVzZXI6IHVzZXJJZEZvckxvZyhhdXRoKSxcbiAgICB9XG4gICk7XG59XG5cbmV4cG9ydCBmdW5jdGlvbiBtYXliZVJ1bkFmdGVyRmluZFRyaWdnZXIoXG4gIHRyaWdnZXJUeXBlLFxuICBhdXRoLFxuICBjbGFzc05hbWUsXG4gIG9iamVjdHMsXG4gIGNvbmZpZyxcbiAgcXVlcnksXG4gIGNvbnRleHRcbikge1xuICByZXR1cm4gbmV3IFByb21pc2UoKHJlc29sdmUsIHJlamVjdCkgPT4ge1xuICAgIGNvbnN0IHRyaWdnZXIgPSBnZXRUcmlnZ2VyKGNsYXNzTmFtZSwgdHJpZ2dlclR5cGUsIGNvbmZpZy5hcHBsaWNhdGlvbklkKTtcbiAgICBpZiAoIXRyaWdnZXIpIHtcbiAgICAgIHJldHVybiByZXNvbHZlKCk7XG4gICAgfVxuICAgIGNvbnN0IHJlcXVlc3QgPSBnZXRSZXF1ZXN0T2JqZWN0KHRyaWdnZXJUeXBlLCBhdXRoLCBudWxsLCBudWxsLCBjb25maWcsIGNvbnRleHQpO1xuICAgIGlmIChxdWVyeSkge1xuICAgICAgcmVxdWVzdC5xdWVyeSA9IHF1ZXJ5O1xuICAgIH1cbiAgICBjb25zdCB7IHN1Y2Nlc3MsIGVycm9yIH0gPSBnZXRSZXNwb25zZU9iamVjdChcbiAgICAgIHJlcXVlc3QsXG4gICAgICBvYmplY3QgPT4ge1xuICAgICAgICByZXNvbHZlKG9iamVjdCk7XG4gICAgICB9LFxuICAgICAgZXJyb3IgPT4ge1xuICAgICAgICByZWplY3QoZXJyb3IpO1xuICAgICAgfVxuICAgICk7XG4gICAgbG9nVHJpZ2dlclN1Y2Nlc3NCZWZvcmVIb29rKHRyaWdnZXJUeXBlLCBjbGFzc05hbWUsICdBZnRlckZpbmQnLCBKU09OLnN0cmluZ2lmeShvYmplY3RzKSwgYXV0aCk7XG4gICAgcmVxdWVzdC5vYmplY3RzID0gb2JqZWN0cy5tYXAob2JqZWN0ID0+IHtcbiAgICAgIC8vc2V0dGluZyB0aGUgY2xhc3MgbmFtZSB0byB0cmFuc2Zvcm0gaW50byBwYXJzZSBvYmplY3RcbiAgICAgIG9iamVjdC5jbGFzc05hbWUgPSBjbGFzc05hbWU7XG4gICAgICByZXR1cm4gUGFyc2UuT2JqZWN0LmZyb21KU09OKG9iamVjdCk7XG4gICAgfSk7XG4gICAgcmV0dXJuIFByb21pc2UucmVzb2x2ZSgpXG4gICAgICAudGhlbigoKSA9PiB7XG4gICAgICAgIHJldHVybiBtYXliZVJ1blZhbGlkYXRvcihyZXF1ZXN0LCBgJHt0cmlnZ2VyVHlwZX0uJHtjbGFzc05hbWV9YCk7XG4gICAgICB9KVxuICAgICAgLnRoZW4oKCkgPT4ge1xuICAgICAgICBpZiAocmVxdWVzdC5za2lwV2l0aE1hc3RlcktleSkge1xuICAgICAgICAgIHJldHVybiByZXF1ZXN0Lm9iamVjdHM7XG4gICAgICAgIH1cbiAgICAgICAgY29uc3QgcmVzcG9uc2UgPSB0cmlnZ2VyKHJlcXVlc3QpO1xuICAgICAgICBpZiAocmVzcG9uc2UgJiYgdHlwZW9mIHJlc3BvbnNlLnRoZW4gPT09ICdmdW5jdGlvbicpIHtcbiAgICAgICAgICByZXR1cm4gcmVzcG9uc2UudGhlbihyZXN1bHRzID0+IHtcbiAgICAgICAgICAgIGlmICghcmVzdWx0cykge1xuICAgICAgICAgICAgICB0aHJvdyBuZXcgUGFyc2UuRXJyb3IoXG4gICAgICAgICAgICAgICAgUGFyc2UuRXJyb3IuU0NSSVBUX0ZBSUxFRCxcbiAgICAgICAgICAgICAgICAnQWZ0ZXJGaW5kIGV4cGVjdCByZXN1bHRzIHRvIGJlIHJldHVybmVkIGluIHRoZSBwcm9taXNlJ1xuICAgICAgICAgICAgICApO1xuICAgICAgICAgICAgfVxuICAgICAgICAgICAgcmV0dXJuIHJlc3VsdHM7XG4gICAgICAgICAgfSk7XG4gICAgICAgIH1cbiAgICAgICAgcmV0dXJuIHJlc3BvbnNlO1xuICAgICAgfSlcbiAgICAgIC50aGVuKHN1Y2Nlc3MsIGVycm9yKTtcbiAgfSkudGhlbihyZXN1bHRzID0+IHtcbiAgICBsb2dUcmlnZ2VyQWZ0ZXJIb29rKHRyaWdnZXJUeXBlLCBjbGFzc05hbWUsIEpTT04uc3RyaW5naWZ5KHJlc3VsdHMpLCBhdXRoKTtcbiAgICByZXR1cm4gcmVzdWx0cztcbiAgfSk7XG59XG5cbmV4cG9ydCBmdW5jdGlvbiBtYXliZVJ1blF1ZXJ5VHJpZ2dlcihcbiAgdHJpZ2dlclR5cGUsXG4gIGNsYXNzTmFtZSxcbiAgcmVzdFdoZXJlLFxuICByZXN0T3B0aW9ucyxcbiAgY29uZmlnLFxuICBhdXRoLFxuICBjb250ZXh0LFxuICBpc0dldFxuKSB7XG4gIGNvbnN0IHRyaWdnZXIgPSBnZXRUcmlnZ2VyKGNsYXNzTmFtZSwgdHJpZ2dlclR5cGUsIGNvbmZpZy5hcHBsaWNhdGlvbklkKTtcbiAgaWYgKCF0cmlnZ2VyKSB7XG4gICAgcmV0dXJuIFByb21pc2UucmVzb2x2ZSh7XG4gICAgICByZXN0V2hlcmUsXG4gICAgICByZXN0T3B0aW9ucyxcbiAgICB9KTtcbiAgfVxuICBjb25zdCBqc29uID0gT2JqZWN0LmFzc2lnbih7fSwgcmVzdE9wdGlvbnMpO1xuICBqc29uLndoZXJlID0gcmVzdFdoZXJlO1xuXG4gIGNvbnN0IHBhcnNlUXVlcnkgPSBuZXcgUGFyc2UuUXVlcnkoY2xhc3NOYW1lKTtcbiAgcGFyc2VRdWVyeS53aXRoSlNPTihqc29uKTtcblxuICBsZXQgY291bnQgPSBmYWxzZTtcbiAgaWYgKHJlc3RPcHRpb25zKSB7XG4gICAgY291bnQgPSAhIXJlc3RPcHRpb25zLmNvdW50O1xuICB9XG4gIGNvbnN0IHJlcXVlc3RPYmplY3QgPSBnZXRSZXF1ZXN0UXVlcnlPYmplY3QoXG4gICAgdHJpZ2dlclR5cGUsXG4gICAgYXV0aCxcbiAgICBwYXJzZVF1ZXJ5LFxuICAgIGNvdW50LFxuICAgIGNvbmZpZyxcbiAgICBjb250ZXh0LFxuICAgIGlzR2V0XG4gICk7XG4gIHJldHVybiBQcm9taXNlLnJlc29sdmUoKVxuICAgIC50aGVuKCgpID0+IHtcbiAgICAgIHJldHVybiBtYXliZVJ1blZhbGlkYXRvcihyZXF1ZXN0T2JqZWN0LCBgJHt0cmlnZ2VyVHlwZX0uJHtjbGFzc05hbWV9YCk7XG4gICAgfSlcbiAgICAudGhlbigoKSA9PiB7XG4gICAgICBpZiAocmVxdWVzdE9iamVjdC5za2lwV2l0aE1hc3RlcktleSkge1xuICAgICAgICByZXR1cm4gcmVxdWVzdE9iamVjdC5xdWVyeTtcbiAgICAgIH1cbiAgICAgIHJldHVybiB0cmlnZ2VyKHJlcXVlc3RPYmplY3QpO1xuICAgIH0pXG4gICAgLnRoZW4oXG4gICAgICByZXN1bHQgPT4ge1xuICAgICAgICBsZXQgcXVlcnlSZXN1bHQgPSBwYXJzZVF1ZXJ5O1xuICAgICAgICBpZiAocmVzdWx0ICYmIHJlc3VsdCBpbnN0YW5jZW9mIFBhcnNlLlF1ZXJ5KSB7XG4gICAgICAgICAgcXVlcnlSZXN1bHQgPSByZXN1bHQ7XG4gICAgICAgIH1cbiAgICAgICAgY29uc3QganNvblF1ZXJ5ID0gcXVlcnlSZXN1bHQudG9KU09OKCk7XG4gICAgICAgIGlmIChqc29uUXVlcnkud2hlcmUpIHtcbiAgICAgICAgICByZXN0V2hlcmUgPSBqc29uUXVlcnkud2hlcmU7XG4gICAgICAgIH1cbiAgICAgICAgaWYgKGpzb25RdWVyeS5saW1pdCkge1xuICAgICAgICAgIHJlc3RPcHRpb25zID0gcmVzdE9wdGlvbnMgfHwge307XG4gICAgICAgICAgcmVzdE9wdGlvbnMubGltaXQgPSBqc29uUXVlcnkubGltaXQ7XG4gICAgICAgIH1cbiAgICAgICAgaWYgKGpzb25RdWVyeS5za2lwKSB7XG4gICAgICAgICAgcmVzdE9wdGlvbnMgPSByZXN0T3B0aW9ucyB8fCB7fTtcbiAgICAgICAgICByZXN0T3B0aW9ucy5za2lwID0ganNvblF1ZXJ5LnNraXA7XG4gICAgICAgIH1cbiAgICAgICAgaWYgKGpzb25RdWVyeS5pbmNsdWRlKSB7XG4gICAgICAgICAgcmVzdE9wdGlvbnMgPSByZXN0T3B0aW9ucyB8fCB7fTtcbiAgICAgICAgICByZXN0T3B0aW9ucy5pbmNsdWRlID0ganNvblF1ZXJ5LmluY2x1ZGU7XG4gICAgICAgIH1cbiAgICAgICAgaWYgKGpzb25RdWVyeS5leGNsdWRlS2V5cykge1xuICAgICAgICAgIHJlc3RPcHRpb25zID0gcmVzdE9wdGlvbnMgfHwge307XG4gICAgICAgICAgcmVzdE9wdGlvbnMuZXhjbHVkZUtleXMgPSBqc29uUXVlcnkuZXhjbHVkZUtleXM7XG4gICAgICAgIH1cbiAgICAgICAgaWYgKGpzb25RdWVyeS5leHBsYWluKSB7XG4gICAgICAgICAgcmVzdE9wdGlvbnMgPSByZXN0T3B0aW9ucyB8fCB7fTtcbiAgICAgICAgICByZXN0T3B0aW9ucy5leHBsYWluID0ganNvblF1ZXJ5LmV4cGxhaW47XG4gICAgICAgIH1cbiAgICAgICAgaWYgKGpzb25RdWVyeS5rZXlzKSB7XG4gICAgICAgICAgcmVzdE9wdGlvbnMgPSByZXN0T3B0aW9ucyB8fCB7fTtcbiAgICAgICAgICByZXN0T3B0aW9ucy5rZXlzID0ganNvblF1ZXJ5LmtleXM7XG4gICAgICAgIH1cbiAgICAgICAgaWYgKGpzb25RdWVyeS5vcmRlcikge1xuICAgICAgICAgIHJlc3RPcHRpb25zID0gcmVzdE9wdGlvbnMgfHwge307XG4gICAgICAgICAgcmVzdE9wdGlvbnMub3JkZXIgPSBqc29uUXVlcnkub3JkZXI7XG4gICAgICAgIH1cbiAgICAgICAgaWYgKGpzb25RdWVyeS5oaW50KSB7XG4gICAgICAgICAgcmVzdE9wdGlvbnMgPSByZXN0T3B0aW9ucyB8fCB7fTtcbiAgICAgICAgICByZXN0T3B0aW9ucy5oaW50ID0ganNvblF1ZXJ5LmhpbnQ7XG4gICAgICAgIH1cbiAgICAgICAgaWYgKHJlcXVlc3RPYmplY3QucmVhZFByZWZlcmVuY2UpIHtcbiAgICAgICAgICByZXN0T3B0aW9ucyA9IHJlc3RPcHRpb25zIHx8IHt9O1xuICAgICAgICAgIHJlc3RPcHRpb25zLnJlYWRQcmVmZXJlbmNlID0gcmVxdWVzdE9iamVjdC5yZWFkUHJlZmVyZW5jZTtcbiAgICAgICAgfVxuICAgICAgICBpZiAocmVxdWVzdE9iamVjdC5pbmNsdWRlUmVhZFByZWZlcmVuY2UpIHtcbiAgICAgICAgICByZXN0T3B0aW9ucyA9IHJlc3RPcHRpb25zIHx8IHt9O1xuICAgICAgICAgIHJlc3RPcHRpb25zLmluY2x1ZGVSZWFkUHJlZmVyZW5jZSA9IHJlcXVlc3RPYmplY3QuaW5jbHVkZVJlYWRQcmVmZXJlbmNlO1xuICAgICAgICB9XG4gICAgICAgIGlmIChyZXF1ZXN0T2JqZWN0LnN1YnF1ZXJ5UmVhZFByZWZlcmVuY2UpIHtcbiAgICAgICAgICByZXN0T3B0aW9ucyA9IHJlc3RPcHRpb25zIHx8IHt9O1xuICAgICAgICAgIHJlc3RPcHRpb25zLnN1YnF1ZXJ5UmVhZFByZWZlcmVuY2UgPSByZXF1ZXN0T2JqZWN0LnN1YnF1ZXJ5UmVhZFByZWZlcmVuY2U7XG4gICAgICAgIH1cbiAgICAgICAgcmV0dXJuIHtcbiAgICAgICAgICByZXN0V2hlcmUsXG4gICAgICAgICAgcmVzdE9wdGlvbnMsXG4gICAgICAgIH07XG4gICAgICB9LFxuICAgICAgZXJyID0+IHtcbiAgICAgICAgY29uc3QgZXJyb3IgPSByZXNvbHZlRXJyb3IoZXJyLCB7XG4gICAgICAgICAgY29kZTogUGFyc2UuRXJyb3IuU0NSSVBUX0ZBSUxFRCxcbiAgICAgICAgICBtZXNzYWdlOiAnU2NyaXB0IGZhaWxlZC4gVW5rbm93biBlcnJvci4nLFxuICAgICAgICB9KTtcbiAgICAgICAgdGhyb3cgZXJyb3I7XG4gICAgICB9XG4gICAgKTtcbn1cblxuZXhwb3J0IGZ1bmN0aW9uIHJlc29sdmVFcnJvcihtZXNzYWdlLCBkZWZhdWx0T3B0cykge1xuICBpZiAoIWRlZmF1bHRPcHRzKSB7XG4gICAgZGVmYXVsdE9wdHMgPSB7fTtcbiAgfVxuICBpZiAoIW1lc3NhZ2UpIHtcbiAgICByZXR1cm4gbmV3IFBhcnNlLkVycm9yKFxuICAgICAgZGVmYXVsdE9wdHMuY29kZSB8fCBQYXJzZS5FcnJvci5TQ1JJUFRfRkFJTEVELFxuICAgICAgZGVmYXVsdE9wdHMubWVzc2FnZSB8fCAnU2NyaXB0IGZhaWxlZC4nXG4gICAgKTtcbiAgfVxuICBpZiAobWVzc2FnZSBpbnN0YW5jZW9mIFBhcnNlLkVycm9yKSB7XG4gICAgcmV0dXJuIG1lc3NhZ2U7XG4gIH1cblxuICBjb25zdCBjb2RlID0gZGVmYXVsdE9wdHMuY29kZSB8fCBQYXJzZS5FcnJvci5TQ1JJUFRfRkFJTEVEO1xuICAvLyBJZiBpdCdzIGFuIGVycm9yLCBtYXJrIGl0IGFzIGEgc2NyaXB0IGZhaWxlZFxuICBpZiAodHlwZW9mIG1lc3NhZ2UgPT09ICdzdHJpbmcnKSB7XG4gICAgcmV0dXJuIG5ldyBQYXJzZS5FcnJvcihjb2RlLCBtZXNzYWdlKTtcbiAgfVxuICBjb25zdCBlcnJvciA9IG5ldyBQYXJzZS5FcnJvcihjb2RlLCBtZXNzYWdlLm1lc3NhZ2UgfHwgbWVzc2FnZSk7XG4gIGlmIChtZXNzYWdlIGluc3RhbmNlb2YgRXJyb3IpIHtcbiAgICBlcnJvci5zdGFjayA9IG1lc3NhZ2Uuc3RhY2s7XG4gIH1cbiAgcmV0dXJuIGVycm9yO1xufVxuZXhwb3J0IGZ1bmN0aW9uIG1heWJlUnVuVmFsaWRhdG9yKHJlcXVlc3QsIGZ1bmN0aW9uTmFtZSkge1xuICBjb25zdCB0aGVWYWxpZGF0b3IgPSBnZXRWYWxpZGF0b3IoZnVuY3Rpb25OYW1lLCBQYXJzZS5hcHBsaWNhdGlvbklkKTtcbiAgaWYgKCF0aGVWYWxpZGF0b3IpIHtcbiAgICByZXR1cm47XG4gIH1cbiAgaWYgKHR5cGVvZiB0aGVWYWxpZGF0b3IgPT09ICdvYmplY3QnICYmIHRoZVZhbGlkYXRvci5za2lwV2l0aE1hc3RlcktleSAmJiByZXF1ZXN0Lm1hc3Rlcikge1xuICAgIHJlcXVlc3Quc2tpcFdpdGhNYXN0ZXJLZXkgPSB0cnVlO1xuICB9XG4gIHJldHVybiBuZXcgUHJvbWlzZSgocmVzb2x2ZSwgcmVqZWN0KSA9PiB7XG4gICAgcmV0dXJuIFByb21pc2UucmVzb2x2ZSgpXG4gICAgICAudGhlbigoKSA9PiB7XG4gICAgICAgIHJldHVybiB0eXBlb2YgdGhlVmFsaWRhdG9yID09PSAnb2JqZWN0J1xuICAgICAgICAgID8gYnVpbHRJblRyaWdnZXJWYWxpZGF0b3IodGhlVmFsaWRhdG9yLCByZXF1ZXN0KVxuICAgICAgICAgIDogdGhlVmFsaWRhdG9yKHJlcXVlc3QpO1xuICAgICAgfSlcbiAgICAgIC50aGVuKCgpID0+IHtcbiAgICAgICAgcmVzb2x2ZSgpO1xuICAgICAgfSlcbiAgICAgIC5jYXRjaChlID0+IHtcbiAgICAgICAgY29uc3QgZXJyb3IgPSByZXNvbHZlRXJyb3IoZSwge1xuICAgICAgICAgIGNvZGU6IFBhcnNlLkVycm9yLlZBTElEQVRJT05fRVJST1IsXG4gICAgICAgICAgbWVzc2FnZTogJ1ZhbGlkYXRpb24gZmFpbGVkLicsXG4gICAgICAgIH0pO1xuICAgICAgICByZWplY3QoZXJyb3IpO1xuICAgICAgfSk7XG4gIH0pO1xufVxuZnVuY3Rpb24gYnVpbHRJblRyaWdnZXJWYWxpZGF0b3Iob3B0aW9ucywgcmVxdWVzdCkge1xuICBpZiAocmVxdWVzdC5tYXN0ZXIgJiYgIW9wdGlvbnMudmFsaWRhdGVNYXN0ZXJLZXkpIHtcbiAgICByZXR1cm47XG4gIH1cbiAgbGV0IHJlcVVzZXIgPSByZXF1ZXN0LnVzZXI7XG4gIGlmIChcbiAgICAhcmVxVXNlciAmJlxuICAgIHJlcXVlc3Qub2JqZWN0ICYmXG4gICAgcmVxdWVzdC5vYmplY3QuY2xhc3NOYW1lID09PSAnX1VzZXInICYmXG4gICAgIXJlcXVlc3Qub2JqZWN0LmV4aXN0ZWQoKVxuICApIHtcbiAgICByZXFVc2VyID0gcmVxdWVzdC5vYmplY3Q7XG4gIH1cbiAgaWYgKG9wdGlvbnMucmVxdWlyZVVzZXIgJiYgIXJlcVVzZXIpIHtcbiAgICB0aHJvdyAnVmFsaWRhdGlvbiBmYWlsZWQuIFBsZWFzZSBsb2dpbiB0byBjb250aW51ZS4nO1xuICB9XG4gIGlmIChvcHRpb25zLnJlcXVpcmVNYXN0ZXIgJiYgIXJlcXVlc3QubWFzdGVyKSB7XG4gICAgdGhyb3cgJ1ZhbGlkYXRpb24gZmFpbGVkLiBNYXN0ZXIga2V5IGlzIHJlcXVpcmVkIHRvIGNvbXBsZXRlIHRoaXMgcmVxdWVzdC4nO1xuICB9XG4gIGxldCBwYXJhbXMgPSByZXF1ZXN0LnBhcmFtcyB8fCB7fTtcbiAgaWYgKHJlcXVlc3Qub2JqZWN0KSB7XG4gICAgcGFyYW1zID0gcmVxdWVzdC5vYmplY3QudG9KU09OKCk7XG4gIH1cbiAgY29uc3QgcmVxdWlyZWRQYXJhbSA9IGtleSA9PiB7XG4gICAgY29uc3QgdmFsdWUgPSBwYXJhbXNba2V5XTtcbiAgICBpZiAodmFsdWUgPT0gbnVsbCkge1xuICAgICAgdGhyb3cgYFZhbGlkYXRpb24gZmFpbGVkLiBQbGVhc2Ugc3BlY2lmeSBkYXRhIGZvciAke2tleX0uYDtcbiAgICB9XG4gIH07XG5cbiAgY29uc3QgdmFsaWRhdGVPcHRpb25zID0gKG9wdCwga2V5LCB2YWwpID0+IHtcbiAgICBsZXQgb3B0cyA9IG9wdC5vcHRpb25zO1xuICAgIGlmICh0eXBlb2Ygb3B0cyA9PT0gJ2Z1bmN0aW9uJykge1xuICAgICAgdHJ5IHtcbiAgICAgICAgY29uc3QgcmVzdWx0ID0gb3B0cyh2YWwpO1xuICAgICAgICBpZiAoIXJlc3VsdCAmJiByZXN1bHQgIT0gbnVsbCkge1xuICAgICAgICAgIHRocm93IG9wdC5lcnJvciB8fCBgVmFsaWRhdGlvbiBmYWlsZWQuIEludmFsaWQgdmFsdWUgZm9yICR7a2V5fS5gO1xuICAgICAgICB9XG4gICAgICB9IGNhdGNoIChlKSB7XG4gICAgICAgIGlmICghZSkge1xuICAgICAgICAgIHRocm93IG9wdC5lcnJvciB8fCBgVmFsaWRhdGlvbiBmYWlsZWQuIEludmFsaWQgdmFsdWUgZm9yICR7a2V5fS5gO1xuICAgICAgICB9XG5cbiAgICAgICAgdGhyb3cgb3B0LmVycm9yIHx8IGUubWVzc2FnZSB8fCBlO1xuICAgICAgfVxuICAgICAgcmV0dXJuO1xuICAgIH1cbiAgICBpZiAoIUFycmF5LmlzQXJyYXkob3B0cykpIHtcbiAgICAgIG9wdHMgPSBbb3B0Lm9wdGlvbnNdO1xuICAgIH1cblxuICAgIGlmICghb3B0cy5pbmNsdWRlcyh2YWwpKSB7XG4gICAgICB0aHJvdyAoXG4gICAgICAgIG9wdC5lcnJvciB8fCBgVmFsaWRhdGlvbiBmYWlsZWQuIEludmFsaWQgb3B0aW9uIGZvciAke2tleX0uIEV4cGVjdGVkOiAke29wdHMuam9pbignLCAnKX1gXG4gICAgICApO1xuICAgIH1cbiAgfTtcblxuICBjb25zdCBnZXRUeXBlID0gZm4gPT4ge1xuICAgIGNvbnN0IG1hdGNoID0gZm4gJiYgZm4udG9TdHJpbmcoKS5tYXRjaCgvXlxccypmdW5jdGlvbiAoXFx3KykvKTtcbiAgICByZXR1cm4gKG1hdGNoID8gbWF0Y2hbMV0gOiAnJykudG9Mb3dlckNhc2UoKTtcbiAgfTtcbiAgaWYgKEFycmF5LmlzQXJyYXkob3B0aW9ucy5maWVsZHMpKSB7XG4gICAgZm9yIChjb25zdCBrZXkgb2Ygb3B0aW9ucy5maWVsZHMpIHtcbiAgICAgIHJlcXVpcmVkUGFyYW0oa2V5KTtcbiAgICB9XG4gIH0gZWxzZSB7XG4gICAgZm9yIChjb25zdCBrZXkgaW4gb3B0aW9ucy5maWVsZHMpIHtcbiAgICAgIGNvbnN0IG9wdCA9IG9wdGlvbnMuZmllbGRzW2tleV07XG4gICAgICBsZXQgdmFsID0gcGFyYW1zW2tleV07XG4gICAgICBpZiAodHlwZW9mIG9wdCA9PT0gJ3N0cmluZycpIHtcbiAgICAgICAgcmVxdWlyZWRQYXJhbShvcHQpO1xuICAgICAgfVxuICAgICAgaWYgKHR5cGVvZiBvcHQgPT09ICdvYmplY3QnKSB7XG4gICAgICAgIGlmIChvcHQuZGVmYXVsdCAhPSBudWxsICYmIHZhbCA9PSBudWxsKSB7XG4gICAgICAgICAgdmFsID0gb3B0LmRlZmF1bHQ7XG4gICAgICAgICAgcGFyYW1zW2tleV0gPSB2YWw7XG4gICAgICAgICAgaWYgKHJlcXVlc3Qub2JqZWN0KSB7XG4gICAgICAgICAgICByZXF1ZXN0Lm9iamVjdC5zZXQoa2V5LCB2YWwpO1xuICAgICAgICAgIH1cbiAgICAgICAgfVxuICAgICAgICBpZiAob3B0LmNvbnN0YW50ICYmIHJlcXVlc3Qub2JqZWN0KSB7XG4gICAgICAgICAgaWYgKHJlcXVlc3Qub3JpZ2luYWwpIHtcbiAgICAgICAgICAgIHJlcXVlc3Qub2JqZWN0LnNldChrZXksIHJlcXVlc3Qub3JpZ2luYWwuZ2V0KGtleSkpO1xuICAgICAgICAgIH0gZWxzZSBpZiAob3B0LmRlZmF1bHQgIT0gbnVsbCkge1xuICAgICAgICAgICAgcmVxdWVzdC5vYmplY3Quc2V0KGtleSwgb3B0LmRlZmF1bHQpO1xuICAgICAgICAgIH1cbiAgICAgICAgfVxuICAgICAgICBpZiAob3B0LnJlcXVpcmVkKSB7XG4gICAgICAgICAgcmVxdWlyZWRQYXJhbShrZXkpO1xuICAgICAgICB9XG4gICAgICAgIGlmIChvcHQudHlwZSkge1xuICAgICAgICAgIGNvbnN0IHR5cGUgPSBnZXRUeXBlKG9wdC50eXBlKTtcbiAgICAgICAgICBpZiAodHlwZSA9PSAnYXJyYXknICYmICFBcnJheS5pc0FycmF5KHZhbCkpIHtcbiAgICAgICAgICAgIHRocm93IGBWYWxpZGF0aW9uIGZhaWxlZC4gSW52YWxpZCB0eXBlIGZvciAke2tleX0uIEV4cGVjdGVkOiBhcnJheWA7XG4gICAgICAgICAgfSBlbHNlIGlmICh0eXBlb2YgdmFsICE9PSB0eXBlKSB7XG4gICAgICAgICAgICB0aHJvdyBgVmFsaWRhdGlvbiBmYWlsZWQuIEludmFsaWQgdHlwZSBmb3IgJHtrZXl9LiBFeHBlY3RlZDogJHt0eXBlfWA7XG4gICAgICAgICAgfVxuICAgICAgICB9XG4gICAgICAgIGlmIChvcHQub3B0aW9ucykge1xuICAgICAgICAgIHZhbGlkYXRlT3B0aW9ucyhvcHQsIGtleSwgdmFsKTtcbiAgICAgICAgfVxuICAgICAgfVxuICAgIH1cbiAgfVxuICBjb25zdCB1c2VyS2V5cyA9IG9wdGlvbnMucmVxdWlyZVVzZXJLZXlzIHx8IFtdO1xuICBpZiAoQXJyYXkuaXNBcnJheSh1c2VyS2V5cykpIHtcbiAgICBmb3IgKGNvbnN0IGtleSBvZiB1c2VyS2V5cykge1xuICAgICAgaWYgKCFyZXFVc2VyKSB7XG4gICAgICAgIHRocm93ICdQbGVhc2UgbG9naW4gdG8gbWFrZSB0aGlzIHJlcXVlc3QuJztcbiAgICAgIH1cblxuICAgICAgaWYgKHJlcVVzZXIuZ2V0KGtleSkgPT0gbnVsbCkge1xuICAgICAgICB0aHJvdyBgVmFsaWRhdGlvbiBmYWlsZWQuIFBsZWFzZSBzZXQgZGF0YSBmb3IgJHtrZXl9IG9uIHlvdXIgYWNjb3VudC5gO1xuICAgICAgfVxuICAgIH1cbiAgfSBlbHNlIGlmICh0eXBlb2YgdXNlcktleXMgPT09ICdvYmplY3QnKSB7XG4gICAgZm9yIChjb25zdCBrZXkgaW4gb3B0aW9ucy5yZXF1aXJlVXNlcktleXMpIHtcbiAgICAgIGNvbnN0IG9wdCA9IG9wdGlvbnMucmVxdWlyZVVzZXJLZXlzW2tleV07XG4gICAgICBpZiAob3B0Lm9wdGlvbnMpIHtcbiAgICAgICAgdmFsaWRhdGVPcHRpb25zKG9wdCwga2V5LCByZXFVc2VyLmdldChrZXkpKTtcbiAgICAgIH1cbiAgICB9XG4gIH1cbn1cblxuLy8gVG8gYmUgdXNlZCBhcyBwYXJ0IG9mIHRoZSBwcm9taXNlIGNoYWluIHdoZW4gc2F2aW5nL2RlbGV0aW5nIGFuIG9iamVjdFxuLy8gV2lsbCByZXNvbHZlIHN1Y2Nlc3NmdWxseSBpZiBubyB0cmlnZ2VyIGlzIGNvbmZpZ3VyZWRcbi8vIFJlc29sdmVzIHRvIGFuIG9iamVjdCwgZW1wdHkgb3IgY29udGFpbmluZyBhbiBvYmplY3Qga2V5LiBBIGJlZm9yZVNhdmVcbi8vIHRyaWdnZXIgd2lsbCBzZXQgdGhlIG9iamVjdCBrZXkgdG8gdGhlIHJlc3QgZm9ybWF0IG9iamVjdCB0byBzYXZlLlxuLy8gb3JpZ2luYWxQYXJzZU9iamVjdCBpcyBvcHRpb25hbCwgd2Ugb25seSBuZWVkIHRoYXQgZm9yIGJlZm9yZS9hZnRlclNhdmUgZnVuY3Rpb25zXG5leHBvcnQgZnVuY3Rpb24gbWF5YmVSdW5UcmlnZ2VyKFxuICB0cmlnZ2VyVHlwZSxcbiAgYXV0aCxcbiAgcGFyc2VPYmplY3QsXG4gIG9yaWdpbmFsUGFyc2VPYmplY3QsXG4gIGNvbmZpZyxcbiAgY29udGV4dFxuKSB7XG4gIGlmICghcGFyc2VPYmplY3QpIHtcbiAgICByZXR1cm4gUHJvbWlzZS5yZXNvbHZlKHt9KTtcbiAgfVxuICByZXR1cm4gbmV3IFByb21pc2UoZnVuY3Rpb24gKHJlc29sdmUsIHJlamVjdCkge1xuICAgIHZhciB0cmlnZ2VyID0gZ2V0VHJpZ2dlcihwYXJzZU9iamVjdC5jbGFzc05hbWUsIHRyaWdnZXJUeXBlLCBjb25maWcuYXBwbGljYXRpb25JZCk7XG4gICAgaWYgKCF0cmlnZ2VyKSByZXR1cm4gcmVzb2x2ZSgpO1xuICAgIHZhciByZXF1ZXN0ID0gZ2V0UmVxdWVzdE9iamVjdChcbiAgICAgIHRyaWdnZXJUeXBlLFxuICAgICAgYXV0aCxcbiAgICAgIHBhcnNlT2JqZWN0LFxuICAgICAgb3JpZ2luYWxQYXJzZU9iamVjdCxcbiAgICAgIGNvbmZpZyxcbiAgICAgIGNvbnRleHRcbiAgICApO1xuICAgIHZhciB7IHN1Y2Nlc3MsIGVycm9yIH0gPSBnZXRSZXNwb25zZU9iamVjdChcbiAgICAgIHJlcXVlc3QsXG4gICAgICBvYmplY3QgPT4ge1xuICAgICAgICBsb2dUcmlnZ2VyU3VjY2Vzc0JlZm9yZUhvb2soXG4gICAgICAgICAgdHJpZ2dlclR5cGUsXG4gICAgICAgICAgcGFyc2VPYmplY3QuY2xhc3NOYW1lLFxuICAgICAgICAgIHBhcnNlT2JqZWN0LnRvSlNPTigpLFxuICAgICAgICAgIG9iamVjdCxcbiAgICAgICAgICBhdXRoXG4gICAgICAgICk7XG4gICAgICAgIGlmIChcbiAgICAgICAgICB0cmlnZ2VyVHlwZSA9PT0gVHlwZXMuYmVmb3JlU2F2ZSB8fFxuICAgICAgICAgIHRyaWdnZXJUeXBlID09PSBUeXBlcy5hZnRlclNhdmUgfHxcbiAgICAgICAgICB0cmlnZ2VyVHlwZSA9PT0gVHlwZXMuYmVmb3JlRGVsZXRlIHx8XG4gICAgICAgICAgdHJpZ2dlclR5cGUgPT09IFR5cGVzLmFmdGVyRGVsZXRlXG4gICAgICAgICkge1xuICAgICAgICAgIE9iamVjdC5hc3NpZ24oY29udGV4dCwgcmVxdWVzdC5jb250ZXh0KTtcbiAgICAgICAgfVxuICAgICAgICByZXNvbHZlKG9iamVjdCk7XG4gICAgICB9LFxuICAgICAgZXJyb3IgPT4ge1xuICAgICAgICBsb2dUcmlnZ2VyRXJyb3JCZWZvcmVIb29rKFxuICAgICAgICAgIHRyaWdnZXJUeXBlLFxuICAgICAgICAgIHBhcnNlT2JqZWN0LmNsYXNzTmFtZSxcbiAgICAgICAgICBwYXJzZU9iamVjdC50b0pTT04oKSxcbiAgICAgICAgICBhdXRoLFxuICAgICAgICAgIGVycm9yXG4gICAgICAgICk7XG4gICAgICAgIHJlamVjdChlcnJvcik7XG4gICAgICB9XG4gICAgKTtcblxuICAgIC8vIEFmdGVyU2F2ZSBhbmQgYWZ0ZXJEZWxldGUgdHJpZ2dlcnMgY2FuIHJldHVybiBhIHByb21pc2UsIHdoaWNoIGlmIHRoZXlcbiAgICAvLyBkbywgbmVlZHMgdG8gYmUgcmVzb2x2ZWQgYmVmb3JlIHRoaXMgcHJvbWlzZSBpcyByZXNvbHZlZCxcbiAgICAvLyBzbyB0cmlnZ2VyIGV4ZWN1dGlvbiBpcyBzeW5jZWQgd2l0aCBSZXN0V3JpdGUuZXhlY3V0ZSgpIGNhbGwuXG4gICAgLy8gSWYgdHJpZ2dlcnMgZG8gbm90IHJldHVybiBhIHByb21pc2UsIHRoZXkgY2FuIHJ1biBhc3luYyBjb2RlIHBhcmFsbGVsXG4gICAgLy8gdG8gdGhlIFJlc3RXcml0ZS5leGVjdXRlKCkgY2FsbC5cbiAgICByZXR1cm4gUHJvbWlzZS5yZXNvbHZlKClcbiAgICAgIC50aGVuKCgpID0+IHtcbiAgICAgICAgcmV0dXJuIG1heWJlUnVuVmFsaWRhdG9yKHJlcXVlc3QsIGAke3RyaWdnZXJUeXBlfS4ke3BhcnNlT2JqZWN0LmNsYXNzTmFtZX1gKTtcbiAgICAgIH0pXG4gICAgICAudGhlbigoKSA9PiB7XG4gICAgICAgIGlmIChyZXF1ZXN0LnNraXBXaXRoTWFzdGVyS2V5KSB7XG4gICAgICAgICAgcmV0dXJuIFByb21pc2UucmVzb2x2ZSgpO1xuICAgICAgICB9XG4gICAgICAgIGNvbnN0IHByb21pc2UgPSB0cmlnZ2VyKHJlcXVlc3QpO1xuICAgICAgICBpZiAoXG4gICAgICAgICAgdHJpZ2dlclR5cGUgPT09IFR5cGVzLmFmdGVyU2F2ZSB8fFxuICAgICAgICAgIHRyaWdnZXJUeXBlID09PSBUeXBlcy5hZnRlckRlbGV0ZSB8fFxuICAgICAgICAgIHRyaWdnZXJUeXBlID09PSBUeXBlcy5hZnRlckxvZ2luXG4gICAgICAgICkge1xuICAgICAgICAgIGxvZ1RyaWdnZXJBZnRlckhvb2sodHJpZ2dlclR5cGUsIHBhcnNlT2JqZWN0LmNsYXNzTmFtZSwgcGFyc2VPYmplY3QudG9KU09OKCksIGF1dGgpO1xuICAgICAgICB9XG4gICAgICAgIC8vIGJlZm9yZVNhdmUgaXMgZXhwZWN0ZWQgdG8gcmV0dXJuIG51bGwgKG5vdGhpbmcpXG4gICAgICAgIGlmICh0cmlnZ2VyVHlwZSA9PT0gVHlwZXMuYmVmb3JlU2F2ZSkge1xuICAgICAgICAgIGlmIChwcm9taXNlICYmIHR5cGVvZiBwcm9taXNlLnRoZW4gPT09ICdmdW5jdGlvbicpIHtcbiAgICAgICAgICAgIHJldHVybiBwcm9taXNlLnRoZW4ocmVzcG9uc2UgPT4ge1xuICAgICAgICAgICAgICAvLyByZXNwb25zZS5vYmplY3QgbWF5IGNvbWUgZnJvbSBleHByZXNzIHJvdXRpbmcgYmVmb3JlIGhvb2tcbiAgICAgICAgICAgICAgaWYgKHJlc3BvbnNlICYmIHJlc3BvbnNlLm9iamVjdCkge1xuICAgICAgICAgICAgICAgIHJldHVybiByZXNwb25zZTtcbiAgICAgICAgICAgICAgfVxuICAgICAgICAgICAgICByZXR1cm4gbnVsbDtcbiAgICAgICAgICAgIH0pO1xuICAgICAgICAgIH1cbiAgICAgICAgICByZXR1cm4gbnVsbDtcbiAgICAgICAgfVxuXG4gICAgICAgIHJldHVybiBwcm9taXNlO1xuICAgICAgfSlcbiAgICAgIC50aGVuKHN1Y2Nlc3MsIGVycm9yKTtcbiAgfSk7XG59XG5cbi8vIENvbnZlcnRzIGEgUkVTVC1mb3JtYXQgb2JqZWN0IHRvIGEgUGFyc2UuT2JqZWN0XG4vLyBkYXRhIGlzIGVpdGhlciBjbGFzc05hbWUgb3IgYW4gb2JqZWN0XG5leHBvcnQgZnVuY3Rpb24gaW5mbGF0ZShkYXRhLCByZXN0T2JqZWN0KSB7XG4gIHZhciBjb3B5ID0gdHlwZW9mIGRhdGEgPT0gJ29iamVjdCcgPyBkYXRhIDogeyBjbGFzc05hbWU6IGRhdGEgfTtcbiAgZm9yICh2YXIga2V5IGluIHJlc3RPYmplY3QpIHtcbiAgICBjb3B5W2tleV0gPSByZXN0T2JqZWN0W2tleV07XG4gIH1cbiAgcmV0dXJuIFBhcnNlLk9iamVjdC5mcm9tSlNPTihjb3B5KTtcbn1cblxuZXhwb3J0IGZ1bmN0aW9uIHJ1bkxpdmVRdWVyeUV2ZW50SGFuZGxlcnMoZGF0YSwgYXBwbGljYXRpb25JZCA9IFBhcnNlLmFwcGxpY2F0aW9uSWQpIHtcbiAgaWYgKCFfdHJpZ2dlclN0b3JlIHx8ICFfdHJpZ2dlclN0b3JlW2FwcGxpY2F0aW9uSWRdIHx8ICFfdHJpZ2dlclN0b3JlW2FwcGxpY2F0aW9uSWRdLkxpdmVRdWVyeSkge1xuICAgIHJldHVybjtcbiAgfVxuICBfdHJpZ2dlclN0b3JlW2FwcGxpY2F0aW9uSWRdLkxpdmVRdWVyeS5mb3JFYWNoKGhhbmRsZXIgPT4gaGFuZGxlcihkYXRhKSk7XG59XG5cbmV4cG9ydCBmdW5jdGlvbiBnZXRSZXF1ZXN0RmlsZU9iamVjdCh0cmlnZ2VyVHlwZSwgYXV0aCwgZmlsZU9iamVjdCwgY29uZmlnKSB7XG4gIGNvbnN0IHJlcXVlc3QgPSB7XG4gICAgLi4uZmlsZU9iamVjdCxcbiAgICB0cmlnZ2VyTmFtZTogdHJpZ2dlclR5cGUsXG4gICAgbWFzdGVyOiBmYWxzZSxcbiAgICBsb2c6IGNvbmZpZy5sb2dnZXJDb250cm9sbGVyLFxuICAgIGhlYWRlcnM6IGNvbmZpZy5oZWFkZXJzLFxuICAgIGlwOiBjb25maWcuaXAsXG4gIH07XG5cbiAgaWYgKCFhdXRoKSB7XG4gICAgcmV0dXJuIHJlcXVlc3Q7XG4gIH1cbiAgaWYgKGF1dGguaXNNYXN0ZXIpIHtcbiAgICByZXF1ZXN0WydtYXN0ZXInXSA9IHRydWU7XG4gIH1cbiAgaWYgKGF1dGgudXNlcikge1xuICAgIHJlcXVlc3RbJ3VzZXInXSA9IGF1dGgudXNlcjtcbiAgfVxuICBpZiAoYXV0aC5pbnN0YWxsYXRpb25JZCkge1xuICAgIHJlcXVlc3RbJ2luc3RhbGxhdGlvbklkJ10gPSBhdXRoLmluc3RhbGxhdGlvbklkO1xuICB9XG4gIHJldHVybiByZXF1ZXN0O1xufVxuXG5leHBvcnQgYXN5bmMgZnVuY3Rpb24gbWF5YmVSdW5GaWxlVHJpZ2dlcih0cmlnZ2VyVHlwZSwgZmlsZU9iamVjdCwgY29uZmlnLCBhdXRoKSB7XG4gIGNvbnN0IGZpbGVUcmlnZ2VyID0gZ2V0RmlsZVRyaWdnZXIodHJpZ2dlclR5cGUsIGNvbmZpZy5hcHBsaWNhdGlvbklkKTtcbiAgaWYgKHR5cGVvZiBmaWxlVHJpZ2dlciA9PT0gJ2Z1bmN0aW9uJykge1xuICAgIHRyeSB7XG4gICAgICBjb25zdCByZXF1ZXN0ID0gZ2V0UmVxdWVzdEZpbGVPYmplY3QodHJpZ2dlclR5cGUsIGF1dGgsIGZpbGVPYmplY3QsIGNvbmZpZyk7XG4gICAgICBhd2FpdCBtYXliZVJ1blZhbGlkYXRvcihyZXF1ZXN0LCBgJHt0cmlnZ2VyVHlwZX0uJHtGaWxlQ2xhc3NOYW1lfWApO1xuICAgICAgaWYgKHJlcXVlc3Quc2tpcFdpdGhNYXN0ZXJLZXkpIHtcbiAgICAgICAgcmV0dXJuIGZpbGVPYmplY3Q7XG4gICAgICB9XG4gICAgICBjb25zdCByZXN1bHQgPSBhd2FpdCBmaWxlVHJpZ2dlcihyZXF1ZXN0KTtcbiAgICAgIGxvZ1RyaWdnZXJTdWNjZXNzQmVmb3JlSG9vayhcbiAgICAgICAgdHJpZ2dlclR5cGUsXG4gICAgICAgICdQYXJzZS5GaWxlJyxcbiAgICAgICAgeyAuLi5maWxlT2JqZWN0LmZpbGUudG9KU09OKCksIGZpbGVTaXplOiBmaWxlT2JqZWN0LmZpbGVTaXplIH0sXG4gICAgICAgIHJlc3VsdCxcbiAgICAgICAgYXV0aFxuICAgICAgKTtcbiAgICAgIHJldHVybiByZXN1bHQgfHwgZmlsZU9iamVjdDtcbiAgICB9IGNhdGNoIChlcnJvcikge1xuICAgICAgbG9nVHJpZ2dlckVycm9yQmVmb3JlSG9vayhcbiAgICAgICAgdHJpZ2dlclR5cGUsXG4gICAgICAgICdQYXJzZS5GaWxlJyxcbiAgICAgICAgeyAuLi5maWxlT2JqZWN0LmZpbGUudG9KU09OKCksIGZpbGVTaXplOiBmaWxlT2JqZWN0LmZpbGVTaXplIH0sXG4gICAgICAgIGF1dGgsXG4gICAgICAgIGVycm9yXG4gICAgICApO1xuICAgICAgdGhyb3cgZXJyb3I7XG4gICAgfVxuICB9XG4gIHJldHVybiBmaWxlT2JqZWN0O1xufVxuXG5leHBvcnQgYXN5bmMgZnVuY3Rpb24gbWF5YmVSdW5Db25uZWN0VHJpZ2dlcih0cmlnZ2VyVHlwZSwgcmVxdWVzdCkge1xuICBjb25zdCB0cmlnZ2VyID0gZ2V0VHJpZ2dlcihDb25uZWN0Q2xhc3NOYW1lLCB0cmlnZ2VyVHlwZSwgUGFyc2UuYXBwbGljYXRpb25JZCk7XG4gIGlmICghdHJpZ2dlcikge1xuICAgIHJldHVybjtcbiAgfVxuICByZXF1ZXN0LnVzZXIgPSBhd2FpdCB1c2VyRm9yU2Vzc2lvblRva2VuKHJlcXVlc3Quc2Vzc2lvblRva2VuKTtcbiAgYXdhaXQgbWF5YmVSdW5WYWxpZGF0b3IocmVxdWVzdCwgYCR7dHJpZ2dlclR5cGV9LiR7Q29ubmVjdENsYXNzTmFtZX1gKTtcbiAgaWYgKHJlcXVlc3Quc2tpcFdpdGhNYXN0ZXJLZXkpIHtcbiAgICByZXR1cm47XG4gIH1cbiAgcmV0dXJuIHRyaWdnZXIocmVxdWVzdCk7XG59XG5cbmV4cG9ydCBhc3luYyBmdW5jdGlvbiBtYXliZVJ1blN1YnNjcmliZVRyaWdnZXIodHJpZ2dlclR5cGUsIGNsYXNzTmFtZSwgcmVxdWVzdCkge1xuICBjb25zdCB0cmlnZ2VyID0gZ2V0VHJpZ2dlcihjbGFzc05hbWUsIHRyaWdnZXJUeXBlLCBQYXJzZS5hcHBsaWNhdGlvbklkKTtcbiAgaWYgKCF0cmlnZ2VyKSB7XG4gICAgcmV0dXJuO1xuICB9XG4gIGNvbnN0IHBhcnNlUXVlcnkgPSBuZXcgUGFyc2UuUXVlcnkoY2xhc3NOYW1lKTtcbiAgcGFyc2VRdWVyeS53aXRoSlNPTihyZXF1ZXN0LnF1ZXJ5KTtcbiAgcmVxdWVzdC5xdWVyeSA9IHBhcnNlUXVlcnk7XG4gIHJlcXVlc3QudXNlciA9IGF3YWl0IHVzZXJGb3JTZXNzaW9uVG9rZW4ocmVxdWVzdC5zZXNzaW9uVG9rZW4pO1xuICBhd2FpdCBtYXliZVJ1blZhbGlkYXRvcihyZXF1ZXN0LCBgJHt0cmlnZ2VyVHlwZX0uJHtjbGFzc05hbWV9YCk7XG4gIGlmIChyZXF1ZXN0LnNraXBXaXRoTWFzdGVyS2V5KSB7XG4gICAgcmV0dXJuO1xuICB9XG4gIGF3YWl0IHRyaWdnZXIocmVxdWVzdCk7XG4gIGNvbnN0IHF1ZXJ5ID0gcmVxdWVzdC5xdWVyeS50b0pTT04oKTtcbiAgaWYgKHF1ZXJ5LmtleXMpIHtcbiAgICBxdWVyeS5maWVsZHMgPSBxdWVyeS5rZXlzLnNwbGl0KCcsJyk7XG4gIH1cbiAgcmVxdWVzdC5xdWVyeSA9IHF1ZXJ5O1xufVxuXG5leHBvcnQgYXN5bmMgZnVuY3Rpb24gbWF5YmVSdW5BZnRlckV2ZW50VHJpZ2dlcih0cmlnZ2VyVHlwZSwgY2xhc3NOYW1lLCByZXF1ZXN0KSB7XG4gIGNvbnN0IHRyaWdnZXIgPSBnZXRUcmlnZ2VyKGNsYXNzTmFtZSwgdHJpZ2dlclR5cGUsIFBhcnNlLmFwcGxpY2F0aW9uSWQpO1xuICBpZiAoIXRyaWdnZXIpIHtcbiAgICByZXR1cm47XG4gIH1cbiAgaWYgKHJlcXVlc3Qub2JqZWN0KSB7XG4gICAgcmVxdWVzdC5vYmplY3QgPSBQYXJzZS5PYmplY3QuZnJvbUpTT04ocmVxdWVzdC5vYmplY3QpO1xuICB9XG4gIGlmIChyZXF1ZXN0Lm9yaWdpbmFsKSB7XG4gICAgcmVxdWVzdC5vcmlnaW5hbCA9IFBhcnNlLk9iamVjdC5mcm9tSlNPTihyZXF1ZXN0Lm9yaWdpbmFsKTtcbiAgfVxuICByZXF1ZXN0LnVzZXIgPSBhd2FpdCB1c2VyRm9yU2Vzc2lvblRva2VuKHJlcXVlc3Quc2Vzc2lvblRva2VuKTtcbiAgYXdhaXQgbWF5YmVSdW5WYWxpZGF0b3IocmVxdWVzdCwgYCR7dHJpZ2dlclR5cGV9LiR7Y2xhc3NOYW1lfWApO1xuICBpZiAocmVxdWVzdC5za2lwV2l0aE1hc3RlcktleSkge1xuICAgIHJldHVybjtcbiAgfVxuICByZXR1cm4gdHJpZ2dlcihyZXF1ZXN0KTtcbn1cblxuYXN5bmMgZnVuY3Rpb24gdXNlckZvclNlc3Npb25Ub2tlbihzZXNzaW9uVG9rZW4pIHtcbiAgaWYgKCFzZXNzaW9uVG9rZW4pIHtcbiAgICByZXR1cm47XG4gIH1cbiAgY29uc3QgcSA9IG5ldyBQYXJzZS5RdWVyeSgnX1Nlc3Npb24nKTtcbiAgcS5lcXVhbFRvKCdzZXNzaW9uVG9rZW4nLCBzZXNzaW9uVG9rZW4pO1xuICBxLmluY2x1ZGUoJ3VzZXInKTtcbiAgY29uc3Qgc2Vzc2lvbiA9IGF3YWl0IHEuZmlyc3QoeyB1c2VNYXN0ZXJLZXk6IHRydWUgfSk7XG4gIGlmICghc2Vzc2lvbikge1xuICAgIHJldHVybjtcbiAgfVxuICByZXR1cm4gc2Vzc2lvbi5nZXQoJ3VzZXInKTtcbn1cbiJdfQ==