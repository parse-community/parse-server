'use strict'

const Parse = require('parse/node');
const ReadPreference = require('mongodb').ReadPreference;
const rp = require('request-promise');
const Config = require("../src/Config");

describe_only_db('mongo')('Read preference option', () => {
  it('should find in primary by default', (done) => {
    const databaseAdapter = (Config.get(Parse.applicationId)).database.adapter;

    const obj0 = new Parse.Object('MyObject');
    obj0.set('boolKey', false);
    const obj1 = new Parse.Object('MyObject');
    obj1.set('boolKey', true);

    Parse.Object.saveAll([obj0, obj1]).then(() => {
      spyOn(databaseAdapter.database.serverConfig, 'cursor').and.callThrough();

      const query = new Parse.Query('MyObject');
      query.equalTo('boolKey', false);

      query.find().then((results) => {
        expect(results.length).toBe(1);
        expect(results[0].get('boolKey')).toBe(false);

        let myObjectReadPreference = null;
        databaseAdapter.database.serverConfig.cursor.calls.all().forEach((call) => {
          if (call.args[0].indexOf('MyObject') >= 0) {
            myObjectReadPreference = call.args[2].readPreference.preference;
          }
        });

        expect(myObjectReadPreference).toEqual(ReadPreference.PRIMARY);

        done();
      });
    });
  });

  it('should change read preference in the beforeFind trigger', (done) => {
    const databaseAdapter = (Config.get(Parse.applicationId)).database.adapter;

    const obj0 = new Parse.Object('MyObject');
    obj0.set('boolKey', false);
    const obj1 = new Parse.Object('MyObject');
    obj1.set('boolKey', true);

    Parse.Object.saveAll([obj0, obj1]).then(() => {
      spyOn(databaseAdapter.database.serverConfig, 'cursor').and.callThrough();

      Parse.Cloud.beforeFind('MyObject', (req) => {
        req.readPreference = 'SECONDARY';
      });

      const query = new Parse.Query('MyObject');
      query.equalTo('boolKey', false);

      query.find().then((results) => {
        expect(results.length).toBe(1);
        expect(results[0].get('boolKey')).toBe(false);

        let myObjectReadPreference = null;
        databaseAdapter.database.serverConfig.cursor.calls.all().forEach((call) => {
          if (call.args[0].indexOf('MyObject') >= 0) {
            myObjectReadPreference = call.args[2].readPreference.preference;
          }
        });

        expect(myObjectReadPreference).toEqual(ReadPreference.SECONDARY);

        done();
      });
    });
  });

  it('should change read preference in the beforeFind trigger even changing query', (done) => {
    const databaseAdapter = (Config.get(Parse.applicationId)).database.adapter;

    const obj0 = new Parse.Object('MyObject');
    obj0.set('boolKey', false);
    const obj1 = new Parse.Object('MyObject');
    obj1.set('boolKey', true);

    Parse.Object.saveAll([obj0, obj1]).then(() => {
      spyOn(databaseAdapter.database.serverConfig, 'cursor').and.callThrough();

      Parse.Cloud.beforeFind('MyObject', (req) => {
        req.query.equalTo('boolKey', true);
        req.readPreference = 'SECONDARY';
      });

      const query = new Parse.Query('MyObject');
      query.equalTo('boolKey', false);

      query.find().then((results) => {
        expect(results.length).toBe(1);
        expect(results[0].get('boolKey')).toBe(true);

        let myObjectReadPreference = null;
        databaseAdapter.database.serverConfig.cursor.calls.all().forEach((call) => {
          if (call.args[0].indexOf('MyObject') >= 0) {
            myObjectReadPreference = call.args[2].readPreference.preference;
          }
        });

        expect(myObjectReadPreference).toEqual(ReadPreference.SECONDARY);

        done();
      });
    });
  });

  it('should change read preference in the beforeFind trigger even returning query', (done) => {
    const databaseAdapter = (Config.get(Parse.applicationId)).database.adapter;

    const obj0 = new Parse.Object('MyObject');
    obj0.set('boolKey', false);
    const obj1 = new Parse.Object('MyObject');
    obj1.set('boolKey', true);

    Parse.Object.saveAll([obj0, obj1]).then(() => {
      spyOn(databaseAdapter.database.serverConfig, 'cursor').and.callThrough();

      Parse.Cloud.beforeFind('MyObject', (req) => {
        req.readPreference = 'SECONDARY';

        const otherQuery = new Parse.Query('MyObject');
        otherQuery.equalTo('boolKey', true);
        return otherQuery;
      });

      const query = new Parse.Query('MyObject');
      query.equalTo('boolKey', false);

      query.find().then((results) => {
        expect(results.length).toBe(1);
        expect(results[0].get('boolKey')).toBe(true);

        let myObjectReadPreference = null;
        databaseAdapter.database.serverConfig.cursor.calls.all().forEach((call) => {
          if (call.args[0].indexOf('MyObject') >= 0) {
            myObjectReadPreference = call.args[2].readPreference.preference;
          }
        });

        expect(myObjectReadPreference).toEqual(ReadPreference.SECONDARY);

        done();
      });
    });
  });

  it('should change read preference in the beforeFind trigger even returning promise', (done) => {
    const databaseAdapter = (Config.get(Parse.applicationId)).database.adapter;

    const obj0 = new Parse.Object('MyObject');
    obj0.set('boolKey', false);
    const obj1 = new Parse.Object('MyObject');
    obj1.set('boolKey', true);

    Parse.Object.saveAll([obj0, obj1]).then(() => {
      spyOn(databaseAdapter.database.serverConfig, 'cursor').and.callThrough();

      Parse.Cloud.beforeFind('MyObject', (req) => {
        req.readPreference = 'SECONDARY';

        const otherQuery = new Parse.Query('MyObject');
        otherQuery.equalTo('boolKey', true);
        return Promise.resolve(otherQuery);
      });

      const query = new Parse.Query('MyObject');
      query.equalTo('boolKey', false);

      query.find().then((results) => {
        expect(results.length).toBe(1);
        expect(results[0].get('boolKey')).toBe(true);

        let myObjectReadPreference = null;
        databaseAdapter.database.serverConfig.cursor.calls.all().forEach((call) => {
          if (call.args[0].indexOf('MyObject') >= 0) {
            myObjectReadPreference = call.args[2].readPreference.preference;
          }
        });

        expect(myObjectReadPreference).toEqual(ReadPreference.SECONDARY);

        done();
      });
    });
  });

  it('should change read preference to PRIMARY_PREFERRED', (done) => {
    const databaseAdapter = (Config.get(Parse.applicationId)).database.adapter;

    const obj0 = new Parse.Object('MyObject');
    obj0.set('boolKey', false);
    const obj1 = new Parse.Object('MyObject');
    obj1.set('boolKey', true);

    Parse.Object.saveAll([obj0, obj1]).then(() => {
      spyOn(databaseAdapter.database.serverConfig, 'cursor').and.callThrough();

      Parse.Cloud.beforeFind('MyObject', (req) => {
        req.readPreference = 'PRIMARY_PREFERRED';
      });

      const query = new Parse.Query('MyObject');
      query.equalTo('boolKey', false);

      query.find().then((results) => {
        expect(results.length).toBe(1);
        expect(results[0].get('boolKey')).toBe(false);

        let myObjectReadPreference = null;
        databaseAdapter.database.serverConfig.cursor.calls.all().forEach((call) => {
          if (call.args[0].indexOf('MyObject') >= 0) {
            myObjectReadPreference = call.args[2].readPreference.preference;
          }
        });

        expect(myObjectReadPreference).toEqual(ReadPreference.PRIMARY_PREFERRED);

        done();
      });
    });
  });

  it('should change read preference to SECONDARY_PREFERRED', (done) => {
    const databaseAdapter = (Config.get(Parse.applicationId)).database.adapter;

    const obj0 = new Parse.Object('MyObject');
    obj0.set('boolKey', false);
    const obj1 = new Parse.Object('MyObject');
    obj1.set('boolKey', true);

    Parse.Object.saveAll([obj0, obj1]).then(() => {
      spyOn(databaseAdapter.database.serverConfig, 'cursor').and.callThrough();

      Parse.Cloud.beforeFind('MyObject', (req) => {
        req.readPreference = 'SECONDARY_PREFERRED';
      });

      const query = new Parse.Query('MyObject');
      query.equalTo('boolKey', false);

      query.find().then((results) => {
        expect(results.length).toBe(1);
        expect(results[0].get('boolKey')).toBe(false);

        let myObjectReadPreference = null;
        databaseAdapter.database.serverConfig.cursor.calls.all().forEach((call) => {
          if (call.args[0].indexOf('MyObject') >= 0) {
            myObjectReadPreference = call.args[2].readPreference.preference;
          }
        });

        expect(myObjectReadPreference).toEqual(ReadPreference.SECONDARY_PREFERRED);

        done();
      });
    });
  });

  it('should change read preference to NEAREST', (done) => {
    const databaseAdapter = (Config.get(Parse.applicationId)).database.adapter;

    const obj0 = new Parse.Object('MyObject');
    obj0.set('boolKey', false);
    const obj1 = new Parse.Object('MyObject');
    obj1.set('boolKey', true);

    Parse.Object.saveAll([obj0, obj1]).then(() => {
      spyOn(databaseAdapter.database.serverConfig, 'cursor').and.callThrough();

      Parse.Cloud.beforeFind('MyObject', (req) => {
        req.readPreference = 'NEAREST';
      });

      const query = new Parse.Query('MyObject');
      query.equalTo('boolKey', false);

      query.find().then((results) => {
        expect(results.length).toBe(1);
        expect(results[0].get('boolKey')).toBe(false);

        let myObjectReadPreference = null;
        databaseAdapter.database.serverConfig.cursor.calls.all().forEach((call) => {
          if (call.args[0].indexOf('MyObject') >= 0) {
            myObjectReadPreference = call.args[2].readPreference.preference;
          }
        });

        expect(myObjectReadPreference).toEqual(ReadPreference.NEAREST);

        done();
      });
    });
  });

  it('should change read preference for GET', (done) => {
    const databaseAdapter = (Config.get(Parse.applicationId)).database.adapter;

    const obj0 = new Parse.Object('MyObject');
    obj0.set('boolKey', false);
    const obj1 = new Parse.Object('MyObject');
    obj1.set('boolKey', true);

    Parse.Object.saveAll([obj0, obj1]).then(() => {
      spyOn(databaseAdapter.database.serverConfig, 'cursor').and.callThrough();

      Parse.Cloud.beforeFind('MyObject', (req) => {
        req.readPreference = 'SECONDARY';
      });

      const query = new Parse.Query('MyObject');

      query.get(obj0.id).then((result) => {
        expect(result.get('boolKey')).toBe(false);

        let myObjectReadPreference = null;
        databaseAdapter.database.serverConfig.cursor.calls.all().forEach((call) => {
          if (call.args[0].indexOf('MyObject') >= 0) {
            myObjectReadPreference = call.args[2].readPreference.preference;
          }
        });

        expect(myObjectReadPreference).toEqual(ReadPreference.SECONDARY);

        done();
      });
    });
  });

  it('should change read preference for GET using API', (done) => {
    const databaseAdapter = (Config.get(Parse.applicationId)).database.adapter;

    const obj0 = new Parse.Object('MyObject');
    obj0.set('boolKey', false);
    const obj1 = new Parse.Object('MyObject');
    obj1.set('boolKey', true);

    Parse.Object.saveAll([obj0, obj1]).then(() => {
      spyOn(databaseAdapter.database.serverConfig, 'cursor').and.callThrough();

      Parse.Cloud.beforeFind('MyObject', (req) => {
        req.readPreference = 'SECONDARY';
      });

      rp({
        method: 'GET',
        uri: 'http://localhost:8378/1/classes/MyObject/' + obj0.id,
        headers: {
          'X-Parse-Application-Id': 'test',
          'X-Parse-REST-API-Key': 'rest'
        },
        json: true,
      }).then(body => {
        expect(body.boolKey).toBe(false);

        let myObjectReadPreference = null;
        databaseAdapter.database.serverConfig.cursor.calls.all().forEach((call) => {
          if (call.args[0].indexOf('MyObject') >= 0) {
            myObjectReadPreference = call.args[2].readPreference.preference;
          }
        });

        expect(myObjectReadPreference).toEqual(ReadPreference.SECONDARY);

        done();
      });
    });
  });

  it('should change read preference for count', (done) => {
    const databaseAdapter = (Config.get(Parse.applicationId)).database.adapter;

    const obj0 = new Parse.Object('MyObject');
    obj0.set('boolKey', false);
    const obj1 = new Parse.Object('MyObject');
    obj1.set('boolKey', true);

    Parse.Object.saveAll([obj0, obj1]).then(() => {
      spyOn(databaseAdapter.database.serverConfig, 'command').and.callThrough();

      Parse.Cloud.beforeFind('MyObject', (req) => {
        req.readPreference = 'SECONDARY';
      });

      const query = new Parse.Query('MyObject');
      query.equalTo('boolKey', false);

      query.count().then((result) => {
        expect(result).toBe(1);

        let myObjectReadPreference = null;
        databaseAdapter.database.serverConfig.command.calls.all().forEach((call) => {
          myObjectReadPreference = call.args[2].readPreference.preference;
        });

        expect(myObjectReadPreference).toEqual(ReadPreference.SECONDARY);

        done();
      });
    });
  });

  it('should find includes in primary by default', (done) => {
    const databaseAdapter = (Config.get(Parse.applicationId)).database.adapter;

    const obj0 = new Parse.Object('MyObject0');
    obj0.set('boolKey', false);
    const obj1 = new Parse.Object('MyObject1');
    obj1.set('boolKey', true);
    obj1.set('myObject0', obj0);
    const obj2 = new Parse.Object('MyObject2');
    obj2.set('boolKey', false);
    obj2.set('myObject1', obj1);

    Parse.Object.saveAll([obj0, obj1, obj2]).then(() => {
      spyOn(databaseAdapter.database.serverConfig, 'cursor').and.callThrough();

      Parse.Cloud.beforeFind('MyObject2', (req) => {
        req.readPreference = 'SECONDARY';
      });

      const query = new Parse.Query('MyObject2');
      query.equalTo('boolKey', false);
      query.include('myObject1');
      query.include('myObject1.myObject0');

      query.find().then((results) => {
        expect(results.length).toBe(1);
        const firstResult = results[0];
        expect(firstResult.get('boolKey')).toBe(false);
        expect(firstResult.get('myObject1').get('boolKey')).toBe(true);
        expect(firstResult.get('myObject1').get('myObject0').get('boolKey')).toBe(false);

        let myObjectReadPreference0 = null;
        let myObjectReadPreference1 = null;
        let myObjectReadPreference2 = null;
        databaseAdapter.database.serverConfig.cursor.calls.all().forEach((call) => {
          if (call.args[0].indexOf('MyObject0') >= 0) {
            myObjectReadPreference0 = call.args[2].readPreference.preference;
          }
          if (call.args[0].indexOf('MyObject1') >= 0) {
            myObjectReadPreference1 = call.args[2].readPreference.preference;
          }
          if (call.args[0].indexOf('MyObject2') >= 0) {
            myObjectReadPreference2 = call.args[2].readPreference.preference;
          }
        });

        expect(myObjectReadPreference0).toEqual(ReadPreference.PRIMARY);
        expect(myObjectReadPreference1).toEqual(ReadPreference.PRIMARY);
        expect(myObjectReadPreference2).toEqual(ReadPreference.SECONDARY);

        done();
      });
    });
  });

  it('should change includes read preference', (done) => {
    const databaseAdapter = (Config.get(Parse.applicationId)).database.adapter;

    const obj0 = new Parse.Object('MyObject0');
    obj0.set('boolKey', false);
    const obj1 = new Parse.Object('MyObject1');
    obj1.set('boolKey', true);
    obj1.set('myObject0', obj0);
    const obj2 = new Parse.Object('MyObject2');
    obj2.set('boolKey', false);
    obj2.set('myObject1', obj1);

    Parse.Object.saveAll([obj0, obj1, obj2]).then(() => {
      spyOn(databaseAdapter.database.serverConfig, 'cursor').and.callThrough();

      Parse.Cloud.beforeFind('MyObject2', (req) => {
        req.readPreference = 'SECONDARY_PREFERRED';
        req.includeReadPreference = 'SECONDARY';
      });

      const query = new Parse.Query('MyObject2');
      query.equalTo('boolKey', false);
      query.include('myObject1');
      query.include('myObject1.myObject0');

      query.find().then((results) => {
        expect(results.length).toBe(1);
        const firstResult = results[0];
        expect(firstResult.get('boolKey')).toBe(false);
        expect(firstResult.get('myObject1').get('boolKey')).toBe(true);
        expect(firstResult.get('myObject1').get('myObject0').get('boolKey')).toBe(false);


        let myObjectReadPreference0 = null;
        let myObjectReadPreference1 = null;
        let myObjectReadPreference2 = null;
        databaseAdapter.database.serverConfig.cursor.calls.all().forEach((call) => {
          if (call.args[0].indexOf('MyObject0') >= 0) {
            myObjectReadPreference0 = call.args[2].readPreference.preference;
          }
          if (call.args[0].indexOf('MyObject1') >= 0) {
            myObjectReadPreference1 = call.args[2].readPreference.preference;
          }
          if (call.args[0].indexOf('MyObject2') >= 0) {
            myObjectReadPreference2 = call.args[2].readPreference.preference;
          }
        });

        expect(myObjectReadPreference0).toEqual(ReadPreference.SECONDARY);
        expect(myObjectReadPreference1).toEqual(ReadPreference.SECONDARY);
        expect(myObjectReadPreference2).toEqual(ReadPreference.SECONDARY_PREFERRED);

        done();
      });
    });
  });

  it('should find subqueries in primary by default', (done) => {
    const databaseAdapter = (Config.get(Parse.applicationId)).database.adapter;

    const obj0 = new Parse.Object('MyObject0');
    obj0.set('boolKey', false);
    const obj1 = new Parse.Object('MyObject1');
    obj1.set('boolKey', true);
    obj1.set('myObject0', obj0);
    const obj2 = new Parse.Object('MyObject2');
    obj2.set('boolKey', false);
    obj2.set('myObject1', obj1);

    Parse.Object.saveAll([obj0, obj1, obj2]).then(() => {
      spyOn(databaseAdapter.database.serverConfig, 'cursor').and.callThrough();

      Parse.Cloud.beforeFind('MyObject2', (req) => {
        req.readPreference = 'SECONDARY';
      });

      const query0 = new Parse.Query('MyObject0');
      query0.equalTo('boolKey', false);

      const query1 = new Parse.Query('MyObject1');
      query1.matchesQuery('myObject0', query0);

      const query2 = new Parse.Query('MyObject2');
      query2.matchesQuery('myObject1', query1);

      query2.find().then((results) => {
        expect(results.length).toBe(1);
        expect(results[0].get('boolKey')).toBe(false);

        let myObjectReadPreference0 = null;
        let myObjectReadPreference1 = null;
        let myObjectReadPreference2 = null;
        databaseAdapter.database.serverConfig.cursor.calls.all().forEach((call) => {
          if (call.args[0].indexOf('MyObject0') >= 0) {
            myObjectReadPreference0 = call.args[2].readPreference.preference;
          }
          if (call.args[0].indexOf('MyObject1') >= 0) {
            myObjectReadPreference1 = call.args[2].readPreference.preference;
          }
          if (call.args[0].indexOf('MyObject2') >= 0) {
            myObjectReadPreference2 = call.args[2].readPreference.preference;
          }
        });

        expect(myObjectReadPreference0).toEqual(ReadPreference.PRIMARY);
        expect(myObjectReadPreference1).toEqual(ReadPreference.PRIMARY);
        expect(myObjectReadPreference2).toEqual(ReadPreference.SECONDARY);

        done();
      });
    });
  });

  it('should change subqueries read preference when using matchesQuery', (done) => {
    const databaseAdapter = (Config.get(Parse.applicationId)).database.adapter;

    const obj0 = new Parse.Object('MyObject0');
    obj0.set('boolKey', false);
    const obj1 = new Parse.Object('MyObject1');
    obj1.set('boolKey', true);
    obj1.set('myObject0', obj0);
    const obj2 = new Parse.Object('MyObject2');
    obj2.set('boolKey', false);
    obj2.set('myObject1', obj1);

    Parse.Object.saveAll([obj0, obj1, obj2]).then(() => {
      spyOn(databaseAdapter.database.serverConfig, 'cursor').and.callThrough();

      Parse.Cloud.beforeFind('MyObject2', (req) => {
        req.readPreference = 'SECONDARY_PREFERRED';
        req.subqueryReadPreference = 'SECONDARY';
      });

      const query0 = new Parse.Query('MyObject0');
      query0.equalTo('boolKey', false);

      const query1 = new Parse.Query('MyObject1');
      query1.matchesQuery('myObject0', query0);

      const query2 = new Parse.Query('MyObject2');
      query2.matchesQuery('myObject1', query1);

      query2.find().then((results) => {
        expect(results.length).toBe(1);
        expect(results[0].get('boolKey')).toBe(false);

        let myObjectReadPreference0 = null;
        let myObjectReadPreference1 = null;
        let myObjectReadPreference2 = null;
        databaseAdapter.database.serverConfig.cursor.calls.all().forEach((call) => {
          if (call.args[0].indexOf('MyObject0') >= 0) {
            myObjectReadPreference0 = call.args[2].readPreference.preference;
          }
          if (call.args[0].indexOf('MyObject1') >= 0) {
            myObjectReadPreference1 = call.args[2].readPreference.preference;
          }
          if (call.args[0].indexOf('MyObject2') >= 0) {
            myObjectReadPreference2 = call.args[2].readPreference.preference;
          }
        });

        expect(myObjectReadPreference0).toEqual(ReadPreference.SECONDARY);
        expect(myObjectReadPreference1).toEqual(ReadPreference.SECONDARY);
        expect(myObjectReadPreference2).toEqual(ReadPreference.SECONDARY_PREFERRED);

        done();
      });
    });
  });

  it('should change subqueries read preference when using doesNotMatchQuery', (done) => {
    const databaseAdapter = (Config.get(Parse.applicationId)).database.adapter;

    const obj0 = new Parse.Object('MyObject0');
    obj0.set('boolKey', false);
    const obj1 = new Parse.Object('MyObject1');
    obj1.set('boolKey', true);
    obj1.set('myObject0', obj0);
    const obj2 = new Parse.Object('MyObject2');
    obj2.set('boolKey', false);
    obj2.set('myObject1', obj1);

    Parse.Object.saveAll([obj0, obj1, obj2]).then(() => {
      spyOn(databaseAdapter.database.serverConfig, 'cursor').and.callThrough();

      Parse.Cloud.beforeFind('MyObject2', (req) => {
        req.readPreference = 'SECONDARY_PREFERRED';
        req.subqueryReadPreference = 'SECONDARY';
      });

      const query0 = new Parse.Query('MyObject0');
      query0.equalTo('boolKey', false);

      const query1 = new Parse.Query('MyObject1');
      query1.doesNotMatchQuery('myObject0', query0);

      const query2 = new Parse.Query('MyObject2');
      query2.doesNotMatchQuery('myObject1', query1);

      query2.find().then((results) => {
        expect(results.length).toBe(1);
        expect(results[0].get('boolKey')).toBe(false);

        let myObjectReadPreference0 = null;
        let myObjectReadPreference1 = null;
        let myObjectReadPreference2 = null;
        databaseAdapter.database.serverConfig.cursor.calls.all().forEach((call) => {
          if (call.args[0].indexOf('MyObject0') >= 0) {
            myObjectReadPreference0 = call.args[2].readPreference.preference;
          }
          if (call.args[0].indexOf('MyObject1') >= 0) {
            myObjectReadPreference1 = call.args[2].readPreference.preference;
          }
          if (call.args[0].indexOf('MyObject2') >= 0) {
            myObjectReadPreference2 = call.args[2].readPreference.preference;
          }
        });

        expect(myObjectReadPreference0).toEqual(ReadPreference.SECONDARY);
        expect(myObjectReadPreference1).toEqual(ReadPreference.SECONDARY);
        expect(myObjectReadPreference2).toEqual(ReadPreference.SECONDARY_PREFERRED);

        done();
      });
    });
  });

  it('should change subqueries read preference when using matchesKeyInQuery and doesNotMatchKeyInQuery', (done) => {
    const databaseAdapter = (Config.get(Parse.applicationId)).database.adapter;

    const obj0 = new Parse.Object('MyObject0');
    obj0.set('boolKey', false);
    const obj1 = new Parse.Object('MyObject1');
    obj1.set('boolKey', true);
    obj1.set('myObject0', obj0);
    const obj2 = new Parse.Object('MyObject2');
    obj2.set('boolKey', false);
    obj2.set('myObject1', obj1);

    Parse.Object.saveAll([obj0, obj1, obj2]).then(() => {
      spyOn(databaseAdapter.database.serverConfig, 'cursor').and.callThrough();

      Parse.Cloud.beforeFind('MyObject2', (req) => {
        req.readPreference = 'SECONDARY_PREFERRED';
        req.subqueryReadPreference = 'SECONDARY';
      });

      const query0 = new Parse.Query('MyObject0');
      query0.equalTo('boolKey', false);

      const query1 = new Parse.Query('MyObject1');
      query1.equalTo('boolKey', true);

      const query2 = new Parse.Query('MyObject2');
      query2.matchesKeyInQuery('boolKey', 'boolKey', query0);
      query2.doesNotMatchKeyInQuery('boolKey', 'boolKey', query1);

      query2.find().then((results) => {
        expect(results.length).toBe(1);
        expect(results[0].get('boolKey')).toBe(false);

        let myObjectReadPreference0 = null;
        let myObjectReadPreference1 = null;
        let myObjectReadPreference2 = null;
        databaseAdapter.database.serverConfig.cursor.calls.all().forEach((call) => {
          if (call.args[0].indexOf('MyObject0') >= 0) {
            myObjectReadPreference0 = call.args[2].readPreference.preference;
          }
          if (call.args[0].indexOf('MyObject1') >= 0) {
            myObjectReadPreference1 = call.args[2].readPreference.preference;
          }
          if (call.args[0].indexOf('MyObject2') >= 0) {
            myObjectReadPreference2 = call.args[2].readPreference.preference;
          }
        });

        expect(myObjectReadPreference0).toEqual(ReadPreference.SECONDARY);
        expect(myObjectReadPreference1).toEqual(ReadPreference.SECONDARY);
        expect(myObjectReadPreference2).toEqual(ReadPreference.SECONDARY_PREFERRED);

        done();
      });
    });
  });
});
