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
//# sourceMappingURL=data:application/json;charset=utf-8;base64,eyJ2ZXJzaW9uIjozLCJzb3VyY2VzIjpbIi4uLy4uLy4uL3NyYy9HcmFwaFFML3RyYW5zZm9ybWVycy9vdXRwdXRUeXBlLmpzIl0sIm5hbWVzIjpbInRyYW5zZm9ybU91dHB1dFR5cGVUb0dyYXBoUUwiLCJwYXJzZVR5cGUiLCJ0YXJnZXRDbGFzcyIsInBhcnNlQ2xhc3NUeXBlcyIsIkdyYXBoUUxTdHJpbmciLCJHcmFwaFFMRmxvYXQiLCJHcmFwaFFMQm9vbGVhbiIsIkdyYXBoUUxMaXN0IiwiZGVmYXVsdEdyYXBoUUxUeXBlcyIsIkFSUkFZX1JFU1VMVCIsIk9CSkVDVCIsIkRBVEUiLCJjbGFzc0dyYXBoUUxPdXRwdXRUeXBlIiwiY2xhc3NHcmFwaFFMRmluZFJlc3VsdFR5cGUiLCJHcmFwaFFMTm9uTnVsbCIsIkZJTEVfSU5GTyIsIkdFT19QT0lOVCIsIlBPTFlHT04iLCJCWVRFUyIsIkFDTCIsInVuZGVmaW5lZCJdLCJtYXBwaW5ncyI6Ijs7Ozs7OztBQUFBOztBQUNBOzs7Ozs7QUFRQSxNQUFNQSw0QkFBNEIsR0FBRyxDQUNuQ0MsU0FEbUMsRUFFbkNDLFdBRm1DLEVBR25DQyxlQUhtQyxLQUloQztBQUNILFVBQVFGLFNBQVI7QUFDRSxTQUFLLFFBQUw7QUFDRSxhQUFPRyxzQkFBUDs7QUFDRixTQUFLLFFBQUw7QUFDRSxhQUFPQyxxQkFBUDs7QUFDRixTQUFLLFNBQUw7QUFDRSxhQUFPQyx1QkFBUDs7QUFDRixTQUFLLE9BQUw7QUFDRSxhQUFPLElBQUlDLG9CQUFKLENBQWdCQyxtQkFBbUIsQ0FBQ0MsWUFBcEMsQ0FBUDs7QUFDRixTQUFLLFFBQUw7QUFDRSxhQUFPRCxtQkFBbUIsQ0FBQ0UsTUFBM0I7O0FBQ0YsU0FBSyxNQUFMO0FBQ0UsYUFBT0YsbUJBQW1CLENBQUNHLElBQTNCOztBQUNGLFNBQUssU0FBTDtBQUNFLFVBQ0VSLGVBQWUsSUFDZkEsZUFBZSxDQUFDRCxXQUFELENBRGYsSUFFQUMsZUFBZSxDQUFDRCxXQUFELENBQWYsQ0FBNkJVLHNCQUgvQixFQUlFO0FBQ0EsZUFBT1QsZUFBZSxDQUFDRCxXQUFELENBQWYsQ0FBNkJVLHNCQUFwQztBQUNELE9BTkQsTUFNTztBQUNMLGVBQU9KLG1CQUFtQixDQUFDRSxNQUEzQjtBQUNEOztBQUNILFNBQUssVUFBTDtBQUNFLFVBQ0VQLGVBQWUsSUFDZkEsZUFBZSxDQUFDRCxXQUFELENBRGYsSUFFQUMsZUFBZSxDQUFDRCxXQUFELENBQWYsQ0FBNkJXLDBCQUgvQixFQUlFO0FBQ0EsZUFBTyxJQUFJQyx1QkFBSixDQUNMWCxlQUFlLENBQUNELFdBQUQsQ0FBZixDQUE2QlcsMEJBRHhCLENBQVA7QUFHRCxPQVJELE1BUU87QUFDTCxlQUFPLElBQUlDLHVCQUFKLENBQW1CTixtQkFBbUIsQ0FBQ0UsTUFBdkMsQ0FBUDtBQUNEOztBQUNILFNBQUssTUFBTDtBQUNFLGFBQU9GLG1CQUFtQixDQUFDTyxTQUEzQjs7QUFDRixTQUFLLFVBQUw7QUFDRSxhQUFPUCxtQkFBbUIsQ0FBQ1EsU0FBM0I7O0FBQ0YsU0FBSyxTQUFMO0FBQ0UsYUFBT1IsbUJBQW1CLENBQUNTLE9BQTNCOztBQUNGLFNBQUssT0FBTDtBQUNFLGFBQU9ULG1CQUFtQixDQUFDVSxLQUEzQjs7QUFDRixTQUFLLEtBQUw7QUFDRSxhQUFPLElBQUlKLHVCQUFKLENBQW1CTixtQkFBbUIsQ0FBQ1csR0FBdkMsQ0FBUDs7QUFDRjtBQUNFLGFBQU9DLFNBQVA7QUE5Q0o7QUFnREQsQ0FyREQiLCJzb3VyY2VzQ29udGVudCI6WyJpbXBvcnQgKiBhcyBkZWZhdWx0R3JhcGhRTFR5cGVzIGZyb20gJy4uL2xvYWRlcnMvZGVmYXVsdEdyYXBoUUxUeXBlcyc7XG5pbXBvcnQge1xuICBHcmFwaFFMU3RyaW5nLFxuICBHcmFwaFFMRmxvYXQsXG4gIEdyYXBoUUxCb29sZWFuLFxuICBHcmFwaFFMTGlzdCxcbiAgR3JhcGhRTE5vbk51bGwsXG59IGZyb20gJ2dyYXBocWwnO1xuXG5jb25zdCB0cmFuc2Zvcm1PdXRwdXRUeXBlVG9HcmFwaFFMID0gKFxuICBwYXJzZVR5cGUsXG4gIHRhcmdldENsYXNzLFxuICBwYXJzZUNsYXNzVHlwZXNcbikgPT4ge1xuICBzd2l0Y2ggKHBhcnNlVHlwZSkge1xuICAgIGNhc2UgJ1N0cmluZyc6XG4gICAgICByZXR1cm4gR3JhcGhRTFN0cmluZztcbiAgICBjYXNlICdOdW1iZXInOlxuICAgICAgcmV0dXJuIEdyYXBoUUxGbG9hdDtcbiAgICBjYXNlICdCb29sZWFuJzpcbiAgICAgIHJldHVybiBHcmFwaFFMQm9vbGVhbjtcbiAgICBjYXNlICdBcnJheSc6XG4gICAgICByZXR1cm4gbmV3IEdyYXBoUUxMaXN0KGRlZmF1bHRHcmFwaFFMVHlwZXMuQVJSQVlfUkVTVUxUKTtcbiAgICBjYXNlICdPYmplY3QnOlxuICAgICAgcmV0dXJuIGRlZmF1bHRHcmFwaFFMVHlwZXMuT0JKRUNUO1xuICAgIGNhc2UgJ0RhdGUnOlxuICAgICAgcmV0dXJuIGRlZmF1bHRHcmFwaFFMVHlwZXMuREFURTtcbiAgICBjYXNlICdQb2ludGVyJzpcbiAgICAgIGlmIChcbiAgICAgICAgcGFyc2VDbGFzc1R5cGVzICYmXG4gICAgICAgIHBhcnNlQ2xhc3NUeXBlc1t0YXJnZXRDbGFzc10gJiZcbiAgICAgICAgcGFyc2VDbGFzc1R5cGVzW3RhcmdldENsYXNzXS5jbGFzc0dyYXBoUUxPdXRwdXRUeXBlXG4gICAgICApIHtcbiAgICAgICAgcmV0dXJuIHBhcnNlQ2xhc3NUeXBlc1t0YXJnZXRDbGFzc10uY2xhc3NHcmFwaFFMT3V0cHV0VHlwZTtcbiAgICAgIH0gZWxzZSB7XG4gICAgICAgIHJldHVybiBkZWZhdWx0R3JhcGhRTFR5cGVzLk9CSkVDVDtcbiAgICAgIH1cbiAgICBjYXNlICdSZWxhdGlvbic6XG4gICAgICBpZiAoXG4gICAgICAgIHBhcnNlQ2xhc3NUeXBlcyAmJlxuICAgICAgICBwYXJzZUNsYXNzVHlwZXNbdGFyZ2V0Q2xhc3NdICYmXG4gICAgICAgIHBhcnNlQ2xhc3NUeXBlc1t0YXJnZXRDbGFzc10uY2xhc3NHcmFwaFFMRmluZFJlc3VsdFR5cGVcbiAgICAgICkge1xuICAgICAgICByZXR1cm4gbmV3IEdyYXBoUUxOb25OdWxsKFxuICAgICAgICAgIHBhcnNlQ2xhc3NUeXBlc1t0YXJnZXRDbGFzc10uY2xhc3NHcmFwaFFMRmluZFJlc3VsdFR5cGVcbiAgICAgICAgKTtcbiAgICAgIH0gZWxzZSB7XG4gICAgICAgIHJldHVybiBuZXcgR3JhcGhRTE5vbk51bGwoZGVmYXVsdEdyYXBoUUxUeXBlcy5PQkpFQ1QpO1xuICAgICAgfVxuICAgIGNhc2UgJ0ZpbGUnOlxuICAgICAgcmV0dXJuIGRlZmF1bHRHcmFwaFFMVHlwZXMuRklMRV9JTkZPO1xuICAgIGNhc2UgJ0dlb1BvaW50JzpcbiAgICAgIHJldHVybiBkZWZhdWx0R3JhcGhRTFR5cGVzLkdFT19QT0lOVDtcbiAgICBjYXNlICdQb2x5Z29uJzpcbiAgICAgIHJldHVybiBkZWZhdWx0R3JhcGhRTFR5cGVzLlBPTFlHT047XG4gICAgY2FzZSAnQnl0ZXMnOlxuICAgICAgcmV0dXJuIGRlZmF1bHRHcmFwaFFMVHlwZXMuQllURVM7XG4gICAgY2FzZSAnQUNMJzpcbiAgICAgIHJldHVybiBuZXcgR3JhcGhRTE5vbk51bGwoZGVmYXVsdEdyYXBoUUxUeXBlcy5BQ0wpO1xuICAgIGRlZmF1bHQ6XG4gICAgICByZXR1cm4gdW5kZWZpbmVkO1xuICB9XG59O1xuXG5leHBvcnQgeyB0cmFuc2Zvcm1PdXRwdXRUeXBlVG9HcmFwaFFMIH07XG4iXX0=