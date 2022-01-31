const InMemoryCache = require('../lib/Adapters/Cache/InMemoryCache').default;

describe('InMemoryCache', function () {
  const BASE_TTL = {
    ttl: 100,
  };
  const NO_EXPIRE_TTL = {
    ttl: NaN,
  };
  const KEY = 'hello';
  const KEY_2 = KEY + '_2';

  const VALUE = 'world';

  function wait(sleep) {
    return new Promise(function (resolve) {
      setTimeout(resolve, sleep);
    });
  }

  it('should destroy a expire items in the cache', done => {
    const cache = new InMemoryCache(BASE_TTL);

    cache.put(KEY, VALUE);

    let value = cache.get(KEY);
    expect(value).toEqual(VALUE);

    wait(BASE_TTL.ttl * 10).then(() => {
      value = cache.get(KEY);
      expect(value).toEqual(null);
      done();
    });
  });

  it('should delete items', done => {
    const cache = new InMemoryCache(NO_EXPIRE_TTL);
    cache.put(KEY, VALUE);
    cache.put(KEY_2, VALUE);
    expect(cache.get(KEY)).toEqual(VALUE);
    expect(cache.get(KEY_2)).toEqual(VALUE);

    cache.del(KEY);
    expect(cache.get(KEY)).toEqual(null);
    expect(cache.get(KEY_2)).toEqual(VALUE);

    cache.del(KEY_2);
    expect(cache.get(KEY)).toEqual(null);
    expect(cache.get(KEY_2)).toEqual(null);
    done();
  });

  it('should clear all items', done => {
    const cache = new InMemoryCache(NO_EXPIRE_TTL);
    cache.put(KEY, VALUE);
    cache.put(KEY_2, VALUE);

    expect(cache.get(KEY)).toEqual(VALUE);
    expect(cache.get(KEY_2)).toEqual(VALUE);
    cache.clear();

    expect(cache.get(KEY)).toEqual(null);
    expect(cache.get(KEY_2)).toEqual(null);
    done();
  });

  it('should deafult TTL to 5 seconds', () => {
    const cache = new InMemoryCache({});
    expect(cache.ttl).toEqual(5 * 1000);
  });
});
