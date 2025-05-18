const classesWithMasterOnlyAccess = [
  '_JobStatus',
  '_PushStatus',
  '_Hooks',
  '_GlobalConfig',
  '_JobSchedule',
  '_Idempotency',
];
// Disallowing access to the _Role collection except by master key
function enforceRoleSecurity(method, className, auth) {
  if (className === '_Installation' && !auth.isMaster && !auth.isMaintenance) {
    if (method === 'delete' || method === 'find') {
      const error = `Clients aren't allowed to perform the ${method} operation on the installation collection.`;
      throw new Parse.Error(Parse.Error.OPERATION_FORBIDDEN, error);
    }
  }

  //all volatileClasses are masterKey only
  if (
    classesWithMasterOnlyAccess.indexOf(className) >= 0 &&
    !auth.isMaster &&
    !auth.isMaintenance
  ) {
    const error = `Clients aren't allowed to perform the ${method} operation on the ${className} collection.`;
    throw new Parse.Error(Parse.Error.OPERATION_FORBIDDEN, error);
  }

  // readOnly masterKey is not allowed
  if (auth.isReadOnly && (method === 'delete' || method === 'create' || method === 'update')) {
    const error = `read-only masterKey isn't allowed to perform the ${method} operation.`;
    throw new Parse.Error(Parse.Error.OPERATION_FORBIDDEN, error);
  }
}

module.exports = {
  enforceRoleSecurity,
};
