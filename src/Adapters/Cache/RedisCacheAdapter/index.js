import redis from 'redis';
import logger from '../../../logger';
import { KeyPromiseQueue } from './KeyPromiseQueue';

const DEFAULT_REDIS_TTL = 30 * 1000; // 30 seconds in milliseconds
const FLUSH_DB_KEY = '__flush_db__';

function debug() {
  logger.debug.apply(logger, ['RedisCacheAdapter', ...arguments]);
}

const isValidTTL = ttl => typeof ttl === 'number' && ttl > 0;

export class RedisCacheAdapter {
  constructor(redisCtx, ttl = DEFAULT_REDIS_TTL) {
    this.ttl = isValidTTL(ttl) ? ttl : DEFAULT_REDIS_TTL;
    this.client = redis.createClient(redisCtx);
    this.queue = new KeyPromiseQueue();
  }

  handleShutdown() {
    if (!this.client) {
      return Promise.resolve();
    }
    return new Promise(resolve => {
      this.client.quit(err => {
        if (err) {
          logger.error('RedisCacheAdapter error on shutdown', { error: err });
        }
        resolve();
      });
    });
  }

  get(key) {
    debug('get', key);
    return this.queue.enqueue(
      key,
      () =>
        new Promise(resolve => {
          this.client.get(key, function (err, res) {
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

    if (ttl === Infinity) {
      return this.queue.enqueue(
        key,
        () =>
          new Promise(resolve => {
            this.client.set(key, value, function () {
              resolve();
            });
          })
      );
    }

    if (!isValidTTL(ttl)) {
      ttl = this.ttl;
    }

    return this.queue.enqueue(
      key,
      () =>
        new Promise(resolve => {
          this.client.psetex(key, ttl, value, function () {
            resolve();
          });
        })
    );
  }

  del(key) {
    debug('del', key);
    return this.queue.enqueue(
      key,
      () =>
        new Promise(resolve => {
          this.client.del(key, function () {
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
          this.client.flushdb(function () {
            resolve();
          });
        })
    );
  }

  // Used for testing
  async getAllKeys() {
    return new Promise((resolve, reject) => {
      this.client.keys('*', (err, keys) => {
        if (err) {
          reject(err);
        } else {
          resolve(keys);
        }
      });
    });
  }
}

export default RedisCacheAdapter;
