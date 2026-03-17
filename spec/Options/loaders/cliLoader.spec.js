const { Command } = require('commander');
const { z } = require('zod');
const { option } = require('../../../src/Options/schemaUtils');
const { registerSchemaOptions, extractCliOptions } = require('../../../src/Options/loaders/cliLoader');

describe('cliLoader', () => {
  let program;
  let schema;

  beforeEach(() => {
    program = new Command();
    program.exitOverride(); // Prevent process.exit in tests
    program.allowExcessArguments(); // Match Parse Server's commander setup
    program.configureOutput({
      writeOut: () => {},
      writeErr: () => {},
    });

    schema = z.object({
      appId: option(z.string(), {
        env: 'PARSE_SERVER_APP_ID',
        help: 'Your Parse Application ID',
      }),
      port: option(z.number().default(1337), {
        env: 'PARSE_SERVER_PORT',
        help: 'Port to run on',
      }),
      verbose: option(z.boolean().default(false), {
        env: 'PARSE_SERVER_VERBOSE',
        help: 'Enable verbose logging',
      }),
      allowHeaders: option(z.array(z.string()).optional(), {
        env: 'PARSE_SERVER_ALLOW_HEADERS',
        help: 'Allowed headers',
      }),
    });
  });

  describe('registerSchemaOptions()', () => {
    it('registers options on a Commander program', () => {
      registerSchemaOptions(program, schema);

      // Commander should have the options registered
      const options = program.options;
      const optionNames = options.map(o => o.long);
      expect(optionNames).toContain('--appId');
      expect(optionNames).toContain('--port');
      expect(optionNames).toContain('--verbose');
      expect(optionNames).toContain('--allowHeaders');
    });

    it('marks required options with angle brackets', () => {
      registerSchemaOptions(program, schema);
      const appIdOpt = program.options.find(o => o.long === '--appId');
      expect(appIdOpt.flags).toContain('<appId>');
    });

    it('marks optional options with square brackets', () => {
      registerSchemaOptions(program, schema);
      const portOpt = program.options.find(o => o.long === '--port');
      expect(portOpt.flags).toContain('[port]');
    });
  });

  describe('extractCliOptions()', () => {
    it('extracts parsed CLI options', () => {
      registerSchemaOptions(program, schema);
      program.parse(['node', 'test', '--appId', 'myApp', '--port', '8080'], { from: 'user' });

      const result = extractCliOptions(program, schema);
      expect(result.appId).toBe('myApp');
      expect(result.port).toBe(8080);
    });

    it('skips options not provided on CLI', () => {
      registerSchemaOptions(program, schema);
      program.parse(['node', 'test', '--appId', 'myApp'], { from: 'user' });

      const result = extractCliOptions(program, schema);
      expect(result.appId).toBe('myApp');
      expect(result.port).toBeUndefined();
    });

    it('coerces boolean values', () => {
      registerSchemaOptions(program, schema);
      program.parse(['node', 'test', '--appId', 'x', '--verbose', 'true'], { from: 'user' });

      const result = extractCliOptions(program, schema);
      expect(result.verbose).toBe(true);
    });

    it('coerces CSV arrays', () => {
      registerSchemaOptions(program, schema);
      program.parse(
        ['node', 'test', '--appId', 'x', '--allowHeaders', 'X-Custom,X-Other'],
        { from: 'user' }
      );

      const result = extractCliOptions(program, schema);
      expect(result.allowHeaders).toEqual(['X-Custom', 'X-Other']);
    });
  });
});
