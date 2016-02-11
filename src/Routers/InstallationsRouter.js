// InstallationsRouter.js

import ClassesRouter from './ClassesRouter';
import PromiseRouter from '../PromiseRouter';
import rest from '../rest';

export class InstallationsRouter extends ClassesRouter {
  handleFind(req) {
    var options = {};
    if (req.body.skip) {
      options.skip = Number(req.body.skip);
    }
    if (req.body.limit) {
      options.limit = Number(req.body.limit);
    }
    if (req.body.order) {
      options.order = String(req.body.order);
    }
    if (req.body.count) {
      options.count = true;
    }
    if (req.body.include) {
      options.include = String(req.body.include);
    }

    return rest.find(req.config, req.auth,
      '_Installation', req.body.where, options)
      .then((response) => {
        return {response: response};
      });
  }

  handleGet(req) {
    req.params.className = '_Installation';
    return super.handleGet(req);
  }

  handleCreate(req) {
    req.params.className = '_Installation';
    return super.handleCreate(req);
  }

  handleUpdate(req) {
    req.params.className = '_Installation';
    return super.handleUpdate(req);
  }

  handleDelete(req) {
    req.params.className = '_Installation';
    return super.handleDelete(req);
  }

  getExpressRouter() {
    var router = new PromiseRouter();
    router.route('GET','/installations', (req) => { return this.handleFind(req); });
    router.route('GET','/installations/:objectId', (req) => { return this.handleGet(req); });
    router.route('POST','/installations', (req) => { return this.handleCreate(req); });
    router.route('PUT','/installations/:objectId', (req) => { return this.handleUpdate(req); });
    router.route('DELETE','/installations/:objectId', (req) => { return this.handleDelete(req); });
    return router;
  }
}

export default InstallationsRouter;
