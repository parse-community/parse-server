const Config = require('../lib/Config');
const Parse = require('parse/node');

describe('ProtectedFields', function() {
  it('should handle and empty protectedFields', async function() {
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

  describe('interaction with legacy userSensitiveFields', function() {
    it('should fall back on sensitive fields if protected fields are not configured', async function() {
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

    it('should merge protected and sensitive for extra safety', async function() {
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

  describe('non user class', function() {
    it('should hide fields in a non user class', async function() {
      const protectedFields = {
        ClassA: { '*': ['foo'] },
        ClassB: { '*': ['bar'] },
      };
      await reconfigureServer({ protectedFields });

      const objA = await new Parse.Object('ClassA')
        .set('foo', 'zzz')
        .set('bar', 'yyy')
        .save();

      const objB = await new Parse.Object('ClassB')
        .set('foo', 'zzz')
        .set('bar', 'yyy')
        .save();

      const [fetchedA, fetchedB] = await Promise.all([
        new Parse.Query('ClassA').get(objA.id),
        new Parse.Query('ClassB').get(objB.id),
      ]);

      expect(fetchedA.has('foo')).toBeFalsy();
      expect(fetchedA.has('bar')).toBeTruthy();

      expect(fetchedB.has('foo')).toBeTruthy();
      expect(fetchedB.has('bar')).toBeFalsy();
    });

    it('should hide fields in non user class and non standard user field at same time', async function() {
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

      const objA = await new Parse.Object('ClassA')
        .set('foo', 'zzz')
        .set('bar', 'yyy')
        .save();

      const objB = await new Parse.Object('ClassB')
        .set('foo', 'zzz')
        .set('bar', 'yyy')
        .save();

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

      it('should create merge protected fields when using multiple pointer-permission fields', async done => {
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
              'userField:owners': ['owners'],
              'userField:owner': ['owner'],
            },
          }
        );

        // Check if protectFields from pointer-permissions got combined
        await Parse.User.logIn('user1', 'password');
        const objectAgain = await obj.fetch();
        expect(objectAgain.get('owners')).toBe(undefined);
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

      it('should create merge protected fields when using multiple pointer-permission fields', async done => {
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
              'userField:owners': ['owners'],
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

        expect(results[0].get('owners')).toBe(undefined);
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
});
