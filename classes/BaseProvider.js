var ServiceProviderInterface = require('../interfaces/ServiceProvider');
var util = require('util');

function BaseProvider(adapter) {
    this.adapter = adapter;
};

util.inherits(BaseProvider, ServiceProviderInterface);

BaseProvider.prototype.getAdapter = function getAdapter() {
    return this.adapter;
}

BaseProvider.prototype.setAdapter = function setAdapter(adapter) {
    this.adapter = adapter;
}

module.exports = BaseProvider;