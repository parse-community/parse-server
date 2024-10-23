// Helper functions for accessing the WeChat Graph API.
const httpsRequest = require('./httpsRequest');
var Parse = require('parse/node').Parse;

// Returns a promise that fulfills iff this user id is valid.
function validateAuthData(authData) {
  return graphRequest('auth?access_token=' + authData.access_token + '&openid=' + authData.id).then(
    function (data) {
      if (data.errcode == 0) {
        return;
      }
      console.error('wechat auth is invalid for this user.'); 
      throw new Parse.Error(Parse.Error.OBJECT_NOT_FOUND, 'Authentication failed.');
    }
  );
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
};
