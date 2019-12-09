"use strict";

Object.defineProperty(exports, "__esModule", {
  value: true
});
exports.default = exports.WSSAdapter = void 0;

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
class WSSAdapter {
  /**
   * @param {Object} options - {http.Server|https.Server} server
   */
  constructor(options) {
    this.onListen = () => {};

    this.onConnection = () => {};

    this.onError = () => {};
  } // /**
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

exports.WSSAdapter = WSSAdapter;
var _default = WSSAdapter;
exports.default = _default;
//# sourceMappingURL=data:application/json;charset=utf-8;base64,eyJ2ZXJzaW9uIjozLCJzb3VyY2VzIjpbIi4uLy4uLy4uL3NyYy9BZGFwdGVycy9XZWJTb2NrZXRTZXJ2ZXIvV1NTQWRhcHRlci5qcyJdLCJuYW1lcyI6WyJXU1NBZGFwdGVyIiwiY29uc3RydWN0b3IiLCJvcHRpb25zIiwib25MaXN0ZW4iLCJvbkNvbm5lY3Rpb24iLCJvbkVycm9yIiwic3RhcnQiLCJjbG9zZSJdLCJtYXBwaW5ncyI6Ijs7Ozs7OztBQUFBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7O0FBRUE7Ozs7QUFHQTs7O0FBR08sTUFBTUEsVUFBTixDQUFpQjtBQUN0Qjs7O0FBR0FDLEVBQUFBLFdBQVcsQ0FBQ0MsT0FBRCxFQUFVO0FBQ25CLFNBQUtDLFFBQUwsR0FBZ0IsTUFBTSxDQUFFLENBQXhCOztBQUNBLFNBQUtDLFlBQUwsR0FBb0IsTUFBTSxDQUFFLENBQTVCOztBQUNBLFNBQUtDLE9BQUwsR0FBZSxNQUFNLENBQUUsQ0FBdkI7QUFDRCxHQVJxQixDQVV0QjtBQUNBO0FBQ0E7QUFDQTtBQUVBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUVBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTs7QUFFQTs7Ozs7OztBQUtBQyxFQUFBQSxLQUFLLENBQUNKLE9BQUQsRUFBVSxDQUFFO0FBRWpCOzs7OztBQUdBSyxFQUFBQSxLQUFLLEdBQUcsQ0FBRTs7QUF2Q1k7OztlQTBDVFAsVSIsInNvdXJjZXNDb250ZW50IjpbIi8qZXNsaW50IG5vLXVudXNlZC12YXJzOiBcIm9mZlwiKi9cbi8vIFdlYlNvY2tldFNlcnZlciBBZGFwdGVyXG4vL1xuLy8gQWRhcHRlciBjbGFzc2VzIG11c3QgaW1wbGVtZW50IHRoZSBmb2xsb3dpbmcgZnVuY3Rpb25zOlxuLy8gKiBvbkxpc3RlbigpXG4vLyAqIG9uQ29ubmVjdGlvbih3cylcbi8vICogb25FcnJvcihlcnJvcilcbi8vICogc3RhcnQoKVxuLy8gKiBjbG9zZSgpXG4vL1xuLy8gRGVmYXVsdCBpcyBXU0FkYXB0ZXIuIFRoZSBhYm92ZSBmdW5jdGlvbnMgd2lsbCBiZSBiaW5kZWQuXG5cbi8qKlxuICogQG1vZHVsZSBBZGFwdGVyc1xuICovXG4vKipcbiAqIEBpbnRlcmZhY2UgV1NTQWRhcHRlclxuICovXG5leHBvcnQgY2xhc3MgV1NTQWRhcHRlciB7XG4gIC8qKlxuICAgKiBAcGFyYW0ge09iamVjdH0gb3B0aW9ucyAtIHtodHRwLlNlcnZlcnxodHRwcy5TZXJ2ZXJ9IHNlcnZlclxuICAgKi9cbiAgY29uc3RydWN0b3Iob3B0aW9ucykge1xuICAgIHRoaXMub25MaXN0ZW4gPSAoKSA9PiB7fTtcbiAgICB0aGlzLm9uQ29ubmVjdGlvbiA9ICgpID0+IHt9O1xuICAgIHRoaXMub25FcnJvciA9ICgpID0+IHt9O1xuICB9XG5cbiAgLy8gLyoqXG4gIC8vICAqIEVtaXR0ZWQgd2hlbiB0aGUgdW5kZXJseWluZyBzZXJ2ZXIgaGFzIGJlZW4gYm91bmQuXG4gIC8vICAqL1xuICAvLyBvbkxpc3RlbigpIHt9XG5cbiAgLy8gLyoqXG4gIC8vICAqIEVtaXR0ZWQgd2hlbiB0aGUgaGFuZHNoYWtlIGlzIGNvbXBsZXRlLlxuICAvLyAgKlxuICAvLyAgKiBAcGFyYW0ge1dlYlNvY2tldH0gd3MgLSBSRkMgNjQ1NSBXZWJTb2NrZXQuXG4gIC8vICAqL1xuICAvLyBvbkNvbm5lY3Rpb24od3MpIHt9XG5cbiAgLy8gLyoqXG4gIC8vICAqIEVtaXR0ZWQgd2hlbiBlcnJvciBldmVudCBpcyBjYWxsZWQuXG4gIC8vICAqXG4gIC8vICAqIEBwYXJhbSB7RXJyb3J9IGVycm9yIC0gV2ViU29ja2V0U2VydmVyIGVycm9yXG4gIC8vICAqL1xuICAvLyBvbkVycm9yKGVycm9yKSB7fVxuXG4gIC8qKlxuICAgKiBJbml0aWFsaXplIENvbm5lY3Rpb24uXG4gICAqXG4gICAqIEBwYXJhbSB7T2JqZWN0fSBvcHRpb25zXG4gICAqL1xuICBzdGFydChvcHRpb25zKSB7fVxuXG4gIC8qKlxuICAgKiBDbG9zZXMgc2VydmVyLlxuICAgKi9cbiAgY2xvc2UoKSB7fVxufVxuXG5leHBvcnQgZGVmYXVsdCBXU1NBZGFwdGVyO1xuIl19