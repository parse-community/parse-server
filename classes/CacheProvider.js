var BaseProvider = require('./BaseProvider').BaseProvider;
var util = require('util');

function CacheProvider(adapter) {
    CacheProvider.super_.call(this)
};

util.inherits(CacheProvider, BaseProvider);

CacheProvider.prototype.CacheProvider = CacheProvider;

exports = module.exports = new CacheProvider();