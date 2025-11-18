const classesWithMasterOnlyAccess = [
  '_JobStatus',
  '_PushStatus',
  '_Hooks',
  '_GlobalConfig',
  '_JobSchedule',
  '_Idempotency',
];
const { createSanitizedError } = require('./SecurityError');
const defaultLogger = require('./logger').default;

// Disallowing access to the _Role collection except by master key
function enforceRoleSecurity(method, className, auth, config = null) {
  if (className === '_Installation' && !auth.isMaster && !auth.isMaintenance) {
    if (method === 'delete' || method === 'find') {
      const detailedError = `Clients aren't allowed to perform the ${method} operation on the installation collection.`;
      const loggerOrConfig = config || defaultLogger;
      throw createSanitizedError(Parse.Error.OPERATION_FORBIDDEN, detailedError, loggerOrConfig);
    }
  }

  //all volatileClasses are masterKey only
  if (
    classesWithMasterOnlyAccess.indexOf(className) >= 0 &&
    !auth.isMaster &&
    !auth.isMaintenance
  ) {
    const detailedError = `Clients aren't allowed to perform the ${method} operation on the ${className} collection.`;
    const loggerOrConfig = config || defaultLogger;
    throw createSanitizedError(Parse.Error.OPERATION_FORBIDDEN, detailedError, loggerOrConfig);
  }

  // readOnly masterKey is not allowed
  if (auth.isReadOnly && (method === 'delete' || method === 'create' || method === 'update')) {
    const detailedError = `read-only masterKey isn't allowed to perform the ${method} operation.`;
    const loggerOrConfig = config || defaultLogger;
    throw createSanitizedError(Parse.Error.OPERATION_FORBIDDEN, detailedError, loggerOrConfig);
  }
}

module.exports = {
  enforceRoleSecurity,
};
