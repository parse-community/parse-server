'use strict';
import defaults from './defaults';
import { WinstonLoggerAdapter } from './Adapters/Logger/WinstonLoggerAdapter';
import { LoggerController }     from './Controllers/LoggerController';

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
