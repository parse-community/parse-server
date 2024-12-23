import { getClassName } from './Utils';
import { getTrigger } from './TriggerStore';
import { logTriggerSuccessBeforeHook, logTriggerErrorBeforeHook } from './Logger';
import { maybeRunValidator } from './Validator';

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

export async function maybeRunFileTrigger(triggerType, fileObject, config, auth, responseObject) {
  const FileClassName = getClassName(Parse.File);
  const fileTrigger = getTrigger(FileClassName, triggerType, config.applicationId);
  if (typeof fileTrigger !== 'function') {
    return fileObject;
  }
  try {
    const request = getRequestFileObject(triggerType, auth, fileObject, config);
    await maybeRunValidator(request, `${triggerType}.${FileClassName}`, auth);
    if (request.skipWithMasterKey) {
      return fileObject;
    }
    const result = await fileTrigger(request, responseObject);
    logTriggerSuccessBeforeHook(
      triggerType,
      'Parse.File',
      { ...fileObject.file.toJSON(), fileSize: fileObject.fileSize },
      result,
      auth,
      config.logLevels.triggerBeforeSuccess
    );
    return result || fileObject;
  } catch (error) {
    logTriggerErrorBeforeHook(
      triggerType,
      'Parse.File',
      { ...fileObject.file.toJSON(), fileSize: fileObject.fileSize },
      auth,
      error,
      config.logLevels.triggerBeforeError
    );
    throw error;
  }
}
