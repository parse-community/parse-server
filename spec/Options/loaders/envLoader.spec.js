const { z } = require('zod');
const { option } = require('../../../lib/Options/schemaUtils');
const { loadFromEnv } = require('../../../lib/Options/loaders/envLoader');

describe('envLoader', () => {
  it('loads flat env vars into options', () => {
    const schema = z.object({
      appId: option(z.string(), { env: 'PARSE_SERVER_APP_ID', help: 'App ID' }),
      port: option(z.number().default(1337), { env: 'PARSE_SERVER_PORT', help: 'Port' }),
    });

    const env = {
      PARSE_SERVER_APP_ID: 'myApp',
      PARSE_SERVER_PORT: '8080',
    };

    const result = loadFromEnv(schema, env);
    expect(result).toEqual({ appId: 'myApp', port: 8080 });
  });

  it('skips env vars that are not set', () => {
    const schema = z.object({
      appId: option(z.string(), { env: 'PARSE_SERVER_APP_ID', help: 'App ID' }),
      port: option(z.number().default(1337), { env: 'PARSE_SERVER_PORT', help: 'Port' }),
    });

    const env = { PARSE_SERVER_APP_ID: 'myApp' };

    const result = loadFromEnv(schema, env);
    expect(result).toEqual({ appId: 'myApp' });
    expect(result.port).toBeUndefined();
  });

  it('skips empty string env vars', () => {
    const schema = z.object({
      appId: option(z.string(), { env: 'PARSE_SERVER_APP_ID', help: 'App ID' }),
    });

    const result = loadFromEnv(schema, { PARSE_SERVER_APP_ID: '' });
    expect(result).toEqual({});
  });

  it('loads nested env vars into nested objects', () => {
    const innerSchema = z.object({
      strict: option(z.boolean().default(false), {
        env: 'PARSE_SERVER_SCHEMA_STRICT',
        help: 'Strict mode',
      }),
      ttl: option(z.number().default(5000), {
        env: 'PARSE_SERVER_SCHEMA_TTL',
        help: 'TTL',
      }),
    });

    const schema = z.object({
      schema: option(innerSchema.optional(), {
        env: null,
        help: 'Schema options',
      }),
    });

    const env = {
      PARSE_SERVER_SCHEMA_STRICT: 'true',
      PARSE_SERVER_SCHEMA_TTL: '3000',
    };

    const result = loadFromEnv(schema, env);
    expect(result).toEqual({
      schema: { strict: true, ttl: 3000 },
    });
  });

  it('coerces boolean env vars', () => {
    const schema = z.object({
      verbose: option(z.boolean().default(false), { env: 'VERBOSE', help: 'Verbose' }),
    });

    expect(loadFromEnv(schema, { VERBOSE: 'true' })).toEqual({ verbose: true });
    expect(loadFromEnv(schema, { VERBOSE: '1' })).toEqual({ verbose: true });
    expect(loadFromEnv(schema, { VERBOSE: 'false' })).toEqual({ verbose: false });
  });

  it('coerces array env vars from CSV', () => {
    const schema = z.object({
      ips: option(z.array(z.string()).default([]), {
        env: 'PARSE_SERVER_IPS',
        help: 'IPs',
      }),
    });

    const result = loadFromEnv(schema, { PARSE_SERVER_IPS: '127.0.0.1,::1' });
    expect(result).toEqual({ ips: ['127.0.0.1', '::1'] });
  });

  it('coerces array env vars from JSON', () => {
    const schema = z.object({
      ips: option(z.array(z.string()).default([]), {
        env: 'PARSE_SERVER_IPS',
        help: 'IPs',
      }),
    });

    const result = loadFromEnv(schema, { PARSE_SERVER_IPS: '["10.0.0.1","10.0.0.2"]' });
    expect(result).toEqual({ ips: ['10.0.0.1', '10.0.0.2'] });
  });

  it('coerces object env vars from JSON', () => {
    const schema = z.object({
      push: option(z.record(z.unknown()).optional(), {
        env: 'PARSE_SERVER_PUSH',
        help: 'Push config',
      }),
    });

    const result = loadFromEnv(schema, {
      PARSE_SERVER_PUSH: '{"ios":{"pfx":"path/to/cert"}}',
    });
    expect(result).toEqual({ push: { ios: { pfx: 'path/to/cert' } } });
  });

  it('loads grouped/nested env vars matching Parse Server patterns', () => {
    const accountLockoutSchema = z.object({
      duration: option(z.number().optional(), {
        env: 'PARSE_SERVER_ACCOUNT_LOCKOUT_DURATION',
        help: 'Duration in minutes',
      }),
      threshold: option(z.number().optional(), {
        env: 'PARSE_SERVER_ACCOUNT_LOCKOUT_THRESHOLD',
        help: 'Number of failed attempts',
      }),
      unlockOnPasswordReset: option(z.boolean().default(false), {
        env: 'PARSE_SERVER_ACCOUNT_LOCKOUT_UNLOCK_ON_PASSWORD_RESET',
        help: 'Unlock on reset',
      }),
    });

    const idempotencySchema = z.object({
      paths: option(z.array(z.string()).default([]), {
        env: 'PARSE_SERVER_EXPERIMENTAL_IDEMPOTENCY_PATHS',
        help: 'Paths',
      }),
      ttl: option(z.number().default(300), {
        env: 'PARSE_SERVER_EXPERIMENTAL_IDEMPOTENCY_TTL',
        help: 'TTL in seconds',
      }),
    });

    const schema = z.object({
      appId: option(z.string(), { env: 'PARSE_SERVER_APPLICATION_ID', help: 'App ID' }),
      accountLockout: option(accountLockoutSchema.optional(), {
        env: null,
        help: 'Account lockout options',
      }),
      idempotencyOptions: option(idempotencySchema.optional(), {
        env: null,
        help: 'Idempotency options',
      }),
    });

    const env = {
      PARSE_SERVER_APPLICATION_ID: 'myApp',
      PARSE_SERVER_ACCOUNT_LOCKOUT_DURATION: '5',
      PARSE_SERVER_ACCOUNT_LOCKOUT_THRESHOLD: '3',
      PARSE_SERVER_ACCOUNT_LOCKOUT_UNLOCK_ON_PASSWORD_RESET: 'true',
      PARSE_SERVER_EXPERIMENTAL_IDEMPOTENCY_PATHS: '.*',
      PARSE_SERVER_EXPERIMENTAL_IDEMPOTENCY_TTL: '600',
    };

    const result = loadFromEnv(schema, env);
    expect(result).toEqual({
      appId: 'myApp',
      accountLockout: {
        duration: 5,
        threshold: 3,
        unlockOnPasswordReset: true,
      },
      idempotencyOptions: {
        paths: ['.*'],
        ttl: 600,
      },
    });
  });

  it('handles mixed flat and nested env vars', () => {
    const securitySchema = z.object({
      enableCheck: option(z.boolean().default(false), {
        env: 'PARSE_SERVER_SECURITY_ENABLE_CHECK',
        help: 'Enable check',
      }),
    });

    const schema = z.object({
      appId: option(z.string(), { env: 'PARSE_SERVER_APP_ID', help: 'App ID' }),
      verbose: option(z.boolean().default(false), { env: 'PARSE_SERVER_VERBOSE', help: 'Verbose' }),
      security: option(securitySchema.optional(), { env: null, help: 'Security' }),
    });

    const env = {
      PARSE_SERVER_APP_ID: 'myApp',
      PARSE_SERVER_VERBOSE: 'true',
      PARSE_SERVER_SECURITY_ENABLE_CHECK: 'true',
    };

    const result = loadFromEnv(schema, env);
    expect(result).toEqual({
      appId: 'myApp',
      verbose: true,
      security: { enableCheck: true },
    });
  });

  it('handles deeply nested schemas (3 levels)', () => {
    const routeSchema = z.object({
      path: option(z.string().default('/parse'), {
        env: 'PARSE_SERVER_PAGES_ROUTE_PATH',
        help: 'Route path',
      }),
    });

    const pagesSchema = z.object({
      enableRouter: option(z.boolean().default(false), {
        env: 'PARSE_SERVER_PAGES_ENABLE_ROUTER',
        help: 'Enable router',
      }),
      pagesRoute: option(routeSchema.optional(), { env: null, help: 'Pages route' }),
    });

    const schema = z.object({
      pages: option(pagesSchema.optional(), { env: null, help: 'Pages' }),
    });

    const env = {
      PARSE_SERVER_PAGES_ENABLE_ROUTER: 'true',
      PARSE_SERVER_PAGES_ROUTE_PATH: '/custom',
    };

    const result = loadFromEnv(schema, env);
    expect(result).toEqual({
      pages: {
        enableRouter: true,
        pagesRoute: { path: '/custom' },
      },
    });
  });

  it('ignores env vars not in schema', () => {
    const schema = z.object({
      appId: option(z.string(), { env: 'PARSE_SERVER_APP_ID', help: 'App ID' }),
    });

    const env = {
      PARSE_SERVER_APP_ID: 'myApp',
      UNRELATED_VAR: 'ignored',
      HOME: '/home/user',
    };

    const result = loadFromEnv(schema, env);
    expect(result).toEqual({ appId: 'myApp' });
  });
});
