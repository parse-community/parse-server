'use strict';

const MongoStorageAdapter = require('../lib/Adapters/Storage/Mongo/MongoStorageAdapter').default;
const { MongoClient, Collection } = require('mongodb');
const databaseURI = 'mongodb://localhost:27017/parseServerMongoAdapterTestDatabase';
const request = require('../lib/request');
const Config = require('../lib/Config');
const TestUtils = require('../lib/TestUtils');

const fakeClient = {
  s: { options: { dbName: null } },
  db: () => null,
};

// These tests are specific to the mongo storage adapter + mongo storage format
// and will eventually be moved into their own repo
describe_only_db('mongo')('MongoStorageAdapter', () => {
  beforeEach(async () => {
    await new MongoStorageAdapter({ uri: databaseURI }).deleteAllClasses();
    Config.get(Parse.applicationId).schemaCache.clear();
  });

  it('auto-escapes symbols in auth information', () => {
    spyOn(MongoClient, 'connect').and.returnValue(Promise.resolve(fakeClient));
    new MongoStorageAdapter({
      uri: 'mongodb://user!with@+ symbols:password!with@+ symbols@localhost:1234/parse',
    }).connect();
    expect(MongoClient.connect).toHaveBeenCalledWith(
      'mongodb://user!with%40%2B%20symbols:password!with%40%2B%20symbols@localhost:1234/parse',
      jasmine.any(Object)
    );
  });

  it("doesn't double escape already URI-encoded information", () => {
    spyOn(MongoClient, 'connect').and.returnValue(Promise.resolve(fakeClient));
    new MongoStorageAdapter({
      uri: 'mongodb://user!with%40%2B%20symbols:password!with%40%2B%20symbols@localhost:1234/parse',
    }).connect();
    expect(MongoClient.connect).toHaveBeenCalledWith(
      'mongodb://user!with%40%2B%20symbols:password!with%40%2B%20symbols@localhost:1234/parse',
      jasmine.any(Object)
    );
  });

  // https://github.com/parse-community/parse-server/pull/148#issuecomment-180407057
  it('preserves replica sets', () => {
    spyOn(MongoClient, 'connect').and.returnValue(Promise.resolve(fakeClient));
    new MongoStorageAdapter({
      uri:
        'mongodb://test:testpass@ds056315-a0.mongolab.com:59325,ds059315-a1.mongolab.com:59315/testDBname?replicaSet=rs-ds059415',
    }).connect();
    expect(MongoClient.connect).toHaveBeenCalledWith(
      'mongodb://test:testpass@ds056315-a0.mongolab.com:59325,ds059315-a1.mongolab.com:59315/testDBname?replicaSet=rs-ds059415',
      jasmine.any(Object)
    );
  });

  it('stores objectId in _id', done => {
    const adapter = new MongoStorageAdapter({ uri: databaseURI });
    adapter
      .createObject('Foo', { fields: {} }, { objectId: 'abcde' })
      .then(() => adapter._rawFind('Foo', {}))
      .then(results => {
        expect(results.length).toEqual(1);
        const obj = results[0];
        expect(obj._id).toEqual('abcde');
        expect(obj.objectId).toBeUndefined();
        done();
      });
  });

  it('find succeeds when query is within maxTimeMS', done => {
    const maxTimeMS = 250;
    const adapter = new MongoStorageAdapter({
      uri: databaseURI,
      mongoOptions: { maxTimeMS },
    });
    adapter
      .createObject('Foo', { fields: {} }, { objectId: 'abcde' })
      .then(() => adapter._rawFind('Foo', { $where: `sleep(${maxTimeMS / 2})` }))
      .then(
        () => done(),
        err => {
          done.fail(`maxTimeMS should not affect fast queries ${err}`);
        }
      );
  });

  it('find fails when query exceeds maxTimeMS', done => {
    const maxTimeMS = 250;
    const adapter = new MongoStorageAdapter({
      uri: databaseURI,
      mongoOptions: { maxTimeMS },
    });
    adapter
      .createObject('Foo', { fields: {} }, { objectId: 'abcde' })
      .then(() => adapter._rawFind('Foo', { $where: `sleep(${maxTimeMS * 2})` }))
      .then(
        () => {
          done.fail('Find succeeded despite taking too long!');
        },
        err => {
          expect(err.name).toEqual('MongoServerError');
          expect(err.code).toEqual(50);
          expect(err.message).toMatch('operation exceeded time limit');
          done();
        }
      );
  });

  it('stores pointers with a _p_ prefix', done => {
    const obj = {
      objectId: 'bar',
      aPointer: {
        __type: 'Pointer',
        className: 'JustThePointer',
        objectId: 'qwerty',
      },
    };
    const adapter = new MongoStorageAdapter({ uri: databaseURI });
    adapter
      .createObject(
        'APointerDarkly',
        {
          fields: {
            objectId: { type: 'String' },
            aPointer: { type: 'Pointer', targetClass: 'JustThePointer' },
          },
        },
        obj
      )
      .then(() => adapter._rawFind('APointerDarkly', {}))
      .then(results => {
        expect(results.length).toEqual(1);
        const output = results[0];
        expect(typeof output._id).toEqual('string');
        expect(typeof output._p_aPointer).toEqual('string');
        expect(output._p_aPointer).toEqual('JustThePointer$qwerty');
        expect(output.aPointer).toBeUndefined();
        done();
      });
  });

  it('handles object and subdocument', done => {
    const adapter = new MongoStorageAdapter({ uri: databaseURI });
    const schema = { fields: { subdoc: { type: 'Object' } } };
    const obj = { subdoc: { foo: 'bar', wu: 'tan' } };
    adapter
      .createObject('MyClass', schema, obj)
      .then(() => adapter._rawFind('MyClass', {}))
      .then(results => {
        expect(results.length).toEqual(1);
        const mob = results[0];
        expect(typeof mob.subdoc).toBe('object');
        expect(mob.subdoc.foo).toBe('bar');
        expect(mob.subdoc.wu).toBe('tan');
        const obj = { 'subdoc.wu': 'clan' };
        return adapter.findOneAndUpdate('MyClass', schema, {}, obj);
      })
      .then(() => adapter._rawFind('MyClass', {}))
      .then(results => {
        expect(results.length).toEqual(1);
        const mob = results[0];
        expect(typeof mob.subdoc).toBe('object');
        expect(mob.subdoc.foo).toBe('bar');
        expect(mob.subdoc.wu).toBe('clan');
        done();
      });
  });

  it('handles creating an array, object, date', done => {
    const adapter = new MongoStorageAdapter({ uri: databaseURI });
    const obj = {
      array: [1, 2, 3],
      object: { foo: 'bar' },
      date: {
        __type: 'Date',
        iso: '2016-05-26T20:55:01.154Z',
      },
    };
    const schema = {
      fields: {
        array: { type: 'Array' },
        object: { type: 'Object' },
        date: { type: 'Date' },
      },
    };
    adapter
      .createObject('MyClass', schema, obj)
      .then(() => adapter._rawFind('MyClass', {}))
      .then(results => {
        expect(results.length).toEqual(1);
        const mob = results[0];
        expect(mob.array instanceof Array).toBe(true);
        expect(typeof mob.object).toBe('object');
        expect(mob.date instanceof Date).toBe(true);
        return adapter.find('MyClass', schema, {}, {});
      })
      .then(results => {
        expect(results.length).toEqual(1);
        const mob = results[0];
        expect(mob.array instanceof Array).toBe(true);
        expect(typeof mob.object).toBe('object');
        expect(mob.date.__type).toBe('Date');
        expect(mob.date.iso).toBe('2016-05-26T20:55:01.154Z');
        done();
      })
      .catch(error => {
        console.log(error);
        fail();
        done();
      });
  });

  it('handles nested dates', async () => {
    await new Parse.Object('MyClass', {
      foo: {
        test: {
          date: new Date(),
        },
      },
      bar: {
        date: new Date(),
      },
      date: new Date(),
    }).save();
    const adapter = Config.get(Parse.applicationId).database.adapter;
    const [object] = await adapter._rawFind('MyClass', {});
    expect(object.date instanceof Date).toBeTrue();
    expect(object.bar.date instanceof Date).toBeTrue();
    expect(object.foo.test.date instanceof Date).toBeTrue();
  });

  it('handles nested dates in array ', async () => {
    await new Parse.Object('MyClass', {
      foo: {
        test: {
          date: [new Date()],
        },
      },
      bar: {
        date: [new Date()],
      },
      date: [new Date()],
    }).save();
    const adapter = Config.get(Parse.applicationId).database.adapter;
    const [object] = await adapter._rawFind('MyClass', {});
    expect(object.date[0] instanceof Date).toBeTrue();
    expect(object.bar.date[0] instanceof Date).toBeTrue();
    expect(object.foo.test.date[0] instanceof Date).toBeTrue();
    const obj = await new Parse.Query('MyClass').first({ useMasterKey: true });
    expect(obj.get('date')[0] instanceof Date).toBeTrue();
    expect(obj.get('bar').date[0] instanceof Date).toBeTrue();
    expect(obj.get('foo').test.date[0] instanceof Date).toBeTrue();
  });

  it('upserts with $setOnInsert', async () => {
    const uuid = require('uuid');
    const uuid1 = uuid.v4();
    const uuid2 = uuid.v4();
    const schema = {
      className: 'MyClass',
      fields: {
        x: { type: 'Number' },
        count: { type: 'Number' },
      },
      classLevelPermissions: {},
    };

    const myClassSchema = new Parse.Schema(schema.className);
    myClassSchema.setCLP(schema.classLevelPermissions);
    await myClassSchema.save();

    const query = {
      x: 1,
    };
    const update = {
      objectId: {
        __op: 'SetOnInsert',
        amount: uuid1,
      },
      count: {
        __op: 'Increment',
        amount: 1,
      },
    };
    await Parse.Server.database.update('MyClass', query, update, { upsert: true });
    update.objectId.amount = uuid2;
    await Parse.Server.database.update('MyClass', query, update, { upsert: true });

    const res = await Parse.Server.database.find(schema.className, {}, {});
    expect(res.length).toBe(1);
    expect(res[0].objectId).toBe(uuid1);
    expect(res[0].count).toBe(2);
    expect(res[0].x).toBe(1);
  });

  it('handles updating a single object with array, object date', done => {
    const adapter = new MongoStorageAdapter({ uri: databaseURI });

    const schema = {
      fields: {
        array: { type: 'Array' },
        object: { type: 'Object' },
        date: { type: 'Date' },
      },
    };

    adapter
      .createObject('MyClass', schema, {})
      .then(() => adapter._rawFind('MyClass', {}))
      .then(results => {
        expect(results.length).toEqual(1);
        const update = {
          array: [1, 2, 3],
          object: { foo: 'bar' },
          date: {
            __type: 'Date',
            iso: '2016-05-26T20:55:01.154Z',
          },
        };
        const query = {};
        return adapter.findOneAndUpdate('MyClass', schema, query, update);
      })
      .then(results => {
        const mob = results;
        expect(mob.array instanceof Array).toBe(true);
        expect(typeof mob.object).toBe('object');
        expect(mob.date.__type).toBe('Date');
        expect(mob.date.iso).toBe('2016-05-26T20:55:01.154Z');
        return adapter._rawFind('MyClass', {});
      })
      .then(results => {
        expect(results.length).toEqual(1);
        const mob = results[0];
        expect(mob.array instanceof Array).toBe(true);
        expect(typeof mob.object).toBe('object');
        expect(mob.date instanceof Date).toBe(true);
        done();
      })
      .catch(error => {
        console.log(error);
        fail();
        done();
      });
  });

  it('handleShutdown, close connection', async () => {
    const adapter = new MongoStorageAdapter({ uri: databaseURI });

    const schema = {
      fields: {
        array: { type: 'Array' },
        object: { type: 'Object' },
        date: { type: 'Date' },
      },
    };

    await adapter.createObject('MyClass', schema, {});
    const status = await adapter.database.admin().serverStatus();
    expect(status.connections.current > 0).toEqual(true);

    await adapter.handleShutdown();
    try {
      await adapter.database.admin().serverStatus();
      expect(false).toBe(true);
    } catch (e) {
      expect(e.message).toEqual('Client must be connected before running operations');
    }
  });

  it('getClass if exists', async () => {
    const adapter = new MongoStorageAdapter({ uri: databaseURI });

    const schema = {
      fields: {
        array: { type: 'Array' },
        object: { type: 'Object' },
        date: { type: 'Date' },
      },
    };

    await adapter.createClass('MyClass', schema);
    const myClassSchema = await adapter.getClass('MyClass');
    expect(myClassSchema).toBeDefined();
  });

  it('getClass if not exists', async () => {
    const adapter = new MongoStorageAdapter({ uri: databaseURI });
    await expectAsync(adapter.getClass('UnknownClass')).toBeRejectedWith(undefined);
  });

  it_only_mongodb_version('<5.1 || >=6')('should use index for caseInsensitive query', async () => {
    const user = new Parse.User();
    user.set('username', 'Bugs');
    user.set('password', 'Bunny');
    await user.signUp();

    const database = Config.get(Parse.applicationId).database;
    await database.adapter.dropAllIndexes('_User');

    const preIndexPlan = await database.find(
      '_User',
      { username: 'bugs' },
      { caseInsensitive: true, explain: true }
    );

    const schema = await new Parse.Schema('_User').get();

    await database.adapter.ensureIndex(
      '_User',
      schema,
      ['username'],
      'case_insensitive_username',
      true
    );

    const postIndexPlan = await database.find(
      '_User',
      { username: 'bugs' },
      { caseInsensitive: true, explain: true }
    );
    expect(preIndexPlan.executionStats.executionStages.stage).toBe('COLLSCAN');
    expect(postIndexPlan.executionStats.executionStages.stage).toBe('FETCH');
  });

  it('should delete field without index', async () => {
    const database = Config.get(Parse.applicationId).database;
    const obj = new Parse.Object('MyObject');
    obj.set('test', 1);
    await obj.save();
    const schemaBeforeDeletion = await new Parse.Schema('MyObject').get();
    await database.adapter.deleteFields('MyObject', schemaBeforeDeletion, ['test']);
    const schemaAfterDeletion = await new Parse.Schema('MyObject').get();
    expect(schemaBeforeDeletion.fields.test).toBeDefined();
    expect(schemaAfterDeletion.fields.test).toBeUndefined();
  });

  it('should delete field with index', async () => {
    const database = Config.get(Parse.applicationId).database;
    const obj = new Parse.Object('MyObject');
    obj.set('test', 1);
    await obj.save();
    const schemaBeforeDeletion = await new Parse.Schema('MyObject').get();
    await database.adapter.ensureIndex('MyObject', schemaBeforeDeletion, ['test']);
    await database.adapter.deleteFields('MyObject', schemaBeforeDeletion, ['test']);
    const schemaAfterDeletion = await new Parse.Schema('MyObject').get();
    expect(schemaBeforeDeletion.fields.test).toBeDefined();
    expect(schemaAfterDeletion.fields.test).toBeUndefined();
  });

  if (process.env.MONGODB_TOPOLOGY === 'replicaset') {
    describe('transactions', () => {
      const headers = {
        'Content-Type': 'application/json',
        'X-Parse-Application-Id': 'test',
        'X-Parse-REST-API-Key': 'rest',
      };

      beforeEach(async () => {
        await reconfigureServer({
          databaseAdapter: undefined,
          databaseURI:
            'mongodb://localhost:27017/parseServerMongoAdapterTestDatabase?replicaSet=replicaset',
        });
        await TestUtils.destroyAllDataPermanently(true);
      });

      it('should use transaction in a batch with transaction = true', async () => {
        const myObject = new Parse.Object('MyObject');
        await myObject.save();

        spyOn(Collection.prototype, 'findOneAndUpdate').and.callThrough();

        await request({
          method: 'POST',
          headers: headers,
          url: 'http://localhost:8378/1/batch',
          body: JSON.stringify({
            requests: [
              {
                method: 'PUT',
                path: '/1/classes/MyObject/' + myObject.id,
                body: { myAttribute: 'myValue' },
              },
            ],
            transaction: true,
          }),
        });

        let found = false;
        Collection.prototype.findOneAndUpdate.calls.all().forEach(call => {
          found = true;
          expect(call.args[2].session.transaction.state).toBe('TRANSACTION_COMMITTED');
        });
        expect(found).toBe(true);
      });

      it('should not use transaction in a batch with transaction = false', async () => {
        const myObject = new Parse.Object('MyObject');
        await myObject.save();

        spyOn(Collection.prototype, 'findOneAndUpdate').and.callThrough();

        await request({
          method: 'POST',
          headers: headers,
          url: 'http://localhost:8378/1/batch',
          body: JSON.stringify({
            requests: [
              {
                method: 'PUT',
                path: '/1/classes/MyObject/' + myObject.id,
                body: { myAttribute: 'myValue' },
              },
            ],
            transaction: false,
          }),
        });

        let found = false;
        Collection.prototype.findOneAndUpdate.calls.all().forEach(call => {
          found = true;
          expect(call.args[2].session).toBeFalsy();
        });
        expect(found).toBe(true);
      });

      it('should not use transaction in a batch with no transaction option sent', async () => {
        const myObject = new Parse.Object('MyObject');
        await myObject.save();

        spyOn(Collection.prototype, 'findOneAndUpdate').and.callThrough();

        await request({
          method: 'POST',
          headers: headers,
          url: 'http://localhost:8378/1/batch',
          body: JSON.stringify({
            requests: [
              {
                method: 'PUT',
                path: '/1/classes/MyObject/' + myObject.id,
                body: { myAttribute: 'myValue' },
              },
            ],
          }),
        });

        let found = false;
        Collection.prototype.findOneAndUpdate.calls.all().forEach(call => {
          found = true;
          expect(call.args[2].session).toBeFalsy();
        });
        expect(found).toBe(true);
      });

      it('should not use transaction in a put request', async () => {
        const myObject = new Parse.Object('MyObject');
        await myObject.save();

        spyOn(Collection.prototype, 'findOneAndUpdate').and.callThrough();

        await request({
          method: 'PUT',
          headers: headers,
          url: 'http://localhost:8378/1/classes/MyObject/' + myObject.id,
          body: { myAttribute: 'myValue' },
        });

        let found = false;
        Collection.prototype.findOneAndUpdate.calls.all().forEach(call => {
          found = true;
          expect(call.args[2].session).toBeFalsy();
        });
        expect(found).toBe(true);
      });

      it('should not use transactions when using SDK insert', async () => {
        spyOn(Collection.prototype, 'insertOne').and.callThrough();

        const myObject = new Parse.Object('MyObject');
        await myObject.save();

        const calls = Collection.prototype.insertOne.calls.all();
        expect(calls.length).toBeGreaterThan(0);
        calls.forEach(call => {
          expect(call.args[1].session).toBeFalsy();
        });
      });

      it('should not use transactions when using SDK update', async () => {
        spyOn(Collection.prototype, 'findOneAndUpdate').and.callThrough();

        const myObject = new Parse.Object('MyObject');
        await myObject.save();

        myObject.set('myAttribute', 'myValue');
        await myObject.save();

        const calls = Collection.prototype.findOneAndUpdate.calls.all();
        expect(calls.length).toBeGreaterThan(0);
        calls.forEach(call => {
          expect(call.args[2].session).toBeFalsy();
        });
      });

      it('should not use transactions when using SDK delete', async () => {
        spyOn(Collection.prototype, 'deleteMany').and.callThrough();

        const myObject = new Parse.Object('MyObject');
        await myObject.save();

        await myObject.destroy();

        const calls = Collection.prototype.deleteMany.calls.all();
        expect(calls.length).toBeGreaterThan(0);
        calls.forEach(call => {
          expect(call.args[1].session).toBeFalsy();
        });
      });
    });

    describe('watch _SCHEMA', () => {
      it('should change', async done => {
        const adapter = new MongoStorageAdapter({
          uri: databaseURI,
          collectionPrefix: '',
          mongoOptions: { enableSchemaHooks: true },
        });
        await reconfigureServer({ databaseAdapter: adapter });
        expect(adapter.enableSchemaHooks).toBe(true);
        spyOn(adapter, '_onchange');
        const schema = {
          fields: {
            array: { type: 'Array' },
            object: { type: 'Object' },
            date: { type: 'Date' },
          },
        };

        await adapter.createClass('Stuff', schema);
        const myClassSchema = await adapter.getClass('Stuff');
        expect(myClassSchema).toBeDefined();
        setTimeout(() => {
          expect(adapter._onchange).toHaveBeenCalled();
          done();
        }, 5000);
      });
    });
  }

  describe('index creation options', () => {
    beforeEach(async () => {
      await new MongoStorageAdapter({ uri: databaseURI }).deleteAllClasses();
    });

    async function getIndexes(collectionName) {
      const adapter = Config.get(Parse.applicationId).database.adapter;
      const collections = await adapter.database.listCollections({ name: collectionName }).toArray();
      if (collections.length === 0) {
        return [];
      }
      return await adapter.database.collection(collectionName).indexes();
    }

    it('should skip username index when createIndexUserUsername is false', async () => {
      await reconfigureServer({
        databaseAdapter: undefined,
        databaseURI,
        databaseOptions: { createIndexUserUsername: false },
      });
      const indexes = await getIndexes('_User');
      expect(indexes.find(idx => idx.name === 'username_1')).toBeUndefined();
    });

    it('should create username index when createIndexUserUsername is true', async () => {
      await reconfigureServer({
        databaseAdapter: undefined,
        databaseURI,
        databaseOptions: { createIndexUserUsername: true },
      });
      const indexes = await getIndexes('_User');
      expect(indexes.find(idx => idx.name === 'username_1')).toBeDefined();
    });

    it('should skip case-insensitive username index when createIndexUserUsernameCaseInsensitive is false', async () => {
      await reconfigureServer({
        databaseAdapter: undefined,
        databaseURI,
        databaseOptions: { createIndexUserUsernameCaseInsensitive: false },
      });
      const indexes = await getIndexes('_User');
      expect(indexes.find(idx => idx.name === 'case_insensitive_username')).toBeUndefined();
    });

    it('should create case-insensitive username index when createIndexUserUsernameCaseInsensitive is true', async () => {
      await reconfigureServer({
        databaseAdapter: undefined,
        databaseURI,
        databaseOptions: { createIndexUserUsernameCaseInsensitive: true },
      });
      const indexes = await getIndexes('_User');
      expect(indexes.find(idx => idx.name === 'case_insensitive_username')).toBeDefined();
    });

    it('should skip email index when createIndexUserEmail is false', async () => {
      await reconfigureServer({
        databaseAdapter: undefined,
        databaseURI,
        databaseOptions: { createIndexUserEmail: false },
      });
      const indexes = await getIndexes('_User');
      expect(indexes.find(idx => idx.name === 'email_1')).toBeUndefined();
    });

    it('should create email index when createIndexUserEmail is true', async () => {
      await reconfigureServer({
        databaseAdapter: undefined,
        databaseURI,
        databaseOptions: { createIndexUserEmail: true },
      });
      const indexes = await getIndexes('_User');
      expect(indexes.find(idx => idx.name === 'email_1')).toBeDefined();
    });

    it('should skip case-insensitive email index when createIndexUserEmailCaseInsensitive is false', async () => {
      await reconfigureServer({
        databaseAdapter: undefined,
        databaseURI,
        databaseOptions: { createIndexUserEmailCaseInsensitive: false },
      });
      const indexes = await getIndexes('_User');
      expect(indexes.find(idx => idx.name === 'case_insensitive_email')).toBeUndefined();
    });

    it('should create case-insensitive email index when createIndexUserEmailCaseInsensitive is true', async () => {
      await reconfigureServer({
        databaseAdapter: undefined,
        databaseURI,
        databaseOptions: { createIndexUserEmailCaseInsensitive: true },
      });
      const indexes = await getIndexes('_User');
      expect(indexes.find(idx => idx.name === 'case_insensitive_email')).toBeDefined();
    });

    it('should skip email verify token index when createIndexUserEmailVerifyToken is false', async () => {
      await reconfigureServer({
        databaseAdapter: undefined,
        databaseURI,
        databaseOptions: { createIndexUserEmailVerifyToken: false },
      });
      const indexes = await getIndexes('_User');
      expect(indexes.find(idx => idx.name === '_email_verify_token' || idx.name === '_email_verify_token_1')).toBeUndefined();
    });

    it('should create email verify token index when createIndexUserEmailVerifyToken is true', async () => {
      await reconfigureServer({
        databaseAdapter: undefined,
        databaseURI,
        databaseOptions: { createIndexUserEmailVerifyToken: true },
      });
      const indexes = await getIndexes('_User');
      expect(indexes.find(idx => idx.name === '_email_verify_token' || idx.name === '_email_verify_token_1')).toBeDefined();
    });

    it('should skip password reset token index when createIndexUserPasswordResetToken is false', async () => {
      await reconfigureServer({
        databaseAdapter: undefined,
        databaseURI,
        databaseOptions: { createIndexUserPasswordResetToken: false },
      });
      const indexes = await getIndexes('_User');
      expect(indexes.find(idx => idx.name === '_perishable_token' || idx.name === '_perishable_token_1')).toBeUndefined();
    });

    it('should create password reset token index when createIndexUserPasswordResetToken is true', async () => {
      await reconfigureServer({
        databaseAdapter: undefined,
        databaseURI,
        databaseOptions: { createIndexUserPasswordResetToken: true },
      });
      const indexes = await getIndexes('_User');
      expect(indexes.find(idx => idx.name === '_perishable_token' || idx.name === '_perishable_token_1')).toBeDefined();
    });

    it('should skip role name index when createIndexRoleName is false', async () => {
      await reconfigureServer({
        databaseAdapter: undefined,
        databaseURI,
        databaseOptions: { createIndexRoleName: false },
      });
      const indexes = await getIndexes('_Role');
      expect(indexes.find(idx => idx.name === 'name_1')).toBeUndefined();
    });

    it('should create role name index when createIndexRoleName is true', async () => {
      await reconfigureServer({
        databaseAdapter: undefined,
        databaseURI,
        databaseOptions: { createIndexRoleName: true },
      });
      const indexes = await getIndexes('_Role');
      expect(indexes.find(idx => idx.name === 'name_1')).toBeDefined();
    });

    it('should create all indexes by default when options are undefined', async () => {
      await reconfigureServer({
        databaseAdapter: undefined,
        databaseURI,
        databaseOptions: {},
      });

      const userIndexes = await getIndexes('_User');
      const roleIndexes = await getIndexes('_Role');

      // Verify all indexes are created with default behavior (backward compatibility)
      expect(userIndexes.find(idx => idx.name === 'username_1')).toBeDefined();
      expect(userIndexes.find(idx => idx.name === 'case_insensitive_username')).toBeDefined();
      expect(userIndexes.find(idx => idx.name === 'email_1')).toBeDefined();
      expect(userIndexes.find(idx => idx.name === 'case_insensitive_email')).toBeDefined();
      expect(userIndexes.find(idx => idx.name === '_email_verify_token' || idx.name === '_email_verify_token_1')).toBeDefined();
      expect(userIndexes.find(idx => idx.name === '_perishable_token' || idx.name === '_perishable_token_1')).toBeDefined();
      expect(roleIndexes.find(idx => idx.name === 'name_1')).toBeDefined();
    });
  });

  describe('logClientEvents', () => {
    it('should log MongoDB client events when configured', async () => {
      const logger = require('../lib/logger').logger;
      const logSpy = spyOn(logger, 'warn');

      const logClientEvents = [
        {
          name: 'serverDescriptionChanged',
          keys: ['address'],
          logLevel: 'warn',
        },
      ];

      const adapter = new MongoStorageAdapter({
        uri: databaseURI,
        mongoOptions: { logClientEvents },
      });

      // Connect to trigger event listeners setup
      await adapter.connect();

      // Manually trigger the event to test the listener
      const mockEvent = {
        address: 'localhost:27017',
        previousDescription: { type: 'Unknown' },
        newDescription: { type: 'Standalone' },
      };

      adapter.client.emit('serverDescriptionChanged', mockEvent);

      // Verify the log was called with the correct message
      expect(logSpy).toHaveBeenCalledWith(
        jasmine.stringMatching(/MongoDB client event serverDescriptionChanged:.*"address":"localhost:27017"/)
      );

      await adapter.handleShutdown();
    });

    it('should log entire event when keys are not specified', async () => {
      const logger = require('../lib/logger').logger;
      const logSpy = spyOn(logger, 'info');

      const logClientEvents = [
        {
          name: 'connectionPoolReady',
          logLevel: 'info',
        },
      ];

      const adapter = new MongoStorageAdapter({
        uri: databaseURI,
        mongoOptions: { logClientEvents },
      });

      await adapter.connect();

      const mockEvent = {
        address: 'localhost:27017',
        options: { maxPoolSize: 100 },
      };

      adapter.client.emit('connectionPoolReady', mockEvent);

      expect(logSpy).toHaveBeenCalledWith(
        jasmine.stringMatching(/MongoDB client event connectionPoolReady:.*"address":"localhost:27017".*"options"/)
      );

      await adapter.handleShutdown();
    });

    it('should extract nested keys using dot notation', async () => {
      const logger = require('../lib/logger').logger;
      const logSpy = spyOn(logger, 'warn');

      const logClientEvents = [
        {
          name: 'topologyDescriptionChanged',
          keys: ['previousDescription.type', 'newDescription.type', 'newDescription.servers.size'],
          logLevel: 'warn',
        },
      ];

      const adapter = new MongoStorageAdapter({
        uri: databaseURI,
        mongoOptions: { logClientEvents },
      });

      await adapter.connect();

      const mockEvent = {
        topologyId: 1,
        previousDescription: { type: 'Unknown' },
        newDescription: {
          type: 'ReplicaSetWithPrimary',
          servers: { size: 3 },
        },
      };

      adapter.client.emit('topologyDescriptionChanged', mockEvent);

      expect(logSpy).toHaveBeenCalledWith(
        jasmine.stringMatching(/MongoDB client event topologyDescriptionChanged:.*"previousDescription.type":"Unknown".*"newDescription.type":"ReplicaSetWithPrimary".*"newDescription.servers.size":3/)
      );

      await adapter.handleShutdown();
    });

    it('should handle invalid log level gracefully', async () => {
      const logger = require('../lib/logger').logger;
      const infoSpy = spyOn(logger, 'info');

      const logClientEvents = [
        {
          name: 'connectionPoolReady',
          keys: ['address'],
          logLevel: 'invalidLogLevel', // Invalid log level
        },
      ];

      const adapter = new MongoStorageAdapter({
        uri: databaseURI,
        mongoOptions: { logClientEvents },
      });

      await adapter.connect();

      const mockEvent = {
        address: 'localhost:27017',
      };

      adapter.client.emit('connectionPoolReady', mockEvent);

      // Should fallback to 'info' level
      expect(infoSpy).toHaveBeenCalledWith(
        jasmine.stringMatching(/MongoDB client event connectionPoolReady:.*"address":"localhost:27017"/)
      );

      await adapter.handleShutdown();
    });

    it('should handle Map and Set instances in events', async () => {
      const logger = require('../lib/logger').logger;
      const warnSpy = spyOn(logger, 'warn');

      const logClientEvents = [
        {
          name: 'customEvent',
          logLevel: 'warn',
        },
      ];

      const adapter = new MongoStorageAdapter({
        uri: databaseURI,
        mongoOptions: { logClientEvents },
      });

      await adapter.connect();

      const mockEvent = {
        mapData: new Map([['key1', 'value1'], ['key2', 'value2']]),
        setData: new Set([1, 2, 3]),
      };

      adapter.client.emit('customEvent', mockEvent);

      // Should serialize Map and Set properly
      expect(warnSpy).toHaveBeenCalledWith(
        jasmine.stringMatching(/MongoDB client event customEvent:.*"mapData":\{"key1":"value1","key2":"value2"\}.*"setData":\[1,2,3\]/)
      );

      await adapter.handleShutdown();
    });

    it('should handle missing keys in event object', async () => {
      const logger = require('../lib/logger').logger;
      const infoSpy = spyOn(logger, 'info');

      const logClientEvents = [
        {
          name: 'testEvent',
          keys: ['nonexistent.nested.key', 'another.missing'],
          logLevel: 'info',
        },
      ];

      const adapter = new MongoStorageAdapter({
        uri: databaseURI,
        mongoOptions: { logClientEvents },
      });

      await adapter.connect();

      const mockEvent = {
        actualField: 'value',
      };

      adapter.client.emit('testEvent', mockEvent);

      // Should handle missing keys gracefully with undefined values
      expect(infoSpy).toHaveBeenCalledWith(
        jasmine.stringMatching(/MongoDB client event testEvent:/)
      );

      await adapter.handleShutdown();
    });

    it('should handle circular references gracefully', async () => {
      const logger = require('../lib/logger').logger;
      const infoSpy = spyOn(logger, 'info');

      const logClientEvents = [
        {
          name: 'circularEvent',
          logLevel: 'info',
        },
      ];

      const adapter = new MongoStorageAdapter({
        uri: databaseURI,
        mongoOptions: { logClientEvents },
      });

      await adapter.connect();

      // Create circular reference
      const mockEvent = { name: 'test' };
      mockEvent.self = mockEvent;

      adapter.client.emit('circularEvent', mockEvent);

      // Should handle circular reference with [Circular] marker
      expect(infoSpy).toHaveBeenCalledWith(
        jasmine.stringMatching(/MongoDB client event circularEvent:.*\[Circular\]/)
      );

      await adapter.handleShutdown();
    });
  });

  describe('transient error handling', () => {
    it('should transform MongoWaitQueueTimeoutError to Parse.Error.INTERNAL_SERVER_ERROR', async () => {
      const adapter = new MongoStorageAdapter({ uri: databaseURI });
      await adapter.connect();

      // Create a mock error with the MongoWaitQueueTimeoutError name
      const mockError = new Error('Timed out while checking out a connection from connection pool');
      mockError.name = 'MongoWaitQueueTimeoutError';

      try {
        adapter.handleError(mockError);
        fail('Expected handleError to throw');
      } catch (error) {
        expect(error instanceof Parse.Error).toBe(true);
        expect(error.code).toBe(Parse.Error.INTERNAL_SERVER_ERROR);
        expect(error.message).toBe('Database error');
      }
    });

    it('should transform MongoServerSelectionError to Parse.Error.INTERNAL_SERVER_ERROR', async () => {
      const adapter = new MongoStorageAdapter({ uri: databaseURI });
      await adapter.connect();

      const mockError = new Error('Server selection timed out');
      mockError.name = 'MongoServerSelectionError';

      try {
        adapter.handleError(mockError);
        fail('Expected handleError to throw');
      } catch (error) {
        expect(error instanceof Parse.Error).toBe(true);
        expect(error.code).toBe(Parse.Error.INTERNAL_SERVER_ERROR);
        expect(error.message).toBe('Database error');
      }
    });

    it('should transform MongoNetworkTimeoutError to Parse.Error.INTERNAL_SERVER_ERROR', async () => {
      const adapter = new MongoStorageAdapter({ uri: databaseURI });
      await adapter.connect();

      const mockError = new Error('Network timeout');
      mockError.name = 'MongoNetworkTimeoutError';

      try {
        adapter.handleError(mockError);
        fail('Expected handleError to throw');
      } catch (error) {
        expect(error instanceof Parse.Error).toBe(true);
        expect(error.code).toBe(Parse.Error.INTERNAL_SERVER_ERROR);
        expect(error.message).toBe('Database error');
      }
    });

    it('should transform MongoNetworkError to Parse.Error.INTERNAL_SERVER_ERROR', async () => {
      const adapter = new MongoStorageAdapter({ uri: databaseURI });
      await adapter.connect();

      const mockError = new Error('Network error');
      mockError.name = 'MongoNetworkError';

      try {
        adapter.handleError(mockError);
        fail('Expected handleError to throw');
      } catch (error) {
        expect(error instanceof Parse.Error).toBe(true);
        expect(error.code).toBe(Parse.Error.INTERNAL_SERVER_ERROR);
        expect(error.message).toBe('Database error');
      }
    });

    it('should transform TransientTransactionError to Parse.Error.INTERNAL_SERVER_ERROR', async () => {
      const adapter = new MongoStorageAdapter({ uri: databaseURI });
      await adapter.connect();

      const mockError = new Error('Transient transaction error');
      mockError.hasErrorLabel = label => label === 'TransientTransactionError';

      try {
        adapter.handleError(mockError);
        fail('Expected handleError to throw');
      } catch (error) {
        expect(error instanceof Parse.Error).toBe(true);
        expect(error.code).toBe(Parse.Error.INTERNAL_SERVER_ERROR);
        expect(error.message).toBe('Database error');
      }
    });

    it('should not transform non-transient errors', async () => {
      const adapter = new MongoStorageAdapter({ uri: databaseURI });
      await adapter.connect();

      const mockError = new Error('Some other error');
      mockError.name = 'SomeOtherError';

      try {
        adapter.handleError(mockError);
        fail('Expected handleError to throw');
      } catch (error) {
        expect(error instanceof Parse.Error).toBe(false);
        expect(error.message).toBe('Some other error');
      }
    });

    it('should handle null/undefined errors', async () => {
      const adapter = new MongoStorageAdapter({ uri: databaseURI });
      await adapter.connect();

      try {
        adapter.handleError(null);
        fail('Expected handleError to throw');
      } catch (error) {
        expect(error).toBeNull();
      }

      try {
        adapter.handleError(undefined);
        fail('Expected handleError to throw');
      } catch (error) {
        expect(error).toBeUndefined();
      }
    });
  });

  describe('MongoDB Client Metadata', () => {
    it('should not pass metadata to MongoClient by default', async () => {
      const adapter = new MongoStorageAdapter({ uri: databaseURI });
      await adapter.connect();
      const driverInfo = adapter.client.s.options.driverInfo;
      // Either driverInfo should be undefined, or it should not contain our custom metadata
      if (driverInfo) {
        expect(driverInfo.name).toBeUndefined();
      }
      await adapter.handleShutdown();
    });

    it('should pass custom metadata to MongoClient when configured', async () => {
      const customMetadata = { name: 'MyParseServer', version: '1.0.0' };
      const adapter = new MongoStorageAdapter({
        uri: databaseURI,
        mongoOptions: { clientMetadata: customMetadata }
      });
      await adapter.connect();
      expect(adapter.client.s.options.driverInfo.name).toBe(customMetadata.name);
      expect(adapter.client.s.options.driverInfo.version).toBe(customMetadata.version);
      await adapter.handleShutdown();
    });
  });
});
