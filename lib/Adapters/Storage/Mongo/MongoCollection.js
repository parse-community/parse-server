'use strict';

Object.defineProperty(exports, "__esModule", {
  value: true
});

var _createClass = function () { function defineProperties(target, props) { for (var i = 0; i < props.length; i++) { var descriptor = props[i]; descriptor.enumerable = descriptor.enumerable || false; descriptor.configurable = true; if ("value" in descriptor) descriptor.writable = true; Object.defineProperty(target, descriptor.key, descriptor); } } return function (Constructor, protoProps, staticProps) { if (protoProps) defineProperties(Constructor.prototype, protoProps); if (staticProps) defineProperties(Constructor, staticProps); return Constructor; }; }();

function _classCallCheck(instance, Constructor) { if (!(instance instanceof Constructor)) { throw new TypeError("Cannot call a class as a function"); } }

var mongodb = require('mongodb');
var Collection = mongodb.Collection;

var MongoCollection = function () {
  function MongoCollection(mongoCollection) {
    _classCallCheck(this, MongoCollection);

    this._mongoCollection = mongoCollection;
  }

  // Does a find with "smart indexing".
  // Currently this just means, if it needs a geoindex and there is
  // none, then build the geoindex.
  // This could be improved a lot but it's not clear if that's a good
  // idea. Or even if this behavior is a good idea.


  _createClass(MongoCollection, [{
    key: 'find',
    value: function find(query) {
      var _this = this;

      var _ref = arguments.length > 1 && arguments[1] !== undefined ? arguments[1] : {},
          skip = _ref.skip,
          limit = _ref.limit,
          sort = _ref.sort,
          keys = _ref.keys,
          maxTimeMS = _ref.maxTimeMS;

      return this._rawFind(query, { skip: skip, limit: limit, sort: sort, keys: keys, maxTimeMS: maxTimeMS }).catch(function (error) {
        // Check for "no geoindex" error
        if (error.code != 17007 && !error.message.match(/unable to find index for .geoNear/)) {
          throw error;
        }
        // Figure out what key needs an index
        var key = error.message.match(/field=([A-Za-z_0-9]+) /)[1];
        if (!key) {
          throw error;
        }

        var index = {};
        index[key] = '2d';
        return _this._mongoCollection.createIndex(index)
        // Retry, but just once.
        .then(function () {
          return _this._rawFind(query, { skip: skip, limit: limit, sort: sort, keys: keys, maxTimeMS: maxTimeMS });
        });
      });
    }
  }, {
    key: '_rawFind',
    value: function _rawFind(query) {
      var _ref2 = arguments.length > 1 && arguments[1] !== undefined ? arguments[1] : {},
          skip = _ref2.skip,
          limit = _ref2.limit,
          sort = _ref2.sort,
          keys = _ref2.keys,
          maxTimeMS = _ref2.maxTimeMS;

      var findOperation = this._mongoCollection.find(query, { skip: skip, limit: limit, sort: sort });

      if (keys) {
        findOperation = findOperation.project(keys);
      }

      if (maxTimeMS) {
        findOperation = findOperation.maxTimeMS(maxTimeMS);
      }

      return findOperation.toArray();
    }
  }, {
    key: 'count',
    value: function count(query) {
      var _ref3 = arguments.length > 1 && arguments[1] !== undefined ? arguments[1] : {},
          skip = _ref3.skip,
          limit = _ref3.limit,
          sort = _ref3.sort,
          maxTimeMS = _ref3.maxTimeMS;

      var countOperation = this._mongoCollection.count(query, { skip: skip, limit: limit, sort: sort, maxTimeMS: maxTimeMS });

      return countOperation;
    }
  }, {
    key: 'insertOne',
    value: function insertOne(object) {
      return this._mongoCollection.insertOne(object);
    }

    // Atomically updates data in the database for a single (first) object that matched the query
    // If there is nothing that matches the query - does insert
    // Postgres Note: `INSERT ... ON CONFLICT UPDATE` that is available since 9.5.

  }, {
    key: 'upsertOne',
    value: function upsertOne(query, update) {
      return this._mongoCollection.update(query, update, { upsert: true });
    }
  }, {
    key: 'updateOne',
    value: function updateOne(query, update) {
      return this._mongoCollection.updateOne(query, update);
    }
  }, {
    key: 'updateMany',
    value: function updateMany(query, update) {
      return this._mongoCollection.updateMany(query, update);
    }
  }, {
    key: 'deleteOne',
    value: function deleteOne(query) {
      return this._mongoCollection.deleteOne(query);
    }
  }, {
    key: 'deleteMany',
    value: function deleteMany(query) {
      return this._mongoCollection.deleteMany(query);
    }
  }, {
    key: '_ensureSparseUniqueIndexInBackground',
    value: function _ensureSparseUniqueIndexInBackground(indexRequest) {
      var _this2 = this;

      return new Promise(function (resolve, reject) {
        _this2._mongoCollection.ensureIndex(indexRequest, { unique: true, background: true, sparse: true }, function (error) {
          if (error) {
            reject(error);
          } else {
            resolve();
          }
        });
      });
    }
  }, {
    key: 'drop',
    value: function drop() {
      return this._mongoCollection.drop();
    }
  }]);

  return MongoCollection;
}();

exports.default = MongoCollection;