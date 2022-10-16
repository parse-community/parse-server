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

function ownKeys(object, enumerableOnly) { var keys = Object.keys(object); if (Object.getOwnPropertySymbols) { var symbols = Object.getOwnPropertySymbols(object); if (enumerableOnly) { symbols = symbols.filter(function (sym) { return Object.getOwnPropertyDescriptor(object, sym).enumerable; }); } keys.push.apply(keys, symbols); } return keys; }

function _objectSpread(target) { for (var i = 1; i < arguments.length; i++) { var source = arguments[i] != null ? arguments[i] : {}; if (i % 2) { ownKeys(Object(source), true).forEach(function (key) { _defineProperty(target, key, source[key]); }); } else if (Object.getOwnPropertyDescriptors) { Object.defineProperties(target, Object.getOwnPropertyDescriptors(source)); } else { ownKeys(Object(source)).forEach(function (key) { Object.defineProperty(target, key, Object.getOwnPropertyDescriptor(source, key)); }); } } return target; }

function _defineProperty(obj, key, value) { if (key in obj) { Object.defineProperty(obj, key, { value: value, enumerable: true, configurable: true, writable: true }); } else { obj[key] = value; } return obj; }

function _objectWithoutProperties(source, excluded) { if (source == null) return {}; var target = _objectWithoutPropertiesLoose(source, excluded); var key, i; if (Object.getOwnPropertySymbols) { var sourceSymbolKeys = Object.getOwnPropertySymbols(source); for (i = 0; i < sourceSymbolKeys.length; i++) { key = sourceSymbolKeys[i]; if (excluded.indexOf(key) >= 0) continue; if (!Object.prototype.propertyIsEnumerable.call(source, key)) continue; target[key] = source[key]; } } return target; }

function _objectWithoutPropertiesLoose(source, excluded) { if (source == null) return {}; var target = {}; var sourceKeys = Object.keys(source); var key, i; for (i = 0; i < sourceKeys.length; i++) { key = sourceKeys[i]; if (excluded.indexOf(key) >= 0) continue; target[key] = source[key]; } return target; }

