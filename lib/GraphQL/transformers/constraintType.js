"use strict";

Object.defineProperty(exports, "__esModule", {
  value: true
});
exports.transformConstraintTypeToGraphQL = void 0;

var defaultGraphQLTypes = _interopRequireWildcard(require("../loaders/defaultGraphQLTypes"));

function _getRequireWildcardCache() { if (typeof WeakMap !== "function") return null; var cache = new WeakMap(); _getRequireWildcardCache = function () { return cache; }; return cache; }

function _interopRequireWildcard(obj) { if (obj && obj.__esModule) { return obj; } if (obj === null || typeof obj !== "object" && typeof obj !== "function") { return { default: obj }; } var cache = _getRequireWildcardCache(); if (cache && cache.has(obj)) { return cache.get(obj); } var newObj = {}; var hasPropertyDescriptor = Object.defineProperty && Object.getOwnPropertyDescriptor; for (var key in obj) { if (Object.prototype.hasOwnProperty.call(obj, key)) { var desc = hasPropertyDescriptor ? Object.getOwnPropertyDescriptor(obj, key) : null; if (desc && (desc.get || desc.set)) { Object.defineProperty(newObj, key, desc); } else { newObj[key] = obj[key]; } } } newObj.default = obj; if (cache) { cache.set(obj, newObj); } return newObj; }

const transformConstraintTypeToGraphQL = (parseType, targetClass, parseClassTypes, fieldName) => {
  if (fieldName === 'id' || fieldName === 'objectId') {
    return defaultGraphQLTypes.ID_WHERE_INPUT;
  }

  switch (parseType) {
    case 'String':
      return defaultGraphQLTypes.STRING_WHERE_INPUT;

    case 'Number':
      return defaultGraphQLTypes.NUMBER_WHERE_INPUT;

    case 'Boolean':
      return defaultGraphQLTypes.BOOLEAN_WHERE_INPUT;

    case 'Array':
      return defaultGraphQLTypes.ARRAY_WHERE_INPUT;

    case 'Object':
      return defaultGraphQLTypes.OBJECT_WHERE_INPUT;

    case 'Date':
      return defaultGraphQLTypes.DATE_WHERE_INPUT;

    case 'Pointer':
      if (parseClassTypes[targetClass] && parseClassTypes[targetClass].classGraphQLRelationConstraintsType) {
        return parseClassTypes[targetClass].classGraphQLRelationConstraintsType;
      } else {
        return defaultGraphQLTypes.OBJECT;
      }

    case 'File':
      return defaultGraphQLTypes.FILE_WHERE_INPUT;

    case 'GeoPoint':
      return defaultGraphQLTypes.GEO_POINT_WHERE_INPUT;

    case 'Polygon':
      return defaultGraphQLTypes.POLYGON_WHERE_INPUT;

    case 'Bytes':
      return defaultGraphQLTypes.BYTES_WHERE_INPUT;

    case 'ACL':
      return defaultGraphQLTypes.OBJECT_WHERE_INPUT;

    case 'Relation':
      if (parseClassTypes[targetClass] && parseClassTypes[targetClass].classGraphQLRelationConstraintsType) {
        return parseClassTypes[targetClass].classGraphQLRelationConstraintsType;
      } else {
        return defaultGraphQLTypes.OBJECT;
      }

    default:
      return undefined;
  }
};

