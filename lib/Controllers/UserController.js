"use strict";

Object.defineProperty(exports, "__esModule", {
  value: true
});
exports.default = exports.UserController = void 0;
var _cryptoUtils = require("../cryptoUtils");
var _triggers = require("../triggers");
var _AdaptableController = _interopRequireDefault(require("./AdaptableController"));
var _MailAdapter = _interopRequireDefault(require("../Adapters/Email/MailAdapter"));
var _rest = _interopRequireDefault(require("../rest"));
var _node = _interopRequireDefault(require("parse/node"));
var _AccountLockout = _interopRequireDefault(require("../AccountLockout"));
var _Config = _interopRequireDefault(require("../Config"));
function _interopRequireDefault(obj) { return obj && obj.__esModule ? obj : { default: obj }; }
function ownKeys(object, enumerableOnly) { var keys = Object.keys(object); if (Object.getOwnPropertySymbols) { var symbols = Object.getOwnPropertySymbols(object); enumerableOnly && (symbols = symbols.filter(function (sym) { return Object.getOwnPropertyDescriptor(object, sym).enumerable; })), keys.push.apply(keys, symbols); } return keys; }
function _objectSpread(target) { for (var i = 1; i < arguments.length; i++) { var source = null != arguments[i] ? arguments[i] : {}; i % 2 ? ownKeys(Object(source), !0).forEach(function (key) { _defineProperty(target, key, source[key]); }) : Object.getOwnPropertyDescriptors ? Object.defineProperties(target, Object.getOwnPropertyDescriptors(source)) : ownKeys(Object(source)).forEach(function (key) { Object.defineProperty(target, key, Object.getOwnPropertyDescriptor(source, key)); }); } return target; }
function _defineProperty(obj, key, value) { key = _toPropertyKey(key); if (key in obj) { Object.defineProperty(obj, key, { value: value, enumerable: true, configurable: true, writable: true }); } else { obj[key] = value; } return obj; }
function _toPropertyKey(arg) { var key = _toPrimitive(arg, "string"); return typeof key === "symbol" ? key : String(key); }
function _toPrimitive(input, hint) { if (typeof input !== "object" || input === null) return input; var prim = input[Symbol.toPrimitive]; if (prim !== undefined) { var res = prim.call(input, hint || "default"); if (typeof res !== "object") return res; throw new TypeError("@@toPrimitive must return a primitive value."); } return (hint === "string" ? String : Number)(input); }
var RestQuery = require('../RestQuery');
var Auth = require('../Auth');
class UserController extends _AdaptableController.default {
  constructor(adapter, appId, options = {}) {
    super(adapter, appId, options);
  }
  get config() {
    return _Config.default.get(this.appId);
  }
  validateAdapter(adapter) {
    // Allow no adapter
    if (!adapter && !this.shouldVerifyEmails) {
      return;
    }
    super.validateAdapter(adapter);
  }
  expectedAdapterType() {
    return _MailAdapter.default;
  }
  get shouldVerifyEmails() {
    return (this.config || this.options).verifyUserEmails;
  }
  async setEmailVerifyToken(user, req, storage = {}) {
    let shouldSendEmail = this.shouldVerifyEmails;
    if (typeof shouldSendEmail === 'function') {
      const response = await Promise.resolve(shouldSendEmail(req));
      shouldSendEmail = response !== false;
    }
    if (!shouldSendEmail) {
      return false;
    }
    storage.sendVerificationEmail = true;
    user._email_verify_token = (0, _cryptoUtils.randomString)(25);
    if (!storage.fieldsChangedByTrigger || !storage.fieldsChangedByTrigger.includes('emailVerified')) {
      user.emailVerified = false;
    }
    if (this.config.emailVerifyTokenValidityDuration) {
      user._email_verify_token_expires_at = _node.default._encode(this.config.generateEmailVerifyTokenExpiresAt());
    }
    return true;
  }
  async verifyEmail(username, token) {
    if (!this.shouldVerifyEmails) {
      // Trying to verify email when not enabled
      // TODO: Better error here.
      throw undefined;
    }
    const query = {
      username: username,
      _email_verify_token: token
    };
    const updateFields = {
      emailVerified: true,
      _email_verify_token: {
        __op: 'Delete'
      }
    };

    // if the email verify token needs to be validated then
    // add additional query params and additional fields that need to be updated
    if (this.config.emailVerifyTokenValidityDuration) {
      query.emailVerified = false;
      query._email_verify_token_expires_at = {
        $gt: _node.default._encode(new Date())
      };
      updateFields._email_verify_token_expires_at = {
        __op: 'Delete'
      };
    }
    const maintenanceAuth = Auth.maintenance(this.config);
    var findUserForEmailVerification = await RestQuery({
      method: RestQuery.Method.get,
      config: this.config,
      auth: maintenanceAuth,
      className: '_User',
      restWhere: {
        username
      }
    });
    return findUserForEmailVerification.execute().then(result => {
      if (result.results.length && result.results[0].emailVerified) {
        return Promise.resolve(result.results.length[0]);
      } else if (result.results.length) {
        query.objectId = result.results[0].objectId;
      }
      return _rest.default.update(this.config, maintenanceAuth, '_User', query, updateFields);
    });
  }
  checkResetTokenValidity(username, token) {
    return this.config.database.find('_User', {
      username: username,
      _perishable_token: token
    }, {
      limit: 1
    }, Auth.maintenance(this.config)).then(results => {
      if (results.length != 1) {
        throw 'Failed to reset password: username / email / token is invalid';
      }
      if (this.config.passwordPolicy && this.config.passwordPolicy.resetTokenValidityDuration) {
        let expiresDate = results[0]._perishable_token_expires_at;
        if (expiresDate && expiresDate.__type == 'Date') {
          expiresDate = new Date(expiresDate.iso);
        }
        if (expiresDate < new Date()) throw 'The password reset link has expired';
      }
      return results[0];
    });
  }
  async getUserIfNeeded(user) {
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
    var query = await RestQuery({
      method: RestQuery.Method.get,
      config: this.config,
      runBeforeFind: false,
      auth: Auth.master(this.config),
      className: '_User',
      restWhere: where
    });
    return query.execute().then(function (result) {
      if (result.results.length != 1) {
        throw undefined;
      }
      return result.results[0];
    });
  }
  async sendVerificationEmail(user, req) {
    if (!this.shouldVerifyEmails) {
      return;
    }
    const token = encodeURIComponent(user._email_verify_token);
    // We may need to fetch the user in case of update email
    const fetchedUser = await this.getUserIfNeeded(user);
    let shouldSendEmail = this.config.sendUserEmailVerification;
    if (typeof shouldSendEmail === 'function') {
      var _req$auth;
      const response = await Promise.resolve(this.config.sendUserEmailVerification({
        user: _node.default.Object.fromJSON(_objectSpread({
          className: '_User'
        }, fetchedUser)),
        master: (_req$auth = req.auth) === null || _req$auth === void 0 ? void 0 : _req$auth.isMaster
      }));
      shouldSendEmail = !!response;
    }
    if (!shouldSendEmail) {
      return;
    }
    const username = encodeURIComponent(user.username);
    const link = buildEmailLink(this.config.verifyEmailURL, username, token, this.config);
    const options = {
      appName: this.config.appName,
      link: link,
      user: (0, _triggers.inflate)('_User', fetchedUser)
    };
    if (this.adapter.sendVerificationEmail) {
      this.adapter.sendVerificationEmail(options);
    } else {
      this.adapter.sendMail(this.defaultVerificationEmail(options));
    }
  }

