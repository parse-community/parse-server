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
//# sourceMappingURL=data:application/json;charset=utf-8;base64,eyJ2ZXJzaW9uIjozLCJzb3VyY2VzIjpbIi4uLy4uL3NyYy9Sb3V0ZXJzL1VzZXJzUm91dGVyLmpzIl0sIm5hbWVzIjpbIlVzZXJzUm91dGVyIiwiQ2xhc3Nlc1JvdXRlciIsImNsYXNzTmFtZSIsInJlbW92ZUhpZGRlblByb3BlcnRpZXMiLCJvYmoiLCJrZXkiLCJPYmplY3QiLCJwcm90b3R5cGUiLCJoYXNPd25Qcm9wZXJ0eSIsImNhbGwiLCJ0ZXN0IiwiX2F1dGhlbnRpY2F0ZVVzZXJGcm9tUmVxdWVzdCIsInJlcSIsIlByb21pc2UiLCJyZXNvbHZlIiwicmVqZWN0IiwicGF5bG9hZCIsImJvZHkiLCJ1c2VybmFtZSIsInF1ZXJ5IiwiZW1haWwiLCJwYXNzd29yZCIsIlBhcnNlIiwiRXJyb3IiLCJVU0VSTkFNRV9NSVNTSU5HIiwiUEFTU1dPUkRfTUlTU0lORyIsIk9CSkVDVF9OT1RfRk9VTkQiLCJ1c2VyIiwiaXNWYWxpZFBhc3N3b3JkIiwiJG9yIiwiY29uZmlnIiwiZGF0YWJhc2UiLCJmaW5kIiwidGhlbiIsInJlc3VsdHMiLCJsZW5ndGgiLCJsb2dnZXJDb250cm9sbGVyIiwid2FybiIsImZpbHRlciIsInBhc3N3b3JkQ3J5cHRvIiwiY29tcGFyZSIsImNvcnJlY3QiLCJhY2NvdW50TG9ja291dFBvbGljeSIsIkFjY291bnRMb2Nrb3V0IiwiaGFuZGxlTG9naW5BdHRlbXB0IiwiYXV0aCIsImlzTWFzdGVyIiwiQUNMIiwia2V5cyIsInZlcmlmeVVzZXJFbWFpbHMiLCJwcmV2ZW50TG9naW5XaXRoVW52ZXJpZmllZEVtYWlsIiwiZW1haWxWZXJpZmllZCIsIkVNQUlMX05PVF9GT1VORCIsImF1dGhEYXRhIiwiZm9yRWFjaCIsInByb3ZpZGVyIiwiY2F0Y2giLCJlcnJvciIsImhhbmRsZU1lIiwiaW5mbyIsInNlc3Npb25Ub2tlbiIsIklOVkFMSURfU0VTU0lPTl9UT0tFTiIsInJlc3QiLCJBdXRoIiwibWFzdGVyIiwiaW5jbHVkZSIsImNsaWVudFNESyIsImNvbnRleHQiLCJyZXNwb25zZSIsImhhbmRsZUxvZ0luIiwicGFzc3dvcmRQb2xpY3kiLCJtYXhQYXNzd29yZEFnZSIsImNoYW5nZWRBdCIsIl9wYXNzd29yZF9jaGFuZ2VkX2F0IiwiRGF0ZSIsInVwZGF0ZSIsIl9lbmNvZGUiLCJfX3R5cGUiLCJpc28iLCJleHBpcmVzQXQiLCJnZXRUaW1lIiwiZmlsZXNDb250cm9sbGVyIiwiZXhwYW5kRmlsZXNJbk9iamVjdCIsIlRyaWdnZXJUeXBlcyIsImJlZm9yZUxvZ2luIiwiVXNlciIsImZyb21KU09OIiwiYXNzaWduIiwic2Vzc2lvbkRhdGEiLCJjcmVhdGVTZXNzaW9uIiwidXNlcklkIiwib2JqZWN0SWQiLCJjcmVhdGVkV2l0aCIsImFjdGlvbiIsImF1dGhQcm92aWRlciIsImluc3RhbGxhdGlvbklkIiwiYWZ0ZXJMb2dpblVzZXIiLCJhZnRlckxvZ2luIiwiaGFuZGxlVmVyaWZ5UGFzc3dvcmQiLCJoYW5kbGVMb2dPdXQiLCJzdWNjZXNzIiwidW5kZWZpbmVkIiwicmVjb3JkcyIsImRlbCIsIl9ydW5BZnRlckxvZ291dFRyaWdnZXIiLCJzZXNzaW9uIiwiYWZ0ZXJMb2dvdXQiLCJTZXNzaW9uIiwiX3Rocm93T25CYWRFbWFpbENvbmZpZyIsIkNvbmZpZyIsInZhbGlkYXRlRW1haWxDb25maWd1cmF0aW9uIiwiZW1haWxBZGFwdGVyIiwidXNlckNvbnRyb2xsZXIiLCJhZGFwdGVyIiwiYXBwTmFtZSIsInB1YmxpY1NlcnZlclVSTCIsImVtYWlsVmVyaWZ5VG9rZW5WYWxpZGl0eUR1cmF0aW9uIiwiZW1haWxWZXJpZnlUb2tlblJldXNlSWZWYWxpZCIsImUiLCJJTlRFUk5BTF9TRVJWRVJfRVJST1IiLCJoYW5kbGVSZXNldFJlcXVlc3QiLCJFTUFJTF9NSVNTSU5HIiwiSU5WQUxJRF9FTUFJTF9BRERSRVNTIiwic2VuZFBhc3N3b3JkUmVzZXRFbWFpbCIsImVyciIsImNvZGUiLCJoYW5kbGVWZXJpZmljYXRpb25FbWFpbFJlcXVlc3QiLCJPVEhFUl9DQVVTRSIsInJlZ2VuZXJhdGVFbWFpbFZlcmlmeVRva2VuIiwic2VuZFZlcmlmaWNhdGlvbkVtYWlsIiwibW91bnRSb3V0ZXMiLCJyb3V0ZSIsImhhbmRsZUZpbmQiLCJwcm9taXNlRW5zdXJlSWRlbXBvdGVuY3kiLCJoYW5kbGVDcmVhdGUiLCJoYW5kbGVHZXQiLCJoYW5kbGVVcGRhdGUiLCJoYW5kbGVEZWxldGUiXSwibWFwcGluZ3MiOiI7Ozs7Ozs7QUFFQTs7QUFDQTs7QUFDQTs7QUFDQTs7QUFDQTs7QUFDQTs7QUFDQTs7QUFDQTs7QUFDQTs7Ozs7Ozs7OztBQUVPLE1BQU1BLFdBQU4sU0FBMEJDLHNCQUExQixDQUF3QztBQUM3Q0MsRUFBQUEsU0FBUyxHQUFHO0FBQ1YsV0FBTyxPQUFQO0FBQ0Q7QUFFRDs7Ozs7O0FBSUEsU0FBT0Msc0JBQVAsQ0FBOEJDLEdBQTlCLEVBQW1DO0FBQ2pDLFNBQUssSUFBSUMsR0FBVCxJQUFnQkQsR0FBaEIsRUFBcUI7QUFDbkIsVUFBSUUsTUFBTSxDQUFDQyxTQUFQLENBQWlCQyxjQUFqQixDQUFnQ0MsSUFBaEMsQ0FBcUNMLEdBQXJDLEVBQTBDQyxHQUExQyxDQUFKLEVBQW9EO0FBQ2xEO0FBQ0EsWUFBSUEsR0FBRyxLQUFLLFFBQVIsSUFBb0IsQ0FBQywwQkFBMEJLLElBQTFCLENBQStCTCxHQUEvQixDQUF6QixFQUE4RDtBQUM1RCxpQkFBT0QsR0FBRyxDQUFDQyxHQUFELENBQVY7QUFDRDtBQUNGO0FBQ0Y7QUFDRjtBQUVEOzs7Ozs7OztBQU1BTSxFQUFBQSw0QkFBNEIsQ0FBQ0MsR0FBRCxFQUFNO0FBQ2hDLFdBQU8sSUFBSUMsT0FBSixDQUFZLENBQUNDLE9BQUQsRUFBVUMsTUFBVixLQUFxQjtBQUN0QztBQUNBLFVBQUlDLE9BQU8sR0FBR0osR0FBRyxDQUFDSyxJQUFsQjs7QUFDQSxVQUNHLENBQUNELE9BQU8sQ0FBQ0UsUUFBVCxJQUFxQk4sR0FBRyxDQUFDTyxLQUF6QixJQUFrQ1AsR0FBRyxDQUFDTyxLQUFKLENBQVVELFFBQTdDLElBQ0MsQ0FBQ0YsT0FBTyxDQUFDSSxLQUFULElB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O0FBQ0QsS0FGRDtBQUdBLFNBQUt1SCxLQUFMLENBQVcsTUFBWCxFQUFtQixTQUFuQixFQUE4QnZILEdBQUcsSUFBSTtBQUNuQyxhQUFPLEtBQUt1RixZQUFMLENBQWtCdkYsR0FBbEIsQ0FBUDtBQUNELEtBRkQ7QUFHQSxTQUFLdUgsS0FBTCxDQUFXLE1BQVgsRUFBbUIsdUJBQW5CLEVBQTRDdkgsR0FBRyxJQUFJO0FBQ2pELGFBQU8sS0FBSzRHLGtCQUFMLENBQXdCNUcsR0FBeEIsQ0FBUDtBQUNELEtBRkQ7QUFHQSxTQUFLdUgsS0FBTCxDQUFXLE1BQVgsRUFBbUIsMkJBQW5CLEVBQWdEdkgsR0FBRyxJQUFJO0FBQ3JELGFBQU8sS0FBS2tILDhCQUFMLENBQW9DbEgsR0FBcEMsQ0FBUDtBQUNELEtBRkQ7QUFHQSxTQUFLdUgsS0FBTCxDQUFXLEtBQVgsRUFBa0IsaUJBQWxCLEVBQXFDdkgsR0FBRyxJQUFJO0FBQzFDLGFBQU8sS0FBS3NGLG9CQUFMLENBQTBCdEYsR0FBMUIsQ0FBUDtBQUNELEtBRkQ7QUFHRDs7QUFuYTRDOzs7ZUFzYWhDWixXIiwic291cmNlc0NvbnRlbnQiOlsiLy8gVGhlc2UgbWV0aG9kcyBoYW5kbGUgdGhlIFVzZXItcmVsYXRlZCByb3V0ZXMuXG5cbmltcG9ydCBQYXJzZSBmcm9tICdwYXJzZS9ub2RlJztcbmltcG9ydCBDb25maWcgZnJvbSAnLi4vQ29uZmlnJztcbmltcG9ydCBBY2NvdW50TG9ja291dCBmcm9tICcuLi9BY2NvdW50TG9ja291dCc7XG5pbXBvcnQgQ2xhc3Nlc1JvdXRlciBmcm9tICcuL0NsYXNzZXNSb3V0ZXInO1xuaW1wb3J0IHJlc3QgZnJvbSAnLi4vcmVzdCc7XG5pbXBvcnQgQXV0aCBmcm9tICcuLi9BdXRoJztcbmltcG9ydCBwYXNzd29yZENyeXB0byBmcm9tICcuLi9wYXNzd29yZCc7XG5pbXBvcnQgeyBtYXliZVJ1blRyaWdnZXIsIFR5cGVzIGFzIFRyaWdnZXJUeXBlcyB9IGZyb20gJy4uL3RyaWdnZXJzJztcbmltcG9ydCB7IHByb21pc2VFbnN1cmVJZGVtcG90ZW5jeSB9IGZyb20gJy4uL21pZGRsZXdhcmVzJztcblxuZXhwb3J0IGNsYXNzIFVzZXJzUm91dGVyIGV4dGVuZHMgQ2xhc3Nlc1JvdXRlciB7XG4gIGNsYXNzTmFtZSgpIHtcbiAgICByZXR1cm4gJ19Vc2VyJztcbiAgfVxuXG4gIC8qKlxuICAgKiBSZW1vdmVzIGFsbCBcIl9cIiBwcmVmaXhlZCBwcm9wZXJ0aWVzIGZyb20gYW4gb2JqZWN0LCBleGNlcHQgXCJfX3R5cGVcIlxuICAgKiBAcGFyYW0ge09iamVjdH0gb2JqIEFuIG9iamVjdC5cbiAgICovXG4gIHN0YXRpYyByZW1vdmVIaWRkZW5Qcm9wZXJ0aWVzKG9iaikge1xuICAgIGZvciAodmFyIGtleSBpbiBvYmopIHtcbiAgICAgIGlmIChPYmplY3QucHJvdG90eXBlLmhhc093blByb3BlcnR5LmNhbGwob2JqLCBrZXkpKSB7XG4gICAgICAgIC8vIFJlZ2V4cCBjb21lcyBmcm9tIFBhcnNlLk9iamVjdC5wcm90b3R5cGUudmFsaWRhdGVcbiAgICAgICAgaWYgKGtleSAhPT0gJ19fdHlwZScgJiYgIS9eW0EtWmEtel1bMC05QS1aYS16X10qJC8udGVzdChrZXkpKSB7XG4gICAgICAgICAgZGVsZXRlIG9ialtrZXldO1xuICAgICAgICB9XG4gICAgICB9XG4gICAgfVxuICB9XG5cbiAgLyoqXG4gICAqIFZhbGlkYXRlcyBhIHBhc3N3b3JkIHJlcXVlc3QgaW4gbG9naW4gYW5kIHZlcmlmeVBhc3N3b3JkXG4gICAqIEBwYXJhbSB7T2JqZWN0fSByZXEgVGhlIHJlcXVlc3RcbiAgICogQHJldHVybnMge09iamVjdH0gVXNlciBvYmplY3RcbiAgICogQHByaXZhdGVcbiAgICovXG4gIF9hdXRoZW50aWNhdGVVc2VyRnJvbVJlcXVlc3QocmVxKSB7XG4gICAgcmV0dXJuIG5ldyBQcm9taXNlKChyZXNvbHZlLCByZWplY3QpID0+IHtcbiAgICAgIC8vIFVzZSBxdWVyeSBwYXJhbWV0ZXJzIGluc3RlYWQgaWYgcHJvdmlkZWQgaW4gdXJsXG4gICAgICBsZXQgcGF5bG9hZCA9IHJlcS5ib2R5O1xuICAgICAgaWYgKFxuICAgICAgICAoIXBheWxvYWQudXNlcm5hbWUgJiYgcmVxLnF1ZXJ5ICYmIHJlcS5xdWVyeS51c2VybmFtZSkgfHxcbiAgICAgICAgKCFwYXlsb2FkLmVtYWlsICYmIHJlcS5xdWVyeSAmJiByZXEucXVlcnkuZW1haWwpXG4gICAgICApIHtcbiAgICAgICAgcGF5bG9hZCA9IHJlcS5xdWVyeTtcbiAgICAgIH1cbiAgICAgIGNvbnN0IHsgdXNlcm5hbWUsIGVtYWlsLCBwYXNzd29yZCB9ID0gcGF5bG9hZDtcblxuICAgICAgLy8gVE9ETzogdXNlIHRoZSByaWdodCBlcnJvciBjb2RlcyAvIGRlc2NyaXB0aW9ucy5cbiAgICAgIGlmICghdXNlcm5hbWUgJiYgIWVtYWlsKSB7XG4gICAgICAgIHRocm93IG5ldyBQYXJzZS5FcnJvcihQYXJzZS5FcnJvci5VU0VSTkFNRV9NSVNTSU5HLCAndXNlcm5hbWUvZW1haWwgaXMgcmVxdWlyZWQuJyk7XG4gICAgICB9XG4gICAgICBpZiAoIXBhc3N3b3JkKSB7XG4gICAgICAgIHRocm93IG5ldyBQYXJzZS5FcnJvcihQYXJzZS5FcnJvci5QQVNTV09SRF9NSVNTSU5HLCAncGFzc3dvcmQgaXMgcmVxdWlyZWQuJyk7XG4gICAgICB9XG4gICAgICBpZiAoXG4gICAgICAgIHR5cGVvZiBwYXNzd29yZCAhPT0gJ3N0cmluZycgfHxcbiAgICAgICAgKGVtYWlsICYmIHR5cGVvZiBlbWFpbCAhPT0gJ3N0cmluZycpIHx8XG4gICAgICAgICh1c2VybmFtZSAmJiB0eXBlb2YgdXNlcm5hbWUgIT09ICdzdHJpbmcnKVxuICAgICAgKSB7XG4gICAgICAgIHRocm93IG5ldyBQYXJzZS5FcnJvcihQYXJzZS5FcnJvci5PQkpFQ1RfTk9UX0ZPVU5ELCAnSW52YWxpZCB1c2VybmFtZS9wYXNzd29yZC4nKTtcbiAgICAgIH1cblxuICAgICAgbGV0IHVzZXI7XG4gICAgICBsZXQgaXNWYWxpZFBhc3N3b3JkID0gZmFsc2U7XG4gICAgICBsZXQgcXVlcnk7XG4gICAgICBpZiAoZW1haWwgJiYgdXNlcm5hbWUpIHtcbiAgICAgICAgcXVlcnkgPSB7IGVtYWlsLCB1c2VybmFtZSB9O1xuICAgICAgfSBlbHNlIGlmIChlbWFpbCkge1xuICAgICAgICBxdWVyeSA9IHsgZW1haWwgfTtcbiAgICAgIH0gZWxzZSB7XG4gICAgICAgIHF1ZXJ5ID0geyAkb3I6IFt7IHVzZXJuYW1lIH0sIHsgZW1haWw6IHVzZXJuYW1lIH1dIH07XG4gICAgICB9XG4gICAgICByZXR1cm4gcmVxLmNvbmZpZy5kYXRhYmFzZVxuICAgICAgICAuZmluZCgnX1VzZXInLCBxdWVyeSlcbiAgICAgICAgLnRoZW4ocmVzdWx0cyA9PiB7XG4gICAgICAgICAgaWYgKCFyZXN1bHRzLmxlbmd0aCkge1xuICAgICAgICAgICAgdGhyb3cgbmV3IFBhcnNlLkVycm9yKFBhcnNlLkVycm9yLk9CSkVDVF9OT1RfRk9VTkQsICdJbnZhbGlkIHVzZXJuYW1lL3Bhc3N3b3JkLicpO1xuICAgICAgICAgIH1cblxuICAgICAgICAgIGlmIChyZXN1bHRzLmxlbmd0aCA+IDEpIHtcbiAgICAgICAgICAgIC8vIGNvcm5lciBjYXNlIHdoZXJlIHVzZXIxIGhhcyB1c2VybmFtZSA9PSB1c2VyMiBlbWFpbFxuICAgICAgICAgICAgcmVxLmNvbmZpZy5sb2dnZXJDb250cm9sbGVyLndhcm4oXG4gICAgICAgICAgICAgIFwiVGhlcmUgaXMgYSB1c2VyIHdoaWNoIGVtYWlsIGlzIHRoZSBzYW1lIGFzIGFub3RoZXIgdXNlcidzIHVzZXJuYW1lLCBsb2dnaW5nIGluIGJhc2VkIG9uIHVzZXJuYW1lXCJcbiAgICAgICAgICAgICk7XG4gICAgICAgICAgICB1c2VyID0gcmVzdWx0cy5maWx0ZXIodXNlciA9PiB1c2VyLnVzZXJuYW1lID09PSB1c2VybmFtZSlbMF07XG4gICAgICAgICAgfSBlbHNlIHtcbiAgICAgICAgICAgIHVzZXIgPSByZXN1bHRzWzBdO1xuICAgICAgICAgIH1cblxuICAgICAgICAgIHJldHVybiBwYXNzd29yZENyeXB0by5jb21wYXJlKHBhc3N3b3JkLCB1c2VyLnBhc3N3b3JkKTtcbiAgICAgICAgfSlcbiAgICAgICAgLnRoZW4oY29ycmVjdCA9PiB7XG4gICAgICAgICAgaXNWYWxpZFBhc3N3b3JkID0gY29ycmVjdDtcbiAgICAgICAgICBjb25zdCBhY2NvdW50TG9ja291dFBvbGljeSA9IG5ldyBBY2NvdW50TG9ja291dCh1c2VyLCByZXEuY29uZmlnKTtcbiAgICAgICAgICByZXR1cm4gYWNjb3VudExvY2tvdXRQb2xpY3kuaGFuZGxlTG9naW5BdHRlbXB0KGlzVmFsaWRQYXNzd29yZCk7XG4gICAgICAgIH0pXG4gICAgICAgIC50aGVuKCgpID0+IHtcbiAgICAgICAgICBpZiAoIWlzVmFsaWRQYXNzd29yZCkge1xuICAgICAgICAgICAgdGhyb3cgbmV3IFBhcnNlLkVycm9yKFBhcnNlLkVycm9yLk9CSkVDVF9OT1RfRk9VTkQsICdJbnZhbGlkIHVzZXJuYW1lL3Bhc3N3b3JkLicpO1xuICAgICAgICAgIH1cbiAgICAgICAgICAvLyBFbnN1cmUgdGhlIHVzZXIgaXNuJ3QgbG9ja2VkIG91dFxuICAgICAgICAgIC8vIEEgbG9ja2VkIG91dCB1c2VyIHdvbid0IGJlIGFibGUgdG8gbG9naW5cbiAgICAgICAgICAvLyBUbyBsb2NrIGEgdXNlciBvdXQsIGp1c3Qgc2V0IHRoZSBBQ0wgdG8gYG1hc3RlcktleWAgb25seSAgKHt9KS5cbiAgICAgICAgICAvLyBFbXB0eSBBQ0wgaXMgT0tcbiAgICAgICAgICBpZiAoIXJlcS5hdXRoLmlzTWFzdGVyICYmIHVzZXIuQUNMICYmIE9iamVjdC5rZXlzKHVzZXIuQUNMKS5sZW5ndGggPT0gMCkge1xuICAgICAgICAgICAgdGhyb3cgbmV3IFBhcnNlLkVycm9yKFBhcnNlLkVycm9yLk9CSkVDVF9OT1RfRk9VTkQsICdJbnZhbGlkIHVzZXJuYW1lL3Bhc3N3b3JkLicpO1xuICAgICAgICAgIH1cbiAgICAgICAgICBpZiAoXG4gICAgICAgICAgICByZXEuY29uZmlnLnZlcmlmeVVzZXJFbWFpbHMgJiZcbiAgICAgICAgICAgIHJlcS5jb25maWcucHJldmVudExvZ2luV2l0aFVudmVyaWZpZWRFbWFpbCAmJlxuICAgICAgICAgICAgIXVzZXIuZW1haWxWZXJpZmllZFxuICAgICAgICAgICkge1xuICAgICAgICAgICAgdGhyb3cgbmV3IFBhcnNlLkVycm9yKFBhcnNlLkVycm9yLkVNQUlMX05PVF9GT1VORCwgJ1VzZXIgZW1haWwgaXMgbm90IHZlcmlmaWVkLicpO1xuICAgICAgICAgIH1cblxuICAgICAgICAgIGRlbGV0ZSB1c2VyLnBhc3N3b3JkO1xuXG4gICAgICAgICAgLy8gU29tZXRpbWVzIHRoZSBhdXRoRGF0YSBzdGlsbCBoYXMgbnVsbCBvbiB0aGF0IGtleXNcbiAgICAgICAgICAvLyBodHRwczovL2dpdGh1Yi5jb20vcGFyc2UtY29tbXVuaXR5L3BhcnNlLXNlcnZlci9pc3N1ZXMvOTM1XG4gICAgICAgICAgaWYgKHVzZXIuYXV0aERhdGEpIHtcbiAgICAgICAgICAgIE9iamVjdC5rZXlzKHVzZXIuYXV0aERhdGEpLmZvckVhY2gocHJvdmlkZXIgPT4ge1xuICAgICAgICAgICAgICBpZiAodXNlci5hdXRoRGF0YVtwcm92aWRlcl0gPT09IG51bGwpIHtcbiAgICAgICAgICAgICAgICBkZWxldGUgdXNlci5hdXRoRGF0YVtwcm92aWRlcl07XG4gICAgICAgICAgICAgIH1cbiAgICAgICAgICAgIH0pO1xuICAgICAgICAgICAgaWYgKE9iamVjdC5rZXlzKHVzZXIuYXV0aERhdGEpLmxlbmd0aCA9PSAwKSB7XG4gICAgICAgICAgICAgIGRlbGV0ZSB1c2VyLmF1dGhEYXRhO1xuICAgICAgICAgICAgfVxuICAgICAgICAgIH1cblxuICAgICAgICAgIHJldHVybiByZXNvbHZlKHVzZXIpO1xuICAgICAgICB9KVxuICAgICAgICAuY2F0Y2goZXJyb3IgPT4ge1xuICAgICAgICAgIHJldHVybiByZWplY3QoZXJyb3IpO1xuICAgICAgICB9KTtcbiAgICB9KTtcbiAgfVxuXG4gIGhhbmRsZU1lKHJlcSkge1xuICAgIGlmICghcmVxLmluZm8gfHwgIXJlcS5pbmZvLnNlc3Npb25Ub2tlbikge1xuICAgICAgdGhyb3cgbmV3IFBhcnNlLkVycm9yKFBhcnNlLkVycm9yLklOVkFMSURfU0VTU0lPTl9UT0tFTiwgJ0ludmFsaWQgc2Vzc2lvbiB0b2tlbicpO1xuICAgIH1cbiAgICBjb25zdCBzZXNzaW9uVG9rZW4gPSByZXEuaW5mby5zZXNzaW9uVG9rZW47XG4gICAgcmV0dXJuIHJlc3RcbiAgICAgIC5maW5kKFxuICAgICAgICByZXEuY29uZmlnLFxuICAgICAgICBBdXRoLm1hc3RlcihyZXEuY29uZmlnKSxcbiAgICAgICAgJ19TZXNzaW9uJyxcbiAgICAgICAgeyBzZXNzaW9uVG9rZW4gfSxcbiAgICAgICAgeyBpbmNsdWRlOiAndXNlcicgfSxcbiAgICAgICAgcmVxLmluZm8uY2xpZW50U0RLLFxuICAgICAgICByZXEuaW5mby5jb250ZXh0XG4gICAgICApXG4gICAgICAudGhlbihyZXNwb25zZSA9PiB7XG4gICAgICAgIGlmICghcmVzcG9uc2UucmVzdWx0cyB8fCByZXNwb25zZS5yZXN1bHRzLmxlbmd0aCA9PSAwIHx8ICFyZXNwb25zZS5yZXN1bHRzWzBdLnVzZXIpIHtcbiAgICAgICAgICB0aHJvdyBuZXcgUGFyc2UuRXJyb3IoUGFyc2UuRXJyb3IuSU5WQUxJRF9TRVNTSU9OX1RPS0VOLCAnSW52YWxpZCBzZXNzaW9uIHRva2VuJyk7XG4gICAgICAgIH0gZWxzZSB7XG4gICAgICAgICAgY29uc3QgdXNlciA9IHJlc3BvbnNlLnJlc3VsdHNbMF0udXNlcjtcbiAgICAgICAgICAvLyBTZW5kIHRva2VuIGJhY2sgb24gdGhlIGxvZ2luLCBiZWNhdXNlIFNES3MgZXhwZWN0IHRoYXQuXG4gICAgICAgICAgdXNlci5zZXNzaW9uVG9rZW4gPSBzZXNzaW9uVG9rZW47XG5cbiAgICAgICAgICAvLyBSZW1vdmUgaGlkZGVuIHByb3BlcnRpZXMuXG4gICAgICAgICAgVXNlcnNSb3V0ZXIucmVtb3ZlSGlkZGVuUHJvcGVydGllcyh1c2VyKTtcblxuICAgICAgICAgIHJldHVybiB7IHJlc3BvbnNlOiB1c2VyIH07XG4gICAgICAgIH1cbiAgICAgIH0pO1xuICB9XG5cbiAgYXN5bmMgaGFuZGxlTG9nSW4ocmVxKSB7XG4gICAgY29uc3QgdXNlciA9IGF3YWl0IHRoaXMuX2F1dGhlbnRpY2F0ZVVzZXJGcm9tUmVxdWVzdChyZXEpO1xuXG4gICAgLy8gaGFuZGxlIHBhc3N3b3JkIGV4cGlyeSBwb2xpY3lcbiAgICBpZiAocmVxLmNvbmZpZy5wYXNzd29yZFBvbGljeSAmJiByZXEuY29uZmlnLnBhc3N3b3JkUG9saWN5Lm1heFBhc3N3b3JkQWdlKSB7XG4gICAgICBsZXQgY2hhbmdlZEF0ID0gdXNlci5fcGFzc3dvcmRfY2hhbmdlZF9hdDtcblxuICAgICAgaWYgKCFjaGFuZ2VkQXQpIHtcbiAgICAgICAgLy8gcGFzc3dvcmQgd2FzIGNyZWF0ZWQgYmVmb3JlIGV4cGlyeSBwb2xpY3kgd2FzIGVuYWJsZWQuXG4gICAgICAgIC8vIHNpbXBseSB1cGRhdGUgX1VzZXIgb2JqZWN0IHNvIHRoYXQgaXQgd2lsbCBzdGFydCBlbmZvcmNpbmcgZnJvbSBub3dcbiAgICAgICAgY2hhbmdlZEF0ID0gbmV3IERhdGUoKTtcbiAgICAgICAgcmVxLmNvbmZpZy5kYXRhYmFzZS51cGRhdGUoXG4gICAgICAgICAgJ19Vc2VyJyxcbiAgICAgICAgICB7IHVzZXJuYW1lOiB1c2VyLnVzZXJuYW1lIH0sXG4gICAgICAgICAgeyBfcGFzc3dvcmRfY2hhbmdlZF9hdDogUGFyc2UuX2VuY29kZShjaGFuZ2VkQXQpIH1cbiAgICAgICAgKTtcbiAgICAgIH0gZWxzZSB7XG4gICAgICAgIC8vIGNoZWNrIHdoZXRoZXIgdGhlIHBhc3N3b3JkIGhhcyBleHBpcmVkXG4gICAgICAgIGlmIChjaGFuZ2VkQXQuX190eXBlID09ICdEYXRlJykge1xuICAgICAgICAgIGNoYW5nZWRBdCA9IG5ldyBEYXRlKGNoYW5nZWRBdC5pc28pO1xuICAgICAgICB9XG4gICAgICAgIC8vIENhbGN1bGF0ZSB0aGUgZXhwaXJ5IHRpbWUuXG4gICAgICAgIGNvbnN0IGV4cGlyZXNBdCA9IG5ldyBEYXRlKFxuICAgICAgICAgIGNoYW5nZWRBdC5nZXRUaW1lKCkgKyA4NjQwMDAwMCAqIHJlcS5jb25maWcucGFzc3dvcmRQb2xpY3kubWF4UGFzc3dvcmRBZ2VcbiAgICAgICAgKTtcbiAgICAgICAgaWYgKGV4cGlyZXNBdCA8IG5ldyBEYXRlKCkpXG4gICAgICAgICAgLy8gZmFpbCBvZiBjdXJyZW50IHRpbWUgaXMgcGFzdCBwYXNzd29yZCBleHBpcnkgdGltZVxuICAgICAgICAgIHRocm93IG5ldyBQYXJzZS5FcnJvcihcbiAgICAgICAgICAgIFBhcnNlLkVycm9yLk9CSkVDVF9OT1RfRk9VTkQsXG4gICAgICAgICAgICAnWW91ciBwYXNzd29yZCBoYXMgZXhwaXJlZC4gUGxlYXNlIHJlc2V0IHlvdXIgcGFzc3dvcmQuJ1xuICAgICAgICAgICk7XG4gICAgICB9XG4gICAgfVxuXG4gICAgLy8gUmVtb3ZlIGhpZGRlbiBwcm9wZXJ0aWVzLlxuICAgIFVzZXJzUm91dGVyLnJlbW92ZUhpZGRlblByb3BlcnRpZXModXNlcik7XG5cbiAgICByZXEuY29uZmlnLmZpbGVzQ29udHJvbGxlci5leHBhbmRGaWxlc0luT2JqZWN0KHJlcS5jb25maWcsIHVzZXIpO1xuXG4gICAgLy8gQmVmb3JlIGxvZ2luIHRyaWdnZXI7IHRocm93cyBpZiBmYWlsdXJlXG4gICAgYXdhaXQgbWF5YmVSdW5UcmlnZ2VyKFxuICAgICAgVHJpZ2dlclR5cGVzLmJlZm9yZUxvZ2luLFxuICAgICAgcmVxLmF1dGgsXG4gICAgICBQYXJzZS5Vc2VyLmZyb21KU09OKE9iamVjdC5hc3NpZ24oeyBjbGFzc05hbWU6ICdfVXNlcicgfSwgdXNlcikpLFxuICAgICAgbnVsbCxcbiAgICAgIHJlcS5jb25maWdcbiAgICApO1xuXG4gICAgY29uc3QgeyBzZXNzaW9uRGF0YSwgY3JlYXRlU2Vzc2lvbiB9ID0gQXV0aC5jcmVhdGVTZXNzaW9uKHJlcS5jb25maWcsIHtcbiAgICAgIHVzZXJJZDogdXNlci5vYmplY3RJZCxcbiAgICAgIGNyZWF0ZWRXaXRoOiB7XG4gICAgICAgIGFjdGlvbjogJ2xvZ2luJyxcbiAgICAgICAgYXV0aFByb3ZpZGVyOiAncGFzc3dvcmQnLFxuICAgICAgfSxcbiAgICAgIGluc3RhbGxhdGlvbklkOiByZXEuaW5mby5pbnN0YWxsYXRpb25JZCxcbiAgICB9KTtcblxuICAgIHVzZXIuc2Vzc2lvblRva2VuID0gc2Vzc2lvbkRhdGEuc2Vzc2lvblRva2VuO1xuXG4gICAgYXdhaXQgY3JlYXRlU2Vzc2lvbigpO1xuXG4gICAgY29uc3QgYWZ0ZXJMb2dpblVzZXIgPSBQYXJzZS5Vc2VyLmZyb21KU09OKE9iamVjdC5hc3NpZ24oeyBjbGFzc05hbWU6ICdfVXNlcicgfSwgdXNlcikpO1xuICAgIG1heWJlUnVuVHJpZ2dlcihcbiAgICAgIFRyaWdnZXJUeXBlcy5hZnRlckxvZ2luLFxuICAgICAgeyAuLi5yZXEuYXV0aCwgdXNlcjogYWZ0ZXJMb2dpblVzZXIgfSxcbiAgICAgIGFmdGVyTG9naW5Vc2VyLFxuICAgICAgbnVsbCxcbiAgICAgIHJlcS5jb25maWdcbiAgICApO1xuXG4gICAgcmV0dXJuIHsgcmVzcG9uc2U6IHVzZXIgfTtcbiAgfVxuXG4gIGhhbmRsZVZlcmlmeVBhc3N3b3JkKHJlcSkge1xuICAgIHJldHVybiB0aGlzLl9hdXRoZW50aWNhdGVVc2VyRnJvbVJlcXVlc3QocmVxKVxuICAgICAgLnRoZW4odXNlciA9PiB7XG4gICAgICAgIC8vIFJlbW92ZSBoaWRkZW4gcHJvcGVydGllcy5cbiAgICAgICAgVXNlcnNSb3V0ZXIucmVtb3ZlSGlkZGVuUHJvcGVydGllcyh1c2VyKTtcblxuICAgICAgICByZXR1cm4geyByZXNwb25zZTogdXNlciB9O1xuICAgICAgfSlcbiAgICAgIC5jYXRjaChlcnJvciA9PiB7XG4gICAgICAgIHRocm93IGVycm9yO1xuICAgICAgfSk7XG4gIH1cblxuICBoYW5kbGVMb2dPdXQocmVxKSB7XG4gICAgY29uc3Qgc3VjY2VzcyA9IHsgcmVzcG9uc2U6IHt9IH07XG4gICAgaWYgKHJlcS5pbmZvICYmIHJlcS5pbmZvLnNlc3Npb25Ub2tlbikge1xuICAgICAgcmV0dXJuIHJlc3RcbiAgICAgICAgLmZpbmQoXG4gICAgICAgICAgcmVxLmNvbmZpZyxcbiAgICAgICAgICBBdXRoLm1hc3RlcihyZXEuY29uZmlnKSxcbiAgICAgICAgICAnX1Nlc3Npb24nLFxuICAgICAgICAgIHsgc2Vzc2lvblRva2VuOiByZXEuaW5mby5zZXNzaW9uVG9rZW4gfSxcbiAgICAgICAgICB1bmRlZmluZWQsXG4gICAgICAgICAgcmVxLmluZm8uY2xpZW50U0RLLFxuICAgICAgICAgIHJlcS5pbmZvLmNvbnRleHRcbiAgICAgICAgKVxuICAgICAgICAudGhlbihyZWNvcmRzID0+IHtcbiAgICAgICAgICBpZiAocmVjb3Jkcy5yZXN1bHRzICYmIHJlY29yZHMucmVzdWx0cy5sZW5ndGgpIHtcbiAgICAgICAgICAgIHJldHVybiByZXN0XG4gICAgICAgICAgICAgIC5kZWwoXG4gICAgICAgICAgICAgICAgcmVxLmNvbmZpZyxcbiAgICAgICAgICAgICAgICBBdXRoLm1hc3RlcihyZXEuY29uZmlnKSxcbiAgICAgICAgICAgICAgICAnX1Nlc3Npb24nLFxuICAgICAgICAgICAgICAgIHJlY29yZHMucmVzdWx0c1swXS5vYmplY3RJZCxcbiAgICAgICAgICAgICAgICByZXEuaW5mby5jb250ZXh0XG4gICAgICAgICAgICAgIClcbiAgICAgICAgICAgICAgLnRoZW4oKCkgPT4ge1xuICAgICAgICAgICAgICAgIHRoaXMuX3J1bkFmdGVyTG9nb3V0VHJpZ2dlcihyZXEsIHJlY29yZHMucmVzdWx0c1swXSk7XG4gICAgICAgICAgICAgICAgcmV0dXJuIFByb21pc2UucmVzb2x2ZShzdWNjZXNzKTtcbiAgICAgICAgICAgICAgfSk7XG4gICAgICAgICAgfVxuICAgICAgICAgIHJldHVybiBQcm9taXNlLnJlc29sdmUoc3VjY2Vzcyk7XG4gICAgICAgIH0pO1xuICAgIH1cbiAgICByZXR1cm4gUHJvbWlzZS5yZXNvbHZlKHN1Y2Nlc3MpO1xuICB9XG5cbiAgX3J1bkFmdGVyTG9nb3V0VHJpZ2dlcihyZXEsIHNlc3Npb24pIHtcbiAgICAvLyBBZnRlciBsb2dvdXQgdHJpZ2dlclxuICAgIG1heWJlUnVuVHJpZ2dlcihcbiAgICAgIFRyaWdnZXJUeXBlcy5hZnRlckxvZ291dCxcbiAgICAgIHJlcS5hdXRoLFxuICAgICAgUGFyc2UuU2Vzc2lvbi5mcm9tSlNPTihPYmplY3QuYXNzaWduKHsgY2xhc3NOYW1lOiAnX1Nlc3Npb24nIH0sIHNlc3Npb24pKSxcbiAgICAgIG51bGwsXG4gICAgICByZXEuY29uZmlnXG4gICAgKTtcbiAgfVxuXG4gIF90aHJvd09uQmFkRW1haWxDb25maWcocmVxKSB7XG4gICAgdHJ5IHtcbiAgICAgIENvbmZpZy52YWxpZGF0ZUVtYWlsQ29uZmlndXJhdGlvbih7XG4gICAgICAgIGVtYWlsQWRhcHRlcjogcmVxLmNvbmZpZy51c2VyQ29udHJvbGxlci5hZGFwdGVyLFxuICAgICAgICBhcHBOYW1lOiByZXEuY29uZmlnLmFwcE5hbWUsXG4gICAgICAgIHB1YmxpY1NlcnZlclVSTDogcmVxLmNvbmZpZy5wdWJsaWNTZXJ2ZXJVUkwsXG4gICAgICAgIGVtYWlsVmVyaWZ5VG9rZW5WYWxpZGl0eUR1cmF0aW9uOiByZXEuY29uZmlnLmVtYWlsVmVyaWZ5VG9rZW5WYWxpZGl0eUR1cmF0aW9uLFxuICAgICAgICBlbWFpbFZlcmlmeVRva2VuUmV1c2VJZlZhbGlkOiByZXEuY29uZmlnLmVtYWlsVmVyaWZ5VG9rZW5SZXVzZUlmVmFsaWQsXG4gICAgICB9KTtcbiAgICB9IGNhdGNoIChlKSB7XG4gICAgICBpZiAodHlwZW9mIGUgPT09ICdzdHJpbmcnKSB7XG4gICAgICAgIC8vIE1heWJlIHdlIG5lZWQgYSBCYWQgQ29uZmlndXJhdGlvbiBlcnJvciwgYnV0IHRoZSBTREtzIHdvbid0IHVuZGVyc3RhbmQgaXQuIEZvciBub3csIEludGVybmFsIFNlcnZlciBFcnJvci5cbiAgICAgICAgdGhyb3cgbmV3IFBhcnNlLkVycm9yKFxuICAgICAgICAgIFBhcnNlLkVycm9yLklOVEVSTkFMX1NFUlZFUl9FUlJPUixcbiAgICAgICAgICAnQW4gYXBwTmFtZSwgcHVibGljU2VydmVyVVJMLCBhbmQgZW1haWxBZGFwdGVyIGFyZSByZXF1aXJlZCBmb3IgcGFzc3dvcmQgcmVzZXQgYW5kIGVtYWlsIHZlcmlmaWNhdGlvbiBmdW5jdGlvbmFsaXR5LidcbiAgICAgICAgKTtcbiAgICAgIH0gZWxzZSB7XG4gICAgICAgIHRocm93IGU7XG4gICAgICB9XG4gICAgfVxuICB9XG5cbiAgaGFuZGxlUmVzZXRSZXF1ZXN0KHJlcSkge1xuICAgIHRoaXMuX3Rocm93T25CYWRFbWFpbENvbmZpZyhyZXEpO1xuXG4gICAgY29uc3QgeyBlbWFpbCB9ID0gcmVxLmJvZHk7XG4gICAgaWYgKCFlbWFpbCkge1xuICAgICAgdGhyb3cgbmV3IFBhcnNlLkVycm9yKFBhcnNlLkVycm9yLkVNQUlMX01JU1NJTkcsICd5b3UgbXVzdCBwcm92aWRlIGFuIGVtYWlsJyk7XG4gICAgfVxuICAgIGlmICh0eXBlb2YgZW1haWwgIT09ICdzdHJpbmcnKSB7XG4gICAgICB0aHJvdyBuZXcgUGFyc2UuRXJyb3IoXG4gICAgICAgIFBhcnNlLkVycm9yLklOVkFMSURfRU1BSUxfQUREUkVTUyxcbiAgICAgICAgJ3lvdSBtdXN0IHByb3ZpZGUgYSB2YWxpZCBlbWFpbCBzdHJpbmcnXG4gICAgICApO1xuICAgIH1cbiAgICBjb25zdCB1c2VyQ29udHJvbGxlciA9IHJlcS5jb25maWcudXNlckNvbnRyb2xsZXI7XG4gICAgcmV0dXJuIHVzZXJDb250cm9sbGVyLnNlbmRQYXNzd29yZFJlc2V0RW1haWwoZW1haWwpLnRoZW4oXG4gICAgICAoKSA9PiB7XG4gICAgICAgIHJldHVybiBQcm9taXNlLnJlc29sdmUoe1xuICAgICAgICAgIHJlc3BvbnNlOiB7fSxcbiAgICAgICAgfSk7XG4gICAgICB9LFxuICAgICAgZXJyID0+IHtcbiAgICAgICAgaWYgKGVyci5jb2RlID09PSBQYXJzZS5FcnJvci5PQkpFQ1RfTk9UX0ZPVU5EKSB7XG4gICAgICAgICAgLy8gUmV0dXJuIHN1Y2Nlc3Mgc28gdGhhdCB0aGlzIGVuZHBvaW50IGNhbid0XG4gICAgICAgICAgLy8gYmUgdXNlZCB0byBlbnVtZXJhdGUgdmFsaWQgZW1haWxzXG4gICAgICAgICAgcmV0dXJuIFByb21pc2UucmVzb2x2ZSh7XG4gICAgICAgICAgICByZXNwb25zZToge30sXG4gICAgICAgICAgfSk7XG4gICAgICAgIH0gZWxzZSB7XG4gICAgICAgICAgdGhyb3cgZXJyO1xuICAgICAgICB9XG4gICAgICB9XG4gICAgKTtcbiAgfVxuXG4gIGhhbmRsZVZlcmlmaWNhdGlvbkVtYWlsUmVxdWVzdChyZXEpIHtcbiAgICB0aGlzLl90aHJvd09uQmFkRW1haWxDb25maWcocmVxKTtcblxuICAgIGNvbnN0IHsgZW1haWwgfSA9IHJlcS5ib2R5O1xuICAgIGlmICghZW1haWwpIHtcbiAgICAgIHRocm93IG5ldyBQYXJzZS5FcnJvcihQYXJzZS5FcnJvci5FTUFJTF9NSVNTSU5HLCAneW91IG11c3QgcHJvdmlkZSBhbiBlbWFpbCcpO1xuICAgIH1cbiAgICBpZiAodHlwZW9mIGVtYWlsICE9PSAnc3RyaW5nJykge1xuICAgICAgdGhyb3cgbmV3IFBhcnNlLkVycm9yKFxuICAgICAgICBQYXJzZS5FcnJvci5JTlZBTElEX0VNQUlMX0FERFJFU1MsXG4gICAgICAgICd5b3UgbXVzdCBwcm92aWRlIGEgdmFsaWQgZW1haWwgc3RyaW5nJ1xuICAgICAgKTtcbiAgICB9XG5cbiAgICByZXR1cm4gcmVxLmNvbmZpZy5kYXRhYmFzZS5maW5kKCdfVXNlcicsIHsgZW1haWw6IGVtYWlsIH0pLnRoZW4ocmVzdWx0cyA9PiB7XG4gICAgICBpZiAoIXJlc3VsdHMubGVuZ3RoIHx8IHJlc3VsdHMubGVuZ3RoIDwgMSkge1xuICAgICAgICB0aHJvdyBuZXcgUGFyc2UuRXJyb3IoUGFyc2UuRXJyb3IuRU1BSUxfTk9UX0ZPVU5ELCBgTm8gdXNlciBmb3VuZCB3aXRoIGVtYWlsICR7ZW1haWx9YCk7XG4gICAgICB9XG4gICAgICBjb25zdCB1c2VyID0gcmVzdWx0c1swXTtcblxuICAgICAgLy8gcmVtb3ZlIHBhc3N3b3JkIGZpZWxkLCBtZXNzZXMgd2l0aCBzYXZpbmcgb24gcG9zdGdyZXNcbiAgICAgIGRlbGV0ZSB1c2VyLnBhc3N3b3JkO1xuXG4gICAgICBpZiAodXNlci5lbWFpbFZlcmlmaWVkKSB7XG4gICAgICAgIHRocm93IG5ldyBQYXJzZS5FcnJvcihQYXJzZS5FcnJvci5PVEhFUl9DQVVTRSwgYEVtYWlsICR7ZW1haWx9IGlzIGFscmVhZHkgdmVyaWZpZWQuYCk7XG4gICAgICB9XG5cbiAgICAgIGNvbnN0IHVzZXJDb250cm9sbGVyID0gcmVxLmNvbmZpZy51c2VyQ29udHJvbGxlcjtcbiAgICAgIHJldHVybiB1c2VyQ29udHJvbGxlci5yZWdlbmVyYXRlRW1haWxWZXJpZnlUb2tlbih1c2VyKS50aGVuKCgpID0+IHtcbiAgICAgICAgdXNlckNvbnRyb2xsZXIuc2VuZFZlcmlmaWNhdGlvbkVtYWlsKHVzZXIpO1xuICAgICAgICByZXR1cm4geyByZXNwb25zZToge30gfTtcbiAgICAgIH0pO1xuICAgIH0pO1xuICB9XG5cbiAgbW91bnRSb3V0ZXMoKSB7XG4gICAgdGhpcy5yb3V0ZSgnR0VUJywgJy91c2VycycsIHJlcSA9PiB7XG4gICAgICByZXR1cm4gdGhpcy5oYW5kbGVGaW5kKHJlcSk7XG4gICAgfSk7XG4gICAgdGhpcy5yb3V0ZSgnUE9TVCcsICcvdXNlcnMnLCBwcm9taXNlRW5zdXJlSWRlbXBvdGVuY3ksIHJlcSA9PiB7XG4gICAgICByZXR1cm4gdGhpcy5oYW5kbGVDcmVhdGUocmVxKTtcbiAgICB9KTtcbiAgICB0aGlzLnJvdXRlKCdHRVQnLCAnL3VzZXJzL21lJywgcmVxID0+IHtcbiAgICAgIHJldHVybiB0aGlzLmhhbmRsZU1lKHJlcSk7XG4gICAgfSk7XG4gICAgdGhpcy5yb3V0ZSgnR0VUJywgJy91c2Vycy86b2JqZWN0SWQnLCByZXEgPT4ge1xuICAgICAgcmV0dXJuIHRoaXMuaGFuZGxlR2V0KHJlcSk7XG4gICAgfSk7XG4gICAgdGhpcy5yb3V0ZSgnUFVUJywgJy91c2Vycy86b2JqZWN0SWQnLCBwcm9taXNlRW5zdXJlSWRlbXBvdGVuY3ksIHJlcSA9PiB7XG4gICAgICByZXR1cm4gdGhpcy5oYW5kbGVVcGRhdGUocmVxKTtcbiAgICB9KTtcbiAgICB0aGlzLnJvdXRlKCdERUxFVEUnLCAnL3VzZXJzLzpvYmplY3RJZCcsIHJlcSA9PiB7XG4gICAgICByZXR1cm4gdGhpcy5oYW5kbGVEZWxldGUocmVxKTtcbiAgICB9KTtcbiAgICB0aGlzLnJvdXRlKCdHRVQnLCAnL2xvZ2luJywgcmVxID0+IHtcbiAgICAgIHJldHVybiB0aGlzLmhhbmRsZUxvZ0luKHJlcSk7XG4gICAgfSk7XG4gICAgdGhpcy5yb3V0ZSgnUE9TVCcsICcvbG9naW4nLCByZXEgPT4ge1xuICAgICAgcmV0dXJuIHRoaXMuaGFuZGxlTG9nSW4ocmVxKTtcbiAgICB9KTtcbiAgICB0aGlzLnJvdXRlKCdQT1NUJywgJy9sb2dvdXQnLCByZXEgPT4ge1xuICAgICAgcmV0dXJuIHRoaXMuaGFuZGxlTG9nT3V0KHJlcSk7XG4gICAgfSk7XG4gICAgdGhpcy5yb3V0ZSgnUE9TVCcsICcvcmVxdWVzdFBhc3N3b3JkUmVzZXQnLCByZXEgPT4ge1xuICAgICAgcmV0dXJuIHRoaXMuaGFuZGxlUmVzZXRSZXF1ZXN0KHJlcSk7XG4gICAgfSk7XG4gICAgdGhpcy5yb3V0ZSgnUE9TVCcsICcvdmVyaWZpY2F0aW9uRW1haWxSZXF1ZXN0JywgcmVxID0+IHtcbiAgICAgIHJldHVybiB0aGlzLmhhbmRsZVZlcmlmaWNhdGlvbkVtYWlsUmVxdWVzdChyZXEpO1xuICAgIH0pO1xuICAgIHRoaXMucm91dGUoJ0dFVCcsICcvdmVyaWZ5UGFzc3dvcmQnLCByZXEgPT4ge1xuICAgICAgcmV0dXJuIHRoaXMuaGFuZGxlVmVyaWZ5UGFzc3dvcmQocmVxKTtcbiAgICB9KTtcbiAgfVxufVxuXG5leHBvcnQgZGVmYXVsdCBVc2Vyc1JvdXRlcjtcbiJdfQ==