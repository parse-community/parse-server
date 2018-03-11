'use strict';

Object.defineProperty(exports, "__esModule", {
  value: true
});
exports.GridStoreAdapter = undefined;

var _mongodb = require('mongodb');

var _FilesAdapter = require('./FilesAdapter');

var _defaults = require('../../defaults');

var _defaults2 = _interopRequireDefault(_defaults);

function _interopRequireDefault(obj) { return obj && obj.__esModule ? obj : { default: obj }; }

class GridStoreAdapter extends _FilesAdapter.FilesAdapter {

  constructor(mongoDatabaseURI = _defaults2.default.DefaultMongoURI) {
    super();
    this._databaseURI = mongoDatabaseURI;
  }

  _connect() {
    if (!this._connectionPromise) {
      this._connectionPromise = _mongodb.MongoClient.connect(this._databaseURI).then(client => client.db(client.s.options.dbName));
    }
    return this._connectionPromise;
  }

  // For a given config object, filename, and data, store a file
  // Returns a promise
  createFile(filename, data) {
    return this._connect().then(database => {
      const gridStore = new _mongodb.GridStore(database, filename, 'w');
      return gridStore.open();
    }).then(gridStore => {
      return gridStore.write(data);
    }).then(gridStore => {
      return gridStore.close();
    });
  }

  deleteFile(filename) {
    return this._connect().then(database => {
      const gridStore = new _mongodb.GridStore(database, filename, 'r');
      return gridStore.open();
    }).then(gridStore => {
      return gridStore.unlink();
    }).then(gridStore => {
      return gridStore.close();
    });
  }

  getFileData(filename) {
    return this._connect().then(database => {
      return _mongodb.GridStore.exist(database, filename).then(() => {
        const gridStore = new _mongodb.GridStore(database, filename, 'r');
        return gridStore.open();
      });
    }).then(gridStore => {
      return gridStore.read();
    });
  }

  getFileLocation(config, filename) {
    return config.mount + '/files/' + config.applicationId + '/' + encodeURIComponent(filename);
  }

  getFileStream(filename) {
    return this._connect().then(database => {
      return _mongodb.GridStore.exist(database, filename).then(() => {
        const gridStore = new _mongodb.GridStore(database, filename, 'r');
        return gridStore.open();
      });
    });
  }
}

exports.GridStoreAdapter = GridStoreAdapter; /**
                                              GridStoreAdapter
                                              Stores files in Mongo using GridStore
                                              Requires the database adapter to be based on mongoclient
                                             
                                               weak
                                              */

// -disable-next

exports.default = GridStoreAdapter;