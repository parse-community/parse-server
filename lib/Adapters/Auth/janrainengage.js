'use strict';

// Helper functions for accessing the Janrain Engage API.
var https = require('https');
var Parse = require('parse/node').Parse;
var querystring = require('querystring');

// Returns a promise that fulfills iff this user id is valid.
function validateAuthData(authData, options) {
  return request(options.api_key, authData.auth_token).then(function (data) {
    //successful response will have a "stat" (status) of 'ok' and a profile node with an identifier
    //see: http://developers.janrain.com/overview/social-login/identity-providers/user-profile-data/#normalized-user-profile-data
    if (data && data.stat == 'ok' && data.profile.identifier == authData.id) {
      return;
    }
    throw new Parse.Error(Parse.Error.OBJECT_NOT_FOUND, 'Janrain engage auth is invalid for this user.');
  });
}

// Returns a promise that fulfills iff this app id is valid.
function validateAppId() {
  //no-op
  return Promise.resolve();
}

// A promisey wrapper for api requests
function request(api_key, auth_token) {

  var post_data = querystring.stringify({
    'token': auth_token,
    'apiKey': api_key,
    'format': 'json'
  });

  var post_options = {
    host: 'rpxnow.com',
    path: '/api/v2/auth_info',
    method: 'POST',
    headers: {
      'Content-Type': 'application/x-www-form-urlencoded',
      'Content-Length': post_data.length
    }
  };

  return new Promise(function (resolve) {
    // Create the post request.
    var post_req = https.request(post_options, function (res) {
      var data = '';
      res.setEncoding('utf8');
      // Append data as we receive it from the Janrain engage server.
      res.on('data', function (d) {
        data += d;
      });
      // Once we have all the data, we can parse it and return the data we want.
      res.on('end', function () {
        resolve(JSON.parse(data));
      });
    });

    post_req.write(post_data);
    post_req.end();
  });
}

module.exports = {
  validateAppId: validateAppId,
  validateAuthData: validateAuthData
};