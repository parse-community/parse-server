"use strict";

Object.defineProperty(exports, "__esModule", {
  value: true
});
exports.load = void 0;

var _graphql = require("graphql");

var _graphqlRelay = require("graphql-relay");

var _graphqlListFields = _interopRequireDefault(require("graphql-list-fields"));

var _deepcopy = _interopRequireDefault(require("deepcopy"));

var defaultGraphQLTypes = _interopRequireWildcard(require("./defaultGraphQLTypes"));

var _parseGraphQLUtils = require("../parseGraphQLUtils");

var objectsMutations = _interopRequireWildcard(require("../helpers/objectsMutations"));

var objectsQueries = _interopRequireWildcard(require("../helpers/objectsQueries"));

var _ParseGraphQLController = require("../../Controllers/ParseGraphQLController");

var _className = require("../transformers/className");

var _mutation = require("../transformers/mutation");

function _getRequireWildcardCache(nodeInterop) { if (typeof WeakMap !== "function") return null; var cacheBabelInterop = new WeakMap(); var cacheNodeInterop = new WeakMap(); return (_getRequireWildcardCache = function (nodeInterop) { return nodeInterop ? cacheNodeInterop : cacheBabelInterop; })(nodeInterop); }

function _interopRequireWildcard(obj, nodeInterop) { if (!nodeInterop && obj && obj.__esModule) { return obj; } if (obj === null || typeof obj !== "object" && typeof obj !== "function") { return { default: obj }; } var cache = _getRequireWildcardCache(nodeInterop); if (cache && cache.has(obj)) { return cache.get(obj); } var newObj = {}; var hasPropertyDescriptor = Object.defineProperty && Object.getOwnPropertyDescriptor; for (var key in obj) { if (key !== "default" && Object.prototype.hasOwnProperty.call(obj, key)) { var desc = hasPropertyDescriptor ? Object.getOwnPropertyDescriptor(obj, key) : null; if (desc && (desc.get || desc.set)) { Object.defineProperty(newObj, key, desc); } else { newObj[key] = obj[key]; } } } newObj.default = obj; if (cache) { cache.set(obj, newObj); } return newObj; }

function _interopRequireDefault(obj) { return obj && obj.__esModule ? obj : { default: obj }; }

function ownKeys(object, enumerableOnly) { var keys = Object.keys(object); if (Object.getOwnPropertySymbols) { var symbols = Object.getOwnPropertySymbols(object); if (enumerableOnly) { symbols = symbols.filter(function (sym) { return Object.getOwnPropertyDescriptor(object, sym).enumerable; }); } keys.push.apply(keys, symbols); } return keys; }

function _objectSpread(target) { for (var i = 1; i < arguments.length; i++) { var source = arguments[i] != null ? arguments[i] : {}; if (i % 2) { ownKeys(Object(source), true).forEach(function (key) { _defineProperty(target, key, source[key]); }); } else if (Object.getOwnPropertyDescriptors) { Object.defineProperties(target, Object.getOwnPropertyDescriptors(source)); } else { ownKeys(Object(source)).forEach(function (key) { Object.defineProperty(target, key, Object.getOwnPropertyDescriptor(source, key)); }); } } return target; }

function _defineProperty(obj, key, value) { if (key in obj) { Object.defineProperty(obj, key, { value: value, enumerable: true, configurable: true, writable: true }); } else { obj[key] = value; } return obj; }

const filterDeletedFields = fields => Object.keys(fields).reduce((acc, key) => {
  var _fields$key;

  if (typeof fields[key] === 'object' && ((_fields$key = fields[key]) === null || _fields$key === void 0 ? void 0 : _fields$key.__op) === 'Delete') {
    acc[key] = null;
  }

  return acc;
}, fields);

const getOnlyRequiredFields = (updatedFields, selectedFieldsString, includedFieldsString, nativeObjectFields) => {
  const includedFields = includedFieldsString ? includedFieldsString.split(',') : [];
  const selectedFields = selectedFieldsString ? selectedFieldsString.split(',') : [];
  const missingFields = selectedFields.filter(field => !nativeObjectFields.includes(field) || includedFields.includes(field)).join(',');

  if (!missingFields.length) {
    return {
      needGet: false,
      keys: ''
    };
  } else {
    return {
      needGet: true,
      keys: missingFields
    };
  }
};

const load = function (parseGraphQLSchema, parseClass, parseClassConfig) {
  const className = parseClass.className;
  const graphQLClassName = (0, _className.transformClassNameToGraphQL)(className);
  const getGraphQLQueryName = graphQLClassName.charAt(0).toLowerCase() + graphQLClassName.slice(1);
  const {
    create: isCreateEnabled = true,
    update: isUpdateEnabled = true,
    destroy: isDestroyEnabled = true,
    createAlias = '',
    updateAlias = '',
    destroyAlias = ''
  } = (0, _parseGraphQLUtils.getParseClassMutationConfig)(parseClassConfig);
  const {
    classGraphQLCreateType,
    classGraphQLUpdateType,
    classGraphQLOutputType
  } = parseGraphQLSchema.parseClassTypes[className];

  if (isCreateEnabled) {
    const createGraphQLMutationName = createAlias || `create${graphQLClassName}`;
    const createGraphQLMutation = (0, _graphqlRelay.mutationWithClientMutationId)({
      name: `Create${graphQLClassName}`,
      description: `The ${createGraphQLMutationName} mutation can be used to create a new object of the ${graphQLClassName} class.`,
      inputFields: {
        fields: {
          description: 'These are the fields that will be used to create the new object.',
          type: classGraphQLCreateType || defaultGraphQLTypes.OBJECT
        }
      },
      outputFields: {
        [getGraphQLQueryName]: {
          description: 'This is the created object.',
          type: new _graphql.GraphQLNonNull(classGraphQLOutputType || defaultGraphQLTypes.OBJECT)
        }
      },
      mutateAndGetPayload: async (args, context, mutationInfo) => {
        try {
          let {
            fields
          } = (0, _deepcopy.default)(args);
          if (!fields) fields = {};
          const {
            config,
            auth,
            info
          } = context;
          const parseFields = await (0, _mutation.transformTypes)('create', fields, {
            className,
            parseGraphQLSchema,
            req: {
              config,
              auth,
              info
            }
          });
          const createdObject = await objectsMutations.createObject(className, parseFields, config, auth, info);
          const selectedFields = (0, _graphqlListFields.default)(mutationInfo).filter(field => field.startsWith(`${getGraphQLQueryName}.`)).map(field => field.replace(`${getGraphQLQueryName}.`, ''));
          const {
            keys,
            include
          } = (0, _parseGraphQLUtils.extractKeysAndInclude)(selectedFields);
          const {
            keys: requiredKeys,
            needGet
          } = getOnlyRequiredFields(fields, keys, include, ['id', 'objectId', 'createdAt', 'updatedAt']);
          const needToGetAllKeys = objectsQueries.needToGetAllKeys(parseClass.fields, keys, parseGraphQLSchema.parseClasses);
          let optimizedObject = {};

          if (needGet && !needToGetAllKeys) {
            optimizedObject = await objectsQueries.getObject(className, createdObject.objectId, requiredKeys, include, undefined, undefined, config, auth, info, parseGraphQLSchema.parseClasses);
          } else if (needToGetAllKeys) {
            optimizedObject = await objectsQueries.getObject(className, createdObject.objectId, undefined, include, undefined, undefined, config, auth, info, parseGraphQLSchema.parseClasses);
          }

          return {
            [getGraphQLQueryName]: _objectSpread(_objectSpread(_objectSpread({}, createdObject), {}, {
              updatedAt: createdObject.createdAt
            }, filterDeletedFields(parseFields)), optimizedObject)
          };
        } catch (e) {
          parseGraphQLSchema.handleError(e);
        }
      }
    });

    if (parseGraphQLSchema.addGraphQLType(createGraphQLMutation.args.input.type.ofType) && parseGraphQLSchema.addGraphQLType(createGraphQLMutation.type)) {
      parseGraphQLSchema.addGraphQLMutation(createGraphQLMutationName, createGraphQLMutation);
    }
  }

  if (isUpdateEnabled) {
    const updateGraphQLMutationName = updateAlias || `update${graphQLClassName}`;
    const updateGraphQLMutation = (0, _graphqlRelay.mutationWithClientMutationId)({
      name: `Update${graphQLClassName}`,
      description: `The ${updateGraphQLMutationName} mutation can be used to update an object of the ${graphQLClassName} class.`,
      inputFields: {
        id: defaultGraphQLTypes.GLOBAL_OR_OBJECT_ID_ATT,
        fields: {
          description: 'These are the fields that will be used to update the object.',
          type: classGraphQLUpdateType || defaultGraphQLTypes.OBJECT
        }
      },
      outputFields: {
        [getGraphQLQueryName]: {
          description: 'This is the updated object.',
          type: new _graphql.GraphQLNonNull(classGraphQLOutputType || defaultGraphQLTypes.OBJECT)
        }
      },
      mutateAndGetPayload: async (args, context, mutationInfo) => {
        try {
          let {
            id,
            fields
          } = (0, _deepcopy.default)(args);
          if (!fields) fields = {};
          const {
            config,
            auth,
            info
          } = context;
          const globalIdObject = (0, _graphqlRelay.fromGlobalId)(id);

          if (globalIdObject.type === className) {
            id = globalIdObject.id;
          }

          const parseFields = await (0, _mutation.transformTypes)('update', fields, {
            className,
            parseGraphQLSchema,
            req: {
              config,
              auth,
              info
            }
          });
          const updatedObject = await objectsMutations.updateObject(className, id, parseFields, config, auth, info);
          const selectedFields = (0, _graphqlListFields.default)(mutationInfo).filter(field => field.startsWith(`${getGraphQLQueryName}.`)).map(field => field.replace(`${getGraphQLQueryName}.`, ''));
          const {
            keys,
            include
          } = (0, _parseGraphQLUtils.extractKeysAndInclude)(selectedFields);
          const {
            keys: requiredKeys,
            needGet
          } = getOnlyRequiredFields(fields, keys, include, ['id', 'objectId', 'updatedAt']);
          const needToGetAllKeys = objectsQueries.needToGetAllKeys(parseClass.fields, keys, parseGraphQLSchema.parseClasses);
          let optimizedObject = {};

          if (needGet && !needToGetAllKeys) {
            optimizedObject = await objectsQueries.getObject(className, id, requiredKeys, include, undefined, undefined, config, auth, info, parseGraphQLSchema.parseClasses);
          } else if (needToGetAllKeys) {
            optimizedObject = await objectsQueries.getObject(className, id, undefined, include, undefined, undefined, config, auth, info, parseGraphQLSchema.parseClasses);
          }

          return {
            [getGraphQLQueryName]: _objectSpread(_objectSpread(_objectSpread({
              objectId: id
            }, updatedObject), filterDeletedFields(parseFields)), optimizedObject)
          };
        } catch (e) {
          parseGraphQLSchema.handleError(e);
        }
      }
    });

    if (parseGraphQLSchema.addGraphQLType(updateGraphQLMutation.args.input.type.ofType) && parseGraphQLSchema.addGraphQLType(updateGraphQLMutation.type)) {
      parseGraphQLSchema.addGraphQLMutation(updateGraphQLMutationName, updateGraphQLMutation);
    }
  }

  if (isDestroyEnabled) {
    const deleteGraphQLMutationName = destroyAlias || `delete${graphQLClassName}`;
    const deleteGraphQLMutation = (0, _graphqlRelay.mutationWithClientMutationId)({
      name: `Delete${graphQLClassName}`,
      description: `The ${deleteGraphQLMutationName} mutation can be used to delete an object of the ${graphQLClassName} class.`,
      inputFields: {
        id: defaultGraphQLTypes.GLOBAL_OR_OBJECT_ID_ATT
      },
      outputFields: {
        [getGraphQLQueryName]: {
          description: 'This is the deleted object.',
          type: new _graphql.GraphQLNonNull(classGraphQLOutputType || defaultGraphQLTypes.OBJECT)
        }
      },
      mutateAndGetPayload: async (args, context, mutationInfo) => {
        try {
          let {
            id
          } = (0, _deepcopy.default)(args);
          const {
            config,
            auth,
            info
          } = context;
          const globalIdObject = (0, _graphqlRelay.fromGlobalId)(id);

          if (globalIdObject.type === className) {
            id = globalIdObject.id;
          }

          const selectedFields = (0, _graphqlListFields.default)(mutationInfo).filter(field => field.startsWith(`${getGraphQLQueryName}.`)).map(field => field.replace(`${getGraphQLQueryName}.`, ''));
          const {
            keys,
            include
          } = (0, _parseGraphQLUtils.extractKeysAndInclude)(selectedFields);
          let optimizedObject = {};

          if (keys && keys.split(',').filter(key => !['id', 'objectId'].includes(key)).length > 0) {
            optimizedObject = await objectsQueries.getObject(className, id, keys, include, undefined, undefined, config, auth, info, parseGraphQLSchema.parseClasses);
          }

          await objectsMutations.deleteObject(className, id, config, auth, info);
          return {
            [getGraphQLQueryName]: _objectSpread({
              objectId: id
            }, optimizedObject)
          };
        } catch (e) {
          parseGraphQLSchema.handleError(e);
        }
      }
    });

    if (parseGraphQLSchema.addGraphQLType(deleteGraphQLMutation.args.input.type.ofType) && parseGraphQLSchema.addGraphQLType(deleteGraphQLMutation.type)) {
      parseGraphQLSchema.addGraphQLMutation(deleteGraphQLMutationName, deleteGraphQLMutation);
    }
  }
};

