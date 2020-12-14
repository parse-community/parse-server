/*
 * This auth adapter is based on the OAuth 2.0 Token Introspection specification.
 * See RFC 7662 for details (https://tools.ietf.org/html/rfc7662).
 * It's purpose is to validate OAuth2 access tokens using the OAuth2 provider's
 * token introspection endpoint (if implemented by the provider).
 *
 * The adapter accepts the following config parameters:
 *
 * 1. "tokenIntrospectionEndpointUrl" (string, required)
 *      The URL of the token introspection endpoint of the OAuth2 provider that
 *      issued the access token to the client that is to be validated.
 *
 * 2. "useridField" (string, optional)
 *      The name of the field in the token introspection response that contains
 *      the userid. If specified, it will be used to verify the value of the "id"
 *      field in the "authData" JSON that is coming from the client.
 *      This can be the "aud" (i.e. audience), the "sub" (i.e. subject) or the
 *      "username" field in the introspection response, but since only the
 *      "active" field is required and all other reponse fields are optional
 *      in the RFC, it has to be optional in this adapter as well.
 *      Default: - (undefined)
 *
 * 3. "appidField" (string, optional)
 *      The name of the field in the token introspection response that contains
 *      the appId of the client. If specified, it will be used to verify it's
 *      value against the set of appIds in the adapter config. The concept of
 *      appIds comes from the two major social login providers
 *      (Google and Facebook). They have not yet implemented the token
 *      introspection endpoint, but the concept can be valid for any OAuth2
 *      provider.
 *      Default: - (undefined)
 *
 * 4. "appIds" (array of strings, required if appidField is defined)
 *      A set of appIds that are used to restrict accepted access tokens based
 *      on a specific field's value in the token introspection response.
 *      Default: - (undefined)
 *
 * 5. "authorizationHeader" (string, optional)
 *      The value of the "Authorization" HTTP header in requests sent to the
 *      introspection endpoint. It must contain the raw value.
 *      Thus if HTTP Basic authorization is to be used, it must contain the
 *      "Basic" string, followed by whitespace, then by the base64 encoded
 *      version of the concatenated <username> + ":" + <password> string.
 *      Eg. "Basic dXNlcm5hbWU6cGFzc3dvcmQ="
 *
 * The adapter expects requests with the following authData JSON:
 *
 * {
 *   "someadapter": {
 *     "id": "user's OAuth2 provider-specific id as a string",
 *     "access_token": "an authorized OAuth2 access token for the user",
 *   }
 * }
 */

const Parse = require('parse/node').Parse;
const url = require('url');
const querystring = require('querystring');
const httpsRequest = require('./httpsRequest');

const INVALID_ACCESS = 'OAuth2 access token is invalid for this user.';
const INVALID_ACCESS_APPID =
  "OAuth2: the access_token's appID is empty or is not in the list of permitted appIDs in the auth configuration.";
const MISSING_APPIDS =
  'OAuth2 configuration is missing the client app IDs ("appIds" config parameter).';
const MISSING_URL = 'OAuth2 token introspection endpoint URL is missing from configuration!';

// Returns a promise that fulfills if this user id is valid.
function validateAuthData(authData, options) {
  return requestTokenInfo(options, authData.access_token).then(response => {
    if (
      !response ||
      !response.active ||
      (options.useridField && authData.id !== response[options.useridField])
    ) {
      throw new Parse.Error(Parse.Error.OBJECT_NOT_FOUND, INVALID_ACCESS);
    }
  });
}

function validateAppId(appIds, authData, options) {
  if (!options || !options.appidField) {
    return Promise.resolve();
  }
  if (!appIds || appIds.length === 0) {
    throw new Parse.Error(Parse.Error.OBJECT_NOT_FOUND, MISSING_APPIDS);
  }
  return requestTokenInfo(options, authData.access_token).then(response => {
    if (!response || !response.active) {
      throw new Parse.Error(Parse.Error.OBJECT_NOT_FOUND, INVALID_ACCESS);
    }
    const appidField = options.appidField;
    if (!response[appidField]) {
      throw new Parse.Error(Parse.Error.OBJECT_NOT_FOUND, INVALID_ACCESS_APPID);
    }
    const responseValue = response[appidField];
    if (!Array.isArray(responseValue) && appIds.includes(responseValue)) {
      return;
    } else if (
      Array.isArray(responseValue) &&
      responseValue.some(appId => appIds.includes(appId))
    ) {
      return;
    } else {
      throw new Parse.Error(Parse.Error.OBJECT_NOT_FOUND, INVALID_ACCESS_APPID);
    }
  });
}

// A promise wrapper for requests to the OAuth2 token introspection endpoint.
function requestTokenInfo(options, access_token) {
  if (!options || !options.tokenIntrospectionEndpointUrl) {
    throw new Parse.Error(Parse.Error.OBJECT_NOT_FOUND, MISSING_URL);
  }
  const parsedUrl = url.parse(options.tokenIntrospectionEndpointUrl);
  const postData = querystring.stringify({
    token: access_token,
  });
  const headers = {
    'Content-Type': 'application/x-www-form-urlencoded',
    'Content-Length': Buffer.byteLength(postData),
  };
  if (options.authorizationHeader) {
    headers['Authorization'] = options.authorizationHeader;
  }
  const postOptions = {
    hostname: parsedUrl.hostname,
    path: parsedUrl.pathname,
    method: 'POST',
    headers: headers,
  };
  return httpsRequest.request(postOptions, postData);
}

module.exports = {
  validateAppId: validateAppId,
  validateAuthData: validateAuthData,
};
