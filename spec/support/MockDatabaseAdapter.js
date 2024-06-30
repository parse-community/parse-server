module.exports = function (options) {
  return {
    options: options,
    send: function () {},
    getDatabaseURI: function () {
      return options.databaseURI;
    },
  };
};
