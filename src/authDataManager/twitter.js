// Helper functions for accessing the twitter API.
var OAuth = require('./OAuth1Client');
var Parse = require('parse/node').Parse;
var logger = require('../logger').default;

// Returns a promise that fulfills iff this user id is valid.
function validateAuthData(authData, options) {
  options = handleMultipleConfigurations(authData, options);
  var client = new OAuth(options);
  client.host = "api.twitter.com";
  client.auth_token = authData.auth_token;
  client.auth_token_secret = authData.auth_token_secret;
  
  return client.get("/1.1/account/verify_credentials.json").then((data) => {
    if (data && data.id == authData.id) {
      return;
    }
    throw new Parse.Error(
      Parse.Error.OBJECT_NOT_FOUND,
      'Twitter auth is invalid for this user.');
  });
}

// Returns a promise that fulfills iff this app id is valid.
function validateAppId() {
  return Promise.resolve();
}

function handleMultipleConfigurations(authData, options) {
  if (Array.isArray(options)) {
    let consumer_key = authData.consumer_key;
    if (!consumer_key) {
      logger.error('Twitter Auth', 'Multiple twitter configurations are available, by no consumer_key was sent by the client.');
      throw new Parse.Error(Parse.Error.OBJECT_NOT_FOUND, 'Twitter auth is invalid for this user.');
    }
    options = options.filter((option) => {
      return option.consumer_key == consumer_key;
    });

    if (options.length == 0) {
      logger.error('Twitter Auth','Cannot find a configuration for the provided consumer_key');
      throw new Parse.Error(Parse.Error.OBJECT_NOT_FOUND, 'Twitter auth is invalid for this user.');
    }
    options = options[0];
  }
  return options;
}

module.exports = {
  validateAppId,
  validateAuthData,
  handleMultipleConfigurations
};
