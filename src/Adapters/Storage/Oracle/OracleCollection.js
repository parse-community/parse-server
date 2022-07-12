import marklog from '../../../marklog';

const oracledb = require('oracledb');
oracledb.autoCommit = true;
const Collection = oracledb.SodaCollection;

export default class OracleCollection {
  _oracleCollection: Collection;

  constructor(oracleCollection: Collection) {
    this._oracleCollection = oracleCollection;
  }

  // Does a find with "smart indexing".
  // Currently this just means, if it needs a geoindex and there is
  // none, then build the geoindex.
  // This could be improved a lot but it's not clear if that's a good
  // idea. Or even if this behavior is a good idea.
  find(
    query,
    { skip, limit, sort, keys, maxTimeMS, readPreference, hint, caseInsensitive, explain } = {}
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
      readPreference,
      hint,
      caseInsensitive,
      explain,
    }).catch(error => {
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
      return (
        this._oracleCollection
          .createIndex(index)
          // Retry, but just once.
          .then(() =>
            this._rawFind(query, {
              skip,
              limit,
              sort,
              keys,
              maxTimeMS,
              readPreference,
              hint,
              caseInsensitive,
              explain,
            })
          )
      );
    });
  }

  async _rawFind(
    query,
    { skip, limit, sort, keys, maxTimeMS, readPreference, hint, caseInsensitive, explain } = {}
  ) {
    marklog('_rawFind: collection = ' + JSON.stringify(this._oracleCollection));
    marklog('query = ' + JSON.stringify(query));
    marklog('limit = ' + limit);
    // use these so the linter will not complain - until i actually use them properly
    marklog('TODO: not using these: ' + sort, maxTimeMS, readPreference, caseInsensitive, explain);
    marklog('sodaCollection.name = ' + this._oracleCollection.name);

    let findOperation = this._oracleCollection.find().filter(query);

    if (skip) {
      findOperation = findOperation.skip(Number(skip));
    }

    if (limit) {
      findOperation = findOperation.limit(Number(limit));
    }

    if (hint) {
      findOperation = findOperation.hint(String(hint));
    }
    // TODO need to handle sort and readPreference
    // let findOperation = this._oracleCollection.find(query, {
    //   skip,
    //   limit,
    //   sort,
    //   readPreference,
    //   hint,
    // });

    if (keys) {
      findOperation = findOperation.keys(keys);
    }

    // if (caseInsensitive) {
    //   findOperation = findOperation.collation(OracleCollection.caseInsensitiveCollation());
    // }

    // if (maxTimeMS) {
    //   findOperation = findOperation.maxTimeMS(maxTimeMS);
    // }

    //marklog("findOperation = " + JSON.stringify(findOperation))
    let docs;
    await findOperation.getDocuments().then(d => (docs = d.map(i => i.getContent())));
    marklog('about to return docs = ' + JSON.stringify(docs));
    return docs;
    //return explain ? findOperation.explain(explain) : findOperation.toArray();
  }

  insertOne(object) {
    marklog('entered insertOne');
    return this._oracleCollection
      .insertOne(object)
      .catch(error => marklog('insertOne got error ' + error));
  }

  _ensureSparseUniqueIndexInBackground(indexRequest) {
    // TODO rewrite params to suit oracle soda
    return new Promise((resolve, reject) => {
      this._oracleCollection.createIndex(
        indexRequest,
        { unique: true, background: true, sparse: true },
        error => {
          if (error) {
            reject(error);
          } else {
            resolve();
          }
        }
      );
    });
  }
}
