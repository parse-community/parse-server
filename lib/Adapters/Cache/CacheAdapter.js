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
//# sourceMappingURL=data:application/json;charset=utf-8;base64,eyJ2ZXJzaW9uIjozLCJuYW1lcyI6WyJDYWNoZUFkYXB0ZXIiLCJnZXQiLCJrZXkiLCJwdXQiLCJ2YWx1ZSIsInR0bCIsImRlbCIsImNsZWFyIl0sInNvdXJjZXMiOlsiLi4vLi4vLi4vc3JjL0FkYXB0ZXJzL0NhY2hlL0NhY2hlQWRhcHRlci5qcyJdLCJzb3VyY2VzQ29udGVudCI6WyIvKmVzbGludCBuby11bnVzZWQtdmFyczogXCJvZmZcIiovXG4vKipcbiAqIEBpbnRlcmZhY2VcbiAqIEBtZW1iZXJvZiBtb2R1bGU6QWRhcHRlcnNcbiAqL1xuZXhwb3J0IGNsYXNzIENhY2hlQWRhcHRlciB7XG4gIC8qKlxuICAgKiBHZXQgYSB2YWx1ZSBpbiB0aGUgY2FjaGVcbiAgICogQHBhcmFtIHtTdHJpbmd9IGtleSBDYWNoZSBrZXkgdG8gZ2V0XG4gICAqIEByZXR1cm4ge1Byb21pc2V9IHRoYXQgd2lsbCBldmVudHVhbGx5IHJlc29sdmUgdG8gdGhlIHZhbHVlIGluIHRoZSBjYWNoZS5cbiAgICovXG4gIGdldChrZXkpIHt9XG5cbiAgLyoqXG4gICAqIFNldCBhIHZhbHVlIGluIHRoZSBjYWNoZVxuICAgKiBAcGFyYW0ge1N0cmluZ30ga2V5IENhY2hlIGtleSB0byBzZXRcbiAgICogQHBhcmFtIHtTdHJpbmd9IHZhbHVlIFZhbHVlIHRvIHNldCB0aGUga2V5XG4gICAqIEBwYXJhbSB7U3RyaW5nfSB0dGwgT3B0aW9uYWwgVFRMXG4gICAqL1xuICBwdXQoa2V5LCB2YWx1ZSwgdHRsKSB7fVxuXG4gIC8qKlxuICAgKiBSZW1vdmUgYSB2YWx1ZSBmcm9tIHRoZSBjYWNoZS5cbiAgICogQHBhcmFtIHtTdHJpbmd9IGtleSBDYWNoZSBrZXkgdG8gcmVtb3ZlXG4gICAqL1xuICBkZWwoa2V5KSB7fVxuXG4gIC8qKlxuICAgKiBFbXB0eSBhIGNhY2hlXG4gICAqL1xuICBjbGVhcigpIHt9XG59XG4iXSwibWFwcGluZ3MiOiI7Ozs7OztBQUFBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDTyxNQUFNQSxZQUFZLENBQUM7RUFDeEI7QUFDRjtBQUNBO0FBQ0E7QUFDQTtFQUNFQyxHQUFHLENBQUNDLEdBQUcsRUFBRSxDQUFDOztFQUVWO0FBQ0Y7QUFDQTtBQUNBO0FBQ0E7QUFDQTtFQUNFQyxHQUFHLENBQUNELEdBQUcsRUFBRUUsS0FBSyxFQUFFQyxHQUFHLEVBQUUsQ0FBQzs7RUFFdEI7QUFDRjtBQUNBO0FBQ0E7RUFDRUMsR0FBRyxDQUFDSixHQUFHLEVBQUUsQ0FBQzs7RUFFVjtBQUNGO0FBQ0E7RUFDRUssS0FBSyxHQUFHLENBQUM7QUFDWDtBQUFDIn0=