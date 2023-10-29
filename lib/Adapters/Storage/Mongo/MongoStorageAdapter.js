"use strict";

Object.defineProperty(exports, "__esModule", {
  value: true
});
exports.default = exports.MongoStorageAdapter = void 0;
var _MongoCollection = _interopRequireDefault(require("./MongoCollection"));
var _MongoSchemaCollection = _interopRequireDefault(require("./MongoSchemaCollection"));
var _StorageAdapter = require("../StorageAdapter");
var _mongodbUrl = require("../../../vendor/mongodbUrl");
var _MongoTransform = require("./MongoTransform");
var _node = _interopRequireDefault(require("parse/node"));
var _lodash = _interopRequireDefault(require("lodash"));
var _defaults = _interopRequireDefault(require("../../../defaults"));
var _logger = _interopRequireDefault(require("../../../logger"));
function _interopRequireDefault(obj) { return obj && obj.__esModule ? obj : { default: obj }; }
function ownKeys(object, enumerableOnly) { var keys = Object.keys(object); if (Object.getOwnPropertySymbols) { var symbols = Object.getOwnPropertySymbols(object); enumerableOnly && (symbols = symbols.filter(function (sym) { return Object.getOwnPropertyDescriptor(object, sym).enumerable; })), keys.push.apply(keys, symbols); } return keys; }
function _objectSpread(target) { for (var i = 1; i < arguments.length; i++) { var source = null != arguments[i] ? arguments[i] : {}; i % 2 ? ownKeys(Object(source), !0).forEach(function (key) { _defineProperty(target, key, source[key]); }) : Object.getOwnPropertyDescriptors ? Object.defineProperties(target, Object.getOwnPropertyDescriptors(source)) : ownKeys(Object(source)).forEach(function (key) { Object.defineProperty(target, key, Object.getOwnPropertyDescriptor(source, key)); }); } return target; }
function _defineProperty(obj, key, value) { key = _toPropertyKey(key); if (key in obj) { Object.defineProperty(obj, key, { value: value, enumerable: true, configurable: true, writable: true }); } else { obj[key] = value; } return obj; }
function _toPropertyKey(arg) { var key = _toPrimitive(arg, "string"); return typeof key === "symbol" ? key : String(key); }
function _toPrimitive(input, hint) { if (typeof input !== "object" || input === null) return input; var prim = input[Symbol.toPrimitive]; if (prim !== undefined) { var res = prim.call(input, hint || "default"); if (typeof res !== "object") return res; throw new TypeError("@@toPrimitive must return a primitive value."); } return (hint === "string" ? String : Number)(input); }
function _objectWithoutProperties(source, excluded) { if (source == null) return {}; var target = _objectWithoutPropertiesLoose(source, excluded); var key, i; if (Object.getOwnPropertySymbols) { var sourceSymbolKeys = Object.getOwnPropertySymbols(source); for (i = 0; i < sourceSymbolKeys.length; i++) { key = sourceSymbolKeys[i]; if (excluded.indexOf(key) >= 0) continue; if (!Object.prototype.propertyIsEnumerable.call(source, key)) continue; target[key] = source[key]; } } return target; }
function _objectWithoutPropertiesLoose(source, excluded) { if (source == null) return {}; var target = {}; var sourceKeys = Object.keys(source); var key, i; for (i = 0; i < sourceKeys.length; i++) { key = sourceKeys[i]; if (excluded.indexOf(key) >= 0) continue; target[key] = source[key]; } return target; }
function _extends() { _extends = Object.assign ? Object.assign.bind() : function (target) { for (var i = 1; i < arguments.length; i++) { var source = arguments[i]; for (var key in source) { if (Object.prototype.hasOwnProperty.call(source, key)) { target[key] = source[key]; } } } return target; }; return _extends.apply(this, arguments); } // -disable-next
// -disable-next
// -disable-next
const mongodb = require('mongodb');
const MongoClient = mongodb.MongoClient;
const ReadPreference = mongodb.ReadPreference;
const MongoSchemaCollectionName = '_SCHEMA';
const storageAdapterAllCollections = mongoAdapter => {
  return mongoAdapter.connect().then(() => mongoAdapter.database.collections()).then(collections => {
    return collections.filter(collection => {
      if (collection.namespace.match(/\.system\./)) {
        return false;
      }
      // TODO: If you have one app with a collection prefix that happens to be a prefix of another
      // apps prefix, this will go very very badly. We should fix that somehow.
      return collection.collectionName.indexOf(mongoAdapter._collectionPrefix) == 0;
    });
  });
};
const convertParseSchemaToMongoSchema = _ref => {
  let schema = _extends({}, _ref);
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
};

// Returns { code, error } if invalid, or { result }, an object
// suitable for inserting into _SCHEMA collection, otherwise.
const mongoSchemaFromFieldsAndClassNameAndCLP = (fields, className, classLevelPermissions, indexes) => {
  const mongoObject = {
    _id: className,
    objectId: 'string',
    updatedAt: 'string',
    createdAt: 'string',
    _metadata: undefined
  };
  for (const fieldName in fields) {
    const _fields$fieldName = fields[fieldName],
      {
        type,
        targetClass
      } = _fields$fieldName,
      fieldOptions = _objectWithoutProperties(_fields$fieldName, ["type", "targetClass"]);
    mongoObject[fieldName] = _MongoSchemaCollection.default.parseFieldTypeToMongoFieldType({
      type,
      targetClass
    });
    if (fieldOptions && Object.keys(fieldOptions).length > 0) {
      mongoObject._metadata = mongoObject._metadata || {};
      mongoObject._metadata.fields_options = mongoObject._metadata.fields_options || {};
      mongoObject._metadata.fields_options[fieldName] = fieldOptions;
    }
  }
  if (typeof classLevelPermissions !== 'undefined') {
    mongoObject._metadata = mongoObject._metadata || {};
    if (!classLevelPermissions) {
      delete mongoObject._metadata.class_permissions;
    } else {
      mongoObject._metadata.class_permissions = classLevelPermissions;
    }
  }
  if (indexes && typeof indexes === 'object' && Object.keys(indexes).length > 0) {
    mongoObject._metadata = mongoObject._metadata || {};
    mongoObject._metadata.indexes = indexes;
  }
  if (!mongoObject._metadata) {
    // cleanup the unused _metadata
    delete mongoObject._metadata;
  }
  return mongoObject;
};
function validateExplainValue(explain) {
  if (explain) {
    // The list of allowed explain values is from node-mongodb-native/lib/explain.js
    const explainAllowedValues = ['queryPlanner', 'queryPlannerExtended', 'executionStats', 'allPlansExecution', false, true];
    if (!explainAllowedValues.includes(explain)) {
      throw new _node.default.Error(_node.default.Error.INVALID_QUERY, 'Invalid value for explain');
    }
  }
}
class MongoStorageAdapter {
  // Private

  // Public

  constructor({
    uri = _defaults.default.DefaultMongoURI,
    collectionPrefix = '',
    mongoOptions = {}
  }) {
    this._uri = uri;
    this._collectionPrefix = collectionPrefix;
    this._mongoOptions = _objectSpread({}, mongoOptions);
    this._mongoOptions.useNewUrlParser = true;
    this._mongoOptions.useUnifiedTopology = true;
    this._onchange = () => {};

    // MaxTimeMS is not a global MongoDB client option, it is applied per operation.
    this._maxTimeMS = mongoOptions.maxTimeMS;
    this.canSortOnJoinTables = true;
    this.enableSchemaHooks = !!mongoOptions.enableSchemaHooks;
    this.schemaCacheTtl = mongoOptions.schemaCacheTtl;
    this.disableIndexFieldValidation = !!mongoOptions.disableIndexFieldValidation;
    for (const key of ['enableSchemaHooks', 'schemaCacheTtl', 'maxTimeMS', 'disableIndexFieldValidation']) {
      delete this._mongoOptions[key];
    }
  }
  watch(callback) {
    this._onchange = callback;
  }
  connect() {
    if (this.connectionPromise) {
      return this.connectionPromise;
    }

    // parsing and re-formatting causes the auth value (if there) to get URI
    // encoded
    const encodedUri = (0, _mongodbUrl.format)((0, _mongodbUrl.parse)(this._uri));
    this.connectionPromise = MongoClient.connect(encodedUri, this._mongoOptions).then(client => {
      // Starting mongoDB 3.0, the MongoClient.connect don't return a DB anymore but a client
      // Fortunately, we can get back the options and use them to select the proper DB.
      // https://github.com/mongodb/node-mongodb-native/blob/2c35d76f08574225b8db02d7bef687123e6bb018/lib/mongo_client.js#L885
      const options = client.s.options;
      const database = client.db(options.dbName);
      if (!database) {
        delete this.connectionPromise;
        return;
      }
      client.on('error', () => {
        delete this.connectionPromise;
      });
      client.on('close', () => {
        delete this.connectionPromise;
      });
      this.client = client;
      this.database = database;
    }).catch(err => {
      delete this.connectionPromise;
      return Promise.reject(err);
    });
    return this.connectionPromise;
  }
  handleError(error) {
    if (error && error.code === 13) {
      // Unauthorized error
      delete this.client;
      delete this.database;
      delete this.connectionPromise;
      _logger.default.error('Received unauthorized error', {
        error: error
      });
    }
    throw error;
  }
  async handleShutdown() {
    if (!this.client) {
      return;
    }
    await this.client.close(false);
    delete this.connectionPromise;
  }
  _adaptiveCollection(name) {
    return this.connect().then(() => this.database.collection(this._collectionPrefix + name)).then(rawCollection => new _MongoCollection.default(rawCollection)).catch(err => this.handleError(err));
  }
  _schemaCollection() {
    return this.connect().then(() => this._adaptiveCollection(MongoSchemaCollectionName)).then(collection => {
      if (!this._stream && this.enableSchemaHooks) {
        this._stream = collection._mongoCollection.watch();
        this._stream.on('change', () => this._onchange());
      }
      return new _MongoSchemaCollection.default(collection);
    });
  }
  classExists(name) {
    return this.connect().then(() => {
      return this.database.listCollections({
        name: this._collectionPrefix + name
      }).toArray();
    }).then(collections => {
      return collections.length > 0;
    }).catch(err => this.handleError(err));
  }
  setClassLevelPermissions(className, CLPs) {
    return this._schemaCollection().then(schemaCollection => schemaCollection.updateSchema(className, {
      $set: {
        '_metadata.class_permissions': CLPs
      }
    })).catch(err => this.handleError(err));
  }
  setIndexesWithSchemaFormat(className, submittedIndexes, existingIndexes = {}, fields) {
    if (submittedIndexes === undefined) {
      return Promise.resolve();
    }
    if (Object.keys(existingIndexes).length === 0) {
      existingIndexes = {
        _id_: {
          _id: 1
        }
      };
    }
    const deletePromises = [];
    const insertedIndexes = [];
    Object.keys(submittedIndexes).forEach(name => {
      const field = submittedIndexes[name];
      if (existingIndexes[name] && field.__op !== 'Delete') {
        throw new _node.default.Error(_node.default.Error.INVALID_QUERY, `Index ${name} exists, cannot update.`);
      }
      if (!existingIndexes[name] && field.__op === 'Delete') {
        throw new _node.default.Error(_node.default.Error.INVALID_QUERY, `Index ${name} does not exist, cannot delete.`);
      }
      if (field.__op === 'Delete') {
        const promise = this.dropIndex(className, name);
        deletePromises.push(promise);
        delete existingIndexes[name];
      } else {
        Object.keys(field).forEach(key => {
          if (!this.disableIndexFieldValidation && !Object.prototype.hasOwnProperty.call(fields, key.indexOf('_p_') === 0 ? key.replace('_p_', '') : key)) {
            throw new _node.default.Error(_node.default.Error.INVALID_QUERY, `Field ${key} does not exist, cannot add index.`);
          }
        });
        existingIndexes[name] = field;
        insertedIndexes.push({
          key: field,
          name
        });
      }
    });
    let insertPromise = Promise.resolve();
    if (insertedIndexes.length > 0) {
      insertPromise = this.createIndexes(className, insertedIndexes);
    }
    return Promise.all(deletePromises).then(() => insertPromise).then(() => this._schemaCollection()).then(schemaCollection => schemaCollection.updateSchema(className, {
      $set: {
        '_metadata.indexes': existingIndexes
      }
    })).catch(err => this.handleError(err));
  }
  setIndexesFromMongo(className) {
    return this.getIndexes(className).then(indexes => {
      indexes = indexes.reduce((obj, index) => {
        if (index.key._fts) {
          delete index.key._fts;
          delete index.key._ftsx;
          for (const field in index.weights) {
            index.key[field] = 'text';
          }
        }
        obj[index.name] = index.key;
        return obj;
      }, {});
      return this._schemaCollection().then(schemaCollection => schemaCollection.updateSchema(className, {
        $set: {
          '_metadata.indexes': indexes
        }
      }));
    }).catch(err => this.handleError(err)).catch(() => {
      // Ignore if collection not found
      return Promise.resolve();
    });
  }
  createClass(className, schema) {
    schema = convertParseSchemaToMongoSchema(schema);
    const mongoObject = mongoSchemaFromFieldsAndClassNameAndCLP(schema.fields, className, schema.classLevelPermissions, schema.indexes);
    mongoObject._id = className;
    return this.setIndexesWithSchemaFormat(className, schema.indexes, {}, schema.fields).then(() => this._schemaCollection()).then(schemaCollection => schemaCollection.insertSchema(mongoObject)).catch(err => this.handleError(err));
  }
  async updateFieldOptions(className, fieldName, type) {
    const schemaCollection = await this._schemaCollection();
    await schemaCollection.updateFieldOptions(className, fieldName, type);
  }
  addFieldIfNotExists(className, fieldName, type) {
    return this._schemaCollection().then(schemaCollection => schemaCollection.addFieldIfNotExists(className, fieldName, type)).then(() => this.createIndexesIfNeeded(className, fieldName, type)).catch(err => this.handleError(err));
  }

