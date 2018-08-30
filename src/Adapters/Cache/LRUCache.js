import LRU from 'lru-cache';
import defaults from '../../defaults';

export class LRUCache {
  constructor({ ttl = defaults.cacheTTL, maxSize = defaults.cacheMaxSize }) {
    this.cache = new LRU({
      max: maxSize,
      maxAge: ttl,
    });
  }

  get(key) {
    return this.cache.get(key) || null;
  }

  put(key, value, ttl = this.ttl) {
    this.cache.set(key, value, ttl);
  }

  del(key) {
    this.cache.del(key);
  }

  clear() {
    this.cache.reset();
  }
}

export default LRUCache;
