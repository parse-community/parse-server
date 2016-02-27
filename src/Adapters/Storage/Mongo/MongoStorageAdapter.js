
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
}

export default MongoStorageAdapter;
module.exports = MongoStorageAdapter; // Required for tests
