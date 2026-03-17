const { mergeConfigs } = require('../../../src/Options/loaders/mergeConfig');

describe('mergeConfig', () => {
  it('merges flat objects with later sources winning', () => {
    const result = mergeConfigs(
      { appId: 'fromFile', port: 1337 },
      { port: 8080 },
      { appId: 'fromCli' }
    );
    expect(result).toEqual({ appId: 'fromCli', port: 8080 });
  });

  it('deep merges nested objects', () => {
    const result = mergeConfigs(
      { schema: { strict: false, definitions: [] } },
      { schema: { strict: true } }
    );
    expect(result).toEqual({
      schema: { strict: true, definitions: [] },
    });
  });

  it('overwrites arrays instead of merging them', () => {
    const result = mergeConfigs(
      { ips: ['127.0.0.1'] },
      { ips: ['10.0.0.1', '10.0.0.2'] }
    );
    expect(result).toEqual({ ips: ['10.0.0.1', '10.0.0.2'] });
  });

  it('overwrites primitives with objects', () => {
    const result = mergeConfigs(
      { value: 'string' },
      { value: { nested: true } }
    );
    expect(result).toEqual({ value: { nested: true } });
  });

  it('skips undefined values in sources', () => {
    const result = mergeConfigs(
      { appId: 'original', port: 1337 },
      { appId: undefined, port: 8080 }
    );
    expect(result).toEqual({ appId: 'original', port: 8080 });
  });

  it('returns empty object when no sources provided', () => {
    expect(mergeConfigs()).toEqual({});
  });

  it('handles single source', () => {
    const result = mergeConfigs({ appId: 'test' });
    expect(result).toEqual({ appId: 'test' });
  });

  it('deep merges multiple levels', () => {
    const result = mergeConfigs(
      { a: { b: { c: 1, d: 2 } } },
      { a: { b: { c: 3 }, e: 4 } }
    );
    expect(result).toEqual({ a: { b: { c: 3, d: 2 }, e: 4 } });
  });
});
