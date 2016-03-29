// This is a port of the test suite:
// hungry/js/test/parse_user_test.js
//
// Things that we didn't port:
// Tests that involve revocable sessions.
// Tests that involve sending password reset emails.

"use strict";

var request = require('request');
var passwordCrypto = require('../src/password');
var Config = require('../src/Config');

function verifyACL(user) {
  const ACL = user.getACL();
  expect(ACL.getReadAccess(user)).toBe(true);
  expect(ACL.getWriteAccess(user)).toBe(true);
  expect(ACL.getPublicReadAccess()).toBe(true);
  expect(ACL.getPublicWriteAccess()).toBe(false);
  const perms = ACL.permissionsById;
  expect(Object.keys(perms).length).toBe(2);
  expect(perms[user.id].read).toBe(true);
  expect(perms[user.id].write).toBe(true);
  expect(perms['*'].read).toBe(true);
  expect(perms['*'].write).not.toBe(true);
}

describe('Parse.User testing', () => {
  it("user sign up class method", (done) => {
    Parse.User.signUp("asdf", "zxcv", null, {
      success: function(user) {
        ok(user.getSessionToken());
        done();
      }
    });
  });

  it("user sign up instance method", (done) => {
    var user = new Parse.User();
    user.setPassword("asdf");
    user.setUsername("zxcv");
    user.signUp(null, {
      success: function(user) {
        ok(user.getSessionToken());
        done();
      },
      error: function(userAgain, error) {
        ok(undefined, error);
      }
    });
  });

  it("user login wrong username", (done) => {
    Parse.User.signUp("asdf", "zxcv", null, {
      success: function(user) {
        Parse.User.logIn("non_existent_user", "asdf3",
                         expectError(Parse.Error.OBJECT_NOT_FOUND, done));
      },
      error: function(err) {
        console.error(err);
        fail("Shit should not fail");
        done();
      }
    });
  });

  it("user login wrong password", (done) => {
    Parse.User.signUp("asdf", "zxcv", null, {
      success: function(user) {
        Parse.User.logIn("asdf", "asdfWrong",
                         expectError(Parse.Error.OBJECT_NOT_FOUND, done));
      }
    });
  });

  it("user login", (done) => {
    Parse.User.signUp("asdf", "zxcv", null, {
      success: function(user) {
        Parse.User.logIn("asdf", "zxcv", {
          success: function(user) {
            equal(user.get("username"), "asdf");
            verifyACL(user);
            done();
          }
        });
      }
    });
  });

  it("user login with files", (done) => {
    let file = new Parse.File("yolo.txt", [1,2,3], "text/plain");
    file.save().then((file) => {
      return Parse.User.signUp("asdf", "zxcv", { "file" : file });
    }).then(() => {
      return Parse.User.logIn("asdf", "zxcv");
    }).then((user) => {
      let fileAgain = user.get('file');
      ok(fileAgain.name());
      ok(fileAgain.url());
      done();
    });
  });

  describe('become', () => {
    it('sends token back', done => {
      let user = null;
      var sessionToken = null;

      Parse.User.signUp('Jason', 'Parse', { 'code': 'red' }).then(newUser => {
        user = newUser;
        expect(user.get('code'), 'red');

        sessionToken = newUser.getSessionToken();
        expect(sessionToken).toBeDefined();

        return Parse.User.become(sessionToken);
      }).then(newUser => {
        expect(newUser.id).toEqual(user.id);
        expect(newUser.get('username'), 'Jason');
        expect(newUser.get('code'), 'red');
        expect(newUser.getSessionToken()).toEqual(sessionToken);
      }).then(() => {
        done();
      }, error => {
        fail(error);
        done();
      });
    });
  });

  it("become", (done) => {
    var user = null;
    var sessionToken = null;

    Parse.Promise.as().then(function() {
      return Parse.User.signUp("Jason", "Parse", { "code": "red" });

    }).then(function(newUser) {
      equal(Parse.User.current(), newUser);

      user = newUser;
      sessionToken = newUser.getSessionToken();
      ok(sessionToken);

      return Parse.User.logOut();
    }).then(() => {
      ok(!Parse.User.current());

      return Parse.User.become(sessionToken);

    }).then(function(newUser) {
      equal(Parse.User.current(), newUser);

      ok(newUser);
      equal(newUser.id, user.id);
      equal(newUser.get("username"), "Jason");
      equal(newUser.get("code"), "red");

      return Parse.User.logOut();
    }).then(() => {
      ok(!Parse.User.current());

      return Parse.User.become("somegarbage");

    }).then(function() {
      // This should have failed actually.
      ok(false, "Shouldn't have been able to log in with garbage session token.");
    }, function(error) {
      ok(error);
      // Handle the error.
      return Parse.Promise.as();

    }).then(function() {
      done();
    }, function(error) {
      ok(false, error);
      done();
    });
  });

  it("cannot save non-authed user", (done) => {
    var user = new Parse.User();
    user.set({
      "password": "asdf",
      "email": "asdf@example.com",
      "username": "zxcv"
    });
    user.signUp(null, {
      success: function(userAgain) {
        equal(userAgain, user);
        var query = new Parse.Query(Parse.User);
        query.get(user.id, {
          success: function(userNotAuthed) {
            user = new Parse.User();
            user.set({
              "username": "hacker",
              "password": "password"
            });
            user.signUp(null, {
              success: function(userAgain) {
                equal(userAgain, user);
                userNotAuthed.set("username", "changed");
                userNotAuthed.save().then(fail, (err) => {
                  expect(err.code).toEqual(Parse.Error.SESSION_MISSING);
                  done();
                });
              },
              error: function(model, error) {
                ok(undefined, error);
              }
            });
          },
          error: function(model, error) {
            ok(undefined, error);
          }
        });
      }
    });
  });

  it("cannot delete non-authed user", (done) => {
    var user = new Parse.User();
    user.signUp({
      "password": "asdf",
      "email": "asdf@example.com",
      "username": "zxcv"
    }, {
      success: function() {
        var query = new Parse.Query(Parse.User);
        query.get(user.id, {
          success: function(userNotAuthed) {
            user = new Parse.User();
            user.signUp({
              "username": "hacker",
              "password": "password"
            }, {
              success: function(userAgain) {
                equal(userAgain, user);
                userNotAuthed.set("username", "changed");
                userNotAuthed.destroy(expectError(
                  Parse.Error.SESSION_MISSING, done));
              }
            });
          }
        });
      }
    });
  });

  it("cannot saveAll with non-authed user", (done) => {
    var user = new Parse.User();
    user.signUp({
      "password": "asdf",
      "email": "asdf@example.com",
      "username": "zxcv"
    }, {
      success: function() {
        var query = new Parse.Query(Parse.User);
        query.get(user.id, {
          success: function(userNotAuthed) {
            user = new Parse.User();
            user.signUp({
              username: "hacker",
              password: "password"
            }, {
              success: function() {
                query.get(user.id, {
                  success: function(userNotAuthedNotChanged) {
                    userNotAuthed.set("username", "changed");
                    var object = new TestObject();
                    object.save({
                      user: userNotAuthedNotChanged
                    }, {
                      success: function(object) {
                        var item1 = new TestObject();
                        item1.save({
                          number: 0
                        }, {
                          success: function(item1) {
                            item1.set("number", 1);
                            var item2 = new TestObject();
                            item2.set("number", 2);
                            Parse.Object.saveAll(
                              [item1, item2, userNotAuthed],
                              expectError(Parse.Error.SESSION_MISSING, done));
                          }
                        });
                      }
                    });
                  }
                });
              }
            });
          }
        });
      }
    });
  });

  it("current user", (done) => {
    var user = new Parse.User();
    user.set("password", "asdf");
    user.set("email", "asdf@example.com");
    user.set("username", "zxcv");
    user.signUp().then(() => {
      var currentUser = Parse.User.current();
      equal(user.id, currentUser.id);
      ok(user.getSessionToken());

      var currentUserAgain = Parse.User.current();
      // should be the same object
      equal(currentUser, currentUserAgain);

      // test logging out the current user
      return Parse.User.logOut();
    }).then(() => {
      equal(Parse.User.current(), null);
      done();
    });
  });

  it("user.isCurrent", (done) => {
    var user1 = new Parse.User();
    var user2 = new Parse.User();
    var user3 = new Parse.User();

    user1.set("username", "a");
    user2.set("username", "b");
    user3.set("username", "c");

    user1.set("password", "password");
    user2.set("password", "password");
    user3.set("password", "password");

    user1.signUp().then(() => {
      equal(user1.isCurrent(), true);
      equal(user2.isCurrent(), false);
      equal(user3.isCurrent(), false);
      return user2.signUp();
    }).then(() => {
      equal(user1.isCurrent(), false);
      equal(user2.isCurrent(), true);
      equal(user3.isCurrent(), false);
      return user3.signUp();
    }).then(() => {
      equal(user1.isCurrent(), false);
      equal(user2.isCurrent(), false);
      equal(user3.isCurrent(), true);
      return Parse.User.logIn("a", "password");
    }).then(() => {
      equal(user1.isCurrent(), true);
      equal(user2.isCurrent(), false);
      equal(user3.isCurrent(), false);
      return Parse.User.logIn("b", "password");
    }).then(() => {
      equal(user1.isCurrent(), false);
      equal(user2.isCurrent(), true);
      equal(user3.isCurrent(), false);
      return Parse.User.logIn("b", "password");
    }).then(() => {
      equal(user1.isCurrent(), false);
      equal(user2.isCurrent(), true);
      equal(user3.isCurrent(), false);
      return Parse.User.logOut();
    }).then(() => {
      equal(user2.isCurrent(), false);
      done();
    });
  });

  it("user associations", (done) => {
    var child = new TestObject();
    child.save(null, {
      success: function() {
        var user = new Parse.User();
        user.set("password", "asdf");
        user.set("email", "asdf@example.com");
        user.set("username", "zxcv");
        user.set("child", child);
        user.signUp(null, {
          success: function() {
            var object = new TestObject();
            object.set("user", user);
            object.save(null, {
              success: function() {
                var query = new Parse.Query(TestObject);
                query.get(object.id, {
                  success: function(objectAgain) {
                    var userAgain = objectAgain.get("user");
                    userAgain.fetch({
                      success: function() {
                        equal(user.id, userAgain.id);
                        equal(userAgain.get("child").id, child.id);
                        done();
                      }
                    });
                  }
                });
              }
            });
          }
        });
      }
    });
  });

  it("user queries", (done) => {
    var user = new Parse.User();
    user.set("password", "asdf");
    user.set("email", "asdf@example.com");
    user.set("username", "zxcv");
    user.signUp(null, {
      success: function() {
        var query = new Parse.Query(Parse.User);
        query.get(user.id, {
          success: function(userAgain) {
            equal(userAgain.id, user.id);
            query.find({
              success: function(users) {
                equal(users.length, 1);
                equal(users[0].id, user.id);
                ok(userAgain.get("email"), "asdf@example.com");
                done();
              }
            });
          }
        });
      }
    });
  });

  function signUpAll(list, optionsOrCallback) {
    var promise = Parse.Promise.as();
    list.forEach((user) => {
      promise = promise.then(function() {
        return user.signUp();
      });
    });
    promise = promise.then(function() { return list; });
    return promise._thenRunCallbacks(optionsOrCallback);
  }

  it("contained in user array queries", (done) => {
    var USERS = 4;
    var MESSAGES = 5;

    // Make a list of users.
    var userList = range(USERS).map(function(i) {
      var user = new Parse.User();
      user.set("password", "user_num_" + i);
      user.set("email", "user_num_" + i + "@example.com");
      user.set("username", "xinglblog_num_" + i);
      return user;
    });

    signUpAll(userList, function(users) {
      // Make a list of messages.
      var messageList = range(MESSAGES).map(function(i) {
        var message = new TestObject();
        message.set("to", users[(i + 1) % USERS]);
        message.set("from", users[i % USERS]);
        return message;
      });

      // Save all the messages.
      Parse.Object.saveAll(messageList, function(messages) {

        // Assemble an "in" list.
        var inList = [users[0], users[3], users[3]];  // Intentional dupe
        var query = new Parse.Query(TestObject);
        query.containedIn("from", inList);
        query.find({
          success: function(results) {
            equal(results.length, 3);
            done();
          }
        });

      });
    });
  });

  it("saving a user signs them up but doesn't log them in", (done) => {
    var user = new Parse.User();
    user.save({
      password: "asdf",
      email: "asdf@example.com",
      username: "zxcv"
    }, {
      success: function() {
        equal(Parse.User.current(), null);
        done();
      }
    });
  });

  it("user updates", (done) => {
    var user = new Parse.User();
    user.signUp({
      password: "asdf",
      email: "asdf@example.com",
      username: "zxcv"
    }, {
      success: function(user) {
        user.set("username", "test");
        user.save(null, {
          success: function() {
            equal(Object.keys(user.attributes).length, 6);
            ok(user.attributes["username"]);
            ok(user.attributes["email"]);
            user.destroy({
              success: function() {
                var query = new Parse.Query(Parse.User);
                query.get(user.id, {
                  error: function(model, error) {
                    // The user should no longer exist.
                    equal(error.code, Parse.Error.OBJECT_NOT_FOUND);
                    done();
                  }
                });
              },
              error: function(model, error) {
                ok(undefined, error);
              }
            });
          },
          error: function(model, error) {
            ok(undefined, error);
          }
        });
      },
      error: function(model, error) {
        ok(undefined, error);
      }
    });
  });

  it("count users", (done) => {
    var james = new Parse.User();
    james.set("username", "james");
    james.set("password", "mypass");
    james.signUp(null, {
      success: function() {
        var kevin = new Parse.User();
        kevin.set("username", "kevin");
        kevin.set("password", "mypass");
        kevin.signUp(null, {
          success: function() {
            var query = new Parse.Query(Parse.User);
            query.count({
              success: function(count) {
                equal(count, 2);
                done();
              }
            });
          }
        });
      }
    });
  });

  it("user sign up with container class", (done) => {
    Parse.User.signUp("ilya", "mypass", { "array": ["hello"] }, {
      success: function() {
        done();
      }
    });
  });

  it("user modified while saving", (done) => {
    Parse.Object.disableSingleInstance();
    var user = new Parse.User();
    user.set("username", "alice");
    user.set("password", "password");
    user.signUp(null, {
      success: function(userAgain) {
        equal(userAgain.get("username"), "bob");
        ok(userAgain.dirty("username"));
        var query = new Parse.Query(Parse.User);
        query.get(user.id, {
          success: function(freshUser) {
            equal(freshUser.id, user.id);
            equal(freshUser.get("username"), "alice");
            Parse.Object.enableSingleInstance();
            done();
          }
        });
      }
    });
    ok(user.set("username", "bob"));
  });

  it("user modified while saving with unsaved child", (done) => {
    Parse.Object.disableSingleInstance();
    var user = new Parse.User();
    user.set("username", "alice");
    user.set("password", "password");
    user.set("child", new TestObject());
    user.signUp(null, {
      success: function(userAgain) {
        equal(userAgain.get("username"), "bob");
        // Should be dirty, but it depends on batch support.
        // ok(userAgain.dirty("username"));
        var query = new Parse.Query(Parse.User);
        query.get(user.id, {
          success: function(freshUser) {
            equal(freshUser.id, user.id);
            // Should be alice, but it depends on batch support.
            equal(freshUser.get("username"), "bob");
            Parse.Object.enableSingleInstance();
            done();
          }
        });
      }
    });
    ok(user.set("username", "bob"));
  });

  it("user loaded from localStorage from signup", (done) => {
    Parse.User.signUp("alice", "password", null, {
      success: function(alice) {
        ok(alice.id, "Alice should have an objectId");
        ok(alice.getSessionToken(), "Alice should have a session token");
        equal(alice.get("password"), undefined,
              "Alice should not have a password");

        // Simulate the environment getting reset.
        Parse.User._currentUser = null;
        Parse.User._currentUserMatchesDisk = false;

        var aliceAgain = Parse.User.current();
        equal(aliceAgain.get("username"), "alice");
        equal(aliceAgain.id, alice.id, "currentUser should have objectId");
        ok(aliceAgain.getSessionToken(),
           "currentUser should have a sessionToken");
        equal(alice.get("password"), undefined,
              "currentUser should not have password");
        done();
      }
    });
  });


  it("user loaded from localStorage from login", (done) => {
    var id;
    Parse.User.signUp("alice", "password").then((alice) => {
      id = alice.id;
      return Parse.User.logOut();
    }).then(() => {
      return Parse.User.logIn("alice", "password");
    }).then((user) => {
      // Force the current user to read from disk
      delete Parse.User._currentUser;
      delete Parse.User._currentUserMatchesDisk;

      var userFromDisk = Parse.User.current();
      equal(userFromDisk.get("password"), undefined,
            "password should not be in attributes");
      equal(userFromDisk.id, id, "id should be set");
      ok(userFromDisk.getSessionToken(),
         "currentUser should have a sessionToken");
      done();
    });
  });

  it("saving user after browser refresh", (done) => {
    var _ = Parse._;
    var id;

    Parse.User.signUp("alice", "password", null).then(function(alice) {
      id = alice.id;
      return Parse.User.logOut();
    }).then(() => {
      return Parse.User.logIn("alice", "password");
    }).then(function() {
      // Simulate browser refresh by force-reloading user from localStorage
      Parse.User._clearCache();

      // Test that this save works correctly
      return Parse.User.current().save({some_field: 1});
    }).then(function() {
      // Check the user in memory just after save operation
      var userInMemory = Parse.User.current();

      equal(userInMemory.getUsername(), "alice",
            "saving user should not remove existing fields");

      equal(userInMemory.get('some_field'), 1,
            "saving user should save specified field");

      equal(userInMemory.get("password"), undefined,
            "password should not be in attributes after saving user");

      equal(userInMemory.get("objectId"), undefined,
            "objectId should not be in attributes after saving user");

      equal(userInMemory.get("_id"), undefined,
            "_id should not be in attributes after saving user");

      equal(userInMemory.id, id, "id should be set");

      expect(userInMemory.updatedAt instanceof Date).toBe(true);

      ok(userInMemory.createdAt instanceof Date);

      ok(userInMemory.getSessionToken(),
         "user should have a sessionToken after saving");

      // Force the current user to read from localStorage, and check again
      delete Parse.User._currentUser;
      delete Parse.User._currentUserMatchesDisk;
      var userFromDisk = Parse.User.current();

      equal(userFromDisk.getUsername(), "alice",
            "userFromDisk should have previously existing fields");

      equal(userFromDisk.get('some_field'), 1,
            "userFromDisk should have saved field");

      equal(userFromDisk.get("password"), undefined,
            "password should not be in attributes of userFromDisk");

      equal(userFromDisk.get("objectId"), undefined,
            "objectId should not be in attributes of userFromDisk");

      equal(userFromDisk.get("_id"), undefined,
            "_id should not be in attributes of userFromDisk");

      equal(userFromDisk.id, id, "id should be set on userFromDisk");

      ok(userFromDisk.updatedAt instanceof Date);

      ok(userFromDisk.createdAt instanceof Date);

      ok(userFromDisk.getSessionToken(),
         "userFromDisk should have a sessionToken");

      done();
    }, function(error) {
      ok(false, error);
      done();
    });
  });

  it("user with missing username", (done) => {
    var user = new Parse.User();
    user.set("password", "foo");
    user.signUp(null, {
      success: function() {
        ok(null, "This should have failed");
        done();
      },
      error: function(userAgain, error) {
        equal(error.code, Parse.Error.OTHER_CAUSE);
        done();
      }
    });
  });

  it("user with missing password", (done) => {
    var user = new Parse.User();
    user.set("username", "foo");
    user.signUp(null, {
      success: function() {
        ok(null, "This should have failed");
        done();
      },
      error: function(userAgain, error) {
        equal(error.code, Parse.Error.OTHER_CAUSE);
        done();
      }
    });
  });

  it("user stupid subclassing", (done) => {

    var SuperUser = Parse.Object.extend("User");
    var user = new SuperUser();
    user.set("username", "bob");
    user.set("password", "welcome");
    ok(user instanceof Parse.User, "Subclassing User should have worked");
    user.signUp(null, {
      success: function() {
        done();
      },
      error: function() {
        ok(false, "Signing up should have worked");
        done();
      }
    });
  });

  it("user signup class method uses subclassing", (done) => {

    var SuperUser = Parse.User.extend({
      secret: function() {
        return 1337;
      }
    });

    Parse.User.signUp("bob", "welcome", null, {
      success: function(user) {
        ok(user instanceof SuperUser, "Subclassing User should have worked");
        equal(user.secret(), 1337);
        done();
      },
      error: function() {
        ok(false, "Signing up should have worked");
        done();
      }
    });
  });

  it("user on disk gets updated after save", (done) => {

    var SuperUser = Parse.User.extend({
      isSuper: function() {
        return true;
      }
    });

    Parse.User.signUp("bob", "welcome", null, {
      success: function(user) {
        // Modify the user and save.
        user.save("secret", 1337, {
          success: function() {
            // Force the current user to read from disk
            delete Parse.User._currentUser;
            delete Parse.User._currentUserMatchesDisk;

            var userFromDisk = Parse.User.current();
            equal(userFromDisk.get("secret"), 1337);
            ok(userFromDisk.isSuper(), "The subclass should have been used");
            done();
          },
          error: function() {
            ok(false, "Saving should have worked");
            done();
          }
        });
      },
      error: function() {
        ok(false, "Sign up should have worked");
        done();
      }
    });
  });

  it("current user isn't dirty", (done) => {

    Parse.User.signUp("andrew", "oppa", { style: "gangnam" }, expectSuccess({
      success: function(user) {
        ok(!user.dirty("style"), "The user just signed up.");
        Parse.User._currentUser = null;
        Parse.User._currentUserMatchesDisk = false;
        var userAgain = Parse.User.current();
        ok(!userAgain.dirty("style"), "The user was just read from disk.");
        done();
      }
    }));
  });

  // Note that this mocks out client-side Facebook action rather than
  // server-side.
  var getMockFacebookProvider = function() {
    return {
      authData: {
        id: "8675309",
        access_token: "jenny",
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
        return "facebook";
      },
      deauthenticate: function() {
        this.loggedOut = true;
        this.restoreAuthentication(null);
      }
    };
  };

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

  it("log in with provider", (done) => {
    var provider = getMockFacebookProvider();
    Parse.User._registerAuthenticationProvider(provider);
    Parse.User._logInWith("facebook", {
      success: function(model) {
        ok(model instanceof Parse.User, "Model should be a Parse.User");
        strictEqual(Parse.User.current(), model);
        ok(model.extended(), "Should have used subclass.");
        strictEqual(provider.authData.id, provider.synchronizedUserId);
        strictEqual(provider.authData.access_token, provider.synchronizedAuthToken);
        strictEqual(provider.authData.expiration_date, provider.synchronizedExpiration);
        ok(model._isLinked("facebook"), "User should be linked to facebook");
        done();
      },
      error: function(model, error) {
        console.error(model, error);
        ok(false, "linking should have worked");
        done();
      }
    });
  });

  it('log in with provider with files', done => {
    let provider = getMockFacebookProvider();
    Parse.User._registerAuthenticationProvider(provider);
    let file = new Parse.File("yolo.txt", [1, 2, 3], "text/plain");
    file.save().then(file => {
      let user = new Parse.User();
      user.set('file', file);
      return user._linkWith('facebook', {});
    }).then(user => {
      expect(user._isLinked("facebook")).toBeTruthy();
      return Parse.User._logInWith('facebook', {});
    }).then(user => {
      let fileAgain = user.get('file');
      expect(fileAgain.name()).toMatch(/yolo.txt$/);
      expect(fileAgain.url()).toMatch(/yolo.txt$/);
    }).then(() => {
      done();
    }, error => {
      fail(error);
      done();
    });
  });

  it("log in with provider twice", (done) => {
    var provider = getMockFacebookProvider();
    Parse.User._registerAuthenticationProvider(provider);
    Parse.User._logInWith("facebook", {
      success: function(model) {
        ok(model instanceof Parse.User, "Model should be a Parse.User");
        strictEqual(Parse.User.current(), model);
        ok(model.extended(), "Should have used the subclass.");
        strictEqual(provider.authData.id, provider.synchronizedUserId);
        strictEqual(provider.authData.access_token, provider.synchronizedAuthToken);
        strictEqual(provider.authData.expiration_date, provider.synchronizedExpiration);
        ok(model._isLinked("facebook"), "User should be linked to facebook");

        Parse.User.logOut();
        ok(provider.loggedOut);
        provider.loggedOut = false;

        Parse.User._logInWith("facebook", {
          success: function(innerModel) {
            ok(innerModel instanceof Parse.User,
               "Model should be a Parse.User");
            ok(innerModel === Parse.User.current(),
               "Returned model should be the current user");
            ok(provider.authData.id === provider.synchronizedUserId);
            ok(provider.authData.access_token === provider.synchronizedAuthToken);
            ok(innerModel._isLinked("facebook"),
               "User should be linked to facebook");
            ok(innerModel.existed(), "User should not be newly-created");
            done();
          },
          error: function(model, error) {
            fail(error);
            ok(false, "LogIn should have worked");
            done();
          }
        });
      },
      error: function(model, error) {
        console.error(model, error);
        ok(false, "LogIn should have worked");
        done();
      }
    });
  });

  it("log in with provider failed", (done) => {
    var provider = getMockFacebookProvider();
    provider.shouldError = true;
    Parse.User._registerAuthenticationProvider(provider);
    Parse.User._logInWith("facebook", {
      success: function(model) {
        ok(false, "logIn should not have succeeded");
      },
      error: function(model, error) {
        ok(error, "Error should be non-null");
        done();
      }
    });
  });

  it("log in with provider cancelled", (done) => {
    var provider = getMockFacebookProvider();
    provider.shouldCancel = true;
    Parse.User._registerAuthenticationProvider(provider);
    Parse.User._logInWith("facebook", {
      success: function(model) {
        ok(false, "logIn should not have succeeded");
      },
      error: function(model, error) {
        ok(error === null, "Error should be null");
        done();
      }
    });
  });

  it("login with provider should not call beforeSave trigger", (done) => {
    var provider = getMockFacebookProvider();
    Parse.User._registerAuthenticationProvider(provider);
    Parse.User._logInWith("facebook", {
      success: function(model) {
        Parse.User.logOut();

        Parse.Cloud.beforeSave(Parse.User, function(req, res) {
          res.error("Before save shouldn't be called on login");
        });

        Parse.User._logInWith("facebook", {
          success: function(innerModel) {
            Parse.Cloud._removeHook('Triggers', 'beforeSave', Parse.User.className);
            done();
          },
          error: function(model, error) {
            ok(undefined, error);
            Parse.Cloud._removeHook('Triggers', 'beforeSave', Parse.User.className);
            done();
          }
        });
      }
    });
  });

  it("link with provider", (done) => {
    var provider = getMockFacebookProvider();
    Parse.User._registerAuthenticationProvider(provider);
    var user = new Parse.User();
    user.set("username", "testLinkWithProvider");
    user.set("password", "mypass");
    user.signUp(null, {
      success: function(model) {
        user._linkWith("facebook", {
          success: function(model) {
            ok(model instanceof Parse.User, "Model should be a Parse.User");
            strictEqual(Parse.User.current(), model);
            strictEqual(provider.authData.id, provider.synchronizedUserId);
            strictEqual(provider.authData.access_token, provider.synchronizedAuthToken);
            strictEqual(provider.authData.expiration_date, provider.synchronizedExpiration);
            ok(model._isLinked("facebook"), "User should be linked");
            done();
          },
          error: function(model, error) {
            ok(false, "linking should have succeeded");
            done();
          }
        });
      },
      error: function(model, error) {
        ok(false, "signup should not have failed");
        done();
      }
    });
  });

  // What this means is, only one Parse User can be linked to a
  // particular Facebook account.
  it("link with provider for already linked user", (done) => {
    var provider = getMockFacebookProvider();
    Parse.User._registerAuthenticationProvider(provider);
    var user = new Parse.User();
    user.set("username", "testLinkWithProviderToAlreadyLinkedUser");
    user.set("password", "mypass");
    user.signUp(null, {
      success: function(model) {
        user._linkWith("facebook", {
          success: function(model) {
            ok(model instanceof Parse.User, "Model should be a Parse.User");
            strictEqual(Parse.User.current(), model);
            strictEqual(provider.authData.id, provider.synchronizedUserId);
            strictEqual(provider.authData.access_token, provider.synchronizedAuthToken);
            strictEqual(provider.authData.expiration_date, provider.synchronizedExpiration);
            ok(model._isLinked("facebook"), "User should be linked.");
            var user2 = new Parse.User();
            user2.set("username", "testLinkWithProviderToAlreadyLinkedUser2");
            user2.set("password", "mypass");
            user2.signUp(null, {
              success: function(model) {
                user2._linkWith('facebook', {
                  success: fail,
                  error: function(model, error) {
                    expect(error.code).toEqual(
                      Parse.Error.ACCOUNT_ALREADY_LINKED);
                    done();
                  },
                });
              },
              error: function(model, error) {
                ok(false, "linking should have failed");
                done();
              }
            });
          },
          error: function(model, error) {
            ok(false, "linking should have succeeded");
            done();
          }
        });
      },
      error: function(model, error) {
        ok(false, "signup should not have failed");
        done();
      }
    });
  });

  it("link with provider failed", (done) => {
    var provider = getMockFacebookProvider();
    provider.shouldError = true;
    Parse.User._registerAuthenticationProvider(provider);
    var user = new Parse.User();
    user.set("username", "testLinkWithProvider");
    user.set("password", "mypass");
    user.signUp(null, {
      success: function(model) {
        user._linkWith("facebook", {
          success: function(model) {
            ok(false, "linking should fail");
            done();
          },
          error: function(model, error) {
            ok(error, "Linking should fail");
            ok(!model._isLinked("facebook"),
               "User should not be linked to facebook");
            done();
          }
        });
      },
      error: function(model, error) {
        ok(false, "signup should not have failed");
        done();
      }
    });
  });

  it("link with provider cancelled", (done) => {
    var provider = getMockFacebookProvider();
    provider.shouldCancel = true;
    Parse.User._registerAuthenticationProvider(provider);
    var user = new Parse.User();
    user.set("username", "testLinkWithProvider");
    user.set("password", "mypass");
    user.signUp(null, {
      success: function(model) {
        user._linkWith("facebook", {
          success: function(model) {
            ok(false, "linking should fail");
            done();
          },
          error: function(model, error) {
            ok(!error, "Linking should be cancelled");
            ok(!model._isLinked("facebook"),
               "User should not be linked to facebook");
            done();
          }
        });
      },
      error: function(model, error) {
        ok(false, "signup should not have failed");
        done();
      }
    });
  });

  it("unlink with provider", (done) => {
    var provider = getMockFacebookProvider();
    Parse.User._registerAuthenticationProvider(provider);
    Parse.User._logInWith("facebook", {
      success: function(model) {
        ok(model instanceof Parse.User, "Model should be a Parse.User.");
        strictEqual(Parse.User.current(), model);
        ok(model.extended(), "Should have used the subclass.");
        strictEqual(provider.authData.id, provider.synchronizedUserId);
        strictEqual(provider.authData.access_token, provider.synchronizedAuthToken);
        strictEqual(provider.authData.expiration_date, provider.synchronizedExpiration);
        ok(model._isLinked("facebook"), "User should be linked to facebook.");

        model._unlinkFrom("facebook", {
          success: function(model) {
            ok(!model._isLinked("facebook"), "User should not be linked.");
            ok(!provider.synchronizedUserId, "User id should be cleared.");
            ok(!provider.synchronizedAuthToken,
               "Auth token should be cleared.");
            ok(!provider.synchronizedExpiration,
               "Expiration should be cleared.");
            done();
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

  it("unlink and link", (done) => {
    var provider = getMockFacebookProvider();
    Parse.User._registerAuthenticationProvider(provider);
    Parse.User._logInWith("facebook", {
      success: function(model) {
        ok(model instanceof Parse.User, "Model should be a Parse.User");
        strictEqual(Parse.User.current(), model);
        ok(model.extended(), "Should have used the subclass.");
        strictEqual(provider.authData.id, provider.synchronizedUserId);
        strictEqual(provider.authData.access_token, provider.synchronizedAuthToken);
        strictEqual(provider.authData.expiration_date, provider.synchronizedExpiration);
        ok(model._isLinked("facebook"), "User should be linked to facebook");

        model._unlinkFrom("facebook", {
          success: function(model) {
            ok(!model._isLinked("facebook"),
               "User should not be linked to facebook");
            ok(!provider.synchronizedUserId, "User id should be cleared");
            ok(!provider.synchronizedAuthToken, "Auth token should be cleared");
            ok(!provider.synchronizedExpiration,
               "Expiration should be cleared");

            model._linkWith("facebook", {
              success: function(model) {
                ok(provider.synchronizedUserId, "User id should have a value");
                ok(provider.synchronizedAuthToken,
                   "Auth token should have a value");
                ok(provider.synchronizedExpiration,
                   "Expiration should have a value");
                ok(model._isLinked("facebook"),
                   "User should be linked to facebook");
                done();
              },
              error: function(model, error) {
                ok(false, "linking again should succeed");
                done();
              }
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

  it("link multiple providers", (done) => {
    var provider = getMockFacebookProvider();
    var mockProvider = getMockMyOauthProvider();
    Parse.User._registerAuthenticationProvider(provider);
    Parse.User._logInWith("facebook", {
      success: function(model) {
        ok(model instanceof Parse.User, "Model should be a Parse.User");
        strictEqual(Parse.User.current(), model);
        ok(model.extended(), "Should have used the subclass.");
        strictEqual(provider.authData.id, provider.synchronizedUserId);
        strictEqual(provider.authData.access_token, provider.synchronizedAuthToken);
        strictEqual(provider.authData.expiration_date, provider.synchronizedExpiration);
        ok(model._isLinked("facebook"), "User should be linked to facebook");
        Parse.User._registerAuthenticationProvider(mockProvider);
        let objectId = model.id;
        model._linkWith("myoauth", {
          success: function(model) {
            expect(model.id).toEqual(objectId);
            ok(model._isLinked("facebook"), "User should be linked to facebook");
            ok(model._isLinked("myoauth"), "User should be linked to myoauth");
            done();
          },
          error: function(error) {
            console.error(error);
            fail('SHould not fail');
            done();
          }
        })
      },
      error: function(model, error) {
        ok(false, "linking should have worked");
        done();
      }
    });
  });

  it("link multiple providers and update token", (done) => {
    var provider = getMockFacebookProvider();
    var mockProvider = getMockMyOauthProvider();
    Parse.User._registerAuthenticationProvider(provider);
    Parse.User._logInWith("facebook", {
      success: function(model) {
        ok(model instanceof Parse.User, "Model should be a Parse.User");
        strictEqual(Parse.User.current(), model);
        ok(model.extended(), "Should have used the subclass.");
        strictEqual(provider.authData.id, provider.synchronizedUserId);
        strictEqual(provider.authData.access_token, provider.synchronizedAuthToken);
        strictEqual(provider.authData.expiration_date, provider.synchronizedExpiration);
        ok(model._isLinked("facebook"), "User should be linked to facebook");
        Parse.User._registerAuthenticationProvider(mockProvider);
        let objectId = model.id;
        model._linkWith("myoauth", {
          success: function(model) {
            expect(model.id).toEqual(objectId);
            ok(model._isLinked("facebook"), "User should be linked to facebook");
            ok(model._isLinked("myoauth"), "User should be linked to myoauth");
            model._linkWith("facebook", {
              success: () => {
                ok(model._isLinked("facebook"), "User should be linked to facebook");
                ok(model._isLinked("myoauth"), "User should be linked to myoauth");
                done();
              },
              error: () => {
                fail('should link again');
                done();
              }
            })
          },
          error: function(error) {
            console.error(error);
            fail('SHould not fail');
            done();
          }
        })
      },
      error: function(model, error) {
        ok(false, "linking should have worked");
        done();
      }
    });
  });

  it('should fail linking with existing', (done) => {
    var provider = getMockFacebookProvider();
    Parse.User._registerAuthenticationProvider(provider);
    Parse.User._logInWith("facebook", {
      success: function(model) {
        Parse.User.logOut().then(() => {
          let user = new Parse.User();
          user.setUsername('user');
          user.setPassword('password');
          return user.signUp().then(() => {
            // try to link here
            user._linkWith('facebook', {
              success: () => {
                fail('should not succeed');
                done();
              },
              error: (err) => {
                done();
              }
            });
          });
        });
      }
    });
  });

  it('should fail linking with existing', (done) => {
    var provider = getMockFacebookProvider();
    Parse.User._registerAuthenticationProvider(provider);
    Parse.User._logInWith("facebook", {
      success: function(model) {
        let userId = model.id;
        Parse.User.logOut().then(() => {
          request.post({
             url:Parse.serverURL+'/classes/_User',
             headers: {
               'X-Parse-Application-Id': Parse.applicationId,
               'X-Parse-REST-API-Key': 'rest'
             },
             json: {authData: {facebook: provider.authData}}
          }, (err,res, body) => {
            // make sure the location header is properly set
            expect(userId).not.toBeUndefined();
            expect(body.objectId).toEqual(userId);
            expect(res.headers.location).toEqual(Parse.serverURL+'/users/'+userId);
            done();
          });
        });
      }
    });
  });

  it('should have authData in beforeSave and afterSave', (done) => {

    Parse.Cloud.beforeSave('_User', (request, response) => {
      let authData = request.object.get('authData');
      expect(authData).not.toBeUndefined();
      if (authData) {
        expect(authData.facebook.id).toEqual('8675309');
        expect(authData.facebook.access_token).toEqual('jenny');
      } else {
        fail('authData should be set');
      }
      response.success();
    });

    Parse.Cloud.afterSave('_User', (request, response) => {
      let authData = request.object.get('authData');
      expect(authData).not.toBeUndefined();
      if (authData) {
        expect(authData.facebook.id).toEqual('8675309');
        expect(authData.facebook.access_token).toEqual('jenny');
      } else {
        fail('authData should be set');
      }
      response.success();
    });

    var provider = getMockFacebookProvider();
    Parse.User._registerAuthenticationProvider(provider);
    Parse.User._logInWith("facebook", {
      success: function(model) {
        Parse.Cloud._removeHook('Triggers', 'beforeSave', Parse.User.className);
        Parse.Cloud._removeHook('Triggers', 'afterSave', Parse.User.className);
        done();
      }
    });
  });

  it('set password then change password', (done) => {
    Parse.User.signUp('bob', 'barker').then((bob) => {
      bob.setPassword('meower');
      return bob.save();
    }).then(() => {
      return Parse.User.logIn('bob', 'meower');
    }).then((bob) => {
      expect(bob.getUsername()).toEqual('bob');
      done();
    }, (e) => {
      console.log(e);
      fail();
    });
  });

  it("authenticated check", (done) => {
    var user = new Parse.User();
    user.set("username", "darkhelmet");
    user.set("password", "onetwothreefour");
    ok(!user.authenticated());
    user.signUp(null, expectSuccess({
      success: function(result) {
        ok(user.authenticated());
        done();
      }
    }));
  });

  it("log in with explicit facebook auth data", (done) => {
    Parse.FacebookUtils.logIn({
      id: "8675309",
      access_token: "jenny",
      expiration_date: new Date().toJSON()
    }, expectSuccess({success: done}));
  });

  it("log in async with explicit facebook auth data", (done) => {
    Parse.FacebookUtils.logIn({
      id: "8675309",
      access_token: "jenny",
      expiration_date: new Date().toJSON()
    }).then(function() {
      done();
    }, function(error) {
      ok(false, error);
      done();
    });
  });

  it("link with explicit facebook auth data", (done) => {
    Parse.User.signUp("mask", "open sesame", null, expectSuccess({
      success: function(user) {
        Parse.FacebookUtils.link(user, {
          id: "8675309",
          access_token: "jenny",
          expiration_date: new Date().toJSON()
        }).then(done, (error) => {
          fail(error);
          done();
        });
      }
    }));
  });

  it("link async with explicit facebook auth data", (done) => {
    Parse.User.signUp("mask", "open sesame", null, expectSuccess({
      success: function(user) {
        Parse.FacebookUtils.link(user, {
          id: "8675309",
          access_token: "jenny",
          expiration_date: new Date().toJSON()
        }).then(function() {
          done();
        }, function(error) {
          ok(false, error);
          done();
        });
      }
    }));
  });

  it("async methods", (done) => {
    var data = { foo: "bar" };

    Parse.User.signUp("finn", "human", data).then(function(user) {
      equal(Parse.User.current(), user);
      equal(user.get("foo"), "bar");
      return Parse.User.logOut();
    }).then(function() {
      return Parse.User.logIn("finn", "human");
    }).then(function(user) {
      equal(user, Parse.User.current());
      equal(user.get("foo"), "bar");
      return Parse.User.logOut();
    }).then(function() {
      var user = new Parse.User();
      user.set("username", "jake");
      user.set("password", "dog");
      user.set("foo", "baz");
      return user.signUp();
    }).then(function(user) {
      equal(user, Parse.User.current());
      equal(user.get("foo"), "baz");
      user = new Parse.User();
      user.set("username", "jake");
      user.set("password", "dog");
      return user.logIn();
    }).then(function(user) {
      equal(user, Parse.User.current());
      equal(user.get("foo"), "baz");
      var userAgain = new Parse.User();
      userAgain.id = user.id;
      return userAgain.fetch();
    }).then(function(userAgain) {
      equal(userAgain.get("foo"), "baz");
      done();
    });
  });

  notWorking("querying for users doesn't get session tokens", (done) => {
    Parse.Promise.as().then(function() {
      return Parse.User.signUp("finn", "human", { foo: "bar" });

    }).then(function() {
      return Parse.User.logOut();
    }).then(() => {
      var user = new Parse.User();
      user.set("username", "jake");
      user.set("password", "dog");
      user.set("foo", "baz");
      return user.signUp();

    }).then(function() {
      return Parse.User.logOut();
    }).then(() => {
      var query = new Parse.Query(Parse.User);
      return query.find();

    }).then(function(users) {
      equal(users.length, 2);
      for (var user of users) {
        ok(!user.getSessionToken(), "user should not have a session token.");
      }

      done();
    }, function(error) {
      ok(false, error);
      done();
    });
  });

  it("querying for users only gets the expected fields", (done) => {
    Parse.Promise.as().then(() => {
      return Parse.User.signUp("finn", "human", { foo: "bar" });
    }).then(() => {
      request.get({
        headers: {'X-Parse-Application-Id': 'test',
          'X-Parse-REST-API-Key': 'rest'},
        url: 'http://localhost:8378/1/users',
      }, (error, response, body) => {
        expect(error).toBe(null);
        var b = JSON.parse(body);
        expect(b.results.length).toEqual(1);
        var user = b.results[0];
        expect(Object.keys(user).length).toEqual(6);
        done();
      });
    });
  });

  it('retrieve user data from fetch, make sure the session token hasn\'t changed', (done) => {
    var user = new Parse.User();
    user.setPassword("asdf");
    user.setUsername("zxcv");
    var currentSessionToken = "";
    Parse.Promise.as().then(function() {
        return user.signUp();
    }).then(function(){
        currentSessionToken = user.getSessionToken();
        return user.fetch();
    }).then(function(u){
        expect(currentSessionToken).toEqual(u.getSessionToken());
        done();
    }, function(error) {
      ok(false, error);
      done();
    })
  });

  it('user save should fail with invalid email', (done) => {
    var user = new Parse.User();
    user.set('username', 'teste');
    user.set('password', 'test');
    user.set('email', 'invalid');
    user.signUp().then(() => {
      fail('Should not have been able to save.');
      done();
    }, (error) => {
      expect(error.code).toEqual(125);
      done();
    });
  });

  it('user signup should error if email taken', (done) => {
    var user = new Parse.User();
    user.set('username', 'test1');
    user.set('password', 'test');
    user.set('email', 'test@test.com');
    user.signUp().then(() => {
      var user2 = new Parse.User();
      user2.set('username', 'test2');
      user2.set('password', 'test');
      user2.set('email', 'test@test.com');
      return user2.signUp();
    }).then(() => {
      fail('Should not have been able to sign up.');
      done();
    }, (error) => {
      done();
    });
  });

  it('user cannot update email to existing user', (done) => {
    var user = new Parse.User();
    user.set('username', 'test1');
    user.set('password', 'test');
    user.set('email', 'test@test.com');
    user.signUp().then(() => {
      var user2 = new Parse.User();
      user2.set('username', 'test2');
      user2.set('password', 'test');
      return user2.signUp();
    }).then((user2) => {
      user2.set('email', 'test@test.com');
      return user2.save();
    }).then(() => {
      fail('Should not have been able to sign up.');
      done();
    }, (error) => {
      done();
    });
  });

  it('create session from user', (done) => {
    Parse.Promise.as().then(() => {
      return Parse.User.signUp("finn", "human", { foo: "bar" });
    }).then((user) => {
      request.post({
        headers: {
          'X-Parse-Application-Id': 'test',
          'X-Parse-Session-Token': user.getSessionToken(),
          'X-Parse-REST-API-Key': 'rest'
        },
        url: 'http://localhost:8378/1/sessions',
      }, (error, response, body) => {
        expect(error).toBe(null);
        var b = JSON.parse(body);
        expect(typeof b.sessionToken).toEqual('string');
        expect(typeof b.createdWith).toEqual('object');
        expect(b.createdWith.action).toEqual('create');
        expect(typeof b.user).toEqual('object');
        expect(b.user.objectId).toEqual(user.id);
        done();
      });
    });
  });

  it('user get session from token on signup', (done) => {
    Parse.Promise.as().then(() => {
      return Parse.User.signUp("finn", "human", { foo: "bar" });
    }).then((user) => {
      request.get({
        headers: {
          'X-Parse-Application-Id': 'test',
          'X-Parse-Session-Token': user.getSessionToken(),
          'X-Parse-REST-API-Key': 'rest'
        },
        url: 'http://localhost:8378/1/sessions/me',
      }, (error, response, body) => {
        expect(error).toBe(null);
        var b = JSON.parse(body);
        expect(typeof b.sessionToken).toEqual('string');
        expect(typeof b.createdWith).toEqual('object');
        expect(b.createdWith.action).toEqual('signup');
        expect(typeof b.user).toEqual('object');
        expect(b.user.objectId).toEqual(user.id);
        done();
      });
    });
  });

  it('user get session from token on login', (done) => {
    Parse.Promise.as().then(() => {
      return Parse.User.signUp("finn", "human", { foo: "bar" });
    }).then((user) => {
      return Parse.User.logOut().then(() => {
        return Parse.User.logIn("finn", "human");
      })
    }).then((user) => {
      request.get({
        headers: {
          'X-Parse-Application-Id': 'test',
          'X-Parse-Session-Token': user.getSessionToken(),
          'X-Parse-REST-API-Key': 'rest'
        },
        url: 'http://localhost:8378/1/sessions/me',
      }, (error, response, body) => {
        expect(error).toBe(null);
        var b = JSON.parse(body);
        expect(typeof b.sessionToken).toEqual('string');
        expect(typeof b.createdWith).toEqual('object');
        expect(b.createdWith.action).toEqual('login');
        expect(typeof b.user).toEqual('object');
        expect(b.user.objectId).toEqual(user.id);
        done();
      });
    });
  });

  it('user update session with other field', (done) => {
    Parse.Promise.as().then(() => {
      return Parse.User.signUp("finn", "human", { foo: "bar" });
    }).then((user) => {
      request.get({
        headers: {
          'X-Parse-Application-Id': 'test',
          'X-Parse-Session-Token': user.getSessionToken(),
          'X-Parse-REST-API-Key': 'rest'
        },
        url: 'http://localhost:8378/1/sessions/me',
      }, (error, response, body) => {
        expect(error).toBe(null);
        var b = JSON.parse(body);
        request.put({
          headers: {
            'X-Parse-Application-Id': 'test',
            'X-Parse-Session-Token': user.getSessionToken()
          },
          url: 'http://localhost:8378/1/sessions/' + b.objectId,
          body: JSON.stringify({ foo: 'bar' })
        }, (error, response, body) => {
          expect(error).toBe(null);
          var b = JSON.parse(body);
          done();
        });
      });
    });
  });

  it('get session only for current user', (done) => {
    Parse.Promise.as().then(() => {
      return Parse.User.signUp("test1", "test", { foo: "bar" });
    }).then(() => {
      return Parse.User.signUp("test2", "test", { foo: "bar" });
    }).then((user) => {
      request.get({
        headers: {
          'X-Parse-Application-Id': 'test',
          'X-Parse-Session-Token': user.getSessionToken(),
          'X-Parse-REST-API-Key': 'rest'
        },
        url: 'http://localhost:8378/1/sessions'
      }, (error, response, body) => {
        expect(error).toBe(null);
        var b = JSON.parse(body);
        expect(b.results.length).toEqual(1);
        expect(typeof b.results[0].user).toEqual('object');
        expect(b.results[0].user.objectId).toEqual(user.id);
        done();
      });
    });
  });

  it('delete session by object', (done) => {
    Parse.Promise.as().then(() => {
      return Parse.User.signUp("test1", "test", { foo: "bar" });
    }).then(() => {
      return Parse.User.signUp("test2", "test", { foo: "bar" });
    }).then((user) => {
      request.get({
        headers: {
          'X-Parse-Application-Id': 'test',
          'X-Parse-Session-Token': user.getSessionToken(),
          'X-Parse-REST-API-Key': 'rest'
        },
        url: 'http://localhost:8378/1/sessions'
      }, (error, response, body) => {
        expect(error).toBe(null);
        var b = JSON.parse(body);
        expect(b.results.length).toEqual(1);
        var objId = b.results[0].objectId;
        request.del({
          headers: {
            'X-Parse-Application-Id': 'test',
            'X-Parse-Session-Token': user.getSessionToken(),
            'X-Parse-REST-API-Key': 'rest'
          },
          url: 'http://localhost:8378/1/sessions/' + objId
        }, (error, response, body) => {
          expect(error).toBe(null);
          request.get({
            headers: {
              'X-Parse-Application-Id': 'test',
              'X-Parse-Session-Token': user.getSessionToken(),
              'X-Parse-REST-API-Key': 'rest'
            },
            url: 'http://localhost:8378/1/sessions'
          }, (error, response, body) => {
            expect(error).toBe(null);
            var b = JSON.parse(body);
            expect(b.code).toEqual(209);
            done();
          });
        });
      });
    });
  });

  it('password format matches hosted parse', (done) => {
    var hashed = '$2a$10$8/wZJyEuiEaobBBqzTG.jeY.XSFJd0rzaN//ososvEI4yLqI.4aie';
    passwordCrypto.compare('test', hashed)
    .then((pass) => {
      expect(pass).toBe(true);
      done();
    }, (e) => {
      fail('Password format did not match.');
      done();
    });
  });

  it('changing password clears sessions', (done) => {
    var sessionToken = null;

    Parse.Promise.as().then(function() {
      return Parse.User.signUp("fosco", "parse");
    }).then(function(newUser) {
      equal(Parse.User.current(), newUser);
      sessionToken = newUser.getSessionToken();
      ok(sessionToken);
      newUser.set('password', 'facebook');
      return newUser.save();
    }).then(function() {
      return Parse.User.become(sessionToken);
    }).then(function(newUser) {
      fail('Session should have been invalidated');
      done();
    }, function(err) {
      expect(err.code).toBe(Parse.Error.INVALID_SESSION_TOKEN);
      expect(err.message).toBe('invalid session token');
      done();
    });
  });

  it('test parse user become', (done) => {
    var sessionToken = null;
    Parse.Promise.as().then(function() {
      return Parse.User.signUp("flessard", "folo",{'foo':1});
    }).then(function(newUser) {
      equal(Parse.User.current(), newUser);
      sessionToken = newUser.getSessionToken();
      ok(sessionToken);
      newUser.set('foo',2);
      return newUser.save();
    }).then(function() {
      return Parse.User.become(sessionToken);
    }).then(function(newUser) {
      equal(newUser.get('foo'), 2);
      done();
    }, function(e) {
      fail('The session should still be valid');
      done();
    });
  });

  it('ensure logout works', (done) => {
    var user = null;
    var sessionToken = null;

    Parse.Promise.as().then(function() {
      return Parse.User.signUp('log', 'out');
    }).then((newUser) => {
      user = newUser;
      sessionToken = user.getSessionToken();
      return Parse.User.logOut();
    }).then(() => {
      user.set('foo', 'bar');
      return user.save(null, { sessionToken: sessionToken });
    }).then(() => {
      fail('Save should have failed.');
      done();
    }, (e) => {
      expect(e.code).toEqual(Parse.Error.SESSION_MISSING);
      done();
    });
  });

  it('support user/password signup with empty authData block', (done) => {
    // The android SDK can send an empty authData object along with username and password.
    Parse.User.signUp('artof', 'thedeal', { authData: {} }).then((user) => {
      done();
    }, (error) => {
      fail('Signup should have succeeded.');
      done();
    });
  });

  it("session expiresAt correct format", (done) => {
    Parse.User.signUp("asdf", "zxcv", null, {
      success: function(user) {
        request.get({
          url: 'http://localhost:8378/1/classes/_Session',
          json: true,
          headers: {
            'X-Parse-Application-Id': 'test',
            'X-Parse-Master-Key': 'test',
          },
        }, (error, response, body) => {
          expect(body.results[0].expiresAt.__type).toEqual('Date');
          done();
        })
      }
    });
  });

  // Sometimes the authData still has null on that keys
  // https://github.com/ParsePlatform/parse-server/issues/935
  it('should cleanup null authData keys', (done) => {
    let database = new Config(Parse.applicationId).database;
    database.create('_User', {
      username: 'user',
      password: '$2a$10$8/wZJyEuiEaobBBqzTG.jeY.XSFJd0rzaN//ososvEI4yLqI.4aie',
      _auth_data_facebook: null
    }, {}).then(() => {
      return new Promise((resolve, reject) => {
        request.get({
          url: 'http://localhost:8378/1/login?username=user&password=test',
          headers: {
            'X-Parse-Application-Id': 'test',
            'X-Parse-Master-Key': 'test',
          },
          json: true
        }, (err, res, body) => {
          if (err) {
            reject(err);
          } else {
            resolve(body);
          }
        })
      })
    }).then((user) => {
      let authData = user.authData;
      expect(user.username).toEqual('user');
      expect(authData).toBeUndefined();
      done();
    }).catch((err) => {
      fail('this should not fail');
      done();
    })
  });

  // https://github.com/ParsePlatform/parse-server/issues/1198
  it('should cleanup null authData keys ParseUser update', (done) => {
    Parse.Cloud.beforeSave('_User', (req, res) => {
      req.object.set('foo', 'bar');
      res.success();
    });

    // Simulate anonymous user save
    new Promise((resolve, reject) => {
      request.post({
        url: 'http://localhost:8378/1/classes/_User',
        headers: {
          'X-Parse-Application-Id': Parse.applicationId,
          'X-Parse-REST-API-Key': 'rest',
        },
        json: {authData: {anonymous: {id: '00000000-0000-0000-0000-000000000001'}}}
      }, (err, res, body) => {
        if (err) {
          reject(err);
        } else {
          resolve(body);
        }
      });
    }).then((user) => {
      // Simulate registration
      return new Promise((resolve, reject) => {
        request.put({
          url: 'http://localhost:8378/1/classes/_User/' + user.objectId,
          headers: {
            'X-Parse-Application-Id': Parse.applicationId,
            'X-Parse-Session-Token': user.sessionToken,
            'X-Parse-REST-API-Key': 'rest',
          },
          json: {
            authData: {anonymous: null},
            user: 'user',
            password: 'password',
          }
        }, (err, res, body) => {
          if (err) {
            reject(err);
          } else {
            resolve(body);
          }
        });
      });
    }).then((user) => {
      expect(typeof user).toEqual('object');
      expect(user.authData).toBeUndefined();
      Parse.Cloud._removeHook('Triggers', 'beforeSave', '_User');
      done();
    }).catch((err) => {
      fail('no request should fail: ' + JSON.stringify(err));
      Parse.Cloud._removeHook('Triggers', 'beforeSave', '_User');
      done();
    });
  });


  it('should aftersave with full object', (done) => {
    var hit = 0;
    Parse.Cloud.afterSave('_User', (req, res) => {
      hit++;
      expect(req.object.get('username')).toEqual('User');
      res.success();
    });
    let user = new Parse.User()
    user.setUsername('User');
    user.setPassword('pass');
    user.signUp().then(()=> {
      user.set('hello', 'world');
      return user.save();
    }).then(() => {
      Parse.Cloud._removeHook('Triggers', 'afterSave', '_User');
      done();
    });
  });

  it('changes to a user should update the cache', (done) => {
    Parse.Cloud.define('testUpdatedUser', (req, res) => {
      expect(req.user.get('han')).toEqual('solo');
      res.success({});
    });
    let user = new Parse.User();
    user.setUsername('harrison');
    user.setPassword('ford');
    user.signUp().then(() => {
      user.set('han', 'solo');
      return user.save();
    }).then(() => {
      return Parse.Cloud.run('testUpdatedUser');
    }).then(() => {
      done();
    }, (e) => {
      fail('Should not have failed.');
      done();
    });

  });
});
