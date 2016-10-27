import { Parse } from 'parse/node';
import PromiseRouter from '../PromiseRouter';
import AdaptableController from './AdaptableController';
import { LoggerAdapter } from '../Adapters/Logger/LoggerAdapter';
import url from 'url';

const MILLISECONDS_IN_A_DAY = 24 * 60 * 60 * 1000;
const LOG_STRING_TRUNCATE_LENGTH = 1000;
const truncationMarker = '... (truncated)';

export const LogLevel = {
  INFO: 'info',
  ERROR: 'error'
}

export const LogOrder = {
  DESCENDING: 'desc',
  ASCENDING: 'asc'
}

export class LoggerController extends AdaptableController {

  maskSensitiveUrl(urlString) {
    const password = url.parse(urlString, true).query.password;

    if (password) {
      urlString = urlString.replace('password=' + password, 'password=********');
    }
    return urlString;
  }

  maskSensitive(argArray) {
    return argArray.map(e => {
      if (!e) {
        return e;
      }

      if (typeof e === 'string') {
        return e.replace(/(password".?:.?")[^"]*"/g, '$1********"');
      }
      // else it is an object...

      // check the url
      if (e.url) {
        e.url = this.maskSensitiveUrl(e.url);
      }

      if (e.body) {
        for (let key of Object.keys(e.body)) {
          if (key === 'password') {
            e.body[key] = '********';
            break;
          }
        }
      }

      return e;
    });
  }

  log(level, args) {
    // make the passed in arguments object an array with the spread operator
    args = this.maskSensitive([...args]);
    args = [].concat(level, args);
    this.adapter.log.apply(this.adapter, args);
  }

  info() {
    return this.log('info', arguments);
  }

  error() {
    return this.log('error', arguments);
  }

  warn() {
    return this.log('warn', arguments);
  }

  verbose() {
    return this.log('verbose', arguments);
  }

  debug() {
    return this.log('debug', arguments);
  }

  silly() {
    return this.log('silly', arguments);
  }
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

  truncateLogMessage(string) {
    if (string && string.length > LOG_STRING_TRUNCATE_LENGTH) {
      const truncated = string.substring(0, LOG_STRING_TRUNCATE_LENGTH) + truncationMarker;
      return truncated;
    }

    return string;
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
    if (typeof this.adapter.query !== 'function') {
      throw new Parse.Error(Parse.Error.PUSH_MISCONFIGURED,
        'Querying logs is not supported with this adapter');
    }
    options = LoggerController.parseOptions(options);
    return this.adapter.query(options);
  }

  expectedAdapterType() {
    return LoggerAdapter;
  }
}

export default LoggerController;
