'use strict';
// Modified from https://github.com/ptarjan/node-cache/blob/master/index.js
function MemoryCache(options) {
    options = options || {};

    this.cache = new Map();
    this.debug = false;
    this.hitCount = 0;
    this.missCount = 0;
    this.defaultTtl = options.defaultTtl || 10 * 60 * 1000;
};

function put (key, value, ttl, timeoutCallback) {
  if (this.debug) {
    console.log('caching: %s = %j (@%s)', key, value, ttl);
  }

  if (typeof ttl !== 'undefined' && (typeof ttl !== 'number' || isNaN(ttl) || ttl <= 0)) {
    throw new Error('Cache timeout must be a positive number');
  } else if (typeof timeoutCallback !== 'undefined' && typeof timeoutCallback !== 'function') {
    throw new Error('Cache timeout callback must be a function');
  }

  // TTL can still be set to Infinity for never expiring records
  if (ttl === undefined) {
    ttl = this.defaultTtl;
  }

  var oldRecord = this.cache.get(key);
  if (oldRecord) {
    clearTimeout(oldRecord.timeout);
  }

  var record = {
    value: value,
    expire: (ttl + Date.now())
  };

  if (!isNaN(record.expire) && ttl !== Infinity) {
    record.timeout = setTimeout(() => {
      this.del(key);
      if (timeoutCallback) {
        timeoutCallback(key);
      }
    }, ttl);
  }

  this.cache.set(key, record);

  return value;
};

function del (key) {
  if (this.debug) {
    console.log('Deleting key ', key);
  }
  var oldRecord = this.cache.get(key);
  if (oldRecord) {
    if (oldRecord.timeout) {
        clearTimeout(oldRecord.timeout);
    }

    this.cache.delete(key);
    return true;
  }

  return false;
};

function clear () {
  for (var entry of this.cache) {
    clearTimeout(entry[1].timeout);
  }
  this.cache = new Map();
  this.hitCount = 0;
  this.missCount = 0;
};

function killTimer(key) {
    var obj = this.cache.get(key);
    if (obj && obj.timeout) {
        clearTimeout(obj.timeout);
    }
};

function get (key) {
  var data = this.cache.get(key);
  if (typeof data != "undefined") {
    if (isNaN(data.expire) || data.expire >= Date.now()) {
      this.hitCount++;
      return data.value;
    } else {
      // free some space
      this.missCount++;
      this.del(key)
    }
  } else {
    this.missCount++;
  }
  return undefined;
};

function size () {
  return this.cache.size;
};

function setDebug (bool) {
  this.debug = bool;
};

function hits () {
  return this.hitCount;
};

function misses () {
  return this.missCount;
};

function keys () {
  return Array.from(this.cache.keys());
};

function toArray() {
    return Array.from(this.cache.values());
}

function map(functor, context) {
    context = context || this;
    var result = new Map();

    for (var entry of this.cache.entries()) {
        var key    = entry[0];
        var value  = entry[1];
        result.set(key, functor.call(context, value, key));
    }

    return result;
}

function filter(predicate, context) {
    context = context || this;
    var result = new Map();

    for (var entry of this.cache.entries()) {
        var key    = entry[0];
        var value  = entry[1];

        if (predicate.call(context, value, key)) {
            result.set(key, value);
        }
    }

    return result;
}

MemoryCache.prototype.put = put;
MemoryCache.prototype.get = get;
MemoryCache.prototype.del = del;
MemoryCache.prototype.clear = clear;
MemoryCache.prototype.killTimer = killTimer;
MemoryCache.prototype.size = size;
MemoryCache.prototype.hits = hits;
MemoryCache.prototype.misses = misses;
MemoryCache.prototype.keys = keys;
MemoryCache.prototype.setDebug = setDebug;
MemoryCache.prototype.toArray = toArray;
MemoryCache.prototype.map = map;
MemoryCache.prototype.filter = filter;

module.exports = MemoryCache;