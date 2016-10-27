var CacheController = require('../src/Controllers/CacheController.js').default;
var InMemoryCacheAdapter = require('../src/Adapters/Cache/InMemoryCacheAdapter').default;
var SchemaCache = require('../src/Controllers/SchemaCache').default;

describe('SchemaCache', () => {
  var cacheController;
  var schemaCache;

  beforeEach(() => {
    var cacheAdapter = new InMemoryCacheAdapter({});
    cacheController = new CacheController(cacheAdapter, 'appId');
    schemaCache = new SchemaCache(cacheController);
  });

  it('can retrieve a single schema after all schemas stored', (done) => {
    const allSchemas = [{
      className: 'Class1'
    }, {
      className: 'Class2'
    }];
    schemaCache.setAllClasses(allSchemas).then(() => {
      return schemaCache.getOneSchema('Class2');
    }).then((schema) => {
      expect(schema).not.toBeNull();
      done();
    });
  });

  it('does not return all schemas after a single schema is stored', (done) => {
    const schema = {
      className: 'Class1'
    };
    schemaCache.setOneSchema(schema.className, schema).then(() => {
      return schemaCache.getAllClasses();
    }).then((allSchemas) => {
      expect(allSchemas).toBeNull();
      done();
    });
  });

  it('clears the cache when not frozen', (done) => {
    const allSchemas = [{
      className: 'Class1'
    }, {
      className: 'Class2'
    }];
    schemaCache.setAllClasses(allSchemas).then(() => {
      const oneSchema = {
        className: 'Class3'
      };
      return schemaCache.setOneSchema(oneSchema.className, oneSchema);
    }).then(() => {
      return schemaCache.clear()
    }).then(() => {
      return schemaCache.getAllClasses();
    }).then((cachedSchemas) => {
      expect(cachedSchemas).toBeNull();
      return schemaCache.getOneSchema('Class3');
    }).then((cachedSchema) => {
      expect(cachedSchema).toBeNull();
      done();
    });
  });

  it('does not clear the cache when frozen', (done) => {
    schemaCache = new SchemaCache(cacheController, 5000, true);
    const allSchemas = [{
      className: 'Class1'
    }, {
      className: 'Class2'
    }];

    schemaCache.setAllClasses(allSchemas).then(() => {
      const oneSchema = {
        className: 'Class3'
      };
      return schemaCache.setOneSchema(oneSchema.className, oneSchema);
    }).then(() => {
      return schemaCache.clear();
    }).then(() => {
      return schemaCache.getAllClasses();
    }).then((allSchemas) => {
      expect(allSchemas).not.toBeNull();
      return schemaCache.getOneSchema('Class3');
    }).then((oneSchema) => {
      expect(oneSchema).not.toBeNull();
      done();
    });
  });
});
