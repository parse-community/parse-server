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
Object.defineProperty(exports, "InMemoryCacheAdapter", {
  enumerable: true,
  get: function () {
    return _InMemoryCacheAdapter.default;
  }
});
Object.defineProperty(exports, "NullCacheAdapter", {
  enumerable: true,
  get: function () {
    return _NullCacheAdapter.default;
  }
});
Object.defineProperty(exports, "RedisCacheAdapter", {
  enumerable: true,
  get: function () {
    return _RedisCacheAdapter.default;
  }
});
Object.defineProperty(exports, "LRUCacheAdapter", {
  enumerable: true,
  get: function () {
    return _LRUCache.default;
  }
});
Object.defineProperty(exports, "PushWorker", {
  enumerable: true,
  get: function () {
    return _PushWorker.PushWorker;
  }
});
Object.defineProperty(exports, "ParseGraphQLServer", {
  enumerable: true,
  get: function () {
    return _ParseGraphQLServer.ParseGraphQLServer;
  }
});
exports.SchemaMigrations = exports.TestUtils = exports.ParseServer = exports.GCSAdapter = exports.S3Adapter = exports.default = void 0;

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
}; // Mount the create liveQueryServer


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
//# sourceMappingURL=data:application/json;charset=utf-8;base64,eyJ2ZXJzaW9uIjozLCJzb3VyY2VzIjpbIi4uL3NyYy9pbmRleC5qcyJdLCJuYW1lcyI6WyJfUGFyc2VTZXJ2ZXIiLCJvcHRpb25zIiwic2VydmVyIiwiUGFyc2VTZXJ2ZXIiLCJhcHAiLCJjcmVhdGVMaXZlUXVlcnlTZXJ2ZXIiLCJzdGFydCIsIlMzQWRhcHRlciIsIkdDU0FkYXB0ZXIiLCJPYmplY3QiLCJkZWZpbmVQcm9wZXJ0eSIsIm1vZHVsZSIsImV4cG9ydHMiLCJnZXQiLCJnZXRMb2dnZXIiXSwibWFwcGluZ3MiOiI7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7QUFBQTs7QUFDQTs7QUFDQTs7QUFDQTs7QUFDQTs7QUFDQTs7QUFDQTs7OztBQUNBOzs7O0FBRUE7O0FBQ0E7O0FBQ0E7O0FBQ0E7O0FBQ0E7Ozs7Ozs7O0FBRUE7QUFDQSxNQUFNQSxZQUFZLEdBQUcsVUFBVUMsT0FBVixFQUF1QztBQUMxRCxRQUFNQyxNQUFNLEdBQUcsSUFBSUMscUJBQUosQ0FBZ0JGLE9BQWhCLENBQWY7QUFDQSxTQUFPQyxNQUFNLENBQUNFLEdBQWQ7QUFDRCxDQUhELEMsQ0FJQTs7OztBQUNBSixZQUFZLENBQUNLLHFCQUFiLEdBQXFDRixzQkFBWUUscUJBQWpEO0FBQ0FMLFlBQVksQ0FBQ00sS0FBYixHQUFxQkgsc0JBQVlHLEtBQWpDO0FBRUEsTUFBTUMsU0FBUyxHQUFHLDZCQUFZLFdBQVosRUFBeUIseUJBQXpCLENBQWxCOztBQUNBLE1BQU1DLFVBQVUsR0FBRyw2QkFBWSxZQUFaLEVBQTBCLDBCQUExQixDQUFuQjs7QUFFQUMsTUFBTSxDQUFDQyxjQUFQLENBQXNCQyxNQUFNLENBQUNDLE9BQTdCLEVBQXNDLFFBQXRDLEVBQWdEO0FBQzlDQyxFQUFBQSxHQUFHLEVBQUVDO0FBRHlDLENBQWhEO2VBSWVYLHFCIiwic291cmNlc0NvbnRlbnQiOlsiaW1wb3J0IFBhcnNlU2VydmVyIGZyb20gJy4vUGFyc2VTZXJ2ZXInO1xuaW1wb3J0IEZpbGVTeXN0ZW1BZGFwdGVyIGZyb20gJ0BwYXJzZS9mcy1maWxlcy1hZGFwdGVyJztcbmltcG9ydCBJbk1lbW9yeUNhY2hlQWRhcHRlciBmcm9tICcuL0FkYXB0ZXJzL0NhY2hlL0luTWVtb3J5Q2FjaGVBZGFwdGVyJztcbmltcG9ydCBOdWxsQ2FjaGVBZGFwdGVyIGZyb20gJy4vQWRhcHRlcnMvQ2FjaGUvTnVsbENhY2hlQWRhcHRlcic7XG5pbXBvcnQgUmVkaXNDYWNoZUFkYXB0ZXIgZnJvbSAnLi9BZGFwdGVycy9DYWNoZS9SZWRpc0NhY2hlQWRhcHRlcic7XG5pbXBvcnQgTFJVQ2FjaGVBZGFwdGVyIGZyb20gJy4vQWRhcHRlcnMvQ2FjaGUvTFJVQ2FjaGUuanMnO1xuaW1wb3J0ICogYXMgVGVzdFV0aWxzIGZyb20gJy4vVGVzdFV0aWxzJztcbmltcG9ydCAqIGFzIFNjaGVtYU1pZ3JhdGlvbnMgZnJvbSAnLi9TY2hlbWFNaWdyYXRpb25zL01pZ3JhdGlvbnMnO1xuXG5pbXBvcnQgeyB1c2VFeHRlcm5hbCB9IGZyb20gJy4vZGVwcmVjYXRlZCc7XG5pbXBvcnQgeyBnZXRMb2dnZXIgfSBmcm9tICcuL2xvZ2dlcic7XG5pbXBvcnQgeyBQdXNoV29ya2VyIH0gZnJvbSAnLi9QdXNoL1B1c2hXb3JrZXInO1xuaW1wb3J0IHsgUGFyc2VTZXJ2ZXJPcHRpb25zIH0gZnJvbSAnLi9PcHRpb25zJztcbmltcG9ydCB7IFBhcnNlR3JhcGhRTFNlcnZlciB9IGZyb20gJy4vR3JhcGhRTC9QYXJzZUdyYXBoUUxTZXJ2ZXInO1xuXG4vLyBGYWN0b3J5IGZ1bmN0aW9uXG5jb25zdCBfUGFyc2VTZXJ2ZXIgPSBmdW5jdGlvbiAob3B0aW9uczogUGFyc2VTZXJ2ZXJPcHRpb25zKSB7XG4gIGNvbnN0IHNlcnZlciA9IG5ldyBQYXJzZVNlcnZlcihvcHRpb25zKTtcbiAgcmV0dXJuIHNlcnZlci5hcHA7XG59O1xuLy8gTW91bnQgdGhlIGNyZWF0ZSBsaXZlUXVlcnlTZXJ2ZXJcbl9QYXJzZVNlcnZlci5jcmVhdGVMaXZlUXVlcnlTZXJ2ZXIgPSBQYXJzZVNlcnZlci5jcmVhdGVMaXZlUXVlcnlTZXJ2ZXI7XG5fUGFyc2VTZXJ2ZXIuc3RhcnQgPSBQYXJzZVNlcnZlci5zdGFydDtcblxuY29uc3QgUzNBZGFwdGVyID0gdXNlRXh0ZXJuYWwoJ1MzQWRhcHRlcicsICdAcGFyc2UvczMtZmlsZXMtYWRhcHRlcicpO1xuY29uc3QgR0NTQWRhcHRlciA9IHVzZUV4dGVybmFsKCdHQ1NBZGFwdGVyJywgJ0BwYXJzZS9nY3MtZmlsZXMtYWRhcHRlcicpO1xuXG5PYmplY3QuZGVmaW5lUHJvcGVydHkobW9kdWxlLmV4cG9ydHMsICdsb2dnZXInLCB7XG4gIGdldDogZ2V0TG9nZ2VyLFxufSk7XG5cbmV4cG9ydCBkZWZhdWx0IFBhcnNlU2VydmVyO1xuZXhwb3J0IHtcbiAgUzNBZGFwdGVyLFxuICBHQ1NBZGFwdGVyLFxuICBGaWxlU3lzdGVtQWRhcHRlcixcbiAgSW5NZW1vcnlDYWNoZUFkYXB0ZXIsXG4gIE51bGxDYWNoZUFkYXB0ZXIsXG4gIFJlZGlzQ2FjaGVBZGFwdGVyLFxuICBMUlVDYWNoZUFkYXB0ZXIsXG4gIFRlc3RVdGlscyxcbiAgUHVzaFdvcmtlcixcbiAgUGFyc2VHcmFwaFFMU2VydmVyLFxuICBfUGFyc2VTZXJ2ZXIgYXMgUGFyc2VTZXJ2ZXIsXG4gIFNjaGVtYU1pZ3JhdGlvbnMsXG59O1xuIl19