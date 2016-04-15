'use strict';

let DatabaseController = require('../src/Controllers/DatabaseController');
let MongoStorageAdapter = require('../src/Adapters/Storage/Mongo/MongoStorageAdapter');

describe('DatabaseController', () => {
  it('can be constructed', done => {
    let adapter = new MongoStorageAdapter({
      uri: 'mongodb://localhost:27017/test',
      collectionPrefix: 'test_',
    });
    let databaseController = new DatabaseController(adapter);
    databaseController.connect().then(done, error => {
      console.log('error', error.stack);
      fail();
    });
  });
});
