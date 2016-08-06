// Logger Adapter
//
// Allows you to change the logger mechanism
//
// Adapter classes must implement the following functions:
// * info(obj1 [, obj2, .., objN])
// * error(obj1 [, obj2, .., objN])
// * query(options, callback) /* optional */
// * configureLogger(options)
// Default is WinstonLoggerAdapter.js

export class LoggerAdapter {
  constructor(options) {}
  info() {}
  error() {}
  warn() {}
  verbose() {}
}

export default LoggerAdapter;
