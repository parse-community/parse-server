// These methods handle the User-related routes.

import deepcopy       from 'deepcopy';
import Config         from '../Config';
import AccountLockout from '../AccountLockout';
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

    return super.handleCreate(req);
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
    let sessionToken = req.info.sessionToken;
    return rest.find(req.config, Auth.master(req.config), '_Session',
      { sessionToken },
      { include: 'user' }, req.info.clientSDK)
      .then((response) => {
        if (!response.results ||
          response.results.length == 0 ||
          !response.results[0].user) {
          throw new Parse.Error(Parse.Error.INVALID_SESSION_TOKEN, 'invalid session token');
        } else {
          let user = response.results[0].user;
          // Send token back on the login, because SDKs expect that.
          user.sessionToken = sessionToken;
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
    if (typeof req.body.username !== 'string' || typeof req.body.password !== 'string') {
      throw new Parse.Error(Parse.Error.OBJECT_NOT_FOUND, 'Invalid username/password.');
    }

    let user;
    let isValidPassword = false;

    return req.config.database.find('_User', { username: req.body.username })
      .then((results) => {
        if (!results.length) {
          throw new Parse.Error(Parse.Error.OBJECT_NOT_FOUND, 'Invalid username/password.');
        }
        user = results[0];

        if (req.config.verifyUserEmails && req.config.preventLoginWithUnverifiedEmail && !user.emailVerified) {
          throw new Parse.Error(Parse.Error.EMAIL_NOT_FOUND, 'User email is not verified.');
        }
        return passwordCrypto.compare(req.body.password, user.password);
      })
      .then((correct) => {
        isValidPassword = correct;
        let accountLockoutPolicy = new AccountLockout(user, req.config);
        return accountLockoutPolicy.handleLoginAttempt(isValidPassword);
      })
      .then(() => {
        if (!isValidPassword) {
          throw new Parse.Error(Parse.Error.OBJECT_NOT_FOUND, 'Invalid username/password.');
        }

        let token = 'r:' + cryptoUtils.newToken();
        user.sessionToken = token;
        delete user.password;

        // Sometimes the authData still has null on that keys
        // https://github.com/ParsePlatform/parse-server/issues/935
        if (user.authData) {
          Object.keys(user.authData).forEach((provider) => {
            if (user.authData[provider] === null) {
              delete user.authData[provider];
            }
          });
          if (Object.keys(user.authData).length == 0) {
            delete user.authData;
          }
        }

        req.config.filesController.expandFilesInObject(req.config, user);

        let expiresAt = req.config.generateSessionExpiresAt();
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
        { sessionToken: req.info.sessionToken }, undefined, req.info.clientSDK
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

  handleResetRequest(req) {
    try {
      Config.validateEmailConfiguration({
        emailAdapter: req.config.userController.adapter,
        appName: req.config.appName,
        publicServerURL: req.config.publicServerURL,
        emailVerifyTokenValidityDuration: req.config.emailVerifyTokenValidityDuration
      });
    } catch (e) {
      if (typeof e === 'string') {
        // Maybe we need a Bad Configuration error, but the SDKs won't understand it. For now, Internal Server Error.
        throw new Parse.Error(Parse.Error.INTERNAL_SERVER_ERROR, 'An appName, publicServerURL, and emailAdapter are required for password reset functionality.');
      } else {
        throw e;
      }
    }
    let { email } = req.body;
    if (!email) {
      throw new Parse.Error(Parse.Error.EMAIL_MISSING, "you must provide an email");
    }
    if (typeof email !== 'string') {
      throw new Parse.Error(Parse.Error.INVALID_EMAIL_ADDRESS, 'you must provide a valid email string');
    }
    let userController = req.config.userController;
    return userController.sendPasswordResetEmail(email).then(token => {
       return Promise.resolve({
         response: {}
       });
    }, err => {
      if (err.code === Parse.Error.OBJECT_NOT_FOUND) {
        throw new Parse.Error(Parse.Error.EMAIL_NOT_FOUND, `No user found with email ${email}.`);
      } else {
        throw err;
      }
    });
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
    this.route('POST', '/requestPasswordReset', req => { return this.handleResetRequest(req); })
  }
}

export default UsersRouter;
