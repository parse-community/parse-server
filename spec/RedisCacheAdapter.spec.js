const RedisCacheAdapter = require('../lib/Adapters/Cache/RedisCacheAdapter')
  .default;
/*
To run this test part of the complete suite
set PARSE_SERVER_TEST_CACHE='redis'
and make sure a redis server is available on the default port
 */
describe_only(() => {
  return process.env.PARSE_SERVER_TEST_CACHE === 'redis';
})('RedisCacheAdapter', function() {
  const KEY = 'hello';
  const VALUE = 'world';

  function wait(sleep) {
    return new Promise(function(resolve) {
      setTimeout(resolve, sleep);
    });
  }

  it('should get/set/clear', done => {
    const cache = new RedisCacheAdapter({
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
    const cache = new RedisCacheAdapter(null, 1);

    cache
      .put(KEY, VALUE)
      .then(() => cache.get(KEY))
      .then(value => expect(value).toEqual(VALUE))
      .then(wait.bind(null, 2))
      .then(() => cache.get(KEY))
      .then(value => expect(value).toEqual(null))
      .then(done);
  });

  it('should find un-expired records', done => {
    const cache = new RedisCacheAdapter(null, 5);

    cache
      .put(KEY, VALUE)
      .then(() => cache.get(KEY))
      .then(value => expect(value).toEqual(VALUE))
      .then(wait.bind(null, 1))
      .then(() => cache.get(KEY))
      .then(value => expect(value).not.toEqual(null))
      .then(done);
  });
});

describe_only(() => {
  return process.env.PARSE_SERVER_TEST_CACHE === 'redis';
})('RedisCacheAdapter KeyPromiseQueue', function() {
  const KEY1 = 'key1';
  const KEY2 = 'key2';
  const VALUE = 'hello';

  // number of chained ops on a single key
  function getQueueCountForKey(cache, key) {
    return cache.queue.queue[key][0];
  }

  // total number of queued keys
  function getQueueCount(cache) {
    return Object.keys(cache.queue.queue).length;
  }

  it('it should clear completed operations', done => {
    const cache = new RedisCacheAdapter({
      ttl: NaN,
    });

    let promise = Promise.resolve();

    // execute a bunch of operations
    for (let index = 1; index < 100; index++) {
      promise = promise.then(() => {
        const key = `${index}`;
        return cache
          .put(key, VALUE)
          .then(() => expect(getQueueCount(cache)).toEqual(0))
          .then(() => cache.get(key))
          .then(() => expect(getQueueCount(cache)).toEqual(0))
          .then(() => cache.clear())
          .then(() => expect(getQueueCount(cache)).toEqual(0));
      });
    }

    // at the end the queue should be empty
    promise.then(() => expect(getQueueCount(cache)).toEqual(0)).then(done);
  });

  it('it should count chained operations correctly', done => {
    const cache = new RedisCacheAdapter({
      ttl: NaN,
    });

    let promise1 = Promise.resolve();
    let promise2 = Promise.resolve();

    for (let index = 1; index < 100; index++) {
      promise1 = cache.put(KEY1, VALUE);
      promise2 = cache.put(KEY2, VALUE);
      expect(getQueueCountForKey(cache, KEY1)).toEqual(index);
      expect(getQueueCountForKey(cache, KEY2)).toEqual(index);
      expect(getQueueCount(cache)).toEqual(2);
    }

    // at the end the queue should be empty
    Promise.all([promise1, promise2])
      .then(() => expect(getQueueCount(cache)).toEqual(0))
      .then(done);
  });
});
