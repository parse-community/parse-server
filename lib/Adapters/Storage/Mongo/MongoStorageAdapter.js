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

function ownKeys(object, enumerableOnly) { var keys = Object.keys(object); if (Object.getOwnPropertySymbols) { var symbols = Object.getOwnPropertySymbols(object); if (enumerableOnly) symbols = symbols.filter(function (sym) { return Object.getOwnPropertyDescriptor(object, sym).enumerable; }); keys.push.apply(keys, symbols); } return keys; }

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

const convertParseSchemaToMongoSchema = (_ref) => {
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
    this._mongoOptions.useUnifiedTopology = true; // MaxTimeMS is not a global MongoDB client option, it is applied per operation.

    this._maxTimeMS = mongoOptions.maxTimeMS;
    this.canSortOnJoinTables = true;
    delete mongoOptions.maxTimeMS;
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

      database.on('error', () => {
        delete this.connectionPromise;
      });
      database.on('close', () => {
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
    return this.connect().then(() => this._adaptiveCollection(MongoSchemaCollectionName)).then(collection => new _MongoSchemaCollection.default(collection));
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
          if (!Object.prototype.hasOwnProperty.call(fields, key.indexOf('_p_') === 0 ? key.replace('_p_', '') : key)) {
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
    return this._adaptiveCollection(className).then(collection => collection.insertOne(mongoObject, transactionalSession)).catch(error => {
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
      result
    }) => {
      if (result.n === 0) {
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
      returnOriginal: false,
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
    return transactionalSection.commitTransaction().then(() => {
      transactionalSection.endSession();
    });
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
//# sourceMappingURL=data:application/json;charset=utf-8;base64,eyJ2ZXJzaW9uIjozLCJzb3VyY2VzIjpbIi4uLy4uLy4uLy4uL3NyYy9BZGFwdGVycy9TdG9yYWdlL01vbmdvL01vbmdvU3RvcmFnZUFkYXB0ZXIuanMiXSwibmFtZXMiOlsibW9uZ29kYiIsInJlcXVpcmUiLCJNb25nb0NsaWVudCIsIlJlYWRQcmVmZXJlbmNlIiwiTW9uZ29TY2hlbWFDb2xsZWN0aW9uTmFtZSIsInN0b3JhZ2VBZGFwdGVyQWxsQ29sbGVjdGlvbnMiLCJtb25nb0FkYXB0ZXIiLCJjb25uZWN0IiwidGhlbiIsImRhdGFiYXNlIiwiY29sbGVjdGlvbnMiLCJmaWx0ZXIiLCJjb2xsZWN0aW9uIiwibmFtZXNwYWNlIiwibWF0Y2giLCJjb2xsZWN0aW9uTmFtZSIsImluZGV4T2YiLCJfY29sbGVjdGlvblByZWZpeCIsImNvbnZlcnRQYXJzZVNjaGVtYVRvTW9uZ29TY2hlbWEiLCJzY2hlbWEiLCJmaWVsZHMiLCJfcnBlcm0iLCJfd3Blcm0iLCJjbGFzc05hbWUiLCJfaGFzaGVkX3Bhc3N3b3JkIiwibW9uZ29TY2hlbWFGcm9tRmllbGRzQW5kQ2xhc3NOYW1lQW5kQ0xQIiwiY2xhc3NMZXZlbFBlcm1pc3Npb25zIiwiaW5kZXhlcyIsIm1vbmdvT2JqZWN0IiwiX2lkIiwib2JqZWN0SWQiLCJ1cGRhdGVkQXQiLCJjcmVhdGVkQXQiLCJfbWV0YWRhdGEiLCJ1bmRlZmluZWQiLCJmaWVsZE5hbWUiLCJ0eXBlIiwidGFyZ2V0Q2xhc3MiLCJmaWVsZE9wdGlvbnMiLCJNb25nb1NjaGVtYUNvbGxlY3Rpb24iLCJwYXJzZUZpZWxkVHlwZVRvTW9uZ29GaWVsZFR5cGUiLCJPYmplY3QiLCJrZXlzIiwibGVuZ3RoIiwiZmllbGRzX29wdGlvbnMiLCJjbGFzc19wZXJtaXNzaW9ucyIsIk1vbmdvU3RvcmFnZUFkYXB0ZXIiLCJjb25zdHJ1Y3RvciIsInVyaSIsImRlZmF1bHRzIiwiRGVmYXVsdE1vbmdvVVJJIiwiY29sbGVjdGlvblByZWZpeCIsIm1vbmdvT3B0aW9ucyIsIl91cmkiLCJfbW9uZ29PcHRpb25zIiwidXNlTmV3VXJsUGFyc2VyIiwidXNlVW5pZmllZFRvcG9sb2d5IiwiX21heFRpbWVNUyIsIm1heFRpbWVNUyIsImNhblNvcnRPbkpvaW5UYWJsZXMiLCJjb25uZWN0aW9uUHJvbWlzZSIsImVuY29kZWRVcmkiLCJjbGllbnQiLCJvcHRpb25zIiwicyIsImRiIiwiZGJOYW1lIiwib24iLCJjYXRjaCIsImVyciIsIlByb21pc2UiLCJyZWplY3QiLCJoYW5kbGVFcnJvciIsImVycm9yIiwiY29kZSIsImxvZ2dlciIsImhhbmRsZVNodXRkb3duIiwicmVzb2x2ZSIsImNsb3NlIiwiX2FkYXB0aXZlQ29sbGVjdGlvbiIsIm5hbWUiLCJyYXdDb2xsZWN0aW9uIiwiTW9uZ29Db2xsZWN0aW9uIiwiX3NjaGVtYUNvbGxlY3Rpb24iLCJjbGFzc0V4aXN0cyIsImxpc3RDb2xsZWN0aW9ucyIsInRvQXJyYXkiLCJzZXRDbGFzc0xldmVsUGVybWlzc2lvbnMiLCJDTFBzIiwic2NoZW1hQ29sbGVjdGlvbiIsInVwZGF0ZVNjaGVtYSIsIiRzZXQiLCJzZXRJbmRleGVzV2l0aFNjaGVtYUZvcm1hdCIsInN1Ym1pdHRlZEluZGV4ZXMiLCJleGlzdGluZ0luZGV4ZXMiLCJfaWRfIiwiZGVsZXRlUHJvbWlzZXMiLCJpbnNlcnRlZEluZGV4ZXMiLCJmb3JFYWNoIiwiZmllbGQiLCJfX29wIiwiUGFyc2UiLCJFcnJvciIsIklOVkFMSURfUVVFUlkiLCJwcm9taXNlIiwiZHJvcEluZGV4IiwicHVzaCIsImtleSIsInByb3RvdHlwZSIsImhhc093blByb3BlcnR5IiwiY2FsbCIsInJlcGxhY2UiLCJpbnNlcnRQcm9taXNlIiwiY3JlYXRlSW5kZXhlcyIsImFsbCIsInNldEluZGV4ZXNGcm9tTW9uZ28iLCJnZXRJbmRleGVzIiwicmVkdWNlIiwib2JqIiwiaW5kZXgiLCJfZnRzIiwiX2Z0c3giLCJ3ZWlnaHRzIiwiY3JlYXRlQ2xhc3MiLCJpbnNlcnRTY2hlbWEiLCJ1cGRhdGVGaWVsZE9wdGlvbnMiLCJhZGRGaWVsZElmTm90RXhpc3RzIiwiY3JlYXRlSW5kZXhlc0lmTmVlZGVkIiwiZGVsZXRlQ2xhc3MiLCJkcm9wIiwibWVzc2FnZSIsImZpbmRBbmREZWxldGVTY2hlbWEiLCJkZWxldGVBbGxDbGFzc2VzIiwiZmFzdCIsIm1hcCIsImRlbGV0ZU1hbnkiLCJkZWxldGVGaWVsZHMiLCJmaWVsZE5hbWVzIiwibW9uZ29Gb3JtYXROYW1lcyIsImNvbGxlY3Rpb25VcGRhdGUiLCIkdW5zZXQiLCJjb2xsZWN0aW9uRmlsdGVyIiwiJG9yIiwiJGV4aXN0cyIsInNjaGVtYVVwZGF0ZSIsInVwZGF0ZU1hbnkiLCJnZXRBbGxDbGFzc2VzIiwic2NoZW1hc0NvbGxlY3Rpb24iLCJfZmV0Y2hBbGxTY2hlbWFzRnJvbV9TQ0hFTUEiLCJnZXRDbGFzcyIsIl9mZXRjaE9uZVNjaGVtYUZyb21fU0NIRU1BIiwiY3JlYXRlT2JqZWN0Iiwib2JqZWN0IiwidHJhbnNhY3Rpb25hbFNlc3Npb24iLCJpbnNlcnRPbmUiLCJEVVBMSUNBVEVfVkFMVUUiLCJ1bmRlcmx5aW5nRXJyb3IiLCJtYXRjaGVzIiwiQXJyYXkiLCJpc0FycmF5IiwidXNlckluZm8iLCJkdXBsaWNhdGVkX2ZpZWxkIiwiZGVsZXRlT2JqZWN0c0J5UXVlcnkiLCJxdWVyeSIsIm1vbmdvV2hlcmUiLCJyZXN1bHQiLCJuIiwiT0JKRUNUX05PVF9GT1VORCIsIklOVEVSTkFMX1NFUlZFUl9FUlJPUiIsInVwZGF0ZU9iamVjdHNCeVF1ZXJ5IiwidXBkYXRlIiwibW9uZ29VcGRhdGUiLCJmaW5kT25lQW5kVXBkYXRlIiwiX21vbmdvQ29sbGVjdGlvbiIsInJldHVybk9yaWdpbmFsIiwic2Vzc2lvbiIsInZhbHVlIiwidXBzZXJ0T25lT2JqZWN0IiwidXBzZXJ0T25lIiwiZmluZCIsInNraXAiLCJsaW1pdCIsInNvcnQiLCJyZWFkUHJlZmVyZW5jZSIsImhpbnQiLCJjYXNlSW5zZW5zaXRpdmUiLCJleHBsYWluIiwibW9uZ29Tb3J0IiwiXyIsIm1hcEtleXMiLCJtb25nb0tleXMiLCJtZW1vIiwiX3BhcnNlUmVhZFByZWZlcmVuY2UiLCJjcmVhdGVUZXh0SW5kZXhlc0lmTmVlZGVkIiwib2JqZWN0cyIsImVuc3VyZUluZGV4IiwiaW5kZXhOYW1lIiwiaW5kZXhDcmVhdGlvblJlcXVlc3QiLCJtb25nb0ZpZWxkTmFtZXMiLCJpbmRleFR5cGUiLCJkZWZhdWx0T3B0aW9ucyIsImJhY2tncm91bmQiLCJzcGFyc2UiLCJpbmRleE5hbWVPcHRpb25zIiwidHRsT3B0aW9ucyIsInR0bCIsImV4cGlyZUFmdGVyU2Vjb25kcyIsImNhc2VJbnNlbnNpdGl2ZU9wdGlvbnMiLCJjb2xsYXRpb24iLCJjYXNlSW5zZW5zaXRpdmVDb2xsYXRpb24iLCJpbmRleE9wdGlvbnMiLCJjcmVhdGVJbmRleCIsImVuc3VyZVVuaXF1ZW5lc3MiLCJfZW5zdXJlU3BhcnNlVW5pcXVlSW5kZXhJbkJhY2tncm91bmQiLCJfcmF3RmluZCIsImNvdW50IiwiZGlzdGluY3QiLCJpc1BvaW50ZXJGaWVsZCIsInRyYW5zZm9ybUZpZWxkIiwiYWdncmVnYXRlIiwicGlwZWxpbmUiLCJzdGFnZSIsIiRncm91cCIsIl9wYXJzZUFnZ3JlZ2F0ZUdyb3VwQXJncyIsIiRtYXRjaCIsIl9wYXJzZUFnZ3JlZ2F0ZUFyZ3MiLCIkcHJvamVjdCIsIl9wYXJzZUFnZ3JlZ2F0ZVByb2plY3RBcmdzIiwiJGdlb05lYXIiLCJyZXN1bHRzIiwic3BsaXQiLCJpbmNsdWRlcyIsImlzRW1wdHkiLCJyZXR1cm5WYWx1ZSIsIl9jb252ZXJ0VG9EYXRlIiwic3Vic3RyaW5nIiwiRGF0ZSIsInRvVXBwZXJDYXNlIiwiUFJJTUFSWSIsIlBSSU1BUllfUFJFRkVSUkVEIiwiU0VDT05EQVJZIiwiU0VDT05EQVJZX1BSRUZFUlJFRCIsIk5FQVJFU1QiLCJwZXJmb3JtSW5pdGlhbGl6YXRpb24iLCIkdGV4dCIsInRleHRJbmRleCIsImRyb3BBbGxJbmRleGVzIiwiZHJvcEluZGV4ZXMiLCJ1cGRhdGVTY2hlbWFXaXRoSW5kZXhlcyIsImNsYXNzZXMiLCJwcm9taXNlcyIsImNyZWF0ZVRyYW5zYWN0aW9uYWxTZXNzaW9uIiwidHJhbnNhY3Rpb25hbFNlY3Rpb24iLCJzdGFydFNlc3Npb24iLCJzdGFydFRyYW5zYWN0aW9uIiwiY29tbWl0VHJhbnNhY3Rpb25hbFNlc3Npb24iLCJjb21taXRUcmFuc2FjdGlvbiIsImVuZFNlc3Npb24iLCJhYm9ydFRyYW5zYWN0aW9uYWxTZXNzaW9uIiwiYWJvcnRUcmFuc2FjdGlvbiJdLCJtYXBwaW5ncyI6Ijs7Ozs7OztBQUNBOztBQUNBOztBQUNBOztBQUVBOztBQUNBOztBQVNBOztBQUVBOztBQUNBOztBQUNBOzs7Ozs7Ozs7Ozs7Ozs7O0FBRUE7QUFDQSxNQUFNQSxPQUFPLEdBQUdDLE9BQU8sQ0FBQyxTQUFELENBQXZCOztBQUNBLE1BQU1DLFdBQVcsR0FBR0YsT0FBTyxDQUFDRSxXQUE1QjtBQUNBLE1BQU1DLGNBQWMsR0FBR0gsT0FBTyxDQUFDRyxjQUEvQjtBQUVBLE1BQU1DLHlCQUF5QixHQUFHLFNBQWxDOztBQUVBLE1BQU1DLDRCQUE0QixHQUFHQyxZQUFZLElBQUk7QUFDbkQsU0FBT0EsWUFBWSxDQUNoQkMsT0FESSxHQUVKQyxJQUZJLENBRUMsTUFBTUYsWUFBWSxDQUFDRyxRQUFiLENBQXNCQyxXQUF0QixFQUZQLEVBR0pGLElBSEksQ0FHQ0UsV0FBVyxJQUFJO0FBQ25CLFdBQU9BLFdBQVcsQ0FBQ0MsTUFBWixDQUFtQkMsVUFBVSxJQUFJO0FBQ3RDLFVBQUlBLFVBQVUsQ0FBQ0MsU0FBWCxDQUFxQkMsS0FBckIsQ0FBMkIsWUFBM0IsQ0FBSixFQUE4QztBQUM1QyxlQUFPLEtBQVA7QUFDRCxPQUhxQyxDQUl0QztBQUNBOzs7QUFDQSxhQUFPRixVQUFVLENBQUNHLGNBQVgsQ0FBMEJDLE9BQTFCLENBQWtDVixZQUFZLENBQUNXLGlCQUEvQyxLQUFxRSxDQUE1RTtBQUNELEtBUE0sQ0FBUDtBQVFELEdBWkksQ0FBUDtBQWFELENBZEQ7O0FBZ0JBLE1BQU1DLCtCQUErQixHQUFHLFVBQW1CO0FBQUEsTUFBYkMs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QU0sQ0FBQ0ksU0FBaEMsQ0FBUDtBQUNELE9BRmdCLENBQWpCO0FBR0EsYUFBTytDLE9BQU8sQ0FBQzRDLEdBQVIsQ0FBWXdJLFFBQVosQ0FBUDtBQUNELEtBTkksRUFPSnRMLEtBUEksQ0FPRUMsR0FBRyxJQUFJLEtBQUtHLFdBQUwsQ0FBaUJILEdBQWpCLENBUFQsQ0FBUDtBQVFEOztBQUVEc0wsRUFBQUEsMEJBQTBCLEdBQWlCO0FBQ3pDLFVBQU1DLG9CQUFvQixHQUFHLEtBQUs5TCxNQUFMLENBQVkrTCxZQUFaLEVBQTdCO0FBQ0FELElBQUFBLG9CQUFvQixDQUFDRSxnQkFBckI7QUFDQSxXQUFPeEwsT0FBTyxDQUFDTyxPQUFSLENBQWdCK0ssb0JBQWhCLENBQVA7QUFDRDs7QUFFREcsRUFBQUEsMEJBQTBCLENBQUNILG9CQUFELEVBQTJDO0FBQ25FLFdBQU9BLG9CQUFvQixDQUFDSSxpQkFBckIsR0FBeUN4UCxJQUF6QyxDQUE4QyxNQUFNO0FBQ3pEb1AsTUFBQUEsb0JBQW9CLENBQUNLLFVBQXJCO0FBQ0QsS0FGTSxDQUFQO0FBR0Q7O0FBRURDLEVBQUFBLHlCQUF5QixDQUFDTixvQkFBRCxFQUEyQztBQUNsRSxXQUFPQSxvQkFBb0IsQ0FBQ08sZ0JBQXJCLEdBQXdDM1AsSUFBeEMsQ0FBNkMsTUFBTTtBQUN4RG9QLE1BQUFBLG9CQUFvQixDQUFDSyxVQUFyQjtBQUNELEtBRk0sQ0FBUDtBQUdEOztBQXg3QndEOzs7ZUEyN0I1Q25OLG1CIiwic291cmNlc0NvbnRlbnQiOlsiLy8gQGZsb3dcbmltcG9ydCBNb25nb0NvbGxlY3Rpb24gZnJvbSAnLi9Nb25nb0NvbGxlY3Rpb24nO1xuaW1wb3J0IE1vbmdvU2NoZW1hQ29sbGVjdGlvbiBmcm9tICcuL01vbmdvU2NoZW1hQ29sbGVjdGlvbic7XG5pbXBvcnQgeyBTdG9yYWdlQWRhcHRlciB9IGZyb20gJy4uL1N0b3JhZ2VBZGFwdGVyJztcbmltcG9ydCB0eXBlIHsgU2NoZW1hVHlwZSwgUXVlcnlUeXBlLCBTdG9yYWdlQ2xhc3MsIFF1ZXJ5T3B0aW9ucyB9IGZyb20gJy4uL1N0b3JhZ2VBZGFwdGVyJztcbmltcG9ydCB7IHBhcnNlIGFzIHBhcnNlVXJsLCBmb3JtYXQgYXMgZm9ybWF0VXJsIH0gZnJvbSAnLi4vLi4vLi4vdmVuZG9yL21vbmdvZGJVcmwnO1xuaW1wb3J0IHtcbiAgcGFyc2VPYmplY3RUb01vbmdvT2JqZWN0Rm9yQ3JlYXRlLFxuICBtb25nb09iamVjdFRvUGFyc2VPYmplY3QsXG4gIHRyYW5zZm9ybUtleSxcbiAgdHJhbnNmb3JtV2hlcmUsXG4gIHRyYW5zZm9ybVVwZGF0ZSxcbiAgdHJhbnNmb3JtUG9pbnRlclN0cmluZyxcbn0gZnJvbSAnLi9Nb25nb1RyYW5zZm9ybSc7XG4vLyBAZmxvdy1kaXNhYmxlLW5leHRcbmltcG9ydCBQYXJzZSBmcm9tICdwYXJzZS9ub2RlJztcbi8vIEBmbG93LWRpc2FibGUtbmV4dFxuaW1wb3J0IF8gZnJvbSAnbG9kYXNoJztcbmltcG9ydCBkZWZhdWx0cyBmcm9tICcuLi8uLi8uLi9kZWZhdWx0cyc7XG5pbXBvcnQgbG9nZ2VyIGZyb20gJy4uLy4uLy4uL2xvZ2dlcic7XG5cbi8vIEBmbG93LWRpc2FibGUtbmV4dFxuY29uc3QgbW9uZ29kYiA9IHJlcXVpcmUoJ21vbmdvZGInKTtcbmNvbnN0IE1vbmdvQ2xpZW50ID0gbW9uZ29kYi5Nb25nb0NsaWVudDtcbmNvbnN0IFJlYWRQcmVmZXJlbmNlID0gbW9uZ29kYi5SZWFkUHJlZmVyZW5jZTtcblxuY29uc3QgTW9uZ29TY2hlbWFDb2xsZWN0aW9uTmFtZSA9ICdfU0NIRU1BJztcblxuY29uc3Qgc3RvcmFnZUFkYXB0ZXJBbGxDb2xsZWN0aW9ucyA9IG1vbmdvQWRhcHRlciA9PiB7XG4gIHJldHVybiBtb25nb0FkYXB0ZXJcbiAgICAuY29ubmVjdCgpXG4gICAgLnRoZW4oKCkgPT4gbW9uZ29BZGFwdGVyLmRhdGFiYXNlLmNvbGxlY3Rpb25zKCkpXG4gICAgLnRoZW4oY29sbGVjdGlvbnMgPT4ge1xuICAgICAgcmV0dXJuIGNvbGxlY3Rpb25zLmZpbHRlcihjb2xsZWN0aW9uID0+IHtcbiAgICAgICAgaWYgKGNvbGxlY3Rpb24ubmFtZXNwYWNlLm1hdGNoKC9cXC5zeXN0ZW1cXC4vKSkge1xuICAgICAgICAgIHJldHVybiBmYWxzZTtcbiAgICAgICAgfVxuICAgICAgICAvLyBUT0RPOiBJZiB5b3UgaGF2ZSBvbmUgYXBwIHdpdGggYSBjb2xsZWN0aW9uIHByZWZpeCB0aGF0IGhhcHBlbnMgdG8gYmUgYSBwcmVmaXggb2YgYW5vdGhlclxuICAgICAgICAvLyBhcHBzIHByZWZpeCwgdGhpcyB3aWxsIGdvIHZlcnkgdmVyeSBiYWRseS4gV2Ugc2hvdWxkIGZpeCB0aGF0IHNvbWVob3cuXG4gICAgICAgIHJldHVybiBjb2xsZWN0aW9uLmNvbGxlY3Rpb25OYW1lLmluZGV4T2YobW9uZ29BZGFwdGVyLl9jb2xsZWN0aW9uUHJlZml4KSA9PSAwO1xuICAgICAgfSk7XG4gICAgfSk7XG59O1xuXG5jb25zdCBjb252ZXJ0UGFyc2VTY2hlbWFUb01vbmdvU2NoZW1hID0gKHsgLi4uc2NoZW1hIH0pID0+IHtcbiAgZGVsZXRlIHNjaGVtYS5maWVsZHMuX3JwZXJtO1xuICBkZWxldGUgc2NoZW1hLmZpZWxkcy5fd3Blcm07XG5cbiAgaWYgKHNjaGVtYS5jbGFzc05hbWUgPT09ICdfVXNlcicpIHtcbiAgICAvLyBMZWdhY3kgbW9uZ28gYWRhcHRlciBrbm93cyBhYm91dCB0aGUgZGlmZmVyZW5jZSBiZXR3ZWVuIHBhc3N3b3JkIGFuZCBfaGFzaGVkX3Bhc3N3b3JkLlxuICAgIC8vIEZ1dHVyZSBkYXRhYmFzZSBhZGFwdGVycyB3aWxsIG9ubHkga25vdyBhYm91dCBfaGFzaGVkX3Bhc3N3b3JkLlxuICAgIC8vIE5vdGU6IFBhcnNlIFNlcnZlciB3aWxsIGJyaW5nIGJhY2sgcGFzc3dvcmQgd2l0aCBpbmplY3REZWZhdWx0U2NoZW1hLCBzbyB3ZSBkb24ndCBuZWVkXG4gICAgLy8gdG8gYWRkIF9oYXNoZWRfcGFzc3dvcmQgYmFjayBldmVyLlxuICAgIGRlbGV0ZSBzY2hlbWEuZmllbGRzLl9oYXNoZWRfcGFzc3dvcmQ7XG4gIH1cblxuICByZXR1cm4gc2NoZW1hO1xufTtcblxuLy8gUmV0dXJucyB7IGNvZGUsIGVycm9yIH0gaWYgaW52YWxpZCwgb3IgeyByZXN1bHQgfSwgYW4gb2JqZWN0XG4vLyBzdWl0YWJsZSBmb3IgaW5zZXJ0aW5nIGludG8gX1NDSEVNQSBjb2xsZWN0aW9uLCBvdGhlcndpc2UuXG5jb25zdCBtb25nb1NjaGVtYUZyb21GaWVsZHNBbmRDbGFzc05hbWVBbmRDTFAgPSAoXG4gIGZpZWxkcyxcbiAgY2xhc3NOYW1lLFxuICBjbGFzc0xldmVsUGVybWlzc2lvbnMsXG4gIGluZGV4ZXNcbikgPT4ge1xuICBjb25zdCBtb25nb09iamVjdCA9IHtcbiAgICBfaWQ6IGNsYXNzTmFtZSxcbiAgICBvYmplY3RJZDogJ3N0cmluZycsXG4gICAgdXBkYXRlZEF0OiAnc3RyaW5nJyxcbiAgICBjcmVhdGVkQXQ6ICdzdHJpbmcnLFxuICAgIF9tZXRhZGF0YTogdW5kZWZpbmVkLFxuICB9O1xuXG4gIGZvciAoY29uc3QgZmllbGROYW1lIGluIGZpZWxkcykge1xuICAgIGNvbnN0IHsgdHlwZSwgdGFyZ2V0Q2xhc3MsIC4uLmZpZWxkT3B0aW9ucyB9ID0gZmllbGRzW2ZpZWxkTmFtZV07XG4gICAgbW9uZ29PYmplY3RbZmllbGROYW1lXSA9IE1vbmdvU2NoZW1hQ29sbGVjdGlvbi5wYXJzZUZpZWxkVHlwZVRvTW9uZ29GaWVsZFR5cGUoe1xuICAgICAgdHlwZSxcbiAgICAgIHRhcmdldENsYXNzLFxuICAgIH0pO1xuICAgIGlmIChmaWVsZE9wdGlvbnMgJiYgT2JqZWN0LmtleXMoZmllbGRPcHRpb25zKS5sZW5ndGggPiAwKSB7XG4gICAgICBtb25nb09iamVjdC5fbWV0YWRhdGEgPSBtb25nb09iamVjdC5fbWV0YWRhdGEgfHwge307XG4gICAgICBtb25nb09iamVjdC5fbWV0YWRhdGEuZmllbGRzX29wdGlvbnMgPSBtb25nb09iamVjdC5fbWV0YWRhdGEuZmllbGRzX29wdGlvbnMgfHwge307XG4gICAgICBtb25nb09iamVjdC5fbWV0YWRhdGEuZmllbGRzX29wdGlvbnNbZmllbGROYW1lXSA9IGZpZWxkT3B0aW9ucztcbiAgICB9XG4gIH1cblxuICBpZiAodHlwZW9mIGNsYXNzTGV2ZWxQZXJtaXNzaW9ucyAhPT0gJ3VuZGVmaW5lZCcpIHtcbiAgICBtb25nb09iamVjdC5fbWV0YWRhdGEgPSBtb25nb09iamVjdC5fbWV0YWRhdGEgfHwge307XG4gICAgaWYgKCFjbGFzc0xldmVsUGVybWlzc2lvbnMpIHtcbiAgICAgIGRlbGV0ZSBtb25nb09iamVjdC5fbWV0YWRhdGEuY2xhc3NfcGVybWlzc2lvbnM7XG4gICAgfSBlbHNlIHtcbiAgICAgIG1vbmdvT2JqZWN0Ll9tZXRhZGF0YS5jbGFzc19wZXJtaXNzaW9ucyA9IGNsYXNzTGV2ZWxQZXJtaXNzaW9ucztcbiAgICB9XG4gIH1cblxuICBpZiAoaW5kZXhlcyAmJiB0eXBlb2YgaW5kZXhlcyA9PT0gJ29iamVjdCcgJiYgT2JqZWN0LmtleXMoaW5kZXhlcykubGVuZ3RoID4gMCkge1xuICAgIG1vbmdvT2JqZWN0Ll9tZXRhZGF0YSA9IG1vbmdvT2JqZWN0Ll9tZXRhZGF0YSB8fCB7fTtcbiAgICBtb25nb09iamVjdC5fbWV0YWRhdGEuaW5kZXhlcyA9IGluZGV4ZXM7XG4gIH1cblxuICBpZiAoIW1vbmdvT2JqZWN0Ll9tZXRhZGF0YSkge1xuICAgIC8vIGNsZWFudXAgdGhlIHVudXNlZCBfbWV0YWRhdGFcbiAgICBkZWxldGUgbW9uZ29PYmplY3QuX21ldGFkYXRhO1xuICB9XG5cbiAgcmV0dXJuIG1vbmdvT2JqZWN0O1xufTtcblxuZXhwb3J0IGNsYXNzIE1vbmdvU3RvcmFnZUFkYXB0ZXIgaW1wbGVtZW50cyBTdG9yYWdlQWRhcHRlciB7XG4gIC8vIFByaXZhdGVcbiAgX3VyaTogc3RyaW5nO1xuICBfY29sbGVjdGlvblByZWZpeDogc3RyaW5nO1xuICBfbW9uZ29PcHRpb25zOiBPYmplY3Q7XG4gIC8vIFB1YmxpY1xuICBjb25uZWN0aW9uUHJvbWlzZTogP1Byb21pc2U8YW55PjtcbiAgZGF0YWJhc2U6IGFueTtcbiAgY2xpZW50OiBNb25nb0NsaWVudDtcbiAgX21heFRpbWVNUzogP251bWJlcjtcbiAgY2FuU29ydE9uSm9pblRhYmxlczogYm9vbGVhbjtcblxuICBjb25zdHJ1Y3Rvcih7IHVyaSA9IGRlZmF1bHRzLkRlZmF1bHRNb25nb1VSSSwgY29sbGVjdGlvblByZWZpeCA9ICcnLCBtb25nb09wdGlvbnMgPSB7fSB9OiBhbnkpIHtcbiAgICB0aGlzLl91cmkgPSB1cmk7XG4gICAgdGhpcy5fY29sbGVjdGlvblByZWZpeCA9IGNvbGxlY3Rpb25QcmVmaXg7XG4gICAgdGhpcy5fbW9uZ29PcHRpb25zID0gbW9uZ29PcHRpb25zO1xuICAgIHRoaXMuX21vbmdvT3B0aW9ucy51c2VOZXdVcmxQYXJzZXIgPSB0cnVlO1xuICAgIHRoaXMuX21vbmdvT3B0aW9ucy51c2VVbmlmaWVkVG9wb2xvZ3kgPSB0cnVlO1xuXG4gICAgLy8gTWF4VGltZU1TIGlzIG5vdCBhIGdsb2JhbCBNb25nb0RCIGNsaWVudCBvcHRpb24sIGl0IGlzIGFwcGxpZWQgcGVyIG9wZXJhdGlvbi5cbiAgICB0aGlzLl9tYXhUaW1lTVMgPSBtb25nb09wdGlvbnMubWF4VGltZU1TO1xuICAgIHRoaXMuY2FuU29ydE9uSm9pblRhYmxlcyA9IHRydWU7XG4gICAgZGVsZXRlIG1vbmdvT3B0aW9ucy5tYXhUaW1lTVM7XG4gIH1cblxuICBjb25uZWN0KCkge1xuICAgIGlmICh0aGlzLmNvbm5lY3Rpb25Qcm9taXNlKSB7XG4gICAgICByZXR1cm4gdGhpcy5jb25uZWN0aW9uUHJvbWlzZTtcbiAgICB9XG5cbiAgICAvLyBwYXJzaW5nIGFuZCByZS1mb3JtYXR0aW5nIGNhdXNlcyB0aGUgYXV0aCB2YWx1ZSAoaWYgdGhlcmUpIHRvIGdldCBVUklcbiAgICAvLyBlbmNvZGVkXG4gICAgY29uc3QgZW5jb2RlZFVyaSA9IGZvcm1hdFVybChwYXJzZVVybCh0aGlzLl91cmkpKTtcblxuICAgIHRoaXMuY29ubmVjdGlvblByb21pc2UgPSBNb25nb0NsaWVudC5jb25uZWN0KGVuY29kZWRVcmksIHRoaXMuX21vbmdvT3B0aW9ucylcbiAgICAgIC50aGVuKGNsaWVudCA9PiB7XG4gICAgICAgIC8vIFN0YXJ0aW5nIG1vbmdvREIgMy4wLCB0aGUgTW9uZ29DbGllbnQuY29ubmVjdCBkb24ndCByZXR1cm4gYSBEQiBhbnltb3JlIGJ1dCBhIGNsaWVudFxuICAgICAgICAvLyBGb3J0dW5hdGVseSwgd2UgY2FuIGdldCBiYWNrIHRoZSBvcHRpb25zIGFuZCB1c2UgdGhlbSB0byBzZWxlY3QgdGhlIHByb3BlciBEQi5cbiAgICAgICAgLy8gaHR0cHM6Ly9naXRodWIuY29tL21vbmdvZGIvbm9kZS1tb25nb2RiLW5hdGl2ZS9ibG9iLzJjMzVkNzZmMDg1NzQyMjViOGRiMDJkN2JlZjY4NzEyM2U2YmIwMTgvbGliL21vbmdvX2NsaWVudC5qcyNMODg1XG4gICAgICAgIGNvbnN0IG9wdGlvbnMgPSBjbGllbnQucy5vcHRpb25zO1xuICAgICAgICBjb25zdCBkYXRhYmFzZSA9IGNsaWVudC5kYihvcHRpb25zLmRiTmFtZSk7XG4gICAgICAgIGlmICghZGF0YWJhc2UpIHtcbiAgICAgICAgICBkZWxldGUgdGhpcy5jb25uZWN0aW9uUHJvbWlzZTtcbiAgICAgICAgICByZXR1cm47XG4gICAgICAgIH1cbiAgICAgICAgZGF0YWJhc2Uub24oJ2Vycm9yJywgKCkgPT4ge1xuICAgICAgICAgIGRlbGV0ZSB0aGlzLmNvbm5lY3Rpb25Qcm9taXNlO1xuICAgICAgICB9KTtcbiAgICAgICAgZGF0YWJhc2Uub24oJ2Nsb3NlJywgKCkgPT4ge1xuICAgICAgICAgIGRlbGV0ZSB0aGlzLmNvbm5lY3Rpb25Qcm9taXNlO1xuICAgICAgICB9KTtcbiAgICAgICAgdGhpcy5jbGllbnQgPSBjbGllbnQ7XG4gICAgICAgIHRoaXMuZGF0YWJhc2UgPSBkYXRhYmFzZTtcbiAgICAgIH0pXG4gICAgICAuY2F0Y2goZXJyID0+IHtcbiAgICAgICAgZGVsZXRlIHRoaXMuY29ubmVjdGlvblByb21pc2U7XG4gICAgICAgIHJldHVybiBQcm9taXNlLnJlamVjdChlcnIpO1xuICAgICAgfSk7XG5cbiAgICByZXR1cm4gdGhpcy5jb25uZWN0aW9uUHJvbWlzZTtcbiAgfVxuXG4gIGhhbmRsZUVycm9yPFQ+KGVycm9yOiA/KEVycm9yIHwgUGFyc2UuRXJyb3IpKTogUHJvbWlzZTxUPiB7XG4gICAgaWYgKGVycm9yICYmIGVycm9yLmNvZGUgPT09IDEzKSB7XG4gICAgICAvLyBVbmF1dGhvcml6ZWQgZXJyb3JcbiAgICAgIGRlbGV0ZSB0aGlzLmNsaWVudDtcbiAgICAgIGRlbGV0ZSB0aGlzLmRhdGFiYXNlO1xuICAgICAgZGVsZXRlIHRoaXMuY29ubmVjdGlvblByb21pc2U7XG4gICAgICBsb2dnZXIuZXJyb3IoJ1JlY2VpdmVkIHVuYXV0aG9yaXplZCBlcnJvcicsIHsgZXJyb3I6IGVycm9yIH0pO1xuICAgIH1cbiAgICB0aHJvdyBlcnJvcjtcbiAgfVxuXG4gIGhhbmRsZVNodXRkb3duKCkge1xuICAgIGlmICghdGhpcy5jbGllbnQpIHtcbiAgICAgIHJldHVybiBQcm9taXNlLnJlc29sdmUoKTtcbiAgICB9XG4gICAgcmV0dXJuIHRoaXMuY2xpZW50LmNsb3NlKGZhbHNlKTtcbiAgfVxuXG4gIF9hZGFwdGl2ZUNvbGxlY3Rpb24obmFtZTogc3RyaW5nKSB7XG4gICAgcmV0dXJuIHRoaXMuY29ubmVjdCgpXG4gICAgICAudGhlbigoKSA9PiB0aGlzLmRhdGFiYXNlLmNvbGxlY3Rpb24odGhpcy5fY29sbGVjdGlvblByZWZpeCArIG5hbWUpKVxuICAgICAgLnRoZW4ocmF3Q29sbGVjdGlvbiA9PiBuZXcgTW9uZ29Db2xsZWN0aW9uKHJhd0NvbGxlY3Rpb24pKVxuICAgICAgLmNhdGNoKGVyciA9PiB0aGlzLmhhbmRsZUVycm9yKGVycikpO1xuICB9XG5cbiAgX3NjaGVtYUNvbGxlY3Rpb24oKTogUHJvbWlzZTxNb25nb1NjaGVtYUNvbGxlY3Rpb24+IHtcbiAgICByZXR1cm4gdGhpcy5jb25uZWN0KClcbiAgICAgIC50aGVuKCgpID0+IHRoaXMuX2FkYXB0aXZlQ29sbGVjdGlvbihNb25nb1NjaGVtYUNvbGxlY3Rpb25OYW1lKSlcbiAgICAgIC50aGVuKGNvbGxlY3Rpb24gPT4gbmV3IE1vbmdvU2NoZW1hQ29sbGVjdGlvbihjb2xsZWN0aW9uKSk7XG4gIH1cblxuICBjbGFzc0V4aXN0cyhuYW1lOiBzdHJpbmcpIHtcbiAgICByZXR1cm4gdGhpcy5jb25uZWN0KClcbiAgICAgIC50aGVuKCgpID0+IHtcbiAgICAgICAgcmV0dXJuIHRoaXMuZGF0YWJhc2UubGlzdENvbGxlY3Rpb25zKHsgbmFtZTogdGhpcy5fY29sbGVjdGlvblByZWZpeCArIG5hbWUgfSkudG9BcnJheSgpO1xuICAgICAgfSlcbiAgICAgIC50aGVuKGNvbGxlY3Rpb25zID0+IHtcbiAgICAgICAgcmV0dXJuIGNvbGxlY3Rpb25zLmxlbmd0aCA+IDA7XG4gICAgICB9KVxuICAgICAgLmNhdGNoKGVyciA9PiB0aGlzLmhhbmRsZUVycm9yKGVycikpO1xuICB9XG5cbiAgc2V0Q2xhc3NMZXZlbFBlcm1pc3Npb25zKGNsYXNzTmFtZTogc3RyaW5nLCBDTFBzOiBhbnkpOiBQcm9taXNlPHZvaWQ+IHtcbiAgICByZXR1cm4gdGhpcy5fc2NoZW1hQ29sbGVjdGlvbigpXG4gICAgICAudGhlbihzY2hlbWFDb2xsZWN0aW9uID0+XG4gICAgICAgIHNjaGVtYUNvbGxlY3Rpb24udXBkYXRlU2NoZW1hKGNsYXNzTmFtZSwge1xuICAgICAgICAgICRzZXQ6IHsgJ19tZXRhZGF0YS5jbGFzc19wZXJtaXNzaW9ucyc6IENMUHMgfSxcbiAgICAgICAgfSlcbiAgICAgIClcbiAgICAgIC5jYXRjaChlcnIgPT4gdGhpcy5oYW5kbGVFcnJvcihlcnIpKTtcbiAgfVxuXG4gIHNldEluZGV4ZXNXaXRoU2NoZW1hRm9ybWF0KFxuICAgIGNsYXNzTmFtZTogc3RyaW5nLFxuICAgIHN1Ym1pdHRlZEluZGV4ZXM6IGFueSxcbiAgICBleGlzdGluZ0luZGV4ZXM6IGFueSA9IHt9LFxuICAgIGZpZWxkczogYW55XG4gICk6IFByb21pc2U8dm9pZD4ge1xuICAgIGlmIChzdWJtaXR0ZWRJbmRleGVzID09PSB1bmRlZmluZWQpIHtcbiAgICAgIHJldHVybiBQcm9taXNlLnJlc29sdmUoKTtcbiAgICB9XG4gICAgaWYgKE9iamVjdC5rZXlzKGV4aXN0aW5nSW5kZXhlcykubGVuZ3RoID09PSAwKSB7XG4gICAgICBleGlzdGluZ0luZGV4ZXMgPSB7IF9pZF86IHsgX2lkOiAxIH0gfTtcbiAgICB9XG4gICAgY29uc3QgZGVsZXRlUHJvbWlzZXMgPSBbXTtcbiAgICBjb25zdCBpbnNlcnRlZEluZGV4ZXMgPSBbXTtcbiAgICBPYmplY3Qua2V5cyhzdWJtaXR0ZWRJbmRleGVzKS5mb3JFYWNoKG5hbWUgPT4ge1xuICAgICAgY29uc3QgZmllbGQgPSBzdWJtaXR0ZWRJbmRleGVzW25hbWVdO1xuICAgICAgaWYgKGV4aXN0aW5nSW5kZXhlc1tuYW1lXSAmJiBmaWVsZC5fX29wICE9PSAnRGVsZXRlJykge1xuICAgICAgICB0aHJvdyBuZXcgUGFyc2UuRXJyb3IoUGFyc2UuRXJyb3IuSU5WQUxJRF9RVUVSWSwgYEluZGV4ICR7bmFtZX0gZXhpc3RzLCBjYW5ub3QgdXBkYXRlLmApO1xuICAgICAgfVxuICAgICAgaWYgKCFleGlzdGluZ0luZGV4ZXNbbmFtZV0gJiYgZmllbGQuX19vcCA9PT0gJ0RlbGV0ZScpIHtcbiAgICAgICAgdGhyb3cgbmV3IFBhcnNlLkVycm9yKFxuICAgICAgICAgIFBhcnNlLkVycm9yLklOVkFMSURfUVVFUlksXG4gICAgICAgICAgYEluZGV4ICR7bmFtZX0gZG9lcyBub3QgZXhpc3QsIGNhbm5vdCBkZWxldGUuYFxuICAgICAgICApO1xuICAgICAgfVxuICAgICAgaWYgKGZpZWxkLl9fb3AgPT09ICdEZWxldGUnKSB7XG4gICAgICAgIGNvbnN0IHByb21pc2UgPSB0aGlzLmRyb3BJbmRleChjbGFzc05hbWUsIG5hbWUpO1xuICAgICAgICBkZWxldGVQcm9taXNlcy5wdXNoKHByb21pc2UpO1xuICAgICAgICBkZWxldGUgZXhpc3RpbmdJbmRleGVzW25hbWVdO1xuICAgICAgfSBlbHNlIHtcbiAgICAgICAgT2JqZWN0LmtleXMoZmllbGQpLmZvckVhY2goa2V5ID0+IHtcbiAgICAgICAgICBpZiAoXG4gICAgICAgICAgICAhT2JqZWN0LnByb3RvdHlwZS5oYXNPd25Qcm9wZXJ0eS5jYWxsKFxuICAgICAgICAgICAgICBmaWVsZHMsXG4gICAgICAgICAgICAgIGtleS5pbmRleE9mKCdfcF8nKSA9PT0gMCA/IGtleS5yZXBsYWNlKCdfcF8nLCAnJykgOiBrZXlcbiAgICAgICAgICAgIClcbiAgICAgICAgICApIHtcbiAgICAgICAgICAgIHRocm93IG5ldyBQYXJzZS5FcnJvcihcbiAgICAgICAgICAgICAgUGFyc2UuRXJyb3IuSU5WQUxJRF9RVUVSWSxcbiAgICAgICAgICAgICAgYEZpZWxkICR7a2V5fSBkb2VzIG5vdCBleGlzdCwgY2Fubm90IGFkZCBpbmRleC5gXG4gICAgICAgICAgICApO1xuICAgICAgICAgIH1cbiAgICAgICAgfSk7XG4gICAgICAgIGV4aXN0aW5nSW5kZXhlc1tuYW1lXSA9IGZpZWxkO1xuICAgICAgICBpbnNlcnRlZEluZGV4ZXMucHVzaCh7XG4gICAgICAgICAga2V5OiBmaWVsZCxcbiAgICAgICAgICBuYW1lLFxuICAgICAgICB9KTtcbiAgICAgIH1cbiAgICB9KTtcbiAgICBsZXQgaW5zZXJ0UHJvbWlzZSA9IFByb21pc2UucmVzb2x2ZSgpO1xuICAgIGlmIChpbnNlcnRlZEluZGV4ZXMubGVuZ3RoID4gMCkge1xuICAgICAgaW5zZXJ0UHJvbWlzZSA9IHRoaXMuY3JlYXRlSW5kZXhlcyhjbGFzc05hbWUsIGluc2VydGVkSW5kZXhlcyk7XG4gICAgfVxuICAgIHJldHVybiBQcm9taXNlLmFsbChkZWxldGVQcm9taXNlcylcbiAgICAgIC50aGVuKCgpID0+IGluc2VydFByb21pc2UpXG4gICAgICAudGhlbigoKSA9PiB0aGlzLl9zY2hlbWFDb2xsZWN0aW9uKCkpXG4gICAgICAudGhlbihzY2hlbWFDb2xsZWN0aW9uID0+XG4gICAgICAgIHNjaGVtYUNvbGxlY3Rpb24udXBkYXRlU2NoZW1hKGNsYXNzTmFtZSwge1xuICAgICAgICAgICRzZXQ6IHsgJ19tZXRhZGF0YS5pbmRleGVzJzogZXhpc3RpbmdJbmRleGVzIH0sXG4gICAgICAgIH0pXG4gICAgICApXG4gICAgICAuY2F0Y2goZXJyID0+IHRoaXMuaGFuZGxlRXJyb3IoZXJyKSk7XG4gIH1cblxuICBzZXRJbmRleGVzRnJvbU1vbmdvKGNsYXNzTmFtZTogc3RyaW5nKSB7XG4gICAgcmV0dXJuIHRoaXMuZ2V0SW5kZXhlcyhjbGFzc05hbWUpXG4gICAgICAudGhlbihpbmRleGVzID0+IHtcbiAgICAgICAgaW5kZXhlcyA9IGluZGV4ZXMucmVkdWNlKChvYmosIGluZGV4KSA9PiB7XG4gICAgICAgICAgaWYgKGluZGV4LmtleS5fZnRzKSB7XG4gICAgICAgICAgICBkZWxldGUgaW5kZXgua2V5Ll9mdHM7XG4gICAgICAgICAgICBkZWxldGUgaW5kZXgua2V5Ll9mdHN4O1xuICAgICAgICAgICAgZm9yIChjb25zdCBmaWVsZCBpbiBpbmRleC53ZWlnaHRzKSB7XG4gICAgICAgICAgICAgIGluZGV4LmtleVtmaWVsZF0gPSAndGV4dCc7XG4gICAgICAgICAgICB9XG4gICAgICAgICAgfVxuICAgICAgICAgIG9ialtpbmRleC5uYW1lXSA9IGluZGV4LmtleTtcbiAgICAgICAgICByZXR1cm4gb2JqO1xuICAgICAgICB9LCB7fSk7XG4gICAgICAgIHJldHVybiB0aGlzLl9zY2hlbWFDb2xsZWN0aW9uKCkudGhlbihzY2hlbWFDb2xsZWN0aW9uID0+XG4gICAgICAgICAgc2NoZW1hQ29sbGVjdGlvbi51cGRhdGVTY2hlbWEoY2xhc3NOYW1lLCB7XG4gICAgICAgICAgICAkc2V0OiB7ICdfbWV0YWRhdGEuaW5kZXhlcyc6IGluZGV4ZXMgfSxcbiAgICAgICAgICB9KVxuICAgICAgICApO1xuICAgICAgfSlcbiAgICAgIC5jYXRjaChlcnIgPT4gdGhpcy5oYW5kbGVFcnJvcihlcnIpKVxuICAgICAgLmNhdGNoKCgpID0+IHtcbiAgICAgICAgLy8gSWdub3JlIGlmIGNvbGxlY3Rpb24gbm90IGZvdW5kXG4gICAgICAgIHJldHVybiBQcm9taXNlLnJlc29sdmUoKTtcbiAgICAgIH0pO1xuICB9XG5cbiAgY3JlYXRlQ2xhc3MoY2xhc3NOYW1lOiBzdHJpbmcsIHNjaGVtYTogU2NoZW1hVHlwZSk6IFByb21pc2U8dm9pZD4ge1xuICAgIHNjaGVtYSA9IGNvbnZlcnRQYXJzZVNjaGVtYVRvTW9uZ29TY2hlbWEoc2NoZW1hKTtcbiAgICBjb25zdCBtb25nb09iamVjdCA9IG1vbmdvU2NoZW1hRnJvbUZpZWxkc0FuZENsYXNzTmFtZUFuZENMUChcbiAgICAgIHNjaGVtYS5maWVsZHMsXG4gICAgICBjbGFzc05hbWUsXG4gICAgICBzY2hlbWEuY2xhc3NMZXZlbFBlcm1pc3Npb25zLFxuICAgICAgc2NoZW1hLmluZGV4ZXNcbiAgICApO1xuICAgIG1vbmdvT2JqZWN0Ll9pZCA9IGNsYXNzTmFtZTtcbiAgICByZXR1cm4gdGhpcy5zZXRJbmRleGVzV2l0aFNjaGVtYUZvcm1hdChjbGFzc05hbWUsIHNjaGVtYS5pbmRleGVzLCB7fSwgc2NoZW1hLmZpZWxkcylcbiAgICAgIC50aGVuKCgpID0+IHRoaXMuX3NjaGVtYUNvbGxlY3Rpb24oKSlcbiAgICAgIC50aGVuKHNjaGVtYUNvbGxlY3Rpb24gPT4gc2NoZW1hQ29sbGVjdGlvbi5pbnNlcnRTY2hlbWEobW9uZ29PYmplY3QpKVxuICAgICAgLmNhdGNoKGVyciA9PiB0aGlzLmhhbmRsZUVycm9yKGVycikpO1xuICB9XG5cbiAgYXN5bmMgdXBkYXRlRmllbGRPcHRpb25zKGNsYXNzTmFtZTogc3RyaW5nLCBmaWVsZE5hbWU6IHN0cmluZywgdHlwZTogYW55KSB7XG4gICAgY29uc3Qgc2NoZW1hQ29sbGVjdGlvbiA9IGF3YWl0IHRoaXMuX3NjaGVtYUNvbGxlY3Rpb24oKTtcbiAgICBhd2FpdCBzY2hlbWFDb2xsZWN0aW9uLnVwZGF0ZUZpZWxkT3B0aW9ucyhjbGFzc05hbWUsIGZpZWxkTmFtZSwgdHlwZSk7XG4gIH1cblxuICBhZGRGaWVsZElmTm90RXhpc3RzKGNsYXNzTmFtZTogc3RyaW5nLCBmaWVsZE5hbWU6IHN0cmluZywgdHlwZTogYW55KTogUHJvbWlzZTx2b2lkPiB7XG4gICAgcmV0dXJuIHRoaXMuX3NjaGVtYUNvbGxlY3Rpb24oKVxuICAgICAgLnRoZW4oc2NoZW1hQ29sbGVjdGlvbiA9PiBzY2hlbWFDb2xsZWN0aW9uLmFkZEZpZWxkSWZOb3RFeGlzdHMoY2xhc3NOYW1lLCBmaWVsZE5hbWUsIHR5cGUpKVxuICAgICAgLnRoZW4oKCkgPT4gdGhpcy5jcmVhdGVJbmRleGVzSWZOZWVkZWQoY2xhc3NOYW1lLCBmaWVsZE5hbWUsIHR5cGUpKVxuICAgICAgLmNhdGNoKGVyciA9PiB0aGlzLmhhbmRsZUVycm9yKGVycikpO1xuICB9XG5cbiAgLy8gRHJvcHMgYSBjb2xsZWN0aW9uLiBSZXNvbHZlcyB3aXRoIHRydWUgaWYgaXQgd2FzIGEgUGFyc2UgU2NoZW1hIChlZy4gX1VzZXIsIEN1c3RvbSwgZXRjLilcbiAgLy8gYW5kIHJlc29sdmVzIHdpdGggZmFsc2UgaWYgaXQgd2Fzbid0IChlZy4gYSBqb2luIHRhYmxlKS4gUmVqZWN0cyBpZiBkZWxldGlvbiB3YXMgaW1wb3NzaWJsZS5cbiAgZGVsZXRlQ2xhc3MoY2xhc3NOYW1lOiBzdHJpbmcpIHtcbiAgICByZXR1cm4gKFxuICAgICAgdGhpcy5fYWRhcHRpdmVDb2xsZWN0aW9uKGNsYXNzTmFtZSlcbiAgICAgICAgLnRoZW4oY29sbGVjdGlvbiA9PiBjb2xsZWN0aW9uLmRyb3AoKSlcbiAgICAgICAgLmNhdGNoKGVycm9yID0+IHtcbiAgICAgICAgICAvLyAnbnMgbm90IGZvdW5kJyBtZWFucyBjb2xsZWN0aW9uIHdhcyBhbHJlYWR5IGdvbmUuIElnbm9yZSBkZWxldGlvbiBhdHRlbXB0LlxuICAgICAgICAgIGlmIChlcnJvci5tZXNzYWdlID09ICducyBub3QgZm91bmQnKSB7XG4gICAgICAgICAgICByZXR1cm47XG4gICAgICAgICAgfVxuICAgICAgICAgIHRocm93IGVycm9yO1xuICAgICAgICB9KVxuICAgICAgICAvLyBXZSd2ZSBkcm9wcGVkIHRoZSBjb2xsZWN0aW9uLCBub3cgcmVtb3ZlIHRoZSBfU0NIRU1BIGRvY3VtZW50XG4gICAgICAgIC50aGVuKCgpID0+IHRoaXMuX3NjaGVtYUNvbGxlY3Rpb24oKSlcbiAgICAgICAgLnRoZW4oc2NoZW1hQ29sbGVjdGlvbiA9PiBzY2hlbWFDb2xsZWN0aW9uLmZpbmRBbmREZWxldGVTY2hlbWEoY2xhc3NOYW1lKSlcbiAgICAgICAgLmNhdGNoKGVyciA9PiB0aGlzLmhhbmRsZUVycm9yKGVycikpXG4gICAgKTtcbiAgfVxuXG4gIGRlbGV0ZUFsbENsYXNzZXMoZmFzdDogYm9vbGVhbikge1xuICAgIHJldHVybiBzdG9yYWdlQWRhcHRlckFsbENvbGxlY3Rpb25zKHRoaXMpLnRoZW4oY29sbGVjdGlvbnMgPT5cbiAgICAgIFByb21pc2UuYWxsKFxuICAgICAgICBjb2xsZWN0aW9ucy5tYXAoY29sbGVjdGlvbiA9PiAoZmFzdCA/IGNvbGxlY3Rpb24uZGVsZXRlTWFueSh7fSkgOiBjb2xsZWN0aW9uLmRyb3AoKSkpXG4gICAgICApXG4gICAgKTtcbiAgfVxuXG4gIC8vIFJlbW92ZSB0aGUgY29sdW1uIGFuZCBhbGwgdGhlIGRhdGEuIEZvciBSZWxhdGlvbnMsIHRoZSBfSm9pbiBjb2xsZWN0aW9uIGlzIGhhbmRsZWRcbiAgLy8gc3BlY2lhbGx5LCB0aGlzIGZ1bmN0aW9uIGRvZXMgbm90IGRlbGV0ZSBfSm9pbiBjb2x1bW5zLiBJdCBzaG91bGQsIGhvd2V2ZXIsIGluZGljYXRlXG4gIC8vIHRoYXQgdGhlIHJlbGF0aW9uIGZpZWxkcyBkb2VzIG5vdCBleGlzdCBhbnltb3JlLiBJbiBtb25nbywgdGhpcyBtZWFucyByZW1vdmluZyBpdCBmcm9tXG4gIC8vIHRoZSBfU0NIRU1BIGNvbGxlY3Rpb24uICBUaGVyZSBzaG91bGQgYmUgbm8gYWN0dWFsIGRhdGEgaW4gdGhlIGNvbGxlY3Rpb24gdW5kZXIgdGhlIHNhbWUgbmFtZVxuICAvLyBhcyB0aGUgcmVsYXRpb24gY29sdW1uLCBzbyBpdCdzIGZpbmUgdG8gYXR0ZW1wdCB0byBkZWxldGUgaXQuIElmIHRoZSBmaWVsZHMgbGlzdGVkIHRvIGJlXG4gIC8vIGRlbGV0ZWQgZG8gbm90IGV4aXN0LCB0aGlzIGZ1bmN0aW9uIHNob3VsZCByZXR1cm4gc3VjY2Vzc2Z1bGx5IGFueXdheXMuIENoZWNraW5nIGZvclxuICAvLyBhdHRlbXB0cyB0byBkZWxldGUgbm9uLWV4aXN0ZW50IGZpZWxkcyBpcyB0aGUgcmVzcG9uc2liaWxpdHkgb2YgUGFyc2UgU2VydmVyLlxuXG4gIC8vIFBvaW50ZXIgZmllbGQgbmFtZXMgYXJlIHBhc3NlZCBmb3IgbGVnYWN5IHJlYXNvbnM6IHRoZSBvcmlnaW5hbCBtb25nb1xuICAvLyBmb3JtYXQgc3RvcmVkIHBvaW50ZXIgZmllbGQgbmFtZXMgZGlmZmVyZW50bHkgaW4gdGhlIGRhdGFiYXNlLCBhbmQgdGhlcmVmb3JlXG4gIC8vIG5lZWRlZCB0byBrbm93IHRoZSB0eXBlIG9mIHRoZSBmaWVsZCBiZWZvcmUgaXQgY291bGQgZGVsZXRlIGl0LiBGdXR1cmUgZGF0YWJhc2VcbiAgLy8gYWRhcHRlcnMgc2hvdWxkIGlnbm9yZSB0aGUgcG9pbnRlckZpZWxkTmFtZXMgYXJndW1lbnQuIEFsbCB0aGUgZmllbGQgbmFtZXMgYXJlIGluXG4gIC8vIGZpZWxkTmFtZXMsIHRoZXkgc2hvdyB1cCBhZGRpdGlvbmFsbHkgaW4gdGhlIHBvaW50ZXJGaWVsZE5hbWVzIGRhdGFiYXNlIGZvciB1c2VcbiAgLy8gYnkgdGhlIG1vbmdvIGFkYXB0ZXIsIHdoaWNoIGRlYWxzIHdpdGggdGhlIGxlZ2FjeSBtb25nbyBmb3JtYXQuXG5cbiAgLy8gVGhpcyBmdW5jdGlvbiBpcyBub3Qgb2JsaWdhdGVkIHRvIGRlbGV0ZSBmaWVsZHMgYXRvbWljYWxseS4gSXQgaXMgZ2l2ZW4gdGhlIGZpZWxkXG4gIC8vIG5hbWVzIGluIGEgbGlzdCBzbyB0aGF0IGRhdGFiYXNlcyB0aGF0IGFyZSBjYXBhYmxlIG9mIGRlbGV0aW5nIGZpZWxkcyBhdG9taWNhbGx5XG4gIC8vIG1heSBkbyBzby5cblxuICAvLyBSZXR1cm5zIGEgUHJvbWlzZS5cbiAgZGVsZXRlRmllbGRzKGNsYXNzTmFtZTogc3RyaW5nLCBzY2hlbWE6IFNjaGVtYVR5cGUsIGZpZWxkTmFtZXM6IHN0cmluZ1tdKSB7XG4gICAgY29uc3QgbW9uZ29Gb3JtYXROYW1lcyA9IGZpZWxkTmFtZXMubWFwKGZpZWxkTmFtZSA9PiB7XG4gICAgICBpZiAoc2NoZW1hLmZpZWxkc1tmaWVsZE5hbWVdLnR5cGUgPT09ICdQb2ludGVyJykge1xuICAgICAgICByZXR1cm4gYF9wXyR7ZmllbGROYW1lfWA7XG4gICAgICB9IGVsc2Uge1xuICAgICAgICByZXR1cm4gZmllbGROYW1lO1xuICAgICAgfVxuICAgIH0pO1xuICAgIGNvbnN0IGNvbGxlY3Rpb25VcGRhdGUgPSB7ICR1bnNldDoge30gfTtcbiAgICBtb25nb0Zvcm1hdE5hbWVzLmZvckVhY2gobmFtZSA9PiB7XG4gICAgICBjb2xsZWN0aW9uVXBkYXRlWyckdW5zZXQnXVtuYW1lXSA9IG51bGw7XG4gICAgfSk7XG5cbiAgICBjb25zdCBjb2xsZWN0aW9uRmlsdGVyID0geyAkb3I6IFtdIH07XG4gICAgbW9uZ29Gb3JtYXROYW1lcy5mb3JFYWNoKG5hbWUgPT4ge1xuICAgICAgY29sbGVjdGlvbkZpbHRlclsnJG9yJ10ucHVzaCh7IFtuYW1lXTogeyAkZXhpc3RzOiB0cnVlIH0gfSk7XG4gICAgfSk7XG5cbiAgICBjb25zdCBzY2hlbWFVcGRhdGUgPSB7ICR1bnNldDoge30gfTtcbiAgICBmaWVsZE5hbWVzLmZvckVhY2gobmFtZSA9PiB7XG4gICAgICBzY2hlbWFVcGRhdGVbJyR1bnNldCddW25hbWVdID0gbnVsbDtcbiAgICAgIHNjaGVtYVVwZGF0ZVsnJHVuc2V0J11bYF9tZXRhZGF0YS5maWVsZHNfb3B0aW9ucy4ke25hbWV9YF0gPSBudWxsO1xuICAgIH0pO1xuXG4gICAgcmV0dXJuIHRoaXMuX2FkYXB0aXZlQ29sbGVjdGlvbihjbGFzc05hbWUpXG4gICAgICAudGhlbihjb2xsZWN0aW9uID0+IGNvbGxlY3Rpb24udXBkYXRlTWFueShjb2xsZWN0aW9uRmlsdGVyLCBjb2xsZWN0aW9uVXBkYXRlKSlcbiAgICAgIC50aGVuKCgpID0+IHRoaXMuX3NjaGVtYUNvbGxlY3Rpb24oKSlcbiAgICAgIC50aGVuKHNjaGVtYUNvbGxlY3Rpb24gPT4gc2NoZW1hQ29sbGVjdGlvbi51cGRhdGVTY2hlbWEoY2xhc3NOYW1lLCBzY2hlbWFVcGRhdGUpKVxuICAgICAgLmNhdGNoKGVyciA9PiB0aGlzLmhhbmRsZUVycm9yKGVycikpO1xuICB9XG5cbiAgLy8gUmV0dXJuIGEgcHJvbWlzZSBmb3IgYWxsIHNjaGVtYXMga25vd24gdG8gdGhpcyBhZGFwdGVyLCBpbiBQYXJzZSBmb3JtYXQuIEluIGNhc2UgdGhlXG4gIC8vIHNjaGVtYXMgY2Fubm90IGJlIHJldHJpZXZlZCwgcmV0dXJucyBhIHByb21pc2UgdGhhdCByZWplY3RzLiBSZXF1aXJlbWVudHMgZm9yIHRoZVxuICAvLyByZWplY3Rpb24gcmVhc29uIGFyZSBUQkQuXG4gIGdldEFsbENsYXNzZXMoKTogUHJvbWlzZTxTdG9yYWdlQ2xhc3NbXT4ge1xuICAgIHJldHVybiB0aGlzLl9zY2hlbWFDb2xsZWN0aW9uKClcbiAgICAgIC50aGVuKHNjaGVtYXNDb2xsZWN0aW9uID0+IHNjaGVtYXNDb2xsZWN0aW9uLl9mZXRjaEFsbFNjaGVtYXNGcm9tX1NDSEVNQSgpKVxuICAgICAgLmNhdGNoKGVyciA9PiB0aGlzLmhhbmRsZUVycm9yKGVycikpO1xuICB9XG5cbiAgLy8gUmV0dXJuIGEgcHJvbWlzZSBmb3IgdGhlIHNjaGVtYSB3aXRoIHRoZSBnaXZlbiBuYW1lLCBpbiBQYXJzZSBmb3JtYXQuIElmXG4gIC8vIHRoaXMgYWRhcHRlciBkb2Vzbid0IGtub3cgYWJvdXQgdGhlIHNjaGVtYSwgcmV0dXJuIGEgcHJvbWlzZSB0aGF0IHJlamVjdHMgd2l0aFxuICAvLyB1bmRlZmluZWQgYXMgdGhlIHJlYXNvbi5cbiAgZ2V0Q2xhc3MoY2xhc3NOYW1lOiBzdHJpbmcpOiBQcm9taXNlPFN0b3JhZ2VDbGFzcz4ge1xuICAgIHJldHVybiB0aGlzLl9zY2hlbWFDb2xsZWN0aW9uKClcbiAgICAgIC50aGVuKHNjaGVtYXNDb2xsZWN0aW9uID0+IHNjaGVtYXNDb2xsZWN0aW9uLl9mZXRjaE9uZVNjaGVtYUZyb21fU0NIRU1BKGNsYXNzTmFtZSkpXG4gICAgICAuY2F0Y2goZXJyID0+IHRoaXMuaGFuZGxlRXJyb3IoZXJyKSk7XG4gIH1cblxuICAvLyBUT0RPOiBBcyB5ZXQgbm90IHBhcnRpY3VsYXJseSB3ZWxsIHNwZWNpZmllZC4gQ3JlYXRlcyBhbiBvYmplY3QuIE1heWJlIHNob3VsZG4ndCBldmVuIG5lZWQgdGhlIHNjaGVtYSxcbiAgLy8gYW5kIHNob3VsZCBpbmZlciBmcm9tIHRoZSB0eXBlLiBPciBtYXliZSBkb2VzIG5lZWQgdGhlIHNjaGVtYSBmb3IgdmFsaWRhdGlvbnMuIE9yIG1heWJlIG5lZWRzXG4gIC8vIHRoZSBzY2hlbWEgb25seSBmb3IgdGhlIGxlZ2FjeSBtb25nbyBmb3JtYXQuIFdlJ2xsIGZpZ3VyZSB0aGF0IG91dCBsYXRlci5cbiAgY3JlYXRlT2JqZWN0KGNsYXNzTmFtZTogc3RyaW5nLCBzY2hlbWE6IFNjaGVtYVR5cGUsIG9iamVjdDogYW55LCB0cmFuc2FjdGlvbmFsU2Vzc2lvbjogP2FueSkge1xuICAgIHNjaGVtYSA9IGNvbnZlcnRQYXJzZVNjaGVtYVRvTW9uZ29TY2hlbWEoc2NoZW1hKTtcbiAgICBjb25zdCBtb25nb09iamVjdCA9IHBhcnNlT2JqZWN0VG9Nb25nb09iamVjdEZvckNyZWF0ZShjbGFzc05hbWUsIG9iamVjdCwgc2NoZW1hKTtcbiAgICByZXR1cm4gdGhpcy5fYWRhcHRpdmVDb2xsZWN0aW9uKGNsYXNzTmFtZSlcbiAgICAgIC50aGVuKGNvbGxlY3Rpb24gPT4gY29sbGVjdGlvbi5pbnNlcnRPbmUobW9uZ29PYmplY3QsIHRyYW5zYWN0aW9uYWxTZXNzaW9uKSlcbiAgICAgIC5jYXRjaChlcnJvciA9PiB7XG4gICAgICAgIGlmIChlcnJvci5jb2RlID09PSAxMTAwMCkge1xuICAgICAgICAgIC8vIER1cGxpY2F0ZSB2YWx1ZVxuICAgICAgICAgIGNvbnN0IGVyciA9IG5ldyBQYXJzZS5FcnJvcihcbiAgICAgICAgICAgIFBhcnNlLkVycm9yLkRVUExJQ0FURV9WQUxVRSxcbiAgICAgICAgICAgICdBIGR1cGxpY2F0ZSB2YWx1ZSBmb3IgYSBmaWVsZCB3aXRoIHVuaXF1ZSB2YWx1ZXMgd2FzIHByb3ZpZGVkJ1xuICAgICAgICAgICk7XG4gICAgICAgICAgZXJyLnVuZGVybHlpbmdFcnJvciA9IGVycm9yO1xuICAgICAgICAgIGlmIChlcnJvci5tZXNzYWdlKSB7XG4gICAgICAgICAgICBjb25zdCBtYXRjaGVzID0gZXJyb3IubWVzc2FnZS5tYXRjaCgvaW5kZXg6W1xcc2EtekEtWjAtOV9cXC1cXC5dK1xcJD8oW2EtekEtWl8tXSspXzEvKTtcbiAgICAgICAgICAgIGlmIChtYXRjaGVzICYmIEFycmF5LmlzQXJyYXkobWF0Y2hlcykpIHtcbiAgICAgICAgICAgICAgZXJyLnVzZXJJbmZvID0geyBkdXBsaWNhdGVkX2ZpZWxkOiBtYXRjaGVzWzFdIH07XG4gICAgICAgICAgICB9XG4gICAgICAgICAgfVxuICAgICAgICAgIHRocm93IGVycjtcbiAgICAgICAgfVxuICAgICAgICB0aHJvdyBlcnJvcjtcbiAgICAgIH0pXG4gICAgICAuY2F0Y2goZXJyID0+IHRoaXMuaGFuZGxlRXJyb3IoZXJyKSk7XG4gIH1cblxuICAvLyBSZW1vdmUgYWxsIG9iamVjdHMgdGhhdCBtYXRjaCB0aGUgZ2l2ZW4gUGFyc2UgUXVlcnkuXG4gIC8vIElmIG5vIG9iamVjdHMgbWF0Y2gsIHJlamVjdCB3aXRoIE9CSkVDVF9OT1RfRk9VTkQuIElmIG9iamVjdHMgYXJlIGZvdW5kIGFuZCBkZWxldGVkLCByZXNvbHZlIHdpdGggdW5kZWZpbmVkLlxuICAvLyBJZiB0aGVyZSBpcyBzb21lIG90aGVyIGVycm9yLCByZWplY3Qgd2l0aCBJTlRFUk5BTF9TRVJWRVJfRVJST1IuXG4gIGRlbGV0ZU9iamVjdHNCeVF1ZXJ5KFxuICAgIGNsYXNzTmFtZTogc3RyaW5nLFxuICAgIHNjaGVtYTogU2NoZW1hVHlwZSxcbiAgICBxdWVyeTogUXVlcnlUeXBlLFxuICAgIHRyYW5zYWN0aW9uYWxTZXNzaW9uOiA/YW55XG4gICkge1xuICAgIHNjaGVtYSA9IGNvbnZlcnRQYXJzZVNjaGVtYVRvTW9uZ29TY2hlbWEoc2NoZW1hKTtcbiAgICByZXR1cm4gdGhpcy5fYWRhcHRpdmVDb2xsZWN0aW9uKGNsYXNzTmFtZSlcbiAgICAgIC50aGVuKGNvbGxlY3Rpb24gPT4ge1xuICAgICAgICBjb25zdCBtb25nb1doZXJlID0gdHJhbnNmb3JtV2hlcmUoY2xhc3NOYW1lLCBxdWVyeSwgc2NoZW1hKTtcbiAgICAgICAgcmV0dXJuIGNvbGxlY3Rpb24uZGVsZXRlTWFueShtb25nb1doZXJlLCB0cmFuc2FjdGlvbmFsU2Vzc2lvbik7XG4gICAgICB9KVxuICAgICAgLmNhdGNoKGVyciA9PiB0aGlzLmhhbmRsZUVycm9yKGVycikpXG4gICAgICAudGhlbihcbiAgICAgICAgKHsgcmVzdWx0IH0pID0+IHtcbiAgICAgICAgICBpZiAocmVzdWx0Lm4gPT09IDApIHtcbiAgICAgICAgICAgIHRocm93IG5ldyBQYXJzZS5FcnJvcihQYXJzZS5FcnJvci5PQkpFQ1RfTk9UX0ZPVU5ELCAnT2JqZWN0IG5vdCBmb3VuZC4nKTtcbiAgICAgICAgICB9XG4gICAgICAgICAgcmV0dXJuIFByb21pc2UucmVzb2x2ZSgpO1xuICAgICAgICB9LFxuICAgICAgICAoKSA9PiB7XG4gICAgICAgICAgdGhyb3cgbmV3IFBhcnNlLkVycm9yKFBhcnNlLkVycm9yLklOVEVSTkFMX1NFUlZFUl9FUlJPUiwgJ0RhdGFiYXNlIGFkYXB0ZXIgZXJyb3InKTtcbiAgICAgICAgfVxuICAgICAgKTtcbiAgfVxuXG4gIC8vIEFwcGx5IHRoZSB1cGRhdGUgdG8gYWxsIG9iamVjdHMgdGhhdCBtYXRjaCB0aGUgZ2l2ZW4gUGFyc2UgUXVlcnkuXG4gIHVwZGF0ZU9iamVjdHNCeVF1ZXJ5KFxuICAgIGNsYXNzTmFtZTogc3RyaW5nLFxuICAgIHNjaGVtYTogU2NoZW1hVHlwZSxcbiAgICBxdWVyeTogUXVlcnlUeXBlLFxuICAgIHVwZGF0ZTogYW55LFxuICAgIHRyYW5zYWN0aW9uYWxTZXNzaW9uOiA/YW55XG4gICkge1xuICAgIHNjaGVtYSA9IGNvbnZlcnRQYXJzZVNjaGVtYVRvTW9uZ29TY2hlbWEoc2NoZW1hKTtcbiAgICBjb25zdCBtb25nb1VwZGF0ZSA9IHRyYW5zZm9ybVVwZGF0ZShjbGFzc05hbWUsIHVwZGF0ZSwgc2NoZW1hKTtcbiAgICBjb25zdCBtb25nb1doZXJlID0gdHJhbnNmb3JtV2hlcmUoY2xhc3NOYW1lLCBxdWVyeSwgc2NoZW1hKTtcbiAgICByZXR1cm4gdGhpcy5fYWRhcHRpdmVDb2xsZWN0aW9uKGNsYXNzTmFtZSlcbiAgICAgIC50aGVuKGNvbGxlY3Rpb24gPT4gY29sbGVjdGlvbi51cGRhdGVNYW55KG1vbmdvV2hlcmUsIG1vbmdvVXBkYXRlLCB0cmFuc2FjdGlvbmFsU2Vzc2lvbikpXG4gICAgICAuY2F0Y2goZXJyID0+IHRoaXMuaGFuZGxlRXJyb3IoZXJyKSk7XG4gIH1cblxuICAvLyBBdG9taWNhbGx5IGZpbmRzIGFuZCB1cGRhdGVzIGFuIG9iamVjdCBiYXNlZCBvbiBxdWVyeS5cbiAgLy8gUmV0dXJuIHZhbHVlIG5vdCBjdXJyZW50bHkgd2VsbCBzcGVjaWZpZWQuXG4gIGZpbmRPbmVBbmRVcGRhdGUoXG4gICAgY2xhc3NOYW1lOiBzdHJpbmcsXG4gICAgc2NoZW1hOiBTY2hlbWFUeXBlLFxuICAgIHF1ZXJ5OiBRdWVyeVR5cGUsXG4gICAgdXBkYXRlOiBhbnksXG4gICAgdHJhbnNhY3Rpb25hbFNlc3Npb246ID9hbnlcbiAgKSB7XG4gICAgc2NoZW1hID0gY29udmVydFBhcnNlU2NoZW1hVG9Nb25nb1NjaGVtYShzY2hlbWEpO1xuICAgIGNvbnN0IG1vbmdvVXBkYXRlID0gdHJhbnNmb3JtVXBkYXRlKGNsYXNzTmFtZSwgdXBkYXRlLCBzY2hlbWEpO1xuICAgIGNvbnN0IG1vbmdvV2hlcmUgPSB0cmFuc2Zvcm1XaGVyZShjbGFzc05hbWUsIHF1ZXJ5LCBzY2hlbWEpO1xuICAgIHJldHVybiB0aGlzLl9hZGFwdGl2ZUNvbGxlY3Rpb24oY2xhc3NOYW1lKVxuICAgICAgLnRoZW4oY29sbGVjdGlvbiA9PlxuICAgICAgICBjb2xsZWN0aW9uLl9tb25nb0NvbGxlY3Rpb24uZmluZE9uZUFuZFVwZGF0ZShtb25nb1doZXJlLCBtb25nb1VwZGF0ZSwge1xuICAgICAgICAgIHJldHVybk9yaWdpbmFsOiBmYWxzZSxcbiAgICAgICAgICBzZXNzaW9uOiB0cmFuc2FjdGlvbmFsU2Vzc2lvbiB8fCB1bmRlZmluZWQsXG4gICAgICAgIH0pXG4gICAgICApXG4gICAgICAudGhlbihyZXN1bHQgPT4gbW9uZ29PYmplY3RUb1BhcnNlT2JqZWN0KGNsYXNzTmFtZSwgcmVzdWx0LnZhbHVlLCBzY2hlbWEpKVxuICAgICAgLmNhdGNoKGVycm9yID0+IHtcbiAgICAgICAgaWYgKGVycm9yLmNvZGUgPT09IDExMDAwKSB7XG4gICAgICAgICAgdGhyb3cgbmV3IFBhcnNlLkVycm9yKFxuICAgICAgICAgICAgUGFyc2UuRXJyb3IuRFVQTElDQVRFX1ZBTFVFLFxuICAgICAgICAgICAgJ0EgZHVwbGljYXRlIHZhbHVlIGZvciBhIGZpZWxkIHdpdGggdW5pcXVlIHZhbHVlcyB3YXMgcHJvdmlkZWQnXG4gICAgICAgICAgKTtcbiAgICAgICAgfVxuICAgICAgICB0aHJvdyBlcnJvcjtcbiAgICAgIH0pXG4gICAgICAuY2F0Y2goZXJyID0+IHRoaXMuaGFuZGxlRXJyb3IoZXJyKSk7XG4gIH1cblxuICAvLyBIb3BlZnVsbHkgd2UgY2FuIGdldCByaWQgb2YgdGhpcy4gSXQncyBvbmx5IHVzZWQgZm9yIGNvbmZpZyBhbmQgaG9va3MuXG4gIHVwc2VydE9uZU9iamVjdChcbiAgICBjbGFzc05hbWU6IHN0cmluZyxcbiAgICBzY2hlbWE6IFNjaGVtYVR5cGUsXG4gICAgcXVlcnk6IFF1ZXJ5VHlwZSxcbiAgICB1cGRhdGU6IGFueSxcbiAgICB0cmFuc2FjdGlvbmFsU2Vzc2lvbjogP2FueVxuICApIHtcbiAgICBzY2hlbWEgPSBjb252ZXJ0UGFyc2VTY2hlbWFUb01vbmdvU2NoZW1hKHNjaGVtYSk7XG4gICAgY29uc3QgbW9uZ29VcGRhdGUgPSB0cmFuc2Zvcm1VcGRhdGUoY2xhc3NOYW1lLCB1cGRhdGUsIHNjaGVtYSk7XG4gICAgY29uc3QgbW9uZ29XaGVyZSA9IHRyYW5zZm9ybVdoZXJlKGNsYXNzTmFtZSwgcXVlcnksIHNjaGVtYSk7XG4gICAgcmV0dXJuIHRoaXMuX2FkYXB0aXZlQ29sbGVjdGlvbihjbGFzc05hbWUpXG4gICAgICAudGhlbihjb2xsZWN0aW9uID0+IGNvbGxlY3Rpb24udXBzZXJ0T25lKG1vbmdvV2hlcmUsIG1vbmdvVXBkYXRlLCB0cmFuc2FjdGlvbmFsU2Vzc2lvbikpXG4gICAgICAuY2F0Y2goZXJyID0+IHRoaXMuaGFuZGxlRXJyb3IoZXJyKSk7XG4gIH1cblxuICAvLyBFeGVjdXRlcyBhIGZpbmQuIEFjY2VwdHM6IGNsYXNzTmFtZSwgcXVlcnkgaW4gUGFyc2UgZm9ybWF0LCBhbmQgeyBza2lwLCBsaW1pdCwgc29ydCB9LlxuICBmaW5kKFxuICAgIGNsYXNzTmFtZTogc3RyaW5nLFxuICAgIHNjaGVtYTogU2NoZW1hVHlwZSxcbiAgICBxdWVyeTogUXVlcnlUeXBlLFxuICAgIHsgc2tpcCwgbGltaXQsIHNvcnQsIGtleXMsIHJlYWRQcmVmZXJlbmNlLCBoaW50LCBjYXNlSW5zZW5zaXRpdmUsIGV4cGxhaW4gfTogUXVlcnlPcHRpb25zXG4gICk6IFByb21pc2U8YW55PiB7XG4gICAgc2NoZW1hID0gY29udmVydFBhcnNlU2NoZW1hVG9Nb25nb1NjaGVtYShzY2hlbWEpO1xuICAgIGNvbnN0IG1vbmdvV2hlcmUgPSB0cmFuc2Zvcm1XaGVyZShjbGFzc05hbWUsIHF1ZXJ5LCBzY2hlbWEpO1xuICAgIGNvbnN0IG1vbmdvU29ydCA9IF8ubWFwS2V5cyhzb3J0LCAodmFsdWUsIGZpZWxkTmFtZSkgPT5cbiAgICAgIHRyYW5zZm9ybUtleShjbGFzc05hbWUsIGZpZWxkTmFtZSwgc2NoZW1hKVxuICAgICk7XG4gICAgY29uc3QgbW9uZ29LZXlzID0gXy5yZWR1Y2UoXG4gICAgICBrZXlzLFxuICAgICAgKG1lbW8sIGtleSkgPT4ge1xuICAgICAgICBpZiAoa2V5ID09PSAnQUNMJykge1xuICAgICAgICAgIG1lbW9bJ19ycGVybSddID0gMTtcbiAgICAgICAgICBtZW1vWydfd3Blcm0nXSA9IDE7XG4gICAgICAgIH0gZWxzZSB7XG4gICAgICAgICAgbWVtb1t0cmFuc2Zvcm1LZXkoY2xhc3NOYW1lLCBrZXksIHNjaGVtYSldID0gMTtcbiAgICAgICAgfVxuICAgICAgICByZXR1cm4gbWVtbztcbiAgICAgIH0sXG4gICAgICB7fVxuICAgICk7XG5cbiAgICAvLyBJZiB3ZSBhcmVuJ3QgcmVxdWVzdGluZyB0aGUgYF9pZGAgZmllbGQsIHdlIG5lZWQgdG8gZXhwbGljaXRseSBvcHQgb3V0XG4gICAgLy8gb2YgaXQuIERvaW5nIHNvIGluIHBhcnNlLXNlcnZlciBpcyB1bnVzdWFsLCBidXQgaXQgY2FuIGFsbG93IHVzIHRvXG4gICAgLy8gb3B0aW1pemUgc29tZSBxdWVyaWVzIHdpdGggY292ZXJpbmcgaW5kZXhlcy5cbiAgICBpZiAoa2V5cyAmJiAhbW9uZ29LZXlzLl9pZCkge1xuICAgICAgbW9uZ29LZXlzLl9pZCA9IDA7XG4gICAgfVxuXG4gICAgcmVhZFByZWZlcmVuY2UgPSB0aGlzLl9wYXJzZVJlYWRQcmVmZXJlbmNlKHJlYWRQcmVmZXJlbmNlKTtcbiAgICByZXR1cm4gdGhpcy5jcmVhdGVUZXh0SW5kZXhlc0lmTmVlZGVkKGNsYXNzTmFtZSwgcXVlcnksIHNjaGVtYSlcbiAgICAgIC50aGVuKCgpID0+IHRoaXMuX2FkYXB0aXZlQ29sbGVjdGlvbihjbGFzc05hbWUpKVxuICAgICAgLnRoZW4oY29sbGVjdGlvbiA9PlxuICAgICAgICBjb2xsZWN0aW9uLmZpbmQobW9uZ29XaGVyZSwge1xuICAgICAgICAgIHNraXAsXG4gICAgICAgICAgbGltaXQsXG4gICAgICAgICAgc29ydDogbW9uZ29Tb3J0LFxuICAgICAgICAgIGtleXM6IG1vbmdvS2V5cyxcbiAgICAgICAgICBtYXhUaW1lTVM6IHRoaXMuX21heFRpbWVNUyxcbiAgICAgICAgICByZWFkUHJlZmVyZW5jZSxcbiAgICAgICAgICBoaW50LFxuICAgICAgICAgIGNhc2VJbnNlbnNpdGl2ZSxcbiAgICAgICAgICBleHBsYWluLFxuICAgICAgICB9KVxuICAgICAgKVxuICAgICAgLnRoZW4ob2JqZWN0cyA9PiB7XG4gICAgICAgIGlmIChleHBsYWluKSB7XG4gICAgICAgICAgcmV0dXJuIG9iamVjdHM7XG4gICAgICAgIH1cbiAgICAgICAgcmV0dXJuIG9iamVjdHMubWFwKG9iamVjdCA9PiBtb25nb09iamVjdFRvUGFyc2VPYmplY3QoY2xhc3NOYW1lLCBvYmplY3QsIHNjaGVtYSkpO1xuICAgICAgfSlcbiAgICAgIC5jYXRjaChlcnIgPT4gdGhpcy5oYW5kbGVFcnJvcihlcnIpKTtcbiAgfVxuXG4gIGVuc3VyZUluZGV4KFxuICAgIGNsYXNzTmFtZTogc3RyaW5nLFxuICAgIHNjaGVtYTogU2NoZW1hVHlwZSxcbiAgICBmaWVsZE5hbWVzOiBzdHJpbmdbXSxcbiAgICBpbmRleE5hbWU6ID9zdHJpbmcsXG4gICAgY2FzZUluc2Vuc2l0aXZlOiBib29sZWFuID0gZmFsc2UsXG4gICAgb3B0aW9ucz86IE9iamVjdCA9IHt9XG4gICk6IFByb21pc2U8YW55PiB7XG4gICAgc2NoZW1hID0gY29udmVydFBhcnNlU2NoZW1hVG9Nb25nb1NjaGVtYShzY2hlbWEpO1xuICAgIGNvbnN0IGluZGV4Q3JlYXRpb25SZXF1ZXN0ID0ge307XG4gICAgY29uc3QgbW9uZ29GaWVsZE5hbWVzID0gZmllbGROYW1lcy5tYXAoZmllbGROYW1lID0+IHRyYW5zZm9ybUtleShjbGFzc05hbWUsIGZpZWxkTmFtZSwgc2NoZW1hKSk7XG4gICAgbW9uZ29GaWVsZE5hbWVzLmZvckVhY2goZmllbGROYW1lID0+IHtcbiAgICAgIGluZGV4Q3JlYXRpb25SZXF1ZXN0W2ZpZWxkTmFtZV0gPSBvcHRpb25zLmluZGV4VHlwZSAhPT0gdW5kZWZpbmVkID8gb3B0aW9ucy5pbmRleFR5cGUgOiAxO1xuICAgIH0pO1xuXG4gICAgY29uc3QgZGVmYXVsdE9wdGlvbnM6IE9iamVjdCA9IHsgYmFja2dyb3VuZDogdHJ1ZSwgc3BhcnNlOiB0cnVlIH07XG4gICAgY29uc3QgaW5kZXhOYW1lT3B0aW9uczogT2JqZWN0ID0gaW5kZXhOYW1lID8geyBuYW1lOiBpbmRleE5hbWUgfSA6IHt9O1xuICAgIGNvbnN0IHR0bE9wdGlvbnM6IE9iamVjdCA9IG9wdGlvbnMudHRsICE9PSB1bmRlZmluZWQgPyB7IGV4cGlyZUFmdGVyU2Vjb25kczogb3B0aW9ucy50dGwgfSA6IHt9O1xuICAgIGNvbnN0IGNhc2VJbnNlbnNpdGl2ZU9wdGlvbnM6IE9iamVjdCA9IGNhc2VJbnNlbnNpdGl2ZVxuICAgICAgPyB7IGNvbGxhdGlvbjogTW9uZ29Db2xsZWN0aW9uLmNhc2VJbnNlbnNpdGl2ZUNvbGxhdGlvbigpIH1cbiAgICAgIDoge307XG4gICAgY29uc3QgaW5kZXhPcHRpb25zOiBPYmplY3QgPSB7XG4gICAgICAuLi5kZWZhdWx0T3B0aW9ucyxcbiAgICAgIC4uLmNhc2VJbnNlbnNpdGl2ZU9wdGlvbnMsXG4gICAgICAuLi5pbmRleE5hbWVPcHRpb25zLFxuICAgICAgLi4udHRsT3B0aW9ucyxcbiAgICB9O1xuXG4gICAgcmV0dXJuIHRoaXMuX2FkYXB0aXZlQ29sbGVjdGlvbihjbGFzc05hbWUpXG4gICAgICAudGhlbihcbiAgICAgICAgY29sbGVjdGlvbiA9PlxuICAgICAgICAgIG5ldyBQcm9taXNlKChyZXNvbHZlLCByZWplY3QpID0+XG4gICAgICAgICAgICBjb2xsZWN0aW9uLl9tb25nb0NvbGxlY3Rpb24uY3JlYXRlSW5kZXgoaW5kZXhDcmVhdGlvblJlcXVlc3QsIGluZGV4T3B0aW9ucywgZXJyb3IgPT5cbiAgICAgICAgICAgICAgZXJyb3IgPyByZWplY3QoZXJyb3IpIDogcmVzb2x2ZSgpXG4gICAgICAgICAgICApXG4gICAgICAgICAgKVxuICAgICAgKVxuICAgICAgLmNhdGNoKGVyciA9PiB0aGlzLmhhbmRsZUVycm9yKGVycikpO1xuICB9XG5cbiAgLy8gQ3JlYXRlIGEgdW5pcXVlIGluZGV4LiBVbmlxdWUgaW5kZXhlcyBvbiBudWxsYWJsZSBmaWVsZHMgYXJlIG5vdCBhbGxvd2VkLiBTaW5jZSB3ZSBkb24ndFxuICAvLyBjdXJyZW50bHkga25vdyB3aGljaCBmaWVsZHMgYXJlIG51bGxhYmxlIGFuZCB3aGljaCBhcmVuJ3QsIHdlIGlnbm9yZSB0aGF0IGNyaXRlcmlhLlxuICAvLyBBcyBzdWNoLCB3ZSBzaG91bGRuJ3QgZXhwb3NlIHRoaXMgZnVuY3Rpb24gdG8gdXNlcnMgb2YgcGFyc2UgdW50aWwgd2UgaGF2ZSBhbiBvdXQtb2YtYmFuZFxuICAvLyBXYXkgb2YgZGV0ZXJtaW5pbmcgaWYgYSBmaWVsZCBpcyBudWxsYWJsZS4gVW5kZWZpbmVkIGRvZXNuJ3QgY291bnQgYWdhaW5zdCB1bmlxdWVuZXNzLFxuICAvLyB3aGljaCBpcyB3aHkgd2UgdXNlIHNwYXJzZSBpbmRleGVzLlxuICBlbnN1cmVVbmlxdWVuZXNzKGNsYXNzTmFtZTogc3RyaW5nLCBzY2hlbWE6IFNjaGVtYVR5cGUsIGZpZWxkTmFtZXM6IHN0cmluZ1tdKSB7XG4gICAgc2NoZW1hID0gY29udmVydFBhcnNlU2NoZW1hVG9Nb25nb1NjaGVtYShzY2hlbWEpO1xuICAgIGNvbnN0IGluZGV4Q3JlYXRpb25SZXF1ZXN0ID0ge307XG4gICAgY29uc3QgbW9uZ29GaWVsZE5hbWVzID0gZmllbGROYW1lcy5tYXAoZmllbGROYW1lID0+IHRyYW5zZm9ybUtleShjbGFzc05hbWUsIGZpZWxkTmFtZSwgc2NoZW1hKSk7XG4gICAgbW9uZ29GaWVsZE5hbWVzLmZvckVhY2goZmllbGROYW1lID0+IHtcbiAgICAgIGluZGV4Q3JlYXRpb25SZXF1ZXN0W2ZpZWxkTmFtZV0gPSAxO1xuICAgIH0pO1xuICAgIHJldHVybiB0aGlzLl9hZGFwdGl2ZUNvbGxlY3Rpb24oY2xhc3NOYW1lKVxuICAgICAgLnRoZW4oY29sbGVjdGlvbiA9PiBjb2xsZWN0aW9uLl9lbnN1cmVTcGFyc2VVbmlxdWVJbmRleEluQmFja2dyb3VuZChpbmRleENyZWF0aW9uUmVxdWVzdCkpXG4gICAgICAuY2F0Y2goZXJyb3IgPT4ge1xuICAgICAgICBpZiAoZXJyb3IuY29kZSA9PT0gMTEwMDApIHtcbiAgICAgICAgICB0aHJvdyBuZXcgUGFyc2UuRXJyb3IoXG4gICAgICAgICAgICBQYXJzZS5FcnJvci5EVVBMSUNBVEVfVkFMVUUsXG4gICAgICAgICAgICAnVHJpZWQgdG8gZW5zdXJlIGZpZWxkIHVuaXF1ZW5lc3MgZm9yIGEgY2xhc3MgdGhhdCBhbHJlYWR5IGhhcyBkdXBsaWNhdGVzLidcbiAgICAgICAgICApO1xuICAgICAgICB9XG4gICAgICAgIHRocm93IGVycm9yO1xuICAgICAgfSlcbiAgICAgIC5jYXRjaChlcnIgPT4gdGhpcy5oYW5kbGVFcnJvcihlcnIpKTtcbiAgfVxuXG4gIC8vIFVzZWQgaW4gdGVzdHNcbiAgX3Jhd0ZpbmQoY2xhc3NOYW1lOiBzdHJpbmcsIHF1ZXJ5OiBRdWVyeVR5cGUpIHtcbiAgICByZXR1cm4gdGhpcy5fYWRhcHRpdmVDb2xsZWN0aW9uKGNsYXNzTmFtZSlcbiAgICAgIC50aGVuKGNvbGxlY3Rpb24gPT5cbiAgICAgICAgY29sbGVjdGlvbi5maW5kKHF1ZXJ5LCB7XG4gICAgICAgICAgbWF4VGltZU1TOiB0aGlzLl9tYXhUaW1lTVMsXG4gICAgICAgIH0pXG4gICAgICApXG4gICAgICAuY2F0Y2goZXJyID0+IHRoaXMuaGFuZGxlRXJyb3IoZXJyKSk7XG4gIH1cblxuICAvLyBFeGVjdXRlcyBhIGNvdW50LlxuICBjb3VudChcbiAgICBjbGFzc05hbWU6IHN0cmluZyxcbiAgICBzY2hlbWE6IFNjaGVtYVR5cGUsXG4gICAgcXVlcnk6IFF1ZXJ5VHlwZSxcbiAgICByZWFkUHJlZmVyZW5jZTogP3N0cmluZyxcbiAgICBoaW50OiA/bWl4ZWRcbiAgKSB7XG4gICAgc2NoZW1hID0gY29udmVydFBhcnNlU2NoZW1hVG9Nb25nb1NjaGVtYShzY2hlbWEpO1xuICAgIHJlYWRQcmVmZXJlbmNlID0gdGhpcy5fcGFyc2VSZWFkUHJlZmVyZW5jZShyZWFkUHJlZmVyZW5jZSk7XG4gICAgcmV0dXJuIHRoaXMuX2FkYXB0aXZlQ29sbGVjdGlvbihjbGFzc05hbWUpXG4gICAgICAudGhlbihjb2xsZWN0aW9uID0+XG4gICAgICAgIGNvbGxlY3Rpb24uY291bnQodHJhbnNmb3JtV2hlcmUoY2xhc3NOYW1lLCBxdWVyeSwgc2NoZW1hLCB0cnVlKSwge1xuICAgICAgICAgIG1heFRpbWVNUzogdGhpcy5fbWF4VGltZU1TLFxuICAgICAgICAgIHJlYWRQcmVmZXJlbmNlLFxuICAgICAgICAgIGhpbnQsXG4gICAgICAgIH0pXG4gICAgICApXG4gICAgICAuY2F0Y2goZXJyID0+IHRoaXMuaGFuZGxlRXJyb3IoZXJyKSk7XG4gIH1cblxuICBkaXN0aW5jdChjbGFzc05hbWU6IHN0cmluZywgc2NoZW1hOiBTY2hlbWFUeXBlLCBxdWVyeTogUXVlcnlUeXBlLCBmaWVsZE5hbWU6IHN0cmluZykge1xuICAgIHNjaGVtYSA9IGNvbnZlcnRQYXJzZVNjaGVtYVRvTW9uZ29TY2hlbWEoc2NoZW1hKTtcbiAgICBjb25zdCBpc1BvaW50ZXJGaWVsZCA9IHNjaGVtYS5maWVsZHNbZmllbGROYW1lXSAmJiBzY2hlbWEuZmllbGRzW2ZpZWxkTmFtZV0udHlwZSA9PT0gJ1BvaW50ZXInO1xuICAgIGNvbnN0IHRyYW5zZm9ybUZpZWxkID0gdHJhbnNmb3JtS2V5KGNsYXNzTmFtZSwgZmllbGROYW1lLCBzY2hlbWEpO1xuXG4gICAgcmV0dXJuIHRoaXMuX2FkYXB0aXZlQ29sbGVjdGlvbihjbGFzc05hbWUpXG4gICAgICAudGhlbihjb2xsZWN0aW9uID0+XG4gICAgICAgIGNvbGxlY3Rpb24uZGlzdGluY3QodHJhbnNmb3JtRmllbGQsIHRyYW5zZm9ybVdoZXJlKGNsYXNzTmFtZSwgcXVlcnksIHNjaGVtYSkpXG4gICAgICApXG4gICAgICAudGhlbihvYmplY3RzID0+IHtcbiAgICAgICAgb2JqZWN0cyA9IG9iamVjdHMuZmlsdGVyKG9iaiA9PiBvYmogIT0gbnVsbCk7XG4gICAgICAgIHJldHVybiBvYmplY3RzLm1hcChvYmplY3QgPT4ge1xuICAgICAgICAgIGlmIChpc1BvaW50ZXJGaWVsZCkge1xuICAgICAgICAgICAgcmV0dXJuIHRyYW5zZm9ybVBvaW50ZXJTdHJpbmcoc2NoZW1hLCBmaWVsZE5hbWUsIG9iamVjdCk7XG4gICAgICAgICAgfVxuICAgICAgICAgIHJldHVybiBtb25nb09iamVjdFRvUGFyc2VPYmplY3QoY2xhc3NOYW1lLCBvYmplY3QsIHNjaGVtYSk7XG4gICAgICAgIH0pO1xuICAgICAgfSlcbiAgICAgIC5jYXRjaChlcnIgPT4gdGhpcy5oYW5kbGVFcnJvcihlcnIpKTtcbiAgfVxuXG4gIGFnZ3JlZ2F0ZShcbiAgICBjbGFzc05hbWU6IHN0cmluZyxcbiAgICBzY2hlbWE6IGFueSxcbiAgICBwaXBlbGluZTogYW55LFxuICAgIHJlYWRQcmVmZXJlbmNlOiA/c3RyaW5nLFxuICAgIGhpbnQ6ID9taXhlZCxcbiAgICBleHBsYWluPzogYm9vbGVhblxuICApIHtcbiAgICBsZXQgaXNQb2ludGVyRmllbGQgPSBmYWxzZTtcbiAgICBwaXBlbGluZSA9IHBpcGVsaW5lLm1hcChzdGFnZSA9PiB7XG4gICAgICBpZiAoc3RhZ2UuJGdyb3VwKSB7XG4gICAgICAgIHN0YWdlLiRncm91cCA9IHRoaXMuX3BhcnNlQWdncmVnYXRlR3JvdXBBcmdzKHNjaGVtYSwgc3RhZ2UuJGdyb3VwKTtcbiAgICAgICAgaWYgKFxuICAgICAgICAgIHN0YWdlLiRncm91cC5faWQgJiZcbiAgICAgICAgICB0eXBlb2Ygc3RhZ2UuJGdyb3VwLl9pZCA9PT0gJ3N0cmluZycgJiZcbiAgICAgICAgICBzdGFnZS4kZ3JvdXAuX2lkLmluZGV4T2YoJyRfcF8nKSA+PSAwXG4gICAgICAgICkge1xuICAgICAgICAgIGlzUG9pbnRlckZpZWxkID0gdHJ1ZTtcbiAgICAgICAgfVxuICAgICAgfVxuICAgICAgaWYgKHN0YWdlLiRtYXRjaCkge1xuICAgICAgICBzdGFnZS4kbWF0Y2ggPSB0aGlzLl9wYXJzZUFnZ3JlZ2F0ZUFyZ3Moc2NoZW1hLCBzdGFnZS4kbWF0Y2gpO1xuICAgICAgfVxuICAgICAgaWYgKHN0YWdlLiRwcm9qZWN0KSB7XG4gICAgICAgIHN0YWdlLiRwcm9qZWN0ID0gdGhpcy5fcGFyc2VBZ2dyZWdhdGVQcm9qZWN0QXJncyhzY2hlbWEsIHN0YWdlLiRwcm9qZWN0KTtcbiAgICAgIH1cbiAgICAgIGlmIChzdGFnZS4kZ2VvTmVhciAmJiBzdGFnZS4kZ2VvTmVhci5xdWVyeSkge1xuICAgICAgICBzdGFnZS4kZ2VvTmVhci5xdWVyeSA9IHRoaXMuX3BhcnNlQWdncmVnYXRlQXJncyhzY2hlbWEsIHN0YWdlLiRnZW9OZWFyLnF1ZXJ5KTtcbiAgICAgIH1cbiAgICAgIHJldHVybiBzdGFnZTtcbiAgICB9KTtcbiAgICByZWFkUHJlZmVyZW5jZSA9IHRoaXMuX3BhcnNlUmVhZFByZWZlcmVuY2UocmVhZFByZWZlcmVuY2UpO1xuICAgIHJldHVybiB0aGlzLl9hZGFwdGl2ZUNvbGxlY3Rpb24oY2xhc3NOYW1lKVxuICAgICAgLnRoZW4oY29sbGVjdGlvbiA9PlxuICAgICAgICBjb2xsZWN0aW9uLmFnZ3JlZ2F0ZShwaXBlbGluZSwge1xuICAgICAgICAgIHJlYWRQcmVmZXJlbmNlLFxuICAgICAgICAgIG1heFRpbWVNUzogdGhpcy5fbWF4VGltZU1TLFxuICAgICAgICAgIGhpbnQsXG4gICAgICAgICAgZXhwbGFpbixcbiAgICAgICAgfSlcbiAgICAgIClcbiAgICAgIC50aGVuKHJlc3VsdHMgPT4ge1xuICAgICAgICByZXN1bHRzLmZvckVhY2gocmVzdWx0ID0+IHtcbiAgICAgICAgICBpZiAoT2JqZWN0LnByb3RvdHlwZS5oYXNPd25Qcm9wZXJ0eS5jYWxsKHJlc3VsdCwgJ19pZCcpKSB7XG4gICAgICAgICAgICBpZiAoaXNQb2ludGVyRmllbGQgJiYgcmVzdWx0Ll9pZCkge1xuICAgICAgICAgICAgICByZXN1bHQuX2lkID0gcmVzdWx0Ll9pZC5zcGxpdCgnJCcpWzFdO1xuICAgICAgICAgICAgfVxuICAgICAgICAgICAgaWYgKFxuICAgICAgICAgICAgICByZXN1bHQuX2lkID09IG51bGwgfHxcbiAgICAgICAgICAgICAgcmVzdWx0Ll9pZCA9PSB1bmRlZmluZWQgfHxcbiAgICAgICAgICAgICAgKFsnb2JqZWN0JywgJ3N0cmluZyddLmluY2x1ZGVzKHR5cGVvZiByZXN1bHQuX2lkKSAmJiBfLmlzRW1wdHkocmVzdWx0Ll9pZCkpXG4gICAgICAgICAgICApIHtcbiAgICAgICAgICAgICAgcmVzdWx0Ll9pZCA9IG51bGw7XG4gICAgICAgICAgICB9XG4gICAgICAgICAgICByZXN1bHQub2JqZWN0SWQgPSByZXN1bHQuX2lkO1xuICAgICAgICAgICAgZGVsZXRlIHJlc3VsdC5faWQ7XG4gICAgICAgICAgfVxuICAgICAgICB9KTtcbiAgICAgICAgcmV0dXJuIHJlc3VsdHM7XG4gICAgICB9KVxuICAgICAgLnRoZW4ob2JqZWN0cyA9PiBvYmplY3RzLm1hcChvYmplY3QgPT4gbW9uZ29PYmplY3RUb1BhcnNlT2JqZWN0KGNsYXNzTmFtZSwgb2JqZWN0LCBzY2hlbWEpKSlcbiAgICAgIC5jYXRjaChlcnIgPT4gdGhpcy5oYW5kbGVFcnJvcihlcnIpKTtcbiAgfVxuXG4gIC8vIFRoaXMgZnVuY3Rpb24gd2lsbCByZWN1cnNpdmVseSB0cmF2ZXJzZSB0aGUgcGlwZWxpbmUgYW5kIGNvbnZlcnQgYW55IFBvaW50ZXIgb3IgRGF0ZSBjb2x1bW5zLlxuICAvLyBJZiB3ZSBkZXRlY3QgYSBwb2ludGVyIGNvbHVtbiB3ZSB3aWxsIHJlbmFtZSB0aGUgY29sdW1uIGJlaW5nIHF1ZXJpZWQgZm9yIHRvIG1hdGNoIHRoZSBjb2x1bW5cbiAgLy8gaW4gdGhlIGRhdGFiYXNlLiBXZSBhbHNvIG1vZGlmeSB0aGUgdmFsdWUgdG8gd2hhdCB3ZSBleHBlY3QgdGhlIHZhbHVlIHRvIGJlIGluIHRoZSBkYXRhYmFzZVxuICAvLyBhcyB3ZWxsLlxuICAvLyBGb3IgZGF0ZXMsIHRoZSBkcml2ZXIgZXhwZWN0cyBhIERhdGUgb2JqZWN0LCBidXQgd2UgaGF2ZSBhIHN0cmluZyBjb21pbmcgaW4uIFNvIHdlJ2xsIGNvbnZlcnRcbiAgLy8gdGhlIHN0cmluZyB0byBhIERhdGUgc28gdGhlIGRyaXZlciBjYW4gcGVyZm9ybSB0aGUgbmVjZXNzYXJ5IGNvbXBhcmlzb24uXG4gIC8vXG4gIC8vIFRoZSBnb2FsIG9mIHRoaXMgbWV0aG9kIGlzIHRvIGxvb2sgZm9yIHRoZSBcImxlYXZlc1wiIG9mIHRoZSBwaXBlbGluZSBhbmQgZGV0ZXJtaW5lIGlmIGl0IG5lZWRzXG4gIC8vIHRvIGJlIGNvbnZlcnRlZC4gVGhlIHBpcGVsaW5lIGNhbiBoYXZlIGEgZmV3IGRpZmZlcmVudCBmb3Jtcy4gRm9yIG1vcmUgZGV0YWlscywgc2VlOlxuICAvLyAgICAgaHR0cHM6Ly9kb2NzLm1vbmdvZGIuY29tL21hbnVhbC9yZWZlcmVuY2Uvb3BlcmF0b3IvYWdncmVnYXRpb24vXG4gIC8vXG4gIC8vIElmIHRoZSBwaXBlbGluZSBpcyBhbiBhcnJheSwgaXQgbWVhbnMgd2UgYXJlIHByb2JhYmx5IHBhcnNpbmcgYW4gJyRhbmQnIG9yICckb3InIG9wZXJhdG9yLiBJblxuICAvLyB0aGF0IGNhc2Ugd2UgbmVlZCB0byBsb29wIHRocm91Z2ggYWxsIG9mIGl0J3MgY2hpbGRyZW4gdG8gZmluZCB0aGUgY29sdW1ucyBiZWluZyBvcGVyYXRlZCBvbi5cbiAgLy8gSWYgdGhlIHBpcGVsaW5lIGlzIGFuIG9iamVjdCwgdGhlbiB3ZSdsbCBsb29wIHRocm91Z2ggdGhlIGtleXMgY2hlY2tpbmcgdG8gc2VlIGlmIHRoZSBrZXkgbmFtZVxuICAvLyBtYXRjaGVzIG9uZSBvZiB0aGUgc2NoZW1hIGNvbHVtbnMuIElmIGl0IGRvZXMgbWF0Y2ggYSBjb2x1bW4gYW5kIHRoZSBjb2x1bW4gaXMgYSBQb2ludGVyIG9yXG4gIC8vIGEgRGF0ZSwgdGhlbiB3ZSdsbCBjb252ZXJ0IHRoZSB2YWx1ZSBhcyBkZXNjcmliZWQgYWJvdmUuXG4gIC8vXG4gIC8vIEFzIG11Y2ggYXMgSSBoYXRlIHJlY3Vyc2lvbi4uLnRoaXMgc2VlbWVkIGxpa2UgYSBnb29kIGZpdCBmb3IgaXQuIFdlJ3JlIGVzc2VudGlhbGx5IHRyYXZlcnNpbmdcbiAgLy8gZG93biBhIHRyZWUgdG8gZmluZCBhIFwibGVhZiBub2RlXCIgYW5kIGNoZWNraW5nIHRvIHNlZSBpZiBpdCBuZWVkcyB0byBiZSBjb252ZXJ0ZWQuXG4gIF9wYXJzZUFnZ3JlZ2F0ZUFyZ3Moc2NoZW1hOiBhbnksIHBpcGVsaW5lOiBhbnkpOiBhbnkge1xuICAgIGlmIChwaXBlbGluZSA9PT0gbnVsbCkge1xuICAgICAgcmV0dXJuIG51bGw7XG4gICAgfSBlbHNlIGlmIChBcnJheS5pc0FycmF5KHBpcGVsaW5lKSkge1xuICAgICAgcmV0dXJuIHBpcGVsaW5lLm1hcCh2YWx1ZSA9PiB0aGlzLl9wYXJzZUFnZ3JlZ2F0ZUFyZ3Moc2NoZW1hLCB2YWx1ZSkpO1xuICAgIH0gZWxzZSBpZiAodHlwZW9mIHBpcGVsaW5lID09PSAnb2JqZWN0Jykge1xuICAgICAgY29uc3QgcmV0dXJuVmFsdWUgPSB7fTtcbiAgICAgIGZvciAoY29uc3QgZmllbGQgaW4gcGlwZWxpbmUpIHtcbiAgICAgICAgaWYgKHNjaGVtYS5maWVsZHNbZmllbGRdICYmIHNjaGVtYS5maWVsZHNbZmllbGRdLnR5cGUgPT09ICdQb2ludGVyJykge1xuICAgICAgICAgIGlmICh0eXBlb2YgcGlwZWxpbmVbZmllbGRdID09PSAnb2JqZWN0Jykge1xuICAgICAgICAgICAgLy8gUGFzcyBvYmplY3RzIGRvd24gdG8gTW9uZ29EQi4uLnRoaXMgaXMgbW9yZSB0aGFuIGxpa2VseSBhbiAkZXhpc3RzIG9wZXJhdG9yLlxuICAgICAgICAgICAgcmV0dXJuVmFsdWVbYF9wXyR7ZmllbGR9YF0gPSBwaXBlbGluZVtmaWVsZF07XG4gICAgICAgICAgfSBlbHNlIHtcbiAgICAgICAgICAgIHJldHVyblZhbHVlW2BfcF8ke2ZpZWxkfWBdID0gYCR7c2NoZW1hLmZpZWxkc1tmaWVsZF0udGFyZ2V0Q2xhc3N9JCR7cGlwZWxpbmVbZmllbGRdfWA7XG4gICAgICAgICAgfVxuICAgICAgICB9IGVsc2UgaWYgKHNjaGVtYS5maWVsZHNbZmllbGRdICYmIHNjaGVtYS5maWVsZHNbZmllbGRdLnR5cGUgPT09ICdEYXRlJykge1xuICAgICAgICAgIHJldHVyblZhbHVlW2ZpZWxkXSA9IHRoaXMuX2NvbnZlcnRUb0RhdGUocGlwZWxpbmVbZmllbGRdKTtcbiAgICAgICAgfSBlbHNlIHtcbiAgICAgICAgICByZXR1cm5WYWx1ZVtmaWVsZF0gPSB0aGlzLl9wYXJzZUFnZ3JlZ2F0ZUFyZ3Moc2NoZW1hLCBwaXBlbGluZVtmaWVsZF0pO1xuICAgICAgICB9XG5cbiAgICAgICAgaWYgKGZpZWxkID09PSAnb2JqZWN0SWQnKSB7XG4gICAgICAgICAgcmV0dXJuVmFsdWVbJ19pZCddID0gcmV0dXJuVmFsdWVbZmllbGRdO1xuICAgICAgICAgIGRlbGV0ZSByZXR1cm5WYWx1ZVtmaWVsZF07XG4gICAgICAgIH0gZWxzZSBpZiAoZmllbGQgPT09ICdjcmVhdGVkQXQnKSB7XG4gICAgICAgICAgcmV0dXJuVmFsdWVbJ19jcmVhdGVkX2F0J10gPSByZXR1cm5WYWx1ZVtmaWVsZF07XG4gICAgICAgICAgZGVsZXRlIHJldHVyblZhbHVlW2ZpZWxkXTtcbiAgICAgICAgfSBlbHNlIGlmIChmaWVsZCA9PT0gJ3VwZGF0ZWRBdCcpIHtcbiAgICAgICAgICByZXR1cm5WYWx1ZVsnX3VwZGF0ZWRfYXQnXSA9IHJldHVyblZhbHVlW2ZpZWxkXTtcbiAgICAgICAgICBkZWxldGUgcmV0dXJuVmFsdWVbZmllbGRdO1xuICAgICAgICB9XG4gICAgICB9XG4gICAgICByZXR1cm4gcmV0dXJuVmFsdWU7XG4gICAgfVxuICAgIHJldHVybiBwaXBlbGluZTtcbiAgfVxuXG4gIC8vIFRoaXMgZnVuY3Rpb24gaXMgc2xpZ2h0bHkgZGlmZmVyZW50IHRoYW4gdGhlIG9uZSBhYm92ZS4gUmF0aGVyIHRoYW4gdHJ5aW5nIHRvIGNvbWJpbmUgdGhlc2VcbiAgLy8gdHdvIGZ1bmN0aW9ucyBhbmQgbWFraW5nIHRoZSBjb2RlIGV2ZW4gaGFyZGVyIHRvIHVuZGVyc3RhbmQsIEkgZGVjaWRlZCB0byBzcGxpdCBpdCB1cC4gVGhlXG4gIC8vIGRpZmZlcmVuY2Ugd2l0aCB0aGlzIGZ1bmN0aW9uIGlzIHdlIGFyZSBub3QgdHJhbnNmb3JtaW5nIHRoZSB2YWx1ZXMsIG9ubHkgdGhlIGtleXMgb2YgdGhlXG4gIC8vIHBpcGVsaW5lLlxuICBfcGFyc2VBZ2dyZWdhdGVQcm9qZWN0QXJncyhzY2hlbWE6IGFueSwgcGlwZWxpbmU6IGFueSk6IGFueSB7XG4gICAgY29uc3QgcmV0dXJuVmFsdWUgPSB7fTtcbiAgICBmb3IgKGNvbnN0IGZpZWxkIGluIHBpcGVsaW5lKSB7XG4gICAgICBpZiAoc2NoZW1hLmZpZWxkc1tmaWVsZF0gJiYgc2NoZW1hLmZpZWxkc1tmaWVsZF0udHlwZSA9PT0gJ1BvaW50ZXInKSB7XG4gICAgICAgIHJldHVyblZhbHVlW2BfcF8ke2ZpZWxkfWBdID0gcGlwZWxpbmVbZmllbGRdO1xuICAgICAgfSBlbHNlIHtcbiAgICAgICAgcmV0dXJuVmFsdWVbZmllbGRdID0gdGhpcy5fcGFyc2VBZ2dyZWdhdGVBcmdzKHNjaGVtYSwgcGlwZWxpbmVbZmllbGRdKTtcbiAgICAgIH1cblxuICAgICAgaWYgKGZpZWxkID09PSAnb2JqZWN0SWQnKSB7XG4gICAgICAgIHJldHVyblZhbHVlWydfaWQnXSA9IHJldHVyblZhbHVlW2ZpZWxkXTtcbiAgICAgICAgZGVsZXRlIHJldHVyblZhbHVlW2ZpZWxkXTtcbiAgICAgIH0gZWxzZSBpZiAoZmllbGQgPT09ICdjcmVhdGVkQXQnKSB7XG4gICAgICAgIHJldHVyblZhbHVlWydfY3JlYXRlZF9hdCddID0gcmV0dXJuVmFsdWVbZmllbGRdO1xuICAgICAgICBkZWxldGUgcmV0dXJuVmFsdWVbZmllbGRdO1xuICAgICAgfSBlbHNlIGlmIChmaWVsZCA9PT0gJ3VwZGF0ZWRBdCcpIHtcbiAgICAgICAgcmV0dXJuVmFsdWVbJ191cGRhdGVkX2F0J10gPSByZXR1cm5WYWx1ZVtmaWVsZF07XG4gICAgICAgIGRlbGV0ZSByZXR1cm5WYWx1ZVtmaWVsZF07XG4gICAgICB9XG4gICAgfVxuICAgIHJldHVybiByZXR1cm5WYWx1ZTtcbiAgfVxuXG4gIC8vIFRoaXMgZnVuY3Rpb24gaXMgc2xpZ2h0bHkgZGlmZmVyZW50IHRoYW4gdGhlIHR3byBhYm92ZS4gTW9uZ29EQiAkZ3JvdXAgYWdncmVnYXRlIGxvb2tzIGxpa2U6XG4gIC8vICAgICB7ICRncm91cDogeyBfaWQ6IDxleHByZXNzaW9uPiwgPGZpZWxkMT46IHsgPGFjY3VtdWxhdG9yMT4gOiA8ZXhwcmVzc2lvbjE+IH0sIC4uLiB9IH1cbiAgLy8gVGhlIDxleHByZXNzaW9uPiBjb3VsZCBiZSBhIGNvbHVtbiBuYW1lLCBwcmVmaXhlZCB3aXRoIHRoZSAnJCcgY2hhcmFjdGVyLiBXZSdsbCBsb29rIGZvclxuICAvLyB0aGVzZSA8ZXhwcmVzc2lvbj4gYW5kIGNoZWNrIHRvIHNlZSBpZiBpdCBpcyBhICdQb2ludGVyJyBvciBpZiBpdCdzIG9uZSBvZiBjcmVhdGVkQXQsXG4gIC8vIHVwZGF0ZWRBdCBvciBvYmplY3RJZCBhbmQgY2hhbmdlIGl0IGFjY29yZGluZ2x5LlxuICBfcGFyc2VBZ2dyZWdhdGVHcm91cEFyZ3Moc2NoZW1hOiBhbnksIHBpcGVsaW5lOiBhbnkpOiBhbnkge1xuICAgIGlmIChBcnJheS5pc0FycmF5KHBpcGVsaW5lKSkge1xuICAgICAgcmV0dXJuIHBpcGVsaW5lLm1hcCh2YWx1ZSA9PiB0aGlzLl9wYXJzZUFnZ3JlZ2F0ZUdyb3VwQXJncyhzY2hlbWEsIHZhbHVlKSk7XG4gICAgfSBlbHNlIGlmICh0eXBlb2YgcGlwZWxpbmUgPT09ICdvYmplY3QnKSB7XG4gICAgICBjb25zdCByZXR1cm5WYWx1ZSA9IHt9O1xuICAgICAgZm9yIChjb25zdCBmaWVsZCBpbiBwaXBlbGluZSkge1xuICAgICAgICByZXR1cm5WYWx1ZVtmaWVsZF0gPSB0aGlzLl9wYXJzZUFnZ3JlZ2F0ZUdyb3VwQXJncyhzY2hlbWEsIHBpcGVsaW5lW2ZpZWxkXSk7XG4gICAgICB9XG4gICAgICByZXR1cm4gcmV0dXJuVmFsdWU7XG4gICAgfSBlbHNlIGlmICh0eXBlb2YgcGlwZWxpbmUgPT09ICdzdHJpbmcnKSB7XG4gICAgICBjb25zdCBmaWVsZCA9IHBpcGVsaW5lLnN1YnN0cmluZygxKTtcbiAgICAgIGlmIChzY2hlbWEuZmllbGRzW2ZpZWxkXSAmJiBzY2hlbWEuZmllbGRzW2ZpZWxkXS50eXBlID09PSAnUG9pbnRlcicpIHtcbiAgICAgICAgcmV0dXJuIGAkX3BfJHtmaWVsZH1gO1xuICAgICAgfSBlbHNlIGlmIChmaWVsZCA9PSAnY3JlYXRlZEF0Jykge1xuICAgICAgICByZXR1cm4gJyRfY3JlYXRlZF9hdCc7XG4gICAgICB9IGVsc2UgaWYgKGZpZWxkID09ICd1cGRhdGVkQXQnKSB7XG4gICAgICAgIHJldHVybiAnJF91cGRhdGVkX2F0JztcbiAgICAgIH1cbiAgICB9XG4gICAgcmV0dXJuIHBpcGVsaW5lO1xuICB9XG5cbiAgLy8gVGhpcyBmdW5jdGlvbiB3aWxsIGF0dGVtcHQgdG8gY29udmVydCB0aGUgcHJvdmlkZWQgdmFsdWUgdG8gYSBEYXRlIG9iamVjdC4gU2luY2UgdGhpcyBpcyBwYXJ0XG4gIC8vIG9mIGFuIGFnZ3JlZ2F0aW9uIHBpcGVsaW5lLCB0aGUgdmFsdWUgY2FuIGVpdGhlciBiZSBhIHN0cmluZyBvciBpdCBjYW4gYmUgYW5vdGhlciBvYmplY3Qgd2l0aFxuICAvLyBhbiBvcGVyYXRvciBpbiBpdCAobGlrZSAkZ3QsICRsdCwgZXRjKS4gQmVjYXVzZSBvZiB0aGlzIEkgZmVsdCBpdCB3YXMgZWFzaWVyIHRvIG1ha2UgdGhpcyBhXG4gIC8vIHJlY3Vyc2l2ZSBtZXRob2QgdG8gdHJhdmVyc2UgZG93biB0byB0aGUgXCJsZWFmIG5vZGVcIiB3aGljaCBpcyBnb2luZyB0byBiZSB0aGUgc3RyaW5nLlxuICBfY29udmVydFRvRGF0ZSh2YWx1ZTogYW55KTogYW55IHtcbiAgICBpZiAodHlwZW9mIHZhbHVlID09PSAnc3RyaW5nJykge1xuICAgICAgcmV0dXJuIG5ldyBEYXRlKHZhbHVlKTtcbiAgICB9XG5cbiAgICBjb25zdCByZXR1cm5WYWx1ZSA9IHt9O1xuICAgIGZvciAoY29uc3QgZmllbGQgaW4gdmFsdWUpIHtcbiAgICAgIHJldHVyblZhbHVlW2ZpZWxkXSA9IHRoaXMuX2NvbnZlcnRUb0RhdGUodmFsdWVbZmllbGRdKTtcbiAgICB9XG4gICAgcmV0dXJuIHJldHVyblZhbHVlO1xuICB9XG5cbiAgX3BhcnNlUmVhZFByZWZlcmVuY2UocmVhZFByZWZlcmVuY2U6ID9zdHJpbmcpOiA/c3RyaW5nIHtcbiAgICBpZiAocmVhZFByZWZlcmVuY2UpIHtcbiAgICAgIHJlYWRQcmVmZXJlbmNlID0gcmVhZFByZWZlcmVuY2UudG9VcHBlckNhc2UoKTtcbiAgICB9XG4gICAgc3dpdGNoIChyZWFkUHJlZmVyZW5jZSkge1xuICAgICAgY2FzZSAnUFJJTUFSWSc6XG4gICAgICAgIHJlYWRQcmVmZXJlbmNlID0gUmVhZFByZWZlcmVuY2UuUFJJTUFSWTtcbiAgICAgICAgYnJlYWs7XG4gICAgICBjYXNlICdQUklNQVJZX1BSRUZFUlJFRCc6XG4gICAgICAgIHJlYWRQcmVmZXJlbmNlID0gUmVhZFByZWZlcmVuY2UuUFJJTUFSWV9QUkVGRVJSRUQ7XG4gICAgICAgIGJyZWFrO1xuICAgICAgY2FzZSAnU0VDT05EQVJZJzpcbiAgICAgICAgcmVhZFByZWZlcmVuY2UgPSBSZWFkUHJlZmVyZW5jZS5TRUNPTkRBUlk7XG4gICAgICAgIGJyZWFrO1xuICAgICAgY2FzZSAnU0VDT05EQVJZX1BSRUZFUlJFRCc6XG4gICAgICAgIHJlYWRQcmVmZXJlbmNlID0gUmVhZFByZWZlcmVuY2UuU0VDT05EQVJZX1BSRUZFUlJFRDtcbiAgICAgICAgYnJlYWs7XG4gICAgICBjYXNlICdORUFSRVNUJzpcbiAgICAgICAgcmVhZFByZWZlcmVuY2UgPSBSZWFkUHJlZmVyZW5jZS5ORUFSRVNUO1xuICAgICAgICBicmVhaztcbiAgICAgIGNhc2UgdW5kZWZpbmVkOlxuICAgICAgY2FzZSBudWxsOlxuICAgICAgY2FzZSAnJzpcbiAgICAgICAgYnJlYWs7XG4gICAgICBkZWZhdWx0OlxuICAgICAgICB0aHJvdyBuZXcgUGFyc2UuRXJyb3IoUGFyc2UuRXJyb3IuSU5WQUxJRF9RVUVSWSwgJ05vdCBzdXBwb3J0ZWQgcmVhZCBwcmVmZXJlbmNlLicpO1xuICAgIH1cbiAgICByZXR1cm4gcmVhZFByZWZlcmVuY2U7XG4gIH1cblxuICBwZXJmb3JtSW5pdGlhbGl6YXRpb24oKTogUHJvbWlzZTx2b2lkPiB7XG4gICAgcmV0dXJuIFByb21pc2UucmVzb2x2ZSgpO1xuICB9XG5cbiAgY3JlYXRlSW5kZXgoY2xhc3NOYW1lOiBzdHJpbmcsIGluZGV4OiBhbnkpIHtcbiAgICByZXR1cm4gdGhpcy5fYWRhcHRpdmVDb2xsZWN0aW9uKGNsYXNzTmFtZSlcbiAgICAgIC50aGVuKGNvbGxlY3Rpb24gPT4gY29sbGVjdGlvbi5fbW9uZ29Db2xsZWN0aW9uLmNyZWF0ZUluZGV4KGluZGV4KSlcbiAgICAgIC5jYXRjaChlcnIgPT4gdGhpcy5oYW5kbGVFcnJvcihlcnIpKTtcbiAgfVxuXG4gIGNyZWF0ZUluZGV4ZXMoY2xhc3NOYW1lOiBzdHJpbmcsIGluZGV4ZXM6IGFueSkge1xuICAgIHJldHVybiB0aGlzLl9hZGFwdGl2ZUNvbGxlY3Rpb24oY2xhc3NOYW1lKVxuICAgICAgLnRoZW4oY29sbGVjdGlvbiA9PiBjb2xsZWN0aW9uLl9tb25nb0NvbGxlY3Rpb24uY3JlYXRlSW5kZXhlcyhpbmRleGVzKSlcbiAgICAgIC5jYXRjaChlcnIgPT4gdGhpcy5oYW5kbGVFcnJvcihlcnIpKTtcbiAgfVxuXG4gIGNyZWF0ZUluZGV4ZXNJZk5lZWRlZChjbGFzc05hbWU6IHN0cmluZywgZmllbGROYW1lOiBzdHJpbmcsIHR5cGU6IGFueSkge1xuICAgIGlmICh0eXBlICYmIHR5cGUudHlwZSA9PT0gJ1BvbHlnb24nKSB7XG4gICAgICBjb25zdCBpbmRleCA9IHtcbiAgICAgICAgW2ZpZWxkTmFtZV06ICcyZHNwaGVyZScsXG4gICAgICB9O1xuICAgICAgcmV0dXJuIHRoaXMuY3JlYXRlSW5kZXgoY2xhc3NOYW1lLCBpbmRleCk7XG4gICAgfVxuICAgIHJldHVybiBQcm9taXNlLnJlc29sdmUoKTtcbiAgfVxuXG4gIGNyZWF0ZVRleHRJbmRleGVzSWZOZWVkZWQoY2xhc3NOYW1lOiBzdHJpbmcsIHF1ZXJ5OiBRdWVyeVR5cGUsIHNjaGVtYTogYW55KTogUHJvbWlzZTx2b2lkPiB7XG4gICAgZm9yIChjb25zdCBmaWVsZE5hbWUgaW4gcXVlcnkpIHtcbiAgICAgIGlmICghcXVlcnlbZmllbGROYW1lXSB8fCAhcXVlcnlbZmllbGROYW1lXS4kdGV4dCkge1xuICAgICAgICBjb250aW51ZTtcbiAgICAgIH1cbiAgICAgIGNvbnN0IGV4aXN0aW5nSW5kZXhlcyA9IHNjaGVtYS5pbmRleGVzO1xuICAgICAgZm9yIChjb25zdCBrZXkgaW4gZXhpc3RpbmdJbmRleGVzKSB7XG4gICAgICAgIGNvbnN0IGluZGV4ID0gZXhpc3RpbmdJbmRleGVzW2tleV07XG4gICAgICAgIGlmIChPYmplY3QucHJvdG90eXBlLmhhc093blByb3BlcnR5LmNhbGwoaW5kZXgsIGZpZWxkTmFtZSkpIHtcbiAgICAgICAgICByZXR1cm4gUHJvbWlzZS5yZXNvbHZlKCk7XG4gICAgICAgIH1cbiAgICAgIH1cbiAgICAgIGNvbnN0IGluZGV4TmFtZSA9IGAke2ZpZWxkTmFtZX1fdGV4dGA7XG4gICAgICBjb25zdCB0ZXh0SW5kZXggPSB7XG4gICAgICAgIFtpbmRleE5hbWVdOiB7IFtmaWVsZE5hbWVdOiAndGV4dCcgfSxcbiAgICAgIH07XG4gICAgICByZXR1cm4gdGhpcy5zZXRJbmRleGVzV2l0aFNjaGVtYUZvcm1hdChcbiAgICAgICAgY2xhc3NOYW1lLFxuICAgICAgICB0ZXh0SW5kZXgsXG4gICAgICAgIGV4aXN0aW5nSW5kZXhlcyxcbiAgICAgICAgc2NoZW1hLmZpZWxkc1xuICAgICAgKS5jYXRjaChlcnJvciA9PiB7XG4gICAgICAgIGlmIChlcnJvci5jb2RlID09PSA4NSkge1xuICAgICAgICAgIC8vIEluZGV4IGV4aXN0IHdpdGggZGlmZmVyZW50IG9wdGlvbnNcbiAgICAgICAgICByZXR1cm4gdGhpcy5zZXRJbmRleGVzRnJvbU1vbmdvKGNsYXNzTmFtZSk7XG4gICAgICAgIH1cbiAgICAgICAgdGhyb3cgZXJyb3I7XG4gICAgICB9KTtcbiAgICB9XG4gICAgcmV0dXJuIFByb21pc2UucmVzb2x2ZSgpO1xuICB9XG5cbiAgZ2V0SW5kZXhlcyhjbGFzc05hbWU6IHN0cmluZykge1xuICAgIHJldHVybiB0aGlzLl9hZGFwdGl2ZUNvbGxlY3Rpb24oY2xhc3NOYW1lKVxuICAgICAgLnRoZW4oY29sbGVjdGlvbiA9PiBjb2xsZWN0aW9uLl9tb25nb0NvbGxlY3Rpb24uaW5kZXhlcygpKVxuICAgICAgLmNhdGNoKGVyciA9PiB0aGlzLmhhbmRsZUVycm9yKGVycikpO1xuICB9XG5cbiAgZHJvcEluZGV4KGNsYXNzTmFtZTogc3RyaW5nLCBpbmRleDogYW55KSB7XG4gICAgcmV0dXJuIHRoaXMuX2FkYXB0aXZlQ29sbGVjdGlvbihjbGFzc05hbWUpXG4gICAgICAudGhlbihjb2xsZWN0aW9uID0+IGNvbGxlY3Rpb24uX21vbmdvQ29sbGVjdGlvbi5kcm9wSW5kZXgoaW5kZXgpKVxuICAgICAgLmNhdGNoKGVyciA9PiB0aGlzLmhhbmRsZUVycm9yKGVycikpO1xuICB9XG5cbiAgZHJvcEFsbEluZGV4ZXMoY2xhc3NOYW1lOiBzdHJpbmcpIHtcbiAgICByZXR1cm4gdGhpcy5fYWRhcHRpdmVDb2xsZWN0aW9uKGNsYXNzTmFtZSlcbiAgICAgIC50aGVuKGNvbGxlY3Rpb24gPT4gY29sbGVjdGlvbi5fbW9uZ29Db2xsZWN0aW9uLmRyb3BJbmRleGVzKCkpXG4gICAgICAuY2F0Y2goZXJyID0+IHRoaXMuaGFuZGxlRXJyb3IoZXJyKSk7XG4gIH1cblxuICB1cGRhdGVTY2hlbWFXaXRoSW5kZXhlcygpOiBQcm9taXNlPGFueT4ge1xuICAgIHJldHVybiB0aGlzLmdldEFsbENsYXNzZXMoKVxuICAgICAgLnRoZW4oY2xhc3NlcyA9PiB7XG4gICAgICAgIGNvbnN0IHByb21pc2VzID0gY2xhc3Nlcy5tYXAoc2NoZW1hID0+IHtcbiAgICAgICAgICByZXR1cm4gdGhpcy5zZXRJbmRleGVzRnJvbU1vbmdvKHNjaGVtYS5jbGFzc05hbWUpO1xuICAgICAgICB9KTtcbiAgICAgICAgcmV0dXJuIFByb21pc2UuYWxsKHByb21pc2VzKTtcbiAgICAgIH0pXG4gICAgICAuY2F0Y2goZXJyID0+IHRoaXMuaGFuZGxlRXJyb3IoZXJyKSk7XG4gIH1cblxuICBjcmVhdGVUcmFuc2FjdGlvbmFsU2Vzc2lvbigpOiBQcm9taXNlPGFueT4ge1xuICAgIGNvbnN0IHRyYW5zYWN0aW9uYWxTZWN0aW9uID0gdGhpcy5jbGllbnQuc3RhcnRTZXNzaW9uKCk7XG4gICAgdHJhbnNhY3Rpb25hbFNlY3Rpb24uc3RhcnRUcmFuc2FjdGlvbigpO1xuICAgIHJldHVybiBQcm9taXNlLnJlc29sdmUodHJhbnNhY3Rpb25hbFNlY3Rpb24pO1xuICB9XG5cbiAgY29tbWl0VHJhbnNhY3Rpb25hbFNlc3Npb24odHJhbnNhY3Rpb25hbFNlY3Rpb246IGFueSk6IFByb21pc2U8dm9pZD4ge1xuICAgIHJldHVybiB0cmFuc2FjdGlvbmFsU2VjdGlvbi5jb21taXRUcmFuc2FjdGlvbigpLnRoZW4oKCkgPT4ge1xuICAgICAgdHJhbnNhY3Rpb25hbFNlY3Rpb24uZW5kU2Vzc2lvbigpO1xuICAgIH0pO1xuICB9XG5cbiAgYWJvcnRUcmFuc2FjdGlvbmFsU2Vzc2lvbih0cmFuc2FjdGlvbmFsU2VjdGlvbjogYW55KTogUHJvbWlzZTx2b2lkPiB7XG4gICAgcmV0dXJuIHRyYW5zYWN0aW9uYWxTZWN0aW9uLmFib3J0VHJhbnNhY3Rpb24oKS50aGVuKCgpID0+IHtcbiAgICAgIHRyYW5zYWN0aW9uYWxTZWN0aW9uLmVuZFNlc3Npb24oKTtcbiAgICB9KTtcbiAgfVxufVxuXG5leHBvcnQgZGVmYXVsdCBNb25nb1N0b3JhZ2VBZGFwdGVyO1xuIl19