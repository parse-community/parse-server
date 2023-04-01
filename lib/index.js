"use strict";

Object.defineProperty(exports, "__esModule", {
  value: true
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
  return server.app;
};
// Mount the create liveQueryServer
exports.ParseServer = _ParseServer;
_ParseServer.createLiveQueryServer = _ParseServer2.default.createLiveQueryServer;
_ParseServer.start = _ParseServer2.default.start;
const S3Adapter = (0, _deprecated.useExternal)('S3Adapter', '@parse/s3-files-adapter');
exports.S3Adapter = S3Adapter;
const GCSAdapter = (0, _deprecated.useExternal)('GCSAdapter', '@parse/gcs-files-adapter');
exports.GCSAdapter = GCSAdapter;
Object.defineProperty(module.exports, 'logger', {
  get: _logger.getLogger
});
var _default = _ParseServer2.default;
exports.default = _default;
//# sourceMappingURL=data:application/json;charset=utf-8;base64,eyJ2ZXJzaW9uIjozLCJuYW1lcyI6WyJfUGFyc2VTZXJ2ZXIyIiwiX2ludGVyb3BSZXF1aXJlRGVmYXVsdCIsInJlcXVpcmUiLCJfZnNGaWxlc0FkYXB0ZXIiLCJfSW5NZW1vcnlDYWNoZUFkYXB0ZXIiLCJfTnVsbENhY2hlQWRhcHRlciIsIl9SZWRpc0NhY2hlQWRhcHRlciIsIl9MUlVDYWNoZSIsIlRlc3RVdGlscyIsIl9pbnRlcm9wUmVxdWlyZVdpbGRjYXJkIiwiZXhwb3J0cyIsIlNjaGVtYU1pZ3JhdGlvbnMiLCJfZGVwcmVjYXRlZCIsIl9sb2dnZXIiLCJfUHVzaFdvcmtlciIsIl9PcHRpb25zIiwiX1BhcnNlR3JhcGhRTFNlcnZlciIsIl9nZXRSZXF1aXJlV2lsZGNhcmRDYWNoZSIsIm5vZGVJbnRlcm9wIiwiV2Vha01hcCIsImNhY2hlQmFiZWxJbnRlcm9wIiwiY2FjaGVOb2RlSW50ZXJvcCIsIm9iaiIsIl9fZXNNb2R1bGUiLCJkZWZhdWx0IiwiY2FjaGUiLCJoYXMiLCJnZXQiLCJuZXdPYmoiLCJoYXNQcm9wZXJ0eURlc2NyaXB0b3IiLCJPYmplY3QiLCJkZWZpbmVQcm9wZXJ0eSIsImdldE93blByb3BlcnR5RGVzY3JpcHRvciIsImtleSIsInByb3RvdHlwZSIsImhhc093blByb3BlcnR5IiwiY2FsbCIsImRlc2MiLCJzZXQiLCJfUGFyc2VTZXJ2ZXIiLCJvcHRpb25zIiwic2VydmVyIiwiUGFyc2VTZXJ2ZXIiLCJhcHAiLCJjcmVhdGVMaXZlUXVlcnlTZXJ2ZXIiLCJzdGFydCIsIlMzQWRhcHRlciIsInVzZUV4dGVybmFsIiwiR0NTQWRhcHRlciIsIm1vZHVsZSIsImdldExvZ2dlciIsIl9kZWZhdWx0Il0sInNvdXJjZXMiOlsiLi4vc3JjL2luZGV4LmpzIl0sInNvdXJjZXNDb250ZW50IjpbImltcG9ydCBQYXJzZVNlcnZlciBmcm9tICcuL1BhcnNlU2VydmVyJztcbmltcG9ydCBGaWxlU3lzdGVtQWRhcHRlciBmcm9tICdAcGFyc2UvZnMtZmlsZXMtYWRhcHRlcic7XG5pbXBvcnQgSW5NZW1vcnlDYWNoZUFkYXB0ZXIgZnJvbSAnLi9BZGFwdGVycy9DYWNoZS9Jbk1lbW9yeUNhY2hlQWRhcHRlcic7XG5pbXBvcnQgTnVsbENhY2hlQWRhcHRlciBmcm9tICcuL0FkYXB0ZXJzL0NhY2hlL051bGxDYWNoZUFkYXB0ZXInO1xuaW1wb3J0IFJlZGlzQ2FjaGVBZGFwdGVyIGZyb20gJy4vQWRhcHRlcnMvQ2FjaGUvUmVkaXNDYWNoZUFkYXB0ZXInO1xuaW1wb3J0IExSVUNhY2hlQWRhcHRlciBmcm9tICcuL0FkYXB0ZXJzL0NhY2hlL0xSVUNhY2hlLmpzJztcbmltcG9ydCAqIGFzIFRlc3RVdGlscyBmcm9tICcuL1Rlc3RVdGlscyc7XG5pbXBvcnQgKiBhcyBTY2hlbWFNaWdyYXRpb25zIGZyb20gJy4vU2NoZW1hTWlncmF0aW9ucy9NaWdyYXRpb25zJztcblxuaW1wb3J0IHsgdXNlRXh0ZXJuYWwgfSBmcm9tICcuL2RlcHJlY2F0ZWQnO1xuaW1wb3J0IHsgZ2V0TG9nZ2VyIH0gZnJvbSAnLi9sb2dnZXInO1xuaW1wb3J0IHsgUHVzaFdvcmtlciB9IGZyb20gJy4vUHVzaC9QdXNoV29ya2VyJztcbmltcG9ydCB7IFBhcnNlU2VydmVyT3B0aW9ucyB9IGZyb20gJy4vT3B0aW9ucyc7XG5pbXBvcnQgeyBQYXJzZUdyYXBoUUxTZXJ2ZXIgfSBmcm9tICcuL0dyYXBoUUwvUGFyc2VHcmFwaFFMU2VydmVyJztcblxuLy8gRmFjdG9yeSBmdW5jdGlvblxuY29uc3QgX1BhcnNlU2VydmVyID0gZnVuY3Rpb24gKG9wdGlvbnM6IFBhcnNlU2VydmVyT3B0aW9ucykge1xuICBjb25zdCBzZXJ2ZXIgPSBuZXcgUGFyc2VTZXJ2ZXIob3B0aW9ucyk7XG4gIHJldHVybiBzZXJ2ZXIuYXBwO1xufTtcbi8vIE1vdW50IHRoZSBjcmVhdGUgbGl2ZVF1ZXJ5U2VydmVyXG5fUGFyc2VTZXJ2ZXIuY3JlYXRlTGl2ZVF1ZXJ5U2VydmVyID0gUGFyc2VTZXJ2ZXIuY3JlYXRlTGl2ZVF1ZXJ5U2VydmVyO1xuX1BhcnNlU2VydmVyLnN0YXJ0ID0gUGFyc2VTZXJ2ZXIuc3RhcnQ7XG5cbmNvbnN0IFMzQWRhcHRlciA9IHVzZUV4dGVybmFsKCdTM0FkYXB0ZXInLCAnQHBhcnNlL3MzLWZpbGVzLWFkYXB0ZXInKTtcbmNvbnN0IEdDU0FkYXB0ZXIgPSB1c2VFeHRlcm5hbCgnR0NTQWRhcHRlcicsICdAcGFyc2UvZ2NzLWZpbGVzLWFkYXB0ZXInKTtcblxuT2JqZWN0LmRlZmluZVByb3BlcnR5KG1vZHVsZS5leHBvcnRzLCAnbG9nZ2VyJywge1xuICBnZXQ6IGdldExvZ2dlcixcbn0pO1xuXG5leHBvcnQgZGVmYXVsdCBQYXJzZVNlcnZlcjtcbmV4cG9ydCB7XG4gIFMzQWRhcHRlcixcbiAgR0NTQWRhcHRlcixcbiAgRmlsZVN5c3RlbUFkYXB0ZXIsXG4gIEluTWVtb3J5Q2FjaGVBZGFwdGVyLFxuICBOdWxsQ2FjaGVBZGFwdGVyLFxuICBSZWRpc0NhY2hlQWRhcHRlcixcbiAgTFJVQ2FjaGVBZGFwdGVyLFxuICBUZXN0VXRpbHMsXG4gIFB1c2hXb3JrZXIsXG4gIFBhcnNlR3JhcGhRTFNlcnZlcixcbiAgX1BhcnNlU2VydmVyIGFzIFBhcnNlU2VydmVyLFxuICBTY2hlbWFNaWdyYXRpb25zLFxufTtcbiJdLCJtYXBwaW5ncyI6Ijs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7QUFBQSxJQUFBQSxhQUFBLEdBQUFDLHNCQUFBLENBQUFDLE9BQUE7QUFDQSxJQUFBQyxlQUFBLEdBQUFGLHNCQUFBLENBQUFDLE9BQUE7QUFDQSxJQUFBRSxxQkFBQSxHQUFBSCxzQkFBQSxDQUFBQyxPQUFBO0FBQ0EsSUFBQUcsaUJBQUEsR0FBQUosc0JBQUEsQ0FBQUMsT0FBQTtBQUNBLElBQUFJLGtCQUFBLEdBQUFMLHNCQUFBLENBQUFDLE9BQUE7QUFDQSxJQUFBSyxTQUFBLEdBQUFOLHNCQUFBLENBQUFDLE9BQUE7QUFDQSxJQUFBTSxTQUFBLEdBQUFDLHVCQUFBLENBQUFQLE9BQUE7QUFBeUNRLE9B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