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
          create: false,
          read: false,
          update: false,
          delete: false,
        },
        logs: {
          level: false,
          size: false,
          order: false,
          until: false,
          from: false,
        },
        push: {
          immediatePush: req.config.pushController.pushIsAvailable,
          scheduledPush: false,
          storedPushData: false,
          pushAudiences: false,
        },
        schemas: {
          addField: true,
          removeField: true,
          addClass: true,
          removeClass: true,
          clearAllDataFromClass: false,
          exportClass: false,
          editClassLevelPermissions: true,
        },
      };

      return { response: {
				features: features,
				parseServerVersion: version,
			} };
    });
  }
}