function _extends() { _extends = Object.assign || function (target) { for (var i = 1; i < arguments.length; i++) { var source = arguments[i]; for (var key in source) { if (Object.prototype.hasOwnProperty.call(source, key)) { target[key] = source[key]; } } } return target; }; return _extends.apply(this, arguments); }

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
      } // TODO: If you have one app with a collection prefix that happens to be a prefix of another
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
}; // Returns { code, error } if invalid, or { result }, an object
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
    this._mongoOptions = mongoOptions;
    this._mongoOptions.useNewUrlParser = true;
    this._mongoOptions.useUnifiedTopology = true;

    this._onchange = () => {}; // MaxTimeMS is not a global MongoDB client option, it is applied per operation.


    this._maxTimeMS = mongoOptions.maxTimeMS;
    this.canSortOnJoinTables = true;
    this.enableSchemaHooks = !!mongoOptions.enableSchemaHooks;
    this.disableIndexFieldValidation = !!mongoOptions.disableIndexFieldValidation;
    delete mongoOptions.enableSchemaHooks;
    delete mongoOptions.disableIndexFieldValidation;
    delete mongoOptions.maxTimeMS;
  }

  watch(callback) {
    this._onchange = callback;
  }

  connect() {
    if (this.connectionPromise) {
      return this.connectionPromise;
    } // parsing and re-formatting causes the auth value (if there) to get URI
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

  handleShutdown() {
    if (!this.client) {
      return Promise.resolve();
    }

    return this.client.close(false);
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
  } // Drops a collection. Resolves with true if it was a Parse Schema (eg. _User, Custom, etc.)
  // and resolves with false if it wasn't (eg. a join table). Rejects if deletion was impossible.


  deleteClass(className) {
    return this._adaptiveCollection(className).then(collection => collection.drop()).catch(error => {
      // 'ns not found' means collection was already gone. Ignore deletion attempt.
      if (error.message == 'ns not found') {
        return;
      }

      throw error;
    }) // We've dropped the collection, now remove the _SCHEMA document
    .then(() => this._schemaCollection()).then(schemaCollection => schemaCollection.findAndDeleteSchema(className)).catch(err => this.handleError(err));
  }

  deleteAllClasses(fast) {
    return storageAdapterAllCollections(this).then(collections => Promise.all(collections.map(collection => fast ? collection.deleteMany({}) : collection.drop())));
  } // Remove the column and all the data. For Relations, the _Join collection is handled
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
  } // Return a promise for all schemas known to this adapter, in Parse format. In case the
  // schemas cannot be retrieved, returns a promise that rejects. Requirements for the
  // rejection reason are TBD.


  getAllClasses() {
    return this._schemaCollection().then(schemasCollection => schemasCollection._fetchAllSchemasFrom_SCHEMA()).catch(err => this.handleError(err));
  } // Return a promise for the schema with the given name, in Parse format. If
  // this adapter doesn't know about the schema, return a promise that rejects with
  // undefined as the reason.


  getClass(className) {
    return this._schemaCollection().then(schemasCollection => schemasCollection._fetchOneSchemaFrom_SCHEMA(className)).catch(err => this.handleError(err));
  } // TODO: As yet not particularly well specified. Creates an object. Maybe shouldn't even need the schema,
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
  } // Remove all objects that match the given Parse Query.
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
  } // Apply the update to all objects that match the given Parse Query.


  updateObjectsByQuery(className, schema, query, update, transactionalSession) {
    schema = convertParseSchemaToMongoSchema(schema);
    const mongoUpdate = (0, _MongoTransform.transformUpdate)(className, update, schema);
    const mongoWhere = (0, _MongoTransform.transformWhere)(className, query, schema);
    return this._adaptiveCollection(className).then(collection => collection.updateMany(mongoWhere, mongoUpdate, transactionalSession)).catch(err => this.handleError(err));
  } // Atomically finds and updates an object based on query.
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
  } // Hopefully we can get rid of this. It's only used for config and hooks.


  upsertOneObject(className, schema, query, update, transactionalSession) {
    schema = convertParseSchemaToMongoSchema(schema);
    const mongoUpdate = (0, _MongoTransform.transformUpdate)(className, update, schema);
    const mongoWhere = (0, _MongoTransform.transformWhere)(className, query, schema);
    return this._adaptiveCollection(className).then(collection => collection.upsertOne(mongoWhere, mongoUpdate, transactionalSession)).catch(err => this.handleError(err));
  } // Executes a find. Accepts: className, query in Parse format, and { skip, limit, sort }.


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
    }, {}); // If we aren't requesting the `_id` field, we need to explicitly opt out
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
  } // Create a unique index. Unique indexes on nullable fields are not allowed. Since we don't
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
  } // Used in tests


  _rawFind(className, query) {
    return this._adaptiveCollection(className).then(collection => collection.find(query, {
      maxTimeMS: this._maxTimeMS
    })).catch(err => this.handleError(err));
  } // Executes a count.


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
  } // This function will recursively traverse the pipeline and convert any Pointer or Date columns.
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
  } // This function is slightly different than the one above. Rather than trying to combine these
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
  } // This function is slightly different than the two above. MongoDB $group aggregate looks like:
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
  } // This function will attempt to convert the provided value to a Date object. Since this is part
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
//# sourceMappingURL=data:application/json;charset=utf-8;base64,eyJ2ZXJzaW9uIjozLCJzb3VyY2VzIjpbIi4uLy4uLy4uLy4uL3NyYy9BZGFwdGVycy9TdG9yYWdlL01vbmdvL01vbmdvU3RvcmFnZUFkYXB0ZXIuanMiXSwibmFtZXMiOlsibW9uZ29kYiIsInJlcXVpcmUiLCJNb25nb0NsaWVudCIsIlJlYWRQcmVmZXJlbmNlIiwiTW9uZ29TY2hlbWFDb2xsZWN0aW9uTmFtZSIsInN0b3JhZ2VBZGFwdGVyQWxsQ29sbGVjdGlvbnMiLCJtb25nb0FkYXB0ZXIiLCJjb25uZWN0IiwidGhlbiIsImRhdGFiYXNlIiwiY29sbGVjdGlvbnMiLCJmaWx0ZXIiLCJjb2xsZWN0aW9uIiwibmFtZXNwYWNlIiwibWF0Y2giLCJjb2xsZWN0aW9uTmFtZSIsImluZGV4T2YiLCJfY29sbGVjdGlvblByZWZpeCIsImNvbnZlcnRQYXJzZVNjaGVtYVRvTW9uZ29TY2hlbWEiLCJzY2hlbWEiLCJmaWVsZHMiLCJfcnBlcm0iLCJfd3Blcm0iLCJjbGFzc05hbWUiLCJfaGFzaGVkX3Bhc3N3b3JkIiwibW9uZ29TY2hlbWFGcm9tRmllbGRzQW5kQ2xhc3NOYW1lQW5kQ0xQIiwiY2xhc3NMZXZlbFBlcm1pc3Npb25zIiwiaW5kZXhlcyIsIm1vbmdvT2JqZWN0IiwiX2lkIiwib2JqZWN0SWQiLCJ1cGRhdGVkQXQiLCJjcmVhdGVkQXQiLCJfbWV0YWRhdGEiLCJ1bmRlZmluZWQiLCJmaWVsZE5hbWUiLCJ0eXBlIiwidGFyZ2V0Q2xhc3MiLCJmaWVsZE9wdGlvbnMiLCJNb25nb1NjaGVtYUNvbGxlY3Rpb24iLCJwYXJzZUZpZWxkVHlwZVRvTW9uZ29GaWVsZFR5cGUiLCJPYmplY3QiLCJrZXlzIiwibGVuZ3RoIiwiZmllbGRzX29wdGlvbnMiLCJjbGFzc19wZXJtaXNzaW9ucyIsInZhbGlkYXRlRXhwbGFpblZhbHVlIiwiZXhwbGFpbiIsImV4cGxhaW5BbGxvd2VkVmFsdWVzIiwiaW5jbHVkZXMiLCJQYXJzZSIsIkVycm9yIiwiSU5WQUxJRF9RVUVSWSIsIk1vbmdvU3RvcmFnZUFkYXB0ZXIiLCJjb25zdHJ1Y3RvciIsInVyaSIsImRlZmF1bHRzIiwiRGVmYXVsdE1vbmdvVVJJIiwiY29sbGVjdGlvblByZWZpeCIsIm1vbmdvT3B0aW9ucyIsIl91cmkiLCJfbW9uZ29PcHRpb25zIiwidXNlTmV3VXJsUGFyc2VyIiwidXNlVW5pZmllZFRvcG9sb2d5IiwiX29uY2hhbmdlIiwiX21heFRpbWVNUyIsIm1heFRpbWVNUyIsImNhblNvcnRPbkpvaW5UYWJsZXMiLCJlbmFibGVTY2hlbWFIb29rcyIsImRpc2FibGVJbmRleEZpZWxkVmFsaWRhdGlvbiIsIndhdGNoIiwiY2FsbGJhY2siLCJjb25uZWN0aW9uUHJvbWlzZSIsImVuY29kZWRVcmkiLCJjbGllbnQiLCJvcHRpb25zIiwicyIsImRiIiwiZGJOYW1lIiwib24iLCJjYXRjaCIsImVyciIsIlByb21pc2UiLCJyZWplY3QiLCJoYW5kbGVFcnJvciIsImVycm9yIiwiY29kZSIsImxvZ2dlciIsImhhbmRsZVNodXRkb3duIiwicmVzb2x2ZSIsImNsb3NlIiwiX2FkYXB0aXZlQ29sbGVjdGlvbiIsIm5hbWUiLCJyYXdDb2xsZWN0aW9uIiwiTW9uZ29Db2xsZWN0aW9uIiwiX3NjaGVtYUNvbGxlY3Rpb24iLCJfc3RyZWFtIiwiX21vbmdvQ29sbGVjdGlvbiIsImNsYXNzRXhpc3RzIiwibGlzdENvbGxlY3Rpb25zIiwidG9BcnJheSIsInNldENsYXNzTGV2ZWxQZXJtaXNzaW9ucyIsIkNMUHMiLCJzY2hlbWFDb2xsZWN0aW9uIiwidXBkYXRlU2NoZW1hIiwiJHNldCIsInNldEluZGV4ZXNXaXRoU2NoZW1hRm9ybWF0Iiwic3VibWl0dGVkSW5kZXhlcyIsImV4aXN0aW5nSW5kZXhlcyIsIl9pZF8iLCJkZWxldGVQcm9taXNlcyIsImluc2VydGVkSW5kZXhlcyIsImZvckVhY2giLCJmaWVsZCIsIl9fb3AiLCJwcm9taXNlIiwiZHJvcEluZGV4IiwicHVzaCIsImtleSIsInByb3RvdHlwZSIsImhhc093blByb3BlcnR5IiwiY2FsbCIsInJlcGxhY2UiLCJpbnNlcnRQcm9taXNlIiwiY3JlYXRlSW5kZXhlcyIsImFsbCIsInNldEluZGV4ZXNGcm9tTW9uZ28iLCJnZXRJbmRleGVzIiwicmVkdWNlIiwib2JqIiwiaW5kZXgiLCJfZnRzIiwiX2Z0c3giLCJ3ZWlnaHRzIiwiY3JlYXRlQ2xhc3MiLCJpbnNlcnRTY2hlbWEiLCJ1cGRhdGVGaWVsZE9wdGlvbnMiLCJhZGRGaWVsZElmTm90RXhpc3RzIiwiY3JlYXRlSW5kZXhlc0lmTmVlZGVkIiwiZGVsZXRlQ2xhc3MiLCJkcm9wIiwibWVzc2FnZSIsImZpbmRBbmREZWxldGVTY2hlbWEiLCJkZWxldGVBbGxDbGFzc2VzIiwiZmFzdCIsIm1hcCIsImRlbGV0ZU1hbnkiLCJkZWxldGVGaWVsZHMiLCJmaWVsZE5hbWVzIiwibW9uZ29Gb3JtYXROYW1lcyIsImNvbGxlY3Rpb25VcGRhdGUiLCIkdW5zZXQiLCJjb2xsZWN0aW9uRmlsdGVyIiwiJG9yIiwiJGV4aXN0cyIsInNjaGVtYVVwZGF0ZSIsInVwZGF0ZU1hbnkiLCJnZXRBbGxDbGFzc2VzIiwic2NoZW1hc0NvbGxlY3Rpb24iLCJfZmV0Y2hBbGxTY2hlbWFzRnJvbV9TQ0hFTUEiLCJnZXRDbGFzcyIsIl9mZXRjaE9uZVNjaGVtYUZyb21fU0NIRU1BIiwiY3JlYXRlT2JqZWN0Iiwib2JqZWN0IiwidHJhbnNhY3Rpb25hbFNlc3Npb24iLCJpbnNlcnRPbmUiLCJvcHMiLCJEVVBMSUNBVEVfVkFMVUUiLCJ1bmRlcmx5aW5nRXJyb3IiLCJtYXRjaGVzIiwiQXJyYXkiLCJpc0FycmF5IiwidXNlckluZm8iLCJkdXBsaWNhdGVkX2ZpZWxkIiwiZGVsZXRlT2JqZWN0c0J5UXVlcnkiLCJxdWVyeSIsIm1vbmdvV2hlcmUiLCJkZWxldGVkQ291bnQiLCJPQkpFQ1RfTk9UX0ZPVU5EIiwiSU5URVJOQUxfU0VSVkVSX0VSUk9SIiwidXBkYXRlT2JqZWN0c0J5UXVlcnkiLCJ1cGRhdGUiLCJtb25nb1VwZGF0ZSIsImZpbmRPbmVBbmRVcGRhdGUiLCJyZXR1cm5Eb2N1bWVudCIsInNlc3Npb24iLCJyZXN1bHQiLCJ2YWx1ZSIsInVwc2VydE9uZU9iamVjdCIsInVwc2VydE9uZSIsImZpbmQiLCJza2lwIiwibGltaXQiLCJzb3J0IiwicmVhZFByZWZlcmVuY2UiLCJoaW50IiwiY2FzZUluc2Vuc2l0aXZlIiwibW9uZ29Tb3J0IiwiXyIsIm1hcEtleXMiLCJtb25nb0tleXMiLCJtZW1vIiwiX3BhcnNlUmVhZFByZWZlcmVuY2UiLCJjcmVhdGVUZXh0SW5kZXhlc0lmTmVlZGVkIiwib2JqZWN0cyIsImVuc3VyZUluZGV4IiwiaW5kZXhOYW1lIiwiaW5kZXhDcmVhdGlvblJlcXVlc3QiLCJtb25nb0ZpZWxkTmFtZXMiLCJpbmRleFR5cGUiLCJkZWZhdWx0T3B0aW9ucyIsImJhY2tncm91bmQiLCJzcGFyc2UiLCJpbmRleE5hbWVPcHRpb25zIiwidHRsT3B0aW9ucyIsInR0bCIsImV4cGlyZUFmdGVyU2Vjb25kcyIsImNhc2VJbnNlbnNpdGl2ZU9wdGlvbnMiLCJjb2xsYXRpb24iLCJjYXNlSW5zZW5zaXRpdmVDb2xsYXRpb24iLCJpbmRleE9wdGlvbnMiLCJjcmVhdGVJbmRleCIsImVuc3VyZVVuaXF1ZW5lc3MiLCJfZW5zdXJlU3BhcnNlVW5pcXVlSW5kZXhJbkJhY2tncm91bmQiLCJfcmF3RmluZCIsImNvdW50IiwiZGlzdGluY3QiLCJpc1BvaW50ZXJGaWVsZCIsInRyYW5zZm9ybUZpZWxkIiwiYWdncmVnYXRlIiwicGlwZWxpbmUiLCJzdGFnZSIsIiRncm91cCIsIl9wYXJzZUFnZ3JlZ2F0ZUdyb3VwQXJncyIsIiRtYXRjaCIsIl9wYXJzZUFnZ3JlZ2F0ZUFyZ3MiLCIkcHJvamVjdCIsIl9wYXJzZUFnZ3JlZ2F0ZVByb2plY3RBcmdzIiwiJGdlb05lYXIiLCJyZXN1bHRzIiwic3BsaXQiLCJpc0VtcHR5IiwicmV0dXJuVmFsdWUiLCJfY29udmVydFRvRGF0ZSIsInN1YnN0cmluZyIsIkRhdGUiLCJ0b1VwcGVyQ2FzZSIsIlBSSU1BUlkiLCJQUklNQVJZX1BSRUZFUlJFRCIsIlNFQ09OREFSWSIsIlNFQ09OREFSWV9QUkVGRVJSRUQiLCJORUFSRVNUIiwicGVyZm9ybUluaXRpYWxpemF0aW9uIiwiJHRleHQiLCJ0ZXh0SW5kZXgiLCJkcm9wQWxsSW5kZXhlcyIsImRyb3BJbmRleGVzIiwidXBkYXRlU2NoZW1hV2l0aEluZGV4ZXMiLCJjbGFzc2VzIiwicHJvbWlzZXMiLCJjcmVhdGVUcmFuc2FjdGlvbmFsU2Vzc2lvbiIsInRyYW5zYWN0aW9uYWxTZWN0aW9uIiwic3RhcnRTZXNzaW9uIiwic3RhcnRUcmFuc2FjdGlvbiIsImNvbW1pdFRyYW5zYWN0aW9uYWxTZXNzaW9uIiwiY29tbWl0IiwicmV0cmllcyIsImNvbW1pdFRyYW5zYWN0aW9uIiwiaGFzRXJyb3JMYWJlbCIsImVuZFNlc3Npb24iLCJhYm9ydFRyYW5zYWN0aW9uYWxTZXNzaW9uIiwiYWJvcnRUcmFuc2FjdGlvbiJdLCJtYXBwaW5ncyI6Ijs7Ozs7OztBQUNBOztBQUNBOztBQUNBOztBQUVBOztBQUNBOztBQVNBOztBQUVBOztBQUNBOztBQUNBOzs7Ozs7Ozs7Ozs7Ozs7O0FBRUE7QUFDQSxNQUFNQSxPQUFPLEdBQUdDLE9BQU8sQ0FBQyxTQUFELENBQXZCOztBQUNBLE1BQU1DLFdBQVcsR0FBR0YsT0FBTyxDQUFDRSxXQUE1QjtBQUNBLE1BQU1DLGNBQWMsR0FBR0gsT0FBTyxDQUFDRyxjQUEvQjtBQUVBLE1BQU1DLHlCQUF5QixHQUFHLFNBQWxDOztBQUVBLE1BQU1DLDRCQUE0QixHQUFHQyxZQUFZLElBQUk7QUFDbkQsU0FBT0EsWUFBWSxDQUNoQkMsT0FESSxHQUVKQyxJQUZJLENBRUMsTUFBTUYsWUFBWSxDQUFDRyxRQUFiLENBQXNCQyxXQUF0QixFQUZQLEVBR0pGLElBSEksQ0FHQ0UsV0FBVyxJQUFJO0FBQ25CLFdBQU9BLFdBQVcsQ0FBQ0MsTUFBWixDQUFtQkMsVUFBVSxJQUFJO0FBQ3RDLFVBQUlBLFVBQVUsQ0FBQ0MsU0FBWCxDQUFxQkMsS0FBckIsQ0FBMkIsWUFBM0IsQ0FBSixFQUE4QztBQUM1QyxlQUFP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Q0FBYjtBQUNEOztBQUNELGNBQU1yTCxLQUFOO0FBQ0QsT0FQSSxFQVFKN0UsSUFSSSxDQVFDLE1BQU07QUFDVjZQLFFBQUFBLG9CQUFvQixDQUFDUSxVQUFyQjtBQUNELE9BVkksQ0FBUDtBQVdELEtBWkQ7O0FBYUEsV0FBT0osTUFBTSxDQUFDLENBQUQsQ0FBYjtBQUNEOztBQUVESyxFQUFBQSx5QkFBeUIsQ0FBQ1Qsb0JBQUQsRUFBMkM7QUFDbEUsV0FBT0Esb0JBQW9CLENBQUNVLGdCQUFyQixHQUF3Q3ZRLElBQXhDLENBQTZDLE1BQU07QUFDeEQ2UCxNQUFBQSxvQkFBb0IsQ0FBQ1EsVUFBckI7QUFDRCxLQUZNLENBQVA7QUFHRDs7QUE3OUJ3RDs7O2VBZytCNUN4TixtQiIsInNvdXJjZXNDb250ZW50IjpbIi8vIEBmbG93XG5pbXBvcnQgTW9uZ29Db2xsZWN0aW9uIGZyb20gJy4vTW9uZ29Db2xsZWN0aW9uJztcbmltcG9ydCBNb25nb1NjaGVtYUNvbGxlY3Rpb24gZnJvbSAnLi9Nb25nb1NjaGVtYUNvbGxlY3Rpb24nO1xuaW1wb3J0IHsgU3RvcmFnZUFkYXB0ZXIgfSBmcm9tICcuLi9TdG9yYWdlQWRhcHRlcic7XG5pbXBvcnQgdHlwZSB7IFNjaGVtYVR5cGUsIFF1ZXJ5VHlwZSwgU3RvcmFnZUNsYXNzLCBRdWVyeU9wdGlvbnMgfSBmcm9tICcuLi9TdG9yYWdlQWRhcHRlcic7XG5pbXBvcnQgeyBwYXJzZSBhcyBwYXJzZVVybCwgZm9ybWF0IGFzIGZvcm1hdFVybCB9IGZyb20gJy4uLy4uLy4uL3ZlbmRvci9tb25nb2RiVXJsJztcbmltcG9ydCB7XG4gIHBhcnNlT2JqZWN0VG9Nb25nb09iamVjdEZvckNyZWF0ZSxcbiAgbW9uZ29PYmplY3RUb1BhcnNlT2JqZWN0LFxuICB0cmFuc2Zvcm1LZXksXG4gIHRyYW5zZm9ybVdoZXJlLFxuICB0cmFuc2Zvcm1VcGRhdGUsXG4gIHRyYW5zZm9ybVBvaW50ZXJTdHJpbmcsXG59IGZyb20gJy4vTW9uZ29UcmFuc2Zvcm0nO1xuLy8gQGZsb3ctZGlzYWJsZS1uZXh0XG5pbXBvcnQgUGFyc2UgZnJvbSAncGFyc2Uvbm9kZSc7XG4vLyBAZmxvdy1kaXNhYmxlLW5leHRcbmltcG9ydCBfIGZyb20gJ2xvZGFzaCc7XG5pbXBvcnQgZGVmYXVsdHMgZnJvbSAnLi4vLi4vLi4vZGVmYXVsdHMnO1xuaW1wb3J0IGxvZ2dlciBmcm9tICcuLi8uLi8uLi9sb2dnZXInO1xuXG4vLyBAZmxvdy1kaXNhYmxlLW5leHRcbmNvbnN0IG1vbmdvZGIgPSByZXF1aXJlKCdtb25nb2RiJyk7XG5jb25zdCBNb25nb0NsaWVudCA9IG1vbmdvZGIuTW9uZ29DbGllbnQ7XG5jb25zdCBSZWFkUHJlZmVyZW5jZSA9IG1vbmdvZGIuUmVhZFByZWZlcmVuY2U7XG5cbmNvbnN0IE1vbmdvU2NoZW1hQ29sbGVjdGlvbk5hbWUgPSAnX1NDSEVNQSc7XG5cbmNvbnN0IHN0b3JhZ2VBZGFwdGVyQWxsQ29sbGVjdGlvbnMgPSBtb25nb0FkYXB0ZXIgPT4ge1xuICByZXR1cm4gbW9uZ29BZGFwdGVyXG4gICAgLmNvbm5lY3QoKVxuICAgIC50aGVuKCgpID0+IG1vbmdvQWRhcHRlci5kYXRhYmFzZS5jb2xsZWN0aW9ucygpKVxuICAgIC50aGVuKGNvbGxlY3Rpb25zID0+IHtcbiAgICAgIHJldHVybiBjb2xsZWN0aW9ucy5maWx0ZXIoY29sbGVjdGlvbiA9PiB7XG4gICAgICAgIGlmIChjb2xsZWN0aW9uLm5hbWVzcGFjZS5tYXRjaCgvXFwuc3lzdGVtXFwuLykpIHtcbiAgICAgICAgICByZXR1cm4gZmFsc2U7XG4gICAgICAgIH1cbiAgICAgICAgLy8gVE9ETzogSWYgeW91IGhhdmUgb25lIGFwcCB3aXRoIGEgY29sbGVjdGlvbiBwcmVmaXggdGhhdCBoYXBwZW5zIHRvIGJlIGEgcHJlZml4IG9mIGFub3RoZXJcbiAgICAgICAgLy8gYXBwcyBwcmVmaXgsIHRoaXMgd2lsbCBnbyB2ZXJ5IHZlcnkgYmFkbHkuIFdlIHNob3VsZCBmaXggdGhhdCBzb21laG93LlxuICAgICAgICByZXR1cm4gY29sbGVjdGlvbi5jb2xsZWN0aW9uTmFtZS5pbmRleE9mKG1vbmdvQWRhcHRlci5fY29sbGVjdGlvblByZWZpeCkgPT0gMDtcbiAgICAgIH0pO1xuICAgIH0pO1xufTtcblxuY29uc3QgY29udmVydFBhcnNlU2NoZW1hVG9Nb25nb1NjaGVtYSA9ICh7IC4uLnNjaGVtYSB9KSA9PiB7XG4gIGRlbGV0ZSBzY2hlbWEuZmllbGRzLl9ycGVybTtcbiAgZGVsZXRlIHNjaGVtYS5maWVsZHMuX3dwZXJtO1xuXG4gIGlmIChzY2hlbWEuY2xhc3NOYW1lID09PSAnX1VzZXInKSB7XG4gICAgLy8gTGVnYWN5IG1vbmdvIGFkYXB0ZXIga25vd3MgYWJvdXQgdGhlIGRpZmZlcmVuY2UgYmV0d2VlbiBwYXNzd29yZCBhbmQgX2hhc2hlZF9wYXNzd29yZC5cbiAgICAvLyBGdXR1cmUgZGF0YWJhc2UgYWRhcHRlcnMgd2lsbCBvbmx5IGtub3cgYWJvdXQgX2hhc2hlZF9wYXNzd29yZC5cbiAgICAvLyBOb3RlOiBQYXJzZSBTZXJ2ZXIgd2lsbCBicmluZyBiYWNrIHBhc3N3b3JkIHdpdGggaW5qZWN0RGVmYXVsdFNjaGVtYSwgc28gd2UgZG9uJ3QgbmVlZFxuICAgIC8vIHRvIGFkZCBfaGFzaGVkX3Bhc3N3b3JkIGJhY2sgZXZlci5cbiAgICBkZWxldGUgc2NoZW1hLmZpZWxkcy5faGFzaGVkX3Bhc3N3b3JkO1xuICB9XG5cbiAgcmV0dXJuIHNjaGVtYTtcbn07XG5cbi8vIFJldHVybnMgeyBjb2RlLCBlcnJvciB9IGlmIGludmFsaWQsIG9yIHsgcmVzdWx0IH0sIGFuIG9iamVjdFxuLy8gc3VpdGFibGUgZm9yIGluc2VydGluZyBpbnRvIF9TQ0hFTUEgY29sbGVjdGlvbiwgb3RoZXJ3aXNlLlxuY29uc3QgbW9uZ29TY2hlbWFGcm9tRmllbGRzQW5kQ2xhc3NOYW1lQW5kQ0xQID0gKFxuICBmaWVsZHMsXG4gIGNsYXNzTmFtZSxcbiAgY2xhc3NMZXZlbFBlcm1pc3Npb25zLFxuICBpbmRleGVzXG4pID0+IHtcbiAgY29uc3QgbW9uZ29PYmplY3QgPSB7XG4gICAgX2lkOiBjbGFzc05hbWUsXG4gICAgb2JqZWN0SWQ6ICdzdHJpbmcnLFxuICAgIHVwZGF0ZWRBdDogJ3N0cmluZycsXG4gICAgY3JlYXRlZEF0OiAnc3RyaW5nJyxcbiAgICBfbWV0YWRhdGE6IHVuZGVmaW5lZCxcbiAgfTtcblxuICBmb3IgKGNvbnN0IGZpZWxkTmFtZSBpbiBmaWVsZHMpIHtcbiAgICBjb25zdCB7IHR5cGUsIHRhcmdldENsYXNzLCAuLi5maWVsZE9wdGlvbnMgfSA9IGZpZWxkc1tmaWVsZE5hbWVdO1xuICAgIG1vbmdvT2JqZWN0W2ZpZWxkTmFtZV0gPSBNb25nb1NjaGVtYUNvbGxlY3Rpb24ucGFyc2VGaWVsZFR5cGVUb01vbmdvRmllbGRUeXBlKHtcbiAgICAgIHR5cGUsXG4gICAgICB0YXJnZXRDbGFzcyxcbiAgICB9KTtcbiAgICBpZiAoZmllbGRPcHRpb25zICYmIE9iamVjdC5rZXlzKGZpZWxkT3B0aW9ucykubGVuZ3RoID4gMCkge1xuICAgICAgbW9uZ29PYmplY3QuX21ldGFkYXRhID0gbW9uZ29PYmplY3QuX21ldGFkYXRhIHx8IHt9O1xuICAgICAgbW9uZ29PYmplY3QuX21ldGFkYXRhLmZpZWxkc19vcHRpb25zID0gbW9uZ29PYmplY3QuX21ldGFkYXRhLmZpZWxkc19vcHRpb25zIHx8IHt9O1xuICAgICAgbW9uZ29PYmplY3QuX21ldGFkYXRhLmZpZWxkc19vcHRpb25zW2ZpZWxkTmFtZV0gPSBmaWVsZE9wdGlvbnM7XG4gICAgfVxuICB9XG5cbiAgaWYgKHR5cGVvZiBjbGFzc0xldmVsUGVybWlzc2lvbnMgIT09ICd1bmRlZmluZWQnKSB7XG4gICAgbW9uZ29PYmplY3QuX21ldGFkYXRhID0gbW9uZ29PYmplY3QuX21ldGFkYXRhIHx8IHt9O1xuICAgIGlmICghY2xhc3NMZXZlbFBlcm1pc3Npb25zKSB7XG4gICAgICBkZWxldGUgbW9uZ29PYmplY3QuX21ldGFkYXRhLmNsYXNzX3Blcm1pc3Npb25zO1xuICAgIH0gZWxzZSB7XG4gICAgICBtb25nb09iamVjdC5fbWV0YWRhdGEuY2xhc3NfcGVybWlzc2lvbnMgPSBjbGFzc0xldmVsUGVybWlzc2lvbnM7XG4gICAgfVxuICB9XG5cbiAgaWYgKGluZGV4ZXMgJiYgdHlwZW9mIGluZGV4ZXMgPT09ICdvYmplY3QnICYmIE9iamVjdC5rZXlzKGluZGV4ZXMpLmxlbmd0aCA+IDApIHtcbiAgICBtb25nb09iamVjdC5fbWV0YWRhdGEgPSBtb25nb09iamVjdC5fbWV0YWRhdGEgfHwge307XG4gICAgbW9uZ29PYmplY3QuX21ldGFkYXRhLmluZGV4ZXMgPSBpbmRleGVzO1xuICB9XG5cbiAgaWYgKCFtb25nb09iamVjdC5fbWV0YWRhdGEpIHtcbiAgICAvLyBjbGVhbnVwIHRoZSB1bnVzZWQgX21ldGFkYXRhXG4gICAgZGVsZXRlIG1vbmdvT2JqZWN0Ll9tZXRhZGF0YTtcbiAgfVxuXG4gIHJldHVybiBtb25nb09iamVjdDtcbn07XG5cbmZ1bmN0aW9uIHZhbGlkYXRlRXhwbGFpblZhbHVlKGV4cGxhaW4pIHtcbiAgaWYgKGV4cGxhaW4pIHtcbiAgICAvLyBUaGUgbGlzdCBvZiBhbGxvd2VkIGV4cGxhaW4gdmFsdWVzIGlzIGZyb20gbm9kZS1tb25nb2RiLW5hdGl2ZS9saWIvZXhwbGFpbi5qc1xuICAgIGNvbnN0IGV4cGxhaW5BbGxvd2VkVmFsdWVzID0gW1xuICAgICAgJ3F1ZXJ5UGxhbm5lcicsXG4gICAgICAncXVlcnlQbGFubmVyRXh0ZW5kZWQnLFxuICAgICAgJ2V4ZWN1dGlvblN0YXRzJyxcbiAgICAgICdhbGxQbGFuc0V4ZWN1dGlvbicsXG4gICAgICBmYWxzZSxcbiAgICAgIHRydWUsXG4gICAgXTtcbiAgICBpZiAoIWV4cGxhaW5BbGxvd2VkVmFsdWVzLmluY2x1ZGVzKGV4cGxhaW4pKSB7XG4gICAgICB0aHJvdyBuZXcgUGFyc2UuRXJyb3IoUGFyc2UuRXJyb3IuSU5WQUxJRF9RVUVSWSwgJ0ludmFsaWQgdmFsdWUgZm9yIGV4cGxhaW4nKTtcbiAgICB9XG4gIH1cbn1cblxuZXhwb3J0IGNsYXNzIE1vbmdvU3RvcmFnZUFkYXB0ZXIgaW1wbGVtZW50cyBTdG9yYWdlQWRhcHRlciB7XG4gIC8vIFByaXZhdGVcbiAgX3VyaTogc3RyaW5nO1xuICBfY29sbGVjdGlvblByZWZpeDogc3RyaW5nO1xuICBfbW9uZ29PcHRpb25zOiBPYmplY3Q7XG4gIF9vbmNoYW5nZTogYW55O1xuICBfc3RyZWFtOiBhbnk7XG4gIC8vIFB1YmxpY1xuICBjb25uZWN0aW9uUHJvbWlzZTogP1Byb21pc2U8YW55PjtcbiAgZGF0YWJhc2U6IGFueTtcbiAgY2xpZW50OiBNb25nb0NsaWVudDtcbiAgX21heFRpbWVNUzogP251bWJlcjtcbiAgY2FuU29ydE9uSm9pblRhYmxlczogYm9vbGVhbjtcbiAgZW5hYmxlU2NoZW1hSG9va3M6IGJvb2xlYW47XG4gIGRpc2FibGVJbmRleEZpZWxkVmFsaWRhdGlvbjogYm9vbGVhbjtcblxuICBjb25zdHJ1Y3Rvcih7IHVyaSA9IGRlZmF1bHRzLkRlZmF1bHRNb25nb1VSSSwgY29sbGVjdGlvblByZWZpeCA9ICcnLCBtb25nb09wdGlvbnMgPSB7fSB9OiBhbnkpIHtcbiAgICB0aGlzLl91cmkgPSB1cmk7XG4gICAgdGhpcy5fY29sbGVjdGlvblByZWZpeCA9IGNvbGxlY3Rpb25QcmVmaXg7XG4gICAgdGhpcy5fbW9uZ29PcHRpb25zID0gbW9uZ29PcHRpb25zO1xuICAgIHRoaXMuX21vbmdvT3B0aW9ucy51c2VOZXdVcmxQYXJzZXIgPSB0cnVlO1xuICAgIHRoaXMuX21vbmdvT3B0aW9ucy51c2VVbmlmaWVkVG9wb2xvZ3kgPSB0cnVlO1xuICAgIHRoaXMuX29uY2hhbmdlID0gKCkgPT4ge307XG5cbiAgICAvLyBNYXhUaW1lTVMgaXMgbm90IGEgZ2xvYmFsIE1vbmdvREIgY2xpZW50IG9wdGlvbiwgaXQgaXMgYXBwbGllZCBwZXIgb3BlcmF0aW9uLlxuICAgIHRoaXMuX21heFRpbWVNUyA9IG1vbmdvT3B0aW9ucy5tYXhUaW1lTVM7XG4gICAgdGhpcy5jYW5Tb3J0T25Kb2luVGFibGVzID0gdHJ1ZTtcbiAgICB0aGlzLmVuYWJsZVNjaGVtYUhvb2tzID0gISFtb25nb09wdGlvbnMuZW5hYmxlU2NoZW1hSG9va3M7XG4gICAgdGhpcy5kaXNhYmxlSW5kZXhGaWVsZFZhbGlkYXRpb24gPSAhIW1vbmdvT3B0aW9ucy5kaXNhYmxlSW5kZXhGaWVsZFZhbGlkYXRpb247XG4gICAgZGVsZXRlIG1vbmdvT3B0aW9ucy5lbmFibGVTY2hlbWFIb29rcztcbiAgICBkZWxldGUgbW9uZ29PcHRpb25zLmRpc2FibGVJbmRleEZpZWxkVmFsaWRhdGlvbjtcbiAgICBkZWxldGUgbW9uZ29PcHRpb25zLm1heFRpbWVNUztcbiAgfVxuXG4gIHdhdGNoKGNhbGxiYWNrOiAoKSA9PiB2b2lkKTogdm9pZCB7XG4gICAgdGhpcy5fb25jaGFuZ2UgPSBjYWxsYmFjaztcbiAgfVxuXG4gIGNvbm5lY3QoKSB7XG4gICAgaWYgKHRoaXMuY29ubmVjdGlvblByb21pc2UpIHtcbiAgICAgIHJldHVybiB0aGlzLmNvbm5lY3Rpb25Qcm9taXNlO1xuICAgIH1cblxuICAgIC8vIHBhcnNpbmcgYW5kIHJlLWZvcm1hdHRpbmcgY2F1c2VzIHRoZSBhdXRoIHZhbHVlIChpZiB0aGVyZSkgdG8gZ2V0IFVSSVxuICAgIC8vIGVuY29kZWRcbiAgICBjb25zdCBlbmNvZGVkVXJpID0gZm9ybWF0VXJsKHBhcnNlVXJsKHRoaXMuX3VyaSkpO1xuXG4gICAgdGhpcy5jb25uZWN0aW9uUHJvbWlzZSA9IE1vbmdvQ2xpZW50LmNvbm5lY3QoZW5jb2RlZFVyaSwgdGhpcy5fbW9uZ29PcHRpb25zKVxuICAgICAgLnRoZW4oY2xpZW50ID0+IHtcbiAgICAgICAgLy8gU3RhcnRpbmcgbW9uZ29EQiAzLjAsIHRoZSBNb25nb0NsaWVudC5jb25uZWN0IGRvbid0IHJldHVybiBhIERCIGFueW1vcmUgYnV0IGEgY2xpZW50XG4gICAgICAgIC8vIEZvcnR1bmF0ZWx5LCB3ZSBjYW4gZ2V0IGJhY2sgdGhlIG9wdGlvbnMgYW5kIHVzZSB0aGVtIHRvIHNlbGVjdCB0aGUgcHJvcGVyIERCLlxuICAgICAgICAvLyBodHRwczovL2dpdGh1Yi5jb20vbW9uZ29kYi9ub2RlLW1vbmdvZGItbmF0aXZlL2Jsb2IvMmMzNWQ3NmYwODU3NDIyNWI4ZGIwMmQ3YmVmNjg3MTIzZTZiYjAxOC9saWIvbW9uZ29fY2xpZW50LmpzI0w4ODVcbiAgICAgICAgY29uc3Qgb3B0aW9ucyA9IGNsaWVudC5zLm9wdGlvbnM7XG4gICAgICAgIGNvbnN0IGRhdGFiYXNlID0gY2xpZW50LmRiKG9wdGlvbnMuZGJOYW1lKTtcbiAgICAgICAgaWYgKCFkYXRhYmFzZSkge1xuICAgICAgICAgIGRlbGV0ZSB0aGlzLmNvbm5lY3Rpb25Qcm9taXNlO1xuICAgICAgICAgIHJldHVybjtcbiAgICAgICAgfVxuICAgICAgICBjbGllbnQub24oJ2Vycm9yJywgKCkgPT4ge1xuICAgICAgICAgIGRlbGV0ZSB0aGlzLmNvbm5lY3Rpb25Qcm9taXNlO1xuICAgICAgICB9KTtcbiAgICAgICAgY2xpZW50Lm9uKCdjbG9zZScsICgpID0+IHtcbiAgICAgICAgICBkZWxldGUgdGhpcy5jb25uZWN0aW9uUHJvbWlzZTtcbiAgICAgICAgfSk7XG4gICAgICAgIHRoaXMuY2xpZW50ID0gY2xpZW50O1xuICAgICAgICB0aGlzLmRhdGFiYXNlID0gZGF0YWJhc2U7XG4gICAgICB9KVxuICAgICAgLmNhdGNoKGVyciA9PiB7XG4gICAgICAgIGRlbGV0ZSB0aGlzLmNvbm5lY3Rpb25Qcm9taXNlO1xuICAgICAgICByZXR1cm4gUHJvbWlzZS5yZWplY3QoZXJyKTtcbiAgICAgIH0pO1xuXG4gICAgcmV0dXJuIHRoaXMuY29ubmVjdGlvblByb21pc2U7XG4gIH1cblxuICBoYW5kbGVFcnJvcjxUPihlcnJvcjogPyhFcnJvciB8IFBhcnNlLkVycm9yKSk6IFByb21pc2U8VD4ge1xuICAgIGlmIChlcnJvciAmJiBlcnJvci5jb2RlID09PSAxMykge1xuICAgICAgLy8gVW5hdXRob3JpemVkIGVycm9yXG4gICAgICBkZWxldGUgdGhpcy5jbGllbnQ7XG4gICAgICBkZWxldGUgdGhpcy5kYXRhYmFzZTtcbiAgICAgIGRlbGV0ZSB0aGlzLmNvbm5lY3Rpb25Qcm9taXNlO1xuICAgICAgbG9nZ2VyLmVycm9yKCdSZWNlaXZlZCB1bmF1dGhvcml6ZWQgZXJyb3InLCB7IGVycm9yOiBlcnJvciB9KTtcbiAgICB9XG4gICAgdGhyb3cgZXJyb3I7XG4gIH1cblxuICBoYW5kbGVTaHV0ZG93bigpIHtcbiAgICBpZiAoIXRoaXMuY2xpZW50KSB7XG4gICAgICByZXR1cm4gUHJvbWlzZS5yZXNvbHZlKCk7XG4gICAgfVxuICAgIHJldHVybiB0aGlzLmNsaWVudC5jbG9zZShmYWxzZSk7XG4gIH1cblxuICBfYWRhcHRpdmVDb2xsZWN0aW9uKG5hbWU6IHN0cmluZykge1xuICAgIHJldHVybiB0aGlzLmNvbm5lY3QoKVxuICAgICAgLnRoZW4oKCkgPT4gdGhpcy5kYXRhYmFzZS5jb2xsZWN0aW9uKHRoaXMuX2NvbGxlY3Rpb25QcmVmaXggKyBuYW1lKSlcbiAgICAgIC50aGVuKHJhd0NvbGxlY3Rpb24gPT4gbmV3IE1vbmdvQ29sbGVjdGlvbihyYXdDb2xsZWN0aW9uKSlcbiAgICAgIC5jYXRjaChlcnIgPT4gdGhpcy5oYW5kbGVFcnJvcihlcnIpKTtcbiAgfVxuXG4gIF9zY2hlbWFDb2xsZWN0aW9uKCk6IFByb21pc2U8TW9uZ29TY2hlbWFDb2xsZWN0aW9uPiB7XG4gICAgcmV0dXJuIHRoaXMuY29ubmVjdCgpXG4gICAgICAudGhlbigoKSA9PiB0aGlzLl9hZGFwdGl2ZUNvbGxlY3Rpb24oTW9uZ29TY2hlbWFDb2xsZWN0aW9uTmFtZSkpXG4gICAgICAudGhlbihjb2xsZWN0aW9uID0+IHtcbiAgICAgICAgaWYgKCF0aGlzLl9zdHJlYW0gJiYgdGhpcy5lbmFibGVTY2hlbWFIb29rcykge1xuICAgICAgICAgIHRoaXMuX3N0cmVhbSA9IGNvbGxlY3Rpb24uX21vbmdvQ29sbGVjdGlvbi53YXRjaCgpO1xuICAgICAgICAgIHRoaXMuX3N0cmVhbS5vbignY2hhbmdlJywgKCkgPT4gdGhpcy5fb25jaGFuZ2UoKSk7XG4gICAgICAgIH1cbiAgICAgICAgcmV0dXJuIG5ldyBNb25nb1NjaGVtYUNvbGxlY3Rpb24oY29sbGVjdGlvbik7XG4gICAgICB9KTtcbiAgfVxuXG4gIGNsYXNzRXhpc3RzKG5hbWU6IHN0cmluZykge1xuICAgIHJldHVybiB0aGlzLmNvbm5lY3QoKVxuICAgICAgLnRoZW4oKCkgPT4ge1xuICAgICAgICByZXR1cm4gdGhpcy5kYXRhYmFzZS5saXN0Q29sbGVjdGlvbnMoeyBuYW1lOiB0aGlzLl9jb2xsZWN0aW9uUHJlZml4ICsgbmFtZSB9KS50b0FycmF5KCk7XG4gICAgICB9KVxuICAgICAgLnRoZW4oY29sbGVjdGlvbnMgPT4ge1xuICAgICAgICByZXR1cm4gY29sbGVjdGlvbnMubGVuZ3RoID4gMDtcbiAgICAgIH0pXG4gICAgICAuY2F0Y2goZXJyID0+IHRoaXMuaGFuZGxlRXJyb3IoZXJyKSk7XG4gIH1cblxuICBzZXRDbGFzc0xldmVsUGVybWlzc2lvbnMoY2xhc3NOYW1lOiBzdHJpbmcsIENMUHM6IGFueSk6IFByb21pc2U8dm9pZD4ge1xuICAgIHJldHVybiB0aGlzLl9zY2hlbWFDb2xsZWN0aW9uKClcbiAgICAgIC50aGVuKHNjaGVtYUNvbGxlY3Rpb24gPT5cbiAgICAgICAgc2NoZW1hQ29sbGVjdGlvbi51cGRhdGVTY2hlbWEoY2xhc3NOYW1lLCB7XG4gICAgICAgICAgJHNldDogeyAnX21ldGFkYXRhLmNsYXNzX3Blcm1pc3Npb25zJzogQ0xQcyB9LFxuICAgICAgICB9KVxuICAgICAgKVxuICAgICAgLmNhdGNoKGVyciA9PiB0aGlzLmhhbmRsZUVycm9yKGVycikpO1xuICB9XG5cbiAgc2V0SW5kZXhlc1dpdGhTY2hlbWFGb3JtYXQoXG4gICAgY2xhc3NOYW1lOiBzdHJpbmcsXG4gICAgc3VibWl0dGVkSW5kZXhlczogYW55LFxuICAgIGV4aXN0aW5nSW5kZXhlczogYW55ID0ge30sXG4gICAgZmllbGRzOiBhbnlcbiAgKTogUHJvbWlzZTx2b2lkPiB7XG4gICAgaWYgKHN1Ym1pdHRlZEluZGV4ZXMgPT09IHVuZGVmaW5lZCkge1xuICAgICAgcmV0dXJuIFByb21pc2UucmVzb2x2ZSgpO1xuICAgIH1cbiAgICBpZiAoT2JqZWN0LmtleXMoZXhpc3RpbmdJbmRleGVzKS5sZW5ndGggPT09IDApIHtcbiAgICAgIGV4aXN0aW5nSW5kZXhlcyA9IHsgX2lkXzogeyBfaWQ6IDEgfSB9O1xuICAgIH1cbiAgICBjb25zdCBkZWxldGVQcm9taXNlcyA9IFtdO1xuICAgIGNvbnN0IGluc2VydGVkSW5kZXhlcyA9IFtdO1xuICAgIE9iamVjdC5rZXlzKHN1Ym1pdHRlZEluZGV4ZXMpLmZvckVhY2gobmFtZSA9PiB7XG4gICAgICBjb25zdCBmaWVsZCA9IHN1Ym1pdHRlZEluZGV4ZXNbbmFtZV07XG4gICAgICBpZiAoZXhpc3RpbmdJbmRleGVzW25hbWVdICYmIGZpZWxkLl9fb3AgIT09ICdEZWxldGUnKSB7XG4gICAgICAgIHRocm93IG5ldyBQYXJzZS5FcnJvcihQYXJzZS5FcnJvci5JTlZBTElEX1FVRVJZLCBgSW5kZXggJHtuYW1lfSBleGlzdHMsIGNhbm5vdCB1cGRhdGUuYCk7XG4gICAgICB9XG4gICAgICBpZiAoIWV4aXN0aW5nSW5kZXhlc1tuYW1lXSAmJiBmaWVsZC5fX29wID09PSAnRGVsZXRlJykge1xuICAgICAgICB0aHJvdyBuZXcgUGFyc2UuRXJyb3IoXG4gICAgICAgICAgUGFyc2UuRXJyb3IuSU5WQUxJRF9RVUVSWSxcbiAgICAgICAgICBgSW5kZXggJHtuYW1lfSBkb2VzIG5vdCBleGlzdCwgY2Fubm90IGRlbGV0ZS5gXG4gICAgICAgICk7XG4gICAgICB9XG4gICAgICBpZiAoZmllbGQuX19vcCA9PT0gJ0RlbGV0ZScpIHtcbiAgICAgICAgY29uc3QgcHJvbWlzZSA9IHRoaXMuZHJvcEluZGV4KGNsYXNzTmFtZSwgbmFtZSk7XG4gICAgICAgIGRlbGV0ZVByb21pc2VzLnB1c2gocHJvbWlzZSk7XG4gICAgICAgIGRlbGV0ZSBleGlzdGluZ0luZGV4ZXNbbmFtZV07XG4gICAgICB9IGVsc2Uge1xuICAgICAgICBPYmplY3Qua2V5cyhmaWVsZCkuZm9yRWFjaChrZXkgPT4ge1xuICAgICAgICAgIGlmIChcbiAgICAgICAgICAgICF0aGlzLmRpc2FibGVJbmRleEZpZWxkVmFsaWRhdGlvbiAmJlxuICAgICAgICAgICAgIU9iamVjdC5wcm90b3R5cGUuaGFzT3duUHJvcGVydHkuY2FsbChcbiAgICAgICAgICAgICAgZmllbGRzLFxuICAgICAgICAgICAgICBrZXkuaW5kZXhPZignX3BfJykgPT09IDAgPyBrZXkucmVwbGFjZSgnX3BfJywgJycpIDoga2V5XG4gICAgICAgICAgICApXG4gICAgICAgICAgKSB7XG4gICAgICAgICAgICB0aHJvdyBuZXcgUGFyc2UuRXJyb3IoXG4gICAgICAgICAgICAgIFBhcnNlLkVycm9yLklOVkFMSURfUVVFUlksXG4gICAgICAgICAgICAgIGBGaWVsZCAke2tleX0gZG9lcyBub3QgZXhpc3QsIGNhbm5vdCBhZGQgaW5kZXguYFxuICAgICAgICAgICAgKTtcbiAgICAgICAgICB9XG4gICAgICAgIH0pO1xuICAgICAgICBleGlzdGluZ0luZGV4ZXNbbmFtZV0gPSBmaWVsZDtcbiAgICAgICAgaW5zZXJ0ZWRJbmRleGVzLnB1c2goe1xuICAgICAgICAgIGtleTogZmllbGQsXG4gICAgICAgICAgbmFtZSxcbiAgICAgICAgfSk7XG4gICAgICB9XG4gICAgfSk7XG4gICAgbGV0IGluc2VydFByb21pc2UgPSBQcm9taXNlLnJlc29sdmUoKTtcbiAgICBpZiAoaW5zZXJ0ZWRJbmRleGVzLmxlbmd0aCA+IDApIHtcbiAgICAgIGluc2VydFByb21pc2UgPSB0aGlzLmNyZWF0ZUluZGV4ZXMoY2xhc3NOYW1lLCBpbnNlcnRlZEluZGV4ZXMpO1xuICAgIH1cbiAgICByZXR1cm4gUHJvbWlzZS5hbGwoZGVsZXRlUHJvbWlzZXMpXG4gICAgICAudGhlbigoKSA9PiBpbnNlcnRQcm9taXNlKVxuICAgICAgLnRoZW4oKCkgPT4gdGhpcy5fc2NoZW1hQ29sbGVjdGlvbigpKVxuICAgICAgLnRoZW4oc2NoZW1hQ29sbGVjdGlvbiA9PlxuICAgICAgICBzY2hlbWFDb2xsZWN0aW9uLnVwZGF0ZVNjaGVtYShjbGFzc05hbWUsIHtcbiAgICAgICAgICAkc2V0OiB7ICdfbWV0YWRhdGEuaW5kZXhlcyc6IGV4aXN0aW5nSW5kZXhlcyB9LFxuICAgICAgICB9KVxuICAgICAgKVxuICAgICAgLmNhdGNoKGVyciA9PiB0aGlzLmhhbmRsZUVycm9yKGVycikpO1xuICB9XG5cbiAgc2V0SW5kZXhlc0Zyb21Nb25nbyhjbGFzc05hbWU6IHN0cmluZykge1xuICAgIHJldHVybiB0aGlzLmdldEluZGV4ZXMoY2xhc3NOYW1lKVxuICAgICAgLnRoZW4oaW5kZXhlcyA9PiB7XG4gICAgICAgIGluZGV4ZXMgPSBpbmRleGVzLnJlZHVjZSgob2JqLCBpbmRleCkgPT4ge1xuICAgICAgICAgIGlmIChpbmRleC5rZXkuX2Z0cykge1xuICAgICAgICAgICAgZGVsZXRlIGluZGV4LmtleS5fZnRzO1xuICAgICAgICAgICAgZGVsZXRlIGluZGV4LmtleS5fZnRzeDtcbiAgICAgICAgICAgIGZvciAoY29uc3QgZmllbGQgaW4gaW5kZXgud2VpZ2h0cykge1xuICAgICAgICAgICAgICBpbmRleC5rZXlbZmllbGRdID0gJ3RleHQnO1xuICAgICAgICAgICAgfVxuICAgICAgICAgIH1cbiAgICAgICAgICBvYmpbaW5kZXgubmFtZV0gPSBpbmRleC5rZXk7XG4gICAgICAgICAgcmV0dXJuIG9iajtcbiAgICAgICAgfSwge30pO1xuICAgICAgICByZXR1cm4gdGhpcy5fc2NoZW1hQ29sbGVjdGlvbigpLnRoZW4oc2NoZW1hQ29sbGVjdGlvbiA9PlxuICAgICAgICAgIHNjaGVtYUNvbGxlY3Rpb24udXBkYXRlU2NoZW1hKGNsYXNzTmFtZSwge1xuICAgICAgICAgICAgJHNldDogeyAnX21ldGFkYXRhLmluZGV4ZXMnOiBpbmRleGVzIH0sXG4gICAgICAgICAgfSlcbiAgICAgICAgKTtcbiAgICAgIH0pXG4gICAgICAuY2F0Y2goZXJyID0+IHRoaXMuaGFuZGxlRXJyb3IoZXJyKSlcbiAgICAgIC5jYXRjaCgoKSA9PiB7XG4gICAgICAgIC8vIElnbm9yZSBpZiBjb2xsZWN0aW9uIG5vdCBmb3VuZFxuICAgICAgICByZXR1cm4gUHJvbWlzZS5yZXNvbHZlKCk7XG4gICAgICB9KTtcbiAgfVxuXG4gIGNyZWF0ZUNsYXNzKGNsYXNzTmFtZTogc3RyaW5nLCBzY2hlbWE6IFNjaGVtYVR5cGUpOiBQcm9taXNlPHZvaWQ+IHtcbiAgICBzY2hlbWEgPSBjb252ZXJ0UGFyc2VTY2hlbWFUb01vbmdvU2NoZW1hKHNjaGVtYSk7XG4gICAgY29uc3QgbW9uZ29PYmplY3QgPSBtb25nb1NjaGVtYUZyb21GaWVsZHNBbmRDbGFzc05hbWVBbmRDTFAoXG4gICAgICBzY2hlbWEuZmllbGRzLFxuICAgICAgY2xhc3NOYW1lLFxuICAgICAgc2NoZW1hLmNsYXNzTGV2ZWxQZXJtaXNzaW9ucyxcbiAgICAgIHNjaGVtYS5pbmRleGVzXG4gICAgKTtcbiAgICBtb25nb09iamVjdC5faWQgPSBjbGFzc05hbWU7XG4gICAgcmV0dXJuIHRoaXMuc2V0SW5kZXhlc1dpdGhTY2hlbWFGb3JtYXQoY2xhc3NOYW1lLCBzY2hlbWEuaW5kZXhlcywge30sIHNjaGVtYS5maWVsZHMpXG4gICAgICAudGhlbigoKSA9PiB0aGlzLl9zY2hlbWFDb2xsZWN0aW9uKCkpXG4gICAgICAudGhlbihzY2hlbWFDb2xsZWN0aW9uID0+IHNjaGVtYUNvbGxlY3Rpb24uaW5zZXJ0U2NoZW1hKG1vbmdvT2JqZWN0KSlcbiAgICAgIC5jYXRjaChlcnIgPT4gdGhpcy5oYW5kbGVFcnJvcihlcnIpKTtcbiAgfVxuXG4gIGFzeW5jIHVwZGF0ZUZpZWxkT3B0aW9ucyhjbGFzc05hbWU6IHN0cmluZywgZmllbGROYW1lOiBzdHJpbmcsIHR5cGU6IGFueSkge1xuICAgIGNvbnN0IHNjaGVtYUNvbGxlY3Rpb24gPSBhd2FpdCB0aGlzLl9zY2hlbWFDb2xsZWN0aW9uKCk7XG4gICAgYXdhaXQgc2NoZW1hQ29sbGVjdGlvbi51cGRhdGVGaWVsZE9wdGlvbnMoY2xhc3NOYW1lLCBmaWVsZE5hbWUsIHR5cGUpO1xuICB9XG5cbiAgYWRkRmllbGRJZk5vdEV4aXN0cyhjbGFzc05hbWU6IHN0cmluZywgZmllbGROYW1lOiBzdHJpbmcsIHR5cGU6IGFueSk6IFByb21pc2U8dm9pZD4ge1xuICAgIHJldHVybiB0aGlzLl9zY2hlbWFDb2xsZWN0aW9uKClcbiAgICAgIC50aGVuKHNjaGVtYUNvbGxlY3Rpb24gPT4gc2NoZW1hQ29sbGVjdGlvbi5hZGRGaWVsZElmTm90RXhpc3RzKGNsYXNzTmFtZSwgZmllbGROYW1lLCB0eXBlKSlcbiAgICAgIC50aGVuKCgpID0+IHRoaXMuY3JlYXRlSW5kZXhlc0lmTmVlZGVkKGNsYXNzTmFtZSwgZmllbGROYW1lLCB0eXBlKSlcbiAgICAgIC5jYXRjaChlcnIgPT4gdGhpcy5oYW5kbGVFcnJvcihlcnIpKTtcbiAgfVxuXG4gIC8vIERyb3BzIGEgY29sbGVjdGlvbi4gUmVzb2x2ZXMgd2l0aCB0cnVlIGlmIGl0IHdhcyBhIFBhcnNlIFNjaGVtYSAoZWcuIF9Vc2VyLCBDdXN0b20sIGV0Yy4pXG4gIC8vIGFuZCByZXNvbHZlcyB3aXRoIGZhbHNlIGlmIGl0IHdhc24ndCAoZWcuIGEgam9pbiB0YWJsZSkuIFJlamVjdHMgaWYgZGVsZXRpb24gd2FzIGltcG9zc2libGUuXG4gIGRlbGV0ZUNsYXNzKGNsYXNzTmFtZTogc3RyaW5nKSB7XG4gICAgcmV0dXJuIChcbiAgICAgIHRoaXMuX2FkYXB0aXZlQ29sbGVjdGlvbihjbGFzc05hbWUpXG4gICAgICAgIC50aGVuKGNvbGxlY3Rpb24gPT4gY29sbGVjdGlvbi5kcm9wKCkpXG4gICAgICAgIC5jYXRjaChlcnJvciA9PiB7XG4gICAgICAgICAgLy8gJ25zIG5vdCBmb3VuZCcgbWVhbnMgY29sbGVjdGlvbiB3YXMgYWxyZWFkeSBnb25lLiBJZ25vcmUgZGVsZXRpb24gYXR0ZW1wdC5cbiAgICAgICAgICBpZiAoZXJyb3IubWVzc2FnZSA9PSAnbnMgbm90IGZvdW5kJykge1xuICAgICAgICAgICAgcmV0dXJuO1xuICAgICAgICAgIH1cbiAgICAgICAgICB0aHJvdyBlcnJvcjtcbiAgICAgICAgfSlcbiAgICAgICAgLy8gV2UndmUgZHJvcHBlZCB0aGUgY29sbGVjdGlvbiwgbm93IHJlbW92ZSB0aGUgX1NDSEVNQSBkb2N1bWVudFxuICAgICAgICAudGhlbigoKSA9PiB0aGlzLl9zY2hlbWFDb2xsZWN0aW9uKCkpXG4gICAgICAgIC50aGVuKHNjaGVtYUNvbGxlY3Rpb24gPT4gc2NoZW1hQ29sbGVjdGlvbi5maW5kQW5kRGVsZXRlU2NoZW1hKGNsYXNzTmFtZSkpXG4gICAgICAgIC5jYXRjaChlcnIgPT4gdGhpcy5oYW5kbGVFcnJvcihlcnIpKVxuICAgICk7XG4gIH1cblxuICBkZWxldGVBbGxDbGFzc2VzKGZhc3Q6IGJvb2xlYW4pIHtcbiAgICByZXR1cm4gc3RvcmFnZUFkYXB0ZXJBbGxDb2xsZWN0aW9ucyh0aGlzKS50aGVuKGNvbGxlY3Rpb25zID0+XG4gICAgICBQcm9taXNlLmFsbChcbiAgICAgICAgY29sbGVjdGlvbnMubWFwKGNvbGxlY3Rpb24gPT4gKGZhc3QgPyBjb2xsZWN0aW9uLmRlbGV0ZU1hbnkoe30pIDogY29sbGVjdGlvbi5kcm9wKCkpKVxuICAgICAgKVxuICAgICk7XG4gIH1cblxuICAvLyBSZW1vdmUgdGhlIGNvbHVtbiBhbmQgYWxsIHRoZSBkYXRhLiBGb3IgUmVsYXRpb25zLCB0aGUgX0pvaW4gY29sbGVjdGlvbiBpcyBoYW5kbGVkXG4gIC8vIHNwZWNpYWxseSwgdGhpcyBmdW5jdGlvbiBkb2VzIG5vdCBkZWxldGUgX0pvaW4gY29sdW1ucy4gSXQgc2hvdWxkLCBob3dldmVyLCBpbmRpY2F0ZVxuICAvLyB0aGF0IHRoZSByZWxhdGlvbiBmaWVsZHMgZG9lcyBub3QgZXhpc3QgYW55bW9yZS4gSW4gbW9uZ28sIHRoaXMgbWVhbnMgcmVtb3ZpbmcgaXQgZnJvbVxuICAvLyB0aGUgX1NDSEVNQSBjb2xsZWN0aW9uLiAgVGhlcmUgc2hvdWxkIGJlIG5vIGFjdHVhbCBkYXRhIGluIHRoZSBjb2xsZWN0aW9uIHVuZGVyIHRoZSBzYW1lIG5hbWVcbiAgLy8gYXMgdGhlIHJlbGF0aW9uIGNvbHVtbiwgc28gaXQncyBmaW5lIHRvIGF0dGVtcHQgdG8gZGVsZXRlIGl0LiBJZiB0aGUgZmllbGRzIGxpc3RlZCB0byBiZVxuICAvLyBkZWxldGVkIGRvIG5vdCBleGlzdCwgdGhpcyBmdW5jdGlvbiBzaG91bGQgcmV0dXJuIHN1Y2Nlc3NmdWxseSBhbnl3YXlzLiBDaGVja2luZyBmb3JcbiAgLy8gYXR0ZW1wdHMgdG8gZGVsZXRlIG5vbi1leGlzdGVudCBmaWVsZHMgaXMgdGhlIHJlc3BvbnNpYmlsaXR5IG9mIFBhcnNlIFNlcnZlci5cblxuICAvLyBQb2ludGVyIGZpZWxkIG5hbWVzIGFyZSBwYXNzZWQgZm9yIGxlZ2FjeSByZWFzb25zOiB0aGUgb3JpZ2luYWwgbW9uZ29cbiAgLy8gZm9ybWF0IHN0b3JlZCBwb2ludGVyIGZpZWxkIG5hbWVzIGRpZmZlcmVudGx5IGluIHRoZSBkYXRhYmFzZSwgYW5kIHRoZXJlZm9yZVxuICAvLyBuZWVkZWQgdG8ga25vdyB0aGUgdHlwZSBvZiB0aGUgZmllbGQgYmVmb3JlIGl0IGNvdWxkIGRlbGV0ZSBpdC4gRnV0dXJlIGRhdGFiYXNlXG4gIC8vIGFkYXB0ZXJzIHNob3VsZCBpZ25vcmUgdGhlIHBvaW50ZXJGaWVsZE5hbWVzIGFyZ3VtZW50LiBBbGwgdGhlIGZpZWxkIG5hbWVzIGFyZSBpblxuICAvLyBmaWVsZE5hbWVzLCB0aGV5IHNob3cgdXAgYWRkaXRpb25hbGx5IGluIHRoZSBwb2ludGVyRmllbGROYW1lcyBkYXRhYmFzZSBmb3IgdXNlXG4gIC8vIGJ5IHRoZSBtb25nbyBhZGFwdGVyLCB3aGljaCBkZWFscyB3aXRoIHRoZSBsZWdhY3kgbW9uZ28gZm9ybWF0LlxuXG4gIC8vIFRoaXMgZnVuY3Rpb24gaXMgbm90IG9ibGlnYXRlZCB0byBkZWxldGUgZmllbGRzIGF0b21pY2FsbHkuIEl0IGlzIGdpdmVuIHRoZSBmaWVsZFxuICAvLyBuYW1lcyBpbiBhIGxpc3Qgc28gdGhhdCBkYXRhYmFzZXMgdGhhdCBhcmUgY2FwYWJsZSBvZiBkZWxldGluZyBmaWVsZHMgYXRvbWljYWxseVxuICAvLyBtYXkgZG8gc28uXG5cbiAgLy8gUmV0dXJucyBhIFByb21pc2UuXG4gIGRlbGV0ZUZpZWxkcyhjbGFzc05hbWU6IHN0cmluZywgc2NoZW1hOiBTY2hlbWFUeXBlLCBmaWVsZE5hbWVzOiBzdHJpbmdbXSkge1xuICAgIGNvbnN0IG1vbmdvRm9ybWF0TmFtZXMgPSBmaWVsZE5hbWVzLm1hcChmaWVsZE5hbWUgPT4ge1xuICAgICAgaWYgKHNjaGVtYS5maWVsZHNbZmllbGROYW1lXS50eXBlID09PSAnUG9pbnRlcicpIHtcbiAgICAgICAgcmV0dXJuIGBfcF8ke2ZpZWxkTmFtZX1gO1xuICAgICAgfSBlbHNlIHtcbiAgICAgICAgcmV0dXJuIGZpZWxkTmFtZTtcbiAgICAgIH1cbiAgICB9KTtcbiAgICBjb25zdCBjb2xsZWN0aW9uVXBkYXRlID0geyAkdW5zZXQ6IHt9IH07XG4gICAgbW9uZ29Gb3JtYXROYW1lcy5mb3JFYWNoKG5hbWUgPT4ge1xuICAgICAgY29sbGVjdGlvblVwZGF0ZVsnJHVuc2V0J11bbmFtZV0gPSBudWxsO1xuICAgIH0pO1xuXG4gICAgY29uc3QgY29sbGVjdGlvbkZpbHRlciA9IHsgJG9yOiBbXSB9O1xuICAgIG1vbmdvRm9ybWF0TmFtZXMuZm9yRWFjaChuYW1lID0+IHtcbiAgICAgIGNvbGxlY3Rpb25GaWx0ZXJbJyRvciddLnB1c2goeyBbbmFtZV06IHsgJGV4aXN0czogdHJ1ZSB9IH0pO1xuICAgIH0pO1xuXG4gICAgY29uc3Qgc2NoZW1hVXBkYXRlID0geyAkdW5zZXQ6IHt9IH07XG4gICAgZmllbGROYW1lcy5mb3JFYWNoKG5hbWUgPT4ge1xuICAgICAgc2NoZW1hVXBkYXRlWyckdW5zZXQnXVtuYW1lXSA9IG51bGw7XG4gICAgICBzY2hlbWFVcGRhdGVbJyR1bnNldCddW2BfbWV0YWRhdGEuZmllbGRzX29wdGlvbnMuJHtuYW1lfWBdID0gbnVsbDtcbiAgICB9KTtcblxuICAgIHJldHVybiB0aGlzLl9hZGFwdGl2ZUNvbGxlY3Rpb24oY2xhc3NOYW1lKVxuICAgICAgLnRoZW4oY29sbGVjdGlvbiA9PiBjb2xsZWN0aW9uLnVwZGF0ZU1hbnkoY29sbGVjdGlvbkZpbHRlciwgY29sbGVjdGlvblVwZGF0ZSkpXG4gICAgICAudGhlbigoKSA9PiB0aGlzLl9zY2hlbWFDb2xsZWN0aW9uKCkpXG4gICAgICAudGhlbihzY2hlbWFDb2xsZWN0aW9uID0+IHNjaGVtYUNvbGxlY3Rpb24udXBkYXRlU2NoZW1hKGNsYXNzTmFtZSwgc2NoZW1hVXBkYXRlKSlcbiAgICAgIC5jYXRjaChlcnIgPT4gdGhpcy5oYW5kbGVFcnJvcihlcnIpKTtcbiAgfVxuXG4gIC8vIFJldHVybiBhIHByb21pc2UgZm9yIGFsbCBzY2hlbWFzIGtub3duIHRvIHRoaXMgYWRhcHRlciwgaW4gUGFyc2UgZm9ybWF0LiBJbiBjYXNlIHRoZVxuICAvLyBzY2hlbWFzIGNhbm5vdCBiZSByZXRyaWV2ZWQsIHJldHVybnMgYSBwcm9taXNlIHRoYXQgcmVqZWN0cy4gUmVxdWlyZW1lbnRzIGZvciB0aGVcbiAgLy8gcmVqZWN0aW9uIHJlYXNvbiBhcmUgVEJELlxuICBnZXRBbGxDbGFzc2VzKCk6IFByb21pc2U8U3RvcmFnZUNsYXNzW10+IHtcbiAgICByZXR1cm4gdGhpcy5fc2NoZW1hQ29sbGVjdGlvbigpXG4gICAgICAudGhlbihzY2hlbWFzQ29sbGVjdGlvbiA9PiBzY2hlbWFzQ29sbGVjdGlvbi5fZmV0Y2hBbGxTY2hlbWFzRnJvbV9TQ0hFTUEoKSlcbiAgICAgIC5jYXRjaChlcnIgPT4gdGhpcy5oYW5kbGVFcnJvcihlcnIpKTtcbiAgfVxuXG4gIC8vIFJldHVybiBhIHByb21pc2UgZm9yIHRoZSBzY2hlbWEgd2l0aCB0aGUgZ2l2ZW4gbmFtZSwgaW4gUGFyc2UgZm9ybWF0LiBJZlxuICAvLyB0aGlzIGFkYXB0ZXIgZG9lc24ndCBrbm93IGFib3V0IHRoZSBzY2hlbWEsIHJldHVybiBhIHByb21pc2UgdGhhdCByZWplY3RzIHdpdGhcbiAgLy8gdW5kZWZpbmVkIGFzIHRoZSByZWFzb24uXG4gIGdldENsYXNzKGNsYXNzTmFtZTogc3RyaW5nKTogUHJvbWlzZTxTdG9yYWdlQ2xhc3M+IHtcbiAgICByZXR1cm4gdGhpcy5fc2NoZW1hQ29sbGVjdGlvbigpXG4gICAgICAudGhlbihzY2hlbWFzQ29sbGVjdGlvbiA9PiBzY2hlbWFzQ29sbGVjdGlvbi5fZmV0Y2hPbmVTY2hlbWFGcm9tX1NDSEVNQShjbGFzc05hbWUpKVxuICAgICAgLmNhdGNoKGVyciA9PiB0aGlzLmhhbmRsZUVycm9yKGVycikpO1xuICB9XG5cbiAgLy8gVE9ETzogQXMgeWV0IG5vdCBwYXJ0aWN1bGFybHkgd2VsbCBzcGVjaWZpZWQuIENyZWF0ZXMgYW4gb2JqZWN0LiBNYXliZSBzaG91bGRuJ3QgZXZlbiBuZWVkIHRoZSBzY2hlbWEsXG4gIC8vIGFuZCBzaG91bGQgaW5mZXIgZnJvbSB0aGUgdHlwZS4gT3IgbWF5YmUgZG9lcyBuZWVkIHRoZSBzY2hlbWEgZm9yIHZhbGlkYXRpb25zLiBPciBtYXliZSBuZWVkc1xuICAvLyB0aGUgc2NoZW1hIG9ubHkgZm9yIHRoZSBsZWdhY3kgbW9uZ28gZm9ybWF0LiBXZSdsbCBmaWd1cmUgdGhhdCBvdXQgbGF0ZXIuXG4gIGNyZWF0ZU9iamVjdChjbGFzc05hbWU6IHN0cmluZywgc2NoZW1hOiBTY2hlbWFUeXBlLCBvYmplY3Q6IGFueSwgdHJhbnNhY3Rpb25hbFNlc3Npb246ID9hbnkpIHtcbiAgICBzY2hlbWEgPSBjb252ZXJ0UGFyc2VTY2hlbWFUb01vbmdvU2NoZW1hKHNjaGVtYSk7XG4gICAgY29uc3QgbW9uZ29PYmplY3QgPSBwYXJzZU9iamVjdFRvTW9uZ29PYmplY3RGb3JDcmVhdGUoY2xhc3NOYW1lLCBvYmplY3QsIHNjaGVtYSk7XG4gICAgcmV0dXJuIHRoaXMuX2FkYXB0aXZlQ29sbGVjdGlvbihjbGFzc05hbWUpXG4gICAgICAudGhlbihjb2xsZWN0aW9uID0+IGNvbGxlY3Rpb24uaW5zZXJ0T25lKG1vbmdvT2JqZWN0LCB0cmFuc2FjdGlvbmFsU2Vzc2lvbikpXG4gICAgICAudGhlbigoKSA9PiAoeyBvcHM6IFttb25nb09iamVjdF0gfSkpXG4gICAgICAuY2F0Y2goZXJyb3IgPT4ge1xuICAgICAgICBpZiAoZXJyb3IuY29kZSA9PT0gMTEwMDApIHtcbiAgICAgICAgICAvLyBEdXBsaWNhdGUgdmFsdWVcbiAgICAgICAgICBjb25zdCBlcnIgPSBuZXcgUGFyc2UuRXJyb3IoXG4gICAgICAgICAgICBQYXJzZS5FcnJvci5EVVBMSUNBVEVfVkFMVUUsXG4gICAgICAgICAgICAnQSBkdXBsaWNhdGUgdmFsdWUgZm9yIGEgZmllbGQgd2l0aCB1bmlxdWUgdmFsdWVzIHdhcyBwcm92aWRlZCdcbiAgICAgICAgICApO1xuICAgICAgICAgIGVyci51bmRlcmx5aW5nRXJyb3IgPSBlcnJvcjtcbiAgICAgICAgICBpZiAoZXJyb3IubWVzc2FnZSkge1xuICAgICAgICAgICAgY29uc3QgbWF0Y2hlcyA9IGVycm9yLm1lc3NhZ2UubWF0Y2goL2luZGV4OltcXHNhLXpBLVowLTlfXFwtXFwuXStcXCQ/KFthLXpBLVpfLV0rKV8xLyk7XG4gICAgICAgICAgICBpZiAobWF0Y2hlcyAmJiBBcnJheS5pc0FycmF5KG1hdGNoZXMpKSB7XG4gICAgICAgICAgICAgIGVyci51c2VySW5mbyA9IHsgZHVwbGljYXRlZF9maWVsZDogbWF0Y2hlc1sxXSB9O1xuICAgICAgICAgICAgfVxuICAgICAgICAgIH1cbiAgICAgICAgICB0aHJvdyBlcnI7XG4gICAgICAgIH1cbiAgICAgICAgdGhyb3cgZXJyb3I7XG4gICAgICB9KVxuICAgICAgLmNhdGNoKGVyciA9PiB0aGlzLmhhbmRsZUVycm9yKGVycikpO1xuICB9XG5cbiAgLy8gUmVtb3ZlIGFsbCBvYmplY3RzIHRoYXQgbWF0Y2ggdGhlIGdpdmVuIFBhcnNlIFF1ZXJ5LlxuICAvLyBJZiBubyBvYmplY3RzIG1hdGNoLCByZWplY3Qgd2l0aCBPQkpFQ1RfTk9UX0ZPVU5ELiBJZiBvYmplY3RzIGFyZSBmb3VuZCBhbmQgZGVsZXRlZCwgcmVzb2x2ZSB3aXRoIHVuZGVmaW5lZC5cbiAgLy8gSWYgdGhlcmUgaXMgc29tZSBvdGhlciBlcnJvciwgcmVqZWN0IHdpdGggSU5URVJOQUxfU0VSVkVSX0VSUk9SLlxuICBkZWxldGVPYmplY3RzQnlRdWVyeShcbiAgICBjbGFzc05hbWU6IHN0cmluZyxcbiAgICBzY2hlbWE6IFNjaGVtYVR5cGUsXG4gICAgcXVlcnk6IFF1ZXJ5VHlwZSxcbiAgICB0cmFuc2FjdGlvbmFsU2Vzc2lvbjogP2FueVxuICApIHtcbiAgICBzY2hlbWEgPSBjb252ZXJ0UGFyc2VTY2hlbWFUb01vbmdvU2NoZW1hKHNjaGVtYSk7XG4gICAgcmV0dXJuIHRoaXMuX2FkYXB0aXZlQ29sbGVjdGlvbihjbGFzc05hbWUpXG4gICAgICAudGhlbihjb2xsZWN0aW9uID0+IHtcbiAgICAgICAgY29uc3QgbW9uZ29XaGVyZSA9IHRyYW5zZm9ybVdoZXJlKGNsYXNzTmFtZSwgcXVlcnksIHNjaGVtYSk7XG4gICAgICAgIHJldHVybiBjb2xsZWN0aW9uLmRlbGV0ZU1hbnkobW9uZ29XaGVyZSwgdHJhbnNhY3Rpb25hbFNlc3Npb24pO1xuICAgICAgfSlcbiAgICAgIC5jYXRjaChlcnIgPT4gdGhpcy5oYW5kbGVFcnJvcihlcnIpKVxuICAgICAgLnRoZW4oXG4gICAgICAgICh7IGRlbGV0ZWRDb3VudCB9KSA9PiB7XG4gICAgICAgICAgaWYgKGRlbGV0ZWRDb3VudCA9PT0gMCkge1xuICAgICAgICAgICAgdGhyb3cgbmV3IFBhcnNlLkVycm9yKFBhcnNlLkVycm9yLk9CSkVDVF9OT1RfRk9VTkQsICdPYmplY3Qgbm90IGZvdW5kLicpO1xuICAgICAgICAgIH1cbiAgICAgICAgICByZXR1cm4gUHJvbWlzZS5yZXNvbHZlKCk7XG4gICAgICAgIH0sXG4gICAgICAgICgpID0+IHtcbiAgICAgICAgICB0aHJvdyBuZXcgUGFyc2UuRXJyb3IoUGFyc2UuRXJyb3IuSU5URVJOQUxfU0VSVkVSX0VSUk9SLCAnRGF0YWJhc2UgYWRhcHRlciBlcnJvcicpO1xuICAgICAgICB9XG4gICAgICApO1xuICB9XG5cbiAgLy8gQXBwbHkgdGhlIHVwZGF0ZSB0byBhbGwgb2JqZWN0cyB0aGF0IG1hdGNoIHRoZSBnaXZlbiBQYXJzZSBRdWVyeS5cbiAgdXBkYXRlT2JqZWN0c0J5UXVlcnkoXG4gICAgY2xhc3NOYW1lOiBzdHJpbmcsXG4gICAgc2NoZW1hOiBTY2hlbWFUeXBlLFxuICAgIHF1ZXJ5OiBRdWVyeVR5cGUsXG4gICAgdXBkYXRlOiBhbnksXG4gICAgdHJhbnNhY3Rpb25hbFNlc3Npb246ID9hbnlcbiAgKSB7XG4gICAgc2NoZW1hID0gY29udmVydFBhcnNlU2NoZW1hVG9Nb25nb1NjaGVtYShzY2hlbWEpO1xuICAgIGNvbnN0IG1vbmdvVXBkYXRlID0gdHJhbnNmb3JtVXBkYXRlKGNsYXNzTmFtZSwgdXBkYXRlLCBzY2hlbWEpO1xuICAgIGNvbnN0IG1vbmdvV2hlcmUgPSB0cmFuc2Zvcm1XaGVyZShjbGFzc05hbWUsIHF1ZXJ5LCBzY2hlbWEpO1xuICAgIHJldHVybiB0aGlzLl9hZGFwdGl2ZUNvbGxlY3Rpb24oY2xhc3NOYW1lKVxuICAgICAgLnRoZW4oY29sbGVjdGlvbiA9PiBjb2xsZWN0aW9uLnVwZGF0ZU1hbnkobW9uZ29XaGVyZSwgbW9uZ29VcGRhdGUsIHRyYW5zYWN0aW9uYWxTZXNzaW9uKSlcbiAgICAgIC5jYXRjaChlcnIgPT4gdGhpcy5oYW5kbGVFcnJvcihlcnIpKTtcbiAgfVxuXG4gIC8vIEF0b21pY2FsbHkgZmluZHMgYW5kIHVwZGF0ZXMgYW4gb2JqZWN0IGJhc2VkIG9uIHF1ZXJ5LlxuICAvLyBSZXR1cm4gdmFsdWUgbm90IGN1cnJlbnRseSB3ZWxsIHNwZWNpZmllZC5cbiAgZmluZE9uZUFuZFVwZGF0ZShcbiAgICBjbGFzc05hbWU6IHN0cmluZyxcbiAgICBzY2hlbWE6IFNjaGVtYVR5cGUsXG4gICAgcXVlcnk6IFF1ZXJ5VHlwZSxcbiAgICB1cGRhdGU6IGFueSxcbiAgICB0cmFuc2FjdGlvbmFsU2Vzc2lvbjogP2FueVxuICApIHtcbiAgICBzY2hlbWEgPSBjb252ZXJ0UGFyc2VTY2hlbWFUb01vbmdvU2NoZW1hKHNjaGVtYSk7XG4gICAgY29uc3QgbW9uZ29VcGRhdGUgPSB0cmFuc2Zvcm1VcGRhdGUoY2xhc3NOYW1lLCB1cGRhdGUsIHNjaGVtYSk7XG4gICAgY29uc3QgbW9uZ29XaGVyZSA9IHRyYW5zZm9ybVdoZXJlKGNsYXNzTmFtZSwgcXVlcnksIHNjaGVtYSk7XG4gICAgcmV0dXJuIHRoaXMuX2FkYXB0aXZlQ29sbGVjdGlvbihjbGFzc05hbWUpXG4gICAgICAudGhlbihjb2xsZWN0aW9uID0+XG4gICAgICAgIGNvbGxlY3Rpb24uX21vbmdvQ29sbGVjdGlvbi5maW5kT25lQW5kVXBkYXRlKG1vbmdvV2hlcmUsIG1vbmdvVXBkYXRlLCB7XG4gICAgICAgICAgcmV0dXJuRG9jdW1lbnQ6ICdhZnRlcicsXG4gICAgICAgICAgc2Vzc2lvbjogdHJhbnNhY3Rpb25hbFNlc3Npb24gfHwgdW5kZWZpbmVkLFxuICAgICAgICB9KVxuICAgICAgKVxuICAgICAgLnRoZW4ocmVzdWx0ID0+IG1vbmdvT2JqZWN0VG9QYXJzZU9iamVjdChjbGFzc05hbWUsIHJlc3VsdC52YWx1ZSwgc2NoZW1hKSlcbiAgICAgIC5jYXRjaChlcnJvciA9PiB7XG4gICAgICAgIGlmIChlcnJvci5jb2RlID09PSAxMTAwMCkge1xuICAgICAgICAgIHRocm93IG5ldyBQYXJzZS5FcnJvcihcbiAgICAgICAgICAgIFBhcnNlLkVycm9yLkRVUExJQ0FURV9WQUxVRSxcbiAgICAgICAgICAgICdBIGR1cGxpY2F0ZSB2YWx1ZSBmb3IgYSBmaWVsZCB3aXRoIHVuaXF1ZSB2YWx1ZXMgd2FzIHByb3ZpZGVkJ1xuICAgICAgICAgICk7XG4gICAgICAgIH1cbiAgICAgICAgdGhyb3cgZXJyb3I7XG4gICAgICB9KVxuICAgICAgLmNhdGNoKGVyciA9PiB0aGlzLmhhbmRsZUVycm9yKGVycikpO1xuICB9XG5cbiAgLy8gSG9wZWZ1bGx5IHdlIGNhbiBnZXQgcmlkIG9mIHRoaXMuIEl0J3Mgb25seSB1c2VkIGZvciBjb25maWcgYW5kIGhvb2tzLlxuICB1cHNlcnRPbmVPYmplY3QoXG4gICAgY2xhc3NOYW1lOiBzdHJpbmcsXG4gICAgc2NoZW1hOiBTY2hlbWFUeXBlLFxuICAgIHF1ZXJ5OiBRdWVyeVR5cGUsXG4gICAgdXBkYXRlOiBhbnksXG4gICAgdHJhbnNhY3Rpb25hbFNlc3Npb246ID9hbnlcbiAgKSB7XG4gICAgc2NoZW1hID0gY29udmVydFBhcnNlU2NoZW1hVG9Nb25nb1NjaGVtYShzY2hlbWEpO1xuICAgIGNvbnN0IG1vbmdvVXBkYXRlID0gdHJhbnNmb3JtVXBkYXRlKGNsYXNzTmFtZSwgdXBkYXRlLCBzY2hlbWEpO1xuICAgIGNvbnN0IG1vbmdvV2hlcmUgPSB0cmFuc2Zvcm1XaGVyZShjbGFzc05hbWUsIHF1ZXJ5LCBzY2hlbWEpO1xuICAgIHJldHVybiB0aGlzLl9hZGFwdGl2ZUNvbGxlY3Rpb24oY2xhc3NOYW1lKVxuICAgICAgLnRoZW4oY29sbGVjdGlvbiA9PiBjb2xsZWN0aW9uLnVwc2VydE9uZShtb25nb1doZXJlLCBtb25nb1VwZGF0ZSwgdHJhbnNhY3Rpb25hbFNlc3Npb24pKVxuICAgICAgLmNhdGNoKGVyciA9PiB0aGlzLmhhbmRsZUVycm9yKGVycikpO1xuICB9XG5cbiAgLy8gRXhlY3V0ZXMgYSBmaW5kLiBBY2NlcHRzOiBjbGFzc05hbWUsIHF1ZXJ5IGluIFBhcnNlIGZvcm1hdCwgYW5kIHsgc2tpcCwgbGltaXQsIHNvcnQgfS5cbiAgZmluZChcbiAgICBjbGFzc05hbWU6IHN0cmluZyxcbiAgICBzY2hlbWE6IFNjaGVtYVR5cGUsXG4gICAgcXVlcnk6IFF1ZXJ5VHlwZSxcbiAgICB7IHNraXAsIGxpbWl0LCBzb3J0LCBrZXlzLCByZWFkUHJlZmVyZW5jZSwgaGludCwgY2FzZUluc2Vuc2l0aXZlLCBleHBsYWluIH06IFF1ZXJ5T3B0aW9uc1xuICApOiBQcm9taXNlPGFueT4ge1xuICAgIHZhbGlkYXRlRXhwbGFpblZhbHVlKGV4cGxhaW4pO1xuICAgIHNjaGVtYSA9IGNvbnZlcnRQYXJzZVNjaGVtYVRvTW9uZ29TY2hlbWEoc2NoZW1hKTtcbiAgICBjb25zdCBtb25nb1doZXJlID0gdHJhbnNmb3JtV2hlcmUoY2xhc3NOYW1lLCBxdWVyeSwgc2NoZW1hKTtcbiAgICBjb25zdCBtb25nb1NvcnQgPSBfLm1hcEtleXMoc29ydCwgKHZhbHVlLCBmaWVsZE5hbWUpID0+XG4gICAgICB0cmFuc2Zvcm1LZXkoY2xhc3NOYW1lLCBmaWVsZE5hbWUsIHNjaGVtYSlcbiAgICApO1xuICAgIGNvbnN0IG1vbmdvS2V5cyA9IF8ucmVkdWNlKFxuICAgICAga2V5cyxcbiAgICAgIChtZW1vLCBrZXkpID0+IHtcbiAgICAgICAgaWYgKGtleSA9PT0gJ0FDTCcpIHtcbiAgICAgICAgICBtZW1vWydfcnBlcm0nXSA9IDE7XG4gICAgICAgICAgbWVtb1snX3dwZXJtJ10gPSAxO1xuICAgICAgICB9IGVsc2Uge1xuICAgICAgICAgIG1lbW9bdHJhbnNmb3JtS2V5KGNsYXNzTmFtZSwga2V5LCBzY2hlbWEpXSA9IDE7XG4gICAgICAgIH1cbiAgICAgICAgcmV0dXJuIG1lbW87XG4gICAgICB9LFxuICAgICAge31cbiAgICApO1xuXG4gICAgLy8gSWYgd2UgYXJlbid0IHJlcXVlc3RpbmcgdGhlIGBfaWRgIGZpZWxkLCB3ZSBuZWVkIHRvIGV4cGxpY2l0bHkgb3B0IG91dFxuICAgIC8vIG9mIGl0LiBEb2luZyBzbyBpbiBwYXJzZS1zZXJ2ZXIgaXMgdW51c3VhbCwgYnV0IGl0IGNhbiBhbGxvdyB1cyB0b1xuICAgIC8vIG9wdGltaXplIHNvbWUgcXVlcmllcyB3aXRoIGNvdmVyaW5nIGluZGV4ZXMuXG4gICAgaWYgKGtleXMgJiYgIW1vbmdvS2V5cy5faWQpIHtcbiAgICAgIG1vbmdvS2V5cy5faWQgPSAwO1xuICAgIH1cblxuICAgIHJlYWRQcmVmZXJlbmNlID0gdGhpcy5fcGFyc2VSZWFkUHJlZmVyZW5jZShyZWFkUHJlZmVyZW5jZSk7XG4gICAgcmV0dXJuIHRoaXMuY3JlYXRlVGV4dEluZGV4ZXNJZk5lZWRlZChjbGFzc05hbWUsIHF1ZXJ5LCBzY2hlbWEpXG4gICAgICAudGhlbigoKSA9PiB0aGlzLl9hZGFwdGl2ZUNvbGxlY3Rpb24oY2xhc3NOYW1lKSlcbiAgICAgIC50aGVuKGNvbGxlY3Rpb24gPT5cbiAgICAgICAgY29sbGVjdGlvbi5maW5kKG1vbmdvV2hlcmUsIHtcbiAgICAgICAgICBza2lwLFxuICAgICAgICAgIGxpbWl0LFxuICAgICAgICAgIHNvcnQ6IG1vbmdvU29ydCxcbiAgICAgICAgICBrZXlzOiBtb25nb0tleXMsXG4gICAgICAgICAgbWF4VGltZU1TOiB0aGlzLl9tYXhUaW1lTVMsXG4gICAgICAgICAgcmVhZFByZWZlcmVuY2UsXG4gICAgICAgICAgaGludCxcbiAgICAgICAgICBjYXNlSW5zZW5zaXRpdmUsXG4gICAgICAgICAgZXhwbGFpbixcbiAgICAgICAgfSlcbiAgICAgIClcbiAgICAgIC50aGVuKG9iamVjdHMgPT4ge1xuICAgICAgICBpZiAoZXhwbGFpbikge1xuICAgICAgICAgIHJldHVybiBvYmplY3RzO1xuICAgICAgICB9XG4gICAgICAgIHJldHVybiBvYmplY3RzLm1hcChvYmplY3QgPT4gbW9uZ29PYmplY3RUb1BhcnNlT2JqZWN0KGNsYXNzTmFtZSwgb2JqZWN0LCBzY2hlbWEpKTtcbiAgICAgIH0pXG4gICAgICAuY2F0Y2goZXJyID0+IHRoaXMuaGFuZGxlRXJyb3IoZXJyKSk7XG4gIH1cblxuICBlbnN1cmVJbmRleChcbiAgICBjbGFzc05hbWU6IHN0cmluZyxcbiAgICBzY2hlbWE6IFNjaGVtYVR5cGUsXG4gICAgZmllbGROYW1lczogc3RyaW5nW10sXG4gICAgaW5kZXhOYW1lOiA/c3RyaW5nLFxuICAgIGNhc2VJbnNlbnNpdGl2ZTogYm9vbGVhbiA9IGZhbHNlLFxuICAgIG9wdGlvbnM/OiBPYmplY3QgPSB7fVxuICApOiBQcm9taXNlPGFueT4ge1xuICAgIHNjaGVtYSA9IGNvbnZlcnRQYXJzZVNjaGVtYVRvTW9uZ29TY2hlbWEoc2NoZW1hKTtcbiAgICBjb25zdCBpbmRleENyZWF0aW9uUmVxdWVzdCA9IHt9O1xuICAgIGNvbnN0IG1vbmdvRmllbGROYW1lcyA9IGZpZWxkTmFtZXMubWFwKGZpZWxkTmFtZSA9PiB0cmFuc2Zvcm1LZXkoY2xhc3NOYW1lLCBmaWVsZE5hbWUsIHNjaGVtYSkpO1xuICAgIG1vbmdvRmllbGROYW1lcy5mb3JFYWNoKGZpZWxkTmFtZSA9PiB7XG4gICAgICBpbmRleENyZWF0aW9uUmVxdWVzdFtmaWVsZE5hbWVdID0gb3B0aW9ucy5pbmRleFR5cGUgIT09IHVuZGVmaW5lZCA/IG9wdGlvbnMuaW5kZXhUeXBlIDogMTtcbiAgICB9KTtcblxuICAgIGNvbnN0IGRlZmF1bHRPcHRpb25zOiBPYmplY3QgPSB7IGJhY2tncm91bmQ6IHRydWUsIHNwYXJzZTogdHJ1ZSB9O1xuICAgIGNvbnN0IGluZGV4TmFtZU9wdGlvbnM6IE9iamVjdCA9IGluZGV4TmFtZSA/IHsgbmFtZTogaW5kZXhOYW1lIH0gOiB7fTtcbiAgICBjb25zdCB0dGxPcHRpb25zOiBPYmplY3QgPSBvcHRpb25zLnR0bCAhPT0gdW5kZWZpbmVkID8geyBleHBpcmVBZnRlclNlY29uZHM6IG9wdGlvbnMudHRsIH0gOiB7fTtcbiAgICBjb25zdCBjYXNlSW5zZW5zaXRpdmVPcHRpb25zOiBPYmplY3QgPSBjYXNlSW5zZW5zaXRpdmVcbiAgICAgID8geyBjb2xsYXRpb246IE1vbmdvQ29sbGVjdGlvbi5jYXNlSW5zZW5zaXRpdmVDb2xsYXRpb24oKSB9XG4gICAgICA6IHt9O1xuICAgIGNvbnN0IGluZGV4T3B0aW9uczogT2JqZWN0ID0ge1xuICAgICAgLi4uZGVmYXVsdE9wdGlvbnMsXG4gICAgICAuLi5jYXNlSW5zZW5zaXRpdmVPcHRpb25zLFxuICAgICAgLi4uaW5kZXhOYW1lT3B0aW9ucyxcbiAgICAgIC4uLnR0bE9wdGlvbnMsXG4gICAgfTtcblxuICAgIHJldHVybiB0aGlzLl9hZGFwdGl2ZUNvbGxlY3Rpb24oY2xhc3NOYW1lKVxuICAgICAgLnRoZW4oXG4gICAgICAgIGNvbGxlY3Rpb24gPT5cbiAgICAgICAgICBuZXcgUHJvbWlzZSgocmVzb2x2ZSwgcmVqZWN0KSA9PlxuICAgICAgICAgICAgY29sbGVjdGlvbi5fbW9uZ29Db2xsZWN0aW9uLmNyZWF0ZUluZGV4KGluZGV4Q3JlYXRpb25SZXF1ZXN0LCBpbmRleE9wdGlvbnMsIGVycm9yID0+XG4gICAgICAgICAgICAgIGVycm9yID8gcmVqZWN0KGVycm9yKSA6IHJlc29sdmUoKVxuICAgICAgICAgICAgKVxuICAgICAgICAgIClcbiAgICAgIClcbiAgICAgIC5jYXRjaChlcnIgPT4gdGhpcy5oYW5kbGVFcnJvcihlcnIpKTtcbiAgfVxuXG4gIC8vIENyZWF0ZSBhIHVuaXF1ZSBpbmRleC4gVW5pcXVlIGluZGV4ZXMgb24gbnVsbGFibGUgZmllbGRzIGFyZSBub3QgYWxsb3dlZC4gU2luY2Ugd2UgZG9uJ3RcbiAgLy8gY3VycmVudGx5IGtub3cgd2hpY2ggZmllbGRzIGFyZSBudWxsYWJsZSBhbmQgd2hpY2ggYXJlbid0LCB3ZSBpZ25vcmUgdGhhdCBjcml0ZXJpYS5cbiAgLy8gQXMgc3VjaCwgd2Ugc2hvdWxkbid0IGV4cG9zZSB0aGlzIGZ1bmN0aW9uIHRvIHVzZXJzIG9mIHBhcnNlIHVudGlsIHdlIGhhdmUgYW4gb3V0LW9mLWJhbmRcbiAgLy8gV2F5IG9mIGRldGVybWluaW5nIGlmIGEgZmllbGQgaXMgbnVsbGFibGUuIFVuZGVmaW5lZCBkb2Vzbid0IGNvdW50IGFnYWluc3QgdW5pcXVlbmVzcyxcbiAgLy8gd2hpY2ggaXMgd2h5IHdlIHVzZSBzcGFyc2UgaW5kZXhlcy5cbiAgZW5zdXJlVW5pcXVlbmVzcyhjbGFzc05hbWU6IHN0cmluZywgc2NoZW1hOiBTY2hlbWFUeXBlLCBmaWVsZE5hbWVzOiBzdHJpbmdbXSkge1xuICAgIHNjaGVtYSA9IGNvbnZlcnRQYXJzZVNjaGVtYVRvTW9uZ29TY2hlbWEoc2NoZW1hKTtcbiAgICBjb25zdCBpbmRleENyZWF0aW9uUmVxdWVzdCA9IHt9O1xuICAgIGNvbnN0IG1vbmdvRmllbGROYW1lcyA9IGZpZWxkTmFtZXMubWFwKGZpZWxkTmFtZSA9PiB0cmFuc2Zvcm1LZXkoY2xhc3NOYW1lLCBmaWVsZE5hbWUsIHNjaGVtYSkpO1xuICAgIG1vbmdvRmllbGROYW1lcy5mb3JFYWNoKGZpZWxkTmFtZSA9PiB7XG4gICAgICBpbmRleENyZWF0aW9uUmVxdWVzdFtmaWVsZE5hbWVdID0gMTtcbiAgICB9KTtcbiAgICByZXR1cm4gdGhpcy5fYWRhcHRpdmVDb2xsZWN0aW9uKGNsYXNzTmFtZSlcbiAgICAgIC50aGVuKGNvbGxlY3Rpb24gPT4gY29sbGVjdGlvbi5fZW5zdXJlU3BhcnNlVW5pcXVlSW5kZXhJbkJhY2tncm91bmQoaW5kZXhDcmVhdGlvblJlcXVlc3QpKVxuICAgICAgLmNhdGNoKGVycm9yID0+IHtcbiAgICAgICAgaWYgKGVycm9yLmNvZGUgPT09IDExMDAwKSB7XG4gICAgICAgICAgdGhyb3cgbmV3IFBhcnNlLkVycm9yKFxuICAgICAgICAgICAgUGFyc2UuRXJyb3IuRFVQTElDQVRFX1ZBTFVFLFxuICAgICAgICAgICAgJ1RyaWVkIHRvIGVuc3VyZSBmaWVsZCB1bmlxdWVuZXNzIGZvciBhIGNsYXNzIHRoYXQgYWxyZWFkeSBoYXMgZHVwbGljYXRlcy4nXG4gICAgICAgICAgKTtcbiAgICAgICAgfVxuICAgICAgICB0aHJvdyBlcnJvcjtcbiAgICAgIH0pXG4gICAgICAuY2F0Y2goZXJyID0+IHRoaXMuaGFuZGxlRXJyb3IoZXJyKSk7XG4gIH1cblxuICAvLyBVc2VkIGluIHRlc3RzXG4gIF9yYXdGaW5kKGNsYXNzTmFtZTogc3RyaW5nLCBxdWVyeTogUXVlcnlUeXBlKSB7XG4gICAgcmV0dXJuIHRoaXMuX2FkYXB0aXZlQ29sbGVjdGlvbihjbGFzc05hbWUpXG4gICAgICAudGhlbihjb2xsZWN0aW9uID0+XG4gICAgICAgIGNvbGxlY3Rpb24uZmluZChxdWVyeSwge1xuICAgICAgICAgIG1heFRpbWVNUzogdGhpcy5fbWF4VGltZU1TLFxuICAgICAgICB9KVxuICAgICAgKVxuICAgICAgLmNhdGNoKGVyciA9PiB0aGlzLmhhbmRsZUVycm9yKGVycikpO1xuICB9XG5cbiAgLy8gRXhlY3V0ZXMgYSBjb3VudC5cbiAgY291bnQoXG4gICAgY2xhc3NOYW1lOiBzdHJpbmcsXG4gICAgc2NoZW1hOiBTY2hlbWFUeXBlLFxuICAgIHF1ZXJ5OiBRdWVyeVR5cGUsXG4gICAgcmVhZFByZWZlcmVuY2U6ID9zdHJpbmcsXG4gICAgaGludDogP21peGVkXG4gICkge1xuICAgIHNjaGVtYSA9IGNvbnZlcnRQYXJzZVNjaGVtYVRvTW9uZ29TY2hlbWEoc2NoZW1hKTtcbiAgICByZWFkUHJlZmVyZW5jZSA9IHRoaXMuX3BhcnNlUmVhZFByZWZlcmVuY2UocmVhZFByZWZlcmVuY2UpO1xuICAgIHJldHVybiB0aGlzLl9hZGFwdGl2ZUNvbGxlY3Rpb24oY2xhc3NOYW1lKVxuICAgICAgLnRoZW4oY29sbGVjdGlvbiA9PlxuICAgICAgICBjb2xsZWN0aW9uLmNvdW50KHRyYW5zZm9ybVdoZXJlKGNsYXNzTmFtZSwgcXVlcnksIHNjaGVtYSwgdHJ1ZSksIHtcbiAgICAgICAgICBtYXhUaW1lTVM6IHRoaXMuX21heFRpbWVNUyxcbiAgICAgICAgICByZWFkUHJlZmVyZW5jZSxcbiAgICAgICAgICBoaW50LFxuICAgICAgICB9KVxuICAgICAgKVxuICAgICAgLmNhdGNoKGVyciA9PiB0aGlzLmhhbmRsZUVycm9yKGVycikpO1xuICB9XG5cbiAgZGlzdGluY3QoY2xhc3NOYW1lOiBzdHJpbmcsIHNjaGVtYTogU2NoZW1hVHlwZSwgcXVlcnk6IFF1ZXJ5VHlwZSwgZmllbGROYW1lOiBzdHJpbmcpIHtcbiAgICBzY2hlbWEgPSBjb252ZXJ0UGFyc2VTY2hlbWFUb01vbmdvU2NoZW1hKHNjaGVtYSk7XG4gICAgY29uc3QgaXNQb2ludGVyRmllbGQgPSBzY2hlbWEuZmllbGRzW2ZpZWxkTmFtZV0gJiYgc2NoZW1hLmZpZWxkc1tmaWVsZE5hbWVdLnR5cGUgPT09ICdQb2ludGVyJztcbiAgICBjb25zdCB0cmFuc2Zvcm1GaWVsZCA9IHRyYW5zZm9ybUtleShjbGFzc05hbWUsIGZpZWxkTmFtZSwgc2NoZW1hKTtcblxuICAgIHJldHVybiB0aGlzLl9hZGFwdGl2ZUNvbGxlY3Rpb24oY2xhc3NOYW1lKVxuICAgICAgLnRoZW4oY29sbGVjdGlvbiA9PlxuICAgICAgICBjb2xsZWN0aW9uLmRpc3RpbmN0KHRyYW5zZm9ybUZpZWxkLCB0cmFuc2Zvcm1XaGVyZShjbGFzc05hbWUsIHF1ZXJ5LCBzY2hlbWEpKVxuICAgICAgKVxuICAgICAgLnRoZW4ob2JqZWN0cyA9PiB7XG4gICAgICAgIG9iamVjdHMgPSBvYmplY3RzLmZpbHRlcihvYmogPT4gb2JqICE9IG51bGwpO1xuICAgICAgICByZXR1cm4gb2JqZWN0cy5tYXAob2JqZWN0ID0+IHtcbiAgICAgICAgICBpZiAoaXNQb2ludGVyRmllbGQpIHtcbiAgICAgICAgICAgIHJldHVybiB0cmFuc2Zvcm1Qb2ludGVyU3RyaW5nKHNjaGVtYSwgZmllbGROYW1lLCBvYmplY3QpO1xuICAgICAgICAgIH1cbiAgICAgICAgICByZXR1cm4gbW9uZ29PYmplY3RUb1BhcnNlT2JqZWN0KGNsYXNzTmFtZSwgb2JqZWN0LCBzY2hlbWEpO1xuICAgICAgICB9KTtcbiAgICAgIH0pXG4gICAgICAuY2F0Y2goZXJyID0+IHRoaXMuaGFuZGxlRXJyb3IoZXJyKSk7XG4gIH1cblxuICBhZ2dyZWdhdGUoXG4gICAgY2xhc3NOYW1lOiBzdHJpbmcsXG4gICAgc2NoZW1hOiBhbnksXG4gICAgcGlwZWxpbmU6IGFueSxcbiAgICByZWFkUHJlZmVyZW5jZTogP3N0cmluZyxcbiAgICBoaW50OiA/bWl4ZWQsXG4gICAgZXhwbGFpbj86IGJvb2xlYW5cbiAgKSB7XG4gICAgdmFsaWRhdGVFeHBsYWluVmFsdWUoZXhwbGFpbik7XG4gICAgbGV0IGlzUG9pbnRlckZpZWxkID0gZmFsc2U7XG4gICAgcGlwZWxpbmUgPSBwaXBlbGluZS5tYXAoc3RhZ2UgPT4ge1xuICAgICAgaWYgKHN0YWdlLiRncm91cCkge1xuICAgICAgICBzdGFnZS4kZ3JvdXAgPSB0aGlzLl9wYXJzZUFnZ3JlZ2F0ZUdyb3VwQXJncyhzY2hlbWEsIHN0YWdlLiRncm91cCk7XG4gICAgICAgIGlmIChcbiAgICAgICAgICBzdGFnZS4kZ3JvdXAuX2lkICYmXG4gICAgICAgICAgdHlwZW9mIHN0YWdlLiRncm91cC5faWQgPT09ICdzdHJpbmcnICYmXG4gICAgICAgICAgc3RhZ2UuJGdyb3VwLl9pZC5pbmRleE9mKCckX3BfJykgPj0gMFxuICAgICAgICApIHtcbiAgICAgICAgICBpc1BvaW50ZXJGaWVsZCA9IHRydWU7XG4gICAgICAgIH1cbiAgICAgIH1cbiAgICAgIGlmIChzdGFnZS4kbWF0Y2gpIHtcbiAgICAgICAgc3RhZ2UuJG1hdGNoID0gdGhpcy5fcGFyc2VBZ2dyZWdhdGVBcmdzKHNjaGVtYSwgc3RhZ2UuJG1hdGNoKTtcbiAgICAgIH1cbiAgICAgIGlmIChzdGFnZS4kcHJvamVjdCkge1xuICAgICAgICBzdGFnZS4kcHJvamVjdCA9IHRoaXMuX3BhcnNlQWdncmVnYXRlUHJvamVjdEFyZ3Moc2NoZW1hLCBzdGFnZS4kcHJvamVjdCk7XG4gICAgICB9XG4gICAgICBpZiAoc3RhZ2UuJGdlb05lYXIgJiYgc3RhZ2UuJGdlb05lYXIucXVlcnkpIHtcbiAgICAgICAgc3RhZ2UuJGdlb05lYXIucXVlcnkgPSB0aGlzLl9wYXJzZUFnZ3JlZ2F0ZUFyZ3Moc2NoZW1hLCBzdGFnZS4kZ2VvTmVhci5xdWVyeSk7XG4gICAgICB9XG4gICAgICByZXR1cm4gc3RhZ2U7XG4gICAgfSk7XG4gICAgcmVhZFByZWZlcmVuY2UgPSB0aGlzLl9wYXJzZVJlYWRQcmVmZXJlbmNlKHJlYWRQcmVmZXJlbmNlKTtcbiAgICByZXR1cm4gdGhpcy5fYWRhcHRpdmVDb2xsZWN0aW9uKGNsYXNzTmFtZSlcbiAgICAgIC50aGVuKGNvbGxlY3Rpb24gPT5cbiAgICAgICAgY29sbGVjdGlvbi5hZ2dyZWdhdGUocGlwZWxpbmUsIHtcbiAgICAgICAgICByZWFkUHJlZmVyZW5jZSxcbiAgICAgICAgICBtYXhUaW1lTVM6IHRoaXMuX21heFRpbWVNUyxcbiAgICAgICAgICBoaW50LFxuICAgICAgICAgIGV4cGxhaW4sXG4gICAgICAgIH0pXG4gICAgICApXG4gICAgICAudGhlbihyZXN1bHRzID0+IHtcbiAgICAgICAgcmVzdWx0cy5mb3JFYWNoKHJlc3VsdCA9PiB7XG4gICAgICAgICAgaWYgKE9iamVjdC5wcm90b3R5cGUuaGFzT3duUHJvcGVydHkuY2FsbChyZXN1bHQsICdfaWQnKSkge1xuICAgICAgICAgICAgaWYgKGlzUG9pbnRlckZpZWxkICYmIHJlc3VsdC5faWQpIHtcbiAgICAgICAgICAgICAgcmVzdWx0Ll9pZCA9IHJlc3VsdC5faWQuc3BsaXQoJyQnKVsxXTtcbiAgICAgICAgICAgIH1cbiAgICAgICAgICAgIGlmIChcbiAgICAgICAgICAgICAgcmVzdWx0Ll9pZCA9PSBudWxsIHx8XG4gICAgICAgICAgICAgIHJlc3VsdC5faWQgPT0gdW5kZWZpbmVkIHx8XG4gICAgICAgICAgICAgIChbJ29iamVjdCcsICdzdHJpbmcnXS5pbmNsdWRlcyh0eXBlb2YgcmVzdWx0Ll9pZCkgJiYgXy5pc0VtcHR5KHJlc3VsdC5faWQpKVxuICAgICAgICAgICAgKSB7XG4gICAgICAgICAgICAgIHJlc3VsdC5faWQgPSBudWxsO1xuICAgICAgICAgICAgfVxuICAgICAgICAgICAgcmVzdWx0Lm9iamVjdElkID0gcmVzdWx0Ll9pZDtcbiAgICAgICAgICAgIGRlbGV0ZSByZXN1bHQuX2lkO1xuICAgICAgICAgIH1cbiAgICAgICAgfSk7XG4gICAgICAgIHJldHVybiByZXN1bHRzO1xuICAgICAgfSlcbiAgICAgIC50aGVuKG9iamVjdHMgPT4gb2JqZWN0cy5tYXAob2JqZWN0ID0+IG1vbmdvT2JqZWN0VG9QYXJzZU9iamVjdChjbGFzc05hbWUsIG9iamVjdCwgc2NoZW1hKSkpXG4gICAgICAuY2F0Y2goZXJyID0+IHRoaXMuaGFuZGxlRXJyb3IoZXJyKSk7XG4gIH1cblxuICAvLyBUaGlzIGZ1bmN0aW9uIHdpbGwgcmVjdXJzaXZlbHkgdHJhdmVyc2UgdGhlIHBpcGVsaW5lIGFuZCBjb252ZXJ0IGFueSBQb2ludGVyIG9yIERhdGUgY29sdW1ucy5cbiAgLy8gSWYgd2UgZGV0ZWN0IGEgcG9pbnRlciBjb2x1bW4gd2Ugd2lsbCByZW5hbWUgdGhlIGNvbHVtbiBiZWluZyBxdWVyaWVkIGZvciB0byBtYXRjaCB0aGUgY29sdW1uXG4gIC8vIGluIHRoZSBkYXRhYmFzZS4gV2UgYWxzbyBtb2RpZnkgdGhlIHZhbHVlIHRvIHdoYXQgd2UgZXhwZWN0IHRoZSB2YWx1ZSB0byBiZSBpbiB0aGUgZGF0YWJhc2VcbiAgLy8gYXMgd2VsbC5cbiAgLy8gRm9yIGRhdGVzLCB0aGUgZHJpdmVyIGV4cGVjdHMgYSBEYXRlIG9iamVjdCwgYnV0IHdlIGhhdmUgYSBzdHJpbmcgY29taW5nIGluLiBTbyB3ZSdsbCBjb252ZXJ0XG4gIC8vIHRoZSBzdHJpbmcgdG8gYSBEYXRlIHNvIHRoZSBkcml2ZXIgY2FuIHBlcmZvcm0gdGhlIG5lY2Vzc2FyeSBjb21wYXJpc29uLlxuICAvL1xuICAvLyBUaGUgZ29hbCBvZiB0aGlzIG1ldGhvZCBpcyB0byBsb29rIGZvciB0aGUgXCJsZWF2ZXNcIiBvZiB0aGUgcGlwZWxpbmUgYW5kIGRldGVybWluZSBpZiBpdCBuZWVkc1xuICAvLyB0byBiZSBjb252ZXJ0ZWQuIFRoZSBwaXBlbGluZSBjYW4gaGF2ZSBhIGZldyBkaWZmZXJlbnQgZm9ybXMuIEZvciBtb3JlIGRldGFpbHMsIHNlZTpcbiAgLy8gICAgIGh0dHBzOi8vZG9jcy5tb25nb2RiLmNvbS9tYW51YWwvcmVmZXJlbmNlL29wZXJhdG9yL2FnZ3JlZ2F0aW9uL1xuICAvL1xuICAvLyBJZiB0aGUgcGlwZWxpbmUgaXMgYW4gYXJyYXksIGl0IG1lYW5zIHdlIGFyZSBwcm9iYWJseSBwYXJzaW5nIGFuICckYW5kJyBvciAnJG9yJyBvcGVyYXRvci4gSW5cbiAgLy8gdGhhdCBjYXNlIHdlIG5lZWQgdG8gbG9vcCB0aHJvdWdoIGFsbCBvZiBpdCdzIGNoaWxkcmVuIHRvIGZpbmQgdGhlIGNvbHVtbnMgYmVpbmcgb3BlcmF0ZWQgb24uXG4gIC8vIElmIHRoZSBwaXBlbGluZSBpcyBhbiBvYmplY3QsIHRoZW4gd2UnbGwgbG9vcCB0aHJvdWdoIHRoZSBrZXlzIGNoZWNraW5nIHRvIHNlZSBpZiB0aGUga2V5IG5hbWVcbiAgLy8gbWF0Y2hlcyBvbmUgb2YgdGhlIHNjaGVtYSBjb2x1bW5zLiBJZiBpdCBkb2VzIG1hdGNoIGEgY29sdW1uIGFuZCB0aGUgY29sdW1uIGlzIGEgUG9pbnRlciBvclxuICAvLyBhIERhdGUsIHRoZW4gd2UnbGwgY29udmVydCB0aGUgdmFsdWUgYXMgZGVzY3JpYmVkIGFib3ZlLlxuICAvL1xuICAvLyBBcyBtdWNoIGFzIEkgaGF0ZSByZWN1cnNpb24uLi50aGlzIHNlZW1lZCBsaWtlIGEgZ29vZCBmaXQgZm9yIGl0LiBXZSdyZSBlc3NlbnRpYWxseSB0cmF2ZXJzaW5nXG4gIC8vIGRvd24gYSB0cmVlIHRvIGZpbmQgYSBcImxlYWYgbm9kZVwiIGFuZCBjaGVja2luZyB0byBzZWUgaWYgaXQgbmVlZHMgdG8gYmUgY29udmVydGVkLlxuICBfcGFyc2VBZ2dyZWdhdGVBcmdzKHNjaGVtYTogYW55LCBwaXBlbGluZTogYW55KTogYW55IHtcbiAgICBpZiAocGlwZWxpbmUgPT09IG51bGwpIHtcbiAgICAgIHJldHVybiBudWxsO1xuICAgIH0gZWxzZSBpZiAoQXJyYXkuaXNBcnJheShwaXBlbGluZSkpIHtcbiAgICAgIHJldHVybiBwaXBlbGluZS5tYXAodmFsdWUgPT4gdGhpcy5fcGFyc2VBZ2dyZWdhdGVBcmdzKHNjaGVtYSwgdmFsdWUpKTtcbiAgICB9IGVsc2UgaWYgKHR5cGVvZiBwaXBlbGluZSA9PT0gJ29iamVjdCcpIHtcbiAgICAgIGNvbnN0IHJldHVyblZhbHVlID0ge307XG4gICAgICBmb3IgKGNvbnN0IGZpZWxkIGluIHBpcGVsaW5lKSB7XG4gICAgICAgIGlmIChzY2hlbWEuZmllbGRzW2ZpZWxkXSAmJiBzY2hlbWEuZmllbGRzW2ZpZWxkXS50eXBlID09PSAnUG9pbnRlcicpIHtcbiAgICAgICAgICBpZiAodHlwZW9mIHBpcGVsaW5lW2ZpZWxkXSA9PT0gJ29iamVjdCcpIHtcbiAgICAgICAgICAgIC8vIFBhc3Mgb2JqZWN0cyBkb3duIHRvIE1vbmdvREIuLi50aGlzIGlzIG1vcmUgdGhhbiBsaWtlbHkgYW4gJGV4aXN0cyBvcGVyYXRvci5cbiAgICAgICAgICAgIHJldHVyblZhbHVlW2BfcF8ke2ZpZWxkfWBdID0gcGlwZWxpbmVbZmllbGRdO1xuICAgICAgICAgIH0gZWxzZSB7XG4gICAgICAgICAgICByZXR1cm5WYWx1ZVtgX3BfJHtmaWVsZH1gXSA9IGAke3NjaGVtYS5maWVsZHNbZmllbGRdLnRhcmdldENsYXNzfSQke3BpcGVsaW5lW2ZpZWxkXX1gO1xuICAgICAgICAgIH1cbiAgICAgICAgfSBlbHNlIGlmIChzY2hlbWEuZmllbGRzW2ZpZWxkXSAmJiBzY2hlbWEuZmllbGRzW2ZpZWxkXS50eXBlID09PSAnRGF0ZScpIHtcbiAgICAgICAgICByZXR1cm5WYWx1ZVtmaWVsZF0gPSB0aGlzLl9jb252ZXJ0VG9EYXRlKHBpcGVsaW5lW2ZpZWxkXSk7XG4gICAgICAgIH0gZWxzZSB7XG4gICAgICAgICAgcmV0dXJuVmFsdWVbZmllbGRdID0gdGhpcy5fcGFyc2VBZ2dyZWdhdGVBcmdzKHNjaGVtYSwgcGlwZWxpbmVbZmllbGRdKTtcbiAgICAgICAgfVxuXG4gICAgICAgIGlmIChmaWVsZCA9PT0gJ29iamVjdElkJykge1xuICAgICAgICAgIHJldHVyblZhbHVlWydfaWQnXSA9IHJldHVyblZhbHVlW2ZpZWxkXTtcbiAgICAgICAgICBkZWxldGUgcmV0dXJuVmFsdWVbZmllbGRdO1xuICAgICAgICB9IGVsc2UgaWYgKGZpZWxkID09PSAnY3JlYXRlZEF0Jykge1xuICAgICAgICAgIHJldHVyblZhbHVlWydfY3JlYXRlZF9hdCddID0gcmV0dXJuVmFsdWVbZmllbGRdO1xuICAgICAgICAgIGRlbGV0ZSByZXR1cm5WYWx1ZVtmaWVsZF07XG4gICAgICAgIH0gZWxzZSBpZiAoZmllbGQgPT09ICd1cGRhdGVkQXQnKSB7XG4gICAgICAgICAgcmV0dXJuVmFsdWVbJ191cGRhdGVkX2F0J10gPSByZXR1cm5WYWx1ZVtmaWVsZF07XG4gICAgICAgICAgZGVsZXRlIHJldHVyblZhbHVlW2ZpZWxkXTtcbiAgICAgICAgfVxuICAgICAgfVxuICAgICAgcmV0dXJuIHJldHVyblZhbHVlO1xuICAgIH1cbiAgICByZXR1cm4gcGlwZWxpbmU7XG4gIH1cblxuICAvLyBUaGlzIGZ1bmN0aW9uIGlzIHNsaWdodGx5IGRpZmZlcmVudCB0aGFuIHRoZSBvbmUgYWJvdmUuIFJhdGhlciB0aGFuIHRyeWluZyB0byBjb21iaW5lIHRoZXNlXG4gIC8vIHR3byBmdW5jdGlvbnMgYW5kIG1ha2luZyB0aGUgY29kZSBldmVuIGhhcmRlciB0byB1bmRlcnN0YW5kLCBJIGRlY2lkZWQgdG8gc3BsaXQgaXQgdXAuIFRoZVxuICAvLyBkaWZmZXJlbmNlIHdpdGggdGhpcyBmdW5jdGlvbiBpcyB3ZSBhcmUgbm90IHRyYW5zZm9ybWluZyB0aGUgdmFsdWVzLCBvbmx5IHRoZSBrZXlzIG9mIHRoZVxuICAvLyBwaXBlbGluZS5cbiAgX3BhcnNlQWdncmVnYXRlUHJvamVjdEFyZ3Moc2NoZW1hOiBhbnksIHBpcGVsaW5lOiBhbnkpOiBhbnkge1xuICAgIGNvbnN0IHJldHVyblZhbHVlID0ge307XG4gICAgZm9yIChjb25zdCBmaWVsZCBpbiBwaXBlbGluZSkge1xuICAgICAgaWYgKHNjaGVtYS5maWVsZHNbZmllbGRdICYmIHNjaGVtYS5maWVsZHNbZmllbGRdLnR5cGUgPT09ICdQb2ludGVyJykge1xuICAgICAgICByZXR1cm5WYWx1ZVtgX3BfJHtmaWVsZH1gXSA9IHBpcGVsaW5lW2ZpZWxkXTtcbiAgICAgIH0gZWxzZSB7XG4gICAgICAgIHJldHVyblZhbHVlW2ZpZWxkXSA9IHRoaXMuX3BhcnNlQWdncmVnYXRlQXJncyhzY2hlbWEsIHBpcGVsaW5lW2ZpZWxkXSk7XG4gICAgICB9XG5cbiAgICAgIGlmIChmaWVsZCA9PT0gJ29iamVjdElkJykge1xuICAgICAgICByZXR1cm5WYWx1ZVsnX2lkJ10gPSByZXR1cm5WYWx1ZVtmaWVsZF07XG4gICAgICAgIGRlbGV0ZSByZXR1cm5WYWx1ZVtmaWVsZF07XG4gICAgICB9IGVsc2UgaWYgKGZpZWxkID09PSAnY3JlYXRlZEF0Jykge1xuICAgICAgICByZXR1cm5WYWx1ZVsnX2NyZWF0ZWRfYXQnXSA9IHJldHVyblZhbHVlW2ZpZWxkXTtcbiAgICAgICAgZGVsZXRlIHJldHVyblZhbHVlW2ZpZWxkXTtcbiAgICAgIH0gZWxzZSBpZiAoZmllbGQgPT09ICd1cGRhdGVkQXQnKSB7XG4gICAgICAgIHJldHVyblZhbHVlWydfdXBkYXRlZF9hdCddID0gcmV0dXJuVmFsdWVbZmllbGRdO1xuICAgICAgICBkZWxldGUgcmV0dXJuVmFsdWVbZmllbGRdO1xuICAgICAgfVxuICAgIH1cbiAgICByZXR1cm4gcmV0dXJuVmFsdWU7XG4gIH1cblxuICAvLyBUaGlzIGZ1bmN0aW9uIGlzIHNsaWdodGx5IGRpZmZlcmVudCB0aGFuIHRoZSB0d28gYWJvdmUuIE1vbmdvREIgJGdyb3VwIGFnZ3JlZ2F0ZSBsb29rcyBsaWtlOlxuICAvLyAgICAgeyAkZ3JvdXA6IHsgX2lkOiA8ZXhwcmVzc2lvbj4sIDxmaWVsZDE+OiB7IDxhY2N1bXVsYXRvcjE+IDogPGV4cHJlc3Npb24xPiB9LCAuLi4gfSB9XG4gIC8vIFRoZSA8ZXhwcmVzc2lvbj4gY291bGQgYmUgYSBjb2x1bW4gbmFtZSwgcHJlZml4ZWQgd2l0aCB0aGUgJyQnIGNoYXJhY3Rlci4gV2UnbGwgbG9vayBmb3JcbiAgLy8gdGhlc2UgPGV4cHJlc3Npb24+IGFuZCBjaGVjayB0byBzZWUgaWYgaXQgaXMgYSAnUG9pbnRlcicgb3IgaWYgaXQncyBvbmUgb2YgY3JlYXRlZEF0LFxuICAvLyB1cGRhdGVkQXQgb3Igb2JqZWN0SWQgYW5kIGNoYW5nZSBpdCBhY2NvcmRpbmdseS5cbiAgX3BhcnNlQWdncmVnYXRlR3JvdXBBcmdzKHNjaGVtYTogYW55LCBwaXBlbGluZTogYW55KTogYW55IHtcbiAgICBpZiAoQXJyYXkuaXNBcnJheShwaXBlbGluZSkpIHtcbiAgICAgIHJldHVybiBwaXBlbGluZS5tYXAodmFsdWUgPT4gdGhpcy5fcGFyc2VBZ2dyZWdhdGVHcm91cEFyZ3Moc2NoZW1hLCB2YWx1ZSkpO1xuICAgIH0gZWxzZSBpZiAodHlwZW9mIHBpcGVsaW5lID09PSAnb2JqZWN0Jykge1xuICAgICAgY29uc3QgcmV0dXJuVmFsdWUgPSB7fTtcbiAgICAgIGZvciAoY29uc3QgZmllbGQgaW4gcGlwZWxpbmUpIHtcbiAgICAgICAgcmV0dXJuVmFsdWVbZmllbGRdID0gdGhpcy5fcGFyc2VBZ2dyZWdhdGVHcm91cEFyZ3Moc2NoZW1hLCBwaXBlbGluZVtmaWVsZF0pO1xuICAgICAgfVxuICAgICAgcmV0dXJuIHJldHVyblZhbHVlO1xuICAgIH0gZWxzZSBpZiAodHlwZW9mIHBpcGVsaW5lID09PSAnc3RyaW5nJykge1xuICAgICAgY29uc3QgZmllbGQgPSBwaXBlbGluZS5zdWJzdHJpbmcoMSk7XG4gICAgICBpZiAoc2NoZW1hLmZpZWxkc1tmaWVsZF0gJiYgc2NoZW1hLmZpZWxkc1tmaWVsZF0udHlwZSA9PT0gJ1BvaW50ZXInKSB7XG4gICAgICAgIHJldHVybiBgJF9wXyR7ZmllbGR9YDtcbiAgICAgIH0gZWxzZSBpZiAoZmllbGQgPT0gJ2NyZWF0ZWRBdCcpIHtcbiAgICAgICAgcmV0dXJuICckX2NyZWF0ZWRfYXQnO1xuICAgICAgfSBlbHNlIGlmIChmaWVsZCA9PSAndXBkYXRlZEF0Jykge1xuICAgICAgICByZXR1cm4gJyRfdXBkYXRlZF9hdCc7XG4gICAgICB9XG4gICAgfVxuICAgIHJldHVybiBwaXBlbGluZTtcbiAgfVxuXG4gIC8vIFRoaXMgZnVuY3Rpb24gd2lsbCBhdHRlbXB0IHRvIGNvbnZlcnQgdGhlIHByb3ZpZGVkIHZhbHVlIHRvIGEgRGF0ZSBvYmplY3QuIFNpbmNlIHRoaXMgaXMgcGFydFxuICAvLyBvZiBhbiBhZ2dyZWdhdGlvbiBwaXBlbGluZSwgdGhlIHZhbHVlIGNhbiBlaXRoZXIgYmUgYSBzdHJpbmcgb3IgaXQgY2FuIGJlIGFub3RoZXIgb2JqZWN0IHdpdGhcbiAgLy8gYW4gb3BlcmF0b3IgaW4gaXQgKGxpa2UgJGd0LCAkbHQsIGV0YykuIEJlY2F1c2Ugb2YgdGhpcyBJIGZlbHQgaXQgd2FzIGVhc2llciB0byBtYWtlIHRoaXMgYVxuICAvLyByZWN1cnNpdmUgbWV0aG9kIHRvIHRyYXZlcnNlIGRvd24gdG8gdGhlIFwibGVhZiBub2RlXCIgd2hpY2ggaXMgZ29pbmcgdG8gYmUgdGhlIHN0cmluZy5cbiAgX2NvbnZlcnRUb0RhdGUodmFsdWU6IGFueSk6IGFueSB7XG4gICAgaWYgKHZhbHVlIGluc3RhbmNlb2YgRGF0ZSkge1xuICAgICAgcmV0dXJuIHZhbHVlO1xuICAgIH1cbiAgICBpZiAodHlwZW9mIHZhbHVlID09PSAnc3RyaW5nJykge1xuICAgICAgcmV0dXJuIG5ldyBEYXRlKHZhbHVlKTtcbiAgICB9XG5cbiAgICBjb25zdCByZXR1cm5WYWx1ZSA9IHt9O1xuICAgIGZvciAoY29uc3QgZmllbGQgaW4gdmFsdWUpIHtcbiAgICAgIHJldHVyblZhbHVlW2ZpZWxkXSA9IHRoaXMuX2NvbnZlcnRUb0RhdGUodmFsdWVbZmllbGRdKTtcbiAgICB9XG4gICAgcmV0dXJuIHJldHVyblZhbHVlO1xuICB9XG5cbiAgX3BhcnNlUmVhZFByZWZlcmVuY2UocmVhZFByZWZlcmVuY2U6ID9zdHJpbmcpOiA/c3RyaW5nIHtcbiAgICBpZiAocmVhZFByZWZlcmVuY2UpIHtcbiAgICAgIHJlYWRQcmVmZXJlbmNlID0gcmVhZFByZWZlcmVuY2UudG9VcHBlckNhc2UoKTtcbiAgICB9XG4gICAgc3dpdGNoIChyZWFkUHJlZmVyZW5jZSkge1xuICAgICAgY2FzZSAnUFJJTUFSWSc6XG4gICAgICAgIHJlYWRQcmVmZXJlbmNlID0gUmVhZFByZWZlcmVuY2UuUFJJTUFSWTtcbiAgICAgICAgYnJlYWs7XG4gICAgICBjYXNlICdQUklNQVJZX1BSRUZFUlJFRCc6XG4gICAgICAgIHJlYWRQcmVmZXJlbmNlID0gUmVhZFByZWZlcmVuY2UuUFJJTUFSWV9QUkVGRVJSRUQ7XG4gICAgICAgIGJyZWFrO1xuICAgICAgY2FzZSAnU0VDT05EQVJZJzpcbiAgICAgICAgcmVhZFByZWZlcmVuY2UgPSBSZWFkUHJlZmVyZW5jZS5TRUNPTkRBUlk7XG4gICAgICAgIGJyZWFrO1xuICAgICAgY2FzZSAnU0VDT05EQVJZX1BSRUZFUlJFRCc6XG4gICAgICAgIHJlYWRQcmVmZXJlbmNlID0gUmVhZFByZWZlcmVuY2UuU0VDT05EQVJZX1BSRUZFUlJFRDtcbiAgICAgICAgYnJlYWs7XG4gICAgICBjYXNlICdORUFSRVNUJzpcbiAgICAgICAgcmVhZFByZWZlcmVuY2UgPSBSZWFkUHJlZmVyZW5jZS5ORUFSRVNUO1xuICAgICAgICBicmVhaztcbiAgICAgIGNhc2UgdW5kZWZpbmVkOlxuICAgICAgY2FzZSBudWxsOlxuICAgICAgY2FzZSAnJzpcbiAgICAgICAgYnJlYWs7XG4gICAgICBkZWZhdWx0OlxuICAgICAgICB0aHJvdyBuZXcgUGFyc2UuRXJyb3IoUGFyc2UuRXJyb3IuSU5WQUxJRF9RVUVSWSwgJ05vdCBzdXBwb3J0ZWQgcmVhZCBwcmVmZXJlbmNlLicpO1xuICAgIH1cbiAgICByZXR1cm4gcmVhZFByZWZlcmVuY2U7XG4gIH1cblxuICBwZXJmb3JtSW5pdGlhbGl6YXRpb24oKTogUHJvbWlzZTx2b2lkPiB7XG4gICAgcmV0dXJuIFByb21pc2UucmVzb2x2ZSgpO1xuICB9XG5cbiAgY3JlYXRlSW5kZXgoY2xhc3NOYW1lOiBzdHJpbmcsIGluZGV4OiBhbnkpIHtcbiAgICByZXR1cm4gdGhpcy5fYWRhcHRpdmVDb2xsZWN0aW9uKGNsYXNzTmFtZSlcbiAgICAgIC50aGVuKGNvbGxlY3Rpb24gPT4gY29sbGVjdGlvbi5fbW9uZ29Db2xsZWN0aW9uLmNyZWF0ZUluZGV4KGluZGV4KSlcbiAgICAgIC5jYXRjaChlcnIgPT4gdGhpcy5oYW5kbGVFcnJvcihlcnIpKTtcbiAgfVxuXG4gIGNyZWF0ZUluZGV4ZXMoY2xhc3NOYW1lOiBzdHJpbmcsIGluZGV4ZXM6IGFueSkge1xuICAgIHJldHVybiB0aGlzLl9hZGFwdGl2ZUNvbGxlY3Rpb24oY2xhc3NOYW1lKVxuICAgICAgLnRoZW4oY29sbGVjdGlvbiA9PiBjb2xsZWN0aW9uLl9tb25nb0NvbGxlY3Rpb24uY3JlYXRlSW5kZXhlcyhpbmRleGVzKSlcbiAgICAgIC5jYXRjaChlcnIgPT4gdGhpcy5oYW5kbGVFcnJvcihlcnIpKTtcbiAgfVxuXG4gIGNyZWF0ZUluZGV4ZXNJZk5lZWRlZChjbGFzc05hbWU6IHN0cmluZywgZmllbGROYW1lOiBzdHJpbmcsIHR5cGU6IGFueSkge1xuICAgIGlmICh0eXBlICYmIHR5cGUudHlwZSA9PT0gJ1BvbHlnb24nKSB7XG4gICAgICBjb25zdCBpbmRleCA9IHtcbiAgICAgICAgW2ZpZWxkTmFtZV06ICcyZHNwaGVyZScsXG4gICAgICB9O1xuICAgICAgcmV0dXJuIHRoaXMuY3JlYXRlSW5kZXgoY2xhc3NOYW1lLCBpbmRleCk7XG4gICAgfVxuICAgIHJldHVybiBQcm9taXNlLnJlc29sdmUoKTtcbiAgfVxuXG4gIGNyZWF0ZVRleHRJbmRleGVzSWZOZWVkZWQoY2xhc3NOYW1lOiBzdHJpbmcsIHF1ZXJ5OiBRdWVyeVR5cGUsIHNjaGVtYTogYW55KTogUHJvbWlzZTx2b2lkPiB7XG4gICAgZm9yIChjb25zdCBmaWVsZE5hbWUgaW4gcXVlcnkpIHtcbiAgICAgIGlmICghcXVlcnlbZmllbGROYW1lXSB8fCAhcXVlcnlbZmllbGROYW1lXS4kdGV4dCkge1xuICAgICAgICBjb250aW51ZTtcbiAgICAgIH1cbiAgICAgIGNvbnN0IGV4aXN0aW5nSW5kZXhlcyA9IHNjaGVtYS5pbmRleGVzO1xuICAgICAgZm9yIChjb25zdCBrZXkgaW4gZXhpc3RpbmdJbmRleGVzKSB7XG4gICAgICAgIGNvbnN0IGluZGV4ID0gZXhpc3RpbmdJbmRleGVzW2tleV07XG4gICAgICAgIGlmIChPYmplY3QucHJvdG90eXBlLmhhc093blByb3BlcnR5LmNhbGwoaW5kZXgsIGZpZWxkTmFtZSkpIHtcbiAgICAgICAgICByZXR1cm4gUHJvbWlzZS5yZXNvbHZlKCk7XG4gICAgICAgIH1cbiAgICAgIH1cbiAgICAgIGNvbnN0IGluZGV4TmFtZSA9IGAke2ZpZWxkTmFtZX1fdGV4dGA7XG4gICAgICBjb25zdCB0ZXh0SW5kZXggPSB7XG4gICAgICAgIFtpbmRleE5hbWVdOiB7IFtmaWVsZE5hbWVdOiAndGV4dCcgfSxcbiAgICAgIH07XG4gICAgICByZXR1cm4gdGhpcy5zZXRJbmRleGVzV2l0aFNjaGVtYUZvcm1hdChcbiAgICAgICAgY2xhc3NOYW1lLFxuICAgICAgICB0ZXh0SW5kZXgsXG4gICAgICAgIGV4aXN0aW5nSW5kZXhlcyxcbiAgICAgICAgc2NoZW1hLmZpZWxkc1xuICAgICAgKS5jYXRjaChlcnJvciA9PiB7XG4gICAgICAgIGlmIChlcnJvci5jb2RlID09PSA4NSkge1xuICAgICAgICAgIC8vIEluZGV4IGV4aXN0IHdpdGggZGlmZmVyZW50IG9wdGlvbnNcbiAgICAgICAgICByZXR1cm4gdGhpcy5zZXRJbmRleGVzRnJvbU1vbmdvKGNsYXNzTmFtZSk7XG4gICAgICAgIH1cbiAgICAgICAgdGhyb3cgZXJyb3I7XG4gICAgICB9KTtcbiAgICB9XG4gICAgcmV0dXJuIFByb21pc2UucmVzb2x2ZSgpO1xuICB9XG5cbiAgZ2V0SW5kZXhlcyhjbGFzc05hbWU6IHN0cmluZykge1xuICAgIHJldHVybiB0aGlzLl9hZGFwdGl2ZUNvbGxlY3Rpb24oY2xhc3NOYW1lKVxuICAgICAgLnRoZW4oY29sbGVjdGlvbiA9PiBjb2xsZWN0aW9uLl9tb25nb0NvbGxlY3Rpb24uaW5kZXhlcygpKVxuICAgICAgLmNhdGNoKGVyciA9PiB0aGlzLmhhbmRsZUVycm9yKGVycikpO1xuICB9XG5cbiAgZHJvcEluZGV4KGNsYXNzTmFtZTogc3RyaW5nLCBpbmRleDogYW55KSB7XG4gICAgcmV0dXJuIHRoaXMuX2FkYXB0aXZlQ29sbGVjdGlvbihjbGFzc05hbWUpXG4gICAgICAudGhlbihjb2xsZWN0aW9uID0+IGNvbGxlY3Rpb24uX21vbmdvQ29sbGVjdGlvbi5kcm9wSW5kZXgoaW5kZXgpKVxuICAgICAgLmNhdGNoKGVyciA9PiB0aGlzLmhhbmRsZUVycm9yKGVycikpO1xuICB9XG5cbiAgZHJvcEFsbEluZGV4ZXMoY2xhc3NOYW1lOiBzdHJpbmcpIHtcbiAgICByZXR1cm4gdGhpcy5fYWRhcHRpdmVDb2xsZWN0aW9uKGNsYXNzTmFtZSlcbiAgICAgIC50aGVuKGNvbGxlY3Rpb24gPT4gY29sbGVjdGlvbi5fbW9uZ29Db2xsZWN0aW9uLmRyb3BJbmRleGVzKCkpXG4gICAgICAuY2F0Y2goZXJyID0+IHRoaXMuaGFuZGxlRXJyb3IoZXJyKSk7XG4gIH1cblxuICB1cGRhdGVTY2hlbWFXaXRoSW5kZXhlcygpOiBQcm9taXNlPGFueT4ge1xuICAgIHJldHVybiB0aGlzLmdldEFsbENsYXNzZXMoKVxuICAgICAgLnRoZW4oY2xhc3NlcyA9PiB7XG4gICAgICAgIGNvbnN0IHByb21pc2VzID0gY2xhc3Nlcy5tYXAoc2NoZW1hID0+IHtcbiAgICAgICAgICByZXR1cm4gdGhpcy5zZXRJbmRleGVzRnJvbU1vbmdvKHNjaGVtYS5jbGFzc05hbWUpO1xuICAgICAgICB9KTtcbiAgICAgICAgcmV0dXJuIFByb21pc2UuYWxsKHByb21pc2VzKTtcbiAgICAgIH0pXG4gICAgICAuY2F0Y2goZXJyID0+IHRoaXMuaGFuZGxlRXJyb3IoZXJyKSk7XG4gIH1cblxuICBjcmVhdGVUcmFuc2FjdGlvbmFsU2Vzc2lvbigpOiBQcm9taXNlPGFueT4ge1xuICAgIGNvbnN0IHRyYW5zYWN0aW9uYWxTZWN0aW9uID0gdGhpcy5jbGllbnQuc3RhcnRTZXNzaW9uKCk7XG4gICAgdHJhbnNhY3Rpb25hbFNlY3Rpb24uc3RhcnRUcmFuc2FjdGlvbigpO1xuICAgIHJldHVybiBQcm9taXNlLnJlc29sdmUodHJhbnNhY3Rpb25hbFNlY3Rpb24pO1xuICB9XG5cbiAgY29tbWl0VHJhbnNhY3Rpb25hbFNlc3Npb24odHJhbnNhY3Rpb25hbFNlY3Rpb246IGFueSk6IFByb21pc2U8dm9pZD4ge1xuICAgIGNvbnN0IGNvbW1pdCA9IHJldHJpZXMgPT4ge1xuICAgICAgcmV0dXJuIHRyYW5zYWN0aW9uYWxTZWN0aW9uXG4gICAgICAgIC5jb21taXRUcmFuc2FjdGlvbigpXG4gICAgICAgIC5jYXRjaChlcnJvciA9PiB7XG4gICAgICAgICAgaWYgKGVycm9yICYmIGVycm9yLmhhc0Vycm9yTGFiZWwoJ1RyYW5zaWVudFRyYW5zYWN0aW9uRXJyb3InKSAmJiByZXRyaWVzID4gMCkge1xuICAgICAgICAgICAgcmV0dXJuIGNvbW1pdChyZXRyaWVzIC0gMSk7XG4gICAgICAgICAgfVxuICAgICAgICAgIHRocm93IGVycm9yO1xuICAgICAgICB9KVxuICAgICAgICAudGhlbigoKSA9PiB7XG4gICAgICAgICAgdHJhbnNhY3Rpb25hbFNlY3Rpb24uZW5kU2Vzc2lvbigpO1xuICAgICAgICB9KTtcbiAgICB9O1xuICAgIHJldHVybiBjb21taXQoNSk7XG4gIH1cblxuICBhYm9ydFRyYW5zYWN0aW9uYWxTZXNzaW9uKHRyYW5zYWN0aW9uYWxTZWN0aW9uOiBhbnkpOiBQcm9taXNlPHZvaWQ+IHtcbiAgICByZXR1cm4gdHJhbnNhY3Rpb25hbFNlY3Rpb24uYWJvcnRUcmFuc2FjdGlvbigpLnRoZW4oKCkgPT4ge1xuICAgICAgdHJhbnNhY3Rpb25hbFNlY3Rpb24uZW5kU2Vzc2lvbigpO1xuICAgIH0pO1xuICB9XG59XG5cbmV4cG9ydCBkZWZhdWx0IE1vbmdvU3RvcmFnZUFkYXB0ZXI7XG4iXX0=