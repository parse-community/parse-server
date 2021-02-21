const SchemaCache = {};

export default {
  get() {
    return SchemaCache.allClasses || [];
  },

  put(allSchema) {
    SchemaCache.allClasses = allSchema;
  },

  del(className) {
    this.put(this.get().filter(cached => cached.className !== className));
  },

  clear() {
    delete SchemaCache.allClasses;
  },
};
