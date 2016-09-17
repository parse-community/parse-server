
import ClassesRouter from './ClassesRouter';
import PromiseRouter from '../PromiseRouter';
import rest          from '../rest';
import Auth          from '../Auth';
import RestWrite     from '../RestWrite';
import { newToken }  from '../cryptoUtils';

export class SessionsRouter extends ClassesRouter {
  handleFind(req) {
    req.params.className = '_Session';
    return super.handleFind(req);
  }

  handleGet(req) {
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

  handleUpdateToRevocableSession(req) {
    const config = req.config;
    const masterAuth = Auth.master(config)
    const user = req.auth.user;
    // Issue #2720
    // Calling without a session token would result in a not found user
    if (!user) {
      throw new Parse.Error(Parse.Error.OBJECT_NOT_FOUND, 'invalid session');
    }
    const expiresAt = config.generateSessionExpiresAt();
    const sessionData = {
      sessionToken: 'r:' + newToken(),
      user: {
        __type: 'Pointer',
        className: '_User',
        objectId: user.id
      },
      createdWith: {
        'action': 'upgrade',
      },
      restricted: false,
      installationId: req.auth.installationId,
      expiresAt: Parse._encode(expiresAt)
    };
    const create = new RestWrite(config, masterAuth, '_Session', null, sessionData);
    return create.execute().then(() => {
      // delete the session token, use the db to skip beforeSave
      return config.database.update('_User', {
        objectId: user.id
      }, {
        sessionToken: {__op: 'Delete'}
      });
    }).then((res) => {
      return Promise.resolve({ response: sessionData });
    });
  }

  mountRoutes() {
    this.route('GET','/sessions/me', req => { return this.handleMe(req); });
    this.route('GET', '/sessions', req => { return this.handleFind(req); });
    this.route('GET', '/sessions/:objectId', req => { return this.handleGet(req); });
    this.route('POST', '/sessions', req => { return this.handleCreate(req); });
    this.route('PUT', '/sessions/:objectId', req => { return this.handleUpdate(req); });
    this.route('DELETE', '/sessions/:objectId', req => { return this.handleDelete(req); });
    this.route('POST', '/upgradeToRevocableSession', req => { return this.handleUpdateToRevocableSession(req); })
  }
}

export default SessionsRouter;
