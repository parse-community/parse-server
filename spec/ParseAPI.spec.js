// A bunch of different tests are in here - it isn't very thematic.
// It would probably be better to refactor them into different files.
'use strict';

var DatabaseAdapter = require('../src/DatabaseAdapter');
var request = require('request');
const Parse = require("parse/node");
let Config = require('../src/Config');

describe('miscellaneous', function() {
  it('create a GameScore object', function(done) {
    var obj = new Parse.Object('GameScore');
    obj.set('score', 1337);
    obj.save().then(function(obj) {
      expect(typeof obj.id).toBe('string');
      expect(typeof obj.createdAt.toGMTString()).toBe('string');
      done();
    }, function(err) { console.log(err); });
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
        error: fail
      });
    });
  });

  it('create a valid parse user', function(done) {
    createTestUser(function(data) {
      expect(data.id).not.toBeUndefined();
      expect(data.getSessionToken()).not.toBeUndefined();
      expect(data.get('password')).toBeUndefined();
      done();
    }, function(err) {
      fail(err);
      done();
    });
  });

  it('fail to create a duplicate username', function(done) {
    createTestUser(function(data) {
      createTestUser(function(data) {
        fail('Should not have been able to save duplicate username.');
      }, function(error) {
        expect(error.code).toEqual(Parse.Error.USERNAME_TAKEN);
        done();
      });
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
          Parse.User.logOut();
          done();
        }, error: function(error) {
          fail(error);
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
    }).then(() => {
      Parse.User.logOut();
      return Parse.User.logIn('test', 'moon-y');
    }).then((user) => {
      expect(user.get('foo')).toEqual(2);
      Parse.User.logOut();
      done();
    }, (error) => {
      fail(error);
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
      fail(error);
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
    }, (error) => {
      fail(error);
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
    }, function(error) {
      fail(error);
      done();
    });
  });

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
      var db = DatabaseAdapter.getDatabaseConnection(appId, 'test_');
      return db.mongoFind('TestObject', {}, {});
    }).then((results) => {
      expect(results.length).toEqual(1);
      expect(results[0]['foo']).toEqual('bar');
      done();
    }).fail(err => {
      fail(err);
      done();
    })
  });

  describe('beforeSave', () => {
    it('object is set on create and update', done => {
      let triggerTime = 0;
      // Register a mock beforeSave hook
      Parse.Cloud.beforeSave('GameScore', (req, res) => {
        let object = req.object;
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

      let obj = new Parse.Object('GameScore');
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

    it('original object is set on update', done => {
      let triggerTime = 0;
      // Register a mock beforeSave hook
      Parse.Cloud.beforeSave('GameScore', (req, res) => {
        let object = req.object;
        expect(object instanceof Parse.Object).toBeTruthy();
        expect(object.get('fooAgain')).toEqual('barAgain');
        let originalObject = req.original;
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

      let obj = new Parse.Object('GameScore');
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
      let className = 'GameScore';

      Parse.Cloud.beforeSave(className, (req, res) => {
        let object = req.object;
        expect(object instanceof Parse.Object).toBeTruthy();

        let child = object.get('child');
        expect(child instanceof Parse.Object).toBeTruthy();
        child.set('a', 'b');
        child.save().then(() => {
          res.success();
        });
      });

      let obj = new Parse.Object(className);
      obj.set('foo', 'bar');

      let child = new Parse.Object('Child');
      child.save().then(() => {
        obj.set('child', child);
        return obj.save();
      }).then(() => {
        let query = new Parse.Query(className);
        query.include('child');
        return query.get(obj.id).then(objAgain => {
          expect(objAgain.get('foo')).toEqual('bar');

          let childAgain = objAgain.get('child');
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
  });

  it('pointer reassign is working properly (#1288)', (done) => {
    Parse.Cloud.beforeSave('GameScore', (req, res) => {

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
    obj.save().then(() => {
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
      console.error(error);
      fail(error);
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
      console.error(error);
      fail(error);
      done();
    });
  });

  it('afterSave flattens custom operations', done => {
    var triggerTime = 0;
    // Register a mock beforeSave hook
    Parse.Cloud.afterSave('GameScore', function(req, res) {
      let object = req.object;
      expect(object instanceof Parse.Object).toBeTruthy();
      let originalObject = req.original;
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
      console.error(error);
      fail(error);
      done();
    });
  });

  it('beforeSave receives ACL', done => {
    let triggerTime = 0;
    // Register a mock beforeSave hook
    Parse.Cloud.beforeSave('GameScore', function(req, res) {
      let object = req.object;
      if (triggerTime == 0) {
        let acl = object.getACL();
        expect(acl.getPublicReadAccess()).toBeTruthy();
        expect(acl.getPublicWriteAccess()).toBeTruthy();
      } else if (triggerTime == 1) {
        let acl = object.getACL();
        expect(acl.getPublicReadAccess()).toBeFalsy();
        expect(acl.getPublicWriteAccess()).toBeTruthy();
      } else {
        res.error();
      }
      triggerTime++;
      res.success();
    });

    let obj = new Parse.Object('GameScore');
    let acl = new Parse.ACL();
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
      console.error(error);
      fail(error);
      done();
    });
  });

  it('afterSave receives ACL', done => {
    let triggerTime = 0;
    // Register a mock beforeSave hook
    Parse.Cloud.afterSave('GameScore', function(req, res) {
      let object = req.object;
      if (triggerTime == 0) {
        let acl = object.getACL();
        expect(acl.getPublicReadAccess()).toBeTruthy();
        expect(acl.getPublicWriteAccess()).toBeTruthy();
      } else if (triggerTime == 1) {
        let acl = object.getACL();
        expect(acl.getPublicReadAccess()).toBeFalsy();
        expect(acl.getPublicWriteAccess()).toBeTruthy();
      } else {
        res.error();
      }
      triggerTime++;
      res.success();
    });

    let obj = new Parse.Object('GameScore');
    let acl = new Parse.ACL();
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
      console.error(error);
      fail(error);
      done();
    });
  });

  it('should return the updated fields on PUT', (done) => {
    let obj = new Parse.Object('GameScore');
    obj.save({a:'hello', c: 1, d: ['1'], e:['1'], f:['1','2']}).then(( ) => {
      var headers = {
        'Content-Type': 'application/json',
        'X-Parse-Application-Id': 'test',
        'X-Parse-REST-API-Key': 'rest',
        'X-Parse-Installation-Id': 'yolo'
      };
      request.put({
        headers: headers,
        url: 'http://localhost:8378/1/classes/GameScore/'+obj.id,
        body: JSON.stringify({
          a: 'b',
          c: {"__op":"Increment","amount":2},
          d: {"__op":"Add", objects: ['2']},
          e: {"__op":"AddUnique", objects: ['1', '2']},
          f: {"__op":"Remove", objects: ['2']},
          selfThing: {"__type":"Pointer","className":"GameScore","objectId":obj.id},
        })
      }, (error, response, body) => {
        body = JSON.parse(body);
        expect(body.a).toBeUndefined();
        expect(body.c).toEqual(3); // 2+1
        expect(body.d.length).toBe(2);
        expect(body.d.indexOf('1') > -1).toBe(true);
        expect(body.d.indexOf('2') > -1).toBe(true);
        expect(body.e.length).toBe(2);
        expect(body.e.indexOf('1') > -1).toBe(true);
        expect(body.e.indexOf('2') > -1).toBe(true);
        expect(body.f.length).toBe(1);
        expect(body.f.indexOf('1') > -1).toBe(true);
        // return nothing on other self
        expect(body.selfThing).toBeUndefined();
        // updatedAt is always set
        expect(body.updatedAt).not.toBeUndefined();
        done();
      });
    }).fail((err) => {
      fail('Should not fail');
      done();
    })
  })

  it('test cloud function error handling', (done) => {
    // Register a function which will fail
    Parse.Cloud.define('willFail', (req, res) => {
      res.error('noway');
    });
    Parse.Cloud.run('willFail').then((s) => {
      fail('Should not have succeeded.');
      done();
    }, (e) => {
      expect(e.code).toEqual(141);
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
    }, (error, response, body) => {
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
      }, (error, response, body) => {
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

    Parse.Cloud.run('functionWithParameterValidationFailure', {"success":500}).then((s) => {
      fail('Validation should not have succeeded');
      done();
    }, (e) => {
      expect(e.code).toEqual(141);
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
    }, e => {
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
    Parse.Cloud.run('somethingThatDoesDefinitelyNotExist').then((s) => {
      fail('This should have never suceeded');
      done();
    }, (e) => {
      expect(e.code).toEqual(Parse.Error.SCRIPT_FAILED);
      expect(e.message).toEqual('Invalid function.');
      done();
    });
  });

  it('dedupes an installation properly and returns updatedAt', (done) => {
    let headers = {
      'Content-Type': 'application/json',
      'X-Parse-Application-Id': 'test',
      'X-Parse-REST-API-Key': 'rest'
    };
    let data = {
      'installationId': 'lkjsahdfkjhsdfkjhsdfkjhsdf',
      'deviceType': 'embedded'
    };
    let requestOptions = {
      headers: headers,
      url: 'http://localhost:8378/1/installations',
      body: JSON.stringify(data)
    };
    request.post(requestOptions, (error, response, body) => {
      expect(error).toBe(null);
      let b = JSON.parse(body);
      expect(typeof b.objectId).toEqual('string');
      request.post(requestOptions, (error, response, body) => {
        expect(error).toBe(null);
        let b = JSON.parse(body);
        expect(typeof b.updatedAt).toEqual('string');
        done();
      });
    });
  });

  it('android login providing empty authData block works', (done) => {
    let headers = {
      'Content-Type': 'application/json',
      'X-Parse-Application-Id': 'test',
      'X-Parse-REST-API-Key': 'rest'
    };
    let data = {
      username: 'pulse1989',
      password: 'password1234',
      authData: {}
    };
    let requestOptions = {
      headers: headers,
      url: 'http://localhost:8378/1/users',
      body: JSON.stringify(data)
    };
    request.post(requestOptions, (error, response, body) => {
      expect(error).toBe(null);
      requestOptions.url = 'http://localhost:8378/1/login';
      request.get(requestOptions, (error, response, body) => {
        expect(error).toBe(null);
        let b = JSON.parse(body);
        expect(typeof b['sessionToken']).toEqual('string');
        done();
      });
    });
  });

  it('gets relation fields', (done) => {
    let object = new Parse.Object('AnObject');
    let relatedObject = new Parse.Object('RelatedObject');
    Parse.Object.saveAll([object, relatedObject]).then(() => {
      object.relation('related').add(relatedObject);
      return object.save();
    }).then(() => {
      let headers = {
        'Content-Type': 'application/json',
        'X-Parse-Application-Id': 'test',
        'X-Parse-REST-API-Key': 'rest'
      };
      let requestOptions = {
        headers: headers,
        url: 'http://localhost:8378/1/classes/AnObject',
        json: true
      };
      request.get(requestOptions, (err, res, body) => {
        expect(body.results.length).toBe(1);
        let result = body.results[0];
        expect(result.related).toEqual({
          __type: "Relation",
          className: 'RelatedObject'
        })
        done();
      });
    })
  });

  it('properly returns incremented values (#1554)', (done) => {
      let headers = {
        'Content-Type': 'application/json',
        'X-Parse-Application-Id': 'test',
        'X-Parse-REST-API-Key': 'rest'
      };
      let requestOptions = {
        headers: headers,
        url: 'http://localhost:8378/1/classes/AnObject',
        json: true
      };
     let object = new Parse.Object('AnObject');;

     function runIncrement(amount) {
       let options = Object.assign({}, requestOptions, {
         body: {
           "key": {
            __op: 'Increment',
            amount: amount
           }
          },
         url: 'http://localhost:8378/1/classes/AnObject/'+object.id
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

     object.save().then(() => {
       return runIncrement(1);
     }).then((res) => {
       expect(res.key).toBe(1);
       return runIncrement(-1);
     }).then((res) => {
       expect(res.key).toBe(0);
       done();
     })
  })

  it('ignores _RevocableSession "header" send by JS SDK', (done) => {
    let object = new Parse.Object('AnObject');
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
        let result = body.results[0];
        expect(result.a).toBe('b');
        done();
      })
    });
  });

  it('fail when create duplicate value in unique field', (done) => {
    let obj = new Parse.Object('UniqueField');
    obj.set('unique', 'value');
    obj.save().then(() => {
      expect(obj.id).not.toBeUndefined();
      let config = new Config('test');
      return config.database.adapter.adaptiveCollection('UniqueField')
    }).then(collection => {
      return collection._mongoCollection.createIndex({ 'unique': 1 }, { unique: true })
    }).then(() => {
      let obj = new Parse.Object('UniqueField');
      obj.set('unique', 'value');
      return obj.save()
    }).then(() => {
      return Promise.reject();
    }, error => {
      expect(error.code === Parse.Error.DUPLICATE_VALUE);
      done();
    });
  });

  it('doesnt convert interior keys of objects that use special names', done => {
    let obj = new Parse.Object('Obj');
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
    .catch(error => {
      expect(error.code).toEqual(Parse.Error.INVALID_NESTED_KEY);
      return new Parse.Object('Obj').save({innerObj: {'key with a .': 'fails'}});
    })
    .catch(error => {
      expect(error.code).toEqual(Parse.Error.INVALID_NESTED_KEY);
      return new Parse.Object('Obj').save({innerObj: {innerInnerObj: {'key with $': 'fails'}}});
    })
    .catch(error => {
      expect(error.code).toEqual(Parse.Error.INVALID_NESTED_KEY);
      return new Parse.Object('Obj').save({innerObj: {innerInnerObj: {'key with .': 'fails'}}});
    })
    .catch(error => {
      expect(error.code).toEqual(Parse.Error.INVALID_NESTED_KEY);
      done();
    })
  });
});
