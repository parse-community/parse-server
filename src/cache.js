const {InMemoryCache} = require('./Adapters/Cache/InMemoryCache');

export var AppCache = new InMemoryCache({ttl: NaN});
module.exports = { AppCache };
