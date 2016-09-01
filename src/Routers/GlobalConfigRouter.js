// global_config.js

import PromiseRouter   from '../PromiseRouter';
import * as middleware from "../middlewares";

export class GlobalConfigRouter extends PromiseRouter {
  getGlobalConfig(req) {
    return req.config.database.find('_GlobalConfig', { objectId: "1" }, { limit: 1 }).then((results) => {
      if (results.length != 1) {
        // If there is no config in the database - return empty config.
        return { response: { params: {} } };
      }
      let globalConfig = results[0];
      return { response: { params: globalConfig.params } };
    });
  }

  updateGlobalConfig(req) {
    let params = req.body.params;
    // Transform in dot notation to make sure it works
    const update = Object.keys(params).reduce((acc, key) => {
      acc[`params.${key}`] = params[key];
      return acc;
    }, {});
    return req.config.database.update('_GlobalConfig', {objectId: "1"}, update, {upsert: true}).then(() => ({ response: { result: true } }));
  }

  mountRoutes() {
    this.route('GET', '/config', req => { return this.getGlobalConfig(req) });
    this.route('PUT', '/config', middleware.promiseEnforceMasterKeyAccess, req => { return this.updateGlobalConfig(req) });
  }
}

export default GlobalConfigRouter;
