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

  it('should scope clear to the app', () => {
    const cache = new CacheController(FakeCacheAdapter, FakeAppID);

    cache.clear();
    expect(FakeCacheAdapter.clear.calls.first().args[0]).toEqual(FakeAppID);
  });

  ['role', 'user', 'graphQL'].forEach(cacheName => {
    it('should scope clear of the ' + cacheName + ' cache to its prefix', () => {
      const cache = new CacheController(FakeCacheAdapter, FakeAppID);

      cache[cacheName].clear();
      expect(FakeCacheAdapter.clear.calls.first().args[0]).toEqual(
        [FakeAppID, cacheName].join(':')
      );
    });
  });

  it('should not evict cached users when a _Role is saved', async () => {
    const cacheController = Parse.Server.cacheController;
    await cacheController.user.put('r:someSessionToken', { objectId: 'someUser' });
    await cacheController.role.put('someUser', ['role:Admin']);

    await new Parse.Role('Admin', new Parse.ACL()).save(null, { useMasterKey: true });
    // The role cache is cleared without being awaited by RestWrite.
    await new Promise(resolve => setTimeout(resolve, 200));

    expect(await cacheController.role.get('someUser')).toEqual(null);
    expect(await cacheController.user.get('r:someSessionToken')).toEqual({
      objectId: 'someUser',
    });
  });

  it('should handle cache rejections', done => {
    FakeCacheAdapter.get = () => Promise.reject();

    const cache = new CacheController(FakeCacheAdapter, FakeAppID);

    cache.get('foo').then(done, () => {
      fail('Promise should not be rejected.');
    });
  });
});
