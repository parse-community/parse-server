import { getRequestObject } from './Trigger';
import { maybeRunValidator } from "./Validator";
import { logTriggerSuccessBeforeHook, logTriggerErrorBeforeHook } from './Logger';
import { getClassName } from './Utils';
import { getTrigger } from './TriggerStore';
export async function maybeRunGlobalConfigTrigger(triggerType, auth, configObject, originalConfigObject, config, context) {
  const GlobalConfigClassName = getClassName(Parse.Config);
  const configTrigger = getTrigger(GlobalConfigClassName, triggerType, config.applicationId);
  if (typeof configTrigger === 'function') {
    try {
      const request = getRequestObject(triggerType, auth, configObject, originalConfigObject, config, context);
      await maybeRunValidator(request, `${triggerType}.${GlobalConfigClassName}`, auth);
      if (request.skipWithMasterKey) {
        return configObject;
      }
      const result = await configTrigger(request);
      logTriggerSuccessBeforeHook(
        triggerType,
        'Parse.Config',
        configObject,
        result,
        auth,
        config.logLevels.triggerBeforeSuccess
      );
      return result || configObject;
    } catch (error) {
      logTriggerErrorBeforeHook(
        triggerType,
        'Parse.Config',
        configObject,
        auth,
        error,
        config.logLevels.triggerBeforeError
      );
      throw error;
    }
  }
  return configObject;
}
