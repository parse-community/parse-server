const ParseServerRESTController = require('../lib/ParseServerRESTController')
  .ParseServerRESTController;
const ParseServer = require('../lib/ParseServer').default;
const Parse = require('parse/node').Parse;

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
