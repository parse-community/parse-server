// These methods handle the User-related routes.

import deepcopy       from 'deepcopy';
import Parse          from 'parse/node';
import Config         from '../Config';
import AccountLockout from '../AccountLockout';
import ClassesRouter  from './ClassesRouter';
import rest           from '../rest';
import Auth           from '../Auth';
import passwordCrypto from '../password';
import RestWrite      from '../RestWrite';
const cryptoUtils = require('../cryptoUtils');

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
    const data = deepcopy(req.body);
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
    const sessionToken = req.info.sessionToken;
    return rest.find(req.config, Auth.master(req.config), '_Session',
      { sessionToken },
      { include: 'user' }, req.info.clientSDK)
      .then((response) => {
        if (!response.results ||
          response.results.length == 0 ||
          !response.results[0].user) {
          throw new Parse.Error(Parse.Error.INVALID_SESSION_TOKEN, 'invalid session token');
        } else {
          const user = response.results[0].user;
          // Send token back on the login, because SDKs expect that.
          user.sessionToken = sessionToken;

          // Remove hidden properties.
          for (var key in user) {
            if (user.hasOwnProperty(key)) {
              // Regexp comes from Parse.Object.prototype.validate
              if (key !== "__type" && !(/^[A-Za-z][0-9A-Za-z_]*$/).test(key)) {
                delete user[key];
              }
            }
          }

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
        const accountLockoutPolicy = new AccountLockout(user, req.config);
        return accountLockoutPolicy.handleLoginAttempt(isValidPassword);
      })
      .then(() => {
        if (!isValidPassword) {
          throw new Parse.Error(Parse.Error.OBJECT_NOT_FOUND, 'Invalid username/password.');
        }

        // handle password expiry policy
        if (req.config.passwordPolicy && req.config.passwordPolicy.maxPasswordAge) {
          let changedAt = user._password_changed_at;

          if (!changedAt) {
            // password was created before expiry policy was enabled.
            // simply update _User object so that it will start enforcing from now
            changedAt = new Date();
            req.config.database.update('_User', {username: user.username},
              {_password_changed_at: Parse._encode(changedAt)});
          } else {
            // check whether the password has expired
            if (changedAt.__type == 'Date') {
              changedAt = new Date(changedAt.iso);
            }
            // Calculate the expiry time.
            const expiresAt = new Date(changedAt.getTime() + 86400000 * req.config.passwordPolicy.maxPasswordAge);
            if (expiresAt < new Date()) // fail of current time is past password expiry time
              throw new Parse.Error(Parse.Error.OBJECT_NOT_FOUND, 'Your password has expired. Please reset your password.');
          }
        }

        const token = 'r:' + cryptoUtils.newToken();
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

        const expiresAt = req.config.generateSessionExpiresAt();
        const sessionData = {
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

        const create = new RestWrite(req.config, Auth.master(req.config), '_Session', null, sessionData);
        return create.execute();
      }).then(() => {
        return { response: user };
      });
  }

  handleLogOut(req) {
    const success = {response: {}};
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

  _throwOnBadEmailConfig(req) {
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
        throw new Parse.Error(Parse.Error.INTERNAL_SERVER_ERROR, 'An appName, publicServerURL, and emailAdapter are required for password reset and email verification functionality.');
      } else {
        throw e;
      }
    }
  }

  handleResetRequest(req) {
    this._throwOnBadEmailConfig(req);

    const { email } = req.body;
    if (!email) {
      throw new Parse.Error(Parse.Error.EMAIL_MISSING, "you must provide an email");
    }
    if (typeof email !== 'string') {
      throw new Parse.Error(Parse.Error.INVALID_EMAIL_ADDRESS, 'you must provide a valid email string');
    }
    const userController = req.config.userController;
    return userController.sendPasswordResetEmail(email).then(() => {
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

  handleVerificationEmailRequest(req) {
    this._throwOnBadEmailConfig(req);

    const { email } = req.body;
    if (!email) {
      throw new Parse.Error(Parse.Error.EMAIL_MISSING, 'you must provide an email');
    }
    if (typeof email !== 'string') {
      throw new Parse.Error(Parse.Error.INVALID_EMAIL_ADDRESS, 'you must provide a valid email string');
    }

    return req.config.database.find('_User', { email: email }).then((results) => {
      if (!results.length || results.length < 1) {
        throw new Parse.Error(Parse.Error.EMAIL_NOT_FOUND, `No user found with email ${email}`);
      }
      const user = results[0];

      if (user.emailVerified) {
        throw new Parse.Error(Parse.Error.OTHER_CAUSE, `Email ${email} is already verified.`);
      }

      const userController = req.config.userController;
      userController.sendVerificationEmail(user);
      return { response: {} };
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
    this.route('POST', '/requestPasswordReset', req => { return this.handleResetRequest(req); });
    this.route('POST', '/verificationEmailRequest', req => { return this.handleVerificationEmailRequest(req); });
  }
}

export default UsersRouter;
