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

const getQuery = async (parseClass, _source, args, context, queryInfo) => {
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
  return await objectsQueries.getObject(parseClass.className, id, keys, include, readPreference, includeReadPreference, config, auth, info, parseClass);
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
          return await getQuery(parseClass, _source, args, context, queryInfo);
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
//# sourceMappingURL=data:application/json;charset=utf-8;base64,eyJ2ZXJzaW9uIjozLCJzb3VyY2VzIjpbIi4uLy4uLy4uL3NyYy9HcmFwaFFML2xvYWRlcnMvcGFyc2VDbGFzc1F1ZXJpZXMuanMiXSwibmFtZXMiOlsiZ2V0UGFyc2VDbGFzc1F1ZXJ5Q29uZmlnIiwicGFyc2VDbGFzc0NvbmZpZyIsInF1ZXJ5IiwiZ2V0UXVlcnkiLCJwYXJzZUNsYXNzIiwiX3NvdXJjZSIsImFyZ3MiLCJjb250ZXh0IiwicXVlcnlJbmZvIiwiaWQiLCJvcHRpb25zIiwicmVhZFByZWZlcmVuY2UiLCJpbmNsdWRlUmVhZFByZWZlcmVuY2UiLCJjb25maWciLCJhdXRoIiwiaW5mbyIsInNlbGVjdGVkRmllbGRzIiwiZ2xvYmFsSWRPYmplY3QiLCJ0eXBlIiwiY2xhc3NOYW1lIiwia2V5cyIsImluY2x1ZGUiLCJvYmplY3RzUXVlcmllcyIsImdldE9iamVjdCIsImxvYWQiLCJwYXJzZUdyYXBoUUxTY2hlbWEiLCJncmFwaFFMQ2xhc3NOYW1lIiwiZ2V0IiwiaXNHZXRFbmFibGVkIiwiZmluZCIsImlzRmluZEVuYWJsZWQiLCJnZXRBbGlhcyIsImZpbmRBbGlhcyIsImNsYXNzR3JhcGhRTE91dHB1dFR5cGUiLCJjbGFzc0dyYXBoUUxGaW5kQXJncyIsImNsYXNzR3JhcGhRTEZpbmRSZXN1bHRUeXBlIiwicGFyc2VDbGFzc1R5cGVzIiwibG93ZXJDYXNlQ2xhc3NOYW1lIiwiY2hhckF0IiwidG9Mb3dlckNhc2UiLCJzbGljZSIsImdldEdyYXBoUUxRdWVyeU5hbWUiLCJhZGRHcmFwaFFMUXVlcnkiLCJkZXNjcmlwdGlvbiIsImRlZmF1bHRHcmFwaFFMVHlwZXMiLCJHTE9CQUxfT1JfT0JKRUNUX0lEX0FUVCIsIlJFQURfT1BUSU9OU19BVFQiLCJHcmFwaFFMTm9uTnVsbCIsIk9CSkVDVCIsInJlc29sdmUiLCJlIiwiaGFuZGxlRXJyb3IiLCJmaW5kR3JhcGhRTFF1ZXJ5TmFtZSIsIndoZXJlIiwib3JkZXIiLCJza2lwIiwiZmlyc3QiLCJhZnRlciIsImxhc3QiLCJiZWZvcmUiLCJzdWJxdWVyeVJlYWRQcmVmZXJlbmNlIiwiZmlsdGVyIiwiZmllbGQiLCJzdGFydHNXaXRoIiwibWFwIiwicmVwbGFjZSIsInBhcnNlT3JkZXIiLCJqb2luIiwiZmluZE9iamVjdHMiLCJwYXJzZUNsYXNzZXMiXSwibWFwcGluZ3MiOiI7Ozs7Ozs7QUFBQTs7QUFDQTs7QUFDQTs7QUFDQTs7QUFDQTs7QUFDQTs7QUFDQTs7QUFDQTs7QUFDQTs7Ozs7Ozs7QUFFQSxNQUFNQSx3QkFBd0IsR0FBRyxVQUMvQkMsZ0JBRCtCLEVBRS9CO0FBQ0EsU0FBUUEsZ0JBQWdCLElBQUlBLGdCQUFnQixDQUFDQyxLQUF0QyxJQUFnRCxFQUF2RDtBQUNELENBSkQ7O0FBTUEsTUFBTUMsUUFBUSxHQUFHLE9BQU9DLFVBQVAsRUFBbUJDLE9BQW5CLEVBQTRCQyxJQUE1QixFQUFrQ0MsT0FBbEMsRUFBMkNDLFNBQTNDLEtBQXlEO0FBQ3hFLE1BQUk7QUFBRUMsSUFBQUE7QUFBRixNQUFTSCxJQUFiO0FBQ0EsUUFBTTtBQUFFSSxJQUFBQTtBQUFGLE1BQWNKLElBQXBCO0FBQ0EsUUFBTTtBQUFFSyxJQUFBQSxjQUFGO0FBQWtCQyxJQUFBQTtBQUFsQixNQUE0Q0YsT0FBTyxJQUFJLEVBQTdEO0FBQ0EsUUFBTTtBQUFFRyxJQUFBQSxNQUFGO0FBQVVDLElBQUFBLElBQVY7QUFBZ0JDLElBQUFBO0FBQWhCLE1BQXlCUixPQUEvQjtBQUNBLFFBQU1TLGNBQWMsR0FBRyxnQ0FBY1IsU0FBZCxDQUF2QjtBQUVBLFFBQU1TLGNBQWMsR0FBRyxnQ0FBYVIsRUFBYixDQUF2Qjs7QUFFQSxNQUFJUSxjQUFjLENBQUNDLElBQWYsS0FBd0JkLFVBQVUsQ0FBQ2UsU0FBdkMsRUFBa0Q7QUFDaERWLElBQUFBLEVBQUUsR0FBR1EsY0FBYyxDQUFDUixFQUFwQjtBQUNEOztBQUVELFFBQU07QUFBRVcsSUFBQUEsSUFBRjtBQUFRQyxJQUFBQTtBQUFSLE1BQW9CLDhDQUFzQkwsY0FBdEIsQ0FBMUI7QUFFQSxTQUFPLE1BQU1NLGNBQWMsQ0FBQ0MsU0FB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aEJXLEVBaUJYQyxJQWpCVyxFQWtCWEMsY0FsQlcsRUFtQlhTLGtCQUFrQixDQUFDNEMsWUFuQlIsQ0FBYjtBQXFCRCxTQS9DRCxDQStDRSxPQUFPbkIsQ0FBUCxFQUFVO0FBQ1Z6QixVQUFBQSxrQkFBa0IsQ0FBQzBCLFdBQW5CLENBQStCRCxDQUEvQjtBQUNEO0FBQ0Y7O0FBekRzRCxLQUF6RDtBQTJERDtBQUNGLENBL0dEIiwic291cmNlc0NvbnRlbnQiOlsiaW1wb3J0IHsgR3JhcGhRTE5vbk51bGwgfSBmcm9tICdncmFwaHFsJztcbmltcG9ydCB7IGZyb21HbG9iYWxJZCB9IGZyb20gJ2dyYXBocWwtcmVsYXknO1xuaW1wb3J0IGdldEZpZWxkTmFtZXMgZnJvbSAnZ3JhcGhxbC1saXN0LWZpZWxkcyc7XG5pbXBvcnQgcGx1cmFsaXplIGZyb20gJ3BsdXJhbGl6ZSc7XG5pbXBvcnQgKiBhcyBkZWZhdWx0R3JhcGhRTFR5cGVzIGZyb20gJy4vZGVmYXVsdEdyYXBoUUxUeXBlcyc7XG5pbXBvcnQgKiBhcyBvYmplY3RzUXVlcmllcyBmcm9tICcuLi9oZWxwZXJzL29iamVjdHNRdWVyaWVzJztcbmltcG9ydCB7IFBhcnNlR3JhcGhRTENsYXNzQ29uZmlnIH0gZnJvbSAnLi4vLi4vQ29udHJvbGxlcnMvUGFyc2VHcmFwaFFMQ29udHJvbGxlcic7XG5pbXBvcnQgeyB0cmFuc2Zvcm1DbGFzc05hbWVUb0dyYXBoUUwgfSBmcm9tICcuLi90cmFuc2Zvcm1lcnMvY2xhc3NOYW1lJztcbmltcG9ydCB7IGV4dHJhY3RLZXlzQW5kSW5jbHVkZSB9IGZyb20gJy4uL3BhcnNlR3JhcGhRTFV0aWxzJztcblxuY29uc3QgZ2V0UGFyc2VDbGFzc1F1ZXJ5Q29uZmlnID0gZnVuY3Rpb24oXG4gIHBhcnNlQ2xhc3NDb25maWc6ID9QYXJzZUdyYXBoUUxDbGFzc0NvbmZpZ1xuKSB7XG4gIHJldHVybiAocGFyc2VDbGFzc0NvbmZpZyAmJiBwYXJzZUNsYXNzQ29uZmlnLnF1ZXJ5KSB8fCB7fTtcbn07XG5cbmNvbnN0IGdldFF1ZXJ5ID0gYXN5bmMgKHBhcnNlQ2xhc3MsIF9zb3VyY2UsIGFyZ3MsIGNvbnRleHQsIHF1ZXJ5SW5mbykgPT4ge1xuICBsZXQgeyBpZCB9ID0gYXJncztcbiAgY29uc3QgeyBvcHRpb25zIH0gPSBhcmdzO1xuICBjb25zdCB7IHJlYWRQcmVmZXJlbmNlLCBpbmNsdWRlUmVhZFByZWZlcmVuY2UgfSA9IG9wdGlvbnMgfHwge307XG4gIGNvbnN0IHsgY29uZmlnLCBhdXRoLCBpbmZvIH0gPSBjb250ZXh0O1xuICBjb25zdCBzZWxlY3RlZEZpZWxkcyA9IGdldEZpZWxkTmFtZXMocXVlcnlJbmZvKTtcblxuICBjb25zdCBnbG9iYWxJZE9iamVjdCA9IGZyb21HbG9iYWxJZChpZCk7XG5cbiAgaWYgKGdsb2JhbElkT2JqZWN0LnR5cGUgPT09IHBhcnNlQ2xhc3MuY2xhc3NOYW1lKSB7XG4gICAgaWQgPSBnbG9iYWxJZE9iamVjdC5pZDtcbiAgfVxuXG4gIGNvbnN0IHsga2V5cywgaW5jbHVkZSB9ID0gZXh0cmFjdEtleXNBbmRJbmNsdWRlKHNlbGVjdGVkRmllbGRzKTtcblxuICByZXR1cm4gYXdhaXQgb2JqZWN0c1F1ZXJpZXMuZ2V0T2JqZWN0KFxuICAgIHBhcnNlQ2xhc3MuY2xhc3NOYW1lLFxuICAgIGlkLFxuICAgIGtleXMsXG4gICAgaW5jbHVkZSxcbiAgICByZWFkUHJlZmVyZW5jZSxcbiAgICBpbmNsdWRlUmVhZFByZWZlcmVuY2UsXG4gICAgY29uZmlnLFxuICAgIGF1dGgsXG4gICAgaW5mbyxcbiAgICBwYXJzZUNsYXNzXG4gICk7XG59O1xuXG5jb25zdCBsb2FkID0gZnVuY3Rpb24oXG4gIHBhcnNlR3JhcGhRTFNjaGVtYSxcbiAgcGFyc2VDbGFzcyxcbiAgcGFyc2VDbGFzc0NvbmZpZzogP1BhcnNlR3JhcGhRTENsYXNzQ29uZmlnXG4pIHtcbiAgY29uc3QgY2xhc3NOYW1lID0gcGFyc2VDbGFzcy5jbGFzc05hbWU7XG4gIGNvbnN0IGdyYXBoUUxDbGFzc05hbWUgPSB0cmFuc2Zvcm1DbGFzc05hbWVUb0dyYXBoUUwoY2xhc3NOYW1lKTtcbiAgY29uc3Qge1xuICAgIGdldDogaXNHZXRFbmFibGVkID0gdHJ1ZSxcbiAgICBmaW5kOiBpc0ZpbmRFbmFibGVkID0gdHJ1ZSxcbiAgICBnZXRBbGlhczogZ2V0QWxpYXMgPSAnJyxcbiAgICBmaW5kQWxpYXM6IGZpbmRBbGlhcyA9ICcnLFxuICB9ID0gZ2V0UGFyc2VDbGFzc1F1ZXJ5Q29uZmlnKHBhcnNlQ2xhc3NDb25maWcpO1xuXG4gIGNvbnN0IHtcbiAgICBjbGFzc0dyYXBoUUxPdXRwdXRUeXBlLFxuICAgIGNsYXNzR3JhcGhRTEZpbmRBcmdzLFxuICAgIGNsYXNzR3JhcGhRTEZpbmRSZXN1bHRUeXBlLFxuICB9ID0gcGFyc2VHcmFwaFFMU2NoZW1hLnBhcnNlQ2xhc3NUeXBlc1tjbGFzc05hbWVdO1xuXG4gIGlmIChpc0dldEVuYWJsZWQpIHtcbiAgICBjb25zdCBsb3dlckNhc2VDbGFzc05hbWUgPVxuICAgICAgZ3JhcGhRTENsYXNzTmFtZS5jaGFyQXQoMCkudG9Mb3dlckNhc2UoKSArIGdyYXBoUUxDbGFzc05hbWUuc2xpY2UoMSk7XG5cbiAgICBjb25zdCBnZXRHcmFwaFFMUXVlcnlOYW1lID0gZ2V0QWxpYXMgfHwgbG93ZXJDYXNlQ2xhc3NOYW1lO1xuXG4gICAgcGFyc2VHcmFwaFFMU2NoZW1hLmFkZEdyYXBoUUxRdWVyeShnZXRHcmFwaFFMUXVlcnlOYW1lLCB7XG4gICAgICBkZXNjcmlwdGlvbjogYFRoZSAke2dldEdyYXBoUUxRdWVyeU5hbWV9IHF1ZXJ5IGNhbiBiZSB1c2VkIHRvIGdldCBhbiBvYmplY3Qgb2YgdGhlICR7Z3JhcGhRTENsYXNzTmFtZX0gY2xhc3MgYnkgaXRzIGlkLmAsXG4gICAgICBhcmdzOiB7XG4gICAgICAgIGlkOiBkZWZhdWx0R3JhcGhRTFR5cGVzLkdMT0JBTF9PUl9PQkpFQ1RfSURfQVRULFxuICAgICAgICBvcHRpb25zOiBkZWZhdWx0R3JhcGhRTFR5cGVzLlJFQURfT1BUSU9OU19BVFQsXG4gICAgICB9LFxuICAgICAgdHlwZTogbmV3IEdyYXBoUUxOb25OdWxsKFxuICAgICAgICBjbGFzc0dyYXBoUUxPdXRwdXRUeXBlIHx8IGRlZmF1bHRHcmFwaFFMVHlwZXMuT0JKRUNUXG4gICAgICApLFxuICAgICAgYXN5bmMgcmVzb2x2ZShfc291cmNlLCBhcmdzLCBjb250ZXh0LCBxdWVyeUluZm8pIHtcbiAgICAgICAgdHJ5IHtcbiAgICAgICAgICByZXR1cm4gYXdhaXQgZ2V0UXVlcnkocGFyc2VDbGFzcywgX3NvdXJjZSwgYXJncywgY29udGV4dCwgcXVlcnlJbmZvKTtcbiAgICAgICAgfSBjYXRjaCAoZSkge1xuICAgICAgICAgIHBhcnNlR3JhcGhRTFNjaGVtYS5oYW5kbGVFcnJvcihlKTtcbiAgICAgICAgfVxuICAgICAgfSxcbiAgICB9KTtcbiAgfVxuXG4gIGlmIChpc0ZpbmRFbmFibGVkKSB7XG4gICAgY29uc3QgbG93ZXJDYXNlQ2xhc3NOYW1lID1cbiAgICAgIGdyYXBoUUxDbGFzc05hbWUuY2hhckF0KDApLnRvTG93ZXJDYXNlKCkgKyBncmFwaFFMQ2xhc3NOYW1lLnNsaWNlKDEpO1xuXG4gICAgY29uc3QgZmluZEdyYXBoUUxRdWVyeU5hbWUgPSBmaW5kQWxpYXMgfHwgcGx1cmFsaXplKGxvd2VyQ2FzZUNsYXNzTmFtZSk7XG5cbiAgICBwYXJzZUdyYXBoUUxTY2hlbWEuYWRkR3JhcGhRTFF1ZXJ5KGZpbmRHcmFwaFFMUXVlcnlOYW1lLCB7XG4gICAgICBkZXNjcmlwdGlvbjogYFRoZSAke2ZpbmRHcmFwaFFMUXVlcnlOYW1lfSBxdWVyeSBjYW4gYmUgdXNlZCB0byBmaW5kIG9iamVjdHMgb2YgdGhlICR7Z3JhcGhRTENsYXNzTmFtZX0gY2xhc3MuYCxcbiAgICAgIGFyZ3M6IGNsYXNzR3JhcGhRTEZpbmRBcmdzLFxuICAgICAgdHlwZTogbmV3IEdyYXBoUUxOb25OdWxsKFxuICAgICAgICBjbGFzc0dyYXBoUUxGaW5kUmVzdWx0VHlwZSB8fCBkZWZhdWx0R3JhcGhRTFR5cGVzLk9CSkVDVFxuICAgICAgKSxcbiAgICAgIGFzeW5jIHJlc29sdmUoX3NvdXJjZSwgYXJncywgY29udGV4dCwgcXVlcnlJbmZvKSB7XG4gICAgICAgIHRyeSB7XG4gICAgICAgICAgY29uc3Qge1xuICAgICAgICAgICAgd2hlcmUsXG4gICAgICAgICAgICBvcmRlcixcbiAgICAgICAgICAgIHNraXAsXG4gICAgICAgICAgICBmaXJzdCxcbiAgICAgICAgICAgIGFmdGVyLFxuICAgICAgICAgICAgbGFzdCxcbiAgICAgICAgICAgIGJlZm9yZSxcbiAgICAgICAgICAgIG9wdGlvbnMsXG4gICAgICAgICAgfSA9IGFyZ3M7XG4gICAgICAgICAgY29uc3Qge1xuICAgICAgICAgICAgcmVhZFByZWZlcmVuY2UsXG4gICAgICAgICAgICBpbmNsdWRlUmVhZFByZWZlcmVuY2UsXG4gICAgICAgICAgICBzdWJxdWVyeVJlYWRQcmVmZXJlbmNlLFxuICAgICAgICAgIH0gPSBvcHRpb25zIHx8IHt9O1xuICAgICAgICAgIGNvbnN0IHsgY29uZmlnLCBhdXRoLCBpbmZvIH0gPSBjb250ZXh0O1xuICAgICAgICAgIGNvbnN0IHNlbGVjdGVkRmllbGRzID0gZ2V0RmllbGROYW1lcyhxdWVyeUluZm8pO1xuXG4gICAgICAgICAgY29uc3QgeyBrZXlzLCBpbmNsdWRlIH0gPSBleHRyYWN0S2V5c0FuZEluY2x1ZGUoXG4gICAgICAgICAgICBzZWxlY3RlZEZpZWxkc1xuICAgICAgICAgICAgICAuZmlsdGVyKGZpZWxkID0+IGZpZWxkLnN0YXJ0c1dpdGgoJ2VkZ2VzLm5vZGUuJykpXG4gICAgICAgICAgICAgIC5tYXAoZmllbGQgPT4gZmllbGQucmVwbGFjZSgnZWRnZXMubm9kZS4nLCAnJykpXG4gICAgICAgICAgKTtcbiAgICAgICAgICBjb25zdCBwYXJzZU9yZGVyID0gb3JkZXIgJiYgb3JkZXIuam9pbignLCcpO1xuXG4gICAgICAgICAgcmV0dXJuIGF3YWl0IG9iamVjdHNRdWVyaWVzLmZpbmRPYmplY3RzKFxuICAgICAgICAgICAgY2xhc3NOYW1lLFxuICAgICAgICAgICAgd2hlcmUsXG4gICAgICAgICAgICBwYXJzZU9yZGVyLFxuICAgICAgICAgICAgc2tpcCxcbiAgICAgICAgICAgIGZpcnN0LFxuICAgICAgICAgICAgYWZ0ZXIsXG4gICAgICAgICAgICBsYXN0LFxuICAgICAgICAgICAgYmVmb3JlLFxuICAgICAgICAgICAga2V5cyxcbiAgICAgICAgICAgIGluY2x1ZGUsXG4gICAgICAgICAgICBmYWxzZSxcbiAgICAgICAgICAgIHJlYWRQcmVmZXJlbmNlLFxuICAgICAgICAgICAgaW5jbHVkZVJlYWRQcmVmZXJlbmNlLFxuICAgICAgICAgICAgc3VicXVlcnlSZWFkUHJlZmVyZW5jZSxcbiAgICAgICAgICAgIGNvbmZpZyxcbiAgICAgICAgICAgIGF1dGgsXG4gICAgICAgICAgICBpbmZvLFxuICAgICAgICAgICAgc2VsZWN0ZWRGaWVsZHMsXG4gICAgICAgICAgICBwYXJzZUdyYXBoUUxTY2hlbWEucGFyc2VDbGFzc2VzXG4gICAgICAgICAgKTtcbiAgICAgICAgfSBjYXRjaCAoZSkge1xuICAgICAgICAgIHBhcnNlR3JhcGhRTFNjaGVtYS5oYW5kbGVFcnJvcihlKTtcbiAgICAgICAgfVxuICAgICAgfSxcbiAgICB9KTtcbiAgfVxufTtcblxuZXhwb3J0IHsgbG9hZCB9O1xuIl19