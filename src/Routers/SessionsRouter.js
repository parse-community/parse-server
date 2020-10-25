import ClassesRouter from './ClassesRouter';
import Parse from 'parse/node';
import rest from '../rest';
import Auth from '../Auth';

export class SessionsRouter extends ClassesRouter {
  className() {
    return '_Session';
  }

  handleMe(req) {
    // TODO: Verify correct behavior
    if (!req.info || !req.info.sessionToken) {
      throw new Parse.Error(Parse.Error.INVALID_SESSION_TOKEN, 'Session token required.');
    }
    return rest
      .find(
        req.config,
        Auth.master(req.config),
        '_Session',
        { sessionToken: req.info.sessionToken },
        undefined,
        req.info.clientSDK,
        req.info.context
      )
      .then(response => {
        if (!response.results || response.results.length == 0) {
          throw new Parse.Error(Parse.Error.INVALID_SESSION_TOKEN, 'Session token not found.');
        }
        return {
          response: response.results[0],
        };
      });
  }

  handleUpdateToRevocableSession(req) {
    const config = req.config;
    const user = req.auth.user;
    // Issue #2720
    // Calling without a session token would result in a not found user
    if (!user) {
      throw new Parse.Error(Parse.Error.OBJECT_NOT_FOUND, 'invalid session');
    }
    const { sessionData, createSession } = Auth.createSession(config, {
      userId: user.id,
      createdWith: {
        action: 'upgrade',
      },
      installationId: req.auth.installationId,
    });

    return createSession()
      .then(() => {
        // delete the session token, use the db to skip beforeSave
        return config.database.update(
          '_User',
          {
            objectId: user.id,
          },
          {
            sessionToken: { __op: 'Delete' },
          }
        );
      })
      .then(() => {
        return Promise.resolve({ response: sessionData });
      });
  }

  mountRoutes() {
    this.route('GET', '/sessions/me', req => {
      return this.handleMe(req);
    });
    this.route('GET', '/sessions', req => {
      return this.handleFind(req);
    });
    this.route('GET', '/sessions/:objectId', req => {
      return this.handleGet(req);
    });
    this.route('POST', '/sessions', req => {
      return this.handleCreate(req);
    });
    this.route('PUT', '/sessions/:objectId', req => {
      return this.handleUpdate(req);
    });
    this.route('DELETE', '/sessions/:objectId', req => {
      return this.handleDelete(req);
    });
    this.route('POST', '/upgradeToRevocableSession', req => {
      return this.handleUpdateToRevocableSession(req);
    });
  }
}

export default SessionsRouter;
