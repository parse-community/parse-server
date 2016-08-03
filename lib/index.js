'use strict';

Object.defineProperty(exports, "__esModule", {
  value: true
});
exports.ParseServer = exports.logger = exports.TestUtils = exports.InMemoryCacheAdapter = exports.FileSystemAdapter = exports.GCSAdapter = exports.S3Adapter = undefined;

var _ParseServer2 = require('./ParseServer');

var _ParseServer3 = _interopRequireDefault(_ParseServer2);

var _logger = require('./logger');

var _logger2 = _interopRequireDefault(_logger);

var _parseServerS3Adapter = require('parse-server-s3-adapter');

var _parseServerS3Adapter2 = _interopRequireDefault(_parseServerS3Adapter);

var _parseServerFsAdapter = require('parse-server-fs-adapter');

var _parseServerFsAdapter2 = _interopRequireDefault(_parseServerFsAdapter);

var _InMemoryCacheAdapter = require('./Adapters/Cache/InMemoryCacheAdapter');

var _InMemoryCacheAdapter2 = _interopRequireDefault(_InMemoryCacheAdapter);

var _TestUtils = require('./TestUtils');

var _TestUtils2 = _interopRequireDefault(_TestUtils);

var _deprecated = require('./deprecated');

function _interopRequireDefault(obj) { return obj && obj.__esModule ? obj : { default: obj }; }

// Factory function
var _ParseServer = function _ParseServer(options) {
  var server = new _ParseServer3.default(options);
  return server.app;
};
// Mount the create liveQueryServer
_ParseServer.createLiveQueryServer = _ParseServer3.default.createLiveQueryServer;

var GCSAdapter = (0, _deprecated.useExternal)('GCSAdapter', 'parse-server-gcs-adapter');

exports.default = _ParseServer3.default;
exports.S3Adapter = _parseServerS3Adapter2.default;
exports.GCSAdapter = GCSAdapter;
exports.FileSystemAdapter = _parseServerFsAdapter2.default;
exports.InMemoryCacheAdapter = _InMemoryCacheAdapter2.default;
exports.TestUtils = _TestUtils2.default;
exports.logger = _logger2.default;
exports.ParseServer = _ParseServer;