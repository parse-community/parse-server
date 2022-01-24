"use strict";

Object.defineProperty(exports, "__esModule", {
  value: true
});
exports.default = void 0;

var _MongoCollection = _interopRequireDefault(require("./MongoCollection"));

var _node = _interopRequireDefault(require("parse/node"));

function _interopRequireDefault(obj) { return obj && obj.__esModule ? obj : { default: obj }; }

function _extends() { _extends = Object.assign || function (target) { for (var i = 1; i < arguments.length; i++) { var source = arguments[i]; for (var key in source) { if (Object.prototype.hasOwnProperty.call(source, key)) { target[key] = source[key]; } } } return target; }; return _extends.apply(this, arguments); }

function _objectWithoutProperties(source, excluded) { if (source == null) return {}; var target = _objectWithoutPropertiesLoose(source, excluded); var key, i; if (Object.getOwnPropertySymbols) { var sourceSymbolKeys = Object.getOwnPropertySymbols(source); for (i = 0; i < sourceSymbolKeys.length; i++) { key = sourceSymbolKeys[i]; if (excluded.indexOf(key) >= 0) continue; if (!Object.prototype.propertyIsEnumerable.call(source, key)) continue; target[key] = source[key]; } } return target; }

function _objectWithoutPropertiesLoose(source, excluded) { if (source == null) return {}; var target = {}; var sourceKeys = Object.keys(source); var key, i; for (i = 0; i < sourceKeys.length; i++) { key = sourceKeys[i]; if (excluded.indexOf(key) >= 0) continue; target[key] = source[key]; } return target; }

function ownKeys(object, enumerableOnly) { var keys = Object.keys(object); if (Object.getOwnPropertySymbols) { var symbols = Object.getOwnPropertySymbols(object); if (enumerableOnly) { symbols = symbols.filter(function (sym) { return Object.getOwnPropertyDescriptor(object, sym).enumerable; }); } keys.push.apply(keys, symbols); } return keys; }

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
      if (schema.fields[fieldName] !== undefined) {
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

  async updateFieldOptions(className, fieldName, fieldType) {
    const fieldOptions = _extends({}, fieldType);

    delete fieldOptions.type;
    delete fieldOptions.targetClass;
    await this.upsertSchema(className, {
      [fieldName]: {
        $exists: true
      }
    }, {
      $set: {
        [`_metadata.fields_options.${fieldName}`]: fieldOptions
      }
    });
  }

} // Exported for testing reasons and because we haven't moved all mongo schema format
// related logic into the database adapter yet.


