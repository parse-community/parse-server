'use strict';

Object.defineProperty(exports, "__esModule", {
  value: true
});
exports.EventEmitterPubSub = undefined;

var _events = require('events');

var _events2 = _interopRequireDefault(_events);

function _interopRequireDefault(obj) { return obj && obj.__esModule ? obj : { default: obj }; }

const emitter = new _events2.default.EventEmitter();

class Publisher {

  constructor(emitter) {
    this.emitter = emitter;
  }

  publish(channel, message) {
    this.emitter.emit(channel, message);
  }
}

class Subscriber extends _events2.default.EventEmitter {

  constructor(emitter) {
    super();
    this.emitter = emitter;
    this.subscriptions = new Map();
  }

  subscribe(channel) {
    const handler = message => {
      this.emit('message', channel, message);
    };
    this.subscriptions.set(channel, handler);
    this.emitter.on(channel, handler);
  }

  unsubscribe(channel) {
    if (!this.subscriptions.has(channel)) {
      return;
    }
    this.emitter.removeListener(channel, this.subscriptions.get(channel));
    this.subscriptions.delete(channel);
  }
}

function createPublisher() {
  return new Publisher(emitter);
}

function createSubscriber() {
  return new Subscriber(emitter);
}

const EventEmitterPubSub = {
  createPublisher,
  createSubscriber
};

exports.EventEmitterPubSub = EventEmitterPubSub;