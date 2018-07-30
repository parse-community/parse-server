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
const Https = require('https');
const Parse = require('parse/node').Parse;
const Path = require('path');
const Url = require('url');
const Querystring = require('querystring');

const scriptName = Path.basename(__filename, '.js');

// Returns a promise that fulfills if this user id is valid.
function validateAuthData(authData, options) {
  const _logger = _getLogger(validateAuthData.name);
  const loggingEnabled = _isLoggingEnabled(options);
  if (loggingEnabled) {
    _logger.verbose('authData = %s, options = %s',  _objectToString(authData), _objectToString(options));
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
  const _logger = _getLogger(validateAppId.name);
  const loggingEnabled = _isLoggingEnabled(options);
  if (loggingEnabled) {
    _logger.verbose('appIds = %s, authData = %s, options = %s', _objectToString(appIds), _objectToString(authData), _objectToString(options));
  }
  if (options && options.hasOwnProperty('appidField') && options.appidField) {
    if (!appIds.length) {
      return Promise.reject(new Parse.Error(Parse.Error.OBJECT_NOT_FOUND, 'OAuth2 configuration is missing the client app IDs ("appIds" config parameter).'));
    }
    return requestJson(options, authData.access_token, loggingEnabled).then((response) => {
      const appidField = options.appidField;
      if (response && response[appidField]) {
        const responseValue = response[appidField];
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

function _getLogger(functionName) {
  const prefix = scriptName + '.' + functionName + '(): ';
  var getFormat = function(arg) {
    return (new Date()).toISOString() + ' ' + prefix + arg;
  }
  return {
    info: function() {
      arguments[0] = getFormat(arguments[0]);
      return logger.info.apply(logger, arguments);
    },
    error: function () {
      arguments[0] = getFormat(arguments[0]);
      return logger.error.apply(logger, arguments);
    },
    warn: function() {
      arguments[0] = getFormat(arguments[0]);
      return logger.warn.apply(logger, arguments);
    },
    verbose: function() {
      arguments[0] = getFormat(arguments[0]);
      return logger.verbose.apply(logger, arguments);
    },
    debug: function() {
      arguments[0] = getFormat(arguments[0]);
      return logger.debug.apply(logger, arguments);
    },
    silly: function() {
      arguments[0] = getFormat(arguments[0]);
      return logger.silly.apply(logger, arguments);
    }
  };
}

// A promise wrapper for api requests
function requestJson(options, access_token, loggingEnabled) {
  const _logger = _getLogger(requestJson.name);
  if (loggingEnabled) {
    _logger.verbose('options = %s', _objectToString(options));
  }
  return new Promise(function(resolve, reject) {
    if (!options || !options.tokenIntrospectionEndpointUrl) {
      reject(new Parse.Error(Parse.Error.OBJECT_NOT_FOUND, 'OAuth2 token introspection endpoint URL is missing from configuration!'));
    }
    const url = options.tokenIntrospectionEndpointUrl;
    if (loggingEnabled) {
      _logger.verbose('url = %s', url);
    }
    const parsedUrl = Url.parse(url);
    const postData = Querystring.stringify({
      'token': access_token
    });
    const headers = {
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
      _logger.verbose('req headers = %s, req data = %s', _objectToString(headers), _objectToString(postData));
    }
    const postOptions = {
      hostname: parsedUrl.hostname,
      path: parsedUrl.pathname,
      method: 'POST',
      headers: headers
    }
    const postRequest = Https.request(postOptions, function(res) {
      let data = '';
      res.setEncoding('utf8');
      res.on('data', function(chunk) {
        data += chunk;
      });
      res.on('end', function() {
        try {
          data = JSON.parse(data);
        } catch (e) {
          _logger.error('failed to parse response data from %s as JSON', url);
          if (loggingEnabled) {
            _logger.verbose('req headers = %s, req data = %s, resp data = %s', _objectToString(headers), _objectToString(postData), _objectToString(data));
          }
          return reject(e);
        }
        if (loggingEnabled) {
          _logger.verbose('JSON response from %s = %s', url, _objectToString(data));
        }
        return resolve(data);
      });
    }).on('error', function() {
      if (loggingEnabled) {
        _logger.error('error while trying to fetch %s', url);
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
