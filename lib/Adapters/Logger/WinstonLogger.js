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
//# sourceMappingURL=data:application/json;charset=utf-8;base64,eyJ2ZXJzaW9uIjozLCJzb3VyY2VzIjpbIi4uLy4uLy4uL3NyYy9BZGFwdGVycy9Mb2dnZXIvV2luc3RvbkxvZ2dlci5qcyJdLCJuYW1lcyI6WyJsb2dnZXIiLCJ3aW5zdG9uIiwiY3JlYXRlTG9nZ2VyIiwiY29uZmlndXJlVHJhbnNwb3J0cyIsIm9wdGlvbnMiLCJ0cmFuc3BvcnRzIiwic2lsZW50IiwiXyIsImlzTmlsIiwiZGlybmFtZSIsInBhcnNlU2VydmVyIiwiRGFpbHlSb3RhdGVGaWxlIiwiT2JqZWN0IiwiYXNzaWduIiwiZmlsZW5hbWUiLCJqc29uIiwiZm9ybWF0IiwiY29tYmluZSIsInRpbWVzdGFtcCIsInNwbGF0IiwibmFtZSIsInB1c2giLCJwYXJzZVNlcnZlckVycm9yIiwibGV2ZWwiLCJlIiwiY29uc29sZUZvcm1hdCIsInNpbXBsZSIsImNvbnNvbGVPcHRpb25zIiwiY29sb3JpemUiLCJDb25zb2xlIiwiY29uZmlndXJlIiwiY29uZmlndXJlTG9nZ2VyIiwibG9nc0ZvbGRlciIsImRlZmF1bHRzIiwianNvbkxvZ3MiLCJsb2dMZXZlbCIsInZlcmJvc2UiLCJtYXhMb2dGaWxlcyIsInBhdGgiLCJpc0Fic29sdXRlIiwicmVzb2x2ZSIsInByb2Nlc3MiLCJjd2QiLCJmcyIsIm1rZGlyU3luYyIsIm1heEZpbGVzIiwic3RyaW5naWZ5IiwiYWRkVHJhbnNwb3J0IiwidHJhbnNwb3J0IiwicmVtb3ZlVHJhbnNwb3J0IiwiYWRkIiwibWF0Y2hpbmdUcmFuc3BvcnQiLCJmaW5kIiwidDEiLCJyZW1vdmUiXSwibWFwcGluZ3MiOiI7Ozs7Ozs7Ozs7QUFBQTs7QUFDQTs7QUFDQTs7QUFDQTs7QUFDQTs7QUFDQTs7Ozs7Ozs7QUFFQSxNQUFNQSxNQUFNLEdBQUdDLGlCQUFRQyxZQUFSLEVBQWY7Ozs7QUFFQSxTQUFTQyxtQkFBVCxDQUE2QkMsT0FBN0IsRUFBc0M7QUFDcEMsUUFBTUMsVUFBVSxHQUFHLEVBQW5COztBQUNBLE1BQUlELE9BQUosRUFBYTtBQUNYLFVBQU1FLE1BQU0sR0FBR0Ys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aUJBQWQ7QUFDRDtBQUNGOztlQUdjbkQsTSIsInNvdXJjZXNDb250ZW50IjpbImltcG9ydCB3aW5zdG9uLCB7IGZvcm1hdCB9IGZyb20gJ3dpbnN0b24nO1xuaW1wb3J0IGZzIGZyb20gJ2ZzJztcbmltcG9ydCBwYXRoIGZyb20gJ3BhdGgnO1xuaW1wb3J0IERhaWx5Um90YXRlRmlsZSBmcm9tICd3aW5zdG9uLWRhaWx5LXJvdGF0ZS1maWxlJztcbmltcG9ydCBfIGZyb20gJ2xvZGFzaCc7XG5pbXBvcnQgZGVmYXVsdHMgZnJvbSAnLi4vLi4vZGVmYXVsdHMnO1xuXG5jb25zdCBsb2dnZXIgPSB3aW5zdG9uLmNyZWF0ZUxvZ2dlcigpO1xuXG5mdW5jdGlvbiBjb25maWd1cmVUcmFuc3BvcnRzKG9wdGlvbnMpIHtcbiAgY29uc3QgdHJhbnNwb3J0cyA9IFtdO1xuICBpZiAob3B0aW9ucykge1xuICAgIGNvbnN0IHNpbGVudCA9IG9wdGlvbnMuc2lsZW50O1xuICAgIGRlbGV0ZSBvcHRpb25zLnNpbGVudDtcblxuICAgIHRyeSB7XG4gICAgICBpZiAoIV8uaXNOaWwob3B0aW9ucy5kaXJuYW1lKSkge1xuICAgICAgICBjb25zdCBwYXJzZVNlcnZlciA9IG5ldyBEYWlseVJvdGF0ZUZpbGUoXG4gICAgICAgICAgT2JqZWN0LmFzc2lnbihcbiAgICAgICAgICAgIHtcbiAgICAgICAgICAgICAgZmlsZW5hbWU6ICdwYXJzZS1zZXJ2ZXIuaW5mbycsXG4gICAgICAgICAgICAgIGpzb246IHRydWUsXG4gICAgICAgICAgICAgIGZvcm1hdDogZm9ybWF0LmNvbWJpbmUoZm9ybWF0LnRpbWVzdGFtcCgpLCBmb3JtYXQuc3BsYXQoKSwgZm9ybWF0Lmpzb24oKSksXG4gICAgICAgICAgICB9LFxuICAgICAgICAgICAgb3B0aW9uc1xuICAgICAgICAgIClcbiAgICAgICAgKTtcbiAgICAgICAgcGFyc2VTZXJ2ZXIubmFtZSA9ICdwYXJzZS1zZXJ2ZXInO1xuICAgICAgICB0cmFuc3BvcnRzLnB1c2gocGFyc2VTZXJ2ZXIpO1xuXG4gICAgICAgIGNvbnN0IHBhcnNlU2VydmVyRXJyb3IgPSBuZXcgRGFpbHlSb3RhdGVGaWxlKFxuICAgICAgICAgIE9iamVjdC5hc3NpZ24oXG4gICAgICAgICAgICB7XG4gICAgICAgICAgICAgIGZpbGVuYW1lOiAncGFyc2Utc2VydmVyLmVycicsXG4gICAgICAgICAgICAgIGpzb246IHRydWUsXG4gICAgICAgICAgICAgIGZvcm1hdDogZm9ybWF0LmNvbWJpbmUoZm9ybWF0LnRpbWVzdGFtcCgpLCBmb3JtYXQuc3BsYXQoKSwgZm9ybWF0Lmpzb24oKSksXG4gICAgICAgICAgICB9LFxuICAgICAgICAgICAgb3B0aW9ucyxcbiAgICAgICAgICAgIHsgbGV2ZWw6ICdlcnJvcicgfVxuICAgICAgICAgIClcbiAgICAgICAgKTtcbiAgICAgICAgcGFyc2VTZXJ2ZXJFcnJvci5uYW1lID0gJ3BhcnNlLXNlcnZlci1lcnJvcic7XG4gICAgICAgIHRyYW5zcG9ydHMucHVzaChwYXJzZVNlcnZlckVycm9yKTtcbiAgICAgIH1cbiAgICB9IGNhdGNoIChlKSB7XG4gICAgICAvKiAqL1xuICAgIH1cblxuICAgIGNvbnN0IGNvbnNvbGVGb3JtYXQgPSBvcHRpb25zLmpzb24gPyBmb3JtYXQuanNvbigpIDogZm9ybWF0LnNpbXBsZSgpO1xuICAgIGNvbnN0IGNvbnNvbGVPcHRpb25zID0gT2JqZWN0LmFzc2lnbihcbiAgICAgIHtcbiAgICAgICAgY29sb3JpemU6IHRydWUsXG4gICAgICAgIG5hbWU6ICdjb25zb2xlJyxcbiAgICAgICAgc2lsZW50LFxuICAgICAgICBmb3JtYXQ6IGZvcm1hdC5jb21iaW5lKGZvcm1hdC5zcGxhdCgpLCBjb25zb2xlRm9ybWF0KSxcbiAgICAgIH0sXG4gICAgICBvcHRpb25zXG4gICAgKTtcblxuICAgIHRyYW5zcG9ydHMucHVzaChuZXcgd2luc3Rvbi50cmFuc3BvcnRzLkNvbnNvbGUoY29uc29sZU9wdGlvbnMpKTtcbiAgfVxuXG4gIGxvZ2dlci5jb25maWd1cmUoe1xuICAgIHRyYW5zcG9ydHMsXG4gIH0pO1xufVxuXG5leHBvcnQgZnVuY3Rpb24gY29uZmlndXJlTG9nZ2VyKHtcbiAgbG9nc0ZvbGRlciA9IGRlZmF1bHRzLmxvZ3NGb2xkZXIsXG4gIGpzb25Mb2dzID0gZGVmYXVsdHMuanNvbkxvZ3MsXG4gIGxvZ0xldmVsID0gd2luc3Rvbi5sZXZlbCxcbiAgdmVyYm9zZSA9IGRlZmF1bHRzLnZlcmJvc2UsXG4gIHNpbGVudCA9IGRlZmF1bHRzLnNpbGVudCxcbiAgbWF4TG9nRmlsZXMsXG59ID0ge30pIHtcbiAgaWYgKHZlcmJvc2UpIHtcbiAgICBsb2dMZXZlbCA9ICd2ZXJib3NlJztcbiAgfVxuXG4gIHdpbnN0b24ubGV2ZWwgPSBsb2dMZXZlbDtcbiAgY29uc3Qgb3B0aW9ucyA9IHt9O1xuXG4gIGlmIChsb2dzRm9sZGVyKSB7XG4gICAgaWYgKCFwYXRoLmlzQWJzb2x1dGUobG9nc0ZvbGRlcikpIHtcbiAgICAgIGxvZ3NGb2xkZXIgPSBwYXRoLnJlc29sdmUocHJvY2Vzcy5jd2QoKSwgbG9nc0ZvbGRlcik7XG4gICAgfVxuICAgIHRyeSB7XG4gICAgICBmcy5ta2RpclN5bmMobG9nc0ZvbGRlcik7XG4gICAgfSBjYXRjaCAoZSkge1xuICAgICAgLyogKi9cbiAgICB9XG4gIH1cbiAgb3B0aW9ucy5kaXJuYW1lID0gbG9nc0ZvbGRlcjtcbiAgb3B0aW9ucy5sZXZlbCA9IGxvZ0xldmVsO1xuICBvcHRpb25zLnNpbGVudCA9IHNpbGVudDtcbiAgb3B0aW9ucy5tYXhGaWxlcyA9IG1heExvZ0ZpbGVzO1xuXG4gIGlmIChqc29uTG9ncykge1xuICAgIG9wdGlvbnMuanNvbiA9IHRydWU7XG4gICAgb3B0aW9ucy5zdHJpbmdpZnkgPSB0cnVlO1xuICB9XG4gIGNvbmZpZ3VyZVRyYW5zcG9ydHMob3B0aW9ucyk7XG59XG5cbmV4cG9ydCBmdW5jdGlvbiBhZGRUcmFuc3BvcnQodHJhbnNwb3J0KSB7XG4gIC8vIHdlIHdpbGwgcmVtb3ZlIHRoZSBleGlzdGluZyB0cmFuc3BvcnRcbiAgLy8gYmVmb3JlIHJlcGxhY2luZyBpdCB3aXRoIGEgbmV3IG9uZVxuICByZW1vdmVUcmFuc3BvcnQodHJhbnNwb3J0Lm5hbWUpO1xuXG4gIGxvZ2dlci5hZGQodHJhbnNwb3J0KTtcbn1cblxuZXhwb3J0IGZ1bmN0aW9uIHJlbW92ZVRyYW5zcG9ydCh0cmFuc3BvcnQpIHtcbiAgY29uc3QgbWF0Y2hpbmdUcmFuc3BvcnQgPSBsb2dnZXIudHJhbnNwb3J0cy5maW5kKHQxID0+IHtcbiAgICByZXR1cm4gdHlwZW9mIHRyYW5zcG9ydCA9PT0gJ3N0cmluZycgPyB0MS5uYW1lID09PSB0cmFuc3BvcnQgOiB0MSA9PT0gdHJhbnNwb3J0O1xuICB9KTtcblxuICBpZiAobWF0Y2hpbmdUcmFuc3BvcnQpIHtcbiAgICBsb2dnZXIucmVtb3ZlKG1hdGNoaW5nVHJhbnNwb3J0KTtcbiAgfVxufVxuXG5leHBvcnQgeyBsb2dnZXIgfTtcbmV4cG9ydCBkZWZhdWx0IGxvZ2dlcjtcbiJdfQ==