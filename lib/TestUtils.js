'use strict';

Object.defineProperty(exports, "__esModule", {
  value: true
});
exports.destroyAllDataPermanently = destroyAllDataPermanently;

var _cache = require('./cache');

var _cache2 = _interopRequireDefault(_cache);

function _interopRequireDefault(obj) { return obj && obj.__esModule ? obj : { default: obj }; }

//Used by tests
function destroyAllDataPermanently() {
  if (!process.env.TESTING) {
    throw 'Only supported in test environment';
  }
  return Promise.all(Object.keys(_cache2.default.cache).map(appId => {
    const app = _cache2.default.get(appId);
    if (app.databaseController) {
      return app.databaseController.deleteEverything();
    } else {
      return Promise.resolve();
    }
  }));
}