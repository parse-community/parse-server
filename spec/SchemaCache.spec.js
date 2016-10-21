var CacheController = require('../src/Controllers/CacheController.js').default;
var InMemoryCacheAdapter = require('../src/Adapters/Cache/InMemoryCacheAdapter').default;
var SchemaCache = require('../src/Controllers/SchemaCache').default;

describe('SchemaCache', () => {
	var schemaCache;

	beforeEach(() => {
		var cacheAdapter = new InMemoryCacheAdapter({});
		var cacheController = new CacheController(cacheAdapter, 'appId');
		schemaCache = new SchemaCache(cacheController);
	});

	it('can retrieve a single schema after all schemas stored', () => {
		var allSchemas = [{
			className: 'Class1'
		}, {
			className: 'Class2'
		}];
		schemaCache.setAllClasses(allSchemas);
		schemaCache.getOneSchema('Class2').then((schema) => {
			expect(schema).not.toBeNull();
		});
	});

	it('does not return all schemas after a single schema is stored', () => {
		var schema = {
			className: 'Class1'
		};
		schemaCache.setOneSchema('Class1', schema);
		schemaCache.getAllClasses().then((allSchemas) => {
			expect(allSchemas).toBeNull();
		});
	});
});