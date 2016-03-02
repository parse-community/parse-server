
import MongoCollection from './MongoCollection';

let mongodb = require('mongodb');
let MongoClient = mongodb.MongoClient;

export class MongoStorageAdapter {
  // Private
  _uri: string;
  // Public
  connectionPromise;
  database;

  constructor(uri: string) {
    this._uri = uri;
  }

  connect() {
    if (this.connectionPromise) {
      return this.connectionPromise;
    }

    this.connectionPromise = MongoClient.connect(this._uri).then(database => {
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
      .then(() => this.database.collection(name))
      .then(rawCollection => new MongoCollection(rawCollection));
  }

  collectionExists(name: string) {
    return this.connect().then(() => {
      return this.database.listCollections({ name: name }).toArray();
    }).then(collections => {
      return collections.length > 0;
    });
  }

  dropCollection(name: string) {
    return this.collection(name).then(collection => collection.drop());
  }
  // Used for testing only right now.
  collectionsContaining(match: string) {
    return this.connect().then(() => {
      return this.database.collections();
    }).then(collections => {
      return collections.filter(collection => {
        if (collection.namespace.match(/\.system\./)) {
          return false;
        }
        return (collection.collectionName.indexOf(match) == 0);
      });
    });
  }
}

export default MongoStorageAdapter;
module.exports = MongoStorageAdapter; // Required for tests
