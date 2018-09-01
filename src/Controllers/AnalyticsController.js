import AdaptableController from './AdaptableController';
import { AnalyticsAdapter } from '../Adapters/Analytics/AnalyticsAdapter';

export class AnalyticsController extends AdaptableController {
  appOpened(req) {
    return Promise.resolve()
      .then(() => {
        return this.adapter.appOpened(req.body, req);
      })
      .then(response => {
        return { response: response || {} };
      })
      .catch(() => {
        return { response: {} };
      });
  }

  trackEvent(req) {
    return Promise.resolve()
      .then(() => {
        return this.adapter.trackEvent(req.params.eventName, req.body, req);
      })
      .then(response => {
        return { response: response || {} };
      })
      .catch(() => {
        return { response: {} };
      });
  }

  expectedAdapterType() {
    return AnalyticsAdapter;
  }
}

export default AnalyticsController;
