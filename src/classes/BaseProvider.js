var ServiceProviderInterface = require('../interfaces/ServiceProvider');
var util = require('util');

/**
 * A base provider class that allows for an abstraction of adapter implementations
 *
 * @class
 * @implements {ServiceProvider}
 * @param {Object} adapter - An adapter
 */
function BaseProvider(adapter) {
    if (adapter) {
        this.adapter = adapter;
    }
};

util.inherits(BaseProvider, ServiceProviderInterface);

/**
 * Get the adapter
 *
 * @returns {Object} An adapter instance
 */
function getAdapter() {
    return this.adapter;
}

/**
 * Set the adapter
 *
 * @param {Object} adapter - An adapter
 */
function setAdapter(adapter) {
    this.adapter = adapter;
}

/**
 * Resolves the adapter
 *
 * @param {Object|String|Function} adapter - [1] An object implementing the adapter interface, or [2] a function that returns [1], or [3] A string of either the name of an included npm module or a path to a local module that returns [1] or [2].
 * @param {Object} options - An object passed to the adapter on instantiation (if adapter is not already instantiated)
 * @returns {Object} An object implementing the adapter interface
 */
function resolveAdapter(adapter, options) {
    // Support passing in adapter paths
    if (typeof adapter === 'string') {
        adapter = require(adapter);
    }

    // Instantiate the adapter if the class got passed instead of an instance
    if (typeof adapter === 'function') {
        adapter = new adapter(options);
    }

    return adapter;
}

function setup (config) {
  config = config || {};
  config.adapter = config.adapter || DefaultFilesAdapter;

  var adapter = this.resolveAdapter(config.adapter, config.options);
  this.setAdapter(adapter);
}


BaseProvider.prototype.getAdapter = getAdapter;
BaseProvider.prototype.setAdapter = setAdapter;
BaseProvider.prototype.resolveAdapter = resolveAdapter;
BaseProvider.prototype.setup = setup;

exports = module.exports = BaseProvider;