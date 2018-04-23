export class NullCacheAdapter {

  constructor() {}

  get() {
    return new Promise((resolve) => {
      return resolve(null);
    })
  }

  put() {
    return Promise.resolve();
  }

  del() {
    return Promise.resolve();
  }

  clear() {
    return Promise.resolve();
  }
}

export default NullCacheAdapter;
