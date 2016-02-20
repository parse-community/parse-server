// Logger Adapter
//
// Allows you to change the logger mechanism
//
// Adapter classes must implement the following functions:
// * info(obj1 [, obj2, .., objN])
// * error(obj1 [, obj2, .., objN])
// * query(options, callback)
// Default is FileLoggerAdapter.js

export class LoggerAdapter {
  info() {}
  error() {}
  query(options, callback) {}
}

export default LoggerAdapter;
