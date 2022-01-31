// InstallationsRouter.js

import ClassesRouter from './ClassesRouter';
import rest from '../rest';
import { promiseEnsureIdempotency } from '../middlewares';

export class InstallationsRouter extends ClassesRouter {
  className() {
    return '_Installation';
  }

  handleFind(req) {
    const body = Object.assign(req.body, ClassesRouter.JSONFromQuery(req.query));
    const options = ClassesRouter.optionsFromBody(body);
    return rest
      .find(
        req.config,
        req.auth,
        '_Installation',
        body.where,
        options,
        req.info.clientSDK,
        req.info.context
      )
      .then(response => {
        return { response: response };
      });
  }

  mountRoutes() {
    this.route('GET', '/installations', req => {
      return this.handleFind(req);
    });
    this.route('GET', '/installations/:objectId', req => {
      return this.handleGet(req);
    });
    this.route('POST', '/installations', promiseEnsureIdempotency, req => {
      return this.handleCreate(req);
    });
    this.route('PUT', '/installations/:objectId', promiseEnsureIdempotency, req => {
      return this.handleUpdate(req);
    });
    this.route('DELETE', '/installations/:objectId', req => {
      return this.handleDelete(req);
    });
  }
}

export default InstallationsRouter;
