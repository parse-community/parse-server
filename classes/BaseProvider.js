var ServiceProviderInterface = require('../interfaces/ServiceProvider');
var util = require('util');

function BaseProvider(adapter) {
    if (adapter) {
        this.adapter = adapter;
    }
};

util.inherits(BaseProvider, ServiceProviderInterface);

function getAdapter() {
    return this.adapter;
}

function setAdapter(adapter) {
    this.adapter = adapter;
}

BaseProvider.prototype.getAdapter = getAdapter;
BaseProvider.prototype.setAdapter = setAdapter;
BaseProvider.prototype.BaseProvider = BaseProvider;

exports = module.exports = new BaseProvider();