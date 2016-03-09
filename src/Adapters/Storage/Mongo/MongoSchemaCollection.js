
import MongoCollection from './MongoCollection';

function _mongoSchemaQueryFromNameQuery(name: string, query) {
  return _mongoSchemaObjectFromNameFields(name, query);
}

function _mongoSchemaObjectFromNameFields(name: string, fields) {
  let object = { _id: name };
  if (fields) {
    Object.keys(fields).forEach(key => {
      object[key] = fields[key];
    });
  }
  return object;
}

export default class MongoSchemaCollection {
  _collection: MongoCollection;

  constructor(collection: MongoCollection) {
    this._collection = collection;
  }

  getAllSchemas() {
    return this._collection._rawFind({});
  }

  findSchema(name: string) {
    return this._collection._rawFind(_mongoSchemaQueryFromNameQuery(name), { limit: 1 }).then(results => {
      return results[0];
    });
  }

  // Atomically find and delete an object based on query.
  // The result is the promise with an object that was in the database before deleting.
  // Postgres Note: Translates directly to `DELETE * FROM ... RETURNING *`, which will return data after delete is done.
  findAndDeleteSchema(name: string) {
    // arguments: query, sort
    return this._collection._mongoCollection.findAndRemove(_mongoSchemaQueryFromNameQuery(name), []).then(document => {
      // Value is the object where mongo returns multiple fields.
      return document.value;
    });
  }

  addSchema(name: string, fields) {
    let mongoObject = _mongoSchemaObjectFromNameFields(name, fields);
    return this._collection.insertOne(mongoObject);
  }

  updateSchema(name: string, update) {
    return this._collection.updateOne(_mongoSchemaQueryFromNameQuery(name), update);
  }

  upsertSchema(name: string, query: string, update) {
    return this._collection.upsertOne(_mongoSchemaQueryFromNameQuery(name, query), update);
  }
}
