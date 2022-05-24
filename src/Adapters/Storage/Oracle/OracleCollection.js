const oracledb = require('oracledb');
const Collection = oracledb.SodaCollection;

export default class OracleCollection {
  _oracleCollection: Collection;

  constructor(oracleCollection: Collection) {
    this._oracleCollection = oracleCollection;
  }
}
