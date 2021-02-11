"use strict";

Object.defineProperty(exports, "__esModule", {
  value: true
});
Object.defineProperty(exports, "extractKeysAndInclude", {
  enumerable: true,
  get: function () {
    return _parseGraphQLUtils.extractKeysAndInclude;
  }
});
exports.load = void 0;

var _graphql = require("graphql");

var _graphqlRelay = require("graphql-relay");

var _graphqlListFields = _interopRequireDefault(require("graphql-list-fields"));

var defaultGraphQLTypes = _interopRequireWildcard(require("./defaultGraphQLTypes"));

var objectsQueries = _interopRequireWildcard(require("../helpers/objectsQueries"));

var _ParseGraphQLController = require("../../Controllers/ParseGraphQLController");

var _className = require("../transformers/className");

var _inputType = require("../transformers/inputType");

var _outputType = require("../transformers/outputType");

var _constraintType = require("../transformers/constraintType");

var _parseGraphQLUtils = require("../parseGraphQLUtils");

function _getRequireWildcardCache() { if (typeof WeakMap !== "function") return null; var cache = new WeakMap(); _getRequireWildcardCache = function () { return cache; }; return cache; }

function _interopRequireWildcard(obj) { if (obj && obj.__esModule) { return obj; } if (obj === null || typeof obj !== "object" && typeof obj !== "function") { return { default: obj }; } var cache = _getRequireWildcardCache(); if (cache && cache.has(obj)) { return cache.get(obj); } var newObj = {}; var hasPropertyDescriptor = Object.defineProperty && Object.getOwnPropertyDescriptor; for (var key in obj) { if (Object.prototype.hasOwnProperty.call(obj, key)) { var desc = hasPropertyDescriptor ? Object.getOwnPropertyDescriptor(obj, key) : null; if (desc && (desc.get || desc.set)) { Object.defineProperty(newObj, key, desc); } else { newObj[key] = obj[key]; } } } newObj.default = obj; if (cache) { cache.set(obj, newObj); } return newObj; }

function _interopRequireDefault(obj) { return obj && obj.__esModule ? obj : { default: obj }; }

function ownKeys(object, enumerableOnly) { var keys = Object.keys(object); if (Object.getOwnPropertySymbols) { var symbols = Object.getOwnPropertySymbols(object); if (enumerableOnly) symbols = symbols.filter(function (sym) { return Object.getOwnPropertyDescriptor(object, sym).enumerable; }); keys.push.apply(keys, symbols); } return keys; }

function _objectSpread(target) { for (var i = 1; i < arguments.length; i++) { var source = arguments[i] != null ? arguments[i] : {}; if (i % 2) { ownKeys(Object(source), true).forEach(function (key) { _defineProperty(target, key, source[key]); }); } else if (Object.getOwnPropertyDescriptors) { Object.defineProperties(target, Object.getOwnPropertyDescriptors(source)); } else { ownKeys(Object(source)).forEach(function (key) { Object.defineProperty(target, key, Object.getOwnPropertyDescriptor(source, key)); }); } } return target; }

function _defineProperty(obj, key, value) { if (key in obj) { Object.defineProperty(obj, key, { value: value, enumerable: true, configurable: true, writable: true }); } else { obj[key] = value; } return obj; }

const getParseClassTypeConfig = function (parseClassConfig) {
  return parseClassConfig && parseClassConfig.type || {};
};

const getInputFieldsAndConstraints = function (parseClass, parseClassConfig) {
  const classFields = Object.keys(parseClass.fields).concat('id');
  const {
    inputFields: allowedInputFields,
    outputFields: allowedOutputFields,
    constraintFields: allowedConstraintFields,
    sortFields: allowedSortFields
  } = getParseClassTypeConfig(parseClassConfig);
  let classOutputFields;
  let classCreateFields;
  let classUpdateFields;
  let classConstraintFields;
  let classSortFields; // All allowed customs fields

  const classCustomFields = classFields.filter(field => {
    return !Object.keys(defaultGraphQLTypes.PARSE_OBJECT_FIELDS).includes(field) && field !== 'id';
  });

  if (allowedInputFields && allowedInputFields.create) {
    classCreateFields = classCustomFields.filter(field => {
      return allowedInputFields.create.includes(field);
    });
  } else {
    classCreateFields = classCustomFields;
  }

  if (allowedInputFields && allowedInputFields.update) {
    classUpdateFields = classCustomFields.filter(field => {
      return allowedInputFields.update.includes(field);
    });
  } else {
    classUpdateFields = classCustomFields;
  }

  if (allowedOutputFields) {
    classOutputFields = classCustomFields.filter(field => {
      return allowedOutputFields.includes(field);
    });
  } else {
    classOutputFields = classCustomFields;
  } // Filters the "password" field from class _User


  if (parseClass.className === '_User') {
    classOutputFields = classOutputFields.filter(outputField => outputField !== 'password');
  }

  if (allowedConstraintFields) {
    classConstraintFields = classCustomFields.filter(field => {
      return allowedConstraintFields.includes(field);
    });
  } else {
    classConstraintFields = classFields;
  }

  if (allowedSortFields) {
    classSortFields = allowedSortFields;

    if (!classSortFields.length) {
      // must have at least 1 order field
      // otherwise the FindArgs Input Type will throw.
      classSortFields.push({
        field: 'id',
        asc: true,
        desc: true
      });
    }
  } else {
    classSortFields = classFields.map(field => {
      return {
        field,
        asc: true,
        desc: true
      };
    });
  }

  return {
    classCreateFields,
    classUpdateFields,
    classConstraintFields,
    classOutputFields,
    classSortFields
  };
};

