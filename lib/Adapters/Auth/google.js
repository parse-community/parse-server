'use strict';

// Helper functions for accessing the google API.
var https = require('https');
var Parse = require('parse/node').Parse;

function validateIdToken(id, token) {
  return request("tokeninfo?id_token=" + token).then(function (response) {
    if (response && (response.sub == id || response.user_id == id)) {
      return;
    }
    throw new Parse.Error(Parse.Error.OBJECT_NOT_FOUND, 'Google auth is invalid for this user.');
  });
}

function validateAuthToken(id, token) {
  return request("tokeninfo?access_token=" + token).then(function (response) {
    if (response && (response.sub == id || response.user_id == id)) {
      return;
    }
    throw new Parse.Error(Parse.Error.OBJECT_NOT_FOUND, 'Google auth is invalid for this user.');
  });
}

// Returns a promise that fulfills if this user id is valid.
function validateAuthData(authData) {
  if (authData.id_token) {
    return validateIdToken(authData.id, authData.id_token);
  } else {
    return validateAuthToken(authData.id, authData.access_token).then(function () {
      // Validation with auth token worked
      return;
    }, function () {
      // Try with the id_token param
      return validateIdToken(authData.id, authData.access_token);
    });
  }
}

// Returns a promise that fulfills if this app id is valid.
function validateAppId() {
  return Promise.resolve();
}

// A promisey wrapper for api requests
function request(path) {
  return new Promise(function (resolve, reject) {
    https.get("https://www.googleapis.com/oauth2/v3/" + path, function (res) {
      var data = '';
      res.on('data', function (chunk) {
        data += chunk;
      });
      res.on('end', function () {
        data = JSON.parse(data);
        resolve(data);
      });
    }).on('error', function () {
      reject('Failed to validate this access token with Google.');
    });
  });
}

module.exports = {
  validateAppId: validateAppId,
  validateAuthData: validateAuthData
};