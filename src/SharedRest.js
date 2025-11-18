const classesWithMasterOnlyAccess = [
  '_JobStatus',
  '_PushStatus',
  '_Hooks',
  '_GlobalConfig',
  '_JobSchedule',
  '_Idempotency',
];
const { createSanitizedError } = require('./SecurityError');

// Disallowing access to the _Role collection except by master key
function enforceRoleSecurity(method, className, auth) {
  if (className === '_Installation' && !auth.isMaster && !auth.isMaintenance) {
    if (method === 'delete' || method === 'find') {
      const detailedError = `Clients aren't allowed to perform the ${method} operation on the installation collection.`;
      throw createSanitizedError(Parse.Error.OPERATION_FORBIDDEN, detailedError);
    }
  }

  //all volatileClasses are masterKey only
  if (
    classesWithMasterOnlyAccess.indexOf(className) >= 0 &&
    !auth.isMaster &&
    !auth.isMaintenance
  ) {
    const detailedError = `Clients aren't allowed to perform the ${method} operation on the ${className} collection.`;
    throw createSanitizedError(Parse.Error.OPERATION_FORBIDDEN, detailedError);
  }

  // readOnly masterKey is not allowed
  if (auth.isReadOnly && (method === 'delete' || method === 'create' || method === 'update')) {
    const detailedError = `read-only masterKey isn't allowed to perform the ${method} operation.`;
    throw createSanitizedError(Parse.Error.OPERATION_FORBIDDEN, detailedError);
  }
}

module.exports = {
  enforceRoleSecurity,
};
