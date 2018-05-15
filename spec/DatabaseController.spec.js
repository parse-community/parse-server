const DatabaseController = require('../src/Controllers/DatabaseController.js');
const validateQuery = DatabaseController._validateQuery;

describe('DatabaseController', function() {

  describe('validateQuery', function() {

    it('should restructure simple cases of SERVER-13732', (done) => {
      const query = {$or: [{a: 1}, {a: 2}], _rperm: {$in: ['a', 'b']}, foo: 3};
      validateQuery(query);
      expect(query).toEqual({$or: [{a: 1, _rperm: {$in: ['a', 'b']}, foo: 3},
        {a: 2, _rperm: {$in: ['a', 'b']}, foo: 3}]});
      done();
    });

    it('should not restructure SERVER-13732 queries with $nears', (done) => {
      let query = {$or: [{a: 1}, {b: 1}], c: {$nearSphere: {}}};
      validateQuery(query);
      expect(query).toEqual({$or: [{a: 1}, {b: 1}], c: {$nearSphere: {}}});

      query = {$or: [{a: 1}, {b: 1}], c: {$near: {}}};
      validateQuery(query);
      expect(query).toEqual({$or: [{a: 1}, {b: 1}], c: {$near: {}}});

      done();
    });


    it('should push refactored keys down a tree for SERVER-13732', (done) => {
      const query = {a: 1, $or: [{$or: [{b: 1}, {b: 2}]},
        {$or: [{c: 1}, {c: 2}]}]};
      validateQuery(query);
      expect(query).toEqual({$or: [{$or: [{b: 1, a: 1}, {b: 2, a: 1}]},
        {$or: [{c: 1, a: 1}, {c: 2, a: 1}]}]});

      done();
    });

    it('should reject invalid queries', (done) => {
      const objectQuery = {'a': 1};
      expect(() => validateQuery({$or: objectQuery})).toThrow();
      expect(() => validateQuery({$nor: objectQuery})).toThrow();
      expect(() => validateQuery({$and: objectQuery})).toThrow();

      const array = [1, 2, 3, 4];
      expect(() => validateQuery({
        $and: [
          { 'a' : { $elemMatch :  array  }},
        ]
      })).toThrow();

      expect(() => validateQuery({
        $nor: [
          { 'a' : { $elemMatch :  1  }},
        ]
      })).toThrow();

      done();
    });

    it('should accept valid queries', (done) => {
      const arrayQuery = [{'a': 1}, {'b': 2}];
      expect(() => validateQuery({$or: arrayQuery})).not.toThrow();
      expect(() => validateQuery({$nor: arrayQuery})).not.toThrow();
      expect(() => validateQuery({$and: arrayQuery})).not.toThrow();

      const array = [1, 2, 3, 4];
      expect(() => validateQuery({
        $nor: [
          { 'a' : { $elemMatch : { $nin : array } }}
        ]
      })).not.toThrow();

      expect(() => validateQuery({
        $and: [
          { 'a' : { $elemMatch : { $nin : array } }},
          { 'b' : { $elemMatch : { $all : array } }}
        ]
      })).not.toThrow();
      done();
    });


  });

});
