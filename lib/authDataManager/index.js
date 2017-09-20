"use strict";

var facebook = require('./facebook');
var instagram = require("./instagram");
var linkedin = require("./linkedin");
var meetup = require("./meetup");
var google = require("./google");
var github = require("./github");
var twitter = require("./twitter");
var spotify = require("./spotify");
var digits = require("./twitter"); // digits tokens are validated by twitter
var janrainengage = require("./janrainengage");
var janraincapture = require("./janraincapture");
var vkontakte = require("./vkontakte");

var anonymous = {
  validateAuthData: function validateAuthData() {
    return Promise.resolve();
  },
  validateAppId: function validateAppId() {
    return Promise.resolve();
  }
};

var providers = {
  facebook: facebook,
  instagram: instagram,
  linkedin: linkedin,
  meetup: meetup,
  google: google,
  github: github,
  twitter: twitter,
  spotify: spotify,
  anonymous: anonymous,
  digits: digits,
  janrainengage: janrainengage,
  janraincapture: janraincapture,
  vkontakte: vkontakte
};

module.exports = function () {
  var oauthOptions = arguments.length > 0 && arguments[0] !== undefined ? arguments[0] : {};
  var enableAnonymousUsers = arguments.length > 1 && arguments[1] !== undefined ? arguments[1] : true;

  var _enableAnonymousUsers = enableAnonymousUsers;
  var setEnableAnonymousUsers = function setEnableAnonymousUsers(enable) {
    _enableAnonymousUsers = enable;
  };
  // To handle the test cases on configuration
  var getValidatorForProvider = function getValidatorForProvider(provider) {

    if (provider === 'anonymous' && !_enableAnonymousUsers) {
      return;
    }

    var defaultProvider = providers[provider];
    var optionalProvider = oauthOptions[provider];

    if (!defaultProvider && !optionalProvider) {
      return;
    }

    var appIds = void 0;
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

    return function (authData) {
      return validateAuthData(authData, optionalProvider).then(function () {
        if (appIds) {
          return validateAppId(appIds, authData, optionalProvider);
        }
        return Promise.resolve();
      });
    };
  };

  return Object.freeze({
    getValidatorForProvider: getValidatorForProvider,
    setEnableAnonymousUsers: setEnableAnonymousUsers
  });
};