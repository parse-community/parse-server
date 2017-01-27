'use strict';

Object.defineProperty(exports, "__esModule", {
  value: true
});
exports.RedisCacheAdapter = undefined;

var _createClass = function () { function defineProperties(target, props) { for (var i = 0; i < props.length; i++) { var descriptor = props[i]; descriptor.enumerable = descriptor.enumerable || false; descriptor.configurable = true; if ("value" in descriptor) descriptor.writable = true; Object.defineProperty(target, descriptor.key, descriptor); } } return function (Constructor, protoProps, staticProps) { if (protoProps) defineProperties(Constructor.prototype, protoProps); if (staticProps) defineProperties(Constructor, staticProps); return Constructor; }; }();

var _redis = require('redis');

var _redis2 = _interopRequireDefault(_redis);

var _logger = require('../../logger');

var _logger2 = _interopRequireDefault(_logger);

function _interopRequireDefault(obj) { return obj && obj.__esModule ? obj : { default: obj }; }

function _classCallCheck(instance, Constructor) { if (!(instance instanceof Constructor)) { throw new TypeError("Cannot call a class as a function"); } }

var DEFAULT_REDIS_TTL = 30 * 1000; // 30 seconds in milliseconds

function debug() {
  _logger2.default.debug.apply(_logger2.default, ['RedisCacheAdapter'].concat(Array.prototype.slice.call(arguments)));
}

var RedisCacheAdapter = exports.RedisCacheAdapter = function () {
  function RedisCacheAdapter(ctx) {
    _classCallCheck(this, RedisCacheAdapter);

    this.client = _redis2.default.createClient(ctx);
    this.p = Promise.resolve();
  }

  _createClass(RedisCacheAdapter, [{
    key: 'get',
    value: function get(key) {
      var _this = this;

      debug('get', key);
      this.p = this.p.then(function () {
        return new Promise(function (resolve) {
          _this.client.get(key, function (err, res) {
            debug('-> get', key, res);
            if (!res) {
              return resolve(null);
            }
            resolve(JSON.parse(res));
          });
        });
      });
      return this.p;
    }
  }, {
    key: 'put',
    value: function put(key, value) {
      var _this2 = this;

      var ttl = arguments.length > 2 && arguments[2] !== undefined ? arguments[2] : DEFAULT_REDIS_TTL;

      value = JSON.stringify(value);
      debug('put', key, value, ttl);
      if (ttl === 0) {
        return this.p; // ttl of zero is a logical no-op, but redis cannot set expire time of zero
      }
      if (ttl < 0 || isNaN(ttl)) {
        ttl = DEFAULT_REDIS_TTL;
      }
      this.p = this.p.then(function () {
        return new Promise(function (resolve) {
          if (ttl === Infinity) {
            _this2.client.set(key, value, function () {
              resolve();
            });
          } else {
            _this2.client.psetex(key, ttl, value, function () {
              resolve();
            });
          }
        });
      });
      return this.p;
    }
  }, {
    key: 'del',
    value: function del(key) {
      var _this3 = this;

      debug('del', key);
      this.p = this.p.then(function () {
        return new Promise(function (resolve) {
          _this3.client.del(key, function () {
            resolve();
          });
        });
      });
      return this.p;
    }
  }, {
    key: 'clear',
    value: function clear() {
      var _this4 = this;

      debug('clear');
      this.p = this.p.then(function () {
        return new Promise(function (resolve) {
          _this4.client.flushall(function () {
            resolve();
          });
        });
      });
      return this.p;
    }
  }]);

  return RedisCacheAdapter;
}();

exports.default = RedisCacheAdapter;