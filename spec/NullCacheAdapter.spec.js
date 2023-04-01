const NullCacheAdapter = require('../lib/Adapters/Cache/NullCacheAdapter').default;

describe('NullCacheAdapter', function () {
  const KEY = 'hello';
  const VALUE = 'world';

  it('should expose promisifyed methods', done => {
    const cache = new NullCacheAdapter({
      ttl: NaN,
    });

    // Verify all methods return promises.
    Promise.all([cache.put(KEY, VALUE), cache.del(KEY), cache.get(KEY), cache.clear()]).then(() => {
      done();
    });
  });

  it('should get/set/clear', done => {
    const cache = new NullCacheAdapter({
      ttl: NaN,
    });

    cache
      .put(KEY, VALUE)
      .then(() => cache.get(KEY))
      .then(value => expect(value).toEqual(null))
      .then(() => cache.clear())
      .then(() => cache.get(KEY))
      .then(value => expect(value).toEqual(null))
      .then(done);
  });
});
