// A bunch of different tests are in here - it isn't very thematic.
// It would probably be better to refactor them into different files.
'use strict';

var request = require('request');
const rp = require('request-promise');
const Parse = require("parse/node");
const Config = require('../src/Config');
const SchemaController = require('../src/Controllers/SchemaController');
var TestUtils = require('../src/TestUtils');

const userSchema = SchemaController.convertSchemaToAdapterSchema({ className: '_User', fields: Object.assign({}, SchemaController.defaultColumns._Default, SchemaController.defaultColumns._User) });

describe_only_db('mongo')('miscellaneous', () => {
  it('test rest_create_app', function(done) {
    var appId;
    Parse._request('POST', 'rest_create_app').then((res) => {
      expect(typeof res.application_id).toEqual('string');
      expect(res.master_key).toEqual('master');
      appId = res.application_id;
      Parse.initialize(appId, 'unused');
      var obj = new Parse.Object('TestObject');
      obj.set('foo', 'bar');
      return obj.save();
    }).then(() => {
      const config = Config.get(appId);
      return config.database.adapter.find('TestObject', { fields: {} }, {}, {});
    }).then((results) => {
      expect(results.length).toEqual(1);
      expect(results[0]['foo']).toEqual('bar');
      done();
    }).fail(error => {
      fail(JSON.stringify(error));
      done();
    })
  });
})

