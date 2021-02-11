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
//# sourceMappingURL=data:application/json;charset=utf-8;base64,eyJ2ZXJzaW9uIjozLCJzb3VyY2VzIjpbIi4uLy4uLy4uLy4uL3NyYy9BZGFwdGVycy9TdG9yYWdlL01vbmdvL01vbmdvU2NoZW1hQ29sbGVjdGlvbi5qcyJdLCJuYW1lcyI6WyJtb25nb0ZpZWxkVG9QYXJzZVNjaGVtYUZpZWxkIiwidHlwZSIsInRhcmdldENsYXNzIiwic2xpY2UiLCJzdGFydHNXaXRoIiwibGVuZ3RoIiwibm9uRmllbGRTY2hlbWFLZXlzIiwibW9uZ29TY2hlbWFGaWVsZHNUb1BhcnNlU2NoZW1hRmllbGRzIiwic2NoZW1hIiwiZmllbGROYW1lcyIsIk9iamVjdCIsImtleXMiLCJmaWx0ZXIiLCJrZXkiLCJpbmRleE9mIiwicmVzcG9uc2UiLCJyZWR1Y2UiLCJvYmoiLCJmaWVsZE5hbWUiLCJfbWV0YWRhdGEiLCJmaWVsZHNfb3B0aW9ucyIsImFzc2lnbiIsIkFDTCIsImNyZWF0ZWRBdCIsInVwZGF0ZWRBdCIsIm9iamVjdElkIiwiZW1wdHlDTFBTIiwiZnJlZXplIiwiZmluZCIsImNvdW50IiwiZ2V0IiwiY3JlYXRlIiwidXBkYXRlIiwiZGVsZXRlIiwiYWRkRmllbGQiLCJwcm90ZWN0ZWRGaWVsZHMiLCJkZWZhdWx0Q0xQUyIsIm1vbmdvU2NoZW1hVG9QYXJzZVNjaGVtYSIsIm1vbmdvU2NoZW1hIiwiY2xwcyIsImluZGV4ZXMiLCJjbGFzc19wZXJtaXNzaW9ucyIsImNsYXNzTmFtZSIsIl9pZCIsImZpZWxkcyIsImNsYXNzTGV2ZWxQZXJtaXNzaW9ucyIsIl9tb25nb1NjaGVtYVF1ZXJ5RnJvbU5hbWVRdWVyeSIsIm5hbWUiLCJxdWVyeSIsIm9iamVjdCIsImZvckVhY2giLCJwYXJzZUZpZWxkVHlwZVRvTW9uZ29GaWVsZFR5cGUiLCJNb25nb1NjaGVtYUNvbGxlY3Rpb24iLCJjb25zdHJ1Y3RvciIsImNvbGxlY3Rpb24iLCJfY29sbGVjdGlvbiIsIl9mZXRjaEFsbFNjaGVtYXNGcm9tX1NDSEVNQSIsIl9yYXdGaW5kIiwidGhlbiIsInNjaGVtYXMiLCJtYXAiLCJfZmV0Y2hPbmVTY2hlbWFGcm9tX1NDSEVNQSIsImxpbWl0IiwicmVzdWx0cyIsInVuZGVmaW5lZCIsImZpbmRBbmREZWxldGVTY2hlbWEiLCJfbW9uZ29Db2xsZWN0aW9uIiwiZmluZE9uZUFuZERlbGV0ZSIsImluc2VydFNjaGVtYSIsImluc2VydE9uZSIsInJlc3VsdCIsIm9wcyIsImNhdGNoIiwiZXJyb3IiLCJjb2RlIiwiUGFyc2UiLCJFcnJvciIsIkRVUExJQ0FURV9WQUxVRSIsInVwZGF0ZVNjaGVtYSIsInVwZGF0ZU9uZSIsInVwc2VydFNjaGVtYSIsInVwc2VydE9uZSIsImFkZEZpZWxkSWZOb3RFeGlzdHMiLCJmaWVsZFR5cGUiLCJzb21lIiwiZXhpc3RpbmdGaWVsZCIsIklOQ09SUkVDVF9UWVBFIiwiZmllbGRPcHRpb25zIiwiJGV4aXN0cyIsIiRzZXQiLCJfVEVTVG1vbmdvU2NoZW1hVG9QYXJzZVNjaGVtYSJdLCJtYXBwaW5ncyI6Ijs7Ozs7OztBQUFBOztBQUNBOzs7Ozs7Ozs7Ozs7OztBQUVBLFNBQVNBLDRCQUFULENBQXNDQyxJQUF0QyxFQUE0QztBQUMxQyxNQUFJQSxJQUFJLENBQUMsQ0FBRCxDQUFKLEtBQVksR0FBaEIsRUFBcUI7QUFDbkIsV0FBTztBQUNMQSxNQUFBQSxJQUFJLEVBQUUsU0FERDtBQUVMQyxNQUFBQSxXQUFXLEVBQUVELElBQUksQ0FBQ0UsS0FBTCxDQUFXLENBQVg7QUFGUixLQUFQO0FBSUQ7O0FBQ0QsTUFBSUYsSUFBSSxDQUFDRyxVQUFMLENBQWdCLFdBQWhCLENBQUosRUFBa0M7QUFDaEMsV0FBTztBQUNMSCxNQUFBQSxJQUFJLEVBQUUsVUFERDtBQUVMQyxNQUFBQSxXQUFXLEVBQUVELElBQUksQ0FBQ0UsS0FBTCxDQUFXLFlBQVlFLE1BQXZCLEVBQStCSixJQUFJLENBQUNJLE1BQUwsR0FBYyxDQUE3QztBQUZSLEtBQVA7QUFJRDs7QUFDRCxVQUFRSixJQUFSO0FBQ0UsU0FBSyxRQUFMO0FBQ0UsYUFBTztBQUFFQSxRQUFBQSxJQUFJLEVBQUU7QUFBUixPQUFQ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Q3ZFLFNBQUQsR0FBYWlDLDhCQUE4QixDQUFDO0FBQzFDbEQsY0FBQUEsSUFEMEM7QUFFMUNDLGNBQUFBO0FBRjBDLGFBQUQ7QUFEdkM7QUFEUixTQUhLLENBQVA7QUFZRDtBQUNGLEtBaEVJLENBQVA7QUFpRUQ7O0FBL0h5QixDLENBa0k1QjtBQUNBOzs7QUFDQWtELHFCQUFxQixDQUFDc0MsNkJBQXRCLEdBQXNEckQsd0JBQXREO0FBQ0FlLHFCQUFxQixDQUFDRCw4QkFBdEIsR0FBdURBLDhCQUF2RDtlQUVlQyxxQiIsInNvdXJjZXNDb250ZW50IjpbImltcG9ydCBNb25nb0NvbGxlY3Rpb24gZnJvbSAnLi9Nb25nb0NvbGxlY3Rpb24nO1xuaW1wb3J0IFBhcnNlIGZyb20gJ3BhcnNlL25vZGUnO1xuXG5mdW5jdGlvbiBtb25nb0ZpZWxkVG9QYXJzZVNjaGVtYUZpZWxkKHR5cGUpIHtcbiAgaWYgKHR5cGVbMF0gPT09ICcqJykge1xuICAgIHJldHVybiB7XG4gICAgICB0eXBlOiAnUG9pbnRlcicsXG4gICAgICB0YXJnZXRDbGFzczogdHlwZS5zbGljZSgxKSxcbiAgICB9O1xuICB9XG4gIGlmICh0eXBlLnN0YXJ0c1dpdGgoJ3JlbGF0aW9uPCcpKSB7XG4gICAgcmV0dXJuIHtcbiAgICAgIHR5cGU6ICdSZWxhdGlvbicsXG4gICAgICB0YXJnZXRDbGFzczogdHlwZS5zbGljZSgncmVsYXRpb248Jy5sZW5ndGgsIHR5cGUubGVuZ3RoIC0gMSksXG4gICAgfTtcbiAgfVxuICBzd2l0Y2ggKHR5cGUpIHtcbiAgICBjYXNlICdudW1iZXInOlxuICAgICAgcmV0dXJuIHsgdHlwZTogJ051bWJlcicgfTtcbiAgICBjYXNlICdzdHJpbmcnOlxuICAgICAgcmV0dXJuIHsgdHlwZTogJ1N0cmluZycgfTtcbiAgICBjYXNlICdib29sZWFuJzpcbiAgICAgIHJldHVybiB7IHR5cGU6ICdCb29sZWFuJyB9O1xuICAgIGNhc2UgJ2RhdGUnOlxuICAgICAgcmV0dXJuIHsgdHlwZTogJ0RhdGUnIH07XG4gICAgY2FzZSAnbWFwJzpcbiAgICBjYXNlICdvYmplY3QnOlxuICAgICAgcmV0dXJuIHsgdHlwZTogJ09iamVjdCcgfTtcbiAgICBjYXNlICdhcnJheSc6XG4gICAgICByZXR1cm4geyB0eXBlOiAnQXJyYXknIH07XG4gICAgY2FzZSAnZ2VvcG9pbnQnOlxuICAgICAgcmV0dXJuIHsgdHlwZTogJ0dlb1BvaW50JyB9O1xuICAgIGNhc2UgJ2ZpbGUnOlxuICAgICAgcmV0dXJuIHsgdHlwZTogJ0ZpbGUnIH07XG4gICAgY2FzZSAnYnl0ZXMnOlxuICAgICAgcmV0dXJuIHsgdHlwZTogJ0J5dGVzJyB9O1xuICAgIGNhc2UgJ3BvbHlnb24nOlxuICAgICAgcmV0dXJuIHsgdHlwZTogJ1BvbHlnb24nIH07XG4gIH1cbn1cblxuY29uc3Qgbm9uRmllbGRTY2hlbWFLZXlzID0gWydfaWQnLCAnX21ldGFkYXRhJywgJ19jbGllbnRfcGVybWlzc2lvbnMnXTtcbmZ1bmN0aW9uIG1vbmdvU2NoZW1hRmllbGRzVG9QYXJzZVNjaGVtYUZpZWxkcyhzY2hlbWEpIHtcbiAgdmFyIGZpZWxkTmFtZXMgPSBPYmplY3Qua2V5cyhzY2hlbWEpLmZpbHRlcihrZXkgPT4gbm9uRmllbGRTY2hlbWFLZXlzLmluZGV4T2Yoa2V5KSA9PT0gLTEpO1xuICB2YXIgcmVzcG9uc2UgPSBmaWVsZE5hbWVzLnJlZHVjZSgob2JqLCBmaWVsZE5hbWUpID0+IHtcbiAgICBvYmpbZmllbGROYW1lXSA9IG1vbmdvRmllbGRUb1BhcnNlU2NoZW1hRmllbGQoc2NoZW1hW2ZpZWxkTmFtZV0pO1xuICAgIGlmIChcbiAgICAgIHNjaGVtYS5fbWV0YWRhdGEgJiZcbiAgICAgIHNjaGVtYS5fbWV0YWRhdGEuZmllbGRzX29wdGlvbnMgJiZcbiAgICAgIHNjaGVtYS5fbWV0YWRhdGEuZmllbGRzX29wdGlvbnNbZmllbGROYW1lXVxuICAgICkge1xuICAgICAgb2JqW2ZpZWxkTmFtZV0gPSBPYmplY3QuYXNzaWduKFxuICAgICAgICB7fSxcbiAgICAgICAgb2JqW2ZpZWxkTmFtZV0sXG4gICAgICAgIHNjaGVtYS5fbWV0YWRhdGEuZmllbGRzX29wdGlvbnNbZmllbGROYW1lXVxuICAgICAgKTtcbiAgICB9XG4gICAgcmV0dXJuIG9iajtcbiAgfSwge30pO1xuICByZXNwb25zZS5BQ0wgPSB7IHR5cGU6ICdBQ0wnIH07XG4gIHJlc3BvbnNlLmNyZWF0ZWRBdCA9IHsgdHlwZTogJ0RhdGUnIH07XG4gIHJlc3BvbnNlLnVwZGF0ZWRBdCA9IHsgdHlwZTogJ0RhdGUnIH07XG4gIHJlc3BvbnNlLm9iamVjdElkID0geyB0eXBlOiAnU3RyaW5nJyB9O1xuICByZXR1cm4gcmVzcG9uc2U7XG59XG5cbmNvbnN0IGVtcHR5Q0xQUyA9IE9iamVjdC5mcmVlemUoe1xuICBmaW5kOiB7fSxcbiAgY291bnQ6IHt9LFxuICBnZXQ6IHt9LFxuICBjcmVhdGU6IHt9LFxuICB1cGRhdGU6IHt9LFxuICBkZWxldGU6IHt9LFxuICBhZGRGaWVsZDoge30sXG4gIHByb3RlY3RlZEZpZWxkczoge30sXG59KTtcblxuY29uc3QgZGVmYXVsdENMUFMgPSBPYmplY3QuZnJlZXplKHtcbiAgZmluZDogeyAnKic6IHRydWUgfSxcbiAgY291bnQ6IHsgJyonOiB0cnVlIH0sXG4gIGdldDogeyAnKic6IHRydWUgfSxcbiAgY3JlYXRlOiB7ICcqJzogdHJ1ZSB9LFxuICB1cGRhdGU6IHsgJyonOiB0cnVlIH0sXG4gIGRlbGV0ZTogeyAnKic6IHRydWUgfSxcbiAgYWRkRmllbGQ6IHsgJyonOiB0cnVlIH0sXG4gIHByb3RlY3RlZEZpZWxkczogeyAnKic6IFtdIH0sXG59KTtcblxuZnVuY3Rpb24gbW9uZ29TY2hlbWFUb1BhcnNlU2NoZW1hKG1vbmdvU2NoZW1hKSB7XG4gIGxldCBjbHBzID0gZGVmYXVsdENMUFM7XG4gIGxldCBpbmRleGVzID0ge307XG4gIGlmIChtb25nb1NjaGVtYS5fbWV0YWRhdGEpIHtcbiAgICBpZiAobW9uZ29TY2hlbWEuX21ldGFkYXRhLmNsYXNzX3Blcm1pc3Npb25zKSB7XG4gICAgICBjbHBzID0geyAuLi5lbXB0eUNMUFMsIC4uLm1vbmdvU2NoZW1hLl9tZXRhZGF0YS5jbGFzc19wZXJtaXNzaW9ucyB9O1xuICAgIH1cbiAgICBpZiAobW9uZ29TY2hlbWEuX21ldGFkYXRhLmluZGV4ZXMpIHtcbiAgICAgIGluZGV4ZXMgPSB7IC4uLm1vbmdvU2NoZW1hLl9tZXRhZGF0YS5pbmRleGVzIH07XG4gICAgfVxuICB9XG4gIHJldHVybiB7XG4gICAgY2xhc3NOYW1lOiBtb25nb1NjaGVtYS5faWQsXG4gICAgZmllbGRzOiBtb25nb1NjaGVtYUZpZWxkc1RvUGFyc2VTY2hlbWFGaWVsZHMobW9uZ29TY2hlbWEpLFxuICAgIGNsYXNzTGV2ZWxQZXJtaXNzaW9uczogY2xwcyxcbiAgICBpbmRleGVzOiBpbmRleGVzLFxuICB9O1xufVxuXG5mdW5jdGlvbiBfbW9uZ29TY2hlbWFRdWVyeUZyb21OYW1lUXVlcnkobmFtZTogc3RyaW5nLCBxdWVyeSkge1xuICBjb25zdCBvYmplY3QgPSB7IF9pZDogbmFtZSB9O1xuICBpZiAocXVlcnkpIHtcbiAgICBPYmplY3Qua2V5cyhxdWVyeSkuZm9yRWFjaChrZXkgPT4ge1xuICAgICAgb2JqZWN0W2tleV0gPSBxdWVyeVtrZXldO1xuICAgIH0pO1xuICB9XG4gIHJldHVybiBvYmplY3Q7XG59XG5cbi8vIFJldHVybnMgYSB0eXBlIHN1aXRhYmxlIGZvciBpbnNlcnRpbmcgaW50byBtb25nbyBfU0NIRU1BIGNvbGxlY3Rpb24uXG4vLyBEb2VzIG5vIHZhbGlkYXRpb24uIFRoYXQgaXMgZXhwZWN0ZWQgdG8gYmUgZG9uZSBpbiBQYXJzZSBTZXJ2ZXIuXG5mdW5jdGlvbiBwYXJzZUZpZWxkVHlwZVRvTW9uZ29GaWVsZFR5cGUoeyB0eXBlLCB0YXJnZXRDbGFzcyB9KSB7XG4gIHN3aXRjaCAodHlwZSkge1xuICAgIGNhc2UgJ1BvaW50ZXInOlxuICAgICAgcmV0dXJuIGAqJHt0YXJnZXRDbGFzc31gO1xuICAgIGNhc2UgJ1JlbGF0aW9uJzpcbiAgICAgIHJldHVybiBgcmVsYXRpb248JHt0YXJnZXRDbGFzc30+YDtcbiAgICBjYXNlICdOdW1iZXInOlxuICAgICAgcmV0dXJuICdudW1iZXInO1xuICAgIGNhc2UgJ1N0cmluZyc6XG4gICAgICByZXR1cm4gJ3N0cmluZyc7XG4gICAgY2FzZSAnQm9vbGVhbic6XG4gICAgICByZXR1cm4gJ2Jvb2xlYW4nO1xuICAgIGNhc2UgJ0RhdGUnOlxuICAgICAgcmV0dXJuICdkYXRlJztcbiAgICBjYXNlICdPYmplY3QnOlxuICAgICAgcmV0dXJuICdvYmplY3QnO1xuICAgIGNhc2UgJ0FycmF5JzpcbiAgICAgIHJldHVybiAnYXJyYXknO1xuICAgIGNhc2UgJ0dlb1BvaW50JzpcbiAgICAgIHJldHVybiAnZ2VvcG9pbnQnO1xuICAgIGNhc2UgJ0ZpbGUnOlxuICAgICAgcmV0dXJuICdmaWxlJztcbiAgICBjYXNlICdCeXRlcyc6XG4gICAgICByZXR1cm4gJ2J5dGVzJztcbiAgICBjYXNlICdQb2x5Z29uJzpcbiAgICAgIHJldHVybiAncG9seWdvbic7XG4gIH1cbn1cblxuY2xhc3MgTW9uZ29TY2hlbWFDb2xsZWN0aW9uIHtcbiAgX2NvbGxlY3Rpb246IE1vbmdvQ29sbGVjdGlvbjtcblxuICBjb25zdHJ1Y3Rvcihjb2xsZWN0aW9uOiBNb25nb0NvbGxlY3Rpb24pIHtcbiAgICB0aGlzLl9jb2xsZWN0aW9uID0gY29sbGVjdGlvbjtcbiAgfVxuXG4gIF9mZXRjaEFsbFNjaGVtYXNGcm9tX1NDSEVNQSgpIHtcbiAgICByZXR1cm4gdGhpcy5fY29sbGVjdGlvbi5fcmF3RmluZCh7fSkudGhlbihzY2hlbWFzID0+IHNjaGVtYXMubWFwKG1vbmdvU2NoZW1hVG9QYXJzZVNjaGVtYSkpO1xuICB9XG5cbiAgX2ZldGNoT25lU2NoZW1hRnJvbV9TQ0hFTUEobmFtZTogc3RyaW5nKSB7XG4gICAgcmV0dXJuIHRoaXMuX2NvbGxlY3Rpb25cbiAgICAgIC5fcmF3RmluZChfbW9uZ29TY2hlbWFRdWVyeUZyb21OYW1lUXVlcnkobmFtZSksIHsgbGltaXQ6IDEgfSlcbiAgICAgIC50aGVuKHJlc3VsdHMgPT4ge1xuICAgICAgICBpZiAocmVzdWx0cy5sZW5ndGggPT09IDEpIHtcbiAgICAgICAgICByZXR1cm4gbW9uZ29TY2hlbWFUb1BhcnNlU2NoZW1hKHJlc3VsdHNbMF0pO1xuICAgICAgICB9IGVsc2Uge1xuICAgICAgICAgIHRocm93IHVuZGVmaW5lZDtcbiAgICAgICAgfVxuICAgICAgfSk7XG4gIH1cblxuICAvLyBBdG9taWNhbGx5IGZpbmQgYW5kIGRlbGV0ZSBhbiBvYmplY3QgYmFzZWQgb24gcXVlcnkuXG4gIGZpbmRBbmREZWxldGVTY2hlbWEobmFtZTogc3RyaW5nKSB7XG4gICAgcmV0dXJuIHRoaXMuX2NvbGxlY3Rpb24uX21vbmdvQ29sbGVjdGlvbi5maW5kT25lQW5kRGVsZXRlKF9tb25nb1NjaGVtYVF1ZXJ5RnJvbU5hbWVRdWVyeShuYW1lKSk7XG4gIH1cblxuICBpbnNlcnRTY2hlbWEoc2NoZW1hOiBhbnkpIHtcbiAgICByZXR1cm4gdGhpcy5fY29sbGVjdGlvblxuICAgICAgLmluc2VydE9uZShzY2hlbWEpXG4gICAgICAudGhlbihyZXN1bHQgPT4gbW9uZ29TY2hlbWFUb1BhcnNlU2NoZW1hKHJlc3VsdC5vcHNbMF0pKVxuICAgICAgLmNhdGNoKGVycm9yID0+IHtcbiAgICAgICAgaWYgKGVycm9yLmNvZGUgPT09IDExMDAwKSB7XG4gICAgICAgICAgLy9Nb25nbydzIGR1cGxpY2F0ZSBrZXkgZXJyb3JcbiAgICAgICAgICB0aHJvdyBuZXcgUGFyc2UuRXJyb3IoUGFyc2UuRXJyb3IuRFVQTElDQVRFX1ZBTFVFLCAnQ2xhc3MgYWxyZWFkeSBleGlzdHMuJyk7XG4gICAgICAgIH0gZWxzZSB7XG4gICAgICAgICAgdGhyb3cgZXJyb3I7XG4gICAgICAgIH1cbiAgICAgIH0pO1xuICB9XG5cbiAgdXBkYXRlU2NoZW1hKG5hbWU6IHN0cmluZywgdXBkYXRlKSB7XG4gICAgcmV0dXJuIHRoaXMuX2NvbGxlY3Rpb24udXBkYXRlT25lKF9tb25nb1NjaGVtYVF1ZXJ5RnJvbU5hbWVRdWVyeShuYW1lKSwgdXBkYXRlKTtcbiAgfVxuXG4gIHVwc2VydFNjaGVtYShuYW1lOiBzdHJpbmcsIHF1ZXJ5OiBzdHJpbmcsIHVwZGF0ZSkge1xuICAgIHJldHVybiB0aGlzLl9jb2xsZWN0aW9uLnVwc2VydE9uZShfbW9uZ29TY2hlbWFRdWVyeUZyb21OYW1lUXVlcnkobmFtZSwgcXVlcnkpLCB1cGRhdGUpO1xuICB9XG5cbiAgLy8gQWRkIGEgZmllbGQgdG8gdGhlIHNjaGVtYS4gSWYgZGF0YWJhc2UgZG9lcyBub3Qgc3VwcG9ydCB0aGUgZmllbGRcbiAgLy8gdHlwZSAoZS5nLiBtb25nbyBkb2Vzbid0IHN1cHBvcnQgbW9yZSB0aGFuIG9uZSBHZW9Qb2ludCBpbiBhIGNsYXNzKSByZWplY3Qgd2l0aCBhbiBcIkluY29ycmVjdCBUeXBlXCJcbiAgLy8gUGFyc2UgZXJyb3Igd2l0aCBhIGRlc2NpcHRpdmUgbWVzc2FnZS4gSWYgdGhlIGZpZWxkIGFscmVhZHkgZXhpc3RzLCB0aGlzIGZ1bmN0aW9uIG11c3RcbiAgLy8gbm90IG1vZGlmeSB0aGUgc2NoZW1hLCBhbmQgbXVzdCByZWplY3Qgd2l0aCBEVVBMSUNBVEVfVkFMVUUgZXJyb3IuXG4gIC8vIElmIHRoaXMgaXMgY2FsbGVkIGZvciBhIGNsYXNzIHRoYXQgZG9lc24ndCBleGlzdCwgdGhpcyBmdW5jdGlvbiBtdXN0IGNyZWF0ZSB0aGF0IGNsYXNzLlxuXG4gIC8vIFRPRE86IHRocm93IGFuIGVycm9yIGlmIGFuIHVuc3VwcG9ydGVkIGZpZWxkIHR5cGUgaXMgcGFzc2VkLiBEZWNpZGluZyB3aGV0aGVyIGEgdHlwZSBpcyBzdXBwb3J0ZWRcbiAgLy8gc2hvdWxkIGJlIHRoZSBqb2Igb2YgdGhlIGFkYXB0ZXIuIFNvbWUgYWRhcHRlcnMgbWF5IG5vdCBzdXBwb3J0IEdlb1BvaW50IGF0IGFsbC4gT3RoZXJzIG1heVxuICAvLyBTdXBwb3J0IGFkZGl0aW9uYWwgdHlwZXMgdGhhdCBNb25nbyBkb2Vzbid0LCBsaWtlIE1vbmV5LCBvciBzb21ldGhpbmcuXG5cbiAgLy8gVE9ETzogZG9uJ3Qgc3BlbmQgYW4gZXh0cmEgcXVlcnkgb24gZmluZGluZyB0aGUgc2NoZW1hIGlmIHRoZSB0eXBlIHdlIGFyZSB0cnlpbmcgdG8gYWRkIGlzbid0IGEgR2VvUG9pbnQuXG4gIGFkZEZpZWxkSWZOb3RFeGlzdHMoY2xhc3NOYW1lOiBzdHJpbmcsIGZpZWxkTmFtZTogc3RyaW5nLCBmaWVsZFR5cGU6IHN0cmluZykge1xuICAgIHJldHVybiB0aGlzLl9mZXRjaE9uZVNjaGVtYUZyb21fU0NIRU1BKGNsYXNzTmFtZSlcbiAgICAgIC50aGVuKFxuICAgICAgICBzY2hlbWEgPT4ge1xuICAgICAgICAgIC8vIElmIGEgZmllbGQgd2l0aCB0aGlzIG5hbWUgYWxyZWFkeSBleGlzdHMsIGl0IHdpbGwgYmUgaGFuZGxlZCBlbHNld2hlcmUuXG4gICAgICAgICAgaWYgKHNjaGVtYS5maWVsZHNbZmllbGROYW1lXSAhPSB1bmRlZmluZWQpIHtcbiAgICAgICAgICAgIHJldHVybjtcbiAgICAgICAgICB9XG4gICAgICAgICAgLy8gVGhlIHNjaGVtYSBleGlzdHMuIENoZWNrIGZvciBleGlzdGluZyBHZW9Qb2ludHMuXG4gICAgICAgICAgaWYgKGZpZWxkVHlwZS50eXBlID09PSAnR2VvUG9pbnQnKSB7XG4gICAgICAgICAgICAvLyBNYWtlIHN1cmUgdGhlcmUgYXJlIG5vdCBvdGhlciBnZW9wb2ludCBmaWVsZHNcbiAgICAgICAgICAgIGlmIChcbiAgICAgICAgICAgICAgT2JqZWN0LmtleXMoc2NoZW1hLmZpZWxkcykuc29tZShcbiAgICAgICAgICAgICAgICBleGlzdGluZ0ZpZWxkID0+IHNjaGVtYS5maWVsZHNbZXhpc3RpbmdGaWVsZF0udHlwZSA9PT0gJ0dlb1BvaW50J1xuICAgICAgICAgICAgICApXG4gICAgICAgICAgICApIHtcbiAgICAgICAgICAgICAgdGhyb3cgbmV3IFBhcnNlLkVycm9yKFxuICAgICAgICAgICAgICAgIFBhcnNlLkVycm9yLklOQ09SUkVDVF9UWVBFLFxuICAgICAgICAgICAgICAgICdNb25nb0RCIG9ubHkgc3VwcG9ydHMgb25lIEdlb1BvaW50IGZpZWxkIGluIGEgY2xhc3MuJ1xuICAgICAgICAgICAgICApO1xuICAgICAgICAgICAgfVxuICAgICAgICAgIH1cbiAgICAgICAgICByZXR1cm47XG4gICAgICAgIH0sXG4gICAgICAgIGVycm9yID0+IHtcbiAgICAgICAgICAvLyBJZiBlcnJvciBpcyB1bmRlZmluZWQsIHRoZSBzY2hlbWEgZG9lc24ndCBleGlzdCwgYW5kIHdlIGNhbiBjcmVhdGUgdGhlIHNjaGVtYSB3aXRoIHRoZSBmaWVsZC5cbiAgICAgICAgICAvLyBJZiBzb21lIG90aGVyIGVycm9yLCByZWplY3Qgd2l0aCBpdC5cbiAgICAgICAgICBpZiAoZXJyb3IgPT09IHVuZGVmaW5lZCkge1xuICAgICAgICAgICAgcmV0dXJuO1xuICAgICAgICAgIH1cbiAgICAgICAgICB0aHJvdyBlcnJvcjtcbiAgICAgICAgfVxuICAgICAgKVxuICAgICAgLnRoZW4oKCkgPT4ge1xuICAgICAgICBjb25zdCB7IHR5cGUsIHRhcmdldENsYXNzLCAuLi5maWVsZE9wdGlvbnMgfSA9IGZpZWxkVHlwZTtcbiAgICAgICAgLy8gV2UgdXNlICRleGlzdHMgYW5kICRzZXQgdG8gYXZvaWQgb3ZlcndyaXRpbmcgdGhlIGZpZWxkIHR5cGUgaWYgaXRcbiAgICAgICAgLy8gYWxyZWFkeSBleGlzdHMuIChpdCBjb3VsZCBoYXZlIGFkZGVkIGluYmV0d2VlbiB0aGUgbGFzdCBxdWVyeSBhbmQgdGhlIHVwZGF0ZSlcbiAgICAgICAgaWYgKGZpZWxkT3B0aW9ucyAmJiBPYmplY3Qua2V5cyhmaWVsZE9wdGlvbnMpLmxlbmd0aCA+IDApIHtcbiAgICAgICAgICByZXR1cm4gdGhpcy51cHNlcnRTY2hlbWEoXG4gICAgICAgICAgICBjbGFzc05hbWUsXG4gICAgICAgICAgICB7IFtmaWVsZE5hbWVdOiB7ICRleGlzdHM6IGZhbHNlIH0gfSxcbiAgICAgICAgICAgIHtcbiAgICAgICAgICAgICAgJHNldDoge1xuICAgICAgICAgICAgICAgIFtmaWVsZE5hbWVdOiBwYXJzZUZpZWxkVHlwZVRvTW9uZ29GaWVsZFR5cGUoe1xuICAgICAgICAgICAgICAgICAgdHlwZSxcbiAgICAgICAgICAgICAgICAgIHRhcmdldENsYXNzLFxuICAgICAgICAgICAgICAgIH0pLFxuICAgICAgICAgICAgICAgIFtgX21ldGFkYXRhLmZpZWxkc19vcHRpb25zLiR7ZmllbGROYW1lfWBdOiBmaWVsZE9wdGlvbnMsXG4gICAgICAgICAgICAgIH0sXG4gICAgICAgICAgICB9XG4gICAgICAgICAgKTtcbiAgICAgICAgfSBlbHNlIHtcbiAgICAgICAgICByZXR1cm4gdGhpcy51cHNlcnRTY2hlbWEoXG4gICAgICAgICAgICBjbGFzc05hbWUsXG4gICAgICAgICAgICB7IFtmaWVsZE5hbWVdOiB7ICRleGlzdHM6IGZhbHNlIH0gfSxcbiAgICAgICAgICAgIHtcbiAgICAgICAgICAgICAgJHNldDoge1xuICAgICAgICAgICAgICAgIFtmaWVsZE5hbWVdOiBwYXJzZUZpZWxkVHlwZVRvTW9uZ29GaWVsZFR5cGUoe1xuICAgICAgICAgICAgICAgICAgdHlwZSxcbiAgICAgICAgICAgICAgICAgIHRhcmdldENsYXNzLFxuICAgICAgICAgICAgICAgIH0pLFxuICAgICAgICAgICAgICB9LFxuICAgICAgICAgICAgfVxuICAgICAgICAgICk7XG4gICAgICAgIH1cbiAgICAgIH0pO1xuICB9XG59XG5cbi8vIEV4cG9ydGVkIGZvciB0ZXN0aW5nIHJlYXNvbnMgYW5kIGJlY2F1c2Ugd2UgaGF2ZW4ndCBtb3ZlZCBhbGwgbW9uZ28gc2NoZW1hIGZvcm1hdFxuLy8gcmVsYXRlZCBsb2dpYyBpbnRvIHRoZSBkYXRhYmFzZSBhZGFwdGVyIHlldC5cbk1vbmdvU2NoZW1hQ29sbGVjdGlvbi5fVEVTVG1vbmdvU2NoZW1hVG9QYXJzZVNjaGVtYSA9IG1vbmdvU2NoZW1hVG9QYXJzZVNjaGVtYTtcbk1vbmdvU2NoZW1hQ29sbGVjdGlvbi5wYXJzZUZpZWxkVHlwZVRvTW9uZ29GaWVsZFR5cGUgPSBwYXJzZUZpZWxkVHlwZVRvTW9uZ29GaWVsZFR5cGU7XG5cbmV4cG9ydCBkZWZhdWx0IE1vbmdvU2NoZW1hQ29sbGVjdGlvbjtcbiJdfQ==