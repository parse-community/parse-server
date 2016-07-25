// Helper functions for accessing the linkedin API.
var https = require('https');
var Parse = require('parse/node').Parse;

// Returns a promise that fulfills iff this user id is valid.
function validateAuthData(authData) {
  return request('people/~:(id)', authData.access_token)
    .then((data) => {
      if (data && data.id == authData.id) {
        return;
      }
      throw new Parse.Error(
        Parse.Error.OBJECT_NOT_FOUND,
        'Meetup auth is invalid for this user.');
    });
}

// Returns a promise that fulfills iff this app id is valid.
function validateAppId() {
  return Promise.resolve();
}

// A promisey wrapper for api requests
function request(path, access_token) {
  return new Promise(function(resolve, reject) {
    https.get({
      host: 'api.linkedin.com',
      path: '/v1/' + path,
      headers: {
        'Authorization': 'Bearer '+access_token,
        'x-li-format': 'json'
      }
    }, function(res) {
      var data = '';
      res.on('data', function(chunk) {
        data += chunk;
      });
      res.on('end', function() {
        data = JSON.parse(data);
        resolve(data);
      });
    }).on('error', function(e) {
      reject('Failed to validate this access token with Linkedin.');
    });
  });
}

module.exports = {
  validateAppId: validateAppId,
  validateAuthData: validateAuthData
};