exports.transformConstraintTypeToGraphQL = transformConstraintTypeToGraphQL;
//# sourceMappingURL=data:application/json;charset=utf-8;base64,eyJ2ZXJzaW9uIjozLCJzb3VyY2VzIjpbIi4uLy4uLy4uL3NyYy9HcmFwaFFML3RyYW5zZm9ybWVycy9jb25zdHJhaW50VHlwZS5qcyJdLCJuYW1lcyI6WyJ0cmFuc2Zvcm1Db25zdHJhaW50VHlwZVRvR3JhcGhRTCIsInBhcnNlVHlwZSIsInRhcmdldENsYXNzIiwicGFyc2VDbGFzc1R5cGVzIiwiZmllbGROYW1lIiwiZGVmYXVsdEdyYXBoUUxUeXBlcyIsIklEX1dIRVJFX0lOUFVUIiwiU1RSSU5HX1dIRVJFX0lOUFVUIiwiTlVNQkVSX1dIRVJFX0lOUFVUIiwiQk9PTEVBTl9XSEVSRV9JTlBVVCIsIkFSUkFZX1dIRVJFX0lOUFVUIiwiT0JKRUNUX1dIRVJFX0lOUFVUIiwiREFURV9XSEVSRV9JTlBVVCIsImNsYXNzR3JhcGhRTFJlbGF0aW9uQ29uc3RyYWludHNUeXBlIiwiT0JKRUNUIiwiRklMRV9XSEVSRV9JTlBVVCIsIkdFT19QT0lOVF9XSEVSRV9JTlBVVCIsIlBPTFlHT05fV0hFUkVfSU5QVVQiLCJCWVRFU19XSEVSRV9JTlBVVCIsInVuZGVmaW5lZCJdLCJtYXBwaW5ncyI6Ijs7Ozs7OztBQUFBOzs7Ozs7QUFFQSxNQUFNQSxnQ0FBZ0MsR0FBRyxDQUFDQyxTQUFELEVBQVlDLFdBQVosRUFBeUJDLGVBQXpCLEVBQTBDQyxTQUExQyxLQUF3RDtBQUMvRixNQUFJQSxTQUFTLEtBQUssSUFBZCxJQUFzQkEsU0FBUyxLQUFLLFVBQXhDLEVBQW9EO0FBQ2xELFdBQU9DLG1CQUFtQixDQUFDQyxjQUEzQjtBQUNEOztBQUVELFVBQVFMLFNBQVI7QUFDRSxTQUFLLFFBQUw7QUFDRSxhQUFPSSxtQkFBbUIsQ0FBQ0Usa0JBQTNCOztBQUNGLFNBQUssUUFBTDtBQUNFLGFBQU9GLG1CQUFtQixDQUFDRyxrQkFBM0I7O0FBQ0YsU0FBSyxTQUFMO0FBQ0UsYUFBT0gsbUJBQW1CLENBQUNJLG1CQUEzQjs7QUFDRixTQUFLLE9BQUw7QUFDRSxhQUFPSixtQkFBbUIsQ0FBQ0ssaUJBQTNCOztBQUNGLFNBQUssUUFBTDtBQUNFLGFBQU9MLG1CQUFtQixDQUFDTSxrQkFBM0I7O0FBQ0YsU0FBSyxNQUFMO0FBQ0UsYUFBT04sbUJBQW1CLENBQUNPLGdCQUEzQjs7QUFDRixTQUFLLFNBQUw7QUFDRSxVQUNFVCxlQUFlLENBQUNELFdBQUQsQ0FBZixJQUNBQyxlQUFlLENBQUNELFdBQUQsQ0FBZixDQUE2QlcsbUNBRi9CLEVBR0U7QUFDQSxlQUFPVixlQUFlLENBQUNELFdBQUQsQ0FBZixDQUE2QlcsbUNBQXBDO0FBQ0QsT0FMRCxNQUtPO0FBQ0wsZUFBT1IsbUJBQW1CLENBQUNTLE1BQTNCO0FBQ0Q7O0FBQ0gsU0FBSyxNQUFMO0FBQ0UsYUFBT1QsbUJBQW1CLENBQUNVLGdCQUEzQjs7QUFDRixTQUFLLFVBQUw7QUFDRSxhQUFPVixtQkFBbUIsQ0FBQ1cscUJBQTNCOztBQUNGLFNBQUssU0FBTDtBQUNFLGFBQU9YLG1CQUFtQixDQUFDWSxtQkFBM0I7O0FBQ0YsU0FBSyxPQUFMO0FBQ0UsYUFBT1osbUJBQW1CLENBQUNhLGlCQUEzQjs7QUFDRixTQUFLLEtBQUw7QUFDRSxhQUFPYixtQkFBbUIsQ0FBQ00sa0JBQTNCOztBQUNGLFNBQUssVUFBTDtBQUNFLFVBQ0VSLGVBQWUsQ0FBQ0QsV0FBRCxDQUFmLElBQ0FDLGVBQWUsQ0FBQ0QsV0FBRCxDQUFmLENBQTZCVyxtQ0FGL0IsRUFHRTtBQUNBLGVBQU9WLGVBQWUsQ0FBQ0QsV0FBRCxDQUFmLENBQTZCVyxtQ0FBcEM7QUFDRCxPQUxELE1BS087QUFDTCxlQUFPUixtQkFBbUIsQ0FBQ1MsTUFBM0I7QUFDRDs7QUFDSDtBQUNFLGFBQU9LLFNBQVA7QUExQ0o7QUE0Q0QsQ0FqREQiLCJzb3VyY2VzQ29udGVudCI6WyJpbXBvcnQgKiBhcyBkZWZhdWx0R3JhcGhRTFR5cGVzIGZyb20gJy4uL2xvYWRlcnMvZGVmYXVsdEdyYXBoUUxUeXBlcyc7XG5cbmNvbnN0IHRyYW5zZm9ybUNvbnN0cmFpbnRUeXBlVG9HcmFwaFFMID0gKHBhcnNlVHlwZSwgdGFyZ2V0Q2xhc3MsIHBhcnNlQ2xhc3NUeXBlcywgZmllbGROYW1lKSA9PiB7XG4gIGlmIChmaWVsZE5hbWUgPT09ICdpZCcgfHwgZmllbGROYW1lID09PSAnb2JqZWN0SWQnKSB7XG4gICAgcmV0dXJuIGRlZmF1bHRHcmFwaFFMVHlwZXMuSURfV0hFUkVfSU5QVVQ7XG4gIH1cblxuICBzd2l0Y2ggKHBhcnNlVHlwZSkge1xuICAgIGNhc2UgJ1N0cmluZyc6XG4gICAgICByZXR1cm4gZGVmYXVsdEdyYXBoUUxUeXBlcy5TVFJJTkdfV0hFUkVfSU5QVVQ7XG4gICAgY2FzZSAnTnVtYmVyJzpcbiAgICAgIHJldHVybiBkZWZhdWx0R3JhcGhRTFR5cGVzLk5VTUJFUl9XSEVSRV9JTlBVVDtcbiAgICBjYXNlICdCb29sZWFuJzpcbiAgICAgIHJldHVybiBkZWZhdWx0R3JhcGhRTFR5cGVzLkJPT0xFQU5fV0hFUkVfSU5QVVQ7XG4gICAgY2FzZSAnQXJyYXknOlxuICAgICAgcmV0dXJuIGRlZmF1bHRHcmFwaFFMVHlwZXMuQVJSQVlfV0hFUkVfSU5QVVQ7XG4gICAgY2FzZSAnT2JqZWN0JzpcbiAgICAgIHJldHVybiBkZWZhdWx0R3JhcGhRTFR5cGVzLk9CSkVDVF9XSEVSRV9JTlBVVDtcbiAgICBjYXNlICdEYXRlJzpcbiAgICAgIHJldHVybiBkZWZhdWx0R3JhcGhRTFR5cGVzLkRBVEVfV0hFUkVfSU5QVVQ7XG4gICAgY2FzZSAnUG9pbnRlcic6XG4gICAgICBpZiAoXG4gICAgICAgIHBhcnNlQ2xhc3NUeXBlc1t0YXJnZXRDbGFzc10gJiZcbiAgICAgICAgcGFyc2VDbGFzc1R5cGVzW3RhcmdldENsYXNzXS5jbGFzc0dyYXBoUUxSZWxhdGlvbkNvbnN0cmFpbnRzVHlwZVxuICAgICAgKSB7XG4gICAgICAgIHJldHVybiBwYXJzZUNsYXNzVHlwZXNbdGFyZ2V0Q2xhc3NdLmNsYXNzR3JhcGhRTFJlbGF0aW9uQ29uc3RyYWludHNUeXBlO1xuICAgICAgfSBlbHNlIHtcbiAgICAgICAgcmV0dXJuIGRlZmF1bHRHcmFwaFFMVHlwZXMuT0JKRUNUO1xuICAgICAgfVxuICAgIGNhc2UgJ0ZpbGUnOlxuICAgICAgcmV0dXJuIGRlZmF1bHRHcmFwaFFMVHlwZXMuRklMRV9XSEVSRV9JTlBVVDtcbiAgICBjYXNlICdHZW9Qb2ludCc6XG4gICAgICByZXR1cm4gZGVmYXVsdEdyYXBoUUxUeXBlcy5HRU9fUE9JTlRfV0hFUkVfSU5QVVQ7XG4gICAgY2FzZSAnUG9seWdvbic6XG4gICAgICByZXR1cm4gZGVmYXVsdEdyYXBoUUxUeXBlcy5QT0xZR09OX1dIRVJFX0lOUFVUO1xuICAgIGNhc2UgJ0J5dGVzJzpcbiAgICAgIHJldHVybiBkZWZhdWx0R3JhcGhRTFR5cGVzLkJZVEVTX1dIRVJFX0lOUFVUO1xuICAgIGNhc2UgJ0FDTCc6XG4gICAgICByZXR1cm4gZGVmYXVsdEdyYXBoUUxUeXBlcy5PQkpFQ1RfV0hFUkVfSU5QVVQ7XG4gICAgY2FzZSAnUmVsYXRpb24nOlxuICAgICAgaWYgKFxuICAgICAgICBwYXJzZUNsYXNzVHlwZXNbdGFyZ2V0Q2xhc3NdICYmXG4gICAgICAgIHBhcnNlQ2xhc3NUeXBlc1t0YXJnZXRDbGFzc10uY2xhc3NHcmFwaFFMUmVsYXRpb25Db25zdHJhaW50c1R5cGVcbiAgICAgICkge1xuICAgICAgICByZXR1cm4gcGFyc2VDbGFzc1R5cGVzW3RhcmdldENsYXNzXS5jbGFzc0dyYXBoUUxSZWxhdGlvbkNvbnN0cmFpbnRzVHlwZTtcbiAgICAgIH0gZWxzZSB7XG4gICAgICAgIHJldHVybiBkZWZhdWx0R3JhcGhRTFR5cGVzLk9CSkVDVDtcbiAgICAgIH1cbiAgICBkZWZhdWx0OlxuICAgICAgcmV0dXJuIHVuZGVmaW5lZDtcbiAgfVxufTtcblxuZXhwb3J0IHsgdHJhbnNmb3JtQ29uc3RyYWludFR5cGVUb0dyYXBoUUwgfTtcbiJdfQ==