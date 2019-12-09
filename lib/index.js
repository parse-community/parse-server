"use strict";

Object.defineProperty(exports, "__esModule", {
  value: true
});
Object.defineProperty(exports, "S3Adapter", {
  enumerable: true,
  get: function () {
    return _s3FilesAdapter.default;
  }
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
exports.TestUtils = exports.ParseServer = exports.GCSAdapter = exports.default = void 0;

var _ParseServer2 = _interopRequireDefault(require("./ParseServer"));

var _s3FilesAdapter = _interopRequireDefault(require("@parse/s3-files-adapter"));

var _fsFilesAdapter = _interopRequireDefault(require("@parse/fs-files-adapter"));

var _InMemoryCacheAdapter = _interopRequireDefault(require("./Adapters/Cache/InMemoryCacheAdapter"));

var _NullCacheAdapter = _interopRequireDefault(require("./Adapters/Cache/NullCacheAdapter"));

var _RedisCacheAdapter = _interopRequireDefault(require("./Adapters/Cache/RedisCacheAdapter"));

var _LRUCache = _interopRequireDefault(require("./Adapters/Cache/LRUCache.js"));

var TestUtils = _interopRequireWildcard(require("./TestUtils"));

exports.TestUtils = TestUtils;

var _deprecated = require("./deprecated");

var _logger = require("./logger");

var _PushWorker = require("./Push/PushWorker");

var _Options = require("./Options");

var _ParseGraphQLServer = require("./GraphQL/ParseGraphQLServer");

function _getRequireWildcardCache() { if (typeof WeakMap !== "function") return null; var cache = new WeakMap(); _getRequireWildcardCache = function () { return cache; }; return cache; }

function _interopRequireWildcard(obj) { if (obj && obj.__esModule) { return obj; } if (obj === null || typeof obj !== "object" && typeof obj !== "function") { return { default: obj }; } var cache = _getRequireWildcardCache(); if (cache && cache.has(obj)) { return cache.get(obj); } var newObj = {}; var hasPropertyDescriptor = Object.defineProperty && Object.getOwnPropertyDescriptor; for (var key in obj) { if (Object.prototype.hasOwnProperty.call(obj, key)) { var desc = hasPropertyDescriptor ? Object.getOwnPropertyDescriptor(obj, key) : null; if (desc && (desc.get || desc.set)) { Object.defineProperty(newObj, key, desc); } else { newObj[key] = obj[key]; } } } newObj.default = obj; if (cache) { cache.set(obj, newObj); } return newObj; }

function _interopRequireDefault(obj) { return obj && obj.__esModule ? obj : { default: obj }; }

// Factory function
const _ParseServer = function (options) {
  const server = new _ParseServer2.default(options);
  return server.app;
}; // Mount the create liveQueryServer


exports.ParseServer = _ParseServer;
_ParseServer.createLiveQueryServer = _ParseServer2.default.createLiveQueryServer;
_ParseServer.start = _ParseServer2.default.start;
const GCSAdapter = (0, _deprecated.useExternal)('GCSAdapter', '@parse/gcs-files-adapter');
exports.GCSAdapter = GCSAdapter;
Object.defineProperty(module.exports, 'logger', {
  get: _logger.getLogger
});
var _default = _ParseServer2.default;
exports.default = _default;
//# sourceMappingURL=data:application/json;charset=utf-8;base64,eyJ2ZXJzaW9uIjozLCJzb3VyY2VzIjpbIi4uL3NyYy9pbmRleC5qcyJdLCJuYW1lcyI6WyJfUGFyc2VTZXJ2ZXIiLCJvcHRpb25zIiwic2VydmVyIiwiUGFyc2VTZXJ2ZXIiLCJhcHAiLCJjcmVhdGVMaXZlUXVlcnlTZXJ2ZXIiLCJzdGFydCIsIkdDU0FkYXB0ZXIiLCJPYmplY3QiLCJkZWZpbmVQcm9wZXJ0eSIsIm1vZHVsZSIsImV4cG9ydHMiLCJnZXQiLCJnZXRMb2dnZXIiXSwibWFwcGluZ3MiOiI7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7QUFBQTs7QUFDQTs7QUFDQTs7QUFDQTs7QUFDQTs7QUFDQTs7QUFDQTs7QUFDQTs7OztBQUNBOztBQUNBOztBQUNBOztBQUNBOztBQUNBOzs7Ozs7OztBQUVBO0FBQ0EsTUFBTUEsWUFBWSxHQUFHLFVBQVNDLE9BQVQsRUFBc0M7QUFDekQsUUFBTUMsTUFBTSxHQUFHLElBQUlDLHFCQUFKLENBQWdCRixPQUFoQixDQUFmO0FBQ0EsU0FBT0MsTUFBTSxDQUFDRSxHQUFkO0FBQ0QsQ0FIRCxDLENBSUE7Ozs7QUFDQUosWUFBWSxDQUFDSyxxQkFBYixHQUFxQ0Ysc0JBQVlFLHFCQUFqRDtBQUNBTCxZQUFZLENBQUNNLEtBQWIsR0FBcUJILHNCQUFZRyxLQUFqQztBQUVBLE1BQU1DLFVBQVUsR0FBRyw2QkFBWSxZQUFaLEVBQTBCLDBCQUExQixDQUFuQjs7QUFFQUMsTUFBTSxDQUFDQyxjQUFQLENBQXNCQyxNQUFNLENBQUNDLE9BQTdCLEVBQXNDLFFBQXRDLEVBQWdEO0FBQzlDQyxFQUFBQSxHQUFHLEVBQUVDO0FBRHlDLENBQWhEO2VBSWVWLHFCIiwic291cmNlc0NvbnRlbnQiOlsiaW1wb3J0IFBhcnNlU2VydmVyIGZyb20gJy4vUGFyc2VTZXJ2ZXInO1xuaW1wb3J0IFMzQWRhcHRlciBmcm9tICdAcGFyc2UvczMtZmlsZXMtYWRhcHRlcic7XG5pbXBvcnQgRmlsZVN5c3RlbUFkYXB0ZXIgZnJvbSAnQHBhcnNlL2ZzLWZpbGVzLWFkYXB0ZXInO1xuaW1wb3J0IEluTWVtb3J5Q2FjaGVBZGFwdGVyIGZyb20gJy4vQWRhcHRlcnMvQ2FjaGUvSW5NZW1vcnlDYWNoZUFkYXB0ZXInO1xuaW1wb3J0IE51bGxDYWNoZUFkYXB0ZXIgZnJvbSAnLi9BZGFwdGVycy9DYWNoZS9OdWxsQ2FjaGVBZGFwdGVyJztcbmltcG9ydCBSZWRpc0NhY2hlQWRhcHRlciBmcm9tICcuL0FkYXB0ZXJzL0NhY2hlL1JlZGlzQ2FjaGVBZGFwdGVyJztcbmltcG9ydCBMUlVDYWNoZUFkYXB0ZXIgZnJvbSAnLi9BZGFwdGVycy9DYWNoZS9MUlVDYWNoZS5qcyc7XG5pbXBvcnQgKiBhcyBUZXN0VXRpbHMgZnJvbSAnLi9UZXN0VXRpbHMnO1xuaW1wb3J0IHsgdXNlRXh0ZXJuYWwgfSBmcm9tICcuL2RlcHJlY2F0ZWQnO1xuaW1wb3J0IHsgZ2V0TG9nZ2VyIH0gZnJvbSAnLi9sb2dnZXInO1xuaW1wb3J0IHsgUHVzaFdvcmtlciB9IGZyb20gJy4vUHVzaC9QdXNoV29ya2VyJztcbmltcG9ydCB7IFBhcnNlU2VydmVyT3B0aW9ucyB9IGZyb20gJy4vT3B0aW9ucyc7XG5pbXBvcnQgeyBQYXJzZUdyYXBoUUxTZXJ2ZXIgfSBmcm9tICcuL0dyYXBoUUwvUGFyc2VHcmFwaFFMU2VydmVyJztcblxuLy8gRmFjdG9yeSBmdW5jdGlvblxuY29uc3QgX1BhcnNlU2VydmVyID0gZnVuY3Rpb24ob3B0aW9uczogUGFyc2VTZXJ2ZXJPcHRpb25zKSB7XG4gIGNvbnN0IHNlcnZlciA9IG5ldyBQYXJzZVNlcnZlcihvcHRpb25zKTtcbiAgcmV0dXJuIHNlcnZlci5hcHA7XG59O1xuLy8gTW91bnQgdGhlIGNyZWF0ZSBsaXZlUXVlcnlTZXJ2ZXJcbl9QYXJzZVNlcnZlci5jcmVhdGVMaXZlUXVlcnlTZXJ2ZXIgPSBQYXJzZVNlcnZlci5jcmVhdGVMaXZlUXVlcnlTZXJ2ZXI7XG5fUGFyc2VTZXJ2ZXIuc3RhcnQgPSBQYXJzZVNlcnZlci5zdGFydDtcblxuY29uc3QgR0NTQWRhcHRlciA9IHVzZUV4dGVybmFsKCdHQ1NBZGFwdGVyJywgJ0BwYXJzZS9nY3MtZmlsZXMtYWRhcHRlcicpO1xuXG5PYmplY3QuZGVmaW5lUHJvcGVydHkobW9kdWxlLmV4cG9ydHMsICdsb2dnZXInLCB7XG4gIGdldDogZ2V0TG9nZ2VyLFxufSk7XG5cbmV4cG9ydCBkZWZhdWx0IFBhcnNlU2VydmVyO1xuZXhwb3J0IHtcbiAgUzNBZGFwdGVyLFxuICBHQ1NBZGFwdGVyLFxuICBGaWxlU3lzdGVtQWRhcHRlcixcbiAgSW5NZW1vcnlDYWNoZUFkYXB0ZXIsXG4gIE51bGxDYWNoZUFkYXB0ZXIsXG4gIFJlZGlzQ2FjaGVBZGFwdGVyLFxuICBMUlVDYWNoZUFkYXB0ZXIsXG4gIFRlc3RVdGlscyxcbiAgUHVzaFdvcmtlcixcbiAgUGFyc2VHcmFwaFFMU2VydmVyLFxuICBfUGFyc2VTZXJ2ZXIgYXMgUGFyc2VTZXJ2ZXIsXG59O1xuIl19