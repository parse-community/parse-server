const DEFAULT_CACHE_TTL = 5 * 1000;


export class InMemoryCache {
  constructor({
    ttl = DEFAULT_CACHE_TTL
  }) {
    this.ttl = ttl;
    this.cache = Object.create(null);
  }

  get(key) {
    let record = this.cache[key];
    if (record == null) {
      return null;
    }

    // Has Record and isnt expired
    if (isNaN(record.expire) || record.expire >= Date.now()) {
      return record.value;
    }

    // Record has expired
    delete this.cache[key];
    return null;
  }

  put(key, value, ttl = this.ttl) {
    if (ttl < 0 || isNaN(ttl)) {
      ttl = NaN;
    }

    var record = {
      value: value,
      expire: ttl + Date.now()
    }

    if (!isNaN(record.expire)) {
      record.timeout = setTimeout(() => {
        this.del(key);
      }, ttl);
    }

    this.cache[key] = record;
  }

  del(key) {
    var record = this.cache[key];
    if (record == null) {
      return;
    }

    if (record.timeout) {
      clearTimeout(record.timeout);
    }
    delete this.cache[key];
  }

  clear() {
    this.cache = Object.create(null);
  }

}

export default InMemoryCache;
