'use strict';

Object.defineProperty(exports, "__esModule", {
  value: true
});
exports.PushController = undefined;

var _typeof = typeof Symbol === "function" && typeof Symbol.iterator === "symbol" ? function (obj) { return typeof obj; } : function (obj) { return obj && typeof Symbol === "function" && obj.constructor === Symbol && obj !== Symbol.prototype ? "symbol" : typeof obj; };

var _createClass = function () { function defineProperties(target, props) { for (var i = 0; i < props.length; i++) { var descriptor = props[i]; descriptor.enumerable = descriptor.enumerable || false; descriptor.configurable = true; if ("value" in descriptor) descriptor.writable = true; Object.defineProperty(target, descriptor.key, descriptor); } } return function (Constructor, protoProps, staticProps) { if (protoProps) defineProperties(Constructor.prototype, protoProps); if (staticProps) defineProperties(Constructor, staticProps); return Constructor; }; }();

var _node = require('parse/node');

var _PromiseRouter = require('../PromiseRouter');

var _PromiseRouter2 = _interopRequireDefault(_PromiseRouter);

var _rest = require('../rest');

var _rest2 = _interopRequireDefault(_rest);

var _AdaptableController2 = require('./AdaptableController');

var _AdaptableController3 = _interopRequireDefault(_AdaptableController2);

var _PushAdapter = require('../Adapters/Push/PushAdapter');

var _deepcopy = require('deepcopy');

var _deepcopy2 = _interopRequireDefault(_deepcopy);

var _RestQuery = require('../RestQuery');

var _RestQuery2 = _interopRequireDefault(_RestQuery);

var _RestWrite = require('../RestWrite');

var _RestWrite2 = _interopRequireDefault(_RestWrite);

var _Auth = require('../Auth');

var _StatusHandler = require('../StatusHandler');

function _interopRequireDefault(obj) { return obj && obj.__esModule ? obj : { default: obj }; }

function _classCallCheck(instance, Constructor) { if (!(instance instanceof Constructor)) { throw new TypeError("Cannot call a class as a function"); } }

function _possibleConstructorReturn(self, call) { if (!self) { throw new ReferenceError("this hasn't been initialised - super() hasn't been called"); } return call && (typeof call === "object" || typeof call === "function") ? call : self; }

function _inherits(subClass, superClass) { if (typeof superClass !== "function" && superClass !== null) { throw new TypeError("Super expression must either be null or a function, not " + typeof superClass); } subClass.prototype = Object.create(superClass && superClass.prototype, { constructor: { value: subClass, enumerable: false, writable: true, configurable: true } }); if (superClass) Object.setPrototypeOf ? Object.setPrototypeOf(subClass, superClass) : subClass.__proto__ = superClass; }

var FEATURE_NAME = 'push';
var UNSUPPORTED_BADGE_KEY = "unsupported";

