export const ErrorMessage = {
  readOnlyMasterKey: () => 'Cannot perform a write operation when using readOnlyMasterKey.',
  missingObjectId: () => 'The field objectId must not be empty, null or undefined.',
  invalidKeyName: value => value + ' is an invalid field name.',
  userNoAccessClass: className =>
    'This user is not allowed to access non-existent class: ' + className + '.',
  objectNotFound: () => 'Object not found.',
  fieldIsRequired: fieldName =>
    'A value for the field ' + fieldName + ' is required to save/update the object.',
  userMissing: () => 'Bad or missing username.',
  passwordMissing: () => 'Password is required.',
  unsupportedService: () => 'This authentication method is unsupported.',
  accountLinked: () => 'This auth is already used.',
  clientEmailVerification: () => "Clients aren't allowed to manually update email verification.",
  usernameTaken: () => 'Account already exists for this username.',
  invalidEmailAddressFormat: () => 'Email address format is invalid.',
  emailTaken: () => 'Account already exists for this email address.',
  passwordPolicy: () => 'Password does not meet the Password Policy requirements.',
  usernameInPassword: () => 'Password cannot contain your username.',
  passwordMatchesExistingPassword: maxPasswordHistory =>
    'New password should not be the same as last ' + maxPasswordHistory + ' passwords.',
  invalidSessionToken: () => 'Session token required.',
  aclSession: () => 'Cannot set ' + 'ACL on a Session.',
  sessionError: () => 'Error creating session.',
  minOneIdField: () =>
    'At least one ID field (deviceToken, installationId) must be specified in this operation.',
  unknownObjectUpdate: () => 'Object not found for update.',
  noOp: field => 'The field ' + field + ' can not be changed in this operation.',
  reqOp: field => 'The field ' + field + ' must be specified in this operation.',
  installationIdWithDeviceToken: () =>
    'Must specify installationId when deviceToken matches multiple Installation objects.',
  userNoModify: field => 'Cannot modify user' + field + '.',
  invalidAcl: () => 'Invalid ACL.',
  duplicateValue: () => 'A duplicate value for a field with unique values was provided.',
  duplicateClass: className => 'Class ' + className + 'already exists.',
  databaseAdapterError: () => 'Database adapter error.',
  geoJsonInvalidVertices: () => 'GeoJSON: Loop must have at least 3 different vertices.',
  invalidPolygonValues: () => 'Polygon must have atleast 3 values.',
  invalidNestedKey: () => "Nested keys should not contain the '$' or '.' characters",
  badValue: type => 'bad ' + type + 'value.',
  allValuesMustBeRegex: value => 'All $all values must be of regex type or none: ' + value + '.',
  valueShouldBeType: (value, type) => 'bad ' + value + 'should be an ' + type + '.',
  valueNotSupported: value =>
    'bad ' + value + 'not supported, please use $regex or create a separate lower case column.',
  badValuePostgresExtensionRequired: value =>
    'bad ' + value + 'not supported, install Postgres Unaccent Extension',
};
