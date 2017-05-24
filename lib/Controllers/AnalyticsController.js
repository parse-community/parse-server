'use strict';

Object.defineProperty(exports, "__esModule", {
  value: true
});
exports.AnalyticsController = undefined;

var _createClass = function () { function defineProperties(target, props) { for (var i = 0; i < props.length; i++) { var descriptor = props[i]; descriptor.enumerable = descriptor.enumerable || false; descriptor.configurable = true; if ("value" in descriptor) descriptor.writable = true; Object.defineProperty(target, descriptor.key, descriptor); } } return function (Constructor, protoProps, staticProps) { if (protoProps) defineProperties(Constructor.prototype, protoProps); if (staticProps) defineProperties(Constructor, staticProps); return Constructor; }; }();

var _AdaptableController2 = require('./AdaptableController');

var _AdaptableController3 = _interopRequireDefault(_AdaptableController2);

var _AnalyticsAdapter = require('../Adapters/Analytics/AnalyticsAdapter');

function _interopRequireDefault(obj) { return obj && obj.__esModule ? obj : { default: obj }; }

function _classCallCheck(instance, Constructor) { if (!(instance instanceof Constructor)) { throw new TypeError("Cannot call a class as a function"); } }

function _possibleConstructorReturn(self, call) { if (!self) { throw new ReferenceError("this hasn't been initialised - super() hasn't been called"); } return call && (typeof call === "object" || typeof call === "function") ? call : self; }

function _inherits(subClass, superClass) { if (typeof superClass !== "function" && superClass !== null) { throw new TypeError("Super expression must either be null or a function, not " + typeof superClass); } subClass.prototype = Object.create(superClass && superClass.prototype, { constructor: { value: subClass, enumerable: false, writable: true, configurable: true } }); if (superClass) Object.setPrototypeOf ? Object.setPrototypeOf(subClass, superClass) : subClass.__proto__ = superClass; }

var AnalyticsController = exports.AnalyticsController = function (_AdaptableController) {
  _inherits(AnalyticsController, _AdaptableController);

  function AnalyticsController() {
    _classCallCheck(this, AnalyticsController);

    return _possibleConstructorReturn(this, (AnalyticsController.__proto__ || Object.getPrototypeOf(AnalyticsController)).apply(this, arguments));
  }

  _createClass(AnalyticsController, [{
    key: 'appOpened',
    value: function appOpened(req) {
      var _this2 = this;

      return Promise.resolve().then(function () {
        return _this2.adapter.appOpened(req.body, req);
      }).then(function (response) {
        return { response: response || {} };
      }).catch(function () {
        return { response: {} };
      });
    }
  }, {
    key: 'trackEvent',
    value: function trackEvent(req) {
      var _this3 = this;

      return Promise.resolve().then(function () {
        return _this3.adapter.trackEvent(req.params.eventName, req.body, req);
      }).then(function (response) {
        return { response: response || {} };
      }).catch(function () {
        return { response: {} };
      });
    }
  }, {
    key: 'expectedAdapterType',
    value: function expectedAdapterType() {
      return _AnalyticsAdapter.AnalyticsAdapter;
    }
  }]);

  return AnalyticsController;
}(_AdaptableController3.default);

exports.default = AnalyticsController;