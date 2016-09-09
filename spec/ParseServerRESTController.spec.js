const ParseServerRESTController = require('../src/ParseServerRESTController').ParseServerRESTController;
const ParseServer = require('../src/ParseServer').default;
let RESTController;

describe('ParseServerRESTController', () => {

  beforeEach(() => {
    RESTController = ParseServerRESTController(Parse.applicationId, ParseServer.promiseRouter({appId: Parse.applicationId}));
  })

  it('should handle a get request', (done) => {
    RESTController.request("GET", "/classes/MyObject").then((res) => {
      expect(res.results.length).toBe(0);
      done();
    }, (err) => {
      console.log(err);
      jfail(err);
      done();
    });
  });

  it('should handle a get request with full serverURL mount path', (done) => {
    RESTController.request("GET", "/1/classes/MyObject").then((res) => {
      expect(res.results.length).toBe(0);
      done();
    }, (err) => {
      jfail(err);
      done();
    });
  });

  it('should handle a POST batch', (done) => {
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
    }).then((res) => {
      expect(res.length).toBe(3);
      done();
    }, (err) => {
      jfail(err);
      done();
    });
  });

  it('should handle a POST request', (done) => {
    RESTController.request("POST", "/classes/MyObject", {"key": "value"}).then((res) => {
      return RESTController.request("GET", "/classes/MyObject");
    }).then((res) => {
      expect(res.results.length).toBe(1);
      expect(res.results[0].key).toEqual("value");
      done();
    }).fail((err) => {
      console.log(err);
      jfail(err);
      done();
    });
  });

  it('ensures sessionTokens are properly handled', (done) => {
    let userId;
    Parse.User.signUp('user', 'pass').then((user) => {
      userId = user.id;
      let sessionToken = user.getSessionToken();
      return RESTController.request("GET", "/users/me", undefined, {sessionToken});
    }).then((res) => {
      // Result is in JSON format
      expect(res.objectId).toEqual(userId);
      done();
    }).fail((err) => {
      console.log(err);
      jfail(err);
      done();
    });
  });

  it('ensures masterKey is properly handled', (done) => {
    let userId;
    Parse.User.signUp('user', 'pass').then((user) => {
      userId = user.id;
      let sessionToken = user.getSessionToken();
      return Parse.User.logOut().then(() => {
        return RESTController.request("GET", "/classes/_User", undefined, {useMasterKey: true});
      });
    }).then((res) => {
      expect(res.results.length).toBe(1);
      expect(res.results[0].objectId).toEqual(userId);
      done();
    }, (err) => {
      jfail(err);
      done();
    });
  });

  it('ensures no session token is created on creating users', (done) => {
    RESTController.request("POST", "/classes/_User", {username: "hello", password: "world"}).then(() => {
      let query = new Parse.Query('_Session');
      return query.find({useMasterKey: true});
    }).then(sessions => {
      expect(sessions.length).toBe(0);
      done();
    }, (err) => {
      jfail(err);
      done();
    });
  });
});