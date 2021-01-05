"use strict";

Object.defineProperty(exports, "__esModule", {
  value: true
});
exports.transformOutputTypeToGraphQL = void 0;

var defaultGraphQLTypes = _interopRequireWildcard(require("../loaders/defaultGraphQLTypes"));

var _graphql = require("graphql");

function _getRequireWildcardCache() { if (typeof WeakMap !== "function") return null; var cache = new WeakMap(); _getRequireWildcardCache = function () { return cache; }; return cache; }

function _interopRequireWildcard(obj) { if (obj && obj.__esModule) { return obj; } if (obj === null || typeof obj !== "object" && typeof obj !== "function") { return { default: obj }; } var cache = _getRequireWildcardCache(); if (cache && cache.has(obj)) { return cache.get(obj); } var newObj = {}; var hasPropertyDescriptor = Object.defineProperty && Object.getOwnPropertyDescriptor; for (var key in obj) { if (Object.prototype.hasOwnProperty.call(obj, key)) { var desc = hasPropertyDescriptor ? Object.getOwnPropertyDescriptor(obj, key) : null; if (desc && (desc.get || desc.set)) { Object.defineProperty(newObj, key, desc); } else { newObj[key] = obj[key]; } } } newObj.default = obj; if (cache) { cache.set(obj, newObj); } return newObj; }

const transformOutputTypeToGraphQL = (parseType, targetClass, parseClassTypes) => {
  switch (parseType) {
    case 'String':
      return _graphql.GraphQLString;

    case 'Number':
      return _graphql.GraphQLFloat;

    case 'Boolean':
      return _graphql.GraphQLBoolean;

    case 'Array':
      return new _graphql.GraphQLList(defaultGraphQLTypes.ARRAY_RESULT);

    case 'Object':
      return defaultGraphQLTypes.OBJECT;

    case 'Date':
      return defaultGraphQLTypes.DATE;

    case 'Pointer':
      if (parseClassTypes && parseClassTypes[targetClass] && parseClassTypes[targetClass].classGraphQLOutputType) {
        return parseClassTypes[targetClass].classGraphQLOutputType;
      } else {
        return defaultGraphQLTypes.OBJECT;
      }

    case 'Relation':
      if (parseClassTypes && parseClassTypes[targetClass] && parseClassTypes[targetClass].classGraphQLFindResultType) {
        return new _graphql.GraphQLNonNull(parseClassTypes[targetClass].classGraphQLFindResultType);
      } else {
        return new _graphql.GraphQLNonNull(defaultGraphQLTypes.OBJECT);
      }

    case 'File':
      return defaultGraphQLTypes.FILE_INFO;

    case 'GeoPoint':
      return defaultGraphQLTypes.GEO_POINT;

    case 'Polygon':
      return defaultGraphQLTypes.POLYGON;

    case 'Bytes':
      return defaultGraphQLTypes.BYTES;

    case 'ACL':
      return new _graphql.GraphQLNonNull(defaultGraphQLTypes.ACL);

    default:
      return undefined;
  }
};

