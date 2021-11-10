'use strict';
// This is a port of the test suite:
// hungry/js/test/parse_relation_test.js

const ChildObject = Parse.Object.extend({ className: 'ChildObject' });
const ParentObject = Parse.Object.extend({ className: 'ParentObject' });

describe('Parse.Relation testing', () => {
  it('simple add and remove relation', done => {
    const child = new ChildObject();
    child.set('x', 2);
    const parent = new ParentObject();
    parent.set('x', 4);
    const relation = parent.relation('child');

    child
      .save()
      .then(
        () => {
          relation.add(child);
          return parent.save();
        },
        e => {
          fail(e);
        }
      )
      .then(() => {
        return relation.query().find();
      })
      .then(list => {
        equal(list.length, 1, 'Should have gotten one element back');
        equal(list[0].id, child.id, 'Should have gotten the right value');
        ok(!parent.dirty('child'), 'The relation should not be dirty');

        relation.remove(child);
        return parent.save();
      })
      .then(() => {
        return relation.query().find();
      })
      .then(list => {
        equal(list.length, 0, 'Delete should have worked');
        ok(!parent.dirty('child'), 'The relation should not be dirty');
        done();
      });
  });

  it('query relation without schema', async () => {
    const ChildObject = Parse.Object.extend('ChildObject');
    const childObjects = [];
    for (let i = 0; i < 10; i++) {
      childObjects.push(new ChildObject({ x: i }));
    }

    await Parse.Object.saveAll(childObjects);
    const ParentObject = Parse.Object.extend('ParentObject');
    const parent = new ParentObject();
    parent.set('x', 4);
    let relation = parent.relation('child');
    relation.add(childObjects[0]);
    await parent.save();
    const parentAgain = new ParentObject();
    parentAgain.id = parent.id;
    relation = parentAgain.relation('child');
    const list = await relation.query().find();
    equal(list.length, 1, 'Should have gotten one element back');
    equal(list[0].id, childObjects[0].id, 'Should have gotten the right value');
  });

  it('relations are constructed right from query', async () => {
    const ChildObject = Parse.Object.extend('ChildObject');
    const childObjects = [];
    for (let i = 0; i < 10; i++) {
      childObjects.push(new ChildObject({ x: i }));
    }

    await Parse.Object.saveAll(childObjects);
    const ParentObject = Parse.Object.extend('ParentObject');
    const parent = new ParentObject();
    parent.set('x', 4);
    const relation = parent.relation('child');
    relation.add(childObjects[0]);
    await parent.save();
    const query = new Parse.Query(ParentObject);
    const object = await query.get(parent.id);
    const relationAgain = object.relation('child');
    const list = await relationAgain.query().find();
    equal(list.length, 1, 'Should have gotten one element back');
    equal(list[0].id, childObjects[0].id, 'Should have gotten the right value');
    ok(!parent.dirty('child'), 'The relation should not be dirty');
  });

  it('compound add and remove relation', done => {
    const ChildObject = Parse.Object.extend('ChildObject');
    const childObjects = [];
    for (let i = 0; i < 10; i++) {
      childObjects.push(new ChildObject({ x: i }));
    }

    let parent;
    let relation;

    Parse.Object.saveAll(childObjects)
      .then(function () {
        const ParentObject = Parse.Object.extend('ParentObject');
        parent = new ParentObject();
        parent.set('x', 4);
        relation = parent.relation('child');
        relation.add(childObjects[0]);
        relation.add(childObjects[1]);
        relation.remove(childObjects[0]);
        relation.add(childObjects[2]);
        return parent.save();
      })
      .then(function () {
        return relation.query().find();
      })
      .then(function (list) {
        equal(list.length, 2, 'Should have gotten two elements back');
        ok(!parent.dirty('child'), 'The relation should not be dirty');
        relation.remove(childObjects[1]);
        relation.remove(childObjects[2]);
        relation.add(childObjects[1]);
        relation.add(childObjects[0]);
        return parent.save();
      })
      .then(function () {
        return relation.query().find();
      })
      .then(
        function (list) {
          equal(list.length, 2, 'Deletes and then adds should have worked');
          ok(!parent.dirty('child'), 'The relation should not be dirty');
          done();
        },
        function (err) {
          ok(false, err.message);
          done();
        }
      );
  });

  it('related at ordering optimizations', done => {
    const ChildObject = Parse.Object.extend('ChildObject');
    const childObjects = [];
    for (let i = 0; i < 10; i++) {
      childObjects.push(new ChildObject({ x: i }));
    }

    let parent;
    let relation;

    Parse.Object.saveAll(childObjects)
      .then(function () {
        const ParentObject = Parse.Object.extend('ParentObject');
        parent = new ParentObject();
        parent.set('x', 4);
        relation = parent.relation('child');
        relation.add(childObjects);
        return parent.save();
      })
      .then(function () {
        const query = relation.query();
        query.descending('createdAt');
        query.skip(1);
        query.limit(3);
        return query.find();
      })
      .then(function (list) {
        expect(list.length).toBe(3);
      })
      .then(done, done.fail);
  });

  it('queries with relations', async () => {
    const ChildObject = Parse.Object.extend('ChildObject');
    const childObjects = [];
    for (let i = 0; i < 10; i++) {
      childObjects.push(new ChildObject({ x: i }));
    }

    await Parse.Object.saveAll(childObjects);
    const ParentObject = Parse.Object.extend('ParentObject');
    const parent = new ParentObject();
    parent.set('x', 4);
    const relation = parent.relation('child');
    relation.add(childObjects[0]);
    relation.add(childObjects[1]);
    relation.add(childObjects[2]);
    await parent.save();
    const query = relation.query();
    query.equalTo('x', 2);
    const list = await query.find();
    equal(list.length, 1, 'There should only be one element');
    ok(list[0] instanceof ChildObject, 'Should be of type ChildObject');
    equal(list[0].id, childObjects[2].id, 'We should have gotten back the right result');
  });

  it('queries on relation fields', async () => {
    const ChildObject = Parse.Object.extend('ChildObject');
    const childObjects = [];
    for (let i = 0; i < 10; i++) {
      childObjects.push(new ChildObject({ x: i }));
    }

    await Parse.Object.saveAll(childObjects);
    const ParentObject = Parse.Object.extend('ParentObject');
    const parent = new ParentObject();
    parent.set('x', 4);
    const relation = parent.relation('child');
    relation.add(childObjects[0]);
    relation.add(childObjects[1]);
    relation.add(childObjects[2]);
    const parent2 = new ParentObject();
    parent2.set('x', 3);
    const relation2 = parent2.relation('child');
    relation2.add(childObjects[4]);
    relation2.add(childObjects[5]);
    relation2.add(childObjects[6]);
    const parents = [];
    parents.push(parent);
    parents.push(parent2);
    await Parse.Object.saveAll(parents);
    const query = new Parse.Query(ParentObject);
    const objects = [];
    objects.push(childObjects[4]);
    objects.push(childObjects[9]);
    const list = await query.containedIn('child', objects).find();
    equal(list.length, 1, 'There should be only one result');
    equal(list[0].id, parent2.id, 'Should have gotten back the right result');
  });

  it('queries on relation fields with multiple containedIn (regression test for #1271)', done => {
    const ChildObject = Parse.Object.extend('ChildObject');
    const childObjects = [];
    for (let i = 0; i < 10; i++) {
      childObjects.push(new ChildObject({ x: i }));
    }

    Parse.Object.saveAll(childObjects)
      .then(() => {
        const ParentObject = Parse.Object.extend('ParentObject');
        const parent = new ParentObject();
        parent.set('x', 4);
        const parent1Children = parent.relation('child');
        parent1Children.add(childObjects[0]);
        parent1Children.add(childObjects[1]);
        parent1Children.add(childObjects[2]);
        const parent2 = new ParentObject();
        parent2.set('x', 3);
        const parent2Children = parent2.relation('child');
        parent2Children.add(childObjects[4]);
        parent2Children.add(childObjects[5]);
        parent2Children.add(childObjects[6]);

        const parent2OtherChildren = parent2.relation('otherChild');
        parent2OtherChildren.add(childObjects[0]);
        parent2OtherChildren.add(childObjects[1]);
        parent2OtherChildren.add(childObjects[2]);

        return Parse.Object.saveAll([parent, parent2]);
      })
      .then(() => {
        const objectsWithChild0InBothChildren = new Parse.Query(ParentObject);
        objectsWithChild0InBothChildren.containedIn('child', [childObjects[0]]);
        objectsWithChild0InBothChildren.containedIn('otherChild', [childObjects[0]]);
        return objectsWithChild0InBothChildren.find();
      })
      .then(objectsWithChild0InBothChildren => {
        //No parent has child 0 in both it's "child" and "otherChild" field;
        expect(objectsWithChild0InBothChildren.length).toEqual(0);
      })
      .then(() => {
        const objectsWithChild4andOtherChild1 = new Parse.Query(ParentObject);
        objectsWithChild4andOtherChild1.containedIn('child', [childObjects[4]]);
        objectsWithChild4andOtherChild1.containedIn('otherChild', [childObjects[1]]);
        return objectsWithChild4andOtherChild1.find();
      })
      .then(objects => {
        // parent2 has child 4 and otherChild 1
        expect(objects.length).toEqual(1);
        done();
      });
  });

  it('query on pointer and relation fields with equal', done => {
    const ChildObject = Parse.Object.extend('ChildObject');
    const childObjects = [];
    for (let i = 0; i < 10; i++) {
      childObjects.push(new ChildObject({ x: i }));
    }

    Parse.Object.saveAll(childObjects)
      .then(() => {
        const ParentObject = Parse.Object.extend('ParentObject');
        const parent = new ParentObject();
        parent.set('x', 4);
        const relation = parent.relation('toChilds');
        relation.add(childObjects[0]);
        relation.add(childObjects[1]);
        relation.add(childObjects[2]);

        const parent2 = new ParentObject();
        parent2.set('x', 3);
        parent2.set('toChild', childObjects[2]);

        const parents = [];
        parents.push(parent);
        parents.push(parent2);
        parents.push(new ParentObject());

        return Parse.Object.saveAll(parents).then(() => {
          const query = new Parse.Query(ParentObject);
          query.equalTo('objectId', parent.id);
          query.equalTo('toChilds', childObjects[2]);

          return query.find().then(list => {
            equal(list.length, 1, 'There should be 1 result');
            done();
          });
        });
      })
      .catch(err => {
        jfail(err);
        done();
      });
  });

  it('query on pointer and relation fields with equal bis', done => {
    const ChildObject = Parse.Object.extend('ChildObject');
    const childObjects = [];
    for (let i = 0; i < 10; i++) {
      childObjects.push(new ChildObject({ x: i }));
    }

    Parse.Object.saveAll(childObjects).then(() => {
      const ParentObject = Parse.Object.extend('ParentObject');
      const parent = new ParentObject();
      parent.set('x', 4);
      const relation = parent.relation('toChilds');
      relation.add(childObjects[0]);
      relation.add(childObjects[1]);
      relation.add(childObjects[2]);

      const parent2 = new ParentObject();
      parent2.set('x', 3);
      parent2.relation('toChilds').add(childObjects[2]);

      const parents = [];
      parents.push(parent);
      parents.push(parent2);
      parents.push(new ParentObject());

      return Parse.Object.saveAll(parents).then(() => {
        const query = new Parse.Query(ParentObject);
        query.equalTo('objectId', parent2.id);
        // childObjects[2] is in 2 relations
        // before the fix, that woul yield 2 results
        query.equalTo('toChilds', childObjects[2]);

        return query.find().then(list => {
          equal(list.length, 1, 'There should be 1 result');
          done();
        });
      });
    });
  });

  it('or queries on pointer and relation fields', done => {
    const ChildObject = Parse.Object.extend('ChildObject');
    const childObjects = [];
    for (let i = 0; i < 10; i++) {
      childObjects.push(new ChildObject({ x: i }));
    }

    Parse.Object.saveAll(childObjects).then(() => {
      const ParentObject = Parse.Object.extend('ParentObject');
      const parent = new ParentObject();
      parent.set('x', 4);
      const relation = parent.relation('toChilds');
      relation.add(childObjects[0]);
      relation.add(childObjects[1]);
      relation.add(childObjects[2]);

      const parent2 = new ParentObject();
      parent2.set('x', 3);
      parent2.set('toChild', childObjects[2]);

      const parents = [];
      parents.push(parent);
      parents.push(parent2);
      parents.push(new ParentObject());

      return Parse.Object.saveAll(parents).then(() => {
        const query1 = new Parse.Query(ParentObject);
        query1.containedIn('toChilds', [childObjects[2]]);
        const query2 = new Parse.Query(ParentObject);
        query2.equalTo('toChild', childObjects[2]);
        const query = Parse.Query.or(query1, query2);
        return query.find().then(list => {
          const objectIds = list.map(function (item) {
            return item.id;
          });
          expect(objectIds.indexOf(parent.id)).not.toBe(-1);
          expect(objectIds.indexOf(parent2.id)).not.toBe(-1);
          equal(list.length, 2, 'There should be 2 results');
          done();
        });
      });
    });
  });

  it('Get query on relation using un-fetched parent object', done => {
    // Setup data model
    const Wheel = Parse.Object.extend('Wheel');
    const Car = Parse.Object.extend('Car');
    const origWheel = new Wheel();
    origWheel
      .save()
      .then(function () {
        const car = new Car();
        const relation = car.relation('wheels');
        relation.add(origWheel);
        return car.save();
      })
      .then(function (car) {
        // Test starts here.
        // Create an un-fetched shell car object
        const unfetchedCar = new Car();
        unfetchedCar.id = car.id;
        const relation = unfetchedCar.relation('wheels');
        const query = relation.query();

        // Parent object is un-fetched, so this will call /1/classes/Car instead
        // of /1/classes/Wheel and pass { "redirectClassNameForKey":"wheels" }.
        return query.get(origWheel.id);
      })
      .then(function (wheel) {
        // Make sure this is Wheel and not Car.
        strictEqual(wheel.className, 'Wheel');
        strictEqual(wheel.id, origWheel.id);
      })
      .then(
        function () {
          done();
        },
        function (err) {
          ok(false, 'unexpected error: ' + JSON.stringify(err));
          done();
        }
      );
  });

  it('Find query on relation using un-fetched parent object', done => {
    // Setup data model
    const Wheel = Parse.Object.extend('Wheel');
    const Car = Parse.Object.extend('Car');
    const origWheel = new Wheel();
    origWheel
      .save()
      .then(function () {
        const car = new Car();
        const relation = car.relation('wheels');
        relation.add(origWheel);
        return car.save();
      })
      .then(function (car) {
        // Test starts here.
        // Create an un-fetched shell car object
        const unfetchedCar = new Car();
        unfetchedCar.id = car.id;
        const relation = unfetchedCar.relation('wheels');
        const query = relation.query();

        // Parent object is un-fetched, so this will call /1/classes/Car instead
        // of /1/classes/Wheel and pass { "redirectClassNameForKey":"wheels" }.
        return query.find(origWheel.id);
      })
      .then(function (results) {
        // Make sure this is Wheel and not Car.
        const wheel = results[0];
        strictEqual(wheel.className, 'Wheel');
        strictEqual(wheel.id, origWheel.id);
      })
      .then(
        function () {
          done();
        },
        function (err) {
          ok(false, 'unexpected error: ' + JSON.stringify(err));
          done();
        }
      );
  });

  it('Find objects with a related object using equalTo', done => {
    // Setup the objects
    const Card = Parse.Object.extend('Card');
    const House = Parse.Object.extend('House');
    const card = new Card();
    card
      .save()
      .then(() => {
        const house = new House();
        const relation = house.relation('cards');
        relation.add(card);
        return house.save();
      })
      .then(() => {
        const query = new Parse.Query('House');
        query.equalTo('cards', card);
        return query.find();
      })
      .then(results => {
        expect(results.length).toEqual(1);
        done();
      });
  });

  it('should properly get related objects with unfetched queries', done => {
    const objects = [];
    const owners = [];
    const allObjects = [];
    // Build 10 Objects and 10 owners
    while (objects.length != 10) {
      const object = new Parse.Object('AnObject');
      object.set({
        index: objects.length,
        even: objects.length % 2 == 0,
      });
      objects.push(object);
      const owner = new Parse.Object('AnOwner');
      owners.push(owner);
      allObjects.push(object);
      allObjects.push(owner);
    }

    const anotherOwner = new Parse.Object('AnotherOwner');

    return Parse.Object.saveAll(allObjects.concat([anotherOwner]))
      .then(() => {
        // put all the AnObject into the anotherOwner relationKey
        anotherOwner.relation('relationKey').add(objects);
        // Set each object[i] into owner[i];
        owners.forEach((owner, i) => {
          owner.set('key', objects[i]);
        });
        return Parse.Object.saveAll(owners.concat([anotherOwner]));
      })
      .then(() => {
        // Query on the relation of another owner
        const object = new Parse.Object('AnotherOwner');
        object.id = anotherOwner.id;
        const relationQuery = object.relation('relationKey').query();
        // Just get the even ones
        relationQuery.equalTo('even', true);
        // Make the query on anOwner
        const query = new Parse.Query('AnOwner');
        // where key match the relation query.
        query.matchesQuery('key', relationQuery);
        query.include('key');
        return query.find();
      })
      .then(results => {
        expect(results.length).toBe(5);
        results.forEach(result => {
          expect(result.get('key').get('even')).toBe(true);
        });
        return Promise.resolve();
      })
      .then(() => {
        // Query on the relation of another owner
        const object = new Parse.Object('AnotherOwner');
        object.id = anotherOwner.id;
        const relationQuery = object.relation('relationKey').query();
        // Just get the even ones
        relationQuery.equalTo('even', true);
        // Make the query on anOwner
        const query = new Parse.Query('AnOwner');
        // where key match the relation query.
        query.doesNotMatchQuery('key', relationQuery);
        query.include('key');
        return query.find();
      })
      .then(
        results => {
          expect(results.length).toBe(5);
          results.forEach(result => {
            expect(result.get('key').get('even')).toBe(false);
          });
          done();
        },
        e => {
          fail(JSON.stringify(e));
          done();
        }
      );
  });

  it('select query', function (done) {
    const RestaurantObject = Parse.Object.extend('Restaurant');
    const PersonObject = Parse.Object.extend('Person');
    const OwnerObject = Parse.Object.extend('Owner');
    const restaurants = [
      new RestaurantObject({ ratings: 5, location: 'Djibouti' }),
      new RestaurantObject({ ratings: 3, location: 'Ouagadougou' }),
    ];
    const persons = [
      new PersonObject({ name: 'Bob', hometown: 'Djibouti' }),
      new PersonObject({ name: 'Tom', hometown: 'Ouagadougou' }),
      new PersonObject({ name: 'Billy', hometown: 'Detroit' }),
    ];
    const owner = new OwnerObject({ name: 'Joe' });
    const allObjects = [owner].concat(restaurants).concat(persons);
    expect(allObjects.length).toEqual(6);
    Parse.Object.saveAll([owner].concat(restaurants).concat(persons))
      .then(function () {
        owner.relation('restaurants').add(restaurants);
        return owner.save();
      })
      .then(
        async () => {
          const unfetchedOwner = new OwnerObject();
          unfetchedOwner.id = owner.id;
          const query = unfetchedOwner.relation('restaurants').query();
          query.greaterThan('ratings', 4);
          const mainQuery = new Parse.Query(PersonObject);
          mainQuery.matchesKeyInQuery('hometown', 'location', query);
          const results = await mainQuery.find();
          equal(results.length, 1);
          if (results.length > 0) {
            equal(results[0].get('name'), 'Bob');
          }
          done();
        },
        e => {
          fail(JSON.stringify(e));
          done();
        }
      );
  });

  it('dontSelect query', function (done) {
    const RestaurantObject = Parse.Object.extend('Restaurant');
    const PersonObject = Parse.Object.extend('Person');
    const OwnerObject = Parse.Object.extend('Owner');
    const restaurants = [
      new RestaurantObject({ ratings: 5, location: 'Djibouti' }),
      new RestaurantObject({ ratings: 3, location: 'Ouagadougou' }),
    ];
    const persons = [
      new PersonObject({ name: 'Bob', hometown: 'Djibouti' }),
      new PersonObject({ name: 'Tom', hometown: 'Ouagadougou' }),
      new PersonObject({ name: 'Billy', hometown: 'Detroit' }),
    ];
    const owner = new OwnerObject({ name: 'Joe' });
    const allObjects = [owner].concat(restaurants).concat(persons);
    expect(allObjects.length).toEqual(6);
    Parse.Object.saveAll([owner].concat(restaurants).concat(persons))
      .then(function () {
        owner.relation('restaurants').add(restaurants);
        return owner.save();
      })
      .then(
        async () => {
          const unfetchedOwner = new OwnerObject();
          unfetchedOwner.id = owner.id;
          const query = unfetchedOwner.relation('restaurants').query();
          query.greaterThan('ratings', 4);
          const mainQuery = new Parse.Query(PersonObject);
          mainQuery.doesNotMatchKeyInQuery('hometown', 'location', query);
          mainQuery.ascending('name');
          const results = await mainQuery.find();
          equal(results.length, 2);
          if (results.length > 0) {
            equal(results[0].get('name'), 'Billy');
            equal(results[1].get('name'), 'Tom');
          }
          done();
        },
        e => {
          fail(JSON.stringify(e));
          done();
        }
      );
  });

  it('relations are not bidirectional (regression test for #871)', done => {
    const PersonObject = Parse.Object.extend('Person');
    const p1 = new PersonObject();
    const p2 = new PersonObject();
    Parse.Object.saveAll([p1, p2]).then(results => {
      const p1 = results[0];
      const p2 = results[1];
      const relation = p1.relation('relation');
      relation.add(p2);
      p1.save().then(() => {
        const query = new Parse.Query(PersonObject);
        query.equalTo('relation', p1);
        query.find().then(results => {
          expect(results.length).toEqual(0);

          const query = new Parse.Query(PersonObject);
          query.equalTo('relation', p2);
          query.find().then(results => {
            expect(results.length).toEqual(1);
            expect(results[0].objectId).toEqual(p1.objectId);
            done();
          });
        });
      });
    });
  });

  it('can query roles in Cloud Code (regession test #1489)', done => {
    Parse.Cloud.define('isAdmin', request => {
      const query = new Parse.Query(Parse.Role);
      query.equalTo('name', 'admin');
      return query.first({ useMasterKey: true }).then(
        role => {
          const relation = new Parse.Relation(role, 'users');
          const admins = relation.query();
          admins.equalTo('username', request.user.get('username'));
          admins.first({ useMasterKey: true }).then(
            user => {
              if (user) {
                done();
              } else {
                fail('Should have found admin user, found nothing instead');
                done();
              }
            },
            () => {
              fail('User not admin');
              done();
            }
          );
        },
        error => {
          fail('Should have found admin user, errored instead');
          fail(error);
          done();
        }
      );
    });

    const adminUser = new Parse.User();
    adminUser.set('username', 'name');
    adminUser.set('password', 'pass');
    adminUser.signUp().then(
      adminUser => {
        const adminACL = new Parse.ACL();
        adminACL.setPublicReadAccess(true);

        // Create admin role
        const adminRole = new Parse.Role('admin', adminACL);
        adminRole.getUsers().add(adminUser);
        adminRole.save().then(
          () => {
            Parse.Cloud.run('isAdmin');
          },
          error => {
            fail('failed to save role');
            fail(error);
            done();
          }
        );
      },
      error => {
        fail('failed to sign up');
        fail(error);
        done();
      }
    );
  });

  it('can be saved without error', done => {
    const obj1 = new Parse.Object('PPAP');
    obj1.save().then(
      () => {
        const newRelation = obj1.relation('aRelation');
        newRelation.add(obj1);
        obj1.save().then(
          () => {
            const relation = obj1.get('aRelation');
            obj1.set('aRelation', relation);
            obj1.save().then(
              () => {
                done();
              },
              error => {
                fail('failed to save ParseRelation object');
                fail(error);
                done();
              }
            );
          },
          error => {
            fail('failed to create relation field');
            fail(error);
            done();
          }
        );
      },
      error => {
        fail('failed to save obj');
        fail(error);
        done();
      }
    );
  });

  it('ensures beforeFind on relation doesnt side effect', done => {
    const parent = new Parse.Object('Parent');
    const child = new Parse.Object('Child');
    child
      .save()
      .then(() => {
        parent.relation('children').add(child);
        return parent.save();
      })
      .then(() => {
        // We need to use a new reference otherwise the JS SDK remembers the className for a relation
        // After saves or finds
        const otherParent = new Parse.Object('Parent');
        otherParent.id = parent.id;
        return otherParent.relation('children').query().find();
      })
      .then(children => {
        // Without an after find all is good, all results have been redirected with proper className
        children.forEach(child => expect(child.className).toBe('Child'));
        // Setup the afterFind
        Parse.Cloud.afterFind('Child', req => {
          return Promise.resolve(
            req.objects.map(child => {
              child.set('afterFound', true);
              return child;
            })
          );
        });
        const otherParent = new Parse.Object('Parent');
        otherParent.id = parent.id;
        return otherParent.relation('children').query().find();
      })
      .then(children => {
        children.forEach(child => {
          expect(child.className).toBe('Child');
          expect(child.get('afterFound')).toBe(true);
        });
      })
      .then(done)
      .catch(done.fail);
  });
});
