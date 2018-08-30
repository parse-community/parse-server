// Helper functions for accessing the Facebook Graph API.
const httpsRequest = require('./httpsRequest');
var Parse = require('parse/node').Parse;

// Returns a promise that fulfills iff this user id is valid.
function validateAuthData(authData) {
  return graphRequest(
    'me?fields=id&access_token=' + authData.access_token
  ).then(data => {
    if (data && data.id == authData.id) {
      return;
    }
    throw new Parse.Error(
      Parse.Error.OBJECT_NOT_FOUND,
      'Facebook auth is invalid for this user.'
    );
  });
}

// Returns a promise that fulfills iff this app id is valid.
function validateAppId(appIds, authData) {
  var access_token = authData.access_token;
  if (!appIds.length) {
    throw new Parse.Error(
      Parse.Error.OBJECT_NOT_FOUND,
      'Facebook auth is not configured.'
    );
  }
  return graphRequest('app?access_token=' + access_token).then(data => {
    if (data && appIds.indexOf(data.id) != -1) {
      return;
    }
    throw new Parse.Error(
      Parse.Error.OBJECT_NOT_FOUND,
      'Facebook auth is invalid for this user.'
    );
  });
}

// A promisey wrapper for FB graph requests.
function graphRequest(path) {
  return httpsRequest.get('https://graph.facebook.com/' + path);
}

module.exports = {
  validateAppId: validateAppId,
  validateAuthData: validateAuthData,
};
