const {
  TypeValidationError,
  parseStringValue,
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
  });
});
