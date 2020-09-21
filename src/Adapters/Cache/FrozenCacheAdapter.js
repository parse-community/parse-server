export class FrozenCacheAdapter {
  constructor() {
    this.cache = {};
  }

  get(key) {
    const record = this.cache[key];
    if (!record) {
      return Promise.resolve(null);
    }
    return Promise.resolve(record);
  }

  // eslint-disable-next-line no-unused-vars
  put(key, value, ttl) {
    this.cache[key] = value;
    return Promise.resolve();
  }

  del(key) {
    delete this.cache[key];
    return Promise.resolve();
  }

  clear() {
    return Promise.resolve();
  }
}

export default FrozenCacheAdapter;
