const InMemoryCacheAdapter = require('../lib/Adapters/Cache/InMemoryCacheAdapter').default;

describe('InMemoryCacheAdapter', function () {
  const KEY = 'hello';
  const VALUE = 'world';

  function wait(sleep) {
    return new Promise(function (resolve) {
      setTimeout(resolve, sleep);
    });
  }

  it('should expose promisifyed methods', done => {
    const cache = new InMemoryCacheAdapter({
      ttl: NaN,
    });

    // Verify all methods return promises.
    Promise.all([cache.put(KEY, VALUE), cache.del(KEY), cache.get(KEY), cache.clear()]).then(() => {
      done();
    });
  });

  it('should get/set/clear', done => {
    const cache = new InMemoryCacheAdapter({
      ttl: NaN,
    });

    cache
      .put(KEY, VALUE)
      .then(() => cache.get(KEY))
      .then(value => expect(value).toEqual(VALUE))
      .then(() => cache.clear())
      .then(() => cache.get(KEY))
      .then(value => expect(value).toEqual(null))
      .then(done);
  });

  it('should expire after ttl', done => {
    const cache = new InMemoryCacheAdapter({
      ttl: 10,
    });

    cache
      .put(KEY, VALUE)
      .then(() => cache.get(KEY))
      .then(value => expect(value).toEqual(VALUE))
      .then(wait.bind(null, 50))
      .then(() => cache.get(KEY))
      .then(value => expect(value).toEqual(null))
      .then(done);
  });

  it('should keep an entry whose ttl outlives the cache ttl', async () => {
    const cache = new InMemoryCacheAdapter({ ttl: 10 });

    await cache.put(KEY, VALUE, 5000);
    await wait(50);

    expect(await cache.get(KEY)).toEqual(VALUE);
  });

  it('should expire an entry whose ttl is shorter than the cache ttl', async () => {
    const cache = new InMemoryCacheAdapter({ ttl: 5000 });

    await cache.put(KEY, VALUE, 10);
    expect(await cache.get(KEY)).toEqual(VALUE);
    await wait(50);

    expect(await cache.get(KEY)).toEqual(null);
  });

  it('should not expire an entry with an infinite ttl', async () => {
    const cache = new InMemoryCacheAdapter({ ttl: 10 });

    await cache.put(KEY, VALUE, Infinity);
    await wait(50);

    expect(await cache.get(KEY)).toEqual(VALUE);
  });

  it('should fall back to the cache ttl when the entry ttl is not a positive number', async () => {
    const cache = new InMemoryCacheAdapter({ ttl: 10 });

    await cache.put(KEY, VALUE, 'not a ttl');
    expect(await cache.get(KEY)).toEqual(VALUE);
    await wait(50);

    expect(await cache.get(KEY)).toEqual(null);
  });
});
