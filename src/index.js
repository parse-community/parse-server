import winston           from 'winston';
import ParseServer       from './ParseServer';

if (process.env.VERBOSE || process.env.VERBOSE_PARSE_SERVER) {
  winston.level = 'silly';
}

if (process.env.DEBUG || process.env.DEBUG_PARSE_SERVER) {
  winston.level = 'debug';
}

// Factory function
let _ParseServer = function(options) {
  let server = new ParseServer(options);
  return server.app;
}
// Mount the create liveQueryServer
_ParseServer.createLiveQueryServer = ParseServer.createLiveQueryServer;

function useExternal(name, moduleName) {
  return function() {
    throw `${name} is not provided by parse-server anymore; please install ${moduleName}`;
  }
}
let S3Adapter = useExternal('S3Adapter', 'parse-server-s3-adapter');
let GCSAdapter = useExternal('GCSAdapter', 'parse-server-gcs-adapter')
let FileSystemAdapter = useExternal('FileSystemAdapter', 'parse-server-fs-adapter')

export default ParseServer;
export { S3Adapter, GCSAdapter, FileSystemAdapter, _ParseServer as ParseServer };
