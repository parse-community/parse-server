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
export class LoggerAdapter {
  constructor(options) {}
  /**
   * log
   * @param {String} level
   * @param {String} message
   * @param {Object} metadata
   */
  log(level, message /* meta */) {}
}

export default LoggerAdapter;
