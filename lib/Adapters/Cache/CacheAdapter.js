"use strict";

Object.defineProperty(exports, "__esModule", {
  value: true
});

var _createClass = function () { function defineProperties(target, props) { for (var i = 0; i < props.length; i++) { var descriptor = props[i]; descriptor.enumerable = descriptor.enumerable || false; descriptor.configurable = true; if ("value" in descriptor) descriptor.writable = true; Object.defineProperty(target, descriptor.key, descriptor); } } return function (Constructor, protoProps, staticProps) { if (protoProps) defineProperties(Constructor.prototype, protoProps); if (staticProps) defineProperties(Constructor, staticProps); return Constructor; }; }();

function _classCallCheck(instance, Constructor) { if (!(instance instanceof Constructor)) { throw new TypeError("Cannot call a class as a function"); } }

/*eslint no-unused-vars: "off"*/
var CacheAdapter = exports.CacheAdapter = function () {
  function CacheAdapter() {
    _classCallCheck(this, CacheAdapter);
  }

  _createClass(CacheAdapter, [{
    key: "get",

    /**
     * Get a value in the cache
     * @param key Cache key to get
     * @return Promise that will eventually resolve to the value in the cache.
     */
    value: function get(key) {}

    /**
     * Set a value in the cache
     * @param key Cache key to set
     * @param value Value to set the key
     * @param ttl Optional TTL
     */

  }, {
    key: "put",
    value: function put(key, value, ttl) {}

    /**
     * Remove a value from the cache.
     * @param key Cache key to remove
     */

  }, {
    key: "del",
    value: function del(key) {}

    /**
     * Empty a cache
     */

  }, {
    key: "clear",
    value: function clear() {}
  }]);

  return CacheAdapter;
}();