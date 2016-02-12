
import ClassesRouter from './ClassesRouter';
import PromiseRouter from '../PromiseRouter';
import rest from '../rest';

export class RolesRouter extends ClassesRouter {
  handleFind(req) {
    req.params.className = '_Role';
    return super.handleFind(req);
  }

  handleGet(req) {
    req.params.className = '_Role';
    return super.handleGet(req);
  }

  handleCreate(req) {
    req.params.className = '_Role';
    return super.handleCreate(req);
  }

  handleUpdate(req) {
    req.params.className = '_Role';
    return super.handleUpdate(req);
  }

  handleDelete(req) {
    req.params.className = '_Role';
    return super.handleDelete(req);
  }

  getExpressRouter() {
    let router = new PromiseRouter();
    router.route('GET','/roles', req => { return this.handleFind(req); });
    router.route('GET','/roles/:objectId', req => { return this.handleGet(req); });
    router.route('POST','/roles', req => { return this.handleCreate(req); });
    router.route('PUT','/roles/:objectId', req => { return this.handleUpdate(req); });
    router.route('DELETE','/roles/:objectId', req => { return this.handleDelete(req); });
    return router;
  }
}

export default RolesRouter;
