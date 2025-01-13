// global_config.js
import Parse from 'parse/node';
import PromiseRouter from '../PromiseRouter';
import * as middleware from '../middlewares';
import * as triggers from '../triggers';

const getConfigFromParams = params => {
  const config = new Parse.Config();
  for (const attr in params) {
    config.attributes[attr] = Parse._decode(undefined, params[attr]);
  }
  return config;
};

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

  async updateGlobalConfig(req) {
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
    const className = triggers.getClassName(Parse.Config);
    const hasBeforeSaveHook = triggers.triggerExists(className, triggers.Types.beforeSave, req.config.applicationId);
    const hasAfterSaveHook = triggers.triggerExists(className, triggers.Types.afterSave, req.config.applicationId);
    let originalConfigObject;
    let updatedConfigObject;
    const configObject = new Parse.Config();
    configObject.attributes = params;

    const results = await req.config.database.find('_GlobalConfig', { objectId: '1' }, { limit: 1 });
    const isNew = results.length !== 1;
    if (!isNew && (hasBeforeSaveHook || hasAfterSaveHook)) {
      originalConfigObject = getConfigFromParams(results[0].params);
    }
    try {
      await triggers.maybeRunGlobalConfigTrigger(triggers.Types.beforeSave, req.auth, configObject, originalConfigObject, req.config, req.context);
      if (isNew) {
        await req.config.database.update('_GlobalConfig', { objectId: '1' }, update, { upsert: true }, true)
        updatedConfigObject = configObject;
      } else {
        const result = await req.config.database.update('_GlobalConfig', { objectId: '1' }, update, {}, true);
        updatedConfigObject = getConfigFromParams(result.params);
      }
      await triggers.maybeRunGlobalConfigTrigger(triggers.Types.afterSave, req.auth, updatedConfigObject, originalConfigObject, req.config, req.context);
      return { response: { result: true } }
    } catch (err) {
      const error = triggers.resolveError(err, {
        code: Parse.Error.SCRIPT_FAILED,
        message: 'Script failed. Unknown error.',
      });
      throw error;
    }
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
