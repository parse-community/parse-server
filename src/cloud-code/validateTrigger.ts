import { TriggerType } from './TriggerStore';

export function validateClassNameForTriggers(className: string, type: string): string {
  if (type == TriggerType.beforeSave && className === '_PushStatus') {
    throw 'Only afterSave is allowed on _PushStatus';
  }
  if (
    (type === TriggerType.beforeLogin || type === TriggerType.afterLogin || type === TriggerType.beforePasswordResetRequest) &&
    className !== '_User'
  ) {
    throw 'Only the _User class is allowed for the beforeLogin, afterLogin, and beforePasswordResetRequest triggers';
  }
  if (type === TriggerType.afterLogout && className !== '_Session') {
    throw 'Only the _Session class is allowed for the afterLogout trigger.';
  }
  if (className === '_Session' && type !== TriggerType.afterLogout) {
    throw 'Only the afterLogout trigger is allowed for the _Session class.';
  }
  return className;
}
