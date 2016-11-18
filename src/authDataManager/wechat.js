'use strict';

var https = require('https');
var Parse = require('parse/node').Parse;

function validateAuthData(authData) {
  return graphRequest('auth?access_token=' + authData.access_token +'&openid=' +authData.id).then(function (data) {
    if (data.errcode == 0) {
      return;
    }
    throw new Parse.Error(Parse.Error.OBJECT_NOT_FOUND, 'qq auth is invalid for this user.');
  });
}

function validateAppId(appIds, authData) {
  return Promise.resolve();
}

function graphRequest(path) {
  return new Promise(function (resolve, reject) {


    https.get('https://api.weixin.qq.com/sns/' + path, function (res) {
      var data = '';
      res.on('data', function (chunk) {
        data += chunk;
      });
      res.on('end', function () {
        data = JSON.parse(data);
        resolve(data);
      });
    }).on('error', function (e) {
      reject('Failed to validate this access token with weixin.');
    });


  });
}

module.exports = {
  validateAppId: validateAppId,
  validateAuthData: validateAuthData
};