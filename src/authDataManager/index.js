let facebook = require('./facebook');
let instagram = require("./instagram");
let linkedin = require("./linkedin");
let meetup = require("./meetup");
let google = require("./google");
let github = require("./github");
let twitter = require("./twitter");

let anonymous = {
  validateAuthData: () => {
    return Promise.resolve();
  },
  validateAppId: () => {
    return Promise.resolve();
  }
}

let providers = {
  facebook,
  instagram,
  linkedin,
  meetup,
  google,
  github,
  twitter,
  anonymous
}

module.exports = function(oauthOptions = {}, enableAnonymousUsers = true) {
  let _enableAnonymousUsers = enableAnonymousUsers;
  let setEnableAnonymousUsers = function(enable) {
    _enableAnonymousUsers = enable;
  }
  // To handle the test cases on configuration
  let getValidatorForProvider = function(provider) {
    
    if (provider === 'anonymous' && !_enableAnonymousUsers) {
      return;
    }
    
    let defaultProvider = providers[provider];
    let optionalProvider = oauthOptions[provider];
    
    if (!defaultProvider && !optionalProvider) {
      return;
    }

    let appIds;
    if (optionalProvider) {
      appIds = optionalProvider.appIds;
    }
    
    var validateAuthData;
    var validateAppId;

    if (defaultProvider) {
      validateAuthData = defaultProvider.validateAuthData;
      validateAppId = defaultProvider.validateAppId;
    }

    // Try the configuration methods
    if (optionalProvider) {
      if (optionalProvider.module) {
        validateAuthData = require(optionalProvider.module).validateAuthData;
        validateAppId = require(optionalProvider.module).validateAppId;
      };

      if (optionalProvider.validateAuthData) {
        validateAuthData = optionalProvider.validateAuthData;
      }
      if (optionalProvider.validateAppId) {
        validateAppId = optionalProvider.validateAppId;
      }
    }
    
    if (!validateAuthData || !validateAppId) {
      return;
    }
    
    return function(authData) {
      return validateAuthData(authData, optionalProvider).then(() => {
        if (appIds) {
          return validateAppId(appIds, authData, optionalProvider);
        }
        return Promise.resolve();
      })
    }
  }

  return Object.freeze({
    getValidatorForProvider,
    setEnableAnonymousUsers, 
  })
}
