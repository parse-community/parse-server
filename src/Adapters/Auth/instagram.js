/**
 * Parse Server authentication adapter for Instagram.
 *
 * @Class instagram
 * @param {Object} options The adapter options.
 * @param {Boolean} options.enableInsecureAuth Enable insecure authentication.
 * @param {String} options.clientId Your Instagram App client ID.
 * @param {String} options.clientSecret Your Instagram App client Secret.
 *
 * The adapter expects the following auth payload from the client:
 *
 * @param {Object} payload The auth payload.
 * @param {String} payload.id The user id obtained from Instagram.
 * @param {String} payload.access_token The access token obtained from Instagram.
 * @param {String} payload.client_id Client ID from Instagram if config is not set.
 * @param {String} payload.client_secret Client Secret from Instagram if config is not set.
 * @param {String} payload.code Code obtained from Instagram for exchanging access token.
 * @param {String} payload.redirect_uri Redirect URI registered in Instagram App.
 *
 * Parse Server then stores the required auth data in the database.
 *
 * With enableInsecureAuth flag:
 * It directly validates the user id and access token sent from the client.
 *
 * Without enableInsecureAuth flag:
 * It requires 'code' and 'redirect_uri' sent from client to exchange for access token.
 *
 * * Example auth data for Instagram with insecure flag:
 *
 * @param {Object} payload The auth payload.
 * @param {String} payload.id "1234567".
 * @param {String} payload.access_token "AQXNnd2hIT6z9bHFzZz2Kp1ghiMz_RtyuvwXYZ123abc".
 *
 *
 * {
 * "instagram": {
 * "id": "1234567",
 * "access_token": "AQXNnd2hIT6z9bHFzZz2Kp1ghiMz_RtyuvwXYZ123abc"
 * }
 * }
 *
 * Example auth data for Instagram without insecure flag:
 *
 * @param {Object} payload The auth payload.
 * @param {String} payload.code "lmn789opq012rst345uvw".
 * @param {String} payload.redirect_uri "https://your-redirect-uri.com/callback".
 *
 *
 * {
 * "instagram": {
 * "code": "lmn789opq012rst345uvw",
 * "redirect_uri": "https://your-redirect-uri.com/callback"
 * }
 * }
 * Parse Sever then stores the required auth data in the database.
 * For more information on Instagram authentication, see https://developers.facebook.com/docs/instagram-basic-display-api/getting-started
 */

// Helper functions for accessing the instagram API.
var Parse = require('parse/node').Parse;
import Config from '../../Config';
import logger from '../../logger';

const httpsRequest = require('./httpsRequest');
const defaultURL = 'https://graph.instagram.com/';

// Returns a promise that fulfills if this user id is valid.
async function validateAuthData(authData) {
  const config = Config.get(Parse.applicationId);
  const instagramConfig = config.auth.instagram;
  if (instagramConfig && instagramConfig.enableInsecureAuth && config.enableInsecureAuthAdapters) {
    // Insecure validation
    if (!authData.access_token) {
      throw new Parse.Error(
        Parse.Error.OBJECT_NOT_FOUND,
        'Instagram insecure auth requires access_token to be sent.'
      );
    }
    const apiURL = authData.apiURL || defaultURL;
    return request(apiURL, authData.access_token).then(data => {
      if (data && data.id == authData.id) {
        return;
      }
      throw new Parse.Error(
        Parse.Error.OBJECT_NOT_FOUND,
        'Instagram auth is invalid for this user.'
      );
    });
  }
}
async function beforeValidationAuthData(authData, { clientId, clientSecret } = {}) {
  const config = Config.get(Parse.applicationId);
  const instagramConfig = config.auth.instagram;
  if (authData && authData.access_token && !instagramConfig) {
    const userData = await request(authData.apiURL || defaultURL, authData.access_token);
    if (userData && userData.id) {
      authData.id = userData.id;
      return;
    }
    throw new Parse.Error(Parse.Error.OBJECT_NOT_FOUND, 'Instagram auth is invalid for this user.');
  }

  if (
    instagramConfig &&
    instagramConfig.enableInsecureAuth &&
    config.enableInsecureAuthAdapters &&
    (!authData.code || !authData.redirect_uri)
  )
    return;

  // Secure validation
  if (authData.access_token || authData.id) {
    logger.warn(
      'Warning: Instagram auth does not require access_token or id to be sent anymore and it indicates a potential security vulnerability'
    );
  }

  if (!clientId && !clientSecret) {
    clientId = authData.client_id;
    clientSecret = authData.client_secret;
  }

  if (!clientId || !clientSecret) {
    throw new Parse.Error(
      Parse.Error.OBJECT_NOT_FOUND,
      'Instagram auth configuration missing clientId and/or clientSecret.'
    );
  }

  if (!authData.code || !authData.redirect_uri) {
    throw new Parse.Error(
      Parse.Error.OBJECT_NOT_FOUND,
      'Instagram auth configuration missing authData.code and/or authData.redirect_uri.'
    );
  }
  var options = {
    method: 'POST',
    uri: 'https://api.instagram.com/oauth/access_token',
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
    const userData = await request(authData.apiURL || defaultURL, accessTokenData.access_token);
    if (userData && userData.id) {
      authData.id = userData.id;
      authData.access_token = accessTokenData.access_token;
      return;
    }
  }
  throw new Parse.Error(
    Parse.Error.OBJECT_NOT_FOUND,
    `Instagram auth is invalid for this user.` + `${accessTokenData?.error_message}`
  );
}
// Returns a promise that fulfills iff this app id is valid.
function validateAppId() {
  return Promise.resolve();
}

async function request(apiURL, access_token) {
  const url = `${apiURL}me?fields=id,username&access_token=${access_token}`;
  const userData = await httpsRequest.get(url);
  if (userData && userData.id) {
    return userData;
  }
  throw new Parse.Error(Parse.Error.OBJECT_NOT_FOUND, 'Instagram auth is invalid for this user.');
}

module.exports = {
  validateAppId,
  validateAuthData,
  beforeValidationAuthData,
};
