/// <reference types="node" />
export var __esModule: boolean;
export default _default;
declare var _default: typeof ParseServer;
declare class ParseServer {
    /**
     * @static
     * Create an express app for the parse server
     * @param {Object} options let you specify the maxUploadSize when creating the express app  */
    static app(options: any): import("express-serve-static-core").Express;
    static promiseRouter({ appId }: {
        appId: any;
    }): any;
    /**
     * Creates a new ParseServer and starts it.
     * @param {ParseServerOptions} options used to start the server
     * @param {Function} callback called when the server has started
     * @returns {ParseServer} the parse server instance
     */
    static start(options: any, callback: Function): ParseServer;
    /**
     * Helper method to create a liveQuery server
     * @static
     * @param {Server} httpServer an optional http server to pass
     * @param {LiveQueryServerOptions} config options for the liveQueryServer
     * @param {ParseServerOptions} options options for the ParseServer
     * @returns {ParseLiveQueryServer} the live query server instance
     */
    static createLiveQueryServer(httpServer: any, config: any, options: any): any;
    static verifyServerUrl(callback: any): void;
    /**
     * @constructor
     * @param {ParseServerOptions} options the parse server initialization options
     */
    constructor(options: any);
    config: any;
    get app(): import("express-serve-static-core").Express;
    _app: import("express-serve-static-core").Express;
    handleShutdown(): Promise<void>;
    /**
     * starts the parse server's express app
     * @param {ParseServerOptions} options to use to start the server
     * @param {Function} callback called when the server has started
     * @returns {ParseServer} the parse server instance
     */
    start(options: any, callback: Function): ParseServer;
    server: import("http").Server;
    liveQueryServer: any;
    expressApp: import("express-serve-static-core").Express;
}
