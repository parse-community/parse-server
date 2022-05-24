import OracleCollection from './OracleCollection';

class OracleSchemaCollection {
  _collection: OracleCollection;

  constructor(collection: OracleCollection) {
    this._collection = collection;
  }
}

export default OracleSchemaCollection;
