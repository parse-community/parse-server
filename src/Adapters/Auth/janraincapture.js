// Helper functions for accessing the Janrain Capture API.
var Parse = require('parse/node').Parse;
var querystring = require('querystring');
const httpsRequest = require('./httpsRequest');

// Returns a promise that fulfills iff this user id is valid.
function validateAuthData(authData, options) {
  return request(options.janrain_capture_host, authData.access_token).then(data => {
    //successful response will have a "stat" (status) of 'ok' and a result node that stores the uuid, because that's all we asked for
    //see: https://docs.janrain.com/api/registration/entity/#entity
    if (data && data.stat == 'ok' && data.result == authData.id) {
      return;
    }
    throw new Parse.Error(
      Parse.Error.OBJECT_NOT_FOUND,
      'Janrain capture auth is invalid for this user.'
    );
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
    access_token: access_token,
    attribute_name: 'uuid', // we only need to pull the uuid for this access token to make sure it matches
  });

  return httpsRequest.get({ host: host, path: '/entity?' + query_string_data });
}

module.exports = {
  validateAppId: validateAppId,
  validateAuthData: validateAuthData,
};
