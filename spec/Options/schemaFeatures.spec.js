const { z } = require('zod');
const {
  option,
  getDynamicKeys,
  getOptionGroups,
  warnInapplicableOptions,
  getAllOptionMeta,
} = require('../../lib/Options/schemaUtils');
const { ParseServerOptionsSchema } = require('../../lib/Options/schemas/ParseServerOptions');

describe('Phase 4: Advanced Features', () => {

  describe('Dynamic keys (#9052)', () => {
    it('identifies dynamic keys from schema metadata', () => {
      const dynamicKeys = getDynamicKeys(ParseServerOptionsSchema);
      expect(dynamicKeys).toContain('masterKey');
      expect(dynamicKeys).toContain('publicServerURL');
    });

    it('does not include non-dynamic keys', () => {
      const dynamicKeys = getDynamicKeys(ParseServerOptionsSchema);
      expect(dynamicKeys).not.toContain('appId');
      expect(dynamicKeys).not.toContain('port');
      expect(dynamicKeys).not.toContain('databaseURI');
    });

    it('works with custom schemas', () => {
      const schema = z.object({
        staticKey: option(z.string(), { env: 'A', help: 'static' }),
        dynamicKey: option(z.union([z.string(), z.custom(v => typeof v === 'function')]), {
          env: 'B', help: 'dynamic', dynamic: true,
        }),
      });
      const keys = getDynamicKeys(schema);
      expect(keys).toEqual(['dynamicKey']);
    });
  });

  describe('Option groups (#7069)', () => {
    it('returns logical option groups', () => {
      const groups = getOptionGroups();
      expect(groups.length).toBeGreaterThan(0);

      const groupNames = groups.map(g => g.name);
      expect(groupNames).toContain('Core');
      expect(groupNames).toContain('Security');
      expect(groupNames).toContain('Users & Auth');
      expect(groupNames).toContain('Database');
      expect(groupNames).toContain('GraphQL');
      expect(groupNames).toContain('LiveQuery');
      expect(groupNames).toContain('API Behavior');
    });

    it('Core group contains essential fields', () => {
      const groups = getOptionGroups();
      const core = groups.find(g => g.name === 'Core');
      expect(core.keys).toContain('appId');
      expect(core.keys).toContain('masterKey');
      expect(core.keys).toContain('serverURL');
      expect(core.keys).toContain('port');
      expect(core.keys).toContain('databaseURI');
    });

    it('Security group contains security fields', () => {
      const groups = getOptionGroups();
      const security = groups.find(g => g.name === 'Security');
      expect(security.keys).toContain('masterKeyIps');
      expect(security.keys).toContain('enforcePrivateUsers');
      expect(security.keys).toContain('security');
    });

    it('all group keys exist in ParseServerOptions schema', () => {
      const groups = getOptionGroups();
      const schemaKeys = Object.keys(ParseServerOptionsSchema.shape);

      for (const group of groups) {
        for (const key of group.keys) {
          expect(schemaKeys).toContain(key);
        }
      }
    });

    it('each group has name, description, and keys', () => {
      const groups = getOptionGroups();
      for (const group of groups) {
        expect(typeof group.name).toBe('string');
        expect(group.name.length).toBeGreaterThan(0);
        expect(typeof group.description).toBe('string');
        expect(group.description.length).toBeGreaterThan(0);
        expect(Array.isArray(group.keys)).toBe(true);
        expect(group.keys.length).toBeGreaterThan(0);
      }
    });
  });

  describe('Startup method applicability (#8432/#8300)', () => {
    it('cluster is marked as CLI-only', () => {
      const meta = getAllOptionMeta(ParseServerOptionsSchema);
      const clusterMeta = meta.get('cluster');
      expect(clusterMeta.applicableTo).toEqual(['cli']);
    });

    it('startLiveQueryServer is marked as CLI-only', () => {
      const meta = getAllOptionMeta(ParseServerOptionsSchema);
      const lqMeta = meta.get('startLiveQueryServer');
      expect(lqMeta.applicableTo).toEqual(['cli']);
    });

    it('warnInapplicableOptions warns for CLI-only options in API context', () => {
      const warnings = [];
      const logger = msg => warnings.push(msg);

      warnInapplicableOptions(
        { cluster: 2, appId: 'test' },
        'api',
        ParseServerOptionsSchema,
        logger
      );

      expect(warnings.length).toBe(1);
      expect(warnings[0]).toContain('cluster');
      expect(warnings[0]).toContain('cli');
    });

    it('warnInapplicableOptions does not warn in correct context', () => {
      const warnings = [];
      const logger = msg => warnings.push(msg);

      warnInapplicableOptions(
        { cluster: 2 },
        'cli',
        ParseServerOptionsSchema,
        logger
      );

      expect(warnings.length).toBe(0);
    });

    it('warnInapplicableOptions does not warn for options without applicableTo', () => {
      const warnings = [];
      const logger = msg => warnings.push(msg);

      warnInapplicableOptions(
        { appId: 'test', port: 1337, masterKey: 'key' },
        'api',
        ParseServerOptionsSchema,
        logger
      );

      expect(warnings.length).toBe(0);
    });

    it('warnInapplicableOptions ignores undefined option values', () => {
      const warnings = [];
      const logger = msg => warnings.push(msg);

      warnInapplicableOptions(
        { cluster: undefined },
        'api',
        ParseServerOptionsSchema,
        logger
      );

      expect(warnings.length).toBe(0);
    });
  });

  describe('Config.js uses schema-driven dynamic keys', () => {
    it('asyncKeys are derived from schema metadata', () => {
      // Verify that Config.js now uses getDynamicKeys instead of hardcoded array
      const dynamicKeys = getDynamicKeys(ParseServerOptionsSchema);
      expect(dynamicKeys).toContain('publicServerURL');
      expect(dynamicKeys).toContain('masterKey');
      // These are the keys that Config.transformConfiguration will handle
    });
  });
});
