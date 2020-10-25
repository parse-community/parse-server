const DatabaseController = require('../lib/Controllers/DatabaseController.js');
const validateQuery = DatabaseController._validateQuery;

describe('DatabaseController', function () {
  describe('validateQuery', function () {
    it('should not restructure simple cases of SERVER-13732', done => {
      const query = {
        $or: [{ a: 1 }, { a: 2 }],
        _rperm: { $in: ['a', 'b'] },
        foo: 3,
      };
      validateQuery(query);
      expect(query).toEqual({
        $or: [{ a: 1 }, { a: 2 }],
        _rperm: { $in: ['a', 'b'] },
        foo: 3,
      });
      done();
    });

    it('should not restructure SERVER-13732 queries with $nears', done => {
      let query = { $or: [{ a: 1 }, { b: 1 }], c: { $nearSphere: {} } };
      validateQuery(query);
      expect(query).toEqual({
        $or: [{ a: 1 }, { b: 1 }],
        c: { $nearSphere: {} },
      });
      query = { $or: [{ a: 1 }, { b: 1 }], c: { $near: {} } };
      validateQuery(query);
      expect(query).toEqual({ $or: [{ a: 1 }, { b: 1 }], c: { $near: {} } });
      done();
    });

    it('should not push refactored keys down a tree for SERVER-13732', done => {
      const query = {
        a: 1,
        $or: [{ $or: [{ b: 1 }, { b: 2 }] }, { $or: [{ c: 1 }, { c: 2 }] }],
      };
      validateQuery(query);
      expect(query).toEqual({
        a: 1,
        $or: [{ $or: [{ b: 1 }, { b: 2 }] }, { $or: [{ c: 1 }, { c: 2 }] }],
      });

      done();
    });

    it('should reject invalid queries', done => {
      expect(() => validateQuery({ $or: { a: 1 } })).toThrow();
      done();
    });

    it('should accept valid queries', done => {
      expect(() => validateQuery({ $or: [{ a: 1 }, { b: 2 }] })).not.toThrow();
      done();
    });
  });

  describe('addPointerPermissions', function () {
    const CLASS_NAME = 'Foo';
    const USER_ID = 'userId';
    const ACL_GROUP = [USER_ID];
    const OPERATION = 'find';

    const databaseController = new DatabaseController();
    const schemaController = jasmine.createSpyObj('SchemaController', [
      'testPermissionsForClassName',
      'getClassLevelPermissions',
      'getExpectedType',
    ]);

    it('should not decorate query if no pointer CLPs are present', done => {
      const clp = buildCLP();
      const query = { a: 'b' };

      schemaController.testPermissionsForClassName
        .withArgs(CLASS_NAME, ACL_GROUP, OPERATION)
        .and.returnValue(true);
      schemaController.getClassLevelPermissions.withArgs(CLASS_NAME).and.returnValue(clp);

      const output = databaseController.addPointerPermissions(
        schemaController,
        CLASS_NAME,
        OPERATION,
        query,
        ACL_GROUP
      );

      expect(output).toEqual({ ...query });

      done();
    });

    it('should decorate query if a pointer CLP entry is present', done => {
      const clp = buildCLP(['user']);
      const query = { a: 'b' };

      schemaController.testPermissionsForClassName
        .withArgs(CLASS_NAME, ACL_GROUP, OPERATION)
        .and.returnValue(false);
      schemaController.getClassLevelPermissions.withArgs(CLASS_NAME).and.returnValue(clp);
      schemaController.getExpectedType
        .withArgs(CLASS_NAME, 'user')
        .and.returnValue({ type: 'Pointer' });

      const output = databaseController.addPointerPermissions(
        schemaController,
        CLASS_NAME,
        OPERATION,
        query,
        ACL_GROUP
      );

      expect(output).toEqual({ ...query, user: createUserPointer(USER_ID) });

      done();
    });

    it('should decorate query if an array CLP entry is present', done => {
      const clp = buildCLP(['users']);
      const query = { a: 'b' };

      schemaController.testPermissionsForClassName
        .withArgs(CLASS_NAME, ACL_GROUP, OPERATION)
        .and.returnValue(false);
      schemaController.getClassLevelPermissions.withArgs(CLASS_NAME).and.returnValue(clp);
      schemaController.getExpectedType
        .withArgs(CLASS_NAME, 'users')
        .and.returnValue({ type: 'Array' });

      const output = databaseController.addPointerPermissions(
        schemaController,
        CLASS_NAME,
        OPERATION,
        query,
        ACL_GROUP
      );

      expect(output).toEqual({
        ...query,
        users: { $all: [createUserPointer(USER_ID)] },
      });

      done();
    });

    it('should decorate query if an object CLP entry is present', done => {
      const clp = buildCLP(['user']);
      const query = { a: 'b' };

      schemaController.testPermissionsForClassName
        .withArgs(CLASS_NAME, ACL_GROUP, OPERATION)
        .and.returnValue(false);
      schemaController.getClassLevelPermissions.withArgs(CLASS_NAME).and.returnValue(clp);
      schemaController.getExpectedType
        .withArgs(CLASS_NAME, 'user')
        .and.returnValue({ type: 'Object' });

      const output = databaseController.addPointerPermissions(
        schemaController,
        CLASS_NAME,
        OPERATION,
        query,
        ACL_GROUP
      );

      expect(output).toEqual({
        ...query,
        user: createUserPointer(USER_ID),
      });

      done();
    });

    it('should decorate query if a pointer CLP is present and the same field is part of the query', done => {
      const clp = buildCLP(['user']);
      const query = { a: 'b', user: 'a' };

      schemaController.testPermissionsForClassName
        .withArgs(CLASS_NAME, ACL_GROUP, OPERATION)
        .and.returnValue(false);
      schemaController.getClassLevelPermissions.withArgs(CLASS_NAME).and.returnValue(clp);
      schemaController.getExpectedType
        .withArgs(CLASS_NAME, 'user')
        .and.returnValue({ type: 'Pointer' });

      const output = databaseController.addPointerPermissions(
        schemaController,
        CLASS_NAME,
        OPERATION,
        query,
        ACL_GROUP
      );

      expect(output).toEqual({
        $and: [{ user: createUserPointer(USER_ID) }, { ...query }],
      });

      done();
    });

    it('should transform the query to an $or query if multiple array/pointer CLPs are present', done => {
      const clp = buildCLP(['user', 'users', 'userObject']);
      const query = { a: 'b' };

      schemaController.testPermissionsForClassName
        .withArgs(CLASS_NAME, ACL_GROUP, OPERATION)
        .and.returnValue(false);
      schemaController.getClassLevelPermissions.withArgs(CLASS_NAME).and.returnValue(clp);
      schemaController.getExpectedType
        .withArgs(CLASS_NAME, 'user')
        .and.returnValue({ type: 'Pointer' });
      schemaController.getExpectedType
        .withArgs(CLASS_NAME, 'users')
        .and.returnValue({ type: 'Array' });
      schemaController.getExpectedType
        .withArgs(CLASS_NAME, 'userObject')
        .and.returnValue({ type: 'Object' });

      const output = databaseController.addPointerPermissions(
        schemaController,
        CLASS_NAME,
        OPERATION,
        query,
        ACL_GROUP
      );

      expect(output).toEqual({
        $or: [
          { ...query, user: createUserPointer(USER_ID) },
          { ...query, users: { $all: [createUserPointer(USER_ID)] } },
          { ...query, userObject: createUserPointer(USER_ID) },
        ],
      });

      done();
    });

    it('should throw an error if for some unexpected reason the property specified in the CLP is neither a pointer nor an array', done => {
      const clp = buildCLP(['user']);
      const query = { a: 'b' };

      schemaController.testPermissionsForClassName
        .withArgs(CLASS_NAME, ACL_GROUP, OPERATION)
        .and.returnValue(false);
      schemaController.getClassLevelPermissions.withArgs(CLASS_NAME).and.returnValue(clp);
      schemaController.getExpectedType
        .withArgs(CLASS_NAME, 'user')
        .and.returnValue({ type: 'Number' });

      expect(() => {
        databaseController.addPointerPermissions(
          schemaController,
          CLASS_NAME,
          OPERATION,
          query,
          ACL_GROUP
        );
      }).toThrow(
        Error(
          `An unexpected condition occurred when resolving pointer permissions: ${CLASS_NAME} user`
        )
      );

      done();
    });
  });
});

function buildCLP(pointerNames) {
  const OPERATIONS = ['count', 'find', 'get', 'create', 'update', 'delete', 'addField'];

  const clp = OPERATIONS.reduce((acc, op) => {
    acc[op] = {};

    if (pointerNames && pointerNames.length) {
      acc[op].pointerFields = pointerNames;
    }

    return acc;
  }, {});

  clp.protectedFields = {};
  clp.writeUserFields = [];
  clp.readUserFields = [];

  return clp;
}

function createUserPointer(userId) {
  return {
    __type: 'Pointer',
    className: '_User',
    objectId: userId,
  };
}
