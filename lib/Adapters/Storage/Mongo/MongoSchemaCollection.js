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
      clps = _objectSpread({}, emptyCLPS, {}, mongoSchema._metadata.class_permissions);
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
    return this._collection._mongoCollection.findAndRemove(_mongoSchemaQueryFromNameQuery(name), []);
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
//# sourceMappingURL=data:application/json;charset=utf-8;base64,eyJ2ZXJzaW9uIjozLCJzb3VyY2VzIjpbIi4uLy4uLy4uLy4uL3NyYy9BZGFwdGVycy9TdG9yYWdlL01vbmdvL01vbmdvU2NoZW1hQ29sbGVjdGlvbi5qcyJdLCJuYW1lcyI6WyJtb25nb0ZpZWxkVG9QYXJzZVNjaGVtYUZpZWxkIiwidHlwZSIsInRhcmdldENsYXNzIiwic2xpY2UiLCJzdGFydHNXaXRoIiwibGVuZ3RoIiwibm9uRmllbGRTY2hlbWFLZXlzIiwibW9uZ29TY2hlbWFGaWVsZHNUb1BhcnNlU2NoZW1hRmllbGRzIiwic2NoZW1hIiwiZmllbGROYW1lcyIsIk9iamVjdCIsImtleXMiLCJmaWx0ZXIiLCJrZXkiLCJpbmRleE9mIiwicmVzcG9uc2UiLCJyZWR1Y2UiLCJvYmoiLCJmaWVsZE5hbWUiLCJfbWV0YWRhdGEiLCJmaWVsZHNfb3B0aW9ucyIsImFzc2lnbiIsIkFDTCIsImNyZWF0ZWRBdCIsInVwZGF0ZWRBdCIsIm9iamVjdElkIiwiZW1wdHlDTFBTIiwiZnJlZXplIiwiZmluZCIsImNvdW50IiwiZ2V0IiwiY3JlYXRlIiwidXBkYXRlIiwiZGVsZXRlIiwiYWRkRmllbGQiLCJwcm90ZWN0ZWRGaWVsZHMiLCJkZWZhdWx0Q0xQUyIsIm1vbmdvU2NoZW1hVG9QYXJzZVNjaGVtYSIsIm1vbmdvU2NoZW1hIiwiY2xwcyIsImluZGV4ZXMiLCJjbGFzc19wZXJtaXNzaW9ucyIsImNsYXNzTmFtZSIsIl9pZCIsImZpZWxkcyIsImNsYXNzTGV2ZWxQZXJtaXNzaW9ucyIsIl9tb25nb1NjaGVtYVF1ZXJ5RnJvbU5hbWVRdWVyeSIsIm5hbWUiLCJxdWVyeSIsIm9iamVjdCIsImZvckVhY2giLCJwYXJzZUZpZWxkVHlwZVRvTW9uZ29GaWVsZFR5cGUiLCJNb25nb1NjaGVtYUNvbGxlY3Rpb24iLCJjb25zdHJ1Y3RvciIsImNvbGxlY3Rpb24iLCJfY29sbGVjdGlvbiIsIl9mZXRjaEFsbFNjaGVtYXNGcm9tX1NDSEVNQSIsIl9yYXdGaW5kIiwidGhlbiIsInNjaGVtYXMiLCJtYXAiLCJfZmV0Y2hPbmVTY2hlbWFGcm9tX1NDSEVNQSIsImxpbWl0IiwicmVzdWx0cyIsInVuZGVmaW5lZCIsImZpbmRBbmREZWxldGVTY2hlbWEiLCJfbW9uZ29Db2xsZWN0aW9uIiwiZmluZEFuZFJlbW92ZSIsImluc2VydFNjaGVtYSIsImluc2VydE9uZSIsInJlc3VsdCIsIm9wcyIsImNhdGNoIiwiZXJyb3IiLCJjb2RlIiwiUGFyc2UiLCJFcnJvciIsIkRVUExJQ0FURV9WQUxVRSIsInVwZGF0ZVNjaGVtYSIsInVwZGF0ZU9uZSIsInVwc2VydFNjaGVtYSIsInVwc2VydE9uZSIsImFkZEZpZWxkSWZOb3RFeGlzdHMiLCJmaWVsZFR5cGUiLCJzb21lIiwiZXhpc3RpbmdGaWVsZCIsIklOQ09SUkVDVF9UWVBFIiwiZmllbGRPcHRpb25zIiwiJGV4aXN0cyIsIiRzZXQiLCJfVEVTVG1vbmdvU2NoZW1hVG9QYXJzZVNjaGVtYSJdLCJtYXBwaW5ncyI6Ijs7Ozs7OztBQUFBOztBQUNBOzs7Ozs7Ozs7Ozs7OztBQUVBLFNBQVNBLDRCQUFULENBQXNDQyxJQUF0QyxFQUE0QztBQUMxQyxNQUFJQSxJQUFJLENBQUMsQ0FBRCxDQUFKLEtBQVksR0FBaEIsRUFBcUI7QUFDbkIsV0FBTztBQUNMQSxNQUFBQSxJQUFJLEVBQUUsU0FERDtBQUVMQyxNQUFBQSxXQUFXLEVBQUVELElBQUksQ0FBQ0UsS0FBTCxDQUFXLENBQVg7QUFGUixLQUFQO0FBSUQ7O0FBQ0QsTUFBSUYsSUFBSSxDQUFDRyxVQUFMLENBQWdCLFdBQWhCLENBQUosRUFBa0M7QUFDaEMsV0FBTztBQUNMSCxNQUFBQSxJQUFJLEVBQUUsVUFERDtBQUVMQyxNQUFBQSxXQUFXLEVBQUVELElBQUksQ0FBQ0UsS0FBTCxDQUFXLFlBQVlFLE1BQXZCLEVBQStCSixJQUFJLENBQUNJLE1BQUwsR0FBYyxDQUE3QztBQUZSLEtBQVA7QUFJRDs7QUFDRCxVQUFRSixJQUFSO0FBQ0UsU0FBSyxRQUFMO0FBQ0UsYUFBTztBQUFFQSxRQUFBQSxJQUFJLEVBQUU7QUFBUixPQUFQOztB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Qyw4QkFBOEIsQ0FBQztBQUMxQ2xELGNBQUFBLElBRDBDO0FBRTFDQyxjQUFBQTtBQUYwQyxhQUFEO0FBRHZDO0FBRFIsU0FISyxDQUFQO0FBWUQ7QUFDRixLQWpFSSxDQUFQO0FBa0VEOztBQTlJeUIsQyxDQWlKNUI7QUFDQTs7O0FBQ0FrRCxxQkFBcUIsQ0FBQ3NDLDZCQUF0QixHQUFzRHJELHdCQUF0RDtBQUNBZSxxQkFBcUIsQ0FBQ0QsOEJBQXRCLEdBQXVEQSw4QkFBdkQ7ZUFFZUMscUIiLCJzb3VyY2VzQ29udGVudCI6WyJpbXBvcnQgTW9uZ29Db2xsZWN0aW9uIGZyb20gJy4vTW9uZ29Db2xsZWN0aW9uJztcbmltcG9ydCBQYXJzZSBmcm9tICdwYXJzZS9ub2RlJztcblxuZnVuY3Rpb24gbW9uZ29GaWVsZFRvUGFyc2VTY2hlbWFGaWVsZCh0eXBlKSB7XG4gIGlmICh0eXBlWzBdID09PSAnKicpIHtcbiAgICByZXR1cm4ge1xuICAgICAgdHlwZTogJ1BvaW50ZXInLFxuICAgICAgdGFyZ2V0Q2xhc3M6IHR5cGUuc2xpY2UoMSksXG4gICAgfTtcbiAgfVxuICBpZiAodHlwZS5zdGFydHNXaXRoKCdyZWxhdGlvbjwnKSkge1xuICAgIHJldHVybiB7XG4gICAgICB0eXBlOiAnUmVsYXRpb24nLFxuICAgICAgdGFyZ2V0Q2xhc3M6IHR5cGUuc2xpY2UoJ3JlbGF0aW9uPCcubGVuZ3RoLCB0eXBlLmxlbmd0aCAtIDEpLFxuICAgIH07XG4gIH1cbiAgc3dpdGNoICh0eXBlKSB7XG4gICAgY2FzZSAnbnVtYmVyJzpcbiAgICAgIHJldHVybiB7IHR5cGU6ICdOdW1iZXInIH07XG4gICAgY2FzZSAnc3RyaW5nJzpcbiAgICAgIHJldHVybiB7IHR5cGU6ICdTdHJpbmcnIH07XG4gICAgY2FzZSAnYm9vbGVhbic6XG4gICAgICByZXR1cm4geyB0eXBlOiAnQm9vbGVhbicgfTtcbiAgICBjYXNlICdkYXRlJzpcbiAgICAgIHJldHVybiB7IHR5cGU6ICdEYXRlJyB9O1xuICAgIGNhc2UgJ21hcCc6XG4gICAgY2FzZSAnb2JqZWN0JzpcbiAgICAgIHJldHVybiB7IHR5cGU6ICdPYmplY3QnIH07XG4gICAgY2FzZSAnYXJyYXknOlxuICAgICAgcmV0dXJuIHsgdHlwZTogJ0FycmF5JyB9O1xuICAgIGNhc2UgJ2dlb3BvaW50JzpcbiAgICAgIHJldHVybiB7IHR5cGU6ICdHZW9Qb2ludCcgfTtcbiAgICBjYXNlICdmaWxlJzpcbiAgICAgIHJldHVybiB7IHR5cGU6ICdGaWxlJyB9O1xuICAgIGNhc2UgJ2J5dGVzJzpcbiAgICAgIHJldHVybiB7IHR5cGU6ICdCeXRlcycgfTtcbiAgICBjYXNlICdwb2x5Z29uJzpcbiAgICAgIHJldHVybiB7IHR5cGU6ICdQb2x5Z29uJyB9O1xuICB9XG59XG5cbmNvbnN0IG5vbkZpZWxkU2NoZW1hS2V5cyA9IFsnX2lkJywgJ19tZXRhZGF0YScsICdfY2xpZW50X3Blcm1pc3Npb25zJ107XG5mdW5jdGlvbiBtb25nb1NjaGVtYUZpZWxkc1RvUGFyc2VTY2hlbWFGaWVsZHMoc2NoZW1hKSB7XG4gIHZhciBmaWVsZE5hbWVzID0gT2JqZWN0LmtleXMoc2NoZW1hKS5maWx0ZXIoXG4gICAga2V5ID0+IG5vbkZpZWxkU2NoZW1hS2V5cy5pbmRleE9mKGtleSkgPT09IC0xXG4gICk7XG4gIHZhciByZXNwb25zZSA9IGZpZWxkTmFtZXMucmVkdWNlKChvYmosIGZpZWxkTmFtZSkgPT4ge1xuICAgIG9ialtmaWVsZE5hbWVdID0gbW9uZ29GaWVsZFRvUGFyc2VTY2hlbWFGaWVsZChzY2hlbWFbZmllbGROYW1lXSk7XG4gICAgaWYgKFxuICAgICAgc2NoZW1hLl9tZXRhZGF0YSAmJlxuICAgICAgc2NoZW1hLl9tZXRhZGF0YS5maWVsZHNfb3B0aW9ucyAmJlxuICAgICAgc2NoZW1hLl9tZXRhZGF0YS5maWVsZHNfb3B0aW9uc1tmaWVsZE5hbWVdXG4gICAgKSB7XG4gICAgICBvYmpbZmllbGROYW1lXSA9IE9iamVjdC5hc3NpZ24oXG4gICAgICAgIHt9LFxuICAgICAgICBvYmpbZmllbGROYW1lXSxcbiAgICAgICAgc2NoZW1hLl9tZXRhZGF0YS5maWVsZHNfb3B0aW9uc1tmaWVsZE5hbWVdXG4gICAgICApO1xuICAgIH1cbiAgICByZXR1cm4gb2JqO1xuICB9LCB7fSk7XG4gIHJlc3BvbnNlLkFDTCA9IHsgdHlwZTogJ0FDTCcgfTtcbiAgcmVzcG9uc2UuY3JlYXRlZEF0ID0geyB0eXBlOiAnRGF0ZScgfTtcbiAgcmVzcG9uc2UudXBkYXRlZEF0ID0geyB0eXBlOiAnRGF0ZScgfTtcbiAgcmVzcG9uc2Uub2JqZWN0SWQgPSB7IHR5cGU6ICdTdHJpbmcnIH07XG4gIHJldHVybiByZXNwb25zZTtcbn1cblxuY29uc3QgZW1wdHlDTFBTID0gT2JqZWN0LmZyZWV6ZSh7XG4gIGZpbmQ6IHt9LFxuICBjb3VudDoge30sXG4gIGdldDoge30sXG4gIGNyZWF0ZToge30sXG4gIHVwZGF0ZToge30sXG4gIGRlbGV0ZToge30sXG4gIGFkZEZpZWxkOiB7fSxcbiAgcHJvdGVjdGVkRmllbGRzOiB7fSxcbn0pO1xuXG5jb25zdCBkZWZhdWx0Q0xQUyA9IE9iamVjdC5mcmVlemUoe1xuICBmaW5kOiB7ICcqJzogdHJ1ZSB9LFxuICBjb3VudDogeyAnKic6IHRydWUgfSxcbiAgZ2V0OiB7ICcqJzogdHJ1ZSB9LFxuICBjcmVhdGU6IHsgJyonOiB0cnVlIH0sXG4gIHVwZGF0ZTogeyAnKic6IHRydWUgfSxcbiAgZGVsZXRlOiB7ICcqJzogdHJ1ZSB9LFxuICBhZGRGaWVsZDogeyAnKic6IHRydWUgfSxcbiAgcHJvdGVjdGVkRmllbGRzOiB7ICcqJzogW10gfSxcbn0pO1xuXG5mdW5jdGlvbiBtb25nb1NjaGVtYVRvUGFyc2VTY2hlbWEobW9uZ29TY2hlbWEpIHtcbiAgbGV0IGNscHMgPSBkZWZhdWx0Q0xQUztcbiAgbGV0IGluZGV4ZXMgPSB7fTtcbiAgaWYgKG1vbmdvU2NoZW1hLl9tZXRhZGF0YSkge1xuICAgIGlmIChtb25nb1NjaGVtYS5fbWV0YWRhdGEuY2xhc3NfcGVybWlzc2lvbnMpIHtcbiAgICAgIGNscHMgPSB7IC4uLmVtcHR5Q0xQUywgLi4ubW9uZ29TY2hlbWEuX21ldGFkYXRhLmNsYXNzX3Blcm1pc3Npb25zIH07XG4gICAgfVxuICAgIGlmIChtb25nb1NjaGVtYS5fbWV0YWRhdGEuaW5kZXhlcykge1xuICAgICAgaW5kZXhlcyA9IHsgLi4ubW9uZ29TY2hlbWEuX21ldGFkYXRhLmluZGV4ZXMgfTtcbiAgICB9XG4gIH1cbiAgcmV0dXJuIHtcbiAgICBjbGFzc05hbWU6IG1vbmdvU2NoZW1hLl9pZCxcbiAgICBmaWVsZHM6IG1vbmdvU2NoZW1hRmllbGRzVG9QYXJzZVNjaGVtYUZpZWxkcyhtb25nb1NjaGVtYSksXG4gICAgY2xhc3NMZXZlbFBlcm1pc3Npb25zOiBjbHBzLFxuICAgIGluZGV4ZXM6IGluZGV4ZXMsXG4gIH07XG59XG5cbmZ1bmN0aW9uIF9tb25nb1NjaGVtYVF1ZXJ5RnJvbU5hbWVRdWVyeShuYW1lOiBzdHJpbmcsIHF1ZXJ5KSB7XG4gIGNvbnN0IG9iamVjdCA9IHsgX2lkOiBuYW1lIH07XG4gIGlmIChxdWVyeSkge1xuICAgIE9iamVjdC5rZXlzKHF1ZXJ5KS5mb3JFYWNoKGtleSA9PiB7XG4gICAgICBvYmplY3Rba2V5XSA9IHF1ZXJ5W2tleV07XG4gICAgfSk7XG4gIH1cbiAgcmV0dXJuIG9iamVjdDtcbn1cblxuLy8gUmV0dXJucyBhIHR5cGUgc3VpdGFibGUgZm9yIGluc2VydGluZyBpbnRvIG1vbmdvIF9TQ0hFTUEgY29sbGVjdGlvbi5cbi8vIERvZXMgbm8gdmFsaWRhdGlvbi4gVGhhdCBpcyBleHBlY3RlZCB0byBiZSBkb25lIGluIFBhcnNlIFNlcnZlci5cbmZ1bmN0aW9uIHBhcnNlRmllbGRUeXBlVG9Nb25nb0ZpZWxkVHlwZSh7IHR5cGUsIHRhcmdldENsYXNzIH0pIHtcbiAgc3dpdGNoICh0eXBlKSB7XG4gICAgY2FzZSAnUG9pbnRlcic6XG4gICAgICByZXR1cm4gYCoke3RhcmdldENsYXNzfWA7XG4gICAgY2FzZSAnUmVsYXRpb24nOlxuICAgICAgcmV0dXJuIGByZWxhdGlvbjwke3RhcmdldENsYXNzfT5gO1xuICAgIGNhc2UgJ051bWJlcic6XG4gICAgICByZXR1cm4gJ251bWJlcic7XG4gICAgY2FzZSAnU3RyaW5nJzpcbiAgICAgIHJldHVybiAnc3RyaW5nJztcbiAgICBjYXNlICdCb29sZWFuJzpcbiAgICAgIHJldHVybiAnYm9vbGVhbic7XG4gICAgY2FzZSAnRGF0ZSc6XG4gICAgICByZXR1cm4gJ2RhdGUnO1xuICAgIGNhc2UgJ09iamVjdCc6XG4gICAgICByZXR1cm4gJ29iamVjdCc7XG4gICAgY2FzZSAnQXJyYXknOlxuICAgICAgcmV0dXJuICdhcnJheSc7XG4gICAgY2FzZSAnR2VvUG9pbnQnOlxuICAgICAgcmV0dXJuICdnZW9wb2ludCc7XG4gICAgY2FzZSAnRmlsZSc6XG4gICAgICByZXR1cm4gJ2ZpbGUnO1xuICAgIGNhc2UgJ0J5dGVzJzpcbiAgICAgIHJldHVybiAnYnl0ZXMnO1xuICAgIGNhc2UgJ1BvbHlnb24nOlxuICAgICAgcmV0dXJuICdwb2x5Z29uJztcbiAgfVxufVxuXG5jbGFzcyBNb25nb1NjaGVtYUNvbGxlY3Rpb24ge1xuICBfY29sbGVjdGlvbjogTW9uZ29Db2xsZWN0aW9uO1xuXG4gIGNvbnN0cnVjdG9yKGNvbGxlY3Rpb246IE1vbmdvQ29sbGVjdGlvbikge1xuICAgIHRoaXMuX2NvbGxlY3Rpb24gPSBjb2xsZWN0aW9uO1xuICB9XG5cbiAgX2ZldGNoQWxsU2NoZW1hc0Zyb21fU0NIRU1BKCkge1xuICAgIHJldHVybiB0aGlzLl9jb2xsZWN0aW9uXG4gICAgICAuX3Jhd0ZpbmQoe30pXG4gICAgICAudGhlbihzY2hlbWFzID0+IHNjaGVtYXMubWFwKG1vbmdvU2NoZW1hVG9QYXJzZVNjaGVtYSkpO1xuICB9XG5cbiAgX2ZldGNoT25lU2NoZW1hRnJvbV9TQ0hFTUEobmFtZTogc3RyaW5nKSB7XG4gICAgcmV0dXJuIHRoaXMuX2NvbGxlY3Rpb25cbiAgICAgIC5fcmF3RmluZChfbW9uZ29TY2hlbWFRdWVyeUZyb21OYW1lUXVlcnkobmFtZSksIHsgbGltaXQ6IDEgfSlcbiAgICAgIC50aGVuKHJlc3VsdHMgPT4ge1xuICAgICAgICBpZiAocmVzdWx0cy5sZW5ndGggPT09IDEpIHtcbiAgICAgICAgICByZXR1cm4gbW9uZ29TY2hlbWFUb1BhcnNlU2NoZW1hKHJlc3VsdHNbMF0pO1xuICAgICAgICB9IGVsc2Uge1xuICAgICAgICAgIHRocm93IHVuZGVmaW5lZDtcbiAgICAgICAgfVxuICAgICAgfSk7XG4gIH1cblxuICAvLyBBdG9taWNhbGx5IGZpbmQgYW5kIGRlbGV0ZSBhbiBvYmplY3QgYmFzZWQgb24gcXVlcnkuXG4gIGZpbmRBbmREZWxldGVTY2hlbWEobmFtZTogc3RyaW5nKSB7XG4gICAgcmV0dXJuIHRoaXMuX2NvbGxlY3Rpb24uX21vbmdvQ29sbGVjdGlvbi5maW5kQW5kUmVtb3ZlKFxuICAgICAgX21vbmdvU2NoZW1hUXVlcnlGcm9tTmFtZVF1ZXJ5KG5hbWUpLFxuICAgICAgW11cbiAgICApO1xuICB9XG5cbiAgaW5zZXJ0U2NoZW1hKHNjaGVtYTogYW55KSB7XG4gICAgcmV0dXJuIHRoaXMuX2NvbGxlY3Rpb25cbiAgICAgIC5pbnNlcnRPbmUoc2NoZW1hKVxuICAgICAgLnRoZW4ocmVzdWx0ID0+IG1vbmdvU2NoZW1hVG9QYXJzZVNjaGVtYShyZXN1bHQub3BzWzBdKSlcbiAgICAgIC5jYXRjaChlcnJvciA9PiB7XG4gICAgICAgIGlmIChlcnJvci5jb2RlID09PSAxMTAwMCkge1xuICAgICAgICAgIC8vTW9uZ28ncyBkdXBsaWNhdGUga2V5IGVycm9yXG4gICAgICAgICAgdGhyb3cgbmV3IFBhcnNlLkVycm9yKFxuICAgICAgICAgICAgUGFyc2UuRXJyb3IuRFVQTElDQVRFX1ZBTFVFLFxuICAgICAgICAgICAgJ0NsYXNzIGFscmVhZHkgZXhpc3RzLidcbiAgICAgICAgICApO1xuICAgICAgICB9IGVsc2Uge1xuICAgICAgICAgIHRocm93IGVycm9yO1xuICAgICAgICB9XG4gICAgICB9KTtcbiAgfVxuXG4gIHVwZGF0ZVNjaGVtYShuYW1lOiBzdHJpbmcsIHVwZGF0ZSkge1xuICAgIHJldHVybiB0aGlzLl9jb2xsZWN0aW9uLnVwZGF0ZU9uZShcbiAgICAgIF9tb25nb1NjaGVtYVF1ZXJ5RnJvbU5hbWVRdWVyeShuYW1lKSxcbiAgICAgIHVwZGF0ZVxuICAgICk7XG4gIH1cblxuICB1cHNlcnRTY2hlbWEobmFtZTogc3RyaW5nLCBxdWVyeTogc3RyaW5nLCB1cGRhdGUpIHtcbiAgICByZXR1cm4gdGhpcy5fY29sbGVjdGlvbi51cHNlcnRPbmUoXG4gICAgICBfbW9uZ29TY2hlbWFRdWVyeUZyb21OYW1lUXVlcnkobmFtZSwgcXVlcnkpLFxuICAgICAgdXBkYXRlXG4gICAgKTtcbiAgfVxuXG4gIC8vIEFkZCBhIGZpZWxkIHRvIHRoZSBzY2hlbWEuIElmIGRhdGFiYXNlIGRvZXMgbm90IHN1cHBvcnQgdGhlIGZpZWxkXG4gIC8vIHR5cGUgKGUuZy4gbW9uZ28gZG9lc24ndCBzdXBwb3J0IG1vcmUgdGhhbiBvbmUgR2VvUG9pbnQgaW4gYSBjbGFzcykgcmVqZWN0IHdpdGggYW4gXCJJbmNvcnJlY3QgVHlwZVwiXG4gIC8vIFBhcnNlIGVycm9yIHdpdGggYSBkZXNjaXB0aXZlIG1lc3NhZ2UuIElmIHRoZSBmaWVsZCBhbHJlYWR5IGV4aXN0cywgdGhpcyBmdW5jdGlvbiBtdXN0XG4gIC8vIG5vdCBtb2RpZnkgdGhlIHNjaGVtYSwgYW5kIG11c3QgcmVqZWN0IHdpdGggRFVQTElDQVRFX1ZBTFVFIGVycm9yLlxuICAvLyBJZiB0aGlzIGlzIGNhbGxlZCBmb3IgYSBjbGFzcyB0aGF0IGRvZXNuJ3QgZXhpc3QsIHRoaXMgZnVuY3Rpb24gbXVzdCBjcmVhdGUgdGhhdCBjbGFzcy5cblxuICAvLyBUT0RPOiB0aHJvdyBhbiBlcnJvciBpZiBhbiB1bnN1cHBvcnRlZCBmaWVsZCB0eXBlIGlzIHBhc3NlZC4gRGVjaWRpbmcgd2hldGhlciBhIHR5cGUgaXMgc3VwcG9ydGVkXG4gIC8vIHNob3VsZCBiZSB0aGUgam9iIG9mIHRoZSBhZGFwdGVyLiBTb21lIGFkYXB0ZXJzIG1heSBub3Qgc3VwcG9ydCBHZW9Qb2ludCBhdCBhbGwuIE90aGVycyBtYXlcbiAgLy8gU3VwcG9ydCBhZGRpdGlvbmFsIHR5cGVzIHRoYXQgTW9uZ28gZG9lc24ndCwgbGlrZSBNb25leSwgb3Igc29tZXRoaW5nLlxuXG4gIC8vIFRPRE86IGRvbid0IHNwZW5kIGFuIGV4dHJhIHF1ZXJ5IG9uIGZpbmRpbmcgdGhlIHNjaGVtYSBpZiB0aGUgdHlwZSB3ZSBhcmUgdHJ5aW5nIHRvIGFkZCBpc24ndCBhIEdlb1BvaW50LlxuICBhZGRGaWVsZElmTm90RXhpc3RzKGNsYXNzTmFtZTogc3RyaW5nLCBmaWVsZE5hbWU6IHN0cmluZywgZmllbGRUeXBlOiBzdHJpbmcpIHtcbiAgICByZXR1cm4gdGhpcy5fZmV0Y2hPbmVTY2hlbWFGcm9tX1NDSEVNQShjbGFzc05hbWUpXG4gICAgICAudGhlbihcbiAgICAgICAgc2NoZW1hID0+IHtcbiAgICAgICAgICAvLyBJZiBhIGZpZWxkIHdpdGggdGhpcyBuYW1lIGFscmVhZHkgZXhpc3RzLCBpdCB3aWxsIGJlIGhhbmRsZWQgZWxzZXdoZXJlLlxuICAgICAgICAgIGlmIChzY2hlbWEuZmllbGRzW2ZpZWxkTmFtZV0gIT0gdW5kZWZpbmVkKSB7XG4gICAgICAgICAgICByZXR1cm47XG4gICAgICAgICAgfVxuICAgICAgICAgIC8vIFRoZSBzY2hlbWEgZXhpc3RzLiBDaGVjayBmb3IgZXhpc3RpbmcgR2VvUG9pbnRzLlxuICAgICAgICAgIGlmIChmaWVsZFR5cGUudHlwZSA9PT0gJ0dlb1BvaW50Jykge1xuICAgICAgICAgICAgLy8gTWFrZSBzdXJlIHRoZXJlIGFyZSBub3Qgb3RoZXIgZ2VvcG9pbnQgZmllbGRzXG4gICAgICAgICAgICBpZiAoXG4gICAgICAgICAgICAgIE9iamVjdC5rZXlzKHNjaGVtYS5maWVsZHMpLnNvbWUoXG4gICAgICAgICAgICAgICAgZXhpc3RpbmdGaWVsZCA9PlxuICAgICAgICAgICAgICAgICAgc2NoZW1hLmZpZWxkc1tleGlzdGluZ0ZpZWxkXS50eXBlID09PSAnR2VvUG9pbnQnXG4gICAgICAgICAgICAgIClcbiAgICAgICAgICAgICkge1xuICAgICAgICAgICAgICB0aHJvdyBuZXcgUGFyc2UuRXJyb3IoXG4gICAgICAgICAgICAgICAgUGFyc2UuRXJyb3IuSU5DT1JSRUNUX1RZUEUsXG4gICAgICAgICAgICAgICAgJ01vbmdvREIgb25seSBzdXBwb3J0cyBvbmUgR2VvUG9pbnQgZmllbGQgaW4gYSBjbGFzcy4nXG4gICAgICAgICAgICAgICk7XG4gICAgICAgICAgICB9XG4gICAgICAgICAgfVxuICAgICAgICAgIHJldHVybjtcbiAgICAgICAgfSxcbiAgICAgICAgZXJyb3IgPT4ge1xuICAgICAgICAgIC8vIElmIGVycm9yIGlzIHVuZGVmaW5lZCwgdGhlIHNjaGVtYSBkb2Vzbid0IGV4aXN0LCBhbmQgd2UgY2FuIGNyZWF0ZSB0aGUgc2NoZW1hIHdpdGggdGhlIGZpZWxkLlxuICAgICAgICAgIC8vIElmIHNvbWUgb3RoZXIgZXJyb3IsIHJlamVjdCB3aXRoIGl0LlxuICAgICAgICAgIGlmIChlcnJvciA9PT0gdW5kZWZpbmVkKSB7XG4gICAgICAgICAgICByZXR1cm47XG4gICAgICAgICAgfVxuICAgICAgICAgIHRocm93IGVycm9yO1xuICAgICAgICB9XG4gICAgICApXG4gICAgICAudGhlbigoKSA9PiB7XG4gICAgICAgIGNvbnN0IHsgdHlwZSwgdGFyZ2V0Q2xhc3MsIC4uLmZpZWxkT3B0aW9ucyB9ID0gZmllbGRUeXBlO1xuICAgICAgICAvLyBXZSB1c2UgJGV4aXN0cyBhbmQgJHNldCB0byBhdm9pZCBvdmVyd3JpdGluZyB0aGUgZmllbGQgdHlwZSBpZiBpdFxuICAgICAgICAvLyBhbHJlYWR5IGV4aXN0cy4gKGl0IGNvdWxkIGhhdmUgYWRkZWQgaW5iZXR3ZWVuIHRoZSBsYXN0IHF1ZXJ5IGFuZCB0aGUgdXBkYXRlKVxuICAgICAgICBpZiAoZmllbGRPcHRpb25zICYmIE9iamVjdC5rZXlzKGZpZWxkT3B0aW9ucykubGVuZ3RoID4gMCkge1xuICAgICAgICAgIHJldHVybiB0aGlzLnVwc2VydFNjaGVtYShcbiAgICAgICAgICAgIGNsYXNzTmFtZSxcbiAgICAgICAgICAgIHsgW2ZpZWxkTmFtZV06IHsgJGV4aXN0czogZmFsc2UgfSB9LFxuICAgICAgICAgICAge1xuICAgICAgICAgICAgICAkc2V0OiB7XG4gICAgICAgICAgICAgICAgW2ZpZWxkTmFtZV06IHBhcnNlRmllbGRUeXBlVG9Nb25nb0ZpZWxkVHlwZSh7XG4gICAgICAgICAgICAgICAgICB0eXBlLFxuICAgICAgICAgICAgICAgICAgdGFyZ2V0Q2xhc3MsXG4gICAgICAgICAgICAgICAgfSksXG4gICAgICAgICAgICAgICAgW2BfbWV0YWRhdGEuZmllbGRzX29wdGlvbnMuJHtmaWVsZE5hbWV9YF06IGZpZWxkT3B0aW9ucyxcbiAgICAgICAgICAgICAgfSxcbiAgICAgICAgICAgIH1cbiAgICAgICAgICApO1xuICAgICAgICB9IGVsc2Uge1xuICAgICAgICAgIHJldHVybiB0aGlzLnVwc2VydFNjaGVtYShcbiAgICAgICAgICAgIGNsYXNzTmFtZSxcbiAgICAgICAgICAgIHsgW2ZpZWxkTmFtZV06IHsgJGV4aXN0czogZmFsc2UgfSB9LFxuICAgICAgICAgICAge1xuICAgICAgICAgICAgICAkc2V0OiB7XG4gICAgICAgICAgICAgICAgW2ZpZWxkTmFtZV06IHBhcnNlRmllbGRUeXBlVG9Nb25nb0ZpZWxkVHlwZSh7XG4gICAgICAgICAgICAgICAgICB0eXBlLFxuICAgICAgICAgICAgICAgICAgdGFyZ2V0Q2xhc3MsXG4gICAgICAgICAgICAgICAgfSksXG4gICAgICAgICAgICAgIH0sXG4gICAgICAgICAgICB9XG4gICAgICAgICAgKTtcbiAgICAgICAgfVxuICAgICAgfSk7XG4gIH1cbn1cblxuLy8gRXhwb3J0ZWQgZm9yIHRlc3RpbmcgcmVhc29ucyBhbmQgYmVjYXVzZSB3ZSBoYXZlbid0IG1vdmVkIGFsbCBtb25nbyBzY2hlbWEgZm9ybWF0XG4vLyByZWxhdGVkIGxvZ2ljIGludG8gdGhlIGRhdGFiYXNlIGFkYXB0ZXIgeWV0LlxuTW9uZ29TY2hlbWFDb2xsZWN0aW9uLl9URVNUbW9uZ29TY2hlbWFUb1BhcnNlU2NoZW1hID0gbW9uZ29TY2hlbWFUb1BhcnNlU2NoZW1hO1xuTW9uZ29TY2hlbWFDb2xsZWN0aW9uLnBhcnNlRmllbGRUeXBlVG9Nb25nb0ZpZWxkVHlwZSA9IHBhcnNlRmllbGRUeXBlVG9Nb25nb0ZpZWxkVHlwZTtcblxuZXhwb3J0IGRlZmF1bHQgTW9uZ29TY2hlbWFDb2xsZWN0aW9uO1xuIl19