import { createClient } from 'redis';
import logger from '../../logger';
import { KeyPromiseQueue } from '../../KeyPromiseQueue';

const DEFAULT_REDIS_TTL = 30 * 1000; // 30 seconds in milliseconds
const FLUSH_DB_KEY = '__flush_db__';
// Number of keys SCAN is asked to examine per iteration when clearing a scope.
const SCAN_COUNT = 100;
// Characters that carry meaning in a Redis glob pattern and therefore have to
// be escaped before a caller-supplied prefix is used as a SCAN MATCH pattern.
const GLOB_SPECIAL_CHARS = /[?*[\]^\\]/g;

function escapeGlob(value) {
  return String(value).replace(GLOB_SPECIAL_CHARS, char => `\\${char}`);
}

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
    this.client.on('error', err => { logger.error('RedisCacheAdapter client error', { error: err }) });
    this.client.on('connect', () => {});
    this.client.on('reconnecting', () => {});
    this.client.on('ready', () => {});
  }

  async connect() {
    if (this.client.isOpen) {
      return;
    }
    return await this.client.connect();
  }

  async handleShutdown() {
    if (!this.client) {
      return;
    }
    try {
      await this.client.close();
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

  /**
   * Empty the cache. When a `prefix` is given, only keys of the form
   * `<prefix>:*` are removed, using SCAN and UNLINK so that keys belonging to
   * other Parse apps or to other consumers of the same Redis database survive.
   * Without a `prefix` the whole database is flushed.
   */
  async clear(prefix) {
    debug('clear', { prefix });
    await this.queue.enqueue(FLUSH_DB_KEY);
    if (prefix == null) {
      return this.client.sendCommand(['FLUSHDB']);
    }
    const match = `${escapeGlob(prefix)}:*`;
    let cursor = '0';
    do {
      const reply = await this.client.scan(cursor, { MATCH: match, COUNT: SCAN_COUNT });
      cursor = String(reply.cursor);
      if (reply.keys.length) {
        await this.client.unlink(reply.keys);
      }
    } while (cursor !== '0');
  }

  // Used for testing
  getAllKeys() {
    return this.client.keys('*');
  }
}

export default RedisCacheAdapter;
