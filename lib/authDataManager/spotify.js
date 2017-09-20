'use strict';

// Helper functions for accessing the Spotify API.
var https = require('https');
var Parse = require('parse/node').Parse;

// Returns a promise that fulfills iff this user id is valid.
function validateAuthData(authData) {
  return request('me', authData.access_token).then(function (data) {
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
  return request('me', access_token).then(function (data) {
    if (data && appIds.indexOf(data.id) != -1) {
      return;
    }
    throw new Parse.Error(Parse.Error.OBJECT_NOT_FOUND, 'Spotify auth is invalid for this user.');
  });
}

// A promisey wrapper for Spotify API requests.
function request(path, access_token) {
  return new Promise(function (resolve, reject) {
    https.get({
      host: 'api.spotify.com',
      path: '/v1/' + path,
      headers: {
        'Authorization': 'Bearer ' + access_token
      }
    }, function (res) {
      var data = '';
      res.on('data', function (chunk) {
        data += chunk;
      });
      res.on('end', function () {
        data = JSON.parse(data);
        resolve(data);
      });
    }).on('error', function (e) {
      reject('Failed to validate this access token with Spotify.');
    });
  });
}

module.exports = {
  validateAppId: validateAppId,
  validateAuthData: validateAuthData
};