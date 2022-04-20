/*eslint no-unused-vars: "off"*/
/**
 * @module Adapters
 */
import type { Schema } from '../../Controllers/types';
import { SchemaData } from '../../Controllers/SchemaController';
import SchemaCacheAdapter from './SchemaCacheAdapter';

/**
 * @interface SchemaCacheAccess
 */
export class SchemaCacheAccess {
  constructor(schemaCacheAdapter: SchemaCacheAdapter) {
    this.schemaCacheAdapter = schemaCacheAdapter;
  }

  setDataProvider(
    dataProvider: () => Promise<{ allClasses: Array<Schema>, schemaData: SchemaData }>
  ) {
    this.schemaCacheAdapter.setDataProvider(dataProvider);
  }

  async getSchemaAndData(): Promise<{ allClasses: Array<Schema>, schemaData: SchemaData }> {
    return this.schemaCacheAdapter.fetchSchema();
  }

  async all(): Promise<Array<Schema>> {
    const data = await this.getSchemaAndData();

    return data.allClasses;
  }

  async get(className): Promise<Schema> {
    const allSchemas = await this.all();

    return allSchemas.find(cached => cached.className === className);
  }

  clear(): Promise<void> {
    this.schemaCacheAdapter.clear();
  }

  async getSchemaData(): Promise<SchemaData> {
    const data = await this.getSchemaAndData();

    return data.schemaData;
  }
}
