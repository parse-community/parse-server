"use strict";

Object.defineProperty(exports, "__esModule", {
  value: true
});
exports.load = void 0;
var _graphql = require("graphql");
var usersQueries = _interopRequireWildcard(require("./usersQueries"));
var schemaQueries = _interopRequireWildcard(require("./schemaQueries"));
function _getRequireWildcardCache(nodeInterop) { if (typeof WeakMap !== "function") return null; var cacheBabelInterop = new WeakMap(); var cacheNodeInterop = new WeakMap(); return (_getRequireWildcardCache = function (nodeInterop) { return nodeInterop ? cacheNodeInterop : cacheBabelInterop; })(nodeInterop); }
function _interopRequireWildcard(obj, nodeInterop) { if (!nodeInterop && obj && obj.__esModule) { return obj; } if (obj === null || typeof obj !== "object" && typeof obj !== "function") { return { default: obj }; } var cache = _getRequireWildcardCache(nodeInterop); if (cache && cache.has(obj)) { return cache.get(obj); } var newObj = {}; var hasPropertyDescriptor = Object.defineProperty && Object.getOwnPropertyDescriptor; for (var key in obj) { if (key !== "default" && Object.prototype.hasOwnProperty.call(obj, key)) { var desc = hasPropertyDescriptor ? Object.getOwnPropertyDescriptor(obj, key) : null; if (desc && (desc.get || desc.set)) { Object.defineProperty(newObj, key, desc); } else { newObj[key] = obj[key]; } } } newObj.default = obj; if (cache) { cache.set(obj, newObj); } return newObj; }
const load = parseGraphQLSchema => {
  parseGraphQLSchema.addGraphQLQuery('health', {
    description: 'The health query can be used to check if the server is up and running.',
    type: new _graphql.GraphQLNonNull(_graphql.GraphQLBoolean),
    resolve: () => true
  }, true, true);
  usersQueries.load(parseGraphQLSchema);
  schemaQueries.load(parseGraphQLSchema);
};
exports.load = load;
//# sourceMappingURL=data:application/json;charset=utf-8;base64,eyJ2ZXJzaW9uIjozLCJuYW1lcyI6WyJsb2FkIiwicGFyc2VHcmFwaFFMU2NoZW1hIiwiYWRkR3JhcGhRTFF1ZXJ5IiwiZGVzY3JpcHRpb24iLCJ0eXBlIiwiR3JhcGhRTE5vbk51bGwiLCJHcmFwaFFMQm9vbGVhbiIsInJlc29sdmUiLCJ1c2Vyc1F1ZXJpZXMiLCJzY2hlbWFRdWVyaWVzIl0sInNvdXJjZXMiOlsiLi4vLi4vLi4vc3JjL0dyYXBoUUwvbG9hZGVycy9kZWZhdWx0R3JhcGhRTFF1ZXJpZXMuanMiXSwic291cmNlc0NvbnRlbnQiOlsiaW1wb3J0IHsgR3JhcGhRTE5vbk51bGwsIEdyYXBoUUxCb29sZWFuIH0gZnJvbSAnZ3JhcGhxbCc7XG5pbXBvcnQgKiBhcyB1c2Vyc1F1ZXJpZXMgZnJvbSAnLi91c2Vyc1F1ZXJpZXMnO1xuaW1wb3J0ICogYXMgc2NoZW1hUXVlcmllcyBmcm9tICcuL3NjaGVtYVF1ZXJpZXMnO1xuXG5jb25zdCBsb2FkID0gcGFyc2VHcmFwaFFMU2NoZW1hID0+IHtcbiAgcGFyc2VHcmFwaFFMU2NoZW1hLmFkZEdyYXBoUUxRdWVyeShcbiAgICAnaGVhbHRoJyxcbiAgICB7XG4gICAgICBkZXNjcmlwdGlvbjogJ1RoZSBoZWFsdGggcXVlcnkgY2FuIGJlIHVzZWQgdG8gY2hlY2sgaWYgdGhlIHNlcnZlciBpcyB1cCBhbmQgcnVubmluZy4nLFxuICAgICAgdHlwZTogbmV3IEdyYXBoUUxOb25OdWxsKEdyYXBoUUxCb29sZWFuKSxcbiAgICAgIHJlc29sdmU6ICgpID0+IHRydWUsXG4gICAgfSxcbiAgICB0cnVlLFxuICAgIHRydWVcbiAgKTtcblxuICB1c2Vyc1F1ZXJpZXMubG9hZChwYXJzZUdyYXBoUUxTY2hlbWEpO1xuICBzY2hlbWFRdWVyaWVzLmxvYWQocGFyc2VHcmFwaFFMU2NoZW1hKTtcbn07XG5cbmV4cG9ydCB7IGxvYWQgfTtcbiJdLCJtYXBwaW5ncyI6Ijs7Ozs7O0FBQUE7QUFDQTtBQUNBO0FBQWlEO0FBQUE7QUFFakQsTUFBTUEsSUFBSSxHQUFHQyxrQkFBa0IsSUFBSTtFQUNqQ0Esa0JBQWtCLENBQUNDLGVBQWUsQ0FDaEMsUUFBUSxFQUNSO0lBQ0VDLFdBQVcsRUFBRSx3RUFBd0U7SUFDckZDLElBQUksRUFBRSxJQUFJQyx1QkFBYyxDQUFDQyx1QkFBYyxDQUFDO0lBQ3hDQyxPQUFPLEVBQUUsTUFBTTtFQUNqQixDQUFDLEVBQ0QsSUFBSSxFQUNKLElBQUksQ0FDTDtFQUVEQyxZQUFZLENBQUNSLElBQUksQ0FBQ0Msa0JBQWtCLENBQUM7RUFDckNRLGFBQWEsQ0FBQ1QsSUFBSSxDQUFDQyxrQkFBa0IsQ0FBQztBQUN4QyxDQUFDO0FBQUMifQ==