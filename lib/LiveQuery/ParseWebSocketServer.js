"use strict";

Object.defineProperty(exports, "__esModule", {
  value: true
});
exports.ParseWebSocket = exports.ParseWebSocketServer = void 0;

var _AdapterLoader = require("../Adapters/AdapterLoader");

var _WSAdapter = require("../Adapters/WebSocketServer/WSAdapter");

var _logger = _interopRequireDefault(require("../logger"));

var _events = _interopRequireDefault(require("events"));

function _interopRequireDefault(obj) { return obj && obj.__esModule ? obj : { default: obj }; }

class ParseWebSocketServer {
  constructor(server, onConnect, config) {
    config.server = server;
    const wss = (0, _AdapterLoader.loadAdapter)(config.wssAdapter, _WSAdapter.WSAdapter, config);

    wss.onListen = () => {
      _logger.default.info('Parse LiveQuery Server starts running');
    };

    wss.onConnection = ws => {
      onConnect(new ParseWebSocket(ws)); // Send ping to client periodically

      const pingIntervalId = setInterval(() => {
        if (ws.readyState == ws.OPEN) {
          ws.ping();
        } else {
          clearInterval(pingIntervalId);
        }
      }, config.websocketTimeout || 10 * 1000);
    };

    wss.onError = error => {
      _logger.default.error(error);
    };

    wss.start();
    this.server = wss;
  }

  close() {
    if (this.server && this.server.close) {
      this.server.close();
    }
  }

}

exports.ParseWebSocketServer = ParseWebSocketServer;

class ParseWebSocket extends _events.default.EventEmitter {
  constructor(ws) {
    super();

    ws.onmessage = request => this.emit('message', request && request.data ? request.data : request);

    ws.onclose = () => this.emit('disconnect');

    this.ws = ws;
  }

  send(message) {
    this.ws.send(message);
  }

}

