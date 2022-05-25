import defaults from '../../../defaults';
import OracleSchemaCollection from './OracleSchemaCollection';
import OracleCollection from './OracleCollection';
import { StorageAdapter } from '../StorageAdapter';
import type { StorageClass } from '../StorageAdapter';
import Parse from 'parse/node';

const oracledb = require('oracledb');
const OracleSchemaCollectionName = '_SCHEMA';

export class OracleStorageAdapter implements StorageAdapter {
  // private
  _onchange: any;
  _collectionPrefix: string;

  // public
  connectionPromise: ?Promise<any>;

  constructor({ uri = defaults.DefaultOracleURI, collectionPrefix = '', oracleOptions = {} }: any) {
    console.log(
      'constructor, uri = ' +
        uri +
        'collectionPrefix = ' +
        collectionPrefix +
        'oracleOptions = ' +
        oracleOptions
    );
    this._collectionPrefix = collectionPrefix;
  }

  _schemaCollection(): Promise<OracleSchemaCollection> {
    return this.connect() // returns a promise containing a pool
      .then(() => this._adaptiveCollection(OracleSchemaCollectionName))
      .then(collection => {
        if (!this._stream && this.enableSchemaHooks) {
          this._stream = collection._orcaleCollection.watch();
          this._stream.on('change', () => this._onchange());
        }
        return new OracleSchemaCollection(collection);
      });
  }

  async _adaptiveCollection(name: string) {
    console.log('MARK: _adaptiveCollection(' + name + ')');
    let soda;
    let collection;
    await this.connect() // promise<pool>
      .then(pool => pool.getConnection())
      .then(conn => conn.getSodaDatabase())
      .then(s => (soda = s))
      .catch(err => this.handleError(err));
    await soda
      .openCollection(this._collectionPrefix + name)
      .then(rawCollection => {
        // openCollection() does not return an error if the
        // collection does not exist - so we need to check
        // if the return value is undefined to know if we
        // got the collection, or whether we did not, and
        // therefore need to create it
        if (rawCollection) {
          collection = new OracleCollection(rawCollection);
        }
      })
      .catch(err => this.handleError(err));

    if (collection === undefined) {
      // the collection did not exist, so we need to create it
      console.log('collection did not exist, need to create it');
      await soda
        .createCollection(this._collectionPrefix + name)
        .catch(err => this.handleError(err));

      await soda
        .openCollection(this._collectionPrefix + name)
        .then(coll => (collection = new OracleCollection(coll)))
        .catch(err => this.handleError(err));
    }

    console.log('MARK: collection = ' + JSON.stringify(collection));
    return collection;
  }

  connect() {
    if (this.connectionPromise) {
      return this.connectionPromise;
    }

    // parsing and re-formatting causes the auth value (if there) to get URI
    // encoded
    //const encodedUri = formatUrl(parseUrl(this._uri));

    oracledb.initOracleClient({});
    this.connectionPromise = oracledb.createPool({
      // TODO read these from config!!!
      user: 'pdbadmin',
      password: 'Welcome123##',
      connectString: 'localhost:1521/pdb1',
    });

    // TODO this is not right.. what we want to do is connect if we are not already connected
    // then return something... we don't have a "client" as such - closest thing might be a
    // connection or a pool.. maybe we need to invent a client wrapper over oracledb ..
    return this.connectionPromise;
  }

  handleError<T>(error: ?(Error | Parse.Error)): Promise<T> {
    // if (error && error.code === 13) {
    //   // Unauthorized error
    //   delete this.client;
    //   delete this.database;
    //   delete this.connectionPromise;
    //   logger.error('Received unauthorized error', { error: error });
    // }
    throw error;
  }

  // classExists(className: string): Promise<boolean>;
  // setClassLevelPermissions(className: string, clps: any): Promise<void>;
  // createClass(className: string, schema: SchemaType): Promise<void>;
  // addFieldIfNotExists(className: string, fieldName: string, type: any): Promise<void>;
  // updateFieldOptions(className: string, fieldName: string, type: any): Promise<void>;
  // deleteClass(className: string): Promise<void>;
  // deleteAllClasses(fast: boolean): Promise<void>;
  // deleteFields(className: string, schema: SchemaType, fieldNames: Array<string>): Promise<void>;

  // Return a promise for all schemas known to this adapter, in Parse format. In case the
  // schemas cannot be retrieved, returns a promise that rejects. Requirements for the
  // rejection reason are TBD.
  getAllClasses(): Promise<StorageClass[]> {
    return this._schemaCollection()
      .then(schemasCollection => schemasCollection._fetchAllSchemasFrom_SCHEMA())
      .catch(err => this.handleError(err));
  }

  // getClass(className: string): Promise<StorageClass>;
  // createObject(
  //   className: string,
  //   schema: SchemaType,
  //   object: any,
  //   transactionalSession: ?any
  // ): Promise<any>;
  // deleteObjectsByQuery(
  //   className: string,
  //   schema: SchemaType,
  //   query: QueryType,
  //   transactionalSession: ?any
  // ): Promise<void>;
  // updateObjectsByQuery(
  //   className: string,
  //   schema: SchemaType,
  //   query: QueryType,
  //   update: any,
  //   transactionalSession: ?any
  // ): Promise<[any]>;
  // findOneAndUpdate(
  //   className: string,
  //   schema: SchemaType,
  //   query: QueryType,
  //   update: any,
  //   transactionalSession: ?any
  // ): Promise<any>;
  // upsertOneObject(
  //   className: string,
  //   schema: SchemaType,
  //   query: QueryType,
  //   update: any,
  //   transactionalSession: ?any
  // ): Promise<any>;
  // find(
  //   className: string,
  //   schema: SchemaType,
  //   query: QueryType,
  //   options: QueryOptions
  // ): Promise<[any]>;
  // ensureIndex(
  //   className: string,
  //   schema: SchemaType,
  //   fieldNames: string[],
  //   indexName?: string,
  //   caseSensitive?: boolean,
  //   options?: Object
  // ): Promise<any>;
  // ensureUniqueness(className: string, schema: SchemaType, fieldNames: Array<string>): Promise<void>;
  // count(
  //   className: string,
  //   schema: SchemaType,
  //   query: QueryType,
  //   readPreference?: string,
  //   estimate?: boolean,
  //   hint?: mixed
  // ): Promise<number>;
  // distinct(
  //   className: string,
  //   schema: SchemaType,
  //   query: QueryType,
  //   fieldName: string
  // ): Promise<any>;
  // aggregate(
  //   className: string,
  //   schema: any,
  //   pipeline: any,
  //   readPreference: ?string,
  //   hint: ?mixed,
  //   explain?: boolean
  // ): Promise<any>;

  performInitialization(): Promise<void> {
    return Promise.resolve();
  }

  watch(callback: () => void): void {
    this._onchange = callback;
  }

  // // Indexing
  // createIndexes(className: string, indexes: any, conn: ?any): Promise<void>;
  // getIndexes(className: string, connection: ?any): Promise<void>;
  // updateSchemaWithIndexes(): Promise<void>;
  // setIndexesWithSchemaFormat(
  //   className: string,
  //   submittedIndexes: any,
  //   existingIndexes: any,
  //   fields: any,
  //   conn: ?any
  // ): Promise<void>;
  // createTransactionalSession(): Promise<any>;
  // commitTransactionalSession(transactionalSession: any): Promise<void>;
  // abortTransactionalSession(transactionalSession: any): Promise<void>;
}

export default OracleStorageAdapter;