var PushController = exports.PushController = function (_AdaptableController) {
  _inherits(PushController, _AdaptableController);

  function PushController() {
    _classCallCheck(this, PushController);

    return _possibleConstructorReturn(this, (PushController.__proto__ || Object.getPrototypeOf(PushController)).apply(this, arguments));
  }

  _createClass(PushController, [{
    key: 'sendPush',
    value: function sendPush() {
      var body = arguments.length > 0 && arguments[0] !== undefined ? arguments[0] : {};
      var where = arguments.length > 1 && arguments[1] !== undefined ? arguments[1] : {};
      var config = arguments[2];

      var _this2 = this;

      var auth = arguments[3];
      var onPushStatusSaved = arguments.length > 4 && arguments[4] !== undefined ? arguments[4] : function () {};

      var pushAdapter = this.adapter;
      if (!this.pushIsAvailable) {
        throw new _node.Parse.Error(_node.Parse.Error.PUSH_MISCONFIGURED, 'Push adapter is not available');
      }
      if (!this.options) {
        throw new _node.Parse.Error(_node.Parse.Error.PUSH_MISCONFIGURED, 'Missing push configuration');
      }
      PushController.validatePushType(where, pushAdapter.getValidPushTypes());
      // Replace the expiration_time with a valid Unix epoch milliseconds time
      body['expiration_time'] = PushController.getExpirationTime(body);
      // TODO: If the req can pass the checking, we return immediately instead of waiting
      // pushes to be sent. We probably change this behaviour in the future.
      var badgeUpdate = function badgeUpdate() {
        return Promise.resolve();
      };
      if (body.data && body.data.badge) {
        (function () {
          var badge = body.data.badge;
          var restUpdate = {};
          if (typeof badge == 'string' && badge.toLowerCase() === 'increment') {
            restUpdate = { badge: { __op: 'Increment', amount: 1 } };
          } else if (Number(badge)) {
            restUpdate = { badge: badge };
          } else {
            throw "Invalid value for badge, expected number or 'Increment'";
          }
          var updateWhere = (0, _deepcopy2.default)(where);

          badgeUpdate = function badgeUpdate() {
            updateWhere.deviceType = 'ios';
            // Build a real RestQuery so we can use it in RestWrite
            var restQuery = new _RestQuery2.default(config, (0, _Auth.master)(config), '_Installation', updateWhere);
            return restQuery.buildRestWhere().then(function () {
              var write = new _RestWrite2.default(config, (0, _Auth.master)(config), '_Installation', restQuery.restWhere, restUpdate);
              write.runOptions.many = true;
              return write.execute();
            });
          };
        })();
      }
      var pushStatus = (0, _StatusHandler.pushStatusHandler)(config);
      return Promise.resolve().then(function () {
        return pushStatus.setInitial(body, where);
      }).then(function () {
        onPushStatusSaved(pushStatus.objectId);
        return badgeUpdate();
      }).then(function () {
        return _rest2.default.find(config, auth, '_Installation', where);
      }).then(function (response) {
        if (!response.results) {
          return Promise.reject({ error: 'PushController: no results in query' });
        }
        pushStatus.setRunning(response.results);
        return _this2.sendToAdapter(body, response.results, pushStatus, config);
      }).then(function (results) {
        return pushStatus.complete(results);
      }).catch(function (err) {
        return pushStatus.fail(err).then(function () {
          throw err;
        });
      });
    }
  }, {
    key: 'sendToAdapter',
    value: function sendToAdapter(body, installations, pushStatus, config) {
      var _this3 = this;

      if (body.data && body.data.badge && typeof body.data.badge == 'string' && body.data.badge.toLowerCase() == "increment") {
        var _ret2 = function () {
          // Collect the badges to reduce the # of calls
          var badgeInstallationsMap = installations.reduce(function (map, installation) {
            var badge = installation.badge;
            if (installation.deviceType != "ios") {
              badge = UNSUPPORTED_BADGE_KEY;
            }
            map[badge + ''] = map[badge + ''] || [];
            map[badge + ''].push(installation);
            return map;
          }, {});

          // Map the on the badges count and return the send result
          var promises = Object.keys(badgeInstallationsMap).map(function (badge) {
            var payload = (0, _deepcopy2.default)(body);
            if (badge == UNSUPPORTED_BADGE_KEY) {
              delete payload.data.badge;
            } else {
              payload.data.badge = parseInt(badge);
            }
            return _this3.adapter.send(payload, badgeInstallationsMap[badge], pushStatus.objectId);
          });
          return {
            v: Promise.all(promises)
          };
        }();

        if ((typeof _ret2 === 'undefined' ? 'undefined' : _typeof(_ret2)) === "object") return _ret2.v;
      }
      return this.adapter.send(body, installations, pushStatus.objectId);
    }

    /**
     * Get expiration time from the request body.
     * @param {Object} request A request object
     * @returns {Number|undefined} The expiration time if it exists in the request
     */

  }, {
    key: 'expectedAdapterType',
    value: function expectedAdapterType() {
      return _PushAdapter.PushAdapter;
    }
  }, {
    key: 'pushIsAvailable',
    get: function get() {
      return !!this.adapter;
    }
  }], [{
    key: 'validatePushType',


    /**
     * Check whether the deviceType parameter in qury condition is valid or not.
     * @param {Object} where A query condition
     * @param {Array} validPushTypes An array of valid push types(string)
     */
    value: function validatePushType() {
      var where = arguments.length > 0 && arguments[0] !== undefined ? arguments[0] : {};
      var validPushTypes = arguments.length > 1 && arguments[1] !== undefined ? arguments[1] : [];

      var deviceTypeField = where.deviceType || {};
      var deviceTypes = [];
      if (typeof deviceTypeField === 'string') {
        deviceTypes.push(deviceTypeField);
      } else if (typeof deviceTypeField['$in'] === 'array') {
        deviceTypes.concat(deviceTypeField['$in']);
      }
      for (var i = 0; i < deviceTypes.length; i++) {
        var deviceType = deviceTypes[i];
        if (validPushTypes.indexOf(deviceType) < 0) {
          throw new _node.Parse.Error(_node.Parse.Error.PUSH_MISCONFIGURED, deviceType + ' is not supported push type.');
        }
      }
    }
  }, {
    key: 'getExpirationTime',
    value: function getExpirationTime() {
      var body = arguments.length > 0 && arguments[0] !== undefined ? arguments[0] : {};

      var hasExpirationTime = !!body['expiration_time'];
      if (!hasExpirationTime) {
        return;
      }
      var expirationTimeParam = body['expiration_time'];
      var expirationTime;
      if (typeof expirationTimeParam === 'number') {
        expirationTime = new Date(expirationTimeParam * 1000);
      } else if (typeof expirationTimeParam === 'string') {
        expirationTime = new Date(expirationTimeParam);
      } else {
        throw new _node.Parse.Error(_node.Parse.Error.PUSH_MISCONFIGURED, body['expiration_time'] + ' is not valid time.');
      }
      // Check expirationTime is valid or not, if it is not valid, expirationTime is NaN
      if (!isFinite(expirationTime)) {
        throw new _node.Parse.Error(_node.Parse.Error.PUSH_MISCONFIGURED, body['expiration_time'] + ' is not valid time.');
      }
      return expirationTime.valueOf();
    }
  }]);

  return PushController;
}(_AdaptableController3.default);

exports.default = PushController;