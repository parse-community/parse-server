"use strict";

Object.defineProperty(exports, "__esModule", {
  value: true
});
/*eslint no-unused-vars: "off"*/
class CacheAdapter {
  /**
   * Get a value in the cache
   * @param key Cache key to get
   * @return Promise that will eventually resolve to the value in the cache.
   */
  get(key) {}

  /**
   * Set a value in the cache
   * @param key Cache key to set
   * @param value Value to set the key
   * @param ttl Optional TTL
   */
  put(key, value, ttl) {}

  /**
   * Remove a value from the cache.
   * @param key Cache key to remove
   */
  del(key) {}

  /**
   * Empty a cache
   */
  clear() {}
}
exports.CacheAdapter = CacheAdapter;