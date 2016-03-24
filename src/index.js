import ParseServer            from './ParseServer'
import { GCSAdapter }         from './Adapters/Files/GCSAdapter';
import { S3Adapter }          from './Adapters/Files/S3Adapter';
import { FileSystemAdapter }  from './Adapters/Files/FileSystemAdapter';

// Factory function
let _ParseServer = function(options) {
  let server = new ParseServer(options);
  return server.app;
}
// Mount the create liveQueryServer
_ParseServer.createLiveQueryServer = ParseServer.createLiveQueryServer;

export default ParseServer;
export { S3Adapter, GCSAdapter, FileSystemAdapter, _ParseServer as ParseServer };
