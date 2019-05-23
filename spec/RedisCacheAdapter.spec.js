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
      .then(wait.bind(null, 5))
      .then(() => cache.get(KEY))
      .then(value => expect(value).toEqual(null))
      .then(done);
  });

  it('should not store value for ttl=0', done => {
    const cache = new RedisCacheAdapter(null, 5);

    cache
      .put(KEY, VALUE, 0)
      .then(() => cache.get(KEY))
      .then(value => expect(value).toEqual(null))
      .then(done);
  });

  it('should not expire when ttl=Infinity', done => {
    const cache = new RedisCacheAdapter(null, 1);

    cache
      .put(KEY, VALUE, Infinity)
      .then(() => cache.get(KEY))
      .then(value => expect(value).toEqual(VALUE))
      .then(wait.bind(null, 5))
      .then(() => cache.get(KEY))
      .then(value => expect(value).toEqual(VALUE))
      .then(done);
  });

  it('should fallback to default ttl', done => {
    const cache = new RedisCacheAdapter(null, 1);
    let promise = Promise.resolve();

    [-100, null, undefined, 'not number', true].forEach(ttl => {
      promise = promise.then(() =>
        cache
          .put(KEY, VALUE, ttl)
          .then(() => cache.get(KEY))
          .then(value => expect(value).toEqual(VALUE))
          .then(wait.bind(null, 5))
          .then(() => cache.get(KEY))
          .then(value => expect(value).toEqual(null))
      );
    });

    promise.then(done);
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

  it('redis performance test', async () => {
    const cacheAdapter = new RedisCacheAdapter();
    await reconfigureServer({ cacheAdapter: cacheAdapter });
    await cacheAdapter.clear();
    const spy = spyOn(cacheAdapter, 'get').and.callThrough();

    // New Object
    const object = new TestObject();
    object.set('foo', 'bar');
    await object.save();
    expect(spy.calls.count()).toBe(8);
    spy.calls.reset();

    // Update Existing Field
    object.set('foo', 'barz');
    await object.save();
    expect(spy.calls.count()).toBe(5);
    spy.calls.reset();

    // Add New Field
    object.set('new', 'barz');
    await object.save();
    expect(spy.calls.count()).toBe(6);
    spy.calls.reset();

    // Get Object
    let query = new Parse.Query(TestObject);
    await query.get(object.id);
    expect(spy.calls.count()).toBe(3);
    spy.calls.reset();

    // Find Object
    query = new Parse.Query(TestObject);
    await query.find();
    expect(spy.calls.count()).toBe(3);
    spy.calls.reset();

    // Delete Object
    await object.destroy();
    expect(spy.calls.count()).toBe(4);
    spy.calls.reset();

    const objects = [];
    for (let i = 0; i < 100; i++) {
      const obj = new TestObject();
      obj.set('number', i);
      objects.push(obj);
    }
    await Parse.Object.saveAll(objects);
    expect(spy.calls.count()).toBe(141);
    spy.calls.reset();

    await cacheAdapter.clear();
  });
});

describe_only(() => {
  return process.env.PARSE_SERVER_TEST_CACHE === 'redis';
})('RedisCacheAdapter/KeyPromiseQueue', function() {
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

  it('it should clear completed operations from queue', done => {
    const cache = new RedisCacheAdapter({ ttl: NaN });

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

  it('it should count per key chained operations correctly', done => {
    const cache = new RedisCacheAdapter({ ttl: NaN });

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
