const { buildEnvMap } = require('../../../lib/Options/schemaUtils');

// Import all Zod schemas
const { ParseServerOptionsSchema } = require('../../../lib/Options/schemas/ParseServerOptions');
const { SchemaOptionsSchema } = require('../../../lib/Options/schemas/SchemaOptions');
const { AccountLockoutOptionsSchema } = require('../../../lib/Options/schemas/AccountLockoutOptions');
const { PasswordPolicyOptionsSchema } = require('../../../lib/Options/schemas/PasswordPolicyOptions');
const { FileUploadOptionsSchema } = require('../../../lib/Options/schemas/FileUploadOptions');
const { IdempotencyOptionsSchema } = require('../../../lib/Options/schemas/IdempotencyOptions');
const { SecurityOptionsSchema } = require('../../../lib/Options/schemas/SecurityOptions');
const { RequestComplexityOptionsSchema } = require('../../../lib/Options/schemas/RequestComplexityOptions');
const {
  PagesOptionsSchema,
  CustomPagesOptionsSchema,
} = require('../../../lib/Options/schemas/PagesOptions');
const {
  LiveQueryOptionsSchema,
  LiveQueryServerOptionsSchema,
} = require('../../../lib/Options/schemas/LiveQueryOptions');
const { RateLimitOptionsSchema } = require('../../../lib/Options/schemas/RateLimitOptions');
const { LogLevelsSchema } = require('../../../lib/Options/schemas/LogLevels');
const { DatabaseOptionsSchema } = require('../../../lib/Options/schemas/DatabaseOptions');

describe('ParseServerOptionsSchema', () => {
  it('validates a minimal valid config', () => {
    const result = ParseServerOptionsSchema.safeParse({
      appId: 'myApp',
      masterKey: 'myMasterKey',
      maintenanceKey: 'myMaintenanceKey',
      serverURL: 'http://localhost:1337/parse',
      databaseURI: 'mongodb://localhost:27017/parse',
    });
    expect(result.success).toBe(true);
  });

  it('rejects config missing required fields', () => {
    const result = ParseServerOptionsSchema.safeParse({});
    expect(result.success).toBe(false);
    const paths = result.error.issues.map(i => i.path[0]);
    expect(paths).toContain('appId');
    expect(paths).toContain('masterKey');
    expect(paths).toContain('maintenanceKey');
    expect(paths).toContain('serverURL');
  });

  it('applies correct defaults', () => {
    const result = ParseServerOptionsSchema.parse({
      appId: 'myApp',
      masterKey: 'myMasterKey',
      maintenanceKey: 'myMaintenanceKey',
      serverURL: 'http://localhost:1337/parse',
    });

    expect(result.port).toBe(1337);
    expect(result.defaultLimit).toBe(100);
    expect(result.cacheMaxSize).toBe(10000);
    expect(result.cacheTTL).toBe(5000);
    expect(result.sessionLength).toBe(31536000);
    expect(result.objectIdSize).toBe(10);
    expect(result.host).toBe('0.0.0.0');
    expect(result.mountPath).toBe('/parse');
    expect(result.graphQLPath).toBe('/graphql');
    expect(result.maxUploadSize).toBe('20mb');
    expect(result.collectionPrefix).toBe('');
    expect(result.databaseURI).toBe('mongodb://localhost:27017/parse');
    expect(result.masterKeyIps).toEqual(['127.0.0.1', '::1']);
    expect(result.maintenanceKeyIps).toEqual(['127.0.0.1', '::1']);
    expect(result.readOnlyMasterKeyIps).toEqual(['0.0.0.0/0', '::0']);
    expect(result.enforcePrivateUsers).toBe(true);
    expect(result.revokeSessionOnPasswordReset).toBe(true);
    expect(result.allowClientClassCreation).toBe(false);
    expect(result.verifyServerUrl).toBe(true);
    expect(result.directAccess).toBe(true);
    expect(result.rateLimit).toEqual([]);
    expect(result.trustProxy).toEqual([]);
  });

  it('accepts masterKey as a function', () => {
    const fn = () => 'dynamicKey';
    const result = ParseServerOptionsSchema.safeParse({
      appId: 'myApp',
      masterKey: fn,
      maintenanceKey: 'myMaintenanceKey',
      serverURL: 'http://localhost:1337/parse',
    });
    expect(result.success).toBe(true);
    expect(result.data.masterKey).toBe(fn);
  });

  it('accepts verifyUserEmails as a function', () => {
    const fn = () => true;
    const result = ParseServerOptionsSchema.safeParse({
      appId: 'myApp',
      masterKey: 'myMasterKey',
      maintenanceKey: 'myMaintenanceKey',
      serverURL: 'http://localhost:1337/parse',
      verifyUserEmails: fn,
    });
    expect(result.success).toBe(true);
    expect(result.data.verifyUserEmails).toBe(fn);
  });

  it('accepts nested schema options', () => {
    const result = ParseServerOptionsSchema.safeParse({
      appId: 'myApp',
      masterKey: 'myMasterKey',
      maintenanceKey: 'myMaintenanceKey',
      serverURL: 'http://localhost:1337/parse',
      schema: { strict: true, definitions: [] },
      accountLockout: { duration: 5, threshold: 3 },
      idempotencyOptions: { ttl: 600, paths: ['.*'] },
    });
    expect(result.success).toBe(true);
    expect(result.data.schema.strict).toBe(true);
    expect(result.data.accountLockout.duration).toBe(5);
    expect(result.data.idempotencyOptions.ttl).toBe(600);
  });

  it('accepts rateLimit as array of RateLimitOptions', () => {
    const result = ParseServerOptionsSchema.safeParse({
      appId: 'myApp',
      masterKey: 'myMasterKey',
      maintenanceKey: 'myMaintenanceKey',
      serverURL: 'http://localhost:1337/parse',
      rateLimit: [
        { requestPath: '/login', requestCount: 10, requestTimeWindow: 60000 },
      ],
    });
    expect(result.success).toBe(true);
    expect(result.data.rateLimit).toHaveLength(1);
    expect(result.data.rateLimit[0].requestPath).toBe('/login');
  });

  it('allows unknown keys with passthrough', () => {
    const result = ParseServerOptionsSchema.safeParse({
      appId: 'myApp',
      masterKey: 'myMasterKey',
      maintenanceKey: 'myMaintenanceKey',
      serverURL: 'http://localhost:1337/parse',
      unknownOption: 'value',
    });
    expect(result.success).toBe(true);
    expect(result.data.unknownOption).toBe('value');
  });
});

