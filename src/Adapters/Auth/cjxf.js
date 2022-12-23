'use strict';

// Helper functions for accessing the google API.
var Parse = require('parse/node').Parse;

const axios = require('axios');
 
async function verifyToken(authData,{ apiUrl, apiKey }) {
    return axios.post(
        apiUrl,
        authData,
        {
            headers: {'x-api-key': apiKey},
        }
    ).then((res=>{
        if(res.status == 200) {
            return res.data
        }
        throw new Parse.Error(Parse.Error.OBJECT_NOT_FOUND);
    })).catch((exception)=>{
        const message = exception.message;
        throw new Parse.Error(Parse.Error.OBJECT_NOT_FOUND, `${message}`);
    })
}

// Returns a promise that fulfills if this user id is valid.
function validateAuthData(authData, options = {}) {
  return verifyToken(authData, options);
}

// Returns a promise that fulfills if this app id is valid.
function validateAppId() {
  return Promise.resolve();
}

module.exports = {
  validateAppId: validateAppId,
  validateAuthData: validateAuthData,
};
