"use strict";

Object.defineProperty(exports, "__esModule", {
  value: true
});
exports.default = void 0;

var _MongoCollection = _interopRequireDefault(require("./MongoCollection"));

var _node = _interopRequireDefault(require("parse/node"));

function _interopRequireDefault(obj) { return obj && obj.__esModule ? obj : { default: obj }; }

function _objectWithoutProperties(source, excluded) { if (source == null) return {}; var target = _objectWithoutPropertiesLoose(source, excluded); var key, i; if (Object.getOwnPropertySymbols) { var sourceSymbolKeys = Object.getOwnPropertySymbols(source); for (i = 0; i < sourceSymbolKeys.length; i++) { key = sourceSymbolKeys[i]; if (excluded.indexOf(key) >= 0) continue; if (!Object.prototype.propertyIsEnumerable.call(source, key)) continue; target[key] = source[key]; } } return target; }

function _objectWithoutPropertiesLoose(source, excluded) { if (source == null) return {}; var target = {}; var sourceKeys = Object.keys(source); var key, i; for (i = 0; i < sourceKeys.length; i++) { key = sourceKeys[i]; if (excluded.indexOf(key) >= 0) continue; target[key] = source[key]; } return target; }

function ownKeys(object, enumerableOnly) { var keys = Object.keys(object); if (Object.getOwnPropertySymbols) { var symbols = Object.getOwnPropertySymbols(object); if (enumerableOnly) symbols = symbols.filter(function (sym) { return Object.getOwnPropertyDescriptor(object, sym).enumerable; }); keys.push.apply(keys, symbols); } return keys; }

function _objectSpread(target) { for (var i = 1; i < arguments.length; i++) { var source = arguments[i] != null ? arguments[i] : {}; if (i % 2) { ownKeys(Object(source), true).forEach(function (key) { _defineProperty(target, key, source[key]); }); } else if (Object.getOwnPropertyDescriptors) { Object.defineProperties(target, Object.getOwnPropertyDescriptors(source)); } else { ownKeys(Object(source)).forEach(function (key) { Object.defineProperty(target, key, Object.getOwnPropertyDescriptor(source, key)); }); } } return target; }

function _defineProperty(obj, key, value) { if (key in obj) { Object.defineProperty(obj, key, { value: value, enumerable: true, configurable: true, writable: true }); } else { obj[key] = value; } return obj; }

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
      return {
        type: 'Number'
      };

    case 'string':
      return {
        type: 'String'
      };

    case 'boolean':
      return {
        type: 'Boolean'
      };

    case 'date':
      return {
        type: 'Date'
      };

    case 'map':
    case 'object':
      return {
        type: 'Object'
      };

    case 'array':
      return {
        type: 'Array'
      };

    case 'geopoint':
      return {
        type: 'GeoPoint'
      };

    case 'file':
      return {
        type: 'File'
      };

    case 'bytes':
      return {
        type: 'Bytes'
      };

    case 'polygon':
      return {
        type: 'Polygon'
      };
  }
}

const nonFieldSchemaKeys = ['_id', '_metadata', '_client_permissions'];

function mongoSchemaFieldsToParseSchemaFields(schema) {
  var fieldNames = Object.keys(schema).filter(key => nonFieldSchemaKeys.indexOf(key) === -1);
  var response = fieldNames.reduce((obj, fieldName) => {
    obj[fieldName] = mongoFieldToParseSchemaField(schema[fieldName]);

    if (schema._metadata && schema._metadata.fields_options && schema._metadata.fields_options[fieldName]) {
      obj[fieldName] = Object.assign({}, obj[fieldName], schema._metadata.fields_options[fieldName]);
    }

    return obj;
  }, {});
  response.ACL = {
    type: 'ACL'
  };
  response.createdAt = {
    type: 'Date'
  };
  response.updatedAt = {
    type: 'Date'
  };
  response.objectId = {
    type: 'String'
  };
  return response;
}

const emptyCLPS = Object.freeze({
  find: {},
  count: {},
  get: {},
  create: {},
  update: {},
  delete: {},
  addField: {},
  protectedFields: {}
});
const defaultCLPS = Object.freeze({
  find: {
    '*': true
  },
  count: {
    '*': true
  },
  get: {
    '*': true
  },
  create: {
    '*': true
  },
  update: {
    '*': true
  },
  delete: {
    '*': true
  },
  addField: {
    '*': true
  },
  protectedFields: {
    '*': []
  }
});

function mongoSchemaToParseSchema(mongoSchema) {
  let clps = defaultCLPS;
  let indexes = {};

  if (mongoSchema._metadata) {
    if (mongoSchema._metadata.class_permissions) {
      clps = _objectSpread(_objectSpread({}, emptyCLPS), mongoSchema._metadata.class_permissions);
    }

    if (mongoSchema._metadata.indexes) {
      indexes = _objectSpread({}, mongoSchema._metadata.indexes);
    }
  }

  return {
    className: mongoSchema._id,
    fields: mongoSchemaFieldsToParseSchemaFields(mongoSchema),
    classLevelPermissions: clps,
    indexes: indexes
  };
}

function _mongoSchemaQueryFromNameQuery(name, query) {
  const object = {
    _id: name
  };

  if (query) {
    Object.keys(query).forEach(key => {
      object[key] = query[key];
    });
  }

  return object;
} // Returns a type suitable for inserting into mongo _SCHEMA collection.
// Does no validation. That is expected to be done in Parse Server.


function parseFieldTypeToMongoFieldType({
  type,
  targetClass
}) {
  switch (type) {
    case 'Pointer':
      return `*${targetClass}`;

    case 'Relation':
      return `relation<${targetClass}>`;

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

    case 'Bytes':
      return 'bytes';

    case 'Polygon':
      return 'polygon';
  }
}

