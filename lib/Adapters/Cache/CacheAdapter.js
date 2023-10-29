"use strict";

Object.defineProperty(exports, "__esModule", {
  value: true
});
exports.CacheAdapter = void 0;
/*eslint no-unused-vars: "off"*/
/**
 * @interface
 * @memberof module:Adapters
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
//# sourceMappingURL=data:application/json;charset=utf-8;base64,eyJ2ZXJzaW9uIjozLCJuYW1lcyI6WyJDYWNoZUFkYXB0ZXIiLCJnZXQiLCJrZXkiLCJwdXQiLCJ2YWx1ZSIsInR0bCIsImRlbCIsImNsZWFyIiwiZXhwb3J0cyJdLCJzb3VyY2VzIjpbIi4uLy4uLy4uL3NyYy9BZGFwdGVycy9DYWNoZS9DYWNoZUFkYXB0ZXIuanMiXSwic291cmNlc0NvbnRlbnQiOlsiLyplc2xpbnQgbm8tdW51c2VkLXZhcnM6IFwib2ZmXCIqL1xuLyoqXG4gKiBAaW50ZXJmYWNlXG4gKiBAbWVtYmVyb2YgbW9kdWxlOkFkYXB0ZXJzXG4gKi9cbmV4cG9ydCBjbGFzcyBDYWNoZUFkYXB0ZXIge1xuICAvKipcbiAgICogR2V0IGEgdmFsdWUgaW4gdGhlIGNhY2hlXG4gICAqIEBwYXJhbSB7U3RyaW5nfSBrZXkgQ2FjaGUga2V5IHRvIGdldFxuICAgKiBAcmV0dXJuIHtQcm9taXNlfSB0aGF0IHdpbGwgZXZlbnR1YWxseSByZXNvbHZlIHRvIHRoZSB2YWx1ZSBpbiB0aGUgY2FjaGUuXG4gICAqL1xuICBnZXQoa2V5KSB7fVxuXG4gIC8qKlxuICAgKiBTZXQgYSB2YWx1ZSBpbiB0aGUgY2FjaGVcbiAgICogQHBhcmFtIHtTdHJpbmd9IGtleSBDYWNoZSBrZXkgdG8gc2V0XG4gICAqIEBwYXJhbSB7U3RyaW5nfSB2YWx1ZSBWYWx1ZSB0byBzZXQgdGhlIGtleVxuICAgKiBAcGFyYW0ge1N0cmluZ30gdHRsIE9wdGlvbmFsIFRUTFxuICAgKi9cbiAgcHV0KGtleSwgdmFsdWUsIHR0bCkge31cblxuICAvKipcbiAgICogUmVtb3ZlIGEgdmFsdWUgZnJvbSB0aGUgY2FjaGUuXG4gICAqIEBwYXJhbSB7U3RyaW5nfSBrZXkgQ2FjaGUga2V5IHRvIHJlbW92ZVxuICAgKi9cbiAgZGVsKGtleSkge31cblxuICAvKipcbiAgICogRW1wdHkgYSBjYWNoZVxuICAgKi9cbiAgY2xlYXIoKSB7fVxufVxuIl0sIm1hcHBpbmdzIjoiOzs7Ozs7QUFBQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ08sTUFBTUEsWUFBWSxDQUFDO0VBQ3hCO0FBQ0Y7QUFDQTtBQUNBO0FBQ0E7RUFDRUMsR0FBR0EsQ0FBQ0MsR0FBRyxFQUFFLENBQUM7O0VBRVY7QUFDRjtBQUNBO0FBQ0E7QUFDQTtBQUNBO0VBQ0VDLEdBQUdBLENBQUNELEdBQUcsRUFBRUUsS0FBSyxFQUFFQyxHQUFHLEVBQUUsQ0FBQzs7RUFFdEI7QUFDRjtBQUNBO0FBQ0E7RUFDRUMsR0FBR0EsQ0FBQ0osR0FBRyxFQUFFLENBQUM7O0VBRVY7QUFDRjtBQUNBO0VBQ0VLLEtBQUtBLENBQUEsRUFBRyxDQUFDO0FBQ1g7QUFBQ0MsT0FBQSxDQUFBUixZQUFBLEdBQUFBLFlBQUEifQ==