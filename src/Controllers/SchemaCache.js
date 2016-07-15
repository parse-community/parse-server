import { InMemoryCacheAdapter } from '../Adapters/Cache/InMemoryCacheAdapter';

const CACHED_KEYS = "__CACHED_KEYS";
const MAIN_SCHEMA = "__MAIN_SCHEMA";
const SCHEMA_CACHE_PREFIX = "__SCHEMA";
export default class SchemaCache {
  cache: Object;

  constructor(ttl) {
    this.ttl = ttl;
    this.cache = new InMemoryCacheAdapter({ ttl });
}

  getAllClasses() {
    if (this.ttl <= 0) {
      return;
    }
    return this.cache.get(SCHEMA_CACHE_PREFIX+MAIN_SCHEMA);
  }

  setAllClasses(schema) {
    if (this.ttl <= 0) {
      return;
    }
    this.cache.put(SCHEMA_CACHE_PREFIX+MAIN_SCHEMA, schema, this.ttl);
  }

  setOneSchema(className, schema) {
    if (this.ttl <= 0) {
      return;
    }
    this.cache.put(SCHEMA_CACHE_PREFIX+className, schema, this.ttl);
  }

  getOneSchema(className) {
    if (this.ttl <= 0) {
      return;
    }
    return this.cache.get(SCHEMA_CACHE_PREFIX+className);
  }

  clear() {
    // That clears all caches...
   this.cache.clear();
  }
}
