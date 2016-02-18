// A Config object provides information about how a specific app is
// configured.
// mount is the URL for the root of the API; includes http, domain, etc.
function Config(applicationId, mount) {
  var cache = require('./cache');
  var DatabaseAdapter = require('./DatabaseAdapter');

  var cacheInfo = cache.apps[applicationId];
  this.valid = !!cacheInfo;
  if (!this.valid) {
    return;
  }

  this.applicationId = applicationId;
  this.collectionPrefix = cacheInfo.collectionPrefix || '';
  this.masterKey = cacheInfo.masterKey;
  this.clientKey = cacheInfo.clientKey;
  this.javascriptKey = cacheInfo.javascriptKey;
  this.dotNetKey = cacheInfo.dotNetKey;
  this.restAPIKey = cacheInfo.restAPIKey;
  this.fileKey = cacheInfo.fileKey;
  this.facebookAppIds = cacheInfo.facebookAppIds;
  this.enableAnonymousUsers = cacheInfo.enableAnonymousUsers;

  this.database = DatabaseAdapter.getDatabaseConnection(applicationId);
  this.filesController = cacheInfo.filesController;

  this.oauth = cacheInfo.oauth;
  this.mount = mount;
}


module.exports = Config;
