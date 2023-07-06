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
//# sourceMappingURL=data:application/json;charset=utf-8;base64,eyJ2ZXJzaW9uIjozLCJuYW1lcyI6WyJfUGFyc2VTZXJ2ZXIiLCJvcHRpb25zIiwic2VydmVyIiwiUGFyc2VTZXJ2ZXIiLCJjcmVhdGVMaXZlUXVlcnlTZXJ2ZXIiLCJzdGFydEFwcCIsIlMzQWRhcHRlciIsInVzZUV4dGVybmFsIiwiR0NTQWRhcHRlciIsIk9iamVjdCIsImRlZmluZVByb3BlcnR5IiwibW9kdWxlIiwiZXhwb3J0cyIsImdldCIsImdldExvZ2dlciJdLCJzb3VyY2VzIjpbIi4uL3NyYy9pbmRleC5qcyJdLCJzb3VyY2VzQ29udGVudCI6WyJpbXBvcnQgUGFyc2VTZXJ2ZXIgZnJvbSAnLi9QYXJzZVNlcnZlcic7XG5pbXBvcnQgRmlsZVN5c3RlbUFkYXB0ZXIgZnJvbSAnQHBhcnNlL2ZzLWZpbGVzLWFkYXB0ZXInO1xuaW1wb3J0IEluTWVtb3J5Q2FjaGVBZGFwdGVyIGZyb20gJy4vQWRhcHRlcnMvQ2FjaGUvSW5NZW1vcnlDYWNoZUFkYXB0ZXInO1xuaW1wb3J0IE51bGxDYWNoZUFkYXB0ZXIgZnJvbSAnLi9BZGFwdGVycy9DYWNoZS9OdWxsQ2FjaGVBZGFwdGVyJztcbmltcG9ydCBSZWRpc0NhY2hlQWRhcHRlciBmcm9tICcuL0FkYXB0ZXJzL0NhY2hlL1JlZGlzQ2FjaGVBZGFwdGVyJztcbmltcG9ydCBMUlVDYWNoZUFkYXB0ZXIgZnJvbSAnLi9BZGFwdGVycy9DYWNoZS9MUlVDYWNoZS5qcyc7XG5pbXBvcnQgKiBhcyBUZXN0VXRpbHMgZnJvbSAnLi9UZXN0VXRpbHMnO1xuaW1wb3J0ICogYXMgU2NoZW1hTWlncmF0aW9ucyBmcm9tICcuL1NjaGVtYU1pZ3JhdGlvbnMvTWlncmF0aW9ucyc7XG5pbXBvcnQgQXV0aEFkYXB0ZXIgZnJvbSAnLi9BZGFwdGVycy9BdXRoL0F1dGhBZGFwdGVyJztcbmltcG9ydCB7IHVzZUV4dGVybmFsIH0gZnJvbSAnLi9kZXByZWNhdGVkJztcbmltcG9ydCB7IGdldExvZ2dlciB9IGZyb20gJy4vbG9nZ2VyJztcbmltcG9ydCB7IFB1c2hXb3JrZXIgfSBmcm9tICcuL1B1c2gvUHVzaFdvcmtlcic7XG5pbXBvcnQgeyBQYXJzZVNlcnZlck9wdGlvbnMgfSBmcm9tICcuL09wdGlvbnMnO1xuaW1wb3J0IHsgUGFyc2VHcmFwaFFMU2VydmVyIH0gZnJvbSAnLi9HcmFwaFFML1BhcnNlR3JhcGhRTFNlcnZlcic7XG5cbi8vIEZhY3RvcnkgZnVuY3Rpb25cbmNvbnN0IF9QYXJzZVNlcnZlciA9IGZ1bmN0aW9uIChvcHRpb25zOiBQYXJzZVNlcnZlck9wdGlvbnMpIHtcbiAgY29uc3Qgc2VydmVyID0gbmV3IFBhcnNlU2VydmVyKG9wdGlvbnMpO1xuICByZXR1cm4gc2VydmVyO1xufTtcbi8vIE1vdW50IHRoZSBjcmVhdGUgbGl2ZVF1ZXJ5U2VydmVyXG5fUGFyc2VTZXJ2ZXIuY3JlYXRlTGl2ZVF1ZXJ5U2VydmVyID0gUGFyc2VTZXJ2ZXIuY3JlYXRlTGl2ZVF1ZXJ5U2VydmVyO1xuX1BhcnNlU2VydmVyLnN0YXJ0QXBwID0gUGFyc2VTZXJ2ZXIuc3RhcnRBcHA7XG5cbmNvbnN0IFMzQWRhcHRlciA9IHVzZUV4dGVybmFsKCdTM0FkYXB0ZXInLCAnQHBhcnNlL3MzLWZpbGVzLWFkYXB0ZXInKTtcbmNvbnN0IEdDU0FkYXB0ZXIgPSB1c2VFeHRlcm5hbCgnR0NTQWRhcHRlcicsICdAcGFyc2UvZ2NzLWZpbGVzLWFkYXB0ZXInKTtcblxuT2JqZWN0LmRlZmluZVByb3BlcnR5KG1vZHVsZS5leHBvcnRzLCAnbG9nZ2VyJywge1xuICBnZXQ6IGdldExvZ2dlcixcbn0pO1xuXG5leHBvcnQgZGVmYXVsdCBQYXJzZVNlcnZlcjtcbmV4cG9ydCB7XG4gIFMzQWRhcHRlcixcbiAgR0NTQWRhcHRlcixcbiAgRmlsZVN5c3RlbUFkYXB0ZXIsXG4gIEluTWVtb3J5Q2FjaGVBZGFwdGVyLFxuICBOdWxsQ2FjaGVBZGFwdGVyLFxuICBSZWRpc0NhY2hlQWRhcHRlcixcbiAgTFJVQ2FjaGVBZGFwdGVyLFxuICBUZXN0VXRpbHMsXG4gIFB1c2hXb3JrZXIsXG4gIFBhcnNlR3JhcGhRTFNlcnZlcixcbiAgX1BhcnNlU2VydmVyIGFzIFBhcnNlU2VydmVyLFxuICBTY2hlbWFNaWdyYXRpb25zLFxuICBBdXRoQWRhcHRlcixcbn07XG4iXSwibWFwcGluZ3MiOiI7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7O0FBQUE7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFBeUM7QUFDekM7QUFBa0U7QUFDbEU7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQWtFO0FBQUE7QUFBQTtBQUVsRTtBQUNBLE1BQU1BLFlBQVksR0FBRyxVQUFVQyxPQUEyQixFQUFFO0VBQzFELE1BQU1DLE1BQU0sR0FBRyxJQUFJQyxxQkFBVyxDQUFDRixPQUFPLENBQUM7RUFDdkMsT0FBT0MsTUFBTTtBQUNmLENBQUM7QUFDRDtBQUFBO0FBQ0FGLFlBQVksQ0FBQ0kscUJBQXFCLEdBQUdELHFCQUFXLENBQUNDLHFCQUFxQjtBQUN0RUosWUFBWSxDQUFDSyxRQUFRLEdBQUdGLHFCQUFXLENBQUNFLFFBQVE7QUFFNUMsTUFBTUMsU0FBUyxHQUFHLElBQUFDLHVCQUFXLEVBQUMsV0FBVyxFQUFFLHlCQUF5QixDQUFDO0FBQUM7QUFDdEUsTUFBTUMsVUFBVSxHQUFHLElBQUFELHVCQUFXLEVBQUMsWUFBWSxFQUFFLDBCQUEwQixDQUFDO0FBQUM7QUFFekVFLE1BQU0sQ0FBQ0MsY0FBYyxDQUFDQyxNQUFNLENBQUNDLE9BQU8sRUFBRSxRQUFRLEVBQUU7RUFDOUNDLEdBQUcsRUFBRUM7QUFDUCxDQUFDLENBQUM7QUFBQyxlQUVZWCxxQkFBVztBQUFBIn0=