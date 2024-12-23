import logger from '../logger';
export function logTriggerAfterHook(triggerType, className, input, auth, logLevel) {
  if (logLevel === 'silent') {
    return;
  }
  const cleanInput = logger.truncateLogMessage(JSON.stringify(input));
  logger[logLevel](
    `${triggerType} triggered for ${className} for user ${auth?.user?.id}:\n  Input: ${cleanInput}`,
    {
      className,
      triggerType,
      user: auth?.user?.id,
    }
  );
}

export function logTriggerSuccessBeforeHook(triggerType, className, input, result, auth, logLevel) {
  if (logLevel === 'silent') {
    return;
  }
  const cleanInput = logger.truncateLogMessage(JSON.stringify(input));
  const cleanResult = logger.truncateLogMessage(JSON.stringify(result));
  logger[logLevel](
    `${triggerType} triggered for ${className} for user ${auth?.user?.id}:\n  Input: ${cleanInput}\n  Result: ${cleanResult}`,
    {
      className,
      triggerType,
      user: auth?.user?.id,
    }
  );
}

export function logTriggerErrorBeforeHook(triggerType, className, input, auth, error, logLevel) {
  if (logLevel === 'silent') {
    return;
  }
  const cleanInput = logger.truncateLogMessage(JSON.stringify(input));
  logger[logLevel](
    `${triggerType} failed for ${className} for user ${auth?.user?.id}:\n  Input: ${cleanInput}\n  Error: ${JSON.stringify(error)}`,
    {
      className,
      triggerType,
      error,
      user: auth?.user?.id,
    }
  );
}
