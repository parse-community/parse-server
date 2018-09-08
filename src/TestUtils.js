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
        if (
          app.loggerController &&
          app.loggerController.options &&
          app.loggerController.options.logsFolder
        ) {
          const folder = app.loggerController.options.logsFolder;
          try {
            require('child_process').execSync('rm ' + folder + '*', {
              stdio: 'ignore',
            });
          } catch (e) {
            /**/
          }
        }
        return app.databaseController.deleteEverything(fast);
      } else {
        return Promise.resolve();
      }
    })
  );
}
