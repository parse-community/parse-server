var DatabaseController = require('../src/Controllers/DatabaseController.js');
var validateQuery = DatabaseController._validateQuery;

describe('DatabaseController', function() {

  describe('validateQuery', function() {

    it('should restructure simple cases of SERVER-13732', (done) => {
      var query = {$or: [{a: 1}, {a: 2}], _rperm: {$in: ['a', 'b']}, foo: 3};
      validateQuery(query);
      expect(query).toEqual({$or: [{a: 1, _rperm: {$in: ['a', 'b']}, foo: 3},
                                   {a: 2, _rperm: {$in: ['a', 'b']}, foo: 3}]});
      done();
    });

    it('should reject invalid queries', (done) => {
      expect(() => validateQuery({$or: {'a': 1}})).toThrow();
      done();
    });

    it('should accept valid queries', (done) => {
      expect(() => validateQuery({$or: [{'a': 1}, {'b': 2}]})).not.toThrow();
      done();
    });

  });

});
