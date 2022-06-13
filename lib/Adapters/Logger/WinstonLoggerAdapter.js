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
  } // custom query as winston is currently limited


  query(options, callback = () => {}) {
    if (!options) {
      options = {};
    } // defaults to 7 days prior


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
//# sourceMappingURL=data:application/json;charset=utf-8;base64,eyJ2ZXJzaW9uIjozLCJzb3VyY2VzIjpbIi4uLy4uLy4uL3NyYy9BZGFwdGVycy9Mb2dnZXIvV2luc3RvbkxvZ2dlckFkYXB0ZXIuanMiXSwibmFtZXMiOlsiTUlMTElTRUNPTkRTX0lOX0FfREFZIiwiV2luc3RvbkxvZ2dlckFkYXB0ZXIiLCJMb2dnZXJBZGFwdGVyIiwiY29uc3RydWN0b3IiLCJvcHRpb25zIiwibG9nIiwibG9nZ2VyIiwiYXBwbHkiLCJhcmd1bWVudHMiLCJhZGRUcmFuc3BvcnQiLCJ0cmFuc3BvcnQiLCJxdWVyeSIsImNhbGxiYWNrIiwiZnJvbSIsIkRhdGUiLCJub3ciLCJ1bnRpbCIsImxpbWl0Iiwic2l6ZSIsIm9yZGVyIiwibGV2ZWwiLCJxdWVyeU9wdGlvbnMiLCJQcm9taXNlIiwicmVzb2x2ZSIsInJlamVjdCIsImVyciIsInJlcyJdLCJtYXBwaW5ncyI6Ijs7Ozs7OztBQUFBOztBQUNBOztBQUVBLE1BQU1BLHFCQUFxQixHQUFHLEtBQUssRUFBTCxHQUFVLEVBQVYsR0FBZSxJQUE3Qzs7QUFFTyxNQUFNQyxvQkFBTixTQUFtQ0MsNEJBQW5DLENBQWlEO0FBQ3REQyxFQUFBQSxXQUFXLENBQUNDLE9BQUQsRUFBVTtBQUNuQjs7QUFDQSxRQUFJQSxPQUFKLEVBQWE7QUFDWCwwQ0FBZ0JBLE9BQWhCO0FBQ0Q7QUFDRjs7QUFFREMsRUFBQUEsR0FBRyxHQUFHO0FBQ0osV0FBT0Msc0JBQU9ELEdBQVAsQ0FBV0UsS0FBWCxDQUFpQkQscUJBQWpCLEVBQXlCRSxTQUF6QixDQUFQO0FBQ0Q7O0FBRURDLEVBQUFBLFlBQVksQ0FBQ0MsU0FBRCxFQUFZO0FBQ3RCO0FBQ0E7QUFDQTtBQUNBLHFDQUFhQSxTQUFiO0FBQ0QsR0FqQnFELENBbUJ0RDs7O0FBQ0FDLEVBQUFBLEtBQUssQ0FBQ1AsT0FBRCxFQUFVUSxRQUFRLEdBQUcsTUFBTSxDQUFFLENBQTdCLEVBQStCO0FBQ2xDLFFBQUksQ0FBQ1IsT0FBTCxFQUFjO0FBQ1pBLE1BQUFBLE9BQU8sR0FBRyxFQUFWO0FBQ0QsS0FIaUMsQ0FJbEM7OztBQUNBLFVBQU1TLElBQUksR0FBR1QsT0FBTyxDQUFDUyxJQUFSLElBQWdCLElBQUlDLElBQUosQ0FBU0EsSUFBSSxDQUFDQyxHQUFMLEtBQWEsSUFBSWYscUJBQTFCLENBQTdCO0FBQ0EsVUFBTWdCLEtBQUssR0FBR1osT0FBTyxDQUFDWSxLQUFSLElBQWlCLElBQUlGLElBQUosRUFBL0I7QUFDQSxVQUFNRyxLQUFLLEdBQUdiLE9BQU8sQ0FBQ2MsSUFBUixJQUFnQixFQUE5QjtBQUNBLFVBQU1DLEtBQUssR0FBR2YsT0FBTyxDQUFDZSxLQUFSLElBQWlCLE1BQS9CO0FBQ0EsVUFBTUMsS0FBSyxHQUFHaEIsT0FBTyxDQUFDZ0IsS0FBUixJQUFpQixNQUEvQjtBQUVBLFVBQU1DLFlBQVksR0FBRztBQUNuQlIsTUFBQUEsSUFEbUI7QUFFbkJHLE1BQUFBLEtBRm1CO0FBR25CQyxNQUFBQSxLQUhtQjtBQUluQkUsTUFBQUE7QUFKbUIsS0FBckI7QUFPQSxXQUFPLElBQUlHLE9BQUosQ0FBWSxDQUFDQyxPQUFELEVBQVVDLE1BQVYsS0FBcUI7QUFDdENsQiw0QkFBT0ssS0FBUCxDQUFhVSxZQUFiLEVBQTJCLENBQUNJLEdBQUQsRUFBTUMsR0FBTixLQUFjO0FBQ3ZDLFlBQUlELEdBQUosRUFBUztBQUNQYixVQUFBQSxRQUFRLENBQUNhLEdBQUQsQ0FBUjtBQUNBLGlCQUFPRCxNQUFNLENBQUNDLEdBQUQsQ0FBYjtBQUNEOztBQUVELFlBQUlMLEtBQUssS0FBSyxPQUFkLEVBQXVCO0FBQ3JCUixVQUFBQSxRQUFRLENBQUNjLEdBQUcsQ0FBQyxvQkFBRCxDQUFKLENBQVI7QUFDQUgsVUFBQUEsT0FBTyxDQUFDRyxHQUFHLENBQUMsb0JBQUQsQ0FBSixDQUFQO0FBQ0QsU0FIRCxNQUdPO0FBQ0xkLFVBQUFBLFFBQVEsQ0FBQ2MsR0FBRyxDQUFDLGNBQUQsQ0FBSixDQUFSO0FBQ0FILFVBQUFBLE9BQU8sQ0FBQ0csR0FBRyxDQUFDLGNBQUQsQ0FBSixDQUFQO0FBQ0Q7QUFDRixPQWJEO0FBY0QsS0FmTSxDQUFQO0FBZ0JEOztBQXREcUQ7OztlQXlEekN6QixvQiIsInNvdXJjZXNDb250ZW50IjpbImltcG9ydCB7IExvZ2dlckFkYXB0ZXIgfSBmcm9tICcuL0xvZ2dlckFkYXB0ZXInO1xuaW1wb3J0IHsgbG9nZ2VyLCBhZGRUcmFuc3BvcnQsIGNvbmZpZ3VyZUxvZ2dlciB9IGZyb20gJy4vV2luc3RvbkxvZ2dlcic7XG5cbmNvbnN0IE1JTExJU0VDT05EU19JTl9BX0RBWSA9IDI0ICogNjAgKiA2MCAqIDEwMDA7XG5cbmV4cG9ydCBjbGFzcyBXaW5zdG9uTG9nZ2VyQWRhcHRlciBleHRlbmRzIExvZ2dlckFkYXB0ZXIge1xuICBjb25zdHJ1Y3RvcihvcHRpb25zKSB7XG4gICAgc3VwZXIoKTtcbiAgICBpZiAob3B0aW9ucykge1xuICAgICAgY29uZmlndXJlTG9nZ2VyKG9wdGlvbnMpO1xuICAgIH1cbiAgfVxuXG4gIGxvZygpIHtcbiAgICByZXR1cm4gbG9nZ2VyLmxvZy5hcHBseShsb2dnZXIsIGFyZ3VtZW50cyk7XG4gIH1cblxuICBhZGRUcmFuc3BvcnQodHJhbnNwb3J0KSB7XG4gICAgLy8gTm90ZSB0aGF0IHRoaXMgaXMgY2FsbGluZyBhZGRUcmFuc3BvcnRcbiAgICAvLyBmcm9tIGxvZ2dlci4gIFNlZSBpbXBvcnQgLSBjb25mdXNpbmcuXG4gICAgLy8gYnV0IHRoaXMgaXMgbm90IHJlY3Vyc2l2ZS5cbiAgICBhZGRUcmFuc3BvcnQodHJhbnNwb3J0KTtcbiAgfVxuXG4gIC8vIGN1c3RvbSBxdWVyeSBhcyB3aW5zdG9uIGlzIGN1cnJlbnRseSBsaW1pdGVkXG4gIHF1ZXJ5KG9wdGlvbnMsIGNhbGxiYWNrID0gKCkgPT4ge30pIHtcbiAgICBpZiAoIW9wdGlvbnMpIHtcbiAgICAgIG9wdGlvbnMgPSB7fTtcbiAgICB9XG4gICAgLy8gZGVmYXVsdHMgdG8gNyBkYXlzIHByaW9yXG4gICAgY29uc3QgZnJvbSA9IG9wdGlvbnMuZnJvbSB8fCBuZXcgRGF0ZShEYXRlLm5vdygpIC0gNyAqIE1JTExJU0VDT05EU19JTl9BX0RBWSk7XG4gICAgY29uc3QgdW50aWwgPSBvcHRpb25zLnVudGlsIHx8IG5ldyBEYXRlKCk7XG4gICAgY29uc3QgbGltaXQgPSBvcHRpb25zLnNpemUgfHwgMTA7XG4gICAgY29uc3Qgb3JkZXIgPSBvcHRpb25zLm9yZGVyIHx8ICdkZXNjJztcbiAgICBjb25zdCBsZXZlbCA9IG9wdGlvbnMubGV2ZWwgfHwgJ2luZm8nO1xuXG4gICAgY29uc3QgcXVlcnlPcHRpb25zID0ge1xuICAgICAgZnJvbSxcbiAgICAgIHVudGlsLFxuICAgICAgbGltaXQsXG4gICAgICBvcmRlcixcbiAgICB9O1xuXG4gICAgcmV0dXJuIG5ldyBQcm9taXNlKChyZXNvbHZlLCByZWplY3QpID0+IHtcbiAgICAgIGxvZ2dlci5xdWVyeShxdWVyeU9wdGlvbnMsIChlcnIsIHJlcykgPT4ge1xuICAgICAgICBpZiAoZXJyKSB7XG4gICAgICAgICAgY2FsbGJhY2soZXJyKTtcbiAgICAgICAgICByZXR1cm4gcmVqZWN0KGVycik7XG4gICAgICAgIH1cblxuICAgICAgICBpZiAobGV2ZWwgPT09ICdlcnJvcicpIHtcbiAgICAgICAgICBjYWxsYmFjayhyZXNbJ3BhcnNlLXNlcnZlci1lcnJvciddKTtcbiAgICAgICAgICByZXNvbHZlKHJlc1sncGFyc2Utc2VydmVyLWVycm9yJ10pO1xuICAgICAgICB9IGVsc2Uge1xuICAgICAgICAgIGNhbGxiYWNrKHJlc1sncGFyc2Utc2VydmVyJ10pO1xuICAgICAgICAgIHJlc29sdmUocmVzWydwYXJzZS1zZXJ2ZXInXSk7XG4gICAgICAgIH1cbiAgICAgIH0pO1xuICAgIH0pO1xuICB9XG59XG5cbmV4cG9ydCBkZWZhdWx0IFdpbnN0b25Mb2dnZXJBZGFwdGVyO1xuIl19