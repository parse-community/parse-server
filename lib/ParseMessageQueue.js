'use strict';

Object.defineProperty(exports, "__esModule", {
  value: true
});
exports.ParseMessageQueue = undefined;

var _AdapterLoader = require('./Adapters/AdapterLoader');

var _EventEmitterMQ = require('./Adapters/MessageQueue/EventEmitterMQ');

const ParseMessageQueue = {};

ParseMessageQueue.createPublisher = function (config) {
  const adapter = (0, _AdapterLoader.loadAdapter)(config.messageQueueAdapter, _EventEmitterMQ.EventEmitterMQ, config);
  if (typeof adapter.createPublisher !== 'function') {
    throw 'pubSubAdapter should have createPublisher()';
  }
  return adapter.createPublisher(config);
};

ParseMessageQueue.createSubscriber = function (config) {
  const adapter = (0, _AdapterLoader.loadAdapter)(config.messageQueueAdapter, _EventEmitterMQ.EventEmitterMQ, config);
  if (typeof adapter.createSubscriber !== 'function') {
    throw 'messageQueueAdapter should have createSubscriber()';
  }
  return adapter.createSubscriber(config);
};

exports.ParseMessageQueue = ParseMessageQueue;