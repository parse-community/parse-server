export class NullCacheAdapter {

  constructor(ctx) {
  }

  get(key) {
    return new Promise((resolve, _) => {
      return resolve(null);
    })
  }

  put(key, value, ttl) {
    return Promise.resolve();
  }

  del(key) {
    return Promise.resolve();
  }

  clear() {
    return Promise.resolve();
  }
}

export default NullCacheAdapter;
