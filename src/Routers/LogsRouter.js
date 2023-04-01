import { Parse } from 'parse/node';
import PromiseRouter from '../PromiseRouter';
import * as middleware from '../middlewares';

export class LogsRouter extends PromiseRouter {
  mountRoutes() {
    this.route(
      'GET',
      '/scriptlog',
      middleware.promiseEnforceMasterKeyAccess,
      this.validateRequest,
      req => {
        return this.handleGET(req);
      }
    );
  }

  validateRequest(req) {
    if (!req.config || !req.config.loggerController) {
      throw new Parse.Error(Parse.Error.PUSH_MISCONFIGURED, 'Logger adapter is not available');
    }
  }

  // Returns a promise for a {response} object.
  // query params:
  // level (optional) Level of logging you want to query for (info || error)
  // from (optional) Start time for the search. Defaults to 1 week ago.
  // until (optional) End time for the search. Defaults to current time.
  // order (optional) Direction of results returned, either “asc” or “desc”. Defaults to “desc”.
  // size (optional) Number of rows returned by search. Defaults to 10
  // n same as size, overrides size if set
  handleGET(req) {
    const from = req.query.from;
    const until = req.query.until;
    let size = req.query.size;
    if (req.query.n) {
      size = req.query.n;
    }

    const order = req.query.order;
    const level = req.query.level;
    const options = {
      from,
      until,
      size,
      order,
      level,
    };

    return req.config.loggerController.getLogs(options).then(result => {
      return Promise.resolve({
        response: result,
      });
    });
  }
}

export default LogsRouter;
