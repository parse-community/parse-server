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
      ws.on('error', error => {
        _logger.default.error(error.message);

        _logger.default.error(JSON.stringify(ws));
      });
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
//# sourceMappingURL=data:application/json;charset=utf-8;base64,eyJ2ZXJzaW9uIjozLCJzb3VyY2VzIjpbIi4uLy4uL3NyYy9MaXZlUXVlcnkvUGFyc2VXZWJTb2NrZXRTZXJ2ZXIuanMiXSwibmFtZXMiOlsiUGFyc2VXZWJTb2NrZXRTZXJ2ZXIiLCJjb25zdHJ1Y3RvciIsInNlcnZlciIsIm9uQ29ubmVjdCIsImNvbmZpZyIsIndzcyIsIndzc0FkYXB0ZXIiLCJXU0FkYXB0ZXIiLCJvbkxpc3RlbiIsImxvZ2dlciIsImluZm8iLCJvbkNvbm5lY3Rpb24iLCJ3cyIsIm9uIiwiZXJyb3IiLCJtZXNzYWdlIiwiSlNPTiIsInN0cmluZ2lmeSIsIlBhcnNlV2ViU29ja2V0IiwicGluZ0ludGVydmFsSWQiLCJzZXRJbnRlcnZhbCIsInJlYWR5U3RhdGUiLCJPUEVOIiwicGluZyIsImNsZWFySW50ZXJ2YWwiLCJ3ZWJzb2NrZXRUaW1lb3V0Iiwib25FcnJvciIsInN0YXJ0IiwiY2xvc2UiLCJldmVudHMiLCJFdmVudEVtaXR0ZXIiLCJvbm1lc3NhZ2UiLCJyZXF1ZXN0IiwiZW1pdCIsImRhdGEiLCJvbmNsb3NlIiwic2VuZCJdLCJtYXBwaW5ncyI6Ijs7Ozs7OztBQUFBOztBQUNBOztBQUNBOztBQUNBOzs7O0FBRU8sTUFBTUEsb0JBQU4sQ0FBMkI7QUFHaENDLEVBQUFBLFdBQVcsQ0FBQ0MsTUFBRCxFQUFjQyxTQUFkLEVBQW1DQyxNQUFuQyxFQUEyQztBQUNwREEsSUFBQUEsTUFBTSxDQUFDRixNQUFQLEdBQWdCQSxNQUFoQjtBQUNBLFVBQU1HLEdBQUcsR0FBRyxnQ0FBWUQsTUFBTSxDQUFDRSxVQUFuQixFQUErQkMsb0JBQS9CLEVBQTBDSCxNQUExQyxDQUFaOztBQUNBQyxJQUFBQSxHQUFHLENBQUNHLFFBQUosR0FBZSxNQUFNO0FBQ25CQyxzQkFBT0MsSUFBUCxDQUFZLHVDQUFaO0FBQ0QsS0FGRDs7QUFHQUwsSUFBQUEsR0FBRyxDQUFDTSxZQUFKLEdBQW1CQyxFQUFFLElBQUk7QUFDdkJBLE1BQUFBLEVBQUUsQ0FBQ0MsRUFBSCxDQUFNLE9BQU4sRUFBZUMsS0FBSyxJQUFJO0FBQ3RCTCx3QkFBT0ssS0FBUCxDQUFhQSxLQUFLLENBQUNDLE9BQW5COztBQUNBTix3QkFBT0ssS0FBUCxDQUFhRSxJQUFJLENBQUNDLFNBQUwsQ0FBZUwsRUFBZixDQUFiO0FBQ0QsT0FIRDtBQUlBVCxNQUFBQSxTQUFTLENBQUMsSUFBSWUsY0FBSixDQUFtQk4sRUFBbkIsQ0FBRCxDQUFULENBTHVCLENBTXZCOztBQUNBLFlBQU1PLGNBQWMsR0FBR0MsV0FBVyxDQUFDLE1BQU07QUFDdkMsWUFBSVIsRUFBRSxDQUFDUyxVQUFILElBQWlCVCxFQUFFLENBQUNVLElBQXhCLEVBQThCO0FBQzVCVixVQUFBQSxFQUFFLENBQUNXLElBQUg7QUFDRCxTQUZELE1BRU87QUFDTEMsVUFBQUEsYUFBYSxDQUFDTCxjQUFELENBQWI7QUFDRDtBQUNGLE9BTmlDLEVBTS9CZixNQUFNLENBQUNxQixnQkFBUCxJQUEyQixLQUFLLElBTkQsQ0FBbEM7QUFPRCxLQWREOztBQWVBcEIsSUFBQUEsR0FBRyxDQUFDcUIsT0FBSixHQUFjWixLQUFLLElBQUk7QUFDckJMLHNCQUFPSyxLQUFQLENBQWFBLEtBQWI7QUFDRCxLQUZEOztBQUdBVCxJQUFBQSxHQUFHLENBQUNzQixLQUFKO0FBQ0EsU0FBS3pCLE1BQUwsR0FBY0csR0FBZDtBQUNEOztBQUVEdUIsRUFBQUEsS0FBSyxHQUFHO0FBQ04sUUFBSSxLQUFLMUIsTUFBTCxJQUFlLEtBQUtBLE1BQUwsQ0FBWTBCLEtBQS9CLEVBQXNDO0FBQ3BDLFdBQUsxQixNQUFMLENBQVkwQixLQUFaO0FBQ0Q7QUFDRjs7QUFuQytCOzs7O0FBc0MzQixNQUFNVixjQUFOLFNBQTZCVyxnQkFBT0MsWUFBcEMsQ0FBaUQ7QUFHdEQ3QixFQUFBQSxXQUFXLENBQUNXLEVBQUQsRUFBVTtBQUNuQjs7QUFDQUEsSUFBQUEsRUFBRSxDQUFDbUIsU0FBSCxHQUFlQyxPQUFPLElBQ3BCLEtBQUtDLElBQUwsQ0FBVSxTQUFWLEVBQXFCRCxPQUFPLElBQUlBLE9BQU8sQ0FBQ0UsSUFBbkIsR0FBMEJGLE9BQU8sQ0FBQ0UsSUFBbEMsR0FBeUNGLE9BQTlELENBREY7O0FBRUFwQixJQUFBQSxFQUFFLENBQUN1QixPQUFILEdBQWEsTUFBTSxLQUFLRixJQUFMLENBQVUsWUFBVixDQUFuQjs7QUFDQSxTQUFLckIsRUFBTCxHQUFVQSxFQUFWO0FBQ0Q7O0FBRUR3QixFQUFBQSxJQUFJLENBQUNyQixPQUFELEVBQXFCO0FBQ3ZCLFNBQUtILEVBQUwsQ0FBUXdCLElBQVIsQ0FBYXJCLE9BQWI7QUFDRDs7QUFicUQiLCJzb3VyY2VzQ29udGVudCI6WyJpbXBvcnQgeyBsb2FkQWRhcHRlciB9IGZyb20gJy4uL0FkYXB0ZXJzL0FkYXB0ZXJMb2FkZXInO1xuaW1wb3J0IHsgV1NBZGFwdGVyIH0gZnJvbSAnLi4vQWRhcHRlcnMvV2ViU29ja2V0U2VydmVyL1dTQWRhcHRlcic7XG5pbXBvcnQgbG9nZ2VyIGZyb20gJy4uL2xvZ2dlcic7XG5pbXBvcnQgZXZlbnRzIGZyb20gJ2V2ZW50cyc7XG5cbmV4cG9ydCBjbGFzcyBQYXJzZVdlYlNvY2tldFNlcnZlciB7XG4gIHNlcnZlcjogT2JqZWN0O1xuXG4gIGNvbnN0cnVjdG9yKHNlcnZlcjogYW55LCBvbkNvbm5lY3Q6IEZ1bmN0aW9uLCBjb25maWcpIHtcbiAgICBjb25maWcuc2VydmVyID0gc2VydmVyO1xuICAgIGNvbnN0IHdzcyA9IGxvYWRBZGFwdGVyKGNvbmZpZy53c3NBZGFwdGVyLCBXU0FkYXB0ZXIsIGNvbmZpZyk7XG4gICAgd3NzLm9uTGlzdGVuID0gKCkgPT4ge1xuICAgICAgbG9nZ2VyLmluZm8oJ1BhcnNlIExpdmVRdWVyeSBTZXJ2ZXIgc3RhcnRzIHJ1bm5pbmcnKTtcbiAgICB9O1xuICAgIHdzcy5vbkNvbm5lY3Rpb24gPSB3cyA9PiB7XG4gICAgICB3cy5vbignZXJyb3InLCBlcnJvciA9PiB7XG4gICAgICAgIGxvZ2dlci5lcnJvcihlcnJvci5tZXNzYWdlKTtcbiAgICAgICAgbG9nZ2VyLmVycm9yKEpTT04uc3RyaW5naWZ5KHdzKSk7XG4gICAgICB9KTtcbiAgICAgIG9uQ29ubmVjdChuZXcgUGFyc2VXZWJTb2NrZXQod3MpKTtcbiAgICAgIC8vIFNlbmQgcGluZyB0byBjbGllbnQgcGVyaW9kaWNhbGx5XG4gICAgICBjb25zdCBwaW5nSW50ZXJ2YWxJZCA9IHNldEludGVydmFsKCgpID0+IHtcbiAgICAgICAgaWYgKHdzLnJlYWR5U3RhdGUgPT0gd3MuT1BFTikge1xuICAgICAgICAgIHdzLnBpbmcoKTtcbiAgICAgICAgfSBlbHNlIHtcbiAgICAgICAgICBjbGVhckludGVydmFsKHBpbmdJbnRlcnZhbElkKTtcbiAgICAgICAgfVxuICAgICAgfSwgY29uZmlnLndlYnNvY2tldFRpbWVvdXQgfHwgMTAgKiAxMDAwKTtcbiAgICB9O1xuICAgIHdzcy5vbkVycm9yID0gZXJyb3IgPT4ge1xuICAgICAgbG9nZ2VyLmVycm9yKGVycm9yKTtcbiAgICB9O1xuICAgIHdzcy5zdGFydCgpO1xuICAgIHRoaXMuc2VydmVyID0gd3NzO1xuICB9XG5cbiAgY2xvc2UoKSB7XG4gICAgaWYgKHRoaXMuc2VydmVyICYmIHRoaXMuc2VydmVyLmNsb3NlKSB7XG4gICAgICB0aGlzLnNlcnZlci5jbG9zZSgpO1xuICAgIH1cbiAgfVxufVxuXG5leHBvcnQgY2xhc3MgUGFyc2VXZWJTb2NrZXQgZXh0ZW5kcyBldmVudHMuRXZlbnRFbWl0dGVyIHtcbiAgd3M6IGFueTtcblxuICBjb25zdHJ1Y3Rvcih3czogYW55KSB7XG4gICAgc3VwZXIoKTtcbiAgICB3cy5vbm1lc3NhZ2UgPSByZXF1ZXN0ID0+XG4gICAgICB0aGlzLmVtaXQoJ21lc3NhZ2UnLCByZXF1ZXN0ICYmIHJlcXVlc3QuZGF0YSA/IHJlcXVlc3QuZGF0YSA6IHJlcXVlc3QpO1xuICAgIHdzLm9uY2xvc2UgPSAoKSA9PiB0aGlzLmVtaXQoJ2Rpc2Nvbm5lY3QnKTtcbiAgICB0aGlzLndzID0gd3M7XG4gIH1cblxuICBzZW5kKG1lc3NhZ2U6IGFueSk6IHZvaWQge1xuICAgIHRoaXMud3Muc2VuZChtZXNzYWdlKTtcbiAgfVxufVxuIl19