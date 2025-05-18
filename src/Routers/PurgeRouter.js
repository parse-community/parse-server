import PromiseRouter from '../PromiseRouter';
import * as middleware from '../middlewares';
import Parse from 'parse/node';

export class PurgeRouter extends PromiseRouter {
  handlePurge(req) {
    if (req.auth.isReadOnly) {
      throw new Parse.Error(
        Parse.Error.OPERATION_FORBIDDEN,
        "read-only masterKey isn't allowed to purge a schema."
      );
    }
    return req.config.database
      .purgeCollection(req.params.className)
      .then(() => {
        var cacheAdapter = req.config.cacheController;
        if (req.params.className == '_Session') {
          cacheAdapter.user.clear();
        } else if (req.params.className == '_Role') {
          cacheAdapter.role.clear();
        }
        return { response: {} };
      })
      .catch(error => {
        if (!error || (error && error.code === Parse.Error.OBJECT_NOT_FOUND)) {
          return { response: {} };
        }
        throw error;
      });
  }

  mountRoutes() {
    this.route('DELETE', '/purge/:className', middleware.promiseEnforceMasterKeyAccess, req => {
      return this.handlePurge(req);
    });
  }
}

export default PurgeRouter;
