import PromiseRouter from '../PromiseRouter';
import * as middleware from '../middlewares';
import Config from '../Config';
import Parse from 'parse/node';

export class SecurityRouter extends PromiseRouter {
  mountRoutes() {
    this.route('GET', '/security',
      middleware.promiseEnforceMasterKeyAccess,
      this._enforceSecurityCheckEnabled,
      async () => {
        return {
          status: 200,
          text: 'OK',
        };
      }
    );
  }

  async _enforceSecurityCheckEnabled() {
    const config = Config.get(Parse.applicationId);
    if (!config.security || !config.security.enableCheck) {
      const error = new Error();
      error.status = 409;
      error.message = 'Enable Parse Server option `security.enableCheck` to run security check.';
      throw error;
    }
  }
}

export default SecurityRouter;
