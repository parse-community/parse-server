"use strict";

Object.defineProperty(exports, "__esModule", {
  value: true
});

var _createClass = function () { function defineProperties(target, props) { for (var i = 0; i < props.length; i++) { var descriptor = props[i]; descriptor.enumerable = descriptor.enumerable || false; descriptor.configurable = true; if ("value" in descriptor) descriptor.writable = true; Object.defineProperty(target, descriptor.key, descriptor); } } return function (Constructor, protoProps, staticProps) { if (protoProps) defineProperties(Constructor.prototype, protoProps); if (staticProps) defineProperties(Constructor, staticProps); return Constructor; }; }();

function _classCallCheck(instance, Constructor) { if (!(instance instanceof Constructor)) { throw new TypeError("Cannot call a class as a function"); } }

var NullCacheAdapter = exports.NullCacheAdapter = function () {
  function NullCacheAdapter(ctx) {
    _classCallCheck(this, NullCacheAdapter);
  }

  _createClass(NullCacheAdapter, [{
    key: "get",
    value: function get(key) {
      return new Promise(function (resolve, _) {
        return resolve(null);
      });
    }
  }, {
    key: "put",
    value: function put(key, value, ttl) {
      return Promise.resolve();
    }
  }, {
    key: "del",
    value: function del(key) {
      return Promise.resolve();
    }
  }, {
    key: "clear",
    value: function clear() {
      return Promise.resolve();
    }
  }]);

  return NullCacheAdapter;
}();

exports.default = NullCacheAdapter;