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
    // is not forwarded as-is because Node cannot express it as a timer
    // duration: under `ttlAutopurge` it emits a `TimeoutOverflowWarning` and
    // clamps the timer to 1ms, so the purge timer re-fires every millisecond.
    // Any other TTL that is not a positive, finite number is forwarded as
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

  clear(prefix) {
    if (prefix == null) {
      this.cache.clear();
      return;
    }
    const scope = `${prefix}:`;
    // Materialize the keys first, deleting while iterating the LRU is unsafe.
    for (const key of [...this.cache.keys()]) {
      if (typeof key === 'string' && key.startsWith(scope)) {
        this.cache.delete(key);
      }
    }
  }
}

export default LRUCache;
