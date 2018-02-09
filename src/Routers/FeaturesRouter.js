import { version }     from '../../package.json';
import PromiseRouter   from '../PromiseRouter';
import * as middleware from "../middlewares";

export class FeaturesRouter extends PromiseRouter {
  mountRoutes() {
    this.route('GET','/serverInfo', middleware.promiseEnforceMasterKeyAccess, req => {
      const features = {
        globalConfig: {
          create: true,
          read: true,
          update: true,
          delete: true,
        },
        hooks: {
          create: true,
          read: true,
          update: true,
          delete: true,
        },
        cloudCode: {
          jobs: true,
        },
        logs: {
          level: true,
          size: true,
          order: true,
          until: true,
          from: true,
        },
        push: {
          immediatePush: req.config.hasPushSupport,
          scheduledPush: req.config.hasPushScheduledSupport,
          storedPushData: req.config.hasPushSupport,
          pushAudiences: true,
          localization: true,
        },
        schemas: {
          addField: true,
          removeField: true,
          addClass: true,
          removeClass: true,
          clearAllDataFromClass: true,
          exportClass: false,
          editClassLevelPermissions: true,
          editPointerPermissions: true,
        },
      };

      return { response: {
        features: features,
        parseServerVersion: version,
      } };
    });
  }
}
