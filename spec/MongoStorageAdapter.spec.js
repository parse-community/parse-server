'use strict';

const MongoStorageAdapter = require('../src/Adapters/Storage/Mongo/MongoStorageAdapter');
const MongoClient = require('mongodb').MongoClient;
const databaseURI = 'mongodb://localhost:27017/parseServerMongoAdapterTestDatabase';

// These tests are specific to the mongo storage adapter + mongo storage format
// and will eventually be moved into their own repo
describe('MongoStorageAdapter', () => {
  beforeEach(done => {
    new MongoStorageAdapter({ uri: databaseURI })
    .deleteAllSchemas()
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
    let adapter = new MongoStorageAdapter({ uri: databaseURI });
    adapter.createObject('Foo', { objectId: 'abcde' }, { fields: { objectId: 'String' } })
    .then(() => adapter._rawFind('Foo', {}))
    .then(results => {
      expect(results.length).toEqual(1);
      var obj = results[0];
      expect(typeof obj._id).toEqual('string');
      expect(obj.objectId).toBeUndefined();
      done();
    });
  });

  it('stores pointers with a _p_ prefix', (done) => {
    let obj = {
      objectId: 'bar',
      aPointer: {
        __type: 'Pointer',
        className: 'JustThePointer',
        objectId: 'qwerty'
      }
    };
    let adapter = new MongoStorageAdapter({ uri: databaseURI });
    adapter.createObject('APointerDarkly', obj, { fields: {
      objectId: { type: 'String' },
      aPointer: { type: 'Pointer', targetClass: 'JustThePointer' },
    }})
    .then(() => adapter._rawFind('APointerDarkly', {}))
    .then(results => {
      expect(results.length).toEqual(1);
      let output = results[0];
      expect(typeof output._id).toEqual('string');
      expect(typeof output._p_aPointer).toEqual('string');
      expect(output._p_aPointer).toEqual('JustThePointer$qwerty');
      expect(output.aPointer).toBeUndefined();
      done();
    });
  });

  it('handles object and subdocument', done => {
    let adapter = new MongoStorageAdapter({ uri: databaseURI });
    let schema = { fields : { subdoc: { type: 'Object' } } };
    let obj = { subdoc: {foo: 'bar', wu: 'tan'} };
    adapter.createObject('MyClass', obj, schema)
    .then(() => adapter._rawFind('MyClass', {}))
    .then(results => {
      expect(results.length).toEqual(1);
      let mob = results[0];
      expect(typeof mob.subdoc).toBe('object');
      expect(mob.subdoc.foo).toBe('bar');
      expect(mob.subdoc.wu).toBe('tan');
      let obj = { 'subdoc.wu': 'clan' };
      return adapter.findOneAndUpdate('MyClass', {}, schema, obj);
    })
    .then(() => adapter._rawFind('MyClass', {}))
    .then(results => {
      expect(results.length).toEqual(1);
      let mob = results[0];
      expect(typeof mob.subdoc).toBe('object');
      expect(mob.subdoc.foo).toBe('bar');
      expect(mob.subdoc.wu).toBe('clan');
      done();
    });
  });
});
