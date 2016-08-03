'use strict';

// Helper functions for accessing the google API.
var https = require('https');
var Parse = require('parse/node').Parse;

// Returns a promise that fulfills iff this user id is valid.
function validateAuthData(authData) {
  return request("tokeninfo?id_token=" + authData.access_token).then(function (response) {
    if (response && response.sub == authData.id) {
      return;
    }
    throw new Parse.Error(Parse.Error.OBJECT_NOT_FOUND, 'Google auth is invalid for this user.');
  });
}

// Returns a promise that fulfills iff this app id is valid.
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
    }).on('error', function (e) {
      reject('Failed to validate this access token with Google.');
    });
  });
}

module.exports = {
  validateAppId: validateAppId,
  validateAuthData: validateAuthData
};