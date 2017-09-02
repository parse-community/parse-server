// InstallationsRouter.js

import ClassesRouter from './ClassesRouter';

export class InstallationsRouter extends ClassesRouter {
  handleFind(req) {
    req.params.className = '_Installation';
    return super.handleFind(req);
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

  mountRoutes() {
    this.route('GET','/installations', req => { return this.handleFind(req); });
    this.route('GET','/installations/:objectId', req => { return this.handleGet(req); });
    this.route('POST','/installations', req => { return this.handleCreate(req); });
    this.route('PUT','/installations/:objectId', req => { return this.handleUpdate(req); });
    this.route('DELETE','/installations/:objectId', req => { return this.handleDelete(req); });
  }
}

export default InstallationsRouter;
