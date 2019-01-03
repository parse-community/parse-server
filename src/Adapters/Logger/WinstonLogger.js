import winston from 'winston';
import fs from 'fs';
import path from 'path';
import DailyRotateFile from 'winston-daily-rotate-file';
import _ from 'lodash';
import defaults from '../../defaults';

const logger = winston.createLogger();

function configureTransports(options) {
  const transports = [];
  if (options) {
    const silent = options.silent;
    delete options.silent;
    if (!_.isUndefined(options.dirname) && !_.isNull(options.dirname)) {
      transports.push(
        new DailyRotateFile(
          Object.assign(
            {
              filename: 'parse-server.info',
            },
            options,
            { timestamp: true }
          )
        )
      );
      transports.push(
        new DailyRotateFile(
          Object.assign(
            {
              filename: 'parse-server.err',
            },
            options,
            { level: 'error', timestamp: true }
          )
        )
      );
    }

    transports.push(
      new winston.transports.Console(
        Object.assign(
          {
            colorize: true,
            silent,
          },
          options
        )
      )
    );
  }

  logger.configure({
    transports: transports,
  });
}

export function configureLogger({
  logsFolder = defaults.logsFolder,
  jsonLogs = defaults.jsonLogs,
  logLevel = winston.level,
  verbose = defaults.verbose,
  silent = defaults.silent,
} = {}) {
  if (verbose) {
    logLevel = 'verbose';
  }

  winston.level = logLevel;
  const options = {};

  if (logsFolder) {
    if (!path.isAbsolute(logsFolder)) {
      logsFolder = path.resolve(process.cwd(), logsFolder);
    }
    try {
      fs.mkdirSync(logsFolder);
    } catch (e) {
      /* */
    }
  }
  options.dirname = logsFolder;
  options.level = logLevel;
  options.silent = silent;

  if (jsonLogs) {
    options.json = true;
    options.stringify = true;
  }
  configureTransports(options);
}

export function addTransport(transport) {
  logger.add(transport);
}

export function removeTransport(transport) {
  const matchingTransport = logger.transports.find(t1 => {
    return typeof transport === 'string'
      ? t1.name === transport
      : t1 === transport;
  });

  if (matchingTransport) {
    logger.remove(matchingTransport);
  }
}

export { logger };
export default logger;
