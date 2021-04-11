export var __esModule: boolean;
export default _default;
export class RedisCacheAdapter {
    constructor(redisCtx: any, ttl?: number);
    ttl: number;
    client: any;
    queue: _KeyPromiseQueue.KeyPromiseQueue;
    handleShutdown(): Promise<any>;
    get(key: any): any;
    put(key: any, value: any, ttl?: number): any;
    del(key: any): any;
    clear(): any;
    getAllKeys(): Promise<any>;
}
declare var _default: typeof RedisCacheAdapter;
import _KeyPromiseQueue = require("../../KeyPromiseQueue");
