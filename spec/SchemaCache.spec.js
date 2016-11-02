var CacheController = require('../src/Controllers/CacheController.js').default;
var InMemoryCacheAdapter = require('../src/Adapters/Cache/InMemoryCacheAdapter').default;
var SchemaCache = require('../src/Controllers/SchemaCache').default;

describe('SchemaCache', () => {
  let cacheController;

  beforeEach(() => {
    const cacheAdapter = new InMemoryCacheAdapter({});
    cacheController = new CacheController(cacheAdapter, 'appId');
  });

  it('can retrieve a single schema after all schemas stored', (done) => {
    const schemaCache = new SchemaCache(cacheController);
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
    const schemaCache = new SchemaCache(cacheController);
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

  it('doesn\'t persist cached data by default', (done) => {
    const schemaCache = new SchemaCache(cacheController);
    const schema = {
      className: 'Class1'
    };
    schemaCache.setOneSchema(schema.className, schema).then(() => {
      const anotherSchemaCache = new SchemaCache(cacheController);
      return anotherSchemaCache.getOneSchema(schema.className).then((schema) => {
        expect(schema).toBeNull();
        done();
      });
    });
  });

  it('can persist cached data', (done) => {
    const schemaCache = new SchemaCache(cacheController, 5000, true);
    const schema = {
      className: 'Class1'
    };
    schemaCache.setOneSchema(schema.className, schema).then(() => {
      const anotherSchemaCache = new SchemaCache(cacheController, 5000, true);
      return anotherSchemaCache.getOneSchema(schema.className).then((schema) => {
        expect(schema).not.toBeNull();
        done();
      });
    });
  });
});
