const RedisCacheAdapter = require('../lib/Adapters/Cache/RedisCacheAdapter').default;

function wait(sleep) {
  return new Promise(function (resolve) {
    setTimeout(resolve, sleep);
  });
}
/*
To run this test part of the complete suite
set PARSE_SERVER_TEST_CACHE='redis'
and make sure a redis server is available on the default port
 */
describe_only(() => {
  return process.env.PARSE_SERVER_TEST_CACHE === 'redis';
})('RedisCacheAdapter', function () {
  const KEY = 'hello';
  const VALUE = 'world';
  let cache;

  beforeEach(async () => {
    cache = new RedisCacheAdapter(null, 100);
    await cache.connect();
    await cache.clear();
  });

  it('should get/set/clear', async () => {
    const cacheNaN = new RedisCacheAdapter({
      ttl: NaN,
    });
    await cacheNaN.connect();
    await cacheNaN.put(KEY, VALUE);
    let value = await cacheNaN.get(KEY);
    expect(value).toEqual(VALUE);
    await cacheNaN.clear();
    value = await cacheNaN.get(KEY);
    expect(value).toEqual(null);
    await cacheNaN.clear();
  });

  it('should expire after ttl', done => {
    cache
      .put(KEY, VALUE)
      .then(() => cache.get(KEY))
      .then(value => expect(value).toEqual(VALUE))
      .then(wait.bind(null, 102))
      .then(() => cache.get(KEY))
      .then(value => expect(value).toEqual(null))
      .then(done);
  });

  it('should not store value for ttl=0', done => {
    cache
      .put(KEY, VALUE, 0)
      .then(() => cache.get(KEY))
      .then(value => expect(value).toEqual(null))
      .then(done);
  });

  it('should not expire when ttl=Infinity', done => {
    cache
      .put(KEY, VALUE, Infinity)
      .then(() => cache.get(KEY))
      .then(value => expect(value).toEqual(VALUE))
      .then(wait.bind(null, 102))
      .then(() => cache.get(KEY))
      .then(value => expect(value).toEqual(VALUE))
      .then(done);
  });

  it('should fallback to default ttl', done => {
    let promise = Promise.resolve();

    [-100, null, undefined, 'not number', true].forEach(ttl => {
      promise = promise.then(() =>
        cache
          .put(KEY, VALUE, ttl)
          .then(() => cache.get(KEY))
          .then(value => expect(value).toEqual(VALUE))
          .then(wait.bind(null, 102))
          .then(() => cache.get(KEY))
          .then(value => expect(value).toEqual(null))
      );
    });

    promise.then(done);
  });

  it('should find un-expired records', done => {
    cache
      .put(KEY, VALUE)
      .then(() => cache.get(KEY))
      .then(value => expect(value).toEqual(VALUE))
      .then(wait.bind(null, 1))
      .then(() => cache.get(KEY))
      .then(value => expect(value).not.toEqual(null))
      .then(done);
  });

  it('handleShutdown, close connection', async () => {
    await cache.handleShutdown();
    setTimeout(() => {
      expect(cache.client.isOpen).toBe(false);
    }, 0);
  });
});

describe_only(() => {
  return process.env.PARSE_SERVER_TEST_CACHE === 'redis';
})('RedisCacheAdapter/KeyPromiseQueue', function () {
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

  it('it should clear completed operations from queue', async done => {
    const cache = new RedisCacheAdapter({ ttl: NaN });
    await cache.connect();

    // execute a bunch of operations in sequence
    let promise = Promise.resolve();
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

  it('it should count per key chained operations correctly', async done => {
    const cache = new RedisCacheAdapter({ ttl: NaN });
    await cache.connect();

    let key1Promise = Promise.resolve();
    let key2Promise = Promise.resolve();
    for (let index = 1; index < 100; index++) {
      key1Promise = cache.put(KEY1, VALUE);
      key2Promise = cache.put(KEY2, VALUE);
      // per key chain should be equal to index, which is the
      // total number of operations on that key
      expect(getQueueCountForKey(cache, KEY1)).toEqual(index);
      expect(getQueueCountForKey(cache, KEY2)).toEqual(index);
      // the total keys counts should be equal to the different keys
      // we have currently being processed.
      expect(getQueueCount(cache)).toEqual(2);
    }

    // at the end the queue should be empty
    Promise.all([key1Promise, key2Promise])
      .then(() => expect(getQueueCount(cache)).toEqual(0))
      .then(done);
  });
});
