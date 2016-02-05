// A Config object provides information about how a specific app is
// configured.
// mount is the URL for the root of the API; includes http, domain, etc.

// TODO: Cache should get it's providers from the server context, rather than requiring them
var DatabaseProvider = require('./classes/DatabaseProvider');

function Config(applicationId, mount) {
  var cache = require('./cache');
  var dbProvider = new DatabaseProvider();

  var cacheInfo = cache.apps[applicationId];
  this.valid = !!cacheInfo;
  if (!this.valid) {
    return;
  }
  
  this.applicationId = applicationId;
  this.collectionPrefix = cacheInfo.collectionPrefix || '';
  this.database = dbProvider.getDatabaseConnection(applicationId);
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
