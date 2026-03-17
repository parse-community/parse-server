const { LegacyAdapter } = require('../lib/cloud-code/adapters/LegacyAdapter');
const path = require('path');

const mockRegistry = {
  defineFunction: () => {},
  defineTrigger: () => {},
  defineJob: () => {},
  defineLiveQueryHandler: () => {},
};
const mockConfig = {
  appId: 'test',
  masterKey: 'mk',
  serverURL: 'http://localhost',
};

describe('LegacyAdapter', () => {
  it('has name "legacy"', () => {
    const adapter = new LegacyAdapter(() => {});
    expect(adapter.name).toBe('legacy');
  });

  it('initialize calls a function with Parse', async () => {
    const cloudFn = jasmine.createSpy('cloudFn');
    const adapter = new LegacyAdapter(cloudFn);
    await adapter.initialize(mockRegistry, mockConfig);
    expect(cloudFn).toHaveBeenCalledTimes(1);
    const Parse = require('parse/node').Parse;
    expect(cloudFn).toHaveBeenCalledWith(Parse);
  });

  it('initialize awaits a function that returns a Promise', async () => {
    let resolved = false;
    const cloudFn = () =>
      new Promise((resolve) => {
        setTimeout(() => {
          resolved = true;
          resolve();
        }, 10);
      });
    const adapter = new LegacyAdapter(cloudFn);
    await adapter.initialize(mockRegistry, mockConfig);
    expect(resolved).toBe(true);
  });

  it('initialize with a valid cloud code file path loads the file', async () => {
    // Use a minimal temp file that doesn't register global cloud functions
    const fs = require('fs');
    const tmpFile = path.resolve(__dirname, '_legacyAdapterTestTemp.js');
    fs.writeFileSync(tmpFile, 'module.exports = {};');
    try {
      const adapter = new LegacyAdapter(tmpFile);
      await expectAsync(adapter.initialize(mockRegistry, mockConfig)).toBeResolved();
    } finally {
      fs.unlinkSync(tmpFile);
      delete require.cache[require.resolve(tmpFile)];
    }
  });

  it('initialize with a non-existent path throws', async () => {
    const adapter = new LegacyAdapter('/non/existent/path/cloud.js');
    await expectAsync(adapter.initialize(mockRegistry, mockConfig)).toBeRejected();
  });

  it('isHealthy returns true', async () => {
    const adapter = new LegacyAdapter(() => {});
    const result = await adapter.isHealthy();
    expect(result).toBe(true);
  });

  it('shutdown resolves cleanly', async () => {
    const adapter = new LegacyAdapter(() => {});
    await expectAsync(adapter.shutdown()).toBeResolved();
  });
});
