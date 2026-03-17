const path = require('path');
const { loadFromFile } = require('../../../src/Options/loaders/fileLoader');

describe('fileLoader', () => {
  const configDir = path.join(__dirname, '../../configs');

  it('loads a direct config object from JSON', () => {
    const result = loadFromFile(path.join(configDir, 'CLIConfig.json'));
    expect(result.arg1).toBe('my_app');
    expect(result.arg2).toBe('8888');
  });

  it('loads config from apps array format', () => {
    const result = loadFromFile(path.join(configDir, 'CLIConfigApps.json'));
    expect(result.arg1).toBe('my_app');
  });

  it('throws for multiple apps', () => {
    // CLIConfigApps.json has a single app; test with a custom fixture
    const multiAppPath = path.join(configDir, 'CLIConfigMultipleApps.json');
    // Write a temp fixture
    const fs = require('fs');
    const multiApp = { apps: [{ arg1: 'a' }, { arg1: 'b' }] };
    fs.writeFileSync(multiAppPath, JSON.stringify(multiApp));
    try {
      expect(() => loadFromFile(multiAppPath)).toThrow('Multiple apps are not supported');
    } finally {
      fs.unlinkSync(multiAppPath);
    }
  });

  it('resolves relative paths', () => {
    const result = loadFromFile('./spec/configs/CLIConfig.json');
    expect(result.arg1).toBe('my_app');
  });
});
