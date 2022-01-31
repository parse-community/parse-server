// Helper functions for accessing the weibo Graph API.
var httpsRequest = require('./httpsRequest');
var Parse = require('parse/node').Parse;
var querystring = require('querystring');

// Returns a promise that fulfills iff this user id is valid.
function validateAuthData(authData) {
  return graphRequest(authData.access_token).then(function (data) {
    if (data && data.uid == authData.id) {
      return;
    }
    throw new Parse.Error(Parse.Error.OBJECT_NOT_FOUND, 'weibo auth is invalid for this user.');
  });
}

// Returns a promise that fulfills if this app id is valid.
function validateAppId() {
  return Promise.resolve();
}

// A promisey wrapper for weibo graph requests.
function graphRequest(access_token) {
  var postData = querystring.stringify({
    access_token: access_token,
  });
  var options = {
    hostname: 'api.weibo.com',
    path: '/oauth2/get_token_info',
    method: 'POST',
    headers: {
      'Content-Type': 'application/x-www-form-urlencoded',
      'Content-Length': Buffer.byteLength(postData),
    },
  };
  return httpsRequest.request(options, postData);
}

module.exports = {
  validateAppId,
  validateAuthData,
};
