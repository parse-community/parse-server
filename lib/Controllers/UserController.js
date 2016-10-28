'use strict';

Object.defineProperty(exports, "__esModule", {
  value: true
});
exports.UserController = undefined;

var _createClass = function () { function defineProperties(target, props) { for (var i = 0; i < props.length; i++) { var descriptor = props[i]; descriptor.enumerable = descriptor.enumerable || false; descriptor.configurable = true; if ("value" in descriptor) descriptor.writable = true; Object.defineProperty(target, descriptor.key, descriptor); } } return function (Constructor, protoProps, staticProps) { if (protoProps) defineProperties(Constructor.prototype, protoProps); if (staticProps) defineProperties(Constructor, staticProps); return Constructor; }; }();

var _get = function get(object, property, receiver) { if (object === null) object = Function.prototype; var desc = Object.getOwnPropertyDescriptor(object, property); if (desc === undefined) { var parent = Object.getPrototypeOf(object); if (parent === null) { return undefined; } else { return get(parent, property, receiver); } } else if ("value" in desc) { return desc.value; } else { var getter = desc.get; if (getter === undefined) { return undefined; } return getter.call(receiver); } };

var _cryptoUtils = require('../cryptoUtils');

var _triggers = require('../triggers');

var _AdaptableController2 = require('./AdaptableController');

var _AdaptableController3 = _interopRequireDefault(_AdaptableController2);

var _MailAdapter = require('../Adapters/Email/MailAdapter');

var _MailAdapter2 = _interopRequireDefault(_MailAdapter);

var _rest = require('../rest');

var _rest2 = _interopRequireDefault(_rest);

function _interopRequireDefault(obj) { return obj && obj.__esModule ? obj : { default: obj }; }

function _classCallCheck(instance, Constructor) { if (!(instance instanceof Constructor)) { throw new TypeError("Cannot call a class as a function"); } }

function _possibleConstructorReturn(self, call) { if (!self) { throw new ReferenceError("this hasn't been initialised - super() hasn't been called"); } return call && (typeof call === "object" || typeof call === "function") ? call : self; }

function _inherits(subClass, superClass) { if (typeof superClass !== "function" && superClass !== null) { throw new TypeError("Super expression must either be null or a function, not " + typeof superClass); } subClass.prototype = Object.create(superClass && superClass.prototype, { constructor: { value: subClass, enumerable: false, writable: true, configurable: true } }); if (superClass) Object.setPrototypeOf ? Object.setPrototypeOf(subClass, superClass) : subClass.__proto__ = superClass; }

var RestWrite = require('../RestWrite');
var RestQuery = require('../RestQuery');
var hash = require('../password').hash;
var Auth = require('../Auth');

