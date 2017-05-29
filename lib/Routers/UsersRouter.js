'use strict';

Object.defineProperty(exports, "__esModule", {
  value: true
});
exports.UsersRouter = undefined;

var _createClass = function () { function defineProperties(target, props) { for (var i = 0; i < props.length; i++) { var descriptor = props[i]; descriptor.enumerable = descriptor.enumerable || false; descriptor.configurable = true; if ("value" in descriptor) descriptor.writable = true; Object.defineProperty(target, descriptor.key, descriptor); } } return function (Constructor, protoProps, staticProps) { if (protoProps) defineProperties(Constructor.prototype, protoProps); if (staticProps) defineProperties(Constructor, staticProps); return Constructor; }; }();

var _get = function get(object, property, receiver) { if (object === null) object = Function.prototype; var desc = Object.getOwnPropertyDescriptor(object, property); if (desc === undefined) { var parent = Object.getPrototypeOf(object); if (parent === null) { return undefined; } else { return get(parent, property, receiver); } } else if ("value" in desc) { return desc.value; } else { var getter = desc.get; if (getter === undefined) { return undefined; } return getter.call(receiver); } };

var _deepcopy = require('deepcopy');

var _deepcopy2 = _interopRequireDefault(_deepcopy);

var _node = require('parse/node');

var _node2 = _interopRequireDefault(_node);

var _Config = require('../Config');

var _Config2 = _interopRequireDefault(_Config);

var _AccountLockout = require('../AccountLockout');

var _AccountLockout2 = _interopRequireDefault(_AccountLockout);

var _ClassesRouter2 = require('./ClassesRouter');

var _ClassesRouter3 = _interopRequireDefault(_ClassesRouter2);

var _rest = require('../rest');

var _rest2 = _interopRequireDefault(_rest);

var _Auth = require('../Auth');

var _Auth2 = _interopRequireDefault(_Auth);

var _password = require('../password');

var _password2 = _interopRequireDefault(_password);

var _RestWrite = require('../RestWrite');

var _RestWrite2 = _interopRequireDefault(_RestWrite);

function _interopRequireDefault(obj) { return obj && obj.__esModule ? obj : { default: obj }; }

function _classCallCheck(instance, Constructor) { if (!(instance instanceof Constructor)) { throw new TypeError("Cannot call a class as a function"); } }

function _possibleConstructorReturn(self, call) { if (!self) { throw new ReferenceError("this hasn't been initialised - super() hasn't been called"); } return call && (typeof call === "object" || typeof call === "function") ? call : self; }

function _inherits(subClass, superClass) { if (typeof superClass !== "function" && superClass !== null) { throw new TypeError("Super expression must either be null or a function, not " + typeof superClass); } subClass.prototype = Object.create(superClass && superClass.prototype, { constructor: { value: subClass, enumerable: false, writable: true, configurable: true } }); if (superClass) Object.setPrototypeOf ? Object.setPrototypeOf(subClass, superClass) : subClass.__proto__ = superClass; } // These methods handle the User-related routes.

var cryptoUtils = require('../cryptoUtils');

