'use strict';
const Config = require('../lib/Config');
const Parse = require('parse/node');
const request = require('../lib/request');
const InMemoryCacheAdapter = require('../lib/Adapters/Cache/InMemoryCacheAdapter')
  .InMemoryCacheAdapter;

describe('Cloud Code', () => {
  it('can load absolute cloud code file', done => {
    reconfigureServer({
      cloud: __dirname + '/cloud/cloudCodeRelativeFile.js',
    }).then(() => {
      Parse.Cloud.run('cloudCodeInFile', {}).then(result => {
        expect(result).toEqual(
          'It is possible to define cloud code in a file.'
        );
        done();
      });
    });
  });

  it('can load relative cloud code file', done => {
    reconfigureServer({ cloud: './spec/cloud/cloudCodeAbsoluteFile.js' }).then(
      () => {
        Parse.Cloud.run('cloudCodeInFile', {}).then(result => {
          expect(result).toEqual(
            'It is possible to define cloud code in a file.'
          );
          done();
        });
      }
    );
  });

  it('can create functions', done => {
    Parse.Cloud.define('hello', () => {
      return 'Hello world!';
    });

    Parse.Cloud.run('hello', {}).then(result => {
      expect(result).toEqual('Hello world!');
      done();
    });
  });

  it('is cleared cleared after the previous test', done => {
    Parse.Cloud.run('hello', {}).catch(error => {
      expect(error.code).toEqual(141);
      done();
    });
  });

  it('basic beforeSave rejection', function(done) {
    Parse.Cloud.beforeSave('BeforeSaveFail', function() {
      throw new Error('You shall not pass!');
    });

    const obj = new Parse.Object('BeforeSaveFail');
    obj.set('foo', 'bar');
    obj.save().then(
      () => {
        fail('Should not have been able to save BeforeSaveFailure class.');
        done();
      },
      () => {
        done();
      }
    );
  });

  it('returns an error', done => {
    Parse.Cloud.define('cloudCodeWithError', () => {
      /* eslint-disable no-undef */
      foo.bar();
      /* eslint-enable no-undef */
      return 'I better throw an error.';
    });

    Parse.Cloud.run('cloudCodeWithError').then(
      () => done.fail('should not succeed'),
      e => {
        expect(e).toEqual(new Parse.Error(141, 'foo is not defined'));
        done();
      }
    );
  });

  it('beforeSave rejection with custom error code', function(done) {
    Parse.Cloud.beforeSave('BeforeSaveFailWithErrorCode', function() {
      throw new Parse.Error(999, 'Nope');
    });

    const obj = new Parse.Object('BeforeSaveFailWithErrorCode');
    obj.set('foo', 'bar');
    obj.save().then(
      function() {
        fail(
          'Should not have been able to save BeforeSaveFailWithErrorCode class.'
        );
        done();
      },
      function(error) {
        expect(error.code).toEqual(999);
        expect(error.message).toEqual('Nope');
        done();
      }
    );
  });

  it('basic beforeSave rejection via promise', function(done) {
    Parse.Cloud.beforeSave('BeforeSaveFailWithPromise', function() {
      const query = new Parse.Query('Yolo');
      return query.find().then(
        () => {
          throw 'Nope';
        },
        () => {
          return Promise.response();
        }
      );
    });

    const obj = new Parse.Object('BeforeSaveFailWithPromise');
    obj.set('foo', 'bar');
    obj.save().then(
      function() {
        fail('Should not have been able to save BeforeSaveFailure class.');
        done();
      },
      function(error) {
        expect(error.code).toEqual(Parse.Error.SCRIPT_FAILED);
        expect(error.message).toEqual('Nope');
        done();
      }
    );
  });

  it('test beforeSave changed object success', function(done) {
    Parse.Cloud.beforeSave('BeforeSaveChanged', function(req) {
      req.object.set('foo', 'baz');
    });

    const obj = new Parse.Object('BeforeSaveChanged');
    obj.set('foo', 'bar');
    obj.save().then(
      function() {
        const query = new Parse.Query('BeforeSaveChanged');
        query.get(obj.id).then(
          function(objAgain) {
            expect(objAgain.get('foo')).toEqual('baz');
            done();
          },
          function(error) {
            fail(error);
            done();
          }
        );
      },
      function(error) {
        fail(error);
        done();
      }
    );
  });

  it("test beforeSave changed object fail doesn't change object", async function() {
    Parse.Cloud.beforeSave('BeforeSaveChanged', function(req) {
      if (req.object.has('fail')) {
        return Promise.reject(new Error('something went wrong'));
      }

      return Promise.resolve();
    });

    const obj = new Parse.Object('BeforeSaveChanged');
    obj.set('foo', 'bar');
    await obj.save();
    obj.set('foo', 'baz').set('fail', true);
    try {
      await obj.save();
    } catch (e) {
      await obj.fetch();
      expect(obj.get('foo')).toBe('bar');
    }
  });

  it('test beforeSave returns value on create and update', done => {
    Parse.Cloud.beforeSave('BeforeSaveChanged', function(req) {
      req.object.set('foo', 'baz');
    });

    const obj = new Parse.Object('BeforeSaveChanged');
    obj.set('foo', 'bing');
    obj.save().then(() => {
      expect(obj.get('foo')).toEqual('baz');
      obj.set('foo', 'bar');
      return obj.save().then(() => {
        expect(obj.get('foo')).toEqual('baz');
        done();
      });
    });
  });

  it('test beforeSave applies changes when beforeSave returns true', done => {
    Parse.Cloud.beforeSave('Insurance', function(req) {
      req.object.set('rate', '$49.99/Month');
      return true;
    });

    const insurance = new Parse.Object('Insurance');
    insurance.set('rate', '$5.00/Month');
    insurance.save().then(insurance => {
      expect(insurance.get('rate')).toEqual('$49.99/Month');
      done();
    });
  });

  it('test beforeSave applies changes and resolves returned promise', done => {
    Parse.Cloud.beforeSave('Insurance', function(req) {
      req.object.set('rate', '$49.99/Month');
      return new Parse.Query('Pet').get(req.object.get('pet').id).then(pet => {
        pet.set('healthy', true);
        return pet.save();
      });
    });

    const pet = new Parse.Object('Pet');
    pet.set('healthy', false);
    pet.save().then(pet => {
      const insurance = new Parse.Object('Insurance');
      insurance.set('pet', pet);
      insurance.set('rate', '$5.00/Month');
      insurance.save().then(insurance => {
        expect(insurance.get('rate')).toEqual('$49.99/Month');
        new Parse.Query('Pet').get(insurance.get('pet').id).then(pet => {
          expect(pet.get('healthy')).toEqual(true);
          done();
        });
      });
    });
  });

  it('beforeSave should be called only if user fulfills permissions', async () => {
    const triggeruser = new Parse.User();
    triggeruser.setUsername('triggeruser');
    triggeruser.setPassword('triggeruser');
    await triggeruser.signUp();

    const triggeruser2 = new Parse.User();
    triggeruser2.setUsername('triggeruser2');
    triggeruser2.setPassword('triggeruser2');
    await triggeruser2.signUp();

    const triggeruser3 = new Parse.User();
    triggeruser3.setUsername('triggeruser3');
    triggeruser3.setPassword('triggeruser3');
    await triggeruser3.signUp();

    const triggeruser4 = new Parse.User();
    triggeruser4.setUsername('triggeruser4');
    triggeruser4.setPassword('triggeruser4');
    await triggeruser4.signUp();

    const triggeruser5 = new Parse.User();
    triggeruser5.setUsername('triggeruser5');
    triggeruser5.setPassword('triggeruser5');
    await triggeruser5.signUp();

    const triggerroleacl = new Parse.ACL();
    triggerroleacl.setPublicReadAccess(true);

    const triggerrole = new Parse.Role();
    triggerrole.setName('triggerrole');
    triggerrole.setACL(triggerroleacl);
    triggerrole.getUsers().add(triggeruser);
    triggerrole.getUsers().add(triggeruser3);
    await triggerrole.save();

    const config = Config.get('test');
    const schema = await config.database.loadSchema();
    await schema.addClassIfNotExists(
      'triggerclass',
      {
        someField: { type: 'String' },
        pointerToUser: { type: 'Pointer', targetClass: '_User' },
      },
      {
        find: {
          'role:triggerrole': true,
          [triggeruser.id]: true,
          [triggeruser2.id]: true,
        },
        create: {
          'role:triggerrole': true,
          [triggeruser.id]: true,
          [triggeruser2.id]: true,
        },
        get: {
          'role:triggerrole': true,
          [triggeruser.id]: true,
          [triggeruser2.id]: true,
        },
        update: {
          'role:triggerrole': true,
          [triggeruser.id]: true,
          [triggeruser2.id]: true,
        },
        addField: {
          'role:triggerrole': true,
          [triggeruser.id]: true,
          [triggeruser2.id]: true,
        },
        delete: {
          'role:triggerrole': true,
          [triggeruser.id]: true,
          [triggeruser2.id]: true,
        },
        readUserFields: ['pointerToUser'],
        writeUserFields: ['pointerToUser'],
      },
      {}
    );

    let called = 0;
    Parse.Cloud.beforeSave('triggerclass', () => {
      called++;
    });

    const triggerobject = new Parse.Object('triggerclass');
    triggerobject.set('someField', 'someValue');
    triggerobject.set('someField2', 'someValue');
    const triggerobjectacl = new Parse.ACL();
    triggerobjectacl.setPublicReadAccess(false);
    triggerobjectacl.setPublicWriteAccess(false);
    triggerobjectacl.setRoleReadAccess(triggerrole, true);
    triggerobjectacl.setRoleWriteAccess(triggerrole, true);
    triggerobjectacl.setReadAccess(triggeruser.id, true);
    triggerobjectacl.setWriteAccess(triggeruser.id, true);
    triggerobjectacl.setReadAccess(triggeruser2.id, true);
    triggerobjectacl.setWriteAccess(triggeruser2.id, true);
    triggerobject.setACL(triggerobjectacl);

    await triggerobject.save(undefined, {
      sessionToken: triggeruser.getSessionToken(),
    });
    expect(called).toBe(1);
    await triggerobject.save(undefined, {
      sessionToken: triggeruser.getSessionToken(),
    });
    expect(called).toBe(2);
    await triggerobject.save(undefined, {
      sessionToken: triggeruser2.getSessionToken(),
    });
    expect(called).toBe(3);
    await triggerobject.save(undefined, {
      sessionToken: triggeruser3.getSessionToken(),
    });
    expect(called).toBe(4);

    const triggerobject2 = new Parse.Object('triggerclass');
    triggerobject2.set('someField', 'someValue');
    triggerobject2.set('someField22', 'someValue');
    const triggerobjectacl2 = new Parse.ACL();
    triggerobjectacl2.setPublicReadAccess(false);
    triggerobjectacl2.setPublicWriteAccess(false);
    triggerobjectacl2.setReadAccess(triggeruser.id, true);
    triggerobjectacl2.setWriteAccess(triggeruser.id, true);
    triggerobjectacl2.setReadAccess(triggeruser2.id, true);
    triggerobjectacl2.setWriteAccess(triggeruser2.id, true);
    triggerobjectacl2.setReadAccess(triggeruser5.id, true);
    triggerobjectacl2.setWriteAccess(triggeruser5.id, true);
    triggerobject2.setACL(triggerobjectacl2);

    await triggerobject2.save(undefined, {
      sessionToken: triggeruser2.getSessionToken(),
    });
    expect(called).toBe(5);
    await triggerobject2.save(undefined, {
      sessionToken: triggeruser2.getSessionToken(),
    });
    expect(called).toBe(6);
    await triggerobject2.save(undefined, {
      sessionToken: triggeruser.getSessionToken(),
    });
    expect(called).toBe(7);

    let catched = false;
    try {
      await triggerobject2.save(undefined, {
        sessionToken: triggeruser3.getSessionToken(),
      });
    } catch (e) {
      catched = true;
      expect(e.code).toBe(101);
    }
    expect(catched).toBe(true);
    expect(called).toBe(7);

    catched = false;
    try {
      await triggerobject2.save(undefined, {
        sessionToken: triggeruser4.getSessionToken(),
      });
    } catch (e) {
      catched = true;
      expect(e.code).toBe(101);
    }
    expect(catched).toBe(true);
    expect(called).toBe(7);

    catched = false;
    try {
      await triggerobject2.save(undefined, {
        sessionToken: triggeruser5.getSessionToken(),
      });
    } catch (e) {
      catched = true;
      expect(e.code).toBe(101);
    }
    expect(catched).toBe(true);
    expect(called).toBe(7);

    const triggerobject3 = new Parse.Object('triggerclass');
    triggerobject3.set('someField', 'someValue');
    triggerobject3.set('someField33', 'someValue');

    catched = false;
    try {
      await triggerobject3.save(undefined, {
        sessionToken: triggeruser4.getSessionToken(),
      });
    } catch (e) {
      catched = true;
      expect(e.code).toBe(119);
    }
    expect(catched).toBe(true);
    expect(called).toBe(7);

    catched = false;
    try {
      await triggerobject3.save(undefined, {
        sessionToken: triggeruser5.getSessionToken(),
      });
    } catch (e) {
      catched = true;
      expect(e.code).toBe(119);
    }
    expect(catched).toBe(true);
    expect(called).toBe(7);
  });

  it('test afterSave ran and created an object', function(done) {
    Parse.Cloud.afterSave('AfterSaveTest', function(req) {
      const obj = new Parse.Object('AfterSaveProof');
      obj.set('proof', req.object.id);
      obj.save().then(test);
    });

    const obj = new Parse.Object('AfterSaveTest');
    obj.save();

    function test() {
      const query = new Parse.Query('AfterSaveProof');
      query.equalTo('proof', obj.id);
      query.find().then(
        function(results) {
          expect(results.length).toEqual(1);
          done();
        },
        function(error) {
          fail(error);
          done();
        }
      );
    }
  });

  it('test afterSave ran on created object and returned a promise', function(done) {
    Parse.Cloud.afterSave('AfterSaveTest2', function(req) {
      const obj = req.object;
      if (!obj.existed()) {
        return new Promise(resolve => {
          setTimeout(function() {
            obj.set('proof', obj.id);
            obj.save().then(function() {
              resolve();
            });
          }, 1000);
        });
      }
    });

    const obj = new Parse.Object('AfterSaveTest2');
    obj.save().then(function() {
      const query = new Parse.Query('AfterSaveTest2');
      query.equalTo('proof', obj.id);
      query.find().then(
        function(results) {
          expect(results.length).toEqual(1);
          const savedObject = results[0];
          expect(savedObject.get('proof')).toEqual(obj.id);
          done();
        },
        function(error) {
          fail(error);
          done();
        }
      );
    });
  });

  // TODO: Fails on CI randomly as racing
  xit('test afterSave ignoring promise, object not found', function(done) {
    Parse.Cloud.afterSave('AfterSaveTest2', function(req) {
      const obj = req.object;
      if (!obj.existed()) {
        return new Promise(resolve => {
          setTimeout(function() {
            obj.set('proof', obj.id);
            obj.save().then(function() {
              resolve();
            });
          }, 1000);
        });
      }
    });

    const obj = new Parse.Object('AfterSaveTest2');
    obj.save().then(function() {
      done();
    });

    const query = new Parse.Query('AfterSaveTest2');
    query.equalTo('proof', obj.id);
    query.find().then(
      function(results) {
        expect(results.length).toEqual(0);
      },
      function(error) {
        fail(error);
      }
    );
  });

  it('test afterSave rejecting promise', function(done) {
    Parse.Cloud.afterSave('AfterSaveTest2', function() {
      return new Promise((resolve, reject) => {
        setTimeout(function() {
          reject('THIS SHOULD BE IGNORED');
        }, 1000);
      });
    });

    const obj = new Parse.Object('AfterSaveTest2');
    obj.save().then(
      function() {
        done();
      },
      function(error) {
        fail(error);
        done();
      }
    );
  });

  it('test afterDelete returning promise, object is deleted when destroy resolves', function(done) {
    Parse.Cloud.afterDelete('AfterDeleteTest2', function(req) {
      return new Promise(resolve => {
        setTimeout(function() {
          const obj = new Parse.Object('AfterDeleteTestProof');
          obj.set('proof', req.object.id);
          obj.save().then(function() {
            resolve();
          });
        }, 1000);
      });
    });

    const errorHandler = function(error) {
      fail(error);
      done();
    };

    const obj = new Parse.Object('AfterDeleteTest2');
    obj.save().then(function() {
      obj.destroy().then(function() {
        const query = new Parse.Query('AfterDeleteTestProof');
        query.equalTo('proof', obj.id);
        query.find().then(function(results) {
          expect(results.length).toEqual(1);
          const deletedObject = results[0];
          expect(deletedObject.get('proof')).toEqual(obj.id);
          done();
        }, errorHandler);
      }, errorHandler);
    }, errorHandler);
  });

  it('test afterDelete ignoring promise, object is not yet deleted', function(done) {
    Parse.Cloud.afterDelete('AfterDeleteTest2', function(req) {
      return new Promise(resolve => {
        setTimeout(function() {
          const obj = new Parse.Object('AfterDeleteTestProof');
          obj.set('proof', req.object.id);
          obj.save().then(function() {
            resolve();
          });
        }, 1000);
      });
    });

    const errorHandler = function(error) {
      fail(error);
      done();
    };

    const obj = new Parse.Object('AfterDeleteTest2');
    obj.save().then(function() {
      obj.destroy().then(function() {
        done();
      });

      const query = new Parse.Query('AfterDeleteTestProof');
      query.equalTo('proof', obj.id);
      query.find().then(function(results) {
        expect(results.length).toEqual(0);
      }, errorHandler);
    }, errorHandler);
  });

  it('test beforeSave happens on update', function(done) {
    Parse.Cloud.beforeSave('BeforeSaveChanged', function(req) {
      req.object.set('foo', 'baz');
    });

    const obj = new Parse.Object('BeforeSaveChanged');
    obj.set('foo', 'bar');
    obj
      .save()
      .then(function() {
        obj.set('foo', 'bar');
        return obj.save();
      })
      .then(
        function() {
          const query = new Parse.Query('BeforeSaveChanged');
          return query.get(obj.id).then(function(objAgain) {
            expect(objAgain.get('foo')).toEqual('baz');
            done();
          });
        },
        function(error) {
          fail(error);
          done();
        }
      );
  });

  it('test beforeDelete failure', function(done) {
    Parse.Cloud.beforeDelete('BeforeDeleteFail', function() {
      throw 'Nope';
    });

    const obj = new Parse.Object('BeforeDeleteFail');
    let id;
    obj.set('foo', 'bar');
    obj
      .save()
      .then(() => {
        id = obj.id;
        return obj.destroy();
      })
      .then(
        () => {
          fail('obj.destroy() should have failed, but it succeeded');
          done();
        },
        error => {
          expect(error.code).toEqual(Parse.Error.SCRIPT_FAILED);
          expect(error.message).toEqual('Nope');

          const objAgain = new Parse.Object('BeforeDeleteFail', {
            objectId: id,
          });
          return objAgain.fetch();
        }
      )
      .then(
        objAgain => {
          if (objAgain) {
            expect(objAgain.get('foo')).toEqual('bar');
          } else {
            fail('unable to fetch the object ', id);
          }
          done();
        },
        error => {
          // We should have been able to fetch the object again
          fail(error);
        }
      );
  });

  it('basic beforeDelete rejection via promise', function(done) {
    Parse.Cloud.beforeSave('BeforeDeleteFailWithPromise', function() {
      const query = new Parse.Query('Yolo');
      return query.find().then(() => {
        throw 'Nope';
      });
    });

    const obj = new Parse.Object('BeforeDeleteFailWithPromise');
    obj.set('foo', 'bar');
    obj.save().then(
      function() {
        fail('Should not have been able to save BeforeSaveFailure class.');
        done();
      },
      function(error) {
        expect(error.code).toEqual(Parse.Error.SCRIPT_FAILED);
        expect(error.message).toEqual('Nope');

        done();
      }
    );
  });

  it('test afterDelete ran and created an object', function(done) {
    Parse.Cloud.afterDelete('AfterDeleteTest', function(req) {
      const obj = new Parse.Object('AfterDeleteProof');
      obj.set('proof', req.object.id);
      obj.save().then(test);
    });

    const obj = new Parse.Object('AfterDeleteTest');
    obj.save().then(function() {
      obj.destroy();
    });

    function test() {
      const query = new Parse.Query('AfterDeleteProof');
      query.equalTo('proof', obj.id);
      query.find().then(
        function(results) {
          expect(results.length).toEqual(1);
          done();
        },
        function(error) {
          fail(error);
          done();
        }
      );
    }
  });

  it('test cloud function return types', function(done) {
    Parse.Cloud.define('foo', function() {
      return {
        object: {
          __type: 'Object',
          className: 'Foo',
          objectId: '123',
          x: 2,
          relation: {
            __type: 'Object',
            className: 'Bar',
            objectId: '234',
            x: 3,
          },
        },
        array: [
          {
            __type: 'Object',
            className: 'Bar',
            objectId: '345',
            x: 2,
          },
        ],
        a: 2,
      };
    });

    Parse.Cloud.run('foo').then(result => {
      expect(result.object instanceof Parse.Object).toBeTruthy();
      if (!result.object) {
        fail('Unable to run foo');
        done();
        return;
      }
      expect(result.object.className).toEqual('Foo');
      expect(result.object.get('x')).toEqual(2);
      const bar = result.object.get('relation');
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
    Parse.Cloud.define('params', function(req) {
      expect(req.params.date instanceof Date).toBe(true);
      expect(req.params.date.getTime()).toBe(1463907600000);
      expect(req.params.dateList[0] instanceof Date).toBe(true);
      expect(req.params.dateList[0].getTime()).toBe(1463907600000);
      expect(req.params.complexStructure.date[0] instanceof Date).toBe(true);
      expect(req.params.complexStructure.date[0].getTime()).toBe(1463907600000);
      expect(req.params.complexStructure.deepDate.date[0] instanceof Date).toBe(
        true
      );
      expect(req.params.complexStructure.deepDate.date[0].getTime()).toBe(
        1463907600000
      );
      expect(
        req.params.complexStructure.deepDate2[0].date instanceof Date
      ).toBe(true);
      expect(req.params.complexStructure.deepDate2[0].date.getTime()).toBe(
        1463907600000
      );
      // Regression for #2294
      expect(req.params.file instanceof Parse.File).toBe(true);
      expect(req.params.file.url()).toEqual('https://some.url');
      // Regression for #2204
      expect(req.params.array).toEqual(['a', 'b', 'c']);
      expect(Array.isArray(req.params.array)).toBe(true);
      expect(req.params.arrayOfArray).toEqual([
        ['a', 'b', 'c'],
        ['d', 'e', 'f'],
      ]);
      expect(Array.isArray(req.params.arrayOfArray)).toBe(true);
      expect(Array.isArray(req.params.arrayOfArray[0])).toBe(true);
      expect(Array.isArray(req.params.arrayOfArray[1])).toBe(true);
      return {};
    });

    const params = {
      date: {
        __type: 'Date',
        iso: '2016-05-22T09:00:00.000Z',
      },
      dateList: [
        {
          __type: 'Date',
          iso: '2016-05-22T09:00:00.000Z',
        },
      ],
      lol: 'hello',
      complexStructure: {
        date: [
          {
            __type: 'Date',
            iso: '2016-05-22T09:00:00.000Z',
          },
        ],
        deepDate: {
          date: [
            {
              __type: 'Date',
              iso: '2016-05-22T09:00:00.000Z',
            },
          ],
        },
        deepDate2: [
          {
            date: {
              __type: 'Date',
              iso: '2016-05-22T09:00:00.000Z',
            },
          },
        ],
      },
      file: Parse.File.fromJSON({
        __type: 'File',
        name: 'name',
        url: 'https://some.url',
      }),
      array: ['a', 'b', 'c'],
      arrayOfArray: [['a', 'b', 'c'], ['d', 'e', 'f']],
    };
    Parse.Cloud.run('params', params).then(() => {
      done();
    });
  });

  it('test cloud function should echo keys', function(done) {
    Parse.Cloud.define('echoKeys', function() {
      return {
        applicationId: Parse.applicationId,
        masterKey: Parse.masterKey,
        javascriptKey: Parse.javascriptKey,
      };
    });

    Parse.Cloud.run('echoKeys').then(result => {
      expect(result.applicationId).toEqual(Parse.applicationId);
      expect(result.masterKey).toEqual(Parse.masterKey);
      expect(result.javascriptKey).toEqual(Parse.javascriptKey);
      done();
    });
  });

  it('should properly create an object in before save', done => {
    Parse.Cloud.beforeSave('BeforeSaveChanged', function(req) {
      req.object.set('foo', 'baz');
    });

    Parse.Cloud.define('createBeforeSaveChangedObject', function() {
      const obj = new Parse.Object('BeforeSaveChanged');
      return obj.save().then(() => {
        return obj;
      });
    });

    Parse.Cloud.run('createBeforeSaveChangedObject').then(res => {
      expect(res.get('foo')).toEqual('baz');
      done();
    });
  });

  it('dirtyKeys are set on update', done => {
    let triggerTime = 0;
    // Register a mock beforeSave hook
    Parse.Cloud.beforeSave('GameScore', req => {
      const object = req.object;
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
        throw new Error();
      }
      triggerTime++;
    });

    const obj = new Parse.Object('GameScore');
    obj.set('foo', 'bar');
    obj.set('fooAgain', 'barAgain');
    obj
      .save()
      .then(() => {
        // We only update foo
        obj.set('foo', 'baz');
        return obj.save();
      })
      .then(
        () => {
          // Make sure the checking has been triggered
          expect(triggerTime).toBe(2);
          done();
        },
        function(error) {
          fail(error);
          done();
        }
      );
  });

  it('test beforeSave unchanged success', function(done) {
    Parse.Cloud.beforeSave('BeforeSaveUnchanged', function() {
      return;
    });

    const obj = new Parse.Object('BeforeSaveUnchanged');
    obj.set('foo', 'bar');
    obj.save().then(
      function() {
        done();
      },
      function(error) {
        fail(error);
        done();
      }
    );
  });

  it('test beforeDelete success', function(done) {
    Parse.Cloud.beforeDelete('BeforeDeleteTest', function() {
      return;
    });

    const obj = new Parse.Object('BeforeDeleteTest');
    obj.set('foo', 'bar');
    obj
      .save()
      .then(function() {
        return obj.destroy();
      })
      .then(
        function() {
          const objAgain = new Parse.Object('BeforeDeleteTest', obj.id);
          return objAgain.fetch().then(fail, () => done());
        },
        function(error) {
          fail(error);
          done();
        }
      );
  });

  it('test save triggers get user', async done => {
    Parse.Cloud.beforeSave('SaveTriggerUser', function(req) {
      if (req.user && req.user.id) {
        return;
      } else {
        throw new Error('No user present on request object for beforeSave.');
      }
    });

    Parse.Cloud.afterSave('SaveTriggerUser', function(req) {
      if (!req.user || !req.user.id) {
        console.log('No user present on request object for afterSave.');
      }
    });

    const user = new Parse.User();
    user.set('password', 'asdf');
    user.set('email', 'asdf@example.com');
    user.set('username', 'zxcv');
    await user.signUp();
    const obj = new Parse.Object('SaveTriggerUser');
    obj.save().then(
      function() {
        done();
      },
      function(error) {
        fail(error);
        done();
      }
    );
  });

  it('beforeSave change propagates through the save response', done => {
    Parse.Cloud.beforeSave('ChangingObject', function(request) {
      request.object.set('foo', 'baz');
    });
    const obj = new Parse.Object('ChangingObject');
    obj.save({ foo: 'bar' }).then(
      objAgain => {
        expect(objAgain.get('foo')).toEqual('baz');
        done();
      },
      () => {
        fail('Should not have failed to save.');
        done();
      }
    );
  });

  it('beforeSave change propagates through the afterSave #1931', done => {
    Parse.Cloud.beforeSave('ChangingObject', function(request) {
      request.object.unset('file');
      request.object.unset('date');
    });

    Parse.Cloud.afterSave('ChangingObject', function(request) {
      expect(request.object.has('file')).toBe(false);
      expect(request.object.has('date')).toBe(false);
      expect(request.object.get('file')).toBeUndefined();
      return Promise.resolve();
    });
    const file = new Parse.File('yolo.txt', [1, 2, 3], 'text/plain');
    file
      .save()
      .then(() => {
        const obj = new Parse.Object('ChangingObject');
        return obj.save({ file, date: new Date() });
      })
      .then(
        () => {
          done();
        },
        () => {
          fail();
          done();
        }
      );
  });

  it('test cloud function parameter validation success', done => {
    // Register a function with validation
    Parse.Cloud.define(
      'functionWithParameterValidation',
      () => {
        return 'works';
      },
      request => {
        return request.params.success === 100;
      }
    );

    Parse.Cloud.run('functionWithParameterValidation', { success: 100 }).then(
      () => {
        done();
      },
      () => {
        fail('Validation should not have failed.');
        done();
      }
    );
  });

  it('doesnt receive stale user in cloud code functions after user has been updated with master key (regression test for #1836)', done => {
    Parse.Cloud.define('testQuery', function(request) {
      return request.user.get('data');
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
        return Parse.User.current().save(null, { useMasterKey: true });
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
        Parse.Cloud.define('checkStaleUser', request => {
          return request.user.get('data');
        });

        user = new Parse.User();
        user.set('username', 'test');
        user.set('password', 'moon-y');
        user.set('data', 'first data');
        return user.signUp();
      })
      .then(user => {
        session1 = user.getSessionToken();
        return request({
          url: 'http://localhost:8378/1/login?username=test&password=moon-y',
          headers: {
            'X-Parse-Application-Id': 'test',
            'X-Parse-REST-API-Key': 'rest',
          },
        });
      })
      .then(response => {
        session2 = response.data.sessionToken;
        //Ensure both session tokens are in the cache
        return Parse.Cloud.run('checkStaleUser', { sessionToken: session2 });
      })
      .then(() =>
        request({
          method: 'POST',
          url: 'http://localhost:8378/1/functions/checkStaleUser',
          headers: {
            'X-Parse-Application-Id': 'test',
            'X-Parse-REST-API-Key': 'rest',
            'X-Parse-Session-Token': session2,
          },
        })
      )
      .then(() =>
        Promise.all([
          cacheAdapter.get('test:user:' + session1),
          cacheAdapter.get('test:user:' + session2),
        ])
      )
      .then(cachedVals => {
        expect(cachedVals[0].objectId).toEqual(user.id);
        expect(cachedVals[1].objectId).toEqual(user.id);

        //Change with session 1 and then read with session 2.
        user.set('data', 'second data');
        return user.save();
      })
      .then(() =>
        request({
          method: 'POST',
          url: 'http://localhost:8378/1/functions/checkStaleUser',
          headers: {
            'X-Parse-Application-Id': 'test',
            'X-Parse-REST-API-Key': 'rest',
            'X-Parse-Session-Token': session2,
          },
        })
      )
      .then(response => {
        expect(response.data.result).toEqual('second data');
        done();
      })
      .catch(done.fail);
  });

  it('trivial beforeSave should not affect fetched pointers (regression test for #1238)', done => {
    Parse.Cloud.beforeSave('BeforeSaveUnchanged', () => {});

    const TestObject = Parse.Object.extend('TestObject');
    const NoBeforeSaveObject = Parse.Object.extend('NoBeforeSave');
    const BeforeSaveObject = Parse.Object.extend('BeforeSaveUnchanged');

    const aTestObject = new TestObject();
    aTestObject.set('foo', 'bar');
    aTestObject
      .save()
      .then(aTestObject => {
        const aNoBeforeSaveObj = new NoBeforeSaveObject();
        aNoBeforeSaveObj.set('aTestObject', aTestObject);
        expect(aNoBeforeSaveObj.get('aTestObject').get('foo')).toEqual('bar');
        return aNoBeforeSaveObj.save();
      })
      .then(aNoBeforeSaveObj => {
        expect(aNoBeforeSaveObj.get('aTestObject').get('foo')).toEqual('bar');

        const aBeforeSaveObj = new BeforeSaveObject();
        aBeforeSaveObj.set('aTestObject', aTestObject);
        expect(aBeforeSaveObj.get('aTestObject').get('foo')).toEqual('bar');
        return aBeforeSaveObj.save();
      })
      .then(aBeforeSaveObj => {
        expect(aBeforeSaveObj.get('aTestObject').get('foo')).toEqual('bar');
        done();
      });
  });

  it('beforeSave should not affect fetched pointers', done => {
    Parse.Cloud.beforeSave('BeforeSaveUnchanged', () => {});

    Parse.Cloud.beforeSave('BeforeSaveChanged', function(req) {
      req.object.set('foo', 'baz');
    });

    const TestObject = Parse.Object.extend('TestObject');
    const BeforeSaveUnchangedObject = Parse.Object.extend(
      'BeforeSaveUnchanged'
    );
    const BeforeSaveChangedObject = Parse.Object.extend('BeforeSaveChanged');

    const aTestObject = new TestObject();
    aTestObject.set('foo', 'bar');
    aTestObject
      .save()
      .then(aTestObject => {
        const aBeforeSaveUnchangedObject = new BeforeSaveUnchangedObject();
        aBeforeSaveUnchangedObject.set('aTestObject', aTestObject);
        expect(
          aBeforeSaveUnchangedObject.get('aTestObject').get('foo')
        ).toEqual('bar');
        return aBeforeSaveUnchangedObject.save();
      })
      .then(aBeforeSaveUnchangedObject => {
        expect(
          aBeforeSaveUnchangedObject.get('aTestObject').get('foo')
        ).toEqual('bar');

        const aBeforeSaveChangedObject = new BeforeSaveChangedObject();
        aBeforeSaveChangedObject.set('aTestObject', aTestObject);
        expect(aBeforeSaveChangedObject.get('aTestObject').get('foo')).toEqual(
          'bar'
        );
        return aBeforeSaveChangedObject.save();
      })
      .then(aBeforeSaveChangedObject => {
        expect(aBeforeSaveChangedObject.get('aTestObject').get('foo')).toEqual(
          'bar'
        );
        expect(aBeforeSaveChangedObject.get('foo')).toEqual('baz');
        done();
      });
  });

  it('should fully delete objects when using `unset` with beforeSave (regression test for #1840)', done => {
    const TestObject = Parse.Object.extend('TestObject');
    const NoBeforeSaveObject = Parse.Object.extend('NoBeforeSave');
    const BeforeSaveObject = Parse.Object.extend('BeforeSaveChanged');

    Parse.Cloud.beforeSave('BeforeSaveChanged', req => {
      const object = req.object;
      object.set('before', 'save');
    });

    Parse.Cloud.define('removeme', (req, res) => {
      const testObject = new TestObject();
      return testObject
        .save()
        .then(testObject => {
          const object = new NoBeforeSaveObject({ remove: testObject });
          return object.save();
        })
        .then(object => {
          object.unset('remove');
          return object.save();
        })
        .catch(res.error);
    });

    Parse.Cloud.define('removeme2', (req, res) => {
      const testObject = new TestObject();
      return testObject
        .save()
        .then(testObject => {
          const object = new BeforeSaveObject({ remove: testObject });
          return object.save();
        })
        .then(object => {
          object.unset('remove');
          return object.save();
        })
        .catch(res.error);
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
      })
      .catch(err => {
        jfail(err);
        done();
      });
  });

  /*
    TODO: fix for Postgres
    trying to delete a field that doesn't exists doesn't play nice
   */
  it_exclude_dbs(['postgres'])(
    'should fully delete objects when using `unset` and `set` with beforeSave (regression test for #1840)',
    done => {
      const TestObject = Parse.Object.extend('TestObject');
      const BeforeSaveObject = Parse.Object.extend('BeforeSaveChanged');

      Parse.Cloud.beforeSave('BeforeSaveChanged', req => {
        const object = req.object;
        object.set('before', 'save');
        object.unset('remove');
      });

      let object;
      const testObject = new TestObject({ key: 'value' });
      testObject
        .save()
        .then(() => {
          object = new BeforeSaveObject();
          return object.save().then(() => {
            object.set({ remove: testObject });
            return object.save();
          });
        })
        .then(objectAgain => {
          expect(objectAgain.get('remove')).toBeUndefined();
          expect(object.get('remove')).toBeUndefined();
          done();
        })
        .catch(err => {
          jfail(err);
          done();
        });
    }
  );

  it('should not include relation op (regression test for #1606)', done => {
    const TestObject = Parse.Object.extend('TestObject');
    const BeforeSaveObject = Parse.Object.extend('BeforeSaveChanged');
    let testObj;
    Parse.Cloud.beforeSave('BeforeSaveChanged', req => {
      const object = req.object;
      object.set('before', 'save');
      testObj = new TestObject();
      return testObj.save().then(() => {
        object.relation('testsRelation').add(testObj);
      });
    });

    const object = new BeforeSaveObject();
    object
      .save()
      .then(objectAgain => {
        // Originally it would throw as it would be a non-relation
        expect(() => {
          objectAgain.relation('testsRelation');
        }).not.toThrow();
        done();
      })
      .catch(err => {
        jfail(err);
        done();
      });
  });

  /**
   * Checks that incrementing a value to a zero in a beforeSave hook
   * does not result in that key being omitted from the response.
   */
  it('before save increment does not return undefined', done => {
    Parse.Cloud.define('cloudIncrementClassFunction', function(req) {
      const CloudIncrementClass = Parse.Object.extend('CloudIncrementClass');
      const obj = new CloudIncrementClass();
      obj.id = req.params.objectId;
      return obj.save();
    });

    Parse.Cloud.beforeSave('CloudIncrementClass', function(req) {
      const obj = req.object;
      if (!req.master) {
        obj.increment('points', -10);
        obj.increment('num', -9);
      }
    });

    const CloudIncrementClass = Parse.Object.extend('CloudIncrementClass');
    const obj = new CloudIncrementClass();
    obj.set('points', 10);
    obj.set('num', 10);
    obj.save(null, { useMasterKey: true }).then(function() {
      Parse.Cloud.run('cloudIncrementClassFunction', { objectId: obj.id }).then(
        function(savedObj) {
          expect(savedObj.get('num')).toEqual(1);
          expect(savedObj.get('points')).toEqual(0);
          done();
        }
      );
    });
  });

  /**
   * Verifies that an afterSave hook throwing an exception
   * will not prevent a successful save response from being returned
   */
  it('should succeed on afterSave exception', done => {
    Parse.Cloud.afterSave('AfterSaveTestClass', function() {
      throw 'Exception';
    });
    const AfterSaveTestClass = Parse.Object.extend('AfterSaveTestClass');
    const obj = new AfterSaveTestClass();
    obj.save().then(done, done.fail);
  });

  describe('cloud jobs', () => {
    it('should define a job', done => {
      expect(() => {
        Parse.Cloud.job('myJob', () => {});
      }).not.toThrow();

      request({
        method: 'POST',
        url: 'http://localhost:8378/1/jobs/myJob',
        headers: {
          'X-Parse-Application-Id': Parse.applicationId,
          'X-Parse-Master-Key': Parse.masterKey,
        },
      }).then(
        () => {
          done();
        },
        err => {
          fail(err);
          done();
        }
      );
    });

    it('should not run without master key', done => {
      expect(() => {
        Parse.Cloud.job('myJob', () => {});
      }).not.toThrow();

      request({
        method: 'POST',
        url: 'http://localhost:8378/1/jobs/myJob',
        headers: {
          'X-Parse-Application-Id': Parse.applicationId,
          'X-Parse-REST-API-Key': 'rest',
        },
      }).then(
        () => {
          fail('Expected to be unauthorized');
          done();
        },
        err => {
          expect(err.status).toBe(403);
          done();
        }
      );
    });

    it('should run with master key', done => {
      expect(() => {
        Parse.Cloud.job('myJob', (req, res) => {
          expect(req.functionName).toBeUndefined();
          expect(req.jobName).toBe('myJob');
          expect(typeof req.jobId).toBe('string');
          expect(typeof req.message).toBe('function');
          expect(typeof res).toBe('undefined');
          done();
        });
      }).not.toThrow();

      request({
        method: 'POST',
        url: 'http://localhost:8378/1/jobs/myJob',
        headers: {
          'X-Parse-Application-Id': Parse.applicationId,
          'X-Parse-Master-Key': Parse.masterKey,
        },
      }).then(
        () => {},
        err => {
          fail(err);
          done();
        }
      );
    });

    it('should run with master key basic auth', done => {
      expect(() => {
        Parse.Cloud.job('myJob', (req, res) => {
          expect(req.functionName).toBeUndefined();
          expect(req.jobName).toBe('myJob');
          expect(typeof req.jobId).toBe('string');
          expect(typeof req.message).toBe('function');
          expect(typeof res).toBe('undefined');
          done();
        });
      }).not.toThrow();

      request({
        method: 'POST',
        url: `http://${Parse.applicationId}:${Parse.masterKey}@localhost:8378/1/jobs/myJob`,
      }).then(
        () => {},
        err => {
          fail(err);
          done();
        }
      );
    });

    it('should set the message / success on the job', done => {
      Parse.Cloud.job('myJob', req => {
        req.message('hello');
        const promise = req
          .message()
          .then(() => {
            return getJobStatus(req.jobId);
          })
          .then(jobStatus => {
            expect(jobStatus.get('message')).toEqual('hello');
            expect(jobStatus.get('status')).toEqual('running');
          });
        promise
          .then(() => {
            return getJobStatus(req.jobId);
          })
          .then(jobStatus => {
            expect(jobStatus.get('message')).toEqual('hello');
            expect(jobStatus.get('status')).toEqual('succeeded');
            done();
          })
          .catch(err => {
            console.error(err);
            jfail(err);
            done();
          });
        return promise;
      });

      request({
        method: 'POST',
        url: 'http://localhost:8378/1/jobs/myJob',
        headers: {
          'X-Parse-Application-Id': Parse.applicationId,
          'X-Parse-Master-Key': Parse.masterKey,
        },
      }).then(
        () => {},
        err => {
          fail(err);
          done();
        }
      );
    });

    it('should set the failure on the job', done => {
      Parse.Cloud.job('myJob', req => {
        const promise = Promise.reject('Something went wrong');
        new Promise(resolve => setTimeout(resolve, 200))
          .then(() => {
            return getJobStatus(req.jobId);
          })
          .then(jobStatus => {
            expect(jobStatus.get('message')).toEqual('Something went wrong');
            expect(jobStatus.get('status')).toEqual('failed');
            done();
          })
          .catch(err => {
            jfail(err);
            done();
          });
        return promise;
      });

      request({
        method: 'POST',
        url: 'http://localhost:8378/1/jobs/myJob',
        headers: {
          'X-Parse-Application-Id': Parse.applicationId,
          'X-Parse-Master-Key': Parse.masterKey,
        },
      }).then(
        () => {},
        err => {
          fail(err);
          done();
        }
      );
    });

    function getJobStatus(jobId) {
      const q = new Parse.Query('_JobStatus');
      return q.get(jobId, { useMasterKey: true });
    }
  });
});

describe('cloud functions', () => {
  it('Should have request ip', done => {
    Parse.Cloud.define('myFunction', req => {
      expect(req.ip).toBeDefined();
      return 'success';
    });

    Parse.Cloud.run('myFunction', {}).then(() => done());
  });
});

describe('beforeSave hooks', () => {
  it('should have request headers', done => {
    Parse.Cloud.beforeSave('MyObject', req => {
      expect(req.headers).toBeDefined();
    });

    const MyObject = Parse.Object.extend('MyObject');
    const myObject = new MyObject();
    myObject.save().then(() => done());
  });

  it('should have request ip', done => {
    Parse.Cloud.beforeSave('MyObject', req => {
      expect(req.ip).toBeDefined();
    });

    const MyObject = Parse.Object.extend('MyObject');
    const myObject = new MyObject();
    myObject.save().then(() => done());
  });
});

describe('afterSave hooks', () => {
  it('should have request headers', done => {
    Parse.Cloud.afterSave('MyObject', req => {
      expect(req.headers).toBeDefined();
    });

    const MyObject = Parse.Object.extend('MyObject');
    const myObject = new MyObject();
    myObject.save().then(() => done());
  });

  it('should have request ip', done => {
    Parse.Cloud.afterSave('MyObject', req => {
      expect(req.ip).toBeDefined();
    });

    const MyObject = Parse.Object.extend('MyObject');
    const myObject = new MyObject();
    myObject.save().then(() => done());
  });
});

describe('beforeDelete hooks', () => {
  it('should have request headers', done => {
    Parse.Cloud.beforeDelete('MyObject', req => {
      expect(req.headers).toBeDefined();
    });

    const MyObject = Parse.Object.extend('MyObject');
    const myObject = new MyObject();
    myObject
      .save()
      .then(myObj => myObj.destroy())
      .then(() => done());
  });

  it('should have request ip', done => {
    Parse.Cloud.beforeDelete('MyObject', req => {
      expect(req.ip).toBeDefined();
    });

    const MyObject = Parse.Object.extend('MyObject');
    const myObject = new MyObject();
    myObject
      .save()
      .then(myObj => myObj.destroy())
      .then(() => done());
  });
});

describe('afterDelete hooks', () => {
  it('should have request headers', done => {
    Parse.Cloud.afterDelete('MyObject', req => {
      expect(req.headers).toBeDefined();
    });

    const MyObject = Parse.Object.extend('MyObject');
    const myObject = new MyObject();
    myObject
      .save()
      .then(myObj => myObj.destroy())
      .then(() => done());
  });

  it('should have request ip', done => {
    Parse.Cloud.afterDelete('MyObject', req => {
      expect(req.ip).toBeDefined();
    });

    const MyObject = Parse.Object.extend('MyObject');
    const myObject = new MyObject();
    myObject
      .save()
      .then(myObj => myObj.destroy())
      .then(() => done());
  });
});

describe('beforeFind hooks', () => {
  it('should add beforeFind trigger', done => {
    Parse.Cloud.beforeFind('MyObject', req => {
      const q = req.query;
      expect(q instanceof Parse.Query).toBe(true);
      const jsonQuery = q.toJSON();
      expect(jsonQuery.where.key).toEqual('value');
      expect(jsonQuery.where.some).toEqual({ $gt: 10 });
      expect(jsonQuery.include).toEqual('otherKey,otherValue');
      expect(jsonQuery.limit).toEqual(100);
      expect(jsonQuery.skip).toBe(undefined);
      expect(req.isGet).toEqual(false);
    });

    const query = new Parse.Query('MyObject');
    query.equalTo('key', 'value');
    query.greaterThan('some', 10);
    query.include('otherKey');
    query.include('otherValue');
    query.find().then(() => {
      done();
    });
  });

  it('should use modify', done => {
    Parse.Cloud.beforeFind('MyObject', req => {
      const q = req.query;
      q.equalTo('forced', true);
    });

    const obj0 = new Parse.Object('MyObject');
    obj0.set('forced', false);

    const obj1 = new Parse.Object('MyObject');
    obj1.set('forced', true);
    Parse.Object.saveAll([obj0, obj1]).then(() => {
      const query = new Parse.Query('MyObject');
      query.equalTo('forced', false);
      query.find().then(results => {
        expect(results.length).toBe(1);
        const firstResult = results[0];
        expect(firstResult.get('forced')).toBe(true);
        done();
      });
    });
  });

  it('should use the modified the query', done => {
    Parse.Cloud.beforeFind('MyObject', req => {
      const q = req.query;
      const otherQuery = new Parse.Query('MyObject');
      otherQuery.equalTo('forced', true);
      return Parse.Query.or(q, otherQuery);
    });

    const obj0 = new Parse.Object('MyObject');
    obj0.set('forced', false);

    const obj1 = new Parse.Object('MyObject');
    obj1.set('forced', true);
    Parse.Object.saveAll([obj0, obj1]).then(() => {
      const query = new Parse.Query('MyObject');
      query.equalTo('forced', false);
      query.find().then(results => {
        expect(results.length).toBe(2);
        done();
      });
    });
  });

  it('should reject queries', done => {
    Parse.Cloud.beforeFind('MyObject', () => {
      return Promise.reject('Do not run that query');
    });

    const query = new Parse.Query('MyObject');
    query.find().then(
      () => {
        fail('should not succeed');
        done();
      },
      err => {
        expect(err.code).toBe(1);
        expect(err.message).toEqual('Do not run that query');
        done();
      }
    );
  });

  it('should handle empty where', done => {
    Parse.Cloud.beforeFind('MyObject', req => {
      const otherQuery = new Parse.Query('MyObject');
      otherQuery.equalTo('some', true);
      return Parse.Query.or(req.query, otherQuery);
    });

    request({
      url: 'http://localhost:8378/1/classes/MyObject',
      headers: {
        'X-Parse-Application-Id': Parse.applicationId,
        'X-Parse-REST-API-Key': 'rest',
      },
    }).then(
      () => {
        done();
      },
      err => {
        fail(err);
        done();
      }
    );
  });

  it('should handle sorting where', done => {
    Parse.Cloud.beforeFind('MyObject', req => {
      const query = req.query;
      query.ascending('score');
      return query;
    });

    const count = 20;
    const objects = [];
    while (objects.length != count) {
      const object = new Parse.Object('MyObject');
      object.set('score', Math.floor(Math.random() * 100));
      objects.push(object);
    }
    Parse.Object.saveAll(objects)
      .then(() => {
        const query = new Parse.Query('MyObject');
        return query.find();
      })
      .then(objects => {
        let lastScore = -1;
        objects.forEach(element => {
          expect(element.get('score') >= lastScore).toBe(true);
          lastScore = element.get('score');
        });
      })
      .then(done)
      .catch(done.fail);
  });

  it('should add beforeFind trigger using get API', done => {
    const hook = {
      method: function(req) {
        expect(req.isGet).toEqual(true);
        return Promise.resolve();
      },
    };
    spyOn(hook, 'method').and.callThrough();
    Parse.Cloud.beforeFind('MyObject', hook.method);
    const obj = new Parse.Object('MyObject');
    obj.set('secretField', 'SSID');
    obj.save().then(function() {
      request({
        method: 'GET',
        url: 'http://localhost:8378/1/classes/MyObject/' + obj.id,
        headers: {
          'X-Parse-Application-Id': 'test',
          'X-Parse-REST-API-Key': 'rest',
        },
        json: true,
      }).then(response => {
        const body = response.data;
        expect(body.secretField).toEqual('SSID');
        expect(hook.method).toHaveBeenCalled();
        done();
      });
    });
  });

  it('should have request headers', done => {
    Parse.Cloud.beforeFind('MyObject', req => {
      expect(req.headers).toBeDefined();
    });

    const MyObject = Parse.Object.extend('MyObject');
    const myObject = new MyObject();
    myObject
      .save()
      .then(myObj => {
        const query = new Parse.Query('MyObject');
        query.equalTo('objectId', myObj.id);
        return Promise.all([query.get(myObj.id), query.first(), query.find()]);
      })
      .then(() => done());
  });

  it('should have request ip', done => {
    Parse.Cloud.beforeFind('MyObject', req => {
      expect(req.ip).toBeDefined();
    });

    const MyObject = Parse.Object.extend('MyObject');
    const myObject = new MyObject();
    myObject
      .save()
      .then(myObj => {
        const query = new Parse.Query('MyObject');
        query.equalTo('objectId', myObj.id);
        return Promise.all([query.get(myObj.id), query.first(), query.find()]);
      })
      .then(() => done());
  });
});

describe('afterFind hooks', () => {
  it('should add afterFind trigger using get', done => {
    Parse.Cloud.afterFind('MyObject', req => {
      for (let i = 0; i < req.objects.length; i++) {
        req.objects[i].set('secretField', '###');
      }
      return req.objects;
    });
    const obj = new Parse.Object('MyObject');
    obj.set('secretField', 'SSID');
    obj.save().then(
      function() {
        const query = new Parse.Query('MyObject');
        query.get(obj.id).then(
          function(result) {
            expect(result.get('secretField')).toEqual('###');
            done();
          },
          function(error) {
            fail(error);
            done();
          }
        );
      },
      function(error) {
        fail(error);
        done();
      }
    );
  });

  it('should add afterFind trigger using find', done => {
    Parse.Cloud.afterFind('MyObject', req => {
      for (let i = 0; i < req.objects.length; i++) {
        req.objects[i].set('secretField', '###');
      }
      return req.objects;
    });
    const obj = new Parse.Object('MyObject');
    obj.set('secretField', 'SSID');
    obj.save().then(
      function() {
        const query = new Parse.Query('MyObject');
        query.equalTo('objectId', obj.id);
        query.find().then(
          function(results) {
            expect(results[0].get('secretField')).toEqual('###');
            done();
          },
          function(error) {
            fail(error);
            done();
          }
        );
      },
      function(error) {
        fail(error);
        done();
      }
    );
  });

  it('should filter out results', done => {
    Parse.Cloud.afterFind('MyObject', req => {
      const filteredResults = [];
      for (let i = 0; i < req.objects.length; i++) {
        if (req.objects[i].get('secretField') === 'SSID1') {
          filteredResults.push(req.objects[i]);
        }
      }
      return filteredResults;
    });
    const obj0 = new Parse.Object('MyObject');
    obj0.set('secretField', 'SSID1');
    const obj1 = new Parse.Object('MyObject');
    obj1.set('secretField', 'SSID2');
    Parse.Object.saveAll([obj0, obj1]).then(
      function() {
        const query = new Parse.Query('MyObject');
        query.find().then(
          function(results) {
            expect(results[0].get('secretField')).toEqual('SSID1');
            expect(results.length).toEqual(1);
            done();
          },
          function(error) {
            fail(error);
            done();
          }
        );
      },
      function(error) {
        fail(error);
        done();
      }
    );
  });

  it('should handle failures', done => {
    Parse.Cloud.afterFind('MyObject', () => {
      throw new Parse.Error(Parse.Error.SCRIPT_FAILED, 'It should fail');
    });
    const obj = new Parse.Object('MyObject');
    obj.set('secretField', 'SSID');
    obj.save().then(
      function() {
        const query = new Parse.Query('MyObject');
        query.equalTo('objectId', obj.id);
        query.find().then(
          function() {
            fail('AfterFind should handle response failure correctly');
            done();
          },
          function() {
            done();
          }
        );
      },
      function() {
        done();
      }
    );
  });

  it('should also work with promise', done => {
    Parse.Cloud.afterFind('MyObject', req => {
      return new Promise(resolve => {
        setTimeout(function() {
          for (let i = 0; i < req.objects.length; i++) {
            req.objects[i].set('secretField', '###');
          }
          resolve(req.objects);
        }, 1000);
      });
    });
    const obj = new Parse.Object('MyObject');
    obj.set('secretField', 'SSID');
    obj.save().then(
      function() {
        const query = new Parse.Query('MyObject');
        query.equalTo('objectId', obj.id);
        query.find().then(
          function(results) {
            expect(results[0].get('secretField')).toEqual('###');
            done();
          },
          function(error) {
            fail(error);
          }
        );
      },
      function(error) {
        fail(error);
      }
    );
  });

  it('should alter select', done => {
    Parse.Cloud.beforeFind('MyObject', req => {
      req.query.select('white');
      return req.query;
    });

    const obj0 = new Parse.Object('MyObject')
      .set('white', true)
      .set('black', true);
    obj0.save().then(() => {
      new Parse.Query('MyObject').first().then(result => {
        expect(result.get('white')).toBe(true);
        expect(result.get('black')).toBe(undefined);
        done();
      });
    });
  });

  it('should not alter select', done => {
    const obj0 = new Parse.Object('MyObject')
      .set('white', true)
      .set('black', true);
    obj0.save().then(() => {
      new Parse.Query('MyObject').first().then(result => {
        expect(result.get('white')).toBe(true);
        expect(result.get('black')).toBe(true);
        done();
      });
    });
  });

  it('should set count to true on beforeFind hooks if query is count', done => {
    const hook = {
      method: function(req) {
        expect(req.count).toBe(true);
        return Promise.resolve();
      },
    };
    spyOn(hook, 'method').and.callThrough();
    Parse.Cloud.beforeFind('Stuff', hook.method);
    new Parse.Query('Stuff').count().then(count => {
      expect(count).toBe(0);
      expect(hook.method).toHaveBeenCalled();
      done();
    });
  });

  it('should set count to false on beforeFind hooks if query is not count', done => {
    const hook = {
      method: function(req) {
        expect(req.count).toBe(false);
        return Promise.resolve();
      },
    };
    spyOn(hook, 'method').and.callThrough();
    Parse.Cloud.beforeFind('Stuff', hook.method);
    new Parse.Query('Stuff').find().then(res => {
      expect(res.length).toBe(0);
      expect(hook.method).toHaveBeenCalled();
      done();
    });
  });

  it('should have request headers', done => {
    Parse.Cloud.afterFind('MyObject', req => {
      expect(req.headers).toBeDefined();
    });

    const MyObject = Parse.Object.extend('MyObject');
    const myObject = new MyObject();
    myObject
      .save()
      .then(myObj => {
        const query = new Parse.Query('MyObject');
        query.equalTo('objectId', myObj.id);
        return Promise.all([query.get(myObj.id), query.first(), query.find()]);
      })
      .then(() => done());
  });

  it('should have request ip', done => {
    Parse.Cloud.afterFind('MyObject', req => {
      expect(req.ip).toBeDefined();
    });

    const MyObject = Parse.Object.extend('MyObject');
    const myObject = new MyObject();
    myObject
      .save()
      .then(myObj => {
        const query = new Parse.Query('MyObject');
        query.equalTo('objectId', myObj.id);
        return Promise.all([query.get(myObj.id), query.first(), query.find()]);
      })
      .then(() => done())
      .catch(done.fail);
  });

  it('should validate triggers correctly', () => {
    expect(() => {
      Parse.Cloud.beforeSave('_Session', () => {});
    }).toThrow('Triggers are not supported for _Session class.');
    expect(() => {
      Parse.Cloud.afterSave('_Session', () => {});
    }).toThrow('Triggers are not supported for _Session class.');
    expect(() => {
      Parse.Cloud.beforeSave('_PushStatus', () => {});
    }).toThrow('Only afterSave is allowed on _PushStatus');
    expect(() => {
      Parse.Cloud.afterSave('_PushStatus', () => {});
    }).not.toThrow();
    expect(() => {
      Parse.Cloud.beforeLogin(() => {});
    }).not.toThrow(
      'Only the _User class is allowed for the beforeLogin trigger'
    );
    expect(() => {
      Parse.Cloud.beforeLogin('_User', () => {});
    }).not.toThrow(
      'Only the _User class is allowed for the beforeLogin trigger'
    );
    expect(() => {
      Parse.Cloud.beforeLogin(Parse.User, () => {});
    }).not.toThrow(
      'Only the _User class is allowed for the beforeLogin trigger'
    );
    expect(() => {
      Parse.Cloud.beforeLogin('SomeClass', () => {});
    }).toThrow('Only the _User class is allowed for the beforeLogin trigger');
  });

  it('should skip afterFind hooks for aggregate', done => {
    const hook = {
      method: function() {
        return Promise.reject();
      },
    };
    spyOn(hook, 'method').and.callThrough();
    Parse.Cloud.afterFind('MyObject', hook.method);
    const obj = new Parse.Object('MyObject');
    const pipeline = [
      {
        group: { objectId: {} },
      },
    ];
    obj
      .save()
      .then(() => {
        const query = new Parse.Query('MyObject');
        return query.aggregate(pipeline);
      })
      .then(results => {
        expect(results[0].objectId).toEqual(null);
        expect(hook.method).not.toHaveBeenCalled();
        done();
      });
  });

  it('should skip afterFind hooks for distinct', done => {
    const hook = {
      method: function() {
        return Promise.reject();
      },
    };
    spyOn(hook, 'method').and.callThrough();
    Parse.Cloud.afterFind('MyObject', hook.method);
    const obj = new Parse.Object('MyObject');
    obj.set('score', 10);
    obj
      .save()
      .then(() => {
        const query = new Parse.Query('MyObject');
        return query.distinct('score');
      })
      .then(results => {
        expect(results[0]).toEqual(10);
        expect(hook.method).not.toHaveBeenCalled();
        done();
      });
  });

  it('should expose context in before and afterSave', async () => {
    let calledBefore = false;
    let calledAfter = false;
    Parse.Cloud.beforeSave('MyClass', req => {
      req.context = {
        key: 'value',
        otherKey: 1,
      };
      calledBefore = true;
    });
    Parse.Cloud.afterSave('MyClass', req => {
      expect(req.context.otherKey).toBe(1);
      expect(req.context.key).toBe('value');
      calledAfter = true;
    });

    const object = new Parse.Object('MyClass');
    await object.save();
    expect(calledBefore).toBe(true);
    expect(calledAfter).toBe(true);
  });

  it('should expose context in before and afterSave and let keys be set individually', async () => {
    let calledBefore = false;
    let calledAfter = false;
    Parse.Cloud.beforeSave('MyClass', req => {
      req.context.some = 'value';
      req.context.yolo = 1;
      calledBefore = true;
    });
    Parse.Cloud.afterSave('MyClass', req => {
      expect(req.context.yolo).toBe(1);
      expect(req.context.some).toBe('value');
      calledAfter = true;
    });

    const object = new Parse.Object('MyClass');
    await object.save();
    expect(calledBefore).toBe(true);
    expect(calledAfter).toBe(true);
  });
});

describe('beforeLogin hook', () => {
  it('should run beforeLogin with correct credentials', async done => {
    let hit = 0;
    Parse.Cloud.beforeLogin(req => {
      hit++;
      expect(req.object.get('username')).toEqual('tupac');
    });

    await Parse.User.signUp('tupac', 'shakur');
    const user = await Parse.User.logIn('tupac', 'shakur');
    expect(hit).toBe(1);
    expect(user).toBeDefined();
    expect(user.getUsername()).toBe('tupac');
    expect(user.getSessionToken()).toBeDefined();
    done();
  });

  it('should be able to block login if an error is thrown', async done => {
    let hit = 0;
    Parse.Cloud.beforeLogin(req => {
      hit++;
      if (req.object.get('isBanned')) {
        throw new Error('banned account');
      }
    });

    const user = await Parse.User.signUp('tupac', 'shakur');
    await user.save({ isBanned: true });

    try {
      await Parse.User.logIn('tupac', 'shakur');
      throw new Error('should not have been logged in.');
    } catch (e) {
      expect(e.message).toBe('banned account');
    }
    expect(hit).toBe(1);
    done();
  });

  it('should be able to block login if an error is thrown even if the user has a attached file', async done => {
    let hit = 0;
    Parse.Cloud.beforeLogin(req => {
      hit++;
      if (req.object.get('isBanned')) {
        throw new Error('banned account');
      }
    });

    const user = await Parse.User.signUp('tupac', 'shakur');
    const base64 = 'V29ya2luZyBhdCBQYXJzZSBpcyBncmVhdCE=';
    const file = new Parse.File('myfile.txt', { base64 });
    await file.save();
    await user.save({ isBanned: true, file });

    try {
      await Parse.User.logIn('tupac', 'shakur');
      throw new Error('should not have been logged in.');
    } catch (e) {
      expect(e.message).toBe('banned account');
    }
    expect(hit).toBe(1);
    done();
  });

  it('should not run beforeLogin with incorrect credentials', async done => {
    let hit = 0;
    Parse.Cloud.beforeLogin(req => {
      hit++;
      expect(req.object.get('username')).toEqual('tupac');
    });

    await Parse.User.signUp('tupac', 'shakur');
    try {
      await Parse.User.logIn('tony', 'shakur');
    } catch (e) {
      expect(e.code).toBe(Parse.Error.OBJECT_NOT_FOUND);
    }
    expect(hit).toBe(0);
    done();
  });

  it('should not run beforeLogin on sign up', async done => {
    let hit = 0;
    Parse.Cloud.beforeLogin(req => {
      hit++;
      expect(req.object.get('username')).toEqual('tupac');
    });

    const user = await Parse.User.signUp('tupac', 'shakur');
    expect(user).toBeDefined();
    expect(hit).toBe(0);
    done();
  });

  it('should have expected data in request', async done => {
    Parse.Cloud.beforeLogin(req => {
      expect(req.object).toBeDefined();
      expect(req.user).toBeUndefined();
      expect(req.headers).toBeDefined();
      expect(req.ip).toBeDefined();
      expect(req.installationId).toBeDefined();
      expect(req.context).toBeUndefined();
    });

    await Parse.User.signUp('tupac', 'shakur');
    await Parse.User.logIn('tupac', 'shakur');
    done();
  });
});
