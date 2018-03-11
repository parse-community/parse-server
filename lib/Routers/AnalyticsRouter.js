'use strict';

Object.defineProperty(exports, "__esModule", {
  value: true
});
exports.AnalyticsRouter = undefined;

var _PromiseRouter = require('../PromiseRouter');

var _PromiseRouter2 = _interopRequireDefault(_PromiseRouter);

function _interopRequireDefault(obj) { return obj && obj.__esModule ? obj : { default: obj }; }

function appOpened(req) {
  const analyticsController = req.config.analyticsController;
  return analyticsController.appOpened(req);
} // AnalyticsRouter.js


function trackEvent(req) {
  const analyticsController = req.config.analyticsController;
  return analyticsController.trackEvent(req);
}

class AnalyticsRouter extends _PromiseRouter2.default {
  mountRoutes() {
    this.route('POST', '/events/AppOpened', appOpened);
    this.route('POST', '/events/:eventName', trackEvent);
  }
}
exports.AnalyticsRouter = AnalyticsRouter;