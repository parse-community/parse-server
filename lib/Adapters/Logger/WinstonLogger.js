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
//# sourceMappingURL=data:application/json;charset=utf-8;base64,eyJ2ZXJzaW9uIjozLCJzb3VyY2VzIjpbIi4uLy4uLy4uL3NyYy9BZGFwdGVycy9Mb2dnZXIvV2luc3RvbkxvZ2dlci5qcyJdLCJuYW1lcyI6WyJsb2dnZXIiLCJ3aW5zdG9uIiwiY3JlYXRlTG9nZ2VyIiwiY29uZmlndXJlVHJhbnNwb3J0cyIsIm9wdGlvbnMiLCJ0cmFuc3BvcnRzIiwic2lsZW50IiwiXyIsImlzTmlsIiwiZGlybmFtZSIsInBhcnNlU2VydmVyIiwiRGFpbHlSb3RhdGVGaWxlIiwiT2JqZWN0IiwiYXNzaWduIiwiZmlsZW5hbWUiLCJqc29uIiwiZm9ybWF0IiwiY29tYmluZSIsInRpbWVzdGFtcCIsInNwbGF0IiwibmFtZSIsInB1c2giLCJwYXJzZVNlcnZlckVycm9yIiwibGV2ZWwiLCJlIiwiY29uc29sZUZvcm1hdCIsInNpbXBsZSIsImNvbnNvbGVPcHRpb25zIiwiY29sb3JpemUiLCJDb25zb2xlIiwiY29uZmlndXJlIiwiY29uZmlndXJlTG9nZ2VyIiwibG9nc0ZvbGRlciIsImRlZmF1bHRzIiwianNvbkxvZ3MiLCJsb2dMZXZlbCIsInZlcmJvc2UiLCJtYXhMb2dGaWxlcyIsInBhdGgiLCJpc0Fic29sdXRlIiwicmVzb2x2ZSIsInByb2Nlc3MiLCJjd2QiLCJmcyIsIm1rZGlyU3luYyIsIm1heEZpbGVzIiwic3RyaW5naWZ5IiwiYWRkVHJhbnNwb3J0IiwidHJhbnNwb3J0IiwicmVtb3ZlVHJhbnNwb3J0IiwiYWRkIiwibWF0Y2hpbmdUcmFuc3BvcnQiLCJmaW5kIiwidDEiLCJyZW1vdmUiXSwibWFwcGluZ3MiOiI7Ozs7Ozs7Ozs7QUFBQTs7QUFDQTs7QUFDQTs7QUFDQTs7QUFDQTs7QUFDQTs7Ozs7Ozs7QUFFQSxNQUFNQSxNQUFNLEdBQUdDLGlCQUFRQyxZQUFSLEVBQWY7Ozs7QUFFQSxTQUFTQyxtQkFBVCxDQUE2QkMsT0FBN0IsRUFBc0M7QUFDcEMsUUFBTUMsVUFBVSxHQUFHLEVBQW5COztBQUNBLE1BQUlELE9BQUosRUFBYTtBQUNYLFVBQU1FLE1BQU0sR0FBR0Ys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cG9ydCB3aW5zdG9uLCB7IGZvcm1hdCB9IGZyb20gJ3dpbnN0b24nO1xuaW1wb3J0IGZzIGZyb20gJ2ZzJztcbmltcG9ydCBwYXRoIGZyb20gJ3BhdGgnO1xuaW1wb3J0IERhaWx5Um90YXRlRmlsZSBmcm9tICd3aW5zdG9uLWRhaWx5LXJvdGF0ZS1maWxlJztcbmltcG9ydCBfIGZyb20gJ2xvZGFzaCc7XG5pbXBvcnQgZGVmYXVsdHMgZnJvbSAnLi4vLi4vZGVmYXVsdHMnO1xuXG5jb25zdCBsb2dnZXIgPSB3aW5zdG9uLmNyZWF0ZUxvZ2dlcigpO1xuXG5mdW5jdGlvbiBjb25maWd1cmVUcmFuc3BvcnRzKG9wdGlvbnMpIHtcbiAgY29uc3QgdHJhbnNwb3J0cyA9IFtdO1xuICBpZiAob3B0aW9ucykge1xuICAgIGNvbnN0IHNpbGVudCA9IG9wdGlvbnMuc2lsZW50O1xuICAgIGRlbGV0ZSBvcHRpb25zLnNpbGVudDtcblxuICAgIHRyeSB7XG4gICAgICBpZiAoIV8uaXNOaWwob3B0aW9ucy5kaXJuYW1lKSkge1xuICAgICAgICBjb25zdCBwYXJzZVNlcnZlciA9IG5ldyBEYWlseVJvdGF0ZUZpbGUoXG4gICAgICAgICAgT2JqZWN0LmFzc2lnbihcbiAgICAgICAgICAgIHtcbiAgICAgICAgICAgICAgZmlsZW5hbWU6ICdwYXJzZS1zZXJ2ZXIuaW5mbycsXG4gICAgICAgICAgICAgIGpzb246IHRydWUsXG4gICAgICAgICAgICAgIGZvcm1hdDogZm9ybWF0LmNvbWJpbmUoZm9ybWF0LnRpbWVzdGFtcCgpLCBmb3JtYXQuc3BsYXQoKSwgZm9ybWF0Lmpzb24oKSksXG4gICAgICAgICAgICB9LFxuICAgICAgICAgICAgb3B0aW9uc1xuICAgICAgICAgIClcbiAgICAgICAgKTtcbiAgICAgICAgcGFyc2VTZXJ2ZXIubmFtZSA9ICdwYXJzZS1zZXJ2ZXInO1xuICAgICAgICB0cmFuc3BvcnRzLnB1c2gocGFyc2VTZXJ2ZXIpO1xuXG4gICAgICAgIGNvbnN0IHBhcnNlU2VydmVyRXJyb3IgPSBuZXcgRGFpbHlSb3RhdGVGaWxlKFxuICAgICAgICAgIE9iamVjdC5hc3NpZ24oXG4gICAgICAgICAgICB7XG4gICAgICAgICAgICAgIGZpbGVuYW1lOiAncGFyc2Utc2VydmVyLmVycicsXG4gICAgICAgICAgICAgIGpzb246IHRydWUsXG4gICAgICAgICAgICAgIGZvcm1hdDogZm9ybWF0LmNvbWJpbmUoZm9ybWF0LnRpbWVzdGFtcCgpLCBmb3JtYXQuc3BsYXQoKSwgZm9ybWF0Lmpzb24oKSksXG4gICAgICAgICAgICB9LFxuICAgICAgICAgICAgb3B0aW9ucyxcbiAgICAgICAgICAgIHsgbGV2ZWw6ICdlcnJvcicgfVxuICAgICAgICAgIClcbiAgICAgICAgKTtcbiAgICAgICAgcGFyc2VTZXJ2ZXJFcnJvci5uYW1lID0gJ3BhcnNlLXNlcnZlci1lcnJvcic7XG4gICAgICAgIHRyYW5zcG9ydHMucHVzaChwYXJzZVNlcnZlckVycm9yKTtcbiAgICAgIH1cbiAgICB9IGNhdGNoIChlKSB7XG4gICAgICAvKiAqL1xuICAgIH1cblxuICAgIGNvbnN0IGNvbnNvbGVGb3JtYXQgPSBvcHRpb25zLmpzb24gPyBmb3JtYXQuanNvbigpIDogZm9ybWF0LnNpbXBsZSgpO1xuICAgIGNvbnN0IGNvbnNvbGVPcHRpb25zID0gT2JqZWN0LmFzc2lnbihcbiAgICAgIHtcbiAgICAgICAgY29sb3JpemU6IHRydWUsXG4gICAgICAgIG5hbWU6ICdjb25zb2xlJyxcbiAgICAgICAgc2lsZW50LFxuICAgICAgICBmb3JtYXQ6IGNvbnNvbGVGb3JtYXQsXG4gICAgICB9LFxuICAgICAgb3B0aW9uc1xuICAgICk7XG5cbiAgICB0cmFuc3BvcnRzLnB1c2gobmV3IHdpbnN0b24udHJhbnNwb3J0cy5Db25zb2xlKGNvbnNvbGVPcHRpb25zKSk7XG4gIH1cblxuICBsb2dnZXIuY29uZmlndXJlKHtcbiAgICB0cmFuc3BvcnRzLFxuICB9KTtcbn1cblxuZXhwb3J0IGZ1bmN0aW9uIGNvbmZpZ3VyZUxvZ2dlcih7XG4gIGxvZ3NGb2xkZXIgPSBkZWZhdWx0cy5sb2dzRm9sZGVyLFxuICBqc29uTG9ncyA9IGRlZmF1bHRzLmpzb25Mb2dzLFxuICBsb2dMZXZlbCA9IHdpbnN0b24ubGV2ZWwsXG4gIHZlcmJvc2UgPSBkZWZhdWx0cy52ZXJib3NlLFxuICBzaWxlbnQgPSBkZWZhdWx0cy5zaWxlbnQsXG4gIG1heExvZ0ZpbGVzLFxufSA9IHt9KSB7XG4gIGlmICh2ZXJib3NlKSB7XG4gICAgbG9nTGV2ZWwgPSAndmVyYm9zZSc7XG4gIH1cblxuICB3aW5zdG9uLmxldmVsID0gbG9nTGV2ZWw7XG4gIGNvbnN0IG9wdGlvbnMgPSB7fTtcblxuICBpZiAobG9nc0ZvbGRlcikge1xuICAgIGlmICghcGF0aC5pc0Fic29sdXRlKGxvZ3NGb2xkZXIpKSB7XG4gICAgICBsb2dzRm9sZGVyID0gcGF0aC5yZXNvbHZlKHByb2Nlc3MuY3dkKCksIGxvZ3NGb2xkZXIpO1xuICAgIH1cbiAgICB0cnkge1xuICAgICAgZnMubWtkaXJTeW5jKGxvZ3NGb2xkZXIpO1xuICAgIH0gY2F0Y2ggKGUpIHtcbiAgICAgIC8qICovXG4gICAgfVxuICB9XG4gIG9wdGlvbnMuZGlybmFtZSA9IGxvZ3NGb2xkZXI7XG4gIG9wdGlvbnMubGV2ZWwgPSBsb2dMZXZlbDtcbiAgb3B0aW9ucy5zaWxlbnQgPSBzaWxlbnQ7XG4gIG9wdGlvbnMubWF4RmlsZXMgPSBtYXhMb2dGaWxlcztcblxuICBpZiAoanNvbkxvZ3MpIHtcbiAgICBvcHRpb25zLmpzb24gPSB0cnVlO1xuICAgIG9wdGlvbnMuc3RyaW5naWZ5ID0gdHJ1ZTtcbiAgfVxuICBjb25maWd1cmVUcmFuc3BvcnRzKG9wdGlvbnMpO1xufVxuXG5leHBvcnQgZnVuY3Rpb24gYWRkVHJhbnNwb3J0KHRyYW5zcG9ydCkge1xuICAvLyB3ZSB3aWxsIHJlbW92ZSB0aGUgZXhpc3RpbmcgdHJhbnNwb3J0XG4gIC8vIGJlZm9yZSByZXBsYWNpbmcgaXQgd2l0aCBhIG5ldyBvbmVcbiAgcmVtb3ZlVHJhbnNwb3J0KHRyYW5zcG9ydC5uYW1lKTtcblxuICBsb2dnZXIuYWRkKHRyYW5zcG9ydCk7XG59XG5cbmV4cG9ydCBmdW5jdGlvbiByZW1vdmVUcmFuc3BvcnQodHJhbnNwb3J0KSB7XG4gIGNvbnN0IG1hdGNoaW5nVHJhbnNwb3J0ID0gbG9nZ2VyLnRyYW5zcG9ydHMuZmluZCh0MSA9PiB7XG4gICAgcmV0dXJuIHR5cGVvZiB0cmFuc3BvcnQgPT09ICdzdHJpbmcnID8gdDEubmFtZSA9PT0gdHJhbnNwb3J0IDogdDEgPT09IHRyYW5zcG9ydDtcbiAgfSk7XG5cbiAgaWYgKG1hdGNoaW5nVHJhbnNwb3J0KSB7XG4gICAgbG9nZ2VyLnJlbW92ZShtYXRjaGluZ1RyYW5zcG9ydCk7XG4gIH1cbn1cblxuZXhwb3J0IHsgbG9nZ2VyIH07XG5leHBvcnQgZGVmYXVsdCBsb2dnZXI7XG4iXX0=