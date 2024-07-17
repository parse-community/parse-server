const Config = require('../lib/Config');

fdescribe('Config Keys', () => {
  let loggerErrorSpy;

  beforeEach(async () => {
    const logger = require('../lib/logger').logger;
    loggerErrorSpy = spyOn(logger, 'error').and.callThrough();
    spyOn(Config, 'validateOptions').and.callFake(() => {});
  });

  it('recognizes invalid keys in root', async () => {
    await expectAsync(reconfigureServer({
      ...defaultConfiguration,
      invalidKey: 1,
    })).toBeResolved();
    const error = loggerErrorSpy.calls.all().reduce((s, call) => s += call.args[0], '');
    expect(error).toMatch(`Unknown key(s) found in Parse Server configuration`);
  });

  it('recognizes invalid keys in pages.customUrls', async () => {
    await expectAsync(reconfigureServer({
      ...defaultConfiguration,
      pages: {
        customUrls: {
          invalidKey: 1,
          EmailVerificationSendFail: 1,
        }
      }
    })).toBeResolved();
    const error = loggerErrorSpy.calls.all().reduce((s, call) => s += call.args[0], '');
    expect(error).toMatch(`Unknown key(s) found in Parse Server configuration`);
    expect(error).toMatch(`invalidKey`);
    expect(error).toMatch(`EmailVerificationSendFail`);
  });

  it('recognizes invalid keys in liveQueryServerOptions', async () => {
    await expectAsync(reconfigureServer({
      ...defaultConfiguration,
      liveQueryServerOptions: {
        invalidKey: 1,
        MasterKey: 1,
      }
    })).toBeResolved();
    const error = loggerErrorSpy.calls.all().reduce((s, call) => s += call.args[0], '');
    expect(error).toMatch(`Unknown key(s) found in Parse Server configuration`);
    expect(error).toMatch(`MasterKey`);
  });

  it('recognizes invalid keys in rateLimit', async () => {
    await expectAsync(reconfigureServer({
      ...defaultConfiguration,
      rateLimit: [
        { invalidKey: 1 },
        { RequestPath: 1 },
        { RequestTimeWindow: 1 },
      ]
    })).toBeRejected();
    const error = loggerErrorSpy.calls.all().reduce((s, call) => s += call.args[0], '');
    expect(error).toMatch('Unknown key(s) found in Parse Server configuration');
    expect(error).toMatch('rateLimit\\[0\\]\\.invalidKey');
    expect(error).toMatch('rateLimit\\[1\\]\\.RequestPath');
    expect(error).toMatch('rateLimit\\[2\\]\\.RequestTimeWindow');
  });

  it('recognizes valid keys in default configuration', async () => {
    await expectAsync(reconfigureServer({
      ...defaultConfiguration,
    })).toBeResolved();
    expect(loggerErrorSpy.calls.all().reduce((s, call) => s += call.args[0], '')).not.toMatch(`Unknown key(s) found in Parse Server configuration`);
  });

  fit('recognizes valid keys in databaseOptions', async () => {
    await expectAsync(reconfigureServer({
      databaseURI: 'mongodb://localhost:27017/parse',
      filesAdapter: null,
      databaseAdapter: null,
      databaseOptions: {
        retryWrites: true,
        maxTimeMS: 1000,
        maxStalenessSeconds: 10,
        maxPoolSize: 10,
      },
    })).toBeResolved();
    expect(loggerErrorSpy.calls.all().reduce((s, call) => s += call.args[0], '')).not.toMatch(`Unknown key(s) found in Parse Server configuration`);
  });
});
