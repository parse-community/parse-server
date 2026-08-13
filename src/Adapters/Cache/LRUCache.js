import { LRUCache as LRU } from 'lru-cache';
import defaults from '../../defaults';

const isValidTTL = ttl => typeof ttl === 'number' && ttl > 0;

export class LRUCache {
  constructor({ ttl = defaults.cacheTTL, maxSize = defaults.cacheMaxSize }) {
    this.ttl = ttl;
    this.cache = new LRU({
      max: maxSize,
      ttl,
    });
  }

  get(key) {
    return this.cache.get(key) || null;
  }

  put(key, value, ttl = this.ttl) {
    // `lru-cache` takes the per-entry TTL as a property of an options object.
    // Passed positionally it is silently discarded, leaving the entry on the
    // cache-wide TTL. A TTL that is not a positive number is forwarded as
    // `undefined`, which is how the library expresses "use the cache-wide TTL".
    this.cache.set(key, value, { ttl: isValidTTL(ttl) ? ttl : undefined });
  }

  del(key) {
    this.cache.delete(key);
  }

  clear() {
    this.cache.clear();
  }
}

export default LRUCache;
