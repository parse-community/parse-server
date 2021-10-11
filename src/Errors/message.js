export const ErrorMessage = {
  READ_ONLY_MASTER_KEY: () => 'Cannot perform a write operation when using readOnlyMasterKey.',
  MISSING_OBJECT_ID: () => 'The field objectId must not be empty, null or undefined.',
  INVALID_KEY_NAME: value => value + ' is an invalid field name.',
  USER_NO_ACCESS_CLASS: className =>
    'This user is not allowed to access non-existent class: ' + className + '.',
  OBJECT_NOT_FOUND: () => 'Object not found.',
  FIELD_IS_REQUIRED: fieldName =>
    'A value for the field ' + fieldName + ' is required to save/update the object.',
  USERNAME_MISSING: () => 'Bad or missing username.',
  PASSWORD_MISSING: () => 'Password is required.',
  UNSUPPORTED_SERVICE: () => 'This authentication method is unsupported.',
  ACCOUNT_LINKED: () => 'This auth is already used.',
  CLIENT_EMAIL_VERIFICATION: () => "Clients aren't allowed to manually update email verification.",
  USERNAME_TAKEN: () => 'Account already exists for this username.',
  INVALID_EMAIL_ADDRESS_FORMAT: () => 'Email address format is invalid.',
  EMAIL_TAKEN: () => 'Account already exists for this email address.',
  PASSWORD_POLICY: () => 'Password does not meet the Password Policy requirements.',
  USERNAME_IN_PASSWORD: () => 'Password cannot contain your username.',
  PASSWORD_MATCHES_EXISTING_PASSWORD: maxPasswordHistory =>
    'New password should not be the same as last ' + maxPasswordHistory + ' passwords.',
  INVALID_SESSION_TOKEN: () => 'Session token required.',
  ACL_SESSION: () => 'Cannot set ' + 'ACL on a Session.',
  SESSION_ERROR: () => 'Error creating session.',
  MIN_ONE_ID_FIELD: () =>
    'At least one ID field (deviceToken, installationId) must be specified in this operation.',
  UNKNOWN_OBJECT_UPDATE: () => 'Object not found for update.',
  NO_OP: field => 'The ' + field + ' can not be changed in this operation.',
  REQ_OP: field => 'The ' + field + ' must be specified in this operation.',
  INSTALLATION_ID_WITH_DEVICE_TOKEN: () =>
    'Must specify installationId when deviceToken matches multiple Installation objects.',
  USER_NO_MODIFY: field => 'Cannot modify user' + field + '.',
  INVALID_ACL: () => 'Invalid ACL.',
  DUPLICATE_VALUE: () => 'A duplicate value for a field with unique values was provided.',
  DUPLICATE_CLASS: className => `Class ${className} already exists.`,
  DATABASE_ADAPTER_ERROR: () => 'Database adapter error.',
  GEO_JSON_INVALID_VERTICES: () => 'GeoJSON: Loop must have at least 3 different vertices.',
  INVALID_POLYGON_VALUES: () => 'Polygon must have atleast 3 values.',
  INVALID_NESTED_KEY: () => "Nested keys should not contain the '$' or '.' characters",
  BAD_VALUE: type => `bad ${type} value.`,
  ALL_VALUES_MUST_BE_REGEX: value => `All $all values must be of regex type or none: ${value}.`,
  VALUE_SHOULD_BE_TYPE: (value, type) => `bad ${value} should be an ${type}`,
  VALUE_NOT_SUPPORTED: value =>
    `bad ${value} not supported, please use $regex or create a separate lower case column.`,
  BAD_VALUE_POSTGRES_EXTENSION_REQUIRED: value =>
    `bad ${value} not supported, install Postgres Unaccent Extension`,
};
