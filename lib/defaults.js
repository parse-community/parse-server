'use strict';

Object.defineProperty(exports, "__esModule", {
  value: true
});

var _parsers = require('./cli/utils/parsers');

var logsFolder = function () {
  var folder = './logs/';
  if (typeof process !== 'undefined' && process.env.NODE_ENV === 'test') {
    folder = './test_logs/';
  }
  if (process.env.PARSE_SERVER_LOGS_FOLDER) {
    folder = (0, _parsers.nullParser)(process.env.PARSE_SERVER_LOGS_FOLDER);
  }
  return folder;
}();

var _ref = function () {
  var verbose = process.env.VERBOSE ? true : false;
  return { verbose: verbose, level: verbose ? 'verbose' : undefined };
}(),
    verbose = _ref.verbose,
    level = _ref.level;

exports.default = {
  DefaultMongoURI: 'mongodb://localhost:27017/parse',
  jsonLogs: process.env.JSON_LOGS || false,
  logsFolder: logsFolder,
  verbose: verbose,
  level: level,
  silent: false,
  enableAnonymousUsers: true,
  allowClientClassCreation: true,
  maxUploadSize: '20mb',
  verifyUserEmails: false,
  preventLoginWithUnverifiedEmail: false,
  sessionLength: 31536000,
  expireInactiveSessions: true,
  revokeSessionOnPasswordReset: true,
  schemaCacheTTL: 5000, // in ms
  userSensitiveFields: ['email']
};