MongoSchemaCollection._TESTmongoSchemaToParseSchema = mongoSchemaToParseSchema;
MongoSchemaCollection.parseFieldTypeToMongoFieldType = parseFieldTypeToMongoFieldType;
var _default = MongoSchemaCollection;
exports.default = _default;
//# sourceMappingURL=data:application/json;charset=utf-8;base64,eyJ2ZXJzaW9uIjozLCJzb3VyY2VzIjpbIi4uLy4uLy4uLy4uL3NyYy9BZGFwdGVycy9TdG9yYWdlL01vbmdvL01vbmdvU2NoZW1hQ29sbGVjdGlvbi5qcyJdLCJuYW1lcyI6WyJtb25nb0ZpZWxkVG9QYXJzZVNjaGVtYUZpZWxkIiwidHlwZSIsInRhcmdldENsYXNzIiwic2xpY2UiLCJzdGFydHNXaXRoIiwibGVuZ3RoIiwibm9uRmllbGRTY2hlbWFLZXlzIiwibW9uZ29TY2hlbWFGaWVsZHNUb1BhcnNlU2NoZW1hRmllbGRzIiwic2NoZW1hIiwiZmllbGROYW1lcyIsIk9iamVjdCIsImtleXMiLCJmaWx0ZXIiLCJrZXkiLCJpbmRleE9mIiwicmVzcG9uc2UiLCJyZWR1Y2UiLCJvYmoiLCJmaWVsZE5hbWUiLCJfbWV0YWRhdGEiLCJmaWVsZHNfb3B0aW9ucyIsImFzc2lnbiIsIkFDTCIsImNyZWF0ZWRBdCIsInVwZGF0ZWRBdCIsIm9iamVjdElkIiwiZW1wdHlDTFBTIiwiZnJlZXplIiwiZmluZCIsImNvdW50IiwiZ2V0IiwiY3JlYXRlIiwidXBkYXRlIiwiZGVsZXRlIiwiYWRkRmllbGQiLCJwcm90ZWN0ZWRGaWVsZHMiLCJkZWZhdWx0Q0xQUyIsIm1vbmdvU2NoZW1hVG9QYXJzZVNjaGVtYSIsIm1vbmdvU2NoZW1hIiwiY2xwcyIsImluZGV4ZXMiLCJjbGFzc19wZXJtaXNzaW9ucyIsImNsYXNzTmFtZSIsIl9pZCIsImZpZWxkcyIsImNsYXNzTGV2ZWxQZXJtaXNzaW9ucyIsIl9tb25nb1NjaGVtYVF1ZXJ5RnJvbU5hbWVRdWVyeSIsIm5hbWUiLCJxdWVyeSIsIm9iamVjdCIsImZvckVhY2giLCJwYXJzZUZpZWxkVHlwZVRvTW9uZ29GaWVsZFR5cGUiLCJNb25nb1NjaGVtYUNvbGxlY3Rpb24iLCJjb25zdHJ1Y3RvciIsImNvbGxlY3Rpb24iLCJfY29sbGVjdGlvbiIsIl9mZXRjaEFsbFNjaGVtYXNGcm9tX1NDSEVNQSIsIl9yYXdGaW5kIiwidGhlbiIsInNjaGVtYXMiLCJtYXAiLCJfZmV0Y2hPbmVTY2hlbWFGcm9tX1NDSEVNQSIsImxpbWl0IiwicmVzdWx0cyIsInVuZGVmaW5lZCIsImZpbmRBbmREZWxldGVTY2hlbWEiLCJfbW9uZ29Db2xsZWN0aW9uIiwiZmluZE9uZUFuZERlbGV0ZSIsImluc2VydFNjaGVtYSIsImluc2VydE9uZSIsInJlc3VsdCIsIm9wcyIsImNhdGNoIiwiZXJyb3IiLCJjb2RlIiwiUGFyc2UiLCJFcnJvciIsIkRVUExJQ0FURV9WQUxVRSIsInVwZGF0ZVNjaGVtYSIsInVwZGF0ZU9uZSIsInVwc2VydFNjaGVtYSIsInVwc2VydE9uZSIsImFkZEZpZWxkSWZOb3RFeGlzdHMiLCJmaWVsZFR5cGUiLCJzb21lIiwiZXhpc3RpbmdGaWVsZCIsIklOQ09SUkVDVF9UWVBFIiwiZmllbGRPcHRpb25zIiwiJGV4aXN0cyIsIiRzZXQiLCJ1cGRhdGVGaWVsZE9wdGlvbnMiLCJfVEVTVG1vbmdvU2NoZW1hVG9QYXJzZVNjaGVtYSJdLCJtYXBwaW5ncyI6Ijs7Ozs7OztBQUFBOztBQUNBOzs7Ozs7Ozs7Ozs7Ozs7O0FBRUEsU0FBU0EsNEJBQVQsQ0FBc0NDLElBQXRDLEVBQTRDO0FBQzFDLE1BQUlBLElBQUksQ0FBQyxDQUFELENBQUosS0FBWSxHQUFoQixFQUFxQjtBQUNuQixXQUFPO0FBQ0xBLE1BQUFBLElBQUksRUFBRSxTQUREO0FBRUxDLE1BQUFBLFdBQVcsRUFBRUQsSUFBSSxDQUFDRSxLQUFMLENBQVcsQ0FBWDtBQUZSLEtBQVA7QUFJRDs7QUFDRCxNQUFJRixJQUFJLENBQUNHLFVBQUwsQ0FBZ0IsV0FBaEIsQ0FBSixFQUFrQztBQUNoQyxXQUFPO0FBQ0xILE1BQUFBLElBQUksRUFBRSxVQUREO0FBRUxDLE1BQUFBLFdBQVcsRUFBRUQsSUFBSSxDQUFDRSxLQUFMLENBQVcsWUFBWUUsTUFBdkIsRUFBK0JKLElBQUksQ0FBQ0ksTUFBTCxHQUFjLENBQTdDO0FBRlIsS0FBUDtBQUlEOztBQUNELFVBQVFKLElBQVI7QUFDRSxTQUFLLFFBQUw7QUFDRSxhQUFPO0FBQUVBLFFB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QUFBQSxJQUFJLEVBQUU7QUFDSixhQUFDdkUsU0FBRCxHQUFhaUMsOEJBQThCLENBQUM7QUFDMUNsRCxjQUFBQSxJQUQwQztBQUUxQ0MsY0FBQUE7QUFGMEMsYUFBRDtBQUR2QztBQURSLFNBSEssQ0FBUDtBQVlEO0FBQ0YsS0FoRUksQ0FBUDtBQWlFRDs7QUFFdUIsUUFBbEJ3RixrQkFBa0IsQ0FBQ2hELFNBQUQsRUFBb0J4QixTQUFwQixFQUF1Q2lFLFNBQXZDLEVBQXVEO0FBQzdFLFVBQVdJLFlBQVgsZ0JBQTRCSixTQUE1Qjs7QUFDQSxXQUFPSSxZQUFZLENBQUN0RixJQUFwQjtBQUNBLFdBQU9zRixZQUFZLENBQUNyRixXQUFwQjtBQUVBLFVBQU0sS0FBSzhFLFlBQUwsQ0FDSnRDLFNBREksRUFFSjtBQUFFLE9BQUN4QixTQUFELEdBQWE7QUFBRXNFLFFBQUFBLE9BQU8sRUFBRTtBQUFYO0FBQWYsS0FGSSxFQUdKO0FBQ0VDLE1BQUFBLElBQUksRUFBRTtBQUNKLFNBQUUsNEJBQTJCdkUsU0FBVSxFQUF2QyxHQUEyQ3FFO0FBRHZDO0FBRFIsS0FISSxDQUFOO0FBU0Q7O0FBL0l5QixDLENBa0o1QjtBQUNBOzs7QUFDQW5DLHFCQUFxQixDQUFDdUMsNkJBQXRCLEdBQXNEdEQsd0JBQXREO0FBQ0FlLHFCQUFxQixDQUFDRCw4QkFBdEIsR0FBdURBLDhCQUF2RDtlQUVlQyxxQiIsInNvdXJjZXNDb250ZW50IjpbImltcG9ydCBNb25nb0NvbGxlY3Rpb24gZnJvbSAnLi9Nb25nb0NvbGxlY3Rpb24nO1xuaW1wb3J0IFBhcnNlIGZyb20gJ3BhcnNlL25vZGUnO1xuXG5mdW5jdGlvbiBtb25nb0ZpZWxkVG9QYXJzZVNjaGVtYUZpZWxkKHR5cGUpIHtcbiAgaWYgKHR5cGVbMF0gPT09ICcqJykge1xuICAgIHJldHVybiB7XG4gICAgICB0eXBlOiAnUG9pbnRlcicsXG4gICAgICB0YXJnZXRDbGFzczogdHlwZS5zbGljZSgxKSxcbiAgICB9O1xuICB9XG4gIGlmICh0eXBlLnN0YXJ0c1dpdGgoJ3JlbGF0aW9uPCcpKSB7XG4gICAgcmV0dXJuIHtcbiAgICAgIHR5cGU6ICdSZWxhdGlvbicsXG4gICAgICB0YXJnZXRDbGFzczogdHlwZS5zbGljZSgncmVsYXRpb248Jy5sZW5ndGgsIHR5cGUubGVuZ3RoIC0gMSksXG4gICAgfTtcbiAgfVxuICBzd2l0Y2ggKHR5cGUpIHtcbiAgICBjYXNlICdudW1iZXInOlxuICAgICAgcmV0dXJuIHsgdHlwZTogJ051bWJlcicgfTtcbiAgICBjYXNlICdzdHJpbmcnOlxuICAgICAgcmV0dXJuIHsgdHlwZTogJ1N0cmluZycgfTtcbiAgICBjYXNlICdib29sZWFuJzpcbiAgICAgIHJldHVybiB7IHR5cGU6ICdCb29sZWFuJyB9O1xuICAgIGNhc2UgJ2RhdGUnOlxuICAgICAgcmV0dXJuIHsgdHlwZTogJ0RhdGUnIH07XG4gICAgY2FzZSAnbWFwJzpcbiAgICBjYXNlICdvYmplY3QnOlxuICAgICAgcmV0dXJuIHsgdHlwZTogJ09iamVjdCcgfTtcbiAgICBjYXNlICdhcnJheSc6XG4gICAgICByZXR1cm4geyB0eXBlOiAnQXJyYXknIH07XG4gICAgY2FzZSAnZ2VvcG9pbnQnOlxuICAgICAgcmV0dXJuIHsgdHlwZTogJ0dlb1BvaW50JyB9O1xuICAgIGNhc2UgJ2ZpbGUnOlxuICAgICAgcmV0dXJuIHsgdHlwZTogJ0ZpbGUnIH07XG4gICAgY2FzZSAnYnl0ZXMnOlxuICAgICAgcmV0dXJuIHsgdHlwZTogJ0J5dGVzJyB9O1xuICAgIGNhc2UgJ3BvbHlnb24nOlxuICAgICAgcmV0dXJuIHsgdHlwZTogJ1BvbHlnb24nIH07XG4gIH1cbn1cblxuY29uc3Qgbm9uRmllbGRTY2hlbWFLZXlzID0gWydfaWQnLCAnX21ldGFkYXRhJywgJ19jbGllbnRfcGVybWlzc2lvbnMnXTtcbmZ1bmN0aW9uIG1vbmdvU2NoZW1hRmllbGRzVG9QYXJzZVNjaGVtYUZpZWxkcyhzY2hlbWEpIHtcbiAgdmFyIGZpZWxkTmFtZXMgPSBPYmplY3Qua2V5cyhzY2hlbWEpLmZpbHRlcihrZXkgPT4gbm9uRmllbGRTY2hlbWFLZXlzLmluZGV4T2Yoa2V5KSA9PT0gLTEpO1xuICB2YXIgcmVzcG9uc2UgPSBmaWVsZE5hbWVzLnJlZHVjZSgob2JqLCBmaWVsZE5hbWUpID0+IHtcbiAgICBvYmpbZmllbGROYW1lXSA9IG1vbmdvRmllbGRUb1BhcnNlU2NoZW1hRmllbGQoc2NoZW1hW2ZpZWxkTmFtZV0pO1xuICAgIGlmIChcbiAgICAgIHNjaGVtYS5fbWV0YWRhdGEgJiZcbiAgICAgIHNjaGVtYS5fbWV0YWRhdGEuZmllbGRzX29wdGlvbnMgJiZcbiAgICAgIHNjaGVtYS5fbWV0YWRhdGEuZmllbGRzX29wdGlvbnNbZmllbGROYW1lXVxuICAgICkge1xuICAgICAgb2JqW2ZpZWxkTmFtZV0gPSBPYmplY3QuYXNzaWduKFxuICAgICAgICB7fSxcbiAgICAgICAgb2JqW2ZpZWxkTmFtZV0sXG4gICAgICAgIHNjaGVtYS5fbWV0YWRhdGEuZmllbGRzX29wdGlvbnNbZmllbGROYW1lXVxuICAgICAgKTtcbiAgICB9XG4gICAgcmV0dXJuIG9iajtcbiAgfSwge30pO1xuICByZXNwb25zZS5BQ0wgPSB7IHR5cGU6ICdBQ0wnIH07XG4gIHJlc3BvbnNlLmNyZWF0ZWRBdCA9IHsgdHlwZTogJ0RhdGUnIH07XG4gIHJlc3BvbnNlLnVwZGF0ZWRBdCA9IHsgdHlwZTogJ0RhdGUnIH07XG4gIHJlc3BvbnNlLm9iamVjdElkID0geyB0eXBlOiAnU3RyaW5nJyB9O1xuICByZXR1cm4gcmVzcG9uc2U7XG59XG5cbmNvbnN0IGVtcHR5Q0xQUyA9IE9iamVjdC5mcmVlemUoe1xuICBmaW5kOiB7fSxcbiAgY291bnQ6IHt9LFxuICBnZXQ6IHt9LFxuICBjcmVhdGU6IHt9LFxuICB1cGRhdGU6IHt9LFxuICBkZWxldGU6IHt9LFxuICBhZGRGaWVsZDoge30sXG4gIHByb3RlY3RlZEZpZWxkczoge30sXG59KTtcblxuY29uc3QgZGVmYXVsdENMUFMgPSBPYmplY3QuZnJlZXplKHtcbiAgZmluZDogeyAnKic6IHRydWUgfSxcbiAgY291bnQ6IHsgJyonOiB0cnVlIH0sXG4gIGdldDogeyAnKic6IHRydWUgfSxcbiAgY3JlYXRlOiB7ICcqJzogdHJ1ZSB9LFxuICB1cGRhdGU6IHsgJyonOiB0cnVlIH0sXG4gIGRlbGV0ZTogeyAnKic6IHRydWUgfSxcbiAgYWRkRmllbGQ6IHsgJyonOiB0cnVlIH0sXG4gIHByb3RlY3RlZEZpZWxkczogeyAnKic6IFtdIH0sXG59KTtcblxuZnVuY3Rpb24gbW9uZ29TY2hlbWFUb1BhcnNlU2NoZW1hKG1vbmdvU2NoZW1hKSB7XG4gIGxldCBjbHBzID0gZGVmYXVsdENMUFM7XG4gIGxldCBpbmRleGVzID0ge307XG4gIGlmIChtb25nb1NjaGVtYS5fbWV0YWRhdGEpIHtcbiAgICBpZiAobW9uZ29TY2hlbWEuX21ldGFkYXRhLmNsYXNzX3Blcm1pc3Npb25zKSB7XG4gICAgICBjbHBzID0geyAuLi5lbXB0eUNMUFMsIC4uLm1vbmdvU2NoZW1hLl9tZXRhZGF0YS5jbGFzc19wZXJtaXNzaW9ucyB9O1xuICAgIH1cbiAgICBpZiAobW9uZ29TY2hlbWEuX21ldGFkYXRhLmluZGV4ZXMpIHtcbiAgICAgIGluZGV4ZXMgPSB7IC4uLm1vbmdvU2NoZW1hLl9tZXRhZGF0YS5pbmRleGVzIH07XG4gICAgfVxuICB9XG4gIHJldHVybiB7XG4gICAgY2xhc3NOYW1lOiBtb25nb1NjaGVtYS5faWQsXG4gICAgZmllbGRzOiBtb25nb1NjaGVtYUZpZWxkc1RvUGFyc2VTY2hlbWFGaWVsZHMobW9uZ29TY2hlbWEpLFxuICAgIGNsYXNzTGV2ZWxQZXJtaXNzaW9uczogY2xwcyxcbiAgICBpbmRleGVzOiBpbmRleGVzLFxuICB9O1xufVxuXG5mdW5jdGlvbiBfbW9uZ29TY2hlbWFRdWVyeUZyb21OYW1lUXVlcnkobmFtZTogc3RyaW5nLCBxdWVyeSkge1xuICBjb25zdCBvYmplY3QgPSB7IF9pZDogbmFtZSB9O1xuICBpZiAocXVlcnkpIHtcbiAgICBPYmplY3Qua2V5cyhxdWVyeSkuZm9yRWFjaChrZXkgPT4ge1xuICAgICAgb2JqZWN0W2tleV0gPSBxdWVyeVtrZXldO1xuICAgIH0pO1xuICB9XG4gIHJldHVybiBvYmplY3Q7XG59XG5cbi8vIFJldHVybnMgYSB0eXBlIHN1aXRhYmxlIGZvciBpbnNlcnRpbmcgaW50byBtb25nbyBfU0NIRU1BIGNvbGxlY3Rpb24uXG4vLyBEb2VzIG5vIHZhbGlkYXRpb24uIFRoYXQgaXMgZXhwZWN0ZWQgdG8gYmUgZG9uZSBpbiBQYXJzZSBTZXJ2ZXIuXG5mdW5jdGlvbiBwYXJzZUZpZWxkVHlwZVRvTW9uZ29GaWVsZFR5cGUoeyB0eXBlLCB0YXJnZXRDbGFzcyB9KSB7XG4gIHN3aXRjaCAodHlwZSkge1xuICAgIGNhc2UgJ1BvaW50ZXInOlxuICAgICAgcmV0dXJuIGAqJHt0YXJnZXRDbGFzc31gO1xuICAgIGNhc2UgJ1JlbGF0aW9uJzpcbiAgICAgIHJldHVybiBgcmVsYXRpb248JHt0YXJnZXRDbGFzc30+YDtcbiAgICBjYXNlICdOdW1iZXInOlxuICAgICAgcmV0dXJuICdudW1iZXInO1xuICAgIGNhc2UgJ1N0cmluZyc6XG4gICAgICByZXR1cm4gJ3N0cmluZyc7XG4gICAgY2FzZSAnQm9vbGVhbic6XG4gICAgICByZXR1cm4gJ2Jvb2xlYW4nO1xuICAgIGNhc2UgJ0RhdGUnOlxuICAgICAgcmV0dXJuICdkYXRlJztcbiAgICBjYXNlICdPYmplY3QnOlxuICAgICAgcmV0dXJuICdvYmplY3QnO1xuICAgIGNhc2UgJ0FycmF5JzpcbiAgICAgIHJldHVybiAnYXJyYXknO1xuICAgIGNhc2UgJ0dlb1BvaW50JzpcbiAgICAgIHJldHVybiAnZ2VvcG9pbnQnO1xuICAgIGNhc2UgJ0ZpbGUnOlxuICAgICAgcmV0dXJuICdmaWxlJztcbiAgICBjYXNlICdCeXRlcyc6XG4gICAgICByZXR1cm4gJ2J5dGVzJztcbiAgICBjYXNlICdQb2x5Z29uJzpcbiAgICAgIHJldHVybiAncG9seWdvbic7XG4gIH1cbn1cblxuY2xhc3MgTW9uZ29TY2hlbWFDb2xsZWN0aW9uIHtcbiAgX2NvbGxlY3Rpb246IE1vbmdvQ29sbGVjdGlvbjtcblxuICBjb25zdHJ1Y3Rvcihjb2xsZWN0aW9uOiBNb25nb0NvbGxlY3Rpb24pIHtcbiAgICB0aGlzLl9jb2xsZWN0aW9uID0gY29sbGVjdGlvbjtcbiAgfVxuXG4gIF9mZXRjaEFsbFNjaGVtYXNGcm9tX1NDSEVNQSgpIHtcbiAgICByZXR1cm4gdGhpcy5fY29sbGVjdGlvbi5fcmF3RmluZCh7fSkudGhlbihzY2hlbWFzID0+IHNjaGVtYXMubWFwKG1vbmdvU2NoZW1hVG9QYXJzZVNjaGVtYSkpO1xuICB9XG5cbiAgX2ZldGNoT25lU2NoZW1hRnJvbV9TQ0hFTUEobmFtZTogc3RyaW5nKSB7XG4gICAgcmV0dXJuIHRoaXMuX2NvbGxlY3Rpb25cbiAgICAgIC5fcmF3RmluZChfbW9uZ29TY2hlbWFRdWVyeUZyb21OYW1lUXVlcnkobmFtZSksIHsgbGltaXQ6IDEgfSlcbiAgICAgIC50aGVuKHJlc3VsdHMgPT4ge1xuICAgICAgICBpZiAocmVzdWx0cy5sZW5ndGggPT09IDEpIHtcbiAgICAgICAgICByZXR1cm4gbW9uZ29TY2hlbWFUb1BhcnNlU2NoZW1hKHJlc3VsdHNbMF0pO1xuICAgICAgICB9IGVsc2Uge1xuICAgICAgICAgIHRocm93IHVuZGVmaW5lZDtcbiAgICAgICAgfVxuICAgICAgfSk7XG4gIH1cblxuICAvLyBBdG9taWNhbGx5IGZpbmQgYW5kIGRlbGV0ZSBhbiBvYmplY3QgYmFzZWQgb24gcXVlcnkuXG4gIGZpbmRBbmREZWxldGVTY2hlbWEobmFtZTogc3RyaW5nKSB7XG4gICAgcmV0dXJuIHRoaXMuX2NvbGxlY3Rpb24uX21vbmdvQ29sbGVjdGlvbi5maW5kT25lQW5kRGVsZXRlKF9tb25nb1NjaGVtYVF1ZXJ5RnJvbU5hbWVRdWVyeShuYW1lKSk7XG4gIH1cblxuICBpbnNlcnRTY2hlbWEoc2NoZW1hOiBhbnkpIHtcbiAgICByZXR1cm4gdGhpcy5fY29sbGVjdGlvblxuICAgICAgLmluc2VydE9uZShzY2hlbWEpXG4gICAgICAudGhlbihyZXN1bHQgPT4gbW9uZ29TY2hlbWFUb1BhcnNlU2NoZW1hKHJlc3VsdC5vcHNbMF0pKVxuICAgICAgLmNhdGNoKGVycm9yID0+IHtcbiAgICAgICAgaWYgKGVycm9yLmNvZGUgPT09IDExMDAwKSB7XG4gICAgICAgICAgLy9Nb25nbydzIGR1cGxpY2F0ZSBrZXkgZXJyb3JcbiAgICAgICAgICB0aHJvdyBuZXcgUGFyc2UuRXJyb3IoUGFyc2UuRXJyb3IuRFVQTElDQVRFX1ZBTFVFLCAnQ2xhc3MgYWxyZWFkeSBleGlzdHMuJyk7XG4gICAgICAgIH0gZWxzZSB7XG4gICAgICAgICAgdGhyb3cgZXJyb3I7XG4gICAgICAgIH1cbiAgICAgIH0pO1xuICB9XG5cbiAgdXBkYXRlU2NoZW1hKG5hbWU6IHN0cmluZywgdXBkYXRlKSB7XG4gICAgcmV0dXJuIHRoaXMuX2NvbGxlY3Rpb24udXBkYXRlT25lKF9tb25nb1NjaGVtYVF1ZXJ5RnJvbU5hbWVRdWVyeShuYW1lKSwgdXBkYXRlKTtcbiAgfVxuXG4gIHVwc2VydFNjaGVtYShuYW1lOiBzdHJpbmcsIHF1ZXJ5OiBzdHJpbmcsIHVwZGF0ZSkge1xuICAgIHJldHVybiB0aGlzLl9jb2xsZWN0aW9uLnVwc2VydE9uZShfbW9uZ29TY2hlbWFRdWVyeUZyb21OYW1lUXVlcnkobmFtZSwgcXVlcnkpLCB1cGRhdGUpO1xuICB9XG5cbiAgLy8gQWRkIGEgZmllbGQgdG8gdGhlIHNjaGVtYS4gSWYgZGF0YWJhc2UgZG9lcyBub3Qgc3VwcG9ydCB0aGUgZmllbGRcbiAgLy8gdHlwZSAoZS5nLiBtb25nbyBkb2Vzbid0IHN1cHBvcnQgbW9yZSB0aGFuIG9uZSBHZW9Qb2ludCBpbiBhIGNsYXNzKSByZWplY3Qgd2l0aCBhbiBcIkluY29ycmVjdCBUeXBlXCJcbiAgLy8gUGFyc2UgZXJyb3Igd2l0aCBhIGRlc2NpcHRpdmUgbWVzc2FnZS4gSWYgdGhlIGZpZWxkIGFscmVhZHkgZXhpc3RzLCB0aGlzIGZ1bmN0aW9uIG11c3RcbiAgLy8gbm90IG1vZGlmeSB0aGUgc2NoZW1hLCBhbmQgbXVzdCByZWplY3Qgd2l0aCBEVVBMSUNBVEVfVkFMVUUgZXJyb3IuXG4gIC8vIElmIHRoaXMgaXMgY2FsbGVkIGZvciBhIGNsYXNzIHRoYXQgZG9lc24ndCBleGlzdCwgdGhpcyBmdW5jdGlvbiBtdXN0IGNyZWF0ZSB0aGF0IGNsYXNzLlxuXG4gIC8vIFRPRE86IHRocm93IGFuIGVycm9yIGlmIGFuIHVuc3VwcG9ydGVkIGZpZWxkIHR5cGUgaXMgcGFzc2VkLiBEZWNpZGluZyB3aGV0aGVyIGEgdHlwZSBpcyBzdXBwb3J0ZWRcbiAgLy8gc2hvdWxkIGJlIHRoZSBqb2Igb2YgdGhlIGFkYXB0ZXIuIFNvbWUgYWRhcHRlcnMgbWF5IG5vdCBzdXBwb3J0IEdlb1BvaW50IGF0IGFsbC4gT3RoZXJzIG1heVxuICAvLyBTdXBwb3J0IGFkZGl0aW9uYWwgdHlwZXMgdGhhdCBNb25nbyBkb2Vzbid0LCBsaWtlIE1vbmV5LCBvciBzb21ldGhpbmcuXG5cbiAgLy8gVE9ETzogZG9uJ3Qgc3BlbmQgYW4gZXh0cmEgcXVlcnkgb24gZmluZGluZyB0aGUgc2NoZW1hIGlmIHRoZSB0eXBlIHdlIGFyZSB0cnlpbmcgdG8gYWRkIGlzbid0IGEgR2VvUG9pbnQuXG4gIGFkZEZpZWxkSWZOb3RFeGlzdHMoY2xhc3NOYW1lOiBzdHJpbmcsIGZpZWxkTmFtZTogc3RyaW5nLCBmaWVsZFR5cGU6IHN0cmluZykge1xuICAgIHJldHVybiB0aGlzLl9mZXRjaE9uZVNjaGVtYUZyb21fU0NIRU1BKGNsYXNzTmFtZSlcbiAgICAgIC50aGVuKFxuICAgICAgICBzY2hlbWEgPT4ge1xuICAgICAgICAgIC8vIElmIGEgZmllbGQgd2l0aCB0aGlzIG5hbWUgYWxyZWFkeSBleGlzdHMsIGl0IHdpbGwgYmUgaGFuZGxlZCBlbHNld2hlcmUuXG4gICAgICAgICAgaWYgKHNjaGVtYS5maWVsZHNbZmllbGROYW1lXSAhPT0gdW5kZWZpbmVkKSB7XG4gICAgICAgICAgICByZXR1cm47XG4gICAgICAgICAgfVxuICAgICAgICAgIC8vIFRoZSBzY2hlbWEgZXhpc3RzLiBDaGVjayBmb3IgZXhpc3RpbmcgR2VvUG9pbnRzLlxuICAgICAgICAgIGlmIChmaWVsZFR5cGUudHlwZSA9PT0gJ0dlb1BvaW50Jykge1xuICAgICAgICAgICAgLy8gTWFrZSBzdXJlIHRoZXJlIGFyZSBub3Qgb3RoZXIgZ2VvcG9pbnQgZmllbGRzXG4gICAgICAgICAgICBpZiAoXG4gICAgICAgICAgICAgIE9iamVjdC5rZXlzKHNjaGVtYS5maWVsZHMpLnNvbWUoXG4gICAgICAgICAgICAgICAgZXhpc3RpbmdGaWVsZCA9PiBzY2hlbWEuZmllbGRzW2V4aXN0aW5nRmllbGRdLnR5cGUgPT09ICdHZW9Qb2ludCdcbiAgICAgICAgICAgICAgKVxuICAgICAgICAgICAgKSB7XG4gICAgICAgICAgICAgIHRocm93IG5ldyBQYXJzZS5FcnJvcihcbiAgICAgICAgICAgICAgICBQYXJzZS5FcnJvci5JTkNPUlJFQ1RfVFlQRSxcbiAgICAgICAgICAgICAgICAnTW9uZ29EQiBvbmx5IHN1cHBvcnRzIG9uZSBHZW9Qb2ludCBmaWVsZCBpbiBhIGNsYXNzLidcbiAgICAgICAgICAgICAgKTtcbiAgICAgICAgICAgIH1cbiAgICAgICAgICB9XG4gICAgICAgICAgcmV0dXJuO1xuICAgICAgICB9LFxuICAgICAgICBlcnJvciA9PiB7XG4gICAgICAgICAgLy8gSWYgZXJyb3IgaXMgdW5kZWZpbmVkLCB0aGUgc2NoZW1hIGRvZXNuJ3QgZXhpc3QsIGFuZCB3ZSBjYW4gY3JlYXRlIHRoZSBzY2hlbWEgd2l0aCB0aGUgZmllbGQuXG4gICAgICAgICAgLy8gSWYgc29tZSBvdGhlciBlcnJvciwgcmVqZWN0IHdpdGggaXQuXG4gICAgICAgICAgaWYgKGVycm9yID09PSB1bmRlZmluZWQpIHtcbiAgICAgICAgICAgIHJldHVybjtcbiAgICAgICAgICB9XG4gICAgICAgICAgdGhyb3cgZXJyb3I7XG4gICAgICAgIH1cbiAgICAgIClcbiAgICAgIC50aGVuKCgpID0+IHtcbiAgICAgICAgY29uc3QgeyB0eXBlLCB0YXJnZXRDbGFzcywgLi4uZmllbGRPcHRpb25zIH0gPSBmaWVsZFR5cGU7XG4gICAgICAgIC8vIFdlIHVzZSAkZXhpc3RzIGFuZCAkc2V0IHRvIGF2b2lkIG92ZXJ3cml0aW5nIHRoZSBmaWVsZCB0eXBlIGlmIGl0XG4gICAgICAgIC8vIGFscmVhZHkgZXhpc3RzLiAoaXQgY291bGQgaGF2ZSBhZGRlZCBpbmJldHdlZW4gdGhlIGxhc3QgcXVlcnkgYW5kIHRoZSB1cGRhdGUpXG4gICAgICAgIGlmIChmaWVsZE9wdGlvbnMgJiYgT2JqZWN0LmtleXMoZmllbGRPcHRpb25zKS5sZW5ndGggPiAwKSB7XG4gICAgICAgICAgcmV0dXJuIHRoaXMudXBzZXJ0U2NoZW1hKFxuICAgICAgICAgICAgY2xhc3NOYW1lLFxuICAgICAgICAgICAgeyBbZmllbGROYW1lXTogeyAkZXhpc3RzOiBmYWxzZSB9IH0sXG4gICAgICAgICAgICB7XG4gICAgICAgICAgICAgICRzZXQ6IHtcbiAgICAgICAgICAgICAgICBbZmllbGROYW1lXTogcGFyc2VGaWVsZFR5cGVUb01vbmdvRmllbGRUeXBlKHtcbiAgICAgICAgICAgICAgICAgIHR5cGUsXG4gICAgICAgICAgICAgICAgICB0YXJnZXRDbGFzcyxcbiAgICAgICAgICAgICAgICB9KSxcbiAgICAgICAgICAgICAgICBbYF9tZXRhZGF0YS5maWVsZHNfb3B0aW9ucy4ke2ZpZWxkTmFtZX1gXTogZmllbGRPcHRpb25zLFxuICAgICAgICAgICAgICB9LFxuICAgICAgICAgICAgfVxuICAgICAgICAgICk7XG4gICAgICAgIH0gZWxzZSB7XG4gICAgICAgICAgcmV0dXJuIHRoaXMudXBzZXJ0U2NoZW1hKFxuICAgICAgICAgICAgY2xhc3NOYW1lLFxuICAgICAgICAgICAgeyBbZmllbGROYW1lXTogeyAkZXhpc3RzOiBmYWxzZSB9IH0sXG4gICAgICAgICAgICB7XG4gICAgICAgICAgICAgICRzZXQ6IHtcbiAgICAgICAgICAgICAgICBbZmllbGROYW1lXTogcGFyc2VGaWVsZFR5cGVUb01vbmdvRmllbGRUeXBlKHtcbiAgICAgICAgICAgICAgICAgIHR5cGUsXG4gICAgICAgICAgICAgICAgICB0YXJnZXRDbGFzcyxcbiAgICAgICAgICAgICAgICB9KSxcbiAgICAgICAgICAgICAgfSxcbiAgICAgICAgICAgIH1cbiAgICAgICAgICApO1xuICAgICAgICB9XG4gICAgICB9KTtcbiAgfVxuXG4gIGFzeW5jIHVwZGF0ZUZpZWxkT3B0aW9ucyhjbGFzc05hbWU6IHN0cmluZywgZmllbGROYW1lOiBzdHJpbmcsIGZpZWxkVHlwZTogYW55KSB7XG4gICAgY29uc3QgeyAuLi5maWVsZE9wdGlvbnMgfSA9IGZpZWxkVHlwZTtcbiAgICBkZWxldGUgZmllbGRPcHRpb25zLnR5cGU7XG4gICAgZGVsZXRlIGZpZWxkT3B0aW9ucy50YXJnZXRDbGFzcztcblxuICAgIGF3YWl0IHRoaXMudXBzZXJ0U2NoZW1hKFxuICAgICAgY2xhc3NOYW1lLFxuICAgICAgeyBbZmllbGROYW1lXTogeyAkZXhpc3RzOiB0cnVlIH0gfSxcbiAgICAgIHtcbiAgICAgICAgJHNldDoge1xuICAgICAgICAgIFtgX21ldGFkYXRhLmZpZWxkc19vcHRpb25zLiR7ZmllbGROYW1lfWBdOiBmaWVsZE9wdGlvbnMsXG4gICAgICAgIH0sXG4gICAgICB9XG4gICAgKTtcbiAgfVxufVxuXG4vLyBFeHBvcnRlZCBmb3IgdGVzdGluZyByZWFzb25zIGFuZCBiZWNhdXNlIHdlIGhhdmVuJ3QgbW92ZWQgYWxsIG1vbmdvIHNjaGVtYSBmb3JtYXRcbi8vIHJlbGF0ZWQgbG9naWMgaW50byB0aGUgZGF0YWJhc2UgYWRhcHRlciB5ZXQuXG5Nb25nb1NjaGVtYUNvbGxlY3Rpb24uX1RFU1Rtb25nb1NjaGVtYVRvUGFyc2VTY2hlbWEgPSBtb25nb1NjaGVtYVRvUGFyc2VTY2hlbWE7XG5Nb25nb1NjaGVtYUNvbGxlY3Rpb24ucGFyc2VGaWVsZFR5cGVUb01vbmdvRmllbGRUeXBlID0gcGFyc2VGaWVsZFR5cGVUb01vbmdvRmllbGRUeXBlO1xuXG5leHBvcnQgZGVmYXVsdCBNb25nb1NjaGVtYUNvbGxlY3Rpb247XG4iXX0=