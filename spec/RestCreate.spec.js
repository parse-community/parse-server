// These tests check the "create" / "update" functionality of the REST API.
var auth = require('../src/Auth');
var cache = require('../src/cache');
var Config = require('../src/Config');
var DatabaseAdapter = require('../src/DatabaseAdapter');
var Parse = require('parse/node').Parse;
var rest = require('../src/rest');
var request = require('request');

var config = new Config('test');
var database = DatabaseAdapter.getDatabaseConnection('test', 'test_');

describe('rest create', () => {
  it('handles _id', (done) => {
    rest.create(config, auth.nobody(config), 'Foo', {}).then(() => {
      return database.mongoFind('Foo', {});
    }).then((results) => {
      expect(results.length).toEqual(1);
      var obj = results[0];
      expect(typeof obj._id).toEqual('string');
      expect(obj.objectId).toBeUndefined();
      done();
    });
  });

  it('handles array, object, date', (done) => {
    var obj = {
      array: [1, 2, 3],
      object: {foo: 'bar'},
      date: Parse._encode(new Date()),
    };
    rest.create(config, auth.nobody(config), 'MyClass', obj).then(() => {
      return database.mongoFind('MyClass', {}, {});
    }).then((results) => {
      expect(results.length).toEqual(1);
      var mob = results[0];
      expect(mob.array instanceof Array).toBe(true);
      expect(typeof mob.object).toBe('object');
      expect(mob.date instanceof Date).toBe(true);
      done();
    });
  });

  it('handles object and subdocument', (done) => {
    var obj = {
      subdoc: {foo: 'bar', wu: 'tan'},
    };
    rest.create(config, auth.nobody(config), 'MyClass', obj).then(() => {
      return database.mongoFind('MyClass', {}, {});
    }).then((results) => {
      expect(results.length).toEqual(1);
      var mob = results[0];
      expect(typeof mob.subdoc).toBe('object');
      expect(mob.subdoc.foo).toBe('bar');
      expect(mob.subdoc.wu).toBe('tan');
      expect(typeof mob._id).toEqual('string');

      var obj = {
        'subdoc.wu': 'clan',
      };

      rest.update(config, auth.nobody(config), 'MyClass', mob._id, obj).then(() => {
        return database.mongoFind('MyClass', {}, {});
      }).then((results) => {
        expect(results.length).toEqual(1);
        var mob = results[0];
        expect(typeof mob.subdoc).toBe('object');
        expect(mob.subdoc.foo).toBe('bar');
        expect(mob.subdoc.wu).toBe('clan');
        done();
      });

    });
  });

  it('handles create on non-existent class when disabled client class creation', (done) => {
    var customConfig = Object.assign({}, config, {allowClientClassCreation: false});
    rest.create(customConfig, auth.nobody(customConfig), 'ClientClassCreation', {})
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

  it('handles user signup', (done) => {
    var user = {
      username: 'asdf',
      password: 'zxcv',
      foo: 'bar',
    };
    rest.create(config, auth.nobody(config), '_User', user)
      .then((r) => {
        expect(Object.keys(r.response).length).toEqual(3);
        expect(typeof r.response.objectId).toEqual('string');
        expect(typeof r.response.createdAt).toEqual('string');
        expect(typeof r.response.sessionToken).toEqual('string');
        done();
      });
  });

  it('handles anonymous user signup', (done) => {
    var data1 = {
      authData: {
        anonymous: {
          id: '00000000-0000-0000-0000-000000000001'
        }
      }
    };
    var data2 = {
      authData: {
        anonymous: {
          id: '00000000-0000-0000-0000-000000000002'
        }
      }
    };
    var username1;
    rest.create(config, auth.nobody(config), '_User', data1)
      .then((r) => {
        expect(typeof r.response.objectId).toEqual('string');
        expect(typeof r.response.createdAt).toEqual('string');
        expect(typeof r.response.sessionToken).toEqual('string');
        return rest.create(config, auth.nobody(config), '_User', data1);
      }).then((r) => {
        expect(typeof r.response.objectId).toEqual('string');
        expect(typeof r.response.createdAt).toEqual('string');
        expect(typeof r.response.username).toEqual('string');
        expect(typeof r.response.updatedAt).toEqual('string');
        username1 = r.response.username;
        return rest.create(config, auth.nobody(config), '_User', data2);
      }).then((r) => {
        expect(typeof r.response.objectId).toEqual('string');
        expect(typeof r.response.createdAt).toEqual('string');
        expect(typeof r.response.sessionToken).toEqual('string');
        return rest.create(config, auth.nobody(config), '_User', data2);
      }).then((r) => {
        expect(typeof r.response.objectId).toEqual('string');
        expect(typeof r.response.createdAt).toEqual('string');
        expect(typeof r.response.username).toEqual('string');
        expect(typeof r.response.updatedAt).toEqual('string');
        expect(r.response.username).not.toEqual(username1);
        done();
      });
  });

  it('handles anonymous user signup and upgrade to new user', (done) => {
    var data1 = {
      authData: {
        anonymous: {
          id: '00000000-0000-0000-0000-000000000001'
        }
      }
    };

    var updatedData = {
      authData: { anonymous: null },
      username: 'hello',
      password: 'world'
    }
    var username1;
    var objectId;
    rest.create(config, auth.nobody(config), '_User', data1)
      .then((r) => {
        expect(typeof r.response.objectId).toEqual('string');
        expect(typeof r.response.createdAt).toEqual('string');
        expect(typeof r.response.sessionToken).toEqual('string');
        objectId = r.response.objectId;
        return auth.getAuthForSessionToken({config, sessionToken: r.response.sessionToken })
      }).then((sessionAuth) => {
        return rest.update(config, sessionAuth, '_User', objectId, updatedData);
      }).then((r) => {
        return Parse.User.logOut().then(() => {
          return Parse.User.logIn('hello', 'world');
        })
      }).then((r) => {
        expect(r.id).toEqual(objectId);
        expect(r.get('username')).toEqual('hello');
        done();
      }).catch((err) => {
        fail('should not fail')
        done();
      })
  });

  it('handles no anonymous users config', (done) => {
     var NoAnnonConfig = Object.assign({}, config);
     NoAnnonConfig.authDataManager.setEnableAnonymousUsers(false);
     var data1 = {
      authData: {
        anonymous: {
          id: '00000000-0000-0000-0000-000000000001'
        }
      }
    };
    rest.create(NoAnnonConfig, auth.nobody(NoAnnonConfig), '_User', data1).then(() => {
      fail("Should throw an error");
      done();
    }, (err) => {
      expect(err.code).toEqual(Parse.Error.UNSUPPORTED_SERVICE);
      expect(err.message).toEqual('This authentication method is unsupported.');
      NoAnnonConfig.authDataManager.setEnableAnonymousUsers(true);
      done();
    })
  });

  it('test facebook signup and login', (done) => {
    var data = {
      authData: {
        facebook: {
          id: '8675309',
          access_token: 'jenny'
        }
      }
    };
    var newUserSignedUpByFacebookObjectId;
    rest.create(config, auth.nobody(config), '_User', data)
      .then((r) => {
        expect(typeof r.response.objectId).toEqual('string');
        expect(typeof r.response.createdAt).toEqual('string');
        expect(typeof r.response.sessionToken).toEqual('string');
        newUserSignedUpByFacebookObjectId = r.response.objectId;
        return rest.create(config, auth.nobody(config), '_User', data);
      }).then((r) => {
        expect(typeof r.response.objectId).toEqual('string');
        expect(typeof r.response.createdAt).toEqual('string');
        expect(typeof r.response.username).toEqual('string');
        expect(typeof r.response.updatedAt).toEqual('string');
        expect(r.response.objectId).toEqual(newUserSignedUpByFacebookObjectId);
        return rest.find(config, auth.master(config),
                          '_Session', {sessionToken: r.response.sessionToken});
      }).then((response) => {
        expect(response.results.length).toEqual(1);
        var output = response.results[0];
        expect(output.user.objectId).toEqual(newUserSignedUpByFacebookObjectId);
        done();
      });
  });

  it('stores pointers with a _p_ prefix', (done) => {
    var obj = {
      foo: 'bar',
      aPointer: {
        __type: 'Pointer',
        className: 'JustThePointer',
        objectId: 'qwerty'
      }
    };
    rest.create(config, auth.nobody(config), 'APointerDarkly', obj)
      .then((r) => {
        return database.mongoFind('APointerDarkly', {});
      }).then((results) => {
        expect(results.length).toEqual(1);
        var output = results[0];
        expect(typeof output._id).toEqual('string');
        expect(typeof output._p_aPointer).toEqual('string');
        expect(output._p_aPointer).toEqual('JustThePointer$qwerty');
        expect(output.aPointer).toBeUndefined();
        done();
      });
  });

  it("cannot set objectId", (done) => {
    var headers = {
      'Content-Type': 'application/octet-stream',
      'X-Parse-Application-Id': 'test',
      'X-Parse-REST-API-Key': 'rest'
    };
    request.post({
      headers: headers,
      url: 'http://localhost:8378/1/classes/TestObject',
      body: JSON.stringify({
        'foo': 'bar',
        'objectId': 'hello'
      })
    }, (error, response, body) => {
      var b = JSON.parse(body);
      expect(b.code).toEqual(105);
      expect(b.error).toEqual('objectId is an invalid field name.');
      done();
    });
  });

});
