var RedisCacheAdapter = require('../src/Adapters/Cache/RedisCacheAdapter').default;

describe('RedisCacheAdapter', function() {
  var KEY = 'hello';
  var VALUE = 'world';

  function wait(sleep) {
    return new Promise(function(resolve) {
      setTimeout(resolve, sleep);
    })
  }

  it('should get/set/clear', (done) => {
    var cache = new RedisCacheAdapter({
      ttl: NaN
    });

    cache.put(KEY, VALUE)
      .then(() => cache.get(KEY))
      .then((value) => expect(value).toEqual(VALUE))
      .then(() => cache.clear())
      .then(() => cache.get(KEY))
      .then((value) => expect(value).toEqual(null))
      .then(done);
  });

  it('should expire after ttl', (done) => {
    var cache = new RedisCacheAdapter(null, 1);

    cache.put(KEY, VALUE)
      .then(() => cache.get(KEY))
      .then((value) => expect(value).toEqual(VALUE))
      .then(wait.bind(null, 2))
      .then(() => cache.get(KEY))
      .then((value) => expect(value).toEqual(null))
      .then(done);
  });

  it('should find un-expired records', (done) => {
    var cache = new RedisCacheAdapter(null, 5);

    cache.put(KEY, VALUE)
      .then(() => cache.get(KEY))
      .then((value) => expect(value).toEqual(VALUE))
      .then(wait.bind(null, 1))
      .then(() => cache.get(KEY))
      .then((value) => expect(value).not.toEqual(null))
      .then(done);
  });
});
