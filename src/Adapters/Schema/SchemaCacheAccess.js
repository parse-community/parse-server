/*eslint no-unused-vars: "off"*/
/**
 * @module Adapters
 */
import type { Schema } from '../../Controllers/types';
import SchemaCacheAdapter from './SchemaCacheAdapter';
import { injectDefaultSchema, SchemaData } from '../../Schema/SchemaData';
import { StorageAdapter } from '../Storage/StorageAdapter';
import type { ParseServerOptions } from '../../Options';
import { SchemaAndData } from './types';

/**
 * @interface SchemaCacheAccess
 */
export class SchemaCacheAccess {
  schemaCacheAdapter: SchemaCacheAdapter;
  dbAdapter: StorageAdapter;
  protectedFields: any;

  constructor(schemaCacheAdapter: SchemaCacheAdapter, dbAdapter, options: ParseServerOptions) {
    this.schemaCacheAdapter = schemaCacheAdapter;
    this.dbAdapter = dbAdapter;
    this.protectedFields = options ? options.protectedFields : undefined;
  }

  async getSchemaAndData(): Promise<SchemaAndData> {
    const that = this;
    return this.schemaCacheAdapter.fetchSchema(async () => {
      const rawAllSchemas = await that.dbAdapter.getAllClasses();
      const allSchemas = rawAllSchemas.map(injectDefaultSchema);

      const schemaData = new SchemaData(allSchemas, that.protectedFields);

      return {
        schemaData,
        allClasses: allSchemas,
      };
    });
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
    return this.schemaCacheAdapter.clear();
  }

  async getSchemaData(): Promise<SchemaData> {
    const data = await this.getSchemaAndData();

    return data.schemaData;
  }
}
