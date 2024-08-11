/**
 * Parse Server authentication adapter for Line.
 *
 * @class Line
 * @param {Object} options The adapter options.
 * @param {Boolean} options.enableInsecureAuth Enable insecure authentication.
 * @param {String} options.clientId Your Line App client ID.
 * @param {String} options.clientSecret Your Line App client Secret.
 *
 *
 * The adapter expects the following auth payload from the client:
 *
 * @param {Object} payload The auth payload.
 * @param {String} payload.id The user id obtained from Line.
 * @param {String} payload.access_token The access token obtained from Line.
 * @param {String} payload.client_id Client ID from Line if config is not set.
 * @param {String} payload.client_secret Client Secret from Line if config is not set.
 * @param {String} payload.code Code obtained from Line for exchanging access token.
 * @param {String} payload.redirect_uri Redirect URI registered in Line App.
 *
 * Parse Server then stores the required auth data in the database.
 *
 * With enableInsecureAuth flag:
 * It directly validates the user id and access token sent from the client.
 *
 * Without enableInsecureAuth flag:
 * It requires 'code' and 'redirect_uri' sent from client to exchange for access token.
 *
 * * Example auth data for Line with insecure flag:
 *
 * @param {Object} payload The auth payload.
 * @param {String} payload.id "1234567".
 * @param {String} payload.access_token "xxxxxxxxx"
 *
 * {
 *  "line": {
 *  "id": "1234567",
 * "access_token": "xxxxxxxxx"
 * }
 * }
 *
 * Example auth data for Line without insecure flag:
 *
 * @param {Object} payload The auth payload.
 * @param {String} payload.code "xxxxxxxxx".
 * @param {String} payload.redirect_uri "https://your-redirect-uri.com/callback".
 *
 * {
 * "line": {
 * "code": "xxxxxxxxx",
 * "redirect_uri": "https://your-redirect-uri.com/callback"
 * }
 * }
 *
 * Parse Sever then stores the required auth data in the database.
 * For more information on Line authentication, see https://developers.line.biz/en/docs/line-login/integrate-line-login/
 */

import logger from '../../logger';
import Config from '../../Config';

// Helper functions for accessing the line API.
var Parse = require('parse/node').Parse;
const httpsRequest = require('./httpsRequest');

// Returns a promise that fulfills if this user id is valid.
async function validateAuthData(authData) {
  const config = Config.get(Parse.applicationId);
  const lineConfig = config.auth.line;
  if (lineConfig && lineConfig.enableInsecureAuth && config.enableInsecureAuthAdapters) {
    // Insecure validation
    if (!authData.access_token) {
      throw new Parse.Error(
        Parse.Error.OBJECT_NOT_FOUND,
        'Line insecure auth requires access_token to be sent.'
      );
    }
    return request('profile', authData.access_token).then(response => {
      if (response && response.userId && response.userId === authData.id) {
        return;
      }
      throw new Parse.Error(Parse.Error.OBJECT_NOT_FOUND, 'Line auth is invalid for this user.');
    });
  }
}

// Returns a promise that fulfills iff this app id is valid.
function validateAppId() {
  return Promise.resolve();
}

async function beforeValidationAuthData(authData, { clientId, clientSecret } = {}) {
  const config = Config.get(Parse.applicationId);
  const lineConfig = config.auth.line;
  if (authData && authData.access_token && !lineConfig) {
    const userData = await request('profile', authData.access_token);
    if (userData && userData.userId) {
      authData.id = userData.userId;
      return;
    }
    throw new Parse.Error(Parse.Error.OBJECT_NOT_FOUND, 'Line auth is invalid for this user.');
  }
  if (lineConfig && lineConfig.enableInsecureAuth) {
    if (!clientId && !clientSecret) {
      clientId = authData.client_id;
      clientSecret = authData.client_secret;
    }
  }
  if (
    lineConfig &&
    lineConfig.enableInsecureAuth &&
    config.enableInsecureAuthAdapters &&
    !authData.code
  )
    return;
  //For default line config {}
  if (!lineConfig && authData.clientId && authData.clientSecret) {
    clientId = authData.clientId;
    clientSecret = authData.clientSecret;
  }
  // Secure validation
  if (authData.access_token || authData.id) {
    logger.warn(
      'Warning: Line auth does not require access_token or id to be sent anymore and it indicates a potential security vulnerability'
    );
  }

  if (!clientId || !clientSecret) {
    throw new Parse.Error(
      Parse.Error.OBJECT_NOT_FOUND,
      'Configuration error, make sure clientId and clientSecret are properly set.'
    );
  }

  if (authData.access_token && authData.id) {
    return;
  }

  if (!authData.code || !authData.redirect_uri) {
    throw new Parse.Error(
      Parse.Error.OBJECT_NOT_FOUND,
      'Line auth configuration missing code and/or redirect_uri'
    );
  }

  const option = {
    method: 'POST',
    uri: 'https://api.line.me/oauth2/v2.1/token',
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
  const accessTokenData = await httpsRequest.getAccessToken(option);

  if (accessTokenData.error) {
    throw new Parse.Error(
      Parse.Error.OBJECT_NOT_FOUND,
      'Failed to validate this access token with Line.'
    );
  }
  authData.access_token = accessTokenData.access_token;

  const options = {
    host: 'api.line.me',
    path: '/v2/profile',
    method: 'GET',
    headers: {
      Authorization: 'Bearer ' + authData.access_token,
    },
  };
  const profileResponse = await httpsRequest.get(options);
  authData.id = profileResponse.userId;
  return;
}

// A promisey wrapper for api requests
function request(path, access_token) {
  var options = {
    host: 'api.line.me',
    path: '/v2/' + path,
    method: 'GET',
    headers: {
      Authorization: 'Bearer ' + access_token,
    },
  };
  return httpsRequest.get(options);
}

module.exports = {
  validateAppId: validateAppId,
  validateAuthData: validateAuthData,
  beforeValidationAuthData: beforeValidationAuthData,
};
