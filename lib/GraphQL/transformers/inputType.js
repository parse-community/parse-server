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
//# sourceMappingURL=data:application/json;charset=utf-8;base64,eyJ2ZXJzaW9uIjozLCJzb3VyY2VzIjpbIi4uLy4uLy4uL3NyYy9HcmFwaFFML3RyYW5zZm9ybWVycy9pbnB1dFR5cGUuanMiXSwibmFtZXMiOlsidHJhbnNmb3JtSW5wdXRUeXBlVG9HcmFwaFFMIiwicGFyc2VUeXBlIiwidGFyZ2V0Q2xhc3MiLCJwYXJzZUNsYXNzVHlwZXMiLCJHcmFwaFFMU3RyaW5nIiwiR3JhcGhRTEZsb2F0IiwiR3JhcGhRTEJvb2xlYW4iLCJHcmFwaFFMTGlzdCIsImRlZmF1bHRHcmFwaFFMVHlwZXMiLCJBTlkiLCJPQkpFQ1QiLCJEQVRFIiwiY2xhc3NHcmFwaFFMUG9pbnRlclR5cGUiLCJjbGFzc0dyYXBoUUxSZWxhdGlvblR5cGUiLCJGSUxFX0lOUFVUIiwiR0VPX1BPSU5UX0lOUFVUIiwiUE9MWUdPTl9JTlBVVCIsIkJZVEVTIiwiQUNMX0lOUFVUIiwidW5kZWZpbmVkIl0sIm1hcHBpbmdzIjoiOzs7Ozs7O0FBQUE7O0FBTUE7Ozs7OztBQUVBLE1BQU1BLDJCQUEyQixHQUFHLENBQ2xDQyxTQURrQyxFQUVsQ0MsV0FGa0MsRUFHbENDLGVBSGtDLEtBSS9CO0FBQ0gsVUFBUUYsU0FBUjtBQUNFLFNBQUssUUFBTDtBQUNFLGFBQU9HLHNCQUFQOztBQUNGLFNBQUssUUFBTDtBQUNFLGFBQU9DLHFCQUFQOztBQUNGLFNBQUssU0FBTDtBQUNFLGFBQU9DLHVCQUFQOztBQUNGLFNBQUssT0FBTDtBQUNFLGFBQU8sSUFBSUMsb0JBQUosQ0FBZ0JDLG1CQUFtQixDQUFDQyxHQUFwQyxDQUFQOztBQUNGLFNBQUssUUFBTDtBQUNFLGFBQU9ELG1CQUFtQixDQUFDRSxNQUEzQjs7QUFDRixTQUFLLE1BQUw7QUFDRSxhQUFPRixtQkFBbUIsQ0FBQ0csSUFBM0I7O0FBQ0YsU0FBSyxTQUFMO0FBQ0UsVUFDRVIsZUFBZSxJQUNmQSxlQUFlLENBQUNELFdBQUQsQ0FEZixJQUVBQyxlQUFlLENBQUNELFdBQUQsQ0FBZixDQUE2QlUsdUJBSC9CLEVBSUU7QUFDQSxlQUFPVCxlQUFlLENBQUNELFdBQUQsQ0FBZixDQUE2QlUsdUJBQXBDO0FBQ0QsT0FORCxNQU1PO0FBQ0wsZUFBT0osbUJBQW1CLENBQUNFLE1BQTNCO0FBQ0Q7O0FBQ0gsU0FBSyxVQUFMO0FBQ0UsVUFDRVAsZUFBZSxJQUNmQSxlQUFlLENBQUNELFdBQUQsQ0FEZixJQUVBQyxlQUFlLENBQUNELFdBQUQsQ0FBZixDQUE2Qlcsd0JBSC9CLEVBSUU7QUFDQSxlQUFPVixlQUFlLENBQUNELFdBQUQsQ0FBZixDQUE2Qlcsd0JBQXBDO0FBQ0QsT0FORCxNQU1PO0FBQ0wsZUFBT0wsbUJBQW1CLENBQUNFLE1BQTNCO0FBQ0Q7O0FBQ0gsU0FBSyxNQUFMO0FBQ0UsYUFBT0YsbUJBQW1CLENBQUNNLFVBQTNCOztBQUNGLFNBQUssVUFBTDtBQUNFLGFBQU9OLG1CQUFtQixDQUFDTyxlQUEzQjs7QUFDRixTQUFLLFNBQUw7QUFDRSxhQUFPUCxtQkFBbUIsQ0FBQ1EsYUFBM0I7O0FBQ0YsU0FBSyxPQUFMO0FBQ0UsYUFBT1IsbUJBQW1CLENBQUNTLEtBQTNCOztBQUNGLFNBQUssS0FBTDtBQUNFLGFBQU9ULG1CQUFtQixDQUFDVSxTQUEzQjs7QUFDRjtBQUNFLGFBQU9DLFNBQVA7QUE1Q0o7QUE4Q0QsQ0FuREQiLCJzb3VyY2VzQ29udGVudCI6WyJpbXBvcnQge1xuICBHcmFwaFFMU3RyaW5nLFxuICBHcmFwaFFMRmxvYXQsXG4gIEdyYXBoUUxCb29sZWFuLFxuICBHcmFwaFFMTGlzdCxcbn0gZnJvbSAnZ3JhcGhxbCc7XG5pbXBvcnQgKiBhcyBkZWZhdWx0R3JhcGhRTFR5cGVzIGZyb20gJy4uL2xvYWRlcnMvZGVmYXVsdEdyYXBoUUxUeXBlcyc7XG5cbmNvbnN0IHRyYW5zZm9ybUlucHV0VHlwZVRvR3JhcGhRTCA9IChcbiAgcGFyc2VUeXBlLFxuICB0YXJnZXRDbGFzcyxcbiAgcGFyc2VDbGFzc1R5cGVzXG4pID0+IHtcbiAgc3dpdGNoIChwYXJzZVR5cGUpIHtcbiAgICBjYXNlICdTdHJpbmcnOlxuICAgICAgcmV0dXJuIEdyYXBoUUxTdHJpbmc7XG4gICAgY2FzZSAnTnVtYmVyJzpcbiAgICAgIHJldHVybiBHcmFwaFFMRmxvYXQ7XG4gICAgY2FzZSAnQm9vbGVhbic6XG4gICAgICByZXR1cm4gR3JhcGhRTEJvb2xlYW47XG4gICAgY2FzZSAnQXJyYXknOlxuICAgICAgcmV0dXJuIG5ldyBHcmFwaFFMTGlzdChkZWZhdWx0R3JhcGhRTFR5cGVzLkFOWSk7XG4gICAgY2FzZSAnT2JqZWN0JzpcbiAgICAgIHJldHVybiBkZWZhdWx0R3JhcGhRTFR5cGVzLk9CSkVDVDtcbiAgICBjYXNlICdEYXRlJzpcbiAgICAgIHJldHVybiBkZWZhdWx0R3JhcGhRTFR5cGVzLkRBVEU7XG4gICAgY2FzZSAnUG9pbnRlcic6XG4gICAgICBpZiAoXG4gICAgICAgIHBhcnNlQ2xhc3NUeXBlcyAmJlxuICAgICAgICBwYXJzZUNsYXNzVHlwZXNbdGFyZ2V0Q2xhc3NdICYmXG4gICAgICAgIHBhcnNlQ2xhc3NUeXBlc1t0YXJnZXRDbGFzc10uY2xhc3NHcmFwaFFMUG9pbnRlclR5cGVcbiAgICAgICkge1xuICAgICAgICByZXR1cm4gcGFyc2VDbGFzc1R5cGVzW3RhcmdldENsYXNzXS5jbGFzc0dyYXBoUUxQb2ludGVyVHlwZTtcbiAgICAgIH0gZWxzZSB7XG4gICAgICAgIHJldHVybiBkZWZhdWx0R3JhcGhRTFR5cGVzLk9CSkVDVDtcbiAgICAgIH1cbiAgICBjYXNlICdSZWxhdGlvbic6XG4gICAgICBpZiAoXG4gICAgICAgIHBhcnNlQ2xhc3NUeXBlcyAmJlxuICAgICAgICBwYXJzZUNsYXNzVHlwZXNbdGFyZ2V0Q2xhc3NdICYmXG4gICAgICAgIHBhcnNlQ2xhc3NUeXBlc1t0YXJnZXRDbGFzc10uY2xhc3NHcmFwaFFMUmVsYXRpb25UeXBlXG4gICAgICApIHtcbiAgICAgICAgcmV0dXJuIHBhcnNlQ2xhc3NUeXBlc1t0YXJnZXRDbGFzc10uY2xhc3NHcmFwaFFMUmVsYXRpb25UeXBlO1xuICAgICAgfSBlbHNlIHtcbiAgICAgICAgcmV0dXJuIGRlZmF1bHRHcmFwaFFMVHlwZXMuT0JKRUNUO1xuICAgICAgfVxuICAgIGNhc2UgJ0ZpbGUnOlxuICAgICAgcmV0dXJuIGRlZmF1bHRHcmFwaFFMVHlwZXMuRklMRV9JTlBVVDtcbiAgICBjYXNlICdHZW9Qb2ludCc6XG4gICAgICByZXR1cm4gZGVmYXVsdEdyYXBoUUxUeXBlcy5HRU9fUE9JTlRfSU5QVVQ7XG4gICAgY2FzZSAnUG9seWdvbic6XG4gICAgICByZXR1cm4gZGVmYXVsdEdyYXBoUUxUeXBlcy5QT0xZR09OX0lOUFVUO1xuICAgIGNhc2UgJ0J5dGVzJzpcbiAgICAgIHJldHVybiBkZWZhdWx0R3JhcGhRTFR5cGVzLkJZVEVTO1xuICAgIGNhc2UgJ0FDTCc6XG4gICAgICByZXR1cm4gZGVmYXVsdEdyYXBoUUxUeXBlcy5BQ0xfSU5QVVQ7XG4gICAgZGVmYXVsdDpcbiAgICAgIHJldHVybiB1bmRlZmluZWQ7XG4gIH1cbn07XG5cbmV4cG9ydCB7IHRyYW5zZm9ybUlucHV0VHlwZVRvR3JhcGhRTCB9O1xuIl19