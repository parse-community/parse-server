'use strict';

Object.defineProperty(exports, "__esModule", {
  value: true
});
exports.ParsePubSub = undefined;

var _RedisPubSub = require('./RedisPubSub');

var _EventEmitterPubSub = require('./EventEmitterPubSub');

var ParsePubSub = {};

function useRedis(config) {
  var redisURL = config.redisURL;
  return typeof redisURL !== 'undefined' && redisURL !== '';
}

ParsePubSub.createPublisher = function (config) {
  if (useRedis(config)) {
    return _RedisPubSub.RedisPubSub.createPublisher(config.redisURL);
  } else {
    return _EventEmitterPubSub.EventEmitterPubSub.createPublisher();
  }
};

ParsePubSub.createSubscriber = function (config) {
  if (useRedis(config)) {
    return _RedisPubSub.RedisPubSub.createSubscriber(config.redisURL);
  } else {
    return _EventEmitterPubSub.EventEmitterPubSub.createSubscriber();
  }
};

exports.ParsePubSub = ParsePubSub;