import AppCache from './cache';

//Used by tests
function destroyAllDataPermanently() {
  if (process.env.TESTING) {
    // This is super janky, but destroyAllDataPermanently is
    // a janky interface, so we need to have some jankyness
    // to support it
    return Promise.all(Object.keys(AppCache.cache).map(appId => {
      const app = AppCache.get(appId);
      if (app.databaseController) {
        return app.databaseController.deleteEverything();
      } else {
        return Promise.resolve();
      }
    }));
  }
  throw 'Only supported in test environment';
}

module.exports = { destroyAllDataPermanently };
