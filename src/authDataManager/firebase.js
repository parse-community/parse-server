// Firebase authentication provider
var https = require('https');
var jwt = require("jsonwebtoken");

// Returns a promise that fulfills iff this user id is valid.
function validateAuthData(authData) {
  return request().then(function (response) {
    var publicKey = response[Object.keys(response)[0]]
    try {
      var decodedToken = jwt.verify(authData.access_token, publicKey);
      console.log(authData)

      if (decodedToken == null || decodedToken.id == null || decodedToken.id == "") {
        throw new Parse.Error(Parse.Error.OBJECT_NOT_FOUND, 'Google auth is invalid for this user.');
      }
      resolve(decodedToken);
    } catch (error) {
      throw new Parse.Error(Parse.Error.OBJECT_NOT_FOUND, "Token validation error");
    }

    throw new Parse.Error(Parse.Error.OBJECT_NOT_FOUND, 'Google auth is invalid for this user.');

  });
}

// A promisey wrapper for api requests
function request() {
  return new Promise(function (resolve, reject) {
    var googlePublicKeyUrl = "https://www.googleapis.com/robot/v1/metadata/x509/securetoken@system.gserviceaccount.com";
    https.get(googlePublicKeyUrl, function (res) {
      var data = '';
      res.on('data', function (chunk) {
        data += chunk;
      });
      res.on('end', function () {
        data = JSON.parse(data);
        resolve(data);
      });
    }).on('error', function () {
      reject('Failed to validate this access token with Google.');
    });
  });
}

// Returns a promise that fulfills if this app id is valid.
function validateAppId() {
  return Promise.resolve();
}

module.exports = {
  validateAppId,
  validateAuthData
};