var UserController = exports.UserController = function (_AdaptableController) {
  _inherits(UserController, _AdaptableController);

  function UserController(adapter, appId) {
    var options = arguments.length <= 2 || arguments[2] === undefined ? {} : arguments[2];

    _classCallCheck(this, UserController);

    return _possibleConstructorReturn(this, (UserController.__proto__ || Object.getPrototypeOf(UserController)).call(this, adapter, appId, options));
  }

  _createClass(UserController, [{
    key: 'validateAdapter',
    value: function validateAdapter(adapter) {
      // Allow no adapter
      if (!adapter && !this.shouldVerifyEmails) {
        return;
      }
      _get(UserController.prototype.__proto__ || Object.getPrototypeOf(UserController.prototype), 'validateAdapter', this).call(this, adapter);
    }
  }, {
    key: 'expectedAdapterType',
    value: function expectedAdapterType() {
      return _MailAdapter2.default;
    }
  }, {
    key: 'setEmailVerifyToken',
    value: function setEmailVerifyToken(user) {
      if (this.shouldVerifyEmails) {
        user._email_verify_token = (0, _cryptoUtils.randomString)(25);
        user.emailVerified = false;

        if (this.config.emailVerifyTokenValidityDuration) {
          user._email_verify_token_expires_at = Parse._encode(this.config.generateEmailVerifyTokenExpiresAt());
        }
      }
    }
  }, {
    key: 'verifyEmail',
    value: function verifyEmail(username, token) {
      if (!this.shouldVerifyEmails) {
        // Trying to verify email when not enabled
        // TODO: Better error here.
        throw undefined;
      }

      var query = { username: username, _email_verify_token: token };
      var updateFields = { emailVerified: true, _email_verify_token: { __op: 'Delete' } };

      // if the email verify token needs to be validated then
      // add additional query params and additional fields that need to be updated
      if (this.config.emailVerifyTokenValidityDuration) {
        query.emailVerified = false;
        query._email_verify_token_expires_at = { $gt: Parse._encode(new Date()) };

        updateFields._email_verify_token_expires_at = { __op: 'Delete' };
      }

      return this.config.database.update('_User', query, updateFields).then(function (document) {
        if (!document) {
          throw undefined;
        }
        return Promise.resolve(document);
      });
    }
  }, {
    key: 'checkResetTokenValidity',
    value: function checkResetTokenValidity(username, token) {
      return this.config.database.find('_User', {
        username: username,
        _perishable_token: token
      }, { limit: 1 }).then(function (results) {
        if (results.length != 1) {
          throw undefined;
        }
        return results[0];
      });
    }
  }, {
    key: 'getUserIfNeeded',
    value: function getUserIfNeeded(user) {
      if (user.username && user.email) {
        return Promise.resolve(user);
      }
      var where = {};
      if (user.username) {
        where.username = user.username;
      }
      if (user.email) {
        where.email = user.email;
      }

      var query = new RestQuery(this.config, Auth.master(this.config), '_User', where);
      return query.execute().then(function (result) {
        if (result.results.length != 1) {
          throw undefined;
        }
        return result.results[0];
      });
    }
  }, {
    key: 'sendVerificationEmail',
    value: function sendVerificationEmail(user) {
      var _this2 = this;

      if (!this.shouldVerifyEmails) {
        return;
      }
      var token = encodeURIComponent(user._email_verify_token);
      // We may need to fetch the user in case of update email
      this.getUserIfNeeded(user).then(function (user) {
        var username = encodeURIComponent(user.username);
        var link = _this2.config.verifyEmailURL + '?token=' + token + '&username=' + username;
        var options = {
          appName: _this2.config.appName,
          link: link,
          user: (0, _triggers.inflate)('_User', user)
        };
        if (_this2.adapter.sendVerificationEmail) {
          _this2.adapter.sendVerificationEmail(options);
        } else {
          _this2.adapter.sendMail(_this2.defaultVerificationEmail(options));
        }
      });
    }
  }, {
    key: 'setPasswordResetToken',
    value: function setPasswordResetToken(email) {
      return this.config.database.update('_User', { $or: [{ email: email }, { username: email, email: { $exists: false } }] }, { _perishable_token: (0, _cryptoUtils.randomString)(25) }, {}, true);
    }
  }, {
    key: 'sendPasswordResetEmail',
    value: function sendPasswordResetEmail(email) {
      var _this3 = this;

      if (!this.adapter) {
        throw "Trying to send a reset password but no adapter is set";
        //  TODO: No adapter?
        return;
      }

      return this.setPasswordResetToken(email).then(function (user) {
        var token = encodeURIComponent(user._perishable_token);
        var username = encodeURIComponent(user.username);
        var link = _this3.config.requestResetPasswordURL + '?token=' + token + '&username=' + username;

        var options = {
          appName: _this3.config.appName,
          link: link,
          user: (0, _triggers.inflate)('_User', user)
        };

        if (_this3.adapter.sendPasswordResetEmail) {
          _this3.adapter.sendPasswordResetEmail(options);
        } else {
          _this3.adapter.sendMail(_this3.defaultResetPasswordEmail(options));
        }

        return Promise.resolve(user);
      });
    }
  }, {
    key: 'updatePassword',
    value: function updatePassword(username, token, password, config) {
      var _this4 = this;

      return this.checkResetTokenValidity(username, token).then(function (user) {
        return updateUserPassword(user.objectId, password, _this4.config);
      })
      // clear reset password token
      .then(function () {
        return _this4.config.database.update('_User', { username: username }, {
          _perishable_token: { __op: 'Delete' }
        });
      });
    }
  }, {
    key: 'defaultVerificationEmail',
    value: function defaultVerificationEmail(_ref) {
      var link = _ref.link;
      var user = _ref.user;
      var appName = _ref.appName;

      var text = "Hi,\n\n" + "You are being asked to confirm the e-mail address " + user.get("email") + " with " + appName + "\n\n" + "" + "Click here to confirm it:\n" + link;
      var to = user.get("email");
      var subject = 'Please verify your e-mail for ' + appName;
      return { text: text, to: to, subject: subject };
    }
  }, {
    key: 'defaultResetPasswordEmail',
    value: function defaultResetPasswordEmail(_ref2) {
      var link = _ref2.link;
      var user = _ref2.user;
      var appName = _ref2.appName;

      var text = "Hi,\n\n" + "You requested to reset your password for " + appName + ".\n\n" + "" + "Click here to reset it:\n" + link;
      var to = user.get("email") || user.get('username');
      var subject = 'Password Reset for ' + appName;
      return { text: text, to: to, subject: subject };
    }
  }, {
    key: 'shouldVerifyEmails',
    get: function get() {
      return this.options.verifyUserEmails;
    }
  }]);

  return UserController;
}(_AdaptableController3.default);

// Mark this private


function updateUserPassword(userId, password, config) {
  return _rest2.default.update(config, Auth.master(config), '_User', userId, {
    password: password
  });
}

exports.default = UserController;