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
  /**
   * Validates JWT bearer token and looks up user `req.userFromJWT`. CRITICALLY IMPORTANT that the JWT has already been validated by this point (eg: express middleware, AWS API Gateway Authorizer)
   * @param {Object} req The request
   * @returns {Object} User object
   */


  _authenticateUserFromRequestWithJwt(req) {
    return new Promise((resolve, reject) => {
      if (!req.userFromJWT) {
        throw new _node.default.Error(_node.default.Error.OBJECT_NOT_FOUND, 'Invalid credentials.');
      }

      const query = {
        objectId: req.userFromJWT.id
      };
      return req.config.database.find('_User', query).then(results => {
        if (!results.length) throw new _node.default.Error(_node.default.Error.OBJECT_NOT_FOUND, 'Invalid credentials.');
        const user = results[0];
        resolve(user);
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
    let userFromJWT;

    if (req.userFromJWT) {
      // Could be just used `req.userFromJWT`, but the forced lookup
      // Ensures the user hasn't been deleted since the the JWT was granted
      userFromJWT = await this._authenticateUserFromRequestWithJwt(req);
    }

    const user = userFromJWT || (await this._authenticateUserFromRequest(req)); // handle password expiry policy - ignore if user is managed in SSO (provided by JWT)

    if (!userFromJWT && req.config.passwordPolicy && req.config.passwordPolicy.maxPasswordAge) {
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
//# sourceMappingURL=data:application/json;charset=utf-8;base64,eyJ2ZXJzaW9uIjozLCJzb3VyY2VzIjpbIi4uLy4uL3NyYy9Sb3V0ZXJzL1VzZXJzUm91dGVyLmpzIl0sIm5hbWVzIjpbIlVzZXJzUm91dGVyIiwiQ2xhc3Nlc1JvdXRlciIsImNsYXNzTmFtZSIsInJlbW92ZUhpZGRlblByb3BlcnRpZXMiLCJvYmoiLCJrZXkiLCJPYmplY3QiLCJwcm90b3R5cGUiLCJoYXNPd25Qcm9wZXJ0eSIsImNhbGwiLCJ0ZXN0IiwiX2F1dGhlbnRpY2F0ZVVzZXJGcm9tUmVxdWVzdCIsInJlcSIsIlByb21pc2UiLCJyZXNvbHZlIiwicmVqZWN0IiwicGF5bG9hZCIsImJvZHkiLCJ1c2VybmFtZSIsInF1ZXJ5IiwiZW1haWwiLCJwYXNzd29yZCIsIlBhcnNlIiwiRXJyb3IiLCJVU0VSTkFNRV9NSVNTSU5HIiwiUEFTU1dPUkRfTUlTU0lORyIsIk9CSkVDVF9OT1RfRk9VTkQiLCJ1c2VyIiwiaXNWYWxpZFBhc3N3b3JkIiwiJG9yIiwiY29uZmlnIiwiZGF0YWJhc2UiLCJmaW5kIiwidGhlbiIsInJlc3VsdHMiLCJsZW5ndGgiLCJsb2dnZXJDb250cm9sbGVyIiwid2FybiIsImZpbHRlciIsInBhc3N3b3JkQ3J5cHRvIiwiY29tcGFyZSIsImNvcnJlY3QiLCJhY2NvdW50TG9ja291dFBvbGljeSIsIkFjY291bnRMb2Nrb3V0IiwiaGFuZGxlTG9naW5BdHRlbXB0IiwiYXV0aCIsImlzTWFzdGVyIiwiQUNMIiwia2V5cyIsInZlcmlmeVVzZXJFbWFpbHMiLCJwcmV2ZW50TG9naW5XaXRoVW52ZXJpZmllZEVtYWlsIiwiZW1haWxWZXJpZmllZCIsIkVNQUlMX05PVF9GT1VORCIsImF1dGhEYXRhIiwiZm9yRWFjaCIsInByb3ZpZGVyIiwiY2F0Y2giLCJlcnJvciIsIl9hdXRoZW50aWNhdGVVc2VyRnJvbVJlcXVlc3RXaXRoSnd0IiwidXNlckZyb21KV1QiLCJvYmplY3RJZCIsImlkIiwiaGFuZGxlTWUiLCJpbmZvIiwic2Vzc2lvblRva2VuIiwiSU5WQUxJRF9TRVNTSU9OX1RPS0VOIiwicmVzdCIsIkF1dGgiLCJtYXN0ZXIiLCJpbmNsdWRlIiwiY2xpZW50U0RLIiwiY29udGV4dCIsInJlc3BvbnNlIiwiaGFuZGxlTG9nSW4iLCJwYXNzd29yZFBvbGljeSIsIm1heFBhc3N3b3JkQWdlIiwiY2hhbmdlZEF0IiwiX3Bhc3N3b3JkX2NoYW5nZWRfYXQiLCJEYXRlIiwidXBkYXRlIiwiX2VuY29kZSIsIl9fdHlwZSIsImlzbyIsImV4cGlyZXNBdCIsImdldFRpbWUiLCJmaWxlc0NvbnRyb2xsZXIiLCJleHBhbmRGaWxlc0luT2JqZWN0IiwiVHJpZ2dlclR5cGVzIiwiYmVmb3JlTG9naW4iLCJVc2VyIiwiZnJvbUpTT04iLCJhc3NpZ24iLCJzZXNzaW9uRGF0YSIsImNyZWF0ZVNlc3Npb24iLCJ1c2VySWQiLCJjcmVhdGVkV2l0aCIsImFjdGlvbiIsImF1dGhQcm92aWRlciIsImluc3RhbGxhdGlvbklkIiwiYWZ0ZXJMb2dpblVzZXIiLCJhZnRlckxvZ2luIiwiaGFuZGxlVmVyaWZ5UGFzc3dvcmQiLCJoYW5kbGVMb2dPdXQiLCJzdWNjZXNzIiwidW5kZWZpbmVkIiwicmVjb3JkcyIsImRlbCIsIl9ydW5BZnRlckxvZ291dFRyaWdnZXIiLCJzZXNzaW9uIiwiYWZ0ZXJMb2dvdXQiLCJTZXNzaW9uIiwiX3Rocm93T25CYWRFbWFpbENvbmZpZyIsIkNvbmZpZyIsInZhbGlkYXRlRW1haWxDb25maWd1cmF0aW9uIiwiZW1haWxBZGFwdGVyIiwidXNlckNvbnRyb2xsZXIiLCJhZGFwdGVyIiwiYXBwTmFtZSIsInB1YmxpY1NlcnZlclVSTCIsImVtYWlsVmVyaWZ5VG9rZW5WYWxpZGl0eUR1cmF0aW9uIiwiZW1haWxWZXJpZnlUb2tlblJldXNlSWZWYWxpZCIsImUiLCJJTlRFUk5BTF9TRVJWRVJfRVJST1IiLCJoYW5kbGVSZXNldFJlcXVlc3QiLCJFTUFJTF9NSVNTSU5HIiwiSU5WQUxJRF9FTUFJTF9BRERSRVNTIiwic2VuZFBhc3N3b3JkUmVzZXRFbWFpbCIsImVyciIsImNvZGUiLCJoYW5kbGVWZXJpZmljYXRpb25FbWFpbFJlcXVlc3QiLCJPVEhFUl9DQVVTRSIsInJlZ2VuZXJhdGVFbWFpbFZlcmlmeVRva2VuIiwic2VuZFZlcmlmaWNhdGlvbkVtYWlsIiwibW91bnRSb3V0ZXMiLCJyb3V0ZSIsImhhbmRsZUZpbmQiLCJwcm9taXNlRW5zdXJlSWRlbXBvdGVuY3kiLCJoYW5kbGVDcmVhdGUiLCJoYW5kbGVHZXQiLCJoYW5kbGVVcGRhdGUiLCJoYW5kbGVEZWxldGUiXSwibWFwcGluZ3MiOiI7Ozs7Ozs7QUFFQTs7QUFDQTs7QUFDQTs7QUFDQTs7QUFDQTs7QUFDQTs7QUFDQTs7QUFDQTs7QUFDQTs7Ozs7Ozs7OztBQUVPLE1BQU1BLFdBQU4sU0FBMEJDLHNCQUExQixDQUF3QztBQUM3Q0MsRUFBQUEsU0FBUyxHQUFHO0FBQ1YsV0FBTyxPQUFQO0FBQ0Q7QUFFRDtBQUNGO0FBQ0E7QUFDQTs7O0FBQ0UsU0FBT0Msc0JBQVAsQ0FBOEJDLEdBQTlCLEVBQW1DO0FBQ2pDLFNBQUssSUFBSUMsR0FBVCxJQUFnQkQsR0FBaEIsRUFBcUI7QUFDbkIsVUFBSUUsTUFBTSxDQUFDQyxTQUFQLENBQWlCQyxjQUFqQixDQUFnQ0MsSUFBaEMsQ0FBcUNMLEdBQXJDLEVBQTBDQyxHQUExQyxDQUFKLEVBQW9EO0FBQ2xEO0FBQ0EsWUFBSUEsR0FBRyxLQUFLLFFBQVIsSUFBb0IsQ0FBQywwQkFBMEJLLElBQTFCLENBQStCTCxHQUEvQixDQUF6QixFQUE4RDtBQUM1RCxpQkFBT0QsR0FBRyxDQUFDQyxHQUFELENBQVY7QUFDRDtBQUNGO0FBQ0Y7QUFDRjtBQUVEO0FBQ0Y7QUFDQTtBQUNBO0FBQ0E7QUFDQTs7O0FBQ0VNLEVBQUFBLDRCQUE0QixDQUFDQyxHQUFELEVBQU07QUFDaEMsV0FBTyxJQUFJQyxPQUFKLENBQVksQ0FBQ0MsT0FBRCxFQUFVQyxNQUFWLEtBQXFCO0FBQ3RDO0FBQ0EsVUFBSUMsT0FBTyxHQUFHSixHQUFHLENBQUNLLElBQWxCOztBQUNBLFVBQ0csQ0FBQ0QsT0FBTyxDQUFDRSxRQUFU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RUFBbUIsUUFBbkIsRUFBNkIxSCxHQUFHLElBQUk7QUFDbEMsYUFBTyxLQUFLNkQsV0FBTCxDQUFpQjdELEdBQWpCLENBQVA7QUFDRCxLQUZEO0FBR0EsU0FBSzBILEtBQUwsQ0FBVyxNQUFYLEVBQW1CLFNBQW5CLEVBQThCMUgsR0FBRyxJQUFJO0FBQ25DLGFBQU8sS0FBSzBGLFlBQUwsQ0FBa0IxRixHQUFsQixDQUFQO0FBQ0QsS0FGRDtBQUdBLFNBQUswSCxLQUFMLENBQVcsTUFBWCxFQUFtQix1QkFBbkIsRUFBNEMxSCxHQUFHLElBQUk7QUFDakQsYUFBTyxLQUFLK0csa0JBQUwsQ0FBd0IvRyxHQUF4QixDQUFQO0FBQ0QsS0FGRDtBQUdBLFNBQUswSCxLQUFMLENBQVcsTUFBWCxFQUFtQiwyQkFBbkIsRUFBZ0QxSCxHQUFHLElBQUk7QUFDckQsYUFBTyxLQUFLcUgsOEJBQUwsQ0FBb0NySCxHQUFwQyxDQUFQO0FBQ0QsS0FGRDtBQUdBLFNBQUswSCxLQUFMLENBQVcsS0FBWCxFQUFrQixpQkFBbEIsRUFBcUMxSCxHQUFHLElBQUk7QUFDMUMsYUFBTyxLQUFLeUYsb0JBQUwsQ0FBMEJ6RixHQUExQixDQUFQO0FBQ0QsS0FGRDtBQUdEOztBQXRjNEM7OztlQXljaENaLFciLCJzb3VyY2VzQ29udGVudCI6WyIvLyBUaGVzZSBtZXRob2RzIGhhbmRsZSB0aGUgVXNlci1yZWxhdGVkIHJvdXRlcy5cblxuaW1wb3J0IFBhcnNlIGZyb20gJ3BhcnNlL25vZGUnO1xuaW1wb3J0IENvbmZpZyBmcm9tICcuLi9Db25maWcnO1xuaW1wb3J0IEFjY291bnRMb2Nrb3V0IGZyb20gJy4uL0FjY291bnRMb2Nrb3V0JztcbmltcG9ydCBDbGFzc2VzUm91dGVyIGZyb20gJy4vQ2xhc3Nlc1JvdXRlcic7XG5pbXBvcnQgcmVzdCBmcm9tICcuLi9yZXN0JztcbmltcG9ydCBBdXRoIGZyb20gJy4uL0F1dGgnO1xuaW1wb3J0IHBhc3N3b3JkQ3J5cHRvIGZyb20gJy4uL3Bhc3N3b3JkJztcbmltcG9ydCB7IG1heWJlUnVuVHJpZ2dlciwgVHlwZXMgYXMgVHJpZ2dlclR5cGVzIH0gZnJvbSAnLi4vdHJpZ2dlcnMnO1xuaW1wb3J0IHsgcHJvbWlzZUVuc3VyZUlkZW1wb3RlbmN5IH0gZnJvbSAnLi4vbWlkZGxld2FyZXMnO1xuXG5leHBvcnQgY2xhc3MgVXNlcnNSb3V0ZXIgZXh0ZW5kcyBDbGFzc2VzUm91dGVyIHtcbiAgY2xhc3NOYW1lKCkge1xuICAgIHJldHVybiAnX1VzZXInO1xuICB9XG5cbiAgLyoqXG4gICAqIFJlbW92ZXMgYWxsIFwiX1wiIHByZWZpeGVkIHByb3BlcnRpZXMgZnJvbSBhbiBvYmplY3QsIGV4Y2VwdCBcIl9fdHlwZVwiXG4gICAqIEBwYXJhbSB7T2JqZWN0fSBvYmogQW4gb2JqZWN0LlxuICAgKi9cbiAgc3RhdGljIHJlbW92ZUhpZGRlblByb3BlcnRpZXMob2JqKSB7XG4gICAgZm9yICh2YXIga2V5IGluIG9iaikge1xuICAgICAgaWYgKE9iamVjdC5wcm90b3R5cGUuaGFzT3duUHJvcGVydHkuY2FsbChvYmosIGtleSkpIHtcbiAgICAgICAgLy8gUmVnZXhwIGNvbWVzIGZyb20gUGFyc2UuT2JqZWN0LnByb3RvdHlwZS52YWxpZGF0ZVxuICAgICAgICBpZiAoa2V5ICE9PSAnX190eXBlJyAmJiAhL15bQS1aYS16XVswLTlBLVphLXpfXSokLy50ZXN0KGtleSkpIHtcbiAgICAgICAgICBkZWxldGUgb2JqW2tleV07XG4gICAgICAgIH1cbiAgICAgIH1cbiAgICB9XG4gIH1cblxuICAvKipcbiAgICogVmFsaWRhdGVzIGEgcGFzc3dvcmQgcmVxdWVzdCBpbiBsb2dpbiBhbmQgdmVyaWZ5UGFzc3dvcmRcbiAgICogQHBhcmFtIHtPYmplY3R9IHJlcSBUaGUgcmVxdWVzdFxuICAgKiBAcmV0dXJucyB7T2JqZWN0fSBVc2VyIG9iamVjdFxuICAgKiBAcHJpdmF0ZVxuICAgKi9cbiAgX2F1dGhlbnRpY2F0ZVVzZXJGcm9tUmVxdWVzdChyZXEpIHtcbiAgICByZXR1cm4gbmV3IFByb21pc2UoKHJlc29sdmUsIHJlamVjdCkgPT4ge1xuICAgICAgLy8gVXNlIHF1ZXJ5IHBhcmFtZXRlcnMgaW5zdGVhZCBpZiBwcm92aWRlZCBpbiB1cmxcbiAgICAgIGxldCBwYXlsb2FkID0gcmVxLmJvZHk7XG4gICAgICBpZiAoXG4gICAgICAgICghcGF5bG9hZC51c2VybmFtZSAmJiByZXEucXVlcnkgJiYgcmVxLnF1ZXJ5LnVzZXJuYW1lKSB8fFxuICAgICAgICAoIXBheWxvYWQuZW1haWwgJiYgcmVxLnF1ZXJ5ICYmIHJlcS5xdWVyeS5lbWFpbClcbiAgICAgICkge1xuICAgICAgICBwYXlsb2FkID0gcmVxLnF1ZXJ5O1xuICAgICAgfVxuICAgICAgY29uc3QgeyB1c2VybmFtZSwgZW1haWwsIHBhc3N3b3JkIH0gPSBwYXlsb2FkO1xuXG4gICAgICAvLyBUT0RPOiB1c2UgdGhlIHJpZ2h0IGVycm9yIGNvZGVzIC8gZGVzY3JpcHRpb25zLlxuICAgICAgaWYgKCF1c2VybmFtZSAmJiAhZW1haWwpIHtcbiAgICAgICAgdGhyb3cgbmV3IFBhcnNlLkVycm9yKFBhcnNlLkVycm9yLlVTRVJOQU1FX01JU1NJTkcsICd1c2VybmFtZS9lbWFpbCBpcyByZXF1aXJlZC4nKTtcbiAgICAgIH1cbiAgICAgIGlmICghcGFzc3dvcmQpIHtcbiAgICAgICAgdGhyb3cgbmV3IFBhcnNlLkVycm9yKFBhcnNlLkVycm9yLlBBU1NXT1JEX01JU1NJTkcsICdwYXNzd29yZCBpcyByZXF1aXJlZC4nKTtcbiAgICAgIH1cbiAgICAgIGlmIChcbiAgICAgICAgdHlwZW9mIHBhc3N3b3JkICE9PSAnc3RyaW5nJyB8fFxuICAgICAgICAoZW1haWwgJiYgdHlwZW9mIGVtYWlsICE9PSAnc3RyaW5nJykgfHxcbiAgICAgICAgKHVzZXJuYW1lICYmIHR5cGVvZiB1c2VybmFtZSAhPT0gJ3N0cmluZycpXG4gICAgICApIHtcbiAgICAgICAgdGhyb3cgbmV3IFBhcnNlLkVycm9yKFBhcnNlLkVycm9yLk9CSkVDVF9OT1RfRk9VTkQsICdJbnZhbGlkIHVzZXJuYW1lL3Bhc3N3b3JkLicpO1xuICAgICAgfVxuXG4gICAgICBsZXQgdXNlcjtcbiAgICAgIGxldCBpc1ZhbGlkUGFzc3dvcmQgPSBmYWxzZTtcbiAgICAgIGxldCBxdWVyeTtcbiAgICAgIGlmIChlbWFpbCAmJiB1c2VybmFtZSkge1xuICAgICAgICBxdWVyeSA9IHsgZW1haWwsIHVzZXJuYW1lIH07XG4gICAgICB9IGVsc2UgaWYgKGVtYWlsKSB7XG4gICAgICAgIHF1ZXJ5ID0geyBlbWFpbCB9O1xuICAgICAgfSBlbHNlIHtcbiAgICAgICAgcXVlcnkgPSB7ICRvcjogW3sgdXNlcm5hbWUgfSwgeyBlbWFpbDogdXNlcm5hbWUgfV0gfTtcbiAgICAgIH1cbiAgICAgIHJldHVybiByZXEuY29uZmlnLmRhdGFiYXNlXG4gICAgICAgIC5maW5kKCdfVXNlcicsIHF1ZXJ5KVxuICAgICAgICAudGhlbihyZXN1bHRzID0+IHtcbiAgICAgICAgICBpZiAoIXJlc3VsdHMubGVuZ3RoKSB7XG4gICAgICAgICAgICB0aHJvdyBuZXcgUGFyc2UuRXJyb3IoUGFyc2UuRXJyb3IuT0JKRUNUX05PVF9GT1VORCwgJ0ludmFsaWQgdXNlcm5hbWUvcGFzc3dvcmQuJyk7XG4gICAgICAgICAgfVxuXG4gICAgICAgICAgaWYgKHJlc3VsdHMubGVuZ3RoID4gMSkge1xuICAgICAgICAgICAgLy8gY29ybmVyIGNhc2Ugd2hlcmUgdXNlcjEgaGFzIHVzZXJuYW1lID09IHVzZXIyIGVtYWlsXG4gICAgICAgICAgICByZXEuY29uZmlnLmxvZ2dlckNvbnRyb2xsZXIud2FybihcbiAgICAgICAgICAgICAgXCJUaGVyZSBpcyBhIHVzZXIgd2hpY2ggZW1haWwgaXMgdGhlIHNhbWUgYXMgYW5vdGhlciB1c2VyJ3MgdXNlcm5hbWUsIGxvZ2dpbmcgaW4gYmFzZWQgb24gdXNlcm5hbWVcIlxuICAgICAgICAgICAgKTtcbiAgICAgICAgICAgIHVzZXIgPSByZXN1bHRzLmZpbHRlcih1c2VyID0+IHVzZXIudXNlcm5hbWUgPT09IHVzZXJuYW1lKVswXTtcbiAgICAgICAgICB9IGVsc2Uge1xuICAgICAgICAgICAgdXNlciA9IHJlc3VsdHNbMF07XG4gICAgICAgICAgfVxuXG4gICAgICAgICAgcmV0dXJuIHBhc3N3b3JkQ3J5cHRvLmNvbXBhcmUocGFzc3dvcmQsIHVzZXIucGFzc3dvcmQpO1xuICAgICAgICB9KVxuICAgICAgICAudGhlbihjb3JyZWN0ID0+IHtcbiAgICAgICAgICBpc1ZhbGlkUGFzc3dvcmQgPSBjb3JyZWN0O1xuICAgICAgICAgIGNvbnN0IGFjY291bnRMb2Nrb3V0UG9saWN5ID0gbmV3IEFjY291bnRMb2Nrb3V0KHVzZXIsIHJlcS5jb25maWcpO1xuICAgICAgICAgIHJldHVybiBhY2NvdW50TG9ja291dFBvbGljeS5oYW5kbGVMb2dpbkF0dGVtcHQoaXNWYWxpZFBhc3N3b3JkKTtcbiAgICAgICAgfSlcbiAgICAgICAgLnRoZW4oKCkgPT4ge1xuICAgICAgICAgIGlmICghaXNWYWxpZFBhc3N3b3JkKSB7XG4gICAgICAgICAgICB0aHJvdyBuZXcgUGFyc2UuRXJyb3IoUGFyc2UuRXJyb3IuT0JKRUNUX05PVF9GT1VORCwgJ0ludmFsaWQgdXNlcm5hbWUvcGFzc3dvcmQuJyk7XG4gICAgICAgICAgfVxuICAgICAgICAgIC8vIEVuc3VyZSB0aGUgdXNlciBpc24ndCBsb2NrZWQgb3V0XG4gICAgICAgICAgLy8gQSBsb2NrZWQgb3V0IHVzZXIgd29uJ3QgYmUgYWJsZSB0byBsb2dpblxuICAgICAgICAgIC8vIFRvIGxvY2sgYSB1c2VyIG91dCwganVzdCBzZXQgdGhlIEFDTCB0byBgbWFzdGVyS2V5YCBvbmx5ICAoe30pLlxuICAgICAgICAgIC8vIEVtcHR5IEFDTCBpcyBPS1xuICAgICAgICAgIGlmICghcmVxLmF1dGguaXNNYXN0ZXIgJiYgdXNlci5BQ0wgJiYgT2JqZWN0LmtleXModXNlci5BQ0wpLmxlbmd0aCA9PSAwKSB7XG4gICAgICAgICAgICB0aHJvdyBuZXcgUGFyc2UuRXJyb3IoUGFyc2UuRXJyb3IuT0JKRUNUX05PVF9GT1VORCwgJ0ludmFsaWQgdXNlcm5hbWUvcGFzc3dvcmQuJyk7XG4gICAgICAgICAgfVxuICAgICAgICAgIGlmIChcbiAgICAgICAgICAgIHJlcS5jb25maWcudmVyaWZ5VXNlckVtYWlscyAmJlxuICAgICAgICAgICAgcmVxLmNvbmZpZy5wcmV2ZW50TG9naW5XaXRoVW52ZXJpZmllZEVtYWlsICYmXG4gICAgICAgICAgICAhdXNlci5lbWFpbFZlcmlmaWVkXG4gICAgICAgICAgKSB7XG4gICAgICAgICAgICB0aHJvdyBuZXcgUGFyc2UuRXJyb3IoUGFyc2UuRXJyb3IuRU1BSUxfTk9UX0ZPVU5ELCAnVXNlciBlbWFpbCBpcyBub3QgdmVyaWZpZWQuJyk7XG4gICAgICAgICAgfVxuXG4gICAgICAgICAgZGVsZXRlIHVzZXIucGFzc3dvcmQ7XG5cbiAgICAgICAgICAvLyBTb21ldGltZXMgdGhlIGF1dGhEYXRhIHN0aWxsIGhhcyBudWxsIG9uIHRoYXQga2V5c1xuICAgICAgICAgIC8vIGh0dHBzOi8vZ2l0aHViLmNvbS9wYXJzZS1jb21tdW5pdHkvcGFyc2Utc2VydmVyL2lzc3Vlcy85MzVcbiAgICAgICAgICBpZiAodXNlci5hdXRoRGF0YSkge1xuICAgICAgICAgICAgT2JqZWN0LmtleXModXNlci5hdXRoRGF0YSkuZm9yRWFjaChwcm92aWRlciA9PiB7XG4gICAgICAgICAgICAgIGlmICh1c2VyLmF1dGhEYXRhW3Byb3ZpZGVyXSA9PT0gbnVsbCkge1xuICAgICAgICAgICAgICAgIGRlbGV0ZSB1c2VyLmF1dGhEYXRhW3Byb3ZpZGVyXTtcbiAgICAgICAgICAgICAgfVxuICAgICAgICAgICAgfSk7XG4gICAgICAgICAgICBpZiAoT2JqZWN0LmtleXModXNlci5hdXRoRGF0YSkubGVuZ3RoID09IDApIHtcbiAgICAgICAgICAgICAgZGVsZXRlIHVzZXIuYXV0aERhdGE7XG4gICAgICAgICAgICB9XG4gICAgICAgICAgfVxuXG4gICAgICAgICAgcmV0dXJuIHJlc29sdmUodXNlcik7XG4gICAgICAgIH0pXG4gICAgICAgIC5jYXRjaChlcnJvciA9PiB7XG4gICAgICAgICAgcmV0dXJuIHJlamVjdChlcnJvcik7XG4gICAgICAgIH0pO1xuICAgIH0pO1xuICB9XG5cbiAgLyoqXG4gICAqIFZhbGlkYXRlcyBKV1QgYmVhcmVyIHRva2VuIGFuZCBsb29rcyB1cCB1c2VyIGByZXEudXNlckZyb21KV1RgLiBDUklUSUNBTExZIElNUE9SVEFOVCB0aGF0IHRoZSBKV1QgaGFzIGFscmVhZHkgYmVlbiB2YWxpZGF0ZWQgYnkgdGhpcyBwb2ludCAoZWc6IGV4cHJlc3MgbWlkZGxld2FyZSwgQVdTIEFQSSBHYXRld2F5IEF1dGhvcml6ZXIpXG4gICAqIEBwYXJhbSB7T2JqZWN0fSByZXEgVGhlIHJlcXVlc3RcbiAgICogQHJldHVybnMge09iamVjdH0gVXNlciBvYmplY3RcbiAgICovXG4gIF9hdXRoZW50aWNhdGVVc2VyRnJvbVJlcXVlc3RXaXRoSnd0KHJlcSkge1xuICAgIHJldHVybiBuZXcgUHJvbWlzZSgocmVzb2x2ZSwgcmVqZWN0KSA9PiB7XG4gICAgICBpZiAoIXJlcS51c2VyRnJvbUpXVCkge1xuICAgICAgICB0aHJvdyBuZXcgUGFyc2UuRXJyb3IoUGFyc2UuRXJyb3IuT0JKRUNUX05PVF9GT1VORCwgJ0ludmFsaWQgY3JlZGVudGlhbHMuJyk7XG4gICAgICB9XG5cbiAgICAgIGNvbnN0IHF1ZXJ5ID0ge1xuICAgICAgICBvYmplY3RJZDogcmVxLnVzZXJGcm9tSldULmlkLFxuICAgICAgfTtcbiAgICAgIHJldHVybiByZXEuY29uZmlnLmRhdGFiYXNlXG4gICAgICAgIC5maW5kKCdfVXNlcicsIHF1ZXJ5KVxuICAgICAgICAudGhlbihyZXN1bHRzID0+IHtcbiAgICAgICAgICBpZiAoIXJlc3VsdHMubGVuZ3RoKVxuICAgICAgICAgICAgdGhyb3cgbmV3IFBhcnNlLkVycm9yKFBhcnNlLkVycm9yLk9CSkVDVF9OT1RfRk9VTkQsICdJbnZhbGlkIGNyZWRlbnRpYWxzLicpO1xuICAgICAgICAgIGNvbnN0IHVzZXIgPSByZXN1bHRzWzBdO1xuICAgICAgICAgIHJlc29sdmUodXNlcik7XG4gICAgICAgIH0pXG4gICAgICAgIC5jYXRjaChlcnJvciA9PiB7XG4gICAgICAgICAgcmV0dXJuIHJlamVjdChlcnJvcik7XG4gICAgICAgIH0pO1xuICAgIH0pO1xuICB9XG5cbiAgaGFuZGxlTWUocmVxKSB7XG4gICAgaWYgKCFyZXEuaW5mbyB8fCAhcmVxLmluZm8uc2Vzc2lvblRva2VuKSB7XG4gICAgICB0aHJvdyBuZXcgUGFyc2UuRXJyb3IoUGFyc2UuRXJyb3IuSU5WQUxJRF9TRVNTSU9OX1RPS0VOLCAnSW52YWxpZCBzZXNzaW9uIHRva2VuJyk7XG4gICAgfVxuICAgIGNvbnN0IHNlc3Npb25Ub2tlbiA9IHJlcS5pbmZvLnNlc3Npb25Ub2tlbjtcbiAgICByZXR1cm4gcmVzdFxuICAgICAgLmZpbmQoXG4gICAgICAgIHJlcS5jb25maWcsXG4gICAgICAgIEF1dGgubWFzdGVyKHJlcS5jb25maWcpLFxuICAgICAgICAnX1Nlc3Npb24nLFxuICAgICAgICB7IHNlc3Npb25Ub2tlbiB9LFxuICAgICAgICB7IGluY2x1ZGU6ICd1c2VyJyB9LFxuICAgICAgICByZXEuaW5mby5jbGllbnRTREssXG4gICAgICAgIHJlcS5pbmZvLmNvbnRleHRcbiAgICAgIClcbiAgICAgIC50aGVuKHJlc3BvbnNlID0+IHtcbiAgICAgICAgaWYgKCFyZXNwb25zZS5yZXN1bHRzIHx8IHJlc3BvbnNlLnJlc3VsdHMubGVuZ3RoID09IDAgfHwgIXJlc3BvbnNlLnJlc3VsdHNbMF0udXNlcikge1xuICAgICAgICAgIHRocm93IG5ldyBQYXJzZS5FcnJvcihQYXJzZS5FcnJvci5JTlZBTElEX1NFU1NJT05fVE9LRU4sICdJbnZhbGlkIHNlc3Npb24gdG9rZW4nKTtcbiAgICAgICAgfSBlbHNlIHtcbiAgICAgICAgICBjb25zdCB1c2VyID0gcmVzcG9uc2UucmVzdWx0c1swXS51c2VyO1xuICAgICAgICAgIC8vIFNlbmQgdG9rZW4gYmFjayBvbiB0aGUgbG9naW4sIGJlY2F1c2UgU0RLcyBleHBlY3QgdGhhdC5cbiAgICAgICAgICB1c2VyLnNlc3Npb25Ub2tlbiA9IHNlc3Npb25Ub2tlbjtcblxuICAgICAgICAgIC8vIFJlbW92ZSBoaWRkZW4gcHJvcGVydGllcy5cbiAgICAgICAgICBVc2Vyc1JvdXRlci5yZW1vdmVIaWRkZW5Qcm9wZXJ0aWVzKHVzZXIpO1xuXG4gICAgICAgICAgcmV0dXJuIHsgcmVzcG9uc2U6IHVzZXIgfTtcbiAgICAgICAgfVxuICAgICAgfSk7XG4gIH1cblxuICBhc3luYyBoYW5kbGVMb2dJbihyZXEpIHtcbiAgICBsZXQgdXNlckZyb21KV1Q7XG4gICAgaWYgKHJlcS51c2VyRnJvbUpXVCkge1xuICAgICAgLy8gQ291bGQgYmUganVzdCB1c2VkIGByZXEudXNlckZyb21KV1RgLCBidXQgdGhlIGZvcmNlZCBsb29rdXBcbiAgICAgIC8vIEVuc3VyZXMgdGhlIHVzZXIgaGFzbid0IGJlZW4gZGVsZXRlZCBzaW5jZSB0aGUgdGhlIEpXVCB3YXMgZ3JhbnRlZFxuICAgICAgdXNlckZyb21KV1QgPSBhd2FpdCB0aGlzLl9hdXRoZW50aWNhdGVVc2VyRnJvbVJlcXVlc3RXaXRoSnd0KHJlcSk7XG4gICAgfVxuXG4gICAgY29uc3QgdXNlciA9IHVzZXJGcm9tSldUIHx8IChhd2FpdCB0aGlzLl9hdXRoZW50aWNhdGVVc2VyRnJvbVJlcXVlc3QocmVxKSk7XG5cbiAgICAvLyBoYW5kbGUgcGFzc3dvcmQgZXhwaXJ5IHBvbGljeSAtIGlnbm9yZSBpZiB1c2VyIGlzIG1hbmFnZWQgaW4gU1NPIChwcm92aWRlZCBieSBKV1QpXG4gICAgaWYgKCF1c2VyRnJvbUpXVCAmJiByZXEuY29uZmlnLnBhc3N3b3JkUG9saWN5ICYmIHJlcS5jb25maWcucGFzc3dvcmRQb2xpY3kubWF4UGFzc3dvcmRBZ2UpIHtcbiAgICAgIGxldCBjaGFuZ2VkQXQgPSB1c2VyLl9wYXNzd29yZF9jaGFuZ2VkX2F0O1xuXG4gICAgICBpZiAoIWNoYW5nZWRBdCkge1xuICAgICAgICAvLyBwYXNzd29yZCB3YXMgY3JlYXRlZCBiZWZvcmUgZXhwaXJ5IHBvbGljeSB3YXMgZW5hYmxlZC5cbiAgICAgICAgLy8gc2ltcGx5IHVwZGF0ZSBfVXNlciBvYmplY3Qgc28gdGhhdCBpdCB3aWxsIHN0YXJ0IGVuZm9yY2luZyBmcm9tIG5vd1xuICAgICAgICBjaGFuZ2VkQXQgPSBuZXcgRGF0ZSgpO1xuICAgICAgICByZXEuY29uZmlnLmRhdGFiYXNlLnVwZGF0ZShcbiAgICAgICAgICAnX1VzZXInLFxuICAgICAgICAgIHsgdXNlcm5hbWU6IHVzZXIudXNlcm5hbWUgfSxcbiAgICAgICAgICB7IF9wYXNzd29yZF9jaGFuZ2VkX2F0OiBQYXJzZS5fZW5jb2RlKGNoYW5nZWRBdCkgfVxuICAgICAgICApO1xuICAgICAgfSBlbHNlIHtcbiAgICAgICAgLy8gY2hlY2sgd2hldGhlciB0aGUgcGFzc3dvcmQgaGFzIGV4cGlyZWRcbiAgICAgICAgaWYgKGNoYW5nZWRBdC5fX3R5cGUgPT0gJ0RhdGUnKSB7XG4gICAgICAgICAgY2hhbmdlZEF0ID0gbmV3IERhdGUoY2hhbmdlZEF0Lmlzbyk7XG4gICAgICAgIH1cbiAgICAgICAgLy8gQ2FsY3VsYXRlIHRoZSBleHBpcnkgdGltZS5cbiAgICAgICAgY29uc3QgZXhwaXJlc0F0ID0gbmV3IERhdGUoXG4gICAgICAgICAgY2hhbmdlZEF0LmdldFRpbWUoKSArIDg2NDAwMDAwICogcmVxLmNvbmZpZy5wYXNzd29yZFBvbGljeS5tYXhQYXNzd29yZEFnZVxuICAgICAgICApO1xuICAgICAgICBpZiAoZXhwaXJlc0F0IDwgbmV3IERhdGUoKSlcbiAgICAgICAgICAvLyBmYWlsIG9mIGN1cnJlbnQgdGltZSBpcyBwYXN0IHBhc3N3b3JkIGV4cGlyeSB0aW1lXG4gICAgICAgICAgdGhyb3cgbmV3IFBhcnNlLkVycm9yKFxuICAgICAgICAgICAgUGFyc2UuRXJyb3IuT0JKRUNUX05PVF9GT1VORCxcbiAgICAgICAgICAgICdZb3VyIHBhc3N3b3JkIGhhcyBleHBpcmVkLiBQbGVhc2UgcmVzZXQgeW91ciBwYXNzd29yZC4nXG4gICAgICAgICAgKTtcbiAgICAgIH1cbiAgICB9XG5cbiAgICAvLyBSZW1vdmUgaGlkZGVuIHByb3BlcnRpZXMuXG4gICAgVXNlcnNSb3V0ZXIucmVtb3ZlSGlkZGVuUHJvcGVydGllcyh1c2VyKTtcblxuICAgIHJlcS5jb25maWcuZmlsZXNDb250cm9sbGVyLmV4cGFuZEZpbGVzSW5PYmplY3QocmVxLmNvbmZpZywgdXNlcik7XG5cbiAgICAvLyBCZWZvcmUgbG9naW4gdHJpZ2dlcjsgdGhyb3dzIGlmIGZhaWx1cmVcbiAgICBhd2FpdCBtYXliZVJ1blRyaWdnZXIoXG4gICAgICBUcmlnZ2VyVHlwZXMuYmVmb3JlTG9naW4sXG4gICAgICByZXEuYXV0aCxcbiAgICAgIFBhcnNlLlVzZXIuZnJvbUpTT04oT2JqZWN0LmFzc2lnbih7IGNsYXNzTmFtZTogJ19Vc2VyJyB9LCB1c2VyKSksXG4gICAgICBudWxsLFxuICAgICAgcmVxLmNvbmZpZ1xuICAgICk7XG5cbiAgICBjb25zdCB7IHNlc3Npb25EYXRhLCBjcmVhdGVTZXNzaW9uIH0gPSBBdXRoLmNyZWF0ZVNlc3Npb24ocmVxLmNvbmZpZywge1xuICAgICAgdXNlcklkOiB1c2VyLm9iamVjdElkLFxuICAgICAgY3JlYXRlZFdpdGg6IHtcbiAgICAgICAgYWN0aW9uOiAnbG9naW4nLFxuICAgICAgICBhdXRoUHJvdmlkZXI6ICdwYXNzd29yZCcsXG4gICAgICB9LFxuICAgICAgaW5zdGFsbGF0aW9uSWQ6IHJlcS5pbmZvLmluc3RhbGxhdGlvbklkLFxuICAgIH0pO1xuXG4gICAgdXNlci5zZXNzaW9uVG9rZW4gPSBzZXNzaW9uRGF0YS5zZXNzaW9uVG9rZW47XG5cbiAgICBhd2FpdCBjcmVhdGVTZXNzaW9uKCk7XG5cbiAgICBjb25zdCBhZnRlckxvZ2luVXNlciA9IFBhcnNlLlVzZXIuZnJvbUpTT04oT2JqZWN0LmFzc2lnbih7IGNsYXNzTmFtZTogJ19Vc2VyJyB9LCB1c2VyKSk7XG4gICAgbWF5YmVSdW5UcmlnZ2VyKFxuICAgICAgVHJpZ2dlclR5cGVzLmFmdGVyTG9naW4sXG4gICAgICB7IC4uLnJlcS5hdXRoLCB1c2VyOiBhZnRlckxvZ2luVXNlciB9LFxuICAgICAgYWZ0ZXJMb2dpblVzZXIsXG4gICAgICBudWxsLFxuICAgICAgcmVxLmNvbmZpZ1xuICAgICk7XG5cbiAgICByZXR1cm4geyByZXNwb25zZTogdXNlciB9O1xuICB9XG5cbiAgaGFuZGxlVmVyaWZ5UGFzc3dvcmQocmVxKSB7XG4gICAgcmV0dXJuIHRoaXMuX2F1dGhlbnRpY2F0ZVVzZXJGcm9tUmVxdWVzdChyZXEpXG4gICAgICAudGhlbih1c2VyID0+IHtcbiAgICAgICAgLy8gUmVtb3ZlIGhpZGRlbiBwcm9wZXJ0aWVzLlxuICAgICAgICBVc2Vyc1JvdXRlci5yZW1vdmVIaWRkZW5Qcm9wZXJ0aWVzKHVzZXIpO1xuXG4gICAgICAgIHJldHVybiB7IHJlc3BvbnNlOiB1c2VyIH07XG4gICAgICB9KVxuICAgICAgLmNhdGNoKGVycm9yID0+IHtcbiAgICAgICAgdGhyb3cgZXJyb3I7XG4gICAgICB9KTtcbiAgfVxuXG4gIGhhbmRsZUxvZ091dChyZXEpIHtcbiAgICBjb25zdCBzdWNjZXNzID0geyByZXNwb25zZToge30gfTtcbiAgICBpZiAocmVxLmluZm8gJiYgcmVxLmluZm8uc2Vzc2lvblRva2VuKSB7XG4gICAgICByZXR1cm4gcmVzdFxuICAgICAgICAuZmluZChcbiAgICAgICAgICByZXEuY29uZmlnLFxuICAgICAgICAgIEF1dGgubWFzdGVyKHJlcS5jb25maWcpLFxuICAgICAgICAgICdfU2Vzc2lvbicsXG4gICAgICAgICAgeyBzZXNzaW9uVG9rZW46IHJlcS5pbmZvLnNlc3Npb25Ub2tlbiB9LFxuICAgICAgICAgIHVuZGVmaW5lZCxcbiAgICAgICAgICByZXEuaW5mby5jbGllbnRTREssXG4gICAgICAgICAgcmVxLmluZm8uY29udGV4dFxuICAgICAgICApXG4gICAgICAgIC50aGVuKHJlY29yZHMgPT4ge1xuICAgICAgICAgIGlmIChyZWNvcmRzLnJlc3VsdHMgJiYgcmVjb3Jkcy5yZXN1bHRzLmxlbmd0aCkge1xuICAgICAgICAgICAgcmV0dXJuIHJlc3RcbiAgICAgICAgICAgICAgLmRlbChcbiAgICAgICAgICAgICAgICByZXEuY29uZmlnLFxuICAgICAgICAgICAgICAgIEF1dGgubWFzdGVyKHJlcS5jb25maWcpLFxuICAgICAgICAgICAgICAgICdfU2Vzc2lvbicsXG4gICAgICAgICAgICAgICAgcmVjb3Jkcy5yZXN1bHRzWzBdLm9iamVjdElkLFxuICAgICAgICAgICAgICAgIHJlcS5pbmZvLmNvbnRleHRcbiAgICAgICAgICAgICAgKVxuICAgICAgICAgICAgICAudGhlbigoKSA9PiB7XG4gICAgICAgICAgICAgICAgdGhpcy5fcnVuQWZ0ZXJMb2dvdXRUcmlnZ2VyKHJlcSwgcmVjb3Jkcy5yZXN1bHRzWzBdKTtcbiAgICAgICAgICAgICAgICByZXR1cm4gUHJvbWlzZS5yZXNvbHZlKHN1Y2Nlc3MpO1xuICAgICAgICAgICAgICB9KTtcbiAgICAgICAgICB9XG4gICAgICAgICAgcmV0dXJuIFByb21pc2UucmVzb2x2ZShzdWNjZXNzKTtcbiAgICAgICAgfSk7XG4gICAgfVxuICAgIHJldHVybiBQcm9taXNlLnJlc29sdmUoc3VjY2Vzcyk7XG4gIH1cblxuICBfcnVuQWZ0ZXJMb2dvdXRUcmlnZ2VyKHJlcSwgc2Vzc2lvbikge1xuICAgIC8vIEFmdGVyIGxvZ291dCB0cmlnZ2VyXG4gICAgbWF5YmVSdW5UcmlnZ2VyKFxuICAgICAgVHJpZ2dlclR5cGVzLmFmdGVyTG9nb3V0LFxuICAgICAgcmVxLmF1dGgsXG4gICAgICBQYXJzZS5TZXNzaW9uLmZyb21KU09OKE9iamVjdC5hc3NpZ24oeyBjbGFzc05hbWU6ICdfU2Vzc2lvbicgfSwgc2Vzc2lvbikpLFxuICAgICAgbnVsbCxcbiAgICAgIHJlcS5jb25maWdcbiAgICApO1xuICB9XG5cbiAgX3Rocm93T25CYWRFbWFpbENvbmZpZyhyZXEpIHtcbiAgICB0cnkge1xuICAgICAgQ29uZmlnLnZhbGlkYXRlRW1haWxDb25maWd1cmF0aW9uKHtcbiAgICAgICAgZW1haWxBZGFwdGVyOiByZXEuY29uZmlnLnVzZXJDb250cm9sbGVyLmFkYXB0ZXIsXG4gICAgICAgIGFwcE5hbWU6IHJlcS5jb25maWcuYXBwTmFtZSxcbiAgICAgICAgcHVibGljU2VydmVyVVJMOiByZXEuY29uZmlnLnB1YmxpY1NlcnZlclVSTCxcbiAgICAgICAgZW1haWxWZXJpZnlUb2tlblZhbGlkaXR5RHVyYXRpb246IHJlcS5jb25maWcuZW1haWxWZXJpZnlUb2tlblZhbGlkaXR5RHVyYXRpb24sXG4gICAgICAgIGVtYWlsVmVyaWZ5VG9rZW5SZXVzZUlmVmFsaWQ6IHJlcS5jb25maWcuZW1haWxWZXJpZnlUb2tlblJldXNlSWZWYWxpZCxcbiAgICAgIH0pO1xuICAgIH0gY2F0Y2ggKGUpIHtcbiAgICAgIGlmICh0eXBlb2YgZSA9PT0gJ3N0cmluZycpIHtcbiAgICAgICAgLy8gTWF5YmUgd2UgbmVlZCBhIEJhZCBDb25maWd1cmF0aW9uIGVycm9yLCBidXQgdGhlIFNES3Mgd29uJ3QgdW5kZXJzdGFuZCBpdC4gRm9yIG5vdywgSW50ZXJuYWwgU2VydmVyIEVycm9yLlxuICAgICAgICB0aHJvdyBuZXcgUGFyc2UuRXJyb3IoXG4gICAgICAgICAgUGFyc2UuRXJyb3IuSU5URVJOQUxfU0VSVkVSX0VSUk9SLFxuICAgICAgICAgICdBbiBhcHBOYW1lLCBwdWJsaWNTZXJ2ZXJVUkwsIGFuZCBlbWFpbEFkYXB0ZXIgYXJlIHJlcXVpcmVkIGZvciBwYXNzd29yZCByZXNldCBhbmQgZW1haWwgdmVyaWZpY2F0aW9uIGZ1bmN0aW9uYWxpdHkuJ1xuICAgICAgICApO1xuICAgICAgfSBlbHNlIHtcbiAgICAgICAgdGhyb3cgZTtcbiAgICAgIH1cbiAgICB9XG4gIH1cblxuICBoYW5kbGVSZXNldFJlcXVlc3QocmVxKSB7XG4gICAgdGhpcy5fdGhyb3dPbkJhZEVtYWlsQ29uZmlnKHJlcSk7XG5cbiAgICBjb25zdCB7IGVtYWlsIH0gPSByZXEuYm9keTtcbiAgICBpZiAoIWVtYWlsKSB7XG4gICAgICB0aHJvdyBuZXcgUGFyc2UuRXJyb3IoUGFyc2UuRXJyb3IuRU1BSUxfTUlTU0lORywgJ3lvdSBtdXN0IHByb3ZpZGUgYW4gZW1haWwnKTtcbiAgICB9XG4gICAgaWYgKHR5cGVvZiBlbWFpbCAhPT0gJ3N0cmluZycpIHtcbiAgICAgIHRocm93IG5ldyBQYXJzZS5FcnJvcihcbiAgICAgICAgUGFyc2UuRXJyb3IuSU5WQUxJRF9FTUFJTF9BRERSRVNTLFxuICAgICAgICAneW91IG11c3QgcHJvdmlkZSBhIHZhbGlkIGVtYWlsIHN0cmluZydcbiAgICAgICk7XG4gICAgfVxuICAgIGNvbnN0IHVzZXJDb250cm9sbGVyID0gcmVxLmNvbmZpZy51c2VyQ29udHJvbGxlcjtcbiAgICByZXR1cm4gdXNlckNvbnRyb2xsZXIuc2VuZFBhc3N3b3JkUmVzZXRFbWFpbChlbWFpbCkudGhlbihcbiAgICAgICgpID0+IHtcbiAgICAgICAgcmV0dXJuIFByb21pc2UucmVzb2x2ZSh7XG4gICAgICAgICAgcmVzcG9uc2U6IHt9LFxuICAgICAgICB9KTtcbiAgICAgIH0sXG4gICAgICBlcnIgPT4ge1xuICAgICAgICBpZiAoZXJyLmNvZGUgPT09IFBhcnNlLkVycm9yLk9CSkVDVF9OT1RfRk9VTkQpIHtcbiAgICAgICAgICAvLyBSZXR1cm4gc3VjY2VzcyBzbyB0aGF0IHRoaXMgZW5kcG9pbnQgY2FuJ3RcbiAgICAgICAgICAvLyBiZSB1c2VkIHRvIGVudW1lcmF0ZSB2YWxpZCBlbWFpbHNcbiAgICAgICAgICByZXR1cm4gUHJvbWlzZS5yZXNvbHZlKHtcbiAgICAgICAgICAgIHJlc3BvbnNlOiB7fSxcbiAgICAgICAgICB9KTtcbiAgICAgICAgfSBlbHNlIHtcbiAgICAgICAgICB0aHJvdyBlcnI7XG4gICAgICAgIH1cbiAgICAgIH1cbiAgICApO1xuICB9XG5cbiAgaGFuZGxlVmVyaWZpY2F0aW9uRW1haWxSZXF1ZXN0KHJlcSkge1xuICAgIHRoaXMuX3Rocm93T25CYWRFbWFpbENvbmZpZyhyZXEpO1xuXG4gICAgY29uc3QgeyBlbWFpbCB9ID0gcmVxLmJvZHk7XG4gICAgaWYgKCFlbWFpbCkge1xuICAgICAgdGhyb3cgbmV3IFBhcnNlLkVycm9yKFBhcnNlLkVycm9yLkVNQUlMX01JU1NJTkcsICd5b3UgbXVzdCBwcm92aWRlIGFuIGVtYWlsJyk7XG4gICAgfVxuICAgIGlmICh0eXBlb2YgZW1haWwgIT09ICdzdHJpbmcnKSB7XG4gICAgICB0aHJvdyBuZXcgUGFyc2UuRXJyb3IoXG4gICAgICAgIFBhcnNlLkVycm9yLklOVkFMSURfRU1BSUxfQUREUkVTUyxcbiAgICAgICAgJ3lvdSBtdXN0IHByb3ZpZGUgYSB2YWxpZCBlbWFpbCBzdHJpbmcnXG4gICAgICApO1xuICAgIH1cblxuICAgIHJldHVybiByZXEuY29uZmlnLmRhdGFiYXNlLmZpbmQoJ19Vc2VyJywgeyBlbWFpbDogZW1haWwgfSkudGhlbihyZXN1bHRzID0+IHtcbiAgICAgIGlmICghcmVzdWx0cy5sZW5ndGggfHwgcmVzdWx0cy5sZW5ndGggPCAxKSB7XG4gICAgICAgIHRocm93IG5ldyBQYXJzZS5FcnJvcihQYXJzZS5FcnJvci5FTUFJTF9OT1RfRk9VTkQsIGBObyB1c2VyIGZvdW5kIHdpdGggZW1haWwgJHtlbWFpbH1gKTtcbiAgICAgIH1cbiAgICAgIGNvbnN0IHVzZXIgPSByZXN1bHRzWzBdO1xuXG4gICAgICAvLyByZW1vdmUgcGFzc3dvcmQgZmllbGQsIG1lc3NlcyB3aXRoIHNhdmluZyBvbiBwb3N0Z3Jlc1xuICAgICAgZGVsZXRlIHVzZXIucGFzc3dvcmQ7XG5cbiAgICAgIGlmICh1c2VyLmVtYWlsVmVyaWZpZWQpIHtcbiAgICAgICAgdGhyb3cgbmV3IFBhcnNlLkVycm9yKFBhcnNlLkVycm9yLk9USEVSX0NBVVNFLCBgRW1haWwgJHtlbWFpbH0gaXMgYWxyZWFkeSB2ZXJpZmllZC5gKTtcbiAgICAgIH1cblxuICAgICAgY29uc3QgdXNlckNvbnRyb2xsZXIgPSByZXEuY29uZmlnLnVzZXJDb250cm9sbGVyO1xuICAgICAgcmV0dXJuIHVzZXJDb250cm9sbGVyLnJlZ2VuZXJhdGVFbWFpbFZlcmlmeVRva2VuKHVzZXIpLnRoZW4oKCkgPT4ge1xuICAgICAgICB1c2VyQ29udHJvbGxlci5zZW5kVmVyaWZpY2F0aW9uRW1haWwodXNlcik7XG4gICAgICAgIHJldHVybiB7IHJlc3BvbnNlOiB7fSB9O1xuICAgICAgfSk7XG4gICAgfSk7XG4gIH1cblxuICBtb3VudFJvdXRlcygpIHtcbiAgICB0aGlzLnJvdXRlKCdHRVQnLCAnL3VzZXJzJywgcmVxID0+IHtcbiAgICAgIHJldHVybiB0aGlzLmhhbmRsZUZpbmQocmVxKTtcbiAgICB9KTtcbiAgICB0aGlzLnJvdXRlKCdQT1NUJywgJy91c2VycycsIHByb21pc2VFbnN1cmVJZGVtcG90ZW5jeSwgcmVxID0+IHtcbiAgICAgIHJldHVybiB0aGlzLmhhbmRsZUNyZWF0ZShyZXEpO1xuICAgIH0pO1xuICAgIHRoaXMucm91dGUoJ0dFVCcsICcvdXNlcnMvbWUnLCByZXEgPT4ge1xuICAgICAgcmV0dXJuIHRoaXMuaGFuZGxlTWUocmVxKTtcbiAgICB9KTtcbiAgICB0aGlzLnJvdXRlKCdHRVQnLCAnL3VzZXJzLzpvYmplY3RJZCcsIHJlcSA9PiB7XG4gICAgICByZXR1cm4gdGhpcy5oYW5kbGVHZXQocmVxKTtcbiAgICB9KTtcbiAgICB0aGlzLnJvdXRlKCdQVVQnLCAnL3VzZXJzLzpvYmplY3RJZCcsIHByb21pc2VFbnN1cmVJZGVtcG90ZW5jeSwgcmVxID0+IHtcbiAgICAgIHJldHVybiB0aGlzLmhhbmRsZVVwZGF0ZShyZXEpO1xuICAgIH0pO1xuICAgIHRoaXMucm91dGUoJ0RFTEVURScsICcvdXNlcnMvOm9iamVjdElkJywgcmVxID0+IHtcbiAgICAgIHJldHVybiB0aGlzLmhhbmRsZURlbGV0ZShyZXEpO1xuICAgIH0pO1xuICAgIHRoaXMucm91dGUoJ0dFVCcsICcvbG9naW4nLCByZXEgPT4ge1xuICAgICAgcmV0dXJuIHRoaXMuaGFuZGxlTG9nSW4ocmVxKTtcbiAgICB9KTtcbiAgICB0aGlzLnJvdXRlKCdQT1NUJywgJy9sb2dpbicsIHJlcSA9PiB7XG4gICAgICByZXR1cm4gdGhpcy5oYW5kbGVMb2dJbihyZXEpO1xuICAgIH0pO1xuICAgIHRoaXMucm91dGUoJ1BPU1QnLCAnL2xvZ291dCcsIHJlcSA9PiB7XG4gICAgICByZXR1cm4gdGhpcy5oYW5kbGVMb2dPdXQocmVxKTtcbiAgICB9KTtcbiAgICB0aGlzLnJvdXRlKCdQT1NUJywgJy9yZXF1ZXN0UGFzc3dvcmRSZXNldCcsIHJlcSA9PiB7XG4gICAgICByZXR1cm4gdGhpcy5oYW5kbGVSZXNldFJlcXVlc3QocmVxKTtcbiAgICB9KTtcbiAgICB0aGlzLnJvdXRlKCdQT1NUJywgJy92ZXJpZmljYXRpb25FbWFpbFJlcXVlc3QnLCByZXEgPT4ge1xuICAgICAgcmV0dXJuIHRoaXMuaGFuZGxlVmVyaWZpY2F0aW9uRW1haWxSZXF1ZXN0KHJlcSk7XG4gICAgfSk7XG4gICAgdGhpcy5yb3V0ZSgnR0VUJywgJy92ZXJpZnlQYXNzd29yZCcsIHJlcSA9PiB7XG4gICAgICByZXR1cm4gdGhpcy5oYW5kbGVWZXJpZnlQYXNzd29yZChyZXEpO1xuICAgIH0pO1xuICB9XG59XG5cbmV4cG9ydCBkZWZhdWx0IFVzZXJzUm91dGVyO1xuIl19