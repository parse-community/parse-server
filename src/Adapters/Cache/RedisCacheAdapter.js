import redis from 'redis';
import logger from '../../logger';

const DEFAULT_REDIS_TTL = 30 * 1000; // 30 seconds in milliseconds
const FLUSH_DB_KEY = '__flush_db__';

function debug() {
  logger.debug.apply(logger, ['RedisCacheAdapter', ...arguments]);
}

// KeyPromiseQueue is a simple promise queue
// used to queue operations per key basis.
class KeyPromiseQueue {
  constructor() {
    this.queues = {};
    this.queueCount = {};
  }

  beforeOp(key) {
    const count = this.queueCount[key] || 0;
    this.queueCount[key] = count + 1;
  }

  afterOp(key) {
    let count = this.queueCount[key];
    if (count === undefined) {
      return;
    }
    count--;
    if (count <= 0) {
      delete this.queues[key];
      delete this.queueCount[key];
      return;
    }
    this.queueCount[key] = count;
  }

  enqueue(key, operation) {
    this.beforeOp(key);
    const toAwait = this.queues[key] || Promise.resolve();
    const nextOperation = toAwait.then(operation);
    const wrappedOperation = nextOperation.then(result => {
      this.afterOp(key);
      return result;
    });
    this.queues[key] = wrappedOperation;
    return wrappedOperation;
  }
}

export class RedisCacheAdapter {
  constructor(redisCtx, ttl = DEFAULT_REDIS_TTL) {
    this.client = redis.createClient(redisCtx);
    this.ttl = ttl;
    this.queue = new KeyPromiseQueue();
  }

  get(key) {
    debug('get', key);
    return this.queue.enqueue(
      key,
      () =>
        new Promise(resolve => {
          this.client.get(key, function(err, res) {
            debug('-> get', key, res);
            if (!res) {
              return resolve(null);
            }
            resolve(JSON.parse(res));
          });
        })
    );
  }

  put(key, value, ttl = this.ttl) {
    value = JSON.stringify(value);
    debug('put', key, value, ttl);
    if (ttl === 0) {
      // ttl of zero is a logical no-op, but redis cannot set expire time of zero
      return this.queue.enqueue(key, () => Promise.resolve());
    }
    if (ttl < 0 || isNaN(ttl)) {
      ttl = DEFAULT_REDIS_TTL;
    }
    return this.queue.enqueue(
      key,
      () =>
        new Promise(resolve => {
          if (ttl === Infinity) {
            this.client.set(key, value, function() {
              resolve();
            });
          } else {
            this.client.psetex(key, ttl, value, function() {
              resolve();
            });
          }
        })
    );
  }

  del(key) {
    debug('del', key);
    return this.queue.enqueue(
      key,
      () =>
        new Promise(resolve => {
          this.client.del(key, function() {
            resolve();
          });
        })
    );
  }

  clear() {
    debug('clear');
    return this.queue.enqueue(
      FLUSH_DB_KEY,
      () =>
        new Promise(resolve => {
          this.client.flushdb(function() {
            resolve();
          });
        })
    );
  }
}

export default RedisCacheAdapter;
