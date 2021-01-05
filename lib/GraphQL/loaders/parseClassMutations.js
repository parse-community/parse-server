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
//# sourceMappingURL=data:application/json;charset=utf-8;base64,eyJ2ZXJzaW9uIjozLCJzb3VyY2VzIjpbIi4uLy4uLy4uL3NyYy9HcmFwaFFML2xvYWRlcnMvcGFyc2VDbGFzc011dGF0aW9ucy5qcyJdLCJuYW1lcyI6WyJnZXRPbmx5UmVxdWlyZWRGaWVsZHMiLCJ1cGRhdGVkRmllbGRzIiwic2VsZWN0ZWRGaWVsZHNTdHJpbmciLCJpbmNsdWRlZEZpZWxkc1N0cmluZyIsIm5hdGl2ZU9iamVjdEZpZWxkcyIsImluY2x1ZGVkRmllbGRzIiwic3BsaXQiLCJzZWxlY3RlZEZpZWxkcyIsIm1pc3NpbmdGaWVsZHMiLCJmaWx0ZXIiLCJmaWVsZCIsImluY2x1ZGVzIiwiam9pbiIsImxlbmd0aCIsIm5lZWRHZXQiLCJrZXlzIiwibG9hZCIsInBhcnNlR3JhcGhRTFNjaGVtYSIsInBhcnNlQ2xhc3MiLCJwYXJzZUNsYXNzQ29uZmlnIiwiY2xhc3NOYW1lIiwiZ3JhcGhRTENsYXNzTmFtZSIsImdldEdyYXBoUUxRdWVyeU5hbWUiLCJjaGFyQXQiLCJ0b0xvd2VyQ2FzZSIsInNsaWNlIiwiY3JlYXRlIiwiaXNDcmVhdGVFbmFibGVkIiwidXBkYXRlIiwiaXNVcGRhdGVFbmFibGVkIiwiZGVzdHJveSIsImlzRGVzdHJveUVuYWJsZWQiLCJjcmVhdGVBbGlhcyIsInVwZGF0ZUFsaWFzIiwiZGVzdHJveUFsaWFzIiwiY2xhc3NHcmFwaFFMQ3JlYXRlVHlwZSIsImNsYXNzR3JhcGhRTFVwZGF0ZVR5cGUiLCJjbGFzc0dyYXBoUUxPdXRwdXRUeXBlIiwicGFyc2VDbGFzc1R5cGVzIiwiY3JlYXRlR3JhcGhRTE11dGF0aW9uTmFtZSIsImNyZWF0ZUdyYXBoUUxNdXRhdGlvbiIsIm5hbWUiLCJkZXNjcmlwdGlvbiIsImlucHV0RmllbGRzIiwiZmllbGRzIiwidHlwZSIsImRlZmF1bHRHcmFwaFFMVHlwZXMiLCJPQkpFQ1QiLCJvdXRwdXRGaWVsZHMiLCJHcmFwaFFMTm9uTnVsbCIsIm11dGF0ZUFuZEdldFBheWxvYWQiLCJhcmdzIiwiY29udGV4dCIsIm11dGF0aW9uSW5mbyIsImNvbmZpZyIsImF1dGgiLCJpbmZvIiwicGFyc2VGaWVsZHMiLCJyZXEiLCJjcmVhdGVkT2JqZWN0Iiwib2JqZWN0c011dGF0aW9ucyIsImNyZWF0ZU9iamVjdCIsInN0YXJ0c1dpdGgiLCJtYXAiLCJyZXBsYWNlIiwiaW5jbHVkZSIsInJlcXVpcmVkS2V5cyIsIm5lZWRUb0dldEFsbEtleXMiLCJvYmplY3RzUXVlcmllcyIsInBhcnNlQ2xhc3NlcyIsIm9wdGltaXplZE9iamVjdCIsImdldE9iamVjdCIsIm9iamVjdElkIiwidW5kZWZpbmVkIiwidXBkYXRlZEF0IiwiY3JlYXRlZEF0IiwiZSIsImhhbmRsZUVycm9yIiwiYWRkR3JhcGhRTFR5cGUiLCJpbnB1dCIsIm9mVHlwZSIsImFkZEdyYXBoUUxNdXRhdGlvbiIsInVwZGF0ZUdyYXBoUUxNdXRhdGlvbk5hbWUiLCJ1cGRhdGVHcmFwaFFMTXV0YXRpb24iLCJpZCIsIkdMT0JBTF9PUl9PQkpFQ1RfSURfQVRUIiwiZ2xvYmFsSWRPYmplY3QiLCJ1cGRhdGVkT2JqZWN0IiwidXBkYXRlT2JqZWN0IiwiZGVsZXRlR3JhcGhRTE11dGF0aW9uTmFtZSIsImRlbGV0ZUdyYXBoUUxNdXRhdGlvbiIsImtleSIsImRlbGV0ZU9iamVjdCJdLCJtYXBwaW5ncyI6Ijs7Ozs7OztBQUFBOztBQUNBOztBQUNBOztBQUNBOztBQUNBOztBQUNBOztBQUNBOztBQUNBOztBQUNBOztBQUNBOzs7Ozs7Ozs7Ozs7OztBQUVBLE1BQU1BLHFCQUFxQixHQUFHLENBQzVCQyxhQUQ0QixFQUU1QkMsb0JBRjRCLEVBRzVCQyxvQkFINEIsRUFJNUJDLGtCQUo0QixLQUt6QjtBQUNILFFBQU1DLGNBQWMsR0FBR0Ysb0JBQW9CLEdBQUdBLG9CQUFvQixDQUFDRyxLQUFyQixDQUEyQixHQUEzQixDQUFILEdBQXFDLEVBQWhGO0FBQ0EsUUFBTUMsY0FBYyxHQUFHTCxvQkFBb0IsR0FBR0Esb0JBQW9CLENBQUNJLEtBQXJCLENBQTJCLEdBQTNCLENBQUgsR0FBcUMsRUFBaEY7QUFDQSxRQUFN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RCxDQW9DRSxPQUFPTSxDQUFQLEVBQVU7QUFDVjNELFVBQUFBLGtCQUFrQixDQUFDNEQsV0FBbkIsQ0FBK0JELENBQS9CO0FBQ0Q7QUFDRjtBQXBEd0QsS0FBN0IsQ0FBOUI7O0FBdURBLFFBQ0UzRCxrQkFBa0IsQ0FBQzZELGNBQW5CLENBQWtDWSxxQkFBcUIsQ0FBQ3ZDLElBQXRCLENBQTJCNEIsS0FBM0IsQ0FBaUNsQyxJQUFqQyxDQUFzQ21DLE1BQXhFLEtBQ0EvRCxrQkFBa0IsQ0FBQzZELGNBQW5CLENBQWtDWSxxQkFBcUIsQ0FBQzdDLElBQXhELENBRkYsRUFHRTtBQUNBNUIsTUFBQUEsa0JBQWtCLENBQUNnRSxrQkFBbkIsQ0FBc0NRLHlCQUF0QyxFQUFpRUMscUJBQWpFO0FBQ0Q7QUFDRjtBQUNGLENBdFNEIiwic291cmNlc0NvbnRlbnQiOlsiaW1wb3J0IHsgR3JhcGhRTE5vbk51bGwgfSBmcm9tICdncmFwaHFsJztcbmltcG9ydCB7IGZyb21HbG9iYWxJZCwgbXV0YXRpb25XaXRoQ2xpZW50TXV0YXRpb25JZCB9IGZyb20gJ2dyYXBocWwtcmVsYXknO1xuaW1wb3J0IGdldEZpZWxkTmFtZXMgZnJvbSAnZ3JhcGhxbC1saXN0LWZpZWxkcyc7XG5pbXBvcnQgKiBhcyBkZWZhdWx0R3JhcGhRTFR5cGVzIGZyb20gJy4vZGVmYXVsdEdyYXBoUUxUeXBlcyc7XG5pbXBvcnQgeyBleHRyYWN0S2V5c0FuZEluY2x1ZGUsIGdldFBhcnNlQ2xhc3NNdXRhdGlvbkNvbmZpZyB9IGZyb20gJy4uL3BhcnNlR3JhcGhRTFV0aWxzJztcbmltcG9ydCAqIGFzIG9iamVjdHNNdXRhdGlvbnMgZnJvbSAnLi4vaGVscGVycy9vYmplY3RzTXV0YXRpb25zJztcbmltcG9ydCAqIGFzIG9iamVjdHNRdWVyaWVzIGZyb20gJy4uL2hlbHBlcnMvb2JqZWN0c1F1ZXJpZXMnO1xuaW1wb3J0IHsgUGFyc2VHcmFwaFFMQ2xhc3NDb25maWcgfSBmcm9tICcuLi8uLi9Db250cm9sbGVycy9QYXJzZUdyYXBoUUxDb250cm9sbGVyJztcbmltcG9ydCB7IHRyYW5zZm9ybUNsYXNzTmFtZVRvR3JhcGhRTCB9IGZyb20gJy4uL3RyYW5zZm9ybWVycy9jbGFzc05hbWUnO1xuaW1wb3J0IHsgdHJhbnNmb3JtVHlwZXMgfSBmcm9tICcuLi90cmFuc2Zvcm1lcnMvbXV0YXRpb24nO1xuXG5jb25zdCBnZXRPbmx5UmVxdWlyZWRGaWVsZHMgPSAoXG4gIHVwZGF0ZWRGaWVsZHMsXG4gIHNlbGVjdGVkRmllbGRzU3RyaW5nLFxuICBpbmNsdWRlZEZpZWxkc1N0cmluZyxcbiAgbmF0aXZlT2JqZWN0RmllbGRzXG4pID0+IHtcbiAgY29uc3QgaW5jbHVkZWRGaWVsZHMgPSBpbmNsdWRlZEZpZWxkc1N0cmluZyA/IGluY2x1ZGVkRmllbGRzU3RyaW5nLnNwbGl0KCcsJykgOiBbXTtcbiAgY29uc3Qgc2VsZWN0ZWRGaWVsZHMgPSBzZWxlY3RlZEZpZWxkc1N0cmluZyA/IHNlbGVjdGVkRmllbGRzU3RyaW5nLnNwbGl0KCcsJykgOiBbXTtcbiAgY29uc3QgbWlzc2luZ0ZpZWxkcyA9IHNlbGVjdGVkRmllbGRzXG4gICAgLmZpbHRlcihmaWVsZCA9PiAhbmF0aXZlT2JqZWN0RmllbGRzLmluY2x1ZGVzKGZpZWxkKSB8fCBpbmNsdWRlZEZpZWxkcy5pbmNsdWRlcyhmaWVsZCkpXG4gICAgLmpvaW4oJywnKTtcbiAgaWYgKCFtaXNzaW5nRmllbGRzLmxlbmd0aCkge1xuICAgIHJldHVybiB7IG5lZWRHZXQ6IGZhbHNlLCBrZXlzOiAnJyB9O1xuICB9IGVsc2Uge1xuICAgIHJldHVybiB7IG5lZWRHZXQ6IHRydWUsIGtleXM6IG1pc3NpbmdGaWVsZHMgfTtcbiAgfVxufTtcblxuY29uc3QgbG9hZCA9IGZ1bmN0aW9uIChwYXJzZUdyYXBoUUxTY2hlbWEsIHBhcnNlQ2xhc3MsIHBhcnNlQ2xhc3NDb25maWc6ID9QYXJzZUdyYXBoUUxDbGFzc0NvbmZpZykge1xuICBjb25zdCBjbGFzc05hbWUgPSBwYXJzZUNsYXNzLmNsYXNzTmFtZTtcbiAgY29uc3QgZ3JhcGhRTENsYXNzTmFtZSA9IHRyYW5zZm9ybUNsYXNzTmFtZVRvR3JhcGhRTChjbGFzc05hbWUpO1xuICBjb25zdCBnZXRHcmFwaFFMUXVlcnlOYW1lID0gZ3JhcGhRTENsYXNzTmFtZS5jaGFyQXQoMCkudG9Mb3dlckNhc2UoKSArIGdyYXBoUUxDbGFzc05hbWUuc2xpY2UoMSk7XG5cbiAgY29uc3Qge1xuICAgIGNyZWF0ZTogaXNDcmVhdGVFbmFibGVkID0gdHJ1ZSxcbiAgICB1cGRhdGU6IGlzVXBkYXRlRW5hYmxlZCA9IHRydWUsXG4gICAgZGVzdHJveTogaXNEZXN0cm95RW5hYmxlZCA9IHRydWUsXG4gICAgY3JlYXRlQWxpYXM6IGNyZWF0ZUFsaWFzID0gJycsXG4gICAgdXBkYXRlQWxpYXM6IHVwZGF0ZUFsaWFzID0gJycsXG4gICAgZGVzdHJveUFsaWFzOiBkZXN0cm95QWxpYXMgPSAnJyxcbiAgfSA9IGdldFBhcnNlQ2xhc3NNdXRhdGlvbkNvbmZpZyhwYXJzZUNsYXNzQ29uZmlnKTtcblxuICBjb25zdCB7XG4gICAgY2xhc3NHcmFwaFFMQ3JlYXRlVHlwZSxcbiAgICBjbGFzc0dyYXBoUUxVcGRhdGVUeXBlLFxuICAgIGNsYXNzR3JhcGhRTE91dHB1dFR5cGUsXG4gIH0gPSBwYXJzZUdyYXBoUUxTY2hlbWEucGFyc2VDbGFzc1R5cGVzW2NsYXNzTmFtZV07XG5cbiAgaWYgKGlzQ3JlYXRlRW5hYmxlZCkge1xuICAgIGNvbnN0IGNyZWF0ZUdyYXBoUUxNdXRhdGlvbk5hbWUgPSBjcmVhdGVBbGlhcyB8fCBgY3JlYXRlJHtncmFwaFFMQ2xhc3NOYW1lfWA7XG4gICAgY29uc3QgY3JlYXRlR3JhcGhRTE11dGF0aW9uID0gbXV0YXRpb25XaXRoQ2xpZW50TXV0YXRpb25JZCh7XG4gICAgICBuYW1lOiBgQ3JlYXRlJHtncmFwaFFMQ2xhc3NOYW1lfWAsXG4gICAgICBkZXNjcmlwdGlvbjogYFRoZSAke2NyZWF0ZUdyYXBoUUxNdXRhdGlvbk5hbWV9IG11dGF0aW9uIGNhbiBiZSB1c2VkIHRvIGNyZWF0ZSBhIG5ldyBvYmplY3Qgb2YgdGhlICR7Z3JhcGhRTENsYXNzTmFtZX0gY2xhc3MuYCxcbiAgICAgIGlucHV0RmllbGRzOiB7XG4gICAgICAgIGZpZWxkczoge1xuICAgICAgICAgIGRlc2NyaXB0aW9uOiAnVGhlc2UgYXJlIHRoZSBmaWVsZHMgdGhhdCB3aWxsIGJlIHVzZWQgdG8gY3JlYXRlIHRoZSBuZXcgb2JqZWN0LicsXG4gICAgICAgICAgdHlwZTogY2xhc3NHcmFwaFFMQ3JlYXRlVHlwZSB8fCBkZWZhdWx0R3JhcGhRTFR5cGVzLk9CSkVDVCxcbiAgICAgICAgfSxcbiAgICAgIH0sXG4gICAgICBvdXRwdXRGaWVsZHM6IHtcbiAgICAgICAgW2dldEdyYXBoUUxRdWVyeU5hbWVdOiB7XG4gICAgICAgICAgZGVzY3JpcHRpb246ICdUaGlzIGlzIHRoZSBjcmVhdGVkIG9iamVjdC4nLFxuICAgICAgICAgIHR5cGU6IG5ldyBHcmFwaFFMTm9uTnVsbChjbGFzc0dyYXBoUUxPdXRwdXRUeXBlIHx8IGRlZmF1bHRHcmFwaFFMVHlwZXMuT0JKRUNUKSxcbiAgICAgICAgfSxcbiAgICAgIH0sXG4gICAgICBtdXRhdGVBbmRHZXRQYXlsb2FkOiBhc3luYyAoYXJncywgY29udGV4dCwgbXV0YXRpb25JbmZvKSA9PiB7XG4gICAgICAgIHRyeSB7XG4gICAgICAgICAgbGV0IHsgZmllbGRzIH0gPSBhcmdzO1xuICAgICAgICAgIGlmICghZmllbGRzKSBmaWVsZHMgPSB7fTtcbiAgICAgICAgICBjb25zdCB7IGNvbmZpZywgYXV0aCwgaW5mbyB9ID0gY29udGV4dDtcblxuICAgICAgICAgIGNvbnN0IHBhcnNlRmllbGRzID0gYXdhaXQgdHJhbnNmb3JtVHlwZXMoJ2NyZWF0ZScsIGZpZWxkcywge1xuICAgICAgICAgICAgY2xhc3NOYW1lLFxuICAgICAgICAgICAgcGFyc2VHcmFwaFFMU2NoZW1hLFxuICAgICAgICAgICAgcmVxOiB7IGNvbmZpZywgYXV0aCwgaW5mbyB9LFxuICAgICAgICAgIH0pO1xuXG4gICAgICAgICAgY29uc3QgY3JlYXRlZE9iamVjdCA9IGF3YWl0IG9iamVjdHNNdXRhdGlvbnMuY3JlYXRlT2JqZWN0KFxuICAgICAgICAgICAgY2xhc3NOYW1lLFxuICAgICAgICAgICAgcGFyc2VGaWVsZHMsXG4gICAgICAgICAgICBjb25maWcsXG4gICAgICAgICAgICBhdXRoLFxuICAgICAgICAgICAgaW5mb1xuICAgICAgICAgICk7XG4gICAgICAgICAgY29uc3Qgc2VsZWN0ZWRGaWVsZHMgPSBnZXRGaWVsZE5hbWVzKG11dGF0aW9uSW5mbylcbiAgICAgICAgICAgIC5maWx0ZXIoZmllbGQgPT4gZmllbGQuc3RhcnRzV2l0aChgJHtnZXRHcmFwaFFMUXVlcnlOYW1lfS5gKSlcbiAgICAgICAgICAgIC5tYXAoZmllbGQgPT4gZmllbGQucmVwbGFjZShgJHtnZXRHcmFwaFFMUXVlcnlOYW1lfS5gLCAnJykpO1xuICAgICAgICAgIGNvbnN0IHsga2V5cywgaW5jbHVkZSB9ID0gZXh0cmFjdEtleXNBbmRJbmNsdWRlKHNlbGVjdGVkRmllbGRzKTtcbiAgICAgICAgICBjb25zdCB7IGtleXM6IHJlcXVpcmVkS2V5cywgbmVlZEdldCB9ID0gZ2V0T25seVJlcXVpcmVkRmllbGRzKGZpZWxkcywga2V5cywgaW5jbHVkZSwgW1xuICAgICAgICAgICAgJ2lkJyxcbiAgICAgICAgICAgICdvYmplY3RJZCcsXG4gICAgICAgICAgICAnY3JlYXRlZEF0JyxcbiAgICAgICAgICAgICd1cGRhdGVkQXQnLFxuICAgICAgICAgIF0pO1xuICAgICAgICAgIGNvbnN0IG5lZWRUb0dldEFsbEtleXMgPSBvYmplY3RzUXVlcmllcy5uZWVkVG9HZXRBbGxLZXlzKFxuICAgICAgICAgICAgcGFyc2VDbGFzcy5maWVsZHMsXG4gICAgICAgICAgICBrZXlzLFxuICAgICAgICAgICAgcGFyc2VHcmFwaFFMU2NoZW1hLnBhcnNlQ2xhc3Nlc1xuICAgICAgICAgICk7XG4gICAgICAgICAgbGV0IG9wdGltaXplZE9iamVjdCA9IHt9O1xuICAgICAgICAgIGlmIChuZWVkR2V0ICYmICFuZWVkVG9HZXRBbGxLZXlzKSB7XG4gICAgICAgICAgICBvcHRpbWl6ZWRPYmplY3QgPSBhd2FpdCBvYmplY3RzUXVlcmllcy5nZXRPYmplY3QoXG4gICAgICAgICAgICAgIGNsYXNzTmFtZSxcbiAgICAgICAgICAgICAgY3JlYXRlZE9iamVjdC5vYmplY3RJZCxcbiAgICAgICAgICAgICAgcmVxdWlyZWRLZXlzLFxuICAgICAgICAgICAgICBpbmNsdWRlLFxuICAgICAgICAgICAgICB1bmRlZmluZWQsXG4gICAgICAgICAgICAgIHVuZGVmaW5lZCxcbiAgICAgICAgICAgICAgY29uZmlnLFxuICAgICAgICAgICAgICBhdXRoLFxuICAgICAgICAgICAgICBpbmZvLFxuICAgICAgICAgICAgICBwYXJzZUdyYXBoUUxTY2hlbWEucGFyc2VDbGFzc2VzXG4gICAgICAgICAgICApO1xuICAgICAgICAgIH0gZWxzZSBpZiAobmVlZFRvR2V0QWxsS2V5cykge1xuICAgICAgICAgICAgb3B0aW1pemVkT2JqZWN0ID0gYXdhaXQgb2JqZWN0c1F1ZXJpZXMuZ2V0T2JqZWN0KFxuICAgICAgICAgICAgICBjbGFzc05hbWUsXG4gICAgICAgICAgICAgIGNyZWF0ZWRPYmplY3Qub2JqZWN0SWQsXG4gICAgICAgICAgICAgIHVuZGVmaW5lZCxcbiAgICAgICAgICAgICAgaW5jbHVkZSxcbiAgICAgICAgICAgICAgdW5kZWZpbmVkLFxuICAgICAgICAgICAgICB1bmRlZmluZWQsXG4gICAgICAgICAgICAgIGNvbmZpZyxcbiAgICAgICAgICAgICAgYXV0aCxcbiAgICAgICAgICAgICAgaW5mbyxcbiAgICAgICAgICAgICAgcGFyc2VHcmFwaFFMU2NoZW1hLnBhcnNlQ2xhc3Nlc1xuICAgICAgICAgICAgKTtcbiAgICAgICAgICB9XG4gICAgICAgICAgcmV0dXJuIHtcbiAgICAgICAgICAgIFtnZXRHcmFwaFFMUXVlcnlOYW1lXToge1xuICAgICAgICAgICAgICAuLi5jcmVhdGVkT2JqZWN0LFxuICAgICAgICAgICAgICB1cGRhdGVkQXQ6IGNyZWF0ZWRPYmplY3QuY3JlYXRlZEF0LFxuICAgICAgICAgICAgICAuLi5wYXJzZUZpZWxkcyxcbiAgICAgICAgICAgICAgLi4ub3B0aW1pemVkT2JqZWN0LFxuICAgICAgICAgICAgfSxcbiAgICAgICAgICB9O1xuICAgICAgICB9IGNhdGNoIChlKSB7XG4gICAgICAgICAgcGFyc2VHcmFwaFFMU2NoZW1hLmhhbmRsZUVycm9yKGUpO1xuICAgICAgICB9XG4gICAgICB9LFxuICAgIH0pO1xuXG4gICAgaWYgKFxuICAgICAgcGFyc2VHcmFwaFFMU2NoZW1hLmFkZEdyYXBoUUxUeXBlKGNyZWF0ZUdyYXBoUUxNdXRhdGlvbi5hcmdzLmlucHV0LnR5cGUub2ZUeXBlKSAmJlxuICAgICAgcGFyc2VHcmFwaFFMU2NoZW1hLmFkZEdyYXBoUUxUeXBlKGNyZWF0ZUdyYXBoUUxNdXRhdGlvbi50eXBlKVxuICAgICkge1xuICAgICAgcGFyc2VHcmFwaFFMU2NoZW1hLmFkZEdyYXBoUUxNdXRhdGlvbihjcmVhdGVHcmFwaFFMTXV0YXRpb25OYW1lLCBjcmVhdGVHcmFwaFFMTXV0YXRpb24pO1xuICAgIH1cbiAgfVxuXG4gIGlmIChpc1VwZGF0ZUVuYWJsZWQpIHtcbiAgICBjb25zdCB1cGRhdGVHcmFwaFFMTXV0YXRpb25OYW1lID0gdXBkYXRlQWxpYXMgfHwgYHVwZGF0ZSR7Z3JhcGhRTENsYXNzTmFtZX1gO1xuICAgIGNvbnN0IHVwZGF0ZUdyYXBoUUxNdXRhdGlvbiA9IG11dGF0aW9uV2l0aENsaWVudE11dGF0aW9uSWQoe1xuICAgICAgbmFtZTogYFVwZGF0ZSR7Z3JhcGhRTENsYXNzTmFtZX1gLFxuICAgICAgZGVzY3JpcHRpb246IGBUaGUgJHt1cGRhdGVHcmFwaFFMTXV0YXRpb25OYW1lfSBtdXRhdGlvbiBjYW4gYmUgdXNlZCB0byB1cGRhdGUgYW4gb2JqZWN0IG9mIHRoZSAke2dyYXBoUUxDbGFzc05hbWV9IGNsYXNzLmAsXG4gICAgICBpbnB1dEZpZWxkczoge1xuICAgICAgICBpZDogZGVmYXVsdEdyYXBoUUxUeXBlcy5HTE9CQUxfT1JfT0JKRUNUX0lEX0FUVCxcbiAgICAgICAgZmllbGRzOiB7XG4gICAgICAgICAgZGVzY3JpcHRpb246ICdUaGVzZSBhcmUgdGhlIGZpZWxkcyB0aGF0IHdpbGwgYmUgdXNlZCB0byB1cGRhdGUgdGhlIG9iamVjdC4nLFxuICAgICAgICAgIHR5cGU6IGNsYXNzR3JhcGhRTFVwZGF0ZVR5cGUgfHwgZGVmYXVsdEdyYXBoUUxUeXBlcy5PQkpFQ1QsXG4gICAgICAgIH0sXG4gICAgICB9LFxuICAgICAgb3V0cHV0RmllbGRzOiB7XG4gICAgICAgIFtnZXRHcmFwaFFMUXVlcnlOYW1lXToge1xuICAgICAgICAgIGRlc2NyaXB0aW9uOiAnVGhpcyBpcyB0aGUgdXBkYXRlZCBvYmplY3QuJyxcbiAgICAgICAgICB0eXBlOiBuZXcgR3JhcGhRTE5vbk51bGwoY2xhc3NHcmFwaFFMT3V0cHV0VHlwZSB8fCBkZWZhdWx0R3JhcGhRTFR5cGVzLk9CSkVDVCksXG4gICAgICAgIH0sXG4gICAgICB9LFxuICAgICAgbXV0YXRlQW5kR2V0UGF5bG9hZDogYXN5bmMgKGFyZ3MsIGNvbnRleHQsIG11dGF0aW9uSW5mbykgPT4ge1xuICAgICAgICB0cnkge1xuICAgICAgICAgIGxldCB7IGlkLCBmaWVsZHMgfSA9IGFyZ3M7XG4gICAgICAgICAgaWYgKCFmaWVsZHMpIGZpZWxkcyA9IHt9O1xuICAgICAgICAgIGNvbnN0IHsgY29uZmlnLCBhdXRoLCBpbmZvIH0gPSBjb250ZXh0O1xuXG4gICAgICAgICAgY29uc3QgZ2xvYmFsSWRPYmplY3QgPSBmcm9tR2xvYmFsSWQoaWQpO1xuXG4gICAgICAgICAgaWYgKGdsb2JhbElkT2JqZWN0LnR5cGUgPT09IGNsYXNzTmFtZSkge1xuICAgICAgICAgICAgaWQgPSBnbG9iYWxJZE9iamVjdC5pZDtcbiAgICAgICAgICB9XG5cbiAgICAgICAgICBjb25zdCBwYXJzZUZpZWxkcyA9IGF3YWl0IHRyYW5zZm9ybVR5cGVzKCd1cGRhdGUnLCBmaWVsZHMsIHtcbiAgICAgICAgICAgIGNsYXNzTmFtZSxcbiAgICAgICAgICAgIHBhcnNlR3JhcGhRTFNjaGVtYSxcbiAgICAgICAgICAgIHJlcTogeyBjb25maWcsIGF1dGgsIGluZm8gfSxcbiAgICAgICAgICB9KTtcblxuICAgICAgICAgIGNvbnN0IHVwZGF0ZWRPYmplY3QgPSBhd2FpdCBvYmplY3RzTXV0YXRpb25zLnVwZGF0ZU9iamVjdChcbiAgICAgICAgICAgIGNsYXNzTmFtZSxcbiAgICAgICAgICAgIGlkLFxuICAgICAgICAgICAgcGFyc2VGaWVsZHMsXG4gICAgICAgICAgICBjb25maWcsXG4gICAgICAgICAgICBhdXRoLFxuICAgICAgICAgICAgaW5mb1xuICAgICAgICAgICk7XG5cbiAgICAgICAgICBjb25zdCBzZWxlY3RlZEZpZWxkcyA9IGdldEZpZWxkTmFtZXMobXV0YXRpb25JbmZvKVxuICAgICAgICAgICAgLmZpbHRlcihmaWVsZCA9PiBmaWVsZC5zdGFydHNXaXRoKGAke2dldEdyYXBoUUxRdWVyeU5hbWV9LmApKVxuICAgICAgICAgICAgLm1hcChmaWVsZCA9PiBmaWVsZC5yZXBsYWNlKGAke2dldEdyYXBoUUxRdWVyeU5hbWV9LmAsICcnKSk7XG4gICAgICAgICAgY29uc3QgeyBrZXlzLCBpbmNsdWRlIH0gPSBleHRyYWN0S2V5c0FuZEluY2x1ZGUoc2VsZWN0ZWRGaWVsZHMpO1xuICAgICAgICAgIGNvbnN0IHsga2V5czogcmVxdWlyZWRLZXlzLCBuZWVkR2V0IH0gPSBnZXRPbmx5UmVxdWlyZWRGaWVsZHMoZmllbGRzLCBrZXlzLCBpbmNsdWRlLCBbXG4gICAgICAgICAgICAnaWQnLFxuICAgICAgICAgICAgJ29iamVjdElkJyxcbiAgICAgICAgICAgICd1cGRhdGVkQXQnLFxuICAgICAgICAgIF0pO1xuICAgICAgICAgIGNvbnN0IG5lZWRUb0dldEFsbEtleXMgPSBvYmplY3RzUXVlcmllcy5uZWVkVG9HZXRBbGxLZXlzKFxuICAgICAgICAgICAgcGFyc2VDbGFzcy5maWVsZHMsXG4gICAgICAgICAgICBrZXlzLFxuICAgICAgICAgICAgcGFyc2VHcmFwaFFMU2NoZW1hLnBhcnNlQ2xhc3Nlc1xuICAgICAgICAgICk7XG4gICAgICAgICAgbGV0IG9wdGltaXplZE9iamVjdCA9IHt9O1xuICAgICAgICAgIGlmIChuZWVkR2V0ICYmICFuZWVkVG9HZXRBbGxLZXlzKSB7XG4gICAgICAgICAgICBvcHRpbWl6ZWRPYmplY3QgPSBhd2FpdCBvYmplY3RzUXVlcmllcy5nZXRPYmplY3QoXG4gICAgICAgICAgICAgIGNsYXNzTmFtZSxcbiAgICAgICAgICAgICAgaWQsXG4gICAgICAgICAgICAgIHJlcXVpcmVkS2V5cyxcbiAgICAgICAgICAgICAgaW5jbHVkZSxcbiAgICAgICAgICAgICAgdW5kZWZpbmVkLFxuICAgICAgICAgICAgICB1bmRlZmluZWQsXG4gICAgICAgICAgICAgIGNvbmZpZyxcbiAgICAgICAgICAgICAgYXV0aCxcbiAgICAgICAgICAgICAgaW5mbyxcbiAgICAgICAgICAgICAgcGFyc2VHcmFwaFFMU2NoZW1hLnBhcnNlQ2xhc3Nlc1xuICAgICAgICAgICAgKTtcbiAgICAgICAgICB9IGVsc2UgaWYgKG5lZWRUb0dldEFsbEtleXMpIHtcbiAgICAgICAgICAgIG9wdGltaXplZE9iamVjdCA9IGF3YWl0IG9iamVjdHNRdWVyaWVzLmdldE9iamVjdChcbiAgICAgICAgICAgICAgY2xhc3NOYW1lLFxuICAgICAgICAgICAgICBpZCxcbiAgICAgICAgICAgICAgdW5kZWZpbmVkLFxuICAgICAgICAgICAgICBpbmNsdWRlLFxuICAgICAgICAgICAgICB1bmRlZmluZWQsXG4gICAgICAgICAgICAgIHVuZGVmaW5lZCxcbiAgICAgICAgICAgICAgY29uZmlnLFxuICAgICAgICAgICAgICBhdXRoLFxuICAgICAgICAgICAgICBpbmZvLFxuICAgICAgICAgICAgICBwYXJzZUdyYXBoUUxTY2hlbWEucGFyc2VDbGFzc2VzXG4gICAgICAgICAgICApO1xuICAgICAgICAgIH1cbiAgICAgICAgICByZXR1cm4ge1xuICAgICAgICAgICAgW2dldEdyYXBoUUxRdWVyeU5hbWVdOiB7XG4gICAgICAgICAgICAgIG9iamVjdElkOiBpZCxcbiAgICAgICAgICAgICAgLi4udXBkYXRlZE9iamVjdCxcbiAgICAgICAgICAgICAgLi4ucGFyc2VGaWVsZHMsXG4gICAgICAgICAgICAgIC4uLm9wdGltaXplZE9iamVjdCxcbiAgICAgICAgICAgIH0sXG4gICAgICAgICAgfTtcbiAgICAgICAgfSBjYXRjaCAoZSkge1xuICAgICAgICAgIHBhcnNlR3JhcGhRTFNjaGVtYS5oYW5kbGVFcnJvcihlKTtcbiAgICAgICAgfVxuICAgICAgfSxcbiAgICB9KTtcblxuICAgIGlmIChcbiAgICAgIHBhcnNlR3JhcGhRTFNjaGVtYS5hZGRHcmFwaFFMVHlwZSh1cGRhdGVHcmFwaFFMTXV0YXRpb24uYXJncy5pbnB1dC50eXBlLm9mVHlwZSkgJiZcbiAgICAgIHBhcnNlR3JhcGhRTFNjaGVtYS5hZGRHcmFwaFFMVHlwZSh1cGRhdGVHcmFwaFFMTXV0YXRpb24udHlwZSlcbiAgICApIHtcbiAgICAgIHBhcnNlR3JhcGhRTFNjaGVtYS5hZGRHcmFwaFFMTXV0YXRpb24odXBkYXRlR3JhcGhRTE11dGF0aW9uTmFtZSwgdXBkYXRlR3JhcGhRTE11dGF0aW9uKTtcbiAgICB9XG4gIH1cblxuICBpZiAoaXNEZXN0cm95RW5hYmxlZCkge1xuICAgIGNvbnN0IGRlbGV0ZUdyYXBoUUxNdXRhdGlvbk5hbWUgPSBkZXN0cm95QWxpYXMgfHwgYGRlbGV0ZSR7Z3JhcGhRTENsYXNzTmFtZX1gO1xuICAgIGNvbnN0IGRlbGV0ZUdyYXBoUUxNdXRhdGlvbiA9IG11dGF0aW9uV2l0aENsaWVudE11dGF0aW9uSWQoe1xuICAgICAgbmFtZTogYERlbGV0ZSR7Z3JhcGhRTENsYXNzTmFtZX1gLFxuICAgICAgZGVzY3JpcHRpb246IGBUaGUgJHtkZWxldGVHcmFwaFFMTXV0YXRpb25OYW1lfSBtdXRhdGlvbiBjYW4gYmUgdXNlZCB0byBkZWxldGUgYW4gb2JqZWN0IG9mIHRoZSAke2dyYXBoUUxDbGFzc05hbWV9IGNsYXNzLmAsXG4gICAgICBpbnB1dEZpZWxkczoge1xuICAgICAgICBpZDogZGVmYXVsdEdyYXBoUUxUeXBlcy5HTE9CQUxfT1JfT0JKRUNUX0lEX0FUVCxcbiAgICAgIH0sXG4gICAgICBvdXRwdXRGaWVsZHM6IHtcbiAgICAgICAgW2dldEdyYXBoUUxRdWVyeU5hbWVdOiB7XG4gICAgICAgICAgZGVzY3JpcHRpb246ICdUaGlzIGlzIHRoZSBkZWxldGVkIG9iamVjdC4nLFxuICAgICAgICAgIHR5cGU6IG5ldyBHcmFwaFFMTm9uTnVsbChjbGFzc0dyYXBoUUxPdXRwdXRUeXBlIHx8IGRlZmF1bHRHcmFwaFFMVHlwZXMuT0JKRUNUKSxcbiAgICAgICAgfSxcbiAgICAgIH0sXG4gICAgICBtdXRhdGVBbmRHZXRQYXlsb2FkOiBhc3luYyAoYXJncywgY29udGV4dCwgbXV0YXRpb25JbmZvKSA9PiB7XG4gICAgICAgIHRyeSB7XG4gICAgICAgICAgbGV0IHsgaWQgfSA9IGFyZ3M7XG4gICAgICAgICAgY29uc3QgeyBjb25maWcsIGF1dGgsIGluZm8gfSA9IGNvbnRleHQ7XG5cbiAgICAgICAgICBjb25zdCBnbG9iYWxJZE9iamVjdCA9IGZyb21HbG9iYWxJZChpZCk7XG5cbiAgICAgICAgICBpZiAoZ2xvYmFsSWRPYmplY3QudHlwZSA9PT0gY2xhc3NOYW1lKSB7XG4gICAgICAgICAgICBpZCA9IGdsb2JhbElkT2JqZWN0LmlkO1xuICAgICAgICAgIH1cblxuICAgICAgICAgIGNvbnN0IHNlbGVjdGVkRmllbGRzID0gZ2V0RmllbGROYW1lcyhtdXRhdGlvbkluZm8pXG4gICAgICAgICAgICAuZmlsdGVyKGZpZWxkID0+IGZpZWxkLnN0YXJ0c1dpdGgoYCR7Z2V0R3JhcGhRTFF1ZXJ5TmFtZX0uYCkpXG4gICAgICAgICAgICAubWFwKGZpZWxkID0+IGZpZWxkLnJlcGxhY2UoYCR7Z2V0R3JhcGhRTFF1ZXJ5TmFtZX0uYCwgJycpKTtcbiAgICAgICAgICBjb25zdCB7IGtleXMsIGluY2x1ZGUgfSA9IGV4dHJhY3RLZXlzQW5kSW5jbHVkZShzZWxlY3RlZEZpZWxkcyk7XG4gICAgICAgICAgbGV0IG9wdGltaXplZE9iamVjdCA9IHt9O1xuICAgICAgICAgIGlmIChrZXlzICYmIGtleXMuc3BsaXQoJywnKS5maWx0ZXIoa2V5ID0+ICFbJ2lkJywgJ29iamVjdElkJ10uaW5jbHVkZXMoa2V5KSkubGVuZ3RoID4gMCkge1xuICAgICAgICAgICAgb3B0aW1pemVkT2JqZWN0ID0gYXdhaXQgb2JqZWN0c1F1ZXJpZXMuZ2V0T2JqZWN0KFxuICAgICAgICAgICAgICBjbGFzc05hbWUsXG4gICAgICAgICAgICAgIGlkLFxuICAgICAgICAgICAgICBrZXlzLFxuICAgICAgICAgICAgICBpbmNsdWRlLFxuICAgICAgICAgICAgICB1bmRlZmluZWQsXG4gICAgICAgICAgICAgIHVuZGVmaW5lZCxcbiAgICAgICAgICAgICAgY29uZmlnLFxuICAgICAgICAgICAgICBhdXRoLFxuICAgICAgICAgICAgICBpbmZvLFxuICAgICAgICAgICAgICBwYXJzZUdyYXBoUUxTY2hlbWEucGFyc2VDbGFzc2VzXG4gICAgICAgICAgICApO1xuICAgICAgICAgIH1cbiAgICAgICAgICBhd2FpdCBvYmplY3RzTXV0YXRpb25zLmRlbGV0ZU9iamVjdChjbGFzc05hbWUsIGlkLCBjb25maWcsIGF1dGgsIGluZm8pO1xuICAgICAgICAgIHJldHVybiB7XG4gICAgICAgICAgICBbZ2V0R3JhcGhRTFF1ZXJ5TmFtZV06IHtcbiAgICAgICAgICAgICAgb2JqZWN0SWQ6IGlkLFxuICAgICAgICAgICAgICAuLi5vcHRpbWl6ZWRPYmplY3QsXG4gICAgICAgICAgICB9LFxuICAgICAgICAgIH07XG4gICAgICAgIH0gY2F0Y2ggKGUpIHtcbiAgICAgICAgICBwYXJzZUdyYXBoUUxTY2hlbWEuaGFuZGxlRXJyb3IoZSk7XG4gICAgICAgIH1cbiAgICAgIH0sXG4gICAgfSk7XG5cbiAgICBpZiAoXG4gICAgICBwYXJzZUdyYXBoUUxTY2hlbWEuYWRkR3JhcGhRTFR5cGUoZGVsZXRlR3JhcGhRTE11dGF0aW9uLmFyZ3MuaW5wdXQudHlwZS5vZlR5cGUpICYmXG4gICAgICBwYXJzZUdyYXBoUUxTY2hlbWEuYWRkR3JhcGhRTFR5cGUoZGVsZXRlR3JhcGhRTE11dGF0aW9uLnR5cGUpXG4gICAgKSB7XG4gICAgICBwYXJzZUdyYXBoUUxTY2hlbWEuYWRkR3JhcGhRTE11dGF0aW9uKGRlbGV0ZUdyYXBoUUxNdXRhdGlvbk5hbWUsIGRlbGV0ZUdyYXBoUUxNdXRhdGlvbik7XG4gICAgfVxuICB9XG59O1xuXG5leHBvcnQgeyBsb2FkIH07XG4iXX0=