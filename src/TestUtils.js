const { AppCache } = require('./cache');

//Used by tests
function destroyAllDataPermanently() {
  if (!process.env.TESTING) {
    throw 'Only supported in test environment';
  }
  return Promise.all(Object.keys(AppCache.cache).map(appId => {
    const app = AppCache.get(appId);
    if (app.databaseController) {
      return app.databaseController.deleteEverything();
    } else {
      return Promise.resolve();
    }
  }));
}

module.exports = { destroyAllDataPermanently };
