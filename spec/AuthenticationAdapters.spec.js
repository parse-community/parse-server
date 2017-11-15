var request = require('request');
var Config = require("../src/Config");
var defaultColumns = require('../src/Controllers/SchemaController').defaultColumns;
var authenticationLoader = require('../src/Adapters/Auth');
var path = require('path');

describe('AuthenticationProviders', function() {
  ["facebook", "github", "instagram", "google", "linkedin", "meetup", "twitter", "janrainengage", "janraincapture", "vkontakte"].map(function(providerName){
    it("Should validate structure of " + providerName, (done) => {
      var provider = require("../src/Adapters/Auth/" + providerName);
      jequal(typeof provider.validateAuthData, "function");
      jequal(typeof provider.validateAppId, "function");
      const authDataPromise = provider.validateAuthData({}, {});
      const validateAppIdPromise = provider.validateAppId("app", "key", {});
      jequal(authDataPromise.constructor, Promise.prototype.constructor);
      jequal(validateAppIdPromise.constructor, Promise.prototype.constructor);
      authDataPromise.then(()=>{}, ()=>{});
      validateAppIdPromise.then(()=>{}, ()=>{});
      done();
    });
  });

  var getMockMyOauthProvider = function() {
    return {
      authData: {
        id: "12345",
        access_token: "12345",
        expiration_date: new Date().toJSON(),
      },
      shouldError: false,
      loggedOut: false,
      synchronizedUserId: null,
      synchronizedAuthToken: null,
      synchronizedExpiration: null,

      authenticate: function(options) {
        if (this.shouldError) {
          options.error(this, "An error occurred");
        } else if (this.shouldCancel) {
          options.error(this, null);
        } else {
          options.success(this, this.authData);
        }
      },
      restoreAuthentication: function(authData) {
        if (!authData) {
          this.synchronizedUserId = null;
          this.synchronizedAuthToken = null;
          this.synchronizedExpiration = null;
          return true;
        }
        this.synchronizedUserId = authData.id;
        this.synchronizedAuthToken = authData.access_token;
        this.synchronizedExpiration = authData.expiration_date;
        return true;
      },
      getAuthType: function() {
        return "myoauth";
      },
      deauthenticate: function() {
        this.loggedOut = true;
        this.restoreAuthentication(null);
      }
    };
  };

  Parse.User.extend({
    extended: function() {
      return true;
    }
  });

  var createOAuthUser = function(callback) {
    return createOAuthUserWithSessionToken(undefined, callback);
  }

  var createOAuthUserWithSessionToken = function(token, callback) {
    var jsonBody = {
      authData: {
        myoauth: getMockMyOauthProvider().authData
      }
    };

    var options = {
      headers: {'X-Parse-Application-Id': 'test',
        'X-Parse-REST-API-Key': 'rest',
        'X-Parse-Installation-Id': 'yolo',
        'X-Parse-Session-Token': token,
        'Content-Type': 'application/json' },
      url: 'http://localhost:8378/1/users',
      body: jsonBody,
      json: true
    };

    return new Promise((resolve) => {
      request.post(options, (err, res, body) => {
        resolve({err, res, body});
        if (callback) {
          callback(err, res, body);
        }
      });
    });
  }

  it("should create user with REST API", done => {
    createOAuthUser((error, response, body) => {
      expect(error).toBe(null);
      var b = body;
      ok(b.sessionToken);
      expect(b.objectId).not.toBeNull();
      expect(b.objectId).not.toBeUndefined();
      var sessionToken = b.sessionToken;
      var q = new Parse.Query("_Session");
      q.equalTo('sessionToken', sessionToken);
      q.first({useMasterKey: true}).then((res) => {
        if (!res) {
          fail('should not fail fetching the session');
          done();
          return;
        }
        expect(res.get("installationId")).toEqual('yolo');
        done();
      }).fail(() => {
        fail('should not fail fetching the session');
        done();
      })
    });
  });

  it("should only create a single user with REST API", (done) => {
    var objectId;
    createOAuthUser((error, response, body) => {
      expect(error).toBe(null);
      var b = body
      expect(b.objectId).not.toBeNull();
      expect(b.objectId).not.toBeUndefined();
      objectId = b.objectId;

      createOAuthUser((error, response, body) => {
        expect(error).toBe(null);
        var b = body;
        expect(b.objectId).not.toBeNull();
        expect(b.objectId).not.toBeUndefined();
        expect(b.objectId).toBe(objectId);
        done();
      });
    });
  });

  it("should fail to link if session token don't match user", (done) => {
    Parse.User.signUp('myUser', 'password').then((user) => {
      return createOAuthUserWithSessionToken(user.getSessionToken());
    }).then(() => {
      return Parse.User.logOut();
    }).then(() => {
      return Parse.User.signUp('myUser2', 'password');
    }).then((user) => {
      return createOAuthUserWithSessionToken(user.getSessionToken());
    }).then(({ body }) => {
      expect(body.code).toBe(208);
      expect(body.error).toBe('this auth is already used');
      done();
    }).catch(done.fail);
  });

  it("unlink and link with custom provider", (done) => {
    var provider = getMockMyOauthProvider();
    Parse.User._registerAuthenticationProvider(provider);
    Parse.User._logInWith("myoauth", {
      success: function(model) {
        ok(model instanceof Parse.User, "Model should be a Parse.User");
        strictEqual(Parse.User.current(), model);
        ok(model.extended(), "Should have used the subclass.");
        strictEqual(provider.authData.id, provider.synchronizedUserId);
        strictEqual(provider.authData.access_token, provider.synchronizedAuthToken);
        strictEqual(provider.authData.expiration_date, provider.synchronizedExpiration);
        ok(model._isLinked("myoauth"), "User should be linked to myoauth");

        model._unlinkFrom("myoauth", {
          success: function(model) {

            ok(!model._isLinked("myoauth"),
              "User should not be linked to myoauth");
            ok(!provider.synchronizedUserId, "User id should be cleared");
            ok(!provider.synchronizedAuthToken, "Auth token should be cleared");
            ok(!provider.synchronizedExpiration,
              "Expiration should be cleared");
            // make sure the auth data is properly deleted
            var config = Config.get(Parse.applicationId);
            config.database.adapter.find('_User', {
              fields: Object.assign({}, defaultColumns._Default, defaultColumns._Installation),
            }, { objectId: model.id }, {})
              .then(res => {
                expect(res.length).toBe(1);
                expect(res[0]._auth_data_myoauth).toBeUndefined();
                expect(res[0]._auth_data_myoauth).not.toBeNull();

                model._linkWith("myoauth", {
                  success: function(model) {
                    ok(provider.synchronizedUserId, "User id should have a value");
                    ok(provider.synchronizedAuthToken,
                      "Auth token should have a value");
                    ok(provider.synchronizedExpiration,
                      "Expiration should have a value");
                    ok(model._isLinked("myoauth"),
                      "User should be linked to myoauth");
                    done();
                  },
                  error: function() {
                    ok(false, "linking again should succeed");
                    done();
                  }
                });
              });
          },
          error: function() {
            ok(false, "unlinking should succeed");
            done();
          }
        });
      },
      error: function() {
        ok(false, "linking should have worked");
        done();
      }
    });
  });

  function validateValidator(validator) {
    expect(typeof validator).toBe('function');
  }

  function validateAuthenticationHandler(authenticationHandler) {
    expect(authenticationHandler).not.toBeUndefined();
    expect(typeof authenticationHandler.getValidatorForProvider).toBe('function');
    expect(typeof authenticationHandler.getValidatorForProvider).toBe('function');
  }

  function validateAuthenticationAdapter(authAdapter) {
    expect(authAdapter).not.toBeUndefined();
    if (!authAdapter) { return; }
    expect(typeof authAdapter.validateAuthData).toBe('function');
    expect(typeof authAdapter.validateAppId).toBe('function');
  }

  it('properly loads custom adapter', (done) => {
    var validAuthData = {
      id: 'hello',
      token: 'world'
    }
    const adapter = {
      validateAppId: function() {
        return Promise.resolve();
      },
      validateAuthData: function(authData) {
        if (authData.id == validAuthData.id && authData.token == validAuthData.token) {
          return Promise.resolve();
        }
        return Promise.reject();
      }
    };

    const authDataSpy = spyOn(adapter, 'validateAuthData').and.callThrough();
    const appIdSpy = spyOn(adapter, 'validateAppId').and.callThrough();

    const authenticationHandler = authenticationLoader({
      customAuthentication: adapter
    });

    validateAuthenticationHandler(authenticationHandler);
    const validator = authenticationHandler.getValidatorForProvider('customAuthentication');
    validateValidator(validator);

    validator(validAuthData).then(() => {
      expect(authDataSpy).toHaveBeenCalled();
      // AppIds are not provided in the adapter, should not be called
      expect(appIdSpy).not.toHaveBeenCalled();
      done();
    }, (err) => {
      jfail(err);
      done();
    })
  });

  it('properly loads custom adapter module object', (done) => {
    const authenticationHandler = authenticationLoader({
      customAuthentication: path.resolve('./spec/support/CustomAuth.js')
    });

    validateAuthenticationHandler(authenticationHandler);
    const validator = authenticationHandler.getValidatorForProvider('customAuthentication');
    validateValidator(validator);

    validator({
      token: 'my-token'
    }).then(() => {
      done();
    }, (err) => {
      jfail(err);
      done();
    })
  });

  it('properly loads custom adapter module object', (done) => {
    const authenticationHandler = authenticationLoader({
      customAuthentication: { module: path.resolve('./spec/support/CustomAuthFunction.js'), options: { token: 'valid-token' }}
    });

    validateAuthenticationHandler(authenticationHandler);
    const validator = authenticationHandler.getValidatorForProvider('customAuthentication');
    validateValidator(validator);

    validator({
      token: 'valid-token'
    }).then(() => {
      done();
    }, (err) => {
      jfail(err);
      done();
    })
  });

  it('properly loads a default adapter with options', () => {
    const options = {
      facebook: {
        appIds: ['a', 'b']
      }
    };
    const { adapter, appIds, providerOptions } = authenticationLoader.loadAuthAdapter('facebook', options);
    validateAuthenticationAdapter(adapter);
    expect(appIds).toEqual(['a', 'b']);
    expect(providerOptions).toEqual(options.facebook);
  });

  it('properly loads a custom adapter with options', () => {
    const options = {
      custom: {
        validateAppId: () => {},
        validateAuthData: () => {},
        appIds: ['a', 'b']
      }
    };
    const { adapter, appIds, providerOptions } = authenticationLoader.loadAuthAdapter('custom', options);
    validateAuthenticationAdapter(adapter);
    expect(appIds).toEqual(['a', 'b']);
    expect(providerOptions).toEqual(options.custom);
  });
});
