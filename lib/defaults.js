'use strict';

Object.defineProperty(exports, "__esModule", {
  value: true
});
exports.DefaultMongoURI = undefined;

var _parsers = require('./Options/parsers');

const { ParseServerOptions } = require('./Options/Definitions');
const logsFolder = (() => {
  let folder = './logs/';
  if (typeof process !== 'undefined' && process.env.TESTING === '1') {
    folder = './test_logs/';
  }
  if (process.env.PARSE_SERVER_LOGS_FOLDER) {
    folder = (0, _parsers.nullParser)(process.env.PARSE_SERVER_LOGS_FOLDER);
  }
  return folder;
})();

const { verbose, level } = (() => {
  const verbose = process.env.VERBOSE ? true : false;
  return { verbose, level: verbose ? 'verbose' : undefined };
})();

const DefinitionDefaults = Object.keys(ParseServerOptions).reduce((memo, key) => {
  const def = ParseServerOptions[key];
  if (def.hasOwnProperty('default')) {
    memo[key] = def.default;
  }
  return memo;
}, {});

const computedDefaults = {
  jsonLogs: process.env.JSON_LOGS || false,
  logsFolder,
  verbose,
  level
};

exports.default = Object.assign({}, DefinitionDefaults, computedDefaults);
const DefaultMongoURI = exports.DefaultMongoURI = DefinitionDefaults.databaseURI;