// Helper functions for accessing the meetup API.
var OAuth = require('./OAuth1Client');
var Parse = require('parse/node').Parse;

// Returns a promise that fulfills iff this user id is valid.
function validateAuthData(authData, options) {
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

module.exports = {
  validateAppId: validateAppId,
  validateAuthData: validateAuthData
};
