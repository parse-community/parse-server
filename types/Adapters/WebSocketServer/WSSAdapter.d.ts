export var __esModule: boolean;
export default _default;
/**
 * @module Adapters
 */
/**
 * @interface WSSAdapter
 */
export class WSSAdapter {
    /**
     * @param {Object} options - {http.Server|https.Server} server
     */
    constructor(options: any);
    onListen: () => void;
    onConnection: () => void;
    onError: () => void;
    /**
     * Initialize Connection.
     *
     * @param {Object} options
     */
    start(options: any): void;
    /**
     * Closes server.
     */
    close(): void;
}
declare var _default: typeof WSSAdapter;
