export const ErrorMessage = {
  masterKeyReadOnly: () => 'Cannot perform a write operation when using readOnlyMasterKey.',
  noEmpty: (field, isField = true) =>
    `${isField === true ? 'The field ' : ''}${field} must not be empty, null or undefined.`,
  invalid: (field, isField = true) => `${isField === true ? 'The field' : ''} ${field} is invalid.`,
  unauthorizedAccess: (type, value) => `This user is not allowed to access ${type}: ${value}`,
  notFound: type => `${type} not found.`,
  exists: (type, key) => `${type} ${key} already exists`,
  required: (field, op = ' to save/update the object', isField = false) =>
    `A value for ${isField === true ? 'field ' : ''}${field} is required${op}.`,
  verified: type => `${type} is already verified.`,
  unverified: type => `${type} is not verified.`,
  noUpdate: (type, key) => `Can not update ${type} ${key}`,
  unsupportedService: () => 'This authentication method is unsupported.',
  accountLinked: () => 'This auth is already used.',
  accountLocked: duration =>
    `Your account is locked due to multiple failed login attempts. Please try again after ${duration} minute(s).`,
  clientEmailVerification: () => "Clients aren't allowed to manually update email verification.",
  passwordPolicy: () => 'Password does not meet the Password Policy requirements.',
  usernameInPassword: () => 'Password cannot contain your username.',
  passwordMatchesExistingPassword: maxPasswordHistory =>
    `New password should not be the same as last ${maxPasswordHistory} passwords.`,
  aclSession: () => 'Cannot set ACL on a Session.',
  sessionError: () => 'Error creating session.',
  noOp: field => `The field ${field} can not be changed in this operation.`,
  reqOp: field => `The field ${field} must be specified in this operation.`,
  installationIdWithDeviceToken: () =>
    'Must specify installationId when deviceToken matches multiple Installation objects.',
  invalidAcl: () => 'Invalid ACL.',
  duplicateValue: () => 'A duplicate value for a field with unique values was provided.',
  databaseAdapterError: () => 'Database adapter error.',
  geoJsonInvalidVertices: () => 'GeoJSON: Loop must have at least 3 different vertices.',
  invalidPolygonValues: () => 'Polygon must have atleast 3 values.',
  invalidNestedKey: () => "Nested keys should not contain the '$' or '.' characters",
  objectFieldValueInvalid: type => `bad ${type} value.`,
  queryAllValueInvalid: value => `All $all values must be of regex type or none: ${value}.`,
  queryValueTypeInvalid: (type, value) => `bad ${value} should be an ${type}.`,
  valueNotSupported: value =>
    `bad ${value} not supported, please use $regex or create a separate lower case column.`,
  databasePostgresExtensionRequired: (value, extension) =>
    `bad ${value} not supported, install ${extension} Extension.`,
  fieldMissingForVerificationFunc: () =>
    'An appName, publicServerURL, and emailAdapter are required for password reset and email verification functionality.',
};
