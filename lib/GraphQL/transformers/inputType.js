"use strict";

Object.defineProperty(exports, "__esModule", {
  value: true
});
exports.transformInputTypeToGraphQL = void 0;

var _graphql = require("graphql");

var defaultGraphQLTypes = _interopRequireWildcard(require("../loaders/defaultGraphQLTypes"));

function _getRequireWildcardCache() { if (typeof WeakMap !== "function") return null; var cache = new WeakMap(); _getRequireWildcardCache = function () { return cache; }; return cache; }

function _interopRequireWildcard(obj) { if (obj && obj.__esModule) { return obj; } if (obj === null || typeof obj !== "object" && typeof obj !== "function") { return { default: obj }; } var cache = _getRequireWildcardCache(); if (cache && cache.has(obj)) { return cache.get(obj); } var newObj = {}; var hasPropertyDescriptor = Object.defineProperty && Object.getOwnPropertyDescriptor; for (var key in obj) { if (Object.prototype.hasOwnProperty.call(obj, key)) { var desc = hasPropertyDescriptor ? Object.getOwnPropertyDescriptor(obj, key) : null; if (desc && (desc.get || desc.set)) { Object.defineProperty(newObj, key, desc); } else { newObj[key] = obj[key]; } } } newObj.default = obj; if (cache) { cache.set(obj, newObj); } return newObj; }

const transformInputTypeToGraphQL = (parseType, targetClass, parseClassTypes) => {
  switch (parseType) {
    case 'String':
      return _graphql.GraphQLString;

    case 'Number':
      return _graphql.GraphQLFloat;

    case 'Boolean':
      return _graphql.GraphQLBoolean;

    case 'Array':
      return new _graphql.GraphQLList(defaultGraphQLTypes.ANY);

    case 'Object':
      return defaultGraphQLTypes.OBJECT;

    case 'Date':
      return defaultGraphQLTypes.DATE;

    case 'Pointer':
      if (parseClassTypes && parseClassTypes[targetClass] && parseClassTypes[targetClass].classGraphQLPointerType) {
        return parseClassTypes[targetClass].classGraphQLPointerType;
      } else {
        return defaultGraphQLTypes.OBJECT;
      }

    case 'Relation':
      if (parseClassTypes && parseClassTypes[targetClass] && parseClassTypes[targetClass].classGraphQLRelationType) {
        return parseClassTypes[targetClass].classGraphQLRelationType;
      } else {
        return defaultGraphQLTypes.OBJECT;
      }

    case 'File':
      return defaultGraphQLTypes.FILE_INPUT;

    case 'GeoPoint':
      return defaultGraphQLTypes.GEO_POINT_INPUT;

    case 'Polygon':
      return defaultGraphQLTypes.POLYGON_INPUT;

    case 'Bytes':
      return defaultGraphQLTypes.BYTES;

    case 'ACL':
      return defaultGraphQLTypes.ACL_INPUT;

    default:
      return undefined;
  }
};

