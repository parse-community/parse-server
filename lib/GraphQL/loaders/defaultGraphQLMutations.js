"use strict";

Object.defineProperty(exports, "__esModule", {
  value: true
});
exports.load = void 0;

var filesMutations = _interopRequireWildcard(require("./filesMutations"));

var usersMutations = _interopRequireWildcard(require("./usersMutations"));

var functionsMutations = _interopRequireWildcard(require("./functionsMutations"));

var schemaMutations = _interopRequireWildcard(require("./schemaMutations"));

function _getRequireWildcardCache() { if (typeof WeakMap !== "function") return null; var cache = new WeakMap(); _getRequireWildcardCache = function () { return cache; }; return cache; }

function _interopRequireWildcard(obj) { if (obj && obj.__esModule) { return obj; } if (obj === null || typeof obj !== "object" && typeof obj !== "function") { return { default: obj }; } var cache = _getRequireWildcardCache(); if (cache && cache.has(obj)) { return cache.get(obj); } var newObj = {}; var hasPropertyDescriptor = Object.defineProperty && Object.getOwnPropertyDescriptor; for (var key in obj) { if (Object.prototype.hasOwnProperty.call(obj, key)) { var desc = hasPropertyDescriptor ? Object.getOwnPropertyDescriptor(obj, key) : null; if (desc && (desc.get || desc.set)) { Object.defineProperty(newObj, key, desc); } else { newObj[key] = obj[key]; } } } newObj.default = obj; if (cache) { cache.set(obj, newObj); } return newObj; }

const load = parseGraphQLSchema => {
  filesMutations.load(parseGraphQLSchema);
  usersMutations.load(parseGraphQLSchema);
  functionsMutations.load(parseGraphQLSchema);
  schemaMutations.load(parseGraphQLSchema);
};

exports.load = load;
//# sourceMappingURL=data:application/json;charset=utf-8;base64,eyJ2ZXJzaW9uIjozLCJzb3VyY2VzIjpbIi4uLy4uLy4uL3NyYy9HcmFwaFFML2xvYWRlcnMvZGVmYXVsdEdyYXBoUUxNdXRhdGlvbnMuanMiXSwibmFtZXMiOlsibG9hZCIsInBhcnNlR3JhcGhRTFNjaGVtYSIsImZpbGVzTXV0YXRpb25zIiwidXNlcnNNdXRhdGlvbnMiLCJmdW5jdGlvbnNNdXRhdGlvbnMiLCJzY2hlbWFNdXRhdGlvbnMiXSwibWFwcGluZ3MiOiI7Ozs7Ozs7QUFBQTs7QUFDQTs7QUFDQTs7QUFDQTs7Ozs7O0FBRUEsTUFBTUEsSUFBSSxHQUFHQyxrQkFBa0IsSUFBSTtBQUNqQ0MsRUFBQUEsY0FBYyxDQUFDRixJQUFmLENBQW9CQyxrQkFBcEI7QUFDQUUsRUFBQUEsY0FBYyxDQUFDSCxJQUFmLENBQW9CQyxrQkFBcEI7QUFDQUcsRUFBQUEsa0JBQWtCLENBQUNKLElBQW5CLENBQXdCQyxrQkFBeEI7QUFDQUksRUFBQUEsZUFBZSxDQUFDTCxJQUFoQixDQUFxQkMsa0JBQXJCO0FBQ0QsQ0FMRCIsInNvdXJjZXNDb250ZW50IjpbImltcG9ydCAqIGFzIGZpbGVzTXV0YXRpb25zIGZyb20gJy4vZmlsZXNNdXRhdGlvbnMnO1xuaW1wb3J0ICogYXMgdXNlcnNNdXRhdGlvbnMgZnJvbSAnLi91c2Vyc011dGF0aW9ucyc7XG5pbXBvcnQgKiBhcyBmdW5jdGlvbnNNdXRhdGlvbnMgZnJvbSAnLi9mdW5jdGlvbnNNdXRhdGlvbnMnO1xuaW1wb3J0ICogYXMgc2NoZW1hTXV0YXRpb25zIGZyb20gJy4vc2NoZW1hTXV0YXRpb25zJztcblxuY29uc3QgbG9hZCA9IHBhcnNlR3JhcGhRTFNjaGVtYSA9PiB7XG4gIGZpbGVzTXV0YXRpb25zLmxvYWQocGFyc2VHcmFwaFFMU2NoZW1hKTtcbiAgdXNlcnNNdXRhdGlvbnMubG9hZChwYXJzZUdyYXBoUUxTY2hlbWEpO1xuICBmdW5jdGlvbnNNdXRhdGlvbnMubG9hZChwYXJzZUdyYXBoUUxTY2hlbWEpO1xuICBzY2hlbWFNdXRhdGlvbnMubG9hZChwYXJzZUdyYXBoUUxTY2hlbWEpO1xufTtcblxuZXhwb3J0IHsgbG9hZCB9O1xuIl19