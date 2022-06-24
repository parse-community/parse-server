"use strict";

Object.defineProperty(exports, "__esModule", {
  value: true
});
exports.getClassName = getClassName;
exports.addFunction = addFunction;
exports.addJob = addJob;
exports.addTrigger = addTrigger;
exports.addConnectTrigger = addConnectTrigger;
exports.addLiveQueryEventHandler = addLiveQueryEventHandler;
exports.removeFunction = removeFunction;
exports.removeTrigger = removeTrigger;
exports._unregisterAll = _unregisterAll;
exports.toJSONwithObjects = toJSONwithObjects;
exports.getTrigger = getTrigger;
exports.runTrigger = runTrigger;
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
exports.Types = void 0;

var _node = _interopRequireDefault(require("parse/node"));

var _logger = require("./logger");

function _interopRequireDefault(obj) { return obj && obj.__esModule ? obj : { default: obj }; }

function ownKeys(object, enumerableOnly) { var keys = Object.keys(object); if (Object.getOwnPropertySymbols) { var symbols = Object.getOwnPropertySymbols(object); if (enumerableOnly) { symbols = symbols.filter(function (sym) { return Object.getOwnPropertyDescriptor(object, sym).enumerable; }); } keys.push.apply(keys, symbols); } return keys; }

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
          return toJSONwithObjects(object);
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
      return maybeRunValidator(request, `${triggerType}.${parseObject.className}`, auth);
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
//# sourceMappingURL=data:application/json;charset=utf-8;base64,eyJ2ZXJzaW9uIjozLCJzb3VyY2VzIjpbIi4uL3NyYy90cmlnZ2Vycy5qcyJdLCJuYW1lcyI6WyJUeXBlcyIsImJlZm9yZUxvZ2luIiwiYWZ0ZXJMb2dpbiIsImFmdGVyTG9nb3V0IiwiYmVmb3JlU2F2ZSIsImFmdGVyU2F2ZSIsImJlZm9yZURlbGV0ZSIsImFmdGVyRGVsZXRlIiwiYmVmb3JlRmluZCIsImFmdGVyRmluZCIsImJlZm9yZUNvbm5lY3QiLCJiZWZvcmVTdWJzY3JpYmUiLCJhZnRlckV2ZW50IiwiQ29ubmVjdENsYXNzTmFtZSIsImJhc2VTdG9yZSIsIlZhbGlkYXRvcnMiLCJPYmplY3QiLCJrZXlzIiwicmVkdWNlIiwiYmFzZSIsImtleSIsIkZ1bmN0aW9ucyIsIkpvYnMiLCJMaXZlUXVlcnkiLCJUcmlnZ2VycyIsImZyZWV6ZSIsImdldENsYXNzTmFtZSIsInBhcnNlQ2xhc3MiLCJjbGFzc05hbWUiLCJuYW1lIiwicmVwbGFjZSIsInZhbGlkYXRlQ2xhc3NOYW1lRm9yVHJpZ2dlcnMiLCJ0eXBlIiwiX3RyaWdnZXJTdG9yZSIsIkNhdGVnb3J5IiwiZ2V0U3RvcmUiLCJjYXRlZ29yeSIsImFwcGxpY2F0aW9uSWQiLCJwYXRoIiwic3BsaXQiLCJzcGxpY2UiLCJQYXJzZSIsInN0b3JlIiwiY29tcG9uZW50IiwidW5kZWZpbmVkIiwiYWRkIiwiaGFuZGxlciIsImxhc3RDb21wb25lbnQiLCJsb2dnZXIiLCJ3YXJuIiwicmVtb3ZlIiwiZ2V0IiwiYWRkRnVuY3Rpb24iLCJmdW5jdGlvbk5hbWUiLCJ2YWxpZGF0aW9uSGFuZGxlciIsImFkZEpvYiIsImpvYk5hbWUiLCJhZGRUcmlnZ2VyIiwiYWRkQ29ubmVjdFRyaWdnZXIiLCJhZGRMaXZlUXVlcnlFdmVudEhhbmRsZXIiLCJwdXNoIiwicmVtb3ZlRnVuY3Rpb24iLCJyZW1vdmVUcmlnZ2VyIiwiX3VucmVnaXN0ZXJBbGwiLCJmb3JFYWNoIiwiYXBwSWQiLCJ0b0pTT053aXRoT2JqZWN0cyIsIm9iamVjdCIsInRvSlNPTiIsInN0YXRlQ29udHJvbGxlciIsIkNvcmVNYW5hZ2VyIiwiZ2V0T2JqZWN0U3RhdGVDb250cm9sbGVyIiwicGVuZGluZyIsImdldFBlbmRpbmdPcHMiLCJfZ2V0U3RhdGVJZGVudGlmaWVyIiwidmFsIiwiX3RvRnVsbEpTT04iLCJnZXRUcmlnZ2VyIiwidHJpZ2dlclR5cGUiLCJydW5UcmlnZ2VyIiwidHJpZ2dlciIsInJlcXVlc3QiLCJhdXRoIiwibWF5YmVSdW5WYWxpZGF0b3IiLCJza2lwV2l0aE1hc3RlcktleSIsInRyaWdnZXJFeGlzdHMiLCJnZXRGdW5jdGlvbiIsImdldEZ1bmN0aW9uTmFtZXMiLCJmdW5jdGlvbk5hbWVzIiwiZXh0cmFjdEZ1bmN0aW9uTmFtZXMiLCJuYW1lc3BhY2UiLCJ2YWx1ZSIsImdldEpvYiIsImdldEpvYnMiLCJtYW5hZ2VyIiwiZ2V0VmFsaWRhdG9yIiwiZ2V0UmVxdWVzdE9iamVjdCIsInBhcnNlT2JqZWN0Iiwib3JpZ2luYWxQYXJzZU9iamVjdCIsImNvbmZpZyIsImNvbnRleHQiLCJ0cmlnZ2VyTmFtZSIsIm1hc3RlciIsImxvZyIsImxvZ2dlckNvbnRyb2xsZXIiLCJoZWFkZXJzIiwiaXAiLCJvcmlnaW5hbCIsImFzc2lnbiIsImlzTWFzdGVyIiwidXNlciIsImluc3RhbGxhdGlvbklkIiwiZ2V0UmVxdWVzdFF1ZXJ5T2JqZWN0IiwicXVlcnkiLCJjb3VudCIsImlzR2V0IiwiZ2V0UmVzcG9uc2VPYmplY3QiLCJyZXNvbHZlIiwicmVqZWN0Iiwic3VjY2VzcyIsInJlc3BvbnNlIiwib2JqZWN0cyIsIm1hcCIsImVxdWFscyIsIl9nZXRTYXZlSlNPTiIsImlkIiwiZXJyb3IiLCJlIiwicmVzb2x2ZUVycm9yIiwiY29kZSIsIkVycm9yIiwiU0NSSVBUX0ZBSUxFRCIsIm1lc3NhZ2UiLCJ1c2VySWRGb3JMb2ciLCJsb2dUcmlnZ2VyQWZ0ZXJIb29rIiwiaW5wdXQiLCJjbGVhbklucHV0IiwidHJ1bmNhdGVMb2dNZXNzYWdlIiwiSlNPTiIsInN0cmluZ2lmeSIsImluZm8iLCJsb2dUcmlnZ2VyU3VjY2Vzc0JlZm9yZUhvb2siLCJyZXN1bHQiLCJjbGVhblJlc3VsdCIsImxvZ1RyaWdnZXJFcnJvckJlZm9yZUhvb2siLCJtYXliZVJ1bkFmdGVyRmluZFRyaWdnZXIiLCJQcm9taXNlIiwiZnJvbUpTT04iLCJ0aGVuIiwicmVzdWx0cyIsIm1heWJlUnVuUXVlcnlUcmlnZ2VyIiwicmVzdFdoZXJlIiwicmVzdE9wdGlvbnMiLCJqc29uIiwid2hlcmUiLCJwYXJzZVF1ZXJ5IiwiUXVlcnkiLCJ3aXRoSlNPTiIsInJlcXVlc3RPYmplY3QiLCJxdWVyeVJlc3VsdCIsImpzb25RdWVyeSIsImxpbWl0Iiwic2tpcCIsImluY2x1ZGUiLCJleGNsdWRlS2V5cyIsImV4cGxhaW4iLCJvcmRlciIsImhpbnQiLCJyZWFkUHJlZmVyZW5jZSIsImluY2x1ZGVSZWFkUHJlZmVyZW5jZSIsInN1YnF1ZXJ5UmVhZFByZWZlcmVuY2UiLCJlcnIiLCJkZWZhdWx0T3B0cyIsInN0YWNrIiwidGhlVmFsaWRhdG9yIiwiYnVpbHRJblRyaWdnZXJWYWxpZGF0b3IiLCJjYXRjaCIsIlZBTElEQVRJT05fRVJST1IiLCJvcHRpb25zIiwidmFsaWRhdGVNYXN0ZXJLZXkiLCJyZXFVc2VyIiwiZXhpc3RlZCIsInJlcXVpcmVVc2VyIiwicmVxdWlyZUFueVVzZXJSb2xlcyIsInJlcXVpcmVBbGxVc2VyUm9sZXMiLCJyZXF1aXJlTWFzdGVyIiwicGFyYW1zIiwicmVxdWlyZWRQYXJhbSIsInZhbGlkYXRlT3B0aW9ucyIsIm9wdCIsIm9wdHMiLCJBcnJheSIsImlzQXJyYXkiLCJpbmNsdWRlcyIsImpvaW4iLCJnZXRUeXBlIiwiZm4iLCJtYXRjaCIsInRvU3RyaW5nIiwidG9Mb3dlckNhc2UiLCJmaWVsZHMiLCJvcHRpb25Qcm9taXNlcyIsImRlZmF1bHQiLCJzZXQiLCJjb25zdGFudCIsInJldmVydCIsInJlcXVpcmVkIiwib3B0aW9uYWwiLCJ2YWxUeXBlIiwiYWxsIiwidXNlclJvbGVzIiwicmVxdWlyZUFsbFJvbGVzIiwicHJvbWlzZXMiLCJnZXRVc2VyUm9sZXMiLCJyb2xlcyIsInJlc29sdmVkVXNlclJvbGVzIiwicmVzb2x2ZWRSZXF1aXJlQWxsIiwiaGFzUm9sZSIsInNvbWUiLCJyZXF1aXJlZFJvbGUiLCJ1c2VyS2V5cyIsInJlcXVpcmVVc2VyS2V5cyIsIm1heWJlUnVuVHJpZ2dlciIsInByb21pc2UiLCJpbmZsYXRlIiwiZGF0YSIsInJlc3RPYmplY3QiLCJjb3B5IiwicnVuTGl2ZVF1ZXJ5RXZlbnRIYW5kbGVycyIsImdldFJlcXVlc3RGaWxlT2JqZWN0IiwiZmlsZU9iamVjdCIsIm1heWJlUnVuRmlsZVRyaWdnZXIiLCJGaWxlQ2xhc3NOYW1lIiwiRmlsZSIsImZpbGVUcmlnZ2VyIiwiZmlsZSIsImZpbGVTaXplIl0sIm1hcHBpbmdzIjoiOzs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7O0FBQ0E7O0FBQ0E7Ozs7Ozs7Ozs7QUFFTyxNQUFNQSxLQUFLLEdBQUc7QUFDbkJDLEVBQUFBLFdBQVcsRUFBRSxhQURNO0FBRW5CQyxFQUFBQSxVQUFVLEVBQUUsWUFGTztBQUduQkMsRUFBQUEsV0FBVyxFQUFFLGFBSE07QUFJbkJDLEVBQUFBLFVBQVUsRUFBRSxZQUpPO0FBS25CQyxFQUFBQSxTQUFTLEVBQUUsV0FMUTtBQU1uQkMsRUFBQUEsWUFBWSxFQUFFLGNBTks7QUFPbkJDLEVBQUFBLFdBQVcsRUFBRSxhQVBNO0FBUW5CQyxFQUFBQSxVQUFVLEVBQUUsWUFSTztBQVNuQkMsRUFBQUEsU0FBUyxFQUFFLFdBVFE7QUFVbkJDLEVBQUFBLGFBQWEsRUFBRSxlQVZJO0FBV25CQyxFQUFBQSxlQUFlLEVBQUUsaUJBWEU7QUFZbkJDLEVBQUFBLFVBQVUsRUFBRTtBQVpPLENBQWQ7O0FBZVAsTUFBTUMsZ0JBQWdCLEdBQUcsVUFBekI7O0FBRUEsTUFBTUMsU0FBUyxHQUFHLFlBQVk7QUFDNUIsUUFBTUMsVUFBVSxHQUFHQyxNQUFNLENBQUNDLElBQVAsQ0FBWWpCLEtBQVosRUFBbUJrQixNQUFuQixDQUEw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QVgsQ0FBZ0J2SyxNQUFoQixFQUhrQjtBQUdRd0ssUUFBQUEsUUFBUSxFQUFFTixVQUFVLENBQUNNO0FBSDdCLFVBSXZCMUosSUFKdUIsRUFLdkI0QyxLQUx1QixDQUF6QjtBQU9BLFlBQU1BLEtBQU47QUFDRDtBQUNGOztBQUNELFNBQU93RyxVQUFQO0FBQ0QiLCJzb3VyY2VzQ29udGVudCI6WyIvLyB0cmlnZ2Vycy5qc1xuaW1wb3J0IFBhcnNlIGZyb20gJ3BhcnNlL25vZGUnO1xuaW1wb3J0IHsgbG9nZ2VyIH0gZnJvbSAnLi9sb2dnZXInO1xuXG5leHBvcnQgY29uc3QgVHlwZXMgPSB7XG4gIGJlZm9yZUxvZ2luOiAnYmVmb3JlTG9naW4nLFxuICBhZnRlckxvZ2luOiAnYWZ0ZXJMb2dpbicsXG4gIGFmdGVyTG9nb3V0OiAnYWZ0ZXJMb2dvdXQnLFxuICBiZWZvcmVTYXZlOiAnYmVmb3JlU2F2ZScsXG4gIGFmdGVyU2F2ZTogJ2FmdGVyU2F2ZScsXG4gIGJlZm9yZURlbGV0ZTogJ2JlZm9yZURlbGV0ZScsXG4gIGFmdGVyRGVsZXRlOiAnYWZ0ZXJEZWxldGUnLFxuICBiZWZvcmVGaW5kOiAnYmVmb3JlRmluZCcsXG4gIGFmdGVyRmluZDogJ2FmdGVyRmluZCcsXG4gIGJlZm9yZUNvbm5lY3Q6ICdiZWZvcmVDb25uZWN0JyxcbiAgYmVmb3JlU3Vic2NyaWJlOiAnYmVmb3JlU3Vic2NyaWJlJyxcbiAgYWZ0ZXJFdmVudDogJ2FmdGVyRXZlbnQnLFxufTtcblxuY29uc3QgQ29ubmVjdENsYXNzTmFtZSA9ICdAQ29ubmVjdCc7XG5cbmNvbnN0IGJhc2VTdG9yZSA9IGZ1bmN0aW9uICgpIHtcbiAgY29uc3QgVmFsaWRhdG9ycyA9IE9iamVjdC5rZXlzKFR5cGVzKS5yZWR1Y2UoZnVuY3Rpb24gKGJhc2UsIGtleSkge1xuICAgIGJhc2Vba2V5XSA9IHt9O1xuICAgIHJldHVybiBiYXNlO1xuICB9LCB7fSk7XG4gIGNvbnN0IEZ1bmN0aW9ucyA9IHt9O1xuICBjb25zdCBKb2JzID0ge307XG4gIGNvbnN0IExpdmVRdWVyeSA9IFtdO1xuICBjb25zdCBUcmlnZ2VycyA9IE9iamVjdC5rZXlzKFR5cGVzKS5yZWR1Y2UoZnVuY3Rpb24gKGJhc2UsIGtleSkge1xuICAgIGJhc2Vba2V5XSA9IHt9O1xuICAgIHJldHVybiBiYXNlO1xuICB9LCB7fSk7XG5cbiAgcmV0dXJuIE9iamVjdC5mcmVlemUoe1xuICAgIEZ1bmN0aW9ucyxcbiAgICBKb2JzLFxuICAgIFZhbGlkYXRvcnMsXG4gICAgVHJpZ2dlcnMsXG4gICAgTGl2ZVF1ZXJ5LFxuICB9KTtcbn07XG5cbmV4cG9ydCBmdW5jdGlvbiBnZXRDbGFzc05hbWUocGFyc2VDbGFzcykge1xuICBpZiAocGFyc2VDbGFzcyAmJiBwYXJzZUNsYXNzLmNsYXNzTmFtZSkge1xuICAgIHJldHVybiBwYXJzZUNsYXNzLmNsYXNzTmFtZTtcbiAgfVxuICBpZiAocGFyc2VDbGFzcyAmJiBwYXJzZUNsYXNzLm5hbWUpIHtcbiAgICByZXR1cm4gcGFyc2VDbGFzcy5uYW1lLnJlcGxhY2UoJ1BhcnNlJywgJ0AnKTtcbiAgfVxuICByZXR1cm4gcGFyc2VDbGFzcztcbn1cblxuZnVuY3Rpb24gdmFsaWRhdGVDbGFzc05hbWVGb3JUcmlnZ2VycyhjbGFzc05hbWUsIHR5cGUpIHtcbiAgaWYgKHR5cGUgPT0gVHlwZXMuYmVmb3JlU2F2ZSAmJiBjbGFzc05hbWUgPT09ICdfUHVzaFN0YXR1cycpIHtcbiAgICAvLyBfUHVzaFN0YXR1cyB1c2VzIHVuZG9jdW1lbnRlZCBuZXN0ZWQga2V5IGluY3JlbWVudCBvcHNcbiAgICAvLyBhbGxvd2luZyBiZWZvcmVTYXZlIHdvdWxkIG1lc3MgdXAgdGhlIG9iamVjdHMgYmlnIHRpbWVcbiAgICAvLyBUT0RPOiBBbGxvdyBwcm9wZXIgZG9jdW1lbnRlZCB3YXkgb2YgdXNpbmcgbmVzdGVkIGluY3JlbWVudCBvcHNcbiAgICB0aHJvdyAnT25seSBhZnRlclNhdmUgaXMgYWxsb3dlZCBvbiBfUHVzaFN0YXR1cyc7XG4gIH1cbiAgaWYgKCh0eXBlID09PSBUeXBlcy5iZWZvcmVMb2dpbiB8fCB0eXBlID09PSBUeXBlcy5hZnRlckxvZ2luKSAmJiBjbGFzc05hbWUgIT09ICdfVXNlcicpIHtcbiAgICAvLyBUT0RPOiBjaGVjayBpZiB1cHN0cmVhbSBjb2RlIHdpbGwgaGFuZGxlIGBFcnJvcmAgaW5zdGFuY2UgcmF0aGVyXG4gICAgLy8gdGhhbiB0aGlzIGFudGktcGF0dGVybiBvZiB0aHJvd2luZyBzdHJpbmdzXG4gICAgdGhyb3cgJ09ubHkgdGhlIF9Vc2VyIGNsYXNzIGlzIGFsbG93ZWQgZm9yIHRoZSBiZWZvcmVMb2dpbiBhbmQgYWZ0ZXJMb2dpbiB0cmlnZ2Vycyc7XG4gIH1cbiAgaWYgKHR5cGUgPT09IFR5cGVzLmFmdGVyTG9nb3V0ICYmIGNsYXNzTmFtZSAhPT0gJ19TZXNzaW9uJykge1xuICAgIC8vIFRPRE86IGNoZWNrIGlmIHVwc3RyZWFtIGNvZGUgd2lsbCBoYW5kbGUgYEVycm9yYCBpbnN0YW5jZSByYXRoZXJcbiAgICAvLyB0aGFuIHRoaXMgYW50aS1wYXR0ZXJuIG9mIHRocm93aW5nIHN0cmluZ3NcbiAgICB0aHJvdyAnT25seSB0aGUgX1Nlc3Npb24gY2xhc3MgaXMgYWxsb3dlZCBmb3IgdGhlIGFmdGVyTG9nb3V0IHRyaWdnZXIuJztcbiAgfVxuICBpZiAoY2xhc3NOYW1lID09PSAnX1Nlc3Npb24nICYmIHR5cGUgIT09IFR5cGVzLmFmdGVyTG9nb3V0KSB7XG4gICAgLy8gVE9ETzogY2hlY2sgaWYgdXBzdHJlYW0gY29kZSB3aWxsIGhhbmRsZSBgRXJyb3JgIGluc3RhbmNlIHJhdGhlclxuICAgIC8vIHRoYW4gdGhpcyBhbnRpLXBhdHRlcm4gb2YgdGhyb3dpbmcgc3RyaW5nc1xuICAgIHRocm93ICdPbmx5IHRoZSBhZnRlckxvZ291dCB0cmlnZ2VyIGlzIGFsbG93ZWQgZm9yIHRoZSBfU2Vzc2lvbiBjbGFzcy4nO1xuICB9XG4gIHJldHVybiBjbGFzc05hbWU7XG59XG5cbmNvbnN0IF90cmlnZ2VyU3RvcmUgPSB7fTtcblxuY29uc3QgQ2F0ZWdvcnkgPSB7XG4gIEZ1bmN0aW9uczogJ0Z1bmN0aW9ucycsXG4gIFZhbGlkYXRvcnM6ICdWYWxpZGF0b3JzJyxcbiAgSm9iczogJ0pvYnMnLFxuICBUcmlnZ2VyczogJ1RyaWdnZXJzJyxcbn07XG5cbmZ1bmN0aW9uIGdldFN0b3JlKGNhdGVnb3J5LCBuYW1lLCBhcHBsaWNhdGlvbklkKSB7XG4gIGNvbnN0IHBhdGggPSBuYW1lLnNwbGl0KCcuJyk7XG4gIHBhdGguc3BsaWNlKC0xKTsgLy8gcmVtb3ZlIGxhc3QgY29tcG9uZW50XG4gIGFwcGxpY2F0aW9uSWQgPSBhcHBsaWNhdGlvbklkIHx8IFBhcnNlLmFwcGxpY2F0aW9uSWQ7XG4gIF90cmlnZ2VyU3RvcmVbYXBwbGljYXRpb25JZF0gPSBfdHJpZ2dlclN0b3JlW2FwcGxpY2F0aW9uSWRdIHx8IGJhc2VTdG9yZSgpO1xuICBsZXQgc3RvcmUgPSBfdHJpZ2dlclN0b3JlW2FwcGxpY2F0aW9uSWRdW2NhdGVnb3J5XTtcbiAgZm9yIChjb25zdCBjb21wb25lbnQgb2YgcGF0aCkge1xuICAgIHN0b3JlID0gc3RvcmVbY29tcG9uZW50XTtcbiAgICBpZiAoIXN0b3JlKSB7XG4gICAgICByZXR1cm4gdW5kZWZpbmVkO1xuICAgIH1cbiAgfVxuICByZXR1cm4gc3RvcmU7XG59XG5cbmZ1bmN0aW9uIGFkZChjYXRlZ29yeSwgbmFtZSwgaGFuZGxlciwgYXBwbGljYXRpb25JZCkge1xuICBjb25zdCBsYXN0Q29tcG9uZW50ID0gbmFtZS5zcGxpdCgnLicpLnNwbGljZSgtMSk7XG4gIGNvbnN0IHN0b3JlID0gZ2V0U3RvcmUoY2F0ZWdvcnksIG5hbWUsIGFwcGxpY2F0aW9uSWQpO1xuICBpZiAoc3RvcmVbbGFzdENvbXBvbmVudF0pIHtcbiAgICBsb2dnZXIud2FybihcbiAgICAgIGBXYXJuaW5nOiBEdXBsaWNhdGUgY2xvdWQgZnVuY3Rpb25zIGV4aXN0IGZvciAke2xhc3RDb21wb25lbnR9LiBPbmx5IHRoZSBsYXN0IG9uZSB3aWxsIGJlIHVzZWQgYW5kIHRoZSBvdGhlcnMgd2lsbCBiZSBpZ25vcmVkLmBcbiAgICApO1xuICB9XG4gIHN0b3JlW2xhc3RDb21wb25lbnRdID0gaGFuZGxlcjtcbn1cblxuZnVuY3Rpb24gcmVtb3ZlKGNhdGVnb3J5LCBuYW1lLCBhcHBsaWNhdGlvbklkKSB7XG4gIGNvbnN0IGxhc3RDb21wb25lbnQgPSBuYW1lLnNwbGl0KCcuJykuc3BsaWNlKC0xKTtcbiAgY29uc3Qgc3RvcmUgPSBnZXRTdG9yZShjYXRlZ29yeSwgbmFtZSwgYXBwbGljYXRpb25JZCk7XG4gIGRlbGV0ZSBzdG9yZVtsYXN0Q29tcG9uZW50XTtcbn1cblxuZnVuY3Rpb24gZ2V0KGNhdGVnb3J5LCBuYW1lLCBhcHBsaWNhdGlvbklkKSB7XG4gIGNvbnN0IGxhc3RDb21wb25lbnQgPSBuYW1lLnNwbGl0KCcuJykuc3BsaWNlKC0xKTtcbiAgY29uc3Qgc3RvcmUgPSBnZXRTdG9yZShjYXRlZ29yeSwgbmFtZSwgYXBwbGljYXRpb25JZCk7XG4gIHJldHVybiBzdG9yZVtsYXN0Q29tcG9uZW50XTtcbn1cblxuZXhwb3J0IGZ1bmN0aW9uIGFkZEZ1bmN0aW9uKGZ1bmN0aW9uTmFtZSwgaGFuZGxlciwgdmFsaWRhdGlvbkhhbmRsZXIsIGFwcGxpY2F0aW9uSWQpIHtcbiAgYWRkKENhdGVnb3J5LkZ1bmN0aW9ucywgZnVuY3Rpb25OYW1lLCBoYW5kbGVyLCBhcHBsaWNhdGlvbklkKTtcbiAgYWRkKENhdGVnb3J5LlZhbGlkYXRvcnMsIGZ1bmN0aW9uTmFtZSwgdmFsaWRhdGlvbkhhbmRsZXIsIGFwcGxpY2F0aW9uSWQpO1xufVxuXG5leHBvcnQgZnVuY3Rpb24gYWRkSm9iKGpvYk5hbWUsIGhhbmRsZXIsIGFwcGxpY2F0aW9uSWQpIHtcbiAgYWRkKENhdGVnb3J5LkpvYnMsIGpvYk5hbWUsIGhhbmRsZXIsIGFwcGxpY2F0aW9uSWQpO1xufVxuXG5leHBvcnQgZnVuY3Rpb24gYWRkVHJpZ2dlcih0eXBlLCBjbGFzc05hbWUsIGhhbmRsZXIsIGFwcGxpY2F0aW9uSWQsIHZhbGlkYXRpb25IYW5kbGVyKSB7XG4gIHZhbGlkYXRlQ2xhc3NOYW1lRm9yVHJpZ2dlcnMoY2xhc3NOYW1lLCB0eXBlKTtcbiAgYWRkKENhdGVnb3J5LlRyaWdnZXJzLCBgJHt0eXBlfS4ke2NsYXNzTmFtZX1gLCBoYW5kbGVyLCBhcHBsaWNhdGlvbklkKTtcbiAgYWRkKENhdGVnb3J5LlZhbGlkYXRvcnMsIGAke3R5cGV9LiR7Y2xhc3NOYW1lfWAsIHZhbGlkYXRpb25IYW5kbGVyLCBhcHBsaWNhdGlvbklkKTtcbn1cblxuZXhwb3J0IGZ1bmN0aW9uIGFkZENvbm5lY3RUcmlnZ2VyKHR5cGUsIGhhbmRsZXIsIGFwcGxpY2F0aW9uSWQsIHZhbGlkYXRpb25IYW5kbGVyKSB7XG4gIGFkZChDYXRlZ29yeS5UcmlnZ2VycywgYCR7dHlwZX0uJHtDb25uZWN0Q2xhc3NOYW1lfWAsIGhhbmRsZXIsIGFwcGxpY2F0aW9uSWQpO1xuICBhZGQoQ2F0ZWdvcnkuVmFsaWRhdG9ycywgYCR7dHlwZX0uJHtDb25uZWN0Q2xhc3NOYW1lfWAsIHZhbGlkYXRpb25IYW5kbGVyLCBhcHBsaWNhdGlvbklkKTtcbn1cblxuZXhwb3J0IGZ1bmN0aW9uIGFkZExpdmVRdWVyeUV2ZW50SGFuZGxlcihoYW5kbGVyLCBhcHBsaWNhdGlvbklkKSB7XG4gIGFwcGxpY2F0aW9uSWQgPSBhcHBsaWNhdGlvbklkIHx8IFBhcnNlLmFwcGxpY2F0aW9uSWQ7XG4gIF90cmlnZ2VyU3RvcmVbYXBwbGljYXRpb25JZF0gPSBfdHJpZ2dlclN0b3JlW2FwcGxpY2F0aW9uSWRdIHx8IGJhc2VTdG9yZSgpO1xuICBfdHJpZ2dlclN0b3JlW2FwcGxpY2F0aW9uSWRdLkxpdmVRdWVyeS5wdXNoKGhhbmRsZXIpO1xufVxuXG5leHBvcnQgZnVuY3Rpb24gcmVtb3ZlRnVuY3Rpb24oZnVuY3Rpb25OYW1lLCBhcHBsaWNhdGlvbklkKSB7XG4gIHJlbW92ZShDYXRlZ29yeS5GdW5jdGlvbnMsIGZ1bmN0aW9uTmFtZSwgYXBwbGljYXRpb25JZCk7XG59XG5cbmV4cG9ydCBmdW5jdGlvbiByZW1vdmVUcmlnZ2VyKHR5cGUsIGNsYXNzTmFtZSwgYXBwbGljYXRpb25JZCkge1xuICByZW1vdmUoQ2F0ZWdvcnkuVHJpZ2dlcnMsIGAke3R5cGV9LiR7Y2xhc3NOYW1lfWAsIGFwcGxpY2F0aW9uSWQpO1xufVxuXG5leHBvcnQgZnVuY3Rpb24gX3VucmVnaXN0ZXJBbGwoKSB7XG4gIE9iamVjdC5rZXlzKF90cmlnZ2VyU3RvcmUpLmZvckVhY2goYXBwSWQgPT4gZGVsZXRlIF90cmlnZ2VyU3RvcmVbYXBwSWRdKTtcbn1cblxuZXhwb3J0IGZ1bmN0aW9uIHRvSlNPTndpdGhPYmplY3RzKG9iamVjdCwgY2xhc3NOYW1lKSB7XG4gIGlmICghb2JqZWN0IHx8ICFvYmplY3QudG9KU09OKSB7XG4gICAgcmV0dXJuIHt9O1xuICB9XG4gIGNvbnN0IHRvSlNPTiA9IG9iamVjdC50b0pTT04oKTtcbiAgY29uc3Qgc3RhdGVDb250cm9sbGVyID0gUGFyc2UuQ29yZU1hbmFnZXIuZ2V0T2JqZWN0U3RhdGVDb250cm9sbGVyKCk7XG4gIGNvbnN0IFtwZW5kaW5nXSA9IHN0YXRlQ29udHJvbGxlci5nZXRQZW5kaW5nT3BzKG9iamVjdC5fZ2V0U3RhdGVJZGVudGlmaWVyKCkpO1xuICBmb3IgKGNvbnN0IGtleSBpbiBwZW5kaW5nKSB7XG4gICAgY29uc3QgdmFsID0gb2JqZWN0LmdldChrZXkpO1xuICAgIGlmICghdmFsIHx8ICF2YWwuX3RvRnVsbEpTT04pIHtcbiAgICAgIHRvSlNPTltrZXldID0gdmFsO1xuICAgICAgY29udGludWU7XG4gICAgfVxuICAgIHRvSlNPTltrZXldID0gdmFsLl90b0Z1bGxKU09OKCk7XG4gIH1cbiAgaWYgKGNsYXNzTmFtZSkge1xuICAgIHRvSlNPTi5jbGFzc05hbWUgPSBjbGFzc05hbWU7XG4gIH1cbiAgcmV0dXJuIHRvSlNPTjtcbn1cblxuZXhwb3J0IGZ1bmN0aW9uIGdldFRyaWdnZXIoY2xhc3NOYW1lLCB0cmlnZ2VyVHlwZSwgYXBwbGljYXRpb25JZCkge1xuICBpZiAoIWFwcGxpY2F0aW9uSWQpIHtcbiAgICB0aHJvdyAnTWlzc2luZyBBcHBsaWNhdGlvbklEJztcbiAgfVxuICByZXR1cm4gZ2V0KENhdGVnb3J5LlRyaWdnZXJzLCBgJHt0cmlnZ2VyVHlwZX0uJHtjbGFzc05hbWV9YCwgYXBwbGljYXRpb25JZCk7XG59XG5cbmV4cG9ydCBhc3luYyBmdW5jdGlvbiBydW5UcmlnZ2VyKHRyaWdnZXIsIG5hbWUsIHJlcXVlc3QsIGF1dGgpIHtcbiAgaWYgKCF0cmlnZ2VyKSB7XG4gICAgcmV0dXJuO1xuICB9XG4gIGF3YWl0IG1heWJlUnVuVmFsaWRhdG9yKHJlcXVlc3QsIG5hbWUsIGF1dGgpO1xuICBpZiAocmVxdWVzdC5za2lwV2l0aE1hc3RlcktleSkge1xuICAgIHJldHVybjtcbiAgfVxuICByZXR1cm4gYXdhaXQgdHJpZ2dlcihyZXF1ZXN0KTtcbn1cblxuZXhwb3J0IGZ1bmN0aW9uIHRyaWdnZXJFeGlzdHMoY2xhc3NOYW1lOiBzdHJpbmcsIHR5cGU6IHN0cmluZywgYXBwbGljYXRpb25JZDogc3RyaW5nKTogYm9vbGVhbiB7XG4gIHJldHVybiBnZXRUcmlnZ2VyKGNsYXNzTmFtZSwgdHlwZSwgYXBwbGljYXRpb25JZCkgIT0gdW5kZWZpbmVkO1xufVxuXG5leHBvcnQgZnVuY3Rpb24gZ2V0RnVuY3Rpb24oZnVuY3Rpb25OYW1lLCBhcHBsaWNhdGlvbklkKSB7XG4gIHJldHVybiBnZXQoQ2F0ZWdvcnkuRnVuY3Rpb25zLCBmdW5jdGlvbk5hbWUsIGFwcGxpY2F0aW9uSWQpO1xufVxuXG5leHBvcnQgZnVuY3Rpb24gZ2V0RnVuY3Rpb25OYW1lcyhhcHBsaWNhdGlvbklkKSB7XG4gIGNvbnN0IHN0b3JlID1cbiAgICAoX3RyaWdnZXJTdG9yZVthcHBsaWNhdGlvbklkXSAmJiBfdHJpZ2dlclN0b3JlW2FwcGxpY2F0aW9uSWRdW0NhdGVnb3J5LkZ1bmN0aW9uc10pIHx8IHt9O1xuICBjb25zdCBmdW5jdGlvbk5hbWVzID0gW107XG4gIGNvbnN0IGV4dHJhY3RGdW5jdGlvbk5hbWVzID0gKG5hbWVzcGFjZSwgc3RvcmUpID0+IHtcbiAgICBPYmplY3Qua2V5cyhzdG9yZSkuZm9yRWFjaChuYW1lID0+IHtcbiAgICAgIGNvbnN0IHZhbHVlID0gc3RvcmVbbmFtZV07XG4gICAgICBpZiAobmFtZXNwYWNlKSB7XG4gICAgICAgIG5hbWUgPSBgJHtuYW1lc3BhY2V9LiR7bmFtZX1gO1xuICAgICAgfVxuICAgICAgaWYgKHR5cGVvZiB2YWx1ZSA9PT0gJ2Z1bmN0aW9uJykge1xuICAgICAgICBmdW5jdGlvbk5hbWVzLnB1c2gobmFtZSk7XG4gICAgICB9IGVsc2Uge1xuICAgICAgICBleHRyYWN0RnVuY3Rpb25OYW1lcyhuYW1lLCB2YWx1ZSk7XG4gICAgICB9XG4gICAgfSk7XG4gIH07XG4gIGV4dHJhY3RGdW5jdGlvbk5hbWVzKG51bGwsIHN0b3JlKTtcbiAgcmV0dXJuIGZ1bmN0aW9uTmFtZXM7XG59XG5cbmV4cG9ydCBmdW5jdGlvbiBnZXRKb2Ioam9iTmFtZSwgYXBwbGljYXRpb25JZCkge1xuICByZXR1cm4gZ2V0KENhdGVnb3J5LkpvYnMsIGpvYk5hbWUsIGFwcGxpY2F0aW9uSWQpO1xufVxuXG5leHBvcnQgZnVuY3Rpb24gZ2V0Sm9icyhhcHBsaWNhdGlvbklkKSB7XG4gIHZhciBtYW5hZ2VyID0gX3RyaWdnZXJTdG9yZVthcHBsaWNhdGlvbklkXTtcbiAgaWYgKG1hbmFnZXIgJiYgbWFuYWdlci5Kb2JzKSB7XG4gICAgcmV0dXJuIG1hbmFnZXIuSm9icztcbiAgfVxuICByZXR1cm4gdW5kZWZpbmVkO1xufVxuXG5leHBvcnQgZnVuY3Rpb24gZ2V0VmFsaWRhdG9yKGZ1bmN0aW9uTmFtZSwgYXBwbGljYXRpb25JZCkge1xuICByZXR1cm4gZ2V0KENhdGVnb3J5LlZhbGlkYXRvcnMsIGZ1bmN0aW9uTmFtZSwgYXBwbGljYXRpb25JZCk7XG59XG5cbmV4cG9ydCBmdW5jdGlvbiBnZXRSZXF1ZXN0T2JqZWN0KFxuICB0cmlnZ2VyVHlwZSxcbiAgYXV0aCxcbiAgcGFyc2VPYmplY3QsXG4gIG9yaWdpbmFsUGFyc2VPYmplY3QsXG4gIGNvbmZpZyxcbiAgY29udGV4dFxuKSB7XG4gIGNvbnN0IHJlcXVlc3QgPSB7XG4gICAgdHJpZ2dlck5hbWU6IHRyaWdnZXJUeXBlLFxuICAgIG9iamVjdDogcGFyc2VPYmplY3QsXG4gICAgbWFzdGVyOiBmYWxzZSxcbiAgICBsb2c6IGNvbmZpZy5sb2dnZXJDb250cm9sbGVyLFxuICAgIGhlYWRlcnM6IGNvbmZpZy5oZWFkZXJzLFxuICAgIGlwOiBjb25maWcuaXAsXG4gICAgY29uZmlnLFxuICB9O1xuXG4gIGlmIChvcmlnaW5hbFBhcnNlT2JqZWN0KSB7XG4gICAgcmVxdWVzdC5vcmlnaW5hbCA9IG9yaWdpbmFsUGFyc2VPYmplY3Q7XG4gIH1cbiAgaWYgKFxuICAgIHRyaWdnZXJUeXBlID09PSBUeXBlcy5iZWZvcmVTYXZlIHx8XG4gICAgdHJpZ2dlclR5cGUgPT09IFR5cGVzLmFmdGVyU2F2ZSB8fFxuICAgIHRyaWdnZXJUeXBlID09PSBUeXBlcy5iZWZvcmVEZWxldGUgfHxcbiAgICB0cmlnZ2VyVHlwZSA9PT0gVHlwZXMuYWZ0ZXJEZWxldGUgfHxcbiAgICB0cmlnZ2VyVHlwZSA9PT0gVHlwZXMuYWZ0ZXJGaW5kXG4gICkge1xuICAgIC8vIFNldCBhIGNvcHkgb2YgdGhlIGNvbnRleHQgb24gdGhlIHJlcXVlc3Qgb2JqZWN0LlxuICAgIHJlcXVlc3QuY29udGV4dCA9IE9iamVjdC5hc3NpZ24oe30sIGNvbnRleHQpO1xuICB9XG5cbiAgaWYgKCFhdXRoKSB7XG4gICAgcmV0dXJuIHJlcXVlc3Q7XG4gIH1cbiAgaWYgKGF1dGguaXNNYXN0ZXIpIHtcbiAgICByZXF1ZXN0WydtYXN0ZXInXSA9IHRydWU7XG4gIH1cbiAgaWYgKGF1dGgudXNlcikge1xuICAgIHJlcXVlc3RbJ3VzZXInXSA9IGF1dGgudXNlcjtcbiAgfVxuICBpZiAoYXV0aC5pbnN0YWxsYXRpb25JZCkge1xuICAgIHJlcXVlc3RbJ2luc3RhbGxhdGlvbklkJ10gPSBhdXRoLmluc3RhbGxhdGlvbklkO1xuICB9XG4gIHJldHVybiByZXF1ZXN0O1xufVxuXG5leHBvcnQgZnVuY3Rpb24gZ2V0UmVxdWVzdFF1ZXJ5T2JqZWN0KHRyaWdnZXJUeXBlLCBhdXRoLCBxdWVyeSwgY291bnQsIGNvbmZpZywgY29udGV4dCwgaXNHZXQpIHtcbiAgaXNHZXQgPSAhIWlzR2V0O1xuXG4gIHZhciByZXF1ZXN0ID0ge1xuICAgIHRyaWdnZXJOYW1lOiB0cmlnZ2VyVHlwZSxcbiAgICBxdWVyeSxcbiAgICBtYXN0ZXI6IGZhbHNlLFxuICAgIGNvdW50LFxuICAgIGxvZzogY29uZmlnLmxvZ2dlckNvbnRyb2xsZXIsXG4gICAgaXNHZXQsXG4gICAgaGVhZGVyczogY29uZmlnLmhlYWRlcnMsXG4gICAgaXA6IGNvbmZpZy5pcCxcbiAgICBjb250ZXh0OiBjb250ZXh0IHx8IHt9LFxuICAgIGNvbmZpZyxcbiAgfTtcblxuICBpZiAoIWF1dGgpIHtcbiAgICByZXR1cm4gcmVxdWVzdDtcbiAgfVxuICBpZiAoYXV0aC5pc01hc3Rlcikge1xuICAgIHJlcXVlc3RbJ21hc3RlciddID0gdHJ1ZTtcbiAgfVxuICBpZiAoYXV0aC51c2VyKSB7XG4gICAgcmVxdWVzdFsndXNlciddID0gYXV0aC51c2VyO1xuICB9XG4gIGlmIChhdXRoLmluc3RhbGxhdGlvbklkKSB7XG4gICAgcmVxdWVzdFsnaW5zdGFsbGF0aW9uSWQnXSA9IGF1dGguaW5zdGFsbGF0aW9uSWQ7XG4gIH1cbiAgcmV0dXJuIHJlcXVlc3Q7XG59XG5cbi8vIENyZWF0ZXMgdGhlIHJlc3BvbnNlIG9iamVjdCwgYW5kIHVzZXMgdGhlIHJlcXVlc3Qgb2JqZWN0IHRvIHBhc3MgZGF0YVxuLy8gVGhlIEFQSSB3aWxsIGNhbGwgdGhpcyB3aXRoIFJFU1QgQVBJIGZvcm1hdHRlZCBvYmplY3RzLCB0aGlzIHdpbGxcbi8vIHRyYW5zZm9ybSB0aGVtIHRvIFBhcnNlLk9iamVjdCBpbnN0YW5jZXMgZXhwZWN0ZWQgYnkgQ2xvdWQgQ29kZS5cbi8vIEFueSBjaGFuZ2VzIG1hZGUgdG8gdGhlIG9iamVjdCBpbiBhIGJlZm9yZVNhdmUgd2lsbCBiZSBpbmNsdWRlZC5cbmV4cG9ydCBmdW5jdGlvbiBnZXRSZXNwb25zZU9iamVjdChyZXF1ZXN0LCByZXNvbHZlLCByZWplY3QpIHtcbiAgcmV0dXJuIHtcbiAgICBzdWNjZXNzOiBmdW5jdGlvbiAocmVzcG9uc2UpIHtcbiAgICAgIGlmIChyZXF1ZXN0LnRyaWdnZXJOYW1lID09PSBUeXBlcy5hZnRlckZpbmQpIHtcbiAgICAgICAgaWYgKCFyZXNwb25zZSkge1xuICAgICAgICAgIHJlc3BvbnNlID0gcmVxdWVzdC5vYmplY3RzO1xuICAgICAgICB9XG4gICAgICAgIHJlc3BvbnNlID0gcmVzcG9uc2UubWFwKG9iamVjdCA9PiB7XG4gICAgICAgICAgcmV0dXJuIHRvSlNPTndpdGhPYmplY3RzKG9iamVjdCk7XG4gICAgICAgIH0pO1xuICAgICAgICByZXR1cm4gcmVzb2x2ZShyZXNwb25zZSk7XG4gICAgICB9XG4gICAgICAvLyBVc2UgdGhlIEpTT04gcmVzcG9uc2VcbiAgICAgIGlmIChcbiAgICAgICAgcmVzcG9uc2UgJiZcbiAgICAgICAgdHlwZW9mIHJlc3BvbnNlID09PSAnb2JqZWN0JyAmJlxuICAgICAgICAhcmVxdWVzdC5vYmplY3QuZXF1YWxzKHJlc3BvbnNlKSAmJlxuICAgICAgICByZXF1ZXN0LnRyaWdnZXJOYW1lID09PSBUeXBlcy5iZWZvcmVTYXZlXG4gICAgICApIHtcbiAgICAgICAgcmV0dXJuIHJlc29sdmUocmVzcG9uc2UpO1xuICAgICAgfVxuICAgICAgaWYgKHJlc3BvbnNlICYmIHR5cGVvZiByZXNwb25zZSA9PT0gJ29iamVjdCcgJiYgcmVxdWVzdC50cmlnZ2VyTmFtZSA9PT0gVHlwZXMuYWZ0ZXJTYXZlKSB7XG4gICAgICAgIHJldHVybiByZXNvbHZlKHJlc3BvbnNlKTtcbiAgICAgIH1cbiAgICAgIGlmIChyZXF1ZXN0LnRyaWdnZXJOYW1lID09PSBUeXBlcy5hZnRlclNhdmUpIHtcbiAgICAgICAgcmV0dXJuIHJlc29sdmUoKTtcbiAgICAgIH1cbiAgICAgIHJlc3BvbnNlID0ge307XG4gICAgICBpZiAocmVxdWVzdC50cmlnZ2VyTmFtZSA9PT0gVHlwZXMuYmVmb3JlU2F2ZSkge1xuICAgICAgICByZXNwb25zZVsnb2JqZWN0J10gPSByZXF1ZXN0Lm9iamVjdC5fZ2V0U2F2ZUpTT04oKTtcbiAgICAgICAgcmVzcG9uc2VbJ29iamVjdCddWydvYmplY3RJZCddID0gcmVxdWVzdC5vYmplY3QuaWQ7XG4gICAgICB9XG4gICAgICByZXR1cm4gcmVzb2x2ZShyZXNwb25zZSk7XG4gICAgfSxcbiAgICBlcnJvcjogZnVuY3Rpb24gKGVycm9yKSB7XG4gICAgICBjb25zdCBlID0gcmVzb2x2ZUVycm9yKGVycm9yLCB7XG4gICAgICAgIGNvZGU6IFBhcnNlLkVycm9yLlNDUklQVF9GQUlMRUQsXG4gICAgICAgIG1lc3NhZ2U6ICdTY3JpcHQgZmFpbGVkLiBVbmtub3duIGVycm9yLicsXG4gICAgICB9KTtcbiAgICAgIHJlamVjdChlKTtcbiAgICB9LFxuICB9O1xufVxuXG5mdW5jdGlvbiB1c2VySWRGb3JMb2coYXV0aCkge1xuICByZXR1cm4gYXV0aCAmJiBhdXRoLnVzZXIgPyBhdXRoLnVzZXIuaWQgOiB1bmRlZmluZWQ7XG59XG5cbmZ1bmN0aW9uIGxvZ1RyaWdnZXJBZnRlckhvb2sodHJpZ2dlclR5cGUsIGNsYXNzTmFtZSwgaW5wdXQsIGF1dGgpIHtcbiAgY29uc3QgY2xlYW5JbnB1dCA9IGxvZ2dlci50cnVuY2F0ZUxvZ01lc3NhZ2UoSlNPTi5zdHJpbmdpZnkoaW5wdXQpKTtcbiAgbG9nZ2VyLmluZm8oXG4gICAgYCR7dHJpZ2dlclR5cGV9IHRyaWdnZXJlZCBmb3IgJHtjbGFzc05hbWV9IGZvciB1c2VyICR7dXNlcklkRm9yTG9nKFxuICAgICAgYXV0aFxuICAgICl9OlxcbiAgSW5wdXQ6ICR7Y2xlYW5JbnB1dH1gLFxuICAgIHtcbiAgICAgIGNsYXNzTmFtZSxcbiAgICAgIHRyaWdnZXJUeXBlLFxuICAgICAgdXNlcjogdXNlcklkRm9yTG9nKGF1dGgpLFxuICAgIH1cbiAgKTtcbn1cblxuZnVuY3Rpb24gbG9nVHJpZ2dlclN1Y2Nlc3NCZWZvcmVIb29rKHRyaWdnZXJUeXBlLCBjbGFzc05hbWUsIGlucHV0LCByZXN1bHQsIGF1dGgpIHtcbiAgY29uc3QgY2xlYW5JbnB1dCA9IGxvZ2dlci50cnVuY2F0ZUxvZ01lc3NhZ2UoSlNPTi5zdHJpbmdpZnkoaW5wdXQpKTtcbiAgY29uc3QgY2xlYW5SZXN1bHQgPSBsb2dnZXIudHJ1bmNhdGVMb2dNZXNzYWdlKEpTT04uc3RyaW5naWZ5KHJlc3VsdCkpO1xuICBsb2dnZXIuaW5mbyhcbiAgICBgJHt0cmlnZ2VyVHlwZX0gdHJpZ2dlcmVkIGZvciAke2NsYXNzTmFtZX0gZm9yIHVzZXIgJHt1c2VySWRGb3JMb2coXG4gICAgICBhdXRoXG4gICAgKX06XFxuICBJbnB1dDogJHtjbGVhbklucHV0fVxcbiAgUmVzdWx0OiAke2NsZWFuUmVzdWx0fWAsXG4gICAge1xuICAgICAgY2xhc3NOYW1lLFxuICAgICAgdHJpZ2dlclR5cGUsXG4gICAgICB1c2VyOiB1c2VySWRGb3JMb2coYXV0aCksXG4gICAgfVxuICApO1xufVxuXG5mdW5jdGlvbiBsb2dUcmlnZ2VyRXJyb3JCZWZvcmVIb29rKHRyaWdnZXJUeXBlLCBjbGFzc05hbWUsIGlucHV0LCBhdXRoLCBlcnJvcikge1xuICBjb25zdCBjbGVhbklucHV0ID0gbG9nZ2VyLnRydW5jYXRlTG9nTWVzc2FnZShKU09OLnN0cmluZ2lmeShpbnB1dCkpO1xuICBsb2dnZXIuZXJyb3IoXG4gICAgYCR7dHJpZ2dlclR5cGV9IGZhaWxlZCBmb3IgJHtjbGFzc05hbWV9IGZvciB1c2VyICR7dXNlcklkRm9yTG9nKFxuICAgICAgYXV0aFxuICAgICl9OlxcbiAgSW5wdXQ6ICR7Y2xlYW5JbnB1dH1cXG4gIEVycm9yOiAke0pTT04uc3RyaW5naWZ5KGVycm9yKX1gLFxuICAgIHtcbiAgICAgIGNsYXNzTmFtZSxcbiAgICAgIHRyaWdnZXJUeXBlLFxuICAgICAgZXJyb3IsXG4gICAgICB1c2VyOiB1c2VySWRGb3JMb2coYXV0aCksXG4gICAgfVxuICApO1xufVxuXG5leHBvcnQgZnVuY3Rpb24gbWF5YmVSdW5BZnRlckZpbmRUcmlnZ2VyKFxuICB0cmlnZ2VyVHlwZSxcbiAgYXV0aCxcbiAgY2xhc3NOYW1lLFxuICBvYmplY3RzLFxuICBjb25maWcsXG4gIHF1ZXJ5LFxuICBjb250ZXh0XG4pIHtcbiAgcmV0dXJuIG5ldyBQcm9taXNlKChyZXNvbHZlLCByZWplY3QpID0+IHtcbiAgICBjb25zdCB0cmlnZ2VyID0gZ2V0VHJpZ2dlcihjbGFzc05hbWUsIHRyaWdnZXJUeXBlLCBjb25maWcuYXBwbGljYXRpb25JZCk7XG4gICAgaWYgKCF0cmlnZ2VyKSB7XG4gICAgICByZXR1cm4gcmVzb2x2ZSgpO1xuICAgIH1cbiAgICBjb25zdCByZXF1ZXN0ID0gZ2V0UmVxdWVzdE9iamVjdCh0cmlnZ2VyVHlwZSwgYXV0aCwgbnVsbCwgbnVsbCwgY29uZmlnLCBjb250ZXh0KTtcbiAgICBpZiAocXVlcnkpIHtcbiAgICAgIHJlcXVlc3QucXVlcnkgPSBxdWVyeTtcbiAgICB9XG4gICAgY29uc3QgeyBzdWNjZXNzLCBlcnJvciB9ID0gZ2V0UmVzcG9uc2VPYmplY3QoXG4gICAgICByZXF1ZXN0LFxuICAgICAgb2JqZWN0ID0+IHtcbiAgICAgICAgcmVzb2x2ZShvYmplY3QpO1xuICAgICAgfSxcbiAgICAgIGVycm9yID0+IHtcbiAgICAgICAgcmVqZWN0KGVycm9yKTtcbiAgICAgIH1cbiAgICApO1xuICAgIGxvZ1RyaWdnZXJTdWNjZXNzQmVmb3JlSG9vayh0cmlnZ2VyVHlwZSwgY2xhc3NOYW1lLCAnQWZ0ZXJGaW5kJywgSlNPTi5zdHJpbmdpZnkob2JqZWN0cyksIGF1dGgpO1xuICAgIHJlcXVlc3Qub2JqZWN0cyA9IG9iamVjdHMubWFwKG9iamVjdCA9PiB7XG4gICAgICAvL3NldHRpbmcgdGhlIGNsYXNzIG5hbWUgdG8gdHJhbnNmb3JtIGludG8gcGFyc2Ugb2JqZWN0XG4gICAgICBvYmplY3QuY2xhc3NOYW1lID0gY2xhc3NOYW1lO1xuICAgICAgcmV0dXJuIFBhcnNlLk9iamVjdC5mcm9tSlNPTihvYmplY3QpO1xuICAgIH0pO1xuICAgIHJldHVybiBQcm9taXNlLnJlc29sdmUoKVxuICAgICAgLnRoZW4oKCkgPT4ge1xuICAgICAgICByZXR1cm4gbWF5YmVSdW5WYWxpZGF0b3IocmVxdWVzdCwgYCR7dHJpZ2dlclR5cGV9LiR7Y2xhc3NOYW1lfWAsIGF1dGgpO1xuICAgICAgfSlcbiAgICAgIC50aGVuKCgpID0+IHtcbiAgICAgICAgaWYgKHJlcXVlc3Quc2tpcFdpdGhNYXN0ZXJLZXkpIHtcbiAgICAgICAgICByZXR1cm4gcmVxdWVzdC5vYmplY3RzO1xuICAgICAgICB9XG4gICAgICAgIGNvbnN0IHJlc3BvbnNlID0gdHJpZ2dlcihyZXF1ZXN0KTtcbiAgICAgICAgaWYgKHJlc3BvbnNlICYmIHR5cGVvZiByZXNwb25zZS50aGVuID09PSAnZnVuY3Rpb24nKSB7XG4gICAgICAgICAgcmV0dXJuIHJlc3BvbnNlLnRoZW4ocmVzdWx0cyA9PiB7XG4gICAgICAgICAgICByZXR1cm4gcmVzdWx0cztcbiAgICAgICAgICB9KTtcbiAgICAgICAgfVxuICAgICAgICByZXR1cm4gcmVzcG9uc2U7XG4gICAgICB9KVxuICAgICAgLnRoZW4oc3VjY2VzcywgZXJyb3IpO1xuICB9KS50aGVuKHJlc3VsdHMgPT4ge1xuICAgIGxvZ1RyaWdnZXJBZnRlckhvb2sodHJpZ2dlclR5cGUsIGNsYXNzTmFtZSwgSlNPTi5zdHJpbmdpZnkocmVzdWx0cyksIGF1dGgpO1xuICAgIHJldHVybiByZXN1bHRzO1xuICB9KTtcbn1cblxuZXhwb3J0IGZ1bmN0aW9uIG1heWJlUnVuUXVlcnlUcmlnZ2VyKFxuICB0cmlnZ2VyVHlwZSxcbiAgY2xhc3NOYW1lLFxuICByZXN0V2hlcmUsXG4gIHJlc3RPcHRpb25zLFxuICBjb25maWcsXG4gIGF1dGgsXG4gIGNvbnRleHQsXG4gIGlzR2V0XG4pIHtcbiAgY29uc3QgdHJpZ2dlciA9IGdldFRyaWdnZXIoY2xhc3NOYW1lLCB0cmlnZ2VyVHlwZSwgY29uZmlnLmFwcGxpY2F0aW9uSWQpO1xuICBpZiAoIXRyaWdnZXIpIHtcbiAgICByZXR1cm4gUHJvbWlzZS5yZXNvbHZlKHtcbiAgICAgIHJlc3RXaGVyZSxcbiAgICAgIHJlc3RPcHRpb25zLFxuICAgIH0pO1xuICB9XG4gIGNvbnN0IGpzb24gPSBPYmplY3QuYXNzaWduKHt9LCByZXN0T3B0aW9ucyk7XG4gIGpzb24ud2hlcmUgPSByZXN0V2hlcmU7XG5cbiAgY29uc3QgcGFyc2VRdWVyeSA9IG5ldyBQYXJzZS5RdWVyeShjbGFzc05hbWUpO1xuICBwYXJzZVF1ZXJ5LndpdGhKU09OKGpzb24pO1xuXG4gIGxldCBjb3VudCA9IGZhbHNlO1xuICBpZiAocmVzdE9wdGlvbnMpIHtcbiAgICBjb3VudCA9ICEhcmVzdE9wdGlvbnMuY291bnQ7XG4gIH1cbiAgY29uc3QgcmVxdWVzdE9iamVjdCA9IGdldFJlcXVlc3RRdWVyeU9iamVjdChcbiAgICB0cmlnZ2VyVHlwZSxcbiAgICBhdXRoLFxuICAgIHBhcnNlUXVlcnksXG4gICAgY291bnQsXG4gICAgY29uZmlnLFxuICAgIGNvbnRleHQsXG4gICAgaXNHZXRcbiAgKTtcbiAgcmV0dXJuIFByb21pc2UucmVzb2x2ZSgpXG4gICAgLnRoZW4oKCkgPT4ge1xuICAgICAgcmV0dXJuIG1heWJlUnVuVmFsaWRhdG9yKHJlcXVlc3RPYmplY3QsIGAke3RyaWdnZXJUeXBlfS4ke2NsYXNzTmFtZX1gLCBhdXRoKTtcbiAgICB9KVxuICAgIC50aGVuKCgpID0+IHtcbiAgICAgIGlmIChyZXF1ZXN0T2JqZWN0LnNraXBXaXRoTWFzdGVyS2V5KSB7XG4gICAgICAgIHJldHVybiByZXF1ZXN0T2JqZWN0LnF1ZXJ5O1xuICAgICAgfVxuICAgICAgcmV0dXJuIHRyaWdnZXIocmVxdWVzdE9iamVjdCk7XG4gICAgfSlcbiAgICAudGhlbihcbiAgICAgIHJlc3VsdCA9PiB7XG4gICAgICAgIGxldCBxdWVyeVJlc3VsdCA9IHBhcnNlUXVlcnk7XG4gICAgICAgIGlmIChyZXN1bHQgJiYgcmVzdWx0IGluc3RhbmNlb2YgUGFyc2UuUXVlcnkpIHtcbiAgICAgICAgICBxdWVyeVJlc3VsdCA9IHJlc3VsdDtcbiAgICAgICAgfVxuICAgICAgICBjb25zdCBqc29uUXVlcnkgPSBxdWVyeVJlc3VsdC50b0pTT04oKTtcbiAgICAgICAgaWYgKGpzb25RdWVyeS53aGVyZSkge1xuICAgICAgICAgIHJlc3RXaGVyZSA9IGpzb25RdWVyeS53aGVyZTtcbiAgICAgICAgfVxuICAgICAgICBpZiAoanNvblF1ZXJ5LmxpbWl0KSB7XG4gICAgICAgICAgcmVzdE9wdGlvbnMgPSByZXN0T3B0aW9ucyB8fCB7fTtcbiAgICAgICAgICByZXN0T3B0aW9ucy5saW1pdCA9IGpzb25RdWVyeS5saW1pdDtcbiAgICAgICAgfVxuICAgICAgICBpZiAoanNvblF1ZXJ5LnNraXApIHtcbiAgICAgICAgICByZXN0T3B0aW9ucyA9IHJlc3RPcHRpb25zIHx8IHt9O1xuICAgICAgICAgIHJlc3RPcHRpb25zLnNraXAgPSBqc29uUXVlcnkuc2tpcDtcbiAgICAgICAgfVxuICAgICAgICBpZiAoanNvblF1ZXJ5LmluY2x1ZGUpIHtcbiAgICAgICAgICByZXN0T3B0aW9ucyA9IHJlc3RPcHRpb25zIHx8IHt9O1xuICAgICAgICAgIHJlc3RPcHRpb25zLmluY2x1ZGUgPSBqc29uUXVlcnkuaW5jbHVkZTtcbiAgICAgICAgfVxuICAgICAgICBpZiAoanNvblF1ZXJ5LmV4Y2x1ZGVLZXlzKSB7XG4gICAgICAgICAgcmVzdE9wdGlvbnMgPSByZXN0T3B0aW9ucyB8fCB7fTtcbiAgICAgICAgICByZXN0T3B0aW9ucy5leGNsdWRlS2V5cyA9IGpzb25RdWVyeS5leGNsdWRlS2V5cztcbiAgICAgICAgfVxuICAgICAgICBpZiAoanNvblF1ZXJ5LmV4cGxhaW4pIHtcbiAgICAgICAgICByZXN0T3B0aW9ucyA9IHJlc3RPcHRpb25zIHx8IHt9O1xuICAgICAgICAgIHJlc3RPcHRpb25zLmV4cGxhaW4gPSBqc29uUXVlcnkuZXhwbGFpbjtcbiAgICAgICAgfVxuICAgICAgICBpZiAoanNvblF1ZXJ5LmtleXMpIHtcbiAgICAgICAgICByZXN0T3B0aW9ucyA9IHJlc3RPcHRpb25zIHx8IHt9O1xuICAgICAgICAgIHJlc3RPcHRpb25zLmtleXMgPSBqc29uUXVlcnkua2V5cztcbiAgICAgICAgfVxuICAgICAgICBpZiAoanNvblF1ZXJ5Lm9yZGVyKSB7XG4gICAgICAgICAgcmVzdE9wdGlvbnMgPSByZXN0T3B0aW9ucyB8fCB7fTtcbiAgICAgICAgICByZXN0T3B0aW9ucy5vcmRlciA9IGpzb25RdWVyeS5vcmRlcjtcbiAgICAgICAgfVxuICAgICAgICBpZiAoanNvblF1ZXJ5LmhpbnQpIHtcbiAgICAgICAgICByZXN0T3B0aW9ucyA9IHJlc3RPcHRpb25zIHx8IHt9O1xuICAgICAgICAgIHJlc3RPcHRpb25zLmhpbnQgPSBqc29uUXVlcnkuaGludDtcbiAgICAgICAgfVxuICAgICAgICBpZiAocmVxdWVzdE9iamVjdC5yZWFkUHJlZmVyZW5jZSkge1xuICAgICAgICAgIHJlc3RPcHRpb25zID0gcmVzdE9wdGlvbnMgfHwge307XG4gICAgICAgICAgcmVzdE9wdGlvbnMucmVhZFByZWZlcmVuY2UgPSByZXF1ZXN0T2JqZWN0LnJlYWRQcmVmZXJlbmNlO1xuICAgICAgICB9XG4gICAgICAgIGlmIChyZXF1ZXN0T2JqZWN0LmluY2x1ZGVSZWFkUHJlZmVyZW5jZSkge1xuICAgICAgICAgIHJlc3RPcHRpb25zID0gcmVzdE9wdGlvbnMgfHwge307XG4gICAgICAgICAgcmVzdE9wdGlvbnMuaW5jbHVkZVJlYWRQcmVmZXJlbmNlID0gcmVxdWVzdE9iamVjdC5pbmNsdWRlUmVhZFByZWZlcmVuY2U7XG4gICAgICAgIH1cbiAgICAgICAgaWYgKHJlcXVlc3RPYmplY3Quc3VicXVlcnlSZWFkUHJlZmVyZW5jZSkge1xuICAgICAgICAgIHJlc3RPcHRpb25zID0gcmVzdE9wdGlvbnMgfHwge307XG4gICAgICAgICAgcmVzdE9wdGlvbnMuc3VicXVlcnlSZWFkUHJlZmVyZW5jZSA9IHJlcXVlc3RPYmplY3Quc3VicXVlcnlSZWFkUHJlZmVyZW5jZTtcbiAgICAgICAgfVxuICAgICAgICByZXR1cm4ge1xuICAgICAgICAgIHJlc3RXaGVyZSxcbiAgICAgICAgICByZXN0T3B0aW9ucyxcbiAgICAgICAgfTtcbiAgICAgIH0sXG4gICAgICBlcnIgPT4ge1xuICAgICAgICBjb25zdCBlcnJvciA9IHJlc29sdmVFcnJvcihlcnIsIHtcbiAgICAgICAgICBjb2RlOiBQYXJzZS5FcnJvci5TQ1JJUFRfRkFJTEVELFxuICAgICAgICAgIG1lc3NhZ2U6ICdTY3JpcHQgZmFpbGVkLiBVbmtub3duIGVycm9yLicsXG4gICAgICAgIH0pO1xuICAgICAgICB0aHJvdyBlcnJvcjtcbiAgICAgIH1cbiAgICApO1xufVxuXG5leHBvcnQgZnVuY3Rpb24gcmVzb2x2ZUVycm9yKG1lc3NhZ2UsIGRlZmF1bHRPcHRzKSB7XG4gIGlmICghZGVmYXVsdE9wdHMpIHtcbiAgICBkZWZhdWx0T3B0cyA9IHt9O1xuICB9XG4gIGlmICghbWVzc2FnZSkge1xuICAgIHJldHVybiBuZXcgUGFyc2UuRXJyb3IoXG4gICAgICBkZWZhdWx0T3B0cy5jb2RlIHx8IFBhcnNlLkVycm9yLlNDUklQVF9GQUlMRUQsXG4gICAgICBkZWZhdWx0T3B0cy5tZXNzYWdlIHx8ICdTY3JpcHQgZmFpbGVkLidcbiAgICApO1xuICB9XG4gIGlmIChtZXNzYWdlIGluc3RhbmNlb2YgUGFyc2UuRXJyb3IpIHtcbiAgICByZXR1cm4gbWVzc2FnZTtcbiAgfVxuXG4gIGNvbnN0IGNvZGUgPSBkZWZhdWx0T3B0cy5jb2RlIHx8IFBhcnNlLkVycm9yLlNDUklQVF9GQUlMRUQ7XG4gIC8vIElmIGl0J3MgYW4gZXJyb3IsIG1hcmsgaXQgYXMgYSBzY3JpcHQgZmFpbGVkXG4gIGlmICh0eXBlb2YgbWVzc2FnZSA9PT0gJ3N0cmluZycpIHtcbiAgICByZXR1cm4gbmV3IFBhcnNlLkVycm9yKGNvZGUsIG1lc3NhZ2UpO1xuICB9XG4gIGNvbnN0IGVycm9yID0gbmV3IFBhcnNlLkVycm9yKGNvZGUsIG1lc3NhZ2UubWVzc2FnZSB8fCBtZXNzYWdlKTtcbiAgaWYgKG1lc3NhZ2UgaW5zdGFuY2VvZiBFcnJvcikge1xuICAgIGVycm9yLnN0YWNrID0gbWVzc2FnZS5zdGFjaztcbiAgfVxuICByZXR1cm4gZXJyb3I7XG59XG5leHBvcnQgZnVuY3Rpb24gbWF5YmVSdW5WYWxpZGF0b3IocmVxdWVzdCwgZnVuY3Rpb25OYW1lLCBhdXRoKSB7XG4gIGNvbnN0IHRoZVZhbGlkYXRvciA9IGdldFZhbGlkYXRvcihmdW5jdGlvbk5hbWUsIFBhcnNlLmFwcGxpY2F0aW9uSWQpO1xuICBpZiAoIXRoZVZhbGlkYXRvcikge1xuICAgIHJldHVybjtcbiAgfVxuICBpZiAodHlwZW9mIHRoZVZhbGlkYXRvciA9PT0gJ29iamVjdCcgJiYgdGhlVmFsaWRhdG9yLnNraXBXaXRoTWFzdGVyS2V5ICYmIHJlcXVlc3QubWFzdGVyKSB7XG4gICAgcmVxdWVzdC5za2lwV2l0aE1hc3RlcktleSA9IHRydWU7XG4gIH1cbiAgcmV0dXJuIG5ldyBQcm9taXNlKChyZXNvbHZlLCByZWplY3QpID0+IHtcbiAgICByZXR1cm4gUHJvbWlzZS5yZXNvbHZlKClcbiAgICAgIC50aGVuKCgpID0+IHtcbiAgICAgICAgcmV0dXJuIHR5cGVvZiB0aGVWYWxpZGF0b3IgPT09ICdvYmplY3QnXG4gICAgICAgICAgPyBidWlsdEluVHJpZ2dlclZhbGlkYXRvcih0aGVWYWxpZGF0b3IsIHJlcXVlc3QsIGF1dGgpXG4gICAgICAgICAgOiB0aGVWYWxpZGF0b3IocmVxdWVzdCk7XG4gICAgICB9KVxuICAgICAgLnRoZW4oKCkgPT4ge1xuICAgICAgICByZXNvbHZlKCk7XG4gICAgICB9KVxuICAgICAgLmNhdGNoKGUgPT4ge1xuICAgICAgICBjb25zdCBlcnJvciA9IHJlc29sdmVFcnJvcihlLCB7XG4gICAgICAgICAgY29kZTogUGFyc2UuRXJyb3IuVkFMSURBVElPTl9FUlJPUixcbiAgICAgICAgICBtZXNzYWdlOiAnVmFsaWRhdGlvbiBmYWlsZWQuJyxcbiAgICAgICAgfSk7XG4gICAgICAgIHJlamVjdChlcnJvcik7XG4gICAgICB9KTtcbiAgfSk7XG59XG5hc3luYyBmdW5jdGlvbiBidWlsdEluVHJpZ2dlclZhbGlkYXRvcihvcHRpb25zLCByZXF1ZXN0LCBhdXRoKSB7XG4gIGlmIChyZXF1ZXN0Lm1hc3RlciAmJiAhb3B0aW9ucy52YWxpZGF0ZU1hc3RlcktleSkge1xuICAgIHJldHVybjtcbiAgfVxuICBsZXQgcmVxVXNlciA9IHJlcXVlc3QudXNlcjtcbiAgaWYgKFxuICAgICFyZXFVc2VyICYmXG4gICAgcmVxdWVzdC5vYmplY3QgJiZcbiAgICByZXF1ZXN0Lm9iamVjdC5jbGFzc05hbWUgPT09ICdfVXNlcicgJiZcbiAgICAhcmVxdWVzdC5vYmplY3QuZXhpc3RlZCgpXG4gICkge1xuICAgIHJlcVVzZXIgPSByZXF1ZXN0Lm9iamVjdDtcbiAgfVxuICBpZiAoXG4gICAgKG9wdGlvbnMucmVxdWlyZVVzZXIgfHwgb3B0aW9ucy5yZXF1aXJlQW55VXNlclJvbGVzIHx8IG9wdGlvbnMucmVxdWlyZUFsbFVzZXJSb2xlcykgJiZcbiAgICAhcmVxVXNlclxuICApIHtcbiAgICB0aHJvdyAnVmFsaWRhdGlvbiBmYWlsZWQuIFBsZWFzZSBsb2dpbiB0byBjb250aW51ZS4nO1xuICB9XG4gIGlmIChvcHRpb25zLnJlcXVpcmVNYXN0ZXIgJiYgIXJlcXVlc3QubWFzdGVyKSB7XG4gICAgdGhyb3cgJ1ZhbGlkYXRpb24gZmFpbGVkLiBNYXN0ZXIga2V5IGlzIHJlcXVpcmVkIHRvIGNvbXBsZXRlIHRoaXMgcmVxdWVzdC4nO1xuICB9XG4gIGxldCBwYXJhbXMgPSByZXF1ZXN0LnBhcmFtcyB8fCB7fTtcbiAgaWYgKHJlcXVlc3Qub2JqZWN0KSB7XG4gICAgcGFyYW1zID0gcmVxdWVzdC5vYmplY3QudG9KU09OKCk7XG4gIH1cbiAgY29uc3QgcmVxdWlyZWRQYXJhbSA9IGtleSA9PiB7XG4gICAgY29uc3QgdmFsdWUgPSBwYXJhbXNba2V5XTtcbiAgICBpZiAodmFsdWUgPT0gbnVsbCkge1xuICAgICAgdGhyb3cgYFZhbGlkYXRpb24gZmFpbGVkLiBQbGVhc2Ugc3BlY2lmeSBkYXRhIGZvciAke2tleX0uYDtcbiAgICB9XG4gIH07XG5cbiAgY29uc3QgdmFsaWRhdGVPcHRpb25zID0gYXN5bmMgKG9wdCwga2V5LCB2YWwpID0+IHtcbiAgICBsZXQgb3B0cyA9IG9wdC5vcHRpb25zO1xuICAgIGlmICh0eXBlb2Ygb3B0cyA9PT0gJ2Z1bmN0aW9uJykge1xuICAgICAgdHJ5IHtcbiAgICAgICAgY29uc3QgcmVzdWx0ID0gYXdhaXQgb3B0cyh2YWwpO1xuICAgICAgICBpZiAoIXJlc3VsdCAmJiByZXN1bHQgIT0gbnVsbCkge1xuICAgICAgICAgIHRocm93IG9wdC5lcnJvciB8fCBgVmFsaWRhdGlvbiBmYWlsZWQuIEludmFsaWQgdmFsdWUgZm9yICR7a2V5fS5gO1xuICAgICAgICB9XG4gICAgICB9IGNhdGNoIChlKSB7XG4gICAgICAgIGlmICghZSkge1xuICAgICAgICAgIHRocm93IG9wdC5lcnJvciB8fCBgVmFsaWRhdGlvbiBmYWlsZWQuIEludmFsaWQgdmFsdWUgZm9yICR7a2V5fS5gO1xuICAgICAgICB9XG5cbiAgICAgICAgdGhyb3cgb3B0LmVycm9yIHx8IGUubWVzc2FnZSB8fCBlO1xuICAgICAgfVxuICAgICAgcmV0dXJuO1xuICAgIH1cbiAgICBpZiAoIUFycmF5LmlzQXJyYXkob3B0cykpIHtcbiAgICAgIG9wdHMgPSBbb3B0Lm9wdGlvbnNdO1xuICAgIH1cblxuICAgIGlmICghb3B0cy5pbmNsdWRlcyh2YWwpKSB7XG4gICAgICB0aHJvdyAoXG4gICAgICAgIG9wdC5lcnJvciB8fCBgVmFsaWRhdGlvbiBmYWlsZWQuIEludmFsaWQgb3B0aW9uIGZvciAke2tleX0uIEV4cGVjdGVkOiAke29wdHMuam9pbignLCAnKX1gXG4gICAgICApO1xuICAgIH1cbiAgfTtcblxuICBjb25zdCBnZXRUeXBlID0gZm4gPT4ge1xuICAgIGNvbnN0IG1hdGNoID0gZm4gJiYgZm4udG9TdHJpbmcoKS5tYXRjaCgvXlxccypmdW5jdGlvbiAoXFx3KykvKTtcbiAgICByZXR1cm4gKG1hdGNoID8gbWF0Y2hbMV0gOiAnJykudG9Mb3dlckNhc2UoKTtcbiAgfTtcbiAgaWYgKEFycmF5LmlzQXJyYXkob3B0aW9ucy5maWVsZHMpKSB7XG4gICAgZm9yIChjb25zdCBrZXkgb2Ygb3B0aW9ucy5maWVsZHMpIHtcbiAgICAgIHJlcXVpcmVkUGFyYW0oa2V5KTtcbiAgICB9XG4gIH0gZWxzZSB7XG4gICAgY29uc3Qgb3B0aW9uUHJvbWlzZXMgPSBbXTtcbiAgICBmb3IgKGNvbnN0IGtleSBpbiBvcHRpb25zLmZpZWxkcykge1xuICAgICAgY29uc3Qgb3B0ID0gb3B0aW9ucy5maWVsZHNba2V5XTtcbiAgICAgIGxldCB2YWwgPSBwYXJhbXNba2V5XTtcbiAgICAgIGlmICh0eXBlb2Ygb3B0ID09PSAnc3RyaW5nJykge1xuICAgICAgICByZXF1aXJlZFBhcmFtKG9wdCk7XG4gICAgICB9XG4gICAgICBpZiAodHlwZW9mIG9wdCA9PT0gJ29iamVjdCcpIHtcbiAgICAgICAgaWYgKG9wdC5kZWZhdWx0ICE9IG51bGwgJiYgdmFsID09IG51bGwpIHtcbiAgICAgICAgICB2YWwgPSBvcHQuZGVmYXVsdDtcbiAgICAgICAgICBwYXJhbXNba2V5XSA9IHZhbDtcbiAgICAgICAgICBpZiAocmVxdWVzdC5vYmplY3QpIHtcbiAgICAgICAgICAgIHJlcXVlc3Qub2JqZWN0LnNldChrZXksIHZhbCk7XG4gICAgICAgICAgfVxuICAgICAgICB9XG4gICAgICAgIGlmIChvcHQuY29uc3RhbnQgJiYgcmVxdWVzdC5vYmplY3QpIHtcbiAgICAgICAgICBpZiAocmVxdWVzdC5vcmlnaW5hbCkge1xuICAgICAgICAgICAgcmVxdWVzdC5vYmplY3QucmV2ZXJ0KGtleSk7XG4gICAgICAgICAgfSBlbHNlIGlmIChvcHQuZGVmYXVsdCAhPSBudWxsKSB7XG4gICAgICAgICAgICByZXF1ZXN0Lm9iamVjdC5zZXQoa2V5LCBvcHQuZGVmYXVsdCk7XG4gICAgICAgICAgfVxuICAgICAgICB9XG4gICAgICAgIGlmIChvcHQucmVxdWlyZWQpIHtcbiAgICAgICAgICByZXF1aXJlZFBhcmFtKGtleSk7XG4gICAgICAgIH1cbiAgICAgICAgY29uc3Qgb3B0aW9uYWwgPSAhb3B0LnJlcXVpcmVkICYmIHZhbCA9PT0gdW5kZWZpbmVkO1xuICAgICAgICBpZiAoIW9wdGlvbmFsKSB7XG4gICAgICAgICAgaWYgKG9wdC50eXBlKSB7XG4gICAgICAgICAgICBjb25zdCB0eXBlID0gZ2V0VHlwZShvcHQudHlwZSk7XG4gICAgICAgICAgICBjb25zdCB2YWxUeXBlID0gQXJyYXkuaXNBcnJheSh2YWwpID8gJ2FycmF5JyA6IHR5cGVvZiB2YWw7XG4gICAgICAgICAgICBpZiAodmFsVHlwZSAhPT0gdHlwZSkge1xuICAgICAgICAgICAgICB0aHJvdyBgVmFsaWRhdGlvbiBmYWlsZWQuIEludmFsaWQgdHlwZSBmb3IgJHtrZXl9LiBFeHBlY3RlZDogJHt0eXBlfWA7XG4gICAgICAgICAgICB9XG4gICAgICAgICAgfVxuICAgICAgICAgIGlmIChvcHQub3B0aW9ucykge1xuICAgICAgICAgICAgb3B0aW9uUHJvbWlzZXMucHVzaCh2YWxpZGF0ZU9wdGlvbnMob3B0LCBrZXksIHZhbCkpO1xuICAgICAgICAgIH1cbiAgICAgICAgfVxuICAgICAgfVxuICAgIH1cbiAgICBhd2FpdCBQcm9taXNlLmFsbChvcHRpb25Qcm9taXNlcyk7XG4gIH1cbiAgbGV0IHVzZXJSb2xlcyA9IG9wdGlvbnMucmVxdWlyZUFueVVzZXJSb2xlcztcbiAgbGV0IHJlcXVpcmVBbGxSb2xlcyA9IG9wdGlvbnMucmVxdWlyZUFsbFVzZXJSb2xlcztcbiAgY29uc3QgcHJvbWlzZXMgPSBbUHJvbWlzZS5yZXNvbHZlKCksIFByb21pc2UucmVzb2x2ZSgpLCBQcm9taXNlLnJlc29sdmUoKV07XG4gIGlmICh1c2VyUm9sZXMgfHwgcmVxdWlyZUFsbFJvbGVzKSB7XG4gICAgcHJvbWlzZXNbMF0gPSBhdXRoLmdldFVzZXJSb2xlcygpO1xuICB9XG4gIGlmICh0eXBlb2YgdXNlclJvbGVzID09PSAnZnVuY3Rpb24nKSB7XG4gICAgcHJvbWlzZXNbMV0gPSB1c2VyUm9sZXMoKTtcbiAgfVxuICBpZiAodHlwZW9mIHJlcXVpcmVBbGxSb2xlcyA9PT0gJ2Z1bmN0aW9uJykge1xuICAgIHByb21pc2VzWzJdID0gcmVxdWlyZUFsbFJvbGVzKCk7XG4gIH1cbiAgY29uc3QgW3JvbGVzLCByZXNvbHZlZFVzZXJSb2xlcywgcmVzb2x2ZWRSZXF1aXJlQWxsXSA9IGF3YWl0IFByb21pc2UuYWxsKHByb21pc2VzKTtcbiAgaWYgKHJlc29sdmVkVXNlclJvbGVzICYmIEFycmF5LmlzQXJyYXkocmVzb2x2ZWRVc2VyUm9sZXMpKSB7XG4gICAgdXNlclJvbGVzID0gcmVzb2x2ZWRVc2VyUm9sZXM7XG4gIH1cbiAgaWYgKHJlc29sdmVkUmVxdWlyZUFsbCAmJiBBcnJheS5pc0FycmF5KHJlc29sdmVkUmVxdWlyZUFsbCkpIHtcbiAgICByZXF1aXJlQWxsUm9sZXMgPSByZXNvbHZlZFJlcXVpcmVBbGw7XG4gIH1cbiAgaWYgKHVzZXJSb2xlcykge1xuICAgIGNvbnN0IGhhc1JvbGUgPSB1c2VyUm9sZXMuc29tZShyZXF1aXJlZFJvbGUgPT4gcm9sZXMuaW5jbHVkZXMoYHJvbGU6JHtyZXF1aXJlZFJvbGV9YCkpO1xuICAgIGlmICghaGFzUm9sZSkge1xuICAgICAgdGhyb3cgYFZhbGlkYXRpb24gZmFpbGVkLiBVc2VyIGRvZXMgbm90IG1hdGNoIHRoZSByZXF1aXJlZCByb2xlcy5gO1xuICAgIH1cbiAgfVxuICBpZiAocmVxdWlyZUFsbFJvbGVzKSB7XG4gICAgZm9yIChjb25zdCByZXF1aXJlZFJvbGUgb2YgcmVxdWlyZUFsbFJvbGVzKSB7XG4gICAgICBpZiAoIXJvbGVzLmluY2x1ZGVzKGByb2xlOiR7cmVxdWlyZWRSb2xlfWApKSB7XG4gICAgICAgIHRocm93IGBWYWxpZGF0aW9uIGZhaWxlZC4gVXNlciBkb2VzIG5vdCBtYXRjaCBhbGwgdGhlIHJlcXVpcmVkIHJvbGVzLmA7XG4gICAgICB9XG4gICAgfVxuICB9XG4gIGNvbnN0IHVzZXJLZXlzID0gb3B0aW9ucy5yZXF1aXJlVXNlcktleXMgfHwgW107XG4gIGlmIChBcnJheS5pc0FycmF5KHVzZXJLZXlzKSkge1xuICAgIGZvciAoY29uc3Qga2V5IG9mIHVzZXJLZXlzKSB7XG4gICAgICBpZiAoIXJlcVVzZXIpIHtcbiAgICAgICAgdGhyb3cgJ1BsZWFzZSBsb2dpbiB0byBtYWtlIHRoaXMgcmVxdWVzdC4nO1xuICAgICAgfVxuXG4gICAgICBpZiAocmVxVXNlci5nZXQoa2V5KSA9PSBudWxsKSB7XG4gICAgICAgIHRocm93IGBWYWxpZGF0aW9uIGZhaWxlZC4gUGxlYXNlIHNldCBkYXRhIGZvciAke2tleX0gb24geW91ciBhY2NvdW50LmA7XG4gICAgICB9XG4gICAgfVxuICB9IGVsc2UgaWYgKHR5cGVvZiB1c2VyS2V5cyA9PT0gJ29iamVjdCcpIHtcbiAgICBjb25zdCBvcHRpb25Qcm9taXNlcyA9IFtdO1xuICAgIGZvciAoY29uc3Qga2V5IGluIG9wdGlvbnMucmVxdWlyZVVzZXJLZXlzKSB7XG4gICAgICBjb25zdCBvcHQgPSBvcHRpb25zLnJlcXVpcmVVc2VyS2V5c1trZXldO1xuICAgICAgaWYgKG9wdC5vcHRpb25zKSB7XG4gICAgICAgIG9wdGlvblByb21pc2VzLnB1c2godmFsaWRhdGVPcHRpb25zKG9wdCwga2V5LCByZXFVc2VyLmdldChrZXkpKSk7XG4gICAgICB9XG4gICAgfVxuICAgIGF3YWl0IFByb21pc2UuYWxsKG9wdGlvblByb21pc2VzKTtcbiAgfVxufVxuXG4vLyBUbyBiZSB1c2VkIGFzIHBhcnQgb2YgdGhlIHByb21pc2UgY2hhaW4gd2hlbiBzYXZpbmcvZGVsZXRpbmcgYW4gb2JqZWN0XG4vLyBXaWxsIHJlc29sdmUgc3VjY2Vzc2Z1bGx5IGlmIG5vIHRyaWdnZXIgaXMgY29uZmlndXJlZFxuLy8gUmVzb2x2ZXMgdG8gYW4gb2JqZWN0LCBlbXB0eSBvciBjb250YWluaW5nIGFuIG9iamVjdCBrZXkuIEEgYmVmb3JlU2F2ZVxuLy8gdHJpZ2dlciB3aWxsIHNldCB0aGUgb2JqZWN0IGtleSB0byB0aGUgcmVzdCBmb3JtYXQgb2JqZWN0IHRvIHNhdmUuXG4vLyBvcmlnaW5hbFBhcnNlT2JqZWN0IGlzIG9wdGlvbmFsLCB3ZSBvbmx5IG5lZWQgdGhhdCBmb3IgYmVmb3JlL2FmdGVyU2F2ZSBmdW5jdGlvbnNcbmV4cG9ydCBmdW5jdGlvbiBtYXliZVJ1blRyaWdnZXIoXG4gIHRyaWdnZXJUeXBlLFxuICBhdXRoLFxuICBwYXJzZU9iamVjdCxcbiAgb3JpZ2luYWxQYXJzZU9iamVjdCxcbiAgY29uZmlnLFxuICBjb250ZXh0XG4pIHtcbiAgaWYgKCFwYXJzZU9iamVjdCkge1xuICAgIHJldHVybiBQcm9taXNlLnJlc29sdmUoe30pO1xuICB9XG4gIHJldHVybiBuZXcgUHJvbWlzZShmdW5jdGlvbiAocmVzb2x2ZSwgcmVqZWN0KSB7XG4gICAgdmFyIHRyaWdnZXIgPSBnZXRUcmlnZ2VyKHBhcnNlT2JqZWN0LmNsYXNzTmFtZSwgdHJpZ2dlclR5cGUsIGNvbmZpZy5hcHBsaWNhdGlvbklkKTtcbiAgICBpZiAoIXRyaWdnZXIpIHJldHVybiByZXNvbHZlKCk7XG4gICAgdmFyIHJlcXVlc3QgPSBnZXRSZXF1ZXN0T2JqZWN0KFxuICAgICAgdHJpZ2dlclR5cGUsXG4gICAgICBhdXRoLFxuICAgICAgcGFyc2VPYmplY3QsXG4gICAgICBvcmlnaW5hbFBhcnNlT2JqZWN0LFxuICAgICAgY29uZmlnLFxuICAgICAgY29udGV4dFxuICAgICk7XG4gICAgdmFyIHsgc3VjY2VzcywgZXJyb3IgfSA9IGdldFJlc3BvbnNlT2JqZWN0KFxuICAgICAgcmVxdWVzdCxcbiAgICAgIG9iamVjdCA9PiB7XG4gICAgICAgIGxvZ1RyaWdnZXJTdWNjZXNzQmVmb3JlSG9vayhcbiAgICAgICAgICB0cmlnZ2VyVHlwZSxcbiAgICAgICAgICBwYXJzZU9iamVjdC5jbGFzc05hbWUsXG4gICAgICAgICAgcGFyc2VPYmplY3QudG9KU09OKCksXG4gICAgICAgICAgb2JqZWN0LFxuICAgICAgICAgIGF1dGhcbiAgICAgICAgKTtcbiAgICAgICAgaWYgKFxuICAgICAgICAgIHRyaWdnZXJUeXBlID09PSBUeXBlcy5iZWZvcmVTYXZlIHx8XG4gICAgICAgICAgdHJpZ2dlclR5cGUgPT09IFR5cGVzLmFmdGVyU2F2ZSB8fFxuICAgICAgICAgIHRyaWdnZXJUeXBlID09PSBUeXBlcy5iZWZvcmVEZWxldGUgfHxcbiAgICAgICAgICB0cmlnZ2VyVHlwZSA9PT0gVHlwZXMuYWZ0ZXJEZWxldGVcbiAgICAgICAgKSB7XG4gICAgICAgICAgT2JqZWN0LmFzc2lnbihjb250ZXh0LCByZXF1ZXN0LmNvbnRleHQpO1xuICAgICAgICB9XG4gICAgICAgIHJlc29sdmUob2JqZWN0KTtcbiAgICAgIH0sXG4gICAgICBlcnJvciA9PiB7XG4gICAgICAgIGxvZ1RyaWdnZXJFcnJvckJlZm9yZUhvb2soXG4gICAgICAgICAgdHJpZ2dlclR5cGUsXG4gICAgICAgICAgcGFyc2VPYmplY3QuY2xhc3NOYW1lLFxuICAgICAgICAgIHBhcnNlT2JqZWN0LnRvSlNPTigpLFxuICAgICAgICAgIGF1dGgsXG4gICAgICAgICAgZXJyb3JcbiAgICAgICAgKTtcbiAgICAgICAgcmVqZWN0KGVycm9yKTtcbiAgICAgIH1cbiAgICApO1xuXG4gICAgLy8gQWZ0ZXJTYXZlIGFuZCBhZnRlckRlbGV0ZSB0cmlnZ2VycyBjYW4gcmV0dXJuIGEgcHJvbWlzZSwgd2hpY2ggaWYgdGhleVxuICAgIC8vIGRvLCBuZWVkcyB0byBiZSByZXNvbHZlZCBiZWZvcmUgdGhpcyBwcm9taXNlIGlzIHJlc29sdmVkLFxuICAgIC8vIHNvIHRyaWdnZXIgZXhlY3V0aW9uIGlzIHN5bmNlZCB3aXRoIFJlc3RXcml0ZS5leGVjdXRlKCkgY2FsbC5cbiAgICAvLyBJZiB0cmlnZ2VycyBkbyBub3QgcmV0dXJuIGEgcHJvbWlzZSwgdGhleSBjYW4gcnVuIGFzeW5jIGNvZGUgcGFyYWxsZWxcbiAgICAvLyB0byB0aGUgUmVzdFdyaXRlLmV4ZWN1dGUoKSBjYWxsLlxuICAgIHJldHVybiBQcm9taXNlLnJlc29sdmUoKVxuICAgICAgLnRoZW4oKCkgPT4ge1xuICAgICAgICByZXR1cm4gbWF5YmVSdW5WYWxpZGF0b3IocmVxdWVzdCwgYCR7dHJpZ2dlclR5cGV9LiR7cGFyc2VPYmplY3QuY2xhc3NOYW1lfWAsIGF1dGgpO1xuICAgICAgfSlcbiAgICAgIC50aGVuKCgpID0+IHtcbiAgICAgICAgaWYgKHJlcXVlc3Quc2tpcFdpdGhNYXN0ZXJLZXkpIHtcbiAgICAgICAgICByZXR1cm4gUHJvbWlzZS5yZXNvbHZlKCk7XG4gICAgICAgIH1cbiAgICAgICAgY29uc3QgcHJvbWlzZSA9IHRyaWdnZXIocmVxdWVzdCk7XG4gICAgICAgIGlmIChcbiAgICAgICAgICB0cmlnZ2VyVHlwZSA9PT0gVHlwZXMuYWZ0ZXJTYXZlIHx8XG4gICAgICAgICAgdHJpZ2dlclR5cGUgPT09IFR5cGVzLmFmdGVyRGVsZXRlIHx8XG4gICAgICAgICAgdHJpZ2dlclR5cGUgPT09IFR5cGVzLmFmdGVyTG9naW5cbiAgICAgICAgKSB7XG4gICAgICAgICAgbG9nVHJpZ2dlckFmdGVySG9vayh0cmlnZ2VyVHlwZSwgcGFyc2VPYmplY3QuY2xhc3NOYW1lLCBwYXJzZU9iamVjdC50b0pTT04oKSwgYXV0aCk7XG4gICAgICAgIH1cbiAgICAgICAgLy8gYmVmb3JlU2F2ZSBpcyBleHBlY3RlZCB0byByZXR1cm4gbnVsbCAobm90aGluZylcbiAgICAgICAgaWYgKHRyaWdnZXJUeXBlID09PSBUeXBlcy5iZWZvcmVTYXZlKSB7XG4gICAgICAgICAgaWYgKHByb21pc2UgJiYgdHlwZW9mIHByb21pc2UudGhlbiA9PT0gJ2Z1bmN0aW9uJykge1xuICAgICAgICAgICAgcmV0dXJuIHByb21pc2UudGhlbihyZXNwb25zZSA9PiB7XG4gICAgICAgICAgICAgIC8vIHJlc3BvbnNlLm9iamVjdCBtYXkgY29tZSBmcm9tIGV4cHJlc3Mgcm91dGluZyBiZWZvcmUgaG9va1xuICAgICAgICAgICAgICBpZiAocmVzcG9uc2UgJiYgcmVzcG9uc2Uub2JqZWN0KSB7XG4gICAgICAgICAgICAgICAgcmV0dXJuIHJlc3BvbnNlO1xuICAgICAgICAgICAgICB9XG4gICAgICAgICAgICAgIHJldHVybiBudWxsO1xuICAgICAgICAgICAgfSk7XG4gICAgICAgICAgfVxuICAgICAgICAgIHJldHVybiBudWxsO1xuICAgICAgICB9XG5cbiAgICAgICAgcmV0dXJuIHByb21pc2U7XG4gICAgICB9KVxuICAgICAgLnRoZW4oc3VjY2VzcywgZXJyb3IpO1xuICB9KTtcbn1cblxuLy8gQ29udmVydHMgYSBSRVNULWZvcm1hdCBvYmplY3QgdG8gYSBQYXJzZS5PYmplY3Rcbi8vIGRhdGEgaXMgZWl0aGVyIGNsYXNzTmFtZSBvciBhbiBvYmplY3RcbmV4cG9ydCBmdW5jdGlvbiBpbmZsYXRlKGRhdGEsIHJlc3RPYmplY3QpIHtcbiAgdmFyIGNvcHkgPSB0eXBlb2YgZGF0YSA9PSAnb2JqZWN0JyA/IGRhdGEgOiB7IGNsYXNzTmFtZTogZGF0YSB9O1xuICBmb3IgKHZhciBrZXkgaW4gcmVzdE9iamVjdCkge1xuICAgIGNvcHlba2V5XSA9IHJlc3RPYmplY3Rba2V5XTtcbiAgfVxuICByZXR1cm4gUGFyc2UuT2JqZWN0LmZyb21KU09OKGNvcHkpO1xufVxuXG5leHBvcnQgZnVuY3Rpb24gcnVuTGl2ZVF1ZXJ5RXZlbnRIYW5kbGVycyhkYXRhLCBhcHBsaWNhdGlvbklkID0gUGFyc2UuYXBwbGljYXRpb25JZCkge1xuICBpZiAoIV90cmlnZ2VyU3RvcmUgfHwgIV90cmlnZ2VyU3RvcmVbYXBwbGljYXRpb25JZF0gfHwgIV90cmlnZ2VyU3RvcmVbYXBwbGljYXRpb25JZF0uTGl2ZVF1ZXJ5KSB7XG4gICAgcmV0dXJuO1xuICB9XG4gIF90cmlnZ2VyU3RvcmVbYXBwbGljYXRpb25JZF0uTGl2ZVF1ZXJ5LmZvckVhY2goaGFuZGxlciA9PiBoYW5kbGVyKGRhdGEpKTtcbn1cblxuZXhwb3J0IGZ1bmN0aW9uIGdldFJlcXVlc3RGaWxlT2JqZWN0KHRyaWdnZXJUeXBlLCBhdXRoLCBmaWxlT2JqZWN0LCBjb25maWcpIHtcbiAgY29uc3QgcmVxdWVzdCA9IHtcbiAgICAuLi5maWxlT2JqZWN0LFxuICAgIHRyaWdnZXJOYW1lOiB0cmlnZ2VyVHlwZSxcbiAgICBtYXN0ZXI6IGZhbHNlLFxuICAgIGxvZzogY29uZmlnLmxvZ2dlckNvbnRyb2xsZXIsXG4gICAgaGVhZGVyczogY29uZmlnLmhlYWRlcnMsXG4gICAgaXA6IGNvbmZpZy5pcCxcbiAgICBjb25maWcsXG4gIH07XG5cbiAgaWYgKCFhdXRoKSB7XG4gICAgcmV0dXJuIHJlcXVlc3Q7XG4gIH1cbiAgaWYgKGF1dGguaXNNYXN0ZXIpIHtcbiAgICByZXF1ZXN0WydtYXN0ZXInXSA9IHRydWU7XG4gIH1cbiAgaWYgKGF1dGgudXNlcikge1xuICAgIHJlcXVlc3RbJ3VzZXInXSA9IGF1dGgudXNlcjtcbiAgfVxuICBpZiAoYXV0aC5pbnN0YWxsYXRpb25JZCkge1xuICAgIHJlcXVlc3RbJ2luc3RhbGxhdGlvbklkJ10gPSBhdXRoLmluc3RhbGxhdGlvbklkO1xuICB9XG4gIHJldHVybiByZXF1ZXN0O1xufVxuXG5leHBvcnQgYXN5bmMgZnVuY3Rpb24gbWF5YmVSdW5GaWxlVHJpZ2dlcih0cmlnZ2VyVHlwZSwgZmlsZU9iamVjdCwgY29uZmlnLCBhdXRoKSB7XG4gIGNvbnN0IEZpbGVDbGFzc05hbWUgPSBnZXRDbGFzc05hbWUoUGFyc2UuRmlsZSk7XG4gIGNvbnN0IGZpbGVUcmlnZ2VyID0gZ2V0VHJpZ2dlcihGaWxlQ2xhc3NOYW1lLCB0cmlnZ2VyVHlwZSwgY29uZmlnLmFwcGxpY2F0aW9uSWQpO1xuICBpZiAodHlwZW9mIGZpbGVUcmlnZ2VyID09PSAnZnVuY3Rpb24nKSB7XG4gICAgdHJ5IHtcbiAgICAgIGNvbnN0IHJlcXVlc3QgPSBnZXRSZXF1ZXN0RmlsZU9iamVjdCh0cmlnZ2VyVHlwZSwgYXV0aCwgZmlsZU9iamVjdCwgY29uZmlnKTtcbiAgICAgIGF3YWl0IG1heWJlUnVuVmFsaWRhdG9yKHJlcXVlc3QsIGAke3RyaWdnZXJUeXBlfS4ke0ZpbGVDbGFzc05hbWV9YCwgYXV0aCk7XG4gICAgICBpZiAocmVxdWVzdC5za2lwV2l0aE1hc3RlcktleSkge1xuICAgICAgICByZXR1cm4gZmlsZU9iamVjdDtcbiAgICAgIH1cbiAgICAgIGNvbnN0IHJlc3VsdCA9IGF3YWl0IGZpbGVUcmlnZ2VyKHJlcXVlc3QpO1xuICAgICAgbG9nVHJpZ2dlclN1Y2Nlc3NCZWZvcmVIb29rKFxuICAgICAgICB0cmlnZ2VyVHlwZSxcbiAgICAgICAgJ1BhcnNlLkZpbGUnLFxuICAgICAgICB7IC4uLmZpbGVPYmplY3QuZmlsZS50b0pTT04oKSwgZmlsZVNpemU6IGZpbGVPYmplY3QuZmlsZVNpemUgfSxcbiAgICAgICAgcmVzdWx0LFxuICAgICAgICBhdXRoXG4gICAgICApO1xuICAgICAgcmV0dXJuIHJlc3VsdCB8fCBmaWxlT2JqZWN0O1xuICAgIH0gY2F0Y2ggKGVycm9yKSB7XG4gICAgICBsb2dUcmlnZ2VyRXJyb3JCZWZvcmVIb29rKFxuICAgICAgICB0cmlnZ2VyVHlwZSxcbiAgICAgICAgJ1BhcnNlLkZpbGUnLFxuICAgICAgICB7IC4uLmZpbGVPYmplY3QuZmlsZS50b0pTT04oKSwgZmlsZVNpemU6IGZpbGVPYmplY3QuZmlsZVNpemUgfSxcbiAgICAgICAgYXV0aCxcbiAgICAgICAgZXJyb3JcbiAgICAgICk7XG4gICAgICB0aHJvdyBlcnJvcjtcbiAgICB9XG4gIH1cbiAgcmV0dXJuIGZpbGVPYmplY3Q7XG59XG4iXX0=