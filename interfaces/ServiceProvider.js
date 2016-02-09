function ServiceProviderInterface() {
};

ServiceProviderInterface.prototype.getAdapter = function() {
    throw new Error('A service provider must implement getAdapter!');
}

ServiceProviderInterface.prototype.setAdapter = function() {
    throw new Error('A service provider must implement setAdapter!');
}

exports = module.exports = ServiceProviderInterface;