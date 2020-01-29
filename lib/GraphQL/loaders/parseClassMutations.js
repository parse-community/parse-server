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
          const hasCustomField = objectsQueries.hasCustomField(parseClass.fields, keys);
          let optimizedObject = {};

          if (needGet && !hasCustomField) {
            optimizedObject = await objectsQueries.getObject(className, createdObject.objectId, requiredKeys, include, undefined, undefined, config, auth, info, parseClass);
          } else if (hasCustomField) {
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
          const hasCustomField = objectsQueries.hasCustomField(parseClass.fields, keys);
          let optimizedObject = {};

          if (needGet && !hasCustomField) {
            optimizedObject = await objectsQueries.getObject(className, id, requiredKeys, include, undefined, undefined, config, auth, info, parseClass);
          } else if (hasCustomField) {
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
//# sourceMappingURL=data:application/json;charset=utf-8;base64,eyJ2ZXJzaW9uIjozLCJzb3VyY2VzIjpbIi4uLy4uLy4uL3NyYy9HcmFwaFFML2xvYWRlcnMvcGFyc2VDbGFzc011dGF0aW9ucy5qcyJdLCJuYW1lcyI6WyJnZXRPbmx5UmVxdWlyZWRGaWVsZHMiLCJ1cGRhdGVkRmllbGRzIiwic2VsZWN0ZWRGaWVsZHNTdHJpbmciLCJpbmNsdWRlZEZpZWxkc1N0cmluZyIsIm5hdGl2ZU9iamVjdEZpZWxkcyIsImluY2x1ZGVkRmllbGRzIiwic3BsaXQiLCJzZWxlY3RlZEZpZWxkcyIsIm1pc3NpbmdGaWVsZHMiLCJmaWx0ZXIiLCJmaWVsZCIsImluY2x1ZGVzIiwiam9pbiIsImxlbmd0aCIsIm5lZWRHZXQiLCJrZXlzIiwibG9hZCIsInBhcnNlR3JhcGhRTFNjaGVtYSIsInBhcnNlQ2xhc3MiLCJwYXJzZUNsYXNzQ29uZmlnIiwiY2xhc3NOYW1lIiwiZ3JhcGhRTENsYXNzTmFtZSIsImdldEdyYXBoUUxRdWVyeU5hbWUiLCJjaGFyQXQiLCJ0b0xvd2VyQ2FzZSIsInNsaWNlIiwiY3JlYXRlIiwiaXNDcmVhdGVFbmFibGVkIiwidXBkYXRlIiwiaXNVcGRhdGVFbmFibGVkIiwiZGVzdHJveSIsImlzRGVzdHJveUVuYWJsZWQiLCJjcmVhdGVBbGlhcyIsInVwZGF0ZUFsaWFzIiwiZGVzdHJveUFsaWFzIiwiY2xhc3NHcmFwaFFMQ3JlYXRlVHlwZSIsImNsYXNzR3JhcGhRTFVwZGF0ZVR5cGUiLCJjbGFzc0dyYXBoUUxPdXRwdXRUeXBlIiwicGFyc2VDbGFzc1R5cGVzIiwiY3JlYXRlR3JhcGhRTE11dGF0aW9uTmFtZSIsImNyZWF0ZUdyYXBoUUxNdXRhdGlvbiIsIm5hbWUiLCJkZXNjcmlwdGlvbiIsImlucHV0RmllbGRzIiwiZmllbGRzIiwidHlwZSIsImRlZmF1bHRHcmFwaFFMVHlwZXMiLCJPQkpFQ1QiLCJvdXRwdXRGaWVsZHMiLCJHcmFwaFFMTm9uTnVsbCIsIm11dGF0ZUFuZEdldFBheWxvYWQiLCJhcmdzIiwiY29udGV4dCIsIm11dGF0aW9uSW5mbyIsImNvbmZpZyIsImF1dGgiLCJpbmZvIiwicGFyc2VGaWVsZHMiLCJyZXEiLCJjcmVhdGVkT2JqZWN0Iiwib2JqZWN0c011dGF0aW9ucyIsImNyZWF0ZU9iamVjdCIsInN0YXJ0c1dpdGgiLCJtYXAiLCJyZXBsYWNlIiwiaW5jbHVkZSIsInJlcXVpcmVkS2V5cyIsImhhc0N1c3RvbUZpZWxkIiwib2JqZWN0c1F1ZXJpZXMiLCJvcHRpbWl6ZWRPYmplY3QiLCJnZXRPYmplY3QiLCJvYmplY3RJZCIsInVuZGVmaW5lZCIsInVwZGF0ZWRBdCIsImNyZWF0ZWRBdCIsImUiLCJoYW5kbGVFcnJvciIsImFkZEdyYXBoUUxUeXBlIiwiaW5wdXQiLCJvZlR5cGUiLCJhZGRHcmFwaFFMTXV0YXRpb24iLCJ1cGRhdGVHcmFwaFFMTXV0YXRpb25OYW1lIiwidXBkYXRlR3JhcGhRTE11dGF0aW9uIiwiaWQiLCJHTE9CQUxfT1JfT0JKRUNUX0lEX0FUVCIsImdsb2JhbElkT2JqZWN0IiwidXBkYXRlZE9iamVjdCIsInVwZGF0ZU9iamVjdCIsImRlbGV0ZUdyYXBoUUxNdXRhdGlvbk5hbWUiLCJkZWxldGVHcmFwaFFMTXV0YXRpb24iLCJrZXkiLCJkZWxldGVPYmplY3QiXSwibWFwcGluZ3MiOiI7Ozs7Ozs7QUFBQTs7QUFDQTs7QUFDQTs7QUFDQTs7QUFDQTs7QUFJQTs7QUFDQTs7QUFDQTs7QUFDQTs7QUFDQTs7Ozs7Ozs7Ozs7Ozs7QUFFQSxNQUFNQSxxQkFBcUIsR0FBRyxDQUM1QkMsYUFENEIsRUFFNUJDLG9CQUY0QixFQUc1QkMsb0JBSDRCLEVBSTVCQyxrQkFKNEIsS0FLekI7QUFDSCxRQUFNQyxjQUFjLEdBQUdGLG9CQUFvQixHQUN2Q0Esb0JBQW9CLENBQUNHLEtBQXJCLENBQTJCLEdBQTNCLENBRHVDLEdBRXZDLEVBRko7QUFHQSxRQUFNQyxjQUFjLEdBQUdMLG9CQUFvQixHQUN2Q0Esb0JBQW9CLENBQUNJLEtBQXJCLENBQTJCLEdBQTNCLENBRHVDLEdBRXZDLEVBRko7QUFHQSxRQUFNRSxhQUFhLEdBQUdELGNB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QixLQUEzQixDQUFpQ2pDLElBQWpDLENBQXNDa0MsTUFEeEMsS0FHQTlELGtCQUFrQixDQUFDNEQsY0FBbkIsQ0FBa0NZLHFCQUFxQixDQUFDNUMsSUFBeEQsQ0FKRixFQUtFO0FBQ0E1QixNQUFBQSxrQkFBa0IsQ0FBQytELGtCQUFuQixDQUNFUSx5QkFERixFQUVFQyxxQkFGRjtBQUlEO0FBQ0Y7QUFDRixDQTlVRCIsInNvdXJjZXNDb250ZW50IjpbImltcG9ydCB7IEdyYXBoUUxOb25OdWxsIH0gZnJvbSAnZ3JhcGhxbCc7XG5pbXBvcnQgeyBmcm9tR2xvYmFsSWQsIG11dGF0aW9uV2l0aENsaWVudE11dGF0aW9uSWQgfSBmcm9tICdncmFwaHFsLXJlbGF5JztcbmltcG9ydCBnZXRGaWVsZE5hbWVzIGZyb20gJ2dyYXBocWwtbGlzdC1maWVsZHMnO1xuaW1wb3J0ICogYXMgZGVmYXVsdEdyYXBoUUxUeXBlcyBmcm9tICcuL2RlZmF1bHRHcmFwaFFMVHlwZXMnO1xuaW1wb3J0IHtcbiAgZXh0cmFjdEtleXNBbmRJbmNsdWRlLFxuICBnZXRQYXJzZUNsYXNzTXV0YXRpb25Db25maWcsXG59IGZyb20gJy4uL3BhcnNlR3JhcGhRTFV0aWxzJztcbmltcG9ydCAqIGFzIG9iamVjdHNNdXRhdGlvbnMgZnJvbSAnLi4vaGVscGVycy9vYmplY3RzTXV0YXRpb25zJztcbmltcG9ydCAqIGFzIG9iamVjdHNRdWVyaWVzIGZyb20gJy4uL2hlbHBlcnMvb2JqZWN0c1F1ZXJpZXMnO1xuaW1wb3J0IHsgUGFyc2VHcmFwaFFMQ2xhc3NDb25maWcgfSBmcm9tICcuLi8uLi9Db250cm9sbGVycy9QYXJzZUdyYXBoUUxDb250cm9sbGVyJztcbmltcG9ydCB7IHRyYW5zZm9ybUNsYXNzTmFtZVRvR3JhcGhRTCB9IGZyb20gJy4uL3RyYW5zZm9ybWVycy9jbGFzc05hbWUnO1xuaW1wb3J0IHsgdHJhbnNmb3JtVHlwZXMgfSBmcm9tICcuLi90cmFuc2Zvcm1lcnMvbXV0YXRpb24nO1xuXG5jb25zdCBnZXRPbmx5UmVxdWlyZWRGaWVsZHMgPSAoXG4gIHVwZGF0ZWRGaWVsZHMsXG4gIHNlbGVjdGVkRmllbGRzU3RyaW5nLFxuICBpbmNsdWRlZEZpZWxkc1N0cmluZyxcbiAgbmF0aXZlT2JqZWN0RmllbGRzXG4pID0+IHtcbiAgY29uc3QgaW5jbHVkZWRGaWVsZHMgPSBpbmNsdWRlZEZpZWxkc1N0cmluZ1xuICAgID8gaW5jbHVkZWRGaWVsZHNTdHJpbmcuc3BsaXQoJywnKVxuICAgIDogW107XG4gIGNvbnN0IHNlbGVjdGVkRmllbGRzID0gc2VsZWN0ZWRGaWVsZHNTdHJpbmdcbiAgICA/IHNlbGVjdGVkRmllbGRzU3RyaW5nLnNwbGl0KCcsJylcbiAgICA6IFtdO1xuICBjb25zdCBtaXNzaW5nRmllbGRzID0gc2VsZWN0ZWRGaWVsZHNcbiAgICAuZmlsdGVyKFxuICAgICAgZmllbGQgPT5cbiAgICAgICAgIW5hdGl2ZU9iamVjdEZpZWxkcy5pbmNsdWRlcyhmaWVsZCkgfHwgaW5jbHVkZWRGaWVsZHMuaW5jbHVkZXMoZmllbGQpXG4gICAgKVxuICAgIC5qb2luKCcsJyk7XG4gIGlmICghbWlzc2luZ0ZpZWxkcy5sZW5ndGgpIHtcbiAgICByZXR1cm4geyBuZWVkR2V0OiBmYWxzZSwga2V5czogJycgfTtcbiAgfSBlbHNlIHtcbiAgICByZXR1cm4geyBuZWVkR2V0OiB0cnVlLCBrZXlzOiBtaXNzaW5nRmllbGRzIH07XG4gIH1cbn07XG5cbmNvbnN0IGxvYWQgPSBmdW5jdGlvbihcbiAgcGFyc2VHcmFwaFFMU2NoZW1hLFxuICBwYXJzZUNsYXNzLFxuICBwYXJzZUNsYXNzQ29uZmlnOiA/UGFyc2VHcmFwaFFMQ2xhc3NDb25maWdcbikge1xuICBjb25zdCBjbGFzc05hbWUgPSBwYXJzZUNsYXNzLmNsYXNzTmFtZTtcbiAgY29uc3QgZ3JhcGhRTENsYXNzTmFtZSA9IHRyYW5zZm9ybUNsYXNzTmFtZVRvR3JhcGhRTChjbGFzc05hbWUpO1xuICBjb25zdCBnZXRHcmFwaFFMUXVlcnlOYW1lID1cbiAgICBncmFwaFFMQ2xhc3NOYW1lLmNoYXJBdCgwKS50b0xvd2VyQ2FzZSgpICsgZ3JhcGhRTENsYXNzTmFtZS5zbGljZSgxKTtcblxuICBjb25zdCB7XG4gICAgY3JlYXRlOiBpc0NyZWF0ZUVuYWJsZWQgPSB0cnVlLFxuICAgIHVwZGF0ZTogaXNVcGRhdGVFbmFibGVkID0gdHJ1ZSxcbiAgICBkZXN0cm95OiBpc0Rlc3Ryb3lFbmFibGVkID0gdHJ1ZSxcbiAgICBjcmVhdGVBbGlhczogY3JlYXRlQWxpYXMgPSAnJyxcbiAgICB1cGRhdGVBbGlhczogdXBkYXRlQWxpYXMgPSAnJyxcbiAgICBkZXN0cm95QWxpYXM6IGRlc3Ryb3lBbGlhcyA9ICcnLFxuICB9ID0gZ2V0UGFyc2VDbGFzc011dGF0aW9uQ29uZmlnKHBhcnNlQ2xhc3NDb25maWcpO1xuXG4gIGNvbnN0IHtcbiAgICBjbGFzc0dyYXBoUUxDcmVhdGVUeXBlLFxuICAgIGNsYXNzR3JhcGhRTFVwZGF0ZVR5cGUsXG4gICAgY2xhc3NHcmFwaFFMT3V0cHV0VHlwZSxcbiAgfSA9IHBhcnNlR3JhcGhRTFNjaGVtYS5wYXJzZUNsYXNzVHlwZXNbY2xhc3NOYW1lXTtcblxuICBpZiAoaXNDcmVhdGVFbmFibGVkKSB7XG4gICAgY29uc3QgY3JlYXRlR3JhcGhRTE11dGF0aW9uTmFtZSA9XG4gICAgICBjcmVhdGVBbGlhcyB8fCBgY3JlYXRlJHtncmFwaFFMQ2xhc3NOYW1lfWA7XG4gICAgY29uc3QgY3JlYXRlR3JhcGhRTE11dGF0aW9uID0gbXV0YXRpb25XaXRoQ2xpZW50TXV0YXRpb25JZCh7XG4gICAgICBuYW1lOiBgQ3JlYXRlJHtncmFwaFFMQ2xhc3NOYW1lfWAsXG4gICAgICBkZXNjcmlwdGlvbjogYFRoZSAke2NyZWF0ZUdyYXBoUUxNdXRhdGlvbk5hbWV9IG11dGF0aW9uIGNhbiBiZSB1c2VkIHRvIGNyZWF0ZSBhIG5ldyBvYmplY3Qgb2YgdGhlICR7Z3JhcGhRTENsYXNzTmFtZX0gY2xhc3MuYCxcbiAgICAgIGlucHV0RmllbGRzOiB7XG4gICAgICAgIGZpZWxkczoge1xuICAgICAgICAgIGRlc2NyaXB0aW9uOlxuICAgICAgICAgICAgJ1RoZXNlIGFyZSB0aGUgZmllbGRzIHRoYXQgd2lsbCBiZSB1c2VkIHRvIGNyZWF0ZSB0aGUgbmV3IG9iamVjdC4nLFxuICAgICAgICAgIHR5cGU6IGNsYXNzR3JhcGhRTENyZWF0ZVR5cGUgfHwgZGVmYXVsdEdyYXBoUUxUeXBlcy5PQkpFQ1QsXG4gICAgICAgIH0sXG4gICAgICB9LFxuICAgICAgb3V0cHV0RmllbGRzOiB7XG4gICAgICAgIFtnZXRHcmFwaFFMUXVlcnlOYW1lXToge1xuICAgICAgICAgIGRlc2NyaXB0aW9uOiAnVGhpcyBpcyB0aGUgY3JlYXRlZCBvYmplY3QuJyxcbiAgICAgICAgICB0eXBlOiBuZXcgR3JhcGhRTE5vbk51bGwoXG4gICAgICAgICAgICBjbGFzc0dyYXBoUUxPdXRwdXRUeXBlIHx8IGRlZmF1bHRHcmFwaFFMVHlwZXMuT0JKRUNUXG4gICAgICAgICAgKSxcbiAgICAgICAgfSxcbiAgICAgIH0sXG4gICAgICBtdXRhdGVBbmRHZXRQYXlsb2FkOiBhc3luYyAoYXJncywgY29udGV4dCwgbXV0YXRpb25JbmZvKSA9PiB7XG4gICAgICAgIHRyeSB7XG4gICAgICAgICAgbGV0IHsgZmllbGRzIH0gPSBhcmdzO1xuICAgICAgICAgIGlmICghZmllbGRzKSBmaWVsZHMgPSB7fTtcbiAgICAgICAgICBjb25zdCB7IGNvbmZpZywgYXV0aCwgaW5mbyB9ID0gY29udGV4dDtcblxuICAgICAgICAgIGNvbnN0IHBhcnNlRmllbGRzID0gYXdhaXQgdHJhbnNmb3JtVHlwZXMoJ2NyZWF0ZScsIGZpZWxkcywge1xuICAgICAgICAgICAgY2xhc3NOYW1lLFxuICAgICAgICAgICAgcGFyc2VHcmFwaFFMU2NoZW1hLFxuICAgICAgICAgICAgcmVxOiB7IGNvbmZpZywgYXV0aCwgaW5mbyB9LFxuICAgICAgICAgIH0pO1xuXG4gICAgICAgICAgY29uc3QgY3JlYXRlZE9iamVjdCA9IGF3YWl0IG9iamVjdHNNdXRhdGlvbnMuY3JlYXRlT2JqZWN0KFxuICAgICAgICAgICAgY2xhc3NOYW1lLFxuICAgICAgICAgICAgcGFyc2VGaWVsZHMsXG4gICAgICAgICAgICBjb25maWcsXG4gICAgICAgICAgICBhdXRoLFxuICAgICAgICAgICAgaW5mb1xuICAgICAgICAgICk7XG4gICAgICAgICAgY29uc3Qgc2VsZWN0ZWRGaWVsZHMgPSBnZXRGaWVsZE5hbWVzKG11dGF0aW9uSW5mbylcbiAgICAgICAgICAgIC5maWx0ZXIoZmllbGQgPT4gZmllbGQuc3RhcnRzV2l0aChgJHtnZXRHcmFwaFFMUXVlcnlOYW1lfS5gKSlcbiAgICAgICAgICAgIC5tYXAoZmllbGQgPT4gZmllbGQucmVwbGFjZShgJHtnZXRHcmFwaFFMUXVlcnlOYW1lfS5gLCAnJykpO1xuICAgICAgICAgIGNvbnN0IHsga2V5cywgaW5jbHVkZSB9ID0gZXh0cmFjdEtleXNBbmRJbmNsdWRlKHNlbGVjdGVkRmllbGRzKTtcbiAgICAgICAgICBjb25zdCB7IGtleXM6IHJlcXVpcmVkS2V5cywgbmVlZEdldCB9ID0gZ2V0T25seVJlcXVpcmVkRmllbGRzKFxuICAgICAgICAgICAgZmllbGRzLFxuICAgICAgICAgICAga2V5cyxcbiAgICAgICAgICAgIGluY2x1ZGUsXG4gICAgICAgICAgICBbJ2lkJywgJ29iamVjdElkJywgJ2NyZWF0ZWRBdCcsICd1cGRhdGVkQXQnXVxuICAgICAgICAgICk7XG4gICAgICAgICAgY29uc3QgaGFzQ3VzdG9tRmllbGQgPSBvYmplY3RzUXVlcmllcy5oYXNDdXN0b21GaWVsZChcbiAgICAgICAgICAgIHBhcnNlQ2xhc3MuZmllbGRzLFxuICAgICAgICAgICAga2V5c1xuICAgICAgICAgICk7XG4gICAgICAgICAgbGV0IG9wdGltaXplZE9iamVjdCA9IHt9O1xuICAgICAgICAgIGlmIChuZWVkR2V0ICYmICFoYXNDdXN0b21GaWVsZCkge1xuICAgICAgICAgICAgb3B0aW1pemVkT2JqZWN0ID0gYXdhaXQgb2JqZWN0c1F1ZXJpZXMuZ2V0T2JqZWN0KFxuICAgICAgICAgICAgICBjbGFzc05hbWUsXG4gICAgICAgICAgICAgIGNyZWF0ZWRPYmplY3Qub2JqZWN0SWQsXG4gICAgICAgICAgICAgIHJlcXVpcmVkS2V5cyxcbiAgICAgICAgICAgICAgaW5jbHVkZSxcbiAgICAgICAgICAgICAgdW5kZWZpbmVkLFxuICAgICAgICAgICAgICB1bmRlZmluZWQsXG4gICAgICAgICAgICAgIGNvbmZpZyxcbiAgICAgICAgICAgICAgYXV0aCxcbiAgICAgICAgICAgICAgaW5mbyxcbiAgICAgICAgICAgICAgcGFyc2VDbGFzc1xuICAgICAgICAgICAgKTtcbiAgICAgICAgICB9IGVsc2UgaWYgKGhhc0N1c3RvbUZpZWxkKSB7XG4gICAgICAgICAgICBvcHRpbWl6ZWRPYmplY3QgPSBhd2FpdCBvYmplY3RzUXVlcmllcy5nZXRPYmplY3QoXG4gICAgICAgICAgICAgIGNsYXNzTmFtZSxcbiAgICAgICAgICAgICAgY3JlYXRlZE9iamVjdC5vYmplY3RJZCxcbiAgICAgICAgICAgICAgdW5kZWZpbmVkLFxuICAgICAgICAgICAgICBpbmNsdWRlLFxuICAgICAgICAgICAgICB1bmRlZmluZWQsXG4gICAgICAgICAgICAgIHVuZGVmaW5lZCxcbiAgICAgICAgICAgICAgY29uZmlnLFxuICAgICAgICAgICAgICBhdXRoLFxuICAgICAgICAgICAgICBpbmZvLFxuICAgICAgICAgICAgICBwYXJzZUNsYXNzXG4gICAgICAgICAgICApO1xuICAgICAgICAgIH1cbiAgICAgICAgICByZXR1cm4ge1xuICAgICAgICAgICAgW2dldEdyYXBoUUxRdWVyeU5hbWVdOiB7XG4gICAgICAgICAgICAgIC4uLmNyZWF0ZWRPYmplY3QsXG4gICAgICAgICAgICAgIHVwZGF0ZWRBdDogY3JlYXRlZE9iamVjdC5jcmVhdGVkQXQsXG4gICAgICAgICAgICAgIC4uLnBhcnNlRmllbGRzLFxuICAgICAgICAgICAgICAuLi5vcHRpbWl6ZWRPYmplY3QsXG4gICAgICAgICAgICB9LFxuICAgICAgICAgIH07XG4gICAgICAgIH0gY2F0Y2ggKGUpIHtcbiAgICAgICAgICBwYXJzZUdyYXBoUUxTY2hlbWEuaGFuZGxlRXJyb3IoZSk7XG4gICAgICAgIH1cbiAgICAgIH0sXG4gICAgfSk7XG5cbiAgICBpZiAoXG4gICAgICBwYXJzZUdyYXBoUUxTY2hlbWEuYWRkR3JhcGhRTFR5cGUoXG4gICAgICAgIGNyZWF0ZUdyYXBoUUxNdXRhdGlvbi5hcmdzLmlucHV0LnR5cGUub2ZUeXBlXG4gICAgICApICYmXG4gICAgICBwYXJzZUdyYXBoUUxTY2hlbWEuYWRkR3JhcGhRTFR5cGUoY3JlYXRlR3JhcGhRTE11dGF0aW9uLnR5cGUpXG4gICAgKSB7XG4gICAgICBwYXJzZUdyYXBoUUxTY2hlbWEuYWRkR3JhcGhRTE11dGF0aW9uKFxuICAgICAgICBjcmVhdGVHcmFwaFFMTXV0YXRpb25OYW1lLFxuICAgICAgICBjcmVhdGVHcmFwaFFMTXV0YXRpb25cbiAgICAgICk7XG4gICAgfVxuICB9XG5cbiAgaWYgKGlzVXBkYXRlRW5hYmxlZCkge1xuICAgIGNvbnN0IHVwZGF0ZUdyYXBoUUxNdXRhdGlvbk5hbWUgPVxuICAgICAgdXBkYXRlQWxpYXMgfHwgYHVwZGF0ZSR7Z3JhcGhRTENsYXNzTmFtZX1gO1xuICAgIGNvbnN0IHVwZGF0ZUdyYXBoUUxNdXRhdGlvbiA9IG11dGF0aW9uV2l0aENsaWVudE11dGF0aW9uSWQoe1xuICAgICAgbmFtZTogYFVwZGF0ZSR7Z3JhcGhRTENsYXNzTmFtZX1gLFxuICAgICAgZGVzY3JpcHRpb246IGBUaGUgJHt1cGRhdGVHcmFwaFFMTXV0YXRpb25OYW1lfSBtdXRhdGlvbiBjYW4gYmUgdXNlZCB0byB1cGRhdGUgYW4gb2JqZWN0IG9mIHRoZSAke2dyYXBoUUxDbGFzc05hbWV9IGNsYXNzLmAsXG4gICAgICBpbnB1dEZpZWxkczoge1xuICAgICAgICBpZDogZGVmYXVsdEdyYXBoUUxUeXBlcy5HTE9CQUxfT1JfT0JKRUNUX0lEX0FUVCxcbiAgICAgICAgZmllbGRzOiB7XG4gICAgICAgICAgZGVzY3JpcHRpb246XG4gICAgICAgICAgICAnVGhlc2UgYXJlIHRoZSBmaWVsZHMgdGhhdCB3aWxsIGJlIHVzZWQgdG8gdXBkYXRlIHRoZSBvYmplY3QuJyxcbiAgICAgICAgICB0eXBlOiBjbGFzc0dyYXBoUUxVcGRhdGVUeXBlIHx8IGRlZmF1bHRHcmFwaFFMVHlwZXMuT0JKRUNULFxuICAgICAgICB9LFxuICAgICAgfSxcbiAgICAgIG91dHB1dEZpZWxkczoge1xuICAgICAgICBbZ2V0R3JhcGhRTFF1ZXJ5TmFtZV06IHtcbiAgICAgICAgICBkZXNjcmlwdGlvbjogJ1RoaXMgaXMgdGhlIHVwZGF0ZWQgb2JqZWN0LicsXG4gICAgICAgICAgdHlwZTogbmV3IEdyYXBoUUxOb25OdWxsKFxuICAgICAgICAgICAgY2xhc3NHcmFwaFFMT3V0cHV0VHlwZSB8fCBkZWZhdWx0R3JhcGhRTFR5cGVzLk9CSkVDVFxuICAgICAgICAgICksXG4gICAgICAgIH0sXG4gICAgICB9LFxuICAgICAgbXV0YXRlQW5kR2V0UGF5bG9hZDogYXN5bmMgKGFyZ3MsIGNvbnRleHQsIG11dGF0aW9uSW5mbykgPT4ge1xuICAgICAgICB0cnkge1xuICAgICAgICAgIGxldCB7IGlkLCBmaWVsZHMgfSA9IGFyZ3M7XG4gICAgICAgICAgaWYgKCFmaWVsZHMpIGZpZWxkcyA9IHt9O1xuICAgICAgICAgIGNvbnN0IHsgY29uZmlnLCBhdXRoLCBpbmZvIH0gPSBjb250ZXh0O1xuXG4gICAgICAgICAgY29uc3QgZ2xvYmFsSWRPYmplY3QgPSBmcm9tR2xvYmFsSWQoaWQpO1xuXG4gICAgICAgICAgaWYgKGdsb2JhbElkT2JqZWN0LnR5cGUgPT09IGNsYXNzTmFtZSkge1xuICAgICAgICAgICAgaWQgPSBnbG9iYWxJZE9iamVjdC5pZDtcbiAgICAgICAgICB9XG5cbiAgICAgICAgICBjb25zdCBwYXJzZUZpZWxkcyA9IGF3YWl0IHRyYW5zZm9ybVR5cGVzKCd1cGRhdGUnLCBmaWVsZHMsIHtcbiAgICAgICAgICAgIGNsYXNzTmFtZSxcbiAgICAgICAgICAgIHBhcnNlR3JhcGhRTFNjaGVtYSxcbiAgICAgICAgICAgIHJlcTogeyBjb25maWcsIGF1dGgsIGluZm8gfSxcbiAgICAgICAgICB9KTtcblxuICAgICAgICAgIGNvbnN0IHVwZGF0ZWRPYmplY3QgPSBhd2FpdCBvYmplY3RzTXV0YXRpb25zLnVwZGF0ZU9iamVjdChcbiAgICAgICAgICAgIGNsYXNzTmFtZSxcbiAgICAgICAgICAgIGlkLFxuICAgICAgICAgICAgcGFyc2VGaWVsZHMsXG4gICAgICAgICAgICBjb25maWcsXG4gICAgICAgICAgICBhdXRoLFxuICAgICAgICAgICAgaW5mb1xuICAgICAgICAgICk7XG5cbiAgICAgICAgICBjb25zdCBzZWxlY3RlZEZpZWxkcyA9IGdldEZpZWxkTmFtZXMobXV0YXRpb25JbmZvKVxuICAgICAgICAgICAgLmZpbHRlcihmaWVsZCA9PiBmaWVsZC5zdGFydHNXaXRoKGAke2dldEdyYXBoUUxRdWVyeU5hbWV9LmApKVxuICAgICAgICAgICAgLm1hcChmaWVsZCA9PiBmaWVsZC5yZXBsYWNlKGAke2dldEdyYXBoUUxRdWVyeU5hbWV9LmAsICcnKSk7XG4gICAgICAgICAgY29uc3QgeyBrZXlzLCBpbmNsdWRlIH0gPSBleHRyYWN0S2V5c0FuZEluY2x1ZGUoc2VsZWN0ZWRGaWVsZHMpO1xuICAgICAgICAgIGNvbnN0IHsga2V5czogcmVxdWlyZWRLZXlzLCBuZWVkR2V0IH0gPSBnZXRPbmx5UmVxdWlyZWRGaWVsZHMoXG4gICAgICAgICAgICBmaWVsZHMsXG4gICAgICAgICAgICBrZXlzLFxuICAgICAgICAgICAgaW5jbHVkZSxcbiAgICAgICAgICAgIFsnaWQnLCAnb2JqZWN0SWQnLCAndXBkYXRlZEF0J11cbiAgICAgICAgICApO1xuICAgICAgICAgIGNvbnN0IGhhc0N1c3RvbUZpZWxkID0gb2JqZWN0c1F1ZXJpZXMuaGFzQ3VzdG9tRmllbGQoXG4gICAgICAgICAgICBwYXJzZUNsYXNzLmZpZWxkcyxcbiAgICAgICAgICAgIGtleXNcbiAgICAgICAgICApO1xuICAgICAgICAgIGxldCBvcHRpbWl6ZWRPYmplY3QgPSB7fTtcbiAgICAgICAgICBpZiAobmVlZEdldCAmJiAhaGFzQ3VzdG9tRmllbGQpIHtcbiAgICAgICAgICAgIG9wdGltaXplZE9iamVjdCA9IGF3YWl0IG9iamVjdHNRdWVyaWVzLmdldE9iamVjdChcbiAgICAgICAgICAgICAgY2xhc3NOYW1lLFxuICAgICAgICAgICAgICBpZCxcbiAgICAgICAgICAgICAgcmVxdWlyZWRLZXlzLFxuICAgICAgICAgICAgICBpbmNsdWRlLFxuICAgICAgICAgICAgICB1bmRlZmluZWQsXG4gICAgICAgICAgICAgIHVuZGVmaW5lZCxcbiAgICAgICAgICAgICAgY29uZmlnLFxuICAgICAgICAgICAgICBhdXRoLFxuICAgICAgICAgICAgICBpbmZvLFxuICAgICAgICAgICAgICBwYXJzZUNsYXNzXG4gICAgICAgICAgICApO1xuICAgICAgICAgIH0gZWxzZSBpZiAoaGFzQ3VzdG9tRmllbGQpIHtcbiAgICAgICAgICAgIG9wdGltaXplZE9iamVjdCA9IGF3YWl0IG9iamVjdHNRdWVyaWVzLmdldE9iamVjdChcbiAgICAgICAgICAgICAgY2xhc3NOYW1lLFxuICAgICAgICAgICAgICBpZCxcbiAgICAgICAgICAgICAgdW5kZWZpbmVkLFxuICAgICAgICAgICAgICBpbmNsdWRlLFxuICAgICAgICAgICAgICB1bmRlZmluZWQsXG4gICAgICAgICAgICAgIHVuZGVmaW5lZCxcbiAgICAgICAgICAgICAgY29uZmlnLFxuICAgICAgICAgICAgICBhdXRoLFxuICAgICAgICAgICAgICBpbmZvLFxuICAgICAgICAgICAgICBwYXJzZUNsYXNzXG4gICAgICAgICAgICApO1xuICAgICAgICAgIH1cbiAgICAgICAgICByZXR1cm4ge1xuICAgICAgICAgICAgW2dldEdyYXBoUUxRdWVyeU5hbWVdOiB7XG4gICAgICAgICAgICAgIG9iamVjdElkOiBpZCxcbiAgICAgICAgICAgICAgLi4udXBkYXRlZE9iamVjdCxcbiAgICAgICAgICAgICAgLi4ucGFyc2VGaWVsZHMsXG4gICAgICAgICAgICAgIC4uLm9wdGltaXplZE9iamVjdCxcbiAgICAgICAgICAgIH0sXG4gICAgICAgICAgfTtcbiAgICAgICAgfSBjYXRjaCAoZSkge1xuICAgICAgICAgIHBhcnNlR3JhcGhRTFNjaGVtYS5oYW5kbGVFcnJvcihlKTtcbiAgICAgICAgfVxuICAgICAgfSxcbiAgICB9KTtcblxuICAgIGlmIChcbiAgICAgIHBhcnNlR3JhcGhRTFNjaGVtYS5hZGRHcmFwaFFMVHlwZShcbiAgICAgICAgdXBkYXRlR3JhcGhRTE11dGF0aW9uLmFyZ3MuaW5wdXQudHlwZS5vZlR5cGVcbiAgICAgICkgJiZcbiAgICAgIHBhcnNlR3JhcGhRTFNjaGVtYS5hZGRHcmFwaFFMVHlwZSh1cGRhdGVHcmFwaFFMTXV0YXRpb24udHlwZSlcbiAgICApIHtcbiAgICAgIHBhcnNlR3JhcGhRTFNjaGVtYS5hZGRHcmFwaFFMTXV0YXRpb24oXG4gICAgICAgIHVwZGF0ZUdyYXBoUUxNdXRhdGlvbk5hbWUsXG4gICAgICAgIHVwZGF0ZUdyYXBoUUxNdXRhdGlvblxuICAgICAgKTtcbiAgICB9XG4gIH1cblxuICBpZiAoaXNEZXN0cm95RW5hYmxlZCkge1xuICAgIGNvbnN0IGRlbGV0ZUdyYXBoUUxNdXRhdGlvbk5hbWUgPVxuICAgICAgZGVzdHJveUFsaWFzIHx8IGBkZWxldGUke2dyYXBoUUxDbGFzc05hbWV9YDtcbiAgICBjb25zdCBkZWxldGVHcmFwaFFMTXV0YXRpb24gPSBtdXRhdGlvbldpdGhDbGllbnRNdXRhdGlvbklkKHtcbiAgICAgIG5hbWU6IGBEZWxldGUke2dyYXBoUUxDbGFzc05hbWV9YCxcbiAgICAgIGRlc2NyaXB0aW9uOiBgVGhlICR7ZGVsZXRlR3JhcGhRTE11dGF0aW9uTmFtZX0gbXV0YXRpb24gY2FuIGJlIHVzZWQgdG8gZGVsZXRlIGFuIG9iamVjdCBvZiB0aGUgJHtncmFwaFFMQ2xhc3NOYW1lfSBjbGFzcy5gLFxuICAgICAgaW5wdXRGaWVsZHM6IHtcbiAgICAgICAgaWQ6IGRlZmF1bHRHcmFwaFFMVHlwZXMuR0xPQkFMX09SX09CSkVDVF9JRF9BVFQsXG4gICAgICB9LFxuICAgICAgb3V0cHV0RmllbGRzOiB7XG4gICAgICAgIFtnZXRHcmFwaFFMUXVlcnlOYW1lXToge1xuICAgICAgICAgIGRlc2NyaXB0aW9uOiAnVGhpcyBpcyB0aGUgZGVsZXRlZCBvYmplY3QuJyxcbiAgICAgICAgICB0eXBlOiBuZXcgR3JhcGhRTE5vbk51bGwoXG4gICAgICAgICAgICBjbGFzc0dyYXBoUUxPdXRwdXRUeXBlIHx8IGRlZmF1bHRHcmFwaFFMVHlwZXMuT0JKRUNUXG4gICAgICAgICAgKSxcbiAgICAgICAgfSxcbiAgICAgIH0sXG4gICAgICBtdXRhdGVBbmRHZXRQYXlsb2FkOiBhc3luYyAoYXJncywgY29udGV4dCwgbXV0YXRpb25JbmZvKSA9PiB7XG4gICAgICAgIHRyeSB7XG4gICAgICAgICAgbGV0IHsgaWQgfSA9IGFyZ3M7XG4gICAgICAgICAgY29uc3QgeyBjb25maWcsIGF1dGgsIGluZm8gfSA9IGNvbnRleHQ7XG5cbiAgICAgICAgICBjb25zdCBnbG9iYWxJZE9iamVjdCA9IGZyb21HbG9iYWxJZChpZCk7XG5cbiAgICAgICAgICBpZiAoZ2xvYmFsSWRPYmplY3QudHlwZSA9PT0gY2xhc3NOYW1lKSB7XG4gICAgICAgICAgICBpZCA9IGdsb2JhbElkT2JqZWN0LmlkO1xuICAgICAgICAgIH1cblxuICAgICAgICAgIGNvbnN0IHNlbGVjdGVkRmllbGRzID0gZ2V0RmllbGROYW1lcyhtdXRhdGlvbkluZm8pXG4gICAgICAgICAgICAuZmlsdGVyKGZpZWxkID0+IGZpZWxkLnN0YXJ0c1dpdGgoYCR7Z2V0R3JhcGhRTFF1ZXJ5TmFtZX0uYCkpXG4gICAgICAgICAgICAubWFwKGZpZWxkID0+IGZpZWxkLnJlcGxhY2UoYCR7Z2V0R3JhcGhRTFF1ZXJ5TmFtZX0uYCwgJycpKTtcbiAgICAgICAgICBjb25zdCB7IGtleXMsIGluY2x1ZGUgfSA9IGV4dHJhY3RLZXlzQW5kSW5jbHVkZShzZWxlY3RlZEZpZWxkcyk7XG4gICAgICAgICAgbGV0IG9wdGltaXplZE9iamVjdCA9IHt9O1xuICAgICAgICAgIGlmIChcbiAgICAgICAgICAgIGtleXMgJiZcbiAgICAgICAgICAgIGtleXMuc3BsaXQoJywnKS5maWx0ZXIoa2V5ID0+ICFbJ2lkJywgJ29iamVjdElkJ10uaW5jbHVkZXMoa2V5KSlcbiAgICAgICAgICAgICAgLmxlbmd0aCA+IDBcbiAgICAgICAgICApIHtcbiAgICAgICAgICAgIG9wdGltaXplZE9iamVjdCA9IGF3YWl0IG9iamVjdHNRdWVyaWVzLmdldE9iamVjdChcbiAgICAgICAgICAgICAgY2xhc3NOYW1lLFxuICAgICAgICAgICAgICBpZCxcbiAgICAgICAgICAgICAga2V5cyxcbiAgICAgICAgICAgICAgaW5jbHVkZSxcbiAgICAgICAgICAgICAgdW5kZWZpbmVkLFxuICAgICAgICAgICAgICB1bmRlZmluZWQsXG4gICAgICAgICAgICAgIGNvbmZpZyxcbiAgICAgICAgICAgICAgYXV0aCxcbiAgICAgICAgICAgICAgaW5mbyxcbiAgICAgICAgICAgICAgcGFyc2VDbGFzc1xuICAgICAgICAgICAgKTtcbiAgICAgICAgICB9XG4gICAgICAgICAgYXdhaXQgb2JqZWN0c011dGF0aW9ucy5kZWxldGVPYmplY3QoXG4gICAgICAgICAgICBjbGFzc05hbWUsXG4gICAgICAgICAgICBpZCxcbiAgICAgICAgICAgIGNvbmZpZyxcbiAgICAgICAgICAgIGF1dGgsXG4gICAgICAgICAgICBpbmZvXG4gICAgICAgICAgKTtcbiAgICAgICAgICByZXR1cm4ge1xuICAgICAgICAgICAgW2dldEdyYXBoUUxRdWVyeU5hbWVdOiB7XG4gICAgICAgICAgICAgIG9iamVjdElkOiBpZCxcbiAgICAgICAgICAgICAgLi4ub3B0aW1pemVkT2JqZWN0LFxuICAgICAgICAgICAgfSxcbiAgICAgICAgICB9O1xuICAgICAgICB9IGNhdGNoIChlKSB7XG4gICAgICAgICAgcGFyc2VHcmFwaFFMU2NoZW1hLmhhbmRsZUVycm9yKGUpO1xuICAgICAgICB9XG4gICAgICB9LFxuICAgIH0pO1xuXG4gICAgaWYgKFxuICAgICAgcGFyc2VHcmFwaFFMU2NoZW1hLmFkZEdyYXBoUUxUeXBlKFxuICAgICAgICBkZWxldGVHcmFwaFFMTXV0YXRpb24uYXJncy5pbnB1dC50eXBlLm9mVHlwZVxuICAgICAgKSAmJlxuICAgICAgcGFyc2VHcmFwaFFMU2NoZW1hLmFkZEdyYXBoUUxUeXBlKGRlbGV0ZUdyYXBoUUxNdXRhdGlvbi50eXBlKVxuICAgICkge1xuICAgICAgcGFyc2VHcmFwaFFMU2NoZW1hLmFkZEdyYXBoUUxNdXRhdGlvbihcbiAgICAgICAgZGVsZXRlR3JhcGhRTE11dGF0aW9uTmFtZSxcbiAgICAgICAgZGVsZXRlR3JhcGhRTE11dGF0aW9uXG4gICAgICApO1xuICAgIH1cbiAgfVxufTtcblxuZXhwb3J0IHsgbG9hZCB9O1xuIl19