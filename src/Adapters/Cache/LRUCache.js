import { LRUCache as LRU } from 'lru-cache';
import defaults from '../../defaults';

const isValidTTL = ttl => typeof ttl === 'number' && Number.isFinite(ttl) && ttl > 0;

// `lru-cache` expresses "never expires" as a TTL of zero.
const NO_EXPIRY = 0;

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
    // cache-wide TTL.
    //
    // A TTL of `Infinity` means "never expires", matching `RedisCacheAdapter`,
    // and is translated to the zero that `lru-cache` uses for that. `Infinity`
    // is not forwarded as-is because it is not a valid `lru-cache` TTL: under
    // `ttlAutopurge` it overflows the entry's timer and evicts it almost
    // immediately. Any other TTL that is not a positive number is forwarded as
    // `undefined`, which is how the library expresses "use the cache-wide TTL".
    let entryTTL;
    if (ttl === Infinity) {
      entryTTL = NO_EXPIRY;
    } else if (isValidTTL(ttl)) {
      entryTTL = ttl;
    }
    this.cache.set(key, value, { ttl: entryTTL });
  }

  del(key) {
    this.cache.delete(key);
  }

  clear() {
    this.cache.clear();
  }
}

export default LRUCache;
