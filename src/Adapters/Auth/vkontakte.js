'use strict';

// Helper functions for accessing the vkontakte API.

const httpsRequest = require('./httpsRequest');
var Parse = require('parse/node').Parse;

// Returns a promise that fulfills iff this user id is valid.
function validateAuthData(authData, params) {
  if (!params.apiVersion) {
    params.apiVersion = '5.131';
  }

  return request(
    'api.vk.com',
    'method/users.get?access_token=' + authData.access_token + '&v=' + params.apiVersion
  ).then(function (response) {
    if (
      response &&
      response.response &&
      response.response.length &&
      response.response[0].id == authData.id
    ) {
      return;
    }
    throw new Parse.Error(Parse.Error.OBJECT_NOT_FOUND, 'Vk auth is invalid for this user.');
  });
}

// Returns a promise that fulfills iff this app id is valid.
function validateAppId() {
  return Promise.resolve();
}

// A promisey wrapper for api requests
function request(host, path) {
  return httpsRequest.get('https://' + host + '/' + path);
}

module.exports = {
  validateAppId: validateAppId,
  validateAuthData: validateAuthData,
};
