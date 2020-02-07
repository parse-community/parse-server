/*eslint no-unused-vars: "off"*/
// WebSocketServer Adapter
//
// Adapter classes must implement the following functions:
// * onListen()
// * onConnection(ws)
// * onError(error)
// * start()
// * close()
//
// Default is WSAdapter. The above functions will be binded.

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
  constructor(options) {
    this.onListen = () => {};
    this.onConnection = () => {};
    this.onError = () => {};
  }

  // /**
  //  * Emitted when the underlying server has been bound.
  //  */
  // onListen() {}

  // /**
  //  * Emitted when the handshake is complete.
  //  *
  //  * @param {WebSocket} ws - RFC 6455 WebSocket.
  //  */
  // onConnection(ws) {}

  // /**
  //  * Emitted when error event is called.
  //  *
  //  * @param {Error} error - WebSocketServer error
  //  */
  // onError(error) {}

  /**
   * Initialize Connection.
   *
   * @param {Object} options
   */
  start(options) {}

  /**
   * Closes server.
   */
  close() {}
}

export default WSSAdapter;
