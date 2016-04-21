import MongoCollection                          from './MongoCollection';
import MongoSchemaCollection                    from './MongoSchemaCollection';
import {parse as parseUrl, format as formatUrl} from '../../../vendor/mongodbUrl';
import * as transform                           from './MongoTransform';
import _                                        from 'lodash';

let mongodb = require('mongodb');
let MongoClient = mongodb.MongoClient;

const MongoSchemaCollectionName = '_SCHEMA';
const DefaultMongoURI = 'mongodb://localhost:27017/parse';

export class MongoStorageAdapter {
  // Private
  _uri: string;
  _collectionPrefix: string;
  _mongoOptions: Object;
  // Public
  connectionPromise;
  database;

  constructor({
    uri = DefaultMongoURI,
    collectionPrefix = '',
    mongoOptions = {},
  }) {
    this._uri = uri;
    this._collectionPrefix = collectionPrefix;
    this._mongoOptions = mongoOptions;
  }

  connect() {
    if (this.connectionPromise) {
      return this.connectionPromise;
    }

    // parsing and re-formatting causes the auth value (if there) to get URI
    // encoded
    const encodedUri = formatUrl(parseUrl(this._uri));

    this.connectionPromise = MongoClient.connect(encodedUri, this._mongoOptions).then(database => {
      this.database = database;
    });
    return this.connectionPromise;
  }

  collection(name: string) {
    return this.connect().then(() => {
      return this.database.collection(name);
    });
  }

  adaptiveCollection(name: string) {
    return this.connect()
      .then(() => this.database.collection(this._collectionPrefix + name))
      .then(rawCollection => new MongoCollection(rawCollection));
  }

  schemaCollection() {
    return this.connect()
      .then(() => this.adaptiveCollection(MongoSchemaCollectionName))
      .then(collection => new MongoSchemaCollection(collection));
  }

  collectionExists(name: string) {
    return this.connect().then(() => {
      return this.database.listCollections({ name: this._collectionPrefix + name }).toArray();
    }).then(collections => {
      return collections.length > 0;
    });
  }

  dropCollection(className: string) {
    return this.collection(this._collectionPrefix + className).then(collection => collection.drop())
    .catch(error => {
      // 'ns not found' means collection was already gone. Ignore deletion attempt.
      if (error.message == 'ns not found') {
        return Promise.resolve();
      }
      return Promise.reject(error);
    });
  }

  // Used for testing only right now.
  allCollections() {
    return this.connect().then(() => {
      return this.database.collections();
    }).then(collections => {
      return collections.filter(collection => {
        if (collection.namespace.match(/\.system\./)) {
          return false;
        }
        return (collection.collectionName.indexOf(this._collectionPrefix) == 0);
      });
    });
  }

  // Remove the column and all the data. For Relations, the _Join collection is handled
  // specially, this function does not delete _Join columns. It should, however, indicate
  // that the relation fields does not exist anymore. In mongo, this means removing it from
  // the _SCHEMA collection.  There should be no actual data in the collection under the same name
  // as the relation column, so it's fine to attempt to delete it. If the fields listed to be
  // deleted do not exist, this function should return successfully anyways. Checking for
  // attempts to delete non-existent fields is the responsibility of Parse Server.

  // Pointer field names are passed for legacy reasons: the original mongo
  // format stored pointer field names differently in the database, and therefore
  // needed to know the type of the field before it could delete it. Future database
  // adatpers should ignore the pointerFieldNames argument. All the field names are in
  // fieldNames, they show up additionally in the pointerFieldNames database for use
  // by the mongo adapter, which deals with the legacy mongo format.

  // This function is not obligated to delete fields atomically. It is given the field
  // names in a list so that databases that are capable of deleting fields atomically
  // may do so.

  // Returns a Promise.
  deleteFields(className: string, fieldNames, pointerFieldNames) {
    const nonPointerFieldNames = _.difference(fieldNames, pointerFieldNames);
    const mongoFormatNames = nonPointerFieldNames.concat(pointerFieldNames.map(name => `_p_${name}`));
    const collectionUpdate = { '$unset' : {} };
    mongoFormatNames.forEach(name => {
      collectionUpdate['$unset'][name] = null;
    });

    const schemaUpdate = { '$unset' : {} };
    fieldNames.forEach(name => {
      schemaUpdate['$unset'][name] = null;
    });

    return this.adaptiveCollection(className)
    .then(collection => collection.updateMany({}, collectionUpdate))
    .then(updateResult => this.schemaCollection())
    .then(schemaCollection => schemaCollection.updateSchema(className, schemaUpdate));
  }

  // Return a promise for all schemas known to this adapter, in Parse format. In case the
  // schemas cannot be retrieved, returns a promise that rejects. Requirements for the
  // rejection reason are TBD.
  getAllSchemas() {
    return this.schemaCollection().then(schemasCollection => schemasCollection._fetchAllSchemasFrom_SCHEMA());
  }

  // Return a promise for the schema with the given name, in Parse format. If
  // this adapter doesn't know about the schema, return a promise that rejects with
  // undefined as the reason.
  getOneSchema(className) {
    return this.schemaCollection()
    .then(schemasCollection => schemasCollection._fechOneSchemaFrom_SCHEMA(className));
  }

  // TODO: As yet not particularly well specified. Creates an object. Shouldn't need the
  // schemaController, but MongoTransform still needs it :( maybe shouldn't even need the schema,
  // and should infer from the type. Or maybe does need the schema for validations. Or maybe needs
  // the schem only for the legacy mongo format. We'll figure that out later.
  createObject(className, object, schemaController, parseFormatSchema) {
    const mongoObject = transform.parseObjectToMongoObjectForCreate(schemaController, className, object, parseFormatSchema);
    return this.adaptiveCollection(className)
    .then(collection => collection.insertOne(mongoObject));
  }

  // Remove the object with the given ID. If the object does not exist, reject with OBJECT_NOT_FOUND.
  // If there is a different type of error, reject with INTERNAL_SERVER_ERROR and a message
  // that doesn't leak info to the client.
  deleteObject(className, objectId) {
    return this.adaptiveCollection(className)
    .then(collection => collection.deleteOne({ _id: objectId }))
    .then(({ deletedCount }) => {
      if (deletedCount === 1) {
        return Promise.resolve();
      } else {
        throw new Parse.Error(Parse.Error.OBJECT_NOT_FOUND, 'Object not found.');
      }
    }, error => {
      throw new Parse.Error(Parse.Error.INTERNAL_SERVER_ERROR, 'Database adapter error.');
    });
  }

  //
  deleteObjectsByQuery(className, query) {
  }

  get transform() {
    return transform;
  }
}

export default MongoStorageAdapter;
module.exports = MongoStorageAdapter; // Required for tests
