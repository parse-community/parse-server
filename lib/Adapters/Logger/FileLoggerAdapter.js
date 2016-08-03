'use strict';

Object.defineProperty(exports, "__esModule", {
  value: true
});
exports.FileLoggerAdapter = undefined;

var _createClass = function () { function defineProperties(target, props) { for (var i = 0; i < props.length; i++) { var descriptor = props[i]; descriptor.enumerable = descriptor.enumerable || false; descriptor.configurable = true; if ("value" in descriptor) descriptor.writable = true; Object.defineProperty(target, descriptor.key, descriptor); } } return function (Constructor, protoProps, staticProps) { if (protoProps) defineProperties(Constructor.prototype, protoProps); if (staticProps) defineProperties(Constructor, staticProps); return Constructor; }; }();

var _LoggerAdapter2 = require('./LoggerAdapter');

var _winston = require('winston');

var _winston2 = _interopRequireDefault(_winston);

var _fs = require('fs');

var _fs2 = _interopRequireDefault(_fs);

var _node = require('parse/node');

var _logger = require('../../logger');

function _interopRequireDefault(obj) { return obj && obj.__esModule ? obj : { default: obj }; }

function _classCallCheck(instance, Constructor) { if (!(instance instanceof Constructor)) { throw new TypeError("Cannot call a class as a function"); } }

function _possibleConstructorReturn(self, call) { if (!self) { throw new ReferenceError("this hasn't been initialised - super() hasn't been called"); } return call && (typeof call === "object" || typeof call === "function") ? call : self; }

function _inherits(subClass, superClass) { if (typeof superClass !== "function" && superClass !== null) { throw new TypeError("Super expression must either be null or a function, not " + typeof superClass); } subClass.prototype = Object.create(superClass && superClass.prototype, { constructor: { value: subClass, enumerable: false, writable: true, configurable: true } }); if (superClass) Object.setPrototypeOf ? Object.setPrototypeOf(subClass, superClass) : subClass.__proto__ = superClass; } // Logger
//
// Wrapper around Winston logging library with custom query
//
// expected log entry to be in the shape of:
// {"level":"info","message":"Your Message","timestamp":"2016-02-04T05:59:27.412Z"}
//


var MILLISECONDS_IN_A_DAY = 24 * 60 * 60 * 1000;
var CACHE_TIME = 1000 * 60;

var LOGS_FOLDER = './logs/';

if (typeof process !== 'undefined' && process.env.NODE_ENV === 'test') {
  LOGS_FOLDER = './test_logs/';
}

var currentDate = new Date();

var simpleCache = {
  timestamp: null,
  from: null,
  until: null,
  order: null,
  data: [],
  level: 'info'
};

// returns Date object rounded to nearest day
var _getNearestDay = function _getNearestDay(date) {
  return new Date(date.getFullYear(), date.getMonth(), date.getDate());
};

// returns Date object of previous day
var _getPrevDay = function _getPrevDay(date) {
  return new Date(date - MILLISECONDS_IN_A_DAY);
};

// returns the iso formatted file name
var _getFileName = function _getFileName() {
  return _getNearestDay(currentDate).toISOString();
};

// check for valid cache when both from and util match.
// cache valid for up to 1 minute
var _hasValidCache = function _hasValidCache(from, until, level) {
  if (String(from) === String(simpleCache.from) && String(until) === String(simpleCache.until) && new Date() - simpleCache.timestamp < CACHE_TIME && level === simpleCache.level) {
    return true;
  }
  return false;
};

// check that log entry has valid time stamp based on query
var _isValidLogEntry = function _isValidLogEntry(from, until, entry) {
  var _entry = JSON.parse(entry),
      timestamp = new Date(_entry.timestamp);
  return timestamp >= from && timestamp <= until ? true : false;
};

var FileLoggerAdapter = exports.FileLoggerAdapter = function (_LoggerAdapter) {
  _inherits(FileLoggerAdapter, _LoggerAdapter);

  function FileLoggerAdapter() {
    _classCallCheck(this, FileLoggerAdapter);

    return _possibleConstructorReturn(this, Object.getPrototypeOf(FileLoggerAdapter).apply(this, arguments));
  }

  _createClass(FileLoggerAdapter, [{
    key: 'info',
    value: function info() {
      return _logger.logger.info.apply(undefined, arguments);
    }
  }, {
    key: 'error',
    value: function error() {
      return _logger.logger.error.apply(undefined, arguments);
    }

    // custom query as winston is currently limited

  }, {
    key: 'query',
    value: function query(options) {
      var callback = arguments.length <= 1 || arguments[1] === undefined ? function () {} : arguments[1];

      if (!options) {
        options = {};
      }
      // defaults to 7 days prior
      var from = options.from || new Date(Date.now() - 7 * MILLISECONDS_IN_A_DAY);
      var until = options.until || new Date();
      var limit = options.size || 10;
      var order = options.order || 'desc';
      var level = options.level || 'info';
      var roundedUntil = _getNearestDay(until);
      var roundedFrom = _getNearestDay(from);

      var options = {
        from: from,
        until: until,
        limit: limit,
        order: order
      };

      return new Promise(function (resolve, reject) {
        _logger.logger.query(options, function (err, res) {
          if (err) {
            callback(err);
            return reject(err);
          }
          if (level == 'error') {
            callback(res['parse-server-error']);
            resolve(res['parse-server-error']);
          } else {
            callback(res['parse-server']);
            resolve(res['parse-server']);
          }
        });
      });
    }
  }]);

  return FileLoggerAdapter;
}(_LoggerAdapter2.LoggerAdapter);

exports.default = FileLoggerAdapter;