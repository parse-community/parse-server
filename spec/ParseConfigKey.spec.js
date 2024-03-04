const ParseServer = require('../lib/index').ParseServer;
const controllers = require('../lib/Controllers/');
const Config = require('../lib/Config');

describe('Config Keys', () => {
  it('should throw a warning for incorrect key name in Config', () => {
    const doNothing = () => {
      return {};
    };

    spyOn(controllers, 'getControllers').and.callFake(doNothing);
    spyOn(Config, 'put').and.callFake(doNothing);
    // Spy on the console.warn method to capture warnings
    spyOn(console, 'warn');

    new ParseServer({
      ...defaultConfiguration,
      unknownKeyName: 'unknownValue', // invalid key
      masterKeyIPs: '', // invalid key
      accountLockout: {
        duration: 10,
        threshold: 10,
        UnlockOnPasswordReset: false, // invalid key
      },
      passwordPolicy: {
        MaxPasswordAge: 10, // invalid key
      },
      fileUpload: {
        EnableForAnonymousUser: false, // invalid key
      },
      schema: {
        Strict: true, // invalid key
      },
      rateLimit: {
        requestPath: '',
        requestTimeWindow: 10,
        requestCount: 10,
        IncludeInternalRequests: false, // invalid key
      },
      security: {
        EnableCheck: true, // invalid key
      },
      pages: {
        EnableRouter: true, // invalid key
      },
      idempotencyOptions: {
        Ttl: 10, // invalid key
      },
      databaseOptions: {
        SchemaCacheTtl: 10, // invalid key
      },
      logLevels: {
        CloudFunctionError: 'error', // invalid key
      },
    });

    // Check if console.warn was called with the expected message
    expect(console.warn).toHaveBeenCalledWith(
      'Warning: The following key is not recognized: unknownKeyName'
    );
    expect(console.warn).toHaveBeenCalledWith(
      'Warning: The following key is not recognized: masterKeyIPs'
    );
    expect(console.warn).toHaveBeenCalledWith(
      'Warning: The following key is not recognized: UnlockOnPasswordReset'
    );
    expect(console.warn).toHaveBeenCalledWith(
      'Warning: The following key is not recognized: MaxPasswordAge'
    );
    expect(console.warn).toHaveBeenCalledWith(
      'Warning: The following key is not recognized: EnableForAnonymousUser'
    );
    expect(console.warn).toHaveBeenCalledWith(
      'Warning: The following key is not recognized: Strict'
    );
    expect(console.warn).toHaveBeenCalledWith(
      'Warning: The following key is not recognized: IncludeInternalRequests'
    );
    expect(console.warn).toHaveBeenCalledWith(
      'Warning: The following key is not recognized: EnableCheck'
    );
    expect(console.warn).toHaveBeenCalledWith(
      'Warning: The following key is not recognized: EnableRouter'
    );
    expect(console.warn).toHaveBeenCalledWith('Warning: The following key is not recognized: Ttl');
    expect(console.warn).toHaveBeenCalledWith(
      'Warning: The following key is not recognized: SchemaCacheTtl'
    );
    expect(console.warn).toHaveBeenCalledWith(
      'Warning: The following key is not recognized: CloudFunctionError'
    );
  });
});
