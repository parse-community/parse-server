"use strict";

Object.defineProperty(exports, "__esModule", {
  value: true
});
exports.CacheAdapter = void 0;
/*eslint no-unused-vars: "off"*/
/**
 * @module Adapters
 */
/**
 * @interface CacheAdapter
 */
class CacheAdapter {
  /**
   * Get a value in the cache
   * @param {String} key Cache key to get
   * @return {Promise} that will eventually resolve to the value in the cache.
   */
  get(key) {}

  /**
   * Set a value in the cache
   * @param {String} key Cache key to set
   * @param {String} value Value to set the key
   * @param {String} ttl Optional TTL
   */
  put(key, value, ttl) {}

  /**
   * Remove a value from the cache.
   * @param {String} key Cache key to remove
   */
  del(key) {}

  /**
   * Empty a cache
   */
  clear() {}
}
exports.CacheAdapter = CacheAdapter;
//# sourceMappingURL=data:application/json;charset=utf-8;base64,eyJ2ZXJzaW9uIjozLCJuYW1lcyI6WyJDYWNoZUFkYXB0ZXIiLCJnZXQiLCJrZXkiLCJwdXQiLCJ2YWx1ZSIsInR0bCIsImRlbCIsImNsZWFyIl0sInNvdXJjZXMiOlsiLi4vLi4vLi4vc3JjL0FkYXB0ZXJzL0NhY2hlL0NhY2hlQWRhcHRlci5qcyJdLCJzb3VyY2VzQ29udGVudCI6WyIvKmVzbGludCBuby11bnVzZWQtdmFyczogXCJvZmZcIiovXG4vKipcbiAqIEBtb2R1bGUgQWRhcHRlcnNcbiAqL1xuLyoqXG4gKiBAaW50ZXJmYWNlIENhY2hlQWRhcHRlclxuICovXG5leHBvcnQgY2xhc3MgQ2FjaGVBZGFwdGVyIHtcbiAgLyoqXG4gICAqIEdldCBhIHZhbHVlIGluIHRoZSBjYWNoZVxuICAgKiBAcGFyYW0ge1N0cmluZ30ga2V5IENhY2hlIGtleSB0byBnZXRcbiAgICogQHJldHVybiB7UHJvbWlzZX0gdGhhdCB3aWxsIGV2ZW50dWFsbHkgcmVzb2x2ZSB0byB0aGUgdmFsdWUgaW4gdGhlIGNhY2hlLlxuICAgKi9cbiAgZ2V0KGtleSkge31cblxuICAvKipcbiAgICogU2V0IGEgdmFsdWUgaW4gdGhlIGNhY2hlXG4gICAqIEBwYXJhbSB7U3RyaW5nfSBrZXkgQ2FjaGUga2V5IHRvIHNldFxuICAgKiBAcGFyYW0ge1N0cmluZ30gdmFsdWUgVmFsdWUgdG8gc2V0IHRoZSBrZXlcbiAgICogQHBhcmFtIHtTdHJpbmd9IHR0bCBPcHRpb25hbCBUVExcbiAgICovXG4gIHB1dChrZXksIHZhbHVlLCB0dGwpIHt9XG5cbiAgLyoqXG4gICAqIFJlbW92ZSBhIHZhbHVlIGZyb20gdGhlIGNhY2hlLlxuICAgKiBAcGFyYW0ge1N0cmluZ30ga2V5IENhY2hlIGtleSB0byByZW1vdmVcbiAgICovXG4gIGRlbChrZXkpIHt9XG5cbiAgLyoqXG4gICAqIEVtcHR5IGEgY2FjaGVcbiAgICovXG4gIGNsZWFyKCkge31cbn1cbiJdLCJtYXBwaW5ncyI6Ijs7Ozs7O0FBQUE7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDTyxNQUFNQSxZQUFZLENBQUM7RUFDeEI7QUFDRjtBQUNBO0FBQ0E7QUFDQTtFQUNFQyxHQUFHLENBQUNDLEdBQUcsRUFBRSxDQUFDOztFQUVWO0FBQ0Y7QUFDQTtBQUNBO0FBQ0E7QUFDQTtFQUNFQyxHQUFHLENBQUNELEdBQUcsRUFBRUUsS0FBSyxFQUFFQyxHQUFHLEVBQUUsQ0FBQzs7RUFFdEI7QUFDRjtBQUNBO0FBQ0E7RUFDRUMsR0FBRyxDQUFDSixHQUFHLEVBQUUsQ0FBQzs7RUFFVjtBQUNGO0FBQ0E7RUFDRUssS0FBSyxHQUFHLENBQUM7QUFDWDtBQUFDIn0=