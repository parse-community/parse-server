'use strict';

Object.defineProperty(exports, "__esModule", {
  value: true
});
exports.EventEmitterPubSub = undefined;

var _createClass = function () { function defineProperties(target, props) { for (var i = 0; i < props.length; i++) { var descriptor = props[i]; descriptor.enumerable = descriptor.enumerable || false; descriptor.configurable = true; if ("value" in descriptor) descriptor.writable = true; Object.defineProperty(target, descriptor.key, descriptor); } } return function (Constructor, protoProps, staticProps) { if (protoProps) defineProperties(Constructor.prototype, protoProps); if (staticProps) defineProperties(Constructor, staticProps); return Constructor; }; }();

var _events = require('events');

var _events2 = _interopRequireDefault(_events);

function _interopRequireDefault(obj) { return obj && obj.__esModule ? obj : { default: obj }; }

function _possibleConstructorReturn(self, call) { if (!self) { throw new ReferenceError("this hasn't been initialised - super() hasn't been called"); } return call && (typeof call === "object" || typeof call === "function") ? call : self; }

function _inherits(subClass, superClass) { if (typeof superClass !== "function" && superClass !== null) { throw new TypeError("Super expression must either be null or a function, not " + typeof superClass); } subClass.prototype = Object.create(superClass && superClass.prototype, { constructor: { value: subClass, enumerable: false, writable: true, configurable: true } }); if (superClass) Object.setPrototypeOf ? Object.setPrototypeOf(subClass, superClass) : subClass.__proto__ = superClass; }

function _classCallCheck(instance, Constructor) { if (!(instance instanceof Constructor)) { throw new TypeError("Cannot call a class as a function"); } }

var emitter = new _events2.default.EventEmitter();

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

var Subscriber = function (_events$EventEmitter) {
  _inherits(Subscriber, _events$EventEmitter);

  function Subscriber(emitter) {
    _classCallCheck(this, Subscriber);

    var _this = _possibleConstructorReturn(this, (Subscriber.__proto__ || Object.getPrototypeOf(Subscriber)).call(this));

    _this.emitter = emitter;
    _this.subscriptions = new Map();
    return _this;
  }

  _createClass(Subscriber, [{
    key: 'subscribe',
    value: function subscribe(channel) {
      var _this2 = this;

      var handler = function handler(message) {
        _this2.emit('message', channel, message);
      };
      this.subscriptions.set(channel, handler);
      this.emitter.on(channel, handler);
    }
  }, {
    key: 'unsubscribe',
    value: function unsubscribe(channel) {
      if (!this.subscriptions.has(channel)) {
        return;
      }
      this.emitter.removeListener(channel, this.subscriptions.get(channel));
      this.subscriptions.delete(channel);
    }
  }]);

  return Subscriber;
}(_events2.default.EventEmitter);

function createPublisher() {
  return new Publisher(emitter);
}

function createSubscriber() {
  return new Subscriber(emitter);
}

var EventEmitterPubSub = {
  createPublisher: createPublisher,
  createSubscriber: createSubscriber
};

exports.EventEmitterPubSub = EventEmitterPubSub;