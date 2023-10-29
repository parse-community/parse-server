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
 * @interface
 * @memberof module:Adapters
 */
class WSSAdapter {
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
exports.WSSAdapter = WSSAdapter;
var _default = WSSAdapter;
exports.default = _default;
//# sourceMappingURL=data:application/json;charset=utf-8;base64,eyJ2ZXJzaW9uIjozLCJuYW1lcyI6WyJXU1NBZGFwdGVyIiwiY29uc3RydWN0b3IiLCJvcHRpb25zIiwib25MaXN0ZW4iLCJvbkNvbm5lY3Rpb24iLCJvbkVycm9yIiwic3RhcnQiLCJjbG9zZSIsImV4cG9ydHMiLCJfZGVmYXVsdCIsImRlZmF1bHQiXSwic291cmNlcyI6WyIuLi8uLi8uLi9zcmMvQWRhcHRlcnMvV2ViU29ja2V0U2VydmVyL1dTU0FkYXB0ZXIuanMiXSwic291cmNlc0NvbnRlbnQiOlsiLyplc2xpbnQgbm8tdW51c2VkLXZhcnM6IFwib2ZmXCIqL1xuLy8gV2ViU29ja2V0U2VydmVyIEFkYXB0ZXJcbi8vXG4vLyBBZGFwdGVyIGNsYXNzZXMgbXVzdCBpbXBsZW1lbnQgdGhlIGZvbGxvd2luZyBmdW5jdGlvbnM6XG4vLyAqIG9uTGlzdGVuKClcbi8vICogb25Db25uZWN0aW9uKHdzKVxuLy8gKiBvbkVycm9yKGVycm9yKVxuLy8gKiBzdGFydCgpXG4vLyAqIGNsb3NlKClcbi8vXG4vLyBEZWZhdWx0IGlzIFdTQWRhcHRlci4gVGhlIGFib3ZlIGZ1bmN0aW9ucyB3aWxsIGJlIGJpbmRlZC5cblxuLyoqXG4gKiBAaW50ZXJmYWNlXG4gKiBAbWVtYmVyb2YgbW9kdWxlOkFkYXB0ZXJzXG4gKi9cbmV4cG9ydCBjbGFzcyBXU1NBZGFwdGVyIHtcbiAgLyoqXG4gICAqIEBwYXJhbSB7T2JqZWN0fSBvcHRpb25zIC0ge2h0dHAuU2VydmVyfGh0dHBzLlNlcnZlcn0gc2VydmVyXG4gICAqL1xuICBjb25zdHJ1Y3RvcihvcHRpb25zKSB7XG4gICAgdGhpcy5vbkxpc3RlbiA9ICgpID0+IHt9O1xuICAgIHRoaXMub25Db25uZWN0aW9uID0gKCkgPT4ge307XG4gICAgdGhpcy5vbkVycm9yID0gKCkgPT4ge307XG4gIH1cblxuICAvLyAvKipcbiAgLy8gICogRW1pdHRlZCB3aGVuIHRoZSB1bmRlcmx5aW5nIHNlcnZlciBoYXMgYmVlbiBib3VuZC5cbiAgLy8gICovXG4gIC8vIG9uTGlzdGVuKCkge31cblxuICAvLyAvKipcbiAgLy8gICogRW1pdHRlZCB3aGVuIHRoZSBoYW5kc2hha2UgaXMgY29tcGxldGUuXG4gIC8vICAqXG4gIC8vICAqIEBwYXJhbSB7V2ViU29ja2V0fSB3cyAtIFJGQyA2NDU1IFdlYlNvY2tldC5cbiAgLy8gICovXG4gIC8vIG9uQ29ubmVjdGlvbih3cykge31cblxuICAvLyAvKipcbiAgLy8gICogRW1pdHRlZCB3aGVuIGVycm9yIGV2ZW50IGlzIGNhbGxlZC5cbiAgLy8gICpcbiAgLy8gICogQHBhcmFtIHtFcnJvcn0gZXJyb3IgLSBXZWJTb2NrZXRTZXJ2ZXIgZXJyb3JcbiAgLy8gICovXG4gIC8vIG9uRXJyb3IoZXJyb3IpIHt9XG5cbiAgLyoqXG4gICAqIEluaXRpYWxpemUgQ29ubmVjdGlvbi5cbiAgICpcbiAgICogQHBhcmFtIHtPYmplY3R9IG9wdGlvbnNcbiAgICovXG4gIHN0YXJ0KG9wdGlvbnMpIHt9XG5cbiAgLyoqXG4gICAqIENsb3NlcyBzZXJ2ZXIuXG4gICAqL1xuICBjbG9zZSgpIHt9XG59XG5cbmV4cG9ydCBkZWZhdWx0IFdTU0FkYXB0ZXI7XG4iXSwibWFwcGluZ3MiOiI7Ozs7OztBQUFBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7O0FBRUE7QUFDQTtBQUNBO0FBQ0E7QUFDTyxNQUFNQSxVQUFVLENBQUM7RUFDdEI7QUFDRjtBQUNBO0VBQ0VDLFdBQVdBLENBQUNDLE9BQU8sRUFBRTtJQUNuQixJQUFJLENBQUNDLFFBQVEsR0FBRyxNQUFNLENBQUMsQ0FBQztJQUN4QixJQUFJLENBQUNDLFlBQVksR0FBRyxNQUFNLENBQUMsQ0FBQztJQUM1QixJQUFJLENBQUNDLE9BQU8sR0FBRyxNQUFNLENBQUMsQ0FBQztFQUN6Qjs7RUFFQTtFQUNBO0VBQ0E7RUFDQTs7RUFFQTtFQUNBO0VBQ0E7RUFDQTtFQUNBO0VBQ0E7O0VBRUE7RUFDQTtFQUNBO0VBQ0E7RUFDQTtFQUNBOztFQUVBO0FBQ0Y7QUFDQTtBQUNBO0FBQ0E7RUFDRUMsS0FBS0EsQ0FBQ0osT0FBTyxFQUFFLENBQUM7O0VBRWhCO0FBQ0Y7QUFDQTtFQUNFSyxLQUFLQSxDQUFBLEVBQUcsQ0FBQztBQUNYO0FBQUNDLE9BQUEsQ0FBQVIsVUFBQSxHQUFBQSxVQUFBO0FBQUEsSUFBQVMsUUFBQSxHQUVjVCxVQUFVO0FBQUFRLE9BQUEsQ0FBQUUsT0FBQSxHQUFBRCxRQUFBIn0=