/**
 * Parse Server Adapter configuration for qq.
 *
 * @Class  qq
 * @param {Object} options The adapter options object
 * @param {Boolean} options.enableInsecureAuth Enable insecure authentication
 * @param {String} options.appId Your qq App ID
 * @param {String} options.appSecret Your qq App Secret
 *
 * The adapter expects the following authData from the client:
 *
 * @param {Object} payload The authData payload from the client
 * @param {String} payload.id The user id obtained from qq
 * @param {String} payload.access_token The access token obtained from qq
 * @param {String} payload.code The code obtained from qq
 * @param {String} payload.redirect_uri The redirect_uri obtained from qq
 *
 * Parse Server then stores the required auth data in the database.
 *
 * With enableInsecureAuth flag:
 * It directly validates the user id and access token sent from the client.
 *
 * Without enableInsecureAuth flag:
 * It requires 'code' & 'redirect_uri' sent from client to exchange for access token.
 *
 * * Example auth data for qq with insecure flag:
 *
 * @param {Object} payload The authData payload from the client
 * @param {String} payload.id "1234567"
 * @param {String} payload.access_token "xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx"
 *
 * {
 * "qq": {
 * "id": "1234567",
 * "access_token": "xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx"
 * }
 * }
 *
 * Example auth data for qq without insecure flag:
 *
 * @param {Object} payload The authData payload from the client
 * @param {String} payload.code "xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx"
 * @param {String} payload.redirect_uri "https://your-redirect-uri.com/callback".
 *
 * {
 * "qq": {
 * "code": "xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx",
 * "redirect_uri": "https://your-redirect-uri.com/callback"
 * }
 * }
 *
 * Parse Sever then stores the required auth data in the database.
 * For more information on qq authentication, see https://wiki.connect.qq.com/
 *
 *
 */

import logger from '../../logger';
import Config from '../../Config';

// Helper functions for accessing the qq Graph API.
const httpsRequest = require('./httpsRequest');
var Parse = require('parse/node').Parse;

// Returns a promise that fulfills iff this user id is valid.
async function validateAuthData(authData) {
  return graphRequest('me?access_token=' + authData.access_token).then(function (data) {
    if (data && data.openid == authData.id) {
      return;
    }
    throw new Parse.Error(Parse.Error.OBJECT_NOT_FOUND, 'qq auth is invalid for this user.');
  });
}

async function beforeValidationAuthData(authData, { appId, appSecret } = {}) {
  const config = Config.get(Parse.applicationId);
  const qqConfig = config.auth.qq;
  if (qqConfig && qqConfig.enableInsecureAuth && config.enableInsecureAuthAdapters) {
    // Insecure validation
    if (!authData.access_token) {
      throw new Parse.Error(
        Parse.Error.OBJECT_NOT_FOUND,
        'qq insecure auth requires access_token to be sent.'
      );
    }
    return;
  }
  if (!qqConfig && authData.appId && authData.appSecret) {
    appId = authData.appId;
    appSecret = authData.appSecret;
  }
  if (authData.access_token && authData.id) {
    return;
  }
  // Secure validation
  if (authData.access_token || authData.id) {
    logger.warn(
      'Warning: qq auth does not require access_token or id to be sent anymore and it indicates a potential security vulnerability'
    );
  }
  if (!appId || !appSecret) {
    throw new Parse.Error(Parse.Error.OBJECT_NOT_FOUND, 'qq auth is not configured.');
  }
  if (!authData.code || !authData.redirect_uri) {
    throw new Parse.Error(
      Parse.Error.OBJECT_NOT_FOUND,
      'qq auth requires code and redirect_uri to be sent.'
    );
  }
  const data = await graphRequest(
    'oauth2.0/token?grant_type=authorization_code&client_id=' +
      appId +
      '&client_secret=' +
      appSecret +
      '&code=' +
      authData.code +
      '&redirect_uri=' +
      authData.redirect_uri
  );
  if (data && data.access_token) {
    authData.access_token = data.access_token;
    authData.id = data.openid;
    return;
  }
  throw new Parse.Error(Parse.Error.OBJECT_NOT_FOUND, 'qq auth is invalid for this user.');
}

// Returns a promise that fulfills if this app id is valid.
function validateAppId() {
  return Promise.resolve();
}

// A promisey wrapper for qq graph requests.
async function graphRequest(path) {
  return httpsRequest.get('https://graph.qq.com/oauth2.0/' + path, true).then(data => {
    return parseResponseData(data);
  });
}

function parseResponseData(data) {
  const starPos = data.indexOf('(');
  const endPos = data.indexOf(')');
  if (starPos == -1 || endPos == -1) {
    throw new Parse.Error(Parse.Error.OBJECT_NOT_FOUND, 'qq auth is invalid for this user.');
  }
  data = data.substring(starPos + 1, endPos);
  return JSON.parse(data);
}

module.exports = {
  validateAppId,
  validateAuthData,
  parseResponseData,
  beforeValidationAuthData,
};
