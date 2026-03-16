const Utils = require('../lib/Utils');
const { createSanitizedError, createSanitizedHttpError } = require("../lib/Error")
const vm = require('vm');

describe('Utils', () => {
  describe('encodeForUrl', () => {
    it('should properly escape email with all special ASCII characters for use in URLs', async () => {
      const values = [
        { input: `!\"'),.:;<>?]^}`, output: '%21%22%27%29%2C%2E%3A%3B%3C%3E%3F%5D%5E%7D' },
      ]
      for (const value of values) {
        expect(Utils.encodeForUrl(value.input)).toBe(value.output);
      }
    });
  });

  describe('addNestedKeysToRoot', () => {
    it('should move the nested keys to root of object', async () => {
      const obj = {
        a: 1,
        b: {
          c: 2,
          d: 3
        },
        e: 4
      };
      Utils.addNestedKeysToRoot(obj, 'b');
      expect(obj).toEqual({
        a: 1,
        c: 2,
        d: 3,
        e: 4
      });
    });

    it('should not modify the object if the key does not exist', async () => {
      const obj = {
        a: 1,
        e: 4
      };
      Utils.addNestedKeysToRoot(obj, 'b');
      expect(obj).toEqual({
        a: 1,
        e: 4
      });
    });

    it('should not modify the object if the key is not an object', () => {
      const obj = {
        a: 1,
        b: 2,
        e: 4
      };
      Utils.addNestedKeysToRoot(obj, 'b');
      expect(obj).toEqual({
        a: 1,
        b: 2,
        e: 4
      });
    });
  });

  describe('getCircularReplacer', () => {
    it('should handle Map instances', () => {
      const obj = {
        name: 'test',
        mapData: new Map([
          ['key1', 'value1'],
          ['key2', 'value2']
        ])
      };
      const result = JSON.stringify(obj, Utils.getCircularReplacer());
      expect(result).toBe('{"name":"test","mapData":{"key1":"value1","key2":"value2"}}');
    });

    it('should handle Set instances', () => {
      const obj = {
        name: 'test',
        setData: new Set([1, 2, 3])
      };
      const result = JSON.stringify(obj, Utils.getCircularReplacer());
      expect(result).toBe('{"name":"test","setData":[1,2,3]}');
    });

    it('should handle circular references', () => {
      const obj = { name: 'test', value: 123 };
      obj.self = obj;
      const result = JSON.stringify(obj, Utils.getCircularReplacer());
      expect(result).toBe('{"name":"test","value":123,"self":"[Circular]"}');
    });

    it('should handle nested circular references', () => {
      const obj = {
        name: 'parent',
        child: {
          name: 'child'
        }
      };
      obj.child.parent = obj;
      const result = JSON.stringify(obj, Utils.getCircularReplacer());
      expect(result).toBe('{"name":"parent","child":{"name":"child","parent":"[Circular]"}}');
    });

    it('should handle mixed Map, Set, and circular references', () => {
      const obj = {
        mapData: new Map([['key', 'value']]),
        setData: new Set([1, 2]),
        regular: 'data'
      };
      obj.circular = obj;
      const result = JSON.stringify(obj, Utils.getCircularReplacer());
      expect(result).toBe('{"mapData":{"key":"value"},"setData":[1,2],"regular":"data","circular":"[Circular]"}');
    });

    it('should handle normal objects without modification', () => {
      const obj = {
        name: 'test',
        number: 42,
        nested: {
          key: 'value'
        }
      };
      const result = JSON.stringify(obj, Utils.getCircularReplacer());
      expect(result).toBe('{"name":"test","number":42,"nested":{"key":"value"}}');
    });
  });

  describe('getNestedProperty', () => {
    it('should get top-level property', () => {
      const obj = { foo: 'bar' };
      expect(Utils.getNestedProperty(obj, 'foo')).toBe('bar');
    });

    it('should get nested property with dot notation', () => {
      const obj = { database: { options: { enabled: true } } };
      expect(Utils.getNestedProperty(obj, 'database.options.enabled')).toBe(true);
    });

    it('should return undefined for non-existent property', () => {
      const obj = { foo: 'bar' };
      expect(Utils.getNestedProperty(obj, 'baz')).toBeUndefined();
    });

    it('should return undefined for non-existent nested property', () => {
      const obj = { database: { options: {} } };
      expect(Utils.getNestedProperty(obj, 'database.options.enabled')).toBeUndefined();
    });

    it('should return undefined when path traverses non-object', () => {
      const obj = { database: 'string' };
      expect(Utils.getNestedProperty(obj, 'database.options.enabled')).toBeUndefined();
    });

    it('should return undefined for null object', () => {
      expect(Utils.getNestedProperty(null, 'foo')).toBeUndefined();
    });

    it('should return undefined for empty path', () => {
      const obj = { foo: 'bar' };
      expect(Utils.getNestedProperty(obj, '')).toBeUndefined();
    });

    it('should handle value of 0', () => {
      const obj = { database: { timeout: 0 } };
      expect(Utils.getNestedProperty(obj, 'database.timeout')).toBe(0);
    });

    it('should handle value of false', () => {
      const obj = { database: { enabled: false } };
      expect(Utils.getNestedProperty(obj, 'database.enabled')).toBe(false);
    });

    it('should handle value of empty string', () => {
      const obj = { database: { name: '' } };
      expect(Utils.getNestedProperty(obj, 'database.name')).toBe('');
    });
  });

  describe('parseSizeToBytes', () => {
    it('parses megabyte string', () => {
      expect(Utils.parseSizeToBytes('20mb')).toBe(20 * 1024 * 1024);
    });

    it('parses Mb string (case-insensitive)', () => {
      expect(Utils.parseSizeToBytes('20Mb')).toBe(20 * 1024 * 1024);
    });

    it('parses kilobyte string', () => {
      expect(Utils.parseSizeToBytes('512kb')).toBe(512 * 1024);
    });

    it('parses gigabyte string', () => {
      expect(Utils.parseSizeToBytes('1gb')).toBe(1 * 1024 * 1024 * 1024);
    });

    it('parses bytes suffix', () => {
      expect(Utils.parseSizeToBytes('100b')).toBe(100);
    });

    it('parses plain number as bytes', () => {
      expect(Utils.parseSizeToBytes(1048576)).toBe(1048576);
    });

    it('parses numeric string as bytes', () => {
      expect(Utils.parseSizeToBytes('1048576')).toBe(1048576);
    });

    it('parses decimal value and floors result', () => {
      expect(Utils.parseSizeToBytes('1.5mb')).toBe(Math.floor(1.5 * 1024 * 1024));
    });

    it('trims whitespace around value', () => {
      expect(Utils.parseSizeToBytes('  20mb  ')).toBe(20 * 1024 * 1024);
    });

    it('allows whitespace between number and unit', () => {
      expect(Utils.parseSizeToBytes('20 mb')).toBe(20 * 1024 * 1024);
    });

    it('parses zero', () => {
      expect(Utils.parseSizeToBytes('0')).toBe(0);
      expect(Utils.parseSizeToBytes(0)).toBe(0);
    });

    it('throws on invalid string', () => {
      expect(() => Utils.parseSizeToBytes('abc')).toThrow();
    });

    it('throws on negative value', () => {
      expect(() => Utils.parseSizeToBytes('-5mb')).toThrow();
    });

    it('throws on empty string', () => {
      expect(() => Utils.parseSizeToBytes('')).toThrow();
    });

    it('throws on unsupported unit', () => {
      expect(() => Utils.parseSizeToBytes('10tb')).toThrow();
    });

    it('throws on NaN', () => {
      expect(() => Utils.parseSizeToBytes(NaN)).toThrow();
    });

    it('throws on Infinity', () => {
      expect(() => Utils.parseSizeToBytes(Infinity)).toThrow();
    });

    it('throws on negative number', () => {
      expect(() => Utils.parseSizeToBytes(-1)).toThrow();
    });
  });

  describe('createSanitizedError', () => {
    it('should return "Permission denied" when enableSanitizedErrorResponse is true', () => {
      const config = { enableSanitizedErrorResponse: true };
      const error = createSanitizedError(Parse.Error.OPERATION_FORBIDDEN, 'Detailed error message', config);
      expect(error.message).toBe('Permission denied');
    });

    it('should not crash with config undefined', () => {
      const error = createSanitizedError(Parse.Error.OPERATION_FORBIDDEN, 'Detailed error message', undefined);
      expect(error.message).toBe('Permission denied');
    });

    it('should return the detailed message when enableSanitizedErrorResponse is false', () => {
      const config = { enableSanitizedErrorResponse: false };
      const error = createSanitizedError(Parse.Error.OPERATION_FORBIDDEN, 'Detailed error message', config);
      expect(error.message).toBe('Detailed error message');
    });
  });

  describe('createSanitizedHttpError', () => {
    it('should return "Permission denied" when enableSanitizedErrorResponse is true', () => {
      const config = { enableSanitizedErrorResponse: true };
      const error = createSanitizedHttpError(403, 'Detailed error message', config);
      expect(error.message).toBe('Permission denied');
    });

    it('should not crash with config undefined', () => {
      const error = createSanitizedHttpError(403, 'Detailed error message', undefined);
      expect(error.message).toBe('Permission denied');
    });

    it('should return the detailed message when enableSanitizedErrorResponse is false', () => {
      const config = { enableSanitizedErrorResponse: false };
      const error = createSanitizedHttpError(403, 'Detailed error message', config);
      expect(error.message).toBe('Detailed error message');
    });
  });

  describe('isDate', () => {
    it('should return true for a Date', () => {
      expect(Utils.isDate(new Date())).toBe(true);
    });
    it('should return true for a cross-realm Date', () => {
      const crossRealmDate = vm.runInNewContext('new Date()');
      // eslint-disable-next-line no-restricted-syntax -- intentional: proving instanceof fails cross-realm
      expect(crossRealmDate instanceof Date).toBe(false);
      expect(Utils.isDate(crossRealmDate)).toBe(true);
    });
    it('should return false for non-Date values', () => {
      expect(Utils.isDate(null)).toBe(false);
      expect(Utils.isDate(undefined)).toBe(false);
      expect(Utils.isDate('2021-01-01')).toBe(false);
      expect(Utils.isDate(123)).toBe(false);
      expect(Utils.isDate({})).toBe(false);
    });
  });

  describe('isRegExp', () => {
    it('should return true for a RegExp', () => {
      expect(Utils.isRegExp(/test/)).toBe(true);
      expect(Utils.isRegExp(new RegExp('test'))).toBe(true);
    });
    it('should return true for a cross-realm RegExp', () => {
      const crossRealmRegExp = vm.runInNewContext('/test/');
      // eslint-disable-next-line no-restricted-syntax -- intentional: proving instanceof fails cross-realm
      expect(crossRealmRegExp instanceof RegExp).toBe(false);
      expect(Utils.isRegExp(crossRealmRegExp)).toBe(true);
    });
    it('should return false for non-RegExp values', () => {
      expect(Utils.isRegExp(null)).toBe(false);
      expect(Utils.isRegExp(undefined)).toBe(false);
      expect(Utils.isRegExp('/test/')).toBe(false);
      expect(Utils.isRegExp({})).toBe(false);
    });
  });

  describe('isMap', () => {
    it('should return true for a Map', () => {
      expect(Utils.isMap(new Map())).toBe(true);
    });
    it('should return true for a cross-realm Map', () => {
      const crossRealmMap = vm.runInNewContext('new Map()');
      // eslint-disable-next-line no-restricted-syntax -- intentional: proving instanceof fails cross-realm
      expect(crossRealmMap instanceof Map).toBe(false);
      expect(Utils.isMap(crossRealmMap)).toBe(true);
    });
    it('should return false for non-Map values', () => {
      expect(Utils.isMap(null)).toBe(false);
      expect(Utils.isMap(undefined)).toBe(false);
      expect(Utils.isMap({})).toBe(false);
      expect(Utils.isMap(new Set())).toBe(false);
    });
  });

  describe('isSet', () => {
    it('should return true for a Set', () => {
      expect(Utils.isSet(new Set())).toBe(true);
    });
    it('should return true for a cross-realm Set', () => {
      const crossRealmSet = vm.runInNewContext('new Set()');
      // eslint-disable-next-line no-restricted-syntax -- intentional: proving instanceof fails cross-realm
      expect(crossRealmSet instanceof Set).toBe(false);
      expect(Utils.isSet(crossRealmSet)).toBe(true);
    });
    it('should return false for non-Set values', () => {
      expect(Utils.isSet(null)).toBe(false);
      expect(Utils.isSet(undefined)).toBe(false);
      expect(Utils.isSet({})).toBe(false);
      expect(Utils.isSet(new Map())).toBe(false);
    });
  });

  describe('isNativeError', () => {
    it('should return true for an Error', () => {
      expect(Utils.isNativeError(new Error('test'))).toBe(true);
    });
    it('should return true for Error subclasses', () => {
      expect(Utils.isNativeError(new TypeError('test'))).toBe(true);
      expect(Utils.isNativeError(new RangeError('test'))).toBe(true);
    });
    it('should return true for a cross-realm Error', () => {
      const crossRealmError = vm.runInNewContext('new Error("test")');
      // eslint-disable-next-line no-restricted-syntax -- intentional: proving instanceof fails cross-realm
      expect(crossRealmError instanceof Error).toBe(false);
      expect(Utils.isNativeError(crossRealmError)).toBe(true);
    });
    it('should return false for non-Error values', () => {
      expect(Utils.isNativeError(null)).toBe(false);
      expect(Utils.isNativeError(undefined)).toBe(false);
      expect(Utils.isNativeError({ message: 'fake' })).toBe(false);
      expect(Utils.isNativeError('error')).toBe(false);
    });
  });

  describe('isPromise', () => {
    it('should return true for a Promise', () => {
      expect(Utils.isPromise(Promise.resolve())).toBe(true);
    });
    it('should return true for a cross-realm Promise', () => {
      const crossRealmPromise = vm.runInNewContext('Promise.resolve()');
      // eslint-disable-next-line no-restricted-syntax -- intentional: proving instanceof fails cross-realm
      expect(crossRealmPromise instanceof Promise).toBe(false);
      expect(Utils.isPromise(crossRealmPromise)).toBe(true);
    });
    it('should return true for a thenable', () => {
      expect(Utils.isPromise({ then: () => {} })).toBe(true);
    });
    it('should return false for non-Promise values', () => {
      expect(Utils.isPromise(null)).toBe(false);
      expect(Utils.isPromise(undefined)).toBe(false);
      expect(Utils.isPromise({})).toBe(false);
      expect(Utils.isPromise(42)).toBe(false);
    });
    it('should return false for plain objects when Object.prototype.then is polluted', () => {
      Object.prototype.then = () => {};
      try {
        expect(Utils.isPromise({})).toBe(false);
        expect(Utils.isPromise({ a: 1 })).toBe(false);
      } finally {
        delete Object.prototype.then;
      }
    });
    it('should return true for real thenables even when Object.prototype.then is polluted', () => {
      Object.prototype.then = () => {};
      try {
        expect(Utils.isPromise({ then: () => {} })).toBe(true);
        expect(Utils.isPromise(Promise.resolve())).toBe(true);
      } finally {
        delete Object.prototype.then;
      }
    });
  });

  describe('isObject', () => {
    it('should return true for plain objects', () => {
      expect(Utils.isObject({})).toBe(true);
      expect(Utils.isObject({ a: 1 })).toBe(true);
    });
    it('should return true for a cross-realm object', () => {
      const crossRealmObj = vm.runInNewContext('({ a: 1 })');
      // eslint-disable-next-line no-restricted-syntax -- intentional: proving instanceof fails cross-realm
      expect(crossRealmObj instanceof Object).toBe(false);
      expect(Utils.isObject(crossRealmObj)).toBe(true);
    });
    it('should return true for arrays and other objects', () => {
      expect(Utils.isObject([])).toBe(true);
      expect(Utils.isObject(new Date())).toBe(true);
    });
    it('should return false for non-object values', () => {
      expect(Utils.isObject(null)).toBe(false);
      expect(Utils.isObject(undefined)).toBe(false);
      expect(Utils.isObject(42)).toBe(false);
      expect(Utils.isObject('string')).toBe(false);
      expect(Utils.isObject(true)).toBe(false);
    });
  });
});
