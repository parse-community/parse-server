"use strict";

Object.defineProperty(exports, "__esModule", {
  value: true
});
exports.default = exports.WinstonLoggerAdapter = void 0;
var _LoggerAdapter = require("./LoggerAdapter");
var _WinstonLogger = require("./WinstonLogger");
const MILLISECONDS_IN_A_DAY = 24 * 60 * 60 * 1000;
class WinstonLoggerAdapter extends _LoggerAdapter.LoggerAdapter {
  constructor(options) {
    super();
    if (options) {
      (0, _WinstonLogger.configureLogger)(options);
    }
  }
  log() {
    return _WinstonLogger.logger.log.apply(_WinstonLogger.logger, arguments);
  }
  addTransport(transport) {
    // Note that this is calling addTransport
    // from logger.  See import - confusing.
    // but this is not recursive.
    (0, _WinstonLogger.addTransport)(transport);
  }

  // custom query as winston is currently limited
  query(options, callback = () => {}) {
    if (!options) {
      options = {};
    }
    // defaults to 7 days prior
    const from = options.from || new Date(Date.now() - 7 * MILLISECONDS_IN_A_DAY);
    const until = options.until || new Date();
    const limit = options.size || 10;
    const order = options.order || 'desc';
    const level = options.level || 'info';
    const queryOptions = {
      from,
      until,
      limit,
      order
    };
    return new Promise((resolve, reject) => {
      _WinstonLogger.logger.query(queryOptions, (err, res) => {
        if (err) {
          callback(err);
          return reject(err);
        }
        if (level === 'error') {
          callback(res['parse-server-error']);
          resolve(res['parse-server-error']);
        } else {
          callback(res['parse-server']);
          resolve(res['parse-server']);
        }
      });
    });
  }
}
exports.WinstonLoggerAdapter = WinstonLoggerAdapter;
var _default = WinstonLoggerAdapter;
exports.default = _default;
//# sourceMappingURL=data:application/json;charset=utf-8;base64,eyJ2ZXJzaW9uIjozLCJuYW1lcyI6WyJNSUxMSVNFQ09ORFNfSU5fQV9EQVkiLCJXaW5zdG9uTG9nZ2VyQWRhcHRlciIsIkxvZ2dlckFkYXB0ZXIiLCJjb25zdHJ1Y3RvciIsIm9wdGlvbnMiLCJjb25maWd1cmVMb2dnZXIiLCJsb2ciLCJsb2dnZXIiLCJhcHBseSIsImFyZ3VtZW50cyIsImFkZFRyYW5zcG9ydCIsInRyYW5zcG9ydCIsInF1ZXJ5IiwiY2FsbGJhY2siLCJmcm9tIiwiRGF0ZSIsIm5vdyIsInVudGlsIiwibGltaXQiLCJzaXplIiwib3JkZXIiLCJsZXZlbCIsInF1ZXJ5T3B0aW9ucyIsIlByb21pc2UiLCJyZXNvbHZlIiwicmVqZWN0IiwiZXJyIiwicmVzIl0sInNvdXJjZXMiOlsiLi4vLi4vLi4vc3JjL0FkYXB0ZXJzL0xvZ2dlci9XaW5zdG9uTG9nZ2VyQWRhcHRlci5qcyJdLCJzb3VyY2VzQ29udGVudCI6WyJpbXBvcnQgeyBMb2dnZXJBZGFwdGVyIH0gZnJvbSAnLi9Mb2dnZXJBZGFwdGVyJztcbmltcG9ydCB7IGxvZ2dlciwgYWRkVHJhbnNwb3J0LCBjb25maWd1cmVMb2dnZXIgfSBmcm9tICcuL1dpbnN0b25Mb2dnZXInO1xuXG5jb25zdCBNSUxMSVNFQ09ORFNfSU5fQV9EQVkgPSAyNCAqIDYwICogNjAgKiAxMDAwO1xuXG5leHBvcnQgY2xhc3MgV2luc3RvbkxvZ2dlckFkYXB0ZXIgZXh0ZW5kcyBMb2dnZXJBZGFwdGVyIHtcbiAgY29uc3RydWN0b3Iob3B0aW9ucykge1xuICAgIHN1cGVyKCk7XG4gICAgaWYgKG9wdGlvbnMpIHtcbiAgICAgIGNvbmZpZ3VyZUxvZ2dlcihvcHRpb25zKTtcbiAgICB9XG4gIH1cblxuICBsb2coKSB7XG4gICAgcmV0dXJuIGxvZ2dlci5sb2cuYXBwbHkobG9nZ2VyLCBhcmd1bWVudHMpO1xuICB9XG5cbiAgYWRkVHJhbnNwb3J0KHRyYW5zcG9ydCkge1xuICAgIC8vIE5vdGUgdGhhdCB0aGlzIGlzIGNhbGxpbmcgYWRkVHJhbnNwb3J0XG4gICAgLy8gZnJvbSBsb2dnZXIuICBTZWUgaW1wb3J0IC0gY29uZnVzaW5nLlxuICAgIC8vIGJ1dCB0aGlzIGlzIG5vdCByZWN1cnNpdmUuXG4gICAgYWRkVHJhbnNwb3J0KHRyYW5zcG9ydCk7XG4gIH1cblxuICAvLyBjdXN0b20gcXVlcnkgYXMgd2luc3RvbiBpcyBjdXJyZW50bHkgbGltaXRlZFxuICBxdWVyeShvcHRpb25zLCBjYWxsYmFjayA9ICgpID0+IHt9KSB7XG4gICAgaWYgKCFvcHRpb25zKSB7XG4gICAgICBvcHRpb25zID0ge307XG4gICAgfVxuICAgIC8vIGRlZmF1bHRzIHRvIDcgZGF5cyBwcmlvclxuICAgIGNvbnN0IGZyb20gPSBvcHRpb25zLmZyb20gfHwgbmV3IERhdGUoRGF0ZS5ub3coKSAtIDcgKiBNSUxMSVNFQ09ORFNfSU5fQV9EQVkpO1xuICAgIGNvbnN0IHVudGlsID0gb3B0aW9ucy51bnRpbCB8fCBuZXcgRGF0ZSgpO1xuICAgIGNvbnN0IGxpbWl0ID0gb3B0aW9ucy5zaXplIHx8IDEwO1xuICAgIGNvbnN0IG9yZGVyID0gb3B0aW9ucy5vcmRlciB8fCAnZGVzYyc7XG4gICAgY29uc3QgbGV2ZWwgPSBvcHRpb25zLmxldmVsIHx8ICdpbmZvJztcblxuICAgIGNvbnN0IHF1ZXJ5T3B0aW9ucyA9IHtcbiAgICAgIGZyb20sXG4gICAgICB1bnRpbCxcbiAgICAgIGxpbWl0LFxuICAgICAgb3JkZXIsXG4gICAgfTtcblxuICAgIHJldHVybiBuZXcgUHJvbWlzZSgocmVzb2x2ZSwgcmVqZWN0KSA9PiB7XG4gICAgICBsb2dnZXIucXVlcnkocXVlcnlPcHRpb25zLCAoZXJyLCByZXMpID0+IHtcbiAgICAgICAgaWYgKGVycikge1xuICAgICAgICAgIGNhbGxiYWNrKGVycik7XG4gICAgICAgICAgcmV0dXJuIHJlamVjdChlcnIpO1xuICAgICAgICB9XG5cbiAgICAgICAgaWYgKGxldmVsID09PSAnZXJyb3InKSB7XG4gICAgICAgICAgY2FsbGJhY2socmVzWydwYXJzZS1zZXJ2ZXItZXJyb3InXSk7XG4gICAgICAgICAgcmVzb2x2ZShyZXNbJ3BhcnNlLXNlcnZlci1lcnJvciddKTtcbiAgICAgICAgfSBlbHNlIHtcbiAgICAgICAgICBjYWxsYmFjayhyZXNbJ3BhcnNlLXNlcnZlciddKTtcbiAgICAgICAgICByZXNvbHZlKHJlc1sncGFyc2Utc2VydmVyJ10pO1xuICAgICAgICB9XG4gICAgICB9KTtcbiAgICB9KTtcbiAgfVxufVxuXG5leHBvcnQgZGVmYXVsdCBXaW5zdG9uTG9nZ2VyQWRhcHRlcjtcbiJdLCJtYXBwaW5ncyI6Ijs7Ozs7O0FBQUE7QUFDQTtBQUVBLE1BQU1BLHFCQUFxQixHQUFHLEVBQUUsR0FBRyxFQUFFLEdBQUcsRUFBRSxHQUFHLElBQUk7QUFFMUMsTUFBTUMsb0JBQW9CLFNBQVNDLDRCQUFhLENBQUM7RUFDdERDLFdBQVcsQ0FBQ0MsT0FBTyxFQUFFO0lBQ25CLEtBQUssRUFBRTtJQUNQLElBQUlBLE9BQU8sRUFBRTtNQUNYLElBQUFDLDhCQUFlLEVBQUNELE9BQU8sQ0FBQztJQUMxQjtFQUNGO0VBRUFFLEdBQUcsR0FBRztJQUNKLE9BQU9DLHFCQUFNLENBQUNELEdBQUcsQ0FBQ0UsS0FBSyxDQUFDRCxxQkFBTSxFQUFFRSxTQUFTLENBQUM7RUFDNUM7RUFFQUMsWUFBWSxDQUFDQyxTQUFTLEVBQUU7SUFDdEI7SUFDQTtJQUNBO0lBQ0EsSUFBQUQsMkJBQVksRUFBQ0MsU0FBUyxDQUFDO0VBQ3pCOztFQUVBO0VBQ0FDLEtBQUssQ0FBQ1IsT0FBTyxFQUFFUyxRQUFRLEdBQUcsTUFBTSxDQUFDLENBQUMsRUFBRTtJQUNsQyxJQUFJLENBQUNULE9BQU8sRUFBRTtNQUNaQSxPQUFPLEdBQUcsQ0FBQyxDQUFDO0lBQ2Q7SUFDQTtJQUNBLE1BQU1VLElBQUksR0FBR1YsT0FBTyxDQUFDVSxJQUFJLElBQUksSUFBSUMsSUFBSSxDQUFDQSxJQUFJLENBQUNDLEdBQUcsRUFBRSxHQUFHLENBQUMsR0FBR2hCLHFCQUFxQixDQUFDO0lBQzdFLE1BQU1pQixLQUFLLEdBQUdiLE9BQU8sQ0FBQ2EsS0FBSyxJQUFJLElBQUlGLElBQUksRUFBRTtJQUN6QyxNQUFNRyxLQUFLLEdBQUdkLE9BQU8sQ0FBQ2UsSUFBSSxJQUFJLEVBQUU7SUFDaEMsTUFBTUMsS0FBSyxHQUFHaEIsT0FBTyxDQUFDZ0IsS0FBSyxJQUFJLE1BQU07SUFDckMsTUFBTUMsS0FBSyxHQUFHakIsT0FBTyxDQUFDaUIsS0FBSyxJQUFJLE1BQU07SUFFckMsTUFBTUMsWUFBWSxHQUFHO01BQ25CUixJQUFJO01BQ0pHLEtBQUs7TUFDTEMsS0FBSztNQUNMRTtJQUNGLENBQUM7SUFFRCxPQUFPLElBQUlHLE9BQU8sQ0FBQyxDQUFDQyxPQUFPLEVBQUVDLE1BQU0sS0FBSztNQUN0Q2xCLHFCQUFNLENBQUNLLEtBQUssQ0FBQ1UsWUFBWSxFQUFFLENBQUNJLEdBQUcsRUFBRUMsR0FBRyxLQUFLO1FBQ3ZDLElBQUlELEdBQUcsRUFBRTtVQUNQYixRQUFRLENBQUNhLEdBQUcsQ0FBQztVQUNiLE9BQU9ELE1BQU0sQ0FBQ0MsR0FBRyxDQUFDO1FBQ3BCO1FBRUEsSUFBSUwsS0FBSyxLQUFLLE9BQU8sRUFBRTtVQUNyQlIsUUFBUSxDQUFDYyxHQUFHLENBQUMsb0JBQW9CLENBQUMsQ0FBQztVQUNuQ0gsT0FBTyxDQUFDRyxHQUFHLENBQUMsb0JBQW9CLENBQUMsQ0FBQztRQUNwQyxDQUFDLE1BQU07VUFDTGQsUUFBUSxDQUFDYyxHQUFHLENBQUMsY0FBYyxDQUFDLENBQUM7VUFDN0JILE9BQU8sQ0FBQ0csR0FBRyxDQUFDLGNBQWMsQ0FBQyxDQUFDO1FBQzlCO01BQ0YsQ0FBQyxDQUFDO0lBQ0osQ0FBQyxDQUFDO0VBQ0o7QUFDRjtBQUFDO0FBQUEsZUFFYzFCLG9CQUFvQjtBQUFBIn0=