const MAIN_SCHEMA = '__MAIN_SCHEMA';
const SCHEMA_CACHE_PREFIX = '__SCHEMA';

import { randomString } from '../cryptoUtils';
import defaults from '../defaults';

export default class SchemaCache {
  cache: Object;

  constructor(cacheController, ttl = defaults.schemaCacheTTL, singleCache = false) {
    this.ttl = ttl;
    if (typeof ttl == 'string') {
      this.ttl = parseInt(ttl);
    }
    this.cache = cacheController;
    this.prefix = SCHEMA_CACHE_PREFIX;
    if (!singleCache) {
      this.prefix += randomString(20);
    }
  }

  getAllClasses() {
    if (!this.ttl) {
      return Promise.resolve(null);
    }
    return this.cache.get(this.prefix + MAIN_SCHEMA);
  }

  setAllClasses(schema) {
    if (!this.ttl) {
      return Promise.resolve(null);
    }
    return this.cache.put(this.prefix + MAIN_SCHEMA, schema);
  }

  getOneSchema(className) {
    if (!this.ttl) {
      return Promise.resolve(null);
    }
    return this.cache.get(this.prefix + MAIN_SCHEMA).then(cachedSchemas => {
      cachedSchemas = cachedSchemas || [];
      const schema = cachedSchemas.find(cachedSchema => {
        return cachedSchema.className === className;
      });
      if (schema) {
        return Promise.resolve(schema);
      }
      return Promise.resolve(null);
    });
  }

  clear() {
    return this.cache.del(this.prefix + MAIN_SCHEMA);
  }
}
