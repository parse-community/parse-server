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
      await reconfigureServer(config);

      const group = new CheckGroupServerConfig();
      await group.run();
      expect(group.checks()[0].checkState()).toBe(CheckState.success);
      expect(group.checks()[1].checkState()).toBe(CheckState.success);
      expect(group.checks()[2].checkState()).toBe(CheckState.success);
    });

    it('checks fail correctly', async () => {
      config.masterKey = 'insecure';
      config.security.enableCheckLog = true;
      config.allowClientClassCreation = true;
      await reconfigureServer(config);

      const group = new CheckGroupServerConfig();
      await group.run();
      expect(group.checks()[0].checkState()).toBe(CheckState.fail);
      expect(group.checks()[1].checkState()).toBe(CheckState.fail);
      expect(group.checks()[2].checkState()).toBe(CheckState.fail);
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
      config.database.adapter._uri = 'protocol://user:aMoreSecur3Passwor7!@example.com';
      const group = new CheckGroupDatabase();
      await group.run();
      expect(group.checks()[0].checkState()).toBe(CheckState.success);
    });

    it('checks fail correctly', async () => {
      const config = Config.get(Parse.applicationId);
      config.database.adapter._uri = 'protocol://user:insecure@example.com';
      const group = new CheckGroupDatabase();
      await group.run();
      expect(group.checks()[0].checkState()).toBe(CheckState.fail);
    });
  });
});
