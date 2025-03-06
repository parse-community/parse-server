const Utils = require('../src/Utils');

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
});
