'use strict';

Object.defineProperty(exports, "__esModule", {
  value: true
});
exports.InMemoryCacheAdapter = undefined;

var _createClass = function () { function defineProperties(target, props) { for (var i = 0; i < props.length; i++) { var descriptor = props[i]; descriptor.enumerable = descriptor.enumerable || false; descriptor.configurable = true; if ("value" in descriptor) descriptor.writable = true; Object.defineProperty(target, descriptor.key, descriptor); } } return function (Constructor, protoProps, staticProps) { if (protoProps) defineProperties(Constructor.prototype, protoProps); if (staticProps) defineProperties(Constructor, staticProps); return Constructor; }; }();

var _InMemoryCache = require('./InMemoryCache');

function _classCallCheck(instance, Constructor) { if (!(instance instanceof Constructor)) { throw new TypeError("Cannot call a class as a function"); } }

var InMemoryCacheAdapter = exports.InMemoryCacheAdapter = function () {
  function InMemoryCacheAdapter(ctx) {
    _classCallCheck(this, InMemoryCacheAdapter);

    this.cache = new _InMemoryCache.InMemoryCache(ctx);
  }

  _createClass(InMemoryCacheAdapter, [{
    key: 'get',
    value: function get(key) {
      var _this = this;

      return new Promise(function (resolve, reject) {
        var record = _this.cache.get(key);
        if (record == null) {
          return resolve(null);
        }

        return resolve(JSON.parse(record));
      });
    }
  }, {
    key: 'put',
    value: function put(key, value, ttl) {
      this.cache.put(key, JSON.stringify(value), ttl);
      return Promise.resolve();
    }
  }, {
    key: 'del',
    value: function del(key) {
      this.cache.del(key);
      return Promise.resolve();
    }
  }, {
    key: 'clear',
    value: function clear() {
      this.cache.clear();
      return Promise.resolve();
    }
  }]);

  return InMemoryCacheAdapter;
}();

exports.default = InMemoryCacheAdapter;