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
//# sourceMappingURL=data:application/json;charset=utf-8;base64,eyJ2ZXJzaW9uIjozLCJuYW1lcyI6WyJQdXNoQWRhcHRlciIsInNlbmQiLCJib2R5IiwiaW5zdGFsbGF0aW9ucyIsInB1c2hTdGF0dXMiLCJnZXRWYWxpZFB1c2hUeXBlcyIsImV4cG9ydHMiLCJfZGVmYXVsdCIsImRlZmF1bHQiXSwic291cmNlcyI6WyIuLi8uLi8uLi9zcmMvQWRhcHRlcnMvUHVzaC9QdXNoQWRhcHRlci5qcyJdLCJzb3VyY2VzQ29udGVudCI6WyIvLyBAZmxvd1xuLyplc2xpbnQgbm8tdW51c2VkLXZhcnM6IFwib2ZmXCIqL1xuLy8gUHVzaCBBZGFwdGVyXG4vL1xuLy8gQWxsb3dzIHlvdSB0byBjaGFuZ2UgdGhlIHB1c2ggbm90aWZpY2F0aW9uIG1lY2hhbmlzbS5cbi8vXG4vLyBBZGFwdGVyIGNsYXNzZXMgbXVzdCBpbXBsZW1lbnQgdGhlIGZvbGxvd2luZyBmdW5jdGlvbnM6XG4vLyAqIGdldFZhbGlkUHVzaFR5cGVzKClcbi8vICogc2VuZChkZXZpY2VzLCBpbnN0YWxsYXRpb25zLCBwdXNoU3RhdHVzKVxuLy9cbi8vIERlZmF1bHQgaXMgUGFyc2VQdXNoQWRhcHRlciwgd2hpY2ggdXNlcyBHQ00gZm9yXG4vLyBhbmRyb2lkIHB1c2ggYW5kIEFQTlMgZm9yIGlvcyBwdXNoLlxuXG4vKipcbiAqIEBtb2R1bGUgQWRhcHRlcnNcbiAqL1xuLyoqXG4gKiBAaW50ZXJmYWNlIFB1c2hBZGFwdGVyXG4gKi9cbmV4cG9ydCBjbGFzcyBQdXNoQWRhcHRlciB7XG4gIC8qKlxuICAgKiBAcGFyYW0ge2FueX0gYm9keVxuICAgKiBAcGFyYW0ge1BhcnNlLkluc3RhbGxhdGlvbltdfSBpbnN0YWxsYXRpb25zXG4gICAqIEBwYXJhbSB7YW55fSBwdXNoU3RhdHVzXG4gICAqIEByZXR1cm5zIHtQcm9taXNlfVxuICAgKi9cbiAgc2VuZChib2R5OiBhbnksIGluc3RhbGxhdGlvbnM6IGFueVtdLCBwdXNoU3RhdHVzOiBhbnkpOiA/UHJvbWlzZTwqPiB7fVxuXG4gIC8qKlxuICAgKiBHZXQgYW4gYXJyYXkgb2YgdmFsaWQgcHVzaCB0eXBlcy5cbiAgICogQHJldHVybnMge0FycmF5fSBBbiBhcnJheSBvZiB2YWxpZCBwdXNoIHR5cGVzXG4gICAqL1xuICBnZXRWYWxpZFB1c2hUeXBlcygpOiBzdHJpbmdbXSB7XG4gICAgcmV0dXJuIFtdO1xuICB9XG59XG5cbmV4cG9ydCBkZWZhdWx0IFB1c2hBZGFwdGVyO1xuIl0sIm1hcHBpbmdzIjoiOzs7Ozs7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBRUE7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ08sTUFBTUEsV0FBVyxDQUFDO0VBQ3ZCO0FBQ0Y7QUFDQTtBQUNBO0FBQ0E7QUFDQTtFQUNFQyxJQUFJQSxDQUFDQyxJQUFTLEVBQUVDLGFBQW9CLEVBQUVDLFVBQWUsRUFBZSxDQUFDOztFQUVyRTtBQUNGO0FBQ0E7QUFDQTtFQUNFQyxpQkFBaUJBLENBQUEsRUFBYTtJQUM1QixPQUFPLEVBQUU7RUFDWDtBQUNGO0FBQUNDLE9BQUEsQ0FBQU4sV0FBQSxHQUFBQSxXQUFBO0FBQUEsSUFBQU8sUUFBQSxHQUVjUCxXQUFXO0FBQUFNLE9BQUEsQ0FBQUUsT0FBQSxHQUFBRCxRQUFBIn0=