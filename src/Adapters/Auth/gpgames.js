'use strict';

// Helper functions for accessing the google API.
var https = require('https');
var Parse = require('parse/node').Parse;
var request = require('request');

// Returns a promise that fulfills if this user id is valid.
function validateAuthData(authData, authOptions) {

      var postUrl = 
      {
        url: 'https://www.googleapis.com/oauth2/v3/token',
        method: 'POST',
        headers: 
        {
            'Content-Type': 'application/x-www-form-urlencoded',
        },
        form:
        {
            'client_id': authOptions.client_id,
            'client_secret': authOptions.client_secret,
            'code': authData.access_token,
            'grant_type': 'authorization_code'
        }
      };
    return exchangeAccessToken(postUrl).then((authRes)=>
    {
        if(authRes.error)
        {
            throw new Parse.Error(Parse.Error.OBJECT_NOT_FOUND, authRes.error);
        }
        else
        {
            return requestHere("https://www.googleapis.com/games/v1/players/" + authData.id + "?access_token=" + authRes.access_token).then(response => {
                if (response && (response.playerId == authData.id)) 
                {
                    return;
                }
                else
                    throw new Parse.Error(Parse.Error.OBJECT_NOT_FOUND, 'Google auth is invalid for this user.');
            });
        }
    }).catch(error=>{
        throw new Parse.Error(Parse.Error.OBJECT_NOT_FOUND, error);
    });
}

// Returns a promise that fulfills if this app id is valid.
function validateAppId() {
  return Promise.resolve();
}

function exchangeAccessToken(postOptions)
{
  return new Promise(function (resolve, reject) {
    request(postOptions, function (error, response, body)
    {
        if (!error && response.statusCode == 200) 
        {
            try {
              body = JSON.parse(body);
            } catch (e) {
              return reject(e);
            }
            resolve(body);
        }
        else
            reject("Fail to Exchange Access Token for GPGames");
    });
  });
}

// A promisey wrapper for api requests
function requestHere(path) {
  return new Promise(function (resolve, reject) {
    https.get(path, function (res) {
      var data = '';
      res.on('data', function (chunk) {
        data += chunk;
      });
      res.on('end', function () {
        try {
          data = JSON.parse(data);
        } catch (e) {
          return reject(e);
        }
        resolve(data);
      });
    }).on('error', function () {
      reject('Failed to validate this access token with Google.');
    });
  });
}

module.exports = {
  validateAppId: validateAppId,
  validateAuthData: validateAuthData
};