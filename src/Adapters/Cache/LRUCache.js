import { LRUCache as LRU } from 'lru-cache';
import defaults from '../../defaults';

export class LRUCache {
  constructor({ ttl = defaults.cacheTTL, maxSize = defaults.cacheMaxSize }) {
    this.cache = new LRU({
      max: maxSize,
      ttl,
    });
  }

  get(key) {
    return this.cache.get(key) || null;
  }

  put(key, value, ttl = this.ttl) {
    this.cache.set(key, value, ttl);
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
