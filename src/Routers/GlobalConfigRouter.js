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
    const params = req.body.params;
    const update = Object.keys(params).reduce((acc, key) => {
      if(params[key] && params[key].__op && params[key].__op === "Delete") {
        if (!acc.$unset) acc.$unset = {};
        acc.$unset[`params.${key}`] = "";
      } else {
        if (!acc.$set) acc.$set = {};
        acc.$set[`params.${key}`] = params[key];
      }
      return acc;
    }, {});
    return req.config.database.adaptiveCollection('_GlobalConfig')
      .then(coll => coll.upsertOne({ _id: 1 }, update))
      .then(() => ({ response: { result: true } }));
  }

  mountRoutes() {
    this.route('GET', '/config', req => { return this.getGlobalConfig(req) });
    this.route('PUT', '/config', middleware.promiseEnforceMasterKeyAccess, req => { return this.updateGlobalConfig(req) });
  }
}

export default GlobalConfigRouter;
