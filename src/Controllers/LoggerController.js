import { Parse } from 'parse/node';
import AdaptableController from './AdaptableController';
import { LoggerAdapter } from '../Adapters/Logger/LoggerAdapter';
import url from 'url';

const MILLISECONDS_IN_A_DAY = 24 * 60 * 60 * 1000;
const LOG_STRING_TRUNCATE_LENGTH = 1000;
const truncationMarker = '... (truncated)';

export const LogLevel = {
  INFO: 'info',
  ERROR: 'error',
};

export const LogOrder = {
  DESCENDING: 'desc',
  ASCENDING: 'asc',
};

const logLevels = ['error', 'warn', 'info', 'debug', 'verbose', 'silly'];

export class LoggerController extends AdaptableController {
  constructor(adapter, appId, options = { logLevel: 'info' }) {
    super(adapter, appId, options);
    let level = 'info';
    if (options.verbose) {
      level = 'verbose';
    }
    if (options.logLevel) {
      level = options.logLevel;
    }
    const index = logLevels.indexOf(level); // info by default
    logLevels.forEach((level, levelIndex) => {
      if (levelIndex > index) {
        // silence the levels that are > maxIndex
        this[level] = () => {};
      }
    });
  }

  maskSensitiveUrl(urlString) {
    const urlObj = url.parse(urlString, true);
    const query = urlObj.query;
    let sanitizedQuery = '?';

    for (const key in query) {
      if (key !== 'password') {
        // normal value
        sanitizedQuery += key + '=' + query[key] + '&';
      } else {
        // password value, redact it
        sanitizedQuery += key + '=' + '********' + '&';
      }
    }

    // trim last character, ? or &
    sanitizedQuery = sanitizedQuery.slice(0, -1);

    // return original path name with sanitized params attached
    return urlObj.pathname + sanitizedQuery;
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
        // for strings
        if (typeof e.url === 'string') {
          e.url = this.maskSensitiveUrl(e.url);
        } else if (Array.isArray(e.url)) {
          // for strings in array
          e.url = e.url.map(item => {
            if (typeof item === 'string') {
              return this.maskSensitiveUrl(item);
            }

            return item;
          });
        }
      }

      if (e.body) {
        for (const key of Object.keys(e.body)) {
          if (key === 'password') {
            e.body[key] = '********';
            break;
          }
        }
      }

      if (e.params) {
        for (const key of Object.keys(e.params)) {
          if (key === 'password') {
            e.params[key] = '********';
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
    args = [].concat(
      level,
      args.map(arg => {
        if (typeof arg === 'function') {
          return arg();
        }
        return arg;
      })
    );
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

  logRequest({ method, url, headers, body }) {
    this.verbose(
      () => {
        const stringifiedBody = JSON.stringify(body, null, 2);
        return `REQUEST for [${method}] ${url}: ${stringifiedBody}`;
      },
      {
        method,
        url,
        headers,
        body,
      }
    );
  }

  logResponse({ method, url, result }) {
    this.verbose(
      () => {
        const stringifiedResponse = JSON.stringify(result, null, 2);
        return `RESPONSE from [${method}] ${url}: ${stringifiedResponse}`;
      },
      { result: result }
    );
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
    const from =
      LoggerController.validDateTime(options.from) ||
      new Date(Date.now() - 7 * MILLISECONDS_IN_A_DAY);
    const until = LoggerController.validDateTime(options.until) || new Date();
    const size = Number(options.size) || 10;
    const order = options.order || LogOrder.DESCENDING;
    const level = options.level || LogLevel.INFO;

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
  getLogs(options = {}) {
    if (!this.adapter) {
      throw new Parse.Error(Parse.Error.PUSH_MISCONFIGURED, 'Logger adapter is not available');
    }
    if (typeof this.adapter.query !== 'function') {
      throw new Parse.Error(
        Parse.Error.PUSH_MISCONFIGURED,
        'Querying logs is not supported with this adapter'
      );
    }
    options = LoggerController.parseOptions(options);
    return this.adapter.query(options);
  }

  expectedAdapterType() {
    return LoggerAdapter;
  }
}

export default LoggerController;
