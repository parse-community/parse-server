/**
 * Parse Server authentication adapter for Janrain Capture API.
 *
 * @class JanrainCapture
 * @param {Object} options - The adapter configuration options.
 * @param {String} options.janrain_capture_host - The Janrain Capture API host.
 *
 * @param {Object} authData - The authentication data provided by the client.
 * @param {String} authData.id - The Janrain Capture user ID.
 * @param {String} authData.access_token - The Janrain Capture access token.
 *
 * @description
 * ## Parse Server Configuration
 * To configure Parse Server for Janrain Capture authentication, use the following structure:
 * ```json
 * {
 *   "auth": {
 *     "janrain": {
 *       "janrain_capture_host": "your-janrain-capture-host"
 *     }
 *   }
 * }
 * ```
 *
 * The adapter requires the following `authData` fields:
 * - `id`: The Janrain Capture user ID.
 * - `access_token`: An authorized Janrain Capture access token for the user.
 *
 * ## Auth Payload Example
 * ```json
 * {
 *   "janrain": {
 *     "id": "user's Janrain Capture ID as a string",
 *     "access_token": "an authorized Janrain Capture access token for the user"
 *   }
 * }
 * ```
 *
 * ## Notes
 * Parse Server validates the provided `authData` using the Janrain Capture API.
 *
 * @see {@link https://docs.janrain.com/api/registration/entity/#entity Janrain Capture API Documentation}
 */


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
