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

var _WinstonLogger = require("../../lib/Adapters/Logger/WinstonLogger");

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

      if (Object.keys(authData).filter(key => authData[key].id).length > 1) {
        throw new _node.default.Error(_node.default.Error.OTHER_CAUSE, 'You cant provide more than one authData provider with an id.');
      }

      const results = await _Auth.default.findUsersWithAuthData(req.config, authData);

      try {
        if (!results[0] || results.length > 1) throw new _node.default.Error(_node.default.Error.OTHER_CAUSE, 'User not found.'); // Find the provider used to find the user

        const provider = Object.keys(authData).find(key => authData[key].id); // Validate authData used to identify the user
        // to avoid guess id attack

        const {
          validator
        } = req.config.authDataManager.getValidatorForProvider(provider);
        await validator(authData[provider], {
          config: req.config,
          auth: req.auth,
          isChallenge: true
        }, _node.default.User.fromJSON(_objectSpread({
          className: '_User'
        }, results[0])));
        user = results[0];
      } catch (e) {
        // Rewrite the error to avoid guess id attack
        _WinstonLogger.logger.error(e);

        throw new _node.default.Error(_node.default.Error.OTHER_CAUSE, 'User not found.');
      }
    } // Execute challenge step by step
    // with consistent order


    const challenge = await _Auth.default.reducePromise(Object.keys(challengeData).sort(), async (acc, provider) => {
      const challengeHandler = req.config.authDataManager.getValidatorForProvider(provider).adapter.challenge;

      if (typeof challengeHandler === 'function') {
        acc[provider] = (await challengeHandler(challengeData[provider], authData && authData[provider], req.config.auth[provider], req, user ? _node.default.User.fromJSON(_objectSpread({
          className: '_User'
        }, user)) : undefined)) || true;
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
//# sourceMappingURL=data:application/json;charset=utf-8;base64,eyJ2ZXJzaW9uIjozLCJzb3VyY2VzIjpbIi4uLy4uL3NyYy9Sb3V0ZXJzL1VzZXJzUm91dGVyLmpzIl0sIm5hbWVzIjpbIlVzZXJzUm91dGVyIiwiQ2xhc3Nlc1JvdXRlciIsImNsYXNzTmFtZSIsInJlbW92ZUhpZGRlblByb3BlcnRpZXMiLCJvYmoiLCJrZXkiLCJPYmplY3QiLCJwcm90b3R5cGUiLCJoYXNPd25Qcm9wZXJ0eSIsImNhbGwiLCJ0ZXN0IiwiX2F1dGhlbnRpY2F0ZVVzZXJGcm9tUmVxdWVzdCIsInJlcSIsIlByb21pc2UiLCJyZXNvbHZlIiwicmVqZWN0IiwicGF5bG9hZCIsImJvZHkiLCJ1c2VybmFtZSIsInF1ZXJ5IiwiZW1haWwiLCJwYXNzd29yZCIsIlBhcnNlIiwiRXJyb3IiLCJVU0VSTkFNRV9NSVNTSU5HIiwiUEFTU1dPUkRfTUlTU0lORyIsIk9CSkVDVF9OT1RfRk9VTkQiLCJ1c2VyIiwiaXNWYWxpZFBhc3N3b3JkIiwiJG9yIiwiY29uZmlnIiwiZGF0YWJhc2UiLCJmaW5kIiwidGhlbiIsInJlc3VsdHMiLCJsZW5ndGgiLCJsb2dnZXJDb250cm9sbGVyIiwid2FybiIsImZpbHRlciIsInBhc3N3b3JkQ3J5cHRvIiwiY29tcGFyZSIsImNvcnJlY3QiLCJhY2NvdW50TG9ja291dFBvbGljeSIsIkFjY291bnRMb2Nrb3V0IiwiaGFuZGxlTG9naW5BdHRlbXB0IiwiYXV0aCIsImlzTWFzdGVyIiwiQUNMIiwia2V5cyIsInZlcmlmeVVzZXJFbWFpbHMiLCJwcmV2ZW50TG9naW5XaXRoVW52ZXJpZmllZEVtYWlsIiwiZW1haWxWZXJpZmllZCIsIkVNQUlMX05PVF9GT1VORCIsImF1dGhEYXRhIiwiZm9yRWFjaCIsInByb3ZpZGVyIiwiY2F0Y2giLCJlcnJvciIsImhhbmRsZU1lIiwiaW5mbyIsInNlc3Npb25Ub2tlbiIsIklOVkFMSURfU0VTU0lPTl9UT0tFTiIsInJlc3QiLCJBdXRoIiwibWFzdGVyIiwiaW5jbHVkZSIsImNsaWVudFNESyIsImNvbnRleHQiLCJyZXNwb25zZSIsImhhbmRsZUxvZ0luIiwiY2hlY2tJZlVzZXJIYXNQcm92aWRlZENvbmZpZ3VyZWRQcm92aWRlcnNGb3JMb2dpbiIsImF1dGhEYXRhUmVzcG9uc2UiLCJ2YWxpZGF0ZWRBdXRoRGF0YSIsInJlcyIsImhhbmRsZUF1dGhEYXRhVmFsaWRhdGlvbiIsInBhc3N3b3JkUG9saWN5IiwibWF4UGFzc3dvcmRBZ2UiLCJjaGFuZ2VkQXQiLCJfcGFzc3dvcmRfY2hhbmdlZF9hdCIsIkRhdGUiLCJ1cGRhdGUiLCJfZW5jb2RlIiwiX190eXBlIiwiaXNvIiwiZXhwaXJlc0F0IiwiZ2V0VGltZSIsImZpbGVzQ29udHJvbGxlciIsImV4cGFuZEZpbGVzSW5PYmplY3QiLCJUcmlnZ2VyVHlwZXMiLCJiZWZvcmVMb2dpbiIsIlVzZXIiLCJmcm9tSlNPTiIsImFzc2lnbiIsIm9iamVjdElkIiwic2Vzc2lvbkRhdGEiLCJjcmVhdGVTZXNzaW9uIiwidXNlcklkIiwiY3JlYXRlZFdpdGgiLCJhY3Rpb24iLCJhdXRoUHJvdmlkZXIiLCJpbnN0YWxsYXRpb25JZCIsImFmdGVyTG9naW5Vc2VyIiwiYWZ0ZXJMb2dpbiIsImhhbmRsZVZlcmlmeVBhc3N3b3JkIiwiaGFuZGxlTG9nT3V0Iiwic3VjY2VzcyIsInVuZGVmaW5lZCIsInJlY29yZHMiLCJkZWwiLCJfcnVuQWZ0ZXJMb2dvdXRUcmlnZ2VyIiwic2Vzc2lvbiIsImFmdGVyTG9nb3V0IiwiU2Vzc2lvbiIsIl90aHJvd09uQmFkRW1haWxDb25maWciLCJDb25maWciLCJ2YWxpZGF0ZUVtYWlsQ29uZmlndXJhdGlvbiIsImVtYWlsQWRhcHRlciIsInVzZXJDb250cm9sbGVyIiwiYWRhcHRlciIsImFwcE5hbWUiLCJwdWJsaWNTZXJ2ZXJVUkwiLCJlbWFpbFZlcmlmeVRva2VuVmFsaWRpdHlEdXJhdGlvbiIsImVtYWlsVmVyaWZ5VG9rZW5SZXVzZUlmVmFsaWQiLCJlIiwiSU5URVJOQUxfU0VSVkVSX0VSUk9SIiwiaGFuZGxlUmVzZXRSZXF1ZXN0IiwiRU1BSUxfTUlTU0lORyIsIklOVkFMSURfRU1BSUxfQUREUkVTUyIsInNlbmRQYXNzd29yZFJlc2V0RW1haWwiLCJlcnIiLCJjb2RlIiwiaGFuZGxlVmVyaWZpY2F0aW9uRW1haWxSZXF1ZXN0IiwiT1RIRVJfQ0FVU0UiLCJyZWdlbmVyYXRlRW1haWxWZXJpZnlUb2tlbiIsInNlbmRWZXJpZmljYXRpb25FbWFpbCIsImhhbmRsZUNoYWxsZW5nZSIsImNoYWxsZW5nZURhdGEiLCJpZCIsImZpbmRVc2Vyc1dpdGhBdXRoRGF0YSIsInZhbGlkYXRvciIsImF1dGhEYXRhTWFuYWdlciIsImdldFZhbGlkYXRvckZvclByb3ZpZGVyIiwiaXNDaGFsbGVuZ2UiLCJsb2dnZXIiLCJjaGFsbGVuZ2UiLCJyZWR1Y2VQcm9taXNlIiwic29ydCIsImFjYyIsImNoYWxsZW5nZUhhbmRsZXIiLCJtb3VudFJvdXRlcyIsInJvdXRlIiwiaGFuZGxlRmluZCIsInByb21pc2VFbnN1cmVJZGVtcG90ZW5jeSIsImhhbmRsZUNyZWF0ZSIsImhhbmRsZUdldCIsImhhbmRsZVVwZGF0ZSIsImhhbmRsZURlbGV0ZSJdLCJtYXBwaW5ncyI6Ijs7Ozs7OztBQUVBOztBQUNBOztBQUNBOztBQUNBOztBQUNBOztBQUNBOztBQUNBOztBQUNBOztBQUNBOztBQUNBOzs7Ozs7Ozs7O0FBRU8sTUFBTUEsV0FBTixTQUEwQkMsc0JBQTFCLENBQXdDO0FBQzdDQyxFQUFBQSxTQUFTLEdBQUc7QUFDVixXQUFPLE9BQVA7QUFDRDtBQUVEO0FBQ0Y7QUFDQTtBQUNBOzs7QUFDRSxTQUFPQyxzQkFBUCxDQUE4QkMsR0FBOUIsRUFBbUM7QUFDakMsU0FBSyxJQUFJQyxHQUFULElBQWdCRCxHQUFoQixFQUFxQjtBQUNuQixVQUFJRSxNQUFNLENBQUNDLFNBQVAsQ0FBaUJDLGNBQWpCLENBQWdDQyxJQUFoQyxDQUFxQ0wsR0FBckMsRUFBMENDLEdBQTFDLENBQUosRUFBb0Q7QUFDbEQ7QUFDQSxZQUFJQSxHQUFHLEtBQUssUUFBUixJQUFvQixDQUFDLDBCQUEwQkssSUFBMUIsQ0FB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QyxhQUFPLEtBQUsySCxlQUFMLENBQXFCM0gsR0FBckIsQ0FBUDtBQUNELEtBRkQ7QUFHRDs7QUF2aEI0Qzs7O2VBMGhCaENaLFciLCJzb3VyY2VzQ29udGVudCI6WyIvLyBUaGVzZSBtZXRob2RzIGhhbmRsZSB0aGUgVXNlci1yZWxhdGVkIHJvdXRlcy5cblxuaW1wb3J0IFBhcnNlIGZyb20gJ3BhcnNlL25vZGUnO1xuaW1wb3J0IENvbmZpZyBmcm9tICcuLi9Db25maWcnO1xuaW1wb3J0IEFjY291bnRMb2Nrb3V0IGZyb20gJy4uL0FjY291bnRMb2Nrb3V0JztcbmltcG9ydCBDbGFzc2VzUm91dGVyIGZyb20gJy4vQ2xhc3Nlc1JvdXRlcic7XG5pbXBvcnQgcmVzdCBmcm9tICcuLi9yZXN0JztcbmltcG9ydCBBdXRoIGZyb20gJy4uL0F1dGgnO1xuaW1wb3J0IHBhc3N3b3JkQ3J5cHRvIGZyb20gJy4uL3Bhc3N3b3JkJztcbmltcG9ydCB7IG1heWJlUnVuVHJpZ2dlciwgVHlwZXMgYXMgVHJpZ2dlclR5cGVzIH0gZnJvbSAnLi4vdHJpZ2dlcnMnO1xuaW1wb3J0IHsgcHJvbWlzZUVuc3VyZUlkZW1wb3RlbmN5IH0gZnJvbSAnLi4vbWlkZGxld2FyZXMnO1xuaW1wb3J0IHsgbG9nZ2VyIH0gZnJvbSAnLi4vLi4vbGliL0FkYXB0ZXJzL0xvZ2dlci9XaW5zdG9uTG9nZ2VyJztcblxuZXhwb3J0IGNsYXNzIFVzZXJzUm91dGVyIGV4dGVuZHMgQ2xhc3Nlc1JvdXRlciB7XG4gIGNsYXNzTmFtZSgpIHtcbiAgICByZXR1cm4gJ19Vc2VyJztcbiAgfVxuXG4gIC8qKlxuICAgKiBSZW1vdmVzIGFsbCBcIl9cIiBwcmVmaXhlZCBwcm9wZXJ0aWVzIGZyb20gYW4gb2JqZWN0LCBleGNlcHQgXCJfX3R5cGVcIlxuICAgKiBAcGFyYW0ge09iamVjdH0gb2JqIEFuIG9iamVjdC5cbiAgICovXG4gIHN0YXRpYyByZW1vdmVIaWRkZW5Qcm9wZXJ0aWVzKG9iaikge1xuICAgIGZvciAodmFyIGtleSBpbiBvYmopIHtcbiAgICAgIGlmIChPYmplY3QucHJvdG90eXBlLmhhc093blByb3BlcnR5LmNhbGwob2JqLCBrZXkpKSB7XG4gICAgICAgIC8vIFJlZ2V4cCBjb21lcyBmcm9tIFBhcnNlLk9iamVjdC5wcm90b3R5cGUudmFsaWRhdGVcbiAgICAgICAgaWYgKGtleSAhPT0gJ19fdHlwZScgJiYgIS9eW0EtWmEtel1bMC05QS1aYS16X10qJC8udGVzdChrZXkpKSB7XG4gICAgICAgICAgZGVsZXRlIG9ialtrZXldO1xuICAgICAgICB9XG4gICAgICB9XG4gICAgfVxuICB9XG5cbiAgLyoqXG4gICAqIFZhbGlkYXRlcyBhIHBhc3N3b3JkIHJlcXVlc3QgaW4gbG9naW4gYW5kIHZlcmlmeVBhc3N3b3JkXG4gICAqIEBwYXJhbSB7T2JqZWN0fSByZXEgVGhlIHJlcXVlc3RcbiAgICogQHJldHVybnMge09iamVjdH0gVXNlciBvYmplY3RcbiAgICogQHByaXZhdGVcbiAgICovXG4gIF9hdXRoZW50aWNhdGVVc2VyRnJvbVJlcXVlc3QocmVxKSB7XG4gICAgcmV0dXJuIG5ldyBQcm9taXNlKChyZXNvbHZlLCByZWplY3QpID0+IHtcbiAgICAgIC8vIFVzZSBxdWVyeSBwYXJhbWV0ZXJzIGluc3RlYWQgaWYgcHJvdmlkZWQgaW4gdXJsXG4gICAgICBsZXQgcGF5bG9hZCA9IHJlcS5ib2R5O1xuICAgICAgaWYgKFxuICAgICAgICAoIXBheWxvYWQudXNlcm5hbWUgJiYgcmVxLnF1ZXJ5ICYmIHJlcS5xdWVyeS51c2VybmFtZSkgfHxcbiAgICAgICAgKCFwYXlsb2FkLmVtYWlsICYmIHJlcS5xdWVyeSAmJiByZXEucXVlcnkuZW1haWwpXG4gICAgICApIHtcbiAgICAgICAgcGF5bG9hZCA9IHJlcS5xdWVyeTtcbiAgICAgIH1cbiAgICAgIGNvbnN0IHsgdXNlcm5hbWUsIGVtYWlsLCBwYXNzd29yZCB9ID0gcGF5bG9hZDtcblxuICAgICAgLy8gVE9ETzogdXNlIHRoZSByaWdodCBlcnJvciBjb2RlcyAvIGRlc2NyaXB0aW9ucy5cbiAgICAgIGlmICghdXNlcm5hbWUgJiYgIWVtYWlsKSB7XG4gICAgICAgIHRocm93IG5ldyBQYXJzZS5FcnJvcihQYXJzZS5FcnJvci5VU0VSTkFNRV9NSVNTSU5HLCAndXNlcm5hbWUvZW1haWwgaXMgcmVxdWlyZWQuJyk7XG4gICAgICB9XG4gICAgICBpZiAoIXBhc3N3b3JkKSB7XG4gICAgICAgIHRocm93IG5ldyBQYXJzZS5FcnJvcihQYXJzZS5FcnJvci5QQVNTV09SRF9NSVNTSU5HLCAncGFzc3dvcmQgaXMgcmVxdWlyZWQuJyk7XG4gICAgICB9XG4gICAgICBpZiAoXG4gICAgICAgIHR5cGVvZiBwYXNzd29yZCAhPT0gJ3N0cmluZycgfHxcbiAgICAgICAgKGVtYWlsICYmIHR5cGVvZiBlbWFpbCAhPT0gJ3N0cmluZycpIHx8XG4gICAgICAgICh1c2VybmFtZSAmJiB0eXBlb2YgdXNlcm5hbWUgIT09ICdzdHJpbmcnKVxuICAgICAgKSB7XG4gICAgICAgIHRocm93IG5ldyBQYXJzZS5FcnJvcihQYXJzZS5FcnJvci5PQkpFQ1RfTk9UX0ZPVU5ELCAnSW52YWxpZCB1c2VybmFtZS9wYXNzd29yZC4nKTtcbiAgICAgIH1cblxuICAgICAgbGV0IHVzZXI7XG4gICAgICBsZXQgaXNWYWxpZFBhc3N3b3JkID0gZmFsc2U7XG4gICAgICBsZXQgcXVlcnk7XG4gICAgICBpZiAoZW1haWwgJiYgdXNlcm5hbWUpIHtcbiAgICAgICAgcXVlcnkgPSB7IGVtYWlsLCB1c2VybmFtZSB9O1xuICAgICAgfSBlbHNlIGlmIChlbWFpbCkge1xuICAgICAgICBxdWVyeSA9IHsgZW1haWwgfTtcbiAgICAgIH0gZWxzZSB7XG4gICAgICAgIHF1ZXJ5ID0geyAkb3I6IFt7IHVzZXJuYW1lIH0sIHsgZW1haWw6IHVzZXJuYW1lIH1dIH07XG4gICAgICB9XG4gICAgICByZXR1cm4gcmVxLmNvbmZpZy5kYXRhYmFzZVxuICAgICAgICAuZmluZCgnX1VzZXInLCBxdWVyeSlcbiAgICAgICAgLnRoZW4ocmVzdWx0cyA9PiB7XG4gICAgICAgICAgaWYgKCFyZXN1bHRzLmxlbmd0aCkge1xuICAgICAgICAgICAgdGhyb3cgbmV3IFBhcnNlLkVycm9yKFBhcnNlLkVycm9yLk9CSkVDVF9OT1RfRk9VTkQsICdJbnZhbGlkIHVzZXJuYW1lL3Bhc3N3b3JkLicpO1xuICAgICAgICAgIH1cblxuICAgICAgICAgIGlmIChyZXN1bHRzLmxlbmd0aCA+IDEpIHtcbiAgICAgICAgICAgIC8vIGNvcm5lciBjYXNlIHdoZXJlIHVzZXIxIGhhcyB1c2VybmFtZSA9PSB1c2VyMiBlbWFpbFxuICAgICAgICAgICAgcmVxLmNvbmZpZy5sb2dnZXJDb250cm9sbGVyLndhcm4oXG4gICAgICAgICAgICAgIFwiVGhlcmUgaXMgYSB1c2VyIHdoaWNoIGVtYWlsIGlzIHRoZSBzYW1lIGFzIGFub3RoZXIgdXNlcidzIHVzZXJuYW1lLCBsb2dnaW5nIGluIGJhc2VkIG9uIHVzZXJuYW1lXCJcbiAgICAgICAgICAgICk7XG4gICAgICAgICAgICB1c2VyID0gcmVzdWx0cy5maWx0ZXIodXNlciA9PiB1c2VyLnVzZXJuYW1lID09PSB1c2VybmFtZSlbMF07XG4gICAgICAgICAgfSBlbHNlIHtcbiAgICAgICAgICAgIHVzZXIgPSByZXN1bHRzWzBdO1xuICAgICAgICAgIH1cblxuICAgICAgICAgIHJldHVybiBwYXNzd29yZENyeXB0by5jb21wYXJlKHBhc3N3b3JkLCB1c2VyLnBhc3N3b3JkKTtcbiAgICAgICAgfSlcbiAgICAgICAgLnRoZW4oY29ycmVjdCA9PiB7XG4gICAgICAgICAgaXNWYWxpZFBhc3N3b3JkID0gY29ycmVjdDtcbiAgICAgICAgICBjb25zdCBhY2NvdW50TG9ja291dFBvbGljeSA9IG5ldyBBY2NvdW50TG9ja291dCh1c2VyLCByZXEuY29uZmlnKTtcbiAgICAgICAgICByZXR1cm4gYWNjb3VudExvY2tvdXRQb2xpY3kuaGFuZGxlTG9naW5BdHRlbXB0KGlzVmFsaWRQYXNzd29yZCk7XG4gICAgICAgIH0pXG4gICAgICAgIC50aGVuKCgpID0+IHtcbiAgICAgICAgICBpZiAoIWlzVmFsaWRQYXNzd29yZCkge1xuICAgICAgICAgICAgdGhyb3cgbmV3IFBhcnNlLkVycm9yKFBhcnNlLkVycm9yLk9CSkVDVF9OT1RfRk9VTkQsICdJbnZhbGlkIHVzZXJuYW1lL3Bhc3N3b3JkLicpO1xuICAgICAgICAgIH1cbiAgICAgICAgICAvLyBFbnN1cmUgdGhlIHVzZXIgaXNuJ3QgbG9ja2VkIG91dFxuICAgICAgICAgIC8vIEEgbG9ja2VkIG91dCB1c2VyIHdvbid0IGJlIGFibGUgdG8gbG9naW5cbiAgICAgICAgICAvLyBUbyBsb2NrIGEgdXNlciBvdXQsIGp1c3Qgc2V0IHRoZSBBQ0wgdG8gYG1hc3RlcktleWAgb25seSAgKHt9KS5cbiAgICAgICAgICAvLyBFbXB0eSBBQ0wgaXMgT0tcbiAgICAgICAgICBpZiAoIXJlcS5hdXRoLmlzTWFzdGVyICYmIHVzZXIuQUNMICYmIE9iamVjdC5rZXlzKHVzZXIuQUNMKS5sZW5ndGggPT0gMCkge1xuICAgICAgICAgICAgdGhyb3cgbmV3IFBhcnNlLkVycm9yKFBhcnNlLkVycm9yLk9CSkVDVF9OT1RfRk9VTkQsICdJbnZhbGlkIHVzZXJuYW1lL3Bhc3N3b3JkLicpO1xuICAgICAgICAgIH1cbiAgICAgICAgICBpZiAoXG4gICAgICAgICAgICByZXEuY29uZmlnLnZlcmlmeVVzZXJFbWFpbHMgJiZcbiAgICAgICAgICAgIHJlcS5jb25maWcucHJldmVudExvZ2luV2l0aFVudmVyaWZpZWRFbWFpbCAmJlxuICAgICAgICAgICAgIXVzZXIuZW1haWxWZXJpZmllZFxuICAgICAgICAgICkge1xuICAgICAgICAgICAgdGhyb3cgbmV3IFBhcnNlLkVycm9yKFBhcnNlLkVycm9yLkVNQUlMX05PVF9GT1VORCwgJ1VzZXIgZW1haWwgaXMgbm90IHZlcmlmaWVkLicpO1xuICAgICAgICAgIH1cblxuICAgICAgICAgIGRlbGV0ZSB1c2VyLnBhc3N3b3JkO1xuXG4gICAgICAgICAgLy8gU29tZXRpbWVzIHRoZSBhdXRoRGF0YSBzdGlsbCBoYXMgbnVsbCBvbiB0aGF0IGtleXNcbiAgICAgICAgICAvLyBodHRwczovL2dpdGh1Yi5jb20vcGFyc2UtY29tbXVuaXR5L3BhcnNlLXNlcnZlci9pc3N1ZXMvOTM1XG4gICAgICAgICAgaWYgKHVzZXIuYXV0aERhdGEpIHtcbiAgICAgICAgICAgIE9iamVjdC5rZXlzKHVzZXIuYXV0aERhdGEpLmZvckVhY2gocHJvdmlkZXIgPT4ge1xuICAgICAgICAgICAgICBpZiAodXNlci5hdXRoRGF0YVtwcm92aWRlcl0gPT09IG51bGwpIHtcbiAgICAgICAgICAgICAgICBkZWxldGUgdXNlci5hdXRoRGF0YVtwcm92aWRlcl07XG4gICAgICAgICAgICAgIH1cbiAgICAgICAgICAgIH0pO1xuICAgICAgICAgICAgaWYgKE9iamVjdC5rZXlzKHVzZXIuYXV0aERhdGEpLmxlbmd0aCA9PSAwKSB7XG4gICAgICAgICAgICAgIGRlbGV0ZSB1c2VyLmF1dGhEYXRhO1xuICAgICAgICAgICAgfVxuICAgICAgICAgIH1cblxuICAgICAgICAgIHJldHVybiByZXNvbHZlKHVzZXIpO1xuICAgICAgICB9KVxuICAgICAgICAuY2F0Y2goZXJyb3IgPT4ge1xuICAgICAgICAgIHJldHVybiByZWplY3QoZXJyb3IpO1xuICAgICAgICB9KTtcbiAgICB9KTtcbiAgfVxuXG4gIGhhbmRsZU1lKHJlcSkge1xuICAgIGlmICghcmVxLmluZm8gfHwgIXJlcS5pbmZvLnNlc3Npb25Ub2tlbikge1xuICAgICAgdGhyb3cgbmV3IFBhcnNlLkVycm9yKFBhcnNlLkVycm9yLklOVkFMSURfU0VTU0lPTl9UT0tFTiwgJ0ludmFsaWQgc2Vzc2lvbiB0b2tlbicpO1xuICAgIH1cbiAgICBjb25zdCBzZXNzaW9uVG9rZW4gPSByZXEuaW5mby5zZXNzaW9uVG9rZW47XG4gICAgcmV0dXJuIHJlc3RcbiAgICAgIC5maW5kKFxuICAgICAgICByZXEuY29uZmlnLFxuICAgICAgICBBdXRoLm1hc3RlcihyZXEuY29uZmlnKSxcbiAgICAgICAgJ19TZXNzaW9uJyxcbiAgICAgICAgeyBzZXNzaW9uVG9rZW4gfSxcbiAgICAgICAgeyBpbmNsdWRlOiAndXNlcicgfSxcbiAgICAgICAgcmVxLmluZm8uY2xpZW50U0RLLFxuICAgICAgICByZXEuaW5mby5jb250ZXh0XG4gICAgICApXG4gICAgICAudGhlbihyZXNwb25zZSA9PiB7XG4gICAgICAgIGlmICghcmVzcG9uc2UucmVzdWx0cyB8fCByZXNwb25zZS5yZXN1bHRzLmxlbmd0aCA9PSAwIHx8ICFyZXNwb25zZS5yZXN1bHRzWzBdLnVzZXIpIHtcbiAgICAgICAgICB0aHJvdyBuZXcgUGFyc2UuRXJyb3IoUGFyc2UuRXJyb3IuSU5WQUxJRF9TRVNTSU9OX1RPS0VOLCAnSW52YWxpZCBzZXNzaW9uIHRva2VuJyk7XG4gICAgICAgIH0gZWxzZSB7XG4gICAgICAgICAgY29uc3QgdXNlciA9IHJlc3BvbnNlLnJlc3VsdHNbMF0udXNlcjtcbiAgICAgICAgICAvLyBTZW5kIHRva2VuIGJhY2sgb24gdGhlIGxvZ2luLCBiZWNhdXNlIFNES3MgZXhwZWN0IHRoYXQuXG4gICAgICAgICAgdXNlci5zZXNzaW9uVG9rZW4gPSBzZXNzaW9uVG9rZW47XG5cbiAgICAgICAgICAvLyBSZW1vdmUgaGlkZGVuIHByb3BlcnRpZXMuXG4gICAgICAgICAgVXNlcnNSb3V0ZXIucmVtb3ZlSGlkZGVuUHJvcGVydGllcyh1c2VyKTtcbiAgICAgICAgICByZXR1cm4geyByZXNwb25zZTogdXNlciB9O1xuICAgICAgICB9XG4gICAgICB9KTtcbiAgfVxuXG4gIGFzeW5jIGhhbmRsZUxvZ0luKHJlcSkge1xuICAgIGNvbnN0IHVzZXIgPSBhd2FpdCB0aGlzLl9hdXRoZW50aWNhdGVVc2VyRnJvbVJlcXVlc3QocmVxKTtcbiAgICBjb25zdCBhdXRoRGF0YSA9IHJlcS5ib2R5ICYmIHJlcS5ib2R5LmF1dGhEYXRhO1xuICAgIC8vIENoZWNrIGlmIHVzZXIgaGFzIHByb3ZpZGVkIGhpcyByZXF1aXJlZCBhdXRoIHByb3ZpZGVyc1xuICAgIEF1dGguY2hlY2tJZlVzZXJIYXNQcm92aWRlZENvbmZpZ3VyZWRQcm92aWRlcnNGb3JMb2dpbihhdXRoRGF0YSwgdXNlci5hdXRoRGF0YSwgcmVxLmNvbmZpZyk7XG5cbiAgICBsZXQgYXV0aERhdGFSZXNwb25zZTtcbiAgICBsZXQgdmFsaWRhdGVkQXV0aERhdGE7XG4gICAgaWYgKGF1dGhEYXRhKSB7XG4gICAgICBjb25zdCByZXMgPSBhd2FpdCBBdXRoLmhhbmRsZUF1dGhEYXRhVmFsaWRhdGlvbihhdXRoRGF0YSwgcmVxLCB1c2VyKTtcbiAgICAgIGF1dGhEYXRhUmVzcG9uc2UgPSByZXMuYXV0aERhdGFSZXNwb25zZTtcbiAgICAgIHZhbGlkYXRlZEF1dGhEYXRhID0gcmVzLmF1dGhEYXRhO1xuICAgIH1cblxuICAgIC8vIGhhbmRsZSBwYXNzd29yZCBleHBpcnkgcG9saWN5XG4gICAgaWYgKHJlcS5jb25maWcucGFzc3dvcmRQb2xpY3kgJiYgcmVxLmNvbmZpZy5wYXNzd29yZFBvbGljeS5tYXhQYXNzd29yZEFnZSkge1xuICAgICAgbGV0IGNoYW5nZWRBdCA9IHVzZXIuX3Bhc3N3b3JkX2NoYW5nZWRfYXQ7XG5cbiAgICAgIGlmICghY2hhbmdlZEF0KSB7XG4gICAgICAgIC8vIHBhc3N3b3JkIHdhcyBjcmVhdGVkIGJlZm9yZSBleHBpcnkgcG9saWN5IHdhcyBlbmFibGVkLlxuICAgICAgICAvLyBzaW1wbHkgdXBkYXRlIF9Vc2VyIG9iamVjdCBzbyB0aGF0IGl0IHdpbGwgc3RhcnQgZW5mb3JjaW5nIGZyb20gbm93XG4gICAgICAgIGNoYW5nZWRBdCA9IG5ldyBEYXRlKCk7XG4gICAgICAgIHJlcS5jb25maWcuZGF0YWJhc2UudXBkYXRlKFxuICAgICAgICAgICdfVXNlcicsXG4gICAgICAgICAgeyB1c2VybmFtZTogdXNlci51c2VybmFtZSB9LFxuICAgICAgICAgIHsgX3Bhc3N3b3JkX2NoYW5nZWRfYXQ6IFBhcnNlLl9lbmNvZGUoY2hhbmdlZEF0KSB9XG4gICAgICAgICk7XG4gICAgICB9IGVsc2Uge1xuICAgICAgICAvLyBjaGVjayB3aGV0aGVyIHRoZSBwYXNzd29yZCBoYXMgZXhwaXJlZFxuICAgICAgICBpZiAoY2hhbmdlZEF0Ll9fdHlwZSA9PSAnRGF0ZScpIHtcbiAgICAgICAgICBjaGFuZ2VkQXQgPSBuZXcgRGF0ZShjaGFuZ2VkQXQuaXNvKTtcbiAgICAgICAgfVxuICAgICAgICAvLyBDYWxjdWxhdGUgdGhlIGV4cGlyeSB0aW1lLlxuICAgICAgICBjb25zdCBleHBpcmVzQXQgPSBuZXcgRGF0ZShcbiAgICAgICAgICBjaGFuZ2VkQXQuZ2V0VGltZSgpICsgODY0MDAwMDAgKiByZXEuY29uZmlnLnBhc3N3b3JkUG9saWN5Lm1heFBhc3N3b3JkQWdlXG4gICAgICAgICk7XG4gICAgICAgIGlmIChleHBpcmVzQXQgPCBuZXcgRGF0ZSgpKVxuICAgICAgICAgIC8vIGZhaWwgb2YgY3VycmVudCB0aW1lIGlzIHBhc3QgcGFzc3dvcmQgZXhwaXJ5IHRpbWVcbiAgICAgICAgICB0aHJvdyBuZXcgUGFyc2UuRXJyb3IoXG4gICAgICAgICAgICBQYXJzZS5FcnJvci5PQkpFQ1RfTk9UX0ZPVU5ELFxuICAgICAgICAgICAgJ1lvdXIgcGFzc3dvcmQgaGFzIGV4cGlyZWQuIFBsZWFzZSByZXNldCB5b3VyIHBhc3N3b3JkLidcbiAgICAgICAgICApO1xuICAgICAgfVxuICAgIH1cblxuICAgIC8vIFJlbW92ZSBoaWRkZW4gcHJvcGVydGllcy5cbiAgICBVc2Vyc1JvdXRlci5yZW1vdmVIaWRkZW5Qcm9wZXJ0aWVzKHVzZXIpO1xuXG4gICAgcmVxLmNvbmZpZy5maWxlc0NvbnRyb2xsZXIuZXhwYW5kRmlsZXNJbk9iamVjdChyZXEuY29uZmlnLCB1c2VyKTtcblxuICAgIC8vIEJlZm9yZSBsb2dpbiB0cmlnZ2VyOyB0aHJvd3MgaWYgZmFpbHVyZVxuICAgIGF3YWl0IG1heWJlUnVuVHJpZ2dlcihcbiAgICAgIFRyaWdnZXJUeXBlcy5iZWZvcmVMb2dpbixcbiAgICAgIHJlcS5hdXRoLFxuICAgICAgUGFyc2UuVXNlci5mcm9tSlNPTihPYmplY3QuYXNzaWduKHsgY2xhc3NOYW1lOiAnX1VzZXInIH0sIHVzZXIpKSxcbiAgICAgIG51bGwsXG4gICAgICByZXEuY29uZmlnXG4gICAgKTtcblxuICAgIC8vIElmIHdlIGhhdmUgc29tZSBuZXcgdmFsaWRhdGVkIGF1dGhEYXRhXG4gICAgLy8gdXBkYXRlIGRpcmVjdGx5XG4gICAgaWYgKHZhbGlkYXRlZEF1dGhEYXRhICYmIE9iamVjdC5rZXlzKHZhbGlkYXRlZEF1dGhEYXRhKS5sZW5ndGgpIHtcbiAgICAgIGF3YWl0IHJlcS5jb25maWcuZGF0YWJhc2UudXBkYXRlKFxuICAgICAgICAnX1VzZXInLFxuICAgICAgICB7IG9iamVjdElkOiB1c2VyLm9iamVjdElkIH0sXG4gICAgICAgIHsgYXV0aERhdGE6IHZhbGlkYXRlZEF1dGhEYXRhIH0sXG4gICAgICAgIHt9XG4gICAgICApO1xuICAgIH1cblxuICAgIGNvbnN0IHsgc2Vzc2lvbkRhdGEsIGNyZWF0ZVNlc3Npb24gfSA9IEF1dGguY3JlYXRlU2Vzc2lvbihyZXEuY29uZmlnLCB7XG4gICAgICB1c2VySWQ6IHVzZXIub2JqZWN0SWQsXG4gICAgICBjcmVhdGVkV2l0aDoge1xuICAgICAgICBhY3Rpb246ICdsb2dpbicsXG4gICAgICAgIGF1dGhQcm92aWRlcjogJ3Bhc3N3b3JkJyxcbiAgICAgIH0sXG4gICAgICBpbnN0YWxsYXRpb25JZDogcmVxLmluZm8uaW5zdGFsbGF0aW9uSWQsXG4gICAgfSk7XG5cbiAgICB1c2VyLnNlc3Npb25Ub2tlbiA9IHNlc3Npb25EYXRhLnNlc3Npb25Ub2tlbjtcblxuICAgIGF3YWl0IGNyZWF0ZVNlc3Npb24oKTtcblxuICAgIGNvbnN0IGFmdGVyTG9naW5Vc2VyID0gUGFyc2UuVXNlci5mcm9tSlNPTihPYmplY3QuYXNzaWduKHsgY2xhc3NOYW1lOiAnX1VzZXInIH0sIHVzZXIpKTtcbiAgICBtYXliZVJ1blRyaWdnZXIoXG4gICAgICBUcmlnZ2VyVHlwZXMuYWZ0ZXJMb2dpbixcbiAgICAgIHsgLi4ucmVxLmF1dGgsIHVzZXI6IGFmdGVyTG9naW5Vc2VyIH0sXG4gICAgICBhZnRlckxvZ2luVXNlcixcbiAgICAgIG51bGwsXG4gICAgICByZXEuY29uZmlnXG4gICAgKTtcblxuICAgIGlmIChhdXRoRGF0YVJlc3BvbnNlKSB7XG4gICAgICB1c2VyLmF1dGhEYXRhUmVzcG9uc2UgPSBhdXRoRGF0YVJlc3BvbnNlO1xuICAgIH1cblxuICAgIHJldHVybiB7IHJlc3BvbnNlOiB1c2VyIH07XG4gIH1cblxuICBoYW5kbGVWZXJpZnlQYXNzd29yZChyZXEpIHtcbiAgICByZXR1cm4gdGhpcy5fYXV0aGVudGljYXRlVXNlckZyb21SZXF1ZXN0KHJlcSlcbiAgICAgIC50aGVuKHVzZXIgPT4ge1xuICAgICAgICAvLyBSZW1vdmUgaGlkZGVuIHByb3BlcnRpZXMuXG4gICAgICAgIFVzZXJzUm91dGVyLnJlbW92ZUhpZGRlblByb3BlcnRpZXModXNlcik7XG5cbiAgICAgICAgcmV0dXJuIHsgcmVzcG9uc2U6IHVzZXIgfTtcbiAgICAgIH0pXG4gICAgICAuY2F0Y2goZXJyb3IgPT4ge1xuICAgICAgICB0aHJvdyBlcnJvcjtcbiAgICAgIH0pO1xuICB9XG5cbiAgaGFuZGxlTG9nT3V0KHJlcSkge1xuICAgIGNvbnN0IHN1Y2Nlc3MgPSB7IHJlc3BvbnNlOiB7fSB9O1xuICAgIGlmIChyZXEuaW5mbyAmJiByZXEuaW5mby5zZXNzaW9uVG9rZW4pIHtcbiAgICAgIHJldHVybiByZXN0XG4gICAgICAgIC5maW5kKFxuICAgICAgICAgIHJlcS5jb25maWcsXG4gICAgICAgICAgQXV0aC5tYXN0ZXIocmVxLmNvbmZpZyksXG4gICAgICAgICAgJ19TZXNzaW9uJyxcbiAgICAgICAgICB7IHNlc3Npb25Ub2tlbjogcmVxLmluZm8uc2Vzc2lvblRva2VuIH0sXG4gICAgICAgICAgdW5kZWZpbmVkLFxuICAgICAgICAgIHJlcS5pbmZvLmNsaWVudFNESyxcbiAgICAgICAgICByZXEuaW5mby5jb250ZXh0XG4gICAgICAgIClcbiAgICAgICAgLnRoZW4ocmVjb3JkcyA9PiB7XG4gICAgICAgICAgaWYgKHJlY29yZHMucmVzdWx0cyAmJiByZWNvcmRzLnJlc3VsdHMubGVuZ3RoKSB7XG4gICAgICAgICAgICByZXR1cm4gcmVzdFxuICAgICAgICAgICAgICAuZGVsKFxuICAgICAgICAgICAgICAgIHJlcS5jb25maWcsXG4gICAgICAgICAgICAgICAgQXV0aC5tYXN0ZXIocmVxLmNvbmZpZyksXG4gICAgICAgICAgICAgICAgJ19TZXNzaW9uJyxcbiAgICAgICAgICAgICAgICByZWNvcmRzLnJlc3VsdHNbMF0ub2JqZWN0SWQsXG4gICAgICAgICAgICAgICAgcmVxLmluZm8uY29udGV4dFxuICAgICAgICAgICAgICApXG4gICAgICAgICAgICAgIC50aGVuKCgpID0+IHtcbiAgICAgICAgICAgICAgICB0aGlzLl9ydW5BZnRlckxvZ291dFRyaWdnZXIocmVxLCByZWNvcmRzLnJlc3VsdHNbMF0pO1xuICAgICAgICAgICAgICAgIHJldHVybiBQcm9taXNlLnJlc29sdmUoc3VjY2Vzcyk7XG4gICAgICAgICAgICAgIH0pO1xuICAgICAgICAgIH1cbiAgICAgICAgICByZXR1cm4gUHJvbWlzZS5yZXNvbHZlKHN1Y2Nlc3MpO1xuICAgICAgICB9KTtcbiAgICB9XG4gICAgcmV0dXJuIFByb21pc2UucmVzb2x2ZShzdWNjZXNzKTtcbiAgfVxuXG4gIF9ydW5BZnRlckxvZ291dFRyaWdnZXIocmVxLCBzZXNzaW9uKSB7XG4gICAgLy8gQWZ0ZXIgbG9nb3V0IHRyaWdnZXJcbiAgICBtYXliZVJ1blRyaWdnZXIoXG4gICAgICBUcmlnZ2VyVHlwZXMuYWZ0ZXJMb2dvdXQsXG4gICAgICByZXEuYXV0aCxcbiAgICAgIFBhcnNlLlNlc3Npb24uZnJvbUpTT04oT2JqZWN0LmFzc2lnbih7IGNsYXNzTmFtZTogJ19TZXNzaW9uJyB9LCBzZXNzaW9uKSksXG4gICAgICBudWxsLFxuICAgICAgcmVxLmNvbmZpZ1xuICAgICk7XG4gIH1cblxuICBfdGhyb3dPbkJhZEVtYWlsQ29uZmlnKHJlcSkge1xuICAgIHRyeSB7XG4gICAgICBDb25maWcudmFsaWRhdGVFbWFpbENvbmZpZ3VyYXRpb24oe1xuICAgICAgICBlbWFpbEFkYXB0ZXI6IHJlcS5jb25maWcudXNlckNvbnRyb2xsZXIuYWRhcHRlcixcbiAgICAgICAgYXBwTmFtZTogcmVxLmNvbmZpZy5hcHBOYW1lLFxuICAgICAgICBwdWJsaWNTZXJ2ZXJVUkw6IHJlcS5jb25maWcucHVibGljU2VydmVyVVJMLFxuICAgICAgICBlbWFpbFZlcmlmeVRva2VuVmFsaWRpdHlEdXJhdGlvbjogcmVxLmNvbmZpZy5lbWFpbFZlcmlmeVRva2VuVmFsaWRpdHlEdXJhdGlvbixcbiAgICAgICAgZW1haWxWZXJpZnlUb2tlblJldXNlSWZWYWxpZDogcmVxLmNvbmZpZy5lbWFpbFZlcmlmeVRva2VuUmV1c2VJZlZhbGlkLFxuICAgICAgfSk7XG4gICAgfSBjYXRjaCAoZSkge1xuICAgICAgaWYgKHR5cGVvZiBlID09PSAnc3RyaW5nJykge1xuICAgICAgICAvLyBNYXliZSB3ZSBuZWVkIGEgQmFkIENvbmZpZ3VyYXRpb24gZXJyb3IsIGJ1dCB0aGUgU0RLcyB3b24ndCB1bmRlcnN0YW5kIGl0LiBGb3Igbm93LCBJbnRlcm5hbCBTZXJ2ZXIgRXJyb3IuXG4gICAgICAgIHRocm93IG5ldyBQYXJzZS5FcnJvcihcbiAgICAgICAgICBQYXJzZS5FcnJvci5JTlRFUk5BTF9TRVJWRVJfRVJST1IsXG4gICAgICAgICAgJ0FuIGFwcE5hbWUsIHB1YmxpY1NlcnZlclVSTCwgYW5kIGVtYWlsQWRhcHRlciBhcmUgcmVxdWlyZWQgZm9yIHBhc3N3b3JkIHJlc2V0IGFuZCBlbWFpbCB2ZXJpZmljYXRpb24gZnVuY3Rpb25hbGl0eS4nXG4gICAgICAgICk7XG4gICAgICB9IGVsc2Uge1xuICAgICAgICB0aHJvdyBlO1xuICAgICAgfVxuICAgIH1cbiAgfVxuXG4gIGhhbmRsZVJlc2V0UmVxdWVzdChyZXEpIHtcbiAgICB0aGlzLl90aHJvd09uQmFkRW1haWxDb25maWcocmVxKTtcblxuICAgIGNvbnN0IHsgZW1haWwgfSA9IHJlcS5ib2R5O1xuICAgIGlmICghZW1haWwpIHtcbiAgICAgIHRocm93IG5ldyBQYXJzZS5FcnJvcihQYXJzZS5FcnJvci5FTUFJTF9NSVNTSU5HLCAneW91IG11c3QgcHJvdmlkZSBhbiBlbWFpbCcpO1xuICAgIH1cbiAgICBpZiAodHlwZW9mIGVtYWlsICE9PSAnc3RyaW5nJykge1xuICAgICAgdGhyb3cgbmV3IFBhcnNlLkVycm9yKFxuICAgICAgICBQYXJzZS5FcnJvci5JTlZBTElEX0VNQUlMX0FERFJFU1MsXG4gICAgICAgICd5b3UgbXVzdCBwcm92aWRlIGEgdmFsaWQgZW1haWwgc3RyaW5nJ1xuICAgICAgKTtcbiAgICB9XG4gICAgY29uc3QgdXNlckNvbnRyb2xsZXIgPSByZXEuY29uZmlnLnVzZXJDb250cm9sbGVyO1xuICAgIHJldHVybiB1c2VyQ29udHJvbGxlci5zZW5kUGFzc3dvcmRSZXNldEVtYWlsKGVtYWlsKS50aGVuKFxuICAgICAgKCkgPT4ge1xuICAgICAgICByZXR1cm4gUHJvbWlzZS5yZXNvbHZlKHtcbiAgICAgICAgICByZXNwb25zZToge30sXG4gICAgICAgIH0pO1xuICAgICAgfSxcbiAgICAgIGVyciA9PiB7XG4gICAgICAgIGlmIChlcnIuY29kZSA9PT0gUGFyc2UuRXJyb3IuT0JKRUNUX05PVF9GT1VORCkge1xuICAgICAgICAgIC8vIFJldHVybiBzdWNjZXNzIHNvIHRoYXQgdGhpcyBlbmRwb2ludCBjYW4ndFxuICAgICAgICAgIC8vIGJlIHVzZWQgdG8gZW51bWVyYXRlIHZhbGlkIGVtYWlsc1xuICAgICAgICAgIHJldHVybiBQcm9taXNlLnJlc29sdmUoe1xuICAgICAgICAgICAgcmVzcG9uc2U6IHt9LFxuICAgICAgICAgIH0pO1xuICAgICAgICB9IGVsc2Uge1xuICAgICAgICAgIHRocm93IGVycjtcbiAgICAgICAgfVxuICAgICAgfVxuICAgICk7XG4gIH1cblxuICBoYW5kbGVWZXJpZmljYXRpb25FbWFpbFJlcXVlc3QocmVxKSB7XG4gICAgdGhpcy5fdGhyb3dPbkJhZEVtYWlsQ29uZmlnKHJlcSk7XG5cbiAgICBjb25zdCB7IGVtYWlsIH0gPSByZXEuYm9keTtcbiAgICBpZiAoIWVtYWlsKSB7XG4gICAgICB0aHJvdyBuZXcgUGFyc2UuRXJyb3IoUGFyc2UuRXJyb3IuRU1BSUxfTUlTU0lORywgJ3lvdSBtdXN0IHByb3ZpZGUgYW4gZW1haWwnKTtcbiAgICB9XG4gICAgaWYgKHR5cGVvZiBlbWFpbCAhPT0gJ3N0cmluZycpIHtcbiAgICAgIHRocm93IG5ldyBQYXJzZS5FcnJvcihcbiAgICAgICAgUGFyc2UuRXJyb3IuSU5WQUxJRF9FTUFJTF9BRERSRVNTLFxuICAgICAgICAneW91IG11c3QgcHJvdmlkZSBhIHZhbGlkIGVtYWlsIHN0cmluZydcbiAgICAgICk7XG4gICAgfVxuXG4gICAgcmV0dXJuIHJlcS5jb25maWcuZGF0YWJhc2UuZmluZCgnX1VzZXInLCB7IGVtYWlsOiBlbWFpbCB9KS50aGVuKHJlc3VsdHMgPT4ge1xuICAgICAgaWYgKCFyZXN1bHRzLmxlbmd0aCB8fCByZXN1bHRzLmxlbmd0aCA8IDEpIHtcbiAgICAgICAgdGhyb3cgbmV3IFBhcnNlLkVycm9yKFBhcnNlLkVycm9yLkVNQUlMX05PVF9GT1VORCwgYE5vIHVzZXIgZm91bmQgd2l0aCBlbWFpbCAke2VtYWlsfWApO1xuICAgICAgfVxuICAgICAgY29uc3QgdXNlciA9IHJlc3VsdHNbMF07XG5cbiAgICAgIC8vIHJlbW92ZSBwYXNzd29yZCBmaWVsZCwgbWVzc2VzIHdpdGggc2F2aW5nIG9uIHBvc3RncmVzXG4gICAgICBkZWxldGUgdXNlci5wYXNzd29yZDtcblxuICAgICAgaWYgKHVzZXIuZW1haWxWZXJpZmllZCkge1xuICAgICAgICB0aHJvdyBuZXcgUGFyc2UuRXJyb3IoUGFyc2UuRXJyb3IuT1RIRVJfQ0FVU0UsIGBFbWFpbCAke2VtYWlsfSBpcyBhbHJlYWR5IHZlcmlmaWVkLmApO1xuICAgICAgfVxuXG4gICAgICBjb25zdCB1c2VyQ29udHJvbGxlciA9IHJlcS5jb25maWcudXNlckNvbnRyb2xsZXI7XG4gICAgICByZXR1cm4gdXNlckNvbnRyb2xsZXIucmVnZW5lcmF0ZUVtYWlsVmVyaWZ5VG9rZW4odXNlcikudGhlbigoKSA9PiB7XG4gICAgICAgIHVzZXJDb250cm9sbGVyLnNlbmRWZXJpZmljYXRpb25FbWFpbCh1c2VyKTtcbiAgICAgICAgcmV0dXJuIHsgcmVzcG9uc2U6IHt9IH07XG4gICAgICB9KTtcbiAgICB9KTtcbiAgfVxuXG4gIGFzeW5jIGhhbmRsZUNoYWxsZW5nZShyZXEpIHtcbiAgICBjb25zdCB7IHVzZXJuYW1lLCBlbWFpbCwgcGFzc3dvcmQsIGF1dGhEYXRhLCBjaGFsbGVuZ2VEYXRhIH0gPSByZXEuYm9keTtcblxuICAgIC8vIGlmIHVzZXJuYW1lIG9yIGVtYWlsIHByb3ZpZGVkIHdpdGggcGFzc3dvcmQgdHJ5IHRvIGZpbmQgdGhlIHVzZXIgd2l0aCBkZWZhdWx0XG4gICAgLy8gc3lzdGVtXG4gICAgbGV0IHVzZXI7XG4gICAgaWYgKHVzZXJuYW1lIHx8IGVtYWlsKSB7XG4gICAgICBpZiAoIXBhc3N3b3JkKVxuICAgICAgICB0aHJvdyBuZXcgUGFyc2UuRXJyb3IoXG4gICAgICAgICAgUGFyc2UuRXJyb3IuT1RIRVJfQ0FVU0UsXG4gICAgICAgICAgJ1lvdSBwcm92aWRlZCB1c2VybmFtZSBvciBlbWFpbCwgeW91IG5lZWQgdG8gYWxzbyBwcm92aWRlIHBhc3N3b3JkLidcbiAgICAgICAgKTtcbiAgICAgIHVzZXIgPSBhd2FpdCB0aGlzLl9hdXRoZW50aWNhdGVVc2VyRnJvbVJlcXVlc3QocmVxKTtcbiAgICB9XG5cbiAgICBpZiAoIWNoYWxsZW5nZURhdGEpIHRocm93IG5ldyBQYXJzZS5FcnJvcihQYXJzZS5FcnJvci5PVEhFUl9DQVVTRSwgJ05vdGhpbmcgdG8gY2hhbGxlbmdlLicpO1xuXG4gICAgaWYgKHR5cGVvZiBjaGFsbGVuZ2VEYXRhICE9PSAnb2JqZWN0JylcbiAgICAgIHRocm93IG5ldyBQYXJzZS5FcnJvcihQYXJzZS5FcnJvci5PVEhFUl9DQVVTRSwgJ2NoYWxsZW5nZURhdGEgc2hvdWxkIGJlIGFuIG9iamVjdC4nKTtcblxuICAgIC8vIFRyeSB0byBmaW5kIHVzZXIgYnkgYXV0aERhdGFcbiAgICBpZiAoYXV0aERhdGEpIHtcbiAgICAgIGlmICh0eXBlb2YgYXV0aERhdGEgIT09ICdvYmplY3QnKVxuICAgICAgICB0aHJvdyBuZXcgUGFyc2UuRXJyb3IoUGFyc2UuRXJyb3IuT1RIRVJfQ0FVU0UsICdhdXRoRGF0YSBzaG91bGQgYmUgYW4gb2JqZWN0LicpO1xuICAgICAgLy8gVG8gYXZvaWQgc2VjdXJpdHkgaXNzdWUgd2Ugc2hvdWxkIG9ubHkgc3VwcG9ydCBvbmUgaWRlbnRpZnlpbmcgbWV0aG9kXG4gICAgICBpZiAodXNlcilcbiAgICAgICAgdGhyb3cgbmV3IFBhcnNlLkVycm9yKFxuICAgICAgICAgIFBhcnNlLkVycm9yLk9USEVSX0NBVVNFLFxuICAgICAgICAgICdZb3UgY2FudCBwcm92aWRlIHVzZXJuYW1lL2VtYWlsIGFuZCBhdXRoRGF0YSwgb25seSB1c2Ugb25lIGlkZW50aWZpY2F0aW9uIG1ldGhvZC4nXG4gICAgICAgICk7XG5cbiAgICAgIGlmIChPYmplY3Qua2V5cyhhdXRoRGF0YSkuZmlsdGVyKGtleSA9PiBhdXRoRGF0YVtrZXldLmlkKS5sZW5ndGggPiAxKSB7XG4gICAgICAgIHRocm93IG5ldyBQYXJzZS5FcnJvcihcbiAgICAgICAgICBQYXJzZS5FcnJvci5PVEhFUl9DQVVTRSxcbiAgICAgICAgICAnWW91IGNhbnQgcHJvdmlkZSBtb3JlIHRoYW4gb25lIGF1dGhEYXRhIHByb3ZpZGVyIHdpdGggYW4gaWQuJ1xuICAgICAgICApO1xuICAgICAgfVxuXG4gICAgICBjb25zdCByZXN1bHRzID0gYXdhaXQgQXV0aC5maW5kVXNlcnNXaXRoQXV0aERhdGEocmVxLmNvbmZpZywgYXV0aERhdGEpO1xuXG4gICAgICB0cnkge1xuICAgICAgICBpZiAoIXJlc3VsdHNbMF0gfHwgcmVzdWx0cy5sZW5ndGggPiAxKVxuICAgICAgICAgIHRocm93IG5ldyBQYXJzZS5FcnJvcihQYXJzZS5FcnJvci5PVEhFUl9DQVVTRSwgJ1VzZXIgbm90IGZvdW5kLicpO1xuXG4gICAgICAgIC8vIEZpbmQgdGhlIHByb3ZpZGVyIHVzZWQgdG8gZmluZCB0aGUgdXNlclxuICAgICAgICBjb25zdCBwcm92aWRlciA9IE9iamVjdC5rZXlzKGF1dGhEYXRhKS5maW5kKGtleSA9PiBhdXRoRGF0YVtrZXldLmlkKTtcblxuICAgICAgICAvLyBWYWxpZGF0ZSBhdXRoRGF0YSB1c2VkIHRvIGlkZW50aWZ5IHRoZSB1c2VyXG4gICAgICAgIC8vIHRvIGF2b2lkIGd1ZXNzIGlkIGF0dGFja1xuICAgICAgICBjb25zdCB7IHZhbGlkYXRvciB9ID0gcmVxLmNvbmZpZy5hdXRoRGF0YU1hbmFnZXIuZ2V0VmFsaWRhdG9yRm9yUHJvdmlkZXIocHJvdmlkZXIpO1xuICAgICAgICBhd2FpdCB2YWxpZGF0b3IoXG4gICAgICAgICAgYXV0aERhdGFbcHJvdmlkZXJdLFxuICAgICAgICAgIHsgY29uZmlnOiByZXEuY29uZmlnLCBhdXRoOiByZXEuYXV0aCwgaXNDaGFsbGVuZ2U6IHRydWUgfSxcbiAgICAgICAgICBQYXJzZS5Vc2VyLmZyb21KU09OKHsgY2xhc3NOYW1lOiAnX1VzZXInLCAuLi5yZXN1bHRzWzBdIH0pXG4gICAgICAgICk7XG4gICAgICAgIHVzZXIgPSByZXN1bHRzWzBdO1xuICAgICAgfSBjYXRjaCAoZSkge1xuICAgICAgICAvLyBSZXdyaXRlIHRoZSBlcnJvciB0byBhdm9pZCBndWVzcyBpZCBhdHRhY2tcbiAgICAgICAgbG9nZ2VyLmVycm9yKGUpO1xuICAgICAgICB0aHJvdyBuZXcgUGFyc2UuRXJyb3IoUGFyc2UuRXJyb3IuT1RIRVJfQ0FVU0UsICdVc2VyIG5vdCBmb3VuZC4nKTtcbiAgICAgIH1cbiAgICB9XG5cbiAgICAvLyBFeGVjdXRlIGNoYWxsZW5nZSBzdGVwIGJ5IHN0ZXBcbiAgICAvLyB3aXRoIGNvbnNpc3RlbnQgb3JkZXJcbiAgICBjb25zdCBjaGFsbGVuZ2UgPSBhd2FpdCBBdXRoLnJlZHVjZVByb21pc2UoXG4gICAgICBPYmplY3Qua2V5cyhjaGFsbGVuZ2VEYXRhKS5zb3J0KCksXG4gICAgICBhc3luYyAoYWNjLCBwcm92aWRlcikgPT4ge1xuICAgICAgICBjb25zdCBjaGFsbGVuZ2VIYW5kbGVyID0gcmVxLmNvbmZpZy5hdXRoRGF0YU1hbmFnZXIuZ2V0VmFsaWRhdG9yRm9yUHJvdmlkZXIocHJvdmlkZXIpXG4gICAgICAgICAgLmFkYXB0ZXIuY2hhbGxlbmdlO1xuICAgICAgICBpZiAodHlwZW9mIGNoYWxsZW5nZUhhbmRsZXIgPT09ICdmdW5jdGlvbicpIHtcbiAgICAgICAgICBhY2NbcHJvdmlkZXJdID1cbiAgICAgICAgICAgIChhd2FpdCBjaGFsbGVuZ2VIYW5kbGVyKFxuICAgICAgICAgICAgICBjaGFsbGVuZ2VEYXRhW3Byb3ZpZGVyXSxcbiAgICAgICAgICAgICAgYXV0aERhdGEgJiYgYXV0aERhdGFbcHJvdmlkZXJdLFxuICAgICAgICAgICAgICByZXEuY29uZmlnLmF1dGhbcHJvdmlkZXJdLFxuICAgICAgICAgICAgICByZXEsXG4gICAgICAgICAgICAgIHVzZXIgPyBQYXJzZS5Vc2VyLmZyb21KU09OKHsgY2xhc3NOYW1lOiAnX1VzZXInLCAuLi51c2VyIH0pIDogdW5kZWZpbmVkXG4gICAgICAgICAgICApKSB8fCB0cnVlO1xuICAgICAgICAgIHJldHVybiBhY2M7XG4gICAgICAgIH1cbiAgICAgIH0sXG4gICAgICB7fVxuICAgICk7XG5cbiAgICByZXR1cm4geyByZXNwb25zZTogT2JqZWN0LmtleXMoY2hhbGxlbmdlKS5sZW5ndGggPyB7IGNoYWxsZW5nZURhdGE6IGNoYWxsZW5nZSB9IDogdW5kZWZpbmVkIH07XG4gIH1cblxuICBtb3VudFJvdXRlcygpIHtcbiAgICB0aGlzLnJvdXRlKCdHRVQnLCAnL3VzZXJzJywgcmVxID0+IHtcbiAgICAgIHJldHVybiB0aGlzLmhhbmRsZUZpbmQocmVxKTtcbiAgICB9KTtcbiAgICB0aGlzLnJvdXRlKCdQT1NUJywgJy91c2VycycsIHByb21pc2VFbnN1cmVJZGVtcG90ZW5jeSwgcmVxID0+IHtcbiAgICAgIHJldHVybiB0aGlzLmhhbmRsZUNyZWF0ZShyZXEpO1xuICAgIH0pO1xuICAgIHRoaXMucm91dGUoJ0dFVCcsICcvdXNlcnMvbWUnLCByZXEgPT4ge1xuICAgICAgcmV0dXJuIHRoaXMuaGFuZGxlTWUocmVxKTtcbiAgICB9KTtcbiAgICB0aGlzLnJvdXRlKCdHRVQnLCAnL3VzZXJzLzpvYmplY3RJZCcsIHJlcSA9PiB7XG4gICAgICByZXR1cm4gdGhpcy5oYW5kbGVHZXQocmVxKTtcbiAgICB9KTtcbiAgICB0aGlzLnJvdXRlKCdQVVQnLCAnL3VzZXJzLzpvYmplY3RJZCcsIHByb21pc2VFbnN1cmVJZGVtcG90ZW5jeSwgcmVxID0+IHtcbiAgICAgIHJldHVybiB0aGlzLmhhbmRsZVVwZGF0ZShyZXEpO1xuICAgIH0pO1xuICAgIHRoaXMucm91dGUoJ0RFTEVURScsICcvdXNlcnMvOm9iamVjdElkJywgcmVxID0+IHtcbiAgICAgIHJldHVybiB0aGlzLmhhbmRsZURlbGV0ZShyZXEpO1xuICAgIH0pO1xuICAgIHRoaXMucm91dGUoJ0dFVCcsICcvbG9naW4nLCByZXEgPT4ge1xuICAgICAgcmV0dXJuIHRoaXMuaGFuZGxlTG9nSW4ocmVxKTtcbiAgICB9KTtcbiAgICB0aGlzLnJvdXRlKCdQT1NUJywgJy9sb2dpbicsIHJlcSA9PiB7XG4gICAgICByZXR1cm4gdGhpcy5oYW5kbGVMb2dJbihyZXEpO1xuICAgIH0pO1xuICAgIHRoaXMucm91dGUoJ1BPU1QnLCAnL2xvZ291dCcsIHJlcSA9PiB7XG4gICAgICByZXR1cm4gdGhpcy5oYW5kbGVMb2dPdXQocmVxKTtcbiAgICB9KTtcbiAgICB0aGlzLnJvdXRlKCdQT1NUJywgJy9yZXF1ZXN0UGFzc3dvcmRSZXNldCcsIHJlcSA9PiB7XG4gICAgICByZXR1cm4gdGhpcy5oYW5kbGVSZXNldFJlcXVlc3QocmVxKTtcbiAgICB9KTtcbiAgICB0aGlzLnJvdXRlKCdQT1NUJywgJy92ZXJpZmljYXRpb25FbWFpbFJlcXVlc3QnLCByZXEgPT4ge1xuICAgICAgcmV0dXJuIHRoaXMuaGFuZGxlVmVyaWZpY2F0aW9uRW1haWxSZXF1ZXN0KHJlcSk7XG4gICAgfSk7XG4gICAgdGhpcy5yb3V0ZSgnR0VUJywgJy92ZXJpZnlQYXNzd29yZCcsIHJlcSA9PiB7XG4gICAgICByZXR1cm4gdGhpcy5oYW5kbGVWZXJpZnlQYXNzd29yZChyZXEpO1xuICAgIH0pO1xuICAgIHRoaXMucm91dGUoJ1BPU1QnLCAnL2NoYWxsZW5nZScsIHJlcSA9PiB7XG4gICAgICByZXR1cm4gdGhpcy5oYW5kbGVDaGFsbGVuZ2UocmVxKTtcbiAgICB9KTtcbiAgfVxufVxuXG5leHBvcnQgZGVmYXVsdCBVc2Vyc1JvdXRlcjtcbiJdfQ==