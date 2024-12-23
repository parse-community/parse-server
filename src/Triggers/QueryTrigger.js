import { getTrigger, Types } from "./TriggerStore";
import { getRequestObject } from './Trigger';
import { resolveError, toJSONwithObjects } from "./Utils";
import { maybeRunValidator } from "./Validator";
import { logTriggerAfterHook, logTriggerSuccessBeforeHook } from "./Logger";

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
    logTriggerSuccessBeforeHook(
      triggerType,
      className,
      'AfterFind',
      JSON.stringify(objects),
      auth,
      config.logLevels.triggerBeforeSuccess
    );
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
            return results;
          });
        }
        return response;
      })
      .then(success, error);
  }).then(results => {
    logTriggerAfterHook(
      triggerType,
      className,
      JSON.stringify(results),
      auth,
      config.logLevels.triggerAfter
    );
    return results;
  });
}

export async function maybeRunQueryTrigger(
  triggerType,
  className,
  restWhere,
  restOptions,
  config,
  auth,
  context,
  isGet,
  response
) {
  const trigger = getTrigger(className, triggerType, config.applicationId);
  if (!trigger) {
    return {
      restWhere,
      restOptions,
    };
  }

  const json = { ...restOptions, where: restWhere };

  const parseQuery = new Parse.Query(className);
  parseQuery.withJSON(json);

  const count = restOptions ? !!restOptions.count : false;

  const requestObject = getRequestQueryObject(
    triggerType,
    auth,
    parseQuery,
    count,
    config,
    context,
    isGet
  );

  try {
    await maybeRunValidator(requestObject, `${triggerType}.${className}`, auth);

    let result = requestObject.query;
    if (!requestObject.skipWithMasterKey) {
      result = await trigger(requestObject, response);
    }

    let queryResult = parseQuery;
    if (result && result instanceof Parse.Query) {
      queryResult = result;
    }

    const jsonQuery = queryResult.toJSON();
    if (jsonQuery.where) {
      restWhere = jsonQuery.where;
    }

    restOptions = restOptions || {};
    if (jsonQuery.limit) {
      restOptions.limit = jsonQuery.limit;
    }
    if (jsonQuery.skip) {
      restOptions.skip = jsonQuery.skip;
    }
    if (jsonQuery.include) {
      restOptions.include = jsonQuery.include;
    }
    if (jsonQuery.excludeKeys) {
      restOptions.excludeKeys = jsonQuery.excludeKeys;
    }
    if (jsonQuery.explain) {
      restOptions.explain = jsonQuery.explain;
    }
    if (jsonQuery.keys) {
      restOptions.keys = jsonQuery.keys;
    }
    if (jsonQuery.order) {
      restOptions.order = jsonQuery.order;
    }
    if (jsonQuery.hint) {
      restOptions.hint = jsonQuery.hint;
    }
    if (jsonQuery.comment) {
      restOptions.comment = jsonQuery.comment;
    }
    if (requestObject.readPreference) {
      restOptions.readPreference = requestObject.readPreference;
    }
    if (requestObject.includeReadPreference) {
      restOptions.includeReadPreference = requestObject.includeReadPreference;
    }
    if (requestObject.subqueryReadPreference) {
      restOptions.subqueryReadPreference = requestObject.subqueryReadPreference;
    }

    return {
      restWhere,
      restOptions,
    };
  } catch (err) {
    const error = resolveError(err, {
      code: Parse.Error.SCRIPT_FAILED,
      message: 'Script failed. Unknown error.',
    });
    throw error;
  }
}

function getRequestQueryObject(triggerType, auth, query, count, config, context, isGet) {
  isGet = !!isGet;

  const request = {
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
