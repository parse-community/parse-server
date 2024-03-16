const ParseServer = require('../lib/index').ParseServer;
const Config = require('../lib/Config');
const Deprecator = require('../lib/Deprecator/Deprecator');

const doNothing = () => {};

describe('Config Keys', () => {
  beforeEach(() => {
    spyOn(Deprecator, 'scanParseServerOptions').and.callFake(doNothing);
    spyOn(Config, 'put').and.callFake(() => {
      return {};
    });
    // Spy on the console.warn method to capture warnings
    spyOn(console, 'warn');
  });

  it('should run fine', () => {
    try {
      new ParseServer({
        ...defaultConfiguration,
      });
    } catch (err) {
      fail('Should run without error');
    }
  });

  it('should throw 2 warnings for incorrect key names in Config', () => {
    expect(() => {
      new ParseServer({
        ...defaultConfiguration,
        unknownKeyName: 'unknownValue', // invalid key
        masterKeyIPs: '', // invalid key
      });
    }).toThrowError(
      'Unknown key(s) found in Parse Server configuration, see other warning messages for details.'
    );
    expect(console.warn).toHaveBeenCalledWith(
      'Warning: The following key from ParseServerOptions is not recognized: masterKeyIPs'
    );
    expect(console.warn).toHaveBeenCalledWith(
      'Warning: The following key from ParseServerOptions is not recognized: unknownKeyName'
    );
  });

  it('should throw incorrect key warning for Schema Config key', () => {
    expect(() => {
      new ParseServer({
        ...defaultConfiguration,
        schema: {
          Strict: true, // invalid key
        },
      });
    }).toThrowError(
      'Unknown key(s) found in Parse Server configuration, see other warning messages for details.'
    );

    expect(console.warn).toHaveBeenCalledWith(
      'Warning: The following key from SchemaOptions is not recognized: Strict'
    );
  });

  it('should throw incorrect key warning for ParseServer Config key', () => {
    expect(() => {
      new ParseServer({
        ...defaultConfiguration,
        unknownKeyName: 'unknownValue', // invalid key
      });
    }).toThrowError(
      'Unknown key(s) found in Parse Server configuration, see other warning messages for details.'
    );

    // Check if console.warn was called with the expected message
    expect(console.warn).toHaveBeenCalledWith(
      'Warning: The following key from ParseServerOptions is not recognized: unknownKeyName'
    );
  });

  it('should throw incorrect key warning for RateLimitOption Config key', () => {
    expect(() => {
      new ParseServer({
        ...defaultConfiguration,
        rateLimit: {
          requestPath: '',
          requestTimeWindow: 10,
          requestCount: 10,
          IncludeInternalRequests: false, // invalid key
        },
      });
    }).toThrowError(
      'Unknown key(s) found in Parse Server configuration, see other warning messages for details.'
    );

    expect(console.warn).toHaveBeenCalledWith(
      'Warning: The following key from RateLimitOptions is not recognized: IncludeInternalRequests'
    );
  });

  it('should throw incorrect key warning for Security Config key', () => {
    expect(() => {
      new ParseServer({
        ...defaultConfiguration,
        security: {
          EnableCheck: true, // invalid key
        },
      });
    }).toThrowError(
      'Unknown key(s) found in Parse Server configuration, see other warning messages for details.'
    );

    expect(console.warn).toHaveBeenCalledWith(
      'Warning: The following key from SecurityOptions is not recognized: EnableCheck'
    );
  });

  it('should throw incorrect key warning for Pages Config key', () => {
    expect(() => {
      new ParseServer({
        ...defaultConfiguration,
        pages: {
          EnableRouter: true, // invalid key
        },
      });
    }).toThrowError(
      'Unknown key(s) found in Parse Server configuration, see other warning messages for details.'
    );

    expect(console.warn).toHaveBeenCalledWith(
      'Warning: The following key from PagesOptions is not recognized: EnableRouter'
    );
  });

  it('should throw incorrect key warning for PagesRoute Config key', () => {
    expect(() => {
      new ParseServer({
        ...defaultConfiguration,
        pages: {
          customRoutes: [
            {
              Handler: () => {}, // invalid key
            },
          ],
        },
      });
    }).toThrowError(
      'Unknown key(s) found in Parse Server configuration, see other warning messages for details.'
    );

    expect(console.warn).toHaveBeenCalledWith(
      'Warning: The following key from PagesRoute is not recognized: Handler'
    );
  });

  it('should throw incorrect key warning for PagesCustomUrls Config key', () => {
    expect(() => {
      new ParseServer({
        ...defaultConfiguration,
        pages: {
          customUrls: {
            PasswordReset: '', // invalid key
          },
        },
      });
    }).toThrowError(
      'Unknown key(s) found in Parse Server configuration, see other warning messages for details.'
    );

    expect(console.warn).toHaveBeenCalledWith(
      'Warning: The following key from PagesCustomUrlsOptions is not recognized: PasswordReset'
    );
  });

  it('should throw incorrect key warning for customPagesOption Config key', () => {
    expect(() => {
      new ParseServer({
        ...defaultConfiguration,
        customPages: {
          InvalidLink: '', // invalid key
        },
      });
    }).toThrowError(
      'Unknown key(s) found in Parse Server configuration, see other warning messages for details.'
    );

    expect(console.warn).toHaveBeenCalledWith(
      'Warning: The following key from CustomPagesOptions is not recognized: InvalidLink'
    );
  });

  it('should throw incorrect key warning for LiveQueryOptions Config key', () => {
    expect(() => {
      new ParseServer({
        ...defaultConfiguration,
        liveQuery: {
          ClassNames: '', // invalid key
        },
      });
    }).toThrowError(
      'Unknown key(s) found in Parse Server configuration, see other warning messages for details.'
    );

    expect(console.warn).toHaveBeenCalledWith(
      'Warning: The following key from LiveQueryOptions is not recognized: ClassNames'
    );
  });

  it('should throw incorrect key warning for IdempotencyOptions Config key', () => {
    expect(() => {
      new ParseServer({
        ...defaultConfiguration,
        idempotencyOptions: {
          Ttl: 10, // invalid key
        },
      });
    }).toThrowError(
      'Unknown key(s) found in Parse Server configuration, see other warning messages for details.'
    );

    expect(console.warn).toHaveBeenCalledWith(
      'Warning: The following key from IdempotencyOptions is not recognized: Ttl'
    );
  });

  it('should throw incorrect key warning for AccountLockoutOptions Config key', () => {
    expect(() => {
      new ParseServer({
        ...defaultConfiguration,
        accountLockout: {
          duration: 10,
          threshold: 10,
          UnlockOnPasswordReset: false, // invalid key
        },
      });
    }).toThrowError(
      'Unknown key(s) found in Parse Server configuration, see other warning messages for details.'
    );
    expect(console.warn).toHaveBeenCalledWith(
      'Warning: The following key from AccountLockoutOptions is not recognized: UnlockOnPasswordReset'
    );
  });

  it('should throw incorrect key warning for PasswordPolicyOptions Config key', () => {
    expect(() => {
      new ParseServer({
        ...defaultConfiguration,
        passwordPolicy: {
          MaxPasswordAge: 10, // invalid key
        },
      });
    }).toThrowError(
      'Unknown key(s) found in Parse Server configuration, see other warning messages for details.'
    );
    expect(console.warn).toHaveBeenCalledWith(
      'Warning: The following key from PasswordPolicyOptions is not recognized: MaxPasswordAge'
    );
  });

  it('should throw incorrect key warning for FileUploadOptions Config key', () => {
    expect(() => {
      new ParseServer({
        ...defaultConfiguration,
        fileUpload: {
          EnableForAnonymousUser: false, // invalid key
        },
      });
    }).toThrowError(
      'Unknown key(s) found in Parse Server configuration, see other warning messages for details.'
    );
    expect(console.warn).toHaveBeenCalledWith(
      'Warning: The following key from FileUploadOptions is not recognized: EnableForAnonymousUser'
    );
  });

  it('should throw incorrect key warning for DatabaseOptions Config key', () => {
    const dbConfig = {
      ...defaultConfiguration,
      databaseOptions: {
        SchemaCacheTtl: 10, // invalid key
      },
    };
    delete dbConfig.databaseAdapter;

    expect(() => {
      new ParseServer(dbConfig);
    }).toThrowError(
      'Unknown key(s) found in Parse Server configuration, see other warning messages for details.'
    );
    expect(console.warn).toHaveBeenCalledWith(
      'Warning: The following key from DatabaseOptions is not recognized: SchemaCacheTtl'
    );
  });

  it('should throw incorrect key warning for LogLevels Config key', () => {
    expect(() => {
      new ParseServer({
        ...defaultConfiguration,
        logLevels: {
          CloudFunctionError: 'error', // invalid key
        },
      });
    }).toThrowError(
      'Unknown key(s) found in Parse Server configuration, see other warning messages for details.'
    );
    expect(console.warn).toHaveBeenCalledWith(
      'Warning: The following key from LogLevels is not recognized: CloudFunctionError'
    );
  });
});

describe('Config Keys Checked on Server Start', () => {
  it('should throw incorrect key warning for LiveQueryServerOptions Config key', async () => {
    spyOn(Deprecator, 'scanParseServerOptions').and.callFake(doNothing);
    // Spy on the console.warn method to capture warnings
    spyOn(console, 'warn');

    try {
      await ParseServer.startApp({
        ...defaultConfiguration,
        liveQueryServerOptions: {
          MasterKey: '', // invalid key
        },
      });

      fail('Expected an error to be thrown');
    } catch (err) {
      expect(console.warn).toHaveBeenCalledWith(
        'Warning: The following key from LiveQueryServerOptions is not recognized: MasterKey'
      );

      expect(err.message).toBe(
        'Unknown key(s) found in Parse Server configuration, see other warning messages for details.'
      );
    }
  });
});
