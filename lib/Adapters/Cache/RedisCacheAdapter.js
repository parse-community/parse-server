'use strict';

Object.defineProperty(exports, "__esModule", {
  value: true
});
exports.RedisCacheAdapter = undefined;

var _redis = require('redis');

var _redis2 = _interopRequireDefault(_redis);

var _logger = require('../../logger');

var _logger2 = _interopRequireDefault(_logger);

function _interopRequireDefault(obj) { return obj && obj.__esModule ? obj : { default: obj }; }

const DEFAULT_REDIS_TTL = 30 * 1000; // 30 seconds in milliseconds

function debug() {
  _logger2.default.debug.apply(_logger2.default, ['RedisCacheAdapter', ...arguments]);
}

class RedisCacheAdapter {

  constructor(redisCtx, ttl = DEFAULT_REDIS_TTL) {
    this.client = _redis2.default.createClient(redisCtx);
    this.p = Promise.resolve();
    this.ttl = ttl;
  }

  get(key) {
    debug('get', key);
    this.p = this.p.then(() => {
      return new Promise(resolve => {
        this.client.get(key, function (err, res) {
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

  put(key, value, ttl = this.ttl) {
    value = JSON.stringify(value);
    debug('put', key, value, ttl);
    if (ttl === 0) {
      return this.p; // ttl of zero is a logical no-op, but redis cannot set expire time of zero
    }
    if (ttl < 0 || isNaN(ttl)) {
      ttl = DEFAULT_REDIS_TTL;
    }
    this.p = this.p.then(() => {
      return new Promise(resolve => {
        if (ttl === Infinity) {
          this.client.set(key, value, function () {
            resolve();
          });
        } else {
          this.client.psetex(key, ttl, value, function () {
            resolve();
          });
        }
      });
    });
    return this.p;
  }

  del(key) {
    debug('del', key);
    this.p = this.p.then(() => {
      return new Promise(resolve => {
        this.client.del(key, function () {
          resolve();
        });
      });
    });
    return this.p;
  }

  clear() {
    debug('clear');
    this.p = this.p.then(() => {
      return new Promise(resolve => {
        this.client.flushdb(function () {
          resolve();
        });
      });
    });
    return this.p;
  }
}

exports.RedisCacheAdapter = RedisCacheAdapter;
exports.default = RedisCacheAdapter;