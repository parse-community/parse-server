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

    (0, _triggers.maybeRunTrigger)(_triggers.Types.afterLogin, _objectSpread(_objectSpread({}, req.auth), {}, {
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
  }

}

exports.UsersRouter = UsersRouter;
var _default = UsersRouter;
exports.default = _default;
//# sourceMappingURL=data:application/json;charset=utf-8;base64,eyJ2ZXJzaW9uIjozLCJzb3VyY2VzIjpbIi4uLy4uL3NyYy9Sb3V0ZXJzL1VzZXJzUm91dGVyLmpzIl0sIm5hbWVzIjpbIlVzZXJzUm91dGVyIiwiQ2xhc3Nlc1JvdXRlciIsImNsYXNzTmFtZSIsInJlbW92ZUhpZGRlblByb3BlcnRpZXMiLCJvYmoiLCJrZXkiLCJPYmplY3QiLCJwcm90b3R5cGUiLCJoYXNPd25Qcm9wZXJ0eSIsImNhbGwiLCJ0ZXN0IiwiX2F1dGhlbnRpY2F0ZVVzZXJGcm9tUmVxdWVzdCIsInJlcSIsIlByb21pc2UiLCJyZXNvbHZlIiwicmVqZWN0IiwicGF5bG9hZCIsImJvZHkiLCJ1c2VybmFtZSIsInF1ZXJ5IiwiZW1haWwiLCJwYXNzd29yZCIsIlBhcnNlIiwiRXJyb3IiLCJVU0VSTkFNRV9NSVNTSU5HIiwiUEFTU1dPUkRfTUlTU0lORyIsIk9CSkVDVF9OT1RfRk9VTkQiLCJ1c2VyIiwiaXNWYWxpZFBhc3N3b3JkIiwiJG9yIiwiY29uZmlnIiwiZGF0YWJhc2UiLCJmaW5kIiwidGhlbiIsInJlc3VsdHMiLCJsZW5ndGgiLCJsb2dnZXJDb250cm9sbGVyIiwid2FybiIsImZpbHRlciIsInBhc3N3b3JkQ3J5cHRvIiwiY29tcGFyZSIsImNvcnJlY3QiLCJhY2NvdW50TG9ja291dFBvbGljeSIsIkFjY291bnRMb2Nrb3V0IiwiaGFuZGxlTG9naW5BdHRlbXB0IiwiYXV0aCIsImlzTWFzdGVyIiwiQUNMIiwia2V5cyIsInZlcmlmeVVzZXJFbWFpbHMiLCJwcmV2ZW50TG9naW5XaXRoVW52ZXJpZmllZEVtYWlsIiwiZW1haWxWZXJpZmllZCIsIkVNQUlMX05PVF9GT1VORCIsImF1dGhEYXRhIiwiZm9yRWFjaCIsInByb3ZpZGVyIiwiY2F0Y2giLCJlcnJvciIsImhhbmRsZU1lIiwiaW5mbyIsInNlc3Npb25Ub2tlbiIsIklOVkFMSURfU0VTU0lPTl9UT0tFTiIsInJlc3QiLCJBdXRoIiwibWFzdGVyIiwiaW5jbHVkZSIsImNsaWVudFNESyIsImNvbnRleHQiLCJyZXNwb25zZSIsImhhbmRsZUxvZ0luIiwicGFzc3dvcmRQb2xpY3kiLCJtYXhQYXNzd29yZEFnZSIsImNoYW5nZWRBdCIsIl9wYXNzd29yZF9jaGFuZ2VkX2F0IiwiRGF0ZSIsInVwZGF0ZSIsIl9lbmNvZGUiLCJfX3R5cGUiLCJpc28iLCJleHBpcmVzQXQiLCJnZXRUaW1lIiwiZmlsZXNDb250cm9sbGVyIiwiZXhwYW5kRmlsZXNJbk9iamVjdCIsIlRyaWdnZXJUeXBlcyIsImJlZm9yZUxvZ2luIiwiVXNlciIsImZyb21KU09OIiwiYXNzaWduIiwic2Vzc2lvbkRhdGEiLCJjcmVhdGVTZXNzaW9uIiwidXNlcklkIiwib2JqZWN0SWQiLCJjcmVhdGVkV2l0aCIsImFjdGlvbiIsImF1dGhQcm92aWRlciIsImluc3RhbGxhdGlvbklkIiwiYWZ0ZXJMb2dpblVzZXIiLCJhZnRlckxvZ2luIiwiaGFuZGxlVmVyaWZ5UGFzc3dvcmQiLCJoYW5kbGVMb2dPdXQiLCJzdWNjZXNzIiwidW5kZWZpbmVkIiwicmVjb3JkcyIsImRlbCIsIl9ydW5BZnRlckxvZ291dFRyaWdnZXIiLCJzZXNzaW9uIiwiYWZ0ZXJMb2dvdXQiLCJTZXNzaW9uIiwiX3Rocm93T25CYWRFbWFpbENvbmZpZyIsIkNvbmZpZyIsInZhbGlkYXRlRW1haWxDb25maWd1cmF0aW9uIiwiZW1haWxBZGFwdGVyIiwidXNlckNvbnRyb2xsZXIiLCJhZGFwdGVyIiwiYXBwTmFtZSIsInB1YmxpY1NlcnZlclVSTCIsImVtYWlsVmVyaWZ5VG9rZW5WYWxpZGl0eUR1cmF0aW9uIiwiZSIsIklOVEVSTkFMX1NFUlZFUl9FUlJPUiIsImhhbmRsZVJlc2V0UmVxdWVzdCIsIkVNQUlMX01JU1NJTkciLCJJTlZBTElEX0VNQUlMX0FERFJFU1MiLCJzZW5kUGFzc3dvcmRSZXNldEVtYWlsIiwiZXJyIiwiY29kZSIsImhhbmRsZVZlcmlmaWNhdGlvbkVtYWlsUmVxdWVzdCIsIk9USEVSX0NBVVNFIiwicmVnZW5lcmF0ZUVtYWlsVmVyaWZ5VG9rZW4iLCJzZW5kVmVyaWZpY2F0aW9uRW1haWwiLCJtb3VudFJvdXRlcyIsInJvdXRlIiwiaGFuZGxlRmluZCIsInByb21pc2VFbnN1cmVJZGVtcG90ZW5jeSIsImhhbmRsZUNyZWF0ZSIsImhhbmRsZUdldCIsImhhbmRsZVVwZGF0ZSIsImhhbmRsZURlbGV0ZSJdLCJtYXBwaW5ncyI6Ijs7Ozs7OztBQUVBOztBQUNBOztBQUNBOztBQUNBOztBQUNBOztBQUNBOztBQUNBOztBQUNBOztBQUNBOzs7Ozs7Ozs7O0FBRU8sTUFBTUEsV0FBTixTQUEwQkMsc0JBQTFCLENBQXdDO0FBQzdDQyxFQUFBQSxTQUFTLEdBQUc7QUFDVixXQUFPLE9BQVA7QUFDRDtBQUVEOzs7Ozs7QUFJQSxTQUFPQyxzQkFBUCxDQUE4QkMsR0FBOUIsRUFBbUM7QUFDakMsU0FBSyxJQUFJQyxHQUFULElBQWdCRCxHQUFoQixFQUFxQjtBQUNuQixVQUFJRSxNQUFNLENBQUNDLFNBQVAsQ0FBaUJDLGNBQWpCLENBQWdDQyxJQUFoQyxDQUFxQ0wsR0FBckMsRUFBMENDLEdBQTFDLENBQUosRUFBb0Q7QUFDbEQ7QUFDQSxZQUFJQSxHQUFHLEtBQUssUUFBUixJQUFvQixDQUFDLDBCQUEwQkssSUFBMUIsQ0FBK0JMLEdBQS9CLENBQXpCLEVBQThEO0FBQzVELGlCQUFPRCxHQUFHLENBQUNDLEdBQUQsQ0FBVjtBQUNEO0FBQ0Y7QUFDRjtBQUNGO0FBRUQ7Ozs7Ozs7O0FBTUFNLEVBQUFBLDRCQUE0QixDQUFDQyxHQUFELEVBQU07QUFDaEMsV0FBTyxJQUFJQyxPQUFKLENBQVksQ0FBQ0MsT0FBRCxFQUFVQyxNQUFWLEtBQXFCO0FBQ3RDO0FBQ0EsVUFBSUMsT0FBTyxHQUFHSixHQUFHLENBQUNLLElBQWxCOztBQUNBLFVBQ0csQ0FBQ0QsT0FBTyxDQUFDRSxRQUFULElBQXFCTixHQUFHLENBQUNPLEtBQUosQ0FBVUQsUUFBaEMsSUFDQyxDQUFDRixPQUFPLENBQUNJLEtBQVQsSUFBa0JSLEdBQUcsQ0FBQ08sS0FBSixDQUFVQyxLQUYvQixFQUdFO0FBQ0FKLFFBQUFBLE9BQU8s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a0JBQUwsQ0FBd0IzRyxHQUF4QixDQUFQO0FBQ0QsS0FGRDtBQUdBLFNBQUtzSCxLQUFMLENBQVcsTUFBWCxFQUFtQiwyQkFBbkIsRUFBZ0R0SCxHQUFHLElBQUk7QUFDckQsYUFBTyxLQUFLaUgsOEJBQUwsQ0FBb0NqSCxHQUFwQyxDQUFQO0FBQ0QsS0FGRDtBQUdBLFNBQUtzSCxLQUFMLENBQVcsS0FBWCxFQUFrQixpQkFBbEIsRUFBcUN0SCxHQUFHLElBQUk7QUFDMUMsYUFBTyxLQUFLc0Ysb0JBQUwsQ0FBMEJ0RixHQUExQixDQUFQO0FBQ0QsS0FGRDtBQUdEOztBQXJkNEM7OztlQXdkaENaLFciLCJzb3VyY2VzQ29udGVudCI6WyIvLyBUaGVzZSBtZXRob2RzIGhhbmRsZSB0aGUgVXNlci1yZWxhdGVkIHJvdXRlcy5cblxuaW1wb3J0IFBhcnNlIGZyb20gJ3BhcnNlL25vZGUnO1xuaW1wb3J0IENvbmZpZyBmcm9tICcuLi9Db25maWcnO1xuaW1wb3J0IEFjY291bnRMb2Nrb3V0IGZyb20gJy4uL0FjY291bnRMb2Nrb3V0JztcbmltcG9ydCBDbGFzc2VzUm91dGVyIGZyb20gJy4vQ2xhc3Nlc1JvdXRlcic7XG5pbXBvcnQgcmVzdCBmcm9tICcuLi9yZXN0JztcbmltcG9ydCBBdXRoIGZyb20gJy4uL0F1dGgnO1xuaW1wb3J0IHBhc3N3b3JkQ3J5cHRvIGZyb20gJy4uL3Bhc3N3b3JkJztcbmltcG9ydCB7IG1heWJlUnVuVHJpZ2dlciwgVHlwZXMgYXMgVHJpZ2dlclR5cGVzIH0gZnJvbSAnLi4vdHJpZ2dlcnMnO1xuaW1wb3J0IHsgcHJvbWlzZUVuc3VyZUlkZW1wb3RlbmN5IH0gZnJvbSAnLi4vbWlkZGxld2FyZXMnO1xuXG5leHBvcnQgY2xhc3MgVXNlcnNSb3V0ZXIgZXh0ZW5kcyBDbGFzc2VzUm91dGVyIHtcbiAgY2xhc3NOYW1lKCkge1xuICAgIHJldHVybiAnX1VzZXInO1xuICB9XG5cbiAgLyoqXG4gICAqIFJlbW92ZXMgYWxsIFwiX1wiIHByZWZpeGVkIHByb3BlcnRpZXMgZnJvbSBhbiBvYmplY3QsIGV4Y2VwdCBcIl9fdHlwZVwiXG4gICAqIEBwYXJhbSB7T2JqZWN0fSBvYmogQW4gb2JqZWN0LlxuICAgKi9cbiAgc3RhdGljIHJlbW92ZUhpZGRlblByb3BlcnRpZXMob2JqKSB7XG4gICAgZm9yICh2YXIga2V5IGluIG9iaikge1xuICAgICAgaWYgKE9iamVjdC5wcm90b3R5cGUuaGFzT3duUHJvcGVydHkuY2FsbChvYmosIGtleSkpIHtcbiAgICAgICAgLy8gUmVnZXhwIGNvbWVzIGZyb20gUGFyc2UuT2JqZWN0LnByb3RvdHlwZS52YWxpZGF0ZVxuICAgICAgICBpZiAoa2V5ICE9PSAnX190eXBlJyAmJiAhL15bQS1aYS16XVswLTlBLVphLXpfXSokLy50ZXN0KGtleSkpIHtcbiAgICAgICAgICBkZWxldGUgb2JqW2tleV07XG4gICAgICAgIH1cbiAgICAgIH1cbiAgICB9XG4gIH1cblxuICAvKipcbiAgICogVmFsaWRhdGVzIGEgcGFzc3dvcmQgcmVxdWVzdCBpbiBsb2dpbiBhbmQgdmVyaWZ5UGFzc3dvcmRcbiAgICogQHBhcmFtIHtPYmplY3R9IHJlcSBUaGUgcmVxdWVzdFxuICAgKiBAcmV0dXJucyB7T2JqZWN0fSBVc2VyIG9iamVjdFxuICAgKiBAcHJpdmF0ZVxuICAgKi9cbiAgX2F1dGhlbnRpY2F0ZVVzZXJGcm9tUmVxdWVzdChyZXEpIHtcbiAgICByZXR1cm4gbmV3IFByb21pc2UoKHJlc29sdmUsIHJlamVjdCkgPT4ge1xuICAgICAgLy8gVXNlIHF1ZXJ5IHBhcmFtZXRlcnMgaW5zdGVhZCBpZiBwcm92aWRlZCBpbiB1cmxcbiAgICAgIGxldCBwYXlsb2FkID0gcmVxLmJvZHk7XG4gICAgICBpZiAoXG4gICAgICAgICghcGF5bG9hZC51c2VybmFtZSAmJiByZXEucXVlcnkudXNlcm5hbWUpIHx8XG4gICAgICAgICghcGF5bG9hZC5lbWFpbCAmJiByZXEucXVlcnkuZW1haWwpXG4gICAgICApIHtcbiAgICAgICAgcGF5bG9hZCA9IHJlcS5xdWVyeTtcbiAgICAgIH1cbiAgICAgIGNvbnN0IHsgdXNlcm5hbWUsIGVtYWlsLCBwYXNzd29yZCB9ID0gcGF5bG9hZDtcblxuICAgICAgLy8gVE9ETzogdXNlIHRoZSByaWdodCBlcnJvciBjb2RlcyAvIGRlc2NyaXB0aW9ucy5cbiAgICAgIGlmICghdXNlcm5hbWUgJiYgIWVtYWlsKSB7XG4gICAgICAgIHRocm93IG5ldyBQYXJzZS5FcnJvcihcbiAgICAgICAgICBQYXJzZS5FcnJvci5VU0VSTkFNRV9NSVNTSU5HLFxuICAgICAgICAgICd1c2VybmFtZS9lbWFpbCBpcyByZXF1aXJlZC4nXG4gICAgICAgICk7XG4gICAgICB9XG4gICAgICBpZiAoIXBhc3N3b3JkKSB7XG4gICAgICAgIHRocm93IG5ldyBQYXJzZS5FcnJvcihcbiAgICAgICAgICBQYXJzZS5FcnJvci5QQVNTV09SRF9NSVNTSU5HLFxuICAgICAgICAgICdwYXNzd29yZCBpcyByZXF1aXJlZC4nXG4gICAgICAgICk7XG4gICAgICB9XG4gICAgICBpZiAoXG4gICAgICAgIHR5cGVvZiBwYXNzd29yZCAhPT0gJ3N0cmluZycgfHxcbiAgICAgICAgKGVtYWlsICYmIHR5cGVvZiBlbWFpbCAhPT0gJ3N0cmluZycpIHx8XG4gICAgICAgICh1c2VybmFtZSAmJiB0eXBlb2YgdXNlcm5hbWUgIT09ICdzdHJpbmcnKVxuICAgICAgKSB7XG4gICAgICAgIHRocm93IG5ldyBQYXJzZS5FcnJvcihcbiAgICAgICAgICBQYXJzZS5FcnJvci5PQkpFQ1RfTk9UX0ZPVU5ELFxuICAgICAgICAgICdJbnZhbGlkIHVzZXJuYW1lL3Bhc3N3b3JkLidcbiAgICAgICAgKTtcbiAgICAgIH1cblxuICAgICAgbGV0IHVzZXI7XG4gICAgICBsZXQgaXNWYWxpZFBhc3N3b3JkID0gZmFsc2U7XG4gICAgICBsZXQgcXVlcnk7XG4gICAgICBpZiAoZW1haWwgJiYgdXNlcm5hbWUpIHtcbiAgICAgICAgcXVlcnkgPSB7IGVtYWlsLCB1c2VybmFtZSB9O1xuICAgICAgfSBlbHNlIGlmIChlbWFpbCkge1xuICAgICAgICBxdWVyeSA9IHsgZW1haWwgfTtcbiAgICAgIH0gZWxzZSB7XG4gICAgICAgIHF1ZXJ5ID0geyAkb3I6IFt7IHVzZXJuYW1lIH0sIHsgZW1haWw6IHVzZXJuYW1lIH1dIH07XG4gICAgICB9XG4gICAgICByZXR1cm4gcmVxLmNvbmZpZy5kYXRhYmFzZVxuICAgICAgICAuZmluZCgnX1VzZXInLCBxdWVyeSlcbiAgICAgICAgLnRoZW4ocmVzdWx0cyA9PiB7XG4gICAgICAgICAgaWYgKCFyZXN1bHRzLmxlbmd0aCkge1xuICAgICAgICAgICAgdGhyb3cgbmV3IFBhcnNlLkVycm9yKFxuICAgICAgICAgICAgICBQYXJzZS5FcnJvci5PQkpFQ1RfTk9UX0ZPVU5ELFxuICAgICAgICAgICAgICAnSW52YWxpZCB1c2VybmFtZS9wYXNzd29yZC4nXG4gICAgICAgICAgICApO1xuICAgICAgICAgIH1cblxuICAgICAgICAgIGlmIChyZXN1bHRzLmxlbmd0aCA+IDEpIHtcbiAgICAgICAgICAgIC8vIGNvcm5lciBjYXNlIHdoZXJlIHVzZXIxIGhhcyB1c2VybmFtZSA9PSB1c2VyMiBlbWFpbFxuICAgICAgICAgICAgcmVxLmNvbmZpZy5sb2dnZXJDb250cm9sbGVyLndhcm4oXG4gICAgICAgICAgICAgIFwiVGhlcmUgaXMgYSB1c2VyIHdoaWNoIGVtYWlsIGlzIHRoZSBzYW1lIGFzIGFub3RoZXIgdXNlcidzIHVzZXJuYW1lLCBsb2dnaW5nIGluIGJhc2VkIG9uIHVzZXJuYW1lXCJcbiAgICAgICAgICAgICk7XG4gICAgICAgICAgICB1c2VyID0gcmVzdWx0cy5maWx0ZXIodXNlciA9PiB1c2VyLnVzZXJuYW1lID09PSB1c2VybmFtZSlbMF07XG4gICAgICAgICAgfSBlbHNlIHtcbiAgICAgICAgICAgIHVzZXIgPSByZXN1bHRzWzBdO1xuICAgICAgICAgIH1cblxuICAgICAgICAgIHJldHVybiBwYXNzd29yZENyeXB0by5jb21wYXJlKHBhc3N3b3JkLCB1c2VyLnBhc3N3b3JkKTtcbiAgICAgICAgfSlcbiAgICAgICAgLnRoZW4oY29ycmVjdCA9PiB7XG4gICAgICAgICAgaXNWYWxpZFBhc3N3b3JkID0gY29ycmVjdDtcbiAgICAgICAgICBjb25zdCBhY2NvdW50TG9ja291dFBvbGljeSA9IG5ldyBBY2NvdW50TG9ja291dCh1c2VyLCByZXEuY29uZmlnKTtcbiAgICAgICAgICByZXR1cm4gYWNjb3VudExvY2tvdXRQb2xpY3kuaGFuZGxlTG9naW5BdHRlbXB0KGlzVmFsaWRQYXNzd29yZCk7XG4gICAgICAgIH0pXG4gICAgICAgIC50aGVuKCgpID0+IHtcbiAgICAgICAgICBpZiAoIWlzVmFsaWRQYXNzd29yZCkge1xuICAgICAgICAgICAgdGhyb3cgbmV3IFBhcnNlLkVycm9yKFxuICAgICAgICAgICAgICBQYXJzZS5FcnJvci5PQkpFQ1RfTk9UX0ZPVU5ELFxuICAgICAgICAgICAgICAnSW52YWxpZCB1c2VybmFtZS9wYXNzd29yZC4nXG4gICAgICAgICAgICApO1xuICAgICAgICAgIH1cbiAgICAgICAgICAvLyBFbnN1cmUgdGhlIHVzZXIgaXNuJ3QgbG9ja2VkIG91dFxuICAgICAgICAgIC8vIEEgbG9ja2VkIG91dCB1c2VyIHdvbid0IGJlIGFibGUgdG8gbG9naW5cbiAgICAgICAgICAvLyBUbyBsb2NrIGEgdXNlciBvdXQsIGp1c3Qgc2V0IHRoZSBBQ0wgdG8gYG1hc3RlcktleWAgb25seSAgKHt9KS5cbiAgICAgICAgICAvLyBFbXB0eSBBQ0wgaXMgT0tcbiAgICAgICAgICBpZiAoXG4gICAgICAgICAgICAhcmVxLmF1dGguaXNNYXN0ZXIgJiZcbiAgICAgICAgICAgIHVzZXIuQUNMICYmXG4gICAgICAgICAgICBPYmplY3Qua2V5cyh1c2VyLkFDTCkubGVuZ3RoID09IDBcbiAgICAgICAgICApIHtcbiAgICAgICAgICAgIHRocm93IG5ldyBQYXJzZS5FcnJvcihcbiAgICAgICAgICAgICAgUGFyc2UuRXJyb3IuT0JKRUNUX05PVF9GT1VORCxcbiAgICAgICAgICAgICAgJ0ludmFsaWQgdXNlcm5hbWUvcGFzc3dvcmQuJ1xuICAgICAgICAgICAgKTtcbiAgICAgICAgICB9XG4gICAgICAgICAgaWYgKFxuICAgICAgICAgICAgcmVxLmNvbmZpZy52ZXJpZnlVc2VyRW1haWxzICYmXG4gICAgICAgICAgICByZXEuY29uZmlnLnByZXZlbnRMb2dpbldpdGhVbnZlcmlmaWVkRW1haWwgJiZcbiAgICAgICAgICAgICF1c2VyLmVtYWlsVmVyaWZpZWRcbiAgICAgICAgICApIHtcbiAgICAgICAgICAgIHRocm93IG5ldyBQYXJzZS5FcnJvcihcbiAgICAgICAgICAgICAgUGFyc2UuRXJyb3IuRU1BSUxfTk9UX0ZPVU5ELFxuICAgICAgICAgICAgICAnVXNlciBlbWFpbCBpcyBub3QgdmVyaWZpZWQuJ1xuICAgICAgICAgICAgKTtcbiAgICAgICAgICB9XG5cbiAgICAgICAgICBkZWxldGUgdXNlci5wYXNzd29yZDtcblxuICAgICAgICAgIC8vIFNvbWV0aW1lcyB0aGUgYXV0aERhdGEgc3RpbGwgaGFzIG51bGwgb24gdGhhdCBrZXlzXG4gICAgICAgICAgLy8gaHR0cHM6Ly9naXRodWIuY29tL3BhcnNlLWNvbW11bml0eS9wYXJzZS1zZXJ2ZXIvaXNzdWVzLzkzNVxuICAgICAgICAgIGlmICh1c2VyLmF1dGhEYXRhKSB7XG4gICAgICAgICAgICBPYmplY3Qua2V5cyh1c2VyLmF1dGhEYXRhKS5mb3JFYWNoKHByb3ZpZGVyID0+IHtcbiAgICAgICAgICAgICAgaWYgKHVzZXIuYXV0aERhdGFbcHJvdmlkZXJdID09PSBudWxsKSB7XG4gICAgICAgICAgICAgICAgZGVsZXRlIHVzZXIuYXV0aERhdGFbcHJvdmlkZXJdO1xuICAgICAgICAgICAgICB9XG4gICAgICAgICAgICB9KTtcbiAgICAgICAgICAgIGlmIChPYmplY3Qua2V5cyh1c2VyLmF1dGhEYXRhKS5sZW5ndGggPT0gMCkge1xuICAgICAgICAgICAgICBkZWxldGUgdXNlci5hdXRoRGF0YTtcbiAgICAgICAgICAgIH1cbiAgICAgICAgICB9XG5cbiAgICAgICAgICByZXR1cm4gcmVzb2x2ZSh1c2VyKTtcbiAgICAgICAgfSlcbiAgICAgICAgLmNhdGNoKGVycm9yID0+IHtcbiAgICAgICAgICByZXR1cm4gcmVqZWN0KGVycm9yKTtcbiAgICAgICAgfSk7XG4gICAgfSk7XG4gIH1cblxuICBoYW5kbGVNZShyZXEpIHtcbiAgICBpZiAoIXJlcS5pbmZvIHx8ICFyZXEuaW5mby5zZXNzaW9uVG9rZW4pIHtcbiAgICAgIHRocm93IG5ldyBQYXJzZS5FcnJvcihcbiAgICAgICAgUGFyc2UuRXJyb3IuSU5WQUxJRF9TRVNTSU9OX1RPS0VOLFxuICAgICAgICAnSW52YWxpZCBzZXNzaW9uIHRva2VuJ1xuICAgICAgKTtcbiAgICB9XG4gICAgY29uc3Qgc2Vzc2lvblRva2VuID0gcmVxLmluZm8uc2Vzc2lvblRva2VuO1xuICAgIHJldHVybiByZXN0XG4gICAgICAuZmluZChcbiAgICAgICAgcmVxLmNvbmZpZyxcbiAgICAgICAgQXV0aC5tYXN0ZXIocmVxLmNvbmZpZyksXG4gICAgICAgICdfU2Vzc2lvbicsXG4gICAgICAgIHsgc2Vzc2lvblRva2VuIH0sXG4gICAgICAgIHsgaW5jbHVkZTogJ3VzZXInIH0sXG4gICAgICAgIHJlcS5pbmZvLmNsaWVudFNESyxcbiAgICAgICAgcmVxLmluZm8uY29udGV4dFxuICAgICAgKVxuICAgICAgLnRoZW4ocmVzcG9uc2UgPT4ge1xuICAgICAgICBpZiAoXG4gICAgICAgICAgIXJlc3BvbnNlLnJlc3VsdHMgfHxcbiAgICAgICAgICByZXNwb25zZS5yZXN1bHRzLmxlbmd0aCA9PSAwIHx8XG4gICAgICAgICAgIXJlc3BvbnNlLnJlc3VsdHNbMF0udXNlclxuICAgICAgICApIHtcbiAgICAgICAgICB0aHJvdyBuZXcgUGFyc2UuRXJyb3IoXG4gICAgICAgICAgICBQYXJzZS5FcnJvci5JTlZBTElEX1NFU1NJT05fVE9LRU4sXG4gICAgICAgICAgICAnSW52YWxpZCBzZXNzaW9uIHRva2VuJ1xuICAgICAgICAgICk7XG4gICAgICAgIH0gZWxzZSB7XG4gICAgICAgICAgY29uc3QgdXNlciA9IHJlc3BvbnNlLnJlc3VsdHNbMF0udXNlcjtcbiAgICAgICAgICAvLyBTZW5kIHRva2VuIGJhY2sgb24gdGhlIGxvZ2luLCBiZWNhdXNlIFNES3MgZXhwZWN0IHRoYXQuXG4gICAgICAgICAgdXNlci5zZXNzaW9uVG9rZW4gPSBzZXNzaW9uVG9rZW47XG5cbiAgICAgICAgICAvLyBSZW1vdmUgaGlkZGVuIHByb3BlcnRpZXMuXG4gICAgICAgICAgVXNlcnNSb3V0ZXIucmVtb3ZlSGlkZGVuUHJvcGVydGllcyh1c2VyKTtcblxuICAgICAgICAgIHJldHVybiB7IHJlc3BvbnNlOiB1c2VyIH07XG4gICAgICAgIH1cbiAgICAgIH0pO1xuICB9XG5cbiAgYXN5bmMgaGFuZGxlTG9nSW4ocmVxKSB7XG4gICAgY29uc3QgdXNlciA9IGF3YWl0IHRoaXMuX2F1dGhlbnRpY2F0ZVVzZXJGcm9tUmVxdWVzdChyZXEpO1xuXG4gICAgLy8gaGFuZGxlIHBhc3N3b3JkIGV4cGlyeSBwb2xpY3lcbiAgICBpZiAocmVxLmNvbmZpZy5wYXNzd29yZFBvbGljeSAmJiByZXEuY29uZmlnLnBhc3N3b3JkUG9saWN5Lm1heFBhc3N3b3JkQWdlKSB7XG4gICAgICBsZXQgY2hhbmdlZEF0ID0gdXNlci5fcGFzc3dvcmRfY2hhbmdlZF9hdDtcblxuICAgICAgaWYgKCFjaGFuZ2VkQXQpIHtcbiAgICAgICAgLy8gcGFzc3dvcmQgd2FzIGNyZWF0ZWQgYmVmb3JlIGV4cGlyeSBwb2xpY3kgd2FzIGVuYWJsZWQuXG4gICAgICAgIC8vIHNpbXBseSB1cGRhdGUgX1VzZXIgb2JqZWN0IHNvIHRoYXQgaXQgd2lsbCBzdGFydCBlbmZvcmNpbmcgZnJvbSBub3dcbiAgICAgICAgY2hhbmdlZEF0ID0gbmV3IERhdGUoKTtcbiAgICAgICAgcmVxLmNvbmZpZy5kYXRhYmFzZS51cGRhdGUoXG4gICAgICAgICAgJ19Vc2VyJyxcbiAgICAgICAgICB7IHVzZXJuYW1lOiB1c2VyLnVzZXJuYW1lIH0sXG4gICAgICAgICAgeyBfcGFzc3dvcmRfY2hhbmdlZF9hdDogUGFyc2UuX2VuY29kZShjaGFuZ2VkQXQpIH1cbiAgICAgICAgKTtcbiAgICAgIH0gZWxzZSB7XG4gICAgICAgIC8vIGNoZWNrIHdoZXRoZXIgdGhlIHBhc3N3b3JkIGhhcyBleHBpcmVkXG4gICAgICAgIGlmIChjaGFuZ2VkQXQuX190eXBlID09ICdEYXRlJykge1xuICAgICAgICAgIGNoYW5nZWRBdCA9IG5ldyBEYXRlKGNoYW5nZWRBdC5pc28pO1xuICAgICAgICB9XG4gICAgICAgIC8vIENhbGN1bGF0ZSB0aGUgZXhwaXJ5IHRpbWUuXG4gICAgICAgIGNvbnN0IGV4cGlyZXNBdCA9IG5ldyBEYXRlKFxuICAgICAgICAgIGNoYW5nZWRBdC5nZXRUaW1lKCkgK1xuICAgICAgICAgICAgODY0MDAwMDAgKiByZXEuY29uZmlnLnBhc3N3b3JkUG9saWN5Lm1heFBhc3N3b3JkQWdlXG4gICAgICAgICk7XG4gICAgICAgIGlmIChleHBpcmVzQXQgPCBuZXcgRGF0ZSgpKVxuICAgICAgICAgIC8vIGZhaWwgb2YgY3VycmVudCB0aW1lIGlzIHBhc3QgcGFzc3dvcmQgZXhwaXJ5IHRpbWVcbiAgICAgICAgICB0aHJvdyBuZXcgUGFyc2UuRXJyb3IoXG4gICAgICAgICAgICBQYXJzZS5FcnJvci5PQkpFQ1RfTk9UX0ZPVU5ELFxuICAgICAgICAgICAgJ1lvdXIgcGFzc3dvcmQgaGFzIGV4cGlyZWQuIFBsZWFzZSByZXNldCB5b3VyIHBhc3N3b3JkLidcbiAgICAgICAgICApO1xuICAgICAgfVxuICAgIH1cblxuICAgIC8vIFJlbW92ZSBoaWRkZW4gcHJvcGVydGllcy5cbiAgICBVc2Vyc1JvdXRlci5yZW1vdmVIaWRkZW5Qcm9wZXJ0aWVzKHVzZXIpO1xuXG4gICAgcmVxLmNvbmZpZy5maWxlc0NvbnRyb2xsZXIuZXhwYW5kRmlsZXNJbk9iamVjdChyZXEuY29uZmlnLCB1c2VyKTtcblxuICAgIC8vIEJlZm9yZSBsb2dpbiB0cmlnZ2VyOyB0aHJvd3MgaWYgZmFpbHVyZVxuICAgIGF3YWl0IG1heWJlUnVuVHJpZ2dlcihcbiAgICAgIFRyaWdnZXJUeXBlcy5iZWZvcmVMb2dpbixcbiAgICAgIHJlcS5hdXRoLFxuICAgICAgUGFyc2UuVXNlci5mcm9tSlNPTihPYmplY3QuYXNzaWduKHsgY2xhc3NOYW1lOiAnX1VzZXInIH0sIHVzZXIpKSxcbiAgICAgIG51bGwsXG4gICAgICByZXEuY29uZmlnXG4gICAgKTtcblxuICAgIGNvbnN0IHsgc2Vzc2lvbkRhdGEsIGNyZWF0ZVNlc3Npb24gfSA9IEF1dGguY3JlYXRlU2Vzc2lvbihyZXEuY29uZmlnLCB7XG4gICAgICB1c2VySWQ6IHVzZXIub2JqZWN0SWQsXG4gICAgICBjcmVhdGVkV2l0aDoge1xuICAgICAgICBhY3Rpb246ICdsb2dpbicsXG4gICAgICAgIGF1dGhQcm92aWRlcjogJ3Bhc3N3b3JkJyxcbiAgICAgIH0sXG4gICAgICBpbnN0YWxsYXRpb25JZDogcmVxLmluZm8uaW5zdGFsbGF0aW9uSWQsXG4gICAgfSk7XG5cbiAgICB1c2VyLnNlc3Npb25Ub2tlbiA9IHNlc3Npb25EYXRhLnNlc3Npb25Ub2tlbjtcblxuICAgIGF3YWl0IGNyZWF0ZVNlc3Npb24oKTtcblxuICAgIGNvbnN0IGFmdGVyTG9naW5Vc2VyID0gUGFyc2UuVXNlci5mcm9tSlNPTihcbiAgICAgIE9iamVjdC5hc3NpZ24oeyBjbGFzc05hbWU6ICdfVXNlcicgfSwgdXNlcilcbiAgICApO1xuICAgIG1heWJlUnVuVHJpZ2dlcihcbiAgICAgIFRyaWdnZXJUeXBlcy5hZnRlckxvZ2luLFxuICAgICAgeyAuLi5yZXEuYXV0aCwgdXNlcjogYWZ0ZXJMb2dpblVzZXIgfSxcbiAgICAgIGFmdGVyTG9naW5Vc2VyLFxuICAgICAgbnVsbCxcbiAgICAgIHJlcS5jb25maWdcbiAgICApO1xuXG4gICAgcmV0dXJuIHsgcmVzcG9uc2U6IHVzZXIgfTtcbiAgfVxuXG4gIGhhbmRsZVZlcmlmeVBhc3N3b3JkKHJlcSkge1xuICAgIHJldHVybiB0aGlzLl9hdXRoZW50aWNhdGVVc2VyRnJvbVJlcXVlc3QocmVxKVxuICAgICAgLnRoZW4odXNlciA9PiB7XG4gICAgICAgIC8vIFJlbW92ZSBoaWRkZW4gcHJvcGVydGllcy5cbiAgICAgICAgVXNlcnNSb3V0ZXIucmVtb3ZlSGlkZGVuUHJvcGVydGllcyh1c2VyKTtcblxuICAgICAgICByZXR1cm4geyByZXNwb25zZTogdXNlciB9O1xuICAgICAgfSlcbiAgICAgIC5jYXRjaChlcnJvciA9PiB7XG4gICAgICAgIHRocm93IGVycm9yO1xuICAgICAgfSk7XG4gIH1cblxuICBoYW5kbGVMb2dPdXQocmVxKSB7XG4gICAgY29uc3Qgc3VjY2VzcyA9IHsgcmVzcG9uc2U6IHt9IH07XG4gICAgaWYgKHJlcS5pbmZvICYmIHJlcS5pbmZvLnNlc3Npb25Ub2tlbikge1xuICAgICAgcmV0dXJuIHJlc3RcbiAgICAgICAgLmZpbmQoXG4gICAgICAgICAgcmVxLmNvbmZpZyxcbiAgICAgICAgICBBdXRoLm1hc3RlcihyZXEuY29uZmlnKSxcbiAgICAgICAgICAnX1Nlc3Npb24nLFxuICAgICAgICAgIHsgc2Vzc2lvblRva2VuOiByZXEuaW5mby5zZXNzaW9uVG9rZW4gfSxcbiAgICAgICAgICB1bmRlZmluZWQsXG4gICAgICAgICAgcmVxLmluZm8uY2xpZW50U0RLLFxuICAgICAgICAgIHJlcS5pbmZvLmNvbnRleHRcbiAgICAgICAgKVxuICAgICAgICAudGhlbihyZWNvcmRzID0+IHtcbiAgICAgICAgICBpZiAocmVjb3Jkcy5yZXN1bHRzICYmIHJlY29yZHMucmVzdWx0cy5sZW5ndGgpIHtcbiAgICAgICAgICAgIHJldHVybiByZXN0XG4gICAgICAgICAgICAgIC5kZWwoXG4gICAgICAgICAgICAgICAgcmVxLmNvbmZpZyxcbiAgICAgICAgICAgICAgICBBdXRoLm1hc3RlcihyZXEuY29uZmlnKSxcbiAgICAgICAgICAgICAgICAnX1Nlc3Npb24nLFxuICAgICAgICAgICAgICAgIHJlY29yZHMucmVzdWx0c1swXS5vYmplY3RJZCxcbiAgICAgICAgICAgICAgICByZXEuaW5mby5jb250ZXh0XG4gICAgICAgICAgICAgIClcbiAgICAgICAgICAgICAgLnRoZW4oKCkgPT4ge1xuICAgICAgICAgICAgICAgIHRoaXMuX3J1bkFmdGVyTG9nb3V0VHJpZ2dlcihyZXEsIHJlY29yZHMucmVzdWx0c1swXSk7XG4gICAgICAgICAgICAgICAgcmV0dXJuIFByb21pc2UucmVzb2x2ZShzdWNjZXNzKTtcbiAgICAgICAgICAgICAgfSk7XG4gICAgICAgICAgfVxuICAgICAgICAgIHJldHVybiBQcm9taXNlLnJlc29sdmUoc3VjY2Vzcyk7XG4gICAgICAgIH0pO1xuICAgIH1cbiAgICByZXR1cm4gUHJvbWlzZS5yZXNvbHZlKHN1Y2Nlc3MpO1xuICB9XG5cbiAgX3J1bkFmdGVyTG9nb3V0VHJpZ2dlcihyZXEsIHNlc3Npb24pIHtcbiAgICAvLyBBZnRlciBsb2dvdXQgdHJpZ2dlclxuICAgIG1heWJlUnVuVHJpZ2dlcihcbiAgICAgIFRyaWdnZXJUeXBlcy5hZnRlckxvZ291dCxcbiAgICAgIHJlcS5hdXRoLFxuICAgICAgUGFyc2UuU2Vzc2lvbi5mcm9tSlNPTihPYmplY3QuYXNzaWduKHsgY2xhc3NOYW1lOiAnX1Nlc3Npb24nIH0sIHNlc3Npb24pKSxcbiAgICAgIG51bGwsXG4gICAgICByZXEuY29uZmlnXG4gICAgKTtcbiAgfVxuXG4gIF90aHJvd09uQmFkRW1haWxDb25maWcocmVxKSB7XG4gICAgdHJ5IHtcbiAgICAgIENvbmZpZy52YWxpZGF0ZUVtYWlsQ29uZmlndXJhdGlvbih7XG4gICAgICAgIGVtYWlsQWRhcHRlcjogcmVxLmNvbmZpZy51c2VyQ29udHJvbGxlci5hZGFwdGVyLFxuICAgICAgICBhcHBOYW1lOiByZXEuY29uZmlnLmFwcE5hbWUsXG4gICAgICAgIHB1YmxpY1NlcnZlclVSTDogcmVxLmNvbmZpZy5wdWJsaWNTZXJ2ZXJVUkwsXG4gICAgICAgIGVtYWlsVmVyaWZ5VG9rZW5WYWxpZGl0eUR1cmF0aW9uOlxuICAgICAgICAgIHJlcS5jb25maWcuZW1haWxWZXJpZnlUb2tlblZhbGlkaXR5RHVyYXRpb24sXG4gICAgICB9KTtcbiAgICB9IGNhdGNoIChlKSB7XG4gICAgICBpZiAodHlwZW9mIGUgPT09ICdzdHJpbmcnKSB7XG4gICAgICAgIC8vIE1heWJlIHdlIG5lZWQgYSBCYWQgQ29uZmlndXJhdGlvbiBlcnJvciwgYnV0IHRoZSBTREtzIHdvbid0IHVuZGVyc3RhbmQgaXQuIEZvciBub3csIEludGVybmFsIFNlcnZlciBFcnJvci5cbiAgICAgICAgdGhyb3cgbmV3IFBhcnNlLkVycm9yKFxuICAgICAgICAgIFBhcnNlLkVycm9yLklOVEVSTkFMX1NFUlZFUl9FUlJPUixcbiAgICAgICAgICAnQW4gYXBwTmFtZSwgcHVibGljU2VydmVyVVJMLCBhbmQgZW1haWxBZGFwdGVyIGFyZSByZXF1aXJlZCBmb3IgcGFzc3dvcmQgcmVzZXQgYW5kIGVtYWlsIHZlcmlmaWNhdGlvbiBmdW5jdGlvbmFsaXR5LidcbiAgICAgICAgKTtcbiAgICAgIH0gZWxzZSB7XG4gICAgICAgIHRocm93IGU7XG4gICAgICB9XG4gICAgfVxuICB9XG5cbiAgaGFuZGxlUmVzZXRSZXF1ZXN0KHJlcSkge1xuICAgIHRoaXMuX3Rocm93T25CYWRFbWFpbENvbmZpZyhyZXEpO1xuXG4gICAgY29uc3QgeyBlbWFpbCB9ID0gcmVxLmJvZHk7XG4gICAgaWYgKCFlbWFpbCkge1xuICAgICAgdGhyb3cgbmV3IFBhcnNlLkVycm9yKFxuICAgICAgICBQYXJzZS5FcnJvci5FTUFJTF9NSVNTSU5HLFxuICAgICAgICAneW91IG11c3QgcHJvdmlkZSBhbiBlbWFpbCdcbiAgICAgICk7XG4gICAgfVxuICAgIGlmICh0eXBlb2YgZW1haWwgIT09ICdzdHJpbmcnKSB7XG4gICAgICB0aHJvdyBuZXcgUGFyc2UuRXJyb3IoXG4gICAgICAgIFBhcnNlLkVycm9yLklOVkFMSURfRU1BSUxfQUREUkVTUyxcbiAgICAgICAgJ3lvdSBtdXN0IHByb3ZpZGUgYSB2YWxpZCBlbWFpbCBzdHJpbmcnXG4gICAgICApO1xuICAgIH1cbiAgICBjb25zdCB1c2VyQ29udHJvbGxlciA9IHJlcS5jb25maWcudXNlckNvbnRyb2xsZXI7XG4gICAgcmV0dXJuIHVzZXJDb250cm9sbGVyLnNlbmRQYXNzd29yZFJlc2V0RW1haWwoZW1haWwpLnRoZW4oXG4gICAgICAoKSA9PiB7XG4gICAgICAgIHJldHVybiBQcm9taXNlLnJlc29sdmUoe1xuICAgICAgICAgIHJlc3BvbnNlOiB7fSxcbiAgICAgICAgfSk7XG4gICAgICB9LFxuICAgICAgZXJyID0+IHtcbiAgICAgICAgaWYgKGVyci5jb2RlID09PSBQYXJzZS5FcnJvci5PQkpFQ1RfTk9UX0ZPVU5EKSB7XG4gICAgICAgICAgLy8gUmV0dXJuIHN1Y2Nlc3Mgc28gdGhhdCB0aGlzIGVuZHBvaW50IGNhbid0XG4gICAgICAgICAgLy8gYmUgdXNlZCB0byBlbnVtZXJhdGUgdmFsaWQgZW1haWxzXG4gICAgICAgICAgcmV0dXJuIFByb21pc2UucmVzb2x2ZSh7XG4gICAgICAgICAgICByZXNwb25zZToge30sXG4gICAgICAgICAgfSk7XG4gICAgICAgIH0gZWxzZSB7XG4gICAgICAgICAgdGhyb3cgZXJyO1xuICAgICAgICB9XG4gICAgICB9XG4gICAgKTtcbiAgfVxuXG4gIGhhbmRsZVZlcmlmaWNhdGlvbkVtYWlsUmVxdWVzdChyZXEpIHtcbiAgICB0aGlzLl90aHJvd09uQmFkRW1haWxDb25maWcocmVxKTtcblxuICAgIGNvbnN0IHsgZW1haWwgfSA9IHJlcS5ib2R5O1xuICAgIGlmICghZW1haWwpIHtcbiAgICAgIHRocm93IG5ldyBQYXJzZS5FcnJvcihcbiAgICAgICAgUGFyc2UuRXJyb3IuRU1BSUxfTUlTU0lORyxcbiAgICAgICAgJ3lvdSBtdXN0IHByb3ZpZGUgYW4gZW1haWwnXG4gICAgICApO1xuICAgIH1cbiAgICBpZiAodHlwZW9mIGVtYWlsICE9PSAnc3RyaW5nJykge1xuICAgICAgdGhyb3cgbmV3IFBhcnNlLkVycm9yKFxuICAgICAgICBQYXJzZS5FcnJvci5JTlZBTElEX0VNQUlMX0FERFJFU1MsXG4gICAgICAgICd5b3UgbXVzdCBwcm92aWRlIGEgdmFsaWQgZW1haWwgc3RyaW5nJ1xuICAgICAgKTtcbiAgICB9XG5cbiAgICByZXR1cm4gcmVxLmNvbmZpZy5kYXRhYmFzZS5maW5kKCdfVXNlcicsIHsgZW1haWw6IGVtYWlsIH0pLnRoZW4ocmVzdWx0cyA9PiB7XG4gICAgICBpZiAoIXJlc3VsdHMubGVuZ3RoIHx8IHJlc3VsdHMubGVuZ3RoIDwgMSkge1xuICAgICAgICB0aHJvdyBuZXcgUGFyc2UuRXJyb3IoXG4gICAgICAgICAgUGFyc2UuRXJyb3IuRU1BSUxfTk9UX0ZPVU5ELFxuICAgICAgICAgIGBObyB1c2VyIGZvdW5kIHdpdGggZW1haWwgJHtlbWFpbH1gXG4gICAgICAgICk7XG4gICAgICB9XG4gICAgICBjb25zdCB1c2VyID0gcmVzdWx0c1swXTtcblxuICAgICAgLy8gcmVtb3ZlIHBhc3N3b3JkIGZpZWxkLCBtZXNzZXMgd2l0aCBzYXZpbmcgb24gcG9zdGdyZXNcbiAgICAgIGRlbGV0ZSB1c2VyLnBhc3N3b3JkO1xuXG4gICAgICBpZiAodXNlci5lbWFpbFZlcmlmaWVkKSB7XG4gICAgICAgIHRocm93IG5ldyBQYXJzZS5FcnJvcihcbiAgICAgICAgICBQYXJzZS5FcnJvci5PVEhFUl9DQVVTRSxcbiAgICAgICAgICBgRW1haWwgJHtlbWFpbH0gaXMgYWxyZWFkeSB2ZXJpZmllZC5gXG4gICAgICAgICk7XG4gICAgICB9XG5cbiAgICAgIGNvbnN0IHVzZXJDb250cm9sbGVyID0gcmVxLmNvbmZpZy51c2VyQ29udHJvbGxlcjtcbiAgICAgIHJldHVybiB1c2VyQ29udHJvbGxlci5yZWdlbmVyYXRlRW1haWxWZXJpZnlUb2tlbih1c2VyKS50aGVuKCgpID0+IHtcbiAgICAgICAgdXNlckNvbnRyb2xsZXIuc2VuZFZlcmlmaWNhdGlvbkVtYWlsKHVzZXIpO1xuICAgICAgICByZXR1cm4geyByZXNwb25zZToge30gfTtcbiAgICAgIH0pO1xuICAgIH0pO1xuICB9XG5cbiAgbW91bnRSb3V0ZXMoKSB7XG4gICAgdGhpcy5yb3V0ZSgnR0VUJywgJy91c2VycycsIHJlcSA9PiB7XG4gICAgICByZXR1cm4gdGhpcy5oYW5kbGVGaW5kKHJlcSk7XG4gICAgfSk7XG4gICAgdGhpcy5yb3V0ZSgnUE9TVCcsICcvdXNlcnMnLCBwcm9taXNlRW5zdXJlSWRlbXBvdGVuY3ksIHJlcSA9PiB7XG4gICAgICByZXR1cm4gdGhpcy5oYW5kbGVDcmVhdGUocmVxKTtcbiAgICB9KTtcbiAgICB0aGlzLnJvdXRlKCdHRVQnLCAnL3VzZXJzL21lJywgcmVxID0+IHtcbiAgICAgIHJldHVybiB0aGlzLmhhbmRsZU1lKHJlcSk7XG4gICAgfSk7XG4gICAgdGhpcy5yb3V0ZSgnR0VUJywgJy91c2Vycy86b2JqZWN0SWQnLCByZXEgPT4ge1xuICAgICAgcmV0dXJuIHRoaXMuaGFuZGxlR2V0KHJlcSk7XG4gICAgfSk7XG4gICAgdGhpcy5yb3V0ZSgnUFVUJywgJy91c2Vycy86b2JqZWN0SWQnLCBwcm9taXNlRW5zdXJlSWRlbXBvdGVuY3ksIHJlcSA9PiB7XG4gICAgICByZXR1cm4gdGhpcy5oYW5kbGVVcGRhdGUocmVxKTtcbiAgICB9KTtcbiAgICB0aGlzLnJvdXRlKCdERUxFVEUnLCAnL3VzZXJzLzpvYmplY3RJZCcsIHJlcSA9PiB7XG4gICAgICByZXR1cm4gdGhpcy5oYW5kbGVEZWxldGUocmVxKTtcbiAgICB9KTtcbiAgICB0aGlzLnJvdXRlKCdHRVQnLCAnL2xvZ2luJywgcmVxID0+IHtcbiAgICAgIHJldHVybiB0aGlzLmhhbmRsZUxvZ0luKHJlcSk7XG4gICAgfSk7XG4gICAgdGhpcy5yb3V0ZSgnUE9TVCcsICcvbG9naW4nLCByZXEgPT4ge1xuICAgICAgcmV0dXJuIHRoaXMuaGFuZGxlTG9nSW4ocmVxKTtcbiAgICB9KTtcbiAgICB0aGlzLnJvdXRlKCdQT1NUJywgJy9sb2dvdXQnLCByZXEgPT4ge1xuICAgICAgcmV0dXJuIHRoaXMuaGFuZGxlTG9nT3V0KHJlcSk7XG4gICAgfSk7XG4gICAgdGhpcy5yb3V0ZSgnUE9TVCcsICcvcmVxdWVzdFBhc3N3b3JkUmVzZXQnLCByZXEgPT4ge1xuICAgICAgcmV0dXJuIHRoaXMuaGFuZGxlUmVzZXRSZXF1ZXN0KHJlcSk7XG4gICAgfSk7XG4gICAgdGhpcy5yb3V0ZSgnUE9TVCcsICcvdmVyaWZpY2F0aW9uRW1haWxSZXF1ZXN0JywgcmVxID0+IHtcbiAgICAgIHJldHVybiB0aGlzLmhhbmRsZVZlcmlmaWNhdGlvbkVtYWlsUmVxdWVzdChyZXEpO1xuICAgIH0pO1xuICAgIHRoaXMucm91dGUoJ0dFVCcsICcvdmVyaWZ5UGFzc3dvcmQnLCByZXEgPT4ge1xuICAgICAgcmV0dXJuIHRoaXMuaGFuZGxlVmVyaWZ5UGFzc3dvcmQocmVxKTtcbiAgICB9KTtcbiAgfVxufVxuXG5leHBvcnQgZGVmYXVsdCBVc2Vyc1JvdXRlcjtcbiJdfQ==