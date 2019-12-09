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

const getQuery = async (className, _source, args, context, queryInfo) => {
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

  if (globalIdObject.type === className) {
    id = globalIdObject.id;
  }

  const {
    keys,
    include
  } = (0, _parseGraphQLUtils.extractKeysAndInclude)(selectedFields);
  return await objectsQueries.getObject(className, id, keys, include, readPreference, includeReadPreference, config, auth, info);
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
          return await getQuery(className, _source, args, context, queryInfo);
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
//# sourceMappingURL=data:application/json;charset=utf-8;base64,eyJ2ZXJzaW9uIjozLCJzb3VyY2VzIjpbIi4uLy4uLy4uL3NyYy9HcmFwaFFML2xvYWRlcnMvcGFyc2VDbGFzc1F1ZXJpZXMuanMiXSwibmFtZXMiOlsiZ2V0UGFyc2VDbGFzc1F1ZXJ5Q29uZmlnIiwicGFyc2VDbGFzc0NvbmZpZyIsInF1ZXJ5IiwiZ2V0UXVlcnkiLCJjbGFzc05hbWUiLCJfc291cmNlIiwiYXJncyIsImNvbnRleHQiLCJxdWVyeUluZm8iLCJpZCIsIm9wdGlvbnMiLCJyZWFkUHJlZmVyZW5jZSIsImluY2x1ZGVSZWFkUHJlZmVyZW5jZSIsImNvbmZpZyIsImF1dGgiLCJpbmZvIiwic2VsZWN0ZWRGaWVsZHMiLCJnbG9iYWxJZE9iamVjdCIsInR5cGUiLCJrZXlzIiwiaW5jbHVkZSIsIm9iamVjdHNRdWVyaWVzIiwiZ2V0T2JqZWN0IiwibG9hZCIsInBhcnNlR3JhcGhRTFNjaGVtYSIsInBhcnNlQ2xhc3MiLCJncmFwaFFMQ2xhc3NOYW1lIiwiZ2V0IiwiaXNHZXRFbmFibGVkIiwiZmluZCIsImlzRmluZEVuYWJsZWQiLCJnZXRBbGlhcyIsImZpbmRBbGlhcyIsImNsYXNzR3JhcGhRTE91dHB1dFR5cGUiLCJjbGFzc0dyYXBoUUxGaW5kQXJncyIsImNsYXNzR3JhcGhRTEZpbmRSZXN1bHRUeXBlIiwicGFyc2VDbGFzc1R5cGVzIiwibG93ZXJDYXNlQ2xhc3NOYW1lIiwiY2hhckF0IiwidG9Mb3dlckNhc2UiLCJzbGljZSIsImdldEdyYXBoUUxRdWVyeU5hbWUiLCJhZGRHcmFwaFFMUXVlcnkiLCJkZXNjcmlwdGlvbiIsImRlZmF1bHRHcmFwaFFMVHlwZXMiLCJHTE9CQUxfT1JfT0JKRUNUX0lEX0FUVCIsIlJFQURfT1BUSU9OU19BVFQiLCJHcmFwaFFMTm9uTnVsbCIsIk9CSkVDVCIsInJlc29sdmUiLCJlIiwiaGFuZGxlRXJyb3IiLCJmaW5kR3JhcGhRTFF1ZXJ5TmFtZSIsIndoZXJlIiwib3JkZXIiLCJza2lwIiwiZmlyc3QiLCJhZnRlciIsImxhc3QiLCJiZWZvcmUiLCJzdWJxdWVyeVJlYWRQcmVmZXJlbmNlIiwiZmlsdGVyIiwiZmllbGQiLCJzdGFydHNXaXRoIiwibWFwIiwicmVwbGFjZSIsInBhcnNlT3JkZXIiLCJqb2luIiwiZmluZE9iamVjdHMiLCJwYXJzZUNsYXNzZXMiXSwibWFwcGluZ3MiOiI7Ozs7Ozs7QUFBQTs7QUFDQTs7QUFDQTs7QUFDQTs7QUFDQTs7QUFDQTs7QUFDQTs7QUFDQTs7QUFDQTs7Ozs7Ozs7QUFFQSxNQUFNQSx3QkFBd0IsR0FBRyxVQUMvQkMsZ0JBRCtCLEVBRS9CO0FBQ0EsU0FBUUEsZ0JBQWdCLElBQUlBLGdCQUFnQixDQUFDQyxLQUF0QyxJQUFnRCxFQUF2RDtBQUNELENBSkQ7O0FBTUEsTUFBTUMsUUFBUSxHQUFHLE9BQU9DLFNBQVAsRUFBa0JDLE9BQWxCLEVBQTJCQyxJQUEzQixFQUFpQ0MsT0FBakMsRUFBMENDLFNBQTFDLEtBQXdEO0FBQ3ZFLE1BQUk7QUFBRUMsSUFBQUE7QUFBRixNQUFTSCxJQUFiO0FBQ0EsUUFBTTtBQUFFSSxJQUFBQTtBQUFGLE1BQWNKLElBQXBCO0FBQ0EsUUFBTTtBQUFFSyxJQUFBQSxjQUFGO0FBQWtCQyxJQUFBQTtBQUFsQixNQUE0Q0YsT0FBTyxJQUFJLEVBQTdEO0FBQ0EsUUFBTTtBQUFFRyxJQUFBQSxNQUFGO0FBQVVDLElBQUFBLElBQVY7QUFBZ0JDLElBQUFBO0FBQWhCLE1BQXlCUixPQUEvQjtBQUNBLFFBQU1TLGNBQWMsR0FBRyxnQ0FBY1IsU0FBZCxDQUF2QjtBQUVBLFFBQU1TLGNBQWMsR0FBRyxnQ0FBYVIsRUFBYixDQUF2Qjs7QUFFQSxNQUFJUSxjQUFjLENBQUNDLElBQWYsS0FBd0JkLFNBQTVCLEVBQXVDO0FBQ3JDSyxJQUFBQSxFQUFFLEdBQUdRLGNBQWMsQ0FBQ1IsRUFBcEI7QUFDRDs7QUFFRCxRQUFNO0FBQUVVLElBQUFBLElBQUY7QUFBUUMsSUFBQUE7QUFBUixNQUFvQiw4Q0FBc0JKLGNBQXRCLENBQTFCO0FBRUEsU0FBTyxNQUFNSyxjQUFjLENBQUNDLFNBQWYsQ0FDWGxCLFNB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LEVBbUJYUSxrQkFBa0IsQ0FBQzZDLFlBbkJSLENBQWI7QUFxQkQsU0EvQ0QsQ0ErQ0UsT0FBT25CLENBQVAsRUFBVTtBQUNWMUIsVUFBQUEsa0JBQWtCLENBQUMyQixXQUFuQixDQUErQkQsQ0FBL0I7QUFDRDtBQUNGOztBQXpEc0QsS0FBekQ7QUEyREQ7QUFDRixDQS9HRCIsInNvdXJjZXNDb250ZW50IjpbImltcG9ydCB7IEdyYXBoUUxOb25OdWxsIH0gZnJvbSAnZ3JhcGhxbCc7XG5pbXBvcnQgeyBmcm9tR2xvYmFsSWQgfSBmcm9tICdncmFwaHFsLXJlbGF5JztcbmltcG9ydCBnZXRGaWVsZE5hbWVzIGZyb20gJ2dyYXBocWwtbGlzdC1maWVsZHMnO1xuaW1wb3J0IHBsdXJhbGl6ZSBmcm9tICdwbHVyYWxpemUnO1xuaW1wb3J0ICogYXMgZGVmYXVsdEdyYXBoUUxUeXBlcyBmcm9tICcuL2RlZmF1bHRHcmFwaFFMVHlwZXMnO1xuaW1wb3J0ICogYXMgb2JqZWN0c1F1ZXJpZXMgZnJvbSAnLi4vaGVscGVycy9vYmplY3RzUXVlcmllcyc7XG5pbXBvcnQgeyBQYXJzZUdyYXBoUUxDbGFzc0NvbmZpZyB9IGZyb20gJy4uLy4uL0NvbnRyb2xsZXJzL1BhcnNlR3JhcGhRTENvbnRyb2xsZXInO1xuaW1wb3J0IHsgdHJhbnNmb3JtQ2xhc3NOYW1lVG9HcmFwaFFMIH0gZnJvbSAnLi4vdHJhbnNmb3JtZXJzL2NsYXNzTmFtZSc7XG5pbXBvcnQgeyBleHRyYWN0S2V5c0FuZEluY2x1ZGUgfSBmcm9tICcuLi9wYXJzZUdyYXBoUUxVdGlscyc7XG5cbmNvbnN0IGdldFBhcnNlQ2xhc3NRdWVyeUNvbmZpZyA9IGZ1bmN0aW9uKFxuICBwYXJzZUNsYXNzQ29uZmlnOiA/UGFyc2VHcmFwaFFMQ2xhc3NDb25maWdcbikge1xuICByZXR1cm4gKHBhcnNlQ2xhc3NDb25maWcgJiYgcGFyc2VDbGFzc0NvbmZpZy5xdWVyeSkgfHwge307XG59O1xuXG5jb25zdCBnZXRRdWVyeSA9IGFzeW5jIChjbGFzc05hbWUsIF9zb3VyY2UsIGFyZ3MsIGNvbnRleHQsIHF1ZXJ5SW5mbykgPT4ge1xuICBsZXQgeyBpZCB9ID0gYXJncztcbiAgY29uc3QgeyBvcHRpb25zIH0gPSBhcmdzO1xuICBjb25zdCB7IHJlYWRQcmVmZXJlbmNlLCBpbmNsdWRlUmVhZFByZWZlcmVuY2UgfSA9IG9wdGlvbnMgfHwge307XG4gIGNvbnN0IHsgY29uZmlnLCBhdXRoLCBpbmZvIH0gPSBjb250ZXh0O1xuICBjb25zdCBzZWxlY3RlZEZpZWxkcyA9IGdldEZpZWxkTmFtZXMocXVlcnlJbmZvKTtcblxuICBjb25zdCBnbG9iYWxJZE9iamVjdCA9IGZyb21HbG9iYWxJZChpZCk7XG5cbiAgaWYgKGdsb2JhbElkT2JqZWN0LnR5cGUgPT09IGNsYXNzTmFtZSkge1xuICAgIGlkID0gZ2xvYmFsSWRPYmplY3QuaWQ7XG4gIH1cblxuICBjb25zdCB7IGtleXMsIGluY2x1ZGUgfSA9IGV4dHJhY3RLZXlzQW5kSW5jbHVkZShzZWxlY3RlZEZpZWxkcyk7XG5cbiAgcmV0dXJuIGF3YWl0IG9iamVjdHNRdWVyaWVzLmdldE9iamVjdChcbiAgICBjbGFzc05hbWUsXG4gICAgaWQsXG4gICAga2V5cyxcbiAgICBpbmNsdWRlLFxuICAgIHJlYWRQcmVmZXJlbmNlLFxuICAgIGluY2x1ZGVSZWFkUHJlZmVyZW5jZSxcbiAgICBjb25maWcsXG4gICAgYXV0aCxcbiAgICBpbmZvXG4gICk7XG59O1xuXG5jb25zdCBsb2FkID0gZnVuY3Rpb24oXG4gIHBhcnNlR3JhcGhRTFNjaGVtYSxcbiAgcGFyc2VDbGFzcyxcbiAgcGFyc2VDbGFzc0NvbmZpZzogP1BhcnNlR3JhcGhRTENsYXNzQ29uZmlnXG4pIHtcbiAgY29uc3QgY2xhc3NOYW1lID0gcGFyc2VDbGFzcy5jbGFzc05hbWU7XG4gIGNvbnN0IGdyYXBoUUxDbGFzc05hbWUgPSB0cmFuc2Zvcm1DbGFzc05hbWVUb0dyYXBoUUwoY2xhc3NOYW1lKTtcbiAgY29uc3Qge1xuICAgIGdldDogaXNHZXRFbmFibGVkID0gdHJ1ZSxcbiAgICBmaW5kOiBpc0ZpbmRFbmFibGVkID0gdHJ1ZSxcbiAgICBnZXRBbGlhczogZ2V0QWxpYXMgPSAnJyxcbiAgICBmaW5kQWxpYXM6IGZpbmRBbGlhcyA9ICcnLFxuICB9ID0gZ2V0UGFyc2VDbGFzc1F1ZXJ5Q29uZmlnKHBhcnNlQ2xhc3NDb25maWcpO1xuXG4gIGNvbnN0IHtcbiAgICBjbGFzc0dyYXBoUUxPdXRwdXRUeXBlLFxuICAgIGNsYXNzR3JhcGhRTEZpbmRBcmdzLFxuICAgIGNsYXNzR3JhcGhRTEZpbmRSZXN1bHRUeXBlLFxuICB9ID0gcGFyc2VHcmFwaFFMU2NoZW1hLnBhcnNlQ2xhc3NUeXBlc1tjbGFzc05hbWVdO1xuXG4gIGlmIChpc0dldEVuYWJsZWQpIHtcbiAgICBjb25zdCBsb3dlckNhc2VDbGFzc05hbWUgPVxuICAgICAgZ3JhcGhRTENsYXNzTmFtZS5jaGFyQXQoMCkudG9Mb3dlckNhc2UoKSArIGdyYXBoUUxDbGFzc05hbWUuc2xpY2UoMSk7XG5cbiAgICBjb25zdCBnZXRHcmFwaFFMUXVlcnlOYW1lID0gZ2V0QWxpYXMgfHwgbG93ZXJDYXNlQ2xhc3NOYW1lO1xuXG4gICAgcGFyc2VHcmFwaFFMU2NoZW1hLmFkZEdyYXBoUUxRdWVyeShnZXRHcmFwaFFMUXVlcnlOYW1lLCB7XG4gICAgICBkZXNjcmlwdGlvbjogYFRoZSAke2dldEdyYXBoUUxRdWVyeU5hbWV9IHF1ZXJ5IGNhbiBiZSB1c2VkIHRvIGdldCBhbiBvYmplY3Qgb2YgdGhlICR7Z3JhcGhRTENsYXNzTmFtZX0gY2xhc3MgYnkgaXRzIGlkLmAsXG4gICAgICBhcmdzOiB7XG4gICAgICAgIGlkOiBkZWZhdWx0R3JhcGhRTFR5cGVzLkdMT0JBTF9PUl9PQkpFQ1RfSURfQVRULFxuICAgICAgICBvcHRpb25zOiBkZWZhdWx0R3JhcGhRTFR5cGVzLlJFQURfT1BUSU9OU19BVFQsXG4gICAgICB9LFxuICAgICAgdHlwZTogbmV3IEdyYXBoUUxOb25OdWxsKFxuICAgICAgICBjbGFzc0dyYXBoUUxPdXRwdXRUeXBlIHx8IGRlZmF1bHRHcmFwaFFMVHlwZXMuT0JKRUNUXG4gICAgICApLFxuICAgICAgYXN5bmMgcmVzb2x2ZShfc291cmNlLCBhcmdzLCBjb250ZXh0LCBxdWVyeUluZm8pIHtcbiAgICAgICAgdHJ5IHtcbiAgICAgICAgICByZXR1cm4gYXdhaXQgZ2V0UXVlcnkoY2xhc3NOYW1lLCBfc291cmNlLCBhcmdzLCBjb250ZXh0LCBxdWVyeUluZm8pO1xuICAgICAgICB9IGNhdGNoIChlKSB7XG4gICAgICAgICAgcGFyc2VHcmFwaFFMU2NoZW1hLmhhbmRsZUVycm9yKGUpO1xuICAgICAgICB9XG4gICAgICB9LFxuICAgIH0pO1xuICB9XG5cbiAgaWYgKGlzRmluZEVuYWJsZWQpIHtcbiAgICBjb25zdCBsb3dlckNhc2VDbGFzc05hbWUgPVxuICAgICAgZ3JhcGhRTENsYXNzTmFtZS5jaGFyQXQoMCkudG9Mb3dlckNhc2UoKSArIGdyYXBoUUxDbGFzc05hbWUuc2xpY2UoMSk7XG5cbiAgICBjb25zdCBmaW5kR3JhcGhRTFF1ZXJ5TmFtZSA9IGZpbmRBbGlhcyB8fCBwbHVyYWxpemUobG93ZXJDYXNlQ2xhc3NOYW1lKTtcblxuICAgIHBhcnNlR3JhcGhRTFNjaGVtYS5hZGRHcmFwaFFMUXVlcnkoZmluZEdyYXBoUUxRdWVyeU5hbWUsIHtcbiAgICAgIGRlc2NyaXB0aW9uOiBgVGhlICR7ZmluZEdyYXBoUUxRdWVyeU5hbWV9IHF1ZXJ5IGNhbiBiZSB1c2VkIHRvIGZpbmQgb2JqZWN0cyBvZiB0aGUgJHtncmFwaFFMQ2xhc3NOYW1lfSBjbGFzcy5gLFxuICAgICAgYXJnczogY2xhc3NHcmFwaFFMRmluZEFyZ3MsXG4gICAgICB0eXBlOiBuZXcgR3JhcGhRTE5vbk51bGwoXG4gICAgICAgIGNsYXNzR3JhcGhRTEZpbmRSZXN1bHRUeXBlIHx8IGRlZmF1bHRHcmFwaFFMVHlwZXMuT0JKRUNUXG4gICAgICApLFxuICAgICAgYXN5bmMgcmVzb2x2ZShfc291cmNlLCBhcmdzLCBjb250ZXh0LCBxdWVyeUluZm8pIHtcbiAgICAgICAgdHJ5IHtcbiAgICAgICAgICBjb25zdCB7XG4gICAgICAgICAgICB3aGVyZSxcbiAgICAgICAgICAgIG9yZGVyLFxuICAgICAgICAgICAgc2tpcCxcbiAgICAgICAgICAgIGZpcnN0LFxuICAgICAgICAgICAgYWZ0ZXIsXG4gICAgICAgICAgICBsYXN0LFxuICAgICAgICAgICAgYmVmb3JlLFxuICAgICAgICAgICAgb3B0aW9ucyxcbiAgICAgICAgICB9ID0gYXJncztcbiAgICAgICAgICBjb25zdCB7XG4gICAgICAgICAgICByZWFkUHJlZmVyZW5jZSxcbiAgICAgICAgICAgIGluY2x1ZGVSZWFkUHJlZmVyZW5jZSxcbiAgICAgICAgICAgIHN1YnF1ZXJ5UmVhZFByZWZlcmVuY2UsXG4gICAgICAgICAgfSA9IG9wdGlvbnMgfHwge307XG4gICAgICAgICAgY29uc3QgeyBjb25maWcsIGF1dGgsIGluZm8gfSA9IGNvbnRleHQ7XG4gICAgICAgICAgY29uc3Qgc2VsZWN0ZWRGaWVsZHMgPSBnZXRGaWVsZE5hbWVzKHF1ZXJ5SW5mbyk7XG5cbiAgICAgICAgICBjb25zdCB7IGtleXMsIGluY2x1ZGUgfSA9IGV4dHJhY3RLZXlzQW5kSW5jbHVkZShcbiAgICAgICAgICAgIHNlbGVjdGVkRmllbGRzXG4gICAgICAgICAgICAgIC5maWx0ZXIoZmllbGQgPT4gZmllbGQuc3RhcnRzV2l0aCgnZWRnZXMubm9kZS4nKSlcbiAgICAgICAgICAgICAgLm1hcChmaWVsZCA9PiBmaWVsZC5yZXBsYWNlKCdlZGdlcy5ub2RlLicsICcnKSlcbiAgICAgICAgICApO1xuICAgICAgICAgIGNvbnN0IHBhcnNlT3JkZXIgPSBvcmRlciAmJiBvcmRlci5qb2luKCcsJyk7XG5cbiAgICAgICAgICByZXR1cm4gYXdhaXQgb2JqZWN0c1F1ZXJpZXMuZmluZE9iamVjdHMoXG4gICAgICAgICAgICBjbGFzc05hbWUsXG4gICAgICAgICAgICB3aGVyZSxcbiAgICAgICAgICAgIHBhcnNlT3JkZXIsXG4gICAgICAgICAgICBza2lwLFxuICAgICAgICAgICAgZmlyc3QsXG4gICAgICAgICAgICBhZnRlcixcbiAgICAgICAgICAgIGxhc3QsXG4gICAgICAgICAgICBiZWZvcmUsXG4gICAgICAgICAgICBrZXlzLFxuICAgICAgICAgICAgaW5jbHVkZSxcbiAgICAgICAgICAgIGZhbHNlLFxuICAgICAgICAgICAgcmVhZFByZWZlcmVuY2UsXG4gICAgICAgICAgICBpbmNsdWRlUmVhZFByZWZlcmVuY2UsXG4gICAgICAgICAgICBzdWJxdWVyeVJlYWRQcmVmZXJlbmNlLFxuICAgICAgICAgICAgY29uZmlnLFxuICAgICAgICAgICAgYXV0aCxcbiAgICAgICAgICAgIGluZm8sXG4gICAgICAgICAgICBzZWxlY3RlZEZpZWxkcyxcbiAgICAgICAgICAgIHBhcnNlR3JhcGhRTFNjaGVtYS5wYXJzZUNsYXNzZXNcbiAgICAgICAgICApO1xuICAgICAgICB9IGNhdGNoIChlKSB7XG4gICAgICAgICAgcGFyc2VHcmFwaFFMU2NoZW1hLmhhbmRsZUVycm9yKGUpO1xuICAgICAgICB9XG4gICAgICB9LFxuICAgIH0pO1xuICB9XG59O1xuXG5leHBvcnQgeyBsb2FkIH07XG4iXX0=