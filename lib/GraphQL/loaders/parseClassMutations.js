"use strict";

Object.defineProperty(exports, "__esModule", {
  value: true
});
exports.load = void 0;

var _graphql = require("graphql");

var _graphqlRelay = require("graphql-relay");

var _graphqlListFields = _interopRequireDefault(require("graphql-list-fields"));

var defaultGraphQLTypes = _interopRequireWildcard(require("./defaultGraphQLTypes"));

var _parseGraphQLUtils = require("../parseGraphQLUtils");

var objectsMutations = _interopRequireWildcard(require("../helpers/objectsMutations"));

var objectsQueries = _interopRequireWildcard(require("../helpers/objectsQueries"));

var _ParseGraphQLController = require("../../Controllers/ParseGraphQLController");

var _className = require("../transformers/className");

var _mutation = require("../transformers/mutation");

function _getRequireWildcardCache() { if (typeof WeakMap !== "function") return null; var cache = new WeakMap(); _getRequireWildcardCache = function () { return cache; }; return cache; }

function _interopRequireWildcard(obj) { if (obj && obj.__esModule) { return obj; } if (obj === null || typeof obj !== "object" && typeof obj !== "function") { return { default: obj }; } var cache = _getRequireWildcardCache(); if (cache && cache.has(obj)) { return cache.get(obj); } var newObj = {}; var hasPropertyDescriptor = Object.defineProperty && Object.getOwnPropertyDescriptor; for (var key in obj) { if (Object.prototype.hasOwnProperty.call(obj, key)) { var desc = hasPropertyDescriptor ? Object.getOwnPropertyDescriptor(obj, key) : null; if (desc && (desc.get || desc.set)) { Object.defineProperty(newObj, key, desc); } else { newObj[key] = obj[key]; } } } newObj.default = obj; if (cache) { cache.set(obj, newObj); } return newObj; }

function _interopRequireDefault(obj) { return obj && obj.__esModule ? obj : { default: obj }; }

function ownKeys(object, enumerableOnly) { var keys = Object.keys(object); if (Object.getOwnPropertySymbols) { var symbols = Object.getOwnPropertySymbols(object); if (enumerableOnly) symbols = symbols.filter(function (sym) { return Object.getOwnPropertyDescriptor(object, sym).enumerable; }); keys.push.apply(keys, symbols); } return keys; }

function _objectSpread(target) { for (var i = 1; i < arguments.length; i++) { var source = arguments[i] != null ? arguments[i] : {}; if (i % 2) { ownKeys(Object(source), true).forEach(function (key) { _defineProperty(target, key, source[key]); }); } else if (Object.getOwnPropertyDescriptors) { Object.defineProperties(target, Object.getOwnPropertyDescriptors(source)); } else { ownKeys(Object(source)).forEach(function (key) { Object.defineProperty(target, key, Object.getOwnPropertyDescriptor(source, key)); }); } } return target; }

