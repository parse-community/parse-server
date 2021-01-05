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

function _interopRequireDefault(obj) { return obj && obj.__esModule ? obj : { default: obj }; }

function ownKeys(object, enumerableOnly) { var keys = Object.keys(object); if (Object.getOwnPropertySymbols) { var symbols = Object.getOwnPropertySymbols(object); if (enumerableOnly) symbols = symbols.filter(function (sym) { return Object.getOwnPropertyDescriptor(object, sym).enumerable; }); keys.push.apply(keys, symbols); } return keys; }

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
    const authData = req.body && req.body.authData; // Check if user has provided his required auth providers

    _Auth.default.checkIfUserHasProvidedConfiguredProvidersForLogin(authData, user.authData, req.config);

    let authDataResponse;
    let validatedAuthData;

    if (authData) {
      const res = await _Auth.default.handleAuthDataValidation(authData, req, user);
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
    }, user)), null, req.config); // If we have some new validated authData
    // update directly

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
    } = _Auth.default.createSession(req.config, {
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
    } = req.body; // if username or email provided with password try to find the user with default
    // system

    let user;

    if (username || email) {
      if (!password) throw new _node.default.Error(_node.default.Error.OTHER_CAUSE, 'You provided username or email, you need to also provide password.');
      user = await this._authenticateUserFromRequest(req);
    }

    if (!challengeData) throw new _node.default.Error(_node.default.Error.OTHER_CAUSE, 'Nothing to challenge.');
    if (typeof challengeData !== 'object') throw new _node.default.Error(_node.default.Error.OTHER_CAUSE, 'challengeData should be an object.'); // Try to find user by authData

    if (authData) {
      if (typeof authData !== 'object') throw new _node.default.Error(_node.default.Error.OTHER_CAUSE, 'authData should be an object.'); // To avoid security issue we should only support one identifying method

      if (user) throw new _node.default.Error(_node.default.Error.OTHER_CAUSE, 'You cant provide username/email and authData, only use one identification method.');
      const results = await _Auth.default.findUsersWithAuthData(req.config, authData);

      if (results.length > 1) {
        throw new _node.default.Error(_node.default.Error.OTHER_CAUSE, 'You cant provide more than one authData provider with an id.');
      }

      if (!results[0]) throw new _node.default.Error(_node.default.Error.OTHER_CAUSE, 'User not found.');
      user = results[0];
    } // Execute challenge step by step
    // with consistent order


    const challenge = await _Auth.default.reducePromise(Object.keys(challengeData).sort(), async (acc, provider) => {
      const challengeHandler = req.config.authDataManager.getValidatorForProvider(provider).adapter.challenge;

      if (typeof challengeHandler === 'function') {
        acc[provider] = (await challengeHandler(challengeData[provider], authData && authData[provider], user ? _node.default.User.fromJSON(_objectSpread({
          className: '_User'
        }, user)) : undefined, req, req.config.auth[provider])) || true;
        return acc;
      }
    }, {});
    return {
      response: Object.keys(challenge).length ? {
        challengeData: challenge
      } : undefined
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
//# sourceMappingURL=data:application/json;charset=utf-8;base64,eyJ2ZXJzaW9uIjozLCJzb3VyY2VzIjpbIi4uLy4uL3NyYy9Sb3V0ZXJzL1VzZXJzUm91dGVyLmpzIl0sIm5hbWVzIjpbIlVzZXJzUm91dGVyIiwiQ2xhc3Nlc1JvdXRlciIsImNsYXNzTmFtZSIsInJlbW92ZUhpZGRlblByb3BlcnRpZXMiLCJvYmoiLCJrZXkiLCJPYmplY3QiLCJwcm90b3R5cGUiLCJoYXNPd25Qcm9wZXJ0eSIsImNhbGwiLCJ0ZXN0IiwiX2F1dGhlbnRpY2F0ZVVzZXJGcm9tUmVxdWVzdCIsInJlcSIsIlByb21pc2UiLCJyZXNvbHZlIiwicmVqZWN0IiwicGF5bG9hZCIsImJvZHkiLCJ1c2VybmFtZSIsInF1ZXJ5IiwiZW1haWwiLCJwYXNzd29yZCIsIlBhcnNlIiwiRXJyb3IiLCJVU0VSTkFNRV9NSVNTSU5HIiwiUEFTU1dPUkRfTUlTU0lORyIsIk9CSkVDVF9OT1RfRk9VTkQiLCJ1c2VyIiwiaXNWYWxpZFBhc3N3b3JkIiwiJG9yIiwiY29uZmlnIiwiZGF0YWJhc2UiLCJmaW5kIiwidGhlbiIsInJlc3VsdHMiLCJsZW5ndGgiLCJsb2dnZXJDb250cm9sbGVyIiwid2FybiIsImZpbHRlciIsInBhc3N3b3JkQ3J5cHRvIiwiY29tcGFyZSIsImNvcnJlY3QiLCJhY2NvdW50TG9ja291dFBvbGljeSIsIkFjY291bnRMb2Nrb3V0IiwiaGFuZGxlTG9naW5BdHRlbXB0IiwiYXV0aCIsImlzTWFzdGVyIiwiQUNMIiwia2V5cyIsInZlcmlmeVVzZXJFbWFpbHMiLCJwcmV2ZW50TG9naW5XaXRoVW52ZXJpZmllZEVtYWlsIiwiZW1haWxWZXJpZmllZCIsIkVNQUlMX05PVF9GT1VORCIsImF1dGhEYXRhIiwiZm9yRWFjaCIsInByb3ZpZGVyIiwiY2F0Y2giLCJlcnJvciIsImhhbmRsZU1lIiwiaW5mbyIsInNlc3Npb25Ub2tlbiIsIklOVkFMSURfU0VTU0lPTl9UT0tFTiIsInJlc3QiLCJBdXRoIiwibWFzdGVyIiwiaW5jbHVkZSIsImNsaWVudFNESyIsImNvbnRleHQiLCJyZXNwb25zZSIsImhhbmRsZUxvZ0luIiwiY2hlY2tJZlVzZXJIYXNQcm92aWRlZENvbmZpZ3VyZWRQcm92aWRlcnNGb3JMb2dpbiIsImF1dGhEYXRhUmVzcG9uc2UiLCJ2YWxpZGF0ZWRBdXRoRGF0YSIsInJlcyIsImhhbmRsZUF1dGhEYXRhVmFsaWRhdGlvbiIsInBhc3N3b3JkUG9saWN5IiwibWF4UGFzc3dvcmRBZ2UiLCJjaGFuZ2VkQXQiLCJfcGFzc3dvcmRfY2hhbmdlZF9hdCIsIkRhdGUiLCJ1cGRhdGUiLCJfZW5jb2RlIiwiX190eXBlIiwiaXNvIiwiZXhwaXJlc0F0IiwiZ2V0VGltZSIsImZpbGVzQ29udHJvbGxlciIsImV4cGFuZEZpbGVzSW5PYmplY3QiLCJUcmlnZ2VyVHlwZXMiLCJiZWZvcmVMb2dpbiIsIlVzZXIiLCJmcm9tSlNPTiIsImFzc2lnbiIsIm9iamVjdElkIiwic2Vzc2lvbkRhdGEiLCJjcmVhdGVTZXNzaW9uIiwidXNlcklkIiwiY3JlYXRlZFdpdGgiLCJhY3Rpb24iLCJhdXRoUHJvdmlkZXIiLCJpbnN0YWxsYXRpb25JZCIsImFmdGVyTG9naW5Vc2VyIiwiYWZ0ZXJMb2dpbiIsImhhbmRsZVZlcmlmeVBhc3N3b3JkIiwiaGFuZGxlTG9nT3V0Iiwic3VjY2VzcyIsInVuZGVmaW5lZCIsInJlY29yZHMiLCJkZWwiLCJfcnVuQWZ0ZXJMb2dvdXRUcmlnZ2VyIiwic2Vzc2lvbiIsImFmdGVyTG9nb3V0IiwiU2Vzc2lvbiIsIl90aHJvd09uQmFkRW1haWxDb25maWciLCJDb25maWciLCJ2YWxpZGF0ZUVtYWlsQ29uZmlndXJhdGlvbiIsImVtYWlsQWRhcHRlciIsInVzZXJDb250cm9sbGVyIiwiYWRhcHRlciIsImFwcE5hbWUiLCJwdWJsaWNTZXJ2ZXJVUkwiLCJlbWFpbFZlcmlmeVRva2VuVmFsaWRpdHlEdXJhdGlvbiIsImVtYWlsVmVyaWZ5VG9rZW5SZXVzZUlmVmFsaWQiLCJlIiwiSU5URVJOQUxfU0VSVkVSX0VSUk9SIiwiaGFuZGxlUmVzZXRSZXF1ZXN0IiwiRU1BSUxfTUlTU0lORyIsIklOVkFMSURfRU1BSUxfQUREUkVTUyIsInNlbmRQYXNzd29yZFJlc2V0RW1haWwiLCJlcnIiLCJjb2RlIiwiaGFuZGxlVmVyaWZpY2F0aW9uRW1haWxSZXF1ZXN0IiwiT1RIRVJfQ0FVU0UiLCJyZWdlbmVyYXRlRW1haWxWZXJpZnlUb2tlbiIsInNlbmRWZXJpZmljYXRpb25FbWFpbCIsImhhbmRsZUNoYWxsZW5nZSIsImNoYWxsZW5nZURhdGEiLCJmaW5kVXNlcnNXaXRoQXV0aERhdGEiLCJjaGFsbGVuZ2UiLCJyZWR1Y2VQcm9taXNlIiwic29ydCIsImFjYyIsImNoYWxsZW5nZUhhbmRsZXIiLCJhdXRoRGF0YU1hbmFnZXIiLCJnZXRWYWxpZGF0b3JGb3JQcm92aWRlciIsIm1vdW50Um91dGVzIiwicm91dGUiLCJoYW5kbGVGaW5kIiwicHJvbWlzZUVuc3VyZUlkZW1wb3RlbmN5IiwiaGFuZGxlQ3JlYXRlIiwiaGFuZGxlR2V0IiwiaGFuZGxlVXBkYXRlIiwiaGFuZGxlRGVsZXRlIl0sIm1hcHBpbmdzIjoiOzs7Ozs7O0FBRUE7O0FBQ0E7O0FBQ0E7O0FBQ0E7O0FBQ0E7O0FBQ0E7O0FBQ0E7O0FBQ0E7O0FBQ0E7Ozs7Ozs7Ozs7QUFFTyxNQUFNQSxXQUFOLFNBQTBCQyxzQkFBMUIsQ0FBd0M7QUFDN0NDLEVBQUFBLFNBQVMsR0FBRztBQUNWLFdBQU8sT0FBUDtBQUNEO0FBRUQ7Ozs7OztBQUlBLFNBQU9DLHNCQUFQLENBQThCQyxHQUE5QixFQUFtQztBQUNqQyxTQUFLLElBQUlDLEdBQVQsSUFBZ0JELEdBQWhCLEVBQXFCO0FBQ25CLFVBQUlFLE1BQU0sQ0FBQ0MsU0FBUCxDQUFpQkMsY0FBakIsQ0FBZ0NDLElBQWhDLENBQXFDTCxHQUFyQyxFQUEwQ0MsR0FBMUMsQ0FBSixFQUFvRDtBQUNsRDtBQUNBLFlBQUlBLEdBQUcsS0FBSyxRQUFSLElBQW9CLENBQUMsMEJBQTBCSyxJQUExQixDQUErQkwsR0FBL0IsQ0FBekIsRUFBOEQ7QUFDNUQsaUJBQU9ELEdBQUcsQ0FBQ0MsR0FBRCxDQUFWO0FB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QUcsSUFBSTtBQUN0QyxhQUFPLEtBQUsySCxlQUFMLENBQXFCM0gsR0FBckIsQ0FBUDtBQUNELEtBRkQ7QUFHRDs7QUFqZ0I0Qzs7O2VBb2dCaENaLFciLCJzb3VyY2VzQ29udGVudCI6WyIvLyBUaGVzZSBtZXRob2RzIGhhbmRsZSB0aGUgVXNlci1yZWxhdGVkIHJvdXRlcy5cblxuaW1wb3J0IFBhcnNlIGZyb20gJ3BhcnNlL25vZGUnO1xuaW1wb3J0IENvbmZpZyBmcm9tICcuLi9Db25maWcnO1xuaW1wb3J0IEFjY291bnRMb2Nrb3V0IGZyb20gJy4uL0FjY291bnRMb2Nrb3V0JztcbmltcG9ydCBDbGFzc2VzUm91dGVyIGZyb20gJy4vQ2xhc3Nlc1JvdXRlcic7XG5pbXBvcnQgcmVzdCBmcm9tICcuLi9yZXN0JztcbmltcG9ydCBBdXRoIGZyb20gJy4uL0F1dGgnO1xuaW1wb3J0IHBhc3N3b3JkQ3J5cHRvIGZyb20gJy4uL3Bhc3N3b3JkJztcbmltcG9ydCB7IG1heWJlUnVuVHJpZ2dlciwgVHlwZXMgYXMgVHJpZ2dlclR5cGVzIH0gZnJvbSAnLi4vdHJpZ2dlcnMnO1xuaW1wb3J0IHsgcHJvbWlzZUVuc3VyZUlkZW1wb3RlbmN5IH0gZnJvbSAnLi4vbWlkZGxld2FyZXMnO1xuXG5leHBvcnQgY2xhc3MgVXNlcnNSb3V0ZXIgZXh0ZW5kcyBDbGFzc2VzUm91dGVyIHtcbiAgY2xhc3NOYW1lKCkge1xuICAgIHJldHVybiAnX1VzZXInO1xuICB9XG5cbiAgLyoqXG4gICAqIFJlbW92ZXMgYWxsIFwiX1wiIHByZWZpeGVkIHByb3BlcnRpZXMgZnJvbSBhbiBvYmplY3QsIGV4Y2VwdCBcIl9fdHlwZVwiXG4gICAqIEBwYXJhbSB7T2JqZWN0fSBvYmogQW4gb2JqZWN0LlxuICAgKi9cbiAgc3RhdGljIHJlbW92ZUhpZGRlblByb3BlcnRpZXMob2JqKSB7XG4gICAgZm9yICh2YXIga2V5IGluIG9iaikge1xuICAgICAgaWYgKE9iamVjdC5wcm90b3R5cGUuaGFzT3duUHJvcGVydHkuY2FsbChvYmosIGtleSkpIHtcbiAgICAgICAgLy8gUmVnZXhwIGNvbWVzIGZyb20gUGFyc2UuT2JqZWN0LnByb3RvdHlwZS52YWxpZGF0ZVxuICAgICAgICBpZiAoa2V5ICE9PSAnX190eXBlJyAmJiAhL15bQS1aYS16XVswLTlBLVphLXpfXSokLy50ZXN0KGtleSkpIHtcbiAgICAgICAgICBkZWxldGUgb2JqW2tleV07XG4gICAgICAgIH1cbiAgICAgIH1cbiAgICB9XG4gIH1cblxuICAvKipcbiAgICogVmFsaWRhdGVzIGEgcGFzc3dvcmQgcmVxdWVzdCBpbiBsb2dpbiBhbmQgdmVyaWZ5UGFzc3dvcmRcbiAgICogQHBhcmFtIHtPYmplY3R9IHJlcSBUaGUgcmVxdWVzdFxuICAgKiBAcmV0dXJucyB7T2JqZWN0fSBVc2VyIG9iamVjdFxuICAgKiBAcHJpdmF0ZVxuICAgKi9cbiAgX2F1dGhlbnRpY2F0ZVVzZXJGcm9tUmVxdWVzdChyZXEpIHtcbiAgICByZXR1cm4gbmV3IFByb21pc2UoKHJlc29sdmUsIHJlamVjdCkgPT4ge1xuICAgICAgLy8gVXNlIHF1ZXJ5IHBhcmFtZXRlcnMgaW5zdGVhZCBpZiBwcm92aWRlZCBpbiB1cmxcbiAgICAgIGxldCBwYXlsb2FkID0gcmVxLmJvZHk7XG4gICAgICBpZiAoXG4gICAgICAgICghcGF5bG9hZC51c2VybmFtZSAmJiByZXEucXVlcnkgJiYgcmVxLnF1ZXJ5LnVzZXJuYW1lKSB8fFxuICAgICAgICAoIXBheWxvYWQuZW1haWwgJiYgcmVxLnF1ZXJ5ICYmIHJlcS5xdWVyeS5lbWFpbClcbiAgICAgICkge1xuICAgICAgICBwYXlsb2FkID0gcmVxLnF1ZXJ5O1xuICAgICAgfVxuICAgICAgY29uc3QgeyB1c2VybmFtZSwgZW1haWwsIHBhc3N3b3JkIH0gPSBwYXlsb2FkO1xuXG4gICAgICAvLyBUT0RPOiB1c2UgdGhlIHJpZ2h0IGVycm9yIGNvZGVzIC8gZGVzY3JpcHRpb25zLlxuICAgICAgaWYgKCF1c2VybmFtZSAmJiAhZW1haWwpIHtcbiAgICAgICAgdGhyb3cgbmV3IFBhcnNlLkVycm9yKFBhcnNlLkVycm9yLlVTRVJOQU1FX01JU1NJTkcsICd1c2VybmFtZS9lbWFpbCBpcyByZXF1aXJlZC4nKTtcbiAgICAgIH1cbiAgICAgIGlmICghcGFzc3dvcmQpIHtcbiAgICAgICAgdGhyb3cgbmV3IFBhcnNlLkVycm9yKFBhcnNlLkVycm9yLlBBU1NXT1JEX01JU1NJTkcsICdwYXNzd29yZCBpcyByZXF1aXJlZC4nKTtcbiAgICAgIH1cbiAgICAgIGlmIChcbiAgICAgICAgdHlwZW9mIHBhc3N3b3JkICE9PSAnc3RyaW5nJyB8fFxuICAgICAgICAoZW1haWwgJiYgdHlwZW9mIGVtYWlsICE9PSAnc3RyaW5nJykgfHxcbiAgICAgICAgKHVzZXJuYW1lICYmIHR5cGVvZiB1c2VybmFtZSAhPT0gJ3N0cmluZycpXG4gICAgICApIHtcbiAgICAgICAgdGhyb3cgbmV3IFBhcnNlLkVycm9yKFBhcnNlLkVycm9yLk9CSkVDVF9OT1RfRk9VTkQsICdJbnZhbGlkIHVzZXJuYW1lL3Bhc3N3b3JkLicpO1xuICAgICAgfVxuXG4gICAgICBsZXQgdXNlcjtcbiAgICAgIGxldCBpc1ZhbGlkUGFzc3dvcmQgPSBmYWxzZTtcbiAgICAgIGxldCBxdWVyeTtcbiAgICAgIGlmIChlbWFpbCAmJiB1c2VybmFtZSkge1xuICAgICAgICBxdWVyeSA9IHsgZW1haWwsIHVzZXJuYW1lIH07XG4gICAgICB9IGVsc2UgaWYgKGVtYWlsKSB7XG4gICAgICAgIHF1ZXJ5ID0geyBlbWFpbCB9O1xuICAgICAgfSBlbHNlIHtcbiAgICAgICAgcXVlcnkgPSB7ICRvcjogW3sgdXNlcm5hbWUgfSwgeyBlbWFpbDogdXNlcm5hbWUgfV0gfTtcbiAgICAgIH1cbiAgICAgIHJldHVybiByZXEuY29uZmlnLmRhdGFiYXNlXG4gICAgICAgIC5maW5kKCdfVXNlcicsIHF1ZXJ5KVxuICAgICAgICAudGhlbihyZXN1bHRzID0+IHtcbiAgICAgICAgICBpZiAoIXJlc3VsdHMubGVuZ3RoKSB7XG4gICAgICAgICAgICB0aHJvdyBuZXcgUGFyc2UuRXJyb3IoUGFyc2UuRXJyb3IuT0JKRUNUX05PVF9GT1VORCwgJ0ludmFsaWQgdXNlcm5hbWUvcGFzc3dvcmQuJyk7XG4gICAgICAgICAgfVxuXG4gICAgICAgICAgaWYgKHJlc3VsdHMubGVuZ3RoID4gMSkge1xuICAgICAgICAgICAgLy8gY29ybmVyIGNhc2Ugd2hlcmUgdXNlcjEgaGFzIHVzZXJuYW1lID09IHVzZXIyIGVtYWlsXG4gICAgICAgICAgICByZXEuY29uZmlnLmxvZ2dlckNvbnRyb2xsZXIud2FybihcbiAgICAgICAgICAgICAgXCJUaGVyZSBpcyBhIHVzZXIgd2hpY2ggZW1haWwgaXMgdGhlIHNhbWUgYXMgYW5vdGhlciB1c2VyJ3MgdXNlcm5hbWUsIGxvZ2dpbmcgaW4gYmFzZWQgb24gdXNlcm5hbWVcIlxuICAgICAgICAgICAgKTtcbiAgICAgICAgICAgIHVzZXIgPSByZXN1bHRzLmZpbHRlcih1c2VyID0+IHVzZXIudXNlcm5hbWUgPT09IHVzZXJuYW1lKVswXTtcbiAgICAgICAgICB9IGVsc2Uge1xuICAgICAgICAgICAgdXNlciA9IHJlc3VsdHNbMF07XG4gICAgICAgICAgfVxuXG4gICAgICAgICAgcmV0dXJuIHBhc3N3b3JkQ3J5cHRvLmNvbXBhcmUocGFzc3dvcmQsIHVzZXIucGFzc3dvcmQpO1xuICAgICAgICB9KVxuICAgICAgICAudGhlbihjb3JyZWN0ID0+IHtcbiAgICAgICAgICBpc1ZhbGlkUGFzc3dvcmQgPSBjb3JyZWN0O1xuICAgICAgICAgIGNvbnN0IGFjY291bnRMb2Nrb3V0UG9saWN5ID0gbmV3IEFjY291bnRMb2Nrb3V0KHVzZXIsIHJlcS5jb25maWcpO1xuICAgICAgICAgIHJldHVybiBhY2NvdW50TG9ja291dFBvbGljeS5oYW5kbGVMb2dpbkF0dGVtcHQoaXNWYWxpZFBhc3N3b3JkKTtcbiAgICAgICAgfSlcbiAgICAgICAgLnRoZW4oKCkgPT4ge1xuICAgICAgICAgIGlmICghaXNWYWxpZFBhc3N3b3JkKSB7XG4gICAgICAgICAgICB0aHJvdyBuZXcgUGFyc2UuRXJyb3IoUGFyc2UuRXJyb3IuT0JKRUNUX05PVF9GT1VORCwgJ0ludmFsaWQgdXNlcm5hbWUvcGFzc3dvcmQuJyk7XG4gICAgICAgICAgfVxuICAgICAgICAgIC8vIEVuc3VyZSB0aGUgdXNlciBpc24ndCBsb2NrZWQgb3V0XG4gICAgICAgICAgLy8gQSBsb2NrZWQgb3V0IHVzZXIgd29uJ3QgYmUgYWJsZSB0byBsb2dpblxuICAgICAgICAgIC8vIFRvIGxvY2sgYSB1c2VyIG91dCwganVzdCBzZXQgdGhlIEFDTCB0byBgbWFzdGVyS2V5YCBvbmx5ICAoe30pLlxuICAgICAgICAgIC8vIEVtcHR5IEFDTCBpcyBPS1xuICAgICAgICAgIGlmICghcmVxLmF1dGguaXNNYXN0ZXIgJiYgdXNlci5BQ0wgJiYgT2JqZWN0LmtleXModXNlci5BQ0wpLmxlbmd0aCA9PSAwKSB7XG4gICAgICAgICAgICB0aHJvdyBuZXcgUGFyc2UuRXJyb3IoUGFyc2UuRXJyb3IuT0JKRUNUX05PVF9GT1VORCwgJ0ludmFsaWQgdXNlcm5hbWUvcGFzc3dvcmQuJyk7XG4gICAgICAgICAgfVxuICAgICAgICAgIGlmIChcbiAgICAgICAgICAgIHJlcS5jb25maWcudmVyaWZ5VXNlckVtYWlscyAmJlxuICAgICAgICAgICAgcmVxLmNvbmZpZy5wcmV2ZW50TG9naW5XaXRoVW52ZXJpZmllZEVtYWlsICYmXG4gICAgICAgICAgICAhdXNlci5lbWFpbFZlcmlmaWVkXG4gICAgICAgICAgKSB7XG4gICAgICAgICAgICB0aHJvdyBuZXcgUGFyc2UuRXJyb3IoUGFyc2UuRXJyb3IuRU1BSUxfTk9UX0ZPVU5ELCAnVXNlciBlbWFpbCBpcyBub3QgdmVyaWZpZWQuJyk7XG4gICAgICAgICAgfVxuXG4gICAgICAgICAgZGVsZXRlIHVzZXIucGFzc3dvcmQ7XG5cbiAgICAgICAgICAvLyBTb21ldGltZXMgdGhlIGF1dGhEYXRhIHN0aWxsIGhhcyBudWxsIG9uIHRoYXQga2V5c1xuICAgICAgICAgIC8vIGh0dHBzOi8vZ2l0aHViLmNvbS9wYXJzZS1jb21tdW5pdHkvcGFyc2Utc2VydmVyL2lzc3Vlcy85MzVcbiAgICAgICAgICBpZiAodXNlci5hdXRoRGF0YSkge1xuICAgICAgICAgICAgT2JqZWN0LmtleXModXNlci5hdXRoRGF0YSkuZm9yRWFjaChwcm92aWRlciA9PiB7XG4gICAgICAgICAgICAgIGlmICh1c2VyLmF1dGhEYXRhW3Byb3ZpZGVyXSA9PT0gbnVsbCkge1xuICAgICAgICAgICAgICAgIGRlbGV0ZSB1c2VyLmF1dGhEYXRhW3Byb3ZpZGVyXTtcbiAgICAgICAgICAgICAgfVxuICAgICAgICAgICAgfSk7XG4gICAgICAgICAgICBpZiAoT2JqZWN0LmtleXModXNlci5hdXRoRGF0YSkubGVuZ3RoID09IDApIHtcbiAgICAgICAgICAgICAgZGVsZXRlIHVzZXIuYXV0aERhdGE7XG4gICAgICAgICAgICB9XG4gICAgICAgICAgfVxuXG4gICAgICAgICAgcmV0dXJuIHJlc29sdmUodXNlcik7XG4gICAgICAgIH0pXG4gICAgICAgIC5jYXRjaChlcnJvciA9PiB7XG4gICAgICAgICAgcmV0dXJuIHJlamVjdChlcnJvcik7XG4gICAgICAgIH0pO1xuICAgIH0pO1xuICB9XG5cbiAgaGFuZGxlTWUocmVxKSB7XG4gICAgaWYgKCFyZXEuaW5mbyB8fCAhcmVxLmluZm8uc2Vzc2lvblRva2VuKSB7XG4gICAgICB0aHJvdyBuZXcgUGFyc2UuRXJyb3IoUGFyc2UuRXJyb3IuSU5WQUxJRF9TRVNTSU9OX1RPS0VOLCAnSW52YWxpZCBzZXNzaW9uIHRva2VuJyk7XG4gICAgfVxuICAgIGNvbnN0IHNlc3Npb25Ub2tlbiA9IHJlcS5pbmZvLnNlc3Npb25Ub2tlbjtcbiAgICByZXR1cm4gcmVzdFxuICAgICAgLmZpbmQoXG4gICAgICAgIHJlcS5jb25maWcsXG4gICAgICAgIEF1dGgubWFzdGVyKHJlcS5jb25maWcpLFxuICAgICAgICAnX1Nlc3Npb24nLFxuICAgICAgICB7IHNlc3Npb25Ub2tlbiB9LFxuICAgICAgICB7IGluY2x1ZGU6ICd1c2VyJyB9LFxuICAgICAgICByZXEuaW5mby5jbGllbnRTREssXG4gICAgICAgIHJlcS5pbmZvLmNvbnRleHRcbiAgICAgIClcbiAgICAgIC50aGVuKHJlc3BvbnNlID0+IHtcbiAgICAgICAgaWYgKCFyZXNwb25zZS5yZXN1bHRzIHx8IHJlc3BvbnNlLnJlc3VsdHMubGVuZ3RoID09IDAgfHwgIXJlc3BvbnNlLnJlc3VsdHNbMF0udXNlcikge1xuICAgICAgICAgIHRocm93IG5ldyBQYXJzZS5FcnJvcihQYXJzZS5FcnJvci5JTlZBTElEX1NFU1NJT05fVE9LRU4sICdJbnZhbGlkIHNlc3Npb24gdG9rZW4nKTtcbiAgICAgICAgfSBlbHNlIHtcbiAgICAgICAgICBjb25zdCB1c2VyID0gcmVzcG9uc2UucmVzdWx0c1swXS51c2VyO1xuICAgICAgICAgIC8vIFNlbmQgdG9rZW4gYmFjayBvbiB0aGUgbG9naW4sIGJlY2F1c2UgU0RLcyBleHBlY3QgdGhhdC5cbiAgICAgICAgICB1c2VyLnNlc3Npb25Ub2tlbiA9IHNlc3Npb25Ub2tlbjtcblxuICAgICAgICAgIC8vIFJlbW92ZSBoaWRkZW4gcHJvcGVydGllcy5cbiAgICAgICAgICBVc2Vyc1JvdXRlci5yZW1vdmVIaWRkZW5Qcm9wZXJ0aWVzKHVzZXIpO1xuICAgICAgICAgIHJldHVybiB7IHJlc3BvbnNlOiB1c2VyIH07XG4gICAgICAgIH1cbiAgICAgIH0pO1xuICB9XG5cbiAgYXN5bmMgaGFuZGxlTG9nSW4ocmVxKSB7XG4gICAgY29uc3QgdXNlciA9IGF3YWl0IHRoaXMuX2F1dGhlbnRpY2F0ZVVzZXJGcm9tUmVxdWVzdChyZXEpO1xuICAgIGNvbnN0IGF1dGhEYXRhID0gcmVxLmJvZHkgJiYgcmVxLmJvZHkuYXV0aERhdGE7XG4gICAgLy8gQ2hlY2sgaWYgdXNlciBoYXMgcHJvdmlkZWQgaGlzIHJlcXVpcmVkIGF1dGggcHJvdmlkZXJzXG4gICAgQXV0aC5jaGVja0lmVXNlckhhc1Byb3ZpZGVkQ29uZmlndXJlZFByb3ZpZGVyc0ZvckxvZ2luKGF1dGhEYXRhLCB1c2VyLmF1dGhEYXRhLCByZXEuY29uZmlnKTtcblxuICAgIGxldCBhdXRoRGF0YVJlc3BvbnNlO1xuICAgIGxldCB2YWxpZGF0ZWRBdXRoRGF0YTtcbiAgICBpZiAoYXV0aERhdGEpIHtcbiAgICAgIGNvbnN0IHJlcyA9IGF3YWl0IEF1dGguaGFuZGxlQXV0aERhdGFWYWxpZGF0aW9uKGF1dGhEYXRhLCByZXEsIHVzZXIpO1xuICAgICAgYXV0aERhdGFSZXNwb25zZSA9IHJlcy5hdXRoRGF0YVJlc3BvbnNlO1xuICAgICAgdmFsaWRhdGVkQXV0aERhdGEgPSByZXMuYXV0aERhdGE7XG4gICAgfVxuXG4gICAgLy8gaGFuZGxlIHBhc3N3b3JkIGV4cGlyeSBwb2xpY3lcbiAgICBpZiAocmVxLmNvbmZpZy5wYXNzd29yZFBvbGljeSAmJiByZXEuY29uZmlnLnBhc3N3b3JkUG9saWN5Lm1heFBhc3N3b3JkQWdlKSB7XG4gICAgICBsZXQgY2hhbmdlZEF0ID0gdXNlci5fcGFzc3dvcmRfY2hhbmdlZF9hdDtcblxuICAgICAgaWYgKCFjaGFuZ2VkQXQpIHtcbiAgICAgICAgLy8gcGFzc3dvcmQgd2FzIGNyZWF0ZWQgYmVmb3JlIGV4cGlyeSBwb2xpY3kgd2FzIGVuYWJsZWQuXG4gICAgICAgIC8vIHNpbXBseSB1cGRhdGUgX1VzZXIgb2JqZWN0IHNvIHRoYXQgaXQgd2lsbCBzdGFydCBlbmZvcmNpbmcgZnJvbSBub3dcbiAgICAgICAgY2hhbmdlZEF0ID0gbmV3IERhdGUoKTtcbiAgICAgICAgcmVxLmNvbmZpZy5kYXRhYmFzZS51cGRhdGUoXG4gICAgICAgICAgJ19Vc2VyJyxcbiAgICAgICAgICB7IHVzZXJuYW1lOiB1c2VyLnVzZXJuYW1lIH0sXG4gICAgICAgICAgeyBfcGFzc3dvcmRfY2hhbmdlZF9hdDogUGFyc2UuX2VuY29kZShjaGFuZ2VkQXQpIH1cbiAgICAgICAgKTtcbiAgICAgIH0gZWxzZSB7XG4gICAgICAgIC8vIGNoZWNrIHdoZXRoZXIgdGhlIHBhc3N3b3JkIGhhcyBleHBpcmVkXG4gICAgICAgIGlmIChjaGFuZ2VkQXQuX190eXBlID09ICdEYXRlJykge1xuICAgICAgICAgIGNoYW5nZWRBdCA9IG5ldyBEYXRlKGNoYW5nZWRBdC5pc28pO1xuICAgICAgICB9XG4gICAgICAgIC8vIENhbGN1bGF0ZSB0aGUgZXhwaXJ5IHRpbWUuXG4gICAgICAgIGNvbnN0IGV4cGlyZXNBdCA9IG5ldyBEYXRlKFxuICAgICAgICAgIGNoYW5nZWRBdC5nZXRUaW1lKCkgKyA4NjQwMDAwMCAqIHJlcS5jb25maWcucGFzc3dvcmRQb2xpY3kubWF4UGFzc3dvcmRBZ2VcbiAgICAgICAgKTtcbiAgICAgICAgaWYgKGV4cGlyZXNBdCA8IG5ldyBEYXRlKCkpXG4gICAgICAgICAgLy8gZmFpbCBvZiBjdXJyZW50IHRpbWUgaXMgcGFzdCBwYXNzd29yZCBleHBpcnkgdGltZVxuICAgICAgICAgIHRocm93IG5ldyBQYXJzZS5FcnJvcihcbiAgICAgICAgICAgIFBhcnNlLkVycm9yLk9CSkVDVF9OT1RfRk9VTkQsXG4gICAgICAgICAgICAnWW91ciBwYXNzd29yZCBoYXMgZXhwaXJlZC4gUGxlYXNlIHJlc2V0IHlvdXIgcGFzc3dvcmQuJ1xuICAgICAgICAgICk7XG4gICAgICB9XG4gICAgfVxuXG4gICAgLy8gUmVtb3ZlIGhpZGRlbiBwcm9wZXJ0aWVzLlxuICAgIFVzZXJzUm91dGVyLnJlbW92ZUhpZGRlblByb3BlcnRpZXModXNlcik7XG5cbiAgICByZXEuY29uZmlnLmZpbGVzQ29udHJvbGxlci5leHBhbmRGaWxlc0luT2JqZWN0KHJlcS5jb25maWcsIHVzZXIpO1xuXG4gICAgLy8gQmVmb3JlIGxvZ2luIHRyaWdnZXI7IHRocm93cyBpZiBmYWlsdXJlXG4gICAgYXdhaXQgbWF5YmVSdW5UcmlnZ2VyKFxuICAgICAgVHJpZ2dlclR5cGVzLmJlZm9yZUxvZ2luLFxuICAgICAgcmVxLmF1dGgsXG4gICAgICBQYXJzZS5Vc2VyLmZyb21KU09OKE9iamVjdC5hc3NpZ24oeyBjbGFzc05hbWU6ICdfVXNlcicgfSwgdXNlcikpLFxuICAgICAgbnVsbCxcbiAgICAgIHJlcS5jb25maWdcbiAgICApO1xuXG4gICAgLy8gSWYgd2UgaGF2ZSBzb21lIG5ldyB2YWxpZGF0ZWQgYXV0aERhdGFcbiAgICAvLyB1cGRhdGUgZGlyZWN0bHlcbiAgICBpZiAodmFsaWRhdGVkQXV0aERhdGEgJiYgT2JqZWN0LmtleXModmFsaWRhdGVkQXV0aERhdGEpLmxlbmd0aCkge1xuICAgICAgYXdhaXQgcmVxLmNvbmZpZy5kYXRhYmFzZS51cGRhdGUoXG4gICAgICAgICdfVXNlcicsXG4gICAgICAgIHsgb2JqZWN0SWQ6IHVzZXIub2JqZWN0SWQgfSxcbiAgICAgICAgeyBhdXRoRGF0YTogdmFsaWRhdGVkQXV0aERhdGEgfSxcbiAgICAgICAge31cbiAgICAgICk7XG4gICAgfVxuXG4gICAgY29uc3QgeyBzZXNzaW9uRGF0YSwgY3JlYXRlU2Vzc2lvbiB9ID0gQXV0aC5jcmVhdGVTZXNzaW9uKHJlcS5jb25maWcsIHtcbiAgICAgIHVzZXJJZDogdXNlci5vYmplY3RJZCxcbiAgICAgIGNyZWF0ZWRXaXRoOiB7XG4gICAgICAgIGFjdGlvbjogJ2xvZ2luJyxcbiAgICAgICAgYXV0aFByb3ZpZGVyOiAncGFzc3dvcmQnLFxuICAgICAgfSxcbiAgICAgIGluc3RhbGxhdGlvbklkOiByZXEuaW5mby5pbnN0YWxsYXRpb25JZCxcbiAgICB9KTtcblxuICAgIHVzZXIuc2Vzc2lvblRva2VuID0gc2Vzc2lvbkRhdGEuc2Vzc2lvblRva2VuO1xuXG4gICAgYXdhaXQgY3JlYXRlU2Vzc2lvbigpO1xuXG4gICAgY29uc3QgYWZ0ZXJMb2dpblVzZXIgPSBQYXJzZS5Vc2VyLmZyb21KU09OKE9iamVjdC5hc3NpZ24oeyBjbGFzc05hbWU6ICdfVXNlcicgfSwgdXNlcikpO1xuICAgIG1heWJlUnVuVHJpZ2dlcihcbiAgICAgIFRyaWdnZXJUeXBlcy5hZnRlckxvZ2luLFxuICAgICAgeyAuLi5yZXEuYXV0aCwgdXNlcjogYWZ0ZXJMb2dpblVzZXIgfSxcbiAgICAgIGFmdGVyTG9naW5Vc2VyLFxuICAgICAgbnVsbCxcbiAgICAgIHJlcS5jb25maWdcbiAgICApO1xuXG4gICAgaWYgKGF1dGhEYXRhUmVzcG9uc2UpIHtcbiAgICAgIHVzZXIuYXV0aERhdGFSZXNwb25zZSA9IGF1dGhEYXRhUmVzcG9uc2U7XG4gICAgfVxuXG4gICAgcmV0dXJuIHsgcmVzcG9uc2U6IHVzZXIgfTtcbiAgfVxuXG4gIGhhbmRsZVZlcmlmeVBhc3N3b3JkKHJlcSkge1xuICAgIHJldHVybiB0aGlzLl9hdXRoZW50aWNhdGVVc2VyRnJvbVJlcXVlc3QocmVxKVxuICAgICAgLnRoZW4odXNlciA9PiB7XG4gICAgICAgIC8vIFJlbW92ZSBoaWRkZW4gcHJvcGVydGllcy5cbiAgICAgICAgVXNlcnNSb3V0ZXIucmVtb3ZlSGlkZGVuUHJvcGVydGllcyh1c2VyKTtcblxuICAgICAgICByZXR1cm4geyByZXNwb25zZTogdXNlciB9O1xuICAgICAgfSlcbiAgICAgIC5jYXRjaChlcnJvciA9PiB7XG4gICAgICAgIHRocm93IGVycm9yO1xuICAgICAgfSk7XG4gIH1cblxuICBoYW5kbGVMb2dPdXQocmVxKSB7XG4gICAgY29uc3Qgc3VjY2VzcyA9IHsgcmVzcG9uc2U6IHt9IH07XG4gICAgaWYgKHJlcS5pbmZvICYmIHJlcS5pbmZvLnNlc3Npb25Ub2tlbikge1xuICAgICAgcmV0dXJuIHJlc3RcbiAgICAgICAgLmZpbmQoXG4gICAgICAgICAgcmVxLmNvbmZpZyxcbiAgICAgICAgICBBdXRoLm1hc3RlcihyZXEuY29uZmlnKSxcbiAgICAgICAgICAnX1Nlc3Npb24nLFxuICAgICAgICAgIHsgc2Vzc2lvblRva2VuOiByZXEuaW5mby5zZXNzaW9uVG9rZW4gfSxcbiAgICAgICAgICB1bmRlZmluZWQsXG4gICAgICAgICAgcmVxLmluZm8uY2xpZW50U0RLLFxuICAgICAgICAgIHJlcS5pbmZvLmNvbnRleHRcbiAgICAgICAgKVxuICAgICAgICAudGhlbihyZWNvcmRzID0+IHtcbiAgICAgICAgICBpZiAocmVjb3Jkcy5yZXN1bHRzICYmIHJlY29yZHMucmVzdWx0cy5sZW5ndGgpIHtcbiAgICAgICAgICAgIHJldHVybiByZXN0XG4gICAgICAgICAgICAgIC5kZWwoXG4gICAgICAgICAgICAgICAgcmVxLmNvbmZpZyxcbiAgICAgICAgICAgICAgICBBdXRoLm1hc3RlcihyZXEuY29uZmlnKSxcbiAgICAgICAgICAgICAgICAnX1Nlc3Npb24nLFxuICAgICAgICAgICAgICAgIHJlY29yZHMucmVzdWx0c1swXS5vYmplY3RJZCxcbiAgICAgICAgICAgICAgICByZXEuaW5mby5jb250ZXh0XG4gICAgICAgICAgICAgIClcbiAgICAgICAgICAgICAgLnRoZW4oKCkgPT4ge1xuICAgICAgICAgICAgICAgIHRoaXMuX3J1bkFmdGVyTG9nb3V0VHJpZ2dlcihyZXEsIHJlY29yZHMucmVzdWx0c1swXSk7XG4gICAgICAgICAgICAgICAgcmV0dXJuIFByb21pc2UucmVzb2x2ZShzdWNjZXNzKTtcbiAgICAgICAgICAgICAgfSk7XG4gICAgICAgICAgfVxuICAgICAgICAgIHJldHVybiBQcm9taXNlLnJlc29sdmUoc3VjY2Vzcyk7XG4gICAgICAgIH0pO1xuICAgIH1cbiAgICByZXR1cm4gUHJvbWlzZS5yZXNvbHZlKHN1Y2Nlc3MpO1xuICB9XG5cbiAgX3J1bkFmdGVyTG9nb3V0VHJpZ2dlcihyZXEsIHNlc3Npb24pIHtcbiAgICAvLyBBZnRlciBsb2dvdXQgdHJpZ2dlclxuICAgIG1heWJlUnVuVHJpZ2dlcihcbiAgICAgIFRyaWdnZXJUeXBlcy5hZnRlckxvZ291dCxcbiAgICAgIHJlcS5hdXRoLFxuICAgICAgUGFyc2UuU2Vzc2lvbi5mcm9tSlNPTihPYmplY3QuYXNzaWduKHsgY2xhc3NOYW1lOiAnX1Nlc3Npb24nIH0sIHNlc3Npb24pKSxcbiAgICAgIG51bGwsXG4gICAgICByZXEuY29uZmlnXG4gICAgKTtcbiAgfVxuXG4gIF90aHJvd09uQmFkRW1haWxDb25maWcocmVxKSB7XG4gICAgdHJ5IHtcbiAgICAgIENvbmZpZy52YWxpZGF0ZUVtYWlsQ29uZmlndXJhdGlvbih7XG4gICAgICAgIGVtYWlsQWRhcHRlcjogcmVxLmNvbmZpZy51c2VyQ29udHJvbGxlci5hZGFwdGVyLFxuICAgICAgICBhcHBOYW1lOiByZXEuY29uZmlnLmFwcE5hbWUsXG4gICAgICAgIHB1YmxpY1NlcnZlclVSTDogcmVxLmNvbmZpZy5wdWJsaWNTZXJ2ZXJVUkwsXG4gICAgICAgIGVtYWlsVmVyaWZ5VG9rZW5WYWxpZGl0eUR1cmF0aW9uOiByZXEuY29uZmlnLmVtYWlsVmVyaWZ5VG9rZW5WYWxpZGl0eUR1cmF0aW9uLFxuICAgICAgICBlbWFpbFZlcmlmeVRva2VuUmV1c2VJZlZhbGlkOiByZXEuY29uZmlnLmVtYWlsVmVyaWZ5VG9rZW5SZXVzZUlmVmFsaWQsXG4gICAgICB9KTtcbiAgICB9IGNhdGNoIChlKSB7XG4gICAgICBpZiAodHlwZW9mIGUgPT09ICdzdHJpbmcnKSB7XG4gICAgICAgIC8vIE1heWJlIHdlIG5lZWQgYSBCYWQgQ29uZmlndXJhdGlvbiBlcnJvciwgYnV0IHRoZSBTREtzIHdvbid0IHVuZGVyc3RhbmQgaXQuIEZvciBub3csIEludGVybmFsIFNlcnZlciBFcnJvci5cbiAgICAgICAgdGhyb3cgbmV3IFBhcnNlLkVycm9yKFxuICAgICAgICAgIFBhcnNlLkVycm9yLklOVEVSTkFMX1NFUlZFUl9FUlJPUixcbiAgICAgICAgICAnQW4gYXBwTmFtZSwgcHVibGljU2VydmVyVVJMLCBhbmQgZW1haWxBZGFwdGVyIGFyZSByZXF1aXJlZCBmb3IgcGFzc3dvcmQgcmVzZXQgYW5kIGVtYWlsIHZlcmlmaWNhdGlvbiBmdW5jdGlvbmFsaXR5LidcbiAgICAgICAgKTtcbiAgICAgIH0gZWxzZSB7XG4gICAgICAgIHRocm93IGU7XG4gICAgICB9XG4gICAgfVxuICB9XG5cbiAgaGFuZGxlUmVzZXRSZXF1ZXN0KHJlcSkge1xuICAgIHRoaXMuX3Rocm93T25CYWRFbWFpbENvbmZpZyhyZXEpO1xuXG4gICAgY29uc3QgeyBlbWFpbCB9ID0gcmVxLmJvZHk7XG4gICAgaWYgKCFlbWFpbCkge1xuICAgICAgdGhyb3cgbmV3IFBhcnNlLkVycm9yKFBhcnNlLkVycm9yLkVNQUlMX01JU1NJTkcsICd5b3UgbXVzdCBwcm92aWRlIGFuIGVtYWlsJyk7XG4gICAgfVxuICAgIGlmICh0eXBlb2YgZW1haWwgIT09ICdzdHJpbmcnKSB7XG4gICAgICB0aHJvdyBuZXcgUGFyc2UuRXJyb3IoXG4gICAgICAgIFBhcnNlLkVycm9yLklOVkFMSURfRU1BSUxfQUREUkVTUyxcbiAgICAgICAgJ3lvdSBtdXN0IHByb3ZpZGUgYSB2YWxpZCBlbWFpbCBzdHJpbmcnXG4gICAgICApO1xuICAgIH1cbiAgICBjb25zdCB1c2VyQ29udHJvbGxlciA9IHJlcS5jb25maWcudXNlckNvbnRyb2xsZXI7XG4gICAgcmV0dXJuIHVzZXJDb250cm9sbGVyLnNlbmRQYXNzd29yZFJlc2V0RW1haWwoZW1haWwpLnRoZW4oXG4gICAgICAoKSA9PiB7XG4gICAgICAgIHJldHVybiBQcm9taXNlLnJlc29sdmUoe1xuICAgICAgICAgIHJlc3BvbnNlOiB7fSxcbiAgICAgICAgfSk7XG4gICAgICB9LFxuICAgICAgZXJyID0+IHtcbiAgICAgICAgaWYgKGVyci5jb2RlID09PSBQYXJzZS5FcnJvci5PQkpFQ1RfTk9UX0ZPVU5EKSB7XG4gICAgICAgICAgLy8gUmV0dXJuIHN1Y2Nlc3Mgc28gdGhhdCB0aGlzIGVuZHBvaW50IGNhbid0XG4gICAgICAgICAgLy8gYmUgdXNlZCB0byBlbnVtZXJhdGUgdmFsaWQgZW1haWxzXG4gICAgICAgICAgcmV0dXJuIFByb21pc2UucmVzb2x2ZSh7XG4gICAgICAgICAgICByZXNwb25zZToge30sXG4gICAgICAgICAgfSk7XG4gICAgICAgIH0gZWxzZSB7XG4gICAgICAgICAgdGhyb3cgZXJyO1xuICAgICAgICB9XG4gICAgICB9XG4gICAgKTtcbiAgfVxuXG4gIGhhbmRsZVZlcmlmaWNhdGlvbkVtYWlsUmVxdWVzdChyZXEpIHtcbiAgICB0aGlzLl90aHJvd09uQmFkRW1haWxDb25maWcocmVxKTtcblxuICAgIGNvbnN0IHsgZW1haWwgfSA9IHJlcS5ib2R5O1xuICAgIGlmICghZW1haWwpIHtcbiAgICAgIHRocm93IG5ldyBQYXJzZS5FcnJvcihQYXJzZS5FcnJvci5FTUFJTF9NSVNTSU5HLCAneW91IG11c3QgcHJvdmlkZSBhbiBlbWFpbCcpO1xuICAgIH1cbiAgICBpZiAodHlwZW9mIGVtYWlsICE9PSAnc3RyaW5nJykge1xuICAgICAgdGhyb3cgbmV3IFBhcnNlLkVycm9yKFxuICAgICAgICBQYXJzZS5FcnJvci5JTlZBTElEX0VNQUlMX0FERFJFU1MsXG4gICAgICAgICd5b3UgbXVzdCBwcm92aWRlIGEgdmFsaWQgZW1haWwgc3RyaW5nJ1xuICAgICAgKTtcbiAgICB9XG5cbiAgICByZXR1cm4gcmVxLmNvbmZpZy5kYXRhYmFzZS5maW5kKCdfVXNlcicsIHsgZW1haWw6IGVtYWlsIH0pLnRoZW4ocmVzdWx0cyA9PiB7XG4gICAgICBpZiAoIXJlc3VsdHMubGVuZ3RoIHx8IHJlc3VsdHMubGVuZ3RoIDwgMSkge1xuICAgICAgICB0aHJvdyBuZXcgUGFyc2UuRXJyb3IoUGFyc2UuRXJyb3IuRU1BSUxfTk9UX0ZPVU5ELCBgTm8gdXNlciBmb3VuZCB3aXRoIGVtYWlsICR7ZW1haWx9YCk7XG4gICAgICB9XG4gICAgICBjb25zdCB1c2VyID0gcmVzdWx0c1swXTtcblxuICAgICAgLy8gcmVtb3ZlIHBhc3N3b3JkIGZpZWxkLCBtZXNzZXMgd2l0aCBzYXZpbmcgb24gcG9zdGdyZXNcbiAgICAgIGRlbGV0ZSB1c2VyLnBhc3N3b3JkO1xuXG4gICAgICBpZiAodXNlci5lbWFpbFZlcmlmaWVkKSB7XG4gICAgICAgIHRocm93IG5ldyBQYXJzZS5FcnJvcihQYXJzZS5FcnJvci5PVEhFUl9DQVVTRSwgYEVtYWlsICR7ZW1haWx9IGlzIGFscmVhZHkgdmVyaWZpZWQuYCk7XG4gICAgICB9XG5cbiAgICAgIGNvbnN0IHVzZXJDb250cm9sbGVyID0gcmVxLmNvbmZpZy51c2VyQ29udHJvbGxlcjtcbiAgICAgIHJldHVybiB1c2VyQ29udHJvbGxlci5yZWdlbmVyYXRlRW1haWxWZXJpZnlUb2tlbih1c2VyKS50aGVuKCgpID0+IHtcbiAgICAgICAgdXNlckNvbnRyb2xsZXIuc2VuZFZlcmlmaWNhdGlvbkVtYWlsKHVzZXIpO1xuICAgICAgICByZXR1cm4geyByZXNwb25zZToge30gfTtcbiAgICAgIH0pO1xuICAgIH0pO1xuICB9XG5cbiAgYXN5bmMgaGFuZGxlQ2hhbGxlbmdlKHJlcSkge1xuICAgIGNvbnN0IHsgdXNlcm5hbWUsIGVtYWlsLCBwYXNzd29yZCwgYXV0aERhdGEsIGNoYWxsZW5nZURhdGEgfSA9IHJlcS5ib2R5O1xuXG4gICAgLy8gaWYgdXNlcm5hbWUgb3IgZW1haWwgcHJvdmlkZWQgd2l0aCBwYXNzd29yZCB0cnkgdG8gZmluZCB0aGUgdXNlciB3aXRoIGRlZmF1bHRcbiAgICAvLyBzeXN0ZW1cbiAgICBsZXQgdXNlcjtcbiAgICBpZiAodXNlcm5hbWUgfHwgZW1haWwpIHtcbiAgICAgIGlmICghcGFzc3dvcmQpXG4gICAgICAgIHRocm93IG5ldyBQYXJzZS5FcnJvcihcbiAgICAgICAgICBQYXJzZS5FcnJvci5PVEhFUl9DQVVTRSxcbiAgICAgICAgICAnWW91IHByb3ZpZGVkIHVzZXJuYW1lIG9yIGVtYWlsLCB5b3UgbmVlZCB0byBhbHNvIHByb3ZpZGUgcGFzc3dvcmQuJ1xuICAgICAgICApO1xuICAgICAgdXNlciA9IGF3YWl0IHRoaXMuX2F1dGhlbnRpY2F0ZVVzZXJGcm9tUmVxdWVzdChyZXEpO1xuICAgIH1cblxuICAgIGlmICghY2hhbGxlbmdlRGF0YSkgdGhyb3cgbmV3IFBhcnNlLkVycm9yKFBhcnNlLkVycm9yLk9USEVSX0NBVVNFLCAnTm90aGluZyB0byBjaGFsbGVuZ2UuJyk7XG5cbiAgICBpZiAodHlwZW9mIGNoYWxsZW5nZURhdGEgIT09ICdvYmplY3QnKVxuICAgICAgdGhyb3cgbmV3IFBhcnNlLkVycm9yKFBhcnNlLkVycm9yLk9USEVSX0NBVVNFLCAnY2hhbGxlbmdlRGF0YSBzaG91bGQgYmUgYW4gb2JqZWN0LicpO1xuXG4gICAgLy8gVHJ5IHRvIGZpbmQgdXNlciBieSBhdXRoRGF0YVxuICAgIGlmIChhdXRoRGF0YSkge1xuICAgICAgaWYgKHR5cGVvZiBhdXRoRGF0YSAhPT0gJ29iamVjdCcpXG4gICAgICAgIHRocm93IG5ldyBQYXJzZS5FcnJvcihQYXJzZS5FcnJvci5PVEhFUl9DQVVTRSwgJ2F1dGhEYXRhIHNob3VsZCBiZSBhbiBvYmplY3QuJyk7XG4gICAgICAvLyBUbyBhdm9pZCBzZWN1cml0eSBpc3N1ZSB3ZSBzaG91bGQgb25seSBzdXBwb3J0IG9uZSBpZGVudGlmeWluZyBtZXRob2RcbiAgICAgIGlmICh1c2VyKVxuICAgICAgICB0aHJvdyBuZXcgUGFyc2UuRXJyb3IoXG4gICAgICAgICAgUGFyc2UuRXJyb3IuT1RIRVJfQ0FVU0UsXG4gICAgICAgICAgJ1lvdSBjYW50IHByb3ZpZGUgdXNlcm5hbWUvZW1haWwgYW5kIGF1dGhEYXRhLCBvbmx5IHVzZSBvbmUgaWRlbnRpZmljYXRpb24gbWV0aG9kLidcbiAgICAgICAgKTtcbiAgICAgIGNvbnN0IHJlc3VsdHMgPSBhd2FpdCBBdXRoLmZpbmRVc2Vyc1dpdGhBdXRoRGF0YShyZXEuY29uZmlnLCBhdXRoRGF0YSk7XG4gICAgICBpZiAocmVzdWx0cy5sZW5ndGggPiAxKSB7XG4gICAgICAgIHRocm93IG5ldyBQYXJzZS5FcnJvcihcbiAgICAgICAgICBQYXJzZS5FcnJvci5PVEhFUl9DQVVTRSxcbiAgICAgICAgICAnWW91IGNhbnQgcHJvdmlkZSBtb3JlIHRoYW4gb25lIGF1dGhEYXRhIHByb3ZpZGVyIHdpdGggYW4gaWQuJ1xuICAgICAgICApO1xuICAgICAgfVxuICAgICAgaWYgKCFyZXN1bHRzWzBdKSB0aHJvdyBuZXcgUGFyc2UuRXJyb3IoUGFyc2UuRXJyb3IuT1RIRVJfQ0FVU0UsICdVc2VyIG5vdCBmb3VuZC4nKTtcbiAgICAgIHVzZXIgPSByZXN1bHRzWzBdO1xuICAgIH1cblxuICAgIC8vIEV4ZWN1dGUgY2hhbGxlbmdlIHN0ZXAgYnkgc3RlcFxuICAgIC8vIHdpdGggY29uc2lzdGVudCBvcmRlclxuICAgIGNvbnN0IGNoYWxsZW5nZSA9IGF3YWl0IEF1dGgucmVkdWNlUHJvbWlzZShcbiAgICAgIE9iamVjdC5rZXlzKGNoYWxsZW5nZURhdGEpLnNvcnQoKSxcbiAgICAgIGFzeW5jIChhY2MsIHByb3ZpZGVyKSA9PiB7XG4gICAgICAgIGNvbnN0IGNoYWxsZW5nZUhhbmRsZXIgPSByZXEuY29uZmlnLmF1dGhEYXRhTWFuYWdlci5nZXRWYWxpZGF0b3JGb3JQcm92aWRlcihwcm92aWRlcilcbiAgICAgICAgICAuYWRhcHRlci5jaGFsbGVuZ2U7XG4gICAgICAgIGlmICh0eXBlb2YgY2hhbGxlbmdlSGFuZGxlciA9PT0gJ2Z1bmN0aW9uJykge1xuICAgICAgICAgIGFjY1twcm92aWRlcl0gPVxuICAgICAgICAgICAgKGF3YWl0IGNoYWxsZW5nZUhhbmRsZXIoXG4gICAgICAgICAgICAgIGNoYWxsZW5nZURhdGFbcHJvdmlkZXJdLFxuICAgICAgICAgICAgICBhdXRoRGF0YSAmJiBhdXRoRGF0YVtwcm92aWRlcl0sXG4gICAgICAgICAgICAgIHVzZXIgPyBQYXJzZS5Vc2VyLmZyb21KU09OKHsgY2xhc3NOYW1lOiAnX1VzZXInLCAuLi51c2VyIH0pIDogdW5kZWZpbmVkLFxuICAgICAgICAgICAgICByZXEsXG4gICAgICAgICAgICAgIHJlcS5jb25maWcuYXV0aFtwcm92aWRlcl1cbiAgICAgICAgICAgICkpIHx8IHRydWU7XG4gICAgICAgICAgcmV0dXJuIGFjYztcbiAgICAgICAgfVxuICAgICAgfSxcbiAgICAgIHt9XG4gICAgKTtcblxuICAgIHJldHVybiB7IHJlc3BvbnNlOiBPYmplY3Qua2V5cyhjaGFsbGVuZ2UpLmxlbmd0aCA/IHsgY2hhbGxlbmdlRGF0YTogY2hhbGxlbmdlIH0gOiB1bmRlZmluZWQgfTtcbiAgfVxuXG4gIG1vdW50Um91dGVzKCkge1xuICAgIHRoaXMucm91dGUoJ0dFVCcsICcvdXNlcnMnLCByZXEgPT4ge1xuICAgICAgcmV0dXJuIHRoaXMuaGFuZGxlRmluZChyZXEpO1xuICAgIH0pO1xuICAgIHRoaXMucm91dGUoJ1BPU1QnLCAnL3VzZXJzJywgcHJvbWlzZUVuc3VyZUlkZW1wb3RlbmN5LCByZXEgPT4ge1xuICAgICAgcmV0dXJuIHRoaXMuaGFuZGxlQ3JlYXRlKHJlcSk7XG4gICAgfSk7XG4gICAgdGhpcy5yb3V0ZSgnR0VUJywgJy91c2Vycy9tZScsIHJlcSA9PiB7XG4gICAgICByZXR1cm4gdGhpcy5oYW5kbGVNZShyZXEpO1xuICAgIH0pO1xuICAgIHRoaXMucm91dGUoJ0dFVCcsICcvdXNlcnMvOm9iamVjdElkJywgcmVxID0+IHtcbiAgICAgIHJldHVybiB0aGlzLmhhbmRsZUdldChyZXEpO1xuICAgIH0pO1xuICAgIHRoaXMucm91dGUoJ1BVVCcsICcvdXNlcnMvOm9iamVjdElkJywgcHJvbWlzZUVuc3VyZUlkZW1wb3RlbmN5LCByZXEgPT4ge1xuICAgICAgcmV0dXJuIHRoaXMuaGFuZGxlVXBkYXRlKHJlcSk7XG4gICAgfSk7XG4gICAgdGhpcy5yb3V0ZSgnREVMRVRFJywgJy91c2Vycy86b2JqZWN0SWQnLCByZXEgPT4ge1xuICAgICAgcmV0dXJuIHRoaXMuaGFuZGxlRGVsZXRlKHJlcSk7XG4gICAgfSk7XG4gICAgdGhpcy5yb3V0ZSgnR0VUJywgJy9sb2dpbicsIHJlcSA9PiB7XG4gICAgICByZXR1cm4gdGhpcy5oYW5kbGVMb2dJbihyZXEpO1xuICAgIH0pO1xuICAgIHRoaXMucm91dGUoJ1BPU1QnLCAnL2xvZ2luJywgcmVxID0+IHtcbiAgICAgIHJldHVybiB0aGlzLmhhbmRsZUxvZ0luKHJlcSk7XG4gICAgfSk7XG4gICAgdGhpcy5yb3V0ZSgnUE9TVCcsICcvbG9nb3V0JywgcmVxID0+IHtcbiAgICAgIHJldHVybiB0aGlzLmhhbmRsZUxvZ091dChyZXEpO1xuICAgIH0pO1xuICAgIHRoaXMucm91dGUoJ1BPU1QnLCAnL3JlcXVlc3RQYXNzd29yZFJlc2V0JywgcmVxID0+IHtcbiAgICAgIHJldHVybiB0aGlzLmhhbmRsZVJlc2V0UmVxdWVzdChyZXEpO1xuICAgIH0pO1xuICAgIHRoaXMucm91dGUoJ1BPU1QnLCAnL3ZlcmlmaWNhdGlvbkVtYWlsUmVxdWVzdCcsIHJlcSA9PiB7XG4gICAgICByZXR1cm4gdGhpcy5oYW5kbGVWZXJpZmljYXRpb25FbWFpbFJlcXVlc3QocmVxKTtcbiAgICB9KTtcbiAgICB0aGlzLnJvdXRlKCdHRVQnLCAnL3ZlcmlmeVBhc3N3b3JkJywgcmVxID0+IHtcbiAgICAgIHJldHVybiB0aGlzLmhhbmRsZVZlcmlmeVBhc3N3b3JkKHJlcSk7XG4gICAgfSk7XG4gICAgdGhpcy5yb3V0ZSgnUE9TVCcsICcvY2hhbGxlbmdlJywgcmVxID0+IHtcbiAgICAgIHJldHVybiB0aGlzLmhhbmRsZUNoYWxsZW5nZShyZXEpO1xuICAgIH0pO1xuICB9XG59XG5cbmV4cG9ydCBkZWZhdWx0IFVzZXJzUm91dGVyO1xuIl19