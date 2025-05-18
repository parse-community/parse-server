const { offsetToCursor } = require('graphql-relay');
const { calculateSkipAndLimit } = require('../lib/GraphQL/helpers/objectsQueries');

describe('GraphQL objectsQueries', () => {
  describe('calculateSkipAndLimit', () => {
    it('should fail with invalid params', () => {
      expect(() => calculateSkipAndLimit(-1)).toThrow(
        jasmine.stringMatching('Skip should be a positive number')
      );
      expect(() => calculateSkipAndLimit(1, -1)).toThrow(
        jasmine.stringMatching('First should be a positive number')
      );
      expect(() => calculateSkipAndLimit(1, 1, offsetToCursor(-1))).toThrow(
        jasmine.stringMatching('After is not a valid curso')
      );
      expect(() => calculateSkipAndLimit(1, 1, offsetToCursor(1), -1)).toThrow(
        jasmine.stringMatching('Last should be a positive number')
      );
      expect(() => calculateSkipAndLimit(1, 1, offsetToCursor(1), 1, offsetToCursor(-1))).toThrow(
        jasmine.stringMatching('Before is not a valid curso')
      );
    });

    it('should work only with skip', () => {
      expect(calculateSkipAndLimit(10)).toEqual({
        skip: 10,
        limit: undefined,
        needToPreCount: false,
      });
    });

    it('should work only with after', () => {
      expect(calculateSkipAndLimit(undefined, undefined, offsetToCursor(9))).toEqual({
        skip: 10,
        limit: undefined,
        needToPreCount: false,
      });
    });

    it('should work with limit and after', () => {
      expect(calculateSkipAndLimit(10, undefined, offsetToCursor(9))).toEqual({
        skip: 20,
        limit: undefined,
        needToPreCount: false,
      });
    });

    it('first alone should set the limit', () => {
      expect(calculateSkipAndLimit(10, 30, offsetToCursor(9))).toEqual({
        skip: 20,
        limit: 30,
        needToPreCount: false,
      });
    });

    it('if before cursor is less than skipped items, no objects will be returned', () => {
      expect(
        calculateSkipAndLimit(10, 30, offsetToCursor(9), undefined, offsetToCursor(5))
      ).toEqual({
        skip: 20,
        limit: 0,
        needToPreCount: false,
      });
    });

    it('if before cursor is greater than returned objects set by limit, nothing is changed', () => {
      expect(
        calculateSkipAndLimit(10, 30, offsetToCursor(9), undefined, offsetToCursor(100))
      ).toEqual({
        skip: 20,
        limit: 30,
        needToPreCount: false,
      });
    });

    it('if before cursor is less than returned objects set by limit, limit is adjusted', () => {
      expect(
        calculateSkipAndLimit(10, 30, offsetToCursor(9), undefined, offsetToCursor(40))
      ).toEqual({
        skip: 20,
        limit: 20,
        needToPreCount: false,
      });
    });

    it('last should work alone but requires pre count', () => {
      expect(calculateSkipAndLimit(undefined, undefined, undefined, 10)).toEqual({
        skip: undefined,
        limit: 10,
        needToPreCount: true,
      });
    });

    it('last should be adjusted to max limit', () => {
      expect(calculateSkipAndLimit(undefined, undefined, undefined, 10, undefined, 5)).toEqual({
        skip: undefined,
        limit: 5,
        needToPreCount: true,
      });
    });

    it('no objects will be returned if last is equal to 0', () => {
      expect(calculateSkipAndLimit(undefined, undefined, undefined, 0)).toEqual({
        skip: undefined,
        limit: 0,
        needToPreCount: false,
      });
    });

    it('nothing changes if last is bigger than the calculared limit', () => {
      expect(calculateSkipAndLimit(10, 30, offsetToCursor(9), 30, offsetToCursor(40))).toEqual({
        skip: 20,
        limit: 20,
        needToPreCount: false,
      });
    });

    it('If last is small than limit, new limit is calculated', () => {
      expect(calculateSkipAndLimit(10, 30, offsetToCursor(9), 10, offsetToCursor(40))).toEqual({
        skip: 30,
        limit: 10,
        needToPreCount: false,
      });
    });
  });
});
