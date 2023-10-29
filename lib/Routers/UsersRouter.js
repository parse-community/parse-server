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
    }, user)), null, req.config, req.info.context);

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
    }), afterLoginUser, null, req.config, req.info.context);
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
//# sourceMappingURL=data:application/json;charset=utf-8;base64,eyJ2ZXJzaW9uIjozLCJuYW1lcyI6WyJfbm9kZSIsIl9pbnRlcm9wUmVxdWlyZURlZmF1bHQiLCJyZXF1aXJlIiwiX0NvbmZpZyIsIl9BY2NvdW50TG9ja291dCIsIl9DbGFzc2VzUm91dGVyIiwiX3Jlc3QiLCJfQXV0aCIsIl9wYXNzd29yZCIsIl90cmlnZ2VycyIsIl9taWRkbGV3YXJlcyIsIl9SZXN0V3JpdGUiLCJfbG9nZ2VyIiwib2JqIiwiX19lc01vZHVsZSIsImRlZmF1bHQiLCJvd25LZXlzIiwib2JqZWN0IiwiZW51bWVyYWJsZU9ubHkiLCJrZXlzIiwiT2JqZWN0IiwiZ2V0T3duUHJvcGVydHlTeW1ib2xzIiwic3ltYm9scyIsImZpbHRlciIsInN5bSIsImdldE93blByb3BlcnR5RGVzY3JpcHRvciIsImVudW1lcmFibGUiLCJwdXNoIiwiYXBwbHkiLCJfb2JqZWN0U3ByZWFkIiwidGFyZ2V0IiwiaSIsImFyZ3VtZW50cyIsImxlbmd0aCIsInNvdXJjZSIsImZvckVhY2giLCJrZXkiLCJfZGVmaW5lUHJvcGVydHkiLCJnZXRPd25Qcm9wZXJ0eURlc2NyaXB0b3JzIiwiZGVmaW5lUHJvcGVydGllcyIsImRlZmluZVByb3BlcnR5IiwidmFsdWUiLCJfdG9Qcm9wZXJ0eUtleSIsImNvbmZpZ3VyYWJsZSIsIndyaXRhYmxlIiwiYXJnIiwiX3RvUHJpbWl0aXZlIiwiU3RyaW5nIiwiaW5wdXQiLCJoaW50IiwicHJpbSIsIlN5bWJvbCIsInRvUHJpbWl0aXZlIiwidW5kZWZpbmVkIiwicmVzIiwiY2FsbCIsIlR5cGVFcnJvciIsIk51bWJlciIsIlVzZXJzUm91dGVyIiwiQ2xhc3Nlc1JvdXRlciIsImNsYXNzTmFtZSIsInJlbW92ZUhpZGRlblByb3BlcnRpZXMiLCJwcm90b3R5cGUiLCJoYXNPd25Qcm9wZXJ0eSIsInRlc3QiLCJfc2FuaXRpemVBdXRoRGF0YSIsInVzZXIiLCJwYXNzd29yZCIsImF1dGhEYXRhIiwicHJvdmlkZXIiLCJfYXV0aGVudGljYXRlVXNlckZyb21SZXF1ZXN0IiwicmVxIiwiUHJvbWlzZSIsInJlc29sdmUiLCJyZWplY3QiLCJwYXlsb2FkIiwiYm9keSIsInVzZXJuYW1lIiwicXVlcnkiLCJlbWFpbCIsIlBhcnNlIiwiRXJyb3IiLCJVU0VSTkFNRV9NSVNTSU5HIiwiUEFTU1dPUkRfTUlTU0lORyIsIk9CSkVDVF9OT1RfRk9VTkQiLCJpc1ZhbGlkUGFzc3dvcmQiLCIkb3IiLCJjb25maWciLCJkYXRhYmFzZSIsImZpbmQiLCJBdXRoIiwibWFpbnRlbmFuY2UiLCJ0aGVuIiwicmVzdWx0cyIsImxvZ2dlckNvbnRyb2xsZXIiLCJ3YXJuIiwicGFzc3dvcmRDcnlwdG8iLCJjb21wYXJlIiwiY29ycmVjdCIsImFjY291bnRMb2Nrb3V0UG9saWN5IiwiQWNjb3VudExvY2tvdXQiLCJoYW5kbGVMb2dpbkF0dGVtcHQiLCJhdXRoIiwiaXNNYXN0ZXIiLCJBQ0wiLCJ2ZXJpZnlVc2VyRW1haWxzIiwicHJldmVudExvZ2luV2l0aFVudmVyaWZpZWRFbWFpbCIsImVtYWlsVmVyaWZpZWQiLCJFTUFJTF9OT1RfRk9VTkQiLCJjYXRjaCIsImVycm9yIiwiaGFuZGxlTWUiLCJpbmZvIiwic2Vzc2lvblRva2VuIiwiSU5WQUxJRF9TRVNTSU9OX1RPS0VOIiwicmVzdCIsIm1hc3RlciIsImluY2x1ZGUiLCJjbGllbnRTREsiLCJjb250ZXh0IiwicmVzcG9uc2UiLCJoYW5kbGVMb2dJbiIsImNoZWNrSWZVc2VySGFzUHJvdmlkZWRDb25maWd1cmVkUHJvdmlkZXJzRm9yTG9naW4iLCJhdXRoRGF0YVJlc3BvbnNlIiwidmFsaWRhdGVkQXV0aERhdGEiLCJoYW5kbGVBdXRoRGF0YVZhbGlkYXRpb24iLCJSZXN0V3JpdGUiLCJvYmplY3RJZCIsInBhc3N3b3JkUG9saWN5IiwibWF4UGFzc3dvcmRBZ2UiLCJjaGFuZ2VkQXQiLCJfcGFzc3dvcmRfY2hhbmdlZF9hdCIsIkRhdGUiLCJ1cGRhdGUiLCJfZW5jb2RlIiwiX190eXBlIiwiaXNvIiwiZXhwaXJlc0F0IiwiZ2V0VGltZSIsImZpbGVzQ29udHJvbGxlciIsImV4cGFuZEZpbGVzSW5PYmplY3QiLCJtYXliZVJ1blRyaWdnZXIiLCJUcmlnZ2VyVHlwZXMiLCJiZWZvcmVMb2dpbiIsIlVzZXIiLCJmcm9tSlNPTiIsImFzc2lnbiIsInNlc3Npb25EYXRhIiwiY3JlYXRlU2Vzc2lvbiIsInVzZXJJZCIsImNyZWF0ZWRXaXRoIiwiYWN0aW9uIiwiYXV0aFByb3ZpZGVyIiwiaW5zdGFsbGF0aW9uSWQiLCJhZnRlckxvZ2luVXNlciIsImFmdGVyTG9naW4iLCJhdXRoRGF0YU1hbmFnZXIiLCJydW5BZnRlckZpbmQiLCJoYW5kbGVMb2dJbkFzIiwiT1BFUkFUSU9OX0ZPUkJJRERFTiIsIklOVkFMSURfVkFMVUUiLCJxdWVyeVJlc3VsdHMiLCJoYW5kbGVWZXJpZnlQYXNzd29yZCIsImhhbmRsZUxvZ091dCIsInN1Y2Nlc3MiLCJyZWNvcmRzIiwiZGVsIiwiYWZ0ZXJMb2dvdXQiLCJTZXNzaW9uIiwiX3Rocm93T25CYWRFbWFpbENvbmZpZyIsIkNvbmZpZyIsInZhbGlkYXRlRW1haWxDb25maWd1cmF0aW9uIiwiZW1haWxBZGFwdGVyIiwidXNlckNvbnRyb2xsZXIiLCJhZGFwdGVyIiwiYXBwTmFtZSIsInB1YmxpY1NlcnZlclVSTCIsImVtYWlsVmVyaWZ5VG9rZW5WYWxpZGl0eUR1cmF0aW9uIiwiZW1haWxWZXJpZnlUb2tlblJldXNlSWZWYWxpZCIsImUiLCJJTlRFUk5BTF9TRVJWRVJfRVJST1IiLCJoYW5kbGVSZXNldFJlcXVlc3QiLCJFTUFJTF9NSVNTSU5HIiwiSU5WQUxJRF9FTUFJTF9BRERSRVNTIiwic2VuZFBhc3N3b3JkUmVzZXRFbWFpbCIsImVyciIsImNvZGUiLCJfcmVxJGNvbmZpZyRwYXNzd29yZFAiLCJyZXNldFBhc3N3b3JkU3VjY2Vzc09uSW52YWxpZEVtYWlsIiwibWVzc2FnZSIsImhhbmRsZVZlcmlmaWNhdGlvbkVtYWlsUmVxdWVzdCIsIk9USEVSX0NBVVNFIiwic2VuZCIsInJlZ2VuZXJhdGVFbWFpbFZlcmlmeVRva2VuIiwic2VuZFZlcmlmaWNhdGlvbkVtYWlsIiwiaGFuZGxlQ2hhbGxlbmdlIiwiY2hhbGxlbmdlRGF0YSIsInJlcXVlc3QiLCJwYXJzZVVzZXIiLCJpZCIsImZpbmRVc2Vyc1dpdGhBdXRoRGF0YSIsImdldFJlcXVlc3RPYmplY3QiLCJpc0NoYWxsZW5nZSIsInZhbGlkYXRvciIsImdldFZhbGlkYXRvckZvclByb3ZpZGVyIiwidmFsaWRhdG9yUmVzcG9uc2UiLCJsb2dnZXIiLCJhY2MiLCJzb3J0IiwiYXV0aEFkYXB0ZXIiLCJjaGFsbGVuZ2UiLCJwcm92aWRlckNoYWxsZW5nZVJlc3BvbnNlIiwicmVzb2x2ZUVycm9yIiwiU0NSSVBUX0ZBSUxFRCIsInVzZXJTdHJpbmciLCJKU09OIiwic3RyaW5naWZ5IiwiYXV0aGVudGljYXRpb25TdGVwIiwibW91bnRSb3V0ZXMiLCJyb3V0ZSIsImhhbmRsZUZpbmQiLCJwcm9taXNlRW5zdXJlSWRlbXBvdGVuY3kiLCJoYW5kbGVDcmVhdGUiLCJoYW5kbGVHZXQiLCJoYW5kbGVVcGRhdGUiLCJoYW5kbGVEZWxldGUiLCJleHBvcnRzIiwiX2RlZmF1bHQiXSwic291cmNlcyI6WyIuLi8uLi9zcmMvUm91dGVycy9Vc2Vyc1JvdXRlci5qcyJdLCJzb3VyY2VzQ29udGVudCI6WyIvLyBUaGVzZSBtZXRob2RzIGhhbmRsZSB0aGUgVXNlci1yZWxhdGVkIHJvdXRlcy5cblxuaW1wb3J0IFBhcnNlIGZyb20gJ3BhcnNlL25vZGUnO1xuaW1wb3J0IENvbmZpZyBmcm9tICcuLi9Db25maWcnO1xuaW1wb3J0IEFjY291bnRMb2Nrb3V0IGZyb20gJy4uL0FjY291bnRMb2Nrb3V0JztcbmltcG9ydCBDbGFzc2VzUm91dGVyIGZyb20gJy4vQ2xhc3Nlc1JvdXRlcic7XG5pbXBvcnQgcmVzdCBmcm9tICcuLi9yZXN0JztcbmltcG9ydCBBdXRoIGZyb20gJy4uL0F1dGgnO1xuaW1wb3J0IHBhc3N3b3JkQ3J5cHRvIGZyb20gJy4uL3Bhc3N3b3JkJztcbmltcG9ydCB7XG4gIG1heWJlUnVuVHJpZ2dlcixcbiAgVHlwZXMgYXMgVHJpZ2dlclR5cGVzLFxuICBnZXRSZXF1ZXN0T2JqZWN0LFxuICByZXNvbHZlRXJyb3IsXG59IGZyb20gJy4uL3RyaWdnZXJzJztcbmltcG9ydCB7IHByb21pc2VFbnN1cmVJZGVtcG90ZW5jeSB9IGZyb20gJy4uL21pZGRsZXdhcmVzJztcbmltcG9ydCBSZXN0V3JpdGUgZnJvbSAnLi4vUmVzdFdyaXRlJztcbmltcG9ydCB7IGxvZ2dlciB9IGZyb20gJy4uL2xvZ2dlcic7XG5cbmV4cG9ydCBjbGFzcyBVc2Vyc1JvdXRlciBleHRlbmRzIENsYXNzZXNSb3V0ZXIge1xuICBjbGFzc05hbWUoKSB7XG4gICAgcmV0dXJuICdfVXNlcic7XG4gIH1cblxuICAvKipcbiAgICogUmVtb3ZlcyBhbGwgXCJfXCIgcHJlZml4ZWQgcHJvcGVydGllcyBmcm9tIGFuIG9iamVjdCwgZXhjZXB0IFwiX190eXBlXCJcbiAgICogQHBhcmFtIHtPYmplY3R9IG9iaiBBbiBvYmplY3QuXG4gICAqL1xuICBzdGF0aWMgcmVtb3ZlSGlkZGVuUHJvcGVydGllcyhvYmopIHtcbiAgICBmb3IgKHZhciBrZXkgaW4gb2JqKSB7XG4gICAgICBpZiAoT2JqZWN0LnByb3RvdHlwZS5oYXNPd25Qcm9wZXJ0eS5jYWxsKG9iaiwga2V5KSkge1xuICAgICAgICAvLyBSZWdleHAgY29tZXMgZnJvbSBQYXJzZS5PYmplY3QucHJvdG90eXBlLnZhbGlkYXRlXG4gICAgICAgIGlmIChrZXkgIT09ICdfX3R5cGUnICYmICEvXltBLVphLXpdWzAtOUEtWmEtel9dKiQvLnRlc3Qoa2V5KSkge1xuICAgICAgICAgIGRlbGV0ZSBvYmpba2V5XTtcbiAgICAgICAgfVxuICAgICAgfVxuICAgIH1cbiAgfVxuXG4gIC8qKlxuICAgKiBBZnRlciByZXRyaWV2aW5nIGEgdXNlciBkaXJlY3RseSBmcm9tIHRoZSBkYXRhYmFzZSwgd2UgbmVlZCB0byByZW1vdmUgdGhlXG4gICAqIHBhc3N3b3JkIGZyb20gdGhlIG9iamVjdCAoZm9yIHNlY3VyaXR5KSwgYW5kIGZpeCBhbiBpc3N1ZSBzb21lIFNES3MgaGF2ZVxuICAgKiB3aXRoIG51bGwgdmFsdWVzXG4gICAqL1xuICBfc2FuaXRpemVBdXRoRGF0YSh1c2VyKSB7XG4gICAgZGVsZXRlIHVzZXIucGFzc3dvcmQ7XG5cbiAgICAvLyBTb21ldGltZXMgdGhlIGF1dGhEYXRhIHN0aWxsIGhhcyBudWxsIG9uIHRoYXQga2V5c1xuICAgIC8vIGh0dHBzOi8vZ2l0aHViLmNvbS9wYXJzZS1jb21tdW5pdHkvcGFyc2Utc2VydmVyL2lzc3Vlcy85MzVcbiAgICBpZiAodXNlci5hdXRoRGF0YSkge1xuICAgICAgT2JqZWN0LmtleXModXNlci5hdXRoRGF0YSkuZm9yRWFjaChwcm92aWRlciA9PiB7XG4gICAgICAgIGlmICh1c2VyLmF1dGhEYXRhW3Byb3ZpZGVyXSA9PT0gbnVsbCkge1xuICAgICAgICAgIGRlbGV0ZSB1c2VyLmF1dGhEYXRhW3Byb3ZpZGVyXTtcbiAgICAgICAgfVxuICAgICAgfSk7XG4gICAgICBpZiAoT2JqZWN0LmtleXModXNlci5hdXRoRGF0YSkubGVuZ3RoID09IDApIHtcbiAgICAgICAgZGVsZXRlIHVzZXIuYXV0aERhdGE7XG4gICAgICB9XG4gICAgfVxuICB9XG5cbiAgLyoqXG4gICAqIFZhbGlkYXRlcyBhIHBhc3N3b3JkIHJlcXVlc3QgaW4gbG9naW4gYW5kIHZlcmlmeVBhc3N3b3JkXG4gICAqIEBwYXJhbSB7T2JqZWN0fSByZXEgVGhlIHJlcXVlc3RcbiAgICogQHJldHVybnMge09iamVjdH0gVXNlciBvYmplY3RcbiAgICogQHByaXZhdGVcbiAgICovXG4gIF9hdXRoZW50aWNhdGVVc2VyRnJvbVJlcXVlc3QocmVxKSB7XG4gICAgcmV0dXJuIG5ldyBQcm9taXNlKChyZXNvbHZlLCByZWplY3QpID0+IHtcbiAgICAgIC8vIFVzZSBxdWVyeSBwYXJhbWV0ZXJzIGluc3RlYWQgaWYgcHJvdmlkZWQgaW4gdXJsXG4gICAgICBsZXQgcGF5bG9hZCA9IHJlcS5ib2R5O1xuICAgICAgaWYgKFxuICAgICAgICAoIXBheWxvYWQudXNlcm5hbWUgJiYgcmVxLnF1ZXJ5ICYmIHJlcS5xdWVyeS51c2VybmFtZSkgfHxcbiAgICAgICAgKCFwYXlsb2FkLmVtYWlsICYmIHJlcS5xdWVyeSAmJiByZXEucXVlcnkuZW1haWwpXG4gICAgICApIHtcbiAgICAgICAgcGF5bG9hZCA9IHJlcS5xdWVyeTtcbiAgICAgIH1cbiAgICAgIGNvbnN0IHsgdXNlcm5hbWUsIGVtYWlsLCBwYXNzd29yZCB9ID0gcGF5bG9hZDtcblxuICAgICAgLy8gVE9ETzogdXNlIHRoZSByaWdodCBlcnJvciBjb2RlcyAvIGRlc2NyaXB0aW9ucy5cbiAgICAgIGlmICghdXNlcm5hbWUgJiYgIWVtYWlsKSB7XG4gICAgICAgIHRocm93IG5ldyBQYXJzZS5FcnJvcihQYXJzZS5FcnJvci5VU0VSTkFNRV9NSVNTSU5HLCAndXNlcm5hbWUvZW1haWwgaXMgcmVxdWlyZWQuJyk7XG4gICAgICB9XG4gICAgICBpZiAoIXBhc3N3b3JkKSB7XG4gICAgICAgIHRocm93IG5ldyBQYXJzZS5FcnJvcihQYXJzZS5FcnJvci5QQVNTV09SRF9NSVNTSU5HLCAncGFzc3dvcmQgaXMgcmVxdWlyZWQuJyk7XG4gICAgICB9XG4gICAgICBpZiAoXG4gICAgICAgIHR5cGVvZiBwYXNzd29yZCAhPT0gJ3N0cmluZycgfHxcbiAgICAgICAgKGVtYWlsICYmIHR5cGVvZiBlbWFpbCAhPT0gJ3N0cmluZycpIHx8XG4gICAgICAgICh1c2VybmFtZSAmJiB0eXBlb2YgdXNlcm5hbWUgIT09ICdzdHJpbmcnKVxuICAgICAgKSB7XG4gICAgICAgIHRocm93IG5ldyBQYXJzZS5FcnJvcihQYXJzZS5FcnJvci5PQkpFQ1RfTk9UX0ZPVU5ELCAnSW52YWxpZCB1c2VybmFtZS9wYXNzd29yZC4nKTtcbiAgICAgIH1cblxuICAgICAgbGV0IHVzZXI7XG4gICAgICBsZXQgaXNWYWxpZFBhc3N3b3JkID0gZmFsc2U7XG4gICAgICBsZXQgcXVlcnk7XG4gICAgICBpZiAoZW1haWwgJiYgdXNlcm5hbWUpIHtcbiAgICAgICAgcXVlcnkgPSB7IGVtYWlsLCB1c2VybmFtZSB9O1xuICAgICAgfSBlbHNlIGlmIChlbWFpbCkge1xuICAgICAgICBxdWVyeSA9IHsgZW1haWwgfTtcbiAgICAgIH0gZWxzZSB7XG4gICAgICAgIHF1ZXJ5ID0geyAkb3I6IFt7IHVzZXJuYW1lIH0sIHsgZW1haWw6IHVzZXJuYW1lIH1dIH07XG4gICAgICB9XG4gICAgICByZXR1cm4gcmVxLmNvbmZpZy5kYXRhYmFzZVxuICAgICAgICAuZmluZCgnX1VzZXInLCBxdWVyeSwge30sIEF1dGgubWFpbnRlbmFuY2UocmVxLmNvbmZpZykpXG4gICAgICAgIC50aGVuKHJlc3VsdHMgPT4ge1xuICAgICAgICAgIGlmICghcmVzdWx0cy5sZW5ndGgpIHtcbiAgICAgICAgICAgIHRocm93IG5ldyBQYXJzZS5FcnJvcihQYXJzZS5FcnJvci5PQkpFQ1RfTk9UX0ZPVU5ELCAnSW52YWxpZCB1c2VybmFtZS9wYXNzd29yZC4nKTtcbiAgICAgICAgICB9XG5cbiAgICAgICAgICBpZiAocmVzdWx0cy5sZW5ndGggPiAxKSB7XG4gICAgICAgICAgICAvLyBjb3JuZXIgY2FzZSB3aGVyZSB1c2VyMSBoYXMgdXNlcm5hbWUgPT0gdXNlcjIgZW1haWxcbiAgICAgICAgICAgIHJlcS5jb25maWcubG9nZ2VyQ29udHJvbGxlci53YXJuKFxuICAgICAgICAgICAgICBcIlRoZXJlIGlzIGEgdXNlciB3aGljaCBlbWFpbCBpcyB0aGUgc2FtZSBhcyBhbm90aGVyIHVzZXIncyB1c2VybmFtZSwgbG9nZ2luZyBpbiBiYXNlZCBvbiB1c2VybmFtZVwiXG4gICAgICAgICAgICApO1xuICAgICAgICAgICAgdXNlciA9IHJlc3VsdHMuZmlsdGVyKHVzZXIgPT4gdXNlci51c2VybmFtZSA9PT0gdXNlcm5hbWUpWzBdO1xuICAgICAgICAgIH0gZWxzZSB7XG4gICAgICAgICAgICB1c2VyID0gcmVzdWx0c1swXTtcbiAgICAgICAgICB9XG5cbiAgICAgICAgICByZXR1cm4gcGFzc3dvcmRDcnlwdG8uY29tcGFyZShwYXNzd29yZCwgdXNlci5wYXNzd29yZCk7XG4gICAgICAgIH0pXG4gICAgICAgIC50aGVuKGNvcnJlY3QgPT4ge1xuICAgICAgICAgIGlzVmFsaWRQYXNzd29yZCA9IGNvcnJlY3Q7XG4gICAgICAgICAgY29uc3QgYWNjb3VudExvY2tvdXRQb2xpY3kgPSBuZXcgQWNjb3VudExvY2tvdXQodXNlciwgcmVxLmNvbmZpZyk7XG4gICAgICAgICAgcmV0dXJuIGFjY291bnRMb2Nrb3V0UG9saWN5LmhhbmRsZUxvZ2luQXR0ZW1wdChpc1ZhbGlkUGFzc3dvcmQpO1xuICAgICAgICB9KVxuICAgICAgICAudGhlbigoKSA9PiB7XG4gICAgICAgICAgaWYgKCFpc1ZhbGlkUGFzc3dvcmQpIHtcbiAgICAgICAgICAgIHRocm93IG5ldyBQYXJzZS5FcnJvcihQYXJzZS5FcnJvci5PQkpFQ1RfTk9UX0ZPVU5ELCAnSW52YWxpZCB1c2VybmFtZS9wYXNzd29yZC4nKTtcbiAgICAgICAgICB9XG4gICAgICAgICAgLy8gRW5zdXJlIHRoZSB1c2VyIGlzbid0IGxvY2tlZCBvdXRcbiAgICAgICAgICAvLyBBIGxvY2tlZCBvdXQgdXNlciB3b24ndCBiZSBhYmxlIHRvIGxvZ2luXG4gICAgICAgICAgLy8gVG8gbG9jayBhIHVzZXIgb3V0LCBqdXN0IHNldCB0aGUgQUNMIHRvIGBtYXN0ZXJLZXlgIG9ubHkgICh7fSkuXG4gICAgICAgICAgLy8gRW1wdHkgQUNMIGlzIE9LXG4gICAgICAgICAgaWYgKCFyZXEuYXV0aC5pc01hc3RlciAmJiB1c2VyLkFDTCAmJiBPYmplY3Qua2V5cyh1c2VyLkFDTCkubGVuZ3RoID09IDApIHtcbiAgICAgICAgICAgIHRocm93IG5ldyBQYXJzZS5FcnJvcihQYXJzZS5FcnJvci5PQkpFQ1RfTk9UX0ZPVU5ELCAnSW52YWxpZCB1c2VybmFtZS9wYXNzd29yZC4nKTtcbiAgICAgICAgICB9XG4gICAgICAgICAgaWYgKFxuICAgICAgICAgICAgcmVxLmNvbmZpZy52ZXJpZnlVc2VyRW1haWxzICYmXG4gICAgICAgICAgICByZXEuY29uZmlnLnByZXZlbnRMb2dpbldpdGhVbnZlcmlmaWVkRW1haWwgJiZcbiAgICAgICAgICAgICF1c2VyLmVtYWlsVmVyaWZpZWRcbiAgICAgICAgICApIHtcbiAgICAgICAgICAgIHRocm93IG5ldyBQYXJzZS5FcnJvcihQYXJzZS5FcnJvci5FTUFJTF9OT1RfRk9VTkQsICdVc2VyIGVtYWlsIGlzIG5vdCB2ZXJpZmllZC4nKTtcbiAgICAgICAgICB9XG5cbiAgICAgICAgICB0aGlzLl9zYW5pdGl6ZUF1dGhEYXRhKHVzZXIpO1xuXG4gICAgICAgICAgcmV0dXJuIHJlc29sdmUodXNlcik7XG4gICAgICAgIH0pXG4gICAgICAgIC5jYXRjaChlcnJvciA9PiB7XG4gICAgICAgICAgcmV0dXJuIHJlamVjdChlcnJvcik7XG4gICAgICAgIH0pO1xuICAgIH0pO1xuICB9XG5cbiAgaGFuZGxlTWUocmVxKSB7XG4gICAgaWYgKCFyZXEuaW5mbyB8fCAhcmVxLmluZm8uc2Vzc2lvblRva2VuKSB7XG4gICAgICB0aHJvdyBuZXcgUGFyc2UuRXJyb3IoUGFyc2UuRXJyb3IuSU5WQUxJRF9TRVNTSU9OX1RPS0VOLCAnSW52YWxpZCBzZXNzaW9uIHRva2VuJyk7XG4gICAgfVxuICAgIGNvbnN0IHNlc3Npb25Ub2tlbiA9IHJlcS5pbmZvLnNlc3Npb25Ub2tlbjtcbiAgICByZXR1cm4gcmVzdFxuICAgICAgLmZpbmQoXG4gICAgICAgIHJlcS5jb25maWcsXG4gICAgICAgIEF1dGgubWFzdGVyKHJlcS5jb25maWcpLFxuICAgICAgICAnX1Nlc3Npb24nLFxuICAgICAgICB7IHNlc3Npb25Ub2tlbiB9LFxuICAgICAgICB7IGluY2x1ZGU6ICd1c2VyJyB9LFxuICAgICAgICByZXEuaW5mby5jbGllbnRTREssXG4gICAgICAgIHJlcS5pbmZvLmNvbnRleHRcbiAgICAgIClcbiAgICAgIC50aGVuKHJlc3BvbnNlID0+IHtcbiAgICAgICAgaWYgKCFyZXNwb25zZS5yZXN1bHRzIHx8IHJlc3BvbnNlLnJlc3VsdHMubGVuZ3RoID09IDAgfHwgIXJlc3BvbnNlLnJlc3VsdHNbMF0udXNlcikge1xuICAgICAgICAgIHRocm93IG5ldyBQYXJzZS5FcnJvcihQYXJzZS5FcnJvci5JTlZBTElEX1NFU1NJT05fVE9LRU4sICdJbnZhbGlkIHNlc3Npb24gdG9rZW4nKTtcbiAgICAgICAgfSBlbHNlIHtcbiAgICAgICAgICBjb25zdCB1c2VyID0gcmVzcG9uc2UucmVzdWx0c1swXS51c2VyO1xuICAgICAgICAgIC8vIFNlbmQgdG9rZW4gYmFjayBvbiB0aGUgbG9naW4sIGJlY2F1c2UgU0RLcyBleHBlY3QgdGhhdC5cbiAgICAgICAgICB1c2VyLnNlc3Npb25Ub2tlbiA9IHNlc3Npb25Ub2tlbjtcblxuICAgICAgICAgIC8vIFJlbW92ZSBoaWRkZW4gcHJvcGVydGllcy5cbiAgICAgICAgICBVc2Vyc1JvdXRlci5yZW1vdmVIaWRkZW5Qcm9wZXJ0aWVzKHVzZXIpO1xuICAgICAgICAgIHJldHVybiB7IHJlc3BvbnNlOiB1c2VyIH07XG4gICAgICAgIH1cbiAgICAgIH0pO1xuICB9XG5cbiAgYXN5bmMgaGFuZGxlTG9nSW4ocmVxKSB7XG4gICAgY29uc3QgdXNlciA9IGF3YWl0IHRoaXMuX2F1dGhlbnRpY2F0ZVVzZXJGcm9tUmVxdWVzdChyZXEpO1xuICAgIGNvbnN0IGF1dGhEYXRhID0gcmVxLmJvZHkgJiYgcmVxLmJvZHkuYXV0aERhdGE7XG4gICAgLy8gQ2hlY2sgaWYgdXNlciBoYXMgcHJvdmlkZWQgdGhlaXIgcmVxdWlyZWQgYXV0aCBwcm92aWRlcnNcbiAgICBBdXRoLmNoZWNrSWZVc2VySGFzUHJvdmlkZWRDb25maWd1cmVkUHJvdmlkZXJzRm9yTG9naW4oXG4gICAgICByZXEsXG4gICAgICBhdXRoRGF0YSxcbiAgICAgIHVzZXIuYXV0aERhdGEsXG4gICAgICByZXEuY29uZmlnXG4gICAgKTtcblxuICAgIGxldCBhdXRoRGF0YVJlc3BvbnNlO1xuICAgIGxldCB2YWxpZGF0ZWRBdXRoRGF0YTtcbiAgICBpZiAoYXV0aERhdGEpIHtcbiAgICAgIGNvbnN0IHJlcyA9IGF3YWl0IEF1dGguaGFuZGxlQXV0aERhdGFWYWxpZGF0aW9uKFxuICAgICAgICBhdXRoRGF0YSxcbiAgICAgICAgbmV3IFJlc3RXcml0ZShcbiAgICAgICAgICByZXEuY29uZmlnLFxuICAgICAgICAgIHJlcS5hdXRoLFxuICAgICAgICAgICdfVXNlcicsXG4gICAgICAgICAgeyBvYmplY3RJZDogdXNlci5vYmplY3RJZCB9LFxuICAgICAgICAgIHJlcS5ib2R5LFxuICAgICAgICAgIHVzZXIsXG4gICAgICAgICAgcmVxLmluZm8uY2xpZW50U0RLLFxuICAgICAgICAgIHJlcS5pbmZvLmNvbnRleHRcbiAgICAgICAgKSxcbiAgICAgICAgdXNlclxuICAgICAgKTtcbiAgICAgIGF1dGhEYXRhUmVzcG9uc2UgPSByZXMuYXV0aERhdGFSZXNwb25zZTtcbiAgICAgIHZhbGlkYXRlZEF1dGhEYXRhID0gcmVzLmF1dGhEYXRhO1xuICAgIH1cblxuICAgIC8vIGhhbmRsZSBwYXNzd29yZCBleHBpcnkgcG9saWN5XG4gICAgaWYgKHJlcS5jb25maWcucGFzc3dvcmRQb2xpY3kgJiYgcmVxLmNvbmZpZy5wYXNzd29yZFBvbGljeS5tYXhQYXNzd29yZEFnZSkge1xuICAgICAgbGV0IGNoYW5nZWRBdCA9IHVzZXIuX3Bhc3N3b3JkX2NoYW5nZWRfYXQ7XG5cbiAgICAgIGlmICghY2hhbmdlZEF0KSB7XG4gICAgICAgIC8vIHBhc3N3b3JkIHdhcyBjcmVhdGVkIGJlZm9yZSBleHBpcnkgcG9saWN5IHdhcyBlbmFibGVkLlxuICAgICAgICAvLyBzaW1wbHkgdXBkYXRlIF9Vc2VyIG9iamVjdCBzbyB0aGF0IGl0IHdpbGwgc3RhcnQgZW5mb3JjaW5nIGZyb20gbm93XG4gICAgICAgIGNoYW5nZWRBdCA9IG5ldyBEYXRlKCk7XG4gICAgICAgIHJlcS5jb25maWcuZGF0YWJhc2UudXBkYXRlKFxuICAgICAgICAgICdfVXNlcicsXG4gICAgICAgICAgeyB1c2VybmFtZTogdXNlci51c2VybmFtZSB9LFxuICAgICAgICAgIHsgX3Bhc3N3b3JkX2NoYW5nZWRfYXQ6IFBhcnNlLl9lbmNvZGUoY2hhbmdlZEF0KSB9XG4gICAgICAgICk7XG4gICAgICB9IGVsc2Uge1xuICAgICAgICAvLyBjaGVjayB3aGV0aGVyIHRoZSBwYXNzd29yZCBoYXMgZXhwaXJlZFxuICAgICAgICBpZiAoY2hhbmdlZEF0Ll9fdHlwZSA9PSAnRGF0ZScpIHtcbiAgICAgICAgICBjaGFuZ2VkQXQgPSBuZXcgRGF0ZShjaGFuZ2VkQXQuaXNvKTtcbiAgICAgICAgfVxuICAgICAgICAvLyBDYWxjdWxhdGUgdGhlIGV4cGlyeSB0aW1lLlxuICAgICAgICBjb25zdCBleHBpcmVzQXQgPSBuZXcgRGF0ZShcbiAgICAgICAgICBjaGFuZ2VkQXQuZ2V0VGltZSgpICsgODY0MDAwMDAgKiByZXEuY29uZmlnLnBhc3N3b3JkUG9saWN5Lm1heFBhc3N3b3JkQWdlXG4gICAgICAgICk7XG4gICAgICAgIGlmIChleHBpcmVzQXQgPCBuZXcgRGF0ZSgpKVxuICAgICAgICAgIC8vIGZhaWwgb2YgY3VycmVudCB0aW1lIGlzIHBhc3QgcGFzc3dvcmQgZXhwaXJ5IHRpbWVcbiAgICAgICAgICB0aHJvdyBuZXcgUGFyc2UuRXJyb3IoXG4gICAgICAgICAgICBQYXJzZS5FcnJvci5PQkpFQ1RfTk9UX0ZPVU5ELFxuICAgICAgICAgICAgJ1lvdXIgcGFzc3dvcmQgaGFzIGV4cGlyZWQuIFBsZWFzZSByZXNldCB5b3VyIHBhc3N3b3JkLidcbiAgICAgICAgICApO1xuICAgICAgfVxuICAgIH1cblxuICAgIC8vIFJlbW92ZSBoaWRkZW4gcHJvcGVydGllcy5cbiAgICBVc2Vyc1JvdXRlci5yZW1vdmVIaWRkZW5Qcm9wZXJ0aWVzKHVzZXIpO1xuXG4gICAgcmVxLmNvbmZpZy5maWxlc0NvbnRyb2xsZXIuZXhwYW5kRmlsZXNJbk9iamVjdChyZXEuY29uZmlnLCB1c2VyKTtcblxuICAgIC8vIEJlZm9yZSBsb2dpbiB0cmlnZ2VyOyB0aHJvd3MgaWYgZmFpbHVyZVxuICAgIGF3YWl0IG1heWJlUnVuVHJpZ2dlcihcbiAgICAgIFRyaWdnZXJUeXBlcy5iZWZvcmVMb2dpbixcbiAgICAgIHJlcS5hdXRoLFxuICAgICAgUGFyc2UuVXNlci5mcm9tSlNPTihPYmplY3QuYXNzaWduKHsgY2xhc3NOYW1lOiAnX1VzZXInIH0sIHVzZXIpKSxcbiAgICAgIG51bGwsXG4gICAgICByZXEuY29uZmlnLFxuICAgICAgcmVxLmluZm8uY29udGV4dFxuICAgICk7XG5cbiAgICAvLyBJZiB3ZSBoYXZlIHNvbWUgbmV3IHZhbGlkYXRlZCBhdXRoRGF0YSB1cGRhdGUgZGlyZWN0bHlcbiAgICBpZiAodmFsaWRhdGVkQXV0aERhdGEgJiYgT2JqZWN0LmtleXModmFsaWRhdGVkQXV0aERhdGEpLmxlbmd0aCkge1xuICAgICAgYXdhaXQgcmVxLmNvbmZpZy5kYXRhYmFzZS51cGRhdGUoXG4gICAgICAgICdfVXNlcicsXG4gICAgICAgIHsgb2JqZWN0SWQ6IHVzZXIub2JqZWN0SWQgfSxcbiAgICAgICAgeyBhdXRoRGF0YTogdmFsaWRhdGVkQXV0aERhdGEgfSxcbiAgICAgICAge31cbiAgICAgICk7XG4gICAgfVxuXG4gICAgY29uc3QgeyBzZXNzaW9uRGF0YSwgY3JlYXRlU2Vzc2lvbiB9ID0gUmVzdFdyaXRlLmNyZWF0ZVNlc3Npb24ocmVxLmNvbmZpZywge1xuICAgICAgdXNlcklkOiB1c2VyLm9iamVjdElkLFxuICAgICAgY3JlYXRlZFdpdGg6IHtcbiAgICAgICAgYWN0aW9uOiAnbG9naW4nLFxuICAgICAgICBhdXRoUHJvdmlkZXI6ICdwYXNzd29yZCcsXG4gICAgICB9LFxuICAgICAgaW5zdGFsbGF0aW9uSWQ6IHJlcS5pbmZvLmluc3RhbGxhdGlvbklkLFxuICAgIH0pO1xuXG4gICAgdXNlci5zZXNzaW9uVG9rZW4gPSBzZXNzaW9uRGF0YS5zZXNzaW9uVG9rZW47XG5cbiAgICBhd2FpdCBjcmVhdGVTZXNzaW9uKCk7XG5cbiAgICBjb25zdCBhZnRlckxvZ2luVXNlciA9IFBhcnNlLlVzZXIuZnJvbUpTT04oT2JqZWN0LmFzc2lnbih7IGNsYXNzTmFtZTogJ19Vc2VyJyB9LCB1c2VyKSk7XG4gICAgYXdhaXQgbWF5YmVSdW5UcmlnZ2VyKFxuICAgICAgVHJpZ2dlclR5cGVzLmFmdGVyTG9naW4sXG4gICAgICB7IC4uLnJlcS5hdXRoLCB1c2VyOiBhZnRlckxvZ2luVXNlciB9LFxuICAgICAgYWZ0ZXJMb2dpblVzZXIsXG4gICAgICBudWxsLFxuICAgICAgcmVxLmNvbmZpZyxcbiAgICAgIHJlcS5pbmZvLmNvbnRleHRcbiAgICApO1xuXG4gICAgaWYgKGF1dGhEYXRhUmVzcG9uc2UpIHtcbiAgICAgIHVzZXIuYXV0aERhdGFSZXNwb25zZSA9IGF1dGhEYXRhUmVzcG9uc2U7XG4gICAgfVxuICAgIGF3YWl0IHJlcS5jb25maWcuYXV0aERhdGFNYW5hZ2VyLnJ1bkFmdGVyRmluZChyZXEsIHVzZXIuYXV0aERhdGEpO1xuXG4gICAgcmV0dXJuIHsgcmVzcG9uc2U6IHVzZXIgfTtcbiAgfVxuXG4gIC8qKlxuICAgKiBUaGlzIGFsbG93cyBtYXN0ZXIta2V5IGNsaWVudHMgdG8gY3JlYXRlIHVzZXIgc2Vzc2lvbnMgd2l0aG91dCBhY2Nlc3MgdG9cbiAgICogdXNlciBjcmVkZW50aWFscy4gVGhpcyBlbmFibGVzIHN5c3RlbXMgdGhhdCBjYW4gYXV0aGVudGljYXRlIGFjY2VzcyBhbm90aGVyXG4gICAqIHdheSAoQVBJIGtleSwgYXBwIGFkbWluaXN0cmF0b3JzKSB0byBhY3Qgb24gYSB1c2VyJ3MgYmVoYWxmLlxuICAgKlxuICAgKiBXZSBjcmVhdGUgYSBuZXcgc2Vzc2lvbiByYXRoZXIgdGhhbiBsb29raW5nIGZvciBhbiBleGlzdGluZyBzZXNzaW9uOyB3ZVxuICAgKiB3YW50IHRoaXMgdG8gd29yayBpbiBzaXR1YXRpb25zIHdoZXJlIHRoZSB1c2VyIGlzIGxvZ2dlZCBvdXQgb24gYWxsXG4gICAqIGRldmljZXMsIHNpbmNlIHRoaXMgY2FuIGJlIHVzZWQgYnkgYXV0b21hdGVkIHN5c3RlbXMgYWN0aW5nIG9uIHRoZSB1c2VyJ3NcbiAgICogYmVoYWxmLlxuICAgKlxuICAgKiBGb3IgdGhlIG1vbWVudCwgd2UncmUgb21pdHRpbmcgZXZlbnQgaG9va3MgYW5kIGxvY2tvdXQgY2hlY2tzLCBzaW5jZVxuICAgKiBpbW1lZGlhdGUgdXNlIGNhc2VzIHN1Z2dlc3QgL2xvZ2luQXMgY291bGQgYmUgdXNlZCBmb3Igc2VtYW50aWNhbGx5XG4gICAqIGRpZmZlcmVudCByZWFzb25zIGZyb20gL2xvZ2luXG4gICAqL1xuICBhc3luYyBoYW5kbGVMb2dJbkFzKHJlcSkge1xuICAgIGlmICghcmVxLmF1dGguaXNNYXN0ZXIpIHtcbiAgICAgIHRocm93IG5ldyBQYXJzZS5FcnJvcihQYXJzZS5FcnJvci5PUEVSQVRJT05fRk9SQklEREVOLCAnbWFzdGVyIGtleSBpcyByZXF1aXJlZCcpO1xuICAgIH1cblxuICAgIGNvbnN0IHVzZXJJZCA9IHJlcS5ib2R5LnVzZXJJZCB8fCByZXEucXVlcnkudXNlcklkO1xuICAgIGlmICghdXNlcklkKSB7XG4gICAgICB0aHJvdyBuZXcgUGFyc2UuRXJyb3IoXG4gICAgICAgIFBhcnNlLkVycm9yLklOVkFMSURfVkFMVUUsXG4gICAgICAgICd1c2VySWQgbXVzdCBub3QgYmUgZW1wdHksIG51bGwsIG9yIHVuZGVmaW5lZCdcbiAgICAgICk7XG4gICAgfVxuXG4gICAgY29uc3QgcXVlcnlSZXN1bHRzID0gYXdhaXQgcmVxLmNvbmZpZy5kYXRhYmFzZS5maW5kKCdfVXNlcicsIHsgb2JqZWN0SWQ6IHVzZXJJZCB9KTtcbiAgICBjb25zdCB1c2VyID0gcXVlcnlSZXN1bHRzWzBdO1xuICAgIGlmICghdXNlcikge1xuICAgICAgdGhyb3cgbmV3IFBhcnNlLkVycm9yKFBhcnNlLkVycm9yLk9CSkVDVF9OT1RfRk9VTkQsICd1c2VyIG5vdCBmb3VuZCcpO1xuICAgIH1cblxuICAgIHRoaXMuX3Nhbml0aXplQXV0aERhdGEodXNlcik7XG5cbiAgICBjb25zdCB7IHNlc3Npb25EYXRhLCBjcmVhdGVTZXNzaW9uIH0gPSBSZXN0V3JpdGUuY3JlYXRlU2Vzc2lvbihyZXEuY29uZmlnLCB7XG4gICAgICB1c2VySWQsXG4gICAgICBjcmVhdGVkV2l0aDoge1xuICAgICAgICBhY3Rpb246ICdsb2dpbicsXG4gICAgICAgIGF1dGhQcm92aWRlcjogJ21hc3RlcmtleScsXG4gICAgICB9LFxuICAgICAgaW5zdGFsbGF0aW9uSWQ6IHJlcS5pbmZvLmluc3RhbGxhdGlvbklkLFxuICAgIH0pO1xuXG4gICAgdXNlci5zZXNzaW9uVG9rZW4gPSBzZXNzaW9uRGF0YS5zZXNzaW9uVG9rZW47XG5cbiAgICBhd2FpdCBjcmVhdGVTZXNzaW9uKCk7XG5cbiAgICByZXR1cm4geyByZXNwb25zZTogdXNlciB9O1xuICB9XG5cbiAgaGFuZGxlVmVyaWZ5UGFzc3dvcmQocmVxKSB7XG4gICAgcmV0dXJuIHRoaXMuX2F1dGhlbnRpY2F0ZVVzZXJGcm9tUmVxdWVzdChyZXEpXG4gICAgICAudGhlbih1c2VyID0+IHtcbiAgICAgICAgLy8gUmVtb3ZlIGhpZGRlbiBwcm9wZXJ0aWVzLlxuICAgICAgICBVc2Vyc1JvdXRlci5yZW1vdmVIaWRkZW5Qcm9wZXJ0aWVzKHVzZXIpO1xuXG4gICAgICAgIHJldHVybiB7IHJlc3BvbnNlOiB1c2VyIH07XG4gICAgICB9KVxuICAgICAgLmNhdGNoKGVycm9yID0+IHtcbiAgICAgICAgdGhyb3cgZXJyb3I7XG4gICAgICB9KTtcbiAgfVxuXG4gIGFzeW5jIGhhbmRsZUxvZ091dChyZXEpIHtcbiAgICBjb25zdCBzdWNjZXNzID0geyByZXNwb25zZToge30gfTtcbiAgICBpZiAocmVxLmluZm8gJiYgcmVxLmluZm8uc2Vzc2lvblRva2VuKSB7XG4gICAgICBjb25zdCByZWNvcmRzID0gYXdhaXQgcmVzdC5maW5kKFxuICAgICAgICByZXEuY29uZmlnLFxuICAgICAgICBBdXRoLm1hc3RlcihyZXEuY29uZmlnKSxcbiAgICAgICAgJ19TZXNzaW9uJyxcbiAgICAgICAgeyBzZXNzaW9uVG9rZW46IHJlcS5pbmZvLnNlc3Npb25Ub2tlbiB9LFxuICAgICAgICB1bmRlZmluZWQsXG4gICAgICAgIHJlcS5pbmZvLmNsaWVudFNESyxcbiAgICAgICAgcmVxLmluZm8uY29udGV4dFxuICAgICAgKTtcbiAgICAgIGlmIChyZWNvcmRzLnJlc3VsdHMgJiYgcmVjb3Jkcy5yZXN1bHRzLmxlbmd0aCkge1xuICAgICAgICBhd2FpdCByZXN0LmRlbChcbiAgICAgICAgICByZXEuY29uZmlnLFxuICAgICAgICAgIEF1dGgubWFzdGVyKHJlcS5jb25maWcpLFxuICAgICAgICAgICdfU2Vzc2lvbicsXG4gICAgICAgICAgcmVjb3Jkcy5yZXN1bHRzWzBdLm9iamVjdElkLFxuICAgICAgICAgIHJlcS5pbmZvLmNvbnRleHRcbiAgICAgICAgKTtcbiAgICAgICAgYXdhaXQgbWF5YmVSdW5UcmlnZ2VyKFxuICAgICAgICAgIFRyaWdnZXJUeXBlcy5hZnRlckxvZ291dCxcbiAgICAgICAgICByZXEuYXV0aCxcbiAgICAgICAgICBQYXJzZS5TZXNzaW9uLmZyb21KU09OKE9iamVjdC5hc3NpZ24oeyBjbGFzc05hbWU6ICdfU2Vzc2lvbicgfSwgcmVjb3Jkcy5yZXN1bHRzWzBdKSksXG4gICAgICAgICAgbnVsbCxcbiAgICAgICAgICByZXEuY29uZmlnXG4gICAgICAgICk7XG4gICAgICB9XG4gICAgfVxuICAgIHJldHVybiBzdWNjZXNzO1xuICB9XG5cbiAgX3Rocm93T25CYWRFbWFpbENvbmZpZyhyZXEpIHtcbiAgICB0cnkge1xuICAgICAgQ29uZmlnLnZhbGlkYXRlRW1haWxDb25maWd1cmF0aW9uKHtcbiAgICAgICAgZW1haWxBZGFwdGVyOiByZXEuY29uZmlnLnVzZXJDb250cm9sbGVyLmFkYXB0ZXIsXG4gICAgICAgIGFwcE5hbWU6IHJlcS5jb25maWcuYXBwTmFtZSxcbiAgICAgICAgcHVibGljU2VydmVyVVJMOiByZXEuY29uZmlnLnB1YmxpY1NlcnZlclVSTCxcbiAgICAgICAgZW1haWxWZXJpZnlUb2tlblZhbGlkaXR5RHVyYXRpb246IHJlcS5jb25maWcuZW1haWxWZXJpZnlUb2tlblZhbGlkaXR5RHVyYXRpb24sXG4gICAgICAgIGVtYWlsVmVyaWZ5VG9rZW5SZXVzZUlmVmFsaWQ6IHJlcS5jb25maWcuZW1haWxWZXJpZnlUb2tlblJldXNlSWZWYWxpZCxcbiAgICAgIH0pO1xuICAgIH0gY2F0Y2ggKGUpIHtcbiAgICAgIGlmICh0eXBlb2YgZSA9PT0gJ3N0cmluZycpIHtcbiAgICAgICAgLy8gTWF5YmUgd2UgbmVlZCBhIEJhZCBDb25maWd1cmF0aW9uIGVycm9yLCBidXQgdGhlIFNES3Mgd29uJ3QgdW5kZXJzdGFuZCBpdC4gRm9yIG5vdywgSW50ZXJuYWwgU2VydmVyIEVycm9yLlxuICAgICAgICB0aHJvdyBuZXcgUGFyc2UuRXJyb3IoXG4gICAgICAgICAgUGFyc2UuRXJyb3IuSU5URVJOQUxfU0VSVkVSX0VSUk9SLFxuICAgICAgICAgICdBbiBhcHBOYW1lLCBwdWJsaWNTZXJ2ZXJVUkwsIGFuZCBlbWFpbEFkYXB0ZXIgYXJlIHJlcXVpcmVkIGZvciBwYXNzd29yZCByZXNldCBhbmQgZW1haWwgdmVyaWZpY2F0aW9uIGZ1bmN0aW9uYWxpdHkuJ1xuICAgICAgICApO1xuICAgICAgfSBlbHNlIHtcbiAgICAgICAgdGhyb3cgZTtcbiAgICAgIH1cbiAgICB9XG4gIH1cblxuICBhc3luYyBoYW5kbGVSZXNldFJlcXVlc3QocmVxKSB7XG4gICAgdGhpcy5fdGhyb3dPbkJhZEVtYWlsQ29uZmlnKHJlcSk7XG5cbiAgICBjb25zdCB7IGVtYWlsIH0gPSByZXEuYm9keTtcbiAgICBpZiAoIWVtYWlsKSB7XG4gICAgICB0aHJvdyBuZXcgUGFyc2UuRXJyb3IoUGFyc2UuRXJyb3IuRU1BSUxfTUlTU0lORywgJ3lvdSBtdXN0IHByb3ZpZGUgYW4gZW1haWwnKTtcbiAgICB9XG4gICAgaWYgKHR5cGVvZiBlbWFpbCAhPT0gJ3N0cmluZycpIHtcbiAgICAgIHRocm93IG5ldyBQYXJzZS5FcnJvcihcbiAgICAgICAgUGFyc2UuRXJyb3IuSU5WQUxJRF9FTUFJTF9BRERSRVNTLFxuICAgICAgICAneW91IG11c3QgcHJvdmlkZSBhIHZhbGlkIGVtYWlsIHN0cmluZydcbiAgICAgICk7XG4gICAgfVxuICAgIGNvbnN0IHVzZXJDb250cm9sbGVyID0gcmVxLmNvbmZpZy51c2VyQ29udHJvbGxlcjtcbiAgICB0cnkge1xuICAgICAgYXdhaXQgdXNlckNvbnRyb2xsZXIuc2VuZFBhc3N3b3JkUmVzZXRFbWFpbChlbWFpbCk7XG4gICAgICByZXR1cm4ge1xuICAgICAgICByZXNwb25zZToge30sXG4gICAgICB9O1xuICAgIH0gY2F0Y2ggKGVycikge1xuICAgICAgaWYgKGVyci5jb2RlID09PSBQYXJzZS5FcnJvci5PQkpFQ1RfTk9UX0ZPVU5EKSB7XG4gICAgICAgIGlmIChyZXEuY29uZmlnLnBhc3N3b3JkUG9saWN5Py5yZXNldFBhc3N3b3JkU3VjY2Vzc09uSW52YWxpZEVtYWlsID8/IHRydWUpIHtcbiAgICAgICAgICByZXR1cm4ge1xuICAgICAgICAgICAgcmVzcG9uc2U6IHt9LFxuICAgICAgICAgIH07XG4gICAgICAgIH1cbiAgICAgICAgZXJyLm1lc3NhZ2UgPSBgQSB1c2VyIHdpdGggdGhhdCBlbWFpbCBkb2VzIG5vdCBleGlzdC5gO1xuICAgICAgfVxuICAgICAgdGhyb3cgZXJyO1xuICAgIH1cbiAgfVxuXG4gIGFzeW5jIGhhbmRsZVZlcmlmaWNhdGlvbkVtYWlsUmVxdWVzdChyZXEpIHtcbiAgICB0aGlzLl90aHJvd09uQmFkRW1haWxDb25maWcocmVxKTtcblxuICAgIGNvbnN0IHsgZW1haWwgfSA9IHJlcS5ib2R5O1xuICAgIGlmICghZW1haWwpIHtcbiAgICAgIHRocm93IG5ldyBQYXJzZS5FcnJvcihQYXJzZS5FcnJvci5FTUFJTF9NSVNTSU5HLCAneW91IG11c3QgcHJvdmlkZSBhbiBlbWFpbCcpO1xuICAgIH1cbiAgICBpZiAodHlwZW9mIGVtYWlsICE9PSAnc3RyaW5nJykge1xuICAgICAgdGhyb3cgbmV3IFBhcnNlLkVycm9yKFxuICAgICAgICBQYXJzZS5FcnJvci5JTlZBTElEX0VNQUlMX0FERFJFU1MsXG4gICAgICAgICd5b3UgbXVzdCBwcm92aWRlIGEgdmFsaWQgZW1haWwgc3RyaW5nJ1xuICAgICAgKTtcbiAgICB9XG5cbiAgICBjb25zdCByZXN1bHRzID0gYXdhaXQgcmVxLmNvbmZpZy5kYXRhYmFzZS5maW5kKCdfVXNlcicsIHsgZW1haWw6IGVtYWlsIH0pO1xuICAgIGlmICghcmVzdWx0cy5sZW5ndGggfHwgcmVzdWx0cy5sZW5ndGggPCAxKSB7XG4gICAgICB0aHJvdyBuZXcgUGFyc2UuRXJyb3IoUGFyc2UuRXJyb3IuRU1BSUxfTk9UX0ZPVU5ELCBgTm8gdXNlciBmb3VuZCB3aXRoIGVtYWlsICR7ZW1haWx9YCk7XG4gICAgfVxuICAgIGNvbnN0IHVzZXIgPSByZXN1bHRzWzBdO1xuXG4gICAgLy8gcmVtb3ZlIHBhc3N3b3JkIGZpZWxkLCBtZXNzZXMgd2l0aCBzYXZpbmcgb24gcG9zdGdyZXNcbiAgICBkZWxldGUgdXNlci5wYXNzd29yZDtcblxuICAgIGlmICh1c2VyLmVtYWlsVmVyaWZpZWQpIHtcbiAgICAgIHRocm93IG5ldyBQYXJzZS5FcnJvcihQYXJzZS5FcnJvci5PVEhFUl9DQVVTRSwgYEVtYWlsICR7ZW1haWx9IGlzIGFscmVhZHkgdmVyaWZpZWQuYCk7XG4gICAgfVxuXG4gICAgY29uc3QgdXNlckNvbnRyb2xsZXIgPSByZXEuY29uZmlnLnVzZXJDb250cm9sbGVyO1xuICAgIGNvbnN0IHNlbmQgPSBhd2FpdCB1c2VyQ29udHJvbGxlci5yZWdlbmVyYXRlRW1haWxWZXJpZnlUb2tlbih1c2VyLCByZXEuYXV0aC5pc01hc3Rlcik7XG4gICAgaWYgKHNlbmQpIHtcbiAgICAgIHVzZXJDb250cm9sbGVyLnNlbmRWZXJpZmljYXRpb25FbWFpbCh1c2VyLCByZXEpO1xuICAgIH1cbiAgICByZXR1cm4geyByZXNwb25zZToge30gfTtcbiAgfVxuXG4gIGFzeW5jIGhhbmRsZUNoYWxsZW5nZShyZXEpIHtcbiAgICBjb25zdCB7IHVzZXJuYW1lLCBlbWFpbCwgcGFzc3dvcmQsIGF1dGhEYXRhLCBjaGFsbGVuZ2VEYXRhIH0gPSByZXEuYm9keTtcblxuICAgIC8vIGlmIHVzZXJuYW1lIG9yIGVtYWlsIHByb3ZpZGVkIHdpdGggcGFzc3dvcmQgdHJ5IHRvIGF1dGhlbnRpY2F0ZSB0aGUgdXNlciBieSB1c2VybmFtZVxuICAgIGxldCB1c2VyO1xuICAgIGlmICh1c2VybmFtZSB8fCBlbWFpbCkge1xuICAgICAgaWYgKCFwYXNzd29yZCkge1xuICAgICAgICB0aHJvdyBuZXcgUGFyc2UuRXJyb3IoXG4gICAgICAgICAgUGFyc2UuRXJyb3IuT1RIRVJfQ0FVU0UsXG4gICAgICAgICAgJ1lvdSBwcm92aWRlZCB1c2VybmFtZSBvciBlbWFpbCwgeW91IG5lZWQgdG8gYWxzbyBwcm92aWRlIHBhc3N3b3JkLidcbiAgICAgICAgKTtcbiAgICAgIH1cbiAgICAgIHVzZXIgPSBhd2FpdCB0aGlzLl9hdXRoZW50aWNhdGVVc2VyRnJvbVJlcXVlc3QocmVxKTtcbiAgICB9XG5cbiAgICBpZiAoIWNoYWxsZW5nZURhdGEpIHtcbiAgICAgIHRocm93IG5ldyBQYXJzZS5FcnJvcihQYXJzZS5FcnJvci5PVEhFUl9DQVVTRSwgJ05vdGhpbmcgdG8gY2hhbGxlbmdlLicpO1xuICAgIH1cblxuICAgIGlmICh0eXBlb2YgY2hhbGxlbmdlRGF0YSAhPT0gJ29iamVjdCcpIHtcbiAgICAgIHRocm93IG5ldyBQYXJzZS5FcnJvcihQYXJzZS5FcnJvci5PVEhFUl9DQVVTRSwgJ2NoYWxsZW5nZURhdGEgc2hvdWxkIGJlIGFuIG9iamVjdC4nKTtcbiAgICB9XG5cbiAgICBsZXQgcmVxdWVzdDtcbiAgICBsZXQgcGFyc2VVc2VyO1xuXG4gICAgLy8gVHJ5IHRvIGZpbmQgdXNlciBieSBhdXRoRGF0YVxuICAgIGlmIChhdXRoRGF0YSkge1xuICAgICAgaWYgKHR5cGVvZiBhdXRoRGF0YSAhPT0gJ29iamVjdCcpIHtcbiAgICAgICAgdGhyb3cgbmV3IFBhcnNlLkVycm9yKFBhcnNlLkVycm9yLk9USEVSX0NBVVNFLCAnYXV0aERhdGEgc2hvdWxkIGJlIGFuIG9iamVjdC4nKTtcbiAgICAgIH1cbiAgICAgIGlmICh1c2VyKSB7XG4gICAgICAgIHRocm93IG5ldyBQYXJzZS5FcnJvcihcbiAgICAgICAgICBQYXJzZS5FcnJvci5PVEhFUl9DQVVTRSxcbiAgICAgICAgICAnWW91IGNhbm5vdCBwcm92aWRlIHVzZXJuYW1lL2VtYWlsIGFuZCBhdXRoRGF0YSwgb25seSB1c2Ugb25lIGlkZW50aWZpY2F0aW9uIG1ldGhvZC4nXG4gICAgICAgICk7XG4gICAgICB9XG5cbiAgICAgIGlmIChPYmplY3Qua2V5cyhhdXRoRGF0YSkuZmlsdGVyKGtleSA9PiBhdXRoRGF0YVtrZXldLmlkKS5sZW5ndGggPiAxKSB7XG4gICAgICAgIHRocm93IG5ldyBQYXJzZS5FcnJvcihcbiAgICAgICAgICBQYXJzZS5FcnJvci5PVEhFUl9DQVVTRSxcbiAgICAgICAgICAnWW91IGNhbm5vdCBwcm92aWRlIG1vcmUgdGhhbiBvbmUgYXV0aERhdGEgcHJvdmlkZXIgd2l0aCBhbiBpZC4nXG4gICAgICAgICk7XG4gICAgICB9XG5cbiAgICAgIGNvbnN0IHJlc3VsdHMgPSBhd2FpdCBBdXRoLmZpbmRVc2Vyc1dpdGhBdXRoRGF0YShyZXEuY29uZmlnLCBhdXRoRGF0YSk7XG5cbiAgICAgIHRyeSB7XG4gICAgICAgIGlmICghcmVzdWx0c1swXSB8fCByZXN1bHRzLmxlbmd0aCA+IDEpIHtcbiAgICAgICAgICB0aHJvdyBuZXcgUGFyc2UuRXJyb3IoUGFyc2UuRXJyb3IuT0JKRUNUX05PVF9GT1VORCwgJ1VzZXIgbm90IGZvdW5kLicpO1xuICAgICAgICB9XG4gICAgICAgIC8vIEZpbmQgdGhlIHByb3ZpZGVyIHVzZWQgdG8gZmluZCB0aGUgdXNlclxuICAgICAgICBjb25zdCBwcm92aWRlciA9IE9iamVjdC5rZXlzKGF1dGhEYXRhKS5maW5kKGtleSA9PiBhdXRoRGF0YVtrZXldLmlkKTtcblxuICAgICAgICBwYXJzZVVzZXIgPSBQYXJzZS5Vc2VyLmZyb21KU09OKHsgY2xhc3NOYW1lOiAnX1VzZXInLCAuLi5yZXN1bHRzWzBdIH0pO1xuICAgICAgICByZXF1ZXN0ID0gZ2V0UmVxdWVzdE9iamVjdCh1bmRlZmluZWQsIHJlcS5hdXRoLCBwYXJzZVVzZXIsIHBhcnNlVXNlciwgcmVxLmNvbmZpZyk7XG4gICAgICAgIHJlcXVlc3QuaXNDaGFsbGVuZ2UgPSB0cnVlO1xuICAgICAgICAvLyBWYWxpZGF0ZSBhdXRoRGF0YSB1c2VkIHRvIGlkZW50aWZ5IHRoZSB1c2VyIHRvIGF2b2lkIGJydXRlLWZvcmNlIGF0dGFjayBvbiBgaWRgXG4gICAgICAgIGNvbnN0IHsgdmFsaWRhdG9yIH0gPSByZXEuY29uZmlnLmF1dGhEYXRhTWFuYWdlci5nZXRWYWxpZGF0b3JGb3JQcm92aWRlcihwcm92aWRlcik7XG4gICAgICAgIGNvbnN0IHZhbGlkYXRvclJlc3BvbnNlID0gYXdhaXQgdmFsaWRhdG9yKGF1dGhEYXRhW3Byb3ZpZGVyXSwgcmVxLCBwYXJzZVVzZXIsIHJlcXVlc3QpO1xuICAgICAgICBpZiAodmFsaWRhdG9yUmVzcG9uc2UgJiYgdmFsaWRhdG9yUmVzcG9uc2UudmFsaWRhdG9yKSB7XG4gICAgICAgICAgYXdhaXQgdmFsaWRhdG9yUmVzcG9uc2UudmFsaWRhdG9yKCk7XG4gICAgICAgIH1cbiAgICAgIH0gY2F0Y2ggKGUpIHtcbiAgICAgICAgLy8gUmV3cml0ZSB0aGUgZXJyb3IgdG8gYXZvaWQgZ3Vlc3MgaWQgYXR0YWNrXG4gICAgICAgIGxvZ2dlci5lcnJvcihlKTtcbiAgICAgICAgdGhyb3cgbmV3IFBhcnNlLkVycm9yKFBhcnNlLkVycm9yLk9CSkVDVF9OT1RfRk9VTkQsICdVc2VyIG5vdCBmb3VuZC4nKTtcbiAgICAgIH1cbiAgICB9XG5cbiAgICBpZiAoIXBhcnNlVXNlcikge1xuICAgICAgcGFyc2VVc2VyID0gdXNlciA/IFBhcnNlLlVzZXIuZnJvbUpTT04oeyBjbGFzc05hbWU6ICdfVXNlcicsIC4uLnVzZXIgfSkgOiB1bmRlZmluZWQ7XG4gICAgfVxuXG4gICAgaWYgKCFyZXF1ZXN0KSB7XG4gICAgICByZXF1ZXN0ID0gZ2V0UmVxdWVzdE9iamVjdCh1bmRlZmluZWQsIHJlcS5hdXRoLCBwYXJzZVVzZXIsIHBhcnNlVXNlciwgcmVxLmNvbmZpZyk7XG4gICAgICByZXF1ZXN0LmlzQ2hhbGxlbmdlID0gdHJ1ZTtcbiAgICB9XG4gICAgY29uc3QgYWNjID0ge307XG4gICAgLy8gRXhlY3V0ZSBjaGFsbGVuZ2Ugc3RlcC1ieS1zdGVwIHdpdGggY29uc2lzdGVudCBvcmRlciBmb3IgYmV0dGVyIGVycm9yIGZlZWRiYWNrXG4gICAgLy8gYW5kIHRvIGF2b2lkIHRvIHRyaWdnZXIgb3RoZXJzIGNoYWxsZW5nZXMgaWYgb25lIG9mIHRoZW0gZmFpbHNcbiAgICBmb3IgKGNvbnN0IHByb3ZpZGVyIG9mIE9iamVjdC5rZXlzKGNoYWxsZW5nZURhdGEpLnNvcnQoKSkge1xuICAgICAgdHJ5IHtcbiAgICAgICAgY29uc3QgYXV0aEFkYXB0ZXIgPSByZXEuY29uZmlnLmF1dGhEYXRhTWFuYWdlci5nZXRWYWxpZGF0b3JGb3JQcm92aWRlcihwcm92aWRlcik7XG4gICAgICAgIGlmICghYXV0aEFkYXB0ZXIpIHtcbiAgICAgICAgICBjb250aW51ZTtcbiAgICAgICAgfVxuICAgICAgICBjb25zdCB7XG4gICAgICAgICAgYWRhcHRlcjogeyBjaGFsbGVuZ2UgfSxcbiAgICAgICAgfSA9IGF1dGhBZGFwdGVyO1xuICAgICAgICBpZiAodHlwZW9mIGNoYWxsZW5nZSA9PT0gJ2Z1bmN0aW9uJykge1xuICAgICAgICAgIGNvbnN0IHByb3ZpZGVyQ2hhbGxlbmdlUmVzcG9uc2UgPSBhd2FpdCBjaGFsbGVuZ2UoXG4gICAgICAgICAgICBjaGFsbGVuZ2VEYXRhW3Byb3ZpZGVyXSxcbiAgICAgICAgICAgIGF1dGhEYXRhICYmIGF1dGhEYXRhW3Byb3ZpZGVyXSxcbiAgICAgICAgICAgIHJlcS5jb25maWcuYXV0aFtwcm92aWRlcl0sXG4gICAgICAgICAgICByZXF1ZXN0XG4gICAgICAgICAgKTtcbiAgICAgICAgICBhY2NbcHJvdmlkZXJdID0gcHJvdmlkZXJDaGFsbGVuZ2VSZXNwb25zZSB8fCB0cnVlO1xuICAgICAgICB9XG4gICAgICB9IGNhdGNoIChlcnIpIHtcbiAgICAgICAgY29uc3QgZSA9IHJlc29sdmVFcnJvcihlcnIsIHtcbiAgICAgICAgICBjb2RlOiBQYXJzZS5FcnJvci5TQ1JJUFRfRkFJTEVELFxuICAgICAgICAgIG1lc3NhZ2U6ICdDaGFsbGVuZ2UgZmFpbGVkLiBVbmtub3duIGVycm9yLicsXG4gICAgICAgIH0pO1xuICAgICAgICBjb25zdCB1c2VyU3RyaW5nID0gcmVxLmF1dGggJiYgcmVxLmF1dGgudXNlciA/IHJlcS5hdXRoLnVzZXIuaWQgOiB1bmRlZmluZWQ7XG4gICAgICAgIGxvZ2dlci5lcnJvcihcbiAgICAgICAgICBgRmFpbGVkIHJ1bm5pbmcgYXV0aCBzdGVwIGNoYWxsZW5nZSBmb3IgJHtwcm92aWRlcn0gZm9yIHVzZXIgJHt1c2VyU3RyaW5nfSB3aXRoIEVycm9yOiBgICtcbiAgICAgICAgICAgIEpTT04uc3RyaW5naWZ5KGUpLFxuICAgICAgICAgIHtcbiAgICAgICAgICAgIGF1dGhlbnRpY2F0aW9uU3RlcDogJ2NoYWxsZW5nZScsXG4gICAgICAgICAgICBlcnJvcjogZSxcbiAgICAgICAgICAgIHVzZXI6IHVzZXJTdHJpbmcsXG4gICAgICAgICAgICBwcm92aWRlcixcbiAgICAgICAgICB9XG4gICAgICAgICk7XG4gICAgICAgIHRocm93IGU7XG4gICAgICB9XG4gICAgfVxuICAgIHJldHVybiB7IHJlc3BvbnNlOiB7IGNoYWxsZW5nZURhdGE6IGFjYyB9IH07XG4gIH1cblxuICBtb3VudFJvdXRlcygpIHtcbiAgICB0aGlzLnJvdXRlKCdHRVQnLCAnL3VzZXJzJywgcmVxID0+IHtcbiAgICAgIHJldHVybiB0aGlzLmhhbmRsZUZpbmQocmVxKTtcbiAgICB9KTtcbiAgICB0aGlzLnJvdXRlKCdQT1NUJywgJy91c2VycycsIHByb21pc2VFbnN1cmVJZGVtcG90ZW5jeSwgcmVxID0+IHtcbiAgICAgIHJldHVybiB0aGlzLmhhbmRsZUNyZWF0ZShyZXEpO1xuICAgIH0pO1xuICAgIHRoaXMucm91dGUoJ0dFVCcsICcvdXNlcnMvbWUnLCByZXEgPT4ge1xuICAgICAgcmV0dXJuIHRoaXMuaGFuZGxlTWUocmVxKTtcbiAgICB9KTtcbiAgICB0aGlzLnJvdXRlKCdHRVQnLCAnL3VzZXJzLzpvYmplY3RJZCcsIHJlcSA9PiB7XG4gICAgICByZXR1cm4gdGhpcy5oYW5kbGVHZXQocmVxKTtcbiAgICB9KTtcbiAgICB0aGlzLnJvdXRlKCdQVVQnLCAnL3VzZXJzLzpvYmplY3RJZCcsIHByb21pc2VFbnN1cmVJZGVtcG90ZW5jeSwgcmVxID0+IHtcbiAgICAgIHJldHVybiB0aGlzLmhhbmRsZVVwZGF0ZShyZXEpO1xuICAgIH0pO1xuICAgIHRoaXMucm91dGUoJ0RFTEVURScsICcvdXNlcnMvOm9iamVjdElkJywgcmVxID0+IHtcbiAgICAgIHJldHVybiB0aGlzLmhhbmRsZURlbGV0ZShyZXEpO1xuICAgIH0pO1xuICAgIHRoaXMucm91dGUoJ0dFVCcsICcvbG9naW4nLCByZXEgPT4ge1xuICAgICAgcmV0dXJuIHRoaXMuaGFuZGxlTG9nSW4ocmVxKTtcbiAgICB9KTtcbiAgICB0aGlzLnJvdXRlKCdQT1NUJywgJy9sb2dpbicsIHJlcSA9PiB7XG4gICAgICByZXR1cm4gdGhpcy5oYW5kbGVMb2dJbihyZXEpO1xuICAgIH0pO1xuICAgIHRoaXMucm91dGUoJ1BPU1QnLCAnL2xvZ2luQXMnLCByZXEgPT4ge1xuICAgICAgcmV0dXJuIHRoaXMuaGFuZGxlTG9nSW5BcyhyZXEpO1xuICAgIH0pO1xuICAgIHRoaXMucm91dGUoJ1BPU1QnLCAnL2xvZ291dCcsIHJlcSA9PiB7XG4gICAgICByZXR1cm4gdGhpcy5oYW5kbGVMb2dPdXQocmVxKTtcbiAgICB9KTtcbiAgICB0aGlzLnJvdXRlKCdQT1NUJywgJy9yZXF1ZXN0UGFzc3dvcmRSZXNldCcsIHJlcSA9PiB7XG4gICAgICByZXR1cm4gdGhpcy5oYW5kbGVSZXNldFJlcXVlc3QocmVxKTtcbiAgICB9KTtcbiAgICB0aGlzLnJvdXRlKCdQT1NUJywgJy92ZXJpZmljYXRpb25FbWFpbFJlcXVlc3QnLCByZXEgPT4ge1xuICAgICAgcmV0dXJuIHRoaXMuaGFuZGxlVmVyaWZpY2F0aW9uRW1haWxSZXF1ZXN0KHJlcSk7XG4gICAgfSk7XG4gICAgdGhpcy5yb3V0ZSgnR0VUJywgJy92ZXJpZnlQYXNzd29yZCcsIHJlcSA9PiB7XG4gICAgICByZXR1cm4gdGhpcy5oYW5kbGVWZXJpZnlQYXNzd29yZChyZXEpO1xuICAgIH0pO1xuICAgIHRoaXMucm91dGUoJ1BPU1QnLCAnL2NoYWxsZW5nZScsIHJlcSA9PiB7XG4gICAgICByZXR1cm4gdGhpcy5oYW5kbGVDaGFsbGVuZ2UocmVxKTtcbiAgICB9KTtcbiAgfVxufVxuXG5leHBvcnQgZGVmYXVsdCBVc2Vyc1JvdXRlcjtcbiJdLCJtYXBwaW5ncyI6Ijs7Ozs7O0FBRUEsSUFBQUEsS0FBQSxHQUFBQyxzQkFBQSxDQUFBQyxPQUFBO0FBQ0EsSUFBQUMsT0FBQSxHQUFBRixzQkFBQSxDQUFBQyxPQUFBO0FBQ0EsSUFBQUUsZUFBQSxHQUFBSCxzQkFBQSxDQUFBQyxPQUFBO0FBQ0EsSUFBQUcsY0FBQSxHQUFBSixzQkFBQSxDQUFBQyxPQUFBO0FBQ0EsSUFBQUksS0FBQSxHQUFBTCxzQkFBQSxDQUFBQyxPQUFBO0FBQ0EsSUFBQUssS0FBQSxHQUFBTixzQkFBQSxDQUFBQyxPQUFBO0FBQ0EsSUFBQU0sU0FBQSxHQUFBUCxzQkFBQSxDQUFBQyxPQUFBO0FBQ0EsSUFBQU8s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