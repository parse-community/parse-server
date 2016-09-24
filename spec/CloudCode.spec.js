"use strict"
const Parse = require("parse/node");
const request = require('request');
const rp = require('request-promise');
const InMemoryCacheAdapter = require('../src/Adapters/Cache/InMemoryCacheAdapter').InMemoryCacheAdapter;
const triggers = require('../src/triggers');

describe('Cloud Code', () => {
  it('can load absolute cloud code file', done => {
    reconfigureServer({ cloud: __dirname + '/cloud/cloudCodeRelativeFile.js' })
    .then(() => {
      Parse.Cloud.run('cloudCodeInFile', {}, result => {
        expect(result).toEqual('It is possible to define cloud code in a file.');
        done();
      });
    })
  });

  it('can load relative cloud code file', done => {
    reconfigureServer({ cloud: './spec/cloud/cloudCodeAbsoluteFile.js' })
    .then(() => {
      Parse.Cloud.run('cloudCodeInFile', {}, result => {
        expect(result).toEqual('It is possible to define cloud code in a file.');
        done();
      });
    })
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

  it('returns an error', (done) => {
    Parse.Cloud.define('cloudCodeWithError', (req, res) => {
      foo.bar();
      res.success('I better throw an error.');
    });

    Parse.Cloud.run('cloudCodeWithError')
      .then(
        a => done.fail('should not succeed'),
        e => {
          expect(e).toEqual(new Parse.Error(1, undefined));
          done();
        });
  });

  it('beforeSave rejection with custom error code', function(done) {
    Parse.Cloud.beforeSave('BeforeSaveFailWithErrorCode', function (req, res) {
      res.error(999, 'Nope');
    });

    var obj = new Parse.Object('BeforeSaveFailWithErrorCode');
    obj.set('foo', 'bar');
    obj.save().then(function() {
      fail('Should not have been able to save BeforeSaveFailWithErrorCode class.');
      done();
    }, function(error) {
      expect(error.code).toEqual(999);
      expect(error.message).toEqual('Nope');
      done();
    });
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

  it('test afterSave ran on created object and returned a promise', function(done) {
    Parse.Cloud.afterSave('AfterSaveTest2', function(req) {
        let obj = req.object;
        if(!obj.existed())
        {
            let promise = new Parse.Promise();
            setTimeout(function(){
                obj.set('proof', obj.id);
                obj.save().then(function(){
                    promise.resolve();
                });
            }, 1000);

            return promise;
        }
    });

    let obj = new Parse.Object('AfterSaveTest2');
    obj.save().then(function(){
        let query = new Parse.Query('AfterSaveTest2');
        query.equalTo('proof', obj.id);
        query.find().then(function(results) {
            expect(results.length).toEqual(1);
            let savedObject = results[0];
            expect(savedObject.get('proof')).toEqual(obj.id);
            done();
        },
        function(error) {
            fail(error);
            done();
        });
    });
  });

  // TODO: Fails on CI randomly as racing
  xit('test afterSave ignoring promise, object not found', function(done) {
    Parse.Cloud.afterSave('AfterSaveTest2', function(req) {
        let obj = req.object;
        if(!obj.existed())
        {
            let promise = new Parse.Promise();
            setTimeout(function(){
                obj.set('proof', obj.id);
                obj.save().then(function(){
                    promise.resolve();
                });
            }, 1000);

            return promise;
        }
    });

    let obj = new Parse.Object('AfterSaveTest2');
    obj.save().then(function(){
        done();
    })

    let query = new Parse.Query('AfterSaveTest2');
    query.equalTo('proof', obj.id);
    query.find().then(function(results) {
        expect(results.length).toEqual(0);
    },
    function(error) {
        fail(error);
    });
  });

  it('test afterSave rejecting promise', function(done) {
      Parse.Cloud.afterSave('AfterSaveTest2', function(req) {
          let promise = new Parse.Promise();
          setTimeout(function(){
              promise.reject("THIS SHOULD BE IGNORED");
          }, 1000);

          return promise;
      });

      let obj = new Parse.Object('AfterSaveTest2');
      obj.save().then(function(){
          done();
      }, function(error){
          fail(error);
          done();
      })
  });

  it('test afterDelete returning promise, object is deleted when destroy resolves', function(done) {
      Parse.Cloud.afterDelete('AfterDeleteTest2', function(req) {
        let promise = new Parse.Promise();

        setTimeout(function(){
            let obj = new Parse.Object('AfterDeleteTestProof');
            obj.set('proof', req.object.id);
            obj.save().then(function(){
                promise.resolve();
            });

        }, 1000);

        return promise;
      });

      let errorHandler = function(error) {
          fail(error);
          done();
      }

      let obj = new Parse.Object('AfterDeleteTest2');
      obj.save().then(function(){
          obj.destroy().then(function(){
              let query = new Parse.Query('AfterDeleteTestProof');
              query.equalTo('proof', obj.id);
              query.find().then(function(results) {
                  expect(results.length).toEqual(1);
                  let deletedObject = results[0];
                  expect(deletedObject.get('proof')).toEqual(obj.id);
                  done();
              }, errorHandler);
          }, errorHandler)
      }, errorHandler);
  });

  it('test afterDelete ignoring promise, object is not yet deleted', function(done) {
      Parse.Cloud.afterDelete('AfterDeleteTest2', function(req) {
        let promise = new Parse.Promise();

        setTimeout(function(){
            let obj = new Parse.Object('AfterDeleteTestProof');
            obj.set('proof', req.object.id);
            obj.save().then(function(){
                promise.resolve();
            });

        }, 1000);

        return promise;
      });

      let errorHandler = function(error) {
          fail(error);
          done();
      }

      let obj = new Parse.Object('AfterDeleteTest2');
      obj.save().then(function(){
          obj.destroy().then(function(){
              done();
          })

          let query = new Parse.Query('AfterDeleteTestProof');
          query.equalTo('proof', obj.id);
          query.find().then(function(results) {
              expect(results.length).toEqual(0);
          }, errorHandler);
      }, errorHandler);
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

  it('test cloud function request params types', function(done) {
    Parse.Cloud.define('params', function(req, res) {
      expect(req.params.date instanceof Date).toBe(true);
      expect(req.params.date.getTime()).toBe(1463907600000);
      expect(req.params.dateList[0] instanceof Date).toBe(true);
      expect(req.params.dateList[0].getTime()).toBe(1463907600000);
      expect(req.params.complexStructure.date[0] instanceof Date).toBe(true);
      expect(req.params.complexStructure.date[0].getTime()).toBe(1463907600000);
      expect(req.params.complexStructure.deepDate.date[0] instanceof Date).toBe(true);
      expect(req.params.complexStructure.deepDate.date[0].getTime()).toBe(1463907600000);
      expect(req.params.complexStructure.deepDate2[0].date instanceof Date).toBe(true);
      expect(req.params.complexStructure.deepDate2[0].date.getTime()).toBe(1463907600000);
      // Regression for #2294
      expect(req.params.file instanceof Parse.File).toBe(true);
      expect(req.params.file.url()).toEqual('https://some.url');
      // Regression for #2204
      expect(req.params.array).toEqual(['a', 'b', 'c']);
      expect(Array.isArray(req.params.array)).toBe(true);
      expect(req.params.arrayOfArray).toEqual([['a', 'b', 'c'], ['d', 'e','f']]);
      expect(Array.isArray(req.params.arrayOfArray)).toBe(true);
      expect(Array.isArray(req.params.arrayOfArray[0])).toBe(true);
      expect(Array.isArray(req.params.arrayOfArray[1])).toBe(true);
      return res.success({});
    });

    let params = {
      'date': {
        '__type': 'Date',
        'iso': '2016-05-22T09:00:00.000Z'
      },
      'dateList': [
        {
          '__type': 'Date',
          'iso': '2016-05-22T09:00:00.000Z'
        }
      ],
      'lol': 'hello',
      'complexStructure': {
        'date': [
          {
            '__type': 'Date',
            'iso': '2016-05-22T09:00:00.000Z'
          }
        ],
        'deepDate': {
          'date': [
            {
              '__type': 'Date',
              'iso': '2016-05-22T09:00:00.000Z'
            }
          ]
        },
        'deepDate2': [
          {
            'date': {
              '__type': 'Date',
              'iso': '2016-05-22T09:00:00.000Z'
            }
          }
        ]
      },
      'file': Parse.File.fromJSON({
        __type: 'File',
        name: 'name',
        url: 'https://some.url'
      }),
      'array': ['a', 'b', 'c'],
      'arrayOfArray': [['a', 'b', 'c'], ['d', 'e', 'f']]
    };
    Parse.Cloud.run('params', params).then((result) => {
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
  
  it('beforeSave change propagates through the afterSave #1931', (done) => {
    Parse.Cloud.beforeSave('ChangingObject', function(request, response) {
      request.object.unset('file');
      request.object.unset('date');
      response.success();
    });

    Parse.Cloud.afterSave('ChangingObject', function(request, response) {
      let json = request.object.toJSON();
      expect(request.object.has("file")).toBe(false);
      expect(request.object.has("date")).toBe(false);
      expect(request.object.get('file')).toBeUndefined();
      return Promise.resolve();
    });
    let file = new Parse.File("yolo.txt", [1,2,3], "text/plain");
    file.save().then(() => {
      let obj = new Parse.Object('ChangingObject');
      return obj.save({ file, date: new Date() })
    }).then(() => {
      done();
    }, () => {
      fail();
      done();
    })
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
    let session1;
    let session2;
    let user;
    const cacheAdapter = new InMemoryCacheAdapter({ ttl: 100000000 });
    reconfigureServer({ cacheAdapter })
    .then(() => {
      Parse.Cloud.define('checkStaleUser', (request, response) => {
        response.success(request.user.get('data'));
      });

      user = new Parse.User();
      user.set('username', 'test');
      user.set('password', 'moon-y');
      user.set('data', 'first data');
      return user.signUp();
    })
    .then(user => {
      session1 = user.getSessionToken();
      return rp({
        uri: 'http://localhost:8378/1/login?username=test&password=moon-y',
        json: true,
        headers: {
          'X-Parse-Application-Id': 'test',
          'X-Parse-REST-API-Key': 'rest',
        },
      })
    })
    .then(body => {
      session2 = body.sessionToken;

      //Ensure both session tokens are in the cache
      return Parse.Cloud.run('checkStaleUser')
    })
    .then(() => rp({
      method: 'POST',
      uri: 'http://localhost:8378/1/functions/checkStaleUser',
      json: true,
      headers: {
        'X-Parse-Application-Id': 'test',
        'X-Parse-REST-API-Key': 'rest',
        'X-Parse-Session-Token': session2,
      }
    }))
    .then(() => Parse.Promise.all([cacheAdapter.get('test:user:' + session1), cacheAdapter.get('test:user:' + session2)]))
    .then(cachedVals => {
      expect(cachedVals[0].objectId).toEqual(user.id);
      expect(cachedVals[1].objectId).toEqual(user.id);

      //Change with session 1 and then read with session 2.
      user.set('data', 'second data');
      return user.save()
    })
    .then(() => rp({
      method: 'POST',
      uri: 'http://localhost:8378/1/functions/checkStaleUser',
      json: true,
      headers: {
        'X-Parse-Application-Id': 'test',
        'X-Parse-REST-API-Key': 'rest',
        'X-Parse-Session-Token': session2,
      }
    }))
    .then(body => {
      expect(body.result).toEqual('second data');
      done();
    })
    .catch(error => {
      fail(JSON.stringify(error));
      done();
    });
  });

  it('trivial beforeSave should not affect fetched pointers (regression test for #1238)', done => {
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

it('beforeSave should not affect fetched pointers', done => {
    Parse.Cloud.beforeSave('BeforeSaveUnchanged', (req, res) => {
      res.success();
    });

    Parse.Cloud.beforeSave('BeforeSaveChanged', function(req, res) {
      req.object.set('foo', 'baz');
      res.success();
    });

    var TestObject =  Parse.Object.extend("TestObject");
    var BeforeSaveUnchangedObject = Parse.Object.extend("BeforeSaveUnchanged");
    var BeforeSaveChangedObject = Parse.Object.extend("BeforeSaveChanged");

    var aTestObject = new TestObject();
    aTestObject.set("foo", "bar");
    aTestObject.save()
    .then(aTestObject => {
      var aBeforeSaveUnchangedObject = new BeforeSaveUnchangedObject();
      aBeforeSaveUnchangedObject.set("aTestObject", aTestObject);
      expect(aBeforeSaveUnchangedObject.get("aTestObject").get("foo")).toEqual("bar");
      return aBeforeSaveUnchangedObject.save();
    })
    .then(aBeforeSaveUnchangedObject => {
      expect(aBeforeSaveUnchangedObject.get("aTestObject").get("foo")).toEqual("bar");

      var aBeforeSaveChangedObject = new BeforeSaveChangedObject();
      aBeforeSaveChangedObject.set("aTestObject", aTestObject);
      expect(aBeforeSaveChangedObject.get("aTestObject").get("foo")).toEqual("bar");
      return aBeforeSaveChangedObject.save();
    })
    .then(aBeforeSaveChangedObject => {
      expect(aBeforeSaveChangedObject.get("aTestObject").get("foo")).toEqual("bar");
      expect(aBeforeSaveChangedObject.get("foo")).toEqual("baz");
      done();
    });
  });

  it('should fully delete objects when using `unset` with beforeSave (regression test for #1840)', done => {
    var TestObject = Parse.Object.extend('TestObject');
    var NoBeforeSaveObject = Parse.Object.extend('NoBeforeSave');
    var BeforeSaveObject = Parse.Object.extend('BeforeSaveChanged');

    Parse.Cloud.beforeSave('BeforeSaveChanged', (req, res) => {
      var object = req.object;
      object.set('before', 'save');
      res.success();
    });

    Parse.Cloud.define('removeme', (req, res) => {
      var testObject = new TestObject();
      testObject.save()
      .then(testObject => {
        var object = new NoBeforeSaveObject({remove: testObject});
        return object.save();
      })
      .then(object => {
        object.unset('remove');
        return object.save();
      })
      .then(object => {
        res.success(object);
      }).catch(res.error);
    });

    Parse.Cloud.define('removeme2', (req, res) => {
      var testObject = new TestObject();
      testObject.save()
      .then(testObject => {
        var object = new BeforeSaveObject({remove: testObject});
        return object.save();
      })
      .then(object => {
        object.unset('remove');
        return object.save();
      })
      .then(object => {
        res.success(object);
      }).catch(res.error);
    });

    Parse.Cloud.run('removeme')
    .then(aNoBeforeSaveObj => {
      expect(aNoBeforeSaveObj.get('remove')).toEqual(undefined);

      return Parse.Cloud.run('removeme2');
    })
    .then(aBeforeSaveObj => {
      expect(aBeforeSaveObj.get('before')).toEqual('save');
      expect(aBeforeSaveObj.get('remove')).toEqual(undefined);
      done();
    }).catch((err) => {
      jfail(err);
      done();
    });
  });

  /*
    TODO: fix for Postgres
    trying to delete a field that doesn't exists doesn't play nice
   */
  it_exclude_dbs(['postgres'])('should fully delete objects when using `unset` with beforeSave (regression test for #1840)', done => {
    var TestObject = Parse.Object.extend('TestObject');
    var BeforeSaveObject = Parse.Object.extend('BeforeSaveChanged');

    Parse.Cloud.beforeSave('BeforeSaveChanged', (req, res) => {
      var object = req.object;
      object.set('before', 'save');
      object.unset('remove');
      res.success();
    });

    let object;
    let testObject = new TestObject({key: 'value'});
    testObject.save().then(() => {
       object = new BeforeSaveObject();
       return object.save().then(() => {
          object.set({remove:testObject})
          return object.save();
       });
    }).then((objectAgain) => {
       expect(objectAgain.get('remove')).toBeUndefined();
       expect(object.get('remove')).toBeUndefined();
       done();
    }).fail((err) => {
      jfail(err);
      done();
    });
  });

  it('should not include relation op (regression test for #1606)', done => {
    var TestObject = Parse.Object.extend('TestObject');
    var BeforeSaveObject = Parse.Object.extend('BeforeSaveChanged');
    let testObj;
    Parse.Cloud.beforeSave('BeforeSaveChanged', (req, res) => {
      var object = req.object;
      object.set('before', 'save');
      testObj = new TestObject();
      testObj.save().then(() => {
        object.relation('testsRelation').add(testObj);
        res.success();
      }, res.error);
    });

    let object = new BeforeSaveObject();
    object.save().then((objectAgain) => {
      // Originally it would throw as it would be a non-relation
      expect(() => { objectAgain.relation('testsRelation') }).not.toThrow();
      done();
    }).fail((err) => {
      jfail(err);
      done();
    })
  });

  describe('cloud jobs', () => {
    it('should define a job', (done) => {
      expect(() => {
        Parse.Cloud.job('myJob', (req, res) => {
          res.success();
        });
      }).not.toThrow();
      
      rp.post({
        url: 'http://localhost:8378/1/jobs/myJob',
        headers: {
          'X-Parse-Application-Id': Parse.applicationId,
          'X-Parse-Master-Key': Parse.masterKey,
        },
      }).then((result) => {
        done();
      }, (err) =>  {
        fail(err);
        done();
      });
    });

    it('should not run without master key', (done) => {
      expect(() => {
        Parse.Cloud.job('myJob', (req, res) => {
          res.success();
        });
      }).not.toThrow();
      
      rp.post({
        url: 'http://localhost:8378/1/jobs/myJob',
        headers: {
          'X-Parse-Application-Id': Parse.applicationId,
          'X-Parse-REST-API-Key': 'rest',
        },
      }).then((result) => {
        fail('Expected to be unauthorized');
        done();
      }, (err) =>  {
        expect(err.statusCode).toBe(403);
        done();
      });
    });

    it('should run with master key', (done) => {
      expect(() => {
        Parse.Cloud.job('myJob', (req, res) => {
          expect(req.functionName).toBeUndefined();
          expect(req.jobName).toBe('myJob');
          expect(typeof req.jobId).toBe('string');
          expect(typeof res.success).toBe('function');
          expect(typeof res.error).toBe('function');
          expect(typeof res.message).toBe('function');
          res.success();
          done();
        });
      }).not.toThrow();
      
      rp.post({
        url: 'http://localhost:8378/1/jobs/myJob',
        headers: {
          'X-Parse-Application-Id': Parse.applicationId,
          'X-Parse-Master-Key': Parse.masterKey,
        },
      }).then((response) => {
      }, (err) =>  {
        fail(err);
        done();
      });
    });

    it('should run with master key basic auth', (done) => {
      expect(() => {
        Parse.Cloud.job('myJob', (req, res) => {
          expect(req.functionName).toBeUndefined();
          expect(req.jobName).toBe('myJob');
          expect(typeof req.jobId).toBe('string');
          expect(typeof res.success).toBe('function');
          expect(typeof res.error).toBe('function');
          expect(typeof res.message).toBe('function');
          res.success();
          done();
        });
      }).not.toThrow();
      
      rp.post({
        url: `http://${Parse.applicationId}:${Parse.masterKey}@localhost:8378/1/jobs/myJob`,
      }).then((response) => {
      }, (err) =>  {
        fail(err);
        done();
      });
    });

    it('should set the message / success on the job', (done) => {
      Parse.Cloud.job('myJob', (req, res) => {
        res.message('hello');
        res.message().then(() => {
          return getJobStatus(req.jobId);
        }).then((jobStatus) => {
          expect(jobStatus.get('message')).toEqual('hello');
          expect(jobStatus.get('status')).toEqual('running');
          return res.success().then(() => {
            return getJobStatus(req.jobId);
          });
        }).then((jobStatus) => {
          expect(jobStatus.get('message')).toEqual('hello');
          expect(jobStatus.get('status')).toEqual('succeeded');
          done();
        }).catch(err => {
          console.error(err);
          jfail(err);
          done();
        });
      });
      
      rp.post({
        url: 'http://localhost:8378/1/jobs/myJob',
        headers: {
          'X-Parse-Application-Id': Parse.applicationId,
          'X-Parse-Master-Key': Parse.masterKey,
        },
      }).then((response) => {
      }, (err) =>  {
        fail(err);
        done();
      });
    });

    it('should set the failure on the job', (done) => {
      Parse.Cloud.job('myJob', (req, res) => {
        res.error('Something went wrong').then(() => {
          return getJobStatus(req.jobId);
        }).then((jobStatus) => {
          expect(jobStatus.get('message')).toEqual('Something went wrong');
          expect(jobStatus.get('status')).toEqual('failed');
          done();
        }).catch(err => {
          jfail(err);
          done();
        });
      });
      
      rp.post({
        url: 'http://localhost:8378/1/jobs/myJob',
        headers: {
          'X-Parse-Application-Id': Parse.applicationId,
          'X-Parse-Master-Key': Parse.masterKey,
        },
      }).then((response) => {
      }, (err) =>  {
        fail(err);
        done();
      });
    });

    function getJobStatus(jobId) {
      let q = new Parse.Query('_JobStatus');
      return q.get(jobId, {useMasterKey: true});
    }
  });
});

describe('beforeFind hooks', () => {
  it('should add beforeFind trigger', (done) => {
    Parse.Cloud.beforeFind('MyObject', (req, res) => {
      let q = req.query;
      expect(q instanceof Parse.Query).toBe(true);
      let jsonQuery = q.toJSON();
      expect(jsonQuery.where.key).toEqual('value');
      expect(jsonQuery.where.some).toEqual({'$gt': 10});
      expect(jsonQuery.include).toEqual('otherKey,otherValue');
      expect(jsonQuery.limit).toEqual(100);
      expect(jsonQuery.skip).toBe(undefined);
    });

    let query = new Parse.Query('MyObject');
    query.equalTo('key', 'value');
    query.greaterThan('some', 10);
    query.include('otherKey');
    query.include('otherValue');
    query.find().then(() => {
      done();
    });
  });

  it('should use modify', (done) => {
    Parse.Cloud.beforeFind('MyObject', (req) => {
      let q = req.query;
      q.equalTo('forced', true);
    });

    let obj0 = new Parse.Object('MyObject');
    obj0.set('forced', false);

    let obj1 = new Parse.Object('MyObject');
    obj1.set('forced', true);
    Parse.Object.saveAll([obj0, obj1]).then(() => {
      let query = new Parse.Query('MyObject');
      query.equalTo('forced', false);
      query.find().then((results) => {
        expect(results.length).toBe(1);
        let firstResult = results[0];
        expect(firstResult.get('forced')).toBe(true);
        done();
      });
    });
  });

  it('should use the modified the query', (done) => {
    Parse.Cloud.beforeFind('MyObject', (req) => {
      let q = req.query;
      let otherQuery = new Parse.Query('MyObject');
      otherQuery.equalTo('forced', true);
      return Parse.Query.or(q, otherQuery);
    });

    let obj0 = new Parse.Object('MyObject');
    obj0.set('forced', false);

    let obj1 = new Parse.Object('MyObject');
    obj1.set('forced', true);
    Parse.Object.saveAll([obj0, obj1]).then(() => {
      let query = new Parse.Query('MyObject');
      query.equalTo('forced', false);
      query.find().then((results) => {
        expect(results.length).toBe(2);
        done();
      });
    });
  });

  it('should reject queries', (done) => {
    Parse.Cloud.beforeFind('MyObject', (req) => {
      return Promise.reject('Do not run that query');
    });

    let query = new Parse.Query('MyObject');
    query.find().then(() => {
      fail('should not succeed');
      done();
    }, (err) => {
      expect(err.code).toBe(1);
      expect(err.message).toEqual('Do not run that query');
      done();
    });
  });

  it('should handle empty where', (done) => {
    Parse.Cloud.beforeFind('MyObject', (req) => {
      let otherQuery = new Parse.Query('MyObject');
      otherQuery.equalTo('some', true);
      return Parse.Query.or(req.query, otherQuery);
    });

    rp.get({
      url: 'http://localhost:8378/1/classes/MyObject',
      headers: {
        'X-Parse-Application-Id': Parse.applicationId,
        'X-Parse-REST-API-Key': 'rest',
      },
    }).then((result) => {
      done();
    }, (err) =>  {
      fail(err);
      done();
    });
  });
})
