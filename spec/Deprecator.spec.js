'use strict';

const Deprecator = require('../lib/Deprecator/Deprecator');

describe('Deprecator', () => {
  let deprecations = [];

  beforeEach(async () => {
    deprecations = [{ optionKey: 'exampleKey', changeNewDefault: 'exampleNewDefault' }];
  });

  it('deprecations are an array', async () => {
    expect(Deprecator._getDeprecations()).toBeInstanceOf(Array);
  });

  it('logs deprecation for new default', async () => {
    deprecations = [{ optionKey: 'exampleKey', changeNewDefault: 'exampleNewDefault' }];

    spyOn(Deprecator, '_getDeprecations').and.callFake(() => deprecations);
    const logger = require('../lib/logger').logger;
    const logSpy = spyOn(logger, 'warn').and.callFake(() => {});

    await reconfigureServer();
    expect(logSpy.calls.all()[0].args[0]).toEqual(
      `DeprecationWarning: The Parse Server option '${deprecations[0].optionKey}' default will change to '${deprecations[0].changeNewDefault}' in a future version.`
    );
  });

  it('does not log deprecation for new default if option is set manually', async () => {
    deprecations = [{ optionKey: 'exampleKey', changeNewDefault: 'exampleNewDefault' }];

    spyOn(Deprecator, '_getDeprecations').and.callFake(() => deprecations);
    const logSpy = spyOn(Deprecator, '_logOption').and.callFake(() => {});
    await reconfigureServer({ [deprecations[0].optionKey]: 'manuallySet' });
    expect(logSpy).not.toHaveBeenCalled();
  });

  it('logs runtime deprecation', async () => {
    const logger = require('../lib/logger').logger;
    const logSpy = spyOn(logger, 'warn').and.callFake(() => {});
    const options = { usage: 'Doing this', solution: 'Do that instead.' };

    Deprecator.logRuntimeDeprecation(options);
    expect(logSpy.calls.all()[0].args[0]).toEqual(
      `DeprecationWarning: ${options.usage} is deprecated and will be removed in a future version. ${options.solution}`
    );
  });

  it('logs deprecation for nested option key with dot notation', async () => {
    deprecations = [{ optionKey: 'databaseOptions.testOption', changeNewDefault: 'false' }];

    spyOn(Deprecator, '_getDeprecations').and.callFake(() => deprecations);
    const logger = require('../lib/logger').logger;
    const logSpy = spyOn(logger, 'warn').and.callFake(() => {});

    await reconfigureServer();
    expect(logSpy.calls.all()[0].args[0]).toEqual(
      `DeprecationWarning: The Parse Server option '${deprecations[0].optionKey}' default will change to '${deprecations[0].changeNewDefault}' in a future version.`
    );
  });

  it('does not log deprecation for nested option key if option is set manually', async () => {
    deprecations = [{ optionKey: 'databaseOptions.testOption', changeNewDefault: 'false' }];

    spyOn(Deprecator, '_getDeprecations').and.callFake(() => deprecations);
    const logSpy = spyOn(Deprecator, '_logOption').and.callFake(() => {});
    const Config = require('../lib/Config');
    const config = Config.get('test');
    // Directly test scanParseServerOptions with nested option set
    Deprecator.scanParseServerOptions({ databaseOptions: { testOption: true } });
    expect(logSpy).not.toHaveBeenCalled();
  });

  it('logs deprecation for allowedFileUrlDomains when not set', async () => {
    const logSpy = spyOn(Deprecator, '_logOption').and.callFake(() => {});

    // Pass a fresh fileUpload object without allowedFileUrlDomains to avoid
    // inheriting the mutated default from a previous reconfigureServer() call.
    await reconfigureServer({
      fileUpload: {
        enableForPublic: true,
        enableForAnonymousUser: true,
        enableForAuthenticatedUser: true,
      },
    });
    expect(logSpy).toHaveBeenCalledWith(
      jasmine.objectContaining({
        optionKey: 'fileUpload.allowedFileUrlDomains',
        changeNewDefault: '[]',
      })
    );
  });

  it('does not log deprecation for allowedFileUrlDomains when explicitly set', async () => {
    const logSpy = spyOn(Deprecator, '_logOption').and.callFake(() => {});

    await reconfigureServer({
      fileUpload: { allowedFileUrlDomains: ['*'] },
    });
    expect(logSpy).not.toHaveBeenCalledWith(
      jasmine.objectContaining({
        optionKey: 'fileUpload.allowedFileUrlDomains',
      })
    );
  });
});
