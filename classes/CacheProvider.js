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
    this.adapter = adapter;
};

util.inherits(CacheProvider, BaseProvider);

module.exports = CacheProvider;