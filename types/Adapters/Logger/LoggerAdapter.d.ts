export var __esModule: boolean;
export default _default;
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
    constructor(options: any);
    /**
     * log
     * @param {String} level
     * @param {String} message
     * @param {Object} metadata
     */
    log(level: string, message: string): void;
}
declare var _default: typeof LoggerAdapter;
