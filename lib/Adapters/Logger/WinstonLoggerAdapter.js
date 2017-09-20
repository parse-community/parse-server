'use strict';

Object.defineProperty(exports, "__esModule", {
  value: true
});
exports.WinstonLoggerAdapter = undefined;

var _createClass = function () { function defineProperties(target, props) { for (var i = 0; i < props.length; i++) { var descriptor = props[i]; descriptor.enumerable = descriptor.enumerable || false; descriptor.configurable = true; if ("value" in descriptor) descriptor.writable = true; Object.defineProperty(target, descriptor.key, descriptor); } } return function (Constructor, protoProps, staticProps) { if (protoProps) defineProperties(Constructor.prototype, protoProps); if (staticProps) defineProperties(Constructor, staticProps); return Constructor; }; }();

var _LoggerAdapter2 = require('./LoggerAdapter');

var _WinstonLogger = require('./WinstonLogger');

function _classCallCheck(instance, Constructor) { if (!(instance instanceof Constructor)) { throw new TypeError("Cannot call a class as a function"); } }

function _possibleConstructorReturn(self, call) { if (!self) { throw new ReferenceError("this hasn't been initialised - super() hasn't been called"); } return call && (typeof call === "object" || typeof call === "function") ? call : self; }

function _inherits(subClass, superClass) { if (typeof superClass !== "function" && superClass !== null) { throw new TypeError("Super expression must either be null or a function, not " + typeof superClass); } subClass.prototype = Object.create(superClass && superClass.prototype, { constructor: { value: subClass, enumerable: false, writable: true, configurable: true } }); if (superClass) Object.setPrototypeOf ? Object.setPrototypeOf(subClass, superClass) : subClass.__proto__ = superClass; }

var MILLISECONDS_IN_A_DAY = 24 * 60 * 60 * 1000;

// returns Date object rounded to nearest day
var _getNearestDay = function _getNearestDay(date) {
  return new Date(date.getFullYear(), date.getMonth(), date.getDate());
};

var WinstonLoggerAdapter = exports.WinstonLoggerAdapter = function (_LoggerAdapter) {
  _inherits(WinstonLoggerAdapter, _LoggerAdapter);

  function WinstonLoggerAdapter(options) {
    _classCallCheck(this, WinstonLoggerAdapter);

    var _this = _possibleConstructorReturn(this, (WinstonLoggerAdapter.__proto__ || Object.getPrototypeOf(WinstonLoggerAdapter)).call(this));

    if (options) {
      (0, _WinstonLogger.configureLogger)(options);
    }
    return _this;
  }

  _createClass(WinstonLoggerAdapter, [{
    key: 'log',
    value: function log() {
      return _WinstonLogger.logger.log.apply(_WinstonLogger.logger, arguments);
    }
  }, {
    key: 'addTransport',
    value: function addTransport(transport) {
      // Note that this is calling addTransport
      // from logger.  See import - confusing.
      // but this is not recursive.
      (0, _WinstonLogger.addTransport)(transport);
    }

    // custom query as winston is currently limited

  }, {
    key: 'query',
    value: function query(options) {
      var callback = arguments.length > 1 && arguments[1] !== undefined ? arguments[1] : function () {};

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
        _WinstonLogger.logger.query(options, function (err, res) {
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

  return WinstonLoggerAdapter;
}(_LoggerAdapter2.LoggerAdapter);

exports.default = WinstonLoggerAdapter;