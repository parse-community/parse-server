"use strict"
const Parse = require("parse/node");
const request = require('request');
const InMemoryCacheAdapter = require('../src/Adapters/Cache/InMemoryCacheAdapter').InMemoryCacheAdapter;

describe('Cloud Code', () => {
  it('can load absolute cloud code file', done => {
    setServerConfiguration({
      serverURL: 'http://localhost:8378/1',
      appId: 'test',
      masterKey: 'test',
      cloud: __dirname + '/cloud/cloudCodeRelativeFile.js'
    });
    Parse.Cloud.run('cloudCodeInFile', {}, result => {
      expect(result).toEqual('It is possible to define cloud code in a file.');
      done();
    });
  });

  it('can load relative cloud code file', done => {
    setServerConfiguration({
      serverURL: 'http://localhost:8378/1',
      appId: 'test',
      masterKey: 'test',
      cloud: './spec/cloud/cloudCodeAbsoluteFile.js'
    });
    Parse.Cloud.run('cloudCodeInFile', {}, result => {
      expect(result).toEqual('It is possible to define cloud code in a file.');
      done();
    });
  });

  it('can create functions', done => {
    Parse.Cloud.define('hello', (req, res) => {
      res.success('Hello world!');
    });

    Parse.Cloud.run('hello', {}, result => {
      expect(result).toEqual('Hello world!');
      done();
    });
  });

  it('is cleared cleared after the previous test', done => {
    Parse.Cloud.run('hello', {})
    .catch(error => {
      expect(error.code).toEqual(141);
      done();
    });
  });

  it('basic beforeSave rejection', function(done) {
    Parse.Cloud.beforeSave('BeforeSaveFail', function(req, res) {
      res.error('You shall not pass!');
    });

    var obj = new Parse.Object('BeforeSaveFail');
    obj.set('foo', 'bar');
    obj.save().then(() => {
      fail('Should not have been able to save BeforeSaveFailure class.');
      done();
    }, () => {
      done();
    })
  });

  it('basic beforeSave rejection via promise', function(done) {
    Parse.Cloud.beforeSave('BeforeSaveFailWithPromise', function (req, res) {
      var query = new Parse.Query('Yolo');
      query.find().then(() => {
       res.error('Nope');
      }, () => {
        res.success();
      });
    });

    var obj = new Parse.Object('BeforeSaveFailWithPromise');
    obj.set('foo', 'bar');
    obj.save().then(function() {
      fail('Should not have been able to save BeforeSaveFailure class.');
      done();
    }, function(error) {
      expect(error.code).toEqual(Parse.Error.SCRIPT_FAILED);
      expect(error.message).toEqual('Nope');
      done();
    })
  });

  it('test beforeSave changed object success', function(done) {
    Parse.Cloud.beforeSave('BeforeSaveChanged', function(req, res) {
      req.object.set('foo', 'baz');
      res.success();
    });

    var obj = new Parse.Object('BeforeSaveChanged');
    obj.set('foo', 'bar');
    obj.save().then(function() {
      var query = new Parse.Query('BeforeSaveChanged');
      query.get(obj.id).then(function(objAgain) {
        expect(objAgain.get('foo')).toEqual('baz');
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

  it('test beforeSave returns value on create and update', (done) => {
    Parse.Cloud.beforeSave('BeforeSaveChanged', function(req, res) {
      req.object.set('foo', 'baz');
      res.success();
    });

    var obj = new Parse.Object('BeforeSaveChanged');
    obj.set('foo', 'bing');
    obj.save().then(() => {
      expect(obj.get('foo')).toEqual('baz');
      obj.set('foo', 'bar');
      return obj.save().then(() => {
        expect(obj.get('foo')).toEqual('baz');
        done();
      })
    })
  });

  it('test afterSave ran and created an object', function(done) {
    Parse.Cloud.afterSave('AfterSaveTest', function(req) {
      var obj = new Parse.Object('AfterSaveProof');
      obj.set('proof', req.object.id);
      obj.save();
    });

    var obj = new Parse.Object('AfterSaveTest');
    obj.save();

    setTimeout(function() {
      var query = new Parse.Query('AfterSaveProof');
      query.equalTo('proof', obj.id);
      query.find().then(function(results) {
        expect(results.length).toEqual(1);
        done();
      }, function(error) {
        fail(error);
        done();
      });
    }, 500);
  });

  it('test beforeSave happens on update', function(done) {
    Parse.Cloud.beforeSave('BeforeSaveChanged', function(req, res) {
      req.object.set('foo', 'baz');
      res.success();
    });

    var obj = new Parse.Object('BeforeSaveChanged');
    obj.set('foo', 'bar');
    obj.save().then(function() {
      obj.set('foo', 'bar');
      return obj.save();
    }).then(function() {
      var query = new Parse.Query('BeforeSaveChanged');
      return query.get(obj.id).then(function(objAgain) {
        expect(objAgain.get('foo')).toEqual('baz');
        done();
      });
    }, function(error) {
      fail(error);
      done();
    });
  });

  it('test beforeDelete failure', function(done) {
    Parse.Cloud.beforeDelete('BeforeDeleteFail', function(req, res) {
      res.error('Nope');
    });

    var obj = new Parse.Object('BeforeDeleteFail');
    var id;
    obj.set('foo', 'bar');
    obj.save().then(() => {
      id = obj.id;
      return obj.destroy();
    }).then(() => {
      fail('obj.destroy() should have failed, but it succeeded');
      done();
    }, (error) => {
      expect(error.code).toEqual(Parse.Error.SCRIPT_FAILED);
      expect(error.message).toEqual('Nope');

      var objAgain = new Parse.Object('BeforeDeleteFail', {objectId: id});
      return objAgain.fetch();
    }).then((objAgain) => {
      if (objAgain) {
        expect(objAgain.get('foo')).toEqual('bar');
      } else {
        fail("unable to fetch the object ", id);
      }
      done();
    }, (error) => {
      // We should have been able to fetch the object again
      fail(error);
    });
  });

  it('basic beforeDelete rejection via promise', function(done) {
    Parse.Cloud.beforeSave('BeforeDeleteFailWithPromise', function (req, res) {
      var query = new Parse.Query('Yolo');
      query.find().then(() => {
        res.error('Nope');
      }, () => {
        res.success();
      });
    });

    var obj = new Parse.Object('BeforeDeleteFailWithPromise');
    obj.set('foo', 'bar');
    obj.save().then(function() {
      fail('Should not have been able to save BeforeSaveFailure class.');
      done();
    }, function(error) {
      expect(error.code).toEqual(Parse.Error.SCRIPT_FAILED);
      expect(error.message).toEqual('Nope');

      done();
    })
  });

  it('test afterDelete ran and created an object', function(done) {
    Parse.Cloud.afterDelete('AfterDeleteTest', function(req) {
      var obj = new Parse.Object('AfterDeleteProof');
      obj.set('proof', req.object.id);
      obj.save();
    });

    var obj = new Parse.Object('AfterDeleteTest');
    obj.save().then(function() {
      obj.destroy();
    });

    setTimeout(function() {
      var query = new Parse.Query('AfterDeleteProof');
      query.equalTo('proof', obj.id);
      query.find().then(function(results) {
        expect(results.length).toEqual(1);
        done();
      }, function(error) {
        fail(error);
        done();
      });
    }, 500);
  });

  it('test cloud function return types', function(done) {
    Parse.Cloud.define('foo', function(req, res) {
      res.success({
        object: {
          __type: 'Object',
          className: 'Foo',
          objectId: '123',
          x: 2,
          relation: {
            __type: 'Object',
            className: 'Bar',
            objectId: '234',
            x: 3
          }
        },
        array: [{
          __type: 'Object',
          className: 'Bar',
          objectId: '345',
          x: 2
        }],
        a: 2
      });
    });

    Parse.Cloud.run('foo').then((result) => {
      expect(result.object instanceof Parse.Object).toBeTruthy();
      if (!result.object) {
        fail("Unable to run foo");
        done();
        return;
      }
      expect(result.object.className).toEqual('Foo');
      expect(result.object.get('x')).toEqual(2);
      var bar = result.object.get('relation');
      expect(bar instanceof Parse.Object).toBeTruthy();
      expect(bar.className).toEqual('Bar');
      expect(bar.get('x')).toEqual(3);
      expect(Array.isArray(result.array)).toEqual(true);
      expect(result.array[0] instanceof Parse.Object).toBeTruthy();
      expect(result.array[0].get('x')).toEqual(2);
      done();
    });
  });

  it('test cloud function should echo keys', function(done) {
    Parse.Cloud.define('echoKeys', function(req, res){
      return res.success({
        applicationId: Parse.applicationId,
        masterKey: Parse.masterKey,
        javascriptKey: Parse.javascriptKey
      })
    });

    Parse.Cloud.run('echoKeys').then((result) => {
      expect(result.applicationId).toEqual(Parse.applicationId);
      expect(result.masterKey).toEqual(Parse.masterKey);
      expect(result.javascriptKey).toEqual(Parse.javascriptKey);
      done();
    });
  });

  it('should properly create an object in before save', done => {
    Parse.Cloud.beforeSave('BeforeSaveChanged', function(req, res) {
      req.object.set('foo', 'baz');
      res.success();
    });

    Parse.Cloud.define('createBeforeSaveChangedObject', function(req, res){
      var obj = new Parse.Object('BeforeSaveChanged');
      obj.save().then(() => {
        res.success(obj);
      })
    })

    Parse.Cloud.run('createBeforeSaveChangedObject').then((res) => {
      expect(res.get('foo')).toEqual('baz');
      done();
    });
  });

  it('dirtyKeys are set on update', done => {
    let triggerTime = 0;
    // Register a mock beforeSave hook
    Parse.Cloud.beforeSave('GameScore', (req, res) => {
      var object = req.object;
      expect(object instanceof Parse.Object).toBeTruthy();
      expect(object.get('fooAgain')).toEqual('barAgain');
      if (triggerTime == 0) {
        // Create
        expect(object.get('foo')).toEqual('bar');
      } else if (triggerTime == 1) {
        // Update
        expect(object.dirtyKeys()).toEqual(['foo']);
        expect(object.dirty('foo')).toBeTruthy();
        expect(object.get('foo')).toEqual('baz');
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
    }, function(error) {
      fail(error);
      done();
    });
  });

  it('test beforeSave unchanged success', function(done) {
    Parse.Cloud.beforeSave('BeforeSaveUnchanged', function(req, res) {
      res.success();
    });

    var obj = new Parse.Object('BeforeSaveUnchanged');
    obj.set('foo', 'bar');
    obj.save().then(function() {
      done();
    }, function(error) {
      fail(error);
      done();
    });
  });

  it('test beforeDelete success', function(done) {
    Parse.Cloud.beforeDelete('BeforeDeleteTest', function(req, res) {
      res.success();
    });

    var obj = new Parse.Object('BeforeDeleteTest');
    obj.set('foo', 'bar');
    obj.save().then(function() {
      return obj.destroy();
    }).then(function() {
      var objAgain = new Parse.Object('BeforeDeleteTest', obj.id);
      return objAgain.fetch().then(fail, done);
    }, function(error) {
      fail(error);
      done();
    });
  });

  it('test save triggers get user', function(done) {
    Parse.Cloud.beforeSave('SaveTriggerUser', function(req, res) {
      if (req.user && req.user.id) {
        res.success();
      } else {
        res.error('No user present on request object for beforeSave.');
      }
    });

    Parse.Cloud.afterSave('SaveTriggerUser', function(req) {
      if (!req.user || !req.user.id) {
        console.log('No user present on request object for afterSave.');
      }
    });

    var user = new Parse.User();
    user.set("password", "asdf");
    user.set("email", "asdf@example.com");
    user.set("username", "zxcv");
    user.signUp(null, {
      success: function() {
        var obj = new Parse.Object('SaveTriggerUser');
        obj.save().then(function() {
          done();
        }, function(error) {
          fail(error);
          done();
        });
      }
    });
  });

  it('beforeSave change propagates through the save response', (done) => {
    Parse.Cloud.beforeSave('ChangingObject', function(request, response) {
      request.object.set('foo', 'baz');
      response.success();
    });
    let obj = new Parse.Object('ChangingObject');
    obj.save({ foo: 'bar' }).then((objAgain) => {
      expect(objAgain.get('foo')).toEqual('baz');
      done();
    }, (e) => {
      fail('Should not have failed to save.');
      done();
    });
  });

  it('test cloud function parameter validation success', (done) => {
    // Register a function with validation
    Parse.Cloud.define('functionWithParameterValidation', (req, res) => {
      res.success('works');
    }, (request) => {
      return request.params.success === 100;
    });

    Parse.Cloud.run('functionWithParameterValidation', {"success":100}).then((s) => {
      done();
    }, (e) => {
      fail('Validation should not have failed.');
      done();
    });
  });

  it('doesnt receive stale user in cloud code functions after user has been updated with master key (regression test for #1836)', done => {
    Parse.Cloud.define('testQuery', function(request, response) {
      response.success(request.user.get('data'));
    });

    Parse.User.signUp('user', 'pass')
    .then(user => {
      user.set('data', 'AAA');
      return user.save();
    })
    .then(() => Parse.Cloud.run('testQuery'))
    .then(result => {
      expect(result).toEqual('AAA');
      Parse.User.current().set('data', 'BBB');
      return Parse.User.current().save(null, {useMasterKey: true});
    })
    .then(() => Parse.Cloud.run('testQuery'))
    .then(result => {
      expect(result).toEqual('BBB');
      done();
    });
  });

  it('clears out the user cache for all sessions when the user is changed', done => {
    const cacheAdapter = new InMemoryCacheAdapter({ ttl: 100000000 });
    setServerConfiguration(Object.assign({}, defaultConfiguration, { cacheAdapter: cacheAdapter }));
    Parse.Cloud.define('checkStaleUser', (request, response) => {
      response.success(request.user.get('data'));
    });

    let user = new Parse.User();
    user.set('username', 'test');
    user.set('password', 'moon-y');
    user.set('data', 'first data');
    user.signUp()
    .then(user => {
      let session1 = user.getSessionToken();
      request.get({
        url: 'http://localhost:8378/1/login?username=test&password=moon-y',
        json: true,
        headers: {
          'X-Parse-Application-Id': 'test',
          'X-Parse-REST-API-Key': 'rest',
        },
      }, (error, response, body) => {
        let session2 = body.sessionToken;

        //Ensure both session tokens are in the cache
        Parse.Cloud.run('checkStaleUser')
        .then(() => {
          request.post({
            url: 'http://localhost:8378/1/functions/checkStaleUser',
            json: true,
            headers: {
              'X-Parse-Application-Id': 'test',
              'X-Parse-REST-API-Key': 'rest',
              'X-Parse-Session-Token': session2,
            }
          }, (error, response, body) => {
            Parse.Promise.all([cacheAdapter.get('test:user:' + session1), cacheAdapter.get('test:user:' + session2)])
            .then(cachedVals => {
              expect(cachedVals[0].objectId).toEqual(user.id);
              expect(cachedVals[1].objectId).toEqual(user.id);

              //Change with session 1 and then read with session 2.
              user.set('data', 'second data');
              user.save()
              .then(() => {
                request.post({
                  url: 'http://localhost:8378/1/functions/checkStaleUser',
                  json: true,
                  headers: {
                    'X-Parse-Application-Id': 'test',
                    'X-Parse-REST-API-Key': 'rest',
                    'X-Parse-Session-Token': session2,
                  }
                }, (error, response, body) => {
                  expect(body.result).toEqual('second data');
                  done();
                })
              });
            });
          });
        });
      });
    });
  });

  it('trivial beforeSave should not affect fetched pointers', done => {
    Parse.Cloud.beforeSave('BeforeSaveUnchanged', (req, res) => {
      res.success();
    });

    var TestObject =  Parse.Object.extend("TestObject");
    var NoBeforeSaveObject = Parse.Object.extend("NoBeforeSave");
    var BeforeSaveObject = Parse.Object.extend("BeforeSaveUnchanged");

    var aTestObject = new TestObject();
    aTestObject.set("foo", "bar");
    aTestObject.save()
    .then(aTestObject => {
      var aNoBeforeSaveObj = new NoBeforeSaveObject();
      aNoBeforeSaveObj.set("aTestObject", aTestObject);
      expect(aNoBeforeSaveObj.get("aTestObject").get("foo")).toEqual("bar");
      return aNoBeforeSaveObj.save();
    })
    .then(aNoBeforeSaveObj => {
      expect(aNoBeforeSaveObj.get("aTestObject").get("foo")).toEqual("bar");

      var aBeforeSaveObj = new BeforeSaveObject();
      aBeforeSaveObj.set("aTestObject", aTestObject);
      expect(aBeforeSaveObj.get("aTestObject").get("foo")).toEqual("bar");
      return aBeforeSaveObj.save();
    })
    .then(aBeforeSaveObj => {
      expect(aBeforeSaveObj.get("aTestObject").get("foo")).toEqual("bar");
      done();
    });
  });
});
