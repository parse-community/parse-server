'use strict'
// These tests check the "find" functionality of the REST API.
var auth = require('../src/Auth');
var Config = require('../src/Config');
var rest = require('../src/rest');

var querystring = require('querystring');
var rp = require('request-promise');

var config;
let database;
var nobody = auth.nobody(config);

describe('rest query', () => {

  beforeEach(() => {
    config = new Config('test');
    database = config.database;
  });

  it('basic query', (done) => {
    rest.create(config, nobody, 'TestObject', {}).then(() => {
      return rest.find(config, nobody, 'TestObject', {});
    }).then((response) => {
      expect(response.results.length).toEqual(1);
      done();
    });
  });

  it('query with limit', (done) => {
    rest.create(config, nobody, 'TestObject', {foo: 'baz'}
    ).then(() => {
      return rest.create(config, nobody,
        'TestObject', {foo: 'qux'});
    }).then(() => {
      return rest.find(config, nobody,
        'TestObject', {}, {limit: 1});
    }).then((response) => {
      expect(response.results.length).toEqual(1);
      expect(response.results[0].foo).toBeTruthy();
      done();
    });
  });

  var data = {
    username: 'blah',
    password: 'pass',
    sessionToken: 'abc123',
  }

  it_exclude_dbs(['postgres'])('query for user w/ legacy credentials without masterKey has them stripped from results', done => {
    database.create('_User', data).then(() => {
      return rest.find(config, nobody, '_User')
    }).then((result) => {
      var user = result.results[0];
      expect(user.username).toEqual('blah');
      expect(user.sessionToken).toBeUndefined();
      expect(user.password).toBeUndefined();
      done();
    });
  });

  it_exclude_dbs(['postgres'])('query for user w/ legacy credentials with masterKey has them stripped from results', done => {
    database.create('_User', data).then(() => {
      return rest.find(config, {isMaster: true}, '_User')
    }).then((result) => {
      var user = result.results[0];
      expect(user.username).toEqual('blah');
      expect(user.sessionToken).toBeUndefined();
      expect(user.password).toBeUndefined();
      done();
    });
  });

  // Created to test a scenario in AnyPic
  it_exclude_dbs(['postgres'])('query with include', (done) => {
    var photo = {
      foo: 'bar'
    };
    var user = {
      username: 'aUsername',
      password: 'aPassword'
    };
    var activity = {
      type: 'comment',
      photo: {
        __type: 'Pointer',
        className: 'TestPhoto',
        objectId: ''
      },
      fromUser: {
        __type: 'Pointer',
        className: '_User',
        objectId: ''
      }
    };
    var queryWhere = {
      photo: {
        __type: 'Pointer',
        className: 'TestPhoto',
        objectId: ''
      },
      type: 'comment'
    };
    var queryOptions = {
      include: 'fromUser',
      order: 'createdAt',
      limit: 30
    };
    rest.create(config, nobody, 'TestPhoto', photo
    ).then((p) => {
      photo = p;
      return rest.create(config, nobody, '_User', user);
    }).then((u) => {
      user = u.response;
      activity.photo.objectId = photo.objectId;
      activity.fromUser.objectId = user.objectId;
      return rest.create(config, nobody,
        'TestActivity', activity);
    }).then(() => {
      queryWhere.photo.objectId = photo.objectId;
      return rest.find(config, nobody,
        'TestActivity', queryWhere, queryOptions);
    }).then((response) => {
      var results = response.results;
      expect(results.length).toEqual(1);
      expect(typeof results[0].objectId).toEqual('string');
      expect(typeof results[0].photo).toEqual('object');
      expect(typeof results[0].fromUser).toEqual('object');
      expect(typeof results[0].fromUser.username).toEqual('string');
      done();
    }).catch((error) => { console.log(error); });
  });

  it('query non-existent class when disabled client class creation', (done) => {
    var customConfig = Object.assign({}, config, {allowClientClassCreation: false});
    rest.find(customConfig, auth.nobody(customConfig), 'ClientClassCreation', {})
      .then(() => {
        fail('Should throw an error');
        done();
      }, (err) => {
        expect(err.code).toEqual(Parse.Error.OPERATION_FORBIDDEN);
        expect(err.message).toEqual('This user is not allowed to access ' +
                                    'non-existent class: ClientClassCreation');
        done();
      });
  });

  it('query existent class when disabled client class creation', (done) => {
    var customConfig = Object.assign({}, config, {allowClientClassCreation: false});
    config.database.loadSchema()
      .then(schema => schema.addClassIfNotExists('ClientClassCreation', {}))
      .then(actualSchema => {
        expect(actualSchema.className).toEqual('ClientClassCreation');
        return rest.find(customConfig, auth.nobody(customConfig), 'ClientClassCreation', {});
      })
      .then((result) => {
        expect(result.results.length).toEqual(0);
        done();
      }, () => {
        fail('Should not throw error')
      });
  });

  it('query with wrongly encoded parameter', (done) => {
    rest.create(config, nobody, 'TestParameterEncode', {foo: 'bar'}
    ).then(() => {
      return rest.create(config, nobody,
        'TestParameterEncode', {foo: 'baz'});
    }).then(() => {
      var headers = {
        'X-Parse-Application-Id': 'test',
        'X-Parse-REST-API-Key': 'rest'
      };

      const p0 = rp.get({
        headers: headers,
        url: 'http://localhost:8378/1/classes/TestParameterEncode?' + querystring.stringify({
          where: '{"foo":{"$ne": "baz"}}',
          limit: 1
        }).replace('=', '%3D'),
      })
        .then(fail, (response) => {
          const error = response.error;
          var b = JSON.parse(error);
          expect(b.code).toEqual(Parse.Error.INVALID_QUERY);
        });

      const p1 = rp.get({
        headers: headers,
        url: 'http://localhost:8378/1/classes/TestParameterEncode?' + querystring.stringify({
          limit: 1
        }).replace('=', '%3D'),
      })
        .then(fail, (response) => {
          const error = response.error;
          var b = JSON.parse(error);
          expect(b.code).toEqual(Parse.Error.INVALID_QUERY);
        });
      return Promise.all([p0, p1]);
    }).then(done).catch((err) => {
      jfail(err);
      fail('should not fail');
      done();
    })
  });

  it('query with limit = 0', (done) => {
    rest.create(config, nobody, 'TestObject', {foo: 'baz'}
    ).then(() => {
      return rest.create(config, nobody,
        'TestObject', {foo: 'qux'});
    }).then(() => {
      return rest.find(config, nobody,
        'TestObject', {}, {limit: 0});
    }).then((response) => {
      expect(response.results.length).toEqual(0);
      done();
    });
  });

  it('query with limit = 0 and count = 1', (done) => {
    rest.create(config, nobody, 'TestObject', {foo: 'baz'}
    ).then(() => {
      return rest.create(config, nobody,
        'TestObject', {foo: 'qux'});
    }).then(() => {
      return rest.find(config, nobody,
        'TestObject', {}, {limit: 0, count: 1});
    }).then((response) => {
      expect(response.results.length).toEqual(0);
      expect(response.count).toEqual(2);
      done();
    });
  });

  it('makes sure null pointers are handed correctly #2189', done => {
    const object = new Parse.Object('AnObject');
    const anotherObject = new Parse.Object('AnotherObject');
    anotherObject.save().then(() => {
      object.set('values', [null, null, anotherObject]);
      return object.save();
    }).then(() => {
      const query = new Parse.Query('AnObject');
      query.include('values');
      return query.first();
    }).then((result) => {
      const values = result.get('values');
      expect(values.length).toBe(3);
      let anotherObjectFound = false;
      let nullCounts = 0;
      for(const value of values) {
        if (value === null) {
          nullCounts++;
        } else if (value instanceof Parse.Object) {
          anotherObjectFound = true;
        }
      }
      expect(nullCounts).toBe(2);
      expect(anotherObjectFound).toBeTruthy();
      done();
    }, (err) => {
      console.error(err);
      fail(err);
      done();
    });
  });
});