const load = (parseGraphQLSchema, parseClass, parseClassConfig) => {
  const className = parseClass.className;
  const graphQLClassName = (0, _className.transformClassNameToGraphQL)(className);
  const {
    classCreateFields,
    classUpdateFields,
    classOutputFields,
    classConstraintFields,
    classSortFields
  } = getInputFieldsAndConstraints(parseClass, parseClassConfig);
  const {
    create: isCreateEnabled = true,
    update: isUpdateEnabled = true
  } = (0, _parseGraphQLUtils.getParseClassMutationConfig)(parseClassConfig);
  const classGraphQLCreateTypeName = `Create${graphQLClassName}FieldsInput`;
  let classGraphQLCreateType = new _graphql.GraphQLInputObjectType({
    name: classGraphQLCreateTypeName,
    description: `The ${classGraphQLCreateTypeName} input type is used in operations that involve creation of objects in the ${graphQLClassName} class.`,
    fields: () => classCreateFields.reduce((fields, field) => {
      const type = (0, _inputType.transformInputTypeToGraphQL)(parseClass.fields[field].type, parseClass.fields[field].targetClass, parseGraphQLSchema.parseClassTypes);

      if (type) {
        return _objectSpread(_objectSpread({}, fields), {}, {
          [field]: {
            description: `This is the object ${field}.`,
            type: className === '_User' && (field === 'username' || field === 'password') || parseClass.fields[field].required ? new _graphql.GraphQLNonNull(type) : type
          }
        });
      } else {
        return fields;
      }
    }, {
      ACL: {
        type: defaultGraphQLTypes.ACL_INPUT
      }
    })
  });
  classGraphQLCreateType = parseGraphQLSchema.addGraphQLType(classGraphQLCreateType);
  const classGraphQLUpdateTypeName = `Update${graphQLClassName}FieldsInput`;
  let classGraphQLUpdateType = new _graphql.GraphQLInputObjectType({
    name: classGraphQLUpdateTypeName,
    description: `The ${classGraphQLUpdateTypeName} input type is used in operations that involve creation of objects in the ${graphQLClassName} class.`,
    fields: () => classUpdateFields.reduce((fields, field) => {
      const type = (0, _inputType.transformInputTypeToGraphQL)(parseClass.fields[field].type, parseClass.fields[field].targetClass, parseGraphQLSchema.parseClassTypes);

      if (type) {
        return _objectSpread(_objectSpread({}, fields), {}, {
          [field]: {
            description: `This is the object ${field}.`,
            type
          }
        });
      } else {
        return fields;
      }
    }, {
      ACL: {
        type: defaultGraphQLTypes.ACL_INPUT
      }
    })
  });
  classGraphQLUpdateType = parseGraphQLSchema.addGraphQLType(classGraphQLUpdateType);
  const classGraphQLPointerTypeName = `${graphQLClassName}PointerInput`;
  let classGraphQLPointerType = new _graphql.GraphQLInputObjectType({
    name: classGraphQLPointerTypeName,
    description: `Allow to link OR add and link an object of the ${graphQLClassName} class.`,
    fields: () => {
      const fields = {
        link: {
          description: `Link an existing object from ${graphQLClassName} class. You can use either the global or the object id.`,
          type: _graphql.GraphQLID
        }
      };

      if (isCreateEnabled) {
        fields['createAndLink'] = {
          description: `Create and link an object from ${graphQLClassName} class.`,
          type: classGraphQLCreateType
        };
      }

      return fields;
    }
  });
  classGraphQLPointerType = parseGraphQLSchema.addGraphQLType(classGraphQLPointerType) || defaultGraphQLTypes.OBJECT;
  const classGraphQLRelationTypeName = `${graphQLClassName}RelationInput`;
  let classGraphQLRelationType = new _graphql.GraphQLInputObjectType({
    name: classGraphQLRelationTypeName,
    description: `Allow to add, remove, createAndAdd objects of the ${graphQLClassName} class into a relation field.`,
    fields: () => {
      const fields = {
        add: {
          description: `Add existing objects from the ${graphQLClassName} class into the relation. You can use either the global or the object ids.`,
          type: new _graphql.GraphQLList(defaultGraphQLTypes.OBJECT_ID)
        },
        remove: {
          description: `Remove existing objects from the ${graphQLClassName} class out of the relation. You can use either the global or the object ids.`,
          type: new _graphql.GraphQLList(defaultGraphQLTypes.OBJECT_ID)
        }
      };

      if (isCreateEnabled) {
        fields['createAndAdd'] = {
          description: `Create and add objects of the ${graphQLClassName} class into the relation.`,
          type: new _graphql.GraphQLList(new _graphql.GraphQLNonNull(classGraphQLCreateType))
        };
      }

      return fields;
    }
  });
  classGraphQLRelationType = parseGraphQLSchema.addGraphQLType(classGraphQLRelationType) || defaultGraphQLTypes.OBJECT;
  const classGraphQLConstraintsTypeName = `${graphQLClassName}WhereInput`;
  let classGraphQLConstraintsType = new _graphql.GraphQLInputObjectType({
    name: classGraphQLConstraintsTypeName,
    description: `The ${classGraphQLConstraintsTypeName} input type is used in operations that involve filtering objects of ${graphQLClassName} class.`,
    fields: () => _objectSpread(_objectSpread({}, classConstraintFields.reduce((fields, field) => {
      if (['OR', 'AND', 'NOR'].includes(field)) {
        parseGraphQLSchema.log.warn(`Field ${field} could not be added to the auto schema ${classGraphQLConstraintsTypeName} because it collided with an existing one.`);
        return fields;
      }

      const parseField = field === 'id' ? 'objectId' : field;
      const type = (0, _constraintType.transformConstraintTypeToGraphQL)(parseClass.fields[parseField].type, parseClass.fields[parseField].targetClass, parseGraphQLSchema.parseClassTypes, field);

      if (type) {
        return _objectSpread(_objectSpread({}, fields), {}, {
          [field]: {
            description: `This is the object ${field}.`,
            type
          }
        });
      } else {
        return fields;
      }
    }, {})), {}, {
      OR: {
        description: 'This is the OR operator to compound constraints.',
        type: new _graphql.GraphQLList(new _graphql.GraphQLNonNull(classGraphQLConstraintsType))
      },
      AND: {
        description: 'This is the AND operator to compound constraints.',
        type: new _graphql.GraphQLList(new _graphql.GraphQLNonNull(classGraphQLConstraintsType))
      },
      NOR: {
        description: 'This is the NOR operator to compound constraints.',
        type: new _graphql.GraphQLList(new _graphql.GraphQLNonNull(classGraphQLConstraintsType))
      }
    })
  });
  classGraphQLConstraintsType = parseGraphQLSchema.addGraphQLType(classGraphQLConstraintsType) || defaultGraphQLTypes.OBJECT;
  const classGraphQLRelationConstraintsTypeName = `${graphQLClassName}RelationWhereInput`;
  let classGraphQLRelationConstraintsType = new _graphql.GraphQLInputObjectType({
    name: classGraphQLRelationConstraintsTypeName,
    description: `The ${classGraphQLRelationConstraintsTypeName} input type is used in operations that involve filtering objects of ${graphQLClassName} class.`,
    fields: () => ({
      have: {
        description: 'Run a relational/pointer query where at least one child object can match.',
        type: classGraphQLConstraintsType
      },
      haveNot: {
        description: 'Run an inverted relational/pointer query where at least one child object can match.',
        type: classGraphQLConstraintsType
      },
      exists: {
        description: 'Check if the relation/pointer contains objects.',
        type: _graphql.GraphQLBoolean
      }
    })
  });
  classGraphQLRelationConstraintsType = parseGraphQLSchema.addGraphQLType(classGraphQLRelationConstraintsType) || defaultGraphQLTypes.OBJECT;
  const classGraphQLOrderTypeName = `${graphQLClassName}Order`;
  let classGraphQLOrderType = new _graphql.GraphQLEnumType({
    name: classGraphQLOrderTypeName,
    description: `The ${classGraphQLOrderTypeName} input type is used when sorting objects of the ${graphQLClassName} class.`,
    values: classSortFields.reduce((sortFields, fieldConfig) => {
      const {
        field,
        asc,
        desc
      } = fieldConfig;

      const updatedSortFields = _objectSpread({}, sortFields);

      const value = field === 'id' ? 'objectId' : field;

      if (asc) {
        updatedSortFields[`${field}_ASC`] = {
          value
        };
      }

      if (desc) {
        updatedSortFields[`${field}_DESC`] = {
          value: `-${value}`
        };
      }

      return updatedSortFields;
    }, {})
  });
  classGraphQLOrderType = parseGraphQLSchema.addGraphQLType(classGraphQLOrderType);

  const classGraphQLFindArgs = _objectSpread(_objectSpread({
    where: {
      description: 'These are the conditions that the objects need to match in order to be found.',
      type: classGraphQLConstraintsType
    },
    order: {
      description: 'The fields to be used when sorting the data fetched.',
      type: classGraphQLOrderType ? new _graphql.GraphQLList(new _graphql.GraphQLNonNull(classGraphQLOrderType)) : _graphql.GraphQLString
    },
    skip: defaultGraphQLTypes.SKIP_ATT
  }, _graphqlRelay.connectionArgs), {}, {
    options: defaultGraphQLTypes.READ_OPTIONS_ATT
  });

  const classGraphQLOutputTypeName = `${graphQLClassName}`;
  const interfaces = [defaultGraphQLTypes.PARSE_OBJECT, parseGraphQLSchema.relayNodeInterface];

  const parseObjectFields = _objectSpread({
    id: (0, _graphqlRelay.globalIdField)(className, obj => obj.objectId)
  }, defaultGraphQLTypes.PARSE_OBJECT_FIELDS);

  const outputFields = () => {
    return classOutputFields.reduce((fields, field) => {
      const type = (0, _outputType.transformOutputTypeToGraphQL)(parseClass.fields[field].type, parseClass.fields[field].targetClass, parseGraphQLSchema.parseClassTypes);

      if (parseClass.fields[field].type === 'Relation') {
        const targetParseClassTypes = parseGraphQLSchema.parseClassTypes[parseClass.fields[field].targetClass];
        const args = targetParseClassTypes ? targetParseClassTypes.classGraphQLFindArgs : undefined;
        return _objectSpread(_objectSpread({}, fields), {}, {
          [field]: {
            description: `This is the object ${field}.`,
            args,
            type: parseClass.fields[field].required ? new _graphql.GraphQLNonNull(type) : type,

            async resolve(source, args, context, queryInfo) {
              try {
                const {
                  where,
                  order,
                  skip,
                  first,
                  after,
                  last,
                  before,
                  options
                } = args;
                const {
                  readPreference,
                  includeReadPreference,
                  subqueryReadPreference
                } = options || {};
                const {
                  config,
                  auth,
                  info
                } = context;
                const selectedFields = (0, _graphqlListFields.default)(queryInfo);
                const {
                  keys,
                  include
                } = (0, _parseGraphQLUtils.extractKeysAndInclude)(selectedFields.filter(field => field.startsWith('edges.node.')).map(field => field.replace('edges.node.', '')));
                const parseOrder = order && order.join(',');
                return objectsQueries.findObjects(source[field].className, _objectSpread({
                  $relatedTo: {
                    object: {
                      __type: 'Pointer',
                      className: className,
                      objectId: source.objectId
                    },
                    key: field
                  }
                }, where || {}), parseOrder, skip, first, after, last, before, keys, include, false, readPreference, includeReadPreference, subqueryReadPreference, config, auth, info, selectedFields, parseGraphQLSchema.parseClasses);
              } catch (e) {
                parseGraphQLSchema.handleError(e);
              }
            }

          }
        });
      } else if (parseClass.fields[field].type === 'Polygon') {
        return _objectSpread(_objectSpread({}, fields), {}, {
          [field]: {
            description: `This is the object ${field}.`,
            type: parseClass.fields[field].required ? new _graphql.GraphQLNonNull(type) : type,

            async resolve(source) {
              if (source[field] && source[field].coordinates) {
                return source[field].coordinates.map(coordinate => ({
                  latitude: coordinate[0],
                  longitude: coordinate[1]
                }));
              } else {
                return null;
              }
            }

          }
        });
      } else if (parseClass.fields[field].type === 'Array') {
        return _objectSpread(_objectSpread({}, fields), {}, {
          [field]: {
            description: `Use Inline Fragment on Array to get results: https://graphql.org/learn/queries/#inline-fragments`,
            type: parseClass.fields[field].required ? new _graphql.GraphQLNonNull(type) : type,

            async resolve(source) {
              if (!source[field]) return null;
              return source[field].map(async elem => {
                if (elem.className && elem.objectId && elem.__type === 'Object') {
                  return elem;
                } else {
                  return {
                    value: elem
                  };
                }
              });
            }

          }
        });
      } else if (type) {
        return _objectSpread(_objectSpread({}, fields), {}, {
          [field]: {
            description: `This is the object ${field}.`,
            type: parseClass.fields[field].required ? new _graphql.GraphQLNonNull(type) : type
          }
        });
      } else {
        return fields;
      }
    }, parseObjectFields);
  };

  let classGraphQLOutputType = new _graphql.GraphQLObjectType({
    name: classGraphQLOutputTypeName,
    description: `The ${classGraphQLOutputTypeName} object type is used in operations that involve outputting objects of ${graphQLClassName} class.`,
    interfaces,
    fields: outputFields
  });
  classGraphQLOutputType = parseGraphQLSchema.addGraphQLType(classGraphQLOutputType);
  const {
    connectionType,
    edgeType
  } = (0, _graphqlRelay.connectionDefinitions)({
    name: graphQLClassName,
    connectionFields: {
      count: defaultGraphQLTypes.COUNT_ATT
    },
    nodeType: classGraphQLOutputType || defaultGraphQLTypes.OBJECT
  });
  let classGraphQLFindResultType = undefined;

  if (parseGraphQLSchema.addGraphQLType(edgeType) && parseGraphQLSchema.addGraphQLType(connectionType, false, false, true)) {
    classGraphQLFindResultType = connectionType;
  }

  parseGraphQLSchema.parseClassTypes[className] = {
    classGraphQLPointerType,
    classGraphQLRelationType,
    classGraphQLCreateType,
    classGraphQLUpdateType,
    classGraphQLConstraintsType,
    classGraphQLRelationConstraintsType,
    classGraphQLFindArgs,
    classGraphQLOutputType,
    classGraphQLFindResultType,
    config: {
      parseClassConfig,
      isCreateEnabled,
      isUpdateEnabled
    }
  };

  if (className === '_User') {
    const viewerType = new _graphql.GraphQLObjectType({
      name: 'Viewer',
      description: `The Viewer object type is used in operations that involve outputting the current user data.`,
      fields: () => ({
        sessionToken: defaultGraphQLTypes.SESSION_TOKEN_ATT,
        user: {
          description: 'This is the current user.',
          type: new _graphql.GraphQLNonNull(classGraphQLOutputType)
        }
      })
    });
    parseGraphQLSchema.addGraphQLType(viewerType, true, true);
    parseGraphQLSchema.viewerType = viewerType;
  }
};

