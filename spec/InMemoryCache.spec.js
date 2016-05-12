const InMemoryCache = require('../src/Adapters/Cache/InMemoryCache').default;


describe('InMemoryCache', function() {
  var BASE_TTL = {
    ttl: 10
  };
  var NO_EXPIRE_TTL = {
    ttl: NaN
  };
  var KEY = 'hello';
  var KEY_2 = KEY + '_2';

  var VALUE = 'world';


  function wait(sleep) {
    return new Promise(function(resolve, reject) {
      setTimeout(resolve, sleep);
    })
  }

  it('should destroy a expire items in the cache', (done) => {
    var cache = new InMemoryCache(BASE_TTL);

    cache.put(KEY, VALUE);

    var value = cache.get(KEY);
    expect(value).toEqual(VALUE);

    wait(BASE_TTL.ttl * 5).then(() => {
      value = cache.get(KEY)
      expect(value).toEqual(null);
      done();
    });
  });

  it('should delete items', (done) => {
    var cache = new InMemoryCache(NO_EXPIRE_TTL);
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

  it('should clear all items', (done) => {
    var cache = new InMemoryCache(NO_EXPIRE_TTL);
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
    var cache = new InMemoryCache({});
    expect(cache.ttl).toEqual(5 * 1000);
  });

});
