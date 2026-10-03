import AdaptableController from './AdaptableController';
import CacheAdapter from '../Adapters/Cache/CacheAdapter';

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
    const cacheKey = joinKeys(this.prefix, key);
    return this.cache.get(cacheKey);
  }

  put(key, value, ttl) {
    const cacheKey = joinKeys(this.prefix, key);
    return this.cache.put(cacheKey, value, ttl);
  }

  del(key) {
    const cacheKey = joinKeys(this.prefix, key);
    return this.cache.del(cacheKey);
  }

  /**
   * Empty this sub-cache by asking the adapter to clear only this sub-cache's
   * key scope. Adapters that implement scoped clearing, which includes the
   * built-in Redis and in-memory adapters, leave keys owned by other
   * sub-caches, other Parse apps, and other consumers of the same backend
   * untouched. An adapter that ignores the prefix empties the whole cache.
   */
  clear() {
    return this.cache.clear(this.prefix);
  }
}

export class CacheController extends AdaptableController {
  constructor(adapter, appId, options = {}) {
    super(adapter, appId, options);

    this.role = new SubCache('role', this);
    this.user = new SubCache('user', this);
    this.graphQL = new SubCache('graphQL', this);
  }

  get(key) {
    const cacheKey = joinKeys(this.appId, key);
    return this.adapter.get(cacheKey).then(null, () => Promise.resolve(null));
  }

  put(key, value, ttl) {
    const cacheKey = joinKeys(this.appId, key);
    return this.adapter.put(cacheKey, value, ttl);
  }

  del(key) {
    const cacheKey = joinKeys(this.appId, key);
    return this.adapter.del(cacheKey);
  }

  /**
   * Empty this app's cache by asking the adapter to clear only this app's key
   * scope. Adapters that implement scoped clearing leave keys belonging to
   * other Parse apps sharing the same backend untouched. An adapter that
   * ignores the prefix empties the whole cache.
   *
   * @param {String} prefix Optional sub-cache prefix to narrow the scope
   * further, for example `role`.
   */
  clear(prefix) {
    const scope = prefix == null ? this.appId : joinKeys(this.appId, prefix);
    return this.adapter.clear(scope);
  }

  expectedAdapterType() {
    return CacheAdapter;
  }
}

export default CacheController;
