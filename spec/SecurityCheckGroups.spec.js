'use strict';

const Config = require('../lib/Config');
const { CheckState } = require('../lib/Security/Check');
const CheckGroupServerConfig = require('../lib/Security/CheckGroups/CheckGroupServerConfig');
const CheckGroupDatabase = require('../lib/Security/CheckGroups/CheckGroupDatabase');

describe('Security Check Groups', () => {
  let config;

  beforeEach(async () => {
    config = {
      appId: 'test',
      appName: 'ExampleAppName',
      publicServerURL: 'http://localhost:8378/1',
      security: {
        enableCheck: true,
        enableCheckLog: false,
      },
    };
    await reconfigureServer(config);
  });

  describe('CheckGroupServerConfig', () => {
    it('is subclassed correctly', async () => {
      const group = new CheckGroupServerConfig();
      expect(group.name()).toBeDefined();
      expect(group.checks().length).toBeGreaterThan(0);
    });

    it('checks succeed correctly', async () => {
      config.masterKey = 'aMoreSecur3Passwor7!';
      config.security.enableCheckLog = false;
      config.allowClientClassCreation = false;
      config.enableInsecureAuthAdapters = false;
      config.graphQLPublicIntrospection = false;
      await reconfigureServer(config);

      const group = new CheckGroupServerConfig();
      await group.run();
      expect(group.checks()[0].checkState()).toBe(CheckState.success);
      expect(group.checks()[1].checkState()).toBe(CheckState.success);
      expect(group.checks()[2].checkState()).toBe(CheckState.success);
      expect(group.checks()[4].checkState()).toBe(CheckState.success);
      expect(group.checks()[5].checkState()).toBe(CheckState.success);
    });

    it('checks fail correctly', async () => {
      config.masterKey = 'insecure';
      config.security.enableCheckLog = true;
      config.allowClientClassCreation = true;
      config.graphQLPublicIntrospection = true;
      await reconfigureServer(config);

      const group = new CheckGroupServerConfig();
      await group.run();
      expect(group.checks()[0].checkState()).toBe(CheckState.fail);
      expect(group.checks()[1].checkState()).toBe(CheckState.fail);
      expect(group.checks()[2].checkState()).toBe(CheckState.fail);
      expect(group.checks()[4].checkState()).toBe(CheckState.fail);
      expect(group.checks()[5].checkState()).toBe(CheckState.fail);
    });

    it_only_db('mongo')('checks succeed correctly (MongoDB specific)', async () => {
      config.databaseAdapter = undefined;
      config.databaseOptions = { allowPublicExplain: false };
      await reconfigureServer(config);

      const group = new CheckGroupServerConfig();
      await group.run();
      expect(group.checks()[6].checkState()).toBe(CheckState.success);
    });

    it_only_db('mongo')('checks fail correctly (MongoDB specific)', async () => {
      config.databaseAdapter = undefined;
      config.databaseOptions = { allowPublicExplain: true };
      await reconfigureServer(config);

      const group = new CheckGroupServerConfig();
      await group.run();
      expect(group.checks()[6].checkState()).toBe(CheckState.fail);
    });
  });

  describe('CheckGroupDatabase', () => {
    it('is subclassed correctly', async () => {
      const group = new CheckGroupDatabase();
      expect(group.name()).toBeDefined();
      expect(group.checks().length).toBeGreaterThan(0);
    });

    it('checks succeed correctly', async () => {
      const config = Config.get(Parse.applicationId);
      const uri = config.database.adapter._uri;
      config.database.adapter._uri = 'protocol://user:aMoreSecur3Passwor7!@example.com';
      const group = new CheckGroupDatabase();
      await group.run();
      expect(group.checks()[0].checkState()).toBe(CheckState.success);
      config.database.adapter._uri = uri;
    });

    it('checks fail correctly', async () => {
      const config = Config.get(Parse.applicationId);
      const uri = config.database.adapter._uri;
      config.database.adapter._uri = 'protocol://user:insecure@example.com';
      const group = new CheckGroupDatabase();
      await group.run();
      expect(group.checks()[0].checkState()).toBe(CheckState.fail);
      config.database.adapter._uri = uri;
    });
  });
});
