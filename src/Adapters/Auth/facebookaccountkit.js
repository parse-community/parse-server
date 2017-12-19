const https = require('https');
const Parse  = require('parse/node').Parse;

const graphRequest = (path) => {
  return new Promise((resolve, reject) => {
    https.get(`https://graph.accountkit.com/v1.1/${path}`, (res) => {
      var data = '';
      res.on('data', (chunk) => {
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
          return reject(e);
        }
      });
    }).on('error', function () {
      reject('Failed to validate this access token with Facebook.');
    });
  });
};

function validateAppId() {
  return Promise.resolve();
}

function validateAuthData(authData) {
  const access_token = authData.access_token;
  const path = `me?access_token=${access_token}`;
  return graphRequest(path)
    .then(data => {
      if (data && data.id == authData.id) {
        return;
      }
      throw new Parse.Error(
        Parse.Error.OBJECT_NOT_FOUND,
        'Facebook auth is invalid for this user.');
    })
}

module.exports = {
  validateAppId,
  validateAuthData
}
