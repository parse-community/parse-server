'use strict';

Object.defineProperty(exports, "__esModule", {
  value: true
});
exports.EventEmitterMQ = undefined;

var _createClass = function () { function defineProperties(target, props) { for (var i = 0; i < props.length; i++) { var descriptor = props[i]; descriptor.enumerable = descriptor.enumerable || false; descriptor.configurable = true; if ("value" in descriptor) descriptor.writable = true; Object.defineProperty(target, descriptor.key, descriptor); } } return function (Constructor, protoProps, staticProps) { if (protoProps) defineProperties(Constructor.prototype, protoProps); if (staticProps) defineProperties(Constructor, staticProps); return Constructor; }; }();

var _events = require('events');

var _events2 = _interopRequireDefault(_events);

function _interopRequireDefault(obj) { return obj && obj.__esModule ? obj : { default: obj }; }

function _possibleConstructorReturn(self, call) { if (!self) { throw new ReferenceError("this hasn't been initialised - super() hasn't been called"); } return call && (typeof call === "object" || typeof call === "function") ? call : self; }

function _inherits(subClass, superClass) { if (typeof superClass !== "function" && superClass !== null) { throw new TypeError("Super expression must either be null or a function, not " + typeof superClass); } subClass.prototype = Object.create(superClass && superClass.prototype, { constructor: { value: subClass, enumerable: false, writable: true, configurable: true } }); if (superClass) Object.setPrototypeOf ? Object.setPrototypeOf(subClass, superClass) : subClass.__proto__ = superClass; }

function _classCallCheck(instance, Constructor) { if (!(instance instanceof Constructor)) { throw new TypeError("Cannot call a class as a function"); } }

var emitter = new _events2.default.EventEmitter();
var subscriptions = new Map();

function _unsubscribe(channel) {
  if (!subscriptions.has(channel)) {
    //console.log('No channel to unsub from');
    return;
  }
  //console.log('unsub ', channel);
  emitter.removeListener(channel, subscriptions.get(channel));
  subscriptions.delete(channel);
}

var Publisher = function () {
  function Publisher(emitter) {
    _classCallCheck(this, Publisher);

    this.emitter = emitter;
  }

  _createClass(Publisher, [{
    key: 'publish',
    value: function publish(channel, message) {
      this.emitter.emit(channel, message);
    }
  }]);

  return Publisher;
}();

var Consumer = function (_events$EventEmitter) {
  _inherits(Consumer, _events$EventEmitter);

  function Consumer(emitter) {
    _classCallCheck(this, Consumer);

    var _this = _possibleConstructorReturn(this, (Consumer.__proto__ || Object.getPrototypeOf(Consumer)).call(this));

    _this.emitter = emitter;
    return _this;
  }

  _createClass(Consumer, [{
    key: 'subscribe',
    value: function subscribe(channel) {
      var _this2 = this;

      _unsubscribe(channel);
      var handler = function handler(message) {
        _this2.emit('message', channel, message);
      };
      subscriptions.set(channel, handler);
      this.emitter.on(channel, handler);
    }
  }, {
    key: 'unsubscribe',
    value: function unsubscribe(channel) {
      _unsubscribe(channel);
    }
  }]);

  return Consumer;
}(_events2.default.EventEmitter);

function createPublisher() {
  return new Publisher(emitter);
}

function createSubscriber() {
  return new Consumer(emitter);
}

var EventEmitterMQ = {
  createPublisher: createPublisher,
  createSubscriber: createSubscriber
};

exports.EventEmitterMQ = EventEmitterMQ;