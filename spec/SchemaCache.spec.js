const CacheController = require('../lib/Controllers/CacheController.js').default;
const InMemoryCacheAdapter = require('../lib/Adapters/Cache/InMemoryCacheAdapter').default;
const SchemaCache = require('../lib/Controllers/SchemaCache').default;

describe('SchemaCache', () => {
  let cacheController;

  beforeEach(() => {
    const cacheAdapter = new InMemoryCacheAdapter({});
    cacheController = new CacheController(cacheAdapter, 'appId');
  });

  it('can retrieve a single schema after all schemas stored', done => {
    const schemaCache = new SchemaCache(cacheController);
    const allSchemas = [
      {
        className: 'Class1',
      },
      {
        className: 'Class2',
      },
    ];
    schemaCache
      .setAllClasses(allSchemas)
      .then(() => {
        return schemaCache.getOneSchema('Class2');
      })
      .then(schema => {
        expect(schema).not.toBeNull();
        done();
      });
  });

  it("doesn't persist cached data by default", done => {
    const schemaCache = new SchemaCache(cacheController);
    const schema = {
      className: 'Class1',
    };
    schemaCache.setAllClasses([schema]).then(() => {
      const anotherSchemaCache = new SchemaCache(cacheController);
      return anotherSchemaCache.getOneSchema(schema.className).then(schema => {
        expect(schema).toBeNull();
        done();
      });
    });
  });

  it('can persist cached data', done => {
    const schemaCache = new SchemaCache(cacheController, 5000, true);
    const schema = {
      className: 'Class1',
    };
    schemaCache.setAllClasses([schema]).then(() => {
      const anotherSchemaCache = new SchemaCache(cacheController, 5000, true);
      return anotherSchemaCache.getOneSchema(schema.className).then(schema => {
        expect(schema).not.toBeNull();
        done();
      });
    });
  });

  it('should not store if ttl is null', async () => {
    const ttl = null;
    const schemaCache = new SchemaCache(cacheController, ttl);
    expect(await schemaCache.getAllClasses()).toBeNull();
    expect(await schemaCache.setAllClasses()).toBeNull();
    expect(await schemaCache.getOneSchema()).toBeNull();
  });

  it('should convert string ttl to number', async () => {
    const ttl = '5000';
    const schemaCache = new SchemaCache(cacheController, ttl);
    expect(schemaCache.ttl).toBe(5000);
  });

  it('should use the SchemaCache ttl', async () => {
    const sleep = ms => new Promise(resolve => setTimeout(resolve, ms));

    const anotherCacheAdapter = new InMemoryCacheAdapter({ ttl: 2000 });
    const anotherCacheController = new CacheController(anotherCacheAdapter, 'appId');

    const schemaCacheTTL = 5000;
    const schemaCache = new SchemaCache(anotherCacheController, schemaCacheTTL, true);
    const schema = {
      className: 'Class1',
    };
    await schemaCache.setAllClasses([schema]);
    await sleep(4000);
    expect(await schemaCache.getOneSchema(schema.className)).not.toBeNull();
  });

  it('should be expired', async () => {
    const sleep = ms => new Promise(resolve => setTimeout(resolve, ms));

    const schemaCacheTTL = 2000;
    const schemaCache = new SchemaCache(cacheController, schemaCacheTTL, true);
    const schema = {
      className: 'Class1',
    };
    await schemaCache.setAllClasses([schema]);
    await sleep(3000);
    expect(await schemaCache.getOneSchema(schema.className)).toBeNull();
  });
});
