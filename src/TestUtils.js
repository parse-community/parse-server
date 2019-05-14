import AppCache from './cache';

/**
 * Destroys all data in the database
 * @param {boolean} fast set to true if it's ok to just drop objects and not indexes.
 */
export function destroyAllDataPermanently(fast) {
  if (!process.env.TESTING) {
    throw 'Only supported in test environment';
  }
  return Promise.all(
    Object.keys(AppCache.cache).map(appId => {
      const app = AppCache.get(appId);
      if (app.databaseController) {
        return app.databaseController.deleteEverything(fast);
      } else {
        return Promise.resolve();
      }
    })
  );
}
