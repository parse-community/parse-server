// triggers.js
import Parse from 'parse/node';
import { logger } from './logger';
import { maybeRunValidator } from './cloud-code/Parse.Cloud.Validator.js';

export const Types = {
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
  afterEvent: 'afterEvent',
};

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
    LiveQuery,
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
  Triggers: 'Triggers',
};

function getStore(category, name, applicationId) {
  const path = name.split('.');
  path.splice(-1); // remove last component
  applicationId = applicationId || Parse.applicationId;
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
    logger.warn(
      `Warning: Duplicate cloud functions exist for ${lastComponent}. Only the last one will be used and the others will be ignored.`
    );
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

export function addFunction(functionName, handler, validationHandler, applicationId) {
  add(Category.Functions, functionName, handler, applicationId);
  add(Category.Validators, functionName, validationHandler, applicationId);
}

export function addJob(jobName, handler, applicationId) {
  add(Category.Jobs, jobName, handler, applicationId);
}

export function addTrigger(type, className, handler, applicationId, validationHandler) {
  validateClassNameForTriggers(className, type);
  add(Category.Triggers, `${type}.${className}`, handler, applicationId);
  add(Category.Validators, `${type}.${className}`, validationHandler, applicationId);
}

export function addFileTrigger(type, handler, applicationId, validationHandler) {
  add(Category.Triggers, `${type}.${FileClassName}`, handler, applicationId);
  add(Category.Validators, `${type}.${FileClassName}`, validationHandler, applicationId);
}

export function addConnectTrigger(type, handler, applicationId, validationHandler) {
  add(Category.Triggers, `${type}.${ConnectClassName}`, handler, applicationId);
  add(Category.Validators, `${type}.${ConnectClassName}`, validationHandler, applicationId);
}

export function addLiveQueryEventHandler(handler, applicationId) {
  applicationId = applicationId || Parse.applicationId;
  _triggerStore[applicationId] = _triggerStore[applicationId] || baseStore();
  _triggerStore[applicationId].LiveQuery.push(handler);
}

export function removeFunction(functionName, applicationId) {
  remove(Category.Functions, functionName, applicationId);
}

export function removeTrigger(type, className, applicationId) {
  remove(Category.Triggers, `${type}.${className}`, applicationId);
}

export function _unregisterAll() {
  Object.keys(_triggerStore).forEach(appId => delete _triggerStore[appId]);
}

export function getTrigger(className, triggerType, applicationId) {
  if (!applicationId) {
    throw 'Missing ApplicationID';
  }
  return get(Category.Triggers, `${triggerType}.${className}`, applicationId);
}

export async function runTrigger(trigger, name, request, auth) {
  if (!trigger) {
    return;
  }
  await maybeRunValidator(request, name, auth);
  if (request.skipWithMasterKey) {
    return;
  }
  return await trigger(request);
}

export function getFileTrigger(type, applicationId) {
  return getTrigger(FileClassName, type, applicationId);
}

export function triggerExists(className: string, type: string, applicationId: string): boolean {
  return getTrigger(className, type, applicationId) != undefined;
}

export function getFunction(functionName, applicationId) {
  return get(Category.Functions, functionName, applicationId);
}

export function getFunctionNames(applicationId) {
  const store =
    (_triggerStore[applicationId] && _triggerStore[applicationId][Category.Functions]) || {};
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

export function getJob(jobName, applicationId) {
  return get(Category.Jobs, jobName, applicationId);
}

export function getJobs(applicationId) {
  var manager = _triggerStore[applicationId];
  if (manager && manager.Jobs) {
    return manager.Jobs;
  }
  return undefined;
}

export function getValidator(functionName, applicationId) {
  return get(Category.Validators, functionName, applicationId);
}

export function getRequestObject(
  triggerType,
  auth,
  parseObject,
  originalParseObject,
  config,
  context
) {
  const request = {
    triggerName: triggerType,
    object: parseObject,
    master: false,
    log: config.loggerController,
    headers: config.headers,
    ip: config.ip,
  };

  if (originalParseObject) {
    request.original = originalParseObject;
  }
  if (
    triggerType === Types.beforeSave ||
    triggerType === Types.afterSave ||
    triggerType === Types.beforeDelete ||
    triggerType === Types.afterDelete ||
    triggerType === Types.afterFind
  ) {
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

export function getRequestQueryObject(triggerType, auth, query, count, config, context, isGet) {
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
export function getResponseObject(request, resolve, reject) {
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
      if (
        response &&
        typeof response === 'object' &&
        !request.object.equals(response) &&
        request.triggerName === Types.beforeSave
      ) {
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
        code: Parse.Error.SCRIPT_FAILED,
        message: 'Script failed. Unknown error.',
      });
      reject(e);
    },
  };
}

function userIdForLog(auth) {
  return auth && auth.user ? auth.user.id : undefined;
}

function logTriggerAfterHook(triggerType, className, input, auth) {
  const cleanInput = logger.truncateLogMessage(JSON.stringify(input));
  logger.info(
    `${triggerType} triggered for ${className} for user ${userIdForLog(
      auth
    )}:\n  Input: ${cleanInput}`,
    {
      className,
      triggerType,
      user: userIdForLog(auth),
    }
  );
}

function logTriggerSuccessBeforeHook(triggerType, className, input, result, auth) {
  const cleanInput = logger.truncateLogMessage(JSON.stringify(input));
  const cleanResult = logger.truncateLogMessage(JSON.stringify(result));
  logger.info(
    `${triggerType} triggered for ${className} for user ${userIdForLog(
      auth
    )}:\n  Input: ${cleanInput}\n  Result: ${cleanResult}`,
    {
      className,
      triggerType,
      user: userIdForLog(auth),
    }
  );
}

function logTriggerErrorBeforeHook(triggerType, className, input, auth, error) {
  const cleanInput = logger.truncateLogMessage(JSON.stringify(input));
  logger.error(
    `${triggerType} failed for ${className} for user ${userIdForLog(
      auth
    )}:\n  Input: ${cleanInput}\n  Error: ${JSON.stringify(error)}`,
    {
      className,
      triggerType,
      error,
      user: userIdForLog(auth),
    }
  );
}

export function maybeRunAfterFindTrigger(
  triggerType,
  auth,
  className,
  objects,
  config,
  query,
  context
) {
  return new Promise((resolve, reject) => {
    const trigger = getTrigger(className, triggerType, config.applicationId);
    if (!trigger) {
      return resolve();
    }
    const request = getRequestObject(triggerType, auth, null, null, config, context);
    if (query) {
      request.query = query;
    }
    const { success, error } = getResponseObject(
      request,
      object => {
        resolve(object);
      },
      error => {
        reject(error);
      }
    );
    logTriggerSuccessBeforeHook(triggerType, className, 'AfterFind', JSON.stringify(objects), auth);
    request.objects = objects.map(object => {
      //setting the class name to transform into parse object
      object.className = className;
      return Parse.Object.fromJSON(object);
    });
    return Promise.resolve()
      .then(() => {
        return maybeRunValidator(request, `${triggerType}.${className}`, auth);
      })
      .then(() => {
        if (request.skipWithMasterKey) {
          return request.objects;
        }
        const response = trigger(request);
        if (response && typeof response.then === 'function') {
          return response.then(results => {
            if (!results) {
              throw new Parse.Error(
                Parse.Error.SCRIPT_FAILED,
                'AfterFind expect results to be returned in the promise'
              );
            }
            return results;
          });
        }
        return response;
      })
      .then(success, error);
  }).then(results => {
    logTriggerAfterHook(triggerType, className, JSON.stringify(results), auth);
    return results;
  });
}

export function maybeRunQueryTrigger(
  triggerType,
  className,
  restWhere,
  restOptions,
  config,
  auth,
  context,
  isGet
) {
  const trigger = getTrigger(className, triggerType, config.applicationId);
  if (!trigger) {
    return Promise.resolve({
      restWhere,
      restOptions,
    });
  }
  const json = Object.assign({}, restOptions);
  json.where = restWhere;

  const parseQuery = new Parse.Query(className);
  parseQuery.withJSON(json);

  let count = false;
  if (restOptions) {
    count = !!restOptions.count;
  }
  const requestObject = getRequestQueryObject(
    triggerType,
    auth,
    parseQuery,
    count,
    config,
    context,
    isGet
  );
  return Promise.resolve()
    .then(() => {
      return maybeRunValidator(requestObject, `${triggerType}.${className}`, auth);
    })
    .then(() => {
      if (requestObject.skipWithMasterKey) {
        return requestObject.query;
      }
      return trigger(requestObject);
    })
    .then(
      result => {
        let queryResult = parseQuery;
        if (result && result instanceof Parse.Query) {
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
          restOptions,
        };
      },
      err => {
        const error = resolveError(err, {
          code: Parse.Error.SCRIPT_FAILED,
          message: 'Script failed. Unknown error.',
        });
        throw error;
      }
    );
}

export function resolveError(message, defaultOpts) {
  if (!defaultOpts) {
    defaultOpts = {};
  }
  if (!message) {
    return new Parse.Error(
      defaultOpts.code || Parse.Error.SCRIPT_FAILED,
      defaultOpts.message || 'Script failed.'
    );
  }
  if (message instanceof Parse.Error) {
    return message;
  }

  const code = defaultOpts.code || Parse.Error.SCRIPT_FAILED;
  // If it's an error, mark it as a script failed
  if (typeof message === 'string') {
    return new Parse.Error(code, message);
  }
  const error = new Parse.Error(code, message.message || message);
  if (message instanceof Error) {
    error.stack = message.stack;
  }
  return error;
}

// To be used as part of the promise chain when saving/deleting an object
// Will resolve successfully if no trigger is configured
// Resolves to an object, empty or containing an object key. A beforeSave
// trigger will set the object key to the rest format object to save.
// originalParseObject is optional, we only need that for before/afterSave functions
export function maybeRunTrigger(
  triggerType,
  auth,
  parseObject,
  originalParseObject,
  config,
  context
) {
  if (!parseObject) {
    return Promise.resolve({});
  }
  return new Promise(function (resolve, reject) {
    var trigger = getTrigger(parseObject.className, triggerType, config.applicationId);
    if (!trigger) return resolve();
    var request = getRequestObject(
      triggerType,
      auth,
      parseObject,
      originalParseObject,
      config,
      context
    );
    var { success, error } = getResponseObject(
      request,
      object => {
        logTriggerSuccessBeforeHook(
          triggerType,
          parseObject.className,
          parseObject.toJSON(),
          object,
          auth
        );
        if (
          triggerType === Types.beforeSave ||
          triggerType === Types.afterSave ||
          triggerType === Types.beforeDelete ||
          triggerType === Types.afterDelete
        ) {
          Object.assign(context, request.context);
        }
        resolve(object);
      },
      error => {
        logTriggerErrorBeforeHook(
          triggerType,
          parseObject.className,
          parseObject.toJSON(),
          auth,
          error
        );
        reject(error);
      }
    );

    // AfterSave and afterDelete triggers can return a promise, which if they
    // do, needs to be resolved before this promise is resolved,
    // so trigger execution is synced with RestWrite.execute() call.
    // If triggers do not return a promise, they can run async code parallel
    // to the RestWrite.execute() call.
    return Promise.resolve()
      .then(() => {
        return maybeRunValidator(request, `${triggerType}.${parseObject.className}`, auth);
      })
      .then(() => {
        if (request.skipWithMasterKey) {
          return Promise.resolve();
        }
        const promise = trigger(request);
        if (
          triggerType === Types.afterSave ||
          triggerType === Types.afterDelete ||
          triggerType === Types.afterLogin
        ) {
          logTriggerAfterHook(triggerType, parseObject.className, parseObject.toJSON(), auth);
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
      })
      .then(success, error);
  });
}

// Converts a REST-format object to a Parse.Object
// data is either className or an object
export function inflate(data, restObject) {
  var copy = typeof data == 'object' ? data : { className: data };
  for (var key in restObject) {
    copy[key] = restObject[key];
  }
  return Parse.Object.fromJSON(copy);
}

export function runLiveQueryEventHandlers(data, applicationId = Parse.applicationId) {
  if (!_triggerStore || !_triggerStore[applicationId] || !_triggerStore[applicationId].LiveQuery) {
    return;
  }
  _triggerStore[applicationId].LiveQuery.forEach(handler => handler(data));
}

export function getRequestFileObject(triggerType, auth, fileObject, config) {
  const request = {
    ...fileObject,
    triggerName: triggerType,
    master: false,
    log: config.loggerController,
    headers: config.headers,
    ip: config.ip,
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

export async function maybeRunFileTrigger(triggerType, fileObject, config, auth) {
  const fileTrigger = getFileTrigger(triggerType, config.applicationId);
  if (typeof fileTrigger === 'function') {
    try {
      const request = getRequestFileObject(triggerType, auth, fileObject, config);
      await maybeRunValidator(request, `${triggerType}.${FileClassName}`, auth);
      if (request.skipWithMasterKey) {
        return fileObject;
      }
      const result = await fileTrigger(request);
      logTriggerSuccessBeforeHook(
        triggerType,
        'Parse.File',
        { ...fileObject.file.toJSON(), fileSize: fileObject.fileSize },
        result,
        auth
      );
      return result || fileObject;
    } catch (error) {
      logTriggerErrorBeforeHook(
        triggerType,
        'Parse.File',
        { ...fileObject.file.toJSON(), fileSize: fileObject.fileSize },
        auth,
        error
      );
      throw error;
    }
  }
  return fileObject;
}
