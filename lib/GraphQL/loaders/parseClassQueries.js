"use strict";

Object.defineProperty(exports, "__esModule", {
  value: true
});
exports.load = void 0;

var _graphql = require("graphql");

var _graphqlRelay = require("graphql-relay");

var _graphqlListFields = _interopRequireDefault(require("graphql-list-fields"));

var _pluralize = _interopRequireDefault(require("pluralize"));

var defaultGraphQLTypes = _interopRequireWildcard(require("./defaultGraphQLTypes"));

var objectsQueries = _interopRequireWildcard(require("../helpers/objectsQueries"));

var _ParseGraphQLController = require("../../Controllers/ParseGraphQLController");

var _className = require("../transformers/className");

var _parseGraphQLUtils = require("../parseGraphQLUtils");

function _getRequireWildcardCache() { if (typeof WeakMap !== "function") return null; var cache = new WeakMap(); _getRequireWildcardCache = function () { return cache; }; return cache; }

function _interopRequireWildcard(obj) { if (obj && obj.__esModule) { return obj; } if (obj === null || typeof obj !== "object" && typeof obj !== "function") { return { default: obj }; } var cache = _getRequireWildcardCache(); if (cache && cache.has(obj)) { return cache.get(obj); } var newObj = {}; var hasPropertyDescriptor = Object.defineProperty && Object.getOwnPropertyDescriptor; for (var key in obj) { if (Object.prototype.hasOwnProperty.call(obj, key)) { var desc = hasPropertyDescriptor ? Object.getOwnPropertyDescriptor(obj, key) : null; if (desc && (desc.get || desc.set)) { Object.defineProperty(newObj, key, desc); } else { newObj[key] = obj[key]; } } } newObj.default = obj; if (cache) { cache.set(obj, newObj); } return newObj; }

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
          return await getQuery(parseClass, _source, args, context, queryInfo, parseGraphQLSchema.parseClasses);
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
          const {
            where,
            order,
            skip,
            first,
            after,
            last,
            before,
            options
          } = args;
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
          } = (0, _parseGraphQLUtils.extractKeysAndInclude)(selectedFields.filter(field => field.startsWith('edges.node.')).map(field => field.replace('edges.node.', '')));
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
//# sourceMappingURL=data:application/json;charset=utf-8;base64,eyJ2ZXJzaW9uIjozLCJzb3VyY2VzIjpbIi4uLy4uLy4uL3NyYy9HcmFwaFFML2xvYWRlcnMvcGFyc2VDbGFzc1F1ZXJpZXMuanMiXSwibmFtZXMiOlsiZ2V0UGFyc2VDbGFzc1F1ZXJ5Q29uZmlnIiwicGFyc2VDbGFzc0NvbmZpZyIsInF1ZXJ5IiwiZ2V0UXVlcnkiLCJwYXJzZUNsYXNzIiwiX3NvdXJjZSIsImFyZ3MiLCJjb250ZXh0IiwicXVlcnlJbmZvIiwicGFyc2VDbGFzc2VzIiwiaWQiLCJvcHRpb25zIiwicmVhZFByZWZlcmVuY2UiLCJpbmNsdWRlUmVhZFByZWZlcmVuY2UiLCJjb25maWciLCJhdXRoIiwiaW5mbyIsInNlbGVjdGVkRmllbGRzIiwiZ2xvYmFsSWRPYmplY3QiLCJ0eXBlIiwiY2xhc3NOYW1lIiwia2V5cyIsImluY2x1ZGUiLCJvYmplY3RzUXVlcmllcyIsImdldE9iamVjdCIsImxvYWQiLCJwYXJzZUdyYXBoUUxTY2hlbWEiLCJncmFwaFFMQ2xhc3NOYW1lIiwiZ2V0IiwiaXNHZXRFbmFibGVkIiwiZmluZCIsImlzRmluZEVuYWJsZWQiLCJnZXRBbGlhcyIsImZpbmRBbGlhcyIsImNsYXNzR3JhcGhRTE91dHB1dFR5cGUiLCJjbGFzc0dyYXBoUUxGaW5kQXJncyIsImNsYXNzR3JhcGhRTEZpbmRSZXN1bHRUeXBlIiwicGFyc2VDbGFzc1R5cGVzIiwibG93ZXJDYXNlQ2xhc3NOYW1lIiwiY2hhckF0IiwidG9Mb3dlckNhc2UiLCJzbGljZSIsImdldEdyYXBoUUxRdWVyeU5hbWUiLCJhZGRHcmFwaFFMUXVlcnkiLCJkZXNjcmlwdGlvbiIsImRlZmF1bHRHcmFwaFFMVHlwZXMiLCJHTE9CQUxfT1JfT0JKRUNUX0lEX0FUVCIsIlJFQURfT1BUSU9OU19BVFQiLCJHcmFwaFFMTm9uTnVsbCIsIk9CSkVDVCIsInJlc29sdmUiLCJlIiwiaGFuZGxlRXJyb3IiLCJmaW5kR3JhcGhRTFF1ZXJ5TmFtZSIsIndoZXJlIiwib3JkZXIiLCJza2lwIiwiZmlyc3QiLCJhZnRlciIsImxhc3QiLCJiZWZvcmUiLCJzdWJxdWVyeVJlYWRQcmVmZXJlbmNlIiwiZmlsdGVyIiwiZmllbGQiLCJzdGFydHNXaXRoIiwibWFwIiwicmVwbGFjZSIsInBhcnNlT3JkZXIiLCJqb2luIiwiZmluZE9iamVjdHMiXSwibWFwcGluZ3MiOiI7Ozs7Ozs7QUFBQTs7QUFDQTs7QUFDQTs7QUFDQTs7QUFDQTs7QUFDQTs7QUFDQTs7QUFDQTs7QUFDQTs7Ozs7Ozs7QUFFQSxNQUFNQSx3QkFBd0IsR0FBRyxVQUFVQyxnQkFBVixFQUFzRDtBQUNyRixTQUFRQSxnQkFBZ0IsSUFBSUEsZ0JBQWdCLENBQUNDLEtBQXRDLElBQWdELEVBQXZEO0FBQ0QsQ0FGRDs7QUFJQSxNQUFNQyxRQUFRLEdBQUcsT0FBT0MsVUFBUCxFQUFtQkMsT0FBbkIsRUFBNEJDLElBQTVCLEVBQWtDQyxPQUFsQyxFQUEyQ0MsU0FBM0MsRUFBc0RDLFlBQXRELEtBQXVFO0FBQ3RGLE1BQUk7QUFBRUMsSUFBQUE7QUFBRixNQUFTSixJQUFiO0FBQ0EsUUFBTTtBQUFFSyxJQUFBQTtBQUFGLE1BQWNMLElBQXBCO0FBQ0EsUUFBTTtBQUFFTSxJQUFBQSxjQUFGO0FBQWtCQyxJQUFBQTtBQUFsQixNQUE0Q0YsT0FBTyxJQUFJLEVBQTdEO0FBQ0EsUUFBTTtBQUFFRyxJQUFBQSxNQUFGO0FBQVVDLElBQUFBLElBQVY7QUFBZ0JDLElBQUFBO0FBQWhCLE1BQXlCVCxPQUEvQjtBQUNBLFFBQU1VLGNBQWMsR0FBRyxnQ0FBY1QsU0FBZCxDQUF2QjtBQUVBLFFBQU1VLGNBQWMsR0FBRyxnQ0FBYVIsRUFBYixDQUF2Qjs7QUFFQSxNQUFJUSxjQUFjLENBQUNDLElBQWYsS0FBd0JmLFVBQVUsQ0FBQ2dCLFNBQXZDLEVBQWtEO0FBQ2hEVixJQUFBQSxFQUFFLEdBQUdRLGNBQWMsQ0FBQ1IsRUFBcEI7QUFDRDs7QUFFRCxRQUFNO0FBQUVXLElBQUFBLElBQUY7QUFBUUMsSUFBQUE7QUFBUixNQUFvQiw4Q0FBc0JMLGNBQXRCLENBQTFCO0FBRUEsU0FBTyxNQUFNTSxj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QyxPQVZXLEVBV1gsS0FYVyxFQVlYVixjQVpXLEVBYVhDLHFCQWJXLEVBY1hnRCxzQkFkVyxFQWVYL0MsTUFmVyxFQWdCWEMsSUFoQlcsRUFpQlhDLElBakJXLEVBa0JYQyxjQWxCVyxFQW1CWFMsa0JBQWtCLENBQUNqQixZQW5CUixDQUFiO0FBcUJELFNBbENELENBa0NFLE9BQU8wQyxDQUFQLEVBQVU7QUFDVnpCLFVBQUFBLGtCQUFrQixDQUFDMEIsV0FBbkIsQ0FBK0JELENBQS9CO0FBQ0Q7QUFDRjs7QUExQ3NELEtBQXpEO0FBNENEO0FBQ0YsQ0EvRkQiLCJzb3VyY2VzQ29udGVudCI6WyJpbXBvcnQgeyBHcmFwaFFMTm9uTnVsbCB9IGZyb20gJ2dyYXBocWwnO1xuaW1wb3J0IHsgZnJvbUdsb2JhbElkIH0gZnJvbSAnZ3JhcGhxbC1yZWxheSc7XG5pbXBvcnQgZ2V0RmllbGROYW1lcyBmcm9tICdncmFwaHFsLWxpc3QtZmllbGRzJztcbmltcG9ydCBwbHVyYWxpemUgZnJvbSAncGx1cmFsaXplJztcbmltcG9ydCAqIGFzIGRlZmF1bHRHcmFwaFFMVHlwZXMgZnJvbSAnLi9kZWZhdWx0R3JhcGhRTFR5cGVzJztcbmltcG9ydCAqIGFzIG9iamVjdHNRdWVyaWVzIGZyb20gJy4uL2hlbHBlcnMvb2JqZWN0c1F1ZXJpZXMnO1xuaW1wb3J0IHsgUGFyc2VHcmFwaFFMQ2xhc3NDb25maWcgfSBmcm9tICcuLi8uLi9Db250cm9sbGVycy9QYXJzZUdyYXBoUUxDb250cm9sbGVyJztcbmltcG9ydCB7IHRyYW5zZm9ybUNsYXNzTmFtZVRvR3JhcGhRTCB9IGZyb20gJy4uL3RyYW5zZm9ybWVycy9jbGFzc05hbWUnO1xuaW1wb3J0IHsgZXh0cmFjdEtleXNBbmRJbmNsdWRlIH0gZnJvbSAnLi4vcGFyc2VHcmFwaFFMVXRpbHMnO1xuXG5jb25zdCBnZXRQYXJzZUNsYXNzUXVlcnlDb25maWcgPSBmdW5jdGlvbiAocGFyc2VDbGFzc0NvbmZpZzogP1BhcnNlR3JhcGhRTENsYXNzQ29uZmlnKSB7XG4gIHJldHVybiAocGFyc2VDbGFzc0NvbmZpZyAmJiBwYXJzZUNsYXNzQ29uZmlnLnF1ZXJ5KSB8fCB7fTtcbn07XG5cbmNvbnN0IGdldFF1ZXJ5ID0gYXN5bmMgKHBhcnNlQ2xhc3MsIF9zb3VyY2UsIGFyZ3MsIGNvbnRleHQsIHF1ZXJ5SW5mbywgcGFyc2VDbGFzc2VzKSA9PiB7XG4gIGxldCB7IGlkIH0gPSBhcmdzO1xuICBjb25zdCB7IG9wdGlvbnMgfSA9IGFyZ3M7XG4gIGNvbnN0IHsgcmVhZFByZWZlcmVuY2UsIGluY2x1ZGVSZWFkUHJlZmVyZW5jZSB9ID0gb3B0aW9ucyB8fCB7fTtcbiAgY29uc3QgeyBjb25maWcsIGF1dGgsIGluZm8gfSA9IGNvbnRleHQ7XG4gIGNvbnN0IHNlbGVjdGVkRmllbGRzID0gZ2V0RmllbGROYW1lcyhxdWVyeUluZm8pO1xuXG4gIGNvbnN0IGdsb2JhbElkT2JqZWN0ID0gZnJvbUdsb2JhbElkKGlkKTtcblxuICBpZiAoZ2xvYmFsSWRPYmplY3QudHlwZSA9PT0gcGFyc2VDbGFzcy5jbGFzc05hbWUpIHtcbiAgICBpZCA9IGdsb2JhbElkT2JqZWN0LmlkO1xuICB9XG5cbiAgY29uc3QgeyBrZXlzLCBpbmNsdWRlIH0gPSBleHRyYWN0S2V5c0FuZEluY2x1ZGUoc2VsZWN0ZWRGaWVsZHMpO1xuXG4gIHJldHVybiBhd2FpdCBvYmplY3RzUXVlcmllcy5nZXRPYmplY3QoXG4gICAgcGFyc2VDbGFzcy5jbGFzc05hbWUsXG4gICAgaWQsXG4gICAga2V5cyxcbiAgICBpbmNsdWRlLFxuICAgIHJlYWRQcmVmZXJlbmNlLFxuICAgIGluY2x1ZGVSZWFkUHJlZmVyZW5jZSxcbiAgICBjb25maWcsXG4gICAgYXV0aCxcbiAgICBpbmZvLFxuICAgIHBhcnNlQ2xhc3Nlc1xuICApO1xufTtcblxuY29uc3QgbG9hZCA9IGZ1bmN0aW9uIChwYXJzZUdyYXBoUUxTY2hlbWEsIHBhcnNlQ2xhc3MsIHBhcnNlQ2xhc3NDb25maWc6ID9QYXJzZUdyYXBoUUxDbGFzc0NvbmZpZykge1xuICBjb25zdCBjbGFzc05hbWUgPSBwYXJzZUNsYXNzLmNsYXNzTmFtZTtcbiAgY29uc3QgZ3JhcGhRTENsYXNzTmFtZSA9IHRyYW5zZm9ybUNsYXNzTmFtZVRvR3JhcGhRTChjbGFzc05hbWUpO1xuICBjb25zdCB7XG4gICAgZ2V0OiBpc0dldEVuYWJsZWQgPSB0cnVlLFxuICAgIGZpbmQ6IGlzRmluZEVuYWJsZWQgPSB0cnVlLFxuICAgIGdldEFsaWFzOiBnZXRBbGlhcyA9ICcnLFxuICAgIGZpbmRBbGlhczogZmluZEFsaWFzID0gJycsXG4gIH0gPSBnZXRQYXJzZUNsYXNzUXVlcnlDb25maWcocGFyc2VDbGFzc0NvbmZpZyk7XG5cbiAgY29uc3Qge1xuICAgIGNsYXNzR3JhcGhRTE91dHB1dFR5cGUsXG4gICAgY2xhc3NHcmFwaFFMRmluZEFyZ3MsXG4gICAgY2xhc3NHcmFwaFFMRmluZFJlc3VsdFR5cGUsXG4gIH0gPSBwYXJzZUdyYXBoUUxTY2hlbWEucGFyc2VDbGFzc1R5cGVzW2NsYXNzTmFtZV07XG5cbiAgaWYgKGlzR2V0RW5hYmxlZCkge1xuICAgIGNvbnN0IGxvd2VyQ2FzZUNsYXNzTmFtZSA9IGdyYXBoUUxDbGFzc05hbWUuY2hhckF0KDApLnRvTG93ZXJDYXNlKCkgKyBncmFwaFFMQ2xhc3NOYW1lLnNsaWNlKDEpO1xuXG4gICAgY29uc3QgZ2V0R3JhcGhRTFF1ZXJ5TmFtZSA9IGdldEFsaWFzIHx8IGxvd2VyQ2FzZUNsYXNzTmFtZTtcblxuICAgIHBhcnNlR3JhcGhRTFNjaGVtYS5hZGRHcmFwaFFMUXVlcnkoZ2V0R3JhcGhRTFF1ZXJ5TmFtZSwge1xuICAgICAgZGVzY3JpcHRpb246IGBUaGUgJHtnZXRHcmFwaFFMUXVlcnlOYW1lfSBxdWVyeSBjYW4gYmUgdXNlZCB0byBnZXQgYW4gb2JqZWN0IG9mIHRoZSAke2dyYXBoUUxDbGFzc05hbWV9IGNsYXNzIGJ5IGl0cyBpZC5gLFxuICAgICAgYXJnczoge1xuICAgICAgICBpZDogZGVmYXVsdEdyYXBoUUxUeXBlcy5HTE9CQUxfT1JfT0JKRUNUX0lEX0FUVCxcbiAgICAgICAgb3B0aW9uczogZGVmYXVsdEdyYXBoUUxUeXBlcy5SRUFEX09QVElPTlNfQVRULFxuICAgICAgfSxcbiAgICAgIHR5cGU6IG5ldyBHcmFwaFFMTm9uTnVsbChjbGFzc0dyYXBoUUxPdXRwdXRUeXBlIHx8IGRlZmF1bHRHcmFwaFFMVHlwZXMuT0JKRUNUKSxcbiAgICAgIGFzeW5jIHJlc29sdmUoX3NvdXJjZSwgYXJncywgY29udGV4dCwgcXVlcnlJbmZvKSB7XG4gICAgICAgIHRyeSB7XG4gICAgICAgICAgcmV0dXJuIGF3YWl0IGdldFF1ZXJ5KFxuICAgICAgICAgICAgcGFyc2VDbGFzcyxcbiAgICAgICAgICAgIF9zb3VyY2UsXG4gICAgICAgICAgICBhcmdzLFxuICAgICAgICAgICAgY29udGV4dCxcbiAgICAgICAgICAgIHF1ZXJ5SW5mbyxcbiAgICAgICAgICAgIHBhcnNlR3JhcGhRTFNjaGVtYS5wYXJzZUNsYXNzZXNcbiAgICAgICAgICApO1xuICAgICAgICB9IGNhdGNoIChlKSB7XG4gICAgICAgICAgcGFyc2VHcmFwaFFMU2NoZW1hLmhhbmRsZUVycm9yKGUpO1xuICAgICAgICB9XG4gICAgICB9LFxuICAgIH0pO1xuICB9XG5cbiAgaWYgKGlzRmluZEVuYWJsZWQpIHtcbiAgICBjb25zdCBsb3dlckNhc2VDbGFzc05hbWUgPSBncmFwaFFMQ2xhc3NOYW1lLmNoYXJBdCgwKS50b0xvd2VyQ2FzZSgpICsgZ3JhcGhRTENsYXNzTmFtZS5zbGljZSgxKTtcblxuICAgIGNvbnN0IGZpbmRHcmFwaFFMUXVlcnlOYW1lID0gZmluZEFsaWFzIHx8IHBsdXJhbGl6ZShsb3dlckNhc2VDbGFzc05hbWUpO1xuXG4gICAgcGFyc2VHcmFwaFFMU2NoZW1hLmFkZEdyYXBoUUxRdWVyeShmaW5kR3JhcGhRTFF1ZXJ5TmFtZSwge1xuICAgICAgZGVzY3JpcHRpb246IGBUaGUgJHtmaW5kR3JhcGhRTFF1ZXJ5TmFtZX0gcXVlcnkgY2FuIGJlIHVzZWQgdG8gZmluZCBvYmplY3RzIG9mIHRoZSAke2dyYXBoUUxDbGFzc05hbWV9IGNsYXNzLmAsXG4gICAgICBhcmdzOiBjbGFzc0dyYXBoUUxGaW5kQXJncyxcbiAgICAgIHR5cGU6IG5ldyBHcmFwaFFMTm9uTnVsbChjbGFzc0dyYXBoUUxGaW5kUmVzdWx0VHlwZSB8fCBkZWZhdWx0R3JhcGhRTFR5cGVzLk9CSkVDVCksXG4gICAgICBhc3luYyByZXNvbHZlKF9zb3VyY2UsIGFyZ3MsIGNvbnRleHQsIHF1ZXJ5SW5mbykge1xuICAgICAgICB0cnkge1xuICAgICAgICAgIGNvbnN0IHsgd2hlcmUsIG9yZGVyLCBza2lwLCBmaXJzdCwgYWZ0ZXIsIGxhc3QsIGJlZm9yZSwgb3B0aW9ucyB9ID0gYXJncztcbiAgICAgICAgICBjb25zdCB7IHJlYWRQcmVmZXJlbmNlLCBpbmNsdWRlUmVhZFByZWZlcmVuY2UsIHN1YnF1ZXJ5UmVhZFByZWZlcmVuY2UgfSA9IG9wdGlvbnMgfHwge307XG4gICAgICAgICAgY29uc3QgeyBjb25maWcsIGF1dGgsIGluZm8gfSA9IGNvbnRleHQ7XG4gICAgICAgICAgY29uc3Qgc2VsZWN0ZWRGaWVsZHMgPSBnZXRGaWVsZE5hbWVzKHF1ZXJ5SW5mbyk7XG5cbiAgICAgICAgICBjb25zdCB7IGtleXMsIGluY2x1ZGUgfSA9IGV4dHJhY3RLZXlzQW5kSW5jbHVkZShcbiAgICAgICAgICAgIHNlbGVjdGVkRmllbGRzXG4gICAgICAgICAgICAgIC5maWx0ZXIoZmllbGQgPT4gZmllbGQuc3RhcnRzV2l0aCgnZWRnZXMubm9kZS4nKSlcbiAgICAgICAgICAgICAgLm1hcChmaWVsZCA9PiBmaWVsZC5yZXBsYWNlKCdlZGdlcy5ub2RlLicsICcnKSlcbiAgICAgICAgICApO1xuICAgICAgICAgIGNvbnN0IHBhcnNlT3JkZXIgPSBvcmRlciAmJiBvcmRlci5qb2luKCcsJyk7XG5cbiAgICAgICAgICByZXR1cm4gYXdhaXQgb2JqZWN0c1F1ZXJpZXMuZmluZE9iamVjdHMoXG4gICAgICAgICAgICBjbGFzc05hbWUsXG4gICAgICAgICAgICB3aGVyZSxcbiAgICAgICAgICAgIHBhcnNlT3JkZXIsXG4gICAgICAgICAgICBza2lwLFxuICAgICAgICAgICAgZmlyc3QsXG4gICAgICAgICAgICBhZnRlcixcbiAgICAgICAgICAgIGxhc3QsXG4gICAgICAgICAgICBiZWZvcmUsXG4gICAgICAgICAgICBrZXlzLFxuICAgICAgICAgICAgaW5jbHVkZSxcbiAgICAgICAgICAgIGZhbHNlLFxuICAgICAgICAgICAgcmVhZFByZWZlcmVuY2UsXG4gICAgICAgICAgICBpbmNsdWRlUmVhZFByZWZlcmVuY2UsXG4gICAgICAgICAgICBzdWJxdWVyeVJlYWRQcmVmZXJlbmNlLFxuICAgICAgICAgICAgY29uZmlnLFxuICAgICAgICAgICAgYXV0aCxcbiAgICAgICAgICAgIGluZm8sXG4gICAgICAgICAgICBzZWxlY3RlZEZpZWxkcyxcbiAgICAgICAgICAgIHBhcnNlR3JhcGhRTFNjaGVtYS5wYXJzZUNsYXNzZXNcbiAgICAgICAgICApO1xuICAgICAgICB9IGNhdGNoIChlKSB7XG4gICAgICAgICAgcGFyc2VHcmFwaFFMU2NoZW1hLmhhbmRsZUVycm9yKGUpO1xuICAgICAgICB9XG4gICAgICB9LFxuICAgIH0pO1xuICB9XG59O1xuXG5leHBvcnQgeyBsb2FkIH07XG4iXX0=