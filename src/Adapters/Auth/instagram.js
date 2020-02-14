// Helper functions for accessing the instagram API.
var Parse = require('parse/node').Parse;
const httpsRequest = require('./httpsRequest');

// Returns a promise that fulfills iff this user id is valid.
function validateAuthData(authData) {

    if (authData.api_type != null && authData.api_type == "new_api") {

        return requestNew('me?fields=&access_token=' + authData.access_token).then(
            response => {
                if (response && response.data && response.data.id == authData.id) {
                    return;
                }
                throw new Parse.Error(
                    Parse.Error.OBJECT_NOT_FOUND,
                    'Instagram auth is invalid for this user.'
                );
            }
        );

    } else {

        return requestOld('users/self/?access_token=' + authData.access_token).then(
            response => {
                if (response && response.data && response.data.id == authData.id) {
                    return;
                }
                throw new Parse.Error(
                    Parse.Error.OBJECT_NOT_FOUND,
                    'Instagram auth is invalid for this user.'
                );
            }
        );

    }

}

// Returns a promise that fulfills iff this app id is valid.
function validateAppId() {
    return Promise.resolve();
}

// A promisey wrapper for old api requests
function requestOld(path) {
    return httpsRequest.get('https://api.instagram.com/v1/' + path);
}

// A promisey wrapper for new api requests
function requestNew(path) {
    return httpsRequest.get('https://graph.instagram.com/' + path);
}


module.exports = {
    validateAppId: validateAppId,
    validateAuthData: validateAuthData,
};
