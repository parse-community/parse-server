'use strict';

const Parse = require('parse/node');
const ReadPreference = require('mongodb').ReadPreference;
const request = require('../lib/request');
const Config = require('../lib/Config');

function waitForReplication() {
  return new Promise(function (resolve) {
    setTimeout(resolve, 300);
  });
}

describe_only_db('mongo')('Read preference option', () => {
  it('should find in primary by default', done => {
    const databaseAdapter = Config.get(Parse.applicationId).database.adapter;

    const obj0 = new Parse.Object('MyObject');
    obj0.set('boolKey', false);
    const obj1 = new Parse.Object('MyObject');
    obj1.set('boolKey', true);

    Parse.Object.saveAll([obj0, obj1])
      .then(() => {
        spyOn(databaseAdapter.database.serverConfig, 'cursor').and.callThrough();

        const query = new Parse.Query('MyObject');
        query.equalTo('boolKey', false);

        return query.find().then(results => {
          expect(results.length).toBe(1);
          expect(results[0].get('boolKey')).toBe(false);
          let myObjectReadPreference = null;
          databaseAdapter.database.serverConfig.cursor.calls.all().forEach(call => {
            if (call.args[0].ns.collection.indexOf('MyObject') >= 0) {
              myObjectReadPreference = true;
              expect(call.args[0].options.readPreference.mode).toBe(ReadPreference.PRIMARY);
            }
          });

          expect(myObjectReadPreference).toBe(true);

          done();
        });
      })
      .catch(done.fail);
  });

  xit('should preserve the read preference set (#4831)', async () => {
    const { MongoStorageAdapter } = require('../lib/Adapters/Storage/Mongo/MongoStorageAdapter');
    const adapterOptions = {
      uri: 'mongodb://localhost:27017/parseServerMongoAdapterTestDatabase',
      mongoOptions: {
        readPreference: ReadPreference.NEAREST,
      },
    };
    await reconfigureServer({
      databaseAdapter: new MongoStorageAdapter(adapterOptions),
    });

    const databaseAdapter = Config.get(Parse.applicationId).database.adapter;

    const obj0 = new Parse.Object('MyObject');
    obj0.set('boolKey', false);
    const obj1 = new Parse.Object('MyObject');
    obj1.set('boolKey', true);

    await Parse.Object.saveAll([obj0, obj1]);
    spyOn(databaseAdapter.database.serverConfig, 'cursor').and.callThrough();

    const query = new Parse.Query('MyObject');
    query.equalTo('boolKey', false);

    const results = await query.find();
    expect(results.length).toBe(1);
    expect(results[0].get('boolKey')).toBe(false);

    let myObjectReadPreference = null;
    databaseAdapter.database.serverConfig.cursor.calls.all().forEach(call => {
      if (call.args[0].ns.collection.indexOf('MyObject') >= 0) {
        myObjectReadPreference = true;
        expect(call.args[0].options.readPreference.mode).toBe(ReadPreference.NEAREST);
      }
    });

    expect(myObjectReadPreference).toBe(true);
  });

  it('should change read preference in the beforeFind trigger', async () => {
    const databaseAdapter = Config.get(Parse.applicationId).database.adapter;

    const obj0 = new Parse.Object('MyObject');
    obj0.set('boolKey', false);
    const obj1 = new Parse.Object('MyObject');
    obj1.set('boolKey', true);

    await Parse.Object.saveAll([obj0, obj1]);
    spyOn(databaseAdapter.database.serverConfig, 'cursor').and.callThrough();

    Parse.Cloud.beforeFind('MyObject', req => {
      req.readPreference = 'SECONDARY';
    });
    await waitForReplication();

    const query = new Parse.Query('MyObject');
    query.equalTo('boolKey', false);

    const results = await query.find();
    expect(results.length).toBe(1);
    expect(results[0].get('boolKey')).toBe(false);

    let myObjectReadPreference = null;
    databaseAdapter.database.serverConfig.cursor.calls.all().forEach(call => {
      if (call.args[0].ns.collection.indexOf('MyObject') >= 0) {
        myObjectReadPreference = call.args[0].options.readPreference.mode;
      }
    });

    expect(myObjectReadPreference).toEqual(ReadPreference.SECONDARY);
  });

  it('should check read preference as case insensitive', async () => {
    const databaseAdapter = Config.get(Parse.applicationId).database.adapter;

    const obj0 = new Parse.Object('MyObject');
    obj0.set('boolKey', false);
    const obj1 = new Parse.Object('MyObject');
    obj1.set('boolKey', true);

    await Parse.Object.saveAll([obj0, obj1]);
    spyOn(databaseAdapter.database.serverConfig, 'cursor').and.callThrough();

    Parse.Cloud.beforeFind('MyObject', req => {
      req.readPreference = 'sEcOnDarY';
    });

    await waitForReplication();

    const query = new Parse.Query('MyObject');
    query.equalTo('boolKey', false);

    const results = await query.find();
    expect(results.length).toBe(1);
    expect(results[0].get('boolKey')).toBe(false);

    let myObjectReadPreference = null;
    databaseAdapter.database.serverConfig.cursor.calls.all().forEach(call => {
      if (call.args[0].ns.collection.indexOf('MyObject') >= 0) {
        myObjectReadPreference = call.args[0].options.readPreference.mode;
      }
    });

    expect(myObjectReadPreference).toEqual(ReadPreference.SECONDARY);
  });

  it('should change read preference in the beforeFind trigger even changing query', async () => {
    const databaseAdapter = Config.get(Parse.applicationId).database.adapter;

    const obj0 = new Parse.Object('MyObject');
    obj0.set('boolKey', false);
    const obj1 = new Parse.Object('MyObject');
    obj1.set('boolKey', true);

    await Parse.Object.saveAll([obj0, obj1]);
    spyOn(databaseAdapter.database.serverConfig, 'cursor').and.callThrough();

    Parse.Cloud.beforeFind('MyObject', req => {
      req.query.equalTo('boolKey', true);
      req.readPreference = 'SECONDARY';
    });
    await waitForReplication();

    const query = new Parse.Query('MyObject');
    query.equalTo('boolKey', false);

    const results = await query.find();
    expect(results.length).toBe(1);
    expect(results[0].get('boolKey')).toBe(true);

    let myObjectReadPreference = null;
    databaseAdapter.database.serverConfig.cursor.calls.all().forEach(call => {
      if (call.args[0].ns.collection.indexOf('MyObject') >= 0) {
        myObjectReadPreference = call.args[0].options.readPreference.mode;
      }
    });

    expect(myObjectReadPreference).toEqual(ReadPreference.SECONDARY);
  });

  it('should change read preference in the beforeFind trigger even returning query', async () => {
    const databaseAdapter = Config.get(Parse.applicationId).database.adapter;

    const obj0 = new Parse.Object('MyObject');
    obj0.set('boolKey', false);
    const obj1 = new Parse.Object('MyObject');
    obj1.set('boolKey', true);

    await Parse.Object.saveAll([obj0, obj1]);
    spyOn(databaseAdapter.database.serverConfig, 'cursor').and.callThrough();

    Parse.Cloud.beforeFind('MyObject', req => {
      req.readPreference = 'SECONDARY';

      const otherQuery = new Parse.Query('MyObject');
      otherQuery.equalTo('boolKey', true);
      return otherQuery;
    });

    await waitForReplication();

    const query = new Parse.Query('MyObject');
    query.equalTo('boolKey', false);

    const results = await query.find();
    expect(results.length).toBe(1);
    expect(results[0].get('boolKey')).toBe(true);

    let myObjectReadPreference = null;
    databaseAdapter.database.serverConfig.cursor.calls.all().forEach(call => {
      if (call.args[0].ns.collection.indexOf('MyObject') >= 0) {
        myObjectReadPreference = call.args[0].options.readPreference.mode;
      }
    });

    expect(myObjectReadPreference).toEqual(ReadPreference.SECONDARY);
  });

  it('should change read preference in the beforeFind trigger even returning promise', async () => {
    const databaseAdapter = Config.get(Parse.applicationId).database.adapter;

    const obj0 = new Parse.Object('MyObject');
    obj0.set('boolKey', false);
    const obj1 = new Parse.Object('MyObject');
    obj1.set('boolKey', true);

    await Parse.Object.saveAll([obj0, obj1]);
    spyOn(databaseAdapter.database.serverConfig, 'cursor').and.callThrough();

    Parse.Cloud.beforeFind('MyObject', req => {
      req.readPreference = 'SECONDARY';

      const otherQuery = new Parse.Query('MyObject');
      otherQuery.equalTo('boolKey', true);
      return Promise.resolve(otherQuery);
    });
    await waitForReplication();

    const query = new Parse.Query('MyObject');
    query.equalTo('boolKey', false);

    const results = await query.find();
    expect(results.length).toBe(1);
    expect(results[0].get('boolKey')).toBe(true);

    let myObjectReadPreference = null;
    databaseAdapter.database.serverConfig.cursor.calls.all().forEach(call => {
      if (call.args[0].ns.collection.indexOf('MyObject') >= 0) {
        myObjectReadPreference = call.args[0].options.readPreference.mode;
      }
    });

    expect(myObjectReadPreference).toEqual(ReadPreference.SECONDARY);
  });

  it('should change read preference to PRIMARY_PREFERRED', async () => {
    const databaseAdapter = Config.get(Parse.applicationId).database.adapter;

    const obj0 = new Parse.Object('MyObject');
    obj0.set('boolKey', false);
    const obj1 = new Parse.Object('MyObject');
    obj1.set('boolKey', true);

    await Parse.Object.saveAll([obj0, obj1]);
    spyOn(databaseAdapter.database.serverConfig, 'cursor').and.callThrough();

    Parse.Cloud.beforeFind('MyObject', req => {
      req.readPreference = 'PRIMARY_PREFERRED';
    });
    await waitForReplication();

    const query = new Parse.Query('MyObject');
    query.equalTo('boolKey', false);

    const results = await query.find();
    expect(results.length).toBe(1);
    expect(results[0].get('boolKey')).toBe(false);

    let myObjectReadPreference = null;
    databaseAdapter.database.serverConfig.cursor.calls.all().forEach(call => {
      if (call.args[0].ns.collection.indexOf('MyObject') >= 0) {
        myObjectReadPreference = call.args[0].options.readPreference.mode;
      }
    });

    expect(myObjectReadPreference).toEqual(ReadPreference.PRIMARY_PREFERRED);
  });

  it('should change read preference to SECONDARY_PREFERRED', async () => {
    const databaseAdapter = Config.get(Parse.applicationId).database.adapter;

    const obj0 = new Parse.Object('MyObject');
    obj0.set('boolKey', false);
    const obj1 = new Parse.Object('MyObject');
    obj1.set('boolKey', true);

    await Parse.Object.saveAll([obj0, obj1]);
    spyOn(databaseAdapter.database.serverConfig, 'cursor').and.callThrough();

    Parse.Cloud.beforeFind('MyObject', req => {
      req.readPreference = 'SECONDARY_PREFERRED';
    });
    await waitForReplication();

    const query = new Parse.Query('MyObject');
    query.equalTo('boolKey', false);

    const results = await query.find();
    expect(results.length).toBe(1);
    expect(results[0].get('boolKey')).toBe(false);

    let myObjectReadPreference = null;
    databaseAdapter.database.serverConfig.cursor.calls.all().forEach(call => {
      if (call.args[0].ns.collection.indexOf('MyObject') >= 0) {
        myObjectReadPreference = call.args[0].options.readPreference.mode;
      }
    });

    expect(myObjectReadPreference).toEqual(ReadPreference.SECONDARY_PREFERRED);
  });

  it('should change read preference to NEAREST', async () => {
    const databaseAdapter = Config.get(Parse.applicationId).database.adapter;

    const obj0 = new Parse.Object('MyObject');
    obj0.set('boolKey', false);
    const obj1 = new Parse.Object('MyObject');
    obj1.set('boolKey', true);

    await Parse.Object.saveAll([obj0, obj1]);
    spyOn(databaseAdapter.database.serverConfig, 'cursor').and.callThrough();

    Parse.Cloud.beforeFind('MyObject', req => {
      req.readPreference = 'NEAREST';
    });
    await waitForReplication();

    const query = new Parse.Query('MyObject');
    query.equalTo('boolKey', false);

    const results = await query.find();
    expect(results.length).toBe(1);
    expect(results[0].get('boolKey')).toBe(false);

    let myObjectReadPreference = null;
    databaseAdapter.database.serverConfig.cursor.calls.all().forEach(call => {
      if (call.args[0].ns.collection.indexOf('MyObject') >= 0) {
        myObjectReadPreference = call.args[0].options.readPreference.mode;
      }
    });

    expect(myObjectReadPreference).toEqual(ReadPreference.NEAREST);
  });

  it('should change read preference for GET', async () => {
    const databaseAdapter = Config.get(Parse.applicationId).database.adapter;

    const obj0 = new Parse.Object('MyObject');
    obj0.set('boolKey', false);
    const obj1 = new Parse.Object('MyObject');
    obj1.set('boolKey', true);

    await Parse.Object.saveAll([obj0, obj1]);
    spyOn(databaseAdapter.database.serverConfig, 'cursor').and.callThrough();

    Parse.Cloud.beforeFind('MyObject', req => {
      req.readPreference = 'SECONDARY';
    });
    await waitForReplication();

    const query = new Parse.Query('MyObject');

    const result = await query.get(obj0.id);
    expect(result.get('boolKey')).toBe(false);

    let myObjectReadPreference = null;
    databaseAdapter.database.serverConfig.cursor.calls.all().forEach(call => {
      if (call.args[0].ns.collection.indexOf('MyObject') >= 0) {
        myObjectReadPreference = call.args[0].options.readPreference.mode;
      }
    });

    expect(myObjectReadPreference).toEqual(ReadPreference.SECONDARY);
  });

  it('should change read preference for GET using API', async () => {
    const databaseAdapter = Config.get(Parse.applicationId).database.adapter;

    const obj0 = new Parse.Object('MyObject');
    obj0.set('boolKey', false);
    const obj1 = new Parse.Object('MyObject');
    obj1.set('boolKey', true);

    await Parse.Object.saveAll([obj0, obj1]);
    spyOn(databaseAdapter.database.serverConfig, 'cursor').and.callThrough();

    Parse.Cloud.beforeFind('MyObject', req => {
      req.readPreference = 'SECONDARY';
    });
    await waitForReplication();

    const response = await request({
      method: 'GET',
      url: 'http://localhost:8378/1/classes/MyObject/' + obj0.id,
      headers: {
        'X-Parse-Application-Id': 'test',
        'X-Parse-REST-API-Key': 'rest',
      },
      json: true,
    });
    const body = response.data;
    expect(body.boolKey).toBe(false);

    let myObjectReadPreference = null;
    databaseAdapter.database.serverConfig.cursor.calls.all().forEach(call => {
      if (call.args[0].ns.collection.indexOf('MyObject') >= 0) {
        myObjectReadPreference = call.args[0].options.readPreference.mode;
      }
    });

    expect(myObjectReadPreference).toEqual(ReadPreference.SECONDARY);
  });

  it('should change read preference for GET directly from API', async () => {
    const databaseAdapter = Config.get(Parse.applicationId).database.adapter;

    const obj0 = new Parse.Object('MyObject');
    obj0.set('boolKey', false);
    const obj1 = new Parse.Object('MyObject');
    obj1.set('boolKey', true);

    await Parse.Object.saveAll([obj0, obj1]);
    spyOn(databaseAdapter.database.serverConfig, 'cursor').and.callThrough();
    await waitForReplication();

    const response = await request({
      method: 'GET',
      url: 'http://localhost:8378/1/classes/MyObject/' + obj0.id + '?readPreference=SECONDARY',
      headers: {
        'X-Parse-Application-Id': 'test',
        'X-Parse-REST-API-Key': 'rest',
      },
      json: true,
    });
    expect(response.data.boolKey).toBe(false);

    let myObjectReadPreference = null;
    databaseAdapter.database.serverConfig.cursor.calls.all().forEach(call => {
      if (call.args[0].ns.collection.indexOf('MyObject') >= 0) {
        myObjectReadPreference = call.args[0].options.readPreference.mode;
      }
    });

    expect(myObjectReadPreference).toEqual(ReadPreference.SECONDARY);
  });

  it('should change read preference for GET using API through the beforeFind overriding API option', async () => {
    const databaseAdapter = Config.get(Parse.applicationId).database.adapter;

    const obj0 = new Parse.Object('MyObject');
    obj0.set('boolKey', false);
    const obj1 = new Parse.Object('MyObject');
    obj1.set('boolKey', true);

    await Parse.Object.saveAll([obj0, obj1]);
    spyOn(databaseAdapter.database.serverConfig, 'cursor').and.callThrough();

    Parse.Cloud.beforeFind('MyObject', req => {
      req.readPreference = 'SECONDARY_PREFERRED';
    });
    await waitForReplication();

    const response = await request({
      method: 'GET',
      url: 'http://localhost:8378/1/classes/MyObject/' + obj0.id + '?readPreference=SECONDARY',
      headers: {
        'X-Parse-Application-Id': 'test',
        'X-Parse-REST-API-Key': 'rest',
      },
      json: true,
    });
    expect(response.data.boolKey).toBe(false);

    let myObjectReadPreference = null;
    databaseAdapter.database.serverConfig.cursor.calls.all().forEach(call => {
      if (call.args[0].ns.collection.indexOf('MyObject') >= 0) {
        myObjectReadPreference = call.args[0].options.readPreference.mode;
      }
    });

    expect(myObjectReadPreference).toEqual(ReadPreference.SECONDARY_PREFERRED);
  });

  it('should change read preference for FIND using API through beforeFind trigger', async () => {
    const databaseAdapter = Config.get(Parse.applicationId).database.adapter;

    const obj0 = new Parse.Object('MyObject');
    obj0.set('boolKey', false);
    const obj1 = new Parse.Object('MyObject');
    obj1.set('boolKey', true);

    await Parse.Object.saveAll([obj0, obj1]);
    spyOn(databaseAdapter.database.serverConfig, 'cursor').and.callThrough();

    Parse.Cloud.beforeFind('MyObject', req => {
      req.readPreference = 'SECONDARY';
    });
    await waitForReplication();

    const response = await request({
      method: 'GET',
      url: 'http://localhost:8378/1/classes/MyObject/',
      headers: {
        'X-Parse-Application-Id': 'test',
        'X-Parse-REST-API-Key': 'rest',
      },
      json: true,
    });
    expect(response.data.results.length).toEqual(2);

    let myObjectReadPreference = null;
    databaseAdapter.database.serverConfig.cursor.calls.all().forEach(call => {
      if (call.args[0].ns.collection.indexOf('MyObject') >= 0) {
        myObjectReadPreference = call.args[0].options.readPreference.mode;
      }
    });

    expect(myObjectReadPreference).toEqual(ReadPreference.SECONDARY);
  });

  it('should change read preference for FIND directly from API', async () => {
    const databaseAdapter = Config.get(Parse.applicationId).database.adapter;

    const obj0 = new Parse.Object('MyObject');
    obj0.set('boolKey', false);
    const obj1 = new Parse.Object('MyObject');
    obj1.set('boolKey', true);

    await Parse.Object.saveAll([obj0, obj1]);
    spyOn(databaseAdapter.database.serverConfig, 'cursor').and.callThrough();
    await waitForReplication();

    const response = await request({
      method: 'GET',
      url: 'http://localhost:8378/1/classes/MyObject?readPreference=SECONDARY',
      headers: {
        'X-Parse-Application-Id': 'test',
        'X-Parse-REST-API-Key': 'rest',
      },
      json: true,
    });
    expect(response.data.results.length).toEqual(2);

    let myObjectReadPreference = null;
    databaseAdapter.database.serverConfig.cursor.calls.all().forEach(call => {
      if (call.args[0].ns.collection.indexOf('MyObject') >= 0) {
        myObjectReadPreference = call.args[0].options.readPreference.mode;
      }
    });

    expect(myObjectReadPreference).toEqual(ReadPreference.SECONDARY);
  });

  it('should change read preference for FIND using API through the beforeFind overriding API option', async () => {
    const databaseAdapter = Config.get(Parse.applicationId).database.adapter;

    const obj0 = new Parse.Object('MyObject');
    obj0.set('boolKey', false);
    const obj1 = new Parse.Object('MyObject');
    obj1.set('boolKey', true);

    await Parse.Object.saveAll([obj0, obj1]);
    spyOn(databaseAdapter.database.serverConfig, 'cursor').and.callThrough();

    Parse.Cloud.beforeFind('MyObject', req => {
      req.readPreference = 'SECONDARY_PREFERRED';
    });
    await waitForReplication();

    const response = await request({
      method: 'GET',
      url: 'http://localhost:8378/1/classes/MyObject/?readPreference=SECONDARY',
      headers: {
        'X-Parse-Application-Id': 'test',
        'X-Parse-REST-API-Key': 'rest',
      },
      json: true,
    });
    expect(response.data.results.length).toEqual(2);

    let myObjectReadPreference = null;
    databaseAdapter.database.serverConfig.cursor.calls.all().forEach(call => {
      if (call.args[0].ns.collection.indexOf('MyObject') >= 0) {
        myObjectReadPreference = call.args[0].options.readPreference.mode;
      }
    });

    expect(myObjectReadPreference).toEqual(ReadPreference.SECONDARY_PREFERRED);
  });

  xit('should change read preference for count', done => {
    const databaseAdapter = Config.get(Parse.applicationId).database.adapter;

    const obj0 = new Parse.Object('MyObject');
    obj0.set('boolKey', false);
    const obj1 = new Parse.Object('MyObject');
    obj1.set('boolKey', true);

    Parse.Object.saveAll([obj0, obj1]).then(() => {
      spyOn(databaseAdapter.database.serverConfig, 'cursor').and.callThrough();

      Parse.Cloud.beforeFind('MyObject', req => {
        req.readPreference = 'SECONDARY';
      });

      const query = new Parse.Query('MyObject');
      query.equalTo('boolKey', false);

      query
        .count()
        .then(result => {
          expect(result).toBe(1);

          let myObjectReadPreference = null;
          databaseAdapter.database.serverConfig.cursor.calls.all().forEach(call => {
            if (call.args[0].ns.collection.indexOf('MyObject') >= 0) {
              myObjectReadPreference = call.args[0].options.readPreference.mode;
            }
          });

          expect(myObjectReadPreference).toEqual(ReadPreference.SECONDARY);

          done();
        })
        .catch(done.fail);
    });
  });

  it('should change read preference for `aggregate` using `beforeFind`', async () => {
    // Save objects
    const obj0 = new Parse.Object('MyObject');
    obj0.set('boolKey', false);
    const obj1 = new Parse.Object('MyObject');
    obj1.set('boolKey', true);
    await Parse.Object.saveAll([obj0, obj1]);
    // Add trigger
    Parse.Cloud.beforeFind('MyObject', req => {
      req.readPreference = 'SECONDARY';
    });
    await waitForReplication();

    // Spy on DB adapter
    const databaseAdapter = Config.get(Parse.applicationId).database.adapter;
    spyOn(databaseAdapter.database.serverConfig, 'startSession').and.callThrough();
    // Query
    const query = new Parse.Query('MyObject');
    const results = await query.aggregate([{ match: { boolKey: false } }]);
    // Validate
    expect(results.length).toBe(1);
    let readPreference = null;
    databaseAdapter.database.serverConfig.startSession.calls.all().forEach(call => {
      if (call.args[0].owner.ns.indexOf('MyObject') > -1) {
        readPreference = call.args[0].owner.operation.readPreference.mode;
      }
    });
    expect(readPreference).toEqual(ReadPreference.SECONDARY);
  });

  it('should change read preference for `find` using query option', async () => {
    // Save objects
    const obj0 = new Parse.Object('MyObject');
    obj0.set('boolKey', false);
    const obj1 = new Parse.Object('MyObject');
    obj1.set('boolKey', true);
    await Parse.Object.saveAll([obj0, obj1]);
    await waitForReplication();

    // Spy on DB adapter
    const databaseAdapter = Config.get(Parse.applicationId).database.adapter;
    spyOn(databaseAdapter.database.serverConfig, 'cursor').and.callThrough();
    // Query
    const query = new Parse.Query('MyObject');
    query.equalTo('boolKey', false);
    query.readPreference('SECONDARY');
    const results = await query.find();
    // Validate
    expect(results.length).toBe(1);
    let myObjectReadPreference = null;
    databaseAdapter.database.serverConfig.cursor.calls.all().forEach(call => {
      if (call.args[0].ns.collection.indexOf('MyObject') >= 0) {
        myObjectReadPreference = call.args[0].options.readPreference.mode;
      }
    });
    expect(myObjectReadPreference).toEqual(ReadPreference.SECONDARY);
  });

  it('should change read preference for `aggregate` using query option', async () => {
    // Save objects
    const obj0 = new Parse.Object('MyObject');
    obj0.set('boolKey', false);
    const obj1 = new Parse.Object('MyObject');
    obj1.set('boolKey', true);
    await Parse.Object.saveAll([obj0, obj1]);
    await waitForReplication();

    // Spy on DB adapter
    const databaseAdapter = Config.get(Parse.applicationId).database.adapter;
    spyOn(databaseAdapter.database.serverConfig, 'startSession').and.callThrough();
    // Query
    const query = new Parse.Query('MyObject');
    query.readPreference('SECONDARY');
    const results = await query.aggregate([{ match: { boolKey: false } }]);
    // Validate
    expect(results.length).toBe(1);
    let readPreference = null;
    databaseAdapter.database.serverConfig.startSession.calls.all().forEach(call => {
      if (call.args[0].owner.ns.indexOf('MyObject') > -1) {
        readPreference = call.args[0].owner.operation.readPreference.mode;
      }
    });
    expect(readPreference).toEqual(ReadPreference.SECONDARY);
  });

  it('should find includes in same replica of readPreference by default', async () => {
    const databaseAdapter = Config.get(Parse.applicationId).database.adapter;

    const obj0 = new Parse.Object('MyObject0');
    obj0.set('boolKey', false);
    const obj1 = new Parse.Object('MyObject1');
    obj1.set('boolKey', true);
    obj1.set('myObject0', obj0);
    const obj2 = new Parse.Object('MyObject2');
    obj2.set('boolKey', false);
    obj2.set('myObject1', obj1);

    await Parse.Object.saveAll([obj0, obj1, obj2]);
    spyOn(databaseAdapter.database.serverConfig, 'cursor').and.callThrough();

    Parse.Cloud.beforeFind('MyObject2', req => {
      req.readPreference = 'SECONDARY';
    });
    await waitForReplication();

    const query = new Parse.Query('MyObject2');
    query.equalTo('boolKey', false);
    query.include('myObject1');
    query.include('myObject1.myObject0');

    const results = await query.find();
    expect(results.length).toBe(1);
    const firstResult = results[0];
    expect(firstResult.get('boolKey')).toBe(false);
    expect(firstResult.get('myObject1').get('boolKey')).toBe(true);
    expect(firstResult.get('myObject1').get('myObject0').get('boolKey')).toBe(false);

    let myObjectReadPreference0 = null;
    let myObjectReadPreference1 = null;
    let myObjectReadPreference2 = null;
    databaseAdapter.database.serverConfig.cursor.calls.all().forEach(call => {
      if (call.args[0].ns.collection.indexOf('MyObject0') >= 0) {
        myObjectReadPreference0 = call.args[0].options.readPreference.mode;
      }
      if (call.args[0].ns.collection.indexOf('MyObject1') >= 0) {
        myObjectReadPreference1 = call.args[0].options.readPreference.mode;
      }
      if (call.args[0].ns.collection.indexOf('MyObject2') >= 0) {
        myObjectReadPreference2 = call.args[0].options.readPreference.mode;
      }
    });

    expect(myObjectReadPreference0).toEqual(ReadPreference.SECONDARY);
    expect(myObjectReadPreference1).toEqual(ReadPreference.SECONDARY);
    expect(myObjectReadPreference2).toEqual(ReadPreference.SECONDARY);
  });

  it('should change includes read preference', async () => {
    const databaseAdapter = Config.get(Parse.applicationId).database.adapter;

    const obj0 = new Parse.Object('MyObject0');
    obj0.set('boolKey', false);
    const obj1 = new Parse.Object('MyObject1');
    obj1.set('boolKey', true);
    obj1.set('myObject0', obj0);
    const obj2 = new Parse.Object('MyObject2');
    obj2.set('boolKey', false);
    obj2.set('myObject1', obj1);

    await Parse.Object.saveAll([obj0, obj1, obj2]);
    spyOn(databaseAdapter.database.serverConfig, 'cursor').and.callThrough();

    Parse.Cloud.beforeFind('MyObject2', req => {
      req.readPreference = 'SECONDARY_PREFERRED';
      req.includeReadPreference = 'SECONDARY';
    });
    await waitForReplication();

    const query = new Parse.Query('MyObject2');
    query.equalTo('boolKey', false);
    query.include('myObject1');
    query.include('myObject1.myObject0');

    const results = await query.find();
    expect(results.length).toBe(1);
    const firstResult = results[0];
    expect(firstResult.get('boolKey')).toBe(false);
    expect(firstResult.get('myObject1').get('boolKey')).toBe(true);
    expect(firstResult.get('myObject1').get('myObject0').get('boolKey')).toBe(false);

    let myObjectReadPreference0 = null;
    let myObjectReadPreference1 = null;
    let myObjectReadPreference2 = null;
    databaseAdapter.database.serverConfig.cursor.calls.all().forEach(call => {
      if (call.args[0].ns.collection.indexOf('MyObject0') >= 0) {
        myObjectReadPreference0 = call.args[0].options.readPreference.mode;
      }
      if (call.args[0].ns.collection.indexOf('MyObject1') >= 0) {
        myObjectReadPreference1 = call.args[0].options.readPreference.mode;
      }
      if (call.args[0].ns.collection.indexOf('MyObject2') >= 0) {
        myObjectReadPreference2 = call.args[0].options.readPreference.mode;
      }
    });

    expect(myObjectReadPreference0).toEqual(ReadPreference.SECONDARY);
    expect(myObjectReadPreference1).toEqual(ReadPreference.SECONDARY);
    expect(myObjectReadPreference2).toEqual(ReadPreference.SECONDARY_PREFERRED);
  });

  it('should change includes read preference when finding through API', async () => {
    const databaseAdapter = Config.get(Parse.applicationId).database.adapter;

    const obj0 = new Parse.Object('MyObject0');
    obj0.set('boolKey', false);
    const obj1 = new Parse.Object('MyObject1');
    obj1.set('boolKey', true);
    obj1.set('myObject0', obj0);
    const obj2 = new Parse.Object('MyObject2');
    obj2.set('boolKey', false);
    obj2.set('myObject1', obj1);

    await Parse.Object.saveAll([obj0, obj1, obj2]);
    spyOn(databaseAdapter.database.serverConfig, 'cursor').and.callThrough();
    await waitForReplication();

    const response = await request({
      method: 'GET',
      url:
        'http://localhost:8378/1/classes/MyObject2/' +
        obj2.id +
        '?include=' +
        JSON.stringify(['myObject1', 'myObject1.myObject0']) +
        '&readPreference=SECONDARY_PREFERRED&includeReadPreference=SECONDARY',
      headers: {
        'X-Parse-Application-Id': 'test',
        'X-Parse-REST-API-Key': 'rest',
      },
      json: true,
    });
    const firstResult = response.data;
    expect(firstResult.boolKey).toBe(false);
    expect(firstResult.myObject1.boolKey).toBe(true);
    expect(firstResult.myObject1.myObject0.boolKey).toBe(false);

    let myObjectReadPreference0 = null;
    let myObjectReadPreference1 = null;
    let myObjectReadPreference2 = null;
    databaseAdapter.database.serverConfig.cursor.calls.all().forEach(call => {
      if (call.args[0].ns.collection.indexOf('MyObject0') >= 0) {
        myObjectReadPreference0 = call.args[0].options.readPreference.mode;
      }
      if (call.args[0].ns.collection.indexOf('MyObject1') >= 0) {
        myObjectReadPreference1 = call.args[0].options.readPreference.mode;
      }
      if (call.args[0].ns.collection.indexOf('MyObject2') >= 0) {
        myObjectReadPreference2 = call.args[0].options.readPreference.mode;
      }
    });

    expect(myObjectReadPreference0).toEqual(ReadPreference.SECONDARY);
    expect(myObjectReadPreference1).toEqual(ReadPreference.SECONDARY);
    expect(myObjectReadPreference2).toEqual(ReadPreference.SECONDARY_PREFERRED);
  });

  it('should change includes read preference when getting through API', async () => {
    const databaseAdapter = Config.get(Parse.applicationId).database.adapter;

    const obj0 = new Parse.Object('MyObject0');
    obj0.set('boolKey', false);
    const obj1 = new Parse.Object('MyObject1');
    obj1.set('boolKey', true);
    obj1.set('myObject0', obj0);
    const obj2 = new Parse.Object('MyObject2');
    obj2.set('boolKey', false);
    obj2.set('myObject1', obj1);

    await Parse.Object.saveAll([obj0, obj1, obj2]);
    spyOn(databaseAdapter.database.serverConfig, 'cursor').and.callThrough();
    await waitForReplication();

    const response = await request({
      method: 'GET',
      url:
        'http://localhost:8378/1/classes/MyObject2?where=' +
        JSON.stringify({ boolKey: false }) +
        '&include=' +
        JSON.stringify(['myObject1', 'myObject1.myObject0']) +
        '&readPreference=SECONDARY_PREFERRED&includeReadPreference=SECONDARY',
      headers: {
        'X-Parse-Application-Id': 'test',
        'X-Parse-REST-API-Key': 'rest',
      },
      json: true,
    });
    expect(response.data.results.length).toBe(1);
    const firstResult = response.data.results[0];
    expect(firstResult.boolKey).toBe(false);
    expect(firstResult.myObject1.boolKey).toBe(true);
    expect(firstResult.myObject1.myObject0.boolKey).toBe(false);

    let myObjectReadPreference0 = null;
    let myObjectReadPreference1 = null;
    let myObjectReadPreference2 = null;
    databaseAdapter.database.serverConfig.cursor.calls.all().forEach(call => {
      if (call.args[0].ns.collection.indexOf('MyObject0') >= 0) {
        myObjectReadPreference0 = call.args[0].options.readPreference.mode;
      }
      if (call.args[0].ns.collection.indexOf('MyObject1') >= 0) {
        myObjectReadPreference1 = call.args[0].options.readPreference.mode;
      }
      if (call.args[0].ns.collection.indexOf('MyObject2') >= 0) {
        myObjectReadPreference2 = call.args[0].options.readPreference.mode;
      }
    });

    expect(myObjectReadPreference0).toEqual(ReadPreference.SECONDARY);
    expect(myObjectReadPreference1).toEqual(ReadPreference.SECONDARY);
    expect(myObjectReadPreference2).toEqual(ReadPreference.SECONDARY_PREFERRED);
  });

  it('should find subqueries in same replica of readPreference by default', async () => {
    const databaseAdapter = Config.get(Parse.applicationId).database.adapter;

    const obj0 = new Parse.Object('MyObject0');
    obj0.set('boolKey', false);
    const obj1 = new Parse.Object('MyObject1');
    obj1.set('boolKey', true);
    obj1.set('myObject0', obj0);
    const obj2 = new Parse.Object('MyObject2');
    obj2.set('boolKey', false);
    obj2.set('myObject1', obj1);

    await Parse.Object.saveAll([obj0, obj1, obj2]);
    spyOn(databaseAdapter.database.serverConfig, 'cursor').and.callThrough();

    Parse.Cloud.beforeFind('MyObject2', req => {
      req.readPreference = 'SECONDARY';
    });
    await waitForReplication();

    const query0 = new Parse.Query('MyObject0');
    query0.equalTo('boolKey', false);

    const query1 = new Parse.Query('MyObject1');
    query1.matchesQuery('myObject0', query0);

    const query2 = new Parse.Query('MyObject2');
    query2.matchesQuery('myObject1', query1);

    const results = await query2.find();
    expect(results.length).toBe(1);
    expect(results[0].get('boolKey')).toBe(false);

    let myObjectReadPreference0 = null;
    let myObjectReadPreference1 = null;
    let myObjectReadPreference2 = null;
    databaseAdapter.database.serverConfig.cursor.calls.all().forEach(call => {
      if (call.args[0].ns.collection.indexOf('MyObject0') >= 0) {
        myObjectReadPreference0 = call.args[0].options.readPreference.mode;
      }
      if (call.args[0].ns.collection.indexOf('MyObject1') >= 0) {
        myObjectReadPreference1 = call.args[0].options.readPreference.mode;
      }
      if (call.args[0].ns.collection.indexOf('MyObject2') >= 0) {
        myObjectReadPreference2 = call.args[0].options.readPreference.mode;
      }
    });

    expect(myObjectReadPreference0).toEqual(ReadPreference.SECONDARY);
    expect(myObjectReadPreference1).toEqual(ReadPreference.SECONDARY);
    expect(myObjectReadPreference2).toEqual(ReadPreference.SECONDARY);
  });

  it('should change subqueries read preference when using matchesQuery', async () => {
    const databaseAdapter = Config.get(Parse.applicationId).database.adapter;

    const obj0 = new Parse.Object('MyObject0');
    obj0.set('boolKey', false);
    const obj1 = new Parse.Object('MyObject1');
    obj1.set('boolKey', true);
    obj1.set('myObject0', obj0);
    const obj2 = new Parse.Object('MyObject2');
    obj2.set('boolKey', false);
    obj2.set('myObject1', obj1);

    await Parse.Object.saveAll([obj0, obj1, obj2]);
    spyOn(databaseAdapter.database.serverConfig, 'cursor').and.callThrough();

    Parse.Cloud.beforeFind('MyObject2', req => {
      req.readPreference = 'SECONDARY_PREFERRED';
      req.subqueryReadPreference = 'SECONDARY';
    });
    await waitForReplication();

    const query0 = new Parse.Query('MyObject0');
    query0.equalTo('boolKey', false);

    const query1 = new Parse.Query('MyObject1');
    query1.matchesQuery('myObject0', query0);

    const query2 = new Parse.Query('MyObject2');
    query2.matchesQuery('myObject1', query1);

    const results = await query2.find();
    expect(results.length).toBe(1);
    expect(results[0].get('boolKey')).toBe(false);

    let myObjectReadPreference0 = null;
    let myObjectReadPreference1 = null;
    let myObjectReadPreference2 = null;
    databaseAdapter.database.serverConfig.cursor.calls.all().forEach(call => {
      if (call.args[0].ns.collection.indexOf('MyObject0') >= 0) {
        myObjectReadPreference0 = call.args[0].options.readPreference.mode;
      }
      if (call.args[0].ns.collection.indexOf('MyObject1') >= 0) {
        myObjectReadPreference1 = call.args[0].options.readPreference.mode;
      }
      if (call.args[0].ns.collection.indexOf('MyObject2') >= 0) {
        myObjectReadPreference2 = call.args[0].options.readPreference.mode;
      }
    });

    expect(myObjectReadPreference0).toEqual(ReadPreference.SECONDARY);
    expect(myObjectReadPreference1).toEqual(ReadPreference.SECONDARY);
    expect(myObjectReadPreference2).toEqual(ReadPreference.SECONDARY_PREFERRED);
  });

  it('should change subqueries read preference when using doesNotMatchQuery', async () => {
    const databaseAdapter = Config.get(Parse.applicationId).database.adapter;

    const obj0 = new Parse.Object('MyObject0');
    obj0.set('boolKey', false);
    const obj1 = new Parse.Object('MyObject1');
    obj1.set('boolKey', true);
    obj1.set('myObject0', obj0);
    const obj2 = new Parse.Object('MyObject2');
    obj2.set('boolKey', false);
    obj2.set('myObject1', obj1);

    await Parse.Object.saveAll([obj0, obj1, obj2]);
    spyOn(databaseAdapter.database.serverConfig, 'cursor').and.callThrough();

    Parse.Cloud.beforeFind('MyObject2', req => {
      req.readPreference = 'SECONDARY_PREFERRED';
      req.subqueryReadPreference = 'SECONDARY';
    });
    await waitForReplication();

    const query0 = new Parse.Query('MyObject0');
    query0.equalTo('boolKey', false);

    const query1 = new Parse.Query('MyObject1');
    query1.doesNotMatchQuery('myObject0', query0);

    const query2 = new Parse.Query('MyObject2');
    query2.doesNotMatchQuery('myObject1', query1);

    const results = await query2.find();
    expect(results.length).toBe(1);
    expect(results[0].get('boolKey')).toBe(false);

    let myObjectReadPreference0 = null;
    let myObjectReadPreference1 = null;
    let myObjectReadPreference2 = null;
    databaseAdapter.database.serverConfig.cursor.calls.all().forEach(call => {
      if (call.args[0].ns.collection.indexOf('MyObject0') >= 0) {
        myObjectReadPreference0 = call.args[0].options.readPreference.mode;
      }
      if (call.args[0].ns.collection.indexOf('MyObject1') >= 0) {
        myObjectReadPreference1 = call.args[0].options.readPreference.mode;
      }
      if (call.args[0].ns.collection.indexOf('MyObject2') >= 0) {
        myObjectReadPreference2 = call.args[0].options.readPreference.mode;
      }
    });

    expect(myObjectReadPreference0).toEqual(ReadPreference.SECONDARY);
    expect(myObjectReadPreference1).toEqual(ReadPreference.SECONDARY);
    expect(myObjectReadPreference2).toEqual(ReadPreference.SECONDARY_PREFERRED);
  });

  it('should change subqueries read preference when using matchesKeyInQuery and doesNotMatchKeyInQuery', async () => {
    const databaseAdapter = Config.get(Parse.applicationId).database.adapter;

    const obj0 = new Parse.Object('MyObject0');
    obj0.set('boolKey', false);
    const obj1 = new Parse.Object('MyObject1');
    obj1.set('boolKey', true);
    obj1.set('myObject0', obj0);
    const obj2 = new Parse.Object('MyObject2');
    obj2.set('boolKey', false);
    obj2.set('myObject1', obj1);

    await Parse.Object.saveAll([obj0, obj1, obj2]);
    spyOn(databaseAdapter.database.serverConfig, 'cursor').and.callThrough();

    Parse.Cloud.beforeFind('MyObject2', req => {
      req.readPreference = 'SECONDARY_PREFERRED';
      req.subqueryReadPreference = 'SECONDARY';
    });
    await waitForReplication();

    const query0 = new Parse.Query('MyObject0');
    query0.equalTo('boolKey', false);

    const query1 = new Parse.Query('MyObject1');
    query1.equalTo('boolKey', true);

    const query2 = new Parse.Query('MyObject2');
    query2.matchesKeyInQuery('boolKey', 'boolKey', query0);
    query2.doesNotMatchKeyInQuery('boolKey', 'boolKey', query1);

    const results = await query2.find();
    expect(results.length).toBe(1);
    expect(results[0].get('boolKey')).toBe(false);

    let myObjectReadPreference0 = null;
    let myObjectReadPreference1 = null;
    let myObjectReadPreference2 = null;
    databaseAdapter.database.serverConfig.cursor.calls.all().forEach(call => {
      if (call.args[0].ns.collection.indexOf('MyObject0') >= 0) {
        myObjectReadPreference0 = call.args[0].options.readPreference.mode;
      }
      if (call.args[0].ns.collection.indexOf('MyObject1') >= 0) {
        myObjectReadPreference1 = call.args[0].options.readPreference.mode;
      }
      if (call.args[0].ns.collection.indexOf('MyObject2') >= 0) {
        myObjectReadPreference2 = call.args[0].options.readPreference.mode;
      }
    });

    expect(myObjectReadPreference0).toEqual(ReadPreference.SECONDARY);
    expect(myObjectReadPreference1).toEqual(ReadPreference.SECONDARY);
    expect(myObjectReadPreference2).toEqual(ReadPreference.SECONDARY_PREFERRED);
  });

  it('should change subqueries read preference when using matchesKeyInQuery and doesNotMatchKeyInQuery to find through API', async () => {
    const databaseAdapter = Config.get(Parse.applicationId).database.adapter;

    const obj0 = new Parse.Object('MyObject0');
    obj0.set('boolKey', false);
    const obj1 = new Parse.Object('MyObject1');
    obj1.set('boolKey', true);
    obj1.set('myObject0', obj0);
    const obj2 = new Parse.Object('MyObject2');
    obj2.set('boolKey', false);
    obj2.set('myObject1', obj1);

    await Parse.Object.saveAll([obj0, obj1, obj2]);
    spyOn(databaseAdapter.database.serverConfig, 'cursor').and.callThrough();
    await waitForReplication();

    const whereString = JSON.stringify({
      boolKey: {
        $select: {
          query: {
            className: 'MyObject0',
            where: { boolKey: false },
          },
          key: 'boolKey',
        },
        $dontSelect: {
          query: {
            className: 'MyObject1',
            where: { boolKey: true },
          },
          key: 'boolKey',
        },
      },
    });

    const response = await request({
      method: 'GET',
      url:
        'http://localhost:8378/1/classes/MyObject2/?where=' +
        whereString +
        '&readPreference=SECONDARY_PREFERRED&subqueryReadPreference=SECONDARY',
      headers: {
        'X-Parse-Application-Id': 'test',
        'X-Parse-REST-API-Key': 'rest',
      },
      json: true,
    });
    expect(response.data.results.length).toBe(1);
    expect(response.data.results[0].boolKey).toBe(false);

    let myObjectReadPreference0 = null;
    let myObjectReadPreference1 = null;
    let myObjectReadPreference2 = null;
    databaseAdapter.database.serverConfig.cursor.calls.all().forEach(call => {
      if (call.args[0].ns.collection.indexOf('MyObject0') >= 0) {
        myObjectReadPreference0 = call.args[0].options.readPreference.mode;
      }
      if (call.args[0].ns.collection.indexOf('MyObject1') >= 0) {
        myObjectReadPreference1 = call.args[0].options.readPreference.mode;
      }
      if (call.args[0].ns.collection.indexOf('MyObject2') >= 0) {
        myObjectReadPreference2 = call.args[0].options.readPreference.mode;
      }
    });

    expect(myObjectReadPreference0).toEqual(ReadPreference.SECONDARY);
    expect(myObjectReadPreference1).toEqual(ReadPreference.SECONDARY);
    expect(myObjectReadPreference2).toEqual(ReadPreference.SECONDARY_PREFERRED);
  });
});
