
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
        if (error.code != 17007 ||
          !error.message.match(/unable to find index for .geoNear/)) {
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
}
