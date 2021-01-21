"use strict";

Object.defineProperty(exports, "__esModule", {
  value: true
});
exports.default = exports.PushAdapter = void 0;

/*eslint no-unused-vars: "off"*/
// Push Adapter
//
// Allows you to change the push notification mechanism.
//
// Adapter classes must implement the following functions:
// * getValidPushTypes()
// * send(devices, installations, pushStatus)
//
// Default is ParsePushAdapter, which uses GCM for
// android push and APNS for ios push.

/**
 * @module Adapters
 */

/**
 * @interface PushAdapter
 */
class PushAdapter {
  /**
   * @param {any} body
   * @param {Parse.Installation[]} installations
   * @param {any} pushStatus
   * @returns {Promise}
   */
  send(body, installations, pushStatus) {}
  /**
   * Get an array of valid push types.
   * @returns {Array} An array of valid push types
   */


  getValidPushTypes() {
    return [];
  }

}

exports.PushAdapter = PushAdapter;
var _default = PushAdapter;
exports.default = _default;
//# sourceMappingURL=data:application/json;charset=utf-8;base64,eyJ2ZXJzaW9uIjozLCJzb3VyY2VzIjpbIi4uLy4uLy4uL3NyYy9BZGFwdGVycy9QdXNoL1B1c2hBZGFwdGVyLmpzIl0sIm5hbWVzIjpbIlB1c2hBZGFwdGVyIiwic2VuZCIsImJvZHkiLCJpbnN0YWxsYXRpb25zIiwicHVzaFN0YXR1cyIsImdldFZhbGlkUHVzaFR5cGVzIl0sIm1hcHBpbmdzIjoiOzs7Ozs7O0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTs7QUFFQTs7OztBQUdBOzs7QUFHTyxNQUFNQSxXQUFOLENBQWtCO0FBQ3ZCOzs7Ozs7QUFNQUMsRUFBQUEsSUFBSSxDQUFDQyxJQUFELEVBQVlDLGFBQVosRUFBa0NDLFVBQWxDLEVBQWdFLENBQUU7QUFFdEU7Ozs7OztBQUlBQyxFQUFBQSxpQkFBaUIsR0FBYTtBQUM1QixXQUFPLEVBQVA7QUFDRDs7QUFmc0I7OztlQWtCVkwsVyIsInNvdXJjZXNDb250ZW50IjpbIi8vIEBmbG93XG4vKmVzbGludCBuby11bnVzZWQtdmFyczogXCJvZmZcIiovXG4vLyBQdXNoIEFkYXB0ZXJcbi8vXG4vLyBBbGxvd3MgeW91IHRvIGNoYW5nZSB0aGUgcHVzaCBub3RpZmljYXRpb24gbWVjaGFuaXNtLlxuLy9cbi8vIEFkYXB0ZXIgY2xhc3NlcyBtdXN0IGltcGxlbWVudCB0aGUgZm9sbG93aW5nIGZ1bmN0aW9uczpcbi8vICogZ2V0VmFsaWRQdXNoVHlwZXMoKVxuLy8gKiBzZW5kKGRldmljZXMsIGluc3RhbGxhdGlvbnMsIHB1c2hTdGF0dXMpXG4vL1xuLy8gRGVmYXVsdCBpcyBQYXJzZVB1c2hBZGFwdGVyLCB3aGljaCB1c2VzIEdDTSBmb3Jcbi8vIGFuZHJvaWQgcHVzaCBhbmQgQVBOUyBmb3IgaW9zIHB1c2guXG5cbi8qKlxuICogQG1vZHVsZSBBZGFwdGVyc1xuICovXG4vKipcbiAqIEBpbnRlcmZhY2UgUHVzaEFkYXB0ZXJcbiAqL1xuZXhwb3J0IGNsYXNzIFB1c2hBZGFwdGVyIHtcbiAgLyoqXG4gICAqIEBwYXJhbSB7YW55fSBib2R5XG4gICAqIEBwYXJhbSB7UGFyc2UuSW5zdGFsbGF0aW9uW119IGluc3RhbGxhdGlvbnNcbiAgICogQHBhcmFtIHthbnl9IHB1c2hTdGF0dXNcbiAgICogQHJldHVybnMge1Byb21pc2V9XG4gICAqL1xuICBzZW5kKGJvZHk6IGFueSwgaW5zdGFsbGF0aW9uczogYW55W10sIHB1c2hTdGF0dXM6IGFueSk6ID9Qcm9taXNlPCo+IHt9XG5cbiAgLyoqXG4gICAqIEdldCBhbiBhcnJheSBvZiB2YWxpZCBwdXNoIHR5cGVzLlxuICAgKiBAcmV0dXJucyB7QXJyYXl9IEFuIGFycmF5IG9mIHZhbGlkIHB1c2ggdHlwZXNcbiAgICovXG4gIGdldFZhbGlkUHVzaFR5cGVzKCk6IHN0cmluZ1tdIHtcbiAgICByZXR1cm4gW107XG4gIH1cbn1cblxuZXhwb3J0IGRlZmF1bHQgUHVzaEFkYXB0ZXI7XG4iXX0=