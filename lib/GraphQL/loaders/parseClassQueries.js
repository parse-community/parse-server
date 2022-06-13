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
//# sourceMappingURL=data:application/json;charset=utf-8;base64,eyJ2ZXJzaW9uIjozLCJzb3VyY2VzIjpbIi4uLy4uLy4uL3NyYy9HcmFwaFFML2xvYWRlcnMvcGFyc2VDbGFzc1F1ZXJpZXMuanMiXSwibmFtZXMiOlsiZ2V0UGFyc2VDbGFzc1F1ZXJ5Q29uZmlnIiwicGFyc2VDbGFzc0NvbmZpZyIsInF1ZXJ5IiwiZ2V0UXVlcnkiLCJwYXJzZUNsYXNzIiwiX3NvdXJjZSIsImFyZ3MiLCJjb250ZXh0IiwicXVlcnlJbmZvIiwicGFyc2VDbGFzc2VzIiwiaWQiLCJvcHRpb25zIiwicmVhZFByZWZlcmVuY2UiLCJpbmNsdWRlUmVhZFByZWZlcmVuY2UiLCJjb25maWciLCJhdXRoIiwiaW5mbyIsInNlbGVjdGVkRmllbGRzIiwiZ2xvYmFsSWRPYmplY3QiLCJ0eXBlIiwiY2xhc3NOYW1lIiwia2V5cyIsImluY2x1ZGUiLCJvYmplY3RzUXVlcmllcyIsImdldE9iamVjdCIsImxvYWQiLCJwYXJzZUdyYXBoUUxTY2hlbWEiLCJncmFwaFFMQ2xhc3NOYW1lIiwiZ2V0IiwiaXNHZXRFbmFibGVkIiwiZmluZCIsImlzRmluZEVuYWJsZWQiLCJnZXRBbGlhcyIsImZpbmRBbGlhcyIsImNsYXNzR3JhcGhRTE91dHB1dFR5cGUiLCJjbGFzc0dyYXBoUUxGaW5kQXJncyIsImNsYXNzR3JhcGhRTEZpbmRSZXN1bHRUeXBlIiwicGFyc2VDbGFzc1R5cGVzIiwibG93ZXJDYXNlQ2xhc3NOYW1lIiwiY2hhckF0IiwidG9Mb3dlckNhc2UiLCJzbGljZSIsImdldEdyYXBoUUxRdWVyeU5hbWUiLCJhZGRHcmFwaFFMUXVlcnkiLCJkZXNjcmlwdGlvbiIsImRlZmF1bHRHcmFwaFFMVHlwZXMiLCJHTE9CQUxfT1JfT0JKRUNUX0lEX0FUVCIsIlJFQURfT1BUSU9OU19BVFQiLCJHcmFwaFFMTm9uTnVsbCIsIk9CSkVDVCIsInJlc29sdmUiLCJlIiwiaGFuZGxlRXJyb3IiLCJmaW5kR3JhcGhRTFF1ZXJ5TmFtZSIsIndoZXJlIiwib3JkZXIiLCJza2lwIiwiZmlyc3QiLCJhZnRlciIsImxhc3QiLCJiZWZvcmUiLCJzdWJxdWVyeVJlYWRQcmVmZXJlbmNlIiwiZmlsdGVyIiwiZmllbGQiLCJzdGFydHNXaXRoIiwibWFwIiwicmVwbGFjZSIsImluZGV4T2YiLCJwYXJzZU9yZGVyIiwiam9pbiIsImZpbmRPYmplY3RzIl0sIm1hcHBpbmdzIjoiOzs7Ozs7O0FBQUE7O0FBQ0E7O0FBQ0E7O0FBQ0E7O0FBQ0E7O0FBQ0E7O0FBQ0E7O0FBQ0E7O0FBQ0E7O0FBQ0E7Ozs7Ozs7O0FBRUEsTUFBTUEsd0JBQXdCLEdBQUcsVUFBVUMsZ0JBQVYsRUFBc0Q7QUFDckYsU0FBUUEsZ0JBQWdCLElBQUlBLGdCQUFnQixDQUFDQyxLQUF0QyxJQUFnRCxFQUF2RDtBQUNELENBRkQ7O0FBSUEsTUFBTUMsUUFBUSxHQUFHLE9BQU9DLFVBQVAsRUFBbUJDLE9BQW5CLEVBQTRCQyxJQUE1QixFQUFrQ0MsT0FBbEMsRUFBMkNDLFNBQTNDLEVBQXNEQyxZQUF0RCxLQUF1RTtBQUN0RixNQUFJO0FBQUVDLElBQUFBO0FBQUYsTUFBU0osSUFBYjtBQUNBLFFBQU07QUFBRUssSUFBQUE7QUFBRixNQUFjTCxJQUFwQjtBQUNBLFFBQU07QUFBRU0sSUFBQUEsY0FBRjtBQUFrQkMsSUFBQUE7QUFBbEIsTUFBNENGLE9BQU8sSUFBSSxFQUE3RDtBQUNBLFFBQU07QUFBRUcsSUFBQUEsTUFBRjtBQUFVQyxJQUFBQSxJQUFWO0FBQWdCQyxJQUFBQTtBQUFoQixNQUF5QlQsT0FBL0I7QUFDQSxRQUFNVSxjQUFjLEdBQUcsZ0NBQWNULFNBQWQsQ0FBdkI7QUFFQSxRQUFNVSxjQUFjLEdBQUcsZ0NBQWFSLEVBQWIsQ0FBdkI7O0FBRUEsTUFBSVEsY0FBYyxDQUFDQyxJQUFmLEtBQXdCZixVQUFVLENBQUNnQixTQUF2QyxFQUFrRDtBQUNoRFYsSUFBQUEsRUFBRSxHQUFHUSxjQUFjLENBQUNSLEVBQXBCO0FBQ0Q7O0FBRUQsUUFBTTtBQUFFVyxJQUFBQSxJQUFGO0FBQVFDLElBQUFBO0FBQVIsTUFBb0IsOENBQXNCTCxjQUF0QixDQUExQjtB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QWYsQ0FDWGxELFNBRFcsRUFFWGtDLEtBRlcsRUFHWGMsVUFIVyxFQUlYWixJQUpXLEVBS1hDLEtBTFcsRUFNWEMsS0FOVyxFQU9YQyxJQVBXLEVBUVhDLE1BUlcsRUFTWHZDLElBVFcsRUFVWEMsT0FWVyxFQVdYLEtBWFcsRUFZWFYsY0FaVyxFQWFYQyxxQkFiVyxFQWNYZ0Qsc0JBZFcsRUFlWC9DLE1BZlcsRUFnQlhDLElBaEJXLEVBaUJYQyxJQWpCVyxFQWtCWEMsY0FsQlcsRUFtQlhTLGtCQUFrQixDQUFDakIsWUFuQlIsQ0FBYjtBQXFCRCxTQXBDRCxDQW9DRSxPQUFPMEMsQ0FBUCxFQUFVO0FBQ1Z6QixVQUFBQSxrQkFBa0IsQ0FBQzBCLFdBQW5CLENBQStCRCxDQUEvQjtBQUNEO0FBQ0Y7O0FBNUNzRCxLQUF6RDtBQThDRDtBQUNGLENBakdEIiwic291cmNlc0NvbnRlbnQiOlsiaW1wb3J0IHsgR3JhcGhRTE5vbk51bGwgfSBmcm9tICdncmFwaHFsJztcbmltcG9ydCB7IGZyb21HbG9iYWxJZCB9IGZyb20gJ2dyYXBocWwtcmVsYXknO1xuaW1wb3J0IGdldEZpZWxkTmFtZXMgZnJvbSAnZ3JhcGhxbC1saXN0LWZpZWxkcyc7XG5pbXBvcnQgZGVlcGNvcHkgZnJvbSAnZGVlcGNvcHknO1xuaW1wb3J0IHBsdXJhbGl6ZSBmcm9tICdwbHVyYWxpemUnO1xuaW1wb3J0ICogYXMgZGVmYXVsdEdyYXBoUUxUeXBlcyBmcm9tICcuL2RlZmF1bHRHcmFwaFFMVHlwZXMnO1xuaW1wb3J0ICogYXMgb2JqZWN0c1F1ZXJpZXMgZnJvbSAnLi4vaGVscGVycy9vYmplY3RzUXVlcmllcyc7XG5pbXBvcnQgeyBQYXJzZUdyYXBoUUxDbGFzc0NvbmZpZyB9IGZyb20gJy4uLy4uL0NvbnRyb2xsZXJzL1BhcnNlR3JhcGhRTENvbnRyb2xsZXInO1xuaW1wb3J0IHsgdHJhbnNmb3JtQ2xhc3NOYW1lVG9HcmFwaFFMIH0gZnJvbSAnLi4vdHJhbnNmb3JtZXJzL2NsYXNzTmFtZSc7XG5pbXBvcnQgeyBleHRyYWN0S2V5c0FuZEluY2x1ZGUgfSBmcm9tICcuLi9wYXJzZUdyYXBoUUxVdGlscyc7XG5cbmNvbnN0IGdldFBhcnNlQ2xhc3NRdWVyeUNvbmZpZyA9IGZ1bmN0aW9uIChwYXJzZUNsYXNzQ29uZmlnOiA/UGFyc2VHcmFwaFFMQ2xhc3NDb25maWcpIHtcbiAgcmV0dXJuIChwYXJzZUNsYXNzQ29uZmlnICYmIHBhcnNlQ2xhc3NDb25maWcucXVlcnkpIHx8IHt9O1xufTtcblxuY29uc3QgZ2V0UXVlcnkgPSBhc3luYyAocGFyc2VDbGFzcywgX3NvdXJjZSwgYXJncywgY29udGV4dCwgcXVlcnlJbmZvLCBwYXJzZUNsYXNzZXMpID0+IHtcbiAgbGV0IHsgaWQgfSA9IGFyZ3M7XG4gIGNvbnN0IHsgb3B0aW9ucyB9ID0gYXJncztcbiAgY29uc3QgeyByZWFkUHJlZmVyZW5jZSwgaW5jbHVkZVJlYWRQcmVmZXJlbmNlIH0gPSBvcHRpb25zIHx8IHt9O1xuICBjb25zdCB7IGNvbmZpZywgYXV0aCwgaW5mbyB9ID0gY29udGV4dDtcbiAgY29uc3Qgc2VsZWN0ZWRGaWVsZHMgPSBnZXRGaWVsZE5hbWVzKHF1ZXJ5SW5mbyk7XG5cbiAgY29uc3QgZ2xvYmFsSWRPYmplY3QgPSBmcm9tR2xvYmFsSWQoaWQpO1xuXG4gIGlmIChnbG9iYWxJZE9iamVjdC50eXBlID09PSBwYXJzZUNsYXNzLmNsYXNzTmFtZSkge1xuICAgIGlkID0gZ2xvYmFsSWRPYmplY3QuaWQ7XG4gIH1cblxuICBjb25zdCB7IGtleXMsIGluY2x1ZGUgfSA9IGV4dHJhY3RLZXlzQW5kSW5jbHVkZShzZWxlY3RlZEZpZWxkcyk7XG5cbiAgcmV0dXJuIGF3YWl0IG9iamVjdHNRdWVyaWVzLmdldE9iamVjdChcbiAgICBwYXJzZUNsYXNzLmNsYXNzTmFtZSxcbiAgICBpZCxcbiAgICBrZXlzLFxuICAgIGluY2x1ZGUsXG4gICAgcmVhZFByZWZlcmVuY2UsXG4gICAgaW5jbHVkZVJlYWRQcmVmZXJlbmNlLFxuICAgIGNvbmZpZyxcbiAgICBhdXRoLFxuICAgIGluZm8sXG4gICAgcGFyc2VDbGFzc2VzXG4gICk7XG59O1xuXG5jb25zdCBsb2FkID0gZnVuY3Rpb24gKHBhcnNlR3JhcGhRTFNjaGVtYSwgcGFyc2VDbGFzcywgcGFyc2VDbGFzc0NvbmZpZzogP1BhcnNlR3JhcGhRTENsYXNzQ29uZmlnKSB7XG4gIGNvbnN0IGNsYXNzTmFtZSA9IHBhcnNlQ2xhc3MuY2xhc3NOYW1lO1xuICBjb25zdCBncmFwaFFMQ2xhc3NOYW1lID0gdHJhbnNmb3JtQ2xhc3NOYW1lVG9HcmFwaFFMKGNsYXNzTmFtZSk7XG4gIGNvbnN0IHtcbiAgICBnZXQ6IGlzR2V0RW5hYmxlZCA9IHRydWUsXG4gICAgZmluZDogaXNGaW5kRW5hYmxlZCA9IHRydWUsXG4gICAgZ2V0QWxpYXM6IGdldEFsaWFzID0gJycsXG4gICAgZmluZEFsaWFzOiBmaW5kQWxpYXMgPSAnJyxcbiAgfSA9IGdldFBhcnNlQ2xhc3NRdWVyeUNvbmZpZyhwYXJzZUNsYXNzQ29uZmlnKTtcblxuICBjb25zdCB7XG4gICAgY2xhc3NHcmFwaFFMT3V0cHV0VHlwZSxcbiAgICBjbGFzc0dyYXBoUUxGaW5kQXJncyxcbiAgICBjbGFzc0dyYXBoUUxGaW5kUmVzdWx0VHlwZSxcbiAgfSA9IHBhcnNlR3JhcGhRTFNjaGVtYS5wYXJzZUNsYXNzVHlwZXNbY2xhc3NOYW1lXTtcblxuICBpZiAoaXNHZXRFbmFibGVkKSB7XG4gICAgY29uc3QgbG93ZXJDYXNlQ2xhc3NOYW1lID0gZ3JhcGhRTENsYXNzTmFtZS5jaGFyQXQoMCkudG9Mb3dlckNhc2UoKSArIGdyYXBoUUxDbGFzc05hbWUuc2xpY2UoMSk7XG5cbiAgICBjb25zdCBnZXRHcmFwaFFMUXVlcnlOYW1lID0gZ2V0QWxpYXMgfHwgbG93ZXJDYXNlQ2xhc3NOYW1lO1xuXG4gICAgcGFyc2VHcmFwaFFMU2NoZW1hLmFkZEdyYXBoUUxRdWVyeShnZXRHcmFwaFFMUXVlcnlOYW1lLCB7XG4gICAgICBkZXNjcmlwdGlvbjogYFRoZSAke2dldEdyYXBoUUxRdWVyeU5hbWV9IHF1ZXJ5IGNhbiBiZSB1c2VkIHRvIGdldCBhbiBvYmplY3Qgb2YgdGhlICR7Z3JhcGhRTENsYXNzTmFtZX0gY2xhc3MgYnkgaXRzIGlkLmAsXG4gICAgICBhcmdzOiB7XG4gICAgICAgIGlkOiBkZWZhdWx0R3JhcGhRTFR5cGVzLkdMT0JBTF9PUl9PQkpFQ1RfSURfQVRULFxuICAgICAgICBvcHRpb25zOiBkZWZhdWx0R3JhcGhRTFR5cGVzLlJFQURfT1BUSU9OU19BVFQsXG4gICAgICB9LFxuICAgICAgdHlwZTogbmV3IEdyYXBoUUxOb25OdWxsKGNsYXNzR3JhcGhRTE91dHB1dFR5cGUgfHwgZGVmYXVsdEdyYXBoUUxUeXBlcy5PQkpFQ1QpLFxuICAgICAgYXN5bmMgcmVzb2x2ZShfc291cmNlLCBhcmdzLCBjb250ZXh0LCBxdWVyeUluZm8pIHtcbiAgICAgICAgdHJ5IHtcbiAgICAgICAgICByZXR1cm4gYXdhaXQgZ2V0UXVlcnkoXG4gICAgICAgICAgICBwYXJzZUNsYXNzLFxuICAgICAgICAgICAgX3NvdXJjZSxcbiAgICAgICAgICAgIGRlZXBjb3B5KGFyZ3MpLFxuICAgICAgICAgICAgY29udGV4dCxcbiAgICAgICAgICAgIHF1ZXJ5SW5mbyxcbiAgICAgICAgICAgIHBhcnNlR3JhcGhRTFNjaGVtYS5wYXJzZUNsYXNzZXNcbiAgICAgICAgICApO1xuICAgICAgICB9IGNhdGNoIChlKSB7XG4gICAgICAgICAgcGFyc2VHcmFwaFFMU2NoZW1hLmhhbmRsZUVycm9yKGUpO1xuICAgICAgICB9XG4gICAgICB9LFxuICAgIH0pO1xuICB9XG5cbiAgaWYgKGlzRmluZEVuYWJsZWQpIHtcbiAgICBjb25zdCBsb3dlckNhc2VDbGFzc05hbWUgPSBncmFwaFFMQ2xhc3NOYW1lLmNoYXJBdCgwKS50b0xvd2VyQ2FzZSgpICsgZ3JhcGhRTENsYXNzTmFtZS5zbGljZSgxKTtcblxuICAgIGNvbnN0IGZpbmRHcmFwaFFMUXVlcnlOYW1lID0gZmluZEFsaWFzIHx8IHBsdXJhbGl6ZShsb3dlckNhc2VDbGFzc05hbWUpO1xuXG4gICAgcGFyc2VHcmFwaFFMU2NoZW1hLmFkZEdyYXBoUUxRdWVyeShmaW5kR3JhcGhRTFF1ZXJ5TmFtZSwge1xuICAgICAgZGVzY3JpcHRpb246IGBUaGUgJHtmaW5kR3JhcGhRTFF1ZXJ5TmFtZX0gcXVlcnkgY2FuIGJlIHVzZWQgdG8gZmluZCBvYmplY3RzIG9mIHRoZSAke2dyYXBoUUxDbGFzc05hbWV9IGNsYXNzLmAsXG4gICAgICBhcmdzOiBjbGFzc0dyYXBoUUxGaW5kQXJncyxcbiAgICAgIHR5cGU6IG5ldyBHcmFwaFFMTm9uTnVsbChjbGFzc0dyYXBoUUxGaW5kUmVzdWx0VHlwZSB8fCBkZWZhdWx0R3JhcGhRTFR5cGVzLk9CSkVDVCksXG4gICAgICBhc3luYyByZXNvbHZlKF9zb3VyY2UsIGFyZ3MsIGNvbnRleHQsIHF1ZXJ5SW5mbykge1xuICAgICAgICB0cnkge1xuICAgICAgICAgIC8vIERlZXAgY29weSBhcmdzIHRvIGF2b2lkIGludGVybmFsIHJlIGFzc2lnbiBpc3N1ZVxuICAgICAgICAgIGNvbnN0IHsgd2hlcmUsIG9yZGVyLCBza2lwLCBmaXJzdCwgYWZ0ZXIsIGxhc3QsIGJlZm9yZSwgb3B0aW9ucyB9ID0gZGVlcGNvcHkoYXJncyk7XG4gICAgICAgICAgY29uc3QgeyByZWFkUHJlZmVyZW5jZSwgaW5jbHVkZVJlYWRQcmVmZXJlbmNlLCBzdWJxdWVyeVJlYWRQcmVmZXJlbmNlIH0gPSBvcHRpb25zIHx8IHt9O1xuICAgICAgICAgIGNvbnN0IHsgY29uZmlnLCBhdXRoLCBpbmZvIH0gPSBjb250ZXh0O1xuICAgICAgICAgIGNvbnN0IHNlbGVjdGVkRmllbGRzID0gZ2V0RmllbGROYW1lcyhxdWVyeUluZm8pO1xuXG4gICAgICAgICAgY29uc3QgeyBrZXlzLCBpbmNsdWRlIH0gPSBleHRyYWN0S2V5c0FuZEluY2x1ZGUoXG4gICAgICAgICAgICBzZWxlY3RlZEZpZWxkc1xuICAgICAgICAgICAgICAuZmlsdGVyKGZpZWxkID0+IGZpZWxkLnN0YXJ0c1dpdGgoJ2VkZ2VzLm5vZGUuJykpXG4gICAgICAgICAgICAgIC5tYXAoZmllbGQgPT4gZmllbGQucmVwbGFjZSgnZWRnZXMubm9kZS4nLCAnJykpXG4gICAgICAgICAgICAgIC5maWx0ZXIoZmllbGQgPT4gZmllbGQuaW5kZXhPZignZWRnZXMubm9kZScpIDwgMClcbiAgICAgICAgICApO1xuICAgICAgICAgIGNvbnN0IHBhcnNlT3JkZXIgPSBvcmRlciAmJiBvcmRlci5qb2luKCcsJyk7XG5cbiAgICAgICAgICByZXR1cm4gYXdhaXQgb2JqZWN0c1F1ZXJpZXMuZmluZE9iamVjdHMoXG4gICAgICAgICAgICBjbGFzc05hbWUsXG4gICAgICAgICAgICB3aGVyZSxcbiAgICAgICAgICAgIHBhcnNlT3JkZXIsXG4gICAgICAgICAgICBza2lwLFxuICAgICAgICAgICAgZmlyc3QsXG4gICAgICAgICAgICBhZnRlcixcbiAgICAgICAgICAgIGxhc3QsXG4gICAgICAgICAgICBiZWZvcmUsXG4gICAgICAgICAgICBrZXlzLFxuICAgICAgICAgICAgaW5jbHVkZSxcbiAgICAgICAgICAgIGZhbHNlLFxuICAgICAgICAgICAgcmVhZFByZWZlcmVuY2UsXG4gICAgICAgICAgICBpbmNsdWRlUmVhZFByZWZlcmVuY2UsXG4gICAgICAgICAgICBzdWJxdWVyeVJlYWRQcmVmZXJlbmNlLFxuICAgICAgICAgICAgY29uZmlnLFxuICAgICAgICAgICAgYXV0aCxcbiAgICAgICAgICAgIGluZm8sXG4gICAgICAgICAgICBzZWxlY3RlZEZpZWxkcyxcbiAgICAgICAgICAgIHBhcnNlR3JhcGhRTFNjaGVtYS5wYXJzZUNsYXNzZXNcbiAgICAgICAgICApO1xuICAgICAgICB9IGNhdGNoIChlKSB7XG4gICAgICAgICAgcGFyc2VHcmFwaFFMU2NoZW1hLmhhbmRsZUVycm9yKGUpO1xuICAgICAgICB9XG4gICAgICB9LFxuICAgIH0pO1xuICB9XG59O1xuXG5leHBvcnQgeyBsb2FkIH07XG4iXX0=