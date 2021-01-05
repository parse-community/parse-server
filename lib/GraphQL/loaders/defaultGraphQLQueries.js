"use strict";

Object.defineProperty(exports, "__esModule", {
  value: true
});
exports.load = void 0;

var _graphql = require("graphql");

var usersQueries = _interopRequireWildcard(require("./usersQueries"));

var schemaQueries = _interopRequireWildcard(require("./schemaQueries"));

function _getRequireWildcardCache() { if (typeof WeakMap !== "function") return null; var cache = new WeakMap(); _getRequireWildcardCache = function () { return cache; }; return cache; }

function _interopRequireWildcard(obj) { if (obj && obj.__esModule) { return obj; } if (obj === null || typeof obj !== "object" && typeof obj !== "function") { return { default: obj }; } var cache = _getRequireWildcardCache(); if (cache && cache.has(obj)) { return cache.get(obj); } var newObj = {}; var hasPropertyDescriptor = Object.defineProperty && Object.getOwnPropertyDescriptor; for (var key in obj) { if (Object.prototype.hasOwnProperty.call(obj, key)) { var desc = hasPropertyDescriptor ? Object.getOwnPropertyDescriptor(obj, key) : null; if (desc && (desc.get || desc.set)) { Object.defineProperty(newObj, key, desc); } else { newObj[key] = obj[key]; } } } newObj.default = obj; if (cache) { cache.set(obj, newObj); } return newObj; }

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
//# sourceMappingURL=data:application/json;charset=utf-8;base64,eyJ2ZXJzaW9uIjozLCJzb3VyY2VzIjpbIi4uLy4uLy4uL3NyYy9HcmFwaFFML2xvYWRlcnMvZGVmYXVsdEdyYXBoUUxRdWVyaWVzLmpzIl0sIm5hbWVzIjpbImxvYWQiLCJwYXJzZUdyYXBoUUxTY2hlbWEiLCJhZGRHcmFwaFFMUXVlcnkiLCJkZXNjcmlwdGlvbiIsInR5cGUiLCJHcmFwaFFMTm9uTnVsbCIsIkdyYXBoUUxCb29sZWFuIiwicmVzb2x2ZSIsInVzZXJzUXVlcmllcyIsInNjaGVtYVF1ZXJpZXMiXSwibWFwcGluZ3MiOiI7Ozs7Ozs7QUFBQTs7QUFDQTs7QUFDQTs7Ozs7O0FBRUEsTUFBTUEsSUFBSSxHQUFHQyxrQkFBa0IsSUFBSTtBQUNqQ0EsRUFBQUEsa0JBQWtCLENBQUNDLGVBQW5CLENBQ0UsUUFERixFQUVFO0FBQ0VDLElBQUFBLFdBQVcsRUFBRSx3RUFEZjtBQUVFQyxJQUFBQSxJQUFJLEVBQUUsSUFBSUMsdUJBQUosQ0FBbUJDLHVCQUFuQixDQUZSO0FBR0VDLElBQUFBLE9BQU8sRUFBRSxNQUFNO0FBSGpCLEdBRkYsRUFPRSxJQVBGLEVBUUUsSUFSRjtBQVdBQyxFQUFBQSxZQUFZLENBQUNSLElBQWIsQ0FBa0JDLGtCQUFsQjtBQUNBUSxFQUFBQSxhQUFhLENBQUNULElBQWQsQ0FBbUJDLGtCQUFuQjtBQUNELENBZEQiLCJzb3VyY2VzQ29udGVudCI6WyJpbXBvcnQgeyBHcmFwaFFMTm9uTnVsbCwgR3JhcGhRTEJvb2xlYW4gfSBmcm9tICdncmFwaHFsJztcbmltcG9ydCAqIGFzIHVzZXJzUXVlcmllcyBmcm9tICcuL3VzZXJzUXVlcmllcyc7XG5pbXBvcnQgKiBhcyBzY2hlbWFRdWVyaWVzIGZyb20gJy4vc2NoZW1hUXVlcmllcyc7XG5cbmNvbnN0IGxvYWQgPSBwYXJzZUdyYXBoUUxTY2hlbWEgPT4ge1xuICBwYXJzZUdyYXBoUUxTY2hlbWEuYWRkR3JhcGhRTFF1ZXJ5KFxuICAgICdoZWFsdGgnLFxuICAgIHtcbiAgICAgIGRlc2NyaXB0aW9uOiAnVGhlIGhlYWx0aCBxdWVyeSBjYW4gYmUgdXNlZCB0byBjaGVjayBpZiB0aGUgc2VydmVyIGlzIHVwIGFuZCBydW5uaW5nLicsXG4gICAgICB0eXBlOiBuZXcgR3JhcGhRTE5vbk51bGwoR3JhcGhRTEJvb2xlYW4pLFxuICAgICAgcmVzb2x2ZTogKCkgPT4gdHJ1ZSxcbiAgICB9LFxuICAgIHRydWUsXG4gICAgdHJ1ZVxuICApO1xuXG4gIHVzZXJzUXVlcmllcy5sb2FkKHBhcnNlR3JhcGhRTFNjaGVtYSk7XG4gIHNjaGVtYVF1ZXJpZXMubG9hZChwYXJzZUdyYXBoUUxTY2hlbWEpO1xufTtcblxuZXhwb3J0IHsgbG9hZCB9O1xuIl19