import { getTrigger, Types } from "./TriggerStore";
import { maybeRunValidator } from "./Validator";
import { logTriggerAfterHook } from "./Logger";
import { toJSONwithObjects, resolveError } from "./Utils";

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
    triggerType === Types.beforeLogin ||
    triggerType === Types.afterLogin ||
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

export async function maybeRunTrigger(
  triggerType,
  auth,
  parseObject,
  originalParseObject,
  config,
  context
) {
  try {
    if (!parseObject) {
      return {};
    }

    const trigger = getTrigger(parseObject.className, triggerType, config.applicationId);
    if (!trigger) {
      return;
    }

    const request = getRequestObject(
      triggerType,
      auth,
      parseObject,
      originalParseObject,
      config,
      context
    );

    await maybeRunValidator(request, `${triggerType}.${parseObject.className}`, auth);

    if (request.skipWithMasterKey) {
      return;
    }

    const response = await trigger(request);

    if (triggerType === Types.afterSave || triggerType === Types.afterDelete) {
      logTriggerAfterHook(
        triggerType,
        parseObject.className,
        parseObject.toJSON(),
        auth,
        config.logLevels.triggerAfter
      );
    }

    return processTriggerResponse(request, response);
  } catch (e) {
    throw resolveError(e, {
      code: Parse.Error.SCRIPT_FAILED,
      message: 'Script failed.',
    });
  }
}

function processTriggerResponse(request, response) {
  if (request.triggerName === Types.afterFind) {
    return (response || request.objects).map(toJSONwithObjects);
  }

  if (
    response &&
    typeof response === 'object' &&
    request.triggerName === Types.beforeSave &&
    !request.object.equals(response)
  ) {
    return response;
  }

  if (response && typeof response === 'object' && request.triggerName === Types.afterSave) {
    return response;
  }

  if (request.triggerName === Types.afterSave) {
    return;
  }

  if (request.triggerName === Types.beforeSave) {
    return {
      object: {
        ...request.object._getSaveJSON(),
        objectId: request.object.id,
      },
    };
  }

  return {};
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
