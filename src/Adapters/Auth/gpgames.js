/**
 * Parse Server authentication adapter for Google Play Games Services.
 *
 * @Class GooglePlayGamesServices (gpgames)
 * @param {Object} options The adapter options.
 * @param {Boolean} options.enableInsecureAuth Enable insecure authentication.
 * @param {String} options.clientId Your Google Play Games Services App client ID.
 * @param {String} options.clientSecret Your Google Play Games Services App client Secret.
 *
 * The adapter expects the following auth payload from the client:
 *
 * @param {Object} payload The auth payload.
 * @param {String} payload.id The user id obtained from Google Play Games Services.
 * @param {String} payload.access_token The access token obtained from Google Play Games Services.
 * @param {String} payload.clientId Client ID from Google Play Games Services if config is not set.
 * @param {String} payload.clientSecret Client Secret from Google Play Games Services if config is not set.
 * @param {String} payload.code Code obtained from Google Play Games Services for exchanging access token.
 * @param {String} payload.redirect_uri Redirect URI registered in Google Play Games Services App.
 *
 * Parse Server then stores the required auth data in the database.
 *
 * With enableInsecureAuth flag:
 * It directly validates the user id and access token sent from the client.
 *
 * Without enableInsecureAuth flag:
 * It requires 'code' and 'redirect_uri' sent from client to exchange for access token.
 *
 * * Example auth data for Google Play Games Services with insecure flag:
 *
 * @param {Object} payload The auth payload.
 * @param {String} payload.id The id obtained from Google Play Games Services.
 * @param {String} payload.access_token The access token obtained from Google Play Games Services.
 *
 * {
 * "gpgames": {
 *  "id": "123456789",
 *  "access_token": "xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx"
 * }
 *
 * Example auth data for Google Play Games Services without insecure flag:
 *
 * @param {Object} payload The auth payload.
 * @param {String} payload.code The code obtained from Google Play Games Services.
 * @param {String} payload.redirect_uri The redirect_uri registered in Google Play Games Services App.
 *
 * {
 * "gpgames": {
 * "code": "xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx",
 * "redirect_uri": "https://your-redirect-uri.com/callback"
 * }
 *
 * Parse Sever then stores the required auth data in the database.
 * For more information on Google Play Games Services authentication, see https://developers.google.com/games/services/console/enabling
 */

import logger from '../../logger';
import Config from '../../Config';

const { Parse } = require('parse/node');
const httpsRequest = require('./httpsRequest');

// Returns a promise that fulfills if this user id is valid.
async function validateAuthData(authData) {
  const config = Config.get(Parse.applicationId);
  const gpgamesConfig = config.auth.gpgames;
  if (gpgamesConfig && gpgamesConfig.enableInsecureAuth && config.enableInsecureAuthAdapters) {
    // Insecure validation
    if (!authData.access_token) {
      throw new Parse.Error(
        Parse.Error.OBJECT_NOT_FOUND,
        'Google Play Games Services insecure auth requires access_token to be sent.'
      );
    }
    return request(authData).then(data => {
      if (data && data.playerId == authData.id) {
        return;
      }
      throw new Parse.Error(
        Parse.Error.OBJECT_NOT_FOUND,
        'Google Play Games Services auth is invalid for this user.'
      );
    });
  }
}

async function beforeValidationAuthData(authData, { clientId, clientSecret }) {
  const config = Config.get(Parse.applicationId);
  const gpgamesConfig = config.auth.gpgames;

  if (authData && authData.access_token && authData.id && !gpgamesConfig) {
    const userData = await request(authData);
    if (userData && userData.playerId) {
      authData.id = userData.playerId;
      return;
    }
    throw new Parse.Error(
      Parse.Error.OBJECT_NOT_FOUND,
      'Google Play Games Services - authData is invalid for this user.'
    );
  }

  if (
    gpgamesConfig &&
    gpgamesConfig.enableInsecureAuth &&
    config.enableInsecureAuthAdapters &&
    !authData.code
  )
    return;

  // Secure validation
  if (authData.access_token || authData.id) {
    logger.warn(
      'Warning: Google Play Games Services - authData does not require access_token or id to be sent anymore and it indicates a potential security vulnerability'
    );
  }

  if (!clientId && !clientSecret) {
    clientId = authData.clientId;
    clientSecret = authData.clientSecret;
  }

  if (!clientId || !clientSecret) {
    throw new Parse.Error(
      Parse.Error.OBJECT_NOT_FOUND,
      'Google Play Games Services auth configuration missing clientId and/or clientSecret'
    );
  }

  if (!authData.code || !authData.redirect_uri) {
    throw new Parse.Error(
      Parse.Error.OBJECT_NOT_FOUND,
      'Google Play Games Services auth configuration missing code and/or redirect_uri'
    );
  }

  const options = {
    method: 'POST',
    uri: 'https://oauth2.googleapis.com/token',
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
    const userData = await request(authData);
    if (userData && userData.playerId) {
      authData.access_token = accessTokenData.access_token;
      authData.id = userData.playerId;
      return;
    }
    throw new Parse.Error(
      Parse.Error.OBJECT_NOT_FOUND,
      'Google Play Games Services - authData is invalid for this user.'
    );
  }
}

// Returns a promise that fulfills if this app id is valid.
function validateAppId() {
  return Promise.resolve();
}

function request(authData) {
  return httpsRequest.get(
    `https://www.googleapis.com/games/v1/players/${authData.id}?access_token=${authData.access_token}`
  );
}

module.exports = {
  validateAppId,
  validateAuthData,
  beforeValidationAuthData,
};
