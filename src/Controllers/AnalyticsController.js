const { AdaptableController } = require('./AdaptableController');
const { AnalyticsAdapter } = require('../Adapters/Analytics/AnalyticsAdapter');

class AnalyticsController extends AdaptableController {
  appOpened(req) {
    return Promise.resolve().then(() => {
      return this.adapter.appOpened(req.body, req);
    }).then((response) => {
      return { response: response || {} };
    }).catch(() => {
      return { response: {} };
    });
  }

  trackEvent(req) {
    return Promise.resolve().then(() => {
      return this.adapter.trackEvent(req.params.eventName, req.body, req);
    }).then((response) => {
      return { response: response || {} };
    }).catch(() => {
      return { response: {} };
    });
  }

  expectedAdapterType() {
    return AnalyticsAdapter;
  }
}

module.exports = { AnalyticsController };
