import { setTimeout } from "timers";

"use strict"
const Parse = require("parse/node");

describe('beforeLogin', () => {
  it('should accept only one handler', (done) => {
    expect(() => {
      Parse.Cloud.beforeLogin((userLoginRequest) => {
        console.log(userLoginRequest);
      });
    }).not.toThrow();
    expect(() => {
      Parse.Cloud.beforeLogin((userLoginRequest) => {
        console.log(userLoginRequest);
      });
    }).toThrow();
    done();
  });

  it('should not be called on signUp with username/password', (done) => {
    Parse.Cloud.beforeLogin((userLoginRequest) => {
      expect(userLoginRequest).toBeDefined();
      setTimeout(() => { done.fail('should not be called on signUp') }, 1000);
    });
    var user = new Parse.User();
    user.set("username", "my_name");
    user.set("password", "my_pass");
    user.set("email", "email@example.com");
    user.set("name", "User Name");
    user.signUp().then(() => {
      Parse.User.logOut();
      setTimeout(done, 2000);
    });
  });

  it('should be called with valid userLoginRequest on login with username/password', (done) => {
    Parse.Cloud.beforeLogin((userLoginRequest) => {
      expect(userLoginRequest.installationId).toBeDefined();
      expect(typeof userLoginRequest.installationId).toEqual('string');
      expect(userLoginRequest.master).toBeDefined();
      expect(typeof userLoginRequest.master).toEqual('boolean');
      expect(userLoginRequest.object).toBeDefined();
      expect(typeof userLoginRequest.object).toEqual('object');
      expect(userLoginRequest.ip).toBeDefined();
      expect(typeof userLoginRequest.ip).toEqual('string');
      expect(userLoginRequest.headers).toBeDefined();
      expect(typeof userLoginRequest.headers).toEqual('object');
      expect(userLoginRequest.triggerName).toBeDefined();
      expect(userLoginRequest.triggerName).toBe('beforeLogin');
      expect(userLoginRequest.log).toBeDefined();
      expect(typeof userLoginRequest.log).toEqual('object');
      expect(userLoginRequest.authProvider).toBeDefined();
      expect(typeof userLoginRequest.authProvider).toEqual('string');
      expect(userLoginRequest.authData).toBeDefined();
      expect(typeof userLoginRequest.authData).toEqual('object');
      setTimeout(done, 1000);
    });
    var user = new Parse.User();
    user.set("username", "my_name");
    user.set("password", "my_pass");
    user.set("email", "email@example.com");
    user.set("name", "User Name");
    user.signUp().then(() => {
      Parse.User.logOut();
      ok(Parse.User.current() === null);
      var user = new Parse.User();
      user.set("username", "my_name");
      user.set("password", "my_pass");
      user.logIn().then(() => {
        Parse.User.logOut();
        ok(Parse.User.current() === null);
      });
    });
  });

  it("should not be called on login with wrong username", (done) => {
    Parse.Cloud.beforeLogin((userLoginRequest) => {
      expect(userLoginRequest).toBeDefined();
      setTimeout(() => { done.fail('should not be called on signUp') }, 1000);
    });
    Parse.User.signUp("asdf", "zxcv", null, {
      success: function () {
        Parse.User.logIn("non_existent_user", "asdf3",
          expectError(Parse.Error.OBJECT_NOT_FOUND, done));
      },
      error: function (err) {
        jfail(err);
        fail("should not fail");
        done();
      }
    });
  });

  it("should not be called on login with wrong password", (done) => {
    Parse.Cloud.beforeLogin((userLoginRequest) => {
      expect(userLoginRequest).toBeDefined();
      setTimeout(() => { done.fail('should not be called on signUp') }, 1000);
    });
    Parse.User.signUp("asdf", "zxcv", null, {
      success: function () {
        Parse.User.logIn("asdf", "asdfWrong",
          expectError(Parse.Error.OBJECT_NOT_FOUND, done));
      }
    });
  });

  it("should not be called on 'become'", (done) => {
    Parse.Cloud.beforeLogin((userLoginRequest) => {
      expect(userLoginRequest).toBeDefined();
      setTimeout(() => { done.fail('should not be called on signUp') }, 1000);
    });
    var user = null;
    var sessionToken = null;

    Parse.Promise.as().then(function () {
      return Parse.User.signUp("Jason", "Parse", { "code": "red" });

    }).then(function (newUser) {
      equal(Parse.User.current(), newUser);

      user = newUser;
      sessionToken = newUser.getSessionToken();
      ok(sessionToken);

      return Parse.User.logOut();
    }).then(() => {
      ok(!Parse.User.current());

      return Parse.User.become(sessionToken);

    }).then(function (newUser) {
      equal(Parse.User.current(), newUser);

      ok(newUser);
      equal(newUser.id, user.id);
      equal(newUser.get("username"), "Jason");
      equal(newUser.get("code"), "red");

      return Parse.User.logOut();
    }).then(() => {
      ok(!Parse.User.current());

      return Parse.User.become("somegarbage");

    }).then(function () {
      // This should have failed actually.
      ok(false, "Shouldn't have been able to log in with garbage session token.");
    }, function (error) {
      ok(error);
      // Handle the error.
      return Parse.Promise.as();

    }).then(function () {
      done();
    }, function (error) {
      ok(false, error);
      done();
    });
  });


  Parse.User.extend({
    extended: function () {
      return true;
    }
  });
  var getMockMyOauthProvider = function () {
    return {
      authData: {
        id: "12345",
        access_token: "12345",
        expiration_date: new Date(new Date().getTime() + 10 * 60 * 1000).toJSON(), // 10 minutes
      },
      shouldError: false,
      loggedOut: false,
      synchronizedUserId: null,
      synchronizedAuthToken: null,
      synchronizedExpiration: null,

      authenticate: function (options) {
        if (this.shouldError) {
          options.error(this, "An error occurred");
        } else if (this.shouldCancel) {
          options.error(this, null);
        } else {
          options.success(this, this.authData);
        }
      },
      restoreAuthentication: function (authData) {
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
      getAuthType: function () {
        return "shortLivedAuth";
      },
      deauthenticate: function () {
        this.loggedOut = true;
        this.restoreAuthentication(null);
      }
    };
  };

  it('should not be called on signUp with authProvider', (done) => {
    Parse.Object.enableSingleInstance();
    Parse.User.logOut();
    ok(Parse.User.current() === null);

    defaultConfiguration.auth.shortLivedAuth.setValidAccessToken('12345');
    var provider = getMockMyOauthProvider();
    Parse.User._registerAuthenticationProvider(provider);

    Parse.Cloud.beforeLogin((userLoginRequest) => {
      expect(userLoginRequest).toBeDefined();
      console.log(JSON.stringify(userLoginRequest, null, 2));
      setTimeout(() => { done.fail('should not be called on signUp with authProvider') }, 1000);
    });

    const authData = {
      id: "12345",
      access_token: "12345",
      expiration_date: new Date(new Date().getTime() + 10 * 60 * 1000).toJSON(), // 10 minutes
    };
    const options = {
      authData: authData
    };
    var user = new Parse.User();
    user.set('username', 'test');
    user.set('email', 'test@test.test.com');

    user._linkWith('shortLivedAuth', options).then((model) => {
      ok(model instanceof Parse.User, "Model should be a Parse.User");
      strictEqual(Parse.User.current(), model);
      ok(model.extended(), "Should have used the subclass.");
      strictEqual(provider.authData.id, provider.synchronizedUserId);
      strictEqual(provider.authData.access_token, provider.synchronizedAuthToken);
      strictEqual(Date(provider.authData.expiration_date).toLocaleString(), Date(provider.synchronizedExpiration).toLocaleString());
      ok(model._isLinked("shortLivedAuth"), "User should be linked to shortLivedAuth");
      // signUp complete
      setTimeout(done, 2000);
    }).catch((e) => {
      jfail(e);
    });
  });

  it("should be called with valid userLoginRequest on login with authProvider", (done) => {
    Parse.Object.enableSingleInstance();
    Parse.User.logOut();
    ok(Parse.User.current() === null);

    defaultConfiguration.auth.shortLivedAuth.setValidAccessToken('12345');
    var provider = getMockMyOauthProvider();
    Parse.User._registerAuthenticationProvider(provider);

    Parse.Cloud.beforeLogin((userLoginRequest) => {
      expect(userLoginRequest.installationId).toBeDefined();
      expect(typeof userLoginRequest.installationId).toEqual('string');
      expect(userLoginRequest.master).toBeDefined();
      expect(typeof userLoginRequest.master).toEqual('boolean');
      expect(userLoginRequest.object).toBeDefined();
      expect(typeof userLoginRequest.object).toEqual('object');
      expect(userLoginRequest.ip).toBeDefined();
      expect(typeof userLoginRequest.ip).toEqual('string');
      expect(userLoginRequest.headers).toBeDefined();
      expect(typeof userLoginRequest.headers).toEqual('object');
      expect(userLoginRequest.triggerName).toBeDefined();
      expect(userLoginRequest.triggerName).toBe('beforeLogin');
      expect(userLoginRequest.log).toBeDefined();
      expect(typeof userLoginRequest.log).toEqual('object');
      expect(userLoginRequest.authProvider).toBeDefined();
      expect(typeof userLoginRequest.authProvider).toEqual('string');
      expect(userLoginRequest.authData).toBeDefined();
      expect(typeof userLoginRequest.authData).toEqual('object');
      setTimeout(done, 1000);
    });

    const authData = {
      id: "12345",
      access_token: "12345",
      expiration_date: new Date(new Date().getTime() + 10 * 60 * 1000).toJSON(), // 10 minutes
    };
    const options = {
      authData: authData
    };

    const authData2 = {
      id: "12345",
      access_token: "1234567",
      expiration_date: new Date(new Date().getTime() + 10 * 60 * 1000).toJSON(), // 10 minutes
    };
    const options2 = {
      authData: authData2
    };

    var user = new Parse.User();
    user.set('username', 'test');
    user.set('email', 'test@test.test.com');

    user._linkWith('shortLivedAuth', options).then((model) => {
      ok(model instanceof Parse.User, "Model should be a Parse.User");
      strictEqual(Parse.User.current(), model);
      ok(model.extended(), "Should have used the subclass.");
      strictEqual(provider.authData.id, provider.synchronizedUserId);
      strictEqual(provider.authData.access_token, provider.synchronizedAuthToken);
      strictEqual(Date(provider.authData.expiration_date).toLocaleString(), Date(provider.synchronizedExpiration).toLocaleString());
      ok(model._isLinked("shortLivedAuth"), "User should be linked to shortLivedAuth");

      //console.log('signUp completed');
      model._logOutWithAll();
      Parse.User.logOut();
      ok(Parse.User.current() === null);

      var user2 = new Parse.User();
      user2.set('username', 'test');
      user2.set('email', 'test@test.test.com');
      // it's a new login with a new and valid token
      defaultConfiguration.auth.shortLivedAuth.setValidAccessToken('1234567');
      //console.log("let's login (this should trigger beforeLogin call)");
      user2._linkWith('shortLivedAuth', options2).then((model2) => {
        const userQuery = new Parse.Query(Parse.User);
        userQuery.get(model2.id).then((user3) => {
          expect(user3.id).toBe(model2.id);
          model._logOutWithAll();
          Parse.User.logOut();
          //setTimeout(done, 2000);
          ok(Parse.User.current() === null);
        }).catch((e) => {
          jfail(e);
        })
      }).catch((e) => {
        jfail(e);
      });
    }).catch((e) => {
      jfail(e);
    });
  });

  it("should not be called on failed login with authProvider", (done) => {
    Parse.Object.enableSingleInstance();
    Parse.User.logOut();
    ok(Parse.User.current() === null);

    defaultConfiguration.auth.shortLivedAuth.setValidAccessToken('12345');
    var provider = getMockMyOauthProvider();
    Parse.User._registerAuthenticationProvider(provider);

    Parse.Cloud.beforeLogin((userLoginRequest) => {
      expect(userLoginRequest).toBeDefined();
      console.log(JSON.stringify(userLoginRequest, null, 2));
      setTimeout(() => { done.fail('should not be called on failed login with authProvider') }, 1000);
    });
    const authData = {
      id: "12345",
      access_token: "12345",
      expiration_date: new Date(new Date().getTime() + 10 * 60 * 1000).toJSON(), // 10 minutes
    };
    const options = {
      authData: authData
    };

    const authData2 = {
      id: "12345",
      access_token: "1234567",
      expiration_date: new Date(new Date().getTime() + 10 * 60 * 1000).toJSON(), // 10 minutes
    };
    const options2 = {
      authData: authData2
    };

    var user = new Parse.User();
    user.set('username', 'test');
    user.set('email', 'test@test.test.com');

    user._linkWith('shortLivedAuth', options).then((model) => {
      ok(model instanceof Parse.User, "Model should be a Parse.User");
      strictEqual(Parse.User.current(), model);
      ok(model.extended(), "Should have used the subclass.");
      strictEqual(provider.authData.id, provider.synchronizedUserId);
      strictEqual(provider.authData.access_token, provider.synchronizedAuthToken);
      strictEqual(Date(provider.authData.expiration_date).toLocaleString(), Date(provider.synchronizedExpiration).toLocaleString());
      ok(model._isLinked("shortLivedAuth"), "User should be linked to shortLivedAuth");

      console.log('signUp complete');
      model._logOutWithAll();
      Parse.User.logOut();
      ok(Parse.User.current() === null);

      var user2 = new Parse.User();
      user2.set('username', 'test');
      user2.set('email', 'test@test.test.com');
      // new login with a bad token, provider should fail
      defaultConfiguration.auth.shortLivedAuth.setValidAccessToken('wrong-token');
      console.log("let's try to login with a bad token");
      user2._linkWith('shortLivedAuth', options2).then(() => {
      }).catch((e) => {
        ok(Parse.User.current() === null);
        done(e);
      });
    }).catch((e) => {
      jfail(e);
    });
  });

  it('should be able to block username/password login flow if cloud code throws an error', (done) => {
    Parse.Cloud.beforeLogin((userLoginRequest) => {
      expect(userLoginRequest.installationId).toBeDefined();
      expect(typeof userLoginRequest.installationId).toEqual('string');
      expect(userLoginRequest.master).toBeDefined();
      expect(typeof userLoginRequest.master).toEqual('boolean');
      expect(userLoginRequest.object).toBeDefined();
      expect(typeof userLoginRequest.object).toEqual('object');
      expect(userLoginRequest.ip).toBeDefined();
      expect(typeof userLoginRequest.ip).toEqual('string');
      expect(userLoginRequest.headers).toBeDefined();
      expect(typeof userLoginRequest.headers).toEqual('object');
      expect(userLoginRequest.triggerName).toBeDefined();
      expect(userLoginRequest.triggerName).toBe('beforeLogin');
      expect(userLoginRequest.log).toBeDefined();
      expect(typeof userLoginRequest.log).toEqual('object');
      expect(userLoginRequest.authProvider).toBeDefined();
      expect(typeof userLoginRequest.authProvider).toEqual('string');
      expect(userLoginRequest.authData).toBeDefined();
      expect(typeof userLoginRequest.authData).toEqual('object');
      if (userLoginRequest.object.username === 'test') {
        throw new Parse.Error(Parse.Error.OTHER_CAUSE, 'user ' + userLoginRequest.object.username + ' is not authorized');
      }
    });
    var user = new Parse.User();
    user.set("username", "test");
    user.set("password", "my_pass");
    user.set("email", "email@example.com");
    user.set("name", "User Name");
    user.signUp().then(() => {
      Parse.User.logOut();
      ok(Parse.User.current() === null);
      var user = new Parse.User();
      user.set("username", "test");
      user.set("password", "my_pass");
      user.logIn().then(() => {
        jfail('should not complete login flow');
      }).catch((e) => {
        console.log(e);
        ok(Parse.User.current() === null);
        setTimeout(done, 1000);
      });
    });
  });

  it("should be able to block authProvider login flow if cloud code throws an error", (done) => {
    Parse.Object.enableSingleInstance();
    Parse.User.logOut();
    ok(Parse.User.current() === null);

    defaultConfiguration.auth.shortLivedAuth.setValidAccessToken('12345');
    var provider = getMockMyOauthProvider();
    Parse.User._registerAuthenticationProvider(provider);

    Parse.Cloud.beforeLogin((userLoginRequest) => {
      expect(userLoginRequest.installationId).toBeDefined();
      expect(typeof userLoginRequest.installationId).toEqual('string');
      expect(userLoginRequest.master).toBeDefined();
      expect(typeof userLoginRequest.master).toEqual('boolean');
      expect(userLoginRequest.object).toBeDefined();
      expect(typeof userLoginRequest.object).toEqual('object');
      expect(userLoginRequest.ip).toBeDefined();
      expect(typeof userLoginRequest.ip).toEqual('string');
      expect(userLoginRequest.headers).toBeDefined();
      expect(typeof userLoginRequest.headers).toEqual('object');
      expect(userLoginRequest.triggerName).toBeDefined();
      expect(userLoginRequest.triggerName).toBe('beforeLogin');
      expect(userLoginRequest.log).toBeDefined();
      expect(typeof userLoginRequest.log).toEqual('object');
      expect(userLoginRequest.authProvider).toBeDefined();
      expect(typeof userLoginRequest.authProvider).toEqual('string');
      expect(userLoginRequest.authData).toBeDefined();
      expect(typeof userLoginRequest.authData).toEqual('object');
      if (userLoginRequest.object.username === 'test') {
        throw new Parse.Error(Parse.Error.OTHER_CAUSE, 'user ' + userLoginRequest.object.username + ' is not authorized');
      }
    });

    const authData = {
      id: "12345",
      access_token: "12345",
      expiration_date: new Date(new Date().getTime() + 10 * 60 * 1000).toJSON(), // 10 minutes
    };
    const options = {
      authData: authData
    };

    const authData2 = {
      id: "12345",
      access_token: "1234567",
      expiration_date: new Date(new Date().getTime() + 10 * 60 * 1000).toJSON(), // 10 minutes
    };
    const options2 = {
      authData: authData2
    };

    var user = new Parse.User();
    user.set('username', 'test');
    user.set('email', 'test@test.test.com');

    user._linkWith('shortLivedAuth', options).then((model) => {
      ok(model instanceof Parse.User, "Model should be a Parse.User");
      strictEqual(Parse.User.current(), model);
      ok(model.extended(), "Should have used the subclass.");
      strictEqual(provider.authData.id, provider.synchronizedUserId);
      strictEqual(provider.authData.access_token, provider.synchronizedAuthToken);
      strictEqual(Date(provider.authData.expiration_date).toLocaleString(), Date(provider.synchronizedExpiration).toLocaleString());
      ok(model._isLinked("shortLivedAuth"), "User should be linked to shortLivedAuth");

      //console.log('signUp completed');
      model._logOutWithAll();
      Parse.User.logOut();
      ok(Parse.User.current() === null);

      var user2 = new Parse.User();
      user2.set('username', 'test');
      user2.set('email', 'test@test.test.com');
      // it's a new login with a new and valid token
      defaultConfiguration.auth.shortLivedAuth.setValidAccessToken('1234567');
      //console.log("let's login (this should trigger beforeLogin call)");
      user2._linkWith('shortLivedAuth', options2).then(() => {
        jfail('should not complete login flow');
      }).catch((e) => {
        console.log(e);
        ok(Parse.User.current() === null);
        setTimeout(done, 1000);
      });
    }).catch((e) => {
      jfail(e);
    });
  });
});
