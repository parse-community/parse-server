/**
 * Parse Server authentication adapter for LinkedIn.
 *
 * @Class LinkedIn
 * @param {Object} options The adapter options.
 * @param {Boolean} options.enableInsecureAuth Enable insecure authentication.
 * @param {String} options.clientId Your LinkedIn App client ID.
 * @param {String} options.clientSecret Your LinkedIn App client Secret.
 *
 * The adapter expects the following auth payload from the client:
 *
 * @param {Object} payload The auth payload.
 * @param {String} payload.id The user id obtained from LinkedIn.
 * @param {String} payload.access_token The access token obtained from LinkedIn.
 * @param {String} payload.is_mobile_sdk Whether the request is coming from mobile SDK.
 * @param {String} payload.client_id Client ID from LinkedIn if config is not set.
 * @param {String} payload.client_secret Client Secret from LinkedIn if config is not set.
 * @param {String} payload.code Code obtained from LinkedIn for exchanging access token.
 * @param {String} payload.redirect_uri Redirect URI registered in LinkedIn App.
 *
 * Parse Server then stores the required auth data in the database.
 *
 * With enableInsecureAuth flag:
 * It directly validates the user id and access token sent from the client.
 *
 * Without enableInsecureAuth flag:
 * It requires 'code' and 'redirect_uri' sent from client to exchange for access token.
 *
 * * Example auth data for LinkedIn with insecure flag:
 *
 * @param {Object} payload The auth payload.
 * @param {String} payload.id "7654321".
 * @param {String} payload.access_token "AQXNnd2hIT6z9bHFzZz2Kp1ghiMz_RtyuvwXYZ123abc".
 * @param {Boolean} payload.is_mobile_sdk true | false.
 *
 * {
 *   "linkedin": {
 *     "id": "7654321",
 *     "access_token": "AQXNnd2hIT6z9bHFzZz2Kp1ghiMz_RtyuvwXYZ123abc",
 *     "is_mobile_sdk": true,
 *   }
 * }
 *
 * Example auth data for LinkedIn without insecure flag:
 *
 * @param {Object} payload The auth payload.
 * @param {String} payload.code "lmn789opq012rst345uvw".
 * @param {String} payload.redirect_uri "https://your-redirect-uri.com/callback".
 *
 * {
 *   "linkedin": {
 *     "code": "lmn789opq012rst345uvw",
 *     "redirect_uri": "https://your-redirect-uri.com/callback"
 *   }
 * }
 * Parse Sever then stores the required auth data in the database.
 * For more information on LinkedIn authentication, see https://learn.microsoft.com/en-us/linkedin/shared/authentication/authentication
 */

import logger from '../../logger';
import Config from '../../Config';

// Helper functions for accessing the linkedin API.
var Parse = require('parse/node').Parse;
const httpsRequest = require('./httpsRequest');
// Returns a promise that fulfills iff this user id is valid.
async function validateAuthData(authData) {
  const config = Config.get(Parse.applicationId);
  const linkedinConfig = config.auth.linkedin;
  if (linkedinConfig && linkedinConfig.enableInsecureAuth && config.enableInsecureAuthAdapters) {
    // Insecure validation
    if (!authData.access_token) {
      throw new Parse.Error(
        Parse.Error.OBJECT_NOT_FOUND,
        'Linkedin insecure auth requires access_token to be sent.'
      );
    }
    const data = await request('me', authData.access_token, authData.is_mobile_sdk);
    if (data && data.id == authData.id) {
      return;
    }
    throw new Parse.Error(Parse.Error.OBJECT_NOT_FOUND, 'Linkedin auth is invalid for this user.');
  }
}
async function beforeValidationAuthData(authData, { clientId, clientSecret } = {}) {
  const config = Config.get(Parse.applicationId);
  const linkedinConfig = config.auth.linkedin;
  if (authData && authData.access_token && !linkedinConfig) {
    const userData = await request('me', authData.access_token, authData.is_mobile_sdk);
    if (userData && userData.id) {
      authData.id = userData.id;
      return;
    }
    throw new Parse.Error(Parse.Error.OBJECT_NOT_FOUND, 'Linkedin auth is invalid for this user.');
  }

  if (linkedinConfig && linkedinConfig.enableInsecureAuth) {
    if (!clientId && !clientSecret) {
      clientId = authData.client_id;
      clientSecret = authData.client_secret;
    }
  }
  if (
    linkedinConfig &&
    linkedinConfig.enableInsecureAuth &&
    config.enableInsecureAuthAdapters &&
    (!authData.code || !authData.redirect_uri)
  )
    return;

  // Secure validation
  if (authData.access_token || authData.id) {
    logger.warn(
      'Warning: LinkedIn auth does not require access_token or id to be sent anymore and it indicates a potential security vulnerability'
    );
  }
  if (!clientId || !clientSecret) {
    throw new Parse.Error(Parse.Error.OBJECT_NOT_FOUND, 'Linkedin auth is not configured.');
  }
  if (!authData.code) {
    throw new Parse.Error(Parse.Error.OBJECT_NOT_FOUND, 'Linkedin auth requires code to be sent.');
  }
  if (!authData.redirect_uri) {
    throw new Parse.Error(
      Parse.Error.OBJECT_NOT_FOUND,
      'Linkedin auth requires redirect_uri to be sent.'
    );
  }
  var options = {
    method: 'POST',
    url: 'https://www.linkedin.com/oauth/v2/accessToken',
    headers: {
      'Content-Type': 'application/x-www-form-urlencoded',
    },
    form: {
      grant_type: 'authorization_code',
      code: authData.code,
      redirect_uri: authData.redirect_uri,
      client_id: clientId,
      client_secret: clientSecret,
    },
  };
  const accessTokenData = await httpsRequest.getAccessToken(options);

  if (accessTokenData && accessTokenData.access_token) {
    const userData = await request('me', accessTokenData.access_token, authData.is_mobile_sdk);
    if (userData && userData.id) {
      authData.access_token = accessTokenData.access_token;
      authData.id = userData.id;
      return;
    }
  }
  throw new Parse.Error(
    Parse.Error.OBJECT_NOT_FOUND,
    'LinkedIn auth is invalid for this user.' +
      `${accessTokenData?.error_description ? accessTokenData.error_description : ''}`
  );
}

// Returns a promise that fulfills iff this app id is valid.
function validateAppId() {
  return Promise.resolve();
}

// A promisey wrapper for api requests
async function request(path, access_token, is_mobile_sdk) {
  var headers = {
    Authorization: 'Bearer ' + access_token,
    'x-li-format': 'json',
  };

  if (is_mobile_sdk) {
    headers['x-li-src'] = 'msdk';
  }
  return httpsRequest.get({
    host: 'api.linkedin.com',
    path: '/v2/' + path,
    headers: headers,
  });
}

module.exports = {
  validateAppId: validateAppId,
  validateAuthData: validateAuthData,
  beforeValidationAuthData: beforeValidationAuthData,
};
