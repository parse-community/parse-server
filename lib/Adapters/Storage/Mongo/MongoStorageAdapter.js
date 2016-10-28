'use strict';

Object.defineProperty(exports, "__esModule", {
  value: true
});
exports.MongoStorageAdapter = undefined;

var _createClass = function () { function defineProperties(target, props) { for (var i = 0; i < props.length; i++) { var descriptor = props[i]; descriptor.enumerable = descriptor.enumerable || false; descriptor.configurable = true; if ("value" in descriptor) descriptor.writable = true; Object.defineProperty(target, descriptor.key, descriptor); } } return function (Constructor, protoProps, staticProps) { if (protoProps) defineProperties(Constructor.prototype, protoProps); if (staticProps) defineProperties(Constructor, staticProps); return Constructor; }; }();

var _MongoCollection = require('./MongoCollection');

var _MongoCollection2 = _interopRequireDefault(_MongoCollection);

var _MongoSchemaCollection = require('./MongoSchemaCollection');

var _MongoSchemaCollection2 = _interopRequireDefault(_MongoSchemaCollection);

var _mongodbUrl = require('../../../vendor/mongodbUrl');

var _MongoTransform = require('./MongoTransform');

var _lodash = require('lodash');

var _lodash2 = _interopRequireDefault(_lodash);

function _interopRequireDefault(obj) { return obj && obj.__esModule ? obj : { default: obj }; }

function _classCallCheck(instance, Constructor) { if (!(instance instanceof Constructor)) { throw new TypeError("Cannot call a class as a function"); } }

function _objectWithoutProperties(obj, keys) { var target = {}; for (var i in obj) { if (keys.indexOf(i) >= 0) continue; if (!Object.prototype.hasOwnProperty.call(obj, i)) continue; target[i] = obj[i]; } return target; }

var mongodb = require('mongodb');
var MongoClient = mongodb.MongoClient;

var MongoSchemaCollectionName = '_SCHEMA';

var storageAdapterAllCollections = function storageAdapterAllCollections(mongoAdapter) {
  return mongoAdapter.connect().then(function () {
    return mongoAdapter.database.collections();
  }).then(function (collections) {
    return collections.filter(function (collection) {
      if (collection.namespace.match(/\.system\./)) {
        return false;
      }
      // TODO: If you have one app with a collection prefix that happens to be a prefix of another
      // apps prefix, this will go very very badly. We should fix that somehow.
      return collection.collectionName.indexOf(mongoAdapter._collectionPrefix) == 0;
    });
  });
};

