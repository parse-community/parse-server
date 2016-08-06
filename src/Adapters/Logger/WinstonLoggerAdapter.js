import { LoggerAdapter } from './LoggerAdapter';
import { logger, addTransport, configureLogger } from './WinstonLogger';

const MILLISECONDS_IN_A_DAY = 24 * 60 * 60 * 1000;

// returns Date object rounded to nearest day
let _getNearestDay = (date) => {
  return new Date(date.getFullYear(), date.getMonth(), date.getDate());
}

export class WinstonLoggerAdapter extends LoggerAdapter {
  constructor(options) {
    super();
    if (options) {
      configureLogger(options);
    }
  }

  info() {
    return logger.info.apply(undefined, arguments);
  }

  error() {
    return logger.error.apply(undefined, arguments);
  }

  warn() {
    return logger.warn.apply(undefined, arguments);
  }

  verbose() {
    return logger.verbose.apply(undefined, arguments);
  }

  log() {
    return logger.log.apply(undefined, arguments);
  }

  addTransport(transport) {
    // Note that this is calling addTransport
    // from logger.  See import - confusing.
    // but this is not recursive.
    addTransport(transport);
  }

  // custom query as winston is currently limited
  query(options, callback = () => {}) {
    if (!options) {
      options = {};
    }
    // defaults to 7 days prior
    let from = options.from || new Date(Date.now() - (7 * MILLISECONDS_IN_A_DAY));
    let until = options.until || new Date();
    let limit = options.size || 10;
    let order = options.order || 'desc';
    let level = options.level || 'info';
    let roundedUntil = _getNearestDay(until);
    let roundedFrom = _getNearestDay(from);

    var options = {
      from,
      until,
      limit,
      order
    };

    return new Promise((resolve, reject) => {
      logger.query(options, (err, res) => {
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
      })
    });
  }
}

export default WinstonLoggerAdapter;
