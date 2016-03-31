'use strict';

let DatabaseController = require('../src/Controllers/DatabaseController');
let MongoStorageAdapter = require('../src/Adapters/Storage/Mongo/MongoStorageAdapter');

describe('DatabaseController', () => {
  it('can be constructed', done => {
    let adapter = new MongoStorageAdapter('mongodb://localhost:27017/test');
    let databaseController = new DatabaseController(adapter, {
		collectionPrefix: 'test_'
    });
    databaseController.connect().then(done, error => {
      console.log('error', error.stack);
      fail();
    });
  });

  describe('canAddField is called appropriately', () => {
    let adapter = new MongoStorageAdapter('mongodb://localhost:27017/test');
    let databaseController = new DatabaseController(adapter, {
		collectionPrefix: 'test_'
    });

    var connectionP = databaseController.connect()
    
    it("is ignored if using master key", done => {
      connectionP.then(() => {
        databaseController.canAddField = function() {
          console.log('error: canAddField was called');
          fail();
        }

        // master key is implied, by not passing in an acl
        var object = {};
        var query = {};
        var acl = {/* no acl field */}
        return databaseController.validateObject('SomeObj', object, query, acl).then(done);
      }).catch(error => {
        console.log('error', error.stack);
        fail();
      });
    });

    it("is called with an explicit ACL, canAddField is called", done => {
      connectionP.then(() => {
        databaseController.canAddField = function() {
          done();
        }

        var object = {};
        var query = {};
        var acl = {acl: [] /* explicit empty ACL */}
        return databaseController.validateObject('SomeObj', object, query, acl);
      }).catch(error => {
        console.log('error', error.stack);
        fail();
      });
    });
  });
});
