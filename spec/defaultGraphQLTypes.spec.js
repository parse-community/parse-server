const {
  TypeValidationError,
  parseStringValue,
  parseIntValue,
  parseFloatValue,
  parseBooleanValue,
  parseDateValue,
} = require('../lib/GraphQL/loaders/defaultGraphQLTypes');

describe('defaultGraphQLTypes', () => {
  describe('TypeValidationError', () => {
    it('should be an error with specific message', () => {
      const typeValidationError = new TypeValidationError(
        'somevalue',
        'sometype'
      );
      expect(typeValidationError).toEqual(jasmine.any(Error));
      expect(typeValidationError.message).toEqual(
        'somevalue is not a valid sometype'
      );
    });
  });

  describe('parseStringValue', () => {
    it('should return itself if a string', () => {
      const myString = 'myString';
      expect(parseStringValue(myString)).toBe(myString);
    });

    it('should fail if not a string', () => {
      expect(() => parseStringValue()).toThrow(
        jasmine.stringMatching('is not a valid String')
      );
      expect(() => parseStringValue({})).toThrow(
        jasmine.stringMatching('is not a valid String')
      );
      expect(() => parseStringValue([])).toThrow(
        jasmine.stringMatching('is not a valid String')
      );
      expect(() => parseStringValue(123)).toThrow(
        jasmine.stringMatching('is not a valid String')
      );
    });
  });

  describe('parseIntValue', () => {
    it('should parse to number if a string', () => {
      const myString = '123';
      expect(parseIntValue(myString)).toBe(123);
    });

    it('should fail if not a string', () => {
      expect(() => parseIntValue()).toThrow(
        jasmine.stringMatching('is not a valid Int')
      );
      expect(() => parseIntValue({})).toThrow(
        jasmine.stringMatching('is not a valid Int')
      );
      expect(() => parseIntValue([])).toThrow(
        jasmine.stringMatching('is not a valid Int')
      );
      expect(() => parseIntValue(123)).toThrow(
        jasmine.stringMatching('is not a valid Int')
      );
    });

    it('should fail if not an integer string', () => {
      expect(() => parseIntValue('a123')).toThrow(
        jasmine.stringMatching('is not a valid Int')
      );
      expect(() => parseIntValue('123.4')).toThrow(
        jasmine.stringMatching('is not a valid Int')
      );
    });
  });

  describe('parseIntValue', () => {
    it('should parse to number if a string', () => {
      expect(parseFloatValue('123')).toBe(123);
      expect(parseFloatValue('123.4')).toBe(123.4);
    });

    it('should fail if not a string', () => {
      expect(() => parseFloatValue()).toThrow(
        jasmine.stringMatching('is not a valid Float')
      );
      expect(() => parseFloatValue({})).toThrow(
        jasmine.stringMatching('is not a valid Float')
      );
      expect(() => parseFloatValue([])).toThrow(
        jasmine.stringMatching('is not a valid Float')
      );
    });

    it('should fail if not a float string', () => {
      expect(() => parseIntValue('a123')).toThrow(
        jasmine.stringMatching('is not a valid Int')
      );
    });
  });

  describe('parseBooleanValue', () => {
    it('should return itself if a boolean', () => {
      let myBoolean = true;
      expect(parseBooleanValue(myBoolean)).toBe(myBoolean);
      myBoolean = false;
      expect(parseBooleanValue(myBoolean)).toBe(myBoolean);
    });

    it('should fail if not a boolean', () => {
      expect(() => parseBooleanValue()).toThrow(
        jasmine.stringMatching('is not a valid Boolean')
      );
      expect(() => parseBooleanValue({})).toThrow(
        jasmine.stringMatching('is not a valid Boolean')
      );
      expect(() => parseBooleanValue([])).toThrow(
        jasmine.stringMatching('is not a valid Boolean')
      );
      expect(() => parseBooleanValue(123)).toThrow(
        jasmine.stringMatching('is not a valid Boolean')
      );
      expect(() => parseBooleanValue('true')).toThrow(
        jasmine.stringMatching('is not a valid Boolean')
      );
    });
  });

  describe('parseDateValue', () => {
    it('should parse to date if a string', () => {
      const myDateString = '2019-05-09T23:12:00.000Z';
      const myDate = new Date(Date.UTC(2019, 4, 9, 23, 12, 0, 0));
      expect(parseDateValue(myDateString)).toEqual(myDate);
    });

    it('should fail if not a string', () => {
      expect(() => parseDateValue()).toThrow(
        jasmine.stringMatching('is not a valid Date')
      );
      expect(() => parseDateValue({})).toThrow(
        jasmine.stringMatching('is not a valid Date')
      );
      expect(() => parseDateValue([])).toThrow(
        jasmine.stringMatching('is not a valid Date')
      );
      expect(() => parseDateValue(123)).toThrow(
        jasmine.stringMatching('is not a valid Date')
      );
      expect(() => parseDateValue(new Date())).toThrow(
        jasmine.stringMatching('is not a valid Date')
      );
    });

    it('should fail if not a date string', () => {
      expect(() => parseDateValue('not a date')).toThrow(
        jasmine.stringMatching('is not a valid Date')
      );
    });
  });
});
