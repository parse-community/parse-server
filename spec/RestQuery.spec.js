'use strict';
// These tests check the "find" functionality of the REST API.
const auth = require('../lib/Auth');
const Config = require('../lib/Config');
const rest = require('../lib/rest');
const RestQuery = require('../lib/RestQuery');
const request = require('../lib/request');

const querystring = require('querystring');

let config;
let database;
const nobody = auth.nobody(config);

describe('rest query', () => {
  beforeEach(() => {
    config = Config.get('test');
    database = config.database;
  });

  it('basic query', done => {
    rest
      .create(config, nobody, 'TestObject', {})
      .then(() => {
        return rest.find(config, nobody, 'TestObject', {});
      })
      .then(response => {
        expect(response.results.length).toEqual(1);
        done();
      });
  });

  it('query with limit', done => {
    rest
      .create(config, nobody, 'TestObject', { foo: 'baz' })
      .then(() => {
        return rest.create(config, nobody, 'TestObject', { foo: 'qux' });
      })
      .then(() => {
        return rest.find(config, nobody, 'TestObject', {}, { limit: 1 });
      })
      .then(response => {
        expect(response.results.length).toEqual(1);
        expect(response.results[0].foo).toBeTruthy();
        done();
      });
  });

  const data = {
    username: 'blah',
    password: 'pass',
    sessionToken: 'abc123',
  };

  it_exclude_dbs(['postgres'])(
    'query for user w/ legacy credentials without masterKey has them stripped from results',
    done => {
      database
        .create('_User', data)
        .then(() => {
          return rest.find(config, nobody, '_User');
        })
        .then(result => {
          const user = result.results[0];
          expect(user.username).toEqual('blah');
          expect(user.sessionToken).toBeUndefined();
          expect(user.password).toBeUndefined();
          done();
        });
    }
  );

  it_exclude_dbs(['postgres'])(
    'query for user w/ legacy credentials with masterKey has them stripped from results',
    done => {
      database
        .create('_User', data)
        .then(() => {
          return rest.find(config, { isMaster: true }, '_User');
        })
        .then(result => {
          const user = result.results[0];
          expect(user.username).toEqual('blah');
          expect(user.sessionToken).toBeUndefined();
          expect(user.password).toBeUndefined();
          done();
        });
    }
  );

  // Created to test a scenario in AnyPic
  it_exclude_dbs(['postgres'])('query with include', done => {
    let photo = {
      foo: 'bar',
    };
    let user = {
      username: 'aUsername',
      password: 'aPassword',
    };
    const activity = {
      type: 'comment',
      photo: {
        __type: 'Pointer',
        className: 'TestPhoto',
        objectId: '',
      },
      fromUser: {
        __type: 'Pointer',
        className: '_User',
        objectId: '',
      },
    };
    const queryWhere = {
      photo: {
        __type: 'Pointer',
        className: 'TestPhoto',
        objectId: '',
      },
      type: 'comment',
    };
    const queryOptions = {
      include: 'fromUser',
      order: 'createdAt',
      limit: 30,
    };
    rest
      .create(config, nobody, 'TestPhoto', photo)
      .then(p => {
        photo = p;
        return rest.create(config, nobody, '_User', user);
      })
      .then(u => {
        user = u.response;
        activity.photo.objectId = photo.objectId;
        activity.fromUser.objectId = user.objectId;
        return rest.create(config, nobody, 'TestActivity', activity);
      })
      .then(() => {
        queryWhere.photo.objectId = photo.objectId;
        return rest.find(config, nobody, 'TestActivity', queryWhere, queryOptions);
      })
      .then(response => {
        const results = response.results;
        expect(results.length).toEqual(1);
        expect(typeof results[0].objectId).toEqual('string');
        expect(typeof results[0].photo).toEqual('object');
        expect(typeof results[0].fromUser).toEqual('object');
        expect(typeof results[0].fromUser.username).toEqual('string');
        done();
      })
      .catch(error => {
        console.log(error);
      });
  });

  it('query non-existent class when disabled client class creation', done => {
    const customConfig = Object.assign({}, config, {
      allowClientClassCreation: false,
    });
    rest.find(customConfig, auth.nobody(customConfig), 'ClientClassCreation', {}).then(
      () => {
        fail('Should throw an error');
        done();
      },
      err => {
        expect(err.code).toEqual(Parse.Error.OPERATION_FORBIDDEN);
        expect(err.message).toEqual(
          'This user is not allowed to access ' + 'non-existent class: ClientClassCreation'
        );
        done();
      }
    );
  });

  it('query existent class when disabled client class creation', async () => {
    const customConfig = Object.assign({}, config, {
      allowClientClassCreation: false,
    });
    const schema = await config.database.loadSchema();
    const actualSchema = await schema.addClassIfNotExists('ClientClassCreation', {});
    expect(actualSchema.className).toEqual('ClientClassCreation');

    await schema.reloadData({ clearCache: true });
    // Should not throw
    const result = await rest.find(
      customConfig,
      auth.nobody(customConfig),
      'ClientClassCreation',
      {}
    );
    expect(result.results.length).toEqual(0);
  });

  it('query with wrongly encoded parameter', done => {
    rest
      .create(config, nobody, 'TestParameterEncode', { foo: 'bar' })
      .then(() => {
        return rest.create(config, nobody, 'TestParameterEncode', {
          foo: 'baz',
        });
      })
      .then(() => {
        const headers = {
          'X-Parse-Application-Id': 'test',
          'X-Parse-REST-API-Key': 'rest',
        };

        const p0 = request({
          headers: headers,
          url:
            'http://localhost:8378/1/classes/TestParameterEncode?' +
            querystring
              .stringify({
                where: '{"foo":{"$ne": "baz"}}',
                limit: 1,
              })
              .replace('=', '%3D'),
        }).then(fail, response => {
          const error = response.data;
          expect(error.code).toEqual(Parse.Error.INVALID_QUERY);
        });

        const p1 = request({
          headers: headers,
          url:
            'http://localhost:8378/1/classes/TestParameterEncode?' +
            querystring
              .stringify({
                limit: 1,
              })
              .replace('=', '%3D'),
        }).then(fail, response => {
          const error = response.data;
          expect(error.code).toEqual(Parse.Error.INVALID_QUERY);
        });
        return Promise.all([p0, p1]);
      })
      .then(done)
      .catch(err => {
        jfail(err);
        fail('should not fail');
        done();
      });
  });

  it('query with limit = 0', done => {
    rest
      .create(config, nobody, 'TestObject', { foo: 'baz' })
      .then(() => {
        return rest.create(config, nobody, 'TestObject', { foo: 'qux' });
      })
      .then(() => {
        return rest.find(config, nobody, 'TestObject', {}, { limit: 0 });
      })
      .then(response => {
        expect(response.results.length).toEqual(0);
        done();
      });
  });

  it('query with limit = 0 and count = 1', done => {
    rest
      .create(config, nobody, 'TestObject', { foo: 'baz' })
      .then(() => {
        return rest.create(config, nobody, 'TestObject', { foo: 'qux' });
      })
      .then(() => {
        return rest.find(config, nobody, 'TestObject', {}, { limit: 0, count: 1 });
      })
      .then(response => {
        expect(response.results.length).toEqual(0);
        expect(response.count).toEqual(2);
        done();
      });
  });

  it('makes sure null pointers are handed correctly #2189', done => {
    const object = new Parse.Object('AnObject');
    const anotherObject = new Parse.Object('AnotherObject');
    anotherObject
      .save()
      .then(() => {
        object.set('values', [null, null, anotherObject]);
        return object.save();
      })
      .then(() => {
        const query = new Parse.Query('AnObject');
        query.include('values');
        return query.first();
      })
      .then(
        result => {
          const values = result.get('values');
          expect(values.length).toBe(3);
          let anotherObjectFound = false;
          let nullCounts = 0;
          for (const value of values) {
            if (value === null) {
              nullCounts++;
            } else if (value instanceof Parse.Object) {
              anotherObjectFound = true;
            }
          }
          expect(nullCounts).toBe(2);
          expect(anotherObjectFound).toBeTruthy();
          done();
        },
        err => {
          console.error(err);
          fail(err);
          done();
        }
      );
  });
});

