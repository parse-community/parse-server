import { Parse } from 'parse/node';
import PromiseRouter from '../PromiseRouter';
import AdaptableController from './AdaptableController';
import { LoggerAdapter } from '../Adapters/Logger/LoggerAdapter';

const MILLISECONDS_IN_A_DAY = 24 * 60 * 60 * 1000;

export const LogLevel = {
  INFO: 'info',
  ERROR: 'error'
}

export const LogOrder = {
  DESCENDING: 'desc',
  ASCENDING: 'asc'
}

export class LoggerController extends AdaptableController {

  // check that date input is valid
  static validDateTime(date) {
    if (!date) {
      return null;
    }
    date = new Date(date);

    if (!isNaN(date.getTime())) {
      return date;
    }

    return null;
  }

  static parseOptions(options = {}) {
    let from = LoggerController.validDateTime(options.from) ||
      new Date(Date.now() - 7 * MILLISECONDS_IN_A_DAY);
    let until = LoggerController.validDateTime(options.until) || new Date();
    let size = Number(options.size) || 10;
    let order = options.order || LogOrder.DESCENDING;
    let level = options.level || LogLevel.INFO;

    return {
      from,
      until,
      size,
      order,
      level,
    };
  }

  // Returns a promise for a {response} object.
  // query params:
  // level (optional) Level of logging you want to query for (info || error)
  // from (optional) Start time for the search. Defaults to 1 week ago.
  // until (optional) End time for the search. Defaults to current time.
  // order (optional) Direction of results returned, either “asc” or “desc”. Defaults to “desc”.
  // size (optional) Number of rows returned by search. Defaults to 10
  getLogs(options= {}) {
    if (!this.adapter) {
      throw new Parse.Error(Parse.Error.PUSH_MISCONFIGURED,
        'Logger adapter is not availabe');
    }
    options = LoggerController.parseOptions(options);
    return this.adapter.query(options);
  }

  expectedAdapterType() {
    return LoggerAdapter;
  }
}

export default LoggerController;
