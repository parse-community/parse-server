const { z } = require('zod');
const { option } = require('../../../src/Options/schemaUtils');
const path = require('path');

// We test the core logic of the Zod runner by importing and using
// the individual loaders that it composes, since the runner itself
// calls process.argv/process.env/process.exit which are hard to test.

const { loadFromEnv } = require('../../../src/Options/loaders/envLoader');
const { loadFromFile } = require('../../../src/Options/loaders/fileLoader');
const { mergeConfigs } = require('../../../src/Options/loaders/mergeConfig');
const { registerSchemaOptions } = require('../../../src/Options/loaders/cliLoader');
const { Command } = require('commander');

describe('Zod runner integration', () => {
  const testSchema = z.object({
    appId: option(z.string(), {
      env: 'PARSE_SERVER_APPLICATION_ID',
      help: 'Your Parse Application ID',
    }),
    masterKey: option(z.string(), {
      env: 'PARSE_SERVER_MASTER_KEY',
      help: 'Your Parse Master Key',
    }),
    port: option(z.number().default(1337), {
      env: 'PORT',
      help: 'Port to run on',
    }),
    verbose: option(z.boolean().default(false), {
      env: 'VERBOSE',
      help: 'Enable verbose logging',
    }),
    databaseURI: option(z.string().default('mongodb://localhost:27017/parse'), {
      env: 'PARSE_SERVER_DATABASE_URI',
      help: 'Database URI',
    }),
    schema: option(
      z.object({
        strict: option(z.boolean().default(false), {
          env: 'PARSE_SERVER_SCHEMA_STRICT',
          help: 'Strict schema mode',
        }),
      }).loose().optional(),
      { env: null, help: 'Schema options' }
    ),
  }).loose();

  describe('full config merge pipeline', () => {
    it('merges file + env + CLI with correct priority', () => {
      // Simulate: file has port=8080, env has port=9090, CLI has port not set
      const fileOptions = { appId: 'fromFile', port: 8080, databaseURI: 'mongodb://file' };
      const envOptions = loadFromEnv(testSchema, {
        PARSE_SERVER_APPLICATION_ID: 'fromEnv',
        PORT: '9090',
      });
      const cliOptions = { masterKey: 'fromCli' };

      // file < env < CLI
      const merged = mergeConfigs(fileOptions, envOptions, cliOptions);

      expect(merged.appId).toBe('fromEnv'); // env wins over file
      expect(merged.port).toBe(9090); // env wins over file
      expect(merged.databaseURI).toBe('mongodb://file'); // only in file
      expect(merged.masterKey).toBe('fromCli'); // only in CLI
    });

    it('CLI args win over env vars', () => {
      const envOptions = loadFromEnv(testSchema, { PORT: '9090' });
      const cliOptions = { port: 3000 };

      const merged = mergeConfigs({}, envOptions, cliOptions);
      expect(merged.port).toBe(3000);
    });

    it('applies Zod defaults after merge', () => {
      const merged = mergeConfigs(
        { appId: 'test', masterKey: 'key' }
      );

      const result = testSchema.parse(merged);
      expect(result.port).toBe(1337); // default
      expect(result.verbose).toBe(false); // default
      expect(result.databaseURI).toBe('mongodb://localhost:27017/parse'); // default
    });

    it('loads and merges nested env vars (solving #7151)', () => {
      const envOptions = loadFromEnv(testSchema, {
        PARSE_SERVER_APPLICATION_ID: 'myApp',
        PARSE_SERVER_MASTER_KEY: 'myKey',
        PARSE_SERVER_SCHEMA_STRICT: 'true',
      });

      const result = testSchema.parse(envOptions);
      expect(result.appId).toBe('myApp');
      expect(result.schema.strict).toBe(true);
    });
  });

  describe('Commander option registration', () => {
    it('registers Zod schema options on Commander', () => {
      const program = new Command();
      program.exitOverride();
      program.allowExcessArguments();

      registerSchemaOptions(program, testSchema);

      const optionNames = program.options.map(o => o.long);
      expect(optionNames).toContain('--appId');
      expect(optionNames).toContain('--masterKey');
      expect(optionNames).toContain('--port');
      expect(optionNames).toContain('--verbose');
    });

    it('parses CLI args with type coercion', () => {
      const program = new Command();
      program.exitOverride();
      program.allowExcessArguments();

      registerSchemaOptions(program, testSchema);
      program.parse(['node', 'test', '--appId', 'myApp', '--port', '8080'], { from: 'user' });

      const opts = program.opts();
      expect(opts.appId).toBe('myApp');
      expect(opts.port).toBe(8080);
    });
  });

  describe('config file loading', () => {
    it('loads config from JSON file', () => {
      const configPath = path.join(__dirname, '../../configs/CLIConfig.json');
      const options = loadFromFile(configPath);
      expect(options.arg1).toBe('my_app');
    });

    it('loads config from apps array', () => {
      const configPath = path.join(__dirname, '../../configs/CLIConfigApps.json');
      const options = loadFromFile(configPath);
      expect(options.arg1).toBe('my_app');
    });
  });

  describe('end-to-end with ParseServerOptionsSchema', () => {
    const { ParseServerOptionsSchema } = require('../../../src/Options/schemas/ParseServerOptions');

    it('loads Parse Server config from env vars', () => {
      const envOptions = loadFromEnv(ParseServerOptionsSchema, {
        PARSE_SERVER_APPLICATION_ID: 'testApp',
        PARSE_SERVER_MASTER_KEY: 'testKey',
        PARSE_SERVER_MAINTENANCE_KEY: 'testMaintKey',
        PARSE_SERVER_URL: 'http://localhost:1337/parse',
        PORT: '8080',
        PARSE_SERVER_ALLOW_CLIENT_CLASS_CREATION: 'true',
        // Nested env vars (#7151)
        PARSE_SERVER_SCHEMA_STRICT: 'true',
        PARSE_SERVER_EXPERIMENTAL_IDEMPOTENCY_TTL: '600',
      });

      const result = ParseServerOptionsSchema.parse(envOptions);
      expect(result.appId).toBe('testApp');
      expect(result.port).toBe(8080);
      expect(result.allowClientClassCreation).toBe(true);
      expect(result.schema.strict).toBe(true);
      expect(result.idempotencyOptions.ttl).toBe(600);
    });

    it('merges file config with env overrides', () => {
      const fileConfig = {
        appId: 'fromFile',
        masterKey: 'fileKey',
        maintenanceKey: 'fileMaint',
        serverURL: 'http://localhost:1337/parse',
        port: 1337,
      };

      const envOptions = loadFromEnv(ParseServerOptionsSchema, {
        PORT: '9090',
      });

      const merged = mergeConfigs(fileConfig, envOptions);
      const result = ParseServerOptionsSchema.parse(merged);

      expect(result.appId).toBe('fromFile'); // from file
      expect(result.port).toBe(9090); // env overrides file
    });
  });
});
