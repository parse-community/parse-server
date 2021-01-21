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

      if (asc) {
        updatedSortFields[`${field}_ASC`] = {};
      }

      if (desc) {
        updatedSortFields[`${field}_DESC`] = {};
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
                return objectsQueries.findObjects(source[field].className, _objectSpread({
                  $relatedTo: {
                    object: {
                      __type: 'Pointer',
                      className: className,
                      objectId: source.objectId
                    },
                    key: field
                  }
                }, where || {}), order, skip, first, after, last, before, keys, include, false, readPreference, includeReadPreference, subqueryReadPreference, config, auth, info, selectedFields, parseGraphQLSchema.parseClasses);
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
//# sourceMappingURL=data:application/json;charset=utf-8;base64,eyJ2ZXJzaW9uIjozLCJzb3VyY2VzIjpbIi4uLy4uLy4uL3NyYy9HcmFwaFFML2xvYWRlcnMvcGFyc2VDbGFzc1R5cGVzLmpzIl0sIm5hbWVzIjpbImdldFBhcnNlQ2xhc3NUeXBlQ29uZmlnIiwicGFyc2VDbGFzc0NvbmZpZyIsInR5cGUiLCJnZXRJbnB1dEZpZWxkc0FuZENvbnN0cmFpbnRzIiwicGFyc2VDbGFzcyIsImNsYXNzRmllbGRzIiwiT2JqZWN0Iiwia2V5cyIsImZpZWxkcyIsImNvbmNhdCIsImlucHV0RmllbGRzIiwiYWxsb3dlZElucHV0RmllbGRzIiwib3V0cHV0RmllbGRzIiwiYWxsb3dlZE91dHB1dEZpZWxkcyIsImNvbnN0cmFpbnRGaWVsZHMiLCJhbGxvd2VkQ29uc3RyYWludEZpZWxkcyIsInNvcnRGaWVsZHMiLCJhbGxvd2VkU29ydEZpZWxkcyIsImNsYXNzT3V0cHV0RmllbGRzIiwiY2xhc3NDcmVhdGVGaWVsZHMiLCJjbGFzc1VwZGF0ZUZpZWxkcyIsImNsYXNzQ29uc3RyYWludEZpZWxkcyIsImNsYXNzU29ydEZpZWxkcyIsImNsYXNzQ3VzdG9tRmllbGRzIiwiZmlsdGVyIiwiZmllbGQiLCJkZWZhdWx0R3JhcGhRTFR5cGVzIiwiUEFSU0VfT0JKRUNUX0ZJRUxEUyIsImluY2x1ZGVzIiwiY3JlYXRlIiwidXBkYXRlIiwiY2xhc3NOYW1lIiwib3V0cHV0RmllbGQiLCJsZW5ndGgiLCJwdXNoIiwiYXNjIiwiZGVzYyIsIm1hcCIsImxvYWQiLCJwYXJzZUdyYXBoUUxTY2hlbWEiLCJncmFwaFFMQ2xhc3NOYW1lIiwiaXNDcmVhdGVFbmFibGVkIiwiaXNVcGRhdGVFbmFibGVkIiwiY2xhc3NHcmFwaFFMQ3JlYXRlVHlwZU5hbWUiLCJjbGFzc0dyYXBoUUxDcmVhdGVUeXBlIiwiR3JhcGhRTElucHV0T2JqZWN0VHlwZSIsIm5hbWUiLCJkZXNjcmlwdGlvbiIsInJlZHVjZSIsInRhcmdldENsYXNzIiwicGFyc2VDbGFzc1R5cGVzIiwicmVxdWlyZWQiLCJHcmFwaFFMTm9uTnVsbCIsIkFDTCIsIkFDTF9JTlBVVCIsImFkZEdyYXBoUUxUeXBlIiwiY2xhc3NHcmFwaFFMVXBkYXRlVHlwZU5hbWUiLCJjbGFzc0dyYXBoUUxVcGRhdGVUeXBlIiwiY2xhc3NHcmFwaFFMUG9pbnRlclR5cGVOYW1lIiwiY2xhc3NHcmFwaFFMUG9pbnRlclR5cGUiLCJsaW5rIiwiR3JhcGhRTElEIiwiT0JKRUNUIiwiY2xhc3NHcmFwaFFMUmVsYXRpb25UeXBlTmFtZSIsImNsYXNzR3JhcGhRTFJlbGF0aW9uVHlwZSIsImFkZCIsIkdyYXBoUUxMaXN0IiwiT0JKRUNUX0lEIiwicmVtb3ZlIiwiY2xhc3NHcmFwaFFMQ29uc3RyYWludHNUeXBlTmFtZSIsImNsYXNzR3JhcGhRTENvbnN0cmFpbnRzVHlwZSIsImxvZyIsIndhcm4iLCJwYXJzZUZpZWxkIiwiT1IiLCJBTkQiLCJOT1IiLCJjbGFzc0dyYXBoUUxSZWxhdGlvbkNvbnN0cmFpbnRzVHlwZU5hbWUiLCJjbGFzc0dyYXBoUUxSZWxhdGlvbkNvbnN0cmFpbnRzVHlwZSIsImhhdmUiLCJoYXZlTm90IiwiZXhpc3RzIiwiR3JhcGhRTEJvb2xlYW4iLCJjbGFzc0dyYXBoUUxPcmRlclR5cGVOYW1lIiwiY2xhc3NHcmFwaFFMT3JkZXJUeXBlIiwiR3JhcGhRTEVudW1UeXBlIiwidmFsdWVzIiwiZmllbGRDb25maWciLCJ1cGRhdGVkU29ydEZpZWxkcyIsImNsYXNzR3JhcGhRTEZpbmRBcmdzIiwid2hlcmUiLCJvcmRlciIsIkdyYXBoUUxTdHJpbmciLCJza2lwIiwiU0tJUF9BVFQiLCJjb25uZWN0aW9uQXJncyIsIm9wdGlvbnMiLCJSRUFEX09QVElPTlNfQVRUIiwiY2xhc3NHcmFwaFFMT3V0cHV0VHlwZU5hbWUiLCJpbnRlcmZhY2VzIiwiUEFSU0VfT0JKRUNUIiwicmVsYXlOb2RlSW50ZXJmYWNlIiwicGFyc2VPYmplY3RGaWVsZHMiLCJpZCIsIm9iaiIsIm9iamVjdElkIiwidGFyZ2V0UGFyc2VDbGFzc1R5cGVzIiwiYXJncyIsInVuZGVmaW5lZCIsInJlc29sdmUiLCJzb3VyY2UiLCJjb250ZXh0IiwicXVlcnlJbmZvIiwiZmlyc3QiLCJhZnRlciIsImxhc3QiLCJiZWZvcmUiLCJyZWFkUHJlZmVyZW5jZSIsImluY2x1ZGVSZWFkUHJlZmVyZW5jZSIsInN1YnF1ZXJ5UmVhZFByZWZlcmVuY2UiLCJjb25maWciLCJhdXRoIiwiaW5mbyIsInNlbGVjdGVkRmllbGRzIiwiaW5jbHVkZSIsInN0YXJ0c1dpdGgiLCJyZXBsYWNlIiwib2JqZWN0c1F1ZXJpZXMiLCJmaW5kT2JqZWN0cyIsIiRyZWxhdGVkVG8iLCJvYmplY3QiLCJfX3R5cGUiLCJrZXkiLCJwYXJzZUNsYXNzZXMiLCJlIiwiaGFuZGxlRXJyb3IiLCJjb29yZGluYXRlcyIsImNvb3JkaW5hdGUiLCJsYXRpdHVkZSIsImxvbmdpdHVkZSIsImVsZW0iLCJ2YWx1ZSIsImNsYXNzR3JhcGhRTE91dHB1dFR5cGUiLCJHcmFwaFFMT2JqZWN0VHlwZSIsImNvbm5lY3Rpb25UeXBlIiwiZWRnZVR5cGUiLCJjb25uZWN0aW9uRmllbGRzIiwiY291bnQiLCJDT1VOVF9BVFQiLCJub2RlVHlwZSIsImNsYXNzR3JhcGhRTEZpbmRSZXN1bHRUeXBlIiwidmlld2VyVHlwZSIsInNlc3Npb25Ub2tlbiIsIlNFU1NJT05fVE9LRU5fQVRUIiwidXNlciJdLCJtYXBwaW5ncyI6Ijs7Ozs7Ozs7Ozs7OztBQUFBOztBQVVBOztBQUtBOztBQUNBOztBQUNBOztBQUNBOztBQUNBOztBQUNBOztBQUNBOztBQUNBOztBQUNBOzs7Ozs7Ozs7Ozs7OztBQUtBLE1BQU1BLHVCQUF1QixHQUFHLFVBQzlCQyxnQkFEOEIsRUFFOUI7QUFDQSxTQUFRQSxnQkFBZ0IsSUFBSUEsZ0JBQWdCLENBQUNDLElBQXRDLElBQStDLEVBQXREO0FBQ0QsQ0FKRDs7QUFNQSxNQUFNQyw0QkFBNEIsR0FBRyxVQUNuQ0MsVUFEbUMsRUFFbkNILGdCQUZtQyxFQUduQztBQUNBLFFBQU1JLFdBQVcsR0FBR0MsTUFBTSxDQUFDQyxJQUFQLENBQVlILFVB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LE1BQUFBLGVBRk07QUFHTkMsTUFBQUE7QUFITTtBQVZzQyxHQUFoRDs7QUFpQkEsTUFBSVgsU0FBUyxLQUFLLE9BQWxCLEVBQTJCO0FBQ3pCLFVBQU13SCxVQUFVLEdBQUcsSUFBSVIsMEJBQUosQ0FBc0I7QUFDdkNqRyxNQUFBQSxJQUFJLEVBQUUsUUFEaUM7QUFFdkNDLE1BQUFBLFdBQVcsRUFBRyw2RkFGeUI7QUFHdkN2QyxNQUFBQSxNQUFNLEVBQUUsT0FBTztBQUNiZ0osUUFBQUEsWUFBWSxFQUFFOUgsbUJBQW1CLENBQUMrSCxpQkFEckI7QUFFYkMsUUFBQUEsSUFBSSxFQUFFO0FBQ0ozRyxVQUFBQSxXQUFXLEVBQUUsMkJBRFQ7QUFFSjdDLFVBQUFBLElBQUksRUFBRSxJQUFJa0QsdUJBQUosQ0FBbUIwRixzQkFBbkI7QUFGRjtBQUZPLE9BQVA7QUFIK0IsS0FBdEIsQ0FBbkI7QUFXQXZHLElBQUFBLGtCQUFrQixDQUFDZ0IsY0FBbkIsQ0FBa0NnRyxVQUFsQyxFQUE4QyxJQUE5QyxFQUFvRCxJQUFwRDtBQUNBaEgsSUFBQUEsa0JBQWtCLENBQUNnSCxVQUFuQixHQUFnQ0EsVUFBaEM7QUFDRDtBQUNGLENBbGREIiwic291cmNlc0NvbnRlbnQiOlsiaW1wb3J0IHtcbiAgR3JhcGhRTElELFxuICBHcmFwaFFMT2JqZWN0VHlwZSxcbiAgR3JhcGhRTFN0cmluZyxcbiAgR3JhcGhRTExpc3QsXG4gIEdyYXBoUUxJbnB1dE9iamVjdFR5cGUsXG4gIEdyYXBoUUxOb25OdWxsLFxuICBHcmFwaFFMQm9vbGVhbixcbiAgR3JhcGhRTEVudW1UeXBlLFxufSBmcm9tICdncmFwaHFsJztcbmltcG9ydCB7XG4gIGdsb2JhbElkRmllbGQsXG4gIGNvbm5lY3Rpb25BcmdzLFxuICBjb25uZWN0aW9uRGVmaW5pdGlvbnMsXG59IGZyb20gJ2dyYXBocWwtcmVsYXknO1xuaW1wb3J0IGdldEZpZWxkTmFtZXMgZnJvbSAnZ3JhcGhxbC1saXN0LWZpZWxkcyc7XG5pbXBvcnQgKiBhcyBkZWZhdWx0R3JhcGhRTFR5cGVzIGZyb20gJy4vZGVmYXVsdEdyYXBoUUxUeXBlcyc7XG5pbXBvcnQgKiBhcyBvYmplY3RzUXVlcmllcyBmcm9tICcuLi9oZWxwZXJzL29iamVjdHNRdWVyaWVzJztcbmltcG9ydCB7IFBhcnNlR3JhcGhRTENsYXNzQ29uZmlnIH0gZnJvbSAnLi4vLi4vQ29udHJvbGxlcnMvUGFyc2VHcmFwaFFMQ29udHJvbGxlcic7XG5pbXBvcnQgeyB0cmFuc2Zvcm1DbGFzc05hbWVUb0dyYXBoUUwgfSBmcm9tICcuLi90cmFuc2Zvcm1lcnMvY2xhc3NOYW1lJztcbmltcG9ydCB7IHRyYW5zZm9ybUlucHV0VHlwZVRvR3JhcGhRTCB9IGZyb20gJy4uL3RyYW5zZm9ybWVycy9pbnB1dFR5cGUnO1xuaW1wb3J0IHsgdHJhbnNmb3JtT3V0cHV0VHlwZVRvR3JhcGhRTCB9IGZyb20gJy4uL3RyYW5zZm9ybWVycy9vdXRwdXRUeXBlJztcbmltcG9ydCB7IHRyYW5zZm9ybUNvbnN0cmFpbnRUeXBlVG9HcmFwaFFMIH0gZnJvbSAnLi4vdHJhbnNmb3JtZXJzL2NvbnN0cmFpbnRUeXBlJztcbmltcG9ydCB7XG4gIGV4dHJhY3RLZXlzQW5kSW5jbHVkZSxcbiAgZ2V0UGFyc2VDbGFzc011dGF0aW9uQ29uZmlnLFxufSBmcm9tICcuLi9wYXJzZUdyYXBoUUxVdGlscyc7XG5cbmNvbnN0IGdldFBhcnNlQ2xhc3NUeXBlQ29uZmlnID0gZnVuY3Rpb24oXG4gIHBhcnNlQ2xhc3NDb25maWc6ID9QYXJzZUdyYXBoUUxDbGFzc0NvbmZpZ1xuKSB7XG4gIHJldHVybiAocGFyc2VDbGFzc0NvbmZpZyAmJiBwYXJzZUNsYXNzQ29uZmlnLnR5cGUpIHx8IHt9O1xufTtcblxuY29uc3QgZ2V0SW5wdXRGaWVsZHNBbmRDb25zdHJhaW50cyA9IGZ1bmN0aW9uKFxuICBwYXJzZUNsYXNzLFxuICBwYXJzZUNsYXNzQ29uZmlnOiA/UGFyc2VHcmFwaFFMQ2xhc3NDb25maWdcbikge1xuICBjb25zdCBjbGFzc0ZpZWxkcyA9IE9iamVjdC5rZXlzKHBhcnNlQ2xhc3MuZmllbGRzKS5jb25jYXQoJ2lkJyk7XG4gIGNvbnN0IHtcbiAgICBpbnB1dEZpZWxkczogYWxsb3dlZElucHV0RmllbGRzLFxuICAgIG91dHB1dEZpZWxkczogYWxsb3dlZE91dHB1dEZpZWxkcyxcbiAgICBjb25zdHJhaW50RmllbGRzOiBhbGxvd2VkQ29uc3RyYWludEZpZWxkcyxcbiAgICBzb3J0RmllbGRzOiBhbGxvd2VkU29ydEZpZWxkcyxcbiAgfSA9IGdldFBhcnNlQ2xhc3NUeXBlQ29uZmlnKHBhcnNlQ2xhc3NDb25maWcpO1xuXG4gIGxldCBjbGFzc091dHB1dEZpZWxkcztcbiAgbGV0IGNsYXNzQ3JlYXRlRmllbGRzO1xuICBsZXQgY2xhc3NVcGRhdGVGaWVsZHM7XG4gIGxldCBjbGFzc0NvbnN0cmFpbnRGaWVsZHM7XG4gIGxldCBjbGFzc1NvcnRGaWVsZHM7XG5cbiAgLy8gQWxsIGFsbG93ZWQgY3VzdG9tcyBmaWVsZHNcbiAgY29uc3QgY2xhc3NDdXN0b21GaWVsZHMgPSBjbGFzc0ZpZWxkcy5maWx0ZXIoZmllbGQgPT4ge1xuICAgIHJldHVybiAoXG4gICAgICAhT2JqZWN0LmtleXMoZGVmYXVsdEdyYXBoUUxUeXBlcy5QQVJTRV9PQkpFQ1RfRklFTERTKS5pbmNsdWRlcyhmaWVsZCkgJiZcbiAgICAgIGZpZWxkICE9PSAnaWQnXG4gICAgKTtcbiAgfSk7XG5cbiAgaWYgKGFsbG93ZWRJbnB1dEZpZWxkcyAmJiBhbGxvd2VkSW5wdXRGaWVsZHMuY3JlYXRlKSB7XG4gICAgY2xhc3NDcmVhdGVGaWVsZHMgPSBjbGFzc0N1c3RvbUZpZWxkcy5maWx0ZXIoZmllbGQgPT4ge1xuICAgICAgcmV0dXJuIGFsbG93ZWRJbnB1dEZpZWxkcy5jcmVhdGUuaW5jbHVkZXMoZmllbGQpO1xuICAgIH0pO1xuICB9IGVsc2Uge1xuICAgIGNsYXNzQ3JlYXRlRmllbGRzID0gY2xhc3NDdXN0b21GaWVsZHM7XG4gIH1cbiAgaWYgKGFsbG93ZWRJbnB1dEZpZWxkcyAmJiBhbGxvd2VkSW5wdXRGaWVsZHMudXBkYXRlKSB7XG4gICAgY2xhc3NVcGRhdGVGaWVsZHMgPSBjbGFzc0N1c3RvbUZpZWxkcy5maWx0ZXIoZmllbGQgPT4ge1xuICAgICAgcmV0dXJuIGFsbG93ZWRJbnB1dEZpZWxkcy51cGRhdGUuaW5jbHVkZXMoZmllbGQpO1xuICAgIH0pO1xuICB9IGVsc2Uge1xuICAgIGNsYXNzVXBkYXRlRmllbGRzID0gY2xhc3NDdXN0b21GaWVsZHM7XG4gIH1cblxuICBpZiAoYWxsb3dlZE91dHB1dEZpZWxkcykge1xuICAgIGNsYXNzT3V0cHV0RmllbGRzID0gY2xhc3NDdXN0b21GaWVsZHMuZmlsdGVyKGZpZWxkID0+IHtcbiAgICAgIHJldHVybiBhbGxvd2VkT3V0cHV0RmllbGRzLmluY2x1ZGVzKGZpZWxkKTtcbiAgICB9KTtcbiAgfSBlbHNlIHtcbiAgICBjbGFzc091dHB1dEZpZWxkcyA9IGNsYXNzQ3VzdG9tRmllbGRzO1xuICB9XG4gIC8vIEZpbHRlcnMgdGhlIFwicGFzc3dvcmRcIiBmaWVsZCBmcm9tIGNsYXNzIF9Vc2VyXG4gIGlmIChwYXJzZUNsYXNzLmNsYXNzTmFtZSA9PT0gJ19Vc2VyJykge1xuICAgIGNsYXNzT3V0cHV0RmllbGRzID0gY2xhc3NPdXRwdXRGaWVsZHMuZmlsdGVyKFxuICAgICAgb3V0cHV0RmllbGQgPT4gb3V0cHV0RmllbGQgIT09ICdwYXNzd29yZCdcbiAgICApO1xuICB9XG5cbiAgaWYgKGFsbG93ZWRDb25zdHJhaW50RmllbGRzKSB7XG4gICAgY2xhc3NDb25zdHJhaW50RmllbGRzID0gY2xhc3NDdXN0b21GaWVsZHMuZmlsdGVyKGZpZWxkID0+IHtcbiAgICAgIHJldHVybiBhbGxvd2VkQ29uc3RyYWludEZpZWxkcy5pbmNsdWRlcyhmaWVsZCk7XG4gICAgfSk7XG4gIH0gZWxzZSB7XG4gICAgY2xhc3NDb25zdHJhaW50RmllbGRzID0gY2xhc3NGaWVsZHM7XG4gIH1cblxuICBpZiAoYWxsb3dlZFNvcnRGaWVsZHMpIHtcbiAgICBjbGFzc1NvcnRGaWVsZHMgPSBhbGxvd2VkU29ydEZpZWxkcztcbiAgICBpZiAoIWNsYXNzU29ydEZpZWxkcy5sZW5ndGgpIHtcbiAgICAgIC8vIG11c3QgaGF2ZSBhdCBsZWFzdCAxIG9yZGVyIGZpZWxkXG4gICAgICAvLyBvdGhlcndpc2UgdGhlIEZpbmRBcmdzIElucHV0IFR5cGUgd2lsbCB0aHJvdy5cbiAgICAgIGNsYXNzU29ydEZpZWxkcy5wdXNoKHtcbiAgICAgICAgZmllbGQ6ICdpZCcsXG4gICAgICAgIGFzYzogdHJ1ZSxcbiAgICAgICAgZGVzYzogdHJ1ZSxcbiAgICAgIH0pO1xuICAgIH1cbiAgfSBlbHNlIHtcbiAgICBjbGFzc1NvcnRGaWVsZHMgPSBjbGFzc0ZpZWxkcy5tYXAoZmllbGQgPT4ge1xuICAgICAgcmV0dXJuIHsgZmllbGQsIGFzYzogdHJ1ZSwgZGVzYzogdHJ1ZSB9O1xuICAgIH0pO1xuICB9XG5cbiAgcmV0dXJuIHtcbiAgICBjbGFzc0NyZWF0ZUZpZWxkcyxcbiAgICBjbGFzc1VwZGF0ZUZpZWxkcyxcbiAgICBjbGFzc0NvbnN0cmFpbnRGaWVsZHMsXG4gICAgY2xhc3NPdXRwdXRGaWVsZHMsXG4gICAgY2xhc3NTb3J0RmllbGRzLFxuICB9O1xufTtcblxuY29uc3QgbG9hZCA9IChcbiAgcGFyc2VHcmFwaFFMU2NoZW1hLFxuICBwYXJzZUNsYXNzLFxuICBwYXJzZUNsYXNzQ29uZmlnOiA/UGFyc2VHcmFwaFFMQ2xhc3NDb25maWdcbikgPT4ge1xuICBjb25zdCBjbGFzc05hbWUgPSBwYXJzZUNsYXNzLmNsYXNzTmFtZTtcbiAgY29uc3QgZ3JhcGhRTENsYXNzTmFtZSA9IHRyYW5zZm9ybUNsYXNzTmFtZVRvR3JhcGhRTChjbGFzc05hbWUpO1xuICBjb25zdCB7XG4gICAgY2xhc3NDcmVhdGVGaWVsZHMsXG4gICAgY2xhc3NVcGRhdGVGaWVsZHMsXG4gICAgY2xhc3NPdXRwdXRGaWVsZHMsXG4gICAgY2xhc3NDb25zdHJhaW50RmllbGRzLFxuICAgIGNsYXNzU29ydEZpZWxkcyxcbiAgfSA9IGdldElucHV0RmllbGRzQW5kQ29uc3RyYWludHMocGFyc2VDbGFzcywgcGFyc2VDbGFzc0NvbmZpZyk7XG5cbiAgY29uc3Qge1xuICAgIGNyZWF0ZTogaXNDcmVhdGVFbmFibGVkID0gdHJ1ZSxcbiAgICB1cGRhdGU6IGlzVXBkYXRlRW5hYmxlZCA9IHRydWUsXG4gIH0gPSBnZXRQYXJzZUNsYXNzTXV0YXRpb25Db25maWcocGFyc2VDbGFzc0NvbmZpZyk7XG5cbiAgY29uc3QgY2xhc3NHcmFwaFFMQ3JlYXRlVHlwZU5hbWUgPSBgQ3JlYXRlJHtncmFwaFFMQ2xhc3NOYW1lfUZpZWxkc0lucHV0YDtcbiAgbGV0IGNsYXNzR3JhcGhRTENyZWF0ZVR5cGUgPSBuZXcgR3JhcGhRTElucHV0T2JqZWN0VHlwZSh7XG4gICAgbmFtZTogY2xhc3NHcmFwaFFMQ3JlYXRlVHlwZU5hbWUsXG4gICAgZGVzY3JpcHRpb246IGBUaGUgJHtjbGFzc0dyYXBoUUxDcmVhdGVUeXBlTmFtZX0gaW5wdXQgdHlwZSBpcyB1c2VkIGluIG9wZXJhdGlvbnMgdGhhdCBpbnZvbHZlIGNyZWF0aW9uIG9mIG9iamVjdHMgaW4gdGhlICR7Z3JhcGhRTENsYXNzTmFtZX0gY2xhc3MuYCxcbiAgICBmaWVsZHM6ICgpID0+XG4gICAgICBjbGFzc0NyZWF0ZUZpZWxkcy5yZWR1Y2UoXG4gICAgICAgIChmaWVsZHMsIGZpZWxkKSA9PiB7XG4gICAgICAgICAgY29uc3QgdHlwZSA9IHRyYW5zZm9ybUlucHV0VHlwZVRvR3JhcGhRTChcbiAgICAgICAgICAgIHBhcnNlQ2xhc3MuZmllbGRzW2ZpZWxkXS50eXBlLFxuICAgICAgICAgICAgcGFyc2VDbGFzcy5maWVsZHNbZmllbGRdLnRhcmdldENsYXNzLFxuICAgICAgICAgICAgcGFyc2VHcmFwaFFMU2NoZW1hLnBhcnNlQ2xhc3NUeXBlc1xuICAgICAgICAgICk7XG4gICAgICAgICAgaWYgKHR5cGUpIHtcbiAgICAgICAgICAgIHJldHVybiB7XG4gICAgICAgICAgICAgIC4uLmZpZWxkcyxcbiAgICAgICAgICAgICAgW2ZpZWxkXToge1xuICAgICAgICAgICAgICAgIGRlc2NyaXB0aW9uOiBgVGhpcyBpcyB0aGUgb2JqZWN0ICR7ZmllbGR9LmAsXG4gICAgICAgICAgICAgICAgdHlwZTpcbiAgICAgICAgICAgICAgICAgIChjbGFzc05hbWUgPT09ICdfVXNlcicgJiZcbiAgICAgICAgICAgICAgICAgICAgKGZpZWxkID09PSAndXNlcm5hbWUnIHx8IGZpZWxkID09PSAncGFzc3dvcmQnKSkgfHxcbiAgICAgICAgICAgICAgICAgIHBhcnNlQ2xhc3MuZmllbGRzW2ZpZWxkXS5yZXF1aXJlZFxuICAgICAgICAgICAgICAgICAgICA/IG5ldyBHcmFwaFFMTm9uTnVsbCh0eXBlKVxuICAgICAgICAgICAgICAgICAgICA6IHR5cGUsXG4gICAgICAgICAgICAgIH0sXG4gICAgICAgICAgICB9O1xuICAgICAgICAgIH0gZWxzZSB7XG4gICAgICAgICAgICByZXR1cm4gZmllbGRzO1xuICAgICAgICAgIH1cbiAgICAgICAgfSxcbiAgICAgICAge1xuICAgICAgICAgIEFDTDogeyB0eXBlOiBkZWZhdWx0R3JhcGhRTFR5cGVzLkFDTF9JTlBVVCB9LFxuICAgICAgICB9XG4gICAgICApLFxuICB9KTtcbiAgY2xhc3NHcmFwaFFMQ3JlYXRlVHlwZSA9IHBhcnNlR3JhcGhRTFNjaGVtYS5hZGRHcmFwaFFMVHlwZShcbiAgICBjbGFzc0dyYXBoUUxDcmVhdGVUeXBlXG4gICk7XG5cbiAgY29uc3QgY2xhc3NHcmFwaFFMVXBkYXRlVHlwZU5hbWUgPSBgVXBkYXRlJHtncmFwaFFMQ2xhc3NOYW1lfUZpZWxkc0lucHV0YDtcbiAgbGV0IGNsYXNzR3JhcGhRTFVwZGF0ZVR5cGUgPSBuZXcgR3JhcGhRTElucHV0T2JqZWN0VHlwZSh7XG4gICAgbmFtZTogY2xhc3NHcmFwaFFMVXBkYXRlVHlwZU5hbWUsXG4gICAgZGVzY3JpcHRpb246IGBUaGUgJHtjbGFzc0dyYXBoUUxVcGRhdGVUeXBlTmFtZX0gaW5wdXQgdHlwZSBpcyB1c2VkIGluIG9wZXJhdGlvbnMgdGhhdCBpbnZvbHZlIGNyZWF0aW9uIG9mIG9iamVjdHMgaW4gdGhlICR7Z3JhcGhRTENsYXNzTmFtZX0gY2xhc3MuYCxcbiAgICBmaWVsZHM6ICgpID0+XG4gICAgICBjbGFzc1VwZGF0ZUZpZWxkcy5yZWR1Y2UoXG4gICAgICAgIChmaWVsZHMsIGZpZWxkKSA9PiB7XG4gICAgICAgICAgY29uc3QgdHlwZSA9IHRyYW5zZm9ybUlucHV0VHlwZVRvR3JhcGhRTChcbiAgICAgICAgICAgIHBhcnNlQ2xhc3MuZmllbGRzW2ZpZWxkXS50eXBlLFxuICAgICAgICAgICAgcGFyc2VDbGFzcy5maWVsZHNbZmllbGRdLnRhcmdldENsYXNzLFxuICAgICAgICAgICAgcGFyc2VHcmFwaFFMU2NoZW1hLnBhcnNlQ2xhc3NUeXBlc1xuICAgICAgICAgICk7XG4gICAgICAgICAgaWYgKHR5cGUpIHtcbiAgICAgICAgICAgIHJldHVybiB7XG4gICAgICAgICAgICAgIC4uLmZpZWxkcyxcbiAgICAgICAgICAgICAgW2ZpZWxkXToge1xuICAgICAgICAgICAgICAgIGRlc2NyaXB0aW9uOiBgVGhpcyBpcyB0aGUgb2JqZWN0ICR7ZmllbGR9LmAsXG4gICAgICAgICAgICAgICAgdHlwZSxcbiAgICAgICAgICAgICAgfSxcbiAgICAgICAgICAgIH07XG4gICAgICAgICAgfSBlbHNlIHtcbiAgICAgICAgICAgIHJldHVybiBmaWVsZHM7XG4gICAgICAgICAgfVxuICAgICAgICB9LFxuICAgICAgICB7XG4gICAgICAgICAgQUNMOiB7IHR5cGU6IGRlZmF1bHRHcmFwaFFMVHlwZXMuQUNMX0lOUFVUIH0sXG4gICAgICAgIH1cbiAgICAgICksXG4gIH0pO1xuICBjbGFzc0dyYXBoUUxVcGRhdGVUeXBlID0gcGFyc2VHcmFwaFFMU2NoZW1hLmFkZEdyYXBoUUxUeXBlKFxuICAgIGNsYXNzR3JhcGhRTFVwZGF0ZVR5cGVcbiAgKTtcblxuICBjb25zdCBjbGFzc0dyYXBoUUxQb2ludGVyVHlwZU5hbWUgPSBgJHtncmFwaFFMQ2xhc3NOYW1lfVBvaW50ZXJJbnB1dGA7XG4gIGxldCBjbGFzc0dyYXBoUUxQb2ludGVyVHlwZSA9IG5ldyBHcmFwaFFMSW5wdXRPYmplY3RUeXBlKHtcbiAgICBuYW1lOiBjbGFzc0dyYXBoUUxQb2ludGVyVHlwZU5hbWUsXG4gICAgZGVzY3JpcHRpb246IGBBbGxvdyB0byBsaW5rIE9SIGFkZCBhbmQgbGluayBhbiBvYmplY3Qgb2YgdGhlICR7Z3JhcGhRTENsYXNzTmFtZX0gY2xhc3MuYCxcbiAgICBmaWVsZHM6ICgpID0+IHtcbiAgICAgIGNvbnN0IGZpZWxkcyA9IHtcbiAgICAgICAgbGluazoge1xuICAgICAgICAgIGRlc2NyaXB0aW9uOiBgTGluayBhbiBleGlzdGluZyBvYmplY3QgZnJvbSAke2dyYXBoUUxDbGFzc05hbWV9IGNsYXNzLiBZb3UgY2FuIHVzZSBlaXRoZXIgdGhlIGdsb2JhbCBvciB0aGUgb2JqZWN0IGlkLmAsXG4gICAgICAgICAgdHlwZTogR3JhcGhRTElELFxuICAgICAgICB9LFxuICAgICAgfTtcbiAgICAgIGlmIChpc0NyZWF0ZUVuYWJsZWQpIHtcbiAgICAgICAgZmllbGRzWydjcmVhdGVBbmRMaW5rJ10gPSB7XG4gICAgICAgICAgZGVzY3JpcHRpb246IGBDcmVhdGUgYW5kIGxpbmsgYW4gb2JqZWN0IGZyb20gJHtncmFwaFFMQ2xhc3NOYW1lfSBjbGFzcy5gLFxuICAgICAgICAgIHR5cGU6IGNsYXNzR3JhcGhRTENyZWF0ZVR5cGUsXG4gICAgICAgIH07XG4gICAgICB9XG4gICAgICByZXR1cm4gZmllbGRzO1xuICAgIH0sXG4gIH0pO1xuICBjbGFzc0dyYXBoUUxQb2ludGVyVHlwZSA9XG4gICAgcGFyc2VHcmFwaFFMU2NoZW1hLmFkZEdyYXBoUUxUeXBlKGNsYXNzR3JhcGhRTFBvaW50ZXJUeXBlKSB8fFxuICAgIGRlZmF1bHRHcmFwaFFMVHlwZXMuT0JKRUNUO1xuXG4gIGNvbnN0IGNsYXNzR3JhcGhRTFJlbGF0aW9uVHlwZU5hbWUgPSBgJHtncmFwaFFMQ2xhc3NOYW1lfVJlbGF0aW9uSW5wdXRgO1xuICBsZXQgY2xhc3NHcmFwaFFMUmVsYXRpb25UeXBlID0gbmV3IEdyYXBoUUxJbnB1dE9iamVjdFR5cGUoe1xuICAgIG5hbWU6IGNsYXNzR3JhcGhRTFJlbGF0aW9uVHlwZU5hbWUsXG4gICAgZGVzY3JpcHRpb246IGBBbGxvdyB0byBhZGQsIHJlbW92ZSwgY3JlYXRlQW5kQWRkIG9iamVjdHMgb2YgdGhlICR7Z3JhcGhRTENsYXNzTmFtZX0gY2xhc3MgaW50byBhIHJlbGF0aW9uIGZpZWxkLmAsXG4gICAgZmllbGRzOiAoKSA9PiB7XG4gICAgICBjb25zdCBmaWVsZHMgPSB7XG4gICAgICAgIGFkZDoge1xuICAgICAgICAgIGRlc2NyaXB0aW9uOiBgQWRkIGV4aXN0aW5nIG9iamVjdHMgZnJvbSB0aGUgJHtncmFwaFFMQ2xhc3NOYW1lfSBjbGFzcyBpbnRvIHRoZSByZWxhdGlvbi4gWW91IGNhbiB1c2UgZWl0aGVyIHRoZSBnbG9iYWwgb3IgdGhlIG9iamVjdCBpZHMuYCxcbiAgICAgICAgICB0eXBlOiBuZXcgR3JhcGhRTExpc3QoZGVmYXVsdEdyYXBoUUxUeXBlcy5PQkpFQ1RfSUQpLFxuICAgICAgICB9LFxuICAgICAgICByZW1vdmU6IHtcbiAgICAgICAgICBkZXNjcmlwdGlvbjogYFJlbW92ZSBleGlzdGluZyBvYmplY3RzIGZyb20gdGhlICR7Z3JhcGhRTENsYXNzTmFtZX0gY2xhc3Mgb3V0IG9mIHRoZSByZWxhdGlvbi4gWW91IGNhbiB1c2UgZWl0aGVyIHRoZSBnbG9iYWwgb3IgdGhlIG9iamVjdCBpZHMuYCxcbiAgICAgICAgICB0eXBlOiBuZXcgR3JhcGhRTExpc3QoZGVmYXVsdEdyYXBoUUxUeXBlcy5PQkpFQ1RfSUQpLFxuICAgICAgICB9LFxuICAgICAgfTtcbiAgICAgIGlmIChpc0NyZWF0ZUVuYWJsZWQpIHtcbiAgICAgICAgZmllbGRzWydjcmVhdGVBbmRBZGQnXSA9IHtcbiAgICAgICAgICBkZXNjcmlwdGlvbjogYENyZWF0ZSBhbmQgYWRkIG9iamVjdHMgb2YgdGhlICR7Z3JhcGhRTENsYXNzTmFtZX0gY2xhc3MgaW50byB0aGUgcmVsYXRpb24uYCxcbiAgICAgICAgICB0eXBlOiBuZXcgR3JhcGhRTExpc3QobmV3IEdyYXBoUUxOb25OdWxsKGNsYXNzR3JhcGhRTENyZWF0ZVR5cGUpKSxcbiAgICAgICAgfTtcbiAgICAgIH1cbiAgICAgIHJldHVybiBmaWVsZHM7XG4gICAgfSxcbiAgfSk7XG4gIGNsYXNzR3JhcGhRTFJlbGF0aW9uVHlwZSA9XG4gICAgcGFyc2VHcmFwaFFMU2NoZW1hLmFkZEdyYXBoUUxUeXBlKGNsYXNzR3JhcGhRTFJlbGF0aW9uVHlwZSkgfHxcbiAgICBkZWZhdWx0R3JhcGhRTFR5cGVzLk9CSkVDVDtcblxuICBjb25zdCBjbGFzc0dyYXBoUUxDb25zdHJhaW50c1R5cGVOYW1lID0gYCR7Z3JhcGhRTENsYXNzTmFtZX1XaGVyZUlucHV0YDtcbiAgbGV0IGNsYXNzR3JhcGhRTENvbnN0cmFpbnRzVHlwZSA9IG5ldyBHcmFwaFFMSW5wdXRPYmplY3RUeXBlKHtcbiAgICBuYW1lOiBjbGFzc0dyYXBoUUxDb25zdHJhaW50c1R5cGVOYW1lLFxuICAgIGRlc2NyaXB0aW9uOiBgVGhlICR7Y2xhc3NHcmFwaFFMQ29uc3RyYWludHNUeXBlTmFtZX0gaW5wdXQgdHlwZSBpcyB1c2VkIGluIG9wZXJhdGlvbnMgdGhhdCBpbnZvbHZlIGZpbHRlcmluZyBvYmplY3RzIG9mICR7Z3JhcGhRTENsYXNzTmFtZX0gY2xhc3MuYCxcbiAgICBmaWVsZHM6ICgpID0+ICh7XG4gICAgICAuLi5jbGFzc0NvbnN0cmFpbnRGaWVsZHMucmVkdWNlKChmaWVsZHMsIGZpZWxkKSA9PiB7XG4gICAgICAgIGlmIChbJ09SJywgJ0FORCcsICdOT1InXS5pbmNsdWRlcyhmaWVsZCkpIHtcbiAgICAgICAgICBwYXJzZUdyYXBoUUxTY2hlbWEubG9nLndhcm4oXG4gICAgICAgICAgICBgRmllbGQgJHtmaWVsZH0gY291bGQgbm90IGJlIGFkZGVkIHRvIHRoZSBhdXRvIHNjaGVtYSAke2NsYXNzR3JhcGhRTENvbnN0cmFpbnRzVHlwZU5hbWV9IGJlY2F1c2UgaXQgY29sbGlkZWQgd2l0aCBhbiBleGlzdGluZyBvbmUuYFxuICAgICAgICAgICk7XG4gICAgICAgICAgcmV0dXJuIGZpZWxkcztcbiAgICAgICAgfVxuICAgICAgICBjb25zdCBwYXJzZUZpZWxkID0gZmllbGQgPT09ICdpZCcgPyAnb2JqZWN0SWQnIDogZmllbGQ7XG4gICAgICAgIGNvbnN0IHR5cGUgPSB0cmFuc2Zvcm1Db25zdHJhaW50VHlwZVRvR3JhcGhRTChcbiAgICAgICAgICBwYXJzZUNsYXNzLmZpZWxkc1twYXJzZUZpZWxkXS50eXBlLFxuICAgICAgICAgIHBhcnNlQ2xhc3MuZmllbGRzW3BhcnNlRmllbGRdLnRhcmdldENsYXNzLFxuICAgICAgICAgIHBhcnNlR3JhcGhRTFNjaGVtYS5wYXJzZUNsYXNzVHlwZXMsXG4gICAgICAgICAgZmllbGRcbiAgICAgICAgKTtcbiAgICAgICAgaWYgKHR5cGUpIHtcbiAgICAgICAgICByZXR1cm4ge1xuICAgICAgICAgICAgLi4uZmllbGRzLFxuICAgICAgICAgICAgW2ZpZWxkXToge1xuICAgICAgICAgICAgICBkZXNjcmlwdGlvbjogYFRoaXMgaXMgdGhlIG9iamVjdCAke2ZpZWxkfS5gLFxuICAgICAgICAgICAgICB0eXBlLFxuICAgICAgICAgICAgfSxcbiAgICAgICAgICB9O1xuICAgICAgICB9IGVsc2Uge1xuICAgICAgICAgIHJldHVybiBmaWVsZHM7XG4gICAgICAgIH1cbiAgICAgIH0sIHt9KSxcbiAgICAgIE9SOiB7XG4gICAgICAgIGRlc2NyaXB0aW9uOiAnVGhpcyBpcyB0aGUgT1Igb3BlcmF0b3IgdG8gY29tcG91bmQgY29uc3RyYWludHMuJyxcbiAgICAgICAgdHlwZTogbmV3IEdyYXBoUUxMaXN0KG5ldyBHcmFwaFFMTm9uTnVsbChjbGFzc0dyYXBoUUxDb25zdHJhaW50c1R5cGUpKSxcbiAgICAgIH0sXG4gICAgICBBTkQ6IHtcbiAgICAgICAgZGVzY3JpcHRpb246ICdUaGlzIGlzIHRoZSBBTkQgb3BlcmF0b3IgdG8gY29tcG91bmQgY29uc3RyYWludHMuJyxcbiAgICAgICAgdHlwZTogbmV3IEdyYXBoUUxMaXN0KG5ldyBHcmFwaFFMTm9uTnVsbChjbGFzc0dyYXBoUUxDb25zdHJhaW50c1R5cGUpKSxcbiAgICAgIH0sXG4gICAgICBOT1I6IHtcbiAgICAgICAgZGVzY3JpcHRpb246ICdUaGlzIGlzIHRoZSBOT1Igb3BlcmF0b3IgdG8gY29tcG91bmQgY29uc3RyYWludHMuJyxcbiAgICAgICAgdHlwZTogbmV3IEdyYXBoUUxMaXN0KG5ldyBHcmFwaFFMTm9uTnVsbChjbGFzc0dyYXBoUUxDb25zdHJhaW50c1R5cGUpKSxcbiAgICAgIH0sXG4gICAgfSksXG4gIH0pO1xuICBjbGFzc0dyYXBoUUxDb25zdHJhaW50c1R5cGUgPVxuICAgIHBhcnNlR3JhcGhRTFNjaGVtYS5hZGRHcmFwaFFMVHlwZShjbGFzc0dyYXBoUUxDb25zdHJhaW50c1R5cGUpIHx8XG4gICAgZGVmYXVsdEdyYXBoUUxUeXBlcy5PQkpFQ1Q7XG5cbiAgY29uc3QgY2xhc3NHcmFwaFFMUmVsYXRpb25Db25zdHJhaW50c1R5cGVOYW1lID0gYCR7Z3JhcGhRTENsYXNzTmFtZX1SZWxhdGlvbldoZXJlSW5wdXRgO1xuICBsZXQgY2xhc3NHcmFwaFFMUmVsYXRpb25Db25zdHJhaW50c1R5cGUgPSBuZXcgR3JhcGhRTElucHV0T2JqZWN0VHlwZSh7XG4gICAgbmFtZTogY2xhc3NHcmFwaFFMUmVsYXRpb25Db25zdHJhaW50c1R5cGVOYW1lLFxuICAgIGRlc2NyaXB0aW9uOiBgVGhlICR7Y2xhc3NHcmFwaFFMUmVsYXRpb25Db25zdHJhaW50c1R5cGVOYW1lfSBpbnB1dCB0eXBlIGlzIHVzZWQgaW4gb3BlcmF0aW9ucyB0aGF0IGludm9sdmUgZmlsdGVyaW5nIG9iamVjdHMgb2YgJHtncmFwaFFMQ2xhc3NOYW1lfSBjbGFzcy5gLFxuICAgIGZpZWxkczogKCkgPT4gKHtcbiAgICAgIGhhdmU6IHtcbiAgICAgICAgZGVzY3JpcHRpb246XG4gICAgICAgICAgJ1J1biBhIHJlbGF0aW9uYWwvcG9pbnRlciBxdWVyeSB3aGVyZSBhdCBsZWFzdCBvbmUgY2hpbGQgb2JqZWN0IGNhbiBtYXRjaC4nLFxuICAgICAgICB0eXBlOiBjbGFzc0dyYXBoUUxDb25zdHJhaW50c1R5cGUsXG4gICAgICB9LFxuICAgICAgaGF2ZU5vdDoge1xuICAgICAgICBkZXNjcmlwdGlvbjpcbiAgICAgICAgICAnUnVuIGFuIGludmVydGVkIHJlbGF0aW9uYWwvcG9pbnRlciBxdWVyeSB3aGVyZSBhdCBsZWFzdCBvbmUgY2hpbGQgb2JqZWN0IGNhbiBtYXRjaC4nLFxuICAgICAgICB0eXBlOiBjbGFzc0dyYXBoUUxDb25zdHJhaW50c1R5cGUsXG4gICAgICB9LFxuICAgICAgZXhpc3RzOiB7XG4gICAgICAgIGRlc2NyaXB0aW9uOiAnQ2hlY2sgaWYgdGhlIHJlbGF0aW9uL3BvaW50ZXIgY29udGFpbnMgb2JqZWN0cy4nLFxuICAgICAgICB0eXBlOiBHcmFwaFFMQm9vbGVhbixcbiAgICAgIH0sXG4gICAgfSksXG4gIH0pO1xuICBjbGFzc0dyYXBoUUxSZWxhdGlvbkNvbnN0cmFpbnRzVHlwZSA9XG4gICAgcGFyc2VHcmFwaFFMU2NoZW1hLmFkZEdyYXBoUUxUeXBlKGNsYXNzR3JhcGhRTFJlbGF0aW9uQ29uc3RyYWludHNUeXBlKSB8fFxuICAgIGRlZmF1bHRHcmFwaFFMVHlwZXMuT0JKRUNUO1xuXG4gIGNvbnN0IGNsYXNzR3JhcGhRTE9yZGVyVHlwZU5hbWUgPSBgJHtncmFwaFFMQ2xhc3NOYW1lfU9yZGVyYDtcbiAgbGV0IGNsYXNzR3JhcGhRTE9yZGVyVHlwZSA9IG5ldyBHcmFwaFFMRW51bVR5cGUoe1xuICAgIG5hbWU6IGNsYXNzR3JhcGhRTE9yZGVyVHlwZU5hbWUsXG4gICAgZGVzY3JpcHRpb246IGBUaGUgJHtjbGFzc0dyYXBoUUxPcmRlclR5cGVOYW1lfSBpbnB1dCB0eXBlIGlzIHVzZWQgd2hlbiBzb3J0aW5nIG9iamVjdHMgb2YgdGhlICR7Z3JhcGhRTENsYXNzTmFtZX0gY2xhc3MuYCxcbiAgICB2YWx1ZXM6IGNsYXNzU29ydEZpZWxkcy5yZWR1Y2UoKHNvcnRGaWVsZHMsIGZpZWxkQ29uZmlnKSA9PiB7XG4gICAgICBjb25zdCB7IGZpZWxkLCBhc2MsIGRlc2MgfSA9IGZpZWxkQ29uZmlnO1xuICAgICAgY29uc3QgdXBkYXRlZFNvcnRGaWVsZHMgPSB7XG4gICAgICAgIC4uLnNvcnRGaWVsZHMsXG4gICAgICB9O1xuICAgICAgaWYgKGFzYykge1xuICAgICAgICB1cGRhdGVkU29ydEZpZWxkc1tgJHtmaWVsZH1fQVNDYF0gPSB7fTtcbiAgICAgIH1cbiAgICAgIGlmIChkZXNjKSB7XG4gICAgICAgIHVwZGF0ZWRTb3J0RmllbGRzW2Ake2ZpZWxkfV9ERVNDYF0gPSB7fTtcbiAgICAgIH1cbiAgICAgIHJldHVybiB1cGRhdGVkU29ydEZpZWxkcztcbiAgICB9LCB7fSksXG4gIH0pO1xuICBjbGFzc0dyYXBoUUxPcmRlclR5cGUgPSBwYXJzZUdyYXBoUUxTY2hlbWEuYWRkR3JhcGhRTFR5cGUoXG4gICAgY2xhc3NHcmFwaFFMT3JkZXJUeXBlXG4gICk7XG5cbiAgY29uc3QgY2xhc3NHcmFwaFFMRmluZEFyZ3MgPSB7XG4gICAgd2hlcmU6IHtcbiAgICAgIGRlc2NyaXB0aW9uOlxuICAgICAgICAnVGhlc2UgYXJlIHRoZSBjb25kaXRpb25zIHRoYXQgdGhlIG9iamVjdHMgbmVlZCB0byBtYXRjaCBpbiBvcmRlciB0byBiZSBmb3VuZC4nLFxuICAgICAgdHlwZTogY2xhc3NHcmFwaFFMQ29uc3RyYWludHNUeXBlLFxuICAgIH0sXG4gICAgb3JkZXI6IHtcbiAgICAgIGRlc2NyaXB0aW9uOiAnVGhlIGZpZWxkcyB0byBiZSB1c2VkIHdoZW4gc29ydGluZyB0aGUgZGF0YSBmZXRjaGVkLicsXG4gICAgICB0eXBlOiBjbGFzc0dyYXBoUUxPcmRlclR5cGVcbiAgICAgICAgPyBuZXcgR3JhcGhRTExpc3QobmV3IEdyYXBoUUxOb25OdWxsKGNsYXNzR3JhcGhRTE9yZGVyVHlwZSkpXG4gICAgICAgIDogR3JhcGhRTFN0cmluZyxcbiAgICB9LFxuICAgIHNraXA6IGRlZmF1bHRHcmFwaFFMVHlwZXMuU0tJUF9BVFQsXG4gICAgLi4uY29ubmVjdGlvbkFyZ3MsXG4gICAgb3B0aW9uczogZGVmYXVsdEdyYXBoUUxUeXBlcy5SRUFEX09QVElPTlNfQVRULFxuICB9O1xuICBjb25zdCBjbGFzc0dyYXBoUUxPdXRwdXRUeXBlTmFtZSA9IGAke2dyYXBoUUxDbGFzc05hbWV9YDtcbiAgY29uc3QgaW50ZXJmYWNlcyA9IFtcbiAgICBkZWZhdWx0R3JhcGhRTFR5cGVzLlBBUlNFX09CSkVDVCxcbiAgICBwYXJzZUdyYXBoUUxTY2hlbWEucmVsYXlOb2RlSW50ZXJmYWNlLFxuICBdO1xuICBjb25zdCBwYXJzZU9iamVjdEZpZWxkcyA9IHtcbiAgICBpZDogZ2xvYmFsSWRGaWVsZChjbGFzc05hbWUsIG9iaiA9PiBvYmoub2JqZWN0SWQpLFxuICAgIC4uLmRlZmF1bHRHcmFwaFFMVHlwZXMuUEFSU0VfT0JKRUNUX0ZJRUxEUyxcbiAgfTtcbiAgY29uc3Qgb3V0cHV0RmllbGRzID0gKCkgPT4ge1xuICAgIHJldHVybiBjbGFzc091dHB1dEZpZWxkcy5yZWR1Y2UoKGZpZWxkcywgZmllbGQpID0+IHtcbiAgICAgIGNvbnN0IHR5cGUgPSB0cmFuc2Zvcm1PdXRwdXRUeXBlVG9HcmFwaFFMKFxuICAgICAgICBwYXJzZUNsYXNzLmZpZWxkc1tmaWVsZF0udHlwZSxcbiAgICAgICAgcGFyc2VDbGFzcy5maWVsZHNbZmllbGRdLnRhcmdldENsYXNzLFxuICAgICAgICBwYXJzZUdyYXBoUUxTY2hlbWEucGFyc2VDbGFzc1R5cGVzXG4gICAgICApO1xuICAgICAgaWYgKHBhcnNlQ2xhc3MuZmllbGRzW2ZpZWxkXS50eXBlID09PSAnUmVsYXRpb24nKSB7XG4gICAgICAgIGNvbnN0IHRhcmdldFBhcnNlQ2xhc3NUeXBlcyA9XG4gICAgICAgICAgcGFyc2VHcmFwaFFMU2NoZW1hLnBhcnNlQ2xhc3NUeXBlc1tcbiAgICAgICAgICAgIHBhcnNlQ2xhc3MuZmllbGRzW2ZpZWxkXS50YXJnZXRDbGFzc1xuICAgICAgICAgIF07XG4gICAgICAgIGNvbnN0IGFyZ3MgPSB0YXJnZXRQYXJzZUNsYXNzVHlwZXNcbiAgICAgICAgICA/IHRhcmdldFBhcnNlQ2xhc3NUeXBlcy5jbGFzc0dyYXBoUUxGaW5kQXJnc1xuICAgICAgICAgIDogdW5kZWZpbmVkO1xuICAgICAgICByZXR1cm4ge1xuICAgICAgICAgIC4uLmZpZWxkcyxcbiAgICAgICAgICBbZmllbGRdOiB7XG4gICAgICAgICAgICBkZXNjcmlwdGlvbjogYFRoaXMgaXMgdGhlIG9iamVjdCAke2ZpZWxkfS5gLFxuICAgICAgICAgICAgYXJncyxcbiAgICAgICAgICAgIHR5cGU6IHBhcnNlQ2xhc3MuZmllbGRzW2ZpZWxkXS5yZXF1aXJlZFxuICAgICAgICAgICAgICA/IG5ldyBHcmFwaFFMTm9uTnVsbCh0eXBlKVxuICAgICAgICAgICAgICA6IHR5cGUsXG4gICAgICAgICAgICBhc3luYyByZXNvbHZlKHNvdXJjZSwgYXJncywgY29udGV4dCwgcXVlcnlJbmZvKSB7XG4gICAgICAgICAgICAgIHRyeSB7XG4gICAgICAgICAgICAgICAgY29uc3Qge1xuICAgICAgICAgICAgICAgICAgd2hlcmUsXG4gICAgICAgICAgICAgICAgICBvcmRlcixcbiAgICAgICAgICAgICAgICAgIHNraXAsXG4gICAgICAgICAgICAgICAgICBmaXJzdCxcbiAgICAgICAgICAgICAgICAgIGFmdGVyLFxuICAgICAgICAgICAgICAgICAgbGFzdCxcbiAgICAgICAgICAgICAgICAgIGJlZm9yZSxcbiAgICAgICAgICAgICAgICAgIG9wdGlvbnMsXG4gICAgICAgICAgICAgICAgfSA9IGFyZ3M7XG4gICAgICAgICAgICAgICAgY29uc3Qge1xuICAgICAgICAgICAgICAgICAgcmVhZFByZWZlcmVuY2UsXG4gICAgICAgICAgICAgICAgICBpbmNsdWRlUmVhZFByZWZlcmVuY2UsXG4gICAgICAgICAgICAgICAgICBzdWJxdWVyeVJlYWRQcmVmZXJlbmNlLFxuICAgICAgICAgICAgICAgIH0gPSBvcHRpb25zIHx8IHt9O1xuICAgICAgICAgICAgICAgIGNvbnN0IHsgY29uZmlnLCBhdXRoLCBpbmZvIH0gPSBjb250ZXh0O1xuICAgICAgICAgICAgICAgIGNvbnN0IHNlbGVjdGVkRmllbGRzID0gZ2V0RmllbGROYW1lcyhxdWVyeUluZm8pO1xuXG4gICAgICAgICAgICAgICAgY29uc3QgeyBrZXlzLCBpbmNsdWRlIH0gPSBleHRyYWN0S2V5c0FuZEluY2x1ZGUoXG4gICAgICAgICAgICAgICAgICBzZWxlY3RlZEZpZWxkc1xuICAgICAgICAgICAgICAgICAgICAuZmlsdGVyKGZpZWxkID0+IGZpZWxkLnN0YXJ0c1dpdGgoJ2VkZ2VzLm5vZGUuJykpXG4gICAgICAgICAgICAgICAgICAgIC5tYXAoZmllbGQgPT4gZmllbGQucmVwbGFjZSgnZWRnZXMubm9kZS4nLCAnJykpXG4gICAgICAgICAgICAgICAgKTtcblxuICAgICAgICAgICAgICAgIHJldHVybiBvYmplY3RzUXVlcmllcy5maW5kT2JqZWN0cyhcbiAgICAgICAgICAgICAgICAgIHNvdXJjZVtmaWVsZF0uY2xhc3NOYW1lLFxuICAgICAgICAgICAgICAgICAge1xuICAgICAgICAgICAgICAgICAgICAkcmVsYXRlZFRvOiB7XG4gICAgICAgICAgICAgICAgICAgICAgb2JqZWN0OiB7XG4gICAgICAgICAgICAgICAgICAgICAgICBfX3R5cGU6ICdQb2ludGVyJyxcbiAgICAgICAgICAgICAgICAgICAgICAgIGNsYXNzTmFtZTogY2xhc3NOYW1lLFxuICAgICAgICAgICAgICAgICAgICAgICAgb2JqZWN0SWQ6IHNvdXJjZS5vYmplY3RJZCxcbiAgICAgICAgICAgICAgICAgICAgICB9LFxuICAgICAgICAgICAgICAgICAgICAgIGtleTogZmllbGQsXG4gICAgICAgICAgICAgICAgICAgIH0sXG4gICAgICAgICAgICAgICAgICAgIC4uLih3aGVyZSB8fCB7fSksXG4gICAgICAgICAgICAgICAgICB9LFxuICAgICAgICAgICAgICAgICAgb3JkZXIsXG4gICAgICAgICAgICAgICAgICBza2lwLFxuICAgICAgICAgICAgICAgICAgZmlyc3QsXG4gICAgICAgICAgICAgICAgICBhZnRlcixcbiAgICAgICAgICAgICAgICAgIGxhc3QsXG4gICAgICAgICAgICAgICAgICBiZWZvcmUsXG4gICAgICAgICAgICAgICAgICBrZXlzLFxuICAgICAgICAgICAgICAgICAgaW5jbHVkZSxcbiAgICAgICAgICAgICAgICAgIGZhbHNlLFxuICAgICAgICAgICAgICAgICAgcmVhZFByZWZlcmVuY2UsXG4gICAgICAgICAgICAgICAgICBpbmNsdWRlUmVhZFByZWZlcmVuY2UsXG4gICAgICAgICAgICAgICAgICBzdWJxdWVyeVJlYWRQcmVmZXJlbmNlLFxuICAgICAgICAgICAgICAgICAgY29uZmlnLFxuICAgICAgICAgICAgICAgICAgYXV0aCxcbiAgICAgICAgICAgICAgICAgIGluZm8sXG4gICAgICAgICAgICAgICAgICBzZWxlY3RlZEZpZWxkcyxcbiAgICAgICAgICAgICAgICAgIHBhcnNlR3JhcGhRTFNjaGVtYS5wYXJzZUNsYXNzZXNcbiAgICAgICAgICAgICAgICApO1xuICAgICAgICAgICAgICB9IGNhdGNoIChlKSB7XG4gICAgICAgICAgICAgICAgcGFyc2VHcmFwaFFMU2NoZW1hLmhhbmRsZUVycm9yKGUpO1xuICAgICAgICAgICAgICB9XG4gICAgICAgICAgICB9LFxuICAgICAgICAgIH0sXG4gICAgICAgIH07XG4gICAgICB9IGVsc2UgaWYgKHBhcnNlQ2xhc3MuZmllbGRzW2ZpZWxkXS50eXBlID09PSAnUG9seWdvbicpIHtcbiAgICAgICAgcmV0dXJuIHtcbiAgICAgICAgICAuLi5maWVsZHMsXG4gICAgICAgICAgW2ZpZWxkXToge1xuICAgICAgICAgICAgZGVzY3JpcHRpb246IGBUaGlzIGlzIHRoZSBvYmplY3QgJHtmaWVsZH0uYCxcbiAgICAgICAgICAgIHR5cGU6IHBhcnNlQ2xhc3MuZmllbGRzW2ZpZWxkXS5yZXF1aXJlZFxuICAgICAgICAgICAgICA/IG5ldyBHcmFwaFFMTm9uTnVsbCh0eXBlKVxuICAgICAgICAgICAgICA6IHR5cGUsXG4gICAgICAgICAgICBhc3luYyByZXNvbHZlKHNvdXJjZSkge1xuICAgICAgICAgICAgICBpZiAoc291cmNlW2ZpZWxkXSAmJiBzb3VyY2VbZmllbGRdLmNvb3JkaW5hdGVzKSB7XG4gICAgICAgICAgICAgICAgcmV0dXJuIHNvdXJjZVtmaWVsZF0uY29vcmRpbmF0ZXMubWFwKGNvb3JkaW5hdGUgPT4gKHtcbiAgICAgICAgICAgICAgICAgIGxhdGl0dWRlOiBjb29yZGluYXRlWzBdLFxuICAgICAgICAgICAgICAgICAgbG9uZ2l0dWRlOiBjb29yZGluYXRlWzFdLFxuICAgICAgICAgICAgICAgIH0pKTtcbiAgICAgICAgICAgICAgfSBlbHNlIHtcbiAgICAgICAgICAgICAgICByZXR1cm4gbnVsbDtcbiAgICAgICAgICAgICAgfVxuICAgICAgICAgICAgfSxcbiAgICAgICAgICB9LFxuICAgICAgICB9O1xuICAgICAgfSBlbHNlIGlmIChwYXJzZUNsYXNzLmZpZWxkc1tmaWVsZF0udHlwZSA9PT0gJ0FycmF5Jykge1xuICAgICAgICByZXR1cm4ge1xuICAgICAgICAgIC4uLmZpZWxkcyxcbiAgICAgICAgICBbZmllbGRdOiB7XG4gICAgICAgICAgICBkZXNjcmlwdGlvbjogYFVzZSBJbmxpbmUgRnJhZ21lbnQgb24gQXJyYXkgdG8gZ2V0IHJlc3VsdHM6IGh0dHBzOi8vZ3JhcGhxbC5vcmcvbGVhcm4vcXVlcmllcy8jaW5saW5lLWZyYWdtZW50c2AsXG4gICAgICAgICAgICB0eXBlOiBwYXJzZUNsYXNzLmZpZWxkc1tmaWVsZF0ucmVxdWlyZWRcbiAgICAgICAgICAgICAgPyBuZXcgR3JhcGhRTE5vbk51bGwodHlwZSlcbiAgICAgICAgICAgICAgOiB0eXBlLFxuICAgICAgICAgICAgYXN5bmMgcmVzb2x2ZShzb3VyY2UpIHtcbiAgICAgICAgICAgICAgaWYgKCFzb3VyY2VbZmllbGRdKSByZXR1cm4gbnVsbDtcbiAgICAgICAgICAgICAgcmV0dXJuIHNvdXJjZVtmaWVsZF0ubWFwKGFzeW5jIGVsZW0gPT4ge1xuICAgICAgICAgICAgICAgIGlmIChcbiAgICAgICAgICAgICAgICAgIGVsZW0uY2xhc3NOYW1lICYmXG4gICAgICAgICAgICAgICAgICBlbGVtLm9iamVjdElkICYmXG4gICAgICAgICAgICAgICAgICBlbGVtLl9fdHlwZSA9PT0gJ09iamVjdCdcbiAgICAgICAgICAgICAgICApIHtcbiAgICAgICAgICAgICAgICAgIHJldHVybiBlbGVtO1xuICAgICAgICAgICAgICAgIH0gZWxzZSB7XG4gICAgICAgICAgICAgICAgICByZXR1cm4geyB2YWx1ZTogZWxlbSB9O1xuICAgICAgICAgICAgICAgIH1cbiAgICAgICAgICAgICAgfSk7XG4gICAgICAgICAgICB9LFxuICAgICAgICAgIH0sXG4gICAgICAgIH07XG4gICAgICB9IGVsc2UgaWYgKHR5cGUpIHtcbiAgICAgICAgcmV0dXJuIHtcbiAgICAgICAgICAuLi5maWVsZHMsXG4gICAgICAgICAgW2ZpZWxkXToge1xuICAgICAgICAgICAgZGVzY3JpcHRpb246IGBUaGlzIGlzIHRoZSBvYmplY3QgJHtmaWVsZH0uYCxcbiAgICAgICAgICAgIHR5cGU6IHBhcnNlQ2xhc3MuZmllbGRzW2ZpZWxkXS5yZXF1aXJlZFxuICAgICAgICAgICAgICA/IG5ldyBHcmFwaFFMTm9uTnVsbCh0eXBlKVxuICAgICAgICAgICAgICA6IHR5cGUsXG4gICAgICAgICAgfSxcbiAgICAgICAgfTtcbiAgICAgIH0gZWxzZSB7XG4gICAgICAgIHJldHVybiBmaWVsZHM7XG4gICAgICB9XG4gICAgfSwgcGFyc2VPYmplY3RGaWVsZHMpO1xuICB9O1xuICBsZXQgY2xhc3NHcmFwaFFMT3V0cHV0VHlwZSA9IG5ldyBHcmFwaFFMT2JqZWN0VHlwZSh7XG4gICAgbmFtZTogY2xhc3NHcmFwaFFMT3V0cHV0VHlwZU5hbWUsXG4gICAgZGVzY3JpcHRpb246IGBUaGUgJHtjbGFzc0dyYXBoUUxPdXRwdXRUeXBlTmFtZX0gb2JqZWN0IHR5cGUgaXMgdXNlZCBpbiBvcGVyYXRpb25zIHRoYXQgaW52b2x2ZSBvdXRwdXR0aW5nIG9iamVjdHMgb2YgJHtncmFwaFFMQ2xhc3NOYW1lfSBjbGFzcy5gLFxuICAgIGludGVyZmFjZXMsXG4gICAgZmllbGRzOiBvdXRwdXRGaWVsZHMsXG4gIH0pO1xuICBjbGFzc0dyYXBoUUxPdXRwdXRUeXBlID0gcGFyc2VHcmFwaFFMU2NoZW1hLmFkZEdyYXBoUUxUeXBlKFxuICAgIGNsYXNzR3JhcGhRTE91dHB1dFR5cGVcbiAgKTtcblxuICBjb25zdCB7IGNvbm5lY3Rpb25UeXBlLCBlZGdlVHlwZSB9ID0gY29ubmVjdGlvbkRlZmluaXRpb25zKHtcbiAgICBuYW1lOiBncmFwaFFMQ2xhc3NOYW1lLFxuICAgIGNvbm5lY3Rpb25GaWVsZHM6IHtcbiAgICAgIGNvdW50OiBkZWZhdWx0R3JhcGhRTFR5cGVzLkNPVU5UX0FUVCxcbiAgICB9LFxuICAgIG5vZGVUeXBlOiBjbGFzc0dyYXBoUUxPdXRwdXRUeXBlIHx8IGRlZmF1bHRHcmFwaFFMVHlwZXMuT0JKRUNULFxuICB9KTtcbiAgbGV0IGNsYXNzR3JhcGhRTEZpbmRSZXN1bHRUeXBlID0gdW5kZWZpbmVkO1xuICBpZiAoXG4gICAgcGFyc2VHcmFwaFFMU2NoZW1hLmFkZEdyYXBoUUxUeXBlKGVkZ2VUeXBlKSAmJlxuICAgIHBhcnNlR3JhcGhRTFNjaGVtYS5hZGRHcmFwaFFMVHlwZShjb25uZWN0aW9uVHlwZSwgZmFsc2UsIGZhbHNlLCB0cnVlKVxuICApIHtcbiAgICBjbGFzc0dyYXBoUUxGaW5kUmVzdWx0VHlwZSA9IGNvbm5lY3Rpb25UeXBlO1xuICB9XG5cbiAgcGFyc2VHcmFwaFFMU2NoZW1hLnBhcnNlQ2xhc3NUeXBlc1tjbGFzc05hbWVdID0ge1xuICAgIGNsYXNzR3JhcGhRTFBvaW50ZXJUeXBlLFxuICAgIGNsYXNzR3JhcGhRTFJlbGF0aW9uVHlwZSxcbiAgICBjbGFzc0dyYXBoUUxDcmVhdGVUeXBlLFxuICAgIGNsYXNzR3JhcGhRTFVwZGF0ZVR5cGUsXG4gICAgY2xhc3NHcmFwaFFMQ29uc3RyYWludHNUeXBlLFxuICAgIGNsYXNzR3JhcGhRTFJlbGF0aW9uQ29uc3RyYWludHNUeXBlLFxuICAgIGNsYXNzR3JhcGhRTEZpbmRBcmdzLFxuICAgIGNsYXNzR3JhcGhRTE91dHB1dFR5cGUsXG4gICAgY2xhc3NHcmFwaFFMRmluZFJlc3VsdFR5cGUsXG4gICAgY29uZmlnOiB7XG4gICAgICBwYXJzZUNsYXNzQ29uZmlnLFxuICAgICAgaXNDcmVhdGVFbmFibGVkLFxuICAgICAgaXNVcGRhdGVFbmFibGVkLFxuICAgIH0sXG4gIH07XG5cbiAgaWYgKGNsYXNzTmFtZSA9PT0gJ19Vc2VyJykge1xuICAgIGNvbnN0IHZpZXdlclR5cGUgPSBuZXcgR3JhcGhRTE9iamVjdFR5cGUoe1xuICAgICAgbmFtZTogJ1ZpZXdlcicsXG4gICAgICBkZXNjcmlwdGlvbjogYFRoZSBWaWV3ZXIgb2JqZWN0IHR5cGUgaXMgdXNlZCBpbiBvcGVyYXRpb25zIHRoYXQgaW52b2x2ZSBvdXRwdXR0aW5nIHRoZSBjdXJyZW50IHVzZXIgZGF0YS5gLFxuICAgICAgZmllbGRzOiAoKSA9PiAoe1xuICAgICAgICBzZXNzaW9uVG9rZW46IGRlZmF1bHRHcmFwaFFMVHlwZXMuU0VTU0lPTl9UT0tFTl9BVFQsXG4gICAgICAgIHVzZXI6IHtcbiAgICAgICAgICBkZXNjcmlwdGlvbjogJ1RoaXMgaXMgdGhlIGN1cnJlbnQgdXNlci4nLFxuICAgICAgICAgIHR5cGU6IG5ldyBHcmFwaFFMTm9uTnVsbChjbGFzc0dyYXBoUUxPdXRwdXRUeXBlKSxcbiAgICAgICAgfSxcbiAgICAgIH0pLFxuICAgIH0pO1xuICAgIHBhcnNlR3JhcGhRTFNjaGVtYS5hZGRHcmFwaFFMVHlwZSh2aWV3ZXJUeXBlLCB0cnVlLCB0cnVlKTtcbiAgICBwYXJzZUdyYXBoUUxTY2hlbWEudmlld2VyVHlwZSA9IHZpZXdlclR5cGU7XG4gIH1cbn07XG5cbmV4cG9ydCB7IGV4dHJhY3RLZXlzQW5kSW5jbHVkZSwgbG9hZCB9O1xuIl19