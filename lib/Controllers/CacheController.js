'use strict';

Object.defineProperty(exports, "__esModule", {
  value: true
});
exports.CacheController = exports.SubCache = undefined;

var _AdaptableController = require('./AdaptableController');

var _AdaptableController2 = _interopRequireDefault(_AdaptableController);

var _CacheAdapter = require('../Adapters/Cache/CacheAdapter');

var _CacheAdapter2 = _interopRequireDefault(_CacheAdapter);

function _interopRequireDefault(obj) { return obj && obj.__esModule ? obj : { default: obj }; }

const KEY_SEPARATOR_CHAR = ':';

function joinKeys(...keys) {
  return keys.join(KEY_SEPARATOR_CHAR);
}

/**
 * Prefix all calls to the cache via a prefix string, useful when grouping Cache by object type.
 *
 * eg "Role" or "Session"
 */
class SubCache {
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

  clear() {
    return this.cache.clear();
  }
}

exports.SubCache = SubCache;
class CacheController extends _AdaptableController2.default {

  constructor(adapter, appId, options = {}) {
    super(adapter, appId, options);

    this.role = new SubCache('role', this);
    this.user = new SubCache('user', this);
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

  clear() {
    return this.adapter.clear();
  }

  expectedAdapterType() {
    return _CacheAdapter2.default;
  }
}

exports.CacheController = CacheController;
exports.default = CacheController;