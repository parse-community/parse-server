// Logger Adapter
//
// Allows you to change the logger mechanism
//
// Adapter classes must implement the following functions:
// * log() {}
// * query(options, callback) /* optional */
// Default is WinstonLoggerAdapter.js

export class LoggerAdapter {
  constructor(options) {}
  log(level, message, /* meta */) {}
}

export default LoggerAdapter;
