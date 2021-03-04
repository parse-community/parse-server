'use strict';

const Config = require('../lib/Config');
const request = require('../lib/request');
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
});
