/**
 * Interface for service providers
 *
 * @interface
 */
function ServiceProvider() {
};

/**
 * Get the adapter
 *
 * @returns {Object} An adapter instance
 */
ServiceProvider.prototype.getAdapter = function() {
    throw new Error('A service provider must implement getAdapter!');
}

/**
 * Set the adapter
 *
 * @param {Object} An adapter
 */
ServiceProvider.prototype.setAdapter = function() {
    throw new Error('A service provider must implement setAdapter!');
}

/**
 * Resolves the adapter from the first parameter
 *
 * @param {Any}
 */
ServiceProvider.prototype.resolveAdapter = function() {
    throw new Error('A service provider must implement resolveAdapter!');
}

exports = module.exports = ServiceProvider;