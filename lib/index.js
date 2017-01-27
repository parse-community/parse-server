'use strict';

Object.defineProperty(exports, "__esModule", {
  value: true
});
exports.ParseServer = exports.PushWorker = exports.TestUtils = exports.RedisCacheAdapter = exports.NullCacheAdapter = exports.InMemoryCacheAdapter = exports.FileSystemAdapter = exports.GCSAdapter = exports.S3Adapter = undefined;

var _ParseServer2 = require('./ParseServer');

var _ParseServer3 = _interopRequireDefault(_ParseServer2);

var _parseServerS3Adapter = require('parse-server-s3-adapter');

var _parseServerS3Adapter2 = _interopRequireDefault(_parseServerS3Adapter);

var _parseServerFsAdapter = require('parse-server-fs-adapter');

var _parseServerFsAdapter2 = _interopRequireDefault(_parseServerFsAdapter);

var _InMemoryCacheAdapter = require('./Adapters/Cache/InMemoryCacheAdapter');

var _InMemoryCacheAdapter2 = _interopRequireDefault(_InMemoryCacheAdapter);

var _NullCacheAdapter = require('./Adapters/Cache/NullCacheAdapter');

var _NullCacheAdapter2 = _interopRequireDefault(_NullCacheAdapter);

var _RedisCacheAdapter = require('./Adapters/Cache/RedisCacheAdapter');

var _RedisCacheAdapter2 = _interopRequireDefault(_RedisCacheAdapter);

var _TestUtils = require('./TestUtils');

var TestUtils = _interopRequireWildcard(_TestUtils);

var _deprecated = require('./deprecated');

var _logger = require('./logger');

var _PushWorker = require('./Push/PushWorker');

function _interopRequireWildcard(obj) { if (obj && obj.__esModule) { return obj; } else { var newObj = {}; if (obj != null) { for (var key in obj) { if (Object.prototype.hasOwnProperty.call(obj, key)) newObj[key] = obj[key]; } } newObj.default = obj; return newObj; } }

function _interopRequireDefault(obj) { return obj && obj.__esModule ? obj : { default: obj }; }

// Factory function
var _ParseServer = function _ParseServer(options) {
  var server = new _ParseServer3.default(options);
  return server.app;
};
// Mount the create liveQueryServer
_ParseServer.createLiveQueryServer = _ParseServer3.default.createLiveQueryServer;

var GCSAdapter = (0, _deprecated.useExternal)('GCSAdapter', 'parse-server-gcs-adapter');

Object.defineProperty(module.exports, 'logger', {
  get: _logger.getLogger
});

exports.default = _ParseServer3.default;
exports.S3Adapter = _parseServerS3Adapter2.default;
exports.GCSAdapter = GCSAdapter;
exports.FileSystemAdapter = _parseServerFsAdapter2.default;
exports.InMemoryCacheAdapter = _InMemoryCacheAdapter2.default;
exports.NullCacheAdapter = _NullCacheAdapter2.default;
exports.RedisCacheAdapter = _RedisCacheAdapter2.default;
exports.TestUtils = TestUtils;
exports.PushWorker = _PushWorker.PushWorker;
exports.ParseServer = _ParseServer;