exports.transformInputTypeToGraphQL = transformInputTypeToGraphQL;
//# sourceMappingURL=data:application/json;charset=utf-8;base64,eyJ2ZXJzaW9uIjozLCJzb3VyY2VzIjpbIi4uLy4uLy4uL3NyYy9HcmFwaFFML3RyYW5zZm9ybWVycy9pbnB1dFR5cGUuanMiXSwibmFtZXMiOlsidHJhbnNmb3JtSW5wdXRUeXBlVG9HcmFwaFFMIiwicGFyc2VUeXBlIiwidGFyZ2V0Q2xhc3MiLCJwYXJzZUNsYXNzVHlwZXMiLCJHcmFwaFFMU3RyaW5nIiwiR3JhcGhRTEZsb2F0IiwiR3JhcGhRTEJvb2xlYW4iLCJHcmFwaFFMTGlzdCIsImRlZmF1bHRHcmFwaFFMVHlwZXMiLCJBTlkiLCJPQkpFQ1QiLCJEQVRFIiwiY2xhc3NHcmFwaFFMUG9pbnRlclR5cGUiLCJjbGFzc0dyYXBoUUxSZWxhdGlvblR5cGUiLCJGSUxFX0lOUFVUIiwiR0VPX1BPSU5UX0lOUFVUIiwiUE9MWUdPTl9JTlBVVCIsIkJZVEVTIiwiQUNMX0lOUFVUIiwidW5kZWZpbmVkIl0sIm1hcHBpbmdzIjoiOzs7Ozs7O0FBQUE7O0FBQ0E7Ozs7OztBQUVBLE1BQU1BLDJCQUEyQixHQUFHLENBQUNDLFNBQUQsRUFBWUMsV0FBWixFQUF5QkMsZUFBekIsS0FBNkM7QUFDL0UsVUFBUUYsU0FBUjtBQUNFLFNBQUssUUFBTDtBQUNFLGFBQU9HLHNCQUFQOztBQUNGLFNBQUssUUFBTDtBQUNFLGFBQU9DLHFCQUFQOztBQUNGLFNBQUssU0FBTDtBQUNFLGFBQU9DLHVCQUFQOztBQUNGLFNBQUssT0FBTDtBQUNFLGFBQU8sSUFBSUMsb0JBQUosQ0FBZ0JDLG1CQUFtQixDQUFDQyxHQUFwQyxDQUFQOztBQUNGLFNBQUssUUFBTDtBQUNFLGFBQU9ELG1CQUFtQixDQUFDRSxNQUEzQjs7QUFDRixTQUFLLE1BQUw7QUFDRSxhQUFPRixtQkFBbUIsQ0FBQ0csSUFBM0I7O0FBQ0YsU0FBSyxTQUFMO0FBQ0UsVUFDRVIsZUFBZSxJQUNmQSxlQUFlLENBQUNELFdBQUQsQ0FEZixJQUVBQyxlQUFlLENBQUNELFdBQUQsQ0FBZixDQUE2QlUsdUJBSC9CLEVBSUU7QUFDQSxlQUFPVCxlQUFlLENBQUNELFdBQUQsQ0FBZixDQUE2QlUsdUJBQXBDO0FBQ0QsT0FORCxNQU1PO0FBQ0wsZUFBT0osbUJBQW1CLENBQUNFLE1BQTNCO0FBQ0Q7O0FBQ0gsU0FBSyxVQUFMO0FBQ0UsVUFDRVAsZUFBZSxJQUNmQSxlQUFlLENBQUNELFdBQUQsQ0FEZixJQUVBQyxlQUFlLENBQUNELFdBQUQsQ0FBZixDQUE2Qlcsd0JBSC9CLEVBSUU7QUFDQSxlQUFPVixlQUFlLENBQUNELFdBQUQsQ0FBZixDQUE2Qlcsd0JBQXBDO0FBQ0QsT0FORCxNQU1PO0FBQ0wsZUFBT0wsbUJBQW1CLENBQUNFLE1BQTNCO0FBQ0Q7O0FBQ0gsU0FBSyxNQUFMO0FBQ0UsYUFBT0YsbUJBQW1CLENBQUNNLFVBQTNCOztBQUNGLFNBQUssVUFBTDtBQUNFLGFBQU9OLG1CQUFtQixDQUFDTyxlQUEzQjs7QUFDRixTQUFLLFNBQUw7QUFDRSxhQUFPUCxtQkFBbUIsQ0FBQ1EsYUFBM0I7O0FBQ0YsU0FBSyxPQUFMO0FBQ0UsYUFBT1IsbUJBQW1CLENBQUNTLEtBQTNCOztBQUNGLFNBQUssS0FBTDtBQUNFLGFBQU9ULG1CQUFtQixDQUFDVSxTQUEzQjs7QUFDRjtBQUNFLGFBQU9DLFNBQVA7QUE1Q0o7QUE4Q0QsQ0EvQ0QiLCJzb3VyY2VzQ29udGVudCI6WyJpbXBvcnQgeyBHcmFwaFFMU3RyaW5nLCBHcmFwaFFMRmxvYXQsIEdyYXBoUUxCb29sZWFuLCBHcmFwaFFMTGlzdCB9IGZyb20gJ2dyYXBocWwnO1xuaW1wb3J0ICogYXMgZGVmYXVsdEdyYXBoUUxUeXBlcyBmcm9tICcuLi9sb2FkZXJzL2RlZmF1bHRHcmFwaFFMVHlwZXMnO1xuXG5jb25zdCB0cmFuc2Zvcm1JbnB1dFR5cGVUb0dyYXBoUUwgPSAocGFyc2VUeXBlLCB0YXJnZXRDbGFzcywgcGFyc2VDbGFzc1R5cGVzKSA9PiB7XG4gIHN3aXRjaCAocGFyc2VUeXBlKSB7XG4gICAgY2FzZSAnU3RyaW5nJzpcbiAgICAgIHJldHVybiBHcmFwaFFMU3RyaW5nO1xuICAgIGNhc2UgJ051bWJlcic6XG4gICAgICByZXR1cm4gR3JhcGhRTEZsb2F0O1xuICAgIGNhc2UgJ0Jvb2xlYW4nOlxuICAgICAgcmV0dXJuIEdyYXBoUUxCb29sZWFuO1xuICAgIGNhc2UgJ0FycmF5JzpcbiAgICAgIHJldHVybiBuZXcgR3JhcGhRTExpc3QoZGVmYXVsdEdyYXBoUUxUeXBlcy5BTlkpO1xuICAgIGNhc2UgJ09iamVjdCc6XG4gICAgICByZXR1cm4gZGVmYXVsdEdyYXBoUUxUeXBlcy5PQkpFQ1Q7XG4gICAgY2FzZSAnRGF0ZSc6XG4gICAgICByZXR1cm4gZGVmYXVsdEdyYXBoUUxUeXBlcy5EQVRFO1xuICAgIGNhc2UgJ1BvaW50ZXInOlxuICAgICAgaWYgKFxuICAgICAgICBwYXJzZUNsYXNzVHlwZXMgJiZcbiAgICAgICAgcGFyc2VDbGFzc1R5cGVzW3RhcmdldENsYXNzXSAmJlxuICAgICAgICBwYXJzZUNsYXNzVHlwZXNbdGFyZ2V0Q2xhc3NdLmNsYXNzR3JhcGhRTFBvaW50ZXJUeXBlXG4gICAgICApIHtcbiAgICAgICAgcmV0dXJuIHBhcnNlQ2xhc3NUeXBlc1t0YXJnZXRDbGFzc10uY2xhc3NHcmFwaFFMUG9pbnRlclR5cGU7XG4gICAgICB9IGVsc2Uge1xuICAgICAgICByZXR1cm4gZGVmYXVsdEdyYXBoUUxUeXBlcy5PQkpFQ1Q7XG4gICAgICB9XG4gICAgY2FzZSAnUmVsYXRpb24nOlxuICAgICAgaWYgKFxuICAgICAgICBwYXJzZUNsYXNzVHlwZXMgJiZcbiAgICAgICAgcGFyc2VDbGFzc1R5cGVzW3RhcmdldENsYXNzXSAmJlxuICAgICAgICBwYXJzZUNsYXNzVHlwZXNbdGFyZ2V0Q2xhc3NdLmNsYXNzR3JhcGhRTFJlbGF0aW9uVHlwZVxuICAgICAgKSB7XG4gICAgICAgIHJldHVybiBwYXJzZUNsYXNzVHlwZXNbdGFyZ2V0Q2xhc3NdLmNsYXNzR3JhcGhRTFJlbGF0aW9uVHlwZTtcbiAgICAgIH0gZWxzZSB7XG4gICAgICAgIHJldHVybiBkZWZhdWx0R3JhcGhRTFR5cGVzLk9CSkVDVDtcbiAgICAgIH1cbiAgICBjYXNlICdGaWxlJzpcbiAgICAgIHJldHVybiBkZWZhdWx0R3JhcGhRTFR5cGVzLkZJTEVfSU5QVVQ7XG4gICAgY2FzZSAnR2VvUG9pbnQnOlxuICAgICAgcmV0dXJuIGRlZmF1bHRHcmFwaFFMVHlwZXMuR0VPX1BPSU5UX0lOUFVUO1xuICAgIGNhc2UgJ1BvbHlnb24nOlxuICAgICAgcmV0dXJuIGRlZmF1bHRHcmFwaFFMVHlwZXMuUE9MWUdPTl9JTlBVVDtcbiAgICBjYXNlICdCeXRlcyc6XG4gICAgICByZXR1cm4gZGVmYXVsdEdyYXBoUUxUeXBlcy5CWVRFUztcbiAgICBjYXNlICdBQ0wnOlxuICAgICAgcmV0dXJuIGRlZmF1bHRHcmFwaFFMVHlwZXMuQUNMX0lOUFVUO1xuICAgIGRlZmF1bHQ6XG4gICAgICByZXR1cm4gdW5kZWZpbmVkO1xuICB9XG59O1xuXG5leHBvcnQgeyB0cmFuc2Zvcm1JbnB1dFR5cGVUb0dyYXBoUUwgfTtcbiJdfQ==