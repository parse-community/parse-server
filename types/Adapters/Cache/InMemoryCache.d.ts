export var __esModule: boolean;
export default _default;
export class InMemoryCache {
    constructor({ ttl }: {
        ttl?: number;
    });
    ttl: number;
    cache: any;
    get(key: any): any;
    put(key: any, value: any, ttl?: number): void;
    del(key: any): void;
    clear(): void;
}
declare var _default: typeof InMemoryCache;
