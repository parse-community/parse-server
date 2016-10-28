'use strict';

Object.defineProperty(exports, "__esModule", {
  value: true
});
exports.CacheController = exports.SubCache = undefined;

var _createClass = function () { function defineProperties(target, props) { for (var i = 0; i < props.length; i++) { var descriptor = props[i]; descriptor.enumerable = descriptor.enumerable || false; descriptor.configurable = true; if ("value" in descriptor) descriptor.writable = true; Object.defineProperty(target, descriptor.key, descriptor); } } return function (Constructor, protoProps, staticProps) { if (protoProps) defineProperties(Constructor.prototype, protoProps); if (staticProps) defineProperties(Constructor, staticProps); return Constructor; }; }();

var _AdaptableController2 = require('./AdaptableController');

var _AdaptableController3 = _interopRequireDefault(_AdaptableController2);

var _CacheAdapter = require('../Adapters/Cache/CacheAdapter');

var _CacheAdapter2 = _interopRequireDefault(_CacheAdapter);

function _interopRequireDefault(obj) { return obj && obj.__esModule ? obj : { default: obj }; }

function _possibleConstructorReturn(self, call) { if (!self) { throw new ReferenceError("this hasn't been initialised - super() hasn't been called"); } return call && (typeof call === "object" || typeof call === "function") ? call : self; }

function _inherits(subClass, superClass) { if (typeof superClass !== "function" && superClass !== null) { throw new TypeError("Super expression must either be null or a function, not " + typeof superClass); } subClass.prototype = Object.create(superClass && superClass.prototype, { constructor: { value: subClass, enumerable: false, writable: true, configurable: true } }); if (superClass) Object.setPrototypeOf ? Object.setPrototypeOf(subClass, superClass) : subClass.__proto__ = superClass; }

function _classCallCheck(instance, Constructor) { if (!(instance instanceof Constructor)) { throw new TypeError("Cannot call a class as a function"); } }

var KEY_SEPARATOR_CHAR = ':';

function joinKeys() {
  for (var _len = arguments.length, keys = Array(_len), _key = 0; _key < _len; _key++) {
    keys[_key] = arguments[_key];
  }

  return keys.join(KEY_SEPARATOR_CHAR);
}

/**
 * Prefix all calls to the cache via a prefix string, useful when grouping Cache by object type.
 *
 * eg "Role" or "Session"
 */

var SubCache = exports.SubCache = function () {
  function SubCache(prefix, cacheController, ttl) {
    _classCallCheck(this, SubCache);

    this.prefix = prefix;
    this.cache = cacheController;
    this.ttl = ttl;
  }

  _createClass(SubCache, [{
    key: 'get',
    value: function get(key) {
      var cacheKey = joinKeys(this.prefix, key);
      return this.cache.get(cacheKey);
    }
  }, {
    key: 'put',
    value: function put(key, value, ttl) {
      var cacheKey = joinKeys(this.prefix, key);
      return this.cache.put(cacheKey, value, ttl);
    }
  }, {
    key: 'del',
    value: function del(key) {
      var cacheKey = joinKeys(this.prefix, key);
      return this.cache.del(cacheKey);
    }
  }, {
    key: 'clear',
    value: function clear() {
      return this.cache.clear();
    }
  }]);

  return SubCache;
}();

var CacheController = exports.CacheController = function (_AdaptableController) {
  _inherits(CacheController, _AdaptableController);

  function CacheController(adapter, appId) {
    var options = arguments.length <= 2 || arguments[2] === undefined ? {} : arguments[2];

    _classCallCheck(this, CacheController);

    var _this = _possibleConstructorReturn(this, (CacheController.__proto__ || Object.getPrototypeOf(CacheController)).call(this, adapter, appId, options));

    _this.role = new SubCache('role', _this);
    _this.user = new SubCache('user', _this);
    return _this;
  }

  _createClass(CacheController, [{
    key: 'get',
    value: function get(key) {
      var cacheKey = joinKeys(this.appId, key);
      return this.adapter.get(cacheKey).then(null, function () {
        return Promise.resolve(null);
      });
    }
  }, {
    key: 'put',
    value: function put(key, value, ttl) {
      var cacheKey = joinKeys(this.appId, key);
      return this.adapter.put(cacheKey, value, ttl);
    }
  }, {
    key: 'del',
    value: function del(key) {
      var cacheKey = joinKeys(this.appId, key);
      return this.adapter.del(cacheKey);
    }
  }, {
    key: 'clear',
    value: function clear() {
      return this.adapter.clear();
    }
  }, {
    key: 'expectedAdapterType',
    value: function expectedAdapterType() {
      return _CacheAdapter2.default;
    }
  }]);

  return CacheController;
}(_AdaptableController3.default);

exports.default = CacheController;