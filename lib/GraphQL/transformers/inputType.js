"use strict";

Object.defineProperty(exports, "__esModule", {
  value: true
});
exports.transformInputTypeToGraphQL = void 0;
var _graphql = require("graphql");
var defaultGraphQLTypes = _interopRequireWildcard(require("../loaders/defaultGraphQLTypes"));
function _getRequireWildcardCache(nodeInterop) { if (typeof WeakMap !== "function") return null; var cacheBabelInterop = new WeakMap(); var cacheNodeInterop = new WeakMap(); return (_getRequireWildcardCache = function (nodeInterop) { return nodeInterop ? cacheNodeInterop : cacheBabelInterop; })(nodeInterop); }
function _interopRequireWildcard(obj, nodeInterop) { if (!nodeInterop && obj && obj.__esModule) { return obj; } if (obj === null || typeof obj !== "object" && typeof obj !== "function") { return { default: obj }; } var cache = _getRequireWildcardCache(nodeInterop); if (cache && cache.has(obj)) { return cache.get(obj); } var newObj = {}; var hasPropertyDescriptor = Object.defineProperty && Object.getOwnPropertyDescriptor; for (var key in obj) { if (key !== "default" && Object.prototype.hasOwnProperty.call(obj, key)) { var desc = hasPropertyDescriptor ? Object.getOwnPropertyDescriptor(obj, key) : null; if (desc && (desc.get || desc.set)) { Object.defineProperty(newObj, key, desc); } else { newObj[key] = obj[key]; } } } newObj.default = obj; if (cache) { cache.set(obj, newObj); } return newObj; }
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
//# sourceMappingURL=data:application/json;charset=utf-8;base64,eyJ2ZXJzaW9uIjozLCJuYW1lcyI6WyJ0cmFuc2Zvcm1JbnB1dFR5cGVUb0dyYXBoUUwiLCJwYXJzZVR5cGUiLCJ0YXJnZXRDbGFzcyIsInBhcnNlQ2xhc3NUeXBlcyIsIkdyYXBoUUxTdHJpbmciLCJHcmFwaFFMRmxvYXQiLCJHcmFwaFFMQm9vbGVhbiIsIkdyYXBoUUxMaXN0IiwiZGVmYXVsdEdyYXBoUUxUeXBlcyIsIkFOWSIsIk9CSkVDVCIsIkRBVEUiLCJjbGFzc0dyYXBoUUxQb2ludGVyVHlwZSIsImNsYXNzR3JhcGhRTFJlbGF0aW9uVHlwZSIsIkZJTEVfSU5QVVQiLCJHRU9fUE9JTlRfSU5QVVQiLCJQT0xZR09OX0lOUFVUIiwiQllURVMiLCJBQ0xfSU5QVVQiLCJ1bmRlZmluZWQiXSwic291cmNlcyI6WyIuLi8uLi8uLi9zcmMvR3JhcGhRTC90cmFuc2Zvcm1lcnMvaW5wdXRUeXBlLmpzIl0sInNvdXJjZXNDb250ZW50IjpbImltcG9ydCB7IEdyYXBoUUxTdHJpbmcsIEdyYXBoUUxGbG9hdCwgR3JhcGhRTEJvb2xlYW4sIEdyYXBoUUxMaXN0IH0gZnJvbSAnZ3JhcGhxbCc7XG5pbXBvcnQgKiBhcyBkZWZhdWx0R3JhcGhRTFR5cGVzIGZyb20gJy4uL2xvYWRlcnMvZGVmYXVsdEdyYXBoUUxUeXBlcyc7XG5cbmNvbnN0IHRyYW5zZm9ybUlucHV0VHlwZVRvR3JhcGhRTCA9IChwYXJzZVR5cGUsIHRhcmdldENsYXNzLCBwYXJzZUNsYXNzVHlwZXMpID0+IHtcbiAgc3dpdGNoIChwYXJzZVR5cGUpIHtcbiAgICBjYXNlICdTdHJpbmcnOlxuICAgICAgcmV0dXJuIEdyYXBoUUxTdHJpbmc7XG4gICAgY2FzZSAnTnVtYmVyJzpcbiAgICAgIHJldHVybiBHcmFwaFFMRmxvYXQ7XG4gICAgY2FzZSAnQm9vbGVhbic6XG4gICAgICByZXR1cm4gR3JhcGhRTEJvb2xlYW47XG4gICAgY2FzZSAnQXJyYXknOlxuICAgICAgcmV0dXJuIG5ldyBHcmFwaFFMTGlzdChkZWZhdWx0R3JhcGhRTFR5cGVzLkFOWSk7XG4gICAgY2FzZSAnT2JqZWN0JzpcbiAgICAgIHJldHVybiBkZWZhdWx0R3JhcGhRTFR5cGVzLk9CSkVDVDtcbiAgICBjYXNlICdEYXRlJzpcbiAgICAgIHJldHVybiBkZWZhdWx0R3JhcGhRTFR5cGVzLkRBVEU7XG4gICAgY2FzZSAnUG9pbnRlcic6XG4gICAgICBpZiAoXG4gICAgICAgIHBhcnNlQ2xhc3NUeXBlcyAmJlxuICAgICAgICBwYXJzZUNsYXNzVHlwZXNbdGFyZ2V0Q2xhc3NdICYmXG4gICAgICAgIHBhcnNlQ2xhc3NUeXBlc1t0YXJnZXRDbGFzc10uY2xhc3NHcmFwaFFMUG9pbnRlclR5cGVcbiAgICAgICkge1xuICAgICAgICByZXR1cm4gcGFyc2VDbGFzc1R5cGVzW3RhcmdldENsYXNzXS5jbGFzc0dyYXBoUUxQb2ludGVyVHlwZTtcbiAgICAgIH0gZWxzZSB7XG4gICAgICAgIHJldHVybiBkZWZhdWx0R3JhcGhRTFR5cGVzLk9CSkVDVDtcbiAgICAgIH1cbiAgICBjYXNlICdSZWxhdGlvbic6XG4gICAgICBpZiAoXG4gICAgICAgIHBhcnNlQ2xhc3NUeXBlcyAmJlxuICAgICAgICBwYXJzZUNsYXNzVHlwZXNbdGFyZ2V0Q2xhc3NdICYmXG4gICAgICAgIHBhcnNlQ2xhc3NUeXBlc1t0YXJnZXRDbGFzc10uY2xhc3NHcmFwaFFMUmVsYXRpb25UeXBlXG4gICAgICApIHtcbiAgICAgICAgcmV0dXJuIHBhcnNlQ2xhc3NUeXBlc1t0YXJnZXRDbGFzc10uY2xhc3NHcmFwaFFMUmVsYXRpb25UeXBlO1xuICAgICAgfSBlbHNlIHtcbiAgICAgICAgcmV0dXJuIGRlZmF1bHRHcmFwaFFMVHlwZXMuT0JKRUNUO1xuICAgICAgfVxuICAgIGNhc2UgJ0ZpbGUnOlxuICAgICAgcmV0dXJuIGRlZmF1bHRHcmFwaFFMVHlwZXMuRklMRV9JTlBVVDtcbiAgICBjYXNlICdHZW9Qb2ludCc6XG4gICAgICByZXR1cm4gZGVmYXVsdEdyYXBoUUxUeXBlcy5HRU9fUE9JTlRfSU5QVVQ7XG4gICAgY2FzZSAnUG9seWdvbic6XG4gICAgICByZXR1cm4gZGVmYXVsdEdyYXBoUUxUeXBlcy5QT0xZR09OX0lOUFVUO1xuICAgIGNhc2UgJ0J5dGVzJzpcbiAgICAgIHJldHVybiBkZWZhdWx0R3JhcGhRTFR5cGVzLkJZVEVTO1xuICAgIGNhc2UgJ0FDTCc6XG4gICAgICByZXR1cm4gZGVmYXVsdEdyYXBoUUxUeXBlcy5BQ0xfSU5QVVQ7XG4gICAgZGVmYXVsdDpcbiAgICAgIHJldHVybiB1bmRlZmluZWQ7XG4gIH1cbn07XG5cbmV4cG9ydCB7IHRyYW5zZm9ybUlucHV0VHlwZVRvR3JhcGhRTCB9O1xuIl0sIm1hcHBpbmdzIjoiOzs7Ozs7QUFBQTtBQUNBO0FBQXNFO0FBQUE7QUFFdEUsTUFBTUEsMkJBQTJCLEdBQUcsQ0FBQ0MsU0FBUyxFQUFFQyxXQUFXLEVBQUVDLGVBQWUsS0FBSztFQUMvRSxRQUFRRixTQUFTO0lBQ2YsS0FBSyxRQUFRO01BQ1gsT0FBT0csc0JBQWE7SUFDdEIsS0FBSyxRQUFRO01BQ1gsT0FBT0MscUJBQVk7SUFDckIsS0FBSyxTQUFTO01BQ1osT0FBT0MsdUJBQWM7SUFDdkIsS0FBSyxPQUFPO01BQ1YsT0FBTyxJQUFJQyxvQkFBVyxDQUFDQyxtQkFBbUIsQ0FBQ0MsR0FBRyxDQUFDO0lBQ2pELEtBQUssUUFBUTtNQUNYLE9BQU9ELG1CQUFtQixDQUFDRSxNQUFNO0lBQ25DLEtBQUssTUFBTTtNQUNULE9BQU9GLG1CQUFtQixDQUFDRyxJQUFJO0lBQ2pDLEtBQUssU0FBUztNQUNaLElBQ0VSLGVBQWUsSUFDZkEsZUFBZSxDQUFDRCxXQUFXLENBQUMsSUFDNUJDLGVBQWUsQ0FBQ0QsV0FBVyxDQUFDLENBQUNVLHVCQUF1QixFQUNwRDtRQUNBLE9BQU9ULGVBQWUsQ0FBQ0QsV0FBVyxDQUFDLENBQUNVLHVCQUF1QjtNQUM3RCxDQUFDLE1BQU07UUFDTCxPQUFPSixtQkFBbUIsQ0FBQ0UsTUFBTTtNQUNuQztJQUNGLEtBQUssVUFBVTtNQUNiLElBQ0VQLGVBQWUsSUFDZkEsZUFBZSxDQUFDRCxXQUFXLENBQUMsSUFDNUJDLGVBQWUsQ0FBQ0QsV0FBVyxDQUFDLENBQUNXLHdCQUF3QixFQUNyRDtRQUNBLE9BQU9WLGVBQWUsQ0FBQ0QsV0FBVyxDQUFDLENBQUNXLHdCQUF3QjtNQUM5RCxDQUFDLE1BQU07UUFDTCxPQUFPTCxtQkFBbUIsQ0FBQ0UsTUFBTTtNQUNuQztJQUNGLEtBQUssTUFBTTtNQUNULE9BQU9GLG1CQUFtQixDQUFDTSxVQUFVO0lBQ3ZDLEtBQUssVUFBVTtNQUNiLE9BQU9OLG1CQUFtQixDQUFDTyxlQUFlO0lBQzVDLEtBQUssU0FBUztNQUNaLE9BQU9QLG1CQUFtQixDQUFDUSxhQUFhO0lBQzFDLEtBQUssT0FBTztNQUNWLE9BQU9SLG1CQUFtQixDQUFDUyxLQUFLO0lBQ2xDLEtBQUssS0FBSztNQUNSLE9BQU9ULG1CQUFtQixDQUFDVSxTQUFTO0lBQ3RDO01BQ0UsT0FBT0MsU0FBUztFQUFDO0FBRXZCLENBQUM7QUFBQyJ9