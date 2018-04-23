import {LRUCache} from './LRUCache';

export class InMemoryCacheAdapter {

  constructor(ctx) {
    this.cache = new LRUCache(ctx)
  }

  get(key) {
    const record = this.cache.get(key);
    if (record === null) {
      return Promise.resolve(null);
    }
    return Promise.resolve(record);
  }

  put(key, value, ttl) {
    this.cache.put(key, value, ttl);
    return Promise.resolve();
  }

  del(key) {
    this.cache.del(key);
    return Promise.resolve();
  }

  clear() {
    this.cache.clear();
    return Promise.resolve();
  }
}

export default InMemoryCacheAdapter;
