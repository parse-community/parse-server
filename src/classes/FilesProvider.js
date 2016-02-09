var BaseProvider = require('./BaseProvider');
var util = require('util');

var DefaultFilesAdapter = require('../GridStoreAdapter');

function FilesProvider(adapter) {
    FilesProvider.super_.call(this)
};

function setup (config) {
  config = config || {};
  config.adapter = config.adapter || DefaultFilesAdapter;

  var adapter = this.resolveAdapter(config.adapter, config.options);
  this.setAdapter(adapter);
}

util.inherits(FilesProvider, BaseProvider);

FilesProvider.prototype.setup = setup;
FilesProvider.prototype.FilesProvider = FilesProvider;

exports = module.exports = new FilesProvider();