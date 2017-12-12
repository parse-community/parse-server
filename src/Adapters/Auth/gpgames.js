'use strict';

// Helper functions for accessing the google API.
var https = require('https');
var Parse = require('parse/node').Parse;

// Returns a promise that fulfills if this user id is valid.
function validateAuthData(authData) {
  return request("players/" + id + "?access_token=" + token).then(response => {
    if (response && (response.playerId == id)) 
    {
      return;
    }
    throw new Parse.Error(Parse.Error.OBJECT_NOT_FOUND, 'Google auth is invalid for this user.');
  });
}

// Returns a promise that fulfills if this app id is valid.
function validateAppId() {
  return Promise.resolve();
}

// A promisey wrapper for api requests
function request(path) {
  return new Promise(function (resolve, reject) {
    https.get("https://www.googleapis.com/games/v1/" + path, function (res) {
      var data = '';
      res.on('data', function (chunk) {
        data += chunk;
      });
      res.on('end', function () {
        try {
          data = JSON.parse(data);
        } catch (e) {
          return reject(e);
        }
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