class MongoSchemaCollection {
  constructor(collection) {
    this._collection = collection;
  }

  _fetchAllSchemasFrom_SCHEMA() {
    return this._collection._rawFind({}).then(schemas => schemas.map(mongoSchemaToParseSchema));
  }

  _fetchOneSchemaFrom_SCHEMA(name) {
    return this._collection._rawFind(_mongoSchemaQueryFromNameQuery(name), {
      limit: 1
    }).then(results => {
      if (results.length === 1) {
        return mongoSchemaToParseSchema(results[0]);
      } else {
        throw undefined;
      }
    });
  } // Atomically find and delete an object based on query.


  findAndDeleteSchema(name) {
    return this._collection._mongoCollection.findOneAndDelete(_mongoSchemaQueryFromNameQuery(name));
  }

  insertSchema(schema) {
    return this._collection.insertOne(schema).then(result => mongoSchemaToParseSchema(result.ops[0])).catch(error => {
      if (error.code === 11000) {
        //Mongo's duplicate key error
        throw new _node.default.Error(_node.default.Error.DUPLICATE_VALUE, 'Class already exists.');
      } else {
        throw error;
      }
    });
  }

  updateSchema(name, update) {
    return this._collection.updateOne(_mongoSchemaQueryFromNameQuery(name), update);
  }

  upsertSchema(name, query, update) {
    return this._collection.upsertOne(_mongoSchemaQueryFromNameQuery(name, query), update);
  } // Add a field to the schema. If database does not support the field
  // type (e.g. mongo doesn't support more than one GeoPoint in a class) reject with an "Incorrect Type"
  // Parse error with a desciptive message. If the field already exists, this function must
  // not modify the schema, and must reject with DUPLICATE_VALUE error.
  // If this is called for a class that doesn't exist, this function must create that class.
  // TODO: throw an error if an unsupported field type is passed. Deciding whether a type is supported
  // should be the job of the adapter. Some adapters may not support GeoPoint at all. Others may
  // Support additional types that Mongo doesn't, like Money, or something.
  // TODO: don't spend an extra query on finding the schema if the type we are trying to add isn't a GeoPoint.


  addFieldIfNotExists(className, fieldName, fieldType) {
    return this._fetchOneSchemaFrom_SCHEMA(className).then(schema => {
      // If a field with this name already exists, it will be handled elsewhere.
      if (schema.fields[fieldName] != undefined) {
        return;
      } // The schema exists. Check for existing GeoPoints.


      if (fieldType.type === 'GeoPoint') {
        // Make sure there are not other geopoint fields
        if (Object.keys(schema.fields).some(existingField => schema.fields[existingField].type === 'GeoPoint')) {
          throw new _node.default.Error(_node.default.Error.INCORRECT_TYPE, 'MongoDB only supports one GeoPoint field in a class.');
        }
      }

      return;
    }, error => {
      // If error is undefined, the schema doesn't exist, and we can create the schema with the field.
      // If some other error, reject with it.
      if (error === undefined) {
        return;
      }

      throw error;
    }).then(() => {
      const {
        type,
        targetClass
      } = fieldType,
            fieldOptions = _objectWithoutProperties(fieldType, ["type", "targetClass"]); // We use $exists and $set to avoid overwriting the field type if it
      // already exists. (it could have added inbetween the last query and the update)


      if (fieldOptions && Object.keys(fieldOptions).length > 0) {
        return this.upsertSchema(className, {
          [fieldName]: {
            $exists: false
          }
        }, {
          $set: {
            [fieldName]: parseFieldTypeToMongoFieldType({
              type,
              targetClass
            }),
            [`_metadata.fields_options.${fieldName}`]: fieldOptions
          }
        });
      } else {
        return this.upsertSchema(className, {
          [fieldName]: {
            $exists: false
          }
        }, {
          $set: {
            [fieldName]: parseFieldTypeToMongoFieldType({
              type,
              targetClass
            })
          }
        });
      }
    });
  }

} // Exported for testing reasons and because we haven't moved all mongo schema format
// related logic into the database adapter yet.


