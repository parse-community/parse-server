'use strict';

var _cache = require('./cache');

var _cache2 = _interopRequireDefault(_cache);

function _interopRequireDefault(obj) { return obj && obj.__esModule ? obj : { default: obj }; }

//Used by tests
function destroyAllDataPermanently() {
  if (process.env.TESTING) {
    // This is super janky, but destroyAllDataPermanently is
    // a janky interface, so we need to have some jankyness
    // to support it
    return Promise.all(Object.keys(_cache2.default.cache).map(function (appId) {
      var app = _cache2.default.get(appId);
      if (app.databaseController) {
        return app.databaseController.deleteEverything();
      } else {
        return Promise.resolve();
      }
    }));
  }
  throw 'Only supported in test environment';
}

module.exports = { destroyAllDataPermanently: destroyAllDataPermanently };