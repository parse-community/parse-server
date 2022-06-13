"use strict";

Object.defineProperty(exports, "__esModule", {
  value: true
});
exports.default = exports.UsersRouter = void 0;

var _node = _interopRequireDefault(require("parse/node"));

var _Config = _interopRequireDefault(require("../Config"));

var _AccountLockout = _interopRequireDefault(require("../AccountLockout"));

var _ClassesRouter = _interopRequireDefault(require("./ClassesRouter"));

var _rest = _interopRequireDefault(require("../rest"));

var _Auth = _interopRequireDefault(require("../Auth"));

var _password = _interopRequireDefault(require("../password"));

var _triggers = require("../triggers");

var _middlewares = require("../middlewares");

var _RestWrite = _interopRequireDefault(require("../RestWrite"));

var _WinstonLogger = require("../../lib/Adapters/Logger/WinstonLogger");

function _interopRequireDefault(obj) { return obj && obj.__esModule ? obj : { default: obj }; }

function ownKeys(object, enumerableOnly) { var keys = Object.keys(object); if (Object.getOwnPropertySymbols) { var symbols = Object.getOwnPropertySymbols(object); if (enumerableOnly) { symbols = symbols.filter(function (sym) { return Object.getOwnPropertyDescriptor(object, sym).enumerable; }); } keys.push.apply(keys, symbols); } return keys; }

function _objectSpread(target) { for (var i = 1; i < arguments.length; i++) { var source = arguments[i] != null ? arguments[i] : {}; if (i % 2) { ownKeys(Object(source), true).forEach(function (key) { _defineProperty(target, key, source[key]); }); } else if (Object.getOwnPropertyDescriptors) { Object.defineProperties(target, Object.getOwnPropertyDescriptors(source)); } else { ownKeys(Object(source)).forEach(function (key) { Object.defineProperty(target, key, Object.getOwnPropertyDescriptor(source, key)); }); } } return target; }

function _defineProperty(obj, key, value) { if (key in obj) { Object.defineProperty(obj, key, { value: value, enumerable: true, configurable: true, writable: true }); } else { obj[key] = value; } return obj; }

class UsersRouter extends _ClassesRouter.default {
  className() {
    return '_User';
  }
  /**
   * Removes all "_" prefixed properties from an object, except "__type"
   * @param {Object} obj An object.
   */


  static removeHiddenProperties(obj) {
    for (var key in obj) {
      if (Object.prototype.hasOwnProperty.call(obj, key)) {
        // Regexp comes from Parse.Object.prototype.validate
        if (key !== '__type' && !/^[A-Za-z][0-9A-Za-z_]*$/.test(key)) {
          delete obj[key];
        }
      }
    }
  }
  /**
   * After retrieving a user directly from the database, we need to remove the
   * password from the object (for security), and fix an issue some SDKs have
   * with null values
   */


  _sanitizeAuthData(user) {
    delete user.password; // Sometimes the authData still has null on that keys
    // https://github.com/parse-community/parse-server/issues/935

    if (user.authData) {
      Object.keys(user.authData).forEach(provider => {
        if (user.authData[provider] === null) {
          delete user.authData[provider];
        }
      });

      if (Object.keys(user.authData).length == 0) {
        delete user.authData;
      }
    }
  }
  /**
   * Validates a password request in login and verifyPassword
   * @param {Object} req The request
   * @returns {Object} User object
   * @private
   */


  _authenticateUserFromRequest(req) {
    return new Promise((resolve, reject) => {
      // Use query parameters instead if provided in url
      let payload = req.body;

      if (!payload.username && req.query && req.query.username || !payload.email && req.query && req.query.email) {
        payload = req.query;
      }

      const {
        username,
        email,
        password
      } = payload; // TODO: use the right error codes / descriptions.

      if (!username && !email) {
        throw new _node.default.Error(_node.default.Error.USERNAME_MISSING, 'username/email is required.');
      }

      if (!password) {
        throw new _node.default.Error(_node.default.Error.PASSWORD_MISSING, 'password is required.');
      }

      if (typeof password !== 'string' || email && typeof email !== 'string' || username && typeof username !== 'string') {
        throw new _node.default.Error(_node.default.Error.OBJECT_NOT_FOUND, 'Invalid username/password.');
      }

      let user;
      let isValidPassword = false;
      let query;

      if (email && username) {
        query = {
          email,
          username
        };
      } else if (email) {
        query = {
          email
        };
      } else {
        query = {
          $or: [{
            username
          }, {
            email: username
          }]
        };
      }

      return req.config.database.find('_User', query).then(results => {
        if (!results.length) {
          throw new _node.default.Error(_node.default.Error.OBJECT_NOT_FOUND, 'Invalid username/password.');
        }

        if (results.length > 1) {
          // corner case where user1 has username == user2 email
          req.config.loggerController.warn("There is a user which email is the same as another user's username, logging in based on username");
          user = results.filter(user => user.username === username)[0];
        } else {
          user = results[0];
        }

        return _password.default.compare(password, user.password);
      }).then(correct => {
        isValidPassword = correct;
        const accountLockoutPolicy = new _AccountLockout.default(user, req.config);
        return accountLockoutPolicy.handleLoginAttempt(isValidPassword);
      }).then(() => {
        if (!isValidPassword) {
          throw new _node.default.Error(_node.default.Error.OBJECT_NOT_FOUND, 'Invalid username/password.');
        } // Ensure the user isn't locked out
        // A locked out user won't be able to login
        // To lock a user out, just set the ACL to `masterKey` only  ({}).
        // Empty ACL is OK


        if (!req.auth.isMaster && user.ACL && Object.keys(user.ACL).length == 0) {
          throw new _node.default.Error(_node.default.Error.OBJECT_NOT_FOUND, 'Invalid username/password.');
        }

        if (req.config.verifyUserEmails && req.config.preventLoginWithUnverifiedEmail && !user.emailVerified) {
          throw new _node.default.Error(_node.default.Error.EMAIL_NOT_FOUND, 'User email is not verified.');
        }

        this._sanitizeAuthData(user);

        return resolve(user);
      }).catch(error => {
        return reject(error);
      });
    });
  }

  handleMe(req) {
    if (!req.info || !req.info.sessionToken) {
      throw new _node.default.Error(_node.default.Error.INVALID_SESSION_TOKEN, 'Invalid session token');
    }

    const sessionToken = req.info.sessionToken;
    return _rest.default.find(req.config, _Auth.default.master(req.config), '_Session', {
      sessionToken
    }, {
      include: 'user'
    }, req.info.clientSDK, req.info.context).then(response => {
      if (!response.results || response.results.length == 0 || !response.results[0].user) {
        throw new _node.default.Error(_node.default.Error.INVALID_SESSION_TOKEN, 'Invalid session token');
      } else {
        const user = response.results[0].user; // Send token back on the login, because SDKs expect that.

        user.sessionToken = sessionToken; // Remove hidden properties.

        UsersRouter.removeHiddenProperties(user);
        return {
          response: user
        };
      }
    });
  }

  async handleLogIn(req) {
    const user = await this._authenticateUserFromRequest(req);
    const authData = req.body && req.body.authData; // Check if user has provided their required auth providers

    _Auth.default.checkIfUserHasProvidedConfiguredProvidersForLogin(authData, user.authData, req.config);

    let authDataResponse;
    let validatedAuthData;

    if (authData) {
      const res = await _Auth.default.handleAuthDataValidation(authData, new _RestWrite.default(req.config, req.auth, '_User', {
        objectId: user.objectId
      }, req.body, user, req.info.clientSDK, req.info.context), user);
      authDataResponse = res.authDataResponse;
      validatedAuthData = res.authData;
    } // handle password expiry policy


    if (req.config.passwordPolicy && req.config.passwordPolicy.maxPasswordAge) {
      let changedAt = user._password_changed_at;

      if (!changedAt) {
        // password was created before expiry policy was enabled.
        // simply update _User object so that it will start enforcing from now
        changedAt = new Date();
        req.config.database.update('_User', {
          username: user.username
        }, {
          _password_changed_at: _node.default._encode(changedAt)
        });
      } else {
        // check whether the password has expired
        if (changedAt.__type == 'Date') {
          changedAt = new Date(changedAt.iso);
        } // Calculate the expiry time.


        const expiresAt = new Date(changedAt.getTime() + 86400000 * req.config.passwordPolicy.maxPasswordAge);
        if (expiresAt < new Date()) // fail of current time is past password expiry time
          throw new _node.default.Error(_node.default.Error.OBJECT_NOT_FOUND, 'Your password has expired. Please reset your password.');
      }
    } // Remove hidden properties.


    UsersRouter.removeHiddenProperties(user);
    req.config.filesController.expandFilesInObject(req.config, user); // Before login trigger; throws if failure

    await (0, _triggers.maybeRunTrigger)(_triggers.Types.beforeLogin, req.auth, _node.default.User.fromJSON(Object.assign({
      className: '_User'
    }, user)), null, req.config); // If we have some new validated authData update directly

    if (validatedAuthData && Object.keys(validatedAuthData).length) {
      await req.config.database.update('_User', {
        objectId: user.objectId
      }, {
        authData: validatedAuthData
      }, {});
    }

    const {
      sessionData,
      createSession
    } = _RestWrite.default.createSession(req.config, {
      userId: user.objectId,
      createdWith: {
        action: 'login',
        authProvider: 'password'
      },
      installationId: req.info.installationId
    });

    user.sessionToken = sessionData.sessionToken;
    await createSession();

    const afterLoginUser = _node.default.User.fromJSON(Object.assign({
      className: '_User'
    }, user));

    (0, _triggers.maybeRunTrigger)(_triggers.Types.afterLogin, _objectSpread(_objectSpread({}, req.auth), {}, {
      user: afterLoginUser
    }), afterLoginUser, null, req.config);

    if (authDataResponse) {
      user.authDataResponse = authDataResponse;
    }

    return {
      response: user
    };
  }
  /**
   * This allows master-key clients to create user sessions without access to
   * user credentials. This enables systems that can authenticate access another
   * way (API key, app administrators) to act on a user's behalf.
   *
   * We create a new session rather than looking for an existing session; we
   * want this to work in situations where the user is logged out on all
   * devices, since this can be used by automated systems acting on the user's
   * behalf.
   *
   * For the moment, we're omitting event hooks and lockout checks, since
   * immediate use cases suggest /loginAs could be used for semantically
   * different reasons from /login
   */


  async handleLogInAs(req) {
    if (!req.auth.isMaster) {
      throw new _node.default.Error(_node.default.Error.OPERATION_FORBIDDEN, 'master key is required');
    }

    const userId = req.body.userId || req.query.userId;

    if (!userId) {
      throw new _node.default.Error(_node.default.Error.INVALID_VALUE, 'userId must not be empty, null, or undefined');
    }

    const queryResults = await req.config.database.find('_User', {
      objectId: userId
    });
    const user = queryResults[0];

    if (!user) {
      throw new _node.default.Error(_node.default.Error.OBJECT_NOT_FOUND, 'user not found');
    }

    this._sanitizeAuthData(user);

    const {
      sessionData,
      createSession
    } = _RestWrite.default.createSession(req.config, {
      userId,
      createdWith: {
        action: 'login',
        authProvider: 'masterkey'
      },
      installationId: req.info.installationId
    });

    user.sessionToken = sessionData.sessionToken;
    await createSession();
    return {
      response: user
    };
  }

  handleVerifyPassword(req) {
    return this._authenticateUserFromRequest(req).then(user => {
      // Remove hidden properties.
      UsersRouter.removeHiddenProperties(user);
      return {
        response: user
      };
    }).catch(error => {
      throw error;
    });
  }

