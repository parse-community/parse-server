import AdaptableController from './AdaptableController';
import { AnalyticsAdapter } from '../Adapters/Analytics/AnalyticsAdapter';

const AppOpenedEventName = 'AppOpened';

export class AnalyticsController extends AdaptableController {
  appOpened(req) {
    return Promise.resolve().then(() => {
      return this.adapter.appOpened(req.body, req);
    }).then((response) => {
      return { response: response || {} };
    }).catch((err) => {
      return { response: {} };
    });
  }

  trackEvent(req) {
    const eventName = req.params.eventName;
    if (eventName === AppOpenedEventName) {
      return this.appOpened(req);
    }
    return Promise.resolve().then(() => {
      return this.adapter.trackEvent(eventName, req.body, req);
    }).then((response) => {
      return { response: response || {} };
    }).catch((err) => {
      return { response: {} };
    });
  }

  expectedAdapterType() {
    return AnalyticsAdapter;
  }
}

export default AnalyticsController;