function _defineProperty(obj, key, value) { if (key in obj) { Object.defineProperty(obj, key, { value: value, enumerable: true, configurable: true, writable: true }); } else { obj[key] = value; } return obj; }

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
          } = args;
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
            }, parseFields), optimizedObject)
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
          } = args;
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
            }, updatedObject), parseFields), optimizedObject)
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
          } = args;
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
//# sourceMappingURL=data:application/json;charset=utf-8;base64,eyJ2ZXJzaW9uIjozLCJzb3VyY2VzIjpbIi4uLy4uLy4uL3NyYy9HcmFwaFFML2xvYWRlcnMvcGFyc2VDbGFzc011dGF0aW9ucy5qcyJdLCJuYW1lcyI6WyJnZXRPbmx5UmVxdWlyZWRGaWVsZHMiLCJ1cGRhdGVkRmllbGRzIiwic2VsZWN0ZWRGaWVsZHNTdHJpbmciLCJpbmNsdWRlZEZpZWxkc1N0cmluZyIsIm5hdGl2ZU9iamVjdEZpZWxkcyIsImluY2x1ZGVkRmllbGRzIiwic3BsaXQiLCJzZWxlY3RlZEZpZWxkcyIsIm1pc3NpbmdGaWVsZHMiLCJmaWx0ZXIiLCJmaWVsZCIsImluY2x1ZGVzIiwiam9pbiIsImxlbmd0aCIsIm5lZWRHZXQiLCJrZXlzIiwibG9hZCIsInBhcnNlR3JhcGhRTFNjaGVtYSIsInBhcnNlQ2xhc3MiLCJwYXJzZUNsYXNzQ29uZmlnIiwiY2xhc3NOYW1lIiwiZ3JhcGhRTENsYXNzTmFtZSIsImdldEdyYXBoUUxRdWVyeU5hbWUiLCJjaGFyQXQiLCJ0b0xvd2VyQ2FzZSIsInNsaWNlIiwiY3JlYXRlIiwiaXNDcmVhdGVFbmFibGVkIiwidXBkYXRlIiwiaXNVcGRhdGVFbmFibGVkIiwiZGVzdHJveSIsImlzRGVzdHJveUVuYWJsZWQiLCJjcmVhdGVBbGlhcyIsInVwZGF0ZUFsaWFzIiwiZGVzdHJveUFsaWFzIiwiY2xhc3NHcmFwaFFMQ3JlYXRlVHlwZSIsImNsYXNzR3JhcGhRTFVwZGF0ZVR5cGUiLCJjbGFzc0dyYXBoUUxPdXRwdXRUeXBlIiwicGFyc2VDbGFzc1R5cGVzIiwiY3JlYXRlR3JhcGhRTE11dGF0aW9uTmFtZSIsImNyZWF0ZUdyYXBoUUxNdXRhdGlvbiIsIm5hbWUiLCJkZXNjcmlwdGlvbiIsImlucHV0RmllbGRzIiwiZmllbGRzIiwidHlwZSIsImRlZmF1bHRHcmFwaFFMVHlwZXMiLCJPQkpFQ1QiLCJvdXRwdXRGaWVsZHMiLCJHcmFwaFFMTm9uTnVsbCIsIm11dGF0ZUFuZEdldFBheWxvYWQiLCJhcmdzIiwiY29udGV4dCIsIm11dGF0aW9uSW5mbyIsImNvbmZpZyIsImF1dGgiLCJpbmZvIiwicGFyc2VGaWVsZHMiLCJyZXEiLCJjcmVhdGVkT2JqZWN0Iiwib2JqZWN0c011dGF0aW9ucyIsImNyZWF0ZU9iamVjdCIsInN0YXJ0c1dpdGgiLCJtYXAiLCJyZXBsYWNlIiwiaW5jbHVkZSIsInJlcXVpcmVkS2V5cyIsIm5lZWRUb0dldEFsbEtleXMiLCJvYmplY3RzUXVlcmllcyIsInBhcnNlQ2xhc3NlcyIsIm9wdGltaXplZE9iamVjdCIsImdldE9iamVjdCIsIm9iamVjdElkIiwidW5kZWZpbmVkIiwidXBkYXRlZEF0IiwiY3JlYXRlZEF0IiwiZSIsImhhbmRsZUVycm9yIiwiYWRkR3JhcGhRTFR5cGUiLCJpbnB1dCIsIm9mVHlwZSIsImFkZEdyYXBoUUxNdXRhdGlvbiIsInVwZGF0ZUdyYXBoUUxNdXRhdGlvbk5hbWUiLCJ1cGRhdGVHcmFwaFFMTXV0YXRpb24iLCJpZCIsIkdMT0JBTF9PUl9PQkpFQ1RfSURfQVRUIiwiZ2xvYmFsSWRPYmplY3QiLCJ1cGRhdGVkT2JqZWN0IiwidXBkYXRlT2JqZWN0IiwiZGVsZXRlR3JhcGhRTE11dGF0aW9uTmFtZSIsImRlbGV0ZUdyYXBoUUxNdXRhdGlvbiIsImtleSIsImRlbGV0ZU9iamVjdCJdLCJtYXBwaW5ncyI6Ijs7Ozs7OztBQUFBOztBQUNBOztBQUNBOztBQUNBOztBQUNBOztBQUlBOztBQUNBOztBQUNBOztBQUNBOztBQUNBOzs7Ozs7Ozs7Ozs7OztBQUVBLE1BQU1BLHFCQUFxQixHQUFHLENBQzVCQyxhQUQ0QixFQUU1QkMsb0JBRjRCLEVBRzVCQyxvQkFINEIsRUFJNUJDLGtCQUo0QixLQUt6QjtBQUNILFFBQU1DLGNBQWMsR0FBR0Ysb0JBQW9CLEdBQ3ZDQSxvQkFBb0IsQ0FBQ0csS0FBckIsQ0FBMkIsR0FBM0IsQ0FEdUMsR0FFdkMsRUFGSjtBQUdBLFFBQU1DLGNBQWMsR0FBR0wsb0JBQW9CLEdBQ3ZDQSxvQkFBb0IsQ0FBQ0ksS0FBckIsQ0FBMkIsR0FBM0IsQ0FEdUMsR0FFdkMsRUFGSjtBQUdBLFFB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O0FBQ1YzRCxVQUFBQSxrQkFBa0IsQ0FBQzRELFdBQW5CLENBQStCRCxDQUEvQjtBQUNEO0FBQ0Y7QUFoRXdELEtBQTdCLENBQTlCOztBQW1FQSxRQUNFM0Qsa0JBQWtCLENBQUM2RCxjQUFuQixDQUNFWSxxQkFBcUIsQ0FBQ3ZDLElBQXRCLENBQTJCNEIsS0FBM0IsQ0FBaUNsQyxJQUFqQyxDQUFzQ21DLE1BRHhDLEtBR0EvRCxrQkFBa0IsQ0FBQzZELGNBQW5CLENBQWtDWSxxQkFBcUIsQ0FBQzdDLElBQXhELENBSkYsRUFLRTtBQUNBNUIsTUFBQUEsa0JBQWtCLENBQUNnRSxrQkFBbkIsQ0FDRVEseUJBREYsRUFFRUMscUJBRkY7QUFJRDtBQUNGO0FBQ0YsQ0FoVkQiLCJzb3VyY2VzQ29udGVudCI6WyJpbXBvcnQgeyBHcmFwaFFMTm9uTnVsbCB9IGZyb20gJ2dyYXBocWwnO1xuaW1wb3J0IHsgZnJvbUdsb2JhbElkLCBtdXRhdGlvbldpdGhDbGllbnRNdXRhdGlvbklkIH0gZnJvbSAnZ3JhcGhxbC1yZWxheSc7XG5pbXBvcnQgZ2V0RmllbGROYW1lcyBmcm9tICdncmFwaHFsLWxpc3QtZmllbGRzJztcbmltcG9ydCAqIGFzIGRlZmF1bHRHcmFwaFFMVHlwZXMgZnJvbSAnLi9kZWZhdWx0R3JhcGhRTFR5cGVzJztcbmltcG9ydCB7XG4gIGV4dHJhY3RLZXlzQW5kSW5jbHVkZSxcbiAgZ2V0UGFyc2VDbGFzc011dGF0aW9uQ29uZmlnLFxufSBmcm9tICcuLi9wYXJzZUdyYXBoUUxVdGlscyc7XG5pbXBvcnQgKiBhcyBvYmplY3RzTXV0YXRpb25zIGZyb20gJy4uL2hlbHBlcnMvb2JqZWN0c011dGF0aW9ucyc7XG5pbXBvcnQgKiBhcyBvYmplY3RzUXVlcmllcyBmcm9tICcuLi9oZWxwZXJzL29iamVjdHNRdWVyaWVzJztcbmltcG9ydCB7IFBhcnNlR3JhcGhRTENsYXNzQ29uZmlnIH0gZnJvbSAnLi4vLi4vQ29udHJvbGxlcnMvUGFyc2VHcmFwaFFMQ29udHJvbGxlcic7XG5pbXBvcnQgeyB0cmFuc2Zvcm1DbGFzc05hbWVUb0dyYXBoUUwgfSBmcm9tICcuLi90cmFuc2Zvcm1lcnMvY2xhc3NOYW1lJztcbmltcG9ydCB7IHRyYW5zZm9ybVR5cGVzIH0gZnJvbSAnLi4vdHJhbnNmb3JtZXJzL211dGF0aW9uJztcblxuY29uc3QgZ2V0T25seVJlcXVpcmVkRmllbGRzID0gKFxuICB1cGRhdGVkRmllbGRzLFxuICBzZWxlY3RlZEZpZWxkc1N0cmluZyxcbiAgaW5jbHVkZWRGaWVsZHNTdHJpbmcsXG4gIG5hdGl2ZU9iamVjdEZpZWxkc1xuKSA9PiB7XG4gIGNvbnN0IGluY2x1ZGVkRmllbGRzID0gaW5jbHVkZWRGaWVsZHNTdHJpbmdcbiAgICA/IGluY2x1ZGVkRmllbGRzU3RyaW5nLnNwbGl0KCcsJylcbiAgICA6IFtdO1xuICBjb25zdCBzZWxlY3RlZEZpZWxkcyA9IHNlbGVjdGVkRmllbGRzU3RyaW5nXG4gICAgPyBzZWxlY3RlZEZpZWxkc1N0cmluZy5zcGxpdCgnLCcpXG4gICAgOiBbXTtcbiAgY29uc3QgbWlzc2luZ0ZpZWxkcyA9IHNlbGVjdGVkRmllbGRzXG4gICAgLmZpbHRlcihcbiAgICAgIGZpZWxkID0+XG4gICAgICAgICFuYXRpdmVPYmplY3RGaWVsZHMuaW5jbHVkZXMoZmllbGQpIHx8IGluY2x1ZGVkRmllbGRzLmluY2x1ZGVzKGZpZWxkKVxuICAgIClcbiAgICAuam9pbignLCcpO1xuICBpZiAoIW1pc3NpbmdGaWVsZHMubGVuZ3RoKSB7XG4gICAgcmV0dXJuIHsgbmVlZEdldDogZmFsc2UsIGtleXM6ICcnIH07XG4gIH0gZWxzZSB7XG4gICAgcmV0dXJuIHsgbmVlZEdldDogdHJ1ZSwga2V5czogbWlzc2luZ0ZpZWxkcyB9O1xuICB9XG59O1xuXG5jb25zdCBsb2FkID0gZnVuY3Rpb24oXG4gIHBhcnNlR3JhcGhRTFNjaGVtYSxcbiAgcGFyc2VDbGFzcyxcbiAgcGFyc2VDbGFzc0NvbmZpZzogP1BhcnNlR3JhcGhRTENsYXNzQ29uZmlnXG4pIHtcbiAgY29uc3QgY2xhc3NOYW1lID0gcGFyc2VDbGFzcy5jbGFzc05hbWU7XG4gIGNvbnN0IGdyYXBoUUxDbGFzc05hbWUgPSB0cmFuc2Zvcm1DbGFzc05hbWVUb0dyYXBoUUwoY2xhc3NOYW1lKTtcbiAgY29uc3QgZ2V0R3JhcGhRTFF1ZXJ5TmFtZSA9XG4gICAgZ3JhcGhRTENsYXNzTmFtZS5jaGFyQXQoMCkudG9Mb3dlckNhc2UoKSArIGdyYXBoUUxDbGFzc05hbWUuc2xpY2UoMSk7XG5cbiAgY29uc3Qge1xuICAgIGNyZWF0ZTogaXNDcmVhdGVFbmFibGVkID0gdHJ1ZSxcbiAgICB1cGRhdGU6IGlzVXBkYXRlRW5hYmxlZCA9IHRydWUsXG4gICAgZGVzdHJveTogaXNEZXN0cm95RW5hYmxlZCA9IHRydWUsXG4gICAgY3JlYXRlQWxpYXM6IGNyZWF0ZUFsaWFzID0gJycsXG4gICAgdXBkYXRlQWxpYXM6IHVwZGF0ZUFsaWFzID0gJycsXG4gICAgZGVzdHJveUFsaWFzOiBkZXN0cm95QWxpYXMgPSAnJyxcbiAgfSA9IGdldFBhcnNlQ2xhc3NNdXRhdGlvbkNvbmZpZyhwYXJzZUNsYXNzQ29uZmlnKTtcblxuICBjb25zdCB7XG4gICAgY2xhc3NHcmFwaFFMQ3JlYXRlVHlwZSxcbiAgICBjbGFzc0dyYXBoUUxVcGRhdGVUeXBlLFxuICAgIGNsYXNzR3JhcGhRTE91dHB1dFR5cGUsXG4gIH0gPSBwYXJzZUdyYXBoUUxTY2hlbWEucGFyc2VDbGFzc1R5cGVzW2NsYXNzTmFtZV07XG5cbiAgaWYgKGlzQ3JlYXRlRW5hYmxlZCkge1xuICAgIGNvbnN0IGNyZWF0ZUdyYXBoUUxNdXRhdGlvbk5hbWUgPVxuICAgICAgY3JlYXRlQWxpYXMgfHwgYGNyZWF0ZSR7Z3JhcGhRTENsYXNzTmFtZX1gO1xuICAgIGNvbnN0IGNyZWF0ZUdyYXBoUUxNdXRhdGlvbiA9IG11dGF0aW9uV2l0aENsaWVudE11dGF0aW9uSWQoe1xuICAgICAgbmFtZTogYENyZWF0ZSR7Z3JhcGhRTENsYXNzTmFtZX1gLFxuICAgICAgZGVzY3JpcHRpb246IGBUaGUgJHtjcmVhdGVHcmFwaFFMTXV0YXRpb25OYW1lfSBtdXRhdGlvbiBjYW4gYmUgdXNlZCB0byBjcmVhdGUgYSBuZXcgb2JqZWN0IG9mIHRoZSAke2dyYXBoUUxDbGFzc05hbWV9IGNsYXNzLmAsXG4gICAgICBpbnB1dEZpZWxkczoge1xuICAgICAgICBmaWVsZHM6IHtcbiAgICAgICAgICBkZXNjcmlwdGlvbjpcbiAgICAgICAgICAgICdUaGVzZSBhcmUgdGhlIGZpZWxkcyB0aGF0IHdpbGwgYmUgdXNlZCB0byBjcmVhdGUgdGhlIG5ldyBvYmplY3QuJyxcbiAgICAgICAgICB0eXBlOiBjbGFzc0dyYXBoUUxDcmVhdGVUeXBlIHx8IGRlZmF1bHRHcmFwaFFMVHlwZXMuT0JKRUNULFxuICAgICAgICB9LFxuICAgICAgfSxcbiAgICAgIG91dHB1dEZpZWxkczoge1xuICAgICAgICBbZ2V0R3JhcGhRTFF1ZXJ5TmFtZV06IHtcbiAgICAgICAgICBkZXNjcmlwdGlvbjogJ1RoaXMgaXMgdGhlIGNyZWF0ZWQgb2JqZWN0LicsXG4gICAgICAgICAgdHlwZTogbmV3IEdyYXBoUUxOb25OdWxsKFxuICAgICAgICAgICAgY2xhc3NHcmFwaFFMT3V0cHV0VHlwZSB8fCBkZWZhdWx0R3JhcGhRTFR5cGVzLk9CSkVDVFxuICAgICAgICAgICksXG4gICAgICAgIH0sXG4gICAgICB9LFxuICAgICAgbXV0YXRlQW5kR2V0UGF5bG9hZDogYXN5bmMgKGFyZ3MsIGNvbnRleHQsIG11dGF0aW9uSW5mbykgPT4ge1xuICAgICAgICB0cnkge1xuICAgICAgICAgIGxldCB7IGZpZWxkcyB9ID0gYXJncztcbiAgICAgICAgICBpZiAoIWZpZWxkcykgZmllbGRzID0ge307XG4gICAgICAgICAgY29uc3QgeyBjb25maWcsIGF1dGgsIGluZm8gfSA9IGNvbnRleHQ7XG5cbiAgICAgICAgICBjb25zdCBwYXJzZUZpZWxkcyA9IGF3YWl0IHRyYW5zZm9ybVR5cGVzKCdjcmVhdGUnLCBmaWVsZHMsIHtcbiAgICAgICAgICAgIGNsYXNzTmFtZSxcbiAgICAgICAgICAgIHBhcnNlR3JhcGhRTFNjaGVtYSxcbiAgICAgICAgICAgIHJlcTogeyBjb25maWcsIGF1dGgsIGluZm8gfSxcbiAgICAgICAgICB9KTtcblxuICAgICAgICAgIGNvbnN0IGNyZWF0ZWRPYmplY3QgPSBhd2FpdCBvYmplY3RzTXV0YXRpb25zLmNyZWF0ZU9iamVjdChcbiAgICAgICAgICAgIGNsYXNzTmFtZSxcbiAgICAgICAgICAgIHBhcnNlRmllbGRzLFxuICAgICAgICAgICAgY29uZmlnLFxuICAgICAgICAgICAgYXV0aCxcbiAgICAgICAgICAgIGluZm9cbiAgICAgICAgICApO1xuICAgICAgICAgIGNvbnN0IHNlbGVjdGVkRmllbGRzID0gZ2V0RmllbGROYW1lcyhtdXRhdGlvbkluZm8pXG4gICAgICAgICAgICAuZmlsdGVyKGZpZWxkID0+IGZpZWxkLnN0YXJ0c1dpdGgoYCR7Z2V0R3JhcGhRTFF1ZXJ5TmFtZX0uYCkpXG4gICAgICAgICAgICAubWFwKGZpZWxkID0+IGZpZWxkLnJlcGxhY2UoYCR7Z2V0R3JhcGhRTFF1ZXJ5TmFtZX0uYCwgJycpKTtcbiAgICAgICAgICBjb25zdCB7IGtleXMsIGluY2x1ZGUgfSA9IGV4dHJhY3RLZXlzQW5kSW5jbHVkZShzZWxlY3RlZEZpZWxkcyk7XG4gICAgICAgICAgY29uc3QgeyBrZXlzOiByZXF1aXJlZEtleXMsIG5lZWRHZXQgfSA9IGdldE9ubHlSZXF1aXJlZEZpZWxkcyhcbiAgICAgICAgICAgIGZpZWxkcyxcbiAgICAgICAgICAgIGtleXMsXG4gICAgICAgICAgICBpbmNsdWRlLFxuICAgICAgICAgICAgWydpZCcsICdvYmplY3RJZCcsICdjcmVhdGVkQXQnLCAndXBkYXRlZEF0J11cbiAgICAgICAgICApO1xuICAgICAgICAgIGNvbnN0IG5lZWRUb0dldEFsbEtleXMgPSBvYmplY3RzUXVlcmllcy5uZWVkVG9HZXRBbGxLZXlzKFxuICAgICAgICAgICAgcGFyc2VDbGFzcy5maWVsZHMsXG4gICAgICAgICAgICBrZXlzLFxuICAgICAgICAgICAgcGFyc2VHcmFwaFFMU2NoZW1hLnBhcnNlQ2xhc3Nlc1xuICAgICAgICAgICk7XG4gICAgICAgICAgbGV0IG9wdGltaXplZE9iamVjdCA9IHt9O1xuICAgICAgICAgIGlmIChuZWVkR2V0ICYmICFuZWVkVG9HZXRBbGxLZXlzKSB7XG4gICAgICAgICAgICBvcHRpbWl6ZWRPYmplY3QgPSBhd2FpdCBvYmplY3RzUXVlcmllcy5nZXRPYmplY3QoXG4gICAgICAgICAgICAgIGNsYXNzTmFtZSxcbiAgICAgICAgICAgICAgY3JlYXRlZE9iamVjdC5vYmplY3RJZCxcbiAgICAgICAgICAgICAgcmVxdWlyZWRLZXlzLFxuICAgICAgICAgICAgICBpbmNsdWRlLFxuICAgICAgICAgICAgICB1bmRlZmluZWQsXG4gICAgICAgICAgICAgIHVuZGVmaW5lZCxcbiAgICAgICAgICAgICAgY29uZmlnLFxuICAgICAgICAgICAgICBhdXRoLFxuICAgICAgICAgICAgICBpbmZvLFxuICAgICAgICAgICAgICBwYXJzZUdyYXBoUUxTY2hlbWEucGFyc2VDbGFzc2VzXG4gICAgICAgICAgICApO1xuICAgICAgICAgIH0gZWxzZSBpZiAobmVlZFRvR2V0QWxsS2V5cykge1xuICAgICAgICAgICAgb3B0aW1pemVkT2JqZWN0ID0gYXdhaXQgb2JqZWN0c1F1ZXJpZXMuZ2V0T2JqZWN0KFxuICAgICAgICAgICAgICBjbGFzc05hbWUsXG4gICAgICAgICAgICAgIGNyZWF0ZWRPYmplY3Qub2JqZWN0SWQsXG4gICAgICAgICAgICAgIHVuZGVmaW5lZCxcbiAgICAgICAgICAgICAgaW5jbHVkZSxcbiAgICAgICAgICAgICAgdW5kZWZpbmVkLFxuICAgICAgICAgICAgICB1bmRlZmluZWQsXG4gICAgICAgICAgICAgIGNvbmZpZyxcbiAgICAgICAgICAgICAgYXV0aCxcbiAgICAgICAgICAgICAgaW5mbyxcbiAgICAgICAgICAgICAgcGFyc2VHcmFwaFFMU2NoZW1hLnBhcnNlQ2xhc3Nlc1xuICAgICAgICAgICAgKTtcbiAgICAgICAgICB9XG4gICAgICAgICAgcmV0dXJuIHtcbiAgICAgICAgICAgIFtnZXRHcmFwaFFMUXVlcnlOYW1lXToge1xuICAgICAgICAgICAgICAuLi5jcmVhdGVkT2JqZWN0LFxuICAgICAgICAgICAgICB1cGRhdGVkQXQ6IGNyZWF0ZWRPYmplY3QuY3JlYXRlZEF0LFxuICAgICAgICAgICAgICAuLi5wYXJzZUZpZWxkcyxcbiAgICAgICAgICAgICAgLi4ub3B0aW1pemVkT2JqZWN0LFxuICAgICAgICAgICAgfSxcbiAgICAgICAgICB9O1xuICAgICAgICB9IGNhdGNoIChlKSB7XG4gICAgICAgICAgcGFyc2VHcmFwaFFMU2NoZW1hLmhhbmRsZUVycm9yKGUpO1xuICAgICAgICB9XG4gICAgICB9LFxuICAgIH0pO1xuXG4gICAgaWYgKFxuICAgICAgcGFyc2VHcmFwaFFMU2NoZW1hLmFkZEdyYXBoUUxUeXBlKFxuICAgICAgICBjcmVhdGVHcmFwaFFMTXV0YXRpb24uYXJncy5pbnB1dC50eXBlLm9mVHlwZVxuICAgICAgKSAmJlxuICAgICAgcGFyc2VHcmFwaFFMU2NoZW1hLmFkZEdyYXBoUUxUeXBlKGNyZWF0ZUdyYXBoUUxNdXRhdGlvbi50eXBlKVxuICAgICkge1xuICAgICAgcGFyc2VHcmFwaFFMU2NoZW1hLmFkZEdyYXBoUUxNdXRhdGlvbihcbiAgICAgICAgY3JlYXRlR3JhcGhRTE11dGF0aW9uTmFtZSxcbiAgICAgICAgY3JlYXRlR3JhcGhRTE11dGF0aW9uXG4gICAgICApO1xuICAgIH1cbiAgfVxuXG4gIGlmIChpc1VwZGF0ZUVuYWJsZWQpIHtcbiAgICBjb25zdCB1cGRhdGVHcmFwaFFMTXV0YXRpb25OYW1lID1cbiAgICAgIHVwZGF0ZUFsaWFzIHx8IGB1cGRhdGUke2dyYXBoUUxDbGFzc05hbWV9YDtcbiAgICBjb25zdCB1cGRhdGVHcmFwaFFMTXV0YXRpb24gPSBtdXRhdGlvbldpdGhDbGllbnRNdXRhdGlvbklkKHtcbiAgICAgIG5hbWU6IGBVcGRhdGUke2dyYXBoUUxDbGFzc05hbWV9YCxcbiAgICAgIGRlc2NyaXB0aW9uOiBgVGhlICR7dXBkYXRlR3JhcGhRTE11dGF0aW9uTmFtZX0gbXV0YXRpb24gY2FuIGJlIHVzZWQgdG8gdXBkYXRlIGFuIG9iamVjdCBvZiB0aGUgJHtncmFwaFFMQ2xhc3NOYW1lfSBjbGFzcy5gLFxuICAgICAgaW5wdXRGaWVsZHM6IHtcbiAgICAgICAgaWQ6IGRlZmF1bHRHcmFwaFFMVHlwZXMuR0xPQkFMX09SX09CSkVDVF9JRF9BVFQsXG4gICAgICAgIGZpZWxkczoge1xuICAgICAgICAgIGRlc2NyaXB0aW9uOlxuICAgICAgICAgICAgJ1RoZXNlIGFyZSB0aGUgZmllbGRzIHRoYXQgd2lsbCBiZSB1c2VkIHRvIHVwZGF0ZSB0aGUgb2JqZWN0LicsXG4gICAgICAgICAgdHlwZTogY2xhc3NHcmFwaFFMVXBkYXRlVHlwZSB8fCBkZWZhdWx0R3JhcGhRTFR5cGVzLk9CSkVDVCxcbiAgICAgICAgfSxcbiAgICAgIH0sXG4gICAgICBvdXRwdXRGaWVsZHM6IHtcbiAgICAgICAgW2dldEdyYXBoUUxRdWVyeU5hbWVdOiB7XG4gICAgICAgICAgZGVzY3JpcHRpb246ICdUaGlzIGlzIHRoZSB1cGRhdGVkIG9iamVjdC4nLFxuICAgICAgICAgIHR5cGU6IG5ldyBHcmFwaFFMTm9uTnVsbChcbiAgICAgICAgICAgIGNsYXNzR3JhcGhRTE91dHB1dFR5cGUgfHwgZGVmYXVsdEdyYXBoUUxUeXBlcy5PQkpFQ1RcbiAgICAgICAgICApLFxuICAgICAgICB9LFxuICAgICAgfSxcbiAgICAgIG11dGF0ZUFuZEdldFBheWxvYWQ6IGFzeW5jIChhcmdzLCBjb250ZXh0LCBtdXRhdGlvbkluZm8pID0+IHtcbiAgICAgICAgdHJ5IHtcbiAgICAgICAgICBsZXQgeyBpZCwgZmllbGRzIH0gPSBhcmdzO1xuICAgICAgICAgIGlmICghZmllbGRzKSBmaWVsZHMgPSB7fTtcbiAgICAgICAgICBjb25zdCB7IGNvbmZpZywgYXV0aCwgaW5mbyB9ID0gY29udGV4dDtcblxuICAgICAgICAgIGNvbnN0IGdsb2JhbElkT2JqZWN0ID0gZnJvbUdsb2JhbElkKGlkKTtcblxuICAgICAgICAgIGlmIChnbG9iYWxJZE9iamVjdC50eXBlID09PSBjbGFzc05hbWUpIHtcbiAgICAgICAgICAgIGlkID0gZ2xvYmFsSWRPYmplY3QuaWQ7XG4gICAgICAgICAgfVxuXG4gICAgICAgICAgY29uc3QgcGFyc2VGaWVsZHMgPSBhd2FpdCB0cmFuc2Zvcm1UeXBlcygndXBkYXRlJywgZmllbGRzLCB7XG4gICAgICAgICAgICBjbGFzc05hbWUsXG4gICAgICAgICAgICBwYXJzZUdyYXBoUUxTY2hlbWEsXG4gICAgICAgICAgICByZXE6IHsgY29uZmlnLCBhdXRoLCBpbmZvIH0sXG4gICAgICAgICAgfSk7XG5cbiAgICAgICAgICBjb25zdCB1cGRhdGVkT2JqZWN0ID0gYXdhaXQgb2JqZWN0c011dGF0aW9ucy51cGRhdGVPYmplY3QoXG4gICAgICAgICAgICBjbGFzc05hbWUsXG4gICAgICAgICAgICBpZCxcbiAgICAgICAgICAgIHBhcnNlRmllbGRzLFxuICAgICAgICAgICAgY29uZmlnLFxuICAgICAgICAgICAgYXV0aCxcbiAgICAgICAgICAgIGluZm9cbiAgICAgICAgICApO1xuXG4gICAgICAgICAgY29uc3Qgc2VsZWN0ZWRGaWVsZHMgPSBnZXRGaWVsZE5hbWVzKG11dGF0aW9uSW5mbylcbiAgICAgICAgICAgIC5maWx0ZXIoZmllbGQgPT4gZmllbGQuc3RhcnRzV2l0aChgJHtnZXRHcmFwaFFMUXVlcnlOYW1lfS5gKSlcbiAgICAgICAgICAgIC5tYXAoZmllbGQgPT4gZmllbGQucmVwbGFjZShgJHtnZXRHcmFwaFFMUXVlcnlOYW1lfS5gLCAnJykpO1xuICAgICAgICAgIGNvbnN0IHsga2V5cywgaW5jbHVkZSB9ID0gZXh0cmFjdEtleXNBbmRJbmNsdWRlKHNlbGVjdGVkRmllbGRzKTtcbiAgICAgICAgICBjb25zdCB7IGtleXM6IHJlcXVpcmVkS2V5cywgbmVlZEdldCB9ID0gZ2V0T25seVJlcXVpcmVkRmllbGRzKFxuICAgICAgICAgICAgZmllbGRzLFxuICAgICAgICAgICAga2V5cyxcbiAgICAgICAgICAgIGluY2x1ZGUsXG4gICAgICAgICAgICBbJ2lkJywgJ29iamVjdElkJywgJ3VwZGF0ZWRBdCddXG4gICAgICAgICAgKTtcbiAgICAgICAgICBjb25zdCBuZWVkVG9HZXRBbGxLZXlzID0gb2JqZWN0c1F1ZXJpZXMubmVlZFRvR2V0QWxsS2V5cyhcbiAgICAgICAgICAgIHBhcnNlQ2xhc3MuZmllbGRzLFxuICAgICAgICAgICAga2V5cyxcbiAgICAgICAgICAgIHBhcnNlR3JhcGhRTFNjaGVtYS5wYXJzZUNsYXNzZXNcbiAgICAgICAgICApO1xuICAgICAgICAgIGxldCBvcHRpbWl6ZWRPYmplY3QgPSB7fTtcbiAgICAgICAgICBpZiAobmVlZEdldCAmJiAhbmVlZFRvR2V0QWxsS2V5cykge1xuICAgICAgICAgICAgb3B0aW1pemVkT2JqZWN0ID0gYXdhaXQgb2JqZWN0c1F1ZXJpZXMuZ2V0T2JqZWN0KFxuICAgICAgICAgICAgICBjbGFzc05hbWUsXG4gICAgICAgICAgICAgIGlkLFxuICAgICAgICAgICAgICByZXF1aXJlZEtleXMsXG4gICAgICAgICAgICAgIGluY2x1ZGUsXG4gICAgICAgICAgICAgIHVuZGVmaW5lZCxcbiAgICAgICAgICAgICAgdW5kZWZpbmVkLFxuICAgICAgICAgICAgICBjb25maWcsXG4gICAgICAgICAgICAgIGF1dGgsXG4gICAgICAgICAgICAgIGluZm8sXG4gICAgICAgICAgICAgIHBhcnNlR3JhcGhRTFNjaGVtYS5wYXJzZUNsYXNzZXNcbiAgICAgICAgICAgICk7XG4gICAgICAgICAgfSBlbHNlIGlmIChuZWVkVG9HZXRBbGxLZXlzKSB7XG4gICAgICAgICAgICBvcHRpbWl6ZWRPYmplY3QgPSBhd2FpdCBvYmplY3RzUXVlcmllcy5nZXRPYmplY3QoXG4gICAgICAgICAgICAgIGNsYXNzTmFtZSxcbiAgICAgICAgICAgICAgaWQsXG4gICAgICAgICAgICAgIHVuZGVmaW5lZCxcbiAgICAgICAgICAgICAgaW5jbHVkZSxcbiAgICAgICAgICAgICAgdW5kZWZpbmVkLFxuICAgICAgICAgICAgICB1bmRlZmluZWQsXG4gICAgICAgICAgICAgIGNvbmZpZyxcbiAgICAgICAgICAgICAgYXV0aCxcbiAgICAgICAgICAgICAgaW5mbyxcbiAgICAgICAgICAgICAgcGFyc2VHcmFwaFFMU2NoZW1hLnBhcnNlQ2xhc3Nlc1xuICAgICAgICAgICAgKTtcbiAgICAgICAgICB9XG4gICAgICAgICAgcmV0dXJuIHtcbiAgICAgICAgICAgIFtnZXRHcmFwaFFMUXVlcnlOYW1lXToge1xuICAgICAgICAgICAgICBvYmplY3RJZDogaWQsXG4gICAgICAgICAgICAgIC4uLnVwZGF0ZWRPYmplY3QsXG4gICAgICAgICAgICAgIC4uLnBhcnNlRmllbGRzLFxuICAgICAgICAgICAgICAuLi5vcHRpbWl6ZWRPYmplY3QsXG4gICAgICAgICAgICB9LFxuICAgICAgICAgIH07XG4gICAgICAgIH0gY2F0Y2ggKGUpIHtcbiAgICAgICAgICBwYXJzZUdyYXBoUUxTY2hlbWEuaGFuZGxlRXJyb3IoZSk7XG4gICAgICAgIH1cbiAgICAgIH0sXG4gICAgfSk7XG5cbiAgICBpZiAoXG4gICAgICBwYXJzZUdyYXBoUUxTY2hlbWEuYWRkR3JhcGhRTFR5cGUoXG4gICAgICAgIHVwZGF0ZUdyYXBoUUxNdXRhdGlvbi5hcmdzLmlucHV0LnR5cGUub2ZUeXBlXG4gICAgICApICYmXG4gICAgICBwYXJzZUdyYXBoUUxTY2hlbWEuYWRkR3JhcGhRTFR5cGUodXBkYXRlR3JhcGhRTE11dGF0aW9uLnR5cGUpXG4gICAgKSB7XG4gICAgICBwYXJzZUdyYXBoUUxTY2hlbWEuYWRkR3JhcGhRTE11dGF0aW9uKFxuICAgICAgICB1cGRhdGVHcmFwaFFMTXV0YXRpb25OYW1lLFxuICAgICAgICB1cGRhdGVHcmFwaFFMTXV0YXRpb25cbiAgICAgICk7XG4gICAgfVxuICB9XG5cbiAgaWYgKGlzRGVzdHJveUVuYWJsZWQpIHtcbiAgICBjb25zdCBkZWxldGVHcmFwaFFMTXV0YXRpb25OYW1lID1cbiAgICAgIGRlc3Ryb3lBbGlhcyB8fCBgZGVsZXRlJHtncmFwaFFMQ2xhc3NOYW1lfWA7XG4gICAgY29uc3QgZGVsZXRlR3JhcGhRTE11dGF0aW9uID0gbXV0YXRpb25XaXRoQ2xpZW50TXV0YXRpb25JZCh7XG4gICAgICBuYW1lOiBgRGVsZXRlJHtncmFwaFFMQ2xhc3NOYW1lfWAsXG4gICAgICBkZXNjcmlwdGlvbjogYFRoZSAke2RlbGV0ZUdyYXBoUUxNdXRhdGlvbk5hbWV9IG11dGF0aW9uIGNhbiBiZSB1c2VkIHRvIGRlbGV0ZSBhbiBvYmplY3Qgb2YgdGhlICR7Z3JhcGhRTENsYXNzTmFtZX0gY2xhc3MuYCxcbiAgICAgIGlucHV0RmllbGRzOiB7XG4gICAgICAgIGlkOiBkZWZhdWx0R3JhcGhRTFR5cGVzLkdMT0JBTF9PUl9PQkpFQ1RfSURfQVRULFxuICAgICAgfSxcbiAgICAgIG91dHB1dEZpZWxkczoge1xuICAgICAgICBbZ2V0R3JhcGhRTFF1ZXJ5TmFtZV06IHtcbiAgICAgICAgICBkZXNjcmlwdGlvbjogJ1RoaXMgaXMgdGhlIGRlbGV0ZWQgb2JqZWN0LicsXG4gICAgICAgICAgdHlwZTogbmV3IEdyYXBoUUxOb25OdWxsKFxuICAgICAgICAgICAgY2xhc3NHcmFwaFFMT3V0cHV0VHlwZSB8fCBkZWZhdWx0R3JhcGhRTFR5cGVzLk9CSkVDVFxuICAgICAgICAgICksXG4gICAgICAgIH0sXG4gICAgICB9LFxuICAgICAgbXV0YXRlQW5kR2V0UGF5bG9hZDogYXN5bmMgKGFyZ3MsIGNvbnRleHQsIG11dGF0aW9uSW5mbykgPT4ge1xuICAgICAgICB0cnkge1xuICAgICAgICAgIGxldCB7IGlkIH0gPSBhcmdzO1xuICAgICAgICAgIGNvbnN0IHsgY29uZmlnLCBhdXRoLCBpbmZvIH0gPSBjb250ZXh0O1xuXG4gICAgICAgICAgY29uc3QgZ2xvYmFsSWRPYmplY3QgPSBmcm9tR2xvYmFsSWQoaWQpO1xuXG4gICAgICAgICAgaWYgKGdsb2JhbElkT2JqZWN0LnR5cGUgPT09IGNsYXNzTmFtZSkge1xuICAgICAgICAgICAgaWQgPSBnbG9iYWxJZE9iamVjdC5pZDtcbiAgICAgICAgICB9XG5cbiAgICAgICAgICBjb25zdCBzZWxlY3RlZEZpZWxkcyA9IGdldEZpZWxkTmFtZXMobXV0YXRpb25JbmZvKVxuICAgICAgICAgICAgLmZpbHRlcihmaWVsZCA9PiBmaWVsZC5zdGFydHNXaXRoKGAke2dldEdyYXBoUUxRdWVyeU5hbWV9LmApKVxuICAgICAgICAgICAgLm1hcChmaWVsZCA9PiBmaWVsZC5yZXBsYWNlKGAke2dldEdyYXBoUUxRdWVyeU5hbWV9LmAsICcnKSk7XG4gICAgICAgICAgY29uc3QgeyBrZXlzLCBpbmNsdWRlIH0gPSBleHRyYWN0S2V5c0FuZEluY2x1ZGUoc2VsZWN0ZWRGaWVsZHMpO1xuICAgICAgICAgIGxldCBvcHRpbWl6ZWRPYmplY3QgPSB7fTtcbiAgICAgICAgICBpZiAoXG4gICAgICAgICAgICBrZXlzICYmXG4gICAgICAgICAgICBrZXlzLnNwbGl0KCcsJykuZmlsdGVyKGtleSA9PiAhWydpZCcsICdvYmplY3RJZCddLmluY2x1ZGVzKGtleSkpXG4gICAgICAgICAgICAgIC5sZW5ndGggPiAwXG4gICAgICAgICAgKSB7XG4gICAgICAgICAgICBvcHRpbWl6ZWRPYmplY3QgPSBhd2FpdCBvYmplY3RzUXVlcmllcy5nZXRPYmplY3QoXG4gICAgICAgICAgICAgIGNsYXNzTmFtZSxcbiAgICAgICAgICAgICAgaWQsXG4gICAgICAgICAgICAgIGtleXMsXG4gICAgICAgICAgICAgIGluY2x1ZGUsXG4gICAgICAgICAgICAgIHVuZGVmaW5lZCxcbiAgICAgICAgICAgICAgdW5kZWZpbmVkLFxuICAgICAgICAgICAgICBjb25maWcsXG4gICAgICAgICAgICAgIGF1dGgsXG4gICAgICAgICAgICAgIGluZm8sXG4gICAgICAgICAgICAgIHBhcnNlR3JhcGhRTFNjaGVtYS5wYXJzZUNsYXNzZXNcbiAgICAgICAgICAgICk7XG4gICAgICAgICAgfVxuICAgICAgICAgIGF3YWl0IG9iamVjdHNNdXRhdGlvbnMuZGVsZXRlT2JqZWN0KFxuICAgICAgICAgICAgY2xhc3NOYW1lLFxuICAgICAgICAgICAgaWQsXG4gICAgICAgICAgICBjb25maWcsXG4gICAgICAgICAgICBhdXRoLFxuICAgICAgICAgICAgaW5mb1xuICAgICAgICAgICk7XG4gICAgICAgICAgcmV0dXJuIHtcbiAgICAgICAgICAgIFtnZXRHcmFwaFFMUXVlcnlOYW1lXToge1xuICAgICAgICAgICAgICBvYmplY3RJZDogaWQsXG4gICAgICAgICAgICAgIC4uLm9wdGltaXplZE9iamVjdCxcbiAgICAgICAgICAgIH0sXG4gICAgICAgICAgfTtcbiAgICAgICAgfSBjYXRjaCAoZSkge1xuICAgICAgICAgIHBhcnNlR3JhcGhRTFNjaGVtYS5oYW5kbGVFcnJvcihlKTtcbiAgICAgICAgfVxuICAgICAgfSxcbiAgICB9KTtcblxuICAgIGlmIChcbiAgICAgIHBhcnNlR3JhcGhRTFNjaGVtYS5hZGRHcmFwaFFMVHlwZShcbiAgICAgICAgZGVsZXRlR3JhcGhRTE11dGF0aW9uLmFyZ3MuaW5wdXQudHlwZS5vZlR5cGVcbiAgICAgICkgJiZcbiAgICAgIHBhcnNlR3JhcGhRTFNjaGVtYS5hZGRHcmFwaFFMVHlwZShkZWxldGVHcmFwaFFMTXV0YXRpb24udHlwZSlcbiAgICApIHtcbiAgICAgIHBhcnNlR3JhcGhRTFNjaGVtYS5hZGRHcmFwaFFMTXV0YXRpb24oXG4gICAgICAgIGRlbGV0ZUdyYXBoUUxNdXRhdGlvbk5hbWUsXG4gICAgICAgIGRlbGV0ZUdyYXBoUUxNdXRhdGlvblxuICAgICAgKTtcbiAgICB9XG4gIH1cbn07XG5cbmV4cG9ydCB7IGxvYWQgfTtcbiJdfQ==