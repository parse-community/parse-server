import {InMemoryCache} from './InMemoryCache';

export class InMemoryCacheAdapter {

  constructor(ctx) {
    this.cache = new InMemoryCache(ctx)
  }

  get(key) {
    return new Promise((resolve, reject) => {
      let record = this.cache.get(key);
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
