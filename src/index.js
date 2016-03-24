import ParseServer           from './ParseServer';
import { GCSAdapter }        from 'parse-server-gcs-adapter';
import { S3Adapter }         from 'parse-server-s3-adapter';
import { FileSystemAdapter } from 'parse-server-fs-adapter';

// Factory function
let _ParseServer = function(options) {
  let server = new ParseServer(options);
  return server.app;
}
// Mount the create liveQueryServer
_ParseServer.createLiveQueryServer = ParseServer.createLiveQueryServer;

export default ParseServer;
export { S3Adapter, GCSAdapter, FileSystemAdapter, _ParseServer as ParseServer };
