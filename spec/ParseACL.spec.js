// This is a port of the test suite:
// hungry/js/test/parse_acl_test.js
var rest = require('../src/rest');
var Config = require('../src/Config');
var config = new Config('test');
var auth = require('../src/Auth');

describe('Parse.ACL', () => {
  it("acl must be valid", (done) => {
    var user = new Parse.User();
    ok(!user.setACL("Ceci n'est pas un ACL.", {
      error: function(user, error) {
        equal(error.code, -1);
        done();
      }
    }), "setACL should have returned false.");
  });

  it("refresh object with acl", (done) => {
    // Create an object owned by Alice.
    var user = new Parse.User();
    user.set("username", "alice");
    user.set("password", "wonderland");
    user.signUp(null, {
      success: function() {
        var object = new TestObject();
        var acl = new Parse.ACL(user);
        object.setACL(acl);
        object.save(null, {
          success: function() {
            // Refreshing the object should succeed.
            object.fetch({
              success: function() {
                done();
              }
            });
          }
        });
      }
    });
  });

  it("acl an object owned by one user and public get", (done) => {
    // Create an object owned by Alice.
    var user = new Parse.User();
    user.set("username", "alice");
    user.set("password", "wonderland");
    user.signUp(null, {
      success: function() {
        var object = new TestObject();
        var acl = new Parse.ACL(user);
        object.setACL(acl);
        object.save(null, {
          success: function() {
            equal(object.getACL().getReadAccess(user), true);
            equal(object.getACL().getWriteAccess(user), true);
            equal(object.getACL().getPublicReadAccess(), false);
            equal(object.getACL().getPublicWriteAccess(), false);
            ok(object.get("ACL"));
            // Start making requests by the public, which should all fail.
            Parse.User.logOut()
            .then(() => {
              // Get
              var query = new Parse.Query(TestObject);
              query.get(object.id, {
                success: function(model) {
                  fail('Should not have retrieved the object.');
                  done();
                },
                error: function(model, error) {
                  equal(error.code, Parse.Error.OBJECT_NOT_FOUND);
                  done();
                }
              });
            });
          }
        });
      }
    });
  });

  it("acl an object owned by one user and public find", (done) => {
    // Create an object owned by Alice.
    var user = new Parse.User();
    user.set("username", "alice");
    user.set("password", "wonderland");
    user.signUp(null, {
      success: function() {
        var object = new TestObject();
        var acl = new Parse.ACL(user);
        object.setACL(acl);
        object.save(null, {
          success: function() {
            equal(object.getACL().getReadAccess(user), true);
            equal(object.getACL().getWriteAccess(user), true);
            equal(object.getACL().getPublicReadAccess(), false);
            equal(object.getACL().getPublicWriteAccess(), false);
            ok(object.get("ACL"));

            // Start making requests by the public, which should all fail.
            Parse.User.logOut()
            .then(() => {
              // Find
              var query = new Parse.Query(TestObject);
              query.find({
                success: function(results) {
                  equal(results.length, 0);
                  done();
                }
              });
            });

          }
        });
      }
    });
  });

  it("acl an object owned by one user and public update", (done) => {
    // Create an object owned by Alice.
    var user = new Parse.User();
    user.set("username", "alice");
    user.set("password", "wonderland");
    user.signUp(null, {
      success: function() {
        var object = new TestObject();
        var acl = new Parse.ACL(user);
        object.setACL(acl);
        object.save(null, {
          success: function() {
            equal(object.getACL().getReadAccess(user), true);
            equal(object.getACL().getWriteAccess(user), true);
            equal(object.getACL().getPublicReadAccess(), false);
            equal(object.getACL().getPublicWriteAccess(), false);
            ok(object.get("ACL"));

            // Start making requests by the public, which should all fail.
            Parse.User.logOut()
            .then(() => {
              // Update
              object.set("foo", "bar");
              object.save(null, {
                success: function() {
                  fail('Should not have been able to update the object.');
                  done();
                }, error: function(model, err) {
                  equal(err.code, Parse.Error.OBJECT_NOT_FOUND);
                  done();
                }
              });
            });
          }
        });
      }
    });
  });

  it("acl an object owned by one user and public delete", (done) => {
    // Create an object owned by Alice.
    var user = new Parse.User();
    user.set("username", "alice");
    user.set("password", "wonderland");
    user.signUp(null, {
      success: function() {
        var object = new TestObject();
        var acl = new Parse.ACL(user);
        object.setACL(acl);
        object.save(null, {
          success: function() {
            equal(object.getACL().getReadAccess(user), true);
            equal(object.getACL().getWriteAccess(user), true);
            equal(object.getACL().getPublicReadAccess(), false);
            equal(object.getACL().getPublicWriteAccess(), false);
            ok(object.get("ACL"));

            // Start making requests by the public, which should all fail.
            Parse.User.logOut()
            .then(() => object.destroy())
            .then(() => {
              fail('destroy should fail');
              done();
            }, error => {
              expect(error.code).toEqual(Parse.Error.OBJECT_NOT_FOUND);
              done();
            });
          }
        });
      }
    });
  });

  it("acl an object owned by one user and logged in get", (done) => {
    // Create an object owned by Alice.
    var user = new Parse.User();
    user.set("username", "alice");
    user.set("password", "wonderland");
    user.signUp(null, {
      success: function() {
        var object = new TestObject();
        var acl = new Parse.ACL(user);
        object.setACL(acl);
        object.save(null, {
          success: function() {
            equal(object.getACL().getReadAccess(user), true);
            equal(object.getACL().getWriteAccess(user), true);
            equal(object.getACL().getPublicReadAccess(), false);
            equal(object.getACL().getPublicWriteAccess(), false);
            ok(object.get("ACL"));

            Parse.User.logOut()
            .then(() => {
              Parse.User.logIn("alice", "wonderland", {
                success: function() {
                  // Get
                  var query = new Parse.Query(TestObject);
                  query.get(object.id, {
                    success: function(result) {
                      ok(result);
                      equal(result.id, object.id);
                      equal(result.getACL().getReadAccess(user), true);
                      equal(result.getACL().getWriteAccess(user), true);
                      equal(result.getACL().getPublicReadAccess(), false);
                      equal(result.getACL().getPublicWriteAccess(), false);
                      ok(object.get("ACL"));
                      done();
                    }
                  });
                }
              });
            });
          }
        });
      }
    });
  });

  it("acl an object owned by one user and logged in find", (done) => {
    // Create an object owned by Alice.
    var user = new Parse.User();
    user.set("username", "alice");
    user.set("password", "wonderland");
    user.signUp(null, {
      success: function() {
        var object = new TestObject();
        var acl = new Parse.ACL(user);
        object.setACL(acl);
        object.save(null, {
          success: function() {
            equal(object.getACL().getReadAccess(user), true);
            equal(object.getACL().getWriteAccess(user), true);
            equal(object.getACL().getPublicReadAccess(), false);
            equal(object.getACL().getPublicWriteAccess(), false);
            ok(object.get("ACL"));

            Parse.User.logOut()
            .then(() => {
              Parse.User.logIn("alice", "wonderland", {
                success: function() {
                  // Find
                  var query = new Parse.Query(TestObject);
                  query.find({
                    success: function(results) {
                      equal(results.length, 1);
                      var result = results[0];
                      ok(result);
                      if (!result) {
                        return fail();
                      }
                      equal(result.id, object.id);
                      equal(result.getACL().getReadAccess(user), true);
                      equal(result.getACL().getWriteAccess(user), true);
                      equal(result.getACL().getPublicReadAccess(), false);
                      equal(result.getACL().getPublicWriteAccess(), false);
                      ok(object.get("ACL"));
                      done();
                    }
                  });
                }
              });
            });
          }
        });
      }
    });
  });

  it("acl an object owned by one user and logged in update", (done) => {
    // Create an object owned by Alice.
    var user = new Parse.User();
    user.set("username", "alice");
    user.set("password", "wonderland");
    user.signUp(null, {
      success: function() {
        var object = new TestObject();
        var acl = new Parse.ACL(user);
        object.setACL(acl);
        object.save(null, {
          success: function() {
            equal(object.getACL().getReadAccess(user), true);
            equal(object.getACL().getWriteAccess(user), true);
            equal(object.getACL().getPublicReadAccess(), false);
            equal(object.getACL().getPublicWriteAccess(), false);
            ok(object.get("ACL"));

            Parse.User.logOut()
            .then(() => {
              Parse.User.logIn("alice", "wonderland", {
                success: function() {
                  // Update
                  object.set("foo", "bar");
                  object.save(null, {
                    success: function() {
                      done();
                    }
                  });
                }
              });
            });
          }
        });
      }
    });
  });

  it("acl an object owned by one user and logged in delete", (done) => {
    // Create an object owned by Alice.
    var user = new Parse.User();
    user.set("username", "alice");
    user.set("password", "wonderland");
    user.signUp(null, {
      success: function() {
        var object = new TestObject();
        var acl = new Parse.ACL(user);
        object.setACL(acl);
        object.save(null, {
          success: function() {
            equal(object.getACL().getReadAccess(user), true);
            equal(object.getACL().getWriteAccess(user), true);
            equal(object.getACL().getPublicReadAccess(), false);
            equal(object.getACL().getPublicWriteAccess(), false);
            ok(object.get("ACL"));

            Parse.User.logOut()
            .then(() => {
              Parse.User.logIn("alice", "wonderland", {
                success: function() {
                  // Delete
                  object.destroy({
                    success: function() {
                      done();
                    }
                  });
                }
              });
            });
          }
        });
      }
    });
  });

  it("acl making an object publicly readable and public get", (done) => {
    // Create an object owned by Alice.
    var user = new Parse.User();
    user.set("username", "alice");
    user.set("password", "wonderland");
    user.signUp(null, {
      success: function() {
        var object = new TestObject();
        var acl = new Parse.ACL(user);
        object.setACL(acl);
        object.save(null, {
          success: function() {
            equal(object.getACL().getReadAccess(user), true);
            equal(object.getACL().getWriteAccess(user), true);
            equal(object.getACL().getPublicReadAccess(), false);
            equal(object.getACL().getPublicWriteAccess(), false);
            ok(object.get("ACL"));

            // Now make it public.
            object.getACL().setPublicReadAccess(true);
            object.save(null, {
              success: function() {
                equal(object.getACL().getReadAccess(user), true);
                equal(object.getACL().getWriteAccess(user), true);
                equal(object.getACL().getPublicReadAccess(), true);
                equal(object.getACL().getPublicWriteAccess(), false);
                ok(object.get("ACL"));

                Parse.User.logOut()
                .then(() => {
                  // Get
                  var query = new Parse.Query(TestObject);
                  query.get(object.id, {
                    success: function(result) {
                      ok(result);
                      equal(result.id, object.id);
                      done();
                    }
                  });
                });
              }
            });
          }
        });
      }
    });
  });

  it("acl making an object publicly readable and public find", (done) => {
    // Create an object owned by Alice.
    var user = new Parse.User();
    user.set("username", "alice");
    user.set("password", "wonderland");
    user.signUp(null, {
      success: function() {
        var object = new TestObject();
        var acl = new Parse.ACL(user);
        object.setACL(acl);
        object.save(null, {
          success: function() {
            equal(object.getACL().getReadAccess(user), true);
            equal(object.getACL().getWriteAccess(user), true);
            equal(object.getACL().getPublicReadAccess(), false);
            equal(object.getACL().getPublicWriteAccess(), false);
            ok(object.get("ACL"));

            // Now make it public.
            object.getACL().setPublicReadAccess(true);
            object.save(null, {
              success: function() {
                equal(object.getACL().getReadAccess(user), true);
                equal(object.getACL().getWriteAccess(user), true);
                equal(object.getACL().getPublicReadAccess(), true);
                equal(object.getACL().getPublicWriteAccess(), false);
                ok(object.get("ACL"));

                Parse.User.logOut()
                .then(() => {
                  // Find
                  var query = new Parse.Query(TestObject);
                  query.find({
                    success: function(results) {
                      equal(results.length, 1);
                      var result = results[0];
                      ok(result);
                      equal(result.id, object.id);
                      done();
                    }
                  });
                });
              }
            });
          }
        });
      }
    });
  });

  it("acl making an object publicly readable and public update", (done) => {
    // Create an object owned by Alice.
    var user = new Parse.User();
    user.set("username", "alice");
    user.set("password", "wonderland");
    user.signUp(null, {
      success: function() {
        var object = new TestObject();
        var acl = new Parse.ACL(user);
        object.setACL(acl);
        object.save(null, {
          success: function() {
            equal(object.getACL().getReadAccess(user), true);
            equal(object.getACL().getWriteAccess(user), true);
            equal(object.getACL().getPublicReadAccess(), false);
            equal(object.getACL().getPublicWriteAccess(), false);
            ok(object.get("ACL"));

            // Now make it public.
            object.getACL().setPublicReadAccess(true);
            object.save(null, {
              success: function() {
                equal(object.getACL().getReadAccess(user), true);
                equal(object.getACL().getWriteAccess(user), true);
                equal(object.getACL().getPublicReadAccess(), true);
                equal(object.getACL().getPublicWriteAccess(), false);
                ok(object.get("ACL"));

                Parse.User.logOut()
                .then(() => {
                  // Update
                  object.set("foo", "bar");
                  object.save().then(() => {
                    fail('the save should fail');
                  }, error => {
                    expect(error.code).toEqual(Parse.Error.OBJECT_NOT_FOUND);
                    done();
                  });
                });
              }
            });
          }
        });
      }
    });
  });

  it("acl making an object publicly readable and public delete", (done) => {
    // Create an object owned by Alice.
    var user = new Parse.User();
    user.set("username", "alice");
    user.set("password", "wonderland");
    user.signUp(null, {
      success: function() {
        var object = new TestObject();
        var acl = new Parse.ACL(user);
        object.setACL(acl);
        object.save(null, {
          success: function() {
            equal(object.getACL().getReadAccess(user), true);
            equal(object.getACL().getWriteAccess(user), true);
            equal(object.getACL().getPublicReadAccess(), false);
            equal(object.getACL().getPublicWriteAccess(), false);
            ok(object.get("ACL"));

            // Now make it public.
            object.getACL().setPublicReadAccess(true);
            object.save(null, {
              success: function() {
                equal(object.getACL().getReadAccess(user), true);
                equal(object.getACL().getWriteAccess(user), true);
                equal(object.getACL().getPublicReadAccess(), true);
                equal(object.getACL().getPublicWriteAccess(), false);
                ok(object.get("ACL"));

                Parse.User.logOut()
                .then(() => object.destroy())
                .then(() => {
                  fail('expected failure');
                }, error => {
                  expect(error.code).toEqual(Parse.Error.OBJECT_NOT_FOUND);
                  done();
                });
              }
            });
          }
        });
      }
    });
  });

  it("acl making an object publicly writable and public get", (done) => {
    // Create an object owned by Alice.
    var user = new Parse.User();
    user.set("username", "alice");
    user.set("password", "wonderland");
    user.signUp(null, {
      success: function() {
        var object = new TestObject();
        var acl = new Parse.ACL(user);
        object.setACL(acl);
        object.save(null, {
          success: function() {
            equal(object.getACL().getReadAccess(user), true);
            equal(object.getACL().getWriteAccess(user), true);
            equal(object.getACL().getPublicReadAccess(), false);
            equal(object.getACL().getPublicWriteAccess(), false);
            ok(object.get("ACL"));

            // Now make it public.
            object.getACL().setPublicWriteAccess(true);
            object.save(null, {
              success: function() {
                equal(object.getACL().getReadAccess(user), true);
                equal(object.getACL().getWriteAccess(user), true);
                equal(object.getACL().getPublicReadAccess(), false);
                equal(object.getACL().getPublicWriteAccess(), true);
                ok(object.get("ACL"));

                Parse.User.logOut()
                .then(() => {
                  // Get
                  var query = new Parse.Query(TestObject);
                  query.get(object.id, {
                    error: function(model, error) {
                      equal(error.code, Parse.Error.OBJECT_NOT_FOUND);
                      done();
                    }
                  });
                });
              }
            });
          }
        });
      }
    });
  });

  it("acl making an object publicly writable and public find", (done) => {
    // Create an object owned by Alice.
    var user = new Parse.User();
    user.set("username", "alice");
    user.set("password", "wonderland");
    user.signUp(null, {
      success: function() {
        var object = new TestObject();
        var acl = new Parse.ACL(user);
        object.setACL(acl);
        object.save(null, {
          success: function() {
            equal(object.getACL().getReadAccess(user), true);
            equal(object.getACL().getWriteAccess(user), true);
            equal(object.getACL().getPublicReadAccess(), false);
            equal(object.getACL().getPublicWriteAccess(), false);
            ok(object.get("ACL"));

            // Now make it public.
            object.getACL().setPublicWriteAccess(true);
            object.save(null, {
              success: function() {
                equal(object.getACL().getReadAccess(user), true);
                equal(object.getACL().getWriteAccess(user), true);
                equal(object.getACL().getPublicReadAccess(), false);
                equal(object.getACL().getPublicWriteAccess(), true);
                ok(object.get("ACL"));

                Parse.User.logOut()
                .then(() => {
                  // Find
                  var query = new Parse.Query(TestObject);
                  query.find({
                    success: function(results) {
                      equal(results.length, 0);
                      done();
                    }
                  });
                });
              }
            });
          }
        });
      }
    });
  });

  it("acl making an object publicly writable and public update", (done) => {
    // Create an object owned by Alice.
    var user = new Parse.User();
    user.set("username", "alice");
    user.set("password", "wonderland");
    user.signUp(null, {
      success: function() {
        var object = new TestObject();
        var acl = new Parse.ACL(user);
        object.setACL(acl);
        object.save(null, {
          success: function() {
            equal(object.getACL().getReadAccess(user), true);
            equal(object.getACL().getWriteAccess(user), true);
            equal(object.getACL().getPublicReadAccess(), false);
            equal(object.getACL().getPublicWriteAccess(), false);
            ok(object.get("ACL"));

            // Now make it public.
            object.getACL().setPublicWriteAccess(true);
            object.save(null, {
              success: function() {
                equal(object.getACL().getReadAccess(user), true);
                equal(object.getACL().getWriteAccess(user), true);
                equal(object.getACL().getPublicReadAccess(), false);
                equal(object.getACL().getPublicWriteAccess(), true);
                ok(object.get("ACL"));

                Parse.User.logOut()
                .then(() => {
                  // Update
                  object.set("foo", "bar");
                  object.save(null, {
                    success: function() {
                      done();
                    }
                  });
                });
              }
            });
          }
        });
      }
    });
  });

  it("acl making an object publicly writable and public delete", (done) => {
    // Create an object owned by Alice.
    var user = new Parse.User();
    user.set("username", "alice");
    user.set("password", "wonderland");
    user.signUp(null, {
      success: function() {
        var object = new TestObject();
        var acl = new Parse.ACL(user);
        object.setACL(acl);
        object.save(null, {
          success: function() {
            equal(object.getACL().getReadAccess(user), true);
            equal(object.getACL().getWriteAccess(user), true);
            equal(object.getACL().getPublicReadAccess(), false);
            equal(object.getACL().getPublicWriteAccess(), false);
            ok(object.get("ACL"));

            // Now make it public.
            object.getACL().setPublicWriteAccess(true);
            object.save(null, {
              success: function() {
                equal(object.getACL().getReadAccess(user), true);
                equal(object.getACL().getWriteAccess(user), true);
                equal(object.getACL().getPublicReadAccess(), false);
                equal(object.getACL().getPublicWriteAccess(), true);
                ok(object.get("ACL"));

                Parse.User.logOut()
                .then(() => {
                  // Delete
                  object.destroy({
                    success: function() {
                      done();
                    }
                  });
                });
              }
            });
          }
        });
      }
    });
  });

  it("acl sharing with another user and get", (done) => {
    // Sign in as Bob.
    Parse.User.signUp("bob", "pass", null, {
      success: function(bob) {
        Parse.User.logOut()
        .then(() => {
          // Sign in as Alice.
          Parse.User.signUp("alice", "wonderland", null, {
            success: function(alice) {
              // Create an object shared by Bob and Alice.
              var object = new TestObject();
              var acl = new Parse.ACL(alice);
              acl.setWriteAccess(bob, true);
              acl.setReadAccess(bob, true);
              object.setACL(acl);
              object.save(null, {
                success: function() {
                  equal(object.getACL().getReadAccess(alice), true);
                  equal(object.getACL().getWriteAccess(alice), true);
                  equal(object.getACL().getReadAccess(bob), true);
                  equal(object.getACL().getWriteAccess(bob), true);
                  equal(object.getACL().getPublicReadAccess(), false);
                  equal(object.getACL().getPublicWriteAccess(), false);

                  // Sign in as Bob again.
                  Parse.User.logIn("bob", "pass", {
                    success: function() {
                      var query = new Parse.Query(TestObject);
                      query.get(object.id, {
                        success: function(result) {
                          ok(result);
                          equal(result.id, object.id);
                          done();
                        }
                      });
                    }
                  });
                }
              });
            }
          });
        });
      }
    });
  });

  it("acl sharing with another user and find", (done) => {
    // Sign in as Bob.
    Parse.User.signUp("bob", "pass", null, {
      success: function(bob) {
        Parse.User.logOut()
        .then(() => {
          // Sign in as Alice.
          Parse.User.signUp("alice", "wonderland", null, {
            success: function(alice) {
              // Create an object shared by Bob and Alice.
              var object = new TestObject();
              var acl = new Parse.ACL(alice);
              acl.setWriteAccess(bob, true);
              acl.setReadAccess(bob, true);
              object.setACL(acl);
              object.save(null, {
                success: function() {
                  equal(object.getACL().getReadAccess(alice), true);
                  equal(object.getACL().getWriteAccess(alice), true);
                  equal(object.getACL().getReadAccess(bob), true);
                  equal(object.getACL().getWriteAccess(bob), true);
                  equal(object.getACL().getPublicReadAccess(), false);
                  equal(object.getACL().getPublicWriteAccess(), false);

                  // Sign in as Bob again.
                  Parse.User.logIn("bob", "pass", {
                    success: function() {
                      var query = new Parse.Query(TestObject);
                      query.find({
                        success: function(results) {
                          equal(results.length, 1);
                          var result = results[0];
                          ok(result);
                          if (!result) {
                            fail("should have result");
                          } else {
                            equal(result.id, object.id);
                          }
                          done();
                        }
                      });
                    }
                  });
                }
              });
            }
          });
        });
      }
    });
  });

  it("acl sharing with another user and update", (done) => {
    // Sign in as Bob.
    Parse.User.signUp("bob", "pass", null, {
      success: function(bob) {
        Parse.User.logOut()
        .then(() => {
          // Sign in as Alice.
          Parse.User.signUp("alice", "wonderland", null, {
            success: function(alice) {
              // Create an object shared by Bob and Alice.
              var object = new TestObject();
              var acl = new Parse.ACL(alice);
              acl.setWriteAccess(bob, true);
              acl.setReadAccess(bob, true);
              object.setACL(acl);
              object.save(null, {
                success: function() {
                  equal(object.getACL().getReadAccess(alice), true);
                  equal(object.getACL().getWriteAccess(alice), true);
                  equal(object.getACL().getReadAccess(bob), true);
                  equal(object.getACL().getWriteAccess(bob), true);
                  equal(object.getACL().getPublicReadAccess(), false);
                  equal(object.getACL().getPublicWriteAccess(), false);

                  // Sign in as Bob again.
                  Parse.User.logIn("bob", "pass", {
                    success: function() {
                      object.set("foo", "bar");
                      object.save(null, {
                        success: function() {
                          done();
                        }
                      });
                    }
                  });
                }
              });
            }
          });
        });
      }
    });
  });

  it("acl sharing with another user and delete", (done) => {
    // Sign in as Bob.
    Parse.User.signUp("bob", "pass", null, {
      success: function(bob) {
        Parse.User.logOut()
        .then(() => {
          // Sign in as Alice.
          Parse.User.signUp("alice", "wonderland", null, {
            success: function(alice) {
              // Create an object shared by Bob and Alice.
              var object = new TestObject();
              var acl = new Parse.ACL(alice);
              acl.setWriteAccess(bob, true);
              acl.setReadAccess(bob, true);
              object.setACL(acl);
              object.save(null, {
                success: function() {
                  equal(object.getACL().getReadAccess(alice), true);
                  equal(object.getACL().getWriteAccess(alice), true);
                  equal(object.getACL().getReadAccess(bob), true);
                  equal(object.getACL().getWriteAccess(bob), true);
                  equal(object.getACL().getPublicReadAccess(), false);
                  equal(object.getACL().getPublicWriteAccess(), false);

                  // Sign in as Bob again.
                  Parse.User.logIn("bob", "pass", {
                    success: function() {
                      object.set("foo", "bar");
                      object.destroy({
                        success: function() {
                          done();
                        }
                      });
                    }
                  });
                }
              });
            }
          });
        });
      }
    });
  });

  it("acl sharing with another user and public get", (done) => {
    // Sign in as Bob.
    Parse.User.signUp("bob", "pass", null, {
      success: function(bob) {
        Parse.User.logOut()
        .then(() => {
          // Sign in as Alice.
          Parse.User.signUp("alice", "wonderland", null, {
            success: function(alice) {
              // Create an object shared by Bob and Alice.
              var object = new TestObject();
              var acl = new Parse.ACL(alice);
              acl.setWriteAccess(bob, true);
              acl.setReadAccess(bob, true);
              object.setACL(acl);
              object.save(null, {
                success: function() {
                  equal(object.getACL().getReadAccess(alice), true);
                  equal(object.getACL().getWriteAccess(alice), true);
                  equal(object.getACL().getReadAccess(bob), true);
                  equal(object.getACL().getWriteAccess(bob), true);
                  equal(object.getACL().getPublicReadAccess(), false);
                  equal(object.getACL().getPublicWriteAccess(), false);

                  // Start making requests by the public.
                  Parse.User.logOut()
                  .then(() => {
                    var query = new Parse.Query(TestObject);
                    query.get(object.id).then((result) => {
                      fail(result);
                    }, (error) => {
                      expect(error.code).toEqual(Parse.Error.OBJECT_NOT_FOUND);
                      done();
                    });
                  });
                }
              });
            }
          });
        });
      }
    });
  });

  it("acl sharing with another user and public find", (done) => {
    // Sign in as Bob.
    Parse.User.signUp("bob", "pass", null, {
      success: function(bob) {
        Parse.User.logOut()
        .then(() => {
          // Sign in as Alice.
          Parse.User.signUp("alice", "wonderland", null, {
            success: function(alice) {
              // Create an object shared by Bob and Alice.
              var object = new TestObject();
              var acl = new Parse.ACL(alice);
              acl.setWriteAccess(bob, true);
              acl.setReadAccess(bob, true);
              object.setACL(acl);
              object.save(null, {
                success: function() {
                  equal(object.getACL().getReadAccess(alice), true);
                  equal(object.getACL().getWriteAccess(alice), true);
                  equal(object.getACL().getReadAccess(bob), true);
                  equal(object.getACL().getWriteAccess(bob), true);
                  equal(object.getACL().getPublicReadAccess(), false);
                  equal(object.getACL().getPublicWriteAccess(), false);

                  // Start making requests by the public.
                  Parse.User.logOut()
                  .then(() => {
                    var query = new Parse.Query(TestObject);
                    query.find({
                      success: function(results) {
                        equal(results.length, 0);
                        done();
                      }
                    });
                  });
                }
              });
            }
          });
        });
      }
    });
  });

  it("acl sharing with another user and public update", (done) => {
    // Sign in as Bob.
    Parse.User.signUp("bob", "pass", null, {
      success: function(bob) {
        Parse.User.logOut()
        .then(() => {
          // Sign in as Alice.
          Parse.User.signUp("alice", "wonderland", null, {
            success: function(alice) {
              // Create an object shared by Bob and Alice.
              var object = new TestObject();
              var acl = new Parse.ACL(alice);
              acl.setWriteAccess(bob, true);
              acl.setReadAccess(bob, true);
              object.setACL(acl);
              object.save(null, {
                success: function() {
                  equal(object.getACL().getReadAccess(alice), true);
                  equal(object.getACL().getWriteAccess(alice), true);
                  equal(object.getACL().getReadAccess(bob), true);
                  equal(object.getACL().getWriteAccess(bob), true);
                  equal(object.getACL().getPublicReadAccess(), false);
                  equal(object.getACL().getPublicWriteAccess(), false);

                  // Start making requests by the public.
                  Parse.User.logOut()
                  .then(() => {
                    object.set("foo", "bar");
                    object.save().then(() => {
                      fail('expected failure');
                    }, (error) => {
                      expect(error.code).toEqual(Parse.Error.OBJECT_NOT_FOUND);
                      done();
                    });
                  });
                }
              });
            }
          });
        });
      }
    });
  });

  it("acl sharing with another user and public delete", (done) => {
    // Sign in as Bob.
    Parse.User.signUp("bob", "pass", null, {
      success: function(bob) {
        Parse.User.logOut()
        .then(() => {
          // Sign in as Alice.
          Parse.User.signUp("alice", "wonderland", null, {
            success: function(alice) {
              // Create an object shared by Bob and Alice.
              var object = new TestObject();
              var acl = new Parse.ACL(alice);
              acl.setWriteAccess(bob, true);
              acl.setReadAccess(bob, true);
              object.setACL(acl);
              object.save(null, {
                success: function() {
                  equal(object.getACL().getReadAccess(alice), true);
                  equal(object.getACL().getWriteAccess(alice), true);
                  equal(object.getACL().getReadAccess(bob), true);
                  equal(object.getACL().getWriteAccess(bob), true);
                  equal(object.getACL().getPublicReadAccess(), false);
                  equal(object.getACL().getPublicWriteAccess(), false);

                  // Start making requests by the public.
                  Parse.User.logOut()
                  .then(() => object.destroy())
                  .then(() => {
                    fail('expected failure');
                  }, (error) => {
                    expect(error.code).toEqual(Parse.Error.OBJECT_NOT_FOUND);
                    done();
                  });
                }
              });
            }
          });
        });
      }
    });
  });

  it("acl saveAll with permissions", (done) => {
    Parse.User.signUp("alice", "wonderland", null, {
      success: function(alice) {
        var acl = new Parse.ACL(alice);

        var object1 = new TestObject();
        var object2 = new TestObject();
        object1.setACL(acl);
        object2.setACL(acl);
        Parse.Object.saveAll([object1, object2], {
          success: function() {
            equal(object1.getACL().getReadAccess(alice), true);
            equal(object1.getACL().getWriteAccess(alice), true);
            equal(object1.getACL().getPublicReadAccess(), false);
            equal(object1.getACL().getPublicWriteAccess(), false);
            equal(object2.getACL().getReadAccess(alice), true);
            equal(object2.getACL().getWriteAccess(alice), true);
            equal(object2.getACL().getPublicReadAccess(), false);
            equal(object2.getACL().getPublicWriteAccess(), false);

            // Save all the objects after updating them.
            object1.set("foo", "bar");
            object2.set("foo", "bar");
            Parse.Object.saveAll([object1, object2], {
              success: function() {
                var query = new Parse.Query(TestObject);
                query.equalTo("foo", "bar");
                query.find({
                  success: function(results) {
                    equal(results.length, 2);
                    done();
                  }
                });
              }
            });
          }
        });
      }
    });
  });

  it("empty acl works", (done) => {
    Parse.User.signUp("tdurden", "mayhem", {
      ACL: new Parse.ACL(),
      foo: "bar"
    }, {
      success: function(user) {
        Parse.User.logOut()
        .then(() => {
          Parse.User.logIn("tdurden", "mayhem", {
            success: function(user) {
              equal(user.get("foo"), "bar");
              done();
            },
            error: function(user, error) {
              ok(null, "Error " + error.id + ": " + error.message);
              done();
            }
          });
        });
      },
      error: function(user, error) {
        ok(null, "Error " + error.id + ": " + error.message);
        done();
      }
    });
  });

  it("query for included object with ACL works", (done) => {
    var obj1 = new Parse.Object("TestClass1");
    var obj2 = new Parse.Object("TestClass2");
    var acl = new Parse.ACL();
    acl.setPublicReadAccess(true);
    obj2.set("ACL", acl);
    obj1.set("other", obj2);
    obj1.save(null, expectSuccess({
      success: function() {
        obj2._clearServerData();
        var query = new Parse.Query("TestClass1");
        query.first(expectSuccess({
          success: function(obj1Again) {
            ok(!obj1Again.get("other").get("ACL"));

            query.include("other");
            query.first(expectSuccess({
              success: function(obj1AgainWithInclude) {
                ok(obj1AgainWithInclude.get("other").get("ACL"));
                done();
              }
            }));
          }
        }));
      }
    }));
  });

  it('restricted ACL does not have public access', (done) => {
    var obj = new Parse.Object("TestClassMasterACL");
    var acl = new Parse.ACL();
    obj.set('ACL', acl);
    obj.save().then(() => {
      var query = new Parse.Query("TestClassMasterACL");
      return query.find();
    }).then((results) => {
      ok(!results.length, 'Should not have returned object with secure ACL.');
      done();
    });
  });

  it('regression test #701', done => {
    var anonUser = {
      authData: {
        anonymous: {
          id: '00000000-0000-0000-0000-000000000001'
        }
      }
    };

    Parse.Cloud.afterSave(Parse.User, req => {
      if (!req.object.existed()) {
        var user = req.object;
        var acl = new Parse.ACL(user);
        user.setACL(acl);
        user.save(null, {useMasterKey: true}).then(user => {
          new Parse.Query('_User').get(user.objectId).then(user => {
            fail('should not have fetched user without public read enabled');
            done();
          }, error => {
            expect(error.code).toEqual(Parse.Error.OBJECT_NOT_FOUND);
            done();
          });
        });
      }
    });

    rest.create(config, auth.nobody(config), '_User', anonUser)
  })
});