describe('miscellaneous', function() {
  it('create a GameScore object', function(done) {
    var obj = new Parse.Object('GameScore');
    obj.set('score', 1337);
    obj.save().then(function(obj) {
      expect(typeof obj.id).toBe('string');
      expect(typeof obj.createdAt.toGMTString()).toBe('string');
      done();
    }, error => {
      fail(JSON.stringify(error));
      done();
    });
  });

  it('get a TestObject', function(done) {
    create({ 'bloop' : 'blarg' }, function(obj) {
      var t2 = new TestObject({ objectId: obj.id });
      t2.fetch({
        success: function(obj2) {
          expect(obj2.get('bloop')).toEqual('blarg');
          expect(obj2.id).toBeTruthy();
          expect(obj2.id).toEqual(obj.id);
          done();
        },
        error: error => {
          fail(JSON.stringify(error));
          done();
        }
      });
    });
  });

  it('create a valid parse user', function(done) {
    createTestUser(function(data) {
      expect(data.id).not.toBeUndefined();
      expect(data.getSessionToken()).not.toBeUndefined();
      expect(data.get('password')).toBeUndefined();
      done();
    }, error => {
      fail(JSON.stringify(error));
      done();
    });
  });

  it('fail to create a duplicate username', done => {
    let numCreated = 0;
    let numFailed = 0;
    const p1 = createTestUser();
    p1.then(() => {
      numCreated++;
      expect(numCreated).toEqual(1);
    })
      .catch(error => {
        numFailed++;
        expect(numFailed).toEqual(1);
        expect(error.code).toEqual(Parse.Error.USERNAME_TAKEN);
      });
    const p2 = createTestUser();
    p2.then(() => {
      numCreated++;
      expect(numCreated).toEqual(1);
    })
      .catch(error => {
        numFailed++;
        expect(numFailed).toEqual(1);
        expect(error.code).toEqual(Parse.Error.USERNAME_TAKEN);
      });
    Parse.Promise.when([p1, p2])
      .then(() => {
        fail('one of the users should not have been created');
        done();
      })
      .catch(done);
  });

  it('ensure that email is uniquely indexed', done => {
    let numFailed = 0;
    let numCreated = 0;
    const user1 = new Parse.User();
    user1.setPassword('asdf');
    user1.setUsername('u1');
    user1.setEmail('dupe@dupe.dupe');
    const p1 = user1.signUp();
    p1.then(() => {
      numCreated++;
      expect(numCreated).toEqual(1);
    }, error => {
      numFailed++;
      expect(numFailed).toEqual(1);
      expect(error.code).toEqual(Parse.Error.EMAIL_TAKEN);
    });

    const user2 = new Parse.User();
    user2.setPassword('asdf');
    user2.setUsername('u2');
    user2.setEmail('dupe@dupe.dupe');
    const p2 = user2.signUp();
    p2.then(() => {
      numCreated++;
      expect(numCreated).toEqual(1);
    }, error => {
      numFailed++;
      expect(numFailed).toEqual(1);
      expect(error.code).toEqual(Parse.Error.EMAIL_TAKEN);
    });

    Parse.Promise.when([p1, p2])
      .then(() => {
        fail('one of the users should not have been created');
        done();
      })
      .catch(done);
  });

  it('ensure that if people already have duplicate users, they can still sign up new users', done => {
    const config = Config.get('test');
    // Remove existing data to clear out unique index
    TestUtils.destroyAllDataPermanently()
      .then(() => config.database.adapter.createClass('_User', userSchema))
      .then(() => config.database.adapter.createObject('_User', userSchema, { objectId: 'x', username: 'u' }).catch(fail))
      .then(() => config.database.adapter.createObject('_User', userSchema, { objectId: 'y', username: 'u' }).catch(fail))
    // Create a new server to try to recreate the unique indexes
      .then(reconfigureServer)
      .catch(error => {
        expect(error.code).toEqual(Parse.Error.DUPLICATE_VALUE);
        const user = new Parse.User();
        user.setPassword('asdf');
        user.setUsername('zxcv');
        return user.signUp().catch(fail);
      })
      .then(() => {
        const user = new Parse.User();
        user.setPassword('asdf');
        user.setUsername('u');
        return user.signUp()
      })
      .then(() => {
        fail('should not have been able to sign up');
        done();
      })
      .catch(error => {
        expect(error.code).toEqual(Parse.Error.USERNAME_TAKEN);
        done();
      })
  });

  it('ensure that if people already have duplicate emails, they can still sign up new users', done => {
    const config = Config.get('test');
    // Remove existing data to clear out unique index
    TestUtils.destroyAllDataPermanently()
      .then(() => config.database.adapter.createClass('_User', userSchema))
      .then(() => config.database.adapter.createObject('_User', userSchema, { objectId: 'x', email: 'a@b.c' }))
      .then(() => config.database.adapter.createObject('_User', userSchema, { objectId: 'y', email: 'a@b.c' }))
      .then(reconfigureServer)
      .catch(() => {
        const user = new Parse.User();
        user.setPassword('asdf');
        user.setUsername('qqq');
        user.setEmail('unique@unique.unique');
        return user.signUp().catch(fail);
      })
      .then(() => {
        const user = new Parse.User();
        user.setPassword('asdf');
        user.setUsername('www');
        user.setEmail('a@b.c');
        return user.signUp()
      })
      .catch(error => {
        expect(error.code).toEqual(Parse.Error.EMAIL_TAKEN);
        done();
      });
  });

  it('ensure that if you try to sign up a user with a unique username and email, but duplicates in some other field that has a uniqueness constraint, you get a regular duplicate value error', done => {
    const config = Config.get('test');
    config.database.adapter.addFieldIfNotExists('_User', 'randomField', { type: 'String' })
      .then(() => config.database.adapter.ensureUniqueness('_User', userSchema, ['randomField']))
      .then(() => {
        const user = new Parse.User();
        user.setPassword('asdf');
        user.setUsername('1');
        user.setEmail('1@b.c');
        user.set('randomField', 'a');
        return user.signUp()
      })
      .then(() => {
        const user = new Parse.User();
        user.setPassword('asdf');
        user.setUsername('2');
        user.setEmail('2@b.c');
        user.set('randomField', 'a');
        return user.signUp()
      })
      .catch(error => {
        expect(error.code).toEqual(Parse.Error.DUPLICATE_VALUE);
        done();
      });
  });

  it('succeed in logging in', function(done) {
    createTestUser(function(u) {
      expect(typeof u.id).toEqual('string');

      Parse.User.logIn('test', 'moon-y', {
        success: function(user) {
          expect(typeof user.id).toEqual('string');
          expect(user.get('password')).toBeUndefined();
          expect(user.getSessionToken()).not.toBeUndefined();
          Parse.User.logOut().then(done);
        }, error: error => {
          fail(JSON.stringify(error));
          done();
        }
      });
    }, fail);
  });

  it('increment with a user object', function(done) {
    createTestUser().then((user) => {
      user.increment('foo');
      return user.save();
    }).then(() => {
      return Parse.User.logIn('test', 'moon-y');
    }).then((user) => {
      expect(user.get('foo')).toEqual(1);
      user.increment('foo');
      return user.save();
    }).then(() => Parse.User.logOut())
      .then(() => Parse.User.logIn('test', 'moon-y'))
      .then((user) => {
        expect(user.get('foo')).toEqual(2);
        Parse.User.logOut()
          .then(done);
      }, (error) => {
        fail(JSON.stringify(error));
        done();
      });
  });

  it('save various data types', function(done) {
    var obj = new TestObject();
    obj.set('date', new Date());
    obj.set('array', [1, 2, 3]);
    obj.set('object', {one: 1, two: 2});
    obj.save().then(() => {
      var obj2 = new TestObject({objectId: obj.id});
      return obj2.fetch();
    }).then((obj2) => {
      expect(obj2.get('date') instanceof Date).toBe(true);
      expect(obj2.get('array') instanceof Array).toBe(true);
      expect(obj2.get('object') instanceof Array).toBe(false);
      expect(obj2.get('object') instanceof Object).toBe(true);
      done();
    });
  });

  it('query with limit', function(done) {
    var baz = new TestObject({ foo: 'baz' });
    var qux = new TestObject({ foo: 'qux' });
    baz.save().then(() => {
      return qux.save();
    }).then(() => {
      var query = new Parse.Query(TestObject);
      query.limit(1);
      return query.find();
    }).then((results) => {
      expect(results.length).toEqual(1);
      done();
    }, (error) => {
      fail(JSON.stringify(error));
      done();
    });
  });

  it('query without limit get default 100 records', function(done) {
    var objects = [];
    for (var i = 0; i < 150; i++) {
      objects.push(new TestObject({name: 'name' + i}));
    }
    Parse.Object.saveAll(objects).then(() => {
      return new Parse.Query(TestObject).find();
    }).then((results) => {
      expect(results.length).toEqual(100);
      done();
    }, error => {
      fail(JSON.stringify(error));
      done();
    });
  });

  it('basic saveAll', function(done) {
    var alpha = new TestObject({ letter: 'alpha' });
    var beta = new TestObject({ letter: 'beta' });
    Parse.Object.saveAll([alpha, beta]).then(() => {
      expect(alpha.id).toBeTruthy();
      expect(beta.id).toBeTruthy();
      return new Parse.Query(TestObject).find();
    }).then((results) => {
      expect(results.length).toEqual(2);
      done();
    }, (error) => {
      fail(error);
      done();
    });
  });

  it('test beforeSave set object acl success', function(done) {
    var acl = new Parse.ACL({
      '*': { read: true, write: false }
    });
    Parse.Cloud.beforeSave('BeforeSaveAddACL', function(req, res) {
      req.object.setACL(acl);
      res.success();
    });

    var obj = new Parse.Object('BeforeSaveAddACL');
    obj.set('lol', true);
    obj.save().then(function() {
      var query = new Parse.Query('BeforeSaveAddACL');
      query.get(obj.id).then(function(objAgain) {
        expect(objAgain.get('lol')).toBeTruthy();
        expect(objAgain.getACL().equals(acl));
        done();
      }, function(error) {
        fail(error);
        done();
      });
    }, error => {
      fail(JSON.stringify(error));
      done();
    });
  });

  it('object is set on create and update', done => {
    let triggerTime = 0;
    // Register a mock beforeSave hook
    Parse.Cloud.beforeSave('GameScore', (req, res) => {
      const object = req.object;
      expect(object instanceof Parse.Object).toBeTruthy();
      expect(object.get('fooAgain')).toEqual('barAgain');
      if (triggerTime == 0) {
        // Create
        expect(object.get('foo')).toEqual('bar');
        // No objectId/createdAt/updatedAt
        expect(object.id).toBeUndefined();
        expect(object.createdAt).toBeUndefined();
        expect(object.updatedAt).toBeUndefined();
      } else if (triggerTime == 1) {
        // Update
        expect(object.get('foo')).toEqual('baz');
        expect(object.id).not.toBeUndefined();
        expect(object.createdAt).not.toBeUndefined();
        expect(object.updatedAt).not.toBeUndefined();
      } else {
        res.error();
      }
      triggerTime++;
      res.success();
    });

    const obj = new Parse.Object('GameScore');
    obj.set('foo', 'bar');
    obj.set('fooAgain', 'barAgain');
    obj.save().then(() => {
      // We only update foo
      obj.set('foo', 'baz');
      return obj.save();
    }).then(() => {
      // Make sure the checking has been triggered
      expect(triggerTime).toBe(2);
      done();
    }, error => {
      fail(error);
      done();
    });
  });
  it('works when object is passed to success', done => {
    let triggerTime = 0;
    // Register a mock beforeSave hook
    Parse.Cloud.beforeSave('GameScore', (req, res) => {
      const object = req.object;
      object.set('foo', 'bar');
      triggerTime++;
      res.success(object);
    });

    const obj = new Parse.Object('GameScore');
    obj.set('foo', 'baz');
    obj.save().then(() => {
      expect(triggerTime).toBe(1);
      expect(obj.get('foo')).toEqual('bar');
      done();
    }, error => {
      fail(error);
      done();
    });
  });

  it('original object is set on update', done => {
    let triggerTime = 0;
    // Register a mock beforeSave hook
    Parse.Cloud.beforeSave('GameScore', (req, res) => {
      const object = req.object;
      expect(object instanceof Parse.Object).toBeTruthy();
      expect(object.get('fooAgain')).toEqual('barAgain');
      const originalObject = req.original;
      if (triggerTime == 0) {
        // No id/createdAt/updatedAt
        expect(object.id).toBeUndefined();
        expect(object.createdAt).toBeUndefined();
        expect(object.updatedAt).toBeUndefined();
        // Create
        expect(object.get('foo')).toEqual('bar');
        // Check the originalObject is undefined
        expect(originalObject).toBeUndefined();
      } else if (triggerTime == 1) {
        // Update
        expect(object.id).not.toBeUndefined();
        expect(object.createdAt).not.toBeUndefined();
        expect(object.updatedAt).not.toBeUndefined();
        expect(object.get('foo')).toEqual('baz');
        // Check the originalObject
        expect(originalObject instanceof Parse.Object).toBeTruthy();
        expect(originalObject.get('fooAgain')).toEqual('barAgain');
        expect(originalObject.id).not.toBeUndefined();
        expect(originalObject.createdAt).not.toBeUndefined();
        expect(originalObject.updatedAt).not.toBeUndefined();
        expect(originalObject.get('foo')).toEqual('bar');
      } else {
        res.error();
      }
      triggerTime++;
      res.success();
    });

    const obj = new Parse.Object('GameScore');
    obj.set('foo', 'bar');
    obj.set('fooAgain', 'barAgain');
    obj.save().then(() => {
      // We only update foo
      obj.set('foo', 'baz');
      return obj.save();
    }).then(() => {
      // Make sure the checking has been triggered
      expect(triggerTime).toBe(2);
      done();
    }, error => {
      fail(error);
      done();
    });
  });

  it('pointer mutation properly saves object', done => {
    const className = 'GameScore';

    Parse.Cloud.beforeSave(className, (req, res) => {
      const object = req.object;
      expect(object instanceof Parse.Object).toBeTruthy();

      const child = object.get('child');
      expect(child instanceof Parse.Object).toBeTruthy();
      child.set('a', 'b');
      child.save().then(() => {
        res.success();
      });
    });

    const obj = new Parse.Object(className);
    obj.set('foo', 'bar');

    const child = new Parse.Object('Child');
    child.save().then(() => {
      obj.set('child', child);
      return obj.save();
    }).then(() => {
      const query = new Parse.Query(className);
      query.include('child');
      return query.get(obj.id).then(objAgain => {
        expect(objAgain.get('foo')).toEqual('bar');

        const childAgain = objAgain.get('child');
        expect(childAgain instanceof Parse.Object).toBeTruthy();
        expect(childAgain.get('a')).toEqual('b');

        return Promise.resolve();
      });
    }).then(() => {
      done();
    }, error => {
      fail(error);
      done();
    });
  });

  it('pointer reassign is working properly (#1288)', (done) => {
    Parse.Cloud.beforeSave('GameScore', (req, res) => {

      var obj = req.object;
      if (obj.get('point')) {
        return res.success();
      }
      var TestObject1 = Parse.Object.extend('TestObject1');
      var newObj = new TestObject1({'key1': 1});

      return newObj.save().then((newObj) => {
        obj.set('point' , newObj);
        res.success();
      });
    });
    var pointId;
    var obj = new Parse.Object('GameScore');
    obj.set('foo', 'bar');
    obj.save().then(() => {
      expect(obj.get('point')).not.toBeUndefined();
      pointId = obj.get('point').id;
      expect(pointId).not.toBeUndefined();
      obj.set('foo', 'baz');
      return obj.save();
    }).then((obj) => {
      expect(obj.get('point').id).toEqual(pointId);
      done();
    })
  });

  it('test afterSave get full object on create and update', function(done) {
    var triggerTime = 0;
    // Register a mock beforeSave hook
    Parse.Cloud.afterSave('GameScore', function(req, res) {
      var object = req.object;
      expect(object instanceof Parse.Object).toBeTruthy();
      expect(object.id).not.toBeUndefined();
      expect(object.createdAt).not.toBeUndefined();
      expect(object.updatedAt).not.toBeUndefined();
      expect(object.get('fooAgain')).toEqual('barAgain');
      if (triggerTime == 0) {
        // Create
        expect(object.get('foo')).toEqual('bar');
      } else if (triggerTime == 1) {
        // Update
        expect(object.get('foo')).toEqual('baz');
      } else {
        res.error();
      }
      triggerTime++;
      res.success();
    });

    var obj = new Parse.Object('GameScore');
    obj.set('foo', 'bar');
    obj.set('fooAgain', 'barAgain');
    obj.save().then(function() {
      // We only update foo
      obj.set('foo', 'baz');
      return obj.save();
    }).then(function() {
      // Make sure the checking has been triggered
      expect(triggerTime).toBe(2);
      done();
    }, function(error) {
      fail(error);
      done();
    });
  });

  it('test afterSave get original object on update', function(done) {
    var triggerTime = 0;
    // Register a mock beforeSave hook

    Parse.Cloud.afterSave('GameScore', function(req, res) {
      var object = req.object;
      expect(object instanceof Parse.Object).toBeTruthy();
      expect(object.get('fooAgain')).toEqual('barAgain');
      expect(object.id).not.toBeUndefined();
      expect(object.createdAt).not.toBeUndefined();
      expect(object.updatedAt).not.toBeUndefined();
      var originalObject = req.original;
      if (triggerTime == 0) {
        // Create
        expect(object.get('foo')).toEqual('bar');
        // Check the originalObject is undefined
        expect(originalObject).toBeUndefined();
      } else if (triggerTime == 1) {
        // Update
        expect(object.get('foo')).toEqual('baz');
        // Check the originalObject
        expect(originalObject instanceof Parse.Object).toBeTruthy();
        expect(originalObject.get('fooAgain')).toEqual('barAgain');
        expect(originalObject.id).not.toBeUndefined();
        expect(originalObject.createdAt).not.toBeUndefined();
        expect(originalObject.updatedAt).not.toBeUndefined();
        expect(originalObject.get('foo')).toEqual('bar');
      } else {
        res.error();
      }
      triggerTime++;
      res.success();
    });

    var obj = new Parse.Object('GameScore');
    obj.set('foo', 'bar');
    obj.set('fooAgain', 'barAgain');
    obj.save().then(function() {
      // We only update foo
      obj.set('foo', 'baz');
      return obj.save();
    }).then(function() {
      // Make sure the checking has been triggered
      expect(triggerTime).toBe(2);
      done();
    }, function(error) {
      jfail(error);
      done();
    });
  });

  it('test afterSave get full original object even req auth can not query it', (done) => {
    var triggerTime = 0;
    // Register a mock beforeSave hook
    Parse.Cloud.afterSave('GameScore', function(req, res) {
      var object = req.object;
      var originalObject = req.original;
      if (triggerTime == 0) {
        // Create
      } else if (triggerTime == 1) {
        // Update
        expect(object.get('foo')).toEqual('baz');
        // Make sure we get the full originalObject
        expect(originalObject instanceof Parse.Object).toBeTruthy();
        expect(originalObject.get('fooAgain')).toEqual('barAgain');
        expect(originalObject.id).not.toBeUndefined();
        expect(originalObject.createdAt).not.toBeUndefined();
        expect(originalObject.updatedAt).not.toBeUndefined();
        expect(originalObject.get('foo')).toEqual('bar');
      } else {
        res.error();
      }
      triggerTime++;
      res.success();
    });

    var obj = new Parse.Object('GameScore');
    obj.set('foo', 'bar');
    obj.set('fooAgain', 'barAgain');
    var acl = new Parse.ACL();
    // Make sure our update request can not query the object
    acl.setPublicReadAccess(false);
    acl.setPublicWriteAccess(true);
    obj.setACL(acl);
    obj.save().then(function() {
      // We only update foo
      obj.set('foo', 'baz');
      return obj.save();
    }).then(function() {
      // Make sure the checking has been triggered
      expect(triggerTime).toBe(2);
      done();
    }, function(error) {
      jfail(error);
      done();
    });
  });

  it('afterSave flattens custom operations', done => {
    var triggerTime = 0;
    // Register a mock beforeSave hook
    Parse.Cloud.afterSave('GameScore', function(req, res) {
      const object = req.object;
      expect(object instanceof Parse.Object).toBeTruthy();
      const originalObject = req.original;
      if (triggerTime == 0) {
        // Create
        expect(object.get('yolo')).toEqual(1);
      } else if (triggerTime == 1) {
        // Update
        expect(object.get('yolo')).toEqual(2);
        // Check the originalObject
        expect(originalObject.get('yolo')).toEqual(1);
      } else {
        res.error();
      }
      triggerTime++;
      res.success();
    });

    var obj = new Parse.Object('GameScore');
    obj.increment('yolo', 1);
    obj.save().then(() => {
      obj.increment('yolo', 1);
      return obj.save();
    }).then(() => {
      // Make sure the checking has been triggered
      expect(triggerTime).toBe(2);
      done();
    }, error => {
      jfail(error);
      done();
    });
  });

  it('beforeSave receives ACL', done => {
    let triggerTime = 0;
    // Register a mock beforeSave hook
    Parse.Cloud.beforeSave('GameScore', function(req, res) {
      const object = req.object;
      if (triggerTime == 0) {
        const acl = object.getACL();
        expect(acl.getPublicReadAccess()).toBeTruthy();
        expect(acl.getPublicWriteAccess()).toBeTruthy();
      } else if (triggerTime == 1) {
        const acl = object.getACL();
        expect(acl.getPublicReadAccess()).toBeFalsy();
        expect(acl.getPublicWriteAccess()).toBeTruthy();
      } else {
        res.error();
      }
      triggerTime++;
      res.success();
    });

    const obj = new Parse.Object('GameScore');
    const acl = new Parse.ACL();
    acl.setPublicReadAccess(true);
    acl.setPublicWriteAccess(true);
    obj.setACL(acl);
    obj.save().then(() => {
      acl.setPublicReadAccess(false);
      obj.setACL(acl);
      return obj.save();
    }).then(() => {
      // Make sure the checking has been triggered
      expect(triggerTime).toBe(2);
      done();
    }, error => {
      jfail(error);
      done();
    });
  });

  it('afterSave receives ACL', done => {
    let triggerTime = 0;
    // Register a mock beforeSave hook
    Parse.Cloud.afterSave('GameScore', function(req, res) {
      const object = req.object;
      if (triggerTime == 0) {
        const acl = object.getACL();
        expect(acl.getPublicReadAccess()).toBeTruthy();
        expect(acl.getPublicWriteAccess()).toBeTruthy();
      } else if (triggerTime == 1) {
        const acl = object.getACL();
        expect(acl.getPublicReadAccess()).toBeFalsy();
        expect(acl.getPublicWriteAccess()).toBeTruthy();
      } else {
        res.error();
      }
      triggerTime++;
      res.success();
    });

    const obj = new Parse.Object('GameScore');
    const acl = new Parse.ACL();
    acl.setPublicReadAccess(true);
    acl.setPublicWriteAccess(true);
    obj.setACL(acl);
    obj.save().then(() => {
      acl.setPublicReadAccess(false);
      obj.setACL(acl);
      return obj.save();
    }).then(() => {
      // Make sure the checking has been triggered
      expect(triggerTime).toBe(2);
      done();
    }, error => {
      jfail(error);
      done();
    });
  });

  it('should return the updated fields on PUT', done => {
    const obj = new Parse.Object('GameScore');
    obj.save({a:'hello', c: 1, d: ['1'], e:['1'], f:['1','2']}).then(() => {
      var headers = {
        'Content-Type': 'application/json',
        'X-Parse-Application-Id': 'test',
        'X-Parse-REST-API-Key': 'rest',
        'X-Parse-Installation-Id': 'yolo'
      };
      request.put({
        headers: headers,
        url: 'http://localhost:8378/1/classes/GameScore/' + obj.id,
        body: JSON.stringify({
          a: 'b',
          c: {"__op":"Increment","amount":2},
          d: {"__op":"Add", objects: ['2']},
          e: {"__op":"AddUnique", objects: ['1', '2']},
          f: {"__op":"Remove", objects: ['2']},
          selfThing: {"__type":"Pointer","className":"GameScore","objectId":obj.id},
        })
      }, (error, response, body) => {
        try {
          body = JSON.parse(body);
          expect(body.a).toBeUndefined();
          expect(body.c).toEqual(3); // 2+1
          expect(body.d.length).toBe(2);
          expect(body.d.indexOf('1') > -1).toBe(true);
          expect(body.d.indexOf('2') > -1).toBe(true);
          expect(body.e.length).toBe(2);
          expect(body.e.indexOf('1') > -1).toBe(true);
          expect(body.e.indexOf('2') > -1).toBe(true);
          expect(body.f.length).toBe(1);
          expect(body.f.indexOf('1') > -1).toBe(true);
          // return nothing on other self
          expect(body.selfThing).toBeUndefined();
          // updatedAt is always set
          expect(body.updatedAt).not.toBeUndefined();
        }catch(e) {
          jfail(e);
        }
        done();
      });
    }).fail(() => {
      fail('Should not fail');
      done();
    })
  })

  it('test cloud function error handling', (done) => {
    // Register a function which will fail
    Parse.Cloud.define('willFail', (req, res) => {
      res.error('noway');
    });
    Parse.Cloud.run('willFail').then(() => {
      fail('Should not have succeeded.');
      done();
    }, (e) => {
      expect(e.code).toEqual(141);
      expect(e.message).toEqual('noway');
      done();
    });
  });

  it('test cloud function error handling with custom error code', (done) => {
    // Register a function which will fail
    Parse.Cloud.define('willFail', (req, res) => {
      res.error(999, 'noway');
    });
    Parse.Cloud.run('willFail').then(() => {
      fail('Should not have succeeded.');
      done();
    }, (e) => {
      expect(e.code).toEqual(999);
      expect(e.message).toEqual('noway');
      done();
    });
  });

  it('test cloud function error handling with standard error code', (done) => {
    // Register a function which will fail
    Parse.Cloud.define('willFail', (req, res) => {
      res.error('noway');
    });
    Parse.Cloud.run('willFail').then(() => {
      fail('Should not have succeeded.');
      done();
    }, (e) => {
      expect(e.code).toEqual(Parse.Error.SCRIPT_FAILED);
      expect(e.message).toEqual('noway');
      done();
    });
  });

  it('test beforeSave/afterSave get installationId', function(done) {
    let triggerTime = 0;
    Parse.Cloud.beforeSave('GameScore', function(req, res) {
      triggerTime++;
      expect(triggerTime).toEqual(1);
      expect(req.installationId).toEqual('yolo');
      res.success();
    });
    Parse.Cloud.afterSave('GameScore', function(req) {
      triggerTime++;
      expect(triggerTime).toEqual(2);
      expect(req.installationId).toEqual('yolo');
    });

    var headers = {
      'Content-Type': 'application/json',
      'X-Parse-Application-Id': 'test',
      'X-Parse-REST-API-Key': 'rest',
      'X-Parse-Installation-Id': 'yolo'
    };
    request.post({
      headers: headers,
      url: 'http://localhost:8378/1/classes/GameScore',
      body: JSON.stringify({ a: 'b' })
    }, (error) => {
      expect(error).toBe(null);
      expect(triggerTime).toEqual(2);
      done();
    });
  });

  it('test beforeDelete/afterDelete get installationId', function(done) {
    let triggerTime = 0;
    Parse.Cloud.beforeDelete('GameScore', function(req, res) {
      triggerTime++;
      expect(triggerTime).toEqual(1);
      expect(req.installationId).toEqual('yolo');
      res.success();
    });
    Parse.Cloud.afterDelete('GameScore', function(req) {
      triggerTime++;
      expect(triggerTime).toEqual(2);
      expect(req.installationId).toEqual('yolo');
    });

    var headers = {
      'Content-Type': 'application/json',
      'X-Parse-Application-Id': 'test',
      'X-Parse-REST-API-Key': 'rest',
      'X-Parse-Installation-Id': 'yolo'
    };
    request.post({
      headers: headers,
      url: 'http://localhost:8378/1/classes/GameScore',
      body: JSON.stringify({ a: 'b' })
    }, (error, response, body) => {
      expect(error).toBe(null);
      request.del({
        headers: headers,
        url: 'http://localhost:8378/1/classes/GameScore/' + JSON.parse(body).objectId
      }, (error) => {
        expect(error).toBe(null);
        expect(triggerTime).toEqual(2);
        done();
      });
    });
  });

  it('test cloud function query parameters', (done) => {
    Parse.Cloud.define('echoParams', (req, res) => {
      res.success(req.params);
    });
    var headers = {
      'Content-Type': 'application/json',
      'X-Parse-Application-Id': 'test',
      'X-Parse-Javascript-Key': 'test'
    };
    request.post({
      headers: headers,
      url: 'http://localhost:8378/1/functions/echoParams', //?option=1&other=2
      qs: {
        option: 1,
        other: 2
      },
      body: '{"foo":"bar", "other": 1}'
    }, (error, response, body) => {
      expect(error).toBe(null);
      var res = JSON.parse(body).result;
      expect(res.option).toEqual('1');
      // Make sure query string params override body params
      expect(res.other).toEqual('2');
      expect(res.foo).toEqual("bar");
      done();
    });
  });

  it('test cloud function parameter validation', (done) => {
    // Register a function with validation
    Parse.Cloud.define('functionWithParameterValidationFailure', (req, res) => {
      res.success('noway');
    }, (request) => {
      return request.params.success === 100;
    });

    Parse.Cloud.run('functionWithParameterValidationFailure', {"success":500}).then(() => {
      fail('Validation should not have succeeded');
      done();
    }, (e) => {
      expect(e.code).toEqual(142);
      expect(e.message).toEqual('Validation failed.');
      done();
    });
  });

  it('can handle null params in cloud functions (regression test for #1742)', done => {
    Parse.Cloud.define('func', (request, response) => {
      expect(request.params.nullParam).toEqual(null);
      response.success('yay');
    });

    Parse.Cloud.run('func', {nullParam: null})
      .then(() => {
        done()
      }, () => {
        fail('cloud code call failed');
        done();
      });
  });

  it('can handle date params in cloud functions (#2214)', done => {
    const date = new Date();
    Parse.Cloud.define('dateFunc', (request, response) => {
      expect(request.params.date.__type).toEqual('Date');
      expect(request.params.date.iso).toEqual(date.toISOString());
      response.success('yay');
    });

    Parse.Cloud.run('dateFunc', {date: date})
      .then(() => {
        done()
      }, () => {
        fail('cloud code call failed');
        done();
      });
  });

  it('fails on invalid client key', done => {
    var headers = {
      'Content-Type': 'application/octet-stream',
      'X-Parse-Application-Id': 'test',
      'X-Parse-Client-Key': 'notclient'
    };
    request.get({
      headers: headers,
      url: 'http://localhost:8378/1/classes/TestObject'
    }, (error, response, body) => {
      expect(error).toBe(null);
      var b = JSON.parse(body);
      expect(b.error).toEqual('unauthorized');
      done();
    });
  });

  it('fails on invalid windows key', done => {
    var headers = {
      'Content-Type': 'application/octet-stream',
      'X-Parse-Application-Id': 'test',
      'X-Parse-Windows-Key': 'notwindows'
    };
    request.get({
      headers: headers,
      url: 'http://localhost:8378/1/classes/TestObject'
    }, (error, response, body) => {
      expect(error).toBe(null);
      var b = JSON.parse(body);
      expect(b.error).toEqual('unauthorized');
      done();
    });
  });

  it('fails on invalid javascript key', done => {
    var headers = {
      'Content-Type': 'application/octet-stream',
      'X-Parse-Application-Id': 'test',
      'X-Parse-Javascript-Key': 'notjavascript'
    };
    request.get({
      headers: headers,
      url: 'http://localhost:8378/1/classes/TestObject'
    }, (error, response, body) => {
      expect(error).toBe(null);
      var b = JSON.parse(body);
      expect(b.error).toEqual('unauthorized');
      done();
    });
  });

  it('fails on invalid rest api key', done => {
    var headers = {
      'Content-Type': 'application/octet-stream',
      'X-Parse-Application-Id': 'test',
      'X-Parse-REST-API-Key': 'notrest'
    };
    request.get({
      headers: headers,
      url: 'http://localhost:8378/1/classes/TestObject'
    }, (error, response, body) => {
      expect(error).toBe(null);
      var b = JSON.parse(body);
      expect(b.error).toEqual('unauthorized');
      done();
    });
  });

  it('fails on invalid function', done => {
    Parse.Cloud.run('somethingThatDoesDefinitelyNotExist').then(() => {
      fail('This should have never suceeded');
      done();
    }, (e) => {
      expect(e.code).toEqual(Parse.Error.SCRIPT_FAILED);
      expect(e.message).toEqual('Invalid function: "somethingThatDoesDefinitelyNotExist"');
      done();
    });
  });

  it('dedupes an installation properly and returns updatedAt', (done) => {
    const headers = {
      'Content-Type': 'application/json',
      'X-Parse-Application-Id': 'test',
      'X-Parse-REST-API-Key': 'rest'
    };
    const data = {
      'installationId': 'lkjsahdfkjhsdfkjhsdfkjhsdf',
      'deviceType': 'embedded'
    };
    const requestOptions = {
      headers: headers,
      url: 'http://localhost:8378/1/installations',
      body: JSON.stringify(data)
    };
    request.post(requestOptions, (error, response, body) => {
      expect(error).toBe(null);
      const b = JSON.parse(body);
      expect(typeof b.objectId).toEqual('string');
      request.post(requestOptions, (error, response, body) => {
        expect(error).toBe(null);
        const b = JSON.parse(body);
        expect(typeof b.updatedAt).toEqual('string');
        done();
      });
    });
  });

  it('android login providing empty authData block works', (done) => {
    const headers = {
      'Content-Type': 'application/json',
      'X-Parse-Application-Id': 'test',
      'X-Parse-REST-API-Key': 'rest'
    };
    const data = {
      username: 'pulse1989',
      password: 'password1234',
      authData: {}
    };
    const requestOptions = {
      headers: headers,
      url: 'http://localhost:8378/1/users',
      body: JSON.stringify(data)
    };
    request.post(requestOptions, (error) => {
      expect(error).toBe(null);
      requestOptions.url = 'http://localhost:8378/1/login';
      request.get(requestOptions, (error, response, body) => {
        expect(error).toBe(null);
        const b = JSON.parse(body);
        expect(typeof b['sessionToken']).toEqual('string');
        done();
      });
    });
  });

  it('gets relation fields', (done) => {
    const object = new Parse.Object('AnObject');
    const relatedObject = new Parse.Object('RelatedObject');
    Parse.Object.saveAll([object, relatedObject]).then(() => {
      object.relation('related').add(relatedObject);
      return object.save();
    }).then(() => {
      const headers = {
        'Content-Type': 'application/json',
        'X-Parse-Application-Id': 'test',
        'X-Parse-REST-API-Key': 'rest'
      };
      const requestOptions = {
        headers: headers,
        url: 'http://localhost:8378/1/classes/AnObject',
        json: true
      };
      request.get(requestOptions, (err, res, body) => {
        expect(body.results.length).toBe(1);
        const result = body.results[0];
        expect(result.related).toEqual({
          __type: "Relation",
          className: 'RelatedObject'
        })
        done();
      });
    }).catch((err) => {
      jfail(err);
      done();
    })
  });

  it('properly returns incremented values (#1554)', (done) => {
    const headers = {
      'Content-Type': 'application/json',
      'X-Parse-Application-Id': 'test',
      'X-Parse-REST-API-Key': 'rest'
    };
    const requestOptions = {
      headers: headers,
      url: 'http://localhost:8378/1/classes/AnObject',
      json: true
    };
    const object = new Parse.Object('AnObject');

    function runIncrement(amount) {
      const options = Object.assign({}, requestOptions, {
        body: {
          "key": {
            __op: 'Increment',
            amount: amount
          }
        },
        url: 'http://localhost:8378/1/classes/AnObject/' + object.id
      })
      return new Promise((resolve, reject) => {
        request.put(options, (err, res, body)  => {
          if (err) {
            reject(err);
          } else {
            resolve(body);
          }
        });
      })
    }

    object.save().then(() => {
      return runIncrement(1);
    }).then((res) => {
      expect(res.key).toBe(1);
      return runIncrement(-1);
    }).then((res) => {
      expect(res.key).toBe(0);
      done();
    })
  })

  it('ignores _RevocableSession "header" send by JS SDK', (done) => {
    const object = new Parse.Object('AnObject');
    object.set('a', 'b');
    object.save().then(() => {
      request.post({
        headers: {'Content-Type': 'application/json'},
        url: 'http://localhost:8378/1/classes/AnObject',
        body: {
          _method: 'GET',
          _ApplicationId: 'test',
          _JavaScriptKey: 'test',
          _ClientVersion: 'js1.8.3',
          _InstallationId: 'iid',
          _RevocableSession: "1",
        },
        json: true
      }, (err, res, body) => {
        expect(body.error).toBeUndefined();
        expect(body.results).not.toBeUndefined();
        expect(body.results.length).toBe(1);
        const result = body.results[0];
        expect(result.a).toBe('b');
        done();
      })
    });
  });

  it('doesnt convert interior keys of objects that use special names', done => {
    const obj = new Parse.Object('Obj');
    obj.set('val', { createdAt: 'a', updatedAt: 1 });
    obj.save()
      .then(obj => new Parse.Query('Obj').get(obj.id))
      .then(obj => {
        expect(obj.get('val').createdAt).toEqual('a');
        expect(obj.get('val').updatedAt).toEqual(1);
        done();
      });
  });

  it('bans interior keys containing . or $', done => {
    new Parse.Object('Obj').save({innerObj: {'key with a $': 'fails'}})
      .then(() => {
        fail('should not succeed')
      }, error => {
        expect(error.code).toEqual(Parse.Error.INVALID_NESTED_KEY);
        return new Parse.Object('Obj').save({innerObj: {'key with a .': 'fails'}});
      })
      .then(() => {
        fail('should not succeed')
      }, error => {
        expect(error.code).toEqual(Parse.Error.INVALID_NESTED_KEY);
        return new Parse.Object('Obj').save({innerObj: {innerInnerObj: {'key with $': 'fails'}}});
      })
      .then(() => {
        fail('should not succeed')
      }, error => {
        expect(error.code).toEqual(Parse.Error.INVALID_NESTED_KEY);
        return new Parse.Object('Obj').save({innerObj: {innerInnerObj: {'key with .': 'fails'}}});
      })
      .then(() => {
        fail('should not succeed')
        done();
      }, error => {
        expect(error.code).toEqual(Parse.Error.INVALID_NESTED_KEY);
        done();
      });
  });

  it('does not change inner object keys named _auth_data_something', done => {
    new Parse.Object('O').save({ innerObj: {_auth_data_facebook: 7}})
      .then(object => new Parse.Query('O').get(object.id))
      .then(object => {
        expect(object.get('innerObj')).toEqual({_auth_data_facebook: 7});
        done();
      });
  });

  it('does not change inner object key names _p_somethign', done => {
    new Parse.Object('O').save({ innerObj: {_p_data: 7}})
      .then(object => new Parse.Query('O').get(object.id))
      .then(object => {
        expect(object.get('innerObj')).toEqual({_p_data: 7});
        done();
      });
  });

  it('does not change inner object key names _rperm, _wperm', done => {
    new Parse.Object('O').save({ innerObj: {_rperm: 7, _wperm: 8}})
      .then(object => new Parse.Query('O').get(object.id))
      .then(object => {
        expect(object.get('innerObj')).toEqual({_rperm: 7, _wperm: 8});
        done();
      });
  });

  it('does not change inner objects if the key has the same name as a geopoint field on the class, and the value is an array of length 2, or if the key has the same name as a file field on the class, and the value is a string', done => {
    const file = new Parse.File('myfile.txt', { base64: 'eAo=' });
    file.save()
      .then(f => {
        const obj = new Parse.Object('O');
        obj.set('fileField', f);
        obj.set('geoField', new Parse.GeoPoint(0, 0));
        obj.set('innerObj', {
          fileField: "data",
          geoField: [1,2],
        });
        return obj.save();
      })
      .then(object => object.fetch())
      .then(object => {
        expect(object.get('innerObj')).toEqual({
          fileField: "data",
          geoField: [1,2],
        });
        done();
      }).catch((e) => {
        jfail(e);
        done();
      });
  });

  it('purge all objects in class', (done) => {
    const object = new Parse.Object('TestObject');
    object.set('foo', 'bar');
    const object2 = new Parse.Object('TestObject');
    object2.set('alice', 'wonderland');
    Parse.Object.saveAll([object, object2])
      .then(() => {
        const query = new Parse.Query(TestObject);
        return query.count()
      }).then((count) => {
        expect(count).toBe(2);
        const headers = {
          'Content-Type': 'application/json',
          'X-Parse-Application-Id': 'test',
          'X-Parse-Master-Key': 'test'
        };
        request.del({
          headers: headers,
          url: 'http://localhost:8378/1/purge/TestObject',
          json: true
        }, (err) => {
          expect(err).toBe(null);
          const query = new Parse.Query(TestObject);
          return query.count().then((count) => {
            expect(count).toBe(0);
            done();
          });
        });
      });
  });

  it('fail on purge all objects in class without master key', (done) => {
    const headers = {
      'Content-Type': 'application/json',
      'X-Parse-Application-Id': 'test',
      'X-Parse-REST-API-Key': 'rest'
    };
    rp({
      method: 'DELETE',
      headers: headers,
      uri: 'http://localhost:8378/1/purge/TestObject',
      json: true
    }).then(() => {
      fail('Should not succeed');
    }).catch(err => {
      expect(err.error.error).toEqual('unauthorized: master key is required');
      done();
    });
  });

  it('purge all objects in _Role also purge cache', (done) => {
    const headers = {
      'Content-Type': 'application/json',
      'X-Parse-Application-Id': 'test',
      'X-Parse-Master-Key': 'test'
    };
    var user, object;
    createTestUser().then((x) => {
      user = x;
      const acl = new Parse.ACL();
      acl.setPublicReadAccess(true);
      acl.setPublicWriteAccess(false);
      const role = new Parse.Object('_Role');
      role.set('name', 'TestRole');
      role.setACL(acl);
      const users = role.relation('users');
      users.add(user);
      return role.save({}, { useMasterKey: true });
    }).then(() => {
      const query = new Parse.Query('_Role');
      return query.find({ useMasterKey: true });
    }).then((x) => {
      expect(x.length).toEqual(1);
      const relation = x[0].relation('users').query();
      return relation.first({ useMasterKey: true });
    }).then((x) => {
      expect(x.id).toEqual(user.id);
      object = new Parse.Object('TestObject');
      const acl = new Parse.ACL();
      acl.setPublicReadAccess(false);
      acl.setPublicWriteAccess(false);
      acl.setRoleReadAccess('TestRole', true);
      acl.setRoleWriteAccess('TestRole', true);
      object.setACL(acl);
      return object.save();
    }).then(() => {
      const query = new Parse.Query('TestObject');
      return query.find({ sessionToken: user.getSessionToken() });
    }).then((x) => {
      expect(x.length).toEqual(1);
      return rp({
        method: 'DELETE',
        headers: headers,
        uri: 'http://localhost:8378/1/purge/_Role',
        json: true
      });
    }).then(() => {
      const query = new Parse.Query('TestObject');
      return query.get(object.id, { sessionToken: user.getSessionToken() });
    }).then(() => {
      fail('Should not succeed');
    }, (e) => {
      expect(e.code).toEqual(Parse.Error.OBJECT_NOT_FOUND);
      done();
    });
  });

  it('should not update schema beforeSave #2672', (done) => {
    Parse.Cloud.beforeSave('MyObject', (request, response) => {
      if (request.object.get('secret')) {
        response.error('cannot set secret here');
        return;
      }
      response.success();
    });

    const object = new Parse.Object('MyObject');
    object.set('key', 'value');
    object.save().then(() => {
      return object.save({'secret': 'should not update schema'});
    }).then(() => {
      fail();
      done();
    }, () => {
      return rp({
        method: 'GET',
        headers: {
          'X-Parse-Application-Id': 'test',
          'X-Parse-Master-Key': 'test'
        },
        uri: 'http://localhost:8378/1/schemas/MyObject',
        json: true
      });
    }).then((res) => {
      const fields = res.fields;
      expect(fields.secret).toBeUndefined();
      done();
    }, (err) => {
      jfail(err);
      done();
    });
  });
});

describe_only_db('mongo')('legacy _acl', () => {
  it('should have _acl when locking down (regression for #2465)', (done) =>  {
    const headers = {
      'X-Parse-Application-Id': 'test',
      'X-Parse-REST-API-Key': 'rest'
    }
    rp({
      method: 'POST',
      headers: headers,
      uri: 'http://localhost:8378/1/classes/Report',
      body: {
        ACL: {},
        name: 'My Report'
      },
      json: true
    }).then(() => {
      const config = Config.get('test');
      const adapter = config.database.adapter;
      return adapter._adaptiveCollection("Report")
        .then(collection => collection.find({}))
    }).then((results) => {
      expect(results.length).toBe(1);
      const result = results[0];
      expect(result.name).toEqual('My Report');
      expect(result._wperm).toEqual([]);
      expect(result._rperm).toEqual([]);
      expect(result._acl).toEqual({});
      done();
    }).catch((err) => {
      fail(JSON.stringify(err));
      done();
    });
  });
});
