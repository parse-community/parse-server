"use strict";

Object.defineProperty(exports, "__esModule", {
  value: true
});
exports.load = exports.GLOBAL_ID_ATT = void 0;

var _graphqlRelay = require("graphql-relay");

var _graphqlListFields = _interopRequireDefault(require("graphql-list-fields"));

var defaultGraphQLTypes = _interopRequireWildcard(require("./defaultGraphQLTypes"));

var objectsQueries = _interopRequireWildcard(require("../helpers/objectsQueries"));

var _parseClassTypes = require("./parseClassTypes");

function _getRequireWildcardCache() { if (typeof WeakMap !== "function") return null; var cache = new WeakMap(); _getRequireWildcardCache = function () { return cache; }; return cache; }

function _interopRequireWildcard(obj) { if (obj && obj.__esModule) { return obj; } if (obj === null || typeof obj !== "object" && typeof obj !== "function") { return { default: obj }; } var cache = _getRequireWildcardCache(); if (cache && cache.has(obj)) { return cache.get(obj); } var newObj = {}; var hasPropertyDescriptor = Object.defineProperty && Object.getOwnPropertyDescriptor; for (var key in obj) { if (Object.prototype.hasOwnProperty.call(obj, key)) { var desc = hasPropertyDescriptor ? Object.getOwnPropertyDescriptor(obj, key) : null; if (desc && (desc.get || desc.set)) { Object.defineProperty(newObj, key, desc); } else { newObj[key] = obj[key]; } } } newObj.default = obj; if (cache) { cache.set(obj, newObj); } return newObj; }

function _interopRequireDefault(obj) { return obj && obj.__esModule ? obj : { default: obj }; }

function ownKeys(object, enumerableOnly) { var keys = Object.keys(object); if (Object.getOwnPropertySymbols) { var symbols = Object.getOwnPropertySymbols(object); if (enumerableOnly) symbols = symbols.filter(function (sym) { return Object.getOwnPropertyDescriptor(object, sym).enumerable; }); keys.push.apply(keys, symbols); } return keys; }

function _objectSpread(target) { for (var i = 1; i < arguments.length; i++) { var source = arguments[i] != null ? arguments[i] : {}; if (i % 2) { ownKeys(Object(source), true).forEach(function (key) { _defineProperty(target, key, source[key]); }); } else if (Object.getOwnPropertyDescriptors) { Object.defineProperties(target, Object.getOwnPropertyDescriptors(source)); } else { ownKeys(Object(source)).forEach(function (key) { Object.defineProperty(target, key, Object.getOwnPropertyDescriptor(source, key)); }); } } return target; }

function _defineProperty(obj, key, value) { if (key in obj) { Object.defineProperty(obj, key, { value: value, enumerable: true, configurable: true, writable: true }); } else { obj[key] = value; } return obj; }

const GLOBAL_ID_ATT = {
  description: 'This is the global id.',
  type: defaultGraphQLTypes.OBJECT_ID
};
exports.GLOBAL_ID_ATT = GLOBAL_ID_ATT;

const load = parseGraphQLSchema => {
  const {
    nodeInterface,
    nodeField
  } = (0, _graphqlRelay.nodeDefinitions)(async (globalId, context, queryInfo) => {
    try {
      const {
        type,
        id
      } = (0, _graphqlRelay.fromGlobalId)(globalId);
      const {
        config,
        auth,
        info
      } = context;
      const selectedFields = (0, _graphqlListFields.default)(queryInfo);
      const {
        keys,
        include
      } = (0, _parseClassTypes.extractKeysAndInclude)(selectedFields);
      return _objectSpread({
        className: type
      }, await objectsQueries.getObject(type, id, keys, include, undefined, undefined, config, auth, info, parseGraphQLSchema.parseClasses));
    } catch (e) {
      parseGraphQLSchema.handleError(e);
    }
  }, obj => {
    return parseGraphQLSchema.parseClassTypes[obj.className].classGraphQLOutputType;
  });
  parseGraphQLSchema.addGraphQLType(nodeInterface, true);
  parseGraphQLSchema.relayNodeInterface = nodeInterface;
  parseGraphQLSchema.addGraphQLQuery('node', nodeField, true);
};

