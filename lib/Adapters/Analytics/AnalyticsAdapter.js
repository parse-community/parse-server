"use strict";

Object.defineProperty(exports, "__esModule", {
  value: true
});

var _createClass = function () { function defineProperties(target, props) { for (var i = 0; i < props.length; i++) { var descriptor = props[i]; descriptor.enumerable = descriptor.enumerable || false; descriptor.configurable = true; if ("value" in descriptor) descriptor.writable = true; Object.defineProperty(target, descriptor.key, descriptor); } } return function (Constructor, protoProps, staticProps) { if (protoProps) defineProperties(Constructor.prototype, protoProps); if (staticProps) defineProperties(Constructor, staticProps); return Constructor; }; }();

function _classCallCheck(instance, Constructor) { if (!(instance instanceof Constructor)) { throw new TypeError("Cannot call a class as a function"); } }

var AnalyticsAdapter = exports.AnalyticsAdapter = function () {
  function AnalyticsAdapter() {
    _classCallCheck(this, AnalyticsAdapter);
  }

  _createClass(AnalyticsAdapter, [{
    key: "appOpened",
    value: function appOpened(parameters, req) {
      return Promise.resolve({});
    }
  }, {
    key: "trackEvent",
    value: function trackEvent(eventName, parameters, req) {
      return Promise.resolve({});
    }
  }]);

  return AnalyticsAdapter;
}();

exports.default = AnalyticsAdapter;