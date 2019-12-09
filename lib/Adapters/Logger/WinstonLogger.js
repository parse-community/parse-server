"use strict";

Object.defineProperty(exports, "__esModule", {
  value: true
});
exports.configureLogger = configureLogger;
exports.addTransport = addTransport;
exports.removeTransport = removeTransport;
exports.default = exports.logger = void 0;

var _winston = _interopRequireWildcard(require("winston"));

var _fs = _interopRequireDefault(require("fs"));

var _path = _interopRequireDefault(require("path"));

var _winstonDailyRotateFile = _interopRequireDefault(require("winston-daily-rotate-file"));

var _lodash = _interopRequireDefault(require("lodash"));

var _defaults = _interopRequireDefault(require("../../defaults"));

function _interopRequireDefault(obj) { return obj && obj.__esModule ? obj : { default: obj }; }

function _getRequireWildcardCache() { if (typeof WeakMap !== "function") return null; var cache = new WeakMap(); _getRequireWildcardCache = function () { return cache; }; return cache; }

function _interopRequireWildcard(obj) { if (obj && obj.__esModule) { return obj; } if (obj === null || typeof obj !== "object" && typeof obj !== "function") { return { default: obj }; } var cache = _getRequireWildcardCache(); if (cache && cache.has(obj)) { return cache.get(obj); } var newObj = {}; var hasPropertyDescriptor = Object.defineProperty && Object.getOwnPropertyDescriptor; for (var key in obj) { if (Object.prototype.hasOwnProperty.call(obj, key)) { var desc = hasPropertyDescriptor ? Object.getOwnPropertyDescriptor(obj, key) : null; if (desc && (desc.get || desc.set)) { Object.defineProperty(newObj, key, desc); } else { newObj[key] = obj[key]; } } } newObj.default = obj; if (cache) { cache.set(obj, newObj); } return newObj; }

const logger = _winston.default.createLogger();

exports.logger = logger;

function configureTransports(options) {
  const transports = [];

  if (options) {
    const silent = options.silent;
    delete options.silent;

    try {
      if (!_lodash.default.isNil(options.dirname)) {
        const parseServer = new _winstonDailyRotateFile.default(Object.assign({
          filename: 'parse-server.info',
          json: true,
          format: _winston.format.combine(_winston.format.timestamp(), _winston.format.splat(), _winston.format.json())
        }, options));
        parseServer.name = 'parse-server';
        transports.push(parseServer);
        const parseServerError = new _winstonDailyRotateFile.default(Object.assign({
          filename: 'parse-server.err',
          json: true,
          format: _winston.format.combine(_winston.format.timestamp(), _winston.format.splat(), _winston.format.json())
        }, options, {
          level: 'error'
        }));
        parseServerError.name = 'parse-server-error';
        transports.push(parseServerError);
      }
    } catch (e) {
      /* */
    }

    const consoleFormat = options.json ? _winston.format.json() : _winston.format.simple();
    const consoleOptions = Object.assign({
      colorize: true,
      name: 'console',
      silent,
      format: consoleFormat
    }, options);
    transports.push(new _winston.default.transports.Console(consoleOptions));
  }

  logger.configure({
    transports
  });
}

function configureLogger({
  logsFolder = _defaults.default.logsFolder,
  jsonLogs = _defaults.default.jsonLogs,
  logLevel = _winston.default.level,
  verbose = _defaults.default.verbose,
  silent = _defaults.default.silent
} = {}) {
  if (verbose) {
    logLevel = 'verbose';
  }

  _winston.default.level = logLevel;
  const options = {};

  if (logsFolder) {
    if (!_path.default.isAbsolute(logsFolder)) {
      logsFolder = _path.default.resolve(process.cwd(), logsFolder);
    }

    try {
      _fs.default.mkdirSync(logsFolder);
    } catch (e) {
      /* */
    }
  }

  options.dirname = logsFolder;
  options.level = logLevel;
  options.silent = silent;

  if (jsonLogs) {
    options.json = true;
    options.stringify = true;
  }

  configureTransports(options);
}

