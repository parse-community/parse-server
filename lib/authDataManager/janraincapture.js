'use strict';

// Helper functions for accessing the Janrain Capture API.
var https = require('https');
var Parse = require('parse/node').Parse;
var querystring = require('querystring');

// Returns a promise that fulfills iff this user id is valid.
function validateAuthData(authData, options) {
  return request(options.janrain_capture_host, authData.access_token).then(function (data) {
    //successful response will have a "stat" (status) of 'ok' and a result node that stores the uuid, because that's all we asked for
    //see: https://docs.janrain.com/api/registration/entity/#entity
    if (data && data.stat == 'ok' && data.result == authData.id) {
      return;
    }
    throw new Parse.Error(Parse.Error.OBJECT_NOT_FOUND, 'Janrain capture auth is invalid for this user.');
  });
}

// Returns a promise that fulfills iff this app id is valid.
function validateAppId() {
  //no-op
  return Promise.resolve();
}

// A promisey wrapper for api requests
function request(host, access_token) {

  var query_string_data = querystring.stringify({
    'access_token': access_token,
    'attribute_name': 'uuid' // we only need to pull the uuid for this access token to make sure it matches
  });

  return new Promise(function (resolve, reject) {
    https.get({
      host: host,
      path: '/entity?' + query_string_data
    }, function (res) {
      var data = '';
      res.on('data', function (chunk) {
        data += chunk;
      });
      res.on('end', function () {
        resolve(JSON.parse(data));
      });
    }).on('error', function (e) {
      reject('Failed to validate this access token with Janrain capture.');
    });
  });
}

module.exports = {
  validateAppId: validateAppId,
  validateAuthData: validateAuthData
};