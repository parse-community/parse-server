// Helper functions for accessing the Spotify API.
const httpsRequest = require('./httpsRequest');
var Parse = require('parse/node').Parse;

// Returns a promise that fulfills iff this user id is valid.
function validateAuthData(authData) {
  return request('me', authData.access_token).then(data => {
    if (data && data.id == authData.id) {
      return;
    }
    throw new Parse.Error(Parse.Error.OBJECT_NOT_FOUND, 'Spotify auth is invalid for this user.');
  });
}

// Returns a promise that fulfills if this app id is valid.
function validateAppId(appIds, authData) {
  var access_token = authData.access_token;
  if (!appIds.length) {
    throw new Parse.Error(Parse.Error.OBJECT_NOT_FOUND, 'Spotify auth is not configured.');
  }
  return request('me', access_token).then(data => {
    if (data && appIds.indexOf(data.id) != -1) {
      return;
    }
    throw new Parse.Error(Parse.Error.OBJECT_NOT_FOUND, 'Spotify auth is invalid for this user.');
  });
}

// A promisey wrapper for Spotify API requests.
function request(path, access_token) {
  return httpsRequest.get({
    host: 'api.spotify.com',
    path: '/v1/' + path,
    headers: {
      Authorization: 'Bearer ' + access_token,
    },
  });
}

module.exports = {
  validateAppId: validateAppId,
  validateAuthData: validateAuthData,
};
