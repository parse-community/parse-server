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
    expect(logSpy.calls.all()[0].args[0]).toContain(deprecations[0].optionKey);
    expect(logSpy.calls.all()[0].args[0]).toContain(deprecations[0].changeNewDefault);
  });

  it('does not log deprecation for new default if option is set manually', async () => {
    deprecations = [{ optionKey: 'exampleKey', changeNewDefault: 'exampleNewDefault' }];

    spyOn(Deprecator, '_getDeprecations').and.callFake(() => deprecations);
    const logSpy = spyOn(Deprecator, '_log').and.callFake(() => {});
    await reconfigureServer({ [deprecations[0].optionKey]: 'manuallySet' });
    expect(logSpy).not.toHaveBeenCalled();
  });
});
