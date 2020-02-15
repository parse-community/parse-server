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
//# sourceMappingURL=data:application/json;charset=utf-8;base64,eyJ2ZXJzaW9uIjozLCJzb3VyY2VzIjpbIi4uLy4uLy4uL3NyYy9BZGFwdGVycy9Mb2dnZXIvV2luc3RvbkxvZ2dlci5qcyJdLCJuYW1lcyI6WyJsb2dnZXIiLCJ3aW5zdG9uIiwiY3JlYXRlTG9nZ2VyIiwiY29uZmlndXJlVHJhbnNwb3J0cyIsIm9wdGlvbnMiLCJ0cmFuc3BvcnRzIiwic2lsZW50IiwiXyIsImlzTmlsIiwiZGlybmFtZSIsInBhcnNlU2VydmVyIiwiRGFpbHlSb3RhdGVGaWxlIiwiT2JqZWN0IiwiYXNzaWduIiwiZmlsZW5hbWUiLCJqc29uIiwiZm9ybWF0IiwiY29tYmluZSIsInRpbWVzdGFtcCIsInNwbGF0IiwibmFtZSIsInB1c2giLCJwYXJzZVNlcnZlckVycm9yIiwibGV2ZWwiLCJlIiwiY29uc29sZUZvcm1hdCIsInNpbXBsZSIsImNvbnNvbGVPcHRpb25zIiwiY29sb3JpemUiLCJDb25zb2xlIiwiY29uZmlndXJlIiwiY29uZmlndXJlTG9nZ2VyIiwibG9nc0ZvbGRlciIsImRlZmF1bHRzIiwianNvbkxvZ3MiLCJsb2dMZXZlbCIsInZlcmJvc2UiLCJtYXhMb2dGaWxlcyIsInBhdGgiLCJpc0Fic29sdXRlIiwicmVzb2x2ZSIsInByb2Nlc3MiLCJjd2QiLCJmcyIsIm1rZGlyU3luYyIsIm1heEZpbGVzIiwic3RyaW5naWZ5IiwiYWRkVHJhbnNwb3J0IiwidHJhbnNwb3J0IiwicmVtb3ZlVHJhbnNwb3J0IiwiYWRkIiwibWF0Y2hpbmdUcmFuc3BvcnQiLCJmaW5kIiwidDEiLCJyZW1vdmUiXSwibWFwcGluZ3MiOiI7Ozs7Ozs7Ozs7QUFBQTs7QUFDQTs7QUFDQTs7QUFDQTs7QUFDQTs7QUFDQTs7Ozs7Ozs7QUFFQSxNQUFNQSxNQUFNLEdBQUdDLGlCQUFRQyxZQUFSLEVBQWY7Ozs7QUFFQSxTQUFTQyxtQkFBVCxDQUE2QkMsT0FBN0IsRUFBc0M7QUFDcEMsUUFBTUMsVUFBVSxHQUFHLEVBQW5COztBQUNBLE1BQUlELE9BQUosRUFBYTtBQUNYLFVBQU1FLE1BQU0sR0FBR0Ys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LCB7IGZvcm1hdCB9IGZyb20gJ3dpbnN0b24nO1xuaW1wb3J0IGZzIGZyb20gJ2ZzJztcbmltcG9ydCBwYXRoIGZyb20gJ3BhdGgnO1xuaW1wb3J0IERhaWx5Um90YXRlRmlsZSBmcm9tICd3aW5zdG9uLWRhaWx5LXJvdGF0ZS1maWxlJztcbmltcG9ydCBfIGZyb20gJ2xvZGFzaCc7XG5pbXBvcnQgZGVmYXVsdHMgZnJvbSAnLi4vLi4vZGVmYXVsdHMnO1xuXG5jb25zdCBsb2dnZXIgPSB3aW5zdG9uLmNyZWF0ZUxvZ2dlcigpO1xuXG5mdW5jdGlvbiBjb25maWd1cmVUcmFuc3BvcnRzKG9wdGlvbnMpIHtcbiAgY29uc3QgdHJhbnNwb3J0cyA9IFtdO1xuICBpZiAob3B0aW9ucykge1xuICAgIGNvbnN0IHNpbGVudCA9IG9wdGlvbnMuc2lsZW50O1xuICAgIGRlbGV0ZSBvcHRpb25zLnNpbGVudDtcblxuICAgIHRyeSB7XG4gICAgICBpZiAoIV8uaXNOaWwob3B0aW9ucy5kaXJuYW1lKSkge1xuICAgICAgICBjb25zdCBwYXJzZVNlcnZlciA9IG5ldyBEYWlseVJvdGF0ZUZpbGUoXG4gICAgICAgICAgT2JqZWN0LmFzc2lnbihcbiAgICAgICAgICAgIHtcbiAgICAgICAgICAgICAgZmlsZW5hbWU6ICdwYXJzZS1zZXJ2ZXIuaW5mbycsXG4gICAgICAgICAgICAgIGpzb246IHRydWUsXG4gICAgICAgICAgICAgIGZvcm1hdDogZm9ybWF0LmNvbWJpbmUoXG4gICAgICAgICAgICAgICAgZm9ybWF0LnRpbWVzdGFtcCgpLFxuICAgICAgICAgICAgICAgIGZvcm1hdC5zcGxhdCgpLFxuICAgICAgICAgICAgICAgIGZvcm1hdC5qc29uKClcbiAgICAgICAgICAgICAgKSxcbiAgICAgICAgICAgIH0sXG4gICAgICAgICAgICBvcHRpb25zXG4gICAgICAgICAgKVxuICAgICAgICApO1xuICAgICAgICBwYXJzZVNlcnZlci5uYW1lID0gJ3BhcnNlLXNlcnZlcic7XG4gICAgICAgIHRyYW5zcG9ydHMucHVzaChwYXJzZVNlcnZlcik7XG5cbiAgICAgICAgY29uc3QgcGFyc2VTZXJ2ZXJFcnJvciA9IG5ldyBEYWlseVJvdGF0ZUZpbGUoXG4gICAgICAgICAgT2JqZWN0LmFzc2lnbihcbiAgICAgICAgICAgIHtcbiAgICAgICAgICAgICAgZmlsZW5hbWU6ICdwYXJzZS1zZXJ2ZXIuZXJyJyxcbiAgICAgICAgICAgICAganNvbjogdHJ1ZSxcbiAgICAgICAgICAgICAgZm9ybWF0OiBmb3JtYXQuY29tYmluZShcbiAgICAgICAgICAgICAgICBmb3JtYXQudGltZXN0YW1wKCksXG4gICAgICAgICAgICAgICAgZm9ybWF0LnNwbGF0KCksXG4gICAgICAgICAgICAgICAgZm9ybWF0Lmpzb24oKVxuICAgICAgICAgICAgICApLFxuICAgICAgICAgICAgfSxcbiAgICAgICAgICAgIG9wdGlvbnMsXG4gICAgICAgICAgICB7IGxldmVsOiAnZXJyb3InIH1cbiAgICAgICAgICApXG4gICAgICAgICk7XG4gICAgICAgIHBhcnNlU2VydmVyRXJyb3IubmFtZSA9ICdwYXJzZS1zZXJ2ZXItZXJyb3InO1xuICAgICAgICB0cmFuc3BvcnRzLnB1c2gocGFyc2VTZXJ2ZXJFcnJvcik7XG4gICAgICB9XG4gICAgfSBjYXRjaCAoZSkge1xuICAgICAgLyogKi9cbiAgICB9XG5cbiAgICBjb25zdCBjb25zb2xlRm9ybWF0ID0gb3B0aW9ucy5qc29uID8gZm9ybWF0Lmpzb24oKSA6IGZvcm1hdC5zaW1wbGUoKTtcbiAgICBjb25zdCBjb25zb2xlT3B0aW9ucyA9IE9iamVjdC5hc3NpZ24oXG4gICAgICB7XG4gICAgICAgIGNvbG9yaXplOiB0cnVlLFxuICAgICAgICBuYW1lOiAnY29uc29sZScsXG4gICAgICAgIHNpbGVudCxcbiAgICAgICAgZm9ybWF0OiBjb25zb2xlRm9ybWF0LFxuICAgICAgfSxcbiAgICAgIG9wdGlvbnNcbiAgICApO1xuXG4gICAgdHJhbnNwb3J0cy5wdXNoKG5ldyB3aW5zdG9uLnRyYW5zcG9ydHMuQ29uc29sZShjb25zb2xlT3B0aW9ucykpO1xuICB9XG5cbiAgbG9nZ2VyLmNvbmZpZ3VyZSh7XG4gICAgdHJhbnNwb3J0cyxcbiAgfSk7XG59XG5cbmV4cG9ydCBmdW5jdGlvbiBjb25maWd1cmVMb2dnZXIoe1xuICBsb2dzRm9sZGVyID0gZGVmYXVsdHMubG9nc0ZvbGRlcixcbiAganNvbkxvZ3MgPSBkZWZhdWx0cy5qc29uTG9ncyxcbiAgbG9nTGV2ZWwgPSB3aW5zdG9uLmxldmVsLFxuICB2ZXJib3NlID0gZGVmYXVsdHMudmVyYm9zZSxcbiAgc2lsZW50ID0gZGVmYXVsdHMuc2lsZW50LFxuICBtYXhMb2dGaWxlcyxcbn0gPSB7fSkge1xuICBpZiAodmVyYm9zZSkge1xuICAgIGxvZ0xldmVsID0gJ3ZlcmJvc2UnO1xuICB9XG5cbiAgd2luc3Rvbi5sZXZlbCA9IGxvZ0xldmVsO1xuICBjb25zdCBvcHRpb25zID0ge307XG5cbiAgaWYgKGxvZ3NGb2xkZXIpIHtcbiAgICBpZiAoIXBhdGguaXNBYnNvbHV0ZShsb2dzRm9sZGVyKSkge1xuICAgICAgbG9nc0ZvbGRlciA9IHBhdGgucmVzb2x2ZShwcm9jZXNzLmN3ZCgpLCBsb2dzRm9sZGVyKTtcbiAgICB9XG4gICAgdHJ5IHtcbiAgICAgIGZzLm1rZGlyU3luYyhsb2dzRm9sZGVyKTtcbiAgICB9IGNhdGNoIChlKSB7XG4gICAgICAvKiAqL1xuICAgIH1cbiAgfVxuICBvcHRpb25zLmRpcm5hbWUgPSBsb2dzRm9sZGVyO1xuICBvcHRpb25zLmxldmVsID0gbG9nTGV2ZWw7XG4gIG9wdGlvbnMuc2lsZW50ID0gc2lsZW50O1xuICBvcHRpb25zLm1heEZpbGVzID0gbWF4TG9nRmlsZXM7XG5cbiAgaWYgKGpzb25Mb2dzKSB7XG4gICAgb3B0aW9ucy5qc29uID0gdHJ1ZTtcbiAgICBvcHRpb25zLnN0cmluZ2lmeSA9IHRydWU7XG4gIH1cbiAgY29uZmlndXJlVHJhbnNwb3J0cyhvcHRpb25zKTtcbn1cblxuZXhwb3J0IGZ1bmN0aW9uIGFkZFRyYW5zcG9ydCh0cmFuc3BvcnQpIHtcbiAgLy8gd2Ugd2lsbCByZW1vdmUgdGhlIGV4aXN0aW5nIHRyYW5zcG9ydFxuICAvLyBiZWZvcmUgcmVwbGFjaW5nIGl0IHdpdGggYSBuZXcgb25lXG4gIHJlbW92ZVRyYW5zcG9ydCh0cmFuc3BvcnQubmFtZSk7XG5cbiAgbG9nZ2VyLmFkZCh0cmFuc3BvcnQpO1xufVxuXG5leHBvcnQgZnVuY3Rpb24gcmVtb3ZlVHJhbnNwb3J0KHRyYW5zcG9ydCkge1xuICBjb25zdCBtYXRjaGluZ1RyYW5zcG9ydCA9IGxvZ2dlci50cmFuc3BvcnRzLmZpbmQodDEgPT4ge1xuICAgIHJldHVybiB0eXBlb2YgdHJhbnNwb3J0ID09PSAnc3RyaW5nJ1xuICAgICAgPyB0MS5uYW1lID09PSB0cmFuc3BvcnRcbiAgICAgIDogdDEgPT09IHRyYW5zcG9ydDtcbiAgfSk7XG5cbiAgaWYgKG1hdGNoaW5nVHJhbnNwb3J0KSB7XG4gICAgbG9nZ2VyLnJlbW92ZShtYXRjaGluZ1RyYW5zcG9ydCk7XG4gIH1cbn1cblxuZXhwb3J0IHsgbG9nZ2VyIH07XG5leHBvcnQgZGVmYXVsdCBsb2dnZXI7XG4iXX0=