import { LoggerAdapter } from './LoggerAdapter';
import { logger, addTransport, configureLogger } from './WinstonLogger';

const MILLISECONDS_IN_A_DAY = 24 * 60 * 60 * 1000;

export class WinstonLoggerAdapter extends LoggerAdapter {
  constructor(options) {
    super();
    if (options) {
      configureLogger(options);
    }
  }

  log() {
    return logger.log.apply(logger, arguments);
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
    const from = options.from || new Date(Date.now() - 7 * MILLISECONDS_IN_A_DAY);
    const until = options.until || new Date();
    const limit = options.size || 10;
    const order = options.order || 'desc';
    const level = options.level || 'info';

    const queryOptions = {
      from,
      until,
      limit,
      order,
    };

    return new Promise((resolve, reject) => {
      logger.query(queryOptions, (err, res) => {
        if (err) {
          callback(err);
          return reject(err);
        }

        if (level === 'error') {
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

export default WinstonLoggerAdapter;
