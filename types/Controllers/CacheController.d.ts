export var __esModule: boolean;
export default _default;
/**
 * Prefix all calls to the cache via a prefix string, useful when grouping Cache by object type.
 *
 * eg "Role" or "Session"
 */
export class SubCache {
    constructor(prefix: any, cacheController: any, ttl: any);
    prefix: any;
    cache: any;
    ttl: any;
    get(key: any): any;
    put(key: any, value: any, ttl: any): any;
    del(key: any): any;
    clear(): any;
}
declare const CacheController_base: any;
export class CacheController extends CacheController_base {
    [x: string]: any;
    constructor(adapter: any, appId: any, options?: {});
    role: SubCache;
    user: SubCache;
    graphQL: SubCache;
    get(key: any): any;
    put(key: any, value: any, ttl: any): any;
    del(key: any): any;
    clear(): any;
    expectedAdapterType(): any;
}
declare var _default: typeof CacheController;
