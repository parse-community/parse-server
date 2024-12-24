import { getTrigger } from "./TriggerStore";
import { getRequestObject } from './Trigger';
import { resolveError, toJSONwithObjects, logTriggerErrorHook } from "./Utils";
import { maybeRunValidator } from "./Validator";
import { logTriggerAfterHook, logTriggerSuccessBeforeHook } from "./Logger";

export const maybeRunAfterFindTrigger = async (
  triggerType,
  auth,
  className,
  objects,
  config,
  query,
  context
) => {
  const trigger = getTrigger(className, triggerType, config.applicationId);
  if (!trigger) {
    return;
  }

  const request = getRequestObject(triggerType, auth, null, null, config, context);
  if (query) {
    request.query = query;
  }

  request.objects = objects.map((object) => {
    object.className = className;
    return Parse.Object.fromJSON(object);
  });

  logTriggerSuccessBeforeHook(
    triggerType,
    className,
    'AfterFind',
    JSON.stringify(objects),
    auth,
    config.logLevels.triggerBeforeSuccess
  );

  try {
    await maybeRunValidator(request, `${triggerType}.${className}`, auth);

    if (request.skipWithMasterKey) {
      return request.objects;
    }

    const response = await trigger(request);
    const results = await Promise.resolve(response);

    logTriggerAfterHook(
      triggerType,
      className,
      JSON.stringify(results),
      auth,
      config.logLevels.triggerAfter
    );

    return results.map(toJSONwithObjects)
  } catch (error) {
    logTriggerErrorHook(
      triggerType,
      className,
      error,
      auth,
      config.logLevels.triggerError
    );
    throw error;
  }
};

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