  handleLogOut(req) {
    const success = {
      response: {}
    };

    if (req.info && req.info.sessionToken) {
      return _rest.default.find(req.config, _Auth.default.master(req.config), '_Session', {
        sessionToken: req.info.sessionToken
      }, undefined, req.info.clientSDK, req.info.context).then(records => {
        if (records.results && records.results.length) {
          return _rest.default.del(req.config, _Auth.default.master(req.config), '_Session', records.results[0].objectId, req.info.context).then(() => {
            this._runAfterLogoutTrigger(req, records.results[0]);

            return Promise.resolve(success);
          });
        }

        return Promise.resolve(success);
      });
    }

    return Promise.resolve(success);
  }

  _runAfterLogoutTrigger(req, session) {
    // After logout trigger
    (0, _triggers.maybeRunTrigger)(_triggers.Types.afterLogout, req.auth, _node.default.Session.fromJSON(Object.assign({
      className: '_Session'
    }, session)), null, req.config);
  }

  _throwOnBadEmailConfig(req) {
    try {
      _Config.default.validateEmailConfiguration({
        emailAdapter: req.config.userController.adapter,
        appName: req.config.appName,
        publicServerURL: req.config.publicServerURL,
        emailVerifyTokenValidityDuration: req.config.emailVerifyTokenValidityDuration,
        emailVerifyTokenReuseIfValid: req.config.emailVerifyTokenReuseIfValid
      });
    } catch (e) {
      if (typeof e === 'string') {
        // Maybe we need a Bad Configuration error, but the SDKs won't understand it. For now, Internal Server Error.
        throw new _node.default.Error(_node.default.Error.INTERNAL_SERVER_ERROR, 'An appName, publicServerURL, and emailAdapter are required for password reset and email verification functionality.');
      } else {
        throw e;
      }
    }
  }

  handleResetRequest(req) {
    this._throwOnBadEmailConfig(req);

    const {
      email
    } = req.body;

    if (!email) {
      throw new _node.default.Error(_node.default.Error.EMAIL_MISSING, 'you must provide an email');
    }

    if (typeof email !== 'string') {
      throw new _node.default.Error(_node.default.Error.INVALID_EMAIL_ADDRESS, 'you must provide a valid email string');
    }

    const userController = req.config.userController;
    return userController.sendPasswordResetEmail(email).then(() => {
      return Promise.resolve({
        response: {}
      });
    }, err => {
      if (err.code === _node.default.Error.OBJECT_NOT_FOUND) {
        // Return success so that this endpoint can't
        // be used to enumerate valid emails
        return Promise.resolve({
          response: {}
        });
      } else {
        throw err;
      }
    });
  }

  handleVerificationEmailRequest(req) {
    this._throwOnBadEmailConfig(req);

    const {
      email
    } = req.body;

    if (!email) {
      throw new _node.default.Error(_node.default.Error.EMAIL_MISSING, 'you must provide an email');
    }

    if (typeof email !== 'string') {
      throw new _node.default.Error(_node.default.Error.INVALID_EMAIL_ADDRESS, 'you must provide a valid email string');
    }

    return req.config.database.find('_User', {
      email: email
    }).then(results => {
      if (!results.length || results.length < 1) {
        throw new _node.default.Error(_node.default.Error.EMAIL_NOT_FOUND, `No user found with email ${email}`);
      }

      const user = results[0]; // remove password field, messes with saving on postgres

      delete user.password;

      if (user.emailVerified) {
        throw new _node.default.Error(_node.default.Error.OTHER_CAUSE, `Email ${email} is already verified.`);
      }

      const userController = req.config.userController;
      return userController.regenerateEmailVerifyToken(user).then(() => {
        userController.sendVerificationEmail(user);
        return {
          response: {}
        };
      });
    });
  }

  async handleChallenge(req) {
    const {
      username,
      email,
      password,
      authData,
      challengeData
    } = req.body; // if username or email provided with password try to authenticate the user by username

    let user;

    if (username || email) {
      if (!password) throw new _node.default.Error(_node.default.Error.OTHER_CAUSE, 'You provided username or email, you need to also provide password.');
      user = await this._authenticateUserFromRequest(req);
    }

    if (!challengeData) throw new _node.default.Error(_node.default.Error.OTHER_CAUSE, 'Nothing to challenge.');
    if (typeof challengeData !== 'object') throw new _node.default.Error(_node.default.Error.OTHER_CAUSE, 'challengeData should be an object.');
    let request;
    let parseUser; // Try to find user by authData

    if (authData) {
      if (typeof authData !== 'object') {
        throw new _node.default.Error(_node.default.Error.OTHER_CAUSE, 'authData should be an object.');
      }

      if (user) {
        throw new _node.default.Error(_node.default.Error.OTHER_CAUSE, 'You cant provide username/email and authData, only use one identification method.');
      }

      if (Object.keys(authData).filter(key => authData[key].id).length > 1) {
        throw new _node.default.Error(_node.default.Error.OTHER_CAUSE, 'You cant provide more than one authData provider with an id.');
      }

      const results = await _Auth.default.findUsersWithAuthData(req.config, authData);

      try {
        if (!results[0] || results.length > 1) {
          throw new _node.default.Error(_node.default.Error.OTHER_CAUSE, 'User not found.');
        } // Find the provider used to find the user


        const provider = Object.keys(authData).find(key => authData[key].id);
        parseUser = _node.default.User.fromJSON(_objectSpread({
          className: '_User'
        }, results[0]));
        request = (0, _triggers.getRequestObject)(undefined, req.auth, parseUser, parseUser, req.config);
        request.isChallenge = true; // Validate authData used to identify the user to avoid brute-force attack on `id`

        const {
          validator
        } = req.config.authDataManager.getValidatorForProvider(provider);
        await validator(authData[provider], req, parseUser, request);
      } catch (e) {
        // Rewrite the error to avoid guess id attack
        _WinstonLogger.logger.error(e);

        throw new _node.default.Error(_node.default.Error.OTHER_CAUSE, 'User not found.');
      }
    }

    if (!parseUser) {
      parseUser = user ? _node.default.User.fromJSON(_objectSpread({
        className: '_User'
      }, user)) : undefined;
    }

    if (!request) {
      request = (0, _triggers.getRequestObject)(undefined, req.auth, parseUser, parseUser, req.config);
      request.isChallenge = true;
    } // Execute challenge step-by-step with consistent order for better error feedback
    // and to avoid to trigger others challenges if one of them fails


    const challenge = await _Auth.default.reducePromise(Object.keys(challengeData).sort(), async (acc, provider) => {
      const authAdapter = req.config.authDataManager.getValidatorForProvider(provider);
      if (!authAdapter) return acc;
      const {
        adapter: {
          challenge
        }
      } = authAdapter;

      if (typeof challenge === 'function') {
        const providerChallengeResponse = await challenge(challengeData[provider], authData && authData[provider], req.config.auth[provider], request, req.config);
        acc[provider] = providerChallengeResponse || true;
        return acc;
      }
    }, {});
    return {
      response: {
        challengeData: challenge
      }
    };
  }

  mountRoutes() {
    this.route('GET', '/users', req => {
      return this.handleFind(req);
    });
    this.route('POST', '/users', _middlewares.promiseEnsureIdempotency, req => {
      return this.handleCreate(req);
    });
    this.route('GET', '/users/me', req => {
      return this.handleMe(req);
    });
    this.route('GET', '/users/:objectId', req => {
      return this.handleGet(req);
    });
    this.route('PUT', '/users/:objectId', _middlewares.promiseEnsureIdempotency, req => {
      return this.handleUpdate(req);
    });
    this.route('DELETE', '/users/:objectId', req => {
      return this.handleDelete(req);
    });
    this.route('GET', '/login', req => {
      return this.handleLogIn(req);
    });
    this.route('POST', '/login', req => {
      return this.handleLogIn(req);
    });
    this.route('POST', '/loginAs', req => {
      return this.handleLogInAs(req);
    });
    this.route('POST', '/logout', req => {
      return this.handleLogOut(req);
    });
    this.route('POST', '/requestPasswordReset', req => {
      return this.handleResetRequest(req);
    });
    this.route('POST', '/verificationEmailRequest', req => {
      return this.handleVerificationEmailRequest(req);
    });
    this.route('GET', '/verifyPassword', req => {
      return this.handleVerifyPassword(req);
    });
    this.route('POST', '/challenge', req => {
      return this.handleChallenge(req);
    });
  }

}

