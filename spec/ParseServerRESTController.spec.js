const ParseServerRESTController = require('../lib/ParseServerRESTController')
  .ParseServerRESTController;
const ParseServer = require('../lib/ParseServer').default;
const Parse = require('parse/node').Parse;
const TestUtils = require('../lib/TestUtils');

let RESTController;

describe('ParseServerRESTController', () => {
  beforeEach(() => {
    RESTController = ParseServerRESTController(
      Parse.applicationId,
      ParseServer.promiseRouter({ appId: Parse.applicationId })
    );
  });

  it('should handle a get request', async () => {
    const res = await RESTController.request('GET', '/classes/MyObject');
    expect(res.results.length).toBe(0);
  });

  it('should handle a get request with full serverURL mount path', async () => {
    const res = await RESTController.request('GET', '/1/classes/MyObject');
    expect(res.results.length).toBe(0);
  });

  it('should handle a POST batch without transaction', async () => {
    const res = await RESTController.request('POST', 'batch', {
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
    });
    expect(res.length).toBe(3);
  });

  it('should handle a POST batch with transaction=false', async () => {
    const res = await RESTController.request('POST', 'batch', {
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
    });
    expect(res.length).toBe(3);
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
    process.env.MONGODB_TOPOLOGY === 'replicaset' ||
    process.env.PARSE_SERVER_TEST_DB === 'postgres'
  ) {
    describe('transactions', () => {
      beforeEach(async () => {
        await TestUtils.destroyAllDataPermanently(true);
        if (process.env.MONGODB_TOPOLOGY === 'replicaset') {
          await reconfigureServer({
            databaseAdapter: undefined,
            databaseURI:
              'mongodb://localhost:27017/parseServerMongoAdapterTestDatabase?replicaSet=replicaset',
          });
        } else {
          await reconfigureServer();
        }
      });

      it('should handle a batch request with transaction = true', async () => {
        const myObject = new Parse.Object('MyObject'); // This is important because transaction only works on pre-existing collections
        await myObject.save();
        await myObject.destroy();
        spyOn(databaseAdapter, 'createObject').and.callThrough();
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
        const query = new Parse.Query('MyObject');
        const results = await query.find();
        expect(databaseAdapter.createObject.calls.count() % 2).toBe(0);
        for (let i = 0; i + 1 < databaseAdapter.createObject.calls.length; i = i + 2) {
          expect(databaseAdapter.createObject.calls.argsFor(i)[3]).toBe(
            databaseAdapter.createObject.calls.argsFor(i + 1)[3]
          );
        }
        expect(results.map(result => result.get('key')).sort()).toEqual(['value1', 'value2']);
      });

      it('should not save anything when one operation fails in a transaction', async () => {
        const myObject = new Parse.Object('MyObject'); // This is important because transaction only works on pre-existing collections
        await myObject.save();
        await myObject.destroy();
        try {
          await RESTController.request('POST', 'batch', {
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
          });
          fail();
        } catch (error) {
          expect(error).toBeDefined();
          const query = new Parse.Query('MyObject');
          const results = await query.find();
          expect(results.length).toBe(0);
        }
      });

      it('should generate separate session for each call', async () => {
        await reconfigureServer();
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

        expect(databaseAdapter.createObject.calls.count() >= 13).toEqual(true);
        let transactionalSession;
        let transactionalSession2;
        let myObjectDBCalls = 0;
        let myObject2DBCalls = 0;
        let myObject3DBCalls = 0;
        for (let i = 0; i < databaseAdapter.createObject.calls.count(); i++) {
          const args = databaseAdapter.createObject.calls.argsFor(i);
          switch (args[0]) {
            case 'MyObject':
              myObjectDBCalls++;
              if (!transactionalSession || (myObjectDBCalls - 1) % 2 === 0) {
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
              if (!transactionalSession2 || (myObject2DBCalls - 1) % 9 === 0) {
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
        expect(myObjectDBCalls % 2).toEqual(0);
        expect(myObjectDBCalls > 0).toEqual(true);
        expect(myObject2DBCalls % 9).toEqual(0);
        expect(myObject2DBCalls > 0).toEqual(true);
        expect(myObject3DBCalls % 2).toEqual(0);
        expect(myObject3DBCalls > 0).toEqual(true);
      });
    });
  }

  it('should handle a POST request', async () => {
    await RESTController.request('POST', '/classes/MyObject', { key: 'value' });
    const res = await RESTController.request('GET', '/classes/MyObject');
    expect(res.results.length).toBe(1);
    expect(res.results[0].key).toEqual('value');
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

  it('ensures sessionTokens are properly handled', async () => {
    const user = await Parse.User.signUp('user', 'pass');
    const sessionToken = user.getSessionToken();
    const res = await RESTController.request('GET', '/users/me', undefined, {
      sessionToken,
    });
    // Result is in JSON format
    expect(res.objectId).toEqual(user.id);
  });

  it('ensures masterKey is properly handled', async () => {
    const user = await Parse.User.signUp('user', 'pass');
    const userId = user.id;
    await Parse.User.logOut();
    const res = await RESTController.request('GET', '/classes/_User', undefined, {
      useMasterKey: true,
    });
    expect(res.results.length).toBe(1);
    expect(res.results[0].objectId).toEqual(userId);
  });

  it('ensures no user is created when passing an empty username', async () => {
    try {
      await RESTController.request('POST', '/classes/_User', {
        username: '',
        password: 'world',
      });
      fail('Success callback should not be called when passing an empty username.');
    } catch (err) {
      expect(err.code).toBe(Parse.Error.USERNAME_MISSING);
      expect(err.message).toBe('bad or missing username');
    }
  });

  it('ensures no user is created when passing an empty password', async () => {
    try {
      await RESTController.request('POST', '/classes/_User', {
        username: 'hello',
        password: '',
      });
      fail('Success callback should not be called when passing an empty password.');
    } catch (err) {
      expect(err.code).toBe(Parse.Error.PASSWORD_MISSING);
      expect(err.message).toBe('password is required');
    }
  });

  it('ensures no session token is created on creating users', async () => {
    const user = await RESTController.request('POST', '/classes/_User', {
      username: 'hello',
      password: 'world',
    });
    expect(user.sessionToken).toBeUndefined();
    const query = new Parse.Query('_Session');
    const sessions = await query.find({ useMasterKey: true });
    expect(sessions.length).toBe(0);
  });

  it('ensures a session token is created when passing installationId != cloud', async () => {
    const user = await RESTController.request(
      'POST',
      '/classes/_User',
      { username: 'hello', password: 'world' },
      { installationId: 'my-installation' }
    );
    expect(user.sessionToken).not.toBeUndefined();
    const query = new Parse.Query('_Session');
    const sessions = await query.find({ useMasterKey: true });
    expect(sessions.length).toBe(1);
    expect(sessions[0].get('installationId')).toBe('my-installation');
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
