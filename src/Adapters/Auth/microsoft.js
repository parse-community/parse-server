/**
 * Parse Server authentication adapter for microsoft.
 *
 * @Class microsoft
 * @param {Object} options The adapter options.
 * @param {Boolean} options.enableInsecureAuth Enable insecure authentication.
 * @param {String} options.clientId Your microsoft App client ID.
 * @param {String} options.clientSecret Your microsoft App client Secret.
 *
 * The adapter expects the following auth payload from the client:
 *
 * @param {Object} payload The auth payload.
 * @param {String} payload.id The user id obtained from microsoft.
 * @param {String} payload.access_token The access token obtained from microsoft.
 * @param {String} payload.client_id Client ID from microsoft if config is not set.
 * @param {String} payload.client_secret Client Secret from microsoft if config is not set.
 * @param {String} payload.code Code obtained from microsoft for exchanging access token.
 * @param {String} payload.redirect_uri Redirect URI registered in microsoft App.
 *
 * Parse Server then stores the required auth data in the database.
 *
 * With enableInsecureAuth flag:
 * It directly validates the user id and access token sent from the client.
 *
 * Without enableInsecureAuth flag:
 * It requires 'code' and 'redirect_uri' sent from client to exchange for access token.
 *
 * * Example auth data for microsoft with insecure flag:
 *
 * @param {Object} payload The auth payload.
 * @param {String} payload.id "7654321".
 * @param {String} payload.access_token "AQXNnd2hIT6z9bHFzZz2Kp1ghiMz_RtyuvwXYZ123abc".
 *
 * {
 *  "microsoft": {
 *   "id": "7654321",
 *  "access_token": "AQXNnd2hIT6z9bHFzZz2Kp1ghiMz_RtyuvwXYZ123abc"
 * }
 * }
 *
 * Example auth data for microsoft without insecure flag:
 *
 * @param {Object} payload The auth payload.
 * @param {String} payload.code "lmn789opq012rst345uvw".
 * @param {String} payload.redirect_uri "https://your-redirect-uri.com/callback".
 *
 * {
 * "microsoft": {
 * "code": "lmn789opq012rst345uvw",
 * "redirect_uri": "https://your-redirect-uri.com/callback"
 * }
 * }
 * Parse Sever then stores the required auth data in the database.
 * For more information on microsoft authentication, see https://docs.microsoft.com/en-us/graph/auth/auth-concepts
 */

import logger from '../../logger';
import Config from '../../Config';

// Helper functions for accessing the microsoft graph API.
var Parse = require('parse/node').Parse;
const httpsRequest = require('./httpsRequest');

// Returns a promise that fulfills if this user mail is valid.
async function validateAuthData(authData) {
  const config = Config.get(Parse.applicationId);
  const microsoftConfig = config.auth.microsoft;
  if (microsoftConfig && microsoftConfig.enableInsecureAuth && config.enableInsecureAuthAdapters) {
    {
      // Insecure validation
      if (!authData.access_token) {
        throw new Parse.Error(
          Parse.Error.OBJECT_NOT_FOUND,
          'Microsoft Graph insecure auth requires access_token to be sent.'
        );
      }
      return request('me', authData.access_token).then(data => {
        if (data && data.id == authData.id) {
          return;
        }
        throw new Parse.Error(
          Parse.Error.OBJECT_NOT_FOUND,
          'Microsoft Graph auth is invalid for this user.'
        );
      });
    }
  }
  return request('me', authData.access_token).then(response => {
    if (response && response.id && response.id == authData.id) {
      return;
    }
    throw new Parse.Error(
      Parse.Error.OBJECT_NOT_FOUND,
      'Microsoft Graph auth is invalid for this user.'
    );
  });
}

async function beforeValidationAuthData(authData, { clientId, clientSecret } = {}) {
  const config = Config.get(Parse.applicationId);
  const microsoftConfig = config.auth.microsoft;

  if (authData && authData.access_token && !microsoftConfig) {
    const userData = await request('me', authData.access_token);
    if (userData && userData.id) {
      authData.id = userData.id;
      return;
    }
    throw new Parse.Error(
      Parse.Error.OBJECT_NOT_FOUND,
      'Microsoft Graph auth is invalid for this user.'
    );
  }

  if (
    microsoftConfig &&
    microsoftConfig.enableInsecureAuth &&
    config.enableInsecureAuthAdapters &&
    !authData.code
  )
    return;

  // Secure validation
  if (authData.access_token || authData.id) {
    logger.warn(
      'Warning: Microsoft auth does not require access_token or id to be sent anymore and it indicates a potential security vulnerability '
    );
  }

  if (!clientId && !clientSecret) {
    clientId = authData.client_id;
    clientSecret = authData.client_secret;
  }

  if (!clientId || !clientSecret) {
    throw new Parse.Error(
      Parse.Error.OBJECT_NOT_FOUND,
      'Microsoft auth configuration missing clientId and/or clientSecret'
    );
  }
  if (!authData.code || !authData.redirect_uri) {
    throw new Parse.Error(
      Parse.Error.OBJECT_NOT_FOUND,
      'Microsoft auth configuration authData.code and/or authData.redirect_uri.'
    );
  }
  var options = {
    method: 'POST',
    uri: 'https://login.microsoftonline.com/common/oauth2/v2.0/token',
    headers: {
      'Content-Type': 'application/x-www-form-urlencoded',
    },
    form: {
      client_id: clientId,
      client_secret: clientSecret,
      grant_type: 'authorization_code',
      redirect_uri: authData.redirect_uri,
      code: authData.code,
    },
  };
  const accessTokenData = await httpsRequest.getAccessToken(options);
  if (accessTokenData && accessTokenData.access_token) {
    const accessToken = accessTokenData.access_token;
    const userData = await request('me', accessToken);
    if (userData && userData.id) {
      authData.id = userData.id;
      authData.access_token = accessToken;
      return;
    }
  }
  throw new Parse.Error(
    Parse.Error.OBJECT_NOT_FOUND,
    `Microsoft Graph auth is invalid for this user.` + ` ${accessTokenData?.error_description}`
  );
}
// Returns a promise that fulfills if this app id is valid.
function validateAppId() {
  return Promise.resolve();
}

// A promisey wrapper for api requests
function request(path, access_token) {
  return httpsRequest.get({
    host: 'graph.microsoft.com',
    path: '/v1.0/' + path,
    headers: {
      Authorization: 'Bearer ' + access_token,
    },
  });
}

module.exports = {
  validateAppId: validateAppId,
  validateAuthData: validateAuthData,
  beforeValidationAuthData: beforeValidationAuthData,
};
