// Logger Adapter
//
// Allows you to change the logger mechanism
//
// Adapter classes must implement the following functions:
// * log() {}
// * error() {}
// * warn() {}
// * info() {}
// * verbose() {}
// * debug() {}
// * silly() {}
// * query(options, callback) /* optional */
// * configureLogger(options)
// Default is WinstonLoggerAdapter.js

export class LoggerAdapter {
  constructor(options) {}
  log() {}
  error() {}
  warn() {}
  info() {}
  verbose() {}
  debug() {}
  silly() {}
}

export default LoggerAdapter;
