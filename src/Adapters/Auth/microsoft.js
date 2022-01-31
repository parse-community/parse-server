// Helper functions for accessing the microsoft graph API.
var Parse = require('parse/node').Parse;
const httpsRequest = require('./httpsRequest');

// Returns a promise that fulfills if this user mail is valid.
function validateAuthData(authData) {
  return request('me', authData.access_token).then(response => {
    if (response && response.id && response.id == authData.id) {
      return;
    }
    throw new Parse.Error(
      Parse.Error.OBJECT_NOT_FOUND,
      'Microsoft Graph auth is invalid for this user.'
    );
  });
}

// Returns a promise that fulfills if this app id is valid.
function validateAppId() {
  return Promise.resolve();
}

// A promisey wrapper for api requests
function request(path, access_token) {
  return httpsRequest.get({
    host: 'graph.microsoft.com',
    path: '/v1.0/' + path,
    headers: {
      Authorization: 'Bearer ' + access_token,
    },
  });
}

module.exports = {
  validateAppId: validateAppId,
  validateAuthData: validateAuthData,
};
