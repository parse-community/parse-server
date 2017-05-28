// Helper functions for accessing the github API.
var https = require('https');
var Parse = require('parse/node').Parse;

// Returns a promise that fulfills iff this user id is valid.
function validateAuthData(authData) {
  return request('user', authData.access_token)
    .then((data) => {
      if (data && data.id == authData.id) {
        return;
      }
      throw new Parse.Error(
        Parse.Error.OBJECT_NOT_FOUND,
        'Github auth is invalid for this user.');
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
      host: 'api.github.com',
      path: '/' + path,
      headers: {
        'Authorization': 'bearer ' + access_token,
        'User-Agent': 'parse-server'
      }
    }, function(res) {
      var data = '';
      res.on('data', function(chunk) {
        data += chunk;
      });
      res.on('end', function() {
        try {
          data = JSON.parse(data);
        } catch(e) {
          return reject(e);
        }
        resolve(data);
      });
    }).on('error', function() {
      reject('Failed to validate this access token with Github.');
    });
  });
}

module.exports = {
  validateAppId: validateAppId,
  validateAuthData: validateAuthData
};
