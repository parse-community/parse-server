/*eslint no-unused-vars: "off"*/
/**
 * @module Adapters
 */
/**
 * @interface SchemaCacheAdapter
 */
export class SchemaCacheAdapter {
  /**
   * Get all schema entries
   */
  all() {}

  /**
   * Get schema for given class
   * @param {String} className Name of class
   */
  get(className) {}

  /**
   * Replaces all schema
   * @param {object} allSchema Replaces schema for all collections with a new ones
   */
  put(allSchema) {}

  /**
   * Removes schema for given class
   * @param {String} className Name of class
   */
  del(className) {}

  /**
   * Clear cache
   */
  clear() {}
}
