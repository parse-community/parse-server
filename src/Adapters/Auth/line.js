// Helper functions for accessing the line API.
var Parse = require('parse/node').Parse;
const httpsRequest = require('./httpsRequest');

// Returns a promise that fulfills if this user id is valid.
function validateAuthData(authData) {
  return request('profile', authData.access_token).then(response => {
    if (response && response.userId && response.userId === authData.id) {
      return;
    }
    throw new Parse.Error(Parse.Error.OBJECT_NOT_FOUND, 'Line auth is invalid for this user.');
  });
}

// Returns a promise that fulfills iff this app id is valid.
function validateAppId() {
  return Promise.resolve();
}

// A promisey wrapper for api requests
function request(path, access_token) {
  var options = {
    host: 'api.line.me',
    path: '/v2/' + path,
    method: 'GET',
    headers: {
      Authorization: 'Bearer ' + access_token,
    },
  };
  return httpsRequest.get(options);
}

module.exports = {
  validateAppId: validateAppId,
  validateAuthData: validateAuthData,
};
