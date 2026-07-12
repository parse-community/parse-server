const mongodb = require('mongodb');
const Collection = mongodb.Collection;

// Query operators that require a geospatial index and therefore trigger
// on-demand `2d` index creation. `$geoWithin` / `$geoIntersects` are intentionally
// excluded: they can run as a collection scan and never raise a "no index" error.
const GEO_INDEX_QUERY_OPERATORS = ['$nearSphere', '$near', '$geoNear'];

// Find the field in a Mongo query document that is constrained by a geo operator
// requiring a geospatial index. Returns the field name (e.g. 'location'), or
// undefined if none is found. Used as the reliable source of truth for on-demand
// geo index creation, since the MongoDB error message that used to carry the field
// name (`... field=<name> ...`) was dropped in MongoDB 8.3+.
//
// A geo-near expression must be top-level or inside `$and`: MongoDB rejects it inside
// `$or` / `$nor` ("geo $near must be top-level expr") and forbids more than one per
// query ("Too many geoNear expressions"). So there is at most one field to find, and
// `$and` is the only combinator we need to recurse into.
export function findGeoIndexField(query) {
  if (!query || typeof query !== 'object') {
    return undefined;
  }
  for (const field of Object.keys(query)) {
    const value = query[field];
    // Recurse into `$and`, which holds an array of sub-queries.
    if (field === '$and' && Array.isArray(value)) {
      for (const subQuery of value) {
        const found = findGeoIndexField(subQuery);
        if (found) {
          return found;
        }
      }
      continue;
    }
    if (
      value &&
      typeof value === 'object' &&
      GEO_INDEX_QUERY_OPERATORS.some(op => Object.prototype.hasOwnProperty.call(value, op))
    ) {
      return field;
    }
  }
  return undefined;
}

export default class MongoCollection {
  _mongoCollection: Collection;

  constructor(mongoCollection: Collection) {
    this._mongoCollection = mongoCollection;
  }

  // Does a find with "smart indexing".
  // Currently this just means, if it needs a geoindex and there is
  // none, then build the geoindex.
  // This could be improved a lot but it's not clear if that's a good
  // idea. Or even if this behavior is a good idea.
  find(
    query,
    {
      skip,
      limit,
      sort,
      keys,
      maxTimeMS,
      batchSize,
      readPreference,
      hint,
      caseInsensitive,
      explain,
      comment,
    } = {}
  ) {
    // Support for Full Text Search - $text
    if (keys && keys.$score) {
      delete keys.$score;
      keys.score = { $meta: 'textScore' };
    }
    return this._rawFind(query, {
      skip,
      limit,
      sort,
      keys,
      maxTimeMS,
      batchSize,
      readPreference,
      hint,
      caseInsensitive,
      explain,
      comment,
    }).catch(error => {
      // Check for "no geoindex" error
      if (error.code != 17007 && !error.message.match(/unable to find index for .geoNear/)) {
        throw error;
      }
      // Figure out which field needs a geo index.
      // Older MongoDB embeds the field name in the error message (`... field=<name> ...`);
      // MongoDB 8.3+ shortened the message to `unable to find index for $geoNear query`
      // and no longer includes it, so fall back to reading the field from the query itself.
      const messageMatch = error.message.match(/field=([A-Za-z_0-9]+) /);
      const key = (messageMatch && messageMatch[1]) || findGeoIndexField(query);
      if (!key) {
        throw error;
      }

      var index = {};
      index[key] = '2d';
      return (
        this._mongoCollection
          .createIndex(index)
          // Retry, but just once.
          .then(() =>
            this._rawFind(query, {
              skip,
              limit,
              sort,
              keys,
              maxTimeMS,
              batchSize,
              readPreference,
              hint,
              caseInsensitive,
              explain,
              comment,
            })
          )
      );
    });
  }

  /**
   * Collation to support case insensitive queries
   */
  static caseInsensitiveCollation() {
    return { locale: 'en_US', strength: 2 };
  }

  _rawFind(
    query,
    {
      skip,
      limit,
      sort,
      keys,
      maxTimeMS,
      batchSize,
      readPreference,
      hint,
      caseInsensitive,
      explain,
      comment,
    } = {}
  ) {
    let findOperation = this._mongoCollection.find(query, {
      skip,
      limit,
      sort,
      readPreference,
      hint,
      comment,
      batchSize,
    });

    if (keys) {
      findOperation = findOperation.project(keys);
    }

    if (caseInsensitive) {
      findOperation = findOperation.collation(MongoCollection.caseInsensitiveCollation());
    }

    if (maxTimeMS) {
      findOperation = findOperation.maxTimeMS(maxTimeMS);
    }

    return explain ? findOperation.explain(explain) : findOperation.toArray();
  }

  count(query, { skip, limit, sort, maxTimeMS, readPreference, hint, comment } = {}) {
    // If query is empty, then use estimatedDocumentCount instead.
    // This is due to countDocuments performing a scan,
    // which greatly increases execution time when being run on large collections.
    // See https://github.com/Automattic/mongoose/issues/6713 for more info regarding this problem.
    if (typeof query !== 'object' || !Object.keys(query).length) {
      return this._mongoCollection.estimatedDocumentCount({
        maxTimeMS,
      });
    }

    const countOperation = this._mongoCollection.countDocuments(query, {
      skip,
      limit,
      sort,
      maxTimeMS,
      readPreference,
      hint,
      comment,
    });

    return countOperation;
  }

  distinct(field, query) {
    return this._mongoCollection.distinct(field, query);
  }

  aggregate(pipeline, { maxTimeMS, batchSize, readPreference, hint, explain, comment } = {}) {
    return this._mongoCollection
      .aggregate(pipeline, { maxTimeMS, batchSize, readPreference, hint, explain, comment })
      .toArray();
  }

  insertOne(object, session) {
    return this._mongoCollection.insertOne(object, { session });
  }

  // Atomically updates data in the database for a single (first) object that matched the query
  // If there is nothing that matches the query - does insert
  // Postgres Note: `INSERT ... ON CONFLICT UPDATE` that is available since 9.5.
  upsertOne(query, update, session) {
    return this._mongoCollection.updateOne(query, update, {
      upsert: true,
      session,
    });
  }

  updateOne(query, update) {
    return this._mongoCollection.updateOne(query, update);
  }

  updateMany(query, update, session) {
    return this._mongoCollection.updateMany(query, update, { session });
  }

  deleteMany(query, session) {
    return this._mongoCollection.deleteMany(query, { session });
  }

  _ensureSparseUniqueIndexInBackground(indexRequest) {
    return this._mongoCollection.createIndex(indexRequest, {
      unique: true,
      background: true,
      sparse: true,
    });
  }

  drop() {
    return this._mongoCollection.drop();
  }
}
