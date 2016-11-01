var CacheController = require('../src/Controllers/CacheController.js').default;
var InMemoryCacheAdapter = require('../src/Adapters/Cache/InMemoryCacheAdapter').default;
var SchemaCache = require('../src/Controllers/SchemaCache').default;

describe('SchemaCache', () => {
  let schemaCache;

  beforeEach(() => {
    const cacheAdapter = new InMemoryCacheAdapter({});
    const cacheController = new CacheController(cacheAdapter, 'appId');
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
});
