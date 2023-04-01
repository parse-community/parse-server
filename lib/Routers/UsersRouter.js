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
function ownKeys(object, enumerableOnly) { var keys = Object.keys(object); if (Object.getOwnPropertySymbols) { var symbols = Object.getOwnPropertySymbols(object); enumerableOnly && (symbols = symbols.filter(function (sym) { return Object.getOwnPropertyDescriptor(object, sym).enumerable; })), keys.push.apply(keys, symbols); } return keys; }
function _objectSpread(target) { for (var i = 1; i < arguments.length; i++) { var source = null != arguments[i] ? arguments[i] : {}; i % 2 ? ownKeys(Object(source), !0).forEach(function (key) { _defineProperty(target, key, source[key]); }) : Object.getOwnPropertyDescriptors ? Object.defineProperties(target, Object.getOwnPropertyDescriptors(source)) : ownKeys(Object(source)).forEach(function (key) { Object.defineProperty(target, key, Object.getOwnPropertyDescriptor(source, key)); }); } return target; }
function _defineProperty(obj, key, value) { key = _toPropertyKey(key); if (key in obj) { Object.defineProperty(obj, key, { value: value, enumerable: true, configurable: true, writable: true }); } else { obj[key] = value; } return obj; }
function _toPropertyKey(arg) { var key = _toPrimitive(arg, "string"); return typeof key === "symbol" ? key : String(key); }
function _toPrimitive(input, hint) { if (typeof input !== "object" || input === null) return input; var prim = input[Symbol.toPrimitive]; if (prim !== undefined) { var res = prim.call(input, hint || "default"); if (typeof res !== "object") return res; throw new TypeError("@@toPrimitive must return a primitive value."); } return (hint === "string" ? String : Number)(input); } // These methods handle the User-related routes.
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
    delete user.password;

    // Sometimes the authData still has null on that keys
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
      } = payload;

      // TODO: use the right error codes / descriptions.
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
        }
        // Ensure the user isn't locked out
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
        const user = response.results[0].user;
        // Send token back on the login, because SDKs expect that.
        user.sessionToken = sessionToken;

        // Remove hidden properties.
        UsersRouter.removeHiddenProperties(user);
        return {
          response: user
        };
      }
    });
  }
  async handleLogIn(req) {
    const user = await this._authenticateUserFromRequest(req);
    const authData = req.body && req.body.authData;
    // Check if user has provided their required auth providers
    _Auth.default.checkIfUserHasProvidedConfiguredProvidersForLogin(authData, user.authData, req.config);
    let authDataResponse;
    let validatedAuthData;
    if (authData) {
      const res = await _Auth.default.handleAuthDataValidation(authData, new _RestWrite.default(req.config, req.auth, '_User', {
        objectId: user.objectId
      }, req.body, user, req.info.clientSDK, req.info.context), user);
      authDataResponse = res.authDataResponse;
      validatedAuthData = res.authData;
    }

    // handle password expiry policy
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
        }
        // Calculate the expiry time.
        const expiresAt = new Date(changedAt.getTime() + 86400000 * req.config.passwordPolicy.maxPasswordAge);
        if (expiresAt < new Date())
          // fail of current time is past password expiry time
          throw new _node.default.Error(_node.default.Error.OBJECT_NOT_FOUND, 'Your password has expired. Please reset your password.');
      }
    }

    // Remove hidden properties.
    UsersRouter.removeHiddenProperties(user);
    req.config.filesController.expandFilesInObject(req.config, user);

    // Before login trigger; throws if failure
    await (0, _triggers.maybeRunTrigger)(_triggers.Types.beforeLogin, req.auth, _node.default.User.fromJSON(Object.assign({
      className: '_User'
    }, user)), null, req.config);

    // If we have some new validated authData update directly
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
      const user = results[0];

      // remove password field, messes with saving on postgres
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
    } = req.body;

    // if username or email provided with password try to authenticate the user by username
    let user;
    if (username || email) {
      if (!password) throw new _node.default.Error(_node.default.Error.OTHER_CAUSE, 'You provided username or email, you need to also provide password.');
      user = await this._authenticateUserFromRequest(req);
    }
    if (!challengeData) throw new _node.default.Error(_node.default.Error.OTHER_CAUSE, 'Nothing to challenge.');
    if (typeof challengeData !== 'object') throw new _node.default.Error(_node.default.Error.OTHER_CAUSE, 'challengeData should be an object.');
    let request;
    let parseUser;

    // Try to find user by authData
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
        }
        // Find the provider used to find the user
        const provider = Object.keys(authData).find(key => authData[key].id);
        parseUser = _node.default.User.fromJSON(_objectSpread({
          className: '_User'
        }, results[0]));
        request = (0, _triggers.getRequestObject)(undefined, req.auth, parseUser, parseUser, req.config);
        request.isChallenge = true;
        // Validate authData used to identify the user to avoid brute-force attack on `id`
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
    }

    // Execute challenge step-by-step with consistent order for better error feedback
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
//# sourceMappingURL=data:application/json;charset=utf-8;base64,eyJ2ZXJzaW9uIjozLCJuYW1lcyI6WyJfbm9kZSIsIl9pbnRlcm9wUmVxdWlyZURlZmF1bHQiLCJyZXF1aXJlIiwiX0NvbmZpZyIsIl9BY2NvdW50TG9ja291dCIsIl9DbGFzc2VzUm91dGVyIiwiX3Jlc3QiLCJfQXV0aCIsIl9wYXNzd29yZCIsIl90cmlnZ2VycyIsIl9taWRkbGV3YXJlcyIsIl9SZXN0V3JpdGUiLCJfV2luc3RvbkxvZ2dlciIsIm9iaiIsIl9fZXNNb2R1bGUiLCJkZWZhdWx0Iiwib3duS2V5cyIsIm9iamVjdCIsImVudW1lcmFibGVPbmx5Iiwia2V5cyIsIk9iamVjdCIsImdldE93blByb3BlcnR5U3ltYm9scyIsInN5bWJvbHMiLCJmaWx0ZXIiLCJzeW0iLCJnZXRPd25Qcm9wZXJ0eURlc2NyaXB0b3IiLCJlbnVtZXJhYmxlIiwicHVzaCIsImFwcGx5IiwiX29iamVjdFNwcmVhZCIsInRhcmdldCIsImkiLCJhcmd1bWVudHMiLCJsZW5ndGgiLCJzb3VyY2UiLCJmb3JFYWNoIiwia2V5IiwiX2RlZmluZVByb3BlcnR5IiwiZ2V0T3duUHJvcGVydHlEZXNjcmlwdG9ycyIsImRlZmluZVByb3BlcnRpZXMiLCJkZWZpbmVQcm9wZXJ0eSIsInZhbHVlIiwiX3RvUHJvcGVydHlLZXkiLCJjb25maWd1cmFibGUiLCJ3cml0YWJsZSIsImFyZyIsIl90b1ByaW1pdGl2ZSIsIlN0cmluZyIsImlucHV0IiwiaGludCIsInByaW0iLCJTeW1ib2wiLCJ0b1ByaW1pdGl2ZSIsInVuZGVmaW5lZCIsInJlcyIsImNhbGwiLCJUeXBlRXJyb3IiLCJOdW1iZXIiLCJVc2Vyc1JvdXRlciIsIkNsYXNzZXNSb3V0ZXIiLCJjbGFzc05hbWUiLCJyZW1vdmVIaWRkZW5Qcm9wZXJ0aWVzIiwicHJvdG90eXBlIiwiaGFzT3duUHJvcGVydHkiLCJ0ZXN0IiwiX3Nhbml0aXplQXV0aERhdGEiLCJ1c2VyIiwicGFzc3dvcmQiLCJhdXRoRGF0YSIsInByb3ZpZGVyIiwiX2F1dGhlbnRpY2F0ZVVzZXJGcm9tUmVxdWVzdCIsInJlcSIsIlByb21pc2UiLCJyZXNvbHZlIiwicmVqZWN0IiwicGF5bG9hZCIsImJvZHkiLCJ1c2VybmFtZSIsInF1ZXJ5IiwiZW1haWwiLCJQYXJzZSIsIkVycm9yIiwiVVNFUk5BTUVfTUlTU0lORyIsIlBBU1NXT1JEX01JU1NJTkciLCJPQkpFQ1RfTk9UX0ZPVU5EIiwiaXNWYWxpZFBhc3N3b3JkIiwiJG9yIiwiY29uZmlnIiwiZGF0YWJhc2UiLCJmaW5kIiwidGhlbiIsInJlc3VsdHMiLCJsb2dnZXJDb250cm9sbGVyIiwid2FybiIsInBhc3N3b3JkQ3J5cHRvIiwiY29tcGFyZSIsImNvcnJlY3QiLCJhY2NvdW50TG9ja291dFBvbGljeSIsIkFjY291bnRMb2Nrb3V0IiwiaGFuZGxlTG9naW5BdHRlbXB0IiwiYXV0aCIsImlzTWFzdGVyIiwiQUNMIiwidmVyaWZ5VXNlckVtYWlscyIsInByZXZlbnRMb2dpbldpdGhVbnZlcmlmaWVkRW1haWwiLCJlbWFpbFZlcmlmaWVkIiwiRU1BSUxfTk9UX0ZPVU5EIiwiY2F0Y2giLCJlcnJvciIsImhhbmRsZU1lIiwiaW5mbyIsInNlc3Npb25Ub2tlbiIsIklOVkFMSURfU0VTU0lPTl9UT0tFTiIsInJlc3QiLCJBdXRoIiwibWFzdGVyIiwiaW5jbHVkZSIsImNsaWVudFNESyIsImNvbnRleHQiLCJyZXNwb25zZSIsImhhbmRsZUxvZ0luIiwiY2hlY2tJZlVzZXJIYXNQcm92aWRlZENvbmZpZ3VyZWRQcm92aWRlcnNGb3JMb2dpbiIsImF1dGhEYXRhUmVzcG9uc2UiLCJ2YWxpZGF0ZWRBdXRoRGF0YSIsImhhbmRsZUF1dGhEYXRhVmFsaWRhdGlvbiIsIlJlc3RXcml0ZSIsIm9iamVjdElkIiwicGFzc3dvcmRQb2xpY3kiLCJtYXhQYXNzd29yZEFnZSIsImNoYW5nZWRBdCIsIl9wYXNzd29yZF9jaGFuZ2VkX2F0IiwiRGF0ZSIsInVwZGF0ZSIsIl9lbmNvZGUiLCJfX3R5cGUiLCJpc28iLCJleHBpcmVzQXQiLCJnZXRUaW1lIiwiZmlsZXNDb250cm9sbGVyIiwiZXhwYW5kRmlsZXNJbk9iamVjdCIsIm1heWJlUnVuVHJpZ2dlciIsIlRyaWdnZXJUeXBlcyIsImJlZm9yZUxvZ2luIiwiVXNlciIsImZyb21KU09OIiwiYXNzaWduIiwic2Vzc2lvbkRhdGEiLCJjcmVhdGVTZXNzaW9uIiwidXNlcklkIiwiY3JlYXRlZFdpdGgiLCJhY3Rpb24iLCJhdXRoUHJvdmlkZXIiLCJpbnN0YWxsYXRpb25JZCIsImFmdGVyTG9naW5Vc2VyIiwiYWZ0ZXJMb2dpbiIsImhhbmRsZUxvZ0luQXMiLCJPUEVSQVRJT05fRk9SQklEREVOIiwiSU5WQUxJRF9WQUxVRSIsInF1ZXJ5UmVzdWx0cyIsImhhbmRsZVZlcmlmeVBhc3N3b3JkIiwiaGFuZGxlTG9nT3V0Iiwic3VjY2VzcyIsInJlY29yZHMiLCJkZWwiLCJfcnVuQWZ0ZXJMb2dvdXRUcmlnZ2VyIiwic2Vzc2lvbiIsImFmdGVyTG9nb3V0IiwiU2Vzc2lvbiIsIl90aHJvd09uQmFkRW1haWxDb25maWciLCJDb25maWciLCJ2YWxpZGF0ZUVtYWlsQ29uZmlndXJhdGlvbiIsImVtYWlsQWRhcHRlciIsInVzZXJDb250cm9sbGVyIiwiYWRhcHRlciIsImFwcE5hbWUiLCJwdWJsaWNTZXJ2ZXJVUkwiLCJlbWFpbFZlcmlmeVRva2VuVmFsaWRpdHlEdXJhdGlvbiIsImVtYWlsVmVyaWZ5VG9rZW5SZXVzZUlmVmFsaWQiLCJlIiwiSU5URVJOQUxfU0VSVkVSX0VSUk9SIiwiaGFuZGxlUmVzZXRSZXF1ZXN0IiwiRU1BSUxfTUlTU0lORyIsIklOVkFMSURfRU1BSUxfQUREUkVTUyIsInNlbmRQYXNzd29yZFJlc2V0RW1haWwiLCJlcnIiLCJjb2RlIiwiaGFuZGxlVmVyaWZpY2F0aW9uRW1haWxSZXF1ZXN0IiwiT1RIRVJfQ0FVU0UiLCJyZWdlbmVyYXRlRW1haWxWZXJpZnlUb2tlbiIsInNlbmRWZXJpZmljYXRpb25FbWFpbCIsImhhbmRsZUNoYWxsZW5nZSIsImNoYWxsZW5nZURhdGEiLCJyZXF1ZXN0IiwicGFyc2VVc2VyIiwiaWQiLCJmaW5kVXNlcnNXaXRoQXV0aERhdGEiLCJnZXRSZXF1ZXN0T2JqZWN0IiwiaXNDaGFsbGVuZ2UiLCJ2YWxpZGF0b3IiLCJhdXRoRGF0YU1hbmFnZXIiLCJnZXRWYWxpZGF0b3JGb3JQcm92aWRlciIsImxvZ2dlciIsImNoYWxsZW5nZSIsInJlZHVjZVByb21pc2UiLCJzb3J0IiwiYWNjIiwiYXV0aEFkYXB0ZXIiLCJwcm92aWRlckNoYWxsZW5nZVJlc3BvbnNlIiwibW91bnRSb3V0ZXMiLCJyb3V0ZSIsImhhbmRsZUZpbmQiLCJwcm9taXNlRW5zdXJlSWRlbXBvdGVuY3kiLCJoYW5kbGVDcmVhdGUiLCJoYW5kbGVHZXQiLCJoYW5kbGVVcGRhdGUiLCJoYW5kbGVEZWxldGUiLCJleHBvcnRzIiwiX2RlZmF1bHQiXSwic291cmNlcyI6WyIuLi8uLi9zcmMvUm91dGVycy9Vc2Vyc1JvdXRlci5qcyJdLCJzb3VyY2VzQ29udGVudCI6WyIvLyBUaGVzZSBtZXRob2RzIGhhbmRsZSB0aGUgVXNlci1yZWxhdGVkIHJvdXRlcy5cblxuaW1wb3J0IFBhcnNlIGZyb20gJ3BhcnNlL25vZGUnO1xuaW1wb3J0IENvbmZpZyBmcm9tICcuLi9Db25maWcnO1xuaW1wb3J0IEFjY291bnRMb2Nrb3V0IGZyb20gJy4uL0FjY291bnRMb2Nrb3V0JztcbmltcG9ydCBDbGFzc2VzUm91dGVyIGZyb20gJy4vQ2xhc3Nlc1JvdXRlcic7XG5pbXBvcnQgcmVzdCBmcm9tICcuLi9yZXN0JztcbmltcG9ydCBBdXRoIGZyb20gJy4uL0F1dGgnO1xuaW1wb3J0IHBhc3N3b3JkQ3J5cHRvIGZyb20gJy4uL3Bhc3N3b3JkJztcbmltcG9ydCB7IG1heWJlUnVuVHJpZ2dlciwgVHlwZXMgYXMgVHJpZ2dlclR5cGVzLCBnZXRSZXF1ZXN0T2JqZWN0IH0gZnJvbSAnLi4vdHJpZ2dlcnMnO1xuaW1wb3J0IHsgcHJvbWlzZUVuc3VyZUlkZW1wb3RlbmN5IH0gZnJvbSAnLi4vbWlkZGxld2FyZXMnO1xuaW1wb3J0IFJlc3RXcml0ZSBmcm9tICcuLi9SZXN0V3JpdGUnO1xuaW1wb3J0IHsgbG9nZ2VyIH0gZnJvbSAnLi4vLi4vbGliL0FkYXB0ZXJzL0xvZ2dlci9XaW5zdG9uTG9nZ2VyJztcblxuZXhwb3J0IGNsYXNzIFVzZXJzUm91dGVyIGV4dGVuZHMgQ2xhc3Nlc1JvdXRlciB7XG4gIGNsYXNzTmFtZSgpIHtcbiAgICByZXR1cm4gJ19Vc2VyJztcbiAgfVxuXG4gIC8qKlxuICAgKiBSZW1vdmVzIGFsbCBcIl9cIiBwcmVmaXhlZCBwcm9wZXJ0aWVzIGZyb20gYW4gb2JqZWN0LCBleGNlcHQgXCJfX3R5cGVcIlxuICAgKiBAcGFyYW0ge09iamVjdH0gb2JqIEFuIG9iamVjdC5cbiAgICovXG4gIHN0YXRpYyByZW1vdmVIaWRkZW5Qcm9wZXJ0aWVzKG9iaikge1xuICAgIGZvciAodmFyIGtleSBpbiBvYmopIHtcbiAgICAgIGlmIChPYmplY3QucHJvdG90eXBlLmhhc093blByb3BlcnR5LmNhbGwob2JqLCBrZXkpKSB7XG4gICAgICAgIC8vIFJlZ2V4cCBjb21lcyBmcm9tIFBhcnNlLk9iamVjdC5wcm90b3R5cGUudmFsaWRhdGVcbiAgICAgICAgaWYgKGtleSAhPT0gJ19fdHlwZScgJiYgIS9eW0EtWmEtel1bMC05QS1aYS16X10qJC8udGVzdChrZXkpKSB7XG4gICAgICAgICAgZGVsZXRlIG9ialtrZXldO1xuICAgICAgICB9XG4gICAgICB9XG4gICAgfVxuICB9XG5cbiAgLyoqXG4gICAqIEFmdGVyIHJldHJpZXZpbmcgYSB1c2VyIGRpcmVjdGx5IGZyb20gdGhlIGRhdGFiYXNlLCB3ZSBuZWVkIHRvIHJlbW92ZSB0aGVcbiAgICogcGFzc3dvcmQgZnJvbSB0aGUgb2JqZWN0IChmb3Igc2VjdXJpdHkpLCBhbmQgZml4IGFuIGlzc3VlIHNvbWUgU0RLcyBoYXZlXG4gICAqIHdpdGggbnVsbCB2YWx1ZXNcbiAgICovXG4gIF9zYW5pdGl6ZUF1dGhEYXRhKHVzZXIpIHtcbiAgICBkZWxldGUgdXNlci5wYXNzd29yZDtcblxuICAgIC8vIFNvbWV0aW1lcyB0aGUgYXV0aERhdGEgc3RpbGwgaGFzIG51bGwgb24gdGhhdCBrZXlzXG4gICAgLy8gaHR0cHM6Ly9naXRodWIuY29tL3BhcnNlLWNvbW11bml0eS9wYXJzZS1zZXJ2ZXIvaXNzdWVzLzkzNVxuICAgIGlmICh1c2VyLmF1dGhEYXRhKSB7XG4gICAgICBPYmplY3Qua2V5cyh1c2VyLmF1dGhEYXRhKS5mb3JFYWNoKHByb3ZpZGVyID0+IHtcbiAgICAgICAgaWYgKHVzZXIuYXV0aERhdGFbcHJvdmlkZXJdID09PSBudWxsKSB7XG4gICAgICAgICAgZGVsZXRlIHVzZXIuYXV0aERhdGFbcHJvdmlkZXJdO1xuICAgICAgICB9XG4gICAgICB9KTtcbiAgICAgIGlmIChPYmplY3Qua2V5cyh1c2VyLmF1dGhEYXRhKS5sZW5ndGggPT0gMCkge1xuICAgICAgICBkZWxldGUgdXNlci5hdXRoRGF0YTtcbiAgICAgIH1cbiAgICB9XG4gIH1cblxuICAvKipcbiAgICogVmFsaWRhdGVzIGEgcGFzc3dvcmQgcmVxdWVzdCBpbiBsb2dpbiBhbmQgdmVyaWZ5UGFzc3dvcmRcbiAgICogQHBhcmFtIHtPYmplY3R9IHJlcSBUaGUgcmVxdWVzdFxuICAgKiBAcmV0dXJucyB7T2JqZWN0fSBVc2VyIG9iamVjdFxuICAgKiBAcHJpdmF0ZVxuICAgKi9cbiAgX2F1dGhlbnRpY2F0ZVVzZXJGcm9tUmVxdWVzdChyZXEpIHtcbiAgICByZXR1cm4gbmV3IFByb21pc2UoKHJlc29sdmUsIHJlamVjdCkgPT4ge1xuICAgICAgLy8gVXNlIHF1ZXJ5IHBhcmFtZXRlcnMgaW5zdGVhZCBpZiBwcm92aWRlZCBpbiB1cmxcbiAgICAgIGxldCBwYXlsb2FkID0gcmVxLmJvZHk7XG4gICAgICBpZiAoXG4gICAgICAgICghcGF5bG9hZC51c2VybmFtZSAmJiByZXEucXVlcnkgJiYgcmVxLnF1ZXJ5LnVzZXJuYW1lKSB8fFxuICAgICAgICAoIXBheWxvYWQuZW1haWwgJiYgcmVxLnF1ZXJ5ICYmIHJlcS5xdWVyeS5lbWFpbClcbiAgICAgICkge1xuICAgICAgICBwYXlsb2FkID0gcmVxLnF1ZXJ5O1xuICAgICAgfVxuICAgICAgY29uc3QgeyB1c2VybmFtZSwgZW1haWwsIHBhc3N3b3JkIH0gPSBwYXlsb2FkO1xuXG4gICAgICAvLyBUT0RPOiB1c2UgdGhlIHJpZ2h0IGVycm9yIGNvZGVzIC8gZGVzY3JpcHRpb25zLlxuICAgICAgaWYgKCF1c2VybmFtZSAmJiAhZW1haWwpIHtcbiAgICAgICAgdGhyb3cgbmV3IFBhcnNlLkVycm9yKFBhcnNlLkVycm9yLlVTRVJOQU1FX01JU1NJTkcsICd1c2VybmFtZS9lbWFpbCBpcyByZXF1aXJlZC4nKTtcbiAgICAgIH1cbiAgICAgIGlmICghcGFzc3dvcmQpIHtcbiAgICAgICAgdGhyb3cgbmV3IFBhcnNlLkVycm9yKFBhcnNlLkVycm9yLlBBU1NXT1JEX01JU1NJTkcsICdwYXNzd29yZCBpcyByZXF1aXJlZC4nKTtcbiAgICAgIH1cbiAgICAgIGlmIChcbiAgICAgICAgdHlwZW9mIHBhc3N3b3JkICE9PSAnc3RyaW5nJyB8fFxuICAgICAgICAoZW1haWwgJiYgdHlwZW9mIGVtYWlsICE9PSAnc3RyaW5nJykgfHxcbiAgICAgICAgKHVzZXJuYW1lICYmIHR5cGVvZiB1c2VybmFtZSAhPT0gJ3N0cmluZycpXG4gICAgICApIHtcbiAgICAgICAgdGhyb3cgbmV3IFBhcnNlLkVycm9yKFBhcnNlLkVycm9yLk9CSkVDVF9OT1RfRk9VTkQsICdJbnZhbGlkIHVzZXJuYW1lL3Bhc3N3b3JkLicpO1xuICAgICAgfVxuXG4gICAgICBsZXQgdXNlcjtcbiAgICAgIGxldCBpc1ZhbGlkUGFzc3dvcmQgPSBmYWxzZTtcbiAgICAgIGxldCBxdWVyeTtcbiAgICAgIGlmIChlbWFpbCAmJiB1c2VybmFtZSkge1xuICAgICAgICBxdWVyeSA9IHsgZW1haWwsIHVzZXJuYW1lIH07XG4gICAgICB9IGVsc2UgaWYgKGVtYWlsKSB7XG4gICAgICAgIHF1ZXJ5ID0geyBlbWFpbCB9O1xuICAgICAgfSBlbHNlIHtcbiAgICAgICAgcXVlcnkgPSB7ICRvcjogW3sgdXNlcm5hbWUgfSwgeyBlbWFpbDogdXNlcm5hbWUgfV0gfTtcbiAgICAgIH1cbiAgICAgIHJldHVybiByZXEuY29uZmlnLmRhdGFiYXNlXG4gICAgICAgIC5maW5kKCdfVXNlcicsIHF1ZXJ5KVxuICAgICAgICAudGhlbihyZXN1bHRzID0+IHtcbiAgICAgICAgICBpZiAoIXJlc3VsdHMubGVuZ3RoKSB7XG4gICAgICAgICAgICB0aHJvdyBuZXcgUGFyc2UuRXJyb3IoUGFyc2UuRXJyb3IuT0JKRUNUX05PVF9GT1VORCwgJ0ludmFsaWQgdXNlcm5hbWUvcGFzc3dvcmQuJyk7XG4gICAgICAgICAgfVxuXG4gICAgICAgICAgaWYgKHJlc3VsdHMubGVuZ3RoID4gMSkge1xuICAgICAgICAgICAgLy8gY29ybmVyIGNhc2Ugd2hlcmUgdXNlcjEgaGFzIHVzZXJuYW1lID09IHVzZXIyIGVtYWlsXG4gICAgICAgICAgICByZXEuY29uZmlnLmxvZ2dlckNvbnRyb2xsZXIud2FybihcbiAgICAgICAgICAgICAgXCJUaGVyZSBpcyBhIHVzZXIgd2hpY2ggZW1haWwgaXMgdGhlIHNhbWUgYXMgYW5vdGhlciB1c2VyJ3MgdXNlcm5hbWUsIGxvZ2dpbmcgaW4gYmFzZWQgb24gdXNlcm5hbWVcIlxuICAgICAgICAgICAgKTtcbiAgICAgICAgICAgIHVzZXIgPSByZXN1bHRzLmZpbHRlcih1c2VyID0+IHVzZXIudXNlcm5hbWUgPT09IHVzZXJuYW1lKVswXTtcbiAgICAgICAgICB9IGVsc2Uge1xuICAgICAgICAgICAgdXNlciA9IHJlc3VsdHNbMF07XG4gICAgICAgICAgfVxuXG4gICAgICAgICAgcmV0dXJuIHBhc3N3b3JkQ3J5cHRvLmNvbXBhcmUocGFzc3dvcmQsIHVzZXIucGFzc3dvcmQpO1xuICAgICAgICB9KVxuICAgICAgICAudGhlbihjb3JyZWN0ID0+IHtcbiAgICAgICAgICBpc1ZhbGlkUGFzc3dvcmQgPSBjb3JyZWN0O1xuICAgICAgICAgIGNvbnN0IGFjY291bnRMb2Nrb3V0UG9saWN5ID0gbmV3IEFjY291bnRMb2Nrb3V0KHVzZXIsIHJlcS5jb25maWcpO1xuICAgICAgICAgIHJldHVybiBhY2NvdW50TG9ja291dFBvbGljeS5oYW5kbGVMb2dpbkF0dGVtcHQoaXNWYWxpZFBhc3N3b3JkKTtcbiAgICAgICAgfSlcbiAgICAgICAgLnRoZW4oKCkgPT4ge1xuICAgICAgICAgIGlmICghaXNWYWxpZFBhc3N3b3JkKSB7XG4gICAgICAgICAgICB0aHJvdyBuZXcgUGFyc2UuRXJyb3IoUGFyc2UuRXJyb3IuT0JKRUNUX05PVF9GT1VORCwgJ0ludmFsaWQgdXNlcm5hbWUvcGFzc3dvcmQuJyk7XG4gICAgICAgICAgfVxuICAgICAgICAgIC8vIEVuc3VyZSB0aGUgdXNlciBpc24ndCBsb2NrZWQgb3V0XG4gICAgICAgICAgLy8gQSBsb2NrZWQgb3V0IHVzZXIgd29uJ3QgYmUgYWJsZSB0byBsb2dpblxuICAgICAgICAgIC8vIFRvIGxvY2sgYSB1c2VyIG91dCwganVzdCBzZXQgdGhlIEFDTCB0byBgbWFzdGVyS2V5YCBvbmx5ICAoe30pLlxuICAgICAgICAgIC8vIEVtcHR5IEFDTCBpcyBPS1xuICAgICAgICAgIGlmICghcmVxLmF1dGguaXNNYXN0ZXIgJiYgdXNlci5BQ0wgJiYgT2JqZWN0LmtleXModXNlci5BQ0wpLmxlbmd0aCA9PSAwKSB7XG4gICAgICAgICAgICB0aHJvdyBuZXcgUGFyc2UuRXJyb3IoUGFyc2UuRXJyb3IuT0JKRUNUX05PVF9GT1VORCwgJ0ludmFsaWQgdXNlcm5hbWUvcGFzc3dvcmQuJyk7XG4gICAgICAgICAgfVxuICAgICAgICAgIGlmIChcbiAgICAgICAgICAgIHJlcS5jb25maWcudmVyaWZ5VXNlckVtYWlscyAmJlxuICAgICAgICAgICAgcmVxLmNvbmZpZy5wcmV2ZW50TG9naW5XaXRoVW52ZXJpZmllZEVtYWlsICYmXG4gICAgICAgICAgICAhdXNlci5lbWFpbFZlcmlmaWVkXG4gICAgICAgICAgKSB7XG4gICAgICAgICAgICB0aHJvdyBuZXcgUGFyc2UuRXJyb3IoUGFyc2UuRXJyb3IuRU1BSUxfTk9UX0ZPVU5ELCAnVXNlciBlbWFpbCBpcyBub3QgdmVyaWZpZWQuJyk7XG4gICAgICAgICAgfVxuXG4gICAgICAgICAgdGhpcy5fc2FuaXRpemVBdXRoRGF0YSh1c2VyKTtcblxuICAgICAgICAgIHJldHVybiByZXNvbHZlKHVzZXIpO1xuICAgICAgICB9KVxuICAgICAgICAuY2F0Y2goZXJyb3IgPT4ge1xuICAgICAgICAgIHJldHVybiByZWplY3QoZXJyb3IpO1xuICAgICAgICB9KTtcbiAgICB9KTtcbiAgfVxuXG4gIGhhbmRsZU1lKHJlcSkge1xuICAgIGlmICghcmVxLmluZm8gfHwgIXJlcS5pbmZvLnNlc3Npb25Ub2tlbikge1xuICAgICAgdGhyb3cgbmV3IFBhcnNlLkVycm9yKFBhcnNlLkVycm9yLklOVkFMSURfU0VTU0lPTl9UT0tFTiwgJ0ludmFsaWQgc2Vzc2lvbiB0b2tlbicpO1xuICAgIH1cbiAgICBjb25zdCBzZXNzaW9uVG9rZW4gPSByZXEuaW5mby5zZXNzaW9uVG9rZW47XG4gICAgcmV0dXJuIHJlc3RcbiAgICAgIC5maW5kKFxuICAgICAgICByZXEuY29uZmlnLFxuICAgICAgICBBdXRoLm1hc3RlcihyZXEuY29uZmlnKSxcbiAgICAgICAgJ19TZXNzaW9uJyxcbiAgICAgICAgeyBzZXNzaW9uVG9rZW4gfSxcbiAgICAgICAgeyBpbmNsdWRlOiAndXNlcicgfSxcbiAgICAgICAgcmVxLmluZm8uY2xpZW50U0RLLFxuICAgICAgICByZXEuaW5mby5jb250ZXh0XG4gICAgICApXG4gICAgICAudGhlbihyZXNwb25zZSA9PiB7XG4gICAgICAgIGlmICghcmVzcG9uc2UucmVzdWx0cyB8fCByZXNwb25zZS5yZXN1bHRzLmxlbmd0aCA9PSAwIHx8ICFyZXNwb25zZS5yZXN1bHRzWzBdLnVzZXIpIHtcbiAgICAgICAgICB0aHJvdyBuZXcgUGFyc2UuRXJyb3IoUGFyc2UuRXJyb3IuSU5WQUxJRF9TRVNTSU9OX1RPS0VOLCAnSW52YWxpZCBzZXNzaW9uIHRva2VuJyk7XG4gICAgICAgIH0gZWxzZSB7XG4gICAgICAgICAgY29uc3QgdXNlciA9IHJlc3BvbnNlLnJlc3VsdHNbMF0udXNlcjtcbiAgICAgICAgICAvLyBTZW5kIHRva2VuIGJhY2sgb24gdGhlIGxvZ2luLCBiZWNhdXNlIFNES3MgZXhwZWN0IHRoYXQuXG4gICAgICAgICAgdXNlci5zZXNzaW9uVG9rZW4gPSBzZXNzaW9uVG9rZW47XG5cbiAgICAgICAgICAvLyBSZW1vdmUgaGlkZGVuIHByb3BlcnRpZXMuXG4gICAgICAgICAgVXNlcnNSb3V0ZXIucmVtb3ZlSGlkZGVuUHJvcGVydGllcyh1c2VyKTtcbiAgICAgICAgICByZXR1cm4geyByZXNwb25zZTogdXNlciB9O1xuICAgICAgICB9XG4gICAgICB9KTtcbiAgfVxuXG4gIGFzeW5jIGhhbmRsZUxvZ0luKHJlcSkge1xuICAgIGNvbnN0IHVzZXIgPSBhd2FpdCB0aGlzLl9hdXRoZW50aWNhdGVVc2VyRnJvbVJlcXVlc3QocmVxKTtcbiAgICBjb25zdCBhdXRoRGF0YSA9IHJlcS5ib2R5ICYmIHJlcS5ib2R5LmF1dGhEYXRhO1xuICAgIC8vIENoZWNrIGlmIHVzZXIgaGFzIHByb3ZpZGVkIHRoZWlyIHJlcXVpcmVkIGF1dGggcHJvdmlkZXJzXG4gICAgQXV0aC5jaGVja0lmVXNlckhhc1Byb3ZpZGVkQ29uZmlndXJlZFByb3ZpZGVyc0ZvckxvZ2luKGF1dGhEYXRhLCB1c2VyLmF1dGhEYXRhLCByZXEuY29uZmlnKTtcblxuICAgIGxldCBhdXRoRGF0YVJlc3BvbnNlO1xuICAgIGxldCB2YWxpZGF0ZWRBdXRoRGF0YTtcbiAgICBpZiAoYXV0aERhdGEpIHtcbiAgICAgIGNvbnN0IHJlcyA9IGF3YWl0IEF1dGguaGFuZGxlQXV0aERhdGFWYWxpZGF0aW9uKFxuICAgICAgICBhdXRoRGF0YSxcbiAgICAgICAgbmV3IFJlc3RXcml0ZShcbiAgICAgICAgICByZXEuY29uZmlnLFxuICAgICAgICAgIHJlcS5hdXRoLFxuICAgICAgICAgICdfVXNlcicsXG4gICAgICAgICAgeyBvYmplY3RJZDogdXNlci5vYmplY3RJZCB9LFxuICAgICAgICAgIHJlcS5ib2R5LFxuICAgICAgICAgIHVzZXIsXG4gICAgICAgICAgcmVxLmluZm8uY2xpZW50U0RLLFxuICAgICAgICAgIHJlcS5pbmZvLmNvbnRleHRcbiAgICAgICAgKSxcbiAgICAgICAgdXNlclxuICAgICAgKTtcbiAgICAgIGF1dGhEYXRhUmVzcG9uc2UgPSByZXMuYXV0aERhdGFSZXNwb25zZTtcbiAgICAgIHZhbGlkYXRlZEF1dGhEYXRhID0gcmVzLmF1dGhEYXRhO1xuICAgIH1cblxuICAgIC8vIGhhbmRsZSBwYXNzd29yZCBleHBpcnkgcG9saWN5XG4gICAgaWYgKHJlcS5jb25maWcucGFzc3dvcmRQb2xpY3kgJiYgcmVxLmNvbmZpZy5wYXNzd29yZFBvbGljeS5tYXhQYXNzd29yZEFnZSkge1xuICAgICAgbGV0IGNoYW5nZWRBdCA9IHVzZXIuX3Bhc3N3b3JkX2NoYW5nZWRfYXQ7XG5cbiAgICAgIGlmICghY2hhbmdlZEF0KSB7XG4gICAgICAgIC8vIHBhc3N3b3JkIHdhcyBjcmVhdGVkIGJlZm9yZSBleHBpcnkgcG9saWN5IHdhcyBlbmFibGVkLlxuICAgICAgICAvLyBzaW1wbHkgdXBkYXRlIF9Vc2VyIG9iamVjdCBzbyB0aGF0IGl0IHdpbGwgc3RhcnQgZW5mb3JjaW5nIGZyb20gbm93XG4gICAgICAgIGNoYW5nZWRBdCA9IG5ldyBEYXRlKCk7XG4gICAgICAgIHJlcS5jb25maWcuZGF0YWJhc2UudXBkYXRlKFxuICAgICAgICAgICdfVXNlcicsXG4gICAgICAgICAgeyB1c2VybmFtZTogdXNlci51c2VybmFtZSB9LFxuICAgICAgICAgIHsgX3Bhc3N3b3JkX2NoYW5nZWRfYXQ6IFBhcnNlLl9lbmNvZGUoY2hhbmdlZEF0KSB9XG4gICAgICAgICk7XG4gICAgICB9IGVsc2Uge1xuICAgICAgICAvLyBjaGVjayB3aGV0aGVyIHRoZSBwYXNzd29yZCBoYXMgZXhwaXJlZFxuICAgICAgICBpZiAoY2hhbmdlZEF0Ll9fdHlwZSA9PSAnRGF0ZScpIHtcbiAgICAgICAgICBjaGFuZ2VkQXQgPSBuZXcgRGF0ZShjaGFuZ2VkQXQuaXNvKTtcbiAgICAgICAgfVxuICAgICAgICAvLyBDYWxjdWxhdGUgdGhlIGV4cGlyeSB0aW1lLlxuICAgICAgICBjb25zdCBleHBpcmVzQXQgPSBuZXcgRGF0ZShcbiAgICAgICAgICBjaGFuZ2VkQXQuZ2V0VGltZSgpICsgODY0MDAwMDAgKiByZXEuY29uZmlnLnBhc3N3b3JkUG9saWN5Lm1heFBhc3N3b3JkQWdlXG4gICAgICAgICk7XG4gICAgICAgIGlmIChleHBpcmVzQXQgPCBuZXcgRGF0ZSgpKVxuICAgICAgICAgIC8vIGZhaWwgb2YgY3VycmVudCB0aW1lIGlzIHBhc3QgcGFzc3dvcmQgZXhwaXJ5IHRpbWVcbiAgICAgICAgICB0aHJvdyBuZXcgUGFyc2UuRXJyb3IoXG4gICAgICAgICAgICBQYXJzZS5FcnJvci5PQkpFQ1RfTk9UX0ZPVU5ELFxuICAgICAgICAgICAgJ1lvdXIgcGFzc3dvcmQgaGFzIGV4cGlyZWQuIFBsZWFzZSByZXNldCB5b3VyIHBhc3N3b3JkLidcbiAgICAgICAgICApO1xuICAgICAgfVxuICAgIH1cblxuICAgIC8vIFJlbW92ZSBoaWRkZW4gcHJvcGVydGllcy5cbiAgICBVc2Vyc1JvdXRlci5yZW1vdmVIaWRkZW5Qcm9wZXJ0aWVzKHVzZXIpO1xuXG4gICAgcmVxLmNvbmZpZy5maWxlc0NvbnRyb2xsZXIuZXhwYW5kRmlsZXNJbk9iamVjdChyZXEuY29uZmlnLCB1c2VyKTtcblxuICAgIC8vIEJlZm9yZSBsb2dpbiB0cmlnZ2VyOyB0aHJvd3MgaWYgZmFpbHVyZVxuICAgIGF3YWl0IG1heWJlUnVuVHJpZ2dlcihcbiAgICAgIFRyaWdnZXJUeXBlcy5iZWZvcmVMb2dpbixcbiAgICAgIHJlcS5hdXRoLFxuICAgICAgUGFyc2UuVXNlci5mcm9tSlNPTihPYmplY3QuYXNzaWduKHsgY2xhc3NOYW1lOiAnX1VzZXInIH0sIHVzZXIpKSxcbiAgICAgIG51bGwsXG4gICAgICByZXEuY29uZmlnXG4gICAgKTtcblxuICAgIC8vIElmIHdlIGhhdmUgc29tZSBuZXcgdmFsaWRhdGVkIGF1dGhEYXRhIHVwZGF0ZSBkaXJlY3RseVxuICAgIGlmICh2YWxpZGF0ZWRBdXRoRGF0YSAmJiBPYmplY3Qua2V5cyh2YWxpZGF0ZWRBdXRoRGF0YSkubGVuZ3RoKSB7XG4gICAgICBhd2FpdCByZXEuY29uZmlnLmRhdGFiYXNlLnVwZGF0ZShcbiAgICAgICAgJ19Vc2VyJyxcbiAgICAgICAgeyBvYmplY3RJZDogdXNlci5vYmplY3RJZCB9LFxuICAgICAgICB7IGF1dGhEYXRhOiB2YWxpZGF0ZWRBdXRoRGF0YSB9LFxuICAgICAgICB7fVxuICAgICAgKTtcbiAgICB9XG5cbiAgICBjb25zdCB7IHNlc3Npb25EYXRhLCBjcmVhdGVTZXNzaW9uIH0gPSBSZXN0V3JpdGUuY3JlYXRlU2Vzc2lvbihyZXEuY29uZmlnLCB7XG4gICAgICB1c2VySWQ6IHVzZXIub2JqZWN0SWQsXG4gICAgICBjcmVhdGVkV2l0aDoge1xuICAgICAgICBhY3Rpb246ICdsb2dpbicsXG4gICAgICAgIGF1dGhQcm92aWRlcjogJ3Bhc3N3b3JkJyxcbiAgICAgIH0sXG4gICAgICBpbnN0YWxsYXRpb25JZDogcmVxLmluZm8uaW5zdGFsbGF0aW9uSWQsXG4gICAgfSk7XG5cbiAgICB1c2VyLnNlc3Npb25Ub2tlbiA9IHNlc3Npb25EYXRhLnNlc3Npb25Ub2tlbjtcblxuICAgIGF3YWl0IGNyZWF0ZVNlc3Npb24oKTtcblxuICAgIGNvbnN0IGFmdGVyTG9naW5Vc2VyID0gUGFyc2UuVXNlci5mcm9tSlNPTihPYmplY3QuYXNzaWduKHsgY2xhc3NOYW1lOiAnX1VzZXInIH0sIHVzZXIpKTtcbiAgICBtYXliZVJ1blRyaWdnZXIoXG4gICAgICBUcmlnZ2VyVHlwZXMuYWZ0ZXJMb2dpbixcbiAgICAgIHsgLi4ucmVxLmF1dGgsIHVzZXI6IGFmdGVyTG9naW5Vc2VyIH0sXG4gICAgICBhZnRlckxvZ2luVXNlcixcbiAgICAgIG51bGwsXG4gICAgICByZXEuY29uZmlnXG4gICAgKTtcblxuICAgIGlmIChhdXRoRGF0YVJlc3BvbnNlKSB7XG4gICAgICB1c2VyLmF1dGhEYXRhUmVzcG9uc2UgPSBhdXRoRGF0YVJlc3BvbnNlO1xuICAgIH1cblxuICAgIHJldHVybiB7IHJlc3BvbnNlOiB1c2VyIH07XG4gIH1cblxuICAvKipcbiAgICogVGhpcyBhbGxvd3MgbWFzdGVyLWtleSBjbGllbnRzIHRvIGNyZWF0ZSB1c2VyIHNlc3Npb25zIHdpdGhvdXQgYWNjZXNzIHRvXG4gICAqIHVzZXIgY3JlZGVudGlhbHMuIFRoaXMgZW5hYmxlcyBzeXN0ZW1zIHRoYXQgY2FuIGF1dGhlbnRpY2F0ZSBhY2Nlc3MgYW5vdGhlclxuICAgKiB3YXkgKEFQSSBrZXksIGFwcCBhZG1pbmlzdHJhdG9ycykgdG8gYWN0IG9uIGEgdXNlcidzIGJlaGFsZi5cbiAgICpcbiAgICogV2UgY3JlYXRlIGEgbmV3IHNlc3Npb24gcmF0aGVyIHRoYW4gbG9va2luZyBmb3IgYW4gZXhpc3Rpbmcgc2Vzc2lvbjsgd2VcbiAgICogd2FudCB0aGlzIHRvIHdvcmsgaW4gc2l0dWF0aW9ucyB3aGVyZSB0aGUgdXNlciBpcyBsb2dnZWQgb3V0IG9uIGFsbFxuICAgKiBkZXZpY2VzLCBzaW5jZSB0aGlzIGNhbiBiZSB1c2VkIGJ5IGF1dG9tYXRlZCBzeXN0ZW1zIGFjdGluZyBvbiB0aGUgdXNlcidzXG4gICAqIGJlaGFsZi5cbiAgICpcbiAgICogRm9yIHRoZSBtb21lbnQsIHdlJ3JlIG9taXR0aW5nIGV2ZW50IGhvb2tzIGFuZCBsb2Nrb3V0IGNoZWNrcywgc2luY2VcbiAgICogaW1tZWRpYXRlIHVzZSBjYXNlcyBzdWdnZXN0IC9sb2dpbkFzIGNvdWxkIGJlIHVzZWQgZm9yIHNlbWFudGljYWxseVxuICAgKiBkaWZmZXJlbnQgcmVhc29ucyBmcm9tIC9sb2dpblxuICAgKi9cbiAgYXN5bmMgaGFuZGxlTG9nSW5BcyhyZXEpIHtcbiAgICBpZiAoIXJlcS5hdXRoLmlzTWFzdGVyKSB7XG4gICAgICB0aHJvdyBuZXcgUGFyc2UuRXJyb3IoUGFyc2UuRXJyb3IuT1BFUkFUSU9OX0ZPUkJJRERFTiwgJ21hc3RlciBrZXkgaXMgcmVxdWlyZWQnKTtcbiAgICB9XG5cbiAgICBjb25zdCB1c2VySWQgPSByZXEuYm9keS51c2VySWQgfHwgcmVxLnF1ZXJ5LnVzZXJJZDtcbiAgICBpZiAoIXVzZXJJZCkge1xuICAgICAgdGhyb3cgbmV3IFBhcnNlLkVycm9yKFxuICAgICAgICBQYXJzZS5FcnJvci5JTlZBTElEX1ZBTFVFLFxuICAgICAgICAndXNlcklkIG11c3Qgbm90IGJlIGVtcHR5LCBudWxsLCBvciB1bmRlZmluZWQnXG4gICAgICApO1xuICAgIH1cblxuICAgIGNvbnN0IHF1ZXJ5UmVzdWx0cyA9IGF3YWl0IHJlcS5jb25maWcuZGF0YWJhc2UuZmluZCgnX1VzZXInLCB7IG9iamVjdElkOiB1c2VySWQgfSk7XG4gICAgY29uc3QgdXNlciA9IHF1ZXJ5UmVzdWx0c1swXTtcbiAgICBpZiAoIXVzZXIpIHtcbiAgICAgIHRocm93IG5ldyBQYXJzZS5FcnJvcihQYXJzZS5FcnJvci5PQkpFQ1RfTk9UX0ZPVU5ELCAndXNlciBub3QgZm91bmQnKTtcbiAgICB9XG5cbiAgICB0aGlzLl9zYW5pdGl6ZUF1dGhEYXRhKHVzZXIpO1xuXG4gICAgY29uc3QgeyBzZXNzaW9uRGF0YSwgY3JlYXRlU2Vzc2lvbiB9ID0gUmVzdFdyaXRlLmNyZWF0ZVNlc3Npb24ocmVxLmNvbmZpZywge1xuICAgICAgdXNlcklkLFxuICAgICAgY3JlYXRlZFdpdGg6IHtcbiAgICAgICAgYWN0aW9uOiAnbG9naW4nLFxuICAgICAgICBhdXRoUHJvdmlkZXI6ICdtYXN0ZXJrZXknLFxuICAgICAgfSxcbiAgICAgIGluc3RhbGxhdGlvbklkOiByZXEuaW5mby5pbnN0YWxsYXRpb25JZCxcbiAgICB9KTtcblxuICAgIHVzZXIuc2Vzc2lvblRva2VuID0gc2Vzc2lvbkRhdGEuc2Vzc2lvblRva2VuO1xuXG4gICAgYXdhaXQgY3JlYXRlU2Vzc2lvbigpO1xuXG4gICAgcmV0dXJuIHsgcmVzcG9uc2U6IHVzZXIgfTtcbiAgfVxuXG4gIGhhbmRsZVZlcmlmeVBhc3N3b3JkKHJlcSkge1xuICAgIHJldHVybiB0aGlzLl9hdXRoZW50aWNhdGVVc2VyRnJvbVJlcXVlc3QocmVxKVxuICAgICAgLnRoZW4odXNlciA9PiB7XG4gICAgICAgIC8vIFJlbW92ZSBoaWRkZW4gcHJvcGVydGllcy5cbiAgICAgICAgVXNlcnNSb3V0ZXIucmVtb3ZlSGlkZGVuUHJvcGVydGllcyh1c2VyKTtcblxuICAgICAgICByZXR1cm4geyByZXNwb25zZTogdXNlciB9O1xuICAgICAgfSlcbiAgICAgIC5jYXRjaChlcnJvciA9PiB7XG4gICAgICAgIHRocm93IGVycm9yO1xuICAgICAgfSk7XG4gIH1cblxuICBoYW5kbGVMb2dPdXQocmVxKSB7XG4gICAgY29uc3Qgc3VjY2VzcyA9IHsgcmVzcG9uc2U6IHt9IH07XG4gICAgaWYgKHJlcS5pbmZvICYmIHJlcS5pbmZvLnNlc3Npb25Ub2tlbikge1xuICAgICAgcmV0dXJuIHJlc3RcbiAgICAgICAgLmZpbmQoXG4gICAgICAgICAgcmVxLmNvbmZpZyxcbiAgICAgICAgICBBdXRoLm1hc3RlcihyZXEuY29uZmlnKSxcbiAgICAgICAgICAnX1Nlc3Npb24nLFxuICAgICAgICAgIHsgc2Vzc2lvblRva2VuOiByZXEuaW5mby5zZXNzaW9uVG9rZW4gfSxcbiAgICAgICAgICB1bmRlZmluZWQsXG4gICAgICAgICAgcmVxLmluZm8uY2xpZW50U0RLLFxuICAgICAgICAgIHJlcS5pbmZvLmNvbnRleHRcbiAgICAgICAgKVxuICAgICAgICAudGhlbihyZWNvcmRzID0+IHtcbiAgICAgICAgICBpZiAocmVjb3Jkcy5yZXN1bHRzICYmIHJlY29yZHMucmVzdWx0cy5sZW5ndGgpIHtcbiAgICAgICAgICAgIHJldHVybiByZXN0XG4gICAgICAgICAgICAgIC5kZWwoXG4gICAgICAgICAgICAgICAgcmVxLmNvbmZpZyxcbiAgICAgICAgICAgICAgICBBdXRoLm1hc3RlcihyZXEuY29uZmlnKSxcbiAgICAgICAgICAgICAgICAnX1Nlc3Npb24nLFxuICAgICAgICAgICAgICAgIHJlY29yZHMucmVzdWx0c1swXS5vYmplY3RJZCxcbiAgICAgICAgICAgICAgICByZXEuaW5mby5jb250ZXh0XG4gICAgICAgICAgICAgIClcbiAgICAgICAgICAgICAgLnRoZW4oKCkgPT4ge1xuICAgICAgICAgICAgICAgIHRoaXMuX3J1bkFmdGVyTG9nb3V0VHJpZ2dlcihyZXEsIHJlY29yZHMucmVzdWx0c1swXSk7XG4gICAgICAgICAgICAgICAgcmV0dXJuIFByb21pc2UucmVzb2x2ZShzdWNjZXNzKTtcbiAgICAgICAgICAgICAgfSk7XG4gICAgICAgICAgfVxuICAgICAgICAgIHJldHVybiBQcm9taXNlLnJlc29sdmUoc3VjY2Vzcyk7XG4gICAgICAgIH0pO1xuICAgIH1cbiAgICByZXR1cm4gUHJvbWlzZS5yZXNvbHZlKHN1Y2Nlc3MpO1xuICB9XG5cbiAgX3J1bkFmdGVyTG9nb3V0VHJpZ2dlcihyZXEsIHNlc3Npb24pIHtcbiAgICAvLyBBZnRlciBsb2dvdXQgdHJpZ2dlclxuICAgIG1heWJlUnVuVHJpZ2dlcihcbiAgICAgIFRyaWdnZXJUeXBlcy5hZnRlckxvZ291dCxcbiAgICAgIHJlcS5hdXRoLFxuICAgICAgUGFyc2UuU2Vzc2lvbi5mcm9tSlNPTihPYmplY3QuYXNzaWduKHsgY2xhc3NOYW1lOiAnX1Nlc3Npb24nIH0sIHNlc3Npb24pKSxcbiAgICAgIG51bGwsXG4gICAgICByZXEuY29uZmlnXG4gICAgKTtcbiAgfVxuXG4gIF90aHJvd09uQmFkRW1haWxDb25maWcocmVxKSB7XG4gICAgdHJ5IHtcbiAgICAgIENvbmZpZy52YWxpZGF0ZUVtYWlsQ29uZmlndXJhdGlvbih7XG4gICAgICAgIGVtYWlsQWRhcHRlcjogcmVxLmNvbmZpZy51c2VyQ29udHJvbGxlci5hZGFwdGVyLFxuICAgICAgICBhcHBOYW1lOiByZXEuY29uZmlnLmFwcE5hbWUsXG4gICAgICAgIHB1YmxpY1NlcnZlclVSTDogcmVxLmNvbmZpZy5wdWJsaWNTZXJ2ZXJVUkwsXG4gICAgICAgIGVtYWlsVmVyaWZ5VG9rZW5WYWxpZGl0eUR1cmF0aW9uOiByZXEuY29uZmlnLmVtYWlsVmVyaWZ5VG9rZW5WYWxpZGl0eUR1cmF0aW9uLFxuICAgICAgICBlbWFpbFZlcmlmeVRva2VuUmV1c2VJZlZhbGlkOiByZXEuY29uZmlnLmVtYWlsVmVyaWZ5VG9rZW5SZXVzZUlmVmFsaWQsXG4gICAgICB9KTtcbiAgICB9IGNhdGNoIChlKSB7XG4gICAgICBpZiAodHlwZW9mIGUgPT09ICdzdHJpbmcnKSB7XG4gICAgICAgIC8vIE1heWJlIHdlIG5lZWQgYSBCYWQgQ29uZmlndXJhdGlvbiBlcnJvciwgYnV0IHRoZSBTREtzIHdvbid0IHVuZGVyc3RhbmQgaXQuIEZvciBub3csIEludGVybmFsIFNlcnZlciBFcnJvci5cbiAgICAgICAgdGhyb3cgbmV3IFBhcnNlLkVycm9yKFxuICAgICAgICAgIFBhcnNlLkVycm9yLklOVEVSTkFMX1NFUlZFUl9FUlJPUixcbiAgICAgICAgICAnQW4gYXBwTmFtZSwgcHVibGljU2VydmVyVVJMLCBhbmQgZW1haWxBZGFwdGVyIGFyZSByZXF1aXJlZCBmb3IgcGFzc3dvcmQgcmVzZXQgYW5kIGVtYWlsIHZlcmlmaWNhdGlvbiBmdW5jdGlvbmFsaXR5LidcbiAgICAgICAgKTtcbiAgICAgIH0gZWxzZSB7XG4gICAgICAgIHRocm93IGU7XG4gICAgICB9XG4gICAgfVxuICB9XG5cbiAgaGFuZGxlUmVzZXRSZXF1ZXN0KHJlcSkge1xuICAgIHRoaXMuX3Rocm93T25CYWRFbWFpbENvbmZpZyhyZXEpO1xuXG4gICAgY29uc3QgeyBlbWFpbCB9ID0gcmVxLmJvZHk7XG4gICAgaWYgKCFlbWFpbCkge1xuICAgICAgdGhyb3cgbmV3IFBhcnNlLkVycm9yKFBhcnNlLkVycm9yLkVNQUlMX01JU1NJTkcsICd5b3UgbXVzdCBwcm92aWRlIGFuIGVtYWlsJyk7XG4gICAgfVxuICAgIGlmICh0eXBlb2YgZW1haWwgIT09ICdzdHJpbmcnKSB7XG4gICAgICB0aHJvdyBuZXcgUGFyc2UuRXJyb3IoXG4gICAgICAgIFBhcnNlLkVycm9yLklOVkFMSURfRU1BSUxfQUREUkVTUyxcbiAgICAgICAgJ3lvdSBtdXN0IHByb3ZpZGUgYSB2YWxpZCBlbWFpbCBzdHJpbmcnXG4gICAgICApO1xuICAgIH1cbiAgICBjb25zdCB1c2VyQ29udHJvbGxlciA9IHJlcS5jb25maWcudXNlckNvbnRyb2xsZXI7XG4gICAgcmV0dXJuIHVzZXJDb250cm9sbGVyLnNlbmRQYXNzd29yZFJlc2V0RW1haWwoZW1haWwpLnRoZW4oXG4gICAgICAoKSA9PiB7XG4gICAgICAgIHJldHVybiBQcm9taXNlLnJlc29sdmUoe1xuICAgICAgICAgIHJlc3BvbnNlOiB7fSxcbiAgICAgICAgfSk7XG4gICAgICB9LFxuICAgICAgZXJyID0+IHtcbiAgICAgICAgaWYgKGVyci5jb2RlID09PSBQYXJzZS5FcnJvci5PQkpFQ1RfTk9UX0ZPVU5EKSB7XG4gICAgICAgICAgLy8gUmV0dXJuIHN1Y2Nlc3Mgc28gdGhhdCB0aGlzIGVuZHBvaW50IGNhbid0XG4gICAgICAgICAgLy8gYmUgdXNlZCB0byBlbnVtZXJhdGUgdmFsaWQgZW1haWxzXG4gICAgICAgICAgcmV0dXJuIFByb21pc2UucmVzb2x2ZSh7XG4gICAgICAgICAgICByZXNwb25zZToge30sXG4gICAgICAgICAgfSk7XG4gICAgICAgIH0gZWxzZSB7XG4gICAgICAgICAgdGhyb3cgZXJyO1xuICAgICAgICB9XG4gICAgICB9XG4gICAgKTtcbiAgfVxuXG4gIGhhbmRsZVZlcmlmaWNhdGlvbkVtYWlsUmVxdWVzdChyZXEpIHtcbiAgICB0aGlzLl90aHJvd09uQmFkRW1haWxDb25maWcocmVxKTtcblxuICAgIGNvbnN0IHsgZW1haWwgfSA9IHJlcS5ib2R5O1xuICAgIGlmICghZW1haWwpIHtcbiAgICAgIHRocm93IG5ldyBQYXJzZS5FcnJvcihQYXJzZS5FcnJvci5FTUFJTF9NSVNTSU5HLCAneW91IG11c3QgcHJvdmlkZSBhbiBlbWFpbCcpO1xuICAgIH1cbiAgICBpZiAodHlwZW9mIGVtYWlsICE9PSAnc3RyaW5nJykge1xuICAgICAgdGhyb3cgbmV3IFBhcnNlLkVycm9yKFxuICAgICAgICBQYXJzZS5FcnJvci5JTlZBTElEX0VNQUlMX0FERFJFU1MsXG4gICAgICAgICd5b3UgbXVzdCBwcm92aWRlIGEgdmFsaWQgZW1haWwgc3RyaW5nJ1xuICAgICAgKTtcbiAgICB9XG5cbiAgICByZXR1cm4gcmVxLmNvbmZpZy5kYXRhYmFzZS5maW5kKCdfVXNlcicsIHsgZW1haWw6IGVtYWlsIH0pLnRoZW4ocmVzdWx0cyA9PiB7XG4gICAgICBpZiAoIXJlc3VsdHMubGVuZ3RoIHx8IHJlc3VsdHMubGVuZ3RoIDwgMSkge1xuICAgICAgICB0aHJvdyBuZXcgUGFyc2UuRXJyb3IoUGFyc2UuRXJyb3IuRU1BSUxfTk9UX0ZPVU5ELCBgTm8gdXNlciBmb3VuZCB3aXRoIGVtYWlsICR7ZW1haWx9YCk7XG4gICAgICB9XG4gICAgICBjb25zdCB1c2VyID0gcmVzdWx0c1swXTtcblxuICAgICAgLy8gcmVtb3ZlIHBhc3N3b3JkIGZpZWxkLCBtZXNzZXMgd2l0aCBzYXZpbmcgb24gcG9zdGdyZXNcbiAgICAgIGRlbGV0ZSB1c2VyLnBhc3N3b3JkO1xuXG4gICAgICBpZiAodXNlci5lbWFpbFZlcmlmaWVkKSB7XG4gICAgICAgIHRocm93IG5ldyBQYXJzZS5FcnJvcihQYXJzZS5FcnJvci5PVEhFUl9DQVVTRSwgYEVtYWlsICR7ZW1haWx9IGlzIGFscmVhZHkgdmVyaWZpZWQuYCk7XG4gICAgICB9XG5cbiAgICAgIGNvbnN0IHVzZXJDb250cm9sbGVyID0gcmVxLmNvbmZpZy51c2VyQ29udHJvbGxlcjtcbiAgICAgIHJldHVybiB1c2VyQ29udHJvbGxlci5yZWdlbmVyYXRlRW1haWxWZXJpZnlUb2tlbih1c2VyKS50aGVuKCgpID0+IHtcbiAgICAgICAgdXNlckNvbnRyb2xsZXIuc2VuZFZlcmlmaWNhdGlvbkVtYWlsKHVzZXIpO1xuICAgICAgICByZXR1cm4geyByZXNwb25zZToge30gfTtcbiAgICAgIH0pO1xuICAgIH0pO1xuICB9XG5cbiAgYXN5bmMgaGFuZGxlQ2hhbGxlbmdlKHJlcSkge1xuICAgIGNvbnN0IHsgdXNlcm5hbWUsIGVtYWlsLCBwYXNzd29yZCwgYXV0aERhdGEsIGNoYWxsZW5nZURhdGEgfSA9IHJlcS5ib2R5O1xuXG4gICAgLy8gaWYgdXNlcm5hbWUgb3IgZW1haWwgcHJvdmlkZWQgd2l0aCBwYXNzd29yZCB0cnkgdG8gYXV0aGVudGljYXRlIHRoZSB1c2VyIGJ5IHVzZXJuYW1lXG4gICAgbGV0IHVzZXI7XG4gICAgaWYgKHVzZXJuYW1lIHx8IGVtYWlsKSB7XG4gICAgICBpZiAoIXBhc3N3b3JkKVxuICAgICAgICB0aHJvdyBuZXcgUGFyc2UuRXJyb3IoXG4gICAgICAgICAgUGFyc2UuRXJyb3IuT1RIRVJfQ0FVU0UsXG4gICAgICAgICAgJ1lvdSBwcm92aWRlZCB1c2VybmFtZSBvciBlbWFpbCwgeW91IG5lZWQgdG8gYWxzbyBwcm92aWRlIHBhc3N3b3JkLidcbiAgICAgICAgKTtcbiAgICAgIHVzZXIgPSBhd2FpdCB0aGlzLl9hdXRoZW50aWNhdGVVc2VyRnJvbVJlcXVlc3QocmVxKTtcbiAgICB9XG5cbiAgICBpZiAoIWNoYWxsZW5nZURhdGEpIHRocm93IG5ldyBQYXJzZS5FcnJvcihQYXJzZS5FcnJvci5PVEhFUl9DQVVTRSwgJ05vdGhpbmcgdG8gY2hhbGxlbmdlLicpO1xuXG4gICAgaWYgKHR5cGVvZiBjaGFsbGVuZ2VEYXRhICE9PSAnb2JqZWN0JylcbiAgICAgIHRocm93IG5ldyBQYXJzZS5FcnJvcihQYXJzZS5FcnJvci5PVEhFUl9DQVVTRSwgJ2NoYWxsZW5nZURhdGEgc2hvdWxkIGJlIGFuIG9iamVjdC4nKTtcblxuICAgIGxldCByZXF1ZXN0O1xuICAgIGxldCBwYXJzZVVzZXI7XG5cbiAgICAvLyBUcnkgdG8gZmluZCB1c2VyIGJ5IGF1dGhEYXRhXG4gICAgaWYgKGF1dGhEYXRhKSB7XG4gICAgICBpZiAodHlwZW9mIGF1dGhEYXRhICE9PSAnb2JqZWN0Jykge1xuICAgICAgICB0aHJvdyBuZXcgUGFyc2UuRXJyb3IoUGFyc2UuRXJyb3IuT1RIRVJfQ0FVU0UsICdhdXRoRGF0YSBzaG91bGQgYmUgYW4gb2JqZWN0LicpO1xuICAgICAgfVxuICAgICAgaWYgKHVzZXIpIHtcbiAgICAgICAgdGhyb3cgbmV3IFBhcnNlLkVycm9yKFxuICAgICAgICAgIFBhcnNlLkVycm9yLk9USEVSX0NBVVNFLFxuICAgICAgICAgICdZb3UgY2FudCBwcm92aWRlIHVzZXJuYW1lL2VtYWlsIGFuZCBhdXRoRGF0YSwgb25seSB1c2Ugb25lIGlkZW50aWZpY2F0aW9uIG1ldGhvZC4nXG4gICAgICAgICk7XG4gICAgICB9XG5cbiAgICAgIGlmIChPYmplY3Qua2V5cyhhdXRoRGF0YSkuZmlsdGVyKGtleSA9PiBhdXRoRGF0YVtrZXldLmlkKS5sZW5ndGggPiAxKSB7XG4gICAgICAgIHRocm93IG5ldyBQYXJzZS5FcnJvcihcbiAgICAgICAgICBQYXJzZS5FcnJvci5PVEhFUl9DQVVTRSxcbiAgICAgICAgICAnWW91IGNhbnQgcHJvdmlkZSBtb3JlIHRoYW4gb25lIGF1dGhEYXRhIHByb3ZpZGVyIHdpdGggYW4gaWQuJ1xuICAgICAgICApO1xuICAgICAgfVxuXG4gICAgICBjb25zdCByZXN1bHRzID0gYXdhaXQgQXV0aC5maW5kVXNlcnNXaXRoQXV0aERhdGEocmVxLmNvbmZpZywgYXV0aERhdGEpO1xuXG4gICAgICB0cnkge1xuICAgICAgICBpZiAoIXJlc3VsdHNbMF0gfHwgcmVzdWx0cy5sZW5ndGggPiAxKSB7XG4gICAgICAgICAgdGhyb3cgbmV3IFBhcnNlLkVycm9yKFBhcnNlLkVycm9yLk9USEVSX0NBVVNFLCAnVXNlciBub3QgZm91bmQuJyk7XG4gICAgICAgIH1cbiAgICAgICAgLy8gRmluZCB0aGUgcHJvdmlkZXIgdXNlZCB0byBmaW5kIHRoZSB1c2VyXG4gICAgICAgIGNvbnN0IHByb3ZpZGVyID0gT2JqZWN0LmtleXMoYXV0aERhdGEpLmZpbmQoa2V5ID0+IGF1dGhEYXRhW2tleV0uaWQpO1xuXG4gICAgICAgIHBhcnNlVXNlciA9IFBhcnNlLlVzZXIuZnJvbUpTT04oeyBjbGFzc05hbWU6ICdfVXNlcicsIC4uLnJlc3VsdHNbMF0gfSk7XG4gICAgICAgIHJlcXVlc3QgPSBnZXRSZXF1ZXN0T2JqZWN0KHVuZGVmaW5lZCwgcmVxLmF1dGgsIHBhcnNlVXNlciwgcGFyc2VVc2VyLCByZXEuY29uZmlnKTtcbiAgICAgICAgcmVxdWVzdC5pc0NoYWxsZW5nZSA9IHRydWU7XG4gICAgICAgIC8vIFZhbGlkYXRlIGF1dGhEYXRhIHVzZWQgdG8gaWRlbnRpZnkgdGhlIHVzZXIgdG8gYXZvaWQgYnJ1dGUtZm9yY2UgYXR0YWNrIG9uIGBpZGBcbiAgICAgICAgY29uc3QgeyB2YWxpZGF0b3IgfSA9IHJlcS5jb25maWcuYXV0aERhdGFNYW5hZ2VyLmdldFZhbGlkYXRvckZvclByb3ZpZGVyKHByb3ZpZGVyKTtcbiAgICAgICAgYXdhaXQgdmFsaWRhdG9yKGF1dGhEYXRhW3Byb3ZpZGVyXSwgcmVxLCBwYXJzZVVzZXIsIHJlcXVlc3QpO1xuICAgICAgfSBjYXRjaCAoZSkge1xuICAgICAgICAvLyBSZXdyaXRlIHRoZSBlcnJvciB0byBhdm9pZCBndWVzcyBpZCBhdHRhY2tcbiAgICAgICAgbG9nZ2VyLmVycm9yKGUpO1xuICAgICAgICB0aHJvdyBuZXcgUGFyc2UuRXJyb3IoUGFyc2UuRXJyb3IuT1RIRVJfQ0FVU0UsICdVc2VyIG5vdCBmb3VuZC4nKTtcbiAgICAgIH1cbiAgICB9XG5cbiAgICBpZiAoIXBhcnNlVXNlcikge1xuICAgICAgcGFyc2VVc2VyID0gdXNlciA/IFBhcnNlLlVzZXIuZnJvbUpTT04oeyBjbGFzc05hbWU6ICdfVXNlcicsIC4uLnVzZXIgfSkgOiB1bmRlZmluZWQ7XG4gICAgfVxuXG4gICAgaWYgKCFyZXF1ZXN0KSB7XG4gICAgICByZXF1ZXN0ID0gZ2V0UmVxdWVzdE9iamVjdCh1bmRlZmluZWQsIHJlcS5hdXRoLCBwYXJzZVVzZXIsIHBhcnNlVXNlciwgcmVxLmNvbmZpZyk7XG4gICAgICByZXF1ZXN0LmlzQ2hhbGxlbmdlID0gdHJ1ZTtcbiAgICB9XG5cbiAgICAvLyBFeGVjdXRlIGNoYWxsZW5nZSBzdGVwLWJ5LXN0ZXAgd2l0aCBjb25zaXN0ZW50IG9yZGVyIGZvciBiZXR0ZXIgZXJyb3IgZmVlZGJhY2tcbiAgICAvLyBhbmQgdG8gYXZvaWQgdG8gdHJpZ2dlciBvdGhlcnMgY2hhbGxlbmdlcyBpZiBvbmUgb2YgdGhlbSBmYWlsc1xuICAgIGNvbnN0IGNoYWxsZW5nZSA9IGF3YWl0IEF1dGgucmVkdWNlUHJvbWlzZShcbiAgICAgIE9iamVjdC5rZXlzKGNoYWxsZW5nZURhdGEpLnNvcnQoKSxcbiAgICAgIGFzeW5jIChhY2MsIHByb3ZpZGVyKSA9PiB7XG4gICAgICAgIGNvbnN0IGF1dGhBZGFwdGVyID0gcmVxLmNvbmZpZy5hdXRoRGF0YU1hbmFnZXIuZ2V0VmFsaWRhdG9yRm9yUHJvdmlkZXIocHJvdmlkZXIpO1xuICAgICAgICBpZiAoIWF1dGhBZGFwdGVyKSByZXR1cm4gYWNjO1xuICAgICAgICBjb25zdCB7XG4gICAgICAgICAgYWRhcHRlcjogeyBjaGFsbGVuZ2UgfSxcbiAgICAgICAgfSA9IGF1dGhBZGFwdGVyO1xuICAgICAgICBpZiAodHlwZW9mIGNoYWxsZW5nZSA9PT0gJ2Z1bmN0aW9uJykge1xuICAgICAgICAgIGNvbnN0IHByb3ZpZGVyQ2hhbGxlbmdlUmVzcG9uc2UgPSBhd2FpdCBjaGFsbGVuZ2UoXG4gICAgICAgICAgICBjaGFsbGVuZ2VEYXRhW3Byb3ZpZGVyXSxcbiAgICAgICAgICAgIGF1dGhEYXRhICYmIGF1dGhEYXRhW3Byb3ZpZGVyXSxcbiAgICAgICAgICAgIHJlcS5jb25maWcuYXV0aFtwcm92aWRlcl0sXG4gICAgICAgICAgICByZXF1ZXN0LFxuICAgICAgICAgICAgcmVxLmNvbmZpZ1xuICAgICAgICAgICk7XG4gICAgICAgICAgYWNjW3Byb3ZpZGVyXSA9IHByb3ZpZGVyQ2hhbGxlbmdlUmVzcG9uc2UgfHwgdHJ1ZTtcbiAgICAgICAgICByZXR1cm4gYWNjO1xuICAgICAgICB9XG4gICAgICB9LFxuICAgICAge31cbiAgICApO1xuXG4gICAgcmV0dXJuIHsgcmVzcG9uc2U6IHsgY2hhbGxlbmdlRGF0YTogY2hhbGxlbmdlIH0gfTtcbiAgfVxuXG4gIG1vdW50Um91dGVzKCkge1xuICAgIHRoaXMucm91dGUoJ0dFVCcsICcvdXNlcnMnLCByZXEgPT4ge1xuICAgICAgcmV0dXJuIHRoaXMuaGFuZGxlRmluZChyZXEpO1xuICAgIH0pO1xuICAgIHRoaXMucm91dGUoJ1BPU1QnLCAnL3VzZXJzJywgcHJvbWlzZUVuc3VyZUlkZW1wb3RlbmN5LCByZXEgPT4ge1xuICAgICAgcmV0dXJuIHRoaXMuaGFuZGxlQ3JlYXRlKHJlcSk7XG4gICAgfSk7XG4gICAgdGhpcy5yb3V0ZSgnR0VUJywgJy91c2Vycy9tZScsIHJlcSA9PiB7XG4gICAgICByZXR1cm4gdGhpcy5oYW5kbGVNZShyZXEpO1xuICAgIH0pO1xuICAgIHRoaXMucm91dGUoJ0dFVCcsICcvdXNlcnMvOm9iamVjdElkJywgcmVxID0+IHtcbiAgICAgIHJldHVybiB0aGlzLmhhbmRsZUdldChyZXEpO1xuICAgIH0pO1xuICAgIHRoaXMucm91dGUoJ1BVVCcsICcvdXNlcnMvOm9iamVjdElkJywgcHJvbWlzZUVuc3VyZUlkZW1wb3RlbmN5LCByZXEgPT4ge1xuICAgICAgcmV0dXJuIHRoaXMuaGFuZGxlVXBkYXRlKHJlcSk7XG4gICAgfSk7XG4gICAgdGhpcy5yb3V0ZSgnREVMRVRFJywgJy91c2Vycy86b2JqZWN0SWQnLCByZXEgPT4ge1xuICAgICAgcmV0dXJuIHRoaXMuaGFuZGxlRGVsZXRlKHJlcSk7XG4gICAgfSk7XG4gICAgdGhpcy5yb3V0ZSgnR0VUJywgJy9sb2dpbicsIHJlcSA9PiB7XG4gICAgICByZXR1cm4gdGhpcy5oYW5kbGVMb2dJbihyZXEpO1xuICAgIH0pO1xuICAgIHRoaXMucm91dGUoJ1BPU1QnLCAnL2xvZ2luJywgcmVxID0+IHtcbiAgICAgIHJldHVybiB0aGlzLmhhbmRsZUxvZ0luKHJlcSk7XG4gICAgfSk7XG4gICAgdGhpcy5yb3V0ZSgnUE9TVCcsICcvbG9naW5BcycsIHJlcSA9PiB7XG4gICAgICByZXR1cm4gdGhpcy5oYW5kbGVMb2dJbkFzKHJlcSk7XG4gICAgfSk7XG4gICAgdGhpcy5yb3V0ZSgnUE9TVCcsICcvbG9nb3V0JywgcmVxID0+IHtcbiAgICAgIHJldHVybiB0aGlzLmhhbmRsZUxvZ091dChyZXEpO1xuICAgIH0pO1xuICAgIHRoaXMucm91dGUoJ1BPU1QnLCAnL3JlcXVlc3RQYXNzd29yZFJlc2V0JywgcmVxID0+IHtcbiAgICAgIHJldHVybiB0aGlzLmhhbmRsZVJlc2V0UmVxdWVzdChyZXEpO1xuICAgIH0pO1xuICAgIHRoaXMucm91dGUoJ1BPU1QnLCAnL3ZlcmlmaWNhdGlvbkVtYWlsUmVxdWVzdCcsIHJlcSA9PiB7XG4gICAgICByZXR1cm4gdGhpcy5oYW5kbGVWZXJpZmljYXRpb25FbWFpbFJlcXVlc3QocmVxKTtcbiAgICB9KTtcbiAgICB0aGlzLnJvdXRlKCdHRVQnLCAnL3ZlcmlmeVBhc3N3b3JkJywgcmVxID0+IHtcbiAgICAgIHJldHVybiB0aGlzLmhhbmRsZVZlcmlmeVBhc3N3b3JkKHJlcSk7XG4gICAgfSk7XG4gICAgdGhpcy5yb3V0ZSgnUE9TVCcsICcvY2hhbGxlbmdlJywgcmVxID0+IHtcbiAgICAgIHJldHVybiB0aGlzLmhhbmRsZUNoYWxsZW5nZShyZXEpO1xuICAgIH0pO1xuICB9XG59XG5cbmV4cG9ydCBkZWZhdWx0IFVzZXJzUm91dGVyO1xuIl0sIm1hcHBpbmdzIjoiOzs7Ozs7QUFFQSxJQUFBQSxLQUFBLEdBQUFDLHNCQUFBLENBQUFDLE9BQUE7QUFDQSxJQUFBQyxPQUFBLEdBQUFGLHNCQUFB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