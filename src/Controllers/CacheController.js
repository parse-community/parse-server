import AdaptableController from './AdaptableController';
import CacheAdapter        from '../Adapters/Cache/CacheAdapter';

const KEY_SEPARATOR_CHAR = ':';

function joinKeys(...keys) {
  return keys.join(KEY_SEPARATOR_CHAR);
}

/**
 * Prefix all calls to the cache via a prefix string, useful when grouping Cache by object type.
 *
 * eg "Role" or "Session"
 */
export class SubCache {
  constructor(prefix, cacheController, ttl) {
    this.prefix = prefix;
    this.cache = cacheController;
    this.ttl = ttl;
  }

  get(key) {
    let cacheKey = joinKeys(this.prefix, key);
    return this.cache.get(cacheKey);
  }

  put(key, value, ttl) {
    let cacheKey = joinKeys(this.prefix, key);
    return this.cache.put(cacheKey, value, ttl);
  }

  del(key) {
    let cacheKey = joinKeys(this.prefix, key);
    return this.cache.del(cacheKey);
  }

  clear() {
    return this.cache.clear();
  }
}


export class CacheController extends AdaptableController {

  constructor(adapter, appId, options = {}) {
    super(adapter, appId, options);

    this.role = new SubCache('role', this);
    this.user = new SubCache('user', this);
  }

  get(key) {
    let cacheKey = joinKeys(this.appId, key);
    return this.adapter.get(cacheKey).then(null, () => Promise.resolve(null));
  }

  put(key, value, ttl) {
    let cacheKey = joinKeys(this.appId, key);
    return this.adapter.put(cacheKey, value, ttl);
  }

  del(key) {
    let cacheKey = joinKeys(this.appId, key);
    return this.adapter.del(cacheKey);
  }

  clear() {
    return this.adapter.clear();
  }

  expectedAdapterType() {
    return CacheAdapter;
  }
}

export default CacheController;
