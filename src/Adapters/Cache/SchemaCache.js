const SchemaCache = {};

export default {
  all() {
    return [...(SchemaCache.allClasses || [])];
  },

  get(className) {
    return this.all().find(cached => cached.className === className);
  },

  put(allSchema) {
    SchemaCache.allClasses = allSchema;
  },

  del(className) {
    this.put(this.all().filter(cached => cached.className !== className));
  },

  clear() {
    delete SchemaCache.allClasses;
  },
};
