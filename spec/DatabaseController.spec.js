const DatabaseController = require('../lib/Controllers/DatabaseController.js');
const validateQuery = DatabaseController._validateQuery;

describe('DatabaseController', function() {
  describe('validateQuery', function() {
    describe('with skipMongoDBServer13732Workaround disabled (the default)', function() {
      it('should restructure simple cases of SERVER-13732', done => {
        const query = {
          $or: [{ a: 1 }, { a: 2 }],
          _rperm: { $in: ['a', 'b'] },
          foo: 3,
        };
        validateQuery(query, false);
        expect(query).toEqual({
          $or: [
            { a: 1, _rperm: { $in: ['a', 'b'] }, foo: 3 },
            { a: 2, _rperm: { $in: ['a', 'b'] }, foo: 3 },
          ],
        });
        done();
      });

      it('should not restructure SERVER-13732 queries with $nears', done => {
        let query = { $or: [{ a: 1 }, { b: 1 }], c: { $nearSphere: {} } };
        validateQuery(query, false);
        expect(query).toEqual({
          $or: [{ a: 1 }, { b: 1 }],
          c: { $nearSphere: {} },
        });
        query = { $or: [{ a: 1 }, { b: 1 }], c: { $near: {} } };
        validateQuery(query, false);
        expect(query).toEqual({ $or: [{ a: 1 }, { b: 1 }], c: { $near: {} } });
        done();
      });

      it('should push refactored keys down a tree for SERVER-13732', done => {
        const query = {
          a: 1,
          $or: [{ $or: [{ b: 1 }, { b: 2 }] }, { $or: [{ c: 1 }, { c: 2 }] }],
        };
        validateQuery(query, false);
        expect(query).toEqual({
          $or: [
            { $or: [{ b: 1, a: 1 }, { b: 2, a: 1 }] },
            { $or: [{ c: 1, a: 1 }, { c: 2, a: 1 }] },
          ],
        });
        done();
      });

      it('should reject invalid queries', done => {
        expect(() => validateQuery({ $or: { a: 1 } }, false)).toThrow();
        done();
      });

      it('should accept valid queries', done => {
        expect(() =>
          validateQuery({ $or: [{ a: 1 }, { b: 2 }] }, false)
        ).not.toThrow();
        done();
      });
    });

    describe('with skipMongoDBServer13732Workaround enabled', function() {
      it('should not restructure simple cases of SERVER-13732', done => {
        const query = {
          $or: [{ a: 1 }, { a: 2 }],
          _rperm: { $in: ['a', 'b'] },
          foo: 3,
        };
        validateQuery(query, true);
        expect(query).toEqual({
          $or: [{ a: 1 }, { a: 2 }],
          _rperm: { $in: ['a', 'b'] },
          foo: 3,
        });
        done();
      });

      it('should not restructure SERVER-13732 queries with $nears', done => {
        let query = { $or: [{ a: 1 }, { b: 1 }], c: { $nearSphere: {} } };
        validateQuery(query, true);
        expect(query).toEqual({
          $or: [{ a: 1 }, { b: 1 }],
          c: { $nearSphere: {} },
        });
        query = { $or: [{ a: 1 }, { b: 1 }], c: { $near: {} } };
        validateQuery(query, true);
        expect(query).toEqual({ $or: [{ a: 1 }, { b: 1 }], c: { $near: {} } });
        done();
      });

      it('should not push refactored keys down a tree for SERVER-13732', done => {
        const query = {
          a: 1,
          $or: [{ $or: [{ b: 1 }, { b: 2 }] }, { $or: [{ c: 1 }, { c: 2 }] }],
        };
        validateQuery(query, true);
        expect(query).toEqual({
          a: 1,
          $or: [{ $or: [{ b: 1 }, { b: 2 }] }, { $or: [{ c: 1 }, { c: 2 }] }],
        });

        done();
      });

      it('should reject invalid queries', done => {
        expect(() => validateQuery({ $or: { a: 1 } }, true)).toThrow();
        done();
      });

      it('should accept valid queries', done => {
        expect(() =>
          validateQuery({ $or: [{ a: 1 }, { b: 2 }] }, true)
        ).not.toThrow();
        done();
      });
    });
  });
});
