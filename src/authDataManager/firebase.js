// Helper functions for accessing the qq Graph API.
var Parse = require('parse/node').Parse;
var admin = require("firebase-admin");


var firebaseServiceAccount = process.env.FIREBASE_SERVICE_ACCOUNT;
if (firebaseServiceAccount != null) {
  admin.initializeApp({
    credential: admin.credential.cert(require(firebaseServiceAccount))
  });
}


// Returns a promise that fulfills iff this user id is valid.
function validateAuthData(authData) {
  if (firebaseServiceAccount == null || firebaseServiceAccount == "") {
    throw new Parse.Error(Parse.Error.FILE_READ_ERROR, "Firebase service account file not exists");
  }

  return admin.auth().verifyIdToken(authData.access_token)
      .then(function (decodedToken) {
        if (decodedToken == null || decodedToken.uid == null || decodedToken.uid == "") {
          throw new Parse.Error(Parse.Error.OBJECT_NOT_FOUND, "Firebase user not found");
        }
        return;
      }).catch(function (error) {
        throw new Parse.Error(Parse.Error.OBJECT_NOT_FOUND, error.message);
      });

}

// Returns a promise that fulfills if this app id is valid.
function validateAppId() {
  return Promise.resolve();
}


module.exports = {
  validateAppId,
  validateAuthData
};
