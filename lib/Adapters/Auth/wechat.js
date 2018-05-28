'use strict';

// Helper functions for accessing the WeChat Graph API.
var https = require('https');
var Parse = require('parse/node').Parse;

// Returns a promise that fulfills iff this user id is valid.
function validateAuthData(authData) {
  return graphRequest('auth?access_token=' + authData.access_token + '&openid=' + authData.id).then(function (data) {
    if (data.errcode == 0) {
      return;
    }
    throw new Parse.Error(Parse.Error.OBJECT_NOT_FOUND, 'wechat auth is invalid for this user.');
  });
}

// Returns a promise that fulfills if this app id is valid.
function validateAppId() {
  return Promise.resolve();
}

// A promisey wrapper for WeChat graph requests.
function graphRequest(path) {
  return new Promise(function (resolve, reject) {
    https.get('https://api.weixin.qq.com/sns/' + path, function (res) {
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
      reject('Failed to validate this access token with wechat.');
    });
  });
}

module.exports = {
  validateAppId,
  validateAuthData
};