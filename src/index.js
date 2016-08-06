import ParseServer          from './ParseServer';
import logger            from './logger';
import S3Adapter            from 'parse-server-s3-adapter'
import FileSystemAdapter    from 'parse-server-fs-adapter'
import InMemoryCacheAdapter from './Adapters/Cache/InMemoryCacheAdapter'
import { useExternal }      from './deprecated'

// Factory function
let _ParseServer = function(options) {
  let server = new ParseServer(options);
  return server.app;
}
// Mount the create liveQueryServer
_ParseServer.createLiveQueryServer = ParseServer.createLiveQueryServer;

let GCSAdapter = useExternal('GCSAdapter', 'parse-server-gcs-adapter');

export default ParseServer;
export { S3Adapter, GCSAdapter, FileSystemAdapter, InMemoryCacheAdapter, logger, _ParseServer as ParseServer };
