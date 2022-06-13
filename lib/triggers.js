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
//# sourceMappingURL=data:application/json;charset=utf-8;base64,eyJ2ZXJzaW9uIjozLCJzb3VyY2VzIjpbIi4uL3NyYy90cmlnZ2Vycy5qcyJdLCJuYW1lcyI6WyJUeXBlcyIsImJlZm9yZUxvZ2luIiwiYWZ0ZXJMb2dpbiIsImFmdGVyTG9nb3V0IiwiYmVmb3JlU2F2ZSIsImFmdGVyU2F2ZSIsImJlZm9yZURlbGV0ZSIsImFmdGVyRGVsZXRlIiwiYmVmb3JlRmluZCIsImFmdGVyRmluZCIsImJlZm9yZUNvbm5lY3QiLCJiZWZvcmVTdWJzY3JpYmUiLCJhZnRlckV2ZW50IiwiQ29ubmVjdENsYXNzTmFtZSIsImJhc2VTdG9yZSIsIlZhbGlkYXRvcnMiLCJPYmplY3QiLCJrZXlzIiwicmVkdWNlIiwiYmFzZSIsImtleSIsIkZ1bmN0aW9ucyIsIkpvYnMiLCJMaXZlUXVlcnkiLCJUcmlnZ2VycyIsImZyZWV6ZSIsImdldENsYXNzTmFtZSIsInBhcnNlQ2xhc3MiLCJjbGFzc05hbWUiLCJuYW1lIiwicmVwbGFjZSIsInZhbGlkYXRlQ2xhc3NOYW1lRm9yVHJpZ2dlcnMiLCJ0eXBlIiwiX3RyaWdnZXJTdG9yZSIsIkNhdGVnb3J5IiwiZ2V0U3RvcmUiLCJjYXRlZ29yeSIsImFwcGxpY2F0aW9uSWQiLCJwYXRoIiwic3BsaXQiLCJzcGxpY2UiLCJQYXJzZSIsInN0b3JlIiwiY29tcG9uZW50IiwidW5kZWZpbmVkIiwiYWRkIiwiaGFuZGxlciIsImxhc3RDb21wb25lbnQiLCJsb2dnZXIiLCJ3YXJuIiwicmVtb3ZlIiwiZ2V0IiwiYWRkRnVuY3Rpb24iLCJmdW5jdGlvbk5hbWUiLCJ2YWxpZGF0aW9uSGFuZGxlciIsImFkZEpvYiIsImpvYk5hbWUiLCJhZGRUcmlnZ2VyIiwiYWRkQ29ubmVjdFRyaWdnZXIiLCJhZGRMaXZlUXVlcnlFdmVudEhhbmRsZXIiLCJwdXNoIiwicmVtb3ZlRnVuY3Rpb24iLCJyZW1vdmVUcmlnZ2VyIiwiX3VucmVnaXN0ZXJBbGwiLCJmb3JFYWNoIiwiYXBwSWQiLCJ0b0pTT053aXRoT2JqZWN0cyIsIm9iamVjdCIsInRvSlNPTiIsInN0YXRlQ29udHJvbGxlciIsIkNvcmVNYW5hZ2VyIiwiZ2V0T2JqZWN0U3RhdGVDb250cm9sbGVyIiwicGVuZGluZyIsImdldFBlbmRpbmdPcHMiLCJfZ2V0U3RhdGVJZGVudGlmaWVyIiwidmFsIiwiX3RvRnVsbEpTT04iLCJnZXRUcmlnZ2VyIiwidHJpZ2dlclR5cGUiLCJydW5UcmlnZ2VyIiwidHJpZ2dlciIsInJlcXVlc3QiLCJhdXRoIiwibWF5YmVSdW5WYWxpZGF0b3IiLCJza2lwV2l0aE1hc3RlcktleSIsInRyaWdnZXJFeGlzdHMiLCJnZXRGdW5jdGlvbiIsImdldEZ1bmN0aW9uTmFtZXMiLCJmdW5jdGlvbk5hbWVzIiwiZXh0cmFjdEZ1bmN0aW9uTmFtZXMiLCJuYW1lc3BhY2UiLCJ2YWx1ZSIsImdldEpvYiIsImdldEpvYnMiLCJtYW5hZ2VyIiwiZ2V0VmFsaWRhdG9yIiwiZ2V0UmVxdWVzdE9iamVjdCIsInBhcnNlT2JqZWN0Iiwib3JpZ2luYWxQYXJzZU9iamVjdCIsImNvbmZpZyIsImNvbnRleHQiLCJ0cmlnZ2VyTmFtZSIsIm1hc3RlciIsImxvZyIsImxvZ2dlckNvbnRyb2xsZXIiLCJoZWFkZXJzIiwiaXAiLCJvcmlnaW5hbCIsImFzc2lnbiIsImlzTWFzdGVyIiwidXNlciIsImluc3RhbGxhdGlvbklkIiwiZ2V0UmVxdWVzdFF1ZXJ5T2JqZWN0IiwicXVlcnkiLCJjb3VudCIsImlzR2V0IiwiZ2V0UmVzcG9uc2VPYmplY3QiLCJyZXNvbHZlIiwicmVqZWN0Iiwic3VjY2VzcyIsInJlc3BvbnNlIiwib2JqZWN0cyIsIm1hcCIsImVxdWFscyIsIl9nZXRTYXZlSlNPTiIsImlkIiwiZXJyb3IiLCJlIiwicmVzb2x2ZUVycm9yIiwiY29kZSIsIkVycm9yIiwiU0NSSVBUX0ZBSUxFRCIsIm1lc3NhZ2UiLCJ1c2VySWRGb3JMb2ciLCJsb2dUcmlnZ2VyQWZ0ZXJIb29rIiwiaW5wdXQiLCJjbGVhbklucHV0IiwidHJ1bmNhdGVMb2dNZXNzYWdlIiwiSlNPTiIsInN0cmluZ2lmeSIsImluZm8iLCJsb2dUcmlnZ2VyU3VjY2Vzc0JlZm9yZUhvb2siLCJyZXN1bHQiLCJjbGVhblJlc3VsdCIsImxvZ1RyaWdnZXJFcnJvckJlZm9yZUhvb2siLCJtYXliZVJ1bkFmdGVyRmluZFRyaWdnZXIiLCJQcm9taXNlIiwiZnJvbUpTT04iLCJ0aGVuIiwicmVzdWx0cyIsIm1heWJlUnVuUXVlcnlUcmlnZ2VyIiwicmVzdFdoZXJlIiwicmVzdE9wdGlvbnMiLCJqc29uIiwid2hlcmUiLCJwYXJzZVF1ZXJ5IiwiUXVlcnkiLCJ3aXRoSlNPTiIsInJlcXVlc3RPYmplY3QiLCJxdWVyeVJlc3VsdCIsImpzb25RdWVyeSIsImxpbWl0Iiwic2tpcCIsImluY2x1ZGUiLCJleGNsdWRlS2V5cyIsImV4cGxhaW4iLCJvcmRlciIsImhpbnQiLCJyZWFkUHJlZmVyZW5jZSIsImluY2x1ZGVSZWFkUHJlZmVyZW5jZSIsInN1YnF1ZXJ5UmVhZFByZWZlcmVuY2UiLCJlcnIiLCJkZWZhdWx0T3B0cyIsInN0YWNrIiwidGhlVmFsaWRhdG9yIiwiYnVpbHRJblRyaWdnZXJWYWxpZGF0b3IiLCJjYXRjaCIsIlZBTElEQVRJT05fRVJST1IiLCJvcHRpb25zIiwidmFsaWRhdGVNYXN0ZXJLZXkiLCJyZXFVc2VyIiwiZXhpc3RlZCIsInJlcXVpcmVVc2VyIiwicmVxdWlyZUFueVVzZXJSb2xlcyIsInJlcXVpcmVBbGxVc2VyUm9sZXMiLCJyZXF1aXJlTWFzdGVyIiwicGFyYW1zIiwicmVxdWlyZWRQYXJhbSIsInZhbGlkYXRlT3B0aW9ucyIsIm9wdCIsIm9wdHMiLCJBcnJheSIsImlzQXJyYXkiLCJpbmNsdWRlcyIsImpvaW4iLCJnZXRUeXBlIiwiZm4iLCJtYXRjaCIsInRvU3RyaW5nIiwidG9Mb3dlckNhc2UiLCJmaWVsZHMiLCJvcHRpb25Qcm9taXNlcyIsImRlZmF1bHQiLCJzZXQiLCJjb25zdGFudCIsInJldmVydCIsInJlcXVpcmVkIiwib3B0aW9uYWwiLCJ2YWxUeXBlIiwiYWxsIiwidXNlclJvbGVzIiwicmVxdWlyZUFsbFJvbGVzIiwicHJvbWlzZXMiLCJnZXRVc2VyUm9sZXMiLCJyb2xlcyIsInJlc29sdmVkVXNlclJvbGVzIiwicmVzb2x2ZWRSZXF1aXJlQWxsIiwiaGFzUm9sZSIsInNvbWUiLCJyZXF1aXJlZFJvbGUiLCJ1c2VyS2V5cyIsInJlcXVpcmVVc2VyS2V5cyIsIm1heWJlUnVuVHJpZ2dlciIsInByb21pc2UiLCJpbmZsYXRlIiwiZGF0YSIsInJlc3RPYmplY3QiLCJjb3B5IiwicnVuTGl2ZVF1ZXJ5RXZlbnRIYW5kbGVycyIsImdldFJlcXVlc3RGaWxlT2JqZWN0IiwiZmlsZU9iamVjdCIsIm1heWJlUnVuRmlsZVRyaWdnZXIiLCJGaWxlQ2xhc3NOYW1lIiwiRmlsZSIsImZpbGVUcmlnZ2VyIiwiZmlsZSIsImZpbGVTaXplIl0sIm1hcHBpbmdzIjoiOzs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7O0FBQ0E7O0FBQ0E7Ozs7Ozs7Ozs7QUFFTyxNQUFNQSxLQUFLLEdBQUc7QUFDbkJDLEVBQUFBLFdBQVcsRUFBRSxhQURNO0FBRW5CQyxFQUFBQSxVQUFVLEVBQUUsWUFGTztBQUduQkMsRUFBQUEsV0FBVyxFQUFFLGFBSE07QUFJbkJDLEVBQUFBLFVBQVUsRUFBRSxZQUpPO0FBS25CQyxFQUFBQSxTQUFTLEVBQUUsV0FMUTtBQU1uQkMsRUFBQUEsWUFBWSxFQUFFLGNBTks7QUFPbkJDLEVBQUFBLFdBQVcsRUFBRSxhQVBNO0FBUW5CQyxFQUFBQSxVQUFVLEVBQUUsWUFSTztBQVNuQkMsRUFBQUEsU0FBUyxFQUFFLFdBVFE7QUFVbkJDLEVBQUFBLGFBQWEsRUFBRSxlQVZJO0FBV25CQyxFQUFBQSxlQUFlLEVBQUUsaUJBWEU7QUFZbkJDLEVBQUFBLFVBQVUsRUFBRTtBQVpPLENBQWQ7O0FBZVAsTUFBTUMsZ0JBQWdCLEdBQUcsVUFBekI7O0FBRUEsTUFBTUMsU0FBUyxHQUFHLFlBQVk7QUFDNUIsUUFBTUMsVUFBVSxHQUFHQyxNQUFNLENBQUNDLElBQVAsQ0FBWWpCLEtBQVosRUFBbUJrQixNQUFuQixDQUEw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LENBQUNNO0FBSDdCLFVBSXZCMUosSUFKdUIsRUFLdkI0QyxLQUx1QixDQUF6QjtBQU9BLFlBQU1BLEtBQU47QUFDRDtBQUNGOztBQUNELFNBQU93RyxVQUFQO0FBQ0QiLCJzb3VyY2VzQ29udGVudCI6WyIvLyB0cmlnZ2Vycy5qc1xuaW1wb3J0IFBhcnNlIGZyb20gJ3BhcnNlL25vZGUnO1xuaW1wb3J0IHsgbG9nZ2VyIH0gZnJvbSAnLi9sb2dnZXInO1xuXG5leHBvcnQgY29uc3QgVHlwZXMgPSB7XG4gIGJlZm9yZUxvZ2luOiAnYmVmb3JlTG9naW4nLFxuICBhZnRlckxvZ2luOiAnYWZ0ZXJMb2dpbicsXG4gIGFmdGVyTG9nb3V0OiAnYWZ0ZXJMb2dvdXQnLFxuICBiZWZvcmVTYXZlOiAnYmVmb3JlU2F2ZScsXG4gIGFmdGVyU2F2ZTogJ2FmdGVyU2F2ZScsXG4gIGJlZm9yZURlbGV0ZTogJ2JlZm9yZURlbGV0ZScsXG4gIGFmdGVyRGVsZXRlOiAnYWZ0ZXJEZWxldGUnLFxuICBiZWZvcmVGaW5kOiAnYmVmb3JlRmluZCcsXG4gIGFmdGVyRmluZDogJ2FmdGVyRmluZCcsXG4gIGJlZm9yZUNvbm5lY3Q6ICdiZWZvcmVDb25uZWN0JyxcbiAgYmVmb3JlU3Vic2NyaWJlOiAnYmVmb3JlU3Vic2NyaWJlJyxcbiAgYWZ0ZXJFdmVudDogJ2FmdGVyRXZlbnQnLFxufTtcblxuY29uc3QgQ29ubmVjdENsYXNzTmFtZSA9ICdAQ29ubmVjdCc7XG5cbmNvbnN0IGJhc2VTdG9yZSA9IGZ1bmN0aW9uICgpIHtcbiAgY29uc3QgVmFsaWRhdG9ycyA9IE9iamVjdC5rZXlzKFR5cGVzKS5yZWR1Y2UoZnVuY3Rpb24gKGJhc2UsIGtleSkge1xuICAgIGJhc2Vba2V5XSA9IHt9O1xuICAgIHJldHVybiBiYXNlO1xuICB9LCB7fSk7XG4gIGNvbnN0IEZ1bmN0aW9ucyA9IHt9O1xuICBjb25zdCBKb2JzID0ge307XG4gIGNvbnN0IExpdmVRdWVyeSA9IFtdO1xuICBjb25zdCBUcmlnZ2VycyA9IE9iamVjdC5rZXlzKFR5cGVzKS5yZWR1Y2UoZnVuY3Rpb24gKGJhc2UsIGtleSkge1xuICAgIGJhc2Vba2V5XSA9IHt9O1xuICAgIHJldHVybiBiYXNlO1xuICB9LCB7fSk7XG5cbiAgcmV0dXJuIE9iamVjdC5mcmVlemUoe1xuICAgIEZ1bmN0aW9ucyxcbiAgICBKb2JzLFxuICAgIFZhbGlkYXRvcnMsXG4gICAgVHJpZ2dlcnMsXG4gICAgTGl2ZVF1ZXJ5LFxuICB9KTtcbn07XG5cbmV4cG9ydCBmdW5jdGlvbiBnZXRDbGFzc05hbWUocGFyc2VDbGFzcykge1xuICBpZiAocGFyc2VDbGFzcyAmJiBwYXJzZUNsYXNzLmNsYXNzTmFtZSkge1xuICAgIHJldHVybiBwYXJzZUNsYXNzLmNsYXNzTmFtZTtcbiAgfVxuICBpZiAocGFyc2VDbGFzcyAmJiBwYXJzZUNsYXNzLm5hbWUpIHtcbiAgICByZXR1cm4gcGFyc2VDbGFzcy5uYW1lLnJlcGxhY2UoJ1BhcnNlJywgJ0AnKTtcbiAgfVxuICByZXR1cm4gcGFyc2VDbGFzcztcbn1cblxuZnVuY3Rpb24gdmFsaWRhdGVDbGFzc05hbWVGb3JUcmlnZ2VycyhjbGFzc05hbWUsIHR5cGUpIHtcbiAgaWYgKHR5cGUgPT0gVHlwZXMuYmVmb3JlU2F2ZSAmJiBjbGFzc05hbWUgPT09ICdfUHVzaFN0YXR1cycpIHtcbiAgICAvLyBfUHVzaFN0YXR1cyB1c2VzIHVuZG9jdW1lbnRlZCBuZXN0ZWQga2V5IGluY3JlbWVudCBvcHNcbiAgICAvLyBhbGxvd2luZyBiZWZvcmVTYXZlIHdvdWxkIG1lc3MgdXAgdGhlIG9iamVjdHMgYmlnIHRpbWVcbiAgICAvLyBUT0RPOiBBbGxvdyBwcm9wZXIgZG9jdW1lbnRlZCB3YXkgb2YgdXNpbmcgbmVzdGVkIGluY3JlbWVudCBvcHNcbiAgICB0aHJvdyAnT25seSBhZnRlclNhdmUgaXMgYWxsb3dlZCBvbiBfUHVzaFN0YXR1cyc7XG4gIH1cbiAgaWYgKCh0eXBlID09PSBUeXBlcy5iZWZvcmVMb2dpbiB8fCB0eXBlID09PSBUeXBlcy5hZnRlckxvZ2luKSAmJiBjbGFzc05hbWUgIT09ICdfVXNlcicpIHtcbiAgICAvLyBUT0RPOiBjaGVjayBpZiB1cHN0cmVhbSBjb2RlIHdpbGwgaGFuZGxlIGBFcnJvcmAgaW5zdGFuY2UgcmF0aGVyXG4gICAgLy8gdGhhbiB0aGlzIGFudGktcGF0dGVybiBvZiB0aHJvd2luZyBzdHJpbmdzXG4gICAgdGhyb3cgJ09ubHkgdGhlIF9Vc2VyIGNsYXNzIGlzIGFsbG93ZWQgZm9yIHRoZSBiZWZvcmVMb2dpbiBhbmQgYWZ0ZXJMb2dpbiB0cmlnZ2Vycyc7XG4gIH1cbiAgaWYgKHR5cGUgPT09IFR5cGVzLmFmdGVyTG9nb3V0ICYmIGNsYXNzTmFtZSAhPT0gJ19TZXNzaW9uJykge1xuICAgIC8vIFRPRE86IGNoZWNrIGlmIHVwc3RyZWFtIGNvZGUgd2lsbCBoYW5kbGUgYEVycm9yYCBpbnN0YW5jZSByYXRoZXJcbiAgICAvLyB0aGFuIHRoaXMgYW50aS1wYXR0ZXJuIG9mIHRocm93aW5nIHN0cmluZ3NcbiAgICB0aHJvdyAnT25seSB0aGUgX1Nlc3Npb24gY2xhc3MgaXMgYWxsb3dlZCBmb3IgdGhlIGFmdGVyTG9nb3V0IHRyaWdnZXIuJztcbiAgfVxuICBpZiAoY2xhc3NOYW1lID09PSAnX1Nlc3Npb24nICYmIHR5cGUgIT09IFR5cGVzLmFmdGVyTG9nb3V0KSB7XG4gICAgLy8gVE9ETzogY2hlY2sgaWYgdXBzdHJlYW0gY29kZSB3aWxsIGhhbmRsZSBgRXJyb3JgIGluc3RhbmNlIHJhdGhlclxuICAgIC8vIHRoYW4gdGhpcyBhbnRpLXBhdHRlcm4gb2YgdGhyb3dpbmcgc3RyaW5nc1xuICAgIHRocm93ICdPbmx5IHRoZSBhZnRlckxvZ291dCB0cmlnZ2VyIGlzIGFsbG93ZWQgZm9yIHRoZSBfU2Vzc2lvbiBjbGFzcy4nO1xuICB9XG4gIHJldHVybiBjbGFzc05hbWU7XG59XG5cbmNvbnN0IF90cmlnZ2VyU3RvcmUgPSB7fTtcblxuY29uc3QgQ2F0ZWdvcnkgPSB7XG4gIEZ1bmN0aW9uczogJ0Z1bmN0aW9ucycsXG4gIFZhbGlkYXRvcnM6ICdWYWxpZGF0b3JzJyxcbiAgSm9iczogJ0pvYnMnLFxuICBUcmlnZ2VyczogJ1RyaWdnZXJzJyxcbn07XG5cbmZ1bmN0aW9uIGdldFN0b3JlKGNhdGVnb3J5LCBuYW1lLCBhcHBsaWNhdGlvbklkKSB7XG4gIGNvbnN0IHBhdGggPSBuYW1lLnNwbGl0KCcuJyk7XG4gIHBhdGguc3BsaWNlKC0xKTsgLy8gcmVtb3ZlIGxhc3QgY29tcG9uZW50XG4gIGFwcGxpY2F0aW9uSWQgPSBhcHBsaWNhdGlvbklkIHx8IFBhcnNlLmFwcGxpY2F0aW9uSWQ7XG4gIF90cmlnZ2VyU3RvcmVbYXBwbGljYXRpb25JZF0gPSBfdHJpZ2dlclN0b3JlW2FwcGxpY2F0aW9uSWRdIHx8IGJhc2VTdG9yZSgpO1xuICBsZXQgc3RvcmUgPSBfdHJpZ2dlclN0b3JlW2FwcGxpY2F0aW9uSWRdW2NhdGVnb3J5XTtcbiAgZm9yIChjb25zdCBjb21wb25lbnQgb2YgcGF0aCkge1xuICAgIHN0b3JlID0gc3RvcmVbY29tcG9uZW50XTtcbiAgICBpZiAoIXN0b3JlKSB7XG4gICAgICByZXR1cm4gdW5kZWZpbmVkO1xuICAgIH1cbiAgfVxuICByZXR1cm4gc3RvcmU7XG59XG5cbmZ1bmN0aW9uIGFkZChjYXRlZ29yeSwgbmFtZSwgaGFuZGxlciwgYXBwbGljYXRpb25JZCkge1xuICBjb25zdCBsYXN0Q29tcG9uZW50ID0gbmFtZS5zcGxpdCgnLicpLnNwbGljZSgtMSk7XG4gIGNvbnN0IHN0b3JlID0gZ2V0U3RvcmUoY2F0ZWdvcnksIG5hbWUsIGFwcGxpY2F0aW9uSWQpO1xuICBpZiAoc3RvcmVbbGFzdENvbXBvbmVudF0pIHtcbiAgICBsb2dnZXIud2FybihcbiAgICAgIGBXYXJuaW5nOiBEdXBsaWNhdGUgY2xvdWQgZnVuY3Rpb25zIGV4aXN0IGZvciAke2xhc3RDb21wb25lbnR9LiBPbmx5IHRoZSBsYXN0IG9uZSB3aWxsIGJlIHVzZWQgYW5kIHRoZSBvdGhlcnMgd2lsbCBiZSBpZ25vcmVkLmBcbiAgICApO1xuICB9XG4gIHN0b3JlW2xhc3RDb21wb25lbnRdID0gaGFuZGxlcjtcbn1cblxuZnVuY3Rpb24gcmVtb3ZlKGNhdGVnb3J5LCBuYW1lLCBhcHBsaWNhdGlvbklkKSB7XG4gIGNvbnN0IGxhc3RDb21wb25lbnQgPSBuYW1lLnNwbGl0KCcuJykuc3BsaWNlKC0xKTtcbiAgY29uc3Qgc3RvcmUgPSBnZXRTdG9yZShjYXRlZ29yeSwgbmFtZSwgYXBwbGljYXRpb25JZCk7XG4gIGRlbGV0ZSBzdG9yZVtsYXN0Q29tcG9uZW50XTtcbn1cblxuZnVuY3Rpb24gZ2V0KGNhdGVnb3J5LCBuYW1lLCBhcHBsaWNhdGlvbklkKSB7XG4gIGNvbnN0IGxhc3RDb21wb25lbnQgPSBuYW1lLnNwbGl0KCcuJykuc3BsaWNlKC0xKTtcbiAgY29uc3Qgc3RvcmUgPSBnZXRTdG9yZShjYXRlZ29yeSwgbmFtZSwgYXBwbGljYXRpb25JZCk7XG4gIHJldHVybiBzdG9yZVtsYXN0Q29tcG9uZW50XTtcbn1cblxuZXhwb3J0IGZ1bmN0aW9uIGFkZEZ1bmN0aW9uKGZ1bmN0aW9uTmFtZSwgaGFuZGxlciwgdmFsaWRhdGlvbkhhbmRsZXIsIGFwcGxpY2F0aW9uSWQpIHtcbiAgYWRkKENhdGVnb3J5LkZ1bmN0aW9ucywgZnVuY3Rpb25OYW1lLCBoYW5kbGVyLCBhcHBsaWNhdGlvbklkKTtcbiAgYWRkKENhdGVnb3J5LlZhbGlkYXRvcnMsIGZ1bmN0aW9uTmFtZSwgdmFsaWRhdGlvbkhhbmRsZXIsIGFwcGxpY2F0aW9uSWQpO1xufVxuXG5leHBvcnQgZnVuY3Rpb24gYWRkSm9iKGpvYk5hbWUsIGhhbmRsZXIsIGFwcGxpY2F0aW9uSWQpIHtcbiAgYWRkKENhdGVnb3J5LkpvYnMsIGpvYk5hbWUsIGhhbmRsZXIsIGFwcGxpY2F0aW9uSWQpO1xufVxuXG5leHBvcnQgZnVuY3Rpb24gYWRkVHJpZ2dlcih0eXBlLCBjbGFzc05hbWUsIGhhbmRsZXIsIGFwcGxpY2F0aW9uSWQsIHZhbGlkYXRpb25IYW5kbGVyKSB7XG4gIHZhbGlkYXRlQ2xhc3NOYW1lRm9yVHJpZ2dlcnMoY2xhc3NOYW1lLCB0eXBlKTtcbiAgYWRkKENhdGVnb3J5LlRyaWdnZXJzLCBgJHt0eXBlfS4ke2NsYXNzTmFtZX1gLCBoYW5kbGVyLCBhcHBsaWNhdGlvbklkKTtcbiAgYWRkKENhdGVnb3J5LlZhbGlkYXRvcnMsIGAke3R5cGV9LiR7Y2xhc3NOYW1lfWAsIHZhbGlkYXRpb25IYW5kbGVyLCBhcHBsaWNhdGlvbklkKTtcbn1cblxuZXhwb3J0IGZ1bmN0aW9uIGFkZENvbm5lY3RUcmlnZ2VyKHR5cGUsIGhhbmRsZXIsIGFwcGxpY2F0aW9uSWQsIHZhbGlkYXRpb25IYW5kbGVyKSB7XG4gIGFkZChDYXRlZ29yeS5UcmlnZ2VycywgYCR7dHlwZX0uJHtDb25uZWN0Q2xhc3NOYW1lfWAsIGhhbmRsZXIsIGFwcGxpY2F0aW9uSWQpO1xuICBhZGQoQ2F0ZWdvcnkuVmFsaWRhdG9ycywgYCR7dHlwZX0uJHtDb25uZWN0Q2xhc3NOYW1lfWAsIHZhbGlkYXRpb25IYW5kbGVyLCBhcHBsaWNhdGlvbklkKTtcbn1cblxuZXhwb3J0IGZ1bmN0aW9uIGFkZExpdmVRdWVyeUV2ZW50SGFuZGxlcihoYW5kbGVyLCBhcHBsaWNhdGlvbklkKSB7XG4gIGFwcGxpY2F0aW9uSWQgPSBhcHBsaWNhdGlvbklkIHx8IFBhcnNlLmFwcGxpY2F0aW9uSWQ7XG4gIF90cmlnZ2VyU3RvcmVbYXBwbGljYXRpb25JZF0gPSBfdHJpZ2dlclN0b3JlW2FwcGxpY2F0aW9uSWRdIHx8IGJhc2VTdG9yZSgpO1xuICBfdHJpZ2dlclN0b3JlW2FwcGxpY2F0aW9uSWRdLkxpdmVRdWVyeS5wdXNoKGhhbmRsZXIpO1xufVxuXG5leHBvcnQgZnVuY3Rpb24gcmVtb3ZlRnVuY3Rpb24oZnVuY3Rpb25OYW1lLCBhcHBsaWNhdGlvbklkKSB7XG4gIHJlbW92ZShDYXRlZ29yeS5GdW5jdGlvbnMsIGZ1bmN0aW9uTmFtZSwgYXBwbGljYXRpb25JZCk7XG59XG5cbmV4cG9ydCBmdW5jdGlvbiByZW1vdmVUcmlnZ2VyKHR5cGUsIGNsYXNzTmFtZSwgYXBwbGljYXRpb25JZCkge1xuICByZW1vdmUoQ2F0ZWdvcnkuVHJpZ2dlcnMsIGAke3R5cGV9LiR7Y2xhc3NOYW1lfWAsIGFwcGxpY2F0aW9uSWQpO1xufVxuXG5leHBvcnQgZnVuY3Rpb24gX3VucmVnaXN0ZXJBbGwoKSB7XG4gIE9iamVjdC5rZXlzKF90cmlnZ2VyU3RvcmUpLmZvckVhY2goYXBwSWQgPT4gZGVsZXRlIF90cmlnZ2VyU3RvcmVbYXBwSWRdKTtcbn1cblxuZXhwb3J0IGZ1bmN0aW9uIHRvSlNPTndpdGhPYmplY3RzKG9iamVjdCwgY2xhc3NOYW1lKSB7XG4gIGlmICghb2JqZWN0IHx8ICFvYmplY3QudG9KU09OKSB7XG4gICAgcmV0dXJuIHt9O1xuICB9XG4gIGNvbnN0IHRvSlNPTiA9IG9iamVjdC50b0pTT04oKTtcbiAgY29uc3Qgc3RhdGVDb250cm9sbGVyID0gUGFyc2UuQ29yZU1hbmFnZXIuZ2V0T2JqZWN0U3RhdGVDb250cm9sbGVyKCk7XG4gIGNvbnN0IFtwZW5kaW5nXSA9IHN0YXRlQ29udHJvbGxlci5nZXRQZW5kaW5nT3BzKG9iamVjdC5fZ2V0U3RhdGVJZGVudGlmaWVyKCkpO1xuICBmb3IgKGNvbnN0IGtleSBpbiBwZW5kaW5nKSB7XG4gICAgY29uc3QgdmFsID0gb2JqZWN0LmdldChrZXkpO1xuICAgIGlmICghdmFsIHx8ICF2YWwuX3RvRnVsbEpTT04pIHtcbiAgICAgIHRvSlNPTltrZXldID0gdmFsO1xuICAgICAgY29udGludWU7XG4gICAgfVxuICAgIHRvSlNPTltrZXldID0gdmFsLl90b0Z1bGxKU09OKCk7XG4gIH1cbiAgaWYgKGNsYXNzTmFtZSkge1xuICAgIHRvSlNPTi5jbGFzc05hbWUgPSBjbGFzc05hbWU7XG4gIH1cbiAgcmV0dXJuIHRvSlNPTjtcbn1cblxuZXhwb3J0IGZ1bmN0aW9uIGdldFRyaWdnZXIoY2xhc3NOYW1lLCB0cmlnZ2VyVHlwZSwgYXBwbGljYXRpb25JZCkge1xuICBpZiAoIWFwcGxpY2F0aW9uSWQpIHtcbiAgICB0aHJvdyAnTWlzc2luZyBBcHBsaWNhdGlvbklEJztcbiAgfVxuICByZXR1cm4gZ2V0KENhdGVnb3J5LlRyaWdnZXJzLCBgJHt0cmlnZ2VyVHlwZX0uJHtjbGFzc05hbWV9YCwgYXBwbGljYXRpb25JZCk7XG59XG5cbmV4cG9ydCBhc3luYyBmdW5jdGlvbiBydW5UcmlnZ2VyKHRyaWdnZXIsIG5hbWUsIHJlcXVlc3QsIGF1dGgpIHtcbiAgaWYgKCF0cmlnZ2VyKSB7XG4gICAgcmV0dXJuO1xuICB9XG4gIGF3YWl0IG1heWJlUnVuVmFsaWRhdG9yKHJlcXVlc3QsIG5hbWUsIGF1dGgpO1xuICBpZiAocmVxdWVzdC5za2lwV2l0aE1hc3RlcktleSkge1xuICAgIHJldHVybjtcbiAgfVxuICByZXR1cm4gYXdhaXQgdHJpZ2dlcihyZXF1ZXN0KTtcbn1cblxuZXhwb3J0IGZ1bmN0aW9uIHRyaWdnZXJFeGlzdHMoY2xhc3NOYW1lOiBzdHJpbmcsIHR5cGU6IHN0cmluZywgYXBwbGljYXRpb25JZDogc3RyaW5nKTogYm9vbGVhbiB7XG4gIHJldHVybiBnZXRUcmlnZ2VyKGNsYXNzTmFtZSwgdHlwZSwgYXBwbGljYXRpb25JZCkgIT0gdW5kZWZpbmVkO1xufVxuXG5leHBvcnQgZnVuY3Rpb24gZ2V0RnVuY3Rpb24oZnVuY3Rpb25OYW1lLCBhcHBsaWNhdGlvbklkKSB7XG4gIHJldHVybiBnZXQoQ2F0ZWdvcnkuRnVuY3Rpb25zLCBmdW5jdGlvbk5hbWUsIGFwcGxpY2F0aW9uSWQpO1xufVxuXG5leHBvcnQgZnVuY3Rpb24gZ2V0RnVuY3Rpb25OYW1lcyhhcHBsaWNhdGlvbklkKSB7XG4gIGNvbnN0IHN0b3JlID1cbiAgICAoX3RyaWdnZXJTdG9yZVthcHBsaWNhdGlvbklkXSAmJiBfdHJpZ2dlclN0b3JlW2FwcGxpY2F0aW9uSWRdW0NhdGVnb3J5LkZ1bmN0aW9uc10pIHx8IHt9O1xuICBjb25zdCBmdW5jdGlvbk5hbWVzID0gW107XG4gIGNvbnN0IGV4dHJhY3RGdW5jdGlvbk5hbWVzID0gKG5hbWVzcGFjZSwgc3RvcmUpID0+IHtcbiAgICBPYmplY3Qua2V5cyhzdG9yZSkuZm9yRWFjaChuYW1lID0+IHtcbiAgICAgIGNvbnN0IHZhbHVlID0gc3RvcmVbbmFtZV07XG4gICAgICBpZiAobmFtZXNwYWNlKSB7XG4gICAgICAgIG5hbWUgPSBgJHtuYW1lc3BhY2V9LiR7bmFtZX1gO1xuICAgICAgfVxuICAgICAgaWYgKHR5cGVvZiB2YWx1ZSA9PT0gJ2Z1bmN0aW9uJykge1xuICAgICAgICBmdW5jdGlvbk5hbWVzLnB1c2gobmFtZSk7XG4gICAgICB9IGVsc2Uge1xuICAgICAgICBleHRyYWN0RnVuY3Rpb25OYW1lcyhuYW1lLCB2YWx1ZSk7XG4gICAgICB9XG4gICAgfSk7XG4gIH07XG4gIGV4dHJhY3RGdW5jdGlvbk5hbWVzKG51bGwsIHN0b3JlKTtcbiAgcmV0dXJuIGZ1bmN0aW9uTmFtZXM7XG59XG5cbmV4cG9ydCBmdW5jdGlvbiBnZXRKb2Ioam9iTmFtZSwgYXBwbGljYXRpb25JZCkge1xuICByZXR1cm4gZ2V0KENhdGVnb3J5LkpvYnMsIGpvYk5hbWUsIGFwcGxpY2F0aW9uSWQpO1xufVxuXG5leHBvcnQgZnVuY3Rpb24gZ2V0Sm9icyhhcHBsaWNhdGlvbklkKSB7XG4gIHZhciBtYW5hZ2VyID0gX3RyaWdnZXJTdG9yZVthcHBsaWNhdGlvbklkXTtcbiAgaWYgKG1hbmFnZXIgJiYgbWFuYWdlci5Kb2JzKSB7XG4gICAgcmV0dXJuIG1hbmFnZXIuSm9icztcbiAgfVxuICByZXR1cm4gdW5kZWZpbmVkO1xufVxuXG5leHBvcnQgZnVuY3Rpb24gZ2V0VmFsaWRhdG9yKGZ1bmN0aW9uTmFtZSwgYXBwbGljYXRpb25JZCkge1xuICByZXR1cm4gZ2V0KENhdGVnb3J5LlZhbGlkYXRvcnMsIGZ1bmN0aW9uTmFtZSwgYXBwbGljYXRpb25JZCk7XG59XG5cbmV4cG9ydCBmdW5jdGlvbiBnZXRSZXF1ZXN0T2JqZWN0KFxuICB0cmlnZ2VyVHlwZSxcbiAgYXV0aCxcbiAgcGFyc2VPYmplY3QsXG4gIG9yaWdpbmFsUGFyc2VPYmplY3QsXG4gIGNvbmZpZyxcbiAgY29udGV4dFxuKSB7XG4gIGNvbnN0IHJlcXVlc3QgPSB7XG4gICAgdHJpZ2dlck5hbWU6IHRyaWdnZXJUeXBlLFxuICAgIG9iamVjdDogcGFyc2VPYmplY3QsXG4gICAgbWFzdGVyOiBmYWxzZSxcbiAgICBsb2c6IGNvbmZpZy5sb2dnZXJDb250cm9sbGVyLFxuICAgIGhlYWRlcnM6IGNvbmZpZy5oZWFkZXJzLFxuICAgIGlwOiBjb25maWcuaXAsXG4gIH07XG5cbiAgaWYgKG9yaWdpbmFsUGFyc2VPYmplY3QpIHtcbiAgICByZXF1ZXN0Lm9yaWdpbmFsID0gb3JpZ2luYWxQYXJzZU9iamVjdDtcbiAgfVxuICBpZiAoXG4gICAgdHJpZ2dlclR5cGUgPT09IFR5cGVzLmJlZm9yZVNhdmUgfHxcbiAgICB0cmlnZ2VyVHlwZSA9PT0gVHlwZXMuYWZ0ZXJTYXZlIHx8XG4gICAgdHJpZ2dlclR5cGUgPT09IFR5cGVzLmJlZm9yZURlbGV0ZSB8fFxuICAgIHRyaWdnZXJUeXBlID09PSBUeXBlcy5hZnRlckRlbGV0ZSB8fFxuICAgIHRyaWdnZXJUeXBlID09PSBUeXBlcy5hZnRlckZpbmRcbiAgKSB7XG4gICAgLy8gU2V0IGEgY29weSBvZiB0aGUgY29udGV4dCBvbiB0aGUgcmVxdWVzdCBvYmplY3QuXG4gICAgcmVxdWVzdC5jb250ZXh0ID0gT2JqZWN0LmFzc2lnbih7fSwgY29udGV4dCk7XG4gIH1cblxuICBpZiAoIWF1dGgpIHtcbiAgICByZXR1cm4gcmVxdWVzdDtcbiAgfVxuICBpZiAoYXV0aC5pc01hc3Rlcikge1xuICAgIHJlcXVlc3RbJ21hc3RlciddID0gdHJ1ZTtcbiAgfVxuICBpZiAoYXV0aC51c2VyKSB7XG4gICAgcmVxdWVzdFsndXNlciddID0gYXV0aC51c2VyO1xuICB9XG4gIGlmIChhdXRoLmluc3RhbGxhdGlvbklkKSB7XG4gICAgcmVxdWVzdFsnaW5zdGFsbGF0aW9uSWQnXSA9IGF1dGguaW5zdGFsbGF0aW9uSWQ7XG4gIH1cbiAgcmV0dXJuIHJlcXVlc3Q7XG59XG5cbmV4cG9ydCBmdW5jdGlvbiBnZXRSZXF1ZXN0UXVlcnlPYmplY3QodHJpZ2dlclR5cGUsIGF1dGgsIHF1ZXJ5LCBjb3VudCwgY29uZmlnLCBjb250ZXh0LCBpc0dldCkge1xuICBpc0dldCA9ICEhaXNHZXQ7XG5cbiAgdmFyIHJlcXVlc3QgPSB7XG4gICAgdHJpZ2dlck5hbWU6IHRyaWdnZXJUeXBlLFxuICAgIHF1ZXJ5LFxuICAgIG1hc3RlcjogZmFsc2UsXG4gICAgY291bnQsXG4gICAgbG9nOiBjb25maWcubG9nZ2VyQ29udHJvbGxlcixcbiAgICBpc0dldCxcbiAgICBoZWFkZXJzOiBjb25maWcuaGVhZGVycyxcbiAgICBpcDogY29uZmlnLmlwLFxuICAgIGNvbnRleHQ6IGNvbnRleHQgfHwge30sXG4gIH07XG5cbiAgaWYgKCFhdXRoKSB7XG4gICAgcmV0dXJuIHJlcXVlc3Q7XG4gIH1cbiAgaWYgKGF1dGguaXNNYXN0ZXIpIHtcbiAgICByZXF1ZXN0WydtYXN0ZXInXSA9IHRydWU7XG4gIH1cbiAgaWYgKGF1dGgudXNlcikge1xuICAgIHJlcXVlc3RbJ3VzZXInXSA9IGF1dGgudXNlcjtcbiAgfVxuICBpZiAoYXV0aC5pbnN0YWxsYXRpb25JZCkge1xuICAgIHJlcXVlc3RbJ2luc3RhbGxhdGlvbklkJ10gPSBhdXRoLmluc3RhbGxhdGlvbklkO1xuICB9XG4gIHJldHVybiByZXF1ZXN0O1xufVxuXG4vLyBDcmVhdGVzIHRoZSByZXNwb25zZSBvYmplY3QsIGFuZCB1c2VzIHRoZSByZXF1ZXN0IG9iamVjdCB0byBwYXNzIGRhdGFcbi8vIFRoZSBBUEkgd2lsbCBjYWxsIHRoaXMgd2l0aCBSRVNUIEFQSSBmb3JtYXR0ZWQgb2JqZWN0cywgdGhpcyB3aWxsXG4vLyB0cmFuc2Zvcm0gdGhlbSB0byBQYXJzZS5PYmplY3QgaW5zdGFuY2VzIGV4cGVjdGVkIGJ5IENsb3VkIENvZGUuXG4vLyBBbnkgY2hhbmdlcyBtYWRlIHRvIHRoZSBvYmplY3QgaW4gYSBiZWZvcmVTYXZlIHdpbGwgYmUgaW5jbHVkZWQuXG5leHBvcnQgZnVuY3Rpb24gZ2V0UmVzcG9uc2VPYmplY3QocmVxdWVzdCwgcmVzb2x2ZSwgcmVqZWN0KSB7XG4gIHJldHVybiB7XG4gICAgc3VjY2VzczogZnVuY3Rpb24gKHJlc3BvbnNlKSB7XG4gICAgICBpZiAocmVxdWVzdC50cmlnZ2VyTmFtZSA9PT0gVHlwZXMuYWZ0ZXJGaW5kKSB7XG4gICAgICAgIGlmICghcmVzcG9uc2UpIHtcbiAgICAgICAgICByZXNwb25zZSA9IHJlcXVlc3Qub2JqZWN0cztcbiAgICAgICAgfVxuICAgICAgICByZXNwb25zZSA9IHJlc3BvbnNlLm1hcChvYmplY3QgPT4ge1xuICAgICAgICAgIHJldHVybiB0b0pTT053aXRoT2JqZWN0cyhvYmplY3QpO1xuICAgICAgICB9KTtcbiAgICAgICAgcmV0dXJuIHJlc29sdmUocmVzcG9uc2UpO1xuICAgICAgfVxuICAgICAgLy8gVXNlIHRoZSBKU09OIHJlc3BvbnNlXG4gICAgICBpZiAoXG4gICAgICAgIHJlc3BvbnNlICYmXG4gICAgICAgIHR5cGVvZiByZXNwb25zZSA9PT0gJ29iamVjdCcgJiZcbiAgICAgICAgIXJlcXVlc3Qub2JqZWN0LmVxdWFscyhyZXNwb25zZSkgJiZcbiAgICAgICAgcmVxdWVzdC50cmlnZ2VyTmFtZSA9PT0gVHlwZXMuYmVmb3JlU2F2ZVxuICAgICAgKSB7XG4gICAgICAgIHJldHVybiByZXNvbHZlKHJlc3BvbnNlKTtcbiAgICAgIH1cbiAgICAgIGlmIChyZXNwb25zZSAmJiB0eXBlb2YgcmVzcG9uc2UgPT09ICdvYmplY3QnICYmIHJlcXVlc3QudHJpZ2dlck5hbWUgPT09IFR5cGVzLmFmdGVyU2F2ZSkge1xuICAgICAgICByZXR1cm4gcmVzb2x2ZShyZXNwb25zZSk7XG4gICAgICB9XG4gICAgICBpZiAocmVxdWVzdC50cmlnZ2VyTmFtZSA9PT0gVHlwZXMuYWZ0ZXJTYXZlKSB7XG4gICAgICAgIHJldHVybiByZXNvbHZlKCk7XG4gICAgICB9XG4gICAgICByZXNwb25zZSA9IHt9O1xuICAgICAgaWYgKHJlcXVlc3QudHJpZ2dlck5hbWUgPT09IFR5cGVzLmJlZm9yZVNhdmUpIHtcbiAgICAgICAgcmVzcG9uc2VbJ29iamVjdCddID0gcmVxdWVzdC5vYmplY3QuX2dldFNhdmVKU09OKCk7XG4gICAgICAgIHJlc3BvbnNlWydvYmplY3QnXVsnb2JqZWN0SWQnXSA9IHJlcXVlc3Qub2JqZWN0LmlkO1xuICAgICAgfVxuICAgICAgcmV0dXJuIHJlc29sdmUocmVzcG9uc2UpO1xuICAgIH0sXG4gICAgZXJyb3I6IGZ1bmN0aW9uIChlcnJvcikge1xuICAgICAgY29uc3QgZSA9IHJlc29sdmVFcnJvcihlcnJvciwge1xuICAgICAgICBjb2RlOiBQYXJzZS5FcnJvci5TQ1JJUFRfRkFJTEVELFxuICAgICAgICBtZXNzYWdlOiAnU2NyaXB0IGZhaWxlZC4gVW5rbm93biBlcnJvci4nLFxuICAgICAgfSk7XG4gICAgICByZWplY3QoZSk7XG4gICAgfSxcbiAgfTtcbn1cblxuZnVuY3Rpb24gdXNlcklkRm9yTG9nKGF1dGgpIHtcbiAgcmV0dXJuIGF1dGggJiYgYXV0aC51c2VyID8gYXV0aC51c2VyLmlkIDogdW5kZWZpbmVkO1xufVxuXG5mdW5jdGlvbiBsb2dUcmlnZ2VyQWZ0ZXJIb29rKHRyaWdnZXJUeXBlLCBjbGFzc05hbWUsIGlucHV0LCBhdXRoKSB7XG4gIGNvbnN0IGNsZWFuSW5wdXQgPSBsb2dnZXIudHJ1bmNhdGVMb2dNZXNzYWdlKEpTT04uc3RyaW5naWZ5KGlucHV0KSk7XG4gIGxvZ2dlci5pbmZvKFxuICAgIGAke3RyaWdnZXJUeXBlfSB0cmlnZ2VyZWQgZm9yICR7Y2xhc3NOYW1lfSBmb3IgdXNlciAke3VzZXJJZEZvckxvZyhcbiAgICAgIGF1dGhcbiAgICApfTpcXG4gIElucHV0OiAke2NsZWFuSW5wdXR9YCxcbiAgICB7XG4gICAgICBjbGFzc05hbWUsXG4gICAgICB0cmlnZ2VyVHlwZSxcbiAgICAgIHVzZXI6IHVzZXJJZEZvckxvZyhhdXRoKSxcbiAgICB9XG4gICk7XG59XG5cbmZ1bmN0aW9uIGxvZ1RyaWdnZXJTdWNjZXNzQmVmb3JlSG9vayh0cmlnZ2VyVHlwZSwgY2xhc3NOYW1lLCBpbnB1dCwgcmVzdWx0LCBhdXRoKSB7XG4gIGNvbnN0IGNsZWFuSW5wdXQgPSBsb2dnZXIudHJ1bmNhdGVMb2dNZXNzYWdlKEpTT04uc3RyaW5naWZ5KGlucHV0KSk7XG4gIGNvbnN0IGNsZWFuUmVzdWx0ID0gbG9nZ2VyLnRydW5jYXRlTG9nTWVzc2FnZShKU09OLnN0cmluZ2lmeShyZXN1bHQpKTtcbiAgbG9nZ2VyLmluZm8oXG4gICAgYCR7dHJpZ2dlclR5cGV9IHRyaWdnZXJlZCBmb3IgJHtjbGFzc05hbWV9IGZvciB1c2VyICR7dXNlcklkRm9yTG9nKFxuICAgICAgYXV0aFxuICAgICl9OlxcbiAgSW5wdXQ6ICR7Y2xlYW5JbnB1dH1cXG4gIFJlc3VsdDogJHtjbGVhblJlc3VsdH1gLFxuICAgIHtcbiAgICAgIGNsYXNzTmFtZSxcbiAgICAgIHRyaWdnZXJUeXBlLFxuICAgICAgdXNlcjogdXNlcklkRm9yTG9nKGF1dGgpLFxuICAgIH1cbiAgKTtcbn1cblxuZnVuY3Rpb24gbG9nVHJpZ2dlckVycm9yQmVmb3JlSG9vayh0cmlnZ2VyVHlwZSwgY2xhc3NOYW1lLCBpbnB1dCwgYXV0aCwgZXJyb3IpIHtcbiAgY29uc3QgY2xlYW5JbnB1dCA9IGxvZ2dlci50cnVuY2F0ZUxvZ01lc3NhZ2UoSlNPTi5zdHJpbmdpZnkoaW5wdXQpKTtcbiAgbG9nZ2VyLmVycm9yKFxuICAgIGAke3RyaWdnZXJUeXBlfSBmYWlsZWQgZm9yICR7Y2xhc3NOYW1lfSBmb3IgdXNlciAke3VzZXJJZEZvckxvZyhcbiAgICAgIGF1dGhcbiAgICApfTpcXG4gIElucHV0OiAke2NsZWFuSW5wdXR9XFxuICBFcnJvcjogJHtKU09OLnN0cmluZ2lmeShlcnJvcil9YCxcbiAgICB7XG4gICAgICBjbGFzc05hbWUsXG4gICAgICB0cmlnZ2VyVHlwZSxcbiAgICAgIGVycm9yLFxuICAgICAgdXNlcjogdXNlcklkRm9yTG9nKGF1dGgpLFxuICAgIH1cbiAgKTtcbn1cblxuZXhwb3J0IGZ1bmN0aW9uIG1heWJlUnVuQWZ0ZXJGaW5kVHJpZ2dlcihcbiAgdHJpZ2dlclR5cGUsXG4gIGF1dGgsXG4gIGNsYXNzTmFtZSxcbiAgb2JqZWN0cyxcbiAgY29uZmlnLFxuICBxdWVyeSxcbiAgY29udGV4dFxuKSB7XG4gIHJldHVybiBuZXcgUHJvbWlzZSgocmVzb2x2ZSwgcmVqZWN0KSA9PiB7XG4gICAgY29uc3QgdHJpZ2dlciA9IGdldFRyaWdnZXIoY2xhc3NOYW1lLCB0cmlnZ2VyVHlwZSwgY29uZmlnLmFwcGxpY2F0aW9uSWQpO1xuICAgIGlmICghdHJpZ2dlcikge1xuICAgICAgcmV0dXJuIHJlc29sdmUoKTtcbiAgICB9XG4gICAgY29uc3QgcmVxdWVzdCA9IGdldFJlcXVlc3RPYmplY3QodHJpZ2dlclR5cGUsIGF1dGgsIG51bGwsIG51bGwsIGNvbmZpZywgY29udGV4dCk7XG4gICAgaWYgKHF1ZXJ5KSB7XG4gICAgICByZXF1ZXN0LnF1ZXJ5ID0gcXVlcnk7XG4gICAgfVxuICAgIGNvbnN0IHsgc3VjY2VzcywgZXJyb3IgfSA9IGdldFJlc3BvbnNlT2JqZWN0KFxuICAgICAgcmVxdWVzdCxcbiAgICAgIG9iamVjdCA9PiB7XG4gICAgICAgIHJlc29sdmUob2JqZWN0KTtcbiAgICAgIH0sXG4gICAgICBlcnJvciA9PiB7XG4gICAgICAgIHJlamVjdChlcnJvcik7XG4gICAgICB9XG4gICAgKTtcbiAgICBsb2dUcmlnZ2VyU3VjY2Vzc0JlZm9yZUhvb2sodHJpZ2dlclR5cGUsIGNsYXNzTmFtZSwgJ0FmdGVyRmluZCcsIEpTT04uc3RyaW5naWZ5KG9iamVjdHMpLCBhdXRoKTtcbiAgICByZXF1ZXN0Lm9iamVjdHMgPSBvYmplY3RzLm1hcChvYmplY3QgPT4ge1xuICAgICAgLy9zZXR0aW5nIHRoZSBjbGFzcyBuYW1lIHRvIHRyYW5zZm9ybSBpbnRvIHBhcnNlIG9iamVjdFxuICAgICAgb2JqZWN0LmNsYXNzTmFtZSA9IGNsYXNzTmFtZTtcbiAgICAgIHJldHVybiBQYXJzZS5PYmplY3QuZnJvbUpTT04ob2JqZWN0KTtcbiAgICB9KTtcbiAgICByZXR1cm4gUHJvbWlzZS5yZXNvbHZlKClcbiAgICAgIC50aGVuKCgpID0+IHtcbiAgICAgICAgcmV0dXJuIG1heWJlUnVuVmFsaWRhdG9yKHJlcXVlc3QsIGAke3RyaWdnZXJUeXBlfS4ke2NsYXNzTmFtZX1gLCBhdXRoKTtcbiAgICAgIH0pXG4gICAgICAudGhlbigoKSA9PiB7XG4gICAgICAgIGlmIChyZXF1ZXN0LnNraXBXaXRoTWFzdGVyS2V5KSB7XG4gICAgICAgICAgcmV0dXJuIHJlcXVlc3Qub2JqZWN0cztcbiAgICAgICAgfVxuICAgICAgICBjb25zdCByZXNwb25zZSA9IHRyaWdnZXIocmVxdWVzdCk7XG4gICAgICAgIGlmIChyZXNwb25zZSAmJiB0eXBlb2YgcmVzcG9uc2UudGhlbiA9PT0gJ2Z1bmN0aW9uJykge1xuICAgICAgICAgIHJldHVybiByZXNwb25zZS50aGVuKHJlc3VsdHMgPT4ge1xuICAgICAgICAgICAgcmV0dXJuIHJlc3VsdHM7XG4gICAgICAgICAgfSk7XG4gICAgICAgIH1cbiAgICAgICAgcmV0dXJuIHJlc3BvbnNlO1xuICAgICAgfSlcbiAgICAgIC50aGVuKHN1Y2Nlc3MsIGVycm9yKTtcbiAgfSkudGhlbihyZXN1bHRzID0+IHtcbiAgICBsb2dUcmlnZ2VyQWZ0ZXJIb29rKHRyaWdnZXJUeXBlLCBjbGFzc05hbWUsIEpTT04uc3RyaW5naWZ5KHJlc3VsdHMpLCBhdXRoKTtcbiAgICByZXR1cm4gcmVzdWx0cztcbiAgfSk7XG59XG5cbmV4cG9ydCBmdW5jdGlvbiBtYXliZVJ1blF1ZXJ5VHJpZ2dlcihcbiAgdHJpZ2dlclR5cGUsXG4gIGNsYXNzTmFtZSxcbiAgcmVzdFdoZXJlLFxuICByZXN0T3B0aW9ucyxcbiAgY29uZmlnLFxuICBhdXRoLFxuICBjb250ZXh0LFxuICBpc0dldFxuKSB7XG4gIGNvbnN0IHRyaWdnZXIgPSBnZXRUcmlnZ2VyKGNsYXNzTmFtZSwgdHJpZ2dlclR5cGUsIGNvbmZpZy5hcHBsaWNhdGlvbklkKTtcbiAgaWYgKCF0cmlnZ2VyKSB7XG4gICAgcmV0dXJuIFByb21pc2UucmVzb2x2ZSh7XG4gICAgICByZXN0V2hlcmUsXG4gICAgICByZXN0T3B0aW9ucyxcbiAgICB9KTtcbiAgfVxuICBjb25zdCBqc29uID0gT2JqZWN0LmFzc2lnbih7fSwgcmVzdE9wdGlvbnMpO1xuICBqc29uLndoZXJlID0gcmVzdFdoZXJlO1xuXG4gIGNvbnN0IHBhcnNlUXVlcnkgPSBuZXcgUGFyc2UuUXVlcnkoY2xhc3NOYW1lKTtcbiAgcGFyc2VRdWVyeS53aXRoSlNPTihqc29uKTtcblxuICBsZXQgY291bnQgPSBmYWxzZTtcbiAgaWYgKHJlc3RPcHRpb25zKSB7XG4gICAgY291bnQgPSAhIXJlc3RPcHRpb25zLmNvdW50O1xuICB9XG4gIGNvbnN0IHJlcXVlc3RPYmplY3QgPSBnZXRSZXF1ZXN0UXVlcnlPYmplY3QoXG4gICAgdHJpZ2dlclR5cGUsXG4gICAgYXV0aCxcbiAgICBwYXJzZVF1ZXJ5LFxuICAgIGNvdW50LFxuICAgIGNvbmZpZyxcbiAgICBjb250ZXh0LFxuICAgIGlzR2V0XG4gICk7XG4gIHJldHVybiBQcm9taXNlLnJlc29sdmUoKVxuICAgIC50aGVuKCgpID0+IHtcbiAgICAgIHJldHVybiBtYXliZVJ1blZhbGlkYXRvcihyZXF1ZXN0T2JqZWN0LCBgJHt0cmlnZ2VyVHlwZX0uJHtjbGFzc05hbWV9YCwgYXV0aCk7XG4gICAgfSlcbiAgICAudGhlbigoKSA9PiB7XG4gICAgICBpZiAocmVxdWVzdE9iamVjdC5za2lwV2l0aE1hc3RlcktleSkge1xuICAgICAgICByZXR1cm4gcmVxdWVzdE9iamVjdC5xdWVyeTtcbiAgICAgIH1cbiAgICAgIHJldHVybiB0cmlnZ2VyKHJlcXVlc3RPYmplY3QpO1xuICAgIH0pXG4gICAgLnRoZW4oXG4gICAgICByZXN1bHQgPT4ge1xuICAgICAgICBsZXQgcXVlcnlSZXN1bHQgPSBwYXJzZVF1ZXJ5O1xuICAgICAgICBpZiAocmVzdWx0ICYmIHJlc3VsdCBpbnN0YW5jZW9mIFBhcnNlLlF1ZXJ5KSB7XG4gICAgICAgICAgcXVlcnlSZXN1bHQgPSByZXN1bHQ7XG4gICAgICAgIH1cbiAgICAgICAgY29uc3QganNvblF1ZXJ5ID0gcXVlcnlSZXN1bHQudG9KU09OKCk7XG4gICAgICAgIGlmIChqc29uUXVlcnkud2hlcmUpIHtcbiAgICAgICAgICByZXN0V2hlcmUgPSBqc29uUXVlcnkud2hlcmU7XG4gICAgICAgIH1cbiAgICAgICAgaWYgKGpzb25RdWVyeS5saW1pdCkge1xuICAgICAgICAgIHJlc3RPcHRpb25zID0gcmVzdE9wdGlvbnMgfHwge307XG4gICAgICAgICAgcmVzdE9wdGlvbnMubGltaXQgPSBqc29uUXVlcnkubGltaXQ7XG4gICAgICAgIH1cbiAgICAgICAgaWYgKGpzb25RdWVyeS5za2lwKSB7XG4gICAgICAgICAgcmVzdE9wdGlvbnMgPSByZXN0T3B0aW9ucyB8fCB7fTtcbiAgICAgICAgICByZXN0T3B0aW9ucy5za2lwID0ganNvblF1ZXJ5LnNraXA7XG4gICAgICAgIH1cbiAgICAgICAgaWYgKGpzb25RdWVyeS5pbmNsdWRlKSB7XG4gICAgICAgICAgcmVzdE9wdGlvbnMgPSByZXN0T3B0aW9ucyB8fCB7fTtcbiAgICAgICAgICByZXN0T3B0aW9ucy5pbmNsdWRlID0ganNvblF1ZXJ5LmluY2x1ZGU7XG4gICAgICAgIH1cbiAgICAgICAgaWYgKGpzb25RdWVyeS5leGNsdWRlS2V5cykge1xuICAgICAgICAgIHJlc3RPcHRpb25zID0gcmVzdE9wdGlvbnMgfHwge307XG4gICAgICAgICAgcmVzdE9wdGlvbnMuZXhjbHVkZUtleXMgPSBqc29uUXVlcnkuZXhjbHVkZUtleXM7XG4gICAgICAgIH1cbiAgICAgICAgaWYgKGpzb25RdWVyeS5leHBsYWluKSB7XG4gICAgICAgICAgcmVzdE9wdGlvbnMgPSByZXN0T3B0aW9ucyB8fCB7fTtcbiAgICAgICAgICByZXN0T3B0aW9ucy5leHBsYWluID0ganNvblF1ZXJ5LmV4cGxhaW47XG4gICAgICAgIH1cbiAgICAgICAgaWYgKGpzb25RdWVyeS5rZXlzKSB7XG4gICAgICAgICAgcmVzdE9wdGlvbnMgPSByZXN0T3B0aW9ucyB8fCB7fTtcbiAgICAgICAgICByZXN0T3B0aW9ucy5rZXlzID0ganNvblF1ZXJ5LmtleXM7XG4gICAgICAgIH1cbiAgICAgICAgaWYgKGpzb25RdWVyeS5vcmRlcikge1xuICAgICAgICAgIHJlc3RPcHRpb25zID0gcmVzdE9wdGlvbnMgfHwge307XG4gICAgICAgICAgcmVzdE9wdGlvbnMub3JkZXIgPSBqc29uUXVlcnkub3JkZXI7XG4gICAgICAgIH1cbiAgICAgICAgaWYgKGpzb25RdWVyeS5oaW50KSB7XG4gICAgICAgICAgcmVzdE9wdGlvbnMgPSByZXN0T3B0aW9ucyB8fCB7fTtcbiAgICAgICAgICByZXN0T3B0aW9ucy5oaW50ID0ganNvblF1ZXJ5LmhpbnQ7XG4gICAgICAgIH1cbiAgICAgICAgaWYgKHJlcXVlc3RPYmplY3QucmVhZFByZWZlcmVuY2UpIHtcbiAgICAgICAgICByZXN0T3B0aW9ucyA9IHJlc3RPcHRpb25zIHx8IHt9O1xuICAgICAgICAgIHJlc3RPcHRpb25zLnJlYWRQcmVmZXJlbmNlID0gcmVxdWVzdE9iamVjdC5yZWFkUHJlZmVyZW5jZTtcbiAgICAgICAgfVxuICAgICAgICBpZiAocmVxdWVzdE9iamVjdC5pbmNsdWRlUmVhZFByZWZlcmVuY2UpIHtcbiAgICAgICAgICByZXN0T3B0aW9ucyA9IHJlc3RPcHRpb25zIHx8IHt9O1xuICAgICAgICAgIHJlc3RPcHRpb25zLmluY2x1ZGVSZWFkUHJlZmVyZW5jZSA9IHJlcXVlc3RPYmplY3QuaW5jbHVkZVJlYWRQcmVmZXJlbmNlO1xuICAgICAgICB9XG4gICAgICAgIGlmIChyZXF1ZXN0T2JqZWN0LnN1YnF1ZXJ5UmVhZFByZWZlcmVuY2UpIHtcbiAgICAgICAgICByZXN0T3B0aW9ucyA9IHJlc3RPcHRpb25zIHx8IHt9O1xuICAgICAgICAgIHJlc3RPcHRpb25zLnN1YnF1ZXJ5UmVhZFByZWZlcmVuY2UgPSByZXF1ZXN0T2JqZWN0LnN1YnF1ZXJ5UmVhZFByZWZlcmVuY2U7XG4gICAgICAgIH1cbiAgICAgICAgcmV0dXJuIHtcbiAgICAgICAgICByZXN0V2hlcmUsXG4gICAgICAgICAgcmVzdE9wdGlvbnMsXG4gICAgICAgIH07XG4gICAgICB9LFxuICAgICAgZXJyID0+IHtcbiAgICAgICAgY29uc3QgZXJyb3IgPSByZXNvbHZlRXJyb3IoZXJyLCB7XG4gICAgICAgICAgY29kZTogUGFyc2UuRXJyb3IuU0NSSVBUX0ZBSUxFRCxcbiAgICAgICAgICBtZXNzYWdlOiAnU2NyaXB0IGZhaWxlZC4gVW5rbm93biBlcnJvci4nLFxuICAgICAgICB9KTtcbiAgICAgICAgdGhyb3cgZXJyb3I7XG4gICAgICB9XG4gICAgKTtcbn1cblxuZXhwb3J0IGZ1bmN0aW9uIHJlc29sdmVFcnJvcihtZXNzYWdlLCBkZWZhdWx0T3B0cykge1xuICBpZiAoIWRlZmF1bHRPcHRzKSB7XG4gICAgZGVmYXVsdE9wdHMgPSB7fTtcbiAgfVxuICBpZiAoIW1lc3NhZ2UpIHtcbiAgICByZXR1cm4gbmV3IFBhcnNlLkVycm9yKFxuICAgICAgZGVmYXVsdE9wdHMuY29kZSB8fCBQYXJzZS5FcnJvci5TQ1JJUFRfRkFJTEVELFxuICAgICAgZGVmYXVsdE9wdHMubWVzc2FnZSB8fCAnU2NyaXB0IGZhaWxlZC4nXG4gICAgKTtcbiAgfVxuICBpZiAobWVzc2FnZSBpbnN0YW5jZW9mIFBhcnNlLkVycm9yKSB7XG4gICAgcmV0dXJuIG1lc3NhZ2U7XG4gIH1cblxuICBjb25zdCBjb2RlID0gZGVmYXVsdE9wdHMuY29kZSB8fCBQYXJzZS5FcnJvci5TQ1JJUFRfRkFJTEVEO1xuICAvLyBJZiBpdCdzIGFuIGVycm9yLCBtYXJrIGl0IGFzIGEgc2NyaXB0IGZhaWxlZFxuICBpZiAodHlwZW9mIG1lc3NhZ2UgPT09ICdzdHJpbmcnKSB7XG4gICAgcmV0dXJuIG5ldyBQYXJzZS5FcnJvcihjb2RlLCBtZXNzYWdlKTtcbiAgfVxuICBjb25zdCBlcnJvciA9IG5ldyBQYXJzZS5FcnJvcihjb2RlLCBtZXNzYWdlLm1lc3NhZ2UgfHwgbWVzc2FnZSk7XG4gIGlmIChtZXNzYWdlIGluc3RhbmNlb2YgRXJyb3IpIHtcbiAgICBlcnJvci5zdGFjayA9IG1lc3NhZ2Uuc3RhY2s7XG4gIH1cbiAgcmV0dXJuIGVycm9yO1xufVxuZXhwb3J0IGZ1bmN0aW9uIG1heWJlUnVuVmFsaWRhdG9yKHJlcXVlc3QsIGZ1bmN0aW9uTmFtZSwgYXV0aCkge1xuICBjb25zdCB0aGVWYWxpZGF0b3IgPSBnZXRWYWxpZGF0b3IoZnVuY3Rpb25OYW1lLCBQYXJzZS5hcHBsaWNhdGlvbklkKTtcbiAgaWYgKCF0aGVWYWxpZGF0b3IpIHtcbiAgICByZXR1cm47XG4gIH1cbiAgaWYgKHR5cGVvZiB0aGVWYWxpZGF0b3IgPT09ICdvYmplY3QnICYmIHRoZVZhbGlkYXRvci5za2lwV2l0aE1hc3RlcktleSAmJiByZXF1ZXN0Lm1hc3Rlcikge1xuICAgIHJlcXVlc3Quc2tpcFdpdGhNYXN0ZXJLZXkgPSB0cnVlO1xuICB9XG4gIHJldHVybiBuZXcgUHJvbWlzZSgocmVzb2x2ZSwgcmVqZWN0KSA9PiB7XG4gICAgcmV0dXJuIFByb21pc2UucmVzb2x2ZSgpXG4gICAgICAudGhlbigoKSA9PiB7XG4gICAgICAgIHJldHVybiB0eXBlb2YgdGhlVmFsaWRhdG9yID09PSAnb2JqZWN0J1xuICAgICAgICAgID8gYnVpbHRJblRyaWdnZXJWYWxpZGF0b3IodGhlVmFsaWRhdG9yLCByZXF1ZXN0LCBhdXRoKVxuICAgICAgICAgIDogdGhlVmFsaWRhdG9yKHJlcXVlc3QpO1xuICAgICAgfSlcbiAgICAgIC50aGVuKCgpID0+IHtcbiAgICAgICAgcmVzb2x2ZSgpO1xuICAgICAgfSlcbiAgICAgIC5jYXRjaChlID0+IHtcbiAgICAgICAgY29uc3QgZXJyb3IgPSByZXNvbHZlRXJyb3IoZSwge1xuICAgICAgICAgIGNvZGU6IFBhcnNlLkVycm9yLlZBTElEQVRJT05fRVJST1IsXG4gICAgICAgICAgbWVzc2FnZTogJ1ZhbGlkYXRpb24gZmFpbGVkLicsXG4gICAgICAgIH0pO1xuICAgICAgICByZWplY3QoZXJyb3IpO1xuICAgICAgfSk7XG4gIH0pO1xufVxuYXN5bmMgZnVuY3Rpb24gYnVpbHRJblRyaWdnZXJWYWxpZGF0b3Iob3B0aW9ucywgcmVxdWVzdCwgYXV0aCkge1xuICBpZiAocmVxdWVzdC5tYXN0ZXIgJiYgIW9wdGlvbnMudmFsaWRhdGVNYXN0ZXJLZXkpIHtcbiAgICByZXR1cm47XG4gIH1cbiAgbGV0IHJlcVVzZXIgPSByZXF1ZXN0LnVzZXI7XG4gIGlmIChcbiAgICAhcmVxVXNlciAmJlxuICAgIHJlcXVlc3Qub2JqZWN0ICYmXG4gICAgcmVxdWVzdC5vYmplY3QuY2xhc3NOYW1lID09PSAnX1VzZXInICYmXG4gICAgIXJlcXVlc3Qub2JqZWN0LmV4aXN0ZWQoKVxuICApIHtcbiAgICByZXFVc2VyID0gcmVxdWVzdC5vYmplY3Q7XG4gIH1cbiAgaWYgKFxuICAgIChvcHRpb25zLnJlcXVpcmVVc2VyIHx8IG9wdGlvbnMucmVxdWlyZUFueVVzZXJSb2xlcyB8fCBvcHRpb25zLnJlcXVpcmVBbGxVc2VyUm9sZXMpICYmXG4gICAgIXJlcVVzZXJcbiAgKSB7XG4gICAgdGhyb3cgJ1ZhbGlkYXRpb24gZmFpbGVkLiBQbGVhc2UgbG9naW4gdG8gY29udGludWUuJztcbiAgfVxuICBpZiAob3B0aW9ucy5yZXF1aXJlTWFzdGVyICYmICFyZXF1ZXN0Lm1hc3Rlcikge1xuICAgIHRocm93ICdWYWxpZGF0aW9uIGZhaWxlZC4gTWFzdGVyIGtleSBpcyByZXF1aXJlZCB0byBjb21wbGV0ZSB0aGlzIHJlcXVlc3QuJztcbiAgfVxuICBsZXQgcGFyYW1zID0gcmVxdWVzdC5wYXJhbXMgfHwge307XG4gIGlmIChyZXF1ZXN0Lm9iamVjdCkge1xuICAgIHBhcmFtcyA9IHJlcXVlc3Qub2JqZWN0LnRvSlNPTigpO1xuICB9XG4gIGNvbnN0IHJlcXVpcmVkUGFyYW0gPSBrZXkgPT4ge1xuICAgIGNvbnN0IHZhbHVlID0gcGFyYW1zW2tleV07XG4gICAgaWYgKHZhbHVlID09IG51bGwpIHtcbiAgICAgIHRocm93IGBWYWxpZGF0aW9uIGZhaWxlZC4gUGxlYXNlIHNwZWNpZnkgZGF0YSBmb3IgJHtrZXl9LmA7XG4gICAgfVxuICB9O1xuXG4gIGNvbnN0IHZhbGlkYXRlT3B0aW9ucyA9IGFzeW5jIChvcHQsIGtleSwgdmFsKSA9PiB7XG4gICAgbGV0IG9wdHMgPSBvcHQub3B0aW9ucztcbiAgICBpZiAodHlwZW9mIG9wdHMgPT09ICdmdW5jdGlvbicpIHtcbiAgICAgIHRyeSB7XG4gICAgICAgIGNvbnN0IHJlc3VsdCA9IGF3YWl0IG9wdHModmFsKTtcbiAgICAgICAgaWYgKCFyZXN1bHQgJiYgcmVzdWx0ICE9IG51bGwpIHtcbiAgICAgICAgICB0aHJvdyBvcHQuZXJyb3IgfHwgYFZhbGlkYXRpb24gZmFpbGVkLiBJbnZhbGlkIHZhbHVlIGZvciAke2tleX0uYDtcbiAgICAgICAgfVxuICAgICAgfSBjYXRjaCAoZSkge1xuICAgICAgICBpZiAoIWUpIHtcbiAgICAgICAgICB0aHJvdyBvcHQuZXJyb3IgfHwgYFZhbGlkYXRpb24gZmFpbGVkLiBJbnZhbGlkIHZhbHVlIGZvciAke2tleX0uYDtcbiAgICAgICAgfVxuXG4gICAgICAgIHRocm93IG9wdC5lcnJvciB8fCBlLm1lc3NhZ2UgfHwgZTtcbiAgICAgIH1cbiAgICAgIHJldHVybjtcbiAgICB9XG4gICAgaWYgKCFBcnJheS5pc0FycmF5KG9wdHMpKSB7XG4gICAgICBvcHRzID0gW29wdC5vcHRpb25zXTtcbiAgICB9XG5cbiAgICBpZiAoIW9wdHMuaW5jbHVkZXModmFsKSkge1xuICAgICAgdGhyb3cgKFxuICAgICAgICBvcHQuZXJyb3IgfHwgYFZhbGlkYXRpb24gZmFpbGVkLiBJbnZhbGlkIG9wdGlvbiBmb3IgJHtrZXl9LiBFeHBlY3RlZDogJHtvcHRzLmpvaW4oJywgJyl9YFxuICAgICAgKTtcbiAgICB9XG4gIH07XG5cbiAgY29uc3QgZ2V0VHlwZSA9IGZuID0+IHtcbiAgICBjb25zdCBtYXRjaCA9IGZuICYmIGZuLnRvU3RyaW5nKCkubWF0Y2goL15cXHMqZnVuY3Rpb24gKFxcdyspLyk7XG4gICAgcmV0dXJuIChtYXRjaCA/IG1hdGNoWzFdIDogJycpLnRvTG93ZXJDYXNlKCk7XG4gIH07XG4gIGlmIChBcnJheS5pc0FycmF5KG9wdGlvbnMuZmllbGRzKSkge1xuICAgIGZvciAoY29uc3Qga2V5IG9mIG9wdGlvbnMuZmllbGRzKSB7XG4gICAgICByZXF1aXJlZFBhcmFtKGtleSk7XG4gICAgfVxuICB9IGVsc2Uge1xuICAgIGNvbnN0IG9wdGlvblByb21pc2VzID0gW107XG4gICAgZm9yIChjb25zdCBrZXkgaW4gb3B0aW9ucy5maWVsZHMpIHtcbiAgICAgIGNvbnN0IG9wdCA9IG9wdGlvbnMuZmllbGRzW2tleV07XG4gICAgICBsZXQgdmFsID0gcGFyYW1zW2tleV07XG4gICAgICBpZiAodHlwZW9mIG9wdCA9PT0gJ3N0cmluZycpIHtcbiAgICAgICAgcmVxdWlyZWRQYXJhbShvcHQpO1xuICAgICAgfVxuICAgICAgaWYgKHR5cGVvZiBvcHQgPT09ICdvYmplY3QnKSB7XG4gICAgICAgIGlmIChvcHQuZGVmYXVsdCAhPSBudWxsICYmIHZhbCA9PSBudWxsKSB7XG4gICAgICAgICAgdmFsID0gb3B0LmRlZmF1bHQ7XG4gICAgICAgICAgcGFyYW1zW2tleV0gPSB2YWw7XG4gICAgICAgICAgaWYgKHJlcXVlc3Qub2JqZWN0KSB7XG4gICAgICAgICAgICByZXF1ZXN0Lm9iamVjdC5zZXQoa2V5LCB2YWwpO1xuICAgICAgICAgIH1cbiAgICAgICAgfVxuICAgICAgICBpZiAob3B0LmNvbnN0YW50ICYmIHJlcXVlc3Qub2JqZWN0KSB7XG4gICAgICAgICAgaWYgKHJlcXVlc3Qub3JpZ2luYWwpIHtcbiAgICAgICAgICAgIHJlcXVlc3Qub2JqZWN0LnJldmVydChrZXkpO1xuICAgICAgICAgIH0gZWxzZSBpZiAob3B0LmRlZmF1bHQgIT0gbnVsbCkge1xuICAgICAgICAgICAgcmVxdWVzdC5vYmplY3Quc2V0KGtleSwgb3B0LmRlZmF1bHQpO1xuICAgICAgICAgIH1cbiAgICAgICAgfVxuICAgICAgICBpZiAob3B0LnJlcXVpcmVkKSB7XG4gICAgICAgICAgcmVxdWlyZWRQYXJhbShrZXkpO1xuICAgICAgICB9XG4gICAgICAgIGNvbnN0IG9wdGlvbmFsID0gIW9wdC5yZXF1aXJlZCAmJiB2YWwgPT09IHVuZGVmaW5lZDtcbiAgICAgICAgaWYgKCFvcHRpb25hbCkge1xuICAgICAgICAgIGlmIChvcHQudHlwZSkge1xuICAgICAgICAgICAgY29uc3QgdHlwZSA9IGdldFR5cGUob3B0LnR5cGUpO1xuICAgICAgICAgICAgY29uc3QgdmFsVHlwZSA9IEFycmF5LmlzQXJyYXkodmFsKSA/ICdhcnJheScgOiB0eXBlb2YgdmFsO1xuICAgICAgICAgICAgaWYgKHZhbFR5cGUgIT09IHR5cGUpIHtcbiAgICAgICAgICAgICAgdGhyb3cgYFZhbGlkYXRpb24gZmFpbGVkLiBJbnZhbGlkIHR5cGUgZm9yICR7a2V5fS4gRXhwZWN0ZWQ6ICR7dHlwZX1gO1xuICAgICAgICAgICAgfVxuICAgICAgICAgIH1cbiAgICAgICAgICBpZiAob3B0Lm9wdGlvbnMpIHtcbiAgICAgICAgICAgIG9wdGlvblByb21pc2VzLnB1c2godmFsaWRhdGVPcHRpb25zKG9wdCwga2V5LCB2YWwpKTtcbiAgICAgICAgICB9XG4gICAgICAgIH1cbiAgICAgIH1cbiAgICB9XG4gICAgYXdhaXQgUHJvbWlzZS5hbGwob3B0aW9uUHJvbWlzZXMpO1xuICB9XG4gIGxldCB1c2VyUm9sZXMgPSBvcHRpb25zLnJlcXVpcmVBbnlVc2VyUm9sZXM7XG4gIGxldCByZXF1aXJlQWxsUm9sZXMgPSBvcHRpb25zLnJlcXVpcmVBbGxVc2VyUm9sZXM7XG4gIGNvbnN0IHByb21pc2VzID0gW1Byb21pc2UucmVzb2x2ZSgpLCBQcm9taXNlLnJlc29sdmUoKSwgUHJvbWlzZS5yZXNvbHZlKCldO1xuICBpZiAodXNlclJvbGVzIHx8IHJlcXVpcmVBbGxSb2xlcykge1xuICAgIHByb21pc2VzWzBdID0gYXV0aC5nZXRVc2VyUm9sZXMoKTtcbiAgfVxuICBpZiAodHlwZW9mIHVzZXJSb2xlcyA9PT0gJ2Z1bmN0aW9uJykge1xuICAgIHByb21pc2VzWzFdID0gdXNlclJvbGVzKCk7XG4gIH1cbiAgaWYgKHR5cGVvZiByZXF1aXJlQWxsUm9sZXMgPT09ICdmdW5jdGlvbicpIHtcbiAgICBwcm9taXNlc1syXSA9IHJlcXVpcmVBbGxSb2xlcygpO1xuICB9XG4gIGNvbnN0IFtyb2xlcywgcmVzb2x2ZWRVc2VyUm9sZXMsIHJlc29sdmVkUmVxdWlyZUFsbF0gPSBhd2FpdCBQcm9taXNlLmFsbChwcm9taXNlcyk7XG4gIGlmIChyZXNvbHZlZFVzZXJSb2xlcyAmJiBBcnJheS5pc0FycmF5KHJlc29sdmVkVXNlclJvbGVzKSkge1xuICAgIHVzZXJSb2xlcyA9IHJlc29sdmVkVXNlclJvbGVzO1xuICB9XG4gIGlmIChyZXNvbHZlZFJlcXVpcmVBbGwgJiYgQXJyYXkuaXNBcnJheShyZXNvbHZlZFJlcXVpcmVBbGwpKSB7XG4gICAgcmVxdWlyZUFsbFJvbGVzID0gcmVzb2x2ZWRSZXF1aXJlQWxsO1xuICB9XG4gIGlmICh1c2VyUm9sZXMpIHtcbiAgICBjb25zdCBoYXNSb2xlID0gdXNlclJvbGVzLnNvbWUocmVxdWlyZWRSb2xlID0+IHJvbGVzLmluY2x1ZGVzKGByb2xlOiR7cmVxdWlyZWRSb2xlfWApKTtcbiAgICBpZiAoIWhhc1JvbGUpIHtcbiAgICAgIHRocm93IGBWYWxpZGF0aW9uIGZhaWxlZC4gVXNlciBkb2VzIG5vdCBtYXRjaCB0aGUgcmVxdWlyZWQgcm9sZXMuYDtcbiAgICB9XG4gIH1cbiAgaWYgKHJlcXVpcmVBbGxSb2xlcykge1xuICAgIGZvciAoY29uc3QgcmVxdWlyZWRSb2xlIG9mIHJlcXVpcmVBbGxSb2xlcykge1xuICAgICAgaWYgKCFyb2xlcy5pbmNsdWRlcyhgcm9sZToke3JlcXVpcmVkUm9sZX1gKSkge1xuICAgICAgICB0aHJvdyBgVmFsaWRhdGlvbiBmYWlsZWQuIFVzZXIgZG9lcyBub3QgbWF0Y2ggYWxsIHRoZSByZXF1aXJlZCByb2xlcy5gO1xuICAgICAgfVxuICAgIH1cbiAgfVxuICBjb25zdCB1c2VyS2V5cyA9IG9wdGlvbnMucmVxdWlyZVVzZXJLZXlzIHx8IFtdO1xuICBpZiAoQXJyYXkuaXNBcnJheSh1c2VyS2V5cykpIHtcbiAgICBmb3IgKGNvbnN0IGtleSBvZiB1c2VyS2V5cykge1xuICAgICAgaWYgKCFyZXFVc2VyKSB7XG4gICAgICAgIHRocm93ICdQbGVhc2UgbG9naW4gdG8gbWFrZSB0aGlzIHJlcXVlc3QuJztcbiAgICAgIH1cblxuICAgICAgaWYgKHJlcVVzZXIuZ2V0KGtleSkgPT0gbnVsbCkge1xuICAgICAgICB0aHJvdyBgVmFsaWRhdGlvbiBmYWlsZWQuIFBsZWFzZSBzZXQgZGF0YSBmb3IgJHtrZXl9IG9uIHlvdXIgYWNjb3VudC5gO1xuICAgICAgfVxuICAgIH1cbiAgfSBlbHNlIGlmICh0eXBlb2YgdXNlcktleXMgPT09ICdvYmplY3QnKSB7XG4gICAgY29uc3Qgb3B0aW9uUHJvbWlzZXMgPSBbXTtcbiAgICBmb3IgKGNvbnN0IGtleSBpbiBvcHRpb25zLnJlcXVpcmVVc2VyS2V5cykge1xuICAgICAgY29uc3Qgb3B0ID0gb3B0aW9ucy5yZXF1aXJlVXNlcktleXNba2V5XTtcbiAgICAgIGlmIChvcHQub3B0aW9ucykge1xuICAgICAgICBvcHRpb25Qcm9taXNlcy5wdXNoKHZhbGlkYXRlT3B0aW9ucyhvcHQsIGtleSwgcmVxVXNlci5nZXQoa2V5KSkpO1xuICAgICAgfVxuICAgIH1cbiAgICBhd2FpdCBQcm9taXNlLmFsbChvcHRpb25Qcm9taXNlcyk7XG4gIH1cbn1cblxuLy8gVG8gYmUgdXNlZCBhcyBwYXJ0IG9mIHRoZSBwcm9taXNlIGNoYWluIHdoZW4gc2F2aW5nL2RlbGV0aW5nIGFuIG9iamVjdFxuLy8gV2lsbCByZXNvbHZlIHN1Y2Nlc3NmdWxseSBpZiBubyB0cmlnZ2VyIGlzIGNvbmZpZ3VyZWRcbi8vIFJlc29sdmVzIHRvIGFuIG9iamVjdCwgZW1wdHkgb3IgY29udGFpbmluZyBhbiBvYmplY3Qga2V5LiBBIGJlZm9yZVNhdmVcbi8vIHRyaWdnZXIgd2lsbCBzZXQgdGhlIG9iamVjdCBrZXkgdG8gdGhlIHJlc3QgZm9ybWF0IG9iamVjdCB0byBzYXZlLlxuLy8gb3JpZ2luYWxQYXJzZU9iamVjdCBpcyBvcHRpb25hbCwgd2Ugb25seSBuZWVkIHRoYXQgZm9yIGJlZm9yZS9hZnRlclNhdmUgZnVuY3Rpb25zXG5leHBvcnQgZnVuY3Rpb24gbWF5YmVSdW5UcmlnZ2VyKFxuICB0cmlnZ2VyVHlwZSxcbiAgYXV0aCxcbiAgcGFyc2VPYmplY3QsXG4gIG9yaWdpbmFsUGFyc2VPYmplY3QsXG4gIGNvbmZpZyxcbiAgY29udGV4dFxuKSB7XG4gIGlmICghcGFyc2VPYmplY3QpIHtcbiAgICByZXR1cm4gUHJvbWlzZS5yZXNvbHZlKHt9KTtcbiAgfVxuICByZXR1cm4gbmV3IFByb21pc2UoZnVuY3Rpb24gKHJlc29sdmUsIHJlamVjdCkge1xuICAgIHZhciB0cmlnZ2VyID0gZ2V0VHJpZ2dlcihwYXJzZU9iamVjdC5jbGFzc05hbWUsIHRyaWdnZXJUeXBlLCBjb25maWcuYXBwbGljYXRpb25JZCk7XG4gICAgaWYgKCF0cmlnZ2VyKSByZXR1cm4gcmVzb2x2ZSgpO1xuICAgIHZhciByZXF1ZXN0ID0gZ2V0UmVxdWVzdE9iamVjdChcbiAgICAgIHRyaWdnZXJUeXBlLFxuICAgICAgYXV0aCxcbiAgICAgIHBhcnNlT2JqZWN0LFxuICAgICAgb3JpZ2luYWxQYXJzZU9iamVjdCxcbiAgICAgIGNvbmZpZyxcbiAgICAgIGNvbnRleHRcbiAgICApO1xuICAgIHZhciB7IHN1Y2Nlc3MsIGVycm9yIH0gPSBnZXRSZXNwb25zZU9iamVjdChcbiAgICAgIHJlcXVlc3QsXG4gICAgICBvYmplY3QgPT4ge1xuICAgICAgICBsb2dUcmlnZ2VyU3VjY2Vzc0JlZm9yZUhvb2soXG4gICAgICAgICAgdHJpZ2dlclR5cGUsXG4gICAgICAgICAgcGFyc2VPYmplY3QuY2xhc3NOYW1lLFxuICAgICAgICAgIHBhcnNlT2JqZWN0LnRvSlNPTigpLFxuICAgICAgICAgIG9iamVjdCxcbiAgICAgICAgICBhdXRoXG4gICAgICAgICk7XG4gICAgICAgIGlmIChcbiAgICAgICAgICB0cmlnZ2VyVHlwZSA9PT0gVHlwZXMuYmVmb3JlU2F2ZSB8fFxuICAgICAgICAgIHRyaWdnZXJUeXBlID09PSBUeXBlcy5hZnRlclNhdmUgfHxcbiAgICAgICAgICB0cmlnZ2VyVHlwZSA9PT0gVHlwZXMuYmVmb3JlRGVsZXRlIHx8XG4gICAgICAgICAgdHJpZ2dlclR5cGUgPT09IFR5cGVzLmFmdGVyRGVsZXRlXG4gICAgICAgICkge1xuICAgICAgICAgIE9iamVjdC5hc3NpZ24oY29udGV4dCwgcmVxdWVzdC5jb250ZXh0KTtcbiAgICAgICAgfVxuICAgICAgICByZXNvbHZlKG9iamVjdCk7XG4gICAgICB9LFxuICAgICAgZXJyb3IgPT4ge1xuICAgICAgICBsb2dUcmlnZ2VyRXJyb3JCZWZvcmVIb29rKFxuICAgICAgICAgIHRyaWdnZXJUeXBlLFxuICAgICAgICAgIHBhcnNlT2JqZWN0LmNsYXNzTmFtZSxcbiAgICAgICAgICBwYXJzZU9iamVjdC50b0pTT04oKSxcbiAgICAgICAgICBhdXRoLFxuICAgICAgICAgIGVycm9yXG4gICAgICAgICk7XG4gICAgICAgIHJlamVjdChlcnJvcik7XG4gICAgICB9XG4gICAgKTtcblxuICAgIC8vIEFmdGVyU2F2ZSBhbmQgYWZ0ZXJEZWxldGUgdHJpZ2dlcnMgY2FuIHJldHVybiBhIHByb21pc2UsIHdoaWNoIGlmIHRoZXlcbiAgICAvLyBkbywgbmVlZHMgdG8gYmUgcmVzb2x2ZWQgYmVmb3JlIHRoaXMgcHJvbWlzZSBpcyByZXNvbHZlZCxcbiAgICAvLyBzbyB0cmlnZ2VyIGV4ZWN1dGlvbiBpcyBzeW5jZWQgd2l0aCBSZXN0V3JpdGUuZXhlY3V0ZSgpIGNhbGwuXG4gICAgLy8gSWYgdHJpZ2dlcnMgZG8gbm90IHJldHVybiBhIHByb21pc2UsIHRoZXkgY2FuIHJ1biBhc3luYyBjb2RlIHBhcmFsbGVsXG4gICAgLy8gdG8gdGhlIFJlc3RXcml0ZS5leGVjdXRlKCkgY2FsbC5cbiAgICByZXR1cm4gUHJvbWlzZS5yZXNvbHZlKClcbiAgICAgIC50aGVuKCgpID0+IHtcbiAgICAgICAgcmV0dXJuIG1heWJlUnVuVmFsaWRhdG9yKHJlcXVlc3QsIGAke3RyaWdnZXJUeXBlfS4ke3BhcnNlT2JqZWN0LmNsYXNzTmFtZX1gLCBhdXRoKTtcbiAgICAgIH0pXG4gICAgICAudGhlbigoKSA9PiB7XG4gICAgICAgIGlmIChyZXF1ZXN0LnNraXBXaXRoTWFzdGVyS2V5KSB7XG4gICAgICAgICAgcmV0dXJuIFByb21pc2UucmVzb2x2ZSgpO1xuICAgICAgICB9XG4gICAgICAgIGNvbnN0IHByb21pc2UgPSB0cmlnZ2VyKHJlcXVlc3QpO1xuICAgICAgICBpZiAoXG4gICAgICAgICAgdHJpZ2dlclR5cGUgPT09IFR5cGVzLmFmdGVyU2F2ZSB8fFxuICAgICAgICAgIHRyaWdnZXJUeXBlID09PSBUeXBlcy5hZnRlckRlbGV0ZSB8fFxuICAgICAgICAgIHRyaWdnZXJUeXBlID09PSBUeXBlcy5hZnRlckxvZ2luXG4gICAgICAgICkge1xuICAgICAgICAgIGxvZ1RyaWdnZXJBZnRlckhvb2sodHJpZ2dlclR5cGUsIHBhcnNlT2JqZWN0LmNsYXNzTmFtZSwgcGFyc2VPYmplY3QudG9KU09OKCksIGF1dGgpO1xuICAgICAgICB9XG4gICAgICAgIC8vIGJlZm9yZVNhdmUgaXMgZXhwZWN0ZWQgdG8gcmV0dXJuIG51bGwgKG5vdGhpbmcpXG4gICAgICAgIGlmICh0cmlnZ2VyVHlwZSA9PT0gVHlwZXMuYmVmb3JlU2F2ZSkge1xuICAgICAgICAgIGlmIChwcm9taXNlICYmIHR5cGVvZiBwcm9taXNlLnRoZW4gPT09ICdmdW5jdGlvbicpIHtcbiAgICAgICAgICAgIHJldHVybiBwcm9taXNlLnRoZW4ocmVzcG9uc2UgPT4ge1xuICAgICAgICAgICAgICAvLyByZXNwb25zZS5vYmplY3QgbWF5IGNvbWUgZnJvbSBleHByZXNzIHJvdXRpbmcgYmVmb3JlIGhvb2tcbiAgICAgICAgICAgICAgaWYgKHJlc3BvbnNlICYmIHJlc3BvbnNlLm9iamVjdCkge1xuICAgICAgICAgICAgICAgIHJldHVybiByZXNwb25zZTtcbiAgICAgICAgICAgICAgfVxuICAgICAgICAgICAgICByZXR1cm4gbnVsbDtcbiAgICAgICAgICAgIH0pO1xuICAgICAgICAgIH1cbiAgICAgICAgICByZXR1cm4gbnVsbDtcbiAgICAgICAgfVxuXG4gICAgICAgIHJldHVybiBwcm9taXNlO1xuICAgICAgfSlcbiAgICAgIC50aGVuKHN1Y2Nlc3MsIGVycm9yKTtcbiAgfSk7XG59XG5cbi8vIENvbnZlcnRzIGEgUkVTVC1mb3JtYXQgb2JqZWN0IHRvIGEgUGFyc2UuT2JqZWN0XG4vLyBkYXRhIGlzIGVpdGhlciBjbGFzc05hbWUgb3IgYW4gb2JqZWN0XG5leHBvcnQgZnVuY3Rpb24gaW5mbGF0ZShkYXRhLCByZXN0T2JqZWN0KSB7XG4gIHZhciBjb3B5ID0gdHlwZW9mIGRhdGEgPT0gJ29iamVjdCcgPyBkYXRhIDogeyBjbGFzc05hbWU6IGRhdGEgfTtcbiAgZm9yICh2YXIga2V5IGluIHJlc3RPYmplY3QpIHtcbiAgICBjb3B5W2tleV0gPSByZXN0T2JqZWN0W2tleV07XG4gIH1cbiAgcmV0dXJuIFBhcnNlLk9iamVjdC5mcm9tSlNPTihjb3B5KTtcbn1cblxuZXhwb3J0IGZ1bmN0aW9uIHJ1bkxpdmVRdWVyeUV2ZW50SGFuZGxlcnMoZGF0YSwgYXBwbGljYXRpb25JZCA9IFBhcnNlLmFwcGxpY2F0aW9uSWQpIHtcbiAgaWYgKCFfdHJpZ2dlclN0b3JlIHx8ICFfdHJpZ2dlclN0b3JlW2FwcGxpY2F0aW9uSWRdIHx8ICFfdHJpZ2dlclN0b3JlW2FwcGxpY2F0aW9uSWRdLkxpdmVRdWVyeSkge1xuICAgIHJldHVybjtcbiAgfVxuICBfdHJpZ2dlclN0b3JlW2FwcGxpY2F0aW9uSWRdLkxpdmVRdWVyeS5mb3JFYWNoKGhhbmRsZXIgPT4gaGFuZGxlcihkYXRhKSk7XG59XG5cbmV4cG9ydCBmdW5jdGlvbiBnZXRSZXF1ZXN0RmlsZU9iamVjdCh0cmlnZ2VyVHlwZSwgYXV0aCwgZmlsZU9iamVjdCwgY29uZmlnKSB7XG4gIGNvbnN0IHJlcXVlc3QgPSB7XG4gICAgLi4uZmlsZU9iamVjdCxcbiAgICB0cmlnZ2VyTmFtZTogdHJpZ2dlclR5cGUsXG4gICAgbWFzdGVyOiBmYWxzZSxcbiAgICBsb2c6IGNvbmZpZy5sb2dnZXJDb250cm9sbGVyLFxuICAgIGhlYWRlcnM6IGNvbmZpZy5oZWFkZXJzLFxuICAgIGlwOiBjb25maWcuaXAsXG4gIH07XG5cbiAgaWYgKCFhdXRoKSB7XG4gICAgcmV0dXJuIHJlcXVlc3Q7XG4gIH1cbiAgaWYgKGF1dGguaXNNYXN0ZXIpIHtcbiAgICByZXF1ZXN0WydtYXN0ZXInXSA9IHRydWU7XG4gIH1cbiAgaWYgKGF1dGgudXNlcikge1xuICAgIHJlcXVlc3RbJ3VzZXInXSA9IGF1dGgudXNlcjtcbiAgfVxuICBpZiAoYXV0aC5pbnN0YWxsYXRpb25JZCkge1xuICAgIHJlcXVlc3RbJ2luc3RhbGxhdGlvbklkJ10gPSBhdXRoLmluc3RhbGxhdGlvbklkO1xuICB9XG4gIHJldHVybiByZXF1ZXN0O1xufVxuXG5leHBvcnQgYXN5bmMgZnVuY3Rpb24gbWF5YmVSdW5GaWxlVHJpZ2dlcih0cmlnZ2VyVHlwZSwgZmlsZU9iamVjdCwgY29uZmlnLCBhdXRoKSB7XG4gIGNvbnN0IEZpbGVDbGFzc05hbWUgPSBnZXRDbGFzc05hbWUoUGFyc2UuRmlsZSk7XG4gIGNvbnN0IGZpbGVUcmlnZ2VyID0gZ2V0VHJpZ2dlcihGaWxlQ2xhc3NOYW1lLCB0cmlnZ2VyVHlwZSwgY29uZmlnLmFwcGxpY2F0aW9uSWQpO1xuICBpZiAodHlwZW9mIGZpbGVUcmlnZ2VyID09PSAnZnVuY3Rpb24nKSB7XG4gICAgdHJ5IHtcbiAgICAgIGNvbnN0IHJlcXVlc3QgPSBnZXRSZXF1ZXN0RmlsZU9iamVjdCh0cmlnZ2VyVHlwZSwgYXV0aCwgZmlsZU9iamVjdCwgY29uZmlnKTtcbiAgICAgIGF3YWl0IG1heWJlUnVuVmFsaWRhdG9yKHJlcXVlc3QsIGAke3RyaWdnZXJUeXBlfS4ke0ZpbGVDbGFzc05hbWV9YCwgYXV0aCk7XG4gICAgICBpZiAocmVxdWVzdC5za2lwV2l0aE1hc3RlcktleSkge1xuICAgICAgICByZXR1cm4gZmlsZU9iamVjdDtcbiAgICAgIH1cbiAgICAgIGNvbnN0IHJlc3VsdCA9IGF3YWl0IGZpbGVUcmlnZ2VyKHJlcXVlc3QpO1xuICAgICAgbG9nVHJpZ2dlclN1Y2Nlc3NCZWZvcmVIb29rKFxuICAgICAgICB0cmlnZ2VyVHlwZSxcbiAgICAgICAgJ1BhcnNlLkZpbGUnLFxuICAgICAgICB7IC4uLmZpbGVPYmplY3QuZmlsZS50b0pTT04oKSwgZmlsZVNpemU6IGZpbGVPYmplY3QuZmlsZVNpemUgfSxcbiAgICAgICAgcmVzdWx0LFxuICAgICAgICBhdXRoXG4gICAgICApO1xuICAgICAgcmV0dXJuIHJlc3VsdCB8fCBmaWxlT2JqZWN0O1xuICAgIH0gY2F0Y2ggKGVycm9yKSB7XG4gICAgICBsb2dUcmlnZ2VyRXJyb3JCZWZvcmVIb29rKFxuICAgICAgICB0cmlnZ2VyVHlwZSxcbiAgICAgICAgJ1BhcnNlLkZpbGUnLFxuICAgICAgICB7IC4uLmZpbGVPYmplY3QuZmlsZS50b0pTT04oKSwgZmlsZVNpemU6IGZpbGVPYmplY3QuZmlsZVNpemUgfSxcbiAgICAgICAgYXV0aCxcbiAgICAgICAgZXJyb3JcbiAgICAgICk7XG4gICAgICB0aHJvdyBlcnJvcjtcbiAgICB9XG4gIH1cbiAgcmV0dXJuIGZpbGVPYmplY3Q7XG59XG4iXX0=