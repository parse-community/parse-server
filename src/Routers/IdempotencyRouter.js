import ClassesRouter from './ClassesRouter';
import * as middleware from '../middlewares';

export class IdempotencyRouter extends ClassesRouter {
  className() {
    return '_Idempotency';
  }

  mountRoutes() {
    this.route(
      'POST',
      '/idempotency',
      middleware.promiseEnforceMasterKeyAccess,
      req => {
        return this.handleCreate(req);
      }
    );
  }
}

export default IdempotencyRouter;
