'use strict';

Object.defineProperty(exports, "__esModule", {
  value: true
});
exports.LoggerController = exports.LogOrder = exports.LogLevel = undefined;

var _createClass = function () { function defineProperties(target, props) { for (var i = 0; i < props.length; i++) { var descriptor = props[i]; descriptor.enumerable = descriptor.enumerable || false; descriptor.configurable = true; if ("value" in descriptor) descriptor.writable = true; Object.defineProperty(target, descriptor.key, descriptor); } } return function (Constructor, protoProps, staticProps) { if (protoProps) defineProperties(Constructor.prototype, protoProps); if (staticProps) defineProperties(Constructor, staticProps); return Constructor; }; }();

var _node = require('parse/node');

var _AdaptableController2 = require('./AdaptableController');

var _AdaptableController3 = _interopRequireDefault(_AdaptableController2);

var _LoggerAdapter = require('../Adapters/Logger/LoggerAdapter');

var _url = require('url');

var _url2 = _interopRequireDefault(_url);

function _interopRequireDefault(obj) { return obj && obj.__esModule ? obj : { default: obj }; }

function _toConsumableArray(arr) { if (Array.isArray(arr)) { for (var i = 0, arr2 = Array(arr.length); i < arr.length; i++) { arr2[i] = arr[i]; } return arr2; } else { return Array.from(arr); } }

function _classCallCheck(instance, Constructor) { if (!(instance instanceof Constructor)) { throw new TypeError("Cannot call a class as a function"); } }

function _possibleConstructorReturn(self, call) { if (!self) { throw new ReferenceError("this hasn't been initialised - super() hasn't been called"); } return call && (typeof call === "object" || typeof call === "function") ? call : self; }

function _inherits(subClass, superClass) { if (typeof superClass !== "function" && superClass !== null) { throw new TypeError("Super expression must either be null or a function, not " + typeof superClass); } subClass.prototype = Object.create(superClass && superClass.prototype, { constructor: { value: subClass, enumerable: false, writable: true, configurable: true } }); if (superClass) Object.setPrototypeOf ? Object.setPrototypeOf(subClass, superClass) : subClass.__proto__ = superClass; }

var MILLISECONDS_IN_A_DAY = 24 * 60 * 60 * 1000;
var LOG_STRING_TRUNCATE_LENGTH = 1000;
var truncationMarker = '... (truncated)';

var LogLevel = exports.LogLevel = {
  INFO: 'info',
  ERROR: 'error'
};

var LogOrder = exports.LogOrder = {
  DESCENDING: 'desc',
  ASCENDING: 'asc'
};

