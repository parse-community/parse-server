'use strict';

Object.defineProperty(exports, "__esModule", {
  value: true
});
exports.LRUCache = undefined;

var _lruCache = require('lru-cache');

var _lruCache2 = _interopRequireDefault(_lruCache);

var _defaults = require('../../defaults');

var _defaults2 = _interopRequireDefault(_defaults);

function _interopRequireDefault(obj) { return obj && obj.__esModule ? obj : { default: obj }; }

class LRUCache {
  constructor({
    ttl = _defaults2.default.cacheTTL,
    maxSize = _defaults2.default.cacheMaxSize
  }) {
    this.cache = new _lruCache2.default({
      max: maxSize,
      maxAge: ttl
    });
  }

  get(key) {
    return this.cache.get(key) || null;
  }

  put(key, value, ttl = this.ttl) {
    this.cache.set(key, value, ttl);
  }

  del(key) {
    this.cache.del(key);
  }

  clear() {
    this.cache.reset();
  }

}

exports.LRUCache = LRUCache;
exports.default = LRUCache;