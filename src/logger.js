'use strict';
const defaults = require('./defaults');
const { WinstonLoggerAdapter } = require('./Adapters/Logger/WinstonLoggerAdapter');
const { LoggerController }     = require('./Controllers/LoggerController');

function defaultLogger() {
  const options = {
    logsFolder: defaults.logsFolder,
    jsonLogs: defaults.jsonLogs,
    verbose: defaults.verbose,
    silent: defaults.silent };
  const adapter = new WinstonLoggerAdapter(options);
  return new LoggerController(adapter, null, options);
}

let logger = defaultLogger();

function setLogger(aLogger) {
  logger = aLogger;
}

function getLogger() {
  return logger;
}

// Object.defineProperty(module, 'exports', {
//   get: getLogger
// });

// for: `import logger from './logger'`
// Object.defineProperty(module.exports, 'default', {
//   get: getLogger
// });
module.exports = {
  setLogger,
  getLogger,
};
// // for: `import { logger } from './logger'`
Object.defineProperty(module.exports, 'logger', {
  get: getLogger
});

Object.defineProperty(exports, 'logger', {
  get: getLogger
});
