const DatabaseController = require('../lib/Controllers/DatabaseController.js');
const isVersionAffectedByServer13732 =
  DatabaseController._isVersionAffectedByServer13732;
const validateQuery = DatabaseController._validateQuery;

describe('DatabaseController', function() {
  describe('isVersionAffectedByServer13732', function() {
    it('should only return true for affected versions of mongodb', function() {
      for (let patch = 0; patch <= 12; patch++) {
        expect(
          isVersionAffectedByServer13732('MongoDB', '2.6.' + patch)
        ).toEqual(true);
        expect(
          isVersionAffectedByServer13732('PostgreSQL', '2.6.' + patch)
        ).toEqual(false);
      }
      for (let patch = 0; patch <= 15; patch++) {
        expect(
          isVersionAffectedByServer13732('MongoDB', '3.0.' + patch)
        ).toEqual(true);
        expect(
          isVersionAffectedByServer13732('PostgreSQL', '3.0.' + patch)
        ).toEqual(false);
      }
      for (let patch = 0; patch <= 22; patch++) {
        expect(
          isVersionAffectedByServer13732('MongoDB', '3.2.' + patch)
        ).toEqual(true);
        expect(
          isVersionAffectedByServer13732('PostgreSQL', '3.2.' + patch)
        ).toEqual(false);
      }
      for (let patch = 0; patch <= 21; patch++) {
        expect(
          isVersionAffectedByServer13732('MongoDB', '3.4.' + patch)
        ).toEqual(true);
        expect(
          isVersionAffectedByServer13732('PostgreSQL', '3.4.' + patch)
        ).toEqual(false);
      }
      for (let patch = 0; patch <= 13; patch++) {
        expect(
          isVersionAffectedByServer13732('MongoDB', '3.6.' + patch)
        ).toEqual(false);
        expect(
          isVersionAffectedByServer13732('PostgreSQL', '3.6.' + patch)
        ).toEqual(false);
      }
      for (let patch = 0; patch <= 10; patch++) {
        expect(
          isVersionAffectedByServer13732('MongoDB', '4.0.' + patch)
        ).toEqual(false);
        expect(
          isVersionAffectedByServer13732('PostgreSQL', '4.0.' + patch)
        ).toEqual(false);
      }
    });
  });

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
