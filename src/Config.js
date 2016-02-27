// A Config object provides information about how a specific app is
// configured.
// mount is the URL for the root of the API; includes http, domain, etc.

import cache from './cache';

export class Config {
  constructor(applicationId: string, mount: string) {
    let DatabaseAdapter = require('./DatabaseAdapter');
    let cacheInfo = cache.apps.get(applicationId);
    if (!cacheInfo) {
      return;
    }

    this.applicationId = applicationId;
    this.masterKey = cacheInfo.masterKey;
    this.clientKey = cacheInfo.clientKey;
    this.javascriptKey = cacheInfo.javascriptKey;
    this.dotNetKey = cacheInfo.dotNetKey;
    this.restAPIKey = cacheInfo.restAPIKey;
    this.fileKey = cacheInfo.fileKey;
    this.facebookAppIds = cacheInfo.facebookAppIds;
    this.enableAnonymousUsers = cacheInfo.enableAnonymousUsers;
    this.allowClientClassCreation = cacheInfo.allowClientClassCreation;
    this.database = DatabaseAdapter.getDatabaseConnection(applicationId, cacheInfo.collectionPrefix);
    this.hooksController = cacheInfo.hooksController;
    this.filesController = cacheInfo.filesController;
    this.pushController = cacheInfo.pushController;   
    this.loggerController = cacheInfo.loggerController;
    this.oauth = cacheInfo.oauth;

    this.mount = mount;
  }
}

export default Config;
module.exports = Config;
