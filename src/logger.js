import winston from 'winston';
import fs from 'fs';
import path from 'path';
import DailyRotateFile from 'winston-daily-rotate-file';

let LOGS_FOLDER = './logs/';

if (typeof process !== 'undefined' && process.env.NODE_ENV === 'test') {
  LOGS_FOLDER = './test_logs/'
}

LOGS_FOLDER = process.env.PARSE_SERVER_LOGS_FOLDER || LOGS_FOLDER;
const JSON_LOGS = process.env.JSON_LOGS || false;

let currentLogsFolder = LOGS_FOLDER;
const additionalTransports = [];

function generateTransports(level, options = {}) {
  let transports = [];

  if (currentLogsFolder !== '/dev/null') {
    transports = [
      new (DailyRotateFile)(
        Object.assign({
          filename: 'parse-server.info',
          dirname: currentLogsFolder,
          name: 'parse-server',
          level: level
        }, options)
      ),
      new (DailyRotateFile)(
        Object.assign({
          filename: 'parse-server.err',
          dirname: currentLogsFolder,
          name: 'parse-server-error',
          level: 'error'
        }, options)
      )
    ].concat(additionalTransports);
  }
  if (!process.env.TESTING || process.env.VERBOSE) {
    transports = [
      new (winston.transports.Console)(
        Object.assign({
          colorize: true,
          level: level
        }, options)
      )
    ].concat(transports);
  }
  return transports;
}

const logger = new winston.Logger();

export function configureLogger({ logsFolder, jsonLogs, level = winston.level }) {
  winston.level = level;
  logsFolder = logsFolder || currentLogsFolder;

  if (!path.isAbsolute(logsFolder)) {
    logsFolder = path.resolve(process.cwd(), logsFolder);
  }
  try {
    fs.mkdirSync(logsFolder);
  } catch (exception) {
    // Ignore, assume the folder already exists
  }
  currentLogsFolder = logsFolder;

  const options = {};
  if (jsonLogs) {
    options.json = true;
    options.stringify = true;
  }
  const transports = generateTransports(level, options);
  logger.configure({
    transports: transports
  })
}

configureLogger({ logsFolder: LOGS_FOLDER, jsonLogs: JSON_LOGS });

export function addGroup(groupName) {
  let level = winston.level;
  let transports = generateTransports().concat(new (DailyRotateFile)({
    filename: groupName,
    dirname: currentLogsFolder,
    name: groupName,
    level: level
  }));

  winston.loggers.add(groupName, {
    transports: transports
  });
  return winston.loggers.get(groupName);
}

export function addTransport(transport) {
  const level = winston.level;
  additionalTransports.push(transport);
  const transports = generateTransports(level);
  logger.configure({
    transports: transports
  });
}

export { logger, addTransport };
export default logger;
