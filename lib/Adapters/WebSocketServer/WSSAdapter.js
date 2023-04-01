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
//# sourceMappingURL=data:application/json;charset=utf-8;base64,eyJ2ZXJzaW9uIjozLCJuYW1lcyI6WyJXU1NBZGFwdGVyIiwiY29uc3RydWN0b3IiLCJvcHRpb25zIiwib25MaXN0ZW4iLCJvbkNvbm5lY3Rpb24iLCJvbkVycm9yIiwic3RhcnQiLCJjbG9zZSJdLCJzb3VyY2VzIjpbIi4uLy4uLy4uL3NyYy9BZGFwdGVycy9XZWJTb2NrZXRTZXJ2ZXIvV1NTQWRhcHRlci5qcyJdLCJzb3VyY2VzQ29udGVudCI6WyIvKmVzbGludCBuby11bnVzZWQtdmFyczogXCJvZmZcIiovXG4vLyBXZWJTb2NrZXRTZXJ2ZXIgQWRhcHRlclxuLy9cbi8vIEFkYXB0ZXIgY2xhc3NlcyBtdXN0IGltcGxlbWVudCB0aGUgZm9sbG93aW5nIGZ1bmN0aW9uczpcbi8vICogb25MaXN0ZW4oKVxuLy8gKiBvbkNvbm5lY3Rpb24od3MpXG4vLyAqIG9uRXJyb3IoZXJyb3IpXG4vLyAqIHN0YXJ0KClcbi8vICogY2xvc2UoKVxuLy9cbi8vIERlZmF1bHQgaXMgV1NBZGFwdGVyLiBUaGUgYWJvdmUgZnVuY3Rpb25zIHdpbGwgYmUgYmluZGVkLlxuXG4vKipcbiAqIEBtb2R1bGUgQWRhcHRlcnNcbiAqL1xuLyoqXG4gKiBAaW50ZXJmYWNlIFdTU0FkYXB0ZXJcbiAqL1xuZXhwb3J0IGNsYXNzIFdTU0FkYXB0ZXIge1xuICAvKipcbiAgICogQHBhcmFtIHtPYmplY3R9IG9wdGlvbnMgLSB7aHR0cC5TZXJ2ZXJ8aHR0cHMuU2VydmVyfSBzZXJ2ZXJcbiAgICovXG4gIGNvbnN0cnVjdG9yKG9wdGlvbnMpIHtcbiAgICB0aGlzLm9uTGlzdGVuID0gKCkgPT4ge307XG4gICAgdGhpcy5vbkNvbm5lY3Rpb24gPSAoKSA9PiB7fTtcbiAgICB0aGlzLm9uRXJyb3IgPSAoKSA9PiB7fTtcbiAgfVxuXG4gIC8vIC8qKlxuICAvLyAgKiBFbWl0dGVkIHdoZW4gdGhlIHVuZGVybHlpbmcgc2VydmVyIGhhcyBiZWVuIGJvdW5kLlxuICAvLyAgKi9cbiAgLy8gb25MaXN0ZW4oKSB7fVxuXG4gIC8vIC8qKlxuICAvLyAgKiBFbWl0dGVkIHdoZW4gdGhlIGhhbmRzaGFrZSBpcyBjb21wbGV0ZS5cbiAgLy8gICpcbiAgLy8gICogQHBhcmFtIHtXZWJTb2NrZXR9IHdzIC0gUkZDIDY0NTUgV2ViU29ja2V0LlxuICAvLyAgKi9cbiAgLy8gb25Db25uZWN0aW9uKHdzKSB7fVxuXG4gIC8vIC8qKlxuICAvLyAgKiBFbWl0dGVkIHdoZW4gZXJyb3IgZXZlbnQgaXMgY2FsbGVkLlxuICAvLyAgKlxuICAvLyAgKiBAcGFyYW0ge0Vycm9yfSBlcnJvciAtIFdlYlNvY2tldFNlcnZlciBlcnJvclxuICAvLyAgKi9cbiAgLy8gb25FcnJvcihlcnJvcikge31cblxuICAvKipcbiAgICogSW5pdGlhbGl6ZSBDb25uZWN0aW9uLlxuICAgKlxuICAgKiBAcGFyYW0ge09iamVjdH0gb3B0aW9uc1xuICAgKi9cbiAgc3RhcnQob3B0aW9ucykge31cblxuICAvKipcbiAgICogQ2xvc2VzIHNlcnZlci5cbiAgICovXG4gIGNsb3NlKCkge31cbn1cblxuZXhwb3J0IGRlZmF1bHQgV1NTQWRhcHRlcjtcbiJdLCJtYXBwaW5ncyI6Ijs7Ozs7O0FBQUE7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTs7QUFFQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDTyxNQUFNQSxVQUFVLENBQUM7RUFDdEI7QUFDRjtBQUNBO0VBQ0VDLFdBQVcsQ0FBQ0MsT0FBTyxFQUFFO0lBQ25CLElBQUksQ0FBQ0MsUUFBUSxHQUFHLE1BQU0sQ0FBQyxDQUFDO0lBQ3hCLElBQUksQ0FBQ0MsWUFBWSxHQUFHLE1BQU0sQ0FBQyxDQUFDO0lBQzVCLElBQUksQ0FBQ0MsT0FBTyxHQUFHLE1BQU0sQ0FBQyxDQUFDO0VBQ3pCOztFQUVBO0VBQ0E7RUFDQTtFQUNBOztFQUVBO0VBQ0E7RUFDQTtFQUNBO0VBQ0E7RUFDQTs7RUFFQTtFQUNBO0VBQ0E7RUFDQTtFQUNBO0VBQ0E7O0VBRUE7QUFDRjtBQUNBO0FBQ0E7QUFDQTtFQUNFQyxLQUFLLENBQUNKLE9BQU8sRUFBRSxDQUFDOztFQUVoQjtBQUNGO0FBQ0E7RUFDRUssS0FBSyxHQUFHLENBQUM7QUFDWDtBQUFDO0FBQUEsZUFFY1AsVUFBVTtBQUFBIn0=