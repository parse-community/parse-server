'use strict';

Object.defineProperty(exports, "__esModule", {
  value: true
});

var _createClass = function () { function defineProperties(target, props) { for (var i = 0; i < props.length; i++) { var descriptor = props[i]; descriptor.enumerable = descriptor.enumerable || false; descriptor.configurable = true; if ("value" in descriptor) descriptor.writable = true; Object.defineProperty(target, descriptor.key, descriptor); } } return function (Constructor, protoProps, staticProps) { if (protoProps) defineProperties(Constructor.prototype, protoProps); if (staticProps) defineProperties(Constructor, staticProps); return Constructor; }; }();

var _extends = Object.assign || function (target) { for (var i = 1; i < arguments.length; i++) { var source = arguments[i]; for (var key in source) { if (Object.prototype.hasOwnProperty.call(source, key)) { target[key] = source[key]; } } } return target; };

var _MongoCollection = require('./MongoCollection');

var _MongoCollection2 = _interopRequireDefault(_MongoCollection);

var _node = require('parse/node');

var _node2 = _interopRequireDefault(_node);

function _interopRequireDefault(obj) { return obj && obj.__esModule ? obj : { default: obj }; }

function _defineProperty(obj, key, value) { if (key in obj) { Object.defineProperty(obj, key, { value: value, enumerable: true, configurable: true, writable: true }); } else { obj[key] = value; } return obj; }

function _classCallCheck(instance, Constructor) { if (!(instance instanceof Constructor)) { throw new TypeError("Cannot call a class as a function"); } }

function mongoFieldToParseSchemaField(type) {
  if (type[0] === '*') {
    return {
      type: 'Pointer',
      targetClass: type.slice(1)
    };
  }
  if (type.startsWith('relation<')) {
    return {
      type: 'Relation',
      targetClass: type.slice('relation<'.length, type.length - 1)
    };
  }
  switch (type) {
    case 'number':
      return { type: 'Number' };
    case 'string':
      return { type: 'String' };
    case 'boolean':
      return { type: 'Boolean' };
    case 'date':
      return { type: 'Date' };
    case 'map':
    case 'object':
      return { type: 'Object' };
    case 'array':
      return { type: 'Array' };
    case 'geopoint':
      return { type: 'GeoPoint' };
    case 'file':
      return { type: 'File' };
    case 'bytes':
      return { type: 'Bytes' };
  }
}

var nonFieldSchemaKeys = ['_id', '_metadata', '_client_permissions'];
function mongoSchemaFieldsToParseSchemaFields(schema) {
  var fieldNames = Object.keys(schema).filter(function (key) {
    return nonFieldSchemaKeys.indexOf(key) === -1;
  });
  var response = fieldNames.reduce(function (obj, fieldName) {
    obj[fieldName] = mongoFieldToParseSchemaField(schema[fieldName]);
    return obj;
  }, {});
  response.ACL = { type: 'ACL' };
  response.createdAt = { type: 'Date' };
  response.updatedAt = { type: 'Date' };
  response.objectId = { type: 'String' };
  return response;
}

var emptyCLPS = Object.freeze({
  find: {},
  get: {},
  create: {},
  update: {},
  delete: {},
  addField: {}
});

var defaultCLPS = Object.freeze({
  find: { '*': true },
  get: { '*': true },
  create: { '*': true },
  update: { '*': true },
  delete: { '*': true },
  addField: { '*': true }
});

function mongoSchemaToParseSchema(mongoSchema) {
  var clps = defaultCLPS;
  if (mongoSchema._metadata && mongoSchema._metadata.class_permissions) {
    clps = _extends({}, emptyCLPS, mongoSchema._metadata.class_permissions);
  }
  return {
    className: mongoSchema._id,
    fields: mongoSchemaFieldsToParseSchemaFields(mongoSchema),
    classLevelPermissions: clps
  };
}

function _mongoSchemaQueryFromNameQuery(name, query) {
  var object = { _id: name };
  if (query) {
    Object.keys(query).forEach(function (key) {
      object[key] = query[key];
    });
  }
  return object;
}

