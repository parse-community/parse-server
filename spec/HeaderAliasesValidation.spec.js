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

  it('should accept an empty aliases array for an allowlisted canonical header', () => {
    expect(() =>
      Config.validateHeaderAliases({
        'X-Parse-Application-Id': [],
      })
    ).not.toThrow();
  });

  it('should accept aliases with trimable surrounding whitespace', () => {
    expect(() =>
      Config.validateHeaderAliases({
        'X-Parse-Application-Id': ['  X-App-Id  '],
      })
    ).not.toThrow();
  });

  it('should accept differently cased allowlisted canonical headers', () => {
    expect(() =>
      Config.validateHeaderAliases({
        'x-parse-application-id': ['X-App-Id'],
      })
    ).not.toThrow();
  });

  it('should reject a non-object headerAliases value', () => {
    expect(() => Config.validateHeaderAliases([])).toThrow('Header aliases must be an object');
    expect(() => Config.validateHeaderAliases('bad')).toThrow('Header aliases must be an object');
    expect(() => Config.validateHeaderAliases(1)).toThrow('Header aliases must be an object');
  });

  it('should reject empty or whitespace-only canonical keys', () => {
    expect(() => Config.validateHeaderAliases({ '': ['X-App-Id'] })).toThrow(
      'Header aliases must contain non-empty string keys'
    );
    expect(() => Config.validateHeaderAliases({ '   ': ['X-App-Id'] })).toThrow(
      'Header aliases must contain non-empty string keys'
    );
  });

  it('should reject non-array aliases', () => {
    expect(() =>
      Config.validateHeaderAliases({
        'X-Parse-Application-Id': 'X-App-Id',
      })
    ).toThrow("Header aliases for 'X-Parse-Application-Id' must be an array");
  });

  it('should reject non-string aliases', () => {
    expect(() =>
      Config.validateHeaderAliases({
        'X-Parse-Application-Id': [1],
      })
    ).toThrow("Header aliases for 'X-Parse-Application-Id' must only contain strings");
  });

  it('should reject empty string aliases', () => {
    expect(() =>
      Config.validateHeaderAliases({
        'X-Parse-Application-Id': ['  '],
      })
    ).toThrow("Header aliases for 'X-Parse-Application-Id' must not contain empty strings");
  });

  it('should reject an alias that contains CRLF characters', () => {
    expect(() =>
      Config.validateHeaderAliases({
        'X-Parse-Application-Id': ['X-Foo\r\nSet-Cookie: evil'],
      })
    ).toThrowError(/contains invalid characters/);
  });

  it('should reject an alias that contains a colon', () => {
    expect(() =>
      Config.validateHeaderAliases({
        'X-Parse-Application-Id': ['X-Foo: bar'],
      })
    ).toThrowError(/contains invalid characters/);
  });

  it('should reject an alias that contains an internal space', () => {
    expect(() =>
      Config.validateHeaderAliases({
        'X-Parse-Application-Id': ['X Foo'],
      })
    ).toThrowError(/contains invalid characters/);
  });

  it('should reject an alias that contains characters outside A-Za-z0-9-', () => {
    expect(() =>
      Config.validateHeaderAliases({
        'X-Parse-Application-Id': ['X-App/Id'],
      })
    ).toThrowError(/contains invalid characters/);
  });

  it('should reject a canonical header that contains invalid characters', () => {
    expect(() =>
      Config.validateHeaderAliases({
        'X-Parse-Application-Id:': ['X-App-Id'],
      })
    ).toThrowError(/contains invalid characters/);
  });

  it('should reject canonical headers that are not allowlisted Parse headers', () => {
    expect(() =>
      Config.validateHeaderAliases({
        Authorization: ['X-Auth-Alias'],
      })
    ).toThrowError(/is not an allowed Parse header/);
    expect(() =>
      Config.validateHeaderAliases({
        Host: ['X-Host-Alias'],
      })
    ).toThrowError(/is not an allowed Parse header/);
    expect(() =>
      Config.validateHeaderAliases({
        Cookie: ['X-Cookie-Alias'],
      })
    ).toThrowError(/is not an allowed Parse header/);
    expect(() =>
      Config.validateHeaderAliases({
        'X-Custom': ['X-Custom-Alias'],
      })
    ).toThrowError(/is not an allowed Parse header/);
  });

  it('should reject credential-bearing master and maintenance key aliases', () => {
    expect(() =>
      Config.validateHeaderAliases({
        'X-Parse-Master-Key': ['X-Master-Key-Alias'],
      })
    ).toThrowError(/is not an allowed Parse header/);
    expect(() =>
      Config.validateHeaderAliases({
        'X-Parse-Maintenance-Key': ['X-Maintenance-Key-Alias'],
      })
    ).toThrowError(/is not an allowed Parse header/);
  });

  it('should reject an alias that normalizes to the same value as its canonical header', () => {
    expect(() =>
      Config.validateHeaderAliases({
        'X-Parse-Application-Id': ['x-parse-application-id'],
      })
    ).toThrowError(/must not normalize to the same value as the canonical header name/);
  });

  it('should reject duplicate normalized aliases within the same aliases array', () => {
    expect(() =>
      Config.validateHeaderAliases({
        'X-Parse-Application-Id': ['foo', 'FOO'],
      })
    ).toThrowError(/Duplicate normalized header alias/);
  });

  it('should reject two canonical keys that normalize to the same value', () => {
    expect(() =>
      Config.validateHeaderAliases({
        'X-Parse-Application-Id': [],
        'x-parse-application-id': [],
      })
    ).toThrowError(/collides with.*after trim and lowercasing/);
  });

  it('should reject the same normalized alias used for two different canonical headers', () => {
    expect(() =>
      Config.validateHeaderAliases({
        'X-Parse-Application-Id': ['shared-alias'],
        'X-Parse-Session-Token': ['Shared-Alias'],
      })
    ).toThrowError(/collides with alias/);
  });

  it('should reject an alias that normalizes to another canonical header key', () => {
    expect(() =>
      Config.validateHeaderAliases({
        'X-Parse-Session-Token': [],
        'X-Parse-Application-Id': ['x-parse-session-token'],
      })
    ).toThrowError(/collides with canonical header/);
  });
});
