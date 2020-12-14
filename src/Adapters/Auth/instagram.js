// Helper functions for accessing the instagram API.
var Parse = require('parse/node').Parse;
const httpsRequest = require('./httpsRequest');
const defaultURL = 'https://graph.instagram.com/';

// Returns a promise that fulfills if this user id is valid.
function validateAuthData(authData) {
  const apiURL = authData.apiURL || defaultURL;
  const path = `${apiURL}me?fields=id&access_token=${authData.access_token}`;
  return httpsRequest.get(path).then(response => {
    if (response && response.data && response.data.id == authData.id) {
      return;
    }
    throw new Parse.Error(Parse.Error.OBJECT_NOT_FOUND, 'Instagram auth is invalid for this user.');
  });
}

// Returns a promise that fulfills iff this app id is valid.
function validateAppId() {
  return Promise.resolve();
}

module.exports = {
  validateAppId,
  validateAuthData,
};