var LoggerController = exports.LoggerController = function (_AdaptableController) {
  _inherits(LoggerController, _AdaptableController);

  function LoggerController() {
    _classCallCheck(this, LoggerController);

    return _possibleConstructorReturn(this, (LoggerController.__proto__ || Object.getPrototypeOf(LoggerController)).apply(this, arguments));
  }

  _createClass(LoggerController, [{
    key: 'maskSensitiveUrl',
    value: function maskSensitiveUrl(urlString) {
      var password = _url2.default.parse(urlString, true).query.password;

      if (password) {
        urlString = urlString.replace('password=' + password, 'password=********');
      }
      return urlString;
    }
  }, {
    key: 'maskSensitive',
    value: function maskSensitive(argArray) {
      var _this2 = this;

      return argArray.map(function (e) {
        if (!e) {
          return e;
        }

        if (typeof e === 'string') {
          return e.replace(/(password".?:.?")[^"]*"/g, '$1********"');
        }
        // else it is an object...

        // check the url
        if (e.url) {
          // for strings
          if (typeof e.url === 'string') {
            e.url = _this2.maskSensitiveUrl(e.url);
          } else if (Array.isArray(e.url)) {
            // for strings in array
            e.url = e.url.map(function (item) {
              if (typeof item === 'string') {
                return _this2.maskSensitiveUrl(item);
              }

              return item;
            });
          }
        }

        if (e.body) {
          var _iteratorNormalCompletion = true;
          var _didIteratorError = false;
          var _iteratorError = undefined;

          try {
            for (var _iterator = Object.keys(e.body)[Symbol.iterator](), _step; !(_iteratorNormalCompletion = (_step = _iterator.next()).done); _iteratorNormalCompletion = true) {
              var key = _step.value;

              if (key === 'password') {
                e.body[key] = '********';
                break;
              }
            }
          } catch (err) {
            _didIteratorError = true;
            _iteratorError = err;
          } finally {
            try {
              if (!_iteratorNormalCompletion && _iterator.return) {
                _iterator.return();
              }
            } finally {
              if (_didIteratorError) {
                throw _iteratorError;
              }
            }
          }
        }

        return e;
      });
    }
  }, {
    key: 'log',
    value: function log(level, args) {
      // make the passed in arguments object an array with the spread operator
      args = this.maskSensitive([].concat(_toConsumableArray(args)));
      args = [].concat(level, args);
      this.adapter.log.apply(this.adapter, args);
    }
  }, {
    key: 'info',
    value: function info() {
      return this.log('info', arguments);
    }
  }, {
    key: 'error',
    value: function error() {
      return this.log('error', arguments);
    }
  }, {
    key: 'warn',
    value: function warn() {
      return this.log('warn', arguments);
    }
  }, {
    key: 'verbose',
    value: function verbose() {
      return this.log('verbose', arguments);
    }
  }, {
    key: 'debug',
    value: function debug() {
      return this.log('debug', arguments);
    }
  }, {
    key: 'silly',
    value: function silly() {
      return this.log('silly', arguments);
    }
    // check that date input is valid

  }, {
    key: 'truncateLogMessage',
    value: function truncateLogMessage(string) {
      if (string && string.length > LOG_STRING_TRUNCATE_LENGTH) {
        var truncated = string.substring(0, LOG_STRING_TRUNCATE_LENGTH) + truncationMarker;
        return truncated;
      }

      return string;
    }
  }, {
    key: 'getLogs',


    // Returns a promise for a {response} object.
    // query params:
    // level (optional) Level of logging you want to query for (info || error)
    // from (optional) Start time for the search. Defaults to 1 week ago.
    // until (optional) End time for the search. Defaults to current time.
    // order (optional) Direction of results returned, either “asc” or “desc”. Defaults to “desc”.
    // size (optional) Number of rows returned by search. Defaults to 10
    value: function getLogs() {
      var options = arguments.length > 0 && arguments[0] !== undefined ? arguments[0] : {};

      if (!this.adapter) {
        throw new _node.Parse.Error(_node.Parse.Error.PUSH_MISCONFIGURED, 'Logger adapter is not available');
      }
      if (typeof this.adapter.query !== 'function') {
        throw new _node.Parse.Error(_node.Parse.Error.PUSH_MISCONFIGURED, 'Querying logs is not supported with this adapter');
      }
      options = LoggerController.parseOptions(options);
      return this.adapter.query(options);
    }
  }, {
    key: 'expectedAdapterType',
    value: function expectedAdapterType() {
      return _LoggerAdapter.LoggerAdapter;
    }
  }], [{
    key: 'validDateTime',
    value: function validDateTime(date) {
      if (!date) {
        return null;
      }
      date = new Date(date);

      if (!isNaN(date.getTime())) {
        return date;
      }

      return null;
    }
  }, {
    key: 'parseOptions',
    value: function parseOptions() {
      var options = arguments.length > 0 && arguments[0] !== undefined ? arguments[0] : {};

      var from = LoggerController.validDateTime(options.from) || new Date(Date.now() - 7 * MILLISECONDS_IN_A_DAY);
      var until = LoggerController.validDateTime(options.until) || new Date();
      var size = Number(options.size) || 10;
      var order = options.order || LogOrder.DESCENDING;
      var level = options.level || LogLevel.INFO;

      return {
        from: from,
        until: until,
        size: size,
        order: order,
        level: level
      };
    }
  }]);

  return LoggerController;
}(_AdaptableController3.default);

exports.default = LoggerController;