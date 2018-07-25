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
 * 4. "appIds" (array of strings, optional)
 *      A set of appIds that are used to restrict accepted access tokens based
 *      on a specific field's value in the token introspection response.
 *      Default: - (undefined)
 *
 * 5. "authorizationHeader" (string, optional)
 *      The value of the "Authorization" HTTP header in requests sent to the
 *      introspection endpoint.
 *      Eg. "Basic dXNlcm5hbWU6cGFzc3dvcmQ="
 *
 * 6. "debug" (boolean, optional)
 *      Enables extensive logging using the "verbose" level.
 *
 * The adapter expects requests with the following authData JSON:
 *
 * {
 *   "oauth2": {
 *     "id": "user's OAuth2 provider-specific id as a string",
 *     "access_token": "an authorized OAuth2 access token for the user",
 *   }
 * }
 */

import logger from '../../logger';
var Https = require('https');
var Parse = require('parse/node').Parse;
var Url = require('url');
var Querystring = require('querystring');

// Returns a promise that fulfills if this user id is valid.
function validateAuthData(authData, options) {
  var loggingEnabled = _isLoggingEnabled(options);
  if (loggingEnabled) {
    logger.verbose('oauth2.validateAuthData(), authData = %s, options = %s',  _objectToString(authData), _objectToString(options));
  }
  return requestJson(options, authData.access_token, loggingEnabled).then((response) => {
    if (response && response.active && (!options || !options.hasOwnProperty('useridField') || !options.useridField || authData.id == response[options.useridField])) {
      return Promise.resolve();
    }
    return Promise.reject(new Parse.Error(
      Parse.Error.OBJECT_NOT_FOUND,
      'OAuth2 access token is invalid for this user.'));
  });
}

function validateAppId(appIds, authData, options) {
  var loggingEnabled = _isLoggingEnabled(options);
  if (loggingEnabled) {
    logger.verbose('oauth2.validateAppId(): appIds = %s, authData = %s, options = %s', _objectToString(appIds), _objectToString(authData), _objectToString(options));
  }
  if (options && options.hasOwnProperty('appidField') && options.appidField) {
    if (!appIds.length) {
      return Promise.reject(new Parse.Error(Parse.Error.OBJECT_NOT_FOUND, 'OAuth2 configuration is missing the client app IDs ("appIds" config parameter).'));
    }
    return requestJson(options, authData.access_token, loggingEnabled).then((response) => {
      var appidField = options.appidField;
      if (response && response[appidField]) {
        var responseValue = response[appidField];
        if (Array.isArray(responseValue)) {
          for (var idx = responseValue.length - 1; idx >= 0; idx--) {
            if (appIds.indexOf(responseValue[idx]) != -1) {
              return Promise.resolve();
            }
          }
        } else {
          if (appIds.indexOf(responseValue) != -1) {
            return Promise.resolve();
          }
        }
      }
      return Promise.reject(new Parse.Error(
        Parse.Error.OBJECT_NOT_FOUND,
        'OAuth2: the access_token\'s appID is empty or is not in the list of permitted appIDs in the auth configuration.'));
    });
  } else {
    return Promise.resolve();
  }
}

function _isLoggingEnabled(options) {
  return options && options.debug;
}

function _objectToString(object) {
  return JSON.stringify(object, null, 2);
}

// A promise wrapper for api requests
function requestJson(options, access_token, loggingEnabled) {
  if (loggingEnabled) {
    logger.verbose('oauth2.requestJson(): options = %s', _objectToString(options));
  }
  return new Promise(function(resolve, reject) {
    if (!options || !options.tokenIntrospectionEndpointUrl) {
      reject(new Parse.Error(Parse.Error.OBJECT_NOT_FOUND, 'OAuth2 token introspection endpoint URL is missing from configuration!'));
    }
    var url = options.tokenIntrospectionEndpointUrl;
    if (loggingEnabled) {
      logger.verbose('oauth2.requestJson(): url = %s', url);
    }
    var parsedUrl = Url.parse(url);
    var postData = Querystring.stringify({
      'token': access_token
    });
    var headers = {
      'Content-Type': 'application/x-www-form-urlencoded',
      'Content-Length': Buffer.byteLength(postData)
    }
    // Note: the "authorizationHeader" adapter config must contain the raw value.
    //   Thus if HTTP Basic authorization is to be used, it must contain the
    //   base64 encoded version of the concatenated <username> + ":" + <password> string.
    if (options.authorizationHeader) {
      headers['Authorization'] = options.authorizationHeader;
    }
    if (loggingEnabled) {
      logger.verbose('oauth2.requestJson(): req headers = %s, req data = %s', _objectToString(headers), _objectToString(postData));
    }
    var postOptions = {
      hostname: parsedUrl.hostname,
      path: parsedUrl.pathname,
      method: 'POST',
      headers: headers
    }
    var postRequest = Https.request(postOptions, function(res) {
      var data = '';
      res.setEncoding('utf8');
      res.on('data', function(chunk) {
        data += chunk;
      });
      res.on('end', function() {
        try {
          data = JSON.parse(data);
        } catch (e) {
          logger.error('oauth2.requestJson(): failed to parse response data from %s as JSON', url);
          if (loggingEnabled) {
            logger.verbose('oauth2.requestJson(): req headers = %s, req data = %s, resp data = %s', _objectToString(headers), _objectToString(postData), _objectToString(data));
          }
          return reject(e);
        }
        if (loggingEnabled) {
          logger.verbose('oauth2.requestJson(): JSON response from %s = %s', url, _objectToString(data));
        }
        return resolve(data);
      });
    }).on('error', function() {
      if (loggingEnabled) {
        logger.error('oauth2.requestJson(): error while trying to fetch %s', url);
      }
      return reject('Failed to validate access token %s with OAuth2 provider (url = %s, headers = %s)', access_token, url, _objectToString(headers));
    });

    postRequest.write(postData);
    postRequest.end();
  });
}

module.exports = {
  validateAppId: validateAppId,
  validateAuthData: validateAuthData
};
