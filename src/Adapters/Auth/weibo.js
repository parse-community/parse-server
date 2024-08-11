/**
 * Parse Server configuration for weibo
 *
 * @Class  weibo
 * @param {Object} options The adapter options object
 * @param {Boolean} options.enableInsecureAuth Enable insecure authentication
 * @param {String} options.clientId Your weibo client ID
 * @param {String} options.clientSecret Your weibo client secret
 *
 * The adapter expects the following authData from the client:
 *
 * @param {Object} payload The authData payload from the client
 * @param {String} payload.id The user id obtained from weibo
 * @param {String} payload.access_token The access token obtained from weibo
 * @param {String} payload.code The code obtained from weibo
 * @param {String} payload.redirect_uri The redirect_uri obtained from weibo
 *
 * Parse Server then stores the required auth data in the database.
 *
 * With enableInsecureAuth flag:
 * It directly validates the user id and access token sent from the client.
 *
 * Without enableInsecureAuth flag:
 * It requires 'code' & 'redirect_uri sent from client to exchange for access token.
 *
 * * Example auth data for weibo with insecure flag:
 *
 * @param {Object} payload The authData payload from the client
 * @param {String} payload.id "1234567"
 * @param {String} payload.access_token "xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx"
 *
 * {
 * "weibo": {
 * "id": "1234567",
 * "access_token": "xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx"
 * }
 * }
 *
 * Example auth data for weibo without insecure flag:
 *
 * @param {Object} payload The authData payload from the client
 * @param {String} payload.code "xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx"
 * @param {String} payload.redirect_uri "xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx"
 *
 * {
 * "weibo": {
 * "code": "xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx",
 * "redirect_uri": "xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx"
 * }
 * }
 *
 * Parse Sever then stores the required auth data in the database.
 * For more information on weibo authentication, see https://open.weibo.com/wiki/Oauth2/access_token
 *
 *
 */

import logger from '../../logger';
import Config from '../../Config';

// Helper functions for accessing the weibo Graph API.
var httpsRequest = require('./httpsRequest');
var Parse = require('parse/node').Parse;
var querystring = require('querystring');

// Returns a promise that fulfills iff this user id is valid.
async function validateAuthData(authData) {
  return graphRequest(authData.access_token).then(function (data) {
    if (data && data.uid == authData.id) {
      return;
    }
    throw new Parse.Error(Parse.Error.OBJECT_NOT_FOUND, 'weibo auth is invalid for this user.');
  });
}

async function beforeValidationAuthData(authData, { clientId, clientSecret } = {}) {
  const config = Config.get(Parse.applicationId);
  const weiboConfig = config.auth.weibo;
  if (weiboConfig && weiboConfig.enableInsecureAuth && config.enableInsecureAuthAdapters) {
    // Insecure validation
    if (!authData.access_token) {
      throw new Parse.Error(
        Parse.Error.OBJECT_NOT_FOUND,
        'weibo insecure auth requires access_token to be sent.'
      );
    }
    return;
  }
  if (!weiboConfig && authData.clientId && authData.clientSecret) {
    clientId = authData.clientId;
    clientSecret = authData.clientSecret;
  }
  if (authData.access_token && authData.id) {
    return;
  }
  // Secure validation
  if (authData.access_token || authData.id) {
    logger.warn(
      'Warning: weibo auth does not require access_token or id to be sent anymore and it indicates a potential security vulnerability'
    );
  }
  if (!clientId || !clientSecret) {
    throw new Parse.Error(Parse.Error.OBJECT_NOT_FOUND, 'weibo auth is not configured.');
  }
  if (!authData.code || !authData.redirect_uri) {
    throw new Parse.Error(
      Parse.Error.OBJECT_NOT_FOUND,
      'weibo auth requires code and redirect_uri to be sent.'
    );
  }
  try {
    const postData = querystring.stringify({
      client_id: clientId,
      client_secret: clientSecret,
      grant_type: 'authorization_code',
      code: authData.code,
      redirect_uri: authData.redirect_uri,
    });

    const options = {
      hostname: 'api.weibo.com',
      path: '/oauth2/access_token',
      method: 'POST',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
        'Content-Length': Buffer.byteLength(postData),
      },
    };

    const data = await httpsRequest.request(options, postData);
    if (data.errcode) {
      throw new Parse.Error(Parse.Error.OBJECT_NOT_FOUND, 'weibo auth is invalid for this user.');
    }
    authData.access_token = data.access_token;
    authData.id = data.uid;
    return;
  } catch (error) {
    console.error('Request failed:', error);
    throw error;
  }
}

// Returns a promise that fulfills if this app id is valid.
function validateAppId() {
  return Promise.resolve();
}

// A promisey wrapper for weibo graph requests.
function graphRequest(access_token) {
  var postData = querystring.stringify({
    access_token: access_token,
  });
  var options = {
    hostname: 'api.weibo.com',
    path: '/oauth2/get_token_info',
    method: 'POST',
    headers: {
      'Content-Type': 'application/x-www-form-urlencoded',
      'Content-Length': Buffer.byteLength(postData),
    },
  };
  return httpsRequest.request(options, postData);
}

module.exports = {
  validateAppId,
  validateAuthData,
  beforeValidationAuthData,
};
