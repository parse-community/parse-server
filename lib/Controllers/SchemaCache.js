"use strict";

Object.defineProperty(exports, "__esModule", {
  value: true
});

var _createClass = function () { function defineProperties(target, props) { for (var i = 0; i < props.length; i++) { var descriptor = props[i]; descriptor.enumerable = descriptor.enumerable || false; descriptor.configurable = true; if ("value" in descriptor) descriptor.writable = true; Object.defineProperty(target, descriptor.key, descriptor); } } return function (Constructor, protoProps, staticProps) { if (protoProps) defineProperties(Constructor.prototype, protoProps); if (staticProps) defineProperties(Constructor, staticProps); return Constructor; }; }();

var _cryptoUtils = require("../cryptoUtils");

var _defaults = require("../defaults");

var _defaults2 = _interopRequireDefault(_defaults);

function _interopRequireDefault(obj) { return obj && obj.__esModule ? obj : { default: obj }; }

function _classCallCheck(instance, Constructor) { if (!(instance instanceof Constructor)) { throw new TypeError("Cannot call a class as a function"); } }

var MAIN_SCHEMA = "__MAIN_SCHEMA";
var SCHEMA_CACHE_PREFIX = "__SCHEMA";
var ALL_KEYS = "__ALL_KEYS";

var SchemaCache = function () {
  function SchemaCache(cacheController) {
    var ttl = arguments.length > 1 && arguments[1] !== undefined ? arguments[1] : _defaults2.default.schemaCacheTTL;
    var singleCache = arguments.length > 2 && arguments[2] !== undefined ? arguments[2] : false;

    _classCallCheck(this, SchemaCache);

    this.ttl = ttl;
    if (typeof ttl == 'string') {
      this.ttl = parseInt(ttl);
    }
    this.cache = cacheController;
    this.prefix = SCHEMA_CACHE_PREFIX;
    if (!singleCache) {
      this.prefix += (0, _cryptoUtils.randomString)(20);
    }
  }

  _createClass(SchemaCache, [{
    key: "put",
    value: function put(key, value) {
      var _this = this;

      return this.cache.get(this.prefix + ALL_KEYS).then(function (allKeys) {
        allKeys = allKeys || {};
        allKeys[key] = true;
        return Promise.all([_this.cache.put(_this.prefix + ALL_KEYS, allKeys, _this.ttl), _this.cache.put(key, value, _this.ttl)]);
      });
    }
  }, {
    key: "getAllClasses",
    value: function getAllClasses() {
      if (!this.ttl) {
        return Promise.resolve(null);
      }
      return this.cache.get(this.prefix + MAIN_SCHEMA);
    }
  }, {
    key: "setAllClasses",
    value: function setAllClasses(schema) {
      if (!this.ttl) {
        return Promise.resolve(null);
      }
      return this.put(this.prefix + MAIN_SCHEMA, schema);
    }
  }, {
    key: "setOneSchema",
    value: function setOneSchema(className, schema) {
      if (!this.ttl) {
        return Promise.resolve(null);
      }
      return this.put(this.prefix + className, schema);
    }
  }, {
    key: "getOneSchema",
    value: function getOneSchema(className) {
      var _this2 = this;

      if (!this.ttl) {
        return Promise.resolve(null);
      }
      return this.cache.get(this.prefix + className).then(function (schema) {
        if (schema) {
          return Promise.resolve(schema);
        }
        return _this2.cache.get(_this2.prefix + MAIN_SCHEMA).then(function (cachedSchemas) {
          cachedSchemas = cachedSchemas || [];
          schema = cachedSchemas.find(function (cachedSchema) {
            return cachedSchema.className === className;
          });
          if (schema) {
            return Promise.resolve(schema);
          }
          return Promise.resolve(null);
        });
      });
    }
  }, {
    key: "clear",
    value: function clear() {
      var _this3 = this;

      // That clears all caches...
      return this.cache.get(this.prefix + ALL_KEYS).then(function (allKeys) {
        if (!allKeys) {
          return;
        }
        var promises = Object.keys(allKeys).map(function (key) {
          return _this3.cache.del(key);
        });
        return Promise.all(promises);
      });
    }
  }]);

  return SchemaCache;
}();

exports.default = SchemaCache;