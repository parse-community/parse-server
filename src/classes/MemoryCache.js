/**
* In-memory cache using Map for storage
*
* @class
*/
export class MemoryCache {
  /**
   * @constructor
   * @param {Object} options - An object of default options
   * @param {String} [options.defaultTtl=600000] - The number of milliseconds to use as the default time-to-live of a cache entry
   */
  constructor(options) {
    options = options || {};

    this.cache = new Map();
    this.debug = false;
    this.hitCount = 0;
    this.missCount = 0;
    this.defaultTtl = options.defaultTtl || 10 * 60 * 1000;
  }

  /**
   * Puts a key value mapping into the map that will automatically expire given a TTL.
   * @method put
   * @param {String} key - A unique key
   * @param {Any} value - A value to be stored
   * @param {Number} ttl - The number of milliseconds until the key/value pair is removed from the cache
   * @param {Function} timeoutCallback - A callback that is fired on expiration (post removal)
   * @returns {Object} The MemoryCache instance
   */
  put (key, value, ttl, timeoutCallback) {
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
  }



  /**
   * Deletes a key/value pair from the cache
   * @method del
   * @param {String} key - A unique key
   * @returns {Boolean} True if a record was removed from the cache (a hit) or false if the record was not found (a miss)
   */
  del (key) {
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
  }

  /**
   * Resets the cache to it's original state
   * @method clear
   */
  clear () {
    for (var entry of this.cache) {
      clearTimeout(entry[1].timeout);
    }
    this.cache = new Map();
    this.hitCount = 0;
    this.missCount = 0;
  };

  /**
   * Disables a timer (timeout/expiration) for a specifiy key/value pair
   * @method killTimer
   * @param {String} key - A unique key
   */
  killTimer(key) {
      var obj = this.cache.get(key);
      if (obj && obj.timeout) {
          clearTimeout(obj.timeout);
      }
  };

  /**
   * Retrieves a value given a key from the cache
   * @method get
   * @param {String} key - A unique key
   * @returns {Any|undefined} Returns the value for the key in the cache or undefined if not found
   */
  get (key) {
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

  /**
   * @method size
   * @returns {Number} The number of key/value pairs in the cache
   */
  size () {
    return this.cache.size;
  };

  /**
   * Toggles debug statements
   * @method setDebug
   * @param {Boolean} bool - The value to set debug
   */
  setDebug (bool) {
    this.debug = bool;
  };

  /**
   * @method hits
   * @returns {Number} The number of values successfully retrieved via get()
   */
  hits () {
    return this.hitCount;
  };

  /**
   * @method misses
   * @returns {Number} The number of unsuccessfully get attempts
   */
  misses () {
    return this.missCount;
  };

  /**
   * @method keys
   * @returns {Array} An array of all the keys in the map
   */
  keys () {
    return Array.from(this.cache.keys());
  };

  /**
   * @method toArray
   * @returns {Array} An array of all the values in the map
   */
  toArray() {
      return Array.from(this.cache.values());
  }

  /**
   * @method map
   * @param {Function} functor - A function that transforms a value for a given key/value pair
   * @param {Object} context - The context for the functor call
   * @returns {Map} A map containing key/value pairs where the original value was transformed by the provided functor
   */
  map(functor, context) {
      context = context || this;
      var result = new Map();

      for (var entry of this.cache.entries()) {
          var key    = entry[0];
          var value  = entry[1];
          result.set(key, functor.call(context, value, key));
      }

      return result;
  }

  /**
   * @method filter
   * @param {Function} predicate - A filter function
   * @param {Object} context - The context for the predicate call
   * @returns {Map} A map containing truthy results of a provided filter function
   */
  filter(predicate, context) {
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

};


export default MemoryCache;