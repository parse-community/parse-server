export var __esModule: boolean;
export var FileSystemAdapter: any;
export var InMemoryCacheAdapter: any;
export var NullCacheAdapter: any;
export var RedisCacheAdapter: any;
export var LRUCacheAdapter: any;
export var PushWorker: typeof _PushWorker.PushWorker;
export var ParseGraphQLServer: typeof _ParseGraphQLServer.ParseGraphQLServer;
export var logger: import("./Controllers/LoggerController").LoggerController;
export default _default;
import _PushWorker = require("./Push/PushWorker");
import _ParseGraphQLServer = require("./GraphQL/ParseGraphQLServer");
export var TestUtils: any;
declare function _ParseServer(options: any): any;
declare namespace _ParseServer {
    const createLiveQueryServer: any;
    const start: any;
}
export const S3Adapter: () => never;
export const GCSAdapter: () => never;
declare var _default: any;
export { _ParseServer as ParseServer };
