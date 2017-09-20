'use strict';

Object.defineProperty(exports, "__esModule", {
  value: true
});
exports.LogsRouter = undefined;

var _createClass = function () { function defineProperties(target, props) { for (var i = 0; i < props.length; i++) { var descriptor = props[i]; descriptor.enumerable = descriptor.enumerable || false; descriptor.configurable = true; if ("value" in descriptor) descriptor.writable = true; Object.defineProperty(target, descriptor.key, descriptor); } } return function (Constructor, protoProps, staticProps) { if (protoProps) defineProperties(Constructor.prototype, protoProps); if (staticProps) defineProperties(Constructor, staticProps); return Constructor; }; }();

var _node = require('parse/node');

var _PromiseRouter2 = require('../PromiseRouter');

var _PromiseRouter3 = _interopRequireDefault(_PromiseRouter2);

var _middlewares = require('../middlewares');

var middleware = _interopRequireWildcard(_middlewares);

function _interopRequireWildcard(obj) { if (obj && obj.__esModule) { return obj; } else { var newObj = {}; if (obj != null) { for (var key in obj) { if (Object.prototype.hasOwnProperty.call(obj, key)) newObj[key] = obj[key]; } } newObj.default = obj; return newObj; } }

function _interopRequireDefault(obj) { return obj && obj.__esModule ? obj : { default: obj }; }

function _classCallCheck(instance, Constructor) { if (!(instance instanceof Constructor)) { throw new TypeError("Cannot call a class as a function"); } }

function _possibleConstructorReturn(self, call) { if (!self) { throw new ReferenceError("this hasn't been initialised - super() hasn't been called"); } return call && (typeof call === "object" || typeof call === "function") ? call : self; }

function _inherits(subClass, superClass) { if (typeof superClass !== "function" && superClass !== null) { throw new TypeError("Super expression must either be null or a function, not " + typeof superClass); } subClass.prototype = Object.create(superClass && superClass.prototype, { constructor: { value: subClass, enumerable: false, writable: true, configurable: true } }); if (superClass) Object.setPrototypeOf ? Object.setPrototypeOf(subClass, superClass) : subClass.__proto__ = superClass; }

var LogsRouter = exports.LogsRouter = function (_PromiseRouter) {
  _inherits(LogsRouter, _PromiseRouter);

  function LogsRouter() {
    _classCallCheck(this, LogsRouter);

    return _possibleConstructorReturn(this, (LogsRouter.__proto__ || Object.getPrototypeOf(LogsRouter)).apply(this, arguments));
  }

  _createClass(LogsRouter, [{
    key: 'mountRoutes',
    value: function mountRoutes() {
      var _this2 = this;

      this.route('GET', '/scriptlog', middleware.promiseEnforceMasterKeyAccess, this.validateRequest, function (req) {
        return _this2.handleGET(req);
      });
    }
  }, {
    key: 'validateRequest',
    value: function validateRequest(req) {
      if (!req.config || !req.config.loggerController) {
        throw new _node.Parse.Error(_node.Parse.Error.PUSH_MISCONFIGURED, 'Logger adapter is not available');
      }
    }

    // Returns a promise for a {response} object.
    // query params:
    // level (optional) Level of logging you want to query for (info || error)
    // from (optional) Start time for the search. Defaults to 1 week ago.
    // until (optional) End time for the search. Defaults to current time.
    // order (optional) Direction of results returned, either “asc” or “desc”. Defaults to “desc”.
    // size (optional) Number of rows returned by search. Defaults to 10
    // n same as size, overrides size if set

  }, {
    key: 'handleGET',
    value: function handleGET(req) {
      var from = req.query.from;
      var until = req.query.until;
      var size = req.query.size;
      if (req.query.n) {
        size = req.query.n;
      }

      var order = req.query.order;
      var level = req.query.level;
      var options = {
        from: from,
        until: until,
        size: size,
        order: order,
        level: level
      };

      return req.config.loggerController.getLogs(options).then(function (result) {
        return Promise.resolve({
          response: result
        });
      });
    }
  }]);

  return LogsRouter;
}(_PromiseRouter3.default);

exports.default = LogsRouter;