// Returns a type suitable for inserting into mongo _SCHEMA collection.
// Does no validation. That is expected to be done in Parse Server.
function parseFieldTypeToMongoFieldType(_ref) {
  var type = _ref.type,
      targetClass = _ref.targetClass;

  switch (type) {
    case 'Pointer':
      return '*' + targetClass;
    case 'Relation':
      return 'relation<' + targetClass + '>';
    case 'Number':
      return 'number';
    case 'String':
      return 'string';
    case 'Boolean':
      return 'boolean';
    case 'Date':
      return 'date';
    case 'Object':
      return 'object';
    case 'Array':
      return 'array';
    case 'GeoPoint':
      return 'geopoint';
    case 'File':
      return 'file';
  }
}

var MongoSchemaCollection = function () {
  function MongoSchemaCollection(collection) {
    _classCallCheck(this, MongoSchemaCollection);

    this._collection = collection;
  }

  _createClass(MongoSchemaCollection, [{
    key: '_fetchAllSchemasFrom_SCHEMA',
    value: function _fetchAllSchemasFrom_SCHEMA() {
      return this._collection._rawFind({}).then(function (schemas) {
        return schemas.map(mongoSchemaToParseSchema);
      });
    }
  }, {
    key: '_fechOneSchemaFrom_SCHEMA',
    value: function _fechOneSchemaFrom_SCHEMA(name) {
      return this._collection._rawFind(_mongoSchemaQueryFromNameQuery(name), { limit: 1 }).then(function (results) {
        if (results.length === 1) {
          return mongoSchemaToParseSchema(results[0]);
        } else {
          throw undefined;
        }
      });
    }

    // Atomically find and delete an object based on query.

  }, {
    key: 'findAndDeleteSchema',
    value: function findAndDeleteSchema(name) {
      return this._collection._mongoCollection.findAndRemove(_mongoSchemaQueryFromNameQuery(name), []);
    }
  }, {
    key: 'updateSchema',
    value: function updateSchema(name, update) {
      return this._collection.updateOne(_mongoSchemaQueryFromNameQuery(name), update);
    }
  }, {
    key: 'upsertSchema',
    value: function upsertSchema(name, query, update) {
      return this._collection.upsertOne(_mongoSchemaQueryFromNameQuery(name, query), update);
    }

    // Add a field to the schema. If database does not support the field
    // type (e.g. mongo doesn't support more than one GeoPoint in a class) reject with an "Incorrect Type"
    // Parse error with a desciptive message. If the field already exists, this function must
    // not modify the schema, and must reject with DUPLICATE_VALUE error.
    // If this is called for a class that doesn't exist, this function must create that class.

    // TODO: throw an error if an unsupported field type is passed. Deciding whether a type is supported
    // should be the job of the adapter. Some adapters may not support GeoPoint at all. Others may
    // Support additional types that Mongo doesn't, like Money, or something.

    // TODO: don't spend an extra query on finding the schema if the type we are trying to add isn't a GeoPoint.

  }, {
    key: 'addFieldIfNotExists',
    value: function addFieldIfNotExists(className, fieldName, type) {
      var _this = this;

      return this._fechOneSchemaFrom_SCHEMA(className).then(function (schema) {
        // The schema exists. Check for existing GeoPoints.
        if (type.type === 'GeoPoint') {
          // Make sure there are not other geopoint fields
          if (Object.keys(schema.fields).some(function (existingField) {
            return schema.fields[existingField].type === 'GeoPoint';
          })) {
            throw new _node2.default.Error(_node2.default.Error.INCORRECT_TYPE, 'MongoDB only supports one GeoPoint field in a class.');
          }
        }
        return;
      }, function (error) {
        // If error is undefined, the schema doesn't exist, and we can create the schema with the field.
        // If some other error, reject with it.
        if (error === undefined) {
          return;
        }
        throw error;
      }).then(function () {
        // We use $exists and $set to avoid overwriting the field type if it
        // already exists. (it could have added inbetween the last query and the update)
        return _this.upsertSchema(className, _defineProperty({}, fieldName, { '$exists': false }), { '$set': _defineProperty({}, fieldName, parseFieldTypeToMongoFieldType(type)) });
      });
    }
  }]);

  return MongoSchemaCollection;
}();

// Exported for testing reasons and because we haven't moved all mongo schema format
// related logic into the database adapter yet.


MongoSchemaCollection._TESTmongoSchemaToParseSchema = mongoSchemaToParseSchema;
MongoSchemaCollection.parseFieldTypeToMongoFieldType = parseFieldTypeToMongoFieldType;

exports.default = MongoSchemaCollection;