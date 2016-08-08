'use strict';
let logger;

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
