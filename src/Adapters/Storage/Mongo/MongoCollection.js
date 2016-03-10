let mongodb = require('mongodb');
let Collection = mongodb.Collection;

export default class MongoCollection {
  _mongoCollection:Collection;

  constructor(mongoCollection:Collection) {
    this._mongoCollection = mongoCollection;
  }

  // Does a find with "smart indexing".
  // Currently this just means, if it needs a geoindex and there is
  // none, then build the geoindex.
  // This could be improved a lot but it's not clear if that's a good
  // idea. Or even if this behavior is a good idea.
  find(query, { skip, limit, sort } = {}) {
    return this._rawFind(query, { skip, limit, sort })
      .catch(error => {
        // Check for "no geoindex" error
        if (error.code != 17007 || !error.message.match(/unable to find index for .geoNear/)) {
          throw error;
        }
        // Figure out what key needs an index
        let key = error.message.match(/field=([A-Za-z_0-9]+) /)[1];
        if (!key) {
          throw error;
        }

        var index = {};
        index[key] = '2d';
        //TODO: condiser moving index creation logic into Schema.js
        return this._mongoCollection.createIndex(index)
          // Retry, but just once.
          .then(() => this._rawFind(query, { skip, limit, sort }));
      });
  }

  _rawFind(query, { skip, limit, sort } = {}) {
    return this._mongoCollection
      .find(query, { skip, limit, sort })
      .toArray();
  }

  count(query, { skip, limit, sort } = {}) {
    return this._mongoCollection.count(query, { skip, limit, sort });
  }

  // Atomically finds and updates an object based on query.
  // The result is the promise with an object that was in the database !AFTER! changes.
  // Postgres Note: Translates directly to `UPDATE * SET * ... RETURNING *`, which will return data after the change is done.
  findOneAndUpdate(query, update) {
    // arguments: query, sort, update, options(optional)
    // Setting `new` option to true makes it return the after document, not the before one.
    return this._mongoCollection.findAndModify(query, [], update, { new: true }).then(document => {
      // Value is the object where mongo returns multiple fields.
      return document.value;
    });
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

  deleteOne(query) {
    return this._mongoCollection.deleteOne(query);
  }

  deleteMany(query) {
    return this._mongoCollection.deleteMany(query);
  }

  drop() {
    return this._mongoCollection.drop();
  }
}
