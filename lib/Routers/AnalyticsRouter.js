'use strict';

Object.defineProperty(exports, "__esModule", {
  value: true
});
exports.AnalyticsRouter = undefined;

var _createClass = function () { function defineProperties(target, props) { for (var i = 0; i < props.length; i++) { var descriptor = props[i]; descriptor.enumerable = descriptor.enumerable || false; descriptor.configurable = true; if ("value" in descriptor) descriptor.writable = true; Object.defineProperty(target, descriptor.key, descriptor); } } return function (Constructor, protoProps, staticProps) { if (protoProps) defineProperties(Constructor.prototype, protoProps); if (staticProps) defineProperties(Constructor, staticProps); return Constructor; }; }();

var _PromiseRouter2 = require('../PromiseRouter');

var _PromiseRouter3 = _interopRequireDefault(_PromiseRouter2);

function _interopRequireDefault(obj) { return obj && obj.__esModule ? obj : { default: obj }; }

function _classCallCheck(instance, Constructor) { if (!(instance instanceof Constructor)) { throw new TypeError("Cannot call a class as a function"); } }

function _possibleConstructorReturn(self, call) { if (!self) { throw new ReferenceError("this hasn't been initialised - super() hasn't been called"); } return call && (typeof call === "object" || typeof call === "function") ? call : self; }

function _inherits(subClass, superClass) { if (typeof superClass !== "function" && superClass !== null) { throw new TypeError("Super expression must either be null or a function, not " + typeof superClass); } subClass.prototype = Object.create(superClass && superClass.prototype, { constructor: { value: subClass, enumerable: false, writable: true, configurable: true } }); if (superClass) Object.setPrototypeOf ? Object.setPrototypeOf(subClass, superClass) : subClass.__proto__ = superClass; } // AnalyticsRouter.js


function appOpened(req) {
  var analyticsController = req.config.analyticsController;
  return analyticsController.appOpened(req);
}

function trackEvent(req) {
  var analyticsController = req.config.analyticsController;
  return analyticsController.trackEvent(req);
}

var AnalyticsRouter = exports.AnalyticsRouter = function (_PromiseRouter) {
  _inherits(AnalyticsRouter, _PromiseRouter);

  function AnalyticsRouter() {
    _classCallCheck(this, AnalyticsRouter);

    return _possibleConstructorReturn(this, (AnalyticsRouter.__proto__ || Object.getPrototypeOf(AnalyticsRouter)).apply(this, arguments));
  }

  _createClass(AnalyticsRouter, [{
    key: 'mountRoutes',
    value: function mountRoutes() {
      this.route('POST', '/events/AppOpened', appOpened);
      this.route('POST', '/events/:eventName', trackEvent);
    }
  }]);

  return AnalyticsRouter;
}(_PromiseRouter3.default);