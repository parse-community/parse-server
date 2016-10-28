"use strict";

Object.defineProperty(exports, "__esModule", {
  value: true
});

var _createClass = function () { function defineProperties(target, props) { for (var i = 0; i < props.length; i++) { var descriptor = props[i]; descriptor.enumerable = descriptor.enumerable || false; descriptor.configurable = true; if ("value" in descriptor) descriptor.writable = true; Object.defineProperty(target, descriptor.key, descriptor); } } return function (Constructor, protoProps, staticProps) { if (protoProps) defineProperties(Constructor.prototype, protoProps); if (staticProps) defineProperties(Constructor, staticProps); return Constructor; }; }();

function _classCallCheck(instance, Constructor) { if (!(instance instanceof Constructor)) { throw new TypeError("Cannot call a class as a function"); } }

// Push Adapter
//
// Allows you to change the push notification mechanism.
//
// Adapter classes must implement the following functions:
// * getValidPushTypes()
// * send(devices, installations, pushStatus)
//
// Default is ParsePushAdapter, which uses GCM for
// android push and APNS for ios push.

var PushAdapter = exports.PushAdapter = function () {
  function PushAdapter() {
    _classCallCheck(this, PushAdapter);
  }

  _createClass(PushAdapter, [{
    key: "send",
    value: function send(devices, installations, pushStatus) {}

    /**
     * Get an array of valid push types.
     * @returns {Array} An array of valid push types
     */

  }, {
    key: "getValidPushTypes",
    value: function getValidPushTypes() {}
  }]);

  return PushAdapter;
}();

exports.default = PushAdapter;