"use strict";

Object.defineProperty(exports, "__esModule", {
  value: true
});
exports.load = void 0;
var _graphql = require("graphql");
var _graphqlRelay = require("graphql-relay");
var _graphqlListFields = _interopRequireDefault(require("graphql-list-fields"));
var _deepcopy = _interopRequireDefault(require("deepcopy"));
var _pluralize = _interopRequireDefault(require("pluralize"));
var defaultGraphQLTypes = _interopRequireWildcard(require("./defaultGraphQLTypes"));
var objectsQueries = _interopRequireWildcard(require("../helpers/objectsQueries"));
var _ParseGraphQLController = require("../../Controllers/ParseGraphQLController");
var _className = require("../transformers/className");
var _parseGraphQLUtils = require("../parseGraphQLUtils");
function _getRequireWildcardCache(nodeInterop) { if (typeof WeakMap !== "function") return null; var cacheBabelInterop = new WeakMap(); var cacheNodeInterop = new WeakMap(); return (_getRequireWildcardCache = function (nodeInterop) { return nodeInterop ? cacheNodeInterop : cacheBabelInterop; })(nodeInterop); }
function _interopRequireWildcard(obj, nodeInterop) { if (!nodeInterop && obj && obj.__esModule) { return obj; } if (obj === null || typeof obj !== "object" && typeof obj !== "function") { return { default: obj }; } var cache = _getRequireWildcardCache(nodeInterop); if (cache && cache.has(obj)) { return cache.get(obj); } var newObj = {}; var hasPropertyDescriptor = Object.defineProperty && Object.getOwnPropertyDescriptor; for (var key in obj) { if (key !== "default" && Object.prototype.hasOwnProperty.call(obj, key)) { var desc = hasPropertyDescriptor ? Object.getOwnPropertyDescriptor(obj, key) : null; if (desc && (desc.get || desc.set)) { Object.defineProperty(newObj, key, desc); } else { newObj[key] = obj[key]; } } } newObj.default = obj; if (cache) { cache.set(obj, newObj); } return newObj; }
function _interopRequireDefault(obj) { return obj && obj.__esModule ? obj : { default: obj }; }
const getParseClassQueryConfig = function (parseClassConfig) {
  return parseClassConfig && parseClassConfig.query || {};
};
const getQuery = async (parseClass, _source, args, context, queryInfo, parseClasses) => {
  let {
    id
  } = args;
  const {
    options
  } = args;
  const {
    readPreference,
    includeReadPreference
  } = options || {};
  const {
    config,
    auth,
    info
  } = context;
  const selectedFields = (0, _graphqlListFields.default)(queryInfo);
  const globalIdObject = (0, _graphqlRelay.fromGlobalId)(id);
  if (globalIdObject.type === parseClass.className) {
    id = globalIdObject.id;
  }
  const {
    keys,
    include
  } = (0, _parseGraphQLUtils.extractKeysAndInclude)(selectedFields);
  return await objectsQueries.getObject(parseClass.className, id, keys, include, readPreference, includeReadPreference, config, auth, info, parseClasses);
};
const load = function (parseGraphQLSchema, parseClass, parseClassConfig) {
  const className = parseClass.className;
  const graphQLClassName = (0, _className.transformClassNameToGraphQL)(className);
  const {
    get: isGetEnabled = true,
    find: isFindEnabled = true,
    getAlias = '',
    findAlias = ''
  } = getParseClassQueryConfig(parseClassConfig);
  const {
    classGraphQLOutputType,
    classGraphQLFindArgs,
    classGraphQLFindResultType
  } = parseGraphQLSchema.parseClassTypes[className];
  if (isGetEnabled) {
    const lowerCaseClassName = graphQLClassName.charAt(0).toLowerCase() + graphQLClassName.slice(1);
    const getGraphQLQueryName = getAlias || lowerCaseClassName;
    parseGraphQLSchema.addGraphQLQuery(getGraphQLQueryName, {
      description: `The ${getGraphQLQueryName} query can be used to get an object of the ${graphQLClassName} class by its id.`,
      args: {
        id: defaultGraphQLTypes.GLOBAL_OR_OBJECT_ID_ATT,
        options: defaultGraphQLTypes.READ_OPTIONS_ATT
      },
      type: new _graphql.GraphQLNonNull(classGraphQLOutputType || defaultGraphQLTypes.OBJECT),
      async resolve(_source, args, context, queryInfo) {
        try {
          return await getQuery(parseClass, _source, (0, _deepcopy.default)(args), context, queryInfo, parseGraphQLSchema.parseClasses);
        } catch (e) {
          parseGraphQLSchema.handleError(e);
        }
      }
    });
  }
  if (isFindEnabled) {
    const lowerCaseClassName = graphQLClassName.charAt(0).toLowerCase() + graphQLClassName.slice(1);
    const findGraphQLQueryName = findAlias || (0, _pluralize.default)(lowerCaseClassName);
    parseGraphQLSchema.addGraphQLQuery(findGraphQLQueryName, {
      description: `The ${findGraphQLQueryName} query can be used to find objects of the ${graphQLClassName} class.`,
      args: classGraphQLFindArgs,
      type: new _graphql.GraphQLNonNull(classGraphQLFindResultType || defaultGraphQLTypes.OBJECT),
      async resolve(_source, args, context, queryInfo) {
        try {
          // Deep copy args to avoid internal re assign issue
          const {
            where,
            order,
            skip,
            first,
            after,
            last,
            before,
            options
          } = (0, _deepcopy.default)(args);
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
          } = (0, _parseGraphQLUtils.extractKeysAndInclude)(selectedFields.filter(field => field.startsWith('edges.node.')).map(field => field.replace('edges.node.', '')).filter(field => field.indexOf('edges.node') < 0));
          const parseOrder = order && order.join(',');
          return await objectsQueries.findObjects(className, where, parseOrder, skip, first, after, last, before, keys, include, false, readPreference, includeReadPreference, subqueryReadPreference, config, auth, info, selectedFields, parseGraphQLSchema.parseClasses);
        } catch (e) {
          parseGraphQLSchema.handleError(e);
        }
      }
    });
  }
};
exports.load = load;
//# sourceMappingURL=data:application/json;charset=utf-8;base64,eyJ2ZXJzaW9uIjozLCJuYW1lcyI6WyJnZXRQYXJzZUNsYXNzUXVlcnlDb25maWciLCJwYXJzZUNsYXNzQ29uZmlnIiwicXVlcnkiLCJnZXRRdWVyeSIsInBhcnNlQ2xhc3MiLCJfc291cmNlIiwiYXJncyIsImNvbnRleHQiLCJxdWVyeUluZm8iLCJwYXJzZUNsYXNzZXMiLCJpZCIsIm9wdGlvbnMiLCJyZWFkUHJlZmVyZW5jZSIsImluY2x1ZGVSZWFkUHJlZmVyZW5jZSIsImNvbmZpZyIsImF1dGgiLCJpbmZvIiwic2VsZWN0ZWRGaWVsZHMiLCJnZXRGaWVsZE5hbWVzIiwiZ2xvYmFsSWRPYmplY3QiLCJmcm9tR2xvYmFsSWQiLCJ0eXBlIiwiY2xhc3NOYW1lIiwia2V5cyIsImluY2x1ZGUiLCJleHRyYWN0S2V5c0FuZEluY2x1ZGUiLCJvYmplY3RzUXVlcmllcyIsImdldE9iamVjdCIsImxvYWQiLCJwYXJzZUdyYXBoUUxTY2hlbWEiLCJncmFwaFFMQ2xhc3NOYW1lIiwidHJhbnNmb3JtQ2xhc3NOYW1lVG9HcmFwaFFMIiwiZ2V0IiwiaXNHZXRFbmFibGVkIiwiZmluZCIsImlzRmluZEVuYWJsZWQiLCJnZXRBbGlhcyIsImZpbmRBbGlhcyIsImNsYXNzR3JhcGhRTE91dHB1dFR5cGUiLCJjbGFzc0dyYXBoUUxGaW5kQXJncyIsImNsYXNzR3JhcGhRTEZpbmRSZXN1bHRUeXBlIiwicGFyc2VDbGFzc1R5cGVzIiwibG93ZXJDYXNlQ2xhc3NOYW1lIiwiY2hhckF0IiwidG9Mb3dlckNhc2UiLCJzbGljZSIsImdldEdyYXBoUUxRdWVyeU5hbWUiLCJhZGRHcmFwaFFMUXVlcnkiLCJkZXNjcmlwdGlvbiIsImRlZmF1bHRHcmFwaFFMVHlwZXMiLCJHTE9CQUxfT1JfT0JKRUNUX0lEX0FUVCIsIlJFQURfT1BUSU9OU19BVFQiLCJHcmFwaFFMTm9uTnVsbCIsIk9CSkVDVCIsInJlc29sdmUiLCJkZWVwY29weSIsImUiLCJoYW5kbGVFcnJvciIsImZpbmRHcmFwaFFMUXVlcnlOYW1lIiwicGx1cmFsaXplIiwid2hlcmUiLCJvcmRlciIsInNraXAiLCJmaXJzdCIsImFmdGVyIiwibGFzdCIsImJlZm9yZSIsInN1YnF1ZXJ5UmVhZFByZWZlcmVuY2UiLCJmaWx0ZXIiLCJmaWVsZCIsInN0YXJ0c1dpdGgiLCJtYXAiLCJyZXBsYWNlIiwiaW5kZXhPZiIsInBhcnNlT3JkZXIiLCJqb2luIiwiZmluZE9iamVjdHMiXSwic291cmNlcyI6WyIuLi8uLi8uLi9zcmMvR3JhcGhRTC9sb2FkZXJzL3BhcnNlQ2xhc3NRdWVyaWVzLmpzIl0sInNvdXJjZXNDb250ZW50IjpbImltcG9ydCB7IEdyYXBoUUxOb25OdWxsIH0gZnJvbSAnZ3JhcGhxbCc7XG5pbXBvcnQgeyBmcm9tR2xvYmFsSWQgfSBmcm9tICdncmFwaHFsLXJlbGF5JztcbmltcG9ydCBnZXRGaWVsZE5hbWVzIGZyb20gJ2dyYXBocWwtbGlzdC1maWVsZHMnO1xuaW1wb3J0IGRlZXBjb3B5IGZyb20gJ2RlZXBjb3B5JztcbmltcG9ydCBwbHVyYWxpemUgZnJvbSAncGx1cmFsaXplJztcbmltcG9ydCAqIGFzIGRlZmF1bHRHcmFwaFFMVHlwZXMgZnJvbSAnLi9kZWZhdWx0R3JhcGhRTFR5cGVzJztcbmltcG9ydCAqIGFzIG9iamVjdHNRdWVyaWVzIGZyb20gJy4uL2hlbHBlcnMvb2JqZWN0c1F1ZXJpZXMnO1xuaW1wb3J0IHsgUGFyc2VHcmFwaFFMQ2xhc3NDb25maWcgfSBmcm9tICcuLi8uLi9Db250cm9sbGVycy9QYXJzZUdyYXBoUUxDb250cm9sbGVyJztcbmltcG9ydCB7IHRyYW5zZm9ybUNsYXNzTmFtZVRvR3JhcGhRTCB9IGZyb20gJy4uL3RyYW5zZm9ybWVycy9jbGFzc05hbWUnO1xuaW1wb3J0IHsgZXh0cmFjdEtleXNBbmRJbmNsdWRlIH0gZnJvbSAnLi4vcGFyc2VHcmFwaFFMVXRpbHMnO1xuXG5jb25zdCBnZXRQYXJzZUNsYXNzUXVlcnlDb25maWcgPSBmdW5jdGlvbiAocGFyc2VDbGFzc0NvbmZpZzogP1BhcnNlR3JhcGhRTENsYXNzQ29uZmlnKSB7XG4gIHJldHVybiAocGFyc2VDbGFzc0NvbmZpZyAmJiBwYXJzZUNsYXNzQ29uZmlnLnF1ZXJ5KSB8fCB7fTtcbn07XG5cbmNvbnN0IGdldFF1ZXJ5ID0gYXN5bmMgKHBhcnNlQ2xhc3MsIF9zb3VyY2UsIGFyZ3MsIGNvbnRleHQsIHF1ZXJ5SW5mbywgcGFyc2VDbGFzc2VzKSA9PiB7XG4gIGxldCB7IGlkIH0gPSBhcmdzO1xuICBjb25zdCB7IG9wdGlvbnMgfSA9IGFyZ3M7XG4gIGNvbnN0IHsgcmVhZFByZWZlcmVuY2UsIGluY2x1ZGVSZWFkUHJlZmVyZW5jZSB9ID0gb3B0aW9ucyB8fCB7fTtcbiAgY29uc3QgeyBjb25maWcsIGF1dGgsIGluZm8gfSA9IGNvbnRleHQ7XG4gIGNvbnN0IHNlbGVjdGVkRmllbGRzID0gZ2V0RmllbGROYW1lcyhxdWVyeUluZm8pO1xuXG4gIGNvbnN0IGdsb2JhbElkT2JqZWN0ID0gZnJvbUdsb2JhbElkKGlkKTtcblxuICBpZiAoZ2xvYmFsSWRPYmplY3QudHlwZSA9PT0gcGFyc2VDbGFzcy5jbGFzc05hbWUpIHtcbiAgICBpZCA9IGdsb2JhbElkT2JqZWN0LmlkO1xuICB9XG5cbiAgY29uc3QgeyBrZXlzLCBpbmNsdWRlIH0gPSBleHRyYWN0S2V5c0FuZEluY2x1ZGUoc2VsZWN0ZWRGaWVsZHMpO1xuXG4gIHJldHVybiBhd2FpdCBvYmplY3RzUXVlcmllcy5nZXRPYmplY3QoXG4gICAgcGFyc2VDbGFzcy5jbGFzc05hbWUsXG4gICAgaWQsXG4gICAga2V5cyxcbiAgICBpbmNsdWRlLFxuICAgIHJlYWRQcmVmZXJlbmNlLFxuICAgIGluY2x1ZGVSZWFkUHJlZmVyZW5jZSxcbiAgICBjb25maWcsXG4gICAgYXV0aCxcbiAgICBpbmZvLFxuICAgIHBhcnNlQ2xhc3Nlc1xuICApO1xufTtcblxuY29uc3QgbG9hZCA9IGZ1bmN0aW9uIChwYXJzZUdyYXBoUUxTY2hlbWEsIHBhcnNlQ2xhc3MsIHBhcnNlQ2xhc3NDb25maWc6ID9QYXJzZUdyYXBoUUxDbGFzc0NvbmZpZykge1xuICBjb25zdCBjbGFzc05hbWUgPSBwYXJzZUNsYXNzLmNsYXNzTmFtZTtcbiAgY29uc3QgZ3JhcGhRTENsYXNzTmFtZSA9IHRyYW5zZm9ybUNsYXNzTmFtZVRvR3JhcGhRTChjbGFzc05hbWUpO1xuICBjb25zdCB7XG4gICAgZ2V0OiBpc0dldEVuYWJsZWQgPSB0cnVlLFxuICAgIGZpbmQ6IGlzRmluZEVuYWJsZWQgPSB0cnVlLFxuICAgIGdldEFsaWFzOiBnZXRBbGlhcyA9ICcnLFxuICAgIGZpbmRBbGlhczogZmluZEFsaWFzID0gJycsXG4gIH0gPSBnZXRQYXJzZUNsYXNzUXVlcnlDb25maWcocGFyc2VDbGFzc0NvbmZpZyk7XG5cbiAgY29uc3Qge1xuICAgIGNsYXNzR3JhcGhRTE91dHB1dFR5cGUsXG4gICAgY2xhc3NHcmFwaFFMRmluZEFyZ3MsXG4gICAgY2xhc3NHcmFwaFFMRmluZFJlc3VsdFR5cGUsXG4gIH0gPSBwYXJzZUdyYXBoUUxTY2hlbWEucGFyc2VDbGFzc1R5cGVzW2NsYXNzTmFtZV07XG5cbiAgaWYgKGlzR2V0RW5hYmxlZCkge1xuICAgIGNvbnN0IGxvd2VyQ2FzZUNsYXNzTmFtZSA9IGdyYXBoUUxDbGFzc05hbWUuY2hhckF0KDApLnRvTG93ZXJDYXNlKCkgKyBncmFwaFFMQ2xhc3NOYW1lLnNsaWNlKDEpO1xuXG4gICAgY29uc3QgZ2V0R3JhcGhRTFF1ZXJ5TmFtZSA9IGdldEFsaWFzIHx8IGxvd2VyQ2FzZUNsYXNzTmFtZTtcblxuICAgIHBhcnNlR3JhcGhRTFNjaGVtYS5hZGRHcmFwaFFMUXVlcnkoZ2V0R3JhcGhRTFF1ZXJ5TmFtZSwge1xuICAgICAgZGVzY3JpcHRpb246IGBUaGUgJHtnZXRHcmFwaFFMUXVlcnlOYW1lfSBxdWVyeSBjYW4gYmUgdXNlZCB0byBnZXQgYW4gb2JqZWN0IG9mIHRoZSAke2dyYXBoUUxDbGFzc05hbWV9IGNsYXNzIGJ5IGl0cyBpZC5gLFxuICAgICAgYXJnczoge1xuICAgICAgICBpZDogZGVmYXVsdEdyYXBoUUxUeXBlcy5HTE9CQUxfT1JfT0JKRUNUX0lEX0FUVCxcbiAgICAgICAgb3B0aW9uczogZGVmYXVsdEdyYXBoUUxUeXBlcy5SRUFEX09QVElPTlNfQVRULFxuICAgICAgfSxcbiAgICAgIHR5cGU6IG5ldyBHcmFwaFFMTm9uTnVsbChjbGFzc0dyYXBoUUxPdXRwdXRUeXBlIHx8IGRlZmF1bHRHcmFwaFFMVHlwZXMuT0JKRUNUKSxcbiAgICAgIGFzeW5jIHJlc29sdmUoX3NvdXJjZSwgYXJncywgY29udGV4dCwgcXVlcnlJbmZvKSB7XG4gICAgICAgIHRyeSB7XG4gICAgICAgICAgcmV0dXJuIGF3YWl0IGdldFF1ZXJ5KFxuICAgICAgICAgICAgcGFyc2VDbGFzcyxcbiAgICAgICAgICAgIF9zb3VyY2UsXG4gICAgICAgICAgICBkZWVwY29weShhcmdzKSxcbiAgICAgICAgICAgIGNvbnRleHQsXG4gICAgICAgICAgICBxdWVyeUluZm8sXG4gICAgICAgICAgICBwYXJzZUdyYXBoUUxTY2hlbWEucGFyc2VDbGFzc2VzXG4gICAgICAgICAgKTtcbiAgICAgICAgfSBjYXRjaCAoZSkge1xuICAgICAgICAgIHBhcnNlR3JhcGhRTFNjaGVtYS5oYW5kbGVFcnJvcihlKTtcbiAgICAgICAgfVxuICAgICAgfSxcbiAgICB9KTtcbiAgfVxuXG4gIGlmIChpc0ZpbmRFbmFibGVkKSB7XG4gICAgY29uc3QgbG93ZXJDYXNlQ2xhc3NOYW1lID0gZ3JhcGhRTENsYXNzTmFtZS5jaGFyQXQoMCkudG9Mb3dlckNhc2UoKSArIGdyYXBoUUxDbGFzc05hbWUuc2xpY2UoMSk7XG5cbiAgICBjb25zdCBmaW5kR3JhcGhRTFF1ZXJ5TmFtZSA9IGZpbmRBbGlhcyB8fCBwbHVyYWxpemUobG93ZXJDYXNlQ2xhc3NOYW1lKTtcblxuICAgIHBhcnNlR3JhcGhRTFNjaGVtYS5hZGRHcmFwaFFMUXVlcnkoZmluZEdyYXBoUUxRdWVyeU5hbWUsIHtcbiAgICAgIGRlc2NyaXB0aW9uOiBgVGhlICR7ZmluZEdyYXBoUUxRdWVyeU5hbWV9IHF1ZXJ5IGNhbiBiZSB1c2VkIHRvIGZpbmQgb2JqZWN0cyBvZiB0aGUgJHtncmFwaFFMQ2xhc3NOYW1lfSBjbGFzcy5gLFxuICAgICAgYXJnczogY2xhc3NHcmFwaFFMRmluZEFyZ3MsXG4gICAgICB0eXBlOiBuZXcgR3JhcGhRTE5vbk51bGwoY2xhc3NHcmFwaFFMRmluZFJlc3VsdFR5cGUgfHwgZGVmYXVsdEdyYXBoUUxUeXBlcy5PQkpFQ1QpLFxuICAgICAgYXN5bmMgcmVzb2x2ZShfc291cmNlLCBhcmdzLCBjb250ZXh0LCBxdWVyeUluZm8pIHtcbiAgICAgICAgdHJ5IHtcbiAgICAgICAgICAvLyBEZWVwIGNvcHkgYXJncyB0byBhdm9pZCBpbnRlcm5hbCByZSBhc3NpZ24gaXNzdWVcbiAgICAgICAgICBjb25zdCB7IHdoZXJlLCBvcmRlciwgc2tpcCwgZmlyc3QsIGFmdGVyLCBsYXN0LCBiZWZvcmUsIG9wdGlvbnMgfSA9IGRlZXBjb3B5KGFyZ3MpO1xuICAgICAgICAgIGNvbnN0IHsgcmVhZFByZWZlcmVuY2UsIGluY2x1ZGVSZWFkUHJlZmVyZW5jZSwgc3VicXVlcnlSZWFkUHJlZmVyZW5jZSB9ID0gb3B0aW9ucyB8fCB7fTtcbiAgICAgICAgICBjb25zdCB7IGNvbmZpZywgYXV0aCwgaW5mbyB9ID0gY29udGV4dDtcbiAgICAgICAgICBjb25zdCBzZWxlY3RlZEZpZWxkcyA9IGdldEZpZWxkTmFtZXMocXVlcnlJbmZvKTtcblxuICAgICAgICAgIGNvbnN0IHsga2V5cywgaW5jbHVkZSB9ID0gZXh0cmFjdEtleXNBbmRJbmNsdWRlKFxuICAgICAgICAgICAgc2VsZWN0ZWRGaWVsZHNcbiAgICAgICAgICAgICAgLmZpbHRlcihmaWVsZCA9PiBmaWVsZC5zdGFydHNXaXRoKCdlZGdlcy5ub2RlLicpKVxuICAgICAgICAgICAgICAubWFwKGZpZWxkID0+IGZpZWxkLnJlcGxhY2UoJ2VkZ2VzLm5vZGUuJywgJycpKVxuICAgICAgICAgICAgICAuZmlsdGVyKGZpZWxkID0+IGZpZWxkLmluZGV4T2YoJ2VkZ2VzLm5vZGUnKSA8IDApXG4gICAgICAgICAgKTtcbiAgICAgICAgICBjb25zdCBwYXJzZU9yZGVyID0gb3JkZXIgJiYgb3JkZXIuam9pbignLCcpO1xuXG4gICAgICAgICAgcmV0dXJuIGF3YWl0IG9iamVjdHNRdWVyaWVzLmZpbmRPYmplY3RzKFxuICAgICAgICAgICAgY2xhc3NOYW1lLFxuICAgICAgICAgICAgd2hlcmUsXG4gICAgICAgICAgICBwYXJzZU9yZGVyLFxuICAgICAgICAgICAgc2tpcCxcbiAgICAgICAgICAgIGZpcnN0LFxuICAgICAgICAgICAgYWZ0ZXIsXG4gICAgICAgICAgICBsYXN0LFxuICAgICAgICAgICAgYmVmb3JlLFxuICAgICAgICAgICAga2V5cyxcbiAgICAgICAgICAgIGluY2x1ZGUsXG4gICAgICAgICAgICBmYWxzZSxcbiAgICAgICAgICAgIHJlYWRQcmVmZXJlbmNlLFxuICAgICAgICAgICAgaW5jbHVkZVJlYWRQcmVmZXJlbmNlLFxuICAgICAgICAgICAgc3VicXVlcnlSZWFkUHJlZmVyZW5jZSxcbiAgICAgICAgICAgIGNvbmZpZyxcbiAgICAgICAgICAgIGF1dGgsXG4gICAgICAgICAgICBpbmZvLFxuICAgICAgICAgICAgc2VsZWN0ZWRGaWVsZHMsXG4gICAgICAgICAgICBwYXJzZUdyYXBoUUxTY2hlbWEucGFyc2VDbGFzc2VzXG4gICAgICAgICAgKTtcbiAgICAgICAgfSBjYXRjaCAoZSkge1xuICAgICAgICAgIHBhcnNlR3JhcGhRTFNjaGVtYS5oYW5kbGVFcnJvcihlKTtcbiAgICAgICAgfVxuICAgICAgfSxcbiAgICB9KTtcbiAgfVxufTtcblxuZXhwb3J0IHsgbG9hZCB9O1xuIl0sIm1hcHBpbmdzIjoiOzs7Ozs7QUFBQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUE2RDtBQUFBO0FBQUE7QUFFN0QsTUFBTUEsd0JBQXdCLEdBQUcsVUFBVUMsZ0JBQTBDLEVBQUU7RUFDckYsT0FBUUEsZ0JBQWdCLElBQUlBLGdCQUFnQixD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