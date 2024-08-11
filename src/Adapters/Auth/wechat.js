/**
 * Parse Server configuration for WeChat
 *
 * @Class  WeChat
 * @param {Object} options The adapter options object
 * @param {Boolean} options.enableInsecureAuth Enable insecure authentication
 * @param {String} options.appId Your WeChat App ID
 * @param {String} options.appSecret Your WeChat App Secret
 *
 * The adapter expects the following authData from the client:
 *
 * @param {Object} payload The authData payload from the client
 * @param {String} payload.id The user id obtained from WeChat
 * @param {String} payload.access_token The access token obtained from WeChat
 * @param {String} payload.code The code obtained from WeChat
 *
 * Parse Server then stores the required auth data in the database.
 *
 * With enableInsecureAuth flag:
 * It directly validates the user id and access token sent from the client.
 *
 * Without enableInsecureAuth flag:
 * It requires 'code' sent from client to exchange for access token.
 *
 * * Example auth data for WeChat with insecure flag:
 *
 * @param {Object} payload The authData payload from the client
 * @param {String} payload.id "1234567"
 * @param {String} payload.access_token "xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx"
 *
 * {
 *  "wechat": {
 *   "id": "1234567",
 *  "access_token": "xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx"
 * }
 * }
 *
 * Example auth data for WeChat without insecure flag:
 *
 * @param {Object} payload The authData payload from the client
 * @param {String} payload.code "xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx"
 *
 * {
 * "wechat": {
 * "code": "xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx"
 * }
 * }
 *
 * Parse Sever then stores the required auth data in the database.
 * For more information on WeChat authentication, see https://developers.weixin.qq.com/doc/offiaccount/en/OA_Web_Apps/Wechat_webpage_authorization.html
 *
 *
 */

import logger from '../../logger';
import Config from '../../Config';

// Helper functions for accessing the WeChat Graph API.
const httpsRequest = require('./httpsRequest');
var Parse = require('parse/node').Parse;

// Returns a promise that fulfills iff this user id is valid.
async function validateAuthData(authData) {
  return graphRequest('auth?access_token=' + authData.access_token + '&openid=' + authData.id).then(
    function (data) {
      if (data.errcode == 0) {
        return;
      }
      throw new Parse.Error(Parse.Error.OBJECT_NOT_FOUND, 'wechat auth is invalid for this user.');
    }
  );
}

async function beforeValidationAuthData(authData, { appId, appSecret } = {}) {
  const config = Config.get(Parse.applicationId);
  const wechatConfig = config.auth.wechat;

  if (wechatConfig && wechatConfig.enableInsecureAuth && config.enableInsecureAuthAdapters) {
    // Insecure validation
    if (!authData.access_token || !authData.id) {
      throw new Parse.Error(
        Parse.Error.OBJECT_NOT_FOUND,
        'Wechat insecure auth requires access_token and id to be sent.'
      );
    }
    return;
  }

  if (!wechatConfig && authData.appId && authData.appSecret) {
    appId = authData.appId;
    appSecret = authData.appSecret;
  }

  if (authData.access_token && authData.id) {
    return;
  }

  // Secure validation
  if (authData.access_token || authData.id) {
    logger.warn(
      'Warning: Wechat auth does not require access_token or id to be sent anymore and it indicates a potential security vulnerability'
    );
  }
  if (!appId || !appSecret) {
    throw new Parse.Error(Parse.Error.OBJECT_NOT_FOUND, 'Wechat auth is not configured.');
  }
  if (!authData.code) {
    throw new Parse.Error(Parse.Error.OBJECT_NOT_FOUND, 'Wechat auth requires code to be sent.');
  }
  const data = await graphRequest(
    'oauth2/access_token?appid=' +
      appId +
      '&secret=' +
      appSecret +
      '&code=' +
      authData.code +
      '&grant_type=authorization_code'
  );
  if (data.errcode) {
    throw new Parse.Error(Parse.Error.OBJECT_NOT_FOUND, 'wechat auth is invalid for this user.');
  }
  authData.access_token = data.access_token;
  authData.id = data.openid;
  return;
}

// Returns a promise that fulfills if this app id is valid.
function validateAppId() {
  return Promise.resolve();
}

// A promisey wrapper for WeChat graph requests.
function graphRequest(path) {
  return httpsRequest.get('https://api.weixin.qq.com/sns/' + path);
}

module.exports = {
  validateAppId,
  validateAuthData,
  beforeValidationAuthData,
};
