'use strict';

const MongoStorageAdapter = require('../src/Adapters/Storage/Mongo/MongoStorageAdapter');
const MongoClient = require('mongodb').MongoClient;
const databaseURI = 'mongodb://localhost:27017/parseServerMongoAdapterTestDatabase';

// These tests are specific to the mongo storage adapter + mongo storage format
// and will eventually be moved into their own repo
describe_only_db('mongo')('MongoStorageAdapter', () => {
  beforeEach(done => {
    new MongoStorageAdapter({ uri: databaseURI })
      .deleteAllClasses()
      .then(done, fail);
  });

  it('auto-escapes symbols in auth information', () => {
    spyOn(MongoClient, 'connect').and.returnValue(Promise.resolve(null));
    new MongoStorageAdapter({
      uri: 'mongodb://user!with@+ symbols:password!with@+ symbols@localhost:1234/parse'
    }).connect();
    expect(MongoClient.connect).toHaveBeenCalledWith(
      'mongodb://user!with%40%2B%20symbols:password!with%40%2B%20symbols@localhost:1234/parse',
      jasmine.any(Object)
    );
  });

  it("doesn't double escape already URI-encoded information", () => {
    spyOn(MongoClient, 'connect').and.returnValue(Promise.resolve(null));
    new MongoStorageAdapter({
      uri: 'mongodb://user!with%40%2B%20symbols:password!with%40%2B%20symbols@localhost:1234/parse'
    }).connect();
    expect(MongoClient.connect).toHaveBeenCalledWith(
      'mongodb://user!with%40%2B%20symbols:password!with%40%2B%20symbols@localhost:1234/parse',
      jasmine.any(Object)
    );
  });

  // https://github.com/ParsePlatform/parse-server/pull/148#issuecomment-180407057
  it('preserves replica sets', () => {
    spyOn(MongoClient, 'connect').and.returnValue(Promise.resolve(null));
    new MongoStorageAdapter({
      uri: 'mongodb://test:testpass@ds056315-a0.mongolab.com:59325,ds059315-a1.mongolab.com:59315/testDBname?replicaSet=rs-ds059415'
    }).connect();
    expect(MongoClient.connect).toHaveBeenCalledWith(
      'mongodb://test:testpass@ds056315-a0.mongolab.com:59325,ds059315-a1.mongolab.com:59315/testDBname?replicaSet=rs-ds059415',
      jasmine.any(Object)
    );
  });

  it('stores objectId in _id', done => {
    const adapter = new MongoStorageAdapter({ uri: databaseURI });
    adapter.createObject('Foo', { fields: {} }, { objectId: 'abcde' })
      .then(() => adapter._rawFind('Foo', {}))
      .then(results => {
        expect(results.length).toEqual(1);
        var obj = results[0];
        expect(obj._id).toEqual('abcde');
        expect(obj.objectId).toBeUndefined();
        done();
      });
  });

  it('find succeeds when query is within maxTimeMS', (done) => {
    const maxTimeMS = 250;
    const adapter = new MongoStorageAdapter({
      uri: databaseURI,
      mongoOptions: { maxTimeMS },
    });
    adapter.createObject('Foo', { fields: {} }, { objectId: 'abcde' })
      .then(() => adapter._rawFind('Foo', { '$where': `sleep(${maxTimeMS / 2})` }))
      .then(
        () => done(),
        (err) => {
          done.fail(`maxTimeMS should not affect fast queries ${err}`);
        }
      );
  })

  it('find fails when query exceeds maxTimeMS', (done) => {
    const maxTimeMS = 250;
    const adapter = new MongoStorageAdapter({
      uri: databaseURI,
      mongoOptions: { maxTimeMS },
    });
    adapter.createObject('Foo', { fields: {} }, { objectId: 'abcde' })
      .then(() => adapter._rawFind('Foo', { '$where': `sleep(${maxTimeMS * 2})` }))
      .then(
        () => {
          done.fail('Find succeeded despite taking too long!');
        },
        (err) => {
          expect(err.name).toEqual('MongoError');
          expect(err.code).toEqual(50);
          expect(err.message).toEqual('operation exceeded time limit');
          done();
        }
      );
  });

  it('stores pointers with a _p_ prefix', (done) => {
    const obj = {
      objectId: 'bar',
      aPointer: {
        __type: 'Pointer',
        className: 'JustThePointer',
        objectId: 'qwerty'
      }
    };
    const adapter = new MongoStorageAdapter({ uri: databaseURI });
    adapter.createObject('APointerDarkly', { fields: {
      objectId: { type: 'String' },
      aPointer: { type: 'Pointer', targetClass: 'JustThePointer' },
    }}, obj)
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
    const schema = { fields : { subdoc: { type: 'Object' } } };
    const obj = { subdoc: {foo: 'bar', wu: 'tan'} };
    adapter.createObject('MyClass', schema, obj)
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

  it('handles creating an array, object, date', (done) => {
    const adapter = new MongoStorageAdapter({ uri: databaseURI });
    const obj = {
      array: [1, 2, 3],
      object: {foo: 'bar'},
      date: {
        __type: 'Date',
        iso: '2016-05-26T20:55:01.154Z',
      },
    };
    const schema = { fields: {
      array: { type: 'Array' },
      object: { type: 'Object' },
      date: { type: 'Date' },
    } };
    adapter.createObject('MyClass', schema, obj)
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

  it("handles updating a single object with array, object date", (done) => {
    const adapter = new MongoStorageAdapter({ uri: databaseURI });

    const schema = { fields: {
      array: { type: 'Array' },
      object: { type: 'Object' },
      date: { type: 'Date' },
    } };


    adapter.createObject('MyClass', schema, {})
      .then(() => adapter._rawFind('MyClass', {}))
      .then(results => {
        expect(results.length).toEqual(1);
        const update = {
          array: [1, 2, 3],
          object: {foo: 'bar'},
          date: {
            __type: 'Date',
            iso: '2016-05-26T20:55:01.154Z',
          },
        };
        const query = {};
        return adapter.findOneAndUpdate('MyClass', schema, query, update)
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
});
