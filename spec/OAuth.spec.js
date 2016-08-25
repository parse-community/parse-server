var OAuth = require("../src/authDataManager/OAuth1Client");
var request = require('request');
var Config = require("../src/Config");
var defaultColumns = require('../src/Controllers/SchemaController').defaultColumns;

describe('OAuth', function() {
  it("Nonce should have right length", (done) => {
    jequal(OAuth.nonce().length, 30);
    done();
  });

  it("Should properly build parameter string", (done) => {
    var string = OAuth.buildParameterString({c:1, a:2, b:3})
    jequal(string, "a=2&b=3&c=1");
    done();
  });

  it("Should properly build empty parameter string", (done) => {
    var string = OAuth.buildParameterString()
    jequal(string, "");
    done();
  });

  it("Should properly build signature string", (done) => {
    var string = OAuth.buildSignatureString("get", "http://dummy.com", "");
    jequal(string, "GET&http%3A%2F%2Fdummy.com&");
    done();
  });

  it("Should properly generate request signature", (done) => {
    var request = {
      host: "dummy.com",
      path: "path"
    };

    var oauth_params = {
      oauth_timestamp: 123450000,
      oauth_nonce: "AAAAAAAAAAAAAAAAA",
      oauth_consumer_key: "hello",
      oauth_token: "token"
    };

    var consumer_secret = "world";
    var auth_token_secret = "secret";
    request = OAuth.signRequest(request, oauth_params, consumer_secret, auth_token_secret);
    jequal(request.headers['Authorization'], 'OAuth oauth_consumer_key="hello", oauth_nonce="AAAAAAAAAAAAAAAAA", oauth_signature="8K95bpQcDi9Nd2GkhumTVcw4%2BXw%3D", oauth_signature_method="HMAC-SHA1", oauth_timestamp="123450000", oauth_token="token", oauth_version="1.0"');
    done();
  });

  it("Should properly build request", (done) => {
    var options = {
      host: "dummy.com",
      consumer_key: "hello",
      consumer_secret: "world",
      auth_token: "token",
      auth_token_secret: "secret",
      // Custom oauth params for tests
      oauth_params: {
        oauth_timestamp: 123450000,
        oauth_nonce: "AAAAAAAAAAAAAAAAA"
      }
    };
    var path = "path";
    var method = "get";

    var oauthClient = new OAuth(options);
    var req = oauthClient.buildRequest(method, path, {"query": "param"});

    jequal(req.host, options.host);
    jequal(req.path, "/"+path+"?query=param");
    jequal(req.method, "GET");
    jequal(req.headers['Content-Type'], 'application/x-www-form-urlencoded');
    jequal(req.headers['Authorization'], 'OAuth oauth_consumer_key="hello", oauth_nonce="AAAAAAAAAAAAAAAAA", oauth_signature="wNkyEkDE%2F0JZ2idmqyrgHdvC0rs%3D", oauth_signature_method="HMAC-SHA1", oauth_timestamp="123450000", oauth_token="token", oauth_version="1.0"')
    done();
  });


  function validateCannotAuthenticateError(data, done) {
    jequal(typeof data, "object");
    jequal(typeof data.errors, "object");
    var errors = data.errors;
    jequal(typeof errors[0], "object");
    // Cannot authenticate error
    jequal(errors[0].code, 32);
    done();
  }

  it("Should fail a GET request", (done) => {
    var options = {
      host: "api.twitter.com",
      consumer_key: "XXXXXXXXXXXXXXXXXXXXXXXXX",
      consumer_secret: "XXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXX",
    };
    var path = "/1.1/help/configuration.json";
    var params = {"lang": "en"};
    var oauthClient = new OAuth(options);
    oauthClient.get(path, params).then(function(data){
      validateCannotAuthenticateError(data, done);
    })
  });

  it("Should fail a POST request", (done) => {
    var options = {
      host: "api.twitter.com",
      consumer_key: "XXXXXXXXXXXXXXXXXXXXXXXXX",
      consumer_secret: "XXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXX",
    };
    var body = {
      lang: "en"
    };
    var path = "/1.1/account/settings.json";

    var oauthClient = new OAuth(options);
    oauthClient.post(path, null, body).then(function(data){
      validateCannotAuthenticateError(data, done);
    })
  });

  it("Should fail a request", (done) => {
    var options = {
      host: "localhost",
      consumer_key: "XXXXXXXXXXXXXXXXXXXXXXXXX",
      consumer_secret: "XXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXX",
    };
    var body = {
      lang: "en"
    };
    var path = "/";

    var oauthClient = new OAuth(options);
    oauthClient.post(path, null, body).then(function(data){
      jequal(false, true);
      done();
    }).catch(function(){
      jequal(true, true);
      done();
    })
  });

  ["facebook", "github", "instagram", "google", "linkedin", "meetup", "twitter", "janrainengage", "janraincapture", "vkontakte"].map(function(providerName){
    it("Should validate structure of "+providerName, (done) => {
      var provider = require("../src/authDataManager/"+providerName);
      jequal(typeof provider.validateAuthData, "function");
      jequal(typeof provider.validateAppId, "function");
      jequal(provider.validateAuthData({}, {}).constructor, Promise.prototype.constructor);
      jequal(provider.validateAppId("app", "key", {}).constructor, Promise.prototype.constructor);
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

  var ExtendedUser = Parse.User.extend({
    extended: function() {
      return true;
    }
  });

  var createOAuthUser = function(callback) {
    var jsonBody = {
      authData: {
        myoauth: getMockMyOauthProvider().authData
      }
    };

    var options = {
        headers: {'X-Parse-Application-Id': 'test',
          'X-Parse-REST-API-Key': 'rest',
          'X-Parse-Installation-Id': 'yolo',
          'Content-Type': 'application/json' },
        url: 'http://localhost:8378/1/users',
        body: JSON.stringify(jsonBody)
      };

    return request.post(options, callback);
  }

  it("should create user with REST API", done => {
    createOAuthUser((error, response, body) => {
      expect(error).toBe(null);
      var b = JSON.parse(body);
      ok(b.sessionToken);
      expect(b.objectId).not.toBeNull();
      expect(b.objectId).not.toBeUndefined();
      var sessionToken = b.sessionToken;
      var q = new Parse.Query("_Session");
      q.equalTo('sessionToken', sessionToken);
      q.first({useMasterKey: true}).then((res) => {
        if (!res) {
           fail('should not fail fetching the session');
           done();
           return;
        }
        expect(res.get("installationId")).toEqual('yolo');
        done();
      }).fail((err) => {
        fail('should not fail fetching the session');
        done();
      })
    });
  });

  it("should only create a single user with REST API", (done) => {
    var objectId;
    createOAuthUser((error, response, body) => {
      expect(error).toBe(null);
      var b = JSON.parse(body);
      expect(b.objectId).not.toBeNull();
      expect(b.objectId).not.toBeUndefined();
      objectId = b.objectId;

      createOAuthUser((error, response, body) => {
        expect(error).toBe(null);
        var b = JSON.parse(body);
        expect(b.objectId).not.toBeNull();
        expect(b.objectId).not.toBeUndefined();
        expect(b.objectId).toBe(objectId);
        done();
      });
    });
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
            var config = new Config(Parse.applicationId);
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
                error: function(model, error) {
                  ok(false, "linking again should succeed");
                  done();
                }
              });
            });
          },
          error: function(model, error) {
            ok(false, "unlinking should succeed");
            done();
          }
        });
      },
      error: function(model, error) {
        ok(false, "linking should have worked");
        done();
      }
    });
  });


})
