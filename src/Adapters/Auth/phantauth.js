/*
 * PhantAuth was designed to simplify testing for applications using OpenID Connect
 * authentication by making use of random generated users.
 *
 * To learn more, please go to: https://www.phantauth.net
 */

import Config from '../../Config';

const { Parse } = require('parse/node');
const httpsRequest = require('./httpsRequest');

// Returns a promise that fulfills if this user id is valid.
async function validateAuthData(authData) {
  const config = Config.get(Parse.applicationId);
  const phantauthConfig = config.auth.phantauth;
  if (phantauthConfig && phantauthConfig.enableInsecureAuth && config.enableInsecureAuthAdapters) {
    return request('auth/userinfo', authData.access_token).then(data => {
      if (data && data.sub == authData.id) {
        return;
      }
      throw new Parse.Error(
        Parse.Error.OBJECT_NOT_FOUND,
        'PhantAuth auth is invalid for this user.'
      );
    });
  } else {
    throw new Parse.Error('PhantAuth only works with enableInsecureAuth: true');
  }
}

// Returns a promise that fulfills if this app id is valid.
function validateAppId() {
  return Promise.resolve();
}

// A promisey wrapper for api requests
function request(path, access_token) {
  return httpsRequest.get({
    host: 'phantauth.net',
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
};
