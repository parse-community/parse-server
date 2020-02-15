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
          let optimizedObject = {};

          if (needGet) {
            optimizedObject = await objectsQueries.getObject(className, createdObject.objectId, requiredKeys, include, undefined, undefined, config, auth, info);
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
          let optimizedObject = {};

          if (needGet) {
            optimizedObject = await objectsQueries.getObject(className, id, requiredKeys, include, undefined, undefined, config, auth, info);
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
            optimizedObject = await objectsQueries.getObject(className, id, keys, include, undefined, undefined, config, auth, info);
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
//# sourceMappingURL=data:application/json;charset=utf-8;base64,eyJ2ZXJzaW9uIjozLCJzb3VyY2VzIjpbIi4uLy4uLy4uL3NyYy9HcmFwaFFML2xvYWRlcnMvcGFyc2VDbGFzc011dGF0aW9ucy5qcyJdLCJuYW1lcyI6WyJnZXRPbmx5UmVxdWlyZWRGaWVsZHMiLCJ1cGRhdGVkRmllbGRzIiwic2VsZWN0ZWRGaWVsZHNTdHJpbmciLCJpbmNsdWRlZEZpZWxkc1N0cmluZyIsIm5hdGl2ZU9iamVjdEZpZWxkcyIsImluY2x1ZGVkRmllbGRzIiwic3BsaXQiLCJzZWxlY3RlZEZpZWxkcyIsIm1pc3NpbmdGaWVsZHMiLCJmaWx0ZXIiLCJmaWVsZCIsImluY2x1ZGVzIiwiam9pbiIsImxlbmd0aCIsIm5lZWRHZXQiLCJrZXlzIiwibG9hZCIsInBhcnNlR3JhcGhRTFNjaGVtYSIsInBhcnNlQ2xhc3MiLCJwYXJzZUNsYXNzQ29uZmlnIiwiY2xhc3NOYW1lIiwiZ3JhcGhRTENsYXNzTmFtZSIsImdldEdyYXBoUUxRdWVyeU5hbWUiLCJjaGFyQXQiLCJ0b0xvd2VyQ2FzZSIsInNsaWNlIiwiY3JlYXRlIiwiaXNDcmVhdGVFbmFibGVkIiwidXBkYXRlIiwiaXNVcGRhdGVFbmFibGVkIiwiZGVzdHJveSIsImlzRGVzdHJveUVuYWJsZWQiLCJjcmVhdGVBbGlhcyIsInVwZGF0ZUFsaWFzIiwiZGVzdHJveUFsaWFzIiwiY2xhc3NHcmFwaFFMQ3JlYXRlVHlwZSIsImNsYXNzR3JhcGhRTFVwZGF0ZVR5cGUiLCJjbGFzc0dyYXBoUUxPdXRwdXRUeXBlIiwicGFyc2VDbGFzc1R5cGVzIiwiY3JlYXRlR3JhcGhRTE11dGF0aW9uTmFtZSIsImNyZWF0ZUdyYXBoUUxNdXRhdGlvbiIsIm5hbWUiLCJkZXNjcmlwdGlvbiIsImlucHV0RmllbGRzIiwiZmllbGRzIiwidHlwZSIsImRlZmF1bHRHcmFwaFFMVHlwZXMiLCJPQkpFQ1QiLCJvdXRwdXRGaWVsZHMiLCJHcmFwaFFMTm9uTnVsbCIsIm11dGF0ZUFuZEdldFBheWxvYWQiLCJhcmdzIiwiY29udGV4dCIsIm11dGF0aW9uSW5mbyIsImNvbmZpZyIsImF1dGgiLCJpbmZvIiwicGFyc2VGaWVsZHMiLCJyZXEiLCJjcmVhdGVkT2JqZWN0Iiwib2JqZWN0c011dGF0aW9ucyIsImNyZWF0ZU9iamVjdCIsInN0YXJ0c1dpdGgiLCJtYXAiLCJyZXBsYWNlIiwiaW5jbHVkZSIsInJlcXVpcmVkS2V5cyIsIm9wdGltaXplZE9iamVjdCIsIm9iamVjdHNRdWVyaWVzIiwiZ2V0T2JqZWN0Iiwib2JqZWN0SWQiLCJ1bmRlZmluZWQiLCJ1cGRhdGVkQXQiLCJjcmVhdGVkQXQiLCJlIiwiaGFuZGxlRXJyb3IiLCJhZGRHcmFwaFFMVHlwZSIsImlucHV0Iiwib2ZUeXBlIiwiYWRkR3JhcGhRTE11dGF0aW9uIiwidXBkYXRlR3JhcGhRTE11dGF0aW9uTmFtZSIsInVwZGF0ZUdyYXBoUUxNdXRhdGlvbiIsImlkIiwiR0xPQkFMX09SX09CSkVDVF9JRF9BVFQiLCJnbG9iYWxJZE9iamVjdCIsInVwZGF0ZWRPYmplY3QiLCJ1cGRhdGVPYmplY3QiLCJkZWxldGVHcmFwaFFMTXV0YXRpb25OYW1lIiwiZGVsZXRlR3JhcGhRTE11dGF0aW9uIiwia2V5IiwiZGVsZXRlT2JqZWN0Il0sIm1hcHBpbmdzIjoiOzs7Ozs7O0FBQUE7O0FBQ0E7O0FBQ0E7O0FBQ0E7O0FBQ0E7O0FBSUE7O0FBQ0E7O0FBQ0E7O0FBQ0E7O0FBQ0E7Ozs7Ozs7Ozs7Ozs7O0FBRUEsTUFBTUEscUJBQXFCLEdBQUcsQ0FDNUJDLGFBRDRCLEVBRTVCQyxvQkFGNEIsRUFHNUJDLG9CQUg0QixFQUk1QkMsa0JBSjRCLEtBS3pCO0FBQ0gsUUFBTUMsY0FBYyxHQUFHRixvQkFBb0IsR0FDdkNBLG9CQUFvQixDQUFDRyxLQUFyQixDQUEyQixHQUEzQixDQUR1QyxHQUV2QyxFQUZKO0FBR0EsUUFBTUMsY0FBYyxHQUFHTCxvQkFBb0IsR0FDdkNBLG9CQUFvQixDQUFDSSxLQUFyQixDQUEyQixHQUEzQixDQUR1QyxHQUV2QyxFQUZKO0FBR0EsUUFBTUUsYUFBYSxHQUFHRCxjQUFjLENBQ2pDRSxNQURtQixD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QUZMO0FBREssV0FBUDtBQU1ELFNBN0NELENBNkNFLE9BQU9PLENBQVAsRUFBVTtBQUNWekQsVUFBQUEsa0JBQWtCLENBQUMwRCxXQUFuQixDQUErQkQsQ0FBL0I7QUFDRDtBQUNGO0FBL0R3RCxLQUE3QixDQUE5Qjs7QUFrRUEsUUFDRXpELGtCQUFrQixDQUFDMkQsY0FBbkIsQ0FDRVkscUJBQXFCLENBQUNyQyxJQUF0QixDQUEyQjBCLEtBQTNCLENBQWlDaEMsSUFBakMsQ0FBc0NpQyxNQUR4QyxLQUdBN0Qsa0JBQWtCLENBQUMyRCxjQUFuQixDQUFrQ1kscUJBQXFCLENBQUMzQyxJQUF4RCxDQUpGLEVBS0U7QUFDQTVCLE1BQUFBLGtCQUFrQixDQUFDOEQsa0JBQW5CLENBQ0VRLHlCQURGLEVBRUVDLHFCQUZGO0FBSUQ7QUFDRjtBQUNGLENBMVNEIiwic291cmNlc0NvbnRlbnQiOlsiaW1wb3J0IHsgR3JhcGhRTE5vbk51bGwgfSBmcm9tICdncmFwaHFsJztcbmltcG9ydCB7IGZyb21HbG9iYWxJZCwgbXV0YXRpb25XaXRoQ2xpZW50TXV0YXRpb25JZCB9IGZyb20gJ2dyYXBocWwtcmVsYXknO1xuaW1wb3J0IGdldEZpZWxkTmFtZXMgZnJvbSAnZ3JhcGhxbC1saXN0LWZpZWxkcyc7XG5pbXBvcnQgKiBhcyBkZWZhdWx0R3JhcGhRTFR5cGVzIGZyb20gJy4vZGVmYXVsdEdyYXBoUUxUeXBlcyc7XG5pbXBvcnQge1xuICBleHRyYWN0S2V5c0FuZEluY2x1ZGUsXG4gIGdldFBhcnNlQ2xhc3NNdXRhdGlvbkNvbmZpZyxcbn0gZnJvbSAnLi4vcGFyc2VHcmFwaFFMVXRpbHMnO1xuaW1wb3J0ICogYXMgb2JqZWN0c011dGF0aW9ucyBmcm9tICcuLi9oZWxwZXJzL29iamVjdHNNdXRhdGlvbnMnO1xuaW1wb3J0ICogYXMgb2JqZWN0c1F1ZXJpZXMgZnJvbSAnLi4vaGVscGVycy9vYmplY3RzUXVlcmllcyc7XG5pbXBvcnQgeyBQYXJzZUdyYXBoUUxDbGFzc0NvbmZpZyB9IGZyb20gJy4uLy4uL0NvbnRyb2xsZXJzL1BhcnNlR3JhcGhRTENvbnRyb2xsZXInO1xuaW1wb3J0IHsgdHJhbnNmb3JtQ2xhc3NOYW1lVG9HcmFwaFFMIH0gZnJvbSAnLi4vdHJhbnNmb3JtZXJzL2NsYXNzTmFtZSc7XG5pbXBvcnQgeyB0cmFuc2Zvcm1UeXBlcyB9IGZyb20gJy4uL3RyYW5zZm9ybWVycy9tdXRhdGlvbic7XG5cbmNvbnN0IGdldE9ubHlSZXF1aXJlZEZpZWxkcyA9IChcbiAgdXBkYXRlZEZpZWxkcyxcbiAgc2VsZWN0ZWRGaWVsZHNTdHJpbmcsXG4gIGluY2x1ZGVkRmllbGRzU3RyaW5nLFxuICBuYXRpdmVPYmplY3RGaWVsZHNcbikgPT4ge1xuICBjb25zdCBpbmNsdWRlZEZpZWxkcyA9IGluY2x1ZGVkRmllbGRzU3RyaW5nXG4gICAgPyBpbmNsdWRlZEZpZWxkc1N0cmluZy5zcGxpdCgnLCcpXG4gICAgOiBbXTtcbiAgY29uc3Qgc2VsZWN0ZWRGaWVsZHMgPSBzZWxlY3RlZEZpZWxkc1N0cmluZ1xuICAgID8gc2VsZWN0ZWRGaWVsZHNTdHJpbmcuc3BsaXQoJywnKVxuICAgIDogW107XG4gIGNvbnN0IG1pc3NpbmdGaWVsZHMgPSBzZWxlY3RlZEZpZWxkc1xuICAgIC5maWx0ZXIoXG4gICAgICBmaWVsZCA9PlxuICAgICAgICAhbmF0aXZlT2JqZWN0RmllbGRzLmluY2x1ZGVzKGZpZWxkKSB8fCBpbmNsdWRlZEZpZWxkcy5pbmNsdWRlcyhmaWVsZClcbiAgICApXG4gICAgLmpvaW4oJywnKTtcbiAgaWYgKCFtaXNzaW5nRmllbGRzLmxlbmd0aCkge1xuICAgIHJldHVybiB7IG5lZWRHZXQ6IGZhbHNlLCBrZXlzOiAnJyB9O1xuICB9IGVsc2Uge1xuICAgIHJldHVybiB7IG5lZWRHZXQ6IHRydWUsIGtleXM6IG1pc3NpbmdGaWVsZHMgfTtcbiAgfVxufTtcblxuY29uc3QgbG9hZCA9IGZ1bmN0aW9uKFxuICBwYXJzZUdyYXBoUUxTY2hlbWEsXG4gIHBhcnNlQ2xhc3MsXG4gIHBhcnNlQ2xhc3NDb25maWc6ID9QYXJzZUdyYXBoUUxDbGFzc0NvbmZpZ1xuKSB7XG4gIGNvbnN0IGNsYXNzTmFtZSA9IHBhcnNlQ2xhc3MuY2xhc3NOYW1lO1xuICBjb25zdCBncmFwaFFMQ2xhc3NOYW1lID0gdHJhbnNmb3JtQ2xhc3NOYW1lVG9HcmFwaFFMKGNsYXNzTmFtZSk7XG4gIGNvbnN0IGdldEdyYXBoUUxRdWVyeU5hbWUgPVxuICAgIGdyYXBoUUxDbGFzc05hbWUuY2hhckF0KDApLnRvTG93ZXJDYXNlKCkgKyBncmFwaFFMQ2xhc3NOYW1lLnNsaWNlKDEpO1xuXG4gIGNvbnN0IHtcbiAgICBjcmVhdGU6IGlzQ3JlYXRlRW5hYmxlZCA9IHRydWUsXG4gICAgdXBkYXRlOiBpc1VwZGF0ZUVuYWJsZWQgPSB0cnVlLFxuICAgIGRlc3Ryb3k6IGlzRGVzdHJveUVuYWJsZWQgPSB0cnVlLFxuICAgIGNyZWF0ZUFsaWFzOiBjcmVhdGVBbGlhcyA9ICcnLFxuICAgIHVwZGF0ZUFsaWFzOiB1cGRhdGVBbGlhcyA9ICcnLFxuICAgIGRlc3Ryb3lBbGlhczogZGVzdHJveUFsaWFzID0gJycsXG4gIH0gPSBnZXRQYXJzZUNsYXNzTXV0YXRpb25Db25maWcocGFyc2VDbGFzc0NvbmZpZyk7XG5cbiAgY29uc3Qge1xuICAgIGNsYXNzR3JhcGhRTENyZWF0ZVR5cGUsXG4gICAgY2xhc3NHcmFwaFFMVXBkYXRlVHlwZSxcbiAgICBjbGFzc0dyYXBoUUxPdXRwdXRUeXBlLFxuICB9ID0gcGFyc2VHcmFwaFFMU2NoZW1hLnBhcnNlQ2xhc3NUeXBlc1tjbGFzc05hbWVdO1xuXG4gIGlmIChpc0NyZWF0ZUVuYWJsZWQpIHtcbiAgICBjb25zdCBjcmVhdGVHcmFwaFFMTXV0YXRpb25OYW1lID1cbiAgICAgIGNyZWF0ZUFsaWFzIHx8IGBjcmVhdGUke2dyYXBoUUxDbGFzc05hbWV9YDtcbiAgICBjb25zdCBjcmVhdGVHcmFwaFFMTXV0YXRpb24gPSBtdXRhdGlvbldpdGhDbGllbnRNdXRhdGlvbklkKHtcbiAgICAgIG5hbWU6IGBDcmVhdGUke2dyYXBoUUxDbGFzc05hbWV9YCxcbiAgICAgIGRlc2NyaXB0aW9uOiBgVGhlICR7Y3JlYXRlR3JhcGhRTE11dGF0aW9uTmFtZX0gbXV0YXRpb24gY2FuIGJlIHVzZWQgdG8gY3JlYXRlIGEgbmV3IG9iamVjdCBvZiB0aGUgJHtncmFwaFFMQ2xhc3NOYW1lfSBjbGFzcy5gLFxuICAgICAgaW5wdXRGaWVsZHM6IHtcbiAgICAgICAgZmllbGRzOiB7XG4gICAgICAgICAgZGVzY3JpcHRpb246XG4gICAgICAgICAgICAnVGhlc2UgYXJlIHRoZSBmaWVsZHMgdGhhdCB3aWxsIGJlIHVzZWQgdG8gY3JlYXRlIHRoZSBuZXcgb2JqZWN0LicsXG4gICAgICAgICAgdHlwZTogY2xhc3NHcmFwaFFMQ3JlYXRlVHlwZSB8fCBkZWZhdWx0R3JhcGhRTFR5cGVzLk9CSkVDVCxcbiAgICAgICAgfSxcbiAgICAgIH0sXG4gICAgICBvdXRwdXRGaWVsZHM6IHtcbiAgICAgICAgW2dldEdyYXBoUUxRdWVyeU5hbWVdOiB7XG4gICAgICAgICAgZGVzY3JpcHRpb246ICdUaGlzIGlzIHRoZSBjcmVhdGVkIG9iamVjdC4nLFxuICAgICAgICAgIHR5cGU6IG5ldyBHcmFwaFFMTm9uTnVsbChcbiAgICAgICAgICAgIGNsYXNzR3JhcGhRTE91dHB1dFR5cGUgfHwgZGVmYXVsdEdyYXBoUUxUeXBlcy5PQkpFQ1RcbiAgICAgICAgICApLFxuICAgICAgICB9LFxuICAgICAgfSxcbiAgICAgIG11dGF0ZUFuZEdldFBheWxvYWQ6IGFzeW5jIChhcmdzLCBjb250ZXh0LCBtdXRhdGlvbkluZm8pID0+IHtcbiAgICAgICAgdHJ5IHtcbiAgICAgICAgICBsZXQgeyBmaWVsZHMgfSA9IGFyZ3M7XG4gICAgICAgICAgaWYgKCFmaWVsZHMpIGZpZWxkcyA9IHt9O1xuICAgICAgICAgIGNvbnN0IHsgY29uZmlnLCBhdXRoLCBpbmZvIH0gPSBjb250ZXh0O1xuXG4gICAgICAgICAgY29uc3QgcGFyc2VGaWVsZHMgPSBhd2FpdCB0cmFuc2Zvcm1UeXBlcygnY3JlYXRlJywgZmllbGRzLCB7XG4gICAgICAgICAgICBjbGFzc05hbWUsXG4gICAgICAgICAgICBwYXJzZUdyYXBoUUxTY2hlbWEsXG4gICAgICAgICAgICByZXE6IHsgY29uZmlnLCBhdXRoLCBpbmZvIH0sXG4gICAgICAgICAgfSk7XG5cbiAgICAgICAgICBjb25zdCBjcmVhdGVkT2JqZWN0ID0gYXdhaXQgb2JqZWN0c011dGF0aW9ucy5jcmVhdGVPYmplY3QoXG4gICAgICAgICAgICBjbGFzc05hbWUsXG4gICAgICAgICAgICBwYXJzZUZpZWxkcyxcbiAgICAgICAgICAgIGNvbmZpZyxcbiAgICAgICAgICAgIGF1dGgsXG4gICAgICAgICAgICBpbmZvXG4gICAgICAgICAgKTtcbiAgICAgICAgICBjb25zdCBzZWxlY3RlZEZpZWxkcyA9IGdldEZpZWxkTmFtZXMobXV0YXRpb25JbmZvKVxuICAgICAgICAgICAgLmZpbHRlcihmaWVsZCA9PiBmaWVsZC5zdGFydHNXaXRoKGAke2dldEdyYXBoUUxRdWVyeU5hbWV9LmApKVxuICAgICAgICAgICAgLm1hcChmaWVsZCA9PiBmaWVsZC5yZXBsYWNlKGAke2dldEdyYXBoUUxRdWVyeU5hbWV9LmAsICcnKSk7XG4gICAgICAgICAgY29uc3QgeyBrZXlzLCBpbmNsdWRlIH0gPSBleHRyYWN0S2V5c0FuZEluY2x1ZGUoc2VsZWN0ZWRGaWVsZHMpO1xuICAgICAgICAgIGNvbnN0IHsga2V5czogcmVxdWlyZWRLZXlzLCBuZWVkR2V0IH0gPSBnZXRPbmx5UmVxdWlyZWRGaWVsZHMoXG4gICAgICAgICAgICBmaWVsZHMsXG4gICAgICAgICAgICBrZXlzLFxuICAgICAgICAgICAgaW5jbHVkZSxcbiAgICAgICAgICAgIFsnaWQnLCAnb2JqZWN0SWQnLCAnY3JlYXRlZEF0JywgJ3VwZGF0ZWRBdCddXG4gICAgICAgICAgKTtcbiAgICAgICAgICBsZXQgb3B0aW1pemVkT2JqZWN0ID0ge307XG4gICAgICAgICAgaWYgKG5lZWRHZXQpIHtcbiAgICAgICAgICAgIG9wdGltaXplZE9iamVjdCA9IGF3YWl0IG9iamVjdHNRdWVyaWVzLmdldE9iamVjdChcbiAgICAgICAgICAgICAgY2xhc3NOYW1lLFxuICAgICAgICAgICAgICBjcmVhdGVkT2JqZWN0Lm9iamVjdElkLFxuICAgICAgICAgICAgICByZXF1aXJlZEtleXMsXG4gICAgICAgICAgICAgIGluY2x1ZGUsXG4gICAgICAgICAgICAgIHVuZGVmaW5lZCxcbiAgICAgICAgICAgICAgdW5kZWZpbmVkLFxuICAgICAgICAgICAgICBjb25maWcsXG4gICAgICAgICAgICAgIGF1dGgsXG4gICAgICAgICAgICAgIGluZm9cbiAgICAgICAgICAgICk7XG4gICAgICAgICAgfVxuICAgICAgICAgIHJldHVybiB7XG4gICAgICAgICAgICBbZ2V0R3JhcGhRTFF1ZXJ5TmFtZV06IHtcbiAgICAgICAgICAgICAgLi4uY3JlYXRlZE9iamVjdCxcbiAgICAgICAgICAgICAgdXBkYXRlZEF0OiBjcmVhdGVkT2JqZWN0LmNyZWF0ZWRBdCxcbiAgICAgICAgICAgICAgLi4ucGFyc2VGaWVsZHMsXG4gICAgICAgICAgICAgIC4uLm9wdGltaXplZE9iamVjdCxcbiAgICAgICAgICAgIH0sXG4gICAgICAgICAgfTtcbiAgICAgICAgfSBjYXRjaCAoZSkge1xuICAgICAgICAgIHBhcnNlR3JhcGhRTFNjaGVtYS5oYW5kbGVFcnJvcihlKTtcbiAgICAgICAgfVxuICAgICAgfSxcbiAgICB9KTtcblxuICAgIGlmIChcbiAgICAgIHBhcnNlR3JhcGhRTFNjaGVtYS5hZGRHcmFwaFFMVHlwZShcbiAgICAgICAgY3JlYXRlR3JhcGhRTE11dGF0aW9uLmFyZ3MuaW5wdXQudHlwZS5vZlR5cGVcbiAgICAgICkgJiZcbiAgICAgIHBhcnNlR3JhcGhRTFNjaGVtYS5hZGRHcmFwaFFMVHlwZShjcmVhdGVHcmFwaFFMTXV0YXRpb24udHlwZSlcbiAgICApIHtcbiAgICAgIHBhcnNlR3JhcGhRTFNjaGVtYS5hZGRHcmFwaFFMTXV0YXRpb24oXG4gICAgICAgIGNyZWF0ZUdyYXBoUUxNdXRhdGlvbk5hbWUsXG4gICAgICAgIGNyZWF0ZUdyYXBoUUxNdXRhdGlvblxuICAgICAgKTtcbiAgICB9XG4gIH1cblxuICBpZiAoaXNVcGRhdGVFbmFibGVkKSB7XG4gICAgY29uc3QgdXBkYXRlR3JhcGhRTE11dGF0aW9uTmFtZSA9XG4gICAgICB1cGRhdGVBbGlhcyB8fCBgdXBkYXRlJHtncmFwaFFMQ2xhc3NOYW1lfWA7XG4gICAgY29uc3QgdXBkYXRlR3JhcGhRTE11dGF0aW9uID0gbXV0YXRpb25XaXRoQ2xpZW50TXV0YXRpb25JZCh7XG4gICAgICBuYW1lOiBgVXBkYXRlJHtncmFwaFFMQ2xhc3NOYW1lfWAsXG4gICAgICBkZXNjcmlwdGlvbjogYFRoZSAke3VwZGF0ZUdyYXBoUUxNdXRhdGlvbk5hbWV9IG11dGF0aW9uIGNhbiBiZSB1c2VkIHRvIHVwZGF0ZSBhbiBvYmplY3Qgb2YgdGhlICR7Z3JhcGhRTENsYXNzTmFtZX0gY2xhc3MuYCxcbiAgICAgIGlucHV0RmllbGRzOiB7XG4gICAgICAgIGlkOiBkZWZhdWx0R3JhcGhRTFR5cGVzLkdMT0JBTF9PUl9PQkpFQ1RfSURfQVRULFxuICAgICAgICBmaWVsZHM6IHtcbiAgICAgICAgICBkZXNjcmlwdGlvbjpcbiAgICAgICAgICAgICdUaGVzZSBhcmUgdGhlIGZpZWxkcyB0aGF0IHdpbGwgYmUgdXNlZCB0byB1cGRhdGUgdGhlIG9iamVjdC4nLFxuICAgICAgICAgIHR5cGU6IGNsYXNzR3JhcGhRTFVwZGF0ZVR5cGUgfHwgZGVmYXVsdEdyYXBoUUxUeXBlcy5PQkpFQ1QsXG4gICAgICAgIH0sXG4gICAgICB9LFxuICAgICAgb3V0cHV0RmllbGRzOiB7XG4gICAgICAgIFtnZXRHcmFwaFFMUXVlcnlOYW1lXToge1xuICAgICAgICAgIGRlc2NyaXB0aW9uOiAnVGhpcyBpcyB0aGUgdXBkYXRlZCBvYmplY3QuJyxcbiAgICAgICAgICB0eXBlOiBuZXcgR3JhcGhRTE5vbk51bGwoXG4gICAgICAgICAgICBjbGFzc0dyYXBoUUxPdXRwdXRUeXBlIHx8IGRlZmF1bHRHcmFwaFFMVHlwZXMuT0JKRUNUXG4gICAgICAgICAgKSxcbiAgICAgICAgfSxcbiAgICAgIH0sXG4gICAgICBtdXRhdGVBbmRHZXRQYXlsb2FkOiBhc3luYyAoYXJncywgY29udGV4dCwgbXV0YXRpb25JbmZvKSA9PiB7XG4gICAgICAgIHRyeSB7XG4gICAgICAgICAgbGV0IHsgaWQsIGZpZWxkcyB9ID0gYXJncztcbiAgICAgICAgICBpZiAoIWZpZWxkcykgZmllbGRzID0ge307XG4gICAgICAgICAgY29uc3QgeyBjb25maWcsIGF1dGgsIGluZm8gfSA9IGNvbnRleHQ7XG5cbiAgICAgICAgICBjb25zdCBnbG9iYWxJZE9iamVjdCA9IGZyb21HbG9iYWxJZChpZCk7XG5cbiAgICAgICAgICBpZiAoZ2xvYmFsSWRPYmplY3QudHlwZSA9PT0gY2xhc3NOYW1lKSB7XG4gICAgICAgICAgICBpZCA9IGdsb2JhbElkT2JqZWN0LmlkO1xuICAgICAgICAgIH1cblxuICAgICAgICAgIGNvbnN0IHBhcnNlRmllbGRzID0gYXdhaXQgdHJhbnNmb3JtVHlwZXMoJ3VwZGF0ZScsIGZpZWxkcywge1xuICAgICAgICAgICAgY2xhc3NOYW1lLFxuICAgICAgICAgICAgcGFyc2VHcmFwaFFMU2NoZW1hLFxuICAgICAgICAgICAgcmVxOiB7IGNvbmZpZywgYXV0aCwgaW5mbyB9LFxuICAgICAgICAgIH0pO1xuXG4gICAgICAgICAgY29uc3QgdXBkYXRlZE9iamVjdCA9IGF3YWl0IG9iamVjdHNNdXRhdGlvbnMudXBkYXRlT2JqZWN0KFxuICAgICAgICAgICAgY2xhc3NOYW1lLFxuICAgICAgICAgICAgaWQsXG4gICAgICAgICAgICBwYXJzZUZpZWxkcyxcbiAgICAgICAgICAgIGNvbmZpZyxcbiAgICAgICAgICAgIGF1dGgsXG4gICAgICAgICAgICBpbmZvXG4gICAgICAgICAgKTtcblxuICAgICAgICAgIGNvbnN0IHNlbGVjdGVkRmllbGRzID0gZ2V0RmllbGROYW1lcyhtdXRhdGlvbkluZm8pXG4gICAgICAgICAgICAuZmlsdGVyKGZpZWxkID0+IGZpZWxkLnN0YXJ0c1dpdGgoYCR7Z2V0R3JhcGhRTFF1ZXJ5TmFtZX0uYCkpXG4gICAgICAgICAgICAubWFwKGZpZWxkID0+IGZpZWxkLnJlcGxhY2UoYCR7Z2V0R3JhcGhRTFF1ZXJ5TmFtZX0uYCwgJycpKTtcbiAgICAgICAgICBjb25zdCB7IGtleXMsIGluY2x1ZGUgfSA9IGV4dHJhY3RLZXlzQW5kSW5jbHVkZShzZWxlY3RlZEZpZWxkcyk7XG4gICAgICAgICAgY29uc3QgeyBrZXlzOiByZXF1aXJlZEtleXMsIG5lZWRHZXQgfSA9IGdldE9ubHlSZXF1aXJlZEZpZWxkcyhcbiAgICAgICAgICAgIGZpZWxkcyxcbiAgICAgICAgICAgIGtleXMsXG4gICAgICAgICAgICBpbmNsdWRlLFxuICAgICAgICAgICAgWydpZCcsICdvYmplY3RJZCcsICd1cGRhdGVkQXQnXVxuICAgICAgICAgICk7XG5cbiAgICAgICAgICBsZXQgb3B0aW1pemVkT2JqZWN0ID0ge307XG4gICAgICAgICAgaWYgKG5lZWRHZXQpIHtcbiAgICAgICAgICAgIG9wdGltaXplZE9iamVjdCA9IGF3YWl0IG9iamVjdHNRdWVyaWVzLmdldE9iamVjdChcbiAgICAgICAgICAgICAgY2xhc3NOYW1lLFxuICAgICAgICAgICAgICBpZCxcbiAgICAgICAgICAgICAgcmVxdWlyZWRLZXlzLFxuICAgICAgICAgICAgICBpbmNsdWRlLFxuICAgICAgICAgICAgICB1bmRlZmluZWQsXG4gICAgICAgICAgICAgIHVuZGVmaW5lZCxcbiAgICAgICAgICAgICAgY29uZmlnLFxuICAgICAgICAgICAgICBhdXRoLFxuICAgICAgICAgICAgICBpbmZvXG4gICAgICAgICAgICApO1xuICAgICAgICAgIH1cbiAgICAgICAgICByZXR1cm4ge1xuICAgICAgICAgICAgW2dldEdyYXBoUUxRdWVyeU5hbWVdOiB7XG4gICAgICAgICAgICAgIG9iamVjdElkOiBpZCxcbiAgICAgICAgICAgICAgLi4udXBkYXRlZE9iamVjdCxcbiAgICAgICAgICAgICAgLi4ucGFyc2VGaWVsZHMsXG4gICAgICAgICAgICAgIC4uLm9wdGltaXplZE9iamVjdCxcbiAgICAgICAgICAgIH0sXG4gICAgICAgICAgfTtcbiAgICAgICAgfSBjYXRjaCAoZSkge1xuICAgICAgICAgIHBhcnNlR3JhcGhRTFNjaGVtYS5oYW5kbGVFcnJvcihlKTtcbiAgICAgICAgfVxuICAgICAgfSxcbiAgICB9KTtcblxuICAgIGlmIChcbiAgICAgIHBhcnNlR3JhcGhRTFNjaGVtYS5hZGRHcmFwaFFMVHlwZShcbiAgICAgICAgdXBkYXRlR3JhcGhRTE11dGF0aW9uLmFyZ3MuaW5wdXQudHlwZS5vZlR5cGVcbiAgICAgICkgJiZcbiAgICAgIHBhcnNlR3JhcGhRTFNjaGVtYS5hZGRHcmFwaFFMVHlwZSh1cGRhdGVHcmFwaFFMTXV0YXRpb24udHlwZSlcbiAgICApIHtcbiAgICAgIHBhcnNlR3JhcGhRTFNjaGVtYS5hZGRHcmFwaFFMTXV0YXRpb24oXG4gICAgICAgIHVwZGF0ZUdyYXBoUUxNdXRhdGlvbk5hbWUsXG4gICAgICAgIHVwZGF0ZUdyYXBoUUxNdXRhdGlvblxuICAgICAgKTtcbiAgICB9XG4gIH1cblxuICBpZiAoaXNEZXN0cm95RW5hYmxlZCkge1xuICAgIGNvbnN0IGRlbGV0ZUdyYXBoUUxNdXRhdGlvbk5hbWUgPVxuICAgICAgZGVzdHJveUFsaWFzIHx8IGBkZWxldGUke2dyYXBoUUxDbGFzc05hbWV9YDtcbiAgICBjb25zdCBkZWxldGVHcmFwaFFMTXV0YXRpb24gPSBtdXRhdGlvbldpdGhDbGllbnRNdXRhdGlvbklkKHtcbiAgICAgIG5hbWU6IGBEZWxldGUke2dyYXBoUUxDbGFzc05hbWV9YCxcbiAgICAgIGRlc2NyaXB0aW9uOiBgVGhlICR7ZGVsZXRlR3JhcGhRTE11dGF0aW9uTmFtZX0gbXV0YXRpb24gY2FuIGJlIHVzZWQgdG8gZGVsZXRlIGFuIG9iamVjdCBvZiB0aGUgJHtncmFwaFFMQ2xhc3NOYW1lfSBjbGFzcy5gLFxuICAgICAgaW5wdXRGaWVsZHM6IHtcbiAgICAgICAgaWQ6IGRlZmF1bHRHcmFwaFFMVHlwZXMuR0xPQkFMX09SX09CSkVDVF9JRF9BVFQsXG4gICAgICB9LFxuICAgICAgb3V0cHV0RmllbGRzOiB7XG4gICAgICAgIFtnZXRHcmFwaFFMUXVlcnlOYW1lXToge1xuICAgICAgICAgIGRlc2NyaXB0aW9uOiAnVGhpcyBpcyB0aGUgZGVsZXRlZCBvYmplY3QuJyxcbiAgICAgICAgICB0eXBlOiBuZXcgR3JhcGhRTE5vbk51bGwoXG4gICAgICAgICAgICBjbGFzc0dyYXBoUUxPdXRwdXRUeXBlIHx8IGRlZmF1bHRHcmFwaFFMVHlwZXMuT0JKRUNUXG4gICAgICAgICAgKSxcbiAgICAgICAgfSxcbiAgICAgIH0sXG4gICAgICBtdXRhdGVBbmRHZXRQYXlsb2FkOiBhc3luYyAoYXJncywgY29udGV4dCwgbXV0YXRpb25JbmZvKSA9PiB7XG4gICAgICAgIHRyeSB7XG4gICAgICAgICAgbGV0IHsgaWQgfSA9IGFyZ3M7XG4gICAgICAgICAgY29uc3QgeyBjb25maWcsIGF1dGgsIGluZm8gfSA9IGNvbnRleHQ7XG5cbiAgICAgICAgICBjb25zdCBnbG9iYWxJZE9iamVjdCA9IGZyb21HbG9iYWxJZChpZCk7XG5cbiAgICAgICAgICBpZiAoZ2xvYmFsSWRPYmplY3QudHlwZSA9PT0gY2xhc3NOYW1lKSB7XG4gICAgICAgICAgICBpZCA9IGdsb2JhbElkT2JqZWN0LmlkO1xuICAgICAgICAgIH1cblxuICAgICAgICAgIGNvbnN0IHNlbGVjdGVkRmllbGRzID0gZ2V0RmllbGROYW1lcyhtdXRhdGlvbkluZm8pXG4gICAgICAgICAgICAuZmlsdGVyKGZpZWxkID0+IGZpZWxkLnN0YXJ0c1dpdGgoYCR7Z2V0R3JhcGhRTFF1ZXJ5TmFtZX0uYCkpXG4gICAgICAgICAgICAubWFwKGZpZWxkID0+IGZpZWxkLnJlcGxhY2UoYCR7Z2V0R3JhcGhRTFF1ZXJ5TmFtZX0uYCwgJycpKTtcbiAgICAgICAgICBjb25zdCB7IGtleXMsIGluY2x1ZGUgfSA9IGV4dHJhY3RLZXlzQW5kSW5jbHVkZShzZWxlY3RlZEZpZWxkcyk7XG4gICAgICAgICAgbGV0IG9wdGltaXplZE9iamVjdCA9IHt9O1xuICAgICAgICAgIGlmIChcbiAgICAgICAgICAgIGtleXMgJiZcbiAgICAgICAgICAgIGtleXMuc3BsaXQoJywnKS5maWx0ZXIoa2V5ID0+ICFbJ2lkJywgJ29iamVjdElkJ10uaW5jbHVkZXMoa2V5KSlcbiAgICAgICAgICAgICAgLmxlbmd0aCA+IDBcbiAgICAgICAgICApIHtcbiAgICAgICAgICAgIG9wdGltaXplZE9iamVjdCA9IGF3YWl0IG9iamVjdHNRdWVyaWVzLmdldE9iamVjdChcbiAgICAgICAgICAgICAgY2xhc3NOYW1lLFxuICAgICAgICAgICAgICBpZCxcbiAgICAgICAgICAgICAga2V5cyxcbiAgICAgICAgICAgICAgaW5jbHVkZSxcbiAgICAgICAgICAgICAgdW5kZWZpbmVkLFxuICAgICAgICAgICAgICB1bmRlZmluZWQsXG4gICAgICAgICAgICAgIGNvbmZpZyxcbiAgICAgICAgICAgICAgYXV0aCxcbiAgICAgICAgICAgICAgaW5mb1xuICAgICAgICAgICAgKTtcbiAgICAgICAgICB9XG4gICAgICAgICAgYXdhaXQgb2JqZWN0c011dGF0aW9ucy5kZWxldGVPYmplY3QoXG4gICAgICAgICAgICBjbGFzc05hbWUsXG4gICAgICAgICAgICBpZCxcbiAgICAgICAgICAgIGNvbmZpZyxcbiAgICAgICAgICAgIGF1dGgsXG4gICAgICAgICAgICBpbmZvXG4gICAgICAgICAgKTtcbiAgICAgICAgICByZXR1cm4ge1xuICAgICAgICAgICAgW2dldEdyYXBoUUxRdWVyeU5hbWVdOiB7XG4gICAgICAgICAgICAgIG9iamVjdElkOiBpZCxcbiAgICAgICAgICAgICAgLi4ub3B0aW1pemVkT2JqZWN0LFxuICAgICAgICAgICAgfSxcbiAgICAgICAgICB9O1xuICAgICAgICB9IGNhdGNoIChlKSB7XG4gICAgICAgICAgcGFyc2VHcmFwaFFMU2NoZW1hLmhhbmRsZUVycm9yKGUpO1xuICAgICAgICB9XG4gICAgICB9LFxuICAgIH0pO1xuXG4gICAgaWYgKFxuICAgICAgcGFyc2VHcmFwaFFMU2NoZW1hLmFkZEdyYXBoUUxUeXBlKFxuICAgICAgICBkZWxldGVHcmFwaFFMTXV0YXRpb24uYXJncy5pbnB1dC50eXBlLm9mVHlwZVxuICAgICAgKSAmJlxuICAgICAgcGFyc2VHcmFwaFFMU2NoZW1hLmFkZEdyYXBoUUxUeXBlKGRlbGV0ZUdyYXBoUUxNdXRhdGlvbi50eXBlKVxuICAgICkge1xuICAgICAgcGFyc2VHcmFwaFFMU2NoZW1hLmFkZEdyYXBoUUxNdXRhdGlvbihcbiAgICAgICAgZGVsZXRlR3JhcGhRTE11dGF0aW9uTmFtZSxcbiAgICAgICAgZGVsZXRlR3JhcGhRTE11dGF0aW9uXG4gICAgICApO1xuICAgIH1cbiAgfVxufTtcblxuZXhwb3J0IHsgbG9hZCB9O1xuIl19