describe('RestQuery.each', () => {
  it('should run each', async () => {
    const objects = [];
    while (objects.length != 10) {
      objects.push(new Parse.Object('Object', { value: objects.length }));
    }
    const config = Config.get('test');
    await Parse.Object.saveAll(objects);
    const query = new RestQuery(
      config,
      auth.master(config),
      'Object',
      { value: { $gt: 2 } },
      { limit: 2 }
    );
    const spy = spyOn(query, 'execute').and.callThrough();
    const classSpy = spyOn(RestQuery.prototype, 'execute').and.callThrough();
    const results = [];
    await query.each(result => {
      expect(result.value).toBeGreaterThan(2);
      results.push(result);
    });
    expect(spy.calls.count()).toBe(0);
    expect(classSpy.calls.count()).toBe(4);
    expect(results.length).toBe(7);
  });

  it('should work with query on relations', async () => {
    const objectA = new Parse.Object('Letter', { value: 'A' });
    const objectB = new Parse.Object('Letter', { value: 'B' });

    const object1 = new Parse.Object('Number', { value: '1' });
    const object2 = new Parse.Object('Number', { value: '2' });
    const object3 = new Parse.Object('Number', { value: '3' });
    const object4 = new Parse.Object('Number', { value: '4' });
    await Parse.Object.saveAll([object1, object2, object3, object4]);

    objectA.relation('numbers').add(object1);
    objectB.relation('numbers').add(object2);
    await Parse.Object.saveAll([objectA, objectB]);

    const config = Config.get('test');

    /**
     * Two queries needed since objectId are sorted and we can't know which one
     * going to be the first and then skip by the $gt added by each
     */
    const queryOne = new RestQuery(
      config,
      auth.master(config),
      'Letter',
      {
        numbers: {
          __type: 'Pointer',
          className: 'Number',
          objectId: object1.id,
        },
      },
      { limit: 1 }
    );
    const queryTwo = new RestQuery(
      config,
      auth.master(config),
      'Letter',
      {
        numbers: {
          __type: 'Pointer',
          className: 'Number',
          objectId: object2.id,
        },
      },
      { limit: 1 }
    );

    const classSpy = spyOn(RestQuery.prototype, 'execute').and.callThrough();
    const resultsOne = [];
    const resultsTwo = [];
    await queryOne.each(result => {
      resultsOne.push(result);
    });
    await queryTwo.each(result => {
      resultsTwo.push(result);
    });
    expect(classSpy.calls.count()).toBe(4);
    expect(resultsOne.length).toBe(1);
    expect(resultsTwo.length).toBe(1);
  });

  it('test afterSave response object is return', done => {
    Parse.Cloud.beforeSave('TestObject2', function (req) {
      req.object.set('tobeaddbefore', true);
      req.object.set('tobeaddbeforeandremoveafter', true);
    });

    Parse.Cloud.afterSave('TestObject2', function (req) {
      const jsonObject = req.object.toJSON();
      delete jsonObject.todelete;
      delete jsonObject.tobeaddbeforeandremoveafter;
      jsonObject.toadd = true;

      return jsonObject;
    });

    rest.create(config, nobody, 'TestObject2', { todelete: true, tokeep: true }).then(response => {
      expect(response.response.toadd).toBeTruthy();
      expect(response.response.tokeep).toBeTruthy();
      expect(response.response.tobeaddbefore).toBeTruthy();
      expect(response.response.tobeaddbeforeandremoveafter).toBeUndefined();
      expect(response.response.todelete).toBeUndefined();
      done();
    });
  });
});
