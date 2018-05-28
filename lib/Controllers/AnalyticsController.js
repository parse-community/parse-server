'use strict';

Object.defineProperty(exports, "__esModule", {
  value: true
});
exports.AnalyticsController = undefined;

var _AdaptableController = require('./AdaptableController');

var _AdaptableController2 = _interopRequireDefault(_AdaptableController);

var _AnalyticsAdapter = require('../Adapters/Analytics/AnalyticsAdapter');

function _interopRequireDefault(obj) { return obj && obj.__esModule ? obj : { default: obj }; }

class AnalyticsController extends _AdaptableController2.default {
  appOpened(req) {
    return Promise.resolve().then(() => {
      return this.adapter.appOpened(req.body, req);
    }).then(response => {
      return { response: response || {} };
    }).catch(() => {
      return { response: {} };
    });
  }

  trackEvent(req) {
    return Promise.resolve().then(() => {
      return this.adapter.trackEvent(req.params.eventName, req.body, req);
    }).then(response => {
      return { response: response || {} };
    }).catch(() => {
      return { response: {} };
    });
  }

  expectedAdapterType() {
    return _AnalyticsAdapter.AnalyticsAdapter;
  }
}

exports.AnalyticsController = AnalyticsController;
exports.default = AnalyticsController;