describe('Nested schemas', () => {
  it('SchemaOptions applies defaults', () => {
    const result = SchemaOptionsSchema.parse({});
    expect(result.strict).toBe(false);
    expect(result.deleteExtraFields).toBe(false);
    expect(result.lockSchemas).toBe(false);
    expect(result.definitions).toEqual([]);
  });

  it('FileUploadOptions applies defaults', () => {
    const result = FileUploadOptionsSchema.parse({});
    expect(result.enableForAnonymousUser).toBe(false);
    expect(result.enableForAuthenticatedUser).toBe(true);
    expect(result.enableForPublic).toBe(false);
    expect(result.allowedFileUrlDomains).toEqual(['*']);
  });

  it('SecurityOptions applies defaults', () => {
    const result = SecurityOptionsSchema.parse({});
    expect(result.enableCheck).toBe(false);
    expect(result.enableCheckLog).toBe(false);
  });

  it('IdempotencyOptions applies defaults', () => {
    const result = IdempotencyOptionsSchema.parse({});
    expect(result.paths).toEqual([]);
    expect(result.ttl).toBe(300);
  });

  it('RequestComplexityOptions applies defaults', () => {
    const result = RequestComplexityOptionsSchema.parse({});
    expect(result.graphQLDepth).toBe(-1);
    expect(result.queryDepth).toBe(-1);
    expect(result.includeDepth).toBe(-1);
  });

  it('RateLimitOptions requires requestPath', () => {
    const result = RateLimitOptionsSchema.safeParse({});
    expect(result.success).toBe(false);
  });

  it('DatabaseOptions applies defaults', () => {
    const result = DatabaseOptionsSchema.parse({});
    expect(result.allowPublicExplain).toBe(false);
    expect(result.batchSize).toBe(1000);
    expect(result.enableSchemaHooks).toBe(false);
    expect(result.createIndexUserEmail).toBe(true);
  });
});

describe('Env var map coverage', () => {
  it('ParseServerOptions env map contains key env vars', () => {
    const envMap = buildEnvMap(ParseServerOptionsSchema);
    // Flat env vars
    expect(envMap.has('PARSE_SERVER_APPLICATION_ID')).toBe(true);
    expect(envMap.has('PARSE_SERVER_MASTER_KEY')).toBe(true);
    expect(envMap.has('PARSE_SERVER_URL')).toBe(true);
    expect(envMap.has('PORT')).toBe(true);
    expect(envMap.has('VERBOSE')).toBe(true);
    expect(envMap.has('JSON_LOGS')).toBe(true);

    // Nested env vars (solving #7151)
    expect(envMap.has('PARSE_SERVER_SCHEMA_STRICT')).toBe(true);
    expect(envMap.has('PARSE_SERVER_EXPERIMENTAL_IDEMPOTENCY_TTL')).toBe(true);
    expect(envMap.has('PARSE_SERVER_EXPERIMENTAL_IDEMPOTENCY_PATHS')).toBe(true);
    expect(envMap.has('PARSE_SERVER_SECURITY_ENABLE_CHECK')).toBe(true);
    expect(envMap.has('PARSE_SERVER_ACCOUNT_LOCKOUT_DURATION')).toBe(true);
    expect(envMap.has('PARSE_SERVER_PASSWORD_POLICY_MAX_PASSWORD_AGE')).toBe(true);
    expect(envMap.has('PARSE_SERVER_FILE_UPLOAD_ENABLE_FOR_PUBLIC')).toBe(true);
  });

  it('nested env vars map to correct paths', () => {
    const envMap = buildEnvMap(ParseServerOptionsSchema);

    expect(envMap.get('PARSE_SERVER_SCHEMA_STRICT').path).toEqual(['schema', 'strict']);
    expect(envMap.get('PARSE_SERVER_EXPERIMENTAL_IDEMPOTENCY_TTL').path).toEqual(['idempotencyOptions', 'ttl']);
    expect(envMap.get('PARSE_SERVER_SECURITY_ENABLE_CHECK').path).toEqual(['security', 'enableCheck']);
    expect(envMap.get('PARSE_SERVER_ACCOUNT_LOCKOUT_DURATION').path).toEqual(['accountLockout', 'duration']);
  });
});
