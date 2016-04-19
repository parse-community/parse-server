import PromiseRouter from '../PromiseRouter';
import * as middleware from "../middlewares";
import { logger, configureLogger } from '../logger';
import winston from 'winston';
import cache from '../cache';

export class SettingsRouter extends PromiseRouter {
  mountRoutes() {
    this.route('GET', '/settings', middleware.promiseEnforceMasterKeyAccess, (req) => {
      return Promise.resolve({
        response: cache.apps.get(req.config.applicationId, 'persisted')
      });
    });

    this.route('POST','/settings', middleware.promiseEnforceMasterKeyAccess, (req, res) => {
      if (req.config.settingsCacheOptions) {
        let body = req.body;
        Object.assign(cache.apps.get(req.config.applicationId), body);
        return Promise.resolve({
          response: body
        });
      } else {
        return Promise.reject({
          status: 400,
          message: 'Cannot update settings as there are no settingsCacheOptions in parse server config'
        });
      }
    });
  }
}
