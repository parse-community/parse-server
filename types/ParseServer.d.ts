import { ParseServerOptions, LiveQueryServerOptions } from './Options';
import { ParseLiveQueryServer } from './LiveQuery/ParseLiveQueryServer';
declare class ParseServer {
    _app: any;
    config: any;
    server: any;
    expressApp: any;
    liveQueryServer: any;
    /**
     * @constructor
     * @param {ParseServerOptions} options the parse server initialization options
     */
    constructor(options: ParseServerOptions);
    /**
     * Starts Parse Server as an express app; this promise resolves when Parse Server is ready to accept requests.
     */
    start(): Promise<this>;
    get app(): any;
    /**
     * Stops the parse server, cancels any ongoing requests and closes all connections.
     *
     * Currently, express doesn't shut down immediately after receiving SIGINT/SIGTERM
     * if it has client connections that haven't timed out.
     * (This is a known issue with node - https://github.com/nodejs/node/issues/2642)
     *
     * @returns {Promise<void>} a promise that resolves when the server is stopped
     */
    handleShutdown(): Promise<void>;
    /**
     * @static
     * Create an express app for the parse server
     * @param {Object} options let you specify the maxUploadSize when creating the express app  */
    static app(options: any): any;
    static promiseRouter({ appId }: {
        appId: any;
    }): any;
    /**
     * starts the parse server's express app
     * @param {ParseServerOptions} options to use to start the server
     * @returns {ParseServer} the parse server instance
     */
    startApp(options: ParseServerOptions): Promise<this>;
    /**
     * Creates a new ParseServer and starts it.
     * @param {ParseServerOptions} options used to start the server
     * @returns {ParseServer} the parse server instance
     */
    static startApp(options: ParseServerOptions): Promise<ParseServer>;
    /**
     * Helper method to create a liveQuery server
     * @static
     * @param {Server} httpServer an optional http server to pass
     * @param {LiveQueryServerOptions} config options for the liveQueryServer
     * @param {ParseServerOptions} options options for the ParseServer
     * @returns {Promise<ParseLiveQueryServer>} the live query server instance
     */
    static createLiveQueryServer(httpServer: any, config: LiveQueryServerOptions, options: ParseServerOptions): Promise<ParseLiveQueryServer>;
    static verifyServerUrl(): any;
}
export default ParseServer;
