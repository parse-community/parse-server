"use strict";

Object.defineProperty(exports, "__esModule", {
  value: true
});
exports.ParseWebSocketServer = exports.ParseWebSocket = void 0;
var _AdapterLoader = require("../Adapters/AdapterLoader");
var _WSAdapter = require("../Adapters/WebSocketServer/WSAdapter");
var _logger = _interopRequireDefault(require("../logger"));
var _events = _interopRequireDefault(require("events"));
var _util = require("util");
function _interopRequireDefault(obj) { return obj && obj.__esModule ? obj : { default: obj }; }
class ParseWebSocketServer {
  constructor(server, onConnect, config) {
    config.server = server;
    const wss = (0, _AdapterLoader.loadAdapter)(config.wssAdapter, _WSAdapter.WSAdapter, config);
    wss.onListen = () => {
      _logger.default.info('Parse LiveQuery Server started running');
    };
    wss.onConnection = ws => {
      ws.waitingForPong = false;
      ws.on('pong', () => {
        ws.waitingForPong = false;
      });
      ws.on('error', error => {
        _logger.default.error(error.message);
        _logger.default.error((0, _util.inspect)(ws, false));
      });
      onConnect(new ParseWebSocket(ws));
      // Send ping to client periodically
      const pingIntervalId = setInterval(() => {
        if (!ws.waitingForPong) {
          ws.ping();
          ws.waitingForPong = true;
        } else {
          clearInterval(pingIntervalId);
          ws.terminate();
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
//# sourceMappingURL=data:application/json;charset=utf-8;base64,eyJ2ZXJzaW9uIjozLCJuYW1lcyI6WyJQYXJzZVdlYlNvY2tldFNlcnZlciIsImNvbnN0cnVjdG9yIiwic2VydmVyIiwib25Db25uZWN0IiwiY29uZmlnIiwid3NzIiwibG9hZEFkYXB0ZXIiLCJ3c3NBZGFwdGVyIiwiV1NBZGFwdGVyIiwib25MaXN0ZW4iLCJsb2dnZXIiLCJpbmZvIiwib25Db25uZWN0aW9uIiwid3MiLCJ3YWl0aW5nRm9yUG9uZyIsIm9uIiwiZXJyb3IiLCJtZXNzYWdlIiwiaW5zcGVjdCIsIlBhcnNlV2ViU29ja2V0IiwicGluZ0ludGVydmFsSWQiLCJzZXRJbnRlcnZhbCIsInBpbmciLCJjbGVhckludGVydmFsIiwidGVybWluYXRlIiwid2Vic29ja2V0VGltZW91dCIsIm9uRXJyb3IiLCJzdGFydCIsImNsb3NlIiwiZXZlbnRzIiwiRXZlbnRFbWl0dGVyIiwib25tZXNzYWdlIiwicmVxdWVzdCIsImVtaXQiLCJkYXRhIiwib25jbG9zZSIsInNlbmQiXSwic291cmNlcyI6WyIuLi8uLi9zcmMvTGl2ZVF1ZXJ5L1BhcnNlV2ViU29ja2V0U2VydmVyLmpzIl0sInNvdXJjZXNDb250ZW50IjpbImltcG9ydCB7IGxvYWRBZGFwdGVyIH0gZnJvbSAnLi4vQWRhcHRlcnMvQWRhcHRlckxvYWRlcic7XG5pbXBvcnQgeyBXU0FkYXB0ZXIgfSBmcm9tICcuLi9BZGFwdGVycy9XZWJTb2NrZXRTZXJ2ZXIvV1NBZGFwdGVyJztcbmltcG9ydCBsb2dnZXIgZnJvbSAnLi4vbG9nZ2VyJztcbmltcG9ydCBldmVudHMgZnJvbSAnZXZlbnRzJztcbmltcG9ydCB7IGluc3BlY3QgfSBmcm9tICd1dGlsJztcblxuZXhwb3J0IGNsYXNzIFBhcnNlV2ViU29ja2V0U2VydmVyIHtcbiAgc2VydmVyOiBPYmplY3Q7XG5cbiAgY29uc3RydWN0b3Ioc2VydmVyOiBhbnksIG9uQ29ubmVjdDogRnVuY3Rpb24sIGNvbmZpZykge1xuICAgIGNvbmZpZy5zZXJ2ZXIgPSBzZXJ2ZXI7XG4gICAgY29uc3Qgd3NzID0gbG9hZEFkYXB0ZXIoY29uZmlnLndzc0FkYXB0ZXIsIFdTQWRhcHRlciwgY29uZmlnKTtcbiAgICB3c3Mub25MaXN0ZW4gPSAoKSA9PiB7XG4gICAgICBsb2dnZXIuaW5mbygnUGFyc2UgTGl2ZVF1ZXJ5IFNlcnZlciBzdGFydGVkIHJ1bm5pbmcnKTtcbiAgICB9O1xuICAgIHdzcy5vbkNvbm5lY3Rpb24gPSB3cyA9PiB7XG4gICAgICB3cy53YWl0aW5nRm9yUG9uZyA9IGZhbHNlO1xuICAgICAgd3Mub24oJ3BvbmcnLCAoKSA9PiB7XG4gICAgICAgIHdzLndhaXRpbmdGb3JQb25nID0gZmFsc2U7XG4gICAgICB9KTtcbiAgICAgIHdzLm9uKCdlcnJvcicsIGVycm9yID0+IHtcbiAgICAgICAgbG9nZ2VyLmVycm9yKGVycm9yLm1lc3NhZ2UpO1xuICAgICAgICBsb2dnZXIuZXJyb3IoaW5zcGVjdCh3cywgZmFsc2UpKTtcbiAgICAgIH0pO1xuICAgICAgb25Db25uZWN0KG5ldyBQYXJzZVdlYlNvY2tldCh3cykpO1xuICAgICAgLy8gU2VuZCBwaW5nIHRvIGNsaWVudCBwZXJpb2RpY2FsbHlcbiAgICAgIGNvbnN0IHBpbmdJbnRlcnZhbElkID0gc2V0SW50ZXJ2YWwoKCkgPT4ge1xuICAgICAgICBpZiAoIXdzLndhaXRpbmdGb3JQb25nKSB7XG4gICAgICAgICAgd3MucGluZygpO1xuICAgICAgICAgIHdzLndhaXRpbmdGb3JQb25nID0gdHJ1ZTtcbiAgICAgICAgfSBlbHNlIHtcbiAgICAgICAgICBjbGVhckludGVydmFsKHBpbmdJbnRlcnZhbElkKTtcbiAgICAgICAgICB3cy50ZXJtaW5hdGUoKTtcbiAgICAgICAgfVxuICAgICAgfSwgY29uZmlnLndlYnNvY2tldFRpbWVvdXQgfHwgMTAgKiAxMDAwKTtcbiAgICB9O1xuICAgIHdzcy5vbkVycm9yID0gZXJyb3IgPT4ge1xuICAgICAgbG9nZ2VyLmVycm9yKGVycm9yKTtcbiAgICB9O1xuICAgIHdzcy5zdGFydCgpO1xuICAgIHRoaXMuc2VydmVyID0gd3NzO1xuICB9XG5cbiAgY2xvc2UoKSB7XG4gICAgaWYgKHRoaXMuc2VydmVyICYmIHRoaXMuc2VydmVyLmNsb3NlKSB7XG4gICAgICB0aGlzLnNlcnZlci5jbG9zZSgpO1xuICAgIH1cbiAgfVxufVxuXG5leHBvcnQgY2xhc3MgUGFyc2VXZWJTb2NrZXQgZXh0ZW5kcyBldmVudHMuRXZlbnRFbWl0dGVyIHtcbiAgd3M6IGFueTtcblxuICBjb25zdHJ1Y3Rvcih3czogYW55KSB7XG4gICAgc3VwZXIoKTtcbiAgICB3cy5vbm1lc3NhZ2UgPSByZXF1ZXN0ID0+XG4gICAgICB0aGlzLmVtaXQoJ21lc3NhZ2UnLCByZXF1ZXN0ICYmIHJlcXVlc3QuZGF0YSA/IHJlcXVlc3QuZGF0YSA6IHJlcXVlc3QpO1xuICAgIHdzLm9uY2xvc2UgPSAoKSA9PiB0aGlzLmVtaXQoJ2Rpc2Nvbm5lY3QnKTtcbiAgICB0aGlzLndzID0gd3M7XG4gIH1cblxuICBzZW5kKG1lc3NhZ2U6IGFueSk6IHZvaWQge1xuICAgIHRoaXMud3Muc2VuZChtZXNzYWdlKTtcbiAgfVxufVxuIl0sIm1hcHBpbmdzIjoiOzs7Ozs7QUFBQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQStCO0FBRXhCLE1BQU1BLG9CQUFvQixDQUFDO0VBR2hDQyxXQUFXLENBQUNDLE1BQVcsRUFBRUMsU0FBbUIsRUFBRUMsTUFBTSxFQUFFO0lBQ3BEQSxNQUFNLENBQUNGLE1BQU0sR0FBR0EsTUFBTTtJQUN0QixNQUFNRyxHQUFHLEdBQUcsSUFBQUMsMEJBQVcsRUFBQ0YsTUFBTSxDQUFDRyxVQUFVLEVBQUVDLG9CQUFTLEVBQUVKLE1BQU0sQ0FBQztJQUM3REMsR0FBRyxDQUFDSSxRQUFRLEdBQUcsTUFBTTtNQUNuQkMsZUFBTSxDQUFDQyxJQUFJLENBQUMsd0NBQXdDLENBQUM7SUFDdkQsQ0FBQztJQUNETixHQUFHLENBQUNPLFlBQVksR0FBR0MsRUFBRSxJQUFJO01BQ3ZCQSxFQUFFLENBQUNDLGNBQWMsR0FBRyxLQUFLO01BQ3pCRCxFQUFFLENBQUNFLEVBQUUsQ0FBQyxNQUFNLEVBQUUsTUFBTTtRQUNsQkYsRUFBRSxDQUFDQyxjQUFjLEdBQUcsS0FBSztNQUMzQixDQUFDLENBQUM7TUFDRkQsRUFBRSxDQUFDRSxFQUFFLENBQUMsT0FBTyxFQUFFQyxLQUFLLElBQUk7UUFDdEJOLGVBQU0sQ0FBQ00sS0FBSyxDQUFDQSxLQUFLLENBQUNDLE9BQU8sQ0FBQztRQUMzQlAsZUFBTSxDQUFDTSxLQUFLLENBQUMsSUFBQUUsYUFBTyxFQUFDTCxFQUFFLEVBQUUsS0FBSyxDQUFDLENBQUM7TUFDbEMsQ0FBQyxDQUFDO01BQ0ZWLFNBQVMsQ0FBQyxJQUFJZ0IsY0FBYyxDQUFDTixFQUFFLENBQUMsQ0FBQztNQUNqQztNQUNBLE1BQU1PLGNBQWMsR0FBR0MsV0FBVyxDQUFDLE1BQU07UUFDdkMsSUFBSSxDQUFDUixFQUFFLENBQUNDLGNBQWMsRUFBRTtVQUN0QkQsRUFBRSxDQUFDUyxJQUFJLEVBQUU7VUFDVFQsRUFBRSxDQUFDQyxjQUFjLEdBQUcsSUFBSTtRQUMxQixDQUFDLE1BQU07VUFDTFMsYUFBYSxDQUFDSCxjQUFjLENBQUM7VUFDN0JQLEVBQUUsQ0FBQ1csU0FBUyxFQUFFO1FBQ2hCO01BQ0YsQ0FBQyxFQUFFcEIsTUFBTSxDQUFDcUIsZ0JBQWdCLElBQUksRUFBRSxHQUFHLElBQUksQ0FBQztJQUMxQyxDQUFDO0lBQ0RwQixHQUFHLENBQUNxQixPQUFPLEdBQUdWLEtBQUssSUFBSTtNQUNyQk4sZUFBTSxDQUFDTSxLQUFLLENBQUNBLEtBQUssQ0FBQztJQUNyQixDQUFDO0lBQ0RYLEdBQUcsQ0FBQ3NCLEtBQUssRUFBRTtJQUNYLElBQUksQ0FBQ3pCLE1BQU0sR0FBR0csR0FBRztFQUNuQjtFQUVBdUIsS0FBSyxHQUFHO0lBQ04sSUFBSSxJQUFJLENBQUMxQixNQUFNLElBQUksSUFBSSxDQUFDQSxNQUFNLENBQUMwQixLQUFLLEVBQUU7TUFDcEMsSUFBSSxDQUFDMUIsTUFBTSxDQUFDMEIsS0FBSyxFQUFFO0lBQ3JCO0VBQ0Y7QUFDRjtBQUFDO0FBRU0sTUFBTVQsY0FBYyxTQUFTVSxlQUFNLENBQUNDLFlBQVksQ0FBQztFQUd0RDdCLFdBQVcsQ0FBQ1ksRUFBTyxFQUFFO0lBQ25CLEtBQUssRUFBRTtJQUNQQSxFQUFFLENBQUNrQixTQUFTLEdBQUdDLE9BQU8sSUFDcEIsSUFBSSxDQUFDQyxJQUFJLENBQUMsU0FBUyxFQUFFRCxPQUFPLElBQUlBLE9BQU8sQ0FBQ0UsSUFBSSxHQUFHRixPQUFPLENBQUNFLElBQUksR0FBR0YsT0FBTyxDQUFDO0lBQ3hFbkIsRUFBRSxDQUFDc0IsT0FBTyxHQUFHLE1BQU0sSUFBSSxDQUFDRixJQUFJLENBQUMsWUFBWSxDQUFDO0lBQzFDLElBQUksQ0FBQ3BCLEVBQUUsR0FBR0EsRUFBRTtFQUNkO0VBRUF1QixJQUFJLENBQUNuQixPQUFZLEVBQVE7SUFDdkIsSUFBSSxDQUFDSixFQUFFLENBQUN1QixJQUFJLENBQUNuQixPQUFPLENBQUM7RUFDdkI7QUFDRjtBQUFDIn0=