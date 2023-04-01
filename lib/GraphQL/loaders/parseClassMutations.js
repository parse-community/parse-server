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
//# sourceMappingURL=data:application/json;charset=utf-8;base64,eyJ2ZXJzaW9uIjozLCJuYW1lcyI6WyJfZ3JhcGhxbCIsInJlcXVpcmUiLCJfZ3JhcGhxbFJlbGF5IiwiX2dyYXBocWxMaXN0RmllbGRzIiwiX2ludGVyb3BSZXF1aXJlRGVmYXVsdCIsIl9kZWVwY29weSIsImRlZmF1bHRHcmFwaFFMVHlwZXMiLCJfaW50ZXJvcFJlcXVpcmVXaWxkY2FyZCIsIl9wYXJzZUdyYXBoUUxVdGlscyIsIm9iamVjdHNNdXRhdGlvbnMiLCJvYmplY3RzUXVlcmllcyIsIl9QYXJzZUdyYXBoUUxDb250cm9sbGVyIiwiX2NsYXNzTmFtZSIsIl9tdXRhdGlvbiIsIl9nZXRSZXF1aXJlV2lsZGNhcmRDYWNoZSIsIm5vZGVJbnRlcm9wIiwiV2Vha01hcCIsImNhY2hlQmFiZWxJbnRlcm9wIiwiY2FjaGVOb2RlSW50ZXJvcCIsIm9iaiIsIl9fZXNNb2R1bGUiLCJkZWZhdWx0IiwiY2FjaGUiLCJoYXMiLCJnZXQiLCJuZXdPYmoiLCJoYXNQcm9wZXJ0eURlc2NyaXB0b3IiLCJPYmplY3QiLCJkZWZpbmVQcm9wZXJ0eSIsImdldE93blByb3BlcnR5RGVzY3JpcHRvciIsImtleSIsInByb3RvdHlwZSIsImhhc093blByb3BlcnR5IiwiY2FsbCIsImRlc2MiLCJzZXQiLCJvd25LZXlzIiwib2JqZWN0IiwiZW51bWVyYWJsZU9ubHkiLCJrZXlzIiwiZ2V0T3duUHJvcGVydHlTeW1ib2xzIiwic3ltYm9scyIsImZpbHRlciIsInN5bSIsImVudW1lcmFibGUiLCJwdXNoIiwiYXBwbHkiLCJfb2JqZWN0U3ByZWFkIiwidGFyZ2V0IiwiaSIsImFyZ3VtZW50cyIsImxlbmd0aCIsInNvdXJjZSIsImZvckVhY2giLCJfZGVmaW5lUHJvcGVydHkiLCJnZXRPd25Qcm9wZXJ0eURlc2NyaXB0b3JzIiwiZGVmaW5lUHJvcGVydGllcyIsInZhbHVlIiwiX3RvUHJvcGVydHlLZXkiLCJjb25maWd1cmFibGUiLCJ3cml0YWJsZSIsImFyZyIsIl90b1ByaW1pdGl2ZSIsIlN0cmluZyIsImlucHV0IiwiaGludCIsInByaW0iLCJTeW1ib2wiLCJ0b1ByaW1pdGl2ZSIsInVuZGVmaW5lZCIsInJlcyIsIlR5cGVFcnJvciIsIk51bWJlciIsImZpbHRlckRlbGV0ZWRGaWVsZHMiLCJmaWVsZHMiLCJyZWR1Y2UiLCJhY2MiLCJfZmllbGRzJGtleSIsIl9fb3AiLCJnZXRPbmx5UmVxdWlyZWRGaWVsZHMiLCJ1cGRhdGVkRmllbGRzIiwic2VsZWN0ZWRGaWVsZHNTdHJpbmciLCJpbmNsdWRlZEZpZWxkc1N0cmluZyIsIm5hdGl2ZU9iamVjdEZpZWxkcyIsImluY2x1ZGVkRmllbGRzIiwic3BsaXQiLCJzZWxlY3RlZEZpZWxkcyIsIm1pc3NpbmdGaWVsZHMiLCJmaWVsZCIsImluY2x1ZGVzIiwiam9pbiIsIm5lZWRHZXQiLCJsb2FkIiwicGFyc2VHcmFwaFFMU2NoZW1hIiwicGFyc2VDbGFzcyIsInBhcnNlQ2xhc3NDb25maWciLCJjbGFzc05hbWUiLCJncmFwaFFMQ2xhc3NOYW1lIiwidHJhbnNmb3JtQ2xhc3NOYW1lVG9HcmFwaFFMIiwiZ2V0R3JhcGhRTFF1ZXJ5TmFtZSIsImNoYXJBdCIsInRvTG93ZXJDYXNlIiwic2xpY2UiLCJjcmVhdGUiLCJpc0NyZWF0ZUVuYWJsZWQiLCJ1cGRhdGUiLCJpc1VwZGF0ZUVuYWJsZWQiLCJkZXN0cm95IiwiaXNEZXN0cm95RW5hYmxlZCIsImNyZWF0ZUFsaWFzIiwidXBkYXRlQWxpYXMiLCJkZXN0cm95QWxpYXMiLCJnZXRQYXJzZUNsYXNzTXV0YXRpb25Db25maWciLCJjbGFzc0dyYXBoUUxDcmVhdGVUeXBlIiwiY2xhc3NHcmFwaFFMVXBkYXRlVHlwZSIsImNsYXNzR3JhcGhRTE91dHB1dFR5cGUiLCJwYXJzZUNsYXNzVHlwZXMiLCJjcmVhdGVHcmFwaFFMTXV0YXRpb25OYW1lIiwiY3JlYXRlR3JhcGhRTE11dGF0aW9uIiwibXV0YXRpb25XaXRoQ2xpZW50TXV0YXRpb25JZCIsIm5hbWUiLCJkZXNjcmlwdGlvbiIsImlucHV0RmllbGRzIiwidHlwZSIsIk9CSkVDVCIsIm91dHB1dEZpZWxkcyIsIkdyYXBoUUxOb25OdWxsIiwibXV0YXRlQW5kR2V0UGF5bG9hZCIsImFyZ3MiLCJjb250ZXh0IiwibXV0YXRpb25JbmZvIiwiZGVlcGNvcHkiLCJjb25maWciLCJhdXRoIiwiaW5mbyIsInBhcnNlRmllbGRzIiwidHJhbnNmb3JtVHlwZXMiLCJyZXEiLCJjcmVhdGVkT2JqZWN0IiwiY3JlYXRlT2JqZWN0IiwiZ2V0RmllbGROYW1lcyIsInN0YXJ0c1dpdGgiLCJtYXAiLCJyZXBsYWNlIiwiaW5jbHVkZSIsImV4dHJhY3RLZXlzQW5kSW5jbHVkZSIsInJlcXVpcmVkS2V5cyIsIm5lZWRUb0dldEFsbEtleXMiLCJwYXJzZUNsYXNzZXMiLCJvcHRpbWl6ZWRPYmplY3QiLCJnZXRPYmplY3QiLCJvYmplY3RJZCIsInVwZGF0ZWRBdCIsImNyZWF0ZWRBdCIsImUiLCJoYW5kbGVFcnJvciIsImFkZEdyYXBoUUxUeXBlIiwib2ZUeXBlIiwiYWRkR3JhcGhRTE11dGF0aW9uIiwidXBkYXRlR3JhcGhRTE11dGF0aW9uTmFtZSIsInVwZGF0ZUdyYXBoUUxNdXRhdGlvbiIsImlkIiwiR0xPQkFMX09SX09CSkVDVF9JRF9BVFQiLCJnbG9iYWxJZE9iamVjdCIsImZyb21HbG9iYWxJZCIsInVwZGF0ZWRPYmplY3QiLCJ1cGRhdGVPYmplY3QiLCJkZWxldGVHcmFwaFFMTXV0YXRpb25OYW1lIiwiZGVsZXRlR3JhcGhRTE11dGF0aW9uIiwiZGVsZXRlT2JqZWN0IiwiZXhwb3J0cyJdLCJzb3VyY2VzIjpbIi4uLy4uLy4uL3NyYy9HcmFwaFFML2xvYWRlcnMvcGFyc2VDbGFzc011dGF0aW9ucy5qcyJdLCJzb3VyY2VzQ29udGVudCI6WyJpbXBvcnQgeyBHcmFwaFFMTm9uTnVsbCB9IGZyb20gJ2dyYXBocWwnO1xuaW1wb3J0IHsgZnJvbUdsb2JhbElkLCBtdXRhdGlvbldpdGhDbGllbnRNdXRhdGlvbklkIH0gZnJvbSAnZ3JhcGhxbC1yZWxheSc7XG5pbXBvcnQgZ2V0RmllbGROYW1lcyBmcm9tICdncmFwaHFsLWxpc3QtZmllbGRzJztcbmltcG9ydCBkZWVwY29weSBmcm9tICdkZWVwY29weSc7XG5pbXBvcnQgKiBhcyBkZWZhdWx0R3JhcGhRTFR5cGVzIGZyb20gJy4vZGVmYXVsdEdyYXBoUUxUeXBlcyc7XG5pbXBvcnQgeyBleHRyYWN0S2V5c0FuZEluY2x1ZGUsIGdldFBhcnNlQ2xhc3NNdXRhdGlvbkNvbmZpZyB9IGZyb20gJy4uL3BhcnNlR3JhcGhRTFV0aWxzJztcbmltcG9ydCAqIGFzIG9iamVjdHNNdXRhdGlvbnMgZnJvbSAnLi4vaGVscGVycy9vYmplY3RzTXV0YXRpb25zJztcbmltcG9ydCAqIGFzIG9iamVjdHNRdWVyaWVzIGZyb20gJy4uL2hlbHBlcnMvb2JqZWN0c1F1ZXJpZXMnO1xuaW1wb3J0IHsgUGFyc2VHcmFwaFFMQ2xhc3NDb25maWcgfSBmcm9tICcuLi8uLi9Db250cm9sbGVycy9QYXJzZUdyYXBoUUxDb250cm9sbGVyJztcbmltcG9ydCB7IHRyYW5zZm9ybUNsYXNzTmFtZVRvR3JhcGhRTCB9IGZyb20gJy4uL3RyYW5zZm9ybWVycy9jbGFzc05hbWUnO1xuaW1wb3J0IHsgdHJhbnNmb3JtVHlwZXMgfSBmcm9tICcuLi90cmFuc2Zvcm1lcnMvbXV0YXRpb24nO1xuXG5jb25zdCBmaWx0ZXJEZWxldGVkRmllbGRzID0gZmllbGRzID0+XG4gIE9iamVjdC5rZXlzKGZpZWxkcykucmVkdWNlKChhY2MsIGtleSkgPT4ge1xuICAgIGlmICh0eXBlb2YgZmllbGRzW2tleV0gPT09ICdvYmplY3QnICYmIGZpZWxkc1trZXldPy5fX29wID09PSAnRGVsZXRlJykge1xuICAgICAgYWNjW2tleV0gPSBudWxsO1xuICAgIH1cbiAgICByZXR1cm4gYWNjO1xuICB9LCBmaWVsZHMpO1xuXG5jb25zdCBnZXRPbmx5UmVxdWlyZWRGaWVsZHMgPSAoXG4gIHVwZGF0ZWRGaWVsZHMsXG4gIHNlbGVjdGVkRmllbGRzU3RyaW5nLFxuICBpbmNsdWRlZEZpZWxkc1N0cmluZyxcbiAgbmF0aXZlT2JqZWN0RmllbGRzXG4pID0+IHtcbiAgY29uc3QgaW5jbHVkZWRGaWVsZHMgPSBpbmNsdWRlZEZpZWxkc1N0cmluZyA/IGluY2x1ZGVkRmllbGRzU3RyaW5nLnNwbGl0KCcsJykgOiBbXTtcbiAgY29uc3Qgc2VsZWN0ZWRGaWVsZHMgPSBzZWxlY3RlZEZpZWxkc1N0cmluZyA/IHNlbGVjdGVkRmllbGRzU3RyaW5nLnNwbGl0KCcsJykgOiBbXTtcbiAgY29uc3QgbWlzc2luZ0ZpZWxkcyA9IHNlbGVjdGVkRmllbGRzXG4gICAgLmZpbHRlcihmaWVsZCA9PiAhbmF0aXZlT2JqZWN0RmllbGRzLmluY2x1ZGVzKGZpZWxkKSB8fCBpbmNsdWRlZEZpZWxkcy5pbmNsdWRlcyhmaWVsZCkpXG4gICAgLmpvaW4oJywnKTtcbiAgaWYgKCFtaXNzaW5nRmllbGRzLmxlbmd0aCkge1xuICAgIHJldHVybiB7IG5lZWRHZXQ6IGZhbHNlLCBrZXlzOiAnJyB9O1xuICB9IGVsc2Uge1xuICAgIHJldHVybiB7IG5lZWRHZXQ6IHRydWUsIGtleXM6IG1pc3NpbmdGaWVsZHMgfTtcbiAgfVxufTtcblxuY29uc3QgbG9hZCA9IGZ1bmN0aW9uIChwYXJzZUdyYXBoUUxTY2hlbWEsIHBhcnNlQ2xhc3MsIHBhcnNlQ2xhc3NDb25maWc6ID9QYXJzZUdyYXBoUUxDbGFzc0NvbmZpZykge1xuICBjb25zdCBjbGFzc05hbWUgPSBwYXJzZUNsYXNzLmNsYXNzTmFtZTtcbiAgY29uc3QgZ3JhcGhRTENsYXNzTmFtZSA9IHRyYW5zZm9ybUNsYXNzTmFtZVRvR3JhcGhRTChjbGFzc05hbWUpO1xuICBjb25zdCBnZXRHcmFwaFFMUXVlcnlOYW1lID0gZ3JhcGhRTENsYXNzTmFtZS5jaGFyQXQoMCkudG9Mb3dlckNhc2UoKSArIGdyYXBoUUxDbGFzc05hbWUuc2xpY2UoMSk7XG5cbiAgY29uc3Qge1xuICAgIGNyZWF0ZTogaXNDcmVhdGVFbmFibGVkID0gdHJ1ZSxcbiAgICB1cGRhdGU6IGlzVXBkYXRlRW5hYmxlZCA9IHRydWUsXG4gICAgZGVzdHJveTogaXNEZXN0cm95RW5hYmxlZCA9IHRydWUsXG4gICAgY3JlYXRlQWxpYXM6IGNyZWF0ZUFsaWFzID0gJycsXG4gICAgdXBkYXRlQWxpYXM6IHVwZGF0ZUFsaWFzID0gJycsXG4gICAgZGVzdHJveUFsaWFzOiBkZXN0cm95QWxpYXMgPSAnJyxcbiAgfSA9IGdldFBhcnNlQ2xhc3NNdXRhdGlvbkNvbmZpZyhwYXJzZUNsYXNzQ29uZmlnKTtcblxuICBjb25zdCB7XG4gICAgY2xhc3NHcmFwaFFMQ3JlYXRlVHlwZSxcbiAgICBjbGFzc0dyYXBoUUxVcGRhdGVUeXBlLFxuICAgIGNsYXNzR3JhcGhRTE91dHB1dFR5cGUsXG4gIH0gPSBwYXJzZUdyYXBoUUxTY2hlbWEucGFyc2VDbGFzc1R5cGVzW2NsYXNzTmFtZV07XG5cbiAgaWYgKGlzQ3JlYXRlRW5hYmxlZCkge1xuICAgIGNvbnN0IGNyZWF0ZUdyYXBoUUxNdXRhdGlvbk5hbWUgPSBjcmVhdGVBbGlhcyB8fCBgY3JlYXRlJHtncmFwaFFMQ2xhc3NOYW1lfWA7XG4gICAgY29uc3QgY3JlYXRlR3JhcGhRTE11dGF0aW9uID0gbXV0YXRpb25XaXRoQ2xpZW50TXV0YXRpb25JZCh7XG4gICAgICBuYW1lOiBgQ3JlYXRlJHtncmFwaFFMQ2xhc3NOYW1lfWAsXG4gICAgICBkZXNjcmlwdGlvbjogYFRoZSAke2NyZWF0ZUdyYXBoUUxNdXRhdGlvbk5hbWV9IG11dGF0aW9uIGNhbiBiZSB1c2VkIHRvIGNyZWF0ZSBhIG5ldyBvYmplY3Qgb2YgdGhlICR7Z3JhcGhRTENsYXNzTmFtZX0gY2xhc3MuYCxcbiAgICAgIGlucHV0RmllbGRzOiB7XG4gICAgICAgIGZpZWxkczoge1xuICAgICAgICAgIGRlc2NyaXB0aW9uOiAnVGhlc2UgYXJlIHRoZSBmaWVsZHMgdGhhdCB3aWxsIGJlIHVzZWQgdG8gY3JlYXRlIHRoZSBuZXcgb2JqZWN0LicsXG4gICAgICAgICAgdHlwZTogY2xhc3NHcmFwaFFMQ3JlYXRlVHlwZSB8fCBkZWZhdWx0R3JhcGhRTFR5cGVzLk9CSkVDVCxcbiAgICAgICAgfSxcbiAgICAgIH0sXG4gICAgICBvdXRwdXRGaWVsZHM6IHtcbiAgICAgICAgW2dldEdyYXBoUUxRdWVyeU5hbWVdOiB7XG4gICAgICAgICAgZGVzY3JpcHRpb246ICdUaGlzIGlzIHRoZSBjcmVhdGVkIG9iamVjdC4nLFxuICAgICAgICAgIHR5cGU6IG5ldyBHcmFwaFFMTm9uTnVsbChjbGFzc0dyYXBoUUxPdXRwdXRUeXBlIHx8IGRlZmF1bHRHcmFwaFFMVHlwZXMuT0JKRUNUKSxcbiAgICAgICAgfSxcbiAgICAgIH0sXG4gICAgICBtdXRhdGVBbmRHZXRQYXlsb2FkOiBhc3luYyAoYXJncywgY29udGV4dCwgbXV0YXRpb25JbmZvKSA9PiB7XG4gICAgICAgIHRyeSB7XG4gICAgICAgICAgbGV0IHsgZmllbGRzIH0gPSBkZWVwY29weShhcmdzKTtcbiAgICAgICAgICBpZiAoIWZpZWxkcykgZmllbGRzID0ge307XG4gICAgICAgICAgY29uc3QgeyBjb25maWcsIGF1dGgsIGluZm8gfSA9IGNvbnRleHQ7XG5cbiAgICAgICAgICBjb25zdCBwYXJzZUZpZWxkcyA9IGF3YWl0IHRyYW5zZm9ybVR5cGVzKCdjcmVhdGUnLCBmaWVsZHMsIHtcbiAgICAgICAgICAgIGNsYXNzTmFtZSxcbiAgICAgICAgICAgIHBhcnNlR3JhcGhRTFNjaGVtYSxcbiAgICAgICAgICAgIHJlcTogeyBjb25maWcsIGF1dGgsIGluZm8gfSxcbiAgICAgICAgICB9KTtcblxuICAgICAgICAgIGNvbnN0IGNyZWF0ZWRPYmplY3QgPSBhd2FpdCBvYmplY3RzTXV0YXRpb25zLmNyZWF0ZU9iamVjdChcbiAgICAgICAgICAgIGNsYXNzTmFtZSxcbiAgICAgICAgICAgIHBhcnNlRmllbGRzLFxuICAgICAgICAgICAgY29uZmlnLFxuICAgICAgICAgICAgYXV0aCxcbiAgICAgICAgICAgIGluZm9cbiAgICAgICAgICApO1xuICAgICAgICAgIGNvbnN0IHNlbGVjdGVkRmllbGRzID0gZ2V0RmllbGROYW1lcyhtdXRhdGlvbkluZm8pXG4gICAgICAgICAgICAuZmlsdGVyKGZpZWxkID0+IGZpZWxkLnN0YXJ0c1dpdGgoYCR7Z2V0R3JhcGhRTFF1ZXJ5TmFtZX0uYCkpXG4gICAgICAgICAgICAubWFwKGZpZWxkID0+IGZpZWxkLnJlcGxhY2UoYCR7Z2V0R3JhcGhRTFF1ZXJ5TmFtZX0uYCwgJycpKTtcbiAgICAgICAgICBjb25zdCB7IGtleXMsIGluY2x1ZGUgfSA9IGV4dHJhY3RLZXlzQW5kSW5jbHVkZShzZWxlY3RlZEZpZWxkcyk7XG4gICAgICAgICAgY29uc3QgeyBrZXlzOiByZXF1aXJlZEtleXMsIG5lZWRHZXQgfSA9IGdldE9ubHlSZXF1aXJlZEZpZWxkcyhmaWVsZHMsIGtleXMsIGluY2x1ZGUsIFtcbiAgICAgICAgICAgICdpZCcsXG4gICAgICAgICAgICAnb2JqZWN0SWQnLFxuICAgICAgICAgICAgJ2NyZWF0ZWRBdCcsXG4gICAgICAgICAgICAndXBkYXRlZEF0JyxcbiAgICAgICAgICBdKTtcbiAgICAgICAgICBjb25zdCBuZWVkVG9HZXRBbGxLZXlzID0gb2JqZWN0c1F1ZXJpZXMubmVlZFRvR2V0QWxsS2V5cyhcbiAgICAgICAgICAgIHBhcnNlQ2xhc3MuZmllbGRzLFxuICAgICAgICAgICAga2V5cyxcbiAgICAgICAgICAgIHBhcnNlR3JhcGhRTFNjaGVtYS5wYXJzZUNsYXNzZXNcbiAgICAgICAgICApO1xuICAgICAgICAgIGxldCBvcHRpbWl6ZWRPYmplY3QgPSB7fTtcbiAgICAgICAgICBpZiAobmVlZEdldCAmJiAhbmVlZFRvR2V0QWxsS2V5cykge1xuICAgICAgICAgICAgb3B0aW1pemVkT2JqZWN0ID0gYXdhaXQgb2JqZWN0c1F1ZXJpZXMuZ2V0T2JqZWN0KFxuICAgICAgICAgICAgICBjbGFzc05hbWUsXG4gICAgICAgICAgICAgIGNyZWF0ZWRPYmplY3Qub2JqZWN0SWQsXG4gICAgICAgICAgICAgIHJlcXVpcmVkS2V5cyxcbiAgICAgICAgICAgICAgaW5jbHVkZSxcbiAgICAgICAgICAgICAgdW5kZWZpbmVkLFxuICAgICAgICAgICAgICB1bmRlZmluZWQsXG4gICAgICAgICAgICAgIGNvbmZpZyxcbiAgICAgICAgICAgICAgYXV0aCxcbiAgICAgICAgICAgICAgaW5mbyxcbiAgICAgICAgICAgICAgcGFyc2VHcmFwaFFMU2NoZW1hLnBhcnNlQ2xhc3Nlc1xuICAgICAgICAgICAgKTtcbiAgICAgICAgICB9IGVsc2UgaWYgKG5lZWRUb0dldEFsbEtleXMpIHtcbiAgICAgICAgICAgIG9wdGltaXplZE9iamVjdCA9IGF3YWl0IG9iamVjdHNRdWVyaWVzLmdldE9iamVjdChcbiAgICAgICAgICAgICAgY2xhc3NOYW1lLFxuICAgICAgICAgICAgICBjcmVhdGVkT2JqZWN0Lm9iamVjdElkLFxuICAgICAgICAgICAgICB1bmRlZmluZWQsXG4gICAgICAgICAgICAgIGluY2x1ZGUsXG4gICAgICAgICAgICAgIHVuZGVmaW5lZCxcbiAgICAgICAgICAgICAgdW5kZWZpbmVkLFxuICAgICAgICAgICAgICBjb25maWcsXG4gICAgICAgICAgICAgIGF1dGgsXG4gICAgICAgICAgICAgIGluZm8sXG4gICAgICAgICAgICAgIHBhcnNlR3JhcGhRTFNjaGVtYS5wYXJzZUNsYXNzZXNcbiAgICAgICAgICAgICk7XG4gICAgICAgICAgfVxuICAgICAgICAgIHJldHVybiB7XG4gICAgICAgICAgICBbZ2V0R3JhcGhRTFF1ZXJ5TmFtZV06IHtcbiAgICAgICAgICAgICAgLi4uY3JlYXRlZE9iamVjdCxcbiAgICAgICAgICAgICAgdXBkYXRlZEF0OiBjcmVhdGVkT2JqZWN0LmNyZWF0ZWRBdCxcbiAgICAgICAgICAgICAgLi4uZmlsdGVyRGVsZXRlZEZpZWxkcyhwYXJzZUZpZWxkcyksXG4gICAgICAgICAgICAgIC4uLm9wdGltaXplZE9iamVjdCxcbiAgICAgICAgICAgIH0sXG4gICAgICAgICAgfTtcbiAgICAgICAgfSBjYXRjaCAoZSkge1xuICAgICAgICAgIHBhcnNlR3JhcGhRTFNjaGVtYS5oYW5kbGVFcnJvcihlKTtcbiAgICAgICAgfVxuICAgICAgfSxcbiAgICB9KTtcblxuICAgIGlmIChcbiAgICAgIHBhcnNlR3JhcGhRTFNjaGVtYS5hZGRHcmFwaFFMVHlwZShjcmVhdGVHcmFwaFFMTXV0YXRpb24uYXJncy5pbnB1dC50eXBlLm9mVHlwZSkgJiZcbiAgICAgIHBhcnNlR3JhcGhRTFNjaGVtYS5hZGRHcmFwaFFMVHlwZShjcmVhdGVHcmFwaFFMTXV0YXRpb24udHlwZSlcbiAgICApIHtcbiAgICAgIHBhcnNlR3JhcGhRTFNjaGVtYS5hZGRHcmFwaFFMTXV0YXRpb24oY3JlYXRlR3JhcGhRTE11dGF0aW9uTmFtZSwgY3JlYXRlR3JhcGhRTE11dGF0aW9uKTtcbiAgICB9XG4gIH1cblxuICBpZiAoaXNVcGRhdGVFbmFibGVkKSB7XG4gICAgY29uc3QgdXBkYXRlR3JhcGhRTE11dGF0aW9uTmFtZSA9IHVwZGF0ZUFsaWFzIHx8IGB1cGRhdGUke2dyYXBoUUxDbGFzc05hbWV9YDtcbiAgICBjb25zdCB1cGRhdGVHcmFwaFFMTXV0YXRpb24gPSBtdXRhdGlvbldpdGhDbGllbnRNdXRhdGlvbklkKHtcbiAgICAgIG5hbWU6IGBVcGRhdGUke2dyYXBoUUxDbGFzc05hbWV9YCxcbiAgICAgIGRlc2NyaXB0aW9uOiBgVGhlICR7dXBkYXRlR3JhcGhRTE11dGF0aW9uTmFtZX0gbXV0YXRpb24gY2FuIGJlIHVzZWQgdG8gdXBkYXRlIGFuIG9iamVjdCBvZiB0aGUgJHtncmFwaFFMQ2xhc3NOYW1lfSBjbGFzcy5gLFxuICAgICAgaW5wdXRGaWVsZHM6IHtcbiAgICAgICAgaWQ6IGRlZmF1bHRHcmFwaFFMVHlwZXMuR0xPQkFMX09SX09CSkVDVF9JRF9BVFQsXG4gICAgICAgIGZpZWxkczoge1xuICAgICAgICAgIGRlc2NyaXB0aW9uOiAnVGhlc2UgYXJlIHRoZSBmaWVsZHMgdGhhdCB3aWxsIGJlIHVzZWQgdG8gdXBkYXRlIHRoZSBvYmplY3QuJyxcbiAgICAgICAgICB0eXBlOiBjbGFzc0dyYXBoUUxVcGRhdGVUeXBlIHx8IGRlZmF1bHRHcmFwaFFMVHlwZXMuT0JKRUNULFxuICAgICAgICB9LFxuICAgICAgfSxcbiAgICAgIG91dHB1dEZpZWxkczoge1xuICAgICAgICBbZ2V0R3JhcGhRTFF1ZXJ5TmFtZV06IHtcbiAgICAgICAgICBkZXNjcmlwdGlvbjogJ1RoaXMgaXMgdGhlIHVwZGF0ZWQgb2JqZWN0LicsXG4gICAgICAgICAgdHlwZTogbmV3IEdyYXBoUUxOb25OdWxsKGNsYXNzR3JhcGhRTE91dHB1dFR5cGUgfHwgZGVmYXVsdEdyYXBoUUxUeXBlcy5PQkpFQ1QpLFxuICAgICAgICB9LFxuICAgICAgfSxcbiAgICAgIG11dGF0ZUFuZEdldFBheWxvYWQ6IGFzeW5jIChhcmdzLCBjb250ZXh0LCBtdXRhdGlvbkluZm8pID0+IHtcbiAgICAgICAgdHJ5IHtcbiAgICAgICAgICBsZXQgeyBpZCwgZmllbGRzIH0gPSBkZWVwY29weShhcmdzKTtcbiAgICAgICAgICBpZiAoIWZpZWxkcykgZmllbGRzID0ge307XG4gICAgICAgICAgY29uc3QgeyBjb25maWcsIGF1dGgsIGluZm8gfSA9IGNvbnRleHQ7XG5cbiAgICAgICAgICBjb25zdCBnbG9iYWxJZE9iamVjdCA9IGZyb21HbG9iYWxJZChpZCk7XG5cbiAgICAgICAgICBpZiAoZ2xvYmFsSWRPYmplY3QudHlwZSA9PT0gY2xhc3NOYW1lKSB7XG4gICAgICAgICAgICBpZCA9IGdsb2JhbElkT2JqZWN0LmlkO1xuICAgICAgICAgIH1cblxuICAgICAgICAgIGNvbnN0IHBhcnNlRmllbGRzID0gYXdhaXQgdHJhbnNmb3JtVHlwZXMoJ3VwZGF0ZScsIGZpZWxkcywge1xuICAgICAgICAgICAgY2xhc3NOYW1lLFxuICAgICAgICAgICAgcGFyc2VHcmFwaFFMU2NoZW1hLFxuICAgICAgICAgICAgcmVxOiB7IGNvbmZpZywgYXV0aCwgaW5mbyB9LFxuICAgICAgICAgIH0pO1xuXG4gICAgICAgICAgY29uc3QgdXBkYXRlZE9iamVjdCA9IGF3YWl0IG9iamVjdHNNdXRhdGlvbnMudXBkYXRlT2JqZWN0KFxuICAgICAgICAgICAgY2xhc3NOYW1lLFxuICAgICAgICAgICAgaWQsXG4gICAgICAgICAgICBwYXJzZUZpZWxkcyxcbiAgICAgICAgICAgIGNvbmZpZyxcbiAgICAgICAgICAgIGF1dGgsXG4gICAgICAgICAgICBpbmZvXG4gICAgICAgICAgKTtcblxuICAgICAgICAgIGNvbnN0IHNlbGVjdGVkRmllbGRzID0gZ2V0RmllbGROYW1lcyhtdXRhdGlvbkluZm8pXG4gICAgICAgICAgICAuZmlsdGVyKGZpZWxkID0+IGZpZWxkLnN0YXJ0c1dpdGgoYCR7Z2V0R3JhcGhRTFF1ZXJ5TmFtZX0uYCkpXG4gICAgICAgICAgICAubWFwKGZpZWxkID0+IGZpZWxkLnJlcGxhY2UoYCR7Z2V0R3JhcGhRTFF1ZXJ5TmFtZX0uYCwgJycpKTtcbiAgICAgICAgICBjb25zdCB7IGtleXMsIGluY2x1ZGUgfSA9IGV4dHJhY3RLZXlzQW5kSW5jbHVkZShzZWxlY3RlZEZpZWxkcyk7XG4gICAgICAgICAgY29uc3QgeyBrZXlzOiByZXF1aXJlZEtleXMsIG5lZWRHZXQgfSA9IGdldE9ubHlSZXF1aXJlZEZpZWxkcyhmaWVsZHMsIGtleXMsIGluY2x1ZGUsIFtcbiAgICAgICAgICAgICdpZCcsXG4gICAgICAgICAgICAnb2JqZWN0SWQnLFxuICAgICAgICAgICAgJ3VwZGF0ZWRBdCcsXG4gICAgICAgICAgXSk7XG4gICAgICAgICAgY29uc3QgbmVlZFRvR2V0QWxsS2V5cyA9IG9iamVjdHNRdWVyaWVzLm5lZWRUb0dldEFsbEtleXMoXG4gICAgICAgICAgICBwYXJzZUNsYXNzLmZpZWxkcyxcbiAgICAgICAgICAgIGtleXMsXG4gICAgICAgICAgICBwYXJzZUdyYXBoUUxTY2hlbWEucGFyc2VDbGFzc2VzXG4gICAgICAgICAgKTtcbiAgICAgICAgICBsZXQgb3B0aW1pemVkT2JqZWN0ID0ge307XG4gICAgICAgICAgaWYgKG5lZWRHZXQgJiYgIW5lZWRUb0dldEFsbEtleXMpIHtcbiAgICAgICAgICAgIG9wdGltaXplZE9iamVjdCA9IGF3YWl0IG9iamVjdHNRdWVyaWVzLmdldE9iamVjdChcbiAgICAgICAgICAgICAgY2xhc3NOYW1lLFxuICAgICAgICAgICAgICBpZCxcbiAgICAgICAgICAgICAgcmVxdWlyZWRLZXlzLFxuICAgICAgICAgICAgICBpbmNsdWRlLFxuICAgICAgICAgICAgICB1bmRlZmluZWQsXG4gICAgICAgICAgICAgIHVuZGVmaW5lZCxcbiAgICAgICAgICAgICAgY29uZmlnLFxuICAgICAgICAgICAgICBhdXRoLFxuICAgICAgICAgICAgICBpbmZvLFxuICAgICAgICAgICAgICBwYXJzZUdyYXBoUUxTY2hlbWEucGFyc2VDbGFzc2VzXG4gICAgICAgICAgICApO1xuICAgICAgICAgIH0gZWxzZSBpZiAobmVlZFRvR2V0QWxsS2V5cykge1xuICAgICAgICAgICAgb3B0aW1pemVkT2JqZWN0ID0gYXdhaXQgb2JqZWN0c1F1ZXJpZXMuZ2V0T2JqZWN0KFxuICAgICAgICAgICAgICBjbGFzc05hbWUsXG4gICAgICAgICAgICAgIGlkLFxuICAgICAgICAgICAgICB1bmRlZmluZWQsXG4gICAgICAgICAgICAgIGluY2x1ZGUsXG4gICAgICAgICAgICAgIHVuZGVmaW5lZCxcbiAgICAgICAgICAgICAgdW5kZWZpbmVkLFxuICAgICAgICAgICAgICBjb25maWcsXG4gICAgICAgICAgICAgIGF1dGgsXG4gICAgICAgICAgICAgIGluZm8sXG4gICAgICAgICAgICAgIHBhcnNlR3JhcGhRTFNjaGVtYS5wYXJzZUNsYXNzZXNcbiAgICAgICAgICAgICk7XG4gICAgICAgICAgfVxuICAgICAgICAgIHJldHVybiB7XG4gICAgICAgICAgICBbZ2V0R3JhcGhRTFF1ZXJ5TmFtZV06IHtcbiAgICAgICAgICAgICAgb2JqZWN0SWQ6IGlkLFxuICAgICAgICAgICAgICAuLi51cGRhdGVkT2JqZWN0LFxuICAgICAgICAgICAgICAuLi5maWx0ZXJEZWxldGVkRmllbGRzKHBhcnNlRmllbGRzKSxcbiAgICAgICAgICAgICAgLi4ub3B0aW1pemVkT2JqZWN0LFxuICAgICAgICAgICAgfSxcbiAgICAgICAgICB9O1xuICAgICAgICB9IGNhdGNoIChlKSB7XG4gICAgICAgICAgcGFyc2VHcmFwaFFMU2NoZW1hLmhhbmRsZUVycm9yKGUpO1xuICAgICAgICB9XG4gICAgICB9LFxuICAgIH0pO1xuXG4gICAgaWYgKFxuICAgICAgcGFyc2VHcmFwaFFMU2NoZW1hLmFkZEdyYXBoUUxUeXBlKHVwZGF0ZUdyYXBoUUxNdXRhdGlvbi5hcmdzLmlucHV0LnR5cGUub2ZUeXBlKSAmJlxuICAgICAgcGFyc2VHcmFwaFFMU2NoZW1hLmFkZEdyYXBoUUxUeXBlKHVwZGF0ZUdyYXBoUUxNdXRhdGlvbi50eXBlKVxuICAgICkge1xuICAgICAgcGFyc2VHcmFwaFFMU2NoZW1hLmFkZEdyYXBoUUxNdXRhdGlvbih1cGRhdGVHcmFwaFFMTXV0YXRpb25OYW1lLCB1cGRhdGVHcmFwaFFMTXV0YXRpb24pO1xuICAgIH1cbiAgfVxuXG4gIGlmIChpc0Rlc3Ryb3lFbmFibGVkKSB7XG4gICAgY29uc3QgZGVsZXRlR3JhcGhRTE11dGF0aW9uTmFtZSA9IGRlc3Ryb3lBbGlhcyB8fCBgZGVsZXRlJHtncmFwaFFMQ2xhc3NOYW1lfWA7XG4gICAgY29uc3QgZGVsZXRlR3JhcGhRTE11dGF0aW9uID0gbXV0YXRpb25XaXRoQ2xpZW50TXV0YXRpb25JZCh7XG4gICAgICBuYW1lOiBgRGVsZXRlJHtncmFwaFFMQ2xhc3NOYW1lfWAsXG4gICAgICBkZXNjcmlwdGlvbjogYFRoZSAke2RlbGV0ZUdyYXBoUUxNdXRhdGlvbk5hbWV9IG11dGF0aW9uIGNhbiBiZSB1c2VkIHRvIGRlbGV0ZSBhbiBvYmplY3Qgb2YgdGhlICR7Z3JhcGhRTENsYXNzTmFtZX0gY2xhc3MuYCxcbiAgICAgIGlucHV0RmllbGRzOiB7XG4gICAgICAgIGlkOiBkZWZhdWx0R3JhcGhRTFR5cGVzLkdMT0JBTF9PUl9PQkpFQ1RfSURfQVRULFxuICAgICAgfSxcbiAgICAgIG91dHB1dEZpZWxkczoge1xuICAgICAgICBbZ2V0R3JhcGhRTFF1ZXJ5TmFtZV06IHtcbiAgICAgICAgICBkZXNjcmlwdGlvbjogJ1RoaXMgaXMgdGhlIGRlbGV0ZWQgb2JqZWN0LicsXG4gICAgICAgICAgdHlwZTogbmV3IEdyYXBoUUxOb25OdWxsKGNsYXNzR3JhcGhRTE91dHB1dFR5cGUgfHwgZGVmYXVsdEdyYXBoUUxUeXBlcy5PQkpFQ1QpLFxuICAgICAgICB9LFxuICAgICAgfSxcbiAgICAgIG11dGF0ZUFuZEdldFBheWxvYWQ6IGFzeW5jIChhcmdzLCBjb250ZXh0LCBtdXRhdGlvbkluZm8pID0+IHtcbiAgICAgICAgdHJ5IHtcbiAgICAgICAgICBsZXQgeyBpZCB9ID0gZGVlcGNvcHkoYXJncyk7XG4gICAgICAgICAgY29uc3QgeyBjb25maWcsIGF1dGgsIGluZm8gfSA9IGNvbnRleHQ7XG5cbiAgICAgICAgICBjb25zdCBnbG9iYWxJZE9iamVjdCA9IGZyb21HbG9iYWxJZChpZCk7XG5cbiAgICAgICAgICBpZiAoZ2xvYmFsSWRPYmplY3QudHlwZSA9PT0gY2xhc3NOYW1lKSB7XG4gICAgICAgICAgICBpZCA9IGdsb2JhbElkT2JqZWN0LmlkO1xuICAgICAgICAgIH1cblxuICAgICAgICAgIGNvbnN0IHNlbGVjdGVkRmllbGRzID0gZ2V0RmllbGROYW1lcyhtdXRhdGlvbkluZm8pXG4gICAgICAgICAgICAuZmlsdGVyKGZpZWxkID0+IGZpZWxkLnN0YXJ0c1dpdGgoYCR7Z2V0R3JhcGhRTFF1ZXJ5TmFtZX0uYCkpXG4gICAgICAgICAgICAubWFwKGZpZWxkID0+IGZpZWxkLnJlcGxhY2UoYCR7Z2V0R3JhcGhRTFF1ZXJ5TmFtZX0uYCwgJycpKTtcbiAgICAgICAgICBjb25zdCB7IGtleXMsIGluY2x1ZGUgfSA9IGV4dHJhY3RLZXlzQW5kSW5jbHVkZShzZWxlY3RlZEZpZWxkcyk7XG4gICAgICAgICAgbGV0IG9wdGltaXplZE9iamVjdCA9IHt9O1xuICAgICAgICAgIGlmIChrZXlzICYmIGtleXMuc3BsaXQoJywnKS5maWx0ZXIoa2V5ID0+ICFbJ2lkJywgJ29iamVjdElkJ10uaW5jbHVkZXMoa2V5KSkubGVuZ3RoID4gMCkge1xuICAgICAgICAgICAgb3B0aW1pemVkT2JqZWN0ID0gYXdhaXQgb2JqZWN0c1F1ZXJpZXMuZ2V0T2JqZWN0KFxuICAgICAgICAgICAgICBjbGFzc05hbWUsXG4gICAgICAgICAgICAgIGlkLFxuICAgICAgICAgICAgICBrZXlzLFxuICAgICAgICAgICAgICBpbmNsdWRlLFxuICAgICAgICAgICAgICB1bmRlZmluZWQsXG4gICAgICAgICAgICAgIHVuZGVmaW5lZCxcbiAgICAgICAgICAgICAgY29uZmlnLFxuICAgICAgICAgICAgICBhdXRoLFxuICAgICAgICAgICAgICBpbmZvLFxuICAgICAgICAgICAgICBwYXJzZUdyYXBoUUxTY2hlbWEucGFyc2VDbGFzc2VzXG4gICAgICAgICAgICApO1xuICAgICAgICAgIH1cbiAgICAgICAgICBhd2FpdCBvYmplY3RzTXV0YXRpb25zLmRlbGV0ZU9iamVjdChjbGFzc05hbWUsIGlkLCBjb25maWcsIGF1dGgsIGluZm8pO1xuICAgICAgICAgIHJldHVybiB7XG4gICAgICAgICAgICBbZ2V0R3JhcGhRTFF1ZXJ5TmFtZV06IHtcbiAgICAgICAgICAgICAgb2JqZWN0SWQ6IGlkLFxuICAgICAgICAgICAgICAuLi5vcHRpbWl6ZWRPYmplY3QsXG4gICAgICAgICAgICB9LFxuICAgICAgICAgIH07XG4gICAgICAgIH0gY2F0Y2ggKGUpIHtcbiAgICAgICAgICBwYXJzZUdyYXBoUUxTY2hlbWEuaGFuZGxlRXJyb3IoZSk7XG4gICAgICAgIH1cbiAgICAgIH0sXG4gICAgfSk7XG5cbiAgICBpZiAoXG4gICAgICBwYXJzZUdyYXBoUUxTY2hlbWEuYWRkR3JhcGhRTFR5cGUoZGVsZXRlR3JhcGhRTE11dGF0aW9uLmFyZ3MuaW5wdXQudHlwZS5vZlR5cGUpICYmXG4gICAgICBwYXJzZUdyYXBoUUxTY2hlbWEuYWRkR3JhcGhRTFR5cGUoZGVsZXRlR3JhcGhRTE11dGF0aW9uLnR5cGUpXG4gICAgKSB7XG4gICAgICBwYXJzZUdyYXBoUUxTY2hlbWEuYWRkR3JhcGhRTE11dGF0aW9uKGRlbGV0ZUdyYXBoUUxNdXRhdGlvbk5hbWUsIGRlbGV0ZUdyYXBoUUxNdXRhdGlvbik7XG4gICAgfVxuICB9XG59O1xuXG5leHBvcnQgeyBsb2FkIH07XG4iXSwibWFwcGluZ3MiOiI7Ozs7OztBQUFBLElBQUFBLFFBQUEsR0FBQUMsT0FBQTtBQUNBLElBQUFDLGFBQUEsR0FBQUQsT0FBQTtBQUNBLElBQUFFLGtCQUFBLEdBQUFDLHNCQUFBLENBQUFILE9BQUE7QUFDQSxJQUFBSSxTQUFBLEdBQUFELHNCQUFBLENBQUFILE9BQUE7QUFDQSxJQUFBSyxtQkFBQSxHQUFBQyx1QkFBQSxDQUFBTixPQUFBO0FBQ0EsSUFBQU8sa0JBQUEsR0FBQVAsT0FBQTtBQUNBLElBQUFRLGdCQUFBLEdBQUFGLHVCQUFBLENBQUFOLE9BQUE7QUFDQSxJQUFBUyxjQUFBLEdBQUFILHVCQUFBLENBQUFOLE9BQUE7QUFDQSxJQUFBVSx1QkFBQSxHQUFBVixPQUFBO0FBQ0EsSUFBQVcsVUFBQSxHQUFBWCxPQUFBO0FBQ0EsSUFBQVksU0FBQSxHQUFBWixPQUFBO0FBQTBELFNBQUFhLHlCQUFBQyxXQUFBLGVBQUFDLE9BQUEsa0NBQUFDLGlCQUFBLE9BQUFELE9BQUEsUUFBQUUsZ0JBQUEsT0FBQUYsT0FBQSxZQUFBRix3QkFBQSxZQUFBQSxDQUFBQyxXQUFBLFdBQUFBLFdBQUEsR0FBQUcsZ0JBQUEsR0FBQUQsaUJBQUEsS0FBQUYsV0FBQTtBQUFBLFNBQUFSLHdCQUFBWSxHQUFBLEVBQUFKLFdBQUEsU0FBQUEsV0FBQSxJQUFBSSxHQUFBLElBQUFBLEdBQUEsQ0FBQUMsVUFBQSxXQUFBRCxHQUFBLFFBQUFBLEdBQUEsb0JBQUFBLEdBQUEsd0JBQUFBLEdBQUEsNEJBQUFFLE9BQUEsRUFBQUYsR0FBQSxVQUFBRyxLQUFBLEdBQUFSLHdCQUFBLENBQUFDLFdBQUEsT0FB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