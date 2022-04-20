import type { Schema } from '../../Controllers/types';
import { SchemaData } from '../../Controllers/SchemaController';

export default class InMemorySchemaCache {
  dataProvider: () => Promise<{ allClasses: Array<Schema>, schemaData: SchemaData }>;
  fetchingSchemaPromise: any;
  cache = {};

  setDataProvider(
    dataProvider: () => Promise<{ allClasses: Array<Schema>, schemaData: SchemaData }>
  ) {
    this.dataProvider = dataProvider;
  }

  async fetchSchema(): Promise<{ allClasses: Array<Schema>, schemaData: SchemaData }> {
    if (this.cache.isCached) {
      return {
        allClasses: this.cache.allClasses,
        schemaData: this.cache.schemaData,
      };
    }
    if (!this.fetchingSchemaPromise) {
      this.fetchingSchemaPromise = this.dataProvider();
    }
    const result = await this.fetchingSchemaPromise;
    this.cache.isCached = true;
    this.cache.allClasses = result ? result.allClasses : undefined;
    this.cache.schemaData = result ? result.schemaData : undefined;

    return {
      allClasses: this.cache.allClasses,
      schemaData: this.cache.schemaData,
    };
  }

  clear(): Promise<void> {
    this.cache.isCached = false;
    this.cache.allClasses = undefined;
    this.cache.schemaData = undefined;
    this.fetchingSchemaPromise = undefined;
  }
}
