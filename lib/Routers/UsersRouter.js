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
          auth: req.auth
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
//# sourceMappingURL=data:application/json;charset=utf-8;base64,eyJ2ZXJzaW9uIjozLCJzb3VyY2VzIjpbIi4uLy4uL3NyYy9Sb3V0ZXJzL1VzZXJzUm91dGVyLmpzIl0sIm5hbWVzIjpbIlVzZXJzUm91dGVyIiwiQ2xhc3Nlc1JvdXRlciIsImNsYXNzTmFtZSIsInJlbW92ZUhpZGRlblByb3BlcnRpZXMiLCJvYmoiLCJrZXkiLCJPYmplY3QiLCJwcm90b3R5cGUiLCJoYXNPd25Qcm9wZXJ0eSIsImNhbGwiLCJ0ZXN0IiwiX2F1dGhlbnRpY2F0ZVVzZXJGcm9tUmVxdWVzdCIsInJlcSIsIlByb21pc2UiLCJyZXNvbHZlIiwicmVqZWN0IiwicGF5bG9hZCIsImJvZHkiLCJ1c2VybmFtZSIsInF1ZXJ5IiwiZW1haWwiLCJwYXNzd29yZCIsIlBhcnNlIiwiRXJyb3IiLCJVU0VSTkFNRV9NSVNTSU5HIiwiUEFTU1dPUkRfTUlTU0lORyIsIk9CSkVDVF9OT1RfRk9VTkQiLCJ1c2VyIiwiaXNWYWxpZFBhc3N3b3JkIiwiJG9yIiwiY29uZmlnIiwiZGF0YWJhc2UiLCJmaW5kIiwidGhlbiIsInJlc3VsdHMiLCJsZW5ndGgiLCJsb2dnZXJDb250cm9sbGVyIiwid2FybiIsImZpbHRlciIsInBhc3N3b3JkQ3J5cHRvIiwiY29tcGFyZSIsImNvcnJlY3QiLCJhY2NvdW50TG9ja291dFBvbGljeSIsIkFjY291bnRMb2Nrb3V0IiwiaGFuZGxlTG9naW5BdHRlbXB0IiwiYXV0aCIsImlzTWFzdGVyIiwiQUNMIiwia2V5cyIsInZlcmlmeVVzZXJFbWFpbHMiLCJwcmV2ZW50TG9naW5XaXRoVW52ZXJpZmllZEVtYWlsIiwiZW1haWxWZXJpZmllZCIsIkVNQUlMX05PVF9GT1VORCIsImF1dGhEYXRhIiwiZm9yRWFjaCIsInByb3ZpZGVyIiwiY2F0Y2giLCJlcnJvciIsImhhbmRsZU1lIiwiaW5mbyIsInNlc3Npb25Ub2tlbiIsIklOVkFMSURfU0VTU0lPTl9UT0tFTiIsInJlc3QiLCJBdXRoIiwibWFzdGVyIiwiaW5jbHVkZSIsImNsaWVudFNESyIsImNvbnRleHQiLCJyZXNwb25zZSIsImhhbmRsZUxvZ0luIiwiY2hlY2tJZlVzZXJIYXNQcm92aWRlZENvbmZpZ3VyZWRQcm92aWRlcnNGb3JMb2dpbiIsImF1dGhEYXRhUmVzcG9uc2UiLCJ2YWxpZGF0ZWRBdXRoRGF0YSIsInJlcyIsImhhbmRsZUF1dGhEYXRhVmFsaWRhdGlvbiIsInBhc3N3b3JkUG9saWN5IiwibWF4UGFzc3dvcmRBZ2UiLCJjaGFuZ2VkQXQiLCJfcGFzc3dvcmRfY2hhbmdlZF9hdCIsIkRhdGUiLCJ1cGRhdGUiLCJfZW5jb2RlIiwiX190eXBlIiwiaXNvIiwiZXhwaXJlc0F0IiwiZ2V0VGltZSIsImZpbGVzQ29udHJvbGxlciIsImV4cGFuZEZpbGVzSW5PYmplY3QiLCJUcmlnZ2VyVHlwZXMiLCJiZWZvcmVMb2dpbiIsIlVzZXIiLCJmcm9tSlNPTiIsImFzc2lnbiIsIm9iamVjdElkIiwic2Vzc2lvbkRhdGEiLCJjcmVhdGVTZXNzaW9uIiwidXNlcklkIiwiY3JlYXRlZFdpdGgiLCJhY3Rpb24iLCJhdXRoUHJvdmlkZXIiLCJpbnN0YWxsYXRpb25JZCIsImFmdGVyTG9naW5Vc2VyIiwiYWZ0ZXJMb2dpbiIsImhhbmRsZVZlcmlmeVBhc3N3b3JkIiwiaGFuZGxlTG9nT3V0Iiwic3VjY2VzcyIsInVuZGVmaW5lZCIsInJlY29yZHMiLCJkZWwiLCJfcnVuQWZ0ZXJMb2dvdXRUcmlnZ2VyIiwic2Vzc2lvbiIsImFmdGVyTG9nb3V0IiwiU2Vzc2lvbiIsIl90aHJvd09uQmFkRW1haWxDb25maWciLCJDb25maWciLCJ2YWxpZGF0ZUVtYWlsQ29uZmlndXJhdGlvbiIsImVtYWlsQWRhcHRlciIsInVzZXJDb250cm9sbGVyIiwiYWRhcHRlciIsImFwcE5hbWUiLCJwdWJsaWNTZXJ2ZXJVUkwiLCJlbWFpbFZlcmlmeVRva2VuVmFsaWRpdHlEdXJhdGlvbiIsImVtYWlsVmVyaWZ5VG9rZW5SZXVzZUlmVmFsaWQiLCJlIiwiSU5URVJOQUxfU0VSVkVSX0VSUk9SIiwiaGFuZGxlUmVzZXRSZXF1ZXN0IiwiRU1BSUxfTUlTU0lORyIsIklOVkFMSURfRU1BSUxfQUREUkVTUyIsInNlbmRQYXNzd29yZFJlc2V0RW1haWwiLCJlcnIiLCJjb2RlIiwiaGFuZGxlVmVyaWZpY2F0aW9uRW1haWxSZXF1ZXN0IiwiT1RIRVJfQ0FVU0UiLCJyZWdlbmVyYXRlRW1haWxWZXJpZnlUb2tlbiIsInNlbmRWZXJpZmljYXRpb25FbWFpbCIsImhhbmRsZUNoYWxsZW5nZSIsImNoYWxsZW5nZURhdGEiLCJpZCIsImZpbmRVc2Vyc1dpdGhBdXRoRGF0YSIsInZhbGlkYXRvciIsImF1dGhEYXRhTWFuYWdlciIsImdldFZhbGlkYXRvckZvclByb3ZpZGVyIiwibG9nZ2VyIiwiY2hhbGxlbmdlIiwicmVkdWNlUHJvbWlzZSIsInNvcnQiLCJhY2MiLCJjaGFsbGVuZ2VIYW5kbGVyIiwibW91bnRSb3V0ZXMiLCJyb3V0ZSIsImhhbmRsZUZpbmQiLCJwcm9taXNlRW5zdXJlSWRlbXBvdGVuY3kiLCJoYW5kbGVDcmVhdGUiLCJoYW5kbGVHZXQiLCJoYW5kbGVVcGRhdGUiLCJoYW5kbGVEZWxldGUiXSwibWFwcGluZ3MiOiI7Ozs7Ozs7QUFFQTs7QUFDQTs7QUFDQTs7QUFDQTs7QUFDQTs7QUFDQTs7QUFDQTs7QUFDQTs7QUFDQTs7QUFDQTs7Ozs7Ozs7OztBQUVPLE1BQU1BLFdBQU4sU0FBMEJDLHNCQUExQixDQUF3QztBQUM3Q0MsRUFBQUEsU0FBUyxHQUFHO0FBQ1YsV0FBTyxPQUFQO0FBQ0Q7QUFFRDs7Ozs7O0FBSUEsU0FBT0Msc0JBQVAsQ0FBOEJDLEdBQTlCLEVBQW1DO0FBQ2pDLFNBQUssSUFBSUMsR0FBVCxJQUFnQkQsR0FBaEIsRUFBcUI7QUFDbkIsVUFBSUUsTUFBTSxDQUFDQyxTQUFQLENBQWlCQyxjQUFqQixDQUFnQ0MsSUFBaEMsQ0FBcUNMLEdBQXJDLEVBQTBDQyxHQUExQyxDQUFKLEVBQW9EO0FBQ2xEO0FBQ0EsWUFBSUEsR0FBRyxLQUFLLFFBQVIsSUFBb0IsQ0FBQywwQkFBMEJLLElBQTFCLENBQStCTCxHQUEvQixDQUF6QixFQUE4RDtBQUM1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InNvdXJjZXNDb250ZW50IjpbIi8vIFRoZXNlIG1ldGhvZHMgaGFuZGxlIHRoZSBVc2VyLXJlbGF0ZWQgcm91dGVzLlxuXG5pbXBvcnQgUGFyc2UgZnJvbSAncGFyc2Uvbm9kZSc7XG5pbXBvcnQgQ29uZmlnIGZyb20gJy4uL0NvbmZpZyc7XG5pbXBvcnQgQWNjb3VudExvY2tvdXQgZnJvbSAnLi4vQWNjb3VudExvY2tvdXQnO1xuaW1wb3J0IENsYXNzZXNSb3V0ZXIgZnJvbSAnLi9DbGFzc2VzUm91dGVyJztcbmltcG9ydCByZXN0IGZyb20gJy4uL3Jlc3QnO1xuaW1wb3J0IEF1dGggZnJvbSAnLi4vQXV0aCc7XG5pbXBvcnQgcGFzc3dvcmRDcnlwdG8gZnJvbSAnLi4vcGFzc3dvcmQnO1xuaW1wb3J0IHsgbWF5YmVSdW5UcmlnZ2VyLCBUeXBlcyBhcyBUcmlnZ2VyVHlwZXMgfSBmcm9tICcuLi90cmlnZ2Vycyc7XG5pbXBvcnQgeyBwcm9taXNlRW5zdXJlSWRlbXBvdGVuY3kgfSBmcm9tICcuLi9taWRkbGV3YXJlcyc7XG5pbXBvcnQgeyBsb2dnZXIgfSBmcm9tICcuLi8uLi9saWIvQWRhcHRlcnMvTG9nZ2VyL1dpbnN0b25Mb2dnZXInO1xuXG5leHBvcnQgY2xhc3MgVXNlcnNSb3V0ZXIgZXh0ZW5kcyBDbGFzc2VzUm91dGVyIHtcbiAgY2xhc3NOYW1lKCkge1xuICAgIHJldHVybiAnX1VzZXInO1xuICB9XG5cbiAgLyoqXG4gICAqIFJlbW92ZXMgYWxsIFwiX1wiIHByZWZpeGVkIHByb3BlcnRpZXMgZnJvbSBhbiBvYmplY3QsIGV4Y2VwdCBcIl9fdHlwZVwiXG4gICAqIEBwYXJhbSB7T2JqZWN0fSBvYmogQW4gb2JqZWN0LlxuICAgKi9cbiAgc3RhdGljIHJlbW92ZUhpZGRlblByb3BlcnRpZXMob2JqKSB7XG4gICAgZm9yICh2YXIga2V5IGluIG9iaikge1xuICAgICAgaWYgKE9iamVjdC5wcm90b3R5cGUuaGFzT3duUHJvcGVydHkuY2FsbChvYmosIGtleSkpIHtcbiAgICAgICAgLy8gUmVnZXhwIGNvbWVzIGZyb20gUGFyc2UuT2JqZWN0LnByb3RvdHlwZS52YWxpZGF0ZVxuICAgICAgICBpZiAoa2V5ICE9PSAnX190eXBlJyAmJiAhL15bQS1aYS16XVswLTlBLVphLXpfXSokLy50ZXN0KGtleSkpIHtcbiAgICAgICAgICBkZWxldGUgb2JqW2tleV07XG4gICAgICAgIH1cbiAgICAgIH1cbiAgICB9XG4gIH1cblxuICAvKipcbiAgICogVmFsaWRhdGVzIGEgcGFzc3dvcmQgcmVxdWVzdCBpbiBsb2dpbiBhbmQgdmVyaWZ5UGFzc3dvcmRcbiAgICogQHBhcmFtIHtPYmplY3R9IHJlcSBUaGUgcmVxdWVzdFxuICAgKiBAcmV0dXJucyB7T2JqZWN0fSBVc2VyIG9iamVjdFxuICAgKiBAcHJpdmF0ZVxuICAgKi9cbiAgX2F1dGhlbnRpY2F0ZVVzZXJGcm9tUmVxdWVzdChyZXEpIHtcbiAgICByZXR1cm4gbmV3IFByb21pc2UoKHJlc29sdmUsIHJlamVjdCkgPT4ge1xuICAgICAgLy8gVXNlIHF1ZXJ5IHBhcmFtZXRlcnMgaW5zdGVhZCBpZiBwcm92aWRlZCBpbiB1cmxcbiAgICAgIGxldCBwYXlsb2FkID0gcmVxLmJvZHk7XG4gICAgICBpZiAoXG4gICAgICAgICghcGF5bG9hZC51c2VybmFtZSAmJiByZXEucXVlcnkgJiYgcmVxLnF1ZXJ5LnVzZXJuYW1lKSB8fFxuICAgICAgICAoIXBheWxvYWQuZW1haWwgJiYgcmVxLnF1ZXJ5ICYmIHJlcS5xdWVyeS5lbWFpbClcbiAgICAgICkge1xuICAgICAgICBwYXlsb2FkID0gcmVxLnF1ZXJ5O1xuICAgICAgfVxuICAgICAgY29uc3QgeyB1c2VybmFtZSwgZW1haWwsIHBhc3N3b3JkIH0gPSBwYXlsb2FkO1xuXG4gICAgICAvLyBUT0RPOiB1c2UgdGhlIHJpZ2h0IGVycm9yIGNvZGVzIC8gZGVzY3JpcHRpb25zLlxuICAgICAgaWYgKCF1c2VybmFtZSAmJiAhZW1haWwpIHtcbiAgICAgICAgdGhyb3cgbmV3IFBhcnNlLkVycm9yKFBhcnNlLkVycm9yLlVTRVJOQU1FX01JU1NJTkcsICd1c2VybmFtZS9lbWFpbCBpcyByZXF1aXJlZC4nKTtcbiAgICAgIH1cbiAgICAgIGlmICghcGFzc3dvcmQpIHtcbiAgICAgICAgdGhyb3cgbmV3IFBhcnNlLkVycm9yKFBhcnNlLkVycm9yLlBBU1NXT1JEX01JU1NJTkcsICdwYXNzd29yZCBpcyByZXF1aXJlZC4nKTtcbiAgICAgIH1cbiAgICAgIGlmIChcbiAgICAgICAgdHlwZW9mIHBhc3N3b3JkICE9PSAnc3RyaW5nJyB8fFxuICAgICAgICAoZW1haWwgJiYgdHlwZW9mIGVtYWlsICE9PSAnc3RyaW5nJykgfHxcbiAgICAgICAgKHVzZXJuYW1lICYmIHR5cGVvZiB1c2VybmFtZSAhPT0gJ3N0cmluZycpXG4gICAgICApIHtcbiAgICAgICAgdGhyb3cgbmV3IFBhcnNlLkVycm9yKFBhcnNlLkVycm9yLk9CSkVDVF9OT1RfRk9VTkQsICdJbnZhbGlkIHVzZXJuYW1lL3Bhc3N3b3JkLicpO1xuICAgICAgfVxuXG4gICAgICBsZXQgdXNlcjtcbiAgICAgIGxldCBpc1ZhbGlkUGFzc3dvcmQgPSBmYWxzZTtcbiAgICAgIGxldCBxdWVyeTtcbiAgICAgIGlmIChlbWFpbCAmJiB1c2VybmFtZSkge1xuICAgICAgICBxdWVyeSA9IHsgZW1haWwsIHVzZXJuYW1lIH07XG4gICAgICB9IGVsc2UgaWYgKGVtYWlsKSB7XG4gICAgICAgIHF1ZXJ5ID0geyBlbWFpbCB9O1xuICAgICAgfSBlbHNlIHtcbiAgICAgICAgcXVlcnkgPSB7ICRvcjogW3sgdXNlcm5hbWUgfSwgeyBlbWFpbDogdXNlcm5hbWUgfV0gfTtcbiAgICAgIH1cbiAgICAgIHJldHVybiByZXEuY29uZmlnLmRhdGFiYXNlXG4gICAgICAgIC5maW5kKCdfVXNlcicsIHF1ZXJ5KVxuICAgICAgICAudGhlbihyZXN1bHRzID0+IHtcbiAgICAgICAgICBpZiAoIXJlc3VsdHMubGVuZ3RoKSB7XG4gICAgICAgICAgICB0aHJvdyBuZXcgUGFyc2UuRXJyb3IoUGFyc2UuRXJyb3IuT0JKRUNUX05PVF9GT1VORCwgJ0ludmFsaWQgdXNlcm5hbWUvcGFzc3dvcmQuJyk7XG4gICAgICAgICAgfVxuXG4gICAgICAgICAgaWYgKHJlc3VsdHMubGVuZ3RoID4gMSkge1xuICAgICAgICAgICAgLy8gY29ybmVyIGNhc2Ugd2hlcmUgdXNlcjEgaGFzIHVzZXJuYW1lID09IHVzZXIyIGVtYWlsXG4gICAgICAgICAgICByZXEuY29uZmlnLmxvZ2dlckNvbnRyb2xsZXIud2FybihcbiAgICAgICAgICAgICAgXCJUaGVyZSBpcyBhIHVzZXIgd2hpY2ggZW1haWwgaXMgdGhlIHNhbWUgYXMgYW5vdGhlciB1c2VyJ3MgdXNlcm5hbWUsIGxvZ2dpbmcgaW4gYmFzZWQgb24gdXNlcm5hbWVcIlxuICAgICAgICAgICAgKTtcbiAgICAgICAgICAgIHVzZXIgPSByZXN1bHRzLmZpbHRlcih1c2VyID0+IHVzZXIudXNlcm5hbWUgPT09IHVzZXJuYW1lKVswXTtcbiAgICAgICAgICB9IGVsc2Uge1xuICAgICAgICAgICAgdXNlciA9IHJlc3VsdHNbMF07XG4gICAgICAgICAgfVxuXG4gICAgICAgICAgcmV0dXJuIHBhc3N3b3JkQ3J5cHRvLmNvbXBhcmUocGFzc3dvcmQsIHVzZXIucGFzc3dvcmQpO1xuICAgICAgICB9KVxuICAgICAgICAudGhlbihjb3JyZWN0ID0+IHtcbiAgICAgICAgICBpc1ZhbGlkUGFzc3dvcmQgPSBjb3JyZWN0O1xuICAgICAgICAgIGNvbnN0IGFjY291bnRMb2Nrb3V0UG9saWN5ID0gbmV3IEFjY291bnRMb2Nrb3V0KHVzZXIsIHJlcS5jb25maWcpO1xuICAgICAgICAgIHJldHVybiBhY2NvdW50TG9ja291dFBvbGljeS5oYW5kbGVMb2dpbkF0dGVtcHQoaXNWYWxpZFBhc3N3b3JkKTtcbiAgICAgICAgfSlcbiAgICAgICAgLnRoZW4oKCkgPT4ge1xuICAgICAgICAgIGlmICghaXNWYWxpZFBhc3N3b3JkKSB7XG4gICAgICAgICAgICB0aHJvdyBuZXcgUGFyc2UuRXJyb3IoUGFyc2UuRXJyb3IuT0JKRUNUX05PVF9GT1VORCwgJ0ludmFsaWQgdXNlcm5hbWUvcGFzc3dvcmQuJyk7XG4gICAgICAgICAgfVxuICAgICAgICAgIC8vIEVuc3VyZSB0aGUgdXNlciBpc24ndCBsb2NrZWQgb3V0XG4gICAgICAgICAgLy8gQSBsb2NrZWQgb3V0IHVzZXIgd29uJ3QgYmUgYWJsZSB0byBsb2dpblxuICAgICAgICAgIC8vIFRvIGxvY2sgYSB1c2VyIG91dCwganVzdCBzZXQgdGhlIEFDTCB0byBgbWFzdGVyS2V5YCBvbmx5ICAoe30pLlxuICAgICAgICAgIC8vIEVtcHR5IEFDTCBpcyBPS1xuICAgICAgICAgIGlmICghcmVxLmF1dGguaXNNYXN0ZXIgJiYgdXNlci5BQ0wgJiYgT2JqZWN0LmtleXModXNlci5BQ0wpLmxlbmd0aCA9PSAwKSB7XG4gICAgICAgICAgICB0aHJvdyBuZXcgUGFyc2UuRXJyb3IoUGFyc2UuRXJyb3IuT0JKRUNUX05PVF9GT1VORCwgJ0ludmFsaWQgdXNlcm5hbWUvcGFzc3dvcmQuJyk7XG4gICAgICAgICAgfVxuICAgICAgICAgIGlmIChcbiAgICAgICAgICAgIHJlcS5jb25maWcudmVyaWZ5VXNlckVtYWlscyAmJlxuICAgICAgICAgICAgcmVxLmNvbmZpZy5wcmV2ZW50TG9naW5XaXRoVW52ZXJpZmllZEVtYWlsICYmXG4gICAgICAgICAgICAhdXNlci5lbWFpbFZlcmlmaWVkXG4gICAgICAgICAgKSB7XG4gICAgICAgICAgICB0aHJvdyBuZXcgUGFyc2UuRXJyb3IoUGFyc2UuRXJyb3IuRU1BSUxfTk9UX0ZPVU5ELCAnVXNlciBlbWFpbCBpcyBub3QgdmVyaWZpZWQuJyk7XG4gICAgICAgICAgfVxuXG4gICAgICAgICAgZGVsZXRlIHVzZXIucGFzc3dvcmQ7XG5cbiAgICAgICAgICAvLyBTb21ldGltZXMgdGhlIGF1dGhEYXRhIHN0aWxsIGhhcyBudWxsIG9uIHRoYXQga2V5c1xuICAgICAgICAgIC8vIGh0dHBzOi8vZ2l0aHViLmNvbS9wYXJzZS1jb21tdW5pdHkvcGFyc2Utc2VydmVyL2lzc3Vlcy85MzVcbiAgICAgICAgICBpZiAodXNlci5hdXRoRGF0YSkge1xuICAgICAgICAgICAgT2JqZWN0LmtleXModXNlci5hdXRoRGF0YSkuZm9yRWFjaChwcm92aWRlciA9PiB7XG4gICAgICAgICAgICAgIGlmICh1c2VyLmF1dGhEYXRhW3Byb3ZpZGVyXSA9PT0gbnVsbCkge1xuICAgICAgICAgICAgICAgIGRlbGV0ZSB1c2VyLmF1dGhEYXRhW3Byb3ZpZGVyXTtcbiAgICAgICAgICAgICAgfVxuICAgICAgICAgICAgfSk7XG4gICAgICAgICAgICBpZiAoT2JqZWN0LmtleXModXNlci5hdXRoRGF0YSkubGVuZ3RoID09IDApIHtcbiAgICAgICAgICAgICAgZGVsZXRlIHVzZXIuYXV0aERhdGE7XG4gICAgICAgICAgICB9XG4gICAgICAgICAgfVxuXG4gICAgICAgICAgcmV0dXJuIHJlc29sdmUodXNlcik7XG4gICAgICAgIH0pXG4gICAgICAgIC5jYXRjaChlcnJvciA9PiB7XG4gICAgICAgICAgcmV0dXJuIHJlamVjdChlcnJvcik7XG4gICAgICAgIH0pO1xuICAgIH0pO1xuICB9XG5cbiAgaGFuZGxlTWUocmVxKSB7XG4gICAgaWYgKCFyZXEuaW5mbyB8fCAhcmVxLmluZm8uc2Vzc2lvblRva2VuKSB7XG4gICAgICB0aHJvdyBuZXcgUGFyc2UuRXJyb3IoUGFyc2UuRXJyb3IuSU5WQUxJRF9TRVNTSU9OX1RPS0VOLCAnSW52YWxpZCBzZXNzaW9uIHRva2VuJyk7XG4gICAgfVxuICAgIGNvbnN0IHNlc3Npb25Ub2tlbiA9IHJlcS5pbmZvLnNlc3Npb25Ub2tlbjtcbiAgICByZXR1cm4gcmVzdFxuICAgICAgLmZpbmQoXG4gICAgICAgIHJlcS5jb25maWcsXG4gICAgICAgIEF1dGgubWFzdGVyKHJlcS5jb25maWcpLFxuICAgICAgICAnX1Nlc3Npb24nLFxuICAgICAgICB7IHNlc3Npb25Ub2tlbiB9LFxuICAgICAgICB7IGluY2x1ZGU6ICd1c2VyJyB9LFxuICAgICAgICByZXEuaW5mby5jbGllbnRTREssXG4gICAgICAgIHJlcS5pbmZvLmNvbnRleHRcbiAgICAgIClcbiAgICAgIC50aGVuKHJlc3BvbnNlID0+IHtcbiAgICAgICAgaWYgKCFyZXNwb25zZS5yZXN1bHRzIHx8IHJlc3BvbnNlLnJlc3VsdHMubGVuZ3RoID09IDAgfHwgIXJlc3BvbnNlLnJlc3VsdHNbMF0udXNlcikge1xuICAgICAgICAgIHRocm93IG5ldyBQYXJzZS5FcnJvcihQYXJzZS5FcnJvci5JTlZBTElEX1NFU1NJT05fVE9LRU4sICdJbnZhbGlkIHNlc3Npb24gdG9rZW4nKTtcbiAgICAgICAgfSBlbHNlIHtcbiAgICAgICAgICBjb25zdCB1c2VyID0gcmVzcG9uc2UucmVzdWx0c1swXS51c2VyO1xuICAgICAgICAgIC8vIFNlbmQgdG9rZW4gYmFjayBvbiB0aGUgbG9naW4sIGJlY2F1c2UgU0RLcyBleHBlY3QgdGhhdC5cbiAgICAgICAgICB1c2VyLnNlc3Npb25Ub2tlbiA9IHNlc3Npb25Ub2tlbjtcblxuICAgICAgICAgIC8vIFJlbW92ZSBoaWRkZW4gcHJvcGVydGllcy5cbiAgICAgICAgICBVc2Vyc1JvdXRlci5yZW1vdmVIaWRkZW5Qcm9wZXJ0aWVzKHVzZXIpO1xuICAgICAgICAgIHJldHVybiB7IHJlc3BvbnNlOiB1c2VyIH07XG4gICAgICAgIH1cbiAgICAgIH0pO1xuICB9XG5cbiAgYXN5bmMgaGFuZGxlTG9nSW4ocmVxKSB7XG4gICAgY29uc3QgdXNlciA9IGF3YWl0IHRoaXMuX2F1dGhlbnRpY2F0ZVVzZXJGcm9tUmVxdWVzdChyZXEpO1xuICAgIGNvbnN0IGF1dGhEYXRhID0gcmVxLmJvZHkgJiYgcmVxLmJvZHkuYXV0aERhdGE7XG4gICAgLy8gQ2hlY2sgaWYgdXNlciBoYXMgcHJvdmlkZWQgaGlzIHJlcXVpcmVkIGF1dGggcHJvdmlkZXJzXG4gICAgQXV0aC5jaGVja0lmVXNlckhhc1Byb3ZpZGVkQ29uZmlndXJlZFByb3ZpZGVyc0ZvckxvZ2luKGF1dGhEYXRhLCB1c2VyLmF1dGhEYXRhLCByZXEuY29uZmlnKTtcblxuICAgIGxldCBhdXRoRGF0YVJlc3BvbnNlO1xuICAgIGxldCB2YWxpZGF0ZWRBdXRoRGF0YTtcbiAgICBpZiAoYXV0aERhdGEpIHtcbiAgICAgIGNvbnN0IHJlcyA9IGF3YWl0IEF1dGguaGFuZGxlQXV0aERhdGFWYWxpZGF0aW9uKGF1dGhEYXRhLCByZXEsIHVzZXIpO1xuICAgICAgYXV0aERhdGFSZXNwb25zZSA9IHJlcy5hdXRoRGF0YVJlc3BvbnNlO1xuICAgICAgdmFsaWRhdGVkQXV0aERhdGEgPSByZXMuYXV0aERhdGE7XG4gICAgfVxuXG4gICAgLy8gaGFuZGxlIHBhc3N3b3JkIGV4cGlyeSBwb2xpY3lcbiAgICBpZiAocmVxLmNvbmZpZy5wYXNzd29yZFBvbGljeSAmJiByZXEuY29uZmlnLnBhc3N3b3JkUG9saWN5Lm1heFBhc3N3b3JkQWdlKSB7XG4gICAgICBsZXQgY2hhbmdlZEF0ID0gdXNlci5fcGFzc3dvcmRfY2hhbmdlZF9hdDtcblxuICAgICAgaWYgKCFjaGFuZ2VkQXQpIHtcbiAgICAgICAgLy8gcGFzc3dvcmQgd2FzIGNyZWF0ZWQgYmVmb3JlIGV4cGlyeSBwb2xpY3kgd2FzIGVuYWJsZWQuXG4gICAgICAgIC8vIHNpbXBseSB1cGRhdGUgX1VzZXIgb2JqZWN0IHNvIHRoYXQgaXQgd2lsbCBzdGFydCBlbmZvcmNpbmcgZnJvbSBub3dcbiAgICAgICAgY2hhbmdlZEF0ID0gbmV3IERhdGUoKTtcbiAgICAgICAgcmVxLmNvbmZpZy5kYXRhYmFzZS51cGRhdGUoXG4gICAgICAgICAgJ19Vc2VyJyxcbiAgICAgICAgICB7IHVzZXJuYW1lOiB1c2VyLnVzZXJuYW1lIH0sXG4gICAgICAgICAgeyBfcGFzc3dvcmRfY2hhbmdlZF9hdDogUGFyc2UuX2VuY29kZShjaGFuZ2VkQXQpIH1cbiAgICAgICAgKTtcbiAgICAgIH0gZWxzZSB7XG4gICAgICAgIC8vIGNoZWNrIHdoZXRoZXIgdGhlIHBhc3N3b3JkIGhhcyBleHBpcmVkXG4gICAgICAgIGlmIChjaGFuZ2VkQXQuX190eXBlID09ICdEYXRlJykge1xuICAgICAgICAgIGNoYW5nZWRBdCA9IG5ldyBEYXRlKGNoYW5nZWRBdC5pc28pO1xuICAgICAgICB9XG4gICAgICAgIC8vIENhbGN1bGF0ZSB0aGUgZXhwaXJ5IHRpbWUuXG4gICAgICAgIGNvbnN0IGV4cGlyZXNBdCA9IG5ldyBEYXRlKFxuICAgICAgICAgIGNoYW5nZWRBdC5nZXRUaW1lKCkgKyA4NjQwMDAwMCAqIHJlcS5jb25maWcucGFzc3dvcmRQb2xpY3kubWF4UGFzc3dvcmRBZ2VcbiAgICAgICAgKTtcbiAgICAgICAgaWYgKGV4cGlyZXNBdCA8IG5ldyBEYXRlKCkpXG4gICAgICAgICAgLy8gZmFpbCBvZiBjdXJyZW50IHRpbWUgaXMgcGFzdCBwYXNzd29yZCBleHBpcnkgdGltZVxuICAgICAgICAgIHRocm93IG5ldyBQYXJzZS5FcnJvcihcbiAgICAgICAgICAgIFBhcnNlLkVycm9yLk9CSkVDVF9OT1RfRk9VTkQsXG4gICAgICAgICAgICAnWW91ciBwYXNzd29yZCBoYXMgZXhwaXJlZC4gUGxlYXNlIHJlc2V0IHlvdXIgcGFzc3dvcmQuJ1xuICAgICAgICAgICk7XG4gICAgICB9XG4gICAgfVxuXG4gICAgLy8gUmVtb3ZlIGhpZGRlbiBwcm9wZXJ0aWVzLlxuICAgIFVzZXJzUm91dGVyLnJlbW92ZUhpZGRlblByb3BlcnRpZXModXNlcik7XG5cbiAgICByZXEuY29uZmlnLmZpbGVzQ29udHJvbGxlci5leHBhbmRGaWxlc0luT2JqZWN0KHJlcS5jb25maWcsIHVzZXIpO1xuXG4gICAgLy8gQmVmb3JlIGxvZ2luIHRyaWdnZXI7IHRocm93cyBpZiBmYWlsdXJlXG4gICAgYXdhaXQgbWF5YmVSdW5UcmlnZ2VyKFxuICAgICAgVHJpZ2dlclR5cGVzLmJlZm9yZUxvZ2luLFxuICAgICAgcmVxLmF1dGgsXG4gICAgICBQYXJzZS5Vc2VyLmZyb21KU09OKE9iamVjdC5hc3NpZ24oeyBjbGFzc05hbWU6ICdfVXNlcicgfSwgdXNlcikpLFxuICAgICAgbnVsbCxcbiAgICAgIHJlcS5jb25maWdcbiAgICApO1xuXG4gICAgLy8gSWYgd2UgaGF2ZSBzb21lIG5ldyB2YWxpZGF0ZWQgYXV0aERhdGFcbiAgICAvLyB1cGRhdGUgZGlyZWN0bHlcbiAgICBpZiAodmFsaWRhdGVkQXV0aERhdGEgJiYgT2JqZWN0LmtleXModmFsaWRhdGVkQXV0aERhdGEpLmxlbmd0aCkge1xuICAgICAgYXdhaXQgcmVxLmNvbmZpZy5kYXRhYmFzZS51cGRhdGUoXG4gICAgICAgICdfVXNlcicsXG4gICAgICAgIHsgb2JqZWN0SWQ6IHVzZXIub2JqZWN0SWQgfSxcbiAgICAgICAgeyBhdXRoRGF0YTogdmFsaWRhdGVkQXV0aERhdGEgfSxcbiAgICAgICAge31cbiAgICAgICk7XG4gICAgfVxuXG4gICAgY29uc3QgeyBzZXNzaW9uRGF0YSwgY3JlYXRlU2Vzc2lvbiB9ID0gQXV0aC5jcmVhdGVTZXNzaW9uKHJlcS5jb25maWcsIHtcbiAgICAgIHVzZXJJZDogdXNlci5vYmplY3RJZCxcbiAgICAgIGNyZWF0ZWRXaXRoOiB7XG4gICAgICAgIGFjdGlvbjogJ2xvZ2luJyxcbiAgICAgICAgYXV0aFByb3ZpZGVyOiAncGFzc3dvcmQnLFxuICAgICAgfSxcbiAgICAgIGluc3RhbGxhdGlvbklkOiByZXEuaW5mby5pbnN0YWxsYXRpb25JZCxcbiAgICB9KTtcblxuICAgIHVzZXIuc2Vzc2lvblRva2VuID0gc2Vzc2lvbkRhdGEuc2Vzc2lvblRva2VuO1xuXG4gICAgYXdhaXQgY3JlYXRlU2Vzc2lvbigpO1xuXG4gICAgY29uc3QgYWZ0ZXJMb2dpblVzZXIgPSBQYXJzZS5Vc2VyLmZyb21KU09OKE9iamVjdC5hc3NpZ24oeyBjbGFzc05hbWU6ICdfVXNlcicgfSwgdXNlcikpO1xuICAgIG1heWJlUnVuVHJpZ2dlcihcbiAgICAgIFRyaWdnZXJUeXBlcy5hZnRlckxvZ2luLFxuICAgICAgeyAuLi5yZXEuYXV0aCwgdXNlcjogYWZ0ZXJMb2dpblVzZXIgfSxcbiAgICAgIGFmdGVyTG9naW5Vc2VyLFxuICAgICAgbnVsbCxcbiAgICAgIHJlcS5jb25maWdcbiAgICApO1xuXG4gICAgaWYgKGF1dGhEYXRhUmVzcG9uc2UpIHtcbiAgICAgIHVzZXIuYXV0aERhdGFSZXNwb25zZSA9IGF1dGhEYXRhUmVzcG9uc2U7XG4gICAgfVxuXG4gICAgcmV0dXJuIHsgcmVzcG9uc2U6IHVzZXIgfTtcbiAgfVxuXG4gIGhhbmRsZVZlcmlmeVBhc3N3b3JkKHJlcSkge1xuICAgIHJldHVybiB0aGlzLl9hdXRoZW50aWNhdGVVc2VyRnJvbVJlcXVlc3QocmVxKVxuICAgICAgLnRoZW4odXNlciA9PiB7XG4gICAgICAgIC8vIFJlbW92ZSBoaWRkZW4gcHJvcGVydGllcy5cbiAgICAgICAgVXNlcnNSb3V0ZXIucmVtb3ZlSGlkZGVuUHJvcGVydGllcyh1c2VyKTtcblxuICAgICAgICByZXR1cm4geyByZXNwb25zZTogdXNlciB9O1xuICAgICAgfSlcbiAgICAgIC5jYXRjaChlcnJvciA9PiB7XG4gICAgICAgIHRocm93IGVycm9yO1xuICAgICAgfSk7XG4gIH1cblxuICBoYW5kbGVMb2dPdXQocmVxKSB7XG4gICAgY29uc3Qgc3VjY2VzcyA9IHsgcmVzcG9uc2U6IHt9IH07XG4gICAgaWYgKHJlcS5pbmZvICYmIHJlcS5pbmZvLnNlc3Npb25Ub2tlbikge1xuICAgICAgcmV0dXJuIHJlc3RcbiAgICAgICAgLmZpbmQoXG4gICAgICAgICAgcmVxLmNvbmZpZyxcbiAgICAgICAgICBBdXRoLm1hc3RlcihyZXEuY29uZmlnKSxcbiAgICAgICAgICAnX1Nlc3Npb24nLFxuICAgICAgICAgIHsgc2Vzc2lvblRva2VuOiByZXEuaW5mby5zZXNzaW9uVG9rZW4gfSxcbiAgICAgICAgICB1bmRlZmluZWQsXG4gICAgICAgICAgcmVxLmluZm8uY2xpZW50U0RLLFxuICAgICAgICAgIHJlcS5pbmZvLmNvbnRleHRcbiAgICAgICAgKVxuICAgICAgICAudGhlbihyZWNvcmRzID0+IHtcbiAgICAgICAgICBpZiAocmVjb3Jkcy5yZXN1bHRzICYmIHJlY29yZHMucmVzdWx0cy5sZW5ndGgpIHtcbiAgICAgICAgICAgIHJldHVybiByZXN0XG4gICAgICAgICAgICAgIC5kZWwoXG4gICAgICAgICAgICAgICAgcmVxLmNvbmZpZyxcbiAgICAgICAgICAgICAgICBBdXRoLm1hc3RlcihyZXEuY29uZmlnKSxcbiAgICAgICAgICAgICAgICAnX1Nlc3Npb24nLFxuICAgICAgICAgICAgICAgIHJlY29yZHMucmVzdWx0c1swXS5vYmplY3RJZCxcbiAgICAgICAgICAgICAgICByZXEuaW5mby5jb250ZXh0XG4gICAgICAgICAgICAgIClcbiAgICAgICAgICAgICAgLnRoZW4oKCkgPT4ge1xuICAgICAgICAgICAgICAgIHRoaXMuX3J1bkFmdGVyTG9nb3V0VHJpZ2dlcihyZXEsIHJlY29yZHMucmVzdWx0c1swXSk7XG4gICAgICAgICAgICAgICAgcmV0dXJuIFByb21pc2UucmVzb2x2ZShzdWNjZXNzKTtcbiAgICAgICAgICAgICAgfSk7XG4gICAgICAgICAgfVxuICAgICAgICAgIHJldHVybiBQcm9taXNlLnJlc29sdmUoc3VjY2Vzcyk7XG4gICAgICAgIH0pO1xuICAgIH1cbiAgICByZXR1cm4gUHJvbWlzZS5yZXNvbHZlKHN1Y2Nlc3MpO1xuICB9XG5cbiAgX3J1bkFmdGVyTG9nb3V0VHJpZ2dlcihyZXEsIHNlc3Npb24pIHtcbiAgICAvLyBBZnRlciBsb2dvdXQgdHJpZ2dlclxuICAgIG1heWJlUnVuVHJpZ2dlcihcbiAgICAgIFRyaWdnZXJUeXBlcy5hZnRlckxvZ291dCxcbiAgICAgIHJlcS5hdXRoLFxuICAgICAgUGFyc2UuU2Vzc2lvbi5mcm9tSlNPTihPYmplY3QuYXNzaWduKHsgY2xhc3NOYW1lOiAnX1Nlc3Npb24nIH0sIHNlc3Npb24pKSxcbiAgICAgIG51bGwsXG4gICAgICByZXEuY29uZmlnXG4gICAgKTtcbiAgfVxuXG4gIF90aHJvd09uQmFkRW1haWxDb25maWcocmVxKSB7XG4gICAgdHJ5IHtcbiAgICAgIENvbmZpZy52YWxpZGF0ZUVtYWlsQ29uZmlndXJhdGlvbih7XG4gICAgICAgIGVtYWlsQWRhcHRlcjogcmVxLmNvbmZpZy51c2VyQ29udHJvbGxlci5hZGFwdGVyLFxuICAgICAgICBhcHBOYW1lOiByZXEuY29uZmlnLmFwcE5hbWUsXG4gICAgICAgIHB1YmxpY1NlcnZlclVSTDogcmVxLmNvbmZpZy5wdWJsaWNTZXJ2ZXJVUkwsXG4gICAgICAgIGVtYWlsVmVyaWZ5VG9rZW5WYWxpZGl0eUR1cmF0aW9uOiByZXEuY29uZmlnLmVtYWlsVmVyaWZ5VG9rZW5WYWxpZGl0eUR1cmF0aW9uLFxuICAgICAgICBlbWFpbFZlcmlmeVRva2VuUmV1c2VJZlZhbGlkOiByZXEuY29uZmlnLmVtYWlsVmVyaWZ5VG9rZW5SZXVzZUlmVmFsaWQsXG4gICAgICB9KTtcbiAgICB9IGNhdGNoIChlKSB7XG4gICAgICBpZiAodHlwZW9mIGUgPT09ICdzdHJpbmcnKSB7XG4gICAgICAgIC8vIE1heWJlIHdlIG5lZWQgYSBCYWQgQ29uZmlndXJhdGlvbiBlcnJvciwgYnV0IHRoZSBTREtzIHdvbid0IHVuZGVyc3RhbmQgaXQuIEZvciBub3csIEludGVybmFsIFNlcnZlciBFcnJvci5cbiAgICAgICAgdGhyb3cgbmV3IFBhcnNlLkVycm9yKFxuICAgICAgICAgIFBhcnNlLkVycm9yLklOVEVSTkFMX1NFUlZFUl9FUlJPUixcbiAgICAgICAgICAnQW4gYXBwTmFtZSwgcHVibGljU2VydmVyVVJMLCBhbmQgZW1haWxBZGFwdGVyIGFyZSByZXF1aXJlZCBmb3IgcGFzc3dvcmQgcmVzZXQgYW5kIGVtYWlsIHZlcmlmaWNhdGlvbiBmdW5jdGlvbmFsaXR5LidcbiAgICAgICAgKTtcbiAgICAgIH0gZWxzZSB7XG4gICAgICAgIHRocm93IGU7XG4gICAgICB9XG4gICAgfVxuICB9XG5cbiAgaGFuZGxlUmVzZXRSZXF1ZXN0KHJlcSkge1xuICAgIHRoaXMuX3Rocm93T25CYWRFbWFpbENvbmZpZyhyZXEpO1xuXG4gICAgY29uc3QgeyBlbWFpbCB9ID0gcmVxLmJvZHk7XG4gICAgaWYgKCFlbWFpbCkge1xuICAgICAgdGhyb3cgbmV3IFBhcnNlLkVycm9yKFBhcnNlLkVycm9yLkVNQUlMX01JU1NJTkcsICd5b3UgbXVzdCBwcm92aWRlIGFuIGVtYWlsJyk7XG4gICAgfVxuICAgIGlmICh0eXBlb2YgZW1haWwgIT09ICdzdHJpbmcnKSB7XG4gICAgICB0aHJvdyBuZXcgUGFyc2UuRXJyb3IoXG4gICAgICAgIFBhcnNlLkVycm9yLklOVkFMSURfRU1BSUxfQUREUkVTUyxcbiAgICAgICAgJ3lvdSBtdXN0IHByb3ZpZGUgYSB2YWxpZCBlbWFpbCBzdHJpbmcnXG4gICAgICApO1xuICAgIH1cbiAgICBjb25zdCB1c2VyQ29udHJvbGxlciA9IHJlcS5jb25maWcudXNlckNvbnRyb2xsZXI7XG4gICAgcmV0dXJuIHVzZXJDb250cm9sbGVyLnNlbmRQYXNzd29yZFJlc2V0RW1haWwoZW1haWwpLnRoZW4oXG4gICAgICAoKSA9PiB7XG4gICAgICAgIHJldHVybiBQcm9taXNlLnJlc29sdmUoe1xuICAgICAgICAgIHJlc3BvbnNlOiB7fSxcbiAgICAgICAgfSk7XG4gICAgICB9LFxuICAgICAgZXJyID0+IHtcbiAgICAgICAgaWYgKGVyci5jb2RlID09PSBQYXJzZS5FcnJvci5PQkpFQ1RfTk9UX0ZPVU5EKSB7XG4gICAgICAgICAgLy8gUmV0dXJuIHN1Y2Nlc3Mgc28gdGhhdCB0aGlzIGVuZHBvaW50IGNhbid0XG4gICAgICAgICAgLy8gYmUgdXNlZCB0byBlbnVtZXJhdGUgdmFsaWQgZW1haWxzXG4gICAgICAgICAgcmV0dXJuIFByb21pc2UucmVzb2x2ZSh7XG4gICAgICAgICAgICByZXNwb25zZToge30sXG4gICAgICAgICAgfSk7XG4gICAgICAgIH0gZWxzZSB7XG4gICAgICAgICAgdGhyb3cgZXJyO1xuICAgICAgICB9XG4gICAgICB9XG4gICAgKTtcbiAgfVxuXG4gIGhhbmRsZVZlcmlmaWNhdGlvbkVtYWlsUmVxdWVzdChyZXEpIHtcbiAgICB0aGlzLl90aHJvd09uQmFkRW1haWxDb25maWcocmVxKTtcblxuICAgIGNvbnN0IHsgZW1haWwgfSA9IHJlcS5ib2R5O1xuICAgIGlmICghZW1haWwpIHtcbiAgICAgIHRocm93IG5ldyBQYXJzZS5FcnJvcihQYXJzZS5FcnJvci5FTUFJTF9NSVNTSU5HLCAneW91IG11c3QgcHJvdmlkZSBhbiBlbWFpbCcpO1xuICAgIH1cbiAgICBpZiAodHlwZW9mIGVtYWlsICE9PSAnc3RyaW5nJykge1xuICAgICAgdGhyb3cgbmV3IFBhcnNlLkVycm9yKFxuICAgICAgICBQYXJzZS5FcnJvci5JTlZBTElEX0VNQUlMX0FERFJFU1MsXG4gICAgICAgICd5b3UgbXVzdCBwcm92aWRlIGEgdmFsaWQgZW1haWwgc3RyaW5nJ1xuICAgICAgKTtcbiAgICB9XG5cbiAgICByZXR1cm4gcmVxLmNvbmZpZy5kYXRhYmFzZS5maW5kKCdfVXNlcicsIHsgZW1haWw6IGVtYWlsIH0pLnRoZW4ocmVzdWx0cyA9PiB7XG4gICAgICBpZiAoIXJlc3VsdHMubGVuZ3RoIHx8IHJlc3VsdHMubGVuZ3RoIDwgMSkge1xuICAgICAgICB0aHJvdyBuZXcgUGFyc2UuRXJyb3IoUGFyc2UuRXJyb3IuRU1BSUxfTk9UX0ZPVU5ELCBgTm8gdXNlciBmb3VuZCB3aXRoIGVtYWlsICR7ZW1haWx9YCk7XG4gICAgICB9XG4gICAgICBjb25zdCB1c2VyID0gcmVzdWx0c1swXTtcblxuICAgICAgLy8gcmVtb3ZlIHBhc3N3b3JkIGZpZWxkLCBtZXNzZXMgd2l0aCBzYXZpbmcgb24gcG9zdGdyZXNcbiAgICAgIGRlbGV0ZSB1c2VyLnBhc3N3b3JkO1xuXG4gICAgICBpZiAodXNlci5lbWFpbFZlcmlmaWVkKSB7XG4gICAgICAgIHRocm93IG5ldyBQYXJzZS5FcnJvcihQYXJzZS5FcnJvci5PVEhFUl9DQVVTRSwgYEVtYWlsICR7ZW1haWx9IGlzIGFscmVhZHkgdmVyaWZpZWQuYCk7XG4gICAgICB9XG5cbiAgICAgIGNvbnN0IHVzZXJDb250cm9sbGVyID0gcmVxLmNvbmZpZy51c2VyQ29udHJvbGxlcjtcbiAgICAgIHJldHVybiB1c2VyQ29udHJvbGxlci5yZWdlbmVyYXRlRW1haWxWZXJpZnlUb2tlbih1c2VyKS50aGVuKCgpID0+IHtcbiAgICAgICAgdXNlckNvbnRyb2xsZXIuc2VuZFZlcmlmaWNhdGlvbkVtYWlsKHVzZXIpO1xuICAgICAgICByZXR1cm4geyByZXNwb25zZToge30gfTtcbiAgICAgIH0pO1xuICAgIH0pO1xuICB9XG5cbiAgYXN5bmMgaGFuZGxlQ2hhbGxlbmdlKHJlcSkge1xuICAgIGNvbnN0IHsgdXNlcm5hbWUsIGVtYWlsLCBwYXNzd29yZCwgYXV0aERhdGEsIGNoYWxsZW5nZURhdGEgfSA9IHJlcS5ib2R5O1xuXG4gICAgLy8gaWYgdXNlcm5hbWUgb3IgZW1haWwgcHJvdmlkZWQgd2l0aCBwYXNzd29yZCB0cnkgdG8gZmluZCB0aGUgdXNlciB3aXRoIGRlZmF1bHRcbiAgICAvLyBzeXN0ZW1cbiAgICBsZXQgdXNlcjtcbiAgICBpZiAodXNlcm5hbWUgfHwgZW1haWwpIHtcbiAgICAgIGlmICghcGFzc3dvcmQpXG4gICAgICAgIHRocm93IG5ldyBQYXJzZS5FcnJvcihcbiAgICAgICAgICBQYXJzZS5FcnJvci5PVEhFUl9DQVVTRSxcbiAgICAgICAgICAnWW91IHByb3ZpZGVkIHVzZXJuYW1lIG9yIGVtYWlsLCB5b3UgbmVlZCB0byBhbHNvIHByb3ZpZGUgcGFzc3dvcmQuJ1xuICAgICAgICApO1xuICAgICAgdXNlciA9IGF3YWl0IHRoaXMuX2F1dGhlbnRpY2F0ZVVzZXJGcm9tUmVxdWVzdChyZXEpO1xuICAgIH1cblxuICAgIGlmICghY2hhbGxlbmdlRGF0YSkgdGhyb3cgbmV3IFBhcnNlLkVycm9yKFBhcnNlLkVycm9yLk9USEVSX0NBVVNFLCAnTm90aGluZyB0byBjaGFsbGVuZ2UuJyk7XG5cbiAgICBpZiAodHlwZW9mIGNoYWxsZW5nZURhdGEgIT09ICdvYmplY3QnKVxuICAgICAgdGhyb3cgbmV3IFBhcnNlLkVycm9yKFBhcnNlLkVycm9yLk9USEVSX0NBVVNFLCAnY2hhbGxlbmdlRGF0YSBzaG91bGQgYmUgYW4gb2JqZWN0LicpO1xuXG4gICAgLy8gVHJ5IHRvIGZpbmQgdXNlciBieSBhdXRoRGF0YVxuICAgIGlmIChhdXRoRGF0YSkge1xuICAgICAgaWYgKHR5cGVvZiBhdXRoRGF0YSAhPT0gJ29iamVjdCcpXG4gICAgICAgIHRocm93IG5ldyBQYXJzZS5FcnJvcihQYXJzZS5FcnJvci5PVEhFUl9DQVVTRSwgJ2F1dGhEYXRhIHNob3VsZCBiZSBhbiBvYmplY3QuJyk7XG4gICAgICAvLyBUbyBhdm9pZCBzZWN1cml0eSBpc3N1ZSB3ZSBzaG91bGQgb25seSBzdXBwb3J0IG9uZSBpZGVudGlmeWluZyBtZXRob2RcbiAgICAgIGlmICh1c2VyKVxuICAgICAgICB0aHJvdyBuZXcgUGFyc2UuRXJyb3IoXG4gICAgICAgICAgUGFyc2UuRXJyb3IuT1RIRVJfQ0FVU0UsXG4gICAgICAgICAgJ1lvdSBjYW50IHByb3ZpZGUgdXNlcm5hbWUvZW1haWwgYW5kIGF1dGhEYXRhLCBvbmx5IHVzZSBvbmUgaWRlbnRpZmljYXRpb24gbWV0aG9kLidcbiAgICAgICAgKTtcblxuICAgICAgaWYgKE9iamVjdC5rZXlzKGF1dGhEYXRhKS5maWx0ZXIoa2V5ID0+IGF1dGhEYXRhW2tleV0uaWQpLmxlbmd0aCA+IDEpIHtcbiAgICAgICAgdGhyb3cgbmV3IFBhcnNlLkVycm9yKFxuICAgICAgICAgIFBhcnNlLkVycm9yLk9USEVSX0NBVVNFLFxuICAgICAgICAgICdZb3UgY2FudCBwcm92aWRlIG1vcmUgdGhhbiBvbmUgYXV0aERhdGEgcHJvdmlkZXIgd2l0aCBhbiBpZC4nXG4gICAgICAgICk7XG4gICAgICB9XG5cbiAgICAgIGNvbnN0IHJlc3VsdHMgPSBhd2FpdCBBdXRoLmZpbmRVc2Vyc1dpdGhBdXRoRGF0YShyZXEuY29uZmlnLCBhdXRoRGF0YSk7XG5cbiAgICAgIHRyeSB7XG4gICAgICAgIGlmICghcmVzdWx0c1swXSB8fCByZXN1bHRzLmxlbmd0aCA+IDEpXG4gICAgICAgICAgdGhyb3cgbmV3IFBhcnNlLkVycm9yKFBhcnNlLkVycm9yLk9USEVSX0NBVVNFLCAnVXNlciBub3QgZm91bmQuJyk7XG5cbiAgICAgICAgLy8gRmluZCB0aGUgcHJvdmlkZXIgdXNlZCB0byBmaW5kIHRoZSB1c2VyXG4gICAgICAgIGNvbnN0IHByb3ZpZGVyID0gT2JqZWN0LmtleXMoYXV0aERhdGEpLmZpbmQoa2V5ID0+IGF1dGhEYXRhW2tleV0uaWQpO1xuXG4gICAgICAgIC8vIFZhbGlkYXRlIGF1dGhEYXRhIHVzZWQgdG8gaWRlbnRpZnkgdGhlIHVzZXJcbiAgICAgICAgLy8gdG8gYXZvaWQgZ3Vlc3MgaWQgYXR0YWNrXG4gICAgICAgIGNvbnN0IHsgdmFsaWRhdG9yIH0gPSByZXEuY29uZmlnLmF1dGhEYXRhTWFuYWdlci5nZXRWYWxpZGF0b3JGb3JQcm92aWRlcihwcm92aWRlcik7XG4gICAgICAgIGF3YWl0IHZhbGlkYXRvcihcbiAgICAgICAgICBhdXRoRGF0YVtwcm92aWRlcl0sXG4gICAgICAgICAgeyBjb25maWc6IHJlcS5jb25maWcsIGF1dGg6IHJlcS5hdXRoIH0sXG4gICAgICAgICAgUGFyc2UuVXNlci5mcm9tSlNPTih7IGNsYXNzTmFtZTogJ19Vc2VyJywgLi4ucmVzdWx0c1swXSB9KVxuICAgICAgICApO1xuICAgICAgICB1c2VyID0gcmVzdWx0c1swXTtcbiAgICAgIH0gY2F0Y2ggKGUpIHtcbiAgICAgICAgLy8gUmV3cml0ZSB0aGUgZXJyb3IgdG8gYXZvaWQgZ3Vlc3MgaWQgYXR0YWNrXG4gICAgICAgIGxvZ2dlci5lcnJvcihlKTtcbiAgICAgICAgdGhyb3cgbmV3IFBhcnNlLkVycm9yKFBhcnNlLkVycm9yLk9USEVSX0NBVVNFLCAnVXNlciBub3QgZm91bmQuJyk7XG4gICAgICB9XG4gICAgfVxuXG4gICAgLy8gRXhlY3V0ZSBjaGFsbGVuZ2Ugc3RlcCBieSBzdGVwXG4gICAgLy8gd2l0aCBjb25zaXN0ZW50IG9yZGVyXG4gICAgY29uc3QgY2hhbGxlbmdlID0gYXdhaXQgQXV0aC5yZWR1Y2VQcm9taXNlKFxuICAgICAgT2JqZWN0LmtleXMoY2hhbGxlbmdlRGF0YSkuc29ydCgpLFxuICAgICAgYXN5bmMgKGFjYywgcHJvdmlkZXIpID0+IHtcbiAgICAgICAgY29uc3QgY2hhbGxlbmdlSGFuZGxlciA9IHJlcS5jb25maWcuYXV0aERhdGFNYW5hZ2VyLmdldFZhbGlkYXRvckZvclByb3ZpZGVyKHByb3ZpZGVyKVxuICAgICAgICAgIC5hZGFwdGVyLmNoYWxsZW5nZTtcbiAgICAgICAgaWYgKHR5cGVvZiBjaGFsbGVuZ2VIYW5kbGVyID09PSAnZnVuY3Rpb24nKSB7XG4gICAgICAgICAgYWNjW3Byb3ZpZGVyXSA9XG4gICAgICAgICAgICAoYXdhaXQgY2hhbGxlbmdlSGFuZGxlcihcbiAgICAgICAgICAgICAgY2hhbGxlbmdlRGF0YVtwcm92aWRlcl0sXG4gICAgICAgICAgICAgIGF1dGhEYXRhICYmIGF1dGhEYXRhW3Byb3ZpZGVyXSxcbiAgICAgICAgICAgICAgcmVxLmNvbmZpZy5hdXRoW3Byb3ZpZGVyXSxcbiAgICAgICAgICAgICAgcmVxLFxuICAgICAgICAgICAgICB1c2VyID8gUGFyc2UuVXNlci5mcm9tSlNPTih7IGNsYXNzTmFtZTogJ19Vc2VyJywgLi4udXNlciB9KSA6IHVuZGVmaW5lZFxuICAgICAgICAgICAgKSkgfHwgdHJ1ZTtcbiAgICAgICAgICByZXR1cm4gYWNjO1xuICAgICAgICB9XG4gICAgICB9LFxuICAgICAge31cbiAgICApO1xuXG4gICAgcmV0dXJuIHsgcmVzcG9uc2U6IE9iamVjdC5rZXlzKGNoYWxsZW5nZSkubGVuZ3RoID8geyBjaGFsbGVuZ2VEYXRhOiBjaGFsbGVuZ2UgfSA6IHVuZGVmaW5lZCB9O1xuICB9XG5cbiAgbW91bnRSb3V0ZXMoKSB7XG4gICAgdGhpcy5yb3V0ZSgnR0VUJywgJy91c2VycycsIHJlcSA9PiB7XG4gICAgICByZXR1cm4gdGhpcy5oYW5kbGVGaW5kKHJlcSk7XG4gICAgfSk7XG4gICAgdGhpcy5yb3V0ZSgnUE9TVCcsICcvdXNlcnMnLCBwcm9taXNlRW5zdXJlSWRlbXBvdGVuY3ksIHJlcSA9PiB7XG4gICAgICByZXR1cm4gdGhpcy5oYW5kbGVDcmVhdGUocmVxKTtcbiAgICB9KTtcbiAgICB0aGlzLnJvdXRlKCdHRVQnLCAnL3VzZXJzL21lJywgcmVxID0+IHtcbiAgICAgIHJldHVybiB0aGlzLmhhbmRsZU1lKHJlcSk7XG4gICAgfSk7XG4gICAgdGhpcy5yb3V0ZSgnR0VUJywgJy91c2Vycy86b2JqZWN0SWQnLCByZXEgPT4ge1xuICAgICAgcmV0dXJuIHRoaXMuaGFuZGxlR2V0KHJlcSk7XG4gICAgfSk7XG4gICAgdGhpcy5yb3V0ZSgnUFVUJywgJy91c2Vycy86b2JqZWN0SWQnLCBwcm9taXNlRW5zdXJlSWRlbXBvdGVuY3ksIHJlcSA9PiB7XG4gICAgICByZXR1cm4gdGhpcy5oYW5kbGVVcGRhdGUocmVxKTtcbiAgICB9KTtcbiAgICB0aGlzLnJvdXRlKCdERUxFVEUnLCAnL3VzZXJzLzpvYmplY3RJZCcsIHJlcSA9PiB7XG4gICAgICByZXR1cm4gdGhpcy5oYW5kbGVEZWxldGUocmVxKTtcbiAgICB9KTtcbiAgICB0aGlzLnJvdXRlKCdHRVQnLCAnL2xvZ2luJywgcmVxID0+IHtcbiAgICAgIHJldHVybiB0aGlzLmhhbmRsZUxvZ0luKHJlcSk7XG4gICAgfSk7XG4gICAgdGhpcy5yb3V0ZSgnUE9TVCcsICcvbG9naW4nLCByZXEgPT4ge1xuICAgICAgcmV0dXJuIHRoaXMuaGFuZGxlTG9nSW4ocmVxKTtcbiAgICB9KTtcbiAgICB0aGlzLnJvdXRlKCdQT1NUJywgJy9sb2dvdXQnLCByZXEgPT4ge1xuICAgICAgcmV0dXJuIHRoaXMuaGFuZGxlTG9nT3V0KHJlcSk7XG4gICAgfSk7XG4gICAgdGhpcy5yb3V0ZSgnUE9TVCcsICcvcmVxdWVzdFBhc3N3b3JkUmVzZXQnLCByZXEgPT4ge1xuICAgICAgcmV0dXJuIHRoaXMuaGFuZGxlUmVzZXRSZXF1ZXN0KHJlcSk7XG4gICAgfSk7XG4gICAgdGhpcy5yb3V0ZSgnUE9TVCcsICcvdmVyaWZpY2F0aW9uRW1haWxSZXF1ZXN0JywgcmVxID0+IHtcbiAgICAgIHJldHVybiB0aGlzLmhhbmRsZVZlcmlmaWNhdGlvbkVtYWlsUmVxdWVzdChyZXEpO1xuICAgIH0pO1xuICAgIHRoaXMucm91dGUoJ0dFVCcsICcvdmVyaWZ5UGFzc3dvcmQnLCByZXEgPT4ge1xuICAgICAgcmV0dXJuIHRoaXMuaGFuZGxlVmVyaWZ5UGFzc3dvcmQocmVxKTtcbiAgICB9KTtcbiAgICB0aGlzLnJvdXRlKCdQT1NUJywgJy9jaGFsbGVuZ2UnLCByZXEgPT4ge1xuICAgICAgcmV0dXJuIHRoaXMuaGFuZGxlQ2hhbGxlbmdlKHJlcSk7XG4gICAgfSk7XG4gIH1cbn1cblxuZXhwb3J0IGRlZmF1bHQgVXNlcnNSb3V0ZXI7XG4iXX0=