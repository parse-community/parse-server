'use strict';

// Helper functions for accessing the vkontakte API.

var https = require('https');
var Parse = require('parse/node').Parse;
var logger = require('../../logger').default;

// Returns a promise that fulfills iff this user id is valid.
function validateAuthData(authData, params) {
  return vkOAuth2Request(params).then(function (response) {
    if (response && response.access_token) {
      return request("api.vk.com", "method/secure.checkToken?token=" + authData.access_token + "&client_secret=" + params.appSecret + "&access_token=" + response.access_token).then(function (response) {
        if (response && response.response && response.response.user_id == authData.id) {
          return;
        }
        throw new Parse.Error(Parse.Error.OBJECT_NOT_FOUND, 'Vk auth is invalid for this user.');
      });
    }
    logger.error('Vk Auth', 'Vk appIds or appSecret is incorrect.');
    throw new Parse.Error(Parse.Error.OBJECT_NOT_FOUND, 'Vk appIds or appSecret is incorrect.');
  });
}

function vkOAuth2Request(params) {
  return new Promise(function (resolve) {
    if (!params || !params.appIds || !params.appIds.length || !params.appSecret || !params.appSecret.length) {
      logger.error('Vk Auth', 'Vk auth is not configured. Missing appIds or appSecret.');
      throw new Parse.Error(Parse.Error.OBJECT_NOT_FOUND, 'Vk auth is not configured. Missing appIds or appSecret.');
    }
    resolve();
  }).then(function () {
    return request("oauth.vk.com", "access_token?client_id=" + params.appIds + "&client_secret=" + params.appSecret + "&v=5.59&grant_type=client_credentials");
  });
}

// Returns a promise that fulfills iff this app id is valid.
function validateAppId() {
  return Promise.resolve();
}

// A promisey wrapper for api requests
function request(host, path) {
  return new Promise(function (resolve, reject) {
    https.get("https://" + host + "/" + path, function (res) {
      var data = '';
      res.on('data', function (chunk) {
        data += chunk;
      });
      res.on('end', function () {
        try {
          data = JSON.parse(data);
        } catch(e) {
          return reject(e);
        }
        resolve(data);
      });
    }).on('error', function () {
      reject('Failed to validate this access token with Vk.');
    });
  });
}

module.exports = {
  validateAppId: validateAppId,
  validateAuthData: validateAuthData
};
