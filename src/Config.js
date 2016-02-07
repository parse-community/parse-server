// A Config object provides information about how a specific app is
// configured.
// mount is the URL for the root of the API; includes http, domain, etc.
function Config(applicationId, mount) {
  var cacheProvider = new (require('./classes/CacheProvider'));
  var cache = cacheProvider.getAdapter();
  var DatabaseAdapter = require('./DatabaseAdapter');

  var cacheInfo = cache.get(applicationId);
  this.valid = !!cacheInfo;
  if (!this.valid) {
    return;
  }

  this.applicationId = applicationId;
  this.collectionPrefix = cacheInfo.collectionPrefix || '';
  this.database = DatabaseAdapter.getDatabaseConnection(applicationId);
  this.masterKey = cacheInfo.masterKey;
  this.clientKey = cacheInfo.clientKey;
  this.javascriptKey = cacheInfo.javascriptKey;
  this.dotNetKey = cacheInfo.dotNetKey;
  this.restAPIKey = cacheInfo.restAPIKey;
  this.fileKey = cacheInfo.fileKey;
  this.facebookAppIds = cacheInfo.facebookAppIds;
  this.mount = mount;
}


module.exports = Config;
