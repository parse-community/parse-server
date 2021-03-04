'use strict';

const Utils = require('../lib/Utils');
const Config = require('../lib/Config');
const request = require('../lib/request');
const { Check, CheckState } = require('../lib/Security/Check');
const Definitions = require('../lib/Options/Definitions');

describe('Security Checks', () => {
  let config;
  const publicServerURL = 'http://localhost:8378/1';
  const securityUrl = publicServerURL + '/security';

  async function reconfigureServerWithSecurityConfig(security) {
    config.security = security;
    await reconfigureServer(config);
  }

  const securityRequest = (options) => request(Object.assign({
    url: securityUrl,
    headers: {
      'X-Parse-Master-Key': Parse.masterKey,
      'X-Parse-Application-Id': Parse.applicationId,
    },
    followRedirects: false,
  }, options)).catch(e => e);

  beforeEach(async () => {
    config = {
      appId: 'test',
      appName: 'ExampleAppName',
      publicServerURL,
      security: {
        enableCheck: true,
        enableCheckLog: true,
      },
    };
    await reconfigureServer(config);
  });

  describe('server options', () => {
    it('uses default configuration when none is set', async () => {
      await reconfigureServerWithSecurityConfig({});
      expect(Config.get(Parse.applicationId).security.enableCheck).toBe(
        Definitions.SecurityOptions.enableCheck.default
      );
      expect(Config.get(Parse.applicationId).security.enableCheckLog).toBe(
        Definitions.SecurityOptions.enableCheckLog.default
      );
    });

    it('throws on invalid configuration', async () => {
      const options = [
        [],
        'a',
        0,
        true,
        { enableCheck: 'a' },
        { enableCheck: 0 },
        { enableCheck: {} },
        { enableCheck: [] },
        { enableCheckLog: 'a' },
        { enableCheckLog: 0 },
        { enableCheckLog: {} },
        { enableCheckLog: [] },
      ];
      for (const option of options) {
        await expectAsync(reconfigureServerWithSecurityConfig(option)).toBeRejected();
      }
    });
  });

  describe('security endpoint accessibility', () => {
    it('responds with 403 without masterkey', async () => {
      const response = await securityRequest({ headers: {} });
      expect(response.status).toBe(403);
    });

    it('responds with 409 with masterkey and security check disabled', async () => {
      await reconfigureServerWithSecurityConfig({});
      const response = await securityRequest();
      expect(response.status).toBe(409);
    });

    it('responds with 200 with masterkey and security check enabled', async () => {
      const response = await securityRequest();
      expect(response.status).toBe(200);
    });
  });

  describe('check', () => {
    const initCheck = config => (() => new Check(config)).bind(null);

    it('instantiates check with valid parameters', async () => {
      const configs = [
        {
          group: 'string',
          title: 'string',
          warning: 'string',
          solution: 'string',
          script: () => {}
        },
        {
          group: 'string',
          title: 'string',
          warning: 'string',
          solution: 'string',
          script: async () => {},
        },
      ];
      for (const config of configs) {
        expect(initCheck(config)).not.toThrow();
      }
    });

    it('throws instantiating check with invalid parameters', async () => {
      const configDefinition = {
        group: [false, true, 0, 1, [], {}, () => {}],
        title: [false, true, 0, 1, [], {}, () => {}],
        warning: [false, true, 0, 1, [], {}, () => {}],
        solution: [false, true, 0, 1, [], {}, () => {}],
        script: [false, true, 0, 1, [], {}, 'string'],
      };
      const configs = Utils.getObjectKeyPermutations(configDefinition);

      for (const config of configs) {
        expect(initCheck(config)).toThrow();
      }
    });

    it('sets correct states for check success', async () => {
      const check = new Check({
        group: 'string',
        title: 'string',
        warning: 'string',
        solution: 'string',
        script: () => {},
      });
      expect(check._checkState == CheckState.none);
      check.run();
      expect(check._checkState == CheckState.success);
    });

    it('sets correct states for check fail', async () => {
      const check = new Check({
        group: 'string',
        title: 'string',
        warning: 'string',
        solution: 'string',
        script: () => { throw 'error' },
      });
      expect(check._checkState == CheckState.none);
      check.run();
      expect(check._checkState == CheckState.fail);
    });
  });
});
