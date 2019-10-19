/* Google Play Game Services
https://developers.google.com/games/services/web/api/players/get

const authData = {
  id: 'playerId',
  access_token: 'token',
};
*/
const { Parse } = require('parse/node');
const httpsRequest = require('./httpsRequest');

// Returns a promise that fulfills if this user id is valid.
function validateAuthData(authData) {
  return request(`${authData.id}?access_token=${authData.access_token}`).then(
    response => {
      if (!(response && response.playerId === authData.id)) {
        throw new Parse.Error(
          Parse.Error.OBJECT_NOT_FOUND,
          'Google Play Games Services - authData is invalid for this user.'
        );
      }
    }
  );
}

// Returns a promise that fulfills if this app id is valid.
function validateAppId() {
  return Promise.resolve();
}

function request(path) {
  return httpsRequest.get(
    `https://www.googleapis.com/games/v1/players/${path}`
  );
}

module.exports = {
  validateAppId,
  validateAuthData,
};
