'use strict';

Object.defineProperty(exports, "__esModule", {
  value: true
});
exports.PushWorker = undefined;

var _createClass = function () { function defineProperties(target, props) { for (var i = 0; i < props.length; i++) { var descriptor = props[i]; descriptor.enumerable = descriptor.enumerable || false; descriptor.configurable = true; if ("value" in descriptor) descriptor.writable = true; Object.defineProperty(target, descriptor.key, descriptor); } } return function (Constructor, protoProps, staticProps) { if (protoProps) defineProperties(Constructor.prototype, protoProps); if (staticProps) defineProperties(Constructor, staticProps); return Constructor; }; }();

var _deepcopy = require('deepcopy');

var _deepcopy2 = _interopRequireDefault(_deepcopy);

var _AdaptableController = require('../Controllers/AdaptableController');

var _AdaptableController2 = _interopRequireDefault(_AdaptableController);

var _Auth = require('../Auth');

var _Config = require('../Config');

var _Config2 = _interopRequireDefault(_Config);

var _PushAdapter = require('../Adapters/Push/PushAdapter');

var _rest = require('../rest');

var _rest2 = _interopRequireDefault(_rest);

var _StatusHandler = require('../StatusHandler');

var _utils = require('./utils');

var _ParseMessageQueue = require('../ParseMessageQueue');

var _PushQueue = require('./PushQueue');

function _interopRequireDefault(obj) { return obj && obj.__esModule ? obj : { default: obj }; }

function _classCallCheck(instance, Constructor) { if (!(instance instanceof Constructor)) { throw new TypeError("Cannot call a class as a function"); } }

var UNSUPPORTED_BADGE_KEY = "unsupported";

function groupByBadge(installations) {
  return installations.reduce(function (map, installation) {
    var badge = installation.badge + '';
    if (installation.deviceType != "ios") {
      badge = UNSUPPORTED_BADGE_KEY;
    }
    map[badge] = map[badge] || [];
    map[badge].push(installation);
    return map;
  }, {});
}

var PushWorker = exports.PushWorker = function () {
  function PushWorker(pushAdapter) {
    var _this = this;

    var subscriberConfig = arguments.length > 1 && arguments[1] !== undefined ? arguments[1] : {};

    _classCallCheck(this, PushWorker);

    _AdaptableController2.default.validateAdapter(pushAdapter, this, _PushAdapter.PushAdapter);
    this.adapter = pushAdapter;

    this.channel = subscriberConfig.channel || _PushQueue.PushQueue.defaultPushChannel();
    this.subscriber = _ParseMessageQueue.ParseMessageQueue.createSubscriber(subscriberConfig);
    if (this.subscriber) {
      var subscriber = this.subscriber;
      subscriber.subscribe(this.channel);
      subscriber.on('message', function (channel, messageStr) {
        var workItem = JSON.parse(messageStr);
        _this.run(workItem);
      });
    }
  }

  _createClass(PushWorker, [{
    key: 'unsubscribe',
    value: function unsubscribe() {
      if (this.subscriber) {
        this.subscriber.unsubscribe(this.channel);
      }
    }
  }, {
    key: 'run',
    value: function run(_ref) {
      var _this2 = this;

      var body = _ref.body,
          query = _ref.query,
          pushStatus = _ref.pushStatus,
          applicationId = _ref.applicationId;

      var config = new _Config2.default(applicationId);
      var auth = (0, _Auth.master)(config);
      var where = query.where;
      delete query.where;
      return _rest2.default.find(config, auth, '_Installation', where, query).then(function (_ref2) {
        var results = _ref2.results;

        if (results.length == 0) {
          return;
        }
        return _this2.sendToAdapter(body, results, pushStatus, config);
      }, function (err) {
        throw err;
      });
    }
  }, {
    key: 'sendToAdapter',
    value: function sendToAdapter(body, installations, pushStatus, config) {
      var _this3 = this;

      pushStatus = (0, _StatusHandler.pushStatusHandler)(config, pushStatus.objectId);
      if (!(0, _utils.isPushIncrementing)(body)) {
        return this.adapter.send(body, installations, pushStatus.objectId).then(function (results) {
          return pushStatus.trackSent(results);
        });
      }

      // Collect the badges to reduce the # of calls
      var badgeInstallationsMap = groupByBadge(installations);

      // Map the on the badges count and return the send result
      var promises = Object.keys(badgeInstallationsMap).map(function (badge) {
        var payload = (0, _deepcopy2.default)(body);
        if (badge == UNSUPPORTED_BADGE_KEY) {
          delete payload.data.badge;
        } else {
          payload.data.badge = parseInt(badge);
        }
        var installations = badgeInstallationsMap[badge];
        return _this3.sendToAdapter(payload, installations, pushStatus, config);
      });
      return Promise.all(promises);
    }
  }]);

  return PushWorker;
}();

exports.default = PushWorker;