exports.load = load;
//# sourceMappingURL=data:application/json;charset=utf-8;base64,eyJ2ZXJzaW9uIjozLCJzb3VyY2VzIjpbIi4uLy4uLy4uL3NyYy9HcmFwaFFML2xvYWRlcnMvcGFyc2VDbGFzc011dGF0aW9ucy5qcyJdLCJuYW1lcyI6WyJmaWx0ZXJEZWxldGVkRmllbGRzIiwiZmllbGRzIiwiT2JqZWN0Iiwia2V5cyIsInJlZHVjZSIsImFjYyIsImtleSIsIl9fb3AiLCJnZXRPbmx5UmVxdWlyZWRGaWVsZHMiLCJ1cGRhdGVkRmllbGRzIiwic2VsZWN0ZWRGaWVsZHNTdHJpbmciLCJpbmNsdWRlZEZpZWxkc1N0cmluZyIsIm5hdGl2ZU9iamVjdEZpZWxkcyIsImluY2x1ZGVkRmllbGRzIiwic3BsaXQiLCJzZWxlY3RlZEZpZWxkcyIsIm1pc3NpbmdGaWVsZHMiLCJmaWx0ZXIiLCJmaWVsZCIsImluY2x1ZGVzIiwiam9pbiIsImxlbmd0aCIsIm5lZWRHZXQiLCJsb2FkIiwicGFyc2VHcmFwaFFMU2NoZW1hIiwicGFyc2VDbGFzcyIsInBhcnNlQ2xhc3NDb25maWciLCJjbGFzc05hbWUiLCJncmFwaFFMQ2xhc3NOYW1lIiwiZ2V0R3JhcGhRTFF1ZXJ5TmFtZSIsImNoYXJBdCIsInRvTG93ZXJDYXNlIiwic2xpY2UiLCJjcmVhdGUiLCJpc0NyZWF0ZUVuYWJsZWQiLCJ1cGRhdGUiLCJpc1VwZGF0ZUVuYWJsZWQiLCJkZXN0cm95IiwiaXNEZXN0cm95RW5hYmxlZCIsImNyZWF0ZUFsaWFzIiwidXBkYXRlQWxpYXMiLCJkZXN0cm95QWxpYXMiLCJjbGFzc0dyYXBoUUxDcmVhdGVUeXBlIiwiY2xhc3NHcmFwaFFMVXBkYXRlVHlwZSIsImNsYXNzR3JhcGhRTE91dHB1dFR5cGUiLCJwYXJzZUNsYXNzVHlwZXMiLCJjcmVhdGVHcmFwaFFMTXV0YXRpb25OYW1lIiwiY3JlYXRlR3JhcGhRTE11dGF0aW9uIiwibmFtZSIsImRlc2NyaXB0aW9uIiwiaW5wdXRGaWVsZHMiLCJ0eXBlIiwiZGVmYXVsdEdyYXBoUUxUeXBlcyIsIk9CSkVDVCIsIm91dHB1dEZpZWxkcyIsIkdyYXBoUUxOb25OdWxsIiwibXV0YXRlQW5kR2V0UGF5bG9hZCIsImFyZ3MiLCJjb250ZXh0IiwibXV0YXRpb25JbmZvIiwiY29uZmlnIiwiYXV0aCIsImluZm8iLCJwYXJzZUZpZWxkcyIsInJlcSIsImNyZWF0ZWRPYmplY3QiLCJvYmplY3RzTXV0YXRpb25zIiwiY3JlYXRlT2JqZWN0Iiwic3RhcnRzV2l0aCIsIm1hcCIsInJlcGxhY2UiLCJpbmNsdWRlIiwicmVxdWlyZWRLZXlzIiwibmVlZFRvR2V0QWxsS2V5cyIsIm9iamVjdHNRdWVyaWVzIiwicGFyc2VDbGFzc2VzIiwib3B0aW1pemVkT2JqZWN0IiwiZ2V0T2JqZWN0Iiwib2JqZWN0SWQiLCJ1bmRlZmluZWQiLCJ1cGRhdGVkQXQiLCJjcmVhdGVkQXQiLCJlIiwiaGFuZGxlRXJyb3IiLCJhZGRHcmFwaFFMVHlwZSIsImlucHV0Iiwib2ZUeXBlIiwiYWRkR3JhcGhRTE11dGF0aW9uIiwidXBkYXRlR3JhcGhRTE11dGF0aW9uTmFtZSIsInVwZGF0ZUdyYXBoUUxNdXRhdGlvbiIsImlkIiwiR0xPQkFMX09SX09CSkVDVF9JRF9BVFQiLCJnbG9iYWxJZE9iamVjdCIsInVwZGF0ZWRPYmplY3QiLCJ1cGRhdGVPYmplY3QiLCJkZWxldGVHcmFwaFFMTXV0YXRpb25OYW1lIiwiZGVsZXRlR3JhcGhRTE11dGF0aW9uIiwiZGVsZXRlT2JqZWN0Il0sIm1hcHBpbmdzIjoiOzs7Ozs7O0FBQUE7O0FBQ0E7O0FBQ0E7O0FBQ0E7O0FBQ0E7O0FBQ0E7O0FBQ0E7O0FBQ0E7O0FBQ0E7O0FBQ0E7O0FBQ0E7Ozs7Ozs7Ozs7Ozs7O0FBRUEsTUFBTUEsbUJBQW1CLEdBQUdDLE1BQU0sSUFDaENDLE1BQU0sQ0FBQ0MsSUFBUCxDQUFZRixNQUFaLEVBQW9CRyxNQUFwQixDQUEyQixDQUFDQyxHQUFELEVBQU1DLEdBQU4sS0FBYztBQUFBOztBQUN2QyxNQUFJLE9BQU9MLE1BQU0sQ0FBQ0ssR0FBRCxDQUFiLEtBQXVCLFFBQXZCLElBQW1DLGdCQUFBTCxNQUFNLENBQUNLLEdBQUQsQ0FBTiw0REFBYUMsSUFBYixNQUFzQixRQUE3RCxFQUF1RTtBQUNyRUYsSUFBQUEsR0FBRyxDQUFDQyxHQUFELENBQUgsR0FBVyxJQUFYO0FBQ0Q7O0FBQ0QsU0FBT0QsR0FBUDtBQUNELENBTEQsRUFLR0osTUFMSCxDQURGOztBQVFBLE1BQU1PLHFCQUFxQixHQUFHLENBQzVCQyxhQUQ0QixFQUU1QkMsb0JBRjRCLEVBRzVCQyxvQkFINEIsRUFJNUJDLGtCQUo0QixLQUt6QjtBQUNILFFBQU1DLGNBQWMsR0FBR0Ysb0JBQW9CLEdBQUdBLG9CQUFvQixDQUFDRyxLQUFyQixDQUEyQixHQUEzQixDQUFILEdBQXFDLEVBQWhGO0FBQ0EsUUFBTUMsY0FBYyxHQUFHTCxvQkFBb0IsR0FBR0Esb0JBQW9CLENBQUNJLEtBQXJCLENBQTJCLEdBQTNCLENBQUgsR0FBcUMsRUFBaEY7QUFDQSxRQUFNRSxhQUFhLEdBQUdELGNBQWMsQ0FDakNFLE1BRG1CLENBQ1pDLEtBQUssSUFBSSxDQUFDTixrQkFBa0IsQ0FBQ08sUUFBbkIsQ0FBNEJELEtBQTVCLENBQUQsSUFBdUNMLGNBQWMsQ0FBQ00sUUFBZixDQUF3QkQsS0FBeEIsQ0FEcEMsRUFFbkJFLElBRm1CLENBRWQsR0FGYyxDQUF0Qjs7QUFHQSxNQUFJLENBQUNKLGFBQWEsQ0FBQ0ssTUFBbkIsRUFBMkI7QUFDekIsV0FBTztBQUFFQyxNQUFBQSxPQUFPLEVBQUUsS0FBWDtBQUFrQm5CLE1BQUFBLElBQUksRUFBRTtBQUF4QixLQUFQO0FBQ0QsR0FGRCxNQUVPO0FBQ0wsV0FBTztBQUFFbUIsTUFBQUEsT0FBTyxFQUFFLElBQVg7QUFBaUJuQixNQUFBQSxJQUFJLEVBQUVhO0FBQXZCLEtBQVA7QUFDRDtBQUNGLENBaEJEOztBQWtCQSxNQUFNTyxJQUFJLEdBQUcsVUFBVUMsa0JBQVYsRUFBOEJDLFVBQTlCLEVBQTBDQyxnQkFBMUMsRUFBc0Y7QUFDakcsUUFBTUMsU0FBUyxHQUFHRixVQUFVLENBQUNFLFNBQTdCO0FBQ0EsUUFBTUMsZ0JBQWdCLEdBQUcsNENBQTRCRCxTQUE1QixDQUF6QjtBQUNBLFFBQU1FLG1CQUFtQixHQUFHRCxnQkFBZ0IsQ0FBQ0UsTUFBakIsQ0FBd0IsQ0FBeEIsRUFBMkJDLFdBQTNCLEtBQTJDSCxnQkFBZ0IsQ0FBQ0ksS0FBakIsQ0FBdUIsQ0FBdkIsQ0FBdkU7QUFFQSxRQUFNO0FBQ0pDLElBQUFBLE1BQU0sRUFBRUMsZUFBZSxHQUFHLElBRHRCO0FBRUpDLElBQUFBLE1BQU0sRUFBRUMsZUFBZSxHQUFHLElBRnRCO0FBR0pDLElBQUFBLE9BQU8sRUFBRUMsZ0JBQWdCLEdBQUcsSUFIeEI7QUFJU0MsSUFBQUEsV0FBVyxHQUFHLEVBSnZCO0FBS1NDLElBQUFBLFdBQVcsR0FBRyxFQUx2QjtBQU1VQyxJQUFBQSxZQUFZLEdBQUc7QUFOekIsTUFPRixvREFBNEJmLGdCQUE1QixDQVBKO0FBU0EsUUFBTTtBQUNKZ0IsSUFBQUEsc0JBREk7QUFFSkMsSUFBQUEsc0JBRkk7QUFHSkMsSUFBQUE7QUFISSxNQUlGcEIsa0JBQWtCLENBQUNxQixlQUFuQixDQUFtQ2xCLFNBQW5DLENBSko7O0FBTUEsTUFBSU8sZUFBSixFQUFxQjtBQUNuQixVQUFNWSx5QkFBeUIsR0FBR1AsV0FBVyxJQUFLLFNBQVFYLGdCQUFpQixFQUEzRTtBQUNBLFVBQU1tQixxQkFBcUIsR0FBRyxnREFBNkI7QUFDekRDLE1BQUFBLElBQUksRUFBRyxTQUFRcEIsZ0JBQWlCLEVBRHlCO0FBRXpEcUIsTUFBQUEsV0FBVyxFQUFHLE9BQU1ILHlCQUEwQix1REFBc0RsQixnQkFBaUIsU0FGNUQ7QUFHekRzQixNQUFBQSxXQUFXLEVBQUU7QUFDWGpELFFBQUFBLE1BQU0sRUFBRTtBQUNOZ0QsVUFBQUEsV0FBVyxFQUFFLGtFQURQO0FBRU5FLFVBQUFBLElBQUksRUFBRVQsc0JBQXNCLElBQUlVLG1CQUFtQixDQUFDQztBQUY5QztBQURHLE9BSDRDO0FBU3pEQyxNQUFBQSxZQUFZLEVBQUU7QUFDWixTQUFDekIsbUJBQUQsR0FBdUI7QUFDckJvQixVQUFBQSxXQUFXLEVBQUUsNkJBRFE7QUFFckJFLFVBQUFBLElBQUksRUFBRSxJQUFJSSx1QkFBSixDQUFtQlgsc0JBQXNCLElBQUlRLG1CQUFtQixDQUFDQyxNQUFqRTtBQUZlO0FBRFgsT0FUMkM7QUFlekRHLE1BQUFBLG1CQUFtQixFQUFFLE9BQU9DLElBQVAsRUFBYUMsT0FBYixFQUFzQkMsWUFBdEIsS0FBdUM7QUFDMUQsWUFBSTtBQUNGLGNBQUk7QUFBRTFELFlBQUFBO0FBQUYsY0FBYSx1QkFBU3dELElBQVQsQ0FBakI7QUFDQSxjQUFJLENBQUN4RCxNQUFMLEVBQWFBLE1BQU0sR0FBRyxFQUFUO0FBQ2IsZ0JBQU07QUFBRTJELFlBQUFBLE1BQUY7QUFBVUMsWUFBQUEsSUFBVjtBQUFnQkMsWUFBQUE7QUFBaEIsY0FBeUJKLE9BQS9CO0FBRUEsZ0JBQU1LLFdBQVcsR0FBRyxNQUFNLDhCQUFlLFFBQWYsRUFBeUI5RCxNQUF6QixFQUFpQztBQUN6RDBCLFlBQUFBLFNBRHlEO0FBRXpESCxZQUFBQSxrQkFGeUQ7QUFHekR3QyxZQUFBQSxHQUFHLEVBQUU7QUFBRUosY0FBQUEsTUFBRjtBQUFVQyxjQUFBQSxJQUFWO0FBQWdCQyxjQUFBQTtBQUFoQjtBQUhvRCxXQUFqQyxDQUExQjtBQU1BLGdCQUFNRyxhQUFhLEdBQUcsTUFBTUMsZ0JBQWdCLENBQUNDLFlBQWpCLENBQzFCeEMsU0FEMEIsRUFFMUJvQyxXQUYwQixFQUcxQkgsTUFIMEIsRUFJMUJDLElBSjBCLEVBSzFCQyxJQUwwQixDQUE1QjtBQU9BLGdCQUFNL0MsY0FBYyxHQUFHLGdDQUFjNEMsWUFBZCxFQUNwQjFDLE1BRG9CLENBQ2JDLEtBQUssSUFBSUEsS0FBSyxDQUFDa0QsVUFBTixDQUFrQixHQUFFdkMsbUJBQW9CLEdBQXhDLENBREksRUFFcEJ3QyxHQUZvQixDQUVoQm5ELEtBQUssSUFBSUEsS0FBSyxDQUFDb0QsT0FBTixDQUFlLEdBQUV6QyxtQkFBb0IsR0FBckMsRUFBeUMsRUFBekMsQ0FGTyxDQUF2QjtBQUdBLGdCQUFNO0FBQUUxQixZQUFBQSxJQUFGO0FBQVFvRSxZQUFBQTtBQUFSLGNBQW9CLDhDQUFzQnhELGNBQXRCLENBQTFCO0FBQ0EsZ0JBQU07QUFBRVosWUFBQUEsSUFBSSxFQUFFcUUsWUFBUjtBQUFzQmxELFlBQUFBO0FBQXRCLGNBQWtDZCxxQkFBcUIsQ0FBQ1AsTUFBRCxFQUFTRSxJQUFULEVBQWVvRSxPQUFmLEVBQXdCLENBQ25GLElBRG1GLEVBRW5GLFVBRm1GLEVBR25GLFdBSG1GLEVBSW5GLFdBSm1GLENBQXhCLENBQTdEO0FBTUEsZ0JBQU1FLGdCQUFnQixHQUFHQyxjQUFjLENBQUNELGdCQUFmLENBQ3ZCaEQsVUFBVSxDQUFDeEIsTUFEWSxFQUV2QkUsSUFGdUIsRUFHdkJxQixrQkFBa0IsQ0FBQ21ELFlBSEksQ0FBekI7QUFLQSxjQUFJQyxlQUFlLEdBQUcsRUFBdEI7O0FBQ0EsY0FBSXRELE9BQU8sSUFBSSxDQUFDbUQsZ0JBQWhCLEVBQWtDO0FBQ2hDRyxZQUFBQSxlQUFlLEdBQUcsTUFBTUYsY0FBYyxDQUFDRyxTQUFmLENBQ3RCbEQsU0FEc0IsRUFFdEJzQyxhQUFhLENBQUNhLFFBRlEsRUFHdEJOLFlBSHNCLEVBSXRCRCxPQUpzQixFQUt0QlEsU0FMc0IsRUFNdEJBLFNBTnNCLEVBT3RCbkIsTUFQc0IsRUFRdEJDLElBUnNCLEVBU3RCQyxJQVRzQixFQVV0QnRDLGtCQUFrQixDQUFDbUQsWUFWRyxDQUF4QjtBQVlELFdBYkQsTUFhTyxJQUFJRixnQkFBSixFQUFzQjtBQUMzQkcsWUFBQUEsZUFBZSxHQUFHLE1BQU1GLGNBQWMsQ0FBQ0csU0FBZixDQUN0QmxELFNBRHNCLEVBRXRCc0MsYUFBYSxDQUFDYSxRQUZRLEVBR3RCQyxTQUhzQixFQUl0QlIsT0FKc0IsRUFLdEJRLFNBTHNCLEVBTXRCQSxTQU5zQixFQU90Qm5CLE1BUHNCLEVBUXRCQyxJQVJzQixFQVN0QkMsSUFUc0IsRUFVdEJ0QyxrQkFBa0IsQ0FBQ21ELFlBVkcsQ0FBeEI7QUFZRDs7QUFDRCxpQkFBTztBQUNMLGFBQUM5QyxtQkFBRCxpREFDS29DLGFBREw7QUFFRWUsY0FBQUEsU0FBUyxFQUFFZixhQUFhLENBQUNnQjtBQUYzQixlQUdLakYsbUJBQW1CLENBQUMrRCxXQUFELENBSHhCLEdBSUthLGVBSkw7QUFESyxXQUFQO0FBUUQsU0FyRUQsQ0FxRUUsT0FBT00sQ0FBUCxFQUFVO0FBQ1YxRCxVQUFBQSxrQkFBa0IsQ0FBQzJELFdBQW5CLENBQStCRCxDQUEvQjtBQUNEO0FBQ0Y7QUF4RndELEtBQTdCLENBQTlCOztBQTJGQSxRQUNFMUQsa0JBQWtCLENBQUM0RCxjQUFuQixDQUFrQ3JDLHFCQUFxQixDQUFDVSxJQUF0QixDQUEyQjRCLEtBQTNCLENBQWlDbEMsSUFBakMsQ0FBc0NtQyxNQUF4RSxLQUNBOUQsa0JBQWtCLENBQUM0RCxjQUFuQixDQUFrQ3JDLHFCQUFxQixDQUFDSSxJQUF4RCxDQUZGLEVBR0U7QUFDQTNCLE1BQUFBLGtCQUFrQixDQUFDK0Qsa0JBQW5CLENBQXNDekMseUJBQXRDLEVBQWlFQyxxQkFBakU7QUFDRDtBQUNGOztBQUVELE1BQUlYLGVBQUosRUFBcUI7QUFDbkIsVUFBTW9ELHlCQUF5QixHQUFHaEQsV0FBVyxJQUFLLFNBQVFaLGdCQUFpQixFQUEzRTtBQUNBLFVBQU02RCxxQkFBcUIsR0FBRyxnREFBNkI7QUFDekR6QyxNQUFBQSxJQUFJLEVBQUcsU0FBUXBCLGdCQUFpQixFQUR5QjtBQUV6RHFCLE1BQUFBLFdBQVcsRUFBRyxPQUFNdUMseUJBQTBCLG9EQUFtRDVELGdCQUFpQixTQUZ6RDtBQUd6RHNCLE1BQUFBLFdBQVcsRUFBRTtBQUNYd0MsUUFBQUEsRUFBRSxFQUFFdEMsbUJBQW1CLENBQUN1Qyx1QkFEYjtBQUVYMUYsUUFBQUEsTUFBTSxFQUFFO0FBQ05nRCxVQUFBQSxXQUFXLEVBQUUsOERBRFA7QUFFTkUsVUFBQUEsSUFBSSxFQUFFUixzQkFBc0IsSUFBSVMsbUJBQW1CLENBQUNDO0FBRjlDO0FBRkcsT0FINEM7QUFVekRDLE1BQUFBLFlBQVksRUFBRTtBQUNaLFNBQUN6QixtQkFBRCxHQUF1QjtBQUNyQm9CLFVBQUFBLFdBQVcsRUFBRSw2QkFEUTtBQUVyQkUsVUFBQUEsSUFBSSxFQUFFLElBQUlJLHVCQUFKLENBQW1CWCxzQkFBc0IsSUFBSVEsbUJBQW1CLENBQUNDLE1BQWpFO0FBRmU7QUFEWCxPQVYyQztBQWdCekRHLE1BQUFBLG1CQUFtQixFQUFFLE9BQU9DLElBQVAsRUFBYUMsT0FBYixFQUFzQkMsWUFBdEIsS0FBdUM7QUFDMUQsWUFBSTtBQUNGLGNBQUk7QUFBRStCLFlBQUFBLEVBQUY7QUFBTXpGLFlBQUFBO0FBQU4sY0FBaUIsdUJBQVN3RCxJQUFULENBQXJCO0FBQ0EsY0FBSSxDQUFDeEQsTUFBTCxFQUFhQSxNQUFNLEdBQUcsRUFBVDtBQUNiLGdCQUFNO0FBQUUyRCxZQUFBQSxNQUFGO0FBQVVDLFlBQUFBLElBQVY7QUFBZ0JDLFlBQUFBO0FBQWhCLGNBQXlCSixPQUEvQjtBQUVBLGdCQUFNa0MsY0FBYyxHQUFHLGdDQUFhRixFQUFiLENBQXZCOztBQUVBLGNBQUlFLGNBQWMsQ0FBQ3pDLElBQWYsS0FBd0J4QixTQUE1QixFQUF1QztBQUNyQytELFlBQUFBLEVBQUUsR0FBR0UsY0FBYyxDQUFDRixFQUFwQjtBQUNEOztBQUVELGdCQUFNM0IsV0FBVyxHQUFHLE1BQU0sOEJBQWUsUUFBZixFQUF5QjlELE1BQXpCLEVBQWlDO0FBQ3pEMEIsWUFBQUEsU0FEeUQ7QUFFekRILFlBQUFBLGtCQUZ5RDtBQUd6RHdDLFlBQUFBLEdBQUcsRUFBRTtBQUFFSixjQUFBQSxNQUFGO0FBQVVDLGNBQUFBLElBQVY7QUFBZ0JDLGNBQUFBO0FBQWhCO0FBSG9ELFdBQWpDLENBQTFCO0FBTUEsZ0JBQU0rQixhQUFhLEdBQUcsTUFBTTNCLGdCQUFnQixDQUFDNEIsWUFBakIsQ0FDMUJuRSxTQUQwQixFQUUxQitELEVBRjBCLEVBRzFCM0IsV0FIMEIsRUFJMUJILE1BSjBCLEVBSzFCQyxJQUwwQixFQU0xQkMsSUFOMEIsQ0FBNUI7QUFTQSxnQkFBTS9DLGNBQWMsR0FBRyxnQ0FBYzRDLFlBQWQsRUFDcEIxQyxNQURvQixDQUNiQyxLQUFLLElBQUlBLEtBQUssQ0FBQ2tELFVBQU4sQ0FBa0IsR0FBRXZDLG1CQUFvQixHQUF4QyxDQURJLEVBRXBCd0MsR0FGb0IsQ0FFaEJuRCxLQUFLLElBQUlBLEtBQUssQ0FBQ29ELE9BQU4sQ0FBZSxHQUFFekMsbUJBQW9CLEdBQXJDLEVBQXlDLEVBQXpDLENBRk8sQ0FBdkI7QUFHQSxnQkFBTTtBQUFFMUIsWUFBQUEsSUFBRjtBQUFRb0UsWUFBQUE7QUFBUixjQUFvQiw4Q0FBc0J4RCxjQUF0QixDQUExQjtBQUNBLGdCQUFNO0FBQUVaLFlBQUFBLElBQUksRUFBRXFFLFlBQVI7QUFBc0JsRCxZQUFBQTtBQUF0QixjQUFrQ2QscUJBQXFCLENBQUNQLE1BQUQsRUFBU0UsSUFBVCxFQUFlb0UsT0FBZixFQUF3QixDQUNuRixJQURtRixFQUVuRixVQUZtRixFQUduRixXQUhtRixDQUF4QixDQUE3RDtBQUtBLGdCQUFNRSxnQkFBZ0IsR0FBR0MsY0FBYyxDQUFDRCxnQkFBZixDQUN2QmhELFVBQVUsQ0FBQ3hCLE1BRFksRUFFdkJFLElBRnVCLEVBR3ZCcUIsa0JBQWtCLENBQUNtRCxZQUhJLENBQXpCO0FBS0EsY0FBSUMsZUFBZSxHQUFHLEVBQXRCOztBQUNBLGNBQUl0RCxPQUFPLElBQUksQ0FBQ21ELGdCQUFoQixFQUFrQztBQUNoQ0csWUFBQUEsZUFBZSxHQUFHLE1BQU1GLGNBQWMsQ0FBQ0csU0FBZixDQUN0QmxELFNBRHNCLEVBRXRCK0QsRUFGc0IsRUFHdEJsQixZQUhzQixFQUl0QkQsT0FKc0IsRUFLdEJRLFNBTHNCLEVBTXRCQSxTQU5zQixFQU90Qm5CLE1BUHNCLEVBUXRCQyxJQVJzQixFQVN0QkMsSUFUc0IsRUFVdEJ0QyxrQkFBa0IsQ0FBQ21ELFlBVkcsQ0FBeEI7QUFZRCxXQWJELE1BYU8sSUFBSUYsZ0JBQUosRUFBc0I7QUFDM0JHLFlBQUFBLGVBQWUsR0FBRyxNQUFNRixjQUFjLENBQUNHLFNBQWYsQ0FDdEJsRCxTQURzQixFQUV0QitELEVBRnNCLEVBR3RCWCxTQUhzQixFQUl0QlIsT0FKc0IsRUFLdEJRLFNBTHNCLEVBTXRCQSxTQU5zQixFQU90Qm5CLE1BUHNCLEVBUXRCQyxJQVJzQixFQVN0QkMsSUFUc0IsRUFVdEJ0QyxrQkFBa0IsQ0FBQ21ELFlBVkcsQ0FBeEI7QUFZRDs7QUFDRCxpQkFBTztBQUNMLGFBQUM5QyxtQkFBRDtBQUNFaUQsY0FBQUEsUUFBUSxFQUFFWTtBQURaLGVBRUtHLGFBRkwsR0FHSzdGLG1CQUFtQixDQUFDK0QsV0FBRCxDQUh4QixHQUlLYSxlQUpMO0FBREssV0FBUDtBQVFELFNBNUVELENBNEVFLE9BQU9NLENBQVAsRUFBVTtBQUNWMUQsVUFBQUEsa0JBQWtCLENBQUMyRCxXQUFuQixDQUErQkQsQ0FBL0I7QUFDRDtBQUNGO0FBaEd3RCxLQUE3QixDQUE5Qjs7QUFtR0EsUUFDRTFELGtCQUFrQixDQUFDNEQsY0FBbkIsQ0FBa0NLLHFCQUFxQixDQUFDaEMsSUFBdEIsQ0FBMkI0QixLQUEzQixDQUFpQ2xDLElBQWpDLENBQXNDbUMsTUFBeEUsS0FDQTlELGtCQUFrQixDQUFDNEQsY0FBbkIsQ0FBa0NLLHFCQUFxQixDQUFDdEMsSUFBeEQsQ0FGRixFQUdFO0FBQ0EzQixNQUFBQSxrQkFBa0IsQ0FBQytELGtCQUFuQixDQUFzQ0MseUJBQXRDLEVBQWlFQyxxQkFBakU7QUFDRDtBQUNGOztBQUVELE1BQUluRCxnQkFBSixFQUFzQjtBQUNwQixVQUFNeUQseUJBQXlCLEdBQUd0RCxZQUFZLElBQUssU0FBUWIsZ0JBQWlCLEVBQTVFO0FBQ0EsVUFBTW9FLHFCQUFxQixHQUFHLGdEQUE2QjtBQUN6RGhELE1BQUFBLElBQUksRUFBRyxTQUFRcEIsZ0JBQWlCLEVBRHlCO0FBRXpEcUIsTUFBQUEsV0FBVyxFQUFHLE9BQU04Qyx5QkFBMEIsb0RBQW1EbkUsZ0JBQWlCLFNBRnpEO0FBR3pEc0IsTUFBQUEsV0FBVyxFQUFFO0FBQ1h3QyxRQUFBQSxFQUFFLEVBQUV0QyxtQkFBbUIsQ0FBQ3VDO0FBRGIsT0FINEM7QUFNekRyQyxNQUFBQSxZQUFZLEVBQUU7QUFDWixTQUFDekIsbUJBQUQsR0FBdUI7QUFDckJvQixVQUFBQSxXQUFXLEVBQUUsNkJBRFE7QUFFckJFLFVBQUFBLElBQUksRUFBRSxJQUFJSSx1QkFBSixDQUFtQlgsc0JBQXNCLElBQUlRLG1CQUFtQixDQUFDQyxNQUFqRTtBQUZlO0FBRFgsT0FOMkM7QUFZekRHLE1BQUFBLG1CQUFtQixFQUFFLE9BQU9DLElBQVAsRUFBYUMsT0FBYixFQUFzQkMsWUFBdEIsS0FBdUM7QUFDMUQsWUFBSTtBQUNGLGNBQUk7QUFBRStCLFlBQUFBO0FBQUYsY0FBUyx1QkFBU2pDLElBQVQsQ0FBYjtBQUNBLGdCQUFNO0FBQUVHLFlBQUFBLE1BQUY7QUFBVUMsWUFBQUEsSUFBVjtBQUFnQkMsWUFBQUE7QUFBaEIsY0FBeUJKLE9BQS9CO0FBRUEsZ0JBQU1rQyxjQUFjLEdBQUcsZ0NBQWFGLEVBQWIsQ0FBdkI7O0FBRUEsY0FBSUUsY0FBYyxDQUFDekMsSUFBZixLQUF3QnhCLFNBQTVCLEVBQXVDO0FBQ3JDK0QsWUFBQUEsRUFBRSxHQUFHRSxjQUFjLENBQUNGLEVBQXBCO0FBQ0Q7O0FBRUQsZ0JBQU0zRSxjQUFjLEdBQUcsZ0NBQWM0QyxZQUFkLEVBQ3BCMUMsTUFEb0IsQ0FDYkMsS0FBSyxJQUFJQSxLQUFLLENBQUNrRCxVQUFOLENBQWtCLEdBQUV2QyxtQkFBb0IsR0FBeEMsQ0FESSxFQUVwQndDLEdBRm9CLENBRWhCbkQsS0FBSyxJQUFJQSxLQUFLLENBQUNvRCxPQUFOLENBQWUsR0FBRXpDLG1CQUFvQixHQUFyQyxFQUF5QyxFQUF6QyxDQUZPLENBQXZCO0FBR0EsZ0JBQU07QUFBRTFCLFlBQUFBLElBQUY7QUFBUW9FLFlBQUFBO0FBQVIsY0FBb0IsOENBQXNCeEQsY0FBdEIsQ0FBMUI7QUFDQSxjQUFJNkQsZUFBZSxHQUFHLEVBQXRCOztBQUNBLGNBQUl6RSxJQUFJLElBQUlBLElBQUksQ0FBQ1csS0FBTCxDQUFXLEdBQVgsRUFBZ0JHLE1BQWhCLENBQXVCWCxHQUFHLElBQUksQ0FBQyxDQUFDLElBQUQsRUFBTyxVQUFQLEVBQW1CYSxRQUFuQixDQUE0QmIsR0FBNUIsQ0FBL0IsRUFBaUVlLE1BQWpFLEdBQTBFLENBQXRGLEVBQXlGO0FBQ3ZGdUQsWUFBQUEsZUFBZSxHQUFHLE1BQU1GLGNBQWMsQ0FBQ0csU0FBZixDQUN0QmxELFNBRHNCLEVBRXRCK0QsRUFGc0IsRUFHdEJ2RixJQUhzQixFQUl0Qm9FLE9BSnNCLEVBS3RCUSxTQUxzQixFQU10QkEsU0FOc0IsRUFPdEJuQixNQVBzQixFQVF0QkMsSUFSc0IsRUFTdEJDLElBVHNCLEVBVXRCdEMsa0JBQWtCLENBQUNtRCxZQVZHLENBQXhCO0FBWUQ7O0FBQ0QsZ0JBQU1ULGdCQUFnQixDQUFDK0IsWUFBakIsQ0FBOEJ0RSxTQUE5QixFQUF5QytELEVBQXpDLEVBQTZDOUIsTUFBN0MsRUFBcURDLElBQXJELEVBQTJEQyxJQUEzRCxDQUFOO0FBQ0EsaUJBQU87QUFDTCxhQUFDakMsbUJBQUQ7QUFDRWlELGNBQUFBLFFBQVEsRUFBRVk7QUFEWixlQUVLZCxlQUZMO0FBREssV0FBUDtBQU1ELFNBcENELENBb0NFLE9BQU9NLENBQVAsRUFBVTtBQUNWMUQsVUFBQUEsa0JBQWtCLENBQUMyRCxXQUFuQixDQUErQkQsQ0FBL0I7QUFDRDtBQUNGO0FBcER3RCxLQUE3QixDQUE5Qjs7QUF1REEsUUFDRTFELGtCQUFrQixDQUFDNEQsY0FBbkIsQ0FBa0NZLHFCQUFxQixDQUFDdkMsSUFBdEIsQ0FBMkI0QixLQUEzQixDQUFpQ2xDLElBQWpDLENBQXNDbUMsTUFBeEUsS0FDQTlELGtCQUFrQixDQUFDNEQsY0FBbkIsQ0FBa0NZLHFCQUFxQixDQUFDN0MsSUFBeEQsQ0FGRixFQUdFO0FBQ0EzQixNQUFBQSxrQkFBa0IsQ0FBQytELGtCQUFuQixDQUFzQ1EseUJBQXRDLEVBQWlFQyxxQkFBakU7QUFDRDtBQUNGO0FBQ0YsQ0F0U0QiLCJzb3VyY2VzQ29udGVudCI6WyJpbXBvcnQgeyBHcmFwaFFMTm9uTnVsbCB9IGZyb20gJ2dyYXBocWwnO1xuaW1wb3J0IHsgZnJvbUdsb2JhbElkLCBtdXRhdGlvbldpdGhDbGllbnRNdXRhdGlvbklkIH0gZnJvbSAnZ3JhcGhxbC1yZWxheSc7XG5pbXBvcnQgZ2V0RmllbGROYW1lcyBmcm9tICdncmFwaHFsLWxpc3QtZmllbGRzJztcbmltcG9ydCBkZWVwY29weSBmcm9tICdkZWVwY29weSc7XG5pbXBvcnQgKiBhcyBkZWZhdWx0R3JhcGhRTFR5cGVzIGZyb20gJy4vZGVmYXVsdEdyYXBoUUxUeXBlcyc7XG5pbXBvcnQgeyBleHRyYWN0S2V5c0FuZEluY2x1ZGUsIGdldFBhcnNlQ2xhc3NNdXRhdGlvbkNvbmZpZyB9IGZyb20gJy4uL3BhcnNlR3JhcGhRTFV0aWxzJztcbmltcG9ydCAqIGFzIG9iamVjdHNNdXRhdGlvbnMgZnJvbSAnLi4vaGVscGVycy9vYmplY3RzTXV0YXRpb25zJztcbmltcG9ydCAqIGFzIG9iamVjdHNRdWVyaWVzIGZyb20gJy4uL2hlbHBlcnMvb2JqZWN0c1F1ZXJpZXMnO1xuaW1wb3J0IHsgUGFyc2VHcmFwaFFMQ2xhc3NDb25maWcgfSBmcm9tICcuLi8uLi9Db250cm9sbGVycy9QYXJzZUdyYXBoUUxDb250cm9sbGVyJztcbmltcG9ydCB7IHRyYW5zZm9ybUNsYXNzTmFtZVRvR3JhcGhRTCB9IGZyb20gJy4uL3RyYW5zZm9ybWVycy9jbGFzc05hbWUnO1xuaW1wb3J0IHsgdHJhbnNmb3JtVHlwZXMgfSBmcm9tICcuLi90cmFuc2Zvcm1lcnMvbXV0YXRpb24nO1xuXG5jb25zdCBmaWx0ZXJEZWxldGVkRmllbGRzID0gZmllbGRzID0+XG4gIE9iamVjdC5rZXlzKGZpZWxkcykucmVkdWNlKChhY2MsIGtleSkgPT4ge1xuICAgIGlmICh0eXBlb2YgZmllbGRzW2tleV0gPT09ICdvYmplY3QnICYmIGZpZWxkc1trZXldPy5fX29wID09PSAnRGVsZXRlJykge1xuICAgICAgYWNjW2tleV0gPSBudWxsO1xuICAgIH1cbiAgICByZXR1cm4gYWNjO1xuICB9LCBmaWVsZHMpO1xuXG5jb25zdCBnZXRPbmx5UmVxdWlyZWRGaWVsZHMgPSAoXG4gIHVwZGF0ZWRGaWVsZHMsXG4gIHNlbGVjdGVkRmllbGRzU3RyaW5nLFxuICBpbmNsdWRlZEZpZWxkc1N0cmluZyxcbiAgbmF0aXZlT2JqZWN0RmllbGRzXG4pID0+IHtcbiAgY29uc3QgaW5jbHVkZWRGaWVsZHMgPSBpbmNsdWRlZEZpZWxkc1N0cmluZyA/IGluY2x1ZGVkRmllbGRzU3RyaW5nLnNwbGl0KCcsJykgOiBbXTtcbiAgY29uc3Qgc2VsZWN0ZWRGaWVsZHMgPSBzZWxlY3RlZEZpZWxkc1N0cmluZyA/IHNlbGVjdGVkRmllbGRzU3RyaW5nLnNwbGl0KCcsJykgOiBbXTtcbiAgY29uc3QgbWlzc2luZ0ZpZWxkcyA9IHNlbGVjdGVkRmllbGRzXG4gICAgLmZpbHRlcihmaWVsZCA9PiAhbmF0aXZlT2JqZWN0RmllbGRzLmluY2x1ZGVzKGZpZWxkKSB8fCBpbmNsdWRlZEZpZWxkcy5pbmNsdWRlcyhmaWVsZCkpXG4gICAgLmpvaW4oJywnKTtcbiAgaWYgKCFtaXNzaW5nRmllbGRzLmxlbmd0aCkge1xuICAgIHJldHVybiB7IG5lZWRHZXQ6IGZhbHNlLCBrZXlzOiAnJyB9O1xuICB9IGVsc2Uge1xuICAgIHJldHVybiB7IG5lZWRHZXQ6IHRydWUsIGtleXM6IG1pc3NpbmdGaWVsZHMgfTtcbiAgfVxufTtcblxuY29uc3QgbG9hZCA9IGZ1bmN0aW9uIChwYXJzZUdyYXBoUUxTY2hlbWEsIHBhcnNlQ2xhc3MsIHBhcnNlQ2xhc3NDb25maWc6ID9QYXJzZUdyYXBoUUxDbGFzc0NvbmZpZykge1xuICBjb25zdCBjbGFzc05hbWUgPSBwYXJzZUNsYXNzLmNsYXNzTmFtZTtcbiAgY29uc3QgZ3JhcGhRTENsYXNzTmFtZSA9IHRyYW5zZm9ybUNsYXNzTmFtZVRvR3JhcGhRTChjbGFzc05hbWUpO1xuICBjb25zdCBnZXRHcmFwaFFMUXVlcnlOYW1lID0gZ3JhcGhRTENsYXNzTmFtZS5jaGFyQXQoMCkudG9Mb3dlckNhc2UoKSArIGdyYXBoUUxDbGFzc05hbWUuc2xpY2UoMSk7XG5cbiAgY29uc3Qge1xuICAgIGNyZWF0ZTogaXNDcmVhdGVFbmFibGVkID0gdHJ1ZSxcbiAgICB1cGRhdGU6IGlzVXBkYXRlRW5hYmxlZCA9IHRydWUsXG4gICAgZGVzdHJveTogaXNEZXN0cm95RW5hYmxlZCA9IHRydWUsXG4gICAgY3JlYXRlQWxpYXM6IGNyZWF0ZUFsaWFzID0gJycsXG4gICAgdXBkYXRlQWxpYXM6IHVwZGF0ZUFsaWFzID0gJycsXG4gICAgZGVzdHJveUFsaWFzOiBkZXN0cm95QWxpYXMgPSAnJyxcbiAgfSA9IGdldFBhcnNlQ2xhc3NNdXRhdGlvbkNvbmZpZyhwYXJzZUNsYXNzQ29uZmlnKTtcblxuICBjb25zdCB7XG4gICAgY2xhc3NHcmFwaFFMQ3JlYXRlVHlwZSxcbiAgICBjbGFzc0dyYXBoUUxVcGRhdGVUeXBlLFxuICAgIGNsYXNzR3JhcGhRTE91dHB1dFR5cGUsXG4gIH0gPSBwYXJzZUdyYXBoUUxTY2hlbWEucGFyc2VDbGFzc1R5cGVzW2NsYXNzTmFtZV07XG5cbiAgaWYgKGlzQ3JlYXRlRW5hYmxlZCkge1xuICAgIGNvbnN0IGNyZWF0ZUdyYXBoUUxNdXRhdGlvbk5hbWUgPSBjcmVhdGVBbGlhcyB8fCBgY3JlYXRlJHtncmFwaFFMQ2xhc3NOYW1lfWA7XG4gICAgY29uc3QgY3JlYXRlR3JhcGhRTE11dGF0aW9uID0gbXV0YXRpb25XaXRoQ2xpZW50TXV0YXRpb25JZCh7XG4gICAgICBuYW1lOiBgQ3JlYXRlJHtncmFwaFFMQ2xhc3NOYW1lfWAsXG4gICAgICBkZXNjcmlwdGlvbjogYFRoZSAke2NyZWF0ZUdyYXBoUUxNdXRhdGlvbk5hbWV9IG11dGF0aW9uIGNhbiBiZSB1c2VkIHRvIGNyZWF0ZSBhIG5ldyBvYmplY3Qgb2YgdGhlICR7Z3JhcGhRTENsYXNzTmFtZX0gY2xhc3MuYCxcbiAgICAgIGlucHV0RmllbGRzOiB7XG4gICAgICAgIGZpZWxkczoge1xuICAgICAgICAgIGRlc2NyaXB0aW9uOiAnVGhlc2UgYXJlIHRoZSBmaWVsZHMgdGhhdCB3aWxsIGJlIHVzZWQgdG8gY3JlYXRlIHRoZSBuZXcgb2JqZWN0LicsXG4gICAgICAgICAgdHlwZTogY2xhc3NHcmFwaFFMQ3JlYXRlVHlwZSB8fCBkZWZhdWx0R3JhcGhRTFR5cGVzLk9CSkVDVCxcbiAgICAgICAgfSxcbiAgICAgIH0sXG4gICAgICBvdXRwdXRGaWVsZHM6IHtcbiAgICAgICAgW2dldEdyYXBoUUxRdWVyeU5hbWVdOiB7XG4gICAgICAgICAgZGVzY3JpcHRpb246ICdUaGlzIGlzIHRoZSBjcmVhdGVkIG9iamVjdC4nLFxuICAgICAgICAgIHR5cGU6IG5ldyBHcmFwaFFMTm9uTnVsbChjbGFzc0dyYXBoUUxPdXRwdXRUeXBlIHx8IGRlZmF1bHRHcmFwaFFMVHlwZXMuT0JKRUNUKSxcbiAgICAgICAgfSxcbiAgICAgIH0sXG4gICAgICBtdXRhdGVBbmRHZXRQYXlsb2FkOiBhc3luYyAoYXJncywgY29udGV4dCwgbXV0YXRpb25JbmZvKSA9PiB7XG4gICAgICAgIHRyeSB7XG4gICAgICAgICAgbGV0IHsgZmllbGRzIH0gPSBkZWVwY29weShhcmdzKTtcbiAgICAgICAgICBpZiAoIWZpZWxkcykgZmllbGRzID0ge307XG4gICAgICAgICAgY29uc3QgeyBjb25maWcsIGF1dGgsIGluZm8gfSA9IGNvbnRleHQ7XG5cbiAgICAgICAgICBjb25zdCBwYXJzZUZpZWxkcyA9IGF3YWl0IHRyYW5zZm9ybVR5cGVzKCdjcmVhdGUnLCBmaWVsZHMsIHtcbiAgICAgICAgICAgIGNsYXNzTmFtZSxcbiAgICAgICAgICAgIHBhcnNlR3JhcGhRTFNjaGVtYSxcbiAgICAgICAgICAgIHJlcTogeyBjb25maWcsIGF1dGgsIGluZm8gfSxcbiAgICAgICAgICB9KTtcblxuICAgICAgICAgIGNvbnN0IGNyZWF0ZWRPYmplY3QgPSBhd2FpdCBvYmplY3RzTXV0YXRpb25zLmNyZWF0ZU9iamVjdChcbiAgICAgICAgICAgIGNsYXNzTmFtZSxcbiAgICAgICAgICAgIHBhcnNlRmllbGRzLFxuICAgICAgICAgICAgY29uZmlnLFxuICAgICAgICAgICAgYXV0aCxcbiAgICAgICAgICAgIGluZm9cbiAgICAgICAgICApO1xuICAgICAgICAgIGNvbnN0IHNlbGVjdGVkRmllbGRzID0gZ2V0RmllbGROYW1lcyhtdXRhdGlvbkluZm8pXG4gICAgICAgICAgICAuZmlsdGVyKGZpZWxkID0+IGZpZWxkLnN0YXJ0c1dpdGgoYCR7Z2V0R3JhcGhRTFF1ZXJ5TmFtZX0uYCkpXG4gICAgICAgICAgICAubWFwKGZpZWxkID0+IGZpZWxkLnJlcGxhY2UoYCR7Z2V0R3JhcGhRTFF1ZXJ5TmFtZX0uYCwgJycpKTtcbiAgICAgICAgICBjb25zdCB7IGtleXMsIGluY2x1ZGUgfSA9IGV4dHJhY3RLZXlzQW5kSW5jbHVkZShzZWxlY3RlZEZpZWxkcyk7XG4gICAgICAgICAgY29uc3QgeyBrZXlzOiByZXF1aXJlZEtleXMsIG5lZWRHZXQgfSA9IGdldE9ubHlSZXF1aXJlZEZpZWxkcyhmaWVsZHMsIGtleXMsIGluY2x1ZGUsIFtcbiAgICAgICAgICAgICdpZCcsXG4gICAgICAgICAgICAnb2JqZWN0SWQnLFxuICAgICAgICAgICAgJ2NyZWF0ZWRBdCcsXG4gICAgICAgICAgICAndXBkYXRlZEF0JyxcbiAgICAgICAgICBdKTtcbiAgICAgICAgICBjb25zdCBuZWVkVG9HZXRBbGxLZXlzID0gb2JqZWN0c1F1ZXJpZXMubmVlZFRvR2V0QWxsS2V5cyhcbiAgICAgICAgICAgIHBhcnNlQ2xhc3MuZmllbGRzLFxuICAgICAgICAgICAga2V5cyxcbiAgICAgICAgICAgIHBhcnNlR3JhcGhRTFNjaGVtYS5wYXJzZUNsYXNzZXNcbiAgICAgICAgICApO1xuICAgICAgICAgIGxldCBvcHRpbWl6ZWRPYmplY3QgPSB7fTtcbiAgICAgICAgICBpZiAobmVlZEdldCAmJiAhbmVlZFRvR2V0QWxsS2V5cykge1xuICAgICAgICAgICAgb3B0aW1pemVkT2JqZWN0ID0gYXdhaXQgb2JqZWN0c1F1ZXJpZXMuZ2V0T2JqZWN0KFxuICAgICAgICAgICAgICBjbGFzc05hbWUsXG4gICAgICAgICAgICAgIGNyZWF0ZWRPYmplY3Qub2JqZWN0SWQsXG4gICAgICAgICAgICAgIHJlcXVpcmVkS2V5cyxcbiAgICAgICAgICAgICAgaW5jbHVkZSxcbiAgICAgICAgICAgICAgdW5kZWZpbmVkLFxuICAgICAgICAgICAgICB1bmRlZmluZWQsXG4gICAgICAgICAgICAgIGNvbmZpZyxcbiAgICAgICAgICAgICAgYXV0aCxcbiAgICAgICAgICAgICAgaW5mbyxcbiAgICAgICAgICAgICAgcGFyc2VHcmFwaFFMU2NoZW1hLnBhcnNlQ2xhc3Nlc1xuICAgICAgICAgICAgKTtcbiAgICAgICAgICB9IGVsc2UgaWYgKG5lZWRUb0dldEFsbEtleXMpIHtcbiAgICAgICAgICAgIG9wdGltaXplZE9iamVjdCA9IGF3YWl0IG9iamVjdHNRdWVyaWVzLmdldE9iamVjdChcbiAgICAgICAgICAgICAgY2xhc3NOYW1lLFxuICAgICAgICAgICAgICBjcmVhdGVkT2JqZWN0Lm9iamVjdElkLFxuICAgICAgICAgICAgICB1bmRlZmluZWQsXG4gICAgICAgICAgICAgIGluY2x1ZGUsXG4gICAgICAgICAgICAgIHVuZGVmaW5lZCxcbiAgICAgICAgICAgICAgdW5kZWZpbmVkLFxuICAgICAgICAgICAgICBjb25maWcsXG4gICAgICAgICAgICAgIGF1dGgsXG4gICAgICAgICAgICAgIGluZm8sXG4gICAgICAgICAgICAgIHBhcnNlR3JhcGhRTFNjaGVtYS5wYXJzZUNsYXNzZXNcbiAgICAgICAgICAgICk7XG4gICAgICAgICAgfVxuICAgICAgICAgIHJldHVybiB7XG4gICAgICAgICAgICBbZ2V0R3JhcGhRTFF1ZXJ5TmFtZV06IHtcbiAgICAgICAgICAgICAgLi4uY3JlYXRlZE9iamVjdCxcbiAgICAgICAgICAgICAgdXBkYXRlZEF0OiBjcmVhdGVkT2JqZWN0LmNyZWF0ZWRBdCxcbiAgICAgICAgICAgICAgLi4uZmlsdGVyRGVsZXRlZEZpZWxkcyhwYXJzZUZpZWxkcyksXG4gICAgICAgICAgICAgIC4uLm9wdGltaXplZE9iamVjdCxcbiAgICAgICAgICAgIH0sXG4gICAgICAgICAgfTtcbiAgICAgICAgfSBjYXRjaCAoZSkge1xuICAgICAgICAgIHBhcnNlR3JhcGhRTFNjaGVtYS5oYW5kbGVFcnJvcihlKTtcbiAgICAgICAgfVxuICAgICAgfSxcbiAgICB9KTtcblxuICAgIGlmIChcbiAgICAgIHBhcnNlR3JhcGhRTFNjaGVtYS5hZGRHcmFwaFFMVHlwZShjcmVhdGVHcmFwaFFMTXV0YXRpb24uYXJncy5pbnB1dC50eXBlLm9mVHlwZSkgJiZcbiAgICAgIHBhcnNlR3JhcGhRTFNjaGVtYS5hZGRHcmFwaFFMVHlwZShjcmVhdGVHcmFwaFFMTXV0YXRpb24udHlwZSlcbiAgICApIHtcbiAgICAgIHBhcnNlR3JhcGhRTFNjaGVtYS5hZGRHcmFwaFFMTXV0YXRpb24oY3JlYXRlR3JhcGhRTE11dGF0aW9uTmFtZSwgY3JlYXRlR3JhcGhRTE11dGF0aW9uKTtcbiAgICB9XG4gIH1cblxuICBpZiAoaXNVcGRhdGVFbmFibGVkKSB7XG4gICAgY29uc3QgdXBkYXRlR3JhcGhRTE11dGF0aW9uTmFtZSA9IHVwZGF0ZUFsaWFzIHx8IGB1cGRhdGUke2dyYXBoUUxDbGFzc05hbWV9YDtcbiAgICBjb25zdCB1cGRhdGVHcmFwaFFMTXV0YXRpb24gPSBtdXRhdGlvbldpdGhDbGllbnRNdXRhdGlvbklkKHtcbiAgICAgIG5hbWU6IGBVcGRhdGUke2dyYXBoUUxDbGFzc05hbWV9YCxcbiAgICAgIGRlc2NyaXB0aW9uOiBgVGhlICR7dXBkYXRlR3JhcGhRTE11dGF0aW9uTmFtZX0gbXV0YXRpb24gY2FuIGJlIHVzZWQgdG8gdXBkYXRlIGFuIG9iamVjdCBvZiB0aGUgJHtncmFwaFFMQ2xhc3NOYW1lfSBjbGFzcy5gLFxuICAgICAgaW5wdXRGaWVsZHM6IHtcbiAgICAgICAgaWQ6IGRlZmF1bHRHcmFwaFFMVHlwZXMuR0xPQkFMX09SX09CSkVDVF9JRF9BVFQsXG4gICAgICAgIGZpZWxkczoge1xuICAgICAgICAgIGRlc2NyaXB0aW9uOiAnVGhlc2UgYXJlIHRoZSBmaWVsZHMgdGhhdCB3aWxsIGJlIHVzZWQgdG8gdXBkYXRlIHRoZSBvYmplY3QuJyxcbiAgICAgICAgICB0eXBlOiBjbGFzc0dyYXBoUUxVcGRhdGVUeXBlIHx8IGRlZmF1bHRHcmFwaFFMVHlwZXMuT0JKRUNULFxuICAgICAgICB9LFxuICAgICAgfSxcbiAgICAgIG91dHB1dEZpZWxkczoge1xuICAgICAgICBbZ2V0R3JhcGhRTFF1ZXJ5TmFtZV06IHtcbiAgICAgICAgICBkZXNjcmlwdGlvbjogJ1RoaXMgaXMgdGhlIHVwZGF0ZWQgb2JqZWN0LicsXG4gICAgICAgICAgdHlwZTogbmV3IEdyYXBoUUxOb25OdWxsKGNsYXNzR3JhcGhRTE91dHB1dFR5cGUgfHwgZGVmYXVsdEdyYXBoUUxUeXBlcy5PQkpFQ1QpLFxuICAgICAgICB9LFxuICAgICAgfSxcbiAgICAgIG11dGF0ZUFuZEdldFBheWxvYWQ6IGFzeW5jIChhcmdzLCBjb250ZXh0LCBtdXRhdGlvbkluZm8pID0+IHtcbiAgICAgICAgdHJ5IHtcbiAgICAgICAgICBsZXQgeyBpZCwgZmllbGRzIH0gPSBkZWVwY29weShhcmdzKTtcbiAgICAgICAgICBpZiAoIWZpZWxkcykgZmllbGRzID0ge307XG4gICAgICAgICAgY29uc3QgeyBjb25maWcsIGF1dGgsIGluZm8gfSA9IGNvbnRleHQ7XG5cbiAgICAgICAgICBjb25zdCBnbG9iYWxJZE9iamVjdCA9IGZyb21HbG9iYWxJZChpZCk7XG5cbiAgICAgICAgICBpZiAoZ2xvYmFsSWRPYmplY3QudHlwZSA9PT0gY2xhc3NOYW1lKSB7XG4gICAgICAgICAgICBpZCA9IGdsb2JhbElkT2JqZWN0LmlkO1xuICAgICAgICAgIH1cblxuICAgICAgICAgIGNvbnN0IHBhcnNlRmllbGRzID0gYXdhaXQgdHJhbnNmb3JtVHlwZXMoJ3VwZGF0ZScsIGZpZWxkcywge1xuICAgICAgICAgICAgY2xhc3NOYW1lLFxuICAgICAgICAgICAgcGFyc2VHcmFwaFFMU2NoZW1hLFxuICAgICAgICAgICAgcmVxOiB7IGNvbmZpZywgYXV0aCwgaW5mbyB9LFxuICAgICAgICAgIH0pO1xuXG4gICAgICAgICAgY29uc3QgdXBkYXRlZE9iamVjdCA9IGF3YWl0IG9iamVjdHNNdXRhdGlvbnMudXBkYXRlT2JqZWN0KFxuICAgICAgICAgICAgY2xhc3NOYW1lLFxuICAgICAgICAgICAgaWQsXG4gICAgICAgICAgICBwYXJzZUZpZWxkcyxcbiAgICAgICAgICAgIGNvbmZpZyxcbiAgICAgICAgICAgIGF1dGgsXG4gICAgICAgICAgICBpbmZvXG4gICAgICAgICAgKTtcblxuICAgICAgICAgIGNvbnN0IHNlbGVjdGVkRmllbGRzID0gZ2V0RmllbGROYW1lcyhtdXRhdGlvbkluZm8pXG4gICAgICAgICAgICAuZmlsdGVyKGZpZWxkID0+IGZpZWxkLnN0YXJ0c1dpdGgoYCR7Z2V0R3JhcGhRTFF1ZXJ5TmFtZX0uYCkpXG4gICAgICAgICAgICAubWFwKGZpZWxkID0+IGZpZWxkLnJlcGxhY2UoYCR7Z2V0R3JhcGhRTFF1ZXJ5TmFtZX0uYCwgJycpKTtcbiAgICAgICAgICBjb25zdCB7IGtleXMsIGluY2x1ZGUgfSA9IGV4dHJhY3RLZXlzQW5kSW5jbHVkZShzZWxlY3RlZEZpZWxkcyk7XG4gICAgICAgICAgY29uc3QgeyBrZXlzOiByZXF1aXJlZEtleXMsIG5lZWRHZXQgfSA9IGdldE9ubHlSZXF1aXJlZEZpZWxkcyhmaWVsZHMsIGtleXMsIGluY2x1ZGUsIFtcbiAgICAgICAgICAgICdpZCcsXG4gICAgICAgICAgICAnb2JqZWN0SWQnLFxuICAgICAgICAgICAgJ3VwZGF0ZWRBdCcsXG4gICAgICAgICAgXSk7XG4gICAgICAgICAgY29uc3QgbmVlZFRvR2V0QWxsS2V5cyA9IG9iamVjdHNRdWVyaWVzLm5lZWRUb0dldEFsbEtleXMoXG4gICAgICAgICAgICBwYXJzZUNsYXNzLmZpZWxkcyxcbiAgICAgICAgICAgIGtleXMsXG4gICAgICAgICAgICBwYXJzZUdyYXBoUUxTY2hlbWEucGFyc2VDbGFzc2VzXG4gICAgICAgICAgKTtcbiAgICAgICAgICBsZXQgb3B0aW1pemVkT2JqZWN0ID0ge307XG4gICAgICAgICAgaWYgKG5lZWRHZXQgJiYgIW5lZWRUb0dldEFsbEtleXMpIHtcbiAgICAgICAgICAgIG9wdGltaXplZE9iamVjdCA9IGF3YWl0IG9iamVjdHNRdWVyaWVzLmdldE9iamVjdChcbiAgICAgICAgICAgICAgY2xhc3NOYW1lLFxuICAgICAgICAgICAgICBpZCxcbiAgICAgICAgICAgICAgcmVxdWlyZWRLZXlzLFxuICAgICAgICAgICAgICBpbmNsdWRlLFxuICAgICAgICAgICAgICB1bmRlZmluZWQsXG4gICAgICAgICAgICAgIHVuZGVmaW5lZCxcbiAgICAgICAgICAgICAgY29uZmlnLFxuICAgICAgICAgICAgICBhdXRoLFxuICAgICAgICAgICAgICBpbmZvLFxuICAgICAgICAgICAgICBwYXJzZUdyYXBoUUxTY2hlbWEucGFyc2VDbGFzc2VzXG4gICAgICAgICAgICApO1xuICAgICAgICAgIH0gZWxzZSBpZiAobmVlZFRvR2V0QWxsS2V5cykge1xuICAgICAgICAgICAgb3B0aW1pemVkT2JqZWN0ID0gYXdhaXQgb2JqZWN0c1F1ZXJpZXMuZ2V0T2JqZWN0KFxuICAgICAgICAgICAgICBjbGFzc05hbWUsXG4gICAgICAgICAgICAgIGlkLFxuICAgICAgICAgICAgICB1bmRlZmluZWQsXG4gICAgICAgICAgICAgIGluY2x1ZGUsXG4gICAgICAgICAgICAgIHVuZGVmaW5lZCxcbiAgICAgICAgICAgICAgdW5kZWZpbmVkLFxuICAgICAgICAgICAgICBjb25maWcsXG4gICAgICAgICAgICAgIGF1dGgsXG4gICAgICAgICAgICAgIGluZm8sXG4gICAgICAgICAgICAgIHBhcnNlR3JhcGhRTFNjaGVtYS5wYXJzZUNsYXNzZXNcbiAgICAgICAgICAgICk7XG4gICAgICAgICAgfVxuICAgICAgICAgIHJldHVybiB7XG4gICAgICAgICAgICBbZ2V0R3JhcGhRTFF1ZXJ5TmFtZV06IHtcbiAgICAgICAgICAgICAgb2JqZWN0SWQ6IGlkLFxuICAgICAgICAgICAgICAuLi51cGRhdGVkT2JqZWN0LFxuICAgICAgICAgICAgICAuLi5maWx0ZXJEZWxldGVkRmllbGRzKHBhcnNlRmllbGRzKSxcbiAgICAgICAgICAgICAgLi4ub3B0aW1pemVkT2JqZWN0LFxuICAgICAgICAgICAgfSxcbiAgICAgICAgICB9O1xuICAgICAgICB9IGNhdGNoIChlKSB7XG4gICAgICAgICAgcGFyc2VHcmFwaFFMU2NoZW1hLmhhbmRsZUVycm9yKGUpO1xuICAgICAgICB9XG4gICAgICB9LFxuICAgIH0pO1xuXG4gICAgaWYgKFxuICAgICAgcGFyc2VHcmFwaFFMU2NoZW1hLmFkZEdyYXBoUUxUeXBlKHVwZGF0ZUdyYXBoUUxNdXRhdGlvbi5hcmdzLmlucHV0LnR5cGUub2ZUeXBlKSAmJlxuICAgICAgcGFyc2VHcmFwaFFMU2NoZW1hLmFkZEdyYXBoUUxUeXBlKHVwZGF0ZUdyYXBoUUxNdXRhdGlvbi50eXBlKVxuICAgICkge1xuICAgICAgcGFyc2VHcmFwaFFMU2NoZW1hLmFkZEdyYXBoUUxNdXRhdGlvbih1cGRhdGVHcmFwaFFMTXV0YXRpb25OYW1lLCB1cGRhdGVHcmFwaFFMTXV0YXRpb24pO1xuICAgIH1cbiAgfVxuXG4gIGlmIChpc0Rlc3Ryb3lFbmFibGVkKSB7XG4gICAgY29uc3QgZGVsZXRlR3JhcGhRTE11dGF0aW9uTmFtZSA9IGRlc3Ryb3lBbGlhcyB8fCBgZGVsZXRlJHtncmFwaFFMQ2xhc3NOYW1lfWA7XG4gICAgY29uc3QgZGVsZXRlR3JhcGhRTE11dGF0aW9uID0gbXV0YXRpb25XaXRoQ2xpZW50TXV0YXRpb25JZCh7XG4gICAgICBuYW1lOiBgRGVsZXRlJHtncmFwaFFMQ2xhc3NOYW1lfWAsXG4gICAgICBkZXNjcmlwdGlvbjogYFRoZSAke2RlbGV0ZUdyYXBoUUxNdXRhdGlvbk5hbWV9IG11dGF0aW9uIGNhbiBiZSB1c2VkIHRvIGRlbGV0ZSBhbiBvYmplY3Qgb2YgdGhlICR7Z3JhcGhRTENsYXNzTmFtZX0gY2xhc3MuYCxcbiAgICAgIGlucHV0RmllbGRzOiB7XG4gICAgICAgIGlkOiBkZWZhdWx0R3JhcGhRTFR5cGVzLkdMT0JBTF9PUl9PQkpFQ1RfSURfQVRULFxuICAgICAgfSxcbiAgICAgIG91dHB1dEZpZWxkczoge1xuICAgICAgICBbZ2V0R3JhcGhRTFF1ZXJ5TmFtZV06IHtcbiAgICAgICAgICBkZXNjcmlwdGlvbjogJ1RoaXMgaXMgdGhlIGRlbGV0ZWQgb2JqZWN0LicsXG4gICAgICAgICAgdHlwZTogbmV3IEdyYXBoUUxOb25OdWxsKGNsYXNzR3JhcGhRTE91dHB1dFR5cGUgfHwgZGVmYXVsdEdyYXBoUUxUeXBlcy5PQkpFQ1QpLFxuICAgICAgICB9LFxuICAgICAgfSxcbiAgICAgIG11dGF0ZUFuZEdldFBheWxvYWQ6IGFzeW5jIChhcmdzLCBjb250ZXh0LCBtdXRhdGlvbkluZm8pID0+IHtcbiAgICAgICAgdHJ5IHtcbiAgICAgICAgICBsZXQgeyBpZCB9ID0gZGVlcGNvcHkoYXJncyk7XG4gICAgICAgICAgY29uc3QgeyBjb25maWcsIGF1dGgsIGluZm8gfSA9IGNvbnRleHQ7XG5cbiAgICAgICAgICBjb25zdCBnbG9iYWxJZE9iamVjdCA9IGZyb21HbG9iYWxJZChpZCk7XG5cbiAgICAgICAgICBpZiAoZ2xvYmFsSWRPYmplY3QudHlwZSA9PT0gY2xhc3NOYW1lKSB7XG4gICAgICAgICAgICBpZCA9IGdsb2JhbElkT2JqZWN0LmlkO1xuICAgICAgICAgIH1cblxuICAgICAgICAgIGNvbnN0IHNlbGVjdGVkRmllbGRzID0gZ2V0RmllbGROYW1lcyhtdXRhdGlvbkluZm8pXG4gICAgICAgICAgICAuZmlsdGVyKGZpZWxkID0+IGZpZWxkLnN0YXJ0c1dpdGgoYCR7Z2V0R3JhcGhRTFF1ZXJ5TmFtZX0uYCkpXG4gICAgICAgICAgICAubWFwKGZpZWxkID0+IGZpZWxkLnJlcGxhY2UoYCR7Z2V0R3JhcGhRTFF1ZXJ5TmFtZX0uYCwgJycpKTtcbiAgICAgICAgICBjb25zdCB7IGtleXMsIGluY2x1ZGUgfSA9IGV4dHJhY3RLZXlzQW5kSW5jbHVkZShzZWxlY3RlZEZpZWxkcyk7XG4gICAgICAgICAgbGV0IG9wdGltaXplZE9iamVjdCA9IHt9O1xuICAgICAgICAgIGlmIChrZXlzICYmIGtleXMuc3BsaXQoJywnKS5maWx0ZXIoa2V5ID0+ICFbJ2lkJywgJ29iamVjdElkJ10uaW5jbHVkZXMoa2V5KSkubGVuZ3RoID4gMCkge1xuICAgICAgICAgICAgb3B0aW1pemVkT2JqZWN0ID0gYXdhaXQgb2JqZWN0c1F1ZXJpZXMuZ2V0T2JqZWN0KFxuICAgICAgICAgICAgICBjbGFzc05hbWUsXG4gICAgICAgICAgICAgIGlkLFxuICAgICAgICAgICAgICBrZXlzLFxuICAgICAgICAgICAgICBpbmNsdWRlLFxuICAgICAgICAgICAgICB1bmRlZmluZWQsXG4gICAgICAgICAgICAgIHVuZGVmaW5lZCxcbiAgICAgICAgICAgICAgY29uZmlnLFxuICAgICAgICAgICAgICBhdXRoLFxuICAgICAgICAgICAgICBpbmZvLFxuICAgICAgICAgICAgICBwYXJzZUdyYXBoUUxTY2hlbWEucGFyc2VDbGFzc2VzXG4gICAgICAgICAgICApO1xuICAgICAgICAgIH1cbiAgICAgICAgICBhd2FpdCBvYmplY3RzTXV0YXRpb25zLmRlbGV0ZU9iamVjdChjbGFzc05hbWUsIGlkLCBjb25maWcsIGF1dGgsIGluZm8pO1xuICAgICAgICAgIHJldHVybiB7XG4gICAgICAgICAgICBbZ2V0R3JhcGhRTFF1ZXJ5TmFtZV06IHtcbiAgICAgICAgICAgICAgb2JqZWN0SWQ6IGlkLFxuICAgICAgICAgICAgICAuLi5vcHRpbWl6ZWRPYmplY3QsXG4gICAgICAgICAgICB9LFxuICAgICAgICAgIH07XG4gICAgICAgIH0gY2F0Y2ggKGUpIHtcbiAgICAgICAgICBwYXJzZUdyYXBoUUxTY2hlbWEuaGFuZGxlRXJyb3IoZSk7XG4gICAgICAgIH1cbiAgICAgIH0sXG4gICAgfSk7XG5cbiAgICBpZiAoXG4gICAgICBwYXJzZUdyYXBoUUxTY2hlbWEuYWRkR3JhcGhRTFR5cGUoZGVsZXRlR3JhcGhRTE11dGF0aW9uLmFyZ3MuaW5wdXQudHlwZS5vZlR5cGUpICYmXG4gICAgICBwYXJzZUdyYXBoUUxTY2hlbWEuYWRkR3JhcGhRTFR5cGUoZGVsZXRlR3JhcGhRTE11dGF0aW9uLnR5cGUpXG4gICAgKSB7XG4gICAgICBwYXJzZUdyYXBoUUxTY2hlbWEuYWRkR3JhcGhRTE11dGF0aW9uKGRlbGV0ZUdyYXBoUUxNdXRhdGlvbk5hbWUsIGRlbGV0ZUdyYXBoUUxNdXRhdGlvbik7XG4gICAgfVxuICB9XG59O1xuXG5leHBvcnQgeyBsb2FkIH07XG4iXX0=