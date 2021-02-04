// Helper functions for accessing the linkedin API.
var Parse = require('parse/node').Parse;
const httpsRequest = require('./httpsRequest');

// Returns a promise that fulfills iff this user id is valid.
function validateAuthData(authData) {
  return request('me', authData.access_token, authData.is_mobile_sdk).then(data => {
    if (data && data.id == authData.id) {
      return;
    }
    throw new Parse.Error(Parse.Error.OBJECT_NOT_FOUND, 'Linkedin auth is invalid for this user.');
  });
}

// Returns a promise that fulfills iff this app id is valid.
function validateAppId() {
  return Promise.resolve();
}

// A promisey wrapper for api requests
function request(path, access_token, is_mobile_sdk) {
  var headers = {
    Authorization: 'Bearer ' + access_token,
    'x-li-format': 'json',
  };

  if (is_mobile_sdk) {
    headers['x-li-src'] = 'msdk';
  }
  return httpsRequest.get({
    host: 'api.linkedin.com',
    path: '/v2/' + path,
    headers: headers,
  });
}

module.exports = {
  validateAppId: validateAppId,
  validateAuthData: validateAuthData,
};
