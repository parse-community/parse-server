"use strict";

Object.defineProperty(exports, "__esModule", {
  value: true
});
exports.Types = void 0;
exports._unregisterAll = _unregisterAll;
exports.addConnectTrigger = addConnectTrigger;
exports.addFunction = addFunction;
exports.addJob = addJob;
exports.addLiveQueryEventHandler = addLiveQueryEventHandler;
exports.addTrigger = addTrigger;
exports.getClassName = getClassName;
exports.getFunction = getFunction;
exports.getFunctionNames = getFunctionNames;
exports.getJob = getJob;
exports.getJobs = getJobs;
exports.getRequestFileObject = getRequestFileObject;
exports.getRequestObject = getRequestObject;
exports.getRequestQueryObject = getRequestQueryObject;
exports.getResponseObject = getResponseObject;
exports.getTrigger = getTrigger;
exports.getValidator = getValidator;
exports.inflate = inflate;
exports.maybeRunAfterFindTrigger = maybeRunAfterFindTrigger;
exports.maybeRunFileTrigger = maybeRunFileTrigger;
exports.maybeRunQueryTrigger = maybeRunQueryTrigger;
exports.maybeRunTrigger = maybeRunTrigger;
exports.maybeRunValidator = maybeRunValidator;
exports.removeFunction = removeFunction;
exports.removeTrigger = removeTrigger;
exports.resolveError = resolveError;
exports.runLiveQueryEventHandlers = runLiveQueryEventHandlers;
exports.runTrigger = runTrigger;
exports.toJSONwithObjects = toJSONwithObjects;
exports.triggerExists = triggerExists;
var _node = _interopRequireDefault(require("parse/node"));
var _logger = require("./logger");
function _interopRequireDefault(obj) { return obj && obj.__esModule ? obj : { default: obj }; }
function ownKeys(object, enumerableOnly) { var keys = Object.keys(object); if (Object.getOwnPropertySymbols) { var symbols = Object.getOwnPropertySymbols(object); enumerableOnly && (symbols = symbols.filter(function (sym) { return Object.getOwnPropertyDescriptor(object, sym).enumerable; })), keys.push.apply(keys, symbols); } return keys; }
function _objectSpread(target) { for (var i = 1; i < arguments.length; i++) { var source = null != arguments[i] ? arguments[i] : {}; i % 2 ? ownKeys(Object(source), !0).forEach(function (key) { _defineProperty(target, key, source[key]); }) : Object.getOwnPropertyDescriptors ? Object.defineProperties(target, Object.getOwnPropertyDescriptors(source)) : ownKeys(Object(source)).forEach(function (key) { Object.defineProperty(target, key, Object.getOwnPropertyDescriptor(source, key)); }); } return target; }
function _defineProperty(obj, key, value) { key = _toPropertyKey(key); if (key in obj) { Object.defineProperty(obj, key, { value: value, enumerable: true, configurable: true, writable: true }); } else { obj[key] = value; } return obj; }
function _toPropertyKey(arg) { var key = _toPrimitive(arg, "string"); return typeof key === "symbol" ? key : String(key); }
function _toPrimitive(input, hint) { if (typeof input !== "object" || input === null) return input; var prim = input[Symbol.toPrimitive]; if (prim !== undefined) { var res = prim.call(input, hint || "default"); if (typeof res !== "object") return res; throw new TypeError("@@toPrimitive must return a primitive value."); } return (hint === "string" ? String : Number)(input); } // triggers.js
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
  beforeConnect: 'beforeConnect',
  beforeSubscribe: 'beforeSubscribe',
  afterEvent: 'afterEvent'
};
exports.Types = Types;
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
function getClassName(parseClass) {
  if (parseClass && parseClass.className) {
    return parseClass.className;
  }
  if (parseClass && parseClass.name) {
    return parseClass.name.replace('Parse', '@');
  }
  return parseClass;
}
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
function toJSONwithObjects(object, className) {
  if (!object || !object.toJSON) {
    return {};
  }
  const toJSON = object.toJSON();
  const stateController = _node.default.CoreManager.getObjectStateController();
  const [pending] = stateController.getPendingOps(object._getStateIdentifier());
  for (const key in pending) {
    const val = object.get(key);
    if (!val || !val._toFullJSON) {
      toJSON[key] = val;
      continue;
    }
    toJSON[key] = val._toFullJSON();
  }
  if (className) {
    toJSON.className = className;
  }
  return toJSON;
}
function getTrigger(className, triggerType, applicationId) {
  if (!applicationId) {
    throw 'Missing ApplicationID';
  }
  return get(Category.Triggers, `${triggerType}.${className}`, applicationId);
}
async function runTrigger(trigger, name, request, auth) {
  if (!trigger) {
    return;
  }
  await maybeRunValidator(request, name, auth);
  if (request.skipWithMasterKey) {
    return;
  }
  return await trigger(request);
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
    ip: config.ip,
    config
  };
  if (originalParseObject) {
    request.original = originalParseObject;
  }
  if (triggerType === Types.beforeSave || triggerType === Types.afterSave || triggerType === Types.beforeDelete || triggerType === Types.afterDelete || triggerType === Types.beforeLogin || triggerType === Types.afterLogin || triggerType === Types.afterFind) {
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
    context: context || {},
    config
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
          return toJSONwithObjects(object);
        });
        return resolve(response);
      }
      // Use the JSON response
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
        response['object']['objectId'] = request.object.id;
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
function logTriggerAfterHook(triggerType, className, input, auth, logLevel) {
  const cleanInput = _logger.logger.truncateLogMessage(JSON.stringify(input));
  _logger.logger[logLevel](`${triggerType} triggered for ${className} for user ${userIdForLog(auth)}:\n  Input: ${cleanInput}`, {
    className,
    triggerType,
    user: userIdForLog(auth)
  });
}
function logTriggerSuccessBeforeHook(triggerType, className, input, result, auth, logLevel) {
  const cleanInput = _logger.logger.truncateLogMessage(JSON.stringify(input));
  const cleanResult = _logger.logger.truncateLogMessage(JSON.stringify(result));
  _logger.logger[logLevel](`${triggerType} triggered for ${className} for user ${userIdForLog(auth)}:\n  Input: ${cleanInput}\n  Result: ${cleanResult}`, {
    className,
    triggerType,
    user: userIdForLog(auth)
  });
}
function logTriggerErrorBeforeHook(triggerType, className, input, auth, error, logLevel) {
  const cleanInput = _logger.logger.truncateLogMessage(JSON.stringify(input));
  _logger.logger[logLevel](`${triggerType} failed for ${className} for user ${userIdForLog(auth)}:\n  Input: ${cleanInput}\n  Error: ${JSON.stringify(error)}`, {
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
    logTriggerSuccessBeforeHook(triggerType, className, 'AfterFind', JSON.stringify(objects), auth, config.logLevels.triggerBeforeSuccess);
    request.objects = objects.map(object => {
      //setting the class name to transform into parse object
      object.className = className;
      return _node.default.Object.fromJSON(object);
    });
    return Promise.resolve().then(() => {
      return maybeRunValidator(request, `${triggerType}.${className}`, auth);
    }).then(() => {
      if (request.skipWithMasterKey) {
        return request.objects;
      }
      const response = trigger(request);
      if (response && typeof response.then === 'function') {
        return response.then(results => {
          return results;
        });
      }
      return response;
    }).then(success, error);
  }).then(results => {
    logTriggerAfterHook(triggerType, className, JSON.stringify(results), auth, config.logLevels.triggerAfter);
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
    return maybeRunValidator(requestObject, `${triggerType}.${className}`, auth);
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
  const code = defaultOpts.code || _node.default.Error.SCRIPT_FAILED;
  // If it's an error, mark it as a script failed
  if (typeof message === 'string') {
    return new _node.default.Error(code, message);
  }
  const error = new _node.default.Error(code, message.message || message);
  if (message instanceof Error) {
    error.stack = message.stack;
  }
  return error;
}
function maybeRunValidator(request, functionName, auth) {
  const theValidator = getValidator(functionName, _node.default.applicationId);
  if (!theValidator) {
    return;
  }
  if (typeof theValidator === 'object' && theValidator.skipWithMasterKey && request.master) {
    request.skipWithMasterKey = true;
  }
  return new Promise((resolve, reject) => {
    return Promise.resolve().then(() => {
      return typeof theValidator === 'object' ? builtInTriggerValidator(theValidator, request, auth) : theValidator(request);
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
async function builtInTriggerValidator(options, request, auth) {
  if (request.master && !options.validateMasterKey) {
    return;
  }
  let reqUser = request.user;
  if (!reqUser && request.object && request.object.className === '_User' && !request.object.existed()) {
    reqUser = request.object;
  }
  if ((options.requireUser || options.requireAnyUserRoles || options.requireAllUserRoles) && !reqUser) {
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
  const validateOptions = async (opt, key, val) => {
    let opts = opt.options;
    if (typeof opts === 'function') {
      try {
        const result = await opts(val);
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
    const optionPromises = [];
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
            request.object.revert(key);
          } else if (opt.default != null) {
            request.object.set(key, opt.default);
          }
        }
        if (opt.required) {
          requiredParam(key);
        }
        const optional = !opt.required && val === undefined;
        if (!optional) {
          if (opt.type) {
            const type = getType(opt.type);
            const valType = Array.isArray(val) ? 'array' : typeof val;
            if (valType !== type) {
              throw `Validation failed. Invalid type for ${key}. Expected: ${type}`;
            }
          }
          if (opt.options) {
            optionPromises.push(validateOptions(opt, key, val));
          }
        }
      }
    }
    await Promise.all(optionPromises);
  }
  let userRoles = options.requireAnyUserRoles;
  let requireAllRoles = options.requireAllUserRoles;
  const promises = [Promise.resolve(), Promise.resolve(), Promise.resolve()];
  if (userRoles || requireAllRoles) {
    promises[0] = auth.getUserRoles();
  }
  if (typeof userRoles === 'function') {
    promises[1] = userRoles();
  }
  if (typeof requireAllRoles === 'function') {
    promises[2] = requireAllRoles();
  }
  const [roles, resolvedUserRoles, resolvedRequireAll] = await Promise.all(promises);
  if (resolvedUserRoles && Array.isArray(resolvedUserRoles)) {
    userRoles = resolvedUserRoles;
  }
  if (resolvedRequireAll && Array.isArray(resolvedRequireAll)) {
    requireAllRoles = resolvedRequireAll;
  }
  if (userRoles) {
    const hasRole = userRoles.some(requiredRole => roles.includes(`role:${requiredRole}`));
    if (!hasRole) {
      throw `Validation failed. User does not match the required roles.`;
    }
  }
  if (requireAllRoles) {
    for (const requiredRole of requireAllRoles) {
      if (!roles.includes(`role:${requiredRole}`)) {
        throw `Validation failed. User does not match all the required roles.`;
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
    const optionPromises = [];
    for (const key in options.requireUserKeys) {
      const opt = options.requireUserKeys[key];
      if (opt.options) {
        optionPromises.push(validateOptions(opt, key, reqUser.get(key)));
      }
    }
    await Promise.all(optionPromises);
  }
}

// To be used as part of the promise chain when saving/deleting an object
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
      logTriggerSuccessBeforeHook(triggerType, parseObject.className, parseObject.toJSON(), object, auth, triggerType.startsWith('after') ? config.logLevels.triggerAfter : config.logLevels.triggerBeforeSuccess);
      if (triggerType === Types.beforeSave || triggerType === Types.afterSave || triggerType === Types.beforeDelete || triggerType === Types.afterDelete) {
        Object.assign(context, request.context);
      }
      resolve(object);
    }, error => {
      logTriggerErrorBeforeHook(triggerType, parseObject.className, parseObject.toJSON(), auth, error, config.logLevels.triggerBeforeError);
      reject(error);
    });

    // AfterSave and afterDelete triggers can return a promise, which if they
    // do, needs to be resolved before this promise is resolved,
    // so trigger execution is synced with RestWrite.execute() call.
    // If triggers do not return a promise, they can run async code parallel
    // to the RestWrite.execute() call.
    return Promise.resolve().then(() => {
      return maybeRunValidator(request, `${triggerType}.${parseObject.className}`, auth);
    }).then(() => {
      if (request.skipWithMasterKey) {
        return Promise.resolve();
      }
      const promise = trigger(request);
      if (triggerType === Types.afterSave || triggerType === Types.afterDelete || triggerType === Types.afterLogin) {
        logTriggerAfterHook(triggerType, parseObject.className, parseObject.toJSON(), auth, config.logLevels.triggerAfter);
      }
      // beforeSave is expected to return null (nothing)
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
}

// Converts a REST-format object to a Parse.Object
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
    ip: config.ip,
    config
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
  const FileClassName = getClassName(_node.default.File);
  const fileTrigger = getTrigger(FileClassName, triggerType, config.applicationId);
  if (typeof fileTrigger === 'function') {
    try {
      const request = getRequestFileObject(triggerType, auth, fileObject, config);
      await maybeRunValidator(request, `${triggerType}.${FileClassName}`, auth);
      if (request.skipWithMasterKey) {
        return fileObject;
      }
      const result = await fileTrigger(request);
      logTriggerSuccessBeforeHook(triggerType, 'Parse.File', _objectSpread(_objectSpread({}, fileObject.file.toJSON()), {}, {
        fileSize: fileObject.fileSize
      }), result, auth, config.logLevels.triggerBeforeSuccess);
      return result || fileObject;
    } catch (error) {
      logTriggerErrorBeforeHook(triggerType, 'Parse.File', _objectSpread(_objectSpread({}, fileObject.file.toJSON()), {}, {
        fileSize: fileObject.fileSize
      }), auth, error, config.logLevels.triggerBeforeError);
      throw error;
    }
  }
  return fileObject;
}
//# sourceMappingURL=data:application/json;charset=utf-8;base64,eyJ2ZXJzaW9uIjozLCJuYW1lcyI6WyJfbm9kZSIsIl9pbnRlcm9wUmVxdWlyZURlZmF1bHQiLCJyZXF1aXJlIiwiX2xvZ2dlciIsIm9iaiIsIl9fZXNNb2R1bGUiLCJkZWZhdWx0Iiwib3duS2V5cyIsIm9iamVjdCIsImVudW1lcmFibGVPbmx5Iiwia2V5cyIsIk9iamVjdCIsImdldE93blByb3BlcnR5U3ltYm9scyIsInN5bWJvbHMiLCJmaWx0ZXIiLCJzeW0iLCJnZXRPd25Qcm9wZXJ0eURlc2NyaXB0b3IiLCJlbnVtZXJhYmxlIiwicHVzaCIsImFwcGx5IiwiX29iamVjdFNwcmVhZCIsInRhcmdldCIsImkiLCJhcmd1bWVudHMiLCJsZW5ndGgiLCJzb3VyY2UiLCJmb3JFYWNoIiwia2V5IiwiX2RlZmluZVByb3BlcnR5IiwiZ2V0T3duUHJvcGVydHlEZXNjcmlwdG9ycyIsImRlZmluZVByb3BlcnRpZXMiLCJkZWZpbmVQcm9wZXJ0eSIsInZhbHVlIiwiX3RvUHJvcGVydHlLZXkiLCJjb25maWd1cmFibGUiLCJ3cml0YWJsZSIsImFyZyIsIl90b1ByaW1pdGl2ZSIsIlN0cmluZyIsImlucHV0IiwiaGludCIsInByaW0iLCJTeW1ib2wiLCJ0b1ByaW1pdGl2ZSIsInVuZGVmaW5lZCIsInJlcyIsImNhbGwiLCJUeXBlRXJyb3IiLCJOdW1iZXIiLCJUeXBlcyIsImJlZm9yZUxvZ2luIiwiYWZ0ZXJMb2dpbiIsImFmdGVyTG9nb3V0IiwiYmVmb3JlU2F2ZSIsImFmdGVyU2F2ZSIsImJlZm9yZURlbGV0ZSIsImFmdGVyRGVsZXRlIiwiYmVmb3JlRmluZCIsImFmdGVyRmluZCIsImJlZm9yZUNvbm5lY3QiLCJiZWZvcmVTdWJzY3JpYmUiLCJhZnRlckV2ZW50IiwiZXhwb3J0cyIsIkNvbm5lY3RDbGFzc05hbWUiLCJiYXNlU3RvcmUiLCJWYWxpZGF0b3JzIiwicmVkdWNlIiwiYmFzZSIsIkZ1bmN0aW9ucyIsIkpvYnMiLCJMaXZlUXVlcnkiLCJUcmlnZ2VycyIsImZyZWV6ZSIsImdldENsYXNzTmFtZSIsInBhcnNlQ2xhc3MiLCJjbGFzc05hbWUiLCJuYW1lIiwicmVwbGFjZSIsInZhbGlkYXRlQ2xhc3NOYW1lRm9yVHJpZ2dlcnMiLCJ0eXBlIiwiX3RyaWdnZXJTdG9yZSIsIkNhdGVnb3J5IiwiZ2V0U3RvcmUiLCJjYXRlZ29yeSIsImFwcGxpY2F0aW9uSWQiLCJwYXRoIiwic3BsaXQiLCJzcGxpY2UiLCJQYXJzZSIsInN0b3JlIiwiY29tcG9uZW50IiwiYWRkIiwiaGFuZGxlciIsImxhc3RDb21wb25lbnQiLCJsb2dnZXIiLCJ3YXJuIiwicmVtb3ZlIiwiZ2V0IiwiYWRkRnVuY3Rpb24iLCJmdW5jdGlvbk5hbWUiLCJ2YWxpZGF0aW9uSGFuZGxlciIsImFkZEpvYiIsImpvYk5hbWUiLCJhZGRUcmlnZ2VyIiwiYWRkQ29ubmVjdFRyaWdnZXIiLCJhZGRMaXZlUXVlcnlFdmVudEhhbmRsZXIiLCJyZW1vdmVGdW5jdGlvbiIsInJlbW92ZVRyaWdnZXIiLCJfdW5yZWdpc3RlckFsbCIsImFwcElkIiwidG9KU09Od2l0aE9iamVjdHMiLCJ0b0pTT04iLCJzdGF0ZUNvbnRyb2xsZXIiLCJDb3JlTWFuYWdlciIsImdldE9iamVjdFN0YXRlQ29udHJvbGxlciIsInBlbmRpbmciLCJnZXRQZW5kaW5nT3BzIiwiX2dldFN0YXRlSWRlbnRpZmllciIsInZhbCIsIl90b0Z1bGxKU09OIiwiZ2V0VHJpZ2dlciIsInRyaWdnZXJUeXBlIiwicnVuVHJpZ2dlciIsInRyaWdnZXIiLCJyZXF1ZXN0IiwiYXV0aCIsIm1heWJlUnVuVmFsaWRhdG9yIiwic2tpcFdpdGhNYXN0ZXJLZXkiLCJ0cmlnZ2VyRXhpc3RzIiwiZ2V0RnVuY3Rpb24iLCJnZXRGdW5jdGlvbk5hbWVzIiwiZnVuY3Rpb25OYW1lcyIsImV4dHJhY3RGdW5jdGlvbk5hbWVzIiwibmFtZXNwYWNlIiwiZ2V0Sm9iIiwiZ2V0Sm9icyIsIm1hbmFnZXIiLCJnZXRWYWxpZGF0b3IiLCJnZXRSZXF1ZXN0T2JqZWN0IiwicGFyc2VPYmplY3QiLCJvcmlnaW5hbFBhcnNlT2JqZWN0IiwiY29uZmlnIiwiY29udGV4dCIsInRyaWdnZXJOYW1lIiwibWFzdGVyIiwibG9nIiwibG9nZ2VyQ29udHJvbGxlciIsImhlYWRlcnMiLCJpcCIsIm9yaWdpbmFsIiwiYXNzaWduIiwiaXNNYXN0ZXIiLCJ1c2VyIiwiaW5zdGFsbGF0aW9uSWQiLCJnZXRSZXF1ZXN0UXVlcnlPYmplY3QiLCJxdWVyeSIsImNvdW50IiwiaXNHZXQiLCJnZXRSZXNwb25zZU9iamVjdCIsInJlc29sdmUiLCJyZWplY3QiLCJzdWNjZXNzIiwicmVzcG9uc2UiLCJvYmplY3RzIiwibWFwIiwiZXF1YWxzIiwiX2dldFNhdmVKU09OIiwiaWQiLCJlcnJvciIsImUiLCJyZXNvbHZlRXJyb3IiLCJjb2RlIiwiRXJyb3IiLCJTQ1JJUFRfRkFJTEVEIiwibWVzc2FnZSIsInVzZXJJZEZvckxvZyIsImxvZ1RyaWdnZXJBZnRlckhvb2siLCJsb2dMZXZlbCIsImNsZWFuSW5wdXQiLCJ0cnVuY2F0ZUxvZ01lc3NhZ2UiLCJKU09OIiwic3RyaW5naWZ5IiwibG9nVHJpZ2dlclN1Y2Nlc3NCZWZvcmVIb29rIiwicmVzdWx0IiwiY2xlYW5SZXN1bHQiLCJsb2dUcmlnZ2VyRXJyb3JCZWZvcmVIb29rIiwibWF5YmVSdW5BZnRlckZpbmRUcmlnZ2VyIiwiUHJvbWlzZSIsImxvZ0xldmVscyIsInRyaWdnZXJCZWZvcmVTdWNjZXNzIiwiZnJvbUpTT04iLCJ0aGVuIiwicmVzdWx0cyIsInRyaWdnZXJBZnRlciIsIm1heWJlUnVuUXVlcnlUcmlnZ2VyIiwicmVzdFdoZXJlIiwicmVzdE9wdGlvbnMiLCJqc29uIiwid2hlcmUiLCJwYXJzZVF1ZXJ5IiwiUXVlcnkiLCJ3aXRoSlNPTiIsInJlcXVlc3RPYmplY3QiLCJxdWVyeVJlc3VsdCIsImpzb25RdWVyeSIsImxpbWl0Iiwic2tpcCIsImluY2x1ZGUiLCJleGNsdWRlS2V5cyIsImV4cGxhaW4iLCJvcmRlciIsInJlYWRQcmVmZXJlbmNlIiwiaW5jbHVkZVJlYWRQcmVmZXJlbmNlIiwic3VicXVlcnlSZWFkUHJlZmVyZW5jZSIsImVyciIsImRlZmF1bHRPcHRzIiwic3RhY2siLCJ0aGVWYWxpZGF0b3IiLCJidWlsdEluVHJpZ2dlclZhbGlkYXRvciIsImNhdGNoIiwiVkFMSURBVElPTl9FUlJPUiIsIm9wdGlvbnMiLCJ2YWxpZGF0ZU1hc3RlcktleSIsInJlcVVzZXIiLCJleGlzdGVkIiwicmVxdWlyZVVzZXIiLCJyZXF1aXJlQW55VXNlclJvbGVzIiwicmVxdWlyZUFsbFVzZXJSb2xlcyIsInJlcXVpcmVNYXN0ZXIiLCJwYXJhbXMiLCJyZXF1aXJlZFBhcmFtIiwidmFsaWRhdGVPcHRpb25zIiwib3B0Iiwib3B0cyIsIkFycmF5IiwiaXNBcnJheSIsImluY2x1ZGVzIiwiam9pbiIsImdldFR5cGUiLCJmbiIsIm1hdGNoIiwidG9TdHJpbmciLCJ0b0xvd2VyQ2FzZSIsImZpZWxkcyIsIm9wdGlvblByb21pc2VzIiwic2V0IiwiY29uc3RhbnQiLCJyZXZlcnQiLCJyZXF1aXJlZCIsIm9wdGlvbmFsIiwidmFsVHlwZSIsImFsbCIsInVzZXJSb2xlcyIsInJlcXVpcmVBbGxSb2xlcyIsInByb21pc2VzIiwiZ2V0VXNlclJvbGVzIiwicm9sZXMiLCJyZXNvbHZlZFVzZXJSb2xlcyIsInJlc29sdmVkUmVxdWlyZUFsbCIsImhhc1JvbGUiLCJzb21lIiwicmVxdWlyZWRSb2xlIiwidXNlcktleXMiLCJyZXF1aXJlVXNlcktleXMiLCJtYXliZVJ1blRyaWdnZXIiLCJzdGFydHNXaXRoIiwidHJpZ2dlckJlZm9yZUVycm9yIiwicHJvbWlzZSIsImluZmxhdGUiLCJkYXRhIiwicmVzdE9iamVjdCIsImNvcHkiLCJydW5MaXZlUXVlcnlFdmVudEhhbmRsZXJzIiwiZ2V0UmVxdWVzdEZpbGVPYmplY3QiLCJmaWxlT2JqZWN0IiwibWF5YmVSdW5GaWxlVHJpZ2dlciIsIkZpbGVDbGFzc05hbWUiLCJGaWxlIiwiZmlsZVRyaWdnZXIiLCJmaWxlIiwiZmlsZVNpemUiXSwic291cmNlcyI6WyIuLi9zcmMvdHJpZ2dlcnMuanMiXSwic291cmNlc0NvbnRlbnQiOlsiLy8gdHJpZ2dlcnMuanNcbmltcG9ydCBQYXJzZSBmcm9tICdwYXJzZS9ub2RlJztcbmltcG9ydCB7IGxvZ2dlciB9IGZyb20gJy4vbG9nZ2VyJztcblxuZXhwb3J0IGNvbnN0IFR5cGVzID0ge1xuICBiZWZvcmVMb2dpbjogJ2JlZm9yZUxvZ2luJyxcbiAgYWZ0ZXJMb2dpbjogJ2FmdGVyTG9naW4nLFxuICBhZnRlckxvZ291dDogJ2FmdGVyTG9nb3V0JyxcbiAgYmVmb3JlU2F2ZTogJ2JlZm9yZVNhdmUnLFxuICBhZnRlclNhdmU6ICdhZnRlclNhdmUnLFxuICBiZWZvcmVEZWxldGU6ICdiZWZvcmVEZWxldGUnLFxuICBhZnRlckRlbGV0ZTogJ2FmdGVyRGVsZXRlJyxcbiAgYmVmb3JlRmluZDogJ2JlZm9yZUZpbmQnLFxuICBhZnRlckZpbmQ6ICdhZnRlckZpbmQnLFxuICBiZWZvcmVDb25uZWN0OiAnYmVmb3JlQ29ubmVjdCcsXG4gIGJlZm9yZVN1YnNjcmliZTogJ2JlZm9yZVN1YnNjcmliZScsXG4gIGFmdGVyRXZlbnQ6ICdhZnRlckV2ZW50Jyxcbn07XG5cbmNvbnN0IENvbm5lY3RDbGFzc05hbWUgPSAnQENvbm5lY3QnO1xuXG5jb25zdCBiYXNlU3RvcmUgPSBmdW5jdGlvbiAoKSB7XG4gIGNvbnN0IFZhbGlkYXRvcnMgPSBPYmplY3Qua2V5cyhUeXBlcykucmVkdWNlKGZ1bmN0aW9uIChiYXNlLCBrZXkpIHtcbiAgICBiYXNlW2tleV0gPSB7fTtcbiAgICByZXR1cm4gYmFzZTtcbiAgfSwge30pO1xuICBjb25zdCBGdW5jdGlvbnMgPSB7fTtcbiAgY29uc3QgSm9icyA9IHt9O1xuICBjb25zdCBMaXZlUXVlcnkgPSBbXTtcbiAgY29uc3QgVHJpZ2dlcnMgPSBPYmplY3Qua2V5cyhUeXBlcykucmVkdWNlKGZ1bmN0aW9uIChiYXNlLCBrZXkpIHtcbiAgICBiYXNlW2tleV0gPSB7fTtcbiAgICByZXR1cm4gYmFzZTtcbiAgfSwge30pO1xuXG4gIHJldHVybiBPYmplY3QuZnJlZXplKHtcbiAgICBGdW5jdGlvbnMsXG4gICAgSm9icyxcbiAgICBWYWxpZGF0b3JzLFxuICAgIFRyaWdnZXJzLFxuICAgIExpdmVRdWVyeSxcbiAgfSk7XG59O1xuXG5leHBvcnQgZnVuY3Rpb24gZ2V0Q2xhc3NOYW1lKHBhcnNlQ2xhc3MpIHtcbiAgaWYgKHBhcnNlQ2xhc3MgJiYgcGFyc2VDbGFzcy5jbGFzc05hbWUpIHtcbiAgICByZXR1cm4gcGFyc2VDbGFzcy5jbGFzc05hbWU7XG4gIH1cbiAgaWYgKHBhcnNlQ2xhc3MgJiYgcGFyc2VDbGFzcy5uYW1lKSB7XG4gICAgcmV0dXJuIHBhcnNlQ2xhc3MubmFtZS5yZXBsYWNlKCdQYXJzZScsICdAJyk7XG4gIH1cbiAgcmV0dXJuIHBhcnNlQ2xhc3M7XG59XG5cbmZ1bmN0aW9uIHZhbGlkYXRlQ2xhc3NOYW1lRm9yVHJpZ2dlcnMoY2xhc3NOYW1lLCB0eXBlKSB7XG4gIGlmICh0eXBlID09IFR5cGVzLmJlZm9yZVNhdmUgJiYgY2xhc3NOYW1lID09PSAnX1B1c2hTdGF0dXMnKSB7XG4gICAgLy8gX1B1c2hTdGF0dXMgdXNlcyB1bmRvY3VtZW50ZWQgbmVzdGVkIGtleSBpbmNyZW1lbnQgb3BzXG4gICAgLy8gYWxsb3dpbmcgYmVmb3JlU2F2ZSB3b3VsZCBtZXNzIHVwIHRoZSBvYmplY3RzIGJpZyB0aW1lXG4gICAgLy8gVE9ETzogQWxsb3cgcHJvcGVyIGRvY3VtZW50ZWQgd2F5IG9mIHVzaW5nIG5lc3RlZCBpbmNyZW1lbnQgb3BzXG4gICAgdGhyb3cgJ09ubHkgYWZ0ZXJTYXZlIGlzIGFsbG93ZWQgb24gX1B1c2hTdGF0dXMnO1xuICB9XG4gIGlmICgodHlwZSA9PT0gVHlwZXMuYmVmb3JlTG9naW4gfHwgdHlwZSA9PT0gVHlwZXMuYWZ0ZXJMb2dpbikgJiYgY2xhc3NOYW1lICE9PSAnX1VzZXInKSB7XG4gICAgLy8gVE9ETzogY2hlY2sgaWYgdXBzdHJlYW0gY29kZSB3aWxsIGhhbmRsZSBgRXJyb3JgIGluc3RhbmNlIHJhdGhlclxuICAgIC8vIHRoYW4gdGhpcyBhbnRpLXBhdHRlcm4gb2YgdGhyb3dpbmcgc3RyaW5nc1xuICAgIHRocm93ICdPbmx5IHRoZSBfVXNlciBjbGFzcyBpcyBhbGxvd2VkIGZvciB0aGUgYmVmb3JlTG9naW4gYW5kIGFmdGVyTG9naW4gdHJpZ2dlcnMnO1xuICB9XG4gIGlmICh0eXBlID09PSBUeXBlcy5hZnRlckxvZ291dCAmJiBjbGFzc05hbWUgIT09ICdfU2Vzc2lvbicpIHtcbiAgICAvLyBUT0RPOiBjaGVjayBpZiB1cHN0cmVhbSBjb2RlIHdpbGwgaGFuZGxlIGBFcnJvcmAgaW5zdGFuY2UgcmF0aGVyXG4gICAgLy8gdGhhbiB0aGlzIGFudGktcGF0dGVybiBvZiB0aHJvd2luZyBzdHJpbmdzXG4gICAgdGhyb3cgJ09ubHkgdGhlIF9TZXNzaW9uIGNsYXNzIGlzIGFsbG93ZWQgZm9yIHRoZSBhZnRlckxvZ291dCB0cmlnZ2VyLic7XG4gIH1cbiAgaWYgKGNsYXNzTmFtZSA9PT0gJ19TZXNzaW9uJyAmJiB0eXBlICE9PSBUeXBlcy5hZnRlckxvZ291dCkge1xuICAgIC8vIFRPRE86IGNoZWNrIGlmIHVwc3RyZWFtIGNvZGUgd2lsbCBoYW5kbGUgYEVycm9yYCBpbnN0YW5jZSByYXRoZXJcbiAgICAvLyB0aGFuIHRoaXMgYW50aS1wYXR0ZXJuIG9mIHRocm93aW5nIHN0cmluZ3NcbiAgICB0aHJvdyAnT25seSB0aGUgYWZ0ZXJMb2dvdXQgdHJpZ2dlciBpcyBhbGxvd2VkIGZvciB0aGUgX1Nlc3Npb24gY2xhc3MuJztcbiAgfVxuICByZXR1cm4gY2xhc3NOYW1lO1xufVxuXG5jb25zdCBfdHJpZ2dlclN0b3JlID0ge307XG5cbmNvbnN0IENhdGVnb3J5ID0ge1xuICBGdW5jdGlvbnM6ICdGdW5jdGlvbnMnLFxuICBWYWxpZGF0b3JzOiAnVmFsaWRhdG9ycycsXG4gIEpvYnM6ICdKb2JzJyxcbiAgVHJpZ2dlcnM6ICdUcmlnZ2VycycsXG59O1xuXG5mdW5jdGlvbiBnZXRTdG9yZShjYXRlZ29yeSwgbmFtZSwgYXBwbGljYXRpb25JZCkge1xuICBjb25zdCBwYXRoID0gbmFtZS5zcGxpdCgnLicpO1xuICBwYXRoLnNwbGljZSgtMSk7IC8vIHJlbW92ZSBsYXN0IGNvbXBvbmVudFxuICBhcHBsaWNhdGlvbklkID0gYXBwbGljYXRpb25JZCB8fCBQYXJzZS5hcHBsaWNhdGlvbklkO1xuICBfdHJpZ2dlclN0b3JlW2FwcGxpY2F0aW9uSWRdID0gX3RyaWdnZXJTdG9yZVthcHBsaWNhdGlvbklkXSB8fCBiYXNlU3RvcmUoKTtcbiAgbGV0IHN0b3JlID0gX3RyaWdnZXJTdG9yZVthcHBsaWNhdGlvbklkXVtjYXRlZ29yeV07XG4gIGZvciAoY29uc3QgY29tcG9uZW50IG9mIHBhdGgpIHtcbiAgICBzdG9yZSA9IHN0b3JlW2NvbXBvbmVudF07XG4gICAgaWYgKCFzdG9yZSkge1xuICAgICAgcmV0dXJuIHVuZGVmaW5lZDtcbiAgICB9XG4gIH1cbiAgcmV0dXJuIHN0b3JlO1xufVxuXG5mdW5jdGlvbiBhZGQoY2F0ZWdvcnksIG5hbWUsIGhhbmRsZXIsIGFwcGxpY2F0aW9uSWQpIHtcbiAgY29uc3QgbGFzdENvbXBvbmVudCA9IG5hbWUuc3BsaXQoJy4nKS5zcGxpY2UoLTEpO1xuICBjb25zdCBzdG9yZSA9IGdldFN0b3JlKGNhdGVnb3J5LCBuYW1lLCBhcHBsaWNhdGlvbklkKTtcbiAgaWYgKHN0b3JlW2xhc3RDb21wb25lbnRdKSB7XG4gICAgbG9nZ2VyLndhcm4oXG4gICAgICBgV2FybmluZzogRHVwbGljYXRlIGNsb3VkIGZ1bmN0aW9ucyBleGlzdCBmb3IgJHtsYXN0Q29tcG9uZW50fS4gT25seSB0aGUgbGFzdCBvbmUgd2lsbCBiZSB1c2VkIGFuZCB0aGUgb3RoZXJzIHdpbGwgYmUgaWdub3JlZC5gXG4gICAgKTtcbiAgfVxuICBzdG9yZVtsYXN0Q29tcG9uZW50XSA9IGhhbmRsZXI7XG59XG5cbmZ1bmN0aW9uIHJlbW92ZShjYXRlZ29yeSwgbmFtZSwgYXBwbGljYXRpb25JZCkge1xuICBjb25zdCBsYXN0Q29tcG9uZW50ID0gbmFtZS5zcGxpdCgnLicpLnNwbGljZSgtMSk7XG4gIGNvbnN0IHN0b3JlID0gZ2V0U3RvcmUoY2F0ZWdvcnksIG5hbWUsIGFwcGxpY2F0aW9uSWQpO1xuICBkZWxldGUgc3RvcmVbbGFzdENvbXBvbmVudF07XG59XG5cbmZ1bmN0aW9uIGdldChjYXRlZ29yeSwgbmFtZSwgYXBwbGljYXRpb25JZCkge1xuICBjb25zdCBsYXN0Q29tcG9uZW50ID0gbmFtZS5zcGxpdCgnLicpLnNwbGljZSgtMSk7XG4gIGNvbnN0IHN0b3JlID0gZ2V0U3RvcmUoY2F0ZWdvcnksIG5hbWUsIGFwcGxpY2F0aW9uSWQpO1xuICByZXR1cm4gc3RvcmVbbGFzdENvbXBvbmVudF07XG59XG5cbmV4cG9ydCBmdW5jdGlvbiBhZGRGdW5jdGlvbihmdW5jdGlvbk5hbWUsIGhhbmRsZXIsIHZhbGlkYXRpb25IYW5kbGVyLCBhcHBsaWNhdGlvbklkKSB7XG4gIGFkZChDYXRlZ29yeS5GdW5jdGlvbnMsIGZ1bmN0aW9uTmFtZSwgaGFuZGxlciwgYXBwbGljYXRpb25JZCk7XG4gIGFkZChDYXRlZ29yeS5WYWxpZGF0b3JzLCBmdW5jdGlvbk5hbWUsIHZhbGlkYXRpb25IYW5kbGVyLCBhcHBsaWNhdGlvbklkKTtcbn1cblxuZXhwb3J0IGZ1bmN0aW9uIGFkZEpvYihqb2JOYW1lLCBoYW5kbGVyLCBhcHBsaWNhdGlvbklkKSB7XG4gIGFkZChDYXRlZ29yeS5Kb2JzLCBqb2JOYW1lLCBoYW5kbGVyLCBhcHBsaWNhdGlvbklkKTtcbn1cblxuZXhwb3J0IGZ1bmN0aW9uIGFkZFRyaWdnZXIodHlwZSwgY2xhc3NOYW1lLCBoYW5kbGVyLCBhcHBsaWNhdGlvbklkLCB2YWxpZGF0aW9uSGFuZGxlcikge1xuICB2YWxpZGF0ZUNsYXNzTmFtZUZvclRyaWdnZXJzKGNsYXNzTmFtZSwgdHlwZSk7XG4gIGFkZChDYXRlZ29yeS5UcmlnZ2VycywgYCR7dHlwZX0uJHtjbGFzc05hbWV9YCwgaGFuZGxlciwgYXBwbGljYXRpb25JZCk7XG4gIGFkZChDYXRlZ29yeS5WYWxpZGF0b3JzLCBgJHt0eXBlfS4ke2NsYXNzTmFtZX1gLCB2YWxpZGF0aW9uSGFuZGxlciwgYXBwbGljYXRpb25JZCk7XG59XG5cbmV4cG9ydCBmdW5jdGlvbiBhZGRDb25uZWN0VHJpZ2dlcih0eXBlLCBoYW5kbGVyLCBhcHBsaWNhdGlvbklkLCB2YWxpZGF0aW9uSGFuZGxlcikge1xuICBhZGQoQ2F0ZWdvcnkuVHJpZ2dlcnMsIGAke3R5cGV9LiR7Q29ubmVjdENsYXNzTmFtZX1gLCBoYW5kbGVyLCBhcHBsaWNhdGlvbklkKTtcbiAgYWRkKENhdGVnb3J5LlZhbGlkYXRvcnMsIGAke3R5cGV9LiR7Q29ubmVjdENsYXNzTmFtZX1gLCB2YWxpZGF0aW9uSGFuZGxlciwgYXBwbGljYXRpb25JZCk7XG59XG5cbmV4cG9ydCBmdW5jdGlvbiBhZGRMaXZlUXVlcnlFdmVudEhhbmRsZXIoaGFuZGxlciwgYXBwbGljYXRpb25JZCkge1xuICBhcHBsaWNhdGlvbklkID0gYXBwbGljYXRpb25JZCB8fCBQYXJzZS5hcHBsaWNhdGlvbklkO1xuICBfdHJpZ2dlclN0b3JlW2FwcGxpY2F0aW9uSWRdID0gX3RyaWdnZXJTdG9yZVthcHBsaWNhdGlvbklkXSB8fCBiYXNlU3RvcmUoKTtcbiAgX3RyaWdnZXJTdG9yZVthcHBsaWNhdGlvbklkXS5MaXZlUXVlcnkucHVzaChoYW5kbGVyKTtcbn1cblxuZXhwb3J0IGZ1bmN0aW9uIHJlbW92ZUZ1bmN0aW9uKGZ1bmN0aW9uTmFtZSwgYXBwbGljYXRpb25JZCkge1xuICByZW1vdmUoQ2F0ZWdvcnkuRnVuY3Rpb25zLCBmdW5jdGlvbk5hbWUsIGFwcGxpY2F0aW9uSWQpO1xufVxuXG5leHBvcnQgZnVuY3Rpb24gcmVtb3ZlVHJpZ2dlcih0eXBlLCBjbGFzc05hbWUsIGFwcGxpY2F0aW9uSWQpIHtcbiAgcmVtb3ZlKENhdGVnb3J5LlRyaWdnZXJzLCBgJHt0eXBlfS4ke2NsYXNzTmFtZX1gLCBhcHBsaWNhdGlvbklkKTtcbn1cblxuZXhwb3J0IGZ1bmN0aW9uIF91bnJlZ2lzdGVyQWxsKCkge1xuICBPYmplY3Qua2V5cyhfdHJpZ2dlclN0b3JlKS5mb3JFYWNoKGFwcElkID0+IGRlbGV0ZSBfdHJpZ2dlclN0b3JlW2FwcElkXSk7XG59XG5cbmV4cG9ydCBmdW5jdGlvbiB0b0pTT053aXRoT2JqZWN0cyhvYmplY3QsIGNsYXNzTmFtZSkge1xuICBpZiAoIW9iamVjdCB8fCAhb2JqZWN0LnRvSlNPTikge1xuICAgIHJldHVybiB7fTtcbiAgfVxuICBjb25zdCB0b0pTT04gPSBvYmplY3QudG9KU09OKCk7XG4gIGNvbnN0IHN0YXRlQ29udHJvbGxlciA9IFBhcnNlLkNvcmVNYW5hZ2VyLmdldE9iamVjdFN0YXRlQ29udHJvbGxlcigpO1xuICBjb25zdCBbcGVuZGluZ10gPSBzdGF0ZUNvbnRyb2xsZXIuZ2V0UGVuZGluZ09wcyhvYmplY3QuX2dldFN0YXRlSWRlbnRpZmllcigpKTtcbiAgZm9yIChjb25zdCBrZXkgaW4gcGVuZGluZykge1xuICAgIGNvbnN0IHZhbCA9IG9iamVjdC5nZXQoa2V5KTtcbiAgICBpZiAoIXZhbCB8fCAhdmFsLl90b0Z1bGxKU09OKSB7XG4gICAgICB0b0pTT05ba2V5XSA9IHZhbDtcbiAgICAgIGNvbnRpbnVlO1xuICAgIH1cbiAgICB0b0pTT05ba2V5XSA9IHZhbC5fdG9GdWxsSlNPTigpO1xuICB9XG4gIGlmIChjbGFzc05hbWUpIHtcbiAgICB0b0pTT04uY2xhc3NOYW1lID0gY2xhc3NOYW1lO1xuICB9XG4gIHJldHVybiB0b0pTT047XG59XG5cbmV4cG9ydCBmdW5jdGlvbiBnZXRUcmlnZ2VyKGNsYXNzTmFtZSwgdHJpZ2dlclR5cGUsIGFwcGxpY2F0aW9uSWQpIHtcbiAgaWYgKCFhcHBsaWNhdGlvbklkKSB7XG4gICAgdGhyb3cgJ01pc3NpbmcgQXBwbGljYXRpb25JRCc7XG4gIH1cbiAgcmV0dXJuIGdldChDYXRlZ29yeS5UcmlnZ2VycywgYCR7dHJpZ2dlclR5cGV9LiR7Y2xhc3NOYW1lfWAsIGFwcGxpY2F0aW9uSWQpO1xufVxuXG5leHBvcnQgYXN5bmMgZnVuY3Rpb24gcnVuVHJpZ2dlcih0cmlnZ2VyLCBuYW1lLCByZXF1ZXN0LCBhdXRoKSB7XG4gIGlmICghdHJpZ2dlcikge1xuICAgIHJldHVybjtcbiAgfVxuICBhd2FpdCBtYXliZVJ1blZhbGlkYXRvcihyZXF1ZXN0LCBuYW1lLCBhdXRoKTtcbiAgaWYgKHJlcXVlc3Quc2tpcFdpdGhNYXN0ZXJLZXkpIHtcbiAgICByZXR1cm47XG4gIH1cbiAgcmV0dXJuIGF3YWl0IHRyaWdnZXIocmVxdWVzdCk7XG59XG5cbmV4cG9ydCBmdW5jdGlvbiB0cmlnZ2VyRXhpc3RzKGNsYXNzTmFtZTogc3RyaW5nLCB0eXBlOiBzdHJpbmcsIGFwcGxpY2F0aW9uSWQ6IHN0cmluZyk6IGJvb2xlYW4ge1xuICByZXR1cm4gZ2V0VHJpZ2dlcihjbGFzc05hbWUsIHR5cGUsIGFwcGxpY2F0aW9uSWQpICE9IHVuZGVmaW5lZDtcbn1cblxuZXhwb3J0IGZ1bmN0aW9uIGdldEZ1bmN0aW9uKGZ1bmN0aW9uTmFtZSwgYXBwbGljYXRpb25JZCkge1xuICByZXR1cm4gZ2V0KENhdGVnb3J5LkZ1bmN0aW9ucywgZnVuY3Rpb25OYW1lLCBhcHBsaWNhdGlvbklkKTtcbn1cblxuZXhwb3J0IGZ1bmN0aW9uIGdldEZ1bmN0aW9uTmFtZXMoYXBwbGljYXRpb25JZCkge1xuICBjb25zdCBzdG9yZSA9XG4gICAgKF90cmlnZ2VyU3RvcmVbYXBwbGljYXRpb25JZF0gJiYgX3RyaWdnZXJTdG9yZVthcHBsaWNhdGlvbklkXVtDYXRlZ29yeS5GdW5jdGlvbnNdKSB8fCB7fTtcbiAgY29uc3QgZnVuY3Rpb25OYW1lcyA9IFtdO1xuICBjb25zdCBleHRyYWN0RnVuY3Rpb25OYW1lcyA9IChuYW1lc3BhY2UsIHN0b3JlKSA9PiB7XG4gICAgT2JqZWN0LmtleXMoc3RvcmUpLmZvckVhY2gobmFtZSA9PiB7XG4gICAgICBjb25zdCB2YWx1ZSA9IHN0b3JlW25hbWVdO1xuICAgICAgaWYgKG5hbWVzcGFjZSkge1xuICAgICAgICBuYW1lID0gYCR7bmFtZXNwYWNlfS4ke25hbWV9YDtcbiAgICAgIH1cbiAgICAgIGlmICh0eXBlb2YgdmFsdWUgPT09ICdmdW5jdGlvbicpIHtcbiAgICAgICAgZnVuY3Rpb25OYW1lcy5wdXNoKG5hbWUpO1xuICAgICAgfSBlbHNlIHtcbiAgICAgICAgZXh0cmFjdEZ1bmN0aW9uTmFtZXMobmFtZSwgdmFsdWUpO1xuICAgICAgfVxuICAgIH0pO1xuICB9O1xuICBleHRyYWN0RnVuY3Rpb25OYW1lcyhudWxsLCBzdG9yZSk7XG4gIHJldHVybiBmdW5jdGlvbk5hbWVzO1xufVxuXG5leHBvcnQgZnVuY3Rpb24gZ2V0Sm9iKGpvYk5hbWUsIGFwcGxpY2F0aW9uSWQpIHtcbiAgcmV0dXJuIGdldChDYXRlZ29yeS5Kb2JzLCBqb2JOYW1lLCBhcHBsaWNhdGlvbklkKTtcbn1cblxuZXhwb3J0IGZ1bmN0aW9uIGdldEpvYnMoYXBwbGljYXRpb25JZCkge1xuICB2YXIgbWFuYWdlciA9IF90cmlnZ2VyU3RvcmVbYXBwbGljYXRpb25JZF07XG4gIGlmIChtYW5hZ2VyICYmIG1hbmFnZXIuSm9icykge1xuICAgIHJldHVybiBtYW5hZ2VyLkpvYnM7XG4gIH1cbiAgcmV0dXJuIHVuZGVmaW5lZDtcbn1cblxuZXhwb3J0IGZ1bmN0aW9uIGdldFZhbGlkYXRvcihmdW5jdGlvbk5hbWUsIGFwcGxpY2F0aW9uSWQpIHtcbiAgcmV0dXJuIGdldChDYXRlZ29yeS5WYWxpZGF0b3JzLCBmdW5jdGlvbk5hbWUsIGFwcGxpY2F0aW9uSWQpO1xufVxuXG5leHBvcnQgZnVuY3Rpb24gZ2V0UmVxdWVzdE9iamVjdChcbiAgdHJpZ2dlclR5cGUsXG4gIGF1dGgsXG4gIHBhcnNlT2JqZWN0LFxuICBvcmlnaW5hbFBhcnNlT2JqZWN0LFxuICBjb25maWcsXG4gIGNvbnRleHRcbikge1xuICBjb25zdCByZXF1ZXN0ID0ge1xuICAgIHRyaWdnZXJOYW1lOiB0cmlnZ2VyVHlwZSxcbiAgICBvYmplY3Q6IHBhcnNlT2JqZWN0LFxuICAgIG1hc3RlcjogZmFsc2UsXG4gICAgbG9nOiBjb25maWcubG9nZ2VyQ29udHJvbGxlcixcbiAgICBoZWFkZXJzOiBjb25maWcuaGVhZGVycyxcbiAgICBpcDogY29uZmlnLmlwLFxuICAgIGNvbmZpZyxcbiAgfTtcblxuICBpZiAob3JpZ2luYWxQYXJzZU9iamVjdCkge1xuICAgIHJlcXVlc3Qub3JpZ2luYWwgPSBvcmlnaW5hbFBhcnNlT2JqZWN0O1xuICB9XG4gIGlmIChcbiAgICB0cmlnZ2VyVHlwZSA9PT0gVHlwZXMuYmVmb3JlU2F2ZSB8fFxuICAgIHRyaWdnZXJUeXBlID09PSBUeXBlcy5hZnRlclNhdmUgfHxcbiAgICB0cmlnZ2VyVHlwZSA9PT0gVHlwZXMuYmVmb3JlRGVsZXRlIHx8XG4gICAgdHJpZ2dlclR5cGUgPT09IFR5cGVzLmFmdGVyRGVsZXRlIHx8XG4gICAgdHJpZ2dlclR5cGUgPT09IFR5cGVzLmJlZm9yZUxvZ2luIHx8XG4gICAgdHJpZ2dlclR5cGUgPT09IFR5cGVzLmFmdGVyTG9naW4gfHxcbiAgICB0cmlnZ2VyVHlwZSA9PT0gVHlwZXMuYWZ0ZXJGaW5kXG4gICkge1xuICAgIC8vIFNldCBhIGNvcHkgb2YgdGhlIGNvbnRleHQgb24gdGhlIHJlcXVlc3Qgb2JqZWN0LlxuICAgIHJlcXVlc3QuY29udGV4dCA9IE9iamVjdC5hc3NpZ24oe30sIGNvbnRleHQpO1xuICB9XG5cbiAgaWYgKCFhdXRoKSB7XG4gICAgcmV0dXJuIHJlcXVlc3Q7XG4gIH1cbiAgaWYgKGF1dGguaXNNYXN0ZXIpIHtcbiAgICByZXF1ZXN0WydtYXN0ZXInXSA9IHRydWU7XG4gIH1cbiAgaWYgKGF1dGgudXNlcikge1xuICAgIHJlcXVlc3RbJ3VzZXInXSA9IGF1dGgudXNlcjtcbiAgfVxuICBpZiAoYXV0aC5pbnN0YWxsYXRpb25JZCkge1xuICAgIHJlcXVlc3RbJ2luc3RhbGxhdGlvbklkJ10gPSBhdXRoLmluc3RhbGxhdGlvbklkO1xuICB9XG4gIHJldHVybiByZXF1ZXN0O1xufVxuXG5leHBvcnQgZnVuY3Rpb24gZ2V0UmVxdWVzdFF1ZXJ5T2JqZWN0KHRyaWdnZXJUeXBlLCBhdXRoLCBxdWVyeSwgY291bnQsIGNvbmZpZywgY29udGV4dCwgaXNHZXQpIHtcbiAgaXNHZXQgPSAhIWlzR2V0O1xuXG4gIHZhciByZXF1ZXN0ID0ge1xuICAgIHRyaWdnZXJOYW1lOiB0cmlnZ2VyVHlwZSxcbiAgICBxdWVyeSxcbiAgICBtYXN0ZXI6IGZhbHNlLFxuICAgIGNvdW50LFxuICAgIGxvZzogY29uZmlnLmxvZ2dlckNvbnRyb2xsZXIsXG4gICAgaXNHZXQsXG4gICAgaGVhZGVyczogY29uZmlnLmhlYWRlcnMsXG4gICAgaXA6IGNvbmZpZy5pcCxcbiAgICBjb250ZXh0OiBjb250ZXh0IHx8IHt9LFxuICAgIGNvbmZpZyxcbiAgfTtcblxuICBpZiAoIWF1dGgpIHtcbiAgICByZXR1cm4gcmVxdWVzdDtcbiAgfVxuICBpZiAoYXV0aC5pc01hc3Rlcikge1xuICAgIHJlcXVlc3RbJ21hc3RlciddID0gdHJ1ZTtcbiAgfVxuICBpZiAoYXV0aC51c2VyKSB7XG4gICAgcmVxdWVzdFsndXNlciddID0gYXV0aC51c2VyO1xuICB9XG4gIGlmIChhdXRoLmluc3RhbGxhdGlvbklkKSB7XG4gICAgcmVxdWVzdFsnaW5zdGFsbGF0aW9uSWQnXSA9IGF1dGguaW5zdGFsbGF0aW9uSWQ7XG4gIH1cbiAgcmV0dXJuIHJlcXVlc3Q7XG59XG5cbi8vIENyZWF0ZXMgdGhlIHJlc3BvbnNlIG9iamVjdCwgYW5kIHVzZXMgdGhlIHJlcXVlc3Qgb2JqZWN0IHRvIHBhc3MgZGF0YVxuLy8gVGhlIEFQSSB3aWxsIGNhbGwgdGhpcyB3aXRoIFJFU1QgQVBJIGZvcm1hdHRlZCBvYmplY3RzLCB0aGlzIHdpbGxcbi8vIHRyYW5zZm9ybSB0aGVtIHRvIFBhcnNlLk9iamVjdCBpbnN0YW5jZXMgZXhwZWN0ZWQgYnkgQ2xvdWQgQ29kZS5cbi8vIEFueSBjaGFuZ2VzIG1hZGUgdG8gdGhlIG9iamVjdCBpbiBhIGJlZm9yZVNhdmUgd2lsbCBiZSBpbmNsdWRlZC5cbmV4cG9ydCBmdW5jdGlvbiBnZXRSZXNwb25zZU9iamVjdChyZXF1ZXN0LCByZXNvbHZlLCByZWplY3QpIHtcbiAgcmV0dXJuIHtcbiAgICBzdWNjZXNzOiBmdW5jdGlvbiAocmVzcG9uc2UpIHtcbiAgICAgIGlmIChyZXF1ZXN0LnRyaWdnZXJOYW1lID09PSBUeXBlcy5hZnRlckZpbmQpIHtcbiAgICAgICAgaWYgKCFyZXNwb25zZSkge1xuICAgICAgICAgIHJlc3BvbnNlID0gcmVxdWVzdC5vYmplY3RzO1xuICAgICAgICB9XG4gICAgICAgIHJlc3BvbnNlID0gcmVzcG9uc2UubWFwKG9iamVjdCA9PiB7XG4gICAgICAgICAgcmV0dXJuIHRvSlNPTndpdGhPYmplY3RzKG9iamVjdCk7XG4gICAgICAgIH0pO1xuICAgICAgICByZXR1cm4gcmVzb2x2ZShyZXNwb25zZSk7XG4gICAgICB9XG4gICAgICAvLyBVc2UgdGhlIEpTT04gcmVzcG9uc2VcbiAgICAgIGlmIChcbiAgICAgICAgcmVzcG9uc2UgJiZcbiAgICAgICAgdHlwZW9mIHJlc3BvbnNlID09PSAnb2JqZWN0JyAmJlxuICAgICAgICAhcmVxdWVzdC5vYmplY3QuZXF1YWxzKHJlc3BvbnNlKSAmJlxuICAgICAgICByZXF1ZXN0LnRyaWdnZXJOYW1lID09PSBUeXBlcy5iZWZvcmVTYXZlXG4gICAgICApIHtcbiAgICAgICAgcmV0dXJuIHJlc29sdmUocmVzcG9uc2UpO1xuICAgICAgfVxuICAgICAgaWYgKHJlc3BvbnNlICYmIHR5cGVvZiByZXNwb25zZSA9PT0gJ29iamVjdCcgJiYgcmVxdWVzdC50cmlnZ2VyTmFtZSA9PT0gVHlwZXMuYWZ0ZXJTYXZlKSB7XG4gICAgICAgIHJldHVybiByZXNvbHZlKHJlc3BvbnNlKTtcbiAgICAgIH1cbiAgICAgIGlmIChyZXF1ZXN0LnRyaWdnZXJOYW1lID09PSBUeXBlcy5hZnRlclNhdmUpIHtcbiAgICAgICAgcmV0dXJuIHJlc29sdmUoKTtcbiAgICAgIH1cbiAgICAgIHJlc3BvbnNlID0ge307XG4gICAgICBpZiAocmVxdWVzdC50cmlnZ2VyTmFtZSA9PT0gVHlwZXMuYmVmb3JlU2F2ZSkge1xuICAgICAgICByZXNwb25zZVsnb2JqZWN0J10gPSByZXF1ZXN0Lm9iamVjdC5fZ2V0U2F2ZUpTT04oKTtcbiAgICAgICAgcmVzcG9uc2VbJ29iamVjdCddWydvYmplY3RJZCddID0gcmVxdWVzdC5vYmplY3QuaWQ7XG4gICAgICB9XG4gICAgICByZXR1cm4gcmVzb2x2ZShyZXNwb25zZSk7XG4gICAgfSxcbiAgICBlcnJvcjogZnVuY3Rpb24gKGVycm9yKSB7XG4gICAgICBjb25zdCBlID0gcmVzb2x2ZUVycm9yKGVycm9yLCB7XG4gICAgICAgIGNvZGU6IFBhcnNlLkVycm9yLlNDUklQVF9GQUlMRUQsXG4gICAgICAgIG1lc3NhZ2U6ICdTY3JpcHQgZmFpbGVkLiBVbmtub3duIGVycm9yLicsXG4gICAgICB9KTtcbiAgICAgIHJlamVjdChlKTtcbiAgICB9LFxuICB9O1xufVxuXG5mdW5jdGlvbiB1c2VySWRGb3JMb2coYXV0aCkge1xuICByZXR1cm4gYXV0aCAmJiBhdXRoLnVzZXIgPyBhdXRoLnVzZXIuaWQgOiB1bmRlZmluZWQ7XG59XG5cbmZ1bmN0aW9uIGxvZ1RyaWdnZXJBZnRlckhvb2sodHJpZ2dlclR5cGUsIGNsYXNzTmFtZSwgaW5wdXQsIGF1dGgsIGxvZ0xldmVsKSB7XG4gIGNvbnN0IGNsZWFuSW5wdXQgPSBsb2dnZXIudHJ1bmNhdGVMb2dNZXNzYWdlKEpTT04uc3RyaW5naWZ5KGlucHV0KSk7XG4gIGxvZ2dlcltsb2dMZXZlbF0oXG4gICAgYCR7dHJpZ2dlclR5cGV9IHRyaWdnZXJlZCBmb3IgJHtjbGFzc05hbWV9IGZvciB1c2VyICR7dXNlcklkRm9yTG9nKFxuICAgICAgYXV0aFxuICAgICl9OlxcbiAgSW5wdXQ6ICR7Y2xlYW5JbnB1dH1gLFxuICAgIHtcbiAgICAgIGNsYXNzTmFtZSxcbiAgICAgIHRyaWdnZXJUeXBlLFxuICAgICAgdXNlcjogdXNlcklkRm9yTG9nKGF1dGgpLFxuICAgIH1cbiAgKTtcbn1cblxuZnVuY3Rpb24gbG9nVHJpZ2dlclN1Y2Nlc3NCZWZvcmVIb29rKHRyaWdnZXJUeXBlLCBjbGFzc05hbWUsIGlucHV0LCByZXN1bHQsIGF1dGgsIGxvZ0xldmVsKSB7XG4gIGNvbnN0IGNsZWFuSW5wdXQgPSBsb2dnZXIudHJ1bmNhdGVMb2dNZXNzYWdlKEpTT04uc3RyaW5naWZ5KGlucHV0KSk7XG4gIGNvbnN0IGNsZWFuUmVzdWx0ID0gbG9nZ2VyLnRydW5jYXRlTG9nTWVzc2FnZShKU09OLnN0cmluZ2lmeShyZXN1bHQpKTtcbiAgbG9nZ2VyW2xvZ0xldmVsXShcbiAgICBgJHt0cmlnZ2VyVHlwZX0gdHJpZ2dlcmVkIGZvciAke2NsYXNzTmFtZX0gZm9yIHVzZXIgJHt1c2VySWRGb3JMb2coXG4gICAgICBhdXRoXG4gICAgKX06XFxuICBJbnB1dDogJHtjbGVhbklucHV0fVxcbiAgUmVzdWx0OiAke2NsZWFuUmVzdWx0fWAsXG4gICAge1xuICAgICAgY2xhc3NOYW1lLFxuICAgICAgdHJpZ2dlclR5cGUsXG4gICAgICB1c2VyOiB1c2VySWRGb3JMb2coYXV0aCksXG4gICAgfVxuICApO1xufVxuXG5mdW5jdGlvbiBsb2dUcmlnZ2VyRXJyb3JCZWZvcmVIb29rKHRyaWdnZXJUeXBlLCBjbGFzc05hbWUsIGlucHV0LCBhdXRoLCBlcnJvciwgbG9nTGV2ZWwpIHtcbiAgY29uc3QgY2xlYW5JbnB1dCA9IGxvZ2dlci50cnVuY2F0ZUxvZ01lc3NhZ2UoSlNPTi5zdHJpbmdpZnkoaW5wdXQpKTtcbiAgbG9nZ2VyW2xvZ0xldmVsXShcbiAgICBgJHt0cmlnZ2VyVHlwZX0gZmFpbGVkIGZvciAke2NsYXNzTmFtZX0gZm9yIHVzZXIgJHt1c2VySWRGb3JMb2coXG4gICAgICBhdXRoXG4gICAgKX06XFxuICBJbnB1dDogJHtjbGVhbklucHV0fVxcbiAgRXJyb3I6ICR7SlNPTi5zdHJpbmdpZnkoZXJyb3IpfWAsXG4gICAge1xuICAgICAgY2xhc3NOYW1lLFxuICAgICAgdHJpZ2dlclR5cGUsXG4gICAgICBlcnJvcixcbiAgICAgIHVzZXI6IHVzZXJJZEZvckxvZyhhdXRoKSxcbiAgICB9XG4gICk7XG59XG5cbmV4cG9ydCBmdW5jdGlvbiBtYXliZVJ1bkFmdGVyRmluZFRyaWdnZXIoXG4gIHRyaWdnZXJUeXBlLFxuICBhdXRoLFxuICBjbGFzc05hbWUsXG4gIG9iamVjdHMsXG4gIGNvbmZpZyxcbiAgcXVlcnksXG4gIGNvbnRleHRcbikge1xuICByZXR1cm4gbmV3IFByb21pc2UoKHJlc29sdmUsIHJlamVjdCkgPT4ge1xuICAgIGNvbnN0IHRyaWdnZXIgPSBnZXRUcmlnZ2VyKGNsYXNzTmFtZSwgdHJpZ2dlclR5cGUsIGNvbmZpZy5hcHBsaWNhdGlvbklkKTtcbiAgICBpZiAoIXRyaWdnZXIpIHtcbiAgICAgIHJldHVybiByZXNvbHZlKCk7XG4gICAgfVxuICAgIGNvbnN0IHJlcXVlc3QgPSBnZXRSZXF1ZXN0T2JqZWN0KHRyaWdnZXJUeXBlLCBhdXRoLCBudWxsLCBudWxsLCBjb25maWcsIGNvbnRleHQpO1xuICAgIGlmIChxdWVyeSkge1xuICAgICAgcmVxdWVzdC5xdWVyeSA9IHF1ZXJ5O1xuICAgIH1cbiAgICBjb25zdCB7IHN1Y2Nlc3MsIGVycm9yIH0gPSBnZXRSZXNwb25zZU9iamVjdChcbiAgICAgIHJlcXVlc3QsXG4gICAgICBvYmplY3QgPT4ge1xuICAgICAgICByZXNvbHZlKG9iamVjdCk7XG4gICAgICB9LFxuICAgICAgZXJyb3IgPT4ge1xuICAgICAgICByZWplY3QoZXJyb3IpO1xuICAgICAgfVxuICAgICk7XG4gICAgbG9nVHJpZ2dlclN1Y2Nlc3NCZWZvcmVIb29rKFxuICAgICAgdHJpZ2dlclR5cGUsXG4gICAgICBjbGFzc05hbWUsXG4gICAgICAnQWZ0ZXJGaW5kJyxcbiAgICAgIEpTT04uc3RyaW5naWZ5KG9iamVjdHMpLFxuICAgICAgYXV0aCxcbiAgICAgIGNvbmZpZy5sb2dMZXZlbHMudHJpZ2dlckJlZm9yZVN1Y2Nlc3NcbiAgICApO1xuICAgIHJlcXVlc3Qub2JqZWN0cyA9IG9iamVjdHMubWFwKG9iamVjdCA9PiB7XG4gICAgICAvL3NldHRpbmcgdGhlIGNsYXNzIG5hbWUgdG8gdHJhbnNmb3JtIGludG8gcGFyc2Ugb2JqZWN0XG4gICAgICBvYmplY3QuY2xhc3NOYW1lID0gY2xhc3NOYW1lO1xuICAgICAgcmV0dXJuIFBhcnNlLk9iamVjdC5mcm9tSlNPTihvYmplY3QpO1xuICAgIH0pO1xuICAgIHJldHVybiBQcm9taXNlLnJlc29sdmUoKVxuICAgICAgLnRoZW4oKCkgPT4ge1xuICAgICAgICByZXR1cm4gbWF5YmVSdW5WYWxpZGF0b3IocmVxdWVzdCwgYCR7dHJpZ2dlclR5cGV9LiR7Y2xhc3NOYW1lfWAsIGF1dGgpO1xuICAgICAgfSlcbiAgICAgIC50aGVuKCgpID0+IHtcbiAgICAgICAgaWYgKHJlcXVlc3Quc2tpcFdpdGhNYXN0ZXJLZXkpIHtcbiAgICAgICAgICByZXR1cm4gcmVxdWVzdC5vYmplY3RzO1xuICAgICAgICB9XG4gICAgICAgIGNvbnN0IHJlc3BvbnNlID0gdHJpZ2dlcihyZXF1ZXN0KTtcbiAgICAgICAgaWYgKHJlc3BvbnNlICYmIHR5cGVvZiByZXNwb25zZS50aGVuID09PSAnZnVuY3Rpb24nKSB7XG4gICAgICAgICAgcmV0dXJuIHJlc3BvbnNlLnRoZW4ocmVzdWx0cyA9PiB7XG4gICAgICAgICAgICByZXR1cm4gcmVzdWx0cztcbiAgICAgICAgICB9KTtcbiAgICAgICAgfVxuICAgICAgICByZXR1cm4gcmVzcG9uc2U7XG4gICAgICB9KVxuICAgICAgLnRoZW4oc3VjY2VzcywgZXJyb3IpO1xuICB9KS50aGVuKHJlc3VsdHMgPT4ge1xuICAgIGxvZ1RyaWdnZXJBZnRlckhvb2soXG4gICAgICB0cmlnZ2VyVHlwZSxcbiAgICAgIGNsYXNzTmFtZSxcbiAgICAgIEpTT04uc3RyaW5naWZ5KHJlc3VsdHMpLFxuICAgICAgYXV0aCxcbiAgICAgIGNvbmZpZy5sb2dMZXZlbHMudHJpZ2dlckFmdGVyXG4gICAgKTtcbiAgICByZXR1cm4gcmVzdWx0cztcbiAgfSk7XG59XG5cbmV4cG9ydCBmdW5jdGlvbiBtYXliZVJ1blF1ZXJ5VHJpZ2dlcihcbiAgdHJpZ2dlclR5cGUsXG4gIGNsYXNzTmFtZSxcbiAgcmVzdFdoZXJlLFxuICByZXN0T3B0aW9ucyxcbiAgY29uZmlnLFxuICBhdXRoLFxuICBjb250ZXh0LFxuICBpc0dldFxuKSB7XG4gIGNvbnN0IHRyaWdnZXIgPSBnZXRUcmlnZ2VyKGNsYXNzTmFtZSwgdHJpZ2dlclR5cGUsIGNvbmZpZy5hcHBsaWNhdGlvbklkKTtcbiAgaWYgKCF0cmlnZ2VyKSB7XG4gICAgcmV0dXJuIFByb21pc2UucmVzb2x2ZSh7XG4gICAgICByZXN0V2hlcmUsXG4gICAgICByZXN0T3B0aW9ucyxcbiAgICB9KTtcbiAgfVxuICBjb25zdCBqc29uID0gT2JqZWN0LmFzc2lnbih7fSwgcmVzdE9wdGlvbnMpO1xuICBqc29uLndoZXJlID0gcmVzdFdoZXJlO1xuXG4gIGNvbnN0IHBhcnNlUXVlcnkgPSBuZXcgUGFyc2UuUXVlcnkoY2xhc3NOYW1lKTtcbiAgcGFyc2VRdWVyeS53aXRoSlNPTihqc29uKTtcblxuICBsZXQgY291bnQgPSBmYWxzZTtcbiAgaWYgKHJlc3RPcHRpb25zKSB7XG4gICAgY291bnQgPSAhIXJlc3RPcHRpb25zLmNvdW50O1xuICB9XG4gIGNvbnN0IHJlcXVlc3RPYmplY3QgPSBnZXRSZXF1ZXN0UXVlcnlPYmplY3QoXG4gICAgdHJpZ2dlclR5cGUsXG4gICAgYXV0aCxcbiAgICBwYXJzZVF1ZXJ5LFxuICAgIGNvdW50LFxuICAgIGNvbmZpZyxcbiAgICBjb250ZXh0LFxuICAgIGlzR2V0XG4gICk7XG4gIHJldHVybiBQcm9taXNlLnJlc29sdmUoKVxuICAgIC50aGVuKCgpID0+IHtcbiAgICAgIHJldHVybiBtYXliZVJ1blZhbGlkYXRvcihyZXF1ZXN0T2JqZWN0LCBgJHt0cmlnZ2VyVHlwZX0uJHtjbGFzc05hbWV9YCwgYXV0aCk7XG4gICAgfSlcbiAgICAudGhlbigoKSA9PiB7XG4gICAgICBpZiAocmVxdWVzdE9iamVjdC5za2lwV2l0aE1hc3RlcktleSkge1xuICAgICAgICByZXR1cm4gcmVxdWVzdE9iamVjdC5xdWVyeTtcbiAgICAgIH1cbiAgICAgIHJldHVybiB0cmlnZ2VyKHJlcXVlc3RPYmplY3QpO1xuICAgIH0pXG4gICAgLnRoZW4oXG4gICAgICByZXN1bHQgPT4ge1xuICAgICAgICBsZXQgcXVlcnlSZXN1bHQgPSBwYXJzZVF1ZXJ5O1xuICAgICAgICBpZiAocmVzdWx0ICYmIHJlc3VsdCBpbnN0YW5jZW9mIFBhcnNlLlF1ZXJ5KSB7XG4gICAgICAgICAgcXVlcnlSZXN1bHQgPSByZXN1bHQ7XG4gICAgICAgIH1cbiAgICAgICAgY29uc3QganNvblF1ZXJ5ID0gcXVlcnlSZXN1bHQudG9KU09OKCk7XG4gICAgICAgIGlmIChqc29uUXVlcnkud2hlcmUpIHtcbiAgICAgICAgICByZXN0V2hlcmUgPSBqc29uUXVlcnkud2hlcmU7XG4gICAgICAgIH1cbiAgICAgICAgaWYgKGpzb25RdWVyeS5saW1pdCkge1xuICAgICAgICAgIHJlc3RPcHRpb25zID0gcmVzdE9wdGlvbnMgfHwge307XG4gICAgICAgICAgcmVzdE9wdGlvbnMubGltaXQgPSBqc29uUXVlcnkubGltaXQ7XG4gICAgICAgIH1cbiAgICAgICAgaWYgKGpzb25RdWVyeS5za2lwKSB7XG4gICAgICAgICAgcmVzdE9wdGlvbnMgPSByZXN0T3B0aW9ucyB8fCB7fTtcbiAgICAgICAgICByZXN0T3B0aW9ucy5za2lwID0ganNvblF1ZXJ5LnNraXA7XG4gICAgICAgIH1cbiAgICAgICAgaWYgKGpzb25RdWVyeS5pbmNsdWRlKSB7XG4gICAgICAgICAgcmVzdE9wdGlvbnMgPSByZXN0T3B0aW9ucyB8fCB7fTtcbiAgICAgICAgICByZXN0T3B0aW9ucy5pbmNsdWRlID0ganNvblF1ZXJ5LmluY2x1ZGU7XG4gICAgICAgIH1cbiAgICAgICAgaWYgKGpzb25RdWVyeS5leGNsdWRlS2V5cykge1xuICAgICAgICAgIHJlc3RPcHRpb25zID0gcmVzdE9wdGlvbnMgfHwge307XG4gICAgICAgICAgcmVzdE9wdGlvbnMuZXhjbHVkZUtleXMgPSBqc29uUXVlcnkuZXhjbHVkZUtleXM7XG4gICAgICAgIH1cbiAgICAgICAgaWYgKGpzb25RdWVyeS5leHBsYWluKSB7XG4gICAgICAgICAgcmVzdE9wdGlvbnMgPSByZXN0T3B0aW9ucyB8fCB7fTtcbiAgICAgICAgICByZXN0T3B0aW9ucy5leHBsYWluID0ganNvblF1ZXJ5LmV4cGxhaW47XG4gICAgICAgIH1cbiAgICAgICAgaWYgKGpzb25RdWVyeS5rZXlzKSB7XG4gICAgICAgICAgcmVzdE9wdGlvbnMgPSByZXN0T3B0aW9ucyB8fCB7fTtcbiAgICAgICAgICByZXN0T3B0aW9ucy5rZXlzID0ganNvblF1ZXJ5LmtleXM7XG4gICAgICAgIH1cbiAgICAgICAgaWYgKGpzb25RdWVyeS5vcmRlcikge1xuICAgICAgICAgIHJlc3RPcHRpb25zID0gcmVzdE9wdGlvbnMgfHwge307XG4gICAgICAgICAgcmVzdE9wdGlvbnMub3JkZXIgPSBqc29uUXVlcnkub3JkZXI7XG4gICAgICAgIH1cbiAgICAgICAgaWYgKGpzb25RdWVyeS5oaW50KSB7XG4gICAgICAgICAgcmVzdE9wdGlvbnMgPSByZXN0T3B0aW9ucyB8fCB7fTtcbiAgICAgICAgICByZXN0T3B0aW9ucy5oaW50ID0ganNvblF1ZXJ5LmhpbnQ7XG4gICAgICAgIH1cbiAgICAgICAgaWYgKHJlcXVlc3RPYmplY3QucmVhZFByZWZlcmVuY2UpIHtcbiAgICAgICAgICByZXN0T3B0aW9ucyA9IHJlc3RPcHRpb25zIHx8IHt9O1xuICAgICAgICAgIHJlc3RPcHRpb25zLnJlYWRQcmVmZXJlbmNlID0gcmVxdWVzdE9iamVjdC5yZWFkUHJlZmVyZW5jZTtcbiAgICAgICAgfVxuICAgICAgICBpZiAocmVxdWVzdE9iamVjdC5pbmNsdWRlUmVhZFByZWZlcmVuY2UpIHtcbiAgICAgICAgICByZXN0T3B0aW9ucyA9IHJlc3RPcHRpb25zIHx8IHt9O1xuICAgICAgICAgIHJlc3RPcHRpb25zLmluY2x1ZGVSZWFkUHJlZmVyZW5jZSA9IHJlcXVlc3RPYmplY3QuaW5jbHVkZVJlYWRQcmVmZXJlbmNlO1xuICAgICAgICB9XG4gICAgICAgIGlmIChyZXF1ZXN0T2JqZWN0LnN1YnF1ZXJ5UmVhZFByZWZlcmVuY2UpIHtcbiAgICAgICAgICByZXN0T3B0aW9ucyA9IHJlc3RPcHRpb25zIHx8IHt9O1xuICAgICAgICAgIHJlc3RPcHRpb25zLnN1YnF1ZXJ5UmVhZFByZWZlcmVuY2UgPSByZXF1ZXN0T2JqZWN0LnN1YnF1ZXJ5UmVhZFByZWZlcmVuY2U7XG4gICAgICAgIH1cbiAgICAgICAgcmV0dXJuIHtcbiAgICAgICAgICByZXN0V2hlcmUsXG4gICAgICAgICAgcmVzdE9wdGlvbnMsXG4gICAgICAgIH07XG4gICAgICB9LFxuICAgICAgZXJyID0+IHtcbiAgICAgICAgY29uc3QgZXJyb3IgPSByZXNvbHZlRXJyb3IoZXJyLCB7XG4gICAgICAgICAgY29kZTogUGFyc2UuRXJyb3IuU0NSSVBUX0ZBSUxFRCxcbiAgICAgICAgICBtZXNzYWdlOiAnU2NyaXB0IGZhaWxlZC4gVW5rbm93biBlcnJvci4nLFxuICAgICAgICB9KTtcbiAgICAgICAgdGhyb3cgZXJyb3I7XG4gICAgICB9XG4gICAgKTtcbn1cblxuZXhwb3J0IGZ1bmN0aW9uIHJlc29sdmVFcnJvcihtZXNzYWdlLCBkZWZhdWx0T3B0cykge1xuICBpZiAoIWRlZmF1bHRPcHRzKSB7XG4gICAgZGVmYXVsdE9wdHMgPSB7fTtcbiAgfVxuICBpZiAoIW1lc3NhZ2UpIHtcbiAgICByZXR1cm4gbmV3IFBhcnNlLkVycm9yKFxuICAgICAgZGVmYXVsdE9wdHMuY29kZSB8fCBQYXJzZS5FcnJvci5TQ1JJUFRfRkFJTEVELFxuICAgICAgZGVmYXVsdE9wdHMubWVzc2FnZSB8fCAnU2NyaXB0IGZhaWxlZC4nXG4gICAgKTtcbiAgfVxuICBpZiAobWVzc2FnZSBpbnN0YW5jZW9mIFBhcnNlLkVycm9yKSB7XG4gICAgcmV0dXJuIG1lc3NhZ2U7XG4gIH1cblxuICBjb25zdCBjb2RlID0gZGVmYXVsdE9wdHMuY29kZSB8fCBQYXJzZS5FcnJvci5TQ1JJUFRfRkFJTEVEO1xuICAvLyBJZiBpdCdzIGFuIGVycm9yLCBtYXJrIGl0IGFzIGEgc2NyaXB0IGZhaWxlZFxuICBpZiAodHlwZW9mIG1lc3NhZ2UgPT09ICdzdHJpbmcnKSB7XG4gICAgcmV0dXJuIG5ldyBQYXJzZS5FcnJvcihjb2RlLCBtZXNzYWdlKTtcbiAgfVxuICBjb25zdCBlcnJvciA9IG5ldyBQYXJzZS5FcnJvcihjb2RlLCBtZXNzYWdlLm1lc3NhZ2UgfHwgbWVzc2FnZSk7XG4gIGlmIChtZXNzYWdlIGluc3RhbmNlb2YgRXJyb3IpIHtcbiAgICBlcnJvci5zdGFjayA9IG1lc3NhZ2Uuc3RhY2s7XG4gIH1cbiAgcmV0dXJuIGVycm9yO1xufVxuZXhwb3J0IGZ1bmN0aW9uIG1heWJlUnVuVmFsaWRhdG9yKHJlcXVlc3QsIGZ1bmN0aW9uTmFtZSwgYXV0aCkge1xuICBjb25zdCB0aGVWYWxpZGF0b3IgPSBnZXRWYWxpZGF0b3IoZnVuY3Rpb25OYW1lLCBQYXJzZS5hcHBsaWNhdGlvbklkKTtcbiAgaWYgKCF0aGVWYWxpZGF0b3IpIHtcbiAgICByZXR1cm47XG4gIH1cbiAgaWYgKHR5cGVvZiB0aGVWYWxpZGF0b3IgPT09ICdvYmplY3QnICYmIHRoZVZhbGlkYXRvci5za2lwV2l0aE1hc3RlcktleSAmJiByZXF1ZXN0Lm1hc3Rlcikge1xuICAgIHJlcXVlc3Quc2tpcFdpdGhNYXN0ZXJLZXkgPSB0cnVlO1xuICB9XG4gIHJldHVybiBuZXcgUHJvbWlzZSgocmVzb2x2ZSwgcmVqZWN0KSA9PiB7XG4gICAgcmV0dXJuIFByb21pc2UucmVzb2x2ZSgpXG4gICAgICAudGhlbigoKSA9PiB7XG4gICAgICAgIHJldHVybiB0eXBlb2YgdGhlVmFsaWRhdG9yID09PSAnb2JqZWN0J1xuICAgICAgICAgID8gYnVpbHRJblRyaWdnZXJWYWxpZGF0b3IodGhlVmFsaWRhdG9yLCByZXF1ZXN0LCBhdXRoKVxuICAgICAgICAgIDogdGhlVmFsaWRhdG9yKHJlcXVlc3QpO1xuICAgICAgfSlcbiAgICAgIC50aGVuKCgpID0+IHtcbiAgICAgICAgcmVzb2x2ZSgpO1xuICAgICAgfSlcbiAgICAgIC5jYXRjaChlID0+IHtcbiAgICAgICAgY29uc3QgZXJyb3IgPSByZXNvbHZlRXJyb3IoZSwge1xuICAgICAgICAgIGNvZGU6IFBhcnNlLkVycm9yLlZBTElEQVRJT05fRVJST1IsXG4gICAgICAgICAgbWVzc2FnZTogJ1ZhbGlkYXRpb24gZmFpbGVkLicsXG4gICAgICAgIH0pO1xuICAgICAgICByZWplY3QoZXJyb3IpO1xuICAgICAgfSk7XG4gIH0pO1xufVxuYXN5bmMgZnVuY3Rpb24gYnVpbHRJblRyaWdnZXJWYWxpZGF0b3Iob3B0aW9ucywgcmVxdWVzdCwgYXV0aCkge1xuICBpZiAocmVxdWVzdC5tYXN0ZXIgJiYgIW9wdGlvbnMudmFsaWRhdGVNYXN0ZXJLZXkpIHtcbiAgICByZXR1cm47XG4gIH1cbiAgbGV0IHJlcVVzZXIgPSByZXF1ZXN0LnVzZXI7XG4gIGlmIChcbiAgICAhcmVxVXNlciAmJlxuICAgIHJlcXVlc3Qub2JqZWN0ICYmXG4gICAgcmVxdWVzdC5vYmplY3QuY2xhc3NOYW1lID09PSAnX1VzZXInICYmXG4gICAgIXJlcXVlc3Qub2JqZWN0LmV4aXN0ZWQoKVxuICApIHtcbiAgICByZXFVc2VyID0gcmVxdWVzdC5vYmplY3Q7XG4gIH1cbiAgaWYgKFxuICAgIChvcHRpb25zLnJlcXVpcmVVc2VyIHx8IG9wdGlvbnMucmVxdWlyZUFueVVzZXJSb2xlcyB8fCBvcHRpb25zLnJlcXVpcmVBbGxVc2VyUm9sZXMpICYmXG4gICAgIXJlcVVzZXJcbiAgKSB7XG4gICAgdGhyb3cgJ1ZhbGlkYXRpb24gZmFpbGVkLiBQbGVhc2UgbG9naW4gdG8gY29udGludWUuJztcbiAgfVxuICBpZiAob3B0aW9ucy5yZXF1aXJlTWFzdGVyICYmICFyZXF1ZXN0Lm1hc3Rlcikge1xuICAgIHRocm93ICdWYWxpZGF0aW9uIGZhaWxlZC4gTWFzdGVyIGtleSBpcyByZXF1aXJlZCB0byBjb21wbGV0ZSB0aGlzIHJlcXVlc3QuJztcbiAgfVxuICBsZXQgcGFyYW1zID0gcmVxdWVzdC5wYXJhbXMgfHwge307XG4gIGlmIChyZXF1ZXN0Lm9iamVjdCkge1xuICAgIHBhcmFtcyA9IHJlcXVlc3Qub2JqZWN0LnRvSlNPTigpO1xuICB9XG4gIGNvbnN0IHJlcXVpcmVkUGFyYW0gPSBrZXkgPT4ge1xuICAgIGNvbnN0IHZhbHVlID0gcGFyYW1zW2tleV07XG4gICAgaWYgKHZhbHVlID09IG51bGwpIHtcbiAgICAgIHRocm93IGBWYWxpZGF0aW9uIGZhaWxlZC4gUGxlYXNlIHNwZWNpZnkgZGF0YSBmb3IgJHtrZXl9LmA7XG4gICAgfVxuICB9O1xuXG4gIGNvbnN0IHZhbGlkYXRlT3B0aW9ucyA9IGFzeW5jIChvcHQsIGtleSwgdmFsKSA9PiB7XG4gICAgbGV0IG9wdHMgPSBvcHQub3B0aW9ucztcbiAgICBpZiAodHlwZW9mIG9wdHMgPT09ICdmdW5jdGlvbicpIHtcbiAgICAgIHRyeSB7XG4gICAgICAgIGNvbnN0IHJlc3VsdCA9IGF3YWl0IG9wdHModmFsKTtcbiAgICAgICAgaWYgKCFyZXN1bHQgJiYgcmVzdWx0ICE9IG51bGwpIHtcbiAgICAgICAgICB0aHJvdyBvcHQuZXJyb3IgfHwgYFZhbGlkYXRpb24gZmFpbGVkLiBJbnZhbGlkIHZhbHVlIGZvciAke2tleX0uYDtcbiAgICAgICAgfVxuICAgICAgfSBjYXRjaCAoZSkge1xuICAgICAgICBpZiAoIWUpIHtcbiAgICAgICAgICB0aHJvdyBvcHQuZXJyb3IgfHwgYFZhbGlkYXRpb24gZmFpbGVkLiBJbnZhbGlkIHZhbHVlIGZvciAke2tleX0uYDtcbiAgICAgICAgfVxuXG4gICAgICAgIHRocm93IG9wdC5lcnJvciB8fCBlLm1lc3NhZ2UgfHwgZTtcbiAgICAgIH1cbiAgICAgIHJldHVybjtcbiAgICB9XG4gICAgaWYgKCFBcnJheS5pc0FycmF5KG9wdHMpKSB7XG4gICAgICBvcHRzID0gW29wdC5vcHRpb25zXTtcbiAgICB9XG5cbiAgICBpZiAoIW9wdHMuaW5jbHVkZXModmFsKSkge1xuICAgICAgdGhyb3cgKFxuICAgICAgICBvcHQuZXJyb3IgfHwgYFZhbGlkYXRpb24gZmFpbGVkLiBJbnZhbGlkIG9wdGlvbiBmb3IgJHtrZXl9LiBFeHBlY3RlZDogJHtvcHRzLmpvaW4oJywgJyl9YFxuICAgICAgKTtcbiAgICB9XG4gIH07XG5cbiAgY29uc3QgZ2V0VHlwZSA9IGZuID0+IHtcbiAgICBjb25zdCBtYXRjaCA9IGZuICYmIGZuLnRvU3RyaW5nKCkubWF0Y2goL15cXHMqZnVuY3Rpb24gKFxcdyspLyk7XG4gICAgcmV0dXJuIChtYXRjaCA/IG1hdGNoWzFdIDogJycpLnRvTG93ZXJDYXNlKCk7XG4gIH07XG4gIGlmIChBcnJheS5pc0FycmF5KG9wdGlvbnMuZmllbGRzKSkge1xuICAgIGZvciAoY29uc3Qga2V5IG9mIG9wdGlvbnMuZmllbGRzKSB7XG4gICAgICByZXF1aXJlZFBhcmFtKGtleSk7XG4gICAgfVxuICB9IGVsc2Uge1xuICAgIGNvbnN0IG9wdGlvblByb21pc2VzID0gW107XG4gICAgZm9yIChjb25zdCBrZXkgaW4gb3B0aW9ucy5maWVsZHMpIHtcbiAgICAgIGNvbnN0IG9wdCA9IG9wdGlvbnMuZmllbGRzW2tleV07XG4gICAgICBsZXQgdmFsID0gcGFyYW1zW2tleV07XG4gICAgICBpZiAodHlwZW9mIG9wdCA9PT0gJ3N0cmluZycpIHtcbiAgICAgICAgcmVxdWlyZWRQYXJhbShvcHQpO1xuICAgICAgfVxuICAgICAgaWYgKHR5cGVvZiBvcHQgPT09ICdvYmplY3QnKSB7XG4gICAgICAgIGlmIChvcHQuZGVmYXVsdCAhPSBudWxsICYmIHZhbCA9PSBudWxsKSB7XG4gICAgICAgICAgdmFsID0gb3B0LmRlZmF1bHQ7XG4gICAgICAgICAgcGFyYW1zW2tleV0gPSB2YWw7XG4gICAgICAgICAgaWYgKHJlcXVlc3Qub2JqZWN0KSB7XG4gICAgICAgICAgICByZXF1ZXN0Lm9iamVjdC5zZXQoa2V5LCB2YWwpO1xuICAgICAgICAgIH1cbiAgICAgICAgfVxuICAgICAgICBpZiAob3B0LmNvbnN0YW50ICYmIHJlcXVlc3Qub2JqZWN0KSB7XG4gICAgICAgICAgaWYgKHJlcXVlc3Qub3JpZ2luYWwpIHtcbiAgICAgICAgICAgIHJlcXVlc3Qub2JqZWN0LnJldmVydChrZXkpO1xuICAgICAgICAgIH0gZWxzZSBpZiAob3B0LmRlZmF1bHQgIT0gbnVsbCkge1xuICAgICAgICAgICAgcmVxdWVzdC5vYmplY3Quc2V0KGtleSwgb3B0LmRlZmF1bHQpO1xuICAgICAgICAgIH1cbiAgICAgICAgfVxuICAgICAgICBpZiAob3B0LnJlcXVpcmVkKSB7XG4gICAgICAgICAgcmVxdWlyZWRQYXJhbShrZXkpO1xuICAgICAgICB9XG4gICAgICAgIGNvbnN0IG9wdGlvbmFsID0gIW9wdC5yZXF1aXJlZCAmJiB2YWwgPT09IHVuZGVmaW5lZDtcbiAgICAgICAgaWYgKCFvcHRpb25hbCkge1xuICAgICAgICAgIGlmIChvcHQudHlwZSkge1xuICAgICAgICAgICAgY29uc3QgdHlwZSA9IGdldFR5cGUob3B0LnR5cGUpO1xuICAgICAgICAgICAgY29uc3QgdmFsVHlwZSA9IEFycmF5LmlzQXJyYXkodmFsKSA/ICdhcnJheScgOiB0eXBlb2YgdmFsO1xuICAgICAgICAgICAgaWYgKHZhbFR5cGUgIT09IHR5cGUpIHtcbiAgICAgICAgICAgICAgdGhyb3cgYFZhbGlkYXRpb24gZmFpbGVkLiBJbnZhbGlkIHR5cGUgZm9yICR7a2V5fS4gRXhwZWN0ZWQ6ICR7dHlwZX1gO1xuICAgICAgICAgICAgfVxuICAgICAgICAgIH1cbiAgICAgICAgICBpZiAob3B0Lm9wdGlvbnMpIHtcbiAgICAgICAgICAgIG9wdGlvblByb21pc2VzLnB1c2godmFsaWRhdGVPcHRpb25zKG9wdCwga2V5LCB2YWwpKTtcbiAgICAgICAgICB9XG4gICAgICAgIH1cbiAgICAgIH1cbiAgICB9XG4gICAgYXdhaXQgUHJvbWlzZS5hbGwob3B0aW9uUHJvbWlzZXMpO1xuICB9XG4gIGxldCB1c2VyUm9sZXMgPSBvcHRpb25zLnJlcXVpcmVBbnlVc2VyUm9sZXM7XG4gIGxldCByZXF1aXJlQWxsUm9sZXMgPSBvcHRpb25zLnJlcXVpcmVBbGxVc2VyUm9sZXM7XG4gIGNvbnN0IHByb21pc2VzID0gW1Byb21pc2UucmVzb2x2ZSgpLCBQcm9taXNlLnJlc29sdmUoKSwgUHJvbWlzZS5yZXNvbHZlKCldO1xuICBpZiAodXNlclJvbGVzIHx8IHJlcXVpcmVBbGxSb2xlcykge1xuICAgIHByb21pc2VzWzBdID0gYXV0aC5nZXRVc2VyUm9sZXMoKTtcbiAgfVxuICBpZiAodHlwZW9mIHVzZXJSb2xlcyA9PT0gJ2Z1bmN0aW9uJykge1xuICAgIHByb21pc2VzWzFdID0gdXNlclJvbGVzKCk7XG4gIH1cbiAgaWYgKHR5cGVvZiByZXF1aXJlQWxsUm9sZXMgPT09ICdmdW5jdGlvbicpIHtcbiAgICBwcm9taXNlc1syXSA9IHJlcXVpcmVBbGxSb2xlcygpO1xuICB9XG4gIGNvbnN0IFtyb2xlcywgcmVzb2x2ZWRVc2VyUm9sZXMsIHJlc29sdmVkUmVxdWlyZUFsbF0gPSBhd2FpdCBQcm9taXNlLmFsbChwcm9taXNlcyk7XG4gIGlmIChyZXNvbHZlZFVzZXJSb2xlcyAmJiBBcnJheS5pc0FycmF5KHJlc29sdmVkVXNlclJvbGVzKSkge1xuICAgIHVzZXJSb2xlcyA9IHJlc29sdmVkVXNlclJvbGVzO1xuICB9XG4gIGlmIChyZXNvbHZlZFJlcXVpcmVBbGwgJiYgQXJyYXkuaXNBcnJheShyZXNvbHZlZFJlcXVpcmVBbGwpKSB7XG4gICAgcmVxdWlyZUFsbFJvbGVzID0gcmVzb2x2ZWRSZXF1aXJlQWxsO1xuICB9XG4gIGlmICh1c2VyUm9sZXMpIHtcbiAgICBjb25zdCBoYXNSb2xlID0gdXNlclJvbGVzLnNvbWUocmVxdWlyZWRSb2xlID0+IHJvbGVzLmluY2x1ZGVzKGByb2xlOiR7cmVxdWlyZWRSb2xlfWApKTtcbiAgICBpZiAoIWhhc1JvbGUpIHtcbiAgICAgIHRocm93IGBWYWxpZGF0aW9uIGZhaWxlZC4gVXNlciBkb2VzIG5vdCBtYXRjaCB0aGUgcmVxdWlyZWQgcm9sZXMuYDtcbiAgICB9XG4gIH1cbiAgaWYgKHJlcXVpcmVBbGxSb2xlcykge1xuICAgIGZvciAoY29uc3QgcmVxdWlyZWRSb2xlIG9mIHJlcXVpcmVBbGxSb2xlcykge1xuICAgICAgaWYgKCFyb2xlcy5pbmNsdWRlcyhgcm9sZToke3JlcXVpcmVkUm9sZX1gKSkge1xuICAgICAgICB0aHJvdyBgVmFsaWRhdGlvbiBmYWlsZWQuIFVzZXIgZG9lcyBub3QgbWF0Y2ggYWxsIHRoZSByZXF1aXJlZCByb2xlcy5gO1xuICAgICAgfVxuICAgIH1cbiAgfVxuICBjb25zdCB1c2VyS2V5cyA9IG9wdGlvbnMucmVxdWlyZVVzZXJLZXlzIHx8IFtdO1xuICBpZiAoQXJyYXkuaXNBcnJheSh1c2VyS2V5cykpIHtcbiAgICBmb3IgKGNvbnN0IGtleSBvZiB1c2VyS2V5cykge1xuICAgICAgaWYgKCFyZXFVc2VyKSB7XG4gICAgICAgIHRocm93ICdQbGVhc2UgbG9naW4gdG8gbWFrZSB0aGlzIHJlcXVlc3QuJztcbiAgICAgIH1cblxuICAgICAgaWYgKHJlcVVzZXIuZ2V0KGtleSkgPT0gbnVsbCkge1xuICAgICAgICB0aHJvdyBgVmFsaWRhdGlvbiBmYWlsZWQuIFBsZWFzZSBzZXQgZGF0YSBmb3IgJHtrZXl9IG9uIHlvdXIgYWNjb3VudC5gO1xuICAgICAgfVxuICAgIH1cbiAgfSBlbHNlIGlmICh0eXBlb2YgdXNlcktleXMgPT09ICdvYmplY3QnKSB7XG4gICAgY29uc3Qgb3B0aW9uUHJvbWlzZXMgPSBbXTtcbiAgICBmb3IgKGNvbnN0IGtleSBpbiBvcHRpb25zLnJlcXVpcmVVc2VyS2V5cykge1xuICAgICAgY29uc3Qgb3B0ID0gb3B0aW9ucy5yZXF1aXJlVXNlcktleXNba2V5XTtcbiAgICAgIGlmIChvcHQub3B0aW9ucykge1xuICAgICAgICBvcHRpb25Qcm9taXNlcy5wdXNoKHZhbGlkYXRlT3B0aW9ucyhvcHQsIGtleSwgcmVxVXNlci5nZXQoa2V5KSkpO1xuICAgICAgfVxuICAgIH1cbiAgICBhd2FpdCBQcm9taXNlLmFsbChvcHRpb25Qcm9taXNlcyk7XG4gIH1cbn1cblxuLy8gVG8gYmUgdXNlZCBhcyBwYXJ0IG9mIHRoZSBwcm9taXNlIGNoYWluIHdoZW4gc2F2aW5nL2RlbGV0aW5nIGFuIG9iamVjdFxuLy8gV2lsbCByZXNvbHZlIHN1Y2Nlc3NmdWxseSBpZiBubyB0cmlnZ2VyIGlzIGNvbmZpZ3VyZWRcbi8vIFJlc29sdmVzIHRvIGFuIG9iamVjdCwgZW1wdHkgb3IgY29udGFpbmluZyBhbiBvYmplY3Qga2V5LiBBIGJlZm9yZVNhdmVcbi8vIHRyaWdnZXIgd2lsbCBzZXQgdGhlIG9iamVjdCBrZXkgdG8gdGhlIHJlc3QgZm9ybWF0IG9iamVjdCB0byBzYXZlLlxuLy8gb3JpZ2luYWxQYXJzZU9iamVjdCBpcyBvcHRpb25hbCwgd2Ugb25seSBuZWVkIHRoYXQgZm9yIGJlZm9yZS9hZnRlclNhdmUgZnVuY3Rpb25zXG5leHBvcnQgZnVuY3Rpb24gbWF5YmVSdW5UcmlnZ2VyKFxuICB0cmlnZ2VyVHlwZSxcbiAgYXV0aCxcbiAgcGFyc2VPYmplY3QsXG4gIG9yaWdpbmFsUGFyc2VPYmplY3QsXG4gIGNvbmZpZyxcbiAgY29udGV4dFxuKSB7XG4gIGlmICghcGFyc2VPYmplY3QpIHtcbiAgICByZXR1cm4gUHJvbWlzZS5yZXNvbHZlKHt9KTtcbiAgfVxuICByZXR1cm4gbmV3IFByb21pc2UoZnVuY3Rpb24gKHJlc29sdmUsIHJlamVjdCkge1xuICAgIHZhciB0cmlnZ2VyID0gZ2V0VHJpZ2dlcihwYXJzZU9iamVjdC5jbGFzc05hbWUsIHRyaWdnZXJUeXBlLCBjb25maWcuYXBwbGljYXRpb25JZCk7XG4gICAgaWYgKCF0cmlnZ2VyKSByZXR1cm4gcmVzb2x2ZSgpO1xuICAgIHZhciByZXF1ZXN0ID0gZ2V0UmVxdWVzdE9iamVjdChcbiAgICAgIHRyaWdnZXJUeXBlLFxuICAgICAgYXV0aCxcbiAgICAgIHBhcnNlT2JqZWN0LFxuICAgICAgb3JpZ2luYWxQYXJzZU9iamVjdCxcbiAgICAgIGNvbmZpZyxcbiAgICAgIGNvbnRleHRcbiAgICApO1xuICAgIHZhciB7IHN1Y2Nlc3MsIGVycm9yIH0gPSBnZXRSZXNwb25zZU9iamVjdChcbiAgICAgIHJlcXVlc3QsXG4gICAgICBvYmplY3QgPT4ge1xuICAgICAgICBsb2dUcmlnZ2VyU3VjY2Vzc0JlZm9yZUhvb2soXG4gICAgICAgICAgdHJpZ2dlclR5cGUsXG4gICAgICAgICAgcGFyc2VPYmplY3QuY2xhc3NOYW1lLFxuICAgICAgICAgIHBhcnNlT2JqZWN0LnRvSlNPTigpLFxuICAgICAgICAgIG9iamVjdCxcbiAgICAgICAgICBhdXRoLFxuICAgICAgICAgIHRyaWdnZXJUeXBlLnN0YXJ0c1dpdGgoJ2FmdGVyJylcbiAgICAgICAgICAgID8gY29uZmlnLmxvZ0xldmVscy50cmlnZ2VyQWZ0ZXJcbiAgICAgICAgICAgIDogY29uZmlnLmxvZ0xldmVscy50cmlnZ2VyQmVmb3JlU3VjY2Vzc1xuICAgICAgICApO1xuICAgICAgICBpZiAoXG4gICAgICAgICAgdHJpZ2dlclR5cGUgPT09IFR5cGVzLmJlZm9yZVNhdmUgfHxcbiAgICAgICAgICB0cmlnZ2VyVHlwZSA9PT0gVHlwZXMuYWZ0ZXJTYXZlIHx8XG4gICAgICAgICAgdHJpZ2dlclR5cGUgPT09IFR5cGVzLmJlZm9yZURlbGV0ZSB8fFxuICAgICAgICAgIHRyaWdnZXJUeXBlID09PSBUeXBlcy5hZnRlckRlbGV0ZVxuICAgICAgICApIHtcbiAgICAgICAgICBPYmplY3QuYXNzaWduKGNvbnRleHQsIHJlcXVlc3QuY29udGV4dCk7XG4gICAgICAgIH1cbiAgICAgICAgcmVzb2x2ZShvYmplY3QpO1xuICAgICAgfSxcbiAgICAgIGVycm9yID0+IHtcbiAgICAgICAgbG9nVHJpZ2dlckVycm9yQmVmb3JlSG9vayhcbiAgICAgICAgICB0cmlnZ2VyVHlwZSxcbiAgICAgICAgICBwYXJzZU9iamVjdC5jbGFzc05hbWUsXG4gICAgICAgICAgcGFyc2VPYmplY3QudG9KU09OKCksXG4gICAgICAgICAgYXV0aCxcbiAgICAgICAgICBlcnJvcixcbiAgICAgICAgICBjb25maWcubG9nTGV2ZWxzLnRyaWdnZXJCZWZvcmVFcnJvclxuICAgICAgICApO1xuICAgICAgICByZWplY3QoZXJyb3IpO1xuICAgICAgfVxuICAgICk7XG5cbiAgICAvLyBBZnRlclNhdmUgYW5kIGFmdGVyRGVsZXRlIHRyaWdnZXJzIGNhbiByZXR1cm4gYSBwcm9taXNlLCB3aGljaCBpZiB0aGV5XG4gICAgLy8gZG8sIG5lZWRzIHRvIGJlIHJlc29sdmVkIGJlZm9yZSB0aGlzIHByb21pc2UgaXMgcmVzb2x2ZWQsXG4gICAgLy8gc28gdHJpZ2dlciBleGVjdXRpb24gaXMgc3luY2VkIHdpdGggUmVzdFdyaXRlLmV4ZWN1dGUoKSBjYWxsLlxuICAgIC8vIElmIHRyaWdnZXJzIGRvIG5vdCByZXR1cm4gYSBwcm9taXNlLCB0aGV5IGNhbiBydW4gYXN5bmMgY29kZSBwYXJhbGxlbFxuICAgIC8vIHRvIHRoZSBSZXN0V3JpdGUuZXhlY3V0ZSgpIGNhbGwuXG4gICAgcmV0dXJuIFByb21pc2UucmVzb2x2ZSgpXG4gICAgICAudGhlbigoKSA9PiB7XG4gICAgICAgIHJldHVybiBtYXliZVJ1blZhbGlkYXRvcihyZXF1ZXN0LCBgJHt0cmlnZ2VyVHlwZX0uJHtwYXJzZU9iamVjdC5jbGFzc05hbWV9YCwgYXV0aCk7XG4gICAgICB9KVxuICAgICAgLnRoZW4oKCkgPT4ge1xuICAgICAgICBpZiAocmVxdWVzdC5za2lwV2l0aE1hc3RlcktleSkge1xuICAgICAgICAgIHJldHVybiBQcm9taXNlLnJlc29sdmUoKTtcbiAgICAgICAgfVxuICAgICAgICBjb25zdCBwcm9taXNlID0gdHJpZ2dlcihyZXF1ZXN0KTtcbiAgICAgICAgaWYgKFxuICAgICAgICAgIHRyaWdnZXJUeXBlID09PSBUeXBlcy5hZnRlclNhdmUgfHxcbiAgICAgICAgICB0cmlnZ2VyVHlwZSA9PT0gVHlwZXMuYWZ0ZXJEZWxldGUgfHxcbiAgICAgICAgICB0cmlnZ2VyVHlwZSA9PT0gVHlwZXMuYWZ0ZXJMb2dpblxuICAgICAgICApIHtcbiAgICAgICAgICBsb2dUcmlnZ2VyQWZ0ZXJIb29rKFxuICAgICAgICAgICAgdHJpZ2dlclR5cGUsXG4gICAgICAgICAgICBwYXJzZU9iamVjdC5jbGFzc05hbWUsXG4gICAgICAgICAgICBwYXJzZU9iamVjdC50b0pTT04oKSxcbiAgICAgICAgICAgIGF1dGgsXG4gICAgICAgICAgICBjb25maWcubG9nTGV2ZWxzLnRyaWdnZXJBZnRlclxuICAgICAgICAgICk7XG4gICAgICAgIH1cbiAgICAgICAgLy8gYmVmb3JlU2F2ZSBpcyBleHBlY3RlZCB0byByZXR1cm4gbnVsbCAobm90aGluZylcbiAgICAgICAgaWYgKHRyaWdnZXJUeXBlID09PSBUeXBlcy5iZWZvcmVTYXZlKSB7XG4gICAgICAgICAgaWYgKHByb21pc2UgJiYgdHlwZW9mIHByb21pc2UudGhlbiA9PT0gJ2Z1bmN0aW9uJykge1xuICAgICAgICAgICAgcmV0dXJuIHByb21pc2UudGhlbihyZXNwb25zZSA9PiB7XG4gICAgICAgICAgICAgIC8vIHJlc3BvbnNlLm9iamVjdCBtYXkgY29tZSBmcm9tIGV4cHJlc3Mgcm91dGluZyBiZWZvcmUgaG9va1xuICAgICAgICAgICAgICBpZiAocmVzcG9uc2UgJiYgcmVzcG9uc2Uub2JqZWN0KSB7XG4gICAgICAgICAgICAgICAgcmV0dXJuIHJlc3BvbnNlO1xuICAgICAgICAgICAgICB9XG4gICAgICAgICAgICAgIHJldHVybiBudWxsO1xuICAgICAgICAgICAgfSk7XG4gICAgICAgICAgfVxuICAgICAgICAgIHJldHVybiBudWxsO1xuICAgICAgICB9XG5cbiAgICAgICAgcmV0dXJuIHByb21pc2U7XG4gICAgICB9KVxuICAgICAgLnRoZW4oc3VjY2VzcywgZXJyb3IpO1xuICB9KTtcbn1cblxuLy8gQ29udmVydHMgYSBSRVNULWZvcm1hdCBvYmplY3QgdG8gYSBQYXJzZS5PYmplY3Rcbi8vIGRhdGEgaXMgZWl0aGVyIGNsYXNzTmFtZSBvciBhbiBvYmplY3RcbmV4cG9ydCBmdW5jdGlvbiBpbmZsYXRlKGRhdGEsIHJlc3RPYmplY3QpIHtcbiAgdmFyIGNvcHkgPSB0eXBlb2YgZGF0YSA9PSAnb2JqZWN0JyA/IGRhdGEgOiB7IGNsYXNzTmFtZTogZGF0YSB9O1xuICBmb3IgKHZhciBrZXkgaW4gcmVzdE9iamVjdCkge1xuICAgIGNvcHlba2V5XSA9IHJlc3RPYmplY3Rba2V5XTtcbiAgfVxuICByZXR1cm4gUGFyc2UuT2JqZWN0LmZyb21KU09OKGNvcHkpO1xufVxuXG5leHBvcnQgZnVuY3Rpb24gcnVuTGl2ZVF1ZXJ5RXZlbnRIYW5kbGVycyhkYXRhLCBhcHBsaWNhdGlvbklkID0gUGFyc2UuYXBwbGljYXRpb25JZCkge1xuICBpZiAoIV90cmlnZ2VyU3RvcmUgfHwgIV90cmlnZ2VyU3RvcmVbYXBwbGljYXRpb25JZF0gfHwgIV90cmlnZ2VyU3RvcmVbYXBwbGljYXRpb25JZF0uTGl2ZVF1ZXJ5KSB7XG4gICAgcmV0dXJuO1xuICB9XG4gIF90cmlnZ2VyU3RvcmVbYXBwbGljYXRpb25JZF0uTGl2ZVF1ZXJ5LmZvckVhY2goaGFuZGxlciA9PiBoYW5kbGVyKGRhdGEpKTtcbn1cblxuZXhwb3J0IGZ1bmN0aW9uIGdldFJlcXVlc3RGaWxlT2JqZWN0KHRyaWdnZXJUeXBlLCBhdXRoLCBmaWxlT2JqZWN0LCBjb25maWcpIHtcbiAgY29uc3QgcmVxdWVzdCA9IHtcbiAgICAuLi5maWxlT2JqZWN0LFxuICAgIHRyaWdnZXJOYW1lOiB0cmlnZ2VyVHlwZSxcbiAgICBtYXN0ZXI6IGZhbHNlLFxuICAgIGxvZzogY29uZmlnLmxvZ2dlckNvbnRyb2xsZXIsXG4gICAgaGVhZGVyczogY29uZmlnLmhlYWRlcnMsXG4gICAgaXA6IGNvbmZpZy5pcCxcbiAgICBjb25maWcsXG4gIH07XG5cbiAgaWYgKCFhdXRoKSB7XG4gICAgcmV0dXJuIHJlcXVlc3Q7XG4gIH1cbiAgaWYgKGF1dGguaXNNYXN0ZXIpIHtcbiAgICByZXF1ZXN0WydtYXN0ZXInXSA9IHRydWU7XG4gIH1cbiAgaWYgKGF1dGgudXNlcikge1xuICAgIHJlcXVlc3RbJ3VzZXInXSA9IGF1dGgudXNlcjtcbiAgfVxuICBpZiAoYXV0aC5pbnN0YWxsYXRpb25JZCkge1xuICAgIHJlcXVlc3RbJ2luc3RhbGxhdGlvbklkJ10gPSBhdXRoLmluc3RhbGxhdGlvbklkO1xuICB9XG4gIHJldHVybiByZXF1ZXN0O1xufVxuXG5leHBvcnQgYXN5bmMgZnVuY3Rpb24gbWF5YmVSdW5GaWxlVHJpZ2dlcih0cmlnZ2VyVHlwZSwgZmlsZU9iamVjdCwgY29uZmlnLCBhdXRoKSB7XG4gIGNvbnN0IEZpbGVDbGFzc05hbWUgPSBnZXRDbGFzc05hbWUoUGFyc2UuRmlsZSk7XG4gIGNvbnN0IGZpbGVUcmlnZ2VyID0gZ2V0VHJpZ2dlcihGaWxlQ2xhc3NOYW1lLCB0cmlnZ2VyVHlwZSwgY29uZmlnLmFwcGxpY2F0aW9uSWQpO1xuICBpZiAodHlwZW9mIGZpbGVUcmlnZ2VyID09PSAnZnVuY3Rpb24nKSB7XG4gICAgdHJ5IHtcbiAgICAgIGNvbnN0IHJlcXVlc3QgPSBnZXRSZXF1ZXN0RmlsZU9iamVjdCh0cmlnZ2VyVHlwZSwgYXV0aCwgZmlsZU9iamVjdCwgY29uZmlnKTtcbiAgICAgIGF3YWl0IG1heWJlUnVuVmFsaWRhdG9yKHJlcXVlc3QsIGAke3RyaWdnZXJUeXBlfS4ke0ZpbGVDbGFzc05hbWV9YCwgYXV0aCk7XG4gICAgICBpZiAocmVxdWVzdC5za2lwV2l0aE1hc3RlcktleSkge1xuICAgICAgICByZXR1cm4gZmlsZU9iamVjdDtcbiAgICAgIH1cbiAgICAgIGNvbnN0IHJlc3VsdCA9IGF3YWl0IGZpbGVUcmlnZ2VyKHJlcXVlc3QpO1xuICAgICAgbG9nVHJpZ2dlclN1Y2Nlc3NCZWZvcmVIb29rKFxuICAgICAgICB0cmlnZ2VyVHlwZSxcbiAgICAgICAgJ1BhcnNlLkZpbGUnLFxuICAgICAgICB7IC4uLmZpbGVPYmplY3QuZmlsZS50b0pTT04oKSwgZmlsZVNpemU6IGZpbGVPYmplY3QuZmlsZVNpemUgfSxcbiAgICAgICAgcmVzdWx0LFxuICAgICAgICBhdXRoLFxuICAgICAgICBjb25maWcubG9nTGV2ZWxzLnRyaWdnZXJCZWZvcmVTdWNjZXNzXG4gICAgICApO1xuICAgICAgcmV0dXJuIHJlc3VsdCB8fCBmaWxlT2JqZWN0O1xuICAgIH0gY2F0Y2ggKGVycm9yKSB7XG4gICAgICBsb2dUcmlnZ2VyRXJyb3JCZWZvcmVIb29rKFxuICAgICAgICB0cmlnZ2VyVHlwZSxcbiAgICAgICAgJ1BhcnNlLkZpbGUnLFxuICAgICAgICB7IC4uLmZpbGVPYmplY3QuZmlsZS50b0pTT04oKSwgZmlsZVNpemU6IGZpbGVPYmplY3QuZmlsZVNpemUgfSxcbiAgICAgICAgYXV0aCxcbiAgICAgICAgZXJyb3IsXG4gICAgICAgIGNvbmZpZy5sb2dMZXZlbHMudHJpZ2dlckJlZm9yZUVycm9yXG4gICAgICApO1xuICAgICAgdGhyb3cgZXJyb3I7XG4gICAgfVxuICB9XG4gIHJldHVybiBmaWxlT2JqZWN0O1xufVxuIl0sIm1hcHBpbmdzIjoiOzs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7QUFDQSxJQUFBQSxLQUFBLEdBQUFDLHNCQUFBLENBQUFDLE9BQUE7QUFDQSxJQUFBQyxPQUFBLEdBQUFELE9BQUE7QUFBa0MsU0FBQUQsdUJBQUFHLEdBQUEsV0FBQUEsR0FBQSxJQUFBQSxHQUFBLENBQUFDLFVBQUEsR0FBQUQsR0FBQSxLQUFBRSxPQUFBLEVBQUFGLEdBQUE7QUFBQSxTQUFBRyxRQUFBQyxNQUFBLEVBQUFDLGNBQUEsUUFBQUMsSUFBQSxHQUFBQyxNQUFBLENBQUFELElBQUEsQ0FBQUYsTUFBQSxPQUFBRyxNQUFBLENBQUFDLHFCQUFBLFFBQUFDLE9BQUEs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