var convertParseSchemaToMongoSchema = function convertParseSchemaToMongoSchema(_ref) {
  var schema = _objectWithoutProperties(_ref, []);

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
var mongoSchemaFromFieldsAndClassNameAndCLP = function mongoSchemaFromFieldsAndClassNameAndCLP(fields, className, classLevelPermissions) {
  var mongoObject = {
    _id: className,
    objectId: 'string',
    updatedAt: 'string',
    createdAt: 'string'
  };

  for (var fieldName in fields) {
    mongoObject[fieldName] = _MongoSchemaCollection2.default.parseFieldTypeToMongoFieldType(fields[fieldName]);
  }

  if (typeof classLevelPermissions !== 'undefined') {
    mongoObject._metadata = mongoObject._metadata || {};
    if (!classLevelPermissions) {
      delete mongoObject._metadata.class_permissions;
    } else {
      mongoObject._metadata.class_permissions = classLevelPermissions;
    }
  }

  return mongoObject;
};

var MongoStorageAdapter = exports.MongoStorageAdapter = function () {
  // Public
  function MongoStorageAdapter(_ref2) {
    var _ref2$uri = _ref2.uri;
    var uri = _ref2$uri === undefined ? defaults.DefaultMongoURI : _ref2$uri;
    var _ref2$collectionPrefi = _ref2.collectionPrefix;
    var collectionPrefix = _ref2$collectionPrefi === undefined ? '' : _ref2$collectionPrefi;
    var _ref2$mongoOptions = _ref2.mongoOptions;
    var mongoOptions = _ref2$mongoOptions === undefined ? {} : _ref2$mongoOptions;

    _classCallCheck(this, MongoStorageAdapter);

    this._uri = uri;
    this._collectionPrefix = collectionPrefix;
    this._mongoOptions = mongoOptions;
  }
  // Private


  _createClass(MongoStorageAdapter, [{
    key: 'connect',
    value: function connect() {
      var _this = this;

      if (this.connectionPromise) {
        return this.connectionPromise;
      }

      // parsing and re-formatting causes the auth value (if there) to get URI
      // encoded
      var encodedUri = (0, _mongodbUrl.format)((0, _mongodbUrl.parse)(this._uri));

      this.connectionPromise = MongoClient.connect(encodedUri, this._mongoOptions).then(function (database) {
        if (!database) {
          delete _this.connectionPromise;
          return;
        }
        database.on('error', function (error) {
          delete _this.connectionPromise;
        });
        database.on('close', function (error) {
          delete _this.connectionPromise;
        });
        _this.database = database;
      }).catch(function (err) {
        delete _this.connectionPromise;
        return Promise.reject(err);
      });

      return this.connectionPromise;
    }
  }, {
    key: '_adaptiveCollection',
    value: function _adaptiveCollection(name) {
      var _this2 = this;

      return this.connect().then(function () {
        return _this2.database.collection(_this2._collectionPrefix + name);
      }).then(function (rawCollection) {
        return new _MongoCollection2.default(rawCollection);
      });
    }
  }, {
    key: '_schemaCollection',
    value: function _schemaCollection() {
      var _this3 = this;

      return this.connect().then(function () {
        return _this3._adaptiveCollection(MongoSchemaCollectionName);
      }).then(function (collection) {
        return new _MongoSchemaCollection2.default(collection);
      });
    }
  }, {
    key: 'classExists',
    value: function classExists(name) {
      var _this4 = this;

      return this.connect().then(function () {
        return _this4.database.listCollections({ name: _this4._collectionPrefix + name }).toArray();
      }).then(function (collections) {
        return collections.length > 0;
      });
    }
  }, {
    key: 'setClassLevelPermissions',
    value: function setClassLevelPermissions(className, CLPs) {
      return this._schemaCollection().then(function (schemaCollection) {
        return schemaCollection.updateSchema(className, {
          $set: { _metadata: { class_permissions: CLPs } }
        });
      });
    }
  }, {
    key: 'createClass',
    value: function createClass(className, schema) {
      schema = convertParseSchemaToMongoSchema(schema);
      var mongoObject = mongoSchemaFromFieldsAndClassNameAndCLP(schema.fields, className, schema.classLevelPermissions);
      mongoObject._id = className;
      return this._schemaCollection().then(function (schemaCollection) {
        return schemaCollection._collection.insertOne(mongoObject);
      }).then(function (result) {
        return _MongoSchemaCollection2.default._TESTmongoSchemaToParseSchema(result.ops[0]);
      }).catch(function (error) {
        if (error.code === 11000) {
          //Mongo's duplicate key error
          throw new Parse.Error(Parse.Error.DUPLICATE_VALUE, 'Class already exists.');
        } else {
          throw error;
        }
      });
    }
  }, {
    key: 'addFieldIfNotExists',
    value: function addFieldIfNotExists(className, fieldName, type) {
      return this._schemaCollection().then(function (schemaCollection) {
        return schemaCollection.addFieldIfNotExists(className, fieldName, type);
      });
    }

    // Drops a collection. Resolves with true if it was a Parse Schema (eg. _User, Custom, etc.)
    // and resolves with false if it wasn't (eg. a join table). Rejects if deletion was impossible.

  }, {
    key: 'deleteClass',
    value: function deleteClass(className) {
      var _this5 = this;

      return this._adaptiveCollection(className).then(function (collection) {
        return collection.drop();
      }).catch(function (error) {
        // 'ns not found' means collection was already gone. Ignore deletion attempt.
        if (error.message == 'ns not found') {
          return;
        }
        throw error;
      })
      // We've dropped the collection, now remove the _SCHEMA document
      .then(function () {
        return _this5._schemaCollection();
      }).then(function (schemaCollection) {
        return schemaCollection.findAndDeleteSchema(className);
      });
    }

    // Delete all data known to this adatper. Used for testing.

  }, {
    key: 'deleteAllClasses',
    value: function deleteAllClasses() {
      return storageAdapterAllCollections(this).then(function (collections) {
        return Promise.all(collections.map(function (collection) {
          return collection.drop();
        }));
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

  }, {
    key: 'deleteFields',
    value: function deleteFields(className, schema, fieldNames) {
      var _this6 = this;

      var mongoFormatNames = fieldNames.map(function (fieldName) {
        if (schema.fields[fieldName].type === 'Pointer') {
          return '_p_' + fieldName;
        } else {
          return fieldName;
        }
      });
      var collectionUpdate = { '$unset': {} };
      mongoFormatNames.forEach(function (name) {
        collectionUpdate['$unset'][name] = null;
      });

      var schemaUpdate = { '$unset': {} };
      fieldNames.forEach(function (name) {
        schemaUpdate['$unset'][name] = null;
      });

      return this._adaptiveCollection(className).then(function (collection) {
        return collection.updateMany({}, collectionUpdate);
      }).then(function () {
        return _this6._schemaCollection();
      }).then(function (schemaCollection) {
        return schemaCollection.updateSchema(className, schemaUpdate);
      });
    }

    // Return a promise for all schemas known to this adapter, in Parse format. In case the
    // schemas cannot be retrieved, returns a promise that rejects. Requirements for the
    // rejection reason are TBD.

  }, {
    key: 'getAllClasses',
    value: function getAllClasses() {
      return this._schemaCollection().then(function (schemasCollection) {
        return schemasCollection._fetchAllSchemasFrom_SCHEMA();
      });
    }

    // Return a promise for the schema with the given name, in Parse format. If
    // this adapter doesn't know about the schema, return a promise that rejects with
    // undefined as the reason.

  }, {
    key: 'getClass',
    value: function getClass(className) {
      return this._schemaCollection().then(function (schemasCollection) {
        return schemasCollection._fechOneSchemaFrom_SCHEMA(className);
      });
    }

    // TODO: As yet not particularly well specified. Creates an object. Maybe shouldn't even need the schema,
    // and should infer from the type. Or maybe does need the schema for validations. Or maybe needs
    // the schem only for the legacy mongo format. We'll figure that out later.

  }, {
    key: 'createObject',
    value: function createObject(className, schema, object) {
      schema = convertParseSchemaToMongoSchema(schema);
      var mongoObject = (0, _MongoTransform.parseObjectToMongoObjectForCreate)(className, object, schema);
      return this._adaptiveCollection(className).then(function (collection) {
        return collection.insertOne(mongoObject);
      }).catch(function (error) {
        if (error.code === 11000) {
          // Duplicate value
          throw new Parse.Error(Parse.Error.DUPLICATE_VALUE, 'A duplicate value for a field with unique values was provided');
        }
        throw error;
      });
    }

    // Remove all objects that match the given Parse Query.
    // If no objects match, reject with OBJECT_NOT_FOUND. If objects are found and deleted, resolve with undefined.
    // If there is some other error, reject with INTERNAL_SERVER_ERROR.

  }, {
    key: 'deleteObjectsByQuery',
    value: function deleteObjectsByQuery(className, schema, query) {
      schema = convertParseSchemaToMongoSchema(schema);
      return this._adaptiveCollection(className).then(function (collection) {
        var mongoWhere = (0, _MongoTransform.transformWhere)(className, query, schema);
        return collection.deleteMany(mongoWhere);
      }).then(function (_ref3) {
        var result = _ref3.result;

        if (result.n === 0) {
          throw new Parse.Error(Parse.Error.OBJECT_NOT_FOUND, 'Object not found.');
        }
        return Promise.resolve();
      }, function (error) {
        throw new Parse.Error(Parse.Error.INTERNAL_SERVER_ERROR, 'Database adapter error');
      });
    }

    // Apply the update to all objects that match the given Parse Query.

  }, {
    key: 'updateObjectsByQuery',
    value: function updateObjectsByQuery(className, schema, query, update) {
      schema = convertParseSchemaToMongoSchema(schema);
      var mongoUpdate = (0, _MongoTransform.transformUpdate)(className, update, schema);
      var mongoWhere = (0, _MongoTransform.transformWhere)(className, query, schema);
      return this._adaptiveCollection(className).then(function (collection) {
        return collection.updateMany(mongoWhere, mongoUpdate);
      });
    }

    // Atomically finds and updates an object based on query.
    // Return value not currently well specified.

  }, {
    key: 'findOneAndUpdate',
    value: function findOneAndUpdate(className, schema, query, update) {
      schema = convertParseSchemaToMongoSchema(schema);
      var mongoUpdate = (0, _MongoTransform.transformUpdate)(className, update, schema);
      var mongoWhere = (0, _MongoTransform.transformWhere)(className, query, schema);
      return this._adaptiveCollection(className).then(function (collection) {
        return collection._mongoCollection.findAndModify(mongoWhere, [], mongoUpdate, { new: true });
      }).then(function (result) {
        return result.value;
      });
    }

    // Hopefully we can get rid of this. It's only used for config and hooks.

  }, {
    key: 'upsertOneObject',
    value: function upsertOneObject(className, schema, query, update) {
      schema = convertParseSchemaToMongoSchema(schema);
      var mongoUpdate = (0, _MongoTransform.transformUpdate)(className, update, schema);
      var mongoWhere = (0, _MongoTransform.transformWhere)(className, query, schema);
      return this._adaptiveCollection(className).then(function (collection) {
        return collection.upsertOne(mongoWhere, mongoUpdate);
      });
    }

    // Executes a find. Accepts: className, query in Parse format, and { skip, limit, sort }.

  }, {
    key: 'find',
    value: function find(className, schema, query, _ref4) {
      var skip = _ref4.skip;
      var limit = _ref4.limit;
      var sort = _ref4.sort;
      var keys = _ref4.keys;

      schema = convertParseSchemaToMongoSchema(schema);
      var mongoWhere = (0, _MongoTransform.transformWhere)(className, query, schema);
      var mongoSort = _lodash2.default.mapKeys(sort, function (value, fieldName) {
        return (0, _MongoTransform.transformKey)(className, fieldName, schema);
      });
      var mongoKeys = _lodash2.default.reduce(keys, function (memo, key) {
        memo[(0, _MongoTransform.transformKey)(className, key, schema)] = 1;
        return memo;
      }, {});
      return this._adaptiveCollection(className).then(function (collection) {
        return collection.find(mongoWhere, { skip: skip, limit: limit, sort: mongoSort, keys: mongoKeys });
      }).then(function (objects) {
        return objects.map(function (object) {
          return (0, _MongoTransform.mongoObjectToParseObject)(className, object, schema);
        });
      });
    }

    // Create a unique index. Unique indexes on nullable fields are not allowed. Since we don't
    // currently know which fields are nullable and which aren't, we ignore that criteria.
    // As such, we shouldn't expose this function to users of parse until we have an out-of-band
    // Way of determining if a field is nullable. Undefined doesn't count against uniqueness,
    // which is why we use sparse indexes.

  }, {
    key: 'ensureUniqueness',
    value: function ensureUniqueness(className, schema, fieldNames) {
      schema = convertParseSchemaToMongoSchema(schema);
      var indexCreationRequest = {};
      var mongoFieldNames = fieldNames.map(function (fieldName) {
        return (0, _MongoTransform.transformKey)(className, fieldName, schema);
      });
      mongoFieldNames.forEach(function (fieldName) {
        indexCreationRequest[fieldName] = 1;
      });
      return this._adaptiveCollection(className).then(function (collection) {
        return collection._ensureSparseUniqueIndexInBackground(indexCreationRequest);
      }).catch(function (error) {
        if (error.code === 11000) {
          throw new Parse.Error(Parse.Error.DUPLICATE_VALUE, 'Tried to ensure field uniqueness for a class that already has duplicates.');
        } else {
          throw error;
        }
      });
    }

    // Used in tests

  }, {
    key: '_rawFind',
    value: function _rawFind(className, query) {
      return this._adaptiveCollection(className).then(function (collection) {
        return collection.find(query);
      });
    }

    // Executs a count.

  }, {
    key: 'count',
    value: function count(className, schema, query) {
      schema = convertParseSchemaToMongoSchema(schema);
      return this._adaptiveCollection(className).then(function (collection) {
        return collection.count((0, _MongoTransform.transformWhere)(className, query, schema));
      });
    }
  }, {
    key: 'performInitialization',
    value: function performInitialization() {
      return Promise.resolve();
    }
  }]);

  return MongoStorageAdapter;
}();

exports.default = MongoStorageAdapter;

module.exports = MongoStorageAdapter; // Required for tests