  // Drops a collection. Resolves with true if it was a Parse Schema (eg. _User, Custom, etc.)
  // and resolves with false if it wasn't (eg. a join table). Rejects if deletion was impossible.
  deleteClass(className) {
    return this._adaptiveCollection(className).then(collection => collection.drop()).catch(error => {
      // 'ns not found' means collection was already gone. Ignore deletion attempt.
      if (error.message == 'ns not found') {
        return;
      }
      throw error;
    })
    // We've dropped the collection, now remove the _SCHEMA document
    .then(() => this._schemaCollection()).then(schemaCollection => schemaCollection.findAndDeleteSchema(className)).catch(err => this.handleError(err));
  }
  deleteAllClasses(fast) {
    return storageAdapterAllCollections(this).then(collections => Promise.all(collections.map(collection => fast ? collection.deleteMany({}) : collection.drop())));
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
  // adapters should ignore the pointerFieldNames argument. All the field names are in
  // fieldNames, they show up additionally in the pointerFieldNames database for use
  // by the mongo adapter, which deals with the legacy mongo format.

  // This function is not obligated to delete fields atomically. It is given the field
  // names in a list so that databases that are capable of deleting fields atomically
  // may do so.

  // Returns a Promise.
  deleteFields(className, schema, fieldNames) {
    const mongoFormatNames = fieldNames.map(fieldName => {
      if (schema.fields[fieldName].type === 'Pointer') {
        return `_p_${fieldName}`;
      } else {
        return fieldName;
      }
    });
    const collectionUpdate = {
      $unset: {}
    };
    mongoFormatNames.forEach(name => {
      collectionUpdate['$unset'][name] = null;
    });
    const collectionFilter = {
      $or: []
    };
    mongoFormatNames.forEach(name => {
      collectionFilter['$or'].push({
        [name]: {
          $exists: true
        }
      });
    });
    const schemaUpdate = {
      $unset: {}
    };
    fieldNames.forEach(name => {
      schemaUpdate['$unset'][name] = null;
      schemaUpdate['$unset'][`_metadata.fields_options.${name}`] = null;
    });
    return this._adaptiveCollection(className).then(collection => collection.updateMany(collectionFilter, collectionUpdate)).then(() => this._schemaCollection()).then(schemaCollection => schemaCollection.updateSchema(className, schemaUpdate)).catch(err => this.handleError(err));
  }

  // Return a promise for all schemas known to this adapter, in Parse format. In case the
  // schemas cannot be retrieved, returns a promise that rejects. Requirements for the
  // rejection reason are TBD.
  getAllClasses() {
    return this._schemaCollection().then(schemasCollection => schemasCollection._fetchAllSchemasFrom_SCHEMA()).catch(err => this.handleError(err));
  }

  // Return a promise for the schema with the given name, in Parse format. If
  // this adapter doesn't know about the schema, return a promise that rejects with
  // undefined as the reason.
  getClass(className) {
    return this._schemaCollection().then(schemasCollection => schemasCollection._fetchOneSchemaFrom_SCHEMA(className)).catch(err => this.handleError(err));
  }

  // TODO: As yet not particularly well specified. Creates an object. Maybe shouldn't even need the schema,
  // and should infer from the type. Or maybe does need the schema for validations. Or maybe needs
  // the schema only for the legacy mongo format. We'll figure that out later.
  createObject(className, schema, object, transactionalSession) {
    schema = convertParseSchemaToMongoSchema(schema);
    const mongoObject = (0, _MongoTransform.parseObjectToMongoObjectForCreate)(className, object, schema);
    return this._adaptiveCollection(className).then(collection => collection.insertOne(mongoObject, transactionalSession)).then(() => ({
      ops: [mongoObject]
    })).catch(error => {
      if (error.code === 11000) {
        // Duplicate value
        const err = new _node.default.Error(_node.default.Error.DUPLICATE_VALUE, 'A duplicate value for a field with unique values was provided');
        err.underlyingError = error;
        if (error.message) {
          const matches = error.message.match(/index:[\sa-zA-Z0-9_\-\.]+\$?([a-zA-Z_-]+)_1/);
          if (matches && Array.isArray(matches)) {
            err.userInfo = {
              duplicated_field: matches[1]
            };
          }
        }
        throw err;
      }
      throw error;
    }).catch(err => this.handleError(err));
  }

  // Remove all objects that match the given Parse Query.
  // If no objects match, reject with OBJECT_NOT_FOUND. If objects are found and deleted, resolve with undefined.
  // If there is some other error, reject with INTERNAL_SERVER_ERROR.
  deleteObjectsByQuery(className, schema, query, transactionalSession) {
    schema = convertParseSchemaToMongoSchema(schema);
    return this._adaptiveCollection(className).then(collection => {
      const mongoWhere = (0, _MongoTransform.transformWhere)(className, query, schema);
      return collection.deleteMany(mongoWhere, transactionalSession);
    }).catch(err => this.handleError(err)).then(({
      deletedCount
    }) => {
      if (deletedCount === 0) {
        throw new _node.default.Error(_node.default.Error.OBJECT_NOT_FOUND, 'Object not found.');
      }
      return Promise.resolve();
    }, () => {
      throw new _node.default.Error(_node.default.Error.INTERNAL_SERVER_ERROR, 'Database adapter error');
    });
  }

  // Apply the update to all objects that match the given Parse Query.
  updateObjectsByQuery(className, schema, query, update, transactionalSession) {
    schema = convertParseSchemaToMongoSchema(schema);
    const mongoUpdate = (0, _MongoTransform.transformUpdate)(className, update, schema);
    const mongoWhere = (0, _MongoTransform.transformWhere)(className, query, schema);
    return this._adaptiveCollection(className).then(collection => collection.updateMany(mongoWhere, mongoUpdate, transactionalSession)).catch(err => this.handleError(err));
  }

  // Atomically finds and updates an object based on query.
  // Return value not currently well specified.
  findOneAndUpdate(className, schema, query, update, transactionalSession) {
    schema = convertParseSchemaToMongoSchema(schema);
    const mongoUpdate = (0, _MongoTransform.transformUpdate)(className, update, schema);
    const mongoWhere = (0, _MongoTransform.transformWhere)(className, query, schema);
    return this._adaptiveCollection(className).then(collection => collection._mongoCollection.findOneAndUpdate(mongoWhere, mongoUpdate, {
      returnDocument: 'after',
      session: transactionalSession || undefined
    })).then(result => (0, _MongoTransform.mongoObjectToParseObject)(className, result.value, schema)).catch(error => {
      if (error.code === 11000) {
        throw new _node.default.Error(_node.default.Error.DUPLICATE_VALUE, 'A duplicate value for a field with unique values was provided');
      }
      throw error;
    }).catch(err => this.handleError(err));
  }

  // Hopefully we can get rid of this. It's only used for config and hooks.
  upsertOneObject(className, schema, query, update, transactionalSession) {
    schema = convertParseSchemaToMongoSchema(schema);
    const mongoUpdate = (0, _MongoTransform.transformUpdate)(className, update, schema);
    const mongoWhere = (0, _MongoTransform.transformWhere)(className, query, schema);
    return this._adaptiveCollection(className).then(collection => collection.upsertOne(mongoWhere, mongoUpdate, transactionalSession)).catch(err => this.handleError(err));
  }

  // Executes a find. Accepts: className, query in Parse format, and { skip, limit, sort }.
  find(className, schema, query, {
    skip,
    limit,
    sort,
    keys,
    readPreference,
    hint,
    caseInsensitive,
    explain
  }) {
    validateExplainValue(explain);
    schema = convertParseSchemaToMongoSchema(schema);
    const mongoWhere = (0, _MongoTransform.transformWhere)(className, query, schema);
    const mongoSort = _lodash.default.mapKeys(sort, (value, fieldName) => (0, _MongoTransform.transformKey)(className, fieldName, schema));
    const mongoKeys = _lodash.default.reduce(keys, (memo, key) => {
      if (key === 'ACL') {
        memo['_rperm'] = 1;
        memo['_wperm'] = 1;
      } else {
        memo[(0, _MongoTransform.transformKey)(className, key, schema)] = 1;
      }
      return memo;
    }, {});

    // If we aren't requesting the `_id` field, we need to explicitly opt out
    // of it. Doing so in parse-server is unusual, but it can allow us to
    // optimize some queries with covering indexes.
    if (keys && !mongoKeys._id) {
      mongoKeys._id = 0;
    }
    readPreference = this._parseReadPreference(readPreference);
    return this.createTextIndexesIfNeeded(className, query, schema).then(() => this._adaptiveCollection(className)).then(collection => collection.find(mongoWhere, {
      skip,
      limit,
      sort: mongoSort,
      keys: mongoKeys,
      maxTimeMS: this._maxTimeMS,
      readPreference,
      hint,
      caseInsensitive,
      explain
    })).then(objects => {
      if (explain) {
        return objects;
      }
      return objects.map(object => (0, _MongoTransform.mongoObjectToParseObject)(className, object, schema));
    }).catch(err => this.handleError(err));
  }
  ensureIndex(className, schema, fieldNames, indexName, caseInsensitive = false, options = {}) {
    schema = convertParseSchemaToMongoSchema(schema);
    const indexCreationRequest = {};
    const mongoFieldNames = fieldNames.map(fieldName => (0, _MongoTransform.transformKey)(className, fieldName, schema));
    mongoFieldNames.forEach(fieldName => {
      indexCreationRequest[fieldName] = options.indexType !== undefined ? options.indexType : 1;
    });
    const defaultOptions = {
      background: true,
      sparse: true
    };
    const indexNameOptions = indexName ? {
      name: indexName
    } : {};
    const ttlOptions = options.ttl !== undefined ? {
      expireAfterSeconds: options.ttl
    } : {};
    const caseInsensitiveOptions = caseInsensitive ? {
      collation: _MongoCollection.default.caseInsensitiveCollation()
    } : {};
    const indexOptions = _objectSpread(_objectSpread(_objectSpread(_objectSpread({}, defaultOptions), caseInsensitiveOptions), indexNameOptions), ttlOptions);
    return this._adaptiveCollection(className).then(collection => new Promise((resolve, reject) => collection._mongoCollection.createIndex(indexCreationRequest, indexOptions, error => error ? reject(error) : resolve()))).catch(err => this.handleError(err));
  }

  // Create a unique index. Unique indexes on nullable fields are not allowed. Since we don't
  // currently know which fields are nullable and which aren't, we ignore that criteria.
  // As such, we shouldn't expose this function to users of parse until we have an out-of-band
  // Way of determining if a field is nullable. Undefined doesn't count against uniqueness,
  // which is why we use sparse indexes.
  ensureUniqueness(className, schema, fieldNames) {
    schema = convertParseSchemaToMongoSchema(schema);
    const indexCreationRequest = {};
    const mongoFieldNames = fieldNames.map(fieldName => (0, _MongoTransform.transformKey)(className, fieldName, schema));
    mongoFieldNames.forEach(fieldName => {
      indexCreationRequest[fieldName] = 1;
    });
    return this._adaptiveCollection(className).then(collection => collection._ensureSparseUniqueIndexInBackground(indexCreationRequest)).catch(error => {
      if (error.code === 11000) {
        throw new _node.default.Error(_node.default.Error.DUPLICATE_VALUE, 'Tried to ensure field uniqueness for a class that already has duplicates.');
      }
      throw error;
    }).catch(err => this.handleError(err));
  }

  // Used in tests
  _rawFind(className, query) {
    return this._adaptiveCollection(className).then(collection => collection.find(query, {
      maxTimeMS: this._maxTimeMS
    })).catch(err => this.handleError(err));
  }

  // Executes a count.
  count(className, schema, query, readPreference, hint) {
    schema = convertParseSchemaToMongoSchema(schema);
    readPreference = this._parseReadPreference(readPreference);
    return this._adaptiveCollection(className).then(collection => collection.count((0, _MongoTransform.transformWhere)(className, query, schema, true), {
      maxTimeMS: this._maxTimeMS,
      readPreference,
      hint
    })).catch(err => this.handleError(err));
  }
  distinct(className, schema, query, fieldName) {
    schema = convertParseSchemaToMongoSchema(schema);
    const isPointerField = schema.fields[fieldName] && schema.fields[fieldName].type === 'Pointer';
    const transformField = (0, _MongoTransform.transformKey)(className, fieldName, schema);
    return this._adaptiveCollection(className).then(collection => collection.distinct(transformField, (0, _MongoTransform.transformWhere)(className, query, schema))).then(objects => {
      objects = objects.filter(obj => obj != null);
      return objects.map(object => {
        if (isPointerField) {
          return (0, _MongoTransform.transformPointerString)(schema, fieldName, object);
        }
        return (0, _MongoTransform.mongoObjectToParseObject)(className, object, schema);
      });
    }).catch(err => this.handleError(err));
  }
  aggregate(className, schema, pipeline, readPreference, hint, explain) {
    validateExplainValue(explain);
    let isPointerField = false;
    pipeline = pipeline.map(stage => {
      if (stage.$group) {
        stage.$group = this._parseAggregateGroupArgs(schema, stage.$group);
        if (stage.$group._id && typeof stage.$group._id === 'string' && stage.$group._id.indexOf('$_p_') >= 0) {
          isPointerField = true;
        }
      }
      if (stage.$match) {
        stage.$match = this._parseAggregateArgs(schema, stage.$match);
      }
      if (stage.$project) {
        stage.$project = this._parseAggregateProjectArgs(schema, stage.$project);
      }
      if (stage.$geoNear && stage.$geoNear.query) {
        stage.$geoNear.query = this._parseAggregateArgs(schema, stage.$geoNear.query);
      }
      return stage;
    });
    readPreference = this._parseReadPreference(readPreference);
    return this._adaptiveCollection(className).then(collection => collection.aggregate(pipeline, {
      readPreference,
      maxTimeMS: this._maxTimeMS,
      hint,
      explain
    })).then(results => {
      results.forEach(result => {
        if (Object.prototype.hasOwnProperty.call(result, '_id')) {
          if (isPointerField && result._id) {
            result._id = result._id.split('$')[1];
          }
          if (result._id == null || result._id == undefined || ['object', 'string'].includes(typeof result._id) && _lodash.default.isEmpty(result._id)) {
            result._id = null;
          }
          result.objectId = result._id;
          delete result._id;
        }
      });
      return results;
    }).then(objects => objects.map(object => (0, _MongoTransform.mongoObjectToParseObject)(className, object, schema))).catch(err => this.handleError(err));
  }

  // This function will recursively traverse the pipeline and convert any Pointer or Date columns.
  // If we detect a pointer column we will rename the column being queried for to match the column
  // in the database. We also modify the value to what we expect the value to be in the database
  // as well.
  // For dates, the driver expects a Date object, but we have a string coming in. So we'll convert
  // the string to a Date so the driver can perform the necessary comparison.
  //
  // The goal of this method is to look for the "leaves" of the pipeline and determine if it needs
  // to be converted. The pipeline can have a few different forms. For more details, see:
  //     https://docs.mongodb.com/manual/reference/operator/aggregation/
  //
  // If the pipeline is an array, it means we are probably parsing an '$and' or '$or' operator. In
  // that case we need to loop through all of it's children to find the columns being operated on.
  // If the pipeline is an object, then we'll loop through the keys checking to see if the key name
  // matches one of the schema columns. If it does match a column and the column is a Pointer or
  // a Date, then we'll convert the value as described above.
  //
  // As much as I hate recursion...this seemed like a good fit for it. We're essentially traversing
  // down a tree to find a "leaf node" and checking to see if it needs to be converted.
  _parseAggregateArgs(schema, pipeline) {
    if (pipeline === null) {
      return null;
    } else if (Array.isArray(pipeline)) {
      return pipeline.map(value => this._parseAggregateArgs(schema, value));
    } else if (typeof pipeline === 'object') {
      const returnValue = {};
      for (const field in pipeline) {
        if (schema.fields[field] && schema.fields[field].type === 'Pointer') {
          if (typeof pipeline[field] === 'object') {
            // Pass objects down to MongoDB...this is more than likely an $exists operator.
            returnValue[`_p_${field}`] = pipeline[field];
          } else {
            returnValue[`_p_${field}`] = `${schema.fields[field].targetClass}$${pipeline[field]}`;
          }
        } else if (schema.fields[field] && schema.fields[field].type === 'Date') {
          returnValue[field] = this._convertToDate(pipeline[field]);
        } else {
          returnValue[field] = this._parseAggregateArgs(schema, pipeline[field]);
        }
        if (field === 'objectId') {
          returnValue['_id'] = returnValue[field];
          delete returnValue[field];
        } else if (field === 'createdAt') {
          returnValue['_created_at'] = returnValue[field];
          delete returnValue[field];
        } else if (field === 'updatedAt') {
          returnValue['_updated_at'] = returnValue[field];
          delete returnValue[field];
        }
      }
      return returnValue;
    }
    return pipeline;
  }

  // This function is slightly different than the one above. Rather than trying to combine these
  // two functions and making the code even harder to understand, I decided to split it up. The
  // difference with this function is we are not transforming the values, only the keys of the
  // pipeline.
  _parseAggregateProjectArgs(schema, pipeline) {
    const returnValue = {};
    for (const field in pipeline) {
      if (schema.fields[field] && schema.fields[field].type === 'Pointer') {
        returnValue[`_p_${field}`] = pipeline[field];
      } else {
        returnValue[field] = this._parseAggregateArgs(schema, pipeline[field]);
      }
      if (field === 'objectId') {
        returnValue['_id'] = returnValue[field];
        delete returnValue[field];
      } else if (field === 'createdAt') {
        returnValue['_created_at'] = returnValue[field];
        delete returnValue[field];
      } else if (field === 'updatedAt') {
        returnValue['_updated_at'] = returnValue[field];
        delete returnValue[field];
      }
    }
    return returnValue;
  }

  // This function is slightly different than the two above. MongoDB $group aggregate looks like:
  //     { $group: { _id: <expression>, <field1>: { <accumulator1> : <expression1> }, ... } }
  // The <expression> could be a column name, prefixed with the '$' character. We'll look for
  // these <expression> and check to see if it is a 'Pointer' or if it's one of createdAt,
  // updatedAt or objectId and change it accordingly.
  _parseAggregateGroupArgs(schema, pipeline) {
    if (Array.isArray(pipeline)) {
      return pipeline.map(value => this._parseAggregateGroupArgs(schema, value));
    } else if (typeof pipeline === 'object') {
      const returnValue = {};
      for (const field in pipeline) {
        returnValue[field] = this._parseAggregateGroupArgs(schema, pipeline[field]);
      }
      return returnValue;
    } else if (typeof pipeline === 'string') {
      const field = pipeline.substring(1);
      if (schema.fields[field] && schema.fields[field].type === 'Pointer') {
        return `$_p_${field}`;
      } else if (field == 'createdAt') {
        return '$_created_at';
      } else if (field == 'updatedAt') {
        return '$_updated_at';
      }
    }
    return pipeline;
  }

  // This function will attempt to convert the provided value to a Date object. Since this is part
  // of an aggregation pipeline, the value can either be a string or it can be another object with
  // an operator in it (like $gt, $lt, etc). Because of this I felt it was easier to make this a
  // recursive method to traverse down to the "leaf node" which is going to be the string.
  _convertToDate(value) {
    if (value instanceof Date) {
      return value;
    }
    if (typeof value === 'string') {
      return new Date(value);
    }
    const returnValue = {};
    for (const field in value) {
      returnValue[field] = this._convertToDate(value[field]);
    }
    return returnValue;
  }
  _parseReadPreference(readPreference) {
    if (readPreference) {
      readPreference = readPreference.toUpperCase();
    }
    switch (readPreference) {
      case 'PRIMARY':
        readPreference = ReadPreference.PRIMARY;
        break;
      case 'PRIMARY_PREFERRED':
        readPreference = ReadPreference.PRIMARY_PREFERRED;
        break;
      case 'SECONDARY':
        readPreference = ReadPreference.SECONDARY;
        break;
      case 'SECONDARY_PREFERRED':
        readPreference = ReadPreference.SECONDARY_PREFERRED;
        break;
      case 'NEAREST':
        readPreference = ReadPreference.NEAREST;
        break;
      case undefined:
      case null:
      case '':
        break;
      default:
        throw new _node.default.Error(_node.default.Error.INVALID_QUERY, 'Not supported read preference.');
    }
    return readPreference;
  }
  performInitialization() {
    return Promise.resolve();
  }
  createIndex(className, index) {
    return this._adaptiveCollection(className).then(collection => collection._mongoCollection.createIndex(index)).catch(err => this.handleError(err));
  }
  createIndexes(className, indexes) {
    return this._adaptiveCollection(className).then(collection => collection._mongoCollection.createIndexes(indexes)).catch(err => this.handleError(err));
  }
  createIndexesIfNeeded(className, fieldName, type) {
    if (type && type.type === 'Polygon') {
      const index = {
        [fieldName]: '2dsphere'
      };
      return this.createIndex(className, index);
    }
    return Promise.resolve();
  }
  createTextIndexesIfNeeded(className, query, schema) {
    for (const fieldName in query) {
      if (!query[fieldName] || !query[fieldName].$text) {
        continue;
      }
      const existingIndexes = schema.indexes;
      for (const key in existingIndexes) {
        const index = existingIndexes[key];
        if (Object.prototype.hasOwnProperty.call(index, fieldName)) {
          return Promise.resolve();
        }
      }
      const indexName = `${fieldName}_text`;
      const textIndex = {
        [indexName]: {
          [fieldName]: 'text'
        }
      };
      return this.setIndexesWithSchemaFormat(className, textIndex, existingIndexes, schema.fields).catch(error => {
        if (error.code === 85) {
          // Index exist with different options
          return this.setIndexesFromMongo(className);
        }
        throw error;
      });
    }
    return Promise.resolve();
  }
  getIndexes(className) {
    return this._adaptiveCollection(className).then(collection => collection._mongoCollection.indexes()).catch(err => this.handleError(err));
  }
  dropIndex(className, index) {
    return this._adaptiveCollection(className).then(collection => collection._mongoCollection.dropIndex(index)).catch(err => this.handleError(err));
  }
  dropAllIndexes(className) {
    return this._adaptiveCollection(className).then(collection => collection._mongoCollection.dropIndexes()).catch(err => this.handleError(err));
  }
  updateSchemaWithIndexes() {
    return this.getAllClasses().then(classes => {
      const promises = classes.map(schema => {
        return this.setIndexesFromMongo(schema.className);
      });
      return Promise.all(promises);
    }).catch(err => this.handleError(err));
  }
  createTransactionalSession() {
    const transactionalSection = this.client.startSession();
    transactionalSection.startTransaction();
    return Promise.resolve(transactionalSection);
  }
  commitTransactionalSession(transactionalSection) {
    const commit = retries => {
      return transactionalSection.commitTransaction().catch(error => {
        if (error && error.hasErrorLabel('TransientTransactionError') && retries > 0) {
          return commit(retries - 1);
        }
        throw error;
      }).then(() => {
        transactionalSection.endSession();
      });
    };
    return commit(5);
  }
  abortTransactionalSession(transactionalSection) {
    return transactionalSection.abortTransaction().then(() => {
      transactionalSection.endSession();
    });
  }
}
exports.MongoStorageAdapter = MongoStorageAdapter;
var _default = MongoStorageAdapter;
exports.default = _default;
//# sourceMappingURL=data:application/json;charset=utf-8;base64,eyJ2ZXJzaW9uIjozLCJuYW1lcyI6WyJfTW9uZ29Db2xsZWN0aW9uIiwiX2ludGVyb3BSZXF1aXJlRGVmYXVsdCIsInJlcXVpcmUiLCJfTW9uZ29TY2hlbWFDb2xsZWN0aW9uIiwiX1N0b3JhZ2VBZGFwdGVyIiwiX21vbmdvZGJVcmwiLCJfTW9uZ29UcmFuc2Zvcm0iLCJfbm9kZSIsIl9sb2Rhc2giLCJfZGVmYXVsdHMiLCJfbG9nZ2VyIiwib2JqIiwiX19lc01vZHVsZSIsImRlZmF1bHQiLCJvd25LZXlzIiwib2JqZWN0IiwiZW51bWVyYWJsZU9ubHkiLCJrZXlzIiwiT2JqZWN0IiwiZ2V0T3duUHJvcGVydHlTeW1ib2xzIiwic3ltYm9scyIsImZpbHRlciIsInN5bSIsImdldE93blByb3BlcnR5RGVzY3JpcHRvciIsImVudW1lcmFibGUiLCJwdXNoIiwiYXBwbHkiLCJfb2JqZWN0U3ByZWFkIiwidGFyZ2V0IiwiaSIsImFyZ3VtZW50cyIsImxlbmd0aCIsInNvdXJjZSIsImZvckVhY2giLCJrZXkiLCJfZGVmaW5lUHJvcGVydHkiLCJnZXRPd25Qcm9wZXJ0eURlc2NyaXB0b3JzIiwiZGVmaW5lUHJvcGVydGllcyIsImRlZmluZVByb3BlcnR5IiwidmFsdWUiLCJfdG9Qcm9wZXJ0eUtleSIsImNvbmZpZ3VyYWJsZSIsIndyaXRhYmxlIiwiYXJnIiwiX3RvUHJpbWl0aXZlIiwiU3RyaW5nIiwiaW5wdXQiLCJoaW50IiwicHJpbSIsIlN5bWJvbCIsInRvUHJpbWl0aXZlIiwidW5kZWZpbmVkIiwicmVzIiwiY2FsbCIsIlR5cGVFcnJvciIsIk51bWJlciIsIl9vYmplY3RXaXRob3V0UHJvcGVydGllcyIsImV4Y2x1ZGVkIiwiX29iamVjdFdpdGhvdXRQcm9wZXJ0aWVzTG9vc2UiLCJzb3VyY2VTeW1ib2xLZXlzIiwiaW5kZXhPZiIsInByb3RvdHlwZSIsInByb3BlcnR5SXNFbnVtZXJhYmxlIiwic291cmNlS2V5cyIsIl9leHRlbmRzIiwiYXNzaWduIiwiYmluZCIsImhhc093blByb3BlcnR5IiwibW9uZ29kYiIsIk1vbmdvQ2xpZW50IiwiUmVhZFByZWZlcmVuY2UiLCJNb25nb1NjaGVtYUNvbGxlY3Rpb25OYW1lIiwic3RvcmFnZUFkYXB0ZXJBbGxDb2xsZWN0aW9ucyIsIm1vbmdvQWRhcHRlciIsImNvbm5lY3QiLCJ0aGVuIiwiZGF0YWJhc2UiLCJjb2xsZWN0aW9ucyIsImNvbGxlY3Rpb24iLCJuYW1lc3BhY2UiLCJtYXRjaCIsImNvbGxlY3Rpb25OYW1lIiwiX2NvbGxlY3Rpb25QcmVmaXgiLCJjb252ZXJ0UGFyc2VTY2hlbWFUb01vbmdvU2NoZW1hIiwiX3JlZiIsInNjaGVtYSIsImZpZWxkcyIsIl9ycGVybSIsIl93cGVybSIsImNsYXNzTmFtZSIsIl9oYXNoZWRfcGFzc3dvcmQiLCJtb25nb1NjaGVtYUZyb21GaWVsZHNBbmRDbGFzc05hbWVBbmRDTFAiLCJjbGFzc0xldmVsUGVybWlzc2lvbnMiLCJpbmRleGVzIiwibW9uZ29PYmplY3QiLCJfaWQiLCJvYmplY3RJZCIsInVwZGF0ZWRBdCIsImNyZWF0ZWRBdCIsIl9tZXRhZGF0YSIsImZpZWxkTmFtZSIsIl9maWVsZHMkZmllbGROYW1lIiwidHlwZSIsInRhcmdldENsYXNzIiwiZmllbGRPcHRpb25zIiwiTW9uZ29TY2hlbWFDb2xsZWN0aW9uIiwicGFyc2VGaWVsZFR5cGVUb01vbmdvRmllbGRUeXBlIiwiZmllbGRzX29wdGlvbnMiLCJjbGFzc19wZXJtaXNzaW9ucyIsInZhbGlkYXRlRXhwbGFpblZhbHVlIiwiZXhwbGFpbiIsImV4cGxhaW5BbGxvd2VkVmFsdWVzIiwiaW5jbHVkZXMiLCJQYXJzZSIsIkVycm9yIiwiSU5WQUxJRF9RVUVSWSIsIk1vbmdvU3RvcmFnZUFkYXB0ZXIiLCJjb25zdHJ1Y3RvciIsInVyaSIsImRlZmF1bHRzIiwiRGVmYXVsdE1vbmdvVVJJIiwiY29sbGVjdGlvblByZWZpeCIsIm1vbmdvT3B0aW9ucyIsIl91cmkiLCJfbW9uZ29PcHRpb25zIiwidXNlTmV3VXJsUGFyc2VyIiwidXNlVW5pZmllZFRvcG9sb2d5IiwiX29uY2hhbmdlIiwiX21heFRpbWVNUyIsIm1heFRpbWVNUyIsImNhblNvcnRPbkpvaW5UYWJsZXMiLCJlbmFibGVTY2hlbWFIb29rcyIsInNjaGVtYUNhY2hlVHRsIiwiZGlzYWJsZUluZGV4RmllbGRWYWxpZGF0aW9uIiwid2F0Y2giLCJjYWxsYmFjayIsImNvbm5lY3Rpb25Qcm9taXNlIiwiZW5jb2RlZFVyaSIsImZvcm1hdFVybCIsInBhcnNlVXJsIiwiY2xpZW50Iiwib3B0aW9ucyIsInMiLCJkYiIsImRiTmFtZSIsIm9uIiwiY2F0Y2giLCJlcnIiLCJQcm9taXNlIiwicmVqZWN0IiwiaGFuZGxlRXJyb3IiLCJlcnJvciIsImNvZGUiLCJsb2dnZXIiLCJoYW5kbGVTaHV0ZG93biIsImNsb3NlIiwiX2FkYXB0aXZlQ29sbGVjdGlvbiIsIm5hbWUiLCJyYXdDb2xsZWN0aW9uIiwiTW9uZ29Db2xsZWN0aW9uIiwiX3NjaGVtYUNvbGxlY3Rpb24iLCJfc3RyZWFtIiwiX21vbmdvQ29sbGVjdGlvbiIsImNsYXNzRXhpc3RzIiwibGlzdENvbGxlY3Rpb25zIiwidG9BcnJheSIsInNldENsYXNzTGV2ZWxQZXJtaXNzaW9ucyIsIkNMUHMiLCJzY2hlbWFDb2xsZWN0aW9uIiwidXBkYXRlU2NoZW1hIiwiJHNldCIsInNldEluZGV4ZXNXaXRoU2NoZW1hRm9ybWF0Iiwic3VibWl0dGVkSW5kZXhlcyIsImV4aXN0aW5nSW5kZXhlcyIsInJlc29sdmUiLCJfaWRfIiwiZGVsZXRlUHJvbWlzZXMiLCJpbnNlcnRlZEluZGV4ZXMiLCJmaWVsZCIsIl9fb3AiLCJwcm9taXNlIiwiZHJvcEluZGV4IiwicmVwbGFjZSIsImluc2VydFByb21pc2UiLCJjcmVhdGVJbmRleGVzIiwiYWxsIiwic2V0SW5kZXhlc0Zyb21Nb25nbyIsImdldEluZGV4ZXMiLCJyZWR1Y2UiLCJpbmRleCIsIl9mdHMiLCJfZnRzeCIsIndlaWdodHMiLCJjcmVhdGVDbGFzcyIsImluc2VydFNjaGVtYSIsInVwZGF0ZUZpZWxkT3B0aW9ucyIsImFkZEZpZWxkSWZOb3RFeGlzdHMiLCJjcmVhdGVJbmRleGVzSWZOZWVkZWQiLCJkZWxldGVDbGFzcyIsImRyb3AiLCJtZXNzYWdlIiwiZmluZEFuZERlbGV0ZVNjaGVtYSIsImRlbGV0ZUFsbENsYXNzZXMiLCJmYXN0IiwibWFwIiwiZGVsZXRlTWFueSIsImRlbGV0ZUZpZWxkcyIsImZpZWxkTmFtZXMiLCJtb25nb0Zvcm1hdE5hbWVzIiwiY29sbGVjdGlvblVwZGF0ZSIsIiR1bnNldCIsImNvbGxlY3Rpb25GaWx0ZXIiLCIkb3IiLCIkZXhpc3RzIiwic2NoZW1hVXBkYXRlIiwidXBkYXRlTWFueSIsImdldEFsbENsYXNzZXMiLCJzY2hlbWFzQ29sbGVjdGlvbiIsIl9mZXRjaEFsbFNjaGVtYXNGcm9tX1NDSEVNQSIsImdldENsYXNzIiwiX2ZldGNoT25lU2NoZW1hRnJvbV9TQ0hFTUEiLCJjcmVhdGVPYmplY3QiLCJ0cmFuc2FjdGlvbmFsU2Vzc2lvbiIsInBhcnNlT2JqZWN0VG9Nb25nb09iamVjdEZvckNyZWF0ZSIsImluc2VydE9uZSIsIm9wcyIsIkRVUExJQ0FURV9WQUxVRSIsInVuZGVybHlpbmdFcnJvciIsIm1hdGNoZXMiLCJBcnJheSIsImlzQXJyYXkiLCJ1c2VySW5mbyIsImR1cGxpY2F0ZWRfZmllbGQiLCJkZWxldGVPYmplY3RzQnlRdWVyeSIsInF1ZXJ5IiwibW9uZ29XaGVyZSIsInRyYW5zZm9ybVdoZXJlIiwiZGVsZXRlZENvdW50IiwiT0JKRUNUX05PVF9GT1VORCIsIklOVEVSTkFMX1NFUlZFUl9FUlJPUiIsInVwZGF0ZU9iamVjdHNCeVF1ZXJ5IiwidXBkYXRlIiwibW9uZ29VcGRhdGUiLCJ0cmFuc2Zvcm1VcGRhdGUiLCJmaW5kT25lQW5kVXBkYXRlIiwicmV0dXJuRG9jdW1lbnQiLCJzZXNzaW9uIiwicmVzdWx0IiwibW9uZ29PYmplY3RUb1BhcnNlT2JqZWN0IiwidXBzZXJ0T25lT2JqZWN0IiwidXBzZXJ0T25lIiwiZmluZCIsInNraXAiLCJsaW1pdCIsInNvcnQiLCJyZWFkUHJlZmVyZW5jZSIsImNhc2VJbnNlbnNpdGl2ZSIsIm1vbmdvU29ydCIsIl8iLCJtYXBLZXlzIiwidHJhbnNmb3JtS2V5IiwibW9uZ29LZXlzIiwibWVtbyIsIl9wYXJzZVJlYWRQcmVmZXJlbmNlIiwiY3JlYXRlVGV4dEluZGV4ZXNJZk5lZWRlZCIsIm9iamVjdHMiLCJlbnN1cmVJbmRleCIsImluZGV4TmFtZSIsImluZGV4Q3JlYXRpb25SZXF1ZXN0IiwibW9uZ29GaWVsZE5hbWVzIiwiaW5kZXhUeXBlIiwiZGVmYXVsdE9wdGlvbnMiLCJiYWNrZ3JvdW5kIiwic3BhcnNlIiwiaW5kZXhOYW1lT3B0aW9ucyIsInR0bE9wdGlvbnMiLCJ0dGwiLCJleHBpcmVBZnRlclNlY29uZHMiLCJjYXNlSW5zZW5zaXRpdmVPcHRpb25zIiwiY29sbGF0aW9uIiwiY2FzZUluc2Vuc2l0aXZlQ29sbGF0aW9uIiwiaW5kZXhPcHRpb25zIiwiY3JlYXRlSW5kZXgiLCJlbnN1cmVVbmlxdWVuZXNzIiwiX2Vuc3VyZVNwYXJzZVVuaXF1ZUluZGV4SW5CYWNrZ3JvdW5kIiwiX3Jhd0ZpbmQiLCJjb3VudCIsImRpc3RpbmN0IiwiaXNQb2ludGVyRmllbGQiLCJ0cmFuc2Zvcm1GaWVsZCIsInRyYW5zZm9ybVBvaW50ZXJTdHJpbmciLCJhZ2dyZWdhdGUiLCJwaXBlbGluZSIsInN0YWdlIiwiJGdyb3VwIiwiX3BhcnNlQWdncmVnYXRlR3JvdXBBcmdzIiwiJG1hdGNoIiwiX3BhcnNlQWdncmVnYXRlQXJncyIsIiRwcm9qZWN0IiwiX3BhcnNlQWdncmVnYXRlUHJvamVjdEFyZ3MiLCIkZ2VvTmVhciIsInJlc3VsdHMiLCJzcGxpdCIsImlzRW1wdHkiLCJyZXR1cm5WYWx1ZSIsIl9jb252ZXJ0VG9EYXRlIiwic3Vic3RyaW5nIiwiRGF0ZSIsInRvVXBwZXJDYXNlIiwiUFJJTUFSWSIsIlBSSU1BUllfUFJFRkVSUkVEIiwiU0VDT05EQVJZIiwiU0VDT05EQVJZX1BSRUZFUlJFRCIsIk5FQVJFU1QiLCJwZXJmb3JtSW5pdGlhbGl6YXRpb24iLCIkdGV4dCIsInRleHRJbmRleCIsImRyb3BBbGxJbmRleGVzIiwiZHJvcEluZGV4ZXMiLCJ1cGRhdGVTY2hlbWFXaXRoSW5kZXhlcyIsImNsYXNzZXMiLCJwcm9taXNlcyIsImNyZWF0ZVRyYW5zYWN0aW9uYWxTZXNzaW9uIiwidHJhbnNhY3Rpb25hbFNlY3Rpb24iLCJzdGFydFNlc3Npb24iLCJzdGFydFRyYW5zYWN0aW9uIiwiY29tbWl0VHJhbnNhY3Rpb25hbFNlc3Npb24iLCJjb21taXQiLCJyZXRyaWVzIiwiY29tbWl0VHJhbnNhY3Rpb24iLCJoYXNFcnJvckxhYmVsIiwiZW5kU2Vzc2lvbiIsImFib3J0VHJhbnNhY3Rpb25hbFNlc3Npb24iLCJhYm9ydFRyYW5zYWN0aW9uIiwiZXhwb3J0cyIsIl9kZWZhdWx0Il0sInNvdXJjZXMiOlsiLi4vLi4vLi4vLi4vc3JjL0FkYXB0ZXJzL1N0b3JhZ2UvTW9uZ28vTW9uZ29TdG9yYWdlQWRhcHRlci5qcyJdLCJzb3VyY2VzQ29udGVudCI6WyIvLyBAZmxvd1xuaW1wb3J0IE1vbmdvQ29sbGVjdGlvbiBmcm9tICcuL01vbmdvQ29sbGVjdGlvbic7XG5pbXBvcnQgTW9uZ29TY2hlbWFDb2xsZWN0aW9uIGZyb20gJy4vTW9uZ29TY2hlbWFDb2xsZWN0aW9uJztcbmltcG9ydCB7IFN0b3JhZ2VBZGFwdGVyIH0gZnJvbSAnLi4vU3RvcmFnZUFkYXB0ZXInO1xuaW1wb3J0IHR5cGUgeyBTY2hlbWFUeXBlLCBRdWVyeVR5cGUsIFN0b3JhZ2VDbGFzcywgUXVlcnlPcHRpb25zIH0gZnJvbSAnLi4vU3RvcmFnZUFkYXB0ZXInO1xuaW1wb3J0IHsgcGFyc2UgYXMgcGFyc2VVcmwsIGZvcm1hdCBhcyBmb3JtYXRVcmwgfSBmcm9tICcuLi8uLi8uLi92ZW5kb3IvbW9uZ29kYlVybCc7XG5pbXBvcnQge1xuICBwYXJzZU9iamVjdFRvTW9uZ29PYmplY3RGb3JDcmVhdGUsXG4gIG1vbmdvT2JqZWN0VG9QYXJzZU9iamVjdCxcbiAgdHJhbnNmb3JtS2V5LFxuICB0cmFuc2Zvcm1XaGVyZSxcbiAgdHJhbnNmb3JtVXBkYXRlLFxuICB0cmFuc2Zvcm1Qb2ludGVyU3RyaW5nLFxufSBmcm9tICcuL01vbmdvVHJhbnNmb3JtJztcbi8vIEBmbG93LWRpc2FibGUtbmV4dFxuaW1wb3J0IFBhcnNlIGZyb20gJ3BhcnNlL25vZGUnO1xuLy8gQGZsb3ctZGlzYWJsZS1uZXh0XG5pbXBvcnQgXyBmcm9tICdsb2Rhc2gnO1xuaW1wb3J0IGRlZmF1bHRzIGZyb20gJy4uLy4uLy4uL2RlZmF1bHRzJztcbmltcG9ydCBsb2dnZXIgZnJvbSAnLi4vLi4vLi4vbG9nZ2VyJztcblxuLy8gQGZsb3ctZGlzYWJsZS1uZXh0XG5jb25zdCBtb25nb2RiID0gcmVxdWlyZSgnbW9uZ29kYicpO1xuY29uc3QgTW9uZ29DbGllbnQgPSBtb25nb2RiLk1vbmdvQ2xpZW50O1xuY29uc3QgUmVhZFByZWZlcmVuY2UgPSBtb25nb2RiLlJlYWRQcmVmZXJlbmNlO1xuXG5jb25zdCBNb25nb1NjaGVtYUNvbGxlY3Rpb25OYW1lID0gJ19TQ0hFTUEnO1xuXG5jb25zdCBzdG9yYWdlQWRhcHRlckFsbENvbGxlY3Rpb25zID0gbW9uZ29BZGFwdGVyID0+IHtcbiAgcmV0dXJuIG1vbmdvQWRhcHRlclxuICAgIC5jb25uZWN0KClcbiAgICAudGhlbigoKSA9PiBtb25nb0FkYXB0ZXIuZGF0YWJhc2UuY29sbGVjdGlvbnMoKSlcbiAgICAudGhlbihjb2xsZWN0aW9ucyA9PiB7XG4gICAgICByZXR1cm4gY29sbGVjdGlvbnMuZmlsdGVyKGNvbGxlY3Rpb24gPT4ge1xuICAgICAgICBpZiAoY29sbGVjdGlvbi5uYW1lc3BhY2UubWF0Y2goL1xcLnN5c3RlbVxcLi8pKSB7XG4gICAgICAgICAgcmV0dXJuIGZhbHNlO1xuICAgICAgICB9XG4gICAgICAgIC8vIFRPRE86IElmIHlvdSBoYXZlIG9uZSBhcHAgd2l0aCBhIGNvbGxlY3Rpb24gcHJlZml4IHRoYXQgaGFwcGVucyB0byBiZSBhIHByZWZpeCBvZiBhbm90aGVyXG4gICAgICAgIC8vIGFwcHMgcHJlZml4LCB0aGlzIHdpbGwgZ28gdmVyeSB2ZXJ5IGJhZGx5LiBXZSBzaG91bGQgZml4IHRoYXQgc29tZWhvdy5cbiAgICAgICAgcmV0dXJuIGNvbGxlY3Rpb24uY29sbGVjdGlvbk5hbWUuaW5kZXhPZihtb25nb0FkYXB0ZXIuX2NvbGxlY3Rpb25QcmVmaXgpID09IDA7XG4gICAgICB9KTtcbiAgICB9KTtcbn07XG5cbmNvbnN0IGNvbnZlcnRQYXJzZVNjaGVtYVRvTW9uZ29TY2hlbWEgPSAoeyAuLi5zY2hlbWEgfSkgPT4ge1xuICBkZWxldGUgc2NoZW1hLmZpZWxkcy5fcnBlcm07XG4gIGRlbGV0ZSBzY2hlbWEuZmllbGRzLl93cGVybTtcblxuICBpZiAoc2NoZW1hLmNsYXNzTmFtZSA9PT0gJ19Vc2VyJykge1xuICAgIC8vIExlZ2FjeSBtb25nbyBhZGFwdGVyIGtub3dzIGFib3V0IHRoZSBkaWZmZXJlbmNlIGJldHdlZW4gcGFzc3dvcmQgYW5kIF9oYXNoZWRfcGFzc3dvcmQuXG4gICAgLy8gRnV0dXJlIGRhdGFiYXNlIGFkYXB0ZXJzIHdpbGwgb25seSBrbm93IGFib3V0IF9oYXNoZWRfcGFzc3dvcmQuXG4gICAgLy8gTm90ZTogUGFyc2UgU2VydmVyIHdpbGwgYnJpbmcgYmFjayBwYXNzd29yZCB3aXRoIGluamVjdERlZmF1bHRTY2hlbWEsIHNvIHdlIGRvbid0IG5lZWRcbiAgICAvLyB0byBhZGQgX2hhc2hlZF9wYXNzd29yZCBiYWNrIGV2ZXIuXG4gICAgZGVsZXRlIHNjaGVtYS5maWVsZHMuX2hhc2hlZF9wYXNzd29yZDtcbiAgfVxuXG4gIHJldHVybiBzY2hlbWE7XG59O1xuXG4vLyBSZXR1cm5zIHsgY29kZSwgZXJyb3IgfSBpZiBpbnZhbGlkLCBvciB7IHJlc3VsdCB9LCBhbiBvYmplY3Rcbi8vIHN1aXRhYmxlIGZvciBpbnNlcnRpbmcgaW50byBfU0NIRU1BIGNvbGxlY3Rpb24sIG90aGVyd2lzZS5cbmNvbnN0IG1vbmdvU2NoZW1hRnJvbUZpZWxkc0FuZENsYXNzTmFtZUFuZENMUCA9IChcbiAgZmllbGRzLFxuICBjbGFzc05hbWUsXG4gIGNsYXNzTGV2ZWxQZXJtaXNzaW9ucyxcbiAgaW5kZXhlc1xuKSA9PiB7XG4gIGNvbnN0IG1vbmdvT2JqZWN0ID0ge1xuICAgIF9pZDogY2xhc3NOYW1lLFxuICAgIG9iamVjdElkOiAnc3RyaW5nJyxcbiAgICB1cGRhdGVkQXQ6ICdzdHJpbmcnLFxuICAgIGNyZWF0ZWRBdDogJ3N0cmluZycsXG4gICAgX21ldGFkYXRhOiB1bmRlZmluZWQsXG4gIH07XG5cbiAgZm9yIChjb25zdCBmaWVsZE5hbWUgaW4gZmllbGRzKSB7XG4gICAgY29uc3QgeyB0eXBlLCB0YXJnZXRDbGFzcywgLi4uZmllbGRPcHRpb25zIH0gPSBmaWVsZHNbZmllbGROYW1lXTtcbiAgICBtb25nb09iamVjdFtmaWVsZE5hbWVdID0gTW9uZ29TY2hlbWFDb2xsZWN0aW9uLnBhcnNlRmllbGRUeXBlVG9Nb25nb0ZpZWxkVHlwZSh7XG4gICAgICB0eXBlLFxuICAgICAgdGFyZ2V0Q2xhc3MsXG4gICAgfSk7XG4gICAgaWYgKGZpZWxkT3B0aW9ucyAmJiBPYmplY3Qua2V5cyhmaWVsZE9wdGlvbnMpLmxlbmd0aCA+IDApIHtcbiAgICAgIG1vbmdvT2JqZWN0Ll9tZXRhZGF0YSA9IG1vbmdvT2JqZWN0Ll9tZXRhZGF0YSB8fCB7fTtcbiAgICAgIG1vbmdvT2JqZWN0Ll9tZXRhZGF0YS5maWVsZHNfb3B0aW9ucyA9IG1vbmdvT2JqZWN0Ll9tZXRhZGF0YS5maWVsZHNfb3B0aW9ucyB8fCB7fTtcbiAgICAgIG1vbmdvT2JqZWN0Ll9tZXRhZGF0YS5maWVsZHNfb3B0aW9uc1tmaWVsZE5hbWVdID0gZmllbGRPcHRpb25zO1xuICAgIH1cbiAgfVxuXG4gIGlmICh0eXBlb2YgY2xhc3NMZXZlbFBlcm1pc3Npb25zICE9PSAndW5kZWZpbmVkJykge1xuICAgIG1vbmdvT2JqZWN0Ll9tZXRhZGF0YSA9IG1vbmdvT2JqZWN0Ll9tZXRhZGF0YSB8fCB7fTtcbiAgICBpZiAoIWNsYXNzTGV2ZWxQZXJtaXNzaW9ucykge1xuICAgICAgZGVsZXRlIG1vbmdvT2JqZWN0Ll9tZXRhZGF0YS5jbGFzc19wZXJtaXNzaW9ucztcbiAgICB9IGVsc2Uge1xuICAgICAgbW9uZ29PYmplY3QuX21ldGFkYXRhLmNsYXNzX3Blcm1pc3Npb25zID0gY2xhc3NMZXZlbFBlcm1pc3Npb25zO1xuICAgIH1cbiAgfVxuXG4gIGlmIChpbmRleGVzICYmIHR5cGVvZiBpbmRleGVzID09PSAnb2JqZWN0JyAmJiBPYmplY3Qua2V5cyhpbmRleGVzKS5sZW5ndGggPiAwKSB7XG4gICAgbW9uZ29PYmplY3QuX21ldGFkYXRhID0gbW9uZ29PYmplY3QuX21ldGFkYXRhIHx8IHt9O1xuICAgIG1vbmdvT2JqZWN0Ll9tZXRhZGF0YS5pbmRleGVzID0gaW5kZXhlcztcbiAgfVxuXG4gIGlmICghbW9uZ29PYmplY3QuX21ldGFkYXRhKSB7XG4gICAgLy8gY2xlYW51cCB0aGUgdW51c2VkIF9tZXRhZGF0YVxuICAgIGRlbGV0ZSBtb25nb09iamVjdC5fbWV0YWRhdGE7XG4gIH1cblxuICByZXR1cm4gbW9uZ29PYmplY3Q7XG59O1xuXG5mdW5jdGlvbiB2YWxpZGF0ZUV4cGxhaW5WYWx1ZShleHBsYWluKSB7XG4gIGlmIChleHBsYWluKSB7XG4gICAgLy8gVGhlIGxpc3Qgb2YgYWxsb3dlZCBleHBsYWluIHZhbHVlcyBpcyBmcm9tIG5vZGUtbW9uZ29kYi1uYXRpdmUvbGliL2V4cGxhaW4uanNcbiAgICBjb25zdCBleHBsYWluQWxsb3dlZFZhbHVlcyA9IFtcbiAgICAgICdxdWVyeVBsYW5uZXInLFxuICAgICAgJ3F1ZXJ5UGxhbm5lckV4dGVuZGVkJyxcbiAgICAgICdleGVjdXRpb25TdGF0cycsXG4gICAgICAnYWxsUGxhbnNFeGVjdXRpb24nLFxuICAgICAgZmFsc2UsXG4gICAgICB0cnVlLFxuICAgIF07XG4gICAgaWYgKCFleHBsYWluQWxsb3dlZFZhbHVlcy5pbmNsdWRlcyhleHBsYWluKSkge1xuICAgICAgdGhyb3cgbmV3IFBhcnNlLkVycm9yKFBhcnNlLkVycm9yLklOVkFMSURfUVVFUlksICdJbnZhbGlkIHZhbHVlIGZvciBleHBsYWluJyk7XG4gICAgfVxuICB9XG59XG5cbmV4cG9ydCBjbGFzcyBNb25nb1N0b3JhZ2VBZGFwdGVyIGltcGxlbWVudHMgU3RvcmFnZUFkYXB0ZXIge1xuICAvLyBQcml2YXRlXG4gIF91cmk6IHN0cmluZztcbiAgX2NvbGxlY3Rpb25QcmVmaXg6IHN0cmluZztcbiAgX21vbmdvT3B0aW9uczogT2JqZWN0O1xuICBfb25jaGFuZ2U6IGFueTtcbiAgX3N0cmVhbTogYW55O1xuICAvLyBQdWJsaWNcbiAgY29ubmVjdGlvblByb21pc2U6ID9Qcm9taXNlPGFueT47XG4gIGRhdGFiYXNlOiBhbnk7XG4gIGNsaWVudDogTW9uZ29DbGllbnQ7XG4gIF9tYXhUaW1lTVM6ID9udW1iZXI7XG4gIGNhblNvcnRPbkpvaW5UYWJsZXM6IGJvb2xlYW47XG4gIGVuYWJsZVNjaGVtYUhvb2tzOiBib29sZWFuO1xuICBzY2hlbWFDYWNoZVR0bDogP251bWJlcjtcbiAgZGlzYWJsZUluZGV4RmllbGRWYWxpZGF0aW9uOiBib29sZWFuO1xuXG4gIGNvbnN0cnVjdG9yKHsgdXJpID0gZGVmYXVsdHMuRGVmYXVsdE1vbmdvVVJJLCBjb2xsZWN0aW9uUHJlZml4ID0gJycsIG1vbmdvT3B0aW9ucyA9IHt9IH06IGFueSkge1xuICAgIHRoaXMuX3VyaSA9IHVyaTtcbiAgICB0aGlzLl9jb2xsZWN0aW9uUHJlZml4ID0gY29sbGVjdGlvblByZWZpeDtcbiAgICB0aGlzLl9tb25nb09wdGlvbnMgPSB7IC4uLm1vbmdvT3B0aW9ucyB9O1xuICAgIHRoaXMuX21vbmdvT3B0aW9ucy51c2VOZXdVcmxQYXJzZXIgPSB0cnVlO1xuICAgIHRoaXMuX21vbmdvT3B0aW9ucy51c2VVbmlmaWVkVG9wb2xvZ3kgPSB0cnVlO1xuICAgIHRoaXMuX29uY2hhbmdlID0gKCkgPT4ge307XG5cbiAgICAvLyBNYXhUaW1lTVMgaXMgbm90IGEgZ2xvYmFsIE1vbmdvREIgY2xpZW50IG9wdGlvbiwgaXQgaXMgYXBwbGllZCBwZXIgb3BlcmF0aW9uLlxuICAgIHRoaXMuX21heFRpbWVNUyA9IG1vbmdvT3B0aW9ucy5tYXhUaW1lTVM7XG4gICAgdGhpcy5jYW5Tb3J0T25Kb2luVGFibGVzID0gdHJ1ZTtcbiAgICB0aGlzLmVuYWJsZVNjaGVtYUhvb2tzID0gISFtb25nb09wdGlvbnMuZW5hYmxlU2NoZW1hSG9va3M7XG4gICAgdGhpcy5zY2hlbWFDYWNoZVR0bCA9IG1vbmdvT3B0aW9ucy5zY2hlbWFDYWNoZVR0bDtcbiAgICB0aGlzLmRpc2FibGVJbmRleEZpZWxkVmFsaWRhdGlvbiA9ICEhbW9uZ29PcHRpb25zLmRpc2FibGVJbmRleEZpZWxkVmFsaWRhdGlvbjtcbiAgICBmb3IgKGNvbnN0IGtleSBvZiBbXG4gICAgICAnZW5hYmxlU2NoZW1hSG9va3MnLFxuICAgICAgJ3NjaGVtYUNhY2hlVHRsJyxcbiAgICAgICdtYXhUaW1lTVMnLFxuICAgICAgJ2Rpc2FibGVJbmRleEZpZWxkVmFsaWRhdGlvbicsXG4gICAgXSkge1xuICAgICAgZGVsZXRlIHRoaXMuX21vbmdvT3B0aW9uc1trZXldO1xuICAgIH1cbiAgfVxuXG4gIHdhdGNoKGNhbGxiYWNrOiAoKSA9PiB2b2lkKTogdm9pZCB7XG4gICAgdGhpcy5fb25jaGFuZ2UgPSBjYWxsYmFjaztcbiAgfVxuXG4gIGNvbm5lY3QoKSB7XG4gICAgaWYgKHRoaXMuY29ubmVjdGlvblByb21pc2UpIHtcbiAgICAgIHJldHVybiB0aGlzLmNvbm5lY3Rpb25Qcm9taXNlO1xuICAgIH1cblxuICAgIC8vIHBhcnNpbmcgYW5kIHJlLWZvcm1hdHRpbmcgY2F1c2VzIHRoZSBhdXRoIHZhbHVlIChpZiB0aGVyZSkgdG8gZ2V0IFVSSVxuICAgIC8vIGVuY29kZWRcbiAgICBjb25zdCBlbmNvZGVkVXJpID0gZm9ybWF0VXJsKHBhcnNlVXJsKHRoaXMuX3VyaSkpO1xuXG4gICAgdGhpcy5jb25uZWN0aW9uUHJvbWlzZSA9IE1vbmdvQ2xpZW50LmNvbm5lY3QoZW5jb2RlZFVyaSwgdGhpcy5fbW9uZ29PcHRpb25zKVxuICAgICAgLnRoZW4oY2xpZW50ID0+IHtcbiAgICAgICAgLy8gU3RhcnRpbmcgbW9uZ29EQiAzLjAsIHRoZSBNb25nb0NsaWVudC5jb25uZWN0IGRvbid0IHJldHVybiBhIERCIGFueW1vcmUgYnV0IGEgY2xpZW50XG4gICAgICAgIC8vIEZvcnR1bmF0ZWx5LCB3ZSBjYW4gZ2V0IGJhY2sgdGhlIG9wdGlvbnMgYW5kIHVzZSB0aGVtIHRvIHNlbGVjdCB0aGUgcHJvcGVyIERCLlxuICAgICAgICAvLyBodHRwczovL2dpdGh1Yi5jb20vbW9uZ29kYi9ub2RlLW1vbmdvZGItbmF0aXZlL2Jsb2IvMmMzNWQ3NmYwODU3NDIyNWI4ZGIwMmQ3YmVmNjg3MTIzZTZiYjAxOC9saWIvbW9uZ29fY2xpZW50LmpzI0w4ODVcbiAgICAgICAgY29uc3Qgb3B0aW9ucyA9IGNsaWVudC5zLm9wdGlvbnM7XG4gICAgICAgIGNvbnN0IGRhdGFiYXNlID0gY2xpZW50LmRiKG9wdGlvbnMuZGJOYW1lKTtcbiAgICAgICAgaWYgKCFkYXRhYmFzZSkge1xuICAgICAgICAgIGRlbGV0ZSB0aGlzLmNvbm5lY3Rpb25Qcm9taXNlO1xuICAgICAgICAgIHJldHVybjtcbiAgICAgICAgfVxuICAgICAgICBjbGllbnQub24oJ2Vycm9yJywgKCkgPT4ge1xuICAgICAgICAgIGRlbGV0ZSB0aGlzLmNvbm5lY3Rpb25Qcm9taXNlO1xuICAgICAgICB9KTtcbiAgICAgICAgY2xpZW50Lm9uKCdjbG9zZScsICgpID0+IHtcbiAgICAgICAgICBkZWxldGUgdGhpcy5jb25uZWN0aW9uUHJvbWlzZTtcbiAgICAgICAgfSk7XG4gICAgICAgIHRoaXMuY2xpZW50ID0gY2xpZW50O1xuICAgICAgICB0aGlzLmRhdGFiYXNlID0gZGF0YWJhc2U7XG4gICAgICB9KVxuICAgICAgLmNhdGNoKGVyciA9PiB7XG4gICAgICAgIGRlbGV0ZSB0aGlzLmNvbm5lY3Rpb25Qcm9taXNlO1xuICAgICAgICByZXR1cm4gUHJvbWlzZS5yZWplY3QoZXJyKTtcbiAgICAgIH0pO1xuXG4gICAgcmV0dXJuIHRoaXMuY29ubmVjdGlvblByb21pc2U7XG4gIH1cblxuICBoYW5kbGVFcnJvcjxUPihlcnJvcjogPyhFcnJvciB8IFBhcnNlLkVycm9yKSk6IFByb21pc2U8VD4ge1xuICAgIGlmIChlcnJvciAmJiBlcnJvci5jb2RlID09PSAxMykge1xuICAgICAgLy8gVW5hdXRob3JpemVkIGVycm9yXG4gICAgICBkZWxldGUgdGhpcy5jbGllbnQ7XG4gICAgICBkZWxldGUgdGhpcy5kYXRhYmFzZTtcbiAgICAgIGRlbGV0ZSB0aGlzLmNvbm5lY3Rpb25Qcm9taXNlO1xuICAgICAgbG9nZ2VyLmVycm9yKCdSZWNlaXZlZCB1bmF1dGhvcml6ZWQgZXJyb3InLCB7IGVycm9yOiBlcnJvciB9KTtcbiAgICB9XG4gICAgdGhyb3cgZXJyb3I7XG4gIH1cblxuICBhc3luYyBoYW5kbGVTaHV0ZG93bigpIHtcbiAgICBpZiAoIXRoaXMuY2xpZW50KSB7XG4gICAgICByZXR1cm47XG4gICAgfVxuICAgIGF3YWl0IHRoaXMuY2xpZW50LmNsb3NlKGZhbHNlKTtcbiAgICBkZWxldGUgdGhpcy5jb25uZWN0aW9uUHJvbWlzZTtcbiAgfVxuXG4gIF9hZGFwdGl2ZUNvbGxlY3Rpb24obmFtZTogc3RyaW5nKSB7XG4gICAgcmV0dXJuIHRoaXMuY29ubmVjdCgpXG4gICAgICAudGhlbigoKSA9PiB0aGlzLmRhdGFiYXNlLmNvbGxlY3Rpb24odGhpcy5fY29sbGVjdGlvblByZWZpeCArIG5hbWUpKVxuICAgICAgLnRoZW4ocmF3Q29sbGVjdGlvbiA9PiBuZXcgTW9uZ29Db2xsZWN0aW9uKHJhd0NvbGxlY3Rpb24pKVxuICAgICAgLmNhdGNoKGVyciA9PiB0aGlzLmhhbmRsZUVycm9yKGVycikpO1xuICB9XG5cbiAgX3NjaGVtYUNvbGxlY3Rpb24oKTogUHJvbWlzZTxNb25nb1NjaGVtYUNvbGxlY3Rpb24+IHtcbiAgICByZXR1cm4gdGhpcy5jb25uZWN0KClcbiAgICAgIC50aGVuKCgpID0+IHRoaXMuX2FkYXB0aXZlQ29sbGVjdGlvbihNb25nb1NjaGVtYUNvbGxlY3Rpb25OYW1lKSlcbiAgICAgIC50aGVuKGNvbGxlY3Rpb24gPT4ge1xuICAgICAgICBpZiAoIXRoaXMuX3N0cmVhbSAmJiB0aGlzLmVuYWJsZVNjaGVtYUhvb2tzKSB7XG4gICAgICAgICAgdGhpcy5fc3RyZWFtID0gY29sbGVjdGlvbi5fbW9uZ29Db2xsZWN0aW9uLndhdGNoKCk7XG4gICAgICAgICAgdGhpcy5fc3RyZWFtLm9uKCdjaGFuZ2UnLCAoKSA9PiB0aGlzLl9vbmNoYW5nZSgpKTtcbiAgICAgICAgfVxuICAgICAgICByZXR1cm4gbmV3IE1vbmdvU2NoZW1hQ29sbGVjdGlvbihjb2xsZWN0aW9uKTtcbiAgICAgIH0pO1xuICB9XG5cbiAgY2xhc3NFeGlzdHMobmFtZTogc3RyaW5nKSB7XG4gICAgcmV0dXJuIHRoaXMuY29ubmVjdCgpXG4gICAgICAudGhlbigoKSA9PiB7XG4gICAgICAgIHJldHVybiB0aGlzLmRhdGFiYXNlLmxpc3RDb2xsZWN0aW9ucyh7IG5hbWU6IHRoaXMuX2NvbGxlY3Rpb25QcmVmaXggKyBuYW1lIH0pLnRvQXJyYXkoKTtcbiAgICAgIH0pXG4gICAgICAudGhlbihjb2xsZWN0aW9ucyA9PiB7XG4gICAgICAgIHJldHVybiBjb2xsZWN0aW9ucy5sZW5ndGggPiAwO1xuICAgICAgfSlcbiAgICAgIC5jYXRjaChlcnIgPT4gdGhpcy5oYW5kbGVFcnJvcihlcnIpKTtcbiAgfVxuXG4gIHNldENsYXNzTGV2ZWxQZXJtaXNzaW9ucyhjbGFzc05hbWU6IHN0cmluZywgQ0xQczogYW55KTogUHJvbWlzZTx2b2lkPiB7XG4gICAgcmV0dXJuIHRoaXMuX3NjaGVtYUNvbGxlY3Rpb24oKVxuICAgICAgLnRoZW4oc2NoZW1hQ29sbGVjdGlvbiA9PlxuICAgICAgICBzY2hlbWFDb2xsZWN0aW9uLnVwZGF0ZVNjaGVtYShjbGFzc05hbWUsIHtcbiAgICAgICAgICAkc2V0OiB7ICdfbWV0YWRhdGEuY2xhc3NfcGVybWlzc2lvbnMnOiBDTFBzIH0sXG4gICAgICAgIH0pXG4gICAgICApXG4gICAgICAuY2F0Y2goZXJyID0+IHRoaXMuaGFuZGxlRXJyb3IoZXJyKSk7XG4gIH1cblxuICBzZXRJbmRleGVzV2l0aFNjaGVtYUZvcm1hdChcbiAgICBjbGFzc05hbWU6IHN0cmluZyxcbiAgICBzdWJtaXR0ZWRJbmRleGVzOiBhbnksXG4gICAgZXhpc3RpbmdJbmRleGVzOiBhbnkgPSB7fSxcbiAgICBmaWVsZHM6IGFueVxuICApOiBQcm9taXNlPHZvaWQ+IHtcbiAgICBpZiAoc3VibWl0dGVkSW5kZXhlcyA9PT0gdW5kZWZpbmVkKSB7XG4gICAgICByZXR1cm4gUHJvbWlzZS5yZXNvbHZlKCk7XG4gICAgfVxuICAgIGlmIChPYmplY3Qua2V5cyhleGlzdGluZ0luZGV4ZXMpLmxlbmd0aCA9PT0gMCkge1xuICAgICAgZXhpc3RpbmdJbmRleGVzID0geyBfaWRfOiB7IF9pZDogMSB9IH07XG4gICAgfVxuICAgIGNvbnN0IGRlbGV0ZVByb21pc2VzID0gW107XG4gICAgY29uc3QgaW5zZXJ0ZWRJbmRleGVzID0gW107XG4gICAgT2JqZWN0LmtleXMoc3VibWl0dGVkSW5kZXhlcykuZm9yRWFjaChuYW1lID0+IHtcbiAgICAgIGNvbnN0IGZpZWxkID0gc3VibWl0dGVkSW5kZXhlc1tuYW1lXTtcbiAgICAgIGlmIChleGlzdGluZ0luZGV4ZXNbbmFtZV0gJiYgZmllbGQuX19vcCAhPT0gJ0RlbGV0ZScpIHtcbiAgICAgICAgdGhyb3cgbmV3IFBhcnNlLkVycm9yKFBhcnNlLkVycm9yLklOVkFMSURfUVVFUlksIGBJbmRleCAke25hbWV9IGV4aXN0cywgY2Fubm90IHVwZGF0ZS5gKTtcbiAgICAgIH1cbiAgICAgIGlmICghZXhpc3RpbmdJbmRleGVzW25hbWVdICYmIGZpZWxkLl9fb3AgPT09ICdEZWxldGUnKSB7XG4gICAgICAgIHRocm93IG5ldyBQYXJzZS5FcnJvcihcbiAgICAgICAgICBQYXJzZS5FcnJvci5JTlZBTElEX1FVRVJZLFxuICAgICAgICAgIGBJbmRleCAke25hbWV9IGRvZXMgbm90IGV4aXN0LCBjYW5ub3QgZGVsZXRlLmBcbiAgICAgICAgKTtcbiAgICAgIH1cbiAgICAgIGlmIChmaWVsZC5fX29wID09PSAnRGVsZXRlJykge1xuICAgICAgICBjb25zdCBwcm9taXNlID0gdGhpcy5kcm9wSW5kZXgoY2xhc3NOYW1lLCBuYW1lKTtcbiAgICAgICAgZGVsZXRlUHJvbWlzZXMucHVzaChwcm9taXNlKTtcbiAgICAgICAgZGVsZXRlIGV4aXN0aW5nSW5kZXhlc1tuYW1lXTtcbiAgICAgIH0gZWxzZSB7XG4gICAgICAgIE9iamVjdC5rZXlzKGZpZWxkKS5mb3JFYWNoKGtleSA9PiB7XG4gICAgICAgICAgaWYgKFxuICAgICAgICAgICAgIXRoaXMuZGlzYWJsZUluZGV4RmllbGRWYWxpZGF0aW9uICYmXG4gICAgICAgICAgICAhT2JqZWN0LnByb3RvdHlwZS5oYXNPd25Qcm9wZXJ0eS5jYWxsKFxuICAgICAgICAgICAgICBmaWVsZHMsXG4gICAgICAgICAgICAgIGtleS5pbmRleE9mKCdfcF8nKSA9PT0gMCA/IGtleS5yZXBsYWNlKCdfcF8nLCAnJykgOiBrZXlcbiAgICAgICAgICAgIClcbiAgICAgICAgICApIHtcbiAgICAgICAgICAgIHRocm93IG5ldyBQYXJzZS5FcnJvcihcbiAgICAgICAgICAgICAgUGFyc2UuRXJyb3IuSU5WQUxJRF9RVUVSWSxcbiAgICAgICAgICAgICAgYEZpZWxkICR7a2V5fSBkb2VzIG5vdCBleGlzdCwgY2Fubm90IGFkZCBpbmRleC5gXG4gICAgICAgICAgICApO1xuICAgICAgICAgIH1cbiAgICAgICAgfSk7XG4gICAgICAgIGV4aXN0aW5nSW5kZXhlc1tuYW1lXSA9IGZpZWxkO1xuICAgICAgICBpbnNlcnRlZEluZGV4ZXMucHVzaCh7XG4gICAgICAgICAga2V5OiBmaWVsZCxcbiAgICAgICAgICBuYW1lLFxuICAgICAgICB9KTtcbiAgICAgIH1cbiAgICB9KTtcbiAgICBsZXQgaW5zZXJ0UHJvbWlzZSA9IFByb21pc2UucmVzb2x2ZSgpO1xuICAgIGlmIChpbnNlcnRlZEluZGV4ZXMubGVuZ3RoID4gMCkge1xuICAgICAgaW5zZXJ0UHJvbWlzZSA9IHRoaXMuY3JlYXRlSW5kZXhlcyhjbGFzc05hbWUsIGluc2VydGVkSW5kZXhlcyk7XG4gICAgfVxuICAgIHJldHVybiBQcm9taXNlLmFsbChkZWxldGVQcm9taXNlcylcbiAgICAgIC50aGVuKCgpID0+IGluc2VydFByb21pc2UpXG4gICAgICAudGhlbigoKSA9PiB0aGlzLl9zY2hlbWFDb2xsZWN0aW9uKCkpXG4gICAgICAudGhlbihzY2hlbWFDb2xsZWN0aW9uID0+XG4gICAgICAgIHNjaGVtYUNvbGxlY3Rpb24udXBkYXRlU2NoZW1hKGNsYXNzTmFtZSwge1xuICAgICAgICAgICRzZXQ6IHsgJ19tZXRhZGF0YS5pbmRleGVzJzogZXhpc3RpbmdJbmRleGVzIH0sXG4gICAgICAgIH0pXG4gICAgICApXG4gICAgICAuY2F0Y2goZXJyID0+IHRoaXMuaGFuZGxlRXJyb3IoZXJyKSk7XG4gIH1cblxuICBzZXRJbmRleGVzRnJvbU1vbmdvKGNsYXNzTmFtZTogc3RyaW5nKSB7XG4gICAgcmV0dXJuIHRoaXMuZ2V0SW5kZXhlcyhjbGFzc05hbWUpXG4gICAgICAudGhlbihpbmRleGVzID0+IHtcbiAgICAgICAgaW5kZXhlcyA9IGluZGV4ZXMucmVkdWNlKChvYmosIGluZGV4KSA9PiB7XG4gICAgICAgICAgaWYgKGluZGV4LmtleS5fZnRzKSB7XG4gICAgICAgICAgICBkZWxldGUgaW5kZXgua2V5Ll9mdHM7XG4gICAgICAgICAgICBkZWxldGUgaW5kZXgua2V5Ll9mdHN4O1xuICAgICAgICAgICAgZm9yIChjb25zdCBmaWVsZCBpbiBpbmRleC53ZWlnaHRzKSB7XG4gICAgICAgICAgICAgIGluZGV4LmtleVtmaWVsZF0gPSAndGV4dCc7XG4gICAgICAgICAgICB9XG4gICAgICAgICAgfVxuICAgICAgICAgIG9ialtpbmRleC5uYW1lXSA9IGluZGV4LmtleTtcbiAgICAgICAgICByZXR1cm4gb2JqO1xuICAgICAgICB9LCB7fSk7XG4gICAgICAgIHJldHVybiB0aGlzLl9zY2hlbWFDb2xsZWN0aW9uKCkudGhlbihzY2hlbWFDb2xsZWN0aW9uID0+XG4gICAgICAgICAgc2NoZW1hQ29sbGVjdGlvbi51cGRhdGVTY2hlbWEoY2xhc3NOYW1lLCB7XG4gICAgICAgICAgICAkc2V0OiB7ICdfbWV0YWRhdGEuaW5kZXhlcyc6IGluZGV4ZXMgfSxcbiAgICAgICAgICB9KVxuICAgICAgICApO1xuICAgICAgfSlcbiAgICAgIC5jYXRjaChlcnIgPT4gdGhpcy5oYW5kbGVFcnJvcihlcnIpKVxuICAgICAgLmNhdGNoKCgpID0+IHtcbiAgICAgICAgLy8gSWdub3JlIGlmIGNvbGxlY3Rpb24gbm90IGZvdW5kXG4gICAgICAgIHJldHVybiBQcm9taXNlLnJlc29sdmUoKTtcbiAgICAgIH0pO1xuICB9XG5cbiAgY3JlYXRlQ2xhc3MoY2xhc3NOYW1lOiBzdHJpbmcsIHNjaGVtYTogU2NoZW1hVHlwZSk6IFByb21pc2U8dm9pZD4ge1xuICAgIHNjaGVtYSA9IGNvbnZlcnRQYXJzZVNjaGVtYVRvTW9uZ29TY2hlbWEoc2NoZW1hKTtcbiAgICBjb25zdCBtb25nb09iamVjdCA9IG1vbmdvU2NoZW1hRnJvbUZpZWxkc0FuZENsYXNzTmFtZUFuZENMUChcbiAgICAgIHNjaGVtYS5maWVsZHMsXG4gICAgICBjbGFzc05hbWUsXG4gICAgICBzY2hlbWEuY2xhc3NMZXZlbFBlcm1pc3Npb25zLFxuICAgICAgc2NoZW1hLmluZGV4ZXNcbiAgICApO1xuICAgIG1vbmdvT2JqZWN0Ll9pZCA9IGNsYXNzTmFtZTtcbiAgICByZXR1cm4gdGhpcy5zZXRJbmRleGVzV2l0aFNjaGVtYUZvcm1hdChjbGFzc05hbWUsIHNjaGVtYS5pbmRleGVzLCB7fSwgc2NoZW1hLmZpZWxkcylcbiAgICAgIC50aGVuKCgpID0+IHRoaXMuX3NjaGVtYUNvbGxlY3Rpb24oKSlcbiAgICAgIC50aGVuKHNjaGVtYUNvbGxlY3Rpb24gPT4gc2NoZW1hQ29sbGVjdGlvbi5pbnNlcnRTY2hlbWEobW9uZ29PYmplY3QpKVxuICAgICAgLmNhdGNoKGVyciA9PiB0aGlzLmhhbmRsZUVycm9yKGVycikpO1xuICB9XG5cbiAgYXN5bmMgdXBkYXRlRmllbGRPcHRpb25zKGNsYXNzTmFtZTogc3RyaW5nLCBmaWVsZE5hbWU6IHN0cmluZywgdHlwZTogYW55KSB7XG4gICAgY29uc3Qgc2NoZW1hQ29sbGVjdGlvbiA9IGF3YWl0IHRoaXMuX3NjaGVtYUNvbGxlY3Rpb24oKTtcbiAgICBhd2FpdCBzY2hlbWFDb2xsZWN0aW9uLnVwZGF0ZUZpZWxkT3B0aW9ucyhjbGFzc05hbWUsIGZpZWxkTmFtZSwgdHlwZSk7XG4gIH1cblxuICBhZGRGaWVsZElmTm90RXhpc3RzKGNsYXNzTmFtZTogc3RyaW5nLCBmaWVsZE5hbWU6IHN0cmluZywgdHlwZTogYW55KTogUHJvbWlzZTx2b2lkPiB7XG4gICAgcmV0dXJuIHRoaXMuX3NjaGVtYUNvbGxlY3Rpb24oKVxuICAgICAgLnRoZW4oc2NoZW1hQ29sbGVjdGlvbiA9PiBzY2hlbWFDb2xsZWN0aW9uLmFkZEZpZWxkSWZOb3RFeGlzdHMoY2xhc3NOYW1lLCBmaWVsZE5hbWUsIHR5cGUpKVxuICAgICAgLnRoZW4oKCkgPT4gdGhpcy5jcmVhdGVJbmRleGVzSWZOZWVkZWQoY2xhc3NOYW1lLCBmaWVsZE5hbWUsIHR5cGUpKVxuICAgICAgLmNhdGNoKGVyciA9PiB0aGlzLmhhbmRsZUVycm9yKGVycikpO1xuICB9XG5cbiAgLy8gRHJvcHMgYSBjb2xsZWN0aW9uLiBSZXNvbHZlcyB3aXRoIHRydWUgaWYgaXQgd2FzIGEgUGFyc2UgU2NoZW1hIChlZy4gX1VzZXIsIEN1c3RvbSwgZXRjLilcbiAgLy8gYW5kIHJlc29sdmVzIHdpdGggZmFsc2UgaWYgaXQgd2Fzbid0IChlZy4gYSBqb2luIHRhYmxlKS4gUmVqZWN0cyBpZiBkZWxldGlvbiB3YXMgaW1wb3NzaWJsZS5cbiAgZGVsZXRlQ2xhc3MoY2xhc3NOYW1lOiBzdHJpbmcpIHtcbiAgICByZXR1cm4gKFxuICAgICAgdGhpcy5fYWRhcHRpdmVDb2xsZWN0aW9uKGNsYXNzTmFtZSlcbiAgICAgICAgLnRoZW4oY29sbGVjdGlvbiA9PiBjb2xsZWN0aW9uLmRyb3AoKSlcbiAgICAgICAgLmNhdGNoKGVycm9yID0+IHtcbiAgICAgICAgICAvLyAnbnMgbm90IGZvdW5kJyBtZWFucyBjb2xsZWN0aW9uIHdhcyBhbHJlYWR5IGdvbmUuIElnbm9yZSBkZWxldGlvbiBhdHRlbXB0LlxuICAgICAgICAgIGlmIChlcnJvci5tZXNzYWdlID09ICducyBub3QgZm91bmQnKSB7XG4gICAgICAgICAgICByZXR1cm47XG4gICAgICAgICAgfVxuICAgICAgICAgIHRocm93IGVycm9yO1xuICAgICAgICB9KVxuICAgICAgICAvLyBXZSd2ZSBkcm9wcGVkIHRoZSBjb2xsZWN0aW9uLCBub3cgcmVtb3ZlIHRoZSBfU0NIRU1BIGRvY3VtZW50XG4gICAgICAgIC50aGVuKCgpID0+IHRoaXMuX3NjaGVtYUNvbGxlY3Rpb24oKSlcbiAgICAgICAgLnRoZW4oc2NoZW1hQ29sbGVjdGlvbiA9PiBzY2hlbWFDb2xsZWN0aW9uLmZpbmRBbmREZWxldGVTY2hlbWEoY2xhc3NOYW1lKSlcbiAgICAgICAgLmNhdGNoKGVyciA9PiB0aGlzLmhhbmRsZUVycm9yKGVycikpXG4gICAgKTtcbiAgfVxuXG4gIGRlbGV0ZUFsbENsYXNzZXMoZmFzdDogYm9vbGVhbikge1xuICAgIHJldHVybiBzdG9yYWdlQWRhcHRlckFsbENvbGxlY3Rpb25zKHRoaXMpLnRoZW4oY29sbGVjdGlvbnMgPT5cbiAgICAgIFByb21pc2UuYWxsKFxuICAgICAgICBjb2xsZWN0aW9ucy5tYXAoY29sbGVjdGlvbiA9PiAoZmFzdCA/IGNvbGxlY3Rpb24uZGVsZXRlTWFueSh7fSkgOiBjb2xsZWN0aW9uLmRyb3AoKSkpXG4gICAgICApXG4gICAgKTtcbiAgfVxuXG4gIC8vIFJlbW92ZSB0aGUgY29sdW1uIGFuZCBhbGwgdGhlIGRhdGEuIEZvciBSZWxhdGlvbnMsIHRoZSBfSm9pbiBjb2xsZWN0aW9uIGlzIGhhbmRsZWRcbiAgLy8gc3BlY2lhbGx5LCB0aGlzIGZ1bmN0aW9uIGRvZXMgbm90IGRlbGV0ZSBfSm9pbiBjb2x1bW5zLiBJdCBzaG91bGQsIGhvd2V2ZXIsIGluZGljYXRlXG4gIC8vIHRoYXQgdGhlIHJlbGF0aW9uIGZpZWxkcyBkb2VzIG5vdCBleGlzdCBhbnltb3JlLiBJbiBtb25nbywgdGhpcyBtZWFucyByZW1vdmluZyBpdCBmcm9tXG4gIC8vIHRoZSBfU0NIRU1BIGNvbGxlY3Rpb24uICBUaGVyZSBzaG91bGQgYmUgbm8gYWN0dWFsIGRhdGEgaW4gdGhlIGNvbGxlY3Rpb24gdW5kZXIgdGhlIHNhbWUgbmFtZVxuICAvLyBhcyB0aGUgcmVsYXRpb24gY29sdW1uLCBzbyBpdCdzIGZpbmUgdG8gYXR0ZW1wdCB0byBkZWxldGUgaXQuIElmIHRoZSBmaWVsZHMgbGlzdGVkIHRvIGJlXG4gIC8vIGRlbGV0ZWQgZG8gbm90IGV4aXN0LCB0aGlzIGZ1bmN0aW9uIHNob3VsZCByZXR1cm4gc3VjY2Vzc2Z1bGx5IGFueXdheXMuIENoZWNraW5nIGZvclxuICAvLyBhdHRlbXB0cyB0byBkZWxldGUgbm9uLWV4aXN0ZW50IGZpZWxkcyBpcyB0aGUgcmVzcG9uc2liaWxpdHkgb2YgUGFyc2UgU2VydmVyLlxuXG4gIC8vIFBvaW50ZXIgZmllbGQgbmFtZXMgYXJlIHBhc3NlZCBmb3IgbGVnYWN5IHJlYXNvbnM6IHRoZSBvcmlnaW5hbCBtb25nb1xuICAvLyBmb3JtYXQgc3RvcmVkIHBvaW50ZXIgZmllbGQgbmFtZXMgZGlmZmVyZW50bHkgaW4gdGhlIGRhdGFiYXNlLCBhbmQgdGhlcmVmb3JlXG4gIC8vIG5lZWRlZCB0byBrbm93IHRoZSB0eXBlIG9mIHRoZSBmaWVsZCBiZWZvcmUgaXQgY291bGQgZGVsZXRlIGl0LiBGdXR1cmUgZGF0YWJhc2VcbiAgLy8gYWRhcHRlcnMgc2hvdWxkIGlnbm9yZSB0aGUgcG9pbnRlckZpZWxkTmFtZXMgYXJndW1lbnQuIEFsbCB0aGUgZmllbGQgbmFtZXMgYXJlIGluXG4gIC8vIGZpZWxkTmFtZXMsIHRoZXkgc2hvdyB1cCBhZGRpdGlvbmFsbHkgaW4gdGhlIHBvaW50ZXJGaWVsZE5hbWVzIGRhdGFiYXNlIGZvciB1c2VcbiAgLy8gYnkgdGhlIG1vbmdvIGFkYXB0ZXIsIHdoaWNoIGRlYWxzIHdpdGggdGhlIGxlZ2FjeSBtb25nbyBmb3JtYXQuXG5cbiAgLy8gVGhpcyBmdW5jdGlvbiBpcyBub3Qgb2JsaWdhdGVkIHRvIGRlbGV0ZSBmaWVsZHMgYXRvbWljYWxseS4gSXQgaXMgZ2l2ZW4gdGhlIGZpZWxkXG4gIC8vIG5hbWVzIGluIGEgbGlzdCBzbyB0aGF0IGRhdGFiYXNlcyB0aGF0IGFyZSBjYXBhYmxlIG9mIGRlbGV0aW5nIGZpZWxkcyBhdG9taWNhbGx5XG4gIC8vIG1heSBkbyBzby5cblxuICAvLyBSZXR1cm5zIGEgUHJvbWlzZS5cbiAgZGVsZXRlRmllbGRzKGNsYXNzTmFtZTogc3RyaW5nLCBzY2hlbWE6IFNjaGVtYVR5cGUsIGZpZWxkTmFtZXM6IHN0cmluZ1tdKSB7XG4gICAgY29uc3QgbW9uZ29Gb3JtYXROYW1lcyA9IGZpZWxkTmFtZXMubWFwKGZpZWxkTmFtZSA9PiB7XG4gICAgICBpZiAoc2NoZW1hLmZpZWxkc1tmaWVsZE5hbWVdLnR5cGUgPT09ICdQb2ludGVyJykge1xuICAgICAgICByZXR1cm4gYF9wXyR7ZmllbGROYW1lfWA7XG4gICAgICB9IGVsc2Uge1xuICAgICAgICByZXR1cm4gZmllbGROYW1lO1xuICAgICAgfVxuICAgIH0pO1xuICAgIGNvbnN0IGNvbGxlY3Rpb25VcGRhdGUgPSB7ICR1bnNldDoge30gfTtcbiAgICBtb25nb0Zvcm1hdE5hbWVzLmZvckVhY2gobmFtZSA9PiB7XG4gICAgICBjb2xsZWN0aW9uVXBkYXRlWyckdW5zZXQnXVtuYW1lXSA9IG51bGw7XG4gICAgfSk7XG5cbiAgICBjb25zdCBjb2xsZWN0aW9uRmlsdGVyID0geyAkb3I6IFtdIH07XG4gICAgbW9uZ29Gb3JtYXROYW1lcy5mb3JFYWNoKG5hbWUgPT4ge1xuICAgICAgY29sbGVjdGlvbkZpbHRlclsnJG9yJ10ucHVzaCh7IFtuYW1lXTogeyAkZXhpc3RzOiB0cnVlIH0gfSk7XG4gICAgfSk7XG5cbiAgICBjb25zdCBzY2hlbWFVcGRhdGUgPSB7ICR1bnNldDoge30gfTtcbiAgICBmaWVsZE5hbWVzLmZvckVhY2gobmFtZSA9PiB7XG4gICAgICBzY2hlbWFVcGRhdGVbJyR1bnNldCddW25hbWVdID0gbnVsbDtcbiAgICAgIHNjaGVtYVVwZGF0ZVsnJHVuc2V0J11bYF9tZXRhZGF0YS5maWVsZHNfb3B0aW9ucy4ke25hbWV9YF0gPSBudWxsO1xuICAgIH0pO1xuXG4gICAgcmV0dXJuIHRoaXMuX2FkYXB0aXZlQ29sbGVjdGlvbihjbGFzc05hbWUpXG4gICAgICAudGhlbihjb2xsZWN0aW9uID0+IGNvbGxlY3Rpb24udXBkYXRlTWFueShjb2xsZWN0aW9uRmlsdGVyLCBjb2xsZWN0aW9uVXBkYXRlKSlcbiAgICAgIC50aGVuKCgpID0+IHRoaXMuX3NjaGVtYUNvbGxlY3Rpb24oKSlcbiAgICAgIC50aGVuKHNjaGVtYUNvbGxlY3Rpb24gPT4gc2NoZW1hQ29sbGVjdGlvbi51cGRhdGVTY2hlbWEoY2xhc3NOYW1lLCBzY2hlbWFVcGRhdGUpKVxuICAgICAgLmNhdGNoKGVyciA9PiB0aGlzLmhhbmRsZUVycm9yKGVycikpO1xuICB9XG5cbiAgLy8gUmV0dXJuIGEgcHJvbWlzZSBmb3IgYWxsIHNjaGVtYXMga25vd24gdG8gdGhpcyBhZGFwdGVyLCBpbiBQYXJzZSBmb3JtYXQuIEluIGNhc2UgdGhlXG4gIC8vIHNjaGVtYXMgY2Fubm90IGJlIHJldHJpZXZlZCwgcmV0dXJucyBhIHByb21pc2UgdGhhdCByZWplY3RzLiBSZXF1aXJlbWVudHMgZm9yIHRoZVxuICAvLyByZWplY3Rpb24gcmVhc29uIGFyZSBUQkQuXG4gIGdldEFsbENsYXNzZXMoKTogUHJvbWlzZTxTdG9yYWdlQ2xhc3NbXT4ge1xuICAgIHJldHVybiB0aGlzLl9zY2hlbWFDb2xsZWN0aW9uKClcbiAgICAgIC50aGVuKHNjaGVtYXNDb2xsZWN0aW9uID0+IHNjaGVtYXNDb2xsZWN0aW9uLl9mZXRjaEFsbFNjaGVtYXNGcm9tX1NDSEVNQSgpKVxuICAgICAgLmNhdGNoKGVyciA9PiB0aGlzLmhhbmRsZUVycm9yKGVycikpO1xuICB9XG5cbiAgLy8gUmV0dXJuIGEgcHJvbWlzZSBmb3IgdGhlIHNjaGVtYSB3aXRoIHRoZSBnaXZlbiBuYW1lLCBpbiBQYXJzZSBmb3JtYXQuIElmXG4gIC8vIHRoaXMgYWRhcHRlciBkb2Vzbid0IGtub3cgYWJvdXQgdGhlIHNjaGVtYSwgcmV0dXJuIGEgcHJvbWlzZSB0aGF0IHJlamVjdHMgd2l0aFxuICAvLyB1bmRlZmluZWQgYXMgdGhlIHJlYXNvbi5cbiAgZ2V0Q2xhc3MoY2xhc3NOYW1lOiBzdHJpbmcpOiBQcm9taXNlPFN0b3JhZ2VDbGFzcz4ge1xuICAgIHJldHVybiB0aGlzLl9zY2hlbWFDb2xsZWN0aW9uKClcbiAgICAgIC50aGVuKHNjaGVtYXNDb2xsZWN0aW9uID0+IHNjaGVtYXNDb2xsZWN0aW9uLl9mZXRjaE9uZVNjaGVtYUZyb21fU0NIRU1BKGNsYXNzTmFtZSkpXG4gICAgICAuY2F0Y2goZXJyID0+IHRoaXMuaGFuZGxlRXJyb3IoZXJyKSk7XG4gIH1cblxuICAvLyBUT0RPOiBBcyB5ZXQgbm90IHBhcnRpY3VsYXJseSB3ZWxsIHNwZWNpZmllZC4gQ3JlYXRlcyBhbiBvYmplY3QuIE1heWJlIHNob3VsZG4ndCBldmVuIG5lZWQgdGhlIHNjaGVtYSxcbiAgLy8gYW5kIHNob3VsZCBpbmZlciBmcm9tIHRoZSB0eXBlLiBPciBtYXliZSBkb2VzIG5lZWQgdGhlIHNjaGVtYSBmb3IgdmFsaWRhdGlvbnMuIE9yIG1heWJlIG5lZWRzXG4gIC8vIHRoZSBzY2hlbWEgb25seSBmb3IgdGhlIGxlZ2FjeSBtb25nbyBmb3JtYXQuIFdlJ2xsIGZpZ3VyZSB0aGF0IG91dCBsYXRlci5cbiAgY3JlYXRlT2JqZWN0KGNsYXNzTmFtZTogc3RyaW5nLCBzY2hlbWE6IFNjaGVtYVR5cGUsIG9iamVjdDogYW55LCB0cmFuc2FjdGlvbmFsU2Vzc2lvbjogP2FueSkge1xuICAgIHNjaGVtYSA9IGNvbnZlcnRQYXJzZVNjaGVtYVRvTW9uZ29TY2hlbWEoc2NoZW1hKTtcbiAgICBjb25zdCBtb25nb09iamVjdCA9IHBhcnNlT2JqZWN0VG9Nb25nb09iamVjdEZvckNyZWF0ZShjbGFzc05hbWUsIG9iamVjdCwgc2NoZW1hKTtcbiAgICByZXR1cm4gdGhpcy5fYWRhcHRpdmVDb2xsZWN0aW9uKGNsYXNzTmFtZSlcbiAgICAgIC50aGVuKGNvbGxlY3Rpb24gPT4gY29sbGVjdGlvbi5pbnNlcnRPbmUobW9uZ29PYmplY3QsIHRyYW5zYWN0aW9uYWxTZXNzaW9uKSlcbiAgICAgIC50aGVuKCgpID0+ICh7IG9wczogW21vbmdvT2JqZWN0XSB9KSlcbiAgICAgIC5jYXRjaChlcnJvciA9PiB7XG4gICAgICAgIGlmIChlcnJvci5jb2RlID09PSAxMTAwMCkge1xuICAgICAgICAgIC8vIER1cGxpY2F0ZSB2YWx1ZVxuICAgICAgICAgIGNvbnN0IGVyciA9IG5ldyBQYXJzZS5FcnJvcihcbiAgICAgICAgICAgIFBhcnNlLkVycm9yLkRVUExJQ0FURV9WQUxVRSxcbiAgICAgICAgICAgICdBIGR1cGxpY2F0ZSB2YWx1ZSBmb3IgYSBmaWVsZCB3aXRoIHVuaXF1ZSB2YWx1ZXMgd2FzIHByb3ZpZGVkJ1xuICAgICAgICAgICk7XG4gICAgICAgICAgZXJyLnVuZGVybHlpbmdFcnJvciA9IGVycm9yO1xuICAgICAgICAgIGlmIChlcnJvci5tZXNzYWdlKSB7XG4gICAgICAgICAgICBjb25zdCBtYXRjaGVzID0gZXJyb3IubWVzc2FnZS5tYXRjaCgvaW5kZXg6W1xcc2EtekEtWjAtOV9cXC1cXC5dK1xcJD8oW2EtekEtWl8tXSspXzEvKTtcbiAgICAgICAgICAgIGlmIChtYXRjaGVzICYmIEFycmF5LmlzQXJyYXkobWF0Y2hlcykpIHtcbiAgICAgICAgICAgICAgZXJyLnVzZXJJbmZvID0geyBkdXBsaWNhdGVkX2ZpZWxkOiBtYXRjaGVzWzFdIH07XG4gICAgICAgICAgICB9XG4gICAgICAgICAgfVxuICAgICAgICAgIHRocm93IGVycjtcbiAgICAgICAgfVxuICAgICAgICB0aHJvdyBlcnJvcjtcbiAgICAgIH0pXG4gICAgICAuY2F0Y2goZXJyID0+IHRoaXMuaGFuZGxlRXJyb3IoZXJyKSk7XG4gIH1cblxuICAvLyBSZW1vdmUgYWxsIG9iamVjdHMgdGhhdCBtYXRjaCB0aGUgZ2l2ZW4gUGFyc2UgUXVlcnkuXG4gIC8vIElmIG5vIG9iamVjdHMgbWF0Y2gsIHJlamVjdCB3aXRoIE9CSkVDVF9OT1RfRk9VTkQuIElmIG9iamVjdHMgYXJlIGZvdW5kIGFuZCBkZWxldGVkLCByZXNvbHZlIHdpdGggdW5kZWZpbmVkLlxuICAvLyBJZiB0aGVyZSBpcyBzb21lIG90aGVyIGVycm9yLCByZWplY3Qgd2l0aCBJTlRFUk5BTF9TRVJWRVJfRVJST1IuXG4gIGRlbGV0ZU9iamVjdHNCeVF1ZXJ5KFxuICAgIGNsYXNzTmFtZTogc3RyaW5nLFxuICAgIHNjaGVtYTogU2NoZW1hVHlwZSxcbiAgICBxdWVyeTogUXVlcnlUeXBlLFxuICAgIHRyYW5zYWN0aW9uYWxTZXNzaW9uOiA/YW55XG4gICkge1xuICAgIHNjaGVtYSA9IGNvbnZlcnRQYXJzZVNjaGVtYVRvTW9uZ29TY2hlbWEoc2NoZW1hKTtcbiAgICByZXR1cm4gdGhpcy5fYWRhcHRpdmVDb2xsZWN0aW9uKGNsYXNzTmFtZSlcbiAgICAgIC50aGVuKGNvbGxlY3Rpb24gPT4ge1xuICAgICAgICBjb25zdCBtb25nb1doZXJlID0gdHJhbnNmb3JtV2hlcmUoY2xhc3NOYW1lLCBxdWVyeSwgc2NoZW1hKTtcbiAgICAgICAgcmV0dXJuIGNvbGxlY3Rpb24uZGVsZXRlTWFueShtb25nb1doZXJlLCB0cmFuc2FjdGlvbmFsU2Vzc2lvbik7XG4gICAgICB9KVxuICAgICAgLmNhdGNoKGVyciA9PiB0aGlzLmhhbmRsZUVycm9yKGVycikpXG4gICAgICAudGhlbihcbiAgICAgICAgKHsgZGVsZXRlZENvdW50IH0pID0+IHtcbiAgICAgICAgICBpZiAoZGVsZXRlZENvdW50ID09PSAwKSB7XG4gICAgICAgICAgICB0aHJvdyBuZXcgUGFyc2UuRXJyb3IoUGFyc2UuRXJyb3IuT0JKRUNUX05PVF9GT1VORCwgJ09iamVjdCBub3QgZm91bmQuJyk7XG4gICAgICAgICAgfVxuICAgICAgICAgIHJldHVybiBQcm9taXNlLnJlc29sdmUoKTtcbiAgICAgICAgfSxcbiAgICAgICAgKCkgPT4ge1xuICAgICAgICAgIHRocm93IG5ldyBQYXJzZS5FcnJvcihQYXJzZS5FcnJvci5JTlRFUk5BTF9TRVJWRVJfRVJST1IsICdEYXRhYmFzZSBhZGFwdGVyIGVycm9yJyk7XG4gICAgICAgIH1cbiAgICAgICk7XG4gIH1cblxuICAvLyBBcHBseSB0aGUgdXBkYXRlIHRvIGFsbCBvYmplY3RzIHRoYXQgbWF0Y2ggdGhlIGdpdmVuIFBhcnNlIFF1ZXJ5LlxuICB1cGRhdGVPYmplY3RzQnlRdWVyeShcbiAgICBjbGFzc05hbWU6IHN0cmluZyxcbiAgICBzY2hlbWE6IFNjaGVtYVR5cGUsXG4gICAgcXVlcnk6IFF1ZXJ5VHlwZSxcbiAgICB1cGRhdGU6IGFueSxcbiAgICB0cmFuc2FjdGlvbmFsU2Vzc2lvbjogP2FueVxuICApIHtcbiAgICBzY2hlbWEgPSBjb252ZXJ0UGFyc2VTY2hlbWFUb01vbmdvU2NoZW1hKHNjaGVtYSk7XG4gICAgY29uc3QgbW9uZ29VcGRhdGUgPSB0cmFuc2Zvcm1VcGRhdGUoY2xhc3NOYW1lLCB1cGRhdGUsIHNjaGVtYSk7XG4gICAgY29uc3QgbW9uZ29XaGVyZSA9IHRyYW5zZm9ybVdoZXJlKGNsYXNzTmFtZSwgcXVlcnksIHNjaGVtYSk7XG4gICAgcmV0dXJuIHRoaXMuX2FkYXB0aXZlQ29sbGVjdGlvbihjbGFzc05hbWUpXG4gICAgICAudGhlbihjb2xsZWN0aW9uID0+IGNvbGxlY3Rpb24udXBkYXRlTWFueShtb25nb1doZXJlLCBtb25nb1VwZGF0ZSwgdHJhbnNhY3Rpb25hbFNlc3Npb24pKVxuICAgICAgLmNhdGNoKGVyciA9PiB0aGlzLmhhbmRsZUVycm9yKGVycikpO1xuICB9XG5cbiAgLy8gQXRvbWljYWxseSBmaW5kcyBhbmQgdXBkYXRlcyBhbiBvYmplY3QgYmFzZWQgb24gcXVlcnkuXG4gIC8vIFJldHVybiB2YWx1ZSBub3QgY3VycmVudGx5IHdlbGwgc3BlY2lmaWVkLlxuICBmaW5kT25lQW5kVXBkYXRlKFxuICAgIGNsYXNzTmFtZTogc3RyaW5nLFxuICAgIHNjaGVtYTogU2NoZW1hVHlwZSxcbiAgICBxdWVyeTogUXVlcnlUeXBlLFxuICAgIHVwZGF0ZTogYW55LFxuICAgIHRyYW5zYWN0aW9uYWxTZXNzaW9uOiA/YW55XG4gICkge1xuICAgIHNjaGVtYSA9IGNvbnZlcnRQYXJzZVNjaGVtYVRvTW9uZ29TY2hlbWEoc2NoZW1hKTtcbiAgICBjb25zdCBtb25nb1VwZGF0ZSA9IHRyYW5zZm9ybVVwZGF0ZShjbGFzc05hbWUsIHVwZGF0ZSwgc2NoZW1hKTtcbiAgICBjb25zdCBtb25nb1doZXJlID0gdHJhbnNmb3JtV2hlcmUoY2xhc3NOYW1lLCBxdWVyeSwgc2NoZW1hKTtcbiAgICByZXR1cm4gdGhpcy5fYWRhcHRpdmVDb2xsZWN0aW9uKGNsYXNzTmFtZSlcbiAgICAgIC50aGVuKGNvbGxlY3Rpb24gPT5cbiAgICAgICAgY29sbGVjdGlvbi5fbW9uZ29Db2xsZWN0aW9uLmZpbmRPbmVBbmRVcGRhdGUobW9uZ29XaGVyZSwgbW9uZ29VcGRhdGUsIHtcbiAgICAgICAgICByZXR1cm5Eb2N1bWVudDogJ2FmdGVyJyxcbiAgICAgICAgICBzZXNzaW9uOiB0cmFuc2FjdGlvbmFsU2Vzc2lvbiB8fCB1bmRlZmluZWQsXG4gICAgICAgIH0pXG4gICAgICApXG4gICAgICAudGhlbihyZXN1bHQgPT4gbW9uZ29PYmplY3RUb1BhcnNlT2JqZWN0KGNsYXNzTmFtZSwgcmVzdWx0LnZhbHVlLCBzY2hlbWEpKVxuICAgICAgLmNhdGNoKGVycm9yID0+IHtcbiAgICAgICAgaWYgKGVycm9yLmNvZGUgPT09IDExMDAwKSB7XG4gICAgICAgICAgdGhyb3cgbmV3IFBhcnNlLkVycm9yKFxuICAgICAgICAgICAgUGFyc2UuRXJyb3IuRFVQTElDQVRFX1ZBTFVFLFxuICAgICAgICAgICAgJ0EgZHVwbGljYXRlIHZhbHVlIGZvciBhIGZpZWxkIHdpdGggdW5pcXVlIHZhbHVlcyB3YXMgcHJvdmlkZWQnXG4gICAgICAgICAgKTtcbiAgICAgICAgfVxuICAgICAgICB0aHJvdyBlcnJvcjtcbiAgICAgIH0pXG4gICAgICAuY2F0Y2goZXJyID0+IHRoaXMuaGFuZGxlRXJyb3IoZXJyKSk7XG4gIH1cblxuICAvLyBIb3BlZnVsbHkgd2UgY2FuIGdldCByaWQgb2YgdGhpcy4gSXQncyBvbmx5IHVzZWQgZm9yIGNvbmZpZyBhbmQgaG9va3MuXG4gIHVwc2VydE9uZU9iamVjdChcbiAgICBjbGFzc05hbWU6IHN0cmluZyxcbiAgICBzY2hlbWE6IFNjaGVtYVR5cGUsXG4gICAgcXVlcnk6IFF1ZXJ5VHlwZSxcbiAgICB1cGRhdGU6IGFueSxcbiAgICB0cmFuc2FjdGlvbmFsU2Vzc2lvbjogP2FueVxuICApIHtcbiAgICBzY2hlbWEgPSBjb252ZXJ0UGFyc2VTY2hlbWFUb01vbmdvU2NoZW1hKHNjaGVtYSk7XG4gICAgY29uc3QgbW9uZ29VcGRhdGUgPSB0cmFuc2Zvcm1VcGRhdGUoY2xhc3NOYW1lLCB1cGRhdGUsIHNjaGVtYSk7XG4gICAgY29uc3QgbW9uZ29XaGVyZSA9IHRyYW5zZm9ybVdoZXJlKGNsYXNzTmFtZSwgcXVlcnksIHNjaGVtYSk7XG4gICAgcmV0dXJuIHRoaXMuX2FkYXB0aXZlQ29sbGVjdGlvbihjbGFzc05hbWUpXG4gICAgICAudGhlbihjb2xsZWN0aW9uID0+IGNvbGxlY3Rpb24udXBzZXJ0T25lKG1vbmdvV2hlcmUsIG1vbmdvVXBkYXRlLCB0cmFuc2FjdGlvbmFsU2Vzc2lvbikpXG4gICAgICAuY2F0Y2goZXJyID0+IHRoaXMuaGFuZGxlRXJyb3IoZXJyKSk7XG4gIH1cblxuICAvLyBFeGVjdXRlcyBhIGZpbmQuIEFjY2VwdHM6IGNsYXNzTmFtZSwgcXVlcnkgaW4gUGFyc2UgZm9ybWF0LCBhbmQgeyBza2lwLCBsaW1pdCwgc29ydCB9LlxuICBmaW5kKFxuICAgIGNsYXNzTmFtZTogc3RyaW5nLFxuICAgIHNjaGVtYTogU2NoZW1hVHlwZSxcbiAgICBxdWVyeTogUXVlcnlUeXBlLFxuICAgIHsgc2tpcCwgbGltaXQsIHNvcnQsIGtleXMsIHJlYWRQcmVmZXJlbmNlLCBoaW50LCBjYXNlSW5zZW5zaXRpdmUsIGV4cGxhaW4gfTogUXVlcnlPcHRpb25zXG4gICk6IFByb21pc2U8YW55PiB7XG4gICAgdmFsaWRhdGVFeHBsYWluVmFsdWUoZXhwbGFpbik7XG4gICAgc2NoZW1hID0gY29udmVydFBhcnNlU2NoZW1hVG9Nb25nb1NjaGVtYShzY2hlbWEpO1xuICAgIGNvbnN0IG1vbmdvV2hlcmUgPSB0cmFuc2Zvcm1XaGVyZShjbGFzc05hbWUsIHF1ZXJ5LCBzY2hlbWEpO1xuICAgIGNvbnN0IG1vbmdvU29ydCA9IF8ubWFwS2V5cyhzb3J0LCAodmFsdWUsIGZpZWxkTmFtZSkgPT5cbiAgICAgIHRyYW5zZm9ybUtleShjbGFzc05hbWUsIGZpZWxkTmFtZSwgc2NoZW1hKVxuICAgICk7XG4gICAgY29uc3QgbW9uZ29LZXlzID0gXy5yZWR1Y2UoXG4gICAgICBrZXlzLFxuICAgICAgKG1lbW8sIGtleSkgPT4ge1xuICAgICAgICBpZiAoa2V5ID09PSAnQUNMJykge1xuICAgICAgICAgIG1lbW9bJ19ycGVybSddID0gMTtcbiAgICAgICAgICBtZW1vWydfd3Blcm0nXSA9IDE7XG4gICAgICAgIH0gZWxzZSB7XG4gICAgICAgICAgbWVtb1t0cmFuc2Zvcm1LZXkoY2xhc3NOYW1lLCBrZXksIHNjaGVtYSldID0gMTtcbiAgICAgICAgfVxuICAgICAgICByZXR1cm4gbWVtbztcbiAgICAgIH0sXG4gICAgICB7fVxuICAgICk7XG5cbiAgICAvLyBJZiB3ZSBhcmVuJ3QgcmVxdWVzdGluZyB0aGUgYF9pZGAgZmllbGQsIHdlIG5lZWQgdG8gZXhwbGljaXRseSBvcHQgb3V0XG4gICAgLy8gb2YgaXQuIERvaW5nIHNvIGluIHBhcnNlLXNlcnZlciBpcyB1bnVzdWFsLCBidXQgaXQgY2FuIGFsbG93IHVzIHRvXG4gICAgLy8gb3B0aW1pemUgc29tZSBxdWVyaWVzIHdpdGggY292ZXJpbmcgaW5kZXhlcy5cbiAgICBpZiAoa2V5cyAmJiAhbW9uZ29LZXlzLl9pZCkge1xuICAgICAgbW9uZ29LZXlzLl9pZCA9IDA7XG4gICAgfVxuXG4gICAgcmVhZFByZWZlcmVuY2UgPSB0aGlzLl9wYXJzZVJlYWRQcmVmZXJlbmNlKHJlYWRQcmVmZXJlbmNlKTtcbiAgICByZXR1cm4gdGhpcy5jcmVhdGVUZXh0SW5kZXhlc0lmTmVlZGVkKGNsYXNzTmFtZSwgcXVlcnksIHNjaGVtYSlcbiAgICAgIC50aGVuKCgpID0+IHRoaXMuX2FkYXB0aXZlQ29sbGVjdGlvbihjbGFzc05hbWUpKVxuICAgICAgLnRoZW4oY29sbGVjdGlvbiA9PlxuICAgICAgICBjb2xsZWN0aW9uLmZpbmQobW9uZ29XaGVyZSwge1xuICAgICAgICAgIHNraXAsXG4gICAgICAgICAgbGltaXQsXG4gICAgICAgICAgc29ydDogbW9uZ29Tb3J0LFxuICAgICAgICAgIGtleXM6IG1vbmdvS2V5cyxcbiAgICAgICAgICBtYXhUaW1lTVM6IHRoaXMuX21heFRpbWVNUyxcbiAgICAgICAgICByZWFkUHJlZmVyZW5jZSxcbiAgICAgICAgICBoaW50LFxuICAgICAgICAgIGNhc2VJbnNlbnNpdGl2ZSxcbiAgICAgICAgICBleHBsYWluLFxuICAgICAgICB9KVxuICAgICAgKVxuICAgICAgLnRoZW4ob2JqZWN0cyA9PiB7XG4gICAgICAgIGlmIChleHBsYWluKSB7XG4gICAgICAgICAgcmV0dXJuIG9iamVjdHM7XG4gICAgICAgIH1cbiAgICAgICAgcmV0dXJuIG9iamVjdHMubWFwKG9iamVjdCA9PiBtb25nb09iamVjdFRvUGFyc2VPYmplY3QoY2xhc3NOYW1lLCBvYmplY3QsIHNjaGVtYSkpO1xuICAgICAgfSlcbiAgICAgIC5jYXRjaChlcnIgPT4gdGhpcy5oYW5kbGVFcnJvcihlcnIpKTtcbiAgfVxuXG4gIGVuc3VyZUluZGV4KFxuICAgIGNsYXNzTmFtZTogc3RyaW5nLFxuICAgIHNjaGVtYTogU2NoZW1hVHlwZSxcbiAgICBmaWVsZE5hbWVzOiBzdHJpbmdbXSxcbiAgICBpbmRleE5hbWU6ID9zdHJpbmcsXG4gICAgY2FzZUluc2Vuc2l0aXZlOiBib29sZWFuID0gZmFsc2UsXG4gICAgb3B0aW9ucz86IE9iamVjdCA9IHt9XG4gICk6IFByb21pc2U8YW55PiB7XG4gICAgc2NoZW1hID0gY29udmVydFBhcnNlU2NoZW1hVG9Nb25nb1NjaGVtYShzY2hlbWEpO1xuICAgIGNvbnN0IGluZGV4Q3JlYXRpb25SZXF1ZXN0ID0ge307XG4gICAgY29uc3QgbW9uZ29GaWVsZE5hbWVzID0gZmllbGROYW1lcy5tYXAoZmllbGROYW1lID0+IHRyYW5zZm9ybUtleShjbGFzc05hbWUsIGZpZWxkTmFtZSwgc2NoZW1hKSk7XG4gICAgbW9uZ29GaWVsZE5hbWVzLmZvckVhY2goZmllbGROYW1lID0+IHtcbiAgICAgIGluZGV4Q3JlYXRpb25SZXF1ZXN0W2ZpZWxkTmFtZV0gPSBvcHRpb25zLmluZGV4VHlwZSAhPT0gdW5kZWZpbmVkID8gb3B0aW9ucy5pbmRleFR5cGUgOiAxO1xuICAgIH0pO1xuXG4gICAgY29uc3QgZGVmYXVsdE9wdGlvbnM6IE9iamVjdCA9IHsgYmFja2dyb3VuZDogdHJ1ZSwgc3BhcnNlOiB0cnVlIH07XG4gICAgY29uc3QgaW5kZXhOYW1lT3B0aW9uczogT2JqZWN0ID0gaW5kZXhOYW1lID8geyBuYW1lOiBpbmRleE5hbWUgfSA6IHt9O1xuICAgIGNvbnN0IHR0bE9wdGlvbnM6IE9iamVjdCA9IG9wdGlvbnMudHRsICE9PSB1bmRlZmluZWQgPyB7IGV4cGlyZUFmdGVyU2Vjb25kczogb3B0aW9ucy50dGwgfSA6IHt9O1xuICAgIGNvbnN0IGNhc2VJbnNlbnNpdGl2ZU9wdGlvbnM6IE9iamVjdCA9IGNhc2VJbnNlbnNpdGl2ZVxuICAgICAgPyB7IGNvbGxhdGlvbjogTW9uZ29Db2xsZWN0aW9uLmNhc2VJbnNlbnNpdGl2ZUNvbGxhdGlvbigpIH1cbiAgICAgIDoge307XG4gICAgY29uc3QgaW5kZXhPcHRpb25zOiBPYmplY3QgPSB7XG4gICAgICAuLi5kZWZhdWx0T3B0aW9ucyxcbiAgICAgIC4uLmNhc2VJbnNlbnNpdGl2ZU9wdGlvbnMsXG4gICAgICAuLi5pbmRleE5hbWVPcHRpb25zLFxuICAgICAgLi4udHRsT3B0aW9ucyxcbiAgICB9O1xuXG4gICAgcmV0dXJuIHRoaXMuX2FkYXB0aXZlQ29sbGVjdGlvbihjbGFzc05hbWUpXG4gICAgICAudGhlbihcbiAgICAgICAgY29sbGVjdGlvbiA9PlxuICAgICAgICAgIG5ldyBQcm9taXNlKChyZXNvbHZlLCByZWplY3QpID0+XG4gICAgICAgICAgICBjb2xsZWN0aW9uLl9tb25nb0NvbGxlY3Rpb24uY3JlYXRlSW5kZXgoaW5kZXhDcmVhdGlvblJlcXVlc3QsIGluZGV4T3B0aW9ucywgZXJyb3IgPT5cbiAgICAgICAgICAgICAgZXJyb3IgPyByZWplY3QoZXJyb3IpIDogcmVzb2x2ZSgpXG4gICAgICAgICAgICApXG4gICAgICAgICAgKVxuICAgICAgKVxuICAgICAgLmNhdGNoKGVyciA9PiB0aGlzLmhhbmRsZUVycm9yKGVycikpO1xuICB9XG5cbiAgLy8gQ3JlYXRlIGEgdW5pcXVlIGluZGV4LiBVbmlxdWUgaW5kZXhlcyBvbiBudWxsYWJsZSBmaWVsZHMgYXJlIG5vdCBhbGxvd2VkLiBTaW5jZSB3ZSBkb24ndFxuICAvLyBjdXJyZW50bHkga25vdyB3aGljaCBmaWVsZHMgYXJlIG51bGxhYmxlIGFuZCB3aGljaCBhcmVuJ3QsIHdlIGlnbm9yZSB0aGF0IGNyaXRlcmlhLlxuICAvLyBBcyBzdWNoLCB3ZSBzaG91bGRuJ3QgZXhwb3NlIHRoaXMgZnVuY3Rpb24gdG8gdXNlcnMgb2YgcGFyc2UgdW50aWwgd2UgaGF2ZSBhbiBvdXQtb2YtYmFuZFxuICAvLyBXYXkgb2YgZGV0ZXJtaW5pbmcgaWYgYSBmaWVsZCBpcyBudWxsYWJsZS4gVW5kZWZpbmVkIGRvZXNuJ3QgY291bnQgYWdhaW5zdCB1bmlxdWVuZXNzLFxuICAvLyB3aGljaCBpcyB3aHkgd2UgdXNlIHNwYXJzZSBpbmRleGVzLlxuICBlbnN1cmVVbmlxdWVuZXNzKGNsYXNzTmFtZTogc3RyaW5nLCBzY2hlbWE6IFNjaGVtYVR5cGUsIGZpZWxkTmFtZXM6IHN0cmluZ1tdKSB7XG4gICAgc2NoZW1hID0gY29udmVydFBhcnNlU2NoZW1hVG9Nb25nb1NjaGVtYShzY2hlbWEpO1xuICAgIGNvbnN0IGluZGV4Q3JlYXRpb25SZXF1ZXN0ID0ge307XG4gICAgY29uc3QgbW9uZ29GaWVsZE5hbWVzID0gZmllbGROYW1lcy5tYXAoZmllbGROYW1lID0+IHRyYW5zZm9ybUtleShjbGFzc05hbWUsIGZpZWxkTmFtZSwgc2NoZW1hKSk7XG4gICAgbW9uZ29GaWVsZE5hbWVzLmZvckVhY2goZmllbGROYW1lID0+IHtcbiAgICAgIGluZGV4Q3JlYXRpb25SZXF1ZXN0W2ZpZWxkTmFtZV0gPSAxO1xuICAgIH0pO1xuICAgIHJldHVybiB0aGlzLl9hZGFwdGl2ZUNvbGxlY3Rpb24oY2xhc3NOYW1lKVxuICAgICAgLnRoZW4oY29sbGVjdGlvbiA9PiBjb2xsZWN0aW9uLl9lbnN1cmVTcGFyc2VVbmlxdWVJbmRleEluQmFja2dyb3VuZChpbmRleENyZWF0aW9uUmVxdWVzdCkpXG4gICAgICAuY2F0Y2goZXJyb3IgPT4ge1xuICAgICAgICBpZiAoZXJyb3IuY29kZSA9PT0gMTEwMDApIHtcbiAgICAgICAgICB0aHJvdyBuZXcgUGFyc2UuRXJyb3IoXG4gICAgICAgICAgICBQYXJzZS5FcnJvci5EVVBMSUNBVEVfVkFMVUUsXG4gICAgICAgICAgICAnVHJpZWQgdG8gZW5zdXJlIGZpZWxkIHVuaXF1ZW5lc3MgZm9yIGEgY2xhc3MgdGhhdCBhbHJlYWR5IGhhcyBkdXBsaWNhdGVzLidcbiAgICAgICAgICApO1xuICAgICAgICB9XG4gICAgICAgIHRocm93IGVycm9yO1xuICAgICAgfSlcbiAgICAgIC5jYXRjaChlcnIgPT4gdGhpcy5oYW5kbGVFcnJvcihlcnIpKTtcbiAgfVxuXG4gIC8vIFVzZWQgaW4gdGVzdHNcbiAgX3Jhd0ZpbmQoY2xhc3NOYW1lOiBzdHJpbmcsIHF1ZXJ5OiBRdWVyeVR5cGUpIHtcbiAgICByZXR1cm4gdGhpcy5fYWRhcHRpdmVDb2xsZWN0aW9uKGNsYXNzTmFtZSlcbiAgICAgIC50aGVuKGNvbGxlY3Rpb24gPT5cbiAgICAgICAgY29sbGVjdGlvbi5maW5kKHF1ZXJ5LCB7XG4gICAgICAgICAgbWF4VGltZU1TOiB0aGlzLl9tYXhUaW1lTVMsXG4gICAgICAgIH0pXG4gICAgICApXG4gICAgICAuY2F0Y2goZXJyID0+IHRoaXMuaGFuZGxlRXJyb3IoZXJyKSk7XG4gIH1cblxuICAvLyBFeGVjdXRlcyBhIGNvdW50LlxuICBjb3VudChcbiAgICBjbGFzc05hbWU6IHN0cmluZyxcbiAgICBzY2hlbWE6IFNjaGVtYVR5cGUsXG4gICAgcXVlcnk6IFF1ZXJ5VHlwZSxcbiAgICByZWFkUHJlZmVyZW5jZTogP3N0cmluZyxcbiAgICBoaW50OiA/bWl4ZWRcbiAgKSB7XG4gICAgc2NoZW1hID0gY29udmVydFBhcnNlU2NoZW1hVG9Nb25nb1NjaGVtYShzY2hlbWEpO1xuICAgIHJlYWRQcmVmZXJlbmNlID0gdGhpcy5fcGFyc2VSZWFkUHJlZmVyZW5jZShyZWFkUHJlZmVyZW5jZSk7XG4gICAgcmV0dXJuIHRoaXMuX2FkYXB0aXZlQ29sbGVjdGlvbihjbGFzc05hbWUpXG4gICAgICAudGhlbihjb2xsZWN0aW9uID0+XG4gICAgICAgIGNvbGxlY3Rpb24uY291bnQodHJhbnNmb3JtV2hlcmUoY2xhc3NOYW1lLCBxdWVyeSwgc2NoZW1hLCB0cnVlKSwge1xuICAgICAgICAgIG1heFRpbWVNUzogdGhpcy5fbWF4VGltZU1TLFxuICAgICAgICAgIHJlYWRQcmVmZXJlbmNlLFxuICAgICAgICAgIGhpbnQsXG4gICAgICAgIH0pXG4gICAgICApXG4gICAgICAuY2F0Y2goZXJyID0+IHRoaXMuaGFuZGxlRXJyb3IoZXJyKSk7XG4gIH1cblxuICBkaXN0aW5jdChjbGFzc05hbWU6IHN0cmluZywgc2NoZW1hOiBTY2hlbWFUeXBlLCBxdWVyeTogUXVlcnlUeXBlLCBmaWVsZE5hbWU6IHN0cmluZykge1xuICAgIHNjaGVtYSA9IGNvbnZlcnRQYXJzZVNjaGVtYVRvTW9uZ29TY2hlbWEoc2NoZW1hKTtcbiAgICBjb25zdCBpc1BvaW50ZXJGaWVsZCA9IHNjaGVtYS5maWVsZHNbZmllbGROYW1lXSAmJiBzY2hlbWEuZmllbGRzW2ZpZWxkTmFtZV0udHlwZSA9PT0gJ1BvaW50ZXInO1xuICAgIGNvbnN0IHRyYW5zZm9ybUZpZWxkID0gdHJhbnNmb3JtS2V5KGNsYXNzTmFtZSwgZmllbGROYW1lLCBzY2hlbWEpO1xuXG4gICAgcmV0dXJuIHRoaXMuX2FkYXB0aXZlQ29sbGVjdGlvbihjbGFzc05hbWUpXG4gICAgICAudGhlbihjb2xsZWN0aW9uID0+XG4gICAgICAgIGNvbGxlY3Rpb24uZGlzdGluY3QodHJhbnNmb3JtRmllbGQsIHRyYW5zZm9ybVdoZXJlKGNsYXNzTmFtZSwgcXVlcnksIHNjaGVtYSkpXG4gICAgICApXG4gICAgICAudGhlbihvYmplY3RzID0+IHtcbiAgICAgICAgb2JqZWN0cyA9IG9iamVjdHMuZmlsdGVyKG9iaiA9PiBvYmogIT0gbnVsbCk7XG4gICAgICAgIHJldHVybiBvYmplY3RzLm1hcChvYmplY3QgPT4ge1xuICAgICAgICAgIGlmIChpc1BvaW50ZXJGaWVsZCkge1xuICAgICAgICAgICAgcmV0dXJuIHRyYW5zZm9ybVBvaW50ZXJTdHJpbmcoc2NoZW1hLCBmaWVsZE5hbWUsIG9iamVjdCk7XG4gICAgICAgICAgfVxuICAgICAgICAgIHJldHVybiBtb25nb09iamVjdFRvUGFyc2VPYmplY3QoY2xhc3NOYW1lLCBvYmplY3QsIHNjaGVtYSk7XG4gICAgICAgIH0pO1xuICAgICAgfSlcbiAgICAgIC5jYXRjaChlcnIgPT4gdGhpcy5oYW5kbGVFcnJvcihlcnIpKTtcbiAgfVxuXG4gIGFnZ3JlZ2F0ZShcbiAgICBjbGFzc05hbWU6IHN0cmluZyxcbiAgICBzY2hlbWE6IGFueSxcbiAgICBwaXBlbGluZTogYW55LFxuICAgIHJlYWRQcmVmZXJlbmNlOiA/c3RyaW5nLFxuICAgIGhpbnQ6ID9taXhlZCxcbiAgICBleHBsYWluPzogYm9vbGVhblxuICApIHtcbiAgICB2YWxpZGF0ZUV4cGxhaW5WYWx1ZShleHBsYWluKTtcbiAgICBsZXQgaXNQb2ludGVyRmllbGQgPSBmYWxzZTtcbiAgICBwaXBlbGluZSA9IHBpcGVsaW5lLm1hcChzdGFnZSA9PiB7XG4gICAgICBpZiAoc3RhZ2UuJGdyb3VwKSB7XG4gICAgICAgIHN0YWdlLiRncm91cCA9IHRoaXMuX3BhcnNlQWdncmVnYXRlR3JvdXBBcmdzKHNjaGVtYSwgc3RhZ2UuJGdyb3VwKTtcbiAgICAgICAgaWYgKFxuICAgICAgICAgIHN0YWdlLiRncm91cC5faWQgJiZcbiAgICAgICAgICB0eXBlb2Ygc3RhZ2UuJGdyb3VwLl9pZCA9PT0gJ3N0cmluZycgJiZcbiAgICAgICAgICBzdGFnZS4kZ3JvdXAuX2lkLmluZGV4T2YoJyRfcF8nKSA+PSAwXG4gICAgICAgICkge1xuICAgICAgICAgIGlzUG9pbnRlckZpZWxkID0gdHJ1ZTtcbiAgICAgICAgfVxuICAgICAgfVxuICAgICAgaWYgKHN0YWdlLiRtYXRjaCkge1xuICAgICAgICBzdGFnZS4kbWF0Y2ggPSB0aGlzLl9wYXJzZUFnZ3JlZ2F0ZUFyZ3Moc2NoZW1hLCBzdGFnZS4kbWF0Y2gpO1xuICAgICAgfVxuICAgICAgaWYgKHN0YWdlLiRwcm9qZWN0KSB7XG4gICAgICAgIHN0YWdlLiRwcm9qZWN0ID0gdGhpcy5fcGFyc2VBZ2dyZWdhdGVQcm9qZWN0QXJncyhzY2hlbWEsIHN0YWdlLiRwcm9qZWN0KTtcbiAgICAgIH1cbiAgICAgIGlmIChzdGFnZS4kZ2VvTmVhciAmJiBzdGFnZS4kZ2VvTmVhci5xdWVyeSkge1xuICAgICAgICBzdGFnZS4kZ2VvTmVhci5xdWVyeSA9IHRoaXMuX3BhcnNlQWdncmVnYXRlQXJncyhzY2hlbWEsIHN0YWdlLiRnZW9OZWFyLnF1ZXJ5KTtcbiAgICAgIH1cbiAgICAgIHJldHVybiBzdGFnZTtcbiAgICB9KTtcbiAgICByZWFkUHJlZmVyZW5jZSA9IHRoaXMuX3BhcnNlUmVhZFByZWZlcmVuY2UocmVhZFByZWZlcmVuY2UpO1xuICAgIHJldHVybiB0aGlzLl9hZGFwdGl2ZUNvbGxlY3Rpb24oY2xhc3NOYW1lKVxuICAgICAgLnRoZW4oY29sbGVjdGlvbiA9PlxuICAgICAgICBjb2xsZWN0aW9uLmFnZ3JlZ2F0ZShwaXBlbGluZSwge1xuICAgICAgICAgIHJlYWRQcmVmZXJlbmNlLFxuICAgICAgICAgIG1heFRpbWVNUzogdGhpcy5fbWF4VGltZU1TLFxuICAgICAgICAgIGhpbnQsXG4gICAgICAgICAgZXhwbGFpbixcbiAgICAgICAgfSlcbiAgICAgIClcbiAgICAgIC50aGVuKHJlc3VsdHMgPT4ge1xuICAgICAgICByZXN1bHRzLmZvckVhY2gocmVzdWx0ID0+IHtcbiAgICAgICAgICBpZiAoT2JqZWN0LnByb3RvdHlwZS5oYXNPd25Qcm9wZXJ0eS5jYWxsKHJlc3VsdCwgJ19pZCcpKSB7XG4gICAgICAgICAgICBpZiAoaXNQb2ludGVyRmllbGQgJiYgcmVzdWx0Ll9pZCkge1xuICAgICAgICAgICAgICByZXN1bHQuX2lkID0gcmVzdWx0Ll9pZC5zcGxpdCgnJCcpWzFdO1xuICAgICAgICAgICAgfVxuICAgICAgICAgICAgaWYgKFxuICAgICAgICAgICAgICByZXN1bHQuX2lkID09IG51bGwgfHxcbiAgICAgICAgICAgICAgcmVzdWx0Ll9pZCA9PSB1bmRlZmluZWQgfHxcbiAgICAgICAgICAgICAgKFsnb2JqZWN0JywgJ3N0cmluZyddLmluY2x1ZGVzKHR5cGVvZiByZXN1bHQuX2lkKSAmJiBfLmlzRW1wdHkocmVzdWx0Ll9pZCkpXG4gICAgICAgICAgICApIHtcbiAgICAgICAgICAgICAgcmVzdWx0Ll9pZCA9IG51bGw7XG4gICAgICAgICAgICB9XG4gICAgICAgICAgICByZXN1bHQub2JqZWN0SWQgPSByZXN1bHQuX2lkO1xuICAgICAgICAgICAgZGVsZXRlIHJlc3VsdC5faWQ7XG4gICAgICAgICAgfVxuICAgICAgICB9KTtcbiAgICAgICAgcmV0dXJuIHJlc3VsdHM7XG4gICAgICB9KVxuICAgICAgLnRoZW4ob2JqZWN0cyA9PiBvYmplY3RzLm1hcChvYmplY3QgPT4gbW9uZ29PYmplY3RUb1BhcnNlT2JqZWN0KGNsYXNzTmFtZSwgb2JqZWN0LCBzY2hlbWEpKSlcbiAgICAgIC5jYXRjaChlcnIgPT4gdGhpcy5oYW5kbGVFcnJvcihlcnIpKTtcbiAgfVxuXG4gIC8vIFRoaXMgZnVuY3Rpb24gd2lsbCByZWN1cnNpdmVseSB0cmF2ZXJzZSB0aGUgcGlwZWxpbmUgYW5kIGNvbnZlcnQgYW55IFBvaW50ZXIgb3IgRGF0ZSBjb2x1bW5zLlxuICAvLyBJZiB3ZSBkZXRlY3QgYSBwb2ludGVyIGNvbHVtbiB3ZSB3aWxsIHJlbmFtZSB0aGUgY29sdW1uIGJlaW5nIHF1ZXJpZWQgZm9yIHRvIG1hdGNoIHRoZSBjb2x1bW5cbiAgLy8gaW4gdGhlIGRhdGFiYXNlLiBXZSBhbHNvIG1vZGlmeSB0aGUgdmFsdWUgdG8gd2hhdCB3ZSBleHBlY3QgdGhlIHZhbHVlIHRvIGJlIGluIHRoZSBkYXRhYmFzZVxuICAvLyBhcyB3ZWxsLlxuICAvLyBGb3IgZGF0ZXMsIHRoZSBkcml2ZXIgZXhwZWN0cyBhIERhdGUgb2JqZWN0LCBidXQgd2UgaGF2ZSBhIHN0cmluZyBjb21pbmcgaW4uIFNvIHdlJ2xsIGNvbnZlcnRcbiAgLy8gdGhlIHN0cmluZyB0byBhIERhdGUgc28gdGhlIGRyaXZlciBjYW4gcGVyZm9ybSB0aGUgbmVjZXNzYXJ5IGNvbXBhcmlzb24uXG4gIC8vXG4gIC8vIFRoZSBnb2FsIG9mIHRoaXMgbWV0aG9kIGlzIHRvIGxvb2sgZm9yIHRoZSBcImxlYXZlc1wiIG9mIHRoZSBwaXBlbGluZSBhbmQgZGV0ZXJtaW5lIGlmIGl0IG5lZWRzXG4gIC8vIHRvIGJlIGNvbnZlcnRlZC4gVGhlIHBpcGVsaW5lIGNhbiBoYXZlIGEgZmV3IGRpZmZlcmVudCBmb3Jtcy4gRm9yIG1vcmUgZGV0YWlscywgc2VlOlxuICAvLyAgICAgaHR0cHM6Ly9kb2NzLm1vbmdvZGIuY29tL21hbnVhbC9yZWZlcmVuY2Uvb3BlcmF0b3IvYWdncmVnYXRpb24vXG4gIC8vXG4gIC8vIElmIHRoZSBwaXBlbGluZSBpcyBhbiBhcnJheSwgaXQgbWVhbnMgd2UgYXJlIHByb2JhYmx5IHBhcnNpbmcgYW4gJyRhbmQnIG9yICckb3InIG9wZXJhdG9yLiBJblxuICAvLyB0aGF0IGNhc2Ugd2UgbmVlZCB0byBsb29wIHRocm91Z2ggYWxsIG9mIGl0J3MgY2hpbGRyZW4gdG8gZmluZCB0aGUgY29sdW1ucyBiZWluZyBvcGVyYXRlZCBvbi5cbiAgLy8gSWYgdGhlIHBpcGVsaW5lIGlzIGFuIG9iamVjdCwgdGhlbiB3ZSdsbCBsb29wIHRocm91Z2ggdGhlIGtleXMgY2hlY2tpbmcgdG8gc2VlIGlmIHRoZSBrZXkgbmFtZVxuICAvLyBtYXRjaGVzIG9uZSBvZiB0aGUgc2NoZW1hIGNvbHVtbnMuIElmIGl0IGRvZXMgbWF0Y2ggYSBjb2x1bW4gYW5kIHRoZSBjb2x1bW4gaXMgYSBQb2ludGVyIG9yXG4gIC8vIGEgRGF0ZSwgdGhlbiB3ZSdsbCBjb252ZXJ0IHRoZSB2YWx1ZSBhcyBkZXNjcmliZWQgYWJvdmUuXG4gIC8vXG4gIC8vIEFzIG11Y2ggYXMgSSBoYXRlIHJlY3Vyc2lvbi4uLnRoaXMgc2VlbWVkIGxpa2UgYSBnb29kIGZpdCBmb3IgaXQuIFdlJ3JlIGVzc2VudGlhbGx5IHRyYXZlcnNpbmdcbiAgLy8gZG93biBhIHRyZWUgdG8gZmluZCBhIFwibGVhZiBub2RlXCIgYW5kIGNoZWNraW5nIHRvIHNlZSBpZiBpdCBuZWVkcyB0byBiZSBjb252ZXJ0ZWQuXG4gIF9wYXJzZUFnZ3JlZ2F0ZUFyZ3Moc2NoZW1hOiBhbnksIHBpcGVsaW5lOiBhbnkpOiBhbnkge1xuICAgIGlmIChwaXBlbGluZSA9PT0gbnVsbCkge1xuICAgICAgcmV0dXJuIG51bGw7XG4gICAgfSBlbHNlIGlmIChBcnJheS5pc0FycmF5KHBpcGVsaW5lKSkge1xuICAgICAgcmV0dXJuIHBpcGVsaW5lLm1hcCh2YWx1ZSA9PiB0aGlzLl9wYXJzZUFnZ3JlZ2F0ZUFyZ3Moc2NoZW1hLCB2YWx1ZSkpO1xuICAgIH0gZWxzZSBpZiAodHlwZW9mIHBpcGVsaW5lID09PSAnb2JqZWN0Jykge1xuICAgICAgY29uc3QgcmV0dXJuVmFsdWUgPSB7fTtcbiAgICAgIGZvciAoY29uc3QgZmllbGQgaW4gcGlwZWxpbmUpIHtcbiAgICAgICAgaWYgKHNjaGVtYS5maWVsZHNbZmllbGRdICYmIHNjaGVtYS5maWVsZHNbZmllbGRdLnR5cGUgPT09ICdQb2ludGVyJykge1xuICAgICAgICAgIGlmICh0eXBlb2YgcGlwZWxpbmVbZmllbGRdID09PSAnb2JqZWN0Jykge1xuICAgICAgICAgICAgLy8gUGFzcyBvYmplY3RzIGRvd24gdG8gTW9uZ29EQi4uLnRoaXMgaXMgbW9yZSB0aGFuIGxpa2VseSBhbiAkZXhpc3RzIG9wZXJhdG9yLlxuICAgICAgICAgICAgcmV0dXJuVmFsdWVbYF9wXyR7ZmllbGR9YF0gPSBwaXBlbGluZVtmaWVsZF07XG4gICAgICAgICAgfSBlbHNlIHtcbiAgICAgICAgICAgIHJldHVyblZhbHVlW2BfcF8ke2ZpZWxkfWBdID0gYCR7c2NoZW1hLmZpZWxkc1tmaWVsZF0udGFyZ2V0Q2xhc3N9JCR7cGlwZWxpbmVbZmllbGRdfWA7XG4gICAgICAgICAgfVxuICAgICAgICB9IGVsc2UgaWYgKHNjaGVtYS5maWVsZHNbZmllbGRdICYmIHNjaGVtYS5maWVsZHNbZmllbGRdLnR5cGUgPT09ICdEYXRlJykge1xuICAgICAgICAgIHJldHVyblZhbHVlW2ZpZWxkXSA9IHRoaXMuX2NvbnZlcnRUb0RhdGUocGlwZWxpbmVbZmllbGRdKTtcbiAgICAgICAgfSBlbHNlIHtcbiAgICAgICAgICByZXR1cm5WYWx1ZVtmaWVsZF0gPSB0aGlzLl9wYXJzZUFnZ3JlZ2F0ZUFyZ3Moc2NoZW1hLCBwaXBlbGluZVtmaWVsZF0pO1xuICAgICAgICB9XG5cbiAgICAgICAgaWYgKGZpZWxkID09PSAnb2JqZWN0SWQnKSB7XG4gICAgICAgICAgcmV0dXJuVmFsdWVbJ19pZCddID0gcmV0dXJuVmFsdWVbZmllbGRdO1xuICAgICAgICAgIGRlbGV0ZSByZXR1cm5WYWx1ZVtmaWVsZF07XG4gICAgICAgIH0gZWxzZSBpZiAoZmllbGQgPT09ICdjcmVhdGVkQXQnKSB7XG4gICAgICAgICAgcmV0dXJuVmFsdWVbJ19jcmVhdGVkX2F0J10gPSByZXR1cm5WYWx1ZVtmaWVsZF07XG4gICAgICAgICAgZGVsZXRlIHJldHVyblZhbHVlW2ZpZWxkXTtcbiAgICAgICAgfSBlbHNlIGlmIChmaWVsZCA9PT0gJ3VwZGF0ZWRBdCcpIHtcbiAgICAgICAgICByZXR1cm5WYWx1ZVsnX3VwZGF0ZWRfYXQnXSA9IHJldHVyblZhbHVlW2ZpZWxkXTtcbiAgICAgICAgICBkZWxldGUgcmV0dXJuVmFsdWVbZmllbGRdO1xuICAgICAgICB9XG4gICAgICB9XG4gICAgICByZXR1cm4gcmV0dXJuVmFsdWU7XG4gICAgfVxuICAgIHJldHVybiBwaXBlbGluZTtcbiAgfVxuXG4gIC8vIFRoaXMgZnVuY3Rpb24gaXMgc2xpZ2h0bHkgZGlmZmVyZW50IHRoYW4gdGhlIG9uZSBhYm92ZS4gUmF0aGVyIHRoYW4gdHJ5aW5nIHRvIGNvbWJpbmUgdGhlc2VcbiAgLy8gdHdvIGZ1bmN0aW9ucyBhbmQgbWFraW5nIHRoZSBjb2RlIGV2ZW4gaGFyZGVyIHRvIHVuZGVyc3RhbmQsIEkgZGVjaWRlZCB0byBzcGxpdCBpdCB1cC4gVGhlXG4gIC8vIGRpZmZlcmVuY2Ugd2l0aCB0aGlzIGZ1bmN0aW9uIGlzIHdlIGFyZSBub3QgdHJhbnNmb3JtaW5nIHRoZSB2YWx1ZXMsIG9ubHkgdGhlIGtleXMgb2YgdGhlXG4gIC8vIHBpcGVsaW5lLlxuICBfcGFyc2VBZ2dyZWdhdGVQcm9qZWN0QXJncyhzY2hlbWE6IGFueSwgcGlwZWxpbmU6IGFueSk6IGFueSB7XG4gICAgY29uc3QgcmV0dXJuVmFsdWUgPSB7fTtcbiAgICBmb3IgKGNvbnN0IGZpZWxkIGluIHBpcGVsaW5lKSB7XG4gICAgICBpZiAoc2NoZW1hLmZpZWxkc1tmaWVsZF0gJiYgc2NoZW1hLmZpZWxkc1tmaWVsZF0udHlwZSA9PT0gJ1BvaW50ZXInKSB7XG4gICAgICAgIHJldHVyblZhbHVlW2BfcF8ke2ZpZWxkfWBdID0gcGlwZWxpbmVbZmllbGRdO1xuICAgICAgfSBlbHNlIHtcbiAgICAgICAgcmV0dXJuVmFsdWVbZmllbGRdID0gdGhpcy5fcGFyc2VBZ2dyZWdhdGVBcmdzKHNjaGVtYSwgcGlwZWxpbmVbZmllbGRdKTtcbiAgICAgIH1cblxuICAgICAgaWYgKGZpZWxkID09PSAnb2JqZWN0SWQnKSB7XG4gICAgICAgIHJldHVyblZhbHVlWydfaWQnXSA9IHJldHVyblZhbHVlW2ZpZWxkXTtcbiAgICAgICAgZGVsZXRlIHJldHVyblZhbHVlW2ZpZWxkXTtcbiAgICAgIH0gZWxzZSBpZiAoZmllbGQgPT09ICdjcmVhdGVkQXQnKSB7XG4gICAgICAgIHJldHVyblZhbHVlWydfY3JlYXRlZF9hdCddID0gcmV0dXJuVmFsdWVbZmllbGRdO1xuICAgICAgICBkZWxldGUgcmV0dXJuVmFsdWVbZmllbGRdO1xuICAgICAgfSBlbHNlIGlmIChmaWVsZCA9PT0gJ3VwZGF0ZWRBdCcpIHtcbiAgICAgICAgcmV0dXJuVmFsdWVbJ191cGRhdGVkX2F0J10gPSByZXR1cm5WYWx1ZVtmaWVsZF07XG4gICAgICAgIGRlbGV0ZSByZXR1cm5WYWx1ZVtmaWVsZF07XG4gICAgICB9XG4gICAgfVxuICAgIHJldHVybiByZXR1cm5WYWx1ZTtcbiAgfVxuXG4gIC8vIFRoaXMgZnVuY3Rpb24gaXMgc2xpZ2h0bHkgZGlmZmVyZW50IHRoYW4gdGhlIHR3byBhYm92ZS4gTW9uZ29EQiAkZ3JvdXAgYWdncmVnYXRlIGxvb2tzIGxpa2U6XG4gIC8vICAgICB7ICRncm91cDogeyBfaWQ6IDxleHByZXNzaW9uPiwgPGZpZWxkMT46IHsgPGFjY3VtdWxhdG9yMT4gOiA8ZXhwcmVzc2lvbjE+IH0sIC4uLiB9IH1cbiAgLy8gVGhlIDxleHByZXNzaW9uPiBjb3VsZCBiZSBhIGNvbHVtbiBuYW1lLCBwcmVmaXhlZCB3aXRoIHRoZSAnJCcgY2hhcmFjdGVyLiBXZSdsbCBsb29rIGZvclxuICAvLyB0aGVzZSA8ZXhwcmVzc2lvbj4gYW5kIGNoZWNrIHRvIHNlZSBpZiBpdCBpcyBhICdQb2ludGVyJyBvciBpZiBpdCdzIG9uZSBvZiBjcmVhdGVkQXQsXG4gIC8vIHVwZGF0ZWRBdCBvciBvYmplY3RJZCBhbmQgY2hhbmdlIGl0IGFjY29yZGluZ2x5LlxuICBfcGFyc2VBZ2dyZWdhdGVHcm91cEFyZ3Moc2NoZW1hOiBhbnksIHBpcGVsaW5lOiBhbnkpOiBhbnkge1xuICAgIGlmIChBcnJheS5pc0FycmF5KHBpcGVsaW5lKSkge1xuICAgICAgcmV0dXJuIHBpcGVsaW5lLm1hcCh2YWx1ZSA9PiB0aGlzLl9wYXJzZUFnZ3JlZ2F0ZUdyb3VwQXJncyhzY2hlbWEsIHZhbHVlKSk7XG4gICAgfSBlbHNlIGlmICh0eXBlb2YgcGlwZWxpbmUgPT09ICdvYmplY3QnKSB7XG4gICAgICBjb25zdCByZXR1cm5WYWx1ZSA9IHt9O1xuICAgICAgZm9yIChjb25zdCBmaWVsZCBpbiBwaXBlbGluZSkge1xuICAgICAgICByZXR1cm5WYWx1ZVtmaWVsZF0gPSB0aGlzLl9wYXJzZUFnZ3JlZ2F0ZUdyb3VwQXJncyhzY2hlbWEsIHBpcGVsaW5lW2ZpZWxkXSk7XG4gICAgICB9XG4gICAgICByZXR1cm4gcmV0dXJuVmFsdWU7XG4gICAgfSBlbHNlIGlmICh0eXBlb2YgcGlwZWxpbmUgPT09ICdzdHJpbmcnKSB7XG4gICAgICBjb25zdCBmaWVsZCA9IHBpcGVsaW5lLnN1YnN0cmluZygxKTtcbiAgICAgIGlmIChzY2hlbWEuZmllbGRzW2ZpZWxkXSAmJiBzY2hlbWEuZmllbGRzW2ZpZWxkXS50eXBlID09PSAnUG9pbnRlcicpIHtcbiAgICAgICAgcmV0dXJuIGAkX3BfJHtmaWVsZH1gO1xuICAgICAgfSBlbHNlIGlmIChmaWVsZCA9PSAnY3JlYXRlZEF0Jykge1xuICAgICAgICByZXR1cm4gJyRfY3JlYXRlZF9hdCc7XG4gICAgICB9IGVsc2UgaWYgKGZpZWxkID09ICd1cGRhdGVkQXQnKSB7XG4gICAgICAgIHJldHVybiAnJF91cGRhdGVkX2F0JztcbiAgICAgIH1cbiAgICB9XG4gICAgcmV0dXJuIHBpcGVsaW5lO1xuICB9XG5cbiAgLy8gVGhpcyBmdW5jdGlvbiB3aWxsIGF0dGVtcHQgdG8gY29udmVydCB0aGUgcHJvdmlkZWQgdmFsdWUgdG8gYSBEYXRlIG9iamVjdC4gU2luY2UgdGhpcyBpcyBwYXJ0XG4gIC8vIG9mIGFuIGFnZ3JlZ2F0aW9uIHBpcGVsaW5lLCB0aGUgdmFsdWUgY2FuIGVpdGhlciBiZSBhIHN0cmluZyBvciBpdCBjYW4gYmUgYW5vdGhlciBvYmplY3Qgd2l0aFxuICAvLyBhbiBvcGVyYXRvciBpbiBpdCAobGlrZSAkZ3QsICRsdCwgZXRjKS4gQmVjYXVzZSBvZiB0aGlzIEkgZmVsdCBpdCB3YXMgZWFzaWVyIHRvIG1ha2UgdGhpcyBhXG4gIC8vIHJlY3Vyc2l2ZSBtZXRob2QgdG8gdHJhdmVyc2UgZG93biB0byB0aGUgXCJsZWFmIG5vZGVcIiB3aGljaCBpcyBnb2luZyB0byBiZSB0aGUgc3RyaW5nLlxuICBfY29udmVydFRvRGF0ZSh2YWx1ZTogYW55KTogYW55IHtcbiAgICBpZiAodmFsdWUgaW5zdGFuY2VvZiBEYXRlKSB7XG4gICAgICByZXR1cm4gdmFsdWU7XG4gICAgfVxuICAgIGlmICh0eXBlb2YgdmFsdWUgPT09ICdzdHJpbmcnKSB7XG4gICAgICByZXR1cm4gbmV3IERhdGUodmFsdWUpO1xuICAgIH1cblxuICAgIGNvbnN0IHJldHVyblZhbHVlID0ge307XG4gICAgZm9yIChjb25zdCBmaWVsZCBpbiB2YWx1ZSkge1xuICAgICAgcmV0dXJuVmFsdWVbZmllbGRdID0gdGhpcy5fY29udmVydFRvRGF0ZSh2YWx1ZVtmaWVsZF0pO1xuICAgIH1cbiAgICByZXR1cm4gcmV0dXJuVmFsdWU7XG4gIH1cblxuICBfcGFyc2VSZWFkUHJlZmVyZW5jZShyZWFkUHJlZmVyZW5jZTogP3N0cmluZyk6ID9zdHJpbmcge1xuICAgIGlmIChyZWFkUHJlZmVyZW5jZSkge1xuICAgICAgcmVhZFByZWZlcmVuY2UgPSByZWFkUHJlZmVyZW5jZS50b1VwcGVyQ2FzZSgpO1xuICAgIH1cbiAgICBzd2l0Y2ggKHJlYWRQcmVmZXJlbmNlKSB7XG4gICAgICBjYXNlICdQUklNQVJZJzpcbiAgICAgICAgcmVhZFByZWZlcmVuY2UgPSBSZWFkUHJlZmVyZW5jZS5QUklNQVJZO1xuICAgICAgICBicmVhaztcbiAgICAgIGNhc2UgJ1BSSU1BUllfUFJFRkVSUkVEJzpcbiAgICAgICAgcmVhZFByZWZlcmVuY2UgPSBSZWFkUHJlZmVyZW5jZS5QUklNQVJZX1BSRUZFUlJFRDtcbiAgICAgICAgYnJlYWs7XG4gICAgICBjYXNlICdTRUNPTkRBUlknOlxuICAgICAgICByZWFkUHJlZmVyZW5jZSA9IFJlYWRQcmVmZXJlbmNlLlNFQ09OREFSWTtcbiAgICAgICAgYnJlYWs7XG4gICAgICBjYXNlICdTRUNPTkRBUllfUFJFRkVSUkVEJzpcbiAgICAgICAgcmVhZFByZWZlcmVuY2UgPSBSZWFkUHJlZmVyZW5jZS5TRUNPTkRBUllfUFJFRkVSUkVEO1xuICAgICAgICBicmVhaztcbiAgICAgIGNhc2UgJ05FQVJFU1QnOlxuICAgICAgICByZWFkUHJlZmVyZW5jZSA9IFJlYWRQcmVmZXJlbmNlLk5FQVJFU1Q7XG4gICAgICAgIGJyZWFrO1xuICAgICAgY2FzZSB1bmRlZmluZWQ6XG4gICAgICBjYXNlIG51bGw6XG4gICAgICBjYXNlICcnOlxuICAgICAgICBicmVhaztcbiAgICAgIGRlZmF1bHQ6XG4gICAgICAgIHRocm93IG5ldyBQYXJzZS5FcnJvcihQYXJzZS5FcnJvci5JTlZBTElEX1FVRVJZLCAnTm90IHN1cHBvcnRlZCByZWFkIHByZWZlcmVuY2UuJyk7XG4gICAgfVxuICAgIHJldHVybiByZWFkUHJlZmVyZW5jZTtcbiAgfVxuXG4gIHBlcmZvcm1Jbml0aWFsaXphdGlvbigpOiBQcm9taXNlPHZvaWQ+IHtcbiAgICByZXR1cm4gUHJvbWlzZS5yZXNvbHZlKCk7XG4gIH1cblxuICBjcmVhdGVJbmRleChjbGFzc05hbWU6IHN0cmluZywgaW5kZXg6IGFueSkge1xuICAgIHJldHVybiB0aGlzLl9hZGFwdGl2ZUNvbGxlY3Rpb24oY2xhc3NOYW1lKVxuICAgICAgLnRoZW4oY29sbGVjdGlvbiA9PiBjb2xsZWN0aW9uLl9tb25nb0NvbGxlY3Rpb24uY3JlYXRlSW5kZXgoaW5kZXgpKVxuICAgICAgLmNhdGNoKGVyciA9PiB0aGlzLmhhbmRsZUVycm9yKGVycikpO1xuICB9XG5cbiAgY3JlYXRlSW5kZXhlcyhjbGFzc05hbWU6IHN0cmluZywgaW5kZXhlczogYW55KSB7XG4gICAgcmV0dXJuIHRoaXMuX2FkYXB0aXZlQ29sbGVjdGlvbihjbGFzc05hbWUpXG4gICAgICAudGhlbihjb2xsZWN0aW9uID0+IGNvbGxlY3Rpb24uX21vbmdvQ29sbGVjdGlvbi5jcmVhdGVJbmRleGVzKGluZGV4ZXMpKVxuICAgICAgLmNhdGNoKGVyciA9PiB0aGlzLmhhbmRsZUVycm9yKGVycikpO1xuICB9XG5cbiAgY3JlYXRlSW5kZXhlc0lmTmVlZGVkKGNsYXNzTmFtZTogc3RyaW5nLCBmaWVsZE5hbWU6IHN0cmluZywgdHlwZTogYW55KSB7XG4gICAgaWYgKHR5cGUgJiYgdHlwZS50eXBlID09PSAnUG9seWdvbicpIHtcbiAgICAgIGNvbnN0IGluZGV4ID0ge1xuICAgICAgICBbZmllbGROYW1lXTogJzJkc3BoZXJlJyxcbiAgICAgIH07XG4gICAgICByZXR1cm4gdGhpcy5jcmVhdGVJbmRleChjbGFzc05hbWUsIGluZGV4KTtcbiAgICB9XG4gICAgcmV0dXJuIFByb21pc2UucmVzb2x2ZSgpO1xuICB9XG5cbiAgY3JlYXRlVGV4dEluZGV4ZXNJZk5lZWRlZChjbGFzc05hbWU6IHN0cmluZywgcXVlcnk6IFF1ZXJ5VHlwZSwgc2NoZW1hOiBhbnkpOiBQcm9taXNlPHZvaWQ+IHtcbiAgICBmb3IgKGNvbnN0IGZpZWxkTmFtZSBpbiBxdWVyeSkge1xuICAgICAgaWYgKCFxdWVyeVtmaWVsZE5hbWVdIHx8ICFxdWVyeVtmaWVsZE5hbWVdLiR0ZXh0KSB7XG4gICAgICAgIGNvbnRpbnVlO1xuICAgICAgfVxuICAgICAgY29uc3QgZXhpc3RpbmdJbmRleGVzID0gc2NoZW1hLmluZGV4ZXM7XG4gICAgICBmb3IgKGNvbnN0IGtleSBpbiBleGlzdGluZ0luZGV4ZXMpIHtcbiAgICAgICAgY29uc3QgaW5kZXggPSBleGlzdGluZ0luZGV4ZXNba2V5XTtcbiAgICAgICAgaWYgKE9iamVjdC5wcm90b3R5cGUuaGFzT3duUHJvcGVydHkuY2FsbChpbmRleCwgZmllbGROYW1lKSkge1xuICAgICAgICAgIHJldHVybiBQcm9taXNlLnJlc29sdmUoKTtcbiAgICAgICAgfVxuICAgICAgfVxuICAgICAgY29uc3QgaW5kZXhOYW1lID0gYCR7ZmllbGROYW1lfV90ZXh0YDtcbiAgICAgIGNvbnN0IHRleHRJbmRleCA9IHtcbiAgICAgICAgW2luZGV4TmFtZV06IHsgW2ZpZWxkTmFtZV06ICd0ZXh0JyB9LFxuICAgICAgfTtcbiAgICAgIHJldHVybiB0aGlzLnNldEluZGV4ZXNXaXRoU2NoZW1hRm9ybWF0KFxuICAgICAgICBjbGFzc05hbWUsXG4gICAgICAgIHRleHRJbmRleCxcbiAgICAgICAgZXhpc3RpbmdJbmRleGVzLFxuICAgICAgICBzY2hlbWEuZmllbGRzXG4gICAgICApLmNhdGNoKGVycm9yID0+IHtcbiAgICAgICAgaWYgKGVycm9yLmNvZGUgPT09IDg1KSB7XG4gICAgICAgICAgLy8gSW5kZXggZXhpc3Qgd2l0aCBkaWZmZXJlbnQgb3B0aW9uc1xuICAgICAgICAgIHJldHVybiB0aGlzLnNldEluZGV4ZXNGcm9tTW9uZ28oY2xhc3NOYW1lKTtcbiAgICAgICAgfVxuICAgICAgICB0aHJvdyBlcnJvcjtcbiAgICAgIH0pO1xuICAgIH1cbiAgICByZXR1cm4gUHJvbWlzZS5yZXNvbHZlKCk7XG4gIH1cblxuICBnZXRJbmRleGVzKGNsYXNzTmFtZTogc3RyaW5nKSB7XG4gICAgcmV0dXJuIHRoaXMuX2FkYXB0aXZlQ29sbGVjdGlvbihjbGFzc05hbWUpXG4gICAgICAudGhlbihjb2xsZWN0aW9uID0+IGNvbGxlY3Rpb24uX21vbmdvQ29sbGVjdGlvbi5pbmRleGVzKCkpXG4gICAgICAuY2F0Y2goZXJyID0+IHRoaXMuaGFuZGxlRXJyb3IoZXJyKSk7XG4gIH1cblxuICBkcm9wSW5kZXgoY2xhc3NOYW1lOiBzdHJpbmcsIGluZGV4OiBhbnkpIHtcbiAgICByZXR1cm4gdGhpcy5fYWRhcHRpdmVDb2xsZWN0aW9uKGNsYXNzTmFtZSlcbiAgICAgIC50aGVuKGNvbGxlY3Rpb24gPT4gY29sbGVjdGlvbi5fbW9uZ29Db2xsZWN0aW9uLmRyb3BJbmRleChpbmRleCkpXG4gICAgICAuY2F0Y2goZXJyID0+IHRoaXMuaGFuZGxlRXJyb3IoZXJyKSk7XG4gIH1cblxuICBkcm9wQWxsSW5kZXhlcyhjbGFzc05hbWU6IHN0cmluZykge1xuICAgIHJldHVybiB0aGlzLl9hZGFwdGl2ZUNvbGxlY3Rpb24oY2xhc3NOYW1lKVxuICAgICAgLnRoZW4oY29sbGVjdGlvbiA9PiBjb2xsZWN0aW9uLl9tb25nb0NvbGxlY3Rpb24uZHJvcEluZGV4ZXMoKSlcbiAgICAgIC5jYXRjaChlcnIgPT4gdGhpcy5oYW5kbGVFcnJvcihlcnIpKTtcbiAgfVxuXG4gIHVwZGF0ZVNjaGVtYVdpdGhJbmRleGVzKCk6IFByb21pc2U8YW55PiB7XG4gICAgcmV0dXJuIHRoaXMuZ2V0QWxsQ2xhc3NlcygpXG4gICAgICAudGhlbihjbGFzc2VzID0+IHtcbiAgICAgICAgY29uc3QgcHJvbWlzZXMgPSBjbGFzc2VzLm1hcChzY2hlbWEgPT4ge1xuICAgICAgICAgIHJldHVybiB0aGlzLnNldEluZGV4ZXNGcm9tTW9uZ28oc2NoZW1hLmNsYXNzTmFtZSk7XG4gICAgICAgIH0pO1xuICAgICAgICByZXR1cm4gUHJvbWlzZS5hbGwocHJvbWlzZXMpO1xuICAgICAgfSlcbiAgICAgIC5jYXRjaChlcnIgPT4gdGhpcy5oYW5kbGVFcnJvcihlcnIpKTtcbiAgfVxuXG4gIGNyZWF0ZVRyYW5zYWN0aW9uYWxTZXNzaW9uKCk6IFByb21pc2U8YW55PiB7XG4gICAgY29uc3QgdHJhbnNhY3Rpb25hbFNlY3Rpb24gPSB0aGlzLmNsaWVudC5zdGFydFNlc3Npb24oKTtcbiAgICB0cmFuc2FjdGlvbmFsU2VjdGlvbi5zdGFydFRyYW5zYWN0aW9uKCk7XG4gICAgcmV0dXJuIFByb21pc2UucmVzb2x2ZSh0cmFuc2FjdGlvbmFsU2VjdGlvbik7XG4gIH1cblxuICBjb21taXRUcmFuc2FjdGlvbmFsU2Vzc2lvbih0cmFuc2FjdGlvbmFsU2VjdGlvbjogYW55KTogUHJvbWlzZTx2b2lkPiB7XG4gICAgY29uc3QgY29tbWl0ID0gcmV0cmllcyA9PiB7XG4gICAgICByZXR1cm4gdHJhbnNhY3Rpb25hbFNlY3Rpb25cbiAgICAgICAgLmNvbW1pdFRyYW5zYWN0aW9uKClcbiAgICAgICAgLmNhdGNoKGVycm9yID0+IHtcbiAgICAgICAgICBpZiAoZXJyb3IgJiYgZXJyb3IuaGFzRXJyb3JMYWJlbCgnVHJhbnNpZW50VHJhbnNhY3Rpb25FcnJvcicpICYmIHJldHJpZXMgPiAwKSB7XG4gICAgICAgICAgICByZXR1cm4gY29tbWl0KHJldHJpZXMgLSAxKTtcbiAgICAgICAgICB9XG4gICAgICAgICAgdGhyb3cgZXJyb3I7XG4gICAgICAgIH0pXG4gICAgICAgIC50aGVuKCgpID0+IHtcbiAgICAgICAgICB0cmFuc2FjdGlvbmFsU2VjdGlvbi5lbmRTZXNzaW9uKCk7XG4gICAgICAgIH0pO1xuICAgIH07XG4gICAgcmV0dXJuIGNvbW1pdCg1KTtcbiAgfVxuXG4gIGFib3J0VHJhbnNhY3Rpb25hbFNlc3Npb24odHJhbnNhY3Rpb25hbFNlY3Rpb246IGFueSk6IFByb21pc2U8dm9pZD4ge1xuICAgIHJldHVybiB0cmFuc2FjdGlvbmFsU2VjdGlvbi5hYm9ydFRyYW5zYWN0aW9uKCkudGhlbigoKSA9PiB7XG4gICAgICB0cmFuc2FjdGlvbmFsU2VjdGlvbi5lbmRTZXNzaW9uKCk7XG4gICAgfSk7XG4gIH1cbn1cblxuZXhwb3J0IGRlZmF1bHQgTW9uZ29TdG9yYWdlQWRhcHRlcjtcbiJdLCJtYXBwaW5ncyI6Ijs7Ozs7O0FBQ0EsSUFBQUEsZ0JBQUEsR0FBQUMsc0JBQUEsQ0FBQUMsT0FBQTtBQUNBLElBQUFDLHNCQUFBLEdBQUFGLHNCQUFBLENBQUFDLE9BQUE7QUFDQSxJQUFBRSxlQUFBLEdBQUFGLE9BQUE7QUFFQSxJQUFBRyxXQUFBLEdBQUFILE9BQUE7QUFDQSxJQUFBSSxlQUFBLEdBQUFKLE9BQUE7QUFTQSxJQUFBSyxLQUFBLEdBQUFOLHNCQUFBLENBQUFDLE9BQUE7QUFFQSxJQUFBTSxPQUFBLEdBQUFQLHNCQUFBLENBQUFDLE9BQUE7QUFDQSxJQUFBTyxTQUFBLEdBQUFSLHNCQUFBLENBQUFDLE9BQUE7QUFDQSxJQUFBUSxPQUFBLEdBQUFULHNCQUFBLENBQUFDLE9BQUE7QUFBcUMsU0FBQUQsdUJBQUFVLEdBQUEsV0FBQUEsR0FBQSxJQUFBQSxHQUFBLENBQUFDLFVBQUEsR0FBQUQsR0FBQSxLQUFBRSxPQUFBLEVBQUFGLEdBQUE7QUFBQSxTQUFBRyxRQUFBQyxNQUFBLEVBQUFDLGNBQUEsUUFBQUMsSUFBQSxHQUFBQyxNQUFBLENBQUFELElBQUEsQ0FBQUYsTUFB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