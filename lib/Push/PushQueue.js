'use strict';

Object.defineProperty(exports, "__esModule", {
  value: true
});
exports.PushQueue = undefined;

var _createClass = function () { function defineProperties(target, props) { for (var i = 0; i < props.length; i++) { var descriptor = props[i]; descriptor.enumerable = descriptor.enumerable || false; descriptor.configurable = true; if ("value" in descriptor) descriptor.writable = true; Object.defineProperty(target, descriptor.key, descriptor); } } return function (Constructor, protoProps, staticProps) { if (protoProps) defineProperties(Constructor.prototype, protoProps); if (staticProps) defineProperties(Constructor, staticProps); return Constructor; }; }();

var _ParseMessageQueue = require('../ParseMessageQueue');

var _rest = require('../rest');

var _rest2 = _interopRequireDefault(_rest);

var _utils = require('./utils');

var _deepcopy = require('deepcopy');

var _deepcopy2 = _interopRequireDefault(_deepcopy);

function _interopRequireDefault(obj) { return obj && obj.__esModule ? obj : { default: obj }; }

function _classCallCheck(instance, Constructor) { if (!(instance instanceof Constructor)) { throw new TypeError("Cannot call a class as a function"); } }

var PUSH_CHANNEL = 'parse-server-push';
var DEFAULT_BATCH_SIZE = 100;

var PushQueue = exports.PushQueue = function () {

  // config object of the publisher, right now it only contains the redisURL,
  // but we may extend it later.
  function PushQueue() {
    var config = arguments.length > 0 && arguments[0] !== undefined ? arguments[0] : {};

    _classCallCheck(this, PushQueue);

    this.channel = config.channel || PUSH_CHANNEL;
    this.batchSize = config.batchSize || DEFAULT_BATCH_SIZE;
    this.parsePublisher = _ParseMessageQueue.ParseMessageQueue.createPublisher(config);
  }

  _createClass(PushQueue, [{
    key: 'enqueue',
    value: function enqueue(body, where, config, auth, pushStatus) {
      var _this = this;

      var limit = this.batchSize;
      // Order by badge (because the payload is badge dependant)
      // and createdAt to fix the order
      var order = (0, _utils.isPushIncrementing)(body) ? 'badge,createdAt' : 'createdAt';
      where = (0, _deepcopy2.default)(where);
      if (!where.hasOwnProperty('deviceToken')) {
        where['deviceToken'] = { '$exists': true };
      }
      return Promise.resolve().then(function () {
        return _rest2.default.find(config, auth, '_Installation', where, { limit: 0, count: true });
      }).then(function (_ref) {
        var results = _ref.results,
            count = _ref.count;

        if (!results) {
          return Promise.reject({ error: 'PushController: no results in query' });
        }
        pushStatus.setRunning(count);
        var skip = 0;
        while (skip < count) {
          var query = { where: where,
            limit: limit,
            skip: skip,
            order: order };

          var pushWorkItem = {
            body: body,
            query: query,
            pushStatus: { objectId: pushStatus.objectId },
            applicationId: config.applicationId
          };
          _this.parsePublisher.publish(_this.channel, JSON.stringify(pushWorkItem));
          skip += limit;
        }
      });
    }
  }], [{
    key: 'defaultPushChannel',
    value: function defaultPushChannel() {
      return PUSH_CHANNEL;
    }
  }]);

  return PushQueue;
}();