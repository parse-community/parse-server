export var __esModule: boolean;
export default _default;
export class InMemoryCacheAdapter {
    constructor(ctx: any);
    cache: _LRUCache.LRUCache;
    get(key: any): Promise<any>;
    put(key: any, value: any, ttl: any): Promise<void>;
    del(key: any): Promise<void>;
    clear(): Promise<void>;
}
declare var _default: typeof InMemoryCacheAdapter;
import _LRUCache = require("./LRUCache");
