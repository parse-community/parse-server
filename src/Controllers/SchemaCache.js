import Parse from 'parse/node';
import LRU from 'lru-cache';

let MAIN_SCHEMA = "__MAIN_SCHEMA";

export default class SchemaCache {
  cache: Object;

  constructor(appId: string, timeout: number = 0, maxSize: number = 10000) {
    this.appId = appId;
    this.timeout = timeout;
    this.maxSize = maxSize;
    this.cache = new LRU({
      max: maxSize,
      maxAge: timeout
    });
  }

  get() {
    if (this.timeout <= 0) {
      return;
    }
    return this.cache.get(this.appId+MAIN_SCHEMA);
  }

  set(schema) {
    if (this.timeout <= 0) {
      return;
    }
    this.cache.set(this.appId+MAIN_SCHEMA, schema);
  }

  setOneSchema(className, schema) {
    if (this.timeout <= 0) {
      return;
    }
     this.cache.set(this.appId+className, schema);
  }

  getOneSchema(className) {
    if (this.timeout <= 0) {
      return;
    }
    return this.cache.get(this.appId+className);
  }

  reset() {
    this.cache.reset();
  }
}
