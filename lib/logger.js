'use strict';

Object.defineProperty(exports, "__esModule", {
  value: true
});
exports.setLogger = setLogger;
exports.getLogger = getLogger;

var _defaults = require('./defaults');

var _defaults2 = _interopRequireDefault(_defaults);

var _WinstonLoggerAdapter = require('./Adapters/Logger/WinstonLoggerAdapter');

var _LoggerController = require('./Controllers/LoggerController');

function _interopRequireDefault(obj) { return obj && obj.__esModule ? obj : { default: obj }; }

function defaultLogger() {
  var adapter = new _WinstonLoggerAdapter.WinstonLoggerAdapter({
    logsFolder: _defaults2.default.logsFolder,
    jsonLogs: _defaults2.default.jsonLogs,
    verbose: _defaults2.default.verbose,
    silent: _defaults2.default.silent });
  return new _LoggerController.LoggerController(adapter);
}

var logger = defaultLogger();

function setLogger(aLogger) {
  logger = aLogger;
}

function getLogger() {
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