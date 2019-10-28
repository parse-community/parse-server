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
async function validateAuthData(authData) {
  const response = await httpsRequest.get(
    `https://www.googleapis.com/games/v1/players/${authData.id}?access_token=${authData.access_token}`
  );
  if (!(response && response.playerId === authData.id)) {
    throw new Parse.Error(
      Parse.Error.OBJECT_NOT_FOUND,
      'Google Play Games Services - authData is invalid for this user.'
    );
  }
}

// Returns a promise that fulfills if this app id is valid.
function validateAppId() {
  return Promise.resolve();
}

module.exports = {
  validateAppId,
  validateAuthData,
};
