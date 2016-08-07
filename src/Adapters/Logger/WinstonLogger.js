import winston from 'winston';
import fs from 'fs';
import path from 'path';
import DailyRotateFile from 'winston-daily-rotate-file';
import _ from 'lodash';
import defaults  from '../../logger';

const logger = new winston.Logger();
const additionalTransports = [];

function updateTransports(options) {
  let transports = Object.assign({}, logger.transports);
  if (options) {
    let silent = options.silent;
    delete options.silent;
    if (_.isNull(options.dirname)) {
      delete transports['parse-server'];
      delete transports['parse-server-error'];
    } else if (!_.isUndefined(options.dirname)) {
      transports['parse-server'] = new (DailyRotateFile)(
        Object.assign({
          filename: 'parse-server.info',
          name: 'parse-server',
        }, options));
      transports['parse-server-error'] = new (DailyRotateFile)(
        Object.assign({
          filename: 'parse-server.err',
          name: 'parse-server-error',
          level: 'error'
        }, options));
    }

    transports.console = new (winston.transports.Console)(
      Object.assign({
        colorize: true,
        name: 'console',
        silent
      }, options));
  }
  // Mount the additional transports
  additionalTransports.forEach((transport) => {
    transports[transport.name] = transport;
  });
  logger.configure({
    transports: _.values(transports)
  });
}

export function configureLogger({
  logsFolder = defaults.logsFolder,
  jsonLogs = defaults.jsonLogs,
  logLevel = winston.level,
  verbose = defaults.verbose,
  silent = defaults.silent } = {}) {

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
    } catch (exception) {}
  }
  options.dirname = logsFolder;
  options.level = logLevel;
  options.silent = silent;

  if (jsonLogs) {
    options.json = true;
    options.stringify = true;
  }
  updateTransports(options);
}

export function addTransport(transport) {
  additionalTransports.push(transport);
  updateTransports();
}

export function removeTransport(transport) {
  let transportName = typeof transport == 'string' ? transport : transport.name;
  let transports = Object.assign({}, logger.transports);
  delete transports[transportName];
  logger.configure({
    transports: _.values(transports)
  });
  _.remove(additionalTransports, (transport) => {
    return transport.name === transportName;
  });
}

export { logger, addTransport, configureLogger, removeTransport };
export default logger;
