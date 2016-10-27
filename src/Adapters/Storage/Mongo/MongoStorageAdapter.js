import MongoCollection       from './MongoCollection';
import MongoSchemaCollection from './MongoSchemaCollection';
import {
  parse as parseUrl,
  format as formatUrl,
} from '../../../vendor/mongodbUrl';
import {
  parseObjectToMongoObjectForCreate,
  mongoObjectToParseObject,
  transformKey,
  transformWhere,
  transformUpdate,
} from './MongoTransform';
import _                     from 'lodash';

let mongodb = require('mongodb');
let MongoClient = mongodb.MongoClient;

const MongoSchemaCollectionName = '_SCHEMA';

const storageAdapterAllCollections = mongoAdapter => {
  return mongoAdapter.connect()
  .then(() => mongoAdapter.database.collections())
  .then(collections => {
    return collections.filter(collection => {
      if (collection.namespace.match(/\.system\./)) {
        return false;
      }
      // TODO: If you have one app with a collection prefix that happens to be a prefix of another
      // apps prefix, this will go very very badly. We should fix that somehow.
      return (collection.collectionName.indexOf(mongoAdapter._collectionPrefix) == 0);
    });
  });
}

const convertParseSchemaToMongoSchema = ({...schema}) => {
  delete schema.fields._rperm;
  delete schema.fields._wperm;

  if (schema.className === '_User') {
    // Legacy mongo adapter knows about the difference between password and _hashed_password.
    // Future database adapters will only know about _hashed_password.
    // Note: Parse Server will bring back password with injectDefaultSchema, so we don't need
    // to add _hashed_password back ever.
    delete schema.fields._hashed_password;
  }

  return schema;
}

// Returns { code, error } if invalid, or { result }, an object
// suitable for inserting into _SCHEMA collection, otherwise.
const mongoSchemaFromFieldsAndClassNameAndCLP = (fields, className, classLevelPermissions) => {
  let mongoObject = {
    _id: className,
    objectId: 'string',
    updatedAt: 'string',
    createdAt: 'string'
  };

  for (let fieldName in fields) {
    mongoObject[fieldName] = MongoSchemaCollection.parseFieldTypeToMongoFieldType(fields[fieldName]);
  }

  if (typeof classLevelPermissions !== 'undefined') {
    mongoObject._metadata = mongoObject._metadata || {};
    if (!classLevelPermissions) {
      delete mongoObject._metadata.class_permissions;
    } else {
      mongoObject._metadata.class_permissions = classLevelPermissions;
    }
  }

  return mongoObject;
}


export class MongoStorageAdapter {
  // Private
  _uri: string;
  _collectionPrefix: string;
  _mongoOptions: Object;
  // Public
  connectionPromise;
  database;

  constructor({
    uri = defaults.DefaultMongoURI,
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
      if (!database) {
        delete this.connectionPromise;
        return;
      }
      database.on('error', (error) => {
        delete this.connectionPromise;
      });
      database.on('close', (error) => {
        delete this.connectionPromise;
      });
      this.database = database;
    }).catch((err) => {
      delete this.connectionPromise;
      return Promise.reject(err);
    });

