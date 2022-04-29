/*eslint no-unused-vars: "off"*/
/**
 * @module Adapters
 */
import { SchemaAndData } from './types';

/**
 * @interface SchemaCacheAdapter
 */
export default class SchemaCacheAdapter {
  /**
   * Get all schema entries and its corresponding intermediate format
   */
  async fetchSchema(getDataFromDb: () => Promise<SchemaAndData>): Promise<SchemaAndData> {}

  /**
   * Clear cache
   */
  clear(): Promise<void> {}
}
