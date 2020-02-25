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
          const needToGetAllKeys = objectsQueries.needToGetAllKeys(parseClass.fields, keys);
          let optimizedObject = {};

          if (needGet && !needToGetAllKeys) {
            optimizedObject = await objectsQueries.getObject(className, createdObject.objectId, requiredKeys, include, undefined, undefined, config, auth, info, parseClass);
          } else if (needToGetAllKeys) {
            optimizedObject = await objectsQueries.getObject(className, createdObject.objectId, undefined, include, undefined, undefined, config, auth, info, parseClass);
          }

          return {
            [getGraphQLQueryName]: _objectSpread({}, createdObject, {
              updatedAt: createdObject.createdAt
            }, parseFields, {}, optimizedObject)
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
          const needToGetAllKeys = objectsQueries.needToGetAllKeys(parseClass.fields, keys);
          let optimizedObject = {};

          if (needGet && !needToGetAllKeys) {
            optimizedObject = await objectsQueries.getObject(className, id, requiredKeys, include, undefined, undefined, config, auth, info, parseClass);
          } else if (needToGetAllKeys) {
            optimizedObject = await objectsQueries.getObject(className, id, undefined, include, undefined, undefined, config, auth, info, parseClass);
          }

          return {
            [getGraphQLQueryName]: _objectSpread({
              objectId: id
            }, updatedObject, {}, parseFields, {}, optimizedObject)
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
            optimizedObject = await objectsQueries.getObject(className, id, keys, include, undefined, undefined, config, auth, info, parseClass);
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
//# sourceMappingURL=data:application/json;charset=utf-8;base64,eyJ2ZXJzaW9uIjozLCJzb3VyY2VzIjpbIi4uLy4uLy4uL3NyYy9HcmFwaFFML2xvYWRlcnMvcGFyc2VDbGFzc011dGF0aW9ucy5qcyJdLCJuYW1lcyI6WyJnZXRPbmx5UmVxdWlyZWRGaWVsZHMiLCJ1cGRhdGVkRmllbGRzIiwic2VsZWN0ZWRGaWVsZHNTdHJpbmciLCJpbmNsdWRlZEZpZWxkc1N0cmluZyIsIm5hdGl2ZU9iamVjdEZpZWxkcyIsImluY2x1ZGVkRmllbGRzIiwic3BsaXQiLCJzZWxlY3RlZEZpZWxkcyIsIm1pc3NpbmdGaWVsZHMiLCJmaWx0ZXIiLCJmaWVsZCIsImluY2x1ZGVzIiwiam9pbiIsImxlbmd0aCIsIm5lZWRHZXQiLCJrZXlzIiwibG9hZCIsInBhcnNlR3JhcGhRTFNjaGVtYSIsInBhcnNlQ2xhc3MiLCJwYXJzZUNsYXNzQ29uZmlnIiwiY2xhc3NOYW1lIiwiZ3JhcGhRTENsYXNzTmFtZSIsImdldEdyYXBoUUxRdWVyeU5hbWUiLCJjaGFyQXQiLCJ0b0xvd2VyQ2FzZSIsInNsaWNlIiwiY3JlYXRlIiwiaXNDcmVhdGVFbmFibGVkIiwidXBkYXRlIiwiaXNVcGRhdGVFbmFibGVkIiwiZGVzdHJveSIsImlzRGVzdHJveUVuYWJsZWQiLCJjcmVhdGVBbGlhcyIsInVwZGF0ZUFsaWFzIiwiZGVzdHJveUFsaWFzIiwiY2xhc3NHcmFwaFFMQ3JlYXRlVHlwZSIsImNsYXNzR3JhcGhRTFVwZGF0ZVR5cGUiLCJjbGFzc0dyYXBoUUxPdXRwdXRUeXBlIiwicGFyc2VDbGFzc1R5cGVzIiwiY3JlYXRlR3JhcGhRTE11dGF0aW9uTmFtZSIsImNyZWF0ZUdyYXBoUUxNdXRhdGlvbiIsIm5hbWUiLCJkZXNjcmlwdGlvbiIsImlucHV0RmllbGRzIiwiZmllbGRzIiwidHlwZSIsImRlZmF1bHRHcmFwaFFMVHlwZXMiLCJPQkpFQ1QiLCJvdXRwdXRGaWVsZHMiLCJHcmFwaFFMTm9uTnVsbCIsIm11dGF0ZUFuZEdldFBheWxvYWQiLCJhcmdzIiwiY29udGV4dCIsIm11dGF0aW9uSW5mbyIsImNvbmZpZyIsImF1dGgiLCJpbmZvIiwicGFyc2VGaWVsZHMiLCJyZXEiLCJjcmVhdGVkT2JqZWN0Iiwib2JqZWN0c011dGF0aW9ucyIsImNyZWF0ZU9iamVjdCIsInN0YXJ0c1dpdGgiLCJtYXAiLCJyZXBsYWNlIiwiaW5jbHVkZSIsInJlcXVpcmVkS2V5cyIsIm5lZWRUb0dldEFsbEtleXMiLCJvYmplY3RzUXVlcmllcyIsIm9wdGltaXplZE9iamVjdCIsImdldE9iamVjdCIsIm9iamVjdElkIiwidW5kZWZpbmVkIiwidXBkYXRlZEF0IiwiY3JlYXRlZEF0IiwiZSIsImhhbmRsZUVycm9yIiwiYWRkR3JhcGhRTFR5cGUiLCJpbnB1dCIsIm9mVHlwZSIsImFkZEdyYXBoUUxNdXRhdGlvbiIsInVwZGF0ZUdyYXBoUUxNdXRhdGlvbk5hbWUiLCJ1cGRhdGVHcmFwaFFMTXV0YXRpb24iLCJpZCIsIkdMT0JBTF9PUl9PQkpFQ1RfSURfQVRUIiwiZ2xvYmFsSWRPYmplY3QiLCJ1cGRhdGVkT2JqZWN0IiwidXBkYXRlT2JqZWN0IiwiZGVsZXRlR3JhcGhRTE11dGF0aW9uTmFtZSIsImRlbGV0ZUdyYXBoUUxNdXRhdGlvbiIsImtleSIsImRlbGV0ZU9iamVjdCJdLCJtYXBwaW5ncyI6Ijs7Ozs7OztBQUFBOztBQUNBOztBQUNBOztBQUNBOztBQUNBOztBQUlBOztBQUNBOztBQUNBOztBQUNBOztBQUNBOzs7Ozs7Ozs7Ozs7OztBQUVBLE1BQU1BLHFCQUFxQixHQUFHLENBQzVCQyxhQUQ0QixFQUU1QkMsb0JBRjRCLEVBRzVCQyxvQkFINEIsRUFJNUJDLGtCQUo0QixLQUt6QjtBQUNILFFBQU1DLGNBQWMsR0FBR0Ysb0JBQW9CLEdBQ3ZDQSxvQkFBb0IsQ0FBQ0csS0FBckIsQ0FBMkIsR0FBM0IsQ0FEdUMsR0FFdkMsRUFGSjtBQUdBLFFBQU1DLGNBQWMsR0FBR0wsb0JBQW9CLEdBQ3ZDQSxvQkFBb0IsQ0FBQ0ksS0FBckIsQ0FBMkIsR0FBM0IsQ0FEdUMsR0FFdkMsRUFGSjtBQUdBLFFBQU1FLGFBQWEsR0FBR0Qs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SUFBdEIsQ0FBMkIyQixLQUEzQixDQUFpQ2pDLElBQWpDLENBQXNDa0MsTUFEeEMsS0FHQTlELGtCQUFrQixDQUFDNEQsY0FBbkIsQ0FBa0NZLHFCQUFxQixDQUFDNUMsSUFBeEQsQ0FKRixFQUtFO0FBQ0E1QixNQUFBQSxrQkFBa0IsQ0FBQytELGtCQUFuQixDQUNFUSx5QkFERixFQUVFQyxxQkFGRjtBQUlEO0FBQ0Y7QUFDRixDQTlVRCIsInNvdXJjZXNDb250ZW50IjpbImltcG9ydCB7IEdyYXBoUUxOb25OdWxsIH0gZnJvbSAnZ3JhcGhxbCc7XG5pbXBvcnQgeyBmcm9tR2xvYmFsSWQsIG11dGF0aW9uV2l0aENsaWVudE11dGF0aW9uSWQgfSBmcm9tICdncmFwaHFsLXJlbGF5JztcbmltcG9ydCBnZXRGaWVsZE5hbWVzIGZyb20gJ2dyYXBocWwtbGlzdC1maWVsZHMnO1xuaW1wb3J0ICogYXMgZGVmYXVsdEdyYXBoUUxUeXBlcyBmcm9tICcuL2RlZmF1bHRHcmFwaFFMVHlwZXMnO1xuaW1wb3J0IHtcbiAgZXh0cmFjdEtleXNBbmRJbmNsdWRlLFxuICBnZXRQYXJzZUNsYXNzTXV0YXRpb25Db25maWcsXG59IGZyb20gJy4uL3BhcnNlR3JhcGhRTFV0aWxzJztcbmltcG9ydCAqIGFzIG9iamVjdHNNdXRhdGlvbnMgZnJvbSAnLi4vaGVscGVycy9vYmplY3RzTXV0YXRpb25zJztcbmltcG9ydCAqIGFzIG9iamVjdHNRdWVyaWVzIGZyb20gJy4uL2hlbHBlcnMvb2JqZWN0c1F1ZXJpZXMnO1xuaW1wb3J0IHsgUGFyc2VHcmFwaFFMQ2xhc3NDb25maWcgfSBmcm9tICcuLi8uLi9Db250cm9sbGVycy9QYXJzZUdyYXBoUUxDb250cm9sbGVyJztcbmltcG9ydCB7IHRyYW5zZm9ybUNsYXNzTmFtZVRvR3JhcGhRTCB9IGZyb20gJy4uL3RyYW5zZm9ybWVycy9jbGFzc05hbWUnO1xuaW1wb3J0IHsgdHJhbnNmb3JtVHlwZXMgfSBmcm9tICcuLi90cmFuc2Zvcm1lcnMvbXV0YXRpb24nO1xuXG5jb25zdCBnZXRPbmx5UmVxdWlyZWRGaWVsZHMgPSAoXG4gIHVwZGF0ZWRGaWVsZHMsXG4gIHNlbGVjdGVkRmllbGRzU3RyaW5nLFxuICBpbmNsdWRlZEZpZWxkc1N0cmluZyxcbiAgbmF0aXZlT2JqZWN0RmllbGRzXG4pID0+IHtcbiAgY29uc3QgaW5jbHVkZWRGaWVsZHMgPSBpbmNsdWRlZEZpZWxkc1N0cmluZ1xuICAgID8gaW5jbHVkZWRGaWVsZHNTdHJpbmcuc3BsaXQoJywnKVxuICAgIDogW107XG4gIGNvbnN0IHNlbGVjdGVkRmllbGRzID0gc2VsZWN0ZWRGaWVsZHNTdHJpbmdcbiAgICA/IHNlbGVjdGVkRmllbGRzU3RyaW5nLnNwbGl0KCcsJylcbiAgICA6IFtdO1xuICBjb25zdCBtaXNzaW5nRmllbGRzID0gc2VsZWN0ZWRGaWVsZHNcbiAgICAuZmlsdGVyKFxuICAgICAgZmllbGQgPT5cbiAgICAgICAgIW5hdGl2ZU9iamVjdEZpZWxkcy5pbmNsdWRlcyhmaWVsZCkgfHwgaW5jbHVkZWRGaWVsZHMuaW5jbHVkZXMoZmllbGQpXG4gICAgKVxuICAgIC5qb2luKCcsJyk7XG4gIGlmICghbWlzc2luZ0ZpZWxkcy5sZW5ndGgpIHtcbiAgICByZXR1cm4geyBuZWVkR2V0OiBmYWxzZSwga2V5czogJycgfTtcbiAgfSBlbHNlIHtcbiAgICByZXR1cm4geyBuZWVkR2V0OiB0cnVlLCBrZXlzOiBtaXNzaW5nRmllbGRzIH07XG4gIH1cbn07XG5cbmNvbnN0IGxvYWQgPSBmdW5jdGlvbihcbiAgcGFyc2VHcmFwaFFMU2NoZW1hLFxuICBwYXJzZUNsYXNzLFxuICBwYXJzZUNsYXNzQ29uZmlnOiA/UGFyc2VHcmFwaFFMQ2xhc3NDb25maWdcbikge1xuICBjb25zdCBjbGFzc05hbWUgPSBwYXJzZUNsYXNzLmNsYXNzTmFtZTtcbiAgY29uc3QgZ3JhcGhRTENsYXNzTmFtZSA9IHRyYW5zZm9ybUNsYXNzTmFtZVRvR3JhcGhRTChjbGFzc05hbWUpO1xuICBjb25zdCBnZXRHcmFwaFFMUXVlcnlOYW1lID1cbiAgICBncmFwaFFMQ2xhc3NOYW1lLmNoYXJBdCgwKS50b0xvd2VyQ2FzZSgpICsgZ3JhcGhRTENsYXNzTmFtZS5zbGljZSgxKTtcblxuICBjb25zdCB7XG4gICAgY3JlYXRlOiBpc0NyZWF0ZUVuYWJsZWQgPSB0cnVlLFxuICAgIHVwZGF0ZTogaXNVcGRhdGVFbmFibGVkID0gdHJ1ZSxcbiAgICBkZXN0cm95OiBpc0Rlc3Ryb3lFbmFibGVkID0gdHJ1ZSxcbiAgICBjcmVhdGVBbGlhczogY3JlYXRlQWxpYXMgPSAnJyxcbiAgICB1cGRhdGVBbGlhczogdXBkYXRlQWxpYXMgPSAnJyxcbiAgICBkZXN0cm95QWxpYXM6IGRlc3Ryb3lBbGlhcyA9ICcnLFxuICB9ID0gZ2V0UGFyc2VDbGFzc011dGF0aW9uQ29uZmlnKHBhcnNlQ2xhc3NDb25maWcpO1xuXG4gIGNvbnN0IHtcbiAgICBjbGFzc0dyYXBoUUxDcmVhdGVUeXBlLFxuICAgIGNsYXNzR3JhcGhRTFVwZGF0ZVR5cGUsXG4gICAgY2xhc3NHcmFwaFFMT3V0cHV0VHlwZSxcbiAgfSA9IHBhcnNlR3JhcGhRTFNjaGVtYS5wYXJzZUNsYXNzVHlwZXNbY2xhc3NOYW1lXTtcblxuICBpZiAoaXNDcmVhdGVFbmFibGVkKSB7XG4gICAgY29uc3QgY3JlYXRlR3JhcGhRTE11dGF0aW9uTmFtZSA9XG4gICAgICBjcmVhdGVBbGlhcyB8fCBgY3JlYXRlJHtncmFwaFFMQ2xhc3NOYW1lfWA7XG4gICAgY29uc3QgY3JlYXRlR3JhcGhRTE11dGF0aW9uID0gbXV0YXRpb25XaXRoQ2xpZW50TXV0YXRpb25JZCh7XG4gICAgICBuYW1lOiBgQ3JlYXRlJHtncmFwaFFMQ2xhc3NOYW1lfWAsXG4gICAgICBkZXNjcmlwdGlvbjogYFRoZSAke2NyZWF0ZUdyYXBoUUxNdXRhdGlvbk5hbWV9IG11dGF0aW9uIGNhbiBiZSB1c2VkIHRvIGNyZWF0ZSBhIG5ldyBvYmplY3Qgb2YgdGhlICR7Z3JhcGhRTENsYXNzTmFtZX0gY2xhc3MuYCxcbiAgICAgIGlucHV0RmllbGRzOiB7XG4gICAgICAgIGZpZWxkczoge1xuICAgICAgICAgIGRlc2NyaXB0aW9uOlxuICAgICAgICAgICAgJ1RoZXNlIGFyZSB0aGUgZmllbGRzIHRoYXQgd2lsbCBiZSB1c2VkIHRvIGNyZWF0ZSB0aGUgbmV3IG9iamVjdC4nLFxuICAgICAgICAgIHR5cGU6IGNsYXNzR3JhcGhRTENyZWF0ZVR5cGUgfHwgZGVmYXVsdEdyYXBoUUxUeXBlcy5PQkpFQ1QsXG4gICAgICAgIH0sXG4gICAgICB9LFxuICAgICAgb3V0cHV0RmllbGRzOiB7XG4gICAgICAgIFtnZXRHcmFwaFFMUXVlcnlOYW1lXToge1xuICAgICAgICAgIGRlc2NyaXB0aW9uOiAnVGhpcyBpcyB0aGUgY3JlYXRlZCBvYmplY3QuJyxcbiAgICAgICAgICB0eXBlOiBuZXcgR3JhcGhRTE5vbk51bGwoXG4gICAgICAgICAgICBjbGFzc0dyYXBoUUxPdXRwdXRUeXBlIHx8IGRlZmF1bHRHcmFwaFFMVHlwZXMuT0JKRUNUXG4gICAgICAgICAgKSxcbiAgICAgICAgfSxcbiAgICAgIH0sXG4gICAgICBtdXRhdGVBbmRHZXRQYXlsb2FkOiBhc3luYyAoYXJncywgY29udGV4dCwgbXV0YXRpb25JbmZvKSA9PiB7XG4gICAgICAgIHRyeSB7XG4gICAgICAgICAgbGV0IHsgZmllbGRzIH0gPSBhcmdzO1xuICAgICAgICAgIGlmICghZmllbGRzKSBmaWVsZHMgPSB7fTtcbiAgICAgICAgICBjb25zdCB7IGNvbmZpZywgYXV0aCwgaW5mbyB9ID0gY29udGV4dDtcblxuICAgICAgICAgIGNvbnN0IHBhcnNlRmllbGRzID0gYXdhaXQgdHJhbnNmb3JtVHlwZXMoJ2NyZWF0ZScsIGZpZWxkcywge1xuICAgICAgICAgICAgY2xhc3NOYW1lLFxuICAgICAgICAgICAgcGFyc2VHcmFwaFFMU2NoZW1hLFxuICAgICAgICAgICAgcmVxOiB7IGNvbmZpZywgYXV0aCwgaW5mbyB9LFxuICAgICAgICAgIH0pO1xuXG4gICAgICAgICAgY29uc3QgY3JlYXRlZE9iamVjdCA9IGF3YWl0IG9iamVjdHNNdXRhdGlvbnMuY3JlYXRlT2JqZWN0KFxuICAgICAgICAgICAgY2xhc3NOYW1lLFxuICAgICAgICAgICAgcGFyc2VGaWVsZHMsXG4gICAgICAgICAgICBjb25maWcsXG4gICAgICAgICAgICBhdXRoLFxuICAgICAgICAgICAgaW5mb1xuICAgICAgICAgICk7XG4gICAgICAgICAgY29uc3Qgc2VsZWN0ZWRGaWVsZHMgPSBnZXRGaWVsZE5hbWVzKG11dGF0aW9uSW5mbylcbiAgICAgICAgICAgIC5maWx0ZXIoZmllbGQgPT4gZmllbGQuc3RhcnRzV2l0aChgJHtnZXRHcmFwaFFMUXVlcnlOYW1lfS5gKSlcbiAgICAgICAgICAgIC5tYXAoZmllbGQgPT4gZmllbGQucmVwbGFjZShgJHtnZXRHcmFwaFFMUXVlcnlOYW1lfS5gLCAnJykpO1xuICAgICAgICAgIGNvbnN0IHsga2V5cywgaW5jbHVkZSB9ID0gZXh0cmFjdEtleXNBbmRJbmNsdWRlKHNlbGVjdGVkRmllbGRzKTtcbiAgICAgICAgICBjb25zdCB7IGtleXM6IHJlcXVpcmVkS2V5cywgbmVlZEdldCB9ID0gZ2V0T25seVJlcXVpcmVkRmllbGRzKFxuICAgICAgICAgICAgZmllbGRzLFxuICAgICAgICAgICAga2V5cyxcbiAgICAgICAgICAgIGluY2x1ZGUsXG4gICAgICAgICAgICBbJ2lkJywgJ29iamVjdElkJywgJ2NyZWF0ZWRBdCcsICd1cGRhdGVkQXQnXVxuICAgICAgICAgICk7XG4gICAgICAgICAgY29uc3QgbmVlZFRvR2V0QWxsS2V5cyA9IG9iamVjdHNRdWVyaWVzLm5lZWRUb0dldEFsbEtleXMoXG4gICAgICAgICAgICBwYXJzZUNsYXNzLmZpZWxkcyxcbiAgICAgICAgICAgIGtleXNcbiAgICAgICAgICApO1xuICAgICAgICAgIGxldCBvcHRpbWl6ZWRPYmplY3QgPSB7fTtcbiAgICAgICAgICBpZiAobmVlZEdldCAmJiAhbmVlZFRvR2V0QWxsS2V5cykge1xuICAgICAgICAgICAgb3B0aW1pemVkT2JqZWN0ID0gYXdhaXQgb2JqZWN0c1F1ZXJpZXMuZ2V0T2JqZWN0KFxuICAgICAgICAgICAgICBjbGFzc05hbWUsXG4gICAgICAgICAgICAgIGNyZWF0ZWRPYmplY3Qub2JqZWN0SWQsXG4gICAgICAgICAgICAgIHJlcXVpcmVkS2V5cyxcbiAgICAgICAgICAgICAgaW5jbHVkZSxcbiAgICAgICAgICAgICAgdW5kZWZpbmVkLFxuICAgICAgICAgICAgICB1bmRlZmluZWQsXG4gICAgICAgICAgICAgIGNvbmZpZyxcbiAgICAgICAgICAgICAgYXV0aCxcbiAgICAgICAgICAgICAgaW5mbyxcbiAgICAgICAgICAgICAgcGFyc2VDbGFzc1xuICAgICAgICAgICAgKTtcbiAgICAgICAgICB9IGVsc2UgaWYgKG5lZWRUb0dldEFsbEtleXMpIHtcbiAgICAgICAgICAgIG9wdGltaXplZE9iamVjdCA9IGF3YWl0IG9iamVjdHNRdWVyaWVzLmdldE9iamVjdChcbiAgICAgICAgICAgICAgY2xhc3NOYW1lLFxuICAgICAgICAgICAgICBjcmVhdGVkT2JqZWN0Lm9iamVjdElkLFxuICAgICAgICAgICAgICB1bmRlZmluZWQsXG4gICAgICAgICAgICAgIGluY2x1ZGUsXG4gICAgICAgICAgICAgIHVuZGVmaW5lZCxcbiAgICAgICAgICAgICAgdW5kZWZpbmVkLFxuICAgICAgICAgICAgICBjb25maWcsXG4gICAgICAgICAgICAgIGF1dGgsXG4gICAgICAgICAgICAgIGluZm8sXG4gICAgICAgICAgICAgIHBhcnNlQ2xhc3NcbiAgICAgICAgICAgICk7XG4gICAgICAgICAgfVxuICAgICAgICAgIHJldHVybiB7XG4gICAgICAgICAgICBbZ2V0R3JhcGhRTFF1ZXJ5TmFtZV06IHtcbiAgICAgICAgICAgICAgLi4uY3JlYXRlZE9iamVjdCxcbiAgICAgICAgICAgICAgdXBkYXRlZEF0OiBjcmVhdGVkT2JqZWN0LmNyZWF0ZWRBdCxcbiAgICAgICAgICAgICAgLi4ucGFyc2VGaWVsZHMsXG4gICAgICAgICAgICAgIC4uLm9wdGltaXplZE9iamVjdCxcbiAgICAgICAgICAgIH0sXG4gICAgICAgICAgfTtcbiAgICAgICAgfSBjYXRjaCAoZSkge1xuICAgICAgICAgIHBhcnNlR3JhcGhRTFNjaGVtYS5oYW5kbGVFcnJvcihlKTtcbiAgICAgICAgfVxuICAgICAgfSxcbiAgICB9KTtcblxuICAgIGlmIChcbiAgICAgIHBhcnNlR3JhcGhRTFNjaGVtYS5hZGRHcmFwaFFMVHlwZShcbiAgICAgICAgY3JlYXRlR3JhcGhRTE11dGF0aW9uLmFyZ3MuaW5wdXQudHlwZS5vZlR5cGVcbiAgICAgICkgJiZcbiAgICAgIHBhcnNlR3JhcGhRTFNjaGVtYS5hZGRHcmFwaFFMVHlwZShjcmVhdGVHcmFwaFFMTXV0YXRpb24udHlwZSlcbiAgICApIHtcbiAgICAgIHBhcnNlR3JhcGhRTFNjaGVtYS5hZGRHcmFwaFFMTXV0YXRpb24oXG4gICAgICAgIGNyZWF0ZUdyYXBoUUxNdXRhdGlvbk5hbWUsXG4gICAgICAgIGNyZWF0ZUdyYXBoUUxNdXRhdGlvblxuICAgICAgKTtcbiAgICB9XG4gIH1cblxuICBpZiAoaXNVcGRhdGVFbmFibGVkKSB7XG4gICAgY29uc3QgdXBkYXRlR3JhcGhRTE11dGF0aW9uTmFtZSA9XG4gICAgICB1cGRhdGVBbGlhcyB8fCBgdXBkYXRlJHtncmFwaFFMQ2xhc3NOYW1lfWA7XG4gICAgY29uc3QgdXBkYXRlR3JhcGhRTE11dGF0aW9uID0gbXV0YXRpb25XaXRoQ2xpZW50TXV0YXRpb25JZCh7XG4gICAgICBuYW1lOiBgVXBkYXRlJHtncmFwaFFMQ2xhc3NOYW1lfWAsXG4gICAgICBkZXNjcmlwdGlvbjogYFRoZSAke3VwZGF0ZUdyYXBoUUxNdXRhdGlvbk5hbWV9IG11dGF0aW9uIGNhbiBiZSB1c2VkIHRvIHVwZGF0ZSBhbiBvYmplY3Qgb2YgdGhlICR7Z3JhcGhRTENsYXNzTmFtZX0gY2xhc3MuYCxcbiAgICAgIGlucHV0RmllbGRzOiB7XG4gICAgICAgIGlkOiBkZWZhdWx0R3JhcGhRTFR5cGVzLkdMT0JBTF9PUl9PQkpFQ1RfSURfQVRULFxuICAgICAgICBmaWVsZHM6IHtcbiAgICAgICAgICBkZXNjcmlwdGlvbjpcbiAgICAgICAgICAgICdUaGVzZSBhcmUgdGhlIGZpZWxkcyB0aGF0IHdpbGwgYmUgdXNlZCB0byB1cGRhdGUgdGhlIG9iamVjdC4nLFxuICAgICAgICAgIHR5cGU6IGNsYXNzR3JhcGhRTFVwZGF0ZVR5cGUgfHwgZGVmYXVsdEdyYXBoUUxUeXBlcy5PQkpFQ1QsXG4gICAgICAgIH0sXG4gICAgICB9LFxuICAgICAgb3V0cHV0RmllbGRzOiB7XG4gICAgICAgIFtnZXRHcmFwaFFMUXVlcnlOYW1lXToge1xuICAgICAgICAgIGRlc2NyaXB0aW9uOiAnVGhpcyBpcyB0aGUgdXBkYXRlZCBvYmplY3QuJyxcbiAgICAgICAgICB0eXBlOiBuZXcgR3JhcGhRTE5vbk51bGwoXG4gICAgICAgICAgICBjbGFzc0dyYXBoUUxPdXRwdXRUeXBlIHx8IGRlZmF1bHRHcmFwaFFMVHlwZXMuT0JKRUNUXG4gICAgICAgICAgKSxcbiAgICAgICAgfSxcbiAgICAgIH0sXG4gICAgICBtdXRhdGVBbmRHZXRQYXlsb2FkOiBhc3luYyAoYXJncywgY29udGV4dCwgbXV0YXRpb25JbmZvKSA9PiB7XG4gICAgICAgIHRyeSB7XG4gICAgICAgICAgbGV0IHsgaWQsIGZpZWxkcyB9ID0gYXJncztcbiAgICAgICAgICBpZiAoIWZpZWxkcykgZmllbGRzID0ge307XG4gICAgICAgICAgY29uc3QgeyBjb25maWcsIGF1dGgsIGluZm8gfSA9IGNvbnRleHQ7XG5cbiAgICAgICAgICBjb25zdCBnbG9iYWxJZE9iamVjdCA9IGZyb21HbG9iYWxJZChpZCk7XG5cbiAgICAgICAgICBpZiAoZ2xvYmFsSWRPYmplY3QudHlwZSA9PT0gY2xhc3NOYW1lKSB7XG4gICAgICAgICAgICBpZCA9IGdsb2JhbElkT2JqZWN0LmlkO1xuICAgICAgICAgIH1cblxuICAgICAgICAgIGNvbnN0IHBhcnNlRmllbGRzID0gYXdhaXQgdHJhbnNmb3JtVHlwZXMoJ3VwZGF0ZScsIGZpZWxkcywge1xuICAgICAgICAgICAgY2xhc3NOYW1lLFxuICAgICAgICAgICAgcGFyc2VHcmFwaFFMU2NoZW1hLFxuICAgICAgICAgICAgcmVxOiB7IGNvbmZpZywgYXV0aCwgaW5mbyB9LFxuICAgICAgICAgIH0pO1xuXG4gICAgICAgICAgY29uc3QgdXBkYXRlZE9iamVjdCA9IGF3YWl0IG9iamVjdHNNdXRhdGlvbnMudXBkYXRlT2JqZWN0KFxuICAgICAgICAgICAgY2xhc3NOYW1lLFxuICAgICAgICAgICAgaWQsXG4gICAgICAgICAgICBwYXJzZUZpZWxkcyxcbiAgICAgICAgICAgIGNvbmZpZyxcbiAgICAgICAgICAgIGF1dGgsXG4gICAgICAgICAgICBpbmZvXG4gICAgICAgICAgKTtcblxuICAgICAgICAgIGNvbnN0IHNlbGVjdGVkRmllbGRzID0gZ2V0RmllbGROYW1lcyhtdXRhdGlvbkluZm8pXG4gICAgICAgICAgICAuZmlsdGVyKGZpZWxkID0+IGZpZWxkLnN0YXJ0c1dpdGgoYCR7Z2V0R3JhcGhRTFF1ZXJ5TmFtZX0uYCkpXG4gICAgICAgICAgICAubWFwKGZpZWxkID0+IGZpZWxkLnJlcGxhY2UoYCR7Z2V0R3JhcGhRTFF1ZXJ5TmFtZX0uYCwgJycpKTtcbiAgICAgICAgICBjb25zdCB7IGtleXMsIGluY2x1ZGUgfSA9IGV4dHJhY3RLZXlzQW5kSW5jbHVkZShzZWxlY3RlZEZpZWxkcyk7XG4gICAgICAgICAgY29uc3QgeyBrZXlzOiByZXF1aXJlZEtleXMsIG5lZWRHZXQgfSA9IGdldE9ubHlSZXF1aXJlZEZpZWxkcyhcbiAgICAgICAgICAgIGZpZWxkcyxcbiAgICAgICAgICAgIGtleXMsXG4gICAgICAgICAgICBpbmNsdWRlLFxuICAgICAgICAgICAgWydpZCcsICdvYmplY3RJZCcsICd1cGRhdGVkQXQnXVxuICAgICAgICAgICk7XG4gICAgICAgICAgY29uc3QgbmVlZFRvR2V0QWxsS2V5cyA9IG9iamVjdHNRdWVyaWVzLm5lZWRUb0dldEFsbEtleXMoXG4gICAgICAgICAgICBwYXJzZUNsYXNzLmZpZWxkcyxcbiAgICAgICAgICAgIGtleXNcbiAgICAgICAgICApO1xuICAgICAgICAgIGxldCBvcHRpbWl6ZWRPYmplY3QgPSB7fTtcbiAgICAgICAgICBpZiAobmVlZEdldCAmJiAhbmVlZFRvR2V0QWxsS2V5cykge1xuICAgICAgICAgICAgb3B0aW1pemVkT2JqZWN0ID0gYXdhaXQgb2JqZWN0c1F1ZXJpZXMuZ2V0T2JqZWN0KFxuICAgICAgICAgICAgICBjbGFzc05hbWUsXG4gICAgICAgICAgICAgIGlkLFxuICAgICAgICAgICAgICByZXF1aXJlZEtleXMsXG4gICAgICAgICAgICAgIGluY2x1ZGUsXG4gICAgICAgICAgICAgIHVuZGVmaW5lZCxcbiAgICAgICAgICAgICAgdW5kZWZpbmVkLFxuICAgICAgICAgICAgICBjb25maWcsXG4gICAgICAgICAgICAgIGF1dGgsXG4gICAgICAgICAgICAgIGluZm8sXG4gICAgICAgICAgICAgIHBhcnNlQ2xhc3NcbiAgICAgICAgICAgICk7XG4gICAgICAgICAgfSBlbHNlIGlmIChuZWVkVG9HZXRBbGxLZXlzKSB7XG4gICAgICAgICAgICBvcHRpbWl6ZWRPYmplY3QgPSBhd2FpdCBvYmplY3RzUXVlcmllcy5nZXRPYmplY3QoXG4gICAgICAgICAgICAgIGNsYXNzTmFtZSxcbiAgICAgICAgICAgICAgaWQsXG4gICAgICAgICAgICAgIHVuZGVmaW5lZCxcbiAgICAgICAgICAgICAgaW5jbHVkZSxcbiAgICAgICAgICAgICAgdW5kZWZpbmVkLFxuICAgICAgICAgICAgICB1bmRlZmluZWQsXG4gICAgICAgICAgICAgIGNvbmZpZyxcbiAgICAgICAgICAgICAgYXV0aCxcbiAgICAgICAgICAgICAgaW5mbyxcbiAgICAgICAgICAgICAgcGFyc2VDbGFzc1xuICAgICAgICAgICAgKTtcbiAgICAgICAgICB9XG4gICAgICAgICAgcmV0dXJuIHtcbiAgICAgICAgICAgIFtnZXRHcmFwaFFMUXVlcnlOYW1lXToge1xuICAgICAgICAgICAgICBvYmplY3RJZDogaWQsXG4gICAgICAgICAgICAgIC4uLnVwZGF0ZWRPYmplY3QsXG4gICAgICAgICAgICAgIC4uLnBhcnNlRmllbGRzLFxuICAgICAgICAgICAgICAuLi5vcHRpbWl6ZWRPYmplY3QsXG4gICAgICAgICAgICB9LFxuICAgICAgICAgIH07XG4gICAgICAgIH0gY2F0Y2ggKGUpIHtcbiAgICAgICAgICBwYXJzZUdyYXBoUUxTY2hlbWEuaGFuZGxlRXJyb3IoZSk7XG4gICAgICAgIH1cbiAgICAgIH0sXG4gICAgfSk7XG5cbiAgICBpZiAoXG4gICAgICBwYXJzZUdyYXBoUUxTY2hlbWEuYWRkR3JhcGhRTFR5cGUoXG4gICAgICAgIHVwZGF0ZUdyYXBoUUxNdXRhdGlvbi5hcmdzLmlucHV0LnR5cGUub2ZUeXBlXG4gICAgICApICYmXG4gICAgICBwYXJzZUdyYXBoUUxTY2hlbWEuYWRkR3JhcGhRTFR5cGUodXBkYXRlR3JhcGhRTE11dGF0aW9uLnR5cGUpXG4gICAgKSB7XG4gICAgICBwYXJzZUdyYXBoUUxTY2hlbWEuYWRkR3JhcGhRTE11dGF0aW9uKFxuICAgICAgICB1cGRhdGVHcmFwaFFMTXV0YXRpb25OYW1lLFxuICAgICAgICB1cGRhdGVHcmFwaFFMTXV0YXRpb25cbiAgICAgICk7XG4gICAgfVxuICB9XG5cbiAgaWYgKGlzRGVzdHJveUVuYWJsZWQpIHtcbiAgICBjb25zdCBkZWxldGVHcmFwaFFMTXV0YXRpb25OYW1lID1cbiAgICAgIGRlc3Ryb3lBbGlhcyB8fCBgZGVsZXRlJHtncmFwaFFMQ2xhc3NOYW1lfWA7XG4gICAgY29uc3QgZGVsZXRlR3JhcGhRTE11dGF0aW9uID0gbXV0YXRpb25XaXRoQ2xpZW50TXV0YXRpb25JZCh7XG4gICAgICBuYW1lOiBgRGVsZXRlJHtncmFwaFFMQ2xhc3NOYW1lfWAsXG4gICAgICBkZXNjcmlwdGlvbjogYFRoZSAke2RlbGV0ZUdyYXBoUUxNdXRhdGlvbk5hbWV9IG11dGF0aW9uIGNhbiBiZSB1c2VkIHRvIGRlbGV0ZSBhbiBvYmplY3Qgb2YgdGhlICR7Z3JhcGhRTENsYXNzTmFtZX0gY2xhc3MuYCxcbiAgICAgIGlucHV0RmllbGRzOiB7XG4gICAgICAgIGlkOiBkZWZhdWx0R3JhcGhRTFR5cGVzLkdMT0JBTF9PUl9PQkpFQ1RfSURfQVRULFxuICAgICAgfSxcbiAgICAgIG91dHB1dEZpZWxkczoge1xuICAgICAgICBbZ2V0R3JhcGhRTFF1ZXJ5TmFtZV06IHtcbiAgICAgICAgICBkZXNjcmlwdGlvbjogJ1RoaXMgaXMgdGhlIGRlbGV0ZWQgb2JqZWN0LicsXG4gICAgICAgICAgdHlwZTogbmV3IEdyYXBoUUxOb25OdWxsKFxuICAgICAgICAgICAgY2xhc3NHcmFwaFFMT3V0cHV0VHlwZSB8fCBkZWZhdWx0R3JhcGhRTFR5cGVzLk9CSkVDVFxuICAgICAgICAgICksXG4gICAgICAgIH0sXG4gICAgICB9LFxuICAgICAgbXV0YXRlQW5kR2V0UGF5bG9hZDogYXN5bmMgKGFyZ3MsIGNvbnRleHQsIG11dGF0aW9uSW5mbykgPT4ge1xuICAgICAgICB0cnkge1xuICAgICAgICAgIGxldCB7IGlkIH0gPSBhcmdzO1xuICAgICAgICAgIGNvbnN0IHsgY29uZmlnLCBhdXRoLCBpbmZvIH0gPSBjb250ZXh0O1xuXG4gICAgICAgICAgY29uc3QgZ2xvYmFsSWRPYmplY3QgPSBmcm9tR2xvYmFsSWQoaWQpO1xuXG4gICAgICAgICAgaWYgKGdsb2JhbElkT2JqZWN0LnR5cGUgPT09IGNsYXNzTmFtZSkge1xuICAgICAgICAgICAgaWQgPSBnbG9iYWxJZE9iamVjdC5pZDtcbiAgICAgICAgICB9XG5cbiAgICAgICAgICBjb25zdCBzZWxlY3RlZEZpZWxkcyA9IGdldEZpZWxkTmFtZXMobXV0YXRpb25JbmZvKVxuICAgICAgICAgICAgLmZpbHRlcihmaWVsZCA9PiBmaWVsZC5zdGFydHNXaXRoKGAke2dldEdyYXBoUUxRdWVyeU5hbWV9LmApKVxuICAgICAgICAgICAgLm1hcChmaWVsZCA9PiBmaWVsZC5yZXBsYWNlKGAke2dldEdyYXBoUUxRdWVyeU5hbWV9LmAsICcnKSk7XG4gICAgICAgICAgY29uc3QgeyBrZXlzLCBpbmNsdWRlIH0gPSBleHRyYWN0S2V5c0FuZEluY2x1ZGUoc2VsZWN0ZWRGaWVsZHMpO1xuICAgICAgICAgIGxldCBvcHRpbWl6ZWRPYmplY3QgPSB7fTtcbiAgICAgICAgICBpZiAoXG4gICAgICAgICAgICBrZXlzICYmXG4gICAgICAgICAgICBrZXlzLnNwbGl0KCcsJykuZmlsdGVyKGtleSA9PiAhWydpZCcsICdvYmplY3RJZCddLmluY2x1ZGVzKGtleSkpXG4gICAgICAgICAgICAgIC5sZW5ndGggPiAwXG4gICAgICAgICAgKSB7XG4gICAgICAgICAgICBvcHRpbWl6ZWRPYmplY3QgPSBhd2FpdCBvYmplY3RzUXVlcmllcy5nZXRPYmplY3QoXG4gICAgICAgICAgICAgIGNsYXNzTmFtZSxcbiAgICAgICAgICAgICAgaWQsXG4gICAgICAgICAgICAgIGtleXMsXG4gICAgICAgICAgICAgIGluY2x1ZGUsXG4gICAgICAgICAgICAgIHVuZGVmaW5lZCxcbiAgICAgICAgICAgICAgdW5kZWZpbmVkLFxuICAgICAgICAgICAgICBjb25maWcsXG4gICAgICAgICAgICAgIGF1dGgsXG4gICAgICAgICAgICAgIGluZm8sXG4gICAgICAgICAgICAgIHBhcnNlQ2xhc3NcbiAgICAgICAgICAgICk7XG4gICAgICAgICAgfVxuICAgICAgICAgIGF3YWl0IG9iamVjdHNNdXRhdGlvbnMuZGVsZXRlT2JqZWN0KFxuICAgICAgICAgICAgY2xhc3NOYW1lLFxuICAgICAgICAgICAgaWQsXG4gICAgICAgICAgICBjb25maWcsXG4gICAgICAgICAgICBhdXRoLFxuICAgICAgICAgICAgaW5mb1xuICAgICAgICAgICk7XG4gICAgICAgICAgcmV0dXJuIHtcbiAgICAgICAgICAgIFtnZXRHcmFwaFFMUXVlcnlOYW1lXToge1xuICAgICAgICAgICAgICBvYmplY3RJZDogaWQsXG4gICAgICAgICAgICAgIC4uLm9wdGltaXplZE9iamVjdCxcbiAgICAgICAgICAgIH0sXG4gICAgICAgICAgfTtcbiAgICAgICAgfSBjYXRjaCAoZSkge1xuICAgICAgICAgIHBhcnNlR3JhcGhRTFNjaGVtYS5oYW5kbGVFcnJvcihlKTtcbiAgICAgICAgfVxuICAgICAgfSxcbiAgICB9KTtcblxuICAgIGlmIChcbiAgICAgIHBhcnNlR3JhcGhRTFNjaGVtYS5hZGRHcmFwaFFMVHlwZShcbiAgICAgICAgZGVsZXRlR3JhcGhRTE11dGF0aW9uLmFyZ3MuaW5wdXQudHlwZS5vZlR5cGVcbiAgICAgICkgJiZcbiAgICAgIHBhcnNlR3JhcGhRTFNjaGVtYS5hZGRHcmFwaFFMVHlwZShkZWxldGVHcmFwaFFMTXV0YXRpb24udHlwZSlcbiAgICApIHtcbiAgICAgIHBhcnNlR3JhcGhRTFNjaGVtYS5hZGRHcmFwaFFMTXV0YXRpb24oXG4gICAgICAgIGRlbGV0ZUdyYXBoUUxNdXRhdGlvbk5hbWUsXG4gICAgICAgIGRlbGV0ZUdyYXBoUUxNdXRhdGlvblxuICAgICAgKTtcbiAgICB9XG4gIH1cbn07XG5cbmV4cG9ydCB7IGxvYWQgfTtcbiJdfQ==