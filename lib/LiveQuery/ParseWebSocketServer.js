'use strict';

Object.defineProperty(exports, "__esModule", {
  value: true
});
exports.ParseWebSocket = exports.ParseWebSocketServer = undefined;

var _createClass = function () { function defineProperties(target, props) { for (var i = 0; i < props.length; i++) { var descriptor = props[i]; descriptor.enumerable = descriptor.enumerable || false; descriptor.configurable = true; if ("value" in descriptor) descriptor.writable = true; Object.defineProperty(target, descriptor.key, descriptor); } } return function (Constructor, protoProps, staticProps) { if (protoProps) defineProperties(Constructor.prototype, protoProps); if (staticProps) defineProperties(Constructor, staticProps); return Constructor; }; }();

var _logger = require('../logger');

var _logger2 = _interopRequireDefault(_logger);

function _interopRequireDefault(obj) { return obj && obj.__esModule ? obj : { default: obj }; }

function _classCallCheck(instance, Constructor) { if (!(instance instanceof Constructor)) { throw new TypeError("Cannot call a class as a function"); } }

var typeMap = new Map([['disconnect', 'close']]);
var getWS = function getWS() {
  try {
    return require('uws');
  } catch (e) {
    return require('ws');
  }
};

var ParseWebSocketServer = exports.ParseWebSocketServer = function ParseWebSocketServer(server, onConnect) {
  var websocketTimeout = arguments.length > 2 && arguments[2] !== undefined ? arguments[2] : 10 * 1000;

  _classCallCheck(this, ParseWebSocketServer);

  var WebSocketServer = getWS().Server;
  var wss = new WebSocketServer({ server: server });
  wss.on('listening', function () {
    _logger2.default.info('Parse LiveQuery Server starts running');
  });
  wss.on('connection', function (ws) {
    onConnect(new ParseWebSocket(ws));
    // Send ping to client periodically
    var pingIntervalId = setInterval(function () {
      if (ws.readyState == ws.OPEN) {
        ws.ping();
      } else {
        clearInterval(pingIntervalId);
      }
    }, websocketTimeout);
  });
  this.server = wss;
};

var ParseWebSocket = exports.ParseWebSocket = function () {
  function ParseWebSocket(ws) {
    _classCallCheck(this, ParseWebSocket);

    this.ws = ws;
  }

  _createClass(ParseWebSocket, [{
    key: 'on',
    value: function on(type, callback) {
      var wsType = typeMap.has(type) ? typeMap.get(type) : type;
      this.ws.on(wsType, callback);
    }
  }, {
    key: 'send',
    value: function send(message) {
      this.ws.send(message);
    }
  }]);

  return ParseWebSocket;
}();