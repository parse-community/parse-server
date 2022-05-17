import { SchemaAndData } from './types';

export default class InMemorySchemaCache {
  fetchingSchemaPromise: any;
  cache = {};

  async fetchSchema(getDataFromDb: () => Promise<SchemaAndData>): Promise<SchemaAndData> {
    if (this.cache.isCached) {
      return {
        allClasses: this.cache.allClasses,
        schemaData: this.cache.schemaData,
      };
    }
    if (!this.fetchingSchemaPromise) {
      this.fetchingSchemaPromise = await getDataFromDb();
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
