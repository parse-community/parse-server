// AnalyticsRouter.js
import PromiseRouter from '../PromiseRouter';

function trackEvent(req) {
  const analyticsController = req.config.analyticsController;
  return analyticsController.trackEvent(req);
}


export class AnalyticsRouter extends PromiseRouter {
  mountRoutes() {
    this.route('POST','/events/:eventName', trackEvent);
  }
}
