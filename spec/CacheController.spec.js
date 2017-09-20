var CacheController = require('../src/Controllers/CacheController.js').default;

describe('CacheController', function() {
  var FakeCacheAdapter;
  var FakeAppID = 'foo';
  var KEY = 'hello';

  beforeEach(() => {
    FakeCacheAdapter = {
      get: () => Promise.resolve(null),
      put: jasmine.createSpy('put'),
      del: jasmine.createSpy('del'),
      clear: jasmine.createSpy('clear')
    }

    spyOn(FakeCacheAdapter, 'get').and.callThrough();
  });


  it('should expose role and user caches', (done) => {
    var cache = new CacheController(FakeCacheAdapter, FakeAppID);

    expect(cache.role).not.toEqual(null);
    expect(cache.role.get).not.toEqual(null);
    expect(cache.user).not.toEqual(null);
    expect(cache.user.get).not.toEqual(null);

    done();
  });


  ['role', 'user'].forEach((cacheName) => {
    it('should prefix ' + cacheName + ' cache', () => {
      var cache = new CacheController(FakeCacheAdapter, FakeAppID)[cacheName];

      cache.put(KEY, 'world');
      var firstPut = FakeCacheAdapter.put.calls.first();
      expect(firstPut.args[0]).toEqual([FakeAppID, cacheName, KEY].join(':'));

      cache.get(KEY);
      var firstGet = FakeCacheAdapter.get.calls.first();
      expect(firstGet.args[0]).toEqual([FakeAppID, cacheName, KEY].join(':'));

      cache.del(KEY);
      var firstDel = FakeCacheAdapter.del.calls.first();
      expect(firstDel.args[0]).toEqual([FakeAppID, cacheName, KEY].join(':'));
    });
  });

  it('should clear the entire cache', () => {
    var cache = new CacheController(FakeCacheAdapter, FakeAppID);

    cache.clear();
    expect(FakeCacheAdapter.clear.calls.count()).toEqual(1);

    cache.user.clear();
    expect(FakeCacheAdapter.clear.calls.count()).toEqual(2);

    cache.role.clear();
    expect(FakeCacheAdapter.clear.calls.count()).toEqual(3);
  });

  it('should handle cache rejections', (done) => {

    FakeCacheAdapter.get = () => Promise.reject();

    var cache = new CacheController(FakeCacheAdapter, FakeAppID);

    cache.get('foo').then(done, () => {
      fail('Promise should not be rejected.');
    });
  });

});
