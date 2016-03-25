// This is a port of the test suite:
// hungry/js/test/parse_query_test.js
//
// Some new tests are added.
'use strict';

const Parse = require('parse/node');

describe('Parse.Query testing', () => {
  it("basic query", function(done) {
    var baz = new TestObject({ foo: 'baz' });
    var qux = new TestObject({ foo: 'qux' });
    Parse.Object.saveAll([baz, qux], function() {
      var query = new Parse.Query(TestObject);
      query.equalTo('foo', 'baz');
      query.find({
        success: function(results) {
          equal(results.length, 1);
          equal(results[0].get('foo'), 'baz');
          done();
        }
      });
    });
  });

  it("query with limit", function(done) {
    var baz = new TestObject({ foo: 'baz' });
    var qux = new TestObject({ foo: 'qux' });
    Parse.Object.saveAll([baz, qux], function() {
      var query = new Parse.Query(TestObject);
      query.limit(1);
      query.find({
        success: function(results) {
          equal(results.length, 1);
          done();
        }
      });
    });
  });

  it("containedIn object array queries", function(done) {
    var messageList = [];
    for (var i = 0; i < 4; ++i) {
      var message = new TestObject({});
      if (i > 0) {
        message.set('prior', messageList[i - 1]);
      }
      messageList.push(message);
    }

    Parse.Object.saveAll(messageList, function() {
      equal(messageList.length, 4);

      var inList = [];
      inList.push(messageList[0]);
      inList.push(messageList[2]);

      var query = new Parse.Query(TestObject);
      query.containedIn('prior', inList);
      query.find({
        success: function(results) {
          equal(results.length, 2);
          done();
        },
        error: function(e) {
          fail(e);
          done();
        }
      });
    }, (e) => {
      fail(e);
      done();
    });
  });

  it("containsAll number array queries", function(done) {
    var NumberSet = Parse.Object.extend({ className: "NumberSet" });

    var objectsList = [];
    objectsList.push(new NumberSet({ "numbers" : [1, 2, 3, 4, 5] }));
    objectsList.push(new NumberSet({ "numbers" : [1, 3, 4, 5] }));

    Parse.Object.saveAll(objectsList, function() {
      var query = new Parse.Query(NumberSet);
      query.containsAll("numbers", [1, 2, 3]);
      query.find({
        success: function(results) {
          equal(results.length, 1);
          done();
        },
        error: function(err) {
          fail(err);
          done();
        },
      });
    });
  });

  it("containsAll string array queries", function(done) {
    var StringSet = Parse.Object.extend({ className: "StringSet" });

    var objectsList = [];
    objectsList.push(new StringSet({ "strings" : ["a", "b", "c", "d", "e"] }));
    objectsList.push(new StringSet({ "strings" : ["a", "c", "d", "e"] }));

    Parse.Object.saveAll(objectsList, function() {
      var query = new Parse.Query(StringSet);
      query.containsAll("strings", ["a", "b", "c"]);
      query.find({
        success: function(results) {
          equal(results.length, 1);
          done();
        }
      });
    });
  });

  it("containsAll date array queries", function(done) {
    var DateSet = Parse.Object.extend({ className: "DateSet" });

    function parseDate(iso8601) {
      var regexp = new RegExp(
        '^([0-9]{1,4})-([0-9]{1,2})-([0-9]{1,2})' + 'T' +
          '([0-9]{1,2}):([0-9]{1,2}):([0-9]{1,2})' +
          '(.([0-9]+))?' + 'Z$');
      var match = regexp.exec(iso8601);
      if (!match) {
        return null;
      }

      var year = match[1] || 0;
      var month = (match[2] || 1) - 1;
      var day = match[3] || 0;
      var hour = match[4] || 0;
      var minute = match[5] || 0;
      var second = match[6] || 0;
      var milli = match[8] || 0;

      return new Date(Date.UTC(year, month, day, hour, minute, second, milli));
    }

    var makeDates = function(stringArray) {
      return stringArray.map(function(dateStr) {
        return parseDate(dateStr + "T00:00:00Z");
      });
    };

    var objectsList = [];
    objectsList.push(new DateSet({
      "dates" : makeDates(["2013-02-01", "2013-02-02", "2013-02-03",
                           "2013-02-04"])
    }));
    objectsList.push(new DateSet({
      "dates" : makeDates(["2013-02-01", "2013-02-03", "2013-02-04"])
    }));

    Parse.Object.saveAll(objectsList, function() {
      var query = new Parse.Query(DateSet);
      query.containsAll("dates", makeDates(
        ["2013-02-01", "2013-02-02", "2013-02-03"]));
      query.find({
        success: function(results) {
          equal(results.length, 1);
          done();
        },
        error: function(e) {
          fail(e);
          done();
        },
      });
    });
  });

  it("containsAll object array queries", function(done) {

    var MessageSet = Parse.Object.extend({ className: "MessageSet" });

    var messageList = [];
    for (var i = 0; i < 4; ++i) {
      messageList.push(new TestObject({ 'i' : i }));
    }

    Parse.Object.saveAll(messageList, function() {
      equal(messageList.length, 4);

      var messageSetList = [];
      messageSetList.push(new MessageSet({ 'messages' : messageList }));

      var someList = [];
      someList.push(messageList[0]);
      someList.push(messageList[1]);
      someList.push(messageList[3]);
      messageSetList.push(new MessageSet({ 'messages' : someList }));

      Parse.Object.saveAll(messageSetList, function() {
        var inList = [];
        inList.push(messageList[0]);
        inList.push(messageList[2]);

        var query = new Parse.Query(MessageSet);
        query.containsAll('messages', inList);
        query.find({
          success: function(results) {
            equal(results.length, 1);
            done();
          }
        });
      });
    });
  });

  var BoxedNumber = Parse.Object.extend({
    className: "BoxedNumber"
  });

  it("equalTo queries", function(done) {
    var makeBoxedNumber = function(i) {
      return new BoxedNumber({ number: i });
    };
    Parse.Object.saveAll([0, 1, 2, 3, 4, 5, 6, 7, 8, 9].map(makeBoxedNumber),
                         function() {
      var query = new Parse.Query(BoxedNumber);
      query.equalTo('number', 3);
      query.find({
        success: function(results) {
          equal(results.length, 1);
          done();
        }
      });
    });
  });

  it("equalTo undefined", function(done) {
    var makeBoxedNumber = function(i) {
      return new BoxedNumber({ number: i });
    };
    Parse.Object.saveAll([0, 1, 2, 3, 4, 5, 6, 7, 8, 9].map(makeBoxedNumber),
                         function() {
      var query = new Parse.Query(BoxedNumber);
      query.equalTo('number', undefined);
      query.find(expectSuccess({
        success: function(results) {
          equal(results.length, 0);
          done();
        }
      }));
    });
  });

  it("lessThan queries", function(done) {
    var makeBoxedNumber = function(i) {
      return new BoxedNumber({ number: i });
    };
    Parse.Object.saveAll([0, 1, 2, 3, 4, 5, 6, 7, 8, 9].map(makeBoxedNumber),
                         function() {
      var query = new Parse.Query(BoxedNumber);
      query.lessThan('number', 7);
      query.find({
        success: function(results) {
          equal(results.length, 7);
          done();
        }
      });
    });
  });

  it("lessThanOrEqualTo queries", function(done) {
    var makeBoxedNumber = function(i) {
      return new BoxedNumber({ number: i });
    };
    Parse.Object.saveAll(
      [0, 1, 2, 3, 4, 5, 6, 7, 8, 9].map(makeBoxedNumber),
      function() {
        var query = new Parse.Query(BoxedNumber);
        query.lessThanOrEqualTo('number', 7);
        query.find({
          success: function(results) {
            equal(results.length, 8);
            done();
          }
        });
      });
  });

  it("greaterThan queries", function(done) {
    var makeBoxedNumber = function(i) {
      return new BoxedNumber({ number: i });
    };
    Parse.Object.saveAll(
      [0, 1, 2, 3, 4, 5, 6, 7, 8, 9].map(makeBoxedNumber),
      function() {
        var query = new Parse.Query(BoxedNumber);
        query.greaterThan('number', 7);
        query.find({
          success: function(results) {
            equal(results.length, 2);
            done();
          }
        });
      });
  });

  it("greaterThanOrEqualTo queries", function(done) {
    var makeBoxedNumber = function(i) {
      return new BoxedNumber({ number: i });
    };
    Parse.Object.saveAll(
      [0, 1, 2, 3, 4, 5, 6, 7, 8, 9].map(makeBoxedNumber),
      function() {
        var query = new Parse.Query(BoxedNumber);
        query.greaterThanOrEqualTo('number', 7);
        query.find({
          success: function(results) {
            equal(results.length, 3);
            done();
          }
        });
      });
  });

  it("lessThanOrEqualTo greaterThanOrEqualTo queries", function(done) {
    var makeBoxedNumber = function(i) {
      return new BoxedNumber({ number: i });
    };
    Parse.Object.saveAll(
      [0, 1, 2, 3, 4, 5, 6, 7, 8, 9].map(makeBoxedNumber),
      function() {
      var query = new Parse.Query(BoxedNumber);
      query.lessThanOrEqualTo('number', 7);
      query.greaterThanOrEqualTo('number', 7);
      query.find({
        success: function(results) {
          equal(results.length, 1);
          done();
        }
      });
    });
  });

  it("lessThan greaterThan queries", function(done) {
    var makeBoxedNumber = function(i) {
      return new BoxedNumber({ number: i });
    };
    Parse.Object.saveAll(
      [0, 1, 2, 3, 4, 5, 6, 7, 8, 9].map(makeBoxedNumber),
      function() {
      var query = new Parse.Query(BoxedNumber);
      query.lessThan('number', 9);
      query.greaterThan('number', 3);
      query.find({
        success: function(results) {
          equal(results.length, 5);
          done();
        }
      });
    });
  });

  it("notEqualTo queries", function(done) {
    var makeBoxedNumber = function(i) {
      return new BoxedNumber({ number: i });
    };
    Parse.Object.saveAll(
      [0, 1, 2, 3, 4, 5, 6, 7, 8, 9].map(makeBoxedNumber),
      function() {
      var query = new Parse.Query(BoxedNumber);
      query.notEqualTo('number', 5);
      query.find({
        success: function(results) {
          equal(results.length, 9);
          done();
        }
      });
    });
  });

  it("containedIn queries", function(done) {
    var makeBoxedNumber = function(i) {
      return new BoxedNumber({ number: i });
    };
    Parse.Object.saveAll(
      [0, 1, 2, 3, 4, 5, 6, 7, 8, 9].map(makeBoxedNumber),
      function() {
      var query = new Parse.Query(BoxedNumber);
      query.containedIn('number', [3,5,7,9,11]);
      query.find({
        success: function(results) {
          equal(results.length, 4);
          done();
        }
      });
    });
  });

  it("notContainedIn queries", function(done) {
    var makeBoxedNumber = function(i) {
      return new BoxedNumber({ number: i });
    };
    Parse.Object.saveAll(
      [0, 1, 2, 3, 4, 5, 6, 7, 8, 9].map(makeBoxedNumber),
      function() {
      var query = new Parse.Query(BoxedNumber);
      query.notContainedIn('number', [3,5,7,9,11]);
      query.find({
        success: function(results) {
          equal(results.length, 6);
          done();
        }
      });
    });
  });


  it("objectId containedIn queries", function(done) {
    var makeBoxedNumber = function(i) {
      return new BoxedNumber({ number: i });
    };
    Parse.Object.saveAll(
      [0, 1, 2, 3, 4, 5, 6, 7, 8, 9].map(makeBoxedNumber),
      function(list) {
        var query = new Parse.Query(BoxedNumber);
        query.containedIn('objectId',
                          [list[2].id, list[3].id, list[0].id,
                           "NONSENSE"]);
        query.ascending('number');
        query.find({
          success: function(results) {
            if (results.length != 3) {
              fail('expected 3 results');
            } else {
              equal(results[0].get('number'), 0);
              equal(results[1].get('number'), 2);
              equal(results[2].get('number'), 3);
            }
            done();
          }
        });
      });
  });

  it("objectId equalTo queries", function(done) {
    var makeBoxedNumber = function(i) {
      return new BoxedNumber({ number: i });
    };
    Parse.Object.saveAll(
      [0, 1, 2, 3, 4, 5, 6, 7, 8, 9].map(makeBoxedNumber),
      function(list) {
        var query = new Parse.Query(BoxedNumber);
        query.equalTo('objectId', list[4].id);
        query.find({
          success: function(results) {
            if (results.length != 1) {
              fail('expected 1 result')
              done();
            } else {
              equal(results[0].get('number'), 4);
            }
            done();
          }
        });
      });
  });

  it("find no elements", function(done) {
    var makeBoxedNumber = function(i) {
      return new BoxedNumber({ number: i });
    };
    Parse.Object.saveAll(
      [0, 1, 2, 3, 4, 5, 6, 7, 8, 9].map(makeBoxedNumber),
      function() {
      var query = new Parse.Query(BoxedNumber);
      query.equalTo('number', 17);
      query.find(expectSuccess({
        success: function(results) {
          equal(results.length, 0);
          done();
        }
      }));
    });
  });

  it("find with error", function(done) {
    var query = new Parse.Query(BoxedNumber);
    query.equalTo('$foo', 'bar');
    query.find(expectError(Parse.Error.INVALID_KEY_NAME, done));
  });

  it("get", function(done) {
    Parse.Object.saveAll([new TestObject({foo: 'bar'})], function(items) {
      ok(items[0]);
      var objectId = items[0].id;
      var query = new Parse.Query(TestObject);
      query.get(objectId, {
        success: function(result) {
          ok(result);
          equal(result.id, objectId);
          equal(result.get('foo'), 'bar');
          ok(result.createdAt instanceof Date);
          ok(result.updatedAt instanceof Date);
          done();
        }
      });
    });
  });

  it("get undefined", function(done) {
    Parse.Object.saveAll([new TestObject({foo: 'bar'})], function(items) {
      ok(items[0]);
      var query = new Parse.Query(TestObject);
      query.get(undefined, {
        success: fail,
        error: done,
      });
    });
  });

  it("get error", function(done) {
    Parse.Object.saveAll([new TestObject({foo: 'bar'})], function(items) {
      ok(items[0]);
      var objectId = items[0].id;
      var query = new Parse.Query(TestObject);
      query.get("InvalidObjectID", {
        success: function(result) {
          ok(false, "The get should have failed.");
          done();
        },
        error: function(object, error) {
          equal(error.code, Parse.Error.OBJECT_NOT_FOUND);
          done();
        }
      });
    });
  });

  it("first", function(done) {
    Parse.Object.saveAll([new TestObject({foo: 'bar'})], function() {
      var query = new Parse.Query(TestObject);
      query.equalTo('foo', 'bar');
      query.first({
        success: function(result) {
          equal(result.get('foo'), 'bar');
          done();
        }
      });
    });
  });

  it("first no result", function(done) {
    Parse.Object.saveAll([new TestObject({foo: 'bar'})], function() {
      var query = new Parse.Query(TestObject);
      query.equalTo('foo', 'baz');
      query.first({
        success: function(result) {
          equal(result, undefined);
          done();
        }
      });
    });
  });

  it("first with two results", function(done) {
    Parse.Object.saveAll([new TestObject({foo: 'bar'}),
                          new TestObject({foo: 'bar'})], function() {
                            var query = new Parse.Query(TestObject);
                            query.equalTo('foo', 'bar');
                            query.first({
                              success: function(result) {
                                equal(result.get('foo'), 'bar');
                                done();
                              }
                            });
                          });
  });

  it("first with error", function(done) {
    var query = new Parse.Query(BoxedNumber);
    query.equalTo('$foo', 'bar');
    query.first(expectError(Parse.Error.INVALID_KEY_NAME, done));
  });

  var Container = Parse.Object.extend({
    className: "Container"
  });

  it("notEqualTo object", function(done) {
    var item1 = new TestObject();
    var item2 = new TestObject();
    var container1 = new Container({item: item1});
    var container2 = new Container({item: item2});
    Parse.Object.saveAll([item1, item2, container1, container2], function() {
      var query = new Parse.Query(Container);
      query.notEqualTo('item', item1);
      query.find({
        success: function(results) {
          equal(results.length, 1);
          done();
        }
      });
    });
  });

  it("skip", function(done) {
    Parse.Object.saveAll([new TestObject(), new TestObject()], function() {
      var query = new Parse.Query(TestObject);
      query.skip(1);
      query.find({
        success: function(results) {
          equal(results.length, 1);
          query.skip(3);
          query.find({
            success: function(results) {
              equal(results.length, 0);
              done();
            }
          });
        }
      });
    });
  });

  it("skip doesn't affect count", function(done) {
    Parse.Object.saveAll([new TestObject(), new TestObject()], function() {
      var query = new Parse.Query(TestObject);
      query.count({
        success: function(count) {
          equal(count, 2);
          query.skip(1);
          query.count({
            success: function(count) {
              equal(count, 2);
              query.skip(3);
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
  });

  it("count", function(done) {
    var makeBoxedNumber = function(i) {
      return new BoxedNumber({ number: i });
    };
    Parse.Object.saveAll(
      [0, 1, 2, 3, 4, 5, 6, 7, 8, 9].map(makeBoxedNumber),
      function() {
      var query = new Parse.Query(BoxedNumber);
      query.greaterThan("number", 1);
      query.count({
        success: function(count) {
          equal(count, 8);
          done();
        }
      });
    });
  });

  it("order by ascending number", function(done) {
    var makeBoxedNumber = function(i) {
      return new BoxedNumber({ number: i });
    };
    Parse.Object.saveAll([3, 1, 2].map(makeBoxedNumber), function(list) {
      var query = new Parse.Query(BoxedNumber);
      query.ascending("number");
      query.find(expectSuccess({
        success: function(results) {
          equal(results.length, 3);
          equal(results[0].get("number"), 1);
          equal(results[1].get("number"), 2);
          equal(results[2].get("number"), 3);
          done();
        }
      }));
    });
  });

  it("order by descending number", function(done) {
    var makeBoxedNumber = function(i) {
      return new BoxedNumber({ number: i });
    };
    Parse.Object.saveAll([3, 1, 2].map(makeBoxedNumber), function(list) {
      var query = new Parse.Query(BoxedNumber);
      query.descending("number");
      query.find(expectSuccess({
        success: function(results) {
          equal(results.length, 3);
          equal(results[0].get("number"), 3);
          equal(results[1].get("number"), 2);
          equal(results[2].get("number"), 1);
          done();
        }
      }));
    });
  });

  it("order by ascending number then descending string", function(done) {
    var strings = ["a", "b", "c", "d"];
    var makeBoxedNumber = function(num, i) {
      return new BoxedNumber({ number: num, string: strings[i] });
    };
    Parse.Object.saveAll(
      [3, 1, 3, 2].map(makeBoxedNumber),
      function(list) {
        var query = new Parse.Query(BoxedNumber);
        query.ascending("number").addDescending("string");
        query.find(expectSuccess({
          success: function(results) {
            equal(results.length, 4);
            equal(results[0].get("number"), 1);
            equal(results[0].get("string"), "b");
            equal(results[1].get("number"), 2);
            equal(results[1].get("string"), "d");
            equal(results[2].get("number"), 3);
            equal(results[2].get("string"), "c");
            equal(results[3].get("number"), 3);
            equal(results[3].get("string"), "a");
            done();
          }
        }));
      });
  });

  it("order by descending number then ascending string", function(done) {
    var strings = ["a", "b", "c", "d"];
    var makeBoxedNumber = function(num, i) {
      return new BoxedNumber({ number: num, string: strings[i] });
    };
    Parse.Object.saveAll([3, 1, 3, 2].map(makeBoxedNumber),
                         function(list) {
                           var query = new Parse.Query(BoxedNumber);
                           query.descending("number").addAscending("string");
                           query.find(expectSuccess({
                             success: function(results) {
                               equal(results.length, 4);
                               equal(results[0].get("number"), 3);
                               equal(results[0].get("string"), "a");
                               equal(results[1].get("number"), 3);
                               equal(results[1].get("string"), "c");
                               equal(results[2].get("number"), 2);
                               equal(results[2].get("string"), "d");
                               equal(results[3].get("number"), 1);
                               equal(results[3].get("string"), "b");
                               done();
                             }
                           }));
                         });
  });

  it("order by descending number and string", function(done) {
    var strings = ["a", "b", "c", "d"];
    var makeBoxedNumber = function(num, i) {
      return new BoxedNumber({ number: num, string: strings[i] });
    };
    Parse.Object.saveAll([3, 1, 3, 2].map(makeBoxedNumber),
                         function(list) {
                           var query = new Parse.Query(BoxedNumber);
                           query.descending("number,string");
                           query.find(expectSuccess({
                             success: function(results) {
                               equal(results.length, 4);
                               equal(results[0].get("number"), 3);
                               equal(results[0].get("string"), "c");
                               equal(results[1].get("number"), 3);
                               equal(results[1].get("string"), "a");
                               equal(results[2].get("number"), 2);
                               equal(results[2].get("string"), "d");
                               equal(results[3].get("number"), 1);
                               equal(results[3].get("string"), "b");
                               done();
                             }
                           }));
                         });
  });

  it("order by descending number and string, with space", function(done) {
    var strings = ["a", "b", "c", "d"];
    var makeBoxedNumber = function(num, i) {
      return new BoxedNumber({ number: num, string: strings[i] });
    };
    Parse.Object.saveAll([3, 1, 3, 2].map(makeBoxedNumber),
                         function(list) {
                           var query = new Parse.Query(BoxedNumber);
                           query.descending("number, string");
                           query.find(expectSuccess({
                             success: function(results) {
                               equal(results.length, 4);
                               equal(results[0].get("number"), 3);
                               equal(results[0].get("string"), "c");
                               equal(results[1].get("number"), 3);
                               equal(results[1].get("string"), "a");
                               equal(results[2].get("number"), 2);
                               equal(results[2].get("string"), "d");
                               equal(results[3].get("number"), 1);
                               equal(results[3].get("string"), "b");
                               done();
                             }
                           }));
                         });
  });

  it("order by descending number and string, with array arg", function(done) {
    var strings = ["a", "b", "c", "d"];
    var makeBoxedNumber = function(num, i) {
      return new BoxedNumber({ number: num, string: strings[i] });
    };
    Parse.Object.saveAll([3, 1, 3, 2].map(makeBoxedNumber),
                         function(list) {
                           var query = new Parse.Query(BoxedNumber);
                           query.descending(["number", "string"]);
                           query.find(expectSuccess({
                             success: function(results) {
                               equal(results.length, 4);
                               equal(results[0].get("number"), 3);
                               equal(results[0].get("string"), "c");
                               equal(results[1].get("number"), 3);
                               equal(results[1].get("string"), "a");
                               equal(results[2].get("number"), 2);
                               equal(results[2].get("string"), "d");
                               equal(results[3].get("number"), 1);
                               equal(results[3].get("string"), "b");
                               done();
                             }
                           }));
                         });
  });

  it("order by descending number and string, with multiple args", function(done) {
    var strings = ["a", "b", "c", "d"];
    var makeBoxedNumber = function(num, i) {
      return new BoxedNumber({ number: num, string: strings[i] });
    };
    Parse.Object.saveAll([3, 1, 3, 2].map(makeBoxedNumber),
                         function(list) {
                           var query = new Parse.Query(BoxedNumber);
                           query.descending("number", "string");
                           query.find(expectSuccess({
                             success: function(results) {
                               equal(results.length, 4);
                               equal(results[0].get("number"), 3);
                               equal(results[0].get("string"), "c");
                               equal(results[1].get("number"), 3);
                               equal(results[1].get("string"), "a");
                               equal(results[2].get("number"), 2);
                               equal(results[2].get("string"), "d");
                               equal(results[3].get("number"), 1);
                               equal(results[3].get("string"), "b");
                               done();
                             }
                           }));
                         });
  });

  it("can't order by password", function(done) {
    var makeBoxedNumber = function(i) {
      return new BoxedNumber({ number: i });
    };
    Parse.Object.saveAll([3, 1, 2].map(makeBoxedNumber), function(list) {
      var query = new Parse.Query(BoxedNumber);
      query.ascending("_password");
      query.find(expectError(Parse.Error.INVALID_KEY_NAME, done));
    });
  });

  it("order by _created_at", function(done) {
    var makeBoxedNumber = function(i) {
      return new BoxedNumber({ number: i });
    };
    var numbers = [3, 1, 2].map(makeBoxedNumber);
    numbers[0].save().then(() => {
      return numbers[1].save();
    }).then(() => {
      return numbers[2].save();
    }).then(function() {
      var query = new Parse.Query(BoxedNumber);
      query.ascending("_created_at");
      query.find({
        success: function(results) {
          equal(results.length, 3);
          equal(results[0].get("number"), 3);
          equal(results[1].get("number"), 1);
          equal(results[2].get("number"), 2);
          done();
        },
        error: function(e) {
          fail(e);
          done();
        },
      });
    });
  });

  it("order by createdAt", function(done) {
    var makeBoxedNumber = function(i) {
      return new BoxedNumber({ number: i });
    };
    var numbers = [3, 1, 2].map(makeBoxedNumber);
    numbers[0].save().then(() => {
      return numbers[1].save();
    }).then(() => {
      return numbers[2].save();
    }).then(function() {
      var query = new Parse.Query(BoxedNumber);
      query.descending("createdAt");
      query.find({
        success: function(results) {
          equal(results.length, 3);
          equal(results[0].get("number"), 2);
          equal(results[1].get("number"), 1);
          equal(results[2].get("number"), 3);
          done();
        }
      });
    });
  });

  it("order by _updated_at", function(done) {
    var makeBoxedNumber = function(i) {
      return new BoxedNumber({ number: i });
    };
    var numbers = [3, 1, 2].map(makeBoxedNumber);
    numbers[0].save().then(() => {
      return numbers[1].save();
    }).then(() => {
      return numbers[2].save();
    }).then(function() {
      numbers[1].set("number", 4);
      numbers[1].save(null, {
        success: function(model) {
          var query = new Parse.Query(BoxedNumber);
          query.ascending("_updated_at");
          query.find({
            success: function(results) {
              equal(results.length, 3);
              equal(results[0].get("number"), 3);
              equal(results[1].get("number"), 2);
              equal(results[2].get("number"), 4);
              done();
            }
          });
        }
      });
    });
  });

  it("order by updatedAt", function(done) {
    var makeBoxedNumber = function(i) { return new BoxedNumber({ number: i }); };
    var numbers = [3, 1, 2].map(makeBoxedNumber);
    numbers[0].save().then(() => {
      return numbers[1].save();
    }).then(() => {
      return numbers[2].save();
    }).then(function() {
      numbers[1].set("number", 4);
      numbers[1].save(null, {
        success: function(model) {
          var query = new Parse.Query(BoxedNumber);
          query.descending("_updated_at");
          query.find({
            success: function(results) {
              equal(results.length, 3);
              equal(results[0].get("number"), 4);
              equal(results[1].get("number"), 2);
              equal(results[2].get("number"), 3);
              done();
            }
          });
        }
      });
    });
  });

  // Returns a promise
  function makeTimeObject(start, i) {
    var time = new Date();
    time.setSeconds(start.getSeconds() + i);
    var item = new TestObject({name: "item" + i, time: time});
    return item.save();
  }

  // Returns a promise for all the time objects
  function makeThreeTimeObjects() {
    var start = new Date();
    var one, two, three;
    return makeTimeObject(start, 1).then((o1) => {
      one = o1;
      return makeTimeObject(start, 2);
    }).then((o2) => {
      two = o2;
      return makeTimeObject(start, 3);
    }).then((o3) => {
      three = o3;
      return [one, two, three];
    });
  }

  it("time equality", function(done) {
    makeThreeTimeObjects().then(function(list) {
      var query = new Parse.Query(TestObject);
      query.equalTo("time", list[1].get("time"));
      query.find({
        success: function(results) {
          equal(results.length, 1);
          equal(results[0].get("name"), "item2");
          done();
        }
      });
    });
  });

  it("time lessThan", function(done) {
    makeThreeTimeObjects().then(function(list) {
      var query = new Parse.Query(TestObject);
      query.lessThan("time", list[2].get("time"));
      query.find({
        success: function(results) {
          equal(results.length, 2);
          done();
        }
      });
    });
  });

  // This test requires Date objects to be consistently stored as a Date.
  it("time createdAt", function(done) {
    makeThreeTimeObjects().then(function(list) {
      var query = new Parse.Query(TestObject);
      query.greaterThanOrEqualTo("createdAt", list[0].createdAt);
      query.find({
        success: function(results) {
          equal(results.length, 3);
          done();
        }
      });
    });
  });

  it("matches string", function(done) {
    var thing1 = new TestObject();
    thing1.set("myString", "football");
    var thing2 = new TestObject();
    thing2.set("myString", "soccer");
    Parse.Object.saveAll([thing1, thing2], function() {
      var query = new Parse.Query(TestObject);
      query.matches("myString", "^fo*\\wb[^o]l+$");
      query.find({
        success: function(results) {
          equal(results.length, 1);
          done();
        }
      });
    });
  });

  it("matches regex", function(done) {
    var thing1 = new TestObject();
    thing1.set("myString", "football");
    var thing2 = new TestObject();
    thing2.set("myString", "soccer");
    Parse.Object.saveAll([thing1, thing2], function() {
      var query = new Parse.Query(TestObject);
      query.matches("myString", /^fo*\wb[^o]l+$/);
      query.find({
        success: function(results) {
          equal(results.length, 1);
          done();
        }
      });
    });
  });

  it("case insensitive regex success", function(done) {
    var thing = new TestObject();
    thing.set("myString", "football");
    Parse.Object.saveAll([thing], function() {
      var query = new Parse.Query(TestObject);
      query.matches("myString", "FootBall", "i");
      query.find({
        success: function(results) {
          done();
        }
      });
    });
  });

  it("regexes with invalid options fail", function(done) {
    var query = new Parse.Query(TestObject);
    query.matches("myString", "FootBall", "some invalid option");
    query.find(expectError(Parse.Error.INVALID_QUERY, done));
  });

  it("Use a regex that requires all modifiers", function(done) {
    var thing = new TestObject();
    thing.set("myString", "PArSe\nCom");
    Parse.Object.saveAll([thing], function() {
      var query = new Parse.Query(TestObject);
      query.matches(
        "myString",
        "parse # First fragment. We'll write this in one case but match " +
          "insensitively\n.com  # Second fragment. This can be separated by any " +
          "character, including newline",
        "mixs");
      query.find({
        success: function(results) {
          equal(results.length, 1);
          done();
        }
      });
    });
  });

  it("Regular expression constructor includes modifiers inline", function(done) {
    var thing = new TestObject();
    thing.set("myString", "\n\nbuffer\n\nparse.COM");
    Parse.Object.saveAll([thing], function() {
      var query = new Parse.Query(TestObject);
      query.matches("myString", /parse\.com/mi);
      query.find({
        success: function(results) {
          equal(results.length, 1);
          done();
        }
      });
    });
  });

  var someAscii = "\\E' !\"#$%&'()*+,-./0123456789:;<=>?@ABCDEFGHIJKLMNOPQRSTU" +
    "VWXYZ[\\]^_`abcdefghijklmnopqrstuvwxyz{|}~'";

  it("contains", function(done) {
    Parse.Object.saveAll([new TestObject({myString: "zax" + someAscii + "qub"}),
                          new TestObject({myString: "start" + someAscii}),
                          new TestObject({myString: someAscii + "end"}),
                          new TestObject({myString: someAscii})], function() {
                            var query = new Parse.Query(TestObject);
                            query.contains("myString", someAscii);
                            query.find({
                              success: function(results, foo) {
                                equal(results.length, 4);
                                done();
                              }
                            });
                          });
  });

  it("startsWith", function(done) {
    Parse.Object.saveAll([new TestObject({myString: "zax" + someAscii + "qub"}),
                          new TestObject({myString: "start" + someAscii}),
                          new TestObject({myString: someAscii + "end"}),
                          new TestObject({myString: someAscii})], function() {
                            var query = new Parse.Query(TestObject);
                            query.startsWith("myString", someAscii);
                            query.find({
                              success: function(results, foo) {
                                equal(results.length, 2);
                                done();
                              }
                            });
                          });
  });

  it("endsWith", function(done) {
    Parse.Object.saveAll([new TestObject({myString: "zax" + someAscii + "qub"}),
                          new TestObject({myString: "start" + someAscii}),
                          new TestObject({myString: someAscii + "end"}),
                          new TestObject({myString: someAscii})], function() {
                            var query = new Parse.Query(TestObject);
                            query.startsWith("myString", someAscii);
                            query.find({
                              success: function(results, foo) {
                                equal(results.length, 2);
                                done();
                              }
                            });
                          });
  });

  it("exists", function(done) {
    var objects = [];
    for (var i of [0, 1, 2, 3, 4, 5, 6, 7, 8]) {
      var item = new TestObject();
      if (i % 2 === 0) {
        item.set('x', i + 1);
      } else {
        item.set('y', i + 1);
      }
      objects.push(item);
    }
    Parse.Object.saveAll(objects, function() {
      var query = new Parse.Query(TestObject);
      query.exists("x");
      query.find({
        success: function(results) {
          equal(results.length, 5);
          for (var result of results) {
            ok(result.get("x"));
          };
          done();
        }
      });
    });
  });

  it("doesNotExist", function(done) {
    var objects = [];
    for (var i of [0, 1, 2, 3, 4, 5, 6, 7, 8]) {
      var item = new TestObject();
      if (i % 2 === 0) {
        item.set('x', i + 1);
      } else {
        item.set('y', i + 1);
      }
      objects.push(item);
    };
    Parse.Object.saveAll(objects, function() {
      var query = new Parse.Query(TestObject);
      query.doesNotExist("x");
      query.find({
        success: function(results) {
          equal(results.length, 4);
          for (var result of results) {
            ok(result.get("y"));
          }
          done();
        }
      });
    });
  });

  it("exists relation", function(done) {
    var objects = [];
    for (var i of [0, 1, 2, 3, 4, 5, 6, 7, 8]) {
      var container = new Container();
      if (i % 2 === 0) {
        var item = new TestObject();
        item.set('x', i);
        container.set('x', item);
        objects.push(item);
      } else {
        container.set('y', i);
      }
      objects.push(container);
    };
    Parse.Object.saveAll(objects, function() {
      var query = new Parse.Query(Container);
      query.exists("x");
      query.find({
        success: function(results) {
          equal(results.length, 5);
          for (var result of results) {
            ok(result.get("x"));
          };
          done();
        }
      });
    });
  });

  it("doesNotExist relation", function(done) {
    var objects = [];
    for (var i of [0, 1, 2, 3, 4, 5, 6, 7]) {
      var container = new Container();
      if (i % 2 === 0) {
        var item = new TestObject();
        item.set('x', i);
        container.set('x', item);
        objects.push(item);
      } else {
        container.set('y', i);
      }
      objects.push(container);
    }
    Parse.Object.saveAll(objects, function() {
      var query = new Parse.Query(Container);
      query.doesNotExist("x");
      query.find({
        success: function(results) {
          equal(results.length, 4);
          for (var result of results) {
            ok(result.get("y"));
          };
          done();
        }
      });
    });
  });

  it("don't include by default", function(done) {
    var child = new TestObject();
    var parent = new Container();
    child.set("foo", "bar");
    parent.set("child", child);
    Parse.Object.saveAll([child, parent], function() {
      child._clearServerData();
      var query = new Parse.Query(Container);
      query.find({
        success: function(results) {
          equal(results.length, 1);
          var parentAgain = results[0];
          var goodURL = Parse.serverURL;
          Parse.serverURL = "YAAAAAAAAARRRRRGGGGGGGGG";
          var childAgain = parentAgain.get("child");
          ok(childAgain);
          equal(childAgain.get("foo"), undefined);
          Parse.serverURL = goodURL;
          done();
        }
      });
    });
  });

  it("include relation", function(done) {
    var child = new TestObject();
    var parent = new Container();
    child.set("foo", "bar");
    parent.set("child", child);
    Parse.Object.saveAll([child, parent], function() {
      var query = new Parse.Query(Container);
      query.include("child");
      query.find({
        success: function(results) {
          equal(results.length, 1);
          var parentAgain = results[0];
          var goodURL = Parse.serverURL;
          Parse.serverURL = "YAAAAAAAAARRRRRGGGGGGGGG";
          var childAgain = parentAgain.get("child");
          ok(childAgain);
          equal(childAgain.get("foo"), "bar");
          Parse.serverURL = goodURL;
          done();
        }
      });
    });
  });

  it("include relation array", function(done) {
    var child = new TestObject();
    var parent = new Container();
    child.set("foo", "bar");
    parent.set("child", child);
    Parse.Object.saveAll([child, parent], function() {
      var query = new Parse.Query(Container);
      query.include(["child"]);
      query.find({
        success: function(results) {
          equal(results.length, 1);
          var parentAgain = results[0];
          var goodURL = Parse.serverURL;
          Parse.serverURL = "YAAAAAAAAARRRRRGGGGGGGGG";
          var childAgain = parentAgain.get("child");
          ok(childAgain);
          equal(childAgain.get("foo"), "bar");
          Parse.serverURL = goodURL;
          done();
        }
      });
    });
  });

  it("nested include", function(done) {
    var Child = Parse.Object.extend("Child");
    var Parent = Parse.Object.extend("Parent");
    var Grandparent = Parse.Object.extend("Grandparent");
    var objects = [];
    for (var i = 0; i < 5; ++i) {
      var grandparent = new Grandparent({
        z:i,
        parent: new Parent({
          y:i,
          child: new Child({
            x:i
          })
        })
      });
      objects.push(grandparent);
    }

    Parse.Object.saveAll(objects, function() {
      var query = new Parse.Query(Grandparent);
      query.include(["parent.child"]);
      query.find({
        success: function(results) {
          equal(results.length, 5);
          for (var object of results) {
            equal(object.get("z"), object.get("parent").get("y"));
            equal(object.get("z"), object.get("parent").get("child").get("x"));
          }
          done();
        }
      });
    });
  });

  it("include doesn't make dirty wrong", function(done) {
    var Parent = Parse.Object.extend("ParentObject");
    var Child = Parse.Object.extend("ChildObject");
    var parent = new Parent();
    var child = new Child();
    child.set("foo", "bar");
    parent.set("child", child);

    Parse.Object.saveAll([child, parent], function() {
      var query = new Parse.Query(Parent);
      query.include("child");
      query.find({
        success: function(results) {
          equal(results.length, 1);
          var parentAgain = results[0];
          var childAgain = parentAgain.get("child");
          equal(childAgain.id, child.id);
          equal(parentAgain.id, parent.id);
          equal(childAgain.get("foo"), "bar");
          equal(false, parentAgain.dirty());
          equal(false, childAgain.dirty());
          done();
        }
      });
    });
  });

  it("result object creation uses current extension", function(done) {
    var ParentObject = Parse.Object.extend({ className: "ParentObject" });
    // Add a foo() method to ChildObject.
    var ChildObject = Parse.Object.extend("ChildObject", {
      foo: function() {
        return "foo";
      }
    });

    var parent = new ParentObject();
    var child = new ChildObject();
    parent.set("child", child);
    Parse.Object.saveAll([child, parent], function() {
      // Add a bar() method to ChildObject.
      ChildObject = Parse.Object.extend("ChildObject", {
        bar: function() {
          return "bar";
        }
      });

      var query = new Parse.Query(ParentObject);
      query.include("child");
      query.find({
        success: function(results) {
          equal(results.length, 1);
          var parentAgain = results[0];
          var childAgain = parentAgain.get("child");
          equal(childAgain.foo(), "foo");
          equal(childAgain.bar(), "bar");
          done();
        }
      });
    });
  });

  it("matches query", function(done) {
    var ParentObject = Parse.Object.extend("ParentObject");
    var ChildObject = Parse.Object.extend("ChildObject");
    var objects = [];
    for (var i = 0; i < 10; ++i) {
      objects.push(
        new ParentObject({
          child: new ChildObject({x: i}),
          x: 10 + i
        }));
    }
    Parse.Object.saveAll(objects, function() {
      var subQuery = new Parse.Query(ChildObject);
      subQuery.greaterThan("x", 5);
      var query = new Parse.Query(ParentObject);
      query.matchesQuery("child", subQuery);
      query.find({
        success: function(results) {
          equal(results.length, 4);
          for (var object of results) {
            ok(object.get("x") > 15);
          }
          var query = new Parse.Query(ParentObject);
          query.doesNotMatchQuery("child", subQuery);
          query.find({
            success: function (results) {
              equal(results.length, 6);
              for (var object of results) {
                ok(object.get("x") >= 10);
                ok(object.get("x") <= 15);
                done();
              }
            }
          });
        }
      });
    });
  });

  it("select query", function(done) {
    var RestaurantObject = Parse.Object.extend("Restaurant");
    var PersonObject = Parse.Object.extend("Person");
    var objects = [
      new RestaurantObject({ ratings: 5, location: "Djibouti" }),
      new RestaurantObject({ ratings: 3, location: "Ouagadougou" }),
      new PersonObject({ name: "Bob", hometown: "Djibouti" }),
      new PersonObject({ name: "Tom", hometown: "Ouagadougou" }),
      new PersonObject({ name: "Billy", hometown: "Detroit" })
    ];

    Parse.Object.saveAll(objects, function() {
      var query = new Parse.Query(RestaurantObject);
      query.greaterThan("ratings", 4);
      var mainQuery = new Parse.Query(PersonObject);
      mainQuery.matchesKeyInQuery("hometown", "location", query);
      mainQuery.find(expectSuccess({
        success: function(results) {
          equal(results.length, 1);
          equal(results[0].get('name'), 'Bob');
          done();
        }
      }));
    });
  });

  it('$select inside $or', (done) => {
    var Restaurant = Parse.Object.extend('Restaurant');
    var Person = Parse.Object.extend('Person');
    var objects = [
      new Restaurant({ ratings: 5, location: "Djibouti" }),
      new Restaurant({ ratings: 3, location: "Ouagadougou" }),
      new Person({ name: "Bob", hometown: "Djibouti" }),
      new Person({ name: "Tom", hometown: "Ouagadougou" }),
      new Person({ name: "Billy", hometown: "Detroit" })
    ];

    Parse.Object.saveAll(objects).then(() => {
      var subquery = new Parse.Query(Restaurant);
      subquery.greaterThan('ratings', 4);
      var query1 = new Parse.Query(Person);
      query1.matchesKeyInQuery('hometown', 'location', subquery);
      var query2 = new Parse.Query(Person);
      query2.equalTo('name', 'Tom');
      var query = Parse.Query.or(query1, query2);
      return query.find();
    }).then((results) => {
      expect(results.length).toEqual(2);
      done();
    }, (error) => {
      fail(error);
      done();
    });
  });

  it("dontSelect query", function(done) {
    var RestaurantObject = Parse.Object.extend("Restaurant");
    var PersonObject = Parse.Object.extend("Person");
    var objects = [
      new RestaurantObject({ ratings: 5, location: "Djibouti" }),
      new RestaurantObject({ ratings: 3, location: "Ouagadougou" }),
      new PersonObject({ name: "Bob", hometown: "Djibouti" }),
      new PersonObject({ name: "Tom", hometown: "Ouagadougou" }),
      new PersonObject({ name: "Billy", hometown: "Djibouti" })
    ];

    Parse.Object.saveAll(objects, function() {
      var query = new Parse.Query(RestaurantObject);
      query.greaterThan("ratings", 4);
      var mainQuery = new Parse.Query(PersonObject);
      mainQuery.doesNotMatchKeyInQuery("hometown", "location", query);
      mainQuery.find(expectSuccess({
        success: function(results) {
          equal(results.length, 1);
          equal(results[0].get('name'), 'Tom');
          done();
        }
      }));
    });
  });

  it("dontSelect query without conditions", function(done) {
    const RestaurantObject = Parse.Object.extend("Restaurant");
    const PersonObject = Parse.Object.extend("Person");
    const objects = [
      new RestaurantObject({ location: "Djibouti" }),
      new RestaurantObject({ location: "Ouagadougou" }),
      new PersonObject({ name: "Bob", hometown: "Djibouti" }),
      new PersonObject({ name: "Tom", hometown: "Yoloblahblahblah" }),
      new PersonObject({ name: "Billy", hometown: "Ouagadougou" })
    ];

    Parse.Object.saveAll(objects, function() {
      const query = new Parse.Query(RestaurantObject);
      const mainQuery = new Parse.Query(PersonObject);
      mainQuery.doesNotMatchKeyInQuery("hometown", "location", query);
      mainQuery.find().then(results => {
        equal(results.length, 1);
        equal(results[0].get('name'), 'Tom');
        done();
      });
    });
  });

  it("object with length", function(done) {
    var TestObject = Parse.Object.extend("TestObject");
    var obj = new TestObject();
    obj.set("length", 5);
    equal(obj.get("length"), 5);
    obj.save(null, {
      success: function(obj) {
        var query = new Parse.Query(TestObject);
        query.find({
          success: function(results) {
            equal(results.length, 1);
            equal(results[0].get("length"), 5);
            done();
          },
          error: function(error) {
            ok(false, error.message);
            done();
          }
        });
      },
      error: function(error) {
        ok(false, error.message);
        done();
      }
    });
  });

  it("include user", function(done) {
    Parse.User.signUp("bob", "password", { age: 21 }, {
      success: function(user) {
        var TestObject = Parse.Object.extend("TestObject");
        var obj = new TestObject();
        obj.save({
          owner: user
        }, {
          success: function(obj) {
            var query = new Parse.Query(TestObject);
            query.include("owner");
            query.get(obj.id, {
              success: function(objAgain) {
                equal(objAgain.id, obj.id);
                ok(objAgain.get("owner") instanceof Parse.User);
                equal(objAgain.get("owner").get("age"), 21);
                done();
              },
              error: function(objAgain, error) {
                ok(false, error.message);
                done();
              }
            });
          },
          error: function(obj, error) {
            ok(false, error.message);
            done();
          }
        });
      },
      error: function(user, error) {
        ok(false, error.message);
        done();
      }
    });
  });

  it("or queries", function(done) {
    var objects = [0, 1, 2, 3, 4, 5, 6, 7, 8, 9].map(function(x) {
      var object = new Parse.Object('BoxedNumber');
      object.set('x', x);
      return object;
    });
    Parse.Object.saveAll(objects, expectSuccess({
      success: function() {
        var query1 = new Parse.Query('BoxedNumber');
        query1.lessThan('x', 2);
        var query2 = new Parse.Query('BoxedNumber');
        query2.greaterThan('x', 5);
        var orQuery = Parse.Query.or(query1, query2);
        orQuery.find(expectSuccess({
          success: function(results) {
            equal(results.length, 6);
            for (var number of results) {
              ok(number.get('x') < 2 || number.get('x') > 5);
            }
            done();
          }
        }));
      }
    }));
  });

  // This relies on matchesQuery aka the $inQuery operator
  it("or complex queries", function(done) {
    var objects = [0, 1, 2, 3, 4, 5, 6, 7, 8, 9].map(function(x) {
      var child = new Parse.Object('Child');
      child.set('x', x);
      var parent = new Parse.Object('Parent');
      parent.set('child', child);
      parent.set('y', x);
      return parent;
    });

    Parse.Object.saveAll(objects, expectSuccess({
      success: function() {
        var subQuery = new Parse.Query('Child');
        subQuery.equalTo('x', 4);
        var query1 = new Parse.Query('Parent');
        query1.matchesQuery('child', subQuery);
        var query2 = new Parse.Query('Parent');
        query2.lessThan('y', 2);
        var orQuery = Parse.Query.or(query1, query2);
        orQuery.find(expectSuccess({
          success: function(results) {
            equal(results.length, 3);
            done();
          }
        }));
      }
    }));
  });

  it("async methods", function(done) {
    var saves = [0, 1, 2, 3, 4, 5, 6, 7, 8, 9].map(function(x) {
      var obj = new Parse.Object("TestObject");
      obj.set("x", x + 1);
      return obj.save();
    });

    Parse.Promise.when(saves).then(function() {
      var query = new Parse.Query("TestObject");
      query.ascending("x");
      return query.first();

    }).then(function(obj) {
      equal(obj.get("x"), 1);
      var query = new Parse.Query("TestObject");
      query.descending("x");
      return query.find();

    }).then(function(results) {
      equal(results.length, 10);
      var query = new Parse.Query("TestObject");
      return query.get(results[0].id);

    }).then(function(obj1) {
      equal(obj1.get("x"), 10);
      var query = new Parse.Query("TestObject");
      return query.count();

    }).then(function(count) {
      equal(count, 10);

    }).then(function() {
      done();

    });
  });

  it("query.each", function(done) {
    var TOTAL = 50;
    var COUNT = 25;

    var items = range(TOTAL).map(function(x) {
      var obj = new TestObject();
      obj.set("x", x);
      return obj;
    });

    Parse.Object.saveAll(items).then(function() {
      var query = new Parse.Query(TestObject);
      query.lessThan("x", COUNT);

      var seen = [];
      query.each(function(obj) {
        seen[obj.get("x")] = (seen[obj.get("x")] || 0) + 1;

      }, {
        batchSize: 10,
        success: function() {
          equal(seen.length, COUNT);
          for (var i = 0; i < COUNT; i++) {
            equal(seen[i], 1, "Should have seen object number " + i);
          };
          done();
        },
        error: function(error) {
          ok(false, error);
          done();
        }
      });
    });
  });

  it("query.each async", function(done) {
    var TOTAL = 50;
    var COUNT = 25;

    expect(COUNT + 1);

    var items = range(TOTAL).map(function(x) {
      var obj = new TestObject();
      obj.set("x", x);
      return obj;
    });

    var seen = [];

    Parse.Object.saveAll(items).then(function() {
      var query = new Parse.Query(TestObject);
      query.lessThan("x", COUNT);
      return query.each(function(obj) {
        var promise = new Parse.Promise();
        process.nextTick(function() {
          seen[obj.get("x")] = (seen[obj.get("x")] || 0) + 1;
          promise.resolve();
        });
        return promise;
      }, {
        batchSize: 10
      });

    }).then(function() {
      equal(seen.length, COUNT);
      for (var i = 0; i < COUNT; i++) {
        equal(seen[i], 1, "Should have seen object number " + i);
      };
      done();
    });
  });

  it("query.each fails with order", function(done) {
    var TOTAL = 50;
    var COUNT = 25;

    var items = range(TOTAL).map(function(x) {
      var obj = new TestObject();
      obj.set("x", x);
      return obj;
    });

    var seen = [];

    Parse.Object.saveAll(items).then(function() {
      var query = new Parse.Query(TestObject);
      query.lessThan("x", COUNT);
      query.ascending("x");
      return query.each(function(obj) {
        seen[obj.get("x")] = (seen[obj.get("x")] || 0) + 1;
      });

    }).then(function() {
      ok(false, "This should have failed.");
      done();
    }, function(error) {
      done();
    });
  });

  it("query.each fails with skip", function(done) {
    var TOTAL = 50;
    var COUNT = 25;

    var items = range(TOTAL).map(function(x) {
      var obj = new TestObject();
      obj.set("x", x);
      return obj;
    });

    var seen = [];

    Parse.Object.saveAll(items).then(function() {
      var query = new Parse.Query(TestObject);
      query.lessThan("x", COUNT);
      query.skip(5);
      return query.each(function(obj) {
        seen[obj.get("x")] = (seen[obj.get("x")] || 0) + 1;
      });

    }).then(function() {
      ok(false, "This should have failed.");
      done();
    }, function(error) {
      done();
    });
  });

  it("query.each fails with limit", function(done) {
    var TOTAL = 50;
    var COUNT = 25;

    expect(0);

    var items = range(TOTAL).map(function(x) {
      var obj = new TestObject();
      obj.set("x", x);
      return obj;
    });

    var seen = [];

    Parse.Object.saveAll(items).then(function() {
      var query = new Parse.Query(TestObject);
      query.lessThan("x", COUNT);
      query.limit(5);
      return query.each(function(obj) {
        seen[obj.get("x")] = (seen[obj.get("x")] || 0) + 1;
      });

    }).then(function() {
      ok(false, "This should have failed.");
      done();
    }, function(error) {
      done();
    });
  });

  it("select keys query", function(done) {
    var obj = new TestObject({ foo: 'baz', bar: 1 });

    obj.save().then(function () {
      obj._clearServerData();
      var query = new Parse.Query(TestObject);
      query.select('foo');
      return query.first();
    }).then(function(result) {
      ok(result.id, "expected object id to be set");
      ok(result.createdAt, "expected object createdAt to be set");
      ok(result.updatedAt, "expected object updatedAt to be set");
      ok(!result.dirty(), "expected result not to be dirty");
      strictEqual(result.get('foo'), 'baz');
      strictEqual(result.get('bar'), undefined,
                  "expected 'bar' field to be unset");
      return result.fetch();
    }).then(function(result) {
      strictEqual(result.get('foo'), 'baz');
      strictEqual(result.get('bar'), 1);
    }).then(function() {
      obj._clearServerData();
      var query = new Parse.Query(TestObject);
      query.select([]);
      return query.first();
    }).then(function(result) {
      ok(result.id, "expected object id to be set");
      ok(!result.dirty(), "expected result not to be dirty");
      strictEqual(result.get('foo'), undefined,
                  "expected 'foo' field to be unset");
      strictEqual(result.get('bar'), undefined,
                  "expected 'bar' field to be unset");
    }).then(function() {
      obj._clearServerData();
      var query = new Parse.Query(TestObject);
      query.select(['foo','bar']);
      return query.first();
    }).then(function(result) {
      ok(result.id, "expected object id to be set");
      ok(!result.dirty(), "expected result not to be dirty");
      strictEqual(result.get('foo'), 'baz');
      strictEqual(result.get('bar'), 1);
    }).then(function() {
      obj._clearServerData();
      var query = new Parse.Query(TestObject);
      query.select('foo', 'bar');
      return query.first();
    }).then(function(result) {
      ok(result.id, "expected object id to be set");
      ok(!result.dirty(), "expected result not to be dirty");
      strictEqual(result.get('foo'), 'baz');
      strictEqual(result.get('bar'), 1);
    }).then(function() {
      done();
    }, function (err) {
      ok(false, "other error: " + JSON.stringify(err));
      done();
    });
  });

  it('select keys with each query', function(done) {
    var obj = new TestObject({ foo: 'baz', bar: 1 });

    obj.save().then(function() {
      obj._clearServerData();
      var query = new Parse.Query(TestObject);
      query.select('foo');
      query.each(function(result) {
        ok(result.id, 'expected object id to be set');
        ok(result.createdAt, 'expected object createdAt to be set');
        ok(result.updatedAt, 'expected object updatedAt to be set');
        ok(!result.dirty(), 'expected result not to be dirty');
        strictEqual(result.get('foo'), 'baz');
        strictEqual(result.get('bar'), undefined,
                    'expected "bar" field to be unset');
      }).then(function() {
        done();
      }, function(err) {
        ok(false, JSON.stringify(err));
        done();
      });
    });
  });

  it('notEqual with array of pointers', (done) => {
    var children = [];
    var parents = [];
    var promises = [];
    for (var i = 0; i < 2; i++) {
      var proc = (iter) => {
        var child = new Parse.Object('Child');
        children.push(child);
        var parent = new Parse.Object('Parent');
        parents.push(parent);
        promises.push(
          child.save().then(() => {
            parents[iter].set('child', [children[iter]]);
            return parents[iter].save();
          })
        );
      };
      proc(i);
    }
    Promise.all(promises).then(() => {
      var query = new Parse.Query('Parent');
      query.notEqualTo('child', children[0]);
      return query.find();
    }).then((results) => {
      expect(results.length).toEqual(1);
      expect(results[0].id).toEqual(parents[1].id);
      done();
    }).catch((error) => { console.log(error); });
  });

  it('querying for null value', (done) => {
    var obj = new Parse.Object('TestObject');
    obj.set('aNull', null);
    obj.save().then(() => {
      var query = new Parse.Query('TestObject');
      query.equalTo('aNull', null);
      return query.find();
    }).then((results) => {
      expect(results.length).toEqual(1);
      expect(results[0].get('aNull')).toEqual(null);
      done();
    })
  });

  it('query within dictionary', (done) => {
    var objs = [];
    var promises = [];
    for (var i = 0; i < 2; i++) {
      var proc = (iter) => {
        var obj = new Parse.Object('TestObject');
        obj.set('aDict', { x: iter + 1, y: iter + 2 });
        promises.push(obj.save());
      };
      proc(i);
    }
    Promise.all(promises).then(() => {
      var query = new Parse.Query('TestObject');
      query.equalTo('aDict.x', 1);
      return query.find();
    }).then((results) => {
      expect(results.length).toEqual(1);
      done();
    }, (error) => {
      console.log(error);
    });
  });

  it('include on the wrong key type', (done) => {
    var obj = new Parse.Object('TestObject');
    obj.set('foo', 'bar');
    obj.save().then(() => {
      var query = new Parse.Query('TestObject');
      query.include('foo');
      return query.find();
    }).then((results) => {
      console.log('results:', results);
      fail('Should have failed to query.');
      done();
    }, (error) => {
      done();
    });
  });

  it('query match on array with single object', (done) => {
    var target = {__type: 'Pointer', className: 'TestObject', objectId: 'abc123'};
    var obj = new Parse.Object('TestObject');
    obj.set('someObjs', [target]);
    obj.save().then(() => {
      var query = new Parse.Query('TestObject');
      query.equalTo('someObjs', target);
      return query.find();
    }).then((results) => {
      expect(results.length).toEqual(1);
      done();
    }, (error) => {
      console.log(error);
    });
  });

  it('query match on array with multiple objects', (done) => {
    var target1 = {__type: 'Pointer', className: 'TestObject', objectId: 'abc'};
    var target2 = {__type: 'Pointer', className: 'TestObject', objectId: '123'};
    var obj= new Parse.Object('TestObject');
    obj.set('someObjs', [target1, target2]);
    obj.save().then(() => {
      var query = new Parse.Query('TestObject');
      query.equalTo('someObjs', target1);
      return query.find();
    }).then((results) => {
      expect(results.length).toEqual(1);
      done();
    }, (error) => {
      console.log(error);
    });
  });

  // #371
  it('should properly interpret a query', (done) => {
    var query = new Parse.Query("C1");
    var auxQuery = new Parse.Query("C1");
    query.matchesKeyInQuery("A1", "A2", auxQuery);
    query.include("A3");
    query.include("A2");
    query.find().then((result) => {
      done();
    }, (err) => {
      console.error(err);
      fail("should not failt");
      done();
    })
  });

  it('should properly interpret a query', (done) => {
    var user = new Parse.User();
    user.set("username", "foo");
    user.set("password", "bar");
    return user.save().then( (user) => {
      var objIdQuery = new Parse.Query("_User").equalTo("objectId", user.id);
      var blockedUserQuery = user.relation("blockedUsers").query();

      var aResponseQuery = new Parse.Query("MatchRelationshipActivityResponse");
      aResponseQuery.equalTo("userA", user);
      aResponseQuery.equalTo("userAResponse", 1);

      var bResponseQuery = new Parse.Query("MatchRelationshipActivityResponse");
      bResponseQuery.equalTo("userB", user);
      bResponseQuery.equalTo("userBResponse", 1);

      var matchOr = Parse.Query.or(aResponseQuery, bResponseQuery);
      var matchRelationshipA = new Parse.Query("_User");
      matchRelationshipA.matchesKeyInQuery("objectId", "userAObjectId", matchOr);
      var matchRelationshipB = new Parse.Query("_User");
      matchRelationshipB.matchesKeyInQuery("objectId", "userBObjectId", matchOr);


      var orQuery = Parse.Query.or(objIdQuery, blockedUserQuery, matchRelationshipA, matchRelationshipB);
      var query = new Parse.Query("_User");
      query.doesNotMatchQuery("objectId", orQuery);
      return query.find();
    }).then((res) => {
      done();
      done();
    }, (err) => {
      console.error(err);
      fail("should not fail");
      done();
    });


  });

  it('should find objects with array of pointers', (done) => {
    var objects = [];
    while(objects.length != 5) {
      var object = new Parse.Object('ContainedObject');
      object.set('index', objects.length);
      objects.push(object);
    }

    Parse.Object.saveAll(objects).then((objects) => {
      var container = new Parse.Object('Container');
      var pointers = objects.map((obj) => {
        return {
           __type: 'Pointer',
           className: 'ContainedObject',
           objectId: obj.id
        }
      })
      container.set('objects', pointers);
      let container2 = new Parse.Object('Container');
      container2.set('objects', pointers.slice(2, 3));
      return Parse.Object.saveAll([container, container2]);
    }).then(() => {
      let inQuery = new Parse.Query('ContainedObject');
      inQuery.greaterThanOrEqualTo('index', 1);
      let query = new Parse.Query('Container');
      query.matchesQuery('objects', inQuery);
      return query.find();
    }).then((results) => {
      if (results) {
        expect(results.length).toBe(2);
      }
      done();
    }).fail((err) => {
      console.error(err);
      fail('should not fail');
      done();
    })
  })

});
