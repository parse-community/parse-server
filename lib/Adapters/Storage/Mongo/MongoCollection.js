'use strict';

Object.defineProperty(exports, "__esModule", {
  value: true
});
const mongodb = require('mongodb');
const Collection = mongodb.Collection;

class MongoCollection {

  constructor(mongoCollection) {
    this._mongoCollection = mongoCollection;
  }

  // Does a find with "smart indexing".
  // Currently this just means, if it needs a geoindex and there is
  // none, then build the geoindex.
  // This could be improved a lot but it's not clear if that's a good
  // idea. Or even if this behavior is a good idea.
  find(query, { skip, limit, sort, keys, maxTimeMS, readPreference } = {}) {
    // Support for Full Text Search - $text
    if (keys && keys.$score) {
      delete keys.$score;
      keys.score = { $meta: 'textScore' };
    }
    return this._rawFind(query, { skip, limit, sort, keys, maxTimeMS, readPreference }).catch(error => {
      // Check for "no geoindex" error
      if (error.code != 17007 && !error.message.match(/unable to find index for .geoNear/)) {
        throw error;
      }
      // Figure out what key needs an index
      const key = error.message.match(/field=([A-Za-z_0-9]+) /)[1];
      if (!key) {
        throw error;
      }

      var index = {};
      index[key] = '2d';
      return this._mongoCollection.createIndex(index)
      // Retry, but just once.
      .then(() => this._rawFind(query, { skip, limit, sort, keys, maxTimeMS, readPreference }));
    });
  }

  _rawFind(query, { skip, limit, sort, keys, maxTimeMS, readPreference } = {}) {
    let findOperation = this._mongoCollection.find(query, { skip, limit, sort, readPreference });

    if (keys) {
      findOperation = findOperation.project(keys);
    }

    if (maxTimeMS) {
      findOperation = findOperation.maxTimeMS(maxTimeMS);
    }

    return findOperation.toArray();
  }

  count(query, { skip, limit, sort, maxTimeMS, readPreference } = {}) {
    const countOperation = this._mongoCollection.count(query, { skip, limit, sort, maxTimeMS, readPreference });

    return countOperation;
  }

  distinct(field, query) {
    return this._mongoCollection.distinct(field, query);
  }

  aggregate(pipeline, { maxTimeMS, readPreference } = {}) {
    return this._mongoCollection.aggregate(pipeline, { maxTimeMS, readPreference }).toArray();
  }

  insertOne(object) {
    return this._mongoCollection.insertOne(object);
  }

  // Atomically updates data in the database for a single (first) object that matched the query
  // If there is nothing that matches the query - does insert
  // Postgres Note: `INSERT ... ON CONFLICT UPDATE` that is available since 9.5.
  upsertOne(query, update) {
    return this._mongoCollection.update(query, update, { upsert: true });
  }

  updateOne(query, update) {
    return this._mongoCollection.updateOne(query, update);
  }

  updateMany(query, update) {
    return this._mongoCollection.updateMany(query, update);
  }

  deleteMany(query) {
    return this._mongoCollection.deleteMany(query);
  }

  _ensureSparseUniqueIndexInBackground(indexRequest) {
    return new Promise((resolve, reject) => {
      this._mongoCollection.ensureIndex(indexRequest, { unique: true, background: true, sparse: true }, error => {
        if (error) {
          reject(error);
        } else {
          resolve();
        }
      });
    });
  }

  drop() {
    return this._mongoCollection.drop();
  }
}
exports.default = MongoCollection;