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

      if (!payload.username && req.query.username || !payload.email && req.query.email) {
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
    }, req.info.clientSDK).then(response => {
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
    const user = await this._authenticateUserFromRequest(req); // handle password expiry policy

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
    }, user)), null, req.config);

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

    (0, _triggers.maybeRunTrigger)(_triggers.Types.afterLogin, _objectSpread({}, req.auth, {
      user: afterLoginUser
    }), afterLoginUser, null, req.config);
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
      }, undefined, req.info.clientSDK).then(records => {
        if (records.results && records.results.length) {
          return _rest.default.del(req.config, _Auth.default.master(req.config), '_Session', records.results[0].objectId).then(() => {
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
        emailVerifyTokenValidityDuration: req.config.emailVerifyTokenValidityDuration
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

  mountRoutes() {
    this.route('GET', '/users', req => {
      return this.handleFind(req);
    });
    this.route('POST', '/users', req => {
      return this.handleCreate(req);
    });
    this.route('GET', '/users/me', req => {
      return this.handleMe(req);
    });
    this.route('GET', '/users/:objectId', req => {
      return this.handleGet(req);
    });
    this.route('PUT', '/users/:objectId', req => {
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
  }

}

exports.UsersRouter = UsersRouter;
var _default = UsersRouter;
exports.default = _default;
//# sourceMappingURL=data:application/json;charset=utf-8;base64,eyJ2ZXJzaW9uIjozLCJzb3VyY2VzIjpbIi4uLy4uL3NyYy9Sb3V0ZXJzL1VzZXJzUm91dGVyLmpzIl0sIm5hbWVzIjpbIlVzZXJzUm91dGVyIiwiQ2xhc3Nlc1JvdXRlciIsImNsYXNzTmFtZSIsInJlbW92ZUhpZGRlblByb3BlcnRpZXMiLCJvYmoiLCJrZXkiLCJPYmplY3QiLCJwcm90b3R5cGUiLCJoYXNPd25Qcm9wZXJ0eSIsImNhbGwiLCJ0ZXN0IiwiX2F1dGhlbnRpY2F0ZVVzZXJGcm9tUmVxdWVzdCIsInJlcSIsIlByb21pc2UiLCJyZXNvbHZlIiwicmVqZWN0IiwicGF5bG9hZCIsImJvZHkiLCJ1c2VybmFtZSIsInF1ZXJ5IiwiZW1haWwiLCJwYXNzd29yZCIsIlBhcnNlIiwiRXJyb3IiLCJVU0VSTkFNRV9NSVNTSU5HIiwiUEFTU1dPUkRfTUlTU0lORyIsIk9CSkVDVF9OT1RfRk9VTkQiLCJ1c2VyIiwiaXNWYWxpZFBhc3N3b3JkIiwiJG9yIiwiY29uZmlnIiwiZGF0YWJhc2UiLCJmaW5kIiwidGhlbiIsInJlc3VsdHMiLCJsZW5ndGgiLCJsb2dnZXJDb250cm9sbGVyIiwid2FybiIsImZpbHRlciIsInBhc3N3b3JkQ3J5cHRvIiwiY29tcGFyZSIsImNvcnJlY3QiLCJhY2NvdW50TG9ja291dFBvbGljeSIsIkFjY291bnRMb2Nrb3V0IiwiaGFuZGxlTG9naW5BdHRlbXB0IiwiYXV0aCIsImlzTWFzdGVyIiwiQUNMIiwia2V5cyIsInZlcmlmeVVzZXJFbWFpbHMiLCJwcmV2ZW50TG9naW5XaXRoVW52ZXJpZmllZEVtYWlsIiwiZW1haWxWZXJpZmllZCIsIkVNQUlMX05PVF9GT1VORCIsImF1dGhEYXRhIiwiZm9yRWFjaCIsInByb3ZpZGVyIiwiY2F0Y2giLCJlcnJvciIsImhhbmRsZU1lIiwiaW5mbyIsInNlc3Npb25Ub2tlbiIsIklOVkFMSURfU0VTU0lPTl9UT0tFTiIsInJlc3QiLCJBdXRoIiwibWFzdGVyIiwiaW5jbHVkZSIsImNsaWVudFNESyIsInJlc3BvbnNlIiwiaGFuZGxlTG9nSW4iLCJwYXNzd29yZFBvbGljeSIsIm1heFBhc3N3b3JkQWdlIiwiY2hhbmdlZEF0IiwiX3Bhc3N3b3JkX2NoYW5nZWRfYXQiLCJEYXRlIiwidXBkYXRlIiwiX2VuY29kZSIsIl9fdHlwZSIsImlzbyIsImV4cGlyZXNBdCIsImdldFRpbWUiLCJmaWxlc0NvbnRyb2xsZXIiLCJleHBhbmRGaWxlc0luT2JqZWN0IiwiVHJpZ2dlclR5cGVzIiwiYmVmb3JlTG9naW4iLCJVc2VyIiwiZnJvbUpTT04iLCJhc3NpZ24iLCJzZXNzaW9uRGF0YSIsImNyZWF0ZVNlc3Npb24iLCJ1c2VySWQiLCJvYmplY3RJZCIsImNyZWF0ZWRXaXRoIiwiYWN0aW9uIiwiYXV0aFByb3ZpZGVyIiwiaW5zdGFsbGF0aW9uSWQiLCJhZnRlckxvZ2luVXNlciIsImFmdGVyTG9naW4iLCJoYW5kbGVWZXJpZnlQYXNzd29yZCIsImhhbmRsZUxvZ091dCIsInN1Y2Nlc3MiLCJ1bmRlZmluZWQiLCJyZWNvcmRzIiwiZGVsIiwiX3J1bkFmdGVyTG9nb3V0VHJpZ2dlciIsInNlc3Npb24iLCJhZnRlckxvZ291dCIsIlNlc3Npb24iLCJfdGhyb3dPbkJhZEVtYWlsQ29uZmlnIiwiQ29uZmlnIiwidmFsaWRhdGVFbWFpbENvbmZpZ3VyYXRpb24iLCJlbWFpbEFkYXB0ZXIiLCJ1c2VyQ29udHJvbGxlciIsImFkYXB0ZXIiLCJhcHBOYW1lIiwicHVibGljU2VydmVyVVJMIiwiZW1haWxWZXJpZnlUb2tlblZhbGlkaXR5RHVyYXRpb24iLCJlIiwiSU5URVJOQUxfU0VSVkVSX0VSUk9SIiwiaGFuZGxlUmVzZXRSZXF1ZXN0IiwiRU1BSUxfTUlTU0lORyIsIklOVkFMSURfRU1BSUxfQUREUkVTUyIsInNlbmRQYXNzd29yZFJlc2V0RW1haWwiLCJlcnIiLCJjb2RlIiwiaGFuZGxlVmVyaWZpY2F0aW9uRW1haWxSZXF1ZXN0IiwiT1RIRVJfQ0FVU0UiLCJyZWdlbmVyYXRlRW1haWxWZXJpZnlUb2tlbiIsInNlbmRWZXJpZmljYXRpb25FbWFpbCIsIm1vdW50Um91dGVzIiwicm91dGUiLCJoYW5kbGVGaW5kIiwiaGFuZGxlQ3JlYXRlIiwiaGFuZGxlR2V0IiwiaGFuZGxlVXBkYXRlIiwiaGFuZGxlRGVsZXRlIl0sIm1hcHBpbmdzIjoiOzs7Ozs7O0FBRUE7O0FBQ0E7O0FBQ0E7O0FBQ0E7O0FBQ0E7O0FBQ0E7O0FBQ0E7O0FBQ0E7Ozs7Ozs7Ozs7QUFFTyxNQUFNQSxXQUFOLFNBQTBCQyxzQkFBMUIsQ0FBd0M7QUFDN0NDLEVBQUFBLFNBQVMsR0FBRztBQUNWLFdBQU8sT0FBUDtBQUNEO0FBRUQ7Ozs7OztBQUlBLFNBQU9DLHNCQUFQLENBQThCQyxHQUE5QixFQUFtQztBQUNqQyxTQUFLLElBQUlDLEdBQVQsSUFBZ0JELEdBQWhCLEVBQXFCO0FBQ25CLFVBQUlFLE1BQU0sQ0FBQ0MsU0FBUCxDQUFpQkMsY0FBakIsQ0FBZ0NDLElBQWhDLENBQXFDTCxHQUFyQyxFQUEwQ0MsR0FBMUMsQ0FBSixFQUFvRDtBQUNsRDtBQUNBLFlBQUlBLEdBQUcsS0FBSyxRQUFSLElBQW9CLENBQUMsMEJBQTBCSyxJQUExQixDQUErQkwsR0FBL0IsQ0FBekIsRUFBOEQ7QUFDNUQsaUJBQU9ELEdBQUcsQ0FBQ0MsR0FBRCxDQUFWO0FBQ0Q7QUFDRjtBQUNGO0FBQ0Y7QUFFRDs7Ozs7Ozs7QUFNQU0sRUFBQUEsNEJBQTRCLENBQUNDLEdBQUQsRUFBTTtBQUNoQyxXQUFPLElBQUlDLE9BQUosQ0FBWSxDQUFDQyxPQUFELEVBQVVDLE1BQVYsS0FBcUI7QUFDdEM7QUFDQSxVQUFJQyxPQUFPLEdBQUdKLEdBQUcsQ0FBQ0ssSUFBbEI7O0FBQ0EsVUFDRyxDQUFDRCxPQUFPLENBQUNFLFFBQVQsSUFBcUJOLEdBQUcsQ0FBQ08sS0FBSixDQUFVRCxRQUFoQyxJQUNDLENBQUNGLE9BQU8sQ0FBQ0ksS0FBVCxJQUFrQlIsR0FBRyxDQUFDTyxLQUFKLENBQVVDLEtBRi9CLEVBR0U7QUFDQUosUUFBQUEsT0FBTyxHQUFHSixHQUFHLENBQUNPLEtBQWQ7QUFDRDs7QUFDRCxZQUFNO0FBQUVE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a0IsaUJBQWxCLEVBQXFDckgsR0FBRyxJQUFJO0FBQzFDLGFBQU8sS0FBS3FGLG9CQUFMLENBQTBCckYsR0FBMUIsQ0FBUDtBQUNELEtBRkQ7QUFHRDs7QUFsZDRDOzs7ZUFxZGhDWixXIiwic291cmNlc0NvbnRlbnQiOlsiLy8gVGhlc2UgbWV0aG9kcyBoYW5kbGUgdGhlIFVzZXItcmVsYXRlZCByb3V0ZXMuXG5cbmltcG9ydCBQYXJzZSBmcm9tICdwYXJzZS9ub2RlJztcbmltcG9ydCBDb25maWcgZnJvbSAnLi4vQ29uZmlnJztcbmltcG9ydCBBY2NvdW50TG9ja291dCBmcm9tICcuLi9BY2NvdW50TG9ja291dCc7XG5pbXBvcnQgQ2xhc3Nlc1JvdXRlciBmcm9tICcuL0NsYXNzZXNSb3V0ZXInO1xuaW1wb3J0IHJlc3QgZnJvbSAnLi4vcmVzdCc7XG5pbXBvcnQgQXV0aCBmcm9tICcuLi9BdXRoJztcbmltcG9ydCBwYXNzd29yZENyeXB0byBmcm9tICcuLi9wYXNzd29yZCc7XG5pbXBvcnQgeyBtYXliZVJ1blRyaWdnZXIsIFR5cGVzIGFzIFRyaWdnZXJUeXBlcyB9IGZyb20gJy4uL3RyaWdnZXJzJztcblxuZXhwb3J0IGNsYXNzIFVzZXJzUm91dGVyIGV4dGVuZHMgQ2xhc3Nlc1JvdXRlciB7XG4gIGNsYXNzTmFtZSgpIHtcbiAgICByZXR1cm4gJ19Vc2VyJztcbiAgfVxuXG4gIC8qKlxuICAgKiBSZW1vdmVzIGFsbCBcIl9cIiBwcmVmaXhlZCBwcm9wZXJ0aWVzIGZyb20gYW4gb2JqZWN0LCBleGNlcHQgXCJfX3R5cGVcIlxuICAgKiBAcGFyYW0ge09iamVjdH0gb2JqIEFuIG9iamVjdC5cbiAgICovXG4gIHN0YXRpYyByZW1vdmVIaWRkZW5Qcm9wZXJ0aWVzKG9iaikge1xuICAgIGZvciAodmFyIGtleSBpbiBvYmopIHtcbiAgICAgIGlmIChPYmplY3QucHJvdG90eXBlLmhhc093blByb3BlcnR5LmNhbGwob2JqLCBrZXkpKSB7XG4gICAgICAgIC8vIFJlZ2V4cCBjb21lcyBmcm9tIFBhcnNlLk9iamVjdC5wcm90b3R5cGUudmFsaWRhdGVcbiAgICAgICAgaWYgKGtleSAhPT0gJ19fdHlwZScgJiYgIS9eW0EtWmEtel1bMC05QS1aYS16X10qJC8udGVzdChrZXkpKSB7XG4gICAgICAgICAgZGVsZXRlIG9ialtrZXldO1xuICAgICAgICB9XG4gICAgICB9XG4gICAgfVxuICB9XG5cbiAgLyoqXG4gICAqIFZhbGlkYXRlcyBhIHBhc3N3b3JkIHJlcXVlc3QgaW4gbG9naW4gYW5kIHZlcmlmeVBhc3N3b3JkXG4gICAqIEBwYXJhbSB7T2JqZWN0fSByZXEgVGhlIHJlcXVlc3RcbiAgICogQHJldHVybnMge09iamVjdH0gVXNlciBvYmplY3RcbiAgICogQHByaXZhdGVcbiAgICovXG4gIF9hdXRoZW50aWNhdGVVc2VyRnJvbVJlcXVlc3QocmVxKSB7XG4gICAgcmV0dXJuIG5ldyBQcm9taXNlKChyZXNvbHZlLCByZWplY3QpID0+IHtcbiAgICAgIC8vIFVzZSBxdWVyeSBwYXJhbWV0ZXJzIGluc3RlYWQgaWYgcHJvdmlkZWQgaW4gdXJsXG4gICAgICBsZXQgcGF5bG9hZCA9IHJlcS5ib2R5O1xuICAgICAgaWYgKFxuICAgICAgICAoIXBheWxvYWQudXNlcm5hbWUgJiYgcmVxLnF1ZXJ5LnVzZXJuYW1lKSB8fFxuICAgICAgICAoIXBheWxvYWQuZW1haWwgJiYgcmVxLnF1ZXJ5LmVtYWlsKVxuICAgICAgKSB7XG4gICAgICAgIHBheWxvYWQgPSByZXEucXVlcnk7XG4gICAgICB9XG4gICAgICBjb25zdCB7IHVzZXJuYW1lLCBlbWFpbCwgcGFzc3dvcmQgfSA9IHBheWxvYWQ7XG5cbiAgICAgIC8vIFRPRE86IHVzZSB0aGUgcmlnaHQgZXJyb3IgY29kZXMgLyBkZXNjcmlwdGlvbnMuXG4gICAgICBpZiAoIXVzZXJuYW1lICYmICFlbWFpbCkge1xuICAgICAgICB0aHJvdyBuZXcgUGFyc2UuRXJyb3IoXG4gICAgICAgICAgUGFyc2UuRXJyb3IuVVNFUk5BTUVfTUlTU0lORyxcbiAgICAgICAgICAndXNlcm5hbWUvZW1haWwgaXMgcmVxdWlyZWQuJ1xuICAgICAgICApO1xuICAgICAgfVxuICAgICAgaWYgKCFwYXNzd29yZCkge1xuICAgICAgICB0aHJvdyBuZXcgUGFyc2UuRXJyb3IoXG4gICAgICAgICAgUGFyc2UuRXJyb3IuUEFTU1dPUkRfTUlTU0lORyxcbiAgICAgICAgICAncGFzc3dvcmQgaXMgcmVxdWlyZWQuJ1xuICAgICAgICApO1xuICAgICAgfVxuICAgICAgaWYgKFxuICAgICAgICB0eXBlb2YgcGFzc3dvcmQgIT09ICdzdHJpbmcnIHx8XG4gICAgICAgIChlbWFpbCAmJiB0eXBlb2YgZW1haWwgIT09ICdzdHJpbmcnKSB8fFxuICAgICAgICAodXNlcm5hbWUgJiYgdHlwZW9mIHVzZXJuYW1lICE9PSAnc3RyaW5nJylcbiAgICAgICkge1xuICAgICAgICB0aHJvdyBuZXcgUGFyc2UuRXJyb3IoXG4gICAgICAgICAgUGFyc2UuRXJyb3IuT0JKRUNUX05PVF9GT1VORCxcbiAgICAgICAgICAnSW52YWxpZCB1c2VybmFtZS9wYXNzd29yZC4nXG4gICAgICAgICk7XG4gICAgICB9XG5cbiAgICAgIGxldCB1c2VyO1xuICAgICAgbGV0IGlzVmFsaWRQYXNzd29yZCA9IGZhbHNlO1xuICAgICAgbGV0IHF1ZXJ5O1xuICAgICAgaWYgKGVtYWlsICYmIHVzZXJuYW1lKSB7XG4gICAgICAgIHF1ZXJ5ID0geyBlbWFpbCwgdXNlcm5hbWUgfTtcbiAgICAgIH0gZWxzZSBpZiAoZW1haWwpIHtcbiAgICAgICAgcXVlcnkgPSB7IGVtYWlsIH07XG4gICAgICB9IGVsc2Uge1xuICAgICAgICBxdWVyeSA9IHsgJG9yOiBbeyB1c2VybmFtZSB9LCB7IGVtYWlsOiB1c2VybmFtZSB9XSB9O1xuICAgICAgfVxuICAgICAgcmV0dXJuIHJlcS5jb25maWcuZGF0YWJhc2VcbiAgICAgICAgLmZpbmQoJ19Vc2VyJywgcXVlcnkpXG4gICAgICAgIC50aGVuKHJlc3VsdHMgPT4ge1xuICAgICAgICAgIGlmICghcmVzdWx0cy5sZW5ndGgpIHtcbiAgICAgICAgICAgIHRocm93IG5ldyBQYXJzZS5FcnJvcihcbiAgICAgICAgICAgICAgUGFyc2UuRXJyb3IuT0JKRUNUX05PVF9GT1VORCxcbiAgICAgICAgICAgICAgJ0ludmFsaWQgdXNlcm5hbWUvcGFzc3dvcmQuJ1xuICAgICAgICAgICAgKTtcbiAgICAgICAgICB9XG5cbiAgICAgICAgICBpZiAocmVzdWx0cy5sZW5ndGggPiAxKSB7XG4gICAgICAgICAgICAvLyBjb3JuZXIgY2FzZSB3aGVyZSB1c2VyMSBoYXMgdXNlcm5hbWUgPT0gdXNlcjIgZW1haWxcbiAgICAgICAgICAgIHJlcS5jb25maWcubG9nZ2VyQ29udHJvbGxlci53YXJuKFxuICAgICAgICAgICAgICBcIlRoZXJlIGlzIGEgdXNlciB3aGljaCBlbWFpbCBpcyB0aGUgc2FtZSBhcyBhbm90aGVyIHVzZXIncyB1c2VybmFtZSwgbG9nZ2luZyBpbiBiYXNlZCBvbiB1c2VybmFtZVwiXG4gICAgICAgICAgICApO1xuICAgICAgICAgICAgdXNlciA9IHJlc3VsdHMuZmlsdGVyKHVzZXIgPT4gdXNlci51c2VybmFtZSA9PT0gdXNlcm5hbWUpWzBdO1xuICAgICAgICAgIH0gZWxzZSB7XG4gICAgICAgICAgICB1c2VyID0gcmVzdWx0c1swXTtcbiAgICAgICAgICB9XG5cbiAgICAgICAgICByZXR1cm4gcGFzc3dvcmRDcnlwdG8uY29tcGFyZShwYXNzd29yZCwgdXNlci5wYXNzd29yZCk7XG4gICAgICAgIH0pXG4gICAgICAgIC50aGVuKGNvcnJlY3QgPT4ge1xuICAgICAgICAgIGlzVmFsaWRQYXNzd29yZCA9IGNvcnJlY3Q7XG4gICAgICAgICAgY29uc3QgYWNjb3VudExvY2tvdXRQb2xpY3kgPSBuZXcgQWNjb3VudExvY2tvdXQodXNlciwgcmVxLmNvbmZpZyk7XG4gICAgICAgICAgcmV0dXJuIGFjY291bnRMb2Nrb3V0UG9saWN5LmhhbmRsZUxvZ2luQXR0ZW1wdChpc1ZhbGlkUGFzc3dvcmQpO1xuICAgICAgICB9KVxuICAgICAgICAudGhlbigoKSA9PiB7XG4gICAgICAgICAgaWYgKCFpc1ZhbGlkUGFzc3dvcmQpIHtcbiAgICAgICAgICAgIHRocm93IG5ldyBQYXJzZS5FcnJvcihcbiAgICAgICAgICAgICAgUGFyc2UuRXJyb3IuT0JKRUNUX05PVF9GT1VORCxcbiAgICAgICAgICAgICAgJ0ludmFsaWQgdXNlcm5hbWUvcGFzc3dvcmQuJ1xuICAgICAgICAgICAgKTtcbiAgICAgICAgICB9XG4gICAgICAgICAgLy8gRW5zdXJlIHRoZSB1c2VyIGlzbid0IGxvY2tlZCBvdXRcbiAgICAgICAgICAvLyBBIGxvY2tlZCBvdXQgdXNlciB3b24ndCBiZSBhYmxlIHRvIGxvZ2luXG4gICAgICAgICAgLy8gVG8gbG9jayBhIHVzZXIgb3V0LCBqdXN0IHNldCB0aGUgQUNMIHRvIGBtYXN0ZXJLZXlgIG9ubHkgICh7fSkuXG4gICAgICAgICAgLy8gRW1wdHkgQUNMIGlzIE9LXG4gICAgICAgICAgaWYgKFxuICAgICAgICAgICAgIXJlcS5hdXRoLmlzTWFzdGVyICYmXG4gICAgICAgICAgICB1c2VyLkFDTCAmJlxuICAgICAgICAgICAgT2JqZWN0LmtleXModXNlci5BQ0wpLmxlbmd0aCA9PSAwXG4gICAgICAgICAgKSB7XG4gICAgICAgICAgICB0aHJvdyBuZXcgUGFyc2UuRXJyb3IoXG4gICAgICAgICAgICAgIFBhcnNlLkVycm9yLk9CSkVDVF9OT1RfRk9VTkQsXG4gICAgICAgICAgICAgICdJbnZhbGlkIHVzZXJuYW1lL3Bhc3N3b3JkLidcbiAgICAgICAgICAgICk7XG4gICAgICAgICAgfVxuICAgICAgICAgIGlmIChcbiAgICAgICAgICAgIHJlcS5jb25maWcudmVyaWZ5VXNlckVtYWlscyAmJlxuICAgICAgICAgICAgcmVxLmNvbmZpZy5wcmV2ZW50TG9naW5XaXRoVW52ZXJpZmllZEVtYWlsICYmXG4gICAgICAgICAgICAhdXNlci5lbWFpbFZlcmlmaWVkXG4gICAgICAgICAgKSB7XG4gICAgICAgICAgICB0aHJvdyBuZXcgUGFyc2UuRXJyb3IoXG4gICAgICAgICAgICAgIFBhcnNlLkVycm9yLkVNQUlMX05PVF9GT1VORCxcbiAgICAgICAgICAgICAgJ1VzZXIgZW1haWwgaXMgbm90IHZlcmlmaWVkLidcbiAgICAgICAgICAgICk7XG4gICAgICAgICAgfVxuXG4gICAgICAgICAgZGVsZXRlIHVzZXIucGFzc3dvcmQ7XG5cbiAgICAgICAgICAvLyBTb21ldGltZXMgdGhlIGF1dGhEYXRhIHN0aWxsIGhhcyBudWxsIG9uIHRoYXQga2V5c1xuICAgICAgICAgIC8vIGh0dHBzOi8vZ2l0aHViLmNvbS9wYXJzZS1jb21tdW5pdHkvcGFyc2Utc2VydmVyL2lzc3Vlcy85MzVcbiAgICAgICAgICBpZiAodXNlci5hdXRoRGF0YSkge1xuICAgICAgICAgICAgT2JqZWN0LmtleXModXNlci5hdXRoRGF0YSkuZm9yRWFjaChwcm92aWRlciA9PiB7XG4gICAgICAgICAgICAgIGlmICh1c2VyLmF1dGhEYXRhW3Byb3ZpZGVyXSA9PT0gbnVsbCkge1xuICAgICAgICAgICAgICAgIGRlbGV0ZSB1c2VyLmF1dGhEYXRhW3Byb3ZpZGVyXTtcbiAgICAgICAgICAgICAgfVxuICAgICAgICAgICAgfSk7XG4gICAgICAgICAgICBpZiAoT2JqZWN0LmtleXModXNlci5hdXRoRGF0YSkubGVuZ3RoID09IDApIHtcbiAgICAgICAgICAgICAgZGVsZXRlIHVzZXIuYXV0aERhdGE7XG4gICAgICAgICAgICB9XG4gICAgICAgICAgfVxuXG4gICAgICAgICAgcmV0dXJuIHJlc29sdmUodXNlcik7XG4gICAgICAgIH0pXG4gICAgICAgIC5jYXRjaChlcnJvciA9PiB7XG4gICAgICAgICAgcmV0dXJuIHJlamVjdChlcnJvcik7XG4gICAgICAgIH0pO1xuICAgIH0pO1xuICB9XG5cbiAgaGFuZGxlTWUocmVxKSB7XG4gICAgaWYgKCFyZXEuaW5mbyB8fCAhcmVxLmluZm8uc2Vzc2lvblRva2VuKSB7XG4gICAgICB0aHJvdyBuZXcgUGFyc2UuRXJyb3IoXG4gICAgICAgIFBhcnNlLkVycm9yLklOVkFMSURfU0VTU0lPTl9UT0tFTixcbiAgICAgICAgJ0ludmFsaWQgc2Vzc2lvbiB0b2tlbidcbiAgICAgICk7XG4gICAgfVxuICAgIGNvbnN0IHNlc3Npb25Ub2tlbiA9IHJlcS5pbmZvLnNlc3Npb25Ub2tlbjtcbiAgICByZXR1cm4gcmVzdFxuICAgICAgLmZpbmQoXG4gICAgICAgIHJlcS5jb25maWcsXG4gICAgICAgIEF1dGgubWFzdGVyKHJlcS5jb25maWcpLFxuICAgICAgICAnX1Nlc3Npb24nLFxuICAgICAgICB7IHNlc3Npb25Ub2tlbiB9LFxuICAgICAgICB7IGluY2x1ZGU6ICd1c2VyJyB9LFxuICAgICAgICByZXEuaW5mby5jbGllbnRTREtcbiAgICAgIClcbiAgICAgIC50aGVuKHJlc3BvbnNlID0+IHtcbiAgICAgICAgaWYgKFxuICAgICAgICAgICFyZXNwb25zZS5yZXN1bHRzIHx8XG4gICAgICAgICAgcmVzcG9uc2UucmVzdWx0cy5sZW5ndGggPT0gMCB8fFxuICAgICAgICAgICFyZXNwb25zZS5yZXN1bHRzWzBdLnVzZXJcbiAgICAgICAgKSB7XG4gICAgICAgICAgdGhyb3cgbmV3IFBhcnNlLkVycm9yKFxuICAgICAgICAgICAgUGFyc2UuRXJyb3IuSU5WQUxJRF9TRVNTSU9OX1RPS0VOLFxuICAgICAgICAgICAgJ0ludmFsaWQgc2Vzc2lvbiB0b2tlbidcbiAgICAgICAgICApO1xuICAgICAgICB9IGVsc2Uge1xuICAgICAgICAgIGNvbnN0IHVzZXIgPSByZXNwb25zZS5yZXN1bHRzWzBdLnVzZXI7XG4gICAgICAgICAgLy8gU2VuZCB0b2tlbiBiYWNrIG9uIHRoZSBsb2dpbiwgYmVjYXVzZSBTREtzIGV4cGVjdCB0aGF0LlxuICAgICAgICAgIHVzZXIuc2Vzc2lvblRva2VuID0gc2Vzc2lvblRva2VuO1xuXG4gICAgICAgICAgLy8gUmVtb3ZlIGhpZGRlbiBwcm9wZXJ0aWVzLlxuICAgICAgICAgIFVzZXJzUm91dGVyLnJlbW92ZUhpZGRlblByb3BlcnRpZXModXNlcik7XG5cbiAgICAgICAgICByZXR1cm4geyByZXNwb25zZTogdXNlciB9O1xuICAgICAgICB9XG4gICAgICB9KTtcbiAgfVxuXG4gIGFzeW5jIGhhbmRsZUxvZ0luKHJlcSkge1xuICAgIGNvbnN0IHVzZXIgPSBhd2FpdCB0aGlzLl9hdXRoZW50aWNhdGVVc2VyRnJvbVJlcXVlc3QocmVxKTtcblxuICAgIC8vIGhhbmRsZSBwYXNzd29yZCBleHBpcnkgcG9saWN5XG4gICAgaWYgKHJlcS5jb25maWcucGFzc3dvcmRQb2xpY3kgJiYgcmVxLmNvbmZpZy5wYXNzd29yZFBvbGljeS5tYXhQYXNzd29yZEFnZSkge1xuICAgICAgbGV0IGNoYW5nZWRBdCA9IHVzZXIuX3Bhc3N3b3JkX2NoYW5nZWRfYXQ7XG5cbiAgICAgIGlmICghY2hhbmdlZEF0KSB7XG4gICAgICAgIC8vIHBhc3N3b3JkIHdhcyBjcmVhdGVkIGJlZm9yZSBleHBpcnkgcG9saWN5IHdhcyBlbmFibGVkLlxuICAgICAgICAvLyBzaW1wbHkgdXBkYXRlIF9Vc2VyIG9iamVjdCBzbyB0aGF0IGl0IHdpbGwgc3RhcnQgZW5mb3JjaW5nIGZyb20gbm93XG4gICAgICAgIGNoYW5nZWRBdCA9IG5ldyBEYXRlKCk7XG4gICAgICAgIHJlcS5jb25maWcuZGF0YWJhc2UudXBkYXRlKFxuICAgICAgICAgICdfVXNlcicsXG4gICAgICAgICAgeyB1c2VybmFtZTogdXNlci51c2VybmFtZSB9LFxuICAgICAgICAgIHsgX3Bhc3N3b3JkX2NoYW5nZWRfYXQ6IFBhcnNlLl9lbmNvZGUoY2hhbmdlZEF0KSB9XG4gICAgICAgICk7XG4gICAgICB9IGVsc2Uge1xuICAgICAgICAvLyBjaGVjayB3aGV0aGVyIHRoZSBwYXNzd29yZCBoYXMgZXhwaXJlZFxuICAgICAgICBpZiAoY2hhbmdlZEF0Ll9fdHlwZSA9PSAnRGF0ZScpIHtcbiAgICAgICAgICBjaGFuZ2VkQXQgPSBuZXcgRGF0ZShjaGFuZ2VkQXQuaXNvKTtcbiAgICAgICAgfVxuICAgICAgICAvLyBDYWxjdWxhdGUgdGhlIGV4cGlyeSB0aW1lLlxuICAgICAgICBjb25zdCBleHBpcmVzQXQgPSBuZXcgRGF0ZShcbiAgICAgICAgICBjaGFuZ2VkQXQuZ2V0VGltZSgpICtcbiAgICAgICAgICAgIDg2NDAwMDAwICogcmVxLmNvbmZpZy5wYXNzd29yZFBvbGljeS5tYXhQYXNzd29yZEFnZVxuICAgICAgICApO1xuICAgICAgICBpZiAoZXhwaXJlc0F0IDwgbmV3IERhdGUoKSlcbiAgICAgICAgICAvLyBmYWlsIG9mIGN1cnJlbnQgdGltZSBpcyBwYXN0IHBhc3N3b3JkIGV4cGlyeSB0aW1lXG4gICAgICAgICAgdGhyb3cgbmV3IFBhcnNlLkVycm9yKFxuICAgICAgICAgICAgUGFyc2UuRXJyb3IuT0JKRUNUX05PVF9GT1VORCxcbiAgICAgICAgICAgICdZb3VyIHBhc3N3b3JkIGhhcyBleHBpcmVkLiBQbGVhc2UgcmVzZXQgeW91ciBwYXNzd29yZC4nXG4gICAgICAgICAgKTtcbiAgICAgIH1cbiAgICB9XG5cbiAgICAvLyBSZW1vdmUgaGlkZGVuIHByb3BlcnRpZXMuXG4gICAgVXNlcnNSb3V0ZXIucmVtb3ZlSGlkZGVuUHJvcGVydGllcyh1c2VyKTtcblxuICAgIHJlcS5jb25maWcuZmlsZXNDb250cm9sbGVyLmV4cGFuZEZpbGVzSW5PYmplY3QocmVxLmNvbmZpZywgdXNlcik7XG5cbiAgICAvLyBCZWZvcmUgbG9naW4gdHJpZ2dlcjsgdGhyb3dzIGlmIGZhaWx1cmVcbiAgICBhd2FpdCBtYXliZVJ1blRyaWdnZXIoXG4gICAgICBUcmlnZ2VyVHlwZXMuYmVmb3JlTG9naW4sXG4gICAgICByZXEuYXV0aCxcbiAgICAgIFBhcnNlLlVzZXIuZnJvbUpTT04oT2JqZWN0LmFzc2lnbih7IGNsYXNzTmFtZTogJ19Vc2VyJyB9LCB1c2VyKSksXG4gICAgICBudWxsLFxuICAgICAgcmVxLmNvbmZpZ1xuICAgICk7XG5cbiAgICBjb25zdCB7IHNlc3Npb25EYXRhLCBjcmVhdGVTZXNzaW9uIH0gPSBBdXRoLmNyZWF0ZVNlc3Npb24ocmVxLmNvbmZpZywge1xuICAgICAgdXNlcklkOiB1c2VyLm9iamVjdElkLFxuICAgICAgY3JlYXRlZFdpdGg6IHtcbiAgICAgICAgYWN0aW9uOiAnbG9naW4nLFxuICAgICAgICBhdXRoUHJvdmlkZXI6ICdwYXNzd29yZCcsXG4gICAgICB9LFxuICAgICAgaW5zdGFsbGF0aW9uSWQ6IHJlcS5pbmZvLmluc3RhbGxhdGlvbklkLFxuICAgIH0pO1xuXG4gICAgdXNlci5zZXNzaW9uVG9rZW4gPSBzZXNzaW9uRGF0YS5zZXNzaW9uVG9rZW47XG5cbiAgICBhd2FpdCBjcmVhdGVTZXNzaW9uKCk7XG5cbiAgICBjb25zdCBhZnRlckxvZ2luVXNlciA9IFBhcnNlLlVzZXIuZnJvbUpTT04oXG4gICAgICBPYmplY3QuYXNzaWduKHsgY2xhc3NOYW1lOiAnX1VzZXInIH0sIHVzZXIpXG4gICAgKTtcbiAgICBtYXliZVJ1blRyaWdnZXIoXG4gICAgICBUcmlnZ2VyVHlwZXMuYWZ0ZXJMb2dpbixcbiAgICAgIHsgLi4ucmVxLmF1dGgsIHVzZXI6IGFmdGVyTG9naW5Vc2VyIH0sXG4gICAgICBhZnRlckxvZ2luVXNlcixcbiAgICAgIG51bGwsXG4gICAgICByZXEuY29uZmlnXG4gICAgKTtcblxuICAgIHJldHVybiB7IHJlc3BvbnNlOiB1c2VyIH07XG4gIH1cblxuICBoYW5kbGVWZXJpZnlQYXNzd29yZChyZXEpIHtcbiAgICByZXR1cm4gdGhpcy5fYXV0aGVudGljYXRlVXNlckZyb21SZXF1ZXN0KHJlcSlcbiAgICAgIC50aGVuKHVzZXIgPT4ge1xuICAgICAgICAvLyBSZW1vdmUgaGlkZGVuIHByb3BlcnRpZXMuXG4gICAgICAgIFVzZXJzUm91dGVyLnJlbW92ZUhpZGRlblByb3BlcnRpZXModXNlcik7XG5cbiAgICAgICAgcmV0dXJuIHsgcmVzcG9uc2U6IHVzZXIgfTtcbiAgICAgIH0pXG4gICAgICAuY2F0Y2goZXJyb3IgPT4ge1xuICAgICAgICB0aHJvdyBlcnJvcjtcbiAgICAgIH0pO1xuICB9XG5cbiAgaGFuZGxlTG9nT3V0KHJlcSkge1xuICAgIGNvbnN0IHN1Y2Nlc3MgPSB7IHJlc3BvbnNlOiB7fSB9O1xuICAgIGlmIChyZXEuaW5mbyAmJiByZXEuaW5mby5zZXNzaW9uVG9rZW4pIHtcbiAgICAgIHJldHVybiByZXN0XG4gICAgICAgIC5maW5kKFxuICAgICAgICAgIHJlcS5jb25maWcsXG4gICAgICAgICAgQXV0aC5tYXN0ZXIocmVxLmNvbmZpZyksXG4gICAgICAgICAgJ19TZXNzaW9uJyxcbiAgICAgICAgICB7IHNlc3Npb25Ub2tlbjogcmVxLmluZm8uc2Vzc2lvblRva2VuIH0sXG4gICAgICAgICAgdW5kZWZpbmVkLFxuICAgICAgICAgIHJlcS5pbmZvLmNsaWVudFNES1xuICAgICAgICApXG4gICAgICAgIC50aGVuKHJlY29yZHMgPT4ge1xuICAgICAgICAgIGlmIChyZWNvcmRzLnJlc3VsdHMgJiYgcmVjb3Jkcy5yZXN1bHRzLmxlbmd0aCkge1xuICAgICAgICAgICAgcmV0dXJuIHJlc3RcbiAgICAgICAgICAgICAgLmRlbChcbiAgICAgICAgICAgICAgICByZXEuY29uZmlnLFxuICAgICAgICAgICAgICAgIEF1dGgubWFzdGVyKHJlcS5jb25maWcpLFxuICAgICAgICAgICAgICAgICdfU2Vzc2lvbicsXG4gICAgICAgICAgICAgICAgcmVjb3Jkcy5yZXN1bHRzWzBdLm9iamVjdElkXG4gICAgICAgICAgICAgIClcbiAgICAgICAgICAgICAgLnRoZW4oKCkgPT4ge1xuICAgICAgICAgICAgICAgIHRoaXMuX3J1bkFmdGVyTG9nb3V0VHJpZ2dlcihyZXEsIHJlY29yZHMucmVzdWx0c1swXSk7XG4gICAgICAgICAgICAgICAgcmV0dXJuIFByb21pc2UucmVzb2x2ZShzdWNjZXNzKTtcbiAgICAgICAgICAgICAgfSk7XG4gICAgICAgICAgfVxuICAgICAgICAgIHJldHVybiBQcm9taXNlLnJlc29sdmUoc3VjY2Vzcyk7XG4gICAgICAgIH0pO1xuICAgIH1cbiAgICByZXR1cm4gUHJvbWlzZS5yZXNvbHZlKHN1Y2Nlc3MpO1xuICB9XG5cbiAgX3J1bkFmdGVyTG9nb3V0VHJpZ2dlcihyZXEsIHNlc3Npb24pIHtcbiAgICAvLyBBZnRlciBsb2dvdXQgdHJpZ2dlclxuICAgIG1heWJlUnVuVHJpZ2dlcihcbiAgICAgIFRyaWdnZXJUeXBlcy5hZnRlckxvZ291dCxcbiAgICAgIHJlcS5hdXRoLFxuICAgICAgUGFyc2UuU2Vzc2lvbi5mcm9tSlNPTihPYmplY3QuYXNzaWduKHsgY2xhc3NOYW1lOiAnX1Nlc3Npb24nIH0sIHNlc3Npb24pKSxcbiAgICAgIG51bGwsXG4gICAgICByZXEuY29uZmlnXG4gICAgKTtcbiAgfVxuXG4gIF90aHJvd09uQmFkRW1haWxDb25maWcocmVxKSB7XG4gICAgdHJ5IHtcbiAgICAgIENvbmZpZy52YWxpZGF0ZUVtYWlsQ29uZmlndXJhdGlvbih7XG4gICAgICAgIGVtYWlsQWRhcHRlcjogcmVxLmNvbmZpZy51c2VyQ29udHJvbGxlci5hZGFwdGVyLFxuICAgICAgICBhcHBOYW1lOiByZXEuY29uZmlnLmFwcE5hbWUsXG4gICAgICAgIHB1YmxpY1NlcnZlclVSTDogcmVxLmNvbmZpZy5wdWJsaWNTZXJ2ZXJVUkwsXG4gICAgICAgIGVtYWlsVmVyaWZ5VG9rZW5WYWxpZGl0eUR1cmF0aW9uOlxuICAgICAgICAgIHJlcS5jb25maWcuZW1haWxWZXJpZnlUb2tlblZhbGlkaXR5RHVyYXRpb24sXG4gICAgICB9KTtcbiAgICB9IGNhdGNoIChlKSB7XG4gICAgICBpZiAodHlwZW9mIGUgPT09ICdzdHJpbmcnKSB7XG4gICAgICAgIC8vIE1heWJlIHdlIG5lZWQgYSBCYWQgQ29uZmlndXJhdGlvbiBlcnJvciwgYnV0IHRoZSBTREtzIHdvbid0IHVuZGVyc3RhbmQgaXQuIEZvciBub3csIEludGVybmFsIFNlcnZlciBFcnJvci5cbiAgICAgICAgdGhyb3cgbmV3IFBhcnNlLkVycm9yKFxuICAgICAgICAgIFBhcnNlLkVycm9yLklOVEVSTkFMX1NFUlZFUl9FUlJPUixcbiAgICAgICAgICAnQW4gYXBwTmFtZSwgcHVibGljU2VydmVyVVJMLCBhbmQgZW1haWxBZGFwdGVyIGFyZSByZXF1aXJlZCBmb3IgcGFzc3dvcmQgcmVzZXQgYW5kIGVtYWlsIHZlcmlmaWNhdGlvbiBmdW5jdGlvbmFsaXR5LidcbiAgICAgICAgKTtcbiAgICAgIH0gZWxzZSB7XG4gICAgICAgIHRocm93IGU7XG4gICAgICB9XG4gICAgfVxuICB9XG5cbiAgaGFuZGxlUmVzZXRSZXF1ZXN0KHJlcSkge1xuICAgIHRoaXMuX3Rocm93T25CYWRFbWFpbENvbmZpZyhyZXEpO1xuXG4gICAgY29uc3QgeyBlbWFpbCB9ID0gcmVxLmJvZHk7XG4gICAgaWYgKCFlbWFpbCkge1xuICAgICAgdGhyb3cgbmV3IFBhcnNlLkVycm9yKFxuICAgICAgICBQYXJzZS5FcnJvci5FTUFJTF9NSVNTSU5HLFxuICAgICAgICAneW91IG11c3QgcHJvdmlkZSBhbiBlbWFpbCdcbiAgICAgICk7XG4gICAgfVxuICAgIGlmICh0eXBlb2YgZW1haWwgIT09ICdzdHJpbmcnKSB7XG4gICAgICB0aHJvdyBuZXcgUGFyc2UuRXJyb3IoXG4gICAgICAgIFBhcnNlLkVycm9yLklOVkFMSURfRU1BSUxfQUREUkVTUyxcbiAgICAgICAgJ3lvdSBtdXN0IHByb3ZpZGUgYSB2YWxpZCBlbWFpbCBzdHJpbmcnXG4gICAgICApO1xuICAgIH1cbiAgICBjb25zdCB1c2VyQ29udHJvbGxlciA9IHJlcS5jb25maWcudXNlckNvbnRyb2xsZXI7XG4gICAgcmV0dXJuIHVzZXJDb250cm9sbGVyLnNlbmRQYXNzd29yZFJlc2V0RW1haWwoZW1haWwpLnRoZW4oXG4gICAgICAoKSA9PiB7XG4gICAgICAgIHJldHVybiBQcm9taXNlLnJlc29sdmUoe1xuICAgICAgICAgIHJlc3BvbnNlOiB7fSxcbiAgICAgICAgfSk7XG4gICAgICB9LFxuICAgICAgZXJyID0+IHtcbiAgICAgICAgaWYgKGVyci5jb2RlID09PSBQYXJzZS5FcnJvci5PQkpFQ1RfTk9UX0ZPVU5EKSB7XG4gICAgICAgICAgLy8gUmV0dXJuIHN1Y2Nlc3Mgc28gdGhhdCB0aGlzIGVuZHBvaW50IGNhbid0XG4gICAgICAgICAgLy8gYmUgdXNlZCB0byBlbnVtZXJhdGUgdmFsaWQgZW1haWxzXG4gICAgICAgICAgcmV0dXJuIFByb21pc2UucmVzb2x2ZSh7XG4gICAgICAgICAgICByZXNwb25zZToge30sXG4gICAgICAgICAgfSk7XG4gICAgICAgIH0gZWxzZSB7XG4gICAgICAgICAgdGhyb3cgZXJyO1xuICAgICAgICB9XG4gICAgICB9XG4gICAgKTtcbiAgfVxuXG4gIGhhbmRsZVZlcmlmaWNhdGlvbkVtYWlsUmVxdWVzdChyZXEpIHtcbiAgICB0aGlzLl90aHJvd09uQmFkRW1haWxDb25maWcocmVxKTtcblxuICAgIGNvbnN0IHsgZW1haWwgfSA9IHJlcS5ib2R5O1xuICAgIGlmICghZW1haWwpIHtcbiAgICAgIHRocm93IG5ldyBQYXJzZS5FcnJvcihcbiAgICAgICAgUGFyc2UuRXJyb3IuRU1BSUxfTUlTU0lORyxcbiAgICAgICAgJ3lvdSBtdXN0IHByb3ZpZGUgYW4gZW1haWwnXG4gICAgICApO1xuICAgIH1cbiAgICBpZiAodHlwZW9mIGVtYWlsICE9PSAnc3RyaW5nJykge1xuICAgICAgdGhyb3cgbmV3IFBhcnNlLkVycm9yKFxuICAgICAgICBQYXJzZS5FcnJvci5JTlZBTElEX0VNQUlMX0FERFJFU1MsXG4gICAgICAgICd5b3UgbXVzdCBwcm92aWRlIGEgdmFsaWQgZW1haWwgc3RyaW5nJ1xuICAgICAgKTtcbiAgICB9XG5cbiAgICByZXR1cm4gcmVxLmNvbmZpZy5kYXRhYmFzZS5maW5kKCdfVXNlcicsIHsgZW1haWw6IGVtYWlsIH0pLnRoZW4ocmVzdWx0cyA9PiB7XG4gICAgICBpZiAoIXJlc3VsdHMubGVuZ3RoIHx8IHJlc3VsdHMubGVuZ3RoIDwgMSkge1xuICAgICAgICB0aHJvdyBuZXcgUGFyc2UuRXJyb3IoXG4gICAgICAgICAgUGFyc2UuRXJyb3IuRU1BSUxfTk9UX0ZPVU5ELFxuICAgICAgICAgIGBObyB1c2VyIGZvdW5kIHdpdGggZW1haWwgJHtlbWFpbH1gXG4gICAgICAgICk7XG4gICAgICB9XG4gICAgICBjb25zdCB1c2VyID0gcmVzdWx0c1swXTtcblxuICAgICAgLy8gcmVtb3ZlIHBhc3N3b3JkIGZpZWxkLCBtZXNzZXMgd2l0aCBzYXZpbmcgb24gcG9zdGdyZXNcbiAgICAgIGRlbGV0ZSB1c2VyLnBhc3N3b3JkO1xuXG4gICAgICBpZiAodXNlci5lbWFpbFZlcmlmaWVkKSB7XG4gICAgICAgIHRocm93IG5ldyBQYXJzZS5FcnJvcihcbiAgICAgICAgICBQYXJzZS5FcnJvci5PVEhFUl9DQVVTRSxcbiAgICAgICAgICBgRW1haWwgJHtlbWFpbH0gaXMgYWxyZWFkeSB2ZXJpZmllZC5gXG4gICAgICAgICk7XG4gICAgICB9XG5cbiAgICAgIGNvbnN0IHVzZXJDb250cm9sbGVyID0gcmVxLmNvbmZpZy51c2VyQ29udHJvbGxlcjtcbiAgICAgIHJldHVybiB1c2VyQ29udHJvbGxlci5yZWdlbmVyYXRlRW1haWxWZXJpZnlUb2tlbih1c2VyKS50aGVuKCgpID0+IHtcbiAgICAgICAgdXNlckNvbnRyb2xsZXIuc2VuZFZlcmlmaWNhdGlvbkVtYWlsKHVzZXIpO1xuICAgICAgICByZXR1cm4geyByZXNwb25zZToge30gfTtcbiAgICAgIH0pO1xuICAgIH0pO1xuICB9XG5cbiAgbW91bnRSb3V0ZXMoKSB7XG4gICAgdGhpcy5yb3V0ZSgnR0VUJywgJy91c2VycycsIHJlcSA9PiB7XG4gICAgICByZXR1cm4gdGhpcy5oYW5kbGVGaW5kKHJlcSk7XG4gICAgfSk7XG4gICAgdGhpcy5yb3V0ZSgnUE9TVCcsICcvdXNlcnMnLCByZXEgPT4ge1xuICAgICAgcmV0dXJuIHRoaXMuaGFuZGxlQ3JlYXRlKHJlcSk7XG4gICAgfSk7XG4gICAgdGhpcy5yb3V0ZSgnR0VUJywgJy91c2Vycy9tZScsIHJlcSA9PiB7XG4gICAgICByZXR1cm4gdGhpcy5oYW5kbGVNZShyZXEpO1xuICAgIH0pO1xuICAgIHRoaXMucm91dGUoJ0dFVCcsICcvdXNlcnMvOm9iamVjdElkJywgcmVxID0+IHtcbiAgICAgIHJldHVybiB0aGlzLmhhbmRsZUdldChyZXEpO1xuICAgIH0pO1xuICAgIHRoaXMucm91dGUoJ1BVVCcsICcvdXNlcnMvOm9iamVjdElkJywgcmVxID0+IHtcbiAgICAgIHJldHVybiB0aGlzLmhhbmRsZVVwZGF0ZShyZXEpO1xuICAgIH0pO1xuICAgIHRoaXMucm91dGUoJ0RFTEVURScsICcvdXNlcnMvOm9iamVjdElkJywgcmVxID0+IHtcbiAgICAgIHJldHVybiB0aGlzLmhhbmRsZURlbGV0ZShyZXEpO1xuICAgIH0pO1xuICAgIHRoaXMucm91dGUoJ0dFVCcsICcvbG9naW4nLCByZXEgPT4ge1xuICAgICAgcmV0dXJuIHRoaXMuaGFuZGxlTG9nSW4ocmVxKTtcbiAgICB9KTtcbiAgICB0aGlzLnJvdXRlKCdQT1NUJywgJy9sb2dpbicsIHJlcSA9PiB7XG4gICAgICByZXR1cm4gdGhpcy5oYW5kbGVMb2dJbihyZXEpO1xuICAgIH0pO1xuICAgIHRoaXMucm91dGUoJ1BPU1QnLCAnL2xvZ291dCcsIHJlcSA9PiB7XG4gICAgICByZXR1cm4gdGhpcy5oYW5kbGVMb2dPdXQocmVxKTtcbiAgICB9KTtcbiAgICB0aGlzLnJvdXRlKCdQT1NUJywgJy9yZXF1ZXN0UGFzc3dvcmRSZXNldCcsIHJlcSA9PiB7XG4gICAgICByZXR1cm4gdGhpcy5oYW5kbGVSZXNldFJlcXVlc3QocmVxKTtcbiAgICB9KTtcbiAgICB0aGlzLnJvdXRlKCdQT1NUJywgJy92ZXJpZmljYXRpb25FbWFpbFJlcXVlc3QnLCByZXEgPT4ge1xuICAgICAgcmV0dXJuIHRoaXMuaGFuZGxlVmVyaWZpY2F0aW9uRW1haWxSZXF1ZXN0KHJlcSk7XG4gICAgfSk7XG4gICAgdGhpcy5yb3V0ZSgnR0VUJywgJy92ZXJpZnlQYXNzd29yZCcsIHJlcSA9PiB7XG4gICAgICByZXR1cm4gdGhpcy5oYW5kbGVWZXJpZnlQYXNzd29yZChyZXEpO1xuICAgIH0pO1xuICB9XG59XG5cbmV4cG9ydCBkZWZhdWx0IFVzZXJzUm91dGVyO1xuIl19