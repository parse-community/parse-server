// Logger
//
// Wrapper around Winston logging library with custom query
// 
// expected log entry to be in the shape of:
// {"level":"info","message":"Your Message","timestamp":"2016-02-04T05:59:27.412Z"}
//
import { LoggerAdapter } from './LoggerAdapter';
import winston from 'winston';
import fs from 'fs';
import { Parse } from 'parse/node';

const MILLISECONDS_IN_A_DAY = 24 * 60 * 60 * 1000;
const CACHE_TIME = 1000 * 60;

let LOGS_FOLDER = './logs/';

if (typeof process !== 'undefined' && process.env.NODE_ENV === 'test') {
  LOGS_FOLDER = './test_logs/'
}

let currentDate = new Date();

let simpleCache = {
  timestamp: null,
  from: null,
  until: null,
  order: null,
  data: [],
  level: 'info',
};

// returns Date object rounded to nearest day
let _getNearestDay = (date) => {
  return new Date(date.getFullYear(), date.getMonth(), date.getDate());
}

// returns Date object of previous day
let _getPrevDay = (date) => {
  return new Date(date - MILLISECONDS_IN_A_DAY);
}

// returns the iso formatted file name
let _getFileName = () => {
  return _getNearestDay(currentDate).toISOString()
}

// check for valid cache when both from and util match.
// cache valid for up to 1 minute
let _hasValidCache = (from, until, level) => {
  if (String(from) === String(simpleCache.from) &&
    String(until) === String(simpleCache.until) &&
    new Date() - simpleCache.timestamp < CACHE_TIME &&
    level === simpleCache.level) {
    return true;
  }
  return false;
}

// renews transports to current date
let _renewTransports = ({infoLogger, errorLogger, logsFolder}) => {
  if (infoLogger) {
    infoLogger.add(winston.transports.File, {
      filename: logsFolder + _getFileName() + '.info',
      name: 'info-file',
      level: 'info'
    });
  }
  if (errorLogger) {
    errorLogger.add(winston.transports.File, {
      filename: logsFolder + _getFileName() + '.error',
      name: 'error-file',
      level: 'error'
    });
  }
};

// check that log entry has valid time stamp based on query
let _isValidLogEntry = (from, until, entry) => {
  var _entry = JSON.parse(entry),
    timestamp = new Date(_entry.timestamp);
  return timestamp >= from && timestamp <= until
    ? true
    : false
};

// ensure that file name is up to date
let _verifyTransports = ({infoLogger, errorLogger, logsFolder}) => {
  if (_getNearestDay(currentDate) !== _getNearestDay(new Date())) {
    currentDate = new Date();
    if (infoLogger) {
      infoLogger.remove('info-file');
    } 
    if (errorLogger) {
      errorLogger.remove('error-file');
    }
    _renewTransports({infoLogger, errorLogger, logsFolder});
  }
}

export class FileLoggerAdapter extends LoggerAdapter {
  constructor(options = {}) {
    super();

    this._logsFolder = options.logsFolder || LOGS_FOLDER;

    // check logs folder exists
    if (!fs.existsSync(this._logsFolder)) {
      fs.mkdirSync(this._logsFolder);
    }

    this._errorLogger = new (winston.Logger)({
      exitOnError: false,
      transports: [
        new (winston.transports.File)({
          filename: this._logsFolder + _getFileName() + '.error',
          name: 'error-file',
          level: 'error'
        })
      ]
    });

    this._infoLogger = new (winston.Logger)({
      exitOnError: false,
      transports: [
        new (winston.transports.File)({
          filename: this._logsFolder + _getFileName() + '.info',
          name: 'info-file',
          level: 'info'
        })
      ]
    });
  }

  info() {
    _verifyTransports({infoLogger: this._infoLogger, logsFolder: this._logsFolder});
    return this._infoLogger.info.apply(undefined, arguments);    
  }

  error() {
    _verifyTransports({errorLogger: this._errorLogger, logsFolder: this._logsFolder});
    return this._errorLogger.error.apply(undefined, arguments);
  }

  // custom query as winston is currently limited
  query(options, callback) {
    if (!options) {
      options = {};
    }
    // defaults to 7 days prior
    let from = options.from || new Date(Date.now() - (7 * MILLISECONDS_IN_A_DAY));
    let until = options.until || new Date();
    let size = options.size || 10;
    let order = options.order || 'desc';
    let level = options.level || 'info';
    let roundedUntil = _getNearestDay(until);
    let roundedFrom = _getNearestDay(from);

    if (_hasValidCache(roundedFrom, roundedUntil, level)) {
      let logs = [];
      if (order !== simpleCache.order) {
        // reverse order of data
        simpleCache.data.forEach((entry) => {
          logs.unshift(entry);
        });
      } else {
        logs = simpleCache.data;
      }
      callback(logs.slice(0, size));
      return;
    }

    let curDate = roundedUntil;
    let curSize = 0;
    let method = order === 'desc' ? 'push' : 'unshift';
    let files = [];
    let promises = [];

    // current a batch call, all files with valid dates are read
    while (curDate >= from) {
      files[method](this._logsFolder + curDate.toISOString() + '.' + level);
      curDate = _getPrevDay(curDate);
    }

    // read each file and split based on newline char.
    // limitation is message cannot contain newline
    // TODO: strip out delimiter from logged message
    files.forEach(function(file, i) {
      let promise = new Parse.Promise();
      fs.readFile(file, 'utf8', function(err, data) {
        if (err) {
          promise.resolve([]);
        }  else {
          let results = data.split('\n').filter((value) => {
            return value.trim() !== '';
          });
          promise.resolve(results);
        }
      });
      promises[method](promise);
    });

    Parse.Promise.when(promises).then((results) => {
      let logs = [];
      results.forEach(function(logEntries, i) {
        logEntries.forEach(function(entry) {
          if (_isValidLogEntry(from, until, entry)) {
            logs[method](JSON.parse(entry));
          }
        });
      });
      simpleCache = {
        timestamp: new Date(),
        from: roundedFrom,
        until: roundedUntil,
        data: logs,
        order,
        level,
      };
      callback(logs.slice(0, size));
    });
  }
}

export default FileLoggerAdapter;
