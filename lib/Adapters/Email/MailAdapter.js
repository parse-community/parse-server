"use strict";

Object.defineProperty(exports, "__esModule", {
  value: true
});
exports.default = exports.MailAdapter = void 0;
/*eslint no-unused-vars: "off"*/
/**
 * @interface
 * @memberof module:Adapters
 * Mail Adapter prototype
 * A MailAdapter should implement at least sendMail()
 */
class MailAdapter {
  /**
   * A method for sending mail
   * @param options would have the parameters
   * - to: the recipient
   * - text: the raw text of the message
   * - subject: the subject of the email
   */
  sendMail(options) {}

  /* You can implement those methods if you want
   * to provide HTML templates etc...
   */
  // sendVerificationEmail({ link, appName, user }) {}
  // sendPasswordResetEmail({ link, appName, user }) {}
}
exports.MailAdapter = MailAdapter;
var _default = MailAdapter;
exports.default = _default;
//# sourceMappingURL=data:application/json;charset=utf-8;base64,eyJ2ZXJzaW9uIjozLCJuYW1lcyI6WyJNYWlsQWRhcHRlciIsInNlbmRNYWlsIiwib3B0aW9ucyIsImV4cG9ydHMiLCJfZGVmYXVsdCIsImRlZmF1bHQiXSwic291cmNlcyI6WyIuLi8uLi8uLi9zcmMvQWRhcHRlcnMvRW1haWwvTWFpbEFkYXB0ZXIuanMiXSwic291cmNlc0NvbnRlbnQiOlsiLyplc2xpbnQgbm8tdW51c2VkLXZhcnM6IFwib2ZmXCIqL1xuLyoqXG4gKiBAaW50ZXJmYWNlXG4gKiBAbWVtYmVyb2YgbW9kdWxlOkFkYXB0ZXJzXG4gKiBNYWlsIEFkYXB0ZXIgcHJvdG90eXBlXG4gKiBBIE1haWxBZGFwdGVyIHNob3VsZCBpbXBsZW1lbnQgYXQgbGVhc3Qgc2VuZE1haWwoKVxuICovXG5leHBvcnQgY2xhc3MgTWFpbEFkYXB0ZXIge1xuICAvKipcbiAgICogQSBtZXRob2QgZm9yIHNlbmRpbmcgbWFpbFxuICAgKiBAcGFyYW0gb3B0aW9ucyB3b3VsZCBoYXZlIHRoZSBwYXJhbWV0ZXJzXG4gICAqIC0gdG86IHRoZSByZWNpcGllbnRcbiAgICogLSB0ZXh0OiB0aGUgcmF3IHRleHQgb2YgdGhlIG1lc3NhZ2VcbiAgICogLSBzdWJqZWN0OiB0aGUgc3ViamVjdCBvZiB0aGUgZW1haWxcbiAgICovXG4gIHNlbmRNYWlsKG9wdGlvbnMpIHt9XG5cbiAgLyogWW91IGNhbiBpbXBsZW1lbnQgdGhvc2UgbWV0aG9kcyBpZiB5b3Ugd2FudFxuICAgKiB0byBwcm92aWRlIEhUTUwgdGVtcGxhdGVzIGV0Yy4uLlxuICAgKi9cbiAgLy8gc2VuZFZlcmlmaWNhdGlvbkVtYWlsKHsgbGluaywgYXBwTmFtZSwgdXNlciB9KSB7fVxuICAvLyBzZW5kUGFzc3dvcmRSZXNldEVtYWlsKHsgbGluaywgYXBwTmFtZSwgdXNlciB9KSB7fVxufVxuXG5leHBvcnQgZGVmYXVsdCBNYWlsQWRhcHRlcjtcbiJdLCJtYXBwaW5ncyI6Ijs7Ozs7O0FBQUE7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDTyxNQUFNQSxXQUFXLENBQUM7RUFDdkI7QUFDRjtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7RUFDRUMsUUFBUUEsQ0FBQ0MsT0FBTyxFQUFFLENBQUM7O0VBRW5CO0FBQ0Y7QUFDQTtFQUNFO0VBQ0E7QUFDRjtBQUFDQyxPQUFBLENBQUFILFdBQUEsR0FBQUEsV0FBQTtBQUFBLElBQUFJLFFBQUEsR0FFY0osV0FBVztBQUFBRyxPQUFBLENBQUFFLE9BQUEsR0FBQUQsUUFBQSJ9