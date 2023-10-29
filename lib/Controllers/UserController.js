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
//# sourceMappingURL=data:application/json;charset=utf-8;base64,eyJ2ZXJzaW9uIjozLCJuYW1lcyI6WyJfY3J5cHRvVXRpbHMiLCJyZXF1aXJlIiwiX3RyaWdnZXJzIiwiX0FkYXB0YWJsZUNvbnRyb2xsZXIiLCJfaW50ZXJvcFJlcXVpcmVEZWZhdWx0IiwiX01haWxBZGFwdGVyIiwiX3Jlc3QiLCJfbm9kZSIsIl9BY2NvdW50TG9ja291dCIsIl9Db25maWciLCJvYmoiLCJfX2VzTW9kdWxlIiwiZGVmYXVsdCIsIm93bktleXMiLCJvYmplY3QiLCJlbnVtZXJhYmxlT25seSIsImtleXMiLCJPYmplY3QiLCJnZXRPd25Qcm9wZXJ0eVN5bWJvbHMiLCJzeW1ib2xzIiwiZmlsdGVyIiwic3ltIiwiZ2V0T3duUHJvcGVydHlEZXNjcmlwdG9yIiwiZW51bWVyYWJsZSIsInB1c2giLCJhcHBseSIsIl9vYmplY3RTcHJlYWQiLCJ0YXJnZXQiLCJpIiwiYXJndW1lbnRzIiwibGVuZ3RoIiwic291cmNlIiwiZm9yRWFjaCIsImtleSIsIl9kZWZpbmVQcm9wZXJ0eSIsImdldE93blByb3BlcnR5RGVzY3JpcHRvcnMiLCJkZWZpbmVQcm9wZXJ0aWVzIiwiZGVmaW5lUHJvcGVydHkiLCJ2YWx1ZSIsIl90b1Byb3BlcnR5S2V5IiwiY29uZmlndXJhYmxlIiwid3JpdGFibGUiLCJhcmciLCJfdG9QcmltaXRpdmUiLCJTdHJpbmciLCJpbnB1dCIsImhpbnQiLCJwcmltIiwiU3ltYm9sIiwidG9QcmltaXRpdmUiLCJ1bmRlZmluZWQiLCJyZXMiLCJjYWxsIiwiVHlwZUVycm9yIiwiTnVtYmVyIiwiUmVzdFF1ZXJ5IiwiQXV0aCIsIlVzZXJDb250cm9sbGVyIiwiQWRhcHRhYmxlQ29udHJvbGxlciIsImNvbnN0cnVjdG9yIiwiYWRhcHRlciIsImFwcElkIiwib3B0aW9ucyIsImNvbmZpZyIsIkNvbmZpZyIsImdldCIsInZhbGlkYXRlQWRhcHRlciIsInNob3VsZFZlcmlmeUVtYWlscyIsImV4cGVjdGVkQWRhcHRlclR5cGUiLCJNYWlsQWRhcHRlciIsInZlcmlmeVVzZXJFbWFpbHMiLCJzZXRFbWFpbFZlcmlmeVRva2VuIiwidXNlciIsInJlcSIsInN0b3JhZ2UiLCJzaG91bGRTZW5kRW1haWwiLCJyZXNwb25zZSIsIlByb21pc2UiLCJyZXNvbHZlIiwic2VuZFZlcmlmaWNhdGlvbkVtYWlsIiwiX2VtYWlsX3ZlcmlmeV90b2tlbiIsInJhbmRvbVN0cmluZyIsImZpZWxkc0NoYW5nZWRCeVRyaWdnZXIiLCJpbmNsdWRlcyIsImVtYWlsVmVyaWZpZWQiLCJlbWFpbFZlcmlmeVRva2VuVmFsaWRpdHlEdXJhdGlvbiIsIl9lbWFpbF92ZXJpZnlfdG9rZW5fZXhwaXJlc19hdCIsIlBhcnNlIiwiX2VuY29kZSIsImdlbmVyYXRlRW1haWxWZXJpZnlUb2tlbkV4cGlyZXNBdCIsInZlcmlmeUVtYWlsIiwidXNlcm5hbWUiLCJ0b2tlbiIsInF1ZXJ5IiwidXBkYXRlRmllbGRzIiwiX19vcCIsIiRndCIsIkRhdGUiLCJtYWludGVuYW5jZUF1dGgiLCJtYWludGVuYW5jZSIsImZpbmRVc2VyRm9yRW1haWxWZXJpZmljYXRpb24iLCJtZXRob2QiLCJNZXRob2QiLCJhdXRoIiwiY2xhc3NOYW1lIiwicmVzdFdoZXJlIiwiZXhlY3V0ZSIsInRoZW4iLCJyZXN1bHQiLCJyZXN1bHRzIiwib2JqZWN0SWQiLCJyZXN0IiwidXBkYXRlIiwiY2hlY2tSZXNldFRva2VuVmFsaWRpdHkiLCJkYXRhYmFzZSIsImZpbmQiLCJfcGVyaXNoYWJsZV90b2tlbiIsImxpbWl0IiwicGFzc3dvcmRQb2xpY3kiLCJyZXNldFRva2VuVmFsaWRpdHlEdXJhdGlvbiIsImV4cGlyZXNEYXRlIiwiX3BlcmlzaGFibGVfdG9rZW5fZXhwaXJlc19hdCIsIl9fdHlwZSIsImlzbyIsImdldFVzZXJJZk5lZWRlZCIsImVtYWlsIiwid2hlcmUiLCJydW5CZWZvcmVGaW5kIiwibWFzdGVyIiwiZW5jb2RlVVJJQ29tcG9uZW50IiwiZmV0Y2hlZFVzZXIiLCJzZW5kVXNlckVtYWlsVmVyaWZpY2F0aW9uIiwiX3JlcSRhdXRoIiwiZnJvbUpTT04iLCJpc01hc3RlciIsImxpbmsiLCJidWlsZEVtYWlsTGluayIsInZlcmlmeUVtYWlsVVJMIiwiYXBwTmFtZSIsImluZmxhdGUiLCJzZW5kTWFpbCIsImRlZmF1bHRWZXJpZmljYXRpb25FbWFpbCIsInJlZ2VuZXJhdGVFbWFpbFZlcmlmeVRva2VuIiwiZW1haWxWZXJpZnlUb2tlblJldXNlSWZWYWxpZCIsInNob3VsZFNlbmQiLCJyZXNlbmRWZXJpZmljYXRpb25FbWFpbCIsIl9yZXEkYXV0aDIiLCJhVXNlciIsImdlbmVyYXRlIiwic2V0UGFzc3dvcmRSZXNldFRva2VuIiwiZ2VuZXJhdGVQYXNzd29yZFJlc2V0VG9rZW5FeHBpcmVzQXQiLCIkb3IiLCIkZXhpc3RzIiwic2VuZFBhc3N3b3JkUmVzZXRFbWFpbCIsInJlc2V0VG9rZW5SZXVzZUlmVmFsaWQiLCJyZXF1ZXN0UmVzZXRQYXNzd29yZFVSTCIsImRlZmF1bHRSZXNldFBhc3N3b3JkRW1haWwiLCJ1cGRhdGVQYXNzd29yZCIsInBhc3N3b3JkIiwidXBkYXRlVXNlclBhc3N3b3JkIiwiYWNjb3VudExvY2tvdXRQb2xpY3kiLCJBY2NvdW50TG9ja291dCIsInVubG9ja0FjY291bnQiLCJjYXRjaCIsImVycm9yIiwibWVzc2FnZSIsInJlamVjdCIsInRleHQiLCJ0byIsInN1YmplY3QiLCJleHBvcnRzIiwiZGVzdGluYXRpb24iLCJ1c2VybmFtZUFuZFRva2VuIiwicGFyc2VGcmFtZVVSTCIsImRlc3RpbmF0aW9uV2l0aG91dEhvc3QiLCJyZXBsYWNlIiwicHVibGljU2VydmVyVVJMIiwiX2RlZmF1bHQiXSwic291cmNlcyI6WyIuLi8uLi9zcmMvQ29udHJvbGxlcnMvVXNlckNvbnRyb2xsZXIuanMiXSwic291cmNlc0NvbnRlbnQiOlsiaW1wb3J0IHsgcmFuZG9tU3RyaW5nIH0gZnJvbSAnLi4vY3J5cHRvVXRpbHMnO1xuaW1wb3J0IHsgaW5mbGF0ZSB9IGZyb20gJy4uL3RyaWdnZXJzJztcbmltcG9ydCBBZGFwdGFibGVDb250cm9sbGVyIGZyb20gJy4vQWRhcHRhYmxlQ29udHJvbGxlcic7XG5pbXBvcnQgTWFpbEFkYXB0ZXIgZnJvbSAnLi4vQWRhcHRlcnMvRW1haWwvTWFpbEFkYXB0ZXInO1xuaW1wb3J0IHJlc3QgZnJvbSAnLi4vcmVzdCc7XG5pbXBvcnQgUGFyc2UgZnJvbSAncGFyc2Uvbm9kZSc7XG5pbXBvcnQgQWNjb3VudExvY2tvdXQgZnJvbSAnLi4vQWNjb3VudExvY2tvdXQnO1xuaW1wb3J0IENvbmZpZyBmcm9tICcuLi9Db25maWcnO1xuXG52YXIgUmVzdFF1ZXJ5ID0gcmVxdWlyZSgnLi4vUmVzdFF1ZXJ5Jyk7XG52YXIgQXV0aCA9IHJlcXVpcmUoJy4uL0F1dGgnKTtcblxuZXhwb3J0IGNsYXNzIFVzZXJDb250cm9sbGVyIGV4dGVuZHMgQWRhcHRhYmxlQ29udHJvbGxlciB7XG4gIGNvbnN0cnVjdG9yKGFkYXB0ZXIsIGFwcElkLCBvcHRpb25zID0ge30pIHtcbiAgICBzdXBlcihhZGFwdGVyLCBhcHBJZCwgb3B0aW9ucyk7XG4gIH1cblxuICBnZXQgY29uZmlnKCkge1xuICAgIHJldHVybiBDb25maWcuZ2V0KHRoaXMuYXBwSWQpO1xuICB9XG5cbiAgdmFsaWRhdGVBZGFwdGVyKGFkYXB0ZXIpIHtcbiAgICAvLyBBbGxvdyBubyBhZGFwdGVyXG4gICAgaWYgKCFhZGFwdGVyICYmICF0aGlzLnNob3VsZFZlcmlmeUVtYWlscykge1xuICAgICAgcmV0dXJuO1xuICAgIH1cbiAgICBzdXBlci52YWxpZGF0ZUFkYXB0ZXIoYWRhcHRlcik7XG4gIH1cblxuICBleHBlY3RlZEFkYXB0ZXJUeXBlKCkge1xuICAgIHJldHVybiBNYWlsQWRhcHRlcjtcbiAgfVxuXG4gIGdldCBzaG91bGRWZXJpZnlFbWFpbHMoKSB7XG4gICAgcmV0dXJuICh0aGlzLmNvbmZpZyB8fCB0aGlzLm9wdGlvbnMpLnZlcmlmeVVzZXJFbWFpbHM7XG4gIH1cblxuICBhc3luYyBzZXRFbWFpbFZlcmlmeVRva2VuKHVzZXIsIHJlcSwgc3RvcmFnZSA9IHt9KSB7XG4gICAgbGV0IHNob3VsZFNlbmRFbWFpbCA9IHRoaXMuc2hvdWxkVmVyaWZ5RW1haWxzO1xuICAgIGlmICh0eXBlb2Ygc2hvdWxkU2VuZEVtYWlsID09PSAnZnVuY3Rpb24nKSB7XG4gICAgICBjb25zdCByZXNwb25zZSA9IGF3YWl0IFByb21pc2UucmVzb2x2ZShzaG91bGRTZW5kRW1haWwocmVxKSk7XG4gICAgICBzaG91bGRTZW5kRW1haWwgPSByZXNwb25zZSAhPT0gZmFsc2U7XG4gICAgfVxuICAgIGlmICghc2hvdWxkU2VuZEVtYWlsKSB7XG4gICAgICByZXR1cm4gZmFsc2U7XG4gICAgfVxuICAgIHN0b3JhZ2Uuc2VuZFZlcmlmaWNhdGlvbkVtYWlsID0gdHJ1ZTtcbiAgICB1c2VyLl9lbWFpbF92ZXJpZnlfdG9rZW4gPSByYW5kb21TdHJpbmcoMjUpO1xuICAgIGlmIChcbiAgICAgICFzdG9yYWdlLmZpZWxkc0NoYW5nZWRCeVRyaWdnZXIgfHxcbiAgICAgICFzdG9yYWdlLmZpZWxkc0NoYW5nZWRCeVRyaWdnZXIuaW5jbHVkZXMoJ2VtYWlsVmVyaWZpZWQnKVxuICAgICkge1xuICAgICAgdXNlci5lbWFpbFZlcmlmaWVkID0gZmFsc2U7XG4gICAgfVxuXG4gICAgaWYgKHRoaXMuY29uZmlnLmVtYWlsVmVyaWZ5VG9rZW5WYWxpZGl0eUR1cmF0aW9uKSB7XG4gICAgICB1c2VyLl9lbWFpbF92ZXJpZnlfdG9rZW5fZXhwaXJlc19hdCA9IFBhcnNlLl9lbmNvZGUoXG4gICAgICAgIHRoaXMuY29uZmlnLmdlbmVyYXRlRW1haWxWZXJpZnlUb2tlbkV4cGlyZXNBdCgpXG4gICAgICApO1xuICAgIH1cbiAgICByZXR1cm4gdHJ1ZTtcbiAgfVxuXG4gIGFzeW5jIHZlcmlmeUVtYWlsKHVzZXJuYW1lLCB0b2tlbikge1xuICAgIGlmICghdGhpcy5zaG91bGRWZXJpZnlFbWFpbHMpIHtcbiAgICAgIC8vIFRyeWluZyB0byB2ZXJpZnkgZW1haWwgd2hlbiBub3QgZW5hYmxlZFxuICAgICAgLy8gVE9ETzogQmV0dGVyIGVycm9yIGhlcmUuXG4gICAgICB0aHJvdyB1bmRlZmluZWQ7XG4gICAgfVxuXG4gICAgY29uc3QgcXVlcnkgPSB7IHVzZXJuYW1lOiB1c2VybmFtZSwgX2VtYWlsX3ZlcmlmeV90b2tlbjogdG9rZW4gfTtcbiAgICBjb25zdCB1cGRhdGVGaWVsZHMgPSB7XG4gICAgICBlbWFpbFZlcmlmaWVkOiB0cnVlLFxuICAgICAgX2VtYWlsX3ZlcmlmeV90b2tlbjogeyBfX29wOiAnRGVsZXRlJyB9LFxuICAgIH07XG5cbiAgICAvLyBpZiB0aGUgZW1haWwgdmVyaWZ5IHRva2VuIG5lZWRzIHRvIGJlIHZhbGlkYXRlZCB0aGVuXG4gICAgLy8gYWRkIGFkZGl0aW9uYWwgcXVlcnkgcGFyYW1zIGFuZCBhZGRpdGlvbmFsIGZpZWxkcyB0aGF0IG5lZWQgdG8gYmUgdXBkYXRlZFxuICAgIGlmICh0aGlzLmNvbmZpZy5lbWFpbFZlcmlmeVRva2VuVmFsaWRpdHlEdXJhdGlvbikge1xuICAgICAgcXVlcnkuZW1haWxWZXJpZmllZCA9IGZhbHNlO1xuICAgICAgcXVlcnkuX2VtYWlsX3ZlcmlmeV90b2tlbl9leHBpcmVzX2F0ID0geyAkZ3Q6IFBhcnNlLl9lbmNvZGUobmV3IERhdGUoKSkgfTtcblxuICAgICAgdXBkYXRlRmllbGRzLl9lbWFpbF92ZXJpZnlfdG9rZW5fZXhwaXJlc19hdCA9IHsgX19vcDogJ0RlbGV0ZScgfTtcbiAgICB9XG4gICAgY29uc3QgbWFpbnRlbmFuY2VBdXRoID0gQXV0aC5tYWludGVuYW5jZSh0aGlzLmNvbmZpZyk7XG4gICAgdmFyIGZpbmRVc2VyRm9yRW1haWxWZXJpZmljYXRpb24gPSBhd2FpdCBSZXN0UXVlcnkoe1xuICAgICAgbWV0aG9kOiBSZXN0UXVlcnkuTWV0aG9kLmdldCxcbiAgICAgIGNvbmZpZzogdGhpcy5jb25maWcsXG4gICAgICBhdXRoOiBtYWludGVuYW5jZUF1dGgsXG4gICAgICBjbGFzc05hbWU6ICdfVXNlcicsXG4gICAgICByZXN0V2hlcmU6IHtcbiAgICAgICAgdXNlcm5hbWUsXG4gICAgICB9LFxuICAgIH0pO1xuICAgIHJldHVybiBmaW5kVXNlckZvckVtYWlsVmVyaWZpY2F0aW9uLmV4ZWN1dGUoKS50aGVuKHJlc3VsdCA9PiB7XG4gICAgICBpZiAocmVzdWx0LnJlc3VsdHMubGVuZ3RoICYmIHJlc3VsdC5yZXN1bHRzWzBdLmVtYWlsVmVyaWZpZWQpIHtcbiAgICAgICAgcmV0dXJuIFByb21pc2UucmVzb2x2ZShyZXN1bHQucmVzdWx0cy5sZW5ndGhbMF0pO1xuICAgICAgfSBlbHNlIGlmIChyZXN1bHQucmVzdWx0cy5sZW5ndGgpIHtcbiAgICAgICAgcXVlcnkub2JqZWN0SWQgPSByZXN1bHQucmVzdWx0c1swXS5vYmplY3RJZDtcbiAgICAgIH1cbiAgICAgIHJldHVybiByZXN0LnVwZGF0ZSh0aGlzLmNvbmZpZywgbWFpbnRlbmFuY2VBdXRoLCAnX1VzZXInLCBxdWVyeSwgdXBkYXRlRmllbGRzKTtcbiAgICB9KTtcbiAgfVxuXG4gIGNoZWNrUmVzZXRUb2tlblZhbGlkaXR5KHVzZXJuYW1lLCB0b2tlbikge1xuICAgIHJldHVybiB0aGlzLmNvbmZpZy5kYXRhYmFzZVxuICAgICAgLmZpbmQoXG4gICAgICAgICdfVXNlcicsXG4gICAgICAgIHtcbiAgICAgICAgICB1c2VybmFtZTogdXNlcm5hbWUsXG4gICAgICAgICAgX3BlcmlzaGFibGVfdG9rZW46IHRva2VuLFxuICAgICAgICB9LFxuICAgICAgICB7IGxpbWl0OiAxIH0sXG4gICAgICAgIEF1dGgubWFpbnRlbmFuY2UodGhpcy5jb25maWcpXG4gICAgICApXG4gICAgICAudGhlbihyZXN1bHRzID0+IHtcbiAgICAgICAgaWYgKHJlc3VsdHMubGVuZ3RoICE9IDEpIHtcbiAgICAgICAgICB0aHJvdyAnRmFpbGVkIHRvIHJlc2V0IHBhc3N3b3JkOiB1c2VybmFtZSAvIGVtYWlsIC8gdG9rZW4gaXMgaW52YWxpZCc7XG4gICAgICAgIH1cblxuICAgICAgICBpZiAodGhpcy5jb25maWcucGFzc3dvcmRQb2xpY3kgJiYgdGhpcy5jb25maWcucGFzc3dvcmRQb2xpY3kucmVzZXRUb2tlblZhbGlkaXR5RHVyYXRpb24pIHtcbiAgICAgICAgICBsZXQgZXhwaXJlc0RhdGUgPSByZXN1bHRzWzBdLl9wZXJpc2hhYmxlX3Rva2VuX2V4cGlyZXNfYXQ7XG4gICAgICAgICAgaWYgKGV4cGlyZXNEYXRlICYmIGV4cGlyZXNEYXRlLl9fdHlwZSA9PSAnRGF0ZScpIHtcbiAgICAgICAgICAgIGV4cGlyZXNEYXRlID0gbmV3IERhdGUoZXhwaXJlc0RhdGUuaXNvKTtcbiAgICAgICAgICB9XG4gICAgICAgICAgaWYgKGV4cGlyZXNEYXRlIDwgbmV3IERhdGUoKSkgdGhyb3cgJ1RoZSBwYXNzd29yZCByZXNldCBsaW5rIGhhcyBleHBpcmVkJztcbiAgICAgICAgfVxuICAgICAgICByZXR1cm4gcmVzdWx0c1swXTtcbiAgICAgIH0pO1xuICB9XG5cbiAgYXN5bmMgZ2V0VXNlcklmTmVlZGVkKHVzZXIpIHtcbiAgICBpZiAodXNlci51c2VybmFtZSAmJiB1c2VyLmVtYWlsKSB7XG4gICAgICByZXR1cm4gUHJvbWlzZS5yZXNvbHZlKHVzZXIpO1xuICAgIH1cbiAgICB2YXIgd2hlcmUgPSB7fTtcbiAgICBpZiAodXNlci51c2VybmFtZSkge1xuICAgICAgd2hlcmUudXNlcm5hbWUgPSB1c2VyLnVzZXJuYW1lO1xuICAgIH1cbiAgICBpZiAodXNlci5lbWFpbCkge1xuICAgICAgd2hlcmUuZW1haWwgPSB1c2VyLmVtYWlsO1xuICAgIH1cblxuICAgIHZhciBxdWVyeSA9IGF3YWl0IFJlc3RRdWVyeSh7XG4gICAgICBtZXRob2Q6IFJlc3RRdWVyeS5NZXRob2QuZ2V0LFxuICAgICAgY29uZmlnOiB0aGlzLmNvbmZpZyxcbiAgICAgIHJ1bkJlZm9yZUZpbmQ6IGZhbHNlLFxuICAgICAgYXV0aDogQXV0aC5tYXN0ZXIodGhpcy5jb25maWcpLFxuICAgICAgY2xhc3NOYW1lOiAnX1VzZXInLFxuICAgICAgcmVzdFdoZXJlOiB3aGVyZSxcbiAgICB9KTtcbiAgICByZXR1cm4gcXVlcnkuZXhlY3V0ZSgpLnRoZW4oZnVuY3Rpb24gKHJlc3VsdCkge1xuICAgICAgaWYgKHJlc3VsdC5yZXN1bHRzLmxlbmd0aCAhPSAxKSB7XG4gICAgICAgIHRocm93IHVuZGVmaW5lZDtcbiAgICAgIH1cbiAgICAgIHJldHVybiByZXN1bHQucmVzdWx0c1swXTtcbiAgICB9KTtcbiAgfVxuXG4gIGFzeW5jIHNlbmRWZXJpZmljYXRpb25FbWFpbCh1c2VyLCByZXEpIHtcbiAgICBpZiAoIXRoaXMuc2hvdWxkVmVyaWZ5RW1haWxzKSB7XG4gICAgICByZXR1cm47XG4gICAgfVxuICAgIGNvbnN0IHRva2VuID0gZW5jb2RlVVJJQ29tcG9uZW50KHVzZXIuX2VtYWlsX3ZlcmlmeV90b2tlbik7XG4gICAgLy8gV2UgbWF5IG5lZWQgdG8gZmV0Y2ggdGhlIHVzZXIgaW4gY2FzZSBvZiB1cGRhdGUgZW1haWxcbiAgICBjb25zdCBmZXRjaGVkVXNlciA9IGF3YWl0IHRoaXMuZ2V0VXNlcklmTmVlZGVkKHVzZXIpO1xuICAgIGxldCBzaG91bGRTZW5kRW1haWwgPSB0aGlzLmNvbmZpZy5zZW5kVXNlckVtYWlsVmVyaWZpY2F0aW9uO1xuICAgIGlmICh0eXBlb2Ygc2hvdWxkU2VuZEVtYWlsID09PSAnZnVuY3Rpb24nKSB7XG4gICAgICBjb25zdCByZXNwb25zZSA9IGF3YWl0IFByb21pc2UucmVzb2x2ZShcbiAgICAgICAgdGhpcy5jb25maWcuc2VuZFVzZXJFbWFpbFZlcmlmaWNhdGlvbih7XG4gICAgICAgICAgdXNlcjogUGFyc2UuT2JqZWN0LmZyb21KU09OKHsgY2xhc3NOYW1lOiAnX1VzZXInLCAuLi5mZXRjaGVkVXNlciB9KSxcbiAgICAgICAgICBtYXN0ZXI6IHJlcS5hdXRoPy5pc01hc3RlcixcbiAgICAgICAgfSlcbiAgICAgICk7XG4gICAgICBzaG91bGRTZW5kRW1haWwgPSAhIXJlc3BvbnNlO1xuICAgIH1cbiAgICBpZiAoIXNob3VsZFNlbmRFbWFpbCkge1xuICAgICAgcmV0dXJuO1xuICAgIH1cbiAgICBjb25zdCB1c2VybmFtZSA9IGVuY29kZVVSSUNvbXBvbmVudCh1c2VyLnVzZXJuYW1lKTtcblxuICAgIGNvbnN0IGxpbmsgPSBidWlsZEVtYWlsTGluayh0aGlzLmNvbmZpZy52ZXJpZnlFbWFpbFVSTCwgdXNlcm5hbWUsIHRva2VuLCB0aGlzLmNvbmZpZyk7XG4gICAgY29uc3Qgb3B0aW9ucyA9IHtcbiAgICAgIGFwcE5hbWU6IHRoaXMuY29uZmlnLmFwcE5hbWUsXG4gICAgICBsaW5rOiBsaW5rLFxuICAgICAgdXNlcjogaW5mbGF0ZSgnX1VzZXInLCBmZXRjaGVkVXNlciksXG4gICAgfTtcbiAgICBpZiAodGhpcy5hZGFwdGVyLnNlbmRWZXJpZmljYXRpb25FbWFpbCkge1xuICAgICAgdGhpcy5hZGFwdGVyLnNlbmRWZXJpZmljYXRpb25FbWFpbChvcHRpb25zKTtcbiAgICB9IGVsc2Uge1xuICAgICAgdGhpcy5hZGFwdGVyLnNlbmRNYWlsKHRoaXMuZGVmYXVsdFZlcmlmaWNhdGlvbkVtYWlsKG9wdGlvbnMpKTtcbiAgICB9XG4gIH1cblxuICAvKipcbiAgICogUmVnZW5lcmF0ZXMgdGhlIGdpdmVuIHVzZXIncyBlbWFpbCB2ZXJpZmljYXRpb24gdG9rZW5cbiAgICpcbiAgICogQHBhcmFtIHVzZXJcbiAgICogQHJldHVybnMgeyp9XG4gICAqL1xuICBhc3luYyByZWdlbmVyYXRlRW1haWxWZXJpZnlUb2tlbih1c2VyLCBtYXN0ZXIpIHtcbiAgICBjb25zdCB7IF9lbWFpbF92ZXJpZnlfdG9rZW4gfSA9IHVzZXI7XG4gICAgbGV0IHsgX2VtYWlsX3ZlcmlmeV90b2tlbl9leHBpcmVzX2F0IH0gPSB1c2VyO1xuICAgIGlmIChfZW1haWxfdmVyaWZ5X3Rva2VuX2V4cGlyZXNfYXQgJiYgX2VtYWlsX3ZlcmlmeV90b2tlbl9leHBpcmVzX2F0Ll9fdHlwZSA9PT0gJ0RhdGUnKSB7XG4gICAgICBfZW1haWxfdmVyaWZ5X3Rva2VuX2V4cGlyZXNfYXQgPSBfZW1haWxfdmVyaWZ5X3Rva2VuX2V4cGlyZXNfYXQuaXNvO1xuICAgIH1cbiAgICBpZiAoXG4gICAgICB0aGlzLmNvbmZpZy5lbWFpbFZlcmlmeVRva2VuUmV1c2VJZlZhbGlkICYmXG4gICAgICB0aGlzLmNvbmZpZy5lbWFpbFZlcmlmeVRva2VuVmFsaWRpdHlEdXJhdGlvbiAmJlxuICAgICAgX2VtYWlsX3ZlcmlmeV90b2tlbiAmJlxuICAgICAgbmV3IERhdGUoKSA8IG5ldyBEYXRlKF9lbWFpbF92ZXJpZnlfdG9rZW5fZXhwaXJlc19hdClcbiAgICApIHtcbiAgICAgIHJldHVybiBQcm9taXNlLnJlc29sdmUoKTtcbiAgICB9XG4gICAgY29uc3Qgc2hvdWxkU2VuZCA9IGF3YWl0IHRoaXMuc2V0RW1haWxWZXJpZnlUb2tlbih1c2VyLCB7IHVzZXIsIG1hc3RlciB9KTtcbiAgICBpZiAoIXNob3VsZFNlbmQpIHtcbiAgICAgIHJldHVybjtcbiAgICB9XG4gICAgcmV0dXJuIHRoaXMuY29uZmlnLmRhdGFiYXNlLnVwZGF0ZSgnX1VzZXInLCB7IHVzZXJuYW1lOiB1c2VyLnVzZXJuYW1lIH0sIHVzZXIpO1xuICB9XG5cbiAgYXN5bmMgcmVzZW5kVmVyaWZpY2F0aW9uRW1haWwodXNlcm5hbWUsIHJlcSkge1xuICAgIGNvbnN0IGFVc2VyID0gYXdhaXQgdGhpcy5nZXRVc2VySWZOZWVkZWQoeyB1c2VybmFtZTogdXNlcm5hbWUgfSk7XG4gICAgaWYgKCFhVXNlciB8fCBhVXNlci5lbWFpbFZlcmlmaWVkKSB7XG4gICAgICB0aHJvdyB1bmRlZmluZWQ7XG4gICAgfVxuICAgIGNvbnN0IGdlbmVyYXRlID0gYXdhaXQgdGhpcy5yZWdlbmVyYXRlRW1haWxWZXJpZnlUb2tlbihhVXNlciwgcmVxLmF1dGg/LmlzTWFzdGVyKTtcbiAgICBpZiAoZ2VuZXJhdGUpIHtcbiAgICAgIHRoaXMuc2VuZFZlcmlmaWNhdGlvbkVtYWlsKGFVc2VyLCByZXEpO1xuICAgIH1cbiAgfVxuXG4gIHNldFBhc3N3b3JkUmVzZXRUb2tlbihlbWFpbCkge1xuICAgIGNvbnN0IHRva2VuID0geyBfcGVyaXNoYWJsZV90b2tlbjogcmFuZG9tU3RyaW5nKDI1KSB9O1xuXG4gICAgaWYgKHRoaXMuY29uZmlnLnBhc3N3b3JkUG9saWN5ICYmIHRoaXMuY29uZmlnLnBhc3N3b3JkUG9saWN5LnJlc2V0VG9rZW5WYWxpZGl0eUR1cmF0aW9uKSB7XG4gICAgICB0b2tlbi5fcGVyaXNoYWJsZV90b2tlbl9leHBpcmVzX2F0ID0gUGFyc2UuX2VuY29kZShcbiAgICAgICAgdGhpcy5jb25maWcuZ2VuZXJhdGVQYXNzd29yZFJlc2V0VG9rZW5FeHBpcmVzQXQoKVxuICAgICAgKTtcbiAgICB9XG5cbiAgICByZXR1cm4gdGhpcy5jb25maWcuZGF0YWJhc2UudXBkYXRlKFxuICAgICAgJ19Vc2VyJyxcbiAgICAgIHsgJG9yOiBbeyBlbWFpbCB9LCB7IHVzZXJuYW1lOiBlbWFpbCwgZW1haWw6IHsgJGV4aXN0czogZmFsc2UgfSB9XSB9LFxuICAgICAgdG9rZW4sXG4gICAgICB7fSxcbiAgICAgIHRydWVcbiAgICApO1xuICB9XG5cbiAgYXN5bmMgc2VuZFBhc3N3b3JkUmVzZXRFbWFpbChlbWFpbCkge1xuICAgIGlmICghdGhpcy5hZGFwdGVyKSB7XG4gICAgICB0aHJvdyAnVHJ5aW5nIHRvIHNlbmQgYSByZXNldCBwYXNzd29yZCBidXQgbm8gYWRhcHRlciBpcyBzZXQnO1xuICAgICAgLy8gIFRPRE86IE5vIGFkYXB0ZXI/XG4gICAgfVxuICAgIGxldCB1c2VyO1xuICAgIGlmIChcbiAgICAgIHRoaXMuY29uZmlnLnBhc3N3b3JkUG9saWN5ICYmXG4gICAgICB0aGlzLmNvbmZpZy5wYXNzd29yZFBvbGljeS5yZXNldFRva2VuUmV1c2VJZlZhbGlkICYmXG4gICAgICB0aGlzLmNvbmZpZy5wYXNzd29yZFBvbGljeS5yZXNldFRva2VuVmFsaWRpdHlEdXJhdGlvblxuICAgICkge1xuICAgICAgY29uc3QgcmVzdWx0cyA9IGF3YWl0IHRoaXMuY29uZmlnLmRhdGFiYXNlLmZpbmQoXG4gICAgICAgICdfVXNlcicsXG4gICAgICAgIHtcbiAgICAgICAgICAkb3I6IFtcbiAgICAgICAgICAgIHsgZW1haWwsIF9wZXJpc2hhYmxlX3Rva2VuOiB7ICRleGlzdHM6IHRydWUgfSB9LFxuICAgICAgICAgICAgeyB1c2VybmFtZTogZW1haWwsIGVtYWlsOiB7ICRleGlzdHM6IGZhbHNlIH0sIF9wZXJpc2hhYmxlX3Rva2VuOiB7ICRleGlzdHM6IHRydWUgfSB9LFxuICAgICAgICAgIF0sXG4gICAgICAgIH0sXG4gICAgICAgIHsgbGltaXQ6IDEgfSxcbiAgICAgICAgQXV0aC5tYWludGVuYW5jZSh0aGlzLmNvbmZpZylcbiAgICAgICk7XG4gICAgICBpZiAocmVzdWx0cy5sZW5ndGggPT0gMSkge1xuICAgICAgICBsZXQgZXhwaXJlc0RhdGUgPSByZXN1bHRzWzBdLl9wZXJpc2hhYmxlX3Rva2VuX2V4cGlyZXNfYXQ7XG4gICAgICAgIGlmIChleHBpcmVzRGF0ZSAmJiBleHBpcmVzRGF0ZS5fX3R5cGUgPT0gJ0RhdGUnKSB7XG4gICAgICAgICAgZXhwaXJlc0RhdGUgPSBuZXcgRGF0ZShleHBpcmVzRGF0ZS5pc28pO1xuICAgICAgICB9XG4gICAgICAgIGlmIChleHBpcmVzRGF0ZSA+IG5ldyBEYXRlKCkpIHtcbiAgICAgICAgICB1c2VyID0gcmVzdWx0c1swXTtcbiAgICAgICAgfVxuICAgICAgfVxuICAgIH1cbiAgICBpZiAoIXVzZXIgfHwgIXVzZXIuX3BlcmlzaGFibGVfdG9rZW4pIHtcbiAgICAgIHVzZXIgPSBhd2FpdCB0aGlzLnNldFBhc3N3b3JkUmVzZXRUb2tlbihlbWFpbCk7XG4gICAgfVxuICAgIGNvbnN0IHRva2VuID0gZW5jb2RlVVJJQ29tcG9uZW50KHVzZXIuX3BlcmlzaGFibGVfdG9rZW4pO1xuICAgIGNvbnN0IHVzZXJuYW1lID0gZW5jb2RlVVJJQ29tcG9uZW50KHVzZXIudXNlcm5hbWUpO1xuXG4gICAgY29uc3QgbGluayA9IGJ1aWxkRW1haWxMaW5rKHRoaXMuY29uZmlnLnJlcXVlc3RSZXNldFBhc3N3b3JkVVJMLCB1c2VybmFtZSwgdG9rZW4sIHRoaXMuY29uZmlnKTtcbiAgICBjb25zdCBvcHRpb25zID0ge1xuICAgICAgYXBwTmFtZTogdGhpcy5jb25maWcuYXBwTmFtZSxcbiAgICAgIGxpbms6IGxpbmssXG4gICAgICB1c2VyOiBpbmZsYXRlKCdfVXNlcicsIHVzZXIpLFxuICAgIH07XG5cbiAgICBpZiAodGhpcy5hZGFwdGVyLnNlbmRQYXNzd29yZFJlc2V0RW1haWwpIHtcbiAgICAgIHRoaXMuYWRhcHRlci5zZW5kUGFzc3dvcmRSZXNldEVtYWlsKG9wdGlvbnMpO1xuICAgIH0gZWxzZSB7XG4gICAgICB0aGlzLmFkYXB0ZXIuc2VuZE1haWwodGhpcy5kZWZhdWx0UmVzZXRQYXNzd29yZEVtYWlsKG9wdGlvbnMpKTtcbiAgICB9XG5cbiAgICByZXR1cm4gUHJvbWlzZS5yZXNvbHZlKHVzZXIpO1xuICB9XG5cbiAgdXBkYXRlUGFzc3dvcmQodXNlcm5hbWUsIHRva2VuLCBwYXNzd29yZCkge1xuICAgIHJldHVybiB0aGlzLmNoZWNrUmVzZXRUb2tlblZhbGlkaXR5KHVzZXJuYW1lLCB0b2tlbilcbiAgICAgIC50aGVuKHVzZXIgPT4gdXBkYXRlVXNlclBhc3N3b3JkKHVzZXIsIHBhc3N3b3JkLCB0aGlzLmNvbmZpZykpXG4gICAgICAudGhlbih1c2VyID0+IHtcbiAgICAgICAgY29uc3QgYWNjb3VudExvY2tvdXRQb2xpY3kgPSBuZXcgQWNjb3VudExvY2tvdXQodXNlciwgdGhpcy5jb25maWcpO1xuICAgICAgICByZXR1cm4gYWNjb3VudExvY2tvdXRQb2xpY3kudW5sb2NrQWNjb3VudCgpO1xuICAgICAgfSlcbiAgICAgIC5jYXRjaChlcnJvciA9PiB7XG4gICAgICAgIGlmIChlcnJvciAmJiBlcnJvci5tZXNzYWdlKSB7XG4gICAgICAgICAgLy8gaW4gY2FzZSBvZiBQYXJzZS5FcnJvciwgZmFpbCB3aXRoIHRoZSBlcnJvciBtZXNzYWdlIG9ubHlcbiAgICAgICAgICByZXR1cm4gUHJvbWlzZS5yZWplY3QoZXJyb3IubWVzc2FnZSk7XG4gICAgICAgIH0gZWxzZSB7XG4gICAgICAgICAgcmV0dXJuIFByb21pc2UucmVqZWN0KGVycm9yKTtcbiAgICAgICAgfVxuICAgICAgfSk7XG4gIH1cblxuICBkZWZhdWx0VmVyaWZpY2F0aW9uRW1haWwoeyBsaW5rLCB1c2VyLCBhcHBOYW1lIH0pIHtcbiAgICBjb25zdCB0ZXh0ID1cbiAgICAgICdIaSxcXG5cXG4nICtcbiAgICAgICdZb3UgYXJlIGJlaW5nIGFza2VkIHRvIGNvbmZpcm0gdGhlIGUtbWFpbCBhZGRyZXNzICcgK1xuICAgICAgdXNlci5nZXQoJ2VtYWlsJykgK1xuICAgICAgJyB3aXRoICcgK1xuICAgICAgYXBwTmFtZSArXG4gICAgICAnXFxuXFxuJyArXG4gICAgICAnJyArXG4gICAgICAnQ2xpY2sgaGVyZSB0byBjb25maXJtIGl0OlxcbicgK1xuICAgICAgbGluaztcbiAgICBjb25zdCB0byA9IHVzZXIuZ2V0KCdlbWFpbCcpO1xuICAgIGNvbnN0IHN1YmplY3QgPSAnUGxlYXNlIHZlcmlmeSB5b3VyIGUtbWFpbCBmb3IgJyArIGFwcE5hbWU7XG4gICAgcmV0dXJuIHsgdGV4dCwgdG8sIHN1YmplY3QgfTtcbiAgfVxuXG4gIGRlZmF1bHRSZXNldFBhc3N3b3JkRW1haWwoeyBsaW5rLCB1c2VyLCBhcHBOYW1lIH0pIHtcbiAgICBjb25zdCB0ZXh0ID1cbiAgICAgICdIaSxcXG5cXG4nICtcbiAgICAgICdZb3UgcmVxdWVzdGVkIHRvIHJlc2V0IHlvdXIgcGFzc3dvcmQgZm9yICcgK1xuICAgICAgYXBwTmFtZSArXG4gICAgICAodXNlci5nZXQoJ3VzZXJuYW1lJykgPyBcIiAoeW91ciB1c2VybmFtZSBpcyAnXCIgKyB1c2VyLmdldCgndXNlcm5hbWUnKSArIFwiJylcIiA6ICcnKSArXG4gICAgICAnLlxcblxcbicgK1xuICAgICAgJycgK1xuICAgICAgJ0NsaWNrIGhlcmUgdG8gcmVzZXQgaXQ6XFxuJyArXG4gICAgICBsaW5rO1xuICAgIGNvbnN0IHRvID0gdXNlci5nZXQoJ2VtYWlsJykgfHwgdXNlci5nZXQoJ3VzZXJuYW1lJyk7XG4gICAgY29uc3Qgc3ViamVjdCA9ICdQYXNzd29yZCBSZXNldCBmb3IgJyArIGFwcE5hbWU7XG4gICAgcmV0dXJuIHsgdGV4dCwgdG8sIHN1YmplY3QgfTtcbiAgfVxufVxuXG4vLyBNYXJrIHRoaXMgcHJpdmF0ZVxuZnVuY3Rpb24gdXBkYXRlVXNlclBhc3N3b3JkKHVzZXIsIHBhc3N3b3JkLCBjb25maWcpIHtcbiAgcmV0dXJuIHJlc3RcbiAgICAudXBkYXRlKFxuICAgICAgY29uZmlnLFxuICAgICAgQXV0aC5tYXN0ZXIoY29uZmlnKSxcbiAgICAgICdfVXNlcicsXG4gICAgICB7IG9iamVjdElkOiB1c2VyLm9iamVjdElkIH0sXG4gICAgICB7XG4gICAgICAgIHBhc3N3b3JkOiBwYXNzd29yZCxcbiAgICAgIH1cbiAgICApXG4gICAgLnRoZW4oKCkgPT4gdXNlcik7XG59XG5cbmZ1bmN0aW9uIGJ1aWxkRW1haWxMaW5rKGRlc3RpbmF0aW9uLCB1c2VybmFtZSwgdG9rZW4sIGNvbmZpZykge1xuICBjb25zdCB1c2VybmFtZUFuZFRva2VuID0gYHRva2VuPSR7dG9rZW59JnVzZXJuYW1lPSR7dXNlcm5hbWV9YDtcblxuICBpZiAoY29uZmlnLnBhcnNlRnJhbWVVUkwpIHtcbiAgICBjb25zdCBkZXN0aW5hdGlvbldpdGhvdXRIb3N0ID0gZGVzdGluYXRpb24ucmVwbGFjZShjb25maWcucHVibGljU2VydmVyVVJMLCAnJyk7XG5cbiAgICByZXR1cm4gYCR7Y29uZmlnLnBhcnNlRnJhbWVVUkx9P2xpbms9JHtlbmNvZGVVUklDb21wb25lbnQoXG4gICAgICBkZXN0aW5hdGlvbldpdGhvdXRIb3N0XG4gICAgKX0mJHt1c2VybmFtZUFuZFRva2VufWA7XG4gIH0gZWxzZSB7XG4gICAgcmV0dXJuIGAke2Rlc3RpbmF0aW9ufT8ke3VzZXJuYW1lQW5kVG9rZW59YDtcbiAgfVxufVxuXG5leHBvcnQgZGVmYXVsdCBVc2VyQ29udHJvbGxlcjtcbiJdLCJtYXBwaW5ncyI6Ijs7Ozs7O0FBQUEsSUFBQUEsWUFBQSxHQUFBQyxPQUFBO0FBQ0EsSUFBQUMsU0FBQSxHQUFBRCxPQUFBO0FBQ0EsSUFBQUUsb0JBQUEsR0FBQUMsc0JBQUEsQ0FBQUgsT0FBQTtBQUNBLElBQUFJLFlBQUEsR0FBQUQsc0JBQUEsQ0FBQUgsT0FBQTtBQUNBLElBQUFLLEtBQUEsR0FBQUYsc0JBQUEsQ0FBQUgsT0FBQTtBQUNBLElBQUFNLEtBQUEsR0FBQUgsc0JBQUEsQ0FBQUgsT0FBQTtBQUNBLElBQUFPLGVBQUEsR0FBQUosc0JBQUEsQ0FBQUgsT0FBQTtBQUNBLElBQUFRLE9BQUEsR0FBQUwsc0JBQUEsQ0FBQUgsT0FBQTtBQUErQixTQUFBRyx1QkFBQU0sR0FBQSxXQUFBQSxHQUFBLElBQUFBLEdBQUEsQ0FBQUMsVUFBQSxHQUFBRCxHQUFBLEtBQUFFLE9BQUEsRUFBQUYsR0FBQTtBQUFBLFNBQUFHLFFBQUFDLE1BQUEsRUFBQUMsY0FBQSxRQUFBQyxJQUFBLEdBQUFDLE1BQUEsQ0FBQUQsSUFBQSxDQUFBRixNQUFBLE9BQUFHLE1BQUEsQ0FBQUMscUJBQUEsUUFBQUMsT0FBQSxHQUFBRixNQUFBLENBQUFDLHFCQUFBLENBQUFKLE1BQUEsR0FBQUMsY0FBQSxLQUFBSSxPQUFBLEdBQUFBLE9BQUEsQ0FBQUMsTUFBQSxXQUFBQyxHQUFBLFdBQUFKLE1BQUEsQ0FBQUssd0JBQUEsQ0FBQVIsTUFBQSxFQUFBTyxHQUFBLEVBQUFFLFVBQUEsT0FBQVAsSUFBQSxDQUFBUSxJQUFBLENBQUFDLEtBQUEsQ0FBQVQsSUFBQSxFQUFBRyxPQUFBLFlBQUFILElBQUE7QUFBQSxTQUFBVSxjQUFBQyxNQUFBLGFBQUFDLENBQUEsTUFBQUEsQ0FBQSxHQUFBQyxTQUFBLENBQUFDLE1BQUEsRUFBQUYsQ0FBQSxVQUFBRyxNQUFBLFdBQUFGLFNBQUEsQ0FBQUQs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