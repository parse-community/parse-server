"use strict";

Object.defineProperty(exports, "__esModule", {
  value: true
});
exports.PushRouter = undefined;

var _createClass = function () { function defineProperties(target, props) { for (var i = 0; i < props.length; i++) { var descriptor = props[i]; descriptor.enumerable = descriptor.enumerable || false; descriptor.configurable = true; if ("value" in descriptor) descriptor.writable = true; Object.defineProperty(target, descriptor.key, descriptor); } } return function (Constructor, protoProps, staticProps) { if (protoProps) defineProperties(Constructor.prototype, protoProps); if (staticProps) defineProperties(Constructor, staticProps); return Constructor; }; }();

var _PromiseRouter2 = require("../PromiseRouter");

var _PromiseRouter3 = _interopRequireDefault(_PromiseRouter2);

var _middlewares = require("../middlewares");

var middleware = _interopRequireWildcard(_middlewares);

var _node = require("parse/node");

function _interopRequireWildcard(obj) { if (obj && obj.__esModule) { return obj; } else { var newObj = {}; if (obj != null) { for (var key in obj) { if (Object.prototype.hasOwnProperty.call(obj, key)) newObj[key] = obj[key]; } } newObj.default = obj; return newObj; } }

function _interopRequireDefault(obj) { return obj && obj.__esModule ? obj : { default: obj }; }

function _classCallCheck(instance, Constructor) { if (!(instance instanceof Constructor)) { throw new TypeError("Cannot call a class as a function"); } }

function _possibleConstructorReturn(self, call) { if (!self) { throw new ReferenceError("this hasn't been initialised - super() hasn't been called"); } return call && (typeof call === "object" || typeof call === "function") ? call : self; }

function _inherits(subClass, superClass) { if (typeof superClass !== "function" && superClass !== null) { throw new TypeError("Super expression must either be null or a function, not " + typeof superClass); } subClass.prototype = Object.create(superClass && superClass.prototype, { constructor: { value: subClass, enumerable: false, writable: true, configurable: true } }); if (superClass) Object.setPrototypeOf ? Object.setPrototypeOf(subClass, superClass) : subClass.__proto__ = superClass; }

var PushRouter = exports.PushRouter = function (_PromiseRouter) {
  _inherits(PushRouter, _PromiseRouter);

  function PushRouter() {
    _classCallCheck(this, PushRouter);

    return _possibleConstructorReturn(this, Object.getPrototypeOf(PushRouter).apply(this, arguments));
  }

  _createClass(PushRouter, [{
    key: "mountRoutes",
    value: function mountRoutes() {
      this.route("POST", "/push", middleware.promiseEnforceMasterKeyAccess, PushRouter.handlePOST);
    }
  }], [{
    key: "handlePOST",
    value: function handlePOST(req) {
      var pushController = req.config.pushController;
      if (!pushController) {
        throw new _node.Parse.Error(_node.Parse.Error.PUSH_MISCONFIGURED, 'Push controller is not set');
      }

      var where = PushRouter.getQueryCondition(req);
      var resolve = void 0;
      var promise = new Promise(function (_resolve) {
        resolve = _resolve;
      });
      pushController.sendPush(req.body, where, req.config, req.auth, function (pushStatusId) {
        resolve({
          headers: {
            'X-Parse-Push-Status-Id': pushStatusId
          },
          response: {
            result: true
          }
        });
      });
      return promise;
    }

    /**
     * Get query condition from the request body.
     * @param {Object} req A request object
     * @returns {Object} The query condition, the where field in a query api call
     */

  }, {
    key: "getQueryCondition",
    value: function getQueryCondition(req) {
      var body = req.body || {};
      var hasWhere = typeof body.where !== 'undefined';
      var hasChannels = typeof body.channels !== 'undefined';

      var where = void 0;
      if (hasWhere && hasChannels) {
        throw new _node.Parse.Error(_node.Parse.Error.PUSH_MISCONFIGURED, 'Channels and query can not be set at the same time.');
      } else if (hasWhere) {
        where = body.where;
      } else if (hasChannels) {
        where = {
          "channels": {
            "$in": body.channels
          }
        };
      } else {
        throw new _node.Parse.Error(_node.Parse.Error.PUSH_MISCONFIGURED, 'Sending a push requires either "channels" or a "where" query.');
      }
      return where;
    }
  }]);

  return PushRouter;
}(_PromiseRouter3.default);

exports.default = PushRouter;