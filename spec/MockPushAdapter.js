module.exports = function(options) {
  return {
    options: options,
    send: function() {},
    getValidPushTypes: function() {
      return Object.keys(options.options);
    }
  };
};
