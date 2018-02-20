'use strict';

// Helper functions for accessing the Xiao Mi Graph API.
var https = require('https');
var Parse = require('parse/node').Parse;
var crypto = require('crypto');

const PRODUCTION_URL = "https://cn-api.unity.com";
const DEBUG_URL = " https://cn-api-debug.unity.com";

// Returns a promise that fulfills iff this user id is valid.
function validateAuthData(authData, authOptions) {
  var link = "";
  if(authData.mode == "Debug")
    link += DEBUG_URL;
  else if(authData.mode == "Release")
    link += PRODUCTION_URL;

  link += "/v1/login-attempts/verifyLogin?userLoginToken=" + authData.login_token + "&sign=" + getMD5(authData.login_token + "&" + authOptions.client_secret);

  return graphRequest(link).then(data => {
    if (data && data.success)
    {
      return;
    }
    throw new Parse.Error(Parse.Error.OBJECT_NOT_FOUND, 'Xiao Mi auth is invalid for this user.');
  });
}

// Returns a promise that fulfills iff this app id is valid.
function validateAppId() {
  return Promise.resolve();
}

// A promisey wrapper for FB graph requests.
function graphRequest(path) {
  return new Promise(function (resolve, reject) {
    https.get(path, function (res) {
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
      reject('Xiao Mi auth is invalid for this user.');
    });
  });
}

function getMD5(signData)
{
  return crypto.createHash('md5').update(signData).digest('hex');
}

module.exports = {
  validateAppId: validateAppId,
  validateAuthData: validateAuthData
};
