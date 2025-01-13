const Utils = require('../src/Utils');

describe('Utils', () => {
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
