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
//# sourceMappingURL=data:application/json;charset=utf-8;base64,eyJ2ZXJzaW9uIjozLCJzb3VyY2VzIjpbIi4uLy4uL3NyYy9Sb3V0ZXJzL1VzZXJzUm91dGVyLmpzIl0sIm5hbWVzIjpbIlVzZXJzUm91dGVyIiwiQ2xhc3Nlc1JvdXRlciIsImNsYXNzTmFtZSIsInJlbW92ZUhpZGRlblByb3BlcnRpZXMiLCJvYmoiLCJrZXkiLCJPYmplY3QiLCJwcm90b3R5cGUiLCJoYXNPd25Qcm9wZXJ0eSIsImNhbGwiLCJ0ZXN0IiwiX2F1dGhlbnRpY2F0ZVVzZXJGcm9tUmVxdWVzdCIsInJlcSIsIlByb21pc2UiLCJyZXNvbHZlIiwicmVqZWN0IiwicGF5bG9hZCIsImJvZHkiLCJ1c2VybmFtZSIsInF1ZXJ5IiwiZW1haWwiLCJwYXNzd29yZCIsIlBhcnNlIiwiRXJyb3IiLCJVU0VSTkFNRV9NSVNTSU5HIiwiUEFTU1dPUkRfTUlTU0lORyIsIk9CSkVDVF9OT1RfRk9VTkQiLCJ1c2VyIiwiaXNWYWxpZFBhc3N3b3JkIiwiJG9yIiwiY29uZmlnIiwiZGF0YWJhc2UiLCJmaW5kIiwidGhlbiIsInJlc3VsdHMiLCJsZW5ndGgiLCJsb2dnZXJDb250cm9sbGVyIiwid2FybiIsImZpbHRlciIsInBhc3N3b3JkQ3J5cHRvIiwiY29tcGFyZSIsImNvcnJlY3QiLCJhY2NvdW50TG9ja291dFBvbGljeSIsIkFjY291bnRMb2Nrb3V0IiwiaGFuZGxlTG9naW5BdHRlbXB0IiwiYXV0aCIsImlzTWFzdGVyIiwiQUNMIiwia2V5cyIsInZlcmlmeVVzZXJFbWFpbHMiLCJwcmV2ZW50TG9naW5XaXRoVW52ZXJpZmllZEVtYWlsIiwiZW1haWxWZXJpZmllZCIsIkVNQUlMX05PVF9GT1VORCIsImF1dGhEYXRhIiwiZm9yRWFjaCIsInByb3ZpZGVyIiwiY2F0Y2giLCJlcnJvciIsImhhbmRsZU1lIiwiaW5mbyIsInNlc3Npb25Ub2tlbiIsIklOVkFMSURfU0VTU0lPTl9UT0tFTiIsInJlc3QiLCJBdXRoIiwibWFzdGVyIiwiaW5jbHVkZSIsImNsaWVudFNESyIsImNvbnRleHQiLCJyZXNwb25zZSIsImhhbmRsZUxvZ0luIiwicGFzc3dvcmRQb2xpY3kiLCJtYXhQYXNzd29yZEFnZSIsImNoYW5nZWRBdCIsIl9wYXNzd29yZF9jaGFuZ2VkX2F0IiwiRGF0ZSIsInVwZGF0ZSIsIl9lbmNvZGUiLCJfX3R5cGUiLCJpc28iLCJleHBpcmVzQXQiLCJnZXRUaW1lIiwiZmlsZXNDb250cm9sbGVyIiwiZXhwYW5kRmlsZXNJbk9iamVjdCIsIlRyaWdnZXJUeXBlcyIsImJlZm9yZUxvZ2luIiwiVXNlciIsImZyb21KU09OIiwiYXNzaWduIiwic2Vzc2lvbkRhdGEiLCJjcmVhdGVTZXNzaW9uIiwidXNlcklkIiwib2JqZWN0SWQiLCJjcmVhdGVkV2l0aCIsImFjdGlvbiIsImF1dGhQcm92aWRlciIsImluc3RhbGxhdGlvbklkIiwiYWZ0ZXJMb2dpblVzZXIiLCJhZnRlckxvZ2luIiwiaGFuZGxlVmVyaWZ5UGFzc3dvcmQiLCJoYW5kbGVMb2dPdXQiLCJzdWNjZXNzIiwidW5kZWZpbmVkIiwicmVjb3JkcyIsImRlbCIsIl9ydW5BZnRlckxvZ291dFRyaWdnZXIiLCJzZXNzaW9uIiwiYWZ0ZXJMb2dvdXQiLCJTZXNzaW9uIiwiX3Rocm93T25CYWRFbWFpbENvbmZpZyIsIkNvbmZpZyIsInZhbGlkYXRlRW1haWxDb25maWd1cmF0aW9uIiwiZW1haWxBZGFwdGVyIiwidXNlckNvbnRyb2xsZXIiLCJhZGFwdGVyIiwiYXBwTmFtZSIsInB1YmxpY1NlcnZlclVSTCIsImVtYWlsVmVyaWZ5VG9rZW5WYWxpZGl0eUR1cmF0aW9uIiwiZSIsIklOVEVSTkFMX1NFUlZFUl9FUlJPUiIsImhhbmRsZVJlc2V0UmVxdWVzdCIsIkVNQUlMX01JU1NJTkciLCJJTlZBTElEX0VNQUlMX0FERFJFU1MiLCJzZW5kUGFzc3dvcmRSZXNldEVtYWlsIiwiZXJyIiwiY29kZSIsImhhbmRsZVZlcmlmaWNhdGlvbkVtYWlsUmVxdWVzdCIsIk9USEVSX0NBVVNFIiwicmVnZW5lcmF0ZUVtYWlsVmVyaWZ5VG9rZW4iLCJzZW5kVmVyaWZpY2F0aW9uRW1haWwiLCJtb3VudFJvdXRlcyIsInJvdXRlIiwiaGFuZGxlRmluZCIsInByb21pc2VFbnN1cmVJZGVtcG90ZW5jeSIsImhhbmRsZUNyZWF0ZSIsImhhbmRsZUdldCIsImhhbmRsZVVwZGF0ZSIsImhhbmRsZURlbGV0ZSJdLCJtYXBwaW5ncyI6Ijs7Ozs7OztBQUVBOztBQUNBOztBQUNBOztBQUNBOztBQUNBOztBQUNBOztBQUNBOztBQUNBOztBQUNBOzs7Ozs7Ozs7O0FBRU8sTUFBTUEsV0FBTixTQUEwQkMsc0JBQTFCLENBQXdDO0FBQzdDQyxFQUFBQSxTQUFTLEdBQUc7QUFDVixXQUFPLE9BQVA7QUFDRDtBQUVEOzs7Ozs7QUFJQSxTQUFPQyxzQkFBUCxDQUE4QkMsR0FBOUIsRUFBbUM7QUFDakMsU0FBSyxJQUFJQyxHQUFULElBQWdCRCxHQUFoQixFQUFxQjtBQUNuQixVQUFJRSxNQUFNLENBQUNDLFNBQVAsQ0FBaUJDLGNBQWpCLENBQWdDQyxJQUFoQyxDQUFxQ0wsR0FBckMsRUFBMENDLEdBQTFDLENBQUosRUFBb0Q7QUFDbEQ7QUFDQSxZQUFJQSxHQUFHLEtBQUssUUFBUixJQUFvQixDQUFDLDBCQUEwQkssSUFBMUIsQ0FBK0JMLEdBQS9CLENBQXpCLEVBQThEO0FBQzVELGlCQUFPRCxHQUFHLENBQUNDLEdBQUQsQ0FBVjtBQUNEO0FBQ0Y7QUFDRjtBQUNGO0FBRUQ7Ozs7Ozs7O0FBTUFNLEVBQUFBLDRCQUE0QixDQUFDQyxHQUFELEVBQU07QUFDaEMsV0FBTyxJQUFJQyxPQUFKLENBQVksQ0FBQ0MsT0FBRCxFQUFVQyxNQUFWLEtBQXFCO0FBQ3RDO0FBQ0EsVUFBSUMsT0FBTyxHQUFHSixHQUFHLENBQUNLLElBQWxCOztBQUNBLFVBQ0csQ0FBQ0QsT0FBTyxDQUFDRSxRQUFULElBQXFCTixHQUFHLENBQUNPLEtBQXpCLElBQWtDUCxHQUFHLENBQUNPLEtBQUosQ0FBVUQsUUFBN0MsSUFDQyxDQUFDRixPQUFPLENBQUNJLEtBQVQsSUFBa0JSLEdBQUcsQ0FBQ08sS0FBdEIsSUFBK0JQLEdB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TCxDQUFrQnZGLEdBQWxCLENBQVA7QUFDRCxLQUZEO0FBR0EsU0FBS3NILEtBQUwsQ0FBVyxNQUFYLEVBQW1CLHVCQUFuQixFQUE0Q3RILEdBQUcsSUFBSTtBQUNqRCxhQUFPLEtBQUsyRyxrQkFBTCxDQUF3QjNHLEdBQXhCLENBQVA7QUFDRCxLQUZEO0FBR0EsU0FBS3NILEtBQUwsQ0FBVyxNQUFYLEVBQW1CLDJCQUFuQixFQUFnRHRILEdBQUcsSUFBSTtBQUNyRCxhQUFPLEtBQUtpSCw4QkFBTCxDQUFvQ2pILEdBQXBDLENBQVA7QUFDRCxLQUZEO0FBR0EsU0FBS3NILEtBQUwsQ0FBVyxLQUFYLEVBQWtCLGlCQUFsQixFQUFxQ3RILEdBQUcsSUFBSTtBQUMxQyxhQUFPLEtBQUtzRixvQkFBTCxDQUEwQnRGLEdBQTFCLENBQVA7QUFDRCxLQUZEO0FBR0Q7O0FBbGE0Qzs7O2VBcWFoQ1osVyIsInNvdXJjZXNDb250ZW50IjpbIi8vIFRoZXNlIG1ldGhvZHMgaGFuZGxlIHRoZSBVc2VyLXJlbGF0ZWQgcm91dGVzLlxuXG5pbXBvcnQgUGFyc2UgZnJvbSAncGFyc2Uvbm9kZSc7XG5pbXBvcnQgQ29uZmlnIGZyb20gJy4uL0NvbmZpZyc7XG5pbXBvcnQgQWNjb3VudExvY2tvdXQgZnJvbSAnLi4vQWNjb3VudExvY2tvdXQnO1xuaW1wb3J0IENsYXNzZXNSb3V0ZXIgZnJvbSAnLi9DbGFzc2VzUm91dGVyJztcbmltcG9ydCByZXN0IGZyb20gJy4uL3Jlc3QnO1xuaW1wb3J0IEF1dGggZnJvbSAnLi4vQXV0aCc7XG5pbXBvcnQgcGFzc3dvcmRDcnlwdG8gZnJvbSAnLi4vcGFzc3dvcmQnO1xuaW1wb3J0IHsgbWF5YmVSdW5UcmlnZ2VyLCBUeXBlcyBhcyBUcmlnZ2VyVHlwZXMgfSBmcm9tICcuLi90cmlnZ2Vycyc7XG5pbXBvcnQgeyBwcm9taXNlRW5zdXJlSWRlbXBvdGVuY3kgfSBmcm9tICcuLi9taWRkbGV3YXJlcyc7XG5cbmV4cG9ydCBjbGFzcyBVc2Vyc1JvdXRlciBleHRlbmRzIENsYXNzZXNSb3V0ZXIge1xuICBjbGFzc05hbWUoKSB7XG4gICAgcmV0dXJuICdfVXNlcic7XG4gIH1cblxuICAvKipcbiAgICogUmVtb3ZlcyBhbGwgXCJfXCIgcHJlZml4ZWQgcHJvcGVydGllcyBmcm9tIGFuIG9iamVjdCwgZXhjZXB0IFwiX190eXBlXCJcbiAgICogQHBhcmFtIHtPYmplY3R9IG9iaiBBbiBvYmplY3QuXG4gICAqL1xuICBzdGF0aWMgcmVtb3ZlSGlkZGVuUHJvcGVydGllcyhvYmopIHtcbiAgICBmb3IgKHZhciBrZXkgaW4gb2JqKSB7XG4gICAgICBpZiAoT2JqZWN0LnByb3RvdHlwZS5oYXNPd25Qcm9wZXJ0eS5jYWxsKG9iaiwga2V5KSkge1xuICAgICAgICAvLyBSZWdleHAgY29tZXMgZnJvbSBQYXJzZS5PYmplY3QucHJvdG90eXBlLnZhbGlkYXRlXG4gICAgICAgIGlmIChrZXkgIT09ICdfX3R5cGUnICYmICEvXltBLVphLXpdWzAtOUEtWmEtel9dKiQvLnRlc3Qoa2V5KSkge1xuICAgICAgICAgIGRlbGV0ZSBvYmpba2V5XTtcbiAgICAgICAgfVxuICAgICAgfVxuICAgIH1cbiAgfVxuXG4gIC8qKlxuICAgKiBWYWxpZGF0ZXMgYSBwYXNzd29yZCByZXF1ZXN0IGluIGxvZ2luIGFuZCB2ZXJpZnlQYXNzd29yZFxuICAgKiBAcGFyYW0ge09iamVjdH0gcmVxIFRoZSByZXF1ZXN0XG4gICAqIEByZXR1cm5zIHtPYmplY3R9IFVzZXIgb2JqZWN0XG4gICAqIEBwcml2YXRlXG4gICAqL1xuICBfYXV0aGVudGljYXRlVXNlckZyb21SZXF1ZXN0KHJlcSkge1xuICAgIHJldHVybiBuZXcgUHJvbWlzZSgocmVzb2x2ZSwgcmVqZWN0KSA9PiB7XG4gICAgICAvLyBVc2UgcXVlcnkgcGFyYW1ldGVycyBpbnN0ZWFkIGlmIHByb3ZpZGVkIGluIHVybFxuICAgICAgbGV0IHBheWxvYWQgPSByZXEuYm9keTtcbiAgICAgIGlmIChcbiAgICAgICAgKCFwYXlsb2FkLnVzZXJuYW1lICYmIHJlcS5xdWVyeSAmJiByZXEucXVlcnkudXNlcm5hbWUpIHx8XG4gICAgICAgICghcGF5bG9hZC5lbWFpbCAmJiByZXEucXVlcnkgJiYgcmVxLnF1ZXJ5LmVtYWlsKVxuICAgICAgKSB7XG4gICAgICAgIHBheWxvYWQgPSByZXEucXVlcnk7XG4gICAgICB9XG4gICAgICBjb25zdCB7IHVzZXJuYW1lLCBlbWFpbCwgcGFzc3dvcmQgfSA9IHBheWxvYWQ7XG5cbiAgICAgIC8vIFRPRE86IHVzZSB0aGUgcmlnaHQgZXJyb3IgY29kZXMgLyBkZXNjcmlwdGlvbnMuXG4gICAgICBpZiAoIXVzZXJuYW1lICYmICFlbWFpbCkge1xuICAgICAgICB0aHJvdyBuZXcgUGFyc2UuRXJyb3IoUGFyc2UuRXJyb3IuVVNFUk5BTUVfTUlTU0lORywgJ3VzZXJuYW1lL2VtYWlsIGlzIHJlcXVpcmVkLicpO1xuICAgICAgfVxuICAgICAgaWYgKCFwYXNzd29yZCkge1xuICAgICAgICB0aHJvdyBuZXcgUGFyc2UuRXJyb3IoUGFyc2UuRXJyb3IuUEFTU1dPUkRfTUlTU0lORywgJ3Bhc3N3b3JkIGlzIHJlcXVpcmVkLicpO1xuICAgICAgfVxuICAgICAgaWYgKFxuICAgICAgICB0eXBlb2YgcGFzc3dvcmQgIT09ICdzdHJpbmcnIHx8XG4gICAgICAgIChlbWFpbCAmJiB0eXBlb2YgZW1haWwgIT09ICdzdHJpbmcnKSB8fFxuICAgICAgICAodXNlcm5hbWUgJiYgdHlwZW9mIHVzZXJuYW1lICE9PSAnc3RyaW5nJylcbiAgICAgICkge1xuICAgICAgICB0aHJvdyBuZXcgUGFyc2UuRXJyb3IoUGFyc2UuRXJyb3IuT0JKRUNUX05PVF9GT1VORCwgJ0ludmFsaWQgdXNlcm5hbWUvcGFzc3dvcmQuJyk7XG4gICAgICB9XG5cbiAgICAgIGxldCB1c2VyO1xuICAgICAgbGV0IGlzVmFsaWRQYXNzd29yZCA9IGZhbHNlO1xuICAgICAgbGV0IHF1ZXJ5O1xuICAgICAgaWYgKGVtYWlsICYmIHVzZXJuYW1lKSB7XG4gICAgICAgIHF1ZXJ5ID0geyBlbWFpbCwgdXNlcm5hbWUgfTtcbiAgICAgIH0gZWxzZSBpZiAoZW1haWwpIHtcbiAgICAgICAgcXVlcnkgPSB7IGVtYWlsIH07XG4gICAgICB9IGVsc2Uge1xuICAgICAgICBxdWVyeSA9IHsgJG9yOiBbeyB1c2VybmFtZSB9LCB7IGVtYWlsOiB1c2VybmFtZSB9XSB9O1xuICAgICAgfVxuICAgICAgcmV0dXJuIHJlcS5jb25maWcuZGF0YWJhc2VcbiAgICAgICAgLmZpbmQoJ19Vc2VyJywgcXVlcnkpXG4gICAgICAgIC50aGVuKHJlc3VsdHMgPT4ge1xuICAgICAgICAgIGlmICghcmVzdWx0cy5sZW5ndGgpIHtcbiAgICAgICAgICAgIHRocm93IG5ldyBQYXJzZS5FcnJvcihQYXJzZS5FcnJvci5PQkpFQ1RfTk9UX0ZPVU5ELCAnSW52YWxpZCB1c2VybmFtZS9wYXNzd29yZC4nKTtcbiAgICAgICAgICB9XG5cbiAgICAgICAgICBpZiAocmVzdWx0cy5sZW5ndGggPiAxKSB7XG4gICAgICAgICAgICAvLyBjb3JuZXIgY2FzZSB3aGVyZSB1c2VyMSBoYXMgdXNlcm5hbWUgPT0gdXNlcjIgZW1haWxcbiAgICAgICAgICAgIHJlcS5jb25maWcubG9nZ2VyQ29udHJvbGxlci53YXJuKFxuICAgICAgICAgICAgICBcIlRoZXJlIGlzIGEgdXNlciB3aGljaCBlbWFpbCBpcyB0aGUgc2FtZSBhcyBhbm90aGVyIHVzZXIncyB1c2VybmFtZSwgbG9nZ2luZyBpbiBiYXNlZCBvbiB1c2VybmFtZVwiXG4gICAgICAgICAgICApO1xuICAgICAgICAgICAgdXNlciA9IHJlc3VsdHMuZmlsdGVyKHVzZXIgPT4gdXNlci51c2VybmFtZSA9PT0gdXNlcm5hbWUpWzBdO1xuICAgICAgICAgIH0gZWxzZSB7XG4gICAgICAgICAgICB1c2VyID0gcmVzdWx0c1swXTtcbiAgICAgICAgICB9XG5cbiAgICAgICAgICByZXR1cm4gcGFzc3dvcmRDcnlwdG8uY29tcGFyZShwYXNzd29yZCwgdXNlci5wYXNzd29yZCk7XG4gICAgICAgIH0pXG4gICAgICAgIC50aGVuKGNvcnJlY3QgPT4ge1xuICAgICAgICAgIGlzVmFsaWRQYXNzd29yZCA9IGNvcnJlY3Q7XG4gICAgICAgICAgY29uc3QgYWNjb3VudExvY2tvdXRQb2xpY3kgPSBuZXcgQWNjb3VudExvY2tvdXQodXNlciwgcmVxLmNvbmZpZyk7XG4gICAgICAgICAgcmV0dXJuIGFjY291bnRMb2Nrb3V0UG9saWN5LmhhbmRsZUxvZ2luQXR0ZW1wdChpc1ZhbGlkUGFzc3dvcmQpO1xuICAgICAgICB9KVxuICAgICAgICAudGhlbigoKSA9PiB7XG4gICAgICAgICAgaWYgKCFpc1ZhbGlkUGFzc3dvcmQpIHtcbiAgICAgICAgICAgIHRocm93IG5ldyBQYXJzZS5FcnJvcihQYXJzZS5FcnJvci5PQkpFQ1RfTk9UX0ZPVU5ELCAnSW52YWxpZCB1c2VybmFtZS9wYXNzd29yZC4nKTtcbiAgICAgICAgICB9XG4gICAgICAgICAgLy8gRW5zdXJlIHRoZSB1c2VyIGlzbid0IGxvY2tlZCBvdXRcbiAgICAgICAgICAvLyBBIGxvY2tlZCBvdXQgdXNlciB3b24ndCBiZSBhYmxlIHRvIGxvZ2luXG4gICAgICAgICAgLy8gVG8gbG9jayBhIHVzZXIgb3V0LCBqdXN0IHNldCB0aGUgQUNMIHRvIGBtYXN0ZXJLZXlgIG9ubHkgICh7fSkuXG4gICAgICAgICAgLy8gRW1wdHkgQUNMIGlzIE9LXG4gICAgICAgICAgaWYgKCFyZXEuYXV0aC5pc01hc3RlciAmJiB1c2VyLkFDTCAmJiBPYmplY3Qua2V5cyh1c2VyLkFDTCkubGVuZ3RoID09IDApIHtcbiAgICAgICAgICAgIHRocm93IG5ldyBQYXJzZS5FcnJvcihQYXJzZS5FcnJvci5PQkpFQ1RfTk9UX0ZPVU5ELCAnSW52YWxpZCB1c2VybmFtZS9wYXNzd29yZC4nKTtcbiAgICAgICAgICB9XG4gICAgICAgICAgaWYgKFxuICAgICAgICAgICAgcmVxLmNvbmZpZy52ZXJpZnlVc2VyRW1haWxzICYmXG4gICAgICAgICAgICByZXEuY29uZmlnLnByZXZlbnRMb2dpbldpdGhVbnZlcmlmaWVkRW1haWwgJiZcbiAgICAgICAgICAgICF1c2VyLmVtYWlsVmVyaWZpZWRcbiAgICAgICAgICApIHtcbiAgICAgICAgICAgIHRocm93IG5ldyBQYXJzZS5FcnJvcihQYXJzZS5FcnJvci5FTUFJTF9OT1RfRk9VTkQsICdVc2VyIGVtYWlsIGlzIG5vdCB2ZXJpZmllZC4nKTtcbiAgICAgICAgICB9XG5cbiAgICAgICAgICBkZWxldGUgdXNlci5wYXNzd29yZDtcblxuICAgICAgICAgIC8vIFNvbWV0aW1lcyB0aGUgYXV0aERhdGEgc3RpbGwgaGFzIG51bGwgb24gdGhhdCBrZXlzXG4gICAgICAgICAgLy8gaHR0cHM6Ly9naXRodWIuY29tL3BhcnNlLWNvbW11bml0eS9wYXJzZS1zZXJ2ZXIvaXNzdWVzLzkzNVxuICAgICAgICAgIGlmICh1c2VyLmF1dGhEYXRhKSB7XG4gICAgICAgICAgICBPYmplY3Qua2V5cyh1c2VyLmF1dGhEYXRhKS5mb3JFYWNoKHByb3ZpZGVyID0+IHtcbiAgICAgICAgICAgICAgaWYgKHVzZXIuYXV0aERhdGFbcHJvdmlkZXJdID09PSBudWxsKSB7XG4gICAgICAgICAgICAgICAgZGVsZXRlIHVzZXIuYXV0aERhdGFbcHJvdmlkZXJdO1xuICAgICAgICAgICAgICB9XG4gICAgICAgICAgICB9KTtcbiAgICAgICAgICAgIGlmIChPYmplY3Qua2V5cyh1c2VyLmF1dGhEYXRhKS5sZW5ndGggPT0gMCkge1xuICAgICAgICAgICAgICBkZWxldGUgdXNlci5hdXRoRGF0YTtcbiAgICAgICAgICAgIH1cbiAgICAgICAgICB9XG5cbiAgICAgICAgICByZXR1cm4gcmVzb2x2ZSh1c2VyKTtcbiAgICAgICAgfSlcbiAgICAgICAgLmNhdGNoKGVycm9yID0+IHtcbiAgICAgICAgICByZXR1cm4gcmVqZWN0KGVycm9yKTtcbiAgICAgICAgfSk7XG4gICAgfSk7XG4gIH1cblxuICBoYW5kbGVNZShyZXEpIHtcbiAgICBpZiAoIXJlcS5pbmZvIHx8ICFyZXEuaW5mby5zZXNzaW9uVG9rZW4pIHtcbiAgICAgIHRocm93IG5ldyBQYXJzZS5FcnJvcihQYXJzZS5FcnJvci5JTlZBTElEX1NFU1NJT05fVE9LRU4sICdJbnZhbGlkIHNlc3Npb24gdG9rZW4nKTtcbiAgICB9XG4gICAgY29uc3Qgc2Vzc2lvblRva2VuID0gcmVxLmluZm8uc2Vzc2lvblRva2VuO1xuICAgIHJldHVybiByZXN0XG4gICAgICAuZmluZChcbiAgICAgICAgcmVxLmNvbmZpZyxcbiAgICAgICAgQXV0aC5tYXN0ZXIocmVxLmNvbmZpZyksXG4gICAgICAgICdfU2Vzc2lvbicsXG4gICAgICAgIHsgc2Vzc2lvblRva2VuIH0sXG4gICAgICAgIHsgaW5jbHVkZTogJ3VzZXInIH0sXG4gICAgICAgIHJlcS5pbmZvLmNsaWVudFNESyxcbiAgICAgICAgcmVxLmluZm8uY29udGV4dFxuICAgICAgKVxuICAgICAgLnRoZW4ocmVzcG9uc2UgPT4ge1xuICAgICAgICBpZiAoIXJlc3BvbnNlLnJlc3VsdHMgfHwgcmVzcG9uc2UucmVzdWx0cy5sZW5ndGggPT0gMCB8fCAhcmVzcG9uc2UucmVzdWx0c1swXS51c2VyKSB7XG4gICAgICAgICAgdGhyb3cgbmV3IFBhcnNlLkVycm9yKFBhcnNlLkVycm9yLklOVkFMSURfU0VTU0lPTl9UT0tFTiwgJ0ludmFsaWQgc2Vzc2lvbiB0b2tlbicpO1xuICAgICAgICB9IGVsc2Uge1xuICAgICAgICAgIGNvbnN0IHVzZXIgPSByZXNwb25zZS5yZXN1bHRzWzBdLnVzZXI7XG4gICAgICAgICAgLy8gU2VuZCB0b2tlbiBiYWNrIG9uIHRoZSBsb2dpbiwgYmVjYXVzZSBTREtzIGV4cGVjdCB0aGF0LlxuICAgICAgICAgIHVzZXIuc2Vzc2lvblRva2VuID0gc2Vzc2lvblRva2VuO1xuXG4gICAgICAgICAgLy8gUmVtb3ZlIGhpZGRlbiBwcm9wZXJ0aWVzLlxuICAgICAgICAgIFVzZXJzUm91dGVyLnJlbW92ZUhpZGRlblByb3BlcnRpZXModXNlcik7XG5cbiAgICAgICAgICByZXR1cm4geyByZXNwb25zZTogdXNlciB9O1xuICAgICAgICB9XG4gICAgICB9KTtcbiAgfVxuXG4gIGFzeW5jIGhhbmRsZUxvZ0luKHJlcSkge1xuICAgIGNvbnN0IHVzZXIgPSBhd2FpdCB0aGlzLl9hdXRoZW50aWNhdGVVc2VyRnJvbVJlcXVlc3QocmVxKTtcblxuICAgIC8vIGhhbmRsZSBwYXNzd29yZCBleHBpcnkgcG9saWN5XG4gICAgaWYgKHJlcS5jb25maWcucGFzc3dvcmRQb2xpY3kgJiYgcmVxLmNvbmZpZy5wYXNzd29yZFBvbGljeS5tYXhQYXNzd29yZEFnZSkge1xuICAgICAgbGV0IGNoYW5nZWRBdCA9IHVzZXIuX3Bhc3N3b3JkX2NoYW5nZWRfYXQ7XG5cbiAgICAgIGlmICghY2hhbmdlZEF0KSB7XG4gICAgICAgIC8vIHBhc3N3b3JkIHdhcyBjcmVhdGVkIGJlZm9yZSBleHBpcnkgcG9saWN5IHdhcyBlbmFibGVkLlxuICAgICAgICAvLyBzaW1wbHkgdXBkYXRlIF9Vc2VyIG9iamVjdCBzbyB0aGF0IGl0IHdpbGwgc3RhcnQgZW5mb3JjaW5nIGZyb20gbm93XG4gICAgICAgIGNoYW5nZWRBdCA9IG5ldyBEYXRlKCk7XG4gICAgICAgIHJlcS5jb25maWcuZGF0YWJhc2UudXBkYXRlKFxuICAgICAgICAgICdfVXNlcicsXG4gICAgICAgICAgeyB1c2VybmFtZTogdXNlci51c2VybmFtZSB9LFxuICAgICAgICAgIHsgX3Bhc3N3b3JkX2NoYW5nZWRfYXQ6IFBhcnNlLl9lbmNvZGUoY2hhbmdlZEF0KSB9XG4gICAgICAgICk7XG4gICAgICB9IGVsc2Uge1xuICAgICAgICAvLyBjaGVjayB3aGV0aGVyIHRoZSBwYXNzd29yZCBoYXMgZXhwaXJlZFxuICAgICAgICBpZiAoY2hhbmdlZEF0Ll9fdHlwZSA9PSAnRGF0ZScpIHtcbiAgICAgICAgICBjaGFuZ2VkQXQgPSBuZXcgRGF0ZShjaGFuZ2VkQXQuaXNvKTtcbiAgICAgICAgfVxuICAgICAgICAvLyBDYWxjdWxhdGUgdGhlIGV4cGlyeSB0aW1lLlxuICAgICAgICBjb25zdCBleHBpcmVzQXQgPSBuZXcgRGF0ZShcbiAgICAgICAgICBjaGFuZ2VkQXQuZ2V0VGltZSgpICsgODY0MDAwMDAgKiByZXEuY29uZmlnLnBhc3N3b3JkUG9saWN5Lm1heFBhc3N3b3JkQWdlXG4gICAgICAgICk7XG4gICAgICAgIGlmIChleHBpcmVzQXQgPCBuZXcgRGF0ZSgpKVxuICAgICAgICAgIC8vIGZhaWwgb2YgY3VycmVudCB0aW1lIGlzIHBhc3QgcGFzc3dvcmQgZXhwaXJ5IHRpbWVcbiAgICAgICAgICB0aHJvdyBuZXcgUGFyc2UuRXJyb3IoXG4gICAgICAgICAgICBQYXJzZS5FcnJvci5PQkpFQ1RfTk9UX0ZPVU5ELFxuICAgICAgICAgICAgJ1lvdXIgcGFzc3dvcmQgaGFzIGV4cGlyZWQuIFBsZWFzZSByZXNldCB5b3VyIHBhc3N3b3JkLidcbiAgICAgICAgICApO1xuICAgICAgfVxuICAgIH1cblxuICAgIC8vIFJlbW92ZSBoaWRkZW4gcHJvcGVydGllcy5cbiAgICBVc2Vyc1JvdXRlci5yZW1vdmVIaWRkZW5Qcm9wZXJ0aWVzKHVzZXIpO1xuXG4gICAgcmVxLmNvbmZpZy5maWxlc0NvbnRyb2xsZXIuZXhwYW5kRmlsZXNJbk9iamVjdChyZXEuY29uZmlnLCB1c2VyKTtcblxuICAgIC8vIEJlZm9yZSBsb2dpbiB0cmlnZ2VyOyB0aHJvd3MgaWYgZmFpbHVyZVxuICAgIGF3YWl0IG1heWJlUnVuVHJpZ2dlcihcbiAgICAgIFRyaWdnZXJUeXBlcy5iZWZvcmVMb2dpbixcbiAgICAgIHJlcS5hdXRoLFxuICAgICAgUGFyc2UuVXNlci5mcm9tSlNPTihPYmplY3QuYXNzaWduKHsgY2xhc3NOYW1lOiAnX1VzZXInIH0sIHVzZXIpKSxcbiAgICAgIG51bGwsXG4gICAgICByZXEuY29uZmlnXG4gICAgKTtcblxuICAgIGNvbnN0IHsgc2Vzc2lvbkRhdGEsIGNyZWF0ZVNlc3Npb24gfSA9IEF1dGguY3JlYXRlU2Vzc2lvbihyZXEuY29uZmlnLCB7XG4gICAgICB1c2VySWQ6IHVzZXIub2JqZWN0SWQsXG4gICAgICBjcmVhdGVkV2l0aDoge1xuICAgICAgICBhY3Rpb246ICdsb2dpbicsXG4gICAgICAgIGF1dGhQcm92aWRlcjogJ3Bhc3N3b3JkJyxcbiAgICAgIH0sXG4gICAgICBpbnN0YWxsYXRpb25JZDogcmVxLmluZm8uaW5zdGFsbGF0aW9uSWQsXG4gICAgfSk7XG5cbiAgICB1c2VyLnNlc3Npb25Ub2tlbiA9IHNlc3Npb25EYXRhLnNlc3Npb25Ub2tlbjtcblxuICAgIGF3YWl0IGNyZWF0ZVNlc3Npb24oKTtcblxuICAgIGNvbnN0IGFmdGVyTG9naW5Vc2VyID0gUGFyc2UuVXNlci5mcm9tSlNPTihPYmplY3QuYXNzaWduKHsgY2xhc3NOYW1lOiAnX1VzZXInIH0sIHVzZXIpKTtcbiAgICBtYXliZVJ1blRyaWdnZXIoXG4gICAgICBUcmlnZ2VyVHlwZXMuYWZ0ZXJMb2dpbixcbiAgICAgIHsgLi4ucmVxLmF1dGgsIHVzZXI6IGFmdGVyTG9naW5Vc2VyIH0sXG4gICAgICBhZnRlckxvZ2luVXNlcixcbiAgICAgIG51bGwsXG4gICAgICByZXEuY29uZmlnXG4gICAgKTtcblxuICAgIHJldHVybiB7IHJlc3BvbnNlOiB1c2VyIH07XG4gIH1cblxuICBoYW5kbGVWZXJpZnlQYXNzd29yZChyZXEpIHtcbiAgICByZXR1cm4gdGhpcy5fYXV0aGVudGljYXRlVXNlckZyb21SZXF1ZXN0KHJlcSlcbiAgICAgIC50aGVuKHVzZXIgPT4ge1xuICAgICAgICAvLyBSZW1vdmUgaGlkZGVuIHByb3BlcnRpZXMuXG4gICAgICAgIFVzZXJzUm91dGVyLnJlbW92ZUhpZGRlblByb3BlcnRpZXModXNlcik7XG5cbiAgICAgICAgcmV0dXJuIHsgcmVzcG9uc2U6IHVzZXIgfTtcbiAgICAgIH0pXG4gICAgICAuY2F0Y2goZXJyb3IgPT4ge1xuICAgICAgICB0aHJvdyBlcnJvcjtcbiAgICAgIH0pO1xuICB9XG5cbiAgaGFuZGxlTG9nT3V0KHJlcSkge1xuICAgIGNvbnN0IHN1Y2Nlc3MgPSB7IHJlc3BvbnNlOiB7fSB9O1xuICAgIGlmIChyZXEuaW5mbyAmJiByZXEuaW5mby5zZXNzaW9uVG9rZW4pIHtcbiAgICAgIHJldHVybiByZXN0XG4gICAgICAgIC5maW5kKFxuICAgICAgICAgIHJlcS5jb25maWcsXG4gICAgICAgICAgQXV0aC5tYXN0ZXIocmVxLmNvbmZpZyksXG4gICAgICAgICAgJ19TZXNzaW9uJyxcbiAgICAgICAgICB7IHNlc3Npb25Ub2tlbjogcmVxLmluZm8uc2Vzc2lvblRva2VuIH0sXG4gICAgICAgICAgdW5kZWZpbmVkLFxuICAgICAgICAgIHJlcS5pbmZvLmNsaWVudFNESyxcbiAgICAgICAgICByZXEuaW5mby5jb250ZXh0XG4gICAgICAgIClcbiAgICAgICAgLnRoZW4ocmVjb3JkcyA9PiB7XG4gICAgICAgICAgaWYgKHJlY29yZHMucmVzdWx0cyAmJiByZWNvcmRzLnJlc3VsdHMubGVuZ3RoKSB7XG4gICAgICAgICAgICByZXR1cm4gcmVzdFxuICAgICAgICAgICAgICAuZGVsKFxuICAgICAgICAgICAgICAgIHJlcS5jb25maWcsXG4gICAgICAgICAgICAgICAgQXV0aC5tYXN0ZXIocmVxLmNvbmZpZyksXG4gICAgICAgICAgICAgICAgJ19TZXNzaW9uJyxcbiAgICAgICAgICAgICAgICByZWNvcmRzLnJlc3VsdHNbMF0ub2JqZWN0SWQsXG4gICAgICAgICAgICAgICAgcmVxLmluZm8uY29udGV4dFxuICAgICAgICAgICAgICApXG4gICAgICAgICAgICAgIC50aGVuKCgpID0+IHtcbiAgICAgICAgICAgICAgICB0aGlzLl9ydW5BZnRlckxvZ291dFRyaWdnZXIocmVxLCByZWNvcmRzLnJlc3VsdHNbMF0pO1xuICAgICAgICAgICAgICAgIHJldHVybiBQcm9taXNlLnJlc29sdmUoc3VjY2Vzcyk7XG4gICAgICAgICAgICAgIH0pO1xuICAgICAgICAgIH1cbiAgICAgICAgICByZXR1cm4gUHJvbWlzZS5yZXNvbHZlKHN1Y2Nlc3MpO1xuICAgICAgICB9KTtcbiAgICB9XG4gICAgcmV0dXJuIFByb21pc2UucmVzb2x2ZShzdWNjZXNzKTtcbiAgfVxuXG4gIF9ydW5BZnRlckxvZ291dFRyaWdnZXIocmVxLCBzZXNzaW9uKSB7XG4gICAgLy8gQWZ0ZXIgbG9nb3V0IHRyaWdnZXJcbiAgICBtYXliZVJ1blRyaWdnZXIoXG4gICAgICBUcmlnZ2VyVHlwZXMuYWZ0ZXJMb2dvdXQsXG4gICAgICByZXEuYXV0aCxcbiAgICAgIFBhcnNlLlNlc3Npb24uZnJvbUpTT04oT2JqZWN0LmFzc2lnbih7IGNsYXNzTmFtZTogJ19TZXNzaW9uJyB9LCBzZXNzaW9uKSksXG4gICAgICBudWxsLFxuICAgICAgcmVxLmNvbmZpZ1xuICAgICk7XG4gIH1cblxuICBfdGhyb3dPbkJhZEVtYWlsQ29uZmlnKHJlcSkge1xuICAgIHRyeSB7XG4gICAgICBDb25maWcudmFsaWRhdGVFbWFpbENvbmZpZ3VyYXRpb24oe1xuICAgICAgICBlbWFpbEFkYXB0ZXI6IHJlcS5jb25maWcudXNlckNvbnRyb2xsZXIuYWRhcHRlcixcbiAgICAgICAgYXBwTmFtZTogcmVxLmNvbmZpZy5hcHBOYW1lLFxuICAgICAgICBwdWJsaWNTZXJ2ZXJVUkw6IHJlcS5jb25maWcucHVibGljU2VydmVyVVJMLFxuICAgICAgICBlbWFpbFZlcmlmeVRva2VuVmFsaWRpdHlEdXJhdGlvbjogcmVxLmNvbmZpZy5lbWFpbFZlcmlmeVRva2VuVmFsaWRpdHlEdXJhdGlvbixcbiAgICAgIH0pO1xuICAgIH0gY2F0Y2ggKGUpIHtcbiAgICAgIGlmICh0eXBlb2YgZSA9PT0gJ3N0cmluZycpIHtcbiAgICAgICAgLy8gTWF5YmUgd2UgbmVlZCBhIEJhZCBDb25maWd1cmF0aW9uIGVycm9yLCBidXQgdGhlIFNES3Mgd29uJ3QgdW5kZXJzdGFuZCBpdC4gRm9yIG5vdywgSW50ZXJuYWwgU2VydmVyIEVycm9yLlxuICAgICAgICB0aHJvdyBuZXcgUGFyc2UuRXJyb3IoXG4gICAgICAgICAgUGFyc2UuRXJyb3IuSU5URVJOQUxfU0VSVkVSX0VSUk9SLFxuICAgICAgICAgICdBbiBhcHBOYW1lLCBwdWJsaWNTZXJ2ZXJVUkwsIGFuZCBlbWFpbEFkYXB0ZXIgYXJlIHJlcXVpcmVkIGZvciBwYXNzd29yZCByZXNldCBhbmQgZW1haWwgdmVyaWZpY2F0aW9uIGZ1bmN0aW9uYWxpdHkuJ1xuICAgICAgICApO1xuICAgICAgfSBlbHNlIHtcbiAgICAgICAgdGhyb3cgZTtcbiAgICAgIH1cbiAgICB9XG4gIH1cblxuICBoYW5kbGVSZXNldFJlcXVlc3QocmVxKSB7XG4gICAgdGhpcy5fdGhyb3dPbkJhZEVtYWlsQ29uZmlnKHJlcSk7XG5cbiAgICBjb25zdCB7IGVtYWlsIH0gPSByZXEuYm9keTtcbiAgICBpZiAoIWVtYWlsKSB7XG4gICAgICB0aHJvdyBuZXcgUGFyc2UuRXJyb3IoUGFyc2UuRXJyb3IuRU1BSUxfTUlTU0lORywgJ3lvdSBtdXN0IHByb3ZpZGUgYW4gZW1haWwnKTtcbiAgICB9XG4gICAgaWYgKHR5cGVvZiBlbWFpbCAhPT0gJ3N0cmluZycpIHtcbiAgICAgIHRocm93IG5ldyBQYXJzZS5FcnJvcihcbiAgICAgICAgUGFyc2UuRXJyb3IuSU5WQUxJRF9FTUFJTF9BRERSRVNTLFxuICAgICAgICAneW91IG11c3QgcHJvdmlkZSBhIHZhbGlkIGVtYWlsIHN0cmluZydcbiAgICAgICk7XG4gICAgfVxuICAgIGNvbnN0IHVzZXJDb250cm9sbGVyID0gcmVxLmNvbmZpZy51c2VyQ29udHJvbGxlcjtcbiAgICByZXR1cm4gdXNlckNvbnRyb2xsZXIuc2VuZFBhc3N3b3JkUmVzZXRFbWFpbChlbWFpbCkudGhlbihcbiAgICAgICgpID0+IHtcbiAgICAgICAgcmV0dXJuIFByb21pc2UucmVzb2x2ZSh7XG4gICAgICAgICAgcmVzcG9uc2U6IHt9LFxuICAgICAgICB9KTtcbiAgICAgIH0sXG4gICAgICBlcnIgPT4ge1xuICAgICAgICBpZiAoZXJyLmNvZGUgPT09IFBhcnNlLkVycm9yLk9CSkVDVF9OT1RfRk9VTkQpIHtcbiAgICAgICAgICAvLyBSZXR1cm4gc3VjY2VzcyBzbyB0aGF0IHRoaXMgZW5kcG9pbnQgY2FuJ3RcbiAgICAgICAgICAvLyBiZSB1c2VkIHRvIGVudW1lcmF0ZSB2YWxpZCBlbWFpbHNcbiAgICAgICAgICByZXR1cm4gUHJvbWlzZS5yZXNvbHZlKHtcbiAgICAgICAgICAgIHJlc3BvbnNlOiB7fSxcbiAgICAgICAgICB9KTtcbiAgICAgICAgfSBlbHNlIHtcbiAgICAgICAgICB0aHJvdyBlcnI7XG4gICAgICAgIH1cbiAgICAgIH1cbiAgICApO1xuICB9XG5cbiAgaGFuZGxlVmVyaWZpY2F0aW9uRW1haWxSZXF1ZXN0KHJlcSkge1xuICAgIHRoaXMuX3Rocm93T25CYWRFbWFpbENvbmZpZyhyZXEpO1xuXG4gICAgY29uc3QgeyBlbWFpbCB9ID0gcmVxLmJvZHk7XG4gICAgaWYgKCFlbWFpbCkge1xuICAgICAgdGhyb3cgbmV3IFBhcnNlLkVycm9yKFBhcnNlLkVycm9yLkVNQUlMX01JU1NJTkcsICd5b3UgbXVzdCBwcm92aWRlIGFuIGVtYWlsJyk7XG4gICAgfVxuICAgIGlmICh0eXBlb2YgZW1haWwgIT09ICdzdHJpbmcnKSB7XG4gICAgICB0aHJvdyBuZXcgUGFyc2UuRXJyb3IoXG4gICAgICAgIFBhcnNlLkVycm9yLklOVkFMSURfRU1BSUxfQUREUkVTUyxcbiAgICAgICAgJ3lvdSBtdXN0IHByb3ZpZGUgYSB2YWxpZCBlbWFpbCBzdHJpbmcnXG4gICAgICApO1xuICAgIH1cblxuICAgIHJldHVybiByZXEuY29uZmlnLmRhdGFiYXNlLmZpbmQoJ19Vc2VyJywgeyBlbWFpbDogZW1haWwgfSkudGhlbihyZXN1bHRzID0+IHtcbiAgICAgIGlmICghcmVzdWx0cy5sZW5ndGggfHwgcmVzdWx0cy5sZW5ndGggPCAxKSB7XG4gICAgICAgIHRocm93IG5ldyBQYXJzZS5FcnJvcihQYXJzZS5FcnJvci5FTUFJTF9OT1RfRk9VTkQsIGBObyB1c2VyIGZvdW5kIHdpdGggZW1haWwgJHtlbWFpbH1gKTtcbiAgICAgIH1cbiAgICAgIGNvbnN0IHVzZXIgPSByZXN1bHRzWzBdO1xuXG4gICAgICAvLyByZW1vdmUgcGFzc3dvcmQgZmllbGQsIG1lc3NlcyB3aXRoIHNhdmluZyBvbiBwb3N0Z3Jlc1xuICAgICAgZGVsZXRlIHVzZXIucGFzc3dvcmQ7XG5cbiAgICAgIGlmICh1c2VyLmVtYWlsVmVyaWZpZWQpIHtcbiAgICAgICAgdGhyb3cgbmV3IFBhcnNlLkVycm9yKFBhcnNlLkVycm9yLk9USEVSX0NBVVNFLCBgRW1haWwgJHtlbWFpbH0gaXMgYWxyZWFkeSB2ZXJpZmllZC5gKTtcbiAgICAgIH1cblxuICAgICAgY29uc3QgdXNlckNvbnRyb2xsZXIgPSByZXEuY29uZmlnLnVzZXJDb250cm9sbGVyO1xuICAgICAgcmV0dXJuIHVzZXJDb250cm9sbGVyLnJlZ2VuZXJhdGVFbWFpbFZlcmlmeVRva2VuKHVzZXIpLnRoZW4oKCkgPT4ge1xuICAgICAgICB1c2VyQ29udHJvbGxlci5zZW5kVmVyaWZpY2F0aW9uRW1haWwodXNlcik7XG4gICAgICAgIHJldHVybiB7IHJlc3BvbnNlOiB7fSB9O1xuICAgICAgfSk7XG4gICAgfSk7XG4gIH1cblxuICBtb3VudFJvdXRlcygpIHtcbiAgICB0aGlzLnJvdXRlKCdHRVQnLCAnL3VzZXJzJywgcmVxID0+IHtcbiAgICAgIHJldHVybiB0aGlzLmhhbmRsZUZpbmQocmVxKTtcbiAgICB9KTtcbiAgICB0aGlzLnJvdXRlKCdQT1NUJywgJy91c2VycycsIHByb21pc2VFbnN1cmVJZGVtcG90ZW5jeSwgcmVxID0+IHtcbiAgICAgIHJldHVybiB0aGlzLmhhbmRsZUNyZWF0ZShyZXEpO1xuICAgIH0pO1xuICAgIHRoaXMucm91dGUoJ0dFVCcsICcvdXNlcnMvbWUnLCByZXEgPT4ge1xuICAgICAgcmV0dXJuIHRoaXMuaGFuZGxlTWUocmVxKTtcbiAgICB9KTtcbiAgICB0aGlzLnJvdXRlKCdHRVQnLCAnL3VzZXJzLzpvYmplY3RJZCcsIHJlcSA9PiB7XG4gICAgICByZXR1cm4gdGhpcy5oYW5kbGVHZXQocmVxKTtcbiAgICB9KTtcbiAgICB0aGlzLnJvdXRlKCdQVVQnLCAnL3VzZXJzLzpvYmplY3RJZCcsIHByb21pc2VFbnN1cmVJZGVtcG90ZW5jeSwgcmVxID0+IHtcbiAgICAgIHJldHVybiB0aGlzLmhhbmRsZVVwZGF0ZShyZXEpO1xuICAgIH0pO1xuICAgIHRoaXMucm91dGUoJ0RFTEVURScsICcvdXNlcnMvOm9iamVjdElkJywgcmVxID0+IHtcbiAgICAgIHJldHVybiB0aGlzLmhhbmRsZURlbGV0ZShyZXEpO1xuICAgIH0pO1xuICAgIHRoaXMucm91dGUoJ0dFVCcsICcvbG9naW4nLCByZXEgPT4ge1xuICAgICAgcmV0dXJuIHRoaXMuaGFuZGxlTG9nSW4ocmVxKTtcbiAgICB9KTtcbiAgICB0aGlzLnJvdXRlKCdQT1NUJywgJy9sb2dpbicsIHJlcSA9PiB7XG4gICAgICByZXR1cm4gdGhpcy5oYW5kbGVMb2dJbihyZXEpO1xuICAgIH0pO1xuICAgIHRoaXMucm91dGUoJ1BPU1QnLCAnL2xvZ291dCcsIHJlcSA9PiB7XG4gICAgICByZXR1cm4gdGhpcy5oYW5kbGVMb2dPdXQocmVxKTtcbiAgICB9KTtcbiAgICB0aGlzLnJvdXRlKCdQT1NUJywgJy9yZXF1ZXN0UGFzc3dvcmRSZXNldCcsIHJlcSA9PiB7XG4gICAgICByZXR1cm4gdGhpcy5oYW5kbGVSZXNldFJlcXVlc3QocmVxKTtcbiAgICB9KTtcbiAgICB0aGlzLnJvdXRlKCdQT1NUJywgJy92ZXJpZmljYXRpb25FbWFpbFJlcXVlc3QnLCByZXEgPT4ge1xuICAgICAgcmV0dXJuIHRoaXMuaGFuZGxlVmVyaWZpY2F0aW9uRW1haWxSZXF1ZXN0KHJlcSk7XG4gICAgfSk7XG4gICAgdGhpcy5yb3V0ZSgnR0VUJywgJy92ZXJpZnlQYXNzd29yZCcsIHJlcSA9PiB7XG4gICAgICByZXR1cm4gdGhpcy5oYW5kbGVWZXJpZnlQYXNzd29yZChyZXEpO1xuICAgIH0pO1xuICB9XG59XG5cbmV4cG9ydCBkZWZhdWx0IFVzZXJzUm91dGVyO1xuIl19