import ClassesRouter from './ClassesRouter';
import rest from '../rest';
import * as middleware from '../middlewares';

export class AudiencesRouter extends ClassesRouter {
  className() {
    return '_Audience';
  }

  handleFind(req) {
    const body = Object.assign(req.body, ClassesRouter.JSONFromQuery(req.query));
    const options = ClassesRouter.optionsFromBody(body);

    return rest
      .find(
        req.config,
        req.auth,
        '_Audience',
        body.where,
        options,
        req.info.clientSDK,
        req.info.context
      )
      .then(response => {
        response.results.forEach(item => {
          item.query = JSON.parse(item.query);
        });

        return { response: response };
      });
  }

  handleGet(req) {
    return super.handleGet(req).then(data => {
      data.response.query = JSON.parse(data.response.query);

      return data;
    });
  }

  mountRoutes() {
    this.route('GET', '/push_audiences', middleware.promiseEnforceMasterKeyAccess, req => {
      return this.handleFind(req);
    });
    this.route(
      'GET',
      '/push_audiences/:objectId',
      middleware.promiseEnforceMasterKeyAccess,
      req => {
        return this.handleGet(req);
      }
    );
    this.route('POST', '/push_audiences', middleware.promiseEnforceMasterKeyAccess, req => {
      return this.handleCreate(req);
    });
    this.route(
      'PUT',
      '/push_audiences/:objectId',
      middleware.promiseEnforceMasterKeyAccess,
      req => {
        return this.handleUpdate(req);
      }
    );
    this.route(
      'DELETE',
      '/push_audiences/:objectId',
      middleware.promiseEnforceMasterKeyAccess,
      req => {
        return this.handleDelete(req);
      }
    );
  }
}

export default AudiencesRouter;
