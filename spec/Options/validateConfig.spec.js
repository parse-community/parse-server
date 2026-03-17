const { validateConfig } = require('../../lib/Options/validateConfig');

const validConfig = {
  appId: 'myApp',
  masterKey: 'myMasterKey',
  maintenanceKey: 'myMaintenanceKey',
  serverURL: 'http://localhost:1337/parse',
  databaseURI: 'mongodb://localhost:27017/parse',
};

describe('validateConfig', () => {
  describe('basic validation', () => {
    it('validates a minimal valid config and applies defaults', () => {
      const result = validateConfig({ ...validConfig });
      expect(result.appId).toBe('myApp');
      expect(result.port).toBe(1337);
      expect(result.defaultLimit).toBe(100);
      expect(result.masterKeyIps).toEqual(['127.0.0.1', '::1']);
      expect(result.rateLimit).toEqual([]);
    });

    it('throws on missing required fields', () => {
      expect(() => validateConfig({})).toThrow('Parse Server configuration error');
    });

    it('throws on missing appId', () => {
      const config = { ...validConfig };
      delete config.appId;
      expect(() => validateConfig(config)).toThrow('appId');
    });

    it('throws on missing masterKey', () => {
      const config = { ...validConfig };
      delete config.masterKey;
      expect(() => validateConfig(config)).toThrow('masterKey');
    });
  });

  describe('cross-field validations', () => {
    it('throws when masterKey equals readOnlyMasterKey', () => {
      expect(() =>
        validateConfig({ ...validConfig, readOnlyMasterKey: 'myMasterKey' })
      ).toThrow('masterKey and readOnlyMasterKey should be different');
    });

    it('throws when masterKey equals maintenanceKey', () => {
      expect(() =>
        validateConfig({ ...validConfig, maintenanceKey: 'myMasterKey' })
      ).toThrow('masterKey and maintenanceKey should be different');
    });

    it('validates account lockout duration', () => {
      expect(() =>
        validateConfig({ ...validConfig, accountLockout: { duration: 0, threshold: 3 } })
      ).toThrow('Account lockout duration should be greater than 0');
    });

    it('validates account lockout threshold', () => {
      expect(() =>
        validateConfig({ ...validConfig, accountLockout: { duration: 5, threshold: 0 } })
      ).toThrow('Account lockout threshold should be greater than 0');
    });

    it('validates IP addresses in masterKeyIps', () => {
      expect(() =>
        validateConfig({ ...validConfig, masterKeyIps: ['invalid-ip'] })
      ).toThrow('invalid IP address');
    });

    it('accepts valid IP addresses', () => {
      const result = validateConfig({
        ...validConfig,
        masterKeyIps: ['127.0.0.1', '10.0.0.0/8'],
      });
      expect(result.masterKeyIps).toEqual(['127.0.0.1', '10.0.0.0/8']);
    });

    it('validates default limit must be positive', () => {
      expect(() => validateConfig({ ...validConfig, defaultLimit: 0 })).toThrow(
        'Default limit must be a value greater than 0'
      );
    });

    it('validates max limit must be positive', () => {
      expect(() => validateConfig({ ...validConfig, maxLimit: -1 })).toThrow(
        'Max limit must be a value greater than 0'
      );
    });

    it('validates session length when expiring sessions', () => {
      expect(() =>
        validateConfig({ ...validConfig, expireInactiveSessions: true, sessionLength: 0 })
      ).toThrow('Session length must be a value greater than 0');
    });

    it('validates idempotency TTL must be positive', () => {
      expect(() =>
        validateConfig({ ...validConfig, idempotencyOptions: { ttl: 0, paths: [] } })
      ).toThrow('idempotency TTL value must be greater than 0');
    });

    it('validates publicServerURL must start with http', () => {
      expect(() =>
        validateConfig({ ...validConfig, publicServerURL: 'ftp://example.com' })
      ).toThrow('publicServerURL must start with http:// or https://');
    });

    it('accepts publicServerURL as function', () => {
      const result = validateConfig({
        ...validConfig,
        publicServerURL: () => 'http://example.com',
      });
      expect(typeof result.publicServerURL).toBe('function');
    });

    it('validates password policy constraints', () => {
      expect(() =>
        validateConfig({
          ...validConfig,
          passwordPolicy: { maxPasswordAge: -1 },
        })
      ).toThrow('passwordPolicy.maxPasswordAge');
    });

    it('validates password policy resetTokenReuseIfValid requires duration', () => {
      expect(() =>
        validateConfig({
          ...validConfig,
          passwordPolicy: { resetTokenReuseIfValid: true },
        })
      ).toThrow('You cannot use resetTokenReuseIfValid without resetTokenValidityDuration');
    });

    it('validates allow headers must be array of strings', () => {
      expect(() =>
        validateConfig({ ...validConfig, allowHeaders: ['valid', ''] })
      ).toThrow('Allow headers must not contain empty strings');
    });

    it('validates requestComplexity values', () => {
      expect(() =>
        validateConfig({
          ...validConfig,
          requestComplexity: { queryDepth: 0 },
        })
      ).toThrow('positive integer or -1');
    });
  });

  describe('type coercion and defaults', () => {
    it('preserves function values for masterKey', () => {
      const fn = () => 'dynamicKey';
      const result = validateConfig({
        ...validConfig,
        masterKey: fn,
      });
      expect(result.masterKey).toBe(fn);
    });

    it('preserves function values for verifyUserEmails', () => {
      const fn = () => true;
      const result = validateConfig({
        ...validConfig,
        verifyUserEmails: fn,
      });
      expect(result.verifyUserEmails).toBe(fn);
    });

    it('applies nested option defaults', () => {
      const result = validateConfig({
        ...validConfig,
        security: {},
      });
      expect(result.security.enableCheck).toBe(false);
      expect(result.security.enableCheckLog).toBe(false);
    });

    it('applies idempotency defaults', () => {
      const result = validateConfig({
        ...validConfig,
        idempotencyOptions: {},
      });
      expect(result.idempotencyOptions.paths).toEqual([]);
      expect(result.idempotencyOptions.ttl).toBe(300);
    });

    it('allows unknown keys via passthrough', () => {
      const result = validateConfig({
        ...validConfig,
        customKey: 'customValue',
      });
      expect(result.customKey).toBe('customValue');
    });
  });
});
