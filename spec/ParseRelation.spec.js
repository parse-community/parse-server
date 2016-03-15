'use strict';
// This is a port of the test suite:
// hungry/js/test/parse_relation_test.js

var ChildObject = Parse.Object.extend({className: "ChildObject"});
var ParentObject = Parse.Object.extend({className: "ParentObject"});

describe('Parse.Relation testing', () => {
  it("simple add and remove relation", (done) => {
    var child = new ChildObject();
    child.set("x", 2);
    var parent = new ParentObject();
    parent.set("x", 4);
    var relation = parent.relation("child");

    child.save().then(() => {
      relation.add(child);
      return parent.save();
    }, (e) => {
      fail(e);
    }).then(() => {
      return relation.query().find();
    }).then((list) => {
      equal(list.length, 1,
            "Should have gotten one element back");
      equal(list[0].id, child.id,
            "Should have gotten the right value");
      ok(!parent.dirty("child"),
         "The relation should not be dirty");

      relation.remove(child);
      return parent.save();
    }).then(() => {
      return relation.query().find();
    }).then((list) => {
      equal(list.length, 0,
            "Delete should have worked");
      ok(!parent.dirty("child"),
         "The relation should not be dirty");
      done();
    });
  });

  it("query relation without schema", (done) => {
    var ChildObject = Parse.Object.extend("ChildObject");
    var childObjects = [];
    for (var i = 0; i < 10; i++) {
      childObjects.push(new ChildObject({x:i}));
    };

    Parse.Object.saveAll(childObjects, expectSuccess({
      success: function(list) {
        var ParentObject = Parse.Object.extend("ParentObject");
        var parent = new ParentObject();
        parent.set("x", 4);
        var relation = parent.relation("child");
        relation.add(childObjects[0]);
        parent.save(null, expectSuccess({
          success: function() {
            var parentAgain = new ParentObject();
            parentAgain.id = parent.id;
            var relation = parentAgain.relation("child");
            relation.query().find(expectSuccess({
              success: function(list) {
                equal(list.length, 1,
                      "Should have gotten one element back");
                equal(list[0].id, childObjects[0].id,
                      "Should have gotten the right value");
                done();
              }
            }));
          }
        }));
      }
    }));
  });

  it("relations are constructed right from query", (done) => {

    var ChildObject = Parse.Object.extend("ChildObject");
    var childObjects = [];
    for (var i = 0; i < 10; i++) {
      childObjects.push(new ChildObject({x: i}));
    }

    Parse.Object.saveAll(childObjects, {
      success: function(list) {
        var ParentObject = Parse.Object.extend("ParentObject");
        var parent = new ParentObject();
        parent.set("x", 4);
        var relation = parent.relation("child");
        relation.add(childObjects[0]);
        parent.save(null, {
          success: function() {
            var query = new Parse.Query(ParentObject);
            query.get(parent.id, {
              success: function(object) {
                var relationAgain = object.relation("child");
                relationAgain.query().find({
                  success: function(list) {
                    equal(list.length, 1,
                          "Should have gotten one element back");
                    equal(list[0].id, childObjects[0].id,
                          "Should have gotten the right value");
                    ok(!parent.dirty("child"),
                       "The relation should not be dirty");
                    done();
                  },
                  error: function(list) {
                    ok(false, "This shouldn't have failed");
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

  it("compound add and remove relation", (done) => {
    var ChildObject = Parse.Object.extend("ChildObject");
    var childObjects = [];
    for (var i = 0; i < 10; i++) {
      childObjects.push(new ChildObject({x: i}));
    }

    var parent;
    var relation;

    Parse.Object.saveAll(childObjects).then(function(list) {
      var ParentObject = Parse.Object.extend('ParentObject');
      parent = new ParentObject();
      parent.set('x', 4);
      relation = parent.relation('child');
      relation.add(childObjects[0]);
      relation.add(childObjects[1]);
      relation.remove(childObjects[0]);
      relation.add(childObjects[2]);
      return parent.save();
    }).then(function() {
      return relation.query().find();
    }).then(function(list) {
      equal(list.length, 2, 'Should have gotten two elements back');
      ok(!parent.dirty('child'), 'The relation should not be dirty');
      relation.remove(childObjects[1]);
      relation.remove(childObjects[2]);
      relation.add(childObjects[1]);
      relation.add(childObjects[0]);
      return parent.save();
    }).then(function() {
      return relation.query().find();
    }).then(function(list) {
      equal(list.length, 2, 'Deletes and then adds should have worked');
      ok(!parent.dirty('child'), 'The relation should not be dirty');
      done();
    }, function(err) {
      ok(false, err.message);
      done();
    });
  });


  it("queries with relations", (done) => {

    var ChildObject = Parse.Object.extend("ChildObject");
    var childObjects = [];
    for (var i = 0; i < 10; i++) {
      childObjects.push(new ChildObject({x: i}));
    }

    Parse.Object.saveAll(childObjects, {
      success: function() {
        var ParentObject = Parse.Object.extend("ParentObject");
        var parent = new ParentObject();
        parent.set("x", 4);
        var relation = parent.relation("child");
        relation.add(childObjects[0]);
        relation.add(childObjects[1]);
        relation.add(childObjects[2]);
        parent.save(null, {
          success: function() {
            var query = relation.query();
            query.equalTo("x", 2);
            query.find({
              success: function(list) {
                equal(list.length, 1,
                      "There should only be one element");
                ok(list[0] instanceof ChildObject,
                   "Should be of type ChildObject");
                equal(list[0].id, childObjects[2].id,
                      "We should have gotten back the right result");
                done();
              }
            });
          }
        });
      }
    });
  });

  it("queries on relation fields", (done) => {
    var ChildObject = Parse.Object.extend("ChildObject");
    var childObjects = [];
    for (var i = 0; i < 10; i++) {
      childObjects.push(new ChildObject({x: i}));
    }

    Parse.Object.saveAll(childObjects, {
      success: function() {
        var ParentObject = Parse.Object.extend("ParentObject");
        var parent = new ParentObject();
        parent.set("x", 4);
        var relation = parent.relation("child");
        relation.add(childObjects[0]);
        relation.add(childObjects[1]);
        relation.add(childObjects[2]);
        var parent2 = new ParentObject();
        parent2.set("x", 3);
        var relation2 = parent2.relation("child");
        relation2.add(childObjects[4]);
        relation2.add(childObjects[5]);
        relation2.add(childObjects[6]);
        var parents = [];
        parents.push(parent);
        parents.push(parent2);
        Parse.Object.saveAll(parents, {
          success: function() {
            var query = new Parse.Query(ParentObject);
            var objects = [];
            objects.push(childObjects[4]);
            objects.push(childObjects[9]);
            query.containedIn("child", objects);
            query.find({
              success: function(list) {
                equal(list.length, 1, "There should be only one result");
                equal(list[0].id, parent2.id,
                      "Should have gotten back the right result");
                done();
              }
            });
          }
        });
      }
    });
  });

  it("queries on relation fields with multiple ins", (done) => {
    var ChildObject = Parse.Object.extend("ChildObject");
    var childObjects = [];
    for (var i = 0; i < 10; i++) {
      childObjects.push(new ChildObject({x: i}));
    }

    Parse.Object.saveAll(childObjects).then(() => {
      var ParentObject = Parse.Object.extend("ParentObject");
      var parent = new ParentObject();
      parent.set("x", 4);
      var relation = parent.relation("child");
      relation.add(childObjects[0]);
      relation.add(childObjects[1]);
      relation.add(childObjects[2]);
      var parent2 = new ParentObject();
      parent2.set("x", 3);
      var relation2 = parent2.relation("child");
      relation2.add(childObjects[4]);
      relation2.add(childObjects[5]);
      relation2.add(childObjects[6]);

      var otherChild2 = parent2.relation("otherChild");
      otherChild2.add(childObjects[0]);
      otherChild2.add(childObjects[1]);
      otherChild2.add(childObjects[2]);

      var parents = [];
      parents.push(parent);
      parents.push(parent2);
      return Parse.Object.saveAll(parents);
    }).then(() => {
      var query = new Parse.Query(ParentObject);
      var objects = [];
      objects.push(childObjects[0]);
      query.containedIn("child", objects);
      query.containedIn("otherChild", [childObjects[0]]);
      return query.find();
    }).then((list) => {
      equal(list.length, 2, "There should be 2 results");
      done();
    });
  });

  it("query on pointer and relation fields with equal", (done) => {
    var ChildObject = Parse.Object.extend("ChildObject");
    var childObjects = [];
    for (var i = 0; i < 10; i++) {
      childObjects.push(new ChildObject({x: i}));
    }

    Parse.Object.saveAll(childObjects).then(() => {
        var ParentObject = Parse.Object.extend("ParentObject");
        var parent = new ParentObject();
        parent.set("x", 4);
        var relation = parent.relation("toChilds");
        relation.add(childObjects[0]);
        relation.add(childObjects[1]);
        relation.add(childObjects[2]);

        var parent2 = new ParentObject();
        parent2.set("x", 3);
        parent2.set("toChild", childObjects[2]);

        var parents = [];
        parents.push(parent);
        parents.push(parent2);
        parents.push(new ParentObject());

       return Parse.Object.saveAll(parents).then(() => {
          var query = new Parse.Query(ParentObject);
          query.equalTo("objectId", parent.id);
          query.equalTo("toChilds", childObjects[2]);

          return query.find().then((list) => {
            equal(list.length, 1, "There should be 1 result");
            done();
          });
        });
    });
  });

  it("query on pointer and relation fields with equal bis", (done) => {
    var ChildObject = Parse.Object.extend("ChildObject");
    var childObjects = [];
    for (var i = 0; i < 10; i++) {
      childObjects.push(new ChildObject({x: i}));
    }

    Parse.Object.saveAll(childObjects).then(() => {
        var ParentObject = Parse.Object.extend("ParentObject");
        var parent = new ParentObject();
        parent.set("x", 4);
        var relation = parent.relation("toChilds");
        relation.add(childObjects[0]);
        relation.add(childObjects[1]);
        relation.add(childObjects[2]);

        var parent2 = new ParentObject();
        parent2.set("x", 3);
        parent2.relation("toChilds").add(childObjects[2]);

        var parents = [];
        parents.push(parent);
        parents.push(parent2);
        parents.push(new ParentObject());

       return Parse.Object.saveAll(parents).then(() => {
          var query = new Parse.Query(ParentObject);
          query.equalTo("objectId", parent2.id);
          // childObjects[2] is in 2 relations
          // before the fix, that woul yield 2 results
          query.equalTo("toChilds", childObjects[2]);

          return query.find().then((list) => {
            equal(list.length, 1, "There should be 1 result");
            done();
          });
        });
    });
  });

  it("or queries on pointer and relation fields", (done) => {
    var ChildObject = Parse.Object.extend("ChildObject");
    var childObjects = [];
    for (var i = 0; i < 10; i++) {
      childObjects.push(new ChildObject({x: i}));
    }

    Parse.Object.saveAll(childObjects).then(() => {
        var ParentObject = Parse.Object.extend("ParentObject");
        var parent = new ParentObject();
        parent.set("x", 4);
        var relation = parent.relation("toChilds");
        relation.add(childObjects[0]);
        relation.add(childObjects[1]);
        relation.add(childObjects[2]);

        var parent2 = new ParentObject();
        parent2.set("x", 3);
        parent2.set("toChild", childObjects[2]);

        var parents = [];
        parents.push(parent);
        parents.push(parent2);
        parents.push(new ParentObject());

       return Parse.Object.saveAll(parents).then(() => {
          var query1 = new Parse.Query(ParentObject);
          query1.containedIn("toChilds", [childObjects[2]]);
          var query2 = new Parse.Query(ParentObject);
          query2.equalTo("toChild", childObjects[2]);
          var query = Parse.Query.or(query1, query2);
          return query.find().then((list) => {
            var objectIds = list.map(function(item){
              return item.id;
            });
            expect(objectIds.indexOf(parent.id)).not.toBe(-1);
            expect(objectIds.indexOf(parent2.id)).not.toBe(-1);
            equal(list.length, 2, "There should be 2 results");
            done();
          });
        });
    });
  });


  it("Get query on relation using un-fetched parent object", (done) => {
    // Setup data model
    var Wheel = Parse.Object.extend('Wheel');
    var Car = Parse.Object.extend('Car');
    var origWheel = new Wheel();
    origWheel.save().then(function() {
      var car = new Car();
      var relation = car.relation('wheels');
      relation.add(origWheel);
      return car.save();
    }).then(function(car) {
      // Test starts here.
      // Create an un-fetched shell car object
      var unfetchedCar = new Car();
      unfetchedCar.id = car.id;
      var relation = unfetchedCar.relation('wheels');
      var query = relation.query();

      // Parent object is un-fetched, so this will call /1/classes/Car instead
      // of /1/classes/Wheel and pass { "redirectClassNameForKey":"wheels" }.
      return query.get(origWheel.id);
    }).then(function(wheel) {
      // Make sure this is Wheel and not Car.
      strictEqual(wheel.className, 'Wheel');
      strictEqual(wheel.id, origWheel.id);
    }).then(function() {
      done();
    },function(err) {
      ok(false, 'unexpected error: ' + JSON.stringify(err));
      done();
    });
  });

  it("Find query on relation using un-fetched parent object", (done) => {
    // Setup data model
    var Wheel = Parse.Object.extend('Wheel');
    var Car = Parse.Object.extend('Car');
    var origWheel = new Wheel();
    origWheel.save().then(function() {
      var car = new Car();
      var relation = car.relation('wheels');
      relation.add(origWheel);
      return car.save();
    }).then(function(car) {
      // Test starts here.
      // Create an un-fetched shell car object
      var unfetchedCar = new Car();
      unfetchedCar.id = car.id;
      var relation = unfetchedCar.relation('wheels');
      var query = relation.query();

      // Parent object is un-fetched, so this will call /1/classes/Car instead
      // of /1/classes/Wheel and pass { "redirectClassNameForKey":"wheels" }.
      return query.find(origWheel.id);
    }).then(function(results) {
      // Make sure this is Wheel and not Car.
      var wheel = results[0];
      strictEqual(wheel.className, 'Wheel');
      strictEqual(wheel.id, origWheel.id);
    }).then(function() {
      done();
    },function(err) {
      ok(false, 'unexpected error: ' + JSON.stringify(err));
      done();
    });
  });

  it('Find objects with a related object using equalTo', (done) => {
    // Setup the objects
    var Card = Parse.Object.extend('Card');
    var House = Parse.Object.extend('House');
    var card = new Card();
    card.save().then(() => {
      var house = new House();
      var relation = house.relation('cards');
      relation.add(card);
      return house.save();
    }).then(() => {
      var query = new Parse.Query('House');
      query.equalTo('cards', card);
      return query.find();
    }).then((results) => {
      expect(results.length).toEqual(1);
      done();
    });
  });

  it('should properly get related objects with unfetched queries', (done) => {
    let objects = [];
    let owners = [];
    let allObjects = [];
    // Build 10 Objects and 10 owners
    while (objects.length != 10) {
      let object = new Parse.Object('AnObject');
      object.set({
        index: objects.length,
        even: objects.length % 2 == 0
      });
      objects.push(object);
      let owner = new Parse.Object('AnOwner');
      owners.push(owner);
      allObjects.push(object);
      allObjects.push(owner);
    }

    let anotherOwner = new Parse.Object('AnotherOwner');

    return Parse.Object.saveAll(allObjects.concat([anotherOwner])).then(() => {
      // put all the AnObject into the anotherOwner relationKey
      anotherOwner.relation('relationKey').add(objects);
      // Set each object[i] into owner[i];
      owners.forEach((owner,i) => {
        owner.set('key', objects[i]);
      });
      return Parse.Object.saveAll(owners.concat([anotherOwner]));
    }).then(() => {
      // Query on the relation of another owner
      let object = new Parse.Object('AnotherOwner');
      object.id = anotherOwner.id;
      let relationQuery = object.relation('relationKey').query();
      // Just get the even ones
      relationQuery.equalTo('even', true);
      // Make the query on anOwner
      let query = new Parse.Query('AnOwner');
      // where key match the relation query.
      query.matchesQuery('key', relationQuery);
      query.include('key');
      return query.find();
    }).then((results) => {
      expect(results.length).toBe(5);
      results.forEach((result) => {
        expect(result.get('key').get('even')).toBe(true);
      });
      return Promise.resolve();
    }).then(() => {
      // Query on the relation of another owner
      let object = new Parse.Object('AnotherOwner');
      object.id = anotherOwner.id;
      let relationQuery = object.relation('relationKey').query();
      // Just get the even ones
      relationQuery.equalTo('even', true);
      // Make the query on anOwner
      let query = new Parse.Query('AnOwner');
      // where key match the relation query.
      query.doesNotMatchQuery('key', relationQuery);
      query.include('key');
      return query.find();
    }).then((results) => {
      expect(results.length).toBe(5);
      results.forEach((result) => {
        expect(result.get('key').get('even')).toBe(false);
      });
      done();
    })
  });

  it("select query", function(done) {
    var RestaurantObject = Parse.Object.extend("Restaurant");
    var PersonObject = Parse.Object.extend("Person");
    var OwnerObject = Parse.Object.extend('Owner');
    var restaurants = [
      new RestaurantObject({ ratings: 5, location: "Djibouti" }),
      new RestaurantObject({ ratings: 3, location: "Ouagadougou" }),
    ];
    let persons = [
      new PersonObject({ name: "Bob", hometown: "Djibouti" }),
      new PersonObject({ name: "Tom", hometown: "Ouagadougou" }),
      new PersonObject({ name: "Billy", hometown: "Detroit" }),
    ];
    let owner = new OwnerObject({name: 'Joe'});
    let ownerId;
    let allObjects = [owner].concat(restaurants).concat(persons);
    expect(allObjects.length).toEqual(6);
    Parse.Object.saveAll([owner].concat(restaurants).concat(persons)).then(function() {
      ownerId = owner.id;
      owner.relation('restaurants').add(restaurants);
      return owner.save()
    }).then(() => {
      let unfetchedOwner = new OwnerObject();
      unfetchedOwner.id = owner.id;
      var query = unfetchedOwner.relation('restaurants').query();
      query.greaterThan("ratings", 4);
      var mainQuery = new Parse.Query(PersonObject);
      mainQuery.matchesKeyInQuery("hometown", "location", query);
      mainQuery.find(expectSuccess({
        success: function(results) {
          equal(results.length, 1);
          if (results.length > 0) {
            equal(results[0].get('name'), 'Bob');
          }
          done();
        }
      }));
    });
  });

  it("dontSelect query", function(done) {
    var RestaurantObject = Parse.Object.extend("Restaurant");
    var PersonObject = Parse.Object.extend("Person");
    var OwnerObject = Parse.Object.extend('Owner');
    var restaurants = [
      new RestaurantObject({ ratings: 5, location: "Djibouti" }),
      new RestaurantObject({ ratings: 3, location: "Ouagadougou" }),
    ];
    let persons = [
      new PersonObject({ name: "Bob", hometown: "Djibouti" }),
      new PersonObject({ name: "Tom", hometown: "Ouagadougou" }),
      new PersonObject({ name: "Billy", hometown: "Detroit" }),
    ];
    let owner = new OwnerObject({name: 'Joe'});
    let ownerId;
    let allObjects = [owner].concat(restaurants).concat(persons);
    expect(allObjects.length).toEqual(6);
    Parse.Object.saveAll([owner].concat(restaurants).concat(persons)).then(function() {
      ownerId = owner.id;
      owner.relation('restaurants').add(restaurants);
      return owner.save()
    }).then(() => {
      let unfetchedOwner = new OwnerObject();
      unfetchedOwner.id = owner.id;
      var query = unfetchedOwner.relation('restaurants').query();
      query.greaterThan("ratings", 4);
      var mainQuery = new Parse.Query(PersonObject);
      mainQuery.doesNotMatchKeyInQuery("hometown", "location", query);
      mainQuery.ascending('name');
      mainQuery.find(expectSuccess({
        success: function(results) {
          equal(results.length, 2);
          if (results.length > 0) {
            equal(results[0].get('name'), 'Billy');
            equal(results[1].get('name'), 'Tom');
          }
          done();
        }
      }));
    });
  });
});
