'use strict';

Object.defineProperty(exports, "__esModule", {
  value: true
});
exports.PurgeRouter = undefined;

var _createClass = function () { function defineProperties(target, props) { for (var i = 0; i < props.length; i++) { var descriptor = props[i]; descriptor.enumerable = descriptor.enumerable || false; descriptor.configurable = true; if ("value" in descriptor) descriptor.writable = true; Object.defineProperty(target, descriptor.key, descriptor); } } return function (Constructor, protoProps, staticProps) { if (protoProps) defineProperties(Constructor.prototype, protoProps); if (staticProps) defineProperties(Constructor, staticProps); return Constructor; }; }();

var _PromiseRouter2 = require('../PromiseRouter');

var _PromiseRouter3 = _interopRequireDefault(_PromiseRouter2);

var _middlewares = require('../middlewares');

var middleware = _interopRequireWildcard(_middlewares);

function _interopRequireWildcard(obj) { if (obj && obj.__esModule) { return obj; } else { var newObj = {}; if (obj != null) { for (var key in obj) { if (Object.prototype.hasOwnProperty.call(obj, key)) newObj[key] = obj[key]; } } newObj.default = obj; return newObj; } }

function _interopRequireDefault(obj) { return obj && obj.__esModule ? obj : { default: obj }; }

function _classCallCheck(instance, Constructor) { if (!(instance instanceof Constructor)) { throw new TypeError("Cannot call a class as a function"); } }

function _possibleConstructorReturn(self, call) { if (!self) { throw new ReferenceError("this hasn't been initialised - super() hasn't been called"); } return call && (typeof call === "object" || typeof call === "function") ? call : self; }

function _inherits(subClass, superClass) { if (typeof superClass !== "function" && superClass !== null) { throw new TypeError("Super expression must either be null or a function, not " + typeof superClass); } subClass.prototype = Object.create(superClass && superClass.prototype, { constructor: { value: subClass, enumerable: false, writable: true, configurable: true } }); if (superClass) Object.setPrototypeOf ? Object.setPrototypeOf(subClass, superClass) : subClass.__proto__ = superClass; }

var PurgeRouter = exports.PurgeRouter = function (_PromiseRouter) {
  _inherits(PurgeRouter, _PromiseRouter);

  function PurgeRouter() {
    _classCallCheck(this, PurgeRouter);

    return _possibleConstructorReturn(this, (PurgeRouter.__proto__ || Object.getPrototypeOf(PurgeRouter)).apply(this, arguments));
  }

  _createClass(PurgeRouter, [{
    key: 'handlePurge',
    value: function handlePurge(req) {
      return req.config.database.purgeCollection(req.params.className).then(function () {
        var cacheAdapter = req.config.cacheController;
        if (req.params.className == '_Session') {
          cacheAdapter.user.clear();
        } else if (req.params.className == '_Role') {
          cacheAdapter.role.clear();
        }
        return { response: {} };
      });
    }
  }, {
    key: 'mountRoutes',
    value: function mountRoutes() {
      var _this2 = this;

      this.route('DELETE', '/purge/:className', middleware.promiseEnforceMasterKeyAccess, function (req) {
        return _this2.handlePurge(req);
      });
    }
  }]);

  return PurgeRouter;
}(_PromiseRouter3.default);

exports.default = PurgeRouter;