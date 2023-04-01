module.exports = function (validAuthData) {
  return {
    validateAppId: function () {
      return Promise.resolve();
    },
    validateAuthData: function (authData) {
      if (authData.token == validAuthData.token) {
        return Promise.resolve();
      }
      return Promise.reject();
    },
  };
};
