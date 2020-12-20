import winston, { format } from 'winston';
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

    try {
      if (!_.isNil(options.dirname)) {
        const parseServer = new DailyRotateFile(
          Object.assign(
            {
              filename: 'parse-server.info',
              json: true,
              format: format.combine(format.timestamp(), format.splat(), format.json()),
            },
            options
          )
        );
        parseServer.name = 'parse-server';
        transports.push(parseServer);

        const parseServerError = new DailyRotateFile(
          Object.assign(
            {
              filename: 'parse-server.err',
              json: true,
              format: format.combine(format.timestamp(), format.splat(), format.json()),
            },
            options,
            { level: 'error' }
          )
        );
        parseServerError.name = 'parse-server-error';
        transports.push(parseServerError);
      }
    } catch (e) {
      /* */
    }

    const consoleFormat = options.json ? format.json() : format.simple();
    const consoleOptions = Object.assign(
      {
        colorize: true,
        name: 'console',
        silent,
        format: consoleFormat,
      },
      options
    );

    transports.push(new winston.transports.Console(consoleOptions));
  }

  logger.configure({
    transports,
  });
}

export function configureLogger({
  logsFolder = defaults.logsFolder,
  jsonLogs = defaults.jsonLogs,
  logLevel = winston.level,
  verbose = defaults.verbose,
  silent = defaults.silent,
  maxLogFiles,
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
  options.maxFiles = maxLogFiles;

  if (jsonLogs) {
    options.json = true;
    options.stringify = true;
  }
  configureTransports(options);
}

export function addTransport(transport) {
  // we will remove the existing transport
  // before replacing it with a new one
  removeTransport(transport.name);

  logger.add(transport);
}

export function removeTransport(transport) {
  const matchingTransport = logger.transports.find(t1 => {
    return typeof transport === 'string' ? t1.name === transport : t1 === transport;
  });

  if (matchingTransport) {
    logger.remove(matchingTransport);
  }
}

export { logger };
export default logger;
