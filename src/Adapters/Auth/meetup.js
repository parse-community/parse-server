import Config from '../../Config';

// Helper functions for accessing the meetup API.
var Parse = require('parse/node').Parse;
const httpsRequest = require('./httpsRequest');

// Returns a promise that fulfills iff this user id is valid.
async function validateAuthData(authData) {
  const config = Config.get(Parse.applicationId);
  const meetupConfig = config.auth.meetup;
  if (meetupConfig && meetupConfig.enableInsecureAuth && config.enableInsecureAuthAdapters) {
    return request('member/self', authData.access_token).then(data => {
      if (data && data.id == authData.id) {
        return;
      }
      throw new Parse.Error(Parse.Error.OBJECT_NOT_FOUND, 'Meetup auth is invalid for this user.');
    });
  } else {
    throw new Parse.Error('Meetup only works with enableInsecureAuth: true');
  }
}

// Returns a promise that fulfills iff this app id is valid.
function validateAppId() {
  return Promise.resolve();
}

// A promisey wrapper for api requests
function request(path, access_token) {
  return httpsRequest.get({
    host: 'api.meetup.com',
    path: '/2/' + path,
    headers: {
      Authorization: 'bearer ' + access_token,
    },
  });
}

module.exports = {
  validateAppId: validateAppId,
  validateAuthData: validateAuthData,
};
