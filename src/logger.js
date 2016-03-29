import winston from 'winston';
import fs from 'fs';
import path from 'path';
import DailyRotateFile from 'winston-daily-rotate-file';

let LOGS_FOLDER = './logs/';

if (typeof process !== 'undefined' && process.env.NODE_ENV === 'test') {
  LOGS_FOLDER = './test_logs/'
}

let currentLogsFolder = LOGS_FOLDER;
var currentTransports;

const logger = new winston.Logger();

export function configureLogger({logsFolder}) {
  logsFolder = logsFolder || currentLogsFolder;

  if (!path.isAbsolute(logsFolder)) {
    logsFolder = path.resolve(process.cwd(), logsFolder);
  }
  if (!fs.existsSync(logsFolder)) {
    fs.mkdirSync(logsFolder);
  }
  currentLogsFolder = logsFolder;

  currentTransports = [
    new (winston.transports.Console)({
      colorize: true,
      level: process.env.VERBOSE ? 'verbose': 'info'
    }),
    new (DailyRotateFile)({
      filename: 'parse-server.info',
      dirname: currentLogsFolder,
      name: 'parse-server',
      level: process.env.VERBOSE ? 'verbose': 'info'
    }),
    new (DailyRotateFile)({
      filename: 'parse-server.err',
      dirname: currentLogsFolder,
      name: 'parse-server-error',
      level: 'error'
    })
  ]

  logger.configure({
    transports: currentTransports
  })
}

configureLogger({logsFolder: LOGS_FOLDER});

export function addGroup(groupName) {
  let level = process.env.VERBOSE ? 'verbose': 'info';
  winston.loggers.add(groupName, {
    transports:  [
      new (winston.transports.Console)({
        colorize: true,
        level: level
      }),
      new (DailyRotateFile)({
        filename: groupName,
        dirname: currentLogsFolder,
        name: groupName,
        level: level
      }),
      new (DailyRotateFile)({
        filename: 'parse-server.info',
        name: 'parse-server',
        dirname: currentLogsFolder,
        level: level
      }),
      new (DailyRotateFile)({
        filename: 'parse-server.err',
        dirname: currentLogsFolder,
        name: 'parse-server-error',
        level: 'error'
      })
    ]
  });
  return winston.loggers.get(groupName);
}

export { logger };
export default winston;
