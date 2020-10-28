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
//# sourceMappingURL=data:application/json;charset=utf-8;base64,eyJ2ZXJzaW9uIjozLCJzb3VyY2VzIjpbIi4uLy4uLy4uL3NyYy9HcmFwaFFML2xvYWRlcnMvcGFyc2VDbGFzc1R5cGVzLmpzIl0sIm5hbWVzIjpbImdldFBhcnNlQ2xhc3NUeXBlQ29uZmlnIiwicGFyc2VDbGFzc0NvbmZpZyIsInR5cGUiLCJnZXRJbnB1dEZpZWxkc0FuZENvbnN0cmFpbnRzIiwicGFyc2VDbGFzcyIsImNsYXNzRmllbGRzIiwiT2JqZWN0Iiwia2V5cyIsImZpZWxkcyIsImNvbmNhdCIsImlucHV0RmllbGRzIiwiYWxsb3dlZElucHV0RmllbGRzIiwib3V0cHV0RmllbGRzIiwiYWxsb3dlZE91dHB1dEZpZWxkcyIsImNvbnN0cmFpbnRGaWVsZHMiLCJhbGxvd2VkQ29uc3RyYWludEZpZWxkcyIsInNvcnRGaWVsZHMiLCJhbGxvd2VkU29ydEZpZWxkcyIsImNsYXNzT3V0cHV0RmllbGRzIiwiY2xhc3NDcmVhdGVGaWVsZHMiLCJjbGFzc1VwZGF0ZUZpZWxkcyIsImNsYXNzQ29uc3RyYWludEZpZWxkcyIsImNsYXNzU29ydEZpZWxkcyIsImNsYXNzQ3VzdG9tRmllbGRzIiwiZmlsdGVyIiwiZmllbGQiLCJkZWZhdWx0R3JhcGhRTFR5cGVzIiwiUEFSU0VfT0JKRUNUX0ZJRUxEUyIsImluY2x1ZGVzIiwiY3JlYXRlIiwidXBkYXRlIiwiY2xhc3NOYW1lIiwib3V0cHV0RmllbGQiLCJsZW5ndGgiLCJwdXNoIiwiYXNjIiwiZGVzYyIsIm1hcCIsImxvYWQiLCJwYXJzZUdyYXBoUUxTY2hlbWEiLCJncmFwaFFMQ2xhc3NOYW1lIiwiaXNDcmVhdGVFbmFibGVkIiwiaXNVcGRhdGVFbmFibGVkIiwiY2xhc3NHcmFwaFFMQ3JlYXRlVHlwZU5hbWUiLCJjbGFzc0dyYXBoUUxDcmVhdGVUeXBlIiwiR3JhcGhRTElucHV0T2JqZWN0VHlwZSIsIm5hbWUiLCJkZXNjcmlwdGlvbiIsInJlZHVjZSIsInRhcmdldENsYXNzIiwicGFyc2VDbGFzc1R5cGVzIiwicmVxdWlyZWQiLCJHcmFwaFFMTm9uTnVsbCIsIkFDTCIsIkFDTF9JTlBVVCIsImFkZEdyYXBoUUxUeXBlIiwiY2xhc3NHcmFwaFFMVXBkYXRlVHlwZU5hbWUiLCJjbGFzc0dyYXBoUUxVcGRhdGVUeXBlIiwiY2xhc3NHcmFwaFFMUG9pbnRlclR5cGVOYW1lIiwiY2xhc3NHcmFwaFFMUG9pbnRlclR5cGUiLCJsaW5rIiwiR3JhcGhRTElEIiwiT0JKRUNUIiwiY2xhc3NHcmFwaFFMUmVsYXRpb25UeXBlTmFtZSIsImNsYXNzR3JhcGhRTFJlbGF0aW9uVHlwZSIsImFkZCIsIkdyYXBoUUxMaXN0IiwiT0JKRUNUX0lEIiwicmVtb3ZlIiwiY2xhc3NHcmFwaFFMQ29uc3RyYWludHNUeXBlTmFtZSIsImNsYXNzR3JhcGhRTENvbnN0cmFpbnRzVHlwZSIsImxvZyIsIndhcm4iLCJwYXJzZUZpZWxkIiwiT1IiLCJBTkQiLCJOT1IiLCJjbGFzc0dyYXBoUUxSZWxhdGlvbkNvbnN0cmFpbnRzVHlwZU5hbWUiLCJjbGFzc0dyYXBoUUxSZWxhdGlvbkNvbnN0cmFpbnRzVHlwZSIsImhhdmUiLCJoYXZlTm90IiwiZXhpc3RzIiwiR3JhcGhRTEJvb2xlYW4iLCJjbGFzc0dyYXBoUUxPcmRlclR5cGVOYW1lIiwiY2xhc3NHcmFwaFFMT3JkZXJUeXBlIiwiR3JhcGhRTEVudW1UeXBlIiwidmFsdWVzIiwiZmllbGRDb25maWciLCJ1cGRhdGVkU29ydEZpZWxkcyIsInZhbHVlIiwiY2xhc3NHcmFwaFFMRmluZEFyZ3MiLCJ3aGVyZSIsIm9yZGVyIiwiR3JhcGhRTFN0cmluZyIsInNraXAiLCJTS0lQX0FUVCIsImNvbm5lY3Rpb25BcmdzIiwib3B0aW9ucyIsIlJFQURfT1BUSU9OU19BVFQiLCJjbGFzc0dyYXBoUUxPdXRwdXRUeXBlTmFtZSIsImludGVyZmFjZXMiLCJQQVJTRV9PQkpFQ1QiLCJyZWxheU5vZGVJbnRlcmZhY2UiLCJwYXJzZU9iamVjdEZpZWxkcyIsImlkIiwib2JqIiwib2JqZWN0SWQiLCJ0YXJnZXRQYXJzZUNsYXNzVHlwZXMiLCJhcmdzIiwidW5kZWZpbmVkIiwicmVzb2x2ZSIsInNvdXJjZSIsImNvbnRleHQiLCJxdWVyeUluZm8iLCJmaXJzdCIsImFmdGVyIiwibGFzdCIsImJlZm9yZSIsInJlYWRQcmVmZXJlbmNlIiwiaW5jbHVkZVJlYWRQcmVmZXJlbmNlIiwic3VicXVlcnlSZWFkUHJlZmVyZW5jZSIsImNvbmZpZyIsImF1dGgiLCJpbmZvIiwic2VsZWN0ZWRGaWVsZHMiLCJpbmNsdWRlIiwic3RhcnRzV2l0aCIsInJlcGxhY2UiLCJwYXJzZU9yZGVyIiwiam9pbiIsIm9iamVjdHNRdWVyaWVzIiwiZmluZE9iamVjdHMiLCIkcmVsYXRlZFRvIiwib2JqZWN0IiwiX190eXBlIiwia2V5IiwicGFyc2VDbGFzc2VzIiwiZSIsImhhbmRsZUVycm9yIiwiY29vcmRpbmF0ZXMiLCJjb29yZGluYXRlIiwibGF0aXR1ZGUiLCJsb25naXR1ZGUiLCJlbGVtIiwiY2xhc3NHcmFwaFFMT3V0cHV0VHlwZSIsIkdyYXBoUUxPYmplY3RUeXBlIiwiY29ubmVjdGlvblR5cGUiLCJlZGdlVHlwZSIsImNvbm5lY3Rpb25GaWVsZHMiLCJjb3VudCIsIkNPVU5UX0FUVCIsIm5vZGVUeXBlIiwiY2xhc3NHcmFwaFFMRmluZFJlc3VsdFR5cGUiLCJ2aWV3ZXJUeXBlIiwic2Vzc2lvblRva2VuIiwiU0VTU0lPTl9UT0tFTl9BVFQiLCJ1c2VyIl0sIm1hcHBpbmdzIjoiOzs7Ozs7Ozs7Ozs7O0FBQUE7O0FBVUE7O0FBS0E7O0FBQ0E7O0FBQ0E7O0FBQ0E7O0FBQ0E7O0FBQ0E7O0FBQ0E7O0FBQ0E7O0FBQ0E7Ozs7Ozs7Ozs7Ozs7O0FBS0EsTUFBTUEsdUJBQXVCLEdBQUcsVUFDOUJDLGdCQUQ4QixFQUU5QjtBQUNBLFNBQVFBLGdCQUFnQixJQUFJQSxnQkFBZ0IsQ0FBQ0MsSUFBdEMsSUFBK0MsRUFBdEQ7QUFDRCxDQUpEOztBQU1BLE1BQU1DLDRCQUE0QixHQUFHLFVBQ25DQyxVQURtQyxFQUVuQ0gsZ0JBRm1DLEVBR25DO0FBQ0EsUUFBTUksV0FBVyxHQUFHQyxNQUFN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dUJBRDhDO0FBRTlDSyxJQUFBQSx3QkFGOEM7QUFHOUNwQixJQUFBQSxzQkFIOEM7QUFJOUNhLElBQUFBLHNCQUo4QztBQUs5Q2EsSUFBQUEsMkJBTDhDO0FBTTlDUSxJQUFBQSxtQ0FOOEM7QUFPOUNZLElBQUFBLG9CQVA4QztBQVE5Q3NELElBQUFBLHNCQVI4QztBQVM5Q1EsSUFBQUEsMEJBVDhDO0FBVTlDL0IsSUFBQUEsTUFBTSxFQUFFO0FBQ054SCxNQUFBQSxnQkFETTtBQUVOd0MsTUFBQUEsZUFGTTtBQUdOQyxNQUFBQTtBQUhNO0FBVnNDLEdBQWhEOztBQWlCQSxNQUFJWCxTQUFTLEtBQUssT0FBbEIsRUFBMkI7QUFDekIsVUFBTTBILFVBQVUsR0FBRyxJQUFJUiwwQkFBSixDQUFzQjtBQUN2Q25HLE1BQUFBLElBQUksRUFBRSxRQURpQztBQUV2Q0MsTUFBQUEsV0FBVyxFQUFHLDZGQUZ5QjtBQUd2Q3ZDLE1BQUFBLE1BQU0sRUFBRSxPQUFPO0FBQ2JrSixRQUFBQSxZQUFZLEVBQUVoSSxtQkFBbUIsQ0FBQ2lJLGlCQURyQjtBQUViQyxRQUFBQSxJQUFJLEVBQUU7QUFDSjdHLFVBQUFBLFdBQVcsRUFBRSwyQkFEVDtBQUVKN0MsVUFBQUEsSUFBSSxFQUFFLElBQUlrRCx1QkFBSixDQUFtQjRGLHNCQUFuQjtBQUZGO0FBRk8sT0FBUDtBQUgrQixLQUF0QixDQUFuQjtBQVdBekcsSUFBQUEsa0JBQWtCLENBQUNnQixjQUFuQixDQUFrQ2tHLFVBQWxDLEVBQThDLElBQTlDLEVBQW9ELElBQXBEO0FBQ0FsSCxJQUFBQSxrQkFBa0IsQ0FBQ2tILFVBQW5CLEdBQWdDQSxVQUFoQztBQUNEO0FBQ0YsQ0FwZEQiLCJzb3VyY2VzQ29udGVudCI6WyJpbXBvcnQge1xuICBHcmFwaFFMSUQsXG4gIEdyYXBoUUxPYmplY3RUeXBlLFxuICBHcmFwaFFMU3RyaW5nLFxuICBHcmFwaFFMTGlzdCxcbiAgR3JhcGhRTElucHV0T2JqZWN0VHlwZSxcbiAgR3JhcGhRTE5vbk51bGwsXG4gIEdyYXBoUUxCb29sZWFuLFxuICBHcmFwaFFMRW51bVR5cGUsXG59IGZyb20gJ2dyYXBocWwnO1xuaW1wb3J0IHtcbiAgZ2xvYmFsSWRGaWVsZCxcbiAgY29ubmVjdGlvbkFyZ3MsXG4gIGNvbm5lY3Rpb25EZWZpbml0aW9ucyxcbn0gZnJvbSAnZ3JhcGhxbC1yZWxheSc7XG5pbXBvcnQgZ2V0RmllbGROYW1lcyBmcm9tICdncmFwaHFsLWxpc3QtZmllbGRzJztcbmltcG9ydCAqIGFzIGRlZmF1bHRHcmFwaFFMVHlwZXMgZnJvbSAnLi9kZWZhdWx0R3JhcGhRTFR5cGVzJztcbmltcG9ydCAqIGFzIG9iamVjdHNRdWVyaWVzIGZyb20gJy4uL2hlbHBlcnMvb2JqZWN0c1F1ZXJpZXMnO1xuaW1wb3J0IHsgUGFyc2VHcmFwaFFMQ2xhc3NDb25maWcgfSBmcm9tICcuLi8uLi9Db250cm9sbGVycy9QYXJzZUdyYXBoUUxDb250cm9sbGVyJztcbmltcG9ydCB7IHRyYW5zZm9ybUNsYXNzTmFtZVRvR3JhcGhRTCB9IGZyb20gJy4uL3RyYW5zZm9ybWVycy9jbGFzc05hbWUnO1xuaW1wb3J0IHsgdHJhbnNmb3JtSW5wdXRUeXBlVG9HcmFwaFFMIH0gZnJvbSAnLi4vdHJhbnNmb3JtZXJzL2lucHV0VHlwZSc7XG5pbXBvcnQgeyB0cmFuc2Zvcm1PdXRwdXRUeXBlVG9HcmFwaFFMIH0gZnJvbSAnLi4vdHJhbnNmb3JtZXJzL291dHB1dFR5cGUnO1xuaW1wb3J0IHsgdHJhbnNmb3JtQ29uc3RyYWludFR5cGVUb0dyYXBoUUwgfSBmcm9tICcuLi90cmFuc2Zvcm1lcnMvY29uc3RyYWludFR5cGUnO1xuaW1wb3J0IHtcbiAgZXh0cmFjdEtleXNBbmRJbmNsdWRlLFxuICBnZXRQYXJzZUNsYXNzTXV0YXRpb25Db25maWcsXG59IGZyb20gJy4uL3BhcnNlR3JhcGhRTFV0aWxzJztcblxuY29uc3QgZ2V0UGFyc2VDbGFzc1R5cGVDb25maWcgPSBmdW5jdGlvbiAoXG4gIHBhcnNlQ2xhc3NDb25maWc6ID9QYXJzZUdyYXBoUUxDbGFzc0NvbmZpZ1xuKSB7XG4gIHJldHVybiAocGFyc2VDbGFzc0NvbmZpZyAmJiBwYXJzZUNsYXNzQ29uZmlnLnR5cGUpIHx8IHt9O1xufTtcblxuY29uc3QgZ2V0SW5wdXRGaWVsZHNBbmRDb25zdHJhaW50cyA9IGZ1bmN0aW9uIChcbiAgcGFyc2VDbGFzcyxcbiAgcGFyc2VDbGFzc0NvbmZpZzogP1BhcnNlR3JhcGhRTENsYXNzQ29uZmlnXG4pIHtcbiAgY29uc3QgY2xhc3NGaWVsZHMgPSBPYmplY3Qua2V5cyhwYXJzZUNsYXNzLmZpZWxkcykuY29uY2F0KCdpZCcpO1xuICBjb25zdCB7XG4gICAgaW5wdXRGaWVsZHM6IGFsbG93ZWRJbnB1dEZpZWxkcyxcbiAgICBvdXRwdXRGaWVsZHM6IGFsbG93ZWRPdXRwdXRGaWVsZHMsXG4gICAgY29uc3RyYWludEZpZWxkczogYWxsb3dlZENvbnN0cmFpbnRGaWVsZHMsXG4gICAgc29ydEZpZWxkczogYWxsb3dlZFNvcnRGaWVsZHMsXG4gIH0gPSBnZXRQYXJzZUNsYXNzVHlwZUNvbmZpZyhwYXJzZUNsYXNzQ29uZmlnKTtcblxuICBsZXQgY2xhc3NPdXRwdXRGaWVsZHM7XG4gIGxldCBjbGFzc0NyZWF0ZUZpZWxkcztcbiAgbGV0IGNsYXNzVXBkYXRlRmllbGRzO1xuICBsZXQgY2xhc3NDb25zdHJhaW50RmllbGRzO1xuICBsZXQgY2xhc3NTb3J0RmllbGRzO1xuXG4gIC8vIEFsbCBhbGxvd2VkIGN1c3RvbXMgZmllbGRzXG4gIGNvbnN0IGNsYXNzQ3VzdG9tRmllbGRzID0gY2xhc3NGaWVsZHMuZmlsdGVyKChmaWVsZCkgPT4ge1xuICAgIHJldHVybiAoXG4gICAgICAhT2JqZWN0LmtleXMoZGVmYXVsdEdyYXBoUUxUeXBlcy5QQVJTRV9PQkpFQ1RfRklFTERTKS5pbmNsdWRlcyhmaWVsZCkgJiZcbiAgICAgIGZpZWxkICE9PSAnaWQnXG4gICAgKTtcbiAgfSk7XG5cbiAgaWYgKGFsbG93ZWRJbnB1dEZpZWxkcyAmJiBhbGxvd2VkSW5wdXRGaWVsZHMuY3JlYXRlKSB7XG4gICAgY2xhc3NDcmVhdGVGaWVsZHMgPSBjbGFzc0N1c3RvbUZpZWxkcy5maWx0ZXIoKGZpZWxkKSA9PiB7XG4gICAgICByZXR1cm4gYWxsb3dlZElucHV0RmllbGRzLmNyZWF0ZS5pbmNsdWRlcyhmaWVsZCk7XG4gICAgfSk7XG4gIH0gZWxzZSB7XG4gICAgY2xhc3NDcmVhdGVGaWVsZHMgPSBjbGFzc0N1c3RvbUZpZWxkcztcbiAgfVxuICBpZiAoYWxsb3dlZElucHV0RmllbGRzICYmIGFsbG93ZWRJbnB1dEZpZWxkcy51cGRhdGUpIHtcbiAgICBjbGFzc1VwZGF0ZUZpZWxkcyA9IGNsYXNzQ3VzdG9tRmllbGRzLmZpbHRlcigoZmllbGQpID0+IHtcbiAgICAgIHJldHVybiBhbGxvd2VkSW5wdXRGaWVsZHMudXBkYXRlLmluY2x1ZGVzKGZpZWxkKTtcbiAgICB9KTtcbiAgfSBlbHNlIHtcbiAgICBjbGFzc1VwZGF0ZUZpZWxkcyA9IGNsYXNzQ3VzdG9tRmllbGRzO1xuICB9XG5cbiAgaWYgKGFsbG93ZWRPdXRwdXRGaWVsZHMpIHtcbiAgICBjbGFzc091dHB1dEZpZWxkcyA9IGNsYXNzQ3VzdG9tRmllbGRzLmZpbHRlcigoZmllbGQpID0+IHtcbiAgICAgIHJldHVybiBhbGxvd2VkT3V0cHV0RmllbGRzLmluY2x1ZGVzKGZpZWxkKTtcbiAgICB9KTtcbiAgfSBlbHNlIHtcbiAgICBjbGFzc091dHB1dEZpZWxkcyA9IGNsYXNzQ3VzdG9tRmllbGRzO1xuICB9XG4gIC8vIEZpbHRlcnMgdGhlIFwicGFzc3dvcmRcIiBmaWVsZCBmcm9tIGNsYXNzIF9Vc2VyXG4gIGlmIChwYXJzZUNsYXNzLmNsYXNzTmFtZSA9PT0gJ19Vc2VyJykge1xuICAgIGNsYXNzT3V0cHV0RmllbGRzID0gY2xhc3NPdXRwdXRGaWVsZHMuZmlsdGVyKFxuICAgICAgKG91dHB1dEZpZWxkKSA9PiBvdXRwdXRGaWVsZCAhPT0gJ3Bhc3N3b3JkJ1xuICAgICk7XG4gIH1cblxuICBpZiAoYWxsb3dlZENvbnN0cmFpbnRGaWVsZHMpIHtcbiAgICBjbGFzc0NvbnN0cmFpbnRGaWVsZHMgPSBjbGFzc0N1c3RvbUZpZWxkcy5maWx0ZXIoKGZpZWxkKSA9PiB7XG4gICAgICByZXR1cm4gYWxsb3dlZENvbnN0cmFpbnRGaWVsZHMuaW5jbHVkZXMoZmllbGQpO1xuICAgIH0pO1xuICB9IGVsc2Uge1xuICAgIGNsYXNzQ29uc3RyYWludEZpZWxkcyA9IGNsYXNzRmllbGRzO1xuICB9XG5cbiAgaWYgKGFsbG93ZWRTb3J0RmllbGRzKSB7XG4gICAgY2xhc3NTb3J0RmllbGRzID0gYWxsb3dlZFNvcnRGaWVsZHM7XG4gICAgaWYgKCFjbGFzc1NvcnRGaWVsZHMubGVuZ3RoKSB7XG4gICAgICAvLyBtdXN0IGhhdmUgYXQgbGVhc3QgMSBvcmRlciBmaWVsZFxuICAgICAgLy8gb3RoZXJ3aXNlIHRoZSBGaW5kQXJncyBJbnB1dCBUeXBlIHdpbGwgdGhyb3cuXG4gICAgICBjbGFzc1NvcnRGaWVsZHMucHVzaCh7XG4gICAgICAgIGZpZWxkOiAnaWQnLFxuICAgICAgICBhc2M6IHRydWUsXG4gICAgICAgIGRlc2M6IHRydWUsXG4gICAgICB9KTtcbiAgICB9XG4gIH0gZWxzZSB7XG4gICAgY2xhc3NTb3J0RmllbGRzID0gY2xhc3NGaWVsZHMubWFwKChmaWVsZCkgPT4ge1xuICAgICAgcmV0dXJuIHsgZmllbGQsIGFzYzogdHJ1ZSwgZGVzYzogdHJ1ZSB9O1xuICAgIH0pO1xuICB9XG5cbiAgcmV0dXJuIHtcbiAgICBjbGFzc0NyZWF0ZUZpZWxkcyxcbiAgICBjbGFzc1VwZGF0ZUZpZWxkcyxcbiAgICBjbGFzc0NvbnN0cmFpbnRGaWVsZHMsXG4gICAgY2xhc3NPdXRwdXRGaWVsZHMsXG4gICAgY2xhc3NTb3J0RmllbGRzLFxuICB9O1xufTtcblxuY29uc3QgbG9hZCA9IChcbiAgcGFyc2VHcmFwaFFMU2NoZW1hLFxuICBwYXJzZUNsYXNzLFxuICBwYXJzZUNsYXNzQ29uZmlnOiA/UGFyc2VHcmFwaFFMQ2xhc3NDb25maWdcbikgPT4ge1xuICBjb25zdCBjbGFzc05hbWUgPSBwYXJzZUNsYXNzLmNsYXNzTmFtZTtcbiAgY29uc3QgZ3JhcGhRTENsYXNzTmFtZSA9IHRyYW5zZm9ybUNsYXNzTmFtZVRvR3JhcGhRTChjbGFzc05hbWUpO1xuICBjb25zdCB7XG4gICAgY2xhc3NDcmVhdGVGaWVsZHMsXG4gICAgY2xhc3NVcGRhdGVGaWVsZHMsXG4gICAgY2xhc3NPdXRwdXRGaWVsZHMsXG4gICAgY2xhc3NDb25zdHJhaW50RmllbGRzLFxuICAgIGNsYXNzU29ydEZpZWxkcyxcbiAgfSA9IGdldElucHV0RmllbGRzQW5kQ29uc3RyYWludHMocGFyc2VDbGFzcywgcGFyc2VDbGFzc0NvbmZpZyk7XG5cbiAgY29uc3Qge1xuICAgIGNyZWF0ZTogaXNDcmVhdGVFbmFibGVkID0gdHJ1ZSxcbiAgICB1cGRhdGU6IGlzVXBkYXRlRW5hYmxlZCA9IHRydWUsXG4gIH0gPSBnZXRQYXJzZUNsYXNzTXV0YXRpb25Db25maWcocGFyc2VDbGFzc0NvbmZpZyk7XG5cbiAgY29uc3QgY2xhc3NHcmFwaFFMQ3JlYXRlVHlwZU5hbWUgPSBgQ3JlYXRlJHtncmFwaFFMQ2xhc3NOYW1lfUZpZWxkc0lucHV0YDtcbiAgbGV0IGNsYXNzR3JhcGhRTENyZWF0ZVR5cGUgPSBuZXcgR3JhcGhRTElucHV0T2JqZWN0VHlwZSh7XG4gICAgbmFtZTogY2xhc3NHcmFwaFFMQ3JlYXRlVHlwZU5hbWUsXG4gICAgZGVzY3JpcHRpb246IGBUaGUgJHtjbGFzc0dyYXBoUUxDcmVhdGVUeXBlTmFtZX0gaW5wdXQgdHlwZSBpcyB1c2VkIGluIG9wZXJhdGlvbnMgdGhhdCBpbnZvbHZlIGNyZWF0aW9uIG9mIG9iamVjdHMgaW4gdGhlICR7Z3JhcGhRTENsYXNzTmFtZX0gY2xhc3MuYCxcbiAgICBmaWVsZHM6ICgpID0+XG4gICAgICBjbGFzc0NyZWF0ZUZpZWxkcy5yZWR1Y2UoXG4gICAgICAgIChmaWVsZHMsIGZpZWxkKSA9PiB7XG4gICAgICAgICAgY29uc3QgdHlwZSA9IHRyYW5zZm9ybUlucHV0VHlwZVRvR3JhcGhRTChcbiAgICAgICAgICAgIHBhcnNlQ2xhc3MuZmllbGRzW2ZpZWxkXS50eXBlLFxuICAgICAgICAgICAgcGFyc2VDbGFzcy5maWVsZHNbZmllbGRdLnRhcmdldENsYXNzLFxuICAgICAgICAgICAgcGFyc2VHcmFwaFFMU2NoZW1hLnBhcnNlQ2xhc3NUeXBlc1xuICAgICAgICAgICk7XG4gICAgICAgICAgaWYgKHR5cGUpIHtcbiAgICAgICAgICAgIHJldHVybiB7XG4gICAgICAgICAgICAgIC4uLmZpZWxkcyxcbiAgICAgICAgICAgICAgW2ZpZWxkXToge1xuICAgICAgICAgICAgICAgIGRlc2NyaXB0aW9uOiBgVGhpcyBpcyB0aGUgb2JqZWN0ICR7ZmllbGR9LmAsXG4gICAgICAgICAgICAgICAgdHlwZTpcbiAgICAgICAgICAgICAgICAgIChjbGFzc05hbWUgPT09ICdfVXNlcicgJiZcbiAgICAgICAgICAgICAgICAgICAgKGZpZWxkID09PSAndXNlcm5hbWUnIHx8IGZpZWxkID09PSAncGFzc3dvcmQnKSkgfHxcbiAgICAgICAgICAgICAgICAgIHBhcnNlQ2xhc3MuZmllbGRzW2ZpZWxkXS5yZXF1aXJlZFxuICAgICAgICAgICAgICAgICAgICA/IG5ldyBHcmFwaFFMTm9uTnVsbCh0eXBlKVxuICAgICAgICAgICAgICAgICAgICA6IHR5cGUsXG4gICAgICAgICAgICAgIH0sXG4gICAgICAgICAgICB9O1xuICAgICAgICAgIH0gZWxzZSB7XG4gICAgICAgICAgICByZXR1cm4gZmllbGRzO1xuICAgICAgICAgIH1cbiAgICAgICAgfSxcbiAgICAgICAge1xuICAgICAgICAgIEFDTDogeyB0eXBlOiBkZWZhdWx0R3JhcGhRTFR5cGVzLkFDTF9JTlBVVCB9LFxuICAgICAgICB9XG4gICAgICApLFxuICB9KTtcbiAgY2xhc3NHcmFwaFFMQ3JlYXRlVHlwZSA9IHBhcnNlR3JhcGhRTFNjaGVtYS5hZGRHcmFwaFFMVHlwZShcbiAgICBjbGFzc0dyYXBoUUxDcmVhdGVUeXBlXG4gICk7XG5cbiAgY29uc3QgY2xhc3NHcmFwaFFMVXBkYXRlVHlwZU5hbWUgPSBgVXBkYXRlJHtncmFwaFFMQ2xhc3NOYW1lfUZpZWxkc0lucHV0YDtcbiAgbGV0IGNsYXNzR3JhcGhRTFVwZGF0ZVR5cGUgPSBuZXcgR3JhcGhRTElucHV0T2JqZWN0VHlwZSh7XG4gICAgbmFtZTogY2xhc3NHcmFwaFFMVXBkYXRlVHlwZU5hbWUsXG4gICAgZGVzY3JpcHRpb246IGBUaGUgJHtjbGFzc0dyYXBoUUxVcGRhdGVUeXBlTmFtZX0gaW5wdXQgdHlwZSBpcyB1c2VkIGluIG9wZXJhdGlvbnMgdGhhdCBpbnZvbHZlIGNyZWF0aW9uIG9mIG9iamVjdHMgaW4gdGhlICR7Z3JhcGhRTENsYXNzTmFtZX0gY2xhc3MuYCxcbiAgICBmaWVsZHM6ICgpID0+XG4gICAgICBjbGFzc1VwZGF0ZUZpZWxkcy5yZWR1Y2UoXG4gICAgICAgIChmaWVsZHMsIGZpZWxkKSA9PiB7XG4gICAgICAgICAgY29uc3QgdHlwZSA9IHRyYW5zZm9ybUlucHV0VHlwZVRvR3JhcGhRTChcbiAgICAgICAgICAgIHBhcnNlQ2xhc3MuZmllbGRzW2ZpZWxkXS50eXBlLFxuICAgICAgICAgICAgcGFyc2VDbGFzcy5maWVsZHNbZmllbGRdLnRhcmdldENsYXNzLFxuICAgICAgICAgICAgcGFyc2VHcmFwaFFMU2NoZW1hLnBhcnNlQ2xhc3NUeXBlc1xuICAgICAgICAgICk7XG4gICAgICAgICAgaWYgKHR5cGUpIHtcbiAgICAgICAgICAgIHJldHVybiB7XG4gICAgICAgICAgICAgIC4uLmZpZWxkcyxcbiAgICAgICAgICAgICAgW2ZpZWxkXToge1xuICAgICAgICAgICAgICAgIGRlc2NyaXB0aW9uOiBgVGhpcyBpcyB0aGUgb2JqZWN0ICR7ZmllbGR9LmAsXG4gICAgICAgICAgICAgICAgdHlwZSxcbiAgICAgICAgICAgICAgfSxcbiAgICAgICAgICAgIH07XG4gICAgICAgICAgfSBlbHNlIHtcbiAgICAgICAgICAgIHJldHVybiBmaWVsZHM7XG4gICAgICAgICAgfVxuICAgICAgICB9LFxuICAgICAgICB7XG4gICAgICAgICAgQUNMOiB7IHR5cGU6IGRlZmF1bHRHcmFwaFFMVHlwZXMuQUNMX0lOUFVUIH0sXG4gICAgICAgIH1cbiAgICAgICksXG4gIH0pO1xuICBjbGFzc0dyYXBoUUxVcGRhdGVUeXBlID0gcGFyc2VHcmFwaFFMU2NoZW1hLmFkZEdyYXBoUUxUeXBlKFxuICAgIGNsYXNzR3JhcGhRTFVwZGF0ZVR5cGVcbiAgKTtcblxuICBjb25zdCBjbGFzc0dyYXBoUUxQb2ludGVyVHlwZU5hbWUgPSBgJHtncmFwaFFMQ2xhc3NOYW1lfVBvaW50ZXJJbnB1dGA7XG4gIGxldCBjbGFzc0dyYXBoUUxQb2ludGVyVHlwZSA9IG5ldyBHcmFwaFFMSW5wdXRPYmplY3RUeXBlKHtcbiAgICBuYW1lOiBjbGFzc0dyYXBoUUxQb2ludGVyVHlwZU5hbWUsXG4gICAgZGVzY3JpcHRpb246IGBBbGxvdyB0byBsaW5rIE9SIGFkZCBhbmQgbGluayBhbiBvYmplY3Qgb2YgdGhlICR7Z3JhcGhRTENsYXNzTmFtZX0gY2xhc3MuYCxcbiAgICBmaWVsZHM6ICgpID0+IHtcbiAgICAgIGNvbnN0IGZpZWxkcyA9IHtcbiAgICAgICAgbGluazoge1xuICAgICAgICAgIGRlc2NyaXB0aW9uOiBgTGluayBhbiBleGlzdGluZyBvYmplY3QgZnJvbSAke2dyYXBoUUxDbGFzc05hbWV9IGNsYXNzLiBZb3UgY2FuIHVzZSBlaXRoZXIgdGhlIGdsb2JhbCBvciB0aGUgb2JqZWN0IGlkLmAsXG4gICAgICAgICAgdHlwZTogR3JhcGhRTElELFxuICAgICAgICB9LFxuICAgICAgfTtcbiAgICAgIGlmIChpc0NyZWF0ZUVuYWJsZWQpIHtcbiAgICAgICAgZmllbGRzWydjcmVhdGVBbmRMaW5rJ10gPSB7XG4gICAgICAgICAgZGVzY3JpcHRpb246IGBDcmVhdGUgYW5kIGxpbmsgYW4gb2JqZWN0IGZyb20gJHtncmFwaFFMQ2xhc3NOYW1lfSBjbGFzcy5gLFxuICAgICAgICAgIHR5cGU6IGNsYXNzR3JhcGhRTENyZWF0ZVR5cGUsXG4gICAgICAgIH07XG4gICAgICB9XG4gICAgICByZXR1cm4gZmllbGRzO1xuICAgIH0sXG4gIH0pO1xuICBjbGFzc0dyYXBoUUxQb2ludGVyVHlwZSA9XG4gICAgcGFyc2VHcmFwaFFMU2NoZW1hLmFkZEdyYXBoUUxUeXBlKGNsYXNzR3JhcGhRTFBvaW50ZXJUeXBlKSB8fFxuICAgIGRlZmF1bHRHcmFwaFFMVHlwZXMuT0JKRUNUO1xuXG4gIGNvbnN0IGNsYXNzR3JhcGhRTFJlbGF0aW9uVHlwZU5hbWUgPSBgJHtncmFwaFFMQ2xhc3NOYW1lfVJlbGF0aW9uSW5wdXRgO1xuICBsZXQgY2xhc3NHcmFwaFFMUmVsYXRpb25UeXBlID0gbmV3IEdyYXBoUUxJbnB1dE9iamVjdFR5cGUoe1xuICAgIG5hbWU6IGNsYXNzR3JhcGhRTFJlbGF0aW9uVHlwZU5hbWUsXG4gICAgZGVzY3JpcHRpb246IGBBbGxvdyB0byBhZGQsIHJlbW92ZSwgY3JlYXRlQW5kQWRkIG9iamVjdHMgb2YgdGhlICR7Z3JhcGhRTENsYXNzTmFtZX0gY2xhc3MgaW50byBhIHJlbGF0aW9uIGZpZWxkLmAsXG4gICAgZmllbGRzOiAoKSA9PiB7XG4gICAgICBjb25zdCBmaWVsZHMgPSB7XG4gICAgICAgIGFkZDoge1xuICAgICAgICAgIGRlc2NyaXB0aW9uOiBgQWRkIGV4aXN0aW5nIG9iamVjdHMgZnJvbSB0aGUgJHtncmFwaFFMQ2xhc3NOYW1lfSBjbGFzcyBpbnRvIHRoZSByZWxhdGlvbi4gWW91IGNhbiB1c2UgZWl0aGVyIHRoZSBnbG9iYWwgb3IgdGhlIG9iamVjdCBpZHMuYCxcbiAgICAgICAgICB0eXBlOiBuZXcgR3JhcGhRTExpc3QoZGVmYXVsdEdyYXBoUUxUeXBlcy5PQkpFQ1RfSUQpLFxuICAgICAgICB9LFxuICAgICAgICByZW1vdmU6IHtcbiAgICAgICAgICBkZXNjcmlwdGlvbjogYFJlbW92ZSBleGlzdGluZyBvYmplY3RzIGZyb20gdGhlICR7Z3JhcGhRTENsYXNzTmFtZX0gY2xhc3Mgb3V0IG9mIHRoZSByZWxhdGlvbi4gWW91IGNhbiB1c2UgZWl0aGVyIHRoZSBnbG9iYWwgb3IgdGhlIG9iamVjdCBpZHMuYCxcbiAgICAgICAgICB0eXBlOiBuZXcgR3JhcGhRTExpc3QoZGVmYXVsdEdyYXBoUUxUeXBlcy5PQkpFQ1RfSUQpLFxuICAgICAgICB9LFxuICAgICAgfTtcbiAgICAgIGlmIChpc0NyZWF0ZUVuYWJsZWQpIHtcbiAgICAgICAgZmllbGRzWydjcmVhdGVBbmRBZGQnXSA9IHtcbiAgICAgICAgICBkZXNjcmlwdGlvbjogYENyZWF0ZSBhbmQgYWRkIG9iamVjdHMgb2YgdGhlICR7Z3JhcGhRTENsYXNzTmFtZX0gY2xhc3MgaW50byB0aGUgcmVsYXRpb24uYCxcbiAgICAgICAgICB0eXBlOiBuZXcgR3JhcGhRTExpc3QobmV3IEdyYXBoUUxOb25OdWxsKGNsYXNzR3JhcGhRTENyZWF0ZVR5cGUpKSxcbiAgICAgICAgfTtcbiAgICAgIH1cbiAgICAgIHJldHVybiBmaWVsZHM7XG4gICAgfSxcbiAgfSk7XG4gIGNsYXNzR3JhcGhRTFJlbGF0aW9uVHlwZSA9XG4gICAgcGFyc2VHcmFwaFFMU2NoZW1hLmFkZEdyYXBoUUxUeXBlKGNsYXNzR3JhcGhRTFJlbGF0aW9uVHlwZSkgfHxcbiAgICBkZWZhdWx0R3JhcGhRTFR5cGVzLk9CSkVDVDtcblxuICBjb25zdCBjbGFzc0dyYXBoUUxDb25zdHJhaW50c1R5cGVOYW1lID0gYCR7Z3JhcGhRTENsYXNzTmFtZX1XaGVyZUlucHV0YDtcbiAgbGV0IGNsYXNzR3JhcGhRTENvbnN0cmFpbnRzVHlwZSA9IG5ldyBHcmFwaFFMSW5wdXRPYmplY3RUeXBlKHtcbiAgICBuYW1lOiBjbGFzc0dyYXBoUUxDb25zdHJhaW50c1R5cGVOYW1lLFxuICAgIGRlc2NyaXB0aW9uOiBgVGhlICR7Y2xhc3NHcmFwaFFMQ29uc3RyYWludHNUeXBlTmFtZX0gaW5wdXQgdHlwZSBpcyB1c2VkIGluIG9wZXJhdGlvbnMgdGhhdCBpbnZvbHZlIGZpbHRlcmluZyBvYmplY3RzIG9mICR7Z3JhcGhRTENsYXNzTmFtZX0gY2xhc3MuYCxcbiAgICBmaWVsZHM6ICgpID0+ICh7XG4gICAgICAuLi5jbGFzc0NvbnN0cmFpbnRGaWVsZHMucmVkdWNlKChmaWVsZHMsIGZpZWxkKSA9PiB7XG4gICAgICAgIGlmIChbJ09SJywgJ0FORCcsICdOT1InXS5pbmNsdWRlcyhmaWVsZCkpIHtcbiAgICAgICAgICBwYXJzZUdyYXBoUUxTY2hlbWEubG9nLndhcm4oXG4gICAgICAgICAgICBgRmllbGQgJHtmaWVsZH0gY291bGQgbm90IGJlIGFkZGVkIHRvIHRoZSBhdXRvIHNjaGVtYSAke2NsYXNzR3JhcGhRTENvbnN0cmFpbnRzVHlwZU5hbWV9IGJlY2F1c2UgaXQgY29sbGlkZWQgd2l0aCBhbiBleGlzdGluZyBvbmUuYFxuICAgICAgICAgICk7XG4gICAgICAgICAgcmV0dXJuIGZpZWxkcztcbiAgICAgICAgfVxuICAgICAgICBjb25zdCBwYXJzZUZpZWxkID0gZmllbGQgPT09ICdpZCcgPyAnb2JqZWN0SWQnIDogZmllbGQ7XG4gICAgICAgIGNvbnN0IHR5cGUgPSB0cmFuc2Zvcm1Db25zdHJhaW50VHlwZVRvR3JhcGhRTChcbiAgICAgICAgICBwYXJzZUNsYXNzLmZpZWxkc1twYXJzZUZpZWxkXS50eXBlLFxuICAgICAgICAgIHBhcnNlQ2xhc3MuZmllbGRzW3BhcnNlRmllbGRdLnRhcmdldENsYXNzLFxuICAgICAgICAgIHBhcnNlR3JhcGhRTFNjaGVtYS5wYXJzZUNsYXNzVHlwZXMsXG4gICAgICAgICAgZmllbGRcbiAgICAgICAgKTtcbiAgICAgICAgaWYgKHR5cGUpIHtcbiAgICAgICAgICByZXR1cm4ge1xuICAgICAgICAgICAgLi4uZmllbGRzLFxuICAgICAgICAgICAgW2ZpZWxkXToge1xuICAgICAgICAgICAgICBkZXNjcmlwdGlvbjogYFRoaXMgaXMgdGhlIG9iamVjdCAke2ZpZWxkfS5gLFxuICAgICAgICAgICAgICB0eXBlLFxuICAgICAgICAgICAgfSxcbiAgICAgICAgICB9O1xuICAgICAgICB9IGVsc2Uge1xuICAgICAgICAgIHJldHVybiBmaWVsZHM7XG4gICAgICAgIH1cbiAgICAgIH0sIHt9KSxcbiAgICAgIE9SOiB7XG4gICAgICAgIGRlc2NyaXB0aW9uOiAnVGhpcyBpcyB0aGUgT1Igb3BlcmF0b3IgdG8gY29tcG91bmQgY29uc3RyYWludHMuJyxcbiAgICAgICAgdHlwZTogbmV3IEdyYXBoUUxMaXN0KG5ldyBHcmFwaFFMTm9uTnVsbChjbGFzc0dyYXBoUUxDb25zdHJhaW50c1R5cGUpKSxcbiAgICAgIH0sXG4gICAgICBBTkQ6IHtcbiAgICAgICAgZGVzY3JpcHRpb246ICdUaGlzIGlzIHRoZSBBTkQgb3BlcmF0b3IgdG8gY29tcG91bmQgY29uc3RyYWludHMuJyxcbiAgICAgICAgdHlwZTogbmV3IEdyYXBoUUxMaXN0KG5ldyBHcmFwaFFMTm9uTnVsbChjbGFzc0dyYXBoUUxDb25zdHJhaW50c1R5cGUpKSxcbiAgICAgIH0sXG4gICAgICBOT1I6IHtcbiAgICAgICAgZGVzY3JpcHRpb246ICdUaGlzIGlzIHRoZSBOT1Igb3BlcmF0b3IgdG8gY29tcG91bmQgY29uc3RyYWludHMuJyxcbiAgICAgICAgdHlwZTogbmV3IEdyYXBoUUxMaXN0KG5ldyBHcmFwaFFMTm9uTnVsbChjbGFzc0dyYXBoUUxDb25zdHJhaW50c1R5cGUpKSxcbiAgICAgIH0sXG4gICAgfSksXG4gIH0pO1xuICBjbGFzc0dyYXBoUUxDb25zdHJhaW50c1R5cGUgPVxuICAgIHBhcnNlR3JhcGhRTFNjaGVtYS5hZGRHcmFwaFFMVHlwZShjbGFzc0dyYXBoUUxDb25zdHJhaW50c1R5cGUpIHx8XG4gICAgZGVmYXVsdEdyYXBoUUxUeXBlcy5PQkpFQ1Q7XG5cbiAgY29uc3QgY2xhc3NHcmFwaFFMUmVsYXRpb25Db25zdHJhaW50c1R5cGVOYW1lID0gYCR7Z3JhcGhRTENsYXNzTmFtZX1SZWxhdGlvbldoZXJlSW5wdXRgO1xuICBsZXQgY2xhc3NHcmFwaFFMUmVsYXRpb25Db25zdHJhaW50c1R5cGUgPSBuZXcgR3JhcGhRTElucHV0T2JqZWN0VHlwZSh7XG4gICAgbmFtZTogY2xhc3NHcmFwaFFMUmVsYXRpb25Db25zdHJhaW50c1R5cGVOYW1lLFxuICAgIGRlc2NyaXB0aW9uOiBgVGhlICR7Y2xhc3NHcmFwaFFMUmVsYXRpb25Db25zdHJhaW50c1R5cGVOYW1lfSBpbnB1dCB0eXBlIGlzIHVzZWQgaW4gb3BlcmF0aW9ucyB0aGF0IGludm9sdmUgZmlsdGVyaW5nIG9iamVjdHMgb2YgJHtncmFwaFFMQ2xhc3NOYW1lfSBjbGFzcy5gLFxuICAgIGZpZWxkczogKCkgPT4gKHtcbiAgICAgIGhhdmU6IHtcbiAgICAgICAgZGVzY3JpcHRpb246XG4gICAgICAgICAgJ1J1biBhIHJlbGF0aW9uYWwvcG9pbnRlciBxdWVyeSB3aGVyZSBhdCBsZWFzdCBvbmUgY2hpbGQgb2JqZWN0IGNhbiBtYXRjaC4nLFxuICAgICAgICB0eXBlOiBjbGFzc0dyYXBoUUxDb25zdHJhaW50c1R5cGUsXG4gICAgICB9LFxuICAgICAgaGF2ZU5vdDoge1xuICAgICAgICBkZXNjcmlwdGlvbjpcbiAgICAgICAgICAnUnVuIGFuIGludmVydGVkIHJlbGF0aW9uYWwvcG9pbnRlciBxdWVyeSB3aGVyZSBhdCBsZWFzdCBvbmUgY2hpbGQgb2JqZWN0IGNhbiBtYXRjaC4nLFxuICAgICAgICB0eXBlOiBjbGFzc0dyYXBoUUxDb25zdHJhaW50c1R5cGUsXG4gICAgICB9LFxuICAgICAgZXhpc3RzOiB7XG4gICAgICAgIGRlc2NyaXB0aW9uOiAnQ2hlY2sgaWYgdGhlIHJlbGF0aW9uL3BvaW50ZXIgY29udGFpbnMgb2JqZWN0cy4nLFxuICAgICAgICB0eXBlOiBHcmFwaFFMQm9vbGVhbixcbiAgICAgIH0sXG4gICAgfSksXG4gIH0pO1xuICBjbGFzc0dyYXBoUUxSZWxhdGlvbkNvbnN0cmFpbnRzVHlwZSA9XG4gICAgcGFyc2VHcmFwaFFMU2NoZW1hLmFkZEdyYXBoUUxUeXBlKGNsYXNzR3JhcGhRTFJlbGF0aW9uQ29uc3RyYWludHNUeXBlKSB8fFxuICAgIGRlZmF1bHRHcmFwaFFMVHlwZXMuT0JKRUNUO1xuXG4gIGNvbnN0IGNsYXNzR3JhcGhRTE9yZGVyVHlwZU5hbWUgPSBgJHtncmFwaFFMQ2xhc3NOYW1lfU9yZGVyYDtcbiAgbGV0IGNsYXNzR3JhcGhRTE9yZGVyVHlwZSA9IG5ldyBHcmFwaFFMRW51bVR5cGUoe1xuICAgIG5hbWU6IGNsYXNzR3JhcGhRTE9yZGVyVHlwZU5hbWUsXG4gICAgZGVzY3JpcHRpb246IGBUaGUgJHtjbGFzc0dyYXBoUUxPcmRlclR5cGVOYW1lfSBpbnB1dCB0eXBlIGlzIHVzZWQgd2hlbiBzb3J0aW5nIG9iamVjdHMgb2YgdGhlICR7Z3JhcGhRTENsYXNzTmFtZX0gY2xhc3MuYCxcbiAgICB2YWx1ZXM6IGNsYXNzU29ydEZpZWxkcy5yZWR1Y2UoKHNvcnRGaWVsZHMsIGZpZWxkQ29uZmlnKSA9PiB7XG4gICAgICBjb25zdCB7IGZpZWxkLCBhc2MsIGRlc2MgfSA9IGZpZWxkQ29uZmlnO1xuICAgICAgY29uc3QgdXBkYXRlZFNvcnRGaWVsZHMgPSB7XG4gICAgICAgIC4uLnNvcnRGaWVsZHMsXG4gICAgICB9O1xuICAgICAgY29uc3QgdmFsdWUgPSBmaWVsZCA9PT0gJ2lkJyA/ICdvYmplY3RJZCcgOiBmaWVsZDtcbiAgICAgIGlmIChhc2MpIHtcbiAgICAgICAgdXBkYXRlZFNvcnRGaWVsZHNbYCR7ZmllbGR9X0FTQ2BdID0geyB2YWx1ZSB9O1xuICAgICAgfVxuICAgICAgaWYgKGRlc2MpIHtcbiAgICAgICAgdXBkYXRlZFNvcnRGaWVsZHNbYCR7ZmllbGR9X0RFU0NgXSA9IHsgdmFsdWU6IGAtJHt2YWx1ZX1gIH07XG4gICAgICB9XG4gICAgICByZXR1cm4gdXBkYXRlZFNvcnRGaWVsZHM7XG4gICAgfSwge30pLFxuICB9KTtcbiAgY2xhc3NHcmFwaFFMT3JkZXJUeXBlID0gcGFyc2VHcmFwaFFMU2NoZW1hLmFkZEdyYXBoUUxUeXBlKFxuICAgIGNsYXNzR3JhcGhRTE9yZGVyVHlwZVxuICApO1xuXG4gIGNvbnN0IGNsYXNzR3JhcGhRTEZpbmRBcmdzID0ge1xuICAgIHdoZXJlOiB7XG4gICAgICBkZXNjcmlwdGlvbjpcbiAgICAgICAgJ1RoZXNlIGFyZSB0aGUgY29uZGl0aW9ucyB0aGF0IHRoZSBvYmplY3RzIG5lZWQgdG8gbWF0Y2ggaW4gb3JkZXIgdG8gYmUgZm91bmQuJyxcbiAgICAgIHR5cGU6IGNsYXNzR3JhcGhRTENvbnN0cmFpbnRzVHlwZSxcbiAgICB9LFxuICAgIG9yZGVyOiB7XG4gICAgICBkZXNjcmlwdGlvbjogJ1RoZSBmaWVsZHMgdG8gYmUgdXNlZCB3aGVuIHNvcnRpbmcgdGhlIGRhdGEgZmV0Y2hlZC4nLFxuICAgICAgdHlwZTogY2xhc3NHcmFwaFFMT3JkZXJUeXBlXG4gICAgICAgID8gbmV3IEdyYXBoUUxMaXN0KG5ldyBHcmFwaFFMTm9uTnVsbChjbGFzc0dyYXBoUUxPcmRlclR5cGUpKVxuICAgICAgICA6IEdyYXBoUUxTdHJpbmcsXG4gICAgfSxcbiAgICBza2lwOiBkZWZhdWx0R3JhcGhRTFR5cGVzLlNLSVBfQVRULFxuICAgIC4uLmNvbm5lY3Rpb25BcmdzLFxuICAgIG9wdGlvbnM6IGRlZmF1bHRHcmFwaFFMVHlwZXMuUkVBRF9PUFRJT05TX0FUVCxcbiAgfTtcbiAgY29uc3QgY2xhc3NHcmFwaFFMT3V0cHV0VHlwZU5hbWUgPSBgJHtncmFwaFFMQ2xhc3NOYW1lfWA7XG4gIGNvbnN0IGludGVyZmFjZXMgPSBbXG4gICAgZGVmYXVsdEdyYXBoUUxUeXBlcy5QQVJTRV9PQkpFQ1QsXG4gICAgcGFyc2VHcmFwaFFMU2NoZW1hLnJlbGF5Tm9kZUludGVyZmFjZSxcbiAgXTtcbiAgY29uc3QgcGFyc2VPYmplY3RGaWVsZHMgPSB7XG4gICAgaWQ6IGdsb2JhbElkRmllbGQoY2xhc3NOYW1lLCAob2JqKSA9PiBvYmoub2JqZWN0SWQpLFxuICAgIC4uLmRlZmF1bHRHcmFwaFFMVHlwZXMuUEFSU0VfT0JKRUNUX0ZJRUxEUyxcbiAgfTtcbiAgY29uc3Qgb3V0cHV0RmllbGRzID0gKCkgPT4ge1xuICAgIHJldHVybiBjbGFzc091dHB1dEZpZWxkcy5yZWR1Y2UoKGZpZWxkcywgZmllbGQpID0+IHtcbiAgICAgIGNvbnN0IHR5cGUgPSB0cmFuc2Zvcm1PdXRwdXRUeXBlVG9HcmFwaFFMKFxuICAgICAgICBwYXJzZUNsYXNzLmZpZWxkc1tmaWVsZF0udHlwZSxcbiAgICAgICAgcGFyc2VDbGFzcy5maWVsZHNbZmllbGRdLnRhcmdldENsYXNzLFxuICAgICAgICBwYXJzZUdyYXBoUUxTY2hlbWEucGFyc2VDbGFzc1R5cGVzXG4gICAgICApO1xuICAgICAgaWYgKHBhcnNlQ2xhc3MuZmllbGRzW2ZpZWxkXS50eXBlID09PSAnUmVsYXRpb24nKSB7XG4gICAgICAgIGNvbnN0IHRhcmdldFBhcnNlQ2xhc3NUeXBlcyA9XG4gICAgICAgICAgcGFyc2VHcmFwaFFMU2NoZW1hLnBhcnNlQ2xhc3NUeXBlc1tcbiAgICAgICAgICAgIHBhcnNlQ2xhc3MuZmllbGRzW2ZpZWxkXS50YXJnZXRDbGFzc1xuICAgICAgICAgIF07XG4gICAgICAgIGNvbnN0IGFyZ3MgPSB0YXJnZXRQYXJzZUNsYXNzVHlwZXNcbiAgICAgICAgICA/IHRhcmdldFBhcnNlQ2xhc3NUeXBlcy5jbGFzc0dyYXBoUUxGaW5kQXJnc1xuICAgICAgICAgIDogdW5kZWZpbmVkO1xuICAgICAgICByZXR1cm4ge1xuICAgICAgICAgIC4uLmZpZWxkcyxcbiAgICAgICAgICBbZmllbGRdOiB7XG4gICAgICAgICAgICBkZXNjcmlwdGlvbjogYFRoaXMgaXMgdGhlIG9iamVjdCAke2ZpZWxkfS5gLFxuICAgICAgICAgICAgYXJncyxcbiAgICAgICAgICAgIHR5cGU6IHBhcnNlQ2xhc3MuZmllbGRzW2ZpZWxkXS5yZXF1aXJlZFxuICAgICAgICAgICAgICA/IG5ldyBHcmFwaFFMTm9uTnVsbCh0eXBlKVxuICAgICAgICAgICAgICA6IHR5cGUsXG4gICAgICAgICAgICBhc3luYyByZXNvbHZlKHNvdXJjZSwgYXJncywgY29udGV4dCwgcXVlcnlJbmZvKSB7XG4gICAgICAgICAgICAgIHRyeSB7XG4gICAgICAgICAgICAgICAgY29uc3Qge1xuICAgICAgICAgICAgICAgICAgd2hlcmUsXG4gICAgICAgICAgICAgICAgICBvcmRlcixcbiAgICAgICAgICAgICAgICAgIHNraXAsXG4gICAgICAgICAgICAgICAgICBmaXJzdCxcbiAgICAgICAgICAgICAgICAgIGFmdGVyLFxuICAgICAgICAgICAgICAgICAgbGFzdCxcbiAgICAgICAgICAgICAgICAgIGJlZm9yZSxcbiAgICAgICAgICAgICAgICAgIG9wdGlvbnMsXG4gICAgICAgICAgICAgICAgfSA9IGFyZ3M7XG4gICAgICAgICAgICAgICAgY29uc3Qge1xuICAgICAgICAgICAgICAgICAgcmVhZFByZWZlcmVuY2UsXG4gICAgICAgICAgICAgICAgICBpbmNsdWRlUmVhZFByZWZlcmVuY2UsXG4gICAgICAgICAgICAgICAgICBzdWJxdWVyeVJlYWRQcmVmZXJlbmNlLFxuICAgICAgICAgICAgICAgIH0gPSBvcHRpb25zIHx8IHt9O1xuICAgICAgICAgICAgICAgIGNvbnN0IHsgY29uZmlnLCBhdXRoLCBpbmZvIH0gPSBjb250ZXh0O1xuICAgICAgICAgICAgICAgIGNvbnN0IHNlbGVjdGVkRmllbGRzID0gZ2V0RmllbGROYW1lcyhxdWVyeUluZm8pO1xuXG4gICAgICAgICAgICAgICAgY29uc3QgeyBrZXlzLCBpbmNsdWRlIH0gPSBleHRyYWN0S2V5c0FuZEluY2x1ZGUoXG4gICAgICAgICAgICAgICAgICBzZWxlY3RlZEZpZWxkc1xuICAgICAgICAgICAgICAgICAgICAuZmlsdGVyKChmaWVsZCkgPT4gZmllbGQuc3RhcnRzV2l0aCgnZWRnZXMubm9kZS4nKSlcbiAgICAgICAgICAgICAgICAgICAgLm1hcCgoZmllbGQpID0+IGZpZWxkLnJlcGxhY2UoJ2VkZ2VzLm5vZGUuJywgJycpKVxuICAgICAgICAgICAgICAgICk7XG4gICAgICAgICAgICAgICAgY29uc3QgcGFyc2VPcmRlciA9IG9yZGVyICYmIG9yZGVyLmpvaW4oJywnKTtcblxuICAgICAgICAgICAgICAgIHJldHVybiBvYmplY3RzUXVlcmllcy5maW5kT2JqZWN0cyhcbiAgICAgICAgICAgICAgICAgIHNvdXJjZVtmaWVsZF0uY2xhc3NOYW1lLFxuICAgICAgICAgICAgICAgICAge1xuICAgICAgICAgICAgICAgICAgICAkcmVsYXRlZFRvOiB7XG4gICAgICAgICAgICAgICAgICAgICAgb2JqZWN0OiB7XG4gICAgICAgICAgICAgICAgICAgICAgICBfX3R5cGU6ICdQb2ludGVyJyxcbiAgICAgICAgICAgICAgICAgICAgICAgIGNsYXNzTmFtZTogY2xhc3NOYW1lLFxuICAgICAgICAgICAgICAgICAgICAgICAgb2JqZWN0SWQ6IHNvdXJjZS5vYmplY3RJZCxcbiAgICAgICAgICAgICAgICAgICAgICB9LFxuICAgICAgICAgICAgICAgICAgICAgIGtleTogZmllbGQsXG4gICAgICAgICAgICAgICAgICAgIH0sXG4gICAgICAgICAgICAgICAgICAgIC4uLih3aGVyZSB8fCB7fSksXG4gICAgICAgICAgICAgICAgICB9LFxuICAgICAgICAgICAgICAgICAgcGFyc2VPcmRlcixcbiAgICAgICAgICAgICAgICAgIHNraXAsXG4gICAgICAgICAgICAgICAgICBmaXJzdCxcbiAgICAgICAgICAgICAgICAgIGFmdGVyLFxuICAgICAgICAgICAgICAgICAgbGFzdCxcbiAgICAgICAgICAgICAgICAgIGJlZm9yZSxcbiAgICAgICAgICAgICAgICAgIGtleXMsXG4gICAgICAgICAgICAgICAgICBpbmNsdWRlLFxuICAgICAgICAgICAgICAgICAgZmFsc2UsXG4gICAgICAgICAgICAgICAgICByZWFkUHJlZmVyZW5jZSxcbiAgICAgICAgICAgICAgICAgIGluY2x1ZGVSZWFkUHJlZmVyZW5jZSxcbiAgICAgICAgICAgICAgICAgIHN1YnF1ZXJ5UmVhZFByZWZlcmVuY2UsXG4gICAgICAgICAgICAgICAgICBjb25maWcsXG4gICAgICAgICAgICAgICAgICBhdXRoLFxuICAgICAgICAgICAgICAgICAgaW5mbyxcbiAgICAgICAgICAgICAgICAgIHNlbGVjdGVkRmllbGRzLFxuICAgICAgICAgICAgICAgICAgcGFyc2VHcmFwaFFMU2NoZW1hLnBhcnNlQ2xhc3Nlc1xuICAgICAgICAgICAgICAgICk7XG4gICAgICAgICAgICAgIH0gY2F0Y2ggKGUpIHtcbiAgICAgICAgICAgICAgICBwYXJzZUdyYXBoUUxTY2hlbWEuaGFuZGxlRXJyb3IoZSk7XG4gICAgICAgICAgICAgIH1cbiAgICAgICAgICAgIH0sXG4gICAgICAgICAgfSxcbiAgICAgICAgfTtcbiAgICAgIH0gZWxzZSBpZiAocGFyc2VDbGFzcy5maWVsZHNbZmllbGRdLnR5cGUgPT09ICdQb2x5Z29uJykge1xuICAgICAgICByZXR1cm4ge1xuICAgICAgICAgIC4uLmZpZWxkcyxcbiAgICAgICAgICBbZmllbGRdOiB7XG4gICAgICAgICAgICBkZXNjcmlwdGlvbjogYFRoaXMgaXMgdGhlIG9iamVjdCAke2ZpZWxkfS5gLFxuICAgICAgICAgICAgdHlwZTogcGFyc2VDbGFzcy5maWVsZHNbZmllbGRdLnJlcXVpcmVkXG4gICAgICAgICAgICAgID8gbmV3IEdyYXBoUUxOb25OdWxsKHR5cGUpXG4gICAgICAgICAgICAgIDogdHlwZSxcbiAgICAgICAgICAgIGFzeW5jIHJlc29sdmUoc291cmNlKSB7XG4gICAgICAgICAgICAgIGlmIChzb3VyY2VbZmllbGRdICYmIHNvdXJjZVtmaWVsZF0uY29vcmRpbmF0ZXMpIHtcbiAgICAgICAgICAgICAgICByZXR1cm4gc291cmNlW2ZpZWxkXS5jb29yZGluYXRlcy5tYXAoKGNvb3JkaW5hdGUpID0+ICh7XG4gICAgICAgICAgICAgICAgICBsYXRpdHVkZTogY29vcmRpbmF0ZVswXSxcbiAgICAgICAgICAgICAgICAgIGxvbmdpdHVkZTogY29vcmRpbmF0ZVsxXSxcbiAgICAgICAgICAgICAgICB9KSk7XG4gICAgICAgICAgICAgIH0gZWxzZSB7XG4gICAgICAgICAgICAgICAgcmV0dXJuIG51bGw7XG4gICAgICAgICAgICAgIH1cbiAgICAgICAgICAgIH0sXG4gICAgICAgICAgfSxcbiAgICAgICAgfTtcbiAgICAgIH0gZWxzZSBpZiAocGFyc2VDbGFzcy5maWVsZHNbZmllbGRdLnR5cGUgPT09ICdBcnJheScpIHtcbiAgICAgICAgcmV0dXJuIHtcbiAgICAgICAgICAuLi5maWVsZHMsXG4gICAgICAgICAgW2ZpZWxkXToge1xuICAgICAgICAgICAgZGVzY3JpcHRpb246IGBVc2UgSW5saW5lIEZyYWdtZW50IG9uIEFycmF5IHRvIGdldCByZXN1bHRzOiBodHRwczovL2dyYXBocWwub3JnL2xlYXJuL3F1ZXJpZXMvI2lubGluZS1mcmFnbWVudHNgLFxuICAgICAgICAgICAgdHlwZTogcGFyc2VDbGFzcy5maWVsZHNbZmllbGRdLnJlcXVpcmVkXG4gICAgICAgICAgICAgID8gbmV3IEdyYXBoUUxOb25OdWxsKHR5cGUpXG4gICAgICAgICAgICAgIDogdHlwZSxcbiAgICAgICAgICAgIGFzeW5jIHJlc29sdmUoc291cmNlKSB7XG4gICAgICAgICAgICAgIGlmICghc291cmNlW2ZpZWxkXSkgcmV0dXJuIG51bGw7XG4gICAgICAgICAgICAgIHJldHVybiBzb3VyY2VbZmllbGRdLm1hcChhc3luYyAoZWxlbSkgPT4ge1xuICAgICAgICAgICAgICAgIGlmIChcbiAgICAgICAgICAgICAgICAgIGVsZW0uY2xhc3NOYW1lICYmXG4gICAgICAgICAgICAgICAgICBlbGVtLm9iamVjdElkICYmXG4gICAgICAgICAgICAgICAgICBlbGVtLl9fdHlwZSA9PT0gJ09iamVjdCdcbiAgICAgICAgICAgICAgICApIHtcbiAgICAgICAgICAgICAgICAgIHJldHVybiBlbGVtO1xuICAgICAgICAgICAgICAgIH0gZWxzZSB7XG4gICAgICAgICAgICAgICAgICByZXR1cm4geyB2YWx1ZTogZWxlbSB9O1xuICAgICAgICAgICAgICAgIH1cbiAgICAgICAgICAgICAgfSk7XG4gICAgICAgICAgICB9LFxuICAgICAgICAgIH0sXG4gICAgICAgIH07XG4gICAgICB9IGVsc2UgaWYgKHR5cGUpIHtcbiAgICAgICAgcmV0dXJuIHtcbiAgICAgICAgICAuLi5maWVsZHMsXG4gICAgICAgICAgW2ZpZWxkXToge1xuICAgICAgICAgICAgZGVzY3JpcHRpb246IGBUaGlzIGlzIHRoZSBvYmplY3QgJHtmaWVsZH0uYCxcbiAgICAgICAgICAgIHR5cGU6IHBhcnNlQ2xhc3MuZmllbGRzW2ZpZWxkXS5yZXF1aXJlZFxuICAgICAgICAgICAgICA/IG5ldyBHcmFwaFFMTm9uTnVsbCh0eXBlKVxuICAgICAgICAgICAgICA6IHR5cGUsXG4gICAgICAgICAgfSxcbiAgICAgICAgfTtcbiAgICAgIH0gZWxzZSB7XG4gICAgICAgIHJldHVybiBmaWVsZHM7XG4gICAgICB9XG4gICAgfSwgcGFyc2VPYmplY3RGaWVsZHMpO1xuICB9O1xuICBsZXQgY2xhc3NHcmFwaFFMT3V0cHV0VHlwZSA9IG5ldyBHcmFwaFFMT2JqZWN0VHlwZSh7XG4gICAgbmFtZTogY2xhc3NHcmFwaFFMT3V0cHV0VHlwZU5hbWUsXG4gICAgZGVzY3JpcHRpb246IGBUaGUgJHtjbGFzc0dyYXBoUUxPdXRwdXRUeXBlTmFtZX0gb2JqZWN0IHR5cGUgaXMgdXNlZCBpbiBvcGVyYXRpb25zIHRoYXQgaW52b2x2ZSBvdXRwdXR0aW5nIG9iamVjdHMgb2YgJHtncmFwaFFMQ2xhc3NOYW1lfSBjbGFzcy5gLFxuICAgIGludGVyZmFjZXMsXG4gICAgZmllbGRzOiBvdXRwdXRGaWVsZHMsXG4gIH0pO1xuICBjbGFzc0dyYXBoUUxPdXRwdXRUeXBlID0gcGFyc2VHcmFwaFFMU2NoZW1hLmFkZEdyYXBoUUxUeXBlKFxuICAgIGNsYXNzR3JhcGhRTE91dHB1dFR5cGVcbiAgKTtcblxuICBjb25zdCB7IGNvbm5lY3Rpb25UeXBlLCBlZGdlVHlwZSB9ID0gY29ubmVjdGlvbkRlZmluaXRpb25zKHtcbiAgICBuYW1lOiBncmFwaFFMQ2xhc3NOYW1lLFxuICAgIGNvbm5lY3Rpb25GaWVsZHM6IHtcbiAgICAgIGNvdW50OiBkZWZhdWx0R3JhcGhRTFR5cGVzLkNPVU5UX0FUVCxcbiAgICB9LFxuICAgIG5vZGVUeXBlOiBjbGFzc0dyYXBoUUxPdXRwdXRUeXBlIHx8IGRlZmF1bHRHcmFwaFFMVHlwZXMuT0JKRUNULFxuICB9KTtcbiAgbGV0IGNsYXNzR3JhcGhRTEZpbmRSZXN1bHRUeXBlID0gdW5kZWZpbmVkO1xuICBpZiAoXG4gICAgcGFyc2VHcmFwaFFMU2NoZW1hLmFkZEdyYXBoUUxUeXBlKGVkZ2VUeXBlKSAmJlxuICAgIHBhcnNlR3JhcGhRTFNjaGVtYS5hZGRHcmFwaFFMVHlwZShjb25uZWN0aW9uVHlwZSwgZmFsc2UsIGZhbHNlLCB0cnVlKVxuICApIHtcbiAgICBjbGFzc0dyYXBoUUxGaW5kUmVzdWx0VHlwZSA9IGNvbm5lY3Rpb25UeXBlO1xuICB9XG5cbiAgcGFyc2VHcmFwaFFMU2NoZW1hLnBhcnNlQ2xhc3NUeXBlc1tjbGFzc05hbWVdID0ge1xuICAgIGNsYXNzR3JhcGhRTFBvaW50ZXJUeXBlLFxuICAgIGNsYXNzR3JhcGhRTFJlbGF0aW9uVHlwZSxcbiAgICBjbGFzc0dyYXBoUUxDcmVhdGVUeXBlLFxuICAgIGNsYXNzR3JhcGhRTFVwZGF0ZVR5cGUsXG4gICAgY2xhc3NHcmFwaFFMQ29uc3RyYWludHNUeXBlLFxuICAgIGNsYXNzR3JhcGhRTFJlbGF0aW9uQ29uc3RyYWludHNUeXBlLFxuICAgIGNsYXNzR3JhcGhRTEZpbmRBcmdzLFxuICAgIGNsYXNzR3JhcGhRTE91dHB1dFR5cGUsXG4gICAgY2xhc3NHcmFwaFFMRmluZFJlc3VsdFR5cGUsXG4gICAgY29uZmlnOiB7XG4gICAgICBwYXJzZUNsYXNzQ29uZmlnLFxuICAgICAgaXNDcmVhdGVFbmFibGVkLFxuICAgICAgaXNVcGRhdGVFbmFibGVkLFxuICAgIH0sXG4gIH07XG5cbiAgaWYgKGNsYXNzTmFtZSA9PT0gJ19Vc2VyJykge1xuICAgIGNvbnN0IHZpZXdlclR5cGUgPSBuZXcgR3JhcGhRTE9iamVjdFR5cGUoe1xuICAgICAgbmFtZTogJ1ZpZXdlcicsXG4gICAgICBkZXNjcmlwdGlvbjogYFRoZSBWaWV3ZXIgb2JqZWN0IHR5cGUgaXMgdXNlZCBpbiBvcGVyYXRpb25zIHRoYXQgaW52b2x2ZSBvdXRwdXR0aW5nIHRoZSBjdXJyZW50IHVzZXIgZGF0YS5gLFxuICAgICAgZmllbGRzOiAoKSA9PiAoe1xuICAgICAgICBzZXNzaW9uVG9rZW46IGRlZmF1bHRHcmFwaFFMVHlwZXMuU0VTU0lPTl9UT0tFTl9BVFQsXG4gICAgICAgIHVzZXI6IHtcbiAgICAgICAgICBkZXNjcmlwdGlvbjogJ1RoaXMgaXMgdGhlIGN1cnJlbnQgdXNlci4nLFxuICAgICAgICAgIHR5cGU6IG5ldyBHcmFwaFFMTm9uTnVsbChjbGFzc0dyYXBoUUxPdXRwdXRUeXBlKSxcbiAgICAgICAgfSxcbiAgICAgIH0pLFxuICAgIH0pO1xuICAgIHBhcnNlR3JhcGhRTFNjaGVtYS5hZGRHcmFwaFFMVHlwZSh2aWV3ZXJUeXBlLCB0cnVlLCB0cnVlKTtcbiAgICBwYXJzZUdyYXBoUUxTY2hlbWEudmlld2VyVHlwZSA9IHZpZXdlclR5cGU7XG4gIH1cbn07XG5cbmV4cG9ydCB7IGV4dHJhY3RLZXlzQW5kSW5jbHVkZSwgbG9hZCB9O1xuIl19