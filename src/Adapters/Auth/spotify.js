// Helper functions for accessing the Spotify API.
const httpsRequest = require('./httpsRequest');
var Parse = require('parse/node').Parse;

// Returns a promise that fulfills iff this user id is valid.
function validateAuthData(authData) {
  return request('me', authData.access_token).then(data => {
    if (data && data.id == authData.id) {
      return;
    }
    console.error('Spotify auth is invalid for this user.');
    throw new Parse.Error(Parse.Error.OBJECT_NOT_FOUND, 'Unauthorized');
  });
}

// Returns a promise that fulfills if this app id is valid.
async function validateAppId(appIds, authData) {
  const access_token = authData.access_token;
  if (!Array.isArray(appIds)) {
    console.error('appIds must be an array.'); 
    throw new Parse.Error(Parse.Error.OBJECT_NOT_FOUND, 'Unauthorized');
  }
  if (!appIds.length) {
    console.error('Spotify auth is not configured.')
    throw new Parse.Error(Parse.Error.OBJECT_NOT_FOUND, 'Unauthorized');
  }
  const data = await request('me', access_token);
  if (!data || !appIds.includes(data.id)) {
    console.error('Spotify auth is invalid for this user.'); 
    throw new Parse.Error(Parse.Error.OBJECT_NOT_FOUND, 'Unauthorized');
  }
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
