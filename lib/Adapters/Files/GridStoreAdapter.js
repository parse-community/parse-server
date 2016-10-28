'use strict';

Object.defineProperty(exports, "__esModule", {
  value: true
});
exports.GridStoreAdapter = undefined;

var _createClass = function () { function defineProperties(target, props) { for (var i = 0; i < props.length; i++) { var descriptor = props[i]; descriptor.enumerable = descriptor.enumerable || false; descriptor.configurable = true; if ("value" in descriptor) descriptor.writable = true; Object.defineProperty(target, descriptor.key, descriptor); } } return function (Constructor, protoProps, staticProps) { if (protoProps) defineProperties(Constructor.prototype, protoProps); if (staticProps) defineProperties(Constructor, staticProps); return Constructor; }; }();

var _mongodb = require('mongodb');

var _FilesAdapter2 = require('./FilesAdapter');

var _defaults = require('../../defaults');

var _defaults2 = _interopRequireDefault(_defaults);

function _interopRequireDefault(obj) { return obj && obj.__esModule ? obj : { default: obj }; }

function _classCallCheck(instance, Constructor) { if (!(instance instanceof Constructor)) { throw new TypeError("Cannot call a class as a function"); } }

function _possibleConstructorReturn(self, call) { if (!self) { throw new ReferenceError("this hasn't been initialised - super() hasn't been called"); } return call && (typeof call === "object" || typeof call === "function") ? call : self; }

function _inherits(subClass, superClass) { if (typeof superClass !== "function" && superClass !== null) { throw new TypeError("Super expression must either be null or a function, not " + typeof superClass); } subClass.prototype = Object.create(superClass && superClass.prototype, { constructor: { value: subClass, enumerable: false, writable: true, configurable: true } }); if (superClass) Object.setPrototypeOf ? Object.setPrototypeOf(subClass, superClass) : subClass.__proto__ = superClass; } /**
                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                GridStoreAdapter
                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                Stores files in Mongo using GridStore
                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                Requires the database adapter to be based on mongoclient
                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                               
                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                 weak
                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                */

var GridStoreAdapter = exports.GridStoreAdapter = function (_FilesAdapter) {
  _inherits(GridStoreAdapter, _FilesAdapter);

  function GridStoreAdapter() {
    var mongoDatabaseURI = arguments.length <= 0 || arguments[0] === undefined ? _defaults2.default.DefaultMongoURI : arguments[0];

    _classCallCheck(this, GridStoreAdapter);

    var _this = _possibleConstructorReturn(this, (GridStoreAdapter.__proto__ || Object.getPrototypeOf(GridStoreAdapter)).call(this));

    _this._databaseURI = mongoDatabaseURI;
    return _this;
  }

  _createClass(GridStoreAdapter, [{
    key: '_connect',
    value: function _connect() {
      if (!this._connectionPromise) {
        this._connectionPromise = _mongodb.MongoClient.connect(this._databaseURI);
      }
      return this._connectionPromise;
    }

    // For a given config object, filename, and data, store a file
    // Returns a promise

  }, {
    key: 'createFile',
    value: function createFile(filename, data, contentType) {
      return this._connect().then(function (database) {
        var gridStore = new _mongodb.GridStore(database, filename, 'w');
        return gridStore.open();
      }).then(function (gridStore) {
        return gridStore.write(data);
      }).then(function (gridStore) {
        return gridStore.close();
      });
    }
  }, {
    key: 'deleteFile',
    value: function deleteFile(filename) {
      return this._connect().then(function (database) {
        var gridStore = new _mongodb.GridStore(database, filename, 'r');
        return gridStore.open();
      }).then(function (gridStore) {
        return gridStore.unlink();
      }).then(function (gridStore) {
        return gridStore.close();
      });
    }
  }, {
    key: 'getFileData',
    value: function getFileData(filename) {
      return this._connect().then(function (database) {
        return _mongodb.GridStore.exist(database, filename).then(function () {
          var gridStore = new _mongodb.GridStore(database, filename, 'r');
          return gridStore.open();
        });
      }).then(function (gridStore) {
        return gridStore.read();
      });
    }
  }, {
    key: 'getFileLocation',
    value: function getFileLocation(config, filename) {
      return config.mount + '/files/' + config.applicationId + '/' + encodeURIComponent(filename);
    }
  }, {
    key: 'getFileStream',
    value: function getFileStream(filename) {
      return this._connect().then(function (database) {
        return _mongodb.GridStore.exist(database, filename).then(function () {
          var gridStore = new _mongodb.GridStore(database, filename, 'r');
          return gridStore.open();
        });
      });
    }
  }]);

  return GridStoreAdapter;
}(_FilesAdapter2.FilesAdapter);

exports.default = GridStoreAdapter;