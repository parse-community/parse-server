"use strict";

Object.defineProperty(exports, "__esModule", {
  value: true
});

var _createClass = function () { function defineProperties(target, props) { for (var i = 0; i < props.length; i++) { var descriptor = props[i]; descriptor.enumerable = descriptor.enumerable || false; descriptor.configurable = true; if ("value" in descriptor) descriptor.writable = true; Object.defineProperty(target, descriptor.key, descriptor); } } return function (Constructor, protoProps, staticProps) { if (protoProps) defineProperties(Constructor.prototype, protoProps); if (staticProps) defineProperties(Constructor, staticProps); return Constructor; }; }();

function _classCallCheck(instance, Constructor) { if (!(instance instanceof Constructor)) { throw new TypeError("Cannot call a class as a function"); } }

// Logger Adapter
//
// Allows you to change the logger mechanism
//
// Adapter classes must implement the following functions:
// * info(obj1 [, obj2, .., objN])
// * error(obj1 [, obj2, .., objN])
// * query(options, callback)
// Default is FileLoggerAdapter.js

var LoggerAdapter = exports.LoggerAdapter = function () {
  function LoggerAdapter() {
    _classCallCheck(this, LoggerAdapter);
  }

  _createClass(LoggerAdapter, [{
    key: "info",
    value: function info() {}
  }, {
    key: "error",
    value: function error() {}
  }, {
    key: "query",
    value: function query(options, callback) {}
  }]);

  return LoggerAdapter;
}();

exports.default = LoggerAdapter;