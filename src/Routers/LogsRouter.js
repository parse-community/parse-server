import { Parse } from 'parse/node';
import PromiseRouter from '../PromiseRouter';

// only allow request with master key
let enforceSecurity = (auth) => {
  if (!auth || !auth.isMaster) {
    throw new Parse.Error(
      Parse.Error.OPERATION_FORBIDDEN,
      'Clients aren\'t allowed to perform the ' +
      'get' + ' operation on logs.'
    );
  }
}

export class LogsRouter extends PromiseRouter {
  
  mountRoutes() {
    this.route('GET','/logs', (req) => {
      return this.handleGET(req);
    });
  }

  // Returns a promise for a {response} object.
  // query params:
  // level (optional) Level of logging you want to query for (info || error)
  // from (optional) Start time for the search. Defaults to 1 week ago.
  // until (optional) End time for the search. Defaults to current time.
  // order (optional) Direction of results returned, either “asc” or “desc”. Defaults to “desc”.
  // size (optional) Number of rows returned by search. Defaults to 10
  handleGET(req) {
    if (!req.config || !req.config.loggerController) {
      throw new Parse.Error(Parse.Error.PUSH_MISCONFIGURED,
        'Logger adapter is not availabe');
    }

    let promise = new Parse.Promise();
    let from = req.query.from;
    let until = req.query.until;
    let size = req.query.size;
    let order = req.query.order
    let level = req.query.level;
    enforceSecurity(req.auth);
    
    const options = {
      from,
      until,
      size,
      order,
      level,
    }
    
    return req.config.loggerController.getLogs(options).then((result) => {
      return Promise.resolve({
        response: result
      });
    })
  }
}

export default LogsRouter;
