'use strict';

Object.defineProperty(exports, "__esModule", {
  value: true
});
exports.ParseServer = exports.PushWorker = exports.TestUtils = exports.LRUCacheAdapter = exports.RedisCacheAdapter = exports.NullCacheAdapter = exports.InMemoryCacheAdapter = exports.FileSystemAdapter = exports.GCSAdapter = exports.S3Adapter = undefined;

var _ParseServer2 = require('./ParseServer');

var _ParseServer3 = _interopRequireDefault(_ParseServer2);

var _s3FilesAdapter = require('@parse/s3-files-adapter');

var _s3FilesAdapter2 = _interopRequireDefault(_s3FilesAdapter);

var _fsFilesAdapter = require('@parse/fs-files-adapter');

var _fsFilesAdapter2 = _interopRequireDefault(_fsFilesAdapter);

var _InMemoryCacheAdapter = require('./Adapters/Cache/InMemoryCacheAdapter');

var _InMemoryCacheAdapter2 = _interopRequireDefault(_InMemoryCacheAdapter);

var _NullCacheAdapter = require('./Adapters/Cache/NullCacheAdapter');

var _NullCacheAdapter2 = _interopRequireDefault(_NullCacheAdapter);

var _RedisCacheAdapter = require('./Adapters/Cache/RedisCacheAdapter');

var _RedisCacheAdapter2 = _interopRequireDefault(_RedisCacheAdapter);

var _LRUCache = require('./Adapters/Cache/LRUCache.js');

var _LRUCache2 = _interopRequireDefault(_LRUCache);

var _TestUtils = require('./TestUtils');

var TestUtils = _interopRequireWildcard(_TestUtils);

var _deprecated = require('./deprecated');

var _logger = require('./logger');

var _PushWorker = require('./Push/PushWorker');

var _Options = require('./Options');

function _interopRequireWildcard(obj) { if (obj && obj.__esModule) { return obj; } else { var newObj = {}; if (obj != null) { for (var key in obj) { if (Object.prototype.hasOwnProperty.call(obj, key)) newObj[key] = obj[key]; } } newObj.default = obj; return newObj; } }

function _interopRequireDefault(obj) { return obj && obj.__esModule ? obj : { default: obj }; }

// Factory function
const _ParseServer = function (options) {
  const server = new _ParseServer3.default(options);
  return server.app;
};
// Mount the create liveQueryServer
_ParseServer.createLiveQueryServer = _ParseServer3.default.createLiveQueryServer;
_ParseServer.start = _ParseServer3.default.start;

const GCSAdapter = (0, _deprecated.useExternal)('GCSAdapter', '@parse/gcs-files-adapter');

Object.defineProperty(module.exports, 'logger', {
  get: _logger.getLogger
});

exports.default = _ParseServer3.default;
exports.S3Adapter = _s3FilesAdapter2.default;
exports.GCSAdapter = GCSAdapter;
exports.FileSystemAdapter = _fsFilesAdapter2.default;
exports.InMemoryCacheAdapter = _InMemoryCacheAdapter2.default;
exports.NullCacheAdapter = _NullCacheAdapter2.default;
exports.RedisCacheAdapter = _RedisCacheAdapter2.default;
exports.LRUCacheAdapter = _LRUCache2.default;
exports.TestUtils = TestUtils;
exports.PushWorker = _PushWorker.PushWorker;
exports.ParseServer = _ParseServer;