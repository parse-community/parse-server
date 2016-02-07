var BaseProvider = require('./BaseProvider');
var util = require('util');

// Singleton for the entire server.
// TODO: Refactor away from singleton paradigm
var instance = null;

function CacheProvider(adapter) {
    if (instance) {
        return instance;
    }

    instance = this;

    // Support passing in adapter paths
    if (typeof adapter === 'string') {
        adapter = require(adapter);
    }

    // Instantiate the adapter if the class got passed instead of an instance
    if (typeof adapter === 'function') {
        this.adapter = new adapter();
    } else {
        this.adapter = adapter;
    }
};

util.inherits(CacheProvider, BaseProvider);

module.exports = CacheProvider;