function addTransport(transport) {
  // we will remove the existing transport
  // before replacing it with a new one
  removeTransport(transport.name);
  logger.add(transport);
}

function removeTransport(transport) {
  const matchingTransport = logger.transports.find(t1 => {
    return typeof transport === 'string' ? t1.name === transport : t1 === transport;
  });

  if (matchingTransport) {
    logger.remove(matchingTransport);
  }
}

var _default = logger;
exports.default = _default;
//# sourceMappingURL=data:application/json;charset=utf-8;base64,eyJ2ZXJzaW9uIjozLCJzb3VyY2VzIjpbIi4uLy4uLy4uL3NyYy9BZGFwdGVycy9Mb2dnZXIvV2luc3RvbkxvZ2dlci5qcyJdLCJuYW1lcyI6WyJsb2dnZXIiLCJ3aW5zdG9uIiwiY3JlYXRlTG9nZ2VyIiwiY29uZmlndXJlVHJhbnNwb3J0cyIsIm9wdGlvbnMiLCJ0cmFuc3BvcnRzIiwic2lsZW50IiwiXyIsImlzTmlsIiwiZGlybmFtZSIsInBhcnNlU2VydmVyIiwiRGFpbHlSb3RhdGVGaWxlIiwiT2JqZWN0IiwiYXNzaWduIiwiZmlsZW5hbWUiLCJqc29uIiwiZm9ybWF0IiwiY29tYmluZSIsInRpbWVzdGFtcCIsInNwbGF0IiwibmFtZSIsInB1c2giLCJwYXJzZVNlcnZlckVycm9yIiwibGV2ZWwiLCJlIiwiY29uc29sZUZvcm1hdCIsInNpbXBsZSIsImNvbnNvbGVPcHRpb25zIiwiY29sb3JpemUiLCJDb25zb2xlIiwiY29uZmlndXJlIiwiY29uZmlndXJlTG9nZ2VyIiwibG9nc0ZvbGRlciIsImRlZmF1bHRzIiwianNvbkxvZ3MiLCJsb2dMZXZlbCIsInZlcmJvc2UiLCJwYXRoIiwiaXNBYnNvbHV0ZSIsInJlc29sdmUiLCJwcm9jZXNzIiwiY3dkIiwiZnMiLCJta2RpclN5bmMiLCJzdHJpbmdpZnkiLCJhZGRUcmFuc3BvcnQiLCJ0cmFuc3BvcnQiLCJyZW1vdmVUcmFuc3BvcnQiLCJhZGQiLCJtYXRjaGluZ1RyYW5zcG9ydCIsImZpbmQiLCJ0MSIsInJlbW92ZSJdLCJtYXBwaW5ncyI6Ijs7Ozs7Ozs7OztBQUFBOztBQUNBOztBQUNBOztBQUNBOztBQUNBOztBQUNBOzs7Ozs7OztBQUVBLE1BQU1BLE1BQU0sR0FBR0MsaUJBQVFDLFlBQVIsRUFBZjs7OztBQUVBLFNBQVNDLG1CQUFULENBQTZCQyxPQUE3QixFQUFzQztBQUNwQyxRQUFNQyxVQUFVLEdBQUcsRUFBbkI7O0FBQ0EsTUFBSUQsT0FBSixFQUFhO0FBQ1gsVUFBTUUsTUFBTSxHQUFHRixPQUFPLENBQUNFLE1BQXZCO0FBQ0EsV0FB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LENBQWFYLFVBQWI7QUFDRCxLQUZELENBRUUsT0FBT1IsQ0FBUCxFQUFVO0FBQ1Y7QUFDRDtBQUNGOztBQUNEcEIsRUFBQUEsT0FBTyxDQUFDSyxPQUFSLEdBQWtCdUIsVUFBbEI7QUFDQTVCLEVBQUFBLE9BQU8sQ0FBQ21CLEtBQVIsR0FBZ0JZLFFBQWhCO0FBQ0EvQixFQUFBQSxPQUFPLENBQUNFLE1BQVIsR0FBaUJBLE1BQWpCOztBQUVBLE1BQUk0QixRQUFKLEVBQWM7QUFDWjlCLElBQUFBLE9BQU8sQ0FBQ1csSUFBUixHQUFlLElBQWY7QUFDQVgsSUFBQUEsT0FBTyxDQUFDd0MsU0FBUixHQUFvQixJQUFwQjtBQUNEOztBQUNEekMsRUFBQUEsbUJBQW1CLENBQUNDLE9BQUQsQ0FBbkI7QUFDRDs7QUFFTSxTQUFTeUMsWUFBVCxDQUFzQkMsU0FBdEIsRUFBaUM7QUFDdEM7QUFDQTtBQUNBQyxFQUFBQSxlQUFlLENBQUNELFNBQVMsQ0FBQzFCLElBQVgsQ0FBZjtBQUVBcEIsRUFBQUEsTUFBTSxDQUFDZ0QsR0FBUCxDQUFXRixTQUFYO0FBQ0Q7O0FBRU0sU0FBU0MsZUFBVCxDQUF5QkQsU0FBekIsRUFBb0M7QUFDekMsUUFBTUcsaUJBQWlCLEdBQUdqRCxNQUFNLENBQUNLLFVBQVAsQ0FBa0I2QyxJQUFsQixDQUF1QkMsRUFBRSxJQUFJO0FBQ3JELFdBQU8sT0FBT0wsU0FBUCxLQUFxQixRQUFyQixHQUNISyxFQUFFLENBQUMvQixJQUFILEtBQVkwQixTQURULEdBRUhLLEVBQUUsS0FBS0wsU0FGWDtBQUdELEdBSnlCLENBQTFCOztBQU1BLE1BQUlHLGlCQUFKLEVBQXVCO0FBQ3JCakQsSUFBQUEsTUFBTSxDQUFDb0QsTUFBUCxDQUFjSCxpQkFBZDtBQUNEO0FBQ0Y7O2VBR2NqRCxNIiwic291cmNlc0NvbnRlbnQiOlsiaW1wb3J0IHdpbnN0b24sIHsgZm9ybWF0IH0gZnJvbSAnd2luc3Rvbic7XG5pbXBvcnQgZnMgZnJvbSAnZnMnO1xuaW1wb3J0IHBhdGggZnJvbSAncGF0aCc7XG5pbXBvcnQgRGFpbHlSb3RhdGVGaWxlIGZyb20gJ3dpbnN0b24tZGFpbHktcm90YXRlLWZpbGUnO1xuaW1wb3J0IF8gZnJvbSAnbG9kYXNoJztcbmltcG9ydCBkZWZhdWx0cyBmcm9tICcuLi8uLi9kZWZhdWx0cyc7XG5cbmNvbnN0IGxvZ2dlciA9IHdpbnN0b24uY3JlYXRlTG9nZ2VyKCk7XG5cbmZ1bmN0aW9uIGNvbmZpZ3VyZVRyYW5zcG9ydHMob3B0aW9ucykge1xuICBjb25zdCB0cmFuc3BvcnRzID0gW107XG4gIGlmIChvcHRpb25zKSB7XG4gICAgY29uc3Qgc2lsZW50ID0gb3B0aW9ucy5zaWxlbnQ7XG4gICAgZGVsZXRlIG9wdGlvbnMuc2lsZW50O1xuXG4gICAgdHJ5IHtcbiAgICAgIGlmICghXy5pc05pbChvcHRpb25zLmRpcm5hbWUpKSB7XG4gICAgICAgIGNvbnN0IHBhcnNlU2VydmVyID0gbmV3IERhaWx5Um90YXRlRmlsZShcbiAgICAgICAgICBPYmplY3QuYXNzaWduKFxuICAgICAgICAgICAge1xuICAgICAgICAgICAgICBmaWxlbmFtZTogJ3BhcnNlLXNlcnZlci5pbmZvJyxcbiAgICAgICAgICAgICAganNvbjogdHJ1ZSxcbiAgICAgICAgICAgICAgZm9ybWF0OiBmb3JtYXQuY29tYmluZShcbiAgICAgICAgICAgICAgICBmb3JtYXQudGltZXN0YW1wKCksXG4gICAgICAgICAgICAgICAgZm9ybWF0LnNwbGF0KCksXG4gICAgICAgICAgICAgICAgZm9ybWF0Lmpzb24oKVxuICAgICAgICAgICAgICApLFxuICAgICAgICAgICAgfSxcbiAgICAgICAgICAgIG9wdGlvbnNcbiAgICAgICAgICApXG4gICAgICAgICk7XG4gICAgICAgIHBhcnNlU2VydmVyLm5hbWUgPSAncGFyc2Utc2VydmVyJztcbiAgICAgICAgdHJhbnNwb3J0cy5wdXNoKHBhcnNlU2VydmVyKTtcblxuICAgICAgICBjb25zdCBwYXJzZVNlcnZlckVycm9yID0gbmV3IERhaWx5Um90YXRlRmlsZShcbiAgICAgICAgICBPYmplY3QuYXNzaWduKFxuICAgICAgICAgICAge1xuICAgICAgICAgICAgICBmaWxlbmFtZTogJ3BhcnNlLXNlcnZlci5lcnInLFxuICAgICAgICAgICAgICBqc29uOiB0cnVlLFxuICAgICAgICAgICAgICBmb3JtYXQ6IGZvcm1hdC5jb21iaW5lKFxuICAgICAgICAgICAgICAgIGZvcm1hdC50aW1lc3RhbXAoKSxcbiAgICAgICAgICAgICAgICBmb3JtYXQuc3BsYXQoKSxcbiAgICAgICAgICAgICAgICBmb3JtYXQuanNvbigpXG4gICAgICAgICAgICAgICksXG4gICAgICAgICAgICB9LFxuICAgICAgICAgICAgb3B0aW9ucyxcbiAgICAgICAgICAgIHsgbGV2ZWw6ICdlcnJvcicgfVxuICAgICAgICAgIClcbiAgICAgICAgKTtcbiAgICAgICAgcGFyc2VTZXJ2ZXJFcnJvci5uYW1lID0gJ3BhcnNlLXNlcnZlci1lcnJvcic7XG4gICAgICAgIHRyYW5zcG9ydHMucHVzaChwYXJzZVNlcnZlckVycm9yKTtcbiAgICAgIH1cbiAgICB9IGNhdGNoIChlKSB7XG4gICAgICAvKiAqL1xuICAgIH1cblxuICAgIGNvbnN0IGNvbnNvbGVGb3JtYXQgPSBvcHRpb25zLmpzb24gPyBmb3JtYXQuanNvbigpIDogZm9ybWF0LnNpbXBsZSgpO1xuICAgIGNvbnN0IGNvbnNvbGVPcHRpb25zID0gT2JqZWN0LmFzc2lnbihcbiAgICAgIHtcbiAgICAgICAgY29sb3JpemU6IHRydWUsXG4gICAgICAgIG5hbWU6ICdjb25zb2xlJyxcbiAgICAgICAgc2lsZW50LFxuICAgICAgICBmb3JtYXQ6IGNvbnNvbGVGb3JtYXQsXG4gICAgICB9LFxuICAgICAgb3B0aW9uc1xuICAgICk7XG5cbiAgICB0cmFuc3BvcnRzLnB1c2gobmV3IHdpbnN0b24udHJhbnNwb3J0cy5Db25zb2xlKGNvbnNvbGVPcHRpb25zKSk7XG4gIH1cblxuICBsb2dnZXIuY29uZmlndXJlKHtcbiAgICB0cmFuc3BvcnRzLFxuICB9KTtcbn1cblxuZXhwb3J0IGZ1bmN0aW9uIGNvbmZpZ3VyZUxvZ2dlcih7XG4gIGxvZ3NGb2xkZXIgPSBkZWZhdWx0cy5sb2dzRm9sZGVyLFxuICBqc29uTG9ncyA9IGRlZmF1bHRzLmpzb25Mb2dzLFxuICBsb2dMZXZlbCA9IHdpbnN0b24ubGV2ZWwsXG4gIHZlcmJvc2UgPSBkZWZhdWx0cy52ZXJib3NlLFxuICBzaWxlbnQgPSBkZWZhdWx0cy5zaWxlbnQsXG59ID0ge30pIHtcbiAgaWYgKHZlcmJvc2UpIHtcbiAgICBsb2dMZXZlbCA9ICd2ZXJib3NlJztcbiAgfVxuXG4gIHdpbnN0b24ubGV2ZWwgPSBsb2dMZXZlbDtcbiAgY29uc3Qgb3B0aW9ucyA9IHt9O1xuXG4gIGlmIChsb2dzRm9sZGVyKSB7XG4gICAgaWYgKCFwYXRoLmlzQWJzb2x1dGUobG9nc0ZvbGRlcikpIHtcbiAgICAgIGxvZ3NGb2xkZXIgPSBwYXRoLnJlc29sdmUocHJvY2Vzcy5jd2QoKSwgbG9nc0ZvbGRlcik7XG4gICAgfVxuICAgIHRyeSB7XG4gICAgICBmcy5ta2RpclN5bmMobG9nc0ZvbGRlcik7XG4gICAgfSBjYXRjaCAoZSkge1xuICAgICAgLyogKi9cbiAgICB9XG4gIH1cbiAgb3B0aW9ucy5kaXJuYW1lID0gbG9nc0ZvbGRlcjtcbiAgb3B0aW9ucy5sZXZlbCA9IGxvZ0xldmVsO1xuICBvcHRpb25zLnNpbGVudCA9IHNpbGVudDtcblxuICBpZiAoanNvbkxvZ3MpIHtcbiAgICBvcHRpb25zLmpzb24gPSB0cnVlO1xuICAgIG9wdGlvbnMuc3RyaW5naWZ5ID0gdHJ1ZTtcbiAgfVxuICBjb25maWd1cmVUcmFuc3BvcnRzKG9wdGlvbnMpO1xufVxuXG5leHBvcnQgZnVuY3Rpb24gYWRkVHJhbnNwb3J0KHRyYW5zcG9ydCkge1xuICAvLyB3ZSB3aWxsIHJlbW92ZSB0aGUgZXhpc3RpbmcgdHJhbnNwb3J0XG4gIC8vIGJlZm9yZSByZXBsYWNpbmcgaXQgd2l0aCBhIG5ldyBvbmVcbiAgcmVtb3ZlVHJhbnNwb3J0KHRyYW5zcG9ydC5uYW1lKTtcblxuICBsb2dnZXIuYWRkKHRyYW5zcG9ydCk7XG59XG5cbmV4cG9ydCBmdW5jdGlvbiByZW1vdmVUcmFuc3BvcnQodHJhbnNwb3J0KSB7XG4gIGNvbnN0IG1hdGNoaW5nVHJhbnNwb3J0ID0gbG9nZ2VyLnRyYW5zcG9ydHMuZmluZCh0MSA9PiB7XG4gICAgcmV0dXJuIHR5cGVvZiB0cmFuc3BvcnQgPT09ICdzdHJpbmcnXG4gICAgICA/IHQxLm5hbWUgPT09IHRyYW5zcG9ydFxuICAgICAgOiB0MSA9PT0gdHJhbnNwb3J0O1xuICB9KTtcblxuICBpZiAobWF0Y2hpbmdUcmFuc3BvcnQpIHtcbiAgICBsb2dnZXIucmVtb3ZlKG1hdGNoaW5nVHJhbnNwb3J0KTtcbiAgfVxufVxuXG5leHBvcnQgeyBsb2dnZXIgfTtcbmV4cG9ydCBkZWZhdWx0IGxvZ2dlcjtcbiJdfQ==