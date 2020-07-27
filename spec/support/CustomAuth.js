module.exports = {
  validateAppId: function () {
    return Promise.resolve();
  },
  validateAuthData: function (authData) {
    if (authData.token == 'my-token') {
      return Promise.resolve();
    }
    return Promise.reject();
  },
};
