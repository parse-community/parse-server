import PromiseRouter from '../PromiseRouter';
import * as middleware from "../middlewares";
import { logger, configureLogger } from '../logger';
import winston from 'winston';

export class SettingsRouter extends PromiseRouter {
  mountRoutes() {
    this.route('GET', '/settings', middleware.promiseEnforceMasterKeyAccess, (req) => {
      return Promise.resolve({
        response: {
          logLevel: winston.level
        }
      })
    });
    this.route('POST','/settings', middleware.promiseEnforceMasterKeyAccess, (req) => {
      let body = req.body;
      let logLevel = body.logLevel;
      if (logLevel) {
        configureLogger({level: logLevel});
      }
      return Promise.resolve({
        response: body
      })
    });
  }
}
