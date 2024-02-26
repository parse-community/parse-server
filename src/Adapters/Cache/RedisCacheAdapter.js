import { createClient } from 'redis';
import logger from '../../logger';
import { KeyPromiseQueue } from '../../KeyPromiseQueue';

const DEFAULT_REDIS_TTL = 30 * 1000; // 30 seconds in milliseconds
const FLUSH_DB_KEY = '__flush_db__';

function debug(...args: any) {
  const message = ['RedisCacheAdapter: ' + arguments[0]].concat(args.slice(1, args.length));
  logger.debug.apply(logger, message);
}

const isValidTTL = ttl => typeof ttl === 'number' && ttl > 0;

export class RedisCacheAdapter {
  constructor(redisCtx, ttl = DEFAULT_REDIS_TTL) {
    this.ttl = isValidTTL(ttl) ? ttl : DEFAULT_REDIS_TTL;
    this.client = createClient(redisCtx);
    this.queue = new KeyPromiseQueue();
  }

  async connect() {
    if (this.client.isOpen) {
      return;
    }
    return this.client.connect();
  }

  async handleShutdown() {
    if (!this.client) {
      return;
    }
    try {
      await this.client.quit();
    } catch (err) {
      logger.error('RedisCacheAdapter error on shutdown', { error: err });
    }
  }

  async get(key) {
    debug('get', { key });
    try {
      await this.queue.enqueue(key);
      const res = await this.client.get(key);
      if (!res) {
        return null;
      }
      return JSON.parse(res);
    } catch (err) {
      logger.error('RedisCacheAdapter error on get', { error: err });
    }
  }

  async put(key, value, ttl = this.ttl) {
    value = JSON.stringify(value);
    debug('put', { key, value, ttl });
    await this.queue.enqueue(key);
    if (ttl === 0) {
      // ttl of zero is a logical no-op, but redis cannot set expire time of zero
      return;
    }

    if (ttl === Infinity) {
      return this.client.set(key, value);
    }

    if (!isValidTTL(ttl)) {
      ttl = this.ttl;
    }
    return this.client.set(key, value, { PX: ttl });
  }

  async del(key) {
    debug('del', { key });
    await this.queue.enqueue(key);
    return this.client.del(key);
  }

  async clear() {
    debug('clear');
    await this.queue.enqueue(FLUSH_DB_KEY);
    return this.client.sendCommand(['FLUSHDB']);
  }

  // Used for testing
  getAllKeys() {
    return this.client.keys('*');
  }
}

export default RedisCacheAdapter;
