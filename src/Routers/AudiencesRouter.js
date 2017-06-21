import ClassesRouter from './ClassesRouter';
import rest from '../rest';
import * as middleware from '../middlewares';

export class AudiencesRouter extends ClassesRouter {
  handleFind(req) {
    const body = Object.assign(req.body, ClassesRouter.JSONFromQuery(req.query));
    var options = {};

    if (body.skip) {
      options.skip = Number(body.skip);
    }
    if (body.limit || body.limit === 0) {
      options.limit = Number(body.limit);
    }
    if (body.order) {
      options.order = String(body.order);
    }
    if (body.count) {
      options.count = true;
    }
    if (body.include) {
      options.include = String(body.include);
    }

    return rest.find(req.config, req.auth, '_Audience', body.where, options, req.info.clientSDK)
      .then((response) => {

        response.results.forEach((item) => {
          item.query = JSON.parse(item.query);
        });

        return {response: response};
      });
  }

  handleGet(req) {
    req.params.className = '_Audience';
    return super.handleGet(req)
      .then((data) => {
        data.response.query = JSON.parse(data.response.query);

        return data;
      });
  }

  handleCreate(req) {
    req.params.className = '_Audience';
    return super.handleCreate(req);
  }

  handleUpdate(req) {
    req.params.className = '_Audience';
    return super.handleUpdate(req);
  }

  handleDelete(req) {
    req.params.className = '_Audience';
    return super.handleDelete(req);
  }

  mountRoutes() {
    this.route('GET','/push_audiences', middleware.promiseEnforceMasterKeyAccess, req => { return this.handleFind(req); });
    this.route('GET','/push_audiences/:objectId', middleware.promiseEnforceMasterKeyAccess, req => { return this.handleGet(req); });
    this.route('POST','/push_audiences', middleware.promiseEnforceMasterKeyAccess, req => { return this.handleCreate(req); });
    this.route('PUT','/push_audiences/:objectId', middleware.promiseEnforceMasterKeyAccess, req => { return this.handleUpdate(req); });
    this.route('DELETE','/push_audiences/:objectId', middleware.promiseEnforceMasterKeyAccess, req => { return this.handleDelete(req); });
  }
}

export default AudiencesRouter;
