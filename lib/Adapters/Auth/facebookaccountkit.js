'use strict';

const crypto = require('crypto');
const https = require('https');
const Parse = require('parse/node').Parse;

const graphRequest = path => {
  return new Promise((resolve, reject) => {
    https.get(`https://graph.accountkit.com/v1.1/${path}`, res => {
      var data = '';
      res.on('data', chunk => {
        data += chunk;
      });
      res.on('end', () => {
        try {
          data = JSON.parse(data);
          if (data.error) {
            // when something wrong with fb graph request (token corrupted etc.)
            // instead of network issue
            reject(data.error);
          } else {
            resolve(data);
          }
        } catch (e) {
          reject(e);
        }
      });
    }).on('error', function () {
      reject('Failed to validate this access token with Facebook Account Kit.');
    });
  });
};

function getRequestPath(authData, options) {
  const access_token = authData.access_token,
        appSecret = options && options.appSecret;
  if (appSecret) {
    const appsecret_proof = crypto.createHmac("sha256", appSecret).update(access_token).digest('hex');
    return `me?access_token=${access_token}&appsecret_proof=${appsecret_proof}`;
  }
  return `me?access_token=${access_token}`;
}

function validateAppId(appIds, authData, options) {
  if (!appIds.length) {
    return Promise.reject(new Parse.Error(Parse.Error.OBJECT_NOT_FOUND, 'Facebook app id for Account Kit is not configured.'));
  }
  return graphRequest(getRequestPath(authData, options)).then(data => {
    if (data && data.application && appIds.indexOf(data.application.id) != -1) {
      return;
    }
    throw new Parse.Error(Parse.Error.OBJECT_NOT_FOUND, 'Facebook app id for Account Kit is invalid for this user.');
  });
}

function validateAuthData(authData, options) {
  return graphRequest(getRequestPath(authData, options)).then(data => {
    if (data && data.id == authData.id) {
      return;
    }
    throw new Parse.Error(Parse.Error.OBJECT_NOT_FOUND, 'Facebook Account Kit auth is invalid for this user.');
  });
}

module.exports = {
  validateAppId,
  validateAuthData
};