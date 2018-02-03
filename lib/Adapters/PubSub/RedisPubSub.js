'use strict';

Object.defineProperty(exports, "__esModule", {
  value: true
});
exports.RedisPubSub = undefined;

var _redis = require('redis');

var _redis2 = _interopRequireDefault(_redis);

function _interopRequireDefault(obj) { return obj && obj.__esModule ? obj : { default: obj }; }

function createPublisher({ redisURL }) {
  return _redis2.default.createClient(redisURL, { no_ready_check: true });
}

function createSubscriber({ redisURL }) {
  return _redis2.default.createClient(redisURL, { no_ready_check: true });
}

const RedisPubSub = {
  createPublisher,
  createSubscriber
};

exports.RedisPubSub = RedisPubSub;