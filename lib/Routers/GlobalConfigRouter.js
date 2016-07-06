'use strict';

Object.defineProperty(exports, "__esModule", {
  value: true
});
exports.GlobalConfigRouter = undefined;

var _createClass = function () { function defineProperties(target, props) { for (var i = 0; i < props.length; i++) { var descriptor = props[i]; descriptor.enumerable = descriptor.enumerable || false; descriptor.configurable = true; if ("value" in descriptor) descriptor.writable = true; Object.defineProperty(target, descriptor.key, descriptor); } } return function (Constructor, protoProps, staticProps) { if (protoProps) defineProperties(Constructor.prototype, protoProps); if (staticProps) defineProperties(Constructor, staticProps); return Constructor; }; }();

var _PromiseRouter2 = require('../PromiseRouter');

var _PromiseRouter3 = _interopRequireDefault(_PromiseRouter2);

var _middlewares = require('../middlewares');

var middleware = _interopRequireWildcard(_middlewares);

function _interopRequireWildcard(obj) { if (obj && obj.__esModule) { return obj; } else { var newObj = {}; if (obj != null) { for (var key in obj) { if (Object.prototype.hasOwnProperty.call(obj, key)) newObj[key] = obj[key]; } } newObj.default = obj; return newObj; } }

function _interopRequireDefault(obj) { return obj && obj.__esModule ? obj : { default: obj }; }

function _classCallCheck(instance, Constructor) { if (!(instance instanceof Constructor)) { throw new TypeError("Cannot call a class as a function"); } }

function _possibleConstructorReturn(self, call) { if (!self) { throw new ReferenceError("this hasn't been initialised - super() hasn't been called"); } return call && (typeof call === "object" || typeof call === "function") ? call : self; }

function _inherits(subClass, superClass) { if (typeof superClass !== "function" && superClass !== null) { throw new TypeError("Super expression must either be null or a function, not " + typeof superClass); } subClass.prototype = Object.create(superClass && superClass.prototype, { constructor: { value: subClass, enumerable: false, writable: true, configurable: true } }); if (superClass) Object.setPrototypeOf ? Object.setPrototypeOf(subClass, superClass) : subClass.__proto__ = superClass; } // global_config.js

var GlobalConfigRouter = exports.GlobalConfigRouter = function (_PromiseRouter) {
  _inherits(GlobalConfigRouter, _PromiseRouter);

  function GlobalConfigRouter() {
    _classCallCheck(this, GlobalConfigRouter);

    return _possibleConstructorReturn(this, Object.getPrototypeOf(GlobalConfigRouter).apply(this, arguments));
  }

  _createClass(GlobalConfigRouter, [{
    key: 'getGlobalConfig',
    value: function getGlobalConfig(req) {
      return req.config.database.find('_GlobalConfig', { objectId: 1 }, { limit: 1 }).then(function (results) {
        if (results.length != 1) {
          // If there is no config in the database - return empty config.
          return { response: { params: {} } };
        }
        var globalConfig = results[0];
        return { response: { params: globalConfig.params } };
      });
    }
  }, {
    key: 'updateGlobalConfig',
    value: function updateGlobalConfig(req) {
      var params = req.body.params;
      // Transform in dot notation to make sure it works
      var update = Object.keys(params).reduce(function (acc, key) {
        acc['params.' + key] = params[key];
        return acc;
      }, {});
      return req.config.database.update('_GlobalConfig', { objectId: 1 }, update, { upsert: true }).then(function () {
        return { response: { result: true } };
      });
    }
  }, {
    key: 'mountRoutes',
    value: function mountRoutes() {
      var _this2 = this;

      this.route('GET', '/config', function (req) {
        return _this2.getGlobalConfig(req);
      });
      this.route('PUT', '/config', middleware.promiseEnforceMasterKeyAccess, function (req) {
        return _this2.updateGlobalConfig(req);
      });
    }
  }]);

  return GlobalConfigRouter;
}(_PromiseRouter3.default);

exports.default = GlobalConfigRouter;