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

var _logger = require("../logger");

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
      if (!password) {
        throw new _node.default.Error(_node.default.Error.OTHER_CAUSE, 'You provided username or email, you need to also provide password.');
      }

      user = await this._authenticateUserFromRequest(req);
    }

    if (!challengeData) {
      throw new _node.default.Error(_node.default.Error.OTHER_CAUSE, 'Nothing to challenge.');
    }

    if (typeof challengeData !== 'object') {
      throw new _node.default.Error(_node.default.Error.OTHER_CAUSE, 'challengeData should be an object.');
    }

    let request;
    let parseUser; // Try to find user by authData

    if (authData) {
      if (typeof authData !== 'object') {
        throw new _node.default.Error(_node.default.Error.OTHER_CAUSE, 'authData should be an object.');
      }

      if (user) {
        throw new _node.default.Error(_node.default.Error.OTHER_CAUSE, 'You cannot provide username/email and authData, only use one identification method.');
      }

      if (Object.keys(authData).filter(key => authData[key].id).length > 1) {
        throw new _node.default.Error(_node.default.Error.OTHER_CAUSE, 'You cannot provide more than one authData provider with an id.');
      }

      const results = await _Auth.default.findUsersWithAuthData(req.config, authData);

      try {
        if (!results[0] || results.length > 1) {
          throw new _node.default.Error(_node.default.Error.OBJECT_NOT_FOUND, 'User not found.');
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
        const validatorResponse = await validator(authData[provider], req, parseUser, request);

        if (validatorResponse && validatorResponse.validator) {
          await validatorResponse.validator();
        }
      } catch (e) {
        // Rewrite the error to avoid guess id attack
        _logger.logger.error(e);

        throw new _node.default.Error(_node.default.Error.OBJECT_NOT_FOUND, 'User not found.');
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
    }

    const acc = {}; // Execute challenge step-by-step with consistent order for better error feedback
    // and to avoid to trigger others challenges if one of them fails

    for (const provider of Object.keys(challengeData).sort()) {
      try {
        const authAdapter = req.config.authDataManager.getValidatorForProvider(provider);

        if (!authAdapter) {
          continue;
        }

        const {
          adapter: {
            challenge
          }
        } = authAdapter;

        if (typeof challenge === 'function') {
          const providerChallengeResponse = await challenge(challengeData[provider], authData && authData[provider], request);
          acc[provider] = providerChallengeResponse || true;
        }
      } catch (err) {
        const e = (0, _triggers.resolveError)(err, {
          code: _node.default.Error.SCRIPT_FAILED,
          message: 'Challenge failed. Unknown error.'
        });
        const userString = req.auth && req.auth.user ? req.auth.user.id : undefined;

        _logger.logger.error(`Failed running auth step challenge for ${provider} for user ${userString} with Error: ` + JSON.stringify(e), {
          authenticationStep: 'challenge',
          error: e,
          user: userString,
          provider
        });

        throw e;
      }
    }

    return {
      response: {
        challengeData: acc
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
//# sourceMappingURL=data:application/json;charset=utf-8;base64,eyJ2ZXJzaW9uIjozLCJzb3VyY2VzIjpbIi4uLy4uL3NyYy9Sb3V0ZXJzL1VzZXJzUm91dGVyLmpzIl0sIm5hbWVzIjpbIlVzZXJzUm91dGVyIiwiQ2xhc3Nlc1JvdXRlciIsImNsYXNzTmFtZSIsInJlbW92ZUhpZGRlblByb3BlcnRpZXMiLCJvYmoiLCJrZXkiLCJPYmplY3QiLCJwcm90b3R5cGUiLCJoYXNPd25Qcm9wZXJ0eSIsImNhbGwiLCJ0ZXN0IiwiX3Nhbml0aXplQXV0aERhdGEiLCJ1c2VyIiwicGFzc3dvcmQiLCJhdXRoRGF0YSIsImtleXMiLCJmb3JFYWNoIiwicHJvdmlkZXIiLCJsZW5ndGgiLCJfYXV0aGVudGljYXRlVXNlckZyb21SZXF1ZXN0IiwicmVxIiwiUHJvbWlzZSIsInJlc29sdmUiLCJyZWplY3QiLCJwYXlsb2FkIiwiYm9keSIsInVzZXJuYW1lIiwicXVlcnkiLCJlbWFpbCIsIlBhcnNlIiwiRXJyb3IiLCJVU0VSTkFNRV9NSVNTSU5HIiwiUEFTU1dPUkRfTUlTU0lORyIsIk9CSkVDVF9OT1RfRk9VTkQiLCJpc1ZhbGlkUGFzc3dvcmQiLCIkb3IiLCJjb25maWciLCJkYXRhYmFzZSIsImZpbmQiLCJ0aGVuIiwicmVzdWx0cyIsImxvZ2dlckNvbnRyb2xsZXIiLCJ3YXJuIiwiZmlsdGVyIiwicGFzc3dvcmRDcnlwdG8iLCJjb21wYXJlIiwiY29ycmVjdCIsImFjY291bnRMb2Nrb3V0UG9saWN5IiwiQWNjb3VudExvY2tvdXQiLCJoYW5kbGVMb2dpbkF0dGVtcHQiLCJhdXRoIiwiaXNNYXN0ZXIiLCJBQ0wiLCJ2ZXJpZnlVc2VyRW1haWxzIiwicHJldmVudExvZ2luV2l0aFVudmVyaWZpZWRFbWFpbCIsImVtYWlsVmVyaWZpZWQiLCJFTUFJTF9OT1RfRk9VTkQiLCJjYXRjaCIsImVycm9yIiwiaGFuZGxlTWUiLCJpbmZvIiwic2Vzc2lvblRva2VuIiwiSU5WQUxJRF9TRVNTSU9OX1RPS0VOIiwicmVzdCIsIkF1dGgiLCJtYXN0ZXIiLCJpbmNsdWRlIiwiY2xpZW50U0RLIiwiY29udGV4dCIsInJlc3BvbnNlIiwiaGFuZGxlTG9nSW4iLCJjaGVja0lmVXNlckhhc1Byb3ZpZGVkQ29uZmlndXJlZFByb3ZpZGVyc0ZvckxvZ2luIiwiYXV0aERhdGFSZXNwb25zZSIsInZhbGlkYXRlZEF1dGhEYXRhIiwicmVzIiwiaGFuZGxlQXV0aERhdGFWYWxpZGF0aW9uIiwiUmVzdFdyaXRlIiwib2JqZWN0SWQiLCJwYXNzd29yZFBvbGljeSIsIm1heFBhc3N3b3JkQWdlIiwiY2hhbmdlZEF0IiwiX3Bhc3N3b3JkX2NoYW5nZWRfYXQiLCJEYXRlIiwidXBkYXRlIiwiX2VuY29kZSIsIl9fdHlwZSIsImlzbyIsImV4cGlyZXNBdCIsImdldFRpbWUiLCJmaWxlc0NvbnRyb2xsZXIiLCJleHBhbmRGaWxlc0luT2JqZWN0IiwiVHJpZ2dlclR5cGVzIiwiYmVmb3JlTG9naW4iLCJVc2VyIiwiZnJvbUpTT04iLCJhc3NpZ24iLCJzZXNzaW9uRGF0YSIsImNyZWF0ZVNlc3Npb24iLCJ1c2VySWQiLCJjcmVhdGVkV2l0aCIsImFjdGlvbiIsImF1dGhQcm92aWRlciIsImluc3RhbGxhdGlvbklkIiwiYWZ0ZXJMb2dpblVzZXIiLCJhZnRlckxvZ2luIiwiaGFuZGxlTG9nSW5BcyIsIk9QRVJBVElPTl9GT1JCSURERU4iLCJJTlZBTElEX1ZBTFVFIiwicXVlcnlSZXN1bHRzIiwiaGFuZGxlVmVyaWZ5UGFzc3dvcmQiLCJoYW5kbGVMb2dPdXQiLCJzdWNjZXNzIiwidW5kZWZpbmVkIiwicmVjb3JkcyIsImRlbCIsIl9ydW5BZnRlckxvZ291dFRyaWdnZXIiLCJzZXNzaW9uIiwiYWZ0ZXJMb2dvdXQiLCJTZXNzaW9uIiwiX3Rocm93T25CYWRFbWFpbENvbmZpZyIsIkNvbmZpZyIsInZhbGlkYXRlRW1haWxDb25maWd1cmF0aW9uIiwiZW1haWxBZGFwdGVyIiwidXNlckNvbnRyb2xsZXIiLCJhZGFwdGVyIiwiYXBwTmFtZSIsInB1YmxpY1NlcnZlclVSTCIsImVtYWlsVmVyaWZ5VG9rZW5WYWxpZGl0eUR1cmF0aW9uIiwiZW1haWxWZXJpZnlUb2tlblJldXNlSWZWYWxpZCIsImUiLCJJTlRFUk5BTF9TRVJWRVJfRVJST1IiLCJoYW5kbGVSZXNldFJlcXVlc3QiLCJFTUFJTF9NSVNTSU5HIiwiSU5WQUxJRF9FTUFJTF9BRERSRVNTIiwic2VuZFBhc3N3b3JkUmVzZXRFbWFpbCIsImVyciIsImNvZGUiLCJoYW5kbGVWZXJpZmljYXRpb25FbWFpbFJlcXVlc3QiLCJPVEhFUl9DQVVTRSIsInJlZ2VuZXJhdGVFbWFpbFZlcmlmeVRva2VuIiwic2VuZFZlcmlmaWNhdGlvbkVtYWlsIiwiaGFuZGxlQ2hhbGxlbmdlIiwiY2hhbGxlbmdlRGF0YSIsInJlcXVlc3QiLCJwYXJzZVVzZXIiLCJpZCIsImZpbmRVc2Vyc1dpdGhBdXRoRGF0YSIsImlzQ2hhbGxlbmdlIiwidmFsaWRhdG9yIiwiYXV0aERhdGFNYW5hZ2VyIiwiZ2V0VmFsaWRhdG9yRm9yUHJvdmlkZXIiLCJ2YWxpZGF0b3JSZXNwb25zZSIsImxvZ2dlciIsImFjYyIsInNvcnQiLCJhdXRoQWRhcHRlciIsImNoYWxsZW5nZSIsInByb3ZpZGVyQ2hhbGxlbmdlUmVzcG9uc2UiLCJTQ1JJUFRfRkFJTEVEIiwibWVzc2FnZSIsInVzZXJTdHJpbmciLCJKU09OIiwic3RyaW5naWZ5IiwiYXV0aGVudGljYXRpb25TdGVwIiwibW91bnRSb3V0ZXMiLCJyb3V0ZSIsImhhbmRsZUZpbmQiLCJwcm9taXNlRW5zdXJlSWRlbXBvdGVuY3kiLCJoYW5kbGVDcmVhdGUiLCJoYW5kbGVHZXQiLCJoYW5kbGVVcGRhdGUiLCJoYW5kbGVEZWxldGUiXSwibWFwcGluZ3MiOiI7Ozs7Ozs7QUFFQTs7QUFDQTs7QUFDQTs7QUFDQTs7QUFDQTs7QUFDQTs7QUFDQTs7QUFDQTs7QUFNQTs7QUFDQTs7QUFDQTs7Ozs7Ozs7OztBQUVPLE1BQU1BLFdBQU4sU0FBMEJDLHNCQUExQixDQUF3QztBQUM3Q0MsRUFBQUEsU0FBUyxHQUFHO0FBQ1YsV0FBTyxPQUFQO0FBQ0Q7QUFFRDtBQUNGO0FBQ0E7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QUZEO0FBR0EsU0FBS2lKLEtBQUwsQ0FBVyxNQUFYLEVBQW1CLFlBQW5CLEVBQWlDakosR0FBRyxJQUFJO0FBQ3RDLGFBQU8sS0FBS3lILGVBQUwsQ0FBcUJ6SCxHQUFyQixDQUFQO0FBQ0QsS0FGRDtBQUdEOztBQWxvQjRDOzs7ZUFxb0JoQ3BCLFciLCJzb3VyY2VzQ29udGVudCI6WyIvLyBUaGVzZSBtZXRob2RzIGhhbmRsZSB0aGUgVXNlci1yZWxhdGVkIHJvdXRlcy5cblxuaW1wb3J0IFBhcnNlIGZyb20gJ3BhcnNlL25vZGUnO1xuaW1wb3J0IENvbmZpZyBmcm9tICcuLi9Db25maWcnO1xuaW1wb3J0IEFjY291bnRMb2Nrb3V0IGZyb20gJy4uL0FjY291bnRMb2Nrb3V0JztcbmltcG9ydCBDbGFzc2VzUm91dGVyIGZyb20gJy4vQ2xhc3Nlc1JvdXRlcic7XG5pbXBvcnQgcmVzdCBmcm9tICcuLi9yZXN0JztcbmltcG9ydCBBdXRoIGZyb20gJy4uL0F1dGgnO1xuaW1wb3J0IHBhc3N3b3JkQ3J5cHRvIGZyb20gJy4uL3Bhc3N3b3JkJztcbmltcG9ydCB7XG4gIG1heWJlUnVuVHJpZ2dlcixcbiAgVHlwZXMgYXMgVHJpZ2dlclR5cGVzLFxuICBnZXRSZXF1ZXN0T2JqZWN0LFxuICByZXNvbHZlRXJyb3IsXG59IGZyb20gJy4uL3RyaWdnZXJzJztcbmltcG9ydCB7IHByb21pc2VFbnN1cmVJZGVtcG90ZW5jeSB9IGZyb20gJy4uL21pZGRsZXdhcmVzJztcbmltcG9ydCBSZXN0V3JpdGUgZnJvbSAnLi4vUmVzdFdyaXRlJztcbmltcG9ydCB7IGxvZ2dlciB9IGZyb20gJy4uL2xvZ2dlcic7XG5cbmV4cG9ydCBjbGFzcyBVc2Vyc1JvdXRlciBleHRlbmRzIENsYXNzZXNSb3V0ZXIge1xuICBjbGFzc05hbWUoKSB7XG4gICAgcmV0dXJuICdfVXNlcic7XG4gIH1cblxuICAvKipcbiAgICogUmVtb3ZlcyBhbGwgXCJfXCIgcHJlZml4ZWQgcHJvcGVydGllcyBmcm9tIGFuIG9iamVjdCwgZXhjZXB0IFwiX190eXBlXCJcbiAgICogQHBhcmFtIHtPYmplY3R9IG9iaiBBbiBvYmplY3QuXG4gICAqL1xuICBzdGF0aWMgcmVtb3ZlSGlkZGVuUHJvcGVydGllcyhvYmopIHtcbiAgICBmb3IgKHZhciBrZXkgaW4gb2JqKSB7XG4gICAgICBpZiAoT2JqZWN0LnByb3RvdHlwZS5oYXNPd25Qcm9wZXJ0eS5jYWxsKG9iaiwga2V5KSkge1xuICAgICAgICAvLyBSZWdleHAgY29tZXMgZnJvbSBQYXJzZS5PYmplY3QucHJvdG90eXBlLnZhbGlkYXRlXG4gICAgICAgIGlmIChrZXkgIT09ICdfX3R5cGUnICYmICEvXltBLVphLXpdWzAtOUEtWmEtel9dKiQvLnRlc3Qoa2V5KSkge1xuICAgICAgICAgIGRlbGV0ZSBvYmpba2V5XTtcbiAgICAgICAgfVxuICAgICAgfVxuICAgIH1cbiAgfVxuXG4gIC8qKlxuICAgKiBBZnRlciByZXRyaWV2aW5nIGEgdXNlciBkaXJlY3RseSBmcm9tIHRoZSBkYXRhYmFzZSwgd2UgbmVlZCB0byByZW1vdmUgdGhlXG4gICAqIHBhc3N3b3JkIGZyb20gdGhlIG9iamVjdCAoZm9yIHNlY3VyaXR5KSwgYW5kIGZpeCBhbiBpc3N1ZSBzb21lIFNES3MgaGF2ZVxuICAgKiB3aXRoIG51bGwgdmFsdWVzXG4gICAqL1xuICBfc2FuaXRpemVBdXRoRGF0YSh1c2VyKSB7XG4gICAgZGVsZXRlIHVzZXIucGFzc3dvcmQ7XG5cbiAgICAvLyBTb21ldGltZXMgdGhlIGF1dGhEYXRhIHN0aWxsIGhhcyBudWxsIG9uIHRoYXQga2V5c1xuICAgIC8vIGh0dHBzOi8vZ2l0aHViLmNvbS9wYXJzZS1jb21tdW5pdHkvcGFyc2Utc2VydmVyL2lzc3Vlcy85MzVcbiAgICBpZiAodXNlci5hdXRoRGF0YSkge1xuICAgICAgT2JqZWN0LmtleXModXNlci5hdXRoRGF0YSkuZm9yRWFjaChwcm92aWRlciA9PiB7XG4gICAgICAgIGlmICh1c2VyLmF1dGhEYXRhW3Byb3ZpZGVyXSA9PT0gbnVsbCkge1xuICAgICAgICAgIGRlbGV0ZSB1c2VyLmF1dGhEYXRhW3Byb3ZpZGVyXTtcbiAgICAgICAgfVxuICAgICAgfSk7XG4gICAgICBpZiAoT2JqZWN0LmtleXModXNlci5hdXRoRGF0YSkubGVuZ3RoID09IDApIHtcbiAgICAgICAgZGVsZXRlIHVzZXIuYXV0aERhdGE7XG4gICAgICB9XG4gICAgfVxuICB9XG5cbiAgLyoqXG4gICAqIFZhbGlkYXRlcyBhIHBhc3N3b3JkIHJlcXVlc3QgaW4gbG9naW4gYW5kIHZlcmlmeVBhc3N3b3JkXG4gICAqIEBwYXJhbSB7T2JqZWN0fSByZXEgVGhlIHJlcXVlc3RcbiAgICogQHJldHVybnMge09iamVjdH0gVXNlciBvYmplY3RcbiAgICogQHByaXZhdGVcbiAgICovXG4gIF9hdXRoZW50aWNhdGVVc2VyRnJvbVJlcXVlc3QocmVxKSB7XG4gICAgcmV0dXJuIG5ldyBQcm9taXNlKChyZXNvbHZlLCByZWplY3QpID0+IHtcbiAgICAgIC8vIFVzZSBxdWVyeSBwYXJhbWV0ZXJzIGluc3RlYWQgaWYgcHJvdmlkZWQgaW4gdXJsXG4gICAgICBsZXQgcGF5bG9hZCA9IHJlcS5ib2R5O1xuICAgICAgaWYgKFxuICAgICAgICAoIXBheWxvYWQudXNlcm5hbWUgJiYgcmVxLnF1ZXJ5ICYmIHJlcS5xdWVyeS51c2VybmFtZSkgfHxcbiAgICAgICAgKCFwYXlsb2FkLmVtYWlsICYmIHJlcS5xdWVyeSAmJiByZXEucXVlcnkuZW1haWwpXG4gICAgICApIHtcbiAgICAgICAgcGF5bG9hZCA9IHJlcS5xdWVyeTtcbiAgICAgIH1cbiAgICAgIGNvbnN0IHsgdXNlcm5hbWUsIGVtYWlsLCBwYXNzd29yZCB9ID0gcGF5bG9hZDtcblxuICAgICAgLy8gVE9ETzogdXNlIHRoZSByaWdodCBlcnJvciBjb2RlcyAvIGRlc2NyaXB0aW9ucy5cbiAgICAgIGlmICghdXNlcm5hbWUgJiYgIWVtYWlsKSB7XG4gICAgICAgIHRocm93IG5ldyBQYXJzZS5FcnJvcihQYXJzZS5FcnJvci5VU0VSTkFNRV9NSVNTSU5HLCAndXNlcm5hbWUvZW1haWwgaXMgcmVxdWlyZWQuJyk7XG4gICAgICB9XG4gICAgICBpZiAoIXBhc3N3b3JkKSB7XG4gICAgICAgIHRocm93IG5ldyBQYXJzZS5FcnJvcihQYXJzZS5FcnJvci5QQVNTV09SRF9NSVNTSU5HLCAncGFzc3dvcmQgaXMgcmVxdWlyZWQuJyk7XG4gICAgICB9XG4gICAgICBpZiAoXG4gICAgICAgIHR5cGVvZiBwYXNzd29yZCAhPT0gJ3N0cmluZycgfHxcbiAgICAgICAgKGVtYWlsICYmIHR5cGVvZiBlbWFpbCAhPT0gJ3N0cmluZycpIHx8XG4gICAgICAgICh1c2VybmFtZSAmJiB0eXBlb2YgdXNlcm5hbWUgIT09ICdzdHJpbmcnKVxuICAgICAgKSB7XG4gICAgICAgIHRocm93IG5ldyBQYXJzZS5FcnJvcihQYXJzZS5FcnJvci5PQkpFQ1RfTk9UX0ZPVU5ELCAnSW52YWxpZCB1c2VybmFtZS9wYXNzd29yZC4nKTtcbiAgICAgIH1cblxuICAgICAgbGV0IHVzZXI7XG4gICAgICBsZXQgaXNWYWxpZFBhc3N3b3JkID0gZmFsc2U7XG4gICAgICBsZXQgcXVlcnk7XG4gICAgICBpZiAoZW1haWwgJiYgdXNlcm5hbWUpIHtcbiAgICAgICAgcXVlcnkgPSB7IGVtYWlsLCB1c2VybmFtZSB9O1xuICAgICAgfSBlbHNlIGlmIChlbWFpbCkge1xuICAgICAgICBxdWVyeSA9IHsgZW1haWwgfTtcbiAgICAgIH0gZWxzZSB7XG4gICAgICAgIHF1ZXJ5ID0geyAkb3I6IFt7IHVzZXJuYW1lIH0sIHsgZW1haWw6IHVzZXJuYW1lIH1dIH07XG4gICAgICB9XG4gICAgICByZXR1cm4gcmVxLmNvbmZpZy5kYXRhYmFzZVxuICAgICAgICAuZmluZCgnX1VzZXInLCBxdWVyeSlcbiAgICAgICAgLnRoZW4ocmVzdWx0cyA9PiB7XG4gICAgICAgICAgaWYgKCFyZXN1bHRzLmxlbmd0aCkge1xuICAgICAgICAgICAgdGhyb3cgbmV3IFBhcnNlLkVycm9yKFBhcnNlLkVycm9yLk9CSkVDVF9OT1RfRk9VTkQsICdJbnZhbGlkIHVzZXJuYW1lL3Bhc3N3b3JkLicpO1xuICAgICAgICAgIH1cblxuICAgICAgICAgIGlmIChyZXN1bHRzLmxlbmd0aCA+IDEpIHtcbiAgICAgICAgICAgIC8vIGNvcm5lciBjYXNlIHdoZXJlIHVzZXIxIGhhcyB1c2VybmFtZSA9PSB1c2VyMiBlbWFpbFxuICAgICAgICAgICAgcmVxLmNvbmZpZy5sb2dnZXJDb250cm9sbGVyLndhcm4oXG4gICAgICAgICAgICAgIFwiVGhlcmUgaXMgYSB1c2VyIHdoaWNoIGVtYWlsIGlzIHRoZSBzYW1lIGFzIGFub3RoZXIgdXNlcidzIHVzZXJuYW1lLCBsb2dnaW5nIGluIGJhc2VkIG9uIHVzZXJuYW1lXCJcbiAgICAgICAgICAgICk7XG4gICAgICAgICAgICB1c2VyID0gcmVzdWx0cy5maWx0ZXIodXNlciA9PiB1c2VyLnVzZXJuYW1lID09PSB1c2VybmFtZSlbMF07XG4gICAgICAgICAgfSBlbHNlIHtcbiAgICAgICAgICAgIHVzZXIgPSByZXN1bHRzWzBdO1xuICAgICAgICAgIH1cblxuICAgICAgICAgIHJldHVybiBwYXNzd29yZENyeXB0by5jb21wYXJlKHBhc3N3b3JkLCB1c2VyLnBhc3N3b3JkKTtcbiAgICAgICAgfSlcbiAgICAgICAgLnRoZW4oY29ycmVjdCA9PiB7XG4gICAgICAgICAgaXNWYWxpZFBhc3N3b3JkID0gY29ycmVjdDtcbiAgICAgICAgICBjb25zdCBhY2NvdW50TG9ja291dFBvbGljeSA9IG5ldyBBY2NvdW50TG9ja291dCh1c2VyLCByZXEuY29uZmlnKTtcbiAgICAgICAgICByZXR1cm4gYWNjb3VudExvY2tvdXRQb2xpY3kuaGFuZGxlTG9naW5BdHRlbXB0KGlzVmFsaWRQYXNzd29yZCk7XG4gICAgICAgIH0pXG4gICAgICAgIC50aGVuKCgpID0+IHtcbiAgICAgICAgICBpZiAoIWlzVmFsaWRQYXNzd29yZCkge1xuICAgICAgICAgICAgdGhyb3cgbmV3IFBhcnNlLkVycm9yKFBhcnNlLkVycm9yLk9CSkVDVF9OT1RfRk9VTkQsICdJbnZhbGlkIHVzZXJuYW1lL3Bhc3N3b3JkLicpO1xuICAgICAgICAgIH1cbiAgICAgICAgICAvLyBFbnN1cmUgdGhlIHVzZXIgaXNuJ3QgbG9ja2VkIG91dFxuICAgICAgICAgIC8vIEEgbG9ja2VkIG91dCB1c2VyIHdvbid0IGJlIGFibGUgdG8gbG9naW5cbiAgICAgICAgICAvLyBUbyBsb2NrIGEgdXNlciBvdXQsIGp1c3Qgc2V0IHRoZSBBQ0wgdG8gYG1hc3RlcktleWAgb25seSAgKHt9KS5cbiAgICAgICAgICAvLyBFbXB0eSBBQ0wgaXMgT0tcbiAgICAgICAgICBpZiAoIXJlcS5hdXRoLmlzTWFzdGVyICYmIHVzZXIuQUNMICYmIE9iamVjdC5rZXlzKHVzZXIuQUNMKS5sZW5ndGggPT0gMCkge1xuICAgICAgICAgICAgdGhyb3cgbmV3IFBhcnNlLkVycm9yKFBhcnNlLkVycm9yLk9CSkVDVF9OT1RfRk9VTkQsICdJbnZhbGlkIHVzZXJuYW1lL3Bhc3N3b3JkLicpO1xuICAgICAgICAgIH1cbiAgICAgICAgICBpZiAoXG4gICAgICAgICAgICByZXEuY29uZmlnLnZlcmlmeVVzZXJFbWFpbHMgJiZcbiAgICAgICAgICAgIHJlcS5jb25maWcucHJldmVudExvZ2luV2l0aFVudmVyaWZpZWRFbWFpbCAmJlxuICAgICAgICAgICAgIXVzZXIuZW1haWxWZXJpZmllZFxuICAgICAgICAgICkge1xuICAgICAgICAgICAgdGhyb3cgbmV3IFBhcnNlLkVycm9yKFBhcnNlLkVycm9yLkVNQUlMX05PVF9GT1VORCwgJ1VzZXIgZW1haWwgaXMgbm90IHZlcmlmaWVkLicpO1xuICAgICAgICAgIH1cblxuICAgICAgICAgIHRoaXMuX3Nhbml0aXplQXV0aERhdGEodXNlcik7XG5cbiAgICAgICAgICByZXR1cm4gcmVzb2x2ZSh1c2VyKTtcbiAgICAgICAgfSlcbiAgICAgICAgLmNhdGNoKGVycm9yID0+IHtcbiAgICAgICAgICByZXR1cm4gcmVqZWN0KGVycm9yKTtcbiAgICAgICAgfSk7XG4gICAgfSk7XG4gIH1cblxuICBoYW5kbGVNZShyZXEpIHtcbiAgICBpZiAoIXJlcS5pbmZvIHx8ICFyZXEuaW5mby5zZXNzaW9uVG9rZW4pIHtcbiAgICAgIHRocm93IG5ldyBQYXJzZS5FcnJvcihQYXJzZS5FcnJvci5JTlZBTElEX1NFU1NJT05fVE9LRU4sICdJbnZhbGlkIHNlc3Npb24gdG9rZW4nKTtcbiAgICB9XG4gICAgY29uc3Qgc2Vzc2lvblRva2VuID0gcmVxLmluZm8uc2Vzc2lvblRva2VuO1xuICAgIHJldHVybiByZXN0XG4gICAgICAuZmluZChcbiAgICAgICAgcmVxLmNvbmZpZyxcbiAgICAgICAgQXV0aC5tYXN0ZXIocmVxLmNvbmZpZyksXG4gICAgICAgICdfU2Vzc2lvbicsXG4gICAgICAgIHsgc2Vzc2lvblRva2VuIH0sXG4gICAgICAgIHsgaW5jbHVkZTogJ3VzZXInIH0sXG4gICAgICAgIHJlcS5pbmZvLmNsaWVudFNESyxcbiAgICAgICAgcmVxLmluZm8uY29udGV4dFxuICAgICAgKVxuICAgICAgLnRoZW4ocmVzcG9uc2UgPT4ge1xuICAgICAgICBpZiAoIXJlc3BvbnNlLnJlc3VsdHMgfHwgcmVzcG9uc2UucmVzdWx0cy5sZW5ndGggPT0gMCB8fCAhcmVzcG9uc2UucmVzdWx0c1swXS51c2VyKSB7XG4gICAgICAgICAgdGhyb3cgbmV3IFBhcnNlLkVycm9yKFBhcnNlLkVycm9yLklOVkFMSURfU0VTU0lPTl9UT0tFTiwgJ0ludmFsaWQgc2Vzc2lvbiB0b2tlbicpO1xuICAgICAgICB9IGVsc2Uge1xuICAgICAgICAgIGNvbnN0IHVzZXIgPSByZXNwb25zZS5yZXN1bHRzWzBdLnVzZXI7XG4gICAgICAgICAgLy8gU2VuZCB0b2tlbiBiYWNrIG9uIHRoZSBsb2dpbiwgYmVjYXVzZSBTREtzIGV4cGVjdCB0aGF0LlxuICAgICAgICAgIHVzZXIuc2Vzc2lvblRva2VuID0gc2Vzc2lvblRva2VuO1xuXG4gICAgICAgICAgLy8gUmVtb3ZlIGhpZGRlbiBwcm9wZXJ0aWVzLlxuICAgICAgICAgIFVzZXJzUm91dGVyLnJlbW92ZUhpZGRlblByb3BlcnRpZXModXNlcik7XG4gICAgICAgICAgcmV0dXJuIHsgcmVzcG9uc2U6IHVzZXIgfTtcbiAgICAgICAgfVxuICAgICAgfSk7XG4gIH1cblxuICBhc3luYyBoYW5kbGVMb2dJbihyZXEpIHtcbiAgICBjb25zdCB1c2VyID0gYXdhaXQgdGhpcy5fYXV0aGVudGljYXRlVXNlckZyb21SZXF1ZXN0KHJlcSk7XG4gICAgY29uc3QgYXV0aERhdGEgPSByZXEuYm9keSAmJiByZXEuYm9keS5hdXRoRGF0YTtcbiAgICAvLyBDaGVjayBpZiB1c2VyIGhhcyBwcm92aWRlZCB0aGVpciByZXF1aXJlZCBhdXRoIHByb3ZpZGVyc1xuICAgIEF1dGguY2hlY2tJZlVzZXJIYXNQcm92aWRlZENvbmZpZ3VyZWRQcm92aWRlcnNGb3JMb2dpbihhdXRoRGF0YSwgdXNlci5hdXRoRGF0YSwgcmVxLmNvbmZpZyk7XG5cbiAgICBsZXQgYXV0aERhdGFSZXNwb25zZTtcbiAgICBsZXQgdmFsaWRhdGVkQXV0aERhdGE7XG4gICAgaWYgKGF1dGhEYXRhKSB7XG4gICAgICBjb25zdCByZXMgPSBhd2FpdCBBdXRoLmhhbmRsZUF1dGhEYXRhVmFsaWRhdGlvbihcbiAgICAgICAgYXV0aERhdGEsXG4gICAgICAgIG5ldyBSZXN0V3JpdGUoXG4gICAgICAgICAgcmVxLmNvbmZpZyxcbiAgICAgICAgICByZXEuYXV0aCxcbiAgICAgICAgICAnX1VzZXInLFxuICAgICAgICAgIHsgb2JqZWN0SWQ6IHVzZXIub2JqZWN0SWQgfSxcbiAgICAgICAgICByZXEuYm9keSxcbiAgICAgICAgICB1c2VyLFxuICAgICAgICAgIHJlcS5pbmZvLmNsaWVudFNESyxcbiAgICAgICAgICByZXEuaW5mby5jb250ZXh0XG4gICAgICAgICksXG4gICAgICAgIHVzZXJcbiAgICAgICk7XG4gICAgICBhdXRoRGF0YVJlc3BvbnNlID0gcmVzLmF1dGhEYXRhUmVzcG9uc2U7XG4gICAgICB2YWxpZGF0ZWRBdXRoRGF0YSA9IHJlcy5hdXRoRGF0YTtcbiAgICB9XG5cbiAgICAvLyBoYW5kbGUgcGFzc3dvcmQgZXhwaXJ5IHBvbGljeVxuICAgIGlmIChyZXEuY29uZmlnLnBhc3N3b3JkUG9saWN5ICYmIHJlcS5jb25maWcucGFzc3dvcmRQb2xpY3kubWF4UGFzc3dvcmRBZ2UpIHtcbiAgICAgIGxldCBjaGFuZ2VkQXQgPSB1c2VyLl9wYXNzd29yZF9jaGFuZ2VkX2F0O1xuXG4gICAgICBpZiAoIWNoYW5nZWRBdCkge1xuICAgICAgICAvLyBwYXNzd29yZCB3YXMgY3JlYXRlZCBiZWZvcmUgZXhwaXJ5IHBvbGljeSB3YXMgZW5hYmxlZC5cbiAgICAgICAgLy8gc2ltcGx5IHVwZGF0ZSBfVXNlciBvYmplY3Qgc28gdGhhdCBpdCB3aWxsIHN0YXJ0IGVuZm9yY2luZyBmcm9tIG5vd1xuICAgICAgICBjaGFuZ2VkQXQgPSBuZXcgRGF0ZSgpO1xuICAgICAgICByZXEuY29uZmlnLmRhdGFiYXNlLnVwZGF0ZShcbiAgICAgICAgICAnX1VzZXInLFxuICAgICAgICAgIHsgdXNlcm5hbWU6IHVzZXIudXNlcm5hbWUgfSxcbiAgICAgICAgICB7IF9wYXNzd29yZF9jaGFuZ2VkX2F0OiBQYXJzZS5fZW5jb2RlKGNoYW5nZWRBdCkgfVxuICAgICAgICApO1xuICAgICAgfSBlbHNlIHtcbiAgICAgICAgLy8gY2hlY2sgd2hldGhlciB0aGUgcGFzc3dvcmQgaGFzIGV4cGlyZWRcbiAgICAgICAgaWYgKGNoYW5nZWRBdC5fX3R5cGUgPT0gJ0RhdGUnKSB7XG4gICAgICAgICAgY2hhbmdlZEF0ID0gbmV3IERhdGUoY2hhbmdlZEF0Lmlzbyk7XG4gICAgICAgIH1cbiAgICAgICAgLy8gQ2FsY3VsYXRlIHRoZSBleHBpcnkgdGltZS5cbiAgICAgICAgY29uc3QgZXhwaXJlc0F0ID0gbmV3IERhdGUoXG4gICAgICAgICAgY2hhbmdlZEF0LmdldFRpbWUoKSArIDg2NDAwMDAwICogcmVxLmNvbmZpZy5wYXNzd29yZFBvbGljeS5tYXhQYXNzd29yZEFnZVxuICAgICAgICApO1xuICAgICAgICBpZiAoZXhwaXJlc0F0IDwgbmV3IERhdGUoKSlcbiAgICAgICAgICAvLyBmYWlsIG9mIGN1cnJlbnQgdGltZSBpcyBwYXN0IHBhc3N3b3JkIGV4cGlyeSB0aW1lXG4gICAgICAgICAgdGhyb3cgbmV3IFBhcnNlLkVycm9yKFxuICAgICAgICAgICAgUGFyc2UuRXJyb3IuT0JKRUNUX05PVF9GT1VORCxcbiAgICAgICAgICAgICdZb3VyIHBhc3N3b3JkIGhhcyBleHBpcmVkLiBQbGVhc2UgcmVzZXQgeW91ciBwYXNzd29yZC4nXG4gICAgICAgICAgKTtcbiAgICAgIH1cbiAgICB9XG5cbiAgICAvLyBSZW1vdmUgaGlkZGVuIHByb3BlcnRpZXMuXG4gICAgVXNlcnNSb3V0ZXIucmVtb3ZlSGlkZGVuUHJvcGVydGllcyh1c2VyKTtcblxuICAgIHJlcS5jb25maWcuZmlsZXNDb250cm9sbGVyLmV4cGFuZEZpbGVzSW5PYmplY3QocmVxLmNvbmZpZywgdXNlcik7XG5cbiAgICAvLyBCZWZvcmUgbG9naW4gdHJpZ2dlcjsgdGhyb3dzIGlmIGZhaWx1cmVcbiAgICBhd2FpdCBtYXliZVJ1blRyaWdnZXIoXG4gICAgICBUcmlnZ2VyVHlwZXMuYmVmb3JlTG9naW4sXG4gICAgICByZXEuYXV0aCxcbiAgICAgIFBhcnNlLlVzZXIuZnJvbUpTT04oT2JqZWN0LmFzc2lnbih7IGNsYXNzTmFtZTogJ19Vc2VyJyB9LCB1c2VyKSksXG4gICAgICBudWxsLFxuICAgICAgcmVxLmNvbmZpZ1xuICAgICk7XG5cbiAgICAvLyBJZiB3ZSBoYXZlIHNvbWUgbmV3IHZhbGlkYXRlZCBhdXRoRGF0YSB1cGRhdGUgZGlyZWN0bHlcbiAgICBpZiAodmFsaWRhdGVkQXV0aERhdGEgJiYgT2JqZWN0LmtleXModmFsaWRhdGVkQXV0aERhdGEpLmxlbmd0aCkge1xuICAgICAgYXdhaXQgcmVxLmNvbmZpZy5kYXRhYmFzZS51cGRhdGUoXG4gICAgICAgICdfVXNlcicsXG4gICAgICAgIHsgb2JqZWN0SWQ6IHVzZXIub2JqZWN0SWQgfSxcbiAgICAgICAgeyBhdXRoRGF0YTogdmFsaWRhdGVkQXV0aERhdGEgfSxcbiAgICAgICAge31cbiAgICAgICk7XG4gICAgfVxuXG4gICAgY29uc3QgeyBzZXNzaW9uRGF0YSwgY3JlYXRlU2Vzc2lvbiB9ID0gUmVzdFdyaXRlLmNyZWF0ZVNlc3Npb24ocmVxLmNvbmZpZywge1xuICAgICAgdXNlcklkOiB1c2VyLm9iamVjdElkLFxuICAgICAgY3JlYXRlZFdpdGg6IHtcbiAgICAgICAgYWN0aW9uOiAnbG9naW4nLFxuICAgICAgICBhdXRoUHJvdmlkZXI6ICdwYXNzd29yZCcsXG4gICAgICB9LFxuICAgICAgaW5zdGFsbGF0aW9uSWQ6IHJlcS5pbmZvLmluc3RhbGxhdGlvbklkLFxuICAgIH0pO1xuXG4gICAgdXNlci5zZXNzaW9uVG9rZW4gPSBzZXNzaW9uRGF0YS5zZXNzaW9uVG9rZW47XG5cbiAgICBhd2FpdCBjcmVhdGVTZXNzaW9uKCk7XG5cbiAgICBjb25zdCBhZnRlckxvZ2luVXNlciA9IFBhcnNlLlVzZXIuZnJvbUpTT04oT2JqZWN0LmFzc2lnbih7IGNsYXNzTmFtZTogJ19Vc2VyJyB9LCB1c2VyKSk7XG4gICAgbWF5YmVSdW5UcmlnZ2VyKFxuICAgICAgVHJpZ2dlclR5cGVzLmFmdGVyTG9naW4sXG4gICAgICB7IC4uLnJlcS5hdXRoLCB1c2VyOiBhZnRlckxvZ2luVXNlciB9LFxuICAgICAgYWZ0ZXJMb2dpblVzZXIsXG4gICAgICBudWxsLFxuICAgICAgcmVxLmNvbmZpZ1xuICAgICk7XG5cbiAgICBpZiAoYXV0aERhdGFSZXNwb25zZSkge1xuICAgICAgdXNlci5hdXRoRGF0YVJlc3BvbnNlID0gYXV0aERhdGFSZXNwb25zZTtcbiAgICB9XG5cbiAgICByZXR1cm4geyByZXNwb25zZTogdXNlciB9O1xuICB9XG5cbiAgLyoqXG4gICAqIFRoaXMgYWxsb3dzIG1hc3Rlci1rZXkgY2xpZW50cyB0byBjcmVhdGUgdXNlciBzZXNzaW9ucyB3aXRob3V0IGFjY2VzcyB0b1xuICAgKiB1c2VyIGNyZWRlbnRpYWxzLiBUaGlzIGVuYWJsZXMgc3lzdGVtcyB0aGF0IGNhbiBhdXRoZW50aWNhdGUgYWNjZXNzIGFub3RoZXJcbiAgICogd2F5IChBUEkga2V5LCBhcHAgYWRtaW5pc3RyYXRvcnMpIHRvIGFjdCBvbiBhIHVzZXIncyBiZWhhbGYuXG4gICAqXG4gICAqIFdlIGNyZWF0ZSBhIG5ldyBzZXNzaW9uIHJhdGhlciB0aGFuIGxvb2tpbmcgZm9yIGFuIGV4aXN0aW5nIHNlc3Npb247IHdlXG4gICAqIHdhbnQgdGhpcyB0byB3b3JrIGluIHNpdHVhdGlvbnMgd2hlcmUgdGhlIHVzZXIgaXMgbG9nZ2VkIG91dCBvbiBhbGxcbiAgICogZGV2aWNlcywgc2luY2UgdGhpcyBjYW4gYmUgdXNlZCBieSBhdXRvbWF0ZWQgc3lzdGVtcyBhY3Rpbmcgb24gdGhlIHVzZXInc1xuICAgKiBiZWhhbGYuXG4gICAqXG4gICAqIEZvciB0aGUgbW9tZW50LCB3ZSdyZSBvbWl0dGluZyBldmVudCBob29rcyBhbmQgbG9ja291dCBjaGVja3MsIHNpbmNlXG4gICAqIGltbWVkaWF0ZSB1c2UgY2FzZXMgc3VnZ2VzdCAvbG9naW5BcyBjb3VsZCBiZSB1c2VkIGZvciBzZW1hbnRpY2FsbHlcbiAgICogZGlmZmVyZW50IHJlYXNvbnMgZnJvbSAvbG9naW5cbiAgICovXG4gIGFzeW5jIGhhbmRsZUxvZ0luQXMocmVxKSB7XG4gICAgaWYgKCFyZXEuYXV0aC5pc01hc3Rlcikge1xuICAgICAgdGhyb3cgbmV3IFBhcnNlLkVycm9yKFBhcnNlLkVycm9yLk9QRVJBVElPTl9GT1JCSURERU4sICdtYXN0ZXIga2V5IGlzIHJlcXVpcmVkJyk7XG4gICAgfVxuXG4gICAgY29uc3QgdXNlcklkID0gcmVxLmJvZHkudXNlcklkIHx8IHJlcS5xdWVyeS51c2VySWQ7XG4gICAgaWYgKCF1c2VySWQpIHtcbiAgICAgIHRocm93IG5ldyBQYXJzZS5FcnJvcihcbiAgICAgICAgUGFyc2UuRXJyb3IuSU5WQUxJRF9WQUxVRSxcbiAgICAgICAgJ3VzZXJJZCBtdXN0IG5vdCBiZSBlbXB0eSwgbnVsbCwgb3IgdW5kZWZpbmVkJ1xuICAgICAgKTtcbiAgICB9XG5cbiAgICBjb25zdCBxdWVyeVJlc3VsdHMgPSBhd2FpdCByZXEuY29uZmlnLmRhdGFiYXNlLmZpbmQoJ19Vc2VyJywgeyBvYmplY3RJZDogdXNlcklkIH0pO1xuICAgIGNvbnN0IHVzZXIgPSBxdWVyeVJlc3VsdHNbMF07XG4gICAgaWYgKCF1c2VyKSB7XG4gICAgICB0aHJvdyBuZXcgUGFyc2UuRXJyb3IoUGFyc2UuRXJyb3IuT0JKRUNUX05PVF9GT1VORCwgJ3VzZXIgbm90IGZvdW5kJyk7XG4gICAgfVxuXG4gICAgdGhpcy5fc2FuaXRpemVBdXRoRGF0YSh1c2VyKTtcblxuICAgIGNvbnN0IHsgc2Vzc2lvbkRhdGEsIGNyZWF0ZVNlc3Npb24gfSA9IFJlc3RXcml0ZS5jcmVhdGVTZXNzaW9uKHJlcS5jb25maWcsIHtcbiAgICAgIHVzZXJJZCxcbiAgICAgIGNyZWF0ZWRXaXRoOiB7XG4gICAgICAgIGFjdGlvbjogJ2xvZ2luJyxcbiAgICAgICAgYXV0aFByb3ZpZGVyOiAnbWFzdGVya2V5JyxcbiAgICAgIH0sXG4gICAgICBpbnN0YWxsYXRpb25JZDogcmVxLmluZm8uaW5zdGFsbGF0aW9uSWQsXG4gICAgfSk7XG5cbiAgICB1c2VyLnNlc3Npb25Ub2tlbiA9IHNlc3Npb25EYXRhLnNlc3Npb25Ub2tlbjtcblxuICAgIGF3YWl0IGNyZWF0ZVNlc3Npb24oKTtcblxuICAgIHJldHVybiB7IHJlc3BvbnNlOiB1c2VyIH07XG4gIH1cblxuICBoYW5kbGVWZXJpZnlQYXNzd29yZChyZXEpIHtcbiAgICByZXR1cm4gdGhpcy5fYXV0aGVudGljYXRlVXNlckZyb21SZXF1ZXN0KHJlcSlcbiAgICAgIC50aGVuKHVzZXIgPT4ge1xuICAgICAgICAvLyBSZW1vdmUgaGlkZGVuIHByb3BlcnRpZXMuXG4gICAgICAgIFVzZXJzUm91dGVyLnJlbW92ZUhpZGRlblByb3BlcnRpZXModXNlcik7XG5cbiAgICAgICAgcmV0dXJuIHsgcmVzcG9uc2U6IHVzZXIgfTtcbiAgICAgIH0pXG4gICAgICAuY2F0Y2goZXJyb3IgPT4ge1xuICAgICAgICB0aHJvdyBlcnJvcjtcbiAgICAgIH0pO1xuICB9XG5cbiAgaGFuZGxlTG9nT3V0KHJlcSkge1xuICAgIGNvbnN0IHN1Y2Nlc3MgPSB7IHJlc3BvbnNlOiB7fSB9O1xuICAgIGlmIChyZXEuaW5mbyAmJiByZXEuaW5mby5zZXNzaW9uVG9rZW4pIHtcbiAgICAgIHJldHVybiByZXN0XG4gICAgICAgIC5maW5kKFxuICAgICAgICAgIHJlcS5jb25maWcsXG4gICAgICAgICAgQXV0aC5tYXN0ZXIocmVxLmNvbmZpZyksXG4gICAgICAgICAgJ19TZXNzaW9uJyxcbiAgICAgICAgICB7IHNlc3Npb25Ub2tlbjogcmVxLmluZm8uc2Vzc2lvblRva2VuIH0sXG4gICAgICAgICAgdW5kZWZpbmVkLFxuICAgICAgICAgIHJlcS5pbmZvLmNsaWVudFNESyxcbiAgICAgICAgICByZXEuaW5mby5jb250ZXh0XG4gICAgICAgIClcbiAgICAgICAgLnRoZW4ocmVjb3JkcyA9PiB7XG4gICAgICAgICAgaWYgKHJlY29yZHMucmVzdWx0cyAmJiByZWNvcmRzLnJlc3VsdHMubGVuZ3RoKSB7XG4gICAgICAgICAgICByZXR1cm4gcmVzdFxuICAgICAgICAgICAgICAuZGVsKFxuICAgICAgICAgICAgICAgIHJlcS5jb25maWcsXG4gICAgICAgICAgICAgICAgQXV0aC5tYXN0ZXIocmVxLmNvbmZpZyksXG4gICAgICAgICAgICAgICAgJ19TZXNzaW9uJyxcbiAgICAgICAgICAgICAgICByZWNvcmRzLnJlc3VsdHNbMF0ub2JqZWN0SWQsXG4gICAgICAgICAgICAgICAgcmVxLmluZm8uY29udGV4dFxuICAgICAgICAgICAgICApXG4gICAgICAgICAgICAgIC50aGVuKCgpID0+IHtcbiAgICAgICAgICAgICAgICB0aGlzLl9ydW5BZnRlckxvZ291dFRyaWdnZXIocmVxLCByZWNvcmRzLnJlc3VsdHNbMF0pO1xuICAgICAgICAgICAgICAgIHJldHVybiBQcm9taXNlLnJlc29sdmUoc3VjY2Vzcyk7XG4gICAgICAgICAgICAgIH0pO1xuICAgICAgICAgIH1cbiAgICAgICAgICByZXR1cm4gUHJvbWlzZS5yZXNvbHZlKHN1Y2Nlc3MpO1xuICAgICAgICB9KTtcbiAgICB9XG4gICAgcmV0dXJuIFByb21pc2UucmVzb2x2ZShzdWNjZXNzKTtcbiAgfVxuXG4gIF9ydW5BZnRlckxvZ291dFRyaWdnZXIocmVxLCBzZXNzaW9uKSB7XG4gICAgLy8gQWZ0ZXIgbG9nb3V0IHRyaWdnZXJcbiAgICBtYXliZVJ1blRyaWdnZXIoXG4gICAgICBUcmlnZ2VyVHlwZXMuYWZ0ZXJMb2dvdXQsXG4gICAgICByZXEuYXV0aCxcbiAgICAgIFBhcnNlLlNlc3Npb24uZnJvbUpTT04oT2JqZWN0LmFzc2lnbih7IGNsYXNzTmFtZTogJ19TZXNzaW9uJyB9LCBzZXNzaW9uKSksXG4gICAgICBudWxsLFxuICAgICAgcmVxLmNvbmZpZ1xuICAgICk7XG4gIH1cblxuICBfdGhyb3dPbkJhZEVtYWlsQ29uZmlnKHJlcSkge1xuICAgIHRyeSB7XG4gICAgICBDb25maWcudmFsaWRhdGVFbWFpbENvbmZpZ3VyYXRpb24oe1xuICAgICAgICBlbWFpbEFkYXB0ZXI6IHJlcS5jb25maWcudXNlckNvbnRyb2xsZXIuYWRhcHRlcixcbiAgICAgICAgYXBwTmFtZTogcmVxLmNvbmZpZy5hcHBOYW1lLFxuICAgICAgICBwdWJsaWNTZXJ2ZXJVUkw6IHJlcS5jb25maWcucHVibGljU2VydmVyVVJMLFxuICAgICAgICBlbWFpbFZlcmlmeVRva2VuVmFsaWRpdHlEdXJhdGlvbjogcmVxLmNvbmZpZy5lbWFpbFZlcmlmeVRva2VuVmFsaWRpdHlEdXJhdGlvbixcbiAgICAgICAgZW1haWxWZXJpZnlUb2tlblJldXNlSWZWYWxpZDogcmVxLmNvbmZpZy5lbWFpbFZlcmlmeVRva2VuUmV1c2VJZlZhbGlkLFxuICAgICAgfSk7XG4gICAgfSBjYXRjaCAoZSkge1xuICAgICAgaWYgKHR5cGVvZiBlID09PSAnc3RyaW5nJykge1xuICAgICAgICAvLyBNYXliZSB3ZSBuZWVkIGEgQmFkIENvbmZpZ3VyYXRpb24gZXJyb3IsIGJ1dCB0aGUgU0RLcyB3b24ndCB1bmRlcnN0YW5kIGl0LiBGb3Igbm93LCBJbnRlcm5hbCBTZXJ2ZXIgRXJyb3IuXG4gICAgICAgIHRocm93IG5ldyBQYXJzZS5FcnJvcihcbiAgICAgICAgICBQYXJzZS5FcnJvci5JTlRFUk5BTF9TRVJWRVJfRVJST1IsXG4gICAgICAgICAgJ0FuIGFwcE5hbWUsIHB1YmxpY1NlcnZlclVSTCwgYW5kIGVtYWlsQWRhcHRlciBhcmUgcmVxdWlyZWQgZm9yIHBhc3N3b3JkIHJlc2V0IGFuZCBlbWFpbCB2ZXJpZmljYXRpb24gZnVuY3Rpb25hbGl0eS4nXG4gICAgICAgICk7XG4gICAgICB9IGVsc2Uge1xuICAgICAgICB0aHJvdyBlO1xuICAgICAgfVxuICAgIH1cbiAgfVxuXG4gIGhhbmRsZVJlc2V0UmVxdWVzdChyZXEpIHtcbiAgICB0aGlzLl90aHJvd09uQmFkRW1haWxDb25maWcocmVxKTtcblxuICAgIGNvbnN0IHsgZW1haWwgfSA9IHJlcS5ib2R5O1xuICAgIGlmICghZW1haWwpIHtcbiAgICAgIHRocm93IG5ldyBQYXJzZS5FcnJvcihQYXJzZS5FcnJvci5FTUFJTF9NSVNTSU5HLCAneW91IG11c3QgcHJvdmlkZSBhbiBlbWFpbCcpO1xuICAgIH1cbiAgICBpZiAodHlwZW9mIGVtYWlsICE9PSAnc3RyaW5nJykge1xuICAgICAgdGhyb3cgbmV3IFBhcnNlLkVycm9yKFxuICAgICAgICBQYXJzZS5FcnJvci5JTlZBTElEX0VNQUlMX0FERFJFU1MsXG4gICAgICAgICd5b3UgbXVzdCBwcm92aWRlIGEgdmFsaWQgZW1haWwgc3RyaW5nJ1xuICAgICAgKTtcbiAgICB9XG4gICAgY29uc3QgdXNlckNvbnRyb2xsZXIgPSByZXEuY29uZmlnLnVzZXJDb250cm9sbGVyO1xuICAgIHJldHVybiB1c2VyQ29udHJvbGxlci5zZW5kUGFzc3dvcmRSZXNldEVtYWlsKGVtYWlsKS50aGVuKFxuICAgICAgKCkgPT4ge1xuICAgICAgICByZXR1cm4gUHJvbWlzZS5yZXNvbHZlKHtcbiAgICAgICAgICByZXNwb25zZToge30sXG4gICAgICAgIH0pO1xuICAgICAgfSxcbiAgICAgIGVyciA9PiB7XG4gICAgICAgIGlmIChlcnIuY29kZSA9PT0gUGFyc2UuRXJyb3IuT0JKRUNUX05PVF9GT1VORCkge1xuICAgICAgICAgIC8vIFJldHVybiBzdWNjZXNzIHNvIHRoYXQgdGhpcyBlbmRwb2ludCBjYW4ndFxuICAgICAgICAgIC8vIGJlIHVzZWQgdG8gZW51bWVyYXRlIHZhbGlkIGVtYWlsc1xuICAgICAgICAgIHJldHVybiBQcm9taXNlLnJlc29sdmUoe1xuICAgICAgICAgICAgcmVzcG9uc2U6IHt9LFxuICAgICAgICAgIH0pO1xuICAgICAgICB9IGVsc2Uge1xuICAgICAgICAgIHRocm93IGVycjtcbiAgICAgICAgfVxuICAgICAgfVxuICAgICk7XG4gIH1cblxuICBoYW5kbGVWZXJpZmljYXRpb25FbWFpbFJlcXVlc3QocmVxKSB7XG4gICAgdGhpcy5fdGhyb3dPbkJhZEVtYWlsQ29uZmlnKHJlcSk7XG5cbiAgICBjb25zdCB7IGVtYWlsIH0gPSByZXEuYm9keTtcbiAgICBpZiAoIWVtYWlsKSB7XG4gICAgICB0aHJvdyBuZXcgUGFyc2UuRXJyb3IoUGFyc2UuRXJyb3IuRU1BSUxfTUlTU0lORywgJ3lvdSBtdXN0IHByb3ZpZGUgYW4gZW1haWwnKTtcbiAgICB9XG4gICAgaWYgKHR5cGVvZiBlbWFpbCAhPT0gJ3N0cmluZycpIHtcbiAgICAgIHRocm93IG5ldyBQYXJzZS5FcnJvcihcbiAgICAgICAgUGFyc2UuRXJyb3IuSU5WQUxJRF9FTUFJTF9BRERSRVNTLFxuICAgICAgICAneW91IG11c3QgcHJvdmlkZSBhIHZhbGlkIGVtYWlsIHN0cmluZydcbiAgICAgICk7XG4gICAgfVxuXG4gICAgcmV0dXJuIHJlcS5jb25maWcuZGF0YWJhc2UuZmluZCgnX1VzZXInLCB7IGVtYWlsOiBlbWFpbCB9KS50aGVuKHJlc3VsdHMgPT4ge1xuICAgICAgaWYgKCFyZXN1bHRzLmxlbmd0aCB8fCByZXN1bHRzLmxlbmd0aCA8IDEpIHtcbiAgICAgICAgdGhyb3cgbmV3IFBhcnNlLkVycm9yKFBhcnNlLkVycm9yLkVNQUlMX05PVF9GT1VORCwgYE5vIHVzZXIgZm91bmQgd2l0aCBlbWFpbCAke2VtYWlsfWApO1xuICAgICAgfVxuICAgICAgY29uc3QgdXNlciA9IHJlc3VsdHNbMF07XG5cbiAgICAgIC8vIHJlbW92ZSBwYXNzd29yZCBmaWVsZCwgbWVzc2VzIHdpdGggc2F2aW5nIG9uIHBvc3RncmVzXG4gICAgICBkZWxldGUgdXNlci5wYXNzd29yZDtcblxuICAgICAgaWYgKHVzZXIuZW1haWxWZXJpZmllZCkge1xuICAgICAgICB0aHJvdyBuZXcgUGFyc2UuRXJyb3IoUGFyc2UuRXJyb3IuT1RIRVJfQ0FVU0UsIGBFbWFpbCAke2VtYWlsfSBpcyBhbHJlYWR5IHZlcmlmaWVkLmApO1xuICAgICAgfVxuXG4gICAgICBjb25zdCB1c2VyQ29udHJvbGxlciA9IHJlcS5jb25maWcudXNlckNvbnRyb2xsZXI7XG4gICAgICByZXR1cm4gdXNlckNvbnRyb2xsZXIucmVnZW5lcmF0ZUVtYWlsVmVyaWZ5VG9rZW4odXNlcikudGhlbigoKSA9PiB7XG4gICAgICAgIHVzZXJDb250cm9sbGVyLnNlbmRWZXJpZmljYXRpb25FbWFpbCh1c2VyKTtcbiAgICAgICAgcmV0dXJuIHsgcmVzcG9uc2U6IHt9IH07XG4gICAgICB9KTtcbiAgICB9KTtcbiAgfVxuXG4gIGFzeW5jIGhhbmRsZUNoYWxsZW5nZShyZXEpIHtcbiAgICBjb25zdCB7IHVzZXJuYW1lLCBlbWFpbCwgcGFzc3dvcmQsIGF1dGhEYXRhLCBjaGFsbGVuZ2VEYXRhIH0gPSByZXEuYm9keTtcblxuICAgIC8vIGlmIHVzZXJuYW1lIG9yIGVtYWlsIHByb3ZpZGVkIHdpdGggcGFzc3dvcmQgdHJ5IHRvIGF1dGhlbnRpY2F0ZSB0aGUgdXNlciBieSB1c2VybmFtZVxuICAgIGxldCB1c2VyO1xuICAgIGlmICh1c2VybmFtZSB8fCBlbWFpbCkge1xuICAgICAgaWYgKCFwYXNzd29yZCkge1xuICAgICAgICB0aHJvdyBuZXcgUGFyc2UuRXJyb3IoXG4gICAgICAgICAgUGFyc2UuRXJyb3IuT1RIRVJfQ0FVU0UsXG4gICAgICAgICAgJ1lvdSBwcm92aWRlZCB1c2VybmFtZSBvciBlbWFpbCwgeW91IG5lZWQgdG8gYWxzbyBwcm92aWRlIHBhc3N3b3JkLidcbiAgICAgICAgKTtcbiAgICAgIH1cbiAgICAgIHVzZXIgPSBhd2FpdCB0aGlzLl9hdXRoZW50aWNhdGVVc2VyRnJvbVJlcXVlc3QocmVxKTtcbiAgICB9XG5cbiAgICBpZiAoIWNoYWxsZW5nZURhdGEpIHtcbiAgICAgIHRocm93IG5ldyBQYXJzZS5FcnJvcihQYXJzZS5FcnJvci5PVEhFUl9DQVVTRSwgJ05vdGhpbmcgdG8gY2hhbGxlbmdlLicpO1xuICAgIH1cblxuICAgIGlmICh0eXBlb2YgY2hhbGxlbmdlRGF0YSAhPT0gJ29iamVjdCcpIHtcbiAgICAgIHRocm93IG5ldyBQYXJzZS5FcnJvcihQYXJzZS5FcnJvci5PVEhFUl9DQVVTRSwgJ2NoYWxsZW5nZURhdGEgc2hvdWxkIGJlIGFuIG9iamVjdC4nKTtcbiAgICB9XG5cbiAgICBsZXQgcmVxdWVzdDtcbiAgICBsZXQgcGFyc2VVc2VyO1xuXG4gICAgLy8gVHJ5IHRvIGZpbmQgdXNlciBieSBhdXRoRGF0YVxuICAgIGlmIChhdXRoRGF0YSkge1xuICAgICAgaWYgKHR5cGVvZiBhdXRoRGF0YSAhPT0gJ29iamVjdCcpIHtcbiAgICAgICAgdGhyb3cgbmV3IFBhcnNlLkVycm9yKFBhcnNlLkVycm9yLk9USEVSX0NBVVNFLCAnYXV0aERhdGEgc2hvdWxkIGJlIGFuIG9iamVjdC4nKTtcbiAgICAgIH1cbiAgICAgIGlmICh1c2VyKSB7XG4gICAgICAgIHRocm93IG5ldyBQYXJzZS5FcnJvcihcbiAgICAgICAgICBQYXJzZS5FcnJvci5PVEhFUl9DQVVTRSxcbiAgICAgICAgICAnWW91IGNhbm5vdCBwcm92aWRlIHVzZXJuYW1lL2VtYWlsIGFuZCBhdXRoRGF0YSwgb25seSB1c2Ugb25lIGlkZW50aWZpY2F0aW9uIG1ldGhvZC4nXG4gICAgICAgICk7XG4gICAgICB9XG5cbiAgICAgIGlmIChPYmplY3Qua2V5cyhhdXRoRGF0YSkuZmlsdGVyKGtleSA9PiBhdXRoRGF0YVtrZXldLmlkKS5sZW5ndGggPiAxKSB7XG4gICAgICAgIHRocm93IG5ldyBQYXJzZS5FcnJvcihcbiAgICAgICAgICBQYXJzZS5FcnJvci5PVEhFUl9DQVVTRSxcbiAgICAgICAgICAnWW91IGNhbm5vdCBwcm92aWRlIG1vcmUgdGhhbiBvbmUgYXV0aERhdGEgcHJvdmlkZXIgd2l0aCBhbiBpZC4nXG4gICAgICAgICk7XG4gICAgICB9XG5cbiAgICAgIGNvbnN0IHJlc3VsdHMgPSBhd2FpdCBBdXRoLmZpbmRVc2Vyc1dpdGhBdXRoRGF0YShyZXEuY29uZmlnLCBhdXRoRGF0YSk7XG5cbiAgICAgIHRyeSB7XG4gICAgICAgIGlmICghcmVzdWx0c1swXSB8fCByZXN1bHRzLmxlbmd0aCA+IDEpIHtcbiAgICAgICAgICB0aHJvdyBuZXcgUGFyc2UuRXJyb3IoUGFyc2UuRXJyb3IuT0JKRUNUX05PVF9GT1VORCwgJ1VzZXIgbm90IGZvdW5kLicpO1xuICAgICAgICB9XG4gICAgICAgIC8vIEZpbmQgdGhlIHByb3ZpZGVyIHVzZWQgdG8gZmluZCB0aGUgdXNlclxuICAgICAgICBjb25zdCBwcm92aWRlciA9IE9iamVjdC5rZXlzKGF1dGhEYXRhKS5maW5kKGtleSA9PiBhdXRoRGF0YVtrZXldLmlkKTtcblxuICAgICAgICBwYXJzZVVzZXIgPSBQYXJzZS5Vc2VyLmZyb21KU09OKHsgY2xhc3NOYW1lOiAnX1VzZXInLCAuLi5yZXN1bHRzWzBdIH0pO1xuICAgICAgICByZXF1ZXN0ID0gZ2V0UmVxdWVzdE9iamVjdCh1bmRlZmluZWQsIHJlcS5hdXRoLCBwYXJzZVVzZXIsIHBhcnNlVXNlciwgcmVxLmNvbmZpZyk7XG4gICAgICAgIHJlcXVlc3QuaXNDaGFsbGVuZ2UgPSB0cnVlO1xuICAgICAgICAvLyBWYWxpZGF0ZSBhdXRoRGF0YSB1c2VkIHRvIGlkZW50aWZ5IHRoZSB1c2VyIHRvIGF2b2lkIGJydXRlLWZvcmNlIGF0dGFjayBvbiBgaWRgXG4gICAgICAgIGNvbnN0IHsgdmFsaWRhdG9yIH0gPSByZXEuY29uZmlnLmF1dGhEYXRhTWFuYWdlci5nZXRWYWxpZGF0b3JGb3JQcm92aWRlcihwcm92aWRlcik7XG4gICAgICAgIGNvbnN0IHZhbGlkYXRvclJlc3BvbnNlID0gYXdhaXQgdmFsaWRhdG9yKGF1dGhEYXRhW3Byb3ZpZGVyXSwgcmVxLCBwYXJzZVVzZXIsIHJlcXVlc3QpO1xuICAgICAgICBpZiAodmFsaWRhdG9yUmVzcG9uc2UgJiYgdmFsaWRhdG9yUmVzcG9uc2UudmFsaWRhdG9yKSB7XG4gICAgICAgICAgYXdhaXQgdmFsaWRhdG9yUmVzcG9uc2UudmFsaWRhdG9yKCk7XG4gICAgICAgIH1cbiAgICAgIH0gY2F0Y2ggKGUpIHtcbiAgICAgICAgLy8gUmV3cml0ZSB0aGUgZXJyb3IgdG8gYXZvaWQgZ3Vlc3MgaWQgYXR0YWNrXG4gICAgICAgIGxvZ2dlci5lcnJvcihlKTtcbiAgICAgICAgdGhyb3cgbmV3IFBhcnNlLkVycm9yKFBhcnNlLkVycm9yLk9CSkVDVF9OT1RfRk9VTkQsICdVc2VyIG5vdCBmb3VuZC4nKTtcbiAgICAgIH1cbiAgICB9XG5cbiAgICBpZiAoIXBhcnNlVXNlcikge1xuICAgICAgcGFyc2VVc2VyID0gdXNlciA/IFBhcnNlLlVzZXIuZnJvbUpTT04oeyBjbGFzc05hbWU6ICdfVXNlcicsIC4uLnVzZXIgfSkgOiB1bmRlZmluZWQ7XG4gICAgfVxuXG4gICAgaWYgKCFyZXF1ZXN0KSB7XG4gICAgICByZXF1ZXN0ID0gZ2V0UmVxdWVzdE9iamVjdCh1bmRlZmluZWQsIHJlcS5hdXRoLCBwYXJzZVVzZXIsIHBhcnNlVXNlciwgcmVxLmNvbmZpZyk7XG4gICAgICByZXF1ZXN0LmlzQ2hhbGxlbmdlID0gdHJ1ZTtcbiAgICB9XG4gICAgY29uc3QgYWNjID0ge307XG4gICAgLy8gRXhlY3V0ZSBjaGFsbGVuZ2Ugc3RlcC1ieS1zdGVwIHdpdGggY29uc2lzdGVudCBvcmRlciBmb3IgYmV0dGVyIGVycm9yIGZlZWRiYWNrXG4gICAgLy8gYW5kIHRvIGF2b2lkIHRvIHRyaWdnZXIgb3RoZXJzIGNoYWxsZW5nZXMgaWYgb25lIG9mIHRoZW0gZmFpbHNcbiAgICBmb3IgKGNvbnN0IHByb3ZpZGVyIG9mIE9iamVjdC5rZXlzKGNoYWxsZW5nZURhdGEpLnNvcnQoKSkge1xuICAgICAgdHJ5IHtcbiAgICAgICAgY29uc3QgYXV0aEFkYXB0ZXIgPSByZXEuY29uZmlnLmF1dGhEYXRhTWFuYWdlci5nZXRWYWxpZGF0b3JGb3JQcm92aWRlcihwcm92aWRlcik7XG4gICAgICAgIGlmICghYXV0aEFkYXB0ZXIpIHtcbiAgICAgICAgICBjb250aW51ZTtcbiAgICAgICAgfVxuICAgICAgICBjb25zdCB7XG4gICAgICAgICAgYWRhcHRlcjogeyBjaGFsbGVuZ2UgfSxcbiAgICAgICAgfSA9IGF1dGhBZGFwdGVyO1xuICAgICAgICBpZiAodHlwZW9mIGNoYWxsZW5nZSA9PT0gJ2Z1bmN0aW9uJykge1xuICAgICAgICAgIGNvbnN0IHByb3ZpZGVyQ2hhbGxlbmdlUmVzcG9uc2UgPSBhd2FpdCBjaGFsbGVuZ2UoXG4gICAgICAgICAgICBjaGFsbGVuZ2VEYXRhW3Byb3ZpZGVyXSxcbiAgICAgICAgICAgIGF1dGhEYXRhICYmIGF1dGhEYXRhW3Byb3ZpZGVyXSxcbiAgICAgICAgICAgIHJlcXVlc3RcbiAgICAgICAgICApO1xuICAgICAgICAgIGFjY1twcm92aWRlcl0gPSBwcm92aWRlckNoYWxsZW5nZVJlc3BvbnNlIHx8IHRydWU7XG4gICAgICAgIH1cbiAgICAgIH0gY2F0Y2ggKGVycikge1xuICAgICAgICBjb25zdCBlID0gcmVzb2x2ZUVycm9yKGVyciwge1xuICAgICAgICAgIGNvZGU6IFBhcnNlLkVycm9yLlNDUklQVF9GQUlMRUQsXG4gICAgICAgICAgbWVzc2FnZTogJ0NoYWxsZW5nZSBmYWlsZWQuIFVua25vd24gZXJyb3IuJyxcbiAgICAgICAgfSk7XG4gICAgICAgIGNvbnN0IHVzZXJTdHJpbmcgPSByZXEuYXV0aCAmJiByZXEuYXV0aC51c2VyID8gcmVxLmF1dGgudXNlci5pZCA6IHVuZGVmaW5lZDtcbiAgICAgICAgbG9nZ2VyLmVycm9yKFxuICAgICAgICAgIGBGYWlsZWQgcnVubmluZyBhdXRoIHN0ZXAgY2hhbGxlbmdlIGZvciAke3Byb3ZpZGVyfSBmb3IgdXNlciAke3VzZXJTdHJpbmd9IHdpdGggRXJyb3I6IGAgK1xuICAgICAgICAgICAgSlNPTi5zdHJpbmdpZnkoZSksXG4gICAgICAgICAge1xuICAgICAgICAgICAgYXV0aGVudGljYXRpb25TdGVwOiAnY2hhbGxlbmdlJyxcbiAgICAgICAgICAgIGVycm9yOiBlLFxuICAgICAgICAgICAgdXNlcjogdXNlclN0cmluZyxcbiAgICAgICAgICAgIHByb3ZpZGVyLFxuICAgICAgICAgIH1cbiAgICAgICAgKTtcbiAgICAgICAgdGhyb3cgZTtcbiAgICAgIH1cbiAgICB9XG4gICAgcmV0dXJuIHsgcmVzcG9uc2U6IHsgY2hhbGxlbmdlRGF0YTogYWNjIH0gfTtcbiAgfVxuXG4gIG1vdW50Um91dGVzKCkge1xuICAgIHRoaXMucm91dGUoJ0dFVCcsICcvdXNlcnMnLCByZXEgPT4ge1xuICAgICAgcmV0dXJuIHRoaXMuaGFuZGxlRmluZChyZXEpO1xuICAgIH0pO1xuICAgIHRoaXMucm91dGUoJ1BPU1QnLCAnL3VzZXJzJywgcHJvbWlzZUVuc3VyZUlkZW1wb3RlbmN5LCByZXEgPT4ge1xuICAgICAgcmV0dXJuIHRoaXMuaGFuZGxlQ3JlYXRlKHJlcSk7XG4gICAgfSk7XG4gICAgdGhpcy5yb3V0ZSgnR0VUJywgJy91c2Vycy9tZScsIHJlcSA9PiB7XG4gICAgICByZXR1cm4gdGhpcy5oYW5kbGVNZShyZXEpO1xuICAgIH0pO1xuICAgIHRoaXMucm91dGUoJ0dFVCcsICcvdXNlcnMvOm9iamVjdElkJywgcmVxID0+IHtcbiAgICAgIHJldHVybiB0aGlzLmhhbmRsZUdldChyZXEpO1xuICAgIH0pO1xuICAgIHRoaXMucm91dGUoJ1BVVCcsICcvdXNlcnMvOm9iamVjdElkJywgcHJvbWlzZUVuc3VyZUlkZW1wb3RlbmN5LCByZXEgPT4ge1xuICAgICAgcmV0dXJuIHRoaXMuaGFuZGxlVXBkYXRlKHJlcSk7XG4gICAgfSk7XG4gICAgdGhpcy5yb3V0ZSgnREVMRVRFJywgJy91c2Vycy86b2JqZWN0SWQnLCByZXEgPT4ge1xuICAgICAgcmV0dXJuIHRoaXMuaGFuZGxlRGVsZXRlKHJlcSk7XG4gICAgfSk7XG4gICAgdGhpcy5yb3V0ZSgnR0VUJywgJy9sb2dpbicsIHJlcSA9PiB7XG4gICAgICByZXR1cm4gdGhpcy5oYW5kbGVMb2dJbihyZXEpO1xuICAgIH0pO1xuICAgIHRoaXMucm91dGUoJ1BPU1QnLCAnL2xvZ2luJywgcmVxID0+IHtcbiAgICAgIHJldHVybiB0aGlzLmhhbmRsZUxvZ0luKHJlcSk7XG4gICAgfSk7XG4gICAgdGhpcy5yb3V0ZSgnUE9TVCcsICcvbG9naW5BcycsIHJlcSA9PiB7XG4gICAgICByZXR1cm4gdGhpcy5oYW5kbGVMb2dJbkFzKHJlcSk7XG4gICAgfSk7XG4gICAgdGhpcy5yb3V0ZSgnUE9TVCcsICcvbG9nb3V0JywgcmVxID0+IHtcbiAgICAgIHJldHVybiB0aGlzLmhhbmRsZUxvZ091dChyZXEpO1xuICAgIH0pO1xuICAgIHRoaXMucm91dGUoJ1BPU1QnLCAnL3JlcXVlc3RQYXNzd29yZFJlc2V0JywgcmVxID0+IHtcbiAgICAgIHJldHVybiB0aGlzLmhhbmRsZVJlc2V0UmVxdWVzdChyZXEpO1xuICAgIH0pO1xuICAgIHRoaXMucm91dGUoJ1BPU1QnLCAnL3ZlcmlmaWNhdGlvbkVtYWlsUmVxdWVzdCcsIHJlcSA9PiB7XG4gICAgICByZXR1cm4gdGhpcy5oYW5kbGVWZXJpZmljYXRpb25FbWFpbFJlcXVlc3QocmVxKTtcbiAgICB9KTtcbiAgICB0aGlzLnJvdXRlKCdHRVQnLCAnL3ZlcmlmeVBhc3N3b3JkJywgcmVxID0+IHtcbiAgICAgIHJldHVybiB0aGlzLmhhbmRsZVZlcmlmeVBhc3N3b3JkKHJlcSk7XG4gICAgfSk7XG4gICAgdGhpcy5yb3V0ZSgnUE9TVCcsICcvY2hhbGxlbmdlJywgcmVxID0+IHtcbiAgICAgIHJldHVybiB0aGlzLmhhbmRsZUNoYWxsZW5nZShyZXEpO1xuICAgIH0pO1xuICB9XG59XG5cbmV4cG9ydCBkZWZhdWx0IFVzZXJzUm91dGVyO1xuIl19