var UsersRouter = exports.UsersRouter = function (_ClassesRouter) {
  _inherits(UsersRouter, _ClassesRouter);

  function UsersRouter() {
    _classCallCheck(this, UsersRouter);

    return _possibleConstructorReturn(this, (UsersRouter.__proto__ || Object.getPrototypeOf(UsersRouter)).apply(this, arguments));
  }

  _createClass(UsersRouter, [{
    key: 'handleFind',
    value: function handleFind(req) {
      req.params.className = '_User';
      return _get(UsersRouter.prototype.__proto__ || Object.getPrototypeOf(UsersRouter.prototype), 'handleFind', this).call(this, req);
    }
  }, {
    key: 'handleGet',
    value: function handleGet(req) {
      req.params.className = '_User';
      return _get(UsersRouter.prototype.__proto__ || Object.getPrototypeOf(UsersRouter.prototype), 'handleGet', this).call(this, req);
    }
  }, {
    key: 'handleCreate',
    value: function handleCreate(req) {
      var data = (0, _deepcopy2.default)(req.body);
      req.body = data;
      req.params.className = '_User';

      return _get(UsersRouter.prototype.__proto__ || Object.getPrototypeOf(UsersRouter.prototype), 'handleCreate', this).call(this, req);
    }
  }, {
    key: 'handleUpdate',
    value: function handleUpdate(req) {
      req.params.className = '_User';
      return _get(UsersRouter.prototype.__proto__ || Object.getPrototypeOf(UsersRouter.prototype), 'handleUpdate', this).call(this, req);
    }
  }, {
    key: 'handleDelete',
    value: function handleDelete(req) {
      req.params.className = '_User';
      return _get(UsersRouter.prototype.__proto__ || Object.getPrototypeOf(UsersRouter.prototype), 'handleDelete', this).call(this, req);
    }
  }, {
    key: 'handleMe',
    value: function handleMe(req) {
      if (!req.info || !req.info.sessionToken) {
        throw new _node2.default.Error(_node2.default.Error.INVALID_SESSION_TOKEN, 'invalid session token');
      }
      var sessionToken = req.info.sessionToken;
      return _rest2.default.find(req.config, _Auth2.default.master(req.config), '_Session', { sessionToken: sessionToken }, { include: 'user' }, req.info.clientSDK).then(function (response) {
        if (!response.results || response.results.length == 0 || !response.results[0].user) {
          throw new _node2.default.Error(_node2.default.Error.INVALID_SESSION_TOKEN, 'invalid session token');
        } else {
          var user = response.results[0].user;
          // Send token back on the login, because SDKs expect that.
          user.sessionToken = sessionToken;

          // Remove hidden properties.
          for (var key in user) {
            if (user.hasOwnProperty(key)) {
              // Regexp comes from Parse.Object.prototype.validate
              if (key !== "__type" && !/^[A-Za-z][0-9A-Za-z_]*$/.test(key)) {
                delete user[key];
              }
            }
          }

          return { response: user };
        }
      });
    }
  }, {
    key: 'handleLogIn',
    value: function handleLogIn(req) {
      // Use query parameters instead if provided in url
      if (!req.body.username && req.query.username) {
        req.body = req.query;
      }

      // TODO: use the right error codes / descriptions.
      if (!req.body.username) {
        throw new _node2.default.Error(_node2.default.Error.USERNAME_MISSING, 'username is required.');
      }
      if (!req.body.password) {
        throw new _node2.default.Error(_node2.default.Error.PASSWORD_MISSING, 'password is required.');
      }
      if (typeof req.body.username !== 'string' || typeof req.body.password !== 'string') {
        throw new _node2.default.Error(_node2.default.Error.OBJECT_NOT_FOUND, 'Invalid username/password.');
      }

      var user = void 0;
      var isValidPassword = false;

      return req.config.database.find('_User', { username: req.body.username }).then(function (results) {
        if (!results.length) {
          throw new _node2.default.Error(_node2.default.Error.OBJECT_NOT_FOUND, 'Invalid username/password.');
        }
        user = results[0];

        if (req.config.verifyUserEmails && req.config.preventLoginWithUnverifiedEmail && !user.emailVerified) {
          throw new _node2.default.Error(_node2.default.Error.EMAIL_NOT_FOUND, 'User email is not verified.');
        }
        return _password2.default.compare(req.body.password, user.password);
      }).then(function (correct) {
        isValidPassword = correct;
        var accountLockoutPolicy = new _AccountLockout2.default(user, req.config);
        return accountLockoutPolicy.handleLoginAttempt(isValidPassword);
      }).then(function () {
        if (!isValidPassword) {
          throw new _node2.default.Error(_node2.default.Error.OBJECT_NOT_FOUND, 'Invalid username/password.');
        }

        // handle password expiry policy
        if (req.config.passwordPolicy && req.config.passwordPolicy.maxPasswordAge) {
          var changedAt = user._password_changed_at;

          if (!changedAt) {
            // password was created before expiry policy was enabled.
            // simply update _User object so that it will start enforcing from now
            changedAt = new Date();
            req.config.database.update('_User', { username: user.username }, { _password_changed_at: _node2.default._encode(changedAt) });
          } else {
            // check whether the password has expired
            if (changedAt.__type == 'Date') {
              changedAt = new Date(changedAt.iso);
            }
            // Calculate the expiry time.
            var _expiresAt = new Date(changedAt.getTime() + 86400000 * req.config.passwordPolicy.maxPasswordAge);
            if (_expiresAt < new Date()) // fail of current time is past password expiry time
              throw new _node2.default.Error(_node2.default.Error.OBJECT_NOT_FOUND, 'Your password has expired. Please reset your password.');
          }
        }

        var token = 'r:' + cryptoUtils.newToken();
        user.sessionToken = token;
        delete user.password;

        // Sometimes the authData still has null on that keys
        // https://github.com/ParsePlatform/parse-server/issues/935
        if (user.authData) {
          Object.keys(user.authData).forEach(function (provider) {
            if (user.authData[provider] === null) {
              delete user.authData[provider];
            }
          });
          if (Object.keys(user.authData).length == 0) {
            delete user.authData;
          }
        }

        req.config.filesController.expandFilesInObject(req.config, user);

        var expiresAt = req.config.generateSessionExpiresAt();
        var sessionData = {
          sessionToken: token,
          user: {
            __type: 'Pointer',
            className: '_User',
            objectId: user.objectId
          },
          createdWith: {
            'action': 'login',
            'authProvider': 'password'
          },
          restricted: false,
          expiresAt: _node2.default._encode(expiresAt)
        };

        if (req.info.installationId) {
          sessionData.installationId = req.info.installationId;
        }

        var create = new _RestWrite2.default(req.config, _Auth2.default.master(req.config), '_Session', null, sessionData);
        return create.execute();
      }).then(function () {
        return { response: user };
      });
    }
  }, {
    key: 'handleLogOut',
    value: function handleLogOut(req) {
      var success = { response: {} };
      if (req.info && req.info.sessionToken) {
        return _rest2.default.find(req.config, _Auth2.default.master(req.config), '_Session', { sessionToken: req.info.sessionToken }, undefined, req.info.clientSDK).then(function (records) {
          if (records.results && records.results.length) {
            return _rest2.default.del(req.config, _Auth2.default.master(req.config), '_Session', records.results[0].objectId).then(function () {
              return Promise.resolve(success);
            });
          }
          return Promise.resolve(success);
        });
      }
      return Promise.resolve(success);
    }
  }, {
    key: '_throwOnBadEmailConfig',
    value: function _throwOnBadEmailConfig(req) {
      try {
        _Config2.default.validateEmailConfiguration({
          emailAdapter: req.config.userController.adapter,
          appName: req.config.appName,
          publicServerURL: req.config.publicServerURL,
          emailVerifyTokenValidityDuration: req.config.emailVerifyTokenValidityDuration
        });
      } catch (e) {
        if (typeof e === 'string') {
          // Maybe we need a Bad Configuration error, but the SDKs won't understand it. For now, Internal Server Error.
          throw new _node2.default.Error(_node2.default.Error.INTERNAL_SERVER_ERROR, 'An appName, publicServerURL, and emailAdapter are required for password reset and email verification functionality.');
        } else {
          throw e;
        }
      }
    }
  }, {
    key: 'handleResetRequest',
    value: function handleResetRequest(req) {
      this._throwOnBadEmailConfig(req);

      var email = req.body.email;

      if (!email) {
        throw new _node2.default.Error(_node2.default.Error.EMAIL_MISSING, "you must provide an email");
      }
      if (typeof email !== 'string') {
        throw new _node2.default.Error(_node2.default.Error.INVALID_EMAIL_ADDRESS, 'you must provide a valid email string');
      }
      var userController = req.config.userController;
      return userController.sendPasswordResetEmail(email).then(function () {
        return Promise.resolve({
          response: {}
        });
      }, function (err) {
        if (err.code === _node2.default.Error.OBJECT_NOT_FOUND) {
          throw new _node2.default.Error(_node2.default.Error.EMAIL_NOT_FOUND, 'No user found with email ' + email + '.');
        } else {
          throw err;
        }
      });
    }
  }, {
    key: 'handleVerificationEmailRequest',
    value: function handleVerificationEmailRequest(req) {
      this._throwOnBadEmailConfig(req);

      var email = req.body.email;

      if (!email) {
        throw new _node2.default.Error(_node2.default.Error.EMAIL_MISSING, 'you must provide an email');
      }
      if (typeof email !== 'string') {
        throw new _node2.default.Error(_node2.default.Error.INVALID_EMAIL_ADDRESS, 'you must provide a valid email string');
      }

      return req.config.database.find('_User', { email: email }).then(function (results) {
        if (!results.length || results.length < 1) {
          throw new _node2.default.Error(_node2.default.Error.EMAIL_NOT_FOUND, 'No user found with email ' + email);
        }
        var user = results[0];

        if (user.emailVerified) {
          throw new _node2.default.Error(_node2.default.Error.OTHER_CAUSE, 'Email ' + email + ' is already verified.');
        }

        var userController = req.config.userController;
        userController.sendVerificationEmail(user);
        return { response: {} };
      });
    }
  }, {
    key: 'mountRoutes',
    value: function mountRoutes() {
      var _this2 = this;

      this.route('GET', '/users', function (req) {
        return _this2.handleFind(req);
      });
      this.route('POST', '/users', function (req) {
        return _this2.handleCreate(req);
      });
      this.route('GET', '/users/me', function (req) {
        return _this2.handleMe(req);
      });
      this.route('GET', '/users/:objectId', function (req) {
        return _this2.handleGet(req);
      });
      this.route('PUT', '/users/:objectId', function (req) {
        return _this2.handleUpdate(req);
      });
      this.route('DELETE', '/users/:objectId', function (req) {
        return _this2.handleDelete(req);
      });
      this.route('GET', '/login', function (req) {
        return _this2.handleLogIn(req);
      });
      this.route('POST', '/logout', function (req) {
        return _this2.handleLogOut(req);
      });
      this.route('POST', '/requestPasswordReset', function (req) {
        return _this2.handleResetRequest(req);
      });
      this.route('POST', '/verificationEmailRequest', function (req) {
        return _this2.handleVerificationEmailRequest(req);
      });
    }
  }]);

  return UsersRouter;
}(_ClassesRouter3.default);

exports.default = UsersRouter;