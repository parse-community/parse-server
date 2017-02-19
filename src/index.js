import ParseServer          from './ParseServer';
import S3Adapter            from 'parse-server-s3-adapter'
import FileSystemAdapter    from 'parse-server-fs-adapter'
import InMemoryCacheAdapter from './Adapters/Cache/InMemoryCacheAdapter'
import NullCacheAdapter     from './Adapters/Cache/NullCacheAdapter'
import RedisCacheAdapter    from './Adapters/Cache/RedisCacheAdapter'
import * as TestUtils       from './TestUtils';
import { useExternal }      from './deprecated';
import { getLogger }        from './logger';
import { PushWorker }       from './Push/PushWorker';

// Factory function
const _ParseServer = function(options) {
  const server = new ParseServer(options);
  return server.app;
}
// Mount the create liveQueryServer
_ParseServer.createLiveQueryServer = ParseServer.createLiveQueryServer;

const GCSAdapter = useExternal('GCSAdapter', 'parse-server-gcs-adapter');

Object.defineProperty(module.exports, 'logger', {
  get: getLogger
});

export default ParseServer;
export { S3Adapter, GCSAdapter, FileSystemAdapter, InMemoryCacheAdapter, NullCacheAdapter, RedisCacheAdapter, TestUtils, PushWorker, _ParseServer as ParseServer };
