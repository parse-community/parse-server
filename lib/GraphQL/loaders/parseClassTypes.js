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
function _getRequireWildcardCache(nodeInterop) { if (typeof WeakMap !== "function") return null; var cacheBabelInterop = new WeakMap(); var cacheNodeInterop = new WeakMap(); return (_getRequireWildcardCache = function (nodeInterop) { return nodeInterop ? cacheNodeInterop : cacheBabelInterop; })(nodeInterop); }
function _interopRequireWildcard(obj, nodeInterop) { if (!nodeInterop && obj && obj.__esModule) { return obj; } if (obj === null || typeof obj !== "object" && typeof obj !== "function") { return { default: obj }; } var cache = _getRequireWildcardCache(nodeInterop); if (cache && cache.has(obj)) { return cache.get(obj); } var newObj = {}; var hasPropertyDescriptor = Object.defineProperty && Object.getOwnPropertyDescriptor; for (var key in obj) { if (key !== "default" && Object.prototype.hasOwnProperty.call(obj, key)) { var desc = hasPropertyDescriptor ? Object.getOwnPropertyDescriptor(obj, key) : null; if (desc && (desc.get || desc.set)) { Object.defineProperty(newObj, key, desc); } else { newObj[key] = obj[key]; } } } newObj.default = obj; if (cache) { cache.set(obj, newObj); } return newObj; }
function _interopRequireDefault(obj) { return obj && obj.__esModule ? obj : { default: obj }; }
function ownKeys(object, enumerableOnly) { var keys = Object.keys(object); if (Object.getOwnPropertySymbols) { var symbols = Object.getOwnPropertySymbols(object); enumerableOnly && (symbols = symbols.filter(function (sym) { return Object.getOwnPropertyDescriptor(object, sym).enumerable; })), keys.push.apply(keys, symbols); } return keys; }
function _objectSpread(target) { for (var i = 1; i < arguments.length; i++) { var source = null != arguments[i] ? arguments[i] : {}; i % 2 ? ownKeys(Object(source), !0).forEach(function (key) { _defineProperty(target, key, source[key]); }) : Object.getOwnPropertyDescriptors ? Object.defineProperties(target, Object.getOwnPropertyDescriptors(source)) : ownKeys(Object(source)).forEach(function (key) { Object.defineProperty(target, key, Object.getOwnPropertyDescriptor(source, key)); }); } return target; }
function _defineProperty(obj, key, value) { key = _toPropertyKey(key); if (key in obj) { Object.defineProperty(obj, key, { value: value, enumerable: true, configurable: true, writable: true }); } else { obj[key] = value; } return obj; }
function _toPropertyKey(arg) { var key = _toPrimitive(arg, "string"); return typeof key === "symbol" ? key : String(key); }
function _toPrimitive(input, hint) { if (typeof input !== "object" || input === null) return input; var prim = input[Symbol.toPrimitive]; if (prim !== undefined) { var res = prim.call(input, hint || "default"); if (typeof res !== "object") return res; throw new TypeError("@@toPrimitive must return a primitive value."); } return (hint === "string" ? String : Number)(input); } /* eslint-disable indent */
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
  let classSortFields;

  // All allowed customs fields
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
  }
  // Filters the "password" field from class _User
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
            type: parseClass.fields[field].required ? new _graphql.GraphQLNonNull(type) : type
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
  const parseObjectFields = _objectSpread(_objectSpread({
    id: (0, _graphqlRelay.globalIdField)(className, obj => obj.objectId)
  }, defaultGraphQLTypes.PARSE_OBJECT_FIELDS), className === '_User' ? {
    authDataResponse: {
      description: `auth provider response when triggered on signUp/logIn.`,
      type: defaultGraphQLTypes.OBJECT
    }
  } : {});
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
                } = (0, _parseGraphQLUtils.extractKeysAndInclude)(selectedFields.filter(field => field.startsWith('edges.node.')).map(field => field.replace('edges.node.', '')).filter(field => field.indexOf('edges.node') < 0));
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
//# sourceMappingURL=data:application/json;charset=utf-8;base64,eyJ2ZXJzaW9uIjozLCJuYW1lcyI6WyJfZ3JhcGhxbCIsInJlcXVpcmUiLCJfZ3JhcGhxbFJlbGF5IiwiX2dyYXBocWxMaXN0RmllbGRzIiwiX2ludGVyb3BSZXF1aXJlRGVmYXVsdCIsImRlZmF1bHRHcmFwaFFMVHlwZXMiLCJfaW50ZXJvcFJlcXVpcmVXaWxkY2FyZCIsIm9iamVjdHNRdWVyaWVzIiwiX1BhcnNlR3JhcGhRTENvbnRyb2xsZXIiLCJfY2xhc3NOYW1lIiwiX2lucHV0VHlwZSIsIl9vdXRwdXRUeXBlIiwiX2NvbnN0cmFpbnRUeXBlIiwiX3BhcnNlR3JhcGhRTFV0aWxzIiwiX2dldFJlcXVpcmVXaWxkY2FyZENhY2hlIiwibm9kZUludGVyb3AiLCJXZWFrTWFwIiwiY2FjaGVCYWJlbEludGVyb3AiLCJjYWNoZU5vZGVJbnRlcm9wIiwib2JqIiwiX19lc01vZHVsZSIsImRlZmF1bHQiLCJjYWNoZSIsImhhcyIsImdldCIsIm5ld09iaiIsImhhc1Byb3BlcnR5RGVzY3JpcHRvciIsIk9iamVjdCIsImRlZmluZVByb3BlcnR5IiwiZ2V0T3duUHJvcGVydHlEZXNjcmlwdG9yIiwia2V5IiwicHJvdG90eXBlIiwiaGFzT3duUHJvcGVydHkiLCJjYWxsIiwiZGVzYyIsInNldCIsIm93bktleXMiLCJvYmplY3QiLCJlbnVtZXJhYmxlT25seSIsImtleXMiLCJnZXRPd25Qcm9wZXJ0eVN5bWJvbHMiLCJzeW1ib2xzIiwiZmlsdGVyIiwic3ltIiwiZW51bWVyYWJsZSIsInB1c2giLCJhcHBseSIsIl9vYmplY3RTcHJlYWQiLCJ0YXJnZXQiLCJpIiwiYXJndW1lbnRzIiwibGVuZ3RoIiwic291cmNlIiwiZm9yRWFjaCIsIl9kZWZpbmVQcm9wZXJ0eSIsImdldE93blByb3BlcnR5RGVzY3JpcHRvcnMiLCJkZWZpbmVQcm9wZXJ0aWVzIiwidmFsdWUiLCJfdG9Qcm9wZXJ0eUtleSIsImNvbmZpZ3VyYWJsZSIsIndyaXRhYmxlIiwiYXJnIiwiX3RvUHJpbWl0aXZlIiwiU3RyaW5nIiwiaW5wdXQiLCJoaW50IiwicHJpbSIsIlN5bWJvbCIsInRvUHJpbWl0aXZlIiwidW5kZWZpbmVkIiwicmVzIiwiVHlwZUVycm9yIiwiTnVtYmVyIiwiZ2V0UGFyc2VDbGFzc1R5cGVDb25maWciLCJwYXJzZUNsYXNzQ29uZmlnIiwidHlwZSIsImdldElucHV0RmllbGRzQW5kQ29uc3RyYWludHMiLCJwYXJzZUNsYXNzIiwiY2xhc3NGaWVsZHMiLCJmaWVsZHMiLCJjb25jYXQiLCJpbnB1dEZpZWxkcyIsImFsbG93ZWRJbnB1dEZpZWxkcyIsIm91dHB1dEZpZWxkcyIsImFsbG93ZWRPdXRwdXRGaWVsZHMiLCJjb25zdHJhaW50RmllbGRzIiwiYWxsb3dlZENvbnN0cmFpbnRGaWVsZHMiLCJzb3J0RmllbGRzIiwiYWxsb3dlZFNvcnRGaWVsZHMiLCJjbGFzc091dHB1dEZpZWxkcyIsImNsYXNzQ3JlYXRlRmllbGRzIiwiY2xhc3NVcGRhdGVGaWVsZHMiLCJjbGFzc0NvbnN0cmFpbnRGaWVsZHMiLCJjbGFzc1NvcnRGaWVsZHMiLCJjbGFzc0N1c3RvbUZpZWxkcyIsImZpZWxkIiwiUEFSU0VfT0JKRUNUX0ZJRUxEUyIsImluY2x1ZGVzIiwiY3JlYXRlIiwidXBkYXRlIiwiY2xhc3NOYW1lIiwib3V0cHV0RmllbGQiLCJhc2MiLCJtYXAiLCJsb2FkIiwicGFyc2VHcmFwaFFMU2NoZW1hIiwiZ3JhcGhRTENsYXNzTmFtZSIsInRyYW5zZm9ybUNsYXNzTmFtZVRvR3JhcGhRTCIsImlzQ3JlYXRlRW5hYmxlZCIsImlzVXBkYXRlRW5hYmxlZCIsImdldFBhcnNlQ2xhc3NNdXRhdGlvbkNvbmZpZyIsImNsYXNzR3JhcGhRTENyZWF0ZVR5cGVOYW1lIiwiY2xhc3NHcmFwaFFMQ3JlYXRlVHlwZSIsIkdyYXBoUUxJbnB1dE9iamVjdFR5cGUiLCJuYW1lIiwiZGVzY3JpcHRpb24iLCJyZWR1Y2UiLCJ0cmFuc2Zvcm1JbnB1dFR5cGVUb0dyYXBoUUwiLCJ0YXJnZXRDbGFzcyIsInBhcnNlQ2xhc3NUeXBlcyIsInJlcXVpcmVkIiwiR3JhcGhRTE5vbk51bGwiLCJBQ0wiLCJBQ0xfSU5QVVQiLCJhZGRHcmFwaFFMVHlwZSIsImNsYXNzR3JhcGhRTFVwZGF0ZVR5cGVOYW1lIiwiY2xhc3NHcmFwaFFMVXBkYXRlVHlwZSIsImNsYXNzR3JhcGhRTFBvaW50ZXJUeXBlTmFtZSIsImNsYXNzR3JhcGhRTFBvaW50ZXJUeXBlIiwibGluayIsIkdyYXBoUUxJRCIsIk9CSkVDVCIsImNsYXNzR3JhcGhRTFJlbGF0aW9uVHlwZU5hbWUiLCJjbGFzc0dyYXBoUUxSZWxhdGlvblR5cGUiLCJhZGQiLCJHcmFwaFFMTGlzdCIsIk9CSkVDVF9JRCIsInJlbW92ZSIsImNsYXNzR3JhcGhRTENvbnN0cmFpbnRzVHlwZU5hbWUiLCJjbGFzc0dyYXBoUUxDb25zdHJhaW50c1R5cGUiLCJsb2ciLCJ3YXJuIiwicGFyc2VGaWVsZCIsInRyYW5zZm9ybUNvbnN0cmFpbnRUeXBlVG9HcmFwaFFMIiwiT1IiLCJBTkQiLCJOT1IiLCJjbGFzc0dyYXBoUUxSZWxhdGlvbkNvbnN0cmFpbnRzVHlwZU5hbWUiLCJjbGFzc0dyYXBoUUxSZWxhdGlvbkNvbnN0cmFpbnRzVHlwZSIsImhhdmUiLCJoYXZlTm90IiwiZXhpc3RzIiwiR3JhcGhRTEJvb2xlYW4iLCJjbGFzc0dyYXBoUUxPcmRlclR5cGVOYW1lIiwiY2xhc3NHcmFwaFFMT3JkZXJUeXBlIiwiR3JhcGhRTEVudW1UeXBlIiwidmFsdWVzIiwiZmllbGRDb25maWciLCJ1cGRhdGVkU29ydEZpZWxkcyIsImNsYXNzR3JhcGhRTEZpbmRBcmdzIiwid2hlcmUiLCJvcmRlciIsIkdyYXBoUUxTdHJpbmciLCJza2lwIiwiU0tJUF9BVFQiLCJjb25uZWN0aW9uQXJncyIsIm9wdGlvbnMiLCJSRUFEX09QVElPTlNfQVRUIiwiY2xhc3NHcmFwaFFMT3V0cHV0VHlwZU5hbWUiLCJpbnRlcmZhY2VzIiwiUEFSU0VfT0JKRUNUIiwicmVsYXlOb2RlSW50ZXJmYWNlIiwicGFyc2VPYmplY3RGaWVsZHMiLCJpZCIsImdsb2JhbElkRmllbGQiLCJvYmplY3RJZCIsImF1dGhEYXRhUmVzcG9uc2UiLCJ0cmFuc2Zvcm1PdXRwdXRUeXBlVG9HcmFwaFFMIiwidGFyZ2V0UGFyc2VDbGFzc1R5cGVzIiwiYXJncyIsInJlc29sdmUiLCJjb250ZXh0IiwicXVlcnlJbmZvIiwiZmlyc3QiLCJhZnRlciIsImxhc3QiLCJiZWZvcmUiLCJyZWFkUHJlZmVyZW5jZSIsImluY2x1ZGVSZWFkUHJlZmVyZW5jZSIsInN1YnF1ZXJ5UmVhZFByZWZlcmVuY2UiLCJjb25maWciLCJhdXRoIiwiaW5mbyIsInNlbGVjdGVkRmllbGRzIiwiZ2V0RmllbGROYW1lcyIsImluY2x1ZGUiLCJleHRyYWN0S2V5c0FuZEluY2x1ZGUiLCJzdGFydHNXaXRoIiwicmVwbGFjZSIsImluZGV4T2YiLCJwYXJzZU9yZGVyIiwiam9pbiIsImZpbmRPYmplY3RzIiwiJHJlbGF0ZWRUbyIsIl9fdHlwZSIsInBhcnNlQ2xhc3NlcyIsImUiLCJoYW5kbGVFcnJvciIsImNvb3JkaW5hdGVzIiwiY29vcmRpbmF0ZSIsImxhdGl0dWRlIiwibG9uZ2l0dWRlIiwiZWxlbSIsImNsYXNzR3JhcGhRTE91dHB1dFR5cGUiLCJHcmFwaFFMT2JqZWN0VHlwZSIsImNvbm5lY3Rpb25UeXBlIiwiZWRnZVR5cGUiLCJjb25uZWN0aW9uRGVmaW5pdGlvbnMiLCJjb25uZWN0aW9uRmllbGRzIiwiY291bnQiLCJDT1VOVF9BVFQiLCJub2RlVHlwZSIsImNsYXNzR3JhcGhRTEZpbmRSZXN1bHRUeXBlIiwidmlld2VyVHlwZSIsInNlc3Npb25Ub2tlbiIsIlNFU1NJT05fVE9LRU5fQVRUIiwidXNlciIsImV4cG9ydHMiXSwic291cmNlcyI6WyIuLi8uLi8uLi9zcmMvR3JhcGhRTC9sb2FkZXJzL3BhcnNlQ2xhc3NUeXBlcy5qcyJdLCJzb3VyY2VzQ29udGVudCI6WyIvKiBlc2xpbnQtZGlzYWJsZSBpbmRlbnQgKi9cbmltcG9ydCB7XG4gIEdyYXBoUUxJRCxcbiAgR3JhcGhRTE9iamVjdFR5cGUsXG4gIEdyYXBoUUxTdHJpbmcsXG4gIEdyYXBoUUxMaXN0LFxuICBHcmFwaFFMSW5wdXRPYmplY3RUeXBlLFxuICBHcmFwaFFMTm9uTnVsbCxcbiAgR3JhcGhRTEJvb2xlYW4sXG4gIEdyYXBoUUxFbnVtVHlwZSxcbn0gZnJvbSAnZ3JhcGhxbCc7XG5pbXBvcnQgeyBnbG9iYWxJZEZpZWxkLCBjb25uZWN0aW9uQXJncywgY29ubmVjdGlvbkRlZmluaXRpb25zIH0gZnJvbSAnZ3JhcGhxbC1yZWxheSc7XG5pbXBvcnQgZ2V0RmllbGROYW1lcyBmcm9tICdncmFwaHFsLWxpc3QtZmllbGRzJztcbmltcG9ydCAqIGFzIGRlZmF1bHRHcmFwaFFMVHlwZXMgZnJvbSAnLi9kZWZhdWx0R3JhcGhRTFR5cGVzJztcbmltcG9ydCAqIGFzIG9iamVjdHNRdWVyaWVzIGZyb20gJy4uL2hlbHBlcnMvb2JqZWN0c1F1ZXJpZXMnO1xuaW1wb3J0IHsgUGFyc2VHcmFwaFFMQ2xhc3NDb25maWcgfSBmcm9tICcuLi8uLi9Db250cm9sbGVycy9QYXJzZUdyYXBoUUxDb250cm9sbGVyJztcbmltcG9ydCB7IHRyYW5zZm9ybUNsYXNzTmFtZVRvR3JhcGhRTCB9IGZyb20gJy4uL3RyYW5zZm9ybWVycy9jbGFzc05hbWUnO1xuaW1wb3J0IHsgdHJhbnNmb3JtSW5wdXRUeXBlVG9HcmFwaFFMIH0gZnJvbSAnLi4vdHJhbnNmb3JtZXJzL2lucHV0VHlwZSc7XG5pbXBvcnQgeyB0cmFuc2Zvcm1PdXRwdXRUeXBlVG9HcmFwaFFMIH0gZnJvbSAnLi4vdHJhbnNmb3JtZXJzL291dHB1dFR5cGUnO1xuaW1wb3J0IHsgdHJhbnNmb3JtQ29uc3RyYWludFR5cGVUb0dyYXBoUUwgfSBmcm9tICcuLi90cmFuc2Zvcm1lcnMvY29uc3RyYWludFR5cGUnO1xuaW1wb3J0IHsgZXh0cmFjdEtleXNBbmRJbmNsdWRlLCBnZXRQYXJzZUNsYXNzTXV0YXRpb25Db25maWcgfSBmcm9tICcuLi9wYXJzZUdyYXBoUUxVdGlscyc7XG5cbmNvbnN0IGdldFBhcnNlQ2xhc3NUeXBlQ29uZmlnID0gZnVuY3Rpb24gKHBhcnNlQ2xhc3NDb25maWc6ID9QYXJzZUdyYXBoUUxDbGFzc0NvbmZpZykge1xuICByZXR1cm4gKHBhcnNlQ2xhc3NDb25maWcgJiYgcGFyc2VDbGFzc0NvbmZpZy50eXBlKSB8fCB7fTtcbn07XG5cbmNvbnN0IGdldElucHV0RmllbGRzQW5kQ29uc3RyYWludHMgPSBmdW5jdGlvbiAoXG4gIHBhcnNlQ2xhc3MsXG4gIHBhcnNlQ2xhc3NDb25maWc6ID9QYXJzZUdyYXBoUUxDbGFzc0NvbmZpZ1xuKSB7XG4gIGNvbnN0IGNsYXNzRmllbGRzID0gT2JqZWN0LmtleXMocGFyc2VDbGFzcy5maWVsZHMpLmNvbmNhdCgnaWQnKTtcbiAgY29uc3Qge1xuICAgIGlucHV0RmllbGRzOiBhbGxvd2VkSW5wdXRGaWVsZHMsXG4gICAgb3V0cHV0RmllbGRzOiBhbGxvd2VkT3V0cHV0RmllbGRzLFxuICAgIGNvbnN0cmFpbnRGaWVsZHM6IGFsbG93ZWRDb25zdHJhaW50RmllbGRzLFxuICAgIHNvcnRGaWVsZHM6IGFsbG93ZWRTb3J0RmllbGRzLFxuICB9ID0gZ2V0UGFyc2VDbGFzc1R5cGVDb25maWcocGFyc2VDbGFzc0NvbmZpZyk7XG5cbiAgbGV0IGNsYXNzT3V0cHV0RmllbGRzO1xuICBsZXQgY2xhc3NDcmVhdGVGaWVsZHM7XG4gIGxldCBjbGFzc1VwZGF0ZUZpZWxkcztcbiAgbGV0IGNsYXNzQ29uc3RyYWludEZpZWxkcztcbiAgbGV0IGNsYXNzU29ydEZpZWxkcztcblxuICAvLyBBbGwgYWxsb3dlZCBjdXN0b21zIGZpZWxkc1xuICBjb25zdCBjbGFzc0N1c3RvbUZpZWxkcyA9IGNsYXNzRmllbGRzLmZpbHRlcihmaWVsZCA9PiB7XG4gICAgcmV0dXJuICFPYmplY3Qua2V5cyhkZWZhdWx0R3JhcGhRTFR5cGVzLlBBUlNFX09CSkVDVF9GSUVMRFMpLmluY2x1ZGVzKGZpZWxkKSAmJiBmaWVsZCAhPT0gJ2lkJztcbiAgfSk7XG5cbiAgaWYgKGFsbG93ZWRJbnB1dEZpZWxkcyAmJiBhbGxvd2VkSW5wdXRGaWVsZHMuY3JlYXRlKSB7XG4gICAgY2xhc3NDcmVhdGVGaWVsZHMgPSBjbGFzc0N1c3RvbUZpZWxkcy5maWx0ZXIoZmllbGQgPT4ge1xuICAgICAgcmV0dXJuIGFsbG93ZWRJbnB1dEZpZWxkcy5jcmVhdGUuaW5jbHVkZXMoZmllbGQpO1xuICAgIH0pO1xuICB9IGVsc2Uge1xuICAgIGNsYXNzQ3JlYXRlRmllbGRzID0gY2xhc3NDdXN0b21GaWVsZHM7XG4gIH1cbiAgaWYgKGFsbG93ZWRJbnB1dEZpZWxkcyAmJiBhbGxvd2VkSW5wdXRGaWVsZHMudXBkYXRlKSB7XG4gICAgY2xhc3NVcGRhdGVGaWVsZHMgPSBjbGFzc0N1c3RvbUZpZWxkcy5maWx0ZXIoZmllbGQgPT4ge1xuICAgICAgcmV0dXJuIGFsbG93ZWRJbnB1dEZpZWxkcy51cGRhdGUuaW5jbHVkZXMoZmllbGQpO1xuICAgIH0pO1xuICB9IGVsc2Uge1xuICAgIGNsYXNzVXBkYXRlRmllbGRzID0gY2xhc3NDdXN0b21GaWVsZHM7XG4gIH1cblxuICBpZiAoYWxsb3dlZE91dHB1dEZpZWxkcykge1xuICAgIGNsYXNzT3V0cHV0RmllbGRzID0gY2xhc3NDdXN0b21GaWVsZHMuZmlsdGVyKGZpZWxkID0+IHtcbiAgICAgIHJldHVybiBhbGxvd2VkT3V0cHV0RmllbGRzLmluY2x1ZGVzKGZpZWxkKTtcbiAgICB9KTtcbiAgfSBlbHNlIHtcbiAgICBjbGFzc091dHB1dEZpZWxkcyA9IGNsYXNzQ3VzdG9tRmllbGRzO1xuICB9XG4gIC8vIEZpbHRlcnMgdGhlIFwicGFzc3dvcmRcIiBmaWVsZCBmcm9tIGNsYXNzIF9Vc2VyXG4gIGlmIChwYXJzZUNsYXNzLmNsYXNzTmFtZSA9PT0gJ19Vc2VyJykge1xuICAgIGNsYXNzT3V0cHV0RmllbGRzID0gY2xhc3NPdXRwdXRGaWVsZHMuZmlsdGVyKG91dHB1dEZpZWxkID0+IG91dHB1dEZpZWxkICE9PSAncGFzc3dvcmQnKTtcbiAgfVxuXG4gIGlmIChhbGxvd2VkQ29uc3RyYWludEZpZWxkcykge1xuICAgIGNsYXNzQ29uc3RyYWludEZpZWxkcyA9IGNsYXNzQ3VzdG9tRmllbGRzLmZpbHRlcihmaWVsZCA9PiB7XG4gICAgICByZXR1cm4gYWxsb3dlZENvbnN0cmFpbnRGaWVsZHMuaW5jbHVkZXMoZmllbGQpO1xuICAgIH0pO1xuICB9IGVsc2Uge1xuICAgIGNsYXNzQ29uc3RyYWludEZpZWxkcyA9IGNsYXNzRmllbGRzO1xuICB9XG5cbiAgaWYgKGFsbG93ZWRTb3J0RmllbGRzKSB7XG4gICAgY2xhc3NTb3J0RmllbGRzID0gYWxsb3dlZFNvcnRGaWVsZHM7XG4gICAgaWYgKCFjbGFzc1NvcnRGaWVsZHMubGVuZ3RoKSB7XG4gICAgICAvLyBtdXN0IGhhdmUgYXQgbGVhc3QgMSBvcmRlciBmaWVsZFxuICAgICAgLy8gb3RoZXJ3aXNlIHRoZSBGaW5kQXJncyBJbnB1dCBUeXBlIHdpbGwgdGhyb3cuXG4gICAgICBjbGFzc1NvcnRGaWVsZHMucHVzaCh7XG4gICAgICAgIGZpZWxkOiAnaWQnLFxuICAgICAgICBhc2M6IHRydWUsXG4gICAgICAgIGRlc2M6IHRydWUsXG4gICAgICB9KTtcbiAgICB9XG4gIH0gZWxzZSB7XG4gICAgY2xhc3NTb3J0RmllbGRzID0gY2xhc3NGaWVsZHMubWFwKGZpZWxkID0+IHtcbiAgICAgIHJldHVybiB7IGZpZWxkLCBhc2M6IHRydWUsIGRlc2M6IHRydWUgfTtcbiAgICB9KTtcbiAgfVxuXG4gIHJldHVybiB7XG4gICAgY2xhc3NDcmVhdGVGaWVsZHMsXG4gICAgY2xhc3NVcGRhdGVGaWVsZHMsXG4gICAgY2xhc3NDb25zdHJhaW50RmllbGRzLFxuICAgIGNsYXNzT3V0cHV0RmllbGRzLFxuICAgIGNsYXNzU29ydEZpZWxkcyxcbiAgfTtcbn07XG5cbmNvbnN0IGxvYWQgPSAocGFyc2VHcmFwaFFMU2NoZW1hLCBwYXJzZUNsYXNzLCBwYXJzZUNsYXNzQ29uZmlnOiA/UGFyc2VHcmFwaFFMQ2xhc3NDb25maWcpID0+IHtcbiAgY29uc3QgY2xhc3NOYW1lID0gcGFyc2VDbGFzcy5jbGFzc05hbWU7XG4gIGNvbnN0IGdyYXBoUUxDbGFzc05hbWUgPSB0cmFuc2Zvcm1DbGFzc05hbWVUb0dyYXBoUUwoY2xhc3NOYW1lKTtcbiAgY29uc3Qge1xuICAgIGNsYXNzQ3JlYXRlRmllbGRzLFxuICAgIGNsYXNzVXBkYXRlRmllbGRzLFxuICAgIGNsYXNzT3V0cHV0RmllbGRzLFxuICAgIGNsYXNzQ29uc3RyYWludEZpZWxkcyxcbiAgICBjbGFzc1NvcnRGaWVsZHMsXG4gIH0gPSBnZXRJbnB1dEZpZWxkc0FuZENvbnN0cmFpbnRzKHBhcnNlQ2xhc3MsIHBhcnNlQ2xhc3NDb25maWcpO1xuXG4gIGNvbnN0IHtcbiAgICBjcmVhdGU6IGlzQ3JlYXRlRW5hYmxlZCA9IHRydWUsXG4gICAgdXBkYXRlOiBpc1VwZGF0ZUVuYWJsZWQgPSB0cnVlLFxuICB9ID0gZ2V0UGFyc2VDbGFzc011dGF0aW9uQ29uZmlnKHBhcnNlQ2xhc3NDb25maWcpO1xuXG4gIGNvbnN0IGNsYXNzR3JhcGhRTENyZWF0ZVR5cGVOYW1lID0gYENyZWF0ZSR7Z3JhcGhRTENsYXNzTmFtZX1GaWVsZHNJbnB1dGA7XG4gIGxldCBjbGFzc0dyYXBoUUxDcmVhdGVUeXBlID0gbmV3IEdyYXBoUUxJbnB1dE9iamVjdFR5cGUoe1xuICAgIG5hbWU6IGNsYXNzR3JhcGhRTENyZWF0ZVR5cGVOYW1lLFxuICAgIGRlc2NyaXB0aW9uOiBgVGhlICR7Y2xhc3NHcmFwaFFMQ3JlYXRlVHlwZU5hbWV9IGlucHV0IHR5cGUgaXMgdXNlZCBpbiBvcGVyYXRpb25zIHRoYXQgaW52b2x2ZSBjcmVhdGlvbiBvZiBvYmplY3RzIGluIHRoZSAke2dyYXBoUUxDbGFzc05hbWV9IGNsYXNzLmAsXG4gICAgZmllbGRzOiAoKSA9PlxuICAgICAgY2xhc3NDcmVhdGVGaWVsZHMucmVkdWNlKFxuICAgICAgICAoZmllbGRzLCBmaWVsZCkgPT4ge1xuICAgICAgICAgIGNvbnN0IHR5cGUgPSB0cmFuc2Zvcm1JbnB1dFR5cGVUb0dyYXBoUUwoXG4gICAgICAgICAgICBwYXJzZUNsYXNzLmZpZWxkc1tmaWVsZF0udHlwZSxcbiAgICAgICAgICAgIHBhcnNlQ2xhc3MuZmllbGRzW2ZpZWxkXS50YXJnZXRDbGFzcyxcbiAgICAgICAgICAgIHBhcnNlR3JhcGhRTFNjaGVtYS5wYXJzZUNsYXNzVHlwZXNcbiAgICAgICAgICApO1xuICAgICAgICAgIGlmICh0eXBlKSB7XG4gICAgICAgICAgICByZXR1cm4ge1xuICAgICAgICAgICAgICAuLi5maWVsZHMsXG4gICAgICAgICAgICAgIFtmaWVsZF06IHtcbiAgICAgICAgICAgICAgICBkZXNjcmlwdGlvbjogYFRoaXMgaXMgdGhlIG9iamVjdCAke2ZpZWxkfS5gLFxuICAgICAgICAgICAgICAgIHR5cGU6IHBhcnNlQ2xhc3MuZmllbGRzW2ZpZWxkXS5yZXF1aXJlZCA/IG5ldyBHcmFwaFFMTm9uTnVsbCh0eXBlKSA6IHR5cGUsXG4gICAgICAgICAgICAgIH0sXG4gICAgICAgICAgICB9O1xuICAgICAgICAgIH0gZWxzZSB7XG4gICAgICAgICAgICByZXR1cm4gZmllbGRzO1xuICAgICAgICAgIH1cbiAgICAgICAgfSxcbiAgICAgICAge1xuICAgICAgICAgIEFDTDogeyB0eXBlOiBkZWZhdWx0R3JhcGhRTFR5cGVzLkFDTF9JTlBVVCB9LFxuICAgICAgICB9XG4gICAgICApLFxuICB9KTtcbiAgY2xhc3NHcmFwaFFMQ3JlYXRlVHlwZSA9IHBhcnNlR3JhcGhRTFNjaGVtYS5hZGRHcmFwaFFMVHlwZShjbGFzc0dyYXBoUUxDcmVhdGVUeXBlKTtcblxuICBjb25zdCBjbGFzc0dyYXBoUUxVcGRhdGVUeXBlTmFtZSA9IGBVcGRhdGUke2dyYXBoUUxDbGFzc05hbWV9RmllbGRzSW5wdXRgO1xuICBsZXQgY2xhc3NHcmFwaFFMVXBkYXRlVHlwZSA9IG5ldyBHcmFwaFFMSW5wdXRPYmplY3RUeXBlKHtcbiAgICBuYW1lOiBjbGFzc0dyYXBoUUxVcGRhdGVUeXBlTmFtZSxcbiAgICBkZXNjcmlwdGlvbjogYFRoZSAke2NsYXNzR3JhcGhRTFVwZGF0ZVR5cGVOYW1lfSBpbnB1dCB0eXBlIGlzIHVzZWQgaW4gb3BlcmF0aW9ucyB0aGF0IGludm9sdmUgY3JlYXRpb24gb2Ygb2JqZWN0cyBpbiB0aGUgJHtncmFwaFFMQ2xhc3NOYW1lfSBjbGFzcy5gLFxuICAgIGZpZWxkczogKCkgPT5cbiAgICAgIGNsYXNzVXBkYXRlRmllbGRzLnJlZHVjZShcbiAgICAgICAgKGZpZWxkcywgZmllbGQpID0+IHtcbiAgICAgICAgICBjb25zdCB0eXBlID0gdHJhbnNmb3JtSW5wdXRUeXBlVG9HcmFwaFFMKFxuICAgICAgICAgICAgcGFyc2VDbGFzcy5maWVsZHNbZmllbGRdLnR5cGUsXG4gICAgICAgICAgICBwYXJzZUNsYXNzLmZpZWxkc1tmaWVsZF0udGFyZ2V0Q2xhc3MsXG4gICAgICAgICAgICBwYXJzZUdyYXBoUUxTY2hlbWEucGFyc2VDbGFzc1R5cGVzXG4gICAgICAgICAgKTtcbiAgICAgICAgICBpZiAodHlwZSkge1xuICAgICAgICAgICAgcmV0dXJuIHtcbiAgICAgICAgICAgICAgLi4uZmllbGRzLFxuICAgICAgICAgICAgICBbZmllbGRdOiB7XG4gICAgICAgICAgICAgICAgZGVzY3JpcHRpb246IGBUaGlzIGlzIHRoZSBvYmplY3QgJHtmaWVsZH0uYCxcbiAgICAgICAgICAgICAgICB0eXBlLFxuICAgICAgICAgICAgICB9LFxuICAgICAgICAgICAgfTtcbiAgICAgICAgICB9IGVsc2Uge1xuICAgICAgICAgICAgcmV0dXJuIGZpZWxkcztcbiAgICAgICAgICB9XG4gICAgICAgIH0sXG4gICAgICAgIHtcbiAgICAgICAgICBBQ0w6IHsgdHlwZTogZGVmYXVsdEdyYXBoUUxUeXBlcy5BQ0xfSU5QVVQgfSxcbiAgICAgICAgfVxuICAgICAgKSxcbiAgfSk7XG4gIGNsYXNzR3JhcGhRTFVwZGF0ZVR5cGUgPSBwYXJzZUdyYXBoUUxTY2hlbWEuYWRkR3JhcGhRTFR5cGUoY2xhc3NHcmFwaFFMVXBkYXRlVHlwZSk7XG5cbiAgY29uc3QgY2xhc3NHcmFwaFFMUG9pbnRlclR5cGVOYW1lID0gYCR7Z3JhcGhRTENsYXNzTmFtZX1Qb2ludGVySW5wdXRgO1xuICBsZXQgY2xhc3NHcmFwaFFMUG9pbnRlclR5cGUgPSBuZXcgR3JhcGhRTElucHV0T2JqZWN0VHlwZSh7XG4gICAgbmFtZTogY2xhc3NHcmFwaFFMUG9pbnRlclR5cGVOYW1lLFxuICAgIGRlc2NyaXB0aW9uOiBgQWxsb3cgdG8gbGluayBPUiBhZGQgYW5kIGxpbmsgYW4gb2JqZWN0IG9mIHRoZSAke2dyYXBoUUxDbGFzc05hbWV9IGNsYXNzLmAsXG4gICAgZmllbGRzOiAoKSA9PiB7XG4gICAgICBjb25zdCBmaWVsZHMgPSB7XG4gICAgICAgIGxpbms6IHtcbiAgICAgICAgICBkZXNjcmlwdGlvbjogYExpbmsgYW4gZXhpc3Rpbmcgb2JqZWN0IGZyb20gJHtncmFwaFFMQ2xhc3NOYW1lfSBjbGFzcy4gWW91IGNhbiB1c2UgZWl0aGVyIHRoZSBnbG9iYWwgb3IgdGhlIG9iamVjdCBpZC5gLFxuICAgICAgICAgIHR5cGU6IEdyYXBoUUxJRCxcbiAgICAgICAgfSxcbiAgICAgIH07XG4gICAgICBpZiAoaXNDcmVhdGVFbmFibGVkKSB7XG4gICAgICAgIGZpZWxkc1snY3JlYXRlQW5kTGluayddID0ge1xuICAgICAgICAgIGRlc2NyaXB0aW9uOiBgQ3JlYXRlIGFuZCBsaW5rIGFuIG9iamVjdCBmcm9tICR7Z3JhcGhRTENsYXNzTmFtZX0gY2xhc3MuYCxcbiAgICAgICAgICB0eXBlOiBjbGFzc0dyYXBoUUxDcmVhdGVUeXBlLFxuICAgICAgICB9O1xuICAgICAgfVxuICAgICAgcmV0dXJuIGZpZWxkcztcbiAgICB9LFxuICB9KTtcbiAgY2xhc3NHcmFwaFFMUG9pbnRlclR5cGUgPVxuICAgIHBhcnNlR3JhcGhRTFNjaGVtYS5hZGRHcmFwaFFMVHlwZShjbGFzc0dyYXBoUUxQb2ludGVyVHlwZSkgfHwgZGVmYXVsdEdyYXBoUUxUeXBlcy5PQkpFQ1Q7XG5cbiAgY29uc3QgY2xhc3NHcmFwaFFMUmVsYXRpb25UeXBlTmFtZSA9IGAke2dyYXBoUUxDbGFzc05hbWV9UmVsYXRpb25JbnB1dGA7XG4gIGxldCBjbGFzc0dyYXBoUUxSZWxhdGlvblR5cGUgPSBuZXcgR3JhcGhRTElucHV0T2JqZWN0VHlwZSh7XG4gICAgbmFtZTogY2xhc3NHcmFwaFFMUmVsYXRpb25UeXBlTmFtZSxcbiAgICBkZXNjcmlwdGlvbjogYEFsbG93IHRvIGFkZCwgcmVtb3ZlLCBjcmVhdGVBbmRBZGQgb2JqZWN0cyBvZiB0aGUgJHtncmFwaFFMQ2xhc3NOYW1lfSBjbGFzcyBpbnRvIGEgcmVsYXRpb24gZmllbGQuYCxcbiAgICBmaWVsZHM6ICgpID0+IHtcbiAgICAgIGNvbnN0IGZpZWxkcyA9IHtcbiAgICAgICAgYWRkOiB7XG4gICAgICAgICAgZGVzY3JpcHRpb246IGBBZGQgZXhpc3Rpbmcgb2JqZWN0cyBmcm9tIHRoZSAke2dyYXBoUUxDbGFzc05hbWV9IGNsYXNzIGludG8gdGhlIHJlbGF0aW9uLiBZb3UgY2FuIHVzZSBlaXRoZXIgdGhlIGdsb2JhbCBvciB0aGUgb2JqZWN0IGlkcy5gLFxuICAgICAgICAgIHR5cGU6IG5ldyBHcmFwaFFMTGlzdChkZWZhdWx0R3JhcGhRTFR5cGVzLk9CSkVDVF9JRCksXG4gICAgICAgIH0sXG4gICAgICAgIHJlbW92ZToge1xuICAgICAgICAgIGRlc2NyaXB0aW9uOiBgUmVtb3ZlIGV4aXN0aW5nIG9iamVjdHMgZnJvbSB0aGUgJHtncmFwaFFMQ2xhc3NOYW1lfSBjbGFzcyBvdXQgb2YgdGhlIHJlbGF0aW9uLiBZb3UgY2FuIHVzZSBlaXRoZXIgdGhlIGdsb2JhbCBvciB0aGUgb2JqZWN0IGlkcy5gLFxuICAgICAgICAgIHR5cGU6IG5ldyBHcmFwaFFMTGlzdChkZWZhdWx0R3JhcGhRTFR5cGVzLk9CSkVDVF9JRCksXG4gICAgICAgIH0sXG4gICAgICB9O1xuICAgICAgaWYgKGlzQ3JlYXRlRW5hYmxlZCkge1xuICAgICAgICBmaWVsZHNbJ2NyZWF0ZUFuZEFkZCddID0ge1xuICAgICAgICAgIGRlc2NyaXB0aW9uOiBgQ3JlYXRlIGFuZCBhZGQgb2JqZWN0cyBvZiB0aGUgJHtncmFwaFFMQ2xhc3NOYW1lfSBjbGFzcyBpbnRvIHRoZSByZWxhdGlvbi5gLFxuICAgICAgICAgIHR5cGU6IG5ldyBHcmFwaFFMTGlzdChuZXcgR3JhcGhRTE5vbk51bGwoY2xhc3NHcmFwaFFMQ3JlYXRlVHlwZSkpLFxuICAgICAgICB9O1xuICAgICAgfVxuICAgICAgcmV0dXJuIGZpZWxkcztcbiAgICB9LFxuICB9KTtcbiAgY2xhc3NHcmFwaFFMUmVsYXRpb25UeXBlID1cbiAgICBwYXJzZUdyYXBoUUxTY2hlbWEuYWRkR3JhcGhRTFR5cGUoY2xhc3NHcmFwaFFMUmVsYXRpb25UeXBlKSB8fCBkZWZhdWx0R3JhcGhRTFR5cGVzLk9CSkVDVDtcblxuICBjb25zdCBjbGFzc0dyYXBoUUxDb25zdHJhaW50c1R5cGVOYW1lID0gYCR7Z3JhcGhRTENsYXNzTmFtZX1XaGVyZUlucHV0YDtcbiAgbGV0IGNsYXNzR3JhcGhRTENvbnN0cmFpbnRzVHlwZSA9IG5ldyBHcmFwaFFMSW5wdXRPYmplY3RUeXBlKHtcbiAgICBuYW1lOiBjbGFzc0dyYXBoUUxDb25zdHJhaW50c1R5cGVOYW1lLFxuICAgIGRlc2NyaXB0aW9uOiBgVGhlICR7Y2xhc3NHcmFwaFFMQ29uc3RyYWludHNUeXBlTmFtZX0gaW5wdXQgdHlwZSBpcyB1c2VkIGluIG9wZXJhdGlvbnMgdGhhdCBpbnZvbHZlIGZpbHRlcmluZyBvYmplY3RzIG9mICR7Z3JhcGhRTENsYXNzTmFtZX0gY2xhc3MuYCxcbiAgICBmaWVsZHM6ICgpID0+ICh7XG4gICAgICAuLi5jbGFzc0NvbnN0cmFpbnRGaWVsZHMucmVkdWNlKChmaWVsZHMsIGZpZWxkKSA9PiB7XG4gICAgICAgIGlmIChbJ09SJywgJ0FORCcsICdOT1InXS5pbmNsdWRlcyhmaWVsZCkpIHtcbiAgICAgICAgICBwYXJzZUdyYXBoUUxTY2hlbWEubG9nLndhcm4oXG4gICAgICAgICAgICBgRmllbGQgJHtmaWVsZH0gY291bGQgbm90IGJlIGFkZGVkIHRvIHRoZSBhdXRvIHNjaGVtYSAke2NsYXNzR3JhcGhRTENvbnN0cmFpbnRzVHlwZU5hbWV9IGJlY2F1c2UgaXQgY29sbGlkZWQgd2l0aCBhbiBleGlzdGluZyBvbmUuYFxuICAgICAgICAgICk7XG4gICAgICAgICAgcmV0dXJuIGZpZWxkcztcbiAgICAgICAgfVxuICAgICAgICBjb25zdCBwYXJzZUZpZWxkID0gZmllbGQgPT09ICdpZCcgPyAnb2JqZWN0SWQnIDogZmllbGQ7XG4gICAgICAgIGNvbnN0IHR5cGUgPSB0cmFuc2Zvcm1Db25zdHJhaW50VHlwZVRvR3JhcGhRTChcbiAgICAgICAgICBwYXJzZUNsYXNzLmZpZWxkc1twYXJzZUZpZWxkXS50eXBlLFxuICAgICAgICAgIHBhcnNlQ2xhc3MuZmllbGRzW3BhcnNlRmllbGRdLnRhcmdldENsYXNzLFxuICAgICAgICAgIHBhcnNlR3JhcGhRTFNjaGVtYS5wYXJzZUNsYXNzVHlwZXMsXG4gICAgICAgICAgZmllbGRcbiAgICAgICAgKTtcbiAgICAgICAgaWYgKHR5cGUpIHtcbiAgICAgICAgICByZXR1cm4ge1xuICAgICAgICAgICAgLi4uZmllbGRzLFxuICAgICAgICAgICAgW2ZpZWxkXToge1xuICAgICAgICAgICAgICBkZXNjcmlwdGlvbjogYFRoaXMgaXMgdGhlIG9iamVjdCAke2ZpZWxkfS5gLFxuICAgICAgICAgICAgICB0eXBlLFxuICAgICAgICAgICAgfSxcbiAgICAgICAgICB9O1xuICAgICAgICB9IGVsc2Uge1xuICAgICAgICAgIHJldHVybiBmaWVsZHM7XG4gICAgICAgIH1cbiAgICAgIH0sIHt9KSxcbiAgICAgIE9SOiB7XG4gICAgICAgIGRlc2NyaXB0aW9uOiAnVGhpcyBpcyB0aGUgT1Igb3BlcmF0b3IgdG8gY29tcG91bmQgY29uc3RyYWludHMuJyxcbiAgICAgICAgdHlwZTogbmV3IEdyYXBoUUxMaXN0KG5ldyBHcmFwaFFMTm9uTnVsbChjbGFzc0dyYXBoUUxDb25zdHJhaW50c1R5cGUpKSxcbiAgICAgIH0sXG4gICAgICBBTkQ6IHtcbiAgICAgICAgZGVzY3JpcHRpb246ICdUaGlzIGlzIHRoZSBBTkQgb3BlcmF0b3IgdG8gY29tcG91bmQgY29uc3RyYWludHMuJyxcbiAgICAgICAgdHlwZTogbmV3IEdyYXBoUUxMaXN0KG5ldyBHcmFwaFFMTm9uTnVsbChjbGFzc0dyYXBoUUxDb25zdHJhaW50c1R5cGUpKSxcbiAgICAgIH0sXG4gICAgICBOT1I6IHtcbiAgICAgICAgZGVzY3JpcHRpb246ICdUaGlzIGlzIHRoZSBOT1Igb3BlcmF0b3IgdG8gY29tcG91bmQgY29uc3RyYWludHMuJyxcbiAgICAgICAgdHlwZTogbmV3IEdyYXBoUUxMaXN0KG5ldyBHcmFwaFFMTm9uTnVsbChjbGFzc0dyYXBoUUxDb25zdHJhaW50c1R5cGUpKSxcbiAgICAgIH0sXG4gICAgfSksXG4gIH0pO1xuICBjbGFzc0dyYXBoUUxDb25zdHJhaW50c1R5cGUgPVxuICAgIHBhcnNlR3JhcGhRTFNjaGVtYS5hZGRHcmFwaFFMVHlwZShjbGFzc0dyYXBoUUxDb25zdHJhaW50c1R5cGUpIHx8IGRlZmF1bHRHcmFwaFFMVHlwZXMuT0JKRUNUO1xuXG4gIGNvbnN0IGNsYXNzR3JhcGhRTFJlbGF0aW9uQ29uc3RyYWludHNUeXBlTmFtZSA9IGAke2dyYXBoUUxDbGFzc05hbWV9UmVsYXRpb25XaGVyZUlucHV0YDtcbiAgbGV0IGNsYXNzR3JhcGhRTFJlbGF0aW9uQ29uc3RyYWludHNUeXBlID0gbmV3IEdyYXBoUUxJbnB1dE9iamVjdFR5cGUoe1xuICAgIG5hbWU6IGNsYXNzR3JhcGhRTFJlbGF0aW9uQ29uc3RyYWludHNUeXBlTmFtZSxcbiAgICBkZXNjcmlwdGlvbjogYFRoZSAke2NsYXNzR3JhcGhRTFJlbGF0aW9uQ29uc3RyYWludHNUeXBlTmFtZX0gaW5wdXQgdHlwZSBpcyB1c2VkIGluIG9wZXJhdGlvbnMgdGhhdCBpbnZvbHZlIGZpbHRlcmluZyBvYmplY3RzIG9mICR7Z3JhcGhRTENsYXNzTmFtZX0gY2xhc3MuYCxcbiAgICBmaWVsZHM6ICgpID0+ICh7XG4gICAgICBoYXZlOiB7XG4gICAgICAgIGRlc2NyaXB0aW9uOiAnUnVuIGEgcmVsYXRpb25hbC9wb2ludGVyIHF1ZXJ5IHdoZXJlIGF0IGxlYXN0IG9uZSBjaGlsZCBvYmplY3QgY2FuIG1hdGNoLicsXG4gICAgICAgIHR5cGU6IGNsYXNzR3JhcGhRTENvbnN0cmFpbnRzVHlwZSxcbiAgICAgIH0sXG4gICAgICBoYXZlTm90OiB7XG4gICAgICAgIGRlc2NyaXB0aW9uOlxuICAgICAgICAgICdSdW4gYW4gaW52ZXJ0ZWQgcmVsYXRpb25hbC9wb2ludGVyIHF1ZXJ5IHdoZXJlIGF0IGxlYXN0IG9uZSBjaGlsZCBvYmplY3QgY2FuIG1hdGNoLicsXG4gICAgICAgIHR5cGU6IGNsYXNzR3JhcGhRTENvbnN0cmFpbnRzVHlwZSxcbiAgICAgIH0sXG4gICAgICBleGlzdHM6IHtcbiAgICAgICAgZGVzY3JpcHRpb246ICdDaGVjayBpZiB0aGUgcmVsYXRpb24vcG9pbnRlciBjb250YWlucyBvYmplY3RzLicsXG4gICAgICAgIHR5cGU6IEdyYXBoUUxCb29sZWFuLFxuICAgICAgfSxcbiAgICB9KSxcbiAgfSk7XG4gIGNsYXNzR3JhcGhRTFJlbGF0aW9uQ29uc3RyYWludHNUeXBlID1cbiAgICBwYXJzZUdyYXBoUUxTY2hlbWEuYWRkR3JhcGhRTFR5cGUoY2xhc3NHcmFwaFFMUmVsYXRpb25Db25zdHJhaW50c1R5cGUpIHx8XG4gICAgZGVmYXVsdEdyYXBoUUxUeXBlcy5PQkpFQ1Q7XG5cbiAgY29uc3QgY2xhc3NHcmFwaFFMT3JkZXJUeXBlTmFtZSA9IGAke2dyYXBoUUxDbGFzc05hbWV9T3JkZXJgO1xuICBsZXQgY2xhc3NHcmFwaFFMT3JkZXJUeXBlID0gbmV3IEdyYXBoUUxFbnVtVHlwZSh7XG4gICAgbmFtZTogY2xhc3NHcmFwaFFMT3JkZXJUeXBlTmFtZSxcbiAgICBkZXNjcmlwdGlvbjogYFRoZSAke2NsYXNzR3JhcGhRTE9yZGVyVHlwZU5hbWV9IGlucHV0IHR5cGUgaXMgdXNlZCB3aGVuIHNvcnRpbmcgb2JqZWN0cyBvZiB0aGUgJHtncmFwaFFMQ2xhc3NOYW1lfSBjbGFzcy5gLFxuICAgIHZhbHVlczogY2xhc3NTb3J0RmllbGRzLnJlZHVjZSgoc29ydEZpZWxkcywgZmllbGRDb25maWcpID0+IHtcbiAgICAgIGNvbnN0IHsgZmllbGQsIGFzYywgZGVzYyB9ID0gZmllbGRDb25maWc7XG4gICAgICBjb25zdCB1cGRhdGVkU29ydEZpZWxkcyA9IHtcbiAgICAgICAgLi4uc29ydEZpZWxkcyxcbiAgICAgIH07XG4gICAgICBjb25zdCB2YWx1ZSA9IGZpZWxkID09PSAnaWQnID8gJ29iamVjdElkJyA6IGZpZWxkO1xuICAgICAgaWYgKGFzYykge1xuICAgICAgICB1cGRhdGVkU29ydEZpZWxkc1tgJHtmaWVsZH1fQVNDYF0gPSB7IHZhbHVlIH07XG4gICAgICB9XG4gICAgICBpZiAoZGVzYykge1xuICAgICAgICB1cGRhdGVkU29ydEZpZWxkc1tgJHtmaWVsZH1fREVTQ2BdID0geyB2YWx1ZTogYC0ke3ZhbHVlfWAgfTtcbiAgICAgIH1cbiAgICAgIHJldHVybiB1cGRhdGVkU29ydEZpZWxkcztcbiAgICB9LCB7fSksXG4gIH0pO1xuICBjbGFzc0dyYXBoUUxPcmRlclR5cGUgPSBwYXJzZUdyYXBoUUxTY2hlbWEuYWRkR3JhcGhRTFR5cGUoY2xhc3NHcmFwaFFMT3JkZXJUeXBlKTtcblxuICBjb25zdCBjbGFzc0dyYXBoUUxGaW5kQXJncyA9IHtcbiAgICB3aGVyZToge1xuICAgICAgZGVzY3JpcHRpb246ICdUaGVzZSBhcmUgdGhlIGNvbmRpdGlvbnMgdGhhdCB0aGUgb2JqZWN0cyBuZWVkIHRvIG1hdGNoIGluIG9yZGVyIHRvIGJlIGZvdW5kLicsXG4gICAgICB0eXBlOiBjbGFzc0dyYXBoUUxDb25zdHJhaW50c1R5cGUsXG4gICAgfSxcbiAgICBvcmRlcjoge1xuICAgICAgZGVzY3JpcHRpb246ICdUaGUgZmllbGRzIHRvIGJlIHVzZWQgd2hlbiBzb3J0aW5nIHRoZSBkYXRhIGZldGNoZWQuJyxcbiAgICAgIHR5cGU6IGNsYXNzR3JhcGhRTE9yZGVyVHlwZVxuICAgICAgICA/IG5ldyBHcmFwaFFMTGlzdChuZXcgR3JhcGhRTE5vbk51bGwoY2xhc3NHcmFwaFFMT3JkZXJUeXBlKSlcbiAgICAgICAgOiBHcmFwaFFMU3RyaW5nLFxuICAgIH0sXG4gICAgc2tpcDogZGVmYXVsdEdyYXBoUUxUeXBlcy5TS0lQX0FUVCxcbiAgICAuLi5jb25uZWN0aW9uQXJncyxcbiAgICBvcHRpb25zOiBkZWZhdWx0R3JhcGhRTFR5cGVzLlJFQURfT1BUSU9OU19BVFQsXG4gIH07XG4gIGNvbnN0IGNsYXNzR3JhcGhRTE91dHB1dFR5cGVOYW1lID0gYCR7Z3JhcGhRTENsYXNzTmFtZX1gO1xuICBjb25zdCBpbnRlcmZhY2VzID0gW2RlZmF1bHRHcmFwaFFMVHlwZXMuUEFSU0VfT0JKRUNULCBwYXJzZUdyYXBoUUxTY2hlbWEucmVsYXlOb2RlSW50ZXJmYWNlXTtcbiAgY29uc3QgcGFyc2VPYmplY3RGaWVsZHMgPSB7XG4gICAgaWQ6IGdsb2JhbElkRmllbGQoY2xhc3NOYW1lLCBvYmogPT4gb2JqLm9iamVjdElkKSxcbiAgICAuLi5kZWZhdWx0R3JhcGhRTFR5cGVzLlBBUlNFX09CSkVDVF9GSUVMRFMsXG4gICAgLi4uKGNsYXNzTmFtZSA9PT0gJ19Vc2VyJ1xuICAgICAgPyB7XG4gICAgICAgICAgYXV0aERhdGFSZXNwb25zZToge1xuICAgICAgICAgICAgZGVzY3JpcHRpb246IGBhdXRoIHByb3ZpZGVyIHJlc3BvbnNlIHdoZW4gdHJpZ2dlcmVkIG9uIHNpZ25VcC9sb2dJbi5gLFxuICAgICAgICAgICAgdHlwZTogZGVmYXVsdEdyYXBoUUxUeXBlcy5PQkpFQ1QsXG4gICAgICAgICAgfSxcbiAgICAgICAgfVxuICAgICAgOiB7fSksXG4gIH07XG4gIGNvbnN0IG91dHB1dEZpZWxkcyA9ICgpID0+IHtcbiAgICByZXR1cm4gY2xhc3NPdXRwdXRGaWVsZHMucmVkdWNlKChmaWVsZHMsIGZpZWxkKSA9PiB7XG4gICAgICBjb25zdCB0eXBlID0gdHJhbnNmb3JtT3V0cHV0VHlwZVRvR3JhcGhRTChcbiAgICAgICAgcGFyc2VDbGFzcy5maWVsZHNbZmllbGRdLnR5cGUsXG4gICAgICAgIHBhcnNlQ2xhc3MuZmllbGRzW2ZpZWxkXS50YXJnZXRDbGFzcyxcbiAgICAgICAgcGFyc2VHcmFwaFFMU2NoZW1hLnBhcnNlQ2xhc3NUeXBlc1xuICAgICAgKTtcbiAgICAgIGlmIChwYXJzZUNsYXNzLmZpZWxkc1tmaWVsZF0udHlwZSA9PT0gJ1JlbGF0aW9uJykge1xuICAgICAgICBjb25zdCB0YXJnZXRQYXJzZUNsYXNzVHlwZXMgPVxuICAgICAgICAgIHBhcnNlR3JhcGhRTFNjaGVtYS5wYXJzZUNsYXNzVHlwZXNbcGFyc2VDbGFzcy5maWVsZHNbZmllbGRdLnRhcmdldENsYXNzXTtcbiAgICAgICAgY29uc3QgYXJncyA9IHRhcmdldFBhcnNlQ2xhc3NUeXBlcyA/IHRhcmdldFBhcnNlQ2xhc3NUeXBlcy5jbGFzc0dyYXBoUUxGaW5kQXJncyA6IHVuZGVmaW5lZDtcbiAgICAgICAgcmV0dXJuIHtcbiAgICAgICAgICAuLi5maWVsZHMsXG4gICAgICAgICAgW2ZpZWxkXToge1xuICAgICAgICAgICAgZGVzY3JpcHRpb246IGBUaGlzIGlzIHRoZSBvYmplY3QgJHtmaWVsZH0uYCxcbiAgICAgICAgICAgIGFyZ3MsXG4gICAgICAgICAgICB0eXBlOiBwYXJzZUNsYXNzLmZpZWxkc1tmaWVsZF0ucmVxdWlyZWQgPyBuZXcgR3JhcGhRTE5vbk51bGwodHlwZSkgOiB0eXBlLFxuICAgICAgICAgICAgYXN5bmMgcmVzb2x2ZShzb3VyY2UsIGFyZ3MsIGNvbnRleHQsIHF1ZXJ5SW5mbykge1xuICAgICAgICAgICAgICB0cnkge1xuICAgICAgICAgICAgICAgIGNvbnN0IHsgd2hlcmUsIG9yZGVyLCBza2lwLCBmaXJzdCwgYWZ0ZXIsIGxhc3QsIGJlZm9yZSwgb3B0aW9ucyB9ID0gYXJncztcbiAgICAgICAgICAgICAgICBjb25zdCB7IHJlYWRQcmVmZXJlbmNlLCBpbmNsdWRlUmVhZFByZWZlcmVuY2UsIHN1YnF1ZXJ5UmVhZFByZWZlcmVuY2UgfSA9XG4gICAgICAgICAgICAgICAgICBvcHRpb25zIHx8IHt9O1xuICAgICAgICAgICAgICAgIGNvbnN0IHsgY29uZmlnLCBhdXRoLCBpbmZvIH0gPSBjb250ZXh0O1xuICAgICAgICAgICAgICAgIGNvbnN0IHNlbGVjdGVkRmllbGRzID0gZ2V0RmllbGROYW1lcyhxdWVyeUluZm8pO1xuXG4gICAgICAgICAgICAgICAgY29uc3QgeyBrZXlzLCBpbmNsdWRlIH0gPSBleHRyYWN0S2V5c0FuZEluY2x1ZGUoXG4gICAgICAgICAgICAgICAgICBzZWxlY3RlZEZpZWxkc1xuICAgICAgICAgICAgICAgICAgICAuZmlsdGVyKGZpZWxkID0+IGZpZWxkLnN0YXJ0c1dpdGgoJ2VkZ2VzLm5vZGUuJykpXG4gICAgICAgICAgICAgICAgICAgIC5tYXAoZmllbGQgPT4gZmllbGQucmVwbGFjZSgnZWRnZXMubm9kZS4nLCAnJykpXG4gICAgICAgICAgICAgICAgICAgIC5maWx0ZXIoZmllbGQgPT4gZmllbGQuaW5kZXhPZignZWRnZXMubm9kZScpIDwgMClcbiAgICAgICAgICAgICAgICApO1xuICAgICAgICAgICAgICAgIGNvbnN0IHBhcnNlT3JkZXIgPSBvcmRlciAmJiBvcmRlci5qb2luKCcsJyk7XG5cbiAgICAgICAgICAgICAgICByZXR1cm4gb2JqZWN0c1F1ZXJpZXMuZmluZE9iamVjdHMoXG4gICAgICAgICAgICAgICAgICBzb3VyY2VbZmllbGRdLmNsYXNzTmFtZSxcbiAgICAgICAgICAgICAgICAgIHtcbiAgICAgICAgICAgICAgICAgICAgJHJlbGF0ZWRUbzoge1xuICAgICAgICAgICAgICAgICAgICAgIG9iamVjdDoge1xuICAgICAgICAgICAgICAgICAgICAgICAgX190eXBlOiAnUG9pbnRlcicsXG4gICAgICAgICAgICAgICAgICAgICAgICBjbGFzc05hbWU6IGNsYXNzTmFtZSxcbiAgICAgICAgICAgICAgICAgICAgICAgIG9iamVjdElkOiBzb3VyY2Uub2JqZWN0SWQsXG4gICAgICAgICAgICAgICAgICAgICAgfSxcbiAgICAgICAgICAgICAgICAgICAgICBrZXk6IGZpZWxkLFxuICAgICAgICAgICAgICAgICAgICB9LFxuICAgICAgICAgICAgICAgICAgICAuLi4od2hlcmUgfHwge30pLFxuICAgICAgICAgICAgICAgICAgfSxcbiAgICAgICAgICAgICAgICAgIHBhcnNlT3JkZXIsXG4gICAgICAgICAgICAgICAgICBza2lwLFxuICAgICAgICAgICAgICAgICAgZmlyc3QsXG4gICAgICAgICAgICAgICAgICBhZnRlcixcbiAgICAgICAgICAgICAgICAgIGxhc3QsXG4gICAgICAgICAgICAgICAgICBiZWZvcmUsXG4gICAgICAgICAgICAgICAgICBrZXlzLFxuICAgICAgICAgICAgICAgICAgaW5jbHVkZSxcbiAgICAgICAgICAgICAgICAgIGZhbHNlLFxuICAgICAgICAgICAgICAgICAgcmVhZFByZWZlcmVuY2UsXG4gICAgICAgICAgICAgICAgICBpbmNsdWRlUmVhZFByZWZlcmVuY2UsXG4gICAgICAgICAgICAgICAgICBzdWJxdWVyeVJlYWRQcmVmZXJlbmNlLFxuICAgICAgICAgICAgICAgICAgY29uZmlnLFxuICAgICAgICAgICAgICAgICAgYXV0aCxcbiAgICAgICAgICAgICAgICAgIGluZm8sXG4gICAgICAgICAgICAgICAgICBzZWxlY3RlZEZpZWxkcyxcbiAgICAgICAgICAgICAgICAgIHBhcnNlR3JhcGhRTFNjaGVtYS5wYXJzZUNsYXNzZXNcbiAgICAgICAgICAgICAgICApO1xuICAgICAgICAgICAgICB9IGNhdGNoIChlKSB7XG4gICAgICAgICAgICAgICAgcGFyc2VHcmFwaFFMU2NoZW1hLmhhbmRsZUVycm9yKGUpO1xuICAgICAgICAgICAgICB9XG4gICAgICAgICAgICB9LFxuICAgICAgICAgIH0sXG4gICAgICAgIH07XG4gICAgICB9IGVsc2UgaWYgKHBhcnNlQ2xhc3MuZmllbGRzW2ZpZWxkXS50eXBlID09PSAnUG9seWdvbicpIHtcbiAgICAgICAgcmV0dXJuIHtcbiAgICAgICAgICAuLi5maWVsZHMsXG4gICAgICAgICAgW2ZpZWxkXToge1xuICAgICAgICAgICAgZGVzY3JpcHRpb246IGBUaGlzIGlzIHRoZSBvYmplY3QgJHtmaWVsZH0uYCxcbiAgICAgICAgICAgIHR5cGU6IHBhcnNlQ2xhc3MuZmllbGRzW2ZpZWxkXS5yZXF1aXJlZCA/IG5ldyBHcmFwaFFMTm9uTnVsbCh0eXBlKSA6IHR5cGUsXG4gICAgICAgICAgICBhc3luYyByZXNvbHZlKHNvdXJjZSkge1xuICAgICAgICAgICAgICBpZiAoc291cmNlW2ZpZWxkXSAmJiBzb3VyY2VbZmllbGRdLmNvb3JkaW5hdGVzKSB7XG4gICAgICAgICAgICAgICAgcmV0dXJuIHNvdXJjZVtmaWVsZF0uY29vcmRpbmF0ZXMubWFwKGNvb3JkaW5hdGUgPT4gKHtcbiAgICAgICAgICAgICAgICAgIGxhdGl0dWRlOiBjb29yZGluYXRlWzBdLFxuICAgICAgICAgICAgICAgICAgbG9uZ2l0dWRlOiBjb29yZGluYXRlWzFdLFxuICAgICAgICAgICAgICAgIH0pKTtcbiAgICAgICAgICAgICAgfSBlbHNlIHtcbiAgICAgICAgICAgICAgICByZXR1cm4gbnVsbDtcbiAgICAgICAgICAgICAgfVxuICAgICAgICAgICAgfSxcbiAgICAgICAgICB9LFxuICAgICAgICB9O1xuICAgICAgfSBlbHNlIGlmIChwYXJzZUNsYXNzLmZpZWxkc1tmaWVsZF0udHlwZSA9PT0gJ0FycmF5Jykge1xuICAgICAgICByZXR1cm4ge1xuICAgICAgICAgIC4uLmZpZWxkcyxcbiAgICAgICAgICBbZmllbGRdOiB7XG4gICAgICAgICAgICBkZXNjcmlwdGlvbjogYFVzZSBJbmxpbmUgRnJhZ21lbnQgb24gQXJyYXkgdG8gZ2V0IHJlc3VsdHM6IGh0dHBzOi8vZ3JhcGhxbC5vcmcvbGVhcm4vcXVlcmllcy8jaW5saW5lLWZyYWdtZW50c2AsXG4gICAgICAgICAgICB0eXBlOiBwYXJzZUNsYXNzLmZpZWxkc1tmaWVsZF0ucmVxdWlyZWQgPyBuZXcgR3JhcGhRTE5vbk51bGwodHlwZSkgOiB0eXBlLFxuICAgICAgICAgICAgYXN5bmMgcmVzb2x2ZShzb3VyY2UpIHtcbiAgICAgICAgICAgICAgaWYgKCFzb3VyY2VbZmllbGRdKSByZXR1cm4gbnVsbDtcbiAgICAgICAgICAgICAgcmV0dXJuIHNvdXJjZVtmaWVsZF0ubWFwKGFzeW5jIGVsZW0gPT4ge1xuICAgICAgICAgICAgICAgIGlmIChlbGVtLmNsYXNzTmFtZSAmJiBlbGVtLm9iamVjdElkICYmIGVsZW0uX190eXBlID09PSAnT2JqZWN0Jykge1xuICAgICAgICAgICAgICAgICAgcmV0dXJuIGVsZW07XG4gICAgICAgICAgICAgICAgfSBlbHNlIHtcbiAgICAgICAgICAgICAgICAgIHJldHVybiB7IHZhbHVlOiBlbGVtIH07XG4gICAgICAgICAgICAgICAgfVxuICAgICAgICAgICAgICB9KTtcbiAgICAgICAgICAgIH0sXG4gICAgICAgICAgfSxcbiAgICAgICAgfTtcbiAgICAgIH0gZWxzZSBpZiAodHlwZSkge1xuICAgICAgICByZXR1cm4ge1xuICAgICAgICAgIC4uLmZpZWxkcyxcbiAgICAgICAgICBbZmllbGRdOiB7XG4gICAgICAgICAgICBkZXNjcmlwdGlvbjogYFRoaXMgaXMgdGhlIG9iamVjdCAke2ZpZWxkfS5gLFxuICAgICAgICAgICAgdHlwZTogcGFyc2VDbGFzcy5maWVsZHNbZmllbGRdLnJlcXVpcmVkID8gbmV3IEdyYXBoUUxOb25OdWxsKHR5cGUpIDogdHlwZSxcbiAgICAgICAgICB9LFxuICAgICAgICB9O1xuICAgICAgfSBlbHNlIHtcbiAgICAgICAgcmV0dXJuIGZpZWxkcztcbiAgICAgIH1cbiAgICB9LCBwYXJzZU9iamVjdEZpZWxkcyk7XG4gIH07XG4gIGxldCBjbGFzc0dyYXBoUUxPdXRwdXRUeXBlID0gbmV3IEdyYXBoUUxPYmplY3RUeXBlKHtcbiAgICBuYW1lOiBjbGFzc0dyYXBoUUxPdXRwdXRUeXBlTmFtZSxcbiAgICBkZXNjcmlwdGlvbjogYFRoZSAke2NsYXNzR3JhcGhRTE91dHB1dFR5cGVOYW1lfSBvYmplY3QgdHlwZSBpcyB1c2VkIGluIG9wZXJhdGlvbnMgdGhhdCBpbnZvbHZlIG91dHB1dHRpbmcgb2JqZWN0cyBvZiAke2dyYXBoUUxDbGFzc05hbWV9IGNsYXNzLmAsXG4gICAgaW50ZXJmYWNlcyxcbiAgICBmaWVsZHM6IG91dHB1dEZpZWxkcyxcbiAgfSk7XG4gIGNsYXNzR3JhcGhRTE91dHB1dFR5cGUgPSBwYXJzZUdyYXBoUUxTY2hlbWEuYWRkR3JhcGhRTFR5cGUoY2xhc3NHcmFwaFFMT3V0cHV0VHlwZSk7XG5cbiAgY29uc3QgeyBjb25uZWN0aW9uVHlwZSwgZWRnZVR5cGUgfSA9IGNvbm5lY3Rpb25EZWZpbml0aW9ucyh7XG4gICAgbmFtZTogZ3JhcGhRTENsYXNzTmFtZSxcbiAgICBjb25uZWN0aW9uRmllbGRzOiB7XG4gICAgICBjb3VudDogZGVmYXVsdEdyYXBoUUxUeXBlcy5DT1VOVF9BVFQsXG4gICAgfSxcbiAgICBub2RlVHlwZTogY2xhc3NHcmFwaFFMT3V0cHV0VHlwZSB8fCBkZWZhdWx0R3JhcGhRTFR5cGVzLk9CSkVDVCxcbiAgfSk7XG4gIGxldCBjbGFzc0dyYXBoUUxGaW5kUmVzdWx0VHlwZSA9IHVuZGVmaW5lZDtcbiAgaWYgKFxuICAgIHBhcnNlR3JhcGhRTFNjaGVtYS5hZGRHcmFwaFFMVHlwZShlZGdlVHlwZSkgJiZcbiAgICBwYXJzZUdyYXBoUUxTY2hlbWEuYWRkR3JhcGhRTFR5cGUoY29ubmVjdGlvblR5cGUsIGZhbHNlLCBmYWxzZSwgdHJ1ZSlcbiAgKSB7XG4gICAgY2xhc3NHcmFwaFFMRmluZFJlc3VsdFR5cGUgPSBjb25uZWN0aW9uVHlwZTtcbiAgfVxuXG4gIHBhcnNlR3JhcGhRTFNjaGVtYS5wYXJzZUNsYXNzVHlwZXNbY2xhc3NOYW1lXSA9IHtcbiAgICBjbGFzc0dyYXBoUUxQb2ludGVyVHlwZSxcbiAgICBjbGFzc0dyYXBoUUxSZWxhdGlvblR5cGUsXG4gICAgY2xhc3NHcmFwaFFMQ3JlYXRlVHlwZSxcbiAgICBjbGFzc0dyYXBoUUxVcGRhdGVUeXBlLFxuICAgIGNsYXNzR3JhcGhRTENvbnN0cmFpbnRzVHlwZSxcbiAgICBjbGFzc0dyYXBoUUxSZWxhdGlvbkNvbnN0cmFpbnRzVHlwZSxcbiAgICBjbGFzc0dyYXBoUUxGaW5kQXJncyxcbiAgICBjbGFzc0dyYXBoUUxPdXRwdXRUeXBlLFxuICAgIGNsYXNzR3JhcGhRTEZpbmRSZXN1bHRUeXBlLFxuICAgIGNvbmZpZzoge1xuICAgICAgcGFyc2VDbGFzc0NvbmZpZyxcbiAgICAgIGlzQ3JlYXRlRW5hYmxlZCxcbiAgICAgIGlzVXBkYXRlRW5hYmxlZCxcbiAgICB9LFxuICB9O1xuXG4gIGlmIChjbGFzc05hbWUgPT09ICdfVXNlcicpIHtcbiAgICBjb25zdCB2aWV3ZXJUeXBlID0gbmV3IEdyYXBoUUxPYmplY3RUeXBlKHtcbiAgICAgIG5hbWU6ICdWaWV3ZXInLFxuICAgICAgZGVzY3JpcHRpb246IGBUaGUgVmlld2VyIG9iamVjdCB0eXBlIGlzIHVzZWQgaW4gb3BlcmF0aW9ucyB0aGF0IGludm9sdmUgb3V0cHV0dGluZyB0aGUgY3VycmVudCB1c2VyIGRhdGEuYCxcbiAgICAgIGZpZWxkczogKCkgPT4gKHtcbiAgICAgICAgc2Vzc2lvblRva2VuOiBkZWZhdWx0R3JhcGhRTFR5cGVzLlNFU1NJT05fVE9LRU5fQVRULFxuICAgICAgICB1c2VyOiB7XG4gICAgICAgICAgZGVzY3JpcHRpb246ICdUaGlzIGlzIHRoZSBjdXJyZW50IHVzZXIuJyxcbiAgICAgICAgICB0eXBlOiBuZXcgR3JhcGhRTE5vbk51bGwoY2xhc3NHcmFwaFFMT3V0cHV0VHlwZSksXG4gICAgICAgIH0sXG4gICAgICB9KSxcbiAgICB9KTtcbiAgICBwYXJzZUdyYXBoUUxTY2hlbWEuYWRkR3JhcGhRTFR5cGUodmlld2VyVHlwZSwgdHJ1ZSwgdHJ1ZSk7XG4gICAgcGFyc2VHcmFwaFFMU2NoZW1hLnZpZXdlclR5cGUgPSB2aWV3ZXJUeXBlO1xuICB9XG59O1xuXG5leHBvcnQgeyBleHRyYWN0S2V5c0FuZEluY2x1ZGUsIGxvYWQgfTtcbiJdLCJtYXBwaW5ncyI6Ijs7Ozs7Ozs7Ozs7O0FBQ0EsSUFBQUEsUUFBQSxHQUFBQyxPQUFBO0FBVUEsSUFBQUMsYUFBQSxHQUFBRCxPQUFBO0FBQ0EsSUFBQUUsa0JBQUEsR0FBQUMsc0JBQUEsQ0FBQUgsT0FBQTtBQUNBLElBQUFJLG1CQUFBLEdBQUFDLHVCQUFBLENBQUFMLE9BQUE7QUFDQSxJQUFBTSxjQUFBLEdBQUFELHVCQUFBLENBQUFMLE9BQUE7QUFDQSxJQUFBTyx1QkFBQSxHQUFBUCxPQUFBO0FBQ0EsSUFBQVEsVUFBQSxHQUFBUixPQUFBO0FBQ0EsSUFBQVMsVUFBQSxHQUFBVCxPQUFBO0FBQ0EsSUFBQVUsV0FBQSxHQUFBVixPQUFBO0FBQ0EsSUFBQVcsZUFBQSxHQUFBWCxPQUFBO0FBQ0EsSUFBQVksa0JBQUEsR0FBQVosT0FBQTtBQUEwRixTQUFBYSx5QkFBQUMsV0FBQSxlQUFBQyxPQUFBLGtDQUFBQyxpQkFBQSxPQUFBRCxPQUFBLFFBQUFFLGdCQUFBLE9BQUFGLE9BQUEsWUFBQUYsd0JBQUEsWUFBQUEsQ0FBQUMsV0FBQSxXQUFBQSxXQUFBLEdBQUFHLGdCQUFBLEdBQUFELGlCQUFBLEtBQUFGLFdBQUE7QUFBQSxTQUFBVCx3QkFBQWEsR0FBQSxFQUFBSixXQUFBLFNBQUFBLFdBQUEsSUFBQUksR0FBQSxJQUFBQSxHQUFBLENBQUFDLFVBQUEsV0FBQUQsR0FBQSxRQUFBQSxHQUFBLG9CQUFBQSxHQUFBLHdCQUFBQSxHQUFBLDRCQUFBRSxPQUFBLEVBQUFGLEdBQUEsVUFBQUcsS0FBQSxHQUFBUix3QkFBQSxDQUFBQyxXQUFBLE9BQUFPLEtBQUEsSUFBQUEsS0FBQSxDQUFBQyxHQUFBLENBQUFKLEdBQUEsWUFBQUcsS0FBQSxDQUFBRSxH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