
import ClassesRouter from './ClassesRouter';
import PromiseRouter from '../PromiseRouter';
import rest          from '../rest';
import Auth          from '../Auth';

export class SessionsRouter extends ClassesRouter {
  handleFind(req) {
    req.params.className = '_Session';
    return super.handleFind(req);
  }

  handleGet(req) {
    if (req.params.objectId === 'me') {
      return this.handleMe(req);
    }
    req.params.className = '_Session';
    return super.handleGet(req);
  }

  handleCreate(req) {
    req.params.className = '_Session';
    return super.handleCreate(req);
  }

  handleUpdate(req) {
    req.params.className = '_Session';
    return super.handleUpdate(req);
  }

  handleDelete(req) {
    req.params.className = '_Session';
    return super.handleDelete(req);
  }

  handleMe(req) {
    // TODO: Verify correct behavior
    if (!req.info || !req.info.sessionToken) {
      throw new Parse.Error(Parse.Error.INVALID_SESSION_TOKEN,
        'Session token required.');
    }
    return rest.find(req.config, Auth.master(req.config), '_Session', { sessionToken: req.info.sessionToken }, undefined, req.info.clientSDK)
      .then((response) => {
        if (!response.results || response.results.length == 0) {
          throw new Parse.Error(Parse.Error.INVALID_SESSION_TOKEN,
            'Session token not found.');
        }
        return {
          response: response.results[0]
        };
      });
  }

  mountRoutes() {
    this.route('GET', '/sessions', req => { return this.handleFind(req); });
    this.route('GET', '/sessions/:objectId', req => { return this.handleGet(req); });
    this.route('POST', '/sessions', req => { return this.handleCreate(req); });
    this.route('PUT', '/sessions/:objectId', req => { return this.handleUpdate(req); });
    this.route('DELETE', '/sessions/:objectId', req => { return this.handleDelete(req); });
  }
}

export default SessionsRouter;
