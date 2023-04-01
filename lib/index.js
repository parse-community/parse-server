"use strict";

Object.defineProperty(exports, "__esModule", {
  value: true
});
Object.defineProperty(exports, "AuthAdapter", {
  enumerable: true,
  get: function () {
    return _AuthAdapter.default;
  }
});
Object.defineProperty(exports, "FileSystemAdapter", {
  enumerable: true,
  get: function () {
    return _fsFilesAdapter.default;
  }
});
exports.GCSAdapter = void 0;
Object.defineProperty(exports, "InMemoryCacheAdapter", {
  enumerable: true,
  get: function () {
    return _InMemoryCacheAdapter.default;
  }
});
Object.defineProperty(exports, "LRUCacheAdapter", {
  enumerable: true,
  get: function () {
    return _LRUCache.default;
  }
});
Object.defineProperty(exports, "NullCacheAdapter", {
  enumerable: true,
  get: function () {
    return _NullCacheAdapter.default;
  }
});
Object.defineProperty(exports, "ParseGraphQLServer", {
  enumerable: true,
  get: function () {
    return _ParseGraphQLServer.ParseGraphQLServer;
  }
});
exports.ParseServer = void 0;
Object.defineProperty(exports, "PushWorker", {
  enumerable: true,
  get: function () {
    return _PushWorker.PushWorker;
  }
});
Object.defineProperty(exports, "RedisCacheAdapter", {
  enumerable: true,
  get: function () {
    return _RedisCacheAdapter.default;
  }
});
exports.default = exports.TestUtils = exports.SchemaMigrations = exports.S3Adapter = void 0;
var _ParseServer2 = _interopRequireDefault(require("./ParseServer"));
var _fsFilesAdapter = _interopRequireDefault(require("@parse/fs-files-adapter"));
var _InMemoryCacheAdapter = _interopRequireDefault(require("./Adapters/Cache/InMemoryCacheAdapter"));
var _NullCacheAdapter = _interopRequireDefault(require("./Adapters/Cache/NullCacheAdapter"));
var _RedisCacheAdapter = _interopRequireDefault(require("./Adapters/Cache/RedisCacheAdapter"));
var _LRUCache = _interopRequireDefault(require("./Adapters/Cache/LRUCache.js"));
var TestUtils = _interopRequireWildcard(require("./TestUtils"));
exports.TestUtils = TestUtils;
var SchemaMigrations = _interopRequireWildcard(require("./SchemaMigrations/Migrations"));
exports.SchemaMigrations = SchemaMigrations;
var _AuthAdapter = _interopRequireDefault(require("./Adapters/Auth/AuthAdapter"));
var _deprecated = require("./deprecated");
var _logger = require("./logger");
var _PushWorker = require("./Push/PushWorker");
var _Options = require("./Options");
var _ParseGraphQLServer = require("./GraphQL/ParseGraphQLServer");
function _getRequireWildcardCache(nodeInterop) { if (typeof WeakMap !== "function") return null; var cacheBabelInterop = new WeakMap(); var cacheNodeInterop = new WeakMap(); return (_getRequireWildcardCache = function (nodeInterop) { return nodeInterop ? cacheNodeInterop : cacheBabelInterop; })(nodeInterop); }
function _interopRequireWildcard(obj, nodeInterop) { if (!nodeInterop && obj && obj.__esModule) { return obj; } if (obj === null || typeof obj !== "object" && typeof obj !== "function") { return { default: obj }; } var cache = _getRequireWildcardCache(nodeInterop); if (cache && cache.has(obj)) { return cache.get(obj); } var newObj = {}; var hasPropertyDescriptor = Object.defineProperty && Object.getOwnPropertyDescriptor; for (var key in obj) { if (key !== "default" && Object.prototype.hasOwnProperty.call(obj, key)) { var desc = hasPropertyDescriptor ? Object.getOwnPropertyDescriptor(obj, key) : null; if (desc && (desc.get || desc.set)) { Object.defineProperty(newObj, key, desc); } else { newObj[key] = obj[key]; } } } newObj.default = obj; if (cache) { cache.set(obj, newObj); } return newObj; }
function _interopRequireDefault(obj) { return obj && obj.__esModule ? obj : { default: obj }; }
// Factory function
const _ParseServer = function (options) {
  const server = new _ParseServer2.default(options);
  return server;
};
// Mount the create liveQueryServer
exports.ParseServer = _ParseServer;
_ParseServer.createLiveQueryServer = _ParseServer2.default.createLiveQueryServer;
_ParseServer.startApp = _ParseServer2.default.startApp;
const S3Adapter = (0, _deprecated.useExternal)('S3Adapter', '@parse/s3-files-adapter');
exports.S3Adapter = S3Adapter;
const GCSAdapter = (0, _deprecated.useExternal)('GCSAdapter', '@parse/gcs-files-adapter');
exports.GCSAdapter = GCSAdapter;
Object.defineProperty(module.exports, 'logger', {
  get: _logger.getLogger
});
var _default = _ParseServer2.default;
exports.default = _default;
//# sourceMappingURL=data:application/json;charset=utf-8;base64,eyJ2ZXJzaW9uIjozLCJuYW1lcyI6WyJfUGFyc2VTZXJ2ZXIiLCJvcHRpb25zIiwic2VydmVyIiwiUGFyc2VTZXJ2ZXIiLCJjcmVhdGVMaXZlUXVlcnlTZXJ2ZXIiLCJzdGFydEFwcCIsIlMzQWRhcHRlciIsInVzZUV4dGVybmFsIiwiR0NTQWRhcHRlciIsIk9iamVjdCIsImRlZmluZVByb3BlcnR5IiwibW9kdWxlIiwiZXhwb3J0cyIsImdldCIsImdldExvZ2dlciJdLCJzb3VyY2VzIjpbIi4uL3NyYy9pbmRleC5qcyJdLCJzb3VyY2VzQ29udGVudCI6WyJpbXBvcnQgUGFyc2VTZXJ2ZXIgZnJvbSAnLi9QYXJzZVNlcnZlcic7XG5pbXBvcnQgRmlsZVN5c3RlbUFkYXB0ZXIgZnJvbSAnQHBhcnNlL2ZzLWZpbGVzLWFkYXB0ZXInO1xuaW1wb3J0IEluTWVtb3J5Q2FjaGVBZGFwdGVyIGZyb20gJy4vQWRhcHRlcnMvQ2FjaGUvSW5NZW1vcnlDYWNoZUFkYXB0ZXInO1xuaW1wb3J0IE51bGxDYWNoZUFkYXB0ZXIgZnJvbSAnLi9BZGFwdGVycy9DYWNoZS9OdWxsQ2FjaGVBZGFwdGVyJztcbmltcG9ydCBSZWRpc0NhY2hlQWRhcHRlciBmcm9tICcuL0FkYXB0ZXJzL0NhY2hlL1JlZGlzQ2FjaGVBZGFwdGVyJztcbmltcG9ydCBMUlVDYWNoZUFkYXB0ZXIgZnJvbSAnLi9BZGFwdGVycy9DYWNoZS9MUlVDYWNoZS5qcyc7XG5pbXBvcnQgKiBhcyBUZXN0VXRpbHMgZnJvbSAnLi9UZXN0VXRpbHMnO1xuaW1wb3J0ICogYXMgU2NoZW1hTWlncmF0aW9ucyBmcm9tICcuL1NjaGVtYU1pZ3JhdGlvbnMvTWlncmF0aW9ucyc7XG5pbXBvcnQgQXV0aEFkYXB0ZXIgZnJvbSAnLi9BZGFwdGVycy9BdXRoL0F1dGhBZGFwdGVyJztcblxuaW1wb3J0IHsgdXNlRXh0ZXJuYWwgfSBmcm9tICcuL2RlcHJlY2F0ZWQnO1xuaW1wb3J0IHsgZ2V0TG9nZ2VyIH0gZnJvbSAnLi9sb2dnZXInO1xuaW1wb3J0IHsgUHVzaFdvcmtlciB9IGZyb20gJy4vUHVzaC9QdXNoV29ya2VyJztcbmltcG9ydCB7IFBhcnNlU2VydmVyT3B0aW9ucyB9IGZyb20gJy4vT3B0aW9ucyc7XG5pbXBvcnQgeyBQYXJzZUdyYXBoUUxTZXJ2ZXIgfSBmcm9tICcuL0dyYXBoUUwvUGFyc2VHcmFwaFFMU2VydmVyJztcblxuLy8gRmFjdG9yeSBmdW5jdGlvblxuY29uc3QgX1BhcnNlU2VydmVyID0gZnVuY3Rpb24gKG9wdGlvbnM6IFBhcnNlU2VydmVyT3B0aW9ucykge1xuICBjb25zdCBzZXJ2ZXIgPSBuZXcgUGFyc2VTZXJ2ZXIob3B0aW9ucyk7XG4gIHJldHVybiBzZXJ2ZXI7XG59O1xuLy8gTW91bnQgdGhlIGNyZWF0ZSBsaXZlUXVlcnlTZXJ2ZXJcbl9QYXJzZVNlcnZlci5jcmVhdGVMaXZlUXVlcnlTZXJ2ZXIgPSBQYXJzZVNlcnZlci5jcmVhdGVMaXZlUXVlcnlTZXJ2ZXI7XG5fUGFyc2VTZXJ2ZXIuc3RhcnRBcHAgPSBQYXJzZVNlcnZlci5zdGFydEFwcDtcblxuY29uc3QgUzNBZGFwdGVyID0gdXNlRXh0ZXJuYWwoJ1MzQWRhcHRlcicsICdAcGFyc2UvczMtZmlsZXMtYWRhcHRlcicpO1xuY29uc3QgR0NTQWRhcHRlciA9IHVzZUV4dGVybmFsKCdHQ1NBZGFwdGVyJywgJ0BwYXJzZS9nY3MtZmlsZXMtYWRhcHRlcicpO1xuXG5PYmplY3QuZGVmaW5lUHJvcGVydHkobW9kdWxlLmV4cG9ydHMsICdsb2dnZXInLCB7XG4gIGdldDogZ2V0TG9nZ2VyLFxufSk7XG5cbmV4cG9ydCBkZWZhdWx0IFBhcnNlU2VydmVyO1xuZXhwb3J0IHtcbiAgUzNBZGFwdGVyLFxuICBHQ1NBZGFwdGVyLFxuICBGaWxlU3lzdGVtQWRhcHRlcixcbiAgSW5NZW1vcnlDYWNoZUFkYXB0ZXIsXG4gIE51bGxDYWNoZUFkYXB0ZXIsXG4gIFJlZGlzQ2FjaGVBZGFwdGVyLFxuICBMUlVDYWNoZUFkYXB0ZXIsXG4gIFRlc3RVdGlscyxcbiAgUHVzaFdvcmtlcixcbiAgUGFyc2VHcmFwaFFMU2VydmVyLFxuICBfUGFyc2VTZXJ2ZXIgYXMgUGFyc2VTZXJ2ZXIsXG4gIFNjaGVtYU1pZ3JhdGlvbnMsXG4gIEF1dGhBZGFwdGVyLFxufTtcbiJdLCJtYXBwaW5ncyI6Ijs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7QUFBQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUF5QztBQUN6QztBQUFrRTtBQUNsRTtBQUVBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFBa0U7QUFBQTtBQUFBO0FBRWxFO0FBQ0EsTUFBTUEsWUFBWSxHQUFHLFVBQVVDLE9BQTJCLEVBQUU7RUFDMUQsTUFBTUMsTUFBTSxHQUFHLElBQUlDLHFCQUFXLENBQUNGLE9BQU8sQ0FBQztFQUN2QyxPQUFPQyxNQUFNO0FBQ2YsQ0FBQztBQUNEO0FBQUE7QUFDQUYsWUFBWSxDQUFDSSxxQkFBcUIsR0FBR0QscUJBQVcsQ0FBQ0MscUJBQXFCO0FBQ3RFSixZQUFZLENBQUNLLFFBQVEsR0FBR0YscUJBQVcsQ0FBQ0UsUUFBUTtBQUU1QyxNQUFNQyxTQUFTLEdBQUcsSUFBQUMsdUJBQVcsRUFBQyxXQUFXLEVBQUUseUJBQXlCLENBQUM7QUFBQztBQUN0RSxNQUFNQyxVQUFVLEdBQUcsSUFBQUQsdUJBQVcsRUFBQyxZQUFZLEVBQUUsMEJBQTBCLENBQUM7QUFBQztBQUV6RUUsTUFBTSxDQUFDQyxjQUFjLENBQUNDLE1BQU0sQ0FBQ0MsT0FBTyxFQUFFLFFBQVEsRUFBRTtFQUM5Q0MsR0FBRyxFQUFFQztBQUNQLENBQUMsQ0FBQztBQUFDLGVBRVlYLHFCQUFXO0FBQUEifQ==