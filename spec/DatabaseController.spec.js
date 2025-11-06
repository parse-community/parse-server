const Config = require('../lib/Config');
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

    it('should not return a $or operation if the query involves one of the two fields also used as array/pointer permissions', done => {
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
      done();
    });

    it('should not return a $or operation if the query involves one of the fields also used as array/pointer permissions', done => {
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

  describe('reduceOperations', function () {
    const databaseController = new DatabaseController();

    it('objectToEntriesStrings', done => {
      const output = databaseController.objectToEntriesStrings({ a: 1, b: 2, c: 3 });
      expect(output).toEqual(['"a":1', '"b":2', '"c":3']);
      done();
    });

    it('reduceOrOperation', done => {
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
      done();
    });

    it('reduceAndOperation', done => {
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
      done();
    });
  });

  describe('enableCollationCaseComparison', () => {
    const dummyStorageAdapter = {
      find: () => Promise.resolve([]),
      watch: () => Promise.resolve(),
      getAllClasses: () => Promise.resolve([]),
    };

    beforeEach(() => {
      Config.get(Parse.applicationId).schemaCache.clear();
    });

    it('should force caseInsensitive to false with enableCollationCaseComparison option', async () => {
      const databaseController = new DatabaseController(dummyStorageAdapter, {
        enableCollationCaseComparison: true,
      });
      const spy = spyOn(dummyStorageAdapter, 'find');
      spy.and.callThrough();
      await databaseController.find('SomeClass', {}, { caseInsensitive: true });
      expect(spy.calls.all()[0].args[3].caseInsensitive).toEqual(false);
    });

    it('should support caseInsensitive without enableCollationCaseComparison option', async () => {
      const databaseController = new DatabaseController(dummyStorageAdapter, {});
      const spy = spyOn(dummyStorageAdapter, 'find');
      spy.and.callThrough();
      await databaseController.find('_User', {}, { caseInsensitive: true });
      expect(spy.calls.all()[0].args[3].caseInsensitive).toEqual(true);
    });

    it_only_db('mongo')(
      'should create insensitive indexes without enableCollationCaseComparison',
      async () => {
        await reconfigureServer({
          databaseURI: 'mongodb://localhost:27017/enableCollationCaseComparisonFalse',
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
          _email_verify_token: { _email_verify_token: 1 },
          _perishable_token: { _perishable_token: 1 },
        });
      }
    );

    it_only_db('mongo')(
      'should not create insensitive indexes with enableCollationCaseComparison',
      async () => {
        await reconfigureServer({
          enableCollationCaseComparison: true,
          databaseURI: 'mongodb://localhost:27017/enableCollationCaseComparisonTrue',
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
          _email_verify_token: { _email_verify_token: 1 },
          _perishable_token: { _perishable_token: 1 },
        });
      }
    );

    it_only_db('mongo')(
      'should use _email_verify_token index in email verification',
      async () => {
        const TestUtils = require('../lib/TestUtils');
        let emailVerificationLink;
        const emailSentPromise = TestUtils.resolvingPromise();
        const emailAdapter = {
          sendVerificationEmail: options => {
            emailVerificationLink = options.link;
            emailSentPromise.resolve();
          },
          sendPasswordResetEmail: () => Promise.resolve(),
          sendMail: () => {},
        };
        await reconfigureServer({
          databaseURI: 'mongodb://localhost:27017/testEmailVerifyTokenIndexStats',
          databaseAdapter: undefined,
          appName: 'test',
          verifyUserEmails: true,
          emailAdapter: emailAdapter,
          publicServerURL: 'http://localhost:8378/1',
        });

        // Create a user to trigger email verification
        const user = new Parse.User();
        user.setUsername('statsuser');
        user.setPassword('password');
        user.set('email', 'stats@example.com');
        await user.signUp();
        await emailSentPromise;

        // Get index stats before the query
        const config = Config.get(Parse.applicationId);
        const collection = await config.database.adapter._adaptiveCollection('_User');
        const statsBefore = await collection._mongoCollection.aggregate([
          { $indexStats: {} },
        ]).toArray();
        const emailVerifyIndexBefore = statsBefore.find(
          stat => stat.name === '_email_verify_token'
        );
        const accessesBefore = emailVerifyIndexBefore?.accesses?.ops || 0;

        // Perform email verification (this should use the index)
        const request = require('../lib/request');
        await request({
          url: emailVerificationLink,
          followRedirects: false,
        });

        // Get index stats after the query
        const statsAfter = await collection._mongoCollection.aggregate([
          { $indexStats: {} },
        ]).toArray();
        const emailVerifyIndexAfter = statsAfter.find(
          stat => stat.name === '_email_verify_token'
        );
        const accessesAfter = emailVerifyIndexAfter?.accesses?.ops || 0;

        // Verify the index was actually used
        expect(accessesAfter).toBeGreaterThan(accessesBefore);
        expect(emailVerifyIndexAfter).toBeDefined();

        // Verify email verification succeeded
        await user.fetch();
        expect(user.get('emailVerified')).toBe(true);
      }
    );

    it_only_db('mongo')(
      'should use _perishable_token index in password reset',
      async () => {
        const TestUtils = require('../lib/TestUtils');
        let passwordResetLink;
        const emailSentPromise = TestUtils.resolvingPromise();
        const emailAdapter = {
          sendVerificationEmail: () => Promise.resolve(),
          sendPasswordResetEmail: options => {
            passwordResetLink = options.link;
            emailSentPromise.resolve();
          },
          sendMail: () => {},
        };
        await reconfigureServer({
          databaseURI: 'mongodb://localhost:27017/testPerishableTokenIndexStats',
          databaseAdapter: undefined,
          appName: 'test',
          emailAdapter: emailAdapter,
          publicServerURL: 'http://localhost:8378/1',
        });

        // Create a user
        const user = new Parse.User();
        user.setUsername('statsuser2');
        user.setPassword('oldpassword');
        user.set('email', 'stats2@example.com');
        await user.signUp();

        // Request password reset
        await Parse.User.requestPasswordReset('stats2@example.com');
        await emailSentPromise;

        const url = new URL(passwordResetLink);
        const token = url.searchParams.get('token');

        // Get index stats before the query
        const config = Config.get(Parse.applicationId);
        const collection = await config.database.adapter._adaptiveCollection('_User');
        const statsBefore = await collection._mongoCollection.aggregate([
          { $indexStats: {} },
        ]).toArray();
        const perishableTokenIndexBefore = statsBefore.find(
          stat => stat.name === '_perishable_token'
        );
        const accessesBefore = perishableTokenIndexBefore?.accesses?.ops || 0;

        // Perform password reset (this should use the index)
        const request = require('../lib/request');
        await request({
          method: 'POST',
          url: 'http://localhost:8378/1/apps/test/request_password_reset',
          body: { new_password: 'newpassword', token, username: 'statsuser2' },
          headers: {
            'Content-Type': 'application/x-www-form-urlencoded',
          },
          followRedirects: false,
        });

        // Get index stats after the query
        const statsAfter = await collection._mongoCollection.aggregate([
          { $indexStats: {} },
        ]).toArray();
        const perishableTokenIndexAfter = statsAfter.find(
          stat => stat.name === '_perishable_token'
        );
        const accessesAfter = perishableTokenIndexAfter?.accesses?.ops || 0;

        // Verify the index was actually used
        expect(accessesAfter).toBeGreaterThan(accessesBefore);
        expect(perishableTokenIndexAfter).toBeDefined();
      }
    );
  });

  describe('convertEmailToLowercase', () => {
    const dummyStorageAdapter = {
      createObject: () => Promise.resolve({ ops: [{}] }),
      findOneAndUpdate: () => Promise.resolve({}),
      watch: () => Promise.resolve(),
      getAllClasses: () =>
        Promise.resolve([
          {
            className: '_User',
            fields: { email: 'String' },
            indexes: {},
            classLevelPermissions: { protectedFields: {} },
          },
        ]),
    };
    const dates = {
      createdAt: { iso: undefined, __type: 'Date' },
      updatedAt: { iso: undefined, __type: 'Date' },
    };

    it('should not transform email to lower case without convertEmailToLowercase option on create', async () => {
      const databaseController = new DatabaseController(dummyStorageAdapter, {});
      const spy = spyOn(dummyStorageAdapter, 'createObject');
      spy.and.callThrough();
      await databaseController.create('_User', {
        email: 'EXAMPLE@EXAMPLE.COM',
      });
      expect(spy.calls.all()[0].args[2]).toEqual({
        email: 'EXAMPLE@EXAMPLE.COM',
        ...dates,
      });
    });

    it('should transform email to lower case with convertEmailToLowercase option on create', async () => {
      const databaseController = new DatabaseController(dummyStorageAdapter, {
        convertEmailToLowercase: true,
      });
      const spy = spyOn(dummyStorageAdapter, 'createObject');
      spy.and.callThrough();
      await databaseController.create('_User', {
        email: 'EXAMPLE@EXAMPLE.COM',
      });
      expect(spy.calls.all()[0].args[2]).toEqual({
        email: 'example@example.com',
        ...dates,
      });
    });

    it('should not transform email to lower case without convertEmailToLowercase option on update', async () => {
      const databaseController = new DatabaseController(dummyStorageAdapter, {});
      const spy = spyOn(dummyStorageAdapter, 'findOneAndUpdate');
      spy.and.callThrough();
      await databaseController.update('_User', { id: 'example' }, { email: 'EXAMPLE@EXAMPLE.COM' });
      expect(spy.calls.all()[0].args[3]).toEqual({
        email: 'EXAMPLE@EXAMPLE.COM',
      });
    });

    it('should transform email to lower case with convertEmailToLowercase option on update', async () => {
      const databaseController = new DatabaseController(dummyStorageAdapter, {
        convertEmailToLowercase: true,
      });
      const spy = spyOn(dummyStorageAdapter, 'findOneAndUpdate');
      spy.and.callThrough();
      await databaseController.update('_User', { id: 'example' }, { email: 'EXAMPLE@EXAMPLE.COM' });
      expect(spy.calls.all()[0].args[3]).toEqual({
        email: 'example@example.com',
      });
    });

    it('should not find a case insensitive user by email with convertEmailToLowercase', async () => {
      await reconfigureServer({ convertEmailToLowercase: true });
      const user = new Parse.User();
      await user.save({ username: 'EXAMPLE', email: 'EXAMPLE@EXAMPLE.COM', password: 'password' });

      const query = new Parse.Query(Parse.User);
      query.equalTo('email', 'EXAMPLE@EXAMPLE.COM');
      const result = await query.find({ useMasterKey: true });
      expect(result.length).toEqual(0);

      const query2 = new Parse.Query(Parse.User);
      query2.equalTo('email', 'example@example.com');
      const result2 = await query2.find({ useMasterKey: true });
      expect(result2.length).toEqual(1);
    });
  });

  describe('convertUsernameToLowercase', () => {
    const dummyStorageAdapter = {
      createObject: () => Promise.resolve({ ops: [{}] }),
      findOneAndUpdate: () => Promise.resolve({}),
      watch: () => Promise.resolve(),
      getAllClasses: () =>
        Promise.resolve([
          {
            className: '_User',
            fields: { username: 'String' },
            indexes: {},
            classLevelPermissions: { protectedFields: {} },
          },
        ]),
    };
    const dates = {
      createdAt: { iso: undefined, __type: 'Date' },
      updatedAt: { iso: undefined, __type: 'Date' },
    };

    it('should not transform username to lower case without convertUsernameToLowercase option on create', async () => {
      const databaseController = new DatabaseController(dummyStorageAdapter, {});
      const spy = spyOn(dummyStorageAdapter, 'createObject');
      spy.and.callThrough();
      await databaseController.create('_User', {
        username: 'EXAMPLE',
      });
      expect(spy.calls.all()[0].args[2]).toEqual({
        username: 'EXAMPLE',
        ...dates,
      });
    });

    it('should transform username to lower case with convertUsernameToLowercase option on create', async () => {
      const databaseController = new DatabaseController(dummyStorageAdapter, {
        convertUsernameToLowercase: true,
      });
      const spy = spyOn(dummyStorageAdapter, 'createObject');
      spy.and.callThrough();
      await databaseController.create('_User', {
        username: 'EXAMPLE',
      });
      expect(spy.calls.all()[0].args[2]).toEqual({
        username: 'example',
        ...dates,
      });
    });

    it('should not transform username to lower case without convertUsernameToLowercase option on update', async () => {
      const databaseController = new DatabaseController(dummyStorageAdapter, {});
      const spy = spyOn(dummyStorageAdapter, 'findOneAndUpdate');
      spy.and.callThrough();
      await databaseController.update('_User', { id: 'example' }, { username: 'EXAMPLE' });
      expect(spy.calls.all()[0].args[3]).toEqual({
        username: 'EXAMPLE',
      });
    });

    it('should transform username to lower case with convertUsernameToLowercase option on update', async () => {
      const databaseController = new DatabaseController(dummyStorageAdapter, {
        convertUsernameToLowercase: true,
      });
      const spy = spyOn(dummyStorageAdapter, 'findOneAndUpdate');
      spy.and.callThrough();
      await databaseController.update('_User', { id: 'example' }, { username: 'EXAMPLE' });
      expect(spy.calls.all()[0].args[3]).toEqual({
        username: 'example',
      });
    });

    it('should not find a case insensitive user by username with convertUsernameToLowercase', async () => {
      await reconfigureServer({ convertUsernameToLowercase: true });
      const user = new Parse.User();
      await user.save({ username: 'EXAMPLE', password: 'password' });

      const query = new Parse.Query(Parse.User);
      query.equalTo('username', 'EXAMPLE');
      const result = await query.find({ useMasterKey: true });
      expect(result.length).toEqual(0);

      const query2 = new Parse.Query(Parse.User);
      query2.equalTo('username', 'example');
      const result2 = await query2.find({ useMasterKey: true });
      expect(result2.length).toEqual(1);
    });
  });

  describe('update with validateOnly', () => {
    const mockStorageAdapter = {
      findOneAndUpdate: () => Promise.resolve({}),
      find: () => Promise.resolve([{ objectId: 'test123', testField: 'initialValue' }]),
      watch: () => Promise.resolve(),
      getAllClasses: () =>
        Promise.resolve([
          {
            className: 'TestObject',
            fields: { testField: 'String' },
            indexes: {},
            classLevelPermissions: { protectedFields: {} },
          },
        ]),
    };

    it('should use primary readPreference when validateOnly is true', async () => {
      const databaseController = new DatabaseController(mockStorageAdapter, {});
      const findSpy = spyOn(mockStorageAdapter, 'find').and.callThrough();
      const findOneAndUpdateSpy = spyOn(mockStorageAdapter, 'findOneAndUpdate').and.callThrough();

      try {
        // Call update with validateOnly: true (same as RestWrite.runBeforeSaveTrigger)
        await databaseController.update(
          'TestObject',
          { objectId: 'test123' },
          { testField: 'newValue' },
          {},
          true, // skipSanitization: true (matches RestWrite behavior)
          true  // validateOnly: true
        );
      } catch (error) {
        // validateOnly may throw, but we're checking the find call options
      }

      // Verify that find was called with primary readPreference
      expect(findSpy).toHaveBeenCalled();
      const findCall = findSpy.calls.mostRecent();
      expect(findCall.args[3]).toEqual({ readPreference: 'primary' }); // options parameter

      // Verify that findOneAndUpdate was NOT called (only validation, no actual update)
      expect(findOneAndUpdateSpy).not.toHaveBeenCalled();
    });

    it('should not use primary readPreference when validateOnly is false', async () => {
      const databaseController = new DatabaseController(mockStorageAdapter, {});
      const findSpy = spyOn(mockStorageAdapter, 'find').and.callThrough();
      const findOneAndUpdateSpy = spyOn(mockStorageAdapter, 'findOneAndUpdate').and.callThrough();

      try {
        // Call update with validateOnly: false
        await databaseController.update(
          'TestObject',
          { objectId: 'test123' },
          { testField: 'newValue' },
          {},
          false, // skipSanitization
          false  // validateOnly
        );
      } catch (error) {
        // May throw for other reasons, but we're checking the call pattern
      }

      // When validateOnly is false, find should not be called for validation
      // Instead, findOneAndUpdate should be called
      expect(findSpy).not.toHaveBeenCalled();
      expect(findOneAndUpdateSpy).toHaveBeenCalled();
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
