'use strict';

const Config = require('../lib/Config');

describe('Config.validateHeaderAliases', () => {
  it('should accept null and undefined', () => {
    expect(() => Config.validateHeaderAliases(null)).not.toThrow();
    expect(() => Config.validateHeaderAliases(undefined)).not.toThrow();
  });

  it('should accept a valid headerAliases object', () => {
    expect(() =>
      Config.validateHeaderAliases({
        'X-Parse-Application-Id': ['X-App-Id'],
        'X-Parse-Session-Token': ['X-Session-Token-Alias'],
      })
    ).not.toThrow();
  });

  it('should reject an alias that normalizes to the same value as its canonical header', () => {
    expect(() =>
      Config.validateHeaderAliases({
        'X-Foo': ['x-foo'],
      })
    ).toThrowError(/must not normalize to the same value as the canonical header name/);
  });

  it('should reject duplicate normalized aliases within the same aliases array', () => {
    expect(() =>
      Config.validateHeaderAliases({
        'X-A': ['foo', 'FOO'],
      })
    ).toThrowError(/Duplicate normalized header alias/);
  });

  it('should reject two canonical keys that normalize to the same value', () => {
    expect(() =>
      Config.validateHeaderAliases({
        'X-Foo': [],
        'x-foo': [],
      })
    ).toThrowError(/collides with.*after trim and lowercasing/);
  });

  it('should reject the same normalized alias used for two different canonical headers', () => {
    expect(() =>
      Config.validateHeaderAliases({
        'X-A': ['shared-alias'],
        'X-B': ['Shared-Alias'],
      })
    ).toThrowError(/collides with alias/);
  });

  it('should reject an alias that normalizes to another canonical header key', () => {
    expect(() =>
      Config.validateHeaderAliases({
        'X-Parse-Bar': [],
        'X-Parse-Foo': ['x-parse-bar'],
      })
    ).toThrowError(/collides with canonical header/);
  });
});
