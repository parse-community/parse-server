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
    // eslint-disable-next-line no-unused-vars
    const {
      type,
      targetClass
    } = fieldType,
          fieldOptions = _objectWithoutProperties(fieldType, ["type", "targetClass"]);

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
//# sourceMappingURL=data:application/json;charset=utf-8;base64,eyJ2ZXJzaW9uIjozLCJzb3VyY2VzIjpbIi4uLy4uLy4uLy4uL3NyYy9BZGFwdGVycy9TdG9yYWdlL01vbmdvL01vbmdvU2NoZW1hQ29sbGVjdGlvbi5qcyJdLCJuYW1lcyI6WyJtb25nb0ZpZWxkVG9QYXJzZVNjaGVtYUZpZWxkIiwidHlwZSIsInRhcmdldENsYXNzIiwic2xpY2UiLCJzdGFydHNXaXRoIiwibGVuZ3RoIiwibm9uRmllbGRTY2hlbWFLZXlzIiwibW9uZ29TY2hlbWFGaWVsZHNUb1BhcnNlU2NoZW1hRmllbGRzIiwic2NoZW1hIiwiZmllbGROYW1lcyIsIk9iamVjdCIsImtleXMiLCJmaWx0ZXIiLCJrZXkiLCJpbmRleE9mIiwicmVzcG9uc2UiLCJyZWR1Y2UiLCJvYmoiLCJmaWVsZE5hbWUiLCJfbWV0YWRhdGEiLCJmaWVsZHNfb3B0aW9ucyIsImFzc2lnbiIsIkFDTCIsImNyZWF0ZWRBdCIsInVwZGF0ZWRBdCIsIm9iamVjdElkIiwiZW1wdHlDTFBTIiwiZnJlZXplIiwiZmluZCIsImNvdW50IiwiZ2V0IiwiY3JlYXRlIiwidXBkYXRlIiwiZGVsZXRlIiwiYWRkRmllbGQiLCJwcm90ZWN0ZWRGaWVsZHMiLCJkZWZhdWx0Q0xQUyIsIm1vbmdvU2NoZW1hVG9QYXJzZVNjaGVtYSIsIm1vbmdvU2NoZW1hIiwiY2xwcyIsImluZGV4ZXMiLCJjbGFzc19wZXJtaXNzaW9ucyIsImNsYXNzTmFtZSIsIl9pZCIsImZpZWxkcyIsImNsYXNzTGV2ZWxQZXJtaXNzaW9ucyIsIl9tb25nb1NjaGVtYVF1ZXJ5RnJvbU5hbWVRdWVyeSIsIm5hbWUiLCJxdWVyeSIsIm9iamVjdCIsImZvckVhY2giLCJwYXJzZUZpZWxkVHlwZVRvTW9uZ29GaWVsZFR5cGUiLCJNb25nb1NjaGVtYUNvbGxlY3Rpb24iLCJjb25zdHJ1Y3RvciIsImNvbGxlY3Rpb24iLCJfY29sbGVjdGlvbiIsIl9mZXRjaEFsbFNjaGVtYXNGcm9tX1NDSEVNQSIsIl9yYXdGaW5kIiwidGhlbiIsInNjaGVtYXMiLCJtYXAiLCJfZmV0Y2hPbmVTY2hlbWFGcm9tX1NDSEVNQSIsImxpbWl0IiwicmVzdWx0cyIsInVuZGVmaW5lZCIsImZpbmRBbmREZWxldGVTY2hlbWEiLCJfbW9uZ29Db2xsZWN0aW9uIiwiZmluZE9uZUFuZERlbGV0ZSIsImluc2VydFNjaGVtYSIsImluc2VydE9uZSIsInJlc3VsdCIsIm9wcyIsImNhdGNoIiwiZXJyb3IiLCJjb2RlIiwiUGFyc2UiLCJFcnJvciIsIkRVUExJQ0FURV9WQUxVRSIsInVwZGF0ZVNjaGVtYSIsInVwZGF0ZU9uZSIsInVwc2VydFNjaGVtYSIsInVwc2VydE9uZSIsImFkZEZpZWxkSWZOb3RFeGlzdHMiLCJmaWVsZFR5cGUiLCJzb21lIiwiZXhpc3RpbmdGaWVsZCIsIklOQ09SUkVDVF9UWVBFIiwiZmllbGRPcHRpb25zIiwiJGV4aXN0cyIsIiRzZXQiLCJ1cGRhdGVGaWVsZE9wdGlvbnMiLCJfVEVTVG1vbmdvU2NoZW1hVG9QYXJzZVNjaGVtYSJdLCJtYXBwaW5ncyI6Ijs7Ozs7OztBQUFBOztBQUNBOzs7Ozs7Ozs7Ozs7OztBQUVBLFNBQVNBLDRCQUFULENBQXNDQyxJQUF0QyxFQUE0QztBQUMxQyxNQUFJQSxJQUFJLENBQUMsQ0FBRCxDQUFKLEtBQVksR0FBaEIsRUFBcUI7QUFDbkIsV0FBTztBQUNMQSxNQUFBQSxJQUFJLEVBQUUsU0FERDtBQUVMQyxNQUFBQSxXQUFXLEVBQUVELElBQUksQ0FBQ0UsS0FBTCxDQUFXLENBQVg7QUFGUixLQUFQO0FBSUQ7O0FBQ0QsTUFBSUYsSUFBSSxDQUFDRyxVQUFMLENBQWdCLFdBQWhCLENBQUosRUFBa0M7QUFDaEMsV0FBTztBQUNMSCxNQUFBQSxJQUFJLEVBQUUsVUFERDtBQUVMQyxNQUFBQSxXQUFXLEVBQUVELElBQUksQ0FBQ0UsS0FBTCxDQUFXLFlBQVlFLE1BQXZCLEVBQStCSixJQUFJLENBQUNJLE1BQUwsR0FBYyxDQUE3QztBQUZSLEtBQVA7QUFJRDs7QUFDRCxVQUFRSixJQUFSO0FBQ0UsU0FBSyxRQUFMO0FBQ0UsYUFBTztBQUFFQSxRQUFB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QUEsSUFBSSxFQUFFO0FBQ0osYUFBQ3ZFLFNBQUQsR0FBYWlDLDhCQUE4QixDQUFDO0FBQzFDbEQsY0FBQUEsSUFEMEM7QUFFMUNDLGNBQUFBO0FBRjBDLGFBQUQ7QUFEdkM7QUFEUixTQUhLLENBQVA7QUFZRDtBQUNGLEtBaEVJLENBQVA7QUFpRUQ7O0FBRXVCLFFBQWxCd0Ysa0JBQWtCLENBQUNoRCxTQUFELEVBQW9CeEIsU0FBcEIsRUFBdUNpRSxTQUF2QyxFQUEwRDtBQUNoRjtBQUNBLFVBQU07QUFBRWxGLE1BQUFBLElBQUY7QUFBUUMsTUFBQUE7QUFBUixRQUF5Q2lGLFNBQS9DO0FBQUEsVUFBOEJJLFlBQTlCLDRCQUErQ0osU0FBL0M7O0FBQ0EsVUFBTSxLQUFLSCxZQUFMLENBQ0p0QyxTQURJLEVBRUo7QUFBRSxPQUFDeEIsU0FBRCxHQUFhO0FBQUVzRSxRQUFBQSxPQUFPLEVBQUU7QUFBWDtBQUFmLEtBRkksRUFHSjtBQUNFQyxNQUFBQSxJQUFJLEVBQUU7QUFDSixTQUFFLDRCQUEyQnZFLFNBQVUsRUFBdkMsR0FBMkNxRTtBQUR2QztBQURSLEtBSEksQ0FBTjtBQVNEOztBQTdJeUIsQyxDQWdKNUI7QUFDQTs7O0FBQ0FuQyxxQkFBcUIsQ0FBQ3VDLDZCQUF0QixHQUFzRHRELHdCQUF0RDtBQUNBZSxxQkFBcUIsQ0FBQ0QsOEJBQXRCLEdBQXVEQSw4QkFBdkQ7ZUFFZUMscUIiLCJzb3VyY2VzQ29udGVudCI6WyJpbXBvcnQgTW9uZ29Db2xsZWN0aW9uIGZyb20gJy4vTW9uZ29Db2xsZWN0aW9uJztcbmltcG9ydCBQYXJzZSBmcm9tICdwYXJzZS9ub2RlJztcblxuZnVuY3Rpb24gbW9uZ29GaWVsZFRvUGFyc2VTY2hlbWFGaWVsZCh0eXBlKSB7XG4gIGlmICh0eXBlWzBdID09PSAnKicpIHtcbiAgICByZXR1cm4ge1xuICAgICAgdHlwZTogJ1BvaW50ZXInLFxuICAgICAgdGFyZ2V0Q2xhc3M6IHR5cGUuc2xpY2UoMSksXG4gICAgfTtcbiAgfVxuICBpZiAodHlwZS5zdGFydHNXaXRoKCdyZWxhdGlvbjwnKSkge1xuICAgIHJldHVybiB7XG4gICAgICB0eXBlOiAnUmVsYXRpb24nLFxuICAgICAgdGFyZ2V0Q2xhc3M6IHR5cGUuc2xpY2UoJ3JlbGF0aW9uPCcubGVuZ3RoLCB0eXBlLmxlbmd0aCAtIDEpLFxuICAgIH07XG4gIH1cbiAgc3dpdGNoICh0eXBlKSB7XG4gICAgY2FzZSAnbnVtYmVyJzpcbiAgICAgIHJldHVybiB7IHR5cGU6ICdOdW1iZXInIH07XG4gICAgY2FzZSAnc3RyaW5nJzpcbiAgICAgIHJldHVybiB7IHR5cGU6ICdTdHJpbmcnIH07XG4gICAgY2FzZSAnYm9vbGVhbic6XG4gICAgICByZXR1cm4geyB0eXBlOiAnQm9vbGVhbicgfTtcbiAgICBjYXNlICdkYXRlJzpcbiAgICAgIHJldHVybiB7IHR5cGU6ICdEYXRlJyB9O1xuICAgIGNhc2UgJ21hcCc6XG4gICAgY2FzZSAnb2JqZWN0JzpcbiAgICAgIHJldHVybiB7IHR5cGU6ICdPYmplY3QnIH07XG4gICAgY2FzZSAnYXJyYXknOlxuICAgICAgcmV0dXJuIHsgdHlwZTogJ0FycmF5JyB9O1xuICAgIGNhc2UgJ2dlb3BvaW50JzpcbiAgICAgIHJldHVybiB7IHR5cGU6ICdHZW9Qb2ludCcgfTtcbiAgICBjYXNlICdmaWxlJzpcbiAgICAgIHJldHVybiB7IHR5cGU6ICdGaWxlJyB9O1xuICAgIGNhc2UgJ2J5dGVzJzpcbiAgICAgIHJldHVybiB7IHR5cGU6ICdCeXRlcycgfTtcbiAgICBjYXNlICdwb2x5Z29uJzpcbiAgICAgIHJldHVybiB7IHR5cGU6ICdQb2x5Z29uJyB9O1xuICB9XG59XG5cbmNvbnN0IG5vbkZpZWxkU2NoZW1hS2V5cyA9IFsnX2lkJywgJ19tZXRhZGF0YScsICdfY2xpZW50X3Blcm1pc3Npb25zJ107XG5mdW5jdGlvbiBtb25nb1NjaGVtYUZpZWxkc1RvUGFyc2VTY2hlbWFGaWVsZHMoc2NoZW1hKSB7XG4gIHZhciBmaWVsZE5hbWVzID0gT2JqZWN0LmtleXMoc2NoZW1hKS5maWx0ZXIoa2V5ID0+IG5vbkZpZWxkU2NoZW1hS2V5cy5pbmRleE9mKGtleSkgPT09IC0xKTtcbiAgdmFyIHJlc3BvbnNlID0gZmllbGROYW1lcy5yZWR1Y2UoKG9iaiwgZmllbGROYW1lKSA9PiB7XG4gICAgb2JqW2ZpZWxkTmFtZV0gPSBtb25nb0ZpZWxkVG9QYXJzZVNjaGVtYUZpZWxkKHNjaGVtYVtmaWVsZE5hbWVdKTtcbiAgICBpZiAoXG4gICAgICBzY2hlbWEuX21ldGFkYXRhICYmXG4gICAgICBzY2hlbWEuX21ldGFkYXRhLmZpZWxkc19vcHRpb25zICYmXG4gICAgICBzY2hlbWEuX21ldGFkYXRhLmZpZWxkc19vcHRpb25zW2ZpZWxkTmFtZV1cbiAgICApIHtcbiAgICAgIG9ialtmaWVsZE5hbWVdID0gT2JqZWN0LmFzc2lnbihcbiAgICAgICAge30sXG4gICAgICAgIG9ialtmaWVsZE5hbWVdLFxuICAgICAgICBzY2hlbWEuX21ldGFkYXRhLmZpZWxkc19vcHRpb25zW2ZpZWxkTmFtZV1cbiAgICAgICk7XG4gICAgfVxuICAgIHJldHVybiBvYmo7XG4gIH0sIHt9KTtcbiAgcmVzcG9uc2UuQUNMID0geyB0eXBlOiAnQUNMJyB9O1xuICByZXNwb25zZS5jcmVhdGVkQXQgPSB7IHR5cGU6ICdEYXRlJyB9O1xuICByZXNwb25zZS51cGRhdGVkQXQgPSB7IHR5cGU6ICdEYXRlJyB9O1xuICByZXNwb25zZS5vYmplY3RJZCA9IHsgdHlwZTogJ1N0cmluZycgfTtcbiAgcmV0dXJuIHJlc3BvbnNlO1xufVxuXG5jb25zdCBlbXB0eUNMUFMgPSBPYmplY3QuZnJlZXplKHtcbiAgZmluZDoge30sXG4gIGNvdW50OiB7fSxcbiAgZ2V0OiB7fSxcbiAgY3JlYXRlOiB7fSxcbiAgdXBkYXRlOiB7fSxcbiAgZGVsZXRlOiB7fSxcbiAgYWRkRmllbGQ6IHt9LFxuICBwcm90ZWN0ZWRGaWVsZHM6IHt9LFxufSk7XG5cbmNvbnN0IGRlZmF1bHRDTFBTID0gT2JqZWN0LmZyZWV6ZSh7XG4gIGZpbmQ6IHsgJyonOiB0cnVlIH0sXG4gIGNvdW50OiB7ICcqJzogdHJ1ZSB9LFxuICBnZXQ6IHsgJyonOiB0cnVlIH0sXG4gIGNyZWF0ZTogeyAnKic6IHRydWUgfSxcbiAgdXBkYXRlOiB7ICcqJzogdHJ1ZSB9LFxuICBkZWxldGU6IHsgJyonOiB0cnVlIH0sXG4gIGFkZEZpZWxkOiB7ICcqJzogdHJ1ZSB9LFxuICBwcm90ZWN0ZWRGaWVsZHM6IHsgJyonOiBbXSB9LFxufSk7XG5cbmZ1bmN0aW9uIG1vbmdvU2NoZW1hVG9QYXJzZVNjaGVtYShtb25nb1NjaGVtYSkge1xuICBsZXQgY2xwcyA9IGRlZmF1bHRDTFBTO1xuICBsZXQgaW5kZXhlcyA9IHt9O1xuICBpZiAobW9uZ29TY2hlbWEuX21ldGFkYXRhKSB7XG4gICAgaWYgKG1vbmdvU2NoZW1hLl9tZXRhZGF0YS5jbGFzc19wZXJtaXNzaW9ucykge1xuICAgICAgY2xwcyA9IHsgLi4uZW1wdHlDTFBTLCAuLi5tb25nb1NjaGVtYS5fbWV0YWRhdGEuY2xhc3NfcGVybWlzc2lvbnMgfTtcbiAgICB9XG4gICAgaWYgKG1vbmdvU2NoZW1hLl9tZXRhZGF0YS5pbmRleGVzKSB7XG4gICAgICBpbmRleGVzID0geyAuLi5tb25nb1NjaGVtYS5fbWV0YWRhdGEuaW5kZXhlcyB9O1xuICAgIH1cbiAgfVxuICByZXR1cm4ge1xuICAgIGNsYXNzTmFtZTogbW9uZ29TY2hlbWEuX2lkLFxuICAgIGZpZWxkczogbW9uZ29TY2hlbWFGaWVsZHNUb1BhcnNlU2NoZW1hRmllbGRzKG1vbmdvU2NoZW1hKSxcbiAgICBjbGFzc0xldmVsUGVybWlzc2lvbnM6IGNscHMsXG4gICAgaW5kZXhlczogaW5kZXhlcyxcbiAgfTtcbn1cblxuZnVuY3Rpb24gX21vbmdvU2NoZW1hUXVlcnlGcm9tTmFtZVF1ZXJ5KG5hbWU6IHN0cmluZywgcXVlcnkpIHtcbiAgY29uc3Qgb2JqZWN0ID0geyBfaWQ6IG5hbWUgfTtcbiAgaWYgKHF1ZXJ5KSB7XG4gICAgT2JqZWN0LmtleXMocXVlcnkpLmZvckVhY2goa2V5ID0+IHtcbiAgICAgIG9iamVjdFtrZXldID0gcXVlcnlba2V5XTtcbiAgICB9KTtcbiAgfVxuICByZXR1cm4gb2JqZWN0O1xufVxuXG4vLyBSZXR1cm5zIGEgdHlwZSBzdWl0YWJsZSBmb3IgaW5zZXJ0aW5nIGludG8gbW9uZ28gX1NDSEVNQSBjb2xsZWN0aW9uLlxuLy8gRG9lcyBubyB2YWxpZGF0aW9uLiBUaGF0IGlzIGV4cGVjdGVkIHRvIGJlIGRvbmUgaW4gUGFyc2UgU2VydmVyLlxuZnVuY3Rpb24gcGFyc2VGaWVsZFR5cGVUb01vbmdvRmllbGRUeXBlKHsgdHlwZSwgdGFyZ2V0Q2xhc3MgfSkge1xuICBzd2l0Y2ggKHR5cGUpIHtcbiAgICBjYXNlICdQb2ludGVyJzpcbiAgICAgIHJldHVybiBgKiR7dGFyZ2V0Q2xhc3N9YDtcbiAgICBjYXNlICdSZWxhdGlvbic6XG4gICAgICByZXR1cm4gYHJlbGF0aW9uPCR7dGFyZ2V0Q2xhc3N9PmA7XG4gICAgY2FzZSAnTnVtYmVyJzpcbiAgICAgIHJldHVybiAnbnVtYmVyJztcbiAgICBjYXNlICdTdHJpbmcnOlxuICAgICAgcmV0dXJuICdzdHJpbmcnO1xuICAgIGNhc2UgJ0Jvb2xlYW4nOlxuICAgICAgcmV0dXJuICdib29sZWFuJztcbiAgICBjYXNlICdEYXRlJzpcbiAgICAgIHJldHVybiAnZGF0ZSc7XG4gICAgY2FzZSAnT2JqZWN0JzpcbiAgICAgIHJldHVybiAnb2JqZWN0JztcbiAgICBjYXNlICdBcnJheSc6XG4gICAgICByZXR1cm4gJ2FycmF5JztcbiAgICBjYXNlICdHZW9Qb2ludCc6XG4gICAgICByZXR1cm4gJ2dlb3BvaW50JztcbiAgICBjYXNlICdGaWxlJzpcbiAgICAgIHJldHVybiAnZmlsZSc7XG4gICAgY2FzZSAnQnl0ZXMnOlxuICAgICAgcmV0dXJuICdieXRlcyc7XG4gICAgY2FzZSAnUG9seWdvbic6XG4gICAgICByZXR1cm4gJ3BvbHlnb24nO1xuICB9XG59XG5cbmNsYXNzIE1vbmdvU2NoZW1hQ29sbGVjdGlvbiB7XG4gIF9jb2xsZWN0aW9uOiBNb25nb0NvbGxlY3Rpb247XG5cbiAgY29uc3RydWN0b3IoY29sbGVjdGlvbjogTW9uZ29Db2xsZWN0aW9uKSB7XG4gICAgdGhpcy5fY29sbGVjdGlvbiA9IGNvbGxlY3Rpb247XG4gIH1cblxuICBfZmV0Y2hBbGxTY2hlbWFzRnJvbV9TQ0hFTUEoKSB7XG4gICAgcmV0dXJuIHRoaXMuX2NvbGxlY3Rpb24uX3Jhd0ZpbmQoe30pLnRoZW4oc2NoZW1hcyA9PiBzY2hlbWFzLm1hcChtb25nb1NjaGVtYVRvUGFyc2VTY2hlbWEpKTtcbiAgfVxuXG4gIF9mZXRjaE9uZVNjaGVtYUZyb21fU0NIRU1BKG5hbWU6IHN0cmluZykge1xuICAgIHJldHVybiB0aGlzLl9jb2xsZWN0aW9uXG4gICAgICAuX3Jhd0ZpbmQoX21vbmdvU2NoZW1hUXVlcnlGcm9tTmFtZVF1ZXJ5KG5hbWUpLCB7IGxpbWl0OiAxIH0pXG4gICAgICAudGhlbihyZXN1bHRzID0+IHtcbiAgICAgICAgaWYgKHJlc3VsdHMubGVuZ3RoID09PSAxKSB7XG4gICAgICAgICAgcmV0dXJuIG1vbmdvU2NoZW1hVG9QYXJzZVNjaGVtYShyZXN1bHRzWzBdKTtcbiAgICAgICAgfSBlbHNlIHtcbiAgICAgICAgICB0aHJvdyB1bmRlZmluZWQ7XG4gICAgICAgIH1cbiAgICAgIH0pO1xuICB9XG5cbiAgLy8gQXRvbWljYWxseSBmaW5kIGFuZCBkZWxldGUgYW4gb2JqZWN0IGJhc2VkIG9uIHF1ZXJ5LlxuICBmaW5kQW5kRGVsZXRlU2NoZW1hKG5hbWU6IHN0cmluZykge1xuICAgIHJldHVybiB0aGlzLl9jb2xsZWN0aW9uLl9tb25nb0NvbGxlY3Rpb24uZmluZE9uZUFuZERlbGV0ZShfbW9uZ29TY2hlbWFRdWVyeUZyb21OYW1lUXVlcnkobmFtZSkpO1xuICB9XG5cbiAgaW5zZXJ0U2NoZW1hKHNjaGVtYTogYW55KSB7XG4gICAgcmV0dXJuIHRoaXMuX2NvbGxlY3Rpb25cbiAgICAgIC5pbnNlcnRPbmUoc2NoZW1hKVxuICAgICAgLnRoZW4ocmVzdWx0ID0+IG1vbmdvU2NoZW1hVG9QYXJzZVNjaGVtYShyZXN1bHQub3BzWzBdKSlcbiAgICAgIC5jYXRjaChlcnJvciA9PiB7XG4gICAgICAgIGlmIChlcnJvci5jb2RlID09PSAxMTAwMCkge1xuICAgICAgICAgIC8vTW9uZ28ncyBkdXBsaWNhdGUga2V5IGVycm9yXG4gICAgICAgICAgdGhyb3cgbmV3IFBhcnNlLkVycm9yKFBhcnNlLkVycm9yLkRVUExJQ0FURV9WQUxVRSwgJ0NsYXNzIGFscmVhZHkgZXhpc3RzLicpO1xuICAgICAgICB9IGVsc2Uge1xuICAgICAgICAgIHRocm93IGVycm9yO1xuICAgICAgICB9XG4gICAgICB9KTtcbiAgfVxuXG4gIHVwZGF0ZVNjaGVtYShuYW1lOiBzdHJpbmcsIHVwZGF0ZSkge1xuICAgIHJldHVybiB0aGlzLl9jb2xsZWN0aW9uLnVwZGF0ZU9uZShfbW9uZ29TY2hlbWFRdWVyeUZyb21OYW1lUXVlcnkobmFtZSksIHVwZGF0ZSk7XG4gIH1cblxuICB1cHNlcnRTY2hlbWEobmFtZTogc3RyaW5nLCBxdWVyeTogc3RyaW5nLCB1cGRhdGUpIHtcbiAgICByZXR1cm4gdGhpcy5fY29sbGVjdGlvbi51cHNlcnRPbmUoX21vbmdvU2NoZW1hUXVlcnlGcm9tTmFtZVF1ZXJ5KG5hbWUsIHF1ZXJ5KSwgdXBkYXRlKTtcbiAgfVxuXG4gIC8vIEFkZCBhIGZpZWxkIHRvIHRoZSBzY2hlbWEuIElmIGRhdGFiYXNlIGRvZXMgbm90IHN1cHBvcnQgdGhlIGZpZWxkXG4gIC8vIHR5cGUgKGUuZy4gbW9uZ28gZG9lc24ndCBzdXBwb3J0IG1vcmUgdGhhbiBvbmUgR2VvUG9pbnQgaW4gYSBjbGFzcykgcmVqZWN0IHdpdGggYW4gXCJJbmNvcnJlY3QgVHlwZVwiXG4gIC8vIFBhcnNlIGVycm9yIHdpdGggYSBkZXNjaXB0aXZlIG1lc3NhZ2UuIElmIHRoZSBmaWVsZCBhbHJlYWR5IGV4aXN0cywgdGhpcyBmdW5jdGlvbiBtdXN0XG4gIC8vIG5vdCBtb2RpZnkgdGhlIHNjaGVtYSwgYW5kIG11c3QgcmVqZWN0IHdpdGggRFVQTElDQVRFX1ZBTFVFIGVycm9yLlxuICAvLyBJZiB0aGlzIGlzIGNhbGxlZCBmb3IgYSBjbGFzcyB0aGF0IGRvZXNuJ3QgZXhpc3QsIHRoaXMgZnVuY3Rpb24gbXVzdCBjcmVhdGUgdGhhdCBjbGFzcy5cblxuICAvLyBUT0RPOiB0aHJvdyBhbiBlcnJvciBpZiBhbiB1bnN1cHBvcnRlZCBmaWVsZCB0eXBlIGlzIHBhc3NlZC4gRGVjaWRpbmcgd2hldGhlciBhIHR5cGUgaXMgc3VwcG9ydGVkXG4gIC8vIHNob3VsZCBiZSB0aGUgam9iIG9mIHRoZSBhZGFwdGVyLiBTb21lIGFkYXB0ZXJzIG1heSBub3Qgc3VwcG9ydCBHZW9Qb2ludCBhdCBhbGwuIE90aGVycyBtYXlcbiAgLy8gU3VwcG9ydCBhZGRpdGlvbmFsIHR5cGVzIHRoYXQgTW9uZ28gZG9lc24ndCwgbGlrZSBNb25leSwgb3Igc29tZXRoaW5nLlxuXG4gIC8vIFRPRE86IGRvbid0IHNwZW5kIGFuIGV4dHJhIHF1ZXJ5IG9uIGZpbmRpbmcgdGhlIHNjaGVtYSBpZiB0aGUgdHlwZSB3ZSBhcmUgdHJ5aW5nIHRvIGFkZCBpc24ndCBhIEdlb1BvaW50LlxuICBhZGRGaWVsZElmTm90RXhpc3RzKGNsYXNzTmFtZTogc3RyaW5nLCBmaWVsZE5hbWU6IHN0cmluZywgZmllbGRUeXBlOiBzdHJpbmcpIHtcbiAgICByZXR1cm4gdGhpcy5fZmV0Y2hPbmVTY2hlbWFGcm9tX1NDSEVNQShjbGFzc05hbWUpXG4gICAgICAudGhlbihcbiAgICAgICAgc2NoZW1hID0+IHtcbiAgICAgICAgICAvLyBJZiBhIGZpZWxkIHdpdGggdGhpcyBuYW1lIGFscmVhZHkgZXhpc3RzLCBpdCB3aWxsIGJlIGhhbmRsZWQgZWxzZXdoZXJlLlxuICAgICAgICAgIGlmIChzY2hlbWEuZmllbGRzW2ZpZWxkTmFtZV0gIT09IHVuZGVmaW5lZCkge1xuICAgICAgICAgICAgcmV0dXJuO1xuICAgICAgICAgIH1cbiAgICAgICAgICAvLyBUaGUgc2NoZW1hIGV4aXN0cy4gQ2hlY2sgZm9yIGV4aXN0aW5nIEdlb1BvaW50cy5cbiAgICAgICAgICBpZiAoZmllbGRUeXBlLnR5cGUgPT09ICdHZW9Qb2ludCcpIHtcbiAgICAgICAgICAgIC8vIE1ha2Ugc3VyZSB0aGVyZSBhcmUgbm90IG90aGVyIGdlb3BvaW50IGZpZWxkc1xuICAgICAgICAgICAgaWYgKFxuICAgICAgICAgICAgICBPYmplY3Qua2V5cyhzY2hlbWEuZmllbGRzKS5zb21lKFxuICAgICAgICAgICAgICAgIGV4aXN0aW5nRmllbGQgPT4gc2NoZW1hLmZpZWxkc1tleGlzdGluZ0ZpZWxkXS50eXBlID09PSAnR2VvUG9pbnQnXG4gICAgICAgICAgICAgIClcbiAgICAgICAgICAgICkge1xuICAgICAgICAgICAgICB0aHJvdyBuZXcgUGFyc2UuRXJyb3IoXG4gICAgICAgICAgICAgICAgUGFyc2UuRXJyb3IuSU5DT1JSRUNUX1RZUEUsXG4gICAgICAgICAgICAgICAgJ01vbmdvREIgb25seSBzdXBwb3J0cyBvbmUgR2VvUG9pbnQgZmllbGQgaW4gYSBjbGFzcy4nXG4gICAgICAgICAgICAgICk7XG4gICAgICAgICAgICB9XG4gICAgICAgICAgfVxuICAgICAgICAgIHJldHVybjtcbiAgICAgICAgfSxcbiAgICAgICAgZXJyb3IgPT4ge1xuICAgICAgICAgIC8vIElmIGVycm9yIGlzIHVuZGVmaW5lZCwgdGhlIHNjaGVtYSBkb2Vzbid0IGV4aXN0LCBhbmQgd2UgY2FuIGNyZWF0ZSB0aGUgc2NoZW1hIHdpdGggdGhlIGZpZWxkLlxuICAgICAgICAgIC8vIElmIHNvbWUgb3RoZXIgZXJyb3IsIHJlamVjdCB3aXRoIGl0LlxuICAgICAgICAgIGlmIChlcnJvciA9PT0gdW5kZWZpbmVkKSB7XG4gICAgICAgICAgICByZXR1cm47XG4gICAgICAgICAgfVxuICAgICAgICAgIHRocm93IGVycm9yO1xuICAgICAgICB9XG4gICAgICApXG4gICAgICAudGhlbigoKSA9PiB7XG4gICAgICAgIGNvbnN0IHsgdHlwZSwgdGFyZ2V0Q2xhc3MsIC4uLmZpZWxkT3B0aW9ucyB9ID0gZmllbGRUeXBlO1xuICAgICAgICAvLyBXZSB1c2UgJGV4aXN0cyBhbmQgJHNldCB0byBhdm9pZCBvdmVyd3JpdGluZyB0aGUgZmllbGQgdHlwZSBpZiBpdFxuICAgICAgICAvLyBhbHJlYWR5IGV4aXN0cy4gKGl0IGNvdWxkIGhhdmUgYWRkZWQgaW5iZXR3ZWVuIHRoZSBsYXN0IHF1ZXJ5IGFuZCB0aGUgdXBkYXRlKVxuICAgICAgICBpZiAoZmllbGRPcHRpb25zICYmIE9iamVjdC5rZXlzKGZpZWxkT3B0aW9ucykubGVuZ3RoID4gMCkge1xuICAgICAgICAgIHJldHVybiB0aGlzLnVwc2VydFNjaGVtYShcbiAgICAgICAgICAgIGNsYXNzTmFtZSxcbiAgICAgICAgICAgIHsgW2ZpZWxkTmFtZV06IHsgJGV4aXN0czogZmFsc2UgfSB9LFxuICAgICAgICAgICAge1xuICAgICAgICAgICAgICAkc2V0OiB7XG4gICAgICAgICAgICAgICAgW2ZpZWxkTmFtZV06IHBhcnNlRmllbGRUeXBlVG9Nb25nb0ZpZWxkVHlwZSh7XG4gICAgICAgICAgICAgICAgICB0eXBlLFxuICAgICAgICAgICAgICAgICAgdGFyZ2V0Q2xhc3MsXG4gICAgICAgICAgICAgICAgfSksXG4gICAgICAgICAgICAgICAgW2BfbWV0YWRhdGEuZmllbGRzX29wdGlvbnMuJHtmaWVsZE5hbWV9YF06IGZpZWxkT3B0aW9ucyxcbiAgICAgICAgICAgICAgfSxcbiAgICAgICAgICAgIH1cbiAgICAgICAgICApO1xuICAgICAgICB9IGVsc2Uge1xuICAgICAgICAgIHJldHVybiB0aGlzLnVwc2VydFNjaGVtYShcbiAgICAgICAgICAgIGNsYXNzTmFtZSxcbiAgICAgICAgICAgIHsgW2ZpZWxkTmFtZV06IHsgJGV4aXN0czogZmFsc2UgfSB9LFxuICAgICAgICAgICAge1xuICAgICAgICAgICAgICAkc2V0OiB7XG4gICAgICAgICAgICAgICAgW2ZpZWxkTmFtZV06IHBhcnNlRmllbGRUeXBlVG9Nb25nb0ZpZWxkVHlwZSh7XG4gICAgICAgICAgICAgICAgICB0eXBlLFxuICAgICAgICAgICAgICAgICAgdGFyZ2V0Q2xhc3MsXG4gICAgICAgICAgICAgICAgfSksXG4gICAgICAgICAgICAgIH0sXG4gICAgICAgICAgICB9XG4gICAgICAgICAgKTtcbiAgICAgICAgfVxuICAgICAgfSk7XG4gIH1cblxuICBhc3luYyB1cGRhdGVGaWVsZE9wdGlvbnMoY2xhc3NOYW1lOiBzdHJpbmcsIGZpZWxkTmFtZTogc3RyaW5nLCBmaWVsZFR5cGU6IHN0cmluZykge1xuICAgIC8vIGVzbGludC1kaXNhYmxlLW5leHQtbGluZSBuby11bnVzZWQtdmFyc1xuICAgIGNvbnN0IHsgdHlwZSwgdGFyZ2V0Q2xhc3MsIC4uLmZpZWxkT3B0aW9ucyB9ID0gZmllbGRUeXBlO1xuICAgIGF3YWl0IHRoaXMudXBzZXJ0U2NoZW1hKFxuICAgICAgY2xhc3NOYW1lLFxuICAgICAgeyBbZmllbGROYW1lXTogeyAkZXhpc3RzOiB0cnVlIH0gfSxcbiAgICAgIHtcbiAgICAgICAgJHNldDoge1xuICAgICAgICAgIFtgX21ldGFkYXRhLmZpZWxkc19vcHRpb25zLiR7ZmllbGROYW1lfWBdOiBmaWVsZE9wdGlvbnMsXG4gICAgICAgIH0sXG4gICAgICB9XG4gICAgKTtcbiAgfVxufVxuXG4vLyBFeHBvcnRlZCBmb3IgdGVzdGluZyByZWFzb25zIGFuZCBiZWNhdXNlIHdlIGhhdmVuJ3QgbW92ZWQgYWxsIG1vbmdvIHNjaGVtYSBmb3JtYXRcbi8vIHJlbGF0ZWQgbG9naWMgaW50byB0aGUgZGF0YWJhc2UgYWRhcHRlciB5ZXQuXG5Nb25nb1NjaGVtYUNvbGxlY3Rpb24uX1RFU1Rtb25nb1NjaGVtYVRvUGFyc2VTY2hlbWEgPSBtb25nb1NjaGVtYVRvUGFyc2VTY2hlbWE7XG5Nb25nb1NjaGVtYUNvbGxlY3Rpb24ucGFyc2VGaWVsZFR5cGVUb01vbmdvRmllbGRUeXBlID0gcGFyc2VGaWVsZFR5cGVUb01vbmdvRmllbGRUeXBlO1xuXG5leHBvcnQgZGVmYXVsdCBNb25nb1NjaGVtYUNvbGxlY3Rpb247XG4iXX0=