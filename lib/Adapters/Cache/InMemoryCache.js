"use strict";

Object.defineProperty(exports, "__esModule", {
  value: true
});

var _createClass = function () { function defineProperties(target, props) { for (var i = 0; i < props.length; i++) { var descriptor = props[i]; descriptor.enumerable = descriptor.enumerable || false; descriptor.configurable = true; if ("value" in descriptor) descriptor.writable = true; Object.defineProperty(target, descriptor.key, descriptor); } } return function (Constructor, protoProps, staticProps) { if (protoProps) defineProperties(Constructor.prototype, protoProps); if (staticProps) defineProperties(Constructor, staticProps); return Constructor; }; }();

function _classCallCheck(instance, Constructor) { if (!(instance instanceof Constructor)) { throw new TypeError("Cannot call a class as a function"); } }

var DEFAULT_CACHE_TTL = 5 * 1000;

var InMemoryCache = exports.InMemoryCache = function () {
  function InMemoryCache(_ref) {
    var _ref$ttl = _ref.ttl,
        ttl = _ref$ttl === undefined ? DEFAULT_CACHE_TTL : _ref$ttl;

    _classCallCheck(this, InMemoryCache);

    this.ttl = ttl;
    this.cache = Object.create(null);
  }

  _createClass(InMemoryCache, [{
    key: "get",
    value: function get(key) {
      var record = this.cache[key];
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
  }, {
    key: "put",
    value: function put(key, value) {
      var _this = this;

      var ttl = arguments.length > 2 && arguments[2] !== undefined ? arguments[2] : this.ttl;

      if (ttl < 0 || isNaN(ttl)) {
        ttl = NaN;
      }

      var record = {
        value: value,
        expire: ttl + Date.now()
      };

      if (!isNaN(record.expire)) {
        record.timeout = setTimeout(function () {
          _this.del(key);
        }, ttl);
      }

      this.cache[key] = record;
    }
  }, {
    key: "del",
    value: function del(key) {
      var record = this.cache[key];
      if (record == null) {
        return;
      }

      if (record.timeout) {
        clearTimeout(record.timeout);
      }
      delete this.cache[key];
    }
  }, {
    key: "clear",
    value: function clear() {
      this.cache = Object.create(null);
    }
  }]);

  return InMemoryCache;
}();

exports.default = InMemoryCache;