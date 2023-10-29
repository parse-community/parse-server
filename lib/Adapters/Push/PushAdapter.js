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
 * @interface
 * @memberof module:Adapters
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
//# sourceMappingURL=data:application/json;charset=utf-8;base64,eyJ2ZXJzaW9uIjozLCJuYW1lcyI6WyJQdXNoQWRhcHRlciIsInNlbmQiLCJib2R5IiwiaW5zdGFsbGF0aW9ucyIsInB1c2hTdGF0dXMiLCJnZXRWYWxpZFB1c2hUeXBlcyIsImV4cG9ydHMiLCJfZGVmYXVsdCIsImRlZmF1bHQiXSwic291cmNlcyI6WyIuLi8uLi8uLi9zcmMvQWRhcHRlcnMvUHVzaC9QdXNoQWRhcHRlci5qcyJdLCJzb3VyY2VzQ29udGVudCI6WyIvLyBAZmxvd1xuLyplc2xpbnQgbm8tdW51c2VkLXZhcnM6IFwib2ZmXCIqL1xuLy8gUHVzaCBBZGFwdGVyXG4vL1xuLy8gQWxsb3dzIHlvdSB0byBjaGFuZ2UgdGhlIHB1c2ggbm90aWZpY2F0aW9uIG1lY2hhbmlzbS5cbi8vXG4vLyBBZGFwdGVyIGNsYXNzZXMgbXVzdCBpbXBsZW1lbnQgdGhlIGZvbGxvd2luZyBmdW5jdGlvbnM6XG4vLyAqIGdldFZhbGlkUHVzaFR5cGVzKClcbi8vICogc2VuZChkZXZpY2VzLCBpbnN0YWxsYXRpb25zLCBwdXNoU3RhdHVzKVxuLy9cbi8vIERlZmF1bHQgaXMgUGFyc2VQdXNoQWRhcHRlciwgd2hpY2ggdXNlcyBHQ00gZm9yXG4vLyBhbmRyb2lkIHB1c2ggYW5kIEFQTlMgZm9yIGlvcyBwdXNoLlxuXG4vKipcbiAqIEBpbnRlcmZhY2VcbiAqIEBtZW1iZXJvZiBtb2R1bGU6QWRhcHRlcnNcbiAqL1xuZXhwb3J0IGNsYXNzIFB1c2hBZGFwdGVyIHtcbiAgLyoqXG4gICAqIEBwYXJhbSB7YW55fSBib2R5XG4gICAqIEBwYXJhbSB7UGFyc2UuSW5zdGFsbGF0aW9uW119IGluc3RhbGxhdGlvbnNcbiAgICogQHBhcmFtIHthbnl9IHB1c2hTdGF0dXNcbiAgICogQHJldHVybnMge1Byb21pc2V9XG4gICAqL1xuICBzZW5kKGJvZHk6IGFueSwgaW5zdGFsbGF0aW9uczogYW55W10sIHB1c2hTdGF0dXM6IGFueSk6ID9Qcm9taXNlPCo+IHt9XG5cbiAgLyoqXG4gICAqIEdldCBhbiBhcnJheSBvZiB2YWxpZCBwdXNoIHR5cGVzLlxuICAgKiBAcmV0dXJucyB7QXJyYXl9IEFuIGFycmF5IG9mIHZhbGlkIHB1c2ggdHlwZXNcbiAgICovXG4gIGdldFZhbGlkUHVzaFR5cGVzKCk6IHN0cmluZ1tdIHtcbiAgICByZXR1cm4gW107XG4gIH1cbn1cblxuZXhwb3J0IGRlZmF1bHQgUHVzaEFkYXB0ZXI7XG4iXSwibWFwcGluZ3MiOiI7Ozs7OztBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFFQTtBQUNBO0FBQ0E7QUFDQTtBQUNPLE1BQU1BLFdBQVcsQ0FBQztFQUN2QjtBQUNGO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7RUFDRUMsSUFBSUEsQ0FBQ0MsSUFBUyxFQUFFQyxhQUFvQixFQUFFQyxVQUFlLEVBQWUsQ0FBQzs7RUFFckU7QUFDRjtBQUNBO0FBQ0E7RUFDRUMsaUJBQWlCQSxDQUFBLEVBQWE7SUFDNUIsT0FBTyxFQUFFO0VBQ1g7QUFDRjtBQUFDQyxPQUFBLENBQUFOLFdBQUEsR0FBQUEsV0FBQTtBQUFBLElBQUFPLFFBQUEsR0FFY1AsV0FBVztBQUFBTSxPQUFBLENBQUFFLE9BQUEsR0FBQUQsUUFBQSJ9