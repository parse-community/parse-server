// Custom oauth provider by module

// Returns a promise that fulfills iff this user id is valid.
function validateAuthData() {
  return Promise.reject();
}
function validateAppId() {
  return Promise.resolve();
}

module.exports = {
  validateAppId: validateAppId,
  validateAuthData: validateAuthData,
};
