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
//# sourceMappingURL=data:application/json;charset=utf-8;base64,eyJ2ZXJzaW9uIjozLCJuYW1lcyI6WyJQdXNoQWRhcHRlciIsInNlbmQiLCJib2R5IiwiaW5zdGFsbGF0aW9ucyIsInB1c2hTdGF0dXMiLCJnZXRWYWxpZFB1c2hUeXBlcyJdLCJzb3VyY2VzIjpbIi4uLy4uLy4uL3NyYy9BZGFwdGVycy9QdXNoL1B1c2hBZGFwdGVyLmpzIl0sInNvdXJjZXNDb250ZW50IjpbIi8vIEBmbG93XG4vKmVzbGludCBuby11bnVzZWQtdmFyczogXCJvZmZcIiovXG4vLyBQdXNoIEFkYXB0ZXJcbi8vXG4vLyBBbGxvd3MgeW91IHRvIGNoYW5nZSB0aGUgcHVzaCBub3RpZmljYXRpb24gbWVjaGFuaXNtLlxuLy9cbi8vIEFkYXB0ZXIgY2xhc3NlcyBtdXN0IGltcGxlbWVudCB0aGUgZm9sbG93aW5nIGZ1bmN0aW9uczpcbi8vICogZ2V0VmFsaWRQdXNoVHlwZXMoKVxuLy8gKiBzZW5kKGRldmljZXMsIGluc3RhbGxhdGlvbnMsIHB1c2hTdGF0dXMpXG4vL1xuLy8gRGVmYXVsdCBpcyBQYXJzZVB1c2hBZGFwdGVyLCB3aGljaCB1c2VzIEdDTSBmb3Jcbi8vIGFuZHJvaWQgcHVzaCBhbmQgQVBOUyBmb3IgaW9zIHB1c2guXG5cbi8qKlxuICogQGludGVyZmFjZVxuICogQG1lbWJlcm9mIG1vZHVsZTpBZGFwdGVyc1xuICovXG5leHBvcnQgY2xhc3MgUHVzaEFkYXB0ZXIge1xuICAvKipcbiAgICogQHBhcmFtIHthbnl9IGJvZHlcbiAgICogQHBhcmFtIHtQYXJzZS5JbnN0YWxsYXRpb25bXX0gaW5zdGFsbGF0aW9uc1xuICAgKiBAcGFyYW0ge2FueX0gcHVzaFN0YXR1c1xuICAgKiBAcmV0dXJucyB7UHJvbWlzZX1cbiAgICovXG4gIHNlbmQoYm9keTogYW55LCBpbnN0YWxsYXRpb25zOiBhbnlbXSwgcHVzaFN0YXR1czogYW55KTogP1Byb21pc2U8Kj4ge31cblxuICAvKipcbiAgICogR2V0IGFuIGFycmF5IG9mIHZhbGlkIHB1c2ggdHlwZXMuXG4gICAqIEByZXR1cm5zIHtBcnJheX0gQW4gYXJyYXkgb2YgdmFsaWQgcHVzaCB0eXBlc1xuICAgKi9cbiAgZ2V0VmFsaWRQdXNoVHlwZXMoKTogc3RyaW5nW10ge1xuICAgIHJldHVybiBbXTtcbiAgfVxufVxuXG5leHBvcnQgZGVmYXVsdCBQdXNoQWRhcHRlcjtcbiJdLCJtYXBwaW5ncyI6Ijs7Ozs7O0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUVBO0FBQ0E7QUFDQTtBQUNBO0FBQ08sTUFBTUEsV0FBVyxDQUFDO0VBQ3ZCO0FBQ0Y7QUFDQTtBQUNBO0FBQ0E7QUFDQTtFQUNFQyxJQUFJLENBQUNDLElBQVMsRUFBRUMsYUFBb0IsRUFBRUMsVUFBZSxFQUFlLENBQUM7O0VBRXJFO0FBQ0Y7QUFDQTtBQUNBO0VBQ0VDLGlCQUFpQixHQUFhO0lBQzVCLE9BQU8sRUFBRTtFQUNYO0FBQ0Y7QUFBQztBQUFBLGVBRWNMLFdBQVc7QUFBQSJ9