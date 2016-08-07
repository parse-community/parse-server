'use strict';
let logger;

let logsFolder = (() => {
  let folder = './logs/';
  if (typeof process !== 'undefined' && process.env.NODE_ENV === 'test') {
    folder = './test_logs/'
  }
  folder = process.env.PARSE_SERVER_LOGS_FOLDER || folder;
  return folder;
})();

let { verbose, level } = (() => {
  let verbose = process.env.VERBOSE ? true : false;
  return { verbose, level: verbose ? 'verbose' : undefined }
})();

export const defaults = {
  jsonLogs: process.env.JSON_LOGS || false,
  logsFolder,
  verbose,
  level,
  silent: false
}

export function setLogger(aLogger) {
  logger = aLogger;
}

export function getLogger() {
  return logger;
}

// for: `import logger from './logger'`
Object.defineProperty(module.exports, 'default', {
  get: getLogger
});

// for: `import { logger } from './logger'`
Object.defineProperty(module.exports, 'logger', {
  get: getLogger
});
