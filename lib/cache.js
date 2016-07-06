'use strict';

Object.defineProperty(exports, "__esModule", {
  value: true
});
exports.AppCache = undefined;

var _InMemoryCache = require('./Adapters/Cache/InMemoryCache');

var AppCache = exports.AppCache = new _InMemoryCache.InMemoryCache({ ttl: NaN });
exports.default = AppCache;