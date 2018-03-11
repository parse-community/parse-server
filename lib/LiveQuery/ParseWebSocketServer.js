'use strict';

Object.defineProperty(exports, "__esModule", {
  value: true
});
exports.ParseWebSocket = exports.ParseWebSocketServer = undefined;

var _logger = require('../logger');

var _logger2 = _interopRequireDefault(_logger);

function _interopRequireDefault(obj) { return obj && obj.__esModule ? obj : { default: obj }; }

const typeMap = new Map([['disconnect', 'close']]);
const getWS = function () {
  try {
    return require('uws');
  } catch (e) {
    return require('ws');
  }
};

class ParseWebSocketServer {

  constructor(server, onConnect, websocketTimeout = 10 * 1000) {
    const WebSocketServer = getWS().Server;
    const wss = new WebSocketServer({ server: server });
    wss.on('listening', () => {
      _logger2.default.info('Parse LiveQuery Server starts running');
    });
    wss.on('connection', ws => {
      onConnect(new ParseWebSocket(ws));
      // Send ping to client periodically
      const pingIntervalId = setInterval(() => {
        if (ws.readyState == ws.OPEN) {
          ws.ping();
        } else {
          clearInterval(pingIntervalId);
        }
      }, websocketTimeout);
    });
    this.server = wss;
  }
}

exports.ParseWebSocketServer = ParseWebSocketServer;
class ParseWebSocket {

  constructor(ws) {
    this.ws = ws;
  }

  on(type, callback) {
    const wsType = typeMap.has(type) ? typeMap.get(type) : type;
    this.ws.on(wsType, callback);
  }

  send(message) {
    this.ws.send(message);
  }
}
exports.ParseWebSocket = ParseWebSocket;