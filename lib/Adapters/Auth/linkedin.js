'use strict';

// Helper functions for accessing the linkedin API.
var https = require('https');
var Parse = require('parse/node').Parse;

// Returns a promise that fulfills iff this user id is valid.
function validateAuthData(authData) {
  return request('people/~:(id)', authData.access_token, authData.is_mobile_sdk).then(function (data) {
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
    'Authorization': 'Bearer ' + access_token,
    'x-li-format': 'json'
  };

  if (is_mobile_sdk) {
    headers['x-li-src'] = 'msdk';
  }

  return new Promise(function (resolve, reject) {
    https.get({
      host: 'api.linkedin.com',
      path: '/v1/' + path,
      headers: headers
    }, function (res) {
      var data = '';
      res.on('data', function (chunk) {
        data += chunk;
      });
      res.on('end', function () {
        data = JSON.parse(data);
        resolve(data);
      });
    }).on('error', function () {
      reject('Failed to validate this access token with Linkedin.');
    });
  });
}

module.exports = {
  validateAppId: validateAppId,
  validateAuthData: validateAuthData
};