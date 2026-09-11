const SchemaCache = {};

export default {
  all() {
    return [...(SchemaCache.allClasses || [])];
  },

  // The stored array itself as identity key for derived caches; must not be mutated
  raw() {
    return SchemaCache.allClasses;
  },

  get(className) {
    return (SchemaCache.allClasses || []).find(cached => cached.className === className);
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
