'use strict';

Object.defineProperty(exports, "__esModule", {
  value: true
});
exports.EventEmitterMQ = undefined;

var _events = require('events');

var _events2 = _interopRequireDefault(_events);

function _interopRequireDefault(obj) { return obj && obj.__esModule ? obj : { default: obj }; }

const emitter = new _events2.default.EventEmitter();
const subscriptions = new Map();

function unsubscribe(channel) {
  if (!subscriptions.has(channel)) {
    //console.log('No channel to unsub from');
    return;
  }
  //console.log('unsub ', channel);
  emitter.removeListener(channel, subscriptions.get(channel));
  subscriptions.delete(channel);
}

class Publisher {

  constructor(emitter) {
    this.emitter = emitter;
  }

  publish(channel, message) {
    this.emitter.emit(channel, message);
  }
}

class Consumer extends _events2.default.EventEmitter {

  constructor(emitter) {
    super();
    this.emitter = emitter;
  }

  subscribe(channel) {
    unsubscribe(channel);
    const handler = message => {
      this.emit('message', channel, message);
    };
    subscriptions.set(channel, handler);
    this.emitter.on(channel, handler);
  }

  unsubscribe(channel) {
    unsubscribe(channel);
  }
}

function createPublisher() {
  return new Publisher(emitter);
}

function createSubscriber() {
  return new Consumer(emitter);
}

const EventEmitterMQ = {
  createPublisher,
  createSubscriber
};

exports.EventEmitterMQ = EventEmitterMQ;