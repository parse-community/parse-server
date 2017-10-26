const ParseServerRESTController = require('../src/ParseServerRESTController').ParseServerRESTController;
const ParseServer = require('../src/ParseServer').default;
const Parse = require('parse/node').Parse;

let RESTController;

describe('ParseServerRESTController', () => {

  beforeEach(() => {
    RESTController = ParseServerRESTController(Parse.applicationId, ParseServer.promiseRouter({appId: Parse.applicationId}));
  })

  it('should handle a get request', (done) => {
    RESTController.request("GET", "/classes/MyObject").then((res) => {
      expect(res.results.length).toBe(0);
      done();
    }, (err) => {
      console.log(err);
      jfail(err);
      done();
    });
  });

  it('should handle a get request with full serverURL mount path', (done) => {
    RESTController.request("GET", "/1/classes/MyObject").then((res) => {
      expect(res.results.length).toBe(0);
      done();
    }, (err) => {
      jfail(err);
      done();
    });
  });

  it('should handle a POST batch', (done) => {
    RESTController.request("POST", "batch", {
      requests: [
        {
          method: 'GET',
          path: '/classes/MyObject'
        },
        {
          method: 'POST',
          path: '/classes/MyObject',
          body: {"key": "value"}
        },
        {
          method: 'GET',
          path: '/classes/MyObject'
        }
      ]
    }).then((res) => {
      expect(res.length).toBe(3);
      done();
    }, (err) => {
      jfail(err);
      done();
    });
  });

  it('should handle a POST request', (done) => {
    RESTController.request("POST", "/classes/MyObject", {"key": "value"}).then(() => {
      return RESTController.request("GET", "/classes/MyObject");
    }).then((res) => {
      expect(res.results.length).toBe(1);
      expect(res.results[0].key).toEqual("value");
      done();
    }).fail((err) => {
      console.log(err);
      jfail(err);
      done();
    });
  });

  it('ensures sessionTokens are properly handled', (done) => {
    let userId;
    Parse.User.signUp('user', 'pass').then((user) => {
      userId = user.id;
      const sessionToken = user.getSessionToken();
      return RESTController.request("GET", "/users/me", undefined, {sessionToken});
    }).then((res) => {
      // Result is in JSON format
      expect(res.objectId).toEqual(userId);
      done();
    }).fail((err) => {
      console.log(err);
      jfail(err);
      done();
    });
  });

  it('ensures masterKey is properly handled', (done) => {
    let userId;
    Parse.User.signUp('user', 'pass').then((user) => {
      userId = user.id;
      return Parse.User.logOut().then(() => {
        return RESTController.request("GET", "/classes/_User", undefined, {useMasterKey: true});
      });
    }).then((res) => {
      expect(res.results.length).toBe(1);
      expect(res.results[0].objectId).toEqual(userId);
      done();
    }, (err) => {
      jfail(err);
      done();
    });
  });

  it('ensures no user is created when passing an empty username', (done) => {
    RESTController.request("POST", "/classes/_User", {username: "", password: "world"}).then(() => {
      jfail(new Error('Success callback should not be called when passing an empty username.'));
      done();
    }, (err) => {
      expect(err.code).toBe(Parse.Error.USERNAME_MISSING);
      expect(err.message).toBe('bad or missing username');
      done();
    });
  });

  it('ensures no user is created when passing an empty password', (done) => {
    RESTController.request("POST", "/classes/_User", {username: "hello", password: ""}).then(() => {
      jfail(new Error('Success callback should not be called when passing an empty password.'));
      done();
    }, (err) => {
      expect(err.code).toBe(Parse.Error.PASSWORD_MISSING);
      expect(err.message).toBe('password is required');
      done();
    });
  });

  it('ensures no session token is created on creating users', (done) => {
    RESTController.request("POST", "/classes/_User", {username: "hello", password: "world"}).then((user) => {
      expect(user.sessionToken).toBeUndefined();
      const query = new Parse.Query('_Session');
      return query.find({useMasterKey: true});
    }).then(sessions => {
      expect(sessions.length).toBe(0);
      done();
    }, done.fail);
  });

  it('ensures a session token is created when passing installationId != cloud', (done) => {
    RESTController.request("POST", "/classes/_User", {username: "hello", password: "world"}, {installationId: 'my-installation'}).then((user) => {
      expect(user.sessionToken).not.toBeUndefined();
      const query = new Parse.Query('_Session');
      return query.find({useMasterKey: true});
    }).then(sessions => {
      expect(sessions.length).toBe(1);
      expect(sessions[0].get('installationId')).toBe('my-installation');
      done();
    }, (err) => {
      jfail(err);
      done();
    });
  });
});
