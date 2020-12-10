const ParseServerRESTController = require('../lib/ParseServerRESTController')
  .ParseServerRESTController;
const ParseServer = require('../lib/ParseServer').default;
const Parse = require('parse/node').Parse;
const TestUtils = require('../lib/TestUtils');
const semver = require('semver');

let RESTController;

describe('ParseServerRESTController', () => {
  beforeEach(() => {
    RESTController = ParseServerRESTController(
      Parse.applicationId,
      ParseServer.promiseRouter({ appId: Parse.applicationId })
    );
  });

  it('should handle a get request', done => {
    RESTController.request('GET', '/classes/MyObject').then(
      res => {
        expect(res.results.length).toBe(0);
        done();
      },
      err => {
        console.log(err);
        jfail(err);
        done();
      }
    );
  });

  it('should handle a get request with full serverURL mount path', done => {
    RESTController.request('GET', '/1/classes/MyObject').then(
      res => {
        expect(res.results.length).toBe(0);
        done();
      },
      err => {
        jfail(err);
        done();
      }
    );
  });

  it('should handle a POST batch without transaction', done => {
    RESTController.request('POST', 'batch', {
      requests: [
        {
          method: 'GET',
          path: '/classes/MyObject',
        },
        {
          method: 'POST',
          path: '/classes/MyObject',
          body: { key: 'value' },
        },
        {
          method: 'GET',
          path: '/classes/MyObject',
        },
      ],
    }).then(
      res => {
        expect(res.length).toBe(3);
        done();
      },
      err => {
        jfail(err);
        done();
      }
    );
  });

  it('should handle a POST batch with transaction=false', done => {
    RESTController.request('POST', 'batch', {
      requests: [
        {
          method: 'GET',
          path: '/classes/MyObject',
        },
        {
          method: 'POST',
          path: '/classes/MyObject',
          body: { key: 'value' },
        },
        {
          method: 'GET',
          path: '/classes/MyObject',
        },
      ],
      transaction: false,
    }).then(
      res => {
        expect(res.length).toBe(3);
        done();
      },
      err => {
        jfail(err);
        done();
      }
    );
  });

  it('should handle response status', async () => {
    const router = ParseServer.promiseRouter({ appId: Parse.applicationId });
    spyOn(router, 'tryRouteRequest').and.callThrough();
    RESTController = ParseServerRESTController(Parse.applicationId, router);
    const resp = await RESTController.request('POST', '/classes/MyObject');
    const { status, response, location } = await router.tryRouteRequest.calls.all()[0].returnValue;

    expect(status).toBe(201);
    expect(response).toEqual(resp);
    expect(location).toBe(`http://localhost:8378/1/classes/MyObject/${resp.objectId}`);
  });

  it('should handle response status in batch', async () => {
    const router = ParseServer.promiseRouter({ appId: Parse.applicationId });
    spyOn(router, 'tryRouteRequest').and.callThrough();
    RESTController = ParseServerRESTController(Parse.applicationId, router);
    const resp = await RESTController.request(
      'POST',
      'batch',
      {
        requests: [
          {
            method: 'POST',
            path: '/classes/MyObject',
          },
          {
            method: 'POST',
            path: '/classes/MyObject',
          },
        ],
      },
      {
        returnStatus: true,
      }
    );
    expect(resp.length).toBe(2);
    expect(resp[0]._status).toBe(201);
    expect(resp[1]._status).toBe(201);
    expect(resp[0].success).toBeDefined();
    expect(resp[1].success).toBeDefined();
    expect(router.tryRouteRequest.calls.all().length).toBe(2);
  });

  it('properly handle existed', async done => {
    const restController = Parse.CoreManager.getRESTController();
    Parse.CoreManager.setRESTController(RESTController);
    Parse.Cloud.define('handleStatus', async () => {
      const obj = new Parse.Object('TestObject');
      expect(obj.existed()).toBe(false);
      await obj.save();
      expect(obj.existed()).toBe(false);

      const query = new Parse.Query('TestObject');
      const result = await query.get(obj.id);
      expect(result.existed()).toBe(true);
      Parse.CoreManager.setRESTController(restController);
      done();
    });
    await Parse.Cloud.run('handleStatus');
  });

  if (
    (semver.satisfies(process.env.MONGODB_VERSION, '>=4.0.4') &&
      process.env.MONGODB_TOPOLOGY === 'replicaset' &&
      process.env.MONGODB_STORAGE_ENGINE === 'wiredTiger') ||
    process.env.PARSE_SERVER_TEST_DB === 'postgres'
  ) {
    describe('transactions', () => {
      beforeAll(async () => {
        if (
          semver.satisfies(process.env.MONGODB_VERSION, '>=4.0.4') &&
          process.env.MONGODB_TOPOLOGY === 'replicaset' &&
          process.env.MONGODB_STORAGE_ENGINE === 'wiredTiger'
        ) {
          await reconfigureServer({
            databaseAdapter: undefined,
            databaseURI:
              'mongodb://localhost:27017/parseServerMongoAdapterTestDatabase?replicaSet=replicaset',
          });
        }
      });

      beforeEach(async () => {
        await TestUtils.destroyAllDataPermanently(true);
      });

      it('should handle a batch request with transaction = true', done => {
        const myObject = new Parse.Object('MyObject'); // This is important because transaction only works on pre-existing collections
        myObject
          .save()
          .then(() => {
            return myObject.destroy();
          })
          .then(() => {
            spyOn(databaseAdapter, 'createObject').and.callThrough();

            RESTController.request('POST', 'batch', {
              requests: [
                {
                  method: 'POST',
                  path: '/1/classes/MyObject',
                  body: { key: 'value1' },
                },
                {
                  method: 'POST',
                  path: '/1/classes/MyObject',
                  body: { key: 'value2' },
                },
              ],
              transaction: true,
            }).then(response => {
              expect(response.length).toEqual(2);
              expect(response[0].success.objectId).toBeDefined();
              expect(response[0].success.createdAt).toBeDefined();
              expect(response[1].success.objectId).toBeDefined();
              expect(response[1].success.createdAt).toBeDefined();
              const query = new Parse.Query('MyObject');
              query.find().then(results => {
                expect(databaseAdapter.createObject.calls.count()).toBe(2);
                expect(databaseAdapter.createObject.calls.argsFor(0)[3]).toBe(
                  databaseAdapter.createObject.calls.argsFor(1)[3]
                );
                expect(results.map(result => result.get('key')).sort()).toEqual([
                  'value1',
                  'value2',
                ]);
                done();
              });
            });
          });
      });

      it('should not save anything when one operation fails in a transaction', done => {
        const myObject = new Parse.Object('MyObject'); // This is important because transaction only works on pre-existing collections
        myObject
          .save()
          .then(() => {
            return myObject.destroy();
          })
          .then(() => {
            RESTController.request('POST', 'batch', {
              requests: [
                {
                  method: 'POST',
                  path: '/1/classes/MyObject',
                  body: { key: 'value1' },
                },
                {
                  method: 'POST',
                  path: '/1/classes/MyObject',
                  body: { key: 10 },
                },
                {
                  method: 'POST',
                  path: '/1/classes/MyObject',
                  body: { key: 'value1' },
                },
                {
                  method: 'POST',
                  path: '/1/classes/MyObject',
                  body: { key: 10 },
                },
                {
                  method: 'POST',
                  path: '/1/classes/MyObject',
                  body: { key: 'value1' },
                },
                {
                  method: 'POST',
                  path: '/1/classes/MyObject',
                  body: { key: 10 },
                },
                {
                  method: 'POST',
                  path: '/1/classes/MyObject',
                  body: { key: 'value1' },
                },
                {
                  method: 'POST',
                  path: '/1/classes/MyObject',
                  body: { key: 10 },
                },
                {
                  method: 'POST',
                  path: '/1/classes/MyObject',
                  body: { key: 'value1' },
                },
                {
                  method: 'POST',
                  path: '/1/classes/MyObject',
                  body: { key: 10 },
                },
                {
                  method: 'POST',
                  path: '/1/classes/MyObject',
                  body: { key: 'value1' },
                },
                {
                  method: 'POST',
                  path: '/1/classes/MyObject',
                  body: { key: 10 },
                },
                {
                  method: 'POST',
                  path: '/1/classes/MyObject',
                  body: { key: 'value1' },
                },
                {
                  method: 'POST',
                  path: '/1/classes/MyObject',
                  body: { key: 10 },
                },
                {
                  method: 'POST',
                  path: '/1/classes/MyObject',
                  body: { key: 'value1' },
                },
                {
                  method: 'POST',
                  path: '/1/classes/MyObject',
                  body: { key: 10 },
                },
                {
                  method: 'POST',
                  path: '/1/classes/MyObject',
                  body: { key: 'value1' },
                },
                {
                  method: 'POST',
                  path: '/1/classes/MyObject',
                  body: { key: 10 },
                },
              ],
              transaction: true,
            }).catch(error => {
              expect(error).toBeDefined();
              const query = new Parse.Query('MyObject');
              query.find().then(results => {
                expect(results.length).toBe(0);
                done();
              });
            });
          });
      });

      it('should generate separate session for each call', async () => {
        const myObject = new Parse.Object('MyObject'); // This is important because transaction only works on pre-existing collections
        await myObject.save();
        await myObject.destroy();

        const myObject2 = new Parse.Object('MyObject2'); // This is important because transaction only works on pre-existing collections
        await myObject2.save();
        await myObject2.destroy();

        spyOn(databaseAdapter, 'createObject').and.callThrough();

        let myObjectCalls = 0;
        Parse.Cloud.beforeSave('MyObject', async () => {
          myObjectCalls++;
          if (myObjectCalls === 2) {
            try {
              await RESTController.request('POST', 'batch', {
                requests: [
                  {
                    method: 'POST',
                    path: '/1/classes/MyObject2',
                    body: { key: 'value1' },
                  },
                  {
                    method: 'POST',
                    path: '/1/classes/MyObject2',
                    body: { key: 10 },
                  },
                  {
                    method: 'POST',
                    path: '/1/classes/MyObject2',
                    body: { key: 'value1' },
                  },
                  {
                    method: 'POST',
                    path: '/1/classes/MyObject2',
                    body: { key: 10 },
                  },
                  {
                    method: 'POST',
                    path: '/1/classes/MyObject2',
                    body: { key: 'value1' },
                  },
                  {
                    method: 'POST',
                    path: '/1/classes/MyObject2',
                    body: { key: 10 },
                  },
                  {
                    method: 'POST',
                    path: '/1/classes/MyObject2',
                    body: { key: 'value1' },
                  },
                  {
                    method: 'POST',
                    path: '/1/classes/MyObject2',
                    body: { key: 10 },
                  },
                  {
                    method: 'POST',
                    path: '/1/classes/MyObject2',
                    body: { key: 'value1' },
                  },
                  {
                    method: 'POST',
                    path: '/1/classes/MyObject2',
                    body: { key: 10 },
                  },
                  {
                    method: 'POST',
                    path: '/1/classes/MyObject2',
                    body: { key: 'value1' },
                  },
                  {
                    method: 'POST',
                    path: '/1/classes/MyObject2',
                    body: { key: 10 },
                  },
                  {
                    method: 'POST',
                    path: '/1/classes/MyObject2',
                    body: { key: 'value1' },
                  },
                  {
                    method: 'POST',
                    path: '/1/classes/MyObject2',
                    body: { key: 10 },
                  },
                  {
                    method: 'POST',
                    path: '/1/classes/MyObject2',
                    body: { key: 'value1' },
                  },
                  {
                    method: 'POST',
                    path: '/1/classes/MyObject2',
                    body: { key: 10 },
                  },
                  {
                    method: 'POST',
                    path: '/1/classes/MyObject2',
                    body: { key: 'value1' },
                  },
                  {
                    method: 'POST',
                    path: '/1/classes/MyObject2',
                    body: { key: 10 },
                  },
                ],
                transaction: true,
              });
              fail('should fail');
            } catch (e) {
              expect(e).toBeDefined();
            }
          }
        });

        const response = await RESTController.request('POST', 'batch', {
          requests: [
            {
              method: 'POST',
              path: '/1/classes/MyObject',
              body: { key: 'value1' },
            },
            {
              method: 'POST',
              path: '/1/classes/MyObject',
              body: { key: 'value2' },
            },
          ],
          transaction: true,
        });

        expect(response.length).toEqual(2);
        expect(response[0].success.objectId).toBeDefined();
        expect(response[0].success.createdAt).toBeDefined();
        expect(response[1].success.objectId).toBeDefined();
        expect(response[1].success.createdAt).toBeDefined();

        await RESTController.request('POST', 'batch', {
          requests: [
            {
              method: 'POST',
              path: '/1/classes/MyObject3',
              body: { key: 'value1' },
            },
            {
              method: 'POST',
              path: '/1/classes/MyObject3',
              body: { key: 'value2' },
            },
          ],
        });

        const query = new Parse.Query('MyObject');
        const results = await query.find();
        expect(results.map(result => result.get('key')).sort()).toEqual(['value1', 'value2']);

        const query2 = new Parse.Query('MyObject2');
        const results2 = await query2.find();
        expect(results2.length).toEqual(0);

        const query3 = new Parse.Query('MyObject3');
        const results3 = await query3.find();
        expect(results3.map(result => result.get('key')).sort()).toEqual(['value1', 'value2']);

        expect(databaseAdapter.createObject.calls.count()).toBe(13);
        let transactionalSession;
        let transactionalSession2;
        let myObjectDBCalls = 0;
        let myObject2DBCalls = 0;
        let myObject3DBCalls = 0;
        for (let i = 0; i < 13; i++) {
          const args = databaseAdapter.createObject.calls.argsFor(i);
          switch (args[0]) {
            case 'MyObject':
              myObjectDBCalls++;
              if (!transactionalSession) {
                transactionalSession = args[3];
              } else {
                expect(transactionalSession).toBe(args[3]);
              }
              if (transactionalSession2) {
                expect(transactionalSession2).not.toBe(args[3]);
              }
              break;
            case 'MyObject2':
              myObject2DBCalls++;
              if (!transactionalSession2) {
                transactionalSession2 = args[3];
              } else {
                expect(transactionalSession2).toBe(args[3]);
              }
              if (transactionalSession) {
                expect(transactionalSession).not.toBe(args[3]);
              }
              break;
            case 'MyObject3':
              myObject3DBCalls++;
              expect(args[3]).toEqual(null);
              break;
          }
        }
        expect(myObjectDBCalls).toEqual(2);
        expect(myObject2DBCalls).toEqual(9);
        expect(myObject3DBCalls).toEqual(2);
      });
    });
  }

  it('should handle a POST request', done => {
    RESTController.request('POST', '/classes/MyObject', { key: 'value' })
      .then(() => {
        return RESTController.request('GET', '/classes/MyObject');
      })
      .then(res => {
        expect(res.results.length).toBe(1);
        expect(res.results[0].key).toEqual('value');
        done();
      })
      .catch(err => {
        console.log(err);
        jfail(err);
        done();
      });
  });

  it('should handle a POST request with context', async () => {
    Parse.Cloud.beforeSave('MyObject', req => {
      expect(req.context.a).toEqual('a');
    });
    Parse.Cloud.afterSave('MyObject', req => {
      expect(req.context.a).toEqual('a');
    });

    await RESTController.request(
      'POST',
      '/classes/MyObject',
      { key: 'value' },
      { context: { a: 'a' } }
    );
  });

  it('ensures sessionTokens are properly handled', done => {
    let userId;
    Parse.User.signUp('user', 'pass')
      .then(user => {
        userId = user.id;
        const sessionToken = user.getSessionToken();
        return RESTController.request('GET', '/users/me', undefined, {
          sessionToken,
        });
      })
      .then(res => {
        // Result is in JSON format
        expect(res.objectId).toEqual(userId);
        done();
      })
      .catch(err => {
        console.log(err);
        jfail(err);
        done();
      });
  });

  it('ensures masterKey is properly handled', done => {
    let userId;
    Parse.User.signUp('user', 'pass')
      .then(user => {
        userId = user.id;
        return Parse.User.logOut().then(() => {
          return RESTController.request('GET', '/classes/_User', undefined, {
            useMasterKey: true,
          });
        });
      })
      .then(
        res => {
          expect(res.results.length).toBe(1);
          expect(res.results[0].objectId).toEqual(userId);
          done();
        },
        err => {
          jfail(err);
          done();
        }
      );
  });

  it('ensures no user is created when passing an empty username', done => {
    RESTController.request('POST', '/classes/_User', {
      username: '',
      password: 'world',
    }).then(
      () => {
        jfail(new Error('Success callback should not be called when passing an empty username.'));
        done();
      },
      err => {
        expect(err.code).toBe(Parse.Error.USERNAME_MISSING);
        expect(err.message).toBe('bad or missing username');
        done();
      }
    );
  });

  it('ensures no user is created when passing an empty password', done => {
    RESTController.request('POST', '/classes/_User', {
      username: 'hello',
      password: '',
    }).then(
      () => {
        jfail(new Error('Success callback should not be called when passing an empty password.'));
        done();
      },
      err => {
        expect(err.code).toBe(Parse.Error.PASSWORD_MISSING);
        expect(err.message).toBe('password is required');
        done();
      }
    );
  });

  it('ensures no session token is created on creating users', done => {
    RESTController.request('POST', '/classes/_User', {
      username: 'hello',
      password: 'world',
    })
      .then(user => {
        expect(user.sessionToken).toBeUndefined();
        const query = new Parse.Query('_Session');
        return query.find({ useMasterKey: true });
      })
      .then(sessions => {
        expect(sessions.length).toBe(0);
        done();
      }, done.fail);
  });

  it('ensures a session token is created when passing installationId != cloud', done => {
    RESTController.request(
      'POST',
      '/classes/_User',
      { username: 'hello', password: 'world' },
      { installationId: 'my-installation' }
    )
      .then(user => {
        expect(user.sessionToken).not.toBeUndefined();
        const query = new Parse.Query('_Session');
        return query.find({ useMasterKey: true });
      })
      .then(
        sessions => {
          expect(sessions.length).toBe(1);
          expect(sessions[0].get('installationId')).toBe('my-installation');
          done();
        },
        err => {
          jfail(err);
          done();
        }
      );
  });

  it('ensures logIn is saved with installationId', async () => {
    const installationId = 'installation123';
    const user = await RESTController.request(
      'POST',
      '/classes/_User',
      { username: 'hello', password: 'world' },
      { installationId }
    );
    expect(user.sessionToken).not.toBeUndefined();
    const query = new Parse.Query('_Session');
    let sessions = await query.find({ useMasterKey: true });

    expect(sessions.length).toBe(1);
    expect(sessions[0].get('installationId')).toBe(installationId);
    expect(sessions[0].get('sessionToken')).toBe(user.sessionToken);

    const loggedUser = await RESTController.request(
      'POST',
      '/login',
      { username: 'hello', password: 'world' },
      { installationId }
    );
    expect(loggedUser.sessionToken).not.toBeUndefined();
    sessions = await query.find({ useMasterKey: true });

    // Should clean up old sessions with this installationId
    expect(sessions.length).toBe(1);
    expect(sessions[0].get('installationId')).toBe(installationId);
    expect(sessions[0].get('sessionToken')).toBe(loggedUser.sessionToken);
  });
});
