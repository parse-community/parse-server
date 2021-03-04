'use strict';

const Config = require('../lib/Config');
const Definitions = require('../lib/Options/Definitions');

describe('Security Checks', () => {
  let config;
  const publicServerURL = 'http://localhost:8378/1';

  async function reconfigureServerWithSecurityConfig(security) {
    config.security = security;
    await reconfigureServer(config);
  }

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
});
