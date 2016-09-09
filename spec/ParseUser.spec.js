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
const rp = require('request-promise');

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
        jfail(err);
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

  it('user login with non-string username with REST API', (done) => {
    Parse.User.signUp('asdf', 'zxcv', null, {
      success: () => {
        return rp.post({
          url: 'http://localhost:8378/1/login',
          headers: {
            'X-Parse-Application-Id': Parse.applicationId,
            'X-Parse-REST-API-Key': 'rest',
          },
          json: {
            _method: 'GET',
            username: {'$regex':'^asd'},
            password: 'zxcv',
          }
        }).then((res) => {
          fail(`no request should succeed: ${JSON.stringify(res)}`);
          done();
        }).catch((err) => {
          expect(err.statusCode).toBe(404);
          expect(err.message).toMatch('{"code":101,"error":"Invalid username/password."}');
          done();
        });
      },
    });
  });

  it('user login with non-string username with REST API', (done) => {
    Parse.User.signUp('asdf', 'zxcv', null, {
      success: () => {
        return rp.post({
          url: 'http://localhost:8378/1/login',
          headers: {
            'X-Parse-Application-Id': Parse.applicationId,
            'X-Parse-REST-API-Key': 'rest',
          },
          json: {
            _method: 'GET',
            username: 'asdf',
            password: {'$regex':'^zx'},
          }
        }).then((res) => {
          fail(`no request should succeed: ${JSON.stringify(res)}`);
          done();
        }).catch((err) => {
          expect(err.statusCode).toBe(404);
          expect(err.message).toMatch('{"code":101,"error":"Invalid username/password."}');
          done();
        });
      },
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

  it('should respect ACL without locking user out', (done) => {
    let user = new Parse.User();
    let ACL = new Parse.ACL();
    ACL.setPublicReadAccess(false);
    ACL.setPublicWriteAccess(false);
    user.setUsername('asdf');
    user.setPassword('zxcv');
    user.setACL(ACL);
    user.signUp().then((user) => {
      return Parse.User.logIn("asdf", "zxcv");
    }).then((user) => {
      equal(user.get("username"), "asdf");
      const ACL = user.getACL();
      expect(ACL.getReadAccess(user)).toBe(true);
      expect(ACL.getWriteAccess(user)).toBe(true);
      expect(ACL.getPublicReadAccess()).toBe(false);
      expect(ACL.getPublicWriteAccess()).toBe(false);
      const perms = ACL.permissionsById;
      expect(Object.keys(perms).length).toBe(1);
      expect(perms[user.id].read).toBe(true);
      expect(perms[user.id].write).toBe(true);
      expect(perms['*']).toBeUndefined();
      // Try to lock out user
      let newACL = new Parse.ACL();
      newACL.setReadAccess(user.id, false);
      newACL.setWriteAccess(user.id, false);
      user.setACL(newACL);
      return user.save();
    }).then((user) => {
      return Parse.User.logIn("asdf", "zxcv");
    }).then((user) => {
      equal(user.get("username"), "asdf");
      const ACL = user.getACL();
      expect(ACL.getReadAccess(user)).toBe(true);
      expect(ACL.getWriteAccess(user)).toBe(true);
      expect(ACL.getPublicReadAccess()).toBe(false);
      expect(ACL.getPublicWriteAccess()).toBe(false);
      const perms = ACL.permissionsById;
      expect(Object.keys(perms).length).toBe(1);
      expect(perms[user.id].read).toBe(true);
      expect(perms[user.id].write).toBe(true);
      expect(perms['*']).toBeUndefined();
      done();
    }).catch((err) => {
      fail("Should not fail");
      done();
    })
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
    }).catch(err => {
      jfail(err);
      done();
    });
  });

  it('become sends token back', done => {
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
      jfail(error);
      done();
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
      if (!users || users.length != USERS) {
        fail('signupAll failed');
        done();
        return;
      }
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

  var getMockFacebookProviderWithIdToken = function(id, token) {
    return {
      authData: {
        id: id,
        access_token: token,
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
  }

  // Note that this mocks out client-side Facebook action rather than
  // server-side.
  var getMockFacebookProvider = function() {
    return getMockFacebookProviderWithIdToken('8675309', 'jenny');
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
        jfail(error);
        ok(false, "linking should have worked");
        done();
      }
    });
  });

  it("user authData should be available in cloudcode (#2342)", (done) => {

    Parse.Cloud.define('checkLogin', (req, res) => {
      expect(req.user).not.toBeUndefined();
      expect(Parse.FacebookUtils.isLinked(req.user)).toBe(true);
      res.success();
    });

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

        Parse.Cloud.run('checkLogin').then(done, done);
      },
      error: function(model, error) {
        jfail(error);
        ok(false, "linking should have worked");
        done();
      }
    });
  });

  it("log in with provider and update token", (done) => {
    var provider = getMockFacebookProvider();
    var secondProvider = getMockFacebookProviderWithIdToken('8675309', 'jenny_valid_token');
    var errorHandler = function(err) {
      fail('should not fail');
      done();
    }
    Parse.User._registerAuthenticationProvider(provider);
    Parse.User._logInWith("facebook", {
      success: (model) => {
        Parse.User._registerAuthenticationProvider(secondProvider);
        return Parse.User.logOut().then(() => {
          Parse.User._logInWith("facebook", {
            success: (model) => {
              expect(secondProvider.synchronizedAuthToken).toEqual('jenny_valid_token');
              // Make sure we can login with the new token again
              Parse.User.logOut().then(() => {
                Parse.User._logInWith("facebook", {
                  success: done,
                  error: errorHandler
                });
              });
            },
            error: errorHandler
          });
        })
      },
      error: errorHandler
    }).catch((err) => {
      errorHandler(err);
      done();
    });
  });

  it('returns authData when authed and logged in with provider (regression test for #1498)', done => {
    Parse.Object.enableSingleInstance();
    let provider = getMockFacebookProvider();
    Parse.User._registerAuthenticationProvider(provider);
    Parse.User._logInWith('facebook', {
      success: user => {
        let userQuery = new Parse.Query(Parse.User);
        userQuery.get(user.id)
        .then(user => {
          expect(user.get('authData')).not.toBeUndefined();
          Parse.Object.disableSingleInstance();
          done();
        });
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
      jfail(error);
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
            jfail(error);
            ok(false, "LogIn should have worked");
            done();
          }
        });
      },
      error: function(model, error) {
        jfail(error);
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
            done();
          },
          error: function(model, error) {
            ok(undefined, error);
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
                  success: (err) => {
                    jfail(err);
                    done();
                  },
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
            jfail(error);
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

  it("link multiple providers and updates token", (done) => {
    var provider = getMockFacebookProvider();
    var secondProvider = getMockFacebookProviderWithIdToken('8675309', 'jenny_valid_token');

    var errorHandler = function(model, error) {
      jfail(error);
      fail('Should not fail');
      done();
    }
    var mockProvider = getMockMyOauthProvider();
    Parse.User._registerAuthenticationProvider(provider);
    Parse.User._logInWith("facebook", {
      success: function(model) {
        Parse.User._registerAuthenticationProvider(mockProvider);
        let objectId = model.id;
        model._linkWith("myoauth", {
          success: function(model) {
            Parse.User._registerAuthenticationProvider(secondProvider);
            Parse.User.logOut().then(() => {
              return Parse.User._logInWith("facebook", {
                success: () => {
                  Parse.User.logOut().then(() => {
                    return Parse.User._logInWith("myoauth", {
                      success: (user) => {
                        expect(user.id).toBe(objectId);
                        done();
                      }
                    })
                  })
                },
                error: errorHandler
              });
            })
          },
          error: errorHandler
        })
      },
      error: errorHandler
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
            jfail(error);
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

  it('should properly error when password is missing', (done) => {
    var provider = getMockFacebookProvider();
    Parse.User._registerAuthenticationProvider(provider);
    Parse.User._logInWith("facebook", {
      success: function(user) {
        user.set('username', 'myUser');
        user.set('email', 'foo@example.com');
        user.save().then(() => {
          return Parse.User.logOut();
        }).then(() => {
          return Parse.User.logIn('myUser', 'password');
        }).then(() => {
          fail('should not succeed');
          done();
        }, (err) => {
          expect(err.code).toBe(Parse.Error.OBJECT_NOT_FOUND);
          expect(err.message).toEqual('Invalid username/password.');
          done();
        })
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
          jfail(error);
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

  it("querying for users doesn't get session tokens", (done) => {
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

  it('unset user email', (done) => {
    var user = new Parse.User();
    user.set('username', 'test');
    user.set('password', 'test');
    user.set('email', 'test@test.com');
    user.signUp().then(() => {
      user.unset('email');
      return user.save();
    }).then(() => {
      return Parse.User.logIn('test', 'test');
    }).then((user) => {
      expect(user.getEmail()).toBeUndefined();
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
        try {
          var b = JSON.parse(body);
          expect(b.results.length).toEqual(1);
          expect(typeof b.results[0].user).toEqual('object');
          expect(b.results[0].user.objectId).toEqual(user.id);
        } catch(e) {
          jfail(e);
        }
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
        var objId;
        try {
          var b = JSON.parse(body);
          expect(b.results.length).toEqual(1);
          objId = b.results[0].objectId;
        } catch(e) {
          jfail(e);
          done();
          return;
        }
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
      expect(e.code).toEqual(Parse.Error.INVALID_SESSION_TOKEN);
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

  it("invalid session tokens are rejected", (done) => {
    Parse.User.signUp("asdf", "zxcv", null, {
      success: function(user) {
        request.get({
          url: 'http://localhost:8378/1/classes/AClass',
          json: true,
          headers: {
            'X-Parse-Application-Id': 'test',
            'X-Parse-Rest-API-Key': 'rest',
            'X-Parse-Session-Token': 'text'
          },
        }, (error, response, body) => {
          expect(body.code).toBe(209);
          expect(body.error).toBe('invalid session token');
          done();
        })
      }
    });
  });

  it_exclude_dbs(['postgres'])('should cleanup null authData keys (regression test for #935)', (done) => {
    let database = new Config(Parse.applicationId).database;
    database.create('_User', {
      username: 'user',
      _hashed_password: '$2a$10$8/wZJyEuiEaobBBqzTG.jeY.XSFJd0rzaN//ososvEI4yLqI.4aie',
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

  it_exclude_dbs(['postgres'])('should not serve null authData keys', (done) => {
    let database = new Config(Parse.applicationId).database;
    database.create('_User', {
      username: 'user',
      _hashed_password: '$2a$10$8/wZJyEuiEaobBBqzTG.jeY.XSFJd0rzaN//ososvEI4yLqI.4aie',
      _auth_data_facebook: null
    }, {}).then(() => {
      return new Parse.Query(Parse.User)
        .equalTo('username', 'user')
        .first({useMasterKey: true});
    }).then((user) => {
      let authData = user.get('authData');
      expect(user.get('username')).toEqual('user');
      expect(authData).toBeUndefined();
      done();
    }).catch((err) => {
      fail('this should not fail');
      done();
    })
  });

  it('should cleanup null authData keys ParseUser update (regression test for #1198, #2252)', (done) => {
    Parse.Cloud.beforeSave('_User', (req, res) => {
      req.object.set('foo', 'bar');
      res.success();
    });
    
    let originalSessionToken;
    let originalUserId;
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
      originalSessionToken = user.sessionToken;
      originalUserId = user.objectId;
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
            username: 'user',
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
      expect(user.sessionToken).not.toBeUndefined();
      // Session token should have changed
      expect(user.sessionToken).not.toEqual(originalSessionToken);
      // test that the sessionToken is valid
      return new Promise((resolve, reject) => {
        request.get({
          url: 'http://localhost:8378/1/users/me',
          headers: {
            'X-Parse-Application-Id': Parse.applicationId,
            'X-Parse-Session-Token': user.sessionToken,
            'X-Parse-REST-API-Key': 'rest',
          },
          json: true
        }, (err, res, body) => {
          expect(body.username).toEqual('user');
          expect(body.objectId).toEqual(originalUserId);
          if (err) {
            reject(err);
          } else {
            resolve(body);
          }
          done();
        });
      });
    }).catch((err) => {
      fail('no request should fail: ' + JSON.stringify(err));
      done();
    });
  });

  it('should send email when upgrading from anon', (done) => {
    
    let emailCalled = false;
    let emailOptions;
    var emailAdapter = {
      sendVerificationEmail: (options) => {
        emailOptions = options;
        emailCalled = true;
      },
      sendPasswordResetEmail: () => Promise.resolve(),
      sendMail: () => Promise.resolve()
    }
    reconfigureServer({
      appName: 'unused',
      verifyUserEmails: true,
      emailAdapter: emailAdapter,
      publicServerURL: "http://localhost:8378/1"
    })
    // Simulate anonymous user save
    return rp.post({
        url: 'http://localhost:8378/1/classes/_User',
        headers: {
          'X-Parse-Application-Id': Parse.applicationId,
          'X-Parse-REST-API-Key': 'rest',
        },
        json: {authData: {anonymous: {id: '00000000-0000-0000-0000-000000000001'}}}
    }).then((user) => {
      return rp.put({
        url: 'http://localhost:8378/1/classes/_User/' + user.objectId,
        headers: {
          'X-Parse-Application-Id': Parse.applicationId,
          'X-Parse-Session-Token': user.sessionToken,
          'X-Parse-REST-API-Key': 'rest',
        },
        json: {
          authData: {anonymous: null},
          username: 'user',
          email: 'user@email.com',
          password: 'password',
        }
      });
    }).then(() => {
      expect(emailCalled).toBe(true);
      expect(emailOptions).not.toBeUndefined();
      expect(emailOptions.user.get('email')).toEqual('user@email.com');
      done();
    }).catch((err) => {
      jfail(err);
      fail('no request should fail: ' + JSON.stringify(err));
      done();
    });
  });

  it('should not send email when email is not a string', (done) => {
    let emailCalled = false;
    let emailOptions;
    var emailAdapter = {
      sendVerificationEmail: (options) => {
        emailOptions = options;
        emailCalled = true;
      },
      sendPasswordResetEmail: () => Promise.resolve(),
      sendMail: () => Promise.resolve()
    }
    reconfigureServer({
      appName: 'unused',
      verifyUserEmails: true,
      emailAdapter: emailAdapter,
      publicServerURL: 'http://localhost:8378/1',
    });
    var user = new Parse.User();
    user.set('username', 'asdf@jkl.com');
    user.set('password', 'zxcv');
    user.set('email', 'asdf@jkl.com');
    user.signUp(null, {
      success: (user) => {
        return rp.post({
          url: 'http://localhost:8378/1/requestPasswordReset',
          headers: {
            'X-Parse-Application-Id': Parse.applicationId,
            'X-Parse-Session-Token': user.sessionToken,
            'X-Parse-REST-API-Key': 'rest',
          },
          json: {
            email: {"$regex":"^asd"},
          }
        }).then((res) => {
          fail('no request should succeed: ' + JSON.stringify(res));
          done();
        }).catch((err) => {
          expect(err.statusCode).toBe(400);
          expect(err.message).toMatch('{"code":125,"error":"you must provide a valid email string"}');
          done();
        });
      },
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

  it('should fail to become user with expired token', (done) => {
    let token;
    Parse.User.signUp("auser", "somepass", null)
    .then(user => rp({
      method: 'GET',
      url: 'http://localhost:8378/1/classes/_Session',
      json: true,
      headers: {
        'X-Parse-Application-Id': 'test',
        'X-Parse-Master-Key': 'test',
      },
    }))
    .then(body => {
      var id = body.results[0].objectId;
      var expiresAt = new Date((new Date()).setYear(2015));
      token = body.results[0].sessionToken;
      return rp({
        method: 'PUT',
        url: "http://localhost:8378/1/classes/_Session/" + id,
        json: true,
        headers: {
          'X-Parse-Application-Id': 'test',
          'X-Parse-Master-Key': 'test',
        },
        body: {
          expiresAt: { __type: "Date", iso: expiresAt.toISOString() },
        },
      })
    })
    .then(() => Parse.User.become(token))
    .then(() => {
      fail("Should not have succeded")
      done();
    }, error => {
      expect(error.code).toEqual(209);
      expect(error.message).toEqual("Session token is expired.");
      done();
    })
  });

  it('should not create extraneous session tokens', (done) => {
    let config = new Config(Parse.applicationId);
    config.database.loadSchema().then((s) => {
      // Lock down the _User class for creation
      return s.addClassIfNotExists('_User', {}, {create: {}})
    }).then((res) => {
      let user  = new Parse.User();
      return user.save({'username': 'user', 'password': 'pass'});
    }).then(() => {
      fail('should not be able to save the user');
    }, (err) => {
      return Promise.resolve();
    }).then(() => {
      let q = new Parse.Query('_Session');
      return q.find({useMasterKey: true})
    }).then((res) => {
      // We should have no session created
      expect(res.length).toBe(0);
      done();
    }, (err) => {
      fail('should not fail');
      done();
    });
  });

  it('should not overwrite username when unlinking facebook user (regression test for #1532)', done => {
    Parse.Object.disableSingleInstance();
    var provider = getMockFacebookProvider();
    Parse.User._registerAuthenticationProvider(provider);
    var user = new Parse.User();
    user.set("username", "testLinkWithProvider");
    user.set("password", "mypass");
    user.signUp()
    .then(user => user._linkWith("facebook", {
      success: user => {
        expect(user.get('username')).toEqual('testLinkWithProvider');
        expect(Parse.FacebookUtils.isLinked(user)).toBeTruthy();
        return user._unlinkFrom('facebook')
        .then(() => user.fetch())
        .then(user => {
          expect(user.get('username')).toEqual('testLinkWithProvider');
          expect(Parse.FacebookUtils.isLinked(user)).toBeFalsy();
          done();
        });
      },
      error: error => {
        fail('Unexpected failure testing linking');
        fail(JSON.stringify(error));
        done();
      }
    }))
    .catch(error => {
      fail('Unexpected failure testing in unlink user test');
      jfail(error);
      done();
    });
  });

  it('should revoke sessions when converting anonymous user to "normal" user', done => {
    request.post({
      url: 'http://localhost:8378/1/classes/_User',
      headers: {
        'X-Parse-Application-Id': Parse.applicationId,
        'X-Parse-REST-API-Key': 'rest',
      },
      json: {authData: {anonymous: {id: '00000000-0000-0000-0000-000000000001'}}}
    }, (err, res, body) => {
      Parse.User.become(body.sessionToken)
      .then(user => {
        let obj = new Parse.Object('TestObject');
        obj.setACL(new Parse.ACL(user));
        return obj.save()
        .then(() => {
          // Change password, revoking session
          user.set('username', 'no longer anonymous');
          user.set('password', 'password');
          return user.save()
        })
        .then(() => {
          // Session token should have been recycled
          expect(body.sessionToken).not.toEqual(user.getSessionToken());
        })
        .then(() => obj.fetch())
        .then((res) => {
          done();
        })
        .catch(error => {
          fail('should not fail')
          done();
        });
      })
    });
  });

  it('should not revoke session tokens if the server is configures to not revoke session tokens', done => {
    reconfigureServer({ revokeSessionOnPasswordReset: false })
    .then(() => {
      request.post({
        url: 'http://localhost:8378/1/classes/_User',
        headers: {
          'X-Parse-Application-Id': Parse.applicationId,
          'X-Parse-REST-API-Key': 'rest',
        },
        json: {authData: {anonymous: {id: '00000000-0000-0000-0000-000000000001'}}}
      }, (err, res, body) => {
        Parse.User.become(body.sessionToken)
        .then(user => {
          let obj = new Parse.Object('TestObject');
          obj.setACL(new Parse.ACL(user));
          return obj.save()
          .then(() => {
            // Change password, revoking session
            user.set('username', 'no longer anonymous');
            user.set('password', 'password');
            return user.save()
          })
          .then(() => obj.fetch())
          // fetch should succeed as we still have our session token
          .then(done, fail);
        })
      });
    });
  });

  it('should not fail querying non existing relations', done => { 
    let user = new Parse.User();
    user.set({
      username: 'hello',
      password: 'world'
    })
    user.signUp().then(() => {
      return Parse.User.current().relation('relation').query().find();
    }).then((res) => {
      expect(res.length).toBe(0);
      done();
    }).catch((err) => {
      fail(JSON.stringify(err));
      done();
    });
  });
});
