import AppCache from '../src/cache';

//Used by tests
function destroyAllDataPermanently() {
  return Promise.all(Object.keys(AppCache.cache).map(appId => {
      const app = AppCache.get(appId);
      if (app.databaseController) {
        return app.databaseController.deleteEverything();
      } else {
        return Promise.resolve();
      }
    }));
}

export {
  destroyAllDataPermanently
}
