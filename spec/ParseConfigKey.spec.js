const Config = require('../lib/Config');
const ParseServer = require('../lib/index').ParseServer;

describe('Config Keys', () => {
  const tests = [
    {
      name: 'Invalid Root Keys',
      options: { unknow: 'val', masterKeyIPs: '' },
      error: 'unknow, masterKeyIPs',
    },
    { name: 'Invalid Schema Keys', options: { schema: { Strict: 'val' } }, error: 'schema.Strict' },
    {
      name: 'Invalid Pages Keys',
      options: { pages: { customUrls: { EmailVerificationSendFail: 'val' } } },
      error: 'pages.customUrls.EmailVerificationSendFail',
    },
    {
      name: 'Invalid LiveQueryServerOptions Keys',
      options: { liveQueryServerOptions: { MasterKey: 'value' } },
      error: 'liveQueryServerOptions.MasterKey',
    },
    {
      name: 'Invalid RateLimit Keys - Array Item',
      options: { rateLimit: [{ RequestPath: '' }, { RequestTimeWindow: '' }] },
      error: 'rateLimit[0].RequestPath, rateLimit[1].RequestTimeWindow',
    },
  ];

  tests.forEach(test => {
    it(test.name, async () => {
      const logger = require('../lib/logger').logger;
      spyOn(logger, 'error').and.callThrough();
      spyOn(Config, 'validateOptions').and.callFake(() => {});

      new ParseServer({
        ...defaultConfiguration,
        ...test.options,
      });
      expect(logger.error).toHaveBeenCalledWith(`Invalid Option Keys Found: ${test.error}`);
    });
  });

  it('should run fine', async () => {
    try {
      await reconfigureServer({
        ...defaultConfiguration,
      });
    } catch (err) {
      fail('Should run without error');
    }
  });
});
