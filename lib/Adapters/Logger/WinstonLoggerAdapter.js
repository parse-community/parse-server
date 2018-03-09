'use strict';

Object.defineProperty(exports, "__esModule", {
  value: true
});
exports.WinstonLoggerAdapter = undefined;

var _LoggerAdapter = require('./LoggerAdapter');

var _WinstonLogger = require('./WinstonLogger');

const MILLISECONDS_IN_A_DAY = 24 * 60 * 60 * 1000;

class WinstonLoggerAdapter extends _LoggerAdapter.LoggerAdapter {
  constructor(options) {
    super();
    if (options) {
      (0, _WinstonLogger.configureLogger)(options);
    }
  }

  log() {
    return _WinstonLogger.logger.log.apply(_WinstonLogger.logger, arguments);
  }

  addTransport(transport) {
    // Note that this is calling addTransport
    // from logger.  See import - confusing.
    // but this is not recursive.
    (0, _WinstonLogger.addTransport)(transport);
  }

  // custom query as winston is currently limited
  query(options, callback = () => {}) {
    if (!options) {
      options = {};
    }
    // defaults to 7 days prior
    const from = options.from || new Date(Date.now() - 7 * MILLISECONDS_IN_A_DAY);
    const until = options.until || new Date();
    const limit = options.size || 10;
    const order = options.order || 'desc';
    const level = options.level || 'info';

    const queryOptions = {
      from,
      until,
      limit,
      order
    };

    return new Promise((resolve, reject) => {
      _WinstonLogger.logger.query(queryOptions, (err, res) => {
        if (err) {
          callback(err);
          return reject(err);
        }
        if (level == 'error') {
          callback(res['parse-server-error']);
          resolve(res['parse-server-error']);
        } else {
          callback(res['parse-server']);
          resolve(res['parse-server']);
        }
      });
    });
  }
}

exports.WinstonLoggerAdapter = WinstonLoggerAdapter;
exports.default = WinstonLoggerAdapter;