exports.load = load;
//# sourceMappingURL=data:application/json;charset=utf-8;base64,eyJ2ZXJzaW9uIjozLCJzb3VyY2VzIjpbIi4uLy4uLy4uL3NyYy9HcmFwaFFML2xvYWRlcnMvcGFyc2VDbGFzc1R5cGVzLmpzIl0sIm5hbWVzIjpbImdldFBhcnNlQ2xhc3NUeXBlQ29uZmlnIiwicGFyc2VDbGFzc0NvbmZpZyIsInR5cGUiLCJnZXRJbnB1dEZpZWxkc0FuZENvbnN0cmFpbnRzIiwicGFyc2VDbGFzcyIsImNsYXNzRmllbGRzIiwiT2JqZWN0Iiwia2V5cyIsImZpZWxkcyIsImNvbmNhdCIsImlucHV0RmllbGRzIiwiYWxsb3dlZElucHV0RmllbGRzIiwib3V0cHV0RmllbGRzIiwiYWxsb3dlZE91dHB1dEZpZWxkcyIsImNvbnN0cmFpbnRGaWVsZHMiLCJhbGxvd2VkQ29uc3RyYWludEZpZWxkcyIsInNvcnRGaWVsZHMiLCJhbGxvd2VkU29ydEZpZWxkcyIsImNsYXNzT3V0cHV0RmllbGRzIiwiY2xhc3NDcmVhdGVGaWVsZHMiLCJjbGFzc1VwZGF0ZUZpZWxkcyIsImNsYXNzQ29uc3RyYWludEZpZWxkcyIsImNsYXNzU29ydEZpZWxkcyIsImNsYXNzQ3VzdG9tRmllbGRzIiwiZmlsdGVyIiwiZmllbGQiLCJkZWZhdWx0R3JhcGhRTFR5cGVzIiwiUEFSU0VfT0JKRUNUX0ZJRUxEUyIsImluY2x1ZGVzIiwiY3JlYXRlIiwidXBkYXRlIiwiY2xhc3NOYW1lIiwib3V0cHV0RmllbGQiLCJsZW5ndGgiLCJwdXNoIiwiYXNjIiwiZGVzYyIsIm1hcCIsImxvYWQiLCJwYXJzZUdyYXBoUUxTY2hlbWEiLCJncmFwaFFMQ2xhc3NOYW1lIiwiaXNDcmVhdGVFbmFibGVkIiwiaXNVcGRhdGVFbmFibGVkIiwiY2xhc3NHcmFwaFFMQ3JlYXRlVHlwZU5hbWUiLCJjbGFzc0dyYXBoUUxDcmVhdGVUeXBlIiwiR3JhcGhRTElucHV0T2JqZWN0VHlwZSIsIm5hbWUiLCJkZXNjcmlwdGlvbiIsInJlZHVjZSIsInRhcmdldENsYXNzIiwicGFyc2VDbGFzc1R5cGVzIiwicmVxdWlyZWQiLCJHcmFwaFFMTm9uTnVsbCIsIkFDTCIsIkFDTF9JTlBVVCIsImFkZEdyYXBoUUxUeXBlIiwiY2xhc3NHcmFwaFFMVXBkYXRlVHlwZU5hbWUiLCJjbGFzc0dyYXBoUUxVcGRhdGVUeXBlIiwiY2xhc3NHcmFwaFFMUG9pbnRlclR5cGVOYW1lIiwiY2xhc3NHcmFwaFFMUG9pbnRlclR5cGUiLCJsaW5rIiwiR3JhcGhRTElEIiwiT0JKRUNUIiwiY2xhc3NHcmFwaFFMUmVsYXRpb25UeXBlTmFtZSIsImNsYXNzR3JhcGhRTFJlbGF0aW9uVHlwZSIsImFkZCIsIkdyYXBoUUxMaXN0IiwiT0JKRUNUX0lEIiwicmVtb3ZlIiwiY2xhc3NHcmFwaFFMQ29uc3RyYWludHNUeXBlTmFtZSIsImNsYXNzR3JhcGhRTENvbnN0cmFpbnRzVHlwZSIsImxvZyIsIndhcm4iLCJwYXJzZUZpZWxkIiwiT1IiLCJBTkQiLCJOT1IiLCJjbGFzc0dyYXBoUUxSZWxhdGlvbkNvbnN0cmFpbnRzVHlwZU5hbWUiLCJjbGFzc0dyYXBoUUxSZWxhdGlvbkNvbnN0cmFpbnRzVHlwZSIsImhhdmUiLCJoYXZlTm90IiwiZXhpc3RzIiwiR3JhcGhRTEJvb2xlYW4iLCJjbGFzc0dyYXBoUUxPcmRlclR5cGVOYW1lIiwiY2xhc3NHcmFwaFFMT3JkZXJUeXBlIiwiR3JhcGhRTEVudW1UeXBlIiwidmFsdWVzIiwiZmllbGRDb25maWciLCJ1cGRhdGVkU29ydEZpZWxkcyIsInZhbHVlIiwiY2xhc3NHcmFwaFFMRmluZEFyZ3MiLCJ3aGVyZSIsIm9yZGVyIiwiR3JhcGhRTFN0cmluZyIsInNraXAiLCJTS0lQX0FUVCIsImNvbm5lY3Rpb25BcmdzIiwib3B0aW9ucyIsIlJFQURfT1BUSU9OU19BVFQiLCJjbGFzc0dyYXBoUUxPdXRwdXRUeXBlTmFtZSIsImludGVyZmFjZXMiLCJQQVJTRV9PQkpFQ1QiLCJyZWxheU5vZGVJbnRlcmZhY2UiLCJwYXJzZU9iamVjdEZpZWxkcyIsImlkIiwib2JqIiwib2JqZWN0SWQiLCJ0YXJnZXRQYXJzZUNsYXNzVHlwZXMiLCJhcmdzIiwidW5kZWZpbmVkIiwicmVzb2x2ZSIsInNvdXJjZSIsImNvbnRleHQiLCJxdWVyeUluZm8iLCJmaXJzdCIsImFmdGVyIiwibGFzdCIsImJlZm9yZSIsInJlYWRQcmVmZXJlbmNlIiwiaW5jbHVkZVJlYWRQcmVmZXJlbmNlIiwic3VicXVlcnlSZWFkUHJlZmVyZW5jZSIsImNvbmZpZyIsImF1dGgiLCJpbmZvIiwic2VsZWN0ZWRGaWVsZHMiLCJpbmNsdWRlIiwic3RhcnRzV2l0aCIsInJlcGxhY2UiLCJwYXJzZU9yZGVyIiwiam9pbiIsIm9iamVjdHNRdWVyaWVzIiwiZmluZE9iamVjdHMiLCIkcmVsYXRlZFRvIiwib2JqZWN0IiwiX190eXBlIiwia2V5IiwicGFyc2VDbGFzc2VzIiwiZSIsImhhbmRsZUVycm9yIiwiY29vcmRpbmF0ZXMiLCJjb29yZGluYXRlIiwibGF0aXR1ZGUiLCJsb25naXR1ZGUiLCJlbGVtIiwiY2xhc3NHcmFwaFFMT3V0cHV0VHlwZSIsIkdyYXBoUUxPYmplY3RUeXBlIiwiY29ubmVjdGlvblR5cGUiLCJlZGdlVHlwZSIsImNvbm5lY3Rpb25GaWVsZHMiLCJjb3VudCIsIkNPVU5UX0FUVCIsIm5vZGVUeXBlIiwiY2xhc3NHcmFwaFFMRmluZFJlc3VsdFR5cGUiLCJ2aWV3ZXJUeXBlIiwic2Vzc2lvblRva2VuIiwiU0VTU0lPTl9UT0tFTl9BVFQiLCJ1c2VyIl0sIm1hcHBpbmdzIjoiOzs7Ozs7Ozs7Ozs7O0FBQUE7O0FBVUE7O0FBQ0E7O0FBQ0E7O0FBQ0E7O0FBQ0E7O0FBQ0E7O0FBQ0E7O0FBQ0E7O0FBQ0E7O0FBQ0E7Ozs7Ozs7Ozs7Ozs7O0FBRUEsTUFBTUEsdUJBQXVCLEdBQUcsVUFBVUMsZ0JBQVYsRUFBc0Q7QUFDcEYsU0FBUUEsZ0JBQWdCLElBQUlBLGdCQUFnQixDQUFDQyxJQUF0QyxJQUErQyxFQUF0RDtBQUNELENBRkQ7O0FBSUEsTUFBTUMsNEJBQTRCLEdBQUcsVUFDbkNDLFVBRG1DLEVBRW5DSCxnQkFGbUMsRUFHbkM7QUFDQSxRQUFNSSxXQUFXLEdBQUdDLE1BQU0s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QixDQUFDVyxlQUFuQixDQUFtQ25CLFNBQW5DLElBQWdEO0FBQzlDNEIsSUFBQUEsdUJBRDhDO0FBRTlDSyxJQUFBQSx3QkFGOEM7QUFHOUNwQixJQUFBQSxzQkFIOEM7QUFJOUNhLElBQUFBLHNCQUo4QztBQUs5Q2EsSUFBQUEsMkJBTDhDO0FBTTlDUSxJQUFBQSxtQ0FOOEM7QUFPOUNZLElBQUFBLG9CQVA4QztBQVE5Q3NELElBQUFBLHNCQVI4QztBQVM5Q1EsSUFBQUEsMEJBVDhDO0FBVTlDL0IsSUFBQUEsTUFBTSxFQUFFO0FBQ054SCxNQUFBQSxnQkFETTtBQUVOd0MsTUFBQUEsZUFGTTtBQUdOQyxNQUFBQTtBQUhNO0FBVnNDLEdBQWhEOztBQWlCQSxNQUFJWCxTQUFTLEtBQUssT0FBbEIsRUFBMkI7QUFDekIsVUFBTTBILFVBQVUsR0FBRyxJQUFJUiwwQkFBSixDQUFzQjtBQUN2Q25HLE1BQUFBLElBQUksRUFBRSxRQURpQztBQUV2Q0MsTUFBQUEsV0FBVyxFQUFHLDZGQUZ5QjtBQUd2Q3ZDLE1BQUFBLE1BQU0sRUFBRSxPQUFPO0FBQ2JrSixRQUFBQSxZQUFZLEVBQUVoSSxtQkFBbUIsQ0FBQ2lJLGlCQURyQjtBQUViQyxRQUFBQSxJQUFJLEVBQUU7QUFDSjdHLFVBQUFBLFdBQVcsRUFBRSwyQkFEVDtBQUVKN0MsVUFBQUEsSUFBSSxFQUFFLElBQUlrRCx1QkFBSixDQUFtQjRGLHNCQUFuQjtBQUZGO0FBRk8sT0FBUDtBQUgrQixLQUF0QixDQUFuQjtBQVdBekcsSUFBQUEsa0JBQWtCLENBQUNnQixjQUFuQixDQUFrQ2tHLFVBQWxDLEVBQThDLElBQTlDLEVBQW9ELElBQXBEO0FBQ0FsSCxJQUFBQSxrQkFBa0IsQ0FBQ2tILFVBQW5CLEdBQWdDQSxVQUFoQztBQUNEO0FBQ0YsQ0FuYUQiLCJzb3VyY2VzQ29udGVudCI6WyJpbXBvcnQge1xuICBHcmFwaFFMSUQsXG4gIEdyYXBoUUxPYmplY3RUeXBlLFxuICBHcmFwaFFMU3RyaW5nLFxuICBHcmFwaFFMTGlzdCxcbiAgR3JhcGhRTElucHV0T2JqZWN0VHlwZSxcbiAgR3JhcGhRTE5vbk51bGwsXG4gIEdyYXBoUUxCb29sZWFuLFxuICBHcmFwaFFMRW51bVR5cGUsXG59IGZyb20gJ2dyYXBocWwnO1xuaW1wb3J0IHsgZ2xvYmFsSWRGaWVsZCwgY29ubmVjdGlvbkFyZ3MsIGNvbm5lY3Rpb25EZWZpbml0aW9ucyB9IGZyb20gJ2dyYXBocWwtcmVsYXknO1xuaW1wb3J0IGdldEZpZWxkTmFtZXMgZnJvbSAnZ3JhcGhxbC1saXN0LWZpZWxkcyc7XG5pbXBvcnQgKiBhcyBkZWZhdWx0R3JhcGhRTFR5cGVzIGZyb20gJy4vZGVmYXVsdEdyYXBoUUxUeXBlcyc7XG5pbXBvcnQgKiBhcyBvYmplY3RzUXVlcmllcyBmcm9tICcuLi9oZWxwZXJzL29iamVjdHNRdWVyaWVzJztcbmltcG9ydCB7IFBhcnNlR3JhcGhRTENsYXNzQ29uZmlnIH0gZnJvbSAnLi4vLi4vQ29udHJvbGxlcnMvUGFyc2VHcmFwaFFMQ29udHJvbGxlcic7XG5pbXBvcnQgeyB0cmFuc2Zvcm1DbGFzc05hbWVUb0dyYXBoUUwgfSBmcm9tICcuLi90cmFuc2Zvcm1lcnMvY2xhc3NOYW1lJztcbmltcG9ydCB7IHRyYW5zZm9ybUlucHV0VHlwZVRvR3JhcGhRTCB9IGZyb20gJy4uL3RyYW5zZm9ybWVycy9pbnB1dFR5cGUnO1xuaW1wb3J0IHsgdHJhbnNmb3JtT3V0cHV0VHlwZVRvR3JhcGhRTCB9IGZyb20gJy4uL3RyYW5zZm9ybWVycy9vdXRwdXRUeXBlJztcbmltcG9ydCB7IHRyYW5zZm9ybUNvbnN0cmFpbnRUeXBlVG9HcmFwaFFMIH0gZnJvbSAnLi4vdHJhbnNmb3JtZXJzL2NvbnN0cmFpbnRUeXBlJztcbmltcG9ydCB7IGV4dHJhY3RLZXlzQW5kSW5jbHVkZSwgZ2V0UGFyc2VDbGFzc011dGF0aW9uQ29uZmlnIH0gZnJvbSAnLi4vcGFyc2VHcmFwaFFMVXRpbHMnO1xuXG5jb25zdCBnZXRQYXJzZUNsYXNzVHlwZUNvbmZpZyA9IGZ1bmN0aW9uIChwYXJzZUNsYXNzQ29uZmlnOiA/UGFyc2VHcmFwaFFMQ2xhc3NDb25maWcpIHtcbiAgcmV0dXJuIChwYXJzZUNsYXNzQ29uZmlnICYmIHBhcnNlQ2xhc3NDb25maWcudHlwZSkgfHwge307XG59O1xuXG5jb25zdCBnZXRJbnB1dEZpZWxkc0FuZENvbnN0cmFpbnRzID0gZnVuY3Rpb24gKFxuICBwYXJzZUNsYXNzLFxuICBwYXJzZUNsYXNzQ29uZmlnOiA/UGFyc2VHcmFwaFFMQ2xhc3NDb25maWdcbikge1xuICBjb25zdCBjbGFzc0ZpZWxkcyA9IE9iamVjdC5rZXlzKHBhcnNlQ2xhc3MuZmllbGRzKS5jb25jYXQoJ2lkJyk7XG4gIGNvbnN0IHtcbiAgICBpbnB1dEZpZWxkczogYWxsb3dlZElucHV0RmllbGRzLFxuICAgIG91dHB1dEZpZWxkczogYWxsb3dlZE91dHB1dEZpZWxkcyxcbiAgICBjb25zdHJhaW50RmllbGRzOiBhbGxvd2VkQ29uc3RyYWludEZpZWxkcyxcbiAgICBzb3J0RmllbGRzOiBhbGxvd2VkU29ydEZpZWxkcyxcbiAgfSA9IGdldFBhcnNlQ2xhc3NUeXBlQ29uZmlnKHBhcnNlQ2xhc3NDb25maWcpO1xuXG4gIGxldCBjbGFzc091dHB1dEZpZWxkcztcbiAgbGV0IGNsYXNzQ3JlYXRlRmllbGRzO1xuICBsZXQgY2xhc3NVcGRhdGVGaWVsZHM7XG4gIGxldCBjbGFzc0NvbnN0cmFpbnRGaWVsZHM7XG4gIGxldCBjbGFzc1NvcnRGaWVsZHM7XG5cbiAgLy8gQWxsIGFsbG93ZWQgY3VzdG9tcyBmaWVsZHNcbiAgY29uc3QgY2xhc3NDdXN0b21GaWVsZHMgPSBjbGFzc0ZpZWxkcy5maWx0ZXIoZmllbGQgPT4ge1xuICAgIHJldHVybiAhT2JqZWN0LmtleXMoZGVmYXVsdEdyYXBoUUxUeXBlcy5QQVJTRV9PQkpFQ1RfRklFTERTKS5pbmNsdWRlcyhmaWVsZCkgJiYgZmllbGQgIT09ICdpZCc7XG4gIH0pO1xuXG4gIGlmIChhbGxvd2VkSW5wdXRGaWVsZHMgJiYgYWxsb3dlZElucHV0RmllbGRzLmNyZWF0ZSkge1xuICAgIGNsYXNzQ3JlYXRlRmllbGRzID0gY2xhc3NDdXN0b21GaWVsZHMuZmlsdGVyKGZpZWxkID0+IHtcbiAgICAgIHJldHVybiBhbGxvd2VkSW5wdXRGaWVsZHMuY3JlYXRlLmluY2x1ZGVzKGZpZWxkKTtcbiAgICB9KTtcbiAgfSBlbHNlIHtcbiAgICBjbGFzc0NyZWF0ZUZpZWxkcyA9IGNsYXNzQ3VzdG9tRmllbGRzO1xuICB9XG4gIGlmIChhbGxvd2VkSW5wdXRGaWVsZHMgJiYgYWxsb3dlZElucHV0RmllbGRzLnVwZGF0ZSkge1xuICAgIGNsYXNzVXBkYXRlRmllbGRzID0gY2xhc3NDdXN0b21GaWVsZHMuZmlsdGVyKGZpZWxkID0+IHtcbiAgICAgIHJldHVybiBhbGxvd2VkSW5wdXRGaWVsZHMudXBkYXRlLmluY2x1ZGVzKGZpZWxkKTtcbiAgICB9KTtcbiAgfSBlbHNlIHtcbiAgICBjbGFzc1VwZGF0ZUZpZWxkcyA9IGNsYXNzQ3VzdG9tRmllbGRzO1xuICB9XG5cbiAgaWYgKGFsbG93ZWRPdXRwdXRGaWVsZHMpIHtcbiAgICBjbGFzc091dHB1dEZpZWxkcyA9IGNsYXNzQ3VzdG9tRmllbGRzLmZpbHRlcihmaWVsZCA9PiB7XG4gICAgICByZXR1cm4gYWxsb3dlZE91dHB1dEZpZWxkcy5pbmNsdWRlcyhmaWVsZCk7XG4gICAgfSk7XG4gIH0gZWxzZSB7XG4gICAgY2xhc3NPdXRwdXRGaWVsZHMgPSBjbGFzc0N1c3RvbUZpZWxkcztcbiAgfVxuICAvLyBGaWx0ZXJzIHRoZSBcInBhc3N3b3JkXCIgZmllbGQgZnJvbSBjbGFzcyBfVXNlclxuICBpZiAocGFyc2VDbGFzcy5jbGFzc05hbWUgPT09ICdfVXNlcicpIHtcbiAgICBjbGFzc091dHB1dEZpZWxkcyA9IGNsYXNzT3V0cHV0RmllbGRzLmZpbHRlcihvdXRwdXRGaWVsZCA9PiBvdXRwdXRGaWVsZCAhPT0gJ3Bhc3N3b3JkJyk7XG4gIH1cblxuICBpZiAoYWxsb3dlZENvbnN0cmFpbnRGaWVsZHMpIHtcbiAgICBjbGFzc0NvbnN0cmFpbnRGaWVsZHMgPSBjbGFzc0N1c3RvbUZpZWxkcy5maWx0ZXIoZmllbGQgPT4ge1xuICAgICAgcmV0dXJuIGFsbG93ZWRDb25zdHJhaW50RmllbGRzLmluY2x1ZGVzKGZpZWxkKTtcbiAgICB9KTtcbiAgfSBlbHNlIHtcbiAgICBjbGFzc0NvbnN0cmFpbnRGaWVsZHMgPSBjbGFzc0ZpZWxkcztcbiAgfVxuXG4gIGlmIChhbGxvd2VkU29ydEZpZWxkcykge1xuICAgIGNsYXNzU29ydEZpZWxkcyA9IGFsbG93ZWRTb3J0RmllbGRzO1xuICAgIGlmICghY2xhc3NTb3J0RmllbGRzLmxlbmd0aCkge1xuICAgICAgLy8gbXVzdCBoYXZlIGF0IGxlYXN0IDEgb3JkZXIgZmllbGRcbiAgICAgIC8vIG90aGVyd2lzZSB0aGUgRmluZEFyZ3MgSW5wdXQgVHlwZSB3aWxsIHRocm93LlxuICAgICAgY2xhc3NTb3J0RmllbGRzLnB1c2goe1xuICAgICAgICBmaWVsZDogJ2lkJyxcbiAgICAgICAgYXNjOiB0cnVlLFxuICAgICAgICBkZXNjOiB0cnVlLFxuICAgICAgfSk7XG4gICAgfVxuICB9IGVsc2Uge1xuICAgIGNsYXNzU29ydEZpZWxkcyA9IGNsYXNzRmllbGRzLm1hcChmaWVsZCA9PiB7XG4gICAgICByZXR1cm4geyBmaWVsZCwgYXNjOiB0cnVlLCBkZXNjOiB0cnVlIH07XG4gICAgfSk7XG4gIH1cblxuICByZXR1cm4ge1xuICAgIGNsYXNzQ3JlYXRlRmllbGRzLFxuICAgIGNsYXNzVXBkYXRlRmllbGRzLFxuICAgIGNsYXNzQ29uc3RyYWludEZpZWxkcyxcbiAgICBjbGFzc091dHB1dEZpZWxkcyxcbiAgICBjbGFzc1NvcnRGaWVsZHMsXG4gIH07XG59O1xuXG5jb25zdCBsb2FkID0gKHBhcnNlR3JhcGhRTFNjaGVtYSwgcGFyc2VDbGFzcywgcGFyc2VDbGFzc0NvbmZpZzogP1BhcnNlR3JhcGhRTENsYXNzQ29uZmlnKSA9PiB7XG4gIGNvbnN0IGNsYXNzTmFtZSA9IHBhcnNlQ2xhc3MuY2xhc3NOYW1lO1xuICBjb25zdCBncmFwaFFMQ2xhc3NOYW1lID0gdHJhbnNmb3JtQ2xhc3NOYW1lVG9HcmFwaFFMKGNsYXNzTmFtZSk7XG4gIGNvbnN0IHtcbiAgICBjbGFzc0NyZWF0ZUZpZWxkcyxcbiAgICBjbGFzc1VwZGF0ZUZpZWxkcyxcbiAgICBjbGFzc091dHB1dEZpZWxkcyxcbiAgICBjbGFzc0NvbnN0cmFpbnRGaWVsZHMsXG4gICAgY2xhc3NTb3J0RmllbGRzLFxuICB9ID0gZ2V0SW5wdXRGaWVsZHNBbmRDb25zdHJhaW50cyhwYXJzZUNsYXNzLCBwYXJzZUNsYXNzQ29uZmlnKTtcblxuICBjb25zdCB7XG4gICAgY3JlYXRlOiBpc0NyZWF0ZUVuYWJsZWQgPSB0cnVlLFxuICAgIHVwZGF0ZTogaXNVcGRhdGVFbmFibGVkID0gdHJ1ZSxcbiAgfSA9IGdldFBhcnNlQ2xhc3NNdXRhdGlvbkNvbmZpZyhwYXJzZUNsYXNzQ29uZmlnKTtcblxuICBjb25zdCBjbGFzc0dyYXBoUUxDcmVhdGVUeXBlTmFtZSA9IGBDcmVhdGUke2dyYXBoUUxDbGFzc05hbWV9RmllbGRzSW5wdXRgO1xuICBsZXQgY2xhc3NHcmFwaFFMQ3JlYXRlVHlwZSA9IG5ldyBHcmFwaFFMSW5wdXRPYmplY3RUeXBlKHtcbiAgICBuYW1lOiBjbGFzc0dyYXBoUUxDcmVhdGVUeXBlTmFtZSxcbiAgICBkZXNjcmlwdGlvbjogYFRoZSAke2NsYXNzR3JhcGhRTENyZWF0ZVR5cGVOYW1lfSBpbnB1dCB0eXBlIGlzIHVzZWQgaW4gb3BlcmF0aW9ucyB0aGF0IGludm9sdmUgY3JlYXRpb24gb2Ygb2JqZWN0cyBpbiB0aGUgJHtncmFwaFFMQ2xhc3NOYW1lfSBjbGFzcy5gLFxuICAgIGZpZWxkczogKCkgPT5cbiAgICAgIGNsYXNzQ3JlYXRlRmllbGRzLnJlZHVjZShcbiAgICAgICAgKGZpZWxkcywgZmllbGQpID0+IHtcbiAgICAgICAgICBjb25zdCB0eXBlID0gdHJhbnNmb3JtSW5wdXRUeXBlVG9HcmFwaFFMKFxuICAgICAgICAgICAgcGFyc2VDbGFzcy5maWVsZHNbZmllbGRdLnR5cGUsXG4gICAgICAgICAgICBwYXJzZUNsYXNzLmZpZWxkc1tmaWVsZF0udGFyZ2V0Q2xhc3MsXG4gICAgICAgICAgICBwYXJzZUdyYXBoUUxTY2hlbWEucGFyc2VDbGFzc1R5cGVzXG4gICAgICAgICAgKTtcbiAgICAgICAgICBpZiAodHlwZSkge1xuICAgICAgICAgICAgcmV0dXJuIHtcbiAgICAgICAgICAgICAgLi4uZmllbGRzLFxuICAgICAgICAgICAgICBbZmllbGRdOiB7XG4gICAgICAgICAgICAgICAgZGVzY3JpcHRpb246IGBUaGlzIGlzIHRoZSBvYmplY3QgJHtmaWVsZH0uYCxcbiAgICAgICAgICAgICAgICB0eXBlOlxuICAgICAgICAgICAgICAgICAgKGNsYXNzTmFtZSA9PT0gJ19Vc2VyJyAmJiAoZmllbGQgPT09ICd1c2VybmFtZScgfHwgZmllbGQgPT09ICdwYXNzd29yZCcpKSB8fFxuICAgICAgICAgICAgICAgICAgcGFyc2VDbGFzcy5maWVsZHNbZmllbGRdLnJlcXVpcmVkXG4gICAgICAgICAgICAgICAgICAgID8gbmV3IEdyYXBoUUxOb25OdWxsKHR5cGUpXG4gICAgICAgICAgICAgICAgICAgIDogdHlwZSxcbiAgICAgICAgICAgICAgfSxcbiAgICAgICAgICAgIH07XG4gICAgICAgICAgfSBlbHNlIHtcbiAgICAgICAgICAgIHJldHVybiBmaWVsZHM7XG4gICAgICAgICAgfVxuICAgICAgICB9LFxuICAgICAgICB7XG4gICAgICAgICAgQUNMOiB7IHR5cGU6IGRlZmF1bHRHcmFwaFFMVHlwZXMuQUNMX0lOUFVUIH0sXG4gICAgICAgIH1cbiAgICAgICksXG4gIH0pO1xuICBjbGFzc0dyYXBoUUxDcmVhdGVUeXBlID0gcGFyc2VHcmFwaFFMU2NoZW1hLmFkZEdyYXBoUUxUeXBlKGNsYXNzR3JhcGhRTENyZWF0ZVR5cGUpO1xuXG4gIGNvbnN0IGNsYXNzR3JhcGhRTFVwZGF0ZVR5cGVOYW1lID0gYFVwZGF0ZSR7Z3JhcGhRTENsYXNzTmFtZX1GaWVsZHNJbnB1dGA7XG4gIGxldCBjbGFzc0dyYXBoUUxVcGRhdGVUeXBlID0gbmV3IEdyYXBoUUxJbnB1dE9iamVjdFR5cGUoe1xuICAgIG5hbWU6IGNsYXNzR3JhcGhRTFVwZGF0ZVR5cGVOYW1lLFxuICAgIGRlc2NyaXB0aW9uOiBgVGhlICR7Y2xhc3NHcmFwaFFMVXBkYXRlVHlwZU5hbWV9IGlucHV0IHR5cGUgaXMgdXNlZCBpbiBvcGVyYXRpb25zIHRoYXQgaW52b2x2ZSBjcmVhdGlvbiBvZiBvYmplY3RzIGluIHRoZSAke2dyYXBoUUxDbGFzc05hbWV9IGNsYXNzLmAsXG4gICAgZmllbGRzOiAoKSA9PlxuICAgICAgY2xhc3NVcGRhdGVGaWVsZHMucmVkdWNlKFxuICAgICAgICAoZmllbGRzLCBmaWVsZCkgPT4ge1xuICAgICAgICAgIGNvbnN0IHR5cGUgPSB0cmFuc2Zvcm1JbnB1dFR5cGVUb0dyYXBoUUwoXG4gICAgICAgICAgICBwYXJzZUNsYXNzLmZpZWxkc1tmaWVsZF0udHlwZSxcbiAgICAgICAgICAgIHBhcnNlQ2xhc3MuZmllbGRzW2ZpZWxkXS50YXJnZXRDbGFzcyxcbiAgICAgICAgICAgIHBhcnNlR3JhcGhRTFNjaGVtYS5wYXJzZUNsYXNzVHlwZXNcbiAgICAgICAgICApO1xuICAgICAgICAgIGlmICh0eXBlKSB7XG4gICAgICAgICAgICByZXR1cm4ge1xuICAgICAgICAgICAgICAuLi5maWVsZHMsXG4gICAgICAgICAgICAgIFtmaWVsZF06IHtcbiAgICAgICAgICAgICAgICBkZXNjcmlwdGlvbjogYFRoaXMgaXMgdGhlIG9iamVjdCAke2ZpZWxkfS5gLFxuICAgICAgICAgICAgICAgIHR5cGUsXG4gICAgICAgICAgICAgIH0sXG4gICAgICAgICAgICB9O1xuICAgICAgICAgIH0gZWxzZSB7XG4gICAgICAgICAgICByZXR1cm4gZmllbGRzO1xuICAgICAgICAgIH1cbiAgICAgICAgfSxcbiAgICAgICAge1xuICAgICAgICAgIEFDTDogeyB0eXBlOiBkZWZhdWx0R3JhcGhRTFR5cGVzLkFDTF9JTlBVVCB9LFxuICAgICAgICB9XG4gICAgICApLFxuICB9KTtcbiAgY2xhc3NHcmFwaFFMVXBkYXRlVHlwZSA9IHBhcnNlR3JhcGhRTFNjaGVtYS5hZGRHcmFwaFFMVHlwZShjbGFzc0dyYXBoUUxVcGRhdGVUeXBlKTtcblxuICBjb25zdCBjbGFzc0dyYXBoUUxQb2ludGVyVHlwZU5hbWUgPSBgJHtncmFwaFFMQ2xhc3NOYW1lfVBvaW50ZXJJbnB1dGA7XG4gIGxldCBjbGFzc0dyYXBoUUxQb2ludGVyVHlwZSA9IG5ldyBHcmFwaFFMSW5wdXRPYmplY3RUeXBlKHtcbiAgICBuYW1lOiBjbGFzc0dyYXBoUUxQb2ludGVyVHlwZU5hbWUsXG4gICAgZGVzY3JpcHRpb246IGBBbGxvdyB0byBsaW5rIE9SIGFkZCBhbmQgbGluayBhbiBvYmplY3Qgb2YgdGhlICR7Z3JhcGhRTENsYXNzTmFtZX0gY2xhc3MuYCxcbiAgICBmaWVsZHM6ICgpID0+IHtcbiAgICAgIGNvbnN0IGZpZWxkcyA9IHtcbiAgICAgICAgbGluazoge1xuICAgICAgICAgIGRlc2NyaXB0aW9uOiBgTGluayBhbiBleGlzdGluZyBvYmplY3QgZnJvbSAke2dyYXBoUUxDbGFzc05hbWV9IGNsYXNzLiBZb3UgY2FuIHVzZSBlaXRoZXIgdGhlIGdsb2JhbCBvciB0aGUgb2JqZWN0IGlkLmAsXG4gICAgICAgICAgdHlwZTogR3JhcGhRTElELFxuICAgICAgICB9LFxuICAgICAgfTtcbiAgICAgIGlmIChpc0NyZWF0ZUVuYWJsZWQpIHtcbiAgICAgICAgZmllbGRzWydjcmVhdGVBbmRMaW5rJ10gPSB7XG4gICAgICAgICAgZGVzY3JpcHRpb246IGBDcmVhdGUgYW5kIGxpbmsgYW4gb2JqZWN0IGZyb20gJHtncmFwaFFMQ2xhc3NOYW1lfSBjbGFzcy5gLFxuICAgICAgICAgIHR5cGU6IGNsYXNzR3JhcGhRTENyZWF0ZVR5cGUsXG4gICAgICAgIH07XG4gICAgICB9XG4gICAgICByZXR1cm4gZmllbGRzO1xuICAgIH0sXG4gIH0pO1xuICBjbGFzc0dyYXBoUUxQb2ludGVyVHlwZSA9XG4gICAgcGFyc2VHcmFwaFFMU2NoZW1hLmFkZEdyYXBoUUxUeXBlKGNsYXNzR3JhcGhRTFBvaW50ZXJUeXBlKSB8fCBkZWZhdWx0R3JhcGhRTFR5cGVzLk9CSkVDVDtcblxuICBjb25zdCBjbGFzc0dyYXBoUUxSZWxhdGlvblR5cGVOYW1lID0gYCR7Z3JhcGhRTENsYXNzTmFtZX1SZWxhdGlvbklucHV0YDtcbiAgbGV0IGNsYXNzR3JhcGhRTFJlbGF0aW9uVHlwZSA9IG5ldyBHcmFwaFFMSW5wdXRPYmplY3RUeXBlKHtcbiAgICBuYW1lOiBjbGFzc0dyYXBoUUxSZWxhdGlvblR5cGVOYW1lLFxuICAgIGRlc2NyaXB0aW9uOiBgQWxsb3cgdG8gYWRkLCByZW1vdmUsIGNyZWF0ZUFuZEFkZCBvYmplY3RzIG9mIHRoZSAke2dyYXBoUUxDbGFzc05hbWV9IGNsYXNzIGludG8gYSByZWxhdGlvbiBmaWVsZC5gLFxuICAgIGZpZWxkczogKCkgPT4ge1xuICAgICAgY29uc3QgZmllbGRzID0ge1xuICAgICAgICBhZGQ6IHtcbiAgICAgICAgICBkZXNjcmlwdGlvbjogYEFkZCBleGlzdGluZyBvYmplY3RzIGZyb20gdGhlICR7Z3JhcGhRTENsYXNzTmFtZX0gY2xhc3MgaW50byB0aGUgcmVsYXRpb24uIFlvdSBjYW4gdXNlIGVpdGhlciB0aGUgZ2xvYmFsIG9yIHRoZSBvYmplY3QgaWRzLmAsXG4gICAgICAgICAgdHlwZTogbmV3IEdyYXBoUUxMaXN0KGRlZmF1bHRHcmFwaFFMVHlwZXMuT0JKRUNUX0lEKSxcbiAgICAgICAgfSxcbiAgICAgICAgcmVtb3ZlOiB7XG4gICAgICAgICAgZGVzY3JpcHRpb246IGBSZW1vdmUgZXhpc3Rpbmcgb2JqZWN0cyBmcm9tIHRoZSAke2dyYXBoUUxDbGFzc05hbWV9IGNsYXNzIG91dCBvZiB0aGUgcmVsYXRpb24uIFlvdSBjYW4gdXNlIGVpdGhlciB0aGUgZ2xvYmFsIG9yIHRoZSBvYmplY3QgaWRzLmAsXG4gICAgICAgICAgdHlwZTogbmV3IEdyYXBoUUxMaXN0KGRlZmF1bHRHcmFwaFFMVHlwZXMuT0JKRUNUX0lEKSxcbiAgICAgICAgfSxcbiAgICAgIH07XG4gICAgICBpZiAoaXNDcmVhdGVFbmFibGVkKSB7XG4gICAgICAgIGZpZWxkc1snY3JlYXRlQW5kQWRkJ10gPSB7XG4gICAgICAgICAgZGVzY3JpcHRpb246IGBDcmVhdGUgYW5kIGFkZCBvYmplY3RzIG9mIHRoZSAke2dyYXBoUUxDbGFzc05hbWV9IGNsYXNzIGludG8gdGhlIHJlbGF0aW9uLmAsXG4gICAgICAgICAgdHlwZTogbmV3IEdyYXBoUUxMaXN0KG5ldyBHcmFwaFFMTm9uTnVsbChjbGFzc0dyYXBoUUxDcmVhdGVUeXBlKSksXG4gICAgICAgIH07XG4gICAgICB9XG4gICAgICByZXR1cm4gZmllbGRzO1xuICAgIH0sXG4gIH0pO1xuICBjbGFzc0dyYXBoUUxSZWxhdGlvblR5cGUgPVxuICAgIHBhcnNlR3JhcGhRTFNjaGVtYS5hZGRHcmFwaFFMVHlwZShjbGFzc0dyYXBoUUxSZWxhdGlvblR5cGUpIHx8IGRlZmF1bHRHcmFwaFFMVHlwZXMuT0JKRUNUO1xuXG4gIGNvbnN0IGNsYXNzR3JhcGhRTENvbnN0cmFpbnRzVHlwZU5hbWUgPSBgJHtncmFwaFFMQ2xhc3NOYW1lfVdoZXJlSW5wdXRgO1xuICBsZXQgY2xhc3NHcmFwaFFMQ29uc3RyYWludHNUeXBlID0gbmV3IEdyYXBoUUxJbnB1dE9iamVjdFR5cGUoe1xuICAgIG5hbWU6IGNsYXNzR3JhcGhRTENvbnN0cmFpbnRzVHlwZU5hbWUsXG4gICAgZGVzY3JpcHRpb246IGBUaGUgJHtjbGFzc0dyYXBoUUxDb25zdHJhaW50c1R5cGVOYW1lfSBpbnB1dCB0eXBlIGlzIHVzZWQgaW4gb3BlcmF0aW9ucyB0aGF0IGludm9sdmUgZmlsdGVyaW5nIG9iamVjdHMgb2YgJHtncmFwaFFMQ2xhc3NOYW1lfSBjbGFzcy5gLFxuICAgIGZpZWxkczogKCkgPT4gKHtcbiAgICAgIC4uLmNsYXNzQ29uc3RyYWludEZpZWxkcy5yZWR1Y2UoKGZpZWxkcywgZmllbGQpID0+IHtcbiAgICAgICAgaWYgKFsnT1InLCAnQU5EJywgJ05PUiddLmluY2x1ZGVzKGZpZWxkKSkge1xuICAgICAgICAgIHBhcnNlR3JhcGhRTFNjaGVtYS5sb2cud2FybihcbiAgICAgICAgICAgIGBGaWVsZCAke2ZpZWxkfSBjb3VsZCBub3QgYmUgYWRkZWQgdG8gdGhlIGF1dG8gc2NoZW1hICR7Y2xhc3NHcmFwaFFMQ29uc3RyYWludHNUeXBlTmFtZX0gYmVjYXVzZSBpdCBjb2xsaWRlZCB3aXRoIGFuIGV4aXN0aW5nIG9uZS5gXG4gICAgICAgICAgKTtcbiAgICAgICAgICByZXR1cm4gZmllbGRzO1xuICAgICAgICB9XG4gICAgICAgIGNvbnN0IHBhcnNlRmllbGQgPSBmaWVsZCA9PT0gJ2lkJyA/ICdvYmplY3RJZCcgOiBmaWVsZDtcbiAgICAgICAgY29uc3QgdHlwZSA9IHRyYW5zZm9ybUNvbnN0cmFpbnRUeXBlVG9HcmFwaFFMKFxuICAgICAgICAgIHBhcnNlQ2xhc3MuZmllbGRzW3BhcnNlRmllbGRdLnR5cGUsXG4gICAgICAgICAgcGFyc2VDbGFzcy5maWVsZHNbcGFyc2VGaWVsZF0udGFyZ2V0Q2xhc3MsXG4gICAgICAgICAgcGFyc2VHcmFwaFFMU2NoZW1hLnBhcnNlQ2xhc3NUeXBlcyxcbiAgICAgICAgICBmaWVsZFxuICAgICAgICApO1xuICAgICAgICBpZiAodHlwZSkge1xuICAgICAgICAgIHJldHVybiB7XG4gICAgICAgICAgICAuLi5maWVsZHMsXG4gICAgICAgICAgICBbZmllbGRdOiB7XG4gICAgICAgICAgICAgIGRlc2NyaXB0aW9uOiBgVGhpcyBpcyB0aGUgb2JqZWN0ICR7ZmllbGR9LmAsXG4gICAgICAgICAgICAgIHR5cGUsXG4gICAgICAgICAgICB9LFxuICAgICAgICAgIH07XG4gICAgICAgIH0gZWxzZSB7XG4gICAgICAgICAgcmV0dXJuIGZpZWxkcztcbiAgICAgICAgfVxuICAgICAgfSwge30pLFxuICAgICAgT1I6IHtcbiAgICAgICAgZGVzY3JpcHRpb246ICdUaGlzIGlzIHRoZSBPUiBvcGVyYXRvciB0byBjb21wb3VuZCBjb25zdHJhaW50cy4nLFxuICAgICAgICB0eXBlOiBuZXcgR3JhcGhRTExpc3QobmV3IEdyYXBoUUxOb25OdWxsKGNsYXNzR3JhcGhRTENvbnN0cmFpbnRzVHlwZSkpLFxuICAgICAgfSxcbiAgICAgIEFORDoge1xuICAgICAgICBkZXNjcmlwdGlvbjogJ1RoaXMgaXMgdGhlIEFORCBvcGVyYXRvciB0byBjb21wb3VuZCBjb25zdHJhaW50cy4nLFxuICAgICAgICB0eXBlOiBuZXcgR3JhcGhRTExpc3QobmV3IEdyYXBoUUxOb25OdWxsKGNsYXNzR3JhcGhRTENvbnN0cmFpbnRzVHlwZSkpLFxuICAgICAgfSxcbiAgICAgIE5PUjoge1xuICAgICAgICBkZXNjcmlwdGlvbjogJ1RoaXMgaXMgdGhlIE5PUiBvcGVyYXRvciB0byBjb21wb3VuZCBjb25zdHJhaW50cy4nLFxuICAgICAgICB0eXBlOiBuZXcgR3JhcGhRTExpc3QobmV3IEdyYXBoUUxOb25OdWxsKGNsYXNzR3JhcGhRTENvbnN0cmFpbnRzVHlwZSkpLFxuICAgICAgfSxcbiAgICB9KSxcbiAgfSk7XG4gIGNsYXNzR3JhcGhRTENvbnN0cmFpbnRzVHlwZSA9XG4gICAgcGFyc2VHcmFwaFFMU2NoZW1hLmFkZEdyYXBoUUxUeXBlKGNsYXNzR3JhcGhRTENvbnN0cmFpbnRzVHlwZSkgfHwgZGVmYXVsdEdyYXBoUUxUeXBlcy5PQkpFQ1Q7XG5cbiAgY29uc3QgY2xhc3NHcmFwaFFMUmVsYXRpb25Db25zdHJhaW50c1R5cGVOYW1lID0gYCR7Z3JhcGhRTENsYXNzTmFtZX1SZWxhdGlvbldoZXJlSW5wdXRgO1xuICBsZXQgY2xhc3NHcmFwaFFMUmVsYXRpb25Db25zdHJhaW50c1R5cGUgPSBuZXcgR3JhcGhRTElucHV0T2JqZWN0VHlwZSh7XG4gICAgbmFtZTogY2xhc3NHcmFwaFFMUmVsYXRpb25Db25zdHJhaW50c1R5cGVOYW1lLFxuICAgIGRlc2NyaXB0aW9uOiBgVGhlICR7Y2xhc3NHcmFwaFFMUmVsYXRpb25Db25zdHJhaW50c1R5cGVOYW1lfSBpbnB1dCB0eXBlIGlzIHVzZWQgaW4gb3BlcmF0aW9ucyB0aGF0IGludm9sdmUgZmlsdGVyaW5nIG9iamVjdHMgb2YgJHtncmFwaFFMQ2xhc3NOYW1lfSBjbGFzcy5gLFxuICAgIGZpZWxkczogKCkgPT4gKHtcbiAgICAgIGhhdmU6IHtcbiAgICAgICAgZGVzY3JpcHRpb246ICdSdW4gYSByZWxhdGlvbmFsL3BvaW50ZXIgcXVlcnkgd2hlcmUgYXQgbGVhc3Qgb25lIGNoaWxkIG9iamVjdCBjYW4gbWF0Y2guJyxcbiAgICAgICAgdHlwZTogY2xhc3NHcmFwaFFMQ29uc3RyYWludHNUeXBlLFxuICAgICAgfSxcbiAgICAgIGhhdmVOb3Q6IHtcbiAgICAgICAgZGVzY3JpcHRpb246XG4gICAgICAgICAgJ1J1biBhbiBpbnZlcnRlZCByZWxhdGlvbmFsL3BvaW50ZXIgcXVlcnkgd2hlcmUgYXQgbGVhc3Qgb25lIGNoaWxkIG9iamVjdCBjYW4gbWF0Y2guJyxcbiAgICAgICAgdHlwZTogY2xhc3NHcmFwaFFMQ29uc3RyYWludHNUeXBlLFxuICAgICAgfSxcbiAgICAgIGV4aXN0czoge1xuICAgICAgICBkZXNjcmlwdGlvbjogJ0NoZWNrIGlmIHRoZSByZWxhdGlvbi9wb2ludGVyIGNvbnRhaW5zIG9iamVjdHMuJyxcbiAgICAgICAgdHlwZTogR3JhcGhRTEJvb2xlYW4sXG4gICAgICB9LFxuICAgIH0pLFxuICB9KTtcbiAgY2xhc3NHcmFwaFFMUmVsYXRpb25Db25zdHJhaW50c1R5cGUgPVxuICAgIHBhcnNlR3JhcGhRTFNjaGVtYS5hZGRHcmFwaFFMVHlwZShjbGFzc0dyYXBoUUxSZWxhdGlvbkNvbnN0cmFpbnRzVHlwZSkgfHxcbiAgICBkZWZhdWx0R3JhcGhRTFR5cGVzLk9CSkVDVDtcblxuICBjb25zdCBjbGFzc0dyYXBoUUxPcmRlclR5cGVOYW1lID0gYCR7Z3JhcGhRTENsYXNzTmFtZX1PcmRlcmA7XG4gIGxldCBjbGFzc0dyYXBoUUxPcmRlclR5cGUgPSBuZXcgR3JhcGhRTEVudW1UeXBlKHtcbiAgICBuYW1lOiBjbGFzc0dyYXBoUUxPcmRlclR5cGVOYW1lLFxuICAgIGRlc2NyaXB0aW9uOiBgVGhlICR7Y2xhc3NHcmFwaFFMT3JkZXJUeXBlTmFtZX0gaW5wdXQgdHlwZSBpcyB1c2VkIHdoZW4gc29ydGluZyBvYmplY3RzIG9mIHRoZSAke2dyYXBoUUxDbGFzc05hbWV9IGNsYXNzLmAsXG4gICAgdmFsdWVzOiBjbGFzc1NvcnRGaWVsZHMucmVkdWNlKChzb3J0RmllbGRzLCBmaWVsZENvbmZpZykgPT4ge1xuICAgICAgY29uc3QgeyBmaWVsZCwgYXNjLCBkZXNjIH0gPSBmaWVsZENvbmZpZztcbiAgICAgIGNvbnN0IHVwZGF0ZWRTb3J0RmllbGRzID0ge1xuICAgICAgICAuLi5zb3J0RmllbGRzLFxuICAgICAgfTtcbiAgICAgIGNvbnN0IHZhbHVlID0gZmllbGQgPT09ICdpZCcgPyAnb2JqZWN0SWQnIDogZmllbGQ7XG4gICAgICBpZiAoYXNjKSB7XG4gICAgICAgIHVwZGF0ZWRTb3J0RmllbGRzW2Ake2ZpZWxkfV9BU0NgXSA9IHsgdmFsdWUgfTtcbiAgICAgIH1cbiAgICAgIGlmIChkZXNjKSB7XG4gICAgICAgIHVwZGF0ZWRTb3J0RmllbGRzW2Ake2ZpZWxkfV9ERVNDYF0gPSB7IHZhbHVlOiBgLSR7dmFsdWV9YCB9O1xuICAgICAgfVxuICAgICAgcmV0dXJuIHVwZGF0ZWRTb3J0RmllbGRzO1xuICAgIH0sIHt9KSxcbiAgfSk7XG4gIGNsYXNzR3JhcGhRTE9yZGVyVHlwZSA9IHBhcnNlR3JhcGhRTFNjaGVtYS5hZGRHcmFwaFFMVHlwZShjbGFzc0dyYXBoUUxPcmRlclR5cGUpO1xuXG4gIGNvbnN0IGNsYXNzR3JhcGhRTEZpbmRBcmdzID0ge1xuICAgIHdoZXJlOiB7XG4gICAgICBkZXNjcmlwdGlvbjogJ1RoZXNlIGFyZSB0aGUgY29uZGl0aW9ucyB0aGF0IHRoZSBvYmplY3RzIG5lZWQgdG8gbWF0Y2ggaW4gb3JkZXIgdG8gYmUgZm91bmQuJyxcbiAgICAgIHR5cGU6IGNsYXNzR3JhcGhRTENvbnN0cmFpbnRzVHlwZSxcbiAgICB9LFxuICAgIG9yZGVyOiB7XG4gICAgICBkZXNjcmlwdGlvbjogJ1RoZSBmaWVsZHMgdG8gYmUgdXNlZCB3aGVuIHNvcnRpbmcgdGhlIGRhdGEgZmV0Y2hlZC4nLFxuICAgICAgdHlwZTogY2xhc3NHcmFwaFFMT3JkZXJUeXBlXG4gICAgICAgID8gbmV3IEdyYXBoUUxMaXN0KG5ldyBHcmFwaFFMTm9uTnVsbChjbGFzc0dyYXBoUUxPcmRlclR5cGUpKVxuICAgICAgICA6IEdyYXBoUUxTdHJpbmcsXG4gICAgfSxcbiAgICBza2lwOiBkZWZhdWx0R3JhcGhRTFR5cGVzLlNLSVBfQVRULFxuICAgIC4uLmNvbm5lY3Rpb25BcmdzLFxuICAgIG9wdGlvbnM6IGRlZmF1bHRHcmFwaFFMVHlwZXMuUkVBRF9PUFRJT05TX0FUVCxcbiAgfTtcbiAgY29uc3QgY2xhc3NHcmFwaFFMT3V0cHV0VHlwZU5hbWUgPSBgJHtncmFwaFFMQ2xhc3NOYW1lfWA7XG4gIGNvbnN0IGludGVyZmFjZXMgPSBbZGVmYXVsdEdyYXBoUUxUeXBlcy5QQVJTRV9PQkpFQ1QsIHBhcnNlR3JhcGhRTFNjaGVtYS5yZWxheU5vZGVJbnRlcmZhY2VdO1xuICBjb25zdCBwYXJzZU9iamVjdEZpZWxkcyA9IHtcbiAgICBpZDogZ2xvYmFsSWRGaWVsZChjbGFzc05hbWUsIG9iaiA9PiBvYmoub2JqZWN0SWQpLFxuICAgIC4uLmRlZmF1bHRHcmFwaFFMVHlwZXMuUEFSU0VfT0JKRUNUX0ZJRUxEUyxcbiAgfTtcbiAgY29uc3Qgb3V0cHV0RmllbGRzID0gKCkgPT4ge1xuICAgIHJldHVybiBjbGFzc091dHB1dEZpZWxkcy5yZWR1Y2UoKGZpZWxkcywgZmllbGQpID0+IHtcbiAgICAgIGNvbnN0IHR5cGUgPSB0cmFuc2Zvcm1PdXRwdXRUeXBlVG9HcmFwaFFMKFxuICAgICAgICBwYXJzZUNsYXNzLmZpZWxkc1tmaWVsZF0udHlwZSxcbiAgICAgICAgcGFyc2VDbGFzcy5maWVsZHNbZmllbGRdLnRhcmdldENsYXNzLFxuICAgICAgICBwYXJzZUdyYXBoUUxTY2hlbWEucGFyc2VDbGFzc1R5cGVzXG4gICAgICApO1xuICAgICAgaWYgKHBhcnNlQ2xhc3MuZmllbGRzW2ZpZWxkXS50eXBlID09PSAnUmVsYXRpb24nKSB7XG4gICAgICAgIGNvbnN0IHRhcmdldFBhcnNlQ2xhc3NUeXBlcyA9XG4gICAgICAgICAgcGFyc2VHcmFwaFFMU2NoZW1hLnBhcnNlQ2xhc3NUeXBlc1twYXJzZUNsYXNzLmZpZWxkc1tmaWVsZF0udGFyZ2V0Q2xhc3NdO1xuICAgICAgICBjb25zdCBhcmdzID0gdGFyZ2V0UGFyc2VDbGFzc1R5cGVzID8gdGFyZ2V0UGFyc2VDbGFzc1R5cGVzLmNsYXNzR3JhcGhRTEZpbmRBcmdzIDogdW5kZWZpbmVkO1xuICAgICAgICByZXR1cm4ge1xuICAgICAgICAgIC4uLmZpZWxkcyxcbiAgICAgICAgICBbZmllbGRdOiB7XG4gICAgICAgICAgICBkZXNjcmlwdGlvbjogYFRoaXMgaXMgdGhlIG9iamVjdCAke2ZpZWxkfS5gLFxuICAgICAgICAgICAgYXJncyxcbiAgICAgICAgICAgIHR5cGU6IHBhcnNlQ2xhc3MuZmllbGRzW2ZpZWxkXS5yZXF1aXJlZCA/IG5ldyBHcmFwaFFMTm9uTnVsbCh0eXBlKSA6IHR5cGUsXG4gICAgICAgICAgICBhc3luYyByZXNvbHZlKHNvdXJjZSwgYXJncywgY29udGV4dCwgcXVlcnlJbmZvKSB7XG4gICAgICAgICAgICAgIHRyeSB7XG4gICAgICAgICAgICAgICAgY29uc3QgeyB3aGVyZSwgb3JkZXIsIHNraXAsIGZpcnN0LCBhZnRlciwgbGFzdCwgYmVmb3JlLCBvcHRpb25zIH0gPSBhcmdzO1xuICAgICAgICAgICAgICAgIGNvbnN0IHsgcmVhZFByZWZlcmVuY2UsIGluY2x1ZGVSZWFkUHJlZmVyZW5jZSwgc3VicXVlcnlSZWFkUHJlZmVyZW5jZSB9ID1cbiAgICAgICAgICAgICAgICAgIG9wdGlvbnMgfHwge307XG4gICAgICAgICAgICAgICAgY29uc3QgeyBjb25maWcsIGF1dGgsIGluZm8gfSA9IGNvbnRleHQ7XG4gICAgICAgICAgICAgICAgY29uc3Qgc2VsZWN0ZWRGaWVsZHMgPSBnZXRGaWVsZE5hbWVzKHF1ZXJ5SW5mbyk7XG5cbiAgICAgICAgICAgICAgICBjb25zdCB7IGtleXMsIGluY2x1ZGUgfSA9IGV4dHJhY3RLZXlzQW5kSW5jbHVkZShcbiAgICAgICAgICAgICAgICAgIHNlbGVjdGVkRmllbGRzXG4gICAgICAgICAgICAgICAgICAgIC5maWx0ZXIoZmllbGQgPT4gZmllbGQuc3RhcnRzV2l0aCgnZWRnZXMubm9kZS4nKSlcbiAgICAgICAgICAgICAgICAgICAgLm1hcChmaWVsZCA9PiBmaWVsZC5yZXBsYWNlKCdlZGdlcy5ub2RlLicsICcnKSlcbiAgICAgICAgICAgICAgICApO1xuICAgICAgICAgICAgICAgIGNvbnN0IHBhcnNlT3JkZXIgPSBvcmRlciAmJiBvcmRlci5qb2luKCcsJyk7XG5cbiAgICAgICAgICAgICAgICByZXR1cm4gb2JqZWN0c1F1ZXJpZXMuZmluZE9iamVjdHMoXG4gICAgICAgICAgICAgICAgICBzb3VyY2VbZmllbGRdLmNsYXNzTmFtZSxcbiAgICAgICAgICAgICAgICAgIHtcbiAgICAgICAgICAgICAgICAgICAgJHJlbGF0ZWRUbzoge1xuICAgICAgICAgICAgICAgICAgICAgIG9iamVjdDoge1xuICAgICAgICAgICAgICAgICAgICAgICAgX190eXBlOiAnUG9pbnRlcicsXG4gICAgICAgICAgICAgICAgICAgICAgICBjbGFzc05hbWU6IGNsYXNzTmFtZSxcbiAgICAgICAgICAgICAgICAgICAgICAgIG9iamVjdElkOiBzb3VyY2Uub2JqZWN0SWQsXG4gICAgICAgICAgICAgICAgICAgICAgfSxcbiAgICAgICAgICAgICAgICAgICAgICBrZXk6IGZpZWxkLFxuICAgICAgICAgICAgICAgICAgICB9LFxuICAgICAgICAgICAgICAgICAgICAuLi4od2hlcmUgfHwge30pLFxuICAgICAgICAgICAgICAgICAgfSxcbiAgICAgICAgICAgICAgICAgIHBhcnNlT3JkZXIsXG4gICAgICAgICAgICAgICAgICBza2lwLFxuICAgICAgICAgICAgICAgICAgZmlyc3QsXG4gICAgICAgICAgICAgICAgICBhZnRlcixcbiAgICAgICAgICAgICAgICAgIGxhc3QsXG4gICAgICAgICAgICAgICAgICBiZWZvcmUsXG4gICAgICAgICAgICAgICAgICBrZXlzLFxuICAgICAgICAgICAgICAgICAgaW5jbHVkZSxcbiAgICAgICAgICAgICAgICAgIGZhbHNlLFxuICAgICAgICAgICAgICAgICAgcmVhZFByZWZlcmVuY2UsXG4gICAgICAgICAgICAgICAgICBpbmNsdWRlUmVhZFByZWZlcmVuY2UsXG4gICAgICAgICAgICAgICAgICBzdWJxdWVyeVJlYWRQcmVmZXJlbmNlLFxuICAgICAgICAgICAgICAgICAgY29uZmlnLFxuICAgICAgICAgICAgICAgICAgYXV0aCxcbiAgICAgICAgICAgICAgICAgIGluZm8sXG4gICAgICAgICAgICAgICAgICBzZWxlY3RlZEZpZWxkcyxcbiAgICAgICAgICAgICAgICAgIHBhcnNlR3JhcGhRTFNjaGVtYS5wYXJzZUNsYXNzZXNcbiAgICAgICAgICAgICAgICApO1xuICAgICAgICAgICAgICB9IGNhdGNoIChlKSB7XG4gICAgICAgICAgICAgICAgcGFyc2VHcmFwaFFMU2NoZW1hLmhhbmRsZUVycm9yKGUpO1xuICAgICAgICAgICAgICB9XG4gICAgICAgICAgICB9LFxuICAgICAgICAgIH0sXG4gICAgICAgIH07XG4gICAgICB9IGVsc2UgaWYgKHBhcnNlQ2xhc3MuZmllbGRzW2ZpZWxkXS50eXBlID09PSAnUG9seWdvbicpIHtcbiAgICAgICAgcmV0dXJuIHtcbiAgICAgICAgICAuLi5maWVsZHMsXG4gICAgICAgICAgW2ZpZWxkXToge1xuICAgICAgICAgICAgZGVzY3JpcHRpb246IGBUaGlzIGlzIHRoZSBvYmplY3QgJHtmaWVsZH0uYCxcbiAgICAgICAgICAgIHR5cGU6IHBhcnNlQ2xhc3MuZmllbGRzW2ZpZWxkXS5yZXF1aXJlZCA/IG5ldyBHcmFwaFFMTm9uTnVsbCh0eXBlKSA6IHR5cGUsXG4gICAgICAgICAgICBhc3luYyByZXNvbHZlKHNvdXJjZSkge1xuICAgICAgICAgICAgICBpZiAoc291cmNlW2ZpZWxkXSAmJiBzb3VyY2VbZmllbGRdLmNvb3JkaW5hdGVzKSB7XG4gICAgICAgICAgICAgICAgcmV0dXJuIHNvdXJjZVtmaWVsZF0uY29vcmRpbmF0ZXMubWFwKGNvb3JkaW5hdGUgPT4gKHtcbiAgICAgICAgICAgICAgICAgIGxhdGl0dWRlOiBjb29yZGluYXRlWzBdLFxuICAgICAgICAgICAgICAgICAgbG9uZ2l0dWRlOiBjb29yZGluYXRlWzFdLFxuICAgICAgICAgICAgICAgIH0pKTtcbiAgICAgICAgICAgICAgfSBlbHNlIHtcbiAgICAgICAgICAgICAgICByZXR1cm4gbnVsbDtcbiAgICAgICAgICAgICAgfVxuICAgICAgICAgICAgfSxcbiAgICAgICAgICB9LFxuICAgICAgICB9O1xuICAgICAgfSBlbHNlIGlmIChwYXJzZUNsYXNzLmZpZWxkc1tmaWVsZF0udHlwZSA9PT0gJ0FycmF5Jykge1xuICAgICAgICByZXR1cm4ge1xuICAgICAgICAgIC4uLmZpZWxkcyxcbiAgICAgICAgICBbZmllbGRdOiB7XG4gICAgICAgICAgICBkZXNjcmlwdGlvbjogYFVzZSBJbmxpbmUgRnJhZ21lbnQgb24gQXJyYXkgdG8gZ2V0IHJlc3VsdHM6IGh0dHBzOi8vZ3JhcGhxbC5vcmcvbGVhcm4vcXVlcmllcy8jaW5saW5lLWZyYWdtZW50c2AsXG4gICAgICAgICAgICB0eXBlOiBwYXJzZUNsYXNzLmZpZWxkc1tmaWVsZF0ucmVxdWlyZWQgPyBuZXcgR3JhcGhRTE5vbk51bGwodHlwZSkgOiB0eXBlLFxuICAgICAgICAgICAgYXN5bmMgcmVzb2x2ZShzb3VyY2UpIHtcbiAgICAgICAgICAgICAgaWYgKCFzb3VyY2VbZmllbGRdKSByZXR1cm4gbnVsbDtcbiAgICAgICAgICAgICAgcmV0dXJuIHNvdXJjZVtmaWVsZF0ubWFwKGFzeW5jIGVsZW0gPT4ge1xuICAgICAgICAgICAgICAgIGlmIChlbGVtLmNsYXNzTmFtZSAmJiBlbGVtLm9iamVjdElkICYmIGVsZW0uX190eXBlID09PSAnT2JqZWN0Jykge1xuICAgICAgICAgICAgICAgICAgcmV0dXJuIGVsZW07XG4gICAgICAgICAgICAgICAgfSBlbHNlIHtcbiAgICAgICAgICAgICAgICAgIHJldHVybiB7IHZhbHVlOiBlbGVtIH07XG4gICAgICAgICAgICAgICAgfVxuICAgICAgICAgICAgICB9KTtcbiAgICAgICAgICAgIH0sXG4gICAgICAgICAgfSxcbiAgICAgICAgfTtcbiAgICAgIH0gZWxzZSBpZiAodHlwZSkge1xuICAgICAgICByZXR1cm4ge1xuICAgICAgICAgIC4uLmZpZWxkcyxcbiAgICAgICAgICBbZmllbGRdOiB7XG4gICAgICAgICAgICBkZXNjcmlwdGlvbjogYFRoaXMgaXMgdGhlIG9iamVjdCAke2ZpZWxkfS5gLFxuICAgICAgICAgICAgdHlwZTogcGFyc2VDbGFzcy5maWVsZHNbZmllbGRdLnJlcXVpcmVkID8gbmV3IEdyYXBoUUxOb25OdWxsKHR5cGUpIDogdHlwZSxcbiAgICAgICAgICB9LFxuICAgICAgICB9O1xuICAgICAgfSBlbHNlIHtcbiAgICAgICAgcmV0dXJuIGZpZWxkcztcbiAgICAgIH1cbiAgICB9LCBwYXJzZU9iamVjdEZpZWxkcyk7XG4gIH07XG4gIGxldCBjbGFzc0dyYXBoUUxPdXRwdXRUeXBlID0gbmV3IEdyYXBoUUxPYmplY3RUeXBlKHtcbiAgICBuYW1lOiBjbGFzc0dyYXBoUUxPdXRwdXRUeXBlTmFtZSxcbiAgICBkZXNjcmlwdGlvbjogYFRoZSAke2NsYXNzR3JhcGhRTE91dHB1dFR5cGVOYW1lfSBvYmplY3QgdHlwZSBpcyB1c2VkIGluIG9wZXJhdGlvbnMgdGhhdCBpbnZvbHZlIG91dHB1dHRpbmcgb2JqZWN0cyBvZiAke2dyYXBoUUxDbGFzc05hbWV9IGNsYXNzLmAsXG4gICAgaW50ZXJmYWNlcyxcbiAgICBmaWVsZHM6IG91dHB1dEZpZWxkcyxcbiAgfSk7XG4gIGNsYXNzR3JhcGhRTE91dHB1dFR5cGUgPSBwYXJzZUdyYXBoUUxTY2hlbWEuYWRkR3JhcGhRTFR5cGUoY2xhc3NHcmFwaFFMT3V0cHV0VHlwZSk7XG5cbiAgY29uc3QgeyBjb25uZWN0aW9uVHlwZSwgZWRnZVR5cGUgfSA9IGNvbm5lY3Rpb25EZWZpbml0aW9ucyh7XG4gICAgbmFtZTogZ3JhcGhRTENsYXNzTmFtZSxcbiAgICBjb25uZWN0aW9uRmllbGRzOiB7XG4gICAgICBjb3VudDogZGVmYXVsdEdyYXBoUUxUeXBlcy5DT1VOVF9BVFQsXG4gICAgfSxcbiAgICBub2RlVHlwZTogY2xhc3NHcmFwaFFMT3V0cHV0VHlwZSB8fCBkZWZhdWx0R3JhcGhRTFR5cGVzLk9CSkVDVCxcbiAgfSk7XG4gIGxldCBjbGFzc0dyYXBoUUxGaW5kUmVzdWx0VHlwZSA9IHVuZGVmaW5lZDtcbiAgaWYgKFxuICAgIHBhcnNlR3JhcGhRTFNjaGVtYS5hZGRHcmFwaFFMVHlwZShlZGdlVHlwZSkgJiZcbiAgICBwYXJzZUdyYXBoUUxTY2hlbWEuYWRkR3JhcGhRTFR5cGUoY29ubmVjdGlvblR5cGUsIGZhbHNlLCBmYWxzZSwgdHJ1ZSlcbiAgKSB7XG4gICAgY2xhc3NHcmFwaFFMRmluZFJlc3VsdFR5cGUgPSBjb25uZWN0aW9uVHlwZTtcbiAgfVxuXG4gIHBhcnNlR3JhcGhRTFNjaGVtYS5wYXJzZUNsYXNzVHlwZXNbY2xhc3NOYW1lXSA9IHtcbiAgICBjbGFzc0dyYXBoUUxQb2ludGVyVHlwZSxcbiAgICBjbGFzc0dyYXBoUUxSZWxhdGlvblR5cGUsXG4gICAgY2xhc3NHcmFwaFFMQ3JlYXRlVHlwZSxcbiAgICBjbGFzc0dyYXBoUUxVcGRhdGVUeXBlLFxuICAgIGNsYXNzR3JhcGhRTENvbnN0cmFpbnRzVHlwZSxcbiAgICBjbGFzc0dyYXBoUUxSZWxhdGlvbkNvbnN0cmFpbnRzVHlwZSxcbiAgICBjbGFzc0dyYXBoUUxGaW5kQXJncyxcbiAgICBjbGFzc0dyYXBoUUxPdXRwdXRUeXBlLFxuICAgIGNsYXNzR3JhcGhRTEZpbmRSZXN1bHRUeXBlLFxuICAgIGNvbmZpZzoge1xuICAgICAgcGFyc2VDbGFzc0NvbmZpZyxcbiAgICAgIGlzQ3JlYXRlRW5hYmxlZCxcbiAgICAgIGlzVXBkYXRlRW5hYmxlZCxcbiAgICB9LFxuICB9O1xuXG4gIGlmIChjbGFzc05hbWUgPT09ICdfVXNlcicpIHtcbiAgICBjb25zdCB2aWV3ZXJUeXBlID0gbmV3IEdyYXBoUUxPYmplY3RUeXBlKHtcbiAgICAgIG5hbWU6ICdWaWV3ZXInLFxuICAgICAgZGVzY3JpcHRpb246IGBUaGUgVmlld2VyIG9iamVjdCB0eXBlIGlzIHVzZWQgaW4gb3BlcmF0aW9ucyB0aGF0IGludm9sdmUgb3V0cHV0dGluZyB0aGUgY3VycmVudCB1c2VyIGRhdGEuYCxcbiAgICAgIGZpZWxkczogKCkgPT4gKHtcbiAgICAgICAgc2Vzc2lvblRva2VuOiBkZWZhdWx0R3JhcGhRTFR5cGVzLlNFU1NJT05fVE9LRU5fQVRULFxuICAgICAgICB1c2VyOiB7XG4gICAgICAgICAgZGVzY3JpcHRpb246ICdUaGlzIGlzIHRoZSBjdXJyZW50IHVzZXIuJyxcbiAgICAgICAgICB0eXBlOiBuZXcgR3JhcGhRTE5vbk51bGwoY2xhc3NHcmFwaFFMT3V0cHV0VHlwZSksXG4gICAgICAgIH0sXG4gICAgICB9KSxcbiAgICB9KTtcbiAgICBwYXJzZUdyYXBoUUxTY2hlbWEuYWRkR3JhcGhRTFR5cGUodmlld2VyVHlwZSwgdHJ1ZSwgdHJ1ZSk7XG4gICAgcGFyc2VHcmFwaFFMU2NoZW1hLnZpZXdlclR5cGUgPSB2aWV3ZXJUeXBlO1xuICB9XG59O1xuXG5leHBvcnQgeyBleHRyYWN0S2V5c0FuZEluY2x1ZGUsIGxvYWQgfTtcbiJdfQ==