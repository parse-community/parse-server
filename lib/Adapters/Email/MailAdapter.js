"use strict";

Object.defineProperty(exports, "__esModule", {
  value: true
});
exports.default = exports.MailAdapter = void 0;

/*eslint no-unused-vars: "off"*/

/**
 * @module Adapters
 */

/**
 * @interface MailAdapter
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
//# sourceMappingURL=data:application/json;charset=utf-8;base64,eyJ2ZXJzaW9uIjozLCJzb3VyY2VzIjpbIi4uLy4uLy4uL3NyYy9BZGFwdGVycy9FbWFpbC9NYWlsQWRhcHRlci5qcyJdLCJuYW1lcyI6WyJNYWlsQWRhcHRlciIsInNlbmRNYWlsIiwib3B0aW9ucyJdLCJtYXBwaW5ncyI6Ijs7Ozs7OztBQUFBOztBQUNBOzs7O0FBR0E7Ozs7O0FBS08sTUFBTUEsV0FBTixDQUFrQjtBQUN2Qjs7Ozs7OztBQU9BQyxFQUFBQSxRQUFRLENBQUNDLE9BQUQsRUFBVSxDQUFFO0FBRXBCOzs7QUFHQTtBQUNBOzs7QUFkdUI7OztlQWlCVkYsVyIsInNvdXJjZXNDb250ZW50IjpbIi8qZXNsaW50IG5vLXVudXNlZC12YXJzOiBcIm9mZlwiKi9cbi8qKlxuICogQG1vZHVsZSBBZGFwdGVyc1xuICovXG4vKipcbiAqIEBpbnRlcmZhY2UgTWFpbEFkYXB0ZXJcbiAqIE1haWwgQWRhcHRlciBwcm90b3R5cGVcbiAqIEEgTWFpbEFkYXB0ZXIgc2hvdWxkIGltcGxlbWVudCBhdCBsZWFzdCBzZW5kTWFpbCgpXG4gKi9cbmV4cG9ydCBjbGFzcyBNYWlsQWRhcHRlciB7XG4gIC8qKlxuICAgKiBBIG1ldGhvZCBmb3Igc2VuZGluZyBtYWlsXG4gICAqIEBwYXJhbSBvcHRpb25zIHdvdWxkIGhhdmUgdGhlIHBhcmFtZXRlcnNcbiAgICogLSB0bzogdGhlIHJlY2lwaWVudFxuICAgKiAtIHRleHQ6IHRoZSByYXcgdGV4dCBvZiB0aGUgbWVzc2FnZVxuICAgKiAtIHN1YmplY3Q6IHRoZSBzdWJqZWN0IG9mIHRoZSBlbWFpbFxuICAgKi9cbiAgc2VuZE1haWwob3B0aW9ucykge31cblxuICAvKiBZb3UgY2FuIGltcGxlbWVudCB0aG9zZSBtZXRob2RzIGlmIHlvdSB3YW50XG4gICAqIHRvIHByb3ZpZGUgSFRNTCB0ZW1wbGF0ZXMgZXRjLi4uXG4gICAqL1xuICAvLyBzZW5kVmVyaWZpY2F0aW9uRW1haWwoeyBsaW5rLCBhcHBOYW1lLCB1c2VyIH0pIHt9XG4gIC8vIHNlbmRQYXNzd29yZFJlc2V0RW1haWwoeyBsaW5rLCBhcHBOYW1lLCB1c2VyIH0pIHt9XG59XG5cbmV4cG9ydCBkZWZhdWx0IE1haWxBZGFwdGVyO1xuIl19