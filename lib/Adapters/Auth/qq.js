'use strict';

// Helper functions for accessing the qq Graph API.
var https = require('https');
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
  return new Promise(function (resolve, reject) {
    https.get('https://graph.qq.com/oauth2.0/' + path, function (res) {
      var data = '';
      res.on('data', function (chunk) {
        data += chunk;
      });
      res.on('end', function () {
        var starPos = data.indexOf("(");
        var endPos = data.indexOf(")");
        if (starPos == -1 || endPos == -1) {
          throw new Parse.Error(Parse.Error.OBJECT_NOT_FOUND, 'qq auth is invalid for this user.');
        }
        data = data.substring(starPos + 1, endPos - 1);
        try {
          data = JSON.parse(data);
        } catch (e) {
          return reject(e);
        }
        resolve(data);
      });
    }).on('error', function () {
      reject('Failed to validate this access token with qq.');
    });
  });
}

module.exports = {
  validateAppId: validateAppId,
  validateAuthData: validateAuthData
};