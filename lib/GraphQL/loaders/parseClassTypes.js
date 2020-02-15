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
                return await objectsQueries.findObjects(source[field].className, _objectSpread({
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
//# sourceMappingURL=data:application/json;charset=utf-8;base64,eyJ2ZXJzaW9uIjozLCJzb3VyY2VzIjpbIi4uLy4uLy4uL3NyYy9HcmFwaFFML2xvYWRlcnMvcGFyc2VDbGFzc1R5cGVzLmpzIl0sIm5hbWVzIjpbImdldFBhcnNlQ2xhc3NUeXBlQ29uZmlnIiwicGFyc2VDbGFzc0NvbmZpZyIsInR5cGUiLCJnZXRJbnB1dEZpZWxkc0FuZENvbnN0cmFpbnRzIiwicGFyc2VDbGFzcyIsImNsYXNzRmllbGRzIiwiT2JqZWN0Iiwia2V5cyIsImZpZWxkcyIsImNvbmNhdCIsImlucHV0RmllbGRzIiwiYWxsb3dlZElucHV0RmllbGRzIiwib3V0cHV0RmllbGRzIiwiYWxsb3dlZE91dHB1dEZpZWxkcyIsImNvbnN0cmFpbnRGaWVsZHMiLCJhbGxvd2VkQ29uc3RyYWludEZpZWxkcyIsInNvcnRGaWVsZHMiLCJhbGxvd2VkU29ydEZpZWxkcyIsImNsYXNzT3V0cHV0RmllbGRzIiwiY2xhc3NDcmVhdGVGaWVsZHMiLCJjbGFzc1VwZGF0ZUZpZWxkcyIsImNsYXNzQ29uc3RyYWludEZpZWxkcyIsImNsYXNzU29ydEZpZWxkcyIsImNsYXNzQ3VzdG9tRmllbGRzIiwiZmlsdGVyIiwiZmllbGQiLCJkZWZhdWx0R3JhcGhRTFR5cGVzIiwiUEFSU0VfT0JKRUNUX0ZJRUxEUyIsImluY2x1ZGVzIiwiY3JlYXRlIiwidXBkYXRlIiwiY2xhc3NOYW1lIiwib3V0cHV0RmllbGQiLCJsZW5ndGgiLCJwdXNoIiwiYXNjIiwiZGVzYyIsIm1hcCIsImxvYWQiLCJwYXJzZUdyYXBoUUxTY2hlbWEiLCJncmFwaFFMQ2xhc3NOYW1lIiwiaXNDcmVhdGVFbmFibGVkIiwiaXNVcGRhdGVFbmFibGVkIiwiY2xhc3NHcmFwaFFMQ3JlYXRlVHlwZU5hbWUiLCJjbGFzc0dyYXBoUUxDcmVhdGVUeXBlIiwiR3JhcGhRTElucHV0T2JqZWN0VHlwZSIsIm5hbWUiLCJkZXNjcmlwdGlvbiIsInJlZHVjZSIsInRhcmdldENsYXNzIiwicGFyc2VDbGFzc1R5cGVzIiwicmVxdWlyZWQiLCJHcmFwaFFMTm9uTnVsbCIsIkFDTCIsIkFDTF9JTlBVVCIsImFkZEdyYXBoUUxUeXBlIiwiY2xhc3NHcmFwaFFMVXBkYXRlVHlwZU5hbWUiLCJjbGFzc0dyYXBoUUxVcGRhdGVUeXBlIiwiY2xhc3NHcmFwaFFMUG9pbnRlclR5cGVOYW1lIiwiY2xhc3NHcmFwaFFMUG9pbnRlclR5cGUiLCJsaW5rIiwiR3JhcGhRTElEIiwiT0JKRUNUIiwiY2xhc3NHcmFwaFFMUmVsYXRpb25UeXBlTmFtZSIsImNsYXNzR3JhcGhRTFJlbGF0aW9uVHlwZSIsImFkZCIsIkdyYXBoUUxMaXN0IiwiT0JKRUNUX0lEIiwicmVtb3ZlIiwiY2xhc3NHcmFwaFFMQ29uc3RyYWludHNUeXBlTmFtZSIsImNsYXNzR3JhcGhRTENvbnN0cmFpbnRzVHlwZSIsImxvZyIsIndhcm4iLCJwYXJzZUZpZWxkIiwiT1IiLCJBTkQiLCJOT1IiLCJjbGFzc0dyYXBoUUxSZWxhdGlvbkNvbnN0cmFpbnRzVHlwZU5hbWUiLCJjbGFzc0dyYXBoUUxSZWxhdGlvbkNvbnN0cmFpbnRzVHlwZSIsImhhdmUiLCJoYXZlTm90IiwiZXhpc3RzIiwiR3JhcGhRTEJvb2xlYW4iLCJjbGFzc0dyYXBoUUxPcmRlclR5cGVOYW1lIiwiY2xhc3NHcmFwaFFMT3JkZXJUeXBlIiwiR3JhcGhRTEVudW1UeXBlIiwidmFsdWVzIiwiZmllbGRDb25maWciLCJ1cGRhdGVkU29ydEZpZWxkcyIsInZhbHVlIiwiY2xhc3NHcmFwaFFMRmluZEFyZ3MiLCJ3aGVyZSIsIm9yZGVyIiwiR3JhcGhRTFN0cmluZyIsInNraXAiLCJTS0lQX0FUVCIsImNvbm5lY3Rpb25BcmdzIiwib3B0aW9ucyIsIlJFQURfT1BUSU9OU19BVFQiLCJjbGFzc0dyYXBoUUxPdXRwdXRUeXBlTmFtZSIsImludGVyZmFjZXMiLCJQQVJTRV9PQkpFQ1QiLCJyZWxheU5vZGVJbnRlcmZhY2UiLCJwYXJzZU9iamVjdEZpZWxkcyIsImlkIiwib2JqIiwib2JqZWN0SWQiLCJ0YXJnZXRQYXJzZUNsYXNzVHlwZXMiLCJhcmdzIiwidW5kZWZpbmVkIiwicmVzb2x2ZSIsInNvdXJjZSIsImNvbnRleHQiLCJxdWVyeUluZm8iLCJmaXJzdCIsImFmdGVyIiwibGFzdCIsImJlZm9yZSIsInJlYWRQcmVmZXJlbmNlIiwiaW5jbHVkZVJlYWRQcmVmZXJlbmNlIiwic3VicXVlcnlSZWFkUHJlZmVyZW5jZSIsImNvbmZpZyIsImF1dGgiLCJpbmZvIiwic2VsZWN0ZWRGaWVsZHMiLCJpbmNsdWRlIiwic3RhcnRzV2l0aCIsInJlcGxhY2UiLCJwYXJzZU9yZGVyIiwiam9pbiIsIm9iamVjdHNRdWVyaWVzIiwiZmluZE9iamVjdHMiLCIkcmVsYXRlZFRvIiwib2JqZWN0IiwiX190eXBlIiwia2V5IiwicGFyc2VDbGFzc2VzIiwiZSIsImhhbmRsZUVycm9yIiwiY29vcmRpbmF0ZXMiLCJjb29yZGluYXRlIiwibGF0aXR1ZGUiLCJsb25naXR1ZGUiLCJlbGVtIiwiY2xhc3NHcmFwaFFMT3V0cHV0VHlwZSIsIkdyYXBoUUxPYmplY3RUeXBlIiwiY29ubmVjdGlvblR5cGUiLCJlZGdlVHlwZSIsImNvbm5lY3Rpb25GaWVsZHMiLCJjb3VudCIsIkNPVU5UX0FUVCIsIm5vZGVUeXBlIiwiY2xhc3NHcmFwaFFMRmluZFJlc3VsdFR5cGUiLCJ2aWV3ZXJUeXBlIiwic2Vzc2lvblRva2VuIiwiU0VTU0lPTl9UT0tFTl9BVFQiLCJ1c2VyIl0sIm1hcHBpbmdzIjoiOzs7Ozs7Ozs7Ozs7O0FBQUE7O0FBVUE7O0FBS0E7O0FBQ0E7O0FBQ0E7O0FBQ0E7O0FBQ0E7O0FBQ0E7O0FBQ0E7O0FBQ0E7O0FBQ0E7Ozs7Ozs7Ozs7Ozs7O0FBS0EsTUFBTUEsdUJBQXVCLEdBQUcsVUFDOUJDLGdCQUQ4QixFQUU5QjtBQUNBLFNBQVFBLGdCQUFnQixJQUFJQSxnQkFBZ0IsQ0FBQ0MsSUFBdEMsSUFBK0MsRUFBdEQ7QUFDRCxDQUpEOztBQU1BLE1BQU1DLDRCQUE0QixHQUFHLFVBQ25DQyxVQURtQyxFQUVuQ0gsZ0JBRm1DLEVBR25DO0FBQ0EsUUFBTUksV0FBVyxHQUFHQyxNQUFNLENBQUNDLElBQVAsQ0FBWUgsVUFBVSxDQUFDSSxNQUF2QixFQUErQkMsTUFBL0IsQ0FBc0MsSUFBdEMsQ0FBcEI7QUFDQSxRQUFNO0FBQ0pDLElBQUFBLFdBQVcsRUFBRUMsa0JBRFQ7QUFFSkMsSUFBQUEsWUFBWSxFQUFFQyxtQkFGVjtBQUdKQyxJQUFBQSxnQkFBZ0IsRUFBRUMsdUJBSGQ7QUFJSkMsSUFBQUEsVUFBVSxFQUFFQztBQUpSLE1BS0ZqQix1QkFBdUIsQ0FBQ0MsZ0JBQUQsQ0FMM0I7QUFPQSxNQUFJaUIsaUJBQUo7QUFDQSxNQUFJQyxpQkFBSjtBQUNBLE1BQUlDLGlCQUFKO0FBQ0EsTUFBSUMscUJBQUo7QUFDQSxNQUFJQyxlQUFKLENBYkEsQ0FlQTs7QUFDQSxRQUFNQyxpQkFBaUIsR0FBR2xCLFdBQVcsQ0FBQ21CLE1BQVosQ0FBbUJDLEtBQUssSUFBSTtBQUNwRCxXQUNFLENBQUNuQixNQUFNLENBQUNDLElBQVAsQ0FBWW1CLG1CQUFtQixDQUFDQyxtQkFBaEMsRUFBcURDLFFBQXJELENBQThESCxLQUE5RCxDQUFELElBQ0FBLEtBQUssS0FBSyxJQUZaO0FBSUQsR0FMeUIsQ0FBMUI7O0FBT0EsTUFBSWQsa0JBQWtCLElBQUlBLGtCQUFrQixDQUFDa0IsTUFBN0MsRUFBcUQ7QUFDbkRWLElBQUFBLGlCQUFpQixHQUFHSSxpQkFBaUIsQ0FBQ0MsTUFBbEIsQ0FBeUJDLEtBQUssSUFBSTtBQUNwRCxhQUFPZCxrQkFBa0IsQ0FBQ2tCLE1BQW5CLENBQTBCRCxRQUExQixDQUFtQ0gsS0FBbkMsQ0FBUDtBQUNELEtBRm1CLENBQXBCO0FBR0QsR0FKRCxNQUlPO0FBQ0xOLElBQUFBLGlCQUFpQixHQUFHSSxpQkFBcEI7QUFDRDs7QUFDRCxNQUFJWixrQkFBa0IsSUFBSUEsa0JBQWtCLENBQUNtQixNQUE3QyxFQUFxRDtBQUNuRFYsSUFBQUEsaUJBQWlCLEdBQUdHLGlCQUFpQixDQUFDQyxNQUFsQixDQUF5QkMsS0FBSyxJQUFJO0FBQ3BELGFBQU9kLGtCQUFrQixDQUFDbUIsTUFBbkIsQ0FBMEJGLFFBQTFCLENBQW1DSCxLQUFuQyxDQUFQO0FBQ0QsS0FGbUIsQ0FBcEI7QUFHRCxHQUpELE1BSU87QUFDTEwsSUFBQUEsaUJBQWlCLEdBQUdHLGlCQUFwQjtBQUNEOztBQUVELE1BQUlWLG1CQUFKLEVBQXlCO0FBQ3ZCSyxJQUFBQSxpQkFBaUIsR0FBR0ssaUJBQWlCLENBQUNDLE1BQWxCLENBQXlCQyxLQUFLLElBQUk7QUFDcEQsYUFBT1osbUJBQW1CLENBQUNlLFFBQXBCLENBQTZCSCxLQUE3QixDQUFQO0FBQ0QsS0FGbUIsQ0FBcEI7QUFHRCxHQUpELE1BSU87QUFDTFAsSUFBQUEsaUJBQWlCLEdBQUdLLGlCQUFwQjtBQUNELEdBNUNELENBNkNBOzs7QUFDQSxNQUFJbkIsVUFBVSxDQUFDMkIsU0FBWCxLQUF5QixPQUE3QixFQUFzQztBQUNwQ2IsSUFBQUEsaUJBQWlCLEdBQUdBLGlCQUFpQixDQUFDTSxNQUFsQixDQUNsQlEsV0FBVyxJQUFJQSxXQUFXLEtBQUssVUFEYixDQUFwQjtBQUdEOztBQUVELE1BQUlqQix1QkFBSixFQUE2QjtBQUMzQk0sSUFBQUEscUJBQXFCLEdBQUdFLGlCQUFpQixDQUFDQyxNQUFsQixDQUF5QkMsS0FBSyxJQUFJO0FBQ3hELGFBQU9WLHVCQUF1QixDQUFDYSxRQUF4QixDQUFpQ0gsS0FBakMsQ0FBUDtBQUNELEtBRnVCLENBQXhCO0FBR0QsR0FKRCxNQUlPO0FBQ0xKLElBQUFBLHFCQUFxQixHQUFHaEIsV0FBeEI7QUFDRDs7QUFFRCxNQUFJWSxpQkFBSixFQUF1QjtBQUNyQkssSUFBQUEsZUFBZSxHQUFHTCxpQkFBbEI7O0FBQ0EsUUFBSSxDQUFDSyxlQUFlLENBQUNXLE1BQXJCLEVBQTZCO0FBQzNCO0FBQ0E7QUFDQVgsTUFBQUEsZUFBZSxDQUFDWSxJQUFoQixDQUFxQjtBQUNuQlQsUUFBQUEsS0FBSyxFQUFFLElBRFk7QUFFbkJVLFFBQUFBLEdBQUcsRUFBRSxJQUZjO0FBR25CQyxRQUFBQSxJQUFJLEVBQUU7QUFIYSxPQUFyQjtBQUtEO0FBQ0YsR0FYRCxNQVdPO0FBQ0xkLElBQUFBLGVBQWUsR0FBR2pCLFdBQVcsQ0FBQ2dDLEdBQVosQ0FBZ0JaLEtBQUssSUFBSTtBQUN6QyxhQUFPO0FBQUVBLFFBQUFBLEtBQUY7QUFBU1UsUUFBQUEsR0FBRyxFQUFFLElBQWQ7QUFBb0JDLFFBQUFBLElBQUksRUFBRTtBQUExQixPQUFQO0FBQ0QsS0FGaUIsQ0FBbEI7QUFHRDs7QUFFRCxTQUFPO0FBQ0xqQixJQUFBQSxpQkFESztBQUVMQyxJQUFBQSxpQkFGSztBQUdMQyxJQUFBQSxxQkFISztBQUlMSCxJQUFBQSxpQkFKSztBQUtMSSxJQUFBQTtBQUxLLEdBQVA7QUFPRCxDQXZGRDs7QUF5RkEsTUFBTWdCLElBQUksR0FBRyxDQUNYQyxrQkFEVyxFQUVYbkMsVUFGVyxFQUdYSCxnQkFIVyxLQUlSO0FBQ0gsUUFBTThCLFNBQVMsR0FBRzNCLFVBQVUsQ0FBQzJCLFNBQTdCO0FBQ0EsUUFBTVMsZ0JBQWdCLEdBQUcsNENBQTRCVCxTQUE1QixDQUF6QjtBQUNBLFFBQU07QUFDSlosSUFBQUEsaUJBREk7QUFFSkMsSUFBQUEsaUJBRkk7QUFHSkYsSUFBQUEsaUJBSEk7QUFJSkcsSUFBQUEscUJBSkk7QUFLSkMsSUFBQUE7QUFMSSxNQU1GbkIsNEJBQTRCLENBQUNDLFVBQUQsRUFBYUgsZ0JBQWIsQ0FOaEM7QUFRQSxRQUFNO0FBQ0o0QixJQUFBQSxNQUFNLEVBQUVZLGVBQWUsR0FBRyxJQUR0QjtBQUVKWCxJQUFBQSxNQUFNLEVBQUVZLGVBQWUsR0FBRztBQUZ0QixNQUdGLG9EQUE0QnpDLGdCQUE1QixDQUhKO0FBS0EsUUFBTTBDLDBCQUEwQixHQUFJLFNBQVFILGdCQUFpQixhQUE3RDtBQUNBLE1BQUlJLHNCQUFzQixHQUFHLElBQUlDLCtCQUFKLENBQTJCO0FBQ3REQyxJQUFBQSxJQUFJLEVBQUVILDBCQURnRDtBQUV0REksSUFBQUEsV0FBVyxFQUFHLE9BQU1KLDBCQUEyQiw2RUFBNEVILGdCQUFpQixTQUZ0RjtBQUd0RGhDLElBQUFBLE1BQU0sRUFBRSxNQUNOVyxpQkFBaUIsQ0FBQzZCLE1BQWxCLENBQ0UsQ0FBQ3hDLE1BQUQsRUFBU2lCLEtBQVQsS0FBbUI7QUFDakIsWUFBTXZCLElBQUksR0FBRyw0Q0FDWEUsVUFBVSxDQUFDSSxNQUFYLENBQWtCaUIsS0FBbEIsRUFBeUJ2QixJQURkLEVBRVhFLFVBQVUsQ0FBQ0ksTUFBWCxDQUFrQmlCLEtBQWxCLEVBQXlCd0IsV0FGZCxFQUdYVixrQkFBa0IsQ0FBQ1csZUFIUixDQUFiOztBQUtBLFVBQUloRCxJQUFKLEVBQVU7QUFDUixpQ0FDS00sTUFETDtBQUVFLFdBQUNpQixLQUFELEdBQVM7QUFDUHNCLFlBQUFBLFdBQVcsRUFBRyxzQkFBcUJ0QixLQUFNLEdBRGxDO0FBRVB2QixZQUFBQSxJQUFJLEVBQ0Q2QixTQUFTLEtBQUssT0FBZCxLQUNFTixLQUFLLEtBQUssVUFBVixJQUF3QkEsS0FBSyxLQUFLLFVBRHBDLENBQUQsSUFFQXJCLFVBQVUsQ0FBQ0ksTUFBWCxDQUFrQmlCLEtBQWxCLEVBQXlCMEIsUUFGekIsR0FHSSxJQUFJQyx1QkFBSixDQUFtQmxELElBQW5CLENBSEosR0FJSUE7QUFQQztBQUZYO0FBWUQsT0FiRCxNQWFPO0FBQ0wsZUFBT00sTUFBUDtBQUNEO0FBQ0YsS0F2QkgsRUF3QkU7QUFDRTZDLE1BQUFBLEdBQUcsRUFBRTtBQUFFbkQsUUFBQUEsSUFBSSxFQUFFd0IsbUJBQW1CLENBQUM0QjtBQUE1QjtBQURQLEtBeEJGO0FBSm9ELEdBQTNCLENBQTdCO0FBaUNBVixFQUFBQSxzQkFBc0IsR0FBR0wsa0JBQWtCLENBQUNnQixjQUFuQixDQUN2Qlgsc0JBRHVCLENBQXpCO0FBSUEsUUFBTVksMEJBQTBCLEdBQUksU0FBUWhCLGdCQUFpQixhQUE3RDtBQUNBLE1BQUlpQixzQkFBc0IsR0FBRyxJQUFJWiwrQkFBSixDQUEyQjtBQUN0REMsSUFBQUEsSUFBSSxFQUFFVSwwQkFEZ0Q7QUFFdERULElBQUFBLFdBQVcsRUFBRyxPQUFNUywwQkFBMkIsNkVBQTRFaEIsZ0JBQWlCLFNBRnRGO0FBR3REaEMsSUFBQUEsTUFBTSxFQUFFLE1BQ05ZLGlCQUFpQixDQUFDNEIsTUFBbEIsQ0FDRSxDQUFDeEMsTUFBRCxFQUFTaUIsS0FBVCxLQUFtQjtBQUNqQixZQUFNdkIsSUFBSSxHQUFHLDRDQUNYRSxVQUFVLENBQUNJLE1BQVgsQ0FBa0JpQixLQUFsQixFQUF5QnZCLElBRGQsRUFFWEUsVUFBVSxDQUFDSSxNQUFYLENBQWtCaUIsS0FBbEIsRUFBeUJ3QixXQUZkLEVBR1hWLGtCQUFrQixDQUFDVyxlQUhSLENBQWI7O0FBS0EsVUFBSWhELElBQUosRUFBVTtBQUNSLGlDQUNLTSxNQURMO0FBRUUsV0FBQ2lCLEtBQUQsR0FBUztBQUNQc0IsWUFBQUEsV0FBVyxFQUFHLHNCQUFxQnRCLEtBQU0sR0FEbEM7QUFFUHZCLFlBQUFBO0FBRk87QUFGWDtBQU9ELE9BUkQsTUFRTztBQUNMLGVBQU9NLE1BQVA7QUFDRDtBQUNGLEtBbEJILEVBbUJFO0FBQ0U2QyxNQUFBQSxHQUFHLEVBQUU7QUFBRW5ELFFBQUFBLElBQUksRUFBRXdCLG1CQUFtQixDQUFDNEI7QUFBNUI7QUFEUCxLQW5CRjtBQUpvRCxHQUEzQixDQUE3QjtBQTRCQUcsRUFBQUEsc0JBQXNCLEdBQUdsQixrQkFBa0IsQ0FBQ2dCLGNBQW5CLENBQ3ZCRSxzQkFEdUIsQ0FBekI7QUFJQSxRQUFNQywyQkFBMkIsR0FBSSxHQUFFbEIsZ0JBQWlCLGNBQXhEO0FBQ0EsTUFBSW1CLHVCQUF1QixHQUFHLElBQUlkLCtCQUFKLENBQTJCO0FBQ3ZEQyxJQUFBQSxJQUFJLEVBQUVZLDJCQURpRDtBQUV2RFgsSUFBQUEsV0FBVyxFQUFHLGtEQUFpRFAsZ0JBQWlCLFNBRnpCO0FBR3ZEaEMsSUFBQUEsTUFBTSxFQUFFLE1BQU07QUFDWixZQUFNQSxNQUFNLEdBQUc7QUFDYm9ELFFBQUFBLElBQUksRUFBRTtBQUNKYixVQUFBQSxXQUFXLEVBQUcsZ0NBQStCUCxnQkFBaUIseURBRDFEO0FBRUp0QyxVQUFBQSxJQUFJLEVBQUUyRDtBQUZGO0FBRE8sT0FBZjs7QUFNQSxVQUFJcEIsZUFBSixFQUFxQjtBQUNuQmpDLFFBQUFBLE1BQU0sQ0FBQyxlQUFELENBQU4sR0FBMEI7QUFDeEJ1QyxVQUFBQSxXQUFXLEVBQUcsa0NBQWlDUCxnQkFBaUIsU0FEeEM7QUFFeEJ0QyxVQUFBQSxJQUFJLEVBQUUwQztBQUZrQixTQUExQjtBQUlEOztBQUNELGFBQU9wQyxNQUFQO0FBQ0Q7QUFqQnNELEdBQTNCLENBQTlCO0FBbUJBbUQsRUFBQUEsdUJBQXVCLEdBQ3JCcEIsa0JBQWtCLENBQUNnQixjQUFuQixDQUFrQ0ksdUJBQWxDLEtBQ0FqQyxtQkFBbUIsQ0FBQ29DLE1BRnRCO0FBSUEsUUFBTUMsNEJBQTRCLEdBQUksR0FBRXZCLGdCQUFpQixlQUF6RDtBQUNBLE1BQUl3Qix3QkFBd0IsR0FBRyxJQUFJbkIsK0JBQUosQ0FBMkI7QUFDeERDLElBQUFBLElBQUksRUFBRWlCLDRCQURrRDtBQUV4RGhCLElBQUFBLFdBQVcsRUFBRyxxREFBb0RQLGdCQUFpQiwrQkFGM0I7QUFHeERoQyxJQUFBQSxNQUFNLEVBQUUsTUFBTTtBQUNaLFlBQU1BLE1BQU0sR0FBRztBQUNieUQsUUFBQUEsR0FBRyxFQUFFO0FBQ0hsQixVQUFBQSxXQUFXLEVBQUcsaUNBQWdDUCxnQkFBaUIsNEVBRDVEO0FBRUh0QyxVQUFBQSxJQUFJLEVBQUUsSUFBSWdFLG9CQUFKLENBQWdCeEMsbUJBQW1CLENBQUN5QyxTQUFwQztBQUZILFNBRFE7QUFLYkMsUUFBQUEsTUFBTSxFQUFFO0FBQ05yQixVQUFBQSxXQUFXLEVBQUcsb0NBQW1DUCxnQkFBaUIsOEVBRDVEO0FBRU50QyxVQUFBQSxJQUFJLEVBQUUsSUFBSWdFLG9CQUFKLENBQWdCeEMsbUJBQW1CLENBQUN5QyxTQUFwQztBQUZBO0FBTEssT0FBZjs7QUFVQSxVQUFJMUIsZUFBSixFQUFxQjtBQUNuQmpDLFFBQUFBLE1BQU0sQ0FBQyxjQUFELENBQU4sR0FBeUI7QUFDdkJ1QyxVQUFBQSxXQUFXLEVBQUcsaUNBQWdDUCxnQkFBaUIsMkJBRHhDO0FBRXZCdEMsVUFBQUEsSUFBSSxFQUFFLElBQUlnRSxvQkFBSixDQUFnQixJQUFJZCx1QkFBSixDQUFtQlIsc0JBQW5CLENBQWhCO0FBRmlCLFNBQXpCO0FBSUQ7O0FBQ0QsYUFBT3BDLE1BQVA7QUFDRDtBQXJCdUQsR0FBM0IsQ0FBL0I7QUF1QkF3RCxFQUFBQSx3QkFBd0IsR0FDdEJ6QixrQkFBa0IsQ0FBQ2dCLGNBQW5CLENBQWtDUyx3QkFBbEMsS0FDQXRDLG1CQUFtQixDQUFDb0MsTUFGdEI7QUFJQSxRQUFNTywrQkFBK0IsR0FBSSxHQUFFN0IsZ0JBQWlCLFlBQTVEO0FBQ0EsTUFBSThCLDJCQUEyQixHQUFHLElBQUl6QiwrQkFBSixDQUEyQjtBQUMzREMsSUFBQUEsSUFBSSxFQUFFdUIsK0JBRHFEO0FBRTNEdEIsSUFBQUEsV0FBVyxFQUFHLE9BQU1zQiwrQkFBZ0MsdUVBQXNFN0IsZ0JBQWlCLFNBRmhGO0FBRzNEaEMsSUFBQUEsTUFBTSxFQUFFLHdCQUNIYSxxQkFBcUIsQ0FBQzJCLE1BQXRCLENBQTZCLENBQUN4QyxNQUFELEVBQVNpQixLQUFULEtBQW1CO0FBQ2pELFVBQUksQ0FBQyxJQUFELEVBQU8sS0FBUCxFQUFjLEtBQWQsRUFBcUJHLFFBQXJCLENBQThCSCxLQUE5QixDQUFKLEVBQTBDO0FBQ3hDYyxRQUFBQSxrQkFBa0IsQ0FBQ2dDLEdBQW5CLENBQXVCQyxJQUF2QixDQUNHLFNBQVEvQyxLQUFNLDBDQUF5QzRDLCtCQUFnQyw0Q0FEMUY7QUFHQSxlQUFPN0QsTUFBUDtBQUNEOztBQUNELFlBQU1pRSxVQUFVLEdBQUdoRCxLQUFLLEtBQUssSUFBVixHQUFpQixVQUFqQixHQUE4QkEsS0FBakQ7QUFDQSxZQUFNdkIsSUFBSSxHQUFHLHNEQUNYRSxVQUFVLENBQUNJLE1BQVgsQ0FBa0JpRSxVQUFsQixFQUE4QnZFLElBRG5CLEVBRVhFLFVBQVUsQ0FBQ0ksTUFBWCxDQUFrQmlFLFVBQWxCLEVBQThCeEIsV0FGbkIsRUFHWFYsa0JBQWtCLENBQUNXLGVBSFIsRUFJWHpCLEtBSlcsQ0FBYjs7QUFNQSxVQUFJdkIsSUFBSixFQUFVO0FBQ1IsaUNBQ0tNLE1BREw7QUFFRSxXQUFDaUIsS0FBRCxHQUFTO0FBQ1BzQixZQUFBQSxXQUFXLEVBQUcsc0JBQXFCdEIsS0FBTSxHQURsQztBQUVQdkIsWUFBQUE7QUFGTztBQUZYO0FBT0QsT0FSRCxNQVFPO0FBQ0wsZUFBT00sTUFBUDtBQUNEO0FBQ0YsS0F6QkUsRUF5QkEsRUF6QkEsQ0FERztBQTJCTmtFLE1BQUFBLEVBQUUsRUFBRTtBQUNGM0IsUUFBQUEsV0FBVyxFQUFFLGtEQURYO0FBRUY3QyxRQUFBQSxJQUFJLEVBQUUsSUFBSWdFLG9CQUFKLENBQWdCLElBQUlkLHVCQUFKLENBQW1Ca0IsMkJBQW5CLENBQWhCO0FBRkosT0EzQkU7QUErQk5LLE1BQUFBLEdBQUcsRUFBRTtBQUNINUIsUUFBQUEsV0FBVyxFQUFFLG1EQURWO0FBRUg3QyxRQUFBQSxJQUFJLEVBQUUsSUFBSWdFLG9CQUFKLENBQWdCLElBQUlkLHVCQUFKLENBQW1Ca0IsMkJBQW5CLENBQWhCO0FBRkgsT0EvQkM7QUFtQ05NLE1BQUFBLEdBQUcsRUFBRTtBQUNIN0IsUUFBQUEsV0FBVyxFQUFFLG1EQURWO0FBRUg3QyxRQUFBQSxJQUFJLEVBQUUsSUFBSWdFLG9CQUFKLENBQWdCLElBQUlkLHVCQUFKLENBQW1Ca0IsMkJBQW5CLENBQWhCO0FBRkg7QUFuQ0M7QUFIbUQsR0FBM0IsQ0FBbEM7QUE0Q0FBLEVBQUFBLDJCQUEyQixHQUN6Qi9CLGtCQUFrQixDQUFDZ0IsY0FBbkIsQ0FBa0NlLDJCQUFsQyxLQUNBNUMsbUJBQW1CLENBQUNvQyxNQUZ0QjtBQUlBLFFBQU1lLHVDQUF1QyxHQUFJLEdBQUVyQyxnQkFBaUIsb0JBQXBFO0FBQ0EsTUFBSXNDLG1DQUFtQyxHQUFHLElBQUlqQywrQkFBSixDQUEyQjtBQUNuRUMsSUFBQUEsSUFBSSxFQUFFK0IsdUNBRDZEO0FBRW5FOUIsSUFBQUEsV0FBVyxFQUFHLE9BQU04Qix1Q0FBd0MsdUVBQXNFckMsZ0JBQWlCLFNBRmhGO0FBR25FaEMsSUFBQUEsTUFBTSxFQUFFLE9BQU87QUFDYnVFLE1BQUFBLElBQUksRUFBRTtBQUNKaEMsUUFBQUEsV0FBVyxFQUNULDJFQUZFO0FBR0o3QyxRQUFBQSxJQUFJLEVBQUVvRTtBQUhGLE9BRE87QUFNYlUsTUFBQUEsT0FBTyxFQUFFO0FBQ1BqQyxRQUFBQSxXQUFXLEVBQ1QscUZBRks7QUFHUDdDLFFBQUFBLElBQUksRUFBRW9FO0FBSEMsT0FOSTtBQVdiVyxNQUFBQSxNQUFNLEVBQUU7QUFDTmxDLFFBQUFBLFdBQVcsRUFBRSxpREFEUDtBQUVON0MsUUFBQUEsSUFBSSxFQUFFZ0Y7QUFGQTtBQVhLLEtBQVA7QUFIMkQsR0FBM0IsQ0FBMUM7QUFvQkFKLEVBQUFBLG1DQUFtQyxHQUNqQ3ZDLGtCQUFrQixDQUFDZ0IsY0FBbkIsQ0FBa0N1QixtQ0FBbEMsS0FDQXBELG1CQUFtQixDQUFDb0MsTUFGdEI7QUFJQSxRQUFNcUIseUJBQXlCLEdBQUksR0FBRTNDLGdCQUFpQixPQUF0RDtBQUNBLE1BQUk0QyxxQkFBcUIsR0FBRyxJQUFJQyx3QkFBSixDQUFvQjtBQUM5Q3ZDLElBQUFBLElBQUksRUFBRXFDLHlCQUR3QztBQUU5Q3BDLElBQUFBLFdBQVcsRUFBRyxPQUFNb0MseUJBQTBCLG1EQUFrRDNDLGdCQUFpQixTQUZuRTtBQUc5QzhDLElBQUFBLE1BQU0sRUFBRWhFLGVBQWUsQ0FBQzBCLE1BQWhCLENBQXVCLENBQUNoQyxVQUFELEVBQWF1RSxXQUFiLEtBQTZCO0FBQzFELFlBQU07QUFBRTlELFFBQUFBLEtBQUY7QUFBU1UsUUFBQUEsR0FBVDtBQUFjQyxRQUFBQTtBQUFkLFVBQXVCbUQsV0FBN0I7O0FBQ0EsWUFBTUMsaUJBQWlCLHFCQUNsQnhFLFVBRGtCLENBQXZCOztBQUdBLFlBQU15RSxLQUFLLEdBQUdoRSxLQUFLLEtBQUssSUFBVixHQUFpQixVQUFqQixHQUE4QkEsS0FBNUM7O0FBQ0EsVUFBSVUsR0FBSixFQUFTO0FBQ1BxRCxRQUFBQSxpQkFBaUIsQ0FBRSxHQUFFL0QsS0FBTSxNQUFWLENBQWpCLEdBQW9DO0FBQUVnRSxVQUFBQTtBQUFGLFNBQXBDO0FBQ0Q7O0FBQ0QsVUFBSXJELElBQUosRUFBVTtBQUNSb0QsUUFBQUEsaUJBQWlCLENBQUUsR0FBRS9ELEtBQU0sT0FBVixDQUFqQixHQUFxQztBQUFFZ0UsVUFBQUEsS0FBSyxFQUFHLElBQUdBLEtBQU07QUFBbkIsU0FBckM7QUFDRDs7QUFDRCxhQUFPRCxpQkFBUDtBQUNELEtBYk8sRUFhTCxFQWJLO0FBSHNDLEdBQXBCLENBQTVCO0FBa0JBSixFQUFBQSxxQkFBcUIsR0FBRzdDLGtCQUFrQixDQUFDZ0IsY0FBbkIsQ0FDdEI2QixxQkFEc0IsQ0FBeEI7O0FBSUEsUUFBTU0sb0JBQW9CO0FBQ3hCQyxJQUFBQSxLQUFLLEVBQUU7QUFDTDVDLE1BQUFBLFdBQVcsRUFDVCwrRUFGRztBQUdMN0MsTUFBQUEsSUFBSSxFQUFFb0U7QUFIRCxLQURpQjtBQU14QnNCLElBQUFBLEtBQUssRUFBRTtBQUNMN0MsTUFBQUEsV0FBVyxFQUFFLHNEQURSO0FBRUw3QyxNQUFBQSxJQUFJLEVBQUVrRixxQkFBcUIsR0FDdkIsSUFBSWxCLG9CQUFKLENBQWdCLElBQUlkLHVCQUFKLENBQW1CZ0MscUJBQW5CLENBQWhCLENBRHVCLEdBRXZCUztBQUpDLEtBTmlCO0FBWXhCQyxJQUFBQSxJQUFJLEVBQUVwRSxtQkFBbUIsQ0FBQ3FFO0FBWkYsS0FhckJDLDRCQWJxQjtBQWN4QkMsSUFBQUEsT0FBTyxFQUFFdkUsbUJBQW1CLENBQUN3RTtBQWRMLElBQTFCOztBQWdCQSxRQUFNQywwQkFBMEIsR0FBSSxHQUFFM0QsZ0JBQWlCLEVBQXZEO0FBQ0EsUUFBTTRELFVBQVUsR0FBRyxDQUNqQjFFLG1CQUFtQixDQUFDMkUsWUFESCxFQUVqQjlELGtCQUFrQixDQUFDK0Qsa0JBRkYsQ0FBbkI7O0FBSUEsUUFBTUMsaUJBQWlCO0FBQ3JCQyxJQUFBQSxFQUFFLEVBQUUsaUNBQWN6RSxTQUFkLEVBQXlCMEUsR0FBRyxJQUFJQSxHQUFHLENBQUNDLFFBQXBDO0FBRGlCLEtBRWxCaEYsbUJBQW1CLENBQUNDLG1CQUZGLENBQXZCOztBQUlBLFFBQU1mLFlBQVksR0FBRyxNQUFNO0FBQ3pCLFdBQU9NLGlCQUFpQixDQUFDOEIsTUFBbEIsQ0FBeUIsQ0FBQ3hDLE1BQUQsRUFBU2lCLEtBQVQsS0FBbUI7QUFDakQsWUFBTXZCLElBQUksR0FBRyw4Q0FDWEUsVUFBVSxDQUFDSSxNQUFYLENBQWtCaUIsS0FBbEIsRUFBeUJ2QixJQURkLEVBRVhFLFVBQVUsQ0FBQ0ksTUFBWCxDQUFrQmlCLEtBQWxCLEVBQXlCd0IsV0FGZCxFQUdYVixrQkFBa0IsQ0FBQ1csZUFIUixDQUFiOztBQUtBLFVBQUk5QyxVQUFVLENBQUNJLE1BQVgsQ0FBa0JpQixLQUFsQixFQUF5QnZCLElBQXpCLEtBQWtDLFVBQXRDLEVBQWtEO0FBQ2hELGNBQU15RyxxQkFBcUIsR0FDekJwRSxrQkFBa0IsQ0FBQ1csZUFBbkIsQ0FDRTlDLFVBQVUsQ0FBQ0ksTUFBWCxDQUFrQmlCLEtBQWxCLEVBQXlCd0IsV0FEM0IsQ0FERjtBQUlBLGNBQU0yRCxJQUFJLEdBQUdELHFCQUFxQixHQUM5QkEscUJBQXFCLENBQUNqQixvQkFEUSxHQUU5Qm1CLFNBRko7QUFHQSxpQ0FDS3JHLE1BREw7QUFFRSxXQUFDaUIsS0FBRCxHQUFTO0FBQ1BzQixZQUFBQSxXQUFXLEVBQUcsc0JBQXFCdEIsS0FBTSxHQURsQztBQUVQbUYsWUFBQUEsSUFGTztBQUdQMUcsWUFBQUEsSUFBSSxFQUFFRSxVQUFVLENBQUNJLE1BQVgsQ0FBa0JpQixLQUFsQixFQUF5QjBCLFFBQXpCLEdBQ0YsSUFBSUMsdUJBQUosQ0FBbUJsRCxJQUFuQixDQURFLEdBRUZBLElBTEc7O0FBTVAsa0JBQU00RyxPQUFOLENBQWNDLE1BQWQsRUFBc0JILElBQXRCLEVBQTRCSSxPQUE1QixFQUFxQ0MsU0FBckMsRUFBZ0Q7QUFDOUMsa0JBQUk7QUFDRixzQkFBTTtBQUNKdEIsa0JBQUFBLEtBREk7QUFFSkMsa0JBQUFBLEtBRkk7QUFHSkUsa0JBQUFBLElBSEk7QUFJSm9CLGtCQUFBQSxLQUpJO0FBS0pDLGtCQUFBQSxLQUxJO0FBTUpDLGtCQUFBQSxJQU5JO0FBT0pDLGtCQUFBQSxNQVBJO0FBUUpwQixrQkFBQUE7QUFSSSxvQkFTRlcsSUFUSjtBQVVBLHNCQUFNO0FBQ0pVLGtCQUFBQSxjQURJO0FBRUpDLGtCQUFBQSxxQkFGSTtBQUdKQyxrQkFBQUE7QUFISSxvQkFJRnZCLE9BQU8sSUFBSSxFQUpmO0FBS0Esc0JBQU07QUFBRXdCLGtCQUFBQSxNQUFGO0FBQVVDLGtCQUFBQSxJQUFWO0FBQWdCQyxrQkFBQUE7QUFBaEIsb0JBQXlCWCxPQUEvQjtBQUNBLHNCQUFNWSxjQUFjLEdBQUcsZ0NBQWNYLFNBQWQsQ0FBdkI7QUFFQSxzQkFBTTtBQUFFMUcsa0JBQUFBLElBQUY7QUFBUXNILGtCQUFBQTtBQUFSLG9CQUFvQiw4Q0FDeEJELGNBQWMsQ0FDWHBHLE1BREgsQ0FDVUMsS0FBSyxJQUFJQSxLQUFLLENBQUNxRyxVQUFOLENBQWlCLGFBQWpCLENBRG5CLEVBRUd6RixHQUZILENBRU9aLEtBQUssSUFBSUEsS0FBSyxDQUFDc0csT0FBTixDQUFjLGFBQWQsRUFBNkIsRUFBN0IsQ0FGaEIsQ0FEd0IsQ0FBMUI7QUFLQSxzQkFBTUMsVUFBVSxHQUFHcEMsS0FBSyxJQUFJQSxLQUFLLENBQUNxQyxJQUFOLENBQVcsR0FBWCxDQUE1QjtBQUVBLHVCQUFPLE1BQU1DLGNBQWMsQ0FBQ0MsV0FBZixDQUNYcEIsTUFBTSxDQUFDdEYsS0FBRCxDQUFOLENBQWNNLFNBREg7QUFHVHFHLGtCQUFBQSxVQUFVLEVBQUU7QUFDVkMsb0JBQUFBLE1BQU0sRUFBRTtBQUNOQyxzQkFBQUEsTUFBTSxFQUFFLFNBREY7QUFFTnZHLHNCQUFBQSxTQUFTLEVBQUVBLFNBRkw7QUFHTjJFLHNCQUFBQSxRQUFRLEVBQUVLLE1BQU0sQ0FBQ0w7QUFIWCxxQkFERTtBQU1WNkIsb0JBQUFBLEdBQUcsRUFBRTlHO0FBTks7QUFISCxtQkFXTGtFLEtBQUssSUFBSSxFQVhKLEdBYVhxQyxVQWJXLEVBY1hsQyxJQWRXLEVBZVhvQixLQWZXLEVBZ0JYQyxLQWhCVyxFQWlCWEMsSUFqQlcsRUFrQlhDLE1BbEJXLEVBbUJYOUcsSUFuQlcsRUFvQlhzSCxPQXBCVyxFQXFCWCxLQXJCVyxFQXNCWFAsY0F0QlcsRUF1QlhDLHFCQXZCVyxFQXdCWEMsc0JBeEJXLEVBeUJYQyxNQXpCVyxFQTBCWEMsSUExQlcsRUEyQlhDLElBM0JXLEVBNEJYQyxjQTVCVyxFQTZCWHJGLGtCQUFrQixDQUFDaUcsWUE3QlIsQ0FBYjtBQStCRCxlQXpERCxDQXlERSxPQUFPQyxDQUFQLEVBQVU7QUFDVmxHLGdCQUFBQSxrQkFBa0IsQ0FBQ21HLFdBQW5CLENBQStCRCxDQUEvQjtBQUNEO0FBQ0Y7O0FBbkVNO0FBRlg7QUF3RUQsT0FoRkQsTUFnRk8sSUFBSXJJLFVBQVUsQ0FBQ0ksTUFBWCxDQUFrQmlCLEtBQWxCLEVBQXlCdkIsSUFBekIsS0FBa0MsU0FBdEMsRUFBaUQ7QUFDdEQsaUNBQ0tNLE1BREw7QUFFRSxXQUFDaUIsS0FBRCxHQUFTO0FBQ1BzQixZQUFBQSxXQUFXLEVBQUcsc0JBQXFCdEIsS0FBTSxHQURsQztBQUVQdkIsWUFBQUEsSUFBSSxFQUFFRSxVQUFVLENBQUNJLE1BQVgsQ0FBa0JpQixLQUFsQixFQUF5QjBCLFFBQXpCLEdBQ0YsSUFBSUMsdUJBQUosQ0FBbUJsRCxJQUFuQixDQURFLEdBRUZBLElBSkc7O0FBS1Asa0JBQU00RyxPQUFOLENBQWNDLE1BQWQsRUFBc0I7QUFDcEIsa0JBQUlBLE1BQU0sQ0FBQ3RGLEtBQUQsQ0FBTixJQUFpQnNGLE1BQU0sQ0FBQ3RGLEtBQUQsQ0FBTixDQUFja0gsV0FBbkMsRUFBZ0Q7QUFDOUMsdUJBQU81QixNQUFNLENBQUN0RixLQUFELENBQU4sQ0FBY2tILFdBQWQsQ0FBMEJ0RyxHQUExQixDQUE4QnVHLFVBQVUsS0FBSztBQUNsREMsa0JBQUFBLFFBQVEsRUFBRUQsVUFBVSxDQUFDLENBQUQsQ0FEOEI7QUFFbERFLGtCQUFBQSxTQUFTLEVBQUVGLFVBQVUsQ0FBQyxDQUFEO0FBRjZCLGlCQUFMLENBQXhDLENBQVA7QUFJRCxlQUxELE1BS087QUFDTCx1QkFBTyxJQUFQO0FBQ0Q7QUFDRjs7QUFkTTtBQUZYO0FBbUJELE9BcEJNLE1Bb0JBLElBQUl4SSxVQUFVLENBQUNJLE1BQVgsQ0FBa0JpQixLQUFsQixFQUF5QnZCLElBQXpCLEtBQWtDLE9BQXRDLEVBQStDO0FBQ3BELGlDQUNLTSxNQURMO0FBRUUsV0FBQ2lCLEtBQUQsR0FBUztBQUNQc0IsWUFBQUEsV0FBVyxFQUFHLGtHQURQO0FBRVA3QyxZQUFBQSxJQUFJLEVBQUVFLFVBQVUsQ0FBQ0ksTUFBWCxDQUFrQmlCLEtBQWxCLEVBQXlCMEIsUUFBekIsR0FDRixJQUFJQyx1QkFBSixDQUFtQmxELElBQW5CLENBREUsR0FFRkEsSUFKRzs7QUFLUCxrQkFBTTRHLE9BQU4sQ0FBY0MsTUFBZCxFQUFzQjtBQUNwQixrQkFBSSxDQUFDQSxNQUFNLENBQUN0RixLQUFELENBQVgsRUFBb0IsT0FBTyxJQUFQO0FBQ3BCLHFCQUFPc0YsTUFBTSxDQUFDdEYsS0FBRCxDQUFOLENBQWNZLEdBQWQsQ0FBa0IsTUFBTTBHLElBQU4sSUFBYztBQUNyQyxvQkFDRUEsSUFBSSxDQUFDaEgsU0FBTCxJQUNBZ0gsSUFBSSxDQUFDckMsUUFETCxJQUVBcUMsSUFBSSxDQUFDVCxNQUFMLEtBQWdCLFFBSGxCLEVBSUU7QUFDQSx5QkFBT1MsSUFBUDtBQUNELGlCQU5ELE1BTU87QUFDTCx5QkFBTztBQUFFdEQsb0JBQUFBLEtBQUssRUFBRXNEO0FBQVQsbUJBQVA7QUFDRDtBQUNGLGVBVk0sQ0FBUDtBQVdEOztBQWxCTTtBQUZYO0FBdUJELE9BeEJNLE1Bd0JBLElBQUk3SSxJQUFKLEVBQVU7QUFDZixpQ0FDS00sTUFETDtBQUVFLFdBQUNpQixLQUFELEdBQVM7QUFDUHNCLFlBQUFBLFdBQVcsRUFBRyxzQkFBcUJ0QixLQUFNLEdBRGxDO0FBRVB2QixZQUFBQSxJQUFJLEVBQUVFLFVBQVUsQ0FBQ0ksTUFBWCxDQUFrQmlCLEtBQWxCLEVBQXlCMEIsUUFBekIsR0FDRixJQUFJQyx1QkFBSixDQUFtQmxELElBQW5CLENBREUsR0FFRkE7QUFKRztBQUZYO0FBU0QsT0FWTSxNQVVBO0FBQ0wsZUFBT00sTUFBUDtBQUNEO0FBQ0YsS0EvSU0sRUErSUorRixpQkEvSUksQ0FBUDtBQWdKRCxHQWpKRDs7QUFrSkEsTUFBSXlDLHNCQUFzQixHQUFHLElBQUlDLDBCQUFKLENBQXNCO0FBQ2pEbkcsSUFBQUEsSUFBSSxFQUFFcUQsMEJBRDJDO0FBRWpEcEQsSUFBQUEsV0FBVyxFQUFHLE9BQU1vRCwwQkFBMkIseUVBQXdFM0QsZ0JBQWlCLFNBRnZGO0FBR2pENEQsSUFBQUEsVUFIaUQ7QUFJakQ1RixJQUFBQSxNQUFNLEVBQUVJO0FBSnlDLEdBQXRCLENBQTdCO0FBTUFvSSxFQUFBQSxzQkFBc0IsR0FBR3pHLGtCQUFrQixDQUFDZ0IsY0FBbkIsQ0FDdkJ5RixzQkFEdUIsQ0FBekI7QUFJQSxRQUFNO0FBQUVFLElBQUFBLGNBQUY7QUFBa0JDLElBQUFBO0FBQWxCLE1BQStCLHlDQUFzQjtBQUN6RHJHLElBQUFBLElBQUksRUFBRU4sZ0JBRG1EO0FBRXpENEcsSUFBQUEsZ0JBQWdCLEVBQUU7QUFDaEJDLE1BQUFBLEtBQUssRUFBRTNILG1CQUFtQixDQUFDNEg7QUFEWCxLQUZ1QztBQUt6REMsSUFBQUEsUUFBUSxFQUFFUCxzQkFBc0IsSUFBSXRILG1CQUFtQixDQUFDb0M7QUFMQyxHQUF0QixDQUFyQztBQU9BLE1BQUkwRiwwQkFBMEIsR0FBRzNDLFNBQWpDOztBQUNBLE1BQ0V0RSxrQkFBa0IsQ0FBQ2dCLGNBQW5CLENBQWtDNEYsUUFBbEMsS0FDQTVHLGtCQUFrQixDQUFDZ0IsY0FBbkIsQ0FBa0MyRixjQUFsQyxFQUFrRCxLQUFsRCxFQUF5RCxLQUF6RCxFQUFnRSxJQUFoRSxDQUZGLEVBR0U7QUFDQU0sSUFBQUEsMEJBQTBCLEdBQUdOLGNBQTdCO0FBQ0Q7O0FBRUQzRyxFQUFBQSxrQkFBa0IsQ0FBQ1csZUFBbkIsQ0FBbUNuQixTQUFuQyxJQUFnRDtBQUM5QzRCLElBQUFBLHVCQUQ4QztBQUU5Q0ssSUFBQUEsd0JBRjhDO0FBRzlDcEIsSUFBQUEsc0JBSDhDO0FBSTlDYSxJQUFBQSxzQkFKOEM7QUFLOUNhLElBQUFBLDJCQUw4QztBQU05Q1EsSUFBQUEsbUNBTjhDO0FBTzlDWSxJQUFBQSxvQkFQOEM7QUFROUNzRCxJQUFBQSxzQkFSOEM7QUFTOUNRLElBQUFBLDBCQVQ4QztBQVU5Qy9CLElBQUFBLE1BQU0sRUFBRTtBQUNOeEgsTUFBQUEsZ0JBRE07QUFFTndDLE1BQUFBLGVBRk07QUFHTkMsTUFBQUE7QUFITTtBQVZzQyxHQUFoRDs7QUFpQkEsTUFBSVgsU0FBUyxLQUFLLE9BQWxCLEVBQTJCO0FBQ3pCLFVBQU0wSCxVQUFVLEdBQUcsSUFBSVIsMEJBQUosQ0FBc0I7QUFDdkNuRyxNQUFBQSxJQUFJLEVBQUUsUUFEaUM7QUFFdkNDLE1BQUFBLFdBQVcsRUFBRyw2RkFGeUI7QUFHdkN2QyxNQUFBQSxNQUFNLEVBQUUsT0FBTztBQUNia0osUUFBQUEsWUFBWSxFQUFFaEksbUJBQW1CLENBQUNpSSxpQkFEckI7QUFFYkMsUUFBQUEsSUFBSSxFQUFFO0FBQ0o3RyxVQUFBQSxXQUFXLEVBQUUsMkJBRFQ7QUFFSjdDLFVBQUFBLElBQUksRUFBRSxJQUFJa0QsdUJBQUosQ0FBbUI0RixzQkFBbkI7QUFGRjtBQUZPLE9BQVA7QUFIK0IsS0FBdEIsQ0FBbkI7QUFXQXpHLElBQUFBLGtCQUFrQixDQUFDZ0IsY0FBbkIsQ0FBa0NrRyxVQUFsQyxFQUE4QyxJQUE5QyxFQUFvRCxJQUFwRDtBQUNBbEgsSUFBQUEsa0JBQWtCLENBQUNrSCxVQUFuQixHQUFnQ0EsVUFBaEM7QUFDRDtBQUNGLENBcGREIiwic291cmNlc0NvbnRlbnQiOlsiaW1wb3J0IHtcbiAgR3JhcGhRTElELFxuICBHcmFwaFFMT2JqZWN0VHlwZSxcbiAgR3JhcGhRTFN0cmluZyxcbiAgR3JhcGhRTExpc3QsXG4gIEdyYXBoUUxJbnB1dE9iamVjdFR5cGUsXG4gIEdyYXBoUUxOb25OdWxsLFxuICBHcmFwaFFMQm9vbGVhbixcbiAgR3JhcGhRTEVudW1UeXBlLFxufSBmcm9tICdncmFwaHFsJztcbmltcG9ydCB7XG4gIGdsb2JhbElkRmllbGQsXG4gIGNvbm5lY3Rpb25BcmdzLFxuICBjb25uZWN0aW9uRGVmaW5pdGlvbnMsXG59IGZyb20gJ2dyYXBocWwtcmVsYXknO1xuaW1wb3J0IGdldEZpZWxkTmFtZXMgZnJvbSAnZ3JhcGhxbC1saXN0LWZpZWxkcyc7XG5pbXBvcnQgKiBhcyBkZWZhdWx0R3JhcGhRTFR5cGVzIGZyb20gJy4vZGVmYXVsdEdyYXBoUUxUeXBlcyc7XG5pbXBvcnQgKiBhcyBvYmplY3RzUXVlcmllcyBmcm9tICcuLi9oZWxwZXJzL29iamVjdHNRdWVyaWVzJztcbmltcG9ydCB7IFBhcnNlR3JhcGhRTENsYXNzQ29uZmlnIH0gZnJvbSAnLi4vLi4vQ29udHJvbGxlcnMvUGFyc2VHcmFwaFFMQ29udHJvbGxlcic7XG5pbXBvcnQgeyB0cmFuc2Zvcm1DbGFzc05hbWVUb0dyYXBoUUwgfSBmcm9tICcuLi90cmFuc2Zvcm1lcnMvY2xhc3NOYW1lJztcbmltcG9ydCB7IHRyYW5zZm9ybUlucHV0VHlwZVRvR3JhcGhRTCB9IGZyb20gJy4uL3RyYW5zZm9ybWVycy9pbnB1dFR5cGUnO1xuaW1wb3J0IHsgdHJhbnNmb3JtT3V0cHV0VHlwZVRvR3JhcGhRTCB9IGZyb20gJy4uL3RyYW5zZm9ybWVycy9vdXRwdXRUeXBlJztcbmltcG9ydCB7IHRyYW5zZm9ybUNvbnN0cmFpbnRUeXBlVG9HcmFwaFFMIH0gZnJvbSAnLi4vdHJhbnNmb3JtZXJzL2NvbnN0cmFpbnRUeXBlJztcbmltcG9ydCB7XG4gIGV4dHJhY3RLZXlzQW5kSW5jbHVkZSxcbiAgZ2V0UGFyc2VDbGFzc011dGF0aW9uQ29uZmlnLFxufSBmcm9tICcuLi9wYXJzZUdyYXBoUUxVdGlscyc7XG5cbmNvbnN0IGdldFBhcnNlQ2xhc3NUeXBlQ29uZmlnID0gZnVuY3Rpb24oXG4gIHBhcnNlQ2xhc3NDb25maWc6ID9QYXJzZUdyYXBoUUxDbGFzc0NvbmZpZ1xuKSB7XG4gIHJldHVybiAocGFyc2VDbGFzc0NvbmZpZyAmJiBwYXJzZUNsYXNzQ29uZmlnLnR5cGUpIHx8IHt9O1xufTtcblxuY29uc3QgZ2V0SW5wdXRGaWVsZHNBbmRDb25zdHJhaW50cyA9IGZ1bmN0aW9uKFxuICBwYXJzZUNsYXNzLFxuICBwYXJzZUNsYXNzQ29uZmlnOiA/UGFyc2VHcmFwaFFMQ2xhc3NDb25maWdcbikge1xuICBjb25zdCBjbGFzc0ZpZWxkcyA9IE9iamVjdC5rZXlzKHBhcnNlQ2xhc3MuZmllbGRzKS5jb25jYXQoJ2lkJyk7XG4gIGNvbnN0IHtcbiAgICBpbnB1dEZpZWxkczogYWxsb3dlZElucHV0RmllbGRzLFxuICAgIG91dHB1dEZpZWxkczogYWxsb3dlZE91dHB1dEZpZWxkcyxcbiAgICBjb25zdHJhaW50RmllbGRzOiBhbGxvd2VkQ29uc3RyYWludEZpZWxkcyxcbiAgICBzb3J0RmllbGRzOiBhbGxvd2VkU29ydEZpZWxkcyxcbiAgfSA9IGdldFBhcnNlQ2xhc3NUeXBlQ29uZmlnKHBhcnNlQ2xhc3NDb25maWcpO1xuXG4gIGxldCBjbGFzc091dHB1dEZpZWxkcztcbiAgbGV0IGNsYXNzQ3JlYXRlRmllbGRzO1xuICBsZXQgY2xhc3NVcGRhdGVGaWVsZHM7XG4gIGxldCBjbGFzc0NvbnN0cmFpbnRGaWVsZHM7XG4gIGxldCBjbGFzc1NvcnRGaWVsZHM7XG5cbiAgLy8gQWxsIGFsbG93ZWQgY3VzdG9tcyBmaWVsZHNcbiAgY29uc3QgY2xhc3NDdXN0b21GaWVsZHMgPSBjbGFzc0ZpZWxkcy5maWx0ZXIoZmllbGQgPT4ge1xuICAgIHJldHVybiAoXG4gICAgICAhT2JqZWN0LmtleXMoZGVmYXVsdEdyYXBoUUxUeXBlcy5QQVJTRV9PQkpFQ1RfRklFTERTKS5pbmNsdWRlcyhmaWVsZCkgJiZcbiAgICAgIGZpZWxkICE9PSAnaWQnXG4gICAgKTtcbiAgfSk7XG5cbiAgaWYgKGFsbG93ZWRJbnB1dEZpZWxkcyAmJiBhbGxvd2VkSW5wdXRGaWVsZHMuY3JlYXRlKSB7XG4gICAgY2xhc3NDcmVhdGVGaWVsZHMgPSBjbGFzc0N1c3RvbUZpZWxkcy5maWx0ZXIoZmllbGQgPT4ge1xuICAgICAgcmV0dXJuIGFsbG93ZWRJbnB1dEZpZWxkcy5jcmVhdGUuaW5jbHVkZXMoZmllbGQpO1xuICAgIH0pO1xuICB9IGVsc2Uge1xuICAgIGNsYXNzQ3JlYXRlRmllbGRzID0gY2xhc3NDdXN0b21GaWVsZHM7XG4gIH1cbiAgaWYgKGFsbG93ZWRJbnB1dEZpZWxkcyAmJiBhbGxvd2VkSW5wdXRGaWVsZHMudXBkYXRlKSB7XG4gICAgY2xhc3NVcGRhdGVGaWVsZHMgPSBjbGFzc0N1c3RvbUZpZWxkcy5maWx0ZXIoZmllbGQgPT4ge1xuICAgICAgcmV0dXJuIGFsbG93ZWRJbnB1dEZpZWxkcy51cGRhdGUuaW5jbHVkZXMoZmllbGQpO1xuICAgIH0pO1xuICB9IGVsc2Uge1xuICAgIGNsYXNzVXBkYXRlRmllbGRzID0gY2xhc3NDdXN0b21GaWVsZHM7XG4gIH1cblxuICBpZiAoYWxsb3dlZE91dHB1dEZpZWxkcykge1xuICAgIGNsYXNzT3V0cHV0RmllbGRzID0gY2xhc3NDdXN0b21GaWVsZHMuZmlsdGVyKGZpZWxkID0+IHtcbiAgICAgIHJldHVybiBhbGxvd2VkT3V0cHV0RmllbGRzLmluY2x1ZGVzKGZpZWxkKTtcbiAgICB9KTtcbiAgfSBlbHNlIHtcbiAgICBjbGFzc091dHB1dEZpZWxkcyA9IGNsYXNzQ3VzdG9tRmllbGRzO1xuICB9XG4gIC8vIEZpbHRlcnMgdGhlIFwicGFzc3dvcmRcIiBmaWVsZCBmcm9tIGNsYXNzIF9Vc2VyXG4gIGlmIChwYXJzZUNsYXNzLmNsYXNzTmFtZSA9PT0gJ19Vc2VyJykge1xuICAgIGNsYXNzT3V0cHV0RmllbGRzID0gY2xhc3NPdXRwdXRGaWVsZHMuZmlsdGVyKFxuICAgICAgb3V0cHV0RmllbGQgPT4gb3V0cHV0RmllbGQgIT09ICdwYXNzd29yZCdcbiAgICApO1xuICB9XG5cbiAgaWYgKGFsbG93ZWRDb25zdHJhaW50RmllbGRzKSB7XG4gICAgY2xhc3NDb25zdHJhaW50RmllbGRzID0gY2xhc3NDdXN0b21GaWVsZHMuZmlsdGVyKGZpZWxkID0+IHtcbiAgICAgIHJldHVybiBhbGxvd2VkQ29uc3RyYWludEZpZWxkcy5pbmNsdWRlcyhmaWVsZCk7XG4gICAgfSk7XG4gIH0gZWxzZSB7XG4gICAgY2xhc3NDb25zdHJhaW50RmllbGRzID0gY2xhc3NGaWVsZHM7XG4gIH1cblxuICBpZiAoYWxsb3dlZFNvcnRGaWVsZHMpIHtcbiAgICBjbGFzc1NvcnRGaWVsZHMgPSBhbGxvd2VkU29ydEZpZWxkcztcbiAgICBpZiAoIWNsYXNzU29ydEZpZWxkcy5sZW5ndGgpIHtcbiAgICAgIC8vIG11c3QgaGF2ZSBhdCBsZWFzdCAxIG9yZGVyIGZpZWxkXG4gICAgICAvLyBvdGhlcndpc2UgdGhlIEZpbmRBcmdzIElucHV0IFR5cGUgd2lsbCB0aHJvdy5cbiAgICAgIGNsYXNzU29ydEZpZWxkcy5wdXNoKHtcbiAgICAgICAgZmllbGQ6ICdpZCcsXG4gICAgICAgIGFzYzogdHJ1ZSxcbiAgICAgICAgZGVzYzogdHJ1ZSxcbiAgICAgIH0pO1xuICAgIH1cbiAgfSBlbHNlIHtcbiAgICBjbGFzc1NvcnRGaWVsZHMgPSBjbGFzc0ZpZWxkcy5tYXAoZmllbGQgPT4ge1xuICAgICAgcmV0dXJuIHsgZmllbGQsIGFzYzogdHJ1ZSwgZGVzYzogdHJ1ZSB9O1xuICAgIH0pO1xuICB9XG5cbiAgcmV0dXJuIHtcbiAgICBjbGFzc0NyZWF0ZUZpZWxkcyxcbiAgICBjbGFzc1VwZGF0ZUZpZWxkcyxcbiAgICBjbGFzc0NvbnN0cmFpbnRGaWVsZHMsXG4gICAgY2xhc3NPdXRwdXRGaWVsZHMsXG4gICAgY2xhc3NTb3J0RmllbGRzLFxuICB9O1xufTtcblxuY29uc3QgbG9hZCA9IChcbiAgcGFyc2VHcmFwaFFMU2NoZW1hLFxuICBwYXJzZUNsYXNzLFxuICBwYXJzZUNsYXNzQ29uZmlnOiA/UGFyc2VHcmFwaFFMQ2xhc3NDb25maWdcbikgPT4ge1xuICBjb25zdCBjbGFzc05hbWUgPSBwYXJzZUNsYXNzLmNsYXNzTmFtZTtcbiAgY29uc3QgZ3JhcGhRTENsYXNzTmFtZSA9IHRyYW5zZm9ybUNsYXNzTmFtZVRvR3JhcGhRTChjbGFzc05hbWUpO1xuICBjb25zdCB7XG4gICAgY2xhc3NDcmVhdGVGaWVsZHMsXG4gICAgY2xhc3NVcGRhdGVGaWVsZHMsXG4gICAgY2xhc3NPdXRwdXRGaWVsZHMsXG4gICAgY2xhc3NDb25zdHJhaW50RmllbGRzLFxuICAgIGNsYXNzU29ydEZpZWxkcyxcbiAgfSA9IGdldElucHV0RmllbGRzQW5kQ29uc3RyYWludHMocGFyc2VDbGFzcywgcGFyc2VDbGFzc0NvbmZpZyk7XG5cbiAgY29uc3Qge1xuICAgIGNyZWF0ZTogaXNDcmVhdGVFbmFibGVkID0gdHJ1ZSxcbiAgICB1cGRhdGU6IGlzVXBkYXRlRW5hYmxlZCA9IHRydWUsXG4gIH0gPSBnZXRQYXJzZUNsYXNzTXV0YXRpb25Db25maWcocGFyc2VDbGFzc0NvbmZpZyk7XG5cbiAgY29uc3QgY2xhc3NHcmFwaFFMQ3JlYXRlVHlwZU5hbWUgPSBgQ3JlYXRlJHtncmFwaFFMQ2xhc3NOYW1lfUZpZWxkc0lucHV0YDtcbiAgbGV0IGNsYXNzR3JhcGhRTENyZWF0ZVR5cGUgPSBuZXcgR3JhcGhRTElucHV0T2JqZWN0VHlwZSh7XG4gICAgbmFtZTogY2xhc3NHcmFwaFFMQ3JlYXRlVHlwZU5hbWUsXG4gICAgZGVzY3JpcHRpb246IGBUaGUgJHtjbGFzc0dyYXBoUUxDcmVhdGVUeXBlTmFtZX0gaW5wdXQgdHlwZSBpcyB1c2VkIGluIG9wZXJhdGlvbnMgdGhhdCBpbnZvbHZlIGNyZWF0aW9uIG9mIG9iamVjdHMgaW4gdGhlICR7Z3JhcGhRTENsYXNzTmFtZX0gY2xhc3MuYCxcbiAgICBmaWVsZHM6ICgpID0+XG4gICAgICBjbGFzc0NyZWF0ZUZpZWxkcy5yZWR1Y2UoXG4gICAgICAgIChmaWVsZHMsIGZpZWxkKSA9PiB7XG4gICAgICAgICAgY29uc3QgdHlwZSA9IHRyYW5zZm9ybUlucHV0VHlwZVRvR3JhcGhRTChcbiAgICAgICAgICAgIHBhcnNlQ2xhc3MuZmllbGRzW2ZpZWxkXS50eXBlLFxuICAgICAgICAgICAgcGFyc2VDbGFzcy5maWVsZHNbZmllbGRdLnRhcmdldENsYXNzLFxuICAgICAgICAgICAgcGFyc2VHcmFwaFFMU2NoZW1hLnBhcnNlQ2xhc3NUeXBlc1xuICAgICAgICAgICk7XG4gICAgICAgICAgaWYgKHR5cGUpIHtcbiAgICAgICAgICAgIHJldHVybiB7XG4gICAgICAgICAgICAgIC4uLmZpZWxkcyxcbiAgICAgICAgICAgICAgW2ZpZWxkXToge1xuICAgICAgICAgICAgICAgIGRlc2NyaXB0aW9uOiBgVGhpcyBpcyB0aGUgb2JqZWN0ICR7ZmllbGR9LmAsXG4gICAgICAgICAgICAgICAgdHlwZTpcbiAgICAgICAgICAgICAgICAgIChjbGFzc05hbWUgPT09ICdfVXNlcicgJiZcbiAgICAgICAgICAgICAgICAgICAgKGZpZWxkID09PSAndXNlcm5hbWUnIHx8IGZpZWxkID09PSAncGFzc3dvcmQnKSkgfHxcbiAgICAgICAgICAgICAgICAgIHBhcnNlQ2xhc3MuZmllbGRzW2ZpZWxkXS5yZXF1aXJlZFxuICAgICAgICAgICAgICAgICAgICA/IG5ldyBHcmFwaFFMTm9uTnVsbCh0eXBlKVxuICAgICAgICAgICAgICAgICAgICA6IHR5cGUsXG4gICAgICAgICAgICAgIH0sXG4gICAgICAgICAgICB9O1xuICAgICAgICAgIH0gZWxzZSB7XG4gICAgICAgICAgICByZXR1cm4gZmllbGRzO1xuICAgICAgICAgIH1cbiAgICAgICAgfSxcbiAgICAgICAge1xuICAgICAgICAgIEFDTDogeyB0eXBlOiBkZWZhdWx0R3JhcGhRTFR5cGVzLkFDTF9JTlBVVCB9LFxuICAgICAgICB9XG4gICAgICApLFxuICB9KTtcbiAgY2xhc3NHcmFwaFFMQ3JlYXRlVHlwZSA9IHBhcnNlR3JhcGhRTFNjaGVtYS5hZGRHcmFwaFFMVHlwZShcbiAgICBjbGFzc0dyYXBoUUxDcmVhdGVUeXBlXG4gICk7XG5cbiAgY29uc3QgY2xhc3NHcmFwaFFMVXBkYXRlVHlwZU5hbWUgPSBgVXBkYXRlJHtncmFwaFFMQ2xhc3NOYW1lfUZpZWxkc0lucHV0YDtcbiAgbGV0IGNsYXNzR3JhcGhRTFVwZGF0ZVR5cGUgPSBuZXcgR3JhcGhRTElucHV0T2JqZWN0VHlwZSh7XG4gICAgbmFtZTogY2xhc3NHcmFwaFFMVXBkYXRlVHlwZU5hbWUsXG4gICAgZGVzY3JpcHRpb246IGBUaGUgJHtjbGFzc0dyYXBoUUxVcGRhdGVUeXBlTmFtZX0gaW5wdXQgdHlwZSBpcyB1c2VkIGluIG9wZXJhdGlvbnMgdGhhdCBpbnZvbHZlIGNyZWF0aW9uIG9mIG9iamVjdHMgaW4gdGhlICR7Z3JhcGhRTENsYXNzTmFtZX0gY2xhc3MuYCxcbiAgICBmaWVsZHM6ICgpID0+XG4gICAgICBjbGFzc1VwZGF0ZUZpZWxkcy5yZWR1Y2UoXG4gICAgICAgIChmaWVsZHMsIGZpZWxkKSA9PiB7XG4gICAgICAgICAgY29uc3QgdHlwZSA9IHRyYW5zZm9ybUlucHV0VHlwZVRvR3JhcGhRTChcbiAgICAgICAgICAgIHBhcnNlQ2xhc3MuZmllbGRzW2ZpZWxkXS50eXBlLFxuICAgICAgICAgICAgcGFyc2VDbGFzcy5maWVsZHNbZmllbGRdLnRhcmdldENsYXNzLFxuICAgICAgICAgICAgcGFyc2VHcmFwaFFMU2NoZW1hLnBhcnNlQ2xhc3NUeXBlc1xuICAgICAgICAgICk7XG4gICAgICAgICAgaWYgKHR5cGUpIHtcbiAgICAgICAgICAgIHJldHVybiB7XG4gICAgICAgICAgICAgIC4uLmZpZWxkcyxcbiAgICAgICAgICAgICAgW2ZpZWxkXToge1xuICAgICAgICAgICAgICAgIGRlc2NyaXB0aW9uOiBgVGhpcyBpcyB0aGUgb2JqZWN0ICR7ZmllbGR9LmAsXG4gICAgICAgICAgICAgICAgdHlwZSxcbiAgICAgICAgICAgICAgfSxcbiAgICAgICAgICAgIH07XG4gICAgICAgICAgfSBlbHNlIHtcbiAgICAgICAgICAgIHJldHVybiBmaWVsZHM7XG4gICAgICAgICAgfVxuICAgICAgICB9LFxuICAgICAgICB7XG4gICAgICAgICAgQUNMOiB7IHR5cGU6IGRlZmF1bHRHcmFwaFFMVHlwZXMuQUNMX0lOUFVUIH0sXG4gICAgICAgIH1cbiAgICAgICksXG4gIH0pO1xuICBjbGFzc0dyYXBoUUxVcGRhdGVUeXBlID0gcGFyc2VHcmFwaFFMU2NoZW1hLmFkZEdyYXBoUUxUeXBlKFxuICAgIGNsYXNzR3JhcGhRTFVwZGF0ZVR5cGVcbiAgKTtcblxuICBjb25zdCBjbGFzc0dyYXBoUUxQb2ludGVyVHlwZU5hbWUgPSBgJHtncmFwaFFMQ2xhc3NOYW1lfVBvaW50ZXJJbnB1dGA7XG4gIGxldCBjbGFzc0dyYXBoUUxQb2ludGVyVHlwZSA9IG5ldyBHcmFwaFFMSW5wdXRPYmplY3RUeXBlKHtcbiAgICBuYW1lOiBjbGFzc0dyYXBoUUxQb2ludGVyVHlwZU5hbWUsXG4gICAgZGVzY3JpcHRpb246IGBBbGxvdyB0byBsaW5rIE9SIGFkZCBhbmQgbGluayBhbiBvYmplY3Qgb2YgdGhlICR7Z3JhcGhRTENsYXNzTmFtZX0gY2xhc3MuYCxcbiAgICBmaWVsZHM6ICgpID0+IHtcbiAgICAgIGNvbnN0IGZpZWxkcyA9IHtcbiAgICAgICAgbGluazoge1xuICAgICAgICAgIGRlc2NyaXB0aW9uOiBgTGluayBhbiBleGlzdGluZyBvYmplY3QgZnJvbSAke2dyYXBoUUxDbGFzc05hbWV9IGNsYXNzLiBZb3UgY2FuIHVzZSBlaXRoZXIgdGhlIGdsb2JhbCBvciB0aGUgb2JqZWN0IGlkLmAsXG4gICAgICAgICAgdHlwZTogR3JhcGhRTElELFxuICAgICAgICB9LFxuICAgICAgfTtcbiAgICAgIGlmIChpc0NyZWF0ZUVuYWJsZWQpIHtcbiAgICAgICAgZmllbGRzWydjcmVhdGVBbmRMaW5rJ10gPSB7XG4gICAgICAgICAgZGVzY3JpcHRpb246IGBDcmVhdGUgYW5kIGxpbmsgYW4gb2JqZWN0IGZyb20gJHtncmFwaFFMQ2xhc3NOYW1lfSBjbGFzcy5gLFxuICAgICAgICAgIHR5cGU6IGNsYXNzR3JhcGhRTENyZWF0ZVR5cGUsXG4gICAgICAgIH07XG4gICAgICB9XG4gICAgICByZXR1cm4gZmllbGRzO1xuICAgIH0sXG4gIH0pO1xuICBjbGFzc0dyYXBoUUxQb2ludGVyVHlwZSA9XG4gICAgcGFyc2VHcmFwaFFMU2NoZW1hLmFkZEdyYXBoUUxUeXBlKGNsYXNzR3JhcGhRTFBvaW50ZXJUeXBlKSB8fFxuICAgIGRlZmF1bHRHcmFwaFFMVHlwZXMuT0JKRUNUO1xuXG4gIGNvbnN0IGNsYXNzR3JhcGhRTFJlbGF0aW9uVHlwZU5hbWUgPSBgJHtncmFwaFFMQ2xhc3NOYW1lfVJlbGF0aW9uSW5wdXRgO1xuICBsZXQgY2xhc3NHcmFwaFFMUmVsYXRpb25UeXBlID0gbmV3IEdyYXBoUUxJbnB1dE9iamVjdFR5cGUoe1xuICAgIG5hbWU6IGNsYXNzR3JhcGhRTFJlbGF0aW9uVHlwZU5hbWUsXG4gICAgZGVzY3JpcHRpb246IGBBbGxvdyB0byBhZGQsIHJlbW92ZSwgY3JlYXRlQW5kQWRkIG9iamVjdHMgb2YgdGhlICR7Z3JhcGhRTENsYXNzTmFtZX0gY2xhc3MgaW50byBhIHJlbGF0aW9uIGZpZWxkLmAsXG4gICAgZmllbGRzOiAoKSA9PiB7XG4gICAgICBjb25zdCBmaWVsZHMgPSB7XG4gICAgICAgIGFkZDoge1xuICAgICAgICAgIGRlc2NyaXB0aW9uOiBgQWRkIGV4aXN0aW5nIG9iamVjdHMgZnJvbSB0aGUgJHtncmFwaFFMQ2xhc3NOYW1lfSBjbGFzcyBpbnRvIHRoZSByZWxhdGlvbi4gWW91IGNhbiB1c2UgZWl0aGVyIHRoZSBnbG9iYWwgb3IgdGhlIG9iamVjdCBpZHMuYCxcbiAgICAgICAgICB0eXBlOiBuZXcgR3JhcGhRTExpc3QoZGVmYXVsdEdyYXBoUUxUeXBlcy5PQkpFQ1RfSUQpLFxuICAgICAgICB9LFxuICAgICAgICByZW1vdmU6IHtcbiAgICAgICAgICBkZXNjcmlwdGlvbjogYFJlbW92ZSBleGlzdGluZyBvYmplY3RzIGZyb20gdGhlICR7Z3JhcGhRTENsYXNzTmFtZX0gY2xhc3Mgb3V0IG9mIHRoZSByZWxhdGlvbi4gWW91IGNhbiB1c2UgZWl0aGVyIHRoZSBnbG9iYWwgb3IgdGhlIG9iamVjdCBpZHMuYCxcbiAgICAgICAgICB0eXBlOiBuZXcgR3JhcGhRTExpc3QoZGVmYXVsdEdyYXBoUUxUeXBlcy5PQkpFQ1RfSUQpLFxuICAgICAgICB9LFxuICAgICAgfTtcbiAgICAgIGlmIChpc0NyZWF0ZUVuYWJsZWQpIHtcbiAgICAgICAgZmllbGRzWydjcmVhdGVBbmRBZGQnXSA9IHtcbiAgICAgICAgICBkZXNjcmlwdGlvbjogYENyZWF0ZSBhbmQgYWRkIG9iamVjdHMgb2YgdGhlICR7Z3JhcGhRTENsYXNzTmFtZX0gY2xhc3MgaW50byB0aGUgcmVsYXRpb24uYCxcbiAgICAgICAgICB0eXBlOiBuZXcgR3JhcGhRTExpc3QobmV3IEdyYXBoUUxOb25OdWxsKGNsYXNzR3JhcGhRTENyZWF0ZVR5cGUpKSxcbiAgICAgICAgfTtcbiAgICAgIH1cbiAgICAgIHJldHVybiBmaWVsZHM7XG4gICAgfSxcbiAgfSk7XG4gIGNsYXNzR3JhcGhRTFJlbGF0aW9uVHlwZSA9XG4gICAgcGFyc2VHcmFwaFFMU2NoZW1hLmFkZEdyYXBoUUxUeXBlKGNsYXNzR3JhcGhRTFJlbGF0aW9uVHlwZSkgfHxcbiAgICBkZWZhdWx0R3JhcGhRTFR5cGVzLk9CSkVDVDtcblxuICBjb25zdCBjbGFzc0dyYXBoUUxDb25zdHJhaW50c1R5cGVOYW1lID0gYCR7Z3JhcGhRTENsYXNzTmFtZX1XaGVyZUlucHV0YDtcbiAgbGV0IGNsYXNzR3JhcGhRTENvbnN0cmFpbnRzVHlwZSA9IG5ldyBHcmFwaFFMSW5wdXRPYmplY3RUeXBlKHtcbiAgICBuYW1lOiBjbGFzc0dyYXBoUUxDb25zdHJhaW50c1R5cGVOYW1lLFxuICAgIGRlc2NyaXB0aW9uOiBgVGhlICR7Y2xhc3NHcmFwaFFMQ29uc3RyYWludHNUeXBlTmFtZX0gaW5wdXQgdHlwZSBpcyB1c2VkIGluIG9wZXJhdGlvbnMgdGhhdCBpbnZvbHZlIGZpbHRlcmluZyBvYmplY3RzIG9mICR7Z3JhcGhRTENsYXNzTmFtZX0gY2xhc3MuYCxcbiAgICBmaWVsZHM6ICgpID0+ICh7XG4gICAgICAuLi5jbGFzc0NvbnN0cmFpbnRGaWVsZHMucmVkdWNlKChmaWVsZHMsIGZpZWxkKSA9PiB7XG4gICAgICAgIGlmIChbJ09SJywgJ0FORCcsICdOT1InXS5pbmNsdWRlcyhmaWVsZCkpIHtcbiAgICAgICAgICBwYXJzZUdyYXBoUUxTY2hlbWEubG9nLndhcm4oXG4gICAgICAgICAgICBgRmllbGQgJHtmaWVsZH0gY291bGQgbm90IGJlIGFkZGVkIHRvIHRoZSBhdXRvIHNjaGVtYSAke2NsYXNzR3JhcGhRTENvbnN0cmFpbnRzVHlwZU5hbWV9IGJlY2F1c2UgaXQgY29sbGlkZWQgd2l0aCBhbiBleGlzdGluZyBvbmUuYFxuICAgICAgICAgICk7XG4gICAgICAgICAgcmV0dXJuIGZpZWxkcztcbiAgICAgICAgfVxuICAgICAgICBjb25zdCBwYXJzZUZpZWxkID0gZmllbGQgPT09ICdpZCcgPyAnb2JqZWN0SWQnIDogZmllbGQ7XG4gICAgICAgIGNvbnN0IHR5cGUgPSB0cmFuc2Zvcm1Db25zdHJhaW50VHlwZVRvR3JhcGhRTChcbiAgICAgICAgICBwYXJzZUNsYXNzLmZpZWxkc1twYXJzZUZpZWxkXS50eXBlLFxuICAgICAgICAgIHBhcnNlQ2xhc3MuZmllbGRzW3BhcnNlRmllbGRdLnRhcmdldENsYXNzLFxuICAgICAgICAgIHBhcnNlR3JhcGhRTFNjaGVtYS5wYXJzZUNsYXNzVHlwZXMsXG4gICAgICAgICAgZmllbGRcbiAgICAgICAgKTtcbiAgICAgICAgaWYgKHR5cGUpIHtcbiAgICAgICAgICByZXR1cm4ge1xuICAgICAgICAgICAgLi4uZmllbGRzLFxuICAgICAgICAgICAgW2ZpZWxkXToge1xuICAgICAgICAgICAgICBkZXNjcmlwdGlvbjogYFRoaXMgaXMgdGhlIG9iamVjdCAke2ZpZWxkfS5gLFxuICAgICAgICAgICAgICB0eXBlLFxuICAgICAgICAgICAgfSxcbiAgICAgICAgICB9O1xuICAgICAgICB9IGVsc2Uge1xuICAgICAgICAgIHJldHVybiBmaWVsZHM7XG4gICAgICAgIH1cbiAgICAgIH0sIHt9KSxcbiAgICAgIE9SOiB7XG4gICAgICAgIGRlc2NyaXB0aW9uOiAnVGhpcyBpcyB0aGUgT1Igb3BlcmF0b3IgdG8gY29tcG91bmQgY29uc3RyYWludHMuJyxcbiAgICAgICAgdHlwZTogbmV3IEdyYXBoUUxMaXN0KG5ldyBHcmFwaFFMTm9uTnVsbChjbGFzc0dyYXBoUUxDb25zdHJhaW50c1R5cGUpKSxcbiAgICAgIH0sXG4gICAgICBBTkQ6IHtcbiAgICAgICAgZGVzY3JpcHRpb246ICdUaGlzIGlzIHRoZSBBTkQgb3BlcmF0b3IgdG8gY29tcG91bmQgY29uc3RyYWludHMuJyxcbiAgICAgICAgdHlwZTogbmV3IEdyYXBoUUxMaXN0KG5ldyBHcmFwaFFMTm9uTnVsbChjbGFzc0dyYXBoUUxDb25zdHJhaW50c1R5cGUpKSxcbiAgICAgIH0sXG4gICAgICBOT1I6IHtcbiAgICAgICAgZGVzY3JpcHRpb246ICdUaGlzIGlzIHRoZSBOT1Igb3BlcmF0b3IgdG8gY29tcG91bmQgY29uc3RyYWludHMuJyxcbiAgICAgICAgdHlwZTogbmV3IEdyYXBoUUxMaXN0KG5ldyBHcmFwaFFMTm9uTnVsbChjbGFzc0dyYXBoUUxDb25zdHJhaW50c1R5cGUpKSxcbiAgICAgIH0sXG4gICAgfSksXG4gIH0pO1xuICBjbGFzc0dyYXBoUUxDb25zdHJhaW50c1R5cGUgPVxuICAgIHBhcnNlR3JhcGhRTFNjaGVtYS5hZGRHcmFwaFFMVHlwZShjbGFzc0dyYXBoUUxDb25zdHJhaW50c1R5cGUpIHx8XG4gICAgZGVmYXVsdEdyYXBoUUxUeXBlcy5PQkpFQ1Q7XG5cbiAgY29uc3QgY2xhc3NHcmFwaFFMUmVsYXRpb25Db25zdHJhaW50c1R5cGVOYW1lID0gYCR7Z3JhcGhRTENsYXNzTmFtZX1SZWxhdGlvbldoZXJlSW5wdXRgO1xuICBsZXQgY2xhc3NHcmFwaFFMUmVsYXRpb25Db25zdHJhaW50c1R5cGUgPSBuZXcgR3JhcGhRTElucHV0T2JqZWN0VHlwZSh7XG4gICAgbmFtZTogY2xhc3NHcmFwaFFMUmVsYXRpb25Db25zdHJhaW50c1R5cGVOYW1lLFxuICAgIGRlc2NyaXB0aW9uOiBgVGhlICR7Y2xhc3NHcmFwaFFMUmVsYXRpb25Db25zdHJhaW50c1R5cGVOYW1lfSBpbnB1dCB0eXBlIGlzIHVzZWQgaW4gb3BlcmF0aW9ucyB0aGF0IGludm9sdmUgZmlsdGVyaW5nIG9iamVjdHMgb2YgJHtncmFwaFFMQ2xhc3NOYW1lfSBjbGFzcy5gLFxuICAgIGZpZWxkczogKCkgPT4gKHtcbiAgICAgIGhhdmU6IHtcbiAgICAgICAgZGVzY3JpcHRpb246XG4gICAgICAgICAgJ1J1biBhIHJlbGF0aW9uYWwvcG9pbnRlciBxdWVyeSB3aGVyZSBhdCBsZWFzdCBvbmUgY2hpbGQgb2JqZWN0IGNhbiBtYXRjaC4nLFxuICAgICAgICB0eXBlOiBjbGFzc0dyYXBoUUxDb25zdHJhaW50c1R5cGUsXG4gICAgICB9LFxuICAgICAgaGF2ZU5vdDoge1xuICAgICAgICBkZXNjcmlwdGlvbjpcbiAgICAgICAgICAnUnVuIGFuIGludmVydGVkIHJlbGF0aW9uYWwvcG9pbnRlciBxdWVyeSB3aGVyZSBhdCBsZWFzdCBvbmUgY2hpbGQgb2JqZWN0IGNhbiBtYXRjaC4nLFxuICAgICAgICB0eXBlOiBjbGFzc0dyYXBoUUxDb25zdHJhaW50c1R5cGUsXG4gICAgICB9LFxuICAgICAgZXhpc3RzOiB7XG4gICAgICAgIGRlc2NyaXB0aW9uOiAnQ2hlY2sgaWYgdGhlIHJlbGF0aW9uL3BvaW50ZXIgY29udGFpbnMgb2JqZWN0cy4nLFxuICAgICAgICB0eXBlOiBHcmFwaFFMQm9vbGVhbixcbiAgICAgIH0sXG4gICAgfSksXG4gIH0pO1xuICBjbGFzc0dyYXBoUUxSZWxhdGlvbkNvbnN0cmFpbnRzVHlwZSA9XG4gICAgcGFyc2VHcmFwaFFMU2NoZW1hLmFkZEdyYXBoUUxUeXBlKGNsYXNzR3JhcGhRTFJlbGF0aW9uQ29uc3RyYWludHNUeXBlKSB8fFxuICAgIGRlZmF1bHRHcmFwaFFMVHlwZXMuT0JKRUNUO1xuXG4gIGNvbnN0IGNsYXNzR3JhcGhRTE9yZGVyVHlwZU5hbWUgPSBgJHtncmFwaFFMQ2xhc3NOYW1lfU9yZGVyYDtcbiAgbGV0IGNsYXNzR3JhcGhRTE9yZGVyVHlwZSA9IG5ldyBHcmFwaFFMRW51bVR5cGUoe1xuICAgIG5hbWU6IGNsYXNzR3JhcGhRTE9yZGVyVHlwZU5hbWUsXG4gICAgZGVzY3JpcHRpb246IGBUaGUgJHtjbGFzc0dyYXBoUUxPcmRlclR5cGVOYW1lfSBpbnB1dCB0eXBlIGlzIHVzZWQgd2hlbiBzb3J0aW5nIG9iamVjdHMgb2YgdGhlICR7Z3JhcGhRTENsYXNzTmFtZX0gY2xhc3MuYCxcbiAgICB2YWx1ZXM6IGNsYXNzU29ydEZpZWxkcy5yZWR1Y2UoKHNvcnRGaWVsZHMsIGZpZWxkQ29uZmlnKSA9PiB7XG4gICAgICBjb25zdCB7IGZpZWxkLCBhc2MsIGRlc2MgfSA9IGZpZWxkQ29uZmlnO1xuICAgICAgY29uc3QgdXBkYXRlZFNvcnRGaWVsZHMgPSB7XG4gICAgICAgIC4uLnNvcnRGaWVsZHMsXG4gICAgICB9O1xuICAgICAgY29uc3QgdmFsdWUgPSBmaWVsZCA9PT0gJ2lkJyA/ICdvYmplY3RJZCcgOiBmaWVsZDtcbiAgICAgIGlmIChhc2MpIHtcbiAgICAgICAgdXBkYXRlZFNvcnRGaWVsZHNbYCR7ZmllbGR9X0FTQ2BdID0geyB2YWx1ZSB9O1xuICAgICAgfVxuICAgICAgaWYgKGRlc2MpIHtcbiAgICAgICAgdXBkYXRlZFNvcnRGaWVsZHNbYCR7ZmllbGR9X0RFU0NgXSA9IHsgdmFsdWU6IGAtJHt2YWx1ZX1gIH07XG4gICAgICB9XG4gICAgICByZXR1cm4gdXBkYXRlZFNvcnRGaWVsZHM7XG4gICAgfSwge30pLFxuICB9KTtcbiAgY2xhc3NHcmFwaFFMT3JkZXJUeXBlID0gcGFyc2VHcmFwaFFMU2NoZW1hLmFkZEdyYXBoUUxUeXBlKFxuICAgIGNsYXNzR3JhcGhRTE9yZGVyVHlwZVxuICApO1xuXG4gIGNvbnN0IGNsYXNzR3JhcGhRTEZpbmRBcmdzID0ge1xuICAgIHdoZXJlOiB7XG4gICAgICBkZXNjcmlwdGlvbjpcbiAgICAgICAgJ1RoZXNlIGFyZSB0aGUgY29uZGl0aW9ucyB0aGF0IHRoZSBvYmplY3RzIG5lZWQgdG8gbWF0Y2ggaW4gb3JkZXIgdG8gYmUgZm91bmQuJyxcbiAgICAgIHR5cGU6IGNsYXNzR3JhcGhRTENvbnN0cmFpbnRzVHlwZSxcbiAgICB9LFxuICAgIG9yZGVyOiB7XG4gICAgICBkZXNjcmlwdGlvbjogJ1RoZSBmaWVsZHMgdG8gYmUgdXNlZCB3aGVuIHNvcnRpbmcgdGhlIGRhdGEgZmV0Y2hlZC4nLFxuICAgICAgdHlwZTogY2xhc3NHcmFwaFFMT3JkZXJUeXBlXG4gICAgICAgID8gbmV3IEdyYXBoUUxMaXN0KG5ldyBHcmFwaFFMTm9uTnVsbChjbGFzc0dyYXBoUUxPcmRlclR5cGUpKVxuICAgICAgICA6IEdyYXBoUUxTdHJpbmcsXG4gICAgfSxcbiAgICBza2lwOiBkZWZhdWx0R3JhcGhRTFR5cGVzLlNLSVBfQVRULFxuICAgIC4uLmNvbm5lY3Rpb25BcmdzLFxuICAgIG9wdGlvbnM6IGRlZmF1bHRHcmFwaFFMVHlwZXMuUkVBRF9PUFRJT05TX0FUVCxcbiAgfTtcbiAgY29uc3QgY2xhc3NHcmFwaFFMT3V0cHV0VHlwZU5hbWUgPSBgJHtncmFwaFFMQ2xhc3NOYW1lfWA7XG4gIGNvbnN0IGludGVyZmFjZXMgPSBbXG4gICAgZGVmYXVsdEdyYXBoUUxUeXBlcy5QQVJTRV9PQkpFQ1QsXG4gICAgcGFyc2VHcmFwaFFMU2NoZW1hLnJlbGF5Tm9kZUludGVyZmFjZSxcbiAgXTtcbiAgY29uc3QgcGFyc2VPYmplY3RGaWVsZHMgPSB7XG4gICAgaWQ6IGdsb2JhbElkRmllbGQoY2xhc3NOYW1lLCBvYmogPT4gb2JqLm9iamVjdElkKSxcbiAgICAuLi5kZWZhdWx0R3JhcGhRTFR5cGVzLlBBUlNFX09CSkVDVF9GSUVMRFMsXG4gIH07XG4gIGNvbnN0IG91dHB1dEZpZWxkcyA9ICgpID0+IHtcbiAgICByZXR1cm4gY2xhc3NPdXRwdXRGaWVsZHMucmVkdWNlKChmaWVsZHMsIGZpZWxkKSA9PiB7XG4gICAgICBjb25zdCB0eXBlID0gdHJhbnNmb3JtT3V0cHV0VHlwZVRvR3JhcGhRTChcbiAgICAgICAgcGFyc2VDbGFzcy5maWVsZHNbZmllbGRdLnR5cGUsXG4gICAgICAgIHBhcnNlQ2xhc3MuZmllbGRzW2ZpZWxkXS50YXJnZXRDbGFzcyxcbiAgICAgICAgcGFyc2VHcmFwaFFMU2NoZW1hLnBhcnNlQ2xhc3NUeXBlc1xuICAgICAgKTtcbiAgICAgIGlmIChwYXJzZUNsYXNzLmZpZWxkc1tmaWVsZF0udHlwZSA9PT0gJ1JlbGF0aW9uJykge1xuICAgICAgICBjb25zdCB0YXJnZXRQYXJzZUNsYXNzVHlwZXMgPVxuICAgICAgICAgIHBhcnNlR3JhcGhRTFNjaGVtYS5wYXJzZUNsYXNzVHlwZXNbXG4gICAgICAgICAgICBwYXJzZUNsYXNzLmZpZWxkc1tmaWVsZF0udGFyZ2V0Q2xhc3NcbiAgICAgICAgICBdO1xuICAgICAgICBjb25zdCBhcmdzID0gdGFyZ2V0UGFyc2VDbGFzc1R5cGVzXG4gICAgICAgICAgPyB0YXJnZXRQYXJzZUNsYXNzVHlwZXMuY2xhc3NHcmFwaFFMRmluZEFyZ3NcbiAgICAgICAgICA6IHVuZGVmaW5lZDtcbiAgICAgICAgcmV0dXJuIHtcbiAgICAgICAgICAuLi5maWVsZHMsXG4gICAgICAgICAgW2ZpZWxkXToge1xuICAgICAgICAgICAgZGVzY3JpcHRpb246IGBUaGlzIGlzIHRoZSBvYmplY3QgJHtmaWVsZH0uYCxcbiAgICAgICAgICAgIGFyZ3MsXG4gICAgICAgICAgICB0eXBlOiBwYXJzZUNsYXNzLmZpZWxkc1tmaWVsZF0ucmVxdWlyZWRcbiAgICAgICAgICAgICAgPyBuZXcgR3JhcGhRTE5vbk51bGwodHlwZSlcbiAgICAgICAgICAgICAgOiB0eXBlLFxuICAgICAgICAgICAgYXN5bmMgcmVzb2x2ZShzb3VyY2UsIGFyZ3MsIGNvbnRleHQsIHF1ZXJ5SW5mbykge1xuICAgICAgICAgICAgICB0cnkge1xuICAgICAgICAgICAgICAgIGNvbnN0IHtcbiAgICAgICAgICAgICAgICAgIHdoZXJlLFxuICAgICAgICAgICAgICAgICAgb3JkZXIsXG4gICAgICAgICAgICAgICAgICBza2lwLFxuICAgICAgICAgICAgICAgICAgZmlyc3QsXG4gICAgICAgICAgICAgICAgICBhZnRlcixcbiAgICAgICAgICAgICAgICAgIGxhc3QsXG4gICAgICAgICAgICAgICAgICBiZWZvcmUsXG4gICAgICAgICAgICAgICAgICBvcHRpb25zLFxuICAgICAgICAgICAgICAgIH0gPSBhcmdzO1xuICAgICAgICAgICAgICAgIGNvbnN0IHtcbiAgICAgICAgICAgICAgICAgIHJlYWRQcmVmZXJlbmNlLFxuICAgICAgICAgICAgICAgICAgaW5jbHVkZVJlYWRQcmVmZXJlbmNlLFxuICAgICAgICAgICAgICAgICAgc3VicXVlcnlSZWFkUHJlZmVyZW5jZSxcbiAgICAgICAgICAgICAgICB9ID0gb3B0aW9ucyB8fCB7fTtcbiAgICAgICAgICAgICAgICBjb25zdCB7IGNvbmZpZywgYXV0aCwgaW5mbyB9ID0gY29udGV4dDtcbiAgICAgICAgICAgICAgICBjb25zdCBzZWxlY3RlZEZpZWxkcyA9IGdldEZpZWxkTmFtZXMocXVlcnlJbmZvKTtcblxuICAgICAgICAgICAgICAgIGNvbnN0IHsga2V5cywgaW5jbHVkZSB9ID0gZXh0cmFjdEtleXNBbmRJbmNsdWRlKFxuICAgICAgICAgICAgICAgICAgc2VsZWN0ZWRGaWVsZHNcbiAgICAgICAgICAgICAgICAgICAgLmZpbHRlcihmaWVsZCA9PiBmaWVsZC5zdGFydHNXaXRoKCdlZGdlcy5ub2RlLicpKVxuICAgICAgICAgICAgICAgICAgICAubWFwKGZpZWxkID0+IGZpZWxkLnJlcGxhY2UoJ2VkZ2VzLm5vZGUuJywgJycpKVxuICAgICAgICAgICAgICAgICk7XG4gICAgICAgICAgICAgICAgY29uc3QgcGFyc2VPcmRlciA9IG9yZGVyICYmIG9yZGVyLmpvaW4oJywnKTtcblxuICAgICAgICAgICAgICAgIHJldHVybiBhd2FpdCBvYmplY3RzUXVlcmllcy5maW5kT2JqZWN0cyhcbiAgICAgICAgICAgICAgICAgIHNvdXJjZVtmaWVsZF0uY2xhc3NOYW1lLFxuICAgICAgICAgICAgICAgICAge1xuICAgICAgICAgICAgICAgICAgICAkcmVsYXRlZFRvOiB7XG4gICAgICAgICAgICAgICAgICAgICAgb2JqZWN0OiB7XG4gICAgICAgICAgICAgICAgICAgICAgICBfX3R5cGU6ICdQb2ludGVyJyxcbiAgICAgICAgICAgICAgICAgICAgICAgIGNsYXNzTmFtZTogY2xhc3NOYW1lLFxuICAgICAgICAgICAgICAgICAgICAgICAgb2JqZWN0SWQ6IHNvdXJjZS5vYmplY3RJZCxcbiAgICAgICAgICAgICAgICAgICAgICB9LFxuICAgICAgICAgICAgICAgICAgICAgIGtleTogZmllbGQsXG4gICAgICAgICAgICAgICAgICAgIH0sXG4gICAgICAgICAgICAgICAgICAgIC4uLih3aGVyZSB8fCB7fSksXG4gICAgICAgICAgICAgICAgICB9LFxuICAgICAgICAgICAgICAgICAgcGFyc2VPcmRlcixcbiAgICAgICAgICAgICAgICAgIHNraXAsXG4gICAgICAgICAgICAgICAgICBmaXJzdCxcbiAgICAgICAgICAgICAgICAgIGFmdGVyLFxuICAgICAgICAgICAgICAgICAgbGFzdCxcbiAgICAgICAgICAgICAgICAgIGJlZm9yZSxcbiAgICAgICAgICAgICAgICAgIGtleXMsXG4gICAgICAgICAgICAgICAgICBpbmNsdWRlLFxuICAgICAgICAgICAgICAgICAgZmFsc2UsXG4gICAgICAgICAgICAgICAgICByZWFkUHJlZmVyZW5jZSxcbiAgICAgICAgICAgICAgICAgIGluY2x1ZGVSZWFkUHJlZmVyZW5jZSxcbiAgICAgICAgICAgICAgICAgIHN1YnF1ZXJ5UmVhZFByZWZlcmVuY2UsXG4gICAgICAgICAgICAgICAgICBjb25maWcsXG4gICAgICAgICAgICAgICAgICBhdXRoLFxuICAgICAgICAgICAgICAgICAgaW5mbyxcbiAgICAgICAgICAgICAgICAgIHNlbGVjdGVkRmllbGRzLFxuICAgICAgICAgICAgICAgICAgcGFyc2VHcmFwaFFMU2NoZW1hLnBhcnNlQ2xhc3Nlc1xuICAgICAgICAgICAgICAgICk7XG4gICAgICAgICAgICAgIH0gY2F0Y2ggKGUpIHtcbiAgICAgICAgICAgICAgICBwYXJzZUdyYXBoUUxTY2hlbWEuaGFuZGxlRXJyb3IoZSk7XG4gICAgICAgICAgICAgIH1cbiAgICAgICAgICAgIH0sXG4gICAgICAgICAgfSxcbiAgICAgICAgfTtcbiAgICAgIH0gZWxzZSBpZiAocGFyc2VDbGFzcy5maWVsZHNbZmllbGRdLnR5cGUgPT09ICdQb2x5Z29uJykge1xuICAgICAgICByZXR1cm4ge1xuICAgICAgICAgIC4uLmZpZWxkcyxcbiAgICAgICAgICBbZmllbGRdOiB7XG4gICAgICAgICAgICBkZXNjcmlwdGlvbjogYFRoaXMgaXMgdGhlIG9iamVjdCAke2ZpZWxkfS5gLFxuICAgICAgICAgICAgdHlwZTogcGFyc2VDbGFzcy5maWVsZHNbZmllbGRdLnJlcXVpcmVkXG4gICAgICAgICAgICAgID8gbmV3IEdyYXBoUUxOb25OdWxsKHR5cGUpXG4gICAgICAgICAgICAgIDogdHlwZSxcbiAgICAgICAgICAgIGFzeW5jIHJlc29sdmUoc291cmNlKSB7XG4gICAgICAgICAgICAgIGlmIChzb3VyY2VbZmllbGRdICYmIHNvdXJjZVtmaWVsZF0uY29vcmRpbmF0ZXMpIHtcbiAgICAgICAgICAgICAgICByZXR1cm4gc291cmNlW2ZpZWxkXS5jb29yZGluYXRlcy5tYXAoY29vcmRpbmF0ZSA9PiAoe1xuICAgICAgICAgICAgICAgICAgbGF0aXR1ZGU6IGNvb3JkaW5hdGVbMF0sXG4gICAgICAgICAgICAgICAgICBsb25naXR1ZGU6IGNvb3JkaW5hdGVbMV0sXG4gICAgICAgICAgICAgICAgfSkpO1xuICAgICAgICAgICAgICB9IGVsc2Uge1xuICAgICAgICAgICAgICAgIHJldHVybiBudWxsO1xuICAgICAgICAgICAgICB9XG4gICAgICAgICAgICB9LFxuICAgICAgICAgIH0sXG4gICAgICAgIH07XG4gICAgICB9IGVsc2UgaWYgKHBhcnNlQ2xhc3MuZmllbGRzW2ZpZWxkXS50eXBlID09PSAnQXJyYXknKSB7XG4gICAgICAgIHJldHVybiB7XG4gICAgICAgICAgLi4uZmllbGRzLFxuICAgICAgICAgIFtmaWVsZF06IHtcbiAgICAgICAgICAgIGRlc2NyaXB0aW9uOiBgVXNlIElubGluZSBGcmFnbWVudCBvbiBBcnJheSB0byBnZXQgcmVzdWx0czogaHR0cHM6Ly9ncmFwaHFsLm9yZy9sZWFybi9xdWVyaWVzLyNpbmxpbmUtZnJhZ21lbnRzYCxcbiAgICAgICAgICAgIHR5cGU6IHBhcnNlQ2xhc3MuZmllbGRzW2ZpZWxkXS5yZXF1aXJlZFxuICAgICAgICAgICAgICA/IG5ldyBHcmFwaFFMTm9uTnVsbCh0eXBlKVxuICAgICAgICAgICAgICA6IHR5cGUsXG4gICAgICAgICAgICBhc3luYyByZXNvbHZlKHNvdXJjZSkge1xuICAgICAgICAgICAgICBpZiAoIXNvdXJjZVtmaWVsZF0pIHJldHVybiBudWxsO1xuICAgICAgICAgICAgICByZXR1cm4gc291cmNlW2ZpZWxkXS5tYXAoYXN5bmMgZWxlbSA9PiB7XG4gICAgICAgICAgICAgICAgaWYgKFxuICAgICAgICAgICAgICAgICAgZWxlbS5jbGFzc05hbWUgJiZcbiAgICAgICAgICAgICAgICAgIGVsZW0ub2JqZWN0SWQgJiZcbiAgICAgICAgICAgICAgICAgIGVsZW0uX190eXBlID09PSAnT2JqZWN0J1xuICAgICAgICAgICAgICAgICkge1xuICAgICAgICAgICAgICAgICAgcmV0dXJuIGVsZW07XG4gICAgICAgICAgICAgICAgfSBlbHNlIHtcbiAgICAgICAgICAgICAgICAgIHJldHVybiB7IHZhbHVlOiBlbGVtIH07XG4gICAgICAgICAgICAgICAgfVxuICAgICAgICAgICAgICB9KTtcbiAgICAgICAgICAgIH0sXG4gICAgICAgICAgfSxcbiAgICAgICAgfTtcbiAgICAgIH0gZWxzZSBpZiAodHlwZSkge1xuICAgICAgICByZXR1cm4ge1xuICAgICAgICAgIC4uLmZpZWxkcyxcbiAgICAgICAgICBbZmllbGRdOiB7XG4gICAgICAgICAgICBkZXNjcmlwdGlvbjogYFRoaXMgaXMgdGhlIG9iamVjdCAke2ZpZWxkfS5gLFxuICAgICAgICAgICAgdHlwZTogcGFyc2VDbGFzcy5maWVsZHNbZmllbGRdLnJlcXVpcmVkXG4gICAgICAgICAgICAgID8gbmV3IEdyYXBoUUxOb25OdWxsKHR5cGUpXG4gICAgICAgICAgICAgIDogdHlwZSxcbiAgICAgICAgICB9LFxuICAgICAgICB9O1xuICAgICAgfSBlbHNlIHtcbiAgICAgICAgcmV0dXJuIGZpZWxkcztcbiAgICAgIH1cbiAgICB9LCBwYXJzZU9iamVjdEZpZWxkcyk7XG4gIH07XG4gIGxldCBjbGFzc0dyYXBoUUxPdXRwdXRUeXBlID0gbmV3IEdyYXBoUUxPYmplY3RUeXBlKHtcbiAgICBuYW1lOiBjbGFzc0dyYXBoUUxPdXRwdXRUeXBlTmFtZSxcbiAgICBkZXNjcmlwdGlvbjogYFRoZSAke2NsYXNzR3JhcGhRTE91dHB1dFR5cGVOYW1lfSBvYmplY3QgdHlwZSBpcyB1c2VkIGluIG9wZXJhdGlvbnMgdGhhdCBpbnZvbHZlIG91dHB1dHRpbmcgb2JqZWN0cyBvZiAke2dyYXBoUUxDbGFzc05hbWV9IGNsYXNzLmAsXG4gICAgaW50ZXJmYWNlcyxcbiAgICBmaWVsZHM6IG91dHB1dEZpZWxkcyxcbiAgfSk7XG4gIGNsYXNzR3JhcGhRTE91dHB1dFR5cGUgPSBwYXJzZUdyYXBoUUxTY2hlbWEuYWRkR3JhcGhRTFR5cGUoXG4gICAgY2xhc3NHcmFwaFFMT3V0cHV0VHlwZVxuICApO1xuXG4gIGNvbnN0IHsgY29ubmVjdGlvblR5cGUsIGVkZ2VUeXBlIH0gPSBjb25uZWN0aW9uRGVmaW5pdGlvbnMoe1xuICAgIG5hbWU6IGdyYXBoUUxDbGFzc05hbWUsXG4gICAgY29ubmVjdGlvbkZpZWxkczoge1xuICAgICAgY291bnQ6IGRlZmF1bHRHcmFwaFFMVHlwZXMuQ09VTlRfQVRULFxuICAgIH0sXG4gICAgbm9kZVR5cGU6IGNsYXNzR3JhcGhRTE91dHB1dFR5cGUgfHwgZGVmYXVsdEdyYXBoUUxUeXBlcy5PQkpFQ1QsXG4gIH0pO1xuICBsZXQgY2xhc3NHcmFwaFFMRmluZFJlc3VsdFR5cGUgPSB1bmRlZmluZWQ7XG4gIGlmIChcbiAgICBwYXJzZUdyYXBoUUxTY2hlbWEuYWRkR3JhcGhRTFR5cGUoZWRnZVR5cGUpICYmXG4gICAgcGFyc2VHcmFwaFFMU2NoZW1hLmFkZEdyYXBoUUxUeXBlKGNvbm5lY3Rpb25UeXBlLCBmYWxzZSwgZmFsc2UsIHRydWUpXG4gICkge1xuICAgIGNsYXNzR3JhcGhRTEZpbmRSZXN1bHRUeXBlID0gY29ubmVjdGlvblR5cGU7XG4gIH1cblxuICBwYXJzZUdyYXBoUUxTY2hlbWEucGFyc2VDbGFzc1R5cGVzW2NsYXNzTmFtZV0gPSB7XG4gICAgY2xhc3NHcmFwaFFMUG9pbnRlclR5cGUsXG4gICAgY2xhc3NHcmFwaFFMUmVsYXRpb25UeXBlLFxuICAgIGNsYXNzR3JhcGhRTENyZWF0ZVR5cGUsXG4gICAgY2xhc3NHcmFwaFFMVXBkYXRlVHlwZSxcbiAgICBjbGFzc0dyYXBoUUxDb25zdHJhaW50c1R5cGUsXG4gICAgY2xhc3NHcmFwaFFMUmVsYXRpb25Db25zdHJhaW50c1R5cGUsXG4gICAgY2xhc3NHcmFwaFFMRmluZEFyZ3MsXG4gICAgY2xhc3NHcmFwaFFMT3V0cHV0VHlwZSxcbiAgICBjbGFzc0dyYXBoUUxGaW5kUmVzdWx0VHlwZSxcbiAgICBjb25maWc6IHtcbiAgICAgIHBhcnNlQ2xhc3NDb25maWcsXG4gICAgICBpc0NyZWF0ZUVuYWJsZWQsXG4gICAgICBpc1VwZGF0ZUVuYWJsZWQsXG4gICAgfSxcbiAgfTtcblxuICBpZiAoY2xhc3NOYW1lID09PSAnX1VzZXInKSB7XG4gICAgY29uc3Qgdmlld2VyVHlwZSA9IG5ldyBHcmFwaFFMT2JqZWN0VHlwZSh7XG4gICAgICBuYW1lOiAnVmlld2VyJyxcbiAgICAgIGRlc2NyaXB0aW9uOiBgVGhlIFZpZXdlciBvYmplY3QgdHlwZSBpcyB1c2VkIGluIG9wZXJhdGlvbnMgdGhhdCBpbnZvbHZlIG91dHB1dHRpbmcgdGhlIGN1cnJlbnQgdXNlciBkYXRhLmAsXG4gICAgICBmaWVsZHM6ICgpID0+ICh7XG4gICAgICAgIHNlc3Npb25Ub2tlbjogZGVmYXVsdEdyYXBoUUxUeXBlcy5TRVNTSU9OX1RPS0VOX0FUVCxcbiAgICAgICAgdXNlcjoge1xuICAgICAgICAgIGRlc2NyaXB0aW9uOiAnVGhpcyBpcyB0aGUgY3VycmVudCB1c2VyLicsXG4gICAgICAgICAgdHlwZTogbmV3IEdyYXBoUUxOb25OdWxsKGNsYXNzR3JhcGhRTE91dHB1dFR5cGUpLFxuICAgICAgICB9LFxuICAgICAgfSksXG4gICAgfSk7XG4gICAgcGFyc2VHcmFwaFFMU2NoZW1hLmFkZEdyYXBoUUxUeXBlKHZpZXdlclR5cGUsIHRydWUsIHRydWUpO1xuICAgIHBhcnNlR3JhcGhRTFNjaGVtYS52aWV3ZXJUeXBlID0gdmlld2VyVHlwZTtcbiAgfVxufTtcblxuZXhwb3J0IHsgZXh0cmFjdEtleXNBbmRJbmNsdWRlLCBsb2FkIH07XG4iXX0=