MongoSchemaCollection._TESTmongoSchemaToParseSchema = mongoSchemaToParseSchema;
MongoSchemaCollection.parseFieldTypeToMongoFieldType = parseFieldTypeToMongoFieldType;
var _default = MongoSchemaCollection;
exports.default = _default;
//# sourceMappingURL=data:application/json;charset=utf-8;base64,eyJ2ZXJzaW9uIjozLCJzb3VyY2VzIjpbIi4uLy4uLy4uLy4uL3NyYy9BZGFwdGVycy9TdG9yYWdlL01vbmdvL01vbmdvU2NoZW1hQ29sbGVjdGlvbi5qcyJdLCJuYW1lcyI6WyJtb25nb0ZpZWxkVG9QYXJzZVNjaGVtYUZpZWxkIiwidHlwZSIsInRhcmdldENsYXNzIiwic2xpY2UiLCJzdGFydHNXaXRoIiwibGVuZ3RoIiwibm9uRmllbGRTY2hlbWFLZXlzIiwibW9uZ29TY2hlbWFGaWVsZHNUb1BhcnNlU2NoZW1hRmllbGRzIiwic2NoZW1hIiwiZmllbGROYW1lcyIsIk9iamVjdCIsImtleXMiLCJmaWx0ZXIiLCJrZXkiLCJpbmRleE9mIiwicmVzcG9uc2UiLCJyZWR1Y2UiLCJvYmoiLCJmaWVsZE5hbWUiLCJfbWV0YWRhdGEiLCJmaWVsZHNfb3B0aW9ucyIsImFzc2lnbiIsIkFDTCIsImNyZWF0ZWRBdCIsInVwZGF0ZWRBdCIsIm9iamVjdElkIiwiZW1wdHlDTFBTIiwiZnJlZXplIiwiZmluZCIsImNvdW50IiwiZ2V0IiwiY3JlYXRlIiwidXBkYXRlIiwiZGVsZXRlIiwiYWRkRmllbGQiLCJwcm90ZWN0ZWRGaWVsZHMiLCJkZWZhdWx0Q0xQUyIsIm1vbmdvU2NoZW1hVG9QYXJzZVNjaGVtYSIsIm1vbmdvU2NoZW1hIiwiY2xwcyIsImluZGV4ZXMiLCJjbGFzc19wZXJtaXNzaW9ucyIsImNsYXNzTmFtZSIsIl9pZCIsImZpZWxkcyIsImNsYXNzTGV2ZWxQZXJtaXNzaW9ucyIsIl9tb25nb1NjaGVtYVF1ZXJ5RnJvbU5hbWVRdWVyeSIsIm5hbWUiLCJxdWVyeSIsIm9iamVjdCIsImZvckVhY2giLCJwYXJzZUZpZWxkVHlwZVRvTW9uZ29GaWVsZFR5cGUiLCJNb25nb1NjaGVtYUNvbGxlY3Rpb24iLCJjb25zdHJ1Y3RvciIsImNvbGxlY3Rpb24iLCJfY29sbGVjdGlvbiIsIl9mZXRjaEFsbFNjaGVtYXNGcm9tX1NDSEVNQSIsIl9yYXdGaW5kIiwidGhlbiIsInNjaGVtYXMiLCJtYXAiLCJfZmV0Y2hPbmVTY2hlbWFGcm9tX1NDSEVNQSIsImxpbWl0IiwicmVzdWx0cyIsInVuZGVmaW5lZCIsImZpbmRBbmREZWxldGVTY2hlbWEiLCJfbW9uZ29Db2xsZWN0aW9uIiwiZmluZE9uZUFuZERlbGV0ZSIsImluc2VydFNjaGVtYSIsImluc2VydE9uZSIsInJlc3VsdCIsIm9wcyIsImNhdGNoIiwiZXJyb3IiLCJjb2RlIiwiUGFyc2UiLCJFcnJvciIsIkRVUExJQ0FURV9WQUxVRSIsInVwZGF0ZVNjaGVtYSIsInVwZGF0ZU9uZSIsInVwc2VydFNjaGVtYSIsInVwc2VydE9uZSIsImFkZEZpZWxkSWZOb3RFeGlzdHMiLCJmaWVsZFR5cGUiLCJzb21lIiwiZXhpc3RpbmdGaWVsZCIsIklOQ09SUkVDVF9UWVBFIiwiZmllbGRPcHRpb25zIiwiJGV4aXN0cyIsIiRzZXQiLCJfVEVTVG1vbmdvU2NoZW1hVG9QYXJzZVNjaGVtYSJdLCJtYXBwaW5ncyI6Ijs7Ozs7OztBQUFBOztBQUNBOzs7Ozs7Ozs7Ozs7OztBQUVBLFNBQVNBLDRCQUFULENBQXNDQyxJQUF0QyxFQUE0QztBQUMxQyxNQUFJQSxJQUFJLENBQUMsQ0FBRCxDQUFKLEtBQVksR0FBaEIsRUFBcUI7QUFDbkIsV0FBTztBQUNMQSxNQUFBQSxJQUFJLEVBQUUsU0FERDtBQUVMQyxNQUFBQSxXQUFXLEVBQUVELElBQUksQ0FBQ0UsS0FBTCxDQUFXLENBQVg7QUFGUixLQUFQO0FBSUQ7O0FBQ0QsTUFBSUYsSUFBSSxDQUFDRyxVQUFMLENBQWdCLFdBQWhCLENBQUosRUFBa0M7QUFDaEMsV0FBTztBQUNMSCxNQUFBQSxJQUFJLEVBQUUsVUFERDtBQUVMQyxNQUFBQSxXQUFXLEVBQUVELElBQUksQ0FBQ0UsS0FBTCxDQUFXLFlBQVlFLE1BQXZCLEVBQStCSixJQUFJLENBQUNJLE1BQUwsR0FBYyxDQUE3QztBQUZSLEtBQVA7QUFJRDs7QUFDRCxVQUFRSixJQUFSO0FBQ0UsU0FBSyxRQUFMO0FBQ0UsYUFBTztBQUFFQSxRQUFBQSxJQUFJLEVBQUU7QUFBUixPQUFQ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QUE4QixDQUFDO0FBQzFDbEQsY0FBQUEsSUFEMEM7QUFFMUNDLGNBQUFBO0FBRjBDLGFBQUQ7QUFEdkM7QUFEUixTQUhLLENBQVA7QUFZRDtBQUNGLEtBakVJLENBQVA7QUFrRUQ7O0FBN0l5QixDLENBZ0o1QjtBQUNBOzs7QUFDQWtELHFCQUFxQixDQUFDc0MsNkJBQXRCLEdBQXNEckQsd0JBQXREO0FBQ0FlLHFCQUFxQixDQUFDRCw4QkFBdEIsR0FBdURBLDhCQUF2RDtlQUVlQyxxQiIsInNvdXJjZXNDb250ZW50IjpbImltcG9ydCBNb25nb0NvbGxlY3Rpb24gZnJvbSAnLi9Nb25nb0NvbGxlY3Rpb24nO1xuaW1wb3J0IFBhcnNlIGZyb20gJ3BhcnNlL25vZGUnO1xuXG5mdW5jdGlvbiBtb25nb0ZpZWxkVG9QYXJzZVNjaGVtYUZpZWxkKHR5cGUpIHtcbiAgaWYgKHR5cGVbMF0gPT09ICcqJykge1xuICAgIHJldHVybiB7XG4gICAgICB0eXBlOiAnUG9pbnRlcicsXG4gICAgICB0YXJnZXRDbGFzczogdHlwZS5zbGljZSgxKSxcbiAgICB9O1xuICB9XG4gIGlmICh0eXBlLnN0YXJ0c1dpdGgoJ3JlbGF0aW9uPCcpKSB7XG4gICAgcmV0dXJuIHtcbiAgICAgIHR5cGU6ICdSZWxhdGlvbicsXG4gICAgICB0YXJnZXRDbGFzczogdHlwZS5zbGljZSgncmVsYXRpb248Jy5sZW5ndGgsIHR5cGUubGVuZ3RoIC0gMSksXG4gICAgfTtcbiAgfVxuICBzd2l0Y2ggKHR5cGUpIHtcbiAgICBjYXNlICdudW1iZXInOlxuICAgICAgcmV0dXJuIHsgdHlwZTogJ051bWJlcicgfTtcbiAgICBjYXNlICdzdHJpbmcnOlxuICAgICAgcmV0dXJuIHsgdHlwZTogJ1N0cmluZycgfTtcbiAgICBjYXNlICdib29sZWFuJzpcbiAgICAgIHJldHVybiB7IHR5cGU6ICdCb29sZWFuJyB9O1xuICAgIGNhc2UgJ2RhdGUnOlxuICAgICAgcmV0dXJuIHsgdHlwZTogJ0RhdGUnIH07XG4gICAgY2FzZSAnbWFwJzpcbiAgICBjYXNlICdvYmplY3QnOlxuICAgICAgcmV0dXJuIHsgdHlwZTogJ09iamVjdCcgfTtcbiAgICBjYXNlICdhcnJheSc6XG4gICAgICByZXR1cm4geyB0eXBlOiAnQXJyYXknIH07XG4gICAgY2FzZSAnZ2VvcG9pbnQnOlxuICAgICAgcmV0dXJuIHsgdHlwZTogJ0dlb1BvaW50JyB9O1xuICAgIGNhc2UgJ2ZpbGUnOlxuICAgICAgcmV0dXJuIHsgdHlwZTogJ0ZpbGUnIH07XG4gICAgY2FzZSAnYnl0ZXMnOlxuICAgICAgcmV0dXJuIHsgdHlwZTogJ0J5dGVzJyB9O1xuICAgIGNhc2UgJ3BvbHlnb24nOlxuICAgICAgcmV0dXJuIHsgdHlwZTogJ1BvbHlnb24nIH07XG4gIH1cbn1cblxuY29uc3Qgbm9uRmllbGRTY2hlbWFLZXlzID0gWydfaWQnLCAnX21ldGFkYXRhJywgJ19jbGllbnRfcGVybWlzc2lvbnMnXTtcbmZ1bmN0aW9uIG1vbmdvU2NoZW1hRmllbGRzVG9QYXJzZVNjaGVtYUZpZWxkcyhzY2hlbWEpIHtcbiAgdmFyIGZpZWxkTmFtZXMgPSBPYmplY3Qua2V5cyhzY2hlbWEpLmZpbHRlcihcbiAgICAoa2V5KSA9PiBub25GaWVsZFNjaGVtYUtleXMuaW5kZXhPZihrZXkpID09PSAtMVxuICApO1xuICB2YXIgcmVzcG9uc2UgPSBmaWVsZE5hbWVzLnJlZHVjZSgob2JqLCBmaWVsZE5hbWUpID0+IHtcbiAgICBvYmpbZmllbGROYW1lXSA9IG1vbmdvRmllbGRUb1BhcnNlU2NoZW1hRmllbGQoc2NoZW1hW2ZpZWxkTmFtZV0pO1xuICAgIGlmIChcbiAgICAgIHNjaGVtYS5fbWV0YWRhdGEgJiZcbiAgICAgIHNjaGVtYS5fbWV0YWRhdGEuZmllbGRzX29wdGlvbnMgJiZcbiAgICAgIHNjaGVtYS5fbWV0YWRhdGEuZmllbGRzX29wdGlvbnNbZmllbGROYW1lXVxuICAgICkge1xuICAgICAgb2JqW2ZpZWxkTmFtZV0gPSBPYmplY3QuYXNzaWduKFxuICAgICAgICB7fSxcbiAgICAgICAgb2JqW2ZpZWxkTmFtZV0sXG4gICAgICAgIHNjaGVtYS5fbWV0YWRhdGEuZmllbGRzX29wdGlvbnNbZmllbGROYW1lXVxuICAgICAgKTtcbiAgICB9XG4gICAgcmV0dXJuIG9iajtcbiAgfSwge30pO1xuICByZXNwb25zZS5BQ0wgPSB7IHR5cGU6ICdBQ0wnIH07XG4gIHJlc3BvbnNlLmNyZWF0ZWRBdCA9IHsgdHlwZTogJ0RhdGUnIH07XG4gIHJlc3BvbnNlLnVwZGF0ZWRBdCA9IHsgdHlwZTogJ0RhdGUnIH07XG4gIHJlc3BvbnNlLm9iamVjdElkID0geyB0eXBlOiAnU3RyaW5nJyB9O1xuICByZXR1cm4gcmVzcG9uc2U7XG59XG5cbmNvbnN0IGVtcHR5Q0xQUyA9IE9iamVjdC5mcmVlemUoe1xuICBmaW5kOiB7fSxcbiAgY291bnQ6IHt9LFxuICBnZXQ6IHt9LFxuICBjcmVhdGU6IHt9LFxuICB1cGRhdGU6IHt9LFxuICBkZWxldGU6IHt9LFxuICBhZGRGaWVsZDoge30sXG4gIHByb3RlY3RlZEZpZWxkczoge30sXG59KTtcblxuY29uc3QgZGVmYXVsdENMUFMgPSBPYmplY3QuZnJlZXplKHtcbiAgZmluZDogeyAnKic6IHRydWUgfSxcbiAgY291bnQ6IHsgJyonOiB0cnVlIH0sXG4gIGdldDogeyAnKic6IHRydWUgfSxcbiAgY3JlYXRlOiB7ICcqJzogdHJ1ZSB9LFxuICB1cGRhdGU6IHsgJyonOiB0cnVlIH0sXG4gIGRlbGV0ZTogeyAnKic6IHRydWUgfSxcbiAgYWRkRmllbGQ6IHsgJyonOiB0cnVlIH0sXG4gIHByb3RlY3RlZEZpZWxkczogeyAnKic6IFtdIH0sXG59KTtcblxuZnVuY3Rpb24gbW9uZ29TY2hlbWFUb1BhcnNlU2NoZW1hKG1vbmdvU2NoZW1hKSB7XG4gIGxldCBjbHBzID0gZGVmYXVsdENMUFM7XG4gIGxldCBpbmRleGVzID0ge307XG4gIGlmIChtb25nb1NjaGVtYS5fbWV0YWRhdGEpIHtcbiAgICBpZiAobW9uZ29TY2hlbWEuX21ldGFkYXRhLmNsYXNzX3Blcm1pc3Npb25zKSB7XG4gICAgICBjbHBzID0geyAuLi5lbXB0eUNMUFMsIC4uLm1vbmdvU2NoZW1hLl9tZXRhZGF0YS5jbGFzc19wZXJtaXNzaW9ucyB9O1xuICAgIH1cbiAgICBpZiAobW9uZ29TY2hlbWEuX21ldGFkYXRhLmluZGV4ZXMpIHtcbiAgICAgIGluZGV4ZXMgPSB7IC4uLm1vbmdvU2NoZW1hLl9tZXRhZGF0YS5pbmRleGVzIH07XG4gICAgfVxuICB9XG4gIHJldHVybiB7XG4gICAgY2xhc3NOYW1lOiBtb25nb1NjaGVtYS5faWQsXG4gICAgZmllbGRzOiBtb25nb1NjaGVtYUZpZWxkc1RvUGFyc2VTY2hlbWFGaWVsZHMobW9uZ29TY2hlbWEpLFxuICAgIGNsYXNzTGV2ZWxQZXJtaXNzaW9uczogY2xwcyxcbiAgICBpbmRleGVzOiBpbmRleGVzLFxuICB9O1xufVxuXG5mdW5jdGlvbiBfbW9uZ29TY2hlbWFRdWVyeUZyb21OYW1lUXVlcnkobmFtZTogc3RyaW5nLCBxdWVyeSkge1xuICBjb25zdCBvYmplY3QgPSB7IF9pZDogbmFtZSB9O1xuICBpZiAocXVlcnkpIHtcbiAgICBPYmplY3Qua2V5cyhxdWVyeSkuZm9yRWFjaCgoa2V5KSA9PiB7XG4gICAgICBvYmplY3Rba2V5XSA9IHF1ZXJ5W2tleV07XG4gICAgfSk7XG4gIH1cbiAgcmV0dXJuIG9iamVjdDtcbn1cblxuLy8gUmV0dXJucyBhIHR5cGUgc3VpdGFibGUgZm9yIGluc2VydGluZyBpbnRvIG1vbmdvIF9TQ0hFTUEgY29sbGVjdGlvbi5cbi8vIERvZXMgbm8gdmFsaWRhdGlvbi4gVGhhdCBpcyBleHBlY3RlZCB0byBiZSBkb25lIGluIFBhcnNlIFNlcnZlci5cbmZ1bmN0aW9uIHBhcnNlRmllbGRUeXBlVG9Nb25nb0ZpZWxkVHlwZSh7IHR5cGUsIHRhcmdldENsYXNzIH0pIHtcbiAgc3dpdGNoICh0eXBlKSB7XG4gICAgY2FzZSAnUG9pbnRlcic6XG4gICAgICByZXR1cm4gYCoke3RhcmdldENsYXNzfWA7XG4gICAgY2FzZSAnUmVsYXRpb24nOlxuICAgICAgcmV0dXJuIGByZWxhdGlvbjwke3RhcmdldENsYXNzfT5gO1xuICAgIGNhc2UgJ051bWJlcic6XG4gICAgICByZXR1cm4gJ251bWJlcic7XG4gICAgY2FzZSAnU3RyaW5nJzpcbiAgICAgIHJldHVybiAnc3RyaW5nJztcbiAgICBjYXNlICdCb29sZWFuJzpcbiAgICAgIHJldHVybiAnYm9vbGVhbic7XG4gICAgY2FzZSAnRGF0ZSc6XG4gICAgICByZXR1cm4gJ2RhdGUnO1xuICAgIGNhc2UgJ09iamVjdCc6XG4gICAgICByZXR1cm4gJ29iamVjdCc7XG4gICAgY2FzZSAnQXJyYXknOlxuICAgICAgcmV0dXJuICdhcnJheSc7XG4gICAgY2FzZSAnR2VvUG9pbnQnOlxuICAgICAgcmV0dXJuICdnZW9wb2ludCc7XG4gICAgY2FzZSAnRmlsZSc6XG4gICAgICByZXR1cm4gJ2ZpbGUnO1xuICAgIGNhc2UgJ0J5dGVzJzpcbiAgICAgIHJldHVybiAnYnl0ZXMnO1xuICAgIGNhc2UgJ1BvbHlnb24nOlxuICAgICAgcmV0dXJuICdwb2x5Z29uJztcbiAgfVxufVxuXG5jbGFzcyBNb25nb1NjaGVtYUNvbGxlY3Rpb24ge1xuICBfY29sbGVjdGlvbjogTW9uZ29Db2xsZWN0aW9uO1xuXG4gIGNvbnN0cnVjdG9yKGNvbGxlY3Rpb246IE1vbmdvQ29sbGVjdGlvbikge1xuICAgIHRoaXMuX2NvbGxlY3Rpb24gPSBjb2xsZWN0aW9uO1xuICB9XG5cbiAgX2ZldGNoQWxsU2NoZW1hc0Zyb21fU0NIRU1BKCkge1xuICAgIHJldHVybiB0aGlzLl9jb2xsZWN0aW9uXG4gICAgICAuX3Jhd0ZpbmQoe30pXG4gICAgICAudGhlbigoc2NoZW1hcykgPT4gc2NoZW1hcy5tYXAobW9uZ29TY2hlbWFUb1BhcnNlU2NoZW1hKSk7XG4gIH1cblxuICBfZmV0Y2hPbmVTY2hlbWFGcm9tX1NDSEVNQShuYW1lOiBzdHJpbmcpIHtcbiAgICByZXR1cm4gdGhpcy5fY29sbGVjdGlvblxuICAgICAgLl9yYXdGaW5kKF9tb25nb1NjaGVtYVF1ZXJ5RnJvbU5hbWVRdWVyeShuYW1lKSwgeyBsaW1pdDogMSB9KVxuICAgICAgLnRoZW4oKHJlc3VsdHMpID0+IHtcbiAgICAgICAgaWYgKHJlc3VsdHMubGVuZ3RoID09PSAxKSB7XG4gICAgICAgICAgcmV0dXJuIG1vbmdvU2NoZW1hVG9QYXJzZVNjaGVtYShyZXN1bHRzWzBdKTtcbiAgICAgICAgfSBlbHNlIHtcbiAgICAgICAgICB0aHJvdyB1bmRlZmluZWQ7XG4gICAgICAgIH1cbiAgICAgIH0pO1xuICB9XG5cbiAgLy8gQXRvbWljYWxseSBmaW5kIGFuZCBkZWxldGUgYW4gb2JqZWN0IGJhc2VkIG9uIHF1ZXJ5LlxuICBmaW5kQW5kRGVsZXRlU2NoZW1hKG5hbWU6IHN0cmluZykge1xuICAgIHJldHVybiB0aGlzLl9jb2xsZWN0aW9uLl9tb25nb0NvbGxlY3Rpb24uZmluZE9uZUFuZERlbGV0ZShcbiAgICAgIF9tb25nb1NjaGVtYVF1ZXJ5RnJvbU5hbWVRdWVyeShuYW1lKVxuICAgICk7XG4gIH1cblxuICBpbnNlcnRTY2hlbWEoc2NoZW1hOiBhbnkpIHtcbiAgICByZXR1cm4gdGhpcy5fY29sbGVjdGlvblxuICAgICAgLmluc2VydE9uZShzY2hlbWEpXG4gICAgICAudGhlbigocmVzdWx0KSA9PiBtb25nb1NjaGVtYVRvUGFyc2VTY2hlbWEocmVzdWx0Lm9wc1swXSkpXG4gICAgICAuY2F0Y2goKGVycm9yKSA9PiB7XG4gICAgICAgIGlmIChlcnJvci5jb2RlID09PSAxMTAwMCkge1xuICAgICAgICAgIC8vTW9uZ28ncyBkdXBsaWNhdGUga2V5IGVycm9yXG4gICAgICAgICAgdGhyb3cgbmV3IFBhcnNlLkVycm9yKFxuICAgICAgICAgICAgUGFyc2UuRXJyb3IuRFVQTElDQVRFX1ZBTFVFLFxuICAgICAgICAgICAgJ0NsYXNzIGFscmVhZHkgZXhpc3RzLidcbiAgICAgICAgICApO1xuICAgICAgICB9IGVsc2Uge1xuICAgICAgICAgIHRocm93IGVycm9yO1xuICAgICAgICB9XG4gICAgICB9KTtcbiAgfVxuXG4gIHVwZGF0ZVNjaGVtYShuYW1lOiBzdHJpbmcsIHVwZGF0ZSkge1xuICAgIHJldHVybiB0aGlzLl9jb2xsZWN0aW9uLnVwZGF0ZU9uZShcbiAgICAgIF9tb25nb1NjaGVtYVF1ZXJ5RnJvbU5hbWVRdWVyeShuYW1lKSxcbiAgICAgIHVwZGF0ZVxuICAgICk7XG4gIH1cblxuICB1cHNlcnRTY2hlbWEobmFtZTogc3RyaW5nLCBxdWVyeTogc3RyaW5nLCB1cGRhdGUpIHtcbiAgICByZXR1cm4gdGhpcy5fY29sbGVjdGlvbi51cHNlcnRPbmUoXG4gICAgICBfbW9uZ29TY2hlbWFRdWVyeUZyb21OYW1lUXVlcnkobmFtZSwgcXVlcnkpLFxuICAgICAgdXBkYXRlXG4gICAgKTtcbiAgfVxuXG4gIC8vIEFkZCBhIGZpZWxkIHRvIHRoZSBzY2hlbWEuIElmIGRhdGFiYXNlIGRvZXMgbm90IHN1cHBvcnQgdGhlIGZpZWxkXG4gIC8vIHR5cGUgKGUuZy4gbW9uZ28gZG9lc24ndCBzdXBwb3J0IG1vcmUgdGhhbiBvbmUgR2VvUG9pbnQgaW4gYSBjbGFzcykgcmVqZWN0IHdpdGggYW4gXCJJbmNvcnJlY3QgVHlwZVwiXG4gIC8vIFBhcnNlIGVycm9yIHdpdGggYSBkZXNjaXB0aXZlIG1lc3NhZ2UuIElmIHRoZSBmaWVsZCBhbHJlYWR5IGV4aXN0cywgdGhpcyBmdW5jdGlvbiBtdXN0XG4gIC8vIG5vdCBtb2RpZnkgdGhlIHNjaGVtYSwgYW5kIG11c3QgcmVqZWN0IHdpdGggRFVQTElDQVRFX1ZBTFVFIGVycm9yLlxuICAvLyBJZiB0aGlzIGlzIGNhbGxlZCBmb3IgYSBjbGFzcyB0aGF0IGRvZXNuJ3QgZXhpc3QsIHRoaXMgZnVuY3Rpb24gbXVzdCBjcmVhdGUgdGhhdCBjbGFzcy5cblxuICAvLyBUT0RPOiB0aHJvdyBhbiBlcnJvciBpZiBhbiB1bnN1cHBvcnRlZCBmaWVsZCB0eXBlIGlzIHBhc3NlZC4gRGVjaWRpbmcgd2hldGhlciBhIHR5cGUgaXMgc3VwcG9ydGVkXG4gIC8vIHNob3VsZCBiZSB0aGUgam9iIG9mIHRoZSBhZGFwdGVyLiBTb21lIGFkYXB0ZXJzIG1heSBub3Qgc3VwcG9ydCBHZW9Qb2ludCBhdCBhbGwuIE90aGVycyBtYXlcbiAgLy8gU3VwcG9ydCBhZGRpdGlvbmFsIHR5cGVzIHRoYXQgTW9uZ28gZG9lc24ndCwgbGlrZSBNb25leSwgb3Igc29tZXRoaW5nLlxuXG4gIC8vIFRPRE86IGRvbid0IHNwZW5kIGFuIGV4dHJhIHF1ZXJ5IG9uIGZpbmRpbmcgdGhlIHNjaGVtYSBpZiB0aGUgdHlwZSB3ZSBhcmUgdHJ5aW5nIHRvIGFkZCBpc24ndCBhIEdlb1BvaW50LlxuICBhZGRGaWVsZElmTm90RXhpc3RzKGNsYXNzTmFtZTogc3RyaW5nLCBmaWVsZE5hbWU6IHN0cmluZywgZmllbGRUeXBlOiBzdHJpbmcpIHtcbiAgICByZXR1cm4gdGhpcy5fZmV0Y2hPbmVTY2hlbWFGcm9tX1NDSEVNQShjbGFzc05hbWUpXG4gICAgICAudGhlbihcbiAgICAgICAgKHNjaGVtYSkgPT4ge1xuICAgICAgICAgIC8vIElmIGEgZmllbGQgd2l0aCB0aGlzIG5hbWUgYWxyZWFkeSBleGlzdHMsIGl0IHdpbGwgYmUgaGFuZGxlZCBlbHNld2hlcmUuXG4gICAgICAgICAgaWYgKHNjaGVtYS5maWVsZHNbZmllbGROYW1lXSAhPSB1bmRlZmluZWQpIHtcbiAgICAgICAgICAgIHJldHVybjtcbiAgICAgICAgICB9XG4gICAgICAgICAgLy8gVGhlIHNjaGVtYSBleGlzdHMuIENoZWNrIGZvciBleGlzdGluZyBHZW9Qb2ludHMuXG4gICAgICAgICAgaWYgKGZpZWxkVHlwZS50eXBlID09PSAnR2VvUG9pbnQnKSB7XG4gICAgICAgICAgICAvLyBNYWtlIHN1cmUgdGhlcmUgYXJlIG5vdCBvdGhlciBnZW9wb2ludCBmaWVsZHNcbiAgICAgICAgICAgIGlmIChcbiAgICAgICAgICAgICAgT2JqZWN0LmtleXMoc2NoZW1hLmZpZWxkcykuc29tZShcbiAgICAgICAgICAgICAgICAoZXhpc3RpbmdGaWVsZCkgPT5cbiAgICAgICAgICAgICAgICAgIHNjaGVtYS5maWVsZHNbZXhpc3RpbmdGaWVsZF0udHlwZSA9PT0gJ0dlb1BvaW50J1xuICAgICAgICAgICAgICApXG4gICAgICAgICAgICApIHtcbiAgICAgICAgICAgICAgdGhyb3cgbmV3IFBhcnNlLkVycm9yKFxuICAgICAgICAgICAgICAgIFBhcnNlLkVycm9yLklOQ09SUkVDVF9UWVBFLFxuICAgICAgICAgICAgICAgICdNb25nb0RCIG9ubHkgc3VwcG9ydHMgb25lIEdlb1BvaW50IGZpZWxkIGluIGEgY2xhc3MuJ1xuICAgICAgICAgICAgICApO1xuICAgICAgICAgICAgfVxuICAgICAgICAgIH1cbiAgICAgICAgICByZXR1cm47XG4gICAgICAgIH0sXG4gICAgICAgIChlcnJvcikgPT4ge1xuICAgICAgICAgIC8vIElmIGVycm9yIGlzIHVuZGVmaW5lZCwgdGhlIHNjaGVtYSBkb2Vzbid0IGV4aXN0LCBhbmQgd2UgY2FuIGNyZWF0ZSB0aGUgc2NoZW1hIHdpdGggdGhlIGZpZWxkLlxuICAgICAgICAgIC8vIElmIHNvbWUgb3RoZXIgZXJyb3IsIHJlamVjdCB3aXRoIGl0LlxuICAgICAgICAgIGlmIChlcnJvciA9PT0gdW5kZWZpbmVkKSB7XG4gICAgICAgICAgICByZXR1cm47XG4gICAgICAgICAgfVxuICAgICAgICAgIHRocm93IGVycm9yO1xuICAgICAgICB9XG4gICAgICApXG4gICAgICAudGhlbigoKSA9PiB7XG4gICAgICAgIGNvbnN0IHsgdHlwZSwgdGFyZ2V0Q2xhc3MsIC4uLmZpZWxkT3B0aW9ucyB9ID0gZmllbGRUeXBlO1xuICAgICAgICAvLyBXZSB1c2UgJGV4aXN0cyBhbmQgJHNldCB0byBhdm9pZCBvdmVyd3JpdGluZyB0aGUgZmllbGQgdHlwZSBpZiBpdFxuICAgICAgICAvLyBhbHJlYWR5IGV4aXN0cy4gKGl0IGNvdWxkIGhhdmUgYWRkZWQgaW5iZXR3ZWVuIHRoZSBsYXN0IHF1ZXJ5IGFuZCB0aGUgdXBkYXRlKVxuICAgICAgICBpZiAoZmllbGRPcHRpb25zICYmIE9iamVjdC5rZXlzKGZpZWxkT3B0aW9ucykubGVuZ3RoID4gMCkge1xuICAgICAgICAgIHJldHVybiB0aGlzLnVwc2VydFNjaGVtYShcbiAgICAgICAgICAgIGNsYXNzTmFtZSxcbiAgICAgICAgICAgIHsgW2ZpZWxkTmFtZV06IHsgJGV4aXN0czogZmFsc2UgfSB9LFxuICAgICAgICAgICAge1xuICAgICAgICAgICAgICAkc2V0OiB7XG4gICAgICAgICAgICAgICAgW2ZpZWxkTmFtZV06IHBhcnNlRmllbGRUeXBlVG9Nb25nb0ZpZWxkVHlwZSh7XG4gICAgICAgICAgICAgICAgICB0eXBlLFxuICAgICAgICAgICAgICAgICAgdGFyZ2V0Q2xhc3MsXG4gICAgICAgICAgICAgICAgfSksXG4gICAgICAgICAgICAgICAgW2BfbWV0YWRhdGEuZmllbGRzX29wdGlvbnMuJHtmaWVsZE5hbWV9YF06IGZpZWxkT3B0aW9ucyxcbiAgICAgICAgICAgICAgfSxcbiAgICAgICAgICAgIH1cbiAgICAgICAgICApO1xuICAgICAgICB9IGVsc2Uge1xuICAgICAgICAgIHJldHVybiB0aGlzLnVwc2VydFNjaGVtYShcbiAgICAgICAgICAgIGNsYXNzTmFtZSxcbiAgICAgICAgICAgIHsgW2ZpZWxkTmFtZV06IHsgJGV4aXN0czogZmFsc2UgfSB9LFxuICAgICAgICAgICAge1xuICAgICAgICAgICAgICAkc2V0OiB7XG4gICAgICAgICAgICAgICAgW2ZpZWxkTmFtZV06IHBhcnNlRmllbGRUeXBlVG9Nb25nb0ZpZWxkVHlwZSh7XG4gICAgICAgICAgICAgICAgICB0eXBlLFxuICAgICAgICAgICAgICAgICAgdGFyZ2V0Q2xhc3MsXG4gICAgICAgICAgICAgICAgfSksXG4gICAgICAgICAgICAgIH0sXG4gICAgICAgICAgICB9XG4gICAgICAgICAgKTtcbiAgICAgICAgfVxuICAgICAgfSk7XG4gIH1cbn1cblxuLy8gRXhwb3J0ZWQgZm9yIHRlc3RpbmcgcmVhc29ucyBhbmQgYmVjYXVzZSB3ZSBoYXZlbid0IG1vdmVkIGFsbCBtb25nbyBzY2hlbWEgZm9ybWF0XG4vLyByZWxhdGVkIGxvZ2ljIGludG8gdGhlIGRhdGFiYXNlIGFkYXB0ZXIgeWV0LlxuTW9uZ29TY2hlbWFDb2xsZWN0aW9uLl9URVNUbW9uZ29TY2hlbWFUb1BhcnNlU2NoZW1hID0gbW9uZ29TY2hlbWFUb1BhcnNlU2NoZW1hO1xuTW9uZ29TY2hlbWFDb2xsZWN0aW9uLnBhcnNlRmllbGRUeXBlVG9Nb25nb0ZpZWxkVHlwZSA9IHBhcnNlRmllbGRUeXBlVG9Nb25nb0ZpZWxkVHlwZTtcblxuZXhwb3J0IGRlZmF1bHQgTW9uZ29TY2hlbWFDb2xsZWN0aW9uO1xuIl19