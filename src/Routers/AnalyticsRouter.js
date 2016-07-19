// AnalyticsRouter.js
import PromiseRouter from '../PromiseRouter';

function handlePost(req) {
  const analyticsController = req.config.analyticsController;
  return analyticsController.sendToAdapter(req);
}


export class AnalyticsRouter extends PromiseRouter {
  mountRoutes() {
    this.route('POST','/events/AppOpened', handlePost);
    this.route('POST','/events/:eventName', handlePost);
  }
}
