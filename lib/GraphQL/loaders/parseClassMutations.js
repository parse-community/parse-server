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
function ownKeys(object, enumerableOnly) { var keys = Object.keys(object); if (Object.getOwnPropertySymbols) { var symbols = Object.getOwnPropertySymbols(object); enumerableOnly && (symbols = symbols.filter(function (sym) { return Object.getOwnPropertyDescriptor(object, sym).enumerable; })), keys.push.apply(keys, symbols); } return keys; }
function _objectSpread(target) { for (var i = 1; i < arguments.length; i++) { var source = null != arguments[i] ? arguments[i] : {}; i % 2 ? ownKeys(Object(source), !0).forEach(function (key) { _defineProperty(target, key, source[key]); }) : Object.getOwnPropertyDescriptors ? Object.defineProperties(target, Object.getOwnPropertyDescriptors(source)) : ownKeys(Object(source)).forEach(function (key) { Object.defineProperty(target, key, Object.getOwnPropertyDescriptor(source, key)); }); } return target; }
function _defineProperty(obj, key, value) { key = _toPropertyKey(key); if (key in obj) { Object.defineProperty(obj, key, { value: value, enumerable: true, configurable: true, writable: true }); } else { obj[key] = value; } return obj; }
function _toPropertyKey(arg) { var key = _toPrimitive(arg, "string"); return typeof key === "symbol" ? key : String(key); }
function _toPrimitive(input, hint) { if (typeof input !== "object" || input === null) return input; var prim = input[Symbol.toPrimitive]; if (prim !== undefined) { var res = prim.call(input, hint || "default"); if (typeof res !== "object") return res; throw new TypeError("@@toPrimitive must return a primitive value."); } return (hint === "string" ? String : Number)(input); }
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
            originalFields: args.fields || {},
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
            originalFields: args.fields || {},
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
//# sourceMappingURL=data:application/json;charset=utf-8;base64,eyJ2ZXJzaW9uIjozLCJuYW1lcyI6WyJmaWx0ZXJEZWxldGVkRmllbGRzIiwiZmllbGRzIiwiT2JqZWN0Iiwia2V5cyIsInJlZHVjZSIsImFjYyIsImtleSIsIl9fb3AiLCJnZXRPbmx5UmVxdWlyZWRGaWVsZHMiLCJ1cGRhdGVkRmllbGRzIiwic2VsZWN0ZWRGaWVsZHNTdHJpbmciLCJpbmNsdWRlZEZpZWxkc1N0cmluZyIsIm5hdGl2ZU9iamVjdEZpZWxkcyIsImluY2x1ZGVkRmllbGRzIiwic3BsaXQiLCJzZWxlY3RlZEZpZWxkcyIsIm1pc3NpbmdGaWVsZHMiLCJmaWx0ZXIiLCJmaWVsZCIsImluY2x1ZGVzIiwiam9pbiIsImxlbmd0aCIsIm5lZWRHZXQiLCJsb2FkIiwicGFyc2VHcmFwaFFMU2NoZW1hIiwicGFyc2VDbGFzcyIsInBhcnNlQ2xhc3NDb25maWciLCJjbGFzc05hbWUiLCJncmFwaFFMQ2xhc3NOYW1lIiwidHJhbnNmb3JtQ2xhc3NOYW1lVG9HcmFwaFFMIiwiZ2V0R3JhcGhRTFF1ZXJ5TmFtZSIsImNoYXJBdCIsInRvTG93ZXJDYXNlIiwic2xpY2UiLCJjcmVhdGUiLCJpc0NyZWF0ZUVuYWJsZWQiLCJ1cGRhdGUiLCJpc1VwZGF0ZUVuYWJsZWQiLCJkZXN0cm95IiwiaXNEZXN0cm95RW5hYmxlZCIsImNyZWF0ZUFsaWFzIiwidXBkYXRlQWxpYXMiLCJkZXN0cm95QWxpYXMiLCJnZXRQYXJzZUNsYXNzTXV0YXRpb25Db25maWciLCJjbGFzc0dyYXBoUUxDcmVhdGVUeXBlIiwiY2xhc3NHcmFwaFFMVXBkYXRlVHlwZSIsImNsYXNzR3JhcGhRTE91dHB1dFR5cGUiLCJwYXJzZUNsYXNzVHlwZXMiLCJjcmVhdGVHcmFwaFFMTXV0YXRpb25OYW1lIiwiY3JlYXRlR3JhcGhRTE11dGF0aW9uIiwibXV0YXRpb25XaXRoQ2xpZW50TXV0YXRpb25JZCIsIm5hbWUiLCJkZXNjcmlwdGlvbiIsImlucHV0RmllbGRzIiwidHlwZSIsImRlZmF1bHRHcmFwaFFMVHlwZXMiLCJPQkpFQ1QiLCJvdXRwdXRGaWVsZHMiLCJHcmFwaFFMTm9uTnVsbCIsIm11dGF0ZUFuZEdldFBheWxvYWQiLCJhcmdzIiwiY29udGV4dCIsIm11dGF0aW9uSW5mbyIsImRlZXBjb3B5IiwiY29uZmlnIiwiYXV0aCIsImluZm8iLCJwYXJzZUZpZWxkcyIsInRyYW5zZm9ybVR5cGVzIiwib3JpZ2luYWxGaWVsZHMiLCJyZXEiLCJjcmVhdGVkT2JqZWN0Iiwib2JqZWN0c011dGF0aW9ucyIsImNyZWF0ZU9iamVjdCIsImdldEZpZWxkTmFtZXMiLCJzdGFydHNXaXRoIiwibWFwIiwicmVwbGFjZSIsImluY2x1ZGUiLCJleHRyYWN0S2V5c0FuZEluY2x1ZGUiLCJyZXF1aXJlZEtleXMiLCJuZWVkVG9HZXRBbGxLZXlzIiwib2JqZWN0c1F1ZXJpZXMiLCJwYXJzZUNsYXNzZXMiLCJvcHRpbWl6ZWRPYmplY3QiLCJnZXRPYmplY3QiLCJvYmplY3RJZCIsInVuZGVmaW5lZCIsInVwZGF0ZWRBdCIsImNyZWF0ZWRBdCIsImUiLCJoYW5kbGVFcnJvciIsImFkZEdyYXBoUUxUeXBlIiwiaW5wdXQiLCJvZlR5cGUiLCJhZGRHcmFwaFFMTXV0YXRpb24iLCJ1cGRhdGVHcmFwaFFMTXV0YXRpb25OYW1lIiwidXBkYXRlR3JhcGhRTE11dGF0aW9uIiwiaWQiLCJHTE9CQUxfT1JfT0JKRUNUX0lEX0FUVCIsImdsb2JhbElkT2JqZWN0IiwiZnJvbUdsb2JhbElkIiwidXBkYXRlZE9iamVjdCIsInVwZGF0ZU9iamVjdCIsImRlbGV0ZUdyYXBoUUxNdXRhdGlvbk5hbWUiLCJkZWxldGVHcmFwaFFMTXV0YXRpb24iLCJkZWxldGVPYmplY3QiXSwic291cmNlcyI6WyIuLi8uLi8uLi9zcmMvR3JhcGhRTC9sb2FkZXJzL3BhcnNlQ2xhc3NNdXRhdGlvbnMuanMiXSwic291cmNlc0NvbnRlbnQiOlsiaW1wb3J0IHsgR3JhcGhRTE5vbk51bGwgfSBmcm9tICdncmFwaHFsJztcbmltcG9ydCB7IGZyb21HbG9iYWxJZCwgbXV0YXRpb25XaXRoQ2xpZW50TXV0YXRpb25JZCB9IGZyb20gJ2dyYXBocWwtcmVsYXknO1xuaW1wb3J0IGdldEZpZWxkTmFtZXMgZnJvbSAnZ3JhcGhxbC1saXN0LWZpZWxkcyc7XG5pbXBvcnQgZGVlcGNvcHkgZnJvbSAnZGVlcGNvcHknO1xuaW1wb3J0ICogYXMgZGVmYXVsdEdyYXBoUUxUeXBlcyBmcm9tICcuL2RlZmF1bHRHcmFwaFFMVHlwZXMnO1xuaW1wb3J0IHsgZXh0cmFjdEtleXNBbmRJbmNsdWRlLCBnZXRQYXJzZUNsYXNzTXV0YXRpb25Db25maWcgfSBmcm9tICcuLi9wYXJzZUdyYXBoUUxVdGlscyc7XG5pbXBvcnQgKiBhcyBvYmplY3RzTXV0YXRpb25zIGZyb20gJy4uL2hlbHBlcnMvb2JqZWN0c011dGF0aW9ucyc7XG5pbXBvcnQgKiBhcyBvYmplY3RzUXVlcmllcyBmcm9tICcuLi9oZWxwZXJzL29iamVjdHNRdWVyaWVzJztcbmltcG9ydCB7IFBhcnNlR3JhcGhRTENsYXNzQ29uZmlnIH0gZnJvbSAnLi4vLi4vQ29udHJvbGxlcnMvUGFyc2VHcmFwaFFMQ29udHJvbGxlcic7XG5pbXBvcnQgeyB0cmFuc2Zvcm1DbGFzc05hbWVUb0dyYXBoUUwgfSBmcm9tICcuLi90cmFuc2Zvcm1lcnMvY2xhc3NOYW1lJztcbmltcG9ydCB7IHRyYW5zZm9ybVR5cGVzIH0gZnJvbSAnLi4vdHJhbnNmb3JtZXJzL211dGF0aW9uJztcblxuY29uc3QgZmlsdGVyRGVsZXRlZEZpZWxkcyA9IGZpZWxkcyA9PlxuICBPYmplY3Qua2V5cyhmaWVsZHMpLnJlZHVjZSgoYWNjLCBrZXkpID0+IHtcbiAgICBpZiAodHlwZW9mIGZpZWxkc1trZXldID09PSAnb2JqZWN0JyAmJiBmaWVsZHNba2V5XT8uX19vcCA9PT0gJ0RlbGV0ZScpIHtcbiAgICAgIGFjY1trZXldID0gbnVsbDtcbiAgICB9XG4gICAgcmV0dXJuIGFjYztcbiAgfSwgZmllbGRzKTtcblxuY29uc3QgZ2V0T25seVJlcXVpcmVkRmllbGRzID0gKFxuICB1cGRhdGVkRmllbGRzLFxuICBzZWxlY3RlZEZpZWxkc1N0cmluZyxcbiAgaW5jbHVkZWRGaWVsZHNTdHJpbmcsXG4gIG5hdGl2ZU9iamVjdEZpZWxkc1xuKSA9PiB7XG4gIGNvbnN0IGluY2x1ZGVkRmllbGRzID0gaW5jbHVkZWRGaWVsZHNTdHJpbmcgPyBpbmNsdWRlZEZpZWxkc1N0cmluZy5zcGxpdCgnLCcpIDogW107XG4gIGNvbnN0IHNlbGVjdGVkRmllbGRzID0gc2VsZWN0ZWRGaWVsZHNTdHJpbmcgPyBzZWxlY3RlZEZpZWxkc1N0cmluZy5zcGxpdCgnLCcpIDogW107XG4gIGNvbnN0IG1pc3NpbmdGaWVsZHMgPSBzZWxlY3RlZEZpZWxkc1xuICAgIC5maWx0ZXIoZmllbGQgPT4gIW5hdGl2ZU9iamVjdEZpZWxkcy5pbmNsdWRlcyhmaWVsZCkgfHwgaW5jbHVkZWRGaWVsZHMuaW5jbHVkZXMoZmllbGQpKVxuICAgIC5qb2luKCcsJyk7XG4gIGlmICghbWlzc2luZ0ZpZWxkcy5sZW5ndGgpIHtcbiAgICByZXR1cm4geyBuZWVkR2V0OiBmYWxzZSwga2V5czogJycgfTtcbiAgfSBlbHNlIHtcbiAgICByZXR1cm4geyBuZWVkR2V0OiB0cnVlLCBrZXlzOiBtaXNzaW5nRmllbGRzIH07XG4gIH1cbn07XG5cbmNvbnN0IGxvYWQgPSBmdW5jdGlvbiAocGFyc2VHcmFwaFFMU2NoZW1hLCBwYXJzZUNsYXNzLCBwYXJzZUNsYXNzQ29uZmlnOiA/UGFyc2VHcmFwaFFMQ2xhc3NDb25maWcpIHtcbiAgY29uc3QgY2xhc3NOYW1lID0gcGFyc2VDbGFzcy5jbGFzc05hbWU7XG4gIGNvbnN0IGdyYXBoUUxDbGFzc05hbWUgPSB0cmFuc2Zvcm1DbGFzc05hbWVUb0dyYXBoUUwoY2xhc3NOYW1lKTtcbiAgY29uc3QgZ2V0R3JhcGhRTFF1ZXJ5TmFtZSA9IGdyYXBoUUxDbGFzc05hbWUuY2hhckF0KDApLnRvTG93ZXJDYXNlKCkgKyBncmFwaFFMQ2xhc3NOYW1lLnNsaWNlKDEpO1xuXG4gIGNvbnN0IHtcbiAgICBjcmVhdGU6IGlzQ3JlYXRlRW5hYmxlZCA9IHRydWUsXG4gICAgdXBkYXRlOiBpc1VwZGF0ZUVuYWJsZWQgPSB0cnVlLFxuICAgIGRlc3Ryb3k6IGlzRGVzdHJveUVuYWJsZWQgPSB0cnVlLFxuICAgIGNyZWF0ZUFsaWFzOiBjcmVhdGVBbGlhcyA9ICcnLFxuICAgIHVwZGF0ZUFsaWFzOiB1cGRhdGVBbGlhcyA9ICcnLFxuICAgIGRlc3Ryb3lBbGlhczogZGVzdHJveUFsaWFzID0gJycsXG4gIH0gPSBnZXRQYXJzZUNsYXNzTXV0YXRpb25Db25maWcocGFyc2VDbGFzc0NvbmZpZyk7XG5cbiAgY29uc3Qge1xuICAgIGNsYXNzR3JhcGhRTENyZWF0ZVR5cGUsXG4gICAgY2xhc3NHcmFwaFFMVXBkYXRlVHlwZSxcbiAgICBjbGFzc0dyYXBoUUxPdXRwdXRUeXBlLFxuICB9ID0gcGFyc2VHcmFwaFFMU2NoZW1hLnBhcnNlQ2xhc3NUeXBlc1tjbGFzc05hbWVdO1xuXG4gIGlmIChpc0NyZWF0ZUVuYWJsZWQpIHtcbiAgICBjb25zdCBjcmVhdGVHcmFwaFFMTXV0YXRpb25OYW1lID0gY3JlYXRlQWxpYXMgfHwgYGNyZWF0ZSR7Z3JhcGhRTENsYXNzTmFtZX1gO1xuICAgIGNvbnN0IGNyZWF0ZUdyYXBoUUxNdXRhdGlvbiA9IG11dGF0aW9uV2l0aENsaWVudE11dGF0aW9uSWQoe1xuICAgICAgbmFtZTogYENyZWF0ZSR7Z3JhcGhRTENsYXNzTmFtZX1gLFxuICAgICAgZGVzY3JpcHRpb246IGBUaGUgJHtjcmVhdGVHcmFwaFFMTXV0YXRpb25OYW1lfSBtdXRhdGlvbiBjYW4gYmUgdXNlZCB0byBjcmVhdGUgYSBuZXcgb2JqZWN0IG9mIHRoZSAke2dyYXBoUUxDbGFzc05hbWV9IGNsYXNzLmAsXG4gICAgICBpbnB1dEZpZWxkczoge1xuICAgICAgICBmaWVsZHM6IHtcbiAgICAgICAgICBkZXNjcmlwdGlvbjogJ1RoZXNlIGFyZSB0aGUgZmllbGRzIHRoYXQgd2lsbCBiZSB1c2VkIHRvIGNyZWF0ZSB0aGUgbmV3IG9iamVjdC4nLFxuICAgICAgICAgIHR5cGU6IGNsYXNzR3JhcGhRTENyZWF0ZVR5cGUgfHwgZGVmYXVsdEdyYXBoUUxUeXBlcy5PQkpFQ1QsXG4gICAgICAgIH0sXG4gICAgICB9LFxuICAgICAgb3V0cHV0RmllbGRzOiB7XG4gICAgICAgIFtnZXRHcmFwaFFMUXVlcnlOYW1lXToge1xuICAgICAgICAgIGRlc2NyaXB0aW9uOiAnVGhpcyBpcyB0aGUgY3JlYXRlZCBvYmplY3QuJyxcbiAgICAgICAgICB0eXBlOiBuZXcgR3JhcGhRTE5vbk51bGwoY2xhc3NHcmFwaFFMT3V0cHV0VHlwZSB8fCBkZWZhdWx0R3JhcGhRTFR5cGVzLk9CSkVDVCksXG4gICAgICAgIH0sXG4gICAgICB9LFxuICAgICAgbXV0YXRlQW5kR2V0UGF5bG9hZDogYXN5bmMgKGFyZ3MsIGNvbnRleHQsIG11dGF0aW9uSW5mbykgPT4ge1xuICAgICAgICB0cnkge1xuICAgICAgICAgIGxldCB7IGZpZWxkcyB9ID0gZGVlcGNvcHkoYXJncyk7XG4gICAgICAgICAgaWYgKCFmaWVsZHMpIGZpZWxkcyA9IHt9O1xuICAgICAgICAgIGNvbnN0IHsgY29uZmlnLCBhdXRoLCBpbmZvIH0gPSBjb250ZXh0O1xuXG4gICAgICAgICAgY29uc3QgcGFyc2VGaWVsZHMgPSBhd2FpdCB0cmFuc2Zvcm1UeXBlcygnY3JlYXRlJywgZmllbGRzLCB7XG4gICAgICAgICAgICBjbGFzc05hbWUsXG4gICAgICAgICAgICBwYXJzZUdyYXBoUUxTY2hlbWEsXG4gICAgICAgICAgICBvcmlnaW5hbEZpZWxkczogYXJncy5maWVsZHMgfHwge30sXG4gICAgICAgICAgICByZXE6IHsgY29uZmlnLCBhdXRoLCBpbmZvIH0sXG4gICAgICAgICAgfSk7XG5cbiAgICAgICAgICBjb25zdCBjcmVhdGVkT2JqZWN0ID0gYXdhaXQgb2JqZWN0c011dGF0aW9ucy5jcmVhdGVPYmplY3QoXG4gICAgICAgICAgICBjbGFzc05hbWUsXG4gICAgICAgICAgICBwYXJzZUZpZWxkcyxcbiAgICAgICAgICAgIGNvbmZpZyxcbiAgICAgICAgICAgIGF1dGgsXG4gICAgICAgICAgICBpbmZvXG4gICAgICAgICAgKTtcbiAgICAgICAgICBjb25zdCBzZWxlY3RlZEZpZWxkcyA9IGdldEZpZWxkTmFtZXMobXV0YXRpb25JbmZvKVxuICAgICAgICAgICAgLmZpbHRlcihmaWVsZCA9PiBmaWVsZC5zdGFydHNXaXRoKGAke2dldEdyYXBoUUxRdWVyeU5hbWV9LmApKVxuICAgICAgICAgICAgLm1hcChmaWVsZCA9PiBmaWVsZC5yZXBsYWNlKGAke2dldEdyYXBoUUxRdWVyeU5hbWV9LmAsICcnKSk7XG4gICAgICAgICAgY29uc3QgeyBrZXlzLCBpbmNsdWRlIH0gPSBleHRyYWN0S2V5c0FuZEluY2x1ZGUoc2VsZWN0ZWRGaWVsZHMpO1xuICAgICAgICAgIGNvbnN0IHsga2V5czogcmVxdWlyZWRLZXlzLCBuZWVkR2V0IH0gPSBnZXRPbmx5UmVxdWlyZWRGaWVsZHMoZmllbGRzLCBrZXlzLCBpbmNsdWRlLCBbXG4gICAgICAgICAgICAnaWQnLFxuICAgICAgICAgICAgJ29iamVjdElkJyxcbiAgICAgICAgICAgICdjcmVhdGVkQXQnLFxuICAgICAgICAgICAgJ3VwZGF0ZWRBdCcsXG4gICAgICAgICAgXSk7XG4gICAgICAgICAgY29uc3QgbmVlZFRvR2V0QWxsS2V5cyA9IG9iamVjdHNRdWVyaWVzLm5lZWRUb0dldEFsbEtleXMoXG4gICAgICAgICAgICBwYXJzZUNsYXNzLmZpZWxkcyxcbiAgICAgICAgICAgIGtleXMsXG4gICAgICAgICAgICBwYXJzZUdyYXBoUUxTY2hlbWEucGFyc2VDbGFzc2VzXG4gICAgICAgICAgKTtcbiAgICAgICAgICBsZXQgb3B0aW1pemVkT2JqZWN0ID0ge307XG4gICAgICAgICAgaWYgKG5lZWRHZXQgJiYgIW5lZWRUb0dldEFsbEtleXMpIHtcbiAgICAgICAgICAgIG9wdGltaXplZE9iamVjdCA9IGF3YWl0IG9iamVjdHNRdWVyaWVzLmdldE9iamVjdChcbiAgICAgICAgICAgICAgY2xhc3NOYW1lLFxuICAgICAgICAgICAgICBjcmVhdGVkT2JqZWN0Lm9iamVjdElkLFxuICAgICAgICAgICAgICByZXF1aXJlZEtleXMsXG4gICAgICAgICAgICAgIGluY2x1ZGUsXG4gICAgICAgICAgICAgIHVuZGVmaW5lZCxcbiAgICAgICAgICAgICAgdW5kZWZpbmVkLFxuICAgICAgICAgICAgICBjb25maWcsXG4gICAgICAgICAgICAgIGF1dGgsXG4gICAgICAgICAgICAgIGluZm8sXG4gICAgICAgICAgICAgIHBhcnNlR3JhcGhRTFNjaGVtYS5wYXJzZUNsYXNzZXNcbiAgICAgICAgICAgICk7XG4gICAgICAgICAgfSBlbHNlIGlmIChuZWVkVG9HZXRBbGxLZXlzKSB7XG4gICAgICAgICAgICBvcHRpbWl6ZWRPYmplY3QgPSBhd2FpdCBvYmplY3RzUXVlcmllcy5nZXRPYmplY3QoXG4gICAgICAgICAgICAgIGNsYXNzTmFtZSxcbiAgICAgICAgICAgICAgY3JlYXRlZE9iamVjdC5vYmplY3RJZCxcbiAgICAgICAgICAgICAgdW5kZWZpbmVkLFxuICAgICAgICAgICAgICBpbmNsdWRlLFxuICAgICAgICAgICAgICB1bmRlZmluZWQsXG4gICAgICAgICAgICAgIHVuZGVmaW5lZCxcbiAgICAgICAgICAgICAgY29uZmlnLFxuICAgICAgICAgICAgICBhdXRoLFxuICAgICAgICAgICAgICBpbmZvLFxuICAgICAgICAgICAgICBwYXJzZUdyYXBoUUxTY2hlbWEucGFyc2VDbGFzc2VzXG4gICAgICAgICAgICApO1xuICAgICAgICAgIH1cbiAgICAgICAgICByZXR1cm4ge1xuICAgICAgICAgICAgW2dldEdyYXBoUUxRdWVyeU5hbWVdOiB7XG4gICAgICAgICAgICAgIC4uLmNyZWF0ZWRPYmplY3QsXG4gICAgICAgICAgICAgIHVwZGF0ZWRBdDogY3JlYXRlZE9iamVjdC5jcmVhdGVkQXQsXG4gICAgICAgICAgICAgIC4uLmZpbHRlckRlbGV0ZWRGaWVsZHMocGFyc2VGaWVsZHMpLFxuICAgICAgICAgICAgICAuLi5vcHRpbWl6ZWRPYmplY3QsXG4gICAgICAgICAgICB9LFxuICAgICAgICAgIH07XG4gICAgICAgIH0gY2F0Y2ggKGUpIHtcbiAgICAgICAgICBwYXJzZUdyYXBoUUxTY2hlbWEuaGFuZGxlRXJyb3IoZSk7XG4gICAgICAgIH1cbiAgICAgIH0sXG4gICAgfSk7XG5cbiAgICBpZiAoXG4gICAgICBwYXJzZUdyYXBoUUxTY2hlbWEuYWRkR3JhcGhRTFR5cGUoY3JlYXRlR3JhcGhRTE11dGF0aW9uLmFyZ3MuaW5wdXQudHlwZS5vZlR5cGUpICYmXG4gICAgICBwYXJzZUdyYXBoUUxTY2hlbWEuYWRkR3JhcGhRTFR5cGUoY3JlYXRlR3JhcGhRTE11dGF0aW9uLnR5cGUpXG4gICAgKSB7XG4gICAgICBwYXJzZUdyYXBoUUxTY2hlbWEuYWRkR3JhcGhRTE11dGF0aW9uKGNyZWF0ZUdyYXBoUUxNdXRhdGlvbk5hbWUsIGNyZWF0ZUdyYXBoUUxNdXRhdGlvbik7XG4gICAgfVxuICB9XG5cbiAgaWYgKGlzVXBkYXRlRW5hYmxlZCkge1xuICAgIGNvbnN0IHVwZGF0ZUdyYXBoUUxNdXRhdGlvbk5hbWUgPSB1cGRhdGVBbGlhcyB8fCBgdXBkYXRlJHtncmFwaFFMQ2xhc3NOYW1lfWA7XG4gICAgY29uc3QgdXBkYXRlR3JhcGhRTE11dGF0aW9uID0gbXV0YXRpb25XaXRoQ2xpZW50TXV0YXRpb25JZCh7XG4gICAgICBuYW1lOiBgVXBkYXRlJHtncmFwaFFMQ2xhc3NOYW1lfWAsXG4gICAgICBkZXNjcmlwdGlvbjogYFRoZSAke3VwZGF0ZUdyYXBoUUxNdXRhdGlvbk5hbWV9IG11dGF0aW9uIGNhbiBiZSB1c2VkIHRvIHVwZGF0ZSBhbiBvYmplY3Qgb2YgdGhlICR7Z3JhcGhRTENsYXNzTmFtZX0gY2xhc3MuYCxcbiAgICAgIGlucHV0RmllbGRzOiB7XG4gICAgICAgIGlkOiBkZWZhdWx0R3JhcGhRTFR5cGVzLkdMT0JBTF9PUl9PQkpFQ1RfSURfQVRULFxuICAgICAgICBmaWVsZHM6IHtcbiAgICAgICAgICBkZXNjcmlwdGlvbjogJ1RoZXNlIGFyZSB0aGUgZmllbGRzIHRoYXQgd2lsbCBiZSB1c2VkIHRvIHVwZGF0ZSB0aGUgb2JqZWN0LicsXG4gICAgICAgICAgdHlwZTogY2xhc3NHcmFwaFFMVXBkYXRlVHlwZSB8fCBkZWZhdWx0R3JhcGhRTFR5cGVzLk9CSkVDVCxcbiAgICAgICAgfSxcbiAgICAgIH0sXG4gICAgICBvdXRwdXRGaWVsZHM6IHtcbiAgICAgICAgW2dldEdyYXBoUUxRdWVyeU5hbWVdOiB7XG4gICAgICAgICAgZGVzY3JpcHRpb246ICdUaGlzIGlzIHRoZSB1cGRhdGVkIG9iamVjdC4nLFxuICAgICAgICAgIHR5cGU6IG5ldyBHcmFwaFFMTm9uTnVsbChjbGFzc0dyYXBoUUxPdXRwdXRUeXBlIHx8IGRlZmF1bHRHcmFwaFFMVHlwZXMuT0JKRUNUKSxcbiAgICAgICAgfSxcbiAgICAgIH0sXG4gICAgICBtdXRhdGVBbmRHZXRQYXlsb2FkOiBhc3luYyAoYXJncywgY29udGV4dCwgbXV0YXRpb25JbmZvKSA9PiB7XG4gICAgICAgIHRyeSB7XG4gICAgICAgICAgbGV0IHsgaWQsIGZpZWxkcyB9ID0gZGVlcGNvcHkoYXJncyk7XG4gICAgICAgICAgaWYgKCFmaWVsZHMpIGZpZWxkcyA9IHt9O1xuICAgICAgICAgIGNvbnN0IHsgY29uZmlnLCBhdXRoLCBpbmZvIH0gPSBjb250ZXh0O1xuXG4gICAgICAgICAgY29uc3QgZ2xvYmFsSWRPYmplY3QgPSBmcm9tR2xvYmFsSWQoaWQpO1xuXG4gICAgICAgICAgaWYgKGdsb2JhbElkT2JqZWN0LnR5cGUgPT09IGNsYXNzTmFtZSkge1xuICAgICAgICAgICAgaWQgPSBnbG9iYWxJZE9iamVjdC5pZDtcbiAgICAgICAgICB9XG5cbiAgICAgICAgICBjb25zdCBwYXJzZUZpZWxkcyA9IGF3YWl0IHRyYW5zZm9ybVR5cGVzKCd1cGRhdGUnLCBmaWVsZHMsIHtcbiAgICAgICAgICAgIGNsYXNzTmFtZSxcbiAgICAgICAgICAgIHBhcnNlR3JhcGhRTFNjaGVtYSxcbiAgICAgICAgICAgIG9yaWdpbmFsRmllbGRzOiBhcmdzLmZpZWxkcyB8fCB7fSxcbiAgICAgICAgICAgIHJlcTogeyBjb25maWcsIGF1dGgsIGluZm8gfSxcbiAgICAgICAgICB9KTtcblxuICAgICAgICAgIGNvbnN0IHVwZGF0ZWRPYmplY3QgPSBhd2FpdCBvYmplY3RzTXV0YXRpb25zLnVwZGF0ZU9iamVjdChcbiAgICAgICAgICAgIGNsYXNzTmFtZSxcbiAgICAgICAgICAgIGlkLFxuICAgICAgICAgICAgcGFyc2VGaWVsZHMsXG4gICAgICAgICAgICBjb25maWcsXG4gICAgICAgICAgICBhdXRoLFxuICAgICAgICAgICAgaW5mb1xuICAgICAgICAgICk7XG5cbiAgICAgICAgICBjb25zdCBzZWxlY3RlZEZpZWxkcyA9IGdldEZpZWxkTmFtZXMobXV0YXRpb25JbmZvKVxuICAgICAgICAgICAgLmZpbHRlcihmaWVsZCA9PiBmaWVsZC5zdGFydHNXaXRoKGAke2dldEdyYXBoUUxRdWVyeU5hbWV9LmApKVxuICAgICAgICAgICAgLm1hcChmaWVsZCA9PiBmaWVsZC5yZXBsYWNlKGAke2dldEdyYXBoUUxRdWVyeU5hbWV9LmAsICcnKSk7XG4gICAgICAgICAgY29uc3QgeyBrZXlzLCBpbmNsdWRlIH0gPSBleHRyYWN0S2V5c0FuZEluY2x1ZGUoc2VsZWN0ZWRGaWVsZHMpO1xuICAgICAgICAgIGNvbnN0IHsga2V5czogcmVxdWlyZWRLZXlzLCBuZWVkR2V0IH0gPSBnZXRPbmx5UmVxdWlyZWRGaWVsZHMoZmllbGRzLCBrZXlzLCBpbmNsdWRlLCBbXG4gICAgICAgICAgICAnaWQnLFxuICAgICAgICAgICAgJ29iamVjdElkJyxcbiAgICAgICAgICAgICd1cGRhdGVkQXQnLFxuICAgICAgICAgIF0pO1xuICAgICAgICAgIGNvbnN0IG5lZWRUb0dldEFsbEtleXMgPSBvYmplY3RzUXVlcmllcy5uZWVkVG9HZXRBbGxLZXlzKFxuICAgICAgICAgICAgcGFyc2VDbGFzcy5maWVsZHMsXG4gICAgICAgICAgICBrZXlzLFxuICAgICAgICAgICAgcGFyc2VHcmFwaFFMU2NoZW1hLnBhcnNlQ2xhc3Nlc1xuICAgICAgICAgICk7XG4gICAgICAgICAgbGV0IG9wdGltaXplZE9iamVjdCA9IHt9O1xuICAgICAgICAgIGlmIChuZWVkR2V0ICYmICFuZWVkVG9HZXRBbGxLZXlzKSB7XG4gICAgICAgICAgICBvcHRpbWl6ZWRPYmplY3QgPSBhd2FpdCBvYmplY3RzUXVlcmllcy5nZXRPYmplY3QoXG4gICAgICAgICAgICAgIGNsYXNzTmFtZSxcbiAgICAgICAgICAgICAgaWQsXG4gICAgICAgICAgICAgIHJlcXVpcmVkS2V5cyxcbiAgICAgICAgICAgICAgaW5jbHVkZSxcbiAgICAgICAgICAgICAgdW5kZWZpbmVkLFxuICAgICAgICAgICAgICB1bmRlZmluZWQsXG4gICAgICAgICAgICAgIGNvbmZpZyxcbiAgICAgICAgICAgICAgYXV0aCxcbiAgICAgICAgICAgICAgaW5mbyxcbiAgICAgICAgICAgICAgcGFyc2VHcmFwaFFMU2NoZW1hLnBhcnNlQ2xhc3Nlc1xuICAgICAgICAgICAgKTtcbiAgICAgICAgICB9IGVsc2UgaWYgKG5lZWRUb0dldEFsbEtleXMpIHtcbiAgICAgICAgICAgIG9wdGltaXplZE9iamVjdCA9IGF3YWl0IG9iamVjdHNRdWVyaWVzLmdldE9iamVjdChcbiAgICAgICAgICAgICAgY2xhc3NOYW1lLFxuICAgICAgICAgICAgICBpZCxcbiAgICAgICAgICAgICAgdW5kZWZpbmVkLFxuICAgICAgICAgICAgICBpbmNsdWRlLFxuICAgICAgICAgICAgICB1bmRlZmluZWQsXG4gICAgICAgICAgICAgIHVuZGVmaW5lZCxcbiAgICAgICAgICAgICAgY29uZmlnLFxuICAgICAgICAgICAgICBhdXRoLFxuICAgICAgICAgICAgICBpbmZvLFxuICAgICAgICAgICAgICBwYXJzZUdyYXBoUUxTY2hlbWEucGFyc2VDbGFzc2VzXG4gICAgICAgICAgICApO1xuICAgICAgICAgIH1cbiAgICAgICAgICByZXR1cm4ge1xuICAgICAgICAgICAgW2dldEdyYXBoUUxRdWVyeU5hbWVdOiB7XG4gICAgICAgICAgICAgIG9iamVjdElkOiBpZCxcbiAgICAgICAgICAgICAgLi4udXBkYXRlZE9iamVjdCxcbiAgICAgICAgICAgICAgLi4uZmlsdGVyRGVsZXRlZEZpZWxkcyhwYXJzZUZpZWxkcyksXG4gICAgICAgICAgICAgIC4uLm9wdGltaXplZE9iamVjdCxcbiAgICAgICAgICAgIH0sXG4gICAgICAgICAgfTtcbiAgICAgICAgfSBjYXRjaCAoZSkge1xuICAgICAgICAgIHBhcnNlR3JhcGhRTFNjaGVtYS5oYW5kbGVFcnJvcihlKTtcbiAgICAgICAgfVxuICAgICAgfSxcbiAgICB9KTtcblxuICAgIGlmIChcbiAgICAgIHBhcnNlR3JhcGhRTFNjaGVtYS5hZGRHcmFwaFFMVHlwZSh1cGRhdGVHcmFwaFFMTXV0YXRpb24uYXJncy5pbnB1dC50eXBlLm9mVHlwZSkgJiZcbiAgICAgIHBhcnNlR3JhcGhRTFNjaGVtYS5hZGRHcmFwaFFMVHlwZSh1cGRhdGVHcmFwaFFMTXV0YXRpb24udHlwZSlcbiAgICApIHtcbiAgICAgIHBhcnNlR3JhcGhRTFNjaGVtYS5hZGRHcmFwaFFMTXV0YXRpb24odXBkYXRlR3JhcGhRTE11dGF0aW9uTmFtZSwgdXBkYXRlR3JhcGhRTE11dGF0aW9uKTtcbiAgICB9XG4gIH1cblxuICBpZiAoaXNEZXN0cm95RW5hYmxlZCkge1xuICAgIGNvbnN0IGRlbGV0ZUdyYXBoUUxNdXRhdGlvbk5hbWUgPSBkZXN0cm95QWxpYXMgfHwgYGRlbGV0ZSR7Z3JhcGhRTENsYXNzTmFtZX1gO1xuICAgIGNvbnN0IGRlbGV0ZUdyYXBoUUxNdXRhdGlvbiA9IG11dGF0aW9uV2l0aENsaWVudE11dGF0aW9uSWQoe1xuICAgICAgbmFtZTogYERlbGV0ZSR7Z3JhcGhRTENsYXNzTmFtZX1gLFxuICAgICAgZGVzY3JpcHRpb246IGBUaGUgJHtkZWxldGVHcmFwaFFMTXV0YXRpb25OYW1lfSBtdXRhdGlvbiBjYW4gYmUgdXNlZCB0byBkZWxldGUgYW4gb2JqZWN0IG9mIHRoZSAke2dyYXBoUUxDbGFzc05hbWV9IGNsYXNzLmAsXG4gICAgICBpbnB1dEZpZWxkczoge1xuICAgICAgICBpZDogZGVmYXVsdEdyYXBoUUxUeXBlcy5HTE9CQUxfT1JfT0JKRUNUX0lEX0FUVCxcbiAgICAgIH0sXG4gICAgICBvdXRwdXRGaWVsZHM6IHtcbiAgICAgICAgW2dldEdyYXBoUUxRdWVyeU5hbWVdOiB7XG4gICAgICAgICAgZGVzY3JpcHRpb246ICdUaGlzIGlzIHRoZSBkZWxldGVkIG9iamVjdC4nLFxuICAgICAgICAgIHR5cGU6IG5ldyBHcmFwaFFMTm9uTnVsbChjbGFzc0dyYXBoUUxPdXRwdXRUeXBlIHx8IGRlZmF1bHRHcmFwaFFMVHlwZXMuT0JKRUNUKSxcbiAgICAgICAgfSxcbiAgICAgIH0sXG4gICAgICBtdXRhdGVBbmRHZXRQYXlsb2FkOiBhc3luYyAoYXJncywgY29udGV4dCwgbXV0YXRpb25JbmZvKSA9PiB7XG4gICAgICAgIHRyeSB7XG4gICAgICAgICAgbGV0IHsgaWQgfSA9IGRlZXBjb3B5KGFyZ3MpO1xuICAgICAgICAgIGNvbnN0IHsgY29uZmlnLCBhdXRoLCBpbmZvIH0gPSBjb250ZXh0O1xuXG4gICAgICAgICAgY29uc3QgZ2xvYmFsSWRPYmplY3QgPSBmcm9tR2xvYmFsSWQoaWQpO1xuXG4gICAgICAgICAgaWYgKGdsb2JhbElkT2JqZWN0LnR5cGUgPT09IGNsYXNzTmFtZSkge1xuICAgICAgICAgICAgaWQgPSBnbG9iYWxJZE9iamVjdC5pZDtcbiAgICAgICAgICB9XG5cbiAgICAgICAgICBjb25zdCBzZWxlY3RlZEZpZWxkcyA9IGdldEZpZWxkTmFtZXMobXV0YXRpb25JbmZvKVxuICAgICAgICAgICAgLmZpbHRlcihmaWVsZCA9PiBmaWVsZC5zdGFydHNXaXRoKGAke2dldEdyYXBoUUxRdWVyeU5hbWV9LmApKVxuICAgICAgICAgICAgLm1hcChmaWVsZCA9PiBmaWVsZC5yZXBsYWNlKGAke2dldEdyYXBoUUxRdWVyeU5hbWV9LmAsICcnKSk7XG4gICAgICAgICAgY29uc3QgeyBrZXlzLCBpbmNsdWRlIH0gPSBleHRyYWN0S2V5c0FuZEluY2x1ZGUoc2VsZWN0ZWRGaWVsZHMpO1xuICAgICAgICAgIGxldCBvcHRpbWl6ZWRPYmplY3QgPSB7fTtcbiAgICAgICAgICBpZiAoa2V5cyAmJiBrZXlzLnNwbGl0KCcsJykuZmlsdGVyKGtleSA9PiAhWydpZCcsICdvYmplY3RJZCddLmluY2x1ZGVzKGtleSkpLmxlbmd0aCA+IDApIHtcbiAgICAgICAgICAgIG9wdGltaXplZE9iamVjdCA9IGF3YWl0IG9iamVjdHNRdWVyaWVzLmdldE9iamVjdChcbiAgICAgICAgICAgICAgY2xhc3NOYW1lLFxuICAgICAgICAgICAgICBpZCxcbiAgICAgICAgICAgICAga2V5cyxcbiAgICAgICAgICAgICAgaW5jbHVkZSxcbiAgICAgICAgICAgICAgdW5kZWZpbmVkLFxuICAgICAgICAgICAgICB1bmRlZmluZWQsXG4gICAgICAgICAgICAgIGNvbmZpZyxcbiAgICAgICAgICAgICAgYXV0aCxcbiAgICAgICAgICAgICAgaW5mbyxcbiAgICAgICAgICAgICAgcGFyc2VHcmFwaFFMU2NoZW1hLnBhcnNlQ2xhc3Nlc1xuICAgICAgICAgICAgKTtcbiAgICAgICAgICB9XG4gICAgICAgICAgYXdhaXQgb2JqZWN0c011dGF0aW9ucy5kZWxldGVPYmplY3QoY2xhc3NOYW1lLCBpZCwgY29uZmlnLCBhdXRoLCBpbmZvKTtcbiAgICAgICAgICByZXR1cm4ge1xuICAgICAgICAgICAgW2dldEdyYXBoUUxRdWVyeU5hbWVdOiB7XG4gICAgICAgICAgICAgIG9iamVjdElkOiBpZCxcbiAgICAgICAgICAgICAgLi4ub3B0aW1pemVkT2JqZWN0LFxuICAgICAgICAgICAgfSxcbiAgICAgICAgICB9O1xuICAgICAgICB9IGNhdGNoIChlKSB7XG4gICAgICAgICAgcGFyc2VHcmFwaFFMU2NoZW1hLmhhbmRsZUVycm9yKGUpO1xuICAgICAgICB9XG4gICAgICB9LFxuICAgIH0pO1xuXG4gICAgaWYgKFxuICAgICAgcGFyc2VHcmFwaFFMU2NoZW1hLmFkZEdyYXBoUUxUeXBlKGRlbGV0ZUdyYXBoUUxNdXRhdGlvbi5hcmdzLmlucHV0LnR5cGUub2ZUeXBlKSAmJlxuICAgICAgcGFyc2VHcmFwaFFMU2NoZW1hLmFkZEdyYXBoUUxUeXBlKGRlbGV0ZUdyYXBoUUxNdXRhdGlvbi50eXBlKVxuICAgICkge1xuICAgICAgcGFyc2VHcmFwaFFMU2NoZW1hLmFkZEdyYXBoUUxNdXRhdGlvbihkZWxldGVHcmFwaFFMTXV0YXRpb25OYW1lLCBkZWxldGVHcmFwaFFMTXV0YXRpb24pO1xuICAgIH1cbiAgfVxufTtcblxuZXhwb3J0IHsgbG9hZCB9O1xuIl0sIm1hcHBpbmdzIjoiOzs7Ozs7QUFBQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQTBEO0FBQUE7QUFBQTtBQUFBO0FBQUE7QUFBQTtBQUFBO0FBQUE7QUFFMUQsTUFBTUEsbUJBQW1CLEdBQUdDLE1BQU0sSUFDaENDLE1BQU0sQ0FBQ0MsSUFBSSxDQUFDRixNQUFNLENBQUMsQ0FBQ0csTUFBTSxDQUFDLENBQUNDLEdBQUcsRUFBRUMsR0FBRyxLQUFLO0VBQUE7RUFDdkMsSUFBSSxPQUFPTCxNQUFNLENBQUNLLEdBQUcsQ0FBQyxLQUFLLFFBQVEsSUFBSSxnQkFBQUwsTUFBTSxDQUFDSyxHQUFHLENBQUMsZ0RBQVgsWUFBYUMsSUFBSSxNQUFLLFFBQVEsRUFBRTtJQUNyRUYsR0FBRyxDQUFDQyxHQUFHLENBQUMsR0FBRyxJQUFJO0VBQ2pCO0VBQ0EsT0FBT0QsR0FBRztBQUNaLENBQUMsRUFBRUosTUFBTSxDQUFDO0FBRVosTUFBTU8scUJBQXFCLEdBQUcsQ0FDNUJDLGFBQWEsRUFDYkMsb0JBQW9CLEVBQ3BCQyxvQkFBb0IsRUFDcEJDLGtCQUFrQixLQUNmO0VBQ0gsTUFBTUMsY0FBYyxHQUFHRixvQkFBb0IsR0FBR0Esb0JBQW9CLENBQUNHLEtBQUss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