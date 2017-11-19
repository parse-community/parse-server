// InstallationsRouter.js

import ClassesRouter from './ClassesRouter';

export class InstallationsRouter extends ClassesRouter {
  className() {
    return '_Installation';
  }

  handleFind(req) {
    return ClassesRouter.handleFindForClass('_Installation', req).then((response) => {
      return {response: response};
    });
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
