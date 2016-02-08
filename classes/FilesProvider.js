var BaseProvider = require('./BaseProvider');
var util = require('util');

// Singleton for the entire server. TODO: Refactor away from singleton paradigm
var instance = null;

// TODO: Instantiate the adapter if it's a constructor. 
function FilesProvider(adapter) {
    if (instance) {
        return instance;
    }

    instance = this;

    this.adapter = adapter;
};

util.inherits(FilesProvider, BaseProvider);

module.exports = FilesProvider;