  /**
   * Regenerates the given user's email verification token
   *
   * @param user
   * @returns {*}
   */
  async regenerateEmailVerifyToken(user, master) {
    const {
      _email_verify_token
    } = user;
    let {
      _email_verify_token_expires_at
    } = user;
    if (_email_verify_token_expires_at && _email_verify_token_expires_at.__type === 'Date') {
      _email_verify_token_expires_at = _email_verify_token_expires_at.iso;
    }
    if (this.config.emailVerifyTokenReuseIfValid && this.config.emailVerifyTokenValidityDuration && _email_verify_token && new Date() < new Date(_email_verify_token_expires_at)) {
      return Promise.resolve();
    }
    const shouldSend = await this.setEmailVerifyToken(user, {
      user,
      master
    });
    if (!shouldSend) {
      return;
    }
    return this.config.database.update('_User', {
      username: user.username
    }, user);
  }
  async resendVerificationEmail(username, req) {
    var _req$auth2;
    const aUser = await this.getUserIfNeeded({
      username: username
    });
    if (!aUser || aUser.emailVerified) {
      throw undefined;
    }
    const generate = await this.regenerateEmailVerifyToken(aUser, (_req$auth2 = req.auth) === null || _req$auth2 === void 0 ? void 0 : _req$auth2.isMaster);
    if (generate) {
      this.sendVerificationEmail(aUser, req);
    }
  }
  setPasswordResetToken(email) {
    const token = {
      _perishable_token: (0, _cryptoUtils.randomString)(25)
    };
    if (this.config.passwordPolicy && this.config.passwordPolicy.resetTokenValidityDuration) {
      token._perishable_token_expires_at = _node.default._encode(this.config.generatePasswordResetTokenExpiresAt());
    }
    return this.config.database.update('_User', {
      $or: [{
        email
      }, {
        username: email,
        email: {
          $exists: false
        }
      }]
    }, token, {}, true);
  }
  async sendPasswordResetEmail(email) {
    if (!this.adapter) {
      throw 'Trying to send a reset password but no adapter is set';
      //  TODO: No adapter?
    }

    let user;
    if (this.config.passwordPolicy && this.config.passwordPolicy.resetTokenReuseIfValid && this.config.passwordPolicy.resetTokenValidityDuration) {
      const results = await this.config.database.find('_User', {
        $or: [{
          email,
          _perishable_token: {
            $exists: true
          }
        }, {
          username: email,
          email: {
            $exists: false
          },
          _perishable_token: {
            $exists: true
          }
        }]
      }, {
        limit: 1
      }, Auth.maintenance(this.config));
      if (results.length == 1) {
        let expiresDate = results[0]._perishable_token_expires_at;
        if (expiresDate && expiresDate.__type == 'Date') {
          expiresDate = new Date(expiresDate.iso);
        }
        if (expiresDate > new Date()) {
          user = results[0];
        }
      }
    }
    if (!user || !user._perishable_token) {
      user = await this.setPasswordResetToken(email);
    }
    const token = encodeURIComponent(user._perishable_token);
    const username = encodeURIComponent(user.username);
    const link = buildEmailLink(this.config.requestResetPasswordURL, username, token, this.config);
    const options = {
      appName: this.config.appName,
      link: link,
      user: (0, _triggers.inflate)('_User', user)
    };
    if (this.adapter.sendPasswordResetEmail) {
      this.adapter.sendPasswordResetEmail(options);
    } else {
      this.adapter.sendMail(this.defaultResetPasswordEmail(options));
    }
    return Promise.resolve(user);
  }
  updatePassword(username, token, password) {
    return this.checkResetTokenValidity(username, token).then(user => updateUserPassword(user, password, this.config)).then(user => {
      const accountLockoutPolicy = new _AccountLockout.default(user, this.config);
      return accountLockoutPolicy.unlockAccount();
    }).catch(error => {
      if (error && error.message) {
        // in case of Parse.Error, fail with the error message only
        return Promise.reject(error.message);
      } else {
        return Promise.reject(error);
      }
    });
  }
  defaultVerificationEmail({
    link,
    user,
    appName
  }) {
    const text = 'Hi,\n\n' + 'You are being asked to confirm the e-mail address ' + user.get('email') + ' with ' + appName + '\n\n' + '' + 'Click here to confirm it:\n' + link;
    const to = user.get('email');
    const subject = 'Please verify your e-mail for ' + appName;
    return {
      text,
      to,
      subject
    };
  }
  defaultResetPasswordEmail({
    link,
    user,
    appName
  }) {
    const text = 'Hi,\n\n' + 'You requested to reset your password for ' + appName + (user.get('username') ? " (your username is '" + user.get('username') + "')" : '') + '.\n\n' + '' + 'Click here to reset it:\n' + link;
    const to = user.get('email') || user.get('username');
    const subject = 'Password Reset for ' + appName;
    return {
      text,
      to,
      subject
    };
  }
}

