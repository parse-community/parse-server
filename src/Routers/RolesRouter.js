
import ClassesRouter from './ClassesRouter';

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

  mountRoutes() {
    this.route('GET','/roles', req => { return this.handleFind(req); });
    this.route('GET','/roles/:objectId', req => { return this.handleGet(req); });
    this.route('POST','/roles', req => { return this.handleCreate(req); });
    this.route('PUT','/roles/:objectId', req => { return this.handleUpdate(req); });
    this.route('DELETE','/roles/:objectId', req => { return this.handleDelete(req); });
  }
}

export default RolesRouter;
