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
//# sourceMappingURL=data:application/json;charset=utf-8;base64,eyJ2ZXJzaW9uIjozLCJuYW1lcyI6WyJmaWx0ZXJEZWxldGVkRmllbGRzIiwiZmllbGRzIiwiT2JqZWN0Iiwia2V5cyIsInJlZHVjZSIsImFjYyIsImtleSIsIl9fb3AiLCJnZXRPbmx5UmVxdWlyZWRGaWVsZHMiLCJ1cGRhdGVkRmllbGRzIiwic2VsZWN0ZWRGaWVsZHNTdHJpbmciLCJpbmNsdWRlZEZpZWxkc1N0cmluZyIsIm5hdGl2ZU9iamVjdEZpZWxkcyIsImluY2x1ZGVkRmllbGRzIiwic3BsaXQiLCJzZWxlY3RlZEZpZWxkcyIsIm1pc3NpbmdGaWVsZHMiLCJmaWx0ZXIiLCJmaWVsZCIsImluY2x1ZGVzIiwiam9pbiIsImxlbmd0aCIsIm5lZWRHZXQiLCJsb2FkIiwicGFyc2VHcmFwaFFMU2NoZW1hIiwicGFyc2VDbGFzcyIsInBhcnNlQ2xhc3NDb25maWciLCJjbGFzc05hbWUiLCJncmFwaFFMQ2xhc3NOYW1lIiwidHJhbnNmb3JtQ2xhc3NOYW1lVG9HcmFwaFFMIiwiZ2V0R3JhcGhRTFF1ZXJ5TmFtZSIsImNoYXJBdCIsInRvTG93ZXJDYXNlIiwic2xpY2UiLCJjcmVhdGUiLCJpc0NyZWF0ZUVuYWJsZWQiLCJ1cGRhdGUiLCJpc1VwZGF0ZUVuYWJsZWQiLCJkZXN0cm95IiwiaXNEZXN0cm95RW5hYmxlZCIsImNyZWF0ZUFsaWFzIiwidXBkYXRlQWxpYXMiLCJkZXN0cm95QWxpYXMiLCJnZXRQYXJzZUNsYXNzTXV0YXRpb25Db25maWciLCJjbGFzc0dyYXBoUUxDcmVhdGVUeXBlIiwiY2xhc3NHcmFwaFFMVXBkYXRlVHlwZSIsImNsYXNzR3JhcGhRTE91dHB1dFR5cGUiLCJwYXJzZUNsYXNzVHlwZXMiLCJjcmVhdGVHcmFwaFFMTXV0YXRpb25OYW1lIiwiY3JlYXRlR3JhcGhRTE11dGF0aW9uIiwibXV0YXRpb25XaXRoQ2xpZW50TXV0YXRpb25JZCIsIm5hbWUiLCJkZXNjcmlwdGlvbiIsImlucHV0RmllbGRzIiwidHlwZSIsImRlZmF1bHRHcmFwaFFMVHlwZXMiLCJPQkpFQ1QiLCJvdXRwdXRGaWVsZHMiLCJHcmFwaFFMTm9uTnVsbCIsIm11dGF0ZUFuZEdldFBheWxvYWQiLCJhcmdzIiwiY29udGV4dCIsIm11dGF0aW9uSW5mbyIsImRlZXBjb3B5IiwiY29uZmlnIiwiYXV0aCIsImluZm8iLCJwYXJzZUZpZWxkcyIsInRyYW5zZm9ybVR5cGVzIiwicmVxIiwiY3JlYXRlZE9iamVjdCIsIm9iamVjdHNNdXRhdGlvbnMiLCJjcmVhdGVPYmplY3QiLCJnZXRGaWVsZE5hbWVzIiwic3RhcnRzV2l0aCIsIm1hcCIsInJlcGxhY2UiLCJpbmNsdWRlIiwiZXh0cmFjdEtleXNBbmRJbmNsdWRlIiwicmVxdWlyZWRLZXlzIiwibmVlZFRvR2V0QWxsS2V5cyIsIm9iamVjdHNRdWVyaWVzIiwicGFyc2VDbGFzc2VzIiwib3B0aW1pemVkT2JqZWN0IiwiZ2V0T2JqZWN0Iiwib2JqZWN0SWQiLCJ1bmRlZmluZWQiLCJ1cGRhdGVkQXQiLCJjcmVhdGVkQXQiLCJlIiwiaGFuZGxlRXJyb3IiLCJhZGRHcmFwaFFMVHlwZSIsImlucHV0Iiwib2ZUeXBlIiwiYWRkR3JhcGhRTE11dGF0aW9uIiwidXBkYXRlR3JhcGhRTE11dGF0aW9uTmFtZSIsInVwZGF0ZUdyYXBoUUxNdXRhdGlvbiIsImlkIiwiR0xPQkFMX09SX09CSkVDVF9JRF9BVFQiLCJnbG9iYWxJZE9iamVjdCIsImZyb21HbG9iYWxJZCIsInVwZGF0ZWRPYmplY3QiLCJ1cGRhdGVPYmplY3QiLCJkZWxldGVHcmFwaFFMTXV0YXRpb25OYW1lIiwiZGVsZXRlR3JhcGhRTE11dGF0aW9uIiwiZGVsZXRlT2JqZWN0Il0sInNvdXJjZXMiOlsiLi4vLi4vLi4vc3JjL0dyYXBoUUwvbG9hZGVycy9wYXJzZUNsYXNzTXV0YXRpb25zLmpzIl0sInNvdXJjZXNDb250ZW50IjpbImltcG9ydCB7IEdyYXBoUUxOb25OdWxsIH0gZnJvbSAnZ3JhcGhxbCc7XG5pbXBvcnQgeyBmcm9tR2xvYmFsSWQsIG11dGF0aW9uV2l0aENsaWVudE11dGF0aW9uSWQgfSBmcm9tICdncmFwaHFsLXJlbGF5JztcbmltcG9ydCBnZXRGaWVsZE5hbWVzIGZyb20gJ2dyYXBocWwtbGlzdC1maWVsZHMnO1xuaW1wb3J0IGRlZXBjb3B5IGZyb20gJ2RlZXBjb3B5JztcbmltcG9ydCAqIGFzIGRlZmF1bHRHcmFwaFFMVHlwZXMgZnJvbSAnLi9kZWZhdWx0R3JhcGhRTFR5cGVzJztcbmltcG9ydCB7IGV4dHJhY3RLZXlzQW5kSW5jbHVkZSwgZ2V0UGFyc2VDbGFzc011dGF0aW9uQ29uZmlnIH0gZnJvbSAnLi4vcGFyc2VHcmFwaFFMVXRpbHMnO1xuaW1wb3J0ICogYXMgb2JqZWN0c011dGF0aW9ucyBmcm9tICcuLi9oZWxwZXJzL29iamVjdHNNdXRhdGlvbnMnO1xuaW1wb3J0ICogYXMgb2JqZWN0c1F1ZXJpZXMgZnJvbSAnLi4vaGVscGVycy9vYmplY3RzUXVlcmllcyc7XG5pbXBvcnQgeyBQYXJzZUdyYXBoUUxDbGFzc0NvbmZpZyB9IGZyb20gJy4uLy4uL0NvbnRyb2xsZXJzL1BhcnNlR3JhcGhRTENvbnRyb2xsZXInO1xuaW1wb3J0IHsgdHJhbnNmb3JtQ2xhc3NOYW1lVG9HcmFwaFFMIH0gZnJvbSAnLi4vdHJhbnNmb3JtZXJzL2NsYXNzTmFtZSc7XG5pbXBvcnQgeyB0cmFuc2Zvcm1UeXBlcyB9IGZyb20gJy4uL3RyYW5zZm9ybWVycy9tdXRhdGlvbic7XG5cbmNvbnN0IGZpbHRlckRlbGV0ZWRGaWVsZHMgPSBmaWVsZHMgPT5cbiAgT2JqZWN0LmtleXMoZmllbGRzKS5yZWR1Y2UoKGFjYywga2V5KSA9PiB7XG4gICAgaWYgKHR5cGVvZiBmaWVsZHNba2V5XSA9PT0gJ29iamVjdCcgJiYgZmllbGRzW2tleV0/Ll9fb3AgPT09ICdEZWxldGUnKSB7XG4gICAgICBhY2Nba2V5XSA9IG51bGw7XG4gICAgfVxuICAgIHJldHVybiBhY2M7XG4gIH0sIGZpZWxkcyk7XG5cbmNvbnN0IGdldE9ubHlSZXF1aXJlZEZpZWxkcyA9IChcbiAgdXBkYXRlZEZpZWxkcyxcbiAgc2VsZWN0ZWRGaWVsZHNTdHJpbmcsXG4gIGluY2x1ZGVkRmllbGRzU3RyaW5nLFxuICBuYXRpdmVPYmplY3RGaWVsZHNcbikgPT4ge1xuICBjb25zdCBpbmNsdWRlZEZpZWxkcyA9IGluY2x1ZGVkRmllbGRzU3RyaW5nID8gaW5jbHVkZWRGaWVsZHNTdHJpbmcuc3BsaXQoJywnKSA6IFtdO1xuICBjb25zdCBzZWxlY3RlZEZpZWxkcyA9IHNlbGVjdGVkRmllbGRzU3RyaW5nID8gc2VsZWN0ZWRGaWVsZHNTdHJpbmcuc3BsaXQoJywnKSA6IFtdO1xuICBjb25zdCBtaXNzaW5nRmllbGRzID0gc2VsZWN0ZWRGaWVsZHNcbiAgICAuZmlsdGVyKGZpZWxkID0+ICFuYXRpdmVPYmplY3RGaWVsZHMuaW5jbHVkZXMoZmllbGQpIHx8IGluY2x1ZGVkRmllbGRzLmluY2x1ZGVzKGZpZWxkKSlcbiAgICAuam9pbignLCcpO1xuICBpZiAoIW1pc3NpbmdGaWVsZHMubGVuZ3RoKSB7XG4gICAgcmV0dXJuIHsgbmVlZEdldDogZmFsc2UsIGtleXM6ICcnIH07XG4gIH0gZWxzZSB7XG4gICAgcmV0dXJuIHsgbmVlZEdldDogdHJ1ZSwga2V5czogbWlzc2luZ0ZpZWxkcyB9O1xuICB9XG59O1xuXG5jb25zdCBsb2FkID0gZnVuY3Rpb24gKHBhcnNlR3JhcGhRTFNjaGVtYSwgcGFyc2VDbGFzcywgcGFyc2VDbGFzc0NvbmZpZzogP1BhcnNlR3JhcGhRTENsYXNzQ29uZmlnKSB7XG4gIGNvbnN0IGNsYXNzTmFtZSA9IHBhcnNlQ2xhc3MuY2xhc3NOYW1lO1xuICBjb25zdCBncmFwaFFMQ2xhc3NOYW1lID0gdHJhbnNmb3JtQ2xhc3NOYW1lVG9HcmFwaFFMKGNsYXNzTmFtZSk7XG4gIGNvbnN0IGdldEdyYXBoUUxRdWVyeU5hbWUgPSBncmFwaFFMQ2xhc3NOYW1lLmNoYXJBdCgwKS50b0xvd2VyQ2FzZSgpICsgZ3JhcGhRTENsYXNzTmFtZS5zbGljZSgxKTtcblxuICBjb25zdCB7XG4gICAgY3JlYXRlOiBpc0NyZWF0ZUVuYWJsZWQgPSB0cnVlLFxuICAgIHVwZGF0ZTogaXNVcGRhdGVFbmFibGVkID0gdHJ1ZSxcbiAgICBkZXN0cm95OiBpc0Rlc3Ryb3lFbmFibGVkID0gdHJ1ZSxcbiAgICBjcmVhdGVBbGlhczogY3JlYXRlQWxpYXMgPSAnJyxcbiAgICB1cGRhdGVBbGlhczogdXBkYXRlQWxpYXMgPSAnJyxcbiAgICBkZXN0cm95QWxpYXM6IGRlc3Ryb3lBbGlhcyA9ICcnLFxuICB9ID0gZ2V0UGFyc2VDbGFzc011dGF0aW9uQ29uZmlnKHBhcnNlQ2xhc3NDb25maWcpO1xuXG4gIGNvbnN0IHtcbiAgICBjbGFzc0dyYXBoUUxDcmVhdGVUeXBlLFxuICAgIGNsYXNzR3JhcGhRTFVwZGF0ZVR5cGUsXG4gICAgY2xhc3NHcmFwaFFMT3V0cHV0VHlwZSxcbiAgfSA9IHBhcnNlR3JhcGhRTFNjaGVtYS5wYXJzZUNsYXNzVHlwZXNbY2xhc3NOYW1lXTtcblxuICBpZiAoaXNDcmVhdGVFbmFibGVkKSB7XG4gICAgY29uc3QgY3JlYXRlR3JhcGhRTE11dGF0aW9uTmFtZSA9IGNyZWF0ZUFsaWFzIHx8IGBjcmVhdGUke2dyYXBoUUxDbGFzc05hbWV9YDtcbiAgICBjb25zdCBjcmVhdGVHcmFwaFFMTXV0YXRpb24gPSBtdXRhdGlvbldpdGhDbGllbnRNdXRhdGlvbklkKHtcbiAgICAgIG5hbWU6IGBDcmVhdGUke2dyYXBoUUxDbGFzc05hbWV9YCxcbiAgICAgIGRlc2NyaXB0aW9uOiBgVGhlICR7Y3JlYXRlR3JhcGhRTE11dGF0aW9uTmFtZX0gbXV0YXRpb24gY2FuIGJlIHVzZWQgdG8gY3JlYXRlIGEgbmV3IG9iamVjdCBvZiB0aGUgJHtncmFwaFFMQ2xhc3NOYW1lfSBjbGFzcy5gLFxuICAgICAgaW5wdXRGaWVsZHM6IHtcbiAgICAgICAgZmllbGRzOiB7XG4gICAgICAgICAgZGVzY3JpcHRpb246ICdUaGVzZSBhcmUgdGhlIGZpZWxkcyB0aGF0IHdpbGwgYmUgdXNlZCB0byBjcmVhdGUgdGhlIG5ldyBvYmplY3QuJyxcbiAgICAgICAgICB0eXBlOiBjbGFzc0dyYXBoUUxDcmVhdGVUeXBlIHx8IGRlZmF1bHRHcmFwaFFMVHlwZXMuT0JKRUNULFxuICAgICAgICB9LFxuICAgICAgfSxcbiAgICAgIG91dHB1dEZpZWxkczoge1xuICAgICAgICBbZ2V0R3JhcGhRTFF1ZXJ5TmFtZV06IHtcbiAgICAgICAgICBkZXNjcmlwdGlvbjogJ1RoaXMgaXMgdGhlIGNyZWF0ZWQgb2JqZWN0LicsXG4gICAgICAgICAgdHlwZTogbmV3IEdyYXBoUUxOb25OdWxsKGNsYXNzR3JhcGhRTE91dHB1dFR5cGUgfHwgZGVmYXVsdEdyYXBoUUxUeXBlcy5PQkpFQ1QpLFxuICAgICAgICB9LFxuICAgICAgfSxcbiAgICAgIG11dGF0ZUFuZEdldFBheWxvYWQ6IGFzeW5jIChhcmdzLCBjb250ZXh0LCBtdXRhdGlvbkluZm8pID0+IHtcbiAgICAgICAgdHJ5IHtcbiAgICAgICAgICBsZXQgeyBmaWVsZHMgfSA9IGRlZXBjb3B5KGFyZ3MpO1xuICAgICAgICAgIGlmICghZmllbGRzKSBmaWVsZHMgPSB7fTtcbiAgICAgICAgICBjb25zdCB7IGNvbmZpZywgYXV0aCwgaW5mbyB9ID0gY29udGV4dDtcblxuICAgICAgICAgIGNvbnN0IHBhcnNlRmllbGRzID0gYXdhaXQgdHJhbnNmb3JtVHlwZXMoJ2NyZWF0ZScsIGZpZWxkcywge1xuICAgICAgICAgICAgY2xhc3NOYW1lLFxuICAgICAgICAgICAgcGFyc2VHcmFwaFFMU2NoZW1hLFxuICAgICAgICAgICAgcmVxOiB7IGNvbmZpZywgYXV0aCwgaW5mbyB9LFxuICAgICAgICAgIH0pO1xuXG4gICAgICAgICAgY29uc3QgY3JlYXRlZE9iamVjdCA9IGF3YWl0IG9iamVjdHNNdXRhdGlvbnMuY3JlYXRlT2JqZWN0KFxuICAgICAgICAgICAgY2xhc3NOYW1lLFxuICAgICAgICAgICAgcGFyc2VGaWVsZHMsXG4gICAgICAgICAgICBjb25maWcsXG4gICAgICAgICAgICBhdXRoLFxuICAgICAgICAgICAgaW5mb1xuICAgICAgICAgICk7XG4gICAgICAgICAgY29uc3Qgc2VsZWN0ZWRGaWVsZHMgPSBnZXRGaWVsZE5hbWVzKG11dGF0aW9uSW5mbylcbiAgICAgICAgICAgIC5maWx0ZXIoZmllbGQgPT4gZmllbGQuc3RhcnRzV2l0aChgJHtnZXRHcmFwaFFMUXVlcnlOYW1lfS5gKSlcbiAgICAgICAgICAgIC5tYXAoZmllbGQgPT4gZmllbGQucmVwbGFjZShgJHtnZXRHcmFwaFFMUXVlcnlOYW1lfS5gLCAnJykpO1xuICAgICAgICAgIGNvbnN0IHsga2V5cywgaW5jbHVkZSB9ID0gZXh0cmFjdEtleXNBbmRJbmNsdWRlKHNlbGVjdGVkRmllbGRzKTtcbiAgICAgICAgICBjb25zdCB7IGtleXM6IHJlcXVpcmVkS2V5cywgbmVlZEdldCB9ID0gZ2V0T25seVJlcXVpcmVkRmllbGRzKGZpZWxkcywga2V5cywgaW5jbHVkZSwgW1xuICAgICAgICAgICAgJ2lkJyxcbiAgICAgICAgICAgICdvYmplY3RJZCcsXG4gICAgICAgICAgICAnY3JlYXRlZEF0JyxcbiAgICAgICAgICAgICd1cGRhdGVkQXQnLFxuICAgICAgICAgIF0pO1xuICAgICAgICAgIGNvbnN0IG5lZWRUb0dldEFsbEtleXMgPSBvYmplY3RzUXVlcmllcy5uZWVkVG9HZXRBbGxLZXlzKFxuICAgICAgICAgICAgcGFyc2VDbGFzcy5maWVsZHMsXG4gICAgICAgICAgICBrZXlzLFxuICAgICAgICAgICAgcGFyc2VHcmFwaFFMU2NoZW1hLnBhcnNlQ2xhc3Nlc1xuICAgICAgICAgICk7XG4gICAgICAgICAgbGV0IG9wdGltaXplZE9iamVjdCA9IHt9O1xuICAgICAgICAgIGlmIChuZWVkR2V0ICYmICFuZWVkVG9HZXRBbGxLZXlzKSB7XG4gICAgICAgICAgICBvcHRpbWl6ZWRPYmplY3QgPSBhd2FpdCBvYmplY3RzUXVlcmllcy5nZXRPYmplY3QoXG4gICAgICAgICAgICAgIGNsYXNzTmFtZSxcbiAgICAgICAgICAgICAgY3JlYXRlZE9iamVjdC5vYmplY3RJZCxcbiAgICAgICAgICAgICAgcmVxdWlyZWRLZXlzLFxuICAgICAgICAgICAgICBpbmNsdWRlLFxuICAgICAgICAgICAgICB1bmRlZmluZWQsXG4gICAgICAgICAgICAgIHVuZGVmaW5lZCxcbiAgICAgICAgICAgICAgY29uZmlnLFxuICAgICAgICAgICAgICBhdXRoLFxuICAgICAgICAgICAgICBpbmZvLFxuICAgICAgICAgICAgICBwYXJzZUdyYXBoUUxTY2hlbWEucGFyc2VDbGFzc2VzXG4gICAgICAgICAgICApO1xuICAgICAgICAgIH0gZWxzZSBpZiAobmVlZFRvR2V0QWxsS2V5cykge1xuICAgICAgICAgICAgb3B0aW1pemVkT2JqZWN0ID0gYXdhaXQgb2JqZWN0c1F1ZXJpZXMuZ2V0T2JqZWN0KFxuICAgICAgICAgICAgICBjbGFzc05hbWUsXG4gICAgICAgICAgICAgIGNyZWF0ZWRPYmplY3Qub2JqZWN0SWQsXG4gICAgICAgICAgICAgIHVuZGVmaW5lZCxcbiAgICAgICAgICAgICAgaW5jbHVkZSxcbiAgICAgICAgICAgICAgdW5kZWZpbmVkLFxuICAgICAgICAgICAgICB1bmRlZmluZWQsXG4gICAgICAgICAgICAgIGNvbmZpZyxcbiAgICAgICAgICAgICAgYXV0aCxcbiAgICAgICAgICAgICAgaW5mbyxcbiAgICAgICAgICAgICAgcGFyc2VHcmFwaFFMU2NoZW1hLnBhcnNlQ2xhc3Nlc1xuICAgICAgICAgICAgKTtcbiAgICAgICAgICB9XG4gICAgICAgICAgcmV0dXJuIHtcbiAgICAgICAgICAgIFtnZXRHcmFwaFFMUXVlcnlOYW1lXToge1xuICAgICAgICAgICAgICAuLi5jcmVhdGVkT2JqZWN0LFxuICAgICAgICAgICAgICB1cGRhdGVkQXQ6IGNyZWF0ZWRPYmplY3QuY3JlYXRlZEF0LFxuICAgICAgICAgICAgICAuLi5maWx0ZXJEZWxldGVkRmllbGRzKHBhcnNlRmllbGRzKSxcbiAgICAgICAgICAgICAgLi4ub3B0aW1pemVkT2JqZWN0LFxuICAgICAgICAgICAgfSxcbiAgICAgICAgICB9O1xuICAgICAgICB9IGNhdGNoIChlKSB7XG4gICAgICAgICAgcGFyc2VHcmFwaFFMU2NoZW1hLmhhbmRsZUVycm9yKGUpO1xuICAgICAgICB9XG4gICAgICB9LFxuICAgIH0pO1xuXG4gICAgaWYgKFxuICAgICAgcGFyc2VHcmFwaFFMU2NoZW1hLmFkZEdyYXBoUUxUeXBlKGNyZWF0ZUdyYXBoUUxNdXRhdGlvbi5hcmdzLmlucHV0LnR5cGUub2ZUeXBlKSAmJlxuICAgICAgcGFyc2VHcmFwaFFMU2NoZW1hLmFkZEdyYXBoUUxUeXBlKGNyZWF0ZUdyYXBoUUxNdXRhdGlvbi50eXBlKVxuICAgICkge1xuICAgICAgcGFyc2VHcmFwaFFMU2NoZW1hLmFkZEdyYXBoUUxNdXRhdGlvbihjcmVhdGVHcmFwaFFMTXV0YXRpb25OYW1lLCBjcmVhdGVHcmFwaFFMTXV0YXRpb24pO1xuICAgIH1cbiAgfVxuXG4gIGlmIChpc1VwZGF0ZUVuYWJsZWQpIHtcbiAgICBjb25zdCB1cGRhdGVHcmFwaFFMTXV0YXRpb25OYW1lID0gdXBkYXRlQWxpYXMgfHwgYHVwZGF0ZSR7Z3JhcGhRTENsYXNzTmFtZX1gO1xuICAgIGNvbnN0IHVwZGF0ZUdyYXBoUUxNdXRhdGlvbiA9IG11dGF0aW9uV2l0aENsaWVudE11dGF0aW9uSWQoe1xuICAgICAgbmFtZTogYFVwZGF0ZSR7Z3JhcGhRTENsYXNzTmFtZX1gLFxuICAgICAgZGVzY3JpcHRpb246IGBUaGUgJHt1cGRhdGVHcmFwaFFMTXV0YXRpb25OYW1lfSBtdXRhdGlvbiBjYW4gYmUgdXNlZCB0byB1cGRhdGUgYW4gb2JqZWN0IG9mIHRoZSAke2dyYXBoUUxDbGFzc05hbWV9IGNsYXNzLmAsXG4gICAgICBpbnB1dEZpZWxkczoge1xuICAgICAgICBpZDogZGVmYXVsdEdyYXBoUUxUeXBlcy5HTE9CQUxfT1JfT0JKRUNUX0lEX0FUVCxcbiAgICAgICAgZmllbGRzOiB7XG4gICAgICAgICAgZGVzY3JpcHRpb246ICdUaGVzZSBhcmUgdGhlIGZpZWxkcyB0aGF0IHdpbGwgYmUgdXNlZCB0byB1cGRhdGUgdGhlIG9iamVjdC4nLFxuICAgICAgICAgIHR5cGU6IGNsYXNzR3JhcGhRTFVwZGF0ZVR5cGUgfHwgZGVmYXVsdEdyYXBoUUxUeXBlcy5PQkpFQ1QsXG4gICAgICAgIH0sXG4gICAgICB9LFxuICAgICAgb3V0cHV0RmllbGRzOiB7XG4gICAgICAgIFtnZXRHcmFwaFFMUXVlcnlOYW1lXToge1xuICAgICAgICAgIGRlc2NyaXB0aW9uOiAnVGhpcyBpcyB0aGUgdXBkYXRlZCBvYmplY3QuJyxcbiAgICAgICAgICB0eXBlOiBuZXcgR3JhcGhRTE5vbk51bGwoY2xhc3NHcmFwaFFMT3V0cHV0VHlwZSB8fCBkZWZhdWx0R3JhcGhRTFR5cGVzLk9CSkVDVCksXG4gICAgICAgIH0sXG4gICAgICB9LFxuICAgICAgbXV0YXRlQW5kR2V0UGF5bG9hZDogYXN5bmMgKGFyZ3MsIGNvbnRleHQsIG11dGF0aW9uSW5mbykgPT4ge1xuICAgICAgICB0cnkge1xuICAgICAgICAgIGxldCB7IGlkLCBmaWVsZHMgfSA9IGRlZXBjb3B5KGFyZ3MpO1xuICAgICAgICAgIGlmICghZmllbGRzKSBmaWVsZHMgPSB7fTtcbiAgICAgICAgICBjb25zdCB7IGNvbmZpZywgYXV0aCwgaW5mbyB9ID0gY29udGV4dDtcblxuICAgICAgICAgIGNvbnN0IGdsb2JhbElkT2JqZWN0ID0gZnJvbUdsb2JhbElkKGlkKTtcblxuICAgICAgICAgIGlmIChnbG9iYWxJZE9iamVjdC50eXBlID09PSBjbGFzc05hbWUpIHtcbiAgICAgICAgICAgIGlkID0gZ2xvYmFsSWRPYmplY3QuaWQ7XG4gICAgICAgICAgfVxuXG4gICAgICAgICAgY29uc3QgcGFyc2VGaWVsZHMgPSBhd2FpdCB0cmFuc2Zvcm1UeXBlcygndXBkYXRlJywgZmllbGRzLCB7XG4gICAgICAgICAgICBjbGFzc05hbWUsXG4gICAgICAgICAgICBwYXJzZUdyYXBoUUxTY2hlbWEsXG4gICAgICAgICAgICByZXE6IHsgY29uZmlnLCBhdXRoLCBpbmZvIH0sXG4gICAgICAgICAgfSk7XG5cbiAgICAgICAgICBjb25zdCB1cGRhdGVkT2JqZWN0ID0gYXdhaXQgb2JqZWN0c011dGF0aW9ucy51cGRhdGVPYmplY3QoXG4gICAgICAgICAgICBjbGFzc05hbWUsXG4gICAgICAgICAgICBpZCxcbiAgICAgICAgICAgIHBhcnNlRmllbGRzLFxuICAgICAgICAgICAgY29uZmlnLFxuICAgICAgICAgICAgYXV0aCxcbiAgICAgICAgICAgIGluZm9cbiAgICAgICAgICApO1xuXG4gICAgICAgICAgY29uc3Qgc2VsZWN0ZWRGaWVsZHMgPSBnZXRGaWVsZE5hbWVzKG11dGF0aW9uSW5mbylcbiAgICAgICAgICAgIC5maWx0ZXIoZmllbGQgPT4gZmllbGQuc3RhcnRzV2l0aChgJHtnZXRHcmFwaFFMUXVlcnlOYW1lfS5gKSlcbiAgICAgICAgICAgIC5tYXAoZmllbGQgPT4gZmllbGQucmVwbGFjZShgJHtnZXRHcmFwaFFMUXVlcnlOYW1lfS5gLCAnJykpO1xuICAgICAgICAgIGNvbnN0IHsga2V5cywgaW5jbHVkZSB9ID0gZXh0cmFjdEtleXNBbmRJbmNsdWRlKHNlbGVjdGVkRmllbGRzKTtcbiAgICAgICAgICBjb25zdCB7IGtleXM6IHJlcXVpcmVkS2V5cywgbmVlZEdldCB9ID0gZ2V0T25seVJlcXVpcmVkRmllbGRzKGZpZWxkcywga2V5cywgaW5jbHVkZSwgW1xuICAgICAgICAgICAgJ2lkJyxcbiAgICAgICAgICAgICdvYmplY3RJZCcsXG4gICAgICAgICAgICAndXBkYXRlZEF0JyxcbiAgICAgICAgICBdKTtcbiAgICAgICAgICBjb25zdCBuZWVkVG9HZXRBbGxLZXlzID0gb2JqZWN0c1F1ZXJpZXMubmVlZFRvR2V0QWxsS2V5cyhcbiAgICAgICAgICAgIHBhcnNlQ2xhc3MuZmllbGRzLFxuICAgICAgICAgICAga2V5cyxcbiAgICAgICAgICAgIHBhcnNlR3JhcGhRTFNjaGVtYS5wYXJzZUNsYXNzZXNcbiAgICAgICAgICApO1xuICAgICAgICAgIGxldCBvcHRpbWl6ZWRPYmplY3QgPSB7fTtcbiAgICAgICAgICBpZiAobmVlZEdldCAmJiAhbmVlZFRvR2V0QWxsS2V5cykge1xuICAgICAgICAgICAgb3B0aW1pemVkT2JqZWN0ID0gYXdhaXQgb2JqZWN0c1F1ZXJpZXMuZ2V0T2JqZWN0KFxuICAgICAgICAgICAgICBjbGFzc05hbWUsXG4gICAgICAgICAgICAgIGlkLFxuICAgICAgICAgICAgICByZXF1aXJlZEtleXMsXG4gICAgICAgICAgICAgIGluY2x1ZGUsXG4gICAgICAgICAgICAgIHVuZGVmaW5lZCxcbiAgICAgICAgICAgICAgdW5kZWZpbmVkLFxuICAgICAgICAgICAgICBjb25maWcsXG4gICAgICAgICAgICAgIGF1dGgsXG4gICAgICAgICAgICAgIGluZm8sXG4gICAgICAgICAgICAgIHBhcnNlR3JhcGhRTFNjaGVtYS5wYXJzZUNsYXNzZXNcbiAgICAgICAgICAgICk7XG4gICAgICAgICAgfSBlbHNlIGlmIChuZWVkVG9HZXRBbGxLZXlzKSB7XG4gICAgICAgICAgICBvcHRpbWl6ZWRPYmplY3QgPSBhd2FpdCBvYmplY3RzUXVlcmllcy5nZXRPYmplY3QoXG4gICAgICAgICAgICAgIGNsYXNzTmFtZSxcbiAgICAgICAgICAgICAgaWQsXG4gICAgICAgICAgICAgIHVuZGVmaW5lZCxcbiAgICAgICAgICAgICAgaW5jbHVkZSxcbiAgICAgICAgICAgICAgdW5kZWZpbmVkLFxuICAgICAgICAgICAgICB1bmRlZmluZWQsXG4gICAgICAgICAgICAgIGNvbmZpZyxcbiAgICAgICAgICAgICAgYXV0aCxcbiAgICAgICAgICAgICAgaW5mbyxcbiAgICAgICAgICAgICAgcGFyc2VHcmFwaFFMU2NoZW1hLnBhcnNlQ2xhc3Nlc1xuICAgICAgICAgICAgKTtcbiAgICAgICAgICB9XG4gICAgICAgICAgcmV0dXJuIHtcbiAgICAgICAgICAgIFtnZXRHcmFwaFFMUXVlcnlOYW1lXToge1xuICAgICAgICAgICAgICBvYmplY3RJZDogaWQsXG4gICAgICAgICAgICAgIC4uLnVwZGF0ZWRPYmplY3QsXG4gICAgICAgICAgICAgIC4uLmZpbHRlckRlbGV0ZWRGaWVsZHMocGFyc2VGaWVsZHMpLFxuICAgICAgICAgICAgICAuLi5vcHRpbWl6ZWRPYmplY3QsXG4gICAgICAgICAgICB9LFxuICAgICAgICAgIH07XG4gICAgICAgIH0gY2F0Y2ggKGUpIHtcbiAgICAgICAgICBwYXJzZUdyYXBoUUxTY2hlbWEuaGFuZGxlRXJyb3IoZSk7XG4gICAgICAgIH1cbiAgICAgIH0sXG4gICAgfSk7XG5cbiAgICBpZiAoXG4gICAgICBwYXJzZUdyYXBoUUxTY2hlbWEuYWRkR3JhcGhRTFR5cGUodXBkYXRlR3JhcGhRTE11dGF0aW9uLmFyZ3MuaW5wdXQudHlwZS5vZlR5cGUpICYmXG4gICAgICBwYXJzZUdyYXBoUUxTY2hlbWEuYWRkR3JhcGhRTFR5cGUodXBkYXRlR3JhcGhRTE11dGF0aW9uLnR5cGUpXG4gICAgKSB7XG4gICAgICBwYXJzZUdyYXBoUUxTY2hlbWEuYWRkR3JhcGhRTE11dGF0aW9uKHVwZGF0ZUdyYXBoUUxNdXRhdGlvbk5hbWUsIHVwZGF0ZUdyYXBoUUxNdXRhdGlvbik7XG4gICAgfVxuICB9XG5cbiAgaWYgKGlzRGVzdHJveUVuYWJsZWQpIHtcbiAgICBjb25zdCBkZWxldGVHcmFwaFFMTXV0YXRpb25OYW1lID0gZGVzdHJveUFsaWFzIHx8IGBkZWxldGUke2dyYXBoUUxDbGFzc05hbWV9YDtcbiAgICBjb25zdCBkZWxldGVHcmFwaFFMTXV0YXRpb24gPSBtdXRhdGlvbldpdGhDbGllbnRNdXRhdGlvbklkKHtcbiAgICAgIG5hbWU6IGBEZWxldGUke2dyYXBoUUxDbGFzc05hbWV9YCxcbiAgICAgIGRlc2NyaXB0aW9uOiBgVGhlICR7ZGVsZXRlR3JhcGhRTE11dGF0aW9uTmFtZX0gbXV0YXRpb24gY2FuIGJlIHVzZWQgdG8gZGVsZXRlIGFuIG9iamVjdCBvZiB0aGUgJHtncmFwaFFMQ2xhc3NOYW1lfSBjbGFzcy5gLFxuICAgICAgaW5wdXRGaWVsZHM6IHtcbiAgICAgICAgaWQ6IGRlZmF1bHRHcmFwaFFMVHlwZXMuR0xPQkFMX09SX09CSkVDVF9JRF9BVFQsXG4gICAgICB9LFxuICAgICAgb3V0cHV0RmllbGRzOiB7XG4gICAgICAgIFtnZXRHcmFwaFFMUXVlcnlOYW1lXToge1xuICAgICAgICAgIGRlc2NyaXB0aW9uOiAnVGhpcyBpcyB0aGUgZGVsZXRlZCBvYmplY3QuJyxcbiAgICAgICAgICB0eXBlOiBuZXcgR3JhcGhRTE5vbk51bGwoY2xhc3NHcmFwaFFMT3V0cHV0VHlwZSB8fCBkZWZhdWx0R3JhcGhRTFR5cGVzLk9CSkVDVCksXG4gICAgICAgIH0sXG4gICAgICB9LFxuICAgICAgbXV0YXRlQW5kR2V0UGF5bG9hZDogYXN5bmMgKGFyZ3MsIGNvbnRleHQsIG11dGF0aW9uSW5mbykgPT4ge1xuICAgICAgICB0cnkge1xuICAgICAgICAgIGxldCB7IGlkIH0gPSBkZWVwY29weShhcmdzKTtcbiAgICAgICAgICBjb25zdCB7IGNvbmZpZywgYXV0aCwgaW5mbyB9ID0gY29udGV4dDtcblxuICAgICAgICAgIGNvbnN0IGdsb2JhbElkT2JqZWN0ID0gZnJvbUdsb2JhbElkKGlkKTtcblxuICAgICAgICAgIGlmIChnbG9iYWxJZE9iamVjdC50eXBlID09PSBjbGFzc05hbWUpIHtcbiAgICAgICAgICAgIGlkID0gZ2xvYmFsSWRPYmplY3QuaWQ7XG4gICAgICAgICAgfVxuXG4gICAgICAgICAgY29uc3Qgc2VsZWN0ZWRGaWVsZHMgPSBnZXRGaWVsZE5hbWVzKG11dGF0aW9uSW5mbylcbiAgICAgICAgICAgIC5maWx0ZXIoZmllbGQgPT4gZmllbGQuc3RhcnRzV2l0aChgJHtnZXRHcmFwaFFMUXVlcnlOYW1lfS5gKSlcbiAgICAgICAgICAgIC5tYXAoZmllbGQgPT4gZmllbGQucmVwbGFjZShgJHtnZXRHcmFwaFFMUXVlcnlOYW1lfS5gLCAnJykpO1xuICAgICAgICAgIGNvbnN0IHsga2V5cywgaW5jbHVkZSB9ID0gZXh0cmFjdEtleXNBbmRJbmNsdWRlKHNlbGVjdGVkRmllbGRzKTtcbiAgICAgICAgICBsZXQgb3B0aW1pemVkT2JqZWN0ID0ge307XG4gICAgICAgICAgaWYgKGtleXMgJiYga2V5cy5zcGxpdCgnLCcpLmZpbHRlcihrZXkgPT4gIVsnaWQnLCAnb2JqZWN0SWQnXS5pbmNsdWRlcyhrZXkpKS5sZW5ndGggPiAwKSB7XG4gICAgICAgICAgICBvcHRpbWl6ZWRPYmplY3QgPSBhd2FpdCBvYmplY3RzUXVlcmllcy5nZXRPYmplY3QoXG4gICAgICAgICAgICAgIGNsYXNzTmFtZSxcbiAgICAgICAgICAgICAgaWQsXG4gICAgICAgICAgICAgIGtleXMsXG4gICAgICAgICAgICAgIGluY2x1ZGUsXG4gICAgICAgICAgICAgIHVuZGVmaW5lZCxcbiAgICAgICAgICAgICAgdW5kZWZpbmVkLFxuICAgICAgICAgICAgICBjb25maWcsXG4gICAgICAgICAgICAgIGF1dGgsXG4gICAgICAgICAgICAgIGluZm8sXG4gICAgICAgICAgICAgIHBhcnNlR3JhcGhRTFNjaGVtYS5wYXJzZUNsYXNzZXNcbiAgICAgICAgICAgICk7XG4gICAgICAgICAgfVxuICAgICAgICAgIGF3YWl0IG9iamVjdHNNdXRhdGlvbnMuZGVsZXRlT2JqZWN0KGNsYXNzTmFtZSwgaWQsIGNvbmZpZywgYXV0aCwgaW5mbyk7XG4gICAgICAgICAgcmV0dXJuIHtcbiAgICAgICAgICAgIFtnZXRHcmFwaFFMUXVlcnlOYW1lXToge1xuICAgICAgICAgICAgICBvYmplY3RJZDogaWQsXG4gICAgICAgICAgICAgIC4uLm9wdGltaXplZE9iamVjdCxcbiAgICAgICAgICAgIH0sXG4gICAgICAgICAgfTtcbiAgICAgICAgfSBjYXRjaCAoZSkge1xuICAgICAgICAgIHBhcnNlR3JhcGhRTFNjaGVtYS5oYW5kbGVFcnJvcihlKTtcbiAgICAgICAgfVxuICAgICAgfSxcbiAgICB9KTtcblxuICAgIGlmIChcbiAgICAgIHBhcnNlR3JhcGhRTFNjaGVtYS5hZGRHcmFwaFFMVHlwZShkZWxldGVHcmFwaFFMTXV0YXRpb24uYXJncy5pbnB1dC50eXBlLm9mVHlwZSkgJiZcbiAgICAgIHBhcnNlR3JhcGhRTFNjaGVtYS5hZGRHcmFwaFFMVHlwZShkZWxldGVHcmFwaFFMTXV0YXRpb24udHlwZSlcbiAgICApIHtcbiAgICAgIHBhcnNlR3JhcGhRTFNjaGVtYS5hZGRHcmFwaFFMTXV0YXRpb24oZGVsZXRlR3JhcGhRTE11dGF0aW9uTmFtZSwgZGVsZXRlR3JhcGhRTE11dGF0aW9uKTtcbiAgICB9XG4gIH1cbn07XG5cbmV4cG9ydCB7IGxvYWQgfTtcbiJdLCJtYXBwaW5ncyI6Ijs7Ozs7O0FBQUE7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUEwRDtBQUFBO0FBQUE7QUFBQTtBQUFBO0FBQUE7QUFBQTtBQUFBO0FBRTFELE1BQU1BLG1CQUFtQixHQUFHQyxNQUFNLElBQ2hDQyxNQUFNLENBQUNDLElBQUksQ0FBQ0YsTUFBTSxDQUFDLENBQUNHLE1BQU0sQ0FBQyxDQUFDQyxHQUFHLEVBQUVDLEdBQUcsS0FBSztFQUFBO0VBQ3ZDLElBQUksT0FBT0wsTUFBTSxDQUFDSyxHQUFHLENBQUMsS0FBSyxRQUFRLElBQUksZ0JBQUFMLE1BQU0sQ0FBQ0ssR0FBRyxDQUFDLGdEQUFYLFlBQWFDLElBQUksTUFBSyxRQUFRLEVBQUU7SUFDckVGLEdBQUcsQ0FBQ0MsR0FBRyxDQUFDLEdBQUcsSUFBSTtFQUNqQjtFQUNBLE9BQU9ELEdBQUc7QUFDWixDQUFDLEVBQUVKLE1BQU0sQ0FBQztBQUVaLE1BQU1PLHFCQUFxQixHQUFHLENBQzVCQyxhQUFhLEVBQ2JDLG9CQUFvQixFQUNwQkMsb0JBQW9CLEVBQ3BCQyxrQkFBa0IsS0FDZjtFQUNILE1BQU1DLGNBQWMsR0FBR0Ysb0JBQW9CLEdBQUdBLG9CQUFvQixDQUFDRyxLQUFLLENBQUMsR0FBRyxDQUFDLEdBQUcsRUFBRTtFQUNsRixNQUFNQyxjQUFjLEdBQUdMLG9CQUFvQixHQUFHQSxvQkFBb0IsQ0FBQ0ksS0FBSyxDQUFDLEdBQUcsQ0FBQyxHQUFHLEVBQUU7RUFDbEYsTUFB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