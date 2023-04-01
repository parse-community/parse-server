"use strict";

Object.defineProperty(exports, "__esModule", {
  value: true
});
exports.load = void 0;
var filesMutations = _interopRequireWildcard(require("./filesMutations"));
var usersMutations = _interopRequireWildcard(require("./usersMutations"));
var functionsMutations = _interopRequireWildcard(require("./functionsMutations"));
var schemaMutations = _interopRequireWildcard(require("./schemaMutations"));
function _getRequireWildcardCache(nodeInterop) { if (typeof WeakMap !== "function") return null; var cacheBabelInterop = new WeakMap(); var cacheNodeInterop = new WeakMap(); return (_getRequireWildcardCache = function (nodeInterop) { return nodeInterop ? cacheNodeInterop : cacheBabelInterop; })(nodeInterop); }
function _interopRequireWildcard(obj, nodeInterop) { if (!nodeInterop && obj && obj.__esModule) { return obj; } if (obj === null || typeof obj !== "object" && typeof obj !== "function") { return { default: obj }; } var cache = _getRequireWildcardCache(nodeInterop); if (cache && cache.has(obj)) { return cache.get(obj); } var newObj = {}; var hasPropertyDescriptor = Object.defineProperty && Object.getOwnPropertyDescriptor; for (var key in obj) { if (key !== "default" && Object.prototype.hasOwnProperty.call(obj, key)) { var desc = hasPropertyDescriptor ? Object.getOwnPropertyDescriptor(obj, key) : null; if (desc && (desc.get || desc.set)) { Object.defineProperty(newObj, key, desc); } else { newObj[key] = obj[key]; } } } newObj.default = obj; if (cache) { cache.set(obj, newObj); } return newObj; }
const load = parseGraphQLSchema => {
  filesMutations.load(parseGraphQLSchema);
  usersMutations.load(parseGraphQLSchema);
  functionsMutations.load(parseGraphQLSchema);
  schemaMutations.load(parseGraphQLSchema);
};
exports.load = load;
//# sourceMappingURL=data:application/json;charset=utf-8;base64,eyJ2ZXJzaW9uIjozLCJuYW1lcyI6WyJsb2FkIiwicGFyc2VHcmFwaFFMU2NoZW1hIiwiZmlsZXNNdXRhdGlvbnMiLCJ1c2Vyc011dGF0aW9ucyIsImZ1bmN0aW9uc011dGF0aW9ucyIsInNjaGVtYU11dGF0aW9ucyJdLCJzb3VyY2VzIjpbIi4uLy4uLy4uL3NyYy9HcmFwaFFML2xvYWRlcnMvZGVmYXVsdEdyYXBoUUxNdXRhdGlvbnMuanMiXSwic291cmNlc0NvbnRlbnQiOlsiaW1wb3J0ICogYXMgZmlsZXNNdXRhdGlvbnMgZnJvbSAnLi9maWxlc011dGF0aW9ucyc7XG5pbXBvcnQgKiBhcyB1c2Vyc011dGF0aW9ucyBmcm9tICcuL3VzZXJzTXV0YXRpb25zJztcbmltcG9ydCAqIGFzIGZ1bmN0aW9uc011dGF0aW9ucyBmcm9tICcuL2Z1bmN0aW9uc011dGF0aW9ucyc7XG5pbXBvcnQgKiBhcyBzY2hlbWFNdXRhdGlvbnMgZnJvbSAnLi9zY2hlbWFNdXRhdGlvbnMnO1xuXG5jb25zdCBsb2FkID0gcGFyc2VHcmFwaFFMU2NoZW1hID0+IHtcbiAgZmlsZXNNdXRhdGlvbnMubG9hZChwYXJzZUdyYXBoUUxTY2hlbWEpO1xuICB1c2Vyc011dGF0aW9ucy5sb2FkKHBhcnNlR3JhcGhRTFNjaGVtYSk7XG4gIGZ1bmN0aW9uc011dGF0aW9ucy5sb2FkKHBhcnNlR3JhcGhRTFNjaGVtYSk7XG4gIHNjaGVtYU11dGF0aW9ucy5sb2FkKHBhcnNlR3JhcGhRTFNjaGVtYSk7XG59O1xuXG5leHBvcnQgeyBsb2FkIH07XG4iXSwibWFwcGluZ3MiOiI7Ozs7OztBQUFBO0FBQ0E7QUFDQTtBQUNBO0FBQXFEO0FBQUE7QUFFckQsTUFBTUEsSUFBSSxHQUFHQyxrQkFBa0IsSUFBSTtFQUNqQ0MsY0FBYyxDQUFDRixJQUFJLENBQUNDLGtCQUFrQixDQUFDO0VBQ3ZDRSxjQUFjLENBQUNILElBQUksQ0FBQ0Msa0JBQWtCLENBQUM7RUFDdkNHLGtCQUFrQixDQUFDSixJQUFJLENBQUNDLGtCQUFrQixDQUFDO0VBQzNDSSxlQUFlLENBQUNMLElBQUksQ0FBQ0Msa0JBQWtCLENBQUM7QUFDMUMsQ0FBQztBQUFDIn0=