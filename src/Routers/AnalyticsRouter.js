// AnalyticsRouter.js
const { PromiseRouter } = require('../PromiseRouter');

function appOpened(req) {
  const analyticsController = req.config.analyticsController;
  return analyticsController.appOpened(req);
}

function trackEvent(req) {
  const analyticsController = req.config.analyticsController;
  return analyticsController.trackEvent(req);
}


class AnalyticsRouter extends PromiseRouter {
  mountRoutes() {
    this.route('POST','/events/AppOpened', appOpened);
    this.route('POST','/events/:eventName', trackEvent);
  }
}

module.exports = { AnalyticsRouter };
