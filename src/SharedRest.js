const classesWithMasterOnlyAccess = [
  '_JobStatus',
  '_PushStatus',
  '_Hooks',
  '_GlobalConfig',
  '_JobSchedule',
  '_Idempotency',
];
const { createSanitizedError } = require('./Error');

// Disallowing access to the _Role collection except by master key
function enforceRoleSecurity(method, className, auth, config) {
  if (className === '_Installation' && !auth.isMaster && !auth.isMaintenance) {
    if (method === 'delete' || method === 'find') {
      throw createSanitizedError(
        Parse.Error.OPERATION_FORBIDDEN,
        `Clients aren't allowed to perform the ${method} operation on the installation collection.`,
        config
      );
    }
  }

  //all volatileClasses are masterKey only
  if (
    classesWithMasterOnlyAccess.indexOf(className) >= 0 &&
    !auth.isMaster &&
    !auth.isMaintenance
  ) {
    throw createSanitizedError(
      Parse.Error.OPERATION_FORBIDDEN,
      `Clients aren't allowed to perform the ${method} operation on the ${className} collection.`,
      config
    );
  }

  // readOnly masterKey is not allowed
  if (auth.isReadOnly && (method === 'delete' || method === 'create' || method === 'update')) {
    throw createSanitizedError(
      Parse.Error.OPERATION_FORBIDDEN,
      `read-only masterKey isn't allowed to perform the ${method} operation.`,
      config
    );
  }
}

module.exports = {
  enforceRoleSecurity,
};
