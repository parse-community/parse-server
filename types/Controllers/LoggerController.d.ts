export var __esModule: boolean;
export default _default;
export namespace LogLevel {
    const INFO: string;
    const ERROR: string;
}
export namespace LogOrder {
    const DESCENDING: string;
    const ASCENDING: string;
}
declare const LoggerController_base: any;
export class LoggerController extends LoggerController_base {
    [x: string]: any;
    static validDateTime(date: any): any;
    static parseOptions(options?: {}): {
        from: any;
        until: any;
        size: number;
        order: any;
        level: any;
    };
    constructor(adapter: any, appId: any, options?: {
        logLevel: string;
    });
    maskSensitiveUrl(urlString: any): string;
    maskSensitive(argArray: any): any;
    log(level: any, args: any): void;
    info(...args: any[]): void;
    error(...args: any[]): void;
    warn(...args: any[]): void;
    verbose(...args: any[]): void;
    debug(...args: any[]): void;
    silly(...args: any[]): void;
    logRequest({ method, url, headers, body }: {
        method: any;
        url: any;
        headers: any;
        body: any;
    }): void;
    logResponse({ method, url, result }: {
        method: any;
        url: any;
        result: any;
    }): void;
    truncateLogMessage(string: any): any;
    getLogs(options?: {}): any;
    expectedAdapterType(): typeof _LoggerAdapter.LoggerAdapter;
}
declare var _default: typeof LoggerController;
import _LoggerAdapter = require("../Adapters/Logger/LoggerAdapter");
