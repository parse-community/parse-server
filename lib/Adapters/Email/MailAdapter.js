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
//# sourceMappingURL=data:application/json;charset=utf-8;base64,eyJ2ZXJzaW9uIjozLCJuYW1lcyI6WyJNYWlsQWRhcHRlciIsInNlbmRNYWlsIiwib3B0aW9ucyIsImV4cG9ydHMiLCJfZGVmYXVsdCIsImRlZmF1bHQiXSwic291cmNlcyI6WyIuLi8uLi8uLi9zcmMvQWRhcHRlcnMvRW1haWwvTWFpbEFkYXB0ZXIuanMiXSwic291cmNlc0NvbnRlbnQiOlsiLyplc2xpbnQgbm8tdW51c2VkLXZhcnM6IFwib2ZmXCIqL1xuLyoqXG4gKiBAbW9kdWxlIEFkYXB0ZXJzXG4gKi9cbi8qKlxuICogQGludGVyZmFjZSBNYWlsQWRhcHRlclxuICogTWFpbCBBZGFwdGVyIHByb3RvdHlwZVxuICogQSBNYWlsQWRhcHRlciBzaG91bGQgaW1wbGVtZW50IGF0IGxlYXN0IHNlbmRNYWlsKClcbiAqL1xuZXhwb3J0IGNsYXNzIE1haWxBZGFwdGVyIHtcbiAgLyoqXG4gICAqIEEgbWV0aG9kIGZvciBzZW5kaW5nIG1haWxcbiAgICogQHBhcmFtIG9wdGlvbnMgd291bGQgaGF2ZSB0aGUgcGFyYW1ldGVyc1xuICAgKiAtIHRvOiB0aGUgcmVjaXBpZW50XG4gICAqIC0gdGV4dDogdGhlIHJhdyB0ZXh0IG9mIHRoZSBtZXNzYWdlXG4gICAqIC0gc3ViamVjdDogdGhlIHN1YmplY3Qgb2YgdGhlIGVtYWlsXG4gICAqL1xuICBzZW5kTWFpbChvcHRpb25zKSB7fVxuXG4gIC8qIFlvdSBjYW4gaW1wbGVtZW50IHRob3NlIG1ldGhvZHMgaWYgeW91IHdhbnRcbiAgICogdG8gcHJvdmlkZSBIVE1MIHRlbXBsYXRlcyBldGMuLi5cbiAgICovXG4gIC8vIHNlbmRWZXJpZmljYXRpb25FbWFpbCh7IGxpbmssIGFwcE5hbWUsIHVzZXIgfSkge31cbiAgLy8gc2VuZFBhc3N3b3JkUmVzZXRFbWFpbCh7IGxpbmssIGFwcE5hbWUsIHVzZXIgfSkge31cbn1cblxuZXhwb3J0IGRlZmF1bHQgTWFpbEFkYXB0ZXI7XG4iXSwibWFwcGluZ3MiOiI7Ozs7OztBQUFBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNPLE1BQU1BLFdBQVcsQ0FBQztFQUN2QjtBQUNGO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtFQUNFQyxRQUFRQSxDQUFDQyxPQUFPLEVBQUUsQ0FBQzs7RUFFbkI7QUFDRjtBQUNBO0VBQ0U7RUFDQTtBQUNGO0FBQUNDLE9BQUEsQ0FBQUgsV0FBQSxHQUFBQSxXQUFBO0FBQUEsSUFBQUksUUFBQSxHQUVjSixXQUFXO0FBQUFHLE9BQUEsQ0FBQUUsT0FBQSxHQUFBRCxRQUFBIn0=