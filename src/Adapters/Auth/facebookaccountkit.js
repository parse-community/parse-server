const crypto = require('crypto');
const httpsRequest = require('./httpsRequest');
const Parse = require('parse/node').Parse;

const graphRequest = path => {
  return httpsRequest.get(`https://graph.accountkit.com/v1.1/${path}`);
};

function getRequestPath(authData, options) {
  const access_token = authData.access_token,
    appSecret = options && options.appSecret;
  if (appSecret) {
    const appsecret_proof = crypto
      .createHmac('sha256', appSecret)
      .update(access_token)
      .digest('hex');
    return `me?access_token=${access_token}&appsecret_proof=${appsecret_proof}`;
  }
  return `me?access_token=${access_token}`;
}

function validateAppId(appIds, authData, options) {
  if (!appIds.length) {
    return Promise.reject(
      new Parse.Error(
        Parse.Error.OBJECT_NOT_FOUND,
        'Facebook app id for Account Kit is not configured.'
      )
    );
  }
  return graphRequest(getRequestPath(authData, options)).then(data => {
    if (data && data.application && appIds.indexOf(data.application.id) != -1) {
      return;
    }
    throw new Parse.Error(
      Parse.Error.OBJECT_NOT_FOUND,
      'Facebook app id for Account Kit is invalid for this user.'
    );
  });
}

function validateAuthData(authData, options) {
  return graphRequest(getRequestPath(authData, options)).then(data => {
    if (data && data.error) {
      throw data.error;
    }
    if (data && data.id == authData.id) {
      return;
    }
    throw new Parse.Error(
      Parse.Error.OBJECT_NOT_FOUND,
      'Facebook Account Kit auth is invalid for this user.'
    );
  });
}

module.exports = {
  validateAppId,
  validateAuthData,
};
