"use strict";

Object.defineProperty(exports, "__esModule", {
  value: true
});
exports.addTransport = addTransport;
exports.configureLogger = configureLogger;
exports.logger = exports.default = void 0;
exports.removeTransport = removeTransport;
var _winston = _interopRequireWildcard(require("winston"));
var _fs = _interopRequireDefault(require("fs"));
var _path = _interopRequireDefault(require("path"));
var _winstonDailyRotateFile = _interopRequireDefault(require("winston-daily-rotate-file"));
var _lodash = _interopRequireDefault(require("lodash"));
var _defaults = _interopRequireDefault(require("../../defaults"));
function _interopRequireDefault(obj) { return obj && obj.__esModule ? obj : { default: obj }; }
function _getRequireWildcardCache(nodeInterop) { if (typeof WeakMap !== "function") return null; var cacheBabelInterop = new WeakMap(); var cacheNodeInterop = new WeakMap(); return (_getRequireWildcardCache = function (nodeInterop) { return nodeInterop ? cacheNodeInterop : cacheBabelInterop; })(nodeInterop); }
function _interopRequireWildcard(obj, nodeInterop) { if (!nodeInterop && obj && obj.__esModule) { return obj; } if (obj === null || typeof obj !== "object" && typeof obj !== "function") { return { default: obj }; } var cache = _getRequireWildcardCache(nodeInterop); if (cache && cache.has(obj)) { return cache.get(obj); } var newObj = {}; var hasPropertyDescriptor = Object.defineProperty && Object.getOwnPropertyDescriptor; for (var key in obj) { if (key !== "default" && Object.prototype.hasOwnProperty.call(obj, key)) { var desc = hasPropertyDescriptor ? Object.getOwnPropertyDescriptor(obj, key) : null; if (desc && (desc.get || desc.set)) { Object.defineProperty(newObj, key, desc); } else { newObj[key] = obj[key]; } } } newObj.default = obj; if (cache) { cache.set(obj, newObj); } return newObj; }
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
      format: _winston.format.combine(_winston.format.splat(), consoleFormat)
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
  silent = _defaults.default.silent,
  maxLogFiles
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
  options.maxFiles = maxLogFiles;
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
//# sourceMappingURL=data:application/json;charset=utf-8;base64,eyJ2ZXJzaW9uIjozLCJuYW1lcyI6WyJsb2dnZXIiLCJ3aW5zdG9uIiwiY3JlYXRlTG9nZ2VyIiwiY29uZmlndXJlVHJhbnNwb3J0cyIsIm9wdGlvbnMiLCJ0cmFuc3BvcnRzIiwic2lsZW50IiwiXyIsImlzTmlsIiwiZGlybmFtZSIsInBhcnNlU2VydmVyIiwiRGFpbHlSb3RhdGVGaWxlIiwiT2JqZWN0IiwiYXNzaWduIiwiZmlsZW5hbWUiLCJqc29uIiwiZm9ybWF0IiwiY29tYmluZSIsInRpbWVzdGFtcCIsInNwbGF0IiwibmFtZSIsInB1c2giLCJwYXJzZVNlcnZlckVycm9yIiwibGV2ZWwiLCJlIiwiY29uc29sZUZvcm1hdCIsInNpbXBsZSIsImNvbnNvbGVPcHRpb25zIiwiY29sb3JpemUiLCJDb25zb2xlIiwiY29uZmlndXJlIiwiY29uZmlndXJlTG9nZ2VyIiwibG9nc0ZvbGRlciIsImRlZmF1bHRzIiwianNvbkxvZ3MiLCJsb2dMZXZlbCIsInZlcmJvc2UiLCJtYXhMb2dGaWxlcyIsInBhdGgiLCJpc0Fic29sdXRlIiwicmVzb2x2ZSIsInByb2Nlc3MiLCJjd2QiLCJmcyIsIm1rZGlyU3luYyIsIm1heEZpbGVzIiwic3RyaW5naWZ5IiwiYWRkVHJhbnNwb3J0IiwidHJhbnNwb3J0IiwicmVtb3ZlVHJhbnNwb3J0IiwiYWRkIiwibWF0Y2hpbmdUcmFuc3BvcnQiLCJmaW5kIiwidDEiLCJyZW1vdmUiXSwic291cmNlcyI6WyIuLi8uLi8uLi9zcmMvQWRhcHRlcnMvTG9nZ2VyL1dpbnN0b25Mb2dnZXIuanMiXSwic291cmNlc0NvbnRlbnQiOlsiaW1wb3J0IHdpbnN0b24sIHsgZm9ybWF0IH0gZnJvbSAnd2luc3Rvbic7XG5pbXBvcnQgZnMgZnJvbSAnZnMnO1xuaW1wb3J0IHBhdGggZnJvbSAncGF0aCc7XG5pbXBvcnQgRGFpbHlSb3RhdGVGaWxlIGZyb20gJ3dpbnN0b24tZGFpbHktcm90YXRlLWZpbGUnO1xuaW1wb3J0IF8gZnJvbSAnbG9kYXNoJztcbmltcG9ydCBkZWZhdWx0cyBmcm9tICcuLi8uLi9kZWZhdWx0cyc7XG5cbmNvbnN0IGxvZ2dlciA9IHdpbnN0b24uY3JlYXRlTG9nZ2VyKCk7XG5cbmZ1bmN0aW9uIGNvbmZpZ3VyZVRyYW5zcG9ydHMob3B0aW9ucykge1xuICBjb25zdCB0cmFuc3BvcnRzID0gW107XG4gIGlmIChvcHRpb25zKSB7XG4gICAgY29uc3Qgc2lsZW50ID0gb3B0aW9ucy5zaWxlbnQ7XG4gICAgZGVsZXRlIG9wdGlvbnMuc2lsZW50O1xuXG4gICAgdHJ5IHtcbiAgICAgIGlmICghXy5pc05pbChvcHRpb25zLmRpcm5hbWUpKSB7XG4gICAgICAgIGNvbnN0IHBhcnNlU2VydmVyID0gbmV3IERhaWx5Um90YXRlRmlsZShcbiAgICAgICAgICBPYmplY3QuYXNzaWduKFxuICAgICAgICAgICAge1xuICAgICAgICAgICAgICBmaWxlbmFtZTogJ3BhcnNlLXNlcnZlci5pbmZvJyxcbiAgICAgICAgICAgICAganNvbjogdHJ1ZSxcbiAgICAgICAgICAgICAgZm9ybWF0OiBmb3JtYXQuY29tYmluZShmb3JtYXQudGltZXN0YW1wKCksIGZvcm1hdC5zcGxhdCgpLCBmb3JtYXQuanNvbigpKSxcbiAgICAgICAgICAgIH0sXG4gICAgICAgICAgICBvcHRpb25zXG4gICAgICAgICAgKVxuICAgICAgICApO1xuICAgICAgICBwYXJzZVNlcnZlci5uYW1lID0gJ3BhcnNlLXNlcnZlcic7XG4gICAgICAgIHRyYW5zcG9ydHMucHVzaChwYXJzZVNlcnZlcik7XG5cbiAgICAgICAgY29uc3QgcGFyc2VTZXJ2ZXJFcnJvciA9IG5ldyBEYWlseVJvdGF0ZUZpbGUoXG4gICAgICAgICAgT2JqZWN0LmFzc2lnbihcbiAgICAgICAgICAgIHtcbiAgICAgICAgICAgICAgZmlsZW5hbWU6ICdwYXJzZS1zZXJ2ZXIuZXJyJyxcbiAgICAgICAgICAgICAganNvbjogdHJ1ZSxcbiAgICAgICAgICAgICAgZm9ybWF0OiBmb3JtYXQuY29tYmluZShmb3JtYXQudGltZXN0YW1wKCksIGZvcm1hdC5zcGxhdCgpLCBmb3JtYXQuanNvbigpKSxcbiAgICAgICAgICAgIH0sXG4gICAgICAgICAgICBvcHRpb25zLFxuICAgICAgICAgICAgeyBsZXZlbDogJ2Vycm9yJyB9XG4gICAgICAgICAgKVxuICAgICAgICApO1xuICAgICAgICBwYXJzZVNlcnZlckVycm9yLm5hbWUgPSAncGFyc2Utc2VydmVyLWVycm9yJztcbiAgICAgICAgdHJhbnNwb3J0cy5wdXNoKHBhcnNlU2VydmVyRXJyb3IpO1xuICAgICAgfVxuICAgIH0gY2F0Y2ggKGUpIHtcbiAgICAgIC8qICovXG4gICAgfVxuXG4gICAgY29uc3QgY29uc29sZUZvcm1hdCA9IG9wdGlvbnMuanNvbiA/IGZvcm1hdC5qc29uKCkgOiBmb3JtYXQuc2ltcGxlKCk7XG4gICAgY29uc3QgY29uc29sZU9wdGlvbnMgPSBPYmplY3QuYXNzaWduKFxuICAgICAge1xuICAgICAgICBjb2xvcml6ZTogdHJ1ZSxcbiAgICAgICAgbmFtZTogJ2NvbnNvbGUnLFxuICAgICAgICBzaWxlbnQsXG4gICAgICAgIGZvcm1hdDogZm9ybWF0LmNvbWJpbmUoZm9ybWF0LnNwbGF0KCksIGNvbnNvbGVGb3JtYXQpLFxuICAgICAgfSxcbiAgICAgIG9wdGlvbnNcbiAgICApO1xuXG4gICAgdHJhbnNwb3J0cy5wdXNoKG5ldyB3aW5zdG9uLnRyYW5zcG9ydHMuQ29uc29sZShjb25zb2xlT3B0aW9ucykpO1xuICB9XG5cbiAgbG9nZ2VyLmNvbmZpZ3VyZSh7XG4gICAgdHJhbnNwb3J0cyxcbiAgfSk7XG59XG5cbmV4cG9ydCBmdW5jdGlvbiBjb25maWd1cmVMb2dnZXIoe1xuICBsb2dzRm9sZGVyID0gZGVmYXVsdHMubG9nc0ZvbGRlcixcbiAganNvbkxvZ3MgPSBkZWZhdWx0cy5qc29uTG9ncyxcbiAgbG9nTGV2ZWwgPSB3aW5zdG9uLmxldmVsLFxuICB2ZXJib3NlID0gZGVmYXVsdHMudmVyYm9zZSxcbiAgc2lsZW50ID0gZGVmYXVsdHMuc2lsZW50LFxuICBtYXhMb2dGaWxlcyxcbn0gPSB7fSkge1xuICBpZiAodmVyYm9zZSkge1xuICAgIGxvZ0xldmVsID0gJ3ZlcmJvc2UnO1xuICB9XG5cbiAgd2luc3Rvbi5sZXZlbCA9IGxvZ0xldmVsO1xuICBjb25zdCBvcHRpb25zID0ge307XG5cbiAgaWYgKGxvZ3NGb2xkZXIpIHtcbiAgICBpZiAoIXBhdGguaXNBYnNvbHV0ZShsb2dzRm9sZGVyKSkge1xuICAgICAgbG9nc0ZvbGRlciA9IHBhdGgucmVzb2x2ZShwcm9jZXNzLmN3ZCgpLCBsb2dzRm9sZGVyKTtcbiAgICB9XG4gICAgdHJ5IHtcbiAgICAgIGZzLm1rZGlyU3luYyhsb2dzRm9sZGVyKTtcbiAgICB9IGNhdGNoIChlKSB7XG4gICAgICAvKiAqL1xuICAgIH1cbiAgfVxuICBvcHRpb25zLmRpcm5hbWUgPSBsb2dzRm9sZGVyO1xuICBvcHRpb25zLmxldmVsID0gbG9nTGV2ZWw7XG4gIG9wdGlvbnMuc2lsZW50ID0gc2lsZW50O1xuICBvcHRpb25zLm1heEZpbGVzID0gbWF4TG9nRmlsZXM7XG5cbiAgaWYgKGpzb25Mb2dzKSB7XG4gICAgb3B0aW9ucy5qc29uID0gdHJ1ZTtcbiAgICBvcHRpb25zLnN0cmluZ2lmeSA9IHRydWU7XG4gIH1cbiAgY29uZmlndXJlVHJhbnNwb3J0cyhvcHRpb25zKTtcbn1cblxuZXhwb3J0IGZ1bmN0aW9uIGFkZFRyYW5zcG9ydCh0cmFuc3BvcnQpIHtcbiAgLy8gd2Ugd2lsbCByZW1vdmUgdGhlIGV4aXN0aW5nIHRyYW5zcG9ydFxuICAvLyBiZWZvcmUgcmVwbGFjaW5nIGl0IHdpdGggYSBuZXcgb25lXG4gIHJlbW92ZVRyYW5zcG9ydCh0cmFuc3BvcnQubmFtZSk7XG5cbiAgbG9nZ2VyLmFkZCh0cmFuc3BvcnQpO1xufVxuXG5leHBvcnQgZnVuY3Rpb24gcmVtb3ZlVHJhbnNwb3J0KHRyYW5zcG9ydCkge1xuICBjb25zdCBtYXRjaGluZ1RyYW5zcG9ydCA9IGxvZ2dlci50cmFuc3BvcnRzLmZpbmQodDEgPT4ge1xuICAgIHJldHVybiB0eXBlb2YgdHJhbnNwb3J0ID09PSAnc3RyaW5nJyA/IHQxLm5hbWUgPT09IHRyYW5zcG9ydCA6IHQxID09PSB0cmFuc3BvcnQ7XG4gIH0pO1xuXG4gIGlmIChtYXRjaGluZ1RyYW5zcG9ydCkge1xuICAgIGxvZ2dlci5yZW1vdmUobWF0Y2hpbmdUcmFuc3BvcnQpO1xuICB9XG59XG5cbmV4cG9ydCB7IGxvZ2dlciB9O1xuZXhwb3J0IGRlZmF1bHQgbG9nZ2VyO1xuIl0sIm1hcHBpbmdzIjoiOzs7Ozs7Ozs7QUFBQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFBc0M7QUFBQTtBQUFBO0FBRXRDLE1BQU1BLE1BQU0sR0FBR0MsZ0JBQU8sQ0FBQ0MsWUFBWSxFQUFFO0FBQUM7QUFFdEMsU0FBU0MsbUJBQW1CLENBQUNDLE9BQU8sRUFBRTtFQUNwQyxNQUFNQyxVQUFVLEdBQUcsRUFBRTtFQUNyQixJQUFJRCxPQUFPLEVBQUU7SUFDWCxNQUFNRSxNQUFNLEdBQUdGLE9BQU8sQ0FBQ0UsTUFBTTtJQUM3QixPQUFPRixPQUFPLENBQUNFLE1BQU07SUFFckIsSUFBSTtNQUNGLElBQUksQ0FBQ0MsZUFBQyxDQUFDQyxLQUFLLENBQUNKLE9BQU8sQ0FBQ0ssT0FBTyxDQUFDLEVBQUU7UUFDN0IsTUFBTUMsV0FBVyxHQUFHLElBQUlDLCtCQUFlLENBQ3JDQyxNQUFNLENBQUNDLE1BQU0sQ0FDWDtVQUNFQyxRQUFRLEVBQUUsbUJBQW1CO1VBQzdCQyxJQUFJLEVBQUUsSUFBSTtVQUNWQyxNQUFNLEVBQUVBLGVBQU0sQ0FBQ0MsT0FBTyxDQUFDRCxlQUFNLENBQUNFLFNBQVMsRUFBRSxFQUFFRixlQUFNLENBQUNHLEtBQUssRUFBRSxFQUFFSCxlQUFNLENBQUNELElBQUksRUFBRTtRQUMxRSxDQUFDLEVBQ0RYLE9BQU8sQ0FDUixDQUNGO1FBQ0RNLFdBQVcsQ0FBQ1UsSUFBSSxHQUFHLGNBQWM7UUFDakNmLFVBQVUsQ0FBQ2dCLElBQUksQ0FBQ1gsV0FBVyxDQUFDO1FBRTVCLE1BQU1ZLGdCQUFnQixHQUFHLElBQUlY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