exports.load = load;
//# sourceMappingURL=data:application/json;charset=utf-8;base64,eyJ2ZXJzaW9uIjozLCJzb3VyY2VzIjpbIi4uLy4uLy4uL3NyYy9HcmFwaFFML2xvYWRlcnMvZGVmYXVsdFJlbGF5U2NoZW1hLmpzIl0sIm5hbWVzIjpbIkdMT0JBTF9JRF9BVFQiLCJkZXNjcmlwdGlvbiIsInR5cGUiLCJkZWZhdWx0R3JhcGhRTFR5cGVzIiwiT0JKRUNUX0lEIiwibG9hZCIsInBhcnNlR3JhcGhRTFNjaGVtYSIsIm5vZGVJbnRlcmZhY2UiLCJub2RlRmllbGQiLCJnbG9iYWxJZCIsImNvbnRleHQiLCJxdWVyeUluZm8iLCJpZCIsImNvbmZpZyIsImF1dGgiLCJpbmZvIiwic2VsZWN0ZWRGaWVsZHMiLCJrZXlzIiwiaW5jbHVkZSIsImNsYXNzTmFtZSIsIm9iamVjdHNRdWVyaWVzIiwiZ2V0T2JqZWN0IiwidW5kZWZpbmVkIiwicGFyc2VDbGFzc2VzIiwiZSIsImhhbmRsZUVycm9yIiwib2JqIiwicGFyc2VDbGFzc1R5cGVzIiwiY2xhc3NHcmFwaFFMT3V0cHV0VHlwZSIsImFkZEdyYXBoUUxUeXBlIiwicmVsYXlOb2RlSW50ZXJmYWNlIiwiYWRkR3JhcGhRTFF1ZXJ5Il0sIm1hcHBpbmdzIjoiOzs7Ozs7O0FBQUE7O0FBQ0E7O0FBQ0E7O0FBQ0E7O0FBQ0E7Ozs7Ozs7Ozs7Ozs7O0FBRUEsTUFBTUEsYUFBYSxHQUFHO0FBQ3BCQyxFQUFBQSxXQUFXLEVBQUUsd0JBRE87QUFFcEJDLEVBQUFBLElBQUksRUFBRUMsbUJBQW1CLENBQUNDO0FBRk4sQ0FBdEI7OztBQUtBLE1BQU1DLElBQUksR0FBR0Msa0JBQWtCLElBQUk7QUFDakMsUUFBTTtBQUFFQyxJQUFBQSxhQUFGO0FBQWlCQyxJQUFBQTtBQUFqQixNQUErQixtQ0FDbkMsT0FBT0MsUUFBUCxFQUFpQkMsT0FBakIsRUFBMEJDLFNBQTFCLEtBQXdDO0FBQ3RDLFFBQUk7QUFDRixZQUFNO0FBQUVULFFBQUFBLElBQUY7QUFBUVUsUUFBQUE7QUFBUixVQUFlLGdDQUFhSCxRQUFiLENBQXJCO0FBQ0EsWUFBTTtBQUFFSSxRQUFBQSxNQUFGO0FBQVVDLFFBQUFBLElBQVY7QUFBZ0JDLFFBQUFBO0FBQWhCLFVBQXlCTCxPQUEvQjtBQUNBLFlBQU1NLGNBQWMsR0FBRyxnQ0FBY0wsU0FBZCxDQUF2QjtBQUVBLFlBQU07QUFBRU0sUUFBQUEsSUFBRjtBQUFRQyxRQUFBQTtBQUFSLFVBQW9CLDRDQUFzQkYsY0FBdEIsQ0FBMUI7QUFFQTtBQUNFRyxRQUFBQSxTQUFTLEVBQUVqQjtBQURiLFNBRU0sTUFBTWtCLGNBQWMsQ0FBQ0MsU0FBZixDQUNSbkIsSUFEUSxFQUVSVSxFQUZRLEVBR1JLLElBSFEsRUFJUkMsT0FKUSxFQUtSSSxTQUxRLEVBTVJBLFNBTlEsRUFPUlQsTUFQUSxFQVFSQyxJQVJRLEVBU1JDLElBVFEsRUFVUlQsa0JBQWtCLENBQUNpQixZQVZYLENBRlo7QUFlRCxLQXRCRCxDQXNCRSxPQUFPQyxDQUFQLEVBQVU7QUFDVmxCLE1BQUFBLGtCQUFrQixDQUFDbUIsV0FBbkIsQ0FBK0JELENBQS9CO0FBQ0Q7QUFDRixHQTNCa0MsRUE0Qm5DRSxHQUFHLElBQUk7QUFDTCxXQUFPcEIsa0JBQWtCLENBQUNxQixlQUFuQixDQUFtQ0QsR0FBRyxDQUFDUCxTQUF2QyxFQUNKUyxzQkFESDtBQUVELEdBL0JrQyxDQUFyQztBQWtDQXRCLEVBQUFBLGtCQUFrQixDQUFDdUIsY0FBbkIsQ0FBa0N0QixhQUFsQyxFQUFpRCxJQUFqRDtBQUNBRCxFQUFBQSxrQkFBa0IsQ0FBQ3dCLGtCQUFuQixHQUF3Q3ZCLGFBQXhDO0FBQ0FELEVBQUFBLGtCQUFrQixDQUFDeUIsZUFBbkIsQ0FBbUMsTUFBbkMsRUFBMkN2QixTQUEzQyxFQUFzRCxJQUF0RDtBQUNELENBdENEIiwic291cmNlc0NvbnRlbnQiOlsiaW1wb3J0IHsgbm9kZURlZmluaXRpb25zLCBmcm9tR2xvYmFsSWQgfSBmcm9tICdncmFwaHFsLXJlbGF5JztcbmltcG9ydCBnZXRGaWVsZE5hbWVzIGZyb20gJ2dyYXBocWwtbGlzdC1maWVsZHMnO1xuaW1wb3J0ICogYXMgZGVmYXVsdEdyYXBoUUxUeXBlcyBmcm9tICcuL2RlZmF1bHRHcmFwaFFMVHlwZXMnO1xuaW1wb3J0ICogYXMgb2JqZWN0c1F1ZXJpZXMgZnJvbSAnLi4vaGVscGVycy9vYmplY3RzUXVlcmllcyc7XG5pbXBvcnQgeyBleHRyYWN0S2V5c0FuZEluY2x1ZGUgfSBmcm9tICcuL3BhcnNlQ2xhc3NUeXBlcyc7XG5cbmNvbnN0IEdMT0JBTF9JRF9BVFQgPSB7XG4gIGRlc2NyaXB0aW9uOiAnVGhpcyBpcyB0aGUgZ2xvYmFsIGlkLicsXG4gIHR5cGU6IGRlZmF1bHRHcmFwaFFMVHlwZXMuT0JKRUNUX0lELFxufTtcblxuY29uc3QgbG9hZCA9IHBhcnNlR3JhcGhRTFNjaGVtYSA9PiB7XG4gIGNvbnN0IHsgbm9kZUludGVyZmFjZSwgbm9kZUZpZWxkIH0gPSBub2RlRGVmaW5pdGlvbnMoXG4gICAgYXN5bmMgKGdsb2JhbElkLCBjb250ZXh0LCBxdWVyeUluZm8pID0+IHtcbiAgICAgIHRyeSB7XG4gICAgICAgIGNvbnN0IHsgdHlwZSwgaWQgfSA9IGZyb21HbG9iYWxJZChnbG9iYWxJZCk7XG4gICAgICAgIGNvbnN0IHsgY29uZmlnLCBhdXRoLCBpbmZvIH0gPSBjb250ZXh0O1xuICAgICAgICBjb25zdCBzZWxlY3RlZEZpZWxkcyA9IGdldEZpZWxkTmFtZXMocXVlcnlJbmZvKTtcblxuICAgICAgICBjb25zdCB7IGtleXMsIGluY2x1ZGUgfSA9IGV4dHJhY3RLZXlzQW5kSW5jbHVkZShzZWxlY3RlZEZpZWxkcyk7XG5cbiAgICAgICAgcmV0dXJuIHtcbiAgICAgICAgICBjbGFzc05hbWU6IHR5cGUsXG4gICAgICAgICAgLi4uKGF3YWl0IG9iamVjdHNRdWVyaWVzLmdldE9iamVjdChcbiAgICAgICAgICAgIHR5cGUsXG4gICAgICAgICAgICBpZCxcbiAgICAgICAgICAgIGtleXMsXG4gICAgICAgICAgICBpbmNsdWRlLFxuICAgICAgICAgICAgdW5kZWZpbmVkLFxuICAgICAgICAgICAgdW5kZWZpbmVkLFxuICAgICAgICAgICAgY29uZmlnLFxuICAgICAgICAgICAgYXV0aCxcbiAgICAgICAgICAgIGluZm8sXG4gICAgICAgICAgICBwYXJzZUdyYXBoUUxTY2hlbWEucGFyc2VDbGFzc2VzXG4gICAgICAgICAgKSksXG4gICAgICAgIH07XG4gICAgICB9IGNhdGNoIChlKSB7XG4gICAgICAgIHBhcnNlR3JhcGhRTFNjaGVtYS5oYW5kbGVFcnJvcihlKTtcbiAgICAgIH1cbiAgICB9LFxuICAgIG9iaiA9PiB7XG4gICAgICByZXR1cm4gcGFyc2VHcmFwaFFMU2NoZW1hLnBhcnNlQ2xhc3NUeXBlc1tvYmouY2xhc3NOYW1lXVxuICAgICAgICAuY2xhc3NHcmFwaFFMT3V0cHV0VHlwZTtcbiAgICB9XG4gICk7XG5cbiAgcGFyc2VHcmFwaFFMU2NoZW1hLmFkZEdyYXBoUUxUeXBlKG5vZGVJbnRlcmZhY2UsIHRydWUpO1xuICBwYXJzZUdyYXBoUUxTY2hlbWEucmVsYXlOb2RlSW50ZXJmYWNlID0gbm9kZUludGVyZmFjZTtcbiAgcGFyc2VHcmFwaFFMU2NoZW1hLmFkZEdyYXBoUUxRdWVyeSgnbm9kZScsIG5vZGVGaWVsZCwgdHJ1ZSk7XG59O1xuXG5leHBvcnQgeyBHTE9CQUxfSURfQVRULCBsb2FkIH07XG4iXX0=