exports.ParseWebSocket = ParseWebSocket;
//# sourceMappingURL=data:application/json;charset=utf-8;base64,eyJ2ZXJzaW9uIjozLCJzb3VyY2VzIjpbIi4uLy4uL3NyYy9MaXZlUXVlcnkvUGFyc2VXZWJTb2NrZXRTZXJ2ZXIuanMiXSwibmFtZXMiOlsiUGFyc2VXZWJTb2NrZXRTZXJ2ZXIiLCJjb25zdHJ1Y3RvciIsInNlcnZlciIsIm9uQ29ubmVjdCIsImNvbmZpZyIsIndzcyIsIndzc0FkYXB0ZXIiLCJXU0FkYXB0ZXIiLCJvbkxpc3RlbiIsImxvZ2dlciIsImluZm8iLCJvbkNvbm5lY3Rpb24iLCJ3cyIsIlBhcnNlV2ViU29ja2V0IiwicGluZ0ludGVydmFsSWQiLCJzZXRJbnRlcnZhbCIsInJlYWR5U3RhdGUiLCJPUEVOIiwicGluZyIsImNsZWFySW50ZXJ2YWwiLCJ3ZWJzb2NrZXRUaW1lb3V0Iiwib25FcnJvciIsImVycm9yIiwic3RhcnQiLCJjbG9zZSIsImV2ZW50cyIsIkV2ZW50RW1pdHRlciIsIm9ubWVzc2FnZSIsInJlcXVlc3QiLCJlbWl0IiwiZGF0YSIsIm9uY2xvc2UiLCJzZW5kIiwibWVzc2FnZSJdLCJtYXBwaW5ncyI6Ijs7Ozs7OztBQUFBOztBQUNBOztBQUNBOztBQUNBOzs7O0FBRU8sTUFBTUEsb0JBQU4sQ0FBMkI7QUFHaENDLEVBQUFBLFdBQVcsQ0FBQ0MsTUFBRCxFQUFjQyxTQUFkLEVBQW1DQyxNQUFuQyxFQUEyQztBQUNwREEsSUFBQUEsTUFBTSxDQUFDRixNQUFQLEdBQWdCQSxNQUFoQjtBQUNBLFVBQU1HLEdBQUcsR0FBRyxnQ0FBWUQsTUFBTSxDQUFDRSxVQUFuQixFQUErQkMsb0JBQS9CLEVBQTBDSCxNQUExQyxDQUFaOztBQUNBQyxJQUFBQSxHQUFHLENBQUNHLFFBQUosR0FBZSxNQUFNO0FBQ25CQyxzQkFBT0MsSUFBUCxDQUFZLHVDQUFaO0FBQ0QsS0FGRDs7QUFHQUwsSUFBQUEsR0FBRyxDQUFDTSxZQUFKLEdBQW1CQyxFQUFFLElBQUk7QUFDdkJULE1BQUFBLFNBQVMsQ0FBQyxJQUFJVSxjQUFKLENBQW1CRCxFQUFuQixDQUFELENBQVQsQ0FEdUIsQ0FFdkI7O0FBQ0EsWUFBTUUsY0FBYyxHQUFHQyxXQUFXLENBQUMsTUFBTTtBQUN2QyxZQUFJSCxFQUFFLENBQUNJLFVBQUgsSUFBaUJKLEVBQUUsQ0FBQ0ssSUFBeEIsRUFBOEI7QUFDNUJMLFVBQUFBLEVBQUUsQ0FBQ00sSUFBSDtBQUNELFNBRkQsTUFFTztBQUNMQyxVQUFBQSxhQUFhLENBQUNMLGNBQUQsQ0FBYjtBQUNEO0FBQ0YsT0FOaUMsRUFNL0JWLE1BQU0sQ0FBQ2dCLGdCQUFQLElBQTJCLEtBQUssSUFORCxDQUFsQztBQU9ELEtBVkQ7O0FBV0FmLElBQUFBLEdBQUcsQ0FBQ2dCLE9BQUosR0FBY0MsS0FBSyxJQUFJO0FBQ3JCYixzQkFBT2EsS0FBUCxDQUFhQSxLQUFiO0FBQ0QsS0FGRDs7QUFHQWpCLElBQUFBLEdBQUcsQ0FBQ2tCLEtBQUo7QUFDQSxTQUFLckIsTUFBTCxHQUFjRyxHQUFkO0FBQ0Q7O0FBRURtQixFQUFBQSxLQUFLLEdBQUc7QUFDTixRQUFJLEtBQUt0QixNQUFMLElBQWUsS0FBS0EsTUFBTCxDQUFZc0IsS0FBL0IsRUFBc0M7QUFDcEMsV0FBS3RCLE1BQUwsQ0FBWXNCLEtBQVo7QUFDRDtBQUNGOztBQS9CK0I7Ozs7QUFrQzNCLE1BQU1YLGNBQU4sU0FBNkJZLGdCQUFPQyxZQUFwQyxDQUFpRDtBQUd0RHpCLEVBQUFBLFdBQVcsQ0FBQ1csRUFBRCxFQUFVO0FBQ25COztBQUNBQSxJQUFBQSxFQUFFLENBQUNlLFNBQUgsR0FBZUMsT0FBTyxJQUNwQixLQUFLQyxJQUFMLENBQVUsU0FBVixFQUFxQkQsT0FBTyxJQUFJQSxPQUFPLENBQUNFLElBQW5CLEdBQTBCRixPQUFPLENBQUNFLElBQWxDLEdBQXlDRixPQUE5RCxDQURGOztBQUVBaEIsSUFBQUEsRUFBRSxDQUFDbUIsT0FBSCxHQUFhLE1BQU0sS0FBS0YsSUFBTCxDQUFVLFlBQVYsQ0FBbkI7O0FBQ0EsU0FBS2pCLEVBQUwsR0FBVUEsRUFBVjtBQUNEOztBQUVEb0IsRUFBQUEsSUFBSSxDQUFDQyxPQUFELEVBQXFCO0FBQ3ZCLFNBQUtyQixFQUFMLENBQVFvQixJQUFSLENBQWFDLE9BQWI7QUFDRDs7QUFicUQiLCJzb3VyY2VzQ29udGVudCI6WyJpbXBvcnQgeyBsb2FkQWRhcHRlciB9IGZyb20gJy4uL0FkYXB0ZXJzL0FkYXB0ZXJMb2FkZXInO1xuaW1wb3J0IHsgV1NBZGFwdGVyIH0gZnJvbSAnLi4vQWRhcHRlcnMvV2ViU29ja2V0U2VydmVyL1dTQWRhcHRlcic7XG5pbXBvcnQgbG9nZ2VyIGZyb20gJy4uL2xvZ2dlcic7XG5pbXBvcnQgZXZlbnRzIGZyb20gJ2V2ZW50cyc7XG5cbmV4cG9ydCBjbGFzcyBQYXJzZVdlYlNvY2tldFNlcnZlciB7XG4gIHNlcnZlcjogT2JqZWN0O1xuXG4gIGNvbnN0cnVjdG9yKHNlcnZlcjogYW55LCBvbkNvbm5lY3Q6IEZ1bmN0aW9uLCBjb25maWcpIHtcbiAgICBjb25maWcuc2VydmVyID0gc2VydmVyO1xuICAgIGNvbnN0IHdzcyA9IGxvYWRBZGFwdGVyKGNvbmZpZy53c3NBZGFwdGVyLCBXU0FkYXB0ZXIsIGNvbmZpZyk7XG4gICAgd3NzLm9uTGlzdGVuID0gKCkgPT4ge1xuICAgICAgbG9nZ2VyLmluZm8oJ1BhcnNlIExpdmVRdWVyeSBTZXJ2ZXIgc3RhcnRzIHJ1bm5pbmcnKTtcbiAgICB9O1xuICAgIHdzcy5vbkNvbm5lY3Rpb24gPSB3cyA9PiB7XG4gICAgICBvbkNvbm5lY3QobmV3IFBhcnNlV2ViU29ja2V0KHdzKSk7XG4gICAgICAvLyBTZW5kIHBpbmcgdG8gY2xpZW50IHBlcmlvZGljYWxseVxuICAgICAgY29uc3QgcGluZ0ludGVydmFsSWQgPSBzZXRJbnRlcnZhbCgoKSA9PiB7XG4gICAgICAgIGlmICh3cy5yZWFkeVN0YXRlID09IHdzLk9QRU4pIHtcbiAgICAgICAgICB3cy5waW5nKCk7XG4gICAgICAgIH0gZWxzZSB7XG4gICAgICAgICAgY2xlYXJJbnRlcnZhbChwaW5nSW50ZXJ2YWxJZCk7XG4gICAgICAgIH1cbiAgICAgIH0sIGNvbmZpZy53ZWJzb2NrZXRUaW1lb3V0IHx8IDEwICogMTAwMCk7XG4gICAgfTtcbiAgICB3c3Mub25FcnJvciA9IGVycm9yID0+IHtcbiAgICAgIGxvZ2dlci5lcnJvcihlcnJvcik7XG4gICAgfTtcbiAgICB3c3Muc3RhcnQoKTtcbiAgICB0aGlzLnNlcnZlciA9IHdzcztcbiAgfVxuXG4gIGNsb3NlKCkge1xuICAgIGlmICh0aGlzLnNlcnZlciAmJiB0aGlzLnNlcnZlci5jbG9zZSkge1xuICAgICAgdGhpcy5zZXJ2ZXIuY2xvc2UoKTtcbiAgICB9XG4gIH1cbn1cblxuZXhwb3J0IGNsYXNzIFBhcnNlV2ViU29ja2V0IGV4dGVuZHMgZXZlbnRzLkV2ZW50RW1pdHRlciB7XG4gIHdzOiBhbnk7XG5cbiAgY29uc3RydWN0b3Iod3M6IGFueSkge1xuICAgIHN1cGVyKCk7XG4gICAgd3Mub25tZXNzYWdlID0gcmVxdWVzdCA9PlxuICAgICAgdGhpcy5lbWl0KCdtZXNzYWdlJywgcmVxdWVzdCAmJiByZXF1ZXN0LmRhdGEgPyByZXF1ZXN0LmRhdGEgOiByZXF1ZXN0KTtcbiAgICB3cy5vbmNsb3NlID0gKCkgPT4gdGhpcy5lbWl0KCdkaXNjb25uZWN0Jyk7XG4gICAgdGhpcy53cyA9IHdzO1xuICB9XG5cbiAgc2VuZChtZXNzYWdlOiBhbnkpOiB2b2lkIHtcbiAgICB0aGlzLndzLnNlbmQobWVzc2FnZSk7XG4gIH1cbn1cbiJdfQ==