// Mark this private
exports.UserController = UserController;
function updateUserPassword(user, password, config) {
  return _rest.default.update(config, Auth.master(config), '_User', {
    objectId: user.objectId
  }, {
    password: password
  }).then(() => user);
}
function buildEmailLink(destination, username, token, config) {
  const usernameAndToken = `token=${token}&username=${username}`;
  if (config.parseFrameURL) {
    const destinationWithoutHost = destination.replace(config.publicServerURL, '');
    return `${config.parseFrameURL}?link=${encodeURIComponent(destinationWithoutHost)}&${usernameAndToken}`;
  } else {
    return `${destination}?${usernameAndToken}`;
  }
}
var _default = UserController;
exports.default = _default;
//# sourceMappingURL=data:application/json;charset=utf-8;base64,eyJ2ZXJzaW9uIjozLCJuYW1lcyI6WyJSZXN0UXVlcnkiLCJyZXF1aXJlIiwiQXV0aCIsIlVzZXJDb250cm9sbGVyIiwiQWRhcHRhYmxlQ29udHJvbGxlciIsImNvbnN0cnVjdG9yIiwiYWRhcHRlciIsImFwcElkIiwib3B0aW9ucyIsImNvbmZpZyIsIkNvbmZpZyIsImdldCIsInZhbGlkYXRlQWRhcHRlciIsInNob3VsZFZlcmlmeUVtYWlscyIsImV4cGVjdGVkQWRhcHRlclR5cGUiLCJNYWlsQWRhcHRlciIsInZlcmlmeVVzZXJFbWFpbHMiLCJzZXRFbWFpbFZlcmlmeVRva2VuIiwidXNlciIsInJlcSIsInN0b3JhZ2UiLCJzaG91bGRTZW5kRW1haWwiLCJyZXNwb25zZSIsIlByb21pc2UiLCJyZXNvbHZlIiwic2VuZFZlcmlmaWNhdGlvbkVtYWlsIiwiX2VtYWlsX3ZlcmlmeV90b2tlbiIsInJhbmRvbVN0cmluZyIsImZpZWxkc0NoYW5nZWRCeVRyaWdnZXIiLCJpbmNsdWRlcyIsImVtYWlsVmVyaWZpZWQiLCJlbWFpbFZlcmlmeVRva2VuVmFsaWRpdHlEdXJhdGlvbiIsIl9lbWFpbF92ZXJpZnlfdG9rZW5fZXhwaXJlc19hdCIsIlBhcnNlIiwiX2VuY29kZSIsImdlbmVyYXRlRW1haWxWZXJpZnlUb2tlbkV4cGlyZXNBdCIsInZlcmlmeUVtYWlsIiwidXNlcm5hbWUiLCJ0b2tlbiIsInVuZGVmaW5lZCIsInF1ZXJ5IiwidXBkYXRlRmllbGRzIiwiX19vcCIsIiRndCIsIkRhdGUiLCJtYWludGVuYW5jZUF1dGgiLCJtYWludGVuYW5jZSIsImZpbmRVc2VyRm9yRW1haWxWZXJpZmljYXRpb24iLCJtZXRob2QiLCJNZXRob2QiLCJhdXRoIiwiY2xhc3NOYW1lIiwicmVzdFdoZXJlIiwiZXhlY3V0ZSIsInRoZW4iLCJyZXN1bHQiLCJyZXN1bHRzIiwibGVuZ3RoIiwib2JqZWN0SWQiLCJyZXN0IiwidXBkYXRlIiwiY2hlY2tSZXNldFRva2VuVmFsaWRpdHkiLCJkYXRhYmFzZSIsImZpbmQiLCJfcGVyaXNoYWJsZV90b2tlbiIsImxpbWl0IiwicGFzc3dvcmRQb2xpY3kiLCJyZXNldFRva2VuVmFsaWRpdHlEdXJhdGlvbiIsImV4cGlyZXNEYXRlIiwiX3BlcmlzaGFibGVfdG9rZW5fZXhwaXJlc19hdCIsIl9fdHlwZSIsImlzbyIsImdldFVzZXJJZk5lZWRlZCIsImVtYWlsIiwid2hlcmUiLCJydW5CZWZvcmVGaW5kIiwibWFzdGVyIiwiZW5jb2RlVVJJQ29tcG9uZW50IiwiZmV0Y2hlZFVzZXIiLCJzZW5kVXNlckVtYWlsVmVyaWZpY2F0aW9uIiwiT2JqZWN0IiwiZnJvbUpTT04iLCJpc01hc3RlciIsImxpbmsiLCJidWlsZEVtYWlsTGluayIsInZlcmlmeUVtYWlsVVJMIiwiYXBwTmFtZSIsImluZmxhdGUiLCJzZW5kTWFpbCIsImRlZmF1bHRWZXJpZmljYXRpb25FbWFpbCIsInJlZ2VuZXJhdGVFbWFpbFZlcmlmeVRva2VuIiwiZW1haWxWZXJpZnlUb2tlblJldXNlSWZWYWxpZCIsInNob3VsZFNlbmQiLCJyZXNlbmRWZXJpZmljYXRpb25FbWFpbCIsImFVc2VyIiwiZ2VuZXJhdGUiLCJzZXRQYXNzd29yZFJlc2V0VG9rZW4iLCJnZW5lcmF0ZVBhc3N3b3JkUmVzZXRUb2tlbkV4cGlyZXNBdCIsIiRvciIsIiRleGlzdHMiLCJzZW5kUGFzc3dvcmRSZXNldEVtYWlsIiwicmVzZXRUb2tlblJldXNlSWZWYWxpZCIsInJlcXVlc3RSZXNldFBhc3N3b3JkVVJMIiwiZGVmYXVsdFJlc2V0UGFzc3dvcmRFbWFpbCIsInVwZGF0ZVBhc3N3b3JkIiwicGFzc3dvcmQiLCJ1cGRhdGVVc2VyUGFzc3dvcmQiLCJhY2NvdW50TG9ja291dFBvbGljeSIsIkFjY291bnRMb2Nrb3V0IiwidW5sb2NrQWNjb3VudCIsImNhdGNoIiwiZXJyb3IiLCJtZXNzYWdlIiwicmVqZWN0IiwidGV4dCIsInRvIiwic3ViamVjdCIsImRlc3RpbmF0aW9uIiwidXNlcm5hbWVBbmRUb2tlbiIsInBhcnNlRnJhbWVVUkwiLCJkZXN0aW5hdGlvbldpdGhvdXRIb3N0IiwicmVwbGFjZSIsInB1YmxpY1NlcnZlclVSTCJdLCJzb3VyY2VzIjpbIi4uLy4uL3NyYy9Db250cm9sbGVycy9Vc2VyQ29udHJvbGxlci5qcyJdLCJzb3VyY2VzQ29udGVudCI6WyJpbXBvcnQgeyByYW5kb21TdHJpbmcgfSBmcm9tICcuLi9jcnlwdG9VdGlscyc7XG5pbXBvcnQgeyBpbmZsYXRlIH0gZnJvbSAnLi4vdHJpZ2dlcnMnO1xuaW1wb3J0IEFkYXB0YWJsZUNvbnRyb2xsZXIgZnJvbSAnLi9BZGFwdGFibGVDb250cm9sbGVyJztcbmltcG9ydCBNYWlsQWRhcHRlciBmcm9tICcuLi9BZGFwdGVycy9FbWFpbC9NYWlsQWRhcHRlcic7XG5pbXBvcnQgcmVzdCBmcm9tICcuLi9yZXN0JztcbmltcG9ydCBQYXJzZSBmcm9tICdwYXJzZS9ub2RlJztcbmltcG9ydCBBY2NvdW50TG9ja291dCBmcm9tICcuLi9BY2NvdW50TG9ja291dCc7XG5pbXBvcnQgQ29uZmlnIGZyb20gJy4uL0NvbmZpZyc7XG5cbnZhciBSZXN0UXVlcnkgPSByZXF1aXJlKCcuLi9SZXN0UXVlcnknKTtcbnZhciBBdXRoID0gcmVxdWlyZSgnLi4vQXV0aCcpO1xuXG5leHBvcnQgY2xhc3MgVXNlckNvbnRyb2xsZXIgZXh0ZW5kcyBBZGFwdGFibGVDb250cm9sbGVyIHtcbiAgY29uc3RydWN0b3IoYWRhcHRlciwgYXBwSWQsIG9wdGlvbnMgPSB7fSkge1xuICAgIHN1cGVyKGFkYXB0ZXIsIGFwcElkLCBvcHRpb25zKTtcbiAgfVxuXG4gIGdldCBjb25maWcoKSB7XG4gICAgcmV0dXJuIENvbmZpZy5nZXQodGhpcy5hcHBJZCk7XG4gIH1cblxuICB2YWxpZGF0ZUFkYXB0ZXIoYWRhcHRlcikge1xuICAgIC8vIEFsbG93IG5vIGFkYXB0ZXJcbiAgICBpZiAoIWFkYXB0ZXIgJiYgIXRoaXMuc2hvdWxkVmVyaWZ5RW1haWxzKSB7XG4gICAgICByZXR1cm47XG4gICAgfVxuICAgIHN1cGVyLnZhbGlkYXRlQWRhcHRlcihhZGFwdGVyKTtcbiAgfVxuXG4gIGV4cGVjdGVkQWRhcHRlclR5cGUoKSB7XG4gICAgcmV0dXJuIE1haWxBZGFwdGVyO1xuICB9XG5cbiAgZ2V0IHNob3VsZFZlcmlmeUVtYWlscygpIHtcbiAgICByZXR1cm4gKHRoaXMuY29uZmlnIHx8IHRoaXMub3B0aW9ucykudmVyaWZ5VXNlckVtYWlscztcbiAgfVxuXG4gIGFzeW5jIHNldEVtYWlsVmVyaWZ5VG9rZW4odXNlciwgcmVxLCBzdG9yYWdlID0ge30pIHtcbiAgICBsZXQgc2hvdWxkU2VuZEVtYWlsID0gdGhpcy5zaG91bGRWZXJpZnlFbWFpbHM7XG4gICAgaWYgKHR5cGVvZiBzaG91bGRTZW5kRW1haWwgPT09ICdmdW5jdGlvbicpIHtcbiAgICAgIGNvbnN0IHJlc3BvbnNlID0gYXdhaXQgUHJvbWlzZS5yZXNvbHZlKHNob3VsZFNlbmRFbWFpbChyZXEpKTtcbiAgICAgIHNob3VsZFNlbmRFbWFpbCA9IHJlc3BvbnNlICE9PSBmYWxzZTtcbiAgICB9XG4gICAgaWYgKCFzaG91bGRTZW5kRW1haWwpIHtcbiAgICAgIHJldHVybiBmYWxzZTtcbiAgICB9XG4gICAgc3RvcmFnZS5zZW5kVmVyaWZpY2F0aW9uRW1haWwgPSB0cnVlO1xuICAgIHVzZXIuX2VtYWlsX3ZlcmlmeV90b2tlbiA9IHJhbmRvbVN0cmluZygyNSk7XG4gICAgaWYgKFxuICAgICAgIXN0b3JhZ2UuZmllbGRzQ2hhbmdlZEJ5VHJpZ2dlciB8fFxuICAgICAgIXN0b3JhZ2UuZmllbGRzQ2hhbmdlZEJ5VHJpZ2dlci5pbmNsdWRlcygnZW1haWxWZXJpZmllZCcpXG4gICAgKSB7XG4gICAgICB1c2VyLmVtYWlsVmVyaWZpZWQgPSBmYWxzZTtcbiAgICB9XG5cbiAgICBpZiAodGhpcy5jb25maWcuZW1haWxWZXJpZnlUb2tlblZhbGlkaXR5RHVyYXRpb24pIHtcbiAgICAgIHVzZXIuX2VtYWlsX3ZlcmlmeV90b2tlbl9leHBpcmVzX2F0ID0gUGFyc2UuX2VuY29kZShcbiAgICAgICAgdGhpcy5jb25maWcuZ2VuZXJhdGVFbWFpbFZlcmlmeVRva2VuRXhwaXJlc0F0KClcbiAgICAgICk7XG4gICAgfVxuICAgIHJldHVybiB0cnVlO1xuICB9XG5cbiAgYXN5bmMgdmVyaWZ5RW1haWwodXNlcm5hbWUsIHRva2VuKSB7XG4gICAgaWYgKCF0aGlzLnNob3VsZFZlcmlmeUVtYWlscykge1xuICAgICAgLy8gVHJ5aW5nIHRvIHZlcmlmeSBlbWFpbCB3aGVuIG5vdCBlbmFibGVkXG4gICAgICAvLyBUT0RPOiBCZXR0ZXIgZXJyb3IgaGVyZS5cbiAgICAgIHRocm93IHVuZGVmaW5lZDtcbiAgICB9XG5cbiAgICBjb25zdCBxdWVyeSA9IHsgdXNlcm5hbWU6IHVzZXJuYW1lLCBfZW1haWxfdmVyaWZ5X3Rva2VuOiB0b2tlbiB9O1xuICAgIGNvbnN0IHVwZGF0ZUZpZWxkcyA9IHtcbiAgICAgIGVtYWlsVmVyaWZpZWQ6IHRydWUsXG4gICAgICBfZW1haWxfdmVyaWZ5X3Rva2VuOiB7IF9fb3A6ICdEZWxldGUnIH0sXG4gICAgfTtcblxuICAgIC8vIGlmIHRoZSBlbWFpbCB2ZXJpZnkgdG9rZW4gbmVlZHMgdG8gYmUgdmFsaWRhdGVkIHRoZW5cbiAgICAvLyBhZGQgYWRkaXRpb25hbCBxdWVyeSBwYXJhbXMgYW5kIGFkZGl0aW9uYWwgZmllbGRzIHRoYXQgbmVlZCB0byBiZSB1cGRhdGVkXG4gICAgaWYgKHRoaXMuY29uZmlnLmVtYWlsVmVyaWZ5VG9rZW5WYWxpZGl0eUR1cmF0aW9uKSB7XG4gICAgICBxdWVyeS5lbWFpbFZlcmlmaWVkID0gZmFsc2U7XG4gICAgICBxdWVyeS5fZW1haWxfdmVyaWZ5X3Rva2VuX2V4cGlyZXNfYXQgPSB7ICRndDogUGFyc2UuX2VuY29kZShuZXcgRGF0ZSgpKSB9O1xuXG4gICAgICB1cGRhdGVGaWVsZHMuX2VtYWlsX3ZlcmlmeV90b2tlbl9leHBpcmVzX2F0ID0geyBfX29wOiAnRGVsZXRlJyB9O1xuICAgIH1cbiAgICBjb25zdCBtYWludGVuYW5jZUF1dGggPSBBdXRoLm1haW50ZW5hbmNlKHRoaXMuY29uZmlnKTtcbiAgICB2YXIgZmluZFVzZXJGb3JFbWFpbFZlcmlmaWNhdGlvbiA9IGF3YWl0IFJlc3RRdWVyeSh7XG4gICAgICBtZXRob2Q6IFJlc3RRdWVyeS5NZXRob2QuZ2V0LFxuICAgICAgY29uZmlnOiB0aGlzLmNvbmZpZyxcbiAgICAgIGF1dGg6IG1haW50ZW5hbmNlQXV0aCxcbiAgICAgIGNsYXNzTmFtZTogJ19Vc2VyJyxcbiAgICAgIHJlc3RXaGVyZToge1xuICAgICAgICB1c2VybmFtZSxcbiAgICAgIH0sXG4gICAgfSk7XG4gICAgcmV0dXJuIGZpbmRVc2VyRm9yRW1haWxWZXJpZmljYXRpb24uZXhlY3V0ZSgpLnRoZW4ocmVzdWx0ID0+IHtcbiAgICAgIGlmIChyZXN1bHQucmVzdWx0cy5sZW5ndGggJiYgcmVzdWx0LnJlc3VsdHNbMF0uZW1haWxWZXJpZmllZCkge1xuICAgICAgICByZXR1cm4gUHJvbWlzZS5yZXNvbHZlKHJlc3VsdC5yZXN1bHRzLmxlbmd0aFswXSk7XG4gICAgICB9IGVsc2UgaWYgKHJlc3VsdC5yZXN1bHRzLmxlbmd0aCkge1xuICAgICAgICBxdWVyeS5vYmplY3RJZCA9IHJlc3VsdC5yZXN1bHRzWzBdLm9iamVjdElkO1xuICAgICAgfVxuICAgICAgcmV0dXJuIHJlc3QudXBkYXRlKHRoaXMuY29uZmlnLCBtYWludGVuYW5jZUF1dGgsICdfVXNlcicsIHF1ZXJ5LCB1cGRhdGVGaWVsZHMpO1xuICAgIH0pO1xuICB9XG5cbiAgY2hlY2tSZXNldFRva2VuVmFsaWRpdHkodXNlcm5hbWUsIHRva2VuKSB7XG4gICAgcmV0dXJuIHRoaXMuY29uZmlnLmRhdGFiYXNlXG4gICAgICAuZmluZChcbiAgICAgICAgJ19Vc2VyJyxcbiAgICAgICAge1xuICAgICAgICAgIHVzZXJuYW1lOiB1c2VybmFtZSxcbiAgICAgICAgICBfcGVyaXNoYWJsZV90b2tlbjogdG9rZW4sXG4gICAgICAgIH0sXG4gICAgICAgIHsgbGltaXQ6IDEgfSxcbiAgICAgICAgQXV0aC5tYWludGVuYW5jZSh0aGlzLmNvbmZpZylcbiAgICAgIClcbiAgICAgIC50aGVuKHJlc3VsdHMgPT4ge1xuICAgICAgICBpZiAocmVzdWx0cy5sZW5ndGggIT0gMSkge1xuICAgICAgICAgIHRocm93ICdGYWlsZWQgdG8gcmVzZXQgcGFzc3dvcmQ6IHVzZXJuYW1lIC8gZW1haWwgLyB0b2tlbiBpcyBpbnZhbGlkJztcbiAgICAgICAgfVxuXG4gICAgICAgIGlmICh0aGlzLmNvbmZpZy5wYXNzd29yZFBvbGljeSAmJiB0aGlzLmNvbmZpZy5wYXNzd29yZFBvbGljeS5yZXNldFRva2VuVmFsaWRpdHlEdXJhdGlvbikge1xuICAgICAgICAgIGxldCBleHBpcmVzRGF0ZSA9IHJlc3VsdHNbMF0uX3BlcmlzaGFibGVfdG9rZW5fZXhwaXJlc19hdDtcbiAgICAgICAgICBpZiAoZXhwaXJlc0RhdGUgJiYgZXhwaXJlc0RhdGUuX190eXBlID09ICdEYXRlJykge1xuICAgICAgICAgICAgZXhwaXJlc0RhdGUgPSBuZXcgRGF0ZShleHBpcmVzRGF0ZS5pc28pO1xuICAgICAgICAgIH1cbiAgICAgICAgICBpZiAoZXhwaXJlc0RhdGUgPCBuZXcgRGF0ZSgpKSB0aHJvdyAnVGhlIHBhc3N3b3JkIHJlc2V0IGxpbmsgaGFzIGV4cGlyZWQnO1xuICAgICAgICB9XG4gICAgICAgIHJldHVybiByZXN1bHRzWzBdO1xuICAgICAgfSk7XG4gIH1cblxuICBhc3luYyBnZXRVc2VySWZOZWVkZWQodXNlcikge1xuICAgIGlmICh1c2VyLnVzZXJuYW1lICYmIHVzZXIuZW1haWwpIHtcbiAgICAgIHJldHVybiBQcm9taXNlLnJlc29sdmUodXNlcik7XG4gICAgfVxuICAgIHZhciB3aGVyZSA9IHt9O1xuICAgIGlmICh1c2VyLnVzZXJuYW1lKSB7XG4gICAgICB3aGVyZS51c2VybmFtZSA9IHVzZXIudXNlcm5hbWU7XG4gICAgfVxuICAgIGlmICh1c2VyLmVtYWlsKSB7XG4gICAgICB3aGVyZS5lbWFpbCA9IHVzZXIuZW1haWw7XG4gICAgfVxuXG4gICAgdmFyIHF1ZXJ5ID0gYXdhaXQgUmVzdFF1ZXJ5KHtcbiAgICAgIG1ldGhvZDogUmVzdFF1ZXJ5Lk1ldGhvZC5nZXQsXG4gICAgICBjb25maWc6IHRoaXMuY29uZmlnLFxuICAgICAgcnVuQmVmb3JlRmluZDogZmFsc2UsXG4gICAgICBhdXRoOiBBdXRoLm1hc3Rlcih0aGlzLmNvbmZpZyksXG4gICAgICBjbGFzc05hbWU6ICdfVXNlcicsXG4gICAgICByZXN0V2hlcmU6IHdoZXJlLFxuICAgIH0pO1xuICAgIHJldHVybiBxdWVyeS5leGVjdXRlKCkudGhlbihmdW5jdGlvbiAocmVzdWx0KSB7XG4gICAgICBpZiAocmVzdWx0LnJlc3VsdHMubGVuZ3RoICE9IDEpIHtcbiAgICAgICAgdGhyb3cgdW5kZWZpbmVkO1xuICAgICAgfVxuICAgICAgcmV0dXJuIHJlc3VsdC5yZXN1bHRzWzBdO1xuICAgIH0pO1xuICB9XG5cbiAgYXN5bmMgc2VuZFZlcmlmaWNhdGlvbkVtYWlsKHVzZXIsIHJlcSkge1xuICAgIGlmICghdGhpcy5zaG91bGRWZXJpZnlFbWFpbHMpIHtcbiAgICAgIHJldHVybjtcbiAgICB9XG4gICAgY29uc3QgdG9rZW4gPSBlbmNvZGVVUklDb21wb25lbnQodXNlci5fZW1haWxfdmVyaWZ5X3Rva2VuKTtcbiAgICAvLyBXZSBtYXkgbmVlZCB0byBmZXRjaCB0aGUgdXNlciBpbiBjYXNlIG9mIHVwZGF0ZSBlbWFpbFxuICAgIGNvbnN0IGZldGNoZWRVc2VyID0gYXdhaXQgdGhpcy5nZXRVc2VySWZOZWVkZWQodXNlcik7XG4gICAgbGV0IHNob3VsZFNlbmRFbWFpbCA9IHRoaXMuY29uZmlnLnNlbmRVc2VyRW1haWxWZXJpZmljYXRpb247XG4gICAgaWYgKHR5cGVvZiBzaG91bGRTZW5kRW1haWwgPT09ICdmdW5jdGlvbicpIHtcbiAgICAgIGNvbnN0IHJlc3BvbnNlID0gYXdhaXQgUHJvbWlzZS5yZXNvbHZlKFxuICAgICAgICB0aGlzLmNvbmZpZy5zZW5kVXNlckVtYWlsVmVyaWZpY2F0aW9uKHtcbiAgICAgICAgICB1c2VyOiBQYXJzZS5PYmplY3QuZnJvbUpTT04oeyBjbGFzc05hbWU6ICdfVXNlcicsIC4uLmZldGNoZWRVc2VyIH0pLFxuICAgICAgICAgIG1hc3RlcjogcmVxLmF1dGg/LmlzTWFzdGVyLFxuICAgICAgICB9KVxuICAgICAgKTtcbiAgICAgIHNob3VsZFNlbmRFbWFpbCA9ICEhcmVzcG9uc2U7XG4gICAgfVxuICAgIGlmICghc2hvdWxkU2VuZEVtYWlsKSB7XG4gICAgICByZXR1cm47XG4gICAgfVxuICAgIGNvbnN0IHVzZXJuYW1lID0gZW5jb2RlVVJJQ29tcG9uZW50KHVzZXIudXNlcm5hbWUpO1xuXG4gICAgY29uc3QgbGluayA9IGJ1aWxkRW1haWxMaW5rKHRoaXMuY29uZmlnLnZlcmlmeUVtYWlsVVJMLCB1c2VybmFtZSwgdG9rZW4sIHRoaXMuY29uZmlnKTtcbiAgICBjb25zdCBvcHRpb25zID0ge1xuICAgICAgYXBwTmFtZTogdGhpcy5jb25maWcuYXBwTmFtZSxcbiAgICAgIGxpbms6IGxpbmssXG4gICAgICB1c2VyOiBpbmZsYXRlKCdfVXNlcicsIGZldGNoZWRVc2VyKSxcbiAgICB9O1xuICAgIGlmICh0aGlzLmFkYXB0ZXIuc2VuZFZlcmlmaWNhdGlvbkVtYWlsKSB7XG4gICAgICB0aGlzLmFkYXB0ZXIuc2VuZFZlcmlmaWNhdGlvbkVtYWlsKG9wdGlvbnMpO1xuICAgIH0gZWxzZSB7XG4gICAgICB0aGlzLmFkYXB0ZXIuc2VuZE1haWwodGhpcy5kZWZhdWx0VmVyaWZpY2F0aW9uRW1haWwob3B0aW9ucykpO1xuICAgIH1cbiAgfVxuXG4gIC8qKlxuICAgKiBSZWdlbmVyYXRlcyB0aGUgZ2l2ZW4gdXNlcidzIGVtYWlsIHZlcmlmaWNhdGlvbiB0b2tlblxuICAgKlxuICAgKiBAcGFyYW0gdXNlclxuICAgKiBAcmV0dXJucyB7Kn1cbiAgICovXG4gIGFzeW5jIHJlZ2VuZXJhdGVFbWFpbFZlcmlmeVRva2VuKHVzZXIsIG1hc3Rlcikge1xuICAgIGNvbnN0IHsgX2VtYWlsX3ZlcmlmeV90b2tlbiB9ID0gdXNlcjtcbiAgICBsZXQgeyBfZW1haWxfdmVyaWZ5X3Rva2VuX2V4cGlyZXNfYXQgfSA9IHVzZXI7XG4gICAgaWYgKF9lbWFpbF92ZXJpZnlfdG9rZW5fZXhwaXJlc19hdCAmJiBfZW1haWxfdmVyaWZ5X3Rva2VuX2V4cGlyZXNfYXQuX190eXBlID09PSAnRGF0ZScpIHtcbiAgICAgIF9lbWFpbF92ZXJpZnlfdG9rZW5fZXhwaXJlc19hdCA9IF9lbWFpbF92ZXJpZnlfdG9rZW5fZXhwaXJlc19hdC5pc287XG4gICAgfVxuICAgIGlmIChcbiAgICAgIHRoaXMuY29uZmlnLmVtYWlsVmVyaWZ5VG9rZW5SZXVzZUlmVmFsaWQgJiZcbiAgICAgIHRoaXMuY29uZmlnLmVtYWlsVmVyaWZ5VG9rZW5WYWxpZGl0eUR1cmF0aW9uICYmXG4gICAgICBfZW1haWxfdmVyaWZ5X3Rva2VuICYmXG4gICAgICBuZXcgRGF0ZSgpIDwgbmV3IERhdGUoX2VtYWlsX3ZlcmlmeV90b2tlbl9leHBpcmVzX2F0KVxuICAgICkge1xuICAgICAgcmV0dXJuIFByb21pc2UucmVzb2x2ZSgpO1xuICAgIH1cbiAgICBjb25zdCBzaG91bGRTZW5kID0gYXdhaXQgdGhpcy5zZXRFbWFpbFZlcmlmeVRva2VuKHVzZXIsIHsgdXNlciwgbWFzdGVyIH0pO1xuICAgIGlmICghc2hvdWxkU2VuZCkge1xuICAgICAgcmV0dXJuO1xuICAgIH1cbiAgICByZXR1cm4gdGhpcy5jb25maWcuZGF0YWJhc2UudXBkYXRlKCdfVXNlcicsIHsgdXNlcm5hbWU6IHVzZXIudXNlcm5hbWUgfSwgdXNlcik7XG4gIH1cblxuICBhc3luYyByZXNlbmRWZXJpZmljYXRpb25FbWFpbCh1c2VybmFtZSwgcmVxKSB7XG4gICAgY29uc3QgYVVzZXIgPSBhd2FpdCB0aGlzLmdldFVzZXJJZk5lZWRlZCh7IHVzZXJuYW1lOiB1c2VybmFtZSB9KTtcbiAgICBpZiAoIWFVc2VyIHx8IGFVc2VyLmVtYWlsVmVyaWZpZWQpIHtcbiAgICAgIHRocm93IHVuZGVmaW5lZDtcbiAgICB9XG4gICAgY29uc3QgZ2VuZXJhdGUgPSBhd2FpdCB0aGlzLnJlZ2VuZXJhdGVFbWFpbFZlcmlmeVRva2VuKGFVc2VyLCByZXEuYXV0aD8uaXNNYXN0ZXIpO1xuICAgIGlmIChnZW5lcmF0ZSkge1xuICAgICAgdGhpcy5zZW5kVmVyaWZpY2F0aW9uRW1haWwoYVVzZXIsIHJlcSk7XG4gICAgfVxuICB9XG5cbiAgc2V0UGFzc3dvcmRSZXNldFRva2VuKGVtYWlsKSB7XG4gICAgY29uc3QgdG9rZW4gPSB7IF9wZXJpc2hhYmxlX3Rva2VuOiByYW5kb21TdHJpbmcoMjUpIH07XG5cbiAgICBpZiAodGhpcy5jb25maWcucGFzc3dvcmRQb2xpY3kgJiYgdGhpcy5jb25maWcucGFzc3dvcmRQb2xpY3kucmVzZXRUb2tlblZhbGlkaXR5RHVyYXRpb24pIHtcbiAgICAgIHRva2VuLl9wZXJpc2hhYmxlX3Rva2VuX2V4cGlyZXNfYXQgPSBQYXJzZS5fZW5jb2RlKFxuICAgICAgICB0aGlzLmNvbmZpZy5nZW5lcmF0ZVBhc3N3b3JkUmVzZXRUb2tlbkV4cGlyZXNBdCgpXG4gICAgICApO1xuICAgIH1cblxuICAgIHJldHVybiB0aGlzLmNvbmZpZy5kYXRhYmFzZS51cGRhdGUoXG4gICAgICAnX1VzZXInLFxuICAgICAgeyAkb3I6IFt7IGVtYWlsIH0sIHsgdXNlcm5hbWU6IGVtYWlsLCBlbWFpbDogeyAkZXhpc3RzOiBmYWxzZSB9IH1dIH0sXG4gICAgICB0b2tlbixcbiAgICAgIHt9LFxuICAgICAgdHJ1ZVxuICAgICk7XG4gIH1cblxuICBhc3luYyBzZW5kUGFzc3dvcmRSZXNldEVtYWlsKGVtYWlsKSB7XG4gICAgaWYgKCF0aGlzLmFkYXB0ZXIpIHtcbiAgICAgIHRocm93ICdUcnlpbmcgdG8gc2VuZCBhIHJlc2V0IHBhc3N3b3JkIGJ1dCBubyBhZGFwdGVyIGlzIHNldCc7XG4gICAgICAvLyAgVE9ETzogTm8gYWRhcHRlcj9cbiAgICB9XG4gICAgbGV0IHVzZXI7XG4gICAgaWYgKFxuICAgICAgdGhpcy5jb25maWcucGFzc3dvcmRQb2xpY3kgJiZcbiAgICAgIHRoaXMuY29uZmlnLnBhc3N3b3JkUG9saWN5LnJlc2V0VG9rZW5SZXVzZUlmVmFsaWQgJiZcbiAgICAgIHRoaXMuY29uZmlnLnBhc3N3b3JkUG9saWN5LnJlc2V0VG9rZW5WYWxpZGl0eUR1cmF0aW9uXG4gICAgKSB7XG4gICAgICBjb25zdCByZXN1bHRzID0gYXdhaXQgdGhpcy5jb25maWcuZGF0YWJhc2UuZmluZChcbiAgICAgICAgJ19Vc2VyJyxcbiAgICAgICAge1xuICAgICAgICAgICRvcjogW1xuICAgICAgICAgICAgeyBlbWFpbCwgX3BlcmlzaGFibGVfdG9rZW46IHsgJGV4aXN0czogdHJ1ZSB9IH0sXG4gICAgICAgICAgICB7IHVzZXJuYW1lOiBlbWFpbCwgZW1haWw6IHsgJGV4aXN0czogZmFsc2UgfSwgX3BlcmlzaGFibGVfdG9rZW46IHsgJGV4aXN0czogdHJ1ZSB9IH0sXG4gICAgICAgICAgXSxcbiAgICAgICAgfSxcbiAgICAgICAgeyBsaW1pdDogMSB9LFxuICAgICAgICBBdXRoLm1haW50ZW5hbmNlKHRoaXMuY29uZmlnKVxuICAgICAgKTtcbiAgICAgIGlmIChyZXN1bHRzLmxlbmd0aCA9PSAxKSB7XG4gICAgICAgIGxldCBleHBpcmVzRGF0ZSA9IHJlc3VsdHNbMF0uX3BlcmlzaGFibGVfdG9rZW5fZXhwaXJlc19hdDtcbiAgICAgICAgaWYgKGV4cGlyZXNEYXRlICYmIGV4cGlyZXNEYXRlLl9fdHlwZSA9PSAnRGF0ZScpIHtcbiAgICAgICAgICBleHBpcmVzRGF0ZSA9IG5ldyBEYXRlKGV4cGlyZXNEYXRlLmlzbyk7XG4gICAgICAgIH1cbiAgICAgICAgaWYgKGV4cGlyZXNEYXRlID4gbmV3IERhdGUoKSkge1xuICAgICAgICAgIHVzZXIgPSByZXN1bHRzWzBdO1xuICAgICAgICB9XG4gICAgICB9XG4gICAgfVxuICAgIGlmICghdXNlciB8fCAhdXNlci5fcGVyaXNoYWJsZV90b2tlbikge1xuICAgICAgdXNlciA9IGF3YWl0IHRoaXMuc2V0UGFzc3dvcmRSZXNldFRva2VuKGVtYWlsKTtcbiAgICB9XG4gICAgY29uc3QgdG9rZW4gPSBlbmNvZGVVUklDb21wb25lbnQodXNlci5fcGVyaXNoYWJsZV90b2tlbik7XG4gICAgY29uc3QgdXNlcm5hbWUgPSBlbmNvZGVVUklDb21wb25lbnQodXNlci51c2VybmFtZSk7XG5cbiAgICBjb25zdCBsaW5rID0gYnVpbGRFbWFpbExpbmsodGhpcy5jb25maWcucmVxdWVzdFJlc2V0UGFzc3dvcmRVUkwsIHVzZXJuYW1lLCB0b2tlbiwgdGhpcy5jb25maWcpO1xuICAgIGNvbnN0IG9wdGlvbnMgPSB7XG4gICAgICBhcHBOYW1lOiB0aGlzLmNvbmZpZy5hcHBOYW1lLFxuICAgICAgbGluazogbGluayxcbiAgICAgIHVzZXI6IGluZmxhdGUoJ19Vc2VyJywgdXNlciksXG4gICAgfTtcblxuICAgIGlmICh0aGlzLmFkYXB0ZXIuc2VuZFBhc3N3b3JkUmVzZXRFbWFpbCkge1xuICAgICAgdGhpcy5hZGFwdGVyLnNlbmRQYXNzd29yZFJlc2V0RW1haWwob3B0aW9ucyk7XG4gICAgfSBlbHNlIHtcbiAgICAgIHRoaXMuYWRhcHRlci5zZW5kTWFpbCh0aGlzLmRlZmF1bHRSZXNldFBhc3N3b3JkRW1haWwob3B0aW9ucykpO1xuICAgIH1cblxuICAgIHJldHVybiBQcm9taXNlLnJlc29sdmUodXNlcik7XG4gIH1cblxuICB1cGRhdGVQYXNzd29yZCh1c2VybmFtZSwgdG9rZW4sIHBhc3N3b3JkKSB7XG4gICAgcmV0dXJuIHRoaXMuY2hlY2tSZXNldFRva2VuVmFsaWRpdHkodXNlcm5hbWUsIHRva2VuKVxuICAgICAgLnRoZW4odXNlciA9PiB1cGRhdGVVc2VyUGFzc3dvcmQodXNlciwgcGFzc3dvcmQsIHRoaXMuY29uZmlnKSlcbiAgICAgIC50aGVuKHVzZXIgPT4ge1xuICAgICAgICBjb25zdCBhY2NvdW50TG9ja291dFBvbGljeSA9IG5ldyBBY2NvdW50TG9ja291dCh1c2VyLCB0aGlzLmNvbmZpZyk7XG4gICAgICAgIHJldHVybiBhY2NvdW50TG9ja291dFBvbGljeS51bmxvY2tBY2NvdW50KCk7XG4gICAgICB9KVxuICAgICAgLmNhdGNoKGVycm9yID0+IHtcbiAgICAgICAgaWYgKGVycm9yICYmIGVycm9yLm1lc3NhZ2UpIHtcbiAgICAgICAgICAvLyBpbiBjYXNlIG9mIFBhcnNlLkVycm9yLCBmYWlsIHdpdGggdGhlIGVycm9yIG1lc3NhZ2Ugb25seVxuICAgICAgICAgIHJldHVybiBQcm9taXNlLnJlamVjdChlcnJvci5tZXNzYWdlKTtcbiAgICAgICAgfSBlbHNlIHtcbiAgICAgICAgICByZXR1cm4gUHJvbWlzZS5yZWplY3QoZXJyb3IpO1xuICAgICAgICB9XG4gICAgICB9KTtcbiAgfVxuXG4gIGRlZmF1bHRWZXJpZmljYXRpb25FbWFpbCh7IGxpbmssIHVzZXIsIGFwcE5hbWUgfSkge1xuICAgIGNvbnN0IHRleHQgPVxuICAgICAgJ0hpLFxcblxcbicgK1xuICAgICAgJ1lvdSBhcmUgYmVpbmcgYXNrZWQgdG8gY29uZmlybSB0aGUgZS1tYWlsIGFkZHJlc3MgJyArXG4gICAgICB1c2VyLmdldCgnZW1haWwnKSArXG4gICAgICAnIHdpdGggJyArXG4gICAgICBhcHBOYW1lICtcbiAgICAgICdcXG5cXG4nICtcbiAgICAgICcnICtcbiAgICAgICdDbGljayBoZXJlIHRvIGNvbmZpcm0gaXQ6XFxuJyArXG4gICAgICBsaW5rO1xuICAgIGNvbnN0IHRvID0gdXNlci5nZXQoJ2VtYWlsJyk7XG4gICAgY29uc3Qgc3ViamVjdCA9ICdQbGVhc2UgdmVyaWZ5IHlvdXIgZS1tYWlsIGZvciAnICsgYXBwTmFtZTtcbiAgICByZXR1cm4geyB0ZXh0LCB0bywgc3ViamVjdCB9O1xuICB9XG5cbiAgZGVmYXVsdFJlc2V0UGFzc3dvcmRFbWFpbCh7IGxpbmssIHVzZXIsIGFwcE5hbWUgfSkge1xuICAgIGNvbnN0IHRleHQgPVxuICAgICAgJ0hpLFxcblxcbicgK1xuICAgICAgJ1lvdSByZXF1ZXN0ZWQgdG8gcmVzZXQgeW91ciBwYXNzd29yZCBmb3IgJyArXG4gICAgICBhcHBOYW1lICtcbiAgICAgICh1c2VyLmdldCgndXNlcm5hbWUnKSA/IFwiICh5b3VyIHVzZXJuYW1lIGlzICdcIiArIHVzZXIuZ2V0KCd1c2VybmFtZScpICsgXCInKVwiIDogJycpICtcbiAgICAgICcuXFxuXFxuJyArXG4gICAgICAnJyArXG4gICAgICAnQ2xpY2sgaGVyZSB0byByZXNldCBpdDpcXG4nICtcbiAgICAgIGxpbms7XG4gICAgY29uc3QgdG8gPSB1c2VyLmdldCgnZW1haWwnKSB8fCB1c2VyLmdldCgndXNlcm5hbWUnKTtcbiAgICBjb25zdCBzdWJqZWN0ID0gJ1Bhc3N3b3JkIFJlc2V0IGZvciAnICsgYXBwTmFtZTtcbiAgICByZXR1cm4geyB0ZXh0LCB0bywgc3ViamVjdCB9O1xuICB9XG59XG5cbi8vIE1hcmsgdGhpcyBwcml2YXRlXG5mdW5jdGlvbiB1cGRhdGVVc2VyUGFzc3dvcmQodXNlciwgcGFzc3dvcmQsIGNvbmZpZykge1xuICByZXR1cm4gcmVzdFxuICAgIC51cGRhdGUoXG4gICAgICBjb25maWcsXG4gICAgICBBdXRoLm1hc3Rlcihjb25maWcpLFxuICAgICAgJ19Vc2VyJyxcbiAgICAgIHsgb2JqZWN0SWQ6IHVzZXIub2JqZWN0SWQgfSxcbiAgICAgIHtcbiAgICAgICAgcGFzc3dvcmQ6IHBhc3N3b3JkLFxuICAgICAgfVxuICAgIClcbiAgICAudGhlbigoKSA9PiB1c2VyKTtcbn1cblxuZnVuY3Rpb24gYnVpbGRFbWFpbExpbmsoZGVzdGluYXRpb24sIHVzZXJuYW1lLCB0b2tlbiwgY29uZmlnKSB7XG4gIGNvbnN0IHVzZXJuYW1lQW5kVG9rZW4gPSBgdG9rZW49JHt0b2tlbn0mdXNlcm5hbWU9JHt1c2VybmFtZX1gO1xuXG4gIGlmIChjb25maWcucGFyc2VGcmFtZVVSTCkge1xuICAgIGNvbnN0IGRlc3RpbmF0aW9uV2l0aG91dEhvc3QgPSBkZXN0aW5hdGlvbi5yZXBsYWNlKGNvbmZpZy5wdWJsaWNTZXJ2ZXJVUkwsICcnKTtcblxuICAgIHJldHVybiBgJHtjb25maWcucGFyc2VGcmFtZVVSTH0/bGluaz0ke2VuY29kZVVSSUNvbXBvbmVudChcbiAgICAgIGRlc3RpbmF0aW9uV2l0aG91dEhvc3RcbiAgICApfSYke3VzZXJuYW1lQW5kVG9rZW59YDtcbiAgfSBlbHNlIHtcbiAgICByZXR1cm4gYCR7ZGVzdGluYXRpb259PyR7dXNlcm5hbWVBbmRUb2tlbn1gO1xuICB9XG59XG5cbmV4cG9ydCBkZWZhdWx0IFVzZXJDb250cm9sbGVyO1xuIl0sIm1hcHBpbmdzIjoiOzs7Ozs7QUFBQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQStCO0FBQUE7QUFBQTtBQUFBO0FBQUE7QUFBQTtBQUUvQixJQUFJQSxTQUFTLEdBQUdDLE9BQU8sQ0FBQyxjQUFjLENBQUM7QUFDdkMsSUFBSUMsSUFBSSxHQUFHRCxPQUFPLENBQUMsU0FBUyxDQUFDO0FBRXRCLE1BQU1FLGNBQWMsU0FBU0MsNEJBQW1CLENBQUM7RUFDdERDLFdBQVcsQ0FBQ0MsT0FBTyxFQUFFQyxLQUFLLEVBQUVDLE9BQU8sR0FBRyxDQUFDLENBQUMsRUFBRTtJQUN4QyxLQUFLLENBQUNGLE9BQU8sRUFBRUMsS0FBSyxFQUFFQyxPQUFPLENBQUM7RUFDaEM7RUFFQSxJQUFJQyxNQUFNLEdBQUc7SUFDWCxPQUFPQyxlQUFNLENBQUNDLEdBQUcsQ0FBQyxJQUFJLENBQUNKLEtBQUssQ0FBQztFQUMvQjtFQUVBSyxlQUFlLENBQUNOLE9BQU8sRUFBRTtJQUN2QjtJQUNBLElBQUksQ0FBQ0EsT0FBTyxJQUFJLENBQUMsSUFBSSxDQUFDTyxrQkFBa0IsRUFBRTtNQUN4QztJQUNGO0lBQ0EsS0FBSyxDQUFDRCxlQUFlLENBQUNOLE9BQU8sQ0FBQztFQUNoQztFQUVBUSxtQkFBbUIsR0FBRztJQUNwQixPQUFPQyxvQkFBVztF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