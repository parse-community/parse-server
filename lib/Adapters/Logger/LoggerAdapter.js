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
  log(level, message /* meta */) {}
}
exports.LoggerAdapter = LoggerAdapter;
var _default = LoggerAdapter;
exports.default = _default;
//# sourceMappingURL=data:application/json;charset=utf-8;base64,eyJ2ZXJzaW9uIjozLCJuYW1lcyI6WyJMb2dnZXJBZGFwdGVyIiwiY29uc3RydWN0b3IiLCJvcHRpb25zIiwibG9nIiwibGV2ZWwiLCJtZXNzYWdlIl0sInNvdXJjZXMiOlsiLi4vLi4vLi4vc3JjL0FkYXB0ZXJzL0xvZ2dlci9Mb2dnZXJBZGFwdGVyLmpzIl0sInNvdXJjZXNDb250ZW50IjpbIi8qZXNsaW50IG5vLXVudXNlZC12YXJzOiBcIm9mZlwiKi9cbi8qKlxuICogQG1vZHVsZSBBZGFwdGVyc1xuICovXG4vKipcbiAqIEBpbnRlcmZhY2UgTG9nZ2VyQWRhcHRlclxuICogTG9nZ2VyIEFkYXB0ZXJcbiAqIEFsbG93cyB5b3UgdG8gY2hhbmdlIHRoZSBsb2dnZXIgbWVjaGFuaXNtXG4gKiBEZWZhdWx0IGlzIFdpbnN0b25Mb2dnZXJBZGFwdGVyLmpzXG4gKi9cbmV4cG9ydCBjbGFzcyBMb2dnZXJBZGFwdGVyIHtcbiAgY29uc3RydWN0b3Iob3B0aW9ucykge31cbiAgLyoqXG4gICAqIGxvZ1xuICAgKiBAcGFyYW0ge1N0cmluZ30gbGV2ZWxcbiAgICogQHBhcmFtIHtTdHJpbmd9IG1lc3NhZ2VcbiAgICogQHBhcmFtIHtPYmplY3R9IG1ldGFkYXRhXG4gICAqL1xuICBsb2cobGV2ZWwsIG1lc3NhZ2UgLyogbWV0YSAqLykge31cbn1cblxuZXhwb3J0IGRlZmF1bHQgTG9nZ2VyQWRhcHRlcjtcbiJdLCJtYXBwaW5ncyI6Ijs7Ozs7O0FBQUE7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDTyxNQUFNQSxhQUFhLENBQUM7RUFDekJDLFdBQVcsQ0FBQ0MsT0FBTyxFQUFFLENBQUM7RUFDdEI7QUFDRjtBQUNBO0FBQ0E7QUFDQTtBQUNBO0VBQ0VDLEdBQUcsQ0FBQ0MsS0FBSyxFQUFFQyxPQUFPLENBQUMsWUFBWSxDQUFDO0FBQ2xDO0FBQUM7QUFBQSxlQUVjTCxhQUFhO0FBQUEifQ==