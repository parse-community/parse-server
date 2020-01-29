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
        return _objectSpread({}, fields, {
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
        return _objectSpread({}, fields, {
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
    fields: () => _objectSpread({}, classConstraintFields.reduce((fields, field) => {
      if (['OR', 'AND', 'NOR'].includes(field)) {
        parseGraphQLSchema.log.warn(`Field ${field} could not be added to the auto schema ${classGraphQLConstraintsTypeName} because it collided with an existing one.`);
        return fields;
      }

      const parseField = field === 'id' ? 'objectId' : field;
      const type = (0, _constraintType.transformConstraintTypeToGraphQL)(parseClass.fields[parseField].type, parseClass.fields[parseField].targetClass, parseGraphQLSchema.parseClassTypes, field);

      if (type) {
        return _objectSpread({}, fields, {
          [field]: {
            description: `This is the object ${field}.`,
            type
          }
        });
      } else {
        return fields;
      }
    }, {}), {
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

  const classGraphQLFindArgs = _objectSpread({
    where: {
      description: 'These are the conditions that the objects need to match in order to be found.',
      type: classGraphQLConstraintsType
    },
    order: {
      description: 'The fields to be used when sorting the data fetched.',
      type: classGraphQLOrderType ? new _graphql.GraphQLList(new _graphql.GraphQLNonNull(classGraphQLOrderType)) : _graphql.GraphQLString
    },
    skip: defaultGraphQLTypes.SKIP_ATT
  }, _graphqlRelay.connectionArgs, {
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
        return _objectSpread({}, fields, {
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
        return _objectSpread({}, fields, {
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
        return _objectSpread({}, fields, {
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
        return _objectSpread({}, fields, {
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
//# sourceMappingURL=data:application/json;charset=utf-8;base64,eyJ2ZXJzaW9uIjozLCJzb3VyY2VzIjpbIi4uLy4uLy4uL3NyYy9HcmFwaFFML2xvYWRlcnMvcGFyc2VDbGFzc1R5cGVzLmpzIl0sIm5hbWVzIjpbImdldFBhcnNlQ2xhc3NUeXBlQ29uZmlnIiwicGFyc2VDbGFzc0NvbmZpZyIsInR5cGUiLCJnZXRJbnB1dEZpZWxkc0FuZENvbnN0cmFpbnRzIiwicGFyc2VDbGFzcyIsImNsYXNzRmllbGRzIiwiT2JqZWN0Iiwia2V5cyIsImZpZWxkcyIsImNvbmNhdCIsImlucHV0RmllbGRzIiwiYWxsb3dlZElucHV0RmllbGRzIiwib3V0cHV0RmllbGRzIiwiYWxsb3dlZE91dHB1dEZpZWxkcyIsImNvbnN0cmFpbnRGaWVsZHMiLCJhbGxvd2VkQ29uc3RyYWludEZpZWxkcyIsInNvcnRGaWVsZHMiLCJhbGxvd2VkU29ydEZpZWxkcyIsImNsYXNzT3V0cHV0RmllbGRzIiwiY2xhc3NDcmVhdGVGaWVsZHMiLCJjbGFzc1VwZGF0ZUZpZWxkcyIsImNsYXNzQ29uc3RyYWludEZpZWxkcyIsImNsYXNzU29ydEZpZWxkcyIsImNsYXNzQ3VzdG9tRmllbGRzIiwiZmlsdGVyIiwiZmllbGQiLCJkZWZhdWx0R3JhcGhRTFR5cGVzIiwiUEFSU0VfT0JKRUNUX0ZJRUxEUyIsImluY2x1ZGVzIiwiY3JlYXRlIiwidXBkYXRlIiwiY2xhc3NOYW1lIiwib3V0cHV0RmllbGQiLCJsZW5ndGgiLCJwdXNoIiwiYXNjIiwiZGVzYyIsIm1hcCIsImxvYWQiLCJwYXJzZUdyYXBoUUxTY2hlbWEiLCJncmFwaFFMQ2xhc3NOYW1lIiwiaXNDcmVhdGVFbmFibGVkIiwiaXNVcGRhdGVFbmFibGVkIiwiY2xhc3NHcmFwaFFMQ3JlYXRlVHlwZU5hbWUiLCJjbGFzc0dyYXBoUUxDcmVhdGVUeXBlIiwiR3JhcGhRTElucHV0T2JqZWN0VHlwZSIsIm5hbWUiLCJkZXNjcmlwdGlvbiIsInJlZHVjZSIsInRhcmdldENsYXNzIiwicGFyc2VDbGFzc1R5cGVzIiwicmVxdWlyZWQiLCJHcmFwaFFMTm9uTnVsbCIsIkFDTCIsIkFDTF9JTlBVVCIsImFkZEdyYXBoUUxUeXBlIiwiY2xhc3NHcmFwaFFMVXBkYXRlVHlwZU5hbWUiLCJjbGFzc0dyYXBoUUxVcGRhdGVUeXBlIiwiY2xhc3NHcmFwaFFMUG9pbnRlclR5cGVOYW1lIiwiY2xhc3NHcmFwaFFMUG9pbnRlclR5cGUiLCJsaW5rIiwiR3JhcGhRTElEIiwiT0JKRUNUIiwiY2xhc3NHcmFwaFFMUmVsYXRpb25UeXBlTmFtZSIsImNsYXNzR3JhcGhRTFJlbGF0aW9uVHlwZSIsImFkZCIsIkdyYXBoUUxMaXN0IiwiT0JKRUNUX0lEIiwicmVtb3ZlIiwiY2xhc3NHcmFwaFFMQ29uc3RyYWludHNUeXBlTmFtZSIsImNsYXNzR3JhcGhRTENvbnN0cmFpbnRzVHlwZSIsImxvZyIsIndhcm4iLCJwYXJzZUZpZWxkIiwiT1IiLCJBTkQiLCJOT1IiLCJjbGFzc0dyYXBoUUxSZWxhdGlvbkNvbnN0cmFpbnRzVHlwZU5hbWUiLCJjbGFzc0dyYXBoUUxSZWxhdGlvbkNvbnN0cmFpbnRzVHlwZSIsImhhdmUiLCJoYXZlTm90IiwiZXhpc3RzIiwiR3JhcGhRTEJvb2xlYW4iLCJjbGFzc0dyYXBoUUxPcmRlclR5cGVOYW1lIiwiY2xhc3NHcmFwaFFMT3JkZXJUeXBlIiwiR3JhcGhRTEVudW1UeXBlIiwidmFsdWVzIiwiZmllbGRDb25maWciLCJ1cGRhdGVkU29ydEZpZWxkcyIsInZhbHVlIiwiY2xhc3NHcmFwaFFMRmluZEFyZ3MiLCJ3aGVyZSIsIm9yZGVyIiwiR3JhcGhRTFN0cmluZyIsInNraXAiLCJTS0lQX0FUVCIsImNvbm5lY3Rpb25BcmdzIiwib3B0aW9ucyIsIlJFQURfT1BUSU9OU19BVFQiLCJjbGFzc0dyYXBoUUxPdXRwdXRUeXBlTmFtZSIsImludGVyZmFjZXMiLCJQQVJTRV9PQkpFQ1QiLCJyZWxheU5vZGVJbnRlcmZhY2UiLCJwYXJzZU9iamVjdEZpZWxkcyIsImlkIiwib2JqIiwib2JqZWN0SWQiLCJ0YXJnZXRQYXJzZUNsYXNzVHlwZXMiLCJhcmdzIiwidW5kZWZpbmVkIiwicmVzb2x2ZSIsInNvdXJjZSIsImNvbnRleHQiLCJxdWVyeUluZm8iLCJmaXJzdCIsImFmdGVyIiwibGFzdCIsImJlZm9yZSIsInJlYWRQcmVmZXJlbmNlIiwiaW5jbHVkZVJlYWRQcmVmZXJlbmNlIiwic3VicXVlcnlSZWFkUHJlZmVyZW5jZSIsImNvbmZpZyIsImF1dGgiLCJpbmZvIiwic2VsZWN0ZWRGaWVsZHMiLCJpbmNsdWRlIiwic3RhcnRzV2l0aCIsInJlcGxhY2UiLCJwYXJzZU9yZGVyIiwiam9pbiIsIm9iamVjdHNRdWVyaWVzIiwiZmluZE9iamVjdHMiLCIkcmVsYXRlZFRvIiwib2JqZWN0IiwiX190eXBlIiwia2V5IiwicGFyc2VDbGFzc2VzIiwiZSIsImhhbmRsZUVycm9yIiwiY29vcmRpbmF0ZXMiLCJjb29yZGluYXRlIiwibGF0aXR1ZGUiLCJsb25naXR1ZGUiLCJlbGVtIiwiY2xhc3NHcmFwaFFMT3V0cHV0VHlwZSIsIkdyYXBoUUxPYmplY3RUeXBlIiwiY29ubmVjdGlvblR5cGUiLCJlZGdlVHlwZSIsImNvbm5lY3Rpb25GaWVsZHMiLCJjb3VudCIsIkNPVU5UX0FUVCIsIm5vZGVUeXBlIiwiY2xhc3NHcmFwaFFMRmluZFJlc3VsdFR5cGUiLCJ2aWV3ZXJUeXBlIiwic2Vzc2lvblRva2VuIiwiU0VTU0lPTl9UT0tFTl9BVFQiLCJ1c2VyIl0sIm1hcHBpbmdzIjoiOzs7Ozs7Ozs7Ozs7O0FBQUE7O0FBVUE7O0FBS0E7O0FBQ0E7O0FBQ0E7O0FBQ0E7O0FBQ0E7O0FBQ0E7O0FBQ0E7O0FBQ0E7O0FBQ0E7Ozs7Ozs7Ozs7Ozs7O0FBS0EsTUFBTUEsdUJBQXVCLEdBQUcsVUFDOUJDLGdCQUQ4QixFQUU5QjtBQUNBLFNBQVFBLGdCQUFnQixJQUFJQSxnQkFBZ0IsQ0FBQ0MsSUFBdEMsSUFBK0MsRUFBdEQ7QUFDRCxDQUpEOztBQU1BLE1BQU1DLDRCQUE0QixHQUFHLFVBQ25DQyxVQURtQyxFQUVuQ0gsZ0JBRm1DLEVBR25DO0FBQ0EsUUFBTUksV0FBVyxHQUFHQyxNQUFN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OEM7QUFFOUNLLElBQUFBLHdCQUY4QztBQUc5Q3BCLElBQUFBLHNCQUg4QztBQUk5Q2EsSUFBQUEsc0JBSjhDO0FBSzlDYSxJQUFBQSwyQkFMOEM7QUFNOUNRLElBQUFBLG1DQU44QztBQU85Q1ksSUFBQUEsb0JBUDhDO0FBUTlDc0QsSUFBQUEsc0JBUjhDO0FBUzlDUSxJQUFBQSwwQkFUOEM7QUFVOUMvQixJQUFBQSxNQUFNLEVBQUU7QUFDTnhILE1BQUFBLGdCQURNO0FBRU53QyxNQUFBQSxlQUZNO0FBR05DLE1BQUFBO0FBSE07QUFWc0MsR0FBaEQ7O0FBaUJBLE1BQUlYLFNBQVMsS0FBSyxPQUFsQixFQUEyQjtBQUN6QixVQUFNMEgsVUFBVSxHQUFHLElBQUlSLDBCQUFKLENBQXNCO0FBQ3ZDbkcsTUFBQUEsSUFBSSxFQUFFLFFBRGlDO0FBRXZDQyxNQUFBQSxXQUFXLEVBQUcsNkZBRnlCO0FBR3ZDdkMsTUFBQUEsTUFBTSxFQUFFLE9BQU87QUFDYmtKLFFBQUFBLFlBQVksRUFBRWhJLG1CQUFtQixDQUFDaUksaUJBRHJCO0FBRWJDLFFBQUFBLElBQUksRUFBRTtBQUNKN0csVUFBQUEsV0FBVyxFQUFFLDJCQURUO0FBRUo3QyxVQUFBQSxJQUFJLEVBQUUsSUFBSWtELHVCQUFKLENBQW1CNEYsc0JBQW5CO0FBRkY7QUFGTyxPQUFQO0FBSCtCLEtBQXRCLENBQW5CO0FBV0F6RyxJQUFBQSxrQkFBa0IsQ0FBQ2dCLGNBQW5CLENBQWtDa0csVUFBbEMsRUFBOEMsSUFBOUMsRUFBb0QsSUFBcEQ7QUFDQWxILElBQUFBLGtCQUFrQixDQUFDa0gsVUFBbkIsR0FBZ0NBLFVBQWhDO0FBQ0Q7QUFDRixDQXBkRCIsInNvdXJjZXNDb250ZW50IjpbImltcG9ydCB7XG4gIEdyYXBoUUxJRCxcbiAgR3JhcGhRTE9iamVjdFR5cGUsXG4gIEdyYXBoUUxTdHJpbmcsXG4gIEdyYXBoUUxMaXN0LFxuICBHcmFwaFFMSW5wdXRPYmplY3RUeXBlLFxuICBHcmFwaFFMTm9uTnVsbCxcbiAgR3JhcGhRTEJvb2xlYW4sXG4gIEdyYXBoUUxFbnVtVHlwZSxcbn0gZnJvbSAnZ3JhcGhxbCc7XG5pbXBvcnQge1xuICBnbG9iYWxJZEZpZWxkLFxuICBjb25uZWN0aW9uQXJncyxcbiAgY29ubmVjdGlvbkRlZmluaXRpb25zLFxufSBmcm9tICdncmFwaHFsLXJlbGF5JztcbmltcG9ydCBnZXRGaWVsZE5hbWVzIGZyb20gJ2dyYXBocWwtbGlzdC1maWVsZHMnO1xuaW1wb3J0ICogYXMgZGVmYXVsdEdyYXBoUUxUeXBlcyBmcm9tICcuL2RlZmF1bHRHcmFwaFFMVHlwZXMnO1xuaW1wb3J0ICogYXMgb2JqZWN0c1F1ZXJpZXMgZnJvbSAnLi4vaGVscGVycy9vYmplY3RzUXVlcmllcyc7XG5pbXBvcnQgeyBQYXJzZUdyYXBoUUxDbGFzc0NvbmZpZyB9IGZyb20gJy4uLy4uL0NvbnRyb2xsZXJzL1BhcnNlR3JhcGhRTENvbnRyb2xsZXInO1xuaW1wb3J0IHsgdHJhbnNmb3JtQ2xhc3NOYW1lVG9HcmFwaFFMIH0gZnJvbSAnLi4vdHJhbnNmb3JtZXJzL2NsYXNzTmFtZSc7XG5pbXBvcnQgeyB0cmFuc2Zvcm1JbnB1dFR5cGVUb0dyYXBoUUwgfSBmcm9tICcuLi90cmFuc2Zvcm1lcnMvaW5wdXRUeXBlJztcbmltcG9ydCB7IHRyYW5zZm9ybU91dHB1dFR5cGVUb0dyYXBoUUwgfSBmcm9tICcuLi90cmFuc2Zvcm1lcnMvb3V0cHV0VHlwZSc7XG5pbXBvcnQgeyB0cmFuc2Zvcm1Db25zdHJhaW50VHlwZVRvR3JhcGhRTCB9IGZyb20gJy4uL3RyYW5zZm9ybWVycy9jb25zdHJhaW50VHlwZSc7XG5pbXBvcnQge1xuICBleHRyYWN0S2V5c0FuZEluY2x1ZGUsXG4gIGdldFBhcnNlQ2xhc3NNdXRhdGlvbkNvbmZpZyxcbn0gZnJvbSAnLi4vcGFyc2VHcmFwaFFMVXRpbHMnO1xuXG5jb25zdCBnZXRQYXJzZUNsYXNzVHlwZUNvbmZpZyA9IGZ1bmN0aW9uKFxuICBwYXJzZUNsYXNzQ29uZmlnOiA/UGFyc2VHcmFwaFFMQ2xhc3NDb25maWdcbikge1xuICByZXR1cm4gKHBhcnNlQ2xhc3NDb25maWcgJiYgcGFyc2VDbGFzc0NvbmZpZy50eXBlKSB8fCB7fTtcbn07XG5cbmNvbnN0IGdldElucHV0RmllbGRzQW5kQ29uc3RyYWludHMgPSBmdW5jdGlvbihcbiAgcGFyc2VDbGFzcyxcbiAgcGFyc2VDbGFzc0NvbmZpZzogP1BhcnNlR3JhcGhRTENsYXNzQ29uZmlnXG4pIHtcbiAgY29uc3QgY2xhc3NGaWVsZHMgPSBPYmplY3Qua2V5cyhwYXJzZUNsYXNzLmZpZWxkcykuY29uY2F0KCdpZCcpO1xuICBjb25zdCB7XG4gICAgaW5wdXRGaWVsZHM6IGFsbG93ZWRJbnB1dEZpZWxkcyxcbiAgICBvdXRwdXRGaWVsZHM6IGFsbG93ZWRPdXRwdXRGaWVsZHMsXG4gICAgY29uc3RyYWludEZpZWxkczogYWxsb3dlZENvbnN0cmFpbnRGaWVsZHMsXG4gICAgc29ydEZpZWxkczogYWxsb3dlZFNvcnRGaWVsZHMsXG4gIH0gPSBnZXRQYXJzZUNsYXNzVHlwZUNvbmZpZyhwYXJzZUNsYXNzQ29uZmlnKTtcblxuICBsZXQgY2xhc3NPdXRwdXRGaWVsZHM7XG4gIGxldCBjbGFzc0NyZWF0ZUZpZWxkcztcbiAgbGV0IGNsYXNzVXBkYXRlRmllbGRzO1xuICBsZXQgY2xhc3NDb25zdHJhaW50RmllbGRzO1xuICBsZXQgY2xhc3NTb3J0RmllbGRzO1xuXG4gIC8vIEFsbCBhbGxvd2VkIGN1c3RvbXMgZmllbGRzXG4gIGNvbnN0IGNsYXNzQ3VzdG9tRmllbGRzID0gY2xhc3NGaWVsZHMuZmlsdGVyKGZpZWxkID0+IHtcbiAgICByZXR1cm4gKFxuICAgICAgIU9iamVjdC5rZXlzKGRlZmF1bHRHcmFwaFFMVHlwZXMuUEFSU0VfT0JKRUNUX0ZJRUxEUykuaW5jbHVkZXMoZmllbGQpICYmXG4gICAgICBmaWVsZCAhPT0gJ2lkJ1xuICAgICk7XG4gIH0pO1xuXG4gIGlmIChhbGxvd2VkSW5wdXRGaWVsZHMgJiYgYWxsb3dlZElucHV0RmllbGRzLmNyZWF0ZSkge1xuICAgIGNsYXNzQ3JlYXRlRmllbGRzID0gY2xhc3NDdXN0b21GaWVsZHMuZmlsdGVyKGZpZWxkID0+IHtcbiAgICAgIHJldHVybiBhbGxvd2VkSW5wdXRGaWVsZHMuY3JlYXRlLmluY2x1ZGVzKGZpZWxkKTtcbiAgICB9KTtcbiAgfSBlbHNlIHtcbiAgICBjbGFzc0NyZWF0ZUZpZWxkcyA9IGNsYXNzQ3VzdG9tRmllbGRzO1xuICB9XG4gIGlmIChhbGxvd2VkSW5wdXRGaWVsZHMgJiYgYWxsb3dlZElucHV0RmllbGRzLnVwZGF0ZSkge1xuICAgIGNsYXNzVXBkYXRlRmllbGRzID0gY2xhc3NDdXN0b21GaWVsZHMuZmlsdGVyKGZpZWxkID0+IHtcbiAgICAgIHJldHVybiBhbGxvd2VkSW5wdXRGaWVsZHMudXBkYXRlLmluY2x1ZGVzKGZpZWxkKTtcbiAgICB9KTtcbiAgfSBlbHNlIHtcbiAgICBjbGFzc1VwZGF0ZUZpZWxkcyA9IGNsYXNzQ3VzdG9tRmllbGRzO1xuICB9XG5cbiAgaWYgKGFsbG93ZWRPdXRwdXRGaWVsZHMpIHtcbiAgICBjbGFzc091dHB1dEZpZWxkcyA9IGNsYXNzQ3VzdG9tRmllbGRzLmZpbHRlcihmaWVsZCA9PiB7XG4gICAgICByZXR1cm4gYWxsb3dlZE91dHB1dEZpZWxkcy5pbmNsdWRlcyhmaWVsZCk7XG4gICAgfSk7XG4gIH0gZWxzZSB7XG4gICAgY2xhc3NPdXRwdXRGaWVsZHMgPSBjbGFzc0N1c3RvbUZpZWxkcztcbiAgfVxuICAvLyBGaWx0ZXJzIHRoZSBcInBhc3N3b3JkXCIgZmllbGQgZnJvbSBjbGFzcyBfVXNlclxuICBpZiAocGFyc2VDbGFzcy5jbGFzc05hbWUgPT09ICdfVXNlcicpIHtcbiAgICBjbGFzc091dHB1dEZpZWxkcyA9IGNsYXNzT3V0cHV0RmllbGRzLmZpbHRlcihcbiAgICAgIG91dHB1dEZpZWxkID0+IG91dHB1dEZpZWxkICE9PSAncGFzc3dvcmQnXG4gICAgKTtcbiAgfVxuXG4gIGlmIChhbGxvd2VkQ29uc3RyYWludEZpZWxkcykge1xuICAgIGNsYXNzQ29uc3RyYWludEZpZWxkcyA9IGNsYXNzQ3VzdG9tRmllbGRzLmZpbHRlcihmaWVsZCA9PiB7XG4gICAgICByZXR1cm4gYWxsb3dlZENvbnN0cmFpbnRGaWVsZHMuaW5jbHVkZXMoZmllbGQpO1xuICAgIH0pO1xuICB9IGVsc2Uge1xuICAgIGNsYXNzQ29uc3RyYWludEZpZWxkcyA9IGNsYXNzRmllbGRzO1xuICB9XG5cbiAgaWYgKGFsbG93ZWRTb3J0RmllbGRzKSB7XG4gICAgY2xhc3NTb3J0RmllbGRzID0gYWxsb3dlZFNvcnRGaWVsZHM7XG4gICAgaWYgKCFjbGFzc1NvcnRGaWVsZHMubGVuZ3RoKSB7XG4gICAgICAvLyBtdXN0IGhhdmUgYXQgbGVhc3QgMSBvcmRlciBmaWVsZFxuICAgICAgLy8gb3RoZXJ3aXNlIHRoZSBGaW5kQXJncyBJbnB1dCBUeXBlIHdpbGwgdGhyb3cuXG4gICAgICBjbGFzc1NvcnRGaWVsZHMucHVzaCh7XG4gICAgICAgIGZpZWxkOiAnaWQnLFxuICAgICAgICBhc2M6IHRydWUsXG4gICAgICAgIGRlc2M6IHRydWUsXG4gICAgICB9KTtcbiAgICB9XG4gIH0gZWxzZSB7XG4gICAgY2xhc3NTb3J0RmllbGRzID0gY2xhc3NGaWVsZHMubWFwKGZpZWxkID0+IHtcbiAgICAgIHJldHVybiB7IGZpZWxkLCBhc2M6IHRydWUsIGRlc2M6IHRydWUgfTtcbiAgICB9KTtcbiAgfVxuXG4gIHJldHVybiB7XG4gICAgY2xhc3NDcmVhdGVGaWVsZHMsXG4gICAgY2xhc3NVcGRhdGVGaWVsZHMsXG4gICAgY2xhc3NDb25zdHJhaW50RmllbGRzLFxuICAgIGNsYXNzT3V0cHV0RmllbGRzLFxuICAgIGNsYXNzU29ydEZpZWxkcyxcbiAgfTtcbn07XG5cbmNvbnN0IGxvYWQgPSAoXG4gIHBhcnNlR3JhcGhRTFNjaGVtYSxcbiAgcGFyc2VDbGFzcyxcbiAgcGFyc2VDbGFzc0NvbmZpZzogP1BhcnNlR3JhcGhRTENsYXNzQ29uZmlnXG4pID0+IHtcbiAgY29uc3QgY2xhc3NOYW1lID0gcGFyc2VDbGFzcy5jbGFzc05hbWU7XG4gIGNvbnN0IGdyYXBoUUxDbGFzc05hbWUgPSB0cmFuc2Zvcm1DbGFzc05hbWVUb0dyYXBoUUwoY2xhc3NOYW1lKTtcbiAgY29uc3Qge1xuICAgIGNsYXNzQ3JlYXRlRmllbGRzLFxuICAgIGNsYXNzVXBkYXRlRmllbGRzLFxuICAgIGNsYXNzT3V0cHV0RmllbGRzLFxuICAgIGNsYXNzQ29uc3RyYWludEZpZWxkcyxcbiAgICBjbGFzc1NvcnRGaWVsZHMsXG4gIH0gPSBnZXRJbnB1dEZpZWxkc0FuZENvbnN0cmFpbnRzKHBhcnNlQ2xhc3MsIHBhcnNlQ2xhc3NDb25maWcpO1xuXG4gIGNvbnN0IHtcbiAgICBjcmVhdGU6IGlzQ3JlYXRlRW5hYmxlZCA9IHRydWUsXG4gICAgdXBkYXRlOiBpc1VwZGF0ZUVuYWJsZWQgPSB0cnVlLFxuICB9ID0gZ2V0UGFyc2VDbGFzc011dGF0aW9uQ29uZmlnKHBhcnNlQ2xhc3NDb25maWcpO1xuXG4gIGNvbnN0IGNsYXNzR3JhcGhRTENyZWF0ZVR5cGVOYW1lID0gYENyZWF0ZSR7Z3JhcGhRTENsYXNzTmFtZX1GaWVsZHNJbnB1dGA7XG4gIGxldCBjbGFzc0dyYXBoUUxDcmVhdGVUeXBlID0gbmV3IEdyYXBoUUxJbnB1dE9iamVjdFR5cGUoe1xuICAgIG5hbWU6IGNsYXNzR3JhcGhRTENyZWF0ZVR5cGVOYW1lLFxuICAgIGRlc2NyaXB0aW9uOiBgVGhlICR7Y2xhc3NHcmFwaFFMQ3JlYXRlVHlwZU5hbWV9IGlucHV0IHR5cGUgaXMgdXNlZCBpbiBvcGVyYXRpb25zIHRoYXQgaW52b2x2ZSBjcmVhdGlvbiBvZiBvYmplY3RzIGluIHRoZSAke2dyYXBoUUxDbGFzc05hbWV9IGNsYXNzLmAsXG4gICAgZmllbGRzOiAoKSA9PlxuICAgICAgY2xhc3NDcmVhdGVGaWVsZHMucmVkdWNlKFxuICAgICAgICAoZmllbGRzLCBmaWVsZCkgPT4ge1xuICAgICAgICAgIGNvbnN0IHR5cGUgPSB0cmFuc2Zvcm1JbnB1dFR5cGVUb0dyYXBoUUwoXG4gICAgICAgICAgICBwYXJzZUNsYXNzLmZpZWxkc1tmaWVsZF0udHlwZSxcbiAgICAgICAgICAgIHBhcnNlQ2xhc3MuZmllbGRzW2ZpZWxkXS50YXJnZXRDbGFzcyxcbiAgICAgICAgICAgIHBhcnNlR3JhcGhRTFNjaGVtYS5wYXJzZUNsYXNzVHlwZXNcbiAgICAgICAgICApO1xuICAgICAgICAgIGlmICh0eXBlKSB7XG4gICAgICAgICAgICByZXR1cm4ge1xuICAgICAgICAgICAgICAuLi5maWVsZHMsXG4gICAgICAgICAgICAgIFtmaWVsZF06IHtcbiAgICAgICAgICAgICAgICBkZXNjcmlwdGlvbjogYFRoaXMgaXMgdGhlIG9iamVjdCAke2ZpZWxkfS5gLFxuICAgICAgICAgICAgICAgIHR5cGU6XG4gICAgICAgICAgICAgICAgICAoY2xhc3NOYW1lID09PSAnX1VzZXInICYmXG4gICAgICAgICAgICAgICAgICAgIChmaWVsZCA9PT0gJ3VzZXJuYW1lJyB8fCBmaWVsZCA9PT0gJ3Bhc3N3b3JkJykpIHx8XG4gICAgICAgICAgICAgICAgICBwYXJzZUNsYXNzLmZpZWxkc1tmaWVsZF0ucmVxdWlyZWRcbiAgICAgICAgICAgICAgICAgICAgPyBuZXcgR3JhcGhRTE5vbk51bGwodHlwZSlcbiAgICAgICAgICAgICAgICAgICAgOiB0eXBlLFxuICAgICAgICAgICAgICB9LFxuICAgICAgICAgICAgfTtcbiAgICAgICAgICB9IGVsc2Uge1xuICAgICAgICAgICAgcmV0dXJuIGZpZWxkcztcbiAgICAgICAgICB9XG4gICAgICAgIH0sXG4gICAgICAgIHtcbiAgICAgICAgICBBQ0w6IHsgdHlwZTogZGVmYXVsdEdyYXBoUUxUeXBlcy5BQ0xfSU5QVVQgfSxcbiAgICAgICAgfVxuICAgICAgKSxcbiAgfSk7XG4gIGNsYXNzR3JhcGhRTENyZWF0ZVR5cGUgPSBwYXJzZUdyYXBoUUxTY2hlbWEuYWRkR3JhcGhRTFR5cGUoXG4gICAgY2xhc3NHcmFwaFFMQ3JlYXRlVHlwZVxuICApO1xuXG4gIGNvbnN0IGNsYXNzR3JhcGhRTFVwZGF0ZVR5cGVOYW1lID0gYFVwZGF0ZSR7Z3JhcGhRTENsYXNzTmFtZX1GaWVsZHNJbnB1dGA7XG4gIGxldCBjbGFzc0dyYXBoUUxVcGRhdGVUeXBlID0gbmV3IEdyYXBoUUxJbnB1dE9iamVjdFR5cGUoe1xuICAgIG5hbWU6IGNsYXNzR3JhcGhRTFVwZGF0ZVR5cGVOYW1lLFxuICAgIGRlc2NyaXB0aW9uOiBgVGhlICR7Y2xhc3NHcmFwaFFMVXBkYXRlVHlwZU5hbWV9IGlucHV0IHR5cGUgaXMgdXNlZCBpbiBvcGVyYXRpb25zIHRoYXQgaW52b2x2ZSBjcmVhdGlvbiBvZiBvYmplY3RzIGluIHRoZSAke2dyYXBoUUxDbGFzc05hbWV9IGNsYXNzLmAsXG4gICAgZmllbGRzOiAoKSA9PlxuICAgICAgY2xhc3NVcGRhdGVGaWVsZHMucmVkdWNlKFxuICAgICAgICAoZmllbGRzLCBmaWVsZCkgPT4ge1xuICAgICAgICAgIGNvbnN0IHR5cGUgPSB0cmFuc2Zvcm1JbnB1dFR5cGVUb0dyYXBoUUwoXG4gICAgICAgICAgICBwYXJzZUNsYXNzLmZpZWxkc1tmaWVsZF0udHlwZSxcbiAgICAgICAgICAgIHBhcnNlQ2xhc3MuZmllbGRzW2ZpZWxkXS50YXJnZXRDbGFzcyxcbiAgICAgICAgICAgIHBhcnNlR3JhcGhRTFNjaGVtYS5wYXJzZUNsYXNzVHlwZXNcbiAgICAgICAgICApO1xuICAgICAgICAgIGlmICh0eXBlKSB7XG4gICAgICAgICAgICByZXR1cm4ge1xuICAgICAgICAgICAgICAuLi5maWVsZHMsXG4gICAgICAgICAgICAgIFtmaWVsZF06IHtcbiAgICAgICAgICAgICAgICBkZXNjcmlwdGlvbjogYFRoaXMgaXMgdGhlIG9iamVjdCAke2ZpZWxkfS5gLFxuICAgICAgICAgICAgICAgIHR5cGUsXG4gICAgICAgICAgICAgIH0sXG4gICAgICAgICAgICB9O1xuICAgICAgICAgIH0gZWxzZSB7XG4gICAgICAgICAgICByZXR1cm4gZmllbGRzO1xuICAgICAgICAgIH1cbiAgICAgICAgfSxcbiAgICAgICAge1xuICAgICAgICAgIEFDTDogeyB0eXBlOiBkZWZhdWx0R3JhcGhRTFR5cGVzLkFDTF9JTlBVVCB9LFxuICAgICAgICB9XG4gICAgICApLFxuICB9KTtcbiAgY2xhc3NHcmFwaFFMVXBkYXRlVHlwZSA9IHBhcnNlR3JhcGhRTFNjaGVtYS5hZGRHcmFwaFFMVHlwZShcbiAgICBjbGFzc0dyYXBoUUxVcGRhdGVUeXBlXG4gICk7XG5cbiAgY29uc3QgY2xhc3NHcmFwaFFMUG9pbnRlclR5cGVOYW1lID0gYCR7Z3JhcGhRTENsYXNzTmFtZX1Qb2ludGVySW5wdXRgO1xuICBsZXQgY2xhc3NHcmFwaFFMUG9pbnRlclR5cGUgPSBuZXcgR3JhcGhRTElucHV0T2JqZWN0VHlwZSh7XG4gICAgbmFtZTogY2xhc3NHcmFwaFFMUG9pbnRlclR5cGVOYW1lLFxuICAgIGRlc2NyaXB0aW9uOiBgQWxsb3cgdG8gbGluayBPUiBhZGQgYW5kIGxpbmsgYW4gb2JqZWN0IG9mIHRoZSAke2dyYXBoUUxDbGFzc05hbWV9IGNsYXNzLmAsXG4gICAgZmllbGRzOiAoKSA9PiB7XG4gICAgICBjb25zdCBmaWVsZHMgPSB7XG4gICAgICAgIGxpbms6IHtcbiAgICAgICAgICBkZXNjcmlwdGlvbjogYExpbmsgYW4gZXhpc3Rpbmcgb2JqZWN0IGZyb20gJHtncmFwaFFMQ2xhc3NOYW1lfSBjbGFzcy4gWW91IGNhbiB1c2UgZWl0aGVyIHRoZSBnbG9iYWwgb3IgdGhlIG9iamVjdCBpZC5gLFxuICAgICAgICAgIHR5cGU6IEdyYXBoUUxJRCxcbiAgICAgICAgfSxcbiAgICAgIH07XG4gICAgICBpZiAoaXNDcmVhdGVFbmFibGVkKSB7XG4gICAgICAgIGZpZWxkc1snY3JlYXRlQW5kTGluayddID0ge1xuICAgICAgICAgIGRlc2NyaXB0aW9uOiBgQ3JlYXRlIGFuZCBsaW5rIGFuIG9iamVjdCBmcm9tICR7Z3JhcGhRTENsYXNzTmFtZX0gY2xhc3MuYCxcbiAgICAgICAgICB0eXBlOiBjbGFzc0dyYXBoUUxDcmVhdGVUeXBlLFxuICAgICAgICB9O1xuICAgICAgfVxuICAgICAgcmV0dXJuIGZpZWxkcztcbiAgICB9LFxuICB9KTtcbiAgY2xhc3NHcmFwaFFMUG9pbnRlclR5cGUgPVxuICAgIHBhcnNlR3JhcGhRTFNjaGVtYS5hZGRHcmFwaFFMVHlwZShjbGFzc0dyYXBoUUxQb2ludGVyVHlwZSkgfHxcbiAgICBkZWZhdWx0R3JhcGhRTFR5cGVzLk9CSkVDVDtcblxuICBjb25zdCBjbGFzc0dyYXBoUUxSZWxhdGlvblR5cGVOYW1lID0gYCR7Z3JhcGhRTENsYXNzTmFtZX1SZWxhdGlvbklucHV0YDtcbiAgbGV0IGNsYXNzR3JhcGhRTFJlbGF0aW9uVHlwZSA9IG5ldyBHcmFwaFFMSW5wdXRPYmplY3RUeXBlKHtcbiAgICBuYW1lOiBjbGFzc0dyYXBoUUxSZWxhdGlvblR5cGVOYW1lLFxuICAgIGRlc2NyaXB0aW9uOiBgQWxsb3cgdG8gYWRkLCByZW1vdmUsIGNyZWF0ZUFuZEFkZCBvYmplY3RzIG9mIHRoZSAke2dyYXBoUUxDbGFzc05hbWV9IGNsYXNzIGludG8gYSByZWxhdGlvbiBmaWVsZC5gLFxuICAgIGZpZWxkczogKCkgPT4ge1xuICAgICAgY29uc3QgZmllbGRzID0ge1xuICAgICAgICBhZGQ6IHtcbiAgICAgICAgICBkZXNjcmlwdGlvbjogYEFkZCBleGlzdGluZyBvYmplY3RzIGZyb20gdGhlICR7Z3JhcGhRTENsYXNzTmFtZX0gY2xhc3MgaW50byB0aGUgcmVsYXRpb24uIFlvdSBjYW4gdXNlIGVpdGhlciB0aGUgZ2xvYmFsIG9yIHRoZSBvYmplY3QgaWRzLmAsXG4gICAgICAgICAgdHlwZTogbmV3IEdyYXBoUUxMaXN0KGRlZmF1bHRHcmFwaFFMVHlwZXMuT0JKRUNUX0lEKSxcbiAgICAgICAgfSxcbiAgICAgICAgcmVtb3ZlOiB7XG4gICAgICAgICAgZGVzY3JpcHRpb246IGBSZW1vdmUgZXhpc3Rpbmcgb2JqZWN0cyBmcm9tIHRoZSAke2dyYXBoUUxDbGFzc05hbWV9IGNsYXNzIG91dCBvZiB0aGUgcmVsYXRpb24uIFlvdSBjYW4gdXNlIGVpdGhlciB0aGUgZ2xvYmFsIG9yIHRoZSBvYmplY3QgaWRzLmAsXG4gICAgICAgICAgdHlwZTogbmV3IEdyYXBoUUxMaXN0KGRlZmF1bHRHcmFwaFFMVHlwZXMuT0JKRUNUX0lEKSxcbiAgICAgICAgfSxcbiAgICAgIH07XG4gICAgICBpZiAoaXNDcmVhdGVFbmFibGVkKSB7XG4gICAgICAgIGZpZWxkc1snY3JlYXRlQW5kQWRkJ10gPSB7XG4gICAgICAgICAgZGVzY3JpcHRpb246IGBDcmVhdGUgYW5kIGFkZCBvYmplY3RzIG9mIHRoZSAke2dyYXBoUUxDbGFzc05hbWV9IGNsYXNzIGludG8gdGhlIHJlbGF0aW9uLmAsXG4gICAgICAgICAgdHlwZTogbmV3IEdyYXBoUUxMaXN0KG5ldyBHcmFwaFFMTm9uTnVsbChjbGFzc0dyYXBoUUxDcmVhdGVUeXBlKSksXG4gICAgICAgIH07XG4gICAgICB9XG4gICAgICByZXR1cm4gZmllbGRzO1xuICAgIH0sXG4gIH0pO1xuICBjbGFzc0dyYXBoUUxSZWxhdGlvblR5cGUgPVxuICAgIHBhcnNlR3JhcGhRTFNjaGVtYS5hZGRHcmFwaFFMVHlwZShjbGFzc0dyYXBoUUxSZWxhdGlvblR5cGUpIHx8XG4gICAgZGVmYXVsdEdyYXBoUUxUeXBlcy5PQkpFQ1Q7XG5cbiAgY29uc3QgY2xhc3NHcmFwaFFMQ29uc3RyYWludHNUeXBlTmFtZSA9IGAke2dyYXBoUUxDbGFzc05hbWV9V2hlcmVJbnB1dGA7XG4gIGxldCBjbGFzc0dyYXBoUUxDb25zdHJhaW50c1R5cGUgPSBuZXcgR3JhcGhRTElucHV0T2JqZWN0VHlwZSh7XG4gICAgbmFtZTogY2xhc3NHcmFwaFFMQ29uc3RyYWludHNUeXBlTmFtZSxcbiAgICBkZXNjcmlwdGlvbjogYFRoZSAke2NsYXNzR3JhcGhRTENvbnN0cmFpbnRzVHlwZU5hbWV9IGlucHV0IHR5cGUgaXMgdXNlZCBpbiBvcGVyYXRpb25zIHRoYXQgaW52b2x2ZSBmaWx0ZXJpbmcgb2JqZWN0cyBvZiAke2dyYXBoUUxDbGFzc05hbWV9IGNsYXNzLmAsXG4gICAgZmllbGRzOiAoKSA9PiAoe1xuICAgICAgLi4uY2xhc3NDb25zdHJhaW50RmllbGRzLnJlZHVjZSgoZmllbGRzLCBmaWVsZCkgPT4ge1xuICAgICAgICBpZiAoWydPUicsICdBTkQnLCAnTk9SJ10uaW5jbHVkZXMoZmllbGQpKSB7XG4gICAgICAgICAgcGFyc2VHcmFwaFFMU2NoZW1hLmxvZy53YXJuKFxuICAgICAgICAgICAgYEZpZWxkICR7ZmllbGR9IGNvdWxkIG5vdCBiZSBhZGRlZCB0byB0aGUgYXV0byBzY2hlbWEgJHtjbGFzc0dyYXBoUUxDb25zdHJhaW50c1R5cGVOYW1lfSBiZWNhdXNlIGl0IGNvbGxpZGVkIHdpdGggYW4gZXhpc3Rpbmcgb25lLmBcbiAgICAgICAgICApO1xuICAgICAgICAgIHJldHVybiBmaWVsZHM7XG4gICAgICAgIH1cbiAgICAgICAgY29uc3QgcGFyc2VGaWVsZCA9IGZpZWxkID09PSAnaWQnID8gJ29iamVjdElkJyA6IGZpZWxkO1xuICAgICAgICBjb25zdCB0eXBlID0gdHJhbnNmb3JtQ29uc3RyYWludFR5cGVUb0dyYXBoUUwoXG4gICAgICAgICAgcGFyc2VDbGFzcy5maWVsZHNbcGFyc2VGaWVsZF0udHlwZSxcbiAgICAgICAgICBwYXJzZUNsYXNzLmZpZWxkc1twYXJzZUZpZWxkXS50YXJnZXRDbGFzcyxcbiAgICAgICAgICBwYXJzZUdyYXBoUUxTY2hlbWEucGFyc2VDbGFzc1R5cGVzLFxuICAgICAgICAgIGZpZWxkXG4gICAgICAgICk7XG4gICAgICAgIGlmICh0eXBlKSB7XG4gICAgICAgICAgcmV0dXJuIHtcbiAgICAgICAgICAgIC4uLmZpZWxkcyxcbiAgICAgICAgICAgIFtmaWVsZF06IHtcbiAgICAgICAgICAgICAgZGVzY3JpcHRpb246IGBUaGlzIGlzIHRoZSBvYmplY3QgJHtmaWVsZH0uYCxcbiAgICAgICAgICAgICAgdHlwZSxcbiAgICAgICAgICAgIH0sXG4gICAgICAgICAgfTtcbiAgICAgICAgfSBlbHNlIHtcbiAgICAgICAgICByZXR1cm4gZmllbGRzO1xuICAgICAgICB9XG4gICAgICB9LCB7fSksXG4gICAgICBPUjoge1xuICAgICAgICBkZXNjcmlwdGlvbjogJ1RoaXMgaXMgdGhlIE9SIG9wZXJhdG9yIHRvIGNvbXBvdW5kIGNvbnN0cmFpbnRzLicsXG4gICAgICAgIHR5cGU6IG5ldyBHcmFwaFFMTGlzdChuZXcgR3JhcGhRTE5vbk51bGwoY2xhc3NHcmFwaFFMQ29uc3RyYWludHNUeXBlKSksXG4gICAgICB9LFxuICAgICAgQU5EOiB7XG4gICAgICAgIGRlc2NyaXB0aW9uOiAnVGhpcyBpcyB0aGUgQU5EIG9wZXJhdG9yIHRvIGNvbXBvdW5kIGNvbnN0cmFpbnRzLicsXG4gICAgICAgIHR5cGU6IG5ldyBHcmFwaFFMTGlzdChuZXcgR3JhcGhRTE5vbk51bGwoY2xhc3NHcmFwaFFMQ29uc3RyYWludHNUeXBlKSksXG4gICAgICB9LFxuICAgICAgTk9SOiB7XG4gICAgICAgIGRlc2NyaXB0aW9uOiAnVGhpcyBpcyB0aGUgTk9SIG9wZXJhdG9yIHRvIGNvbXBvdW5kIGNvbnN0cmFpbnRzLicsXG4gICAgICAgIHR5cGU6IG5ldyBHcmFwaFFMTGlzdChuZXcgR3JhcGhRTE5vbk51bGwoY2xhc3NHcmFwaFFMQ29uc3RyYWludHNUeXBlKSksXG4gICAgICB9LFxuICAgIH0pLFxuICB9KTtcbiAgY2xhc3NHcmFwaFFMQ29uc3RyYWludHNUeXBlID1cbiAgICBwYXJzZUdyYXBoUUxTY2hlbWEuYWRkR3JhcGhRTFR5cGUoY2xhc3NHcmFwaFFMQ29uc3RyYWludHNUeXBlKSB8fFxuICAgIGRlZmF1bHRHcmFwaFFMVHlwZXMuT0JKRUNUO1xuXG4gIGNvbnN0IGNsYXNzR3JhcGhRTFJlbGF0aW9uQ29uc3RyYWludHNUeXBlTmFtZSA9IGAke2dyYXBoUUxDbGFzc05hbWV9UmVsYXRpb25XaGVyZUlucHV0YDtcbiAgbGV0IGNsYXNzR3JhcGhRTFJlbGF0aW9uQ29uc3RyYWludHNUeXBlID0gbmV3IEdyYXBoUUxJbnB1dE9iamVjdFR5cGUoe1xuICAgIG5hbWU6IGNsYXNzR3JhcGhRTFJlbGF0aW9uQ29uc3RyYWludHNUeXBlTmFtZSxcbiAgICBkZXNjcmlwdGlvbjogYFRoZSAke2NsYXNzR3JhcGhRTFJlbGF0aW9uQ29uc3RyYWludHNUeXBlTmFtZX0gaW5wdXQgdHlwZSBpcyB1c2VkIGluIG9wZXJhdGlvbnMgdGhhdCBpbnZvbHZlIGZpbHRlcmluZyBvYmplY3RzIG9mICR7Z3JhcGhRTENsYXNzTmFtZX0gY2xhc3MuYCxcbiAgICBmaWVsZHM6ICgpID0+ICh7XG4gICAgICBoYXZlOiB7XG4gICAgICAgIGRlc2NyaXB0aW9uOlxuICAgICAgICAgICdSdW4gYSByZWxhdGlvbmFsL3BvaW50ZXIgcXVlcnkgd2hlcmUgYXQgbGVhc3Qgb25lIGNoaWxkIG9iamVjdCBjYW4gbWF0Y2guJyxcbiAgICAgICAgdHlwZTogY2xhc3NHcmFwaFFMQ29uc3RyYWludHNUeXBlLFxuICAgICAgfSxcbiAgICAgIGhhdmVOb3Q6IHtcbiAgICAgICAgZGVzY3JpcHRpb246XG4gICAgICAgICAgJ1J1biBhbiBpbnZlcnRlZCByZWxhdGlvbmFsL3BvaW50ZXIgcXVlcnkgd2hlcmUgYXQgbGVhc3Qgb25lIGNoaWxkIG9iamVjdCBjYW4gbWF0Y2guJyxcbiAgICAgICAgdHlwZTogY2xhc3NHcmFwaFFMQ29uc3RyYWludHNUeXBlLFxuICAgICAgfSxcbiAgICAgIGV4aXN0czoge1xuICAgICAgICBkZXNjcmlwdGlvbjogJ0NoZWNrIGlmIHRoZSByZWxhdGlvbi9wb2ludGVyIGNvbnRhaW5zIG9iamVjdHMuJyxcbiAgICAgICAgdHlwZTogR3JhcGhRTEJvb2xlYW4sXG4gICAgICB9LFxuICAgIH0pLFxuICB9KTtcbiAgY2xhc3NHcmFwaFFMUmVsYXRpb25Db25zdHJhaW50c1R5cGUgPVxuICAgIHBhcnNlR3JhcGhRTFNjaGVtYS5hZGRHcmFwaFFMVHlwZShjbGFzc0dyYXBoUUxSZWxhdGlvbkNvbnN0cmFpbnRzVHlwZSkgfHxcbiAgICBkZWZhdWx0R3JhcGhRTFR5cGVzLk9CSkVDVDtcblxuICBjb25zdCBjbGFzc0dyYXBoUUxPcmRlclR5cGVOYW1lID0gYCR7Z3JhcGhRTENsYXNzTmFtZX1PcmRlcmA7XG4gIGxldCBjbGFzc0dyYXBoUUxPcmRlclR5cGUgPSBuZXcgR3JhcGhRTEVudW1UeXBlKHtcbiAgICBuYW1lOiBjbGFzc0dyYXBoUUxPcmRlclR5cGVOYW1lLFxuICAgIGRlc2NyaXB0aW9uOiBgVGhlICR7Y2xhc3NHcmFwaFFMT3JkZXJUeXBlTmFtZX0gaW5wdXQgdHlwZSBpcyB1c2VkIHdoZW4gc29ydGluZyBvYmplY3RzIG9mIHRoZSAke2dyYXBoUUxDbGFzc05hbWV9IGNsYXNzLmAsXG4gICAgdmFsdWVzOiBjbGFzc1NvcnRGaWVsZHMucmVkdWNlKChzb3J0RmllbGRzLCBmaWVsZENvbmZpZykgPT4ge1xuICAgICAgY29uc3QgeyBmaWVsZCwgYXNjLCBkZXNjIH0gPSBmaWVsZENvbmZpZztcbiAgICAgIGNvbnN0IHVwZGF0ZWRTb3J0RmllbGRzID0ge1xuICAgICAgICAuLi5zb3J0RmllbGRzLFxuICAgICAgfTtcbiAgICAgIGNvbnN0IHZhbHVlID0gZmllbGQgPT09ICdpZCcgPyAnb2JqZWN0SWQnIDogZmllbGQ7XG4gICAgICBpZiAoYXNjKSB7XG4gICAgICAgIHVwZGF0ZWRTb3J0RmllbGRzW2Ake2ZpZWxkfV9BU0NgXSA9IHsgdmFsdWUgfTtcbiAgICAgIH1cbiAgICAgIGlmIChkZXNjKSB7XG4gICAgICAgIHVwZGF0ZWRTb3J0RmllbGRzW2Ake2ZpZWxkfV9ERVNDYF0gPSB7IHZhbHVlOiBgLSR7dmFsdWV9YCB9O1xuICAgICAgfVxuICAgICAgcmV0dXJuIHVwZGF0ZWRTb3J0RmllbGRzO1xuICAgIH0sIHt9KSxcbiAgfSk7XG4gIGNsYXNzR3JhcGhRTE9yZGVyVHlwZSA9IHBhcnNlR3JhcGhRTFNjaGVtYS5hZGRHcmFwaFFMVHlwZShcbiAgICBjbGFzc0dyYXBoUUxPcmRlclR5cGVcbiAgKTtcblxuICBjb25zdCBjbGFzc0dyYXBoUUxGaW5kQXJncyA9IHtcbiAgICB3aGVyZToge1xuICAgICAgZGVzY3JpcHRpb246XG4gICAgICAgICdUaGVzZSBhcmUgdGhlIGNvbmRpdGlvbnMgdGhhdCB0aGUgb2JqZWN0cyBuZWVkIHRvIG1hdGNoIGluIG9yZGVyIHRvIGJlIGZvdW5kLicsXG4gICAgICB0eXBlOiBjbGFzc0dyYXBoUUxDb25zdHJhaW50c1R5cGUsXG4gICAgfSxcbiAgICBvcmRlcjoge1xuICAgICAgZGVzY3JpcHRpb246ICdUaGUgZmllbGRzIHRvIGJlIHVzZWQgd2hlbiBzb3J0aW5nIHRoZSBkYXRhIGZldGNoZWQuJyxcbiAgICAgIHR5cGU6IGNsYXNzR3JhcGhRTE9yZGVyVHlwZVxuICAgICAgICA/IG5ldyBHcmFwaFFMTGlzdChuZXcgR3JhcGhRTE5vbk51bGwoY2xhc3NHcmFwaFFMT3JkZXJUeXBlKSlcbiAgICAgICAgOiBHcmFwaFFMU3RyaW5nLFxuICAgIH0sXG4gICAgc2tpcDogZGVmYXVsdEdyYXBoUUxUeXBlcy5TS0lQX0FUVCxcbiAgICAuLi5jb25uZWN0aW9uQXJncyxcbiAgICBvcHRpb25zOiBkZWZhdWx0R3JhcGhRTFR5cGVzLlJFQURfT1BUSU9OU19BVFQsXG4gIH07XG4gIGNvbnN0IGNsYXNzR3JhcGhRTE91dHB1dFR5cGVOYW1lID0gYCR7Z3JhcGhRTENsYXNzTmFtZX1gO1xuICBjb25zdCBpbnRlcmZhY2VzID0gW1xuICAgIGRlZmF1bHRHcmFwaFFMVHlwZXMuUEFSU0VfT0JKRUNULFxuICAgIHBhcnNlR3JhcGhRTFNjaGVtYS5yZWxheU5vZGVJbnRlcmZhY2UsXG4gIF07XG4gIGNvbnN0IHBhcnNlT2JqZWN0RmllbGRzID0ge1xuICAgIGlkOiBnbG9iYWxJZEZpZWxkKGNsYXNzTmFtZSwgb2JqID0+IG9iai5vYmplY3RJZCksXG4gICAgLi4uZGVmYXVsdEdyYXBoUUxUeXBlcy5QQVJTRV9PQkpFQ1RfRklFTERTLFxuICB9O1xuICBjb25zdCBvdXRwdXRGaWVsZHMgPSAoKSA9PiB7XG4gICAgcmV0dXJuIGNsYXNzT3V0cHV0RmllbGRzLnJlZHVjZSgoZmllbGRzLCBmaWVsZCkgPT4ge1xuICAgICAgY29uc3QgdHlwZSA9IHRyYW5zZm9ybU91dHB1dFR5cGVUb0dyYXBoUUwoXG4gICAgICAgIHBhcnNlQ2xhc3MuZmllbGRzW2ZpZWxkXS50eXBlLFxuICAgICAgICBwYXJzZUNsYXNzLmZpZWxkc1tmaWVsZF0udGFyZ2V0Q2xhc3MsXG4gICAgICAgIHBhcnNlR3JhcGhRTFNjaGVtYS5wYXJzZUNsYXNzVHlwZXNcbiAgICAgICk7XG4gICAgICBpZiAocGFyc2VDbGFzcy5maWVsZHNbZmllbGRdLnR5cGUgPT09ICdSZWxhdGlvbicpIHtcbiAgICAgICAgY29uc3QgdGFyZ2V0UGFyc2VDbGFzc1R5cGVzID1cbiAgICAgICAgICBwYXJzZUdyYXBoUUxTY2hlbWEucGFyc2VDbGFzc1R5cGVzW1xuICAgICAgICAgICAgcGFyc2VDbGFzcy5maWVsZHNbZmllbGRdLnRhcmdldENsYXNzXG4gICAgICAgICAgXTtcbiAgICAgICAgY29uc3QgYXJncyA9IHRhcmdldFBhcnNlQ2xhc3NUeXBlc1xuICAgICAgICAgID8gdGFyZ2V0UGFyc2VDbGFzc1R5cGVzLmNsYXNzR3JhcGhRTEZpbmRBcmdzXG4gICAgICAgICAgOiB1bmRlZmluZWQ7XG4gICAgICAgIHJldHVybiB7XG4gICAgICAgICAgLi4uZmllbGRzLFxuICAgICAgICAgIFtmaWVsZF06IHtcbiAgICAgICAgICAgIGRlc2NyaXB0aW9uOiBgVGhpcyBpcyB0aGUgb2JqZWN0ICR7ZmllbGR9LmAsXG4gICAgICAgICAgICBhcmdzLFxuICAgICAgICAgICAgdHlwZTogcGFyc2VDbGFzcy5maWVsZHNbZmllbGRdLnJlcXVpcmVkXG4gICAgICAgICAgICAgID8gbmV3IEdyYXBoUUxOb25OdWxsKHR5cGUpXG4gICAgICAgICAgICAgIDogdHlwZSxcbiAgICAgICAgICAgIGFzeW5jIHJlc29sdmUoc291cmNlLCBhcmdzLCBjb250ZXh0LCBxdWVyeUluZm8pIHtcbiAgICAgICAgICAgICAgdHJ5IHtcbiAgICAgICAgICAgICAgICBjb25zdCB7XG4gICAgICAgICAgICAgICAgICB3aGVyZSxcbiAgICAgICAgICAgICAgICAgIG9yZGVyLFxuICAgICAgICAgICAgICAgICAgc2tpcCxcbiAgICAgICAgICAgICAgICAgIGZpcnN0LFxuICAgICAgICAgICAgICAgICAgYWZ0ZXIsXG4gICAgICAgICAgICAgICAgICBsYXN0LFxuICAgICAgICAgICAgICAgICAgYmVmb3JlLFxuICAgICAgICAgICAgICAgICAgb3B0aW9ucyxcbiAgICAgICAgICAgICAgICB9ID0gYXJncztcbiAgICAgICAgICAgICAgICBjb25zdCB7XG4gICAgICAgICAgICAgICAgICByZWFkUHJlZmVyZW5jZSxcbiAgICAgICAgICAgICAgICAgIGluY2x1ZGVSZWFkUHJlZmVyZW5jZSxcbiAgICAgICAgICAgICAgICAgIHN1YnF1ZXJ5UmVhZFByZWZlcmVuY2UsXG4gICAgICAgICAgICAgICAgfSA9IG9wdGlvbnMgfHwge307XG4gICAgICAgICAgICAgICAgY29uc3QgeyBjb25maWcsIGF1dGgsIGluZm8gfSA9IGNvbnRleHQ7XG4gICAgICAgICAgICAgICAgY29uc3Qgc2VsZWN0ZWRGaWVsZHMgPSBnZXRGaWVsZE5hbWVzKHF1ZXJ5SW5mbyk7XG5cbiAgICAgICAgICAgICAgICBjb25zdCB7IGtleXMsIGluY2x1ZGUgfSA9IGV4dHJhY3RLZXlzQW5kSW5jbHVkZShcbiAgICAgICAgICAgICAgICAgIHNlbGVjdGVkRmllbGRzXG4gICAgICAgICAgICAgICAgICAgIC5maWx0ZXIoZmllbGQgPT4gZmllbGQuc3RhcnRzV2l0aCgnZWRnZXMubm9kZS4nKSlcbiAgICAgICAgICAgICAgICAgICAgLm1hcChmaWVsZCA9PiBmaWVsZC5yZXBsYWNlKCdlZGdlcy5ub2RlLicsICcnKSlcbiAgICAgICAgICAgICAgICApO1xuICAgICAgICAgICAgICAgIGNvbnN0IHBhcnNlT3JkZXIgPSBvcmRlciAmJiBvcmRlci5qb2luKCcsJyk7XG5cbiAgICAgICAgICAgICAgICByZXR1cm4gb2JqZWN0c1F1ZXJpZXMuZmluZE9iamVjdHMoXG4gICAgICAgICAgICAgICAgICBzb3VyY2VbZmllbGRdLmNsYXNzTmFtZSxcbiAgICAgICAgICAgICAgICAgIHtcbiAgICAgICAgICAgICAgICAgICAgJHJlbGF0ZWRUbzoge1xuICAgICAgICAgICAgICAgICAgICAgIG9iamVjdDoge1xuICAgICAgICAgICAgICAgICAgICAgICAgX190eXBlOiAnUG9pbnRlcicsXG4gICAgICAgICAgICAgICAgICAgICAgICBjbGFzc05hbWU6IGNsYXNzTmFtZSxcbiAgICAgICAgICAgICAgICAgICAgICAgIG9iamVjdElkOiBzb3VyY2Uub2JqZWN0SWQsXG4gICAgICAgICAgICAgICAgICAgICAgfSxcbiAgICAgICAgICAgICAgICAgICAgICBrZXk6IGZpZWxkLFxuICAgICAgICAgICAgICAgICAgICB9LFxuICAgICAgICAgICAgICAgICAgICAuLi4od2hlcmUgfHwge30pLFxuICAgICAgICAgICAgICAgICAgfSxcbiAgICAgICAgICAgICAgICAgIHBhcnNlT3JkZXIsXG4gICAgICAgICAgICAgICAgICBza2lwLFxuICAgICAgICAgICAgICAgICAgZmlyc3QsXG4gICAgICAgICAgICAgICAgICBhZnRlcixcbiAgICAgICAgICAgICAgICAgIGxhc3QsXG4gICAgICAgICAgICAgICAgICBiZWZvcmUsXG4gICAgICAgICAgICAgICAgICBrZXlzLFxuICAgICAgICAgICAgICAgICAgaW5jbHVkZSxcbiAgICAgICAgICAgICAgICAgIGZhbHNlLFxuICAgICAgICAgICAgICAgICAgcmVhZFByZWZlcmVuY2UsXG4gICAgICAgICAgICAgICAgICBpbmNsdWRlUmVhZFByZWZlcmVuY2UsXG4gICAgICAgICAgICAgICAgICBzdWJxdWVyeVJlYWRQcmVmZXJlbmNlLFxuICAgICAgICAgICAgICAgICAgY29uZmlnLFxuICAgICAgICAgICAgICAgICAgYXV0aCxcbiAgICAgICAgICAgICAgICAgIGluZm8sXG4gICAgICAgICAgICAgICAgICBzZWxlY3RlZEZpZWxkcyxcbiAgICAgICAgICAgICAgICAgIHBhcnNlR3JhcGhRTFNjaGVtYS5wYXJzZUNsYXNzZXNcbiAgICAgICAgICAgICAgICApO1xuICAgICAgICAgICAgICB9IGNhdGNoIChlKSB7XG4gICAgICAgICAgICAgICAgcGFyc2VHcmFwaFFMU2NoZW1hLmhhbmRsZUVycm9yKGUpO1xuICAgICAgICAgICAgICB9XG4gICAgICAgICAgICB9LFxuICAgICAgICAgIH0sXG4gICAgICAgIH07XG4gICAgICB9IGVsc2UgaWYgKHBhcnNlQ2xhc3MuZmllbGRzW2ZpZWxkXS50eXBlID09PSAnUG9seWdvbicpIHtcbiAgICAgICAgcmV0dXJuIHtcbiAgICAgICAgICAuLi5maWVsZHMsXG4gICAgICAgICAgW2ZpZWxkXToge1xuICAgICAgICAgICAgZGVzY3JpcHRpb246IGBUaGlzIGlzIHRoZSBvYmplY3QgJHtmaWVsZH0uYCxcbiAgICAgICAgICAgIHR5cGU6IHBhcnNlQ2xhc3MuZmllbGRzW2ZpZWxkXS5yZXF1aXJlZFxuICAgICAgICAgICAgICA/IG5ldyBHcmFwaFFMTm9uTnVsbCh0eXBlKVxuICAgICAgICAgICAgICA6IHR5cGUsXG4gICAgICAgICAgICBhc3luYyByZXNvbHZlKHNvdXJjZSkge1xuICAgICAgICAgICAgICBpZiAoc291cmNlW2ZpZWxkXSAmJiBzb3VyY2VbZmllbGRdLmNvb3JkaW5hdGVzKSB7XG4gICAgICAgICAgICAgICAgcmV0dXJuIHNvdXJjZVtmaWVsZF0uY29vcmRpbmF0ZXMubWFwKGNvb3JkaW5hdGUgPT4gKHtcbiAgICAgICAgICAgICAgICAgIGxhdGl0dWRlOiBjb29yZGluYXRlWzBdLFxuICAgICAgICAgICAgICAgICAgbG9uZ2l0dWRlOiBjb29yZGluYXRlWzFdLFxuICAgICAgICAgICAgICAgIH0pKTtcbiAgICAgICAgICAgICAgfSBlbHNlIHtcbiAgICAgICAgICAgICAgICByZXR1cm4gbnVsbDtcbiAgICAgICAgICAgICAgfVxuICAgICAgICAgICAgfSxcbiAgICAgICAgICB9LFxuICAgICAgICB9O1xuICAgICAgfSBlbHNlIGlmIChwYXJzZUNsYXNzLmZpZWxkc1tmaWVsZF0udHlwZSA9PT0gJ0FycmF5Jykge1xuICAgICAgICByZXR1cm4ge1xuICAgICAgICAgIC4uLmZpZWxkcyxcbiAgICAgICAgICBbZmllbGRdOiB7XG4gICAgICAgICAgICBkZXNjcmlwdGlvbjogYFVzZSBJbmxpbmUgRnJhZ21lbnQgb24gQXJyYXkgdG8gZ2V0IHJlc3VsdHM6IGh0dHBzOi8vZ3JhcGhxbC5vcmcvbGVhcm4vcXVlcmllcy8jaW5saW5lLWZyYWdtZW50c2AsXG4gICAgICAgICAgICB0eXBlOiBwYXJzZUNsYXNzLmZpZWxkc1tmaWVsZF0ucmVxdWlyZWRcbiAgICAgICAgICAgICAgPyBuZXcgR3JhcGhRTE5vbk51bGwodHlwZSlcbiAgICAgICAgICAgICAgOiB0eXBlLFxuICAgICAgICAgICAgYXN5bmMgcmVzb2x2ZShzb3VyY2UpIHtcbiAgICAgICAgICAgICAgaWYgKCFzb3VyY2VbZmllbGRdKSByZXR1cm4gbnVsbDtcbiAgICAgICAgICAgICAgcmV0dXJuIHNvdXJjZVtmaWVsZF0ubWFwKGFzeW5jIGVsZW0gPT4ge1xuICAgICAgICAgICAgICAgIGlmIChcbiAgICAgICAgICAgICAgICAgIGVsZW0uY2xhc3NOYW1lICYmXG4gICAgICAgICAgICAgICAgICBlbGVtLm9iamVjdElkICYmXG4gICAgICAgICAgICAgICAgICBlbGVtLl9fdHlwZSA9PT0gJ09iamVjdCdcbiAgICAgICAgICAgICAgICApIHtcbiAgICAgICAgICAgICAgICAgIHJldHVybiBlbGVtO1xuICAgICAgICAgICAgICAgIH0gZWxzZSB7XG4gICAgICAgICAgICAgICAgICByZXR1cm4geyB2YWx1ZTogZWxlbSB9O1xuICAgICAgICAgICAgICAgIH1cbiAgICAgICAgICAgICAgfSk7XG4gICAgICAgICAgICB9LFxuICAgICAgICAgIH0sXG4gICAgICAgIH07XG4gICAgICB9IGVsc2UgaWYgKHR5cGUpIHtcbiAgICAgICAgcmV0dXJuIHtcbiAgICAgICAgICAuLi5maWVsZHMsXG4gICAgICAgICAgW2ZpZWxkXToge1xuICAgICAgICAgICAgZGVzY3JpcHRpb246IGBUaGlzIGlzIHRoZSBvYmplY3QgJHtmaWVsZH0uYCxcbiAgICAgICAgICAgIHR5cGU6IHBhcnNlQ2xhc3MuZmllbGRzW2ZpZWxkXS5yZXF1aXJlZFxuICAgICAgICAgICAgICA/IG5ldyBHcmFwaFFMTm9uTnVsbCh0eXBlKVxuICAgICAgICAgICAgICA6IHR5cGUsXG4gICAgICAgICAgfSxcbiAgICAgICAgfTtcbiAgICAgIH0gZWxzZSB7XG4gICAgICAgIHJldHVybiBmaWVsZHM7XG4gICAgICB9XG4gICAgfSwgcGFyc2VPYmplY3RGaWVsZHMpO1xuICB9O1xuICBsZXQgY2xhc3NHcmFwaFFMT3V0cHV0VHlwZSA9IG5ldyBHcmFwaFFMT2JqZWN0VHlwZSh7XG4gICAgbmFtZTogY2xhc3NHcmFwaFFMT3V0cHV0VHlwZU5hbWUsXG4gICAgZGVzY3JpcHRpb246IGBUaGUgJHtjbGFzc0dyYXBoUUxPdXRwdXRUeXBlTmFtZX0gb2JqZWN0IHR5cGUgaXMgdXNlZCBpbiBvcGVyYXRpb25zIHRoYXQgaW52b2x2ZSBvdXRwdXR0aW5nIG9iamVjdHMgb2YgJHtncmFwaFFMQ2xhc3NOYW1lfSBjbGFzcy5gLFxuICAgIGludGVyZmFjZXMsXG4gICAgZmllbGRzOiBvdXRwdXRGaWVsZHMsXG4gIH0pO1xuICBjbGFzc0dyYXBoUUxPdXRwdXRUeXBlID0gcGFyc2VHcmFwaFFMU2NoZW1hLmFkZEdyYXBoUUxUeXBlKFxuICAgIGNsYXNzR3JhcGhRTE91dHB1dFR5cGVcbiAgKTtcblxuICBjb25zdCB7IGNvbm5lY3Rpb25UeXBlLCBlZGdlVHlwZSB9ID0gY29ubmVjdGlvbkRlZmluaXRpb25zKHtcbiAgICBuYW1lOiBncmFwaFFMQ2xhc3NOYW1lLFxuICAgIGNvbm5lY3Rpb25GaWVsZHM6IHtcbiAgICAgIGNvdW50OiBkZWZhdWx0R3JhcGhRTFR5cGVzLkNPVU5UX0FUVCxcbiAgICB9LFxuICAgIG5vZGVUeXBlOiBjbGFzc0dyYXBoUUxPdXRwdXRUeXBlIHx8IGRlZmF1bHRHcmFwaFFMVHlwZXMuT0JKRUNULFxuICB9KTtcbiAgbGV0IGNsYXNzR3JhcGhRTEZpbmRSZXN1bHRUeXBlID0gdW5kZWZpbmVkO1xuICBpZiAoXG4gICAgcGFyc2VHcmFwaFFMU2NoZW1hLmFkZEdyYXBoUUxUeXBlKGVkZ2VUeXBlKSAmJlxuICAgIHBhcnNlR3JhcGhRTFNjaGVtYS5hZGRHcmFwaFFMVHlwZShjb25uZWN0aW9uVHlwZSwgZmFsc2UsIGZhbHNlLCB0cnVlKVxuICApIHtcbiAgICBjbGFzc0dyYXBoUUxGaW5kUmVzdWx0VHlwZSA9IGNvbm5lY3Rpb25UeXBlO1xuICB9XG5cbiAgcGFyc2VHcmFwaFFMU2NoZW1hLnBhcnNlQ2xhc3NUeXBlc1tjbGFzc05hbWVdID0ge1xuICAgIGNsYXNzR3JhcGhRTFBvaW50ZXJUeXBlLFxuICAgIGNsYXNzR3JhcGhRTFJlbGF0aW9uVHlwZSxcbiAgICBjbGFzc0dyYXBoUUxDcmVhdGVUeXBlLFxuICAgIGNsYXNzR3JhcGhRTFVwZGF0ZVR5cGUsXG4gICAgY2xhc3NHcmFwaFFMQ29uc3RyYWludHNUeXBlLFxuICAgIGNsYXNzR3JhcGhRTFJlbGF0aW9uQ29uc3RyYWludHNUeXBlLFxuICAgIGNsYXNzR3JhcGhRTEZpbmRBcmdzLFxuICAgIGNsYXNzR3JhcGhRTE91dHB1dFR5cGUsXG4gICAgY2xhc3NHcmFwaFFMRmluZFJlc3VsdFR5cGUsXG4gICAgY29uZmlnOiB7XG4gICAgICBwYXJzZUNsYXNzQ29uZmlnLFxuICAgICAgaXNDcmVhdGVFbmFibGVkLFxuICAgICAgaXNVcGRhdGVFbmFibGVkLFxuICAgIH0sXG4gIH07XG5cbiAgaWYgKGNsYXNzTmFtZSA9PT0gJ19Vc2VyJykge1xuICAgIGNvbnN0IHZpZXdlclR5cGUgPSBuZXcgR3JhcGhRTE9iamVjdFR5cGUoe1xuICAgICAgbmFtZTogJ1ZpZXdlcicsXG4gICAgICBkZXNjcmlwdGlvbjogYFRoZSBWaWV3ZXIgb2JqZWN0IHR5cGUgaXMgdXNlZCBpbiBvcGVyYXRpb25zIHRoYXQgaW52b2x2ZSBvdXRwdXR0aW5nIHRoZSBjdXJyZW50IHVzZXIgZGF0YS5gLFxuICAgICAgZmllbGRzOiAoKSA9PiAoe1xuICAgICAgICBzZXNzaW9uVG9rZW46IGRlZmF1bHRHcmFwaFFMVHlwZXMuU0VTU0lPTl9UT0tFTl9BVFQsXG4gICAgICAgIHVzZXI6IHtcbiAgICAgICAgICBkZXNjcmlwdGlvbjogJ1RoaXMgaXMgdGhlIGN1cnJlbnQgdXNlci4nLFxuICAgICAgICAgIHR5cGU6IG5ldyBHcmFwaFFMTm9uTnVsbChjbGFzc0dyYXBoUUxPdXRwdXRUeXBlKSxcbiAgICAgICAgfSxcbiAgICAgIH0pLFxuICAgIH0pO1xuICAgIHBhcnNlR3JhcGhRTFNjaGVtYS5hZGRHcmFwaFFMVHlwZSh2aWV3ZXJUeXBlLCB0cnVlLCB0cnVlKTtcbiAgICBwYXJzZUdyYXBoUUxTY2hlbWEudmlld2VyVHlwZSA9IHZpZXdlclR5cGU7XG4gIH1cbn07XG5cbmV4cG9ydCB7IGV4dHJhY3RLZXlzQW5kSW5jbHVkZSwgbG9hZCB9O1xuIl19