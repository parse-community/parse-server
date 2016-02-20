import { Parse } from 'parse/node';
import PromiseRouter from '../PromiseRouter';
import rest from '../rest';

const Promise = Parse.Promise;
const INFO = 'info';
const ERROR = 'error';
const MILLISECONDS_IN_A_DAY = 24 * 60 * 60 * 1000;

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

// check that date input is valid
let isValidDateTime = (date) => {
  if (!date || isNaN(Number(date))) {
    return false;
  }
}

export class LoggerController {

  constructor(loggerAdapter) {
    this._loggerAdapter = loggerAdapter;
  }

  // Returns a promise for a {response} object.
  // query params:
  // level (optional) Level of logging you want to query for (info || error)
  // from (optional) Start time for the search. Defaults to 1 week ago.
  // until (optional) End time for the search. Defaults to current time.
  // order (optional) Direction of results returned, either “asc” or “desc”. Defaults to “desc”.
  // size (optional) Number of rows returned by search. Defaults to 10
  handleGET(req) {
    if (!this._loggerAdapter) {
      throw new Parse.Error(Parse.Error.PUSH_MISCONFIGURED,
        'Logger adapter is not availabe');
    }

    let promise = new Parse.Promise();
    let from = (isValidDateTime(req.query.from) && new Date(req.query.from)) ||
      new Date(Date.now() - 7 * MILLISECONDS_IN_A_DAY);
    let until = (isValidDateTime(req.query.until) && new Date(req.query.until)) || new Date();
    let size = Number(req.query.size) || 10;
    let order = req.query.order || 'desc';
    let level = req.query.level || INFO;
    enforceSecurity(req.auth);
    this._loggerAdapter.query({
      from,
      until,
      size,
      order,
      level,
    }, (result) => {
      promise.resolve({
        response: result
      });
    });
    return promise;
  }

  getExpressRouter() {
    let router = new PromiseRouter();
    router.route('GET','/logs', (req) => {
      return this.handleGET(req);
    });
    return router;
  }
}

export default LoggerController;
