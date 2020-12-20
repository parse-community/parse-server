const Config = require('../lib/Config');
const Parse = require('parse/node');
const request = require('../lib/request');
const { className, createRole, createUser, logIn, updateCLP } = require('./dev');

describe('ProtectedFields', function () {
  it('should handle and empty protectedFields', async function () {
    const protectedFields = {};
    await reconfigureServer({ protectedFields });

    const user = new Parse.User();
    user.setUsername('Alice');
    user.setPassword('sekrit');
    user.set('email', 'alice@aol.com');
    user.set('favoriteColor', 'yellow');
    await user.save();

    const fetched = await new Parse.Query(Parse.User).get(user.id);
    expect(fetched.has('email')).toBeFalsy();
    expect(fetched.has('favoriteColor')).toBeTruthy();
  });

  describe('interaction with legacy userSensitiveFields', function () {
    it('should fall back on sensitive fields if protected fields are not configured', async function () {
      const userSensitiveFields = ['phoneNumber', 'timeZone'];

      const protectedFields = { _User: { '*': ['email'] } };

      await reconfigureServer({ userSensitiveFields, protectedFields });
      const user = new Parse.User();
      user.setUsername('Alice');
      user.setPassword('sekrit');
      user.set('email', 'alice@aol.com');
      user.set('phoneNumber', 8675309);
      user.set('timeZone', 'America/Los_Angeles');
      user.set('favoriteColor', 'yellow');
      user.set('favoriteFood', 'pizza');
      await user.save();

      const fetched = await new Parse.Query(Parse.User).get(user.id);
      expect(fetched.has('email')).toBeFalsy();
      expect(fetched.has('phoneNumber')).toBeFalsy();
      expect(fetched.has('favoriteColor')).toBeTruthy();
    });

    it('should merge protected and sensitive for extra safety', async function () {
      const userSensitiveFields = ['phoneNumber', 'timeZone'];

      const protectedFields = { _User: { '*': ['email', 'favoriteFood'] } };

      await reconfigureServer({ userSensitiveFields, protectedFields });
      const user = new Parse.User();
      user.setUsername('Alice');
      user.setPassword('sekrit');
      user.set('email', 'alice@aol.com');
      user.set('phoneNumber', 8675309);
      user.set('timeZone', 'America/Los_Angeles');
      user.set('favoriteColor', 'yellow');
      user.set('favoriteFood', 'pizza');
      await user.save();

      const fetched = await new Parse.Query(Parse.User).get(user.id);
      expect(fetched.has('email')).toBeFalsy();
      expect(fetched.has('phoneNumber')).toBeFalsy();
      expect(fetched.has('favoriteFood')).toBeFalsy();
      expect(fetched.has('favoriteColor')).toBeTruthy();
    });
  });

  describe('non user class', function () {
    it('should hide fields in a non user class', async function () {
      const protectedFields = {
        ClassA: { '*': ['foo'] },
        ClassB: { '*': ['bar'] },
      };
      await reconfigureServer({ protectedFields });

      const objA = await new Parse.Object('ClassA').set('foo', 'zzz').set('bar', 'yyy').save();

      const objB = await new Parse.Object('ClassB').set('foo', 'zzz').set('bar', 'yyy').save();

      const [fetchedA, fetchedB] = await Promise.all([
        new Parse.Query('ClassA').get(objA.id),
        new Parse.Query('ClassB').get(objB.id),
      ]);

      expect(fetchedA.has('foo')).toBeFalsy();
      expect(fetchedA.has('bar')).toBeTruthy();

      expect(fetchedB.has('foo')).toBeTruthy();
      expect(fetchedB.has('bar')).toBeFalsy();
    });

    it('should hide fields in non user class and non standard user field at same time', async function () {
      const protectedFields = {
        _User: { '*': ['phoneNumber'] },
        ClassA: { '*': ['foo'] },
        ClassB: { '*': ['bar'] },
      };

      await reconfigureServer({ protectedFields });

      const user = new Parse.User();
      user.setUsername('Alice');
      user.setPassword('sekrit');
      user.set('email', 'alice@aol.com');
      user.set('phoneNumber', 8675309);
      user.set('timeZone', 'America/Los_Angeles');
      user.set('favoriteColor', 'yellow');
      user.set('favoriteFood', 'pizza');
      await user.save();

      const objA = await new Parse.Object('ClassA').set('foo', 'zzz').set('bar', 'yyy').save();

      const objB = await new Parse.Object('ClassB').set('foo', 'zzz').set('bar', 'yyy').save();

      const [fetchedUser, fetchedA, fetchedB] = await Promise.all([
        new Parse.Query(Parse.User).get(user.id),
        new Parse.Query('ClassA').get(objA.id),
        new Parse.Query('ClassB').get(objB.id),
      ]);

      expect(fetchedA.has('foo')).toBeFalsy();
      expect(fetchedA.has('bar')).toBeTruthy();

      expect(fetchedB.has('foo')).toBeTruthy();
      expect(fetchedB.has('bar')).toBeFalsy();

      expect(fetchedUser.has('email')).toBeFalsy();
      expect(fetchedUser.has('phoneNumber')).toBeFalsy();
      expect(fetchedUser.has('favoriteColor')).toBeTruthy();
    });
  });

  describe('using the pointer-permission variant', () => {
    let user1, user2;
    beforeEach(async () => {
      Config.get(Parse.applicationId).database.schemaCache.clear();
      user1 = await Parse.User.signUp('user1', 'password');
      user2 = await Parse.User.signUp('user2', 'password');
      await Parse.User.logOut();
    });

    describe('and get/fetch', () => {
      it('should allow access using single user pointer-permissions', async done => {
        const config = Config.get(Parse.applicationId);
        const obj = new Parse.Object('AnObject');

        obj.set('owner', user1);
        obj.set('test', 'test');
        await obj.save();

        const schema = await config.database.loadSchema();
        await schema.updateClass(
          'AnObject',
          {},
          {
            get: { '*': true },
            find: { '*': true },
            protectedFields: { '*': ['owner'], 'userField:owner': [] },
          }
        );

        await Parse.User.logIn('user1', 'password');
        const objectAgain = await obj.fetch();
        expect(objectAgain.get('owner').id).toBe(user1.id);
        expect(objectAgain.get('test')).toBe('test');
        done();
      });

      it('should deny access to other users using single user pointer-permissions', async done => {
        const config = Config.get(Parse.applicationId);
        const obj = new Parse.Object('AnObject');

        obj.set('owner', user1);
        obj.set('test', 'test');
        await obj.save();

        const schema = await config.database.loadSchema();
        await schema.updateClass(
          'AnObject',
          {},
          {
            get: { '*': true },
            find: { '*': true },
            protectedFields: { '*': ['owner'], 'userField:owner': [] },
          }
        );

        await Parse.User.logIn('user2', 'password');
        const objectAgain = await obj.fetch();
        expect(objectAgain.get('owner')).toBe(undefined);
        expect(objectAgain.get('test')).toBe('test');
        done();
      });

      it('should deny access to public using single user pointer-permissions', async done => {
        const config = Config.get(Parse.applicationId);
        const obj = new Parse.Object('AnObject');

        obj.set('owner', user1);
        obj.set('test', 'test');
        await obj.save();

        const schema = await config.database.loadSchema();
        await schema.updateClass(
          'AnObject',
          {},
          {
            get: { '*': true },
            find: { '*': true },
            protectedFields: { '*': ['owner'], 'userField:owner': [] },
          }
        );

        const objectAgain = await obj.fetch();
        expect(objectAgain.get('owner')).toBe(undefined);
        expect(objectAgain.get('test')).toBe('test');
        done();
      });

      it('should allow access using user array pointer-permissions', async done => {
        const config = Config.get(Parse.applicationId);
        const obj = new Parse.Object('AnObject');

        obj.set('owners', [user1, user2]);
        obj.set('test', 'test');
        await obj.save();

        const schema = await config.database.loadSchema();
        await schema.updateClass(
          'AnObject',
          {},
          {
            get: { '*': true },
            find: { '*': true },
            protectedFields: { '*': ['owners'], 'userField:owners': [] },
          }
        );

        await Parse.User.logIn('user1', 'password');
        let objectAgain = await obj.fetch();
        expect(objectAgain.get('owners')[0].id).toBe(user1.id);
        expect(objectAgain.get('test')).toBe('test');
        await Parse.User.logIn('user2', 'password');
        objectAgain = await obj.fetch();
        expect(objectAgain.get('owners')[1].id).toBe(user2.id);
        expect(objectAgain.get('test')).toBe('test');
        done();
      });

      it('should deny access to other users using user array pointer-permissions', async done => {
        const config = Config.get(Parse.applicationId);
        const obj = new Parse.Object('AnObject');

        obj.set('owners', [user1]);
        obj.set('test', 'test');
        await obj.save();

        const schema = await config.database.loadSchema();
        await schema.updateClass(
          'AnObject',
          {},
          {
            get: { '*': true },
            find: { '*': true },
            protectedFields: { '*': ['owners'], 'userField:owners': [] },
          }
        );

        await Parse.User.logIn('user2', 'password');
        const objectAgain = await obj.fetch();
        expect(objectAgain.get('owners')).toBe(undefined);
        expect(objectAgain.get('test')).toBe('test');
        done();
      });

      it('should deny access to public using user array pointer-permissions', async done => {
        const config = Config.get(Parse.applicationId);
        const obj = new Parse.Object('AnObject');

        obj.set('owners', [user1, user2]);
        obj.set('test', 'test');
        await obj.save();

        const schema = await config.database.loadSchema();
        await schema.updateClass(
          'AnObject',
          {},
          {
            get: { '*': true },
            find: { '*': true },
            protectedFields: { '*': ['owners'], 'userField:owners': [] },
          }
        );

        const objectAgain = await obj.fetch();
        expect(objectAgain.get('owners')).toBe(undefined);
        expect(objectAgain.get('test')).toBe('test');
        done();
      });

      it('should intersect protected fields when using multiple pointer-permission fields', async done => {
        const config = Config.get(Parse.applicationId);
        const obj = new Parse.Object('AnObject');

        obj.set('owners', [user1]);
        obj.set('owner', user1);
        obj.set('test', 'test');
        await obj.save();

        const schema = await config.database.loadSchema();
        await schema.updateClass(
          'AnObject',
          {},
          {
            get: { '*': true },
            find: { '*': true },
            protectedFields: {
              '*': ['owners', 'owner', 'test'],
              'userField:owners': ['owners', 'owner'],
              'userField:owner': ['owner'],
            },
          }
        );

        // Check if protectFields from pointer-permissions got combined
        await Parse.User.logIn('user1', 'password');
        const objectAgain = await obj.fetch();
        expect(objectAgain.get('owners').length).toBe(1);
        expect(objectAgain.get('owner')).toBe(undefined);
        expect(objectAgain.get('test')).toBe('test');
        done();
      });

      it('should ignore pointer-permission fields not present in object', async done => {
        const config = Config.get(Parse.applicationId);
        const obj = new Parse.Object('AnObject');

        obj.set('owners', [user1]);
        obj.set('owner', user1);
        obj.set('test', 'test');
        await obj.save();

        const schema = await config.database.loadSchema();
        await schema.updateClass(
          'AnObject',
          {},
          {
            get: { '*': true },
            find: { '*': true },
            protectedFields: {
              '*': [],
              'userField:idontexist': ['owner'],
              'userField:idontexist2': ['owners'],
            },
          }
        );

        await Parse.User.logIn('user1', 'password');
        const objectAgain = await obj.fetch();
        expect(objectAgain.get('owners')).not.toBe(undefined);
        expect(objectAgain.get('owner')).not.toBe(undefined);
        expect(objectAgain.get('test')).toBe('test');
        done();
      });
    });

    describe('and find', () => {
      it('should allow access using single user pointer-permissions', async done => {
        const config = Config.get(Parse.applicationId);
        const obj = new Parse.Object('AnObject');
        const obj2 = new Parse.Object('AnObject');

        obj.set('owner', user1);
        obj.set('test', 'test');
        obj2.set('owner', user1);
        obj2.set('test', 'test2');
        await Parse.Object.saveAll([obj, obj2]);

        const schema = await config.database.loadSchema();
        await schema.updateClass(
          'AnObject',
          {},
          {
            get: { '*': true },
            find: { '*': true },
            protectedFields: { '*': ['owner'], 'userField:owner': [] },
          }
        );

        await Parse.User.logIn('user1', 'password');

        const q = new Parse.Query('AnObject');
        const results = await q.find();
        // sort for checking in correct order
        results.sort((a, b) => a.get('test').localeCompare(b.get('test')));
        expect(results.length).toBe(2);

        expect(results[0].get('owner').id).toBe(user1.id);
        expect(results[0].get('test')).toBe('test');
        expect(results[1].get('owner').id).toBe(user1.id);
        expect(results[1].get('test')).toBe('test2');
        done();
      });

      it('should deny access to other users using single user pointer-permissions', async done => {
        const config = Config.get(Parse.applicationId);
        const obj = new Parse.Object('AnObject');
        const obj2 = new Parse.Object('AnObject');

        obj.set('owner', user1);
        obj.set('test', 'test');
        obj2.set('owner', user1);
        obj2.set('test', 'test2');
        await Parse.Object.saveAll([obj, obj2]);

        const schema = await config.database.loadSchema();
        await schema.updateClass(
          'AnObject',
          {},
          {
            get: { '*': true },
            find: { '*': true },
            protectedFields: { '*': ['owner'], 'userField:owner': [] },
          }
        );

        await Parse.User.logIn('user2', 'password');
        const q = new Parse.Query('AnObject');
        const results = await q.find();
        // sort for checking in correct order
        results.sort((a, b) => a.get('test').localeCompare(b.get('test')));
        expect(results.length).toBe(2);

        expect(results[0].get('owner')).toBe(undefined);
        expect(results[0].get('test')).toBe('test');
        expect(results[1].get('owner')).toBe(undefined);
        expect(results[1].get('test')).toBe('test2');
        done();
      });

      it('should deny access to public using single user pointer-permissions', async done => {
        const config = Config.get(Parse.applicationId);
        const obj = new Parse.Object('AnObject');
        const obj2 = new Parse.Object('AnObject');

        obj.set('owner', user1);
        obj.set('test', 'test');
        obj2.set('owner', user1);
        obj2.set('test', 'test2');
        await Parse.Object.saveAll([obj, obj2]);

        const schema = await config.database.loadSchema();
        await schema.updateClass(
          'AnObject',
          {},
          {
            get: { '*': true },
            find: { '*': true },
            protectedFields: { '*': ['owner'], 'userField:owner': [] },
          }
        );

        const q = new Parse.Query('AnObject');
        const results = await q.find();
        // sort for checking in correct order
        results.sort((a, b) => a.get('test').localeCompare(b.get('test')));
        expect(results.length).toBe(2);

        expect(results[0].get('owner')).toBe(undefined);
        expect(results[0].get('test')).toBe('test');
        expect(results[1].get('owner')).toBe(undefined);
        expect(results[1].get('test')).toBe('test2');
        done();
      });

      it('should allow access using user array pointer-permissions', async done => {
        const config = Config.get(Parse.applicationId);
        const obj = new Parse.Object('AnObject');
        const obj2 = new Parse.Object('AnObject');

        obj.set('owners', [user1, user2]);
        obj.set('test', 'test');
        obj2.set('owners', [user1, user2]);
        obj2.set('test', 'test2');
        await Parse.Object.saveAll([obj, obj2]);

        const schema = await config.database.loadSchema();
        await schema.updateClass(
          'AnObject',
          {},
          {
            get: { '*': true },
            find: { '*': true },
            protectedFields: { '*': ['owners'], 'userField:owners': [] },
          }
        );

        const q = new Parse.Query('AnObject');
        let results;

        await Parse.User.logIn('user1', 'password');
        results = await q.find();
        // sort for checking in correct order
        results.sort((a, b) => a.get('test').localeCompare(b.get('test')));
        expect(results.length).toBe(2);

        expect(results[0].get('owners')[0].id).toBe(user1.id);
        expect(results[0].get('test')).toBe('test');
        expect(results[1].get('owners')[0].id).toBe(user1.id);
        expect(results[1].get('test')).toBe('test2');

        await Parse.User.logIn('user2', 'password');
        results = await q.find();
        // sort for checking in correct order
        results.sort((a, b) => a.get('test').localeCompare(b.get('test')));
        expect(results.length).toBe(2);

        expect(results[0].get('owners')[1].id).toBe(user2.id);
        expect(results[0].get('test')).toBe('test');
        expect(results[1].get('owners')[1].id).toBe(user2.id);
        expect(results[1].get('test')).toBe('test2');
        done();
      });

      it('should deny access to other users using user array pointer-permissions', async done => {
        const config = Config.get(Parse.applicationId);
        const obj = new Parse.Object('AnObject');
        const obj2 = new Parse.Object('AnObject');

        obj.set('owners', [user1]);
        obj.set('test', 'test');
        obj2.set('owners', [user1]);
        obj2.set('test', 'test2');
        await Parse.Object.saveAll([obj, obj2]);

        const schema = await config.database.loadSchema();
        await schema.updateClass(
          'AnObject',
          {},
          {
            get: { '*': true },
            find: { '*': true },
            protectedFields: { '*': ['owners'], 'userField:owners': [] },
          }
        );

        await Parse.User.logIn('user2', 'password');
        const q = new Parse.Query('AnObject');
        const results = await q.find();
        // sort for checking in correct order
        results.sort((a, b) => a.get('test').localeCompare(b.get('test')));
        expect(results.length).toBe(2);

        expect(results[0].get('owners')).toBe(undefined);
        expect(results[0].get('test')).toBe('test');
        expect(results[1].get('owners')).toBe(undefined);
        expect(results[1].get('test')).toBe('test2');
        done();
      });

      it('should deny access to public using user array pointer-permissions', async done => {
        const config = Config.get(Parse.applicationId);
        const obj = new Parse.Object('AnObject');
        const obj2 = new Parse.Object('AnObject');

        obj.set('owners', [user1, user2]);
        obj.set('test', 'test');
        obj2.set('owners', [user1, user2]);
        obj2.set('test', 'test2');
        await Parse.Object.saveAll([obj, obj2]);

        const schema = await config.database.loadSchema();
        await schema.updateClass(
          'AnObject',
          {},
          {
            get: { '*': true },
            find: { '*': true },
            protectedFields: { '*': ['owners'], 'userField:owners': [] },
          }
        );

        const q = new Parse.Query('AnObject');
        const results = await q.find();
        // sort for checking in correct order
        results.sort((a, b) => a.get('test').localeCompare(b.get('test')));
        expect(results.length).toBe(2);

        expect(results[0].get('owners')).toBe(undefined);
        expect(results[0].get('test')).toBe('test');
        expect(results[1].get('owners')).toBe(undefined);
        expect(results[1].get('test')).toBe('test2');
        done();
      });

      it('should intersect protected fields when using multiple pointer-permission fields', async done => {
        const config = Config.get(Parse.applicationId);
        const obj = new Parse.Object('AnObject');
        const obj2 = new Parse.Object('AnObject');

        obj.set('owners', [user1]);
        obj.set('owner', user1);
        obj.set('test', 'test');
        obj2.set('owners', [user1]);
        obj2.set('test', 'test2');
        await Parse.Object.saveAll([obj, obj2]);

        const schema = await config.database.loadSchema();
        await schema.updateClass(
          'AnObject',
          {},
          {
            get: { '*': true },
            find: { '*': true },
            protectedFields: {
              '*': ['owners', 'owner', 'test'],
              'userField:owners': ['owners', 'owner'],
              'userField:owner': ['owner'],
            },
          }
        );

        // Check if protectFields from pointer-permissions got combined
        await Parse.User.logIn('user1', 'password');

        const q = new Parse.Query('AnObject');
        const results = await q.find();
        // sort for checking in correct order
        results.sort((a, b) => a.get('test').localeCompare(b.get('test')));
        expect(results.length).toBe(2);

        expect(results[0].get('owners').length).toBe(1);
        expect(results[0].get('owner')).toBe(undefined);
        expect(results[0].get('test')).toBe('test');
        expect(results[1].get('owners')).toBe(undefined);
        expect(results[1].get('owner')).toBe(undefined);
        expect(results[1].get('test')).toBe('test2');
        done();
      });

      it('should ignore pointer-permission fields not present in object', async done => {
        const config = Config.get(Parse.applicationId);
        const obj = new Parse.Object('AnObject');
        const obj2 = new Parse.Object('AnObject');

        obj.set('owners', [user1]);
        obj.set('owner', user1);
        obj.set('test', 'test');
        obj2.set('owners', [user1]);
        obj2.set('owner', user1);
        obj2.set('test', 'test2');
        await Parse.Object.saveAll([obj, obj2]);

        const schema = await config.database.loadSchema();
        await schema.updateClass(
          'AnObject',
          {},
          {
            get: { '*': true },
            find: { '*': true },
            protectedFields: {
              '*': [],
              'userField:idontexist': ['owner'],
              'userField:idontexist2': ['owners'],
            },
          }
        );

        await Parse.User.logIn('user1', 'password');

        const q = new Parse.Query('AnObject');
        const results = await q.find();
        // sort for checking in correct order
        results.sort((a, b) => a.get('test').localeCompare(b.get('test')));
        expect(results.length).toBe(2);

        expect(results[0].get('owners')).not.toBe(undefined);
        expect(results[0].get('owner')).not.toBe(undefined);
        expect(results[0].get('test')).toBe('test');
        expect(results[1].get('owners')).not.toBe(undefined);
        expect(results[1].get('owner')).not.toBe(undefined);
        expect(results[1].get('test')).toBe('test2');
        done();
      });

      it('should filter only fields from objects not owned by the user', async done => {
        const config = Config.get(Parse.applicationId);
        const obj = new Parse.Object('AnObject');
        const obj2 = new Parse.Object('AnObject');
        const obj3 = new Parse.Object('AnObject');

        obj.set('owner', user1);
        obj.set('test', 'test');
        obj2.set('owner', user2);
        obj2.set('test', 'test2');
        obj3.set('owner', user2);
        obj3.set('test', 'test3');
        await Parse.Object.saveAll([obj, obj2, obj3]);

        const schema = await config.database.loadSchema();
        await schema.updateClass(
          'AnObject',
          {},
          {
            get: { '*': true },
            find: { '*': true },
            protectedFields: {
              '*': ['owner'],
              'userField:owner': [],
            },
          }
        );

        const q = new Parse.Query('AnObject');
        let results;

        await Parse.User.logIn('user1', 'password');

        results = await q.find();
        // sort for checking in correct order
        results.sort((a, b) => a.get('test').localeCompare(b.get('test')));
        expect(results.length).toBe(3);

        expect(results[0].get('owner')).not.toBe(undefined);
        expect(results[0].get('test')).toBe('test');
        expect(results[1].get('owner')).toBe(undefined);
        expect(results[1].get('test')).toBe('test2');
        expect(results[2].get('owner')).toBe(undefined);
        expect(results[2].get('test')).toBe('test3');

        await Parse.User.logIn('user2', 'password');

        results = await q.find();
        // sort for checking in correct order
        results.sort((a, b) => a.get('test').localeCompare(b.get('test')));
        expect(results.length).toBe(3);

        expect(results[0].get('owner')).toBe(undefined);
        expect(results[0].get('test')).toBe('test');
        expect(results[1].get('owner')).not.toBe(undefined);
        expect(results[1].get('test')).toBe('test2');
        expect(results[2].get('owner')).not.toBe(undefined);
        expect(results[2].get('test')).toBe('test3');
        done();
      });
    });
  });

  describe('schema setup', () => {
    let object;

    async function initialize() {
      await Config.get(Parse.applicationId).database.schemaCache.clear();

      object = new Parse.Object(className);

      object.set('revision', 0);
      object.set('test', 'test');

      await object.save(null, { useMasterKey: true });
    }

    beforeEach(async () => {
      await initialize();
    });

    it('should fail setting non-existing protected field', async done => {
      const field = 'non-existing';
      const entity = '*';

      await expectAsync(
        updateCLP({
          protectedFields: {
            [entity]: [field],
          },
        })
      ).toBeRejectedWith(
        new Parse.Error(
          Parse.Error.INVALID_JSON,
          `Field '${field}' in protectedFields:${entity} does not exist`
        )
      );
      done();
    });

    it('should allow setting authenticated', async () => {
      await expectAsync(
        updateCLP({
          protectedFields: {
            authenticated: ['test'],
          },
        })
      ).toBeResolved();
    });

    it('should not allow protecting default fields', async () => {
      const defaultFields = ['objectId', 'createdAt', 'updatedAt', 'ACL'];
      for (const field of defaultFields) {
        await expectAsync(
          updateCLP({
            protectedFields: {
              '*': [field],
            },
          })
        ).toBeRejectedWith(
          new Parse.Error(Parse.Error.INVALID_JSON, `Default field '${field}' can not be protected`)
        );
      }
    });
  });

  describe('targeting public access', () => {
    let obj1;

    async function initialize() {
      await Config.get(Parse.applicationId).database.schemaCache.clear();

      obj1 = new Parse.Object(className);

      obj1.set('foo', 'foo');
      obj1.set('bar', 'bar');
      obj1.set('qux', 'qux');

      await obj1.save(null, {
        useMasterKey: true,
      });
    }

    beforeEach(async () => {
      await initialize();
    });

    it('should hide field', async done => {
      await updateCLP({
        get: { '*': true },
        find: { '*': true },
        protectedFields: {
          '*': ['foo'],
        },
      });

      // unauthenticated
      const object = await obj1.fetch();

      expect(object.get('foo')).toBe(undefined);
      expect(object.get('bar')).toBeDefined();
      expect(object.get('qux')).toBeDefined();

      done();
    });

    it('should hide mutiple fields', async done => {
      await updateCLP({
        get: { '*': true },
        find: { '*': true },
        protectedFields: {
          '*': ['foo', 'bar'],
        },
      });

      // unauthenticated
      const object = await obj1.fetch();

      expect(object.get('foo')).toBe(undefined);
      expect(object.get('bar')).toBe(undefined);
      expect(object.get('qux')).toBeDefined();

      done();
    });

    it('should not hide any fields when set as empty array', async done => {
      await updateCLP({
        get: { '*': true },
        find: { '*': true },
        protectedFields: {
          '*': [],
        },
      });

      // unauthenticated
      const object = await obj1.fetch();

      expect(object.get('foo')).toBeDefined();
      expect(object.get('bar')).toBeDefined();
      expect(object.get('qux')).toBeDefined();
      expect(object.id).toBeDefined();
      expect(object.createdAt).toBeDefined();
      expect(object.updatedAt).toBeDefined();
      expect(object.getACL()).toBeDefined();

      done();
    });
  });

  describe('targeting authenticated', () => {
    /**
     * is **owner** of: _obj1_
     *
     * is **tester** of: [ _obj1, obj2_ ]
     */
    let user1;

    /**
     * is **owner** of:  _obj2_
     *
     * is **tester** of: [ _obj1_ ]
     */
    let user2;

    /**
     * **owner**: _user1_
     *
     * **testers**: [ _user1,user2_ ]
     */
    let obj1;

    /**
     * **owner**: _user2_
     *
     * **testers**: [ _user1_ ]
     */
    let obj2;

    async function initialize() {
      await Config.get(Parse.applicationId).database.schemaCache.clear();

      await Parse.User.logOut();

      [user1, user2] = await Promise.all([createUser('user1'), createUser('user2')]);

      obj1 = new Parse.Object(className);
      obj2 = new Parse.Object(className);

      obj1.set('owner', user1);
      obj1.set('testers', [user1, user2]);
      obj1.set('test', 'test');

      obj2.set('owner', user2);
      obj2.set('testers', [user1]);
      obj2.set('test', 'test');

      await Parse.Object.saveAll([obj1, obj2], {
        useMasterKey: true,
      });
    }

    beforeEach(async () => {
      await initialize();
    });

    it('should not hide any fields when set as empty array', async done => {
      await updateCLP({
        get: { '*': true },
        find: { '*': true },
        protectedFields: {
          authenticated: [],
        },
      });

      // authenticated
      await logIn(user1);

      const object = await obj1.fetch();

      expect(object.get('owner')).toBeDefined();
      expect(object.get('testers')).toBeDefined();
      expect(object.get('test')).toBeDefined();
      expect(object.id).toBeDefined();
      expect(object.createdAt).toBeDefined();
      expect(object.updatedAt).toBeDefined();
      expect(object.getACL()).toBeDefined();

      done();
    });

    it('should hide fields for authenticated users only (* not set)', async done => {
      await updateCLP({
        get: { '*': true },
        find: { '*': true },
        protectedFields: {
          authenticated: ['test'],
        },
      });

      // not authenticated
      const objectNonAuth = await obj1.fetch();

      expect(objectNonAuth.get('test')).toBeDefined();

      // authenticated
      await logIn(user1);
      const object = await obj1.fetch();

      expect(object.get('test')).toBe(undefined);

      done();
    });

    it('should intersect public and auth for authenticated user', async done => {
      await updateCLP({
        get: { '*': true },
        find: { '*': true },
        protectedFields: {
          '*': ['owner', 'testers'],
          authenticated: ['testers'],
        },
      });

      // authenticated
      await logIn(user1);
      const objectAuth = await obj1.fetch();

      // ( {A,B} intersect {B} ) == {B}

      expect(objectAuth.get('testers')).not.toBeDefined(
        'Should not be visible - protected for * and authenticated'
      );
      expect(objectAuth.get('test')).toBeDefined(
        'Should be visible - not protected for everyone (* and authenticated)'
      );
      expect(objectAuth.get('owner')).toBeDefined(
        'Should be visible - not protected for authenticated'
      );

      done();
    });

    it('should have higher prio than public for logged in users (intersect)', async done => {
      await updateCLP({
        get: { '*': true },
        find: { '*': true },
        protectedFields: {
          '*': ['test'],
          authenticated: [],
        },
      });
      // authenticated, permitted
      await logIn(user1);

      const object = await obj1.fetch();
      expect(object.get('test')).toBe('test');

      done();
    });

    it('should have no effect on unauthenticated users (public not set)', async done => {
      await updateCLP({
        get: { '*': true },
        find: { '*': true },
        protectedFields: {
          authenticated: ['test'],
        },
      });

      // unauthenticated, protected
      const objectNonAuth = await obj1.fetch();
      expect(objectNonAuth.get('test')).toBe('test');

      done();
    });

    it('should protect multiple fields for authenticated users', async done => {
      await updateCLP({
        get: { '*': true },
        find: { '*': true },
        protectedFields: {
          authenticated: ['test', 'owner'],
        },
      });

      // authenticated
      await logIn(user1);
      const object = await obj1.fetch();

      expect(object.get('test')).toBe(undefined);
      expect(object.get('owner')).toBe(undefined);

      done();
    });

    it('should not be affected by rules not applicable to user (smoke)', async done => {
      const role = await createRole({ users: user1 });
      const roleName = role.get('name');

      await updateCLP({
        get: { '*': true },
        find: { '*': true },
        protectedFields: {
          authenticated: ['owner', 'testers'],
          [`role:${roleName}`]: ['test'],
          'userField:owner': [],
          [user1.id]: [],
        },
      });

      // authenticated, non-owner, no role
      await logIn(user2);
      const objectNotOwned = await obj1.fetch();

      expect(objectNotOwned.get('owner')).toBe(undefined);
      expect(objectNotOwned.get('testers')).toBe(undefined);
      expect(objectNotOwned.get('test')).toBeDefined();

      done();
    });
  });

  describe('targeting roles', () => {
    let user1, user2;

    /**
     * owner: user1
     *
     * testers: [user1,user2]
     */
    let obj1;

    /**
     * owner: user2
     *
     * testers: [user1]
     */
    let obj2;

    async function initialize() {
      await Config.get(Parse.applicationId).database.schemaCache.clear();

      [user1, user2] = await Promise.all([createUser('user1'), createUser('user2')]);

      obj1 = new Parse.Object(className);
      obj2 = new Parse.Object(className);

      obj1.set('owner', user1);
      obj1.set('testers', [user1, user2]);
      obj1.set('test', 'test');

      obj2.set('owner', user2);
      obj2.set('testers', [user1]);
      obj2.set('test', 'test');

      await Parse.Object.saveAll([obj1, obj2], {
        useMasterKey: true,
      });
    }

    beforeEach(async () => {
      await initialize();
    });

    it('should hide field when user belongs to a role', async done => {
      const role = await createRole({ users: user1 });
      const roleName = role.get('name');

      await updateCLP({
        protectedFields: {
          [`role:${roleName}`]: ['test'],
        },
        get: { '*': true },
        find: { '*': true },
      });

      // user has role
      await logIn(user1);

      const object = await obj1.fetch();
      expect(object.get('test')).toBe(undefined); //  field protected
      expect(object.get('owner')).toBeDefined();
      expect(object.get('testers')).toBeDefined();

      done();
    });

    it('should not hide any fields when set as empty array', async done => {
      const role = await createRole({ users: user1 });
      const roleName = role.get('name');

      await updateCLP({
        protectedFields: {
          [`role:${roleName}`]: [],
        },
        get: { '*': true },
        find: { '*': true },
      });

      // user has role
      await logIn(user1);

      const object = await obj1.fetch();

      expect(object.get('owner')).toBeDefined();
      expect(object.get('testers')).toBeDefined();
      expect(object.get('test')).toBeDefined();
      expect(object.id).toBeDefined();
      expect(object.createdAt).toBeDefined();
      expect(object.updatedAt).toBeDefined();
      expect(object.getACL()).toBeDefined();

      done();
    });

    it('should hide multiple fields when user belongs to a role', async done => {
      const role = await createRole({ users: user1 });
      const roleName = role.get('name');

      await updateCLP({
        get: { '*': true },
        find: { '*': true },
        protectedFields: {
          [`role:${roleName}`]: ['test', 'owner'],
        },
      });

      // user has role
      await logIn(user1);

      const object = await obj1.fetch();

      expect(object.get('test')).toBe(undefined, 'Field should not be visible - protected by role');
      expect(object.get('owner')).toBe(
        undefined,
        'Field should not be visible - protected by role'
      );
      expect(object.get('testers')).toBeDefined();

      done();
    });

    it('should not protect when user does not belong to a role', async done => {
      const role = await createRole({ users: user1 });
      const roleName = role.get('name');

      await updateCLP({
        get: { '*': true },
        find: { '*': true },
        protectedFields: {
          [`role:${roleName}`]: ['test', 'owner'],
        },
      });

      // user doesn't have role
      await logIn(user2);
      const object = await obj1.fetch();

      expect(object.get('test')).toBeDefined();
      expect(object.get('owner')).toBeDefined();
      expect(object.get('testers')).toBeDefined();

      done();
    });

    it('should intersect protected fields when user belongs to multiple roles', async done => {
      const role1 = await createRole({ users: user1 });
      const role2 = await createRole({ users: user1 });

      const role1name = role1.get('name');
      const role2name = role2.get('name');

      await updateCLP({
        get: { '*': true },
        find: { '*': true },
        protectedFields: {
          [`role:${role1name}`]: ['owner'],
          [`role:${role2name}`]: ['test', 'owner'],
        },
      });

      // user has both roles
      await logIn(user1);
      const object = await obj1.fetch();

      // "owner" is a result of intersection
      expect(object.get('owner')).toBe(
        undefined,
        'Must not be visible - protected for all roles the user belongs to'
      );
      expect(object.get('test')).toBeDefined(
        'Has to be visible - is not protected for users with role1'
      );
      done();
    });

    it('should intersect protected fields when user belongs to multiple roles hierarchy', async done => {
      const admin = await createRole({
        users: user1,
        roleName: 'admin',
      });

      const moder = await createRole({
        users: [user1, user2],
        roleName: 'moder',
      });

      const tester = await createRole({
        roleName: 'tester',
      });

      // admin supersets moder role
      moder.relation('roles').add(admin);
      await moder.save(null, { useMasterKey: true });

      tester.relation('roles').add(moder);
      await tester.save(null, { useMasterKey: true });

      const roleAdmin = `role:${admin.get('name')}`;
      const roleModer = `role:${moder.get('name')}`;
      const roleTester = `role:${tester.get('name')}`;

      await updateCLP({
        get: { '*': true },
        find: { '*': true },
        protectedFields: {
          [roleAdmin]: [],
          [roleModer]: ['owner'],
          [roleTester]: ['test', 'owner'],
        },
      });

      // user1 has admin & moder & tester roles, (moder includes tester).
      await logIn(user1);
      const object = await obj1.fetch();

      // being admin makes all fields visible
      expect(object.get('test')).toBeDefined(
        'Should be visible - admin role explicitly removes protection for all fields ( [] )'
      );
      expect(object.get('owner')).toBeDefined(
        'Should be visible - admin role explicitly removes protection for all fields ( [] )'
      );

      // user2 has moder & tester role, moder includes tester.
      await logIn(user2);
      const objectAgain = await obj1.fetch();

      // being moder allows "test" field
      expect(objectAgain.get('owner')).toBe(
        undefined,
        '"owner" should not be visible - protected for each role user belongs to'
      );
      expect(objectAgain.get('test')).toBeDefined(
        'Should be visible - moder role does not protect "test" field'
      );

      done();
    });

    it('should be able to clear protected fields for role (protected for authenticated)', async done => {
      const role = await createRole({ users: user1 });
      const roleName = role.get('name');

      await updateCLP({
        get: { '*': true },
        find: { '*': true },
        protectedFields: {
          authenticated: ['test'],
          [`role:${roleName}`]: [],
        },
      });

      // user has role, test field visible
      await logIn(user1);
      const object = await obj1.fetch();
      expect(object.get('test')).toBe('test');

      done();
    });

    it('should determine protectedFields as intersection of field sets for public and role', async done => {
      const role = await createRole({ users: user1 });
      const roleName = role.get('name');

      await updateCLP({
        get: { '*': true },
        find: { '*': true },
        protectedFields: {
          '*': ['test', 'owner'],
          [`role:${roleName}`]: ['owner', 'testers'],
        },
      });

      // user has role
      await logIn(user1);

      const object = await obj1.fetch();
      expect(object.get('test')).toBeDefined(
        'Should be visible - "test" is not protected for role user belongs to'
      );
      expect(object.get('testers')).toBeDefined(
        'Should be visible - "testers" is allowed for everyone (*)'
      );
      expect(object.get('owner')).toBe(
        undefined,
        'Should not be visible - "test" is not allowed for both public(*) and role'
      );
      done();
    });

    it('should be determined as an intersection of protecedFields for authenticated and role', async done => {
      const role = await createRole({ users: user1 });
      const roleName = role.get('name');

      // this is an example of misunderstood configuration.
      // If you allow (== do not restrict) some field for broader audience
      // (having a role implies user inheres to 'authenticated' group)
      // it's not possible to narrow by protecting field for a role.
      // You'd have to protect it for 'authenticated' as well.
      await updateCLP({
        get: { '*': true },
        find: { '*': true },
        protectedFields: {
          authenticated: ['test'],
          [`role:${roleName}`]: ['owner'],
        },
      });

      // user has role
      await logIn(user1);
      const object = await obj1.fetch();

      //
      expect(object.get('test')).toBeDefined(
        "Being both auhenticated and having a role leads to clearing protection on 'test' (by role rules)"
      );
      expect(object.get('owner')).toBeDefined('All authenticated users allowed to see "owner"');
      expect(object.get('testers')).toBeDefined();

      done();
    });

    it('should not hide fields when user does not belong to a role protectedFields set for', async done => {
      const role = await createRole({ users: user2 });
      const roleName = role.get('name');

      await updateCLP({
        get: { '*': true },
        find: { '*': true },
        protectedFields: {
          [`role:${roleName}`]: ['test'],
        },
      });

      // relate user1 to some role, no protectedFields for it
      await createRole({ users: user1 });

      await logIn(user1);

      const object = await obj1.fetch();
      expect(object.get('test')).toBeDefined(
        'Field should be visible - user belongs to a role that has no protectedFields set'
      );

      done();
    });
  });

  describe('using pointer-fields and queries with keys projection', () => {
    /*
     * Pointer variant ("userField:column") relies on User ids
     * returned after query executed (hides fields before sending it to client)
     * If such column is excluded/not included (not returned from db because of 'project')
     * there will be no user ids to check against
     * and protectedFields won't be applied correctly.
     */

    let user1;
    /**
     * owner: user1
     *
     * testers: [user1]
     */
    let obj;

    let headers;

    /**
     * Clear cache, create user and object, login user and setup rest headers with token
     */
    async function initialize() {
      await Config.get(Parse.applicationId).database.schemaCache.clear();

      user1 = await createUser('user1');
      user1 = await logIn(user1);

      // await user1.fetch();
      obj = new Parse.Object(className);

      obj.set('owner', user1);
      obj.set('field', 'field');
      obj.set('test', 'test');

      await Parse.Object.saveAll([obj], { useMasterKey: true });

      headers = {
        'X-Parse-Application-Id': Parse.applicationId,
        'X-Parse-Rest-API-Key': 'rest',
        'Content-Type': 'application/json',
        'X-Parse-Session-Token': user1.getSessionToken(),
      };
    }

    beforeEach(async () => {
      await initialize();
    });

    it('should be enforced regardless of pointer-field being included in keys (select)', async done => {
      await updateCLP({
        get: { '*': true },
        find: { '*': true },
        protectedFields: {
          '*': ['field', 'test'],
          'userField:owner': [],
        },
      });

      const query = new Parse.Query('AnObject');
      query.select('field', 'test');

      const object = await query.get(obj.id);
      expect(object.get('field')).toBe('field');
      expect(object.get('test')).toBe('test');
      done();
    });

    it('should protect fields for query where pointer field is not included via keys (REST GET)', async done => {
      const obj = new Parse.Object(className);

      obj.set('owner', user1);
      obj.set('field', 'field');
      obj.set('test', 'test');

      await Parse.Object.saveAll([obj], { useMasterKey: true });

      await updateCLP({
        get: { '*': true },
        find: { '*': true },
        protectedFields: {
          '*': ['field', 'test'],
          'userField:owner': ['test'],
        },
      });

      const { data: object } = await request({
        url: `${Parse.serverURL}/classes/${className}/${obj.id}`,
        qs: {
          keys: 'field,test',
        },
        headers: headers,
      });

      expect(object.field).toBe(
        'field',
        'Should BE in response - not protected by "userField:owner"'
      );
      expect(object.test).toBe(
        undefined,
        'Should NOT be in response - protected by "userField:owner"'
      );
      expect(object.owner).toBe(undefined, 'Should not be in response - not included in "keys"');
      done();
    });

    it('should protect fields for query where pointer field is not included via keys (REST FIND)', async done => {
      const obj = new Parse.Object(className);

      obj.set('owner', user1);
      obj.set('field', 'field');
      obj.set('test', 'test');

      await Parse.Object.saveAll([obj], { useMasterKey: true });

      await obj.fetch();

      await updateCLP({
        get: { '*': true },
        find: { '*': true },
        protectedFields: {
          '*': ['field', 'test'],
          'userField:owner': ['test'],
        },
      });

      const { data } = await request({
        url: `${Parse.serverURL}/classes/${className}`,
        qs: {
          keys: 'field,test',
          where: JSON.stringify({ objectId: obj.id }),
        },
        headers,
      });

      const object = data.results[0];

      expect(object.field).toBe(
        'field',
        'Should be in response - not protected by "userField:owner"'
      );
      expect(object.test).toBe(
        undefined,
        'Should not be in response - protected by "userField:owner"'
      );
      expect(object.owner).toBe(undefined, 'Should not be in response - not included in "keys"');
      done();
    });

    it('should protect fields for query where pointer field is in excludeKeys (REST GET)', async done => {
      await updateCLP({
        get: { '*': true },
        find: { '*': true },
        protectedFields: {
          '*': ['field', 'test'],
          'userField:owner': ['test'],
        },
      });

      const { data: object } = await request({
        qs: {
          excludeKeys: 'owner',
        },
        headers,
        url: `${Parse.serverURL}/classes/${className}/${obj.id}`,
      });

      expect(object.field).toBe(
        'field',
        'Should be in response - not protected by "userField:owner"'
      );
      expect(object['test']).toBe(
        undefined,
        'Should not be in response - protected by "userField:owner"'
      );
      expect(object['owner']).toBe(undefined, 'Should not be in response - not included in "keys"');
      done();
    });

    it('should protect fields for query where pointer field is in excludedKeys (REST FIND)', async done => {
      await updateCLP({
        protectedFields: {
          '*': ['field', 'test'],
          'userField:owner': ['test'],
        },
        get: { '*': true },
        find: { '*': true },
      });

      const { data } = await request({
        qs: {
          excludeKeys: 'owner',
          where: JSON.stringify({ objectId: obj.id }),
        },
        headers,
        url: `${Parse.serverURL}/classes/${className}`,
      });

      const object = data.results[0];

      expect(object.field).toBe(
        'field',
        'Should be in response - not protected by "userField:owner"'
      );
      expect(object.test).toBe(
        undefined,
        'Should not be in response - protected by "userField:owner"'
      );
      expect(object.owner).toBe(undefined, 'Should not be in response - not included in "keys"');
      done();
    });

    xit('todo: should be enforced regardless of pointer-field being excluded', async done => {
      await updateCLP({
        get: { '*': true },
        find: { '*': true },
        protectedFields: {
          '*': ['field', 'test'],
          'userField:owner': [],
        },
      });

      const query = new Parse.Query('AnObject');

      /* TODO: this has some caching problems on JS-SDK (2.11.) side */
      // query.exclude('owner')

      const object = await query.get(obj.id);
      expect(object.get('field')).toBe('field');
      expect(object.get('test')).toBe('test');
      expect(object.get('owner')).toBe(undefined);
      done();
    });
  });
});
