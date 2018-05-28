'use strict';

Object.defineProperty(exports, "__esModule", {
  value: true
});
exports.logger = undefined;
exports.configureLogger = configureLogger;
exports.addTransport = addTransport;
exports.removeTransport = removeTransport;

var _winston = require('winston');

var _winston2 = _interopRequireDefault(_winston);

var _fs = require('fs');

var _fs2 = _interopRequireDefault(_fs);

var _path = require('path');

var _path2 = _interopRequireDefault(_path);

var _winstonDailyRotateFile = require('winston-daily-rotate-file');

var _winstonDailyRotateFile2 = _interopRequireDefault(_winstonDailyRotateFile);

var _lodash = require('lodash');

var _lodash2 = _interopRequireDefault(_lodash);

var _defaults = require('../../defaults');

var _defaults2 = _interopRequireDefault(_defaults);

function _interopRequireDefault(obj) { return obj && obj.__esModule ? obj : { default: obj }; }

const logger = new _winston2.default.Logger();
const additionalTransports = [];

function updateTransports(options) {
  const transports = Object.assign({}, logger.transports);
  if (options) {
    const silent = options.silent;
    delete options.silent;
    if (_lodash2.default.isNull(options.dirname)) {
      delete transports['parse-server'];
      delete transports['parse-server-error'];
    } else if (!_lodash2.default.isUndefined(options.dirname)) {
      transports['parse-server'] = new _winstonDailyRotateFile2.default(Object.assign({}, {
        filename: 'parse-server.info',
        name: 'parse-server'
      }, options, { timestamp: true }));
      transports['parse-server-error'] = new _winstonDailyRotateFile2.default(Object.assign({}, {
        filename: 'parse-server.err',
        name: 'parse-server-error'
      }, options, { level: 'error', timestamp: true }));
    }

    transports.console = new _winston2.default.transports.Console(Object.assign({
      colorize: true,
      name: 'console',
      silent
    }, options));
  }
  // Mount the additional transports
  additionalTransports.forEach(transport => {
    transports[transport.name] = transport;
  });
  logger.configure({
    transports: _lodash2.default.values(transports)
  });
}

function configureLogger({
  logsFolder = _defaults2.default.logsFolder,
  jsonLogs = _defaults2.default.jsonLogs,
  logLevel = _winston2.default.level,
  verbose = _defaults2.default.verbose,
  silent = _defaults2.default.silent } = {}) {

  if (verbose) {
    logLevel = 'verbose';
  }

  _winston2.default.level = logLevel;
  const options = {};

  if (logsFolder) {
    if (!_path2.default.isAbsolute(logsFolder)) {
      logsFolder = _path2.default.resolve(process.cwd(), logsFolder);
    }
    try {
      _fs2.default.mkdirSync(logsFolder);
    } catch (e) {/* */}
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

function addTransport(transport) {
  additionalTransports.push(transport);
  updateTransports();
}

function removeTransport(transport) {
  const transportName = typeof transport == 'string' ? transport : transport.name;
  const transports = Object.assign({}, logger.transports);
  delete transports[transportName];
  logger.configure({
    transports: _lodash2.default.values(transports)
  });
  _lodash2.default.remove(additionalTransports, transport => {
    return transport.name === transportName;
  });
}

exports.logger = logger;
exports.default = logger;