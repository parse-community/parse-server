// global_config.js

import PromiseRouter from '../PromiseRouter';
import * as middleware from "../middlewares";

export class GlobalConfigRouter extends PromiseRouter {
  getGlobalConfig(req) {
    return req.config.database.adaptiveCollection('_GlobalConfig')
      .then(coll => coll.find({ '_id': 1 }, { limit: 1 }))
      .then(results => {
        if (results.length != 1) {
          // If there is no config in the database - return empty config.
          return { response: { params: {} } };
        }
        let globalConfig = results[0];
        return { response: { params: globalConfig.params } };
      });
  }

  updateGlobalConfig(req) {
    return req.config.database.adaptiveCollection('_GlobalConfig')
      .then(coll => coll.find({ '_id': 1 }, { limit: 1 }))
      .then(results => {
        const previousConfig = results && results[0] && results[0].params || {};
        const newConfig = Object.assign({}, previousConfig, req.body.params);
        for (var key in newConfig) {
          if (newConfig[key] && newConfig[key].__op && newConfig[key].__op === "Delete") {
            delete newConfig[key];
          }
        }
        return req.config.database.adaptiveCollection('_GlobalConfig')
          .then(coll => coll.upsertOne({ _id: 1 }, { $set: { params: newConfig } }))
          .then(() => ({ response: { result: true } }));
      })
  }

  mountRoutes() {
    this.route('GET', '/config', req => { return this.getGlobalConfig(req) });
    this.route('PUT', '/config', middleware.promiseEnforceMasterKeyAccess, req => { return this.updateGlobalConfig(req) });
  }
}

export default GlobalConfigRouter;
