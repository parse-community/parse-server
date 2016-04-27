import PromiseRouter from '../PromiseRouter';
import * as middleware from "../middlewares";
import { logger, configureLogger } from '../logger';
import SettingsManager from '../SettingsManager';
import winston from 'winston';
import Parse from 'parse/node';

export class SettingsRouter extends PromiseRouter {
  mountRoutes() {
    this.route('GET', '/settings', middleware.promiseEnforceMasterKeyAccess, (req) => {
      return Promise.resolve({
        response: SettingsManager(req.config.applicationId).getVisible()
      });
    });

    this.route('POST','/settings', middleware.promiseEnforceMasterKeyAccess, (req) => {
      if (req.config.enableConfigChanges) {
        let body = req.body;
        let settingsManager = SettingsManager(req.config.applicationId);
        var updatedSettings = settingsManager.updateCache(body);
        return settingsManager.push(updatedSettings)
          .then(_ => ({ response: updatedSettings }));
      } else {
        return Promise.reject(new Parse.Error(Parse.Error.OPERATION_FORBIDDEN, 'Server config changes are disabled'));
      }
    });
  }
}
