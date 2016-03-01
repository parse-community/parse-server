// Custom oauth provider by module

// Returns a promise that fulfills iff this user id is valid.
function validateAuthData(authData) {
  if (authData.id == "12345" && authData.access_token == "12345") {
    return Promise.resolve();
  }
  return Promise.reject();
}
function validateAppId() {
  return Promise.resolve();
}

module.exports = {
  validateAppId: validateAppId,
  validateAuthData: validateAuthData
};
