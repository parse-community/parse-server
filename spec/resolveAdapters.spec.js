const { resolveAdapters } = require('../lib/cloud-code/resolveAdapters');
const { LegacyAdapter } = require('../lib/cloud-code/adapters/LegacyAdapter');
const { InProcessAdapter } = require('../lib/cloud-code/adapters/InProcessAdapter');
const { ExternalProcessAdapter } = require('../lib/cloud-code/adapters/ExternalProcessAdapter');

describe('resolveAdapters', () => {
  it('should return an empty array when no relevant options are provided', () => {
    const result = resolveAdapters({});
    expect(result).toEqual([]);
  });

  it('should spread cloudCodeAdapters into the result', () => {
    const adapter1 = { name: 'adapter1' };
    const adapter2 = { name: 'adapter2' };
    const result = resolveAdapters({ cloudCodeAdapters: [adapter1, adapter2] });
    expect(result.length).toBe(2);
    expect(result[0]).toBe(adapter1);
    expect(result[1]).toBe(adapter2);
  });

  it('should create a LegacyAdapter when cloud is a string', () => {
    const result = resolveAdapters({ cloud: './cloud/main.js' });
    expect(result.length).toBe(1);
    expect(result[0]).toBeInstanceOf(LegacyAdapter);
  });

  it('should create a LegacyAdapter when cloud is a function', () => {
    const cloudFunction = () => {};
    const result = resolveAdapters({ cloud: cloudFunction });
    expect(result.length).toBe(1);
    expect(result[0]).toBeInstanceOf(LegacyAdapter);
  });

  it('should create an InProcessAdapter when cloud is an object with getRouter', () => {
    const cloudObject = { getRouter: () => {} };
    const result = resolveAdapters({ cloud: cloudObject });
    expect(result.length).toBe(1);
    expect(result[0]).toBeInstanceOf(InProcessAdapter);
  });

  it('should throw when cloud is an invalid type (boolean)', () => {
    expect(() => resolveAdapters({ cloud: true })).toThrowError(
      "argument 'cloud' must either be a string or a function"
    );
  });

  it('should throw when cloud is an invalid type (number)', () => {
    expect(() => resolveAdapters({ cloud: 42 })).toThrowError(
      "argument 'cloud' must either be a string or a function"
    );
  });

  it('should throw when cloudCodeCommand is provided without webhookKey', () => {
    expect(() => resolveAdapters({ cloudCodeCommand: 'node cloud.js' })).toThrowError(
      'webhookKey is required when using cloudCodeCommand'
    );
  });

  it('should create an ExternalProcessAdapter when cloudCodeCommand and webhookKey are provided', () => {
    const result = resolveAdapters({
      cloudCodeCommand: 'node cloud.js',
      webhookKey: 'secret-key',
    });
    expect(result.length).toBe(1);
    expect(result[0]).toBeInstanceOf(ExternalProcessAdapter);
  });

  it('should combine multiple options into a single result array', () => {
    const customAdapter = { name: 'custom' };
    const result = resolveAdapters({
      cloudCodeAdapters: [customAdapter],
      cloud: './cloud/main.js',
      cloudCodeCommand: 'node cloud.js',
      webhookKey: 'secret-key',
    });
    expect(result.length).toBe(3);
    expect(result[0]).toBe(customAdapter);
    expect(result[1]).toBeInstanceOf(LegacyAdapter);
    expect(result[2]).toBeInstanceOf(ExternalProcessAdapter);
  });
});
