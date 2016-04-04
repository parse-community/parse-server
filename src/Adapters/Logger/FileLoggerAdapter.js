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
import { logger, configure } from '../../logger';

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

// check that log entry has valid time stamp based on query
let _isValidLogEntry = (from, until, entry) => {
  var _entry = JSON.parse(entry),
    timestamp = new Date(_entry.timestamp);
  return timestamp >= from && timestamp <= until
    ? true
    : false
};

export class FileLoggerAdapter extends LoggerAdapter {

  info() {
    return logger.info.apply(undefined, arguments);
  }

  error() {
    return logger.error.apply(undefined, arguments);
  }

  // custom query as winston is currently limited
  query(options, callback = () => {}) {
    if (!options) {
      options = {};
    }
    // defaults to 7 days prior
    let from = options.from || new Date(Date.now() - (7 * MILLISECONDS_IN_A_DAY));
    let until = options.until || new Date();
    let limit = options.size || 10;
    let order = options.order || 'desc';
    let level = options.level || 'info';
    let roundedUntil = _getNearestDay(until);
    let roundedFrom = _getNearestDay(from);

    var options = {
      from,
      until,
      limit,
      order
    };

    return new Promise((resolve, reject) => {
      logger.query(options, (err, res) => {
        if (err) {
          callback(err);
          return reject(err);
        }
        if (level == 'error') {
          callback(res['parse-server-error']);
          resolve(res['parse-server-error']);
        } else {
          callback(res['parse-server']);
          resolve(res['parse-server']);
        }
      })
    });
  }
}

export default FileLoggerAdapter;
