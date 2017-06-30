import {LRUCache} from './LRUCache';

export class InMemoryCacheAdapter {

  constructor(ctx) {
    this.cache = new LRUCache(ctx)
  }

  get(key) {
    return new Promise((resolve) => {
      const record = this.cache.get(key);
      if (record == null) {
        return resolve(null);
      }

      return resolve(JSON.parse(record));
    })
  }

  put(key, value, ttl) {
    this.cache.put(key, JSON.stringify(value), ttl);
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
