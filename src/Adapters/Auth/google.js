// Helper functions for accessing the google API.
var Parse = require('parse/node').Parse;
const httpsRequest = require('./httpsRequest');

function validateIdToken(id, token) {
  return googleRequest('tokeninfo?id_token=' + token).then(response => {
    if (response && (response.sub == id || response.user_id == id)) {
      return;
    }
    throw new Parse.Error(
      Parse.Error.OBJECT_NOT_FOUND,
      'Google auth is invalid for this user.'
    );
  });
}

function validateAuthToken(id, token) {
  return googleRequest('tokeninfo?access_token=' + token).then(response => {
    if (response && (response.sub == id || response.user_id == id)) {
      return;
    }
    throw new Parse.Error(
      Parse.Error.OBJECT_NOT_FOUND,
      'Google auth is invalid for this user.'
    );
  });
}

// Returns a promise that fulfills if this user id is valid.
function validateAuthData(authData) {
  if (authData.id_token) {
    return validateIdToken(authData.id, authData.id_token);
  } else {
    return validateAuthToken(authData.id, authData.access_token).then(
      () => {
        // Validation with auth token worked
        return;
      },
      () => {
        // Try with the id_token param
        return validateIdToken(authData.id, authData.access_token);
      }
    );
  }
}

// Returns a promise that fulfills if this app id is valid.
function validateAppId() {
  return Promise.resolve();
}

// A promisey wrapper for api requests
function googleRequest(path) {
  return httpsRequest.get('https://www.googleapis.com/oauth2/v3/' + path);
}

module.exports = {
  validateAppId: validateAppId,
  validateAuthData: validateAuthData,
};
