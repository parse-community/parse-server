const { ErrorMessage } = require('../lib/Errors/message');

describe('ErrorMessage text string', () => {
  let errorMessageKeys;
  beforeAll(() => {
    errorMessageKeys = [
      'masterKeyReadOnly',
      'noEmpty',
      'invalid',
      'unauthorizedAccess',
      'notFound',
      'exists',
      'required',
      'verified',
      'unverified',
      'noUpdate',
      'unsupportedService',
      'accountLinked',
      'accountLocked',
      'clientEmailVerification',
      'passwordPolicy',
      'usernameInPassword',
      'passwordMatchesExistingPassword',
      'aclSession',
      'sessionError',
      'noOp',
      'reqOp',
      'installationIdWithDeviceToken',
      'invalidAcl',
      'duplicateValue',
      'databaseAdapterError',
      'geoJsonInvalidVertices',
      'invalidPolygonValues',
      'invalidNestedKey',
      'objectFieldValueInvalid',
      'queryAllValueInvalid',
      'queryValueTypeInvalid',
      'valueNotSupported',
      'databasePostgresExtensionRequired',
      'fieldMissingForVerificationFunc',
    ];
  });

  it('should contain error messages.', () => {
    errorMessageKeys.map(key => {
      expect(Object.keys(ErrorMessage)).toContain(key);
    });
  });

  it('all message types should be of function.', () => {
    errorMessageKeys.map(key => {
      expect(typeof ErrorMessage[key]).toBe('function');
    });
  });
});
