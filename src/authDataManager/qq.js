'use strict';

var https = require('https');
var Parse = require('parse/node').Parse;

function validateAuthData(authData) {
  return graphRequest('me?access_token=' + authData.access_token).then(function (data) {
    if (data && data.openid == authData.id) {
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


    https.get('https://graph.qq.com/oauth2.0/' + path, function (res) {
      var data = '';
      res.on('data', function (chunk) {
        data += chunk;
      });
      res.on('end', function () {
        var starPos=data.indexOf("(");
        var endPos=data.indexOf(")");
        if(starPos==-1||endPos==-1){
          throw new Parse.Error(Parse.Error.OBJECT_NOT_FOUND, 'qq auth is invalid for this user.');
        }
        data=data.substring(starPos+1,endPos-1);
        data = JSON.parse(data);
        resolve(data);
      });
    }).on('error', function (e) {
      reject('Failed to validate this access token with qq.');
    });


  });
}

module.exports = {
  validateAppId: validateAppId,
  validateAuthData: validateAuthData
};