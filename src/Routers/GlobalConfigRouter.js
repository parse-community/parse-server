// global_config.js
import Parse from 'parse/node';
import PromiseRouter from '../PromiseRouter';
import * as middleware from '../middlewares';

export class GlobalConfigRouter extends PromiseRouter {
  getGlobalConfig(req) {
    return req.config.database
      .find('_GlobalConfig', { objectId: '1' }, { limit: 1 })
      .then(results => {
        if (results.length != 1) {
          // If there is no config in the database - return empty config.
          return { response: { params: {} } };
        }
        const globalConfig = results[0];
        if (!req.auth.isMaster && globalConfig.masterKeyOnly !== undefined) {
          for (const param in globalConfig.params) {
            if (globalConfig.masterKeyOnly[param]) {
              delete globalConfig.params[param];
              delete globalConfig.masterKeyOnly[param];
            }
          }
        }
        return {
          response: {
            params: globalConfig.params,
            masterKeyOnly: globalConfig.masterKeyOnly,
          },
        };
      });
  }

  updateGlobalConfig(req) {
    if (req.auth.isReadOnly) {
      throw new Parse.Error(
        Parse.Error.OPERATION_FORBIDDEN,
        "read-only masterKey isn't allowed to update the config."
      );
    }
    const params = req.body.params;
    const masterKeyOnly = req.body.masterKeyOnly || {};
    // Transform in dot notation to make sure it works
    const update = Object.keys(params).reduce((acc, key) => {
      acc[`params.${key}`] = params[key];
      acc[`masterKeyOnly.${key}`] = masterKeyOnly[key] || false;
      return acc;
    }, {});
    return req.config.database
      .update('_GlobalConfig', { objectId: '1' }, update, { upsert: true })
      .then(() => ({ response: { result: true } }));
  }

  mountRoutes() {
    this.route('GET', '/config', req => {
      return this.getGlobalConfig(req);
    });
    this.route('PUT', '/config', middleware.promiseEnforceMasterKeyAccess, req => {
      return this.updateGlobalConfig(req);
    });
  }
}

export default GlobalConfigRouter;
