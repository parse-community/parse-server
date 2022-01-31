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
});
