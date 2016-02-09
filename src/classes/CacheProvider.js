var util = require('util');

var BaseProvider = require('./BaseProvider');
var DefaultCacheAdapter = require('./MemoryCache');

/**
* Abstract class the provides a reference to an adapter instance (a caching implementation)
*
* @class
* @extends {BaseProvider}
* @param {Object} adapter - A cache adapter
*/
function CacheProvider(adapter) {
    CacheProvider.super_.call(this)
};

/**
* Setup the cache provider given a configuration object
*
* @method
* @param {Object} config - A configuration object
* @param {Any} config.adapter - A string, object, instance, or function that resolves to an adapter implementation
* @param {Object} config.options - An object passed to the adapter on instantiation (if adapter is not already instantiated)
*/
function setup (config) {
  config = config || {};
  config.adapter = config.adapter || DefaultCacheAdapter;

  var adapter = this.resolveAdapter(config.adapter, config.options);
  this.setAdapter(adapter);
}

util.inherits(CacheProvider, BaseProvider);

CacheProvider.prototype.setup = setup;
CacheProvider.prototype.CacheProvider = CacheProvider;

exports = module.exports = new CacheProvider();