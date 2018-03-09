'use strict';

Object.defineProperty(exports, "__esModule", {
  value: true
});
exports.ParsePubSub = undefined;

var _AdapterLoader = require('../Adapters/AdapterLoader');

var _EventEmitterPubSub = require('../Adapters/PubSub/EventEmitterPubSub');

var _RedisPubSub = require('../Adapters/PubSub/RedisPubSub');

const ParsePubSub = {};

function useRedis(config) {
  const redisURL = config.redisURL;
  return typeof redisURL !== 'undefined' && redisURL !== '';
}

ParsePubSub.createPublisher = function (config) {
  if (useRedis(config)) {
    return _RedisPubSub.RedisPubSub.createPublisher(config);
  } else {
    const adapter = (0, _AdapterLoader.loadAdapter)(config.pubSubAdapter, _EventEmitterPubSub.EventEmitterPubSub, config);
    if (typeof adapter.createPublisher !== 'function') {
      throw 'pubSubAdapter should have createPublisher()';
    }
    return adapter.createPublisher(config);
  }
};

ParsePubSub.createSubscriber = function (config) {
  if (useRedis(config)) {
    return _RedisPubSub.RedisPubSub.createSubscriber(config);
  } else {
    const adapter = (0, _AdapterLoader.loadAdapter)(config.pubSubAdapter, _EventEmitterPubSub.EventEmitterPubSub, config);
    if (typeof adapter.createSubscriber !== 'function') {
      throw 'pubSubAdapter should have createSubscriber()';
    }
    return adapter.createSubscriber(config);
  }
};

exports.ParsePubSub = ParsePubSub;