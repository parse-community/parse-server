import AppCache from './cache';

//Used by tests
export function destroyAllDataPermanently(fast) {
  if (!process.env.TESTING) {
    throw 'Only supported in test environment';
  }
  return Promise.all(Object.keys(AppCache.cache).map(appId => {
    const app = AppCache.get(appId);
    if (app.databaseController) {
      return app.databaseController.deleteEverything(fast);
    } else {
      return Promise.resolve();
    }
  }));
}
