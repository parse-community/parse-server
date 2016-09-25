"use strict";
// This is a port of the test suite:
// hungry/js/test/parse_object_test.js
//
// Things we didn't port:
// Tests that aren't async, because they only test the client.
// Tests that use Relations, because we intentionally do not support
// relations.
// Tests that use 'testDestroy', because they have a complex
// dependency on the terrible qunit start/stop mechanism.
// Tests for unfetching, since that behaves differently in
// single-instance mode and we don't want these tests to run in
// single-instance mode.

describe('Parse.Object testing', () => {
  it("create", function(done) {
    create({ "test" : "test" }, function(model, response) {
      ok(model.id, "Should have an objectId set");
      equal(model.get("test"), "test", "Should have the right attribute");
      done();
    });
  });

  it("update", function(done) {
    create({ "test" : "test" }, function(model, response) {
      var t2 = new TestObject({ objectId: model.id });
      t2.set("test", "changed");
      t2.save(null, {
        success: function(model, response) {
          equal(model.get("test"), "changed", "Update should have succeeded");
          done();
        }
      });
    });
  });

  it("save without null", function(done) {
    var object = new TestObject();
    object.set("favoritePony", "Rainbow Dash");
    object.save({
      success: function(objectAgain) {
        equal(objectAgain, object);
        done();
      },
      error: function(objectAgain, error) {
        ok(null, "Error " + error.code + ": " + error.message);
        done();
      }
    });
  });

  it("save cycle", done => {
    var a = new Parse.Object("TestObject");
    var b = new Parse.Object("TestObject");
    a.set("b", b);
    a.save().then(function() {
      b.set("a", a);
      return b.save();

    }).then(function() {
      ok(a.id);
      ok(b.id);
      strictEqual(a.get("b"), b);
      strictEqual(b.get("a"), a);

    }).then(function() {
      done();
    }, function(error) {
      ok(false, error);
      done();
    });
  });

  it("get", function(done) {
    create({ "test" : "test" }, function(model, response) {
      var t2 = new TestObject({ objectId: model.id });
      t2.fetch({
        success: function(model2, response) {
          equal(model2.get("test"), "test", "Update should have succeeded");
          ok(model2.id);
          equal(model2.id, model.id, "Ids should match");
          done();
        }
      });
    });
  });

  it("delete", function(done) {
    var t = new TestObject();
    t.set("test", "test");
    t.save(null, {
      success: function() {
        t.destroy({
          success: function() {
            var t2 = new TestObject({ objectId: t.id });
            t2.fetch().then(fail, done);
          }
        });
      }
    });
  });

  it("find", function(done) {
    var t = new TestObject();
    t.set("foo", "bar");
    t.save(null, {
      success: function() {
        var query = new Parse.Query(TestObject);
        query.equalTo("foo", "bar");
        query.find({
          success: function(results) {
            equal(results.length, 1);
            done();
          }
        });
      }
    });
  });

  it("relational fields", function(done) {
    var item = new Item();
    item.set("property", "x");
    var container = new Container();
    container.set("item", item);

    Parse.Object.saveAll([item, container], {
      success: function() {
        var query = new Parse.Query(Container);
        query.find({
          success: function(results) {
            equal(results.length, 1);
            var containerAgain = results[0];
            var itemAgain = containerAgain.get("item");
            itemAgain.fetch({
              success: function() {
                equal(itemAgain.get("property"), "x");
                done();
              }
            });
          }
        });
      }
    });
  });

  it("save adds no data keys (other than createdAt and updatedAt)",
     function(done) {
       var object = new TestObject();
       object.save(null, {
         success: function() {
           var keys = Object.keys(object.attributes).sort();
           equal(keys.length, 2);
           done();
         }
       });
     });

  it("recursive save", function(done) {
    var item = new Item();
    item.set("property", "x");
    var container = new Container();
    container.set("item", item);

    container.save(null, {
      success: function() {
        var query = new Parse.Query(Container);
        query.find({
          success: function(results) {
            equal(results.length, 1);
            var containerAgain = results[0];
            var itemAgain = containerAgain.get("item");
            itemAgain.fetch({
              success: function() {
                equal(itemAgain.get("property"), "x");
                done();
              }
            });
          }
        });
      }
    });
  });

  it("fetch", function(done) {
    var item = new Item({ foo: "bar" });
    item.save(null, {
      success: function() {
        var itemAgain = new Item();
        itemAgain.id = item.id;
        itemAgain.fetch({
          success: function() {
            itemAgain.save({ foo: "baz" }, {
              success: function() {
                item.fetch({
                  success: function() {
                    equal(item.get("foo"), itemAgain.get("foo"));
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

  it("createdAt doesn't change", function(done) {
    var object = new TestObject({ foo: "bar" });
    object.save(null, {
      success: function() {
        var objectAgain = new TestObject();
        objectAgain.id = object.id;
        objectAgain.fetch({
          success: function() {
            equal(object.createdAt.getTime(), objectAgain.createdAt.getTime());
            done();
          }
        });
      }
    });
  });

  it("createdAt and updatedAt exposed", function(done) {
    var object = new TestObject({ foo: "bar" });
    object.save(null, {
      success: function() {
        notEqual(object.updatedAt, undefined);
        notEqual(object.createdAt, undefined);
        done();
      }
    });
  });

  it("updatedAt gets updated", function(done) {
    var object = new TestObject({ foo: "bar" });
    object.save(null, {
      success: function() {
        ok(object.updatedAt, "initial save should cause updatedAt to exist");
        var firstUpdatedAt = object.updatedAt;
        object.save({ foo: "baz" }, {
          success: function() {
            ok(object.updatedAt, "two saves should cause updatedAt to exist");
            notEqual(firstUpdatedAt, object.updatedAt);
            done();
          }
        });
      }
    });
  });

  it("createdAt is reasonable", function(done) {
    var startTime = new Date();
    var object = new TestObject({ foo: "bar" });
    object.save(null, {
      success: function() {
        var endTime = new Date();
        var startDiff = Math.abs(startTime.getTime() -
                                 object.createdAt.getTime());
        ok(startDiff < 5000);

        var endDiff = Math.abs(endTime.getTime() -
                               object.createdAt.getTime());
        ok(endDiff < 5000);

        done();
      }
    });
  });

  it_exclude_dbs(['postgres'])("can set null", function(done) {
    var errored = false;
    var obj = new Parse.Object("TestObject");
    obj.set("foo", null);
    obj.save(null, {
      success: function(obj) {
        on_db('mongo', () => {
          equal(obj.get("foo"), null);
        });
        on_db('postgres', () => {
          fail('should not succeed');
        });
        done();
      },
      error: function(obj, error) {
        fail('should not fail');
        done();
      }
    });
  });

  it("can set boolean", function(done) {
    var obj = new Parse.Object("TestObject");
    obj.set("yes", true);
    obj.set("no", false);
    obj.save(null, {
      success: function(obj) {
        equal(obj.get("yes"), true);
        equal(obj.get("no"), false);
        done();
      },
      error: function(obj, error) {
        ok(false, error.message);
        done();
      }
    });
  });

  it('cannot set invalid date', function(done) {
    var obj = new Parse.Object('TestObject');
    obj.set('when', new Date(Date.parse(null)));
    try {
      obj.save();
    } catch (e) {
      ok(true);
      done();
      return;
    }
    ok(false, 'Saving an invalid date should throw');
    done();
  });

  it("invalid class name", function(done) {
    var item = new Parse.Object("Foo^bar");
    item.save(null, {
      success: function(item) {
        ok(false, "The name should have been invalid.");
        done();
      },
      error: function(item, error) {
        // Because the class name is invalid, the router will not be able to route
        // it, so it will actually return a -1 error code.
        // equal(error.code, Parse.Error.INVALID_CLASS_NAME);
        done();
      }
    });
  });

  it("invalid key name", function(done) {
    var item = new Parse.Object("Item");
    ok(!item.set({"foo^bar": "baz"}),
       'Item should not be updated with invalid key.');
    item.save({ "foo^bar": "baz" }).then(fail, done);
  });

  it("invalid __type", function(done) {
    var item = new Parse.Object("Item");
    var types = ['Pointer', 'File', 'Date', 'GeoPoint', 'Bytes'];
    var Error = Parse.Error;
    var tests = types.map(type => {
      var test = new Parse.Object("Item");
      test.set('foo', {
        __type: type
      });
      return test;
    });
    var next = function(index) {
      if (index < tests.length) {
        tests[index].save().then(fail, error => {
          expect(error.code).toEqual(Parse.Error.INCORRECT_TYPE);
          next(index + 1);
        });
      } else {
        done();
      }
    }
    item.save({
      "foo": {
        __type: "IvalidName"
      }
    }).then(fail, err => next(0));
  });

  it("simple field deletion", function(done) {
    var simple = new Parse.Object("SimpleObject");
    simple.save({
      foo: "bar"
    }, {
      success: function(simple) {
        simple.unset("foo");
        ok(!simple.has("foo"), "foo should have been unset.");
        ok(simple.dirty("foo"), "foo should be dirty.");
        ok(simple.dirty(), "the whole object should be dirty.");
        simple.save(null, {
          success: function(simple) {
            ok(!simple.has("foo"), "foo should have been unset.");
            ok(!simple.dirty("foo"), "the whole object was just saved.");
            ok(!simple.dirty(), "the whole object was just saved.");

            var query = new Parse.Query("SimpleObject");
            query.get(simple.id, {
              success: function(simpleAgain) {
                ok(!simpleAgain.has("foo"), "foo should have been removed.");
                done();
              },
              error: function(simpleAgain, error) {
                ok(false, "Error " + error.code + ": " + error.message);
                done();
              }
            });
          },
          error: function(simple, error) {
            ok(false, "Error " + error.code + ": " + error.message);
            done();
          }
        });
      },
      error: function(simple, error) {
        ok(false, "Error " + error.code + ": " + error.message);
        done();
      }
    });
  });

  it("field deletion before first save", function(done) {
    var simple = new Parse.Object("SimpleObject");
    simple.set("foo", "bar");
    simple.unset("foo");

    ok(!simple.has("foo"), "foo should have been unset.");
    ok(simple.dirty("foo"), "foo should be dirty.");
    ok(simple.dirty(), "the whole object should be dirty.");
    simple.save(null, {
      success: function(simple) {
        ok(!simple.has("foo"), "foo should have been unset.");
        ok(!simple.dirty("foo"), "the whole object was just saved.");
        ok(!simple.dirty(), "the whole object was just saved.");

        var query = new Parse.Query("SimpleObject");
        query.get(simple.id, {
          success: function(simpleAgain) {
            ok(!simpleAgain.has("foo"), "foo should have been removed.");
            done();
          },
          error: function(simpleAgain, error) {
            ok(false, "Error " + error.code + ": " + error.message);
            done();
          }
        });
      },
      error: function(simple, error) {
        ok(false, "Error " + error.code + ": " + error.message);
        done();
      }
    });
  });

  it("relation deletion", function(done) {
    var simple = new Parse.Object("SimpleObject");
    var child = new Parse.Object("Child");
    simple.save({
      child: child
    }, {
      success: function(simple) {
        simple.unset("child");
        ok(!simple.has("child"), "child should have been unset.");
        ok(simple.dirty("child"), "child should be dirty.");
        ok(simple.dirty(), "the whole object should be dirty.");
        simple.save(null, {
          success: function(simple) {
            ok(!simple.has("child"), "child should have been unset.");
            ok(!simple.dirty("child"), "the whole object was just saved.");
            ok(!simple.dirty(), "the whole object was just saved.");

            var query = new Parse.Query("SimpleObject");
            query.get(simple.id, {
              success: function(simpleAgain) {
                ok(!simpleAgain.has("child"), "child should have been removed.");
                done();
              },
              error: function(simpleAgain, error) {
                ok(false, "Error " + error.code + ": " + error.message);
                done();
              }
            });
          },
          error: function(simple, error) {
            ok(false, "Error " + error.code + ": " + error.message);
            done();
          }
        });
      },
      error: function(simple, error) {
        ok(false, "Error " + error.code + ": " + error.message);
        done();
      }
    });
  });

  it("deleted keys get cleared", function(done) {
    var simpleObject = new Parse.Object("SimpleObject");
    simpleObject.set("foo", "bar");
    simpleObject.unset("foo");
    simpleObject.save(null, {
      success: function(simpleObject) {
        simpleObject.set("foo", "baz");
        simpleObject.save(null, {
          success: function(simpleObject) {
            var query = new Parse.Query("SimpleObject");
            query.get(simpleObject.id, {
              success: function(simpleObjectAgain) {
                equal(simpleObjectAgain.get("foo"), "baz");
                done();
              },
              error: function(simpleObject, error) {
                ok(false, "Error " + error.code + ": " + error.message);
                done();
              }
            });
          },
          error: function(simpleObject, error) {
            ok(false, "Error " + error.code + ": " + error.message);
            done();
          }
        });
      },
      error: function(simpleObject, error) {
        ok(false, "Error " + error.code + ": " + error.message);
        done();
      }
    });
  });

  it("setting after deleting", function(done) {
    var simpleObject = new Parse.Object("SimpleObject");
    simpleObject.set("foo", "bar");
    simpleObject.save(null, {
      success: function(simpleObject) {
        simpleObject.unset("foo");
        simpleObject.set("foo", "baz");
        simpleObject.save(null, {
          success: function(simpleObject) {
            var query = new Parse.Query("SimpleObject");
            query.get(simpleObject.id, {
              success: function(simpleObjectAgain) {
                equal(simpleObjectAgain.get("foo"), "baz");
                done();
              },
              error: function(simpleObject, error) {
                ok(false, "Error " + error.code + ": " + error.message);
                done();
              }
            });
          },
          error: function(simpleObject, error) {
            ok(false, "Error " + error.code + ": " + error.message);
            done();
          }
        });
      },
      error: function(simpleObject, error) {
        ok(false, "Error " + error.code + ": " + error.message);
        done();
      }
    });
  });

  it("increment", function(done) {
    var simple = new Parse.Object("SimpleObject");
    simple.save({
      foo: 5
    }, {
      success: function(simple) {
        simple.increment("foo");
        equal(simple.get("foo"), 6);
        ok(simple.dirty("foo"), "foo should be dirty.");
        ok(simple.dirty(), "the whole object should be dirty.");
        simple.save(null, {
          success: function(simple) {
            equal(simple.get("foo"), 6);
            ok(!simple.dirty("foo"), "the whole object was just saved.");
            ok(!simple.dirty(), "the whole object was just saved.");

            var query = new Parse.Query("SimpleObject");
            query.get(simple.id, {
              success: function(simpleAgain) {
                equal(simpleAgain.get("foo"), 6);
                done();
              }
            });
          }
        });
      }
    });
  });

  it("addUnique", function(done) {
    var x1 = new Parse.Object('X');
    x1.set('stuff', [1, 2]);
    x1.save().then(() => {
      var objectId = x1.id;
      var x2 = new Parse.Object('X', {objectId: objectId});
      x2.addUnique('stuff', 2);
      x2.addUnique('stuff', 4);
      expect(x2.get('stuff')).toEqual([2, 4]);
      return x2.save();
    }).then(() => {
      var query = new Parse.Query('X');
      return query.get(x1.id);
    }).then((x3) => {
      let stuff = x3.get('stuff');
      let expected = [1, 2, 4];
      expect(stuff.length).toBe(expected.length);
      for (var i of stuff) {
        expect(expected.indexOf(i) >= 0).toBe(true);
      }
      done();
    }, (error) => {
      on_db('mongo', () => {
        jfail(error);
      });
      on_db('postgres', () => {
        expect(error.message).toEqual("Postgres does not support AddUnique operator.");
      });
      done();
    });
  });

  it("addUnique with object", function(done) {
    var x1 = new Parse.Object('X');
    x1.set('stuff', [ 1, {'hello': 'world'},  {'foo': 'bar'}]);
    x1.save().then(() => {
      var objectId = x1.id;
      var x2 = new Parse.Object('X', {objectId: objectId});
      x2.addUnique('stuff', {'hello': 'world'});
      x2.addUnique('stuff', {'bar': 'baz'});
      expect(x2.get('stuff')).toEqual([{'hello': 'world'}, {'bar': 'baz'}]);
      return x2.save();
    }).then(() => {
      var query = new Parse.Query('X');
      return query.get(x1.id);
    }).then((x3) => {
      let stuff = x3.get('stuff');
      let target = [1, {'hello': 'world'},  {'foo': 'bar'}, {'bar': 'baz'}];
      expect(stuff.length).toEqual(target.length);
      let found = 0;
      for (let thing in target) {
        for (let st in stuff) {
          if (st == thing) {
            found++;
          }
        }
      }
      expect(found).toBe(target.length);
      done();
    }, (error) => {
      jfail(error);
      done();
    });
  });

  it("removes with object", function(done) {
    var x1 = new Parse.Object('X');
    x1.set('stuff', [ 1, {'hello': 'world'},  {'foo': 'bar'}]);
    x1.save().then(() => {
      var objectId = x1.id;
      var x2 = new Parse.Object('X', {objectId: objectId});
      x2.remove('stuff', {'hello': 'world'});
      expect(x2.get('stuff')).toEqual([]);
      return x2.save();
    }).then(() => {
      var query = new Parse.Query('X');
      return query.get(x1.id);
    }).then((x3) => {
      expect(x3.get('stuff')).toEqual([1, {'foo': 'bar'}]);
      done();
    }, (error) => {
      jfail(error);
      done();
    });
  });

  it("dirty attributes", function(done) {
    var object = new Parse.Object("TestObject");
    object.set("cat", "good");
    object.set("dog", "bad");
    object.save({
      success: function(object) {
        ok(!object.dirty());
        ok(!object.dirty("cat"));
        ok(!object.dirty("dog"));

        object.set("dog", "okay");

        ok(object.dirty());
        ok(!object.dirty("cat"));
        ok(object.dirty("dog"));

        done();
      },
      error: function(object, error) {
        ok(false, "This should have saved.");
        done();
      }
    });
  });

  it("dirty keys", function(done) {
    var object = new Parse.Object("TestObject");
    object.set("gogo", "good");
    object.set("sito", "sexy");
    ok(object.dirty());
    var dirtyKeys = object.dirtyKeys();
    equal(dirtyKeys.length, 2);
    ok(arrayContains(dirtyKeys, "gogo"));
    ok(arrayContains(dirtyKeys, "sito"));

    object.save().then(function(obj) {
      ok(!obj.dirty());
      dirtyKeys = obj.dirtyKeys();
      equal(dirtyKeys.length, 0);
      ok(!arrayContains(dirtyKeys, "gogo"));
      ok(!arrayContains(dirtyKeys, "sito"));

      // try removing keys
      obj.unset("sito");
      ok(obj.dirty());
      dirtyKeys = obj.dirtyKeys();
      equal(dirtyKeys.length, 1);
      ok(!arrayContains(dirtyKeys, "gogo"));
      ok(arrayContains(dirtyKeys, "sito"));

      return obj.save();
    }).then(function(obj) {
      ok(!obj.dirty());
      equal(obj.get("gogo"), "good");
      equal(obj.get("sito"), undefined);
      dirtyKeys = obj.dirtyKeys();
      equal(dirtyKeys.length, 0);
      ok(!arrayContains(dirtyKeys, "gogo"));
      ok(!arrayContains(dirtyKeys, "sito"));

      done();
    });
  });

  it("length attribute", function(done) {
    Parse.User.signUp("bob", "password", null, {
      success: function(user) {
        var TestObject = Parse.Object.extend("TestObject");
        var obj = new TestObject({
          length: 5,
          ACL: new Parse.ACL(user)  // ACLs cause things like validation to run
        });
        equal(obj.get("length"), 5);
        ok(obj.get("ACL") instanceof Parse.ACL);

        obj.save(null, {
          success: function(obj) {
            equal(obj.get("length"), 5);
            ok(obj.get("ACL") instanceof Parse.ACL);

            var query = new Parse.Query(TestObject);
            query.get(obj.id, {
              success: function(obj) {
                equal(obj.get("length"), 5);
                ok(obj.get("ACL") instanceof Parse.ACL);

                var query = new Parse.Query(TestObject);
                query.find({
                  success: function(results) {
                    obj = results[0];
                    equal(obj.get("length"), 5);
                    ok(obj.get("ACL") instanceof Parse.ACL);

                    done();
                  },
                  error: function(error) {
                    ok(false, error.code + ": " + error.message);
                    done();
                  }
                });
              },
              error: function(obj, error) {
                ok(false, error.code + ": " + error.message);
                done();
              }
            });
          },
          error: function(obj, error) {
            ok(false, error.code + ": " + error.message);
            done();
          }
        });
      },
      error: function(user, error) {
        ok(false, error.code + ": " + error.message);
        done();
      }
    });
  });

  it("old attribute unset then unset", function(done) {
    var TestObject = Parse.Object.extend("TestObject");
    var obj = new TestObject();
    obj.set("x", 3);
    obj.save({
      success: function() {
        obj.unset("x");
        obj.unset("x");
        obj.save({
          success: function() {
            equal(obj.has("x"), false);
            equal(obj.get("x"), undefined);
            var query = new Parse.Query(TestObject);
            query.get(obj.id, {
              success: function(objAgain) {
                equal(objAgain.has("x"), false);
                equal(objAgain.get("x"), undefined);
                done();
              }
            });
          }
        });
      }
    });
  });

  it("new attribute unset then unset", function(done) {
    var TestObject = Parse.Object.extend("TestObject");
    var obj = new TestObject();
    obj.set("x", 5);
    obj.unset("x");
    obj.unset("x");
    obj.save({
      success: function() {
        equal(obj.has("x"), false);
        equal(obj.get("x"), undefined);
        var query = new Parse.Query(TestObject);
        query.get(obj.id, {
          success: function(objAgain) {
            equal(objAgain.has("x"), false);
            equal(objAgain.get("x"), undefined);
            done();
          }
        });
      }
    });
  });

  it("unknown attribute unset then unset", function(done) {
    var TestObject = Parse.Object.extend("TestObject");
    var obj = new TestObject();
    obj.unset("x");
    obj.unset("x");
    obj.save({
      success: function() {
        equal(obj.has("x"), false);
        equal(obj.get("x"), undefined);
        var query = new Parse.Query(TestObject);
        query.get(obj.id, {
          success: function(objAgain) {
            equal(objAgain.has("x"), false);
            equal(objAgain.get("x"), undefined);
            done();
          }
        });
      }
    });
  });

  it("old attribute unset then clear", function(done) {
    var TestObject = Parse.Object.extend("TestObject");
    var obj = new TestObject();
    obj.set("x", 3);
    obj.save({
      success: function() {
        obj.unset("x");
        obj.clear();
        obj.save({
          success: function() {
            equal(obj.has("x"), false);
            equal(obj.get("x"), undefined);
            var query = new Parse.Query(TestObject);
            query.get(obj.id, {
              success: function(objAgain) {
                equal(objAgain.has("x"), false);
                equal(objAgain.get("x"), undefined);
                done();
              }
            });
          }
        });
      }
    });
  });

  it("new attribute unset then clear", function(done) {
    var TestObject = Parse.Object.extend("TestObject");
    var obj = new TestObject();
    obj.set("x", 5);
    obj.unset("x");
    obj.clear();
    obj.save({
      success: function() {
        equal(obj.has("x"), false);
        equal(obj.get("x"), undefined);
        var query = new Parse.Query(TestObject);
        query.get(obj.id, {
          success: function(objAgain) {
            equal(objAgain.has("x"), false);
            equal(objAgain.get("x"), undefined);
            done();
          }
        });
      }
    });
  });

  it("unknown attribute unset then clear", function(done) {
    var TestObject = Parse.Object.extend("TestObject");
    var obj = new TestObject();
    obj.unset("x");
    obj.clear();
    obj.save({
      success: function() {
        equal(obj.has("x"), false);
        equal(obj.get("x"), undefined);
        var query = new Parse.Query(TestObject);
        query.get(obj.id, {
          success: function(objAgain) {
            equal(objAgain.has("x"), false);
            equal(objAgain.get("x"), undefined);
            done();
          }
        });
      }
    });
  });

  it("old attribute clear then unset", function(done) {
    var TestObject = Parse.Object.extend("TestObject");
    var obj = new TestObject();
    obj.set("x", 3);
    obj.save({
      success: function() {
        obj.clear();
        obj.unset("x");
        obj.save({
          success: function() {
            equal(obj.has("x"), false);
            equal(obj.get("x"), undefined);
            var query = new Parse.Query(TestObject);
            query.get(obj.id, {
              success: function(objAgain) {
                equal(objAgain.has("x"), false);
                equal(objAgain.get("x"), undefined);
                done();
              }
            });
          }
        });
      }
    });
  });

  it("new attribute clear then unset", function(done) {
    var TestObject = Parse.Object.extend("TestObject");
    var obj = new TestObject();
    obj.set("x", 5);
    obj.clear();
    obj.unset("x");
    obj.save({
      success: function() {
        equal(obj.has("x"), false);
        equal(obj.get("x"), undefined);
        var query = new Parse.Query(TestObject);
        query.get(obj.id, {
          success: function(objAgain) {
            equal(objAgain.has("x"), false);
            equal(objAgain.get("x"), undefined);
            done();
          }
        });
      }
    });
  });

  it("unknown attribute clear then unset", function(done) {
    var TestObject = Parse.Object.extend("TestObject");
    var obj = new TestObject();
    obj.clear();
    obj.unset("x");
    obj.save({
      success: function() {
        equal(obj.has("x"), false);
        equal(obj.get("x"), undefined);
        var query = new Parse.Query(TestObject);
        query.get(obj.id, {
          success: function(objAgain) {
            equal(objAgain.has("x"), false);
            equal(objAgain.get("x"), undefined);
            done();
          }
        });
      }
    });
  });

  it("old attribute clear then clear", function(done) {
    var TestObject = Parse.Object.extend("TestObject");
    var obj = new TestObject();
    obj.set("x", 3);
    obj.save({
      success: function() {
        obj.clear();
        obj.clear();
        obj.save({
          success: function() {
            equal(obj.has("x"), false);
            equal(obj.get("x"), undefined);
            var query = new Parse.Query(TestObject);
            query.get(obj.id, {
              success: function(objAgain) {
                equal(objAgain.has("x"), false);
                equal(objAgain.get("x"), undefined);
                done();
              }
            });
          }
        });
      }
    });
  });

  it("new attribute clear then clear", function(done) {
    var TestObject = Parse.Object.extend("TestObject");
    var obj = new TestObject();
    obj.set("x", 5);
    obj.clear();
    obj.clear();
    obj.save({
      success: function() {
        equal(obj.has("x"), false);
        equal(obj.get("x"), undefined);
        var query = new Parse.Query(TestObject);
        query.get(obj.id, {
          success: function(objAgain) {
            equal(objAgain.has("x"), false);
            equal(objAgain.get("x"), undefined);
            done();
          }
        });
      }
    });
  });

  it("unknown attribute clear then clear", function(done) {
    var TestObject = Parse.Object.extend("TestObject");
    var obj = new TestObject();
    obj.clear();
    obj.clear();
    obj.save({
      success: function() {
        equal(obj.has("x"), false);
        equal(obj.get("x"), undefined);
        var query = new Parse.Query(TestObject);
        query.get(obj.id, {
          success: function(objAgain) {
            equal(objAgain.has("x"), false);
            equal(objAgain.get("x"), undefined);
            done();
          }
        });
      }
    });
  });

  it_exclude_dbs(['postgres'])("saving children in an array", function(done) {
    var Parent = Parse.Object.extend("Parent");
    var Child = Parse.Object.extend("Child");

    var child1 = new Child();
    var child2 = new Child();
    var parent = new Parent();

    child1.set('name', 'jamie');
    child2.set('name', 'cersei');
    parent.set('children', [child1, child2]);

    parent.save(null, {
      success: function(parent) {
        var query = new Parse.Query(Child);
        query.ascending('name');
        query.find({
          success: function(results) {
            equal(results.length, 2);
            equal(results[0].get('name'), 'cersei');
            equal(results[1].get('name'), 'jamie');
            done();
          }
        });
      },
      error: function(error) {
        fail(error);
        done();
      }
    });
  });

  it("two saves at the same time", function(done) {

    var object = new Parse.Object("TestObject");
    var firstSave = true;

    var success = function() {
      if (firstSave) {
        firstSave = false;
        return;
      }

      var query = new Parse.Query("TestObject");
      query.find({
        success: function(results) {
          equal(results.length, 1);
          equal(results[0].get("cat"), "meow");
          equal(results[0].get("dog"), "bark");
          done();
        }
      });
    };

    var options = { success: success, error: fail };

    object.save({ cat: "meow" }, options);
    object.save({ dog: "bark" }, options);
  });

  // The schema-checking parts of this are working.
  // We dropped the part where number can be reset to a correctly
  // typed field and saved okay, since that appears to be borked in
  // the client.
  // If this fails, it's probably a schema issue.
  it('many saves after a failure', function(done) {
    // Make a class with a number in the schema.
    var o1 = new Parse.Object('TestObject');
    o1.set('number', 1);
    var object = null;
    o1.save().then(() => {
      object = new Parse.Object('TestObject');
      object.set('number', 'two');
      return object.save();
    }).then(fail, (error) => {
      expect(error.code).toEqual(Parse.Error.INCORRECT_TYPE);

      object.set('other', 'foo');
      return object.save();
    }).then(fail, (error) => {
      expect(error.code).toEqual(Parse.Error.INCORRECT_TYPE);

      object.set('other', 'bar');
      return object.save();
    }).then(fail, (error) => {
      expect(error.code).toEqual(Parse.Error.INCORRECT_TYPE);

      done();
    });
  });

  it("is not dirty after save", function(done) {
    var obj = new Parse.Object("TestObject");
    obj.save(expectSuccess({
      success: function() {
        obj.set({ "content": "x" });
        obj.fetch(expectSuccess({
          success: function(){
            equal(false, obj.dirty("content"));
            done();
          }
        }));
      }
    }));
  });

  it("add with an object", function(done) {
    var child = new Parse.Object("Person");
    var parent = new Parse.Object("Person");

    Parse.Promise.as().then(function() {
      return child.save();

    }).then(function() {
      parent.add("children", child);
      return parent.save();

    }).then(function() {
      var query = new Parse.Query("Person");
      return query.get(parent.id);

    }).then(function(parentAgain) {
      equal(parentAgain.get("children")[0].id, child.id);

    }).then(function() {
      done();
    }, function(error) {
      ok(false, error);
      done();
    });
  });

  it("toJSON saved object", function(done) {
    var _ = Parse._;
    create({ "foo" : "bar" }, function(model, response) {
      var objJSON = model.toJSON();
      ok(objJSON.foo, "expected json to contain key 'foo'");
      ok(objJSON.objectId, "expected json to contain key 'objectId'");
      ok(objJSON.createdAt, "expected json to contain key 'createdAt'");
      ok(objJSON.updatedAt, "expected json to contain key 'updatedAt'");
      done();
    });
  });

  it("remove object from array", function(done) {
    var obj = new TestObject();
    obj.save(null, expectSuccess({
      success: function() {
        var container = new TestObject();
        container.add("array", obj);
        equal(container.get("array").length, 1);
        container.save(null, expectSuccess({
          success: function() {
            var objAgain = new TestObject();
            objAgain.id = obj.id;
            container.remove("array", objAgain);
            equal(container.get("array").length, 0);
            done();
          }
        }));
      }
    }));
  });

  it("async methods", function(done) {
    var obj = new TestObject();
    obj.set("time", "adventure");

    obj.save().then(function(obj) {
      ok(obj.id, "objectId should not be null.");
      var objAgain = new TestObject();
      objAgain.id = obj.id;
      return objAgain.fetch();

    }).then(function(objAgain) {
      equal(objAgain.get("time"), "adventure");
      return objAgain.destroy();

    }).then(function() {
      var query = new Parse.Query(TestObject);
      return query.find();

    }).then(function(results) {
      equal(results.length, 0);

    }).then(function() {
      done();

    });
  });

  it("fail validation with promise", function(done) {
    var PickyEater = Parse.Object.extend("PickyEater", {
      validate: function(attrs) {
        if (attrs.meal === "tomatoes") {
          return "Ew. Tomatoes are gross.";
        }
        return Parse.Object.prototype.validate.apply(this, arguments);
      }
    });

    var bryan = new PickyEater();
    bryan.save({
      meal: "burrito"
    }).then(function() {
      return bryan.save({
        meal: "tomatoes"
      });
    }, function(error) {
      ok(false, "Save should have succeeded.");
    }).then(function() {
      ok(false, "Save should have failed.");
    }, function(error) {
      equal(error, "Ew. Tomatoes are gross.");
      done();
    });
  });

  it("beforeSave doesn't make object dirty with new field", function(done) {
    var restController = Parse.CoreManager.getRESTController();
    var r = restController.request;
    restController.request = function() {
      return r.apply(this, arguments).then(function(result) {
        result.aDate = {"__type":"Date", "iso":"2014-06-24T06:06:06.452Z"};
        return result;
      });
    };

    var obj = new Parse.Object("Thing");
    obj.save().then(function() {
      ok(!obj.dirty(), "The object should not be dirty");
      ok(obj.get('aDate'));

    }).always(function() {
      restController.request = r;
      done();
    });
  });

  it("beforeSave doesn't make object dirty with existing field", function(done) {
    var restController = Parse.CoreManager.getRESTController();
    var r = restController.request;
    restController.request = function() {
      return r.apply(this, arguments).then(function(result) {
        result.aDate = {"__type":"Date", "iso":"2014-06-24T06:06:06.452Z"};
        return result;
      });
    };

    var now = new Date();

    var obj = new Parse.Object("Thing");
    var promise = obj.save();
    obj.set('aDate', now);

    promise.then(function() {
      ok(obj.dirty(), "The object should be dirty");
      equal(now, obj.get('aDate'));

    }).always(function() {
      restController.request = r;
      done();
    });
  });

  it_exclude_dbs(['postgres'])("bytes work", function(done) {
    Parse.Promise.as().then(function() {
      var obj = new TestObject();
      obj.set("bytes", { __type: "Bytes", base64: "ZnJveW8=" });
      return obj.save();

    }).then(function(obj) {
      var query = new Parse.Query(TestObject);
      return query.get(obj.id);

    }).then(function(obj) {
      equal(obj.get("bytes").__type, "Bytes");
      equal(obj.get("bytes").base64, "ZnJveW8=");
      done();

    }, function(error) {
      ok(false, JSON.stringify(error));
      done();

    });
  });

  it("destroyAll no objects", function(done) {
    Parse.Object.destroyAll([], function(success, error) {
      ok(success && !error, "Should be able to destroy no objects");
      done();
    });
  });

  it("destroyAll new objects only", function(done) {

    var objects = [new TestObject(), new TestObject()];
    Parse.Object.destroyAll(objects, function(success, error) {
      ok(success && !error, "Should be able to destroy only new objects");
      done();
    });
  });

  it("fetchAll", function(done) {
    var numItems = 11;
    var container = new Container();
    var items = [];
    for (var i = 0; i < numItems; i++) {
      var item = new Item();
      item.set("x", i);
      items.push(item);
    }
    Parse.Object.saveAll(items).then(function() {
      container.set("items", items);
      return container.save();
    }).then(function() {
      var query = new Parse.Query(Container);
      return query.get(container.id);
    }).then(function(containerAgain) {
      var itemsAgain = containerAgain.get("items");
      if (!itemsAgain || !itemsAgain.forEach) {
        fail('no itemsAgain retrieved', itemsAgain);
        done();
        return;
      }
      equal(itemsAgain.length, numItems, "Should get the array back");
      itemsAgain.forEach(function(item, i) {
        var newValue = i*2;
        item.set("x", newValue);
      });
      return Parse.Object.saveAll(itemsAgain);
    }).then(function() {
      return Parse.Object.fetchAll(items);
    }).then(function(fetchedItemsAgain) {
      equal(fetchedItemsAgain.length, numItems,
            "Number of items fetched should not change");
      fetchedItemsAgain.forEach(function(item, i) {
        equal(item.get("x"), i*2);
      });
      done();
    });
  });

  it("fetchAll no objects", function(done) {
    Parse.Object.fetchAll([], function(success, error) {
      ok(success && !error, "Should be able to fetchAll no objects");
      done();
    });
  });

  it("fetchAll updates dates", function(done) {
    var updatedObject;
    var object = new TestObject();
    object.set("x", 7);
    object.save().then(function() {
      var query = new Parse.Query(TestObject);
      return query.find(object.id);
    }).then(function(results) {
      updatedObject = results[0];
      updatedObject.set("x", 11);
      return updatedObject.save();
    }).then(function() {
      return Parse.Object.fetchAll([object]);
    }).then(function() {
      equal(object.createdAt.getTime(), updatedObject.createdAt.getTime());
      equal(object.updatedAt.getTime(), updatedObject.updatedAt.getTime());
      done();
    });
  });

  it("fetchAll backbone-style callbacks", function(done) {
    var numItems = 11;
    var container = new Container();
    var items = [];
    for (var i = 0; i < numItems; i++) {
      var item = new Item();
      item.set("x", i);
      items.push(item);
    }
    Parse.Object.saveAll(items).then(function() {
      container.set("items", items);
      return container.save();
    }).then(function() {
      var query = new Parse.Query(Container);
      return query.get(container.id);
    }).then(function(containerAgain) {
      var itemsAgain = containerAgain.get("items");
      if (!itemsAgain || !itemsAgain.forEach) {
        fail('no itemsAgain retrieved', itemsAgain);
        done();
        return;
      }
      equal(itemsAgain.length, numItems, "Should get the array back");
      itemsAgain.forEach(function(item, i) {
        var newValue = i*2;
        item.set("x", newValue);
      });
      return Parse.Object.saveAll(itemsAgain);
    }).then(function() {
      return Parse.Object.fetchAll(items, {
        success: function(fetchedItemsAgain) {
          equal(fetchedItemsAgain.length, numItems,
                "Number of items fetched should not change");
          fetchedItemsAgain.forEach(function(item, i) {
            equal(item.get("x"), i*2);
          });
          done();
        },
        error: function(error) {
          ok(false, "Failed to fetchAll");
          done();
        }
      });
    });
  });

  it("fetchAll error on multiple classes", function(done) {
    var container = new Container();
    container.set("item", new Item());
    container.set("subcontainer", new Container());
    return container.save().then(function() {
      var query = new Parse.Query(Container);
      return query.get(container.id);
    }).then(function(containerAgain) {
      var subContainerAgain = containerAgain.get("subcontainer");
      var itemAgain = containerAgain.get("item");
      var multiClassArray = [subContainerAgain, itemAgain];
      return Parse.Object.fetchAll(
        multiClassArray,
        expectError(Parse.Error.INVALID_CLASS_NAME, done));
    });
  });

  it("fetchAll error on unsaved object", function(done) {
    var unsavedObjectArray = [new TestObject()];
    Parse.Object.fetchAll(unsavedObjectArray,
                          expectError(Parse.Error.MISSING_OBJECT_ID, done));
  });

  it("fetchAll error on deleted object", function(done) {
    var numItems = 11;
    var container = new Container();
    var subContainer = new Container();
    var items = [];
    for (var i = 0; i < numItems; i++) {
      var item = new Item();
      item.set("x", i);
      items.push(item);
    }
    Parse.Object.saveAll(items).then(function() {
      var query = new Parse.Query(Item);
      return query.get(items[0].id);
    }).then(function(objectToDelete) {
      return objectToDelete.destroy();
    }).then(function(deletedObject) {
      var nonExistentObject = new Item({ objectId: deletedObject.id });
      var nonExistentObjectArray = [nonExistentObject, items[1]];
      return Parse.Object.fetchAll(
        nonExistentObjectArray,
        expectError(Parse.Error.OBJECT_NOT_FOUND, done));
    });
  });

  // TODO: Verify that with Sessions, this test is wrong... A fetch on
  //       user should not bring down a session token.
  xit("fetchAll User attributes get merged", function(done) {
    var sameUser;
    var user = new Parse.User();
    user.set("username", "asdf");
    user.set("password", "zxcv");
    user.set("foo", "bar");
    user.signUp().then(function() {
      Parse.User.logOut();
      var query = new Parse.Query(Parse.User);
      return query.get(user.id);
    }).then(function(userAgain) {
      user = userAgain;
      sameUser = new Parse.User();
      sameUser.set("username", "asdf");
      sameUser.set("password", "zxcv");
      return sameUser.logIn();
    }).then(function() {
      ok(!user.getSessionToken(), "user should not have a sessionToken");
      ok(sameUser.getSessionToken(), "sameUser should have a sessionToken");
      sameUser.set("baz", "qux");
      return sameUser.save();
    }).then(function() {
      return Parse.Object.fetchAll([user]);
    }).then(function() {
      equal(user.getSessionToken(), sameUser.getSessionToken());
      equal(user.createdAt.getTime(), sameUser.createdAt.getTime());
      equal(user.updatedAt.getTime(), sameUser.updatedAt.getTime());
      Parse.User.logOut();
      done();
    });
  });

  it("fetchAllIfNeeded", function(done) {
    var numItems = 11;
    var container = new Container();
    var items = [];
    for (var i = 0; i < numItems; i++) {
      var item = new Item();
      item.set("x", i);
      items.push(item);
    }
    Parse.Object.saveAll(items).then(function() {
      container.set("items", items);
      return container.save();
    }).then(function() {
      var query = new Parse.Query(Container);
      return query.get(container.id);
    }).then(function(containerAgain) {
      var itemsAgain = containerAgain.get("items");
      if (!itemsAgain || !itemsAgain.forEach) {
        fail('no itemsAgain retrieved', itemsAgain);
        done();
        return;
      }
      itemsAgain.forEach(function(item, i) {
        item.set("x", i*2);
      });
      return Parse.Object.saveAll(itemsAgain);
    }).then(function() {
      return Parse.Object.fetchAllIfNeeded(items);
    }).then(function(fetchedItems) {
      equal(fetchedItems.length, numItems,
            "Number of items should not change");
      fetchedItems.forEach(function(item, i) {
        equal(item.get("x"), i);
      });
      done();
    });
  });

  it("fetchAllIfNeeded backbone-style callbacks", function(done) {
    var numItems = 11;
    var container = new Container();
    var items = [];
    for (var i = 0; i < numItems; i++) {
      var item = new Item();
      item.set("x", i);
      items.push(item);
    }
    Parse.Object.saveAll(items).then(function() {
      container.set("items", items);
      return container.save();
    }).then(function() {
      var query = new Parse.Query(Container);
      return query.get(container.id);
    }).then(function(containerAgain) {
      var itemsAgain = containerAgain.get("items");
      if (!itemsAgain || !itemsAgain.forEach) {
        fail('no itemsAgain retrieved', itemsAgain);
        done();
        return;
      }
      itemsAgain.forEach(function(item, i) {
        item.set("x", i*2);
      });
      return Parse.Object.saveAll(itemsAgain);
    }).then(function() {
      var items = container.get("items");
      return Parse.Object.fetchAllIfNeeded(items, {
        success: function(fetchedItems) {
          equal(fetchedItems.length, numItems,
                "Number of items should not change");
          fetchedItems.forEach(function(item, j) {
            equal(item.get("x"), j);
          });
          done();
        },

        error: function(error) {
          ok(false, "Failed to fetchAll");
          done();
        }
      });
    });
  });

  it("fetchAllIfNeeded no objects", function(done) {
    Parse.Object.fetchAllIfNeeded([], function(success, error) {
      ok(success && !error, "Should be able to fetchAll no objects");
      done();
    });
  });

  it("fetchAllIfNeeded unsaved object", function(done) {
    var unsavedObjectArray = [new TestObject()];
    Parse.Object.fetchAllIfNeeded(
      unsavedObjectArray,
      expectError(Parse.Error.MISSING_OBJECT_ID, done));
  });

  it("fetchAllIfNeeded error on multiple classes", function(done) {
    var container = new Container();
    container.set("item", new Item());
    container.set("subcontainer", new Container());
    return container.save().then(function() {
      var query = new Parse.Query(Container);
      return query.get(container.id);
    }).then(function(containerAgain) {
      var subContainerAgain = containerAgain.get("subcontainer");
      var itemAgain = containerAgain.get("item");
      var multiClassArray = [subContainerAgain, itemAgain];
      return Parse.Object.fetchAllIfNeeded(
        multiClassArray,
        expectError(Parse.Error.INVALID_CLASS_NAME, done));
    });
  });

  it("Objects with className User", function(done) {
    equal(Parse.CoreManager.get('PERFORM_USER_REWRITE'), true);
    var User1 = Parse.Object.extend({
      className: "User"
    });

    equal(User1.className, "_User",
          "className is rewritten by default");

    Parse.User.allowCustomUserClass(true);
    equal(Parse.CoreManager.get('PERFORM_USER_REWRITE'), false);
    var User2 = Parse.Object.extend({
      className: "User"
    });

    equal(User2.className, "User",
          "className is not rewritten when allowCustomUserClass(true)");

    // Set back to default so as not to break other tests.
    Parse.User.allowCustomUserClass(false);
    equal(Parse.CoreManager.get('PERFORM_USER_REWRITE'), true, "PERFORM_USER_REWRITE is reset");

    var user = new User2();
    user.set("name", "Me");
    user.save({height: 181}, expectSuccess({
      success: function(user) {
        equal(user.get("name"), "Me");
        equal(user.get("height"), 181);

        var query = new Parse.Query(User2);
        query.get(user.id, expectSuccess({
          success: function(user) {
            equal(user.className, "User");
            equal(user.get("name"), "Me");
            equal(user.get("height"), 181);

            done();
          }
        }));
      }
    }));
  });

  it("create without data", function(done) {
    var t1 = new TestObject({ "test" : "test" });
    t1.save().then(function(t1) {
      var t2 = TestObject.createWithoutData(t1.id);
      return t2.fetch();
    }).then(function(t2) {
      equal(t2.get("test"), "test", "Fetch should have grabbed " +
                   "'test' property.");
      var t3 = TestObject.createWithoutData(t2.id);
      t3.set("test", "not test");
      return t3.fetch();
    }).then(function(t3) {
      equal(t3.get("test"), "test",
            "Fetch should have grabbed server 'test' property.");
      done();
    }, function(error) {
      ok(false, error);
      done();
    });
  });

  it("remove from new field creates array key", (done) => {
    var obj = new TestObject();
    obj.remove('shouldBeArray', 'foo');
    obj.save().then(() => {
      var query = new Parse.Query('TestObject');
      return query.get(obj.id);
    }).then((objAgain) => {
      var arr = objAgain.get('shouldBeArray');
      ok(Array.isArray(arr), 'Should have created array key');
      ok(!arr || arr.length === 0, 'Should have an empty array.');
      done();
    });
  });

  it("increment with type conflict fails", (done) => {
    var obj = new TestObject();
    obj.set('astring', 'foo');
    obj.save().then(() => {
      var obj2 = new TestObject();
      obj2.increment('astring');
      return obj2.save();
    }).then((obj2) => {
      fail('Should not have saved.');
      done();
    }, (error) => {
      expect(error.code).toEqual(111);
      done();
    });
  });

  it("increment with empty field solidifies type", (done) => {
    var obj = new TestObject();
    obj.increment('aninc');
    obj.save().then(() => {
      var obj2 = new TestObject();
      obj2.set('aninc', 'foo');
      return obj2.save();
    }).then(() => {
      fail('Should not have saved.');
      done();
    }, (error) => {
      expect(error.code).toEqual(111);
      done();
    });
  });

  it("increment update with type conflict fails", (done) => {
    var obj = new TestObject();
    obj.set('someString', 'foo');
    obj.save().then((objAgain) => {
      var obj2 = new TestObject();
      obj2.id = objAgain.id;
      obj2.increment('someString');
      return obj2.save();
    }).then(() => {
      fail('Should not have saved.');
      done();
    }, (error) => {
      expect(error.code).toEqual(111);
      done();
    });
  });

  it('dictionary fetched pointers do not lose data on fetch', (done) => {
    var parent = new Parse.Object('Parent');
    var dict = {};
    for (var i = 0; i < 5; i++) {
      var proc = (iter) => {
        var child = new Parse.Object('Child');
        child.set('name', 'testname' + i);
        dict[iter] = child;
      };
      proc(i);
    }
    parent.set('childDict', dict);
    parent.save().then(() => {
      return parent.fetch();
    }).then((parentAgain) => {
      var dictAgain = parentAgain.get('childDict');
      if (!dictAgain) {
        fail('Should have been a dictionary.');
        return done();
      }
      expect(typeof dictAgain).toEqual('object');
      expect(typeof dictAgain['0']).toEqual('object');
      expect(typeof dictAgain['1']).toEqual('object');
      expect(typeof dictAgain['2']).toEqual('object');
      expect(typeof dictAgain['3']).toEqual('object');
      expect(typeof dictAgain['4']).toEqual('object');
      done();
    });
  });


  it("should create nested keys with _", done => {
    const object = new Parse.Object("AnObject");
    object.set("foo", {
      "_bar": "_",
      "baz_bar": 1,
      "__foo_bar": true,
      "_0": "underscore_zero",
      "_more": {
        "_nested": "key"
      }
    });
    object.save().then( res => {
      ok(res);
      return res.fetch();
    }).then( res => {
      const foo = res.get("foo");
      expect(foo["_bar"]).toEqual("_");
      expect(foo["baz_bar"]).toEqual(1);
      expect(foo["__foo_bar"]).toBe(true);
      expect(foo["_0"]).toEqual("underscore_zero");
      expect(foo["_more"]["_nested"]).toEqual("key");
      done();
    }).fail( err => {
      jfail(err);
      fail("should not fail");
      done();
    });
  });

  it('should have undefined includes when object is missing', (done) => {
    let obj1 = new Parse.Object("AnObject");
    let obj2 =  new Parse.Object("AnObject");

    Parse.Object.saveAll([obj1, obj2]).then(() => {
      obj1.set("obj", obj2);
      // Save the pointer, delete the pointee
      return obj1.save().then(() => { return obj2.destroy() });
    }).then(() => {
      let query = new Parse.Query("AnObject");
      query.include("obj");
      return query.find();
    }).then((res) => {
      expect(res.length).toBe(1);
      if (res[0]) {
        expect(res[0].get("obj")).toBe(undefined);
      }
      let query = new Parse.Query("AnObject");
      return query.find();
    }).then((res) => {
      expect(res.length).toBe(1);
      if (res[0]) {
        expect(res[0].get("obj")).not.toBe(undefined);
        return res[0].get("obj").fetch();
      } else {
        done();
      }
    }).then(() => {
      fail("Should not fetch a deleted object");
    }, (err) => {
      expect(err.code).toBe(Parse.Error.OBJECT_NOT_FOUND);
      done();
    })
  });

  it('should have undefined includes when object is missing on deeper path', (done) => {
    let obj1 = new Parse.Object("AnObject");
    let obj2 =  new Parse.Object("AnObject");
    let obj3 = new Parse.Object("AnObject");
    Parse.Object.saveAll([obj1, obj2, obj3]).then(() => {
      obj1.set("obj", obj2);
      obj2.set("obj", obj3);
      // Save the pointer, delete the pointee
      return Parse.Object.saveAll([obj1, obj2]).then(() => { return obj3.destroy() });
    }).then(() => {
      let query = new Parse.Query("AnObject");
      query.include("obj.obj");
      return query.get(obj1.id);
    }).then((res) => {
      expect(res.get("obj")).not.toBe(undefined);
      expect(res.get("obj").get("obj")).toBe(undefined);
      done();
    }).catch(err => {
      jfail(err);
      done();
    })
  });

  it('should handle includes on null arrays #2752', (done) => {
    let obj1 = new Parse.Object("AnObject");
    let obj2 = new Parse.Object("AnotherObject");
    let obj3 = new Parse.Object("NestedObject");
    obj3.set({
      "foo": "bar"
    })
    obj2.set({
      "key": obj3
    })

    Parse.Object.saveAll([obj1, obj2]).then(() => {
      obj1.set("objects", [null, null, obj2]);
      return obj1.save();
    }).then(() => {
      let query = new Parse.Query("AnObject");
      query.include("objects.key");
      return query.find();
    }).then((res) => {
      let obj = res[0];
      expect(obj.get("objects")).not.toBe(undefined);
      let array = obj.get("objects");
      expect(Array.isArray(array)).toBe(true);
      expect(array[0]).toBe(null);
      expect(array[1]).toBe(null);
      expect(array[2].get("key").get("foo")).toEqual("bar");
      done();
    }).catch(err => {
      jfail(err);
      done();
    })
  });
});
