"use strict";

Object.defineProperty(exports, "__esModule", {
  value: true
});
exports.default = exports.LoggerAdapter = void 0;

/*eslint no-unused-vars: "off"*/

/**
 * @module Adapters
 */

/**
 * @interface LoggerAdapter
 * Logger Adapter
 * Allows you to change the logger mechanism
 * Default is WinstonLoggerAdapter.js
 */
class LoggerAdapter {
  constructor(options) {}
  /**
   * log
   * @param {String} level
   * @param {String} message
   * @param {Object} metadata
   */


  log(level, message
  /* meta */
  ) {}

}

exports.LoggerAdapter = LoggerAdapter;
var _default = LoggerAdapter;
exports.default = _default;
//# sourceMappingURL=data:application/json;charset=utf-8;base64,eyJ2ZXJzaW9uIjozLCJzb3VyY2VzIjpbIi4uLy4uLy4uL3NyYy9BZGFwdGVycy9Mb2dnZXIvTG9nZ2VyQWRhcHRlci5qcyJdLCJuYW1lcyI6WyJMb2dnZXJBZGFwdGVyIiwiY29uc3RydWN0b3IiLCJvcHRpb25zIiwibG9nIiwibGV2ZWwiLCJtZXNzYWdlIl0sIm1hcHBpbmdzIjoiOzs7Ozs7O0FBQUE7O0FBQ0E7Ozs7QUFHQTs7Ozs7O0FBTU8sTUFBTUEsYUFBTixDQUFvQjtBQUN6QkMsRUFBQUEsV0FBVyxDQUFDQyxPQUFELEVBQVUsQ0FBRTtBQUN2Qjs7Ozs7Ozs7QUFNQUMsRUFBQUEsR0FBRyxDQUFDQyxLQUFELEVBQVFDO0FBQVE7QUFBaEIsSUFBNEIsQ0FBRTs7QUFSUjs7O2VBV1pMLGEiLCJzb3VyY2VzQ29udGVudCI6WyIvKmVzbGludCBuby11bnVzZWQtdmFyczogXCJvZmZcIiovXG4vKipcbiAqIEBtb2R1bGUgQWRhcHRlcnNcbiAqL1xuLyoqXG4gKiBAaW50ZXJmYWNlIExvZ2dlckFkYXB0ZXJcbiAqIExvZ2dlciBBZGFwdGVyXG4gKiBBbGxvd3MgeW91IHRvIGNoYW5nZSB0aGUgbG9nZ2VyIG1lY2hhbmlzbVxuICogRGVmYXVsdCBpcyBXaW5zdG9uTG9nZ2VyQWRhcHRlci5qc1xuICovXG5leHBvcnQgY2xhc3MgTG9nZ2VyQWRhcHRlciB7XG4gIGNvbnN0cnVjdG9yKG9wdGlvbnMpIHt9XG4gIC8qKlxuICAgKiBsb2dcbiAgICogQHBhcmFtIHtTdHJpbmd9IGxldmVsXG4gICAqIEBwYXJhbSB7U3RyaW5nfSBtZXNzYWdlXG4gICAqIEBwYXJhbSB7T2JqZWN0fSBtZXRhZGF0YVxuICAgKi9cbiAgbG9nKGxldmVsLCBtZXNzYWdlIC8qIG1ldGEgKi8pIHt9XG59XG5cbmV4cG9ydCBkZWZhdWx0IExvZ2dlckFkYXB0ZXI7XG4iXX0=