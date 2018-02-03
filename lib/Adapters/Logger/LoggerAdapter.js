"use strict";

Object.defineProperty(exports, "__esModule", {
  value: true
});
/*eslint no-unused-vars: "off"*/
// Logger Adapter
//
// Allows you to change the logger mechanism
//
// Adapter classes must implement the following functions:
// * log() {}
// * query(options, callback) /* optional */
// Default is WinstonLoggerAdapter.js

class LoggerAdapter {
  constructor(options) {}
  log(level, message) /* meta */{}
}

exports.LoggerAdapter = LoggerAdapter;
exports.default = LoggerAdapter;