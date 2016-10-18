import PromiseRouter   from '../PromiseRouter';
import * as middleware from '../middlewares';
import rest            from '../rest';
import bluebird         from 'bluebird';

export class ImportRouter extends PromiseRouter {
  handleImport(req) {
    var restObjects = [];
    if (Array.isArray(req.body)) {
      restObjects = req.body;
    } else if (Array.isArray(req.body.results)) {
      restObjects = req.body.results;
    }
    return bluebird
      .map(restObjects, importRestObject, { concurrency: 100 })
      .then((results) => {
        return {response: results};
      });

    function importRestObject(restObject) {
      if (restObject.objectId) {
        return rest
          .update(req.config, req.auth, req.params.className, restObject.objectId, restObject, req.info.clientSDK)
          .catch(function (error) {
            if (error.code === Parse.Error.OBJECT_NOT_FOUND) {
              return rest.create(
                req.config,
                req.auth,
                req.params.className,
                restObject,
                req.info.clientSDK,
                {allowObjectId: true}
              );
            } else {
              return Promise.reject(error);
            }
          });
      } else {
        return rest.create(req.config, req.auth, req.params.className, restObject, req.info.clientSDK);
      }
    }
  }

  mountRoutes() {
    this.route(
      'POST',
      '/import/:className',
      middleware.promiseEnforceMasterKeyAccess,
      (req) => { return this.handleImport(req); }
    );
  }
}

export default ImportRouter;