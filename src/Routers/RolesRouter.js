
import ClassesRouter from './ClassesRouter';

export class RolesRouter extends ClassesRouter {
  className() {
    return '_Role';
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
