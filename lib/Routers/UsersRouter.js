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
function ownKeys(object, enumerableOnly) { var keys = Object.keys(object); if (Object.getOwnPropertySymbols) { var symbols = Object.getOwnPropertySymbols(object); enumerableOnly && (symbols = symbols.filter(function (sym) { return Object.getOwnPropertyDescriptor(object, sym).enumerable; })), keys.push.apply(keys, symbols); } return keys; }
function _objectSpread(target) { for (var i = 1; i < arguments.length; i++) { var source = null != arguments[i] ? arguments[i] : {}; i % 2 ? ownKeys(Object(source), !0).forEach(function (key) { _defineProperty(target, key, source[key]); }) : Object.getOwnPropertyDescriptors ? Object.defineProperties(target, Object.getOwnPropertyDescriptors(source)) : ownKeys(Object(source)).forEach(function (key) { Object.defineProperty(target, key, Object.getOwnPropertyDescriptor(source, key)); }); } return target; }
function _defineProperty(obj, key, value) { key = _toPropertyKey(key); if (key in obj) { Object.defineProperty(obj, key, { value: value, enumerable: true, configurable: true, writable: true }); } else { obj[key] = value; } return obj; }
function _toPropertyKey(arg) { var key = _toPrimitive(arg, "string"); return typeof key === "symbol" ? key : String(key); }
function _toPrimitive(input, hint) { if (typeof input !== "object" || input === null) return input; var prim = input[Symbol.toPrimitive]; if (prim !== undefined) { var res = prim.call(input, hint || "default"); if (typeof res !== "object") return res; throw new TypeError("@@toPrimitive must return a primitive value."); } return (hint === "string" ? String : Number)(input); }
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
      return req.config.database.find('_User', query, {}, _Auth.default.maintenance(req.config)).then(results => {
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
    _Auth.default.checkIfUserHasProvidedConfiguredProvidersForLogin(req, authData, user.authData, req.config);
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
    await (0, _triggers.maybeRunTrigger)(_triggers.Types.afterLogin, _objectSpread(_objectSpread({}, req.auth), {}, {
      user: afterLoginUser
    }), afterLoginUser, null, req.config);
    if (authDataResponse) {
      user.authDataResponse = authDataResponse;
    }
    await req.config.authDataManager.runAfterFind(req, user.authData);
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
  async handleLogOut(req) {
    const success = {
      response: {}
    };
    if (req.info && req.info.sessionToken) {
      const records = await _rest.default.find(req.config, _Auth.default.master(req.config), '_Session', {
        sessionToken: req.info.sessionToken
      }, undefined, req.info.clientSDK, req.info.context);
      if (records.results && records.results.length) {
        await _rest.default.del(req.config, _Auth.default.master(req.config), '_Session', records.results[0].objectId, req.info.context);
        await (0, _triggers.maybeRunTrigger)(_triggers.Types.afterLogout, req.auth, _node.default.Session.fromJSON(Object.assign({
          className: '_Session'
        }, records.results[0])), null, req.config);
      }
    }
    return success;
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
  async handleResetRequest(req) {
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
    try {
      await userController.sendPasswordResetEmail(email);
      return {
        response: {}
      };
    } catch (err) {
      if (err.code === _node.default.Error.OBJECT_NOT_FOUND) {
        var _req$config$passwordP;
        if (((_req$config$passwordP = req.config.passwordPolicy) === null || _req$config$passwordP === void 0 ? void 0 : _req$config$passwordP.resetPasswordSuccessOnInvalidEmail) ?? true) {
          return {
            response: {}
          };
        }
        err.message = `A user with that email does not exist.`;
      }
      throw err;
    }
  }
  async handleVerificationEmailRequest(req) {
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
    const results = await req.config.database.find('_User', {
      email: email
    });
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
    const send = await userController.regenerateEmailVerifyToken(user, req.auth.isMaster);
    if (send) {
      userController.sendVerificationEmail(user, req);
    }
    return {
      response: {}
    };
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
    let parseUser;

    // Try to find user by authData
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
    const acc = {};
    // Execute challenge step-by-step with consistent order for better error feedback
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
          const providerChallengeResponse = await challenge(challengeData[provider], authData && authData[provider], req.config.auth[provider], request);
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
//# sourceMappingURL=data:application/json;charset=utf-8;base64,eyJ2ZXJzaW9uIjozLCJuYW1lcyI6WyJVc2Vyc1JvdXRlciIsIkNsYXNzZXNSb3V0ZXIiLCJjbGFzc05hbWUiLCJyZW1vdmVIaWRkZW5Qcm9wZXJ0aWVzIiwib2JqIiwia2V5IiwiT2JqZWN0IiwicHJvdG90eXBlIiwiaGFzT3duUHJvcGVydHkiLCJjYWxsIiwidGVzdCIsIl9zYW5pdGl6ZUF1dGhEYXRhIiwidXNlciIsInBhc3N3b3JkIiwiYXV0aERhdGEiLCJrZXlzIiwiZm9yRWFjaCIsInByb3ZpZGVyIiwibGVuZ3RoIiwiX2F1dGhlbnRpY2F0ZVVzZXJGcm9tUmVxdWVzdCIsInJlcSIsIlByb21pc2UiLCJyZXNvbHZlIiwicmVqZWN0IiwicGF5bG9hZCIsImJvZHkiLCJ1c2VybmFtZSIsInF1ZXJ5IiwiZW1haWwiLCJQYXJzZSIsIkVycm9yIiwiVVNFUk5BTUVfTUlTU0lORyIsIlBBU1NXT1JEX01JU1NJTkciLCJPQkpFQ1RfTk9UX0ZPVU5EIiwiaXNWYWxpZFBhc3N3b3JkIiwiJG9yIiwiY29uZmlnIiwiZGF0YWJhc2UiLCJmaW5kIiwiQXV0aCIsIm1haW50ZW5hbmNlIiwidGhlbiIsInJlc3VsdHMiLCJsb2dnZXJDb250cm9sbGVyIiwid2FybiIsImZpbHRlciIsInBhc3N3b3JkQ3J5cHRvIiwiY29tcGFyZSIsImNvcnJlY3QiLCJhY2NvdW50TG9ja291dFBvbGljeSIsIkFjY291bnRMb2Nrb3V0IiwiaGFuZGxlTG9naW5BdHRlbXB0IiwiYXV0aCIsImlzTWFzdGVyIiwiQUNMIiwidmVyaWZ5VXNlckVtYWlscyIsInByZXZlbnRMb2dpbldpdGhVbnZlcmlmaWVkRW1haWwiLCJlbWFpbFZlcmlmaWVkIiwiRU1BSUxfTk9UX0ZPVU5EIiwiY2F0Y2giLCJlcnJvciIsImhhbmRsZU1lIiwiaW5mbyIsInNlc3Npb25Ub2tlbiIsIklOVkFMSURfU0VTU0lPTl9UT0tFTiIsInJlc3QiLCJtYXN0ZXIiLCJpbmNsdWRlIiwiY2xpZW50U0RLIiwiY29udGV4dCIsInJlc3BvbnNlIiwiaGFuZGxlTG9nSW4iLCJjaGVja0lmVXNlckhhc1Byb3ZpZGVkQ29uZmlndXJlZFByb3ZpZGVyc0ZvckxvZ2luIiwiYXV0aERhdGFSZXNwb25zZSIsInZhbGlkYXRlZEF1dGhEYXRhIiwicmVzIiwiaGFuZGxlQXV0aERhdGFWYWxpZGF0aW9uIiwiUmVzdFdyaXRlIiwib2JqZWN0SWQiLCJwYXNzd29yZFBvbGljeSIsIm1heFBhc3N3b3JkQWdlIiwiY2hhbmdlZEF0IiwiX3Bhc3N3b3JkX2NoYW5nZWRfYXQiLCJEYXRlIiwidXBkYXRlIiwiX2VuY29kZSIsIl9fdHlwZSIsImlzbyIsImV4cGlyZXNBdCIsImdldFRpbWUiLCJmaWxlc0NvbnRyb2xsZXIiLCJleHBhbmRGaWxlc0luT2JqZWN0IiwibWF5YmVSdW5UcmlnZ2VyIiwiVHJpZ2dlclR5cGVzIiwiYmVmb3JlTG9naW4iLCJVc2VyIiwiZnJvbUpTT04iLCJhc3NpZ24iLCJzZXNzaW9uRGF0YSIsImNyZWF0ZVNlc3Npb24iLCJ1c2VySWQiLCJjcmVhdGVkV2l0aCIsImFjdGlvbiIsImF1dGhQcm92aWRlciIsImluc3RhbGxhdGlvbklkIiwiYWZ0ZXJMb2dpblVzZXIiLCJhZnRlckxvZ2luIiwiYXV0aERhdGFNYW5hZ2VyIiwicnVuQWZ0ZXJGaW5kIiwiaGFuZGxlTG9nSW5BcyIsIk9QRVJBVElPTl9GT1JCSURERU4iLCJJTlZBTElEX1ZBTFVFIiwicXVlcnlSZXN1bHRzIiwiaGFuZGxlVmVyaWZ5UGFzc3dvcmQiLCJoYW5kbGVMb2dPdXQiLCJzdWNjZXNzIiwicmVjb3JkcyIsInVuZGVmaW5lZCIsImRlbCIsImFmdGVyTG9nb3V0IiwiU2Vzc2lvbiIsIl90aHJvd09uQmFkRW1haWxDb25maWciLCJDb25maWciLCJ2YWxpZGF0ZUVtYWlsQ29uZmlndXJhdGlvbiIsImVtYWlsQWRhcHRlciIsInVzZXJDb250cm9sbGVyIiwiYWRhcHRlciIsImFwcE5hbWUiLCJwdWJsaWNTZXJ2ZXJVUkwiLCJlbWFpbFZlcmlmeVRva2VuVmFsaWRpdHlEdXJhdGlvbiIsImVtYWlsVmVyaWZ5VG9rZW5SZXVzZUlmVmFsaWQiLCJlIiwiSU5URVJOQUxfU0VSVkVSX0VSUk9SIiwiaGFuZGxlUmVzZXRSZXF1ZXN0IiwiRU1BSUxfTUlTU0lORyIsIklOVkFMSURfRU1BSUxfQUREUkVTUyIsInNlbmRQYXNzd29yZFJlc2V0RW1haWwiLCJlcnIiLCJjb2RlIiwicmVzZXRQYXNzd29yZFN1Y2Nlc3NPbkludmFsaWRFbWFpbCIsIm1lc3NhZ2UiLCJoYW5kbGVWZXJpZmljYXRpb25FbWFpbFJlcXVlc3QiLCJPVEhFUl9DQVVTRSIsInNlbmQiLCJyZWdlbmVyYXRlRW1haWxWZXJpZnlUb2tlbiIsInNlbmRWZXJpZmljYXRpb25FbWFpbCIsImhhbmRsZUNoYWxsZW5nZSIsImNoYWxsZW5nZURhdGEiLCJyZXF1ZXN0IiwicGFyc2VVc2VyIiwiaWQiLCJmaW5kVXNlcnNXaXRoQXV0aERhdGEiLCJnZXRSZXF1ZXN0T2JqZWN0IiwiaXNDaGFsbGVuZ2UiLCJ2YWxpZGF0b3IiLCJnZXRWYWxpZGF0b3JGb3JQcm92aWRlciIsInZhbGlkYXRvclJlc3BvbnNlIiwibG9nZ2VyIiwiYWNjIiwic29ydCIsImF1dGhBZGFwdGVyIiwiY2hhbGxlbmdlIiwicHJvdmlkZXJDaGFsbGVuZ2VSZXNwb25zZSIsInJlc29sdmVFcnJvciIsIlNDUklQVF9GQUlMRUQiLCJ1c2VyU3RyaW5nIiwiSlNPTiIsInN0cmluZ2lmeSIsImF1dGhlbnRpY2F0aW9uU3RlcCIsIm1vdW50Um91dGVzIiwicm91dGUiLCJoYW5kbGVGaW5kIiwicHJvbWlzZUVuc3VyZUlkZW1wb3RlbmN5IiwiaGFuZGxlQ3JlYXRlIiwiaGFuZGxlR2V0IiwiaGFuZGxlVXBkYXRlIiwiaGFuZGxlRGVsZXRlIl0sInNvdXJjZXMiOlsiLi4vLi4vc3JjL1JvdXRlcnMvVXNlcnNSb3V0ZXIuanMiXSwic291cmNlc0NvbnRlbnQiOlsiLy8gVGhlc2UgbWV0aG9kcyBoYW5kbGUgdGhlIFVzZXItcmVsYXRlZCByb3V0ZXMuXG5cbmltcG9ydCBQYXJzZSBmcm9tICdwYXJzZS9ub2RlJztcbmltcG9ydCBDb25maWcgZnJvbSAnLi4vQ29uZmlnJztcbmltcG9ydCBBY2NvdW50TG9ja291dCBmcm9tICcuLi9BY2NvdW50TG9ja291dCc7XG5pbXBvcnQgQ2xhc3Nlc1JvdXRlciBmcm9tICcuL0NsYXNzZXNSb3V0ZXInO1xuaW1wb3J0IHJlc3QgZnJvbSAnLi4vcmVzdCc7XG5pbXBvcnQgQXV0aCBmcm9tICcuLi9BdXRoJztcbmltcG9ydCBwYXNzd29yZENyeXB0byBmcm9tICcuLi9wYXNzd29yZCc7XG5pbXBvcnQge1xuICBtYXliZVJ1blRyaWdnZXIsXG4gIFR5cGVzIGFzIFRyaWdnZXJUeXBlcyxcbiAgZ2V0UmVxdWVzdE9iamVjdCxcbiAgcmVzb2x2ZUVycm9yLFxufSBmcm9tICcuLi90cmlnZ2Vycyc7XG5pbXBvcnQgeyBwcm9taXNlRW5zdXJlSWRlbXBvdGVuY3kgfSBmcm9tICcuLi9taWRkbGV3YXJlcyc7XG5pbXBvcnQgUmVzdFdyaXRlIGZyb20gJy4uL1Jlc3RXcml0ZSc7XG5pbXBvcnQgeyBsb2dnZXIgfSBmcm9tICcuLi9sb2dnZXInO1xuXG5leHBvcnQgY2xhc3MgVXNlcnNSb3V0ZXIgZXh0ZW5kcyBDbGFzc2VzUm91dGVyIHtcbiAgY2xhc3NOYW1lKCkge1xuICAgIHJldHVybiAnX1VzZXInO1xuICB9XG5cbiAgLyoqXG4gICAqIFJlbW92ZXMgYWxsIFwiX1wiIHByZWZpeGVkIHByb3BlcnRpZXMgZnJvbSBhbiBvYmplY3QsIGV4Y2VwdCBcIl9fdHlwZVwiXG4gICAqIEBwYXJhbSB7T2JqZWN0fSBvYmogQW4gb2JqZWN0LlxuICAgKi9cbiAgc3RhdGljIHJlbW92ZUhpZGRlblByb3BlcnRpZXMob2JqKSB7XG4gICAgZm9yICh2YXIga2V5IGluIG9iaikge1xuICAgICAgaWYgKE9iamVjdC5wcm90b3R5cGUuaGFzT3duUHJvcGVydHkuY2FsbChvYmosIGtleSkpIHtcbiAgICAgICAgLy8gUmVnZXhwIGNvbWVzIGZyb20gUGFyc2UuT2JqZWN0LnByb3RvdHlwZS52YWxpZGF0ZVxuICAgICAgICBpZiAoa2V5ICE9PSAnX190eXBlJyAmJiAhL15bQS1aYS16XVswLTlBLVphLXpfXSokLy50ZXN0KGtleSkpIHtcbiAgICAgICAgICBkZWxldGUgb2JqW2tleV07XG4gICAgICAgIH1cbiAgICAgIH1cbiAgICB9XG4gIH1cblxuICAvKipcbiAgICogQWZ0ZXIgcmV0cmlldmluZyBhIHVzZXIgZGlyZWN0bHkgZnJvbSB0aGUgZGF0YWJhc2UsIHdlIG5lZWQgdG8gcmVtb3ZlIHRoZVxuICAgKiBwYXNzd29yZCBmcm9tIHRoZSBvYmplY3QgKGZvciBzZWN1cml0eSksIGFuZCBmaXggYW4gaXNzdWUgc29tZSBTREtzIGhhdmVcbiAgICogd2l0aCBudWxsIHZhbHVlc1xuICAgKi9cbiAgX3Nhbml0aXplQXV0aERhdGEodXNlcikge1xuICAgIGRlbGV0ZSB1c2VyLnBhc3N3b3JkO1xuXG4gICAgLy8gU29tZXRpbWVzIHRoZSBhdXRoRGF0YSBzdGlsbCBoYXMgbnVsbCBvbiB0aGF0IGtleXNcbiAgICAvLyBodHRwczovL2dpdGh1Yi5jb20vcGFyc2UtY29tbXVuaXR5L3BhcnNlLXNlcnZlci9pc3N1ZXMvOTM1XG4gICAgaWYgKHVzZXIuYXV0aERhdGEpIHtcbiAgICAgIE9iamVjdC5rZXlzKHVzZXIuYXV0aERhdGEpLmZvckVhY2gocHJvdmlkZXIgPT4ge1xuICAgICAgICBpZiAodXNlci5hdXRoRGF0YVtwcm92aWRlcl0gPT09IG51bGwpIHtcbiAgICAgICAgICBkZWxldGUgdXNlci5hdXRoRGF0YVtwcm92aWRlcl07XG4gICAgICAgIH1cbiAgICAgIH0pO1xuICAgICAgaWYgKE9iamVjdC5rZXlzKHVzZXIuYXV0aERhdGEpLmxlbmd0aCA9PSAwKSB7XG4gICAgICAgIGRlbGV0ZSB1c2VyLmF1dGhEYXRhO1xuICAgICAgfVxuICAgIH1cbiAgfVxuXG4gIC8qKlxuICAgKiBWYWxpZGF0ZXMgYSBwYXNzd29yZCByZXF1ZXN0IGluIGxvZ2luIGFuZCB2ZXJpZnlQYXNzd29yZFxuICAgKiBAcGFyYW0ge09iamVjdH0gcmVxIFRoZSByZXF1ZXN0XG4gICAqIEByZXR1cm5zIHtPYmplY3R9IFVzZXIgb2JqZWN0XG4gICAqIEBwcml2YXRlXG4gICAqL1xuICBfYXV0aGVudGljYXRlVXNlckZyb21SZXF1ZXN0KHJlcSkge1xuICAgIHJldHVybiBuZXcgUHJvbWlzZSgocmVzb2x2ZSwgcmVqZWN0KSA9PiB7XG4gICAgICAvLyBVc2UgcXVlcnkgcGFyYW1ldGVycyBpbnN0ZWFkIGlmIHByb3ZpZGVkIGluIHVybFxuICAgICAgbGV0IHBheWxvYWQgPSByZXEuYm9keTtcbiAgICAgIGlmIChcbiAgICAgICAgKCFwYXlsb2FkLnVzZXJuYW1lICYmIHJlcS5xdWVyeSAmJiByZXEucXVlcnkudXNlcm5hbWUpIHx8XG4gICAgICAgICghcGF5bG9hZC5lbWFpbCAmJiByZXEucXVlcnkgJiYgcmVxLnF1ZXJ5LmVtYWlsKVxuICAgICAgKSB7XG4gICAgICAgIHBheWxvYWQgPSByZXEucXVlcnk7XG4gICAgICB9XG4gICAgICBjb25zdCB7IHVzZXJuYW1lLCBlbWFpbCwgcGFzc3dvcmQgfSA9IHBheWxvYWQ7XG5cbiAgICAgIC8vIFRPRE86IHVzZSB0aGUgcmlnaHQgZXJyb3IgY29kZXMgLyBkZXNjcmlwdGlvbnMuXG4gICAgICBpZiAoIXVzZXJuYW1lICYmICFlbWFpbCkge1xuICAgICAgICB0aHJvdyBuZXcgUGFyc2UuRXJyb3IoUGFyc2UuRXJyb3IuVVNFUk5BTUVfTUlTU0lORywgJ3VzZXJuYW1lL2VtYWlsIGlzIHJlcXVpcmVkLicpO1xuICAgICAgfVxuICAgICAgaWYgKCFwYXNzd29yZCkge1xuICAgICAgICB0aHJvdyBuZXcgUGFyc2UuRXJyb3IoUGFyc2UuRXJyb3IuUEFTU1dPUkRfTUlTU0lORywgJ3Bhc3N3b3JkIGlzIHJlcXVpcmVkLicpO1xuICAgICAgfVxuICAgICAgaWYgKFxuICAgICAgICB0eXBlb2YgcGFzc3dvcmQgIT09ICdzdHJpbmcnIHx8XG4gICAgICAgIChlbWFpbCAmJiB0eXBlb2YgZW1haWwgIT09ICdzdHJpbmcnKSB8fFxuICAgICAgICAodXNlcm5hbWUgJiYgdHlwZW9mIHVzZXJuYW1lICE9PSAnc3RyaW5nJylcbiAgICAgICkge1xuICAgICAgICB0aHJvdyBuZXcgUGFyc2UuRXJyb3IoUGFyc2UuRXJyb3IuT0JKRUNUX05PVF9GT1VORCwgJ0ludmFsaWQgdXNlcm5hbWUvcGFzc3dvcmQuJyk7XG4gICAgICB9XG5cbiAgICAgIGxldCB1c2VyO1xuICAgICAgbGV0IGlzVmFsaWRQYXNzd29yZCA9IGZhbHNlO1xuICAgICAgbGV0IHF1ZXJ5O1xuICAgICAgaWYgKGVtYWlsICYmIHVzZXJuYW1lKSB7XG4gICAgICAgIHF1ZXJ5ID0geyBlbWFpbCwgdXNlcm5hbWUgfTtcbiAgICAgIH0gZWxzZSBpZiAoZW1haWwpIHtcbiAgICAgICAgcXVlcnkgPSB7IGVtYWlsIH07XG4gICAgICB9IGVsc2Uge1xuICAgICAgICBxdWVyeSA9IHsgJG9yOiBbeyB1c2VybmFtZSB9LCB7IGVtYWlsOiB1c2VybmFtZSB9XSB9O1xuICAgICAgfVxuICAgICAgcmV0dXJuIHJlcS5jb25maWcuZGF0YWJhc2VcbiAgICAgICAgLmZpbmQoJ19Vc2VyJywgcXVlcnksIHt9LCBBdXRoLm1haW50ZW5hbmNlKHJlcS5jb25maWcpKVxuICAgICAgICAudGhlbihyZXN1bHRzID0+IHtcbiAgICAgICAgICBpZiAoIXJlc3VsdHMubGVuZ3RoKSB7XG4gICAgICAgICAgICB0aHJvdyBuZXcgUGFyc2UuRXJyb3IoUGFyc2UuRXJyb3IuT0JKRUNUX05PVF9GT1VORCwgJ0ludmFsaWQgdXNlcm5hbWUvcGFzc3dvcmQuJyk7XG4gICAgICAgICAgfVxuXG4gICAgICAgICAgaWYgKHJlc3VsdHMubGVuZ3RoID4gMSkge1xuICAgICAgICAgICAgLy8gY29ybmVyIGNhc2Ugd2hlcmUgdXNlcjEgaGFzIHVzZXJuYW1lID09IHVzZXIyIGVtYWlsXG4gICAgICAgICAgICByZXEuY29uZmlnLmxvZ2dlckNvbnRyb2xsZXIud2FybihcbiAgICAgICAgICAgICAgXCJUaGVyZSBpcyBhIHVzZXIgd2hpY2ggZW1haWwgaXMgdGhlIHNhbWUgYXMgYW5vdGhlciB1c2VyJ3MgdXNlcm5hbWUsIGxvZ2dpbmcgaW4gYmFzZWQgb24gdXNlcm5hbWVcIlxuICAgICAgICAgICAgKTtcbiAgICAgICAgICAgIHVzZXIgPSByZXN1bHRzLmZpbHRlcih1c2VyID0+IHVzZXIudXNlcm5hbWUgPT09IHVzZXJuYW1lKVswXTtcbiAgICAgICAgICB9IGVsc2Uge1xuICAgICAgICAgICAgdXNlciA9IHJlc3VsdHNbMF07XG4gICAgICAgICAgfVxuXG4gICAgICAgICAgcmV0dXJuIHBhc3N3b3JkQ3J5cHRvLmNvbXBhcmUocGFzc3dvcmQsIHVzZXIucGFzc3dvcmQpO1xuICAgICAgICB9KVxuICAgICAgICAudGhlbihjb3JyZWN0ID0+IHtcbiAgICAgICAgICBpc1ZhbGlkUGFzc3dvcmQgPSBjb3JyZWN0O1xuICAgICAgICAgIGNvbnN0IGFjY291bnRMb2Nrb3V0UG9saWN5ID0gbmV3IEFjY291bnRMb2Nrb3V0KHVzZXIsIHJlcS5jb25maWcpO1xuICAgICAgICAgIHJldHVybiBhY2NvdW50TG9ja291dFBvbGljeS5oYW5kbGVMb2dpbkF0dGVtcHQoaXNWYWxpZFBhc3N3b3JkKTtcbiAgICAgICAgfSlcbiAgICAgICAgLnRoZW4oKCkgPT4ge1xuICAgICAgICAgIGlmICghaXNWYWxpZFBhc3N3b3JkKSB7XG4gICAgICAgICAgICB0aHJvdyBuZXcgUGFyc2UuRXJyb3IoUGFyc2UuRXJyb3IuT0JKRUNUX05PVF9GT1VORCwgJ0ludmFsaWQgdXNlcm5hbWUvcGFzc3dvcmQuJyk7XG4gICAgICAgICAgfVxuICAgICAgICAgIC8vIEVuc3VyZSB0aGUgdXNlciBpc24ndCBsb2NrZWQgb3V0XG4gICAgICAgICAgLy8gQSBsb2NrZWQgb3V0IHVzZXIgd29uJ3QgYmUgYWJsZSB0byBsb2dpblxuICAgICAgICAgIC8vIFRvIGxvY2sgYSB1c2VyIG91dCwganVzdCBzZXQgdGhlIEFDTCB0byBgbWFzdGVyS2V5YCBvbmx5ICAoe30pLlxuICAgICAgICAgIC8vIEVtcHR5IEFDTCBpcyBPS1xuICAgICAgICAgIGlmICghcmVxLmF1dGguaXNNYXN0ZXIgJiYgdXNlci5BQ0wgJiYgT2JqZWN0LmtleXModXNlci5BQ0wpLmxlbmd0aCA9PSAwKSB7XG4gICAgICAgICAgICB0aHJvdyBuZXcgUGFyc2UuRXJyb3IoUGFyc2UuRXJyb3IuT0JKRUNUX05PVF9GT1VORCwgJ0ludmFsaWQgdXNlcm5hbWUvcGFzc3dvcmQuJyk7XG4gICAgICAgICAgfVxuICAgICAgICAgIGlmIChcbiAgICAgICAgICAgIHJlcS5jb25maWcudmVyaWZ5VXNlckVtYWlscyAmJlxuICAgICAgICAgICAgcmVxLmNvbmZpZy5wcmV2ZW50TG9naW5XaXRoVW52ZXJpZmllZEVtYWlsICYmXG4gICAgICAgICAgICAhdXNlci5lbWFpbFZlcmlmaWVkXG4gICAgICAgICAgKSB7XG4gICAgICAgICAgICB0aHJvdyBuZXcgUGFyc2UuRXJyb3IoUGFyc2UuRXJyb3IuRU1BSUxfTk9UX0ZPVU5ELCAnVXNlciBlbWFpbCBpcyBub3QgdmVyaWZpZWQuJyk7XG4gICAgICAgICAgfVxuXG4gICAgICAgICAgdGhpcy5fc2FuaXRpemVBdXRoRGF0YSh1c2VyKTtcblxuICAgICAgICAgIHJldHVybiByZXNvbHZlKHVzZXIpO1xuICAgICAgICB9KVxuICAgICAgICAuY2F0Y2goZXJyb3IgPT4ge1xuICAgICAgICAgIHJldHVybiByZWplY3QoZXJyb3IpO1xuICAgICAgICB9KTtcbiAgICB9KTtcbiAgfVxuXG4gIGhhbmRsZU1lKHJlcSkge1xuICAgIGlmICghcmVxLmluZm8gfHwgIXJlcS5pbmZvLnNlc3Npb25Ub2tlbikge1xuICAgICAgdGhyb3cgbmV3IFBhcnNlLkVycm9yKFBhcnNlLkVycm9yLklOVkFMSURfU0VTU0lPTl9UT0tFTiwgJ0ludmFsaWQgc2Vzc2lvbiB0b2tlbicpO1xuICAgIH1cbiAgICBjb25zdCBzZXNzaW9uVG9rZW4gPSByZXEuaW5mby5zZXNzaW9uVG9rZW47XG4gICAgcmV0dXJuIHJlc3RcbiAgICAgIC5maW5kKFxuICAgICAgICByZXEuY29uZmlnLFxuICAgICAgICBBdXRoLm1hc3RlcihyZXEuY29uZmlnKSxcbiAgICAgICAgJ19TZXNzaW9uJyxcbiAgICAgICAgeyBzZXNzaW9uVG9rZW4gfSxcbiAgICAgICAgeyBpbmNsdWRlOiAndXNlcicgfSxcbiAgICAgICAgcmVxLmluZm8uY2xpZW50U0RLLFxuICAgICAgICByZXEuaW5mby5jb250ZXh0XG4gICAgICApXG4gICAgICAudGhlbihyZXNwb25zZSA9PiB7XG4gICAgICAgIGlmICghcmVzcG9uc2UucmVzdWx0cyB8fCByZXNwb25zZS5yZXN1bHRzLmxlbmd0aCA9PSAwIHx8ICFyZXNwb25zZS5yZXN1bHRzWzBdLnVzZXIpIHtcbiAgICAgICAgICB0aHJvdyBuZXcgUGFyc2UuRXJyb3IoUGFyc2UuRXJyb3IuSU5WQUxJRF9TRVNTSU9OX1RPS0VOLCAnSW52YWxpZCBzZXNzaW9uIHRva2VuJyk7XG4gICAgICAgIH0gZWxzZSB7XG4gICAgICAgICAgY29uc3QgdXNlciA9IHJlc3BvbnNlLnJlc3VsdHNbMF0udXNlcjtcbiAgICAgICAgICAvLyBTZW5kIHRva2VuIGJhY2sgb24gdGhlIGxvZ2luLCBiZWNhdXNlIFNES3MgZXhwZWN0IHRoYXQuXG4gICAgICAgICAgdXNlci5zZXNzaW9uVG9rZW4gPSBzZXNzaW9uVG9rZW47XG5cbiAgICAgICAgICAvLyBSZW1vdmUgaGlkZGVuIHByb3BlcnRpZXMuXG4gICAgICAgICAgVXNlcnNSb3V0ZXIucmVtb3ZlSGlkZGVuUHJvcGVydGllcyh1c2VyKTtcbiAgICAgICAgICByZXR1cm4geyByZXNwb25zZTogdXNlciB9O1xuICAgICAgICB9XG4gICAgICB9KTtcbiAgfVxuXG4gIGFzeW5jIGhhbmRsZUxvZ0luKHJlcSkge1xuICAgIGNvbnN0IHVzZXIgPSBhd2FpdCB0aGlzLl9hdXRoZW50aWNhdGVVc2VyRnJvbVJlcXVlc3QocmVxKTtcbiAgICBjb25zdCBhdXRoRGF0YSA9IHJlcS5ib2R5ICYmIHJlcS5ib2R5LmF1dGhEYXRhO1xuICAgIC8vIENoZWNrIGlmIHVzZXIgaGFzIHByb3ZpZGVkIHRoZWlyIHJlcXVpcmVkIGF1dGggcHJvdmlkZXJzXG4gICAgQXV0aC5jaGVja0lmVXNlckhhc1Byb3ZpZGVkQ29uZmlndXJlZFByb3ZpZGVyc0ZvckxvZ2luKFxuICAgICAgcmVxLFxuICAgICAgYXV0aERhdGEsXG4gICAgICB1c2VyLmF1dGhEYXRhLFxuICAgICAgcmVxLmNvbmZpZ1xuICAgICk7XG5cbiAgICBsZXQgYXV0aERhdGFSZXNwb25zZTtcbiAgICBsZXQgdmFsaWRhdGVkQXV0aERhdGE7XG4gICAgaWYgKGF1dGhEYXRhKSB7XG4gICAgICBjb25zdCByZXMgPSBhd2FpdCBBdXRoLmhhbmRsZUF1dGhEYXRhVmFsaWRhdGlvbihcbiAgICAgICAgYXV0aERhdGEsXG4gICAgICAgIG5ldyBSZXN0V3JpdGUoXG4gICAgICAgICAgcmVxLmNvbmZpZyxcbiAgICAgICAgICByZXEuYXV0aCxcbiAgICAgICAgICAnX1VzZXInLFxuICAgICAgICAgIHsgb2JqZWN0SWQ6IHVzZXIub2JqZWN0SWQgfSxcbiAgICAgICAgICByZXEuYm9keSxcbiAgICAgICAgICB1c2VyLFxuICAgICAgICAgIHJlcS5pbmZvLmNsaWVudFNESyxcbiAgICAgICAgICByZXEuaW5mby5jb250ZXh0XG4gICAgICAgICksXG4gICAgICAgIHVzZXJcbiAgICAgICk7XG4gICAgICBhdXRoRGF0YVJlc3BvbnNlID0gcmVzLmF1dGhEYXRhUmVzcG9uc2U7XG4gICAgICB2YWxpZGF0ZWRBdXRoRGF0YSA9IHJlcy5hdXRoRGF0YTtcbiAgICB9XG5cbiAgICAvLyBoYW5kbGUgcGFzc3dvcmQgZXhwaXJ5IHBvbGljeVxuICAgIGlmIChyZXEuY29uZmlnLnBhc3N3b3JkUG9saWN5ICYmIHJlcS5jb25maWcucGFzc3dvcmRQb2xpY3kubWF4UGFzc3dvcmRBZ2UpIHtcbiAgICAgIGxldCBjaGFuZ2VkQXQgPSB1c2VyLl9wYXNzd29yZF9jaGFuZ2VkX2F0O1xuXG4gICAgICBpZiAoIWNoYW5nZWRBdCkge1xuICAgICAgICAvLyBwYXNzd29yZCB3YXMgY3JlYXRlZCBiZWZvcmUgZXhwaXJ5IHBvbGljeSB3YXMgZW5hYmxlZC5cbiAgICAgICAgLy8gc2ltcGx5IHVwZGF0ZSBfVXNlciBvYmplY3Qgc28gdGhhdCBpdCB3aWxsIHN0YXJ0IGVuZm9yY2luZyBmcm9tIG5vd1xuICAgICAgICBjaGFuZ2VkQXQgPSBuZXcgRGF0ZSgpO1xuICAgICAgICByZXEuY29uZmlnLmRhdGFiYXNlLnVwZGF0ZShcbiAgICAgICAgICAnX1VzZXInLFxuICAgICAgICAgIHsgdXNlcm5hbWU6IHVzZXIudXNlcm5hbWUgfSxcbiAgICAgICAgICB7IF9wYXNzd29yZF9jaGFuZ2VkX2F0OiBQYXJzZS5fZW5jb2RlKGNoYW5nZWRBdCkgfVxuICAgICAgICApO1xuICAgICAgfSBlbHNlIHtcbiAgICAgICAgLy8gY2hlY2sgd2hldGhlciB0aGUgcGFzc3dvcmQgaGFzIGV4cGlyZWRcbiAgICAgICAgaWYgKGNoYW5nZWRBdC5fX3R5cGUgPT0gJ0RhdGUnKSB7XG4gICAgICAgICAgY2hhbmdlZEF0ID0gbmV3IERhdGUoY2hhbmdlZEF0Lmlzbyk7XG4gICAgICAgIH1cbiAgICAgICAgLy8gQ2FsY3VsYXRlIHRoZSBleHBpcnkgdGltZS5cbiAgICAgICAgY29uc3QgZXhwaXJlc0F0ID0gbmV3IERhdGUoXG4gICAgICAgICAgY2hhbmdlZEF0LmdldFRpbWUoKSArIDg2NDAwMDAwICogcmVxLmNvbmZpZy5wYXNzd29yZFBvbGljeS5tYXhQYXNzd29yZEFnZVxuICAgICAgICApO1xuICAgICAgICBpZiAoZXhwaXJlc0F0IDwgbmV3IERhdGUoKSlcbiAgICAgICAgICAvLyBmYWlsIG9mIGN1cnJlbnQgdGltZSBpcyBwYXN0IHBhc3N3b3JkIGV4cGlyeSB0aW1lXG4gICAgICAgICAgdGhyb3cgbmV3IFBhcnNlLkVycm9yKFxuICAgICAgICAgICAgUGFyc2UuRXJyb3IuT0JKRUNUX05PVF9GT1VORCxcbiAgICAgICAgICAgICdZb3VyIHBhc3N3b3JkIGhhcyBleHBpcmVkLiBQbGVhc2UgcmVzZXQgeW91ciBwYXNzd29yZC4nXG4gICAgICAgICAgKTtcbiAgICAgIH1cbiAgICB9XG5cbiAgICAvLyBSZW1vdmUgaGlkZGVuIHByb3BlcnRpZXMuXG4gICAgVXNlcnNSb3V0ZXIucmVtb3ZlSGlkZGVuUHJvcGVydGllcyh1c2VyKTtcblxuICAgIHJlcS5jb25maWcuZmlsZXNDb250cm9sbGVyLmV4cGFuZEZpbGVzSW5PYmplY3QocmVxLmNvbmZpZywgdXNlcik7XG5cbiAgICAvLyBCZWZvcmUgbG9naW4gdHJpZ2dlcjsgdGhyb3dzIGlmIGZhaWx1cmVcbiAgICBhd2FpdCBtYXliZVJ1blRyaWdnZXIoXG4gICAgICBUcmlnZ2VyVHlwZXMuYmVmb3JlTG9naW4sXG4gICAgICByZXEuYXV0aCxcbiAgICAgIFBhcnNlLlVzZXIuZnJvbUpTT04oT2JqZWN0LmFzc2lnbih7IGNsYXNzTmFtZTogJ19Vc2VyJyB9LCB1c2VyKSksXG4gICAgICBudWxsLFxuICAgICAgcmVxLmNvbmZpZ1xuICAgICk7XG5cbiAgICAvLyBJZiB3ZSBoYXZlIHNvbWUgbmV3IHZhbGlkYXRlZCBhdXRoRGF0YSB1cGRhdGUgZGlyZWN0bHlcbiAgICBpZiAodmFsaWRhdGVkQXV0aERhdGEgJiYgT2JqZWN0LmtleXModmFsaWRhdGVkQXV0aERhdGEpLmxlbmd0aCkge1xuICAgICAgYXdhaXQgcmVxLmNvbmZpZy5kYXRhYmFzZS51cGRhdGUoXG4gICAgICAgICdfVXNlcicsXG4gICAgICAgIHsgb2JqZWN0SWQ6IHVzZXIub2JqZWN0SWQgfSxcbiAgICAgICAgeyBhdXRoRGF0YTogdmFsaWRhdGVkQXV0aERhdGEgfSxcbiAgICAgICAge31cbiAgICAgICk7XG4gICAgfVxuXG4gICAgY29uc3QgeyBzZXNzaW9uRGF0YSwgY3JlYXRlU2Vzc2lvbiB9ID0gUmVzdFdyaXRlLmNyZWF0ZVNlc3Npb24ocmVxLmNvbmZpZywge1xuICAgICAgdXNlcklkOiB1c2VyLm9iamVjdElkLFxuICAgICAgY3JlYXRlZFdpdGg6IHtcbiAgICAgICAgYWN0aW9uOiAnbG9naW4nLFxuICAgICAgICBhdXRoUHJvdmlkZXI6ICdwYXNzd29yZCcsXG4gICAgICB9LFxuICAgICAgaW5zdGFsbGF0aW9uSWQ6IHJlcS5pbmZvLmluc3RhbGxhdGlvbklkLFxuICAgIH0pO1xuXG4gICAgdXNlci5zZXNzaW9uVG9rZW4gPSBzZXNzaW9uRGF0YS5zZXNzaW9uVG9rZW47XG5cbiAgICBhd2FpdCBjcmVhdGVTZXNzaW9uKCk7XG5cbiAgICBjb25zdCBhZnRlckxvZ2luVXNlciA9IFBhcnNlLlVzZXIuZnJvbUpTT04oT2JqZWN0LmFzc2lnbih7IGNsYXNzTmFtZTogJ19Vc2VyJyB9LCB1c2VyKSk7XG4gICAgYXdhaXQgbWF5YmVSdW5UcmlnZ2VyKFxuICAgICAgVHJpZ2dlclR5cGVzLmFmdGVyTG9naW4sXG4gICAgICB7IC4uLnJlcS5hdXRoLCB1c2VyOiBhZnRlckxvZ2luVXNlciB9LFxuICAgICAgYWZ0ZXJMb2dpblVzZXIsXG4gICAgICBudWxsLFxuICAgICAgcmVxLmNvbmZpZ1xuICAgICk7XG5cbiAgICBpZiAoYXV0aERhdGFSZXNwb25zZSkge1xuICAgICAgdXNlci5hdXRoRGF0YVJlc3BvbnNlID0gYXV0aERhdGFSZXNwb25zZTtcbiAgICB9XG4gICAgYXdhaXQgcmVxLmNvbmZpZy5hdXRoRGF0YU1hbmFnZXIucnVuQWZ0ZXJGaW5kKHJlcSwgdXNlci5hdXRoRGF0YSk7XG5cbiAgICByZXR1cm4geyByZXNwb25zZTogdXNlciB9O1xuICB9XG5cbiAgLyoqXG4gICAqIFRoaXMgYWxsb3dzIG1hc3Rlci1rZXkgY2xpZW50cyB0byBjcmVhdGUgdXNlciBzZXNzaW9ucyB3aXRob3V0IGFjY2VzcyB0b1xuICAgKiB1c2VyIGNyZWRlbnRpYWxzLiBUaGlzIGVuYWJsZXMgc3lzdGVtcyB0aGF0IGNhbiBhdXRoZW50aWNhdGUgYWNjZXNzIGFub3RoZXJcbiAgICogd2F5IChBUEkga2V5LCBhcHAgYWRtaW5pc3RyYXRvcnMpIHRvIGFjdCBvbiBhIHVzZXIncyBiZWhhbGYuXG4gICAqXG4gICAqIFdlIGNyZWF0ZSBhIG5ldyBzZXNzaW9uIHJhdGhlciB0aGFuIGxvb2tpbmcgZm9yIGFuIGV4aXN0aW5nIHNlc3Npb247IHdlXG4gICAqIHdhbnQgdGhpcyB0byB3b3JrIGluIHNpdHVhdGlvbnMgd2hlcmUgdGhlIHVzZXIgaXMgbG9nZ2VkIG91dCBvbiBhbGxcbiAgICogZGV2aWNlcywgc2luY2UgdGhpcyBjYW4gYmUgdXNlZCBieSBhdXRvbWF0ZWQgc3lzdGVtcyBhY3Rpbmcgb24gdGhlIHVzZXInc1xuICAgKiBiZWhhbGYuXG4gICAqXG4gICAqIEZvciB0aGUgbW9tZW50LCB3ZSdyZSBvbWl0dGluZyBldmVudCBob29rcyBhbmQgbG9ja291dCBjaGVja3MsIHNpbmNlXG4gICAqIGltbWVkaWF0ZSB1c2UgY2FzZXMgc3VnZ2VzdCAvbG9naW5BcyBjb3VsZCBiZSB1c2VkIGZvciBzZW1hbnRpY2FsbHlcbiAgICogZGlmZmVyZW50IHJlYXNvbnMgZnJvbSAvbG9naW5cbiAgICovXG4gIGFzeW5jIGhhbmRsZUxvZ0luQXMocmVxKSB7XG4gICAgaWYgKCFyZXEuYXV0aC5pc01hc3Rlcikge1xuICAgICAgdGhyb3cgbmV3IFBhcnNlLkVycm9yKFBhcnNlLkVycm9yLk9QRVJBVElPTl9GT1JCSURERU4sICdtYXN0ZXIga2V5IGlzIHJlcXVpcmVkJyk7XG4gICAgfVxuXG4gICAgY29uc3QgdXNlcklkID0gcmVxLmJvZHkudXNlcklkIHx8IHJlcS5xdWVyeS51c2VySWQ7XG4gICAgaWYgKCF1c2VySWQpIHtcbiAgICAgIHRocm93IG5ldyBQYXJzZS5FcnJvcihcbiAgICAgICAgUGFyc2UuRXJyb3IuSU5WQUxJRF9WQUxVRSxcbiAgICAgICAgJ3VzZXJJZCBtdXN0IG5vdCBiZSBlbXB0eSwgbnVsbCwgb3IgdW5kZWZpbmVkJ1xuICAgICAgKTtcbiAgICB9XG5cbiAgICBjb25zdCBxdWVyeVJlc3VsdHMgPSBhd2FpdCByZXEuY29uZmlnLmRhdGFiYXNlLmZpbmQoJ19Vc2VyJywgeyBvYmplY3RJZDogdXNlcklkIH0pO1xuICAgIGNvbnN0IHVzZXIgPSBxdWVyeVJlc3VsdHNbMF07XG4gICAgaWYgKCF1c2VyKSB7XG4gICAgICB0aHJvdyBuZXcgUGFyc2UuRXJyb3IoUGFyc2UuRXJyb3IuT0JKRUNUX05PVF9GT1VORCwgJ3VzZXIgbm90IGZvdW5kJyk7XG4gICAgfVxuXG4gICAgdGhpcy5fc2FuaXRpemVBdXRoRGF0YSh1c2VyKTtcblxuICAgIGNvbnN0IHsgc2Vzc2lvbkRhdGEsIGNyZWF0ZVNlc3Npb24gfSA9IFJlc3RXcml0ZS5jcmVhdGVTZXNzaW9uKHJlcS5jb25maWcsIHtcbiAgICAgIHVzZXJJZCxcbiAgICAgIGNyZWF0ZWRXaXRoOiB7XG4gICAgICAgIGFjdGlvbjogJ2xvZ2luJyxcbiAgICAgICAgYXV0aFByb3ZpZGVyOiAnbWFzdGVya2V5JyxcbiAgICAgIH0sXG4gICAgICBpbnN0YWxsYXRpb25JZDogcmVxLmluZm8uaW5zdGFsbGF0aW9uSWQsXG4gICAgfSk7XG5cbiAgICB1c2VyLnNlc3Npb25Ub2tlbiA9IHNlc3Npb25EYXRhLnNlc3Npb25Ub2tlbjtcblxuICAgIGF3YWl0IGNyZWF0ZVNlc3Npb24oKTtcblxuICAgIHJldHVybiB7IHJlc3BvbnNlOiB1c2VyIH07XG4gIH1cblxuICBoYW5kbGVWZXJpZnlQYXNzd29yZChyZXEpIHtcbiAgICByZXR1cm4gdGhpcy5fYXV0aGVudGljYXRlVXNlckZyb21SZXF1ZXN0KHJlcSlcbiAgICAgIC50aGVuKHVzZXIgPT4ge1xuICAgICAgICAvLyBSZW1vdmUgaGlkZGVuIHByb3BlcnRpZXMuXG4gICAgICAgIFVzZXJzUm91dGVyLnJlbW92ZUhpZGRlblByb3BlcnRpZXModXNlcik7XG5cbiAgICAgICAgcmV0dXJuIHsgcmVzcG9uc2U6IHVzZXIgfTtcbiAgICAgIH0pXG4gICAgICAuY2F0Y2goZXJyb3IgPT4ge1xuICAgICAgICB0aHJvdyBlcnJvcjtcbiAgICAgIH0pO1xuICB9XG5cbiAgYXN5bmMgaGFuZGxlTG9nT3V0KHJlcSkge1xuICAgIGNvbnN0IHN1Y2Nlc3MgPSB7IHJlc3BvbnNlOiB7fSB9O1xuICAgIGlmIChyZXEuaW5mbyAmJiByZXEuaW5mby5zZXNzaW9uVG9rZW4pIHtcbiAgICAgIGNvbnN0IHJlY29yZHMgPSBhd2FpdCByZXN0LmZpbmQoXG4gICAgICAgIHJlcS5jb25maWcsXG4gICAgICAgIEF1dGgubWFzdGVyKHJlcS5jb25maWcpLFxuICAgICAgICAnX1Nlc3Npb24nLFxuICAgICAgICB7IHNlc3Npb25Ub2tlbjogcmVxLmluZm8uc2Vzc2lvblRva2VuIH0sXG4gICAgICAgIHVuZGVmaW5lZCxcbiAgICAgICAgcmVxLmluZm8uY2xpZW50U0RLLFxuICAgICAgICByZXEuaW5mby5jb250ZXh0XG4gICAgICApO1xuICAgICAgaWYgKHJlY29yZHMucmVzdWx0cyAmJiByZWNvcmRzLnJlc3VsdHMubGVuZ3RoKSB7XG4gICAgICAgIGF3YWl0IHJlc3QuZGVsKFxuICAgICAgICAgIHJlcS5jb25maWcsXG4gICAgICAgICAgQXV0aC5tYXN0ZXIocmVxLmNvbmZpZyksXG4gICAgICAgICAgJ19TZXNzaW9uJyxcbiAgICAgICAgICByZWNvcmRzLnJlc3VsdHNbMF0ub2JqZWN0SWQsXG4gICAgICAgICAgcmVxLmluZm8uY29udGV4dFxuICAgICAgICApO1xuICAgICAgICBhd2FpdCBtYXliZVJ1blRyaWdnZXIoXG4gICAgICAgICAgVHJpZ2dlclR5cGVzLmFmdGVyTG9nb3V0LFxuICAgICAgICAgIHJlcS5hdXRoLFxuICAgICAgICAgIFBhcnNlLlNlc3Npb24uZnJvbUpTT04oT2JqZWN0LmFzc2lnbih7IGNsYXNzTmFtZTogJ19TZXNzaW9uJyB9LCByZWNvcmRzLnJlc3VsdHNbMF0pKSxcbiAgICAgICAgICBudWxsLFxuICAgICAgICAgIHJlcS5jb25maWdcbiAgICAgICAgKTtcbiAgICAgIH1cbiAgICB9XG4gICAgcmV0dXJuIHN1Y2Nlc3M7XG4gIH1cblxuICBfdGhyb3dPbkJhZEVtYWlsQ29uZmlnKHJlcSkge1xuICAgIHRyeSB7XG4gICAgICBDb25maWcudmFsaWRhdGVFbWFpbENvbmZpZ3VyYXRpb24oe1xuICAgICAgICBlbWFpbEFkYXB0ZXI6IHJlcS5jb25maWcudXNlckNvbnRyb2xsZXIuYWRhcHRlcixcbiAgICAgICAgYXBwTmFtZTogcmVxLmNvbmZpZy5hcHBOYW1lLFxuICAgICAgICBwdWJsaWNTZXJ2ZXJVUkw6IHJlcS5jb25maWcucHVibGljU2VydmVyVVJMLFxuICAgICAgICBlbWFpbFZlcmlmeVRva2VuVmFsaWRpdHlEdXJhdGlvbjogcmVxLmNvbmZpZy5lbWFpbFZlcmlmeVRva2VuVmFsaWRpdHlEdXJhdGlvbixcbiAgICAgICAgZW1haWxWZXJpZnlUb2tlblJldXNlSWZWYWxpZDogcmVxLmNvbmZpZy5lbWFpbFZlcmlmeVRva2VuUmV1c2VJZlZhbGlkLFxuICAgICAgfSk7XG4gICAgfSBjYXRjaCAoZSkge1xuICAgICAgaWYgKHR5cGVvZiBlID09PSAnc3RyaW5nJykge1xuICAgICAgICAvLyBNYXliZSB3ZSBuZWVkIGEgQmFkIENvbmZpZ3VyYXRpb24gZXJyb3IsIGJ1dCB0aGUgU0RLcyB3b24ndCB1bmRlcnN0YW5kIGl0LiBGb3Igbm93LCBJbnRlcm5hbCBTZXJ2ZXIgRXJyb3IuXG4gICAgICAgIHRocm93IG5ldyBQYXJzZS5FcnJvcihcbiAgICAgICAgICBQYXJzZS5FcnJvci5JTlRFUk5BTF9TRVJWRVJfRVJST1IsXG4gICAgICAgICAgJ0FuIGFwcE5hbWUsIHB1YmxpY1NlcnZlclVSTCwgYW5kIGVtYWlsQWRhcHRlciBhcmUgcmVxdWlyZWQgZm9yIHBhc3N3b3JkIHJlc2V0IGFuZCBlbWFpbCB2ZXJpZmljYXRpb24gZnVuY3Rpb25hbGl0eS4nXG4gICAgICAgICk7XG4gICAgICB9IGVsc2Uge1xuICAgICAgICB0aHJvdyBlO1xuICAgICAgfVxuICAgIH1cbiAgfVxuXG4gIGFzeW5jIGhhbmRsZVJlc2V0UmVxdWVzdChyZXEpIHtcbiAgICB0aGlzLl90aHJvd09uQmFkRW1haWxDb25maWcocmVxKTtcblxuICAgIGNvbnN0IHsgZW1haWwgfSA9IHJlcS5ib2R5O1xuICAgIGlmICghZW1haWwpIHtcbiAgICAgIHRocm93IG5ldyBQYXJzZS5FcnJvcihQYXJzZS5FcnJvci5FTUFJTF9NSVNTSU5HLCAneW91IG11c3QgcHJvdmlkZSBhbiBlbWFpbCcpO1xuICAgIH1cbiAgICBpZiAodHlwZW9mIGVtYWlsICE9PSAnc3RyaW5nJykge1xuICAgICAgdGhyb3cgbmV3IFBhcnNlLkVycm9yKFxuICAgICAgICBQYXJzZS5FcnJvci5JTlZBTElEX0VNQUlMX0FERFJFU1MsXG4gICAgICAgICd5b3UgbXVzdCBwcm92aWRlIGEgdmFsaWQgZW1haWwgc3RyaW5nJ1xuICAgICAgKTtcbiAgICB9XG4gICAgY29uc3QgdXNlckNvbnRyb2xsZXIgPSByZXEuY29uZmlnLnVzZXJDb250cm9sbGVyO1xuICAgIHRyeSB7XG4gICAgICBhd2FpdCB1c2VyQ29udHJvbGxlci5zZW5kUGFzc3dvcmRSZXNldEVtYWlsKGVtYWlsKTtcbiAgICAgIHJldHVybiB7XG4gICAgICAgIHJlc3BvbnNlOiB7fSxcbiAgICAgIH07XG4gICAgfSBjYXRjaCAoZXJyKSB7XG4gICAgICBpZiAoZXJyLmNvZGUgPT09IFBhcnNlLkVycm9yLk9CSkVDVF9OT1RfRk9VTkQpIHtcbiAgICAgICAgaWYgKHJlcS5jb25maWcucGFzc3dvcmRQb2xpY3k/LnJlc2V0UGFzc3dvcmRTdWNjZXNzT25JbnZhbGlkRW1haWwgPz8gdHJ1ZSkge1xuICAgICAgICAgIHJldHVybiB7XG4gICAgICAgICAgICByZXNwb25zZToge30sXG4gICAgICAgICAgfTtcbiAgICAgICAgfVxuICAgICAgICBlcnIubWVzc2FnZSA9IGBBIHVzZXIgd2l0aCB0aGF0IGVtYWlsIGRvZXMgbm90IGV4aXN0LmA7XG4gICAgICB9XG4gICAgICB0aHJvdyBlcnI7XG4gICAgfVxuICB9XG5cbiAgYXN5bmMgaGFuZGxlVmVyaWZpY2F0aW9uRW1haWxSZXF1ZXN0KHJlcSkge1xuICAgIHRoaXMuX3Rocm93T25CYWRFbWFpbENvbmZpZyhyZXEpO1xuXG4gICAgY29uc3QgeyBlbWFpbCB9ID0gcmVxLmJvZHk7XG4gICAgaWYgKCFlbWFpbCkge1xuICAgICAgdGhyb3cgbmV3IFBhcnNlLkVycm9yKFBhcnNlLkVycm9yLkVNQUlMX01JU1NJTkcsICd5b3UgbXVzdCBwcm92aWRlIGFuIGVtYWlsJyk7XG4gICAgfVxuICAgIGlmICh0eXBlb2YgZW1haWwgIT09ICdzdHJpbmcnKSB7XG4gICAgICB0aHJvdyBuZXcgUGFyc2UuRXJyb3IoXG4gICAgICAgIFBhcnNlLkVycm9yLklOVkFMSURfRU1BSUxfQUREUkVTUyxcbiAgICAgICAgJ3lvdSBtdXN0IHByb3ZpZGUgYSB2YWxpZCBlbWFpbCBzdHJpbmcnXG4gICAgICApO1xuICAgIH1cblxuICAgIGNvbnN0IHJlc3VsdHMgPSBhd2FpdCByZXEuY29uZmlnLmRhdGFiYXNlLmZpbmQoJ19Vc2VyJywgeyBlbWFpbDogZW1haWwgfSk7XG4gICAgaWYgKCFyZXN1bHRzLmxlbmd0aCB8fCByZXN1bHRzLmxlbmd0aCA8IDEpIHtcbiAgICAgIHRocm93IG5ldyBQYXJzZS5FcnJvcihQYXJzZS5FcnJvci5FTUFJTF9OT1RfRk9VTkQsIGBObyB1c2VyIGZvdW5kIHdpdGggZW1haWwgJHtlbWFpbH1gKTtcbiAgICB9XG4gICAgY29uc3QgdXNlciA9IHJlc3VsdHNbMF07XG5cbiAgICAvLyByZW1vdmUgcGFzc3dvcmQgZmllbGQsIG1lc3NlcyB3aXRoIHNhdmluZyBvbiBwb3N0Z3Jlc1xuICAgIGRlbGV0ZSB1c2VyLnBhc3N3b3JkO1xuXG4gICAgaWYgKHVzZXIuZW1haWxWZXJpZmllZCkge1xuICAgICAgdGhyb3cgbmV3IFBhcnNlLkVycm9yKFBhcnNlLkVycm9yLk9USEVSX0NBVVNFLCBgRW1haWwgJHtlbWFpbH0gaXMgYWxyZWFkeSB2ZXJpZmllZC5gKTtcbiAgICB9XG5cbiAgICBjb25zdCB1c2VyQ29udHJvbGxlciA9IHJlcS5jb25maWcudXNlckNvbnRyb2xsZXI7XG4gICAgY29uc3Qgc2VuZCA9IGF3YWl0IHVzZXJDb250cm9sbGVyLnJlZ2VuZXJhdGVFbWFpbFZlcmlmeVRva2VuKHVzZXIsIHJlcS5hdXRoLmlzTWFzdGVyKTtcbiAgICBpZiAoc2VuZCkge1xuICAgICAgdXNlckNvbnRyb2xsZXIuc2VuZFZlcmlmaWNhdGlvbkVtYWlsKHVzZXIsIHJlcSk7XG4gICAgfVxuICAgIHJldHVybiB7IHJlc3BvbnNlOiB7fSB9O1xuICB9XG5cbiAgYXN5bmMgaGFuZGxlQ2hhbGxlbmdlKHJlcSkge1xuICAgIGNvbnN0IHsgdXNlcm5hbWUsIGVtYWlsLCBwYXNzd29yZCwgYXV0aERhdGEsIGNoYWxsZW5nZURhdGEgfSA9IHJlcS5ib2R5O1xuXG4gICAgLy8gaWYgdXNlcm5hbWUgb3IgZW1haWwgcHJvdmlkZWQgd2l0aCBwYXNzd29yZCB0cnkgdG8gYXV0aGVudGljYXRlIHRoZSB1c2VyIGJ5IHVzZXJuYW1lXG4gICAgbGV0IHVzZXI7XG4gICAgaWYgKHVzZXJuYW1lIHx8IGVtYWlsKSB7XG4gICAgICBpZiAoIXBhc3N3b3JkKSB7XG4gICAgICAgIHRocm93IG5ldyBQYXJzZS5FcnJvcihcbiAgICAgICAgICBQYXJzZS5FcnJvci5PVEhFUl9DQVVTRSxcbiAgICAgICAgICAnWW91IHByb3ZpZGVkIHVzZXJuYW1lIG9yIGVtYWlsLCB5b3UgbmVlZCB0byBhbHNvIHByb3ZpZGUgcGFzc3dvcmQuJ1xuICAgICAgICApO1xuICAgICAgfVxuICAgICAgdXNlciA9IGF3YWl0IHRoaXMuX2F1dGhlbnRpY2F0ZVVzZXJGcm9tUmVxdWVzdChyZXEpO1xuICAgIH1cblxuICAgIGlmICghY2hhbGxlbmdlRGF0YSkge1xuICAgICAgdGhyb3cgbmV3IFBhcnNlLkVycm9yKFBhcnNlLkVycm9yLk9USEVSX0NBVVNFLCAnTm90aGluZyB0byBjaGFsbGVuZ2UuJyk7XG4gICAgfVxuXG4gICAgaWYgKHR5cGVvZiBjaGFsbGVuZ2VEYXRhICE9PSAnb2JqZWN0Jykge1xuICAgICAgdGhyb3cgbmV3IFBhcnNlLkVycm9yKFBhcnNlLkVycm9yLk9USEVSX0NBVVNFLCAnY2hhbGxlbmdlRGF0YSBzaG91bGQgYmUgYW4gb2JqZWN0LicpO1xuICAgIH1cblxuICAgIGxldCByZXF1ZXN0O1xuICAgIGxldCBwYXJzZVVzZXI7XG5cbiAgICAvLyBUcnkgdG8gZmluZCB1c2VyIGJ5IGF1dGhEYXRhXG4gICAgaWYgKGF1dGhEYXRhKSB7XG4gICAgICBpZiAodHlwZW9mIGF1dGhEYXRhICE9PSAnb2JqZWN0Jykge1xuICAgICAgICB0aHJvdyBuZXcgUGFyc2UuRXJyb3IoUGFyc2UuRXJyb3IuT1RIRVJfQ0FVU0UsICdhdXRoRGF0YSBzaG91bGQgYmUgYW4gb2JqZWN0LicpO1xuICAgICAgfVxuICAgICAgaWYgKHVzZXIpIHtcbiAgICAgICAgdGhyb3cgbmV3IFBhcnNlLkVycm9yKFxuICAgICAgICAgIFBhcnNlLkVycm9yLk9USEVSX0NBVVNFLFxuICAgICAgICAgICdZb3UgY2Fubm90IHByb3ZpZGUgdXNlcm5hbWUvZW1haWwgYW5kIGF1dGhEYXRhLCBvbmx5IHVzZSBvbmUgaWRlbnRpZmljYXRpb24gbWV0aG9kLidcbiAgICAgICAgKTtcbiAgICAgIH1cblxuICAgICAgaWYgKE9iamVjdC5rZXlzKGF1dGhEYXRhKS5maWx0ZXIoa2V5ID0+IGF1dGhEYXRhW2tleV0uaWQpLmxlbmd0aCA+IDEpIHtcbiAgICAgICAgdGhyb3cgbmV3IFBhcnNlLkVycm9yKFxuICAgICAgICAgIFBhcnNlLkVycm9yLk9USEVSX0NBVVNFLFxuICAgICAgICAgICdZb3UgY2Fubm90IHByb3ZpZGUgbW9yZSB0aGFuIG9uZSBhdXRoRGF0YSBwcm92aWRlciB3aXRoIGFuIGlkLidcbiAgICAgICAgKTtcbiAgICAgIH1cblxuICAgICAgY29uc3QgcmVzdWx0cyA9IGF3YWl0IEF1dGguZmluZFVzZXJzV2l0aEF1dGhEYXRhKHJlcS5jb25maWcsIGF1dGhEYXRhKTtcblxuICAgICAgdHJ5IHtcbiAgICAgICAgaWYgKCFyZXN1bHRzWzBdIHx8IHJlc3VsdHMubGVuZ3RoID4gMSkge1xuICAgICAgICAgIHRocm93IG5ldyBQYXJzZS5FcnJvcihQYXJzZS5FcnJvci5PQkpFQ1RfTk9UX0ZPVU5ELCAnVXNlciBub3QgZm91bmQuJyk7XG4gICAgICAgIH1cbiAgICAgICAgLy8gRmluZCB0aGUgcHJvdmlkZXIgdXNlZCB0byBmaW5kIHRoZSB1c2VyXG4gICAgICAgIGNvbnN0IHByb3ZpZGVyID0gT2JqZWN0LmtleXMoYXV0aERhdGEpLmZpbmQoa2V5ID0+IGF1dGhEYXRhW2tleV0uaWQpO1xuXG4gICAgICAgIHBhcnNlVXNlciA9IFBhcnNlLlVzZXIuZnJvbUpTT04oeyBjbGFzc05hbWU6ICdfVXNlcicsIC4uLnJlc3VsdHNbMF0gfSk7XG4gICAgICAgIHJlcXVlc3QgPSBnZXRSZXF1ZXN0T2JqZWN0KHVuZGVmaW5lZCwgcmVxLmF1dGgsIHBhcnNlVXNlciwgcGFyc2VVc2VyLCByZXEuY29uZmlnKTtcbiAgICAgICAgcmVxdWVzdC5pc0NoYWxsZW5nZSA9IHRydWU7XG4gICAgICAgIC8vIFZhbGlkYXRlIGF1dGhEYXRhIHVzZWQgdG8gaWRlbnRpZnkgdGhlIHVzZXIgdG8gYXZvaWQgYnJ1dGUtZm9yY2UgYXR0YWNrIG9uIGBpZGBcbiAgICAgICAgY29uc3QgeyB2YWxpZGF0b3IgfSA9IHJlcS5jb25maWcuYXV0aERhdGFNYW5hZ2VyLmdldFZhbGlkYXRvckZvclByb3ZpZGVyKHByb3ZpZGVyKTtcbiAgICAgICAgY29uc3QgdmFsaWRhdG9yUmVzcG9uc2UgPSBhd2FpdCB2YWxpZGF0b3IoYXV0aERhdGFbcHJvdmlkZXJdLCByZXEsIHBhcnNlVXNlciwgcmVxdWVzdCk7XG4gICAgICAgIGlmICh2YWxpZGF0b3JSZXNwb25zZSAmJiB2YWxpZGF0b3JSZXNwb25zZS52YWxpZGF0b3IpIHtcbiAgICAgICAgICBhd2FpdCB2YWxpZGF0b3JSZXNwb25zZS52YWxpZGF0b3IoKTtcbiAgICAgICAgfVxuICAgICAgfSBjYXRjaCAoZSkge1xuICAgICAgICAvLyBSZXdyaXRlIHRoZSBlcnJvciB0byBhdm9pZCBndWVzcyBpZCBhdHRhY2tcbiAgICAgICAgbG9nZ2VyLmVycm9yKGUpO1xuICAgICAgICB0aHJvdyBuZXcgUGFyc2UuRXJyb3IoUGFyc2UuRXJyb3IuT0JKRUNUX05PVF9GT1VORCwgJ1VzZXIgbm90IGZvdW5kLicpO1xuICAgICAgfVxuICAgIH1cblxuICAgIGlmICghcGFyc2VVc2VyKSB7XG4gICAgICBwYXJzZVVzZXIgPSB1c2VyID8gUGFyc2UuVXNlci5mcm9tSlNPTih7IGNsYXNzTmFtZTogJ19Vc2VyJywgLi4udXNlciB9KSA6IHVuZGVmaW5lZDtcbiAgICB9XG5cbiAgICBpZiAoIXJlcXVlc3QpIHtcbiAgICAgIHJlcXVlc3QgPSBnZXRSZXF1ZXN0T2JqZWN0KHVuZGVmaW5lZCwgcmVxLmF1dGgsIHBhcnNlVXNlciwgcGFyc2VVc2VyLCByZXEuY29uZmlnKTtcbiAgICAgIHJlcXVlc3QuaXNDaGFsbGVuZ2UgPSB0cnVlO1xuICAgIH1cbiAgICBjb25zdCBhY2MgPSB7fTtcbiAgICAvLyBFeGVjdXRlIGNoYWxsZW5nZSBzdGVwLWJ5LXN0ZXAgd2l0aCBjb25zaXN0ZW50IG9yZGVyIGZvciBiZXR0ZXIgZXJyb3IgZmVlZGJhY2tcbiAgICAvLyBhbmQgdG8gYXZvaWQgdG8gdHJpZ2dlciBvdGhlcnMgY2hhbGxlbmdlcyBpZiBvbmUgb2YgdGhlbSBmYWlsc1xuICAgIGZvciAoY29uc3QgcHJvdmlkZXIgb2YgT2JqZWN0LmtleXMoY2hhbGxlbmdlRGF0YSkuc29ydCgpKSB7XG4gICAgICB0cnkge1xuICAgICAgICBjb25zdCBhdXRoQWRhcHRlciA9IHJlcS5jb25maWcuYXV0aERhdGFNYW5hZ2VyLmdldFZhbGlkYXRvckZvclByb3ZpZGVyKHByb3ZpZGVyKTtcbiAgICAgICAgaWYgKCFhdXRoQWRhcHRlcikge1xuICAgICAgICAgIGNvbnRpbnVlO1xuICAgICAgICB9XG4gICAgICAgIGNvbnN0IHtcbiAgICAgICAgICBhZGFwdGVyOiB7IGNoYWxsZW5nZSB9LFxuICAgICAgICB9ID0gYXV0aEFkYXB0ZXI7XG4gICAgICAgIGlmICh0eXBlb2YgY2hhbGxlbmdlID09PSAnZnVuY3Rpb24nKSB7XG4gICAgICAgICAgY29uc3QgcHJvdmlkZXJDaGFsbGVuZ2VSZXNwb25zZSA9IGF3YWl0IGNoYWxsZW5nZShcbiAgICAgICAgICAgIGNoYWxsZW5nZURhdGFbcHJvdmlkZXJdLFxuICAgICAgICAgICAgYXV0aERhdGEgJiYgYXV0aERhdGFbcHJvdmlkZXJdLFxuICAgICAgICAgICAgcmVxLmNvbmZpZy5hdXRoW3Byb3ZpZGVyXSxcbiAgICAgICAgICAgIHJlcXVlc3RcbiAgICAgICAgICApO1xuICAgICAgICAgIGFjY1twcm92aWRlcl0gPSBwcm92aWRlckNoYWxsZW5nZVJlc3BvbnNlIHx8IHRydWU7XG4gICAgICAgIH1cbiAgICAgIH0gY2F0Y2ggKGVycikge1xuICAgICAgICBjb25zdCBlID0gcmVzb2x2ZUVycm9yKGVyciwge1xuICAgICAgICAgIGNvZGU6IFBhcnNlLkVycm9yLlNDUklQVF9GQUlMRUQsXG4gICAgICAgICAgbWVzc2FnZTogJ0NoYWxsZW5nZSBmYWlsZWQuIFVua25vd24gZXJyb3IuJyxcbiAgICAgICAgfSk7XG4gICAgICAgIGNvbnN0IHVzZXJTdHJpbmcgPSByZXEuYXV0aCAmJiByZXEuYXV0aC51c2VyID8gcmVxLmF1dGgudXNlci5pZCA6IHVuZGVmaW5lZDtcbiAgICAgICAgbG9nZ2VyLmVycm9yKFxuICAgICAgICAgIGBGYWlsZWQgcnVubmluZyBhdXRoIHN0ZXAgY2hhbGxlbmdlIGZvciAke3Byb3ZpZGVyfSBmb3IgdXNlciAke3VzZXJTdHJpbmd9IHdpdGggRXJyb3I6IGAgK1xuICAgICAgICAgICAgSlNPTi5zdHJpbmdpZnkoZSksXG4gICAgICAgICAge1xuICAgICAgICAgICAgYXV0aGVudGljYXRpb25TdGVwOiAnY2hhbGxlbmdlJyxcbiAgICAgICAgICAgIGVycm9yOiBlLFxuICAgICAgICAgICAgdXNlcjogdXNlclN0cmluZyxcbiAgICAgICAgICAgIHByb3ZpZGVyLFxuICAgICAgICAgIH1cbiAgICAgICAgKTtcbiAgICAgICAgdGhyb3cgZTtcbiAgICAgIH1cbiAgICB9XG4gICAgcmV0dXJuIHsgcmVzcG9uc2U6IHsgY2hhbGxlbmdlRGF0YTogYWNjIH0gfTtcbiAgfVxuXG4gIG1vdW50Um91dGVzKCkge1xuICAgIHRoaXMucm91dGUoJ0dFVCcsICcvdXNlcnMnLCByZXEgPT4ge1xuICAgICAgcmV0dXJuIHRoaXMuaGFuZGxlRmluZChyZXEpO1xuICAgIH0pO1xuICAgIHRoaXMucm91dGUoJ1BPU1QnLCAnL3VzZXJzJywgcHJvbWlzZUVuc3VyZUlkZW1wb3RlbmN5LCByZXEgPT4ge1xuICAgICAgcmV0dXJuIHRoaXMuaGFuZGxlQ3JlYXRlKHJlcSk7XG4gICAgfSk7XG4gICAgdGhpcy5yb3V0ZSgnR0VUJywgJy91c2Vycy9tZScsIHJlcSA9PiB7XG4gICAgICByZXR1cm4gdGhpcy5oYW5kbGVNZShyZXEpO1xuICAgIH0pO1xuICAgIHRoaXMucm91dGUoJ0dFVCcsICcvdXNlcnMvOm9iamVjdElkJywgcmVxID0+IHtcbiAgICAgIHJldHVybiB0aGlzLmhhbmRsZUdldChyZXEpO1xuICAgIH0pO1xuICAgIHRoaXMucm91dGUoJ1BVVCcsICcvdXNlcnMvOm9iamVjdElkJywgcHJvbWlzZUVuc3VyZUlkZW1wb3RlbmN5LCByZXEgPT4ge1xuICAgICAgcmV0dXJuIHRoaXMuaGFuZGxlVXBkYXRlKHJlcSk7XG4gICAgfSk7XG4gICAgdGhpcy5yb3V0ZSgnREVMRVRFJywgJy91c2Vycy86b2JqZWN0SWQnLCByZXEgPT4ge1xuICAgICAgcmV0dXJuIHRoaXMuaGFuZGxlRGVsZXRlKHJlcSk7XG4gICAgfSk7XG4gICAgdGhpcy5yb3V0ZSgnR0VUJywgJy9sb2dpbicsIHJlcSA9PiB7XG4gICAgICByZXR1cm4gdGhpcy5oYW5kbGVMb2dJbihyZXEpO1xuICAgIH0pO1xuICAgIHRoaXMucm91dGUoJ1BPU1QnLCAnL2xvZ2luJywgcmVxID0+IHtcbiAgICAgIHJldHVybiB0aGlzLmhhbmRsZUxvZ0luKHJlcSk7XG4gICAgfSk7XG4gICAgdGhpcy5yb3V0ZSgnUE9TVCcsICcvbG9naW5BcycsIHJlcSA9PiB7XG4gICAgICByZXR1cm4gdGhpcy5oYW5kbGVMb2dJbkFzKHJlcSk7XG4gICAgfSk7XG4gICAgdGhpcy5yb3V0ZSgnUE9TVCcsICcvbG9nb3V0JywgcmVxID0+IHtcbiAgICAgIHJldHVybiB0aGlzLmhhbmRsZUxvZ091dChyZXEpO1xuICAgIH0pO1xuICAgIHRoaXMucm91dGUoJ1BPU1QnLCAnL3JlcXVlc3RQYXNzd29yZFJlc2V0JywgcmVxID0+IHtcbiAgICAgIHJldHVybiB0aGlzLmhhbmRsZVJlc2V0UmVxdWVzdChyZXEpO1xuICAgIH0pO1xuICAgIHRoaXMucm91dGUoJ1BPU1QnLCAnL3ZlcmlmaWNhdGlvbkVtYWlsUmVxdWVzdCcsIHJlcSA9PiB7XG4gICAgICByZXR1cm4gdGhpcy5oYW5kbGVWZXJpZmljYXRpb25FbWFpbFJlcXVlc3QocmVxKTtcbiAgICB9KTtcbiAgICB0aGlzLnJvdXRlKCdHRVQnLCAnL3ZlcmlmeVBhc3N3b3JkJywgcmVxID0+IHtcbiAgICAgIHJldHVybiB0aGlzLmhhbmRsZVZlcmlmeVBhc3N3b3JkKHJlcSk7XG4gICAgfSk7XG4gICAgdGhpcy5yb3V0ZSgnUE9TVCcsICcvY2hhbGxlbmdlJywgcmVxID0+IHtcbiAgICAgIHJldHVybiB0aGlzLmhhbmRsZUNoYWxsZW5nZShyZXEpO1xuICAgIH0pO1xuICB9XG59XG5cbmV4cG9ydCBkZWZhdWx0IFVzZXJzUm91dGVyO1xuIl0sIm1hcHBpbmdzIjoiOzs7Ozs7QUFFQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBTUE7QUFDQTtBQUNBO0FBQW1DO0FBQUE7QUFBQTtBQUFBO0FB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