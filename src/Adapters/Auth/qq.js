// Helper functions for accessing the qq Graph API.
const httpsRequest = require('./httpsRequest');
var Parse = require('parse/node').Parse;

// Returns a promise that fulfills iff this user id is valid.
function validateAuthData(authData) {
  return graphRequest('me?access_token=' + authData.access_token).then(function (data) {
    if (data && data.openid == authData.id) {
      return;
    }
    throw new Parse.Error(Parse.Error.OBJECT_NOT_FOUND, 'qq auth is invalid for this user.');
  });
}

// Returns a promise that fulfills if this app id is valid.
function validateAppId() {
  return Promise.resolve();
}

// A promisey wrapper for qq graph requests.
function graphRequest(path) {
  return httpsRequest.get('https://graph.qq.com/oauth2.0/' + path, true).then(data => {
    return parseResponseData(data);
  });
}

function parseResponseData(data) {
  const starPos = data.indexOf('(');
  const endPos = data.indexOf(')');
  if (starPos == -1 || endPos == -1) {
    throw new Parse.Error(Parse.Error.OBJECT_NOT_FOUND, 'qq auth is invalid for this user.');
  }
  data = data.substring(starPos + 1, endPos - 1);
  return JSON.parse(data);
}

module.exports = {
  validateAppId,
  validateAuthData,
  parseResponseData,
};
