// AnalyticsRouter.js

var Parse = require('parse/node').Parse;

import PromiseRouter from '../PromiseRouter';

// Returns a promise that resolves to an empty object response
function ignoreAndSucceed(req) {
  return Promise.resolve({
    response: {}
  });
}


export class AnalyticsRouter extends PromiseRouter {
  mountRoutes() {
    this.route('POST','/events/AppOpened', ignoreAndSucceed);
    this.route('POST','/events/:eventName', ignoreAndSucceed);
  }
}
