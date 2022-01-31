// This is a port of the test suite:
// hungry/js/test/parse_acl_test.js
const rest = require('../lib/rest');
const Config = require('../lib/Config');
const auth = require('../lib/Auth');

describe('Parse.ACL', () => {
  it('acl must be valid', done => {
    const user = new Parse.User();
    ok(
      !user.setACL("Ceci n'est pas un ACL.", {
        error: function (user, error) {
          equal(error.code, -1);
          done();
        },
      }),
      'setACL should have returned false.'
    );
  });

  it('refresh object with acl', async done => {
    // Create an object owned by Alice.
    const user = new Parse.User();
    user.set('username', 'alice');
    user.set('password', 'wonderland');
    await user.signUp(null);
    const object = new TestObject();
    const acl = new Parse.ACL(user);
    object.setACL(acl);
    await object.save();
    await object.fetch();
    done();
  });

  it('acl an object owned by one user and public get', async done => {
    // Create an object owned by Alice.
    const user = new Parse.User();
    user.set('username', 'alice');
    user.set('password', 'wonderland');
    await user.signUp();
    const object = new TestObject();
    const acl = new Parse.ACL(user);
    object.setACL(acl);
    await object.save();
    equal(object.getACL().getReadAccess(user), true);
    equal(object.getACL().getWriteAccess(user), true);
    equal(object.getACL().getPublicReadAccess(), false);
    equal(object.getACL().getPublicWriteAccess(), false);
    ok(object.get('ACL'));
    await Parse.User.logOut();
    const query = new Parse.Query(TestObject);
    try {
      await query.get(object.id);
      done.fail('Should not have retrieved the object.');
    } catch (error) {
      equal(error.code, Parse.Error.OBJECT_NOT_FOUND);
      done();
    }
  });

  it('acl an object owned by one user and public find', async done => {
    // Create an object owned by Alice.
    const user = new Parse.User();
    user.set('username', 'alice');
    user.set('password', 'wonderland');
    await user.signUp();

    const object = new TestObject();
    const acl = new Parse.ACL(user);
    object.setACL(acl);
    await object.save();
    equal(object.getACL().getReadAccess(user), true);
    equal(object.getACL().getWriteAccess(user), true);
    equal(object.getACL().getPublicReadAccess(), false);
    equal(object.getACL().getPublicWriteAccess(), false);
    ok(object.get('ACL'));

    // Start making requests by the public, which should all fail.
    await Parse.User.logOut();
    // Find
    const query = new Parse.Query(TestObject);
    const results = await query.find();
    equal(results.length, 0);
    done();
  });

  it('acl an object owned by one user and public update', async done => {
    // Create an object owned by Alice.
    const user = new Parse.User();
    user.set('username', 'alice');
    user.set('password', 'wonderland');
    await user.signUp();

    const object = new TestObject();
    const acl = new Parse.ACL(user);
    object.setACL(acl);
    await object.save();
    equal(object.getACL().getReadAccess(user), true);
    equal(object.getACL().getWriteAccess(user), true);
    equal(object.getACL().getPublicReadAccess(), false);
    equal(object.getACL().getPublicWriteAccess(), false);
    ok(object.get('ACL'));

    // Start making requests by the public, which should all fail.
    await Parse.User.logOut();
    // Update
    object.set('foo', 'bar');
    try {
      await object.save();
      done.fail('Should not have been able to update the object.');
    } catch (err) {
      equal(err.code, Parse.Error.OBJECT_NOT_FOUND);
      done();
    }
  });

  it('acl an object owned by one user and public delete', async done => {
    // Create an object owned by Alice.
    const user = new Parse.User();
    user.set('username', 'alice');
    user.set('password', 'wonderland');
    await user.signUp();

    const object = new TestObject();
    const acl = new Parse.ACL(user);
    object.setACL(acl);
    await object.save();

    equal(object.getACL().getReadAccess(user), true);
    equal(object.getACL().getWriteAccess(user), true);
    equal(object.getACL().getPublicReadAccess(), false);
    equal(object.getACL().getPublicWriteAccess(), false);
    ok(object.get('ACL'));

    // Start making requests by the public, which should all fail.
    await Parse.User.logOut();
    try {
      await object.destroy();
      done.fail('destroy should fail');
    } catch (error) {
      expect(error.code).toEqual(Parse.Error.OBJECT_NOT_FOUND);
      done();
    }
  });

  it('acl an object owned by one user and logged in get', async done => {
    // Create an object owned by Alice.
    const user = new Parse.User();
    user.set('username', 'alice');
    user.set('password', 'wonderland');
    await user.signUp();
    const object = new TestObject();
    const acl = new Parse.ACL(user);
    object.setACL(acl);
    await object.save();
    equal(object.getACL().getReadAccess(user), true);
    equal(object.getACL().getWriteAccess(user), true);
    equal(object.getACL().getPublicReadAccess(), false);
    equal(object.getACL().getPublicWriteAccess(), false);
    ok(object.get('ACL'));

    await Parse.User.logOut();
    await Parse.User.logIn('alice', 'wonderland');
    // Get
    const query = new Parse.Query(TestObject);
    const result = await query.get(object.id);
    ok(result);
    equal(result.id, object.id);
    equal(result.getACL().getReadAccess(user), true);
    equal(result.getACL().getWriteAccess(user), true);
    equal(result.getACL().getPublicReadAccess(), false);
    equal(result.getACL().getPublicWriteAccess(), false);
    ok(object.get('ACL'));
    done();
  });

  it('acl an object owned by one user and logged in find', async done => {
    // Create an object owned by Alice.
    const user = new Parse.User();
    user.set('username', 'alice');
    user.set('password', 'wonderland');
    await user.signUp();
    const object = new TestObject();
    const acl = new Parse.ACL(user);
    object.setACL(acl);
    await object.save();
    equal(object.getACL().getReadAccess(user), true);
    equal(object.getACL().getWriteAccess(user), true);
    equal(object.getACL().getPublicReadAccess(), false);
    equal(object.getACL().getPublicWriteAccess(), false);
    ok(object.get('ACL'));
    await Parse.User.logOut();
    await Parse.User.logIn('alice', 'wonderland');
    // Find
    const query = new Parse.Query(TestObject);
    const results = await query.find();
    equal(results.length, 1);
    const result = results[0];
    ok(result);
    if (!result) {
      return fail();
    }
    equal(result.id, object.id);
    equal(result.getACL().getReadAccess(user), true);
    equal(result.getACL().getWriteAccess(user), true);
    equal(result.getACL().getPublicReadAccess(), false);
    equal(result.getACL().getPublicWriteAccess(), false);
    ok(object.get('ACL'));
    done();
  });

  it('acl an object owned by one user and logged in update', async done => {
    // Create an object owned by Alice.
    const user = new Parse.User();
    user.set('username', 'alice');
    user.set('password', 'wonderland');
    await user.signUp();
    const object = new TestObject();
    const acl = new Parse.ACL(user);
    object.setACL(acl);
    await object.save();
    equal(object.getACL().getReadAccess(user), true);
    equal(object.getACL().getWriteAccess(user), true);
    equal(object.getACL().getPublicReadAccess(), false);
    equal(object.getACL().getPublicWriteAccess(), false);
    ok(object.get('ACL'));

    await Parse.User.logOut();
    await Parse.User.logIn('alice', 'wonderland');
    // Update
    object.set('foo', 'bar');
    await object.save();
    done();
  });

  it('acl an object owned by one user and logged in delete', async done => {
    // Create an object owned by Alice.
    const user = new Parse.User();
    user.set('username', 'alice');
    user.set('password', 'wonderland');
    await user.signUp();
    const object = new TestObject();
    const acl = new Parse.ACL(user);
    object.setACL(acl);
    await object.save();
    equal(object.getACL().getReadAccess(user), true);
    equal(object.getACL().getWriteAccess(user), true);
    equal(object.getACL().getPublicReadAccess(), false);
    equal(object.getACL().getPublicWriteAccess(), false);
    ok(object.get('ACL'));
    await Parse.User.logOut();
    await Parse.User.logIn('alice', 'wonderland');
    // Delete
    await object.destroy();
    done();
  });

  it('acl making an object publicly readable and public get', async done => {
    // Create an object owned by Alice.
    const user = new Parse.User();
    user.set('username', 'alice');
    user.set('password', 'wonderland');
    await user.signUp();
    const object = new TestObject();
    const acl = new Parse.ACL(user);
    object.setACL(acl);
    await object.save();
    equal(object.getACL().getReadAccess(user), true);
    equal(object.getACL().getWriteAccess(user), true);
    equal(object.getACL().getPublicReadAccess(), false);
    equal(object.getACL().getPublicWriteAccess(), false);
    ok(object.get('ACL'));

    // Now make it public.
    object.getACL().setPublicReadAccess(true);
    await object.save();
    equal(object.getACL().getReadAccess(user), true);
    equal(object.getACL().getWriteAccess(user), true);
    equal(object.getACL().getPublicReadAccess(), true);
    equal(object.getACL().getPublicWriteAccess(), false);
    ok(object.get('ACL'));

    await Parse.User.logOut();
    // Get
    const query = new Parse.Query(TestObject);
    const result = await query.get(object.id);
    ok(result);
    equal(result.id, object.id);
    done();
  });

  it('acl making an object publicly readable and public find', async done => {
    // Create an object owned by Alice.
    const user = new Parse.User();
    user.set('username', 'alice');
    user.set('password', 'wonderland');
    await user.signUp();
    const object = new TestObject();
    const acl = new Parse.ACL(user);
    object.setACL(acl);
    await object.save();
    equal(object.getACL().getReadAccess(user), true);
    equal(object.getACL().getWriteAccess(user), true);
    equal(object.getACL().getPublicReadAccess(), false);
    equal(object.getACL().getPublicWriteAccess(), false);
    ok(object.get('ACL'));

    // Now make it public.
    object.getACL().setPublicReadAccess(true);
    await object.save();
    equal(object.getACL().getReadAccess(user), true);
    equal(object.getACL().getWriteAccess(user), true);
    equal(object.getACL().getPublicReadAccess(), true);
    equal(object.getACL().getPublicWriteAccess(), false);
    ok(object.get('ACL'));

    await Parse.User.logOut();
    // Find
    const query = new Parse.Query(TestObject);
    const results = await query.find();
    equal(results.length, 1);
    const result = results[0];
    ok(result);
    equal(result.id, object.id);
    done();
  });

  it('acl making an object publicly readable and public update', async done => {
    // Create an object owned by Alice.
    const user = new Parse.User();
    user.set('username', 'alice');
    user.set('password', 'wonderland');
    await user.signUp();
    const object = new TestObject();
    const acl = new Parse.ACL(user);
    object.setACL(acl);
    await object.save();
    equal(object.getACL().getReadAccess(user), true);
    equal(object.getACL().getWriteAccess(user), true);
    equal(object.getACL().getPublicReadAccess(), false);
    equal(object.getACL().getPublicWriteAccess(), false);
    ok(object.get('ACL'));

    // Now make it public.
    object.getACL().setPublicReadAccess(true);
    await object.save();
    equal(object.getACL().getReadAccess(user), true);
    equal(object.getACL().getWriteAccess(user), true);
    equal(object.getACL().getPublicReadAccess(), true);
    equal(object.getACL().getPublicWriteAccess(), false);
    ok(object.get('ACL'));

    await Parse.User.logOut();
    object.set('foo', 'bar');
    object.save().then(
      () => {
        fail('the save should fail');
      },
      error => {
        expect(error.code).toEqual(Parse.Error.OBJECT_NOT_FOUND);
        done();
      }
    );
  });

  it('acl making an object publicly readable and public delete', async done => {
    // Create an object owned by Alice.
    const user = new Parse.User();
    user.set('username', 'alice');
    user.set('password', 'wonderland');
    await user.signUp();
    const object = new TestObject();
    const acl = new Parse.ACL(user);
    object.setACL(acl);
    await object.save();
    equal(object.getACL().getReadAccess(user), true);
    equal(object.getACL().getWriteAccess(user), true);
    equal(object.getACL().getPublicReadAccess(), false);
    equal(object.getACL().getPublicWriteAccess(), false);
    ok(object.get('ACL'));

    // Now make it public.
    object.getACL().setPublicReadAccess(true);
    await object.save();
    equal(object.getACL().getReadAccess(user), true);
    equal(object.getACL().getWriteAccess(user), true);
    equal(object.getACL().getPublicReadAccess(), true);
    equal(object.getACL().getPublicWriteAccess(), false);
    ok(object.get('ACL'));

    Parse.User.logOut()
      .then(() => object.destroy())
      .then(
        () => {
          fail('expected failure');
        },
        error => {
          expect(error.code).toEqual(Parse.Error.OBJECT_NOT_FOUND);
          done();
        }
      );
  });

  it('acl making an object publicly writable and public get', async done => {
    // Create an object owned by Alice.
    const user = new Parse.User();
    user.set('username', 'alice');
    user.set('password', 'wonderland');
    await user.signUp();
    const object = new TestObject();
    const acl = new Parse.ACL(user);
    object.setACL(acl);
    await object.save();
    equal(object.getACL().getReadAccess(user), true);
    equal(object.getACL().getWriteAccess(user), true);
    equal(object.getACL().getPublicReadAccess(), false);
    equal(object.getACL().getPublicWriteAccess(), false);
    ok(object.get('ACL'));

    // Now make it public.
    object.getACL().setPublicWriteAccess(true);
    await object.save();
    equal(object.getACL().getReadAccess(user), true);
    equal(object.getACL().getWriteAccess(user), true);
    equal(object.getACL().getPublicReadAccess(), false);
    equal(object.getACL().getPublicWriteAccess(), true);
    ok(object.get('ACL'));

    await Parse.User.logOut();
    // Get
    const query = new Parse.Query(TestObject);
    query
      .get(object.id)
      .then(done.fail)
      .catch(error => {
        equal(error.code, Parse.Error.OBJECT_NOT_FOUND);
        done();
      });
  });

  it('acl making an object publicly writable and public find', async done => {
    // Create an object owned by Alice.
    const user = new Parse.User();
    user.set('username', 'alice');
    user.set('password', 'wonderland');
    await user.signUp();
    const object = new TestObject();
    const acl = new Parse.ACL(user);
    object.setACL(acl);
    await object.save();
    equal(object.getACL().getReadAccess(user), true);
    equal(object.getACL().getWriteAccess(user), true);
    equal(object.getACL().getPublicReadAccess(), false);
    equal(object.getACL().getPublicWriteAccess(), false);
    ok(object.get('ACL'));

    // Now make it public.
    object.getACL().setPublicWriteAccess(true);
    await object.save();
    equal(object.getACL().getReadAccess(user), true);
    equal(object.getACL().getWriteAccess(user), true);
    equal(object.getACL().getPublicReadAccess(), false);
    equal(object.getACL().getPublicWriteAccess(), true);
    ok(object.get('ACL'));

    await Parse.User.logOut();
    // Find
    const query = new Parse.Query(TestObject);
    query.find().then(function (results) {
      equal(results.length, 0);
      done();
    });
  });

  it('acl making an object publicly writable and public update', async done => {
    // Create an object owned by Alice.
    const user = new Parse.User();
    user.set('username', 'alice');
    user.set('password', 'wonderland');
    await user.signUp();
    const object = new TestObject();
    const acl = new Parse.ACL(user);
    object.setACL(acl);
    await object.save();
    equal(object.getACL().getReadAccess(user), true);
    equal(object.getACL().getWriteAccess(user), true);
    equal(object.getACL().getPublicReadAccess(), false);
    equal(object.getACL().getPublicWriteAccess(), false);
    ok(object.get('ACL'));

    // Now make it public.
    object.getACL().setPublicWriteAccess(true);
    await object.save();
    equal(object.getACL().getReadAccess(user), true);
    equal(object.getACL().getWriteAccess(user), true);
    equal(object.getACL().getPublicReadAccess(), false);
    equal(object.getACL().getPublicWriteAccess(), true);
    ok(object.get('ACL'));

    Parse.User.logOut().then(() => {
      // Update
      object.set('foo', 'bar');
      object.save().then(done);
    });
  });

  it('acl making an object publicly writable and public delete', async done => {
    // Create an object owned by Alice.
    const user = new Parse.User();
    user.set('username', 'alice');
    user.set('password', 'wonderland');
    await user.signUp();
    const object = new TestObject();
    const acl = new Parse.ACL(user);
    object.setACL(acl);
    await object.save();
    equal(object.getACL().getReadAccess(user), true);
    equal(object.getACL().getWriteAccess(user), true);
    equal(object.getACL().getPublicReadAccess(), false);
    equal(object.getACL().getPublicWriteAccess(), false);
    ok(object.get('ACL'));

    // Now make it public.
    object.getACL().setPublicWriteAccess(true);
    await object.save();
    equal(object.getACL().getReadAccess(user), true);
    equal(object.getACL().getWriteAccess(user), true);
    equal(object.getACL().getPublicReadAccess(), false);
    equal(object.getACL().getPublicWriteAccess(), true);
    ok(object.get('ACL'));

    Parse.User.logOut().then(() => {
      // Delete
      object.destroy().then(done);
    });
  });

  it('acl making an object privately writable (#3194)', done => {
    // Create an object owned by Alice.
    let object;
    let user2;
    const user = new Parse.User();
    user.set('username', 'alice');
    user.set('password', 'wonderland');
    user
      .signUp()
      .then(() => {
        object = new TestObject();
        const acl = new Parse.ACL(user);
        acl.setPublicWriteAccess(false);
        acl.setPublicReadAccess(true);
        object.setACL(acl);
        return object.save().then(() => {
          return Parse.User.logOut();
        });
      })
      .then(() => {
        user2 = new Parse.User();
        user2.set('username', 'bob');
        user2.set('password', 'burger');
        return user2.signUp();
      })
      .then(() => {
        return object.destroy({ sessionToken: user2.getSessionToken() });
      })
      .then(
        () => {
          fail('should not be able to destroy the object');
          done();
        },
        err => {
          expect(err).not.toBeUndefined();
          done();
        }
      );
  });

  it('acl sharing with another user and get', async done => {
    // Sign in as Bob.
    const bob = await Parse.User.signUp('bob', 'pass');
    await Parse.User.logOut();

    const alice = await Parse.User.signUp('alice', 'wonderland');
    // Create an object shared by Bob and Alice.
    const object = new TestObject();
    const acl = new Parse.ACL(alice);
    acl.setWriteAccess(bob, true);
    acl.setReadAccess(bob, true);
    object.setACL(acl);
    await object.save();
    equal(object.getACL().getReadAccess(alice), true);
    equal(object.getACL().getWriteAccess(alice), true);
    equal(object.getACL().getReadAccess(bob), true);
    equal(object.getACL().getWriteAccess(bob), true);
    equal(object.getACL().getPublicReadAccess(), false);
    equal(object.getACL().getPublicWriteAccess(), false);

    // Sign in as Bob again.
    await Parse.User.logIn('bob', 'pass');
    const query = new Parse.Query(TestObject);
    query.get(object.id).then(result => {
      ok(result);
      equal(result.id, object.id);
      done();
    });
  });

  it('acl sharing with another user and find', async done => {
    // Sign in as Bob.
    const bob = await Parse.User.signUp('bob', 'pass');
    await Parse.User.logOut();
    // Sign in as Alice.
    const alice = await Parse.User.signUp('alice', 'wonderland');
    // Create an object shared by Bob and Alice.
    const object = new TestObject();
    const acl = new Parse.ACL(alice);
    acl.setWriteAccess(bob, true);
    acl.setReadAccess(bob, true);
    object.setACL(acl);
    await object.save();
    equal(object.getACL().getReadAccess(alice), true);
    equal(object.getACL().getWriteAccess(alice), true);
    equal(object.getACL().getReadAccess(bob), true);
    equal(object.getACL().getWriteAccess(bob), true);
    equal(object.getACL().getPublicReadAccess(), false);
    equal(object.getACL().getPublicWriteAccess(), false);

    // Sign in as Bob again.
    await Parse.User.logIn('bob', 'pass');
    const query = new Parse.Query(TestObject);
    query.find().then(results => {
      equal(results.length, 1);
      const result = results[0];
      ok(result);
      if (!result) {
        fail('should have result');
      } else {
        equal(result.id, object.id);
      }
      done();
    });
  });

  it('acl sharing with another user and update', async done => {
    // Sign in as Bob.
    const bob = await Parse.User.signUp('bob', 'pass');
    await Parse.User.logOut();
    // Sign in as Alice.
    const alice = await Parse.User.signUp('alice', 'wonderland');
    // Create an object shared by Bob and Alice.
    const object = new TestObject();
    const acl = new Parse.ACL(alice);
    acl.setWriteAccess(bob, true);
    acl.setReadAccess(bob, true);
    object.setACL(acl);
    await object.save();
    equal(object.getACL().getReadAccess(alice), true);
    equal(object.getACL().getWriteAccess(alice), true);
    equal(object.getACL().getReadAccess(bob), true);
    equal(object.getACL().getWriteAccess(bob), true);
    equal(object.getACL().getPublicReadAccess(), false);
    equal(object.getACL().getPublicWriteAccess(), false);

    // Sign in as Bob again.
    await Parse.User.logIn('bob', 'pass');
    object.set('foo', 'bar');
    object.save().then(done);
  });

  it('acl sharing with another user and delete', async done => {
    // Sign in as Bob.
    const bob = await Parse.User.signUp('bob', 'pass');
    await Parse.User.logOut();
    // Sign in as Alice.
    const alice = await Parse.User.signUp('alice', 'wonderland');
    // Create an object shared by Bob and Alice.
    const object = new TestObject();
    const acl = new Parse.ACL(alice);
    acl.setWriteAccess(bob, true);
    acl.setReadAccess(bob, true);
    object.setACL(acl);
    await object.save();
    equal(object.getACL().getReadAccess(alice), true);
    equal(object.getACL().getWriteAccess(alice), true);
    equal(object.getACL().getReadAccess(bob), true);
    equal(object.getACL().getWriteAccess(bob), true);
    equal(object.getACL().getPublicReadAccess(), false);
    equal(object.getACL().getPublicWriteAccess(), false);

    // Sign in as Bob again.
    await Parse.User.logIn('bob', 'pass');
    object.set('foo', 'bar');
    object.destroy().then(done);
  });

  it('acl sharing with another user and public get', async done => {
    const bob = await Parse.User.signUp('bob', 'pass');
    await Parse.User.logOut();
    // Sign in as Alice.
    const alice = await Parse.User.signUp('alice', 'wonderland');
    // Create an object shared by Bob and Alice.
    const object = new TestObject();
    const acl = new Parse.ACL(alice);
    acl.setWriteAccess(bob, true);
    acl.setReadAccess(bob, true);
    object.setACL(acl);
    await object.save();
    equal(object.getACL().getReadAccess(alice), true);
    equal(object.getACL().getWriteAccess(alice), true);
    equal(object.getACL().getReadAccess(bob), true);
    equal(object.getACL().getWriteAccess(bob), true);
    equal(object.getACL().getPublicReadAccess(), false);
    equal(object.getACL().getPublicWriteAccess(), false);
    // Start making requests by the public.
    await Parse.User.logOut();
    const query = new Parse.Query(TestObject);
    query.get(object.id).then(
      result => {
        fail(result);
      },
      error => {
        expect(error.code).toEqual(Parse.Error.OBJECT_NOT_FOUND);
        done();
      }
    );
  });

  it('acl sharing with another user and public find', async done => {
    const bob = await Parse.User.signUp('bob', 'pass');
    await Parse.User.logOut();
    // Sign in as Alice.
    const alice = await Parse.User.signUp('alice', 'wonderland');
    // Create an object shared by Bob and Alice.
    const object = new TestObject();
    const acl = new Parse.ACL(alice);
    acl.setWriteAccess(bob, true);
    acl.setReadAccess(bob, true);
    object.setACL(acl);
    await object.save();
    equal(object.getACL().getReadAccess(alice), true);
    equal(object.getACL().getWriteAccess(alice), true);
    equal(object.getACL().getReadAccess(bob), true);
    equal(object.getACL().getWriteAccess(bob), true);
    equal(object.getACL().getPublicReadAccess(), false);
    equal(object.getACL().getPublicWriteAccess(), false);

    // Start making requests by the public.
    Parse.User.logOut().then(() => {
      const query = new Parse.Query(TestObject);
      query.find().then(function (results) {
        equal(results.length, 0);
        done();
      });
    });
  });

  it('acl sharing with another user and public update', async done => {
    // Sign in as Bob.
    const bob = await Parse.User.signUp('bob', 'pass');
    await Parse.User.logOut();
    // Sign in as Alice.
    const alice = await Parse.User.signUp('alice', 'wonderland');
    // Create an object shared by Bob and Alice.
    const object = new TestObject();
    const acl = new Parse.ACL(alice);
    acl.setWriteAccess(bob, true);
    acl.setReadAccess(bob, true);
    object.setACL(acl);
    await object.save();
    equal(object.getACL().getReadAccess(alice), true);
    equal(object.getACL().getWriteAccess(alice), true);
    equal(object.getACL().getReadAccess(bob), true);
    equal(object.getACL().getWriteAccess(bob), true);
    equal(object.getACL().getPublicReadAccess(), false);
    equal(object.getACL().getPublicWriteAccess(), false);

    // Start making requests by the public.
    Parse.User.logOut().then(() => {
      object.set('foo', 'bar');
      object.save().then(
        () => {
          fail('expected failure');
        },
        error => {
          expect(error.code).toEqual(Parse.Error.OBJECT_NOT_FOUND);
          done();
        }
      );
    });
  });

  it('acl sharing with another user and public delete', async done => {
    // Sign in as Bob.
    const bob = await Parse.User.signUp('bob', 'pass');
    await Parse.User.logOut();
    // Sign in as Alice.
    const alice = await Parse.User.signUp('alice', 'wonderland');
    // Create an object shared by Bob and Alice.
    const object = new TestObject();
    const acl = new Parse.ACL(alice);
    acl.setWriteAccess(bob, true);
    acl.setReadAccess(bob, true);
    object.setACL(acl);
    await object.save();
    equal(object.getACL().getReadAccess(alice), true);
    equal(object.getACL().getWriteAccess(alice), true);
    equal(object.getACL().getReadAccess(bob), true);
    equal(object.getACL().getWriteAccess(bob), true);
    equal(object.getACL().getPublicReadAccess(), false);
    equal(object.getACL().getPublicWriteAccess(), false);

    // Start making requests by the public.
    Parse.User.logOut()
      .then(() => object.destroy())
      .then(
        () => {
          fail('expected failure');
        },
        error => {
          expect(error.code).toEqual(Parse.Error.OBJECT_NOT_FOUND);
          done();
        }
      );
  });

  it('acl saveAll with permissions', async done => {
    const alice = await Parse.User.signUp('alice', 'wonderland');
    const acl = new Parse.ACL(alice);
    const object1 = new TestObject();
    const object2 = new TestObject();
    object1.setACL(acl);
    object2.setACL(acl);
    await Parse.Object.saveAll([object1, object2]);
    equal(object1.getACL().getReadAccess(alice), true);
    equal(object1.getACL().getWriteAccess(alice), true);
    equal(object1.getACL().getPublicReadAccess(), false);
    equal(object1.getACL().getPublicWriteAccess(), false);
    equal(object2.getACL().getReadAccess(alice), true);
    equal(object2.getACL().getWriteAccess(alice), true);
    equal(object2.getACL().getPublicReadAccess(), false);
    equal(object2.getACL().getPublicWriteAccess(), false);

    // Save all the objects after updating them.
    object1.set('foo', 'bar');
    object2.set('foo', 'bar');
    await Parse.Object.saveAll([object1, object2]);
    const query = new Parse.Query(TestObject);
    query.equalTo('foo', 'bar');
    query.find().then(function (results) {
      equal(results.length, 2);
      done();
    });
  });

  it('empty acl works', async done => {
    await Parse.User.signUp('tdurden', 'mayhem', {
      ACL: new Parse.ACL(),
      foo: 'bar',
    });

    await Parse.User.logOut();
    const user = await Parse.User.logIn('tdurden', 'mayhem');
    equal(user.get('foo'), 'bar');
    done();
  });

  it('query for included object with ACL works', async done => {
    const obj1 = new Parse.Object('TestClass1');
    const obj2 = new Parse.Object('TestClass2');
    const acl = new Parse.ACL();
    acl.setPublicReadAccess(true);
    obj2.set('ACL', acl);
    obj1.set('other', obj2);
    await obj1.save();
    obj2._clearServerData();
    const query = new Parse.Query('TestClass1');
    const obj1Again = await query.first();
    ok(!obj1Again.get('other').get('ACL'));

    query.include('other');
    const obj1AgainWithInclude = await query.first();
    ok(obj1AgainWithInclude.get('other').get('ACL'));
    done();
  });

  it('restricted ACL does not have public access', done => {
    const obj = new Parse.Object('TestClassMasterACL');
    const acl = new Parse.ACL();
    obj.set('ACL', acl);
    obj
      .save()
      .then(() => {
        const query = new Parse.Query('TestClassMasterACL');
        return query.find();
      })
      .then(results => {
        ok(!results.length, 'Should not have returned object with secure ACL.');
        done();
      });
  });

  it('regression test #701', done => {
    const config = Config.get('test');
    const anonUser = {
      authData: {
        anonymous: {
          id: '00000000-0000-0000-0000-000000000001',
        },
      },
    };

    Parse.Cloud.afterSave(Parse.User, req => {
      if (!req.object.existed()) {
        const user = req.object;
        const acl = new Parse.ACL(user);
        user.setACL(acl);
        user.save(null, { useMasterKey: true }).then(user => {
          new Parse.Query('_User').get(user.objectId).then(
            () => {
              fail('should not have fetched user without public read enabled');
              done();
            },
            error => {
              expect(error.code).toEqual(Parse.Error.OBJECT_NOT_FOUND);
              done();
            }
          );
        }, done.fail);
      }
    });

    rest.create(config, auth.nobody(config), '_User', anonUser);
  });
});
