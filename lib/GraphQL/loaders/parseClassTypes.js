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
function _toPrimitive(input, hint) { if (typeof input !== "object" || input === null) return input; var prim = input[Symbol.toPrimitive]; if (prim !== undefined) { var res = prim.call(input, hint || "default"); if (typeof res !== "object") return res; throw new TypeError("@@toPrimitive must return a primitive value."); } return (hint === "string" ? String : Number)(input); }
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
//# sourceMappingURL=data:application/json;charset=utf-8;base64,eyJ2ZXJzaW9uIjozLCJuYW1lcyI6WyJnZXRQYXJzZUNsYXNzVHlwZUNvbmZpZyIsInBhcnNlQ2xhc3NDb25maWciLCJ0eXBlIiwiZ2V0SW5wdXRGaWVsZHNBbmRDb25zdHJhaW50cyIsInBhcnNlQ2xhc3MiLCJjbGFzc0ZpZWxkcyIsIk9iamVjdCIsImtleXMiLCJmaWVsZHMiLCJjb25jYXQiLCJpbnB1dEZpZWxkcyIsImFsbG93ZWRJbnB1dEZpZWxkcyIsIm91dHB1dEZpZWxkcyIsImFsbG93ZWRPdXRwdXRGaWVsZHMiLCJjb25zdHJhaW50RmllbGRzIiwiYWxsb3dlZENvbnN0cmFpbnRGaWVsZHMiLCJzb3J0RmllbGRzIiwiYWxsb3dlZFNvcnRGaWVsZHMiLCJjbGFzc091dHB1dEZpZWxkcyIsImNsYXNzQ3JlYXRlRmllbGRzIiwiY2xhc3NVcGRhdGVGaWVsZHMiLCJjbGFzc0NvbnN0cmFpbnRGaWVsZHMiLCJjbGFzc1NvcnRGaWVsZHMiLCJjbGFzc0N1c3RvbUZpZWxkcyIsImZpbHRlciIsImZpZWxkIiwiZGVmYXVsdEdyYXBoUUxUeXBlcyIsIlBBUlNFX09CSkVDVF9GSUVMRFMiLCJpbmNsdWRlcyIsImNyZWF0ZSIsInVwZGF0ZSIsImNsYXNzTmFtZSIsIm91dHB1dEZpZWxkIiwibGVuZ3RoIiwicHVzaCIsImFzYyIsImRlc2MiLCJtYXAiLCJsb2FkIiwicGFyc2VHcmFwaFFMU2NoZW1hIiwiZ3JhcGhRTENsYXNzTmFtZSIsInRyYW5zZm9ybUNsYXNzTmFtZVRvR3JhcGhRTCIsImlzQ3JlYXRlRW5hYmxlZCIsImlzVXBkYXRlRW5hYmxlZCIsImdldFBhcnNlQ2xhc3NNdXRhdGlvbkNvbmZpZyIsImNsYXNzR3JhcGhRTENyZWF0ZVR5cGVOYW1lIiwiY2xhc3NHcmFwaFFMQ3JlYXRlVHlwZSIsIkdyYXBoUUxJbnB1dE9iamVjdFR5cGUiLCJuYW1lIiwiZGVzY3JpcHRpb24iLCJyZWR1Y2UiLCJ0cmFuc2Zvcm1JbnB1dFR5cGVUb0dyYXBoUUwiLCJ0YXJnZXRDbGFzcyIsInBhcnNlQ2xhc3NUeXBlcyIsInJlcXVpcmVkIiwiR3JhcGhRTE5vbk51bGwiLCJBQ0wiLCJBQ0xfSU5QVVQiLCJhZGRHcmFwaFFMVHlwZSIsImNsYXNzR3JhcGhRTFVwZGF0ZVR5cGVOYW1lIiwiY2xhc3NHcmFwaFFMVXBkYXRlVHlwZSIsImNsYXNzR3JhcGhRTFBvaW50ZXJUeXBlTmFtZSIsImNsYXNzR3JhcGhRTFBvaW50ZXJUeXBlIiwibGluayIsIkdyYXBoUUxJRCIsIk9CSkVDVCIsImNsYXNzR3JhcGhRTFJlbGF0aW9uVHlwZU5hbWUiLCJjbGFzc0dyYXBoUUxSZWxhdGlvblR5cGUiLCJhZGQiLCJHcmFwaFFMTGlzdCIsIk9CSkVDVF9JRCIsInJlbW92ZSIsImNsYXNzR3JhcGhRTENvbnN0cmFpbnRzVHlwZU5hbWUiLCJjbGFzc0dyYXBoUUxDb25zdHJhaW50c1R5cGUiLCJsb2ciLCJ3YXJuIiwicGFyc2VGaWVsZCIsInRyYW5zZm9ybUNvbnN0cmFpbnRUeXBlVG9HcmFwaFFMIiwiT1IiLCJBTkQiLCJOT1IiLCJjbGFzc0dyYXBoUUxSZWxhdGlvbkNvbnN0cmFpbnRzVHlwZU5hbWUiLCJjbGFzc0dyYXBoUUxSZWxhdGlvbkNvbnN0cmFpbnRzVHlwZSIsImhhdmUiLCJoYXZlTm90IiwiZXhpc3RzIiwiR3JhcGhRTEJvb2xlYW4iLCJjbGFzc0dyYXBoUUxPcmRlclR5cGVOYW1lIiwiY2xhc3NHcmFwaFFMT3JkZXJUeXBlIiwiR3JhcGhRTEVudW1UeXBlIiwidmFsdWVzIiwiZmllbGRDb25maWciLCJ1cGRhdGVkU29ydEZpZWxkcyIsInZhbHVlIiwiY2xhc3NHcmFwaFFMRmluZEFyZ3MiLCJ3aGVyZSIsIm9yZGVyIiwiR3JhcGhRTFN0cmluZyIsInNraXAiLCJTS0lQX0FUVCIsImNvbm5lY3Rpb25BcmdzIiwib3B0aW9ucyIsIlJFQURfT1BUSU9OU19BVFQiLCJjbGFzc0dyYXBoUUxPdXRwdXRUeXBlTmFtZSIsImludGVyZmFjZXMiLCJQQVJTRV9PQkpFQ1QiLCJyZWxheU5vZGVJbnRlcmZhY2UiLCJwYXJzZU9iamVjdEZpZWxkcyIsImlkIiwiZ2xvYmFsSWRGaWVsZCIsIm9iaiIsIm9iamVjdElkIiwiYXV0aERhdGFSZXNwb25zZSIsInRyYW5zZm9ybU91dHB1dFR5cGVUb0dyYXBoUUwiLCJ0YXJnZXRQYXJzZUNsYXNzVHlwZXMiLCJhcmdzIiwidW5kZWZpbmVkIiwicmVzb2x2ZSIsInNvdXJjZSIsImNvbnRleHQiLCJxdWVyeUluZm8iLCJmaXJzdCIsImFmdGVyIiwibGFzdCIsImJlZm9yZSIsInJlYWRQcmVmZXJlbmNlIiwiaW5jbHVkZVJlYWRQcmVmZXJlbmNlIiwic3VicXVlcnlSZWFkUHJlZmVyZW5jZSIsImNvbmZpZyIsImF1dGgiLCJpbmZvIiwic2VsZWN0ZWRGaWVsZHMiLCJnZXRGaWVsZE5hbWVzIiwiaW5jbHVkZSIsImV4dHJhY3RLZXlzQW5kSW5jbHVkZSIsInN0YXJ0c1dpdGgiLCJyZXBsYWNlIiwiaW5kZXhPZiIsInBhcnNlT3JkZXIiLCJqb2luIiwib2JqZWN0c1F1ZXJpZXMiLCJmaW5kT2JqZWN0cyIsIiRyZWxhdGVkVG8iLCJvYmplY3QiLCJfX3R5cGUiLCJrZXkiLCJwYXJzZUNsYXNzZXMiLCJlIiwiaGFuZGxlRXJyb3IiLCJjb29yZGluYXRlcyIsImNvb3JkaW5hdGUiLCJsYXRpdHVkZSIsImxvbmdpdHVkZSIsImVsZW0iLCJjbGFzc0dyYXBoUUxPdXRwdXRUeXBlIiwiR3JhcGhRTE9iamVjdFR5cGUiLCJjb25uZWN0aW9uVHlwZSIsImVkZ2VUeXBlIiwiY29ubmVjdGlvbkRlZmluaXRpb25zIiwiY29ubmVjdGlvbkZpZWxkcyIsImNvdW50IiwiQ09VTlRfQVRUIiwibm9kZVR5cGUiLCJjbGFzc0dyYXBoUUxGaW5kUmVzdWx0VHlwZSIsInZpZXdlclR5cGUiLCJzZXNzaW9uVG9rZW4iLCJTRVNTSU9OX1RPS0VOX0FUVCIsInVzZXIiXSwic291cmNlcyI6WyIuLi8uLi8uLi9zcmMvR3JhcGhRTC9sb2FkZXJzL3BhcnNlQ2xhc3NUeXBlcy5qcyJdLCJzb3VyY2VzQ29udGVudCI6WyIvKiBlc2xpbnQtZGlzYWJsZSBpbmRlbnQgKi9cbmltcG9ydCB7XG4gIEdyYXBoUUxJRCxcbiAgR3JhcGhRTE9iamVjdFR5cGUsXG4gIEdyYXBoUUxTdHJpbmcsXG4gIEdyYXBoUUxMaXN0LFxuICBHcmFwaFFMSW5wdXRPYmplY3RUeXBlLFxuICBHcmFwaFFMTm9uTnVsbCxcbiAgR3JhcGhRTEJvb2xlYW4sXG4gIEdyYXBoUUxFbnVtVHlwZSxcbn0gZnJvbSAnZ3JhcGhxbCc7XG5pbXBvcnQgeyBnbG9iYWxJZEZpZWxkLCBjb25uZWN0aW9uQXJncywgY29ubmVjdGlvbkRlZmluaXRpb25zIH0gZnJvbSAnZ3JhcGhxbC1yZWxheSc7XG5pbXBvcnQgZ2V0RmllbGROYW1lcyBmcm9tICdncmFwaHFsLWxpc3QtZmllbGRzJztcbmltcG9ydCAqIGFzIGRlZmF1bHRHcmFwaFFMVHlwZXMgZnJvbSAnLi9kZWZhdWx0R3JhcGhRTFR5cGVzJztcbmltcG9ydCAqIGFzIG9iamVjdHNRdWVyaWVzIGZyb20gJy4uL2hlbHBlcnMvb2JqZWN0c1F1ZXJpZXMnO1xuaW1wb3J0IHsgUGFyc2VHcmFwaFFMQ2xhc3NDb25maWcgfSBmcm9tICcuLi8uLi9Db250cm9sbGVycy9QYXJzZUdyYXBoUUxDb250cm9sbGVyJztcbmltcG9ydCB7IHRyYW5zZm9ybUNsYXNzTmFtZVRvR3JhcGhRTCB9IGZyb20gJy4uL3RyYW5zZm9ybWVycy9jbGFzc05hbWUnO1xuaW1wb3J0IHsgdHJhbnNmb3JtSW5wdXRUeXBlVG9HcmFwaFFMIH0gZnJvbSAnLi4vdHJhbnNmb3JtZXJzL2lucHV0VHlwZSc7XG5pbXBvcnQgeyB0cmFuc2Zvcm1PdXRwdXRUeXBlVG9HcmFwaFFMIH0gZnJvbSAnLi4vdHJhbnNmb3JtZXJzL291dHB1dFR5cGUnO1xuaW1wb3J0IHsgdHJhbnNmb3JtQ29uc3RyYWludFR5cGVUb0dyYXBoUUwgfSBmcm9tICcuLi90cmFuc2Zvcm1lcnMvY29uc3RyYWludFR5cGUnO1xuaW1wb3J0IHsgZXh0cmFjdEtleXNBbmRJbmNsdWRlLCBnZXRQYXJzZUNsYXNzTXV0YXRpb25Db25maWcgfSBmcm9tICcuLi9wYXJzZUdyYXBoUUxVdGlscyc7XG5cbmNvbnN0IGdldFBhcnNlQ2xhc3NUeXBlQ29uZmlnID0gZnVuY3Rpb24gKHBhcnNlQ2xhc3NDb25maWc6ID9QYXJzZUdyYXBoUUxDbGFzc0NvbmZpZykge1xuICByZXR1cm4gKHBhcnNlQ2xhc3NDb25maWcgJiYgcGFyc2VDbGFzc0NvbmZpZy50eXBlKSB8fCB7fTtcbn07XG5cbmNvbnN0IGdldElucHV0RmllbGRzQW5kQ29uc3RyYWludHMgPSBmdW5jdGlvbiAoXG4gIHBhcnNlQ2xhc3MsXG4gIHBhcnNlQ2xhc3NDb25maWc6ID9QYXJzZUdyYXBoUUxDbGFzc0NvbmZpZ1xuKSB7XG4gIGNvbnN0IGNsYXNzRmllbGRzID0gT2JqZWN0LmtleXMocGFyc2VDbGFzcy5maWVsZHMpLmNvbmNhdCgnaWQnKTtcbiAgY29uc3Qge1xuICAgIGlucHV0RmllbGRzOiBhbGxvd2VkSW5wdXRGaWVsZHMsXG4gICAgb3V0cHV0RmllbGRzOiBhbGxvd2VkT3V0cHV0RmllbGRzLFxuICAgIGNvbnN0cmFpbnRGaWVsZHM6IGFsbG93ZWRDb25zdHJhaW50RmllbGRzLFxuICAgIHNvcnRGaWVsZHM6IGFsbG93ZWRTb3J0RmllbGRzLFxuICB9ID0gZ2V0UGFyc2VDbGFzc1R5cGVDb25maWcocGFyc2VDbGFzc0NvbmZpZyk7XG5cbiAgbGV0IGNsYXNzT3V0cHV0RmllbGRzO1xuICBsZXQgY2xhc3NDcmVhdGVGaWVsZHM7XG4gIGxldCBjbGFzc1VwZGF0ZUZpZWxkcztcbiAgbGV0IGNsYXNzQ29uc3RyYWludEZpZWxkcztcbiAgbGV0IGNsYXNzU29ydEZpZWxkcztcblxuICAvLyBBbGwgYWxsb3dlZCBjdXN0b21zIGZpZWxkc1xuICBjb25zdCBjbGFzc0N1c3RvbUZpZWxkcyA9IGNsYXNzRmllbGRzLmZpbHRlcihmaWVsZCA9PiB7XG4gICAgcmV0dXJuICFPYmplY3Qua2V5cyhkZWZhdWx0R3JhcGhRTFR5cGVzLlBBUlNFX09CSkVDVF9GSUVMRFMpLmluY2x1ZGVzKGZpZWxkKSAmJiBmaWVsZCAhPT0gJ2lkJztcbiAgfSk7XG5cbiAgaWYgKGFsbG93ZWRJbnB1dEZpZWxkcyAmJiBhbGxvd2VkSW5wdXRGaWVsZHMuY3JlYXRlKSB7XG4gICAgY2xhc3NDcmVhdGVGaWVsZHMgPSBjbGFzc0N1c3RvbUZpZWxkcy5maWx0ZXIoZmllbGQgPT4ge1xuICAgICAgcmV0dXJuIGFsbG93ZWRJbnB1dEZpZWxkcy5jcmVhdGUuaW5jbHVkZXMoZmllbGQpO1xuICAgIH0pO1xuICB9IGVsc2Uge1xuICAgIGNsYXNzQ3JlYXRlRmllbGRzID0gY2xhc3NDdXN0b21GaWVsZHM7XG4gIH1cbiAgaWYgKGFsbG93ZWRJbnB1dEZpZWxkcyAmJiBhbGxvd2VkSW5wdXRGaWVsZHMudXBkYXRlKSB7XG4gICAgY2xhc3NVcGRhdGVGaWVsZHMgPSBjbGFzc0N1c3RvbUZpZWxkcy5maWx0ZXIoZmllbGQgPT4ge1xuICAgICAgcmV0dXJuIGFsbG93ZWRJbnB1dEZpZWxkcy51cGRhdGUuaW5jbHVkZXMoZmllbGQpO1xuICAgIH0pO1xuICB9IGVsc2Uge1xuICAgIGNsYXNzVXBkYXRlRmllbGRzID0gY2xhc3NDdXN0b21GaWVsZHM7XG4gIH1cblxuICBpZiAoYWxsb3dlZE91dHB1dEZpZWxkcykge1xuICAgIGNsYXNzT3V0cHV0RmllbGRzID0gY2xhc3NDdXN0b21GaWVsZHMuZmlsdGVyKGZpZWxkID0+IHtcbiAgICAgIHJldHVybiBhbGxvd2VkT3V0cHV0RmllbGRzLmluY2x1ZGVzKGZpZWxkKTtcbiAgICB9KTtcbiAgfSBlbHNlIHtcbiAgICBjbGFzc091dHB1dEZpZWxkcyA9IGNsYXNzQ3VzdG9tRmllbGRzO1xuICB9XG4gIC8vIEZpbHRlcnMgdGhlIFwicGFzc3dvcmRcIiBmaWVsZCBmcm9tIGNsYXNzIF9Vc2VyXG4gIGlmIChwYXJzZUNsYXNzLmNsYXNzTmFtZSA9PT0gJ19Vc2VyJykge1xuICAgIGNsYXNzT3V0cHV0RmllbGRzID0gY2xhc3NPdXRwdXRGaWVsZHMuZmlsdGVyKG91dHB1dEZpZWxkID0+IG91dHB1dEZpZWxkICE9PSAncGFzc3dvcmQnKTtcbiAgfVxuXG4gIGlmIChhbGxvd2VkQ29uc3RyYWludEZpZWxkcykge1xuICAgIGNsYXNzQ29uc3RyYWludEZpZWxkcyA9IGNsYXNzQ3VzdG9tRmllbGRzLmZpbHRlcihmaWVsZCA9PiB7XG4gICAgICByZXR1cm4gYWxsb3dlZENvbnN0cmFpbnRGaWVsZHMuaW5jbHVkZXMoZmllbGQpO1xuICAgIH0pO1xuICB9IGVsc2Uge1xuICAgIGNsYXNzQ29uc3RyYWludEZpZWxkcyA9IGNsYXNzRmllbGRzO1xuICB9XG5cbiAgaWYgKGFsbG93ZWRTb3J0RmllbGRzKSB7XG4gICAgY2xhc3NTb3J0RmllbGRzID0gYWxsb3dlZFNvcnRGaWVsZHM7XG4gICAgaWYgKCFjbGFzc1NvcnRGaWVsZHMubGVuZ3RoKSB7XG4gICAgICAvLyBtdXN0IGhhdmUgYXQgbGVhc3QgMSBvcmRlciBmaWVsZFxuICAgICAgLy8gb3RoZXJ3aXNlIHRoZSBGaW5kQXJncyBJbnB1dCBUeXBlIHdpbGwgdGhyb3cuXG4gICAgICBjbGFzc1NvcnRGaWVsZHMucHVzaCh7XG4gICAgICAgIGZpZWxkOiAnaWQnLFxuICAgICAgICBhc2M6IHRydWUsXG4gICAgICAgIGRlc2M6IHRydWUsXG4gICAgICB9KTtcbiAgICB9XG4gIH0gZWxzZSB7XG4gICAgY2xhc3NTb3J0RmllbGRzID0gY2xhc3NGaWVsZHMubWFwKGZpZWxkID0+IHtcbiAgICAgIHJldHVybiB7IGZpZWxkLCBhc2M6IHRydWUsIGRlc2M6IHRydWUgfTtcbiAgICB9KTtcbiAgfVxuXG4gIHJldHVybiB7XG4gICAgY2xhc3NDcmVhdGVGaWVsZHMsXG4gICAgY2xhc3NVcGRhdGVGaWVsZHMsXG4gICAgY2xhc3NDb25zdHJhaW50RmllbGRzLFxuICAgIGNsYXNzT3V0cHV0RmllbGRzLFxuICAgIGNsYXNzU29ydEZpZWxkcyxcbiAgfTtcbn07XG5cbmNvbnN0IGxvYWQgPSAocGFyc2VHcmFwaFFMU2NoZW1hLCBwYXJzZUNsYXNzLCBwYXJzZUNsYXNzQ29uZmlnOiA/UGFyc2VHcmFwaFFMQ2xhc3NDb25maWcpID0+IHtcbiAgY29uc3QgY2xhc3NOYW1lID0gcGFyc2VDbGFzcy5jbGFzc05hbWU7XG4gIGNvbnN0IGdyYXBoUUxDbGFzc05hbWUgPSB0cmFuc2Zvcm1DbGFzc05hbWVUb0dyYXBoUUwoY2xhc3NOYW1lKTtcbiAgY29uc3Qge1xuICAgIGNsYXNzQ3JlYXRlRmllbGRzLFxuICAgIGNsYXNzVXBkYXRlRmllbGRzLFxuICAgIGNsYXNzT3V0cHV0RmllbGRzLFxuICAgIGNsYXNzQ29uc3RyYWludEZpZWxkcyxcbiAgICBjbGFzc1NvcnRGaWVsZHMsXG4gIH0gPSBnZXRJbnB1dEZpZWxkc0FuZENvbnN0cmFpbnRzKHBhcnNlQ2xhc3MsIHBhcnNlQ2xhc3NDb25maWcpO1xuXG4gIGNvbnN0IHtcbiAgICBjcmVhdGU6IGlzQ3JlYXRlRW5hYmxlZCA9IHRydWUsXG4gICAgdXBkYXRlOiBpc1VwZGF0ZUVuYWJsZWQgPSB0cnVlLFxuICB9ID0gZ2V0UGFyc2VDbGFzc011dGF0aW9uQ29uZmlnKHBhcnNlQ2xhc3NDb25maWcpO1xuXG4gIGNvbnN0IGNsYXNzR3JhcGhRTENyZWF0ZVR5cGVOYW1lID0gYENyZWF0ZSR7Z3JhcGhRTENsYXNzTmFtZX1GaWVsZHNJbnB1dGA7XG4gIGxldCBjbGFzc0dyYXBoUUxDcmVhdGVUeXBlID0gbmV3IEdyYXBoUUxJbnB1dE9iamVjdFR5cGUoe1xuICAgIG5hbWU6IGNsYXNzR3JhcGhRTENyZWF0ZVR5cGVOYW1lLFxuICAgIGRlc2NyaXB0aW9uOiBgVGhlICR7Y2xhc3NHcmFwaFFMQ3JlYXRlVHlwZU5hbWV9IGlucHV0IHR5cGUgaXMgdXNlZCBpbiBvcGVyYXRpb25zIHRoYXQgaW52b2x2ZSBjcmVhdGlvbiBvZiBvYmplY3RzIGluIHRoZSAke2dyYXBoUUxDbGFzc05hbWV9IGNsYXNzLmAsXG4gICAgZmllbGRzOiAoKSA9PlxuICAgICAgY2xhc3NDcmVhdGVGaWVsZHMucmVkdWNlKFxuICAgICAgICAoZmllbGRzLCBmaWVsZCkgPT4ge1xuICAgICAgICAgIGNvbnN0IHR5cGUgPSB0cmFuc2Zvcm1JbnB1dFR5cGVUb0dyYXBoUUwoXG4gICAgICAgICAgICBwYXJzZUNsYXNzLmZpZWxkc1tmaWVsZF0udHlwZSxcbiAgICAgICAgICAgIHBhcnNlQ2xhc3MuZmllbGRzW2ZpZWxkXS50YXJnZXRDbGFzcyxcbiAgICAgICAgICAgIHBhcnNlR3JhcGhRTFNjaGVtYS5wYXJzZUNsYXNzVHlwZXNcbiAgICAgICAgICApO1xuICAgICAgICAgIGlmICh0eXBlKSB7XG4gICAgICAgICAgICByZXR1cm4ge1xuICAgICAgICAgICAgICAuLi5maWVsZHMsXG4gICAgICAgICAgICAgIFtmaWVsZF06IHtcbiAgICAgICAgICAgICAgICBkZXNjcmlwdGlvbjogYFRoaXMgaXMgdGhlIG9iamVjdCAke2ZpZWxkfS5gLFxuICAgICAgICAgICAgICAgIHR5cGU6IHBhcnNlQ2xhc3MuZmllbGRzW2ZpZWxkXS5yZXF1aXJlZCA/IG5ldyBHcmFwaFFMTm9uTnVsbCh0eXBlKSA6IHR5cGUsXG4gICAgICAgICAgICAgIH0sXG4gICAgICAgICAgICB9O1xuICAgICAgICAgIH0gZWxzZSB7XG4gICAgICAgICAgICByZXR1cm4gZmllbGRzO1xuICAgICAgICAgIH1cbiAgICAgICAgfSxcbiAgICAgICAge1xuICAgICAgICAgIEFDTDogeyB0eXBlOiBkZWZhdWx0R3JhcGhRTFR5cGVzLkFDTF9JTlBVVCB9LFxuICAgICAgICB9XG4gICAgICApLFxuICB9KTtcbiAgY2xhc3NHcmFwaFFMQ3JlYXRlVHlwZSA9IHBhcnNlR3JhcGhRTFNjaGVtYS5hZGRHcmFwaFFMVHlwZShjbGFzc0dyYXBoUUxDcmVhdGVUeXBlKTtcblxuICBjb25zdCBjbGFzc0dyYXBoUUxVcGRhdGVUeXBlTmFtZSA9IGBVcGRhdGUke2dyYXBoUUxDbGFzc05hbWV9RmllbGRzSW5wdXRgO1xuICBsZXQgY2xhc3NHcmFwaFFMVXBkYXRlVHlwZSA9IG5ldyBHcmFwaFFMSW5wdXRPYmplY3RUeXBlKHtcbiAgICBuYW1lOiBjbGFzc0dyYXBoUUxVcGRhdGVUeXBlTmFtZSxcbiAgICBkZXNjcmlwdGlvbjogYFRoZSAke2NsYXNzR3JhcGhRTFVwZGF0ZVR5cGVOYW1lfSBpbnB1dCB0eXBlIGlzIHVzZWQgaW4gb3BlcmF0aW9ucyB0aGF0IGludm9sdmUgY3JlYXRpb24gb2Ygb2JqZWN0cyBpbiB0aGUgJHtncmFwaFFMQ2xhc3NOYW1lfSBjbGFzcy5gLFxuICAgIGZpZWxkczogKCkgPT5cbiAgICAgIGNsYXNzVXBkYXRlRmllbGRzLnJlZHVjZShcbiAgICAgICAgKGZpZWxkcywgZmllbGQpID0+IHtcbiAgICAgICAgICBjb25zdCB0eXBlID0gdHJhbnNmb3JtSW5wdXRUeXBlVG9HcmFwaFFMKFxuICAgICAgICAgICAgcGFyc2VDbGFzcy5maWVsZHNbZmllbGRdLnR5cGUsXG4gICAgICAgICAgICBwYXJzZUNsYXNzLmZpZWxkc1tmaWVsZF0udGFyZ2V0Q2xhc3MsXG4gICAgICAgICAgICBwYXJzZUdyYXBoUUxTY2hlbWEucGFyc2VDbGFzc1R5cGVzXG4gICAgICAgICAgKTtcbiAgICAgICAgICBpZiAodHlwZSkge1xuICAgICAgICAgICAgcmV0dXJuIHtcbiAgICAgICAgICAgICAgLi4uZmllbGRzLFxuICAgICAgICAgICAgICBbZmllbGRdOiB7XG4gICAgICAgICAgICAgICAgZGVzY3JpcHRpb246IGBUaGlzIGlzIHRoZSBvYmplY3QgJHtmaWVsZH0uYCxcbiAgICAgICAgICAgICAgICB0eXBlLFxuICAgICAgICAgICAgICB9LFxuICAgICAgICAgICAgfTtcbiAgICAgICAgICB9IGVsc2Uge1xuICAgICAgICAgICAgcmV0dXJuIGZpZWxkcztcbiAgICAgICAgICB9XG4gICAgICAgIH0sXG4gICAgICAgIHtcbiAgICAgICAgICBBQ0w6IHsgdHlwZTogZGVmYXVsdEdyYXBoUUxUeXBlcy5BQ0xfSU5QVVQgfSxcbiAgICAgICAgfVxuICAgICAgKSxcbiAgfSk7XG4gIGNsYXNzR3JhcGhRTFVwZGF0ZVR5cGUgPSBwYXJzZUdyYXBoUUxTY2hlbWEuYWRkR3JhcGhRTFR5cGUoY2xhc3NHcmFwaFFMVXBkYXRlVHlwZSk7XG5cbiAgY29uc3QgY2xhc3NHcmFwaFFMUG9pbnRlclR5cGVOYW1lID0gYCR7Z3JhcGhRTENsYXNzTmFtZX1Qb2ludGVySW5wdXRgO1xuICBsZXQgY2xhc3NHcmFwaFFMUG9pbnRlclR5cGUgPSBuZXcgR3JhcGhRTElucHV0T2JqZWN0VHlwZSh7XG4gICAgbmFtZTogY2xhc3NHcmFwaFFMUG9pbnRlclR5cGVOYW1lLFxuICAgIGRlc2NyaXB0aW9uOiBgQWxsb3cgdG8gbGluayBPUiBhZGQgYW5kIGxpbmsgYW4gb2JqZWN0IG9mIHRoZSAke2dyYXBoUUxDbGFzc05hbWV9IGNsYXNzLmAsXG4gICAgZmllbGRzOiAoKSA9PiB7XG4gICAgICBjb25zdCBmaWVsZHMgPSB7XG4gICAgICAgIGxpbms6IHtcbiAgICAgICAgICBkZXNjcmlwdGlvbjogYExpbmsgYW4gZXhpc3Rpbmcgb2JqZWN0IGZyb20gJHtncmFwaFFMQ2xhc3NOYW1lfSBjbGFzcy4gWW91IGNhbiB1c2UgZWl0aGVyIHRoZSBnbG9iYWwgb3IgdGhlIG9iamVjdCBpZC5gLFxuICAgICAgICAgIHR5cGU6IEdyYXBoUUxJRCxcbiAgICAgICAgfSxcbiAgICAgIH07XG4gICAgICBpZiAoaXNDcmVhdGVFbmFibGVkKSB7XG4gICAgICAgIGZpZWxkc1snY3JlYXRlQW5kTGluayddID0ge1xuICAgICAgICAgIGRlc2NyaXB0aW9uOiBgQ3JlYXRlIGFuZCBsaW5rIGFuIG9iamVjdCBmcm9tICR7Z3JhcGhRTENsYXNzTmFtZX0gY2xhc3MuYCxcbiAgICAgICAgICB0eXBlOiBjbGFzc0dyYXBoUUxDcmVhdGVUeXBlLFxuICAgICAgICB9O1xuICAgICAgfVxuICAgICAgcmV0dXJuIGZpZWxkcztcbiAgICB9LFxuICB9KTtcbiAgY2xhc3NHcmFwaFFMUG9pbnRlclR5cGUgPVxuICAgIHBhcnNlR3JhcGhRTFNjaGVtYS5hZGRHcmFwaFFMVHlwZShjbGFzc0dyYXBoUUxQb2ludGVyVHlwZSkgfHwgZGVmYXVsdEdyYXBoUUxUeXBlcy5PQkpFQ1Q7XG5cbiAgY29uc3QgY2xhc3NHcmFwaFFMUmVsYXRpb25UeXBlTmFtZSA9IGAke2dyYXBoUUxDbGFzc05hbWV9UmVsYXRpb25JbnB1dGA7XG4gIGxldCBjbGFzc0dyYXBoUUxSZWxhdGlvblR5cGUgPSBuZXcgR3JhcGhRTElucHV0T2JqZWN0VHlwZSh7XG4gICAgbmFtZTogY2xhc3NHcmFwaFFMUmVsYXRpb25UeXBlTmFtZSxcbiAgICBkZXNjcmlwdGlvbjogYEFsbG93IHRvIGFkZCwgcmVtb3ZlLCBjcmVhdGVBbmRBZGQgb2JqZWN0cyBvZiB0aGUgJHtncmFwaFFMQ2xhc3NOYW1lfSBjbGFzcyBpbnRvIGEgcmVsYXRpb24gZmllbGQuYCxcbiAgICBmaWVsZHM6ICgpID0+IHtcbiAgICAgIGNvbnN0IGZpZWxkcyA9IHtcbiAgICAgICAgYWRkOiB7XG4gICAgICAgICAgZGVzY3JpcHRpb246IGBBZGQgZXhpc3Rpbmcgb2JqZWN0cyBmcm9tIHRoZSAke2dyYXBoUUxDbGFzc05hbWV9IGNsYXNzIGludG8gdGhlIHJlbGF0aW9uLiBZb3UgY2FuIHVzZSBlaXRoZXIgdGhlIGdsb2JhbCBvciB0aGUgb2JqZWN0IGlkcy5gLFxuICAgICAgICAgIHR5cGU6IG5ldyBHcmFwaFFMTGlzdChkZWZhdWx0R3JhcGhRTFR5cGVzLk9CSkVDVF9JRCksXG4gICAgICAgIH0sXG4gICAgICAgIHJlbW92ZToge1xuICAgICAgICAgIGRlc2NyaXB0aW9uOiBgUmVtb3ZlIGV4aXN0aW5nIG9iamVjdHMgZnJvbSB0aGUgJHtncmFwaFFMQ2xhc3NOYW1lfSBjbGFzcyBvdXQgb2YgdGhlIHJlbGF0aW9uLiBZb3UgY2FuIHVzZSBlaXRoZXIgdGhlIGdsb2JhbCBvciB0aGUgb2JqZWN0IGlkcy5gLFxuICAgICAgICAgIHR5cGU6IG5ldyBHcmFwaFFMTGlzdChkZWZhdWx0R3JhcGhRTFR5cGVzLk9CSkVDVF9JRCksXG4gICAgICAgIH0sXG4gICAgICB9O1xuICAgICAgaWYgKGlzQ3JlYXRlRW5hYmxlZCkge1xuICAgICAgICBmaWVsZHNbJ2NyZWF0ZUFuZEFkZCddID0ge1xuICAgICAgICAgIGRlc2NyaXB0aW9uOiBgQ3JlYXRlIGFuZCBhZGQgb2JqZWN0cyBvZiB0aGUgJHtncmFwaFFMQ2xhc3NOYW1lfSBjbGFzcyBpbnRvIHRoZSByZWxhdGlvbi5gLFxuICAgICAgICAgIHR5cGU6IG5ldyBHcmFwaFFMTGlzdChuZXcgR3JhcGhRTE5vbk51bGwoY2xhc3NHcmFwaFFMQ3JlYXRlVHlwZSkpLFxuICAgICAgICB9O1xuICAgICAgfVxuICAgICAgcmV0dXJuIGZpZWxkcztcbiAgICB9LFxuICB9KTtcbiAgY2xhc3NHcmFwaFFMUmVsYXRpb25UeXBlID1cbiAgICBwYXJzZUdyYXBoUUxTY2hlbWEuYWRkR3JhcGhRTFR5cGUoY2xhc3NHcmFwaFFMUmVsYXRpb25UeXBlKSB8fCBkZWZhdWx0R3JhcGhRTFR5cGVzLk9CSkVDVDtcblxuICBjb25zdCBjbGFzc0dyYXBoUUxDb25zdHJhaW50c1R5cGVOYW1lID0gYCR7Z3JhcGhRTENsYXNzTmFtZX1XaGVyZUlucHV0YDtcbiAgbGV0IGNsYXNzR3JhcGhRTENvbnN0cmFpbnRzVHlwZSA9IG5ldyBHcmFwaFFMSW5wdXRPYmplY3RUeXBlKHtcbiAgICBuYW1lOiBjbGFzc0dyYXBoUUxDb25zdHJhaW50c1R5cGVOYW1lLFxuICAgIGRlc2NyaXB0aW9uOiBgVGhlICR7Y2xhc3NHcmFwaFFMQ29uc3RyYWludHNUeXBlTmFtZX0gaW5wdXQgdHlwZSBpcyB1c2VkIGluIG9wZXJhdGlvbnMgdGhhdCBpbnZvbHZlIGZpbHRlcmluZyBvYmplY3RzIG9mICR7Z3JhcGhRTENsYXNzTmFtZX0gY2xhc3MuYCxcbiAgICBmaWVsZHM6ICgpID0+ICh7XG4gICAgICAuLi5jbGFzc0NvbnN0cmFpbnRGaWVsZHMucmVkdWNlKChmaWVsZHMsIGZpZWxkKSA9PiB7XG4gICAgICAgIGlmIChbJ09SJywgJ0FORCcsICdOT1InXS5pbmNsdWRlcyhmaWVsZCkpIHtcbiAgICAgICAgICBwYXJzZUdyYXBoUUxTY2hlbWEubG9nLndhcm4oXG4gICAgICAgICAgICBgRmllbGQgJHtmaWVsZH0gY291bGQgbm90IGJlIGFkZGVkIHRvIHRoZSBhdXRvIHNjaGVtYSAke2NsYXNzR3JhcGhRTENvbnN0cmFpbnRzVHlwZU5hbWV9IGJlY2F1c2UgaXQgY29sbGlkZWQgd2l0aCBhbiBleGlzdGluZyBvbmUuYFxuICAgICAgICAgICk7XG4gICAgICAgICAgcmV0dXJuIGZpZWxkcztcbiAgICAgICAgfVxuICAgICAgICBjb25zdCBwYXJzZUZpZWxkID0gZmllbGQgPT09ICdpZCcgPyAnb2JqZWN0SWQnIDogZmllbGQ7XG4gICAgICAgIGNvbnN0IHR5cGUgPSB0cmFuc2Zvcm1Db25zdHJhaW50VHlwZVRvR3JhcGhRTChcbiAgICAgICAgICBwYXJzZUNsYXNzLmZpZWxkc1twYXJzZUZpZWxkXS50eXBlLFxuICAgICAgICAgIHBhcnNlQ2xhc3MuZmllbGRzW3BhcnNlRmllbGRdLnRhcmdldENsYXNzLFxuICAgICAgICAgIHBhcnNlR3JhcGhRTFNjaGVtYS5wYXJzZUNsYXNzVHlwZXMsXG4gICAgICAgICAgZmllbGRcbiAgICAgICAgKTtcbiAgICAgICAgaWYgKHR5cGUpIHtcbiAgICAgICAgICByZXR1cm4ge1xuICAgICAgICAgICAgLi4uZmllbGRzLFxuICAgICAgICAgICAgW2ZpZWxkXToge1xuICAgICAgICAgICAgICBkZXNjcmlwdGlvbjogYFRoaXMgaXMgdGhlIG9iamVjdCAke2ZpZWxkfS5gLFxuICAgICAgICAgICAgICB0eXBlLFxuICAgICAgICAgICAgfSxcbiAgICAgICAgICB9O1xuICAgICAgICB9IGVsc2Uge1xuICAgICAgICAgIHJldHVybiBmaWVsZHM7XG4gICAgICAgIH1cbiAgICAgIH0sIHt9KSxcbiAgICAgIE9SOiB7XG4gICAgICAgIGRlc2NyaXB0aW9uOiAnVGhpcyBpcyB0aGUgT1Igb3BlcmF0b3IgdG8gY29tcG91bmQgY29uc3RyYWludHMuJyxcbiAgICAgICAgdHlwZTogbmV3IEdyYXBoUUxMaXN0KG5ldyBHcmFwaFFMTm9uTnVsbChjbGFzc0dyYXBoUUxDb25zdHJhaW50c1R5cGUpKSxcbiAgICAgIH0sXG4gICAgICBBTkQ6IHtcbiAgICAgICAgZGVzY3JpcHRpb246ICdUaGlzIGlzIHRoZSBBTkQgb3BlcmF0b3IgdG8gY29tcG91bmQgY29uc3RyYWludHMuJyxcbiAgICAgICAgdHlwZTogbmV3IEdyYXBoUUxMaXN0KG5ldyBHcmFwaFFMTm9uTnVsbChjbGFzc0dyYXBoUUxDb25zdHJhaW50c1R5cGUpKSxcbiAgICAgIH0sXG4gICAgICBOT1I6IHtcbiAgICAgICAgZGVzY3JpcHRpb246ICdUaGlzIGlzIHRoZSBOT1Igb3BlcmF0b3IgdG8gY29tcG91bmQgY29uc3RyYWludHMuJyxcbiAgICAgICAgdHlwZTogbmV3IEdyYXBoUUxMaXN0KG5ldyBHcmFwaFFMTm9uTnVsbChjbGFzc0dyYXBoUUxDb25zdHJhaW50c1R5cGUpKSxcbiAgICAgIH0sXG4gICAgfSksXG4gIH0pO1xuICBjbGFzc0dyYXBoUUxDb25zdHJhaW50c1R5cGUgPVxuICAgIHBhcnNlR3JhcGhRTFNjaGVtYS5hZGRHcmFwaFFMVHlwZShjbGFzc0dyYXBoUUxDb25zdHJhaW50c1R5cGUpIHx8IGRlZmF1bHRHcmFwaFFMVHlwZXMuT0JKRUNUO1xuXG4gIGNvbnN0IGNsYXNzR3JhcGhRTFJlbGF0aW9uQ29uc3RyYWludHNUeXBlTmFtZSA9IGAke2dyYXBoUUxDbGFzc05hbWV9UmVsYXRpb25XaGVyZUlucHV0YDtcbiAgbGV0IGNsYXNzR3JhcGhRTFJlbGF0aW9uQ29uc3RyYWludHNUeXBlID0gbmV3IEdyYXBoUUxJbnB1dE9iamVjdFR5cGUoe1xuICAgIG5hbWU6IGNsYXNzR3JhcGhRTFJlbGF0aW9uQ29uc3RyYWludHNUeXBlTmFtZSxcbiAgICBkZXNjcmlwdGlvbjogYFRoZSAke2NsYXNzR3JhcGhRTFJlbGF0aW9uQ29uc3RyYWludHNUeXBlTmFtZX0gaW5wdXQgdHlwZSBpcyB1c2VkIGluIG9wZXJhdGlvbnMgdGhhdCBpbnZvbHZlIGZpbHRlcmluZyBvYmplY3RzIG9mICR7Z3JhcGhRTENsYXNzTmFtZX0gY2xhc3MuYCxcbiAgICBmaWVsZHM6ICgpID0+ICh7XG4gICAgICBoYXZlOiB7XG4gICAgICAgIGRlc2NyaXB0aW9uOiAnUnVuIGEgcmVsYXRpb25hbC9wb2ludGVyIHF1ZXJ5IHdoZXJlIGF0IGxlYXN0IG9uZSBjaGlsZCBvYmplY3QgY2FuIG1hdGNoLicsXG4gICAgICAgIHR5cGU6IGNsYXNzR3JhcGhRTENvbnN0cmFpbnRzVHlwZSxcbiAgICAgIH0sXG4gICAgICBoYXZlTm90OiB7XG4gICAgICAgIGRlc2NyaXB0aW9uOlxuICAgICAgICAgICdSdW4gYW4gaW52ZXJ0ZWQgcmVsYXRpb25hbC9wb2ludGVyIHF1ZXJ5IHdoZXJlIGF0IGxlYXN0IG9uZSBjaGlsZCBvYmplY3QgY2FuIG1hdGNoLicsXG4gICAgICAgIHR5cGU6IGNsYXNzR3JhcGhRTENvbnN0cmFpbnRzVHlwZSxcbiAgICAgIH0sXG4gICAgICBleGlzdHM6IHtcbiAgICAgICAgZGVzY3JpcHRpb246ICdDaGVjayBpZiB0aGUgcmVsYXRpb24vcG9pbnRlciBjb250YWlucyBvYmplY3RzLicsXG4gICAgICAgIHR5cGU6IEdyYXBoUUxCb29sZWFuLFxuICAgICAgfSxcbiAgICB9KSxcbiAgfSk7XG4gIGNsYXNzR3JhcGhRTFJlbGF0aW9uQ29uc3RyYWludHNUeXBlID1cbiAgICBwYXJzZUdyYXBoUUxTY2hlbWEuYWRkR3JhcGhRTFR5cGUoY2xhc3NHcmFwaFFMUmVsYXRpb25Db25zdHJhaW50c1R5cGUpIHx8XG4gICAgZGVmYXVsdEdyYXBoUUxUeXBlcy5PQkpFQ1Q7XG5cbiAgY29uc3QgY2xhc3NHcmFwaFFMT3JkZXJUeXBlTmFtZSA9IGAke2dyYXBoUUxDbGFzc05hbWV9T3JkZXJgO1xuICBsZXQgY2xhc3NHcmFwaFFMT3JkZXJUeXBlID0gbmV3IEdyYXBoUUxFbnVtVHlwZSh7XG4gICAgbmFtZTogY2xhc3NHcmFwaFFMT3JkZXJUeXBlTmFtZSxcbiAgICBkZXNjcmlwdGlvbjogYFRoZSAke2NsYXNzR3JhcGhRTE9yZGVyVHlwZU5hbWV9IGlucHV0IHR5cGUgaXMgdXNlZCB3aGVuIHNvcnRpbmcgb2JqZWN0cyBvZiB0aGUgJHtncmFwaFFMQ2xhc3NOYW1lfSBjbGFzcy5gLFxuICAgIHZhbHVlczogY2xhc3NTb3J0RmllbGRzLnJlZHVjZSgoc29ydEZpZWxkcywgZmllbGRDb25maWcpID0+IHtcbiAgICAgIGNvbnN0IHsgZmllbGQsIGFzYywgZGVzYyB9ID0gZmllbGRDb25maWc7XG4gICAgICBjb25zdCB1cGRhdGVkU29ydEZpZWxkcyA9IHtcbiAgICAgICAgLi4uc29ydEZpZWxkcyxcbiAgICAgIH07XG4gICAgICBjb25zdCB2YWx1ZSA9IGZpZWxkID09PSAnaWQnID8gJ29iamVjdElkJyA6IGZpZWxkO1xuICAgICAgaWYgKGFzYykge1xuICAgICAgICB1cGRhdGVkU29ydEZpZWxkc1tgJHtmaWVsZH1fQVNDYF0gPSB7IHZhbHVlIH07XG4gICAgICB9XG4gICAgICBpZiAoZGVzYykge1xuICAgICAgICB1cGRhdGVkU29ydEZpZWxkc1tgJHtmaWVsZH1fREVTQ2BdID0geyB2YWx1ZTogYC0ke3ZhbHVlfWAgfTtcbiAgICAgIH1cbiAgICAgIHJldHVybiB1cGRhdGVkU29ydEZpZWxkcztcbiAgICB9LCB7fSksXG4gIH0pO1xuICBjbGFzc0dyYXBoUUxPcmRlclR5cGUgPSBwYXJzZUdyYXBoUUxTY2hlbWEuYWRkR3JhcGhRTFR5cGUoY2xhc3NHcmFwaFFMT3JkZXJUeXBlKTtcblxuICBjb25zdCBjbGFzc0dyYXBoUUxGaW5kQXJncyA9IHtcbiAgICB3aGVyZToge1xuICAgICAgZGVzY3JpcHRpb246ICdUaGVzZSBhcmUgdGhlIGNvbmRpdGlvbnMgdGhhdCB0aGUgb2JqZWN0cyBuZWVkIHRvIG1hdGNoIGluIG9yZGVyIHRvIGJlIGZvdW5kLicsXG4gICAgICB0eXBlOiBjbGFzc0dyYXBoUUxDb25zdHJhaW50c1R5cGUsXG4gICAgfSxcbiAgICBvcmRlcjoge1xuICAgICAgZGVzY3JpcHRpb246ICdUaGUgZmllbGRzIHRvIGJlIHVzZWQgd2hlbiBzb3J0aW5nIHRoZSBkYXRhIGZldGNoZWQuJyxcbiAgICAgIHR5cGU6IGNsYXNzR3JhcGhRTE9yZGVyVHlwZVxuICAgICAgICA/IG5ldyBHcmFwaFFMTGlzdChuZXcgR3JhcGhRTE5vbk51bGwoY2xhc3NHcmFwaFFMT3JkZXJUeXBlKSlcbiAgICAgICAgOiBHcmFwaFFMU3RyaW5nLFxuICAgIH0sXG4gICAgc2tpcDogZGVmYXVsdEdyYXBoUUxUeXBlcy5TS0lQX0FUVCxcbiAgICAuLi5jb25uZWN0aW9uQXJncyxcbiAgICBvcHRpb25zOiBkZWZhdWx0R3JhcGhRTFR5cGVzLlJFQURfT1BUSU9OU19BVFQsXG4gIH07XG4gIGNvbnN0IGNsYXNzR3JhcGhRTE91dHB1dFR5cGVOYW1lID0gYCR7Z3JhcGhRTENsYXNzTmFtZX1gO1xuICBjb25zdCBpbnRlcmZhY2VzID0gW2RlZmF1bHRHcmFwaFFMVHlwZXMuUEFSU0VfT0JKRUNULCBwYXJzZUdyYXBoUUxTY2hlbWEucmVsYXlOb2RlSW50ZXJmYWNlXTtcbiAgY29uc3QgcGFyc2VPYmplY3RGaWVsZHMgPSB7XG4gICAgaWQ6IGdsb2JhbElkRmllbGQoY2xhc3NOYW1lLCBvYmogPT4gb2JqLm9iamVjdElkKSxcbiAgICAuLi5kZWZhdWx0R3JhcGhRTFR5cGVzLlBBUlNFX09CSkVDVF9GSUVMRFMsXG4gICAgLi4uKGNsYXNzTmFtZSA9PT0gJ19Vc2VyJ1xuICAgICAgPyB7XG4gICAgICAgICAgYXV0aERhdGFSZXNwb25zZToge1xuICAgICAgICAgICAgZGVzY3JpcHRpb246IGBhdXRoIHByb3ZpZGVyIHJlc3BvbnNlIHdoZW4gdHJpZ2dlcmVkIG9uIHNpZ25VcC9sb2dJbi5gLFxuICAgICAgICAgICAgdHlwZTogZGVmYXVsdEdyYXBoUUxUeXBlcy5PQkpFQ1QsXG4gICAgICAgICAgfSxcbiAgICAgICAgfVxuICAgICAgOiB7fSksXG4gIH07XG4gIGNvbnN0IG91dHB1dEZpZWxkcyA9ICgpID0+IHtcbiAgICByZXR1cm4gY2xhc3NPdXRwdXRGaWVsZHMucmVkdWNlKChmaWVsZHMsIGZpZWxkKSA9PiB7XG4gICAgICBjb25zdCB0eXBlID0gdHJhbnNmb3JtT3V0cHV0VHlwZVRvR3JhcGhRTChcbiAgICAgICAgcGFyc2VDbGFzcy5maWVsZHNbZmllbGRdLnR5cGUsXG4gICAgICAgIHBhcnNlQ2xhc3MuZmllbGRzW2ZpZWxkXS50YXJnZXRDbGFzcyxcbiAgICAgICAgcGFyc2VHcmFwaFFMU2NoZW1hLnBhcnNlQ2xhc3NUeXBlc1xuICAgICAgKTtcbiAgICAgIGlmIChwYXJzZUNsYXNzLmZpZWxkc1tmaWVsZF0udHlwZSA9PT0gJ1JlbGF0aW9uJykge1xuICAgICAgICBjb25zdCB0YXJnZXRQYXJzZUNsYXNzVHlwZXMgPVxuICAgICAgICAgIHBhcnNlR3JhcGhRTFNjaGVtYS5wYXJzZUNsYXNzVHlwZXNbcGFyc2VDbGFzcy5maWVsZHNbZmllbGRdLnRhcmdldENsYXNzXTtcbiAgICAgICAgY29uc3QgYXJncyA9IHRhcmdldFBhcnNlQ2xhc3NUeXBlcyA/IHRhcmdldFBhcnNlQ2xhc3NUeXBlcy5jbGFzc0dyYXBoUUxGaW5kQXJncyA6IHVuZGVmaW5lZDtcbiAgICAgICAgcmV0dXJuIHtcbiAgICAgICAgICAuLi5maWVsZHMsXG4gICAgICAgICAgW2ZpZWxkXToge1xuICAgICAgICAgICAgZGVzY3JpcHRpb246IGBUaGlzIGlzIHRoZSBvYmplY3QgJHtmaWVsZH0uYCxcbiAgICAgICAgICAgIGFyZ3MsXG4gICAgICAgICAgICB0eXBlOiBwYXJzZUNsYXNzLmZpZWxkc1tmaWVsZF0ucmVxdWlyZWQgPyBuZXcgR3JhcGhRTE5vbk51bGwodHlwZSkgOiB0eXBlLFxuICAgICAgICAgICAgYXN5bmMgcmVzb2x2ZShzb3VyY2UsIGFyZ3MsIGNvbnRleHQsIHF1ZXJ5SW5mbykge1xuICAgICAgICAgICAgICB0cnkge1xuICAgICAgICAgICAgICAgIGNvbnN0IHsgd2hlcmUsIG9yZGVyLCBza2lwLCBmaXJzdCwgYWZ0ZXIsIGxhc3QsIGJlZm9yZSwgb3B0aW9ucyB9ID0gYXJncztcbiAgICAgICAgICAgICAgICBjb25zdCB7IHJlYWRQcmVmZXJlbmNlLCBpbmNsdWRlUmVhZFByZWZlcmVuY2UsIHN1YnF1ZXJ5UmVhZFByZWZlcmVuY2UgfSA9XG4gICAgICAgICAgICAgICAgICBvcHRpb25zIHx8IHt9O1xuICAgICAgICAgICAgICAgIGNvbnN0IHsgY29uZmlnLCBhdXRoLCBpbmZvIH0gPSBjb250ZXh0O1xuICAgICAgICAgICAgICAgIGNvbnN0IHNlbGVjdGVkRmllbGRzID0gZ2V0RmllbGROYW1lcyhxdWVyeUluZm8pO1xuXG4gICAgICAgICAgICAgICAgY29uc3QgeyBrZXlzLCBpbmNsdWRlIH0gPSBleHRyYWN0S2V5c0FuZEluY2x1ZGUoXG4gICAgICAgICAgICAgICAgICBzZWxlY3RlZEZpZWxkc1xuICAgICAgICAgICAgICAgICAgICAuZmlsdGVyKGZpZWxkID0+IGZpZWxkLnN0YXJ0c1dpdGgoJ2VkZ2VzLm5vZGUuJykpXG4gICAgICAgICAgICAgICAgICAgIC5tYXAoZmllbGQgPT4gZmllbGQucmVwbGFjZSgnZWRnZXMubm9kZS4nLCAnJykpXG4gICAgICAgICAgICAgICAgICAgIC5maWx0ZXIoZmllbGQgPT4gZmllbGQuaW5kZXhPZignZWRnZXMubm9kZScpIDwgMClcbiAgICAgICAgICAgICAgICApO1xuICAgICAgICAgICAgICAgIGNvbnN0IHBhcnNlT3JkZXIgPSBvcmRlciAmJiBvcmRlci5qb2luKCcsJyk7XG5cbiAgICAgICAgICAgICAgICByZXR1cm4gb2JqZWN0c1F1ZXJpZXMuZmluZE9iamVjdHMoXG4gICAgICAgICAgICAgICAgICBzb3VyY2VbZmllbGRdLmNsYXNzTmFtZSxcbiAgICAgICAgICAgICAgICAgIHtcbiAgICAgICAgICAgICAgICAgICAgJHJlbGF0ZWRUbzoge1xuICAgICAgICAgICAgICAgICAgICAgIG9iamVjdDoge1xuICAgICAgICAgICAgICAgICAgICAgICAgX190eXBlOiAnUG9pbnRlcicsXG4gICAgICAgICAgICAgICAgICAgICAgICBjbGFzc05hbWU6IGNsYXNzTmFtZSxcbiAgICAgICAgICAgICAgICAgICAgICAgIG9iamVjdElkOiBzb3VyY2Uub2JqZWN0SWQsXG4gICAgICAgICAgICAgICAgICAgICAgfSxcbiAgICAgICAgICAgICAgICAgICAgICBrZXk6IGZpZWxkLFxuICAgICAgICAgICAgICAgICAgICB9LFxuICAgICAgICAgICAgICAgICAgICAuLi4od2hlcmUgfHwge30pLFxuICAgICAgICAgICAgICAgICAgfSxcbiAgICAgICAgICAgICAgICAgIHBhcnNlT3JkZXIsXG4gICAgICAgICAgICAgICAgICBza2lwLFxuICAgICAgICAgICAgICAgICAgZmlyc3QsXG4gICAgICAgICAgICAgICAgICBhZnRlcixcbiAgICAgICAgICAgICAgICAgIGxhc3QsXG4gICAgICAgICAgICAgICAgICBiZWZvcmUsXG4gICAgICAgICAgICAgICAgICBrZXlzLFxuICAgICAgICAgICAgICAgICAgaW5jbHVkZSxcbiAgICAgICAgICAgICAgICAgIGZhbHNlLFxuICAgICAgICAgICAgICAgICAgcmVhZFByZWZlcmVuY2UsXG4gICAgICAgICAgICAgICAgICBpbmNsdWRlUmVhZFByZWZlcmVuY2UsXG4gICAgICAgICAgICAgICAgICBzdWJxdWVyeVJlYWRQcmVmZXJlbmNlLFxuICAgICAgICAgICAgICAgICAgY29uZmlnLFxuICAgICAgICAgICAgICAgICAgYXV0aCxcbiAgICAgICAgICAgICAgICAgIGluZm8sXG4gICAgICAgICAgICAgICAgICBzZWxlY3RlZEZpZWxkcyxcbiAgICAgICAgICAgICAgICAgIHBhcnNlR3JhcGhRTFNjaGVtYS5wYXJzZUNsYXNzZXNcbiAgICAgICAgICAgICAgICApO1xuICAgICAgICAgICAgICB9IGNhdGNoIChlKSB7XG4gICAgICAgICAgICAgICAgcGFyc2VHcmFwaFFMU2NoZW1hLmhhbmRsZUVycm9yKGUpO1xuICAgICAgICAgICAgICB9XG4gICAgICAgICAgICB9LFxuICAgICAgICAgIH0sXG4gICAgICAgIH07XG4gICAgICB9IGVsc2UgaWYgKHBhcnNlQ2xhc3MuZmllbGRzW2ZpZWxkXS50eXBlID09PSAnUG9seWdvbicpIHtcbiAgICAgICAgcmV0dXJuIHtcbiAgICAgICAgICAuLi5maWVsZHMsXG4gICAgICAgICAgW2ZpZWxkXToge1xuICAgICAgICAgICAgZGVzY3JpcHRpb246IGBUaGlzIGlzIHRoZSBvYmplY3QgJHtmaWVsZH0uYCxcbiAgICAgICAgICAgIHR5cGU6IHBhcnNlQ2xhc3MuZmllbGRzW2ZpZWxkXS5yZXF1aXJlZCA/IG5ldyBHcmFwaFFMTm9uTnVsbCh0eXBlKSA6IHR5cGUsXG4gICAgICAgICAgICBhc3luYyByZXNvbHZlKHNvdXJjZSkge1xuICAgICAgICAgICAgICBpZiAoc291cmNlW2ZpZWxkXSAmJiBzb3VyY2VbZmllbGRdLmNvb3JkaW5hdGVzKSB7XG4gICAgICAgICAgICAgICAgcmV0dXJuIHNvdXJjZVtmaWVsZF0uY29vcmRpbmF0ZXMubWFwKGNvb3JkaW5hdGUgPT4gKHtcbiAgICAgICAgICAgICAgICAgIGxhdGl0dWRlOiBjb29yZGluYXRlWzBdLFxuICAgICAgICAgICAgICAgICAgbG9uZ2l0dWRlOiBjb29yZGluYXRlWzFdLFxuICAgICAgICAgICAgICAgIH0pKTtcbiAgICAgICAgICAgICAgfSBlbHNlIHtcbiAgICAgICAgICAgICAgICByZXR1cm4gbnVsbDtcbiAgICAgICAgICAgICAgfVxuICAgICAgICAgICAgfSxcbiAgICAgICAgICB9LFxuICAgICAgICB9O1xuICAgICAgfSBlbHNlIGlmIChwYXJzZUNsYXNzLmZpZWxkc1tmaWVsZF0udHlwZSA9PT0gJ0FycmF5Jykge1xuICAgICAgICByZXR1cm4ge1xuICAgICAgICAgIC4uLmZpZWxkcyxcbiAgICAgICAgICBbZmllbGRdOiB7XG4gICAgICAgICAgICBkZXNjcmlwdGlvbjogYFVzZSBJbmxpbmUgRnJhZ21lbnQgb24gQXJyYXkgdG8gZ2V0IHJlc3VsdHM6IGh0dHBzOi8vZ3JhcGhxbC5vcmcvbGVhcm4vcXVlcmllcy8jaW5saW5lLWZyYWdtZW50c2AsXG4gICAgICAgICAgICB0eXBlOiBwYXJzZUNsYXNzLmZpZWxkc1tmaWVsZF0ucmVxdWlyZWQgPyBuZXcgR3JhcGhRTE5vbk51bGwodHlwZSkgOiB0eXBlLFxuICAgICAgICAgICAgYXN5bmMgcmVzb2x2ZShzb3VyY2UpIHtcbiAgICAgICAgICAgICAgaWYgKCFzb3VyY2VbZmllbGRdKSByZXR1cm4gbnVsbDtcbiAgICAgICAgICAgICAgcmV0dXJuIHNvdXJjZVtmaWVsZF0ubWFwKGFzeW5jIGVsZW0gPT4ge1xuICAgICAgICAgICAgICAgIGlmIChlbGVtLmNsYXNzTmFtZSAmJiBlbGVtLm9iamVjdElkICYmIGVsZW0uX190eXBlID09PSAnT2JqZWN0Jykge1xuICAgICAgICAgICAgICAgICAgcmV0dXJuIGVsZW07XG4gICAgICAgICAgICAgICAgfSBlbHNlIHtcbiAgICAgICAgICAgICAgICAgIHJldHVybiB7IHZhbHVlOiBlbGVtIH07XG4gICAgICAgICAgICAgICAgfVxuICAgICAgICAgICAgICB9KTtcbiAgICAgICAgICAgIH0sXG4gICAgICAgICAgfSxcbiAgICAgICAgfTtcbiAgICAgIH0gZWxzZSBpZiAodHlwZSkge1xuICAgICAgICByZXR1cm4ge1xuICAgICAgICAgIC4uLmZpZWxkcyxcbiAgICAgICAgICBbZmllbGRdOiB7XG4gICAgICAgICAgICBkZXNjcmlwdGlvbjogYFRoaXMgaXMgdGhlIG9iamVjdCAke2ZpZWxkfS5gLFxuICAgICAgICAgICAgdHlwZTogcGFyc2VDbGFzcy5maWVsZHNbZmllbGRdLnJlcXVpcmVkID8gbmV3IEdyYXBoUUxOb25OdWxsKHR5cGUpIDogdHlwZSxcbiAgICAgICAgICB9LFxuICAgICAgICB9O1xuICAgICAgfSBlbHNlIHtcbiAgICAgICAgcmV0dXJuIGZpZWxkcztcbiAgICAgIH1cbiAgICB9LCBwYXJzZU9iamVjdEZpZWxkcyk7XG4gIH07XG4gIGxldCBjbGFzc0dyYXBoUUxPdXRwdXRUeXBlID0gbmV3IEdyYXBoUUxPYmplY3RUeXBlKHtcbiAgICBuYW1lOiBjbGFzc0dyYXBoUUxPdXRwdXRUeXBlTmFtZSxcbiAgICBkZXNjcmlwdGlvbjogYFRoZSAke2NsYXNzR3JhcGhRTE91dHB1dFR5cGVOYW1lfSBvYmplY3QgdHlwZSBpcyB1c2VkIGluIG9wZXJhdGlvbnMgdGhhdCBpbnZvbHZlIG91dHB1dHRpbmcgb2JqZWN0cyBvZiAke2dyYXBoUUxDbGFzc05hbWV9IGNsYXNzLmAsXG4gICAgaW50ZXJmYWNlcyxcbiAgICBmaWVsZHM6IG91dHB1dEZpZWxkcyxcbiAgfSk7XG4gIGNsYXNzR3JhcGhRTE91dHB1dFR5cGUgPSBwYXJzZUdyYXBoUUxTY2hlbWEuYWRkR3JhcGhRTFR5cGUoY2xhc3NHcmFwaFFMT3V0cHV0VHlwZSk7XG5cbiAgY29uc3QgeyBjb25uZWN0aW9uVHlwZSwgZWRnZVR5cGUgfSA9IGNvbm5lY3Rpb25EZWZpbml0aW9ucyh7XG4gICAgbmFtZTogZ3JhcGhRTENsYXNzTmFtZSxcbiAgICBjb25uZWN0aW9uRmllbGRzOiB7XG4gICAgICBjb3VudDogZGVmYXVsdEdyYXBoUUxUeXBlcy5DT1VOVF9BVFQsXG4gICAgfSxcbiAgICBub2RlVHlwZTogY2xhc3NHcmFwaFFMT3V0cHV0VHlwZSB8fCBkZWZhdWx0R3JhcGhRTFR5cGVzLk9CSkVDVCxcbiAgfSk7XG4gIGxldCBjbGFzc0dyYXBoUUxGaW5kUmVzdWx0VHlwZSA9IHVuZGVmaW5lZDtcbiAgaWYgKFxuICAgIHBhcnNlR3JhcGhRTFNjaGVtYS5hZGRHcmFwaFFMVHlwZShlZGdlVHlwZSkgJiZcbiAgICBwYXJzZUdyYXBoUUxTY2hlbWEuYWRkR3JhcGhRTFR5cGUoY29ubmVjdGlvblR5cGUsIGZhbHNlLCBmYWxzZSwgdHJ1ZSlcbiAgKSB7XG4gICAgY2xhc3NHcmFwaFFMRmluZFJlc3VsdFR5cGUgPSBjb25uZWN0aW9uVHlwZTtcbiAgfVxuXG4gIHBhcnNlR3JhcGhRTFNjaGVtYS5wYXJzZUNsYXNzVHlwZXNbY2xhc3NOYW1lXSA9IHtcbiAgICBjbGFzc0dyYXBoUUxQb2ludGVyVHlwZSxcbiAgICBjbGFzc0dyYXBoUUxSZWxhdGlvblR5cGUsXG4gICAgY2xhc3NHcmFwaFFMQ3JlYXRlVHlwZSxcbiAgICBjbGFzc0dyYXBoUUxVcGRhdGVUeXBlLFxuICAgIGNsYXNzR3JhcGhRTENvbnN0cmFpbnRzVHlwZSxcbiAgICBjbGFzc0dyYXBoUUxSZWxhdGlvbkNvbnN0cmFpbnRzVHlwZSxcbiAgICBjbGFzc0dyYXBoUUxGaW5kQXJncyxcbiAgICBjbGFzc0dyYXBoUUxPdXRwdXRUeXBlLFxuICAgIGNsYXNzR3JhcGhRTEZpbmRSZXN1bHRUeXBlLFxuICAgIGNvbmZpZzoge1xuICAgICAgcGFyc2VDbGFzc0NvbmZpZyxcbiAgICAgIGlzQ3JlYXRlRW5hYmxlZCxcbiAgICAgIGlzVXBkYXRlRW5hYmxlZCxcbiAgICB9LFxuICB9O1xuXG4gIGlmIChjbGFzc05hbWUgPT09ICdfVXNlcicpIHtcbiAgICBjb25zdCB2aWV3ZXJUeXBlID0gbmV3IEdyYXBoUUxPYmplY3RUeXBlKHtcbiAgICAgIG5hbWU6ICdWaWV3ZXInLFxuICAgICAgZGVzY3JpcHRpb246IGBUaGUgVmlld2VyIG9iamVjdCB0eXBlIGlzIHVzZWQgaW4gb3BlcmF0aW9ucyB0aGF0IGludm9sdmUgb3V0cHV0dGluZyB0aGUgY3VycmVudCB1c2VyIGRhdGEuYCxcbiAgICAgIGZpZWxkczogKCkgPT4gKHtcbiAgICAgICAgc2Vzc2lvblRva2VuOiBkZWZhdWx0R3JhcGhRTFR5cGVzLlNFU1NJT05fVE9LRU5fQVRULFxuICAgICAgICB1c2VyOiB7XG4gICAgICAgICAgZGVzY3JpcHRpb246ICdUaGlzIGlzIHRoZSBjdXJyZW50IHVzZXIuJyxcbiAgICAgICAgICB0eXBlOiBuZXcgR3JhcGhRTE5vbk51bGwoY2xhc3NHcmFwaFFMT3V0cHV0VHlwZSksXG4gICAgICAgIH0sXG4gICAgICB9KSxcbiAgICB9KTtcbiAgICBwYXJzZUdyYXBoUUxTY2hlbWEuYWRkR3JhcGhRTFR5cGUodmlld2VyVHlwZSwgdHJ1ZSwgdHJ1ZSk7XG4gICAgcGFyc2VHcmFwaFFMU2NoZW1hLnZpZXdlclR5cGUgPSB2aWV3ZXJUeXBlO1xuICB9XG59O1xuXG5leHBvcnQgeyBleHRyYWN0S2V5c0FuZEluY2x1ZGUsIGxvYWQgfTtcbiJdLCJtYXBwaW5ncyI6Ijs7Ozs7Ozs7Ozs7O0FBQ0E7QUFVQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUEwRjtBQUFBO0FBQUE7QUFBQTtBQUFBO0FBQUE7QUFBQTtBQUFBO0FBRTFGLE1BQU1BLHVCQUF1QixHQUFHLFVBQVVDLGdCQUEwQyxFQUFFO0VBQ3BGLE9BQVFBLGdCQUFnQixJQUFJQSxnQkFBZ0IsQ0FBQ0MsSUFBSSxJQUFLLENBQUMsQ0FBQztBQUMxRCxDQUFDO0FBRUQsTUFBTUMsNEJBQTRCLEdBQUcsVUFDbkNDLFVBQVUsRUFDVkgsZ0JBQTBDLEVBQzFDO0VBQ0EsTUFBTUksV0FBVyxHQUFHQyxNQUFNLENBQUNDLElBQUksQ0FBQ0gsVUFBVSxDQUFDSSxNQUFNLENBQUMsQ0FBQ0MsTUFBTSxDQUFDLElBQUksQ0FBQztFQUMvRCxNQUFNO0lBQ0pDLFdBQVcsRUFBRUMsa0JBQWtCO0lBQy9CQyxZQUFZLEVBQUVDLG1CQUFtQjtJQUNqQ0MsZ0JBQWdCLEVBQUVDLHVCQUF1QjtJQUN6Q0MsVUFBVSxFQUFFQztFQUNkLENBQUMsR0FBR2pCLHVCQUF1QixDQUFDQyxnQkFBZ0IsQ0FBQztFQUU3QyxJQUFJaUIsaUJBQWlCO0VBQ3JCLElBQUlDLGlCQUFpQjtFQUNyQixJQUFJQyxpQkFBaUI7RUFDckIsSUFBSUMscUJBQXFCO0VBQ3pCLElBQUlDLGVBQWU7O0VBRW5CO0VBQ0EsTUFBTUMsaUJBQWlCLEdBQUdsQixXQUFXLENBQUNtQixNQUFNLENBQUNDLEtBQUssSUFBSTtJQUNw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