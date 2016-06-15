import PromiseRouter from '../PromiseRouter';
import * as middleware from '../middlewares';

export class PurgeRouter extends PromiseRouter {

  handlePurge(req) {
    return req.config.database.purgeCollection(req.params.className)
    .then(() => {
      var cacheAdapter = req.config.cacheController;
      if (req.params.className == '_Session') {
        cacheAdapter.user.clear();
      } else if (req.params.className == '_Role') {
        cacheAdapter.role.clear();
      }
      return {response: {}};
    });
  }

  mountRoutes() {
    this.route('DELETE',  '/purge/:className', middleware.promiseEnforceMasterKeyAccess, (req) => { return this.handlePurge(req); });
  }
}

export default PurgeRouter;
