import winston from 'winston';
import fs from 'fs';
import path from 'path';
import DailyRotateFile from 'winston-daily-rotate-file';

let LOGS_FOLDER = './logs/';

if (typeof process !== 'undefined' && process.env.NODE_ENV === 'test') {
  LOGS_FOLDER = './test_logs/'
}

LOGS_FOLDER = process.env.PARSE_SERVER_LOGS_FOLDER || LOGS_FOLDER;

let currentLogsFolder = LOGS_FOLDER;

function generateTransports(level) {
  let transports = [
    new (DailyRotateFile)({
      filename: 'parse-server.info',
      dirname: currentLogsFolder,
      name: 'parse-server',
      level: level
    }),
    new (DailyRotateFile)({
      filename: 'parse-server.err',
      dirname: currentLogsFolder,
      name: 'parse-server-error',
      level: 'error'
    })
  ]
  if (!process.env.TESTING || process.env.VERBOSE) {
    transports = [new (winston.transports.Console)({
      colorize: true,
      level:level
    })].concat(transports);
  }
  return transports;
}

const logger = new winston.Logger();

export function configureLogger({logsFolder, level = winston.level}) {
  winston.level = level;
  logsFolder = logsFolder || currentLogsFolder;

  if (!path.isAbsolute(logsFolder)) {
    logsFolder = path.resolve(process.cwd(), logsFolder);
  }
  if (!fs.existsSync(logsFolder)) {
    fs.mkdirSync(logsFolder);
  }
  currentLogsFolder = logsFolder;

  logger.configure({
    transports:  generateTransports(level)
  })
}

configureLogger({logsFolder: LOGS_FOLDER});

export function addGroup(groupName) {
  let level = winston.level;
  let transports =  generateTransports().concat(new (DailyRotateFile)({
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

export { logger };
export default logger;
