/*eslint no-unused-vars: "off"*/
/**
 * @module Adapters
 */
import type { Schema } from '../../Controllers/types';
import { SchemaData } from '../../Controllers/SchemaController';

/**
 * @interface SchemaCacheAdapter
 */
export default class SchemaCacheAdapter {
  /**
   * Used by controller to provide data from database
   */
  setDataProvider(
    dataProvider: () => Promise<{ allClasses: Array<Schema>, schemaData: SchemaData }>
  ) {}

  /**
   * Get all schema entries and its corresponding intermediate format
   */
  async fetchSchema(): Promise<{ allClasses: Array<Schema>, schemaData: SchemaData }> {}

  /**
   * Clear cache
   */
  clear(): Promise<void> {}
}
