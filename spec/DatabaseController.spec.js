const Config = require('../lib/Config');
const DatabaseController = require('../lib/Controllers/DatabaseController.js');
const validateQuery = DatabaseController._validateQuery;

describe('DatabaseController', () => {
  describe('validateQuery', () => {
    it('should not restructure simple cases of SERVER-13732', () => {
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
    });

    it('should not restructure SERVER-13732 queries with $nears', () => {
      let query = { $or: [{ a: 1 }, { b: 1 }], c: { $nearSphere: {} } };
      validateQuery(query);
      expect(query).toEqual({
        $or: [{ a: 1 }, { b: 1 }],
        c: { $nearSphere: {} },
      });
      query = { $or: [{ a: 1 }, { b: 1 }], c: { $near: {} } };
      validateQuery(query);
      expect(query).toEqual({ $or: [{ a: 1 }, { b: 1 }], c: { $near: {} } });
    });

    it('should not push refactored keys down a tree for SERVER-13732', () => {
      const query = {
        a: 1,
        $or: [{ $or: [{ b: 1 }, { b: 2 }] }, { $or: [{ c: 1 }, { c: 2 }] }],
      };
      validateQuery(query);
      expect(query).toEqual({
        a: 1,
        $or: [{ $or: [{ b: 1 }, { b: 2 }] }, { $or: [{ c: 1 }, { c: 2 }] }],
      });
    });

    it('should reject invalid queries', () => {
      expect(() => validateQuery({ $or: { a: 1 } })).toThrow();
    });

    it('should accept valid queries', () => {
      expect(() => validateQuery({ $or: [{ a: 1 }, { b: 2 }] })).not.toThrow();
    });
  });

  describe('addPointerPermissions', () => {
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

    it('should not decorate query if no pointer CLPs are present', () => {
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
    });

    it('should decorate query if a pointer CLP entry is present', () => {
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
    });

    it('should decorate query if an array CLP entry is present', () => {
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
    });

    it('should decorate query if an object CLP entry is present', () => {
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
    });

    it('should decorate query if a pointer CLP is present and the same field is part of the query', () => {
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
    });

    it('should transform the query to an $or query if multiple array/pointer CLPs are present', () => {
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
    });

    it('should not return a $or operation if the query involves one of the two fields also used as array/pointer permissions', () => {
      const clp = buildCLP(['users', 'user']);
      const query = { a: 'b', user: createUserPointer(USER_ID) };
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
      const output = databaseController.addPointerPermissions(
        schemaController,
        CLASS_NAME,
        OPERATION,
        query,
        ACL_GROUP
      );
      expect(output).toEqual({ ...query, user: createUserPointer(USER_ID) });
    });

    it('should not return a $or operation if the query involves one of the fields also used as array/pointer permissions', () => {
      const clp = buildCLP(['user', 'users', 'userObject']);
      const query = { a: 'b', user: createUserPointer(USER_ID) };
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
      expect(output).toEqual({ ...query, user: createUserPointer(USER_ID) });
    });

    it('should throw an error if for some unexpected reason the property specified in the CLP is neither a pointer nor an array', () => {
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
    });
  });

  describe('reduceOperations', function () {
    const databaseController = new DatabaseController();

    it('objectToEntriesStrings', () => {
      const output = databaseController.objectToEntriesStrings({ a: 1, b: 2, c: 3 });
      expect(output).toEqual(['"a":1', '"b":2', '"c":3']);
    });

    it('reduceOrOperation', () => {
      expect(databaseController.reduceOrOperation({ a: 1 })).toEqual({ a: 1 });
      expect(databaseController.reduceOrOperation({ $or: [{ a: 1 }, { b: 2 }] })).toEqual({
        $or: [{ a: 1 }, { b: 2 }],
      });
      expect(databaseController.reduceOrOperation({ $or: [{ a: 1 }, { a: 2 }] })).toEqual({
        $or: [{ a: 1 }, { a: 2 }],
      });
      expect(databaseController.reduceOrOperation({ $or: [{ a: 1 }, { a: 1 }] })).toEqual({ a: 1 });
      expect(
        databaseController.reduceOrOperation({ $or: [{ a: 1, b: 2, c: 3 }, { a: 1 }] })
      ).toEqual({ a: 1 });
      expect(
        databaseController.reduceOrOperation({ $or: [{ b: 2 }, { a: 1, b: 2, c: 3 }] })
      ).toEqual({ b: 2 });
    });

    it('reduceAndOperation', () => {
      expect(databaseController.reduceAndOperation({ a: 1 })).toEqual({ a: 1 });
      expect(databaseController.reduceAndOperation({ $and: [{ a: 1 }, { b: 2 }] })).toEqual({
        $and: [{ a: 1 }, { b: 2 }],
      });
      expect(databaseController.reduceAndOperation({ $and: [{ a: 1 }, { a: 2 }] })).toEqual({
        $and: [{ a: 1 }, { a: 2 }],
      });
      expect(databaseController.reduceAndOperation({ $and: [{ a: 1 }, { a: 1 }] })).toEqual({
        a: 1,
      });
      expect(
        databaseController.reduceAndOperation({ $and: [{ a: 1, b: 2, c: 3 }, { b: 2 }] })
      ).toEqual({ a: 1, b: 2, c: 3 });
    });
  });

  describe('disableCaseInsensitivity', () => {
    const dummyStorageAdapter = {
      find: () => Promise.resolve([]),
      watch: () => Promise.resolve(),
      getAllClasses: () => Promise.resolve([]),
    };

    beforeEach(() => {
      Config.get(Parse.applicationId).schemaCache.clear();
    });

    it('should force caseInsensitive to false with disableCaseInsensitivity option', async () => {
      const databaseController = new DatabaseController(dummyStorageAdapter, {
        disableCaseInsensitivity: true,
      });
      const spy = spyOn(dummyStorageAdapter, 'find');
      spy.and.callThrough();
      await databaseController.find('SomeClass', {}, { caseInsensitive: true });
      expect(spy.calls.all()[0].args[3].caseInsensitive).toEqual(false);
    });

    it('should support caseInsensitive without disableCaseInsensitivity option', async () => {
      const databaseController = new DatabaseController(dummyStorageAdapter, {});
      const spy = spyOn(dummyStorageAdapter, 'find');
      spy.and.callThrough();
      await databaseController.find('_User', {}, { caseInsensitive: true });
      expect(spy.calls.all()[0].args[3].caseInsensitive).toEqual(true);
    });

    it_only_db('mongo')(
      'should create insensitive indexes without disableCaseInsensitivity',
      async () => {
        await reconfigureServer({
          databaseURI: 'mongodb://localhost:27017/disableCaseInsensitivityFalse',
          databaseAdapter: undefined,
        });
        const user = new Parse.User();
        await user.save({
          username: 'example',
          password: 'password',
          email: 'example@example.com',
        });
        const schemas = await Parse.Schema.all();
        const UserSchema = schemas.find(({ className }) => className === '_User');
        expect(UserSchema.indexes).toEqual({
          _id_: { _id: 1 },
          username_1: { username: 1 },
          case_insensitive_username: { username: 1 },
          case_insensitive_email: { email: 1 },
          email_1: { email: 1 },
        });
      }
    );

    it_only_db('mongo')(
      'should not create insensitive indexes with disableCaseInsensitivity',
      async () => {
        await reconfigureServer({
          disableCaseInsensitivity: true,
          databaseURI: 'mongodb://localhost:27017/disableCaseInsensitivityTrue',
          databaseAdapter: undefined,
        });
        const user = new Parse.User();
        await user.save({
          username: 'example',
          password: 'password',
          email: 'example@example.com',
        });
        const schemas = await Parse.Schema.all();
        const UserSchema = schemas.find(({ className }) => className === '_User');
        expect(UserSchema.indexes).toEqual({
          _id_: { _id: 1 },
          username_1: { username: 1 },
          email_1: { email: 1 },
        });
      }
    );
  });

  describe('forceEmailAndUsernameToLowerCase', () => {
    const dummyStorageAdapter = {
      createObject: () => Promise.resolve({ ops: [{}] }),
      findOneAndUpdate: () => Promise.resolve({}),
      watch: () => Promise.resolve(),
      getAllClasses: () =>
        Promise.resolve([
          {
            className: '_User',
            fields: { username: 'String', email: 'String' },
            indexes: {},
            classLevelPermissions: { protectedFields: {} },
          },
        ]),
    };
    const dates = {
      createdAt: { iso: undefined, __type: 'Date' },
      updatedAt: { iso: undefined, __type: 'Date' },
    };

    it('should not force email and username to lower case without forceEmailAndUsernameToLowerCase option on create', async () => {
      const databaseController = new DatabaseController(dummyStorageAdapter, {});
      const spy = spyOn(dummyStorageAdapter, 'createObject');
      spy.and.callThrough();
      await databaseController.create('_User', {
        username: 'EXAMPLE',
        email: 'EXAMPLE@EXAMPLE.COM',
      });
      expect(spy.calls.all()[0].args[2]).toEqual({
        username: 'EXAMPLE',
        email: 'EXAMPLE@EXAMPLE.COM',
        ...dates,
      });
    });

    it('should force email and username to lower case with forceEmailAndUsernameToLowerCase option on create', async () => {
      const databaseController = new DatabaseController(dummyStorageAdapter, {
        forceEmailAndUsernameToLowerCase: true,
      });
      const spy = spyOn(dummyStorageAdapter, 'createObject');
      spy.and.callThrough();
      await databaseController.create('_User', {
        username: 'EXAMPLE',
        email: 'EXAMPLE@EXAMPLE.COM',
      });
      expect(spy.calls.all()[0].args[2]).toEqual({
        username: 'example',
        email: 'example@example.com',
        ...dates,
      });
    });

    it('should not force email and username to lower case without forceEmailAndUsernameToLowerCase option on update', async () => {
      const databaseController = new DatabaseController(dummyStorageAdapter, {});
      const spy = spyOn(dummyStorageAdapter, 'findOneAndUpdate');
      spy.and.callThrough();
      await databaseController.update(
        '_User',
        { id: 'example' },
        { username: 'EXAMPLE', email: 'EXAMPLE@EXAMPLE.COM' }
      );
      expect(spy.calls.all()[0].args[3]).toEqual({
        username: 'EXAMPLE',
        email: 'EXAMPLE@EXAMPLE.COM',
      });
    });

    it('should force email and username to lower case with forceEmailAndUsernameToLowerCase option on update', async () => {
      const databaseController = new DatabaseController(dummyStorageAdapter, {
        forceEmailAndUsernameToLowerCase: true,
      });
      const spy = spyOn(dummyStorageAdapter, 'findOneAndUpdate');
      spy.and.callThrough();
      await databaseController.update(
        '_User',
        { id: 'example' },
        { username: 'EXAMPLE', email: 'EXAMPLE@EXAMPLE.COM' }
      );
      expect(spy.calls.all()[0].args[3]).toEqual({
        username: 'example',
        email: 'example@example.com',
      });
    });

    it('should not find a case insensitive user by username or email with forceEmailAndUsernameToLowerCase', async () => {
      await reconfigureServer({ forceEmailAndUsernameToLowerCase: true });
      const user = new Parse.User();
      await user.save({ username: 'EXAMPLE', email: 'EXAMPLE@EXAMPLE.COM', password: 'password' });

      const query = new Parse.Query(Parse.User);
      query.equalTo('username', 'EXAMPLE');
      const result = await query.find({ useMasterKey: true });
      expect(result.length).toEqual(0);

      const query2 = new Parse.Query(Parse.User);
      query2.equalTo('email', 'EXAMPLE@EXAMPLE.COM');
      const result2 = await query2.find({ useMasterKey: true });
      expect(result2.length).toEqual(0);

      const query3 = new Parse.Query(Parse.User);
      query3.equalTo('username', 'example');
      const result3 = await query3.find({ useMasterKey: true });
      expect(result3.length).toEqual(1);

      const query4 = new Parse.Query(Parse.User);
      query4.equalTo('email', 'example@example.com');
      const result4 = await query4.find({ useMasterKey: true });
      expect(result4.length).toEqual(1);
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
