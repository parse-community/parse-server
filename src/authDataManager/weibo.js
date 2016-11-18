'use strict';

var https = require('https');
var Parse = require('parse/node').Parse;
var querystring=require('querystring');

function validateAuthData(authData) {
  return graphRequest(authData.access_token).then(function (data) {
    if (data && data.uid == authData.id) {
      return;
    }
    throw new Parse.Error(Parse.Error.OBJECT_NOT_FOUND, 'weibo auth is invalid for this user.');
  });
}

function validateAppId(appIds, authData) {
  return Promise.resolve();
}

function graphRequest(access_token) {
  return new Promise(function (resolve, reject) {
    var postData=querystring.stringify({
      "access_token":access_token
    });

    var options = {
      hostname: 'api.weibo.com',
      path: '/oauth2/get_token_info',
      method: 'POST',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
        'Content-Length': Buffer.byteLength(postData)
      }
    };

    var req = https.request(options, function(res){
      var data = '';
      res.on('data', function (chunk) {
        data += chunk;
       });
      res.on('end', function () {
        data = JSON.parse(data);
        resolve(data);
      });
      res.on('error', function (err) {
        reject('Failed to validate this access token with weibo.');
      });

  });

    req.on('error', function (e){
      reject('Failed to validate this access token with weibo.');
  });
    req.write(postData);
    req.end();

  });
}

module.exports = {
  validateAppId: validateAppId,
  validateAuthData: validateAuthData
};