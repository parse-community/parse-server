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

    it('should not restructure SERVER-13732 queries with $nears', (done) => {
      var query = {$or: [{a: 1}, {b: 1}], c: {$nearSphere: {}}};
      validateQuery(query);
      expect(query).toEqual({$or: [{a: 1}, {b: 1}], c: {$nearSphere: {}}});

      query = {$or: [{a: 1}, {b: 1}], c: {$near: {}}};
      validateQuery(query);
      expect(query).toEqual({$or: [{a: 1}, {b: 1}], c: {$near: {}}});

      done();
    });


    it('should push refactored keys down a tree for SERVER-13732', (done) => {
      var query = {a: 1, $or: [{$or: [{b: 1}, {b: 2}]},
        {$or: [{c: 1}, {c: 2}]}]};
      validateQuery(query);
      expect(query).toEqual({$or: [{$or: [{b: 1, a: 1}, {b: 2, a: 1}]},
        {$or: [{c: 1, a: 1}, {c: 2, a: 1}]}]});

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
