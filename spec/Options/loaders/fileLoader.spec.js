const path = require('path');
const os = require('os');
const fs = require('fs');
const { loadFromFile } = require('../../../lib/Options/loaders/fileLoader');

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
    const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'parse-test-'));
    const multiAppPath = path.join(tempDir, 'CLIConfigMultipleApps.json');
    const multiApp = { apps: [{ arg1: 'a' }, { arg1: 'b' }] };
    fs.writeFileSync(multiAppPath, JSON.stringify(multiApp));
    try {
      expect(() => loadFromFile(multiAppPath)).toThrow('Multiple apps are not supported');
    } finally {
      fs.rmSync(tempDir, { recursive: true, force: true });
    }
  });

  it('throws for empty apps array', () => {
    const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'parse-test-'));
    const emptyAppsPath = path.join(tempDir, 'CLIConfigEmptyApps.json');
    fs.writeFileSync(emptyAppsPath, JSON.stringify({ apps: [] }));
    try {
      expect(() => loadFromFile(emptyAppsPath)).toThrow(
        'The "apps" array must contain at least one configuration'
      );
    } finally {
      fs.rmSync(tempDir, { recursive: true, force: true });
    }
  });

  it('throws for apps that is not an array', () => {
    const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'parse-test-'));
    const nonArrayAppsPath = path.join(tempDir, 'CLIConfigNonArrayApps.json');
    fs.writeFileSync(nonArrayAppsPath, JSON.stringify({ apps: {} }));
    try {
      expect(() => loadFromFile(nonArrayAppsPath)).toThrow(
        'The "apps" property must be an array'
      );
    } finally {
      fs.rmSync(tempDir, { recursive: true, force: true });
    }
  });

  it('resolves relative paths', () => {
    const absolutePath = path.join(configDir, 'CLIConfig.json');
    const relativePath = path.relative(process.cwd(), absolutePath);
    const result = loadFromFile(relativePath);
    expect(result.arg1).toBe('my_app');
  });
});
