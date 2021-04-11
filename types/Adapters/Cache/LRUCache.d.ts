export var __esModule: boolean;
export default _default;
export class LRUCache {
    constructor({ ttl, maxSize }: {
        ttl?: any;
        maxSize?: any;
    });
    cache: any;
    get(key: any): any;
    put(key: any, value: any, ttl?: any): void;
    del(key: any): void;
    clear(): void;
}
declare var _default: typeof LRUCache;
