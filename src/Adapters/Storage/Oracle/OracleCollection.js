import marklog from '../../../marklog';

const oracledb = require('oracledb');
oracledb.autoCommit = true;
const Collection = oracledb.SodaCollection;

export default class OracleCollection {
  _oracleCollection: Collection;

  constructor(oracleCollection: Collection) {
    this._oracleCollection = oracleCollection;
  }

  // Atomically updates data in the database for a single (first) object that matched the query
  // If there is nothing that matches the query - does insert
  // Postgres Note: `INSERT ... ON CONFLICT UPDATE` that is available since 9.5.
  async upsertOne(query, update, session) {
    marklog('in upsertOne');
    marklog('query = ' + JSON.stringify(query));
    // TODO need to use save(), which is the SODA equivalent of upsert() andit takes a SodaDocument
    let docs;
    await this._rawFind(query)
      .then(d => (docs = d))
      .catch(error => marklog(error));
    marklog('use session to make linter happy ' + JSON.stringify(session));
    marklog('docs content = ' + JSON.stringify(docs.map(i => i.getContent())));

    if (docs && docs.length == 1) {
      // found the doc, so we need to update it
      const key = docs[0].key;
      marklog('key = ' + key);
      const oldContent = docs[0].getContent();
      marklog('oldContent = ' + JSON.stringify(oldContent));
      marklog('update = ' + JSON.stringify(update));
      const theUpdate = { [update.fieldName]: update.theFieldType };
      marklog('theUpdate = ' + JSON.stringify(theUpdate));
      const newContent = { ...oldContent, ...theUpdate };
      marklog('newContent = ' + JSON.stringify(newContent));

      await this._oracleCollection.find().key(key).replaceOne(newContent);
    } else {
      // otherwise we just need to insert
      marklog('update = ' + JSON.stringify(update));
      const theUpdate = { [update.fieldName]: update.theFieldType };
      marklog('theUpdate = ' + JSON.stringify(theUpdate));
      const newContent = { ...theUpdate };
      marklog('newContent = ' + JSON.stringify(newContent));
      await this._oracleCollection.insertOne(newContent);
    }

    return;
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
    let contentOfDocs;
    await findOperation
      .getDocuments()
      .then(d => (docs = d))
      .then(d => (contentOfDocs = d.map(i => i.getContent())));
    marklog('about to return docs = ' + JSON.stringify(contentOfDocs));
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
    marklog(
      'entered _ensureSparseUniqueIndexInBackground with indexRequest = ' +
        JSON.stringify(indexRequest)
    );
    this._createIndex(indexRequest);
  }

  _createIndex(indexRequest) {
    if (Object.keys(indexRequest).length == 0) {
      // no columns to index
      return null;
    }
    const cols = Object.keys(indexRequest).join('_');
    const fieldName = Object.keys(indexRequest)[0];
    const maxLength = indexRequest[Object.keys(indexRequest)[0]];
    const request = {
      name: 'index_' + cols,
      fields: [{ path: fieldName, maxlength: maxLength }],
      unique: true,
    };
    marklog('request = ' + JSON.stringify(request));
    return new Promise((resolve, reject) => {
      this._oracleCollection.createIndex(request, error => {
        if (error) {
          if (error.errorNum === 40733) {
            // ORA-40733: An index with the specified name already exists in the schema.
            // not an error - index is already there, nothing to do
            resolve();
          }
          reject(error);
        } else {
          resolve();
        }
      });
    });
  }
}
