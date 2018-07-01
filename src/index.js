const { ParseServer }       = require('./ParseServer');
const S3Adapter            = require('@parse/s3-files-adapter');
const FileSystemAdapter    = require('@parse/fs-files-adapter');
const { InMemoryCacheAdapter } = require('./Adapters/Cache/InMemoryCacheAdapter');
const { NullCacheAdapter }     = require('./Adapters/Cache/NullCacheAdapter');
const { RedisCacheAdapter }    = require('./Adapters/Cache/RedisCacheAdapter');
const { LRUCacheAdapter }      = require('./Adapters/Cache/LRUCache.js');
const  TestUtils       = require('./TestUtils');
const { useExternal }      = require('./deprecated');
const { getLogger }        = require('./logger');
const { PushWorker }       = require('./Push/PushWorker');
const { ParseServerOptions }    = require('./Options');

// Factory function
const _ParseServer = function(options: ParseServerOptions) {
  const server = new ParseServer(options);
  return server.app;
}
// Mount the create liveQueryServer
_ParseServer.createLiveQueryServer = ParseServer.createLiveQueryServer;
_ParseServer.start = ParseServer.start;

const GCSAdapter = useExternal('GCSAdapter', '@parse/gcs-files-adapter');

Object.defineProperty(module.exports, 'logger', {
  get: getLogger
});

module.exports = {
  default: ParseServer,
  S3Adapter,
  GCSAdapter,
  FileSystemAdapter,
  InMemoryCacheAdapter,
  NullCacheAdapter,
  RedisCacheAdapter,
  LRUCacheAdapter,
  TestUtils,
  PushWorker,
  ParseServer: _ParseServer
};
