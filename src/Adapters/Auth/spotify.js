/**
 * Parse Server Spotify Auth Adapter.
 *
 * @Class Spotify
 * @param {Object} options Spotify Auth Adapter options object
 * @param {String} options.clientId Your Spotify application's client id
 * @param {Boolean} options.enableInsecureAuth Enable insecure authentication
 *
 * The adapter expects the following authData from the client:
 *
 * @param {Object} payload The authData payload from the client
 * @param {String} payload.id The user id obtained from Spotify
 * @param {String} payload.access_token The access token obtained from Spotify
 * @param {String} payload.code The code obtained from Spotify
 * @param {String} payload.redirect_uri The redirect uri obtained from Spotify
 * @param {String} payload.code_verifier The code verifier obtained from Spotify
 *
 * Parse Server then stores the required auth data in the database.
 *
 * With enableInsecureAuth flag:
 * It directly validates the user id and access token sent from the client.
 *
 * Without enableInsecureAuth flag:
 * It requires 'code', 'redirect_uri' and 'code_verifier' sent from client to exchange for access token.
 *
 * * Example auth data for Spotify with insecure flag:
 *
 * @param {Object} payload The authData payload from the client
 * @param {String} payload.id "1234567"
 * @param {String} payload.access_token "xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx"
 *
 * {
 * "spotify": {
 * "id": "1234567",
 * "access_token": "xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx"
 * }
 * }
 *
 * Example auth data for Spotify without insecure flag:
 *
 * @param {Object} payload The authData payload from the client
 * @param {String} payload.code "xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx"
 * @param {String} payload.redirect_uri "https://example.com/callback"
 * @param {String} payload.code_verifier "xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx"
 *
 * {
 * "spotify": {
 * "code": "xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx",
 * "redirect_uri": "https://example.com/callback",
 * "code_verifier": "xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx"
 * }
 * }
 *
 * Parse Sever then stores the required auth data in the database.
 *
 * For more information on Spotify authentication, see https://developer.spotify.com/documentation/web-api/tutorials/getting-started
 *
 */

import logger from '../../logger';
import Config from '../../Config';

// Helper functions for accessing the Spotify API.
const httpsRequest = require('./httpsRequest');
var Parse = require('parse/node').Parse;

// Returns a promise that fulfills iff this user id is valid.
async function validateAuthData(authData) {
  const config = Config.get(Parse.applicationId);
  const spotifyConfig = config.auth.spotify;
  if (spotifyConfig && spotifyConfig.enableInsecureAuth && config.enableInsecureAuthAdapters) {
    // Insecure validation
    if (!authData.access_token) {
      throw new Parse.Error(
        Parse.Error.OBJECT_NOT_FOUND,
        'Spotify insecure auth requires access_token to be sent.'
      );
    }
    return request('me', authData.access_token).then(data => {
      if (data && data.id == authData.id) {
        return;
      }
      throw new Parse.Error(
        Parse.Error.OBJECT_NOT_FOUND,
        'Spotify auth is invalid for this user. ' + data?.error_description
      );
    });
  }
  return request('me', authData.access_token).then(data => {
    if (data && data.id == authData.id) {
      return;
    }
    throw new Parse.Error(
      Parse.Error.OBJECT_NOT_FOUND,
      'Spotify auth is invalid for this user. ' + data?.error_description
    );
  });
}

async function beforeValidationAuthData(authData, { clientId }) {
  const config = Config.get(Parse.applicationId);
  const spotifyConfig = config.auth.spotify;

  if (authData && authData.access_token && !spotifyConfig) {
    const userData = await request('me', authData.access_token);
    if (userData && userData.id) {
      authData.id = userData.id;
      return;
    }
    throw new Parse.Error(
      Parse.Error.OBJECT_NOT_FOUND,
      'Spotify auth is invalid for this user. ' + userData?.error_description
    );
  }

  if (
    spotifyConfig &&
    spotifyConfig.enableInsecureAuth &&
    config.enableInsecureAuthAdapters &&
    !authData.code
  )
    return;

  // Secure validation
  if (authData.access_token || authData.id) {
    logger.warn(
      'Warning: Spotify auth does not require access_token or id to be sent anymore and it indicates a potential security issue.'
    );
  }

  if (!clientId) {
    clientId = authData.client_id;
  }

  if (!clientId) {
    throw new Parse.Error(
      Parse.Error.OBJECT_NOT_FOUND,
      'Spotify auth configuration missing client_id'
    );
  }

  if (!authData.code || !authData.redirect_uri || !authData.code_verifier) {
    throw new Parse.Error(
      Parse.Error.OBJECT_NOT_FOUND,
      'Spotify auth configuration authData.code and/or authData.redirect_uri and/or authData.code_verifier.'
    );
  }

  var options = {
    method: 'POST',
    uri: 'https://accounts.spotify.com/api/token',
    headers: {
      'Content-Type': 'application/x-www-form-urlencoded',
    },
    form: {
      grant_type: 'authorization_code',
      code: authData.code,
      redirect_uri: authData.redirect_uri,
      client_id: clientId,
      code_verifier: authData.code_verifier,
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
    'Spotify auth is invalid for this user. ' + accessTokenData?.error_description
  );
}

// Returns a promise that fulfills if this app id is valid.
async function validateAppId(appIds, authData) {
  const access_token = authData.access_token;
  if (!Array.isArray(appIds)) {
    throw new Parse.Error(Parse.Error.OBJECT_NOT_FOUND, 'appIds must be an array.');
  }
  if (!appIds.length) {
    throw new Parse.Error(Parse.Error.OBJECT_NOT_FOUND, 'Spotify auth is not configured.');
  }
  const data = await request('me', access_token);
  if (!data || !appIds.includes(data.id)) {
    throw new Parse.Error(
      Parse.Error.OBJECT_NOT_FOUND,
      'Spotify auth is invalid for this user. ' + data?.error_description
    );
  }
}

// A promisey wrapper for Spotify API requests.
function request(path, access_token) {
  return httpsRequest.get({
    host: 'api.spotify.com',
    path: '/v1/' + path,
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
