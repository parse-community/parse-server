export var __esModule: boolean;
/**
 * @module Adapters
 */
/**
 * @interface CacheAdapter
 */
export class CacheAdapter {
    /**
     * Get a value in the cache
     * @param {String} key Cache key to get
     * @return {Promise} that will eventually resolve to the value in the cache.
     */
    get(key: string): Promise<any>;
    /**
     * Set a value in the cache
     * @param {String} key Cache key to set
     * @param {String} value Value to set the key
     * @param {String} ttl Optional TTL
     */
    put(key: string, value: string, ttl: string): void;
    /**
     * Remove a value from the cache.
     * @param {String} key Cache key to remove
     */
    del(key: string): void;
    /**
     * Empty a cache
     */
    clear(): void;
}