exports.transformOutputTypeToGraphQL = transformOutputTypeToGraphQL;
//# sourceMappingURL=data:application/json;charset=utf-8;base64,eyJ2ZXJzaW9uIjozLCJzb3VyY2VzIjpbIi4uLy4uLy4uL3NyYy9HcmFwaFFML3RyYW5zZm9ybWVycy9vdXRwdXRUeXBlLmpzIl0sIm5hbWVzIjpbInRyYW5zZm9ybU91dHB1dFR5cGVUb0dyYXBoUUwiLCJwYXJzZVR5cGUiLCJ0YXJnZXRDbGFzcyIsInBhcnNlQ2xhc3NUeXBlcyIsIkdyYXBoUUxTdHJpbmciLCJHcmFwaFFMRmxvYXQiLCJHcmFwaFFMQm9vbGVhbiIsIkdyYXBoUUxMaXN0IiwiZGVmYXVsdEdyYXBoUUxUeXBlcyIsIkFSUkFZX1JFU1VMVCIsIk9CSkVDVCIsIkRBVEUiLCJjbGFzc0dyYXBoUUxPdXRwdXRUeXBlIiwiY2xhc3NHcmFwaFFMRmluZFJlc3VsdFR5cGUiLCJHcmFwaFFMTm9uTnVsbCIsIkZJTEVfSU5GTyIsIkdFT19QT0lOVCIsIlBPTFlHT04iLCJCWVRFUyIsIkFDTCIsInVuZGVmaW5lZCJdLCJtYXBwaW5ncyI6Ijs7Ozs7OztBQUFBOztBQUNBOzs7Ozs7QUFFQSxNQUFNQSw0QkFBNEIsR0FBRyxDQUFDQyxTQUFELEVBQVlDLFdBQVosRUFBeUJDLGVBQXpCLEtBQTZDO0FBQ2hGLFVBQVFGLFNBQVI7QUFDRSxTQUFLLFFBQUw7QUFDRSxhQUFPRyxzQkFBUDs7QUFDRixTQUFLLFFBQUw7QUFDRSxhQUFPQyxxQkFBUDs7QUFDRixTQUFLLFNBQUw7QUFDRSxhQUFPQyx1QkFBUDs7QUFDRixTQUFLLE9BQUw7QUFDRSxhQUFPLElBQUlDLG9CQUFKLENBQWdCQyxtQkFBbUIsQ0FBQ0MsWUFBcEMsQ0FBUDs7QUFDRixTQUFLLFFBQUw7QUFDRSxhQUFPRCxtQkFBbUIsQ0FBQ0UsTUFBM0I7O0FBQ0YsU0FBSyxNQUFMO0FBQ0UsYUFBT0YsbUJBQW1CLENBQUNHLElBQTNCOztBQUNGLFNBQUssU0FBTDtBQUNFLFVBQ0VSLGVBQWUsSUFDZkEsZUFBZSxDQUFDRCxXQUFELENBRGYsSUFFQUMsZUFBZSxDQUFDRCxXQUFELENBQWYsQ0FBNkJVLHNCQUgvQixFQUlFO0FBQ0EsZUFBT1QsZUFBZSxDQUFDRCxXQUFELENBQWYsQ0FBNkJVLHNCQUFwQztBQUNELE9BTkQsTUFNTztBQUNMLGVBQU9KLG1CQUFtQixDQUFDRSxNQUEzQjtBQUNEOztBQUNILFNBQUssVUFBTDtBQUNFLFVBQ0VQLGVBQWUsSUFDZkEsZUFBZSxDQUFDRCxXQUFELENBRGYsSUFFQUMsZUFBZSxDQUFDRCxXQUFELENBQWYsQ0FBNkJXLDBCQUgvQixFQUlFO0FBQ0EsZUFBTyxJQUFJQyx1QkFBSixDQUFtQlgsZUFBZSxDQUFDRCxXQUFELENBQWYsQ0FBNkJXLDBCQUFoRCxDQUFQO0FBQ0QsT0FORCxNQU1PO0FBQ0wsZUFBTyxJQUFJQyx1QkFBSixDQUFtQk4sbUJBQW1CLENBQUNFLE1BQXZDLENBQVA7QUFDRDs7QUFDSCxTQUFLLE1BQUw7QUFDRSxhQUFPRixtQkFBbUIsQ0FBQ08sU0FBM0I7O0FBQ0YsU0FBSyxVQUFMO0FBQ0UsYUFBT1AsbUJBQW1CLENBQUNRLFNBQTNCOztBQUNGLFNBQUssU0FBTDtBQUNFLGFBQU9SLG1CQUFtQixDQUFDUyxPQUEzQjs7QUFDRixTQUFLLE9BQUw7QUFDRSxhQUFPVCxtQkFBbUIsQ0FBQ1UsS0FBM0I7O0FBQ0YsU0FBSyxLQUFMO0FBQ0UsYUFBTyxJQUFJSix1QkFBSixDQUFtQk4sbUJBQW1CLENBQUNXLEdBQXZDLENBQVA7O0FBQ0Y7QUFDRSxhQUFPQyxTQUFQO0FBNUNKO0FBOENELENBL0NEIiwic291cmNlc0NvbnRlbnQiOlsiaW1wb3J0ICogYXMgZGVmYXVsdEdyYXBoUUxUeXBlcyBmcm9tICcuLi9sb2FkZXJzL2RlZmF1bHRHcmFwaFFMVHlwZXMnO1xuaW1wb3J0IHsgR3JhcGhRTFN0cmluZywgR3JhcGhRTEZsb2F0LCBHcmFwaFFMQm9vbGVhbiwgR3JhcGhRTExpc3QsIEdyYXBoUUxOb25OdWxsIH0gZnJvbSAnZ3JhcGhxbCc7XG5cbmNvbnN0IHRyYW5zZm9ybU91dHB1dFR5cGVUb0dyYXBoUUwgPSAocGFyc2VUeXBlLCB0YXJnZXRDbGFzcywgcGFyc2VDbGFzc1R5cGVzKSA9PiB7XG4gIHN3aXRjaCAocGFyc2VUeXBlKSB7XG4gICAgY2FzZSAnU3RyaW5nJzpcbiAgICAgIHJldHVybiBHcmFwaFFMU3RyaW5nO1xuICAgIGNhc2UgJ051bWJlcic6XG4gICAgICByZXR1cm4gR3JhcGhRTEZsb2F0O1xuICAgIGNhc2UgJ0Jvb2xlYW4nOlxuICAgICAgcmV0dXJuIEdyYXBoUUxCb29sZWFuO1xuICAgIGNhc2UgJ0FycmF5JzpcbiAgICAgIHJldHVybiBuZXcgR3JhcGhRTExpc3QoZGVmYXVsdEdyYXBoUUxUeXBlcy5BUlJBWV9SRVNVTFQpO1xuICAgIGNhc2UgJ09iamVjdCc6XG4gICAgICByZXR1cm4gZGVmYXVsdEdyYXBoUUxUeXBlcy5PQkpFQ1Q7XG4gICAgY2FzZSAnRGF0ZSc6XG4gICAgICByZXR1cm4gZGVmYXVsdEdyYXBoUUxUeXBlcy5EQVRFO1xuICAgIGNhc2UgJ1BvaW50ZXInOlxuICAgICAgaWYgKFxuICAgICAgICBwYXJzZUNsYXNzVHlwZXMgJiZcbiAgICAgICAgcGFyc2VDbGFzc1R5cGVzW3RhcmdldENsYXNzXSAmJlxuICAgICAgICBwYXJzZUNsYXNzVHlwZXNbdGFyZ2V0Q2xhc3NdLmNsYXNzR3JhcGhRTE91dHB1dFR5cGVcbiAgICAgICkge1xuICAgICAgICByZXR1cm4gcGFyc2VDbGFzc1R5cGVzW3RhcmdldENsYXNzXS5jbGFzc0dyYXBoUUxPdXRwdXRUeXBlO1xuICAgICAgfSBlbHNlIHtcbiAgICAgICAgcmV0dXJuIGRlZmF1bHRHcmFwaFFMVHlwZXMuT0JKRUNUO1xuICAgICAgfVxuICAgIGNhc2UgJ1JlbGF0aW9uJzpcbiAgICAgIGlmIChcbiAgICAgICAgcGFyc2VDbGFzc1R5cGVzICYmXG4gICAgICAgIHBhcnNlQ2xhc3NUeXBlc1t0YXJnZXRDbGFzc10gJiZcbiAgICAgICAgcGFyc2VDbGFzc1R5cGVzW3RhcmdldENsYXNzXS5jbGFzc0dyYXBoUUxGaW5kUmVzdWx0VHlwZVxuICAgICAgKSB7XG4gICAgICAgIHJldHVybiBuZXcgR3JhcGhRTE5vbk51bGwocGFyc2VDbGFzc1R5cGVzW3RhcmdldENsYXNzXS5jbGFzc0dyYXBoUUxGaW5kUmVzdWx0VHlwZSk7XG4gICAgICB9IGVsc2Uge1xuICAgICAgICByZXR1cm4gbmV3IEdyYXBoUUxOb25OdWxsKGRlZmF1bHRHcmFwaFFMVHlwZXMuT0JKRUNUKTtcbiAgICAgIH1cbiAgICBjYXNlICdGaWxlJzpcbiAgICAgIHJldHVybiBkZWZhdWx0R3JhcGhRTFR5cGVzLkZJTEVfSU5GTztcbiAgICBjYXNlICdHZW9Qb2ludCc6XG4gICAgICByZXR1cm4gZGVmYXVsdEdyYXBoUUxUeXBlcy5HRU9fUE9JTlQ7XG4gICAgY2FzZSAnUG9seWdvbic6XG4gICAgICByZXR1cm4gZGVmYXVsdEdyYXBoUUxUeXBlcy5QT0xZR09OO1xuICAgIGNhc2UgJ0J5dGVzJzpcbiAgICAgIHJldHVybiBkZWZhdWx0R3JhcGhRTFR5cGVzLkJZVEVTO1xuICAgIGNhc2UgJ0FDTCc6XG4gICAgICByZXR1cm4gbmV3IEdyYXBoUUxOb25OdWxsKGRlZmF1bHRHcmFwaFFMVHlwZXMuQUNMKTtcbiAgICBkZWZhdWx0OlxuICAgICAgcmV0dXJuIHVuZGVmaW5lZDtcbiAgfVxufTtcblxuZXhwb3J0IHsgdHJhbnNmb3JtT3V0cHV0VHlwZVRvR3JhcGhRTCB9O1xuIl19