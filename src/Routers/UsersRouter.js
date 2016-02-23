// These methods handle the User-related routes.

import deepcopy       from 'deepcopy';

import ClassesRouter  from './ClassesRouter';
import PromiseRouter  from '../PromiseRouter';
import rest           from '../rest';
import Auth           from '../Auth';
import passwordCrypto from '../password';
import RestWrite      from '../RestWrite';
let cryptoUtils = require('../cryptoUtils');
let triggers = require('../triggers');

export class UsersRouter extends ClassesRouter {
  handleFind(req) {
    req.params.className = '_User';
    return super.handleFind(req);
  }

  handleGet(req) {
    req.params.className = '_User';
    return super.handleGet(req);
  }

  handleCreate(req) {
    let data = deepcopy(req.body);
    req.body = data;
    req.params.className = '_User';

    if (req.config.verifyUserEmails) {
      req.body._email_verify_token = cryptoUtils.randomString(25);
      req.body.emailVerified = false;
    }

    let p = super.handleCreate(req);

    if (req.config.verifyUserEmails) {
      // Send email as fire-and-forget once the user makes it into the DB.
      p.then(() => {
        let link = req.config.mount + "/verify_email?token=" + encodeURIComponent(req.body._email_verify_token) + "&username=" + encodeURIComponent(req.body.username);
        req.config.emailAdapter.sendVerificationEmail({
          appName: req.config.appName,
          link: link,
          user: triggers.inflate('_User', req.body),
        });
      });
    }
    return p;
  }

  handleUpdate(req) {
    req.params.className = '_User';
    return super.handleUpdate(req);
  }

  handleDelete(req) {
    req.params.className = '_User';
    return super.handleDelete(req);
  }

  handleMe(req) {
    if (!req.info || !req.info.sessionToken) {
      throw new Parse.Error(Parse.Error.INVALID_SESSION_TOKEN, 'invalid session token');
    }
    return rest.find(req.config, Auth.master(req.config), '_Session',
      { _session_token: req.info.sessionToken },
      { include: 'user' })
      .then((response) => {
        if (!response.results ||
          response.results.length == 0 ||
          !response.results[0].user) {
          throw new Parse.Error(Parse.Error.INVALID_SESSION_TOKEN, 'invalid session token');
        } else {
          let user = response.results[0].user;
          return { response: user };
        }
      });
  }

  handleLogIn(req) {
    // Use query parameters instead if provided in url
    if (!req.body.username && req.query.username) {
      req.body = req.query;
    }

    // TODO: use the right error codes / descriptions.
    if (!req.body.username) {
      throw new Parse.Error(Parse.Error.USERNAME_MISSING, 'username is required.');
    }
    if (!req.body.password) {
      throw new Parse.Error(Parse.Error.PASSWORD_MISSING, 'password is required.');
    }

    let user;
    return req.database.find('_User', { username: req.body.username })
      .then((results) => {
        if (!results.length) {
          throw new Parse.Error(Parse.Error.OBJECT_NOT_FOUND, 'Invalid username/password.');
        }
        user = results[0];
        return passwordCrypto.compare(req.body.password, user.password);
      }).then((correct) => {
        if (!correct) {
          throw new Parse.Error(Parse.Error.OBJECT_NOT_FOUND, 'Invalid username/password.');
        }

        let token = 'r:' + cryptoUtils.newToken();
        user.sessionToken = token;
        delete user.password;

        req.config.filesController.expandFilesInObject(req.config, user);

        let expiresAt = new Date();
        expiresAt.setFullYear(expiresAt.getFullYear() + 1);

        let sessionData = {
          sessionToken: token,
          user: {
            __type: 'Pointer',
            className: '_User',
            objectId: user.objectId
          },
          createdWith: {
            'action': 'login',
            'authProvider': 'password'
          },
          restricted: false,
          expiresAt: Parse._encode(expiresAt)
        };

        if (req.info.installationId) {
          sessionData.installationId = req.info.installationId
        }

        let create = new RestWrite(req.config, Auth.master(req.config), '_Session', null, sessionData);
        return create.execute();
      }).then(() => {
        return { response: user };
      });
  }

  handleLogOut(req) {
    let success = {response: {}};
    if (req.info && req.info.sessionToken) {
      return rest.find(req.config, Auth.master(req.config), '_Session',
        { _session_token: req.info.sessionToken }
      ).then((records) => {
        if (records.results && records.results.length) {
          return rest.del(req.config, Auth.master(req.config), '_Session',
            records.results[0].objectId
          ).then(() => {
            return Promise.resolve(success);
          });
        }
        return Promise.resolve(success);
      });
    }
    return Promise.resolve(success);
  }

  mountRoutes() {
    this.route('GET', '/users', req => { return this.handleFind(req); });
    this.route('POST', '/users', req => { return this.handleCreate(req); });
    this.route('GET', '/users/me', req => { return this.handleMe(req); });
    this.route('GET', '/users/:objectId', req => { return this.handleGet(req); });
    this.route('PUT', '/users/:objectId', req => { return this.handleUpdate(req); });
    this.route('DELETE', '/users/:objectId', req => { return this.handleDelete(req); });
    this.route('GET', '/login', req => { return this.handleLogIn(req); });
    this.route('POST', '/logout', req => { return this.handleLogOut(req); });
    this.route('POST', '/requestPasswordReset', () => {
      throw new Parse.Error(Parse.Error.COMMAND_UNAVAILABLE, 'This path is not implemented yet.');
    });
    this.route('POST', '/requestPasswordReset', req => this.handleReset(req));
  }
}

export default UsersRouter;
