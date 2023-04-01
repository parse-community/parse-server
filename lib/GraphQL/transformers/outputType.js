"use strict";

Object.defineProperty(exports, "__esModule", {
  value: true
});
exports.transformOutputTypeToGraphQL = void 0;
var defaultGraphQLTypes = _interopRequireWildcard(require("../loaders/defaultGraphQLTypes"));
var _graphql = require("graphql");
function _getRequireWildcardCache(nodeInterop) { if (typeof WeakMap !== "function") return null; var cacheBabelInterop = new WeakMap(); var cacheNodeInterop = new WeakMap(); return (_getRequireWildcardCache = function (nodeInterop) { return nodeInterop ? cacheNodeInterop : cacheBabelInterop; })(nodeInterop); }
function _interopRequireWildcard(obj, nodeInterop) { if (!nodeInterop && obj && obj.__esModule) { return obj; } if (obj === null || typeof obj !== "object" && typeof obj !== "function") { return { default: obj }; } var cache = _getRequireWildcardCache(nodeInterop); if (cache && cache.has(obj)) { return cache.get(obj); } var newObj = {}; var hasPropertyDescriptor = Object.defineProperty && Object.getOwnPropertyDescriptor; for (var key in obj) { if (key !== "default" && Object.prototype.hasOwnProperty.call(obj, key)) { var desc = hasPropertyDescriptor ? Object.getOwnPropertyDescriptor(obj, key) : null; if (desc && (desc.get || desc.set)) { Object.defineProperty(newObj, key, desc); } else { newObj[key] = obj[key]; } } } newObj.default = obj; if (cache) { cache.set(obj, newObj); } return newObj; }
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
//# sourceMappingURL=data:application/json;charset=utf-8;base64,eyJ2ZXJzaW9uIjozLCJuYW1lcyI6WyJ0cmFuc2Zvcm1PdXRwdXRUeXBlVG9HcmFwaFFMIiwicGFyc2VUeXBlIiwidGFyZ2V0Q2xhc3MiLCJwYXJzZUNsYXNzVHlwZXMiLCJHcmFwaFFMU3RyaW5nIiwiR3JhcGhRTEZsb2F0IiwiR3JhcGhRTEJvb2xlYW4iLCJHcmFwaFFMTGlzdCIsImRlZmF1bHRHcmFwaFFMVHlwZXMiLCJBUlJBWV9SRVNVTFQiLCJPQkpFQ1QiLCJEQVRFIiwiY2xhc3NHcmFwaFFMT3V0cHV0VHlwZSIsImNsYXNzR3JhcGhRTEZpbmRSZXN1bHRUeXBlIiwiR3JhcGhRTE5vbk51bGwiLCJGSUxFX0lORk8iLCJHRU9fUE9JTlQiLCJQT0xZR09OIiwiQllURVMiLCJBQ0wiLCJ1bmRlZmluZWQiXSwic291cmNlcyI6WyIuLi8uLi8uLi9zcmMvR3JhcGhRTC90cmFuc2Zvcm1lcnMvb3V0cHV0VHlwZS5qcyJdLCJzb3VyY2VzQ29udGVudCI6WyJpbXBvcnQgKiBhcyBkZWZhdWx0R3JhcGhRTFR5cGVzIGZyb20gJy4uL2xvYWRlcnMvZGVmYXVsdEdyYXBoUUxUeXBlcyc7XG5pbXBvcnQgeyBHcmFwaFFMU3RyaW5nLCBHcmFwaFFMRmxvYXQsIEdyYXBoUUxCb29sZWFuLCBHcmFwaFFMTGlzdCwgR3JhcGhRTE5vbk51bGwgfSBmcm9tICdncmFwaHFsJztcblxuY29uc3QgdHJhbnNmb3JtT3V0cHV0VHlwZVRvR3JhcGhRTCA9IChwYXJzZVR5cGUsIHRhcmdldENsYXNzLCBwYXJzZUNsYXNzVHlwZXMpID0+IHtcbiAgc3dpdGNoIChwYXJzZVR5cGUpIHtcbiAgICBjYXNlICdTdHJpbmcnOlxuICAgICAgcmV0dXJuIEdyYXBoUUxTdHJpbmc7XG4gICAgY2FzZSAnTnVtYmVyJzpcbiAgICAgIHJldHVybiBHcmFwaFFMRmxvYXQ7XG4gICAgY2FzZSAnQm9vbGVhbic6XG4gICAgICByZXR1cm4gR3JhcGhRTEJvb2xlYW47XG4gICAgY2FzZSAnQXJyYXknOlxuICAgICAgcmV0dXJuIG5ldyBHcmFwaFFMTGlzdChkZWZhdWx0R3JhcGhRTFR5cGVzLkFSUkFZX1JFU1VMVCk7XG4gICAgY2FzZSAnT2JqZWN0JzpcbiAgICAgIHJldHVybiBkZWZhdWx0R3JhcGhRTFR5cGVzLk9CSkVDVDtcbiAgICBjYXNlICdEYXRlJzpcbiAgICAgIHJldHVybiBkZWZhdWx0R3JhcGhRTFR5cGVzLkRBVEU7XG4gICAgY2FzZSAnUG9pbnRlcic6XG4gICAgICBpZiAoXG4gICAgICAgIHBhcnNlQ2xhc3NUeXBlcyAmJlxuICAgICAgICBwYXJzZUNsYXNzVHlwZXNbdGFyZ2V0Q2xhc3NdICYmXG4gICAgICAgIHBhcnNlQ2xhc3NUeXBlc1t0YXJnZXRDbGFzc10uY2xhc3NHcmFwaFFMT3V0cHV0VHlwZVxuICAgICAgKSB7XG4gICAgICAgIHJldHVybiBwYXJzZUNsYXNzVHlwZXNbdGFyZ2V0Q2xhc3NdLmNsYXNzR3JhcGhRTE91dHB1dFR5cGU7XG4gICAgICB9IGVsc2Uge1xuICAgICAgICByZXR1cm4gZGVmYXVsdEdyYXBoUUxUeXBlcy5PQkpFQ1Q7XG4gICAgICB9XG4gICAgY2FzZSAnUmVsYXRpb24nOlxuICAgICAgaWYgKFxuICAgICAgICBwYXJzZUNsYXNzVHlwZXMgJiZcbiAgICAgICAgcGFyc2VDbGFzc1R5cGVzW3RhcmdldENsYXNzXSAmJlxuICAgICAgICBwYXJzZUNsYXNzVHlwZXNbdGFyZ2V0Q2xhc3NdLmNsYXNzR3JhcGhRTEZpbmRSZXN1bHRUeXBlXG4gICAgICApIHtcbiAgICAgICAgcmV0dXJuIG5ldyBHcmFwaFFMTm9uTnVsbChwYXJzZUNsYXNzVHlwZXNbdGFyZ2V0Q2xhc3NdLmNsYXNzR3JhcGhRTEZpbmRSZXN1bHRUeXBlKTtcbiAgICAgIH0gZWxzZSB7XG4gICAgICAgIHJldHVybiBuZXcgR3JhcGhRTE5vbk51bGwoZGVmYXVsdEdyYXBoUUxUeXBlcy5PQkpFQ1QpO1xuICAgICAgfVxuICAgIGNhc2UgJ0ZpbGUnOlxuICAgICAgcmV0dXJuIGRlZmF1bHRHcmFwaFFMVHlwZXMuRklMRV9JTkZPO1xuICAgIGNhc2UgJ0dlb1BvaW50JzpcbiAgICAgIHJldHVybiBkZWZhdWx0R3JhcGhRTFR5cGVzLkdFT19QT0lOVDtcbiAgICBjYXNlICdQb2x5Z29uJzpcbiAgICAgIHJldHVybiBkZWZhdWx0R3JhcGhRTFR5cGVzLlBPTFlHT047XG4gICAgY2FzZSAnQnl0ZXMnOlxuICAgICAgcmV0dXJuIGRlZmF1bHRHcmFwaFFMVHlwZXMuQllURVM7XG4gICAgY2FzZSAnQUNMJzpcbiAgICAgIHJldHVybiBuZXcgR3JhcGhRTE5vbk51bGwoZGVmYXVsdEdyYXBoUUxUeXBlcy5BQ0wpO1xuICAgIGRlZmF1bHQ6XG4gICAgICByZXR1cm4gdW5kZWZpbmVkO1xuICB9XG59O1xuXG5leHBvcnQgeyB0cmFuc2Zvcm1PdXRwdXRUeXBlVG9HcmFwaFFMIH07XG4iXSwibWFwcGluZ3MiOiI7Ozs7OztBQUFBO0FBQ0E7QUFBbUc7QUFBQTtBQUVuRyxNQUFNQSw0QkFBNEIsR0FBRyxDQUFDQyxTQUFTLEVBQUVDLFdBQVcsRUFBRUMsZUFBZSxLQUFLO0VBQ2hGLFFBQVFGLFNBQVM7SUFDZixLQUFLLFFBQVE7TUFDWCxPQUFPRyxzQkFBYTtJQUN0QixLQUFLLFFBQVE7TUFDWCxPQUFPQyxxQkFBWTtJQUNyQixLQUFLLFNBQVM7TUFDWixPQUFPQyx1QkFBYztJQUN2QixLQUFLLE9BQU87TUFDVixPQUFPLElBQUlDLG9CQUFXLENBQUNDLG1CQUFtQixDQUFDQyxZQUFZLENBQUM7SUFDMUQsS0FBSyxRQUFRO01BQ1gsT0FBT0QsbUJBQW1CLENBQUNFLE1BQU07SUFDbkMsS0FBSyxNQUFNO01BQ1QsT0FBT0YsbUJBQW1CLENBQUNHLElBQUk7SUFDakMsS0FBSyxTQUFTO01BQ1osSUFDRVIsZUFBZSxJQUNmQSxlQUFlLENBQUNELFdBQVcsQ0FBQyxJQUM1QkMsZUFBZSxDQUFDRCxXQUFXLENBQUMsQ0FBQ1Usc0JBQXNCLEVBQ25EO1FBQ0EsT0FBT1QsZUFBZSxDQUFDRCxXQUFXLENBQUMsQ0FBQ1Usc0JBQXNCO01BQzVELENBQUMsTUFBTTtRQUNMLE9BQU9KLG1CQUFtQixDQUFDRSxNQUFNO01BQ25DO0lBQ0YsS0FBSyxVQUFVO01BQ2IsSUFDRVAsZUFBZSxJQUNmQSxlQUFlLENBQUNELFdBQVcsQ0FBQyxJQUM1QkMsZUFBZSxDQUFDRCxXQUFXLENBQUMsQ0FBQ1csMEJBQTBCLEVBQ3ZEO1FBQ0EsT0FBTyxJQUFJQyx1QkFBYyxDQUFDWCxlQUFlLENBQUNELFdBQVcsQ0FBQyxDQUFDVywwQkFBMEIsQ0FBQztNQUNwRixDQUFDLE1BQU07UUFDTCxPQUFPLElBQUlDLHVCQUFjLENBQUNOLG1CQUFtQixDQUFDRSxNQUFNLENBQUM7TUFDdkQ7SUFDRixLQUFLLE1BQU07TUFDVCxPQUFPRixtQkFBbUIsQ0FBQ08sU0FBUztJQUN0QyxLQUFLLFVBQVU7TUFDYixPQUFPUCxtQkFBbUIsQ0FBQ1EsU0FBUztJQUN0QyxLQUFLLFNBQVM7TUFDWixPQUFPUixtQkFBbUIsQ0FBQ1MsT0FBTztJQUNwQyxLQUFLLE9BQU87TUFDVixPQUFPVCxtQkFBbUIsQ0FBQ1UsS0FBSztJQUNsQyxLQUFLLEtBQUs7TUFDUixPQUFPLElBQUlKLHVCQUFjLENBQUNOLG1CQUFtQixDQUFDVyxHQUFHLENBQUM7SUFDcEQ7TUFDRSxPQUFPQyxTQUFTO0VBQUM7QUFFdkIsQ0FBQztBQUFDIn0=