import MongoCollection                          from './MongoCollection';
import MongoSchemaCollection                    from './MongoSchemaCollection';
import {parse as parseUrl, format as formatUrl} from '../../../vendor/mongodbUrl';
import _                                        from 'lodash';

let mongodb = require('mongodb');
let MongoClient = mongodb.MongoClient;

const MongoSchemaCollectionName = '_SCHEMA';

export class MongoStorageAdapter {
  // Private
  _uri: string;
  _collectionPrefix: string;
  _mongoOptions: Object;
  // Public
  connectionPromise;
  database;

  constructor({
    uri,
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
      .then(() => this.adaptiveCollection(this._collectionPrefix + MongoSchemaCollectionName))
      .then(collection => new MongoSchemaCollection(collection));
  }

  collectionExists(name: string) {
    return this.connect().then(() => {
      return this.database.listCollections({ name: this._collectionPrefix + name }).toArray();
    }).then(collections => {
      return collections.length > 0;
    });
  }

  dropCollection(name: string) {
    return this.collection(this._collectionPrefix + name).then(collection => collection.drop());
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

  // This function currently accepts the adaptive collection as a paramater because it isn't
  // actually capable of determining the location of it's own _SCHEMA collection without having
  // the collectionPrefix. Also, Schemas.js, the caller of this function, only stores the collection
  // itself, and not the prefix. Eventually Parse Server won't care what a SchemaCollection is and
  // will just tell the DB adapter to do things and it will do them.
  deleteFields(className: string, fieldNames, pointerFieldNames, adaptiveCollection) {
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

    return adaptiveCollection.updateMany({}, collectionUpdate)
    .then(updateResult => this.schemaCollection())
    .then(schemaCollection => schemaCollection.updateSchema(className, schemaUpdate));
  }
}

export default MongoStorageAdapter;
module.exports = MongoStorageAdapter; // Required for tests
