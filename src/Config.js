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
    
    this.serverURL = cacheInfo.serverURL;
    this.publicServerURL = cacheInfo.publicServerURL;
    this.verifyUserEmails = cacheInfo.verifyUserEmails;
    this.appName = cacheInfo.appName;

    this.hooksController = cacheInfo.hooksController;
    this.filesController = cacheInfo.filesController;
    this.pushController = cacheInfo.pushController;
    this.loggerController = cacheInfo.loggerController;
    this.userController = cacheInfo.userController;
    this.oauth = cacheInfo.oauth;
    this.customPages = cacheInfo.customPages || {};
    this.mount = mount;
  }
  
  get linksServerURL() {
    return this.publicServerURL || this.serverURL;
  }
  
  get invalidLinkURL() {
    return this.customPages.invalidLink || `${this.linksServerURL}/apps/invalid_link.html`;
  }
  
  get verifyEmailSuccessURL() {
    return this.customPages.verifyEmailSuccess || `${this.linksServerURL}/apps/verify_email_success.html`;
  }
  
  get choosePasswordURL() {
    return this.customPages.choosePassword || `${this.linksServerURL}/apps/choose_password`;
  }
  
  get requestResetPasswordURL() {
    return `${this.linksServerURL}/apps/${this.applicationId}/request_password_reset`;
  }
  
  get passwordResetSuccessURL() {
    return this.customPages.passwordResetSuccess || `${this.linksServerURL}/apps/password_reset_success.html`;
  }
  
  get verifyEmailURL() {
    return `${this.linksServerURL}/apps/${this.applicationId}/verify_email`;
  }
};

export default Config;
module.exports = Config;
