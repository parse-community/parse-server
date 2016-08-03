'use strict';

Object.defineProperty(exports, "__esModule", {
  value: true
});
exports.logger = undefined;
exports.configureLogger = configureLogger;
exports.addGroup = addGroup;

var _winston = require('winston');

var _winston2 = _interopRequireDefault(_winston);

var _fs = require('fs');

var _fs2 = _interopRequireDefault(_fs);

var _path = require('path');

var _path2 = _interopRequireDefault(_path);

var _winstonDailyRotateFile = require('winston-daily-rotate-file');

var _winstonDailyRotateFile2 = _interopRequireDefault(_winstonDailyRotateFile);

function _interopRequireDefault(obj) { return obj && obj.__esModule ? obj : { default: obj }; }

var LOGS_FOLDER = './logs/';

if (typeof process !== 'undefined' && process.env.NODE_ENV === 'test') {
  LOGS_FOLDER = './test_logs/';
}

LOGS_FOLDER = process.env.PARSE_SERVER_LOGS_FOLDER || LOGS_FOLDER;
var JSON_LOGS = process.env.JSON_LOGS || false;

var currentLogsFolder = LOGS_FOLDER;

function generateTransports(level) {
  var options = arguments.length <= 1 || arguments[1] === undefined ? {} : arguments[1];

  var transports = [new _winstonDailyRotateFile2.default(Object.assign({
    filename: 'parse-server.info',
    dirname: currentLogsFolder,
    name: 'parse-server',
    level: level
  }, options)), new _winstonDailyRotateFile2.default(Object.assign({
    filename: 'parse-server.err',
    dirname: currentLogsFolder,
    name: 'parse-server-error',
    level: 'error'
  }), options)];
  if (!process.env.TESTING || process.env.VERBOSE) {
    transports = [new _winston2.default.transports.Console(Object.assign({
      colorize: true,
      level: level
    }, options))].concat(transports);
  }
  return transports;
}

var logger = new _winston2.default.Logger();

function configureLogger(_ref) {
  var logsFolder = _ref.logsFolder;
  var jsonLogs = _ref.jsonLogs;
  var _ref$level = _ref.level;
  var level = _ref$level === undefined ? _winston2.default.level : _ref$level;

  _winston2.default.level = level;
  logsFolder = logsFolder || currentLogsFolder;

  if (!_path2.default.isAbsolute(logsFolder)) {
    logsFolder = _path2.default.resolve(process.cwd(), logsFolder);
  }
  try {
    _fs2.default.mkdirSync(logsFolder);
  } catch (exception) {
    // Ignore, assume the folder already exists
  }
  currentLogsFolder = logsFolder;

  var options = {};
  if (jsonLogs) {
    options.json = true;
    options.stringify = true;
  }
  var transports = generateTransports(level, options);
  logger.configure({
    transports: transports
  });
}

configureLogger({ logsFolder: LOGS_FOLDER, jsonLogs: JSON_LOGS });

function addGroup(groupName) {
  var level = _winston2.default.level;
  var transports = generateTransports().concat(new _winstonDailyRotateFile2.default({
    filename: groupName,
    dirname: currentLogsFolder,
    name: groupName,
    level: level
  }));

  _winston2.default.loggers.add(groupName, {
    transports: transports
  });
  return _winston2.default.loggers.get(groupName);
}

exports.logger = logger;
exports.default = logger;