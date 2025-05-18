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
});
