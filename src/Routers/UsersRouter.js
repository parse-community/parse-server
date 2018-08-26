// These methods handle the User-related routes.

import Parse from 'parse/node';
import Config from '../Config';
import ClassesRouter from './ClassesRouter';
import rest from '../rest';
import Auth from '../Auth';
import { logIn, logOut, removeHiddenProperties, verifyCredentials } from '../Controllers/UserAuthentication';

export class UsersRouter extends ClassesRouter {

  className() {
    return '_User';
  }

  /**
   * Removes all "_" prefixed properties from an object, except "__type"
   * @param {Object} obj An object.
   */
  static removeHiddenProperties(obj) {
    removeHiddenProperties(obj);
  }

  static extractLoginPayload(req): {username: ?string, email: ?string, password: ?string} {
    let payload = req.body;
    if (!payload.username && req.query.username || !payload.email && req.query.email) {
      payload = req.query;
    }
    const {
      username,
      email,
      password,
    } = payload;
    return {
      username,
      email,
      password
    }
  }

  handleMe(req) {
    if (!req.info || !req.info.sessionToken) {
      throw new Parse.Error(Parse.Error.INVALID_SESSION_TOKEN, 'Invalid session token');
    }
    const sessionToken = req.info.sessionToken;
    return rest.find(req.config, Auth.master(req.config), '_Session',
      { sessionToken },
      { include: 'user' }, req.info.clientSDK)
      .then((response) => {
        if (!response.results ||
          response.results.length == 0 ||
          !response.results[0].user) {
          throw new Parse.Error(Parse.Error.INVALID_SESSION_TOKEN, 'Invalid session token');
        } else {
          const user = response.results[0].user;
          // Send token back on the login, because SDKs expect that.
          user.sessionToken = sessionToken;

          // Remove hidden properties.
          UsersRouter.removeHiddenProperties(user);

          return { response: user };
        }
      });
  }

  async handleLogIn(req) {
    const payload = UsersRouter.extractLoginPayload(req);
    const user = await logIn(payload, req.config, req.auth, req.info.installationId);
    return {
      response: user
    };
  }

  async handleVerifyPassword(req) {
    const payload = UsersRouter.extractLoginPayload(req);
    const user = await verifyCredentials(payload, req.config, req.auth, req.info.installationId);
    UsersRouter.removeHiddenProperties(user);
    return { response: user };
  }

  async handleLogOut(req) {
    const success = { response: {} };
    const config = req.config;
    if (req.info && req.info.sessionToken) {
      const sessionToken = req.info.sessionToken;
      const clientSDK = req.info.clientSDK;
      logOut(sessionToken, config, clientSDK);
    }
    return success;
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

      // remove password field, messes with saving on postgres
      delete user.password;

      if (user.emailVerified) {
        throw new Parse.Error(Parse.Error.OTHER_CAUSE, `Email ${email} is already verified.`);
      }

      const userController = req.config.userController;
      return userController.regenerateEmailVerifyToken(user).then(() => {
        userController.sendVerificationEmail(user);
        return { response: {} };
      });
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
    this.route('POST', '/login', req => { return this.handleLogIn(req); });
    this.route('POST', '/logout', req => { return this.handleLogOut(req); });
    this.route('POST', '/requestPasswordReset', req => { return this.handleResetRequest(req); });
    this.route('POST', '/verificationEmailRequest', req => { return this.handleVerificationEmailRequest(req); });
    this.route('GET', '/verifyPassword', req => { return this.handleVerifyPassword(req); });
  }
}

export default UsersRouter;
