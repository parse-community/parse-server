const { z } = require('zod');
const {
  option,
  getOptionMeta,
  getAllOptionMeta,
  buildEnvMap,
  coerceValue,
} = require('../../../src/Options/schemaUtils');

describe('schemaUtils', () => {
  describe('option() and getOptionMeta()', () => {
    it('attaches and retrieves metadata from a Zod schema', () => {
      const meta = { env: 'MY_ENV_VAR', help: 'Some help text' };
      const schema = option(z.string(), meta);
      expect(getOptionMeta(schema)).toBe(meta);
    });

    it('returns undefined for schemas without metadata', () => {
      const schema = z.string();
      expect(getOptionMeta(schema)).toBeUndefined();
    });

    it('preserves the original Zod schema behavior', () => {
      const schema = option(z.string(), { env: 'TEST', help: 'test' });
      expect(schema.parse('hello')).toBe('hello');
      expect(() => schema.parse(123)).toThrow();
    });
  });

  describe('getAllOptionMeta()', () => {
    it('extracts all metadata from an object schema', () => {
      const schema = z.object({
        appId: option(z.string(), { env: 'APP_ID', help: 'App ID' }),
        port: option(z.number(), { env: 'PORT', help: 'Port number' }),
        noMeta: z.string(),
      });

      const allMeta = getAllOptionMeta(schema);
      expect(allMeta.size).toBe(2);
      expect(allMeta.get('appId').env).toBe('APP_ID');
      expect(allMeta.get('port').env).toBe('PORT');
      expect(allMeta.has('noMeta')).toBe(false);
    });
  });

  describe('buildEnvMap()', () => {
    it('builds a flat env map for simple schemas', () => {
      const schema = z.object({
        appId: option(z.string(), { env: 'PARSE_SERVER_APP_ID', help: 'App ID' }),
        port: option(z.number().default(1337), { env: 'PARSE_SERVER_PORT', help: 'Port' }),
      });

      const envMap = buildEnvMap(schema);
      expect(envMap.size).toBe(2);
      expect(envMap.get('PARSE_SERVER_APP_ID').path).toEqual(['appId']);
      expect(envMap.get('PARSE_SERVER_PORT').path).toEqual(['port']);
    });

    it('builds a nested env map for nested object schemas', () => {
      const innerSchema = z.object({
        strict: option(z.boolean().default(false), {
          env: 'PARSE_SERVER_SCHEMA_STRICT',
          help: 'Strict mode',
        }),
      });

      const schema = z.object({
        schema: option(innerSchema.optional(), {
          env: 'PARSE_SERVER_SCHEMA',
          help: 'Schema options',
        }),
      });

      const envMap = buildEnvMap(schema);
      expect(envMap.get('PARSE_SERVER_SCHEMA_STRICT').path).toEqual(['schema', 'strict']);
    });

    it('skips fields with no env metadata', () => {
      const schema = z.object({
        appId: option(z.string(), { env: 'APP_ID', help: 'App ID' }),
        secret: option(z.string(), { env: null, help: 'No env' }),
        noMeta: z.string(),
      });

      const envMap = buildEnvMap(schema);
      expect(envMap.size).toBe(1);
      expect(envMap.has('APP_ID')).toBe(true);
    });
  });

  describe('coerceValue()', () => {
    it('coerces string to number for ZodNumber', () => {
      expect(coerceValue('42', z.number())).toBe(42);
    });

    it('coerces float strings to numbers for ZodNumber', () => {
      expect(coerceValue('1.5', z.number())).toBe(1.5);
    });

    it('throws for non-numeric string with ZodNumber', () => {
      expect(() => coerceValue('abc', z.number())).toThrow('Expected a number');
    });

    it('coerces string to boolean for ZodBoolean', () => {
      expect(coerceValue('true', z.boolean())).toBe(true);
      expect(coerceValue('1', z.boolean())).toBe(true);
      expect(coerceValue('false', z.boolean())).toBe(false);
      expect(coerceValue('0', z.boolean())).toBe(false);
    });

    it('throws for unrecognized boolean string', () => {
      expect(() => coerceValue('tru', z.boolean())).toThrow('Expected a boolean');
    });

    it('coerces CSV string to array for ZodArray', () => {
      const result = coerceValue('a,b,c', z.array(z.string()));
      expect(result).toEqual(['a', 'b', 'c']);
    });

    it('coerces JSON array string to array for ZodArray', () => {
      const result = coerceValue('["a","b"]', z.array(z.string()));
      expect(result).toEqual(['a', 'b']);
    });

    it('coerces JSON string to object for ZodObject', () => {
      const result = coerceValue('{"key":"val"}', z.object({ key: z.string() }));
      expect(result).toEqual({ key: 'val' });
    });

    it('returns string as-is for ZodString', () => {
      expect(coerceValue('hello', z.string())).toBe('hello');
    });

    it('handles optional wrappers', () => {
      expect(coerceValue('42', z.number().optional())).toBe(42);
      expect(coerceValue('true', z.boolean().default(false))).toBe(true);
    });

    it('handles union types by trying each branch', () => {
      const schema = z.union([z.number(), z.string()]);
      expect(coerceValue('42', schema)).toBe(42);
      expect(coerceValue('hello', schema)).toBe('hello');
    });

    it('skips function branches in unions', () => {
      const schema = z.union([z.string(), z.function()]);
      expect(coerceValue('hello', schema)).toBe('hello');
    });
  });
});
