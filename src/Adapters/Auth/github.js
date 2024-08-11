/**
 * Parse Server authentication adapter for GitHub.
 *
 * @Class GitHub
 * @param {Object} options The adapter options.
 * @param {String} options.id Your GitHub App ID.
 * @param {String} options.access_token Your GitHub App Secret.
 * @param {Boolean} options.enableInsecureAuth Enable insecure authentication.
 *
 *
 * The adapter expects the following auth payload from the client:
 *
 * @param {Object} payload The auth payload.
 * @param {String} payload.id The user id obtained from GitHub.
 * @param {String} payload.access_token The access token obtained from GitHub.
 * @param {String} payload.code The code obtained from GitHub.
 * @param {String} payload.clientId The client id obtained from GitHub.
 * @param {String} payload.clientSecret The client secret obtained from GitHub.
 *
 * Parse Server then stores the required auth data in the database.
 *
 * With enableInsecureAuth flag:
 * It directly validates the user id and access token sent from the client.
 *
 * Without enableInsecureAuth flag:
 * It requires 'code' sent from client to exchange for access token.
 *
 * clientId and clientSecret can be set in the payload or in the options.
 *
 * * Example auth data for GitHub with insecure flag:
 *
 * @param {Object} payload The auth payload.
 * @param {String} payload.id "1234567".
 * @param {String} payload.access_token "ghp_aBc123DeF456Ghi789Jkl012mNo345pQR678sTU".
 *
 * {
 *   "github": {
 *     "id": "1234567",
 *     "access_token": "ghp_aBc123DeF456Ghi789Jkl012mNo345pQR678sTU"
 *   }
 * }
 *
 * Example auth data for GitHub without insecure flag:
 *
 * @param {Object} payload The auth payload.
 * @param {String} payload.code "abc123def456ghi789".
 *
 * {
 *   "github": {
 *     "code": "abc123def456ghi789"
 *   }
 * }
 * Parse Sever then stores the required auth data in the database.
 * For more information on GitHub authentication, see https://docs.github.com/en/developers/apps/authorizing-oauth-apps
 */

import logger from '../../logger';
import Config from '../../Config';

// Helper functions for accessing the github API.
const Parse = require('parse/node').Parse;
const httpsRequest = require('./httpsRequest');

// Returns a promise that fulfills iff this user id is valid.
async function validateAuthData(authData) {
  const config = Config.get(Parse.applicationId);
  const githubConfig = config.auth.github;
  if (githubConfig && githubConfig.enableInsecureAuth && config.enableInsecureAuthAdapters) {
    // Insecure validation
    if (!authData.access_token) {
      throw new Parse.Error(
        Parse.Error.OBJECT_NOT_FOUND,
        'Github insecure auth requires access_token to be sent.'
      );
    }
    return request('user', authData.access_token).then(data => {
      if (data && data.id == authData.id) {
        return;
      }
      throw new Parse.Error(Parse.Error.OBJECT_NOT_FOUND, 'Github auth is invalid for this user.');
    });
  }
}

async function beforeValidationAuthData(authData, { clientId, clientSecret } = {}) {
  const config = Config.get(Parse.applicationId);
  const githubConfig = config.auth.github;
  if (authData && authData.access_token && !githubConfig) {
    const userData = await request('user', authData.access_token);
    if (userData && userData.id) {
      authData.id = userData.id;
      return;
    }
    throw new Parse.Error(Parse.Error.OBJECT_NOT_FOUND, 'Github auth is invalid for this user.');
  }

  if (githubConfig && githubConfig.enableInsecureAuth) {
    if (!clientId && !clientSecret) {
      clientId = authData.client_id;
      clientSecret = authData.client_secret;
    }
  }
  if (
    githubConfig &&
    githubConfig.enableInsecureAuth &&
    config.enableInsecureAuthAdapters &&
    !authData.code
  )
    return;
  //For default github config {}
  if (!githubConfig && authData.clientId && authData.clientSecret) {
    clientId = authData.clientId;
    clientSecret = authData.clientSecret;
  }
  // Secure validation
  if (authData.access_token || authData.id) {
    logger.warn(
      'Warning: Github auth does not require access_token or id to be sent anymore and it indicates a potential security vulnerability'
    );
  }
  if (!clientId || !clientSecret) {
    throw new Parse.Error(Parse.Error.OBJECT_NOT_FOUND, 'Github auth is not configured.');
  }
  if (!authData.code) {
    throw new Parse.Error(Parse.Error.OBJECT_NOT_FOUND, 'Github auth requires code to be sent.');
  }
  const accessTokenData = await httpsRequest.request(
    {
      hostname: 'github.com',
      path: '/login/oauth/access_token',
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        accept: 'application/json',
      },
    },
    JSON.stringify({
      client_id: clientId,
      client_secret: clientSecret,
      code: authData.code,
    })
  );
  if (accessTokenData && accessTokenData.access_token) {
    const userData = await request('user', accessTokenData.access_token);
    if (userData && userData.id) {
      authData.access_token = accessTokenData.access_token;
      authData.id = userData.id;
      return;
    }
  }
  throw new Parse.Error(Parse.Error.OBJECT_NOT_FOUND, 'Github auth is invalid for this user.');
}

// Returns a promise that fulfills if this app id is valid.
function validateAppId() {
  return Promise.resolve();
}

// A promisey wrapper for api requests
function request(path, access_token) {
  return httpsRequest.get({
    host: 'api.github.com',
    path: '/' + path,
    headers: {
      Authorization: 'bearer ' + access_token,
      'User-Agent': 'parse-server',
    },
  });
}

module.exports = {
  validateAppId: validateAppId,
  validateAuthData: validateAuthData,
  beforeValidationAuthData: beforeValidationAuthData,
};
