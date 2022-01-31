const CacheController = require('../lib/Controllers/CacheController.js').default;

describe('CacheController', function () {
  let FakeCacheAdapter;
  const FakeAppID = 'foo';
  const KEY = 'hello';

  beforeEach(() => {
    FakeCacheAdapter = {
      get: () => Promise.resolve(null),
      put: jasmine.createSpy('put'),
      del: jasmine.createSpy('del'),
      clear: jasmine.createSpy('clear'),
    };

    spyOn(FakeCacheAdapter, 'get').and.callThrough();
  });

  it('should expose role and user caches', done => {
    const cache = new CacheController(FakeCacheAdapter, FakeAppID);

    expect(cache.role).not.toEqual(null);
    expect(cache.role.get).not.toEqual(null);
    expect(cache.user).not.toEqual(null);
    expect(cache.user.get).not.toEqual(null);

    done();
  });

  ['role', 'user'].forEach(cacheName => {
    it('should prefix ' + cacheName + ' cache', () => {
      const cache = new CacheController(FakeCacheAdapter, FakeAppID)[cacheName];

      cache.put(KEY, 'world');
      const firstPut = FakeCacheAdapter.put.calls.first();
      expect(firstPut.args[0]).toEqual([FakeAppID, cacheName, KEY].join(':'));

      cache.get(KEY);
      const firstGet = FakeCacheAdapter.get.calls.first();
      expect(firstGet.args[0]).toEqual([FakeAppID, cacheName, KEY].join(':'));

      cache.del(KEY);
      const firstDel = FakeCacheAdapter.del.calls.first();
      expect(firstDel.args[0]).toEqual([FakeAppID, cacheName, KEY].join(':'));
    });
  });

  it('should clear the entire cache', () => {
    const cache = new CacheController(FakeCacheAdapter, FakeAppID);

    cache.clear();
    expect(FakeCacheAdapter.clear.calls.count()).toEqual(1);

    cache.user.clear();
    expect(FakeCacheAdapter.clear.calls.count()).toEqual(2);

    cache.role.clear();
    expect(FakeCacheAdapter.clear.calls.count()).toEqual(3);
  });

  it('should handle cache rejections', done => {
    FakeCacheAdapter.get = () => Promise.reject();

    const cache = new CacheController(FakeCacheAdapter, FakeAppID);

    cache.get('foo').then(done, () => {
      fail('Promise should not be rejected.');
    });
  });
});