    return this.connectionPromise;
  }

  _adaptiveCollection(name: string) {
    return this.connect()
      .then(() => this.database.collection(this._collectionPrefix + name))
      .then(rawCollection => new MongoCollection(rawCollection));
  }

  _schemaCollection() {
    return this.connect()
      .then(() => this._adaptiveCollection(MongoSchemaCollectionName))
      .then(collection => new MongoSchemaCollection(collection));
  }

  classExists(name) {
    return this.connect().then(() => {
      return this.database.listCollections({ name: this._collectionPrefix + name }).toArray();
    }).then(collections => {
      return collections.length > 0;
    });
  }

  setClassLevelPermissions(className, CLPs) {
    return this._schemaCollection()
    .then(schemaCollection => schemaCollection.updateSchema(className, {
      $set: { _metadata: { class_permissions: CLPs } }
    }));
  }

  createClass(className, schema) {
    schema = convertParseSchemaToMongoSchema(schema);
    let mongoObject = mongoSchemaFromFieldsAndClassNameAndCLP(schema.fields, className, schema.classLevelPermissions);
    mongoObject._id = className;
    return this._schemaCollection()
    .then(schemaCollection => schemaCollection._collection.insertOne(mongoObject))
    .then(result => MongoSchemaCollection._TESTmongoSchemaToParseSchema(result.ops[0]))
    .catch(error => {
      if (error.code === 11000) { //Mongo's duplicate key error
        throw new Parse.Error(Parse.Error.DUPLICATE_VALUE, 'Class already exists.');
      } else {
        throw error;
      }
    })
  }

  addFieldIfNotExists(className, fieldName, type) {
    return this._schemaCollection()
    .then(schemaCollection => schemaCollection.addFieldIfNotExists(className, fieldName, type));
  }

  // Drops a collection. Resolves with true if it was a Parse Schema (eg. _User, Custom, etc.)
  // and resolves with false if it wasn't (eg. a join table). Rejects if deletion was impossible.
  deleteClass(className) {
    return this._adaptiveCollection(className)
    .then(collection => collection.drop())
    .catch(error => {
      // 'ns not found' means collection was already gone. Ignore deletion attempt.
      if (error.message == 'ns not found') {
        return;
      }
      throw error;
    })
    // We've dropped the collection, now remove the _SCHEMA document
    .then(() => this._schemaCollection())
    .then(schemaCollection => schemaCollection.findAndDeleteSchema(className))
  }

  // Delete all data known to this adatper. Used for testing.
  deleteAllClasses() {
    return storageAdapterAllCollections(this)
    .then(collections => Promise.all(collections.map(collection => collection.drop())));
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
  deleteFields(className, schema, fieldNames) {
    const mongoFormatNames = fieldNames.map(fieldName => {
      if (schema.fields[fieldName].type === 'Pointer') {
        return `_p_${fieldName}`
      } else {
        return fieldName;
      }
    });
    const collectionUpdate = { '$unset' : {} };
    mongoFormatNames.forEach(name => {
      collectionUpdate['$unset'][name] = null;
    });

    const schemaUpdate = { '$unset' : {} };
    fieldNames.forEach(name => {
      schemaUpdate['$unset'][name] = null;
    });

    return this._adaptiveCollection(className)
    .then(collection => collection.updateMany({}, collectionUpdate))
    .then(() => this._schemaCollection())
    .then(schemaCollection => schemaCollection.updateSchema(className, schemaUpdate));
  }

  // Return a promise for all schemas known to this adapter, in Parse format. In case the
  // schemas cannot be retrieved, returns a promise that rejects. Requirements for the
  // rejection reason are TBD.
  getAllClasses() {
    return this._schemaCollection().then(schemasCollection => schemasCollection._fetchAllSchemasFrom_SCHEMA());
  }

  // Return a promise for the schema with the given name, in Parse format. If
  // this adapter doesn't know about the schema, return a promise that rejects with
  // undefined as the reason.
  getClass(className) {
    return this._schemaCollection()
    .then(schemasCollection => schemasCollection._fechOneSchemaFrom_SCHEMA(className))
  }

  // TODO: As yet not particularly well specified. Creates an object. Maybe shouldn't even need the schema,
  // and should infer from the type. Or maybe does need the schema for validations. Or maybe needs
  // the schem only for the legacy mongo format. We'll figure that out later.
  createObject(className, schema, object) {
    schema = convertParseSchemaToMongoSchema(schema);
    const mongoObject = parseObjectToMongoObjectForCreate(className, object, schema);
    return this._adaptiveCollection(className)
    .then(collection => collection.insertOne(mongoObject))
    .catch(error => {
      if (error.code === 11000) { // Duplicate value
        throw new Parse.Error(Parse.Error.DUPLICATE_VALUE,
            'A duplicate value for a field with unique values was provided');
      }
      throw error;
    });
  }

  // Remove all objects that match the given Parse Query.
  // If no objects match, reject with OBJECT_NOT_FOUND. If objects are found and deleted, resolve with undefined.
  // If there is some other error, reject with INTERNAL_SERVER_ERROR.
  deleteObjectsByQuery(className, schema, query) {
    schema = convertParseSchemaToMongoSchema(schema);
    return this._adaptiveCollection(className)
    .then(collection => {
      let mongoWhere = transformWhere(className, query, schema);
      return collection.deleteMany(mongoWhere)
    })
    .then(({ result }) => {
      if (result.n === 0) {
        throw new Parse.Error(Parse.Error.OBJECT_NOT_FOUND, 'Object not found.');
      }
      return Promise.resolve();
    }, error => {
      throw new Parse.Error(Parse.Error.INTERNAL_SERVER_ERROR, 'Database adapter error');
    });
  }

  // Apply the update to all objects that match the given Parse Query.
  updateObjectsByQuery(className, schema, query, update) {
    schema = convertParseSchemaToMongoSchema(schema);
    const mongoUpdate = transformUpdate(className, update, schema);
    const mongoWhere = transformWhere(className, query, schema);
    return this._adaptiveCollection(className)
    .then(collection => collection.updateMany(mongoWhere, mongoUpdate));
  }

  // Atomically finds and updates an object based on query.
  // Return value not currently well specified.
  findOneAndUpdate(className, schema, query, update) {
    schema = convertParseSchemaToMongoSchema(schema);
    const mongoUpdate = transformUpdate(className, update, schema);
    const mongoWhere = transformWhere(className, query, schema);
    return this._adaptiveCollection(className)
    .then(collection => collection._mongoCollection.findAndModify(mongoWhere, [], mongoUpdate, { new: true }))
    .then(result => result.value);
  }

  // Hopefully we can get rid of this. It's only used for config and hooks.
  upsertOneObject(className, schema, query, update) {
    schema = convertParseSchemaToMongoSchema(schema);
    const mongoUpdate = transformUpdate(className, update, schema);
    const mongoWhere = transformWhere(className, query, schema);
    return this._adaptiveCollection(className)
    .then(collection => collection.upsertOne(mongoWhere, mongoUpdate));
  }

  // Executes a find. Accepts: className, query in Parse format, and { skip, limit, sort }.
  find(className, schema, query, { skip, limit, sort, keys }) {
    schema = convertParseSchemaToMongoSchema(schema);
    let mongoWhere = transformWhere(className, query, schema);
    let mongoSort = _.mapKeys(sort, (value, fieldName) => transformKey(className, fieldName, schema));
    let mongoKeys = _.reduce(keys, (memo, key) => {
      memo[transformKey(className, key, schema)] = 1;
      return memo;
    }, {});
    return this._adaptiveCollection(className)
    .then(collection => collection.find(mongoWhere, { skip, limit, sort: mongoSort, keys: mongoKeys }))
    .then(objects => objects.map(object => mongoObjectToParseObject(className, object, schema)))
  }

  // Create a unique index. Unique indexes on nullable fields are not allowed. Since we don't
  // currently know which fields are nullable and which aren't, we ignore that criteria.
  // As such, we shouldn't expose this function to users of parse until we have an out-of-band
  // Way of determining if a field is nullable. Undefined doesn't count against uniqueness,
  // which is why we use sparse indexes.
  ensureUniqueness(className, schema, fieldNames) {
    schema = convertParseSchemaToMongoSchema(schema);
    let indexCreationRequest = {};
    let mongoFieldNames = fieldNames.map(fieldName => transformKey(className, fieldName, schema));
    mongoFieldNames.forEach(fieldName => {
      indexCreationRequest[fieldName] = 1;
    });
    return this._adaptiveCollection(className)
    .then(collection => collection._ensureSparseUniqueIndexInBackground(indexCreationRequest))
    .catch(error => {
      if (error.code === 11000) {
        throw new Parse.Error(Parse.Error.DUPLICATE_VALUE, 'Tried to ensure field uniqueness for a class that already has duplicates.');
      } else {
        throw error;
      }
    });
  }

  // Used in tests
  _rawFind(className, query) {
    return this._adaptiveCollection(className).then(collection => collection.find(query));
  }

  // Executs a count.
  count(className, schema, query) {
    schema = convertParseSchemaToMongoSchema(schema);
    return this._adaptiveCollection(className)
    .then(collection => collection.count(transformWhere(className, query, schema)));
  }

  performInitialization() {
    return Promise.resolve();
  }
}

export default MongoStorageAdapter;
module.exports = MongoStorageAdapter; // Required for tests
