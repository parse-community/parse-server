'use strict';
// These tests check the "create" / "update" functionality of the REST API.
const auth = require('../lib/Auth');
const Config = require('../lib/Config');
const Parse = require('parse/node').Parse;
const rest = require('../lib/rest');
const RestWrite = require('../lib/RestWrite');
const request = require('../lib/request');

let config;
let database;

describe('rest create', () => {
  beforeEach(() => {
    config = Config.get('test');
    database = config.database;
  });

  it('handles _id', done => {
    rest
      .create(config, auth.nobody(config), 'Foo', {})
      .then(() => database.adapter.find('Foo', { fields: {} }, {}, {}))
      .then(results => {
        expect(results.length).toEqual(1);
        const obj = results[0];
        expect(typeof obj.objectId).toEqual('string');
        expect(obj.objectId.length).toEqual(10);
        expect(obj._id).toBeUndefined();
        done();
      });
  });

  it('can use custom _id size', done => {
    config.objectIdSize = 20;
    rest
      .create(config, auth.nobody(config), 'Foo', {})
      .then(() => database.adapter.find('Foo', { fields: {} }, {}, {}))
      .then(results => {
        expect(results.length).toEqual(1);
        const obj = results[0];
        expect(typeof obj.objectId).toEqual('string');
        expect(obj.objectId.length).toEqual(20);
        done();
      });
  });

  it('should use objectId from client when allowCustomObjectId true', async () => {
    config.allowCustomObjectId = true;

    // use time as unique custom id for test reusability
    const customId = `${Date.now()}`;
    const obj = {
      objectId: customId,
    };

    const {
      status,
      response: { objectId },
    } = await rest.create(config, auth.nobody(config), 'MyClass', obj);

    expect(status).toEqual(201);
    expect(objectId).toEqual(customId);
  });

  it('should throw on invalid objectId when allowCustomObjectId true', () => {
    config.allowCustomObjectId = true;

    const objIdNull = {
      objectId: null,
    };

    const objIdUndef = {
      objectId: undefined,
    };

    const objIdEmpty = {
      objectId: '',
    };

    const err = 'objectId must not be empty, null or undefined';

    expect(() => rest.create(config, auth.nobody(config), 'MyClass', objIdEmpty)).toThrowError(err);

    expect(() => rest.create(config, auth.nobody(config), 'MyClass', objIdNull)).toThrowError(err);

    expect(() => rest.create(config, auth.nobody(config), 'MyClass', objIdUndef)).toThrowError(err);
  });

  it('should generate objectId when not set by client with allowCustomObjectId true', async () => {
    config.allowCustomObjectId = true;

    const {
      status,
      response: { objectId },
    } = await rest.create(config, auth.nobody(config), 'MyClass', {});

    expect(status).toEqual(201);
    expect(objectId).toBeDefined();
  });

  it('is backwards compatible when _id size changes', done => {
    rest
      .create(config, auth.nobody(config), 'Foo', { size: 10 })
      .then(() => {
        config.objectIdSize = 20;
        return rest.find(config, auth.nobody(config), 'Foo', { size: 10 });
      })
      .then(response => {
        expect(response.results.length).toEqual(1);
        expect(response.results[0].objectId.length).toEqual(10);
        return rest.update(
          config,
          auth.nobody(config),
          'Foo',
          { objectId: response.results[0].objectId },
          { update: 20 }
        );
      })
      .then(() => {
        return rest.find(config, auth.nobody(config), 'Foo', { size: 10 });
      })
      .then(response => {
        expect(response.results.length).toEqual(1);
        expect(response.results[0].objectId.length).toEqual(10);
        expect(response.results[0].update).toEqual(20);
        return rest.create(config, auth.nobody(config), 'Foo', { size: 20 });
      })
      .then(() => {
        config.objectIdSize = 10;
        return rest.find(config, auth.nobody(config), 'Foo', { size: 20 });
      })
      .then(response => {
        expect(response.results.length).toEqual(1);
        expect(response.results[0].objectId.length).toEqual(20);
        done();
      });
  });

  it('handles array, object, date', done => {
    const now = new Date();
    const obj = {
      array: [1, 2, 3],
      object: { foo: 'bar' },
      date: Parse._encode(now),
    };
    rest
      .create(config, auth.nobody(config), 'MyClass', obj)
      .then(() =>
        database.adapter.find(
          'MyClass',
          {
            fields: {
              array: { type: 'Array' },
              object: { type: 'Object' },
              date: { type: 'Date' },
            },
          },
          {},
          {}
        )
      )
      .then(results => {
        expect(results.length).toEqual(1);
        const mob = results[0];
        expect(mob.array instanceof Array).toBe(true);
        expect(typeof mob.object).toBe('object');
        expect(mob.date.__type).toBe('Date');
        expect(new Date(mob.date.iso).getTime()).toBe(now.getTime());
        done();
      });
  });

  it('handles object and subdocument', done => {
    const obj = { subdoc: { foo: 'bar', wu: 'tan' } };

    Parse.Cloud.beforeSave('MyClass', function () {
      // this beforeSave trigger should do nothing but can mess with the object
    });

    rest
      .create(config, auth.nobody(config), 'MyClass', obj)
      .then(() => database.adapter.find('MyClass', { fields: {} }, {}, {}))
      .then(results => {
        expect(results.length).toEqual(1);
        const mob = results[0];
        expect(typeof mob.subdoc).toBe('object');
        expect(mob.subdoc.foo).toBe('bar');
        expect(mob.subdoc.wu).toBe('tan');
        expect(typeof mob.objectId).toEqual('string');
        const obj = { 'subdoc.wu': 'clan' };
        return rest.update(config, auth.nobody(config), 'MyClass', { objectId: mob.objectId }, obj);
      })
      .then(() => database.adapter.find('MyClass', { fields: {} }, {}, {}))
      .then(results => {
        expect(results.length).toEqual(1);
        const mob = results[0];
        expect(typeof mob.subdoc).toBe('object');
        expect(mob.subdoc.foo).toBe('bar');
        expect(mob.subdoc.wu).toBe('clan');
        done();
      })
      .catch(done.fail);
  });

  it('handles create on non-existent class when disabled client class creation', done => {
    const customConfig = Object.assign({}, config, {
      allowClientClassCreation: false,
    });
    rest.create(customConfig, auth.nobody(customConfig), 'ClientClassCreation', {}).then(
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

  it('handles create on existent class when disabled client class creation', async () => {
    const customConfig = Object.assign({}, config, {
      allowClientClassCreation: false,
    });
    const schema = await config.database.loadSchema();
    const actualSchema = await schema.addClassIfNotExists('ClientClassCreation', {});
    expect(actualSchema.className).toEqual('ClientClassCreation');

    await schema.reloadData({ clearCache: true });
    // Should not throw
    await rest.create(customConfig, auth.nobody(customConfig), 'ClientClassCreation', {});
  });

  it('handles user signup', done => {
    const user = {
      username: 'asdf',
      password: 'zxcv',
      foo: 'bar',
    };
    rest.create(config, auth.nobody(config), '_User', user).then(r => {
      expect(Object.keys(r.response).length).toEqual(3);
      expect(typeof r.response.objectId).toEqual('string');
      expect(typeof r.response.createdAt).toEqual('string');
      expect(typeof r.response.sessionToken).toEqual('string');
      done();
    });
  });

  it('handles anonymous user signup', done => {
    const data1 = {
      authData: {
        anonymous: {
          id: '00000000-0000-0000-0000-000000000001',
        },
      },
    };
    const data2 = {
      authData: {
        anonymous: {
          id: '00000000-0000-0000-0000-000000000002',
        },
      },
    };
    let username1;
    rest
      .create(config, auth.nobody(config), '_User', data1)
      .then(r => {
        expect(typeof r.response.objectId).toEqual('string');
        expect(typeof r.response.createdAt).toEqual('string');
        expect(typeof r.response.sessionToken).toEqual('string');
        expect(typeof r.response.username).toEqual('string');
        return rest.create(config, auth.nobody(config), '_User', data1);
      })
      .then(r => {
        expect(typeof r.response.objectId).toEqual('string');
        expect(typeof r.response.createdAt).toEqual('string');
        expect(typeof r.response.username).toEqual('string');
        expect(typeof r.response.updatedAt).toEqual('string');
        username1 = r.response.username;
        return rest.create(config, auth.nobody(config), '_User', data2);
      })
      .then(r => {
        expect(typeof r.response.objectId).toEqual('string');
        expect(typeof r.response.createdAt).toEqual('string');
        expect(typeof r.response.sessionToken).toEqual('string');
        return rest.create(config, auth.nobody(config), '_User', data2);
      })
      .then(r => {
        expect(typeof r.response.objectId).toEqual('string');
        expect(typeof r.response.createdAt).toEqual('string');
        expect(typeof r.response.username).toEqual('string');
        expect(typeof r.response.updatedAt).toEqual('string');
        expect(r.response.username).not.toEqual(username1);
        done();
      });
  });

  it('handles anonymous user signup and upgrade to new user', done => {
    const data1 = {
      authData: {
        anonymous: {
          id: '00000000-0000-0000-0000-000000000001',
        },
      },
    };

    const updatedData = {
      authData: { anonymous: null },
      username: 'hello',
      password: 'world',
    };
    let objectId;
    rest
      .create(config, auth.nobody(config), '_User', data1)
      .then(r => {
        expect(typeof r.response.objectId).toEqual('string');
        expect(typeof r.response.createdAt).toEqual('string');
        expect(typeof r.response.sessionToken).toEqual('string');
        objectId = r.response.objectId;
        return auth.getAuthForSessionToken({
          config,
          sessionToken: r.response.sessionToken,
        });
      })
      .then(sessionAuth => {
        return rest.update(config, sessionAuth, '_User', { objectId }, updatedData);
      })
      .then(() => {
        return Parse.User.logOut().then(() => {
          return Parse.User.logIn('hello', 'world');
        });
      })
      .then(r => {
        expect(r.id).toEqual(objectId);
        expect(r.get('username')).toEqual('hello');
        done();
      })
      .catch(err => {
        jfail(err);
        done();
      });
  });

  it('handles no anonymous users config', done => {
    const NoAnnonConfig = Object.assign({}, config);
    NoAnnonConfig.authDataManager.setEnableAnonymousUsers(false);
    const data1 = {
      authData: {
        anonymous: {
          id: '00000000-0000-0000-0000-000000000001',
        },
      },
    };
    rest.create(NoAnnonConfig, auth.nobody(NoAnnonConfig), '_User', data1).then(
      () => {
        fail('Should throw an error');
        done();
      },
      err => {
        expect(err.code).toEqual(Parse.Error.UNSUPPORTED_SERVICE);
        expect(err.message).toEqual('This authentication method is unsupported.');
        NoAnnonConfig.authDataManager.setEnableAnonymousUsers(true);
        done();
      }
    );
  });

  it('test facebook signup and login', done => {
    const data = {
      authData: {
        facebook: {
          id: '8675309',
          access_token: 'jenny',
        },
      },
    };
    let newUserSignedUpByFacebookObjectId;
    rest
      .create(config, auth.nobody(config), '_User', data)
      .then(r => {
        expect(typeof r.response.objectId).toEqual('string');
        expect(typeof r.response.createdAt).toEqual('string');
        expect(typeof r.response.sessionToken).toEqual('string');
        newUserSignedUpByFacebookObjectId = r.response.objectId;
        return rest.create(config, auth.nobody(config), '_User', data);
      })
      .then(r => {
        expect(typeof r.response.objectId).toEqual('string');
        expect(typeof r.response.createdAt).toEqual('string');
        expect(typeof r.response.username).toEqual('string');
        expect(typeof r.response.updatedAt).toEqual('string');
        expect(r.response.objectId).toEqual(newUserSignedUpByFacebookObjectId);
        return rest.find(config, auth.master(config), '_Session', {
          sessionToken: r.response.sessionToken,
        });
      })
      .then(response => {
        expect(response.results.length).toEqual(1);
        const output = response.results[0];
        expect(output.user.objectId).toEqual(newUserSignedUpByFacebookObjectId);
        done();
      })
      .catch(err => {
        jfail(err);
        done();
      });
  });

  it('stores pointers', done => {
    const obj = {
      foo: 'bar',
      aPointer: {
        __type: 'Pointer',
        className: 'JustThePointer',
        objectId: 'qwerty1234', // make it 10 chars to match PG storage
      },
    };
    rest
      .create(config, auth.nobody(config), 'APointerDarkly', obj)
      .then(() =>
        database.adapter.find(
          'APointerDarkly',
          {
            fields: {
              foo: { type: 'String' },
              aPointer: { type: 'Pointer', targetClass: 'JustThePointer' },
            },
          },
          {},
          {}
        )
      )
      .then(results => {
        expect(results.length).toEqual(1);
        const output = results[0];
        expect(typeof output.foo).toEqual('string');
        expect(typeof output._p_aPointer).toEqual('undefined');
        expect(output._p_aPointer).toBeUndefined();
        expect(output.aPointer).toEqual({
          __type: 'Pointer',
          className: 'JustThePointer',
          objectId: 'qwerty1234',
        });
        done();
      });
  });

  it('stores pointers to objectIds larger than 10 characters', done => {
    const obj = {
      foo: 'bar',
      aPointer: {
        __type: 'Pointer',
        className: 'JustThePointer',
        objectId: '49F62F92-9B56-46E7-A3D4-BBD14C52F666',
      },
    };
    rest
      .create(config, auth.nobody(config), 'APointerDarkly', obj)
      .then(() =>
        database.adapter.find(
          'APointerDarkly',
          {
            fields: {
              foo: { type: 'String' },
              aPointer: { type: 'Pointer', targetClass: 'JustThePointer' },
            },
          },
          {},
          {}
        )
      )
      .then(results => {
        expect(results.length).toEqual(1);
        const output = results[0];
        expect(typeof output.foo).toEqual('string');
        expect(typeof output._p_aPointer).toEqual('undefined');
        expect(output._p_aPointer).toBeUndefined();
        expect(output.aPointer).toEqual({
          __type: 'Pointer',
          className: 'JustThePointer',
          objectId: '49F62F92-9B56-46E7-A3D4-BBD14C52F666',
        });
        done();
      });
  });

  it('cannot set objectId', done => {
    const headers = {
      'Content-Type': 'application/json',
      'X-Parse-Application-Id': 'test',
      'X-Parse-REST-API-Key': 'rest',
    };
    request({
      headers: headers,
      method: 'POST',
      url: 'http://localhost:8378/1/classes/TestObject',
      body: JSON.stringify({
        foo: 'bar',
        objectId: 'hello',
      }),
    }).then(fail, response => {
      const b = response.data;
      expect(b.code).toEqual(105);
      expect(b.error).toEqual('objectId is an invalid field name.');
      done();
    });
  });

  it('cannot set id', done => {
    const headers = {
      'Content-Type': 'application/json',
      'X-Parse-Application-Id': 'test',
      'X-Parse-REST-API-Key': 'rest',
    };
    request({
      headers: headers,
      method: 'POST',
      url: 'http://localhost:8378/1/classes/TestObject',
      body: JSON.stringify({
        foo: 'bar',
        id: 'hello',
      }),
    }).then(fail, response => {
      const b = response.data;
      expect(b.code).toEqual(105);
      expect(b.error).toEqual('id is an invalid field name.');
      done();
    });
  });

  it('test default session length', done => {
    const user = {
      username: 'asdf',
      password: 'zxcv',
      foo: 'bar',
    };
    const now = new Date();

    rest
      .create(config, auth.nobody(config), '_User', user)
      .then(r => {
        expect(Object.keys(r.response).length).toEqual(3);
        expect(typeof r.response.objectId).toEqual('string');
        expect(typeof r.response.createdAt).toEqual('string');
        expect(typeof r.response.sessionToken).toEqual('string');
        return rest.find(config, auth.master(config), '_Session', {
          sessionToken: r.response.sessionToken,
        });
      })
      .then(r => {
        expect(r.results.length).toEqual(1);

        const session = r.results[0];
        const actual = new Date(session.expiresAt.iso);
        const expected = new Date(now.getTime() + 1000 * 3600 * 24 * 365);

        expect(actual.getFullYear()).toEqual(expected.getFullYear());
        expect(actual.getMonth()).toEqual(expected.getMonth());
        expect(actual.getDate()).toEqual(expected.getDate());
        // less than a minute, if test happen at the wrong time :/
        expect(actual.getMinutes() - expected.getMinutes() <= 1).toBe(true);

        done();
      });
  });

  it('test specified session length', done => {
    const user = {
      username: 'asdf',
      password: 'zxcv',
      foo: 'bar',
    };
    const sessionLength = 3600, // 1 Hour ahead
      now = new Date(); // For reference later
    config.sessionLength = sessionLength;

    rest
      .create(config, auth.nobody(config), '_User', user)
      .then(r => {
        expect(Object.keys(r.response).length).toEqual(3);
        expect(typeof r.response.objectId).toEqual('string');
        expect(typeof r.response.createdAt).toEqual('string');
        expect(typeof r.response.sessionToken).toEqual('string');
        return rest.find(config, auth.master(config), '_Session', {
          sessionToken: r.response.sessionToken,
        });
      })
      .then(r => {
        expect(r.results.length).toEqual(1);

        const session = r.results[0];
        const actual = new Date(session.expiresAt.iso);
        const expected = new Date(now.getTime() + sessionLength * 1000);

        expect(actual.getFullYear()).toEqual(expected.getFullYear());
        expect(actual.getMonth()).toEqual(expected.getMonth());
        expect(actual.getDate()).toEqual(expected.getDate());
        expect(actual.getHours()).toEqual(expected.getHours());
        expect(actual.getMinutes()).toEqual(expected.getMinutes());

        done();
      })
      .catch(err => {
        jfail(err);
        done();
      });
  });

  it('can create a session with no expiration', done => {
    const user = {
      username: 'asdf',
      password: 'zxcv',
      foo: 'bar',
    };
    config.expireInactiveSessions = false;

    rest
      .create(config, auth.nobody(config), '_User', user)
      .then(r => {
        expect(Object.keys(r.response).length).toEqual(3);
        expect(typeof r.response.objectId).toEqual('string');
        expect(typeof r.response.createdAt).toEqual('string');
        expect(typeof r.response.sessionToken).toEqual('string');
        return rest.find(config, auth.master(config), '_Session', {
          sessionToken: r.response.sessionToken,
        });
      })
      .then(r => {
        expect(r.results.length).toEqual(1);

        const session = r.results[0];
        expect(session.expiresAt).toBeUndefined();

        done();
      })
      .catch(err => {
        console.error(err);
        fail(err);
        done();
      });
  });

  it('can create object in volatileClasses if masterKey', done => {
    rest
      .create(config, auth.master(config), '_PushStatus', {})
      .then(r => {
        expect(r.response.objectId.length).toBe(10);
      })
      .then(() => {
        rest.create(config, auth.master(config), '_JobStatus', {}).then(r => {
          expect(r.response.objectId.length).toBe(10);
          done();
        });
      });
  });

  it('cannot create object in volatileClasses if not masterKey', done => {
    Promise.resolve()
      .then(() => {
        return rest.create(config, auth.nobody(config), '_PushStatus', {});
      })
      .catch(error => {
        expect(error.code).toEqual(119);
        done();
      });
  });

  it('locks down session', done => {
    let currentUser;
    Parse.User.signUp('foo', 'bar')
      .then(user => {
        currentUser = user;
        const sessionToken = user.getSessionToken();
        const headers = {
          'Content-Type': 'application/json',
          'X-Parse-Application-Id': 'test',
          'X-Parse-REST-API-Key': 'rest',
          'X-Parse-Session-Token': sessionToken,
        };
        let sessionId;
        return request({
          headers: headers,
          url: 'http://localhost:8378/1/sessions/me',
        })
          .then(response => {
            sessionId = response.data.objectId;
            return request({
              headers,
              method: 'PUT',
              url: 'http://localhost:8378/1/sessions/' + sessionId,
              body: {
                installationId: 'yolo',
              },
            });
          })
          .then(done.fail, res => {
            expect(res.status).toBe(400);
            expect(res.data.code).toBe(105);
            return request({
              headers,
              method: 'PUT',
              url: 'http://localhost:8378/1/sessions/' + sessionId,
              body: {
                sessionToken: 'yolo',
              },
            });
          })
          .then(done.fail, res => {
            expect(res.status).toBe(400);
            expect(res.data.code).toBe(105);
            return Parse.User.signUp('other', 'user');
          })
          .then(otherUser => {
            const user = new Parse.User();
            user.id = otherUser.id;
            return request({
              headers,
              method: 'PUT',
              url: 'http://localhost:8378/1/sessions/' + sessionId,
              body: {
                user: Parse._encode(user),
              },
            });
          })
          .then(done.fail, res => {
            expect(res.status).toBe(400);
            expect(res.data.code).toBe(105);
            const user = new Parse.User();
            user.id = currentUser.id;
            return request({
              headers,
              method: 'PUT',
              url: 'http://localhost:8378/1/sessions/' + sessionId,
              body: {
                user: Parse._encode(user),
              },
            });
          })
          .then(done)
          .catch(done.fail);
      })
      .catch(done.fail);
  });

  it('sets current user in new sessions', done => {
    let currentUser;
    Parse.User.signUp('foo', 'bar')
      .then(user => {
        currentUser = user;
        const sessionToken = user.getSessionToken();
        const headers = {
          'X-Parse-Application-Id': 'test',
          'X-Parse-REST-API-Key': 'rest',
          'X-Parse-Session-Token': sessionToken,
          'Content-Type': 'application/json',
        };
        return request({
          headers,
          method: 'POST',
          url: 'http://localhost:8378/1/sessions',
          body: {
            user: { __type: 'Pointer', className: '_User', objectId: 'fakeId' },
          },
        });
      })
      .then(response => {
        if (response.data.user.objectId === currentUser.id) {
          return done();
        } else {
          return done.fail();
        }
      })
      .catch(done.fail);
  });
});

describe('rest update', () => {
  it('ignores createdAt', done => {
    const config = Config.get('test');
    const nobody = auth.nobody(config);
    const className = 'Foo';
    const newCreatedAt = new Date('1970-01-01T00:00:00.000Z');

    rest
      .create(config, nobody, className, {})
      .then(res => {
        const objectId = res.response.objectId;
        const restObject = {
          createdAt: { __type: 'Date', iso: newCreatedAt }, // should be ignored
        };

        return rest.update(config, nobody, className, { objectId }, restObject).then(() => {
          const restWhere = {
            objectId: objectId,
          };
          return rest.find(config, nobody, className, restWhere, {});
        });
      })
      .then(res2 => {
        const updatedObject = res2.results[0];
        expect(new Date(updatedObject.createdAt)).not.toEqual(newCreatedAt);
        done();
      })
      .then(done)
      .catch(done.fail);
  });
});

describe('read-only masterKey', () => {
  it('properly throws on rest.create, rest.update and rest.del', () => {
    const config = Config.get('test');
    const readOnly = auth.readOnly(config);
    expect(() => {
      rest.create(config, readOnly, 'AnObject', {});
    }).toThrow(
      new Parse.Error(
        Parse.Error.OPERATION_FORBIDDEN,
        `read-only masterKey isn't allowed to perform the create operation.`
      )
    );
    expect(() => {
      rest.update(config, readOnly, 'AnObject', {});
    }).toThrow();
    expect(() => {
      rest.del(config, readOnly, 'AnObject', {});
    }).toThrow();
  });

  it('properly blocks writes', done => {
    reconfigureServer({
      readOnlyMasterKey: 'yolo-read-only',
    })
      .then(() => {
        return request({
          url: `${Parse.serverURL}/classes/MyYolo`,
          method: 'POST',
          headers: {
            'X-Parse-Application-Id': Parse.applicationId,
            'X-Parse-Master-Key': 'yolo-read-only',
            'Content-Type': 'application/json',
          },
          body: { foo: 'bar' },
        });
      })
      .then(done.fail)
      .catch(res => {
        expect(res.data.code).toBe(Parse.Error.OPERATION_FORBIDDEN);
        expect(res.data.error).toBe(
          "read-only masterKey isn't allowed to perform the create operation."
        );
        done();
      });
  });

  it('should throw when masterKey and readOnlyMasterKey are the same', done => {
    reconfigureServer({
      masterKey: 'yolo',
      readOnlyMasterKey: 'yolo',
    })
      .then(done.fail)
      .catch(err => {
        expect(err).toEqual(new Error('masterKey and readOnlyMasterKey should be different'));
        done();
      });
  });

  it('should throw when trying to create RestWrite', () => {
    const config = Config.get('test');
    expect(() => {
      new RestWrite(config, auth.readOnly(config));
    }).toThrow(
      new Parse.Error(
        Parse.Error.OPERATION_FORBIDDEN,
        'Cannot perform a write operation when using readOnlyMasterKey'
      )
    );
  });

  it('should throw when trying to create schema', done => {
    return request({
      method: 'POST',
      url: `${Parse.serverURL}/schemas`,
      headers: {
        'X-Parse-Application-Id': Parse.applicationId,
        'X-Parse-Master-Key': 'read-only-test',
        'Content-Type': 'application/json',
      },
      json: {},
    })
      .then(done.fail)
      .catch(res => {
        expect(res.data.code).toBe(Parse.Error.OPERATION_FORBIDDEN);
        expect(res.data.error).toBe("read-only masterKey isn't allowed to create a schema.");
        done();
      });
  });

  it('should throw when trying to create schema with a name', done => {
    return request({
      url: `${Parse.serverURL}/schemas/MyClass`,
      method: 'POST',
      headers: {
        'X-Parse-Application-Id': Parse.applicationId,
        'X-Parse-Master-Key': 'read-only-test',
        'Content-Type': 'application/json',
      },
      json: {},
    })
      .then(done.fail)
      .catch(res => {
        expect(res.data.code).toBe(Parse.Error.OPERATION_FORBIDDEN);
        expect(res.data.error).toBe("read-only masterKey isn't allowed to create a schema.");
        done();
      });
  });

  it('should throw when trying to update schema', done => {
    return request({
      url: `${Parse.serverURL}/schemas/MyClass`,
      method: 'PUT',
      headers: {
        'X-Parse-Application-Id': Parse.applicationId,
        'X-Parse-Master-Key': 'read-only-test',
        'Content-Type': 'application/json',
      },
      json: {},
    })
      .then(done.fail)
      .catch(res => {
        expect(res.data.code).toBe(Parse.Error.OPERATION_FORBIDDEN);
        expect(res.data.error).toBe("read-only masterKey isn't allowed to update a schema.");
        done();
      });
  });

  it('should throw when trying to delete schema', done => {
    return request({
      url: `${Parse.serverURL}/schemas/MyClass`,
      method: 'DELETE',
      headers: {
        'X-Parse-Application-Id': Parse.applicationId,
        'X-Parse-Master-Key': 'read-only-test',
        'Content-Type': 'application/json',
      },
      json: {},
    })
      .then(done.fail)
      .catch(res => {
        expect(res.data.code).toBe(Parse.Error.OPERATION_FORBIDDEN);
        expect(res.data.error).toBe("read-only masterKey isn't allowed to delete a schema.");
        done();
      });
  });

  it('should throw when trying to update the global config', done => {
    return request({
      url: `${Parse.serverURL}/config`,
      method: 'PUT',
      headers: {
        'X-Parse-Application-Id': Parse.applicationId,
        'X-Parse-Master-Key': 'read-only-test',
        'Content-Type': 'application/json',
      },
      json: {},
    })
      .then(done.fail)
      .catch(res => {
        expect(res.data.code).toBe(Parse.Error.OPERATION_FORBIDDEN);
        expect(res.data.error).toBe("read-only masterKey isn't allowed to update the config.");
        done();
      });
  });

  it('should throw when trying to send push', done => {
    return request({
      url: `${Parse.serverURL}/push`,
      method: 'POST',
      headers: {
        'X-Parse-Application-Id': Parse.applicationId,
        'X-Parse-Master-Key': 'read-only-test',
        'Content-Type': 'application/json',
      },
      json: {},
    })
      .then(done.fail)
      .catch(res => {
        expect(res.data.code).toBe(Parse.Error.OPERATION_FORBIDDEN);
        expect(res.data.error).toBe(
          "read-only masterKey isn't allowed to send push notifications."
        );
        done();
      });
  });
});