exports.UsersRouter = UsersRouter;
var _default = UsersRouter;
exports.default = _default;
//# sourceMappingURL=data:application/json;charset=utf-8;base64,eyJ2ZXJzaW9uIjozLCJzb3VyY2VzIjpbIi4uLy4uL3NyYy9Sb3V0ZXJzL1VzZXJzUm91dGVyLmpzIl0sIm5hbWVzIjpbIlVzZXJzUm91dGVyIiwiQ2xhc3Nlc1JvdXRlciIsImNsYXNzTmFtZSIsInJlbW92ZUhpZGRlblByb3BlcnRpZXMiLCJvYmoiLCJrZXkiLCJPYmplY3QiLCJwcm90b3R5cGUiLCJoYXNPd25Qcm9wZXJ0eSIsImNhbGwiLCJ0ZXN0IiwiX3Nhbml0aXplQXV0aERhdGEiLCJ1c2VyIiwicGFzc3dvcmQiLCJhdXRoRGF0YSIsImtleXMiLCJmb3JFYWNoIiwicHJvdmlkZXIiLCJsZW5ndGgiLCJfYXV0aGVudGljYXRlVXNlckZyb21SZXF1ZXN0IiwicmVxIiwiUHJvbWlzZSIsInJlc29sdmUiLCJyZWplY3QiLCJwYXlsb2FkIiwiYm9keSIsInVzZXJuYW1lIiwicXVlcnkiLCJlbWFpbCIsIlBhcnNlIiwiRXJyb3IiLCJVU0VSTkFNRV9NSVNTSU5HIiwiUEFTU1dPUkRfTUlTU0lORyIsIk9CSkVDVF9OT1RfRk9VTkQiLCJpc1ZhbGlkUGFzc3dvcmQiLCIkb3IiLCJjb25maWciLCJkYXRhYmFzZSIsImZpbmQiLCJ0aGVuIiwicmVzdWx0cyIsImxvZ2dlckNvbnRyb2xsZXIiLCJ3YXJuIiwiZmlsdGVyIiwicGFzc3dvcmRDcnlwdG8iLCJjb21wYXJlIiwiY29ycmVjdCIsImFjY291bnRMb2Nrb3V0UG9saWN5IiwiQWNjb3VudExvY2tvdXQiLCJoYW5kbGVMb2dpbkF0dGVtcHQiLCJhdXRoIiwiaXNNYXN0ZXIiLCJBQ0wiLCJ2ZXJpZnlVc2VyRW1haWxzIiwicHJldmVudExvZ2luV2l0aFVudmVyaWZpZWRFbWFpbCIsImVtYWlsVmVyaWZpZWQiLCJFTUFJTF9OT1RfRk9VTkQiLCJjYXRjaCIsImVycm9yIiwiaGFuZGxlTWUiLCJpbmZvIiwic2Vzc2lvblRva2VuIiwiSU5WQUxJRF9TRVNTSU9OX1RPS0VOIiwicmVzdCIsIkF1dGgiLCJtYXN0ZXIiLCJpbmNsdWRlIiwiY2xpZW50U0RLIiwiY29udGV4dCIsInJlc3BvbnNlIiwiaGFuZGxlTG9nSW4iLCJjaGVja0lmVXNlckhhc1Byb3ZpZGVkQ29uZmlndXJlZFByb3ZpZGVyc0ZvckxvZ2luIiwiYXV0aERhdGFSZXNwb25zZSIsInZhbGlkYXRlZEF1dGhEYXRhIiwicmVzIiwiaGFuZGxlQXV0aERhdGFWYWxpZGF0aW9uIiwiUmVzdFdyaXRlIiwib2JqZWN0SWQiLCJwYXNzd29yZFBvbGljeSIsIm1heFBhc3N3b3JkQWdlIiwiY2hhbmdlZEF0IiwiX3Bhc3N3b3JkX2NoYW5nZWRfYXQiLCJEYXRlIiwidXBkYXRlIiwiX2VuY29kZSIsIl9fdHlwZSIsImlzbyIsImV4cGlyZXNBdCIsImdldFRpbWUiLCJmaWxlc0NvbnRyb2xsZXIiLCJleHBhbmRGaWxlc0luT2JqZWN0IiwiVHJpZ2dlclR5cGVzIiwiYmVmb3JlTG9naW4iLCJVc2VyIiwiZnJvbUpTT04iLCJhc3NpZ24iLCJzZXNzaW9uRGF0YSIsImNyZWF0ZVNlc3Npb24iLCJ1c2VySWQiLCJjcmVhdGVkV2l0aCIsImFjdGlvbiIsImF1dGhQcm92aWRlciIsImluc3RhbGxhdGlvbklkIiwiYWZ0ZXJMb2dpblVzZXIiLCJhZnRlckxvZ2luIiwiaGFuZGxlTG9nSW5BcyIsIk9QRVJBVElPTl9GT1JCSURERU4iLCJJTlZBTElEX1ZBTFVFIiwicXVlcnlSZXN1bHRzIiwiaGFuZGxlVmVyaWZ5UGFzc3dvcmQiLCJoYW5kbGVMb2dPdXQiLCJzdWNjZXNzIiwidW5kZWZpbmVkIiwicmVjb3JkcyIsImRlbCIsIl9ydW5BZnRlckxvZ291dFRyaWdnZXIiLCJzZXNzaW9uIiwiYWZ0ZXJMb2dvdXQiLCJTZXNzaW9uIiwiX3Rocm93T25CYWRFbWFpbENvbmZpZyIsIkNvbmZpZyIsInZhbGlkYXRlRW1haWxDb25maWd1cmF0aW9uIiwiZW1haWxBZGFwdGVyIiwidXNlckNvbnRyb2xsZXIiLCJhZGFwdGVyIiwiYXBwTmFtZSIsInB1YmxpY1NlcnZlclVSTCIsImVtYWlsVmVyaWZ5VG9rZW5WYWxpZGl0eUR1cmF0aW9uIiwiZW1haWxWZXJpZnlUb2tlblJldXNlSWZWYWxpZCIsImUiLCJJTlRFUk5BTF9TRVJWRVJfRVJST1IiLCJoYW5kbGVSZXNldFJlcXVlc3QiLCJFTUFJTF9NSVNTSU5HIiwiSU5WQUxJRF9FTUFJTF9BRERSRVNTIiwic2VuZFBhc3N3b3JkUmVzZXRFbWFpbCIsImVyciIsImNvZGUiLCJoYW5kbGVWZXJpZmljYXRpb25FbWFpbFJlcXVlc3QiLCJPVEhFUl9DQVVTRSIsInJlZ2VuZXJhdGVFbWFpbFZlcmlmeVRva2VuIiwic2VuZFZlcmlmaWNhdGlvbkVtYWlsIiwiaGFuZGxlQ2hhbGxlbmdlIiwiY2hhbGxlbmdlRGF0YSIsInJlcXVlc3QiLCJwYXJzZVVzZXIiLCJpZCIsImZpbmRVc2Vyc1dpdGhBdXRoRGF0YSIsImlzQ2hhbGxlbmdlIiwidmFsaWRhdG9yIiwiYXV0aERhdGFNYW5hZ2VyIiwiZ2V0VmFsaWRhdG9yRm9yUHJvdmlkZXIiLCJsb2dnZXIiLCJjaGFsbGVuZ2UiLCJyZWR1Y2VQcm9taXNlIiwic29ydCIsImFjYyIsImF1dGhBZGFwdGVyIiwicHJvdmlkZXJDaGFsbGVuZ2VSZXNwb25zZSIsIm1vdW50Um91dGVzIiwicm91dGUiLCJoYW5kbGVGaW5kIiwicHJvbWlzZUVuc3VyZUlkZW1wb3RlbmN5IiwiaGFuZGxlQ3JlYXRlIiwiaGFuZGxlR2V0IiwiaGFuZGxlVXBkYXRlIiwiaGFuZGxlRGVsZXRlIl0sIm1hcHBpbmdzIjoiOzs7Ozs7O0FBRUE7O0FBQ0E7O0FBQ0E7O0FBQ0E7O0FBQ0E7O0FBQ0E7O0FBQ0E7O0FBQ0E7O0FBQ0E7O0FBQ0E7O0FBQ0E7Ozs7Ozs7Ozs7QUFFTyxNQUFNQSxXQUFOLFNBQTBCQyxzQkFBMUIsQ0FBd0M7QUFDN0NDLEVBQUFBLFNBQVMsR0FBRztBQUNWLFdBQU8sT0FBUDtBQUNEO0FBRUQ7QUFDRjtBQUNBO0FBQ0E7OztBQUMrQixTQUF0QkMsc0JBQXNCLENBQUNDLEdBQUQsRUFBTTtBQUNqQyxTQUFLLElBQUlDLEdBQVQsSUFBZ0JELEdBQWhCLEVBQXFC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QU8sS0FBSytHLGtCQUFMLENBQXdCL0csR0FBeEIsQ0FBUDtBQUNELEtBRkQ7QUFHQSxTQUFLMkksS0FBTCxDQUFXLE1BQVgsRUFBbUIsMkJBQW5CLEVBQWdEM0ksR0FBRyxJQUFJO0FBQ3JELGFBQU8sS0FBS3FILDhCQUFMLENBQW9DckgsR0FBcEMsQ0FBUDtBQUNELEtBRkQ7QUFHQSxTQUFLMkksS0FBTCxDQUFXLEtBQVgsRUFBa0IsaUJBQWxCLEVBQXFDM0ksR0FBRyxJQUFJO0FBQzFDLGFBQU8sS0FBS3lGLG9CQUFMLENBQTBCekYsR0FBMUIsQ0FBUDtBQUNELEtBRkQ7QUFHQSxTQUFLMkksS0FBTCxDQUFXLE1BQVgsRUFBbUIsWUFBbkIsRUFBaUMzSSxHQUFHLElBQUk7QUFDdEMsYUFBTyxLQUFLeUgsZUFBTCxDQUFxQnpILEdBQXJCLENBQVA7QUFDRCxLQUZEO0FBR0Q7O0FBOW1CNEM7OztlQWluQmhDcEIsVyIsInNvdXJjZXNDb250ZW50IjpbIi8vIFRoZXNlIG1ldGhvZHMgaGFuZGxlIHRoZSBVc2VyLXJlbGF0ZWQgcm91dGVzLlxuXG5pbXBvcnQgUGFyc2UgZnJvbSAncGFyc2Uvbm9kZSc7XG5pbXBvcnQgQ29uZmlnIGZyb20gJy4uL0NvbmZpZyc7XG5pbXBvcnQgQWNjb3VudExvY2tvdXQgZnJvbSAnLi4vQWNjb3VudExvY2tvdXQnO1xuaW1wb3J0IENsYXNzZXNSb3V0ZXIgZnJvbSAnLi9DbGFzc2VzUm91dGVyJztcbmltcG9ydCByZXN0IGZyb20gJy4uL3Jlc3QnO1xuaW1wb3J0IEF1dGggZnJvbSAnLi4vQXV0aCc7XG5pbXBvcnQgcGFzc3dvcmRDcnlwdG8gZnJvbSAnLi4vcGFzc3dvcmQnO1xuaW1wb3J0IHsgbWF5YmVSdW5UcmlnZ2VyLCBUeXBlcyBhcyBUcmlnZ2VyVHlwZXMsIGdldFJlcXVlc3RPYmplY3QgfSBmcm9tICcuLi90cmlnZ2Vycyc7XG5pbXBvcnQgeyBwcm9taXNlRW5zdXJlSWRlbXBvdGVuY3kgfSBmcm9tICcuLi9taWRkbGV3YXJlcyc7XG5pbXBvcnQgUmVzdFdyaXRlIGZyb20gJy4uL1Jlc3RXcml0ZSc7XG5pbXBvcnQgeyBsb2dnZXIgfSBmcm9tICcuLi8uLi9saWIvQWRhcHRlcnMvTG9nZ2VyL1dpbnN0b25Mb2dnZXInO1xuXG5leHBvcnQgY2xhc3MgVXNlcnNSb3V0ZXIgZXh0ZW5kcyBDbGFzc2VzUm91dGVyIHtcbiAgY2xhc3NOYW1lKCkge1xuICAgIHJldHVybiAnX1VzZXInO1xuICB9XG5cbiAgLyoqXG4gICAqIFJlbW92ZXMgYWxsIFwiX1wiIHByZWZpeGVkIHByb3BlcnRpZXMgZnJvbSBhbiBvYmplY3QsIGV4Y2VwdCBcIl9fdHlwZVwiXG4gICAqIEBwYXJhbSB7T2JqZWN0fSBvYmogQW4gb2JqZWN0LlxuICAgKi9cbiAgc3RhdGljIHJlbW92ZUhpZGRlblByb3BlcnRpZXMob2JqKSB7XG4gICAgZm9yICh2YXIga2V5IGluIG9iaikge1xuICAgICAgaWYgKE9iamVjdC5wcm90b3R5cGUuaGFzT3duUHJvcGVydHkuY2FsbChvYmosIGtleSkpIHtcbiAgICAgICAgLy8gUmVnZXhwIGNvbWVzIGZyb20gUGFyc2UuT2JqZWN0LnByb3RvdHlwZS52YWxpZGF0ZVxuICAgICAgICBpZiAoa2V5ICE9PSAnX190eXBlJyAmJiAhL15bQS1aYS16XVswLTlBLVphLXpfXSokLy50ZXN0KGtleSkpIHtcbiAgICAgICAgICBkZWxldGUgb2JqW2tleV07XG4gICAgICAgIH1cbiAgICAgIH1cbiAgICB9XG4gIH1cblxuICAvKipcbiAgICogQWZ0ZXIgcmV0cmlldmluZyBhIHVzZXIgZGlyZWN0bHkgZnJvbSB0aGUgZGF0YWJhc2UsIHdlIG5lZWQgdG8gcmVtb3ZlIHRoZVxuICAgKiBwYXNzd29yZCBmcm9tIHRoZSBvYmplY3QgKGZvciBzZWN1cml0eSksIGFuZCBmaXggYW4gaXNzdWUgc29tZSBTREtzIGhhdmVcbiAgICogd2l0aCBudWxsIHZhbHVlc1xuICAgKi9cbiAgX3Nhbml0aXplQXV0aERhdGEodXNlcikge1xuICAgIGRlbGV0ZSB1c2VyLnBhc3N3b3JkO1xuXG4gICAgLy8gU29tZXRpbWVzIHRoZSBhdXRoRGF0YSBzdGlsbCBoYXMgbnVsbCBvbiB0aGF0IGtleXNcbiAgICAvLyBodHRwczovL2dpdGh1Yi5jb20vcGFyc2UtY29tbXVuaXR5L3BhcnNlLXNlcnZlci9pc3N1ZXMvOTM1XG4gICAgaWYgKHVzZXIuYXV0aERhdGEpIHtcbiAgICAgIE9iamVjdC5rZXlzKHVzZXIuYXV0aERhdGEpLmZvckVhY2gocHJvdmlkZXIgPT4ge1xuICAgICAgICBpZiAodXNlci5hdXRoRGF0YVtwcm92aWRlcl0gPT09IG51bGwpIHtcbiAgICAgICAgICBkZWxldGUgdXNlci5hdXRoRGF0YVtwcm92aWRlcl07XG4gICAgICAgIH1cbiAgICAgIH0pO1xuICAgICAgaWYgKE9iamVjdC5rZXlzKHVzZXIuYXV0aERhdGEpLmxlbmd0aCA9PSAwKSB7XG4gICAgICAgIGRlbGV0ZSB1c2VyLmF1dGhEYXRhO1xuICAgICAgfVxuICAgIH1cbiAgfVxuXG4gIC8qKlxuICAgKiBWYWxpZGF0ZXMgYSBwYXNzd29yZCByZXF1ZXN0IGluIGxvZ2luIGFuZCB2ZXJpZnlQYXNzd29yZFxuICAgKiBAcGFyYW0ge09iamVjdH0gcmVxIFRoZSByZXF1ZXN0XG4gICAqIEByZXR1cm5zIHtPYmplY3R9IFVzZXIgb2JqZWN0XG4gICAqIEBwcml2YXRlXG4gICAqL1xuICBfYXV0aGVudGljYXRlVXNlckZyb21SZXF1ZXN0KHJlcSkge1xuICAgIHJldHVybiBuZXcgUHJvbWlzZSgocmVzb2x2ZSwgcmVqZWN0KSA9PiB7XG4gICAgICAvLyBVc2UgcXVlcnkgcGFyYW1ldGVycyBpbnN0ZWFkIGlmIHByb3ZpZGVkIGluIHVybFxuICAgICAgbGV0IHBheWxvYWQgPSByZXEuYm9keTtcbiAgICAgIGlmIChcbiAgICAgICAgKCFwYXlsb2FkLnVzZXJuYW1lICYmIHJlcS5xdWVyeSAmJiByZXEucXVlcnkudXNlcm5hbWUpIHx8XG4gICAgICAgICghcGF5bG9hZC5lbWFpbCAmJiByZXEucXVlcnkgJiYgcmVxLnF1ZXJ5LmVtYWlsKVxuICAgICAgKSB7XG4gICAgICAgIHBheWxvYWQgPSByZXEucXVlcnk7XG4gICAgICB9XG4gICAgICBjb25zdCB7IHVzZXJuYW1lLCBlbWFpbCwgcGFzc3dvcmQgfSA9IHBheWxvYWQ7XG5cbiAgICAgIC8vIFRPRE86IHVzZSB0aGUgcmlnaHQgZXJyb3IgY29kZXMgLyBkZXNjcmlwdGlvbnMuXG4gICAgICBpZiAoIXVzZXJuYW1lICYmICFlbWFpbCkge1xuICAgICAgICB0aHJvdyBuZXcgUGFyc2UuRXJyb3IoUGFyc2UuRXJyb3IuVVNFUk5BTUVfTUlTU0lORywgJ3VzZXJuYW1lL2VtYWlsIGlzIHJlcXVpcmVkLicpO1xuICAgICAgfVxuICAgICAgaWYgKCFwYXNzd29yZCkge1xuICAgICAgICB0aHJvdyBuZXcgUGFyc2UuRXJyb3IoUGFyc2UuRXJyb3IuUEFTU1dPUkRfTUlTU0lORywgJ3Bhc3N3b3JkIGlzIHJlcXVpcmVkLicpO1xuICAgICAgfVxuICAgICAgaWYgKFxuICAgICAgICB0eXBlb2YgcGFzc3dvcmQgIT09ICdzdHJpbmcnIHx8XG4gICAgICAgIChlbWFpbCAmJiB0eXBlb2YgZW1haWwgIT09ICdzdHJpbmcnKSB8fFxuICAgICAgICAodXNlcm5hbWUgJiYgdHlwZW9mIHVzZXJuYW1lICE9PSAnc3RyaW5nJylcbiAgICAgICkge1xuICAgICAgICB0aHJvdyBuZXcgUGFyc2UuRXJyb3IoUGFyc2UuRXJyb3IuT0JKRUNUX05PVF9GT1VORCwgJ0ludmFsaWQgdXNlcm5hbWUvcGFzc3dvcmQuJyk7XG4gICAgICB9XG5cbiAgICAgIGxldCB1c2VyO1xuICAgICAgbGV0IGlzVmFsaWRQYXNzd29yZCA9IGZhbHNlO1xuICAgICAgbGV0IHF1ZXJ5O1xuICAgICAgaWYgKGVtYWlsICYmIHVzZXJuYW1lKSB7XG4gICAgICAgIHF1ZXJ5ID0geyBlbWFpbCwgdXNlcm5hbWUgfTtcbiAgICAgIH0gZWxzZSBpZiAoZW1haWwpIHtcbiAgICAgICAgcXVlcnkgPSB7IGVtYWlsIH07XG4gICAgICB9IGVsc2Uge1xuICAgICAgICBxdWVyeSA9IHsgJG9yOiBbeyB1c2VybmFtZSB9LCB7IGVtYWlsOiB1c2VybmFtZSB9XSB9O1xuICAgICAgfVxuICAgICAgcmV0dXJuIHJlcS5jb25maWcuZGF0YWJhc2VcbiAgICAgICAgLmZpbmQoJ19Vc2VyJywgcXVlcnkpXG4gICAgICAgIC50aGVuKHJlc3VsdHMgPT4ge1xuICAgICAgICAgIGlmICghcmVzdWx0cy5sZW5ndGgpIHtcbiAgICAgICAgICAgIHRocm93IG5ldyBQYXJzZS5FcnJvcihQYXJzZS5FcnJvci5PQkpFQ1RfTk9UX0ZPVU5ELCAnSW52YWxpZCB1c2VybmFtZS9wYXNzd29yZC4nKTtcbiAgICAgICAgICB9XG5cbiAgICAgICAgICBpZiAocmVzdWx0cy5sZW5ndGggPiAxKSB7XG4gICAgICAgICAgICAvLyBjb3JuZXIgY2FzZSB3aGVyZSB1c2VyMSBoYXMgdXNlcm5hbWUgPT0gdXNlcjIgZW1haWxcbiAgICAgICAgICAgIHJlcS5jb25maWcubG9nZ2VyQ29udHJvbGxlci53YXJuKFxuICAgICAgICAgICAgICBcIlRoZXJlIGlzIGEgdXNlciB3aGljaCBlbWFpbCBpcyB0aGUgc2FtZSBhcyBhbm90aGVyIHVzZXIncyB1c2VybmFtZSwgbG9nZ2luZyBpbiBiYXNlZCBvbiB1c2VybmFtZVwiXG4gICAgICAgICAgICApO1xuICAgICAgICAgICAgdXNlciA9IHJlc3VsdHMuZmlsdGVyKHVzZXIgPT4gdXNlci51c2VybmFtZSA9PT0gdXNlcm5hbWUpWzBdO1xuICAgICAgICAgIH0gZWxzZSB7XG4gICAgICAgICAgICB1c2VyID0gcmVzdWx0c1swXTtcbiAgICAgICAgICB9XG5cbiAgICAgICAgICByZXR1cm4gcGFzc3dvcmRDcnlwdG8uY29tcGFyZShwYXNzd29yZCwgdXNlci5wYXNzd29yZCk7XG4gICAgICAgIH0pXG4gICAgICAgIC50aGVuKGNvcnJlY3QgPT4ge1xuICAgICAgICAgIGlzVmFsaWRQYXNzd29yZCA9IGNvcnJlY3Q7XG4gICAgICAgICAgY29uc3QgYWNjb3VudExvY2tvdXRQb2xpY3kgPSBuZXcgQWNjb3VudExvY2tvdXQodXNlciwgcmVxLmNvbmZpZyk7XG4gICAgICAgICAgcmV0dXJuIGFjY291bnRMb2Nrb3V0UG9saWN5LmhhbmRsZUxvZ2luQXR0ZW1wdChpc1ZhbGlkUGFzc3dvcmQpO1xuICAgICAgICB9KVxuICAgICAgICAudGhlbigoKSA9PiB7XG4gICAgICAgICAgaWYgKCFpc1ZhbGlkUGFzc3dvcmQpIHtcbiAgICAgICAgICAgIHRocm93IG5ldyBQYXJzZS5FcnJvcihQYXJzZS5FcnJvci5PQkpFQ1RfTk9UX0ZPVU5ELCAnSW52YWxpZCB1c2VybmFtZS9wYXNzd29yZC4nKTtcbiAgICAgICAgICB9XG4gICAgICAgICAgLy8gRW5zdXJlIHRoZSB1c2VyIGlzbid0IGxvY2tlZCBvdXRcbiAgICAgICAgICAvLyBBIGxvY2tlZCBvdXQgdXNlciB3b24ndCBiZSBhYmxlIHRvIGxvZ2luXG4gICAgICAgICAgLy8gVG8gbG9jayBhIHVzZXIgb3V0LCBqdXN0IHNldCB0aGUgQUNMIHRvIGBtYXN0ZXJLZXlgIG9ubHkgICh7fSkuXG4gICAgICAgICAgLy8gRW1wdHkgQUNMIGlzIE9LXG4gICAgICAgICAgaWYgKCFyZXEuYXV0aC5pc01hc3RlciAmJiB1c2VyLkFDTCAmJiBPYmplY3Qua2V5cyh1c2VyLkFDTCkubGVuZ3RoID09IDApIHtcbiAgICAgICAgICAgIHRocm93IG5ldyBQYXJzZS5FcnJvcihQYXJzZS5FcnJvci5PQkpFQ1RfTk9UX0ZPVU5ELCAnSW52YWxpZCB1c2VybmFtZS9wYXNzd29yZC4nKTtcbiAgICAgICAgICB9XG4gICAgICAgICAgaWYgKFxuICAgICAgICAgICAgcmVxLmNvbmZpZy52ZXJpZnlVc2VyRW1haWxzICYmXG4gICAgICAgICAgICByZXEuY29uZmlnLnByZXZlbnRMb2dpbldpdGhVbnZlcmlmaWVkRW1haWwgJiZcbiAgICAgICAgICAgICF1c2VyLmVtYWlsVmVyaWZpZWRcbiAgICAgICAgICApIHtcbiAgICAgICAgICAgIHRocm93IG5ldyBQYXJzZS5FcnJvcihQYXJzZS5FcnJvci5FTUFJTF9OT1RfRk9VTkQsICdVc2VyIGVtYWlsIGlzIG5vdCB2ZXJpZmllZC4nKTtcbiAgICAgICAgICB9XG5cbiAgICAgICAgICB0aGlzLl9zYW5pdGl6ZUF1dGhEYXRhKHVzZXIpO1xuXG4gICAgICAgICAgcmV0dXJuIHJlc29sdmUodXNlcik7XG4gICAgICAgIH0pXG4gICAgICAgIC5jYXRjaChlcnJvciA9PiB7XG4gICAgICAgICAgcmV0dXJuIHJlamVjdChlcnJvcik7XG4gICAgICAgIH0pO1xuICAgIH0pO1xuICB9XG5cbiAgaGFuZGxlTWUocmVxKSB7XG4gICAgaWYgKCFyZXEuaW5mbyB8fCAhcmVxLmluZm8uc2Vzc2lvblRva2VuKSB7XG4gICAgICB0aHJvdyBuZXcgUGFyc2UuRXJyb3IoUGFyc2UuRXJyb3IuSU5WQUxJRF9TRVNTSU9OX1RPS0VOLCAnSW52YWxpZCBzZXNzaW9uIHRva2VuJyk7XG4gICAgfVxuICAgIGNvbnN0IHNlc3Npb25Ub2tlbiA9IHJlcS5pbmZvLnNlc3Npb25Ub2tlbjtcbiAgICByZXR1cm4gcmVzdFxuICAgICAgLmZpbmQoXG4gICAgICAgIHJlcS5jb25maWcsXG4gICAgICAgIEF1dGgubWFzdGVyKHJlcS5jb25maWcpLFxuICAgICAgICAnX1Nlc3Npb24nLFxuICAgICAgICB7IHNlc3Npb25Ub2tlbiB9LFxuICAgICAgICB7IGluY2x1ZGU6ICd1c2VyJyB9LFxuICAgICAgICByZXEuaW5mby5jbGllbnRTREssXG4gICAgICAgIHJlcS5pbmZvLmNvbnRleHRcbiAgICAgIClcbiAgICAgIC50aGVuKHJlc3BvbnNlID0+IHtcbiAgICAgICAgaWYgKCFyZXNwb25zZS5yZXN1bHRzIHx8IHJlc3BvbnNlLnJlc3VsdHMubGVuZ3RoID09IDAgfHwgIXJlc3BvbnNlLnJlc3VsdHNbMF0udXNlcikge1xuICAgICAgICAgIHRocm93IG5ldyBQYXJzZS5FcnJvcihQYXJzZS5FcnJvci5JTlZBTElEX1NFU1NJT05fVE9LRU4sICdJbnZhbGlkIHNlc3Npb24gdG9rZW4nKTtcbiAgICAgICAgfSBlbHNlIHtcbiAgICAgICAgICBjb25zdCB1c2VyID0gcmVzcG9uc2UucmVzdWx0c1swXS51c2VyO1xuICAgICAgICAgIC8vIFNlbmQgdG9rZW4gYmFjayBvbiB0aGUgbG9naW4sIGJlY2F1c2UgU0RLcyBleHBlY3QgdGhhdC5cbiAgICAgICAgICB1c2VyLnNlc3Npb25Ub2tlbiA9IHNlc3Npb25Ub2tlbjtcblxuICAgICAgICAgIC8vIFJlbW92ZSBoaWRkZW4gcHJvcGVydGllcy5cbiAgICAgICAgICBVc2Vyc1JvdXRlci5yZW1vdmVIaWRkZW5Qcm9wZXJ0aWVzKHVzZXIpO1xuICAgICAgICAgIHJldHVybiB7IHJlc3BvbnNlOiB1c2VyIH07XG4gICAgICAgIH1cbiAgICAgIH0pO1xuICB9XG5cbiAgYXN5bmMgaGFuZGxlTG9nSW4ocmVxKSB7XG4gICAgY29uc3QgdXNlciA9IGF3YWl0IHRoaXMuX2F1dGhlbnRpY2F0ZVVzZXJGcm9tUmVxdWVzdChyZXEpO1xuICAgIGNvbnN0IGF1dGhEYXRhID0gcmVxLmJvZHkgJiYgcmVxLmJvZHkuYXV0aERhdGE7XG4gICAgLy8gQ2hlY2sgaWYgdXNlciBoYXMgcHJvdmlkZWQgdGhlaXIgcmVxdWlyZWQgYXV0aCBwcm92aWRlcnNcbiAgICBBdXRoLmNoZWNrSWZVc2VySGFzUHJvdmlkZWRDb25maWd1cmVkUHJvdmlkZXJzRm9yTG9naW4oYXV0aERhdGEsIHVzZXIuYXV0aERhdGEsIHJlcS5jb25maWcpO1xuXG4gICAgbGV0IGF1dGhEYXRhUmVzcG9uc2U7XG4gICAgbGV0IHZhbGlkYXRlZEF1dGhEYXRhO1xuICAgIGlmIChhdXRoRGF0YSkge1xuICAgICAgY29uc3QgcmVzID0gYXdhaXQgQXV0aC5oYW5kbGVBdXRoRGF0YVZhbGlkYXRpb24oXG4gICAgICAgIGF1dGhEYXRhLFxuICAgICAgICBuZXcgUmVzdFdyaXRlKFxuICAgICAgICAgIHJlcS5jb25maWcsXG4gICAgICAgICAgcmVxLmF1dGgsXG4gICAgICAgICAgJ19Vc2VyJyxcbiAgICAgICAgICB7IG9iamVjdElkOiB1c2VyLm9iamVjdElkIH0sXG4gICAgICAgICAgcmVxLmJvZHksXG4gICAgICAgICAgdXNlcixcbiAgICAgICAgICByZXEuaW5mby5jbGllbnRTREssXG4gICAgICAgICAgcmVxLmluZm8uY29udGV4dFxuICAgICAgICApLFxuICAgICAgICB1c2VyXG4gICAgICApO1xuICAgICAgYXV0aERhdGFSZXNwb25zZSA9IHJlcy5hdXRoRGF0YVJlc3BvbnNlO1xuICAgICAgdmFsaWRhdGVkQXV0aERhdGEgPSByZXMuYXV0aERhdGE7XG4gICAgfVxuXG4gICAgLy8gaGFuZGxlIHBhc3N3b3JkIGV4cGlyeSBwb2xpY3lcbiAgICBpZiAocmVxLmNvbmZpZy5wYXNzd29yZFBvbGljeSAmJiByZXEuY29uZmlnLnBhc3N3b3JkUG9saWN5Lm1heFBhc3N3b3JkQWdlKSB7XG4gICAgICBsZXQgY2hhbmdlZEF0ID0gdXNlci5fcGFzc3dvcmRfY2hhbmdlZF9hdDtcblxuICAgICAgaWYgKCFjaGFuZ2VkQXQpIHtcbiAgICAgICAgLy8gcGFzc3dvcmQgd2FzIGNyZWF0ZWQgYmVmb3JlIGV4cGlyeSBwb2xpY3kgd2FzIGVuYWJsZWQuXG4gICAgICAgIC8vIHNpbXBseSB1cGRhdGUgX1VzZXIgb2JqZWN0IHNvIHRoYXQgaXQgd2lsbCBzdGFydCBlbmZvcmNpbmcgZnJvbSBub3dcbiAgICAgICAgY2hhbmdlZEF0ID0gbmV3IERhdGUoKTtcbiAgICAgICAgcmVxLmNvbmZpZy5kYXRhYmFzZS51cGRhdGUoXG4gICAgICAgICAgJ19Vc2VyJyxcbiAgICAgICAgICB7IHVzZXJuYW1lOiB1c2VyLnVzZXJuYW1lIH0sXG4gICAgICAgICAgeyBfcGFzc3dvcmRfY2hhbmdlZF9hdDogUGFyc2UuX2VuY29kZShjaGFuZ2VkQXQpIH1cbiAgICAgICAgKTtcbiAgICAgIH0gZWxzZSB7XG4gICAgICAgIC8vIGNoZWNrIHdoZXRoZXIgdGhlIHBhc3N3b3JkIGhhcyBleHBpcmVkXG4gICAgICAgIGlmIChjaGFuZ2VkQXQuX190eXBlID09ICdEYXRlJykge1xuICAgICAgICAgIGNoYW5nZWRBdCA9IG5ldyBEYXRlKGNoYW5nZWRBdC5pc28pO1xuICAgICAgICB9XG4gICAgICAgIC8vIENhbGN1bGF0ZSB0aGUgZXhwaXJ5IHRpbWUuXG4gICAgICAgIGNvbnN0IGV4cGlyZXNBdCA9IG5ldyBEYXRlKFxuICAgICAgICAgIGNoYW5nZWRBdC5nZXRUaW1lKCkgKyA4NjQwMDAwMCAqIHJlcS5jb25maWcucGFzc3dvcmRQb2xpY3kubWF4UGFzc3dvcmRBZ2VcbiAgICAgICAgKTtcbiAgICAgICAgaWYgKGV4cGlyZXNBdCA8IG5ldyBEYXRlKCkpXG4gICAgICAgICAgLy8gZmFpbCBvZiBjdXJyZW50IHRpbWUgaXMgcGFzdCBwYXNzd29yZCBleHBpcnkgdGltZVxuICAgICAgICAgIHRocm93IG5ldyBQYXJzZS5FcnJvcihcbiAgICAgICAgICAgIFBhcnNlLkVycm9yLk9CSkVDVF9OT1RfRk9VTkQsXG4gICAgICAgICAgICAnWW91ciBwYXNzd29yZCBoYXMgZXhwaXJlZC4gUGxlYXNlIHJlc2V0IHlvdXIgcGFzc3dvcmQuJ1xuICAgICAgICAgICk7XG4gICAgICB9XG4gICAgfVxuXG4gICAgLy8gUmVtb3ZlIGhpZGRlbiBwcm9wZXJ0aWVzLlxuICAgIFVzZXJzUm91dGVyLnJlbW92ZUhpZGRlblByb3BlcnRpZXModXNlcik7XG5cbiAgICByZXEuY29uZmlnLmZpbGVzQ29udHJvbGxlci5leHBhbmRGaWxlc0luT2JqZWN0KHJlcS5jb25maWcsIHVzZXIpO1xuXG4gICAgLy8gQmVmb3JlIGxvZ2luIHRyaWdnZXI7IHRocm93cyBpZiBmYWlsdXJlXG4gICAgYXdhaXQgbWF5YmVSdW5UcmlnZ2VyKFxuICAgICAgVHJpZ2dlclR5cGVzLmJlZm9yZUxvZ2luLFxuICAgICAgcmVxLmF1dGgsXG4gICAgICBQYXJzZS5Vc2VyLmZyb21KU09OKE9iamVjdC5hc3NpZ24oeyBjbGFzc05hbWU6ICdfVXNlcicgfSwgdXNlcikpLFxuICAgICAgbnVsbCxcbiAgICAgIHJlcS5jb25maWdcbiAgICApO1xuXG4gICAgLy8gSWYgd2UgaGF2ZSBzb21lIG5ldyB2YWxpZGF0ZWQgYXV0aERhdGEgdXBkYXRlIGRpcmVjdGx5XG4gICAgaWYgKHZhbGlkYXRlZEF1dGhEYXRhICYmIE9iamVjdC5rZXlzKHZhbGlkYXRlZEF1dGhEYXRhKS5sZW5ndGgpIHtcbiAgICAgIGF3YWl0IHJlcS5jb25maWcuZGF0YWJhc2UudXBkYXRlKFxuICAgICAgICAnX1VzZXInLFxuICAgICAgICB7IG9iamVjdElkOiB1c2VyLm9iamVjdElkIH0sXG4gICAgICAgIHsgYXV0aERhdGE6IHZhbGlkYXRlZEF1dGhEYXRhIH0sXG4gICAgICAgIHt9XG4gICAgICApO1xuICAgIH1cblxuICAgIGNvbnN0IHsgc2Vzc2lvbkRhdGEsIGNyZWF0ZVNlc3Npb24gfSA9IFJlc3RXcml0ZS5jcmVhdGVTZXNzaW9uKHJlcS5jb25maWcsIHtcbiAgICAgIHVzZXJJZDogdXNlci5vYmplY3RJZCxcbiAgICAgIGNyZWF0ZWRXaXRoOiB7XG4gICAgICAgIGFjdGlvbjogJ2xvZ2luJyxcbiAgICAgICAgYXV0aFByb3ZpZGVyOiAncGFzc3dvcmQnLFxuICAgICAgfSxcbiAgICAgIGluc3RhbGxhdGlvbklkOiByZXEuaW5mby5pbnN0YWxsYXRpb25JZCxcbiAgICB9KTtcblxuICAgIHVzZXIuc2Vzc2lvblRva2VuID0gc2Vzc2lvbkRhdGEuc2Vzc2lvblRva2VuO1xuXG4gICAgYXdhaXQgY3JlYXRlU2Vzc2lvbigpO1xuXG4gICAgY29uc3QgYWZ0ZXJMb2dpblVzZXIgPSBQYXJzZS5Vc2VyLmZyb21KU09OKE9iamVjdC5hc3NpZ24oeyBjbGFzc05hbWU6ICdfVXNlcicgfSwgdXNlcikpO1xuICAgIG1heWJlUnVuVHJpZ2dlcihcbiAgICAgIFRyaWdnZXJUeXBlcy5hZnRlckxvZ2luLFxuICAgICAgeyAuLi5yZXEuYXV0aCwgdXNlcjogYWZ0ZXJMb2dpblVzZXIgfSxcbiAgICAgIGFmdGVyTG9naW5Vc2VyLFxuICAgICAgbnVsbCxcbiAgICAgIHJlcS5jb25maWdcbiAgICApO1xuXG4gICAgaWYgKGF1dGhEYXRhUmVzcG9uc2UpIHtcbiAgICAgIHVzZXIuYXV0aERhdGFSZXNwb25zZSA9IGF1dGhEYXRhUmVzcG9uc2U7XG4gICAgfVxuXG4gICAgcmV0dXJuIHsgcmVzcG9uc2U6IHVzZXIgfTtcbiAgfVxuXG4gIC8qKlxuICAgKiBUaGlzIGFsbG93cyBtYXN0ZXIta2V5IGNsaWVudHMgdG8gY3JlYXRlIHVzZXIgc2Vzc2lvbnMgd2l0aG91dCBhY2Nlc3MgdG9cbiAgICogdXNlciBjcmVkZW50aWFscy4gVGhpcyBlbmFibGVzIHN5c3RlbXMgdGhhdCBjYW4gYXV0aGVudGljYXRlIGFjY2VzcyBhbm90aGVyXG4gICAqIHdheSAoQVBJIGtleSwgYXBwIGFkbWluaXN0cmF0b3JzKSB0byBhY3Qgb24gYSB1c2VyJ3MgYmVoYWxmLlxuICAgKlxuICAgKiBXZSBjcmVhdGUgYSBuZXcgc2Vzc2lvbiByYXRoZXIgdGhhbiBsb29raW5nIGZvciBhbiBleGlzdGluZyBzZXNzaW9uOyB3ZVxuICAgKiB3YW50IHRoaXMgdG8gd29yayBpbiBzaXR1YXRpb25zIHdoZXJlIHRoZSB1c2VyIGlzIGxvZ2dlZCBvdXQgb24gYWxsXG4gICAqIGRldmljZXMsIHNpbmNlIHRoaXMgY2FuIGJlIHVzZWQgYnkgYXV0b21hdGVkIHN5c3RlbXMgYWN0aW5nIG9uIHRoZSB1c2VyJ3NcbiAgICogYmVoYWxmLlxuICAgKlxuICAgKiBGb3IgdGhlIG1vbWVudCwgd2UncmUgb21pdHRpbmcgZXZlbnQgaG9va3MgYW5kIGxvY2tvdXQgY2hlY2tzLCBzaW5jZVxuICAgKiBpbW1lZGlhdGUgdXNlIGNhc2VzIHN1Z2dlc3QgL2xvZ2luQXMgY291bGQgYmUgdXNlZCBmb3Igc2VtYW50aWNhbGx5XG4gICAqIGRpZmZlcmVudCByZWFzb25zIGZyb20gL2xvZ2luXG4gICAqL1xuICBhc3luYyBoYW5kbGVMb2dJbkFzKHJlcSkge1xuICAgIGlmICghcmVxLmF1dGguaXNNYXN0ZXIpIHtcbiAgICAgIHRocm93IG5ldyBQYXJzZS5FcnJvcihQYXJzZS5FcnJvci5PUEVSQVRJT05fRk9SQklEREVOLCAnbWFzdGVyIGtleSBpcyByZXF1aXJlZCcpO1xuICAgIH1cblxuICAgIGNvbnN0IHVzZXJJZCA9IHJlcS5ib2R5LnVzZXJJZCB8fCByZXEucXVlcnkudXNlcklkO1xuICAgIGlmICghdXNlcklkKSB7XG4gICAgICB0aHJvdyBuZXcgUGFyc2UuRXJyb3IoXG4gICAgICAgIFBhcnNlLkVycm9yLklOVkFMSURfVkFMVUUsXG4gICAgICAgICd1c2VySWQgbXVzdCBub3QgYmUgZW1wdHksIG51bGwsIG9yIHVuZGVmaW5lZCdcbiAgICAgICk7XG4gICAgfVxuXG4gICAgY29uc3QgcXVlcnlSZXN1bHRzID0gYXdhaXQgcmVxLmNvbmZpZy5kYXRhYmFzZS5maW5kKCdfVXNlcicsIHsgb2JqZWN0SWQ6IHVzZXJJZCB9KTtcbiAgICBjb25zdCB1c2VyID0gcXVlcnlSZXN1bHRzWzBdO1xuICAgIGlmICghdXNlcikge1xuICAgICAgdGhyb3cgbmV3IFBhcnNlLkVycm9yKFBhcnNlLkVycm9yLk9CSkVDVF9OT1RfRk9VTkQsICd1c2VyIG5vdCBmb3VuZCcpO1xuICAgIH1cblxuICAgIHRoaXMuX3Nhbml0aXplQXV0aERhdGEodXNlcik7XG5cbiAgICBjb25zdCB7IHNlc3Npb25EYXRhLCBjcmVhdGVTZXNzaW9uIH0gPSBSZXN0V3JpdGUuY3JlYXRlU2Vzc2lvbihyZXEuY29uZmlnLCB7XG4gICAgICB1c2VySWQsXG4gICAgICBjcmVhdGVkV2l0aDoge1xuICAgICAgICBhY3Rpb246ICdsb2dpbicsXG4gICAgICAgIGF1dGhQcm92aWRlcjogJ21hc3RlcmtleScsXG4gICAgICB9LFxuICAgICAgaW5zdGFsbGF0aW9uSWQ6IHJlcS5pbmZvLmluc3RhbGxhdGlvbklkLFxuICAgIH0pO1xuXG4gICAgdXNlci5zZXNzaW9uVG9rZW4gPSBzZXNzaW9uRGF0YS5zZXNzaW9uVG9rZW47XG5cbiAgICBhd2FpdCBjcmVhdGVTZXNzaW9uKCk7XG5cbiAgICByZXR1cm4geyByZXNwb25zZTogdXNlciB9O1xuICB9XG5cbiAgaGFuZGxlVmVyaWZ5UGFzc3dvcmQocmVxKSB7XG4gICAgcmV0dXJuIHRoaXMuX2F1dGhlbnRpY2F0ZVVzZXJGcm9tUmVxdWVzdChyZXEpXG4gICAgICAudGhlbih1c2VyID0+IHtcbiAgICAgICAgLy8gUmVtb3ZlIGhpZGRlbiBwcm9wZXJ0aWVzLlxuICAgICAgICBVc2Vyc1JvdXRlci5yZW1vdmVIaWRkZW5Qcm9wZXJ0aWVzKHVzZXIpO1xuXG4gICAgICAgIHJldHVybiB7IHJlc3BvbnNlOiB1c2VyIH07XG4gICAgICB9KVxuICAgICAgLmNhdGNoKGVycm9yID0+IHtcbiAgICAgICAgdGhyb3cgZXJyb3I7XG4gICAgICB9KTtcbiAgfVxuXG4gIGhhbmRsZUxvZ091dChyZXEpIHtcbiAgICBjb25zdCBzdWNjZXNzID0geyByZXNwb25zZToge30gfTtcbiAgICBpZiAocmVxLmluZm8gJiYgcmVxLmluZm8uc2Vzc2lvblRva2VuKSB7XG4gICAgICByZXR1cm4gcmVzdFxuICAgICAgICAuZmluZChcbiAgICAgICAgICByZXEuY29uZmlnLFxuICAgICAgICAgIEF1dGgubWFzdGVyKHJlcS5jb25maWcpLFxuICAgICAgICAgICdfU2Vzc2lvbicsXG4gICAgICAgICAgeyBzZXNzaW9uVG9rZW46IHJlcS5pbmZvLnNlc3Npb25Ub2tlbiB9LFxuICAgICAgICAgIHVuZGVmaW5lZCxcbiAgICAgICAgICByZXEuaW5mby5jbGllbnRTREssXG4gICAgICAgICAgcmVxLmluZm8uY29udGV4dFxuICAgICAgICApXG4gICAgICAgIC50aGVuKHJlY29yZHMgPT4ge1xuICAgICAgICAgIGlmIChyZWNvcmRzLnJlc3VsdHMgJiYgcmVjb3Jkcy5yZXN1bHRzLmxlbmd0aCkge1xuICAgICAgICAgICAgcmV0dXJuIHJlc3RcbiAgICAgICAgICAgICAgLmRlbChcbiAgICAgICAgICAgICAgICByZXEuY29uZmlnLFxuICAgICAgICAgICAgICAgIEF1dGgubWFzdGVyKHJlcS5jb25maWcpLFxuICAgICAgICAgICAgICAgICdfU2Vzc2lvbicsXG4gICAgICAgICAgICAgICAgcmVjb3Jkcy5yZXN1bHRzWzBdLm9iamVjdElkLFxuICAgICAgICAgICAgICAgIHJlcS5pbmZvLmNvbnRleHRcbiAgICAgICAgICAgICAgKVxuICAgICAgICAgICAgICAudGhlbigoKSA9PiB7XG4gICAgICAgICAgICAgICAgdGhpcy5fcnVuQWZ0ZXJMb2dvdXRUcmlnZ2VyKHJlcSwgcmVjb3Jkcy5yZXN1bHRzWzBdKTtcbiAgICAgICAgICAgICAgICByZXR1cm4gUHJvbWlzZS5yZXNvbHZlKHN1Y2Nlc3MpO1xuICAgICAgICAgICAgICB9KTtcbiAgICAgICAgICB9XG4gICAgICAgICAgcmV0dXJuIFByb21pc2UucmVzb2x2ZShzdWNjZXNzKTtcbiAgICAgICAgfSk7XG4gICAgfVxuICAgIHJldHVybiBQcm9taXNlLnJlc29sdmUoc3VjY2Vzcyk7XG4gIH1cblxuICBfcnVuQWZ0ZXJMb2dvdXRUcmlnZ2VyKHJlcSwgc2Vzc2lvbikge1xuICAgIC8vIEFmdGVyIGxvZ291dCB0cmlnZ2VyXG4gICAgbWF5YmVSdW5UcmlnZ2VyKFxuICAgICAgVHJpZ2dlclR5cGVzLmFmdGVyTG9nb3V0LFxuICAgICAgcmVxLmF1dGgsXG4gICAgICBQYXJzZS5TZXNzaW9uLmZyb21KU09OKE9iamVjdC5hc3NpZ24oeyBjbGFzc05hbWU6ICdfU2Vzc2lvbicgfSwgc2Vzc2lvbikpLFxuICAgICAgbnVsbCxcbiAgICAgIHJlcS5jb25maWdcbiAgICApO1xuICB9XG5cbiAgX3Rocm93T25CYWRFbWFpbENvbmZpZyhyZXEpIHtcbiAgICB0cnkge1xuICAgICAgQ29uZmlnLnZhbGlkYXRlRW1haWxDb25maWd1cmF0aW9uKHtcbiAgICAgICAgZW1haWxBZGFwdGVyOiByZXEuY29uZmlnLnVzZXJDb250cm9sbGVyLmFkYXB0ZXIsXG4gICAgICAgIGFwcE5hbWU6IHJlcS5jb25maWcuYXBwTmFtZSxcbiAgICAgICAgcHVibGljU2VydmVyVVJMOiByZXEuY29uZmlnLnB1YmxpY1NlcnZlclVSTCxcbiAgICAgICAgZW1haWxWZXJpZnlUb2tlblZhbGlkaXR5RHVyYXRpb246IHJlcS5jb25maWcuZW1haWxWZXJpZnlUb2tlblZhbGlkaXR5RHVyYXRpb24sXG4gICAgICAgIGVtYWlsVmVyaWZ5VG9rZW5SZXVzZUlmVmFsaWQ6IHJlcS5jb25maWcuZW1haWxWZXJpZnlUb2tlblJldXNlSWZWYWxpZCxcbiAgICAgIH0pO1xuICAgIH0gY2F0Y2ggKGUpIHtcbiAgICAgIGlmICh0eXBlb2YgZSA9PT0gJ3N0cmluZycpIHtcbiAgICAgICAgLy8gTWF5YmUgd2UgbmVlZCBhIEJhZCBDb25maWd1cmF0aW9uIGVycm9yLCBidXQgdGhlIFNES3Mgd29uJ3QgdW5kZXJzdGFuZCBpdC4gRm9yIG5vdywgSW50ZXJuYWwgU2VydmVyIEVycm9yLlxuICAgICAgICB0aHJvdyBuZXcgUGFyc2UuRXJyb3IoXG4gICAgICAgICAgUGFyc2UuRXJyb3IuSU5URVJOQUxfU0VSVkVSX0VSUk9SLFxuICAgICAgICAgICdBbiBhcHBOYW1lLCBwdWJsaWNTZXJ2ZXJVUkwsIGFuZCBlbWFpbEFkYXB0ZXIgYXJlIHJlcXVpcmVkIGZvciBwYXNzd29yZCByZXNldCBhbmQgZW1haWwgdmVyaWZpY2F0aW9uIGZ1bmN0aW9uYWxpdHkuJ1xuICAgICAgICApO1xuICAgICAgfSBlbHNlIHtcbiAgICAgICAgdGhyb3cgZTtcbiAgICAgIH1cbiAgICB9XG4gIH1cblxuICBoYW5kbGVSZXNldFJlcXVlc3QocmVxKSB7XG4gICAgdGhpcy5fdGhyb3dPbkJhZEVtYWlsQ29uZmlnKHJlcSk7XG5cbiAgICBjb25zdCB7IGVtYWlsIH0gPSByZXEuYm9keTtcbiAgICBpZiAoIWVtYWlsKSB7XG4gICAgICB0aHJvdyBuZXcgUGFyc2UuRXJyb3IoUGFyc2UuRXJyb3IuRU1BSUxfTUlTU0lORywgJ3lvdSBtdXN0IHByb3ZpZGUgYW4gZW1haWwnKTtcbiAgICB9XG4gICAgaWYgKHR5cGVvZiBlbWFpbCAhPT0gJ3N0cmluZycpIHtcbiAgICAgIHRocm93IG5ldyBQYXJzZS5FcnJvcihcbiAgICAgICAgUGFyc2UuRXJyb3IuSU5WQUxJRF9FTUFJTF9BRERSRVNTLFxuICAgICAgICAneW91IG11c3QgcHJvdmlkZSBhIHZhbGlkIGVtYWlsIHN0cmluZydcbiAgICAgICk7XG4gICAgfVxuICAgIGNvbnN0IHVzZXJDb250cm9sbGVyID0gcmVxLmNvbmZpZy51c2VyQ29udHJvbGxlcjtcbiAgICByZXR1cm4gdXNlckNvbnRyb2xsZXIuc2VuZFBhc3N3b3JkUmVzZXRFbWFpbChlbWFpbCkudGhlbihcbiAgICAgICgpID0+IHtcbiAgICAgICAgcmV0dXJuIFByb21pc2UucmVzb2x2ZSh7XG4gICAgICAgICAgcmVzcG9uc2U6IHt9LFxuICAgICAgICB9KTtcbiAgICAgIH0sXG4gICAgICBlcnIgPT4ge1xuICAgICAgICBpZiAoZXJyLmNvZGUgPT09IFBhcnNlLkVycm9yLk9CSkVDVF9OT1RfRk9VTkQpIHtcbiAgICAgICAgICAvLyBSZXR1cm4gc3VjY2VzcyBzbyB0aGF0IHRoaXMgZW5kcG9pbnQgY2FuJ3RcbiAgICAgICAgICAvLyBiZSB1c2VkIHRvIGVudW1lcmF0ZSB2YWxpZCBlbWFpbHNcbiAgICAgICAgICByZXR1cm4gUHJvbWlzZS5yZXNvbHZlKHtcbiAgICAgICAgICAgIHJlc3BvbnNlOiB7fSxcbiAgICAgICAgICB9KTtcbiAgICAgICAgfSBlbHNlIHtcbiAgICAgICAgICB0aHJvdyBlcnI7XG4gICAgICAgIH1cbiAgICAgIH1cbiAgICApO1xuICB9XG5cbiAgaGFuZGxlVmVyaWZpY2F0aW9uRW1haWxSZXF1ZXN0KHJlcSkge1xuICAgIHRoaXMuX3Rocm93T25CYWRFbWFpbENvbmZpZyhyZXEpO1xuXG4gICAgY29uc3QgeyBlbWFpbCB9ID0gcmVxLmJvZHk7XG4gICAgaWYgKCFlbWFpbCkge1xuICAgICAgdGhyb3cgbmV3IFBhcnNlLkVycm9yKFBhcnNlLkVycm9yLkVNQUlMX01JU1NJTkcsICd5b3UgbXVzdCBwcm92aWRlIGFuIGVtYWlsJyk7XG4gICAgfVxuICAgIGlmICh0eXBlb2YgZW1haWwgIT09ICdzdHJpbmcnKSB7XG4gICAgICB0aHJvdyBuZXcgUGFyc2UuRXJyb3IoXG4gICAgICAgIFBhcnNlLkVycm9yLklOVkFMSURfRU1BSUxfQUREUkVTUyxcbiAgICAgICAgJ3lvdSBtdXN0IHByb3ZpZGUgYSB2YWxpZCBlbWFpbCBzdHJpbmcnXG4gICAgICApO1xuICAgIH1cblxuICAgIHJldHVybiByZXEuY29uZmlnLmRhdGFiYXNlLmZpbmQoJ19Vc2VyJywgeyBlbWFpbDogZW1haWwgfSkudGhlbihyZXN1bHRzID0+IHtcbiAgICAgIGlmICghcmVzdWx0cy5sZW5ndGggfHwgcmVzdWx0cy5sZW5ndGggPCAxKSB7XG4gICAgICAgIHRocm93IG5ldyBQYXJzZS5FcnJvcihQYXJzZS5FcnJvci5FTUFJTF9OT1RfRk9VTkQsIGBObyB1c2VyIGZvdW5kIHdpdGggZW1haWwgJHtlbWFpbH1gKTtcbiAgICAgIH1cbiAgICAgIGNvbnN0IHVzZXIgPSByZXN1bHRzWzBdO1xuXG4gICAgICAvLyByZW1vdmUgcGFzc3dvcmQgZmllbGQsIG1lc3NlcyB3aXRoIHNhdmluZyBvbiBwb3N0Z3Jlc1xuICAgICAgZGVsZXRlIHVzZXIucGFzc3dvcmQ7XG5cbiAgICAgIGlmICh1c2VyLmVtYWlsVmVyaWZpZWQpIHtcbiAgICAgICAgdGhyb3cgbmV3IFBhcnNlLkVycm9yKFBhcnNlLkVycm9yLk9USEVSX0NBVVNFLCBgRW1haWwgJHtlbWFpbH0gaXMgYWxyZWFkeSB2ZXJpZmllZC5gKTtcbiAgICAgIH1cblxuICAgICAgY29uc3QgdXNlckNvbnRyb2xsZXIgPSByZXEuY29uZmlnLnVzZXJDb250cm9sbGVyO1xuICAgICAgcmV0dXJuIHVzZXJDb250cm9sbGVyLnJlZ2VuZXJhdGVFbWFpbFZlcmlmeVRva2VuKHVzZXIpLnRoZW4oKCkgPT4ge1xuICAgICAgICB1c2VyQ29udHJvbGxlci5zZW5kVmVyaWZpY2F0aW9uRW1haWwodXNlcik7XG4gICAgICAgIHJldHVybiB7IHJlc3BvbnNlOiB7fSB9O1xuICAgICAgfSk7XG4gICAgfSk7XG4gIH1cblxuICBhc3luYyBoYW5kbGVDaGFsbGVuZ2UocmVxKSB7XG4gICAgY29uc3QgeyB1c2VybmFtZSwgZW1haWwsIHBhc3N3b3JkLCBhdXRoRGF0YSwgY2hhbGxlbmdlRGF0YSB9ID0gcmVxLmJvZHk7XG5cbiAgICAvLyBpZiB1c2VybmFtZSBvciBlbWFpbCBwcm92aWRlZCB3aXRoIHBhc3N3b3JkIHRyeSB0byBhdXRoZW50aWNhdGUgdGhlIHVzZXIgYnkgdXNlcm5hbWVcbiAgICBsZXQgdXNlcjtcbiAgICBpZiAodXNlcm5hbWUgfHwgZW1haWwpIHtcbiAgICAgIGlmICghcGFzc3dvcmQpXG4gICAgICAgIHRocm93IG5ldyBQYXJzZS5FcnJvcihcbiAgICAgICAgICBQYXJzZS5FcnJvci5PVEhFUl9DQVVTRSxcbiAgICAgICAgICAnWW91IHByb3ZpZGVkIHVzZXJuYW1lIG9yIGVtYWlsLCB5b3UgbmVlZCB0byBhbHNvIHByb3ZpZGUgcGFzc3dvcmQuJ1xuICAgICAgICApO1xuICAgICAgdXNlciA9IGF3YWl0IHRoaXMuX2F1dGhlbnRpY2F0ZVVzZXJGcm9tUmVxdWVzdChyZXEpO1xuICAgIH1cblxuICAgIGlmICghY2hhbGxlbmdlRGF0YSkgdGhyb3cgbmV3IFBhcnNlLkVycm9yKFBhcnNlLkVycm9yLk9USEVSX0NBVVNFLCAnTm90aGluZyB0byBjaGFsbGVuZ2UuJyk7XG5cbiAgICBpZiAodHlwZW9mIGNoYWxsZW5nZURhdGEgIT09ICdvYmplY3QnKVxuICAgICAgdGhyb3cgbmV3IFBhcnNlLkVycm9yKFBhcnNlLkVycm9yLk9USEVSX0NBVVNFLCAnY2hhbGxlbmdlRGF0YSBzaG91bGQgYmUgYW4gb2JqZWN0LicpO1xuXG4gICAgbGV0IHJlcXVlc3Q7XG4gICAgbGV0IHBhcnNlVXNlcjtcblxuICAgIC8vIFRyeSB0byBmaW5kIHVzZXIgYnkgYXV0aERhdGFcbiAgICBpZiAoYXV0aERhdGEpIHtcbiAgICAgIGlmICh0eXBlb2YgYXV0aERhdGEgIT09ICdvYmplY3QnKSB7XG4gICAgICAgIHRocm93IG5ldyBQYXJzZS5FcnJvcihQYXJzZS5FcnJvci5PVEhFUl9DQVVTRSwgJ2F1dGhEYXRhIHNob3VsZCBiZSBhbiBvYmplY3QuJyk7XG4gICAgICB9XG4gICAgICBpZiAodXNlcikge1xuICAgICAgICB0aHJvdyBuZXcgUGFyc2UuRXJyb3IoXG4gICAgICAgICAgUGFyc2UuRXJyb3IuT1RIRVJfQ0FVU0UsXG4gICAgICAgICAgJ1lvdSBjYW50IHByb3ZpZGUgdXNlcm5hbWUvZW1haWwgYW5kIGF1dGhEYXRhLCBvbmx5IHVzZSBvbmUgaWRlbnRpZmljYXRpb24gbWV0aG9kLidcbiAgICAgICAgKTtcbiAgICAgIH1cblxuICAgICAgaWYgKE9iamVjdC5rZXlzKGF1dGhEYXRhKS5maWx0ZXIoa2V5ID0+IGF1dGhEYXRhW2tleV0uaWQpLmxlbmd0aCA+IDEpIHtcbiAgICAgICAgdGhyb3cgbmV3IFBhcnNlLkVycm9yKFxuICAgICAgICAgIFBhcnNlLkVycm9yLk9USEVSX0NBVVNFLFxuICAgICAgICAgICdZb3UgY2FudCBwcm92aWRlIG1vcmUgdGhhbiBvbmUgYXV0aERhdGEgcHJvdmlkZXIgd2l0aCBhbiBpZC4nXG4gICAgICAgICk7XG4gICAgICB9XG5cbiAgICAgIGNvbnN0IHJlc3VsdHMgPSBhd2FpdCBBdXRoLmZpbmRVc2Vyc1dpdGhBdXRoRGF0YShyZXEuY29uZmlnLCBhdXRoRGF0YSk7XG5cbiAgICAgIHRyeSB7XG4gICAgICAgIGlmICghcmVzdWx0c1swXSB8fCByZXN1bHRzLmxlbmd0aCA+IDEpIHtcbiAgICAgICAgICB0aHJvdyBuZXcgUGFyc2UuRXJyb3IoUGFyc2UuRXJyb3IuT1RIRVJfQ0FVU0UsICdVc2VyIG5vdCBmb3VuZC4nKTtcbiAgICAgICAgfVxuICAgICAgICAvLyBGaW5kIHRoZSBwcm92aWRlciB1c2VkIHRvIGZpbmQgdGhlIHVzZXJcbiAgICAgICAgY29uc3QgcHJvdmlkZXIgPSBPYmplY3Qua2V5cyhhdXRoRGF0YSkuZmluZChrZXkgPT4gYXV0aERhdGFba2V5XS5pZCk7XG5cbiAgICAgICAgcGFyc2VVc2VyID0gUGFyc2UuVXNlci5mcm9tSlNPTih7IGNsYXNzTmFtZTogJ19Vc2VyJywgLi4ucmVzdWx0c1swXSB9KTtcbiAgICAgICAgcmVxdWVzdCA9IGdldFJlcXVlc3RPYmplY3QodW5kZWZpbmVkLCByZXEuYXV0aCwgcGFyc2VVc2VyLCBwYXJzZVVzZXIsIHJlcS5jb25maWcpO1xuICAgICAgICByZXF1ZXN0LmlzQ2hhbGxlbmdlID0gdHJ1ZTtcbiAgICAgICAgLy8gVmFsaWRhdGUgYXV0aERhdGEgdXNlZCB0byBpZGVudGlmeSB0aGUgdXNlciB0byBhdm9pZCBicnV0ZS1mb3JjZSBhdHRhY2sgb24gYGlkYFxuICAgICAgICBjb25zdCB7IHZhbGlkYXRvciB9ID0gcmVxLmNvbmZpZy5hdXRoRGF0YU1hbmFnZXIuZ2V0VmFsaWRhdG9yRm9yUHJvdmlkZXIocHJvdmlkZXIpO1xuICAgICAgICBhd2FpdCB2YWxpZGF0b3IoYXV0aERhdGFbcHJvdmlkZXJdLCByZXEsIHBhcnNlVXNlciwgcmVxdWVzdCk7XG4gICAgICB9IGNhdGNoIChlKSB7XG4gICAgICAgIC8vIFJld3JpdGUgdGhlIGVycm9yIHRvIGF2b2lkIGd1ZXNzIGlkIGF0dGFja1xuICAgICAgICBsb2dnZXIuZXJyb3IoZSk7XG4gICAgICAgIHRocm93IG5ldyBQYXJzZS5FcnJvcihQYXJzZS5FcnJvci5PVEhFUl9DQVVTRSwgJ1VzZXIgbm90IGZvdW5kLicpO1xuICAgICAgfVxuICAgIH1cblxuICAgIGlmICghcGFyc2VVc2VyKSB7XG4gICAgICBwYXJzZVVzZXIgPSB1c2VyID8gUGFyc2UuVXNlci5mcm9tSlNPTih7IGNsYXNzTmFtZTogJ19Vc2VyJywgLi4udXNlciB9KSA6IHVuZGVmaW5lZDtcbiAgICB9XG5cbiAgICBpZiAoIXJlcXVlc3QpIHtcbiAgICAgIHJlcXVlc3QgPSBnZXRSZXF1ZXN0T2JqZWN0KHVuZGVmaW5lZCwgcmVxLmF1dGgsIHBhcnNlVXNlciwgcGFyc2VVc2VyLCByZXEuY29uZmlnKTtcbiAgICAgIHJlcXVlc3QuaXNDaGFsbGVuZ2UgPSB0cnVlO1xuICAgIH1cblxuICAgIC8vIEV4ZWN1dGUgY2hhbGxlbmdlIHN0ZXAtYnktc3RlcCB3aXRoIGNvbnNpc3RlbnQgb3JkZXIgZm9yIGJldHRlciBlcnJvciBmZWVkYmFja1xuICAgIC8vIGFuZCB0byBhdm9pZCB0byB0cmlnZ2VyIG90aGVycyBjaGFsbGVuZ2VzIGlmIG9uZSBvZiB0aGVtIGZhaWxzXG4gICAgY29uc3QgY2hhbGxlbmdlID0gYXdhaXQgQXV0aC5yZWR1Y2VQcm9taXNlKFxuICAgICAgT2JqZWN0LmtleXMoY2hhbGxlbmdlRGF0YSkuc29ydCgpLFxuICAgICAgYXN5bmMgKGFjYywgcHJvdmlkZXIpID0+IHtcbiAgICAgICAgY29uc3QgYXV0aEFkYXB0ZXIgPSByZXEuY29uZmlnLmF1dGhEYXRhTWFuYWdlci5nZXRWYWxpZGF0b3JGb3JQcm92aWRlcihwcm92aWRlcik7XG4gICAgICAgIGlmICghYXV0aEFkYXB0ZXIpIHJldHVybiBhY2M7XG4gICAgICAgIGNvbnN0IHtcbiAgICAgICAgICBhZGFwdGVyOiB7IGNoYWxsZW5nZSB9LFxuICAgICAgICB9ID0gYXV0aEFkYXB0ZXI7XG4gICAgICAgIGlmICh0eXBlb2YgY2hhbGxlbmdlID09PSAnZnVuY3Rpb24nKSB7XG4gICAgICAgICAgY29uc3QgcHJvdmlkZXJDaGFsbGVuZ2VSZXNwb25zZSA9IGF3YWl0IGNoYWxsZW5nZShcbiAgICAgICAgICAgIGNoYWxsZW5nZURhdGFbcHJvdmlkZXJdLFxuICAgICAgICAgICAgYXV0aERhdGEgJiYgYXV0aERhdGFbcHJvdmlkZXJdLFxuICAgICAgICAgICAgcmVxLmNvbmZpZy5hdXRoW3Byb3ZpZGVyXSxcbiAgICAgICAgICAgIHJlcXVlc3QsXG4gICAgICAgICAgICByZXEuY29uZmlnXG4gICAgICAgICAgKTtcbiAgICAgICAgICBhY2NbcHJvdmlkZXJdID0gcHJvdmlkZXJDaGFsbGVuZ2VSZXNwb25zZSB8fCB0cnVlO1xuICAgICAgICAgIHJldHVybiBhY2M7XG4gICAgICAgIH1cbiAgICAgIH0sXG4gICAgICB7fVxuICAgICk7XG5cbiAgICByZXR1cm4geyByZXNwb25zZTogeyBjaGFsbGVuZ2VEYXRhOiBjaGFsbGVuZ2UgfSB9O1xuICB9XG5cbiAgbW91bnRSb3V0ZXMoKSB7XG4gICAgdGhpcy5yb3V0ZSgnR0VUJywgJy91c2VycycsIHJlcSA9PiB7XG4gICAgICByZXR1cm4gdGhpcy5oYW5kbGVGaW5kKHJlcSk7XG4gICAgfSk7XG4gICAgdGhpcy5yb3V0ZSgnUE9TVCcsICcvdXNlcnMnLCBwcm9taXNlRW5zdXJlSWRlbXBvdGVuY3ksIHJlcSA9PiB7XG4gICAgICByZXR1cm4gdGhpcy5oYW5kbGVDcmVhdGUocmVxKTtcbiAgICB9KTtcbiAgICB0aGlzLnJvdXRlKCdHRVQnLCAnL3VzZXJzL21lJywgcmVxID0+IHtcbiAgICAgIHJldHVybiB0aGlzLmhhbmRsZU1lKHJlcSk7XG4gICAgfSk7XG4gICAgdGhpcy5yb3V0ZSgnR0VUJywgJy91c2Vycy86b2JqZWN0SWQnLCByZXEgPT4ge1xuICAgICAgcmV0dXJuIHRoaXMuaGFuZGxlR2V0KHJlcSk7XG4gICAgfSk7XG4gICAgdGhpcy5yb3V0ZSgnUFVUJywgJy91c2Vycy86b2JqZWN0SWQnLCBwcm9taXNlRW5zdXJlSWRlbXBvdGVuY3ksIHJlcSA9PiB7XG4gICAgICByZXR1cm4gdGhpcy5oYW5kbGVVcGRhdGUocmVxKTtcbiAgICB9KTtcbiAgICB0aGlzLnJvdXRlKCdERUxFVEUnLCAnL3VzZXJzLzpvYmplY3RJZCcsIHJlcSA9PiB7XG4gICAgICByZXR1cm4gdGhpcy5oYW5kbGVEZWxldGUocmVxKTtcbiAgICB9KTtcbiAgICB0aGlzLnJvdXRlKCdHRVQnLCAnL2xvZ2luJywgcmVxID0+IHtcbiAgICAgIHJldHVybiB0aGlzLmhhbmRsZUxvZ0luKHJlcSk7XG4gICAgfSk7XG4gICAgdGhpcy5yb3V0ZSgnUE9TVCcsICcvbG9naW4nLCByZXEgPT4ge1xuICAgICAgcmV0dXJuIHRoaXMuaGFuZGxlTG9nSW4ocmVxKTtcbiAgICB9KTtcbiAgICB0aGlzLnJvdXRlKCdQT1NUJywgJy9sb2dpbkFzJywgcmVxID0+IHtcbiAgICAgIHJldHVybiB0aGlzLmhhbmRsZUxvZ0luQXMocmVxKTtcbiAgICB9KTtcbiAgICB0aGlzLnJvdXRlKCdQT1NUJywgJy9sb2dvdXQnLCByZXEgPT4ge1xuICAgICAgcmV0dXJuIHRoaXMuaGFuZGxlTG9nT3V0KHJlcSk7XG4gICAgfSk7XG4gICAgdGhpcy5yb3V0ZSgnUE9TVCcsICcvcmVxdWVzdFBhc3N3b3JkUmVzZXQnLCByZXEgPT4ge1xuICAgICAgcmV0dXJuIHRoaXMuaGFuZGxlUmVzZXRSZXF1ZXN0KHJlcSk7XG4gICAgfSk7XG4gICAgdGhpcy5yb3V0ZSgnUE9TVCcsICcvdmVyaWZpY2F0aW9uRW1haWxSZXF1ZXN0JywgcmVxID0+IHtcbiAgICAgIHJldHVybiB0aGlzLmhhbmRsZVZlcmlmaWNhdGlvbkVtYWlsUmVxdWVzdChyZXEpO1xuICAgIH0pO1xuICAgIHRoaXMucm91dGUoJ0dFVCcsICcvdmVyaWZ5UGFzc3dvcmQnLCByZXEgPT4ge1xuICAgICAgcmV0dXJuIHRoaXMuaGFuZGxlVmVyaWZ5UGFzc3dvcmQocmVxKTtcbiAgICB9KTtcbiAgICB0aGlzLnJvdXRlKCdQT1NUJywgJy9jaGFsbGVuZ2UnLCByZXEgPT4ge1xuICAgICAgcmV0dXJuIHRoaXMuaGFuZGxlQ2hhbGxlbmdlKHJlcSk7XG4gICAgfSk7XG4gIH1cbn1cblxuZXhwb3J0IGRlZmF1bHQgVXNlcnNSb3V0ZXI7XG4iXX0=