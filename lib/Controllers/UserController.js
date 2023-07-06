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
  verifyEmail(username, token) {
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
    var findUserForEmailVerification = new RestQuery(this.config, maintenanceAuth, '_User', {
      username
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
  getUserIfNeeded(user) {
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
//# sourceMappingURL=data:application/json;charset=utf-8;base64,eyJ2ZXJzaW9uIjozLCJuYW1lcyI6WyJSZXN0UXVlcnkiLCJyZXF1aXJlIiwiQXV0aCIsIlVzZXJDb250cm9sbGVyIiwiQWRhcHRhYmxlQ29udHJvbGxlciIsImNvbnN0cnVjdG9yIiwiYWRhcHRlciIsImFwcElkIiwib3B0aW9ucyIsImNvbmZpZyIsIkNvbmZpZyIsImdldCIsInZhbGlkYXRlQWRhcHRlciIsInNob3VsZFZlcmlmeUVtYWlscyIsImV4cGVjdGVkQWRhcHRlclR5cGUiLCJNYWlsQWRhcHRlciIsInZlcmlmeVVzZXJFbWFpbHMiLCJzZXRFbWFpbFZlcmlmeVRva2VuIiwidXNlciIsInJlcSIsInN0b3JhZ2UiLCJzaG91bGRTZW5kRW1haWwiLCJyZXNwb25zZSIsIlByb21pc2UiLCJyZXNvbHZlIiwic2VuZFZlcmlmaWNhdGlvbkVtYWlsIiwiX2VtYWlsX3ZlcmlmeV90b2tlbiIsInJhbmRvbVN0cmluZyIsImZpZWxkc0NoYW5nZWRCeVRyaWdnZXIiLCJpbmNsdWRlcyIsImVtYWlsVmVyaWZpZWQiLCJlbWFpbFZlcmlmeVRva2VuVmFsaWRpdHlEdXJhdGlvbiIsIl9lbWFpbF92ZXJpZnlfdG9rZW5fZXhwaXJlc19hdCIsIlBhcnNlIiwiX2VuY29kZSIsImdlbmVyYXRlRW1haWxWZXJpZnlUb2tlbkV4cGlyZXNBdCIsInZlcmlmeUVtYWlsIiwidXNlcm5hbWUiLCJ0b2tlbiIsInVuZGVmaW5lZCIsInF1ZXJ5IiwidXBkYXRlRmllbGRzIiwiX19vcCIsIiRndCIsIkRhdGUiLCJtYWludGVuYW5jZUF1dGgiLCJtYWludGVuYW5jZSIsImZpbmRVc2VyRm9yRW1haWxWZXJpZmljYXRpb24iLCJleGVjdXRlIiwidGhlbiIsInJlc3VsdCIsInJlc3VsdHMiLCJsZW5ndGgiLCJvYmplY3RJZCIsInJlc3QiLCJ1cGRhdGUiLCJjaGVja1Jlc2V0VG9rZW5WYWxpZGl0eSIsImRhdGFiYXNlIiwiZmluZCIsIl9wZXJpc2hhYmxlX3Rva2VuIiwibGltaXQiLCJwYXNzd29yZFBvbGljeSIsInJlc2V0VG9rZW5WYWxpZGl0eUR1cmF0aW9uIiwiZXhwaXJlc0RhdGUiLCJfcGVyaXNoYWJsZV90b2tlbl9leHBpcmVzX2F0IiwiX190eXBlIiwiaXNvIiwiZ2V0VXNlcklmTmVlZGVkIiwiZW1haWwiLCJ3aGVyZSIsIm1hc3RlciIsImVuY29kZVVSSUNvbXBvbmVudCIsImZldGNoZWRVc2VyIiwic2VuZFVzZXJFbWFpbFZlcmlmaWNhdGlvbiIsIk9iamVjdCIsImZyb21KU09OIiwiY2xhc3NOYW1lIiwiYXV0aCIsImlzTWFzdGVyIiwibGluayIsImJ1aWxkRW1haWxMaW5rIiwidmVyaWZ5RW1haWxVUkwiLCJhcHBOYW1lIiwiaW5mbGF0ZSIsInNlbmRNYWlsIiwiZGVmYXVsdFZlcmlmaWNhdGlvbkVtYWlsIiwicmVnZW5lcmF0ZUVtYWlsVmVyaWZ5VG9rZW4iLCJlbWFpbFZlcmlmeVRva2VuUmV1c2VJZlZhbGlkIiwic2hvdWxkU2VuZCIsInJlc2VuZFZlcmlmaWNhdGlvbkVtYWlsIiwiYVVzZXIiLCJnZW5lcmF0ZSIsInNldFBhc3N3b3JkUmVzZXRUb2tlbiIsImdlbmVyYXRlUGFzc3dvcmRSZXNldFRva2VuRXhwaXJlc0F0IiwiJG9yIiwiJGV4aXN0cyIsInNlbmRQYXNzd29yZFJlc2V0RW1haWwiLCJyZXNldFRva2VuUmV1c2VJZlZhbGlkIiwicmVxdWVzdFJlc2V0UGFzc3dvcmRVUkwiLCJkZWZhdWx0UmVzZXRQYXNzd29yZEVtYWlsIiwidXBkYXRlUGFzc3dvcmQiLCJwYXNzd29yZCIsInVwZGF0ZVVzZXJQYXNzd29yZCIsImFjY291bnRMb2Nrb3V0UG9saWN5IiwiQWNjb3VudExvY2tvdXQiLCJ1bmxvY2tBY2NvdW50IiwiY2F0Y2giLCJlcnJvciIsIm1lc3NhZ2UiLCJyZWplY3QiLCJ0ZXh0IiwidG8iLCJzdWJqZWN0IiwiZGVzdGluYXRpb24iLCJ1c2VybmFtZUFuZFRva2VuIiwicGFyc2VGcmFtZVVSTCIsImRlc3RpbmF0aW9uV2l0aG91dEhvc3QiLCJyZXBsYWNlIiwicHVibGljU2VydmVyVVJMIl0sInNvdXJjZXMiOlsiLi4vLi4vc3JjL0NvbnRyb2xsZXJzL1VzZXJDb250cm9sbGVyLmpzIl0sInNvdXJjZXNDb250ZW50IjpbImltcG9ydCB7IHJhbmRvbVN0cmluZyB9IGZyb20gJy4uL2NyeXB0b1V0aWxzJztcbmltcG9ydCB7IGluZmxhdGUgfSBmcm9tICcuLi90cmlnZ2Vycyc7XG5pbXBvcnQgQWRhcHRhYmxlQ29udHJvbGxlciBmcm9tICcuL0FkYXB0YWJsZUNvbnRyb2xsZXInO1xuaW1wb3J0IE1haWxBZGFwdGVyIGZyb20gJy4uL0FkYXB0ZXJzL0VtYWlsL01haWxBZGFwdGVyJztcbmltcG9ydCByZXN0IGZyb20gJy4uL3Jlc3QnO1xuaW1wb3J0IFBhcnNlIGZyb20gJ3BhcnNlL25vZGUnO1xuaW1wb3J0IEFjY291bnRMb2Nrb3V0IGZyb20gJy4uL0FjY291bnRMb2Nrb3V0JztcbmltcG9ydCBDb25maWcgZnJvbSAnLi4vQ29uZmlnJztcblxudmFyIFJlc3RRdWVyeSA9IHJlcXVpcmUoJy4uL1Jlc3RRdWVyeScpO1xudmFyIEF1dGggPSByZXF1aXJlKCcuLi9BdXRoJyk7XG5cbmV4cG9ydCBjbGFzcyBVc2VyQ29udHJvbGxlciBleHRlbmRzIEFkYXB0YWJsZUNvbnRyb2xsZXIge1xuICBjb25zdHJ1Y3RvcihhZGFwdGVyLCBhcHBJZCwgb3B0aW9ucyA9IHt9KSB7XG4gICAgc3VwZXIoYWRhcHRlciwgYXBwSWQsIG9wdGlvbnMpO1xuICB9XG5cbiAgZ2V0IGNvbmZpZygpIHtcbiAgICByZXR1cm4gQ29uZmlnLmdldCh0aGlzLmFwcElkKTtcbiAgfVxuXG4gIHZhbGlkYXRlQWRhcHRlcihhZGFwdGVyKSB7XG4gICAgLy8gQWxsb3cgbm8gYWRhcHRlclxuICAgIGlmICghYWRhcHRlciAmJiAhdGhpcy5zaG91bGRWZXJpZnlFbWFpbHMpIHtcbiAgICAgIHJldHVybjtcbiAgICB9XG4gICAgc3VwZXIudmFsaWRhdGVBZGFwdGVyKGFkYXB0ZXIpO1xuICB9XG5cbiAgZXhwZWN0ZWRBZGFwdGVyVHlwZSgpIHtcbiAgICByZXR1cm4gTWFpbEFkYXB0ZXI7XG4gIH1cblxuICBnZXQgc2hvdWxkVmVyaWZ5RW1haWxzKCkge1xuICAgIHJldHVybiAodGhpcy5jb25maWcgfHwgdGhpcy5vcHRpb25zKS52ZXJpZnlVc2VyRW1haWxzO1xuICB9XG5cbiAgYXN5bmMgc2V0RW1haWxWZXJpZnlUb2tlbih1c2VyLCByZXEsIHN0b3JhZ2UgPSB7fSkge1xuICAgIGxldCBzaG91bGRTZW5kRW1haWwgPSB0aGlzLnNob3VsZFZlcmlmeUVtYWlscztcbiAgICBpZiAodHlwZW9mIHNob3VsZFNlbmRFbWFpbCA9PT0gJ2Z1bmN0aW9uJykge1xuICAgICAgY29uc3QgcmVzcG9uc2UgPSBhd2FpdCBQcm9taXNlLnJlc29sdmUoc2hvdWxkU2VuZEVtYWlsKHJlcSkpO1xuICAgICAgc2hvdWxkU2VuZEVtYWlsID0gcmVzcG9uc2UgIT09IGZhbHNlO1xuICAgIH1cbiAgICBpZiAoIXNob3VsZFNlbmRFbWFpbCkge1xuICAgICAgcmV0dXJuIGZhbHNlO1xuICAgIH1cbiAgICBzdG9yYWdlLnNlbmRWZXJpZmljYXRpb25FbWFpbCA9IHRydWU7XG4gICAgdXNlci5fZW1haWxfdmVyaWZ5X3Rva2VuID0gcmFuZG9tU3RyaW5nKDI1KTtcbiAgICBpZiAoXG4gICAgICAhc3RvcmFnZS5maWVsZHNDaGFuZ2VkQnlUcmlnZ2VyIHx8XG4gICAgICAhc3RvcmFnZS5maWVsZHNDaGFuZ2VkQnlUcmlnZ2VyLmluY2x1ZGVzKCdlbWFpbFZlcmlmaWVkJylcbiAgICApIHtcbiAgICAgIHVzZXIuZW1haWxWZXJpZmllZCA9IGZhbHNlO1xuICAgIH1cblxuICAgIGlmICh0aGlzLmNvbmZpZy5lbWFpbFZlcmlmeVRva2VuVmFsaWRpdHlEdXJhdGlvbikge1xuICAgICAgdXNlci5fZW1haWxfdmVyaWZ5X3Rva2VuX2V4cGlyZXNfYXQgPSBQYXJzZS5fZW5jb2RlKFxuICAgICAgICB0aGlzLmNvbmZpZy5nZW5lcmF0ZUVtYWlsVmVyaWZ5VG9rZW5FeHBpcmVzQXQoKVxuICAgICAgKTtcbiAgICB9XG4gICAgcmV0dXJuIHRydWU7XG4gIH1cblxuICB2ZXJpZnlFbWFpbCh1c2VybmFtZSwgdG9rZW4pIHtcbiAgICBpZiAoIXRoaXMuc2hvdWxkVmVyaWZ5RW1haWxzKSB7XG4gICAgICAvLyBUcnlpbmcgdG8gdmVyaWZ5IGVtYWlsIHdoZW4gbm90IGVuYWJsZWRcbiAgICAgIC8vIFRPRE86IEJldHRlciBlcnJvciBoZXJlLlxuICAgICAgdGhyb3cgdW5kZWZpbmVkO1xuICAgIH1cblxuICAgIGNvbnN0IHF1ZXJ5ID0geyB1c2VybmFtZTogdXNlcm5hbWUsIF9lbWFpbF92ZXJpZnlfdG9rZW46IHRva2VuIH07XG4gICAgY29uc3QgdXBkYXRlRmllbGRzID0ge1xuICAgICAgZW1haWxWZXJpZmllZDogdHJ1ZSxcbiAgICAgIF9lbWFpbF92ZXJpZnlfdG9rZW46IHsgX19vcDogJ0RlbGV0ZScgfSxcbiAgICB9O1xuXG4gICAgLy8gaWYgdGhlIGVtYWlsIHZlcmlmeSB0b2tlbiBuZWVkcyB0byBiZSB2YWxpZGF0ZWQgdGhlblxuICAgIC8vIGFkZCBhZGRpdGlvbmFsIHF1ZXJ5IHBhcmFtcyBhbmQgYWRkaXRpb25hbCBmaWVsZHMgdGhhdCBuZWVkIHRvIGJlIHVwZGF0ZWRcbiAgICBpZiAodGhpcy5jb25maWcuZW1haWxWZXJpZnlUb2tlblZhbGlkaXR5RHVyYXRpb24pIHtcbiAgICAgIHF1ZXJ5LmVtYWlsVmVyaWZpZWQgPSBmYWxzZTtcbiAgICAgIHF1ZXJ5Ll9lbWFpbF92ZXJpZnlfdG9rZW5fZXhwaXJlc19hdCA9IHsgJGd0OiBQYXJzZS5fZW5jb2RlKG5ldyBEYXRlKCkpIH07XG5cbiAgICAgIHVwZGF0ZUZpZWxkcy5fZW1haWxfdmVyaWZ5X3Rva2VuX2V4cGlyZXNfYXQgPSB7IF9fb3A6ICdEZWxldGUnIH07XG4gICAgfVxuICAgIGNvbnN0IG1haW50ZW5hbmNlQXV0aCA9IEF1dGgubWFpbnRlbmFuY2UodGhpcy5jb25maWcpO1xuICAgIHZhciBmaW5kVXNlckZvckVtYWlsVmVyaWZpY2F0aW9uID0gbmV3IFJlc3RRdWVyeSh0aGlzLmNvbmZpZywgbWFpbnRlbmFuY2VBdXRoLCAnX1VzZXInLCB7XG4gICAgICB1c2VybmFtZSxcbiAgICB9KTtcbiAgICByZXR1cm4gZmluZFVzZXJGb3JFbWFpbFZlcmlmaWNhdGlvbi5leGVjdXRlKCkudGhlbihyZXN1bHQgPT4ge1xuICAgICAgaWYgKHJlc3VsdC5yZXN1bHRzLmxlbmd0aCAmJiByZXN1bHQucmVzdWx0c1swXS5lbWFpbFZlcmlmaWVkKSB7XG4gICAgICAgIHJldHVybiBQcm9taXNlLnJlc29sdmUocmVzdWx0LnJlc3VsdHMubGVuZ3RoWzBdKTtcbiAgICAgIH0gZWxzZSBpZiAocmVzdWx0LnJlc3VsdHMubGVuZ3RoKSB7XG4gICAgICAgIHF1ZXJ5Lm9iamVjdElkID0gcmVzdWx0LnJlc3VsdHNbMF0ub2JqZWN0SWQ7XG4gICAgICB9XG4gICAgICByZXR1cm4gcmVzdC51cGRhdGUodGhpcy5jb25maWcsIG1haW50ZW5hbmNlQXV0aCwgJ19Vc2VyJywgcXVlcnksIHVwZGF0ZUZpZWxkcyk7XG4gICAgfSk7XG4gIH1cblxuICBjaGVja1Jlc2V0VG9rZW5WYWxpZGl0eSh1c2VybmFtZSwgdG9rZW4pIHtcbiAgICByZXR1cm4gdGhpcy5jb25maWcuZGF0YWJhc2VcbiAgICAgIC5maW5kKFxuICAgICAgICAnX1VzZXInLFxuICAgICAgICB7XG4gICAgICAgICAgdXNlcm5hbWU6IHVzZXJuYW1lLFxuICAgICAgICAgIF9wZXJpc2hhYmxlX3Rva2VuOiB0b2tlbixcbiAgICAgICAgfSxcbiAgICAgICAgeyBsaW1pdDogMSB9LFxuICAgICAgICBBdXRoLm1haW50ZW5hbmNlKHRoaXMuY29uZmlnKVxuICAgICAgKVxuICAgICAgLnRoZW4ocmVzdWx0cyA9PiB7XG4gICAgICAgIGlmIChyZXN1bHRzLmxlbmd0aCAhPSAxKSB7XG4gICAgICAgICAgdGhyb3cgJ0ZhaWxlZCB0byByZXNldCBwYXNzd29yZDogdXNlcm5hbWUgLyBlbWFpbCAvIHRva2VuIGlzIGludmFsaWQnO1xuICAgICAgICB9XG5cbiAgICAgICAgaWYgKHRoaXMuY29uZmlnLnBhc3N3b3JkUG9saWN5ICYmIHRoaXMuY29uZmlnLnBhc3N3b3JkUG9saWN5LnJlc2V0VG9rZW5WYWxpZGl0eUR1cmF0aW9uKSB7XG4gICAgICAgICAgbGV0IGV4cGlyZXNEYXRlID0gcmVzdWx0c1swXS5fcGVyaXNoYWJsZV90b2tlbl9leHBpcmVzX2F0O1xuICAgICAgICAgIGlmIChleHBpcmVzRGF0ZSAmJiBleHBpcmVzRGF0ZS5fX3R5cGUgPT0gJ0RhdGUnKSB7XG4gICAgICAgICAgICBleHBpcmVzRGF0ZSA9IG5ldyBEYXRlKGV4cGlyZXNEYXRlLmlzbyk7XG4gICAgICAgICAgfVxuICAgICAgICAgIGlmIChleHBpcmVzRGF0ZSA8IG5ldyBEYXRlKCkpIHRocm93ICdUaGUgcGFzc3dvcmQgcmVzZXQgbGluayBoYXMgZXhwaXJlZCc7XG4gICAgICAgIH1cbiAgICAgICAgcmV0dXJuIHJlc3VsdHNbMF07XG4gICAgICB9KTtcbiAgfVxuXG4gIGdldFVzZXJJZk5lZWRlZCh1c2VyKSB7XG4gICAgaWYgKHVzZXIudXNlcm5hbWUgJiYgdXNlci5lbWFpbCkge1xuICAgICAgcmV0dXJuIFByb21pc2UucmVzb2x2ZSh1c2VyKTtcbiAgICB9XG4gICAgdmFyIHdoZXJlID0ge307XG4gICAgaWYgKHVzZXIudXNlcm5hbWUpIHtcbiAgICAgIHdoZXJlLnVzZXJuYW1lID0gdXNlci51c2VybmFtZTtcbiAgICB9XG4gICAgaWYgKHVzZXIuZW1haWwpIHtcbiAgICAgIHdoZXJlLmVtYWlsID0gdXNlci5lbWFpbDtcbiAgICB9XG5cbiAgICB2YXIgcXVlcnkgPSBuZXcgUmVzdFF1ZXJ5KHRoaXMuY29uZmlnLCBBdXRoLm1hc3Rlcih0aGlzLmNvbmZpZyksICdfVXNlcicsIHdoZXJlKTtcbiAgICByZXR1cm4gcXVlcnkuZXhlY3V0ZSgpLnRoZW4oZnVuY3Rpb24gKHJlc3VsdCkge1xuICAgICAgaWYgKHJlc3VsdC5yZXN1bHRzLmxlbmd0aCAhPSAxKSB7XG4gICAgICAgIHRocm93IHVuZGVmaW5lZDtcbiAgICAgIH1cbiAgICAgIHJldHVybiByZXN1bHQucmVzdWx0c1swXTtcbiAgICB9KTtcbiAgfVxuXG4gIGFzeW5jIHNlbmRWZXJpZmljYXRpb25FbWFpbCh1c2VyLCByZXEpIHtcbiAgICBpZiAoIXRoaXMuc2hvdWxkVmVyaWZ5RW1haWxzKSB7XG4gICAgICByZXR1cm47XG4gICAgfVxuICAgIGNvbnN0IHRva2VuID0gZW5jb2RlVVJJQ29tcG9uZW50KHVzZXIuX2VtYWlsX3ZlcmlmeV90b2tlbik7XG4gICAgLy8gV2UgbWF5IG5lZWQgdG8gZmV0Y2ggdGhlIHVzZXIgaW4gY2FzZSBvZiB1cGRhdGUgZW1haWxcbiAgICBjb25zdCBmZXRjaGVkVXNlciA9IGF3YWl0IHRoaXMuZ2V0VXNlcklmTmVlZGVkKHVzZXIpO1xuICAgIGxldCBzaG91bGRTZW5kRW1haWwgPSB0aGlzLmNvbmZpZy5zZW5kVXNlckVtYWlsVmVyaWZpY2F0aW9uO1xuICAgIGlmICh0eXBlb2Ygc2hvdWxkU2VuZEVtYWlsID09PSAnZnVuY3Rpb24nKSB7XG4gICAgICBjb25zdCByZXNwb25zZSA9IGF3YWl0IFByb21pc2UucmVzb2x2ZShcbiAgICAgICAgdGhpcy5jb25maWcuc2VuZFVzZXJFbWFpbFZlcmlmaWNhdGlvbih7XG4gICAgICAgICAgdXNlcjogUGFyc2UuT2JqZWN0LmZyb21KU09OKHsgY2xhc3NOYW1lOiAnX1VzZXInLCAuLi5mZXRjaGVkVXNlciB9KSxcbiAgICAgICAgICBtYXN0ZXI6IHJlcS5hdXRoPy5pc01hc3RlcixcbiAgICAgICAgfSlcbiAgICAgICk7XG4gICAgICBzaG91bGRTZW5kRW1haWwgPSAhIXJlc3BvbnNlO1xuICAgIH1cbiAgICBpZiAoIXNob3VsZFNlbmRFbWFpbCkge1xuICAgICAgcmV0dXJuO1xuICAgIH1cbiAgICBjb25zdCB1c2VybmFtZSA9IGVuY29kZVVSSUNvbXBvbmVudCh1c2VyLnVzZXJuYW1lKTtcblxuICAgIGNvbnN0IGxpbmsgPSBidWlsZEVtYWlsTGluayh0aGlzLmNvbmZpZy52ZXJpZnlFbWFpbFVSTCwgdXNlcm5hbWUsIHRva2VuLCB0aGlzLmNvbmZpZyk7XG4gICAgY29uc3Qgb3B0aW9ucyA9IHtcbiAgICAgIGFwcE5hbWU6IHRoaXMuY29uZmlnLmFwcE5hbWUsXG4gICAgICBsaW5rOiBsaW5rLFxuICAgICAgdXNlcjogaW5mbGF0ZSgnX1VzZXInLCBmZXRjaGVkVXNlciksXG4gICAgfTtcbiAgICBpZiAodGhpcy5hZGFwdGVyLnNlbmRWZXJpZmljYXRpb25FbWFpbCkge1xuICAgICAgdGhpcy5hZGFwdGVyLnNlbmRWZXJpZmljYXRpb25FbWFpbChvcHRpb25zKTtcbiAgICB9IGVsc2Uge1xuICAgICAgdGhpcy5hZGFwdGVyLnNlbmRNYWlsKHRoaXMuZGVmYXVsdFZlcmlmaWNhdGlvbkVtYWlsKG9wdGlvbnMpKTtcbiAgICB9XG4gIH1cblxuICAvKipcbiAgICogUmVnZW5lcmF0ZXMgdGhlIGdpdmVuIHVzZXIncyBlbWFpbCB2ZXJpZmljYXRpb24gdG9rZW5cbiAgICpcbiAgICogQHBhcmFtIHVzZXJcbiAgICogQHJldHVybnMgeyp9XG4gICAqL1xuICBhc3luYyByZWdlbmVyYXRlRW1haWxWZXJpZnlUb2tlbih1c2VyLCBtYXN0ZXIpIHtcbiAgICBjb25zdCB7IF9lbWFpbF92ZXJpZnlfdG9rZW4gfSA9IHVzZXI7XG4gICAgbGV0IHsgX2VtYWlsX3ZlcmlmeV90b2tlbl9leHBpcmVzX2F0IH0gPSB1c2VyO1xuICAgIGlmIChfZW1haWxfdmVyaWZ5X3Rva2VuX2V4cGlyZXNfYXQgJiYgX2VtYWlsX3ZlcmlmeV90b2tlbl9leHBpcmVzX2F0Ll9fdHlwZSA9PT0gJ0RhdGUnKSB7XG4gICAgICBfZW1haWxfdmVyaWZ5X3Rva2VuX2V4cGlyZXNfYXQgPSBfZW1haWxfdmVyaWZ5X3Rva2VuX2V4cGlyZXNfYXQuaXNvO1xuICAgIH1cbiAgICBpZiAoXG4gICAgICB0aGlzLmNvbmZpZy5lbWFpbFZlcmlmeVRva2VuUmV1c2VJZlZhbGlkICYmXG4gICAgICB0aGlzLmNvbmZpZy5lbWFpbFZlcmlmeVRva2VuVmFsaWRpdHlEdXJhdGlvbiAmJlxuICAgICAgX2VtYWlsX3ZlcmlmeV90b2tlbiAmJlxuICAgICAgbmV3IERhdGUoKSA8IG5ldyBEYXRlKF9lbWFpbF92ZXJpZnlfdG9rZW5fZXhwaXJlc19hdClcbiAgICApIHtcbiAgICAgIHJldHVybiBQcm9taXNlLnJlc29sdmUoKTtcbiAgICB9XG4gICAgY29uc3Qgc2hvdWxkU2VuZCA9IGF3YWl0IHRoaXMuc2V0RW1haWxWZXJpZnlUb2tlbih1c2VyLCB7IHVzZXIsIG1hc3RlciB9KTtcbiAgICBpZiAoIXNob3VsZFNlbmQpIHtcbiAgICAgIHJldHVybjtcbiAgICB9XG4gICAgcmV0dXJuIHRoaXMuY29uZmlnLmRhdGFiYXNlLnVwZGF0ZSgnX1VzZXInLCB7IHVzZXJuYW1lOiB1c2VyLnVzZXJuYW1lIH0sIHVzZXIpO1xuICB9XG5cbiAgYXN5bmMgcmVzZW5kVmVyaWZpY2F0aW9uRW1haWwodXNlcm5hbWUsIHJlcSkge1xuICAgIGNvbnN0IGFVc2VyID0gYXdhaXQgdGhpcy5nZXRVc2VySWZOZWVkZWQoeyB1c2VybmFtZTogdXNlcm5hbWUgfSk7XG4gICAgaWYgKCFhVXNlciB8fCBhVXNlci5lbWFpbFZlcmlmaWVkKSB7XG4gICAgICB0aHJvdyB1bmRlZmluZWQ7XG4gICAgfVxuICAgIGNvbnN0IGdlbmVyYXRlID0gYXdhaXQgdGhpcy5yZWdlbmVyYXRlRW1haWxWZXJpZnlUb2tlbihhVXNlciwgcmVxLmF1dGg/LmlzTWFzdGVyKTtcbiAgICBpZiAoZ2VuZXJhdGUpIHtcbiAgICAgIHRoaXMuc2VuZFZlcmlmaWNhdGlvbkVtYWlsKGFVc2VyLCByZXEpO1xuICAgIH1cbiAgfVxuXG4gIHNldFBhc3N3b3JkUmVzZXRUb2tlbihlbWFpbCkge1xuICAgIGNvbnN0IHRva2VuID0geyBfcGVyaXNoYWJsZV90b2tlbjogcmFuZG9tU3RyaW5nKDI1KSB9O1xuXG4gICAgaWYgKHRoaXMuY29uZmlnLnBhc3N3b3JkUG9saWN5ICYmIHRoaXMuY29uZmlnLnBhc3N3b3JkUG9saWN5LnJlc2V0VG9rZW5WYWxpZGl0eUR1cmF0aW9uKSB7XG4gICAgICB0b2tlbi5fcGVyaXNoYWJsZV90b2tlbl9leHBpcmVzX2F0ID0gUGFyc2UuX2VuY29kZShcbiAgICAgICAgdGhpcy5jb25maWcuZ2VuZXJhdGVQYXNzd29yZFJlc2V0VG9rZW5FeHBpcmVzQXQoKVxuICAgICAgKTtcbiAgICB9XG5cbiAgICByZXR1cm4gdGhpcy5jb25maWcuZGF0YWJhc2UudXBkYXRlKFxuICAgICAgJ19Vc2VyJyxcbiAgICAgIHsgJG9yOiBbeyBlbWFpbCB9LCB7IHVzZXJuYW1lOiBlbWFpbCwgZW1haWw6IHsgJGV4aXN0czogZmFsc2UgfSB9XSB9LFxuICAgICAgdG9rZW4sXG4gICAgICB7fSxcbiAgICAgIHRydWVcbiAgICApO1xuICB9XG5cbiAgYXN5bmMgc2VuZFBhc3N3b3JkUmVzZXRFbWFpbChlbWFpbCkge1xuICAgIGlmICghdGhpcy5hZGFwdGVyKSB7XG4gICAgICB0aHJvdyAnVHJ5aW5nIHRvIHNlbmQgYSByZXNldCBwYXNzd29yZCBidXQgbm8gYWRhcHRlciBpcyBzZXQnO1xuICAgICAgLy8gIFRPRE86IE5vIGFkYXB0ZXI/XG4gICAgfVxuICAgIGxldCB1c2VyO1xuICAgIGlmIChcbiAgICAgIHRoaXMuY29uZmlnLnBhc3N3b3JkUG9saWN5ICYmXG4gICAgICB0aGlzLmNvbmZpZy5wYXNzd29yZFBvbGljeS5yZXNldFRva2VuUmV1c2VJZlZhbGlkICYmXG4gICAgICB0aGlzLmNvbmZpZy5wYXNzd29yZFBvbGljeS5yZXNldFRva2VuVmFsaWRpdHlEdXJhdGlvblxuICAgICkge1xuICAgICAgY29uc3QgcmVzdWx0cyA9IGF3YWl0IHRoaXMuY29uZmlnLmRhdGFiYXNlLmZpbmQoXG4gICAgICAgICdfVXNlcicsXG4gICAgICAgIHtcbiAgICAgICAgICAkb3I6IFtcbiAgICAgICAgICAgIHsgZW1haWwsIF9wZXJpc2hhYmxlX3Rva2VuOiB7ICRleGlzdHM6IHRydWUgfSB9LFxuICAgICAgICAgICAgeyB1c2VybmFtZTogZW1haWwsIGVtYWlsOiB7ICRleGlzdHM6IGZhbHNlIH0sIF9wZXJpc2hhYmxlX3Rva2VuOiB7ICRleGlzdHM6IHRydWUgfSB9LFxuICAgICAgICAgIF0sXG4gICAgICAgIH0sXG4gICAgICAgIHsgbGltaXQ6IDEgfSxcbiAgICAgICAgQXV0aC5tYWludGVuYW5jZSh0aGlzLmNvbmZpZylcbiAgICAgICk7XG4gICAgICBpZiAocmVzdWx0cy5sZW5ndGggPT0gMSkge1xuICAgICAgICBsZXQgZXhwaXJlc0RhdGUgPSByZXN1bHRzWzBdLl9wZXJpc2hhYmxlX3Rva2VuX2V4cGlyZXNfYXQ7XG4gICAgICAgIGlmIChleHBpcmVzRGF0ZSAmJiBleHBpcmVzRGF0ZS5fX3R5cGUgPT0gJ0RhdGUnKSB7XG4gICAgICAgICAgZXhwaXJlc0RhdGUgPSBuZXcgRGF0ZShleHBpcmVzRGF0ZS5pc28pO1xuICAgICAgICB9XG4gICAgICAgIGlmIChleHBpcmVzRGF0ZSA+IG5ldyBEYXRlKCkpIHtcbiAgICAgICAgICB1c2VyID0gcmVzdWx0c1swXTtcbiAgICAgICAgfVxuICAgICAgfVxuICAgIH1cbiAgICBpZiAoIXVzZXIgfHwgIXVzZXIuX3BlcmlzaGFibGVfdG9rZW4pIHtcbiAgICAgIHVzZXIgPSBhd2FpdCB0aGlzLnNldFBhc3N3b3JkUmVzZXRUb2tlbihlbWFpbCk7XG4gICAgfVxuICAgIGNvbnN0IHRva2VuID0gZW5jb2RlVVJJQ29tcG9uZW50KHVzZXIuX3BlcmlzaGFibGVfdG9rZW4pO1xuICAgIGNvbnN0IHVzZXJuYW1lID0gZW5jb2RlVVJJQ29tcG9uZW50KHVzZXIudXNlcm5hbWUpO1xuXG4gICAgY29uc3QgbGluayA9IGJ1aWxkRW1haWxMaW5rKHRoaXMuY29uZmlnLnJlcXVlc3RSZXNldFBhc3N3b3JkVVJMLCB1c2VybmFtZSwgdG9rZW4sIHRoaXMuY29uZmlnKTtcbiAgICBjb25zdCBvcHRpb25zID0ge1xuICAgICAgYXBwTmFtZTogdGhpcy5jb25maWcuYXBwTmFtZSxcbiAgICAgIGxpbms6IGxpbmssXG4gICAgICB1c2VyOiBpbmZsYXRlKCdfVXNlcicsIHVzZXIpLFxuICAgIH07XG5cbiAgICBpZiAodGhpcy5hZGFwdGVyLnNlbmRQYXNzd29yZFJlc2V0RW1haWwpIHtcbiAgICAgIHRoaXMuYWRhcHRlci5zZW5kUGFzc3dvcmRSZXNldEVtYWlsKG9wdGlvbnMpO1xuICAgIH0gZWxzZSB7XG4gICAgICB0aGlzLmFkYXB0ZXIuc2VuZE1haWwodGhpcy5kZWZhdWx0UmVzZXRQYXNzd29yZEVtYWlsKG9wdGlvbnMpKTtcbiAgICB9XG5cbiAgICByZXR1cm4gUHJvbWlzZS5yZXNvbHZlKHVzZXIpO1xuICB9XG5cbiAgdXBkYXRlUGFzc3dvcmQodXNlcm5hbWUsIHRva2VuLCBwYXNzd29yZCkge1xuICAgIHJldHVybiB0aGlzLmNoZWNrUmVzZXRUb2tlblZhbGlkaXR5KHVzZXJuYW1lLCB0b2tlbilcbiAgICAgIC50aGVuKHVzZXIgPT4gdXBkYXRlVXNlclBhc3N3b3JkKHVzZXIsIHBhc3N3b3JkLCB0aGlzLmNvbmZpZykpXG4gICAgICAudGhlbih1c2VyID0+IHtcbiAgICAgICAgY29uc3QgYWNjb3VudExvY2tvdXRQb2xpY3kgPSBuZXcgQWNjb3VudExvY2tvdXQodXNlciwgdGhpcy5jb25maWcpO1xuICAgICAgICByZXR1cm4gYWNjb3VudExvY2tvdXRQb2xpY3kudW5sb2NrQWNjb3VudCgpO1xuICAgICAgfSlcbiAgICAgIC5jYXRjaChlcnJvciA9PiB7XG4gICAgICAgIGlmIChlcnJvciAmJiBlcnJvci5tZXNzYWdlKSB7XG4gICAgICAgICAgLy8gaW4gY2FzZSBvZiBQYXJzZS5FcnJvciwgZmFpbCB3aXRoIHRoZSBlcnJvciBtZXNzYWdlIG9ubHlcbiAgICAgICAgICByZXR1cm4gUHJvbWlzZS5yZWplY3QoZXJyb3IubWVzc2FnZSk7XG4gICAgICAgIH0gZWxzZSB7XG4gICAgICAgICAgcmV0dXJuIFByb21pc2UucmVqZWN0KGVycm9yKTtcbiAgICAgICAgfVxuICAgICAgfSk7XG4gIH1cblxuICBkZWZhdWx0VmVyaWZpY2F0aW9uRW1haWwoeyBsaW5rLCB1c2VyLCBhcHBOYW1lIH0pIHtcbiAgICBjb25zdCB0ZXh0ID1cbiAgICAgICdIaSxcXG5cXG4nICtcbiAgICAgICdZb3UgYXJlIGJlaW5nIGFza2VkIHRvIGNvbmZpcm0gdGhlIGUtbWFpbCBhZGRyZXNzICcgK1xuICAgICAgdXNlci5nZXQoJ2VtYWlsJykgK1xuICAgICAgJyB3aXRoICcgK1xuICAgICAgYXBwTmFtZSArXG4gICAgICAnXFxuXFxuJyArXG4gICAgICAnJyArXG4gICAgICAnQ2xpY2sgaGVyZSB0byBjb25maXJtIGl0OlxcbicgK1xuICAgICAgbGluaztcbiAgICBjb25zdCB0byA9IHVzZXIuZ2V0KCdlbWFpbCcpO1xuICAgIGNvbnN0IHN1YmplY3QgPSAnUGxlYXNlIHZlcmlmeSB5b3VyIGUtbWFpbCBmb3IgJyArIGFwcE5hbWU7XG4gICAgcmV0dXJuIHsgdGV4dCwgdG8sIHN1YmplY3QgfTtcbiAgfVxuXG4gIGRlZmF1bHRSZXNldFBhc3N3b3JkRW1haWwoeyBsaW5rLCB1c2VyLCBhcHBOYW1lIH0pIHtcbiAgICBjb25zdCB0ZXh0ID1cbiAgICAgICdIaSxcXG5cXG4nICtcbiAgICAgICdZb3UgcmVxdWVzdGVkIHRvIHJlc2V0IHlvdXIgcGFzc3dvcmQgZm9yICcgK1xuICAgICAgYXBwTmFtZSArXG4gICAgICAodXNlci5nZXQoJ3VzZXJuYW1lJykgPyBcIiAoeW91ciB1c2VybmFtZSBpcyAnXCIgKyB1c2VyLmdldCgndXNlcm5hbWUnKSArIFwiJylcIiA6ICcnKSArXG4gICAgICAnLlxcblxcbicgK1xuICAgICAgJycgK1xuICAgICAgJ0NsaWNrIGhlcmUgdG8gcmVzZXQgaXQ6XFxuJyArXG4gICAgICBsaW5rO1xuICAgIGNvbnN0IHRvID0gdXNlci5nZXQoJ2VtYWlsJykgfHwgdXNlci5nZXQoJ3VzZXJuYW1lJyk7XG4gICAgY29uc3Qgc3ViamVjdCA9ICdQYXNzd29yZCBSZXNldCBmb3IgJyArIGFwcE5hbWU7XG4gICAgcmV0dXJuIHsgdGV4dCwgdG8sIHN1YmplY3QgfTtcbiAgfVxufVxuXG4vLyBNYXJrIHRoaXMgcHJpdmF0ZVxuZnVuY3Rpb24gdXBkYXRlVXNlclBhc3N3b3JkKHVzZXIsIHBhc3N3b3JkLCBjb25maWcpIHtcbiAgcmV0dXJuIHJlc3RcbiAgICAudXBkYXRlKFxuICAgICAgY29uZmlnLFxuICAgICAgQXV0aC5tYXN0ZXIoY29uZmlnKSxcbiAgICAgICdfVXNlcicsXG4gICAgICB7IG9iamVjdElkOiB1c2VyLm9iamVjdElkIH0sXG4gICAgICB7XG4gICAgICAgIHBhc3N3b3JkOiBwYXNzd29yZCxcbiAgICAgIH1cbiAgICApXG4gICAgLnRoZW4oKCkgPT4gdXNlcik7XG59XG5cbmZ1bmN0aW9uIGJ1aWxkRW1haWxMaW5rKGRlc3RpbmF0aW9uLCB1c2VybmFtZSwgdG9rZW4sIGNvbmZpZykge1xuICBjb25zdCB1c2VybmFtZUFuZFRva2VuID0gYHRva2VuPSR7dG9rZW59JnVzZXJuYW1lPSR7dXNlcm5hbWV9YDtcblxuICBpZiAoY29uZmlnLnBhcnNlRnJhbWVVUkwpIHtcbiAgICBjb25zdCBkZXN0aW5hdGlvbldpdGhvdXRIb3N0ID0gZGVzdGluYXRpb24ucmVwbGFjZShjb25maWcucHVibGljU2VydmVyVVJMLCAnJyk7XG5cbiAgICByZXR1cm4gYCR7Y29uZmlnLnBhcnNlRnJhbWVVUkx9P2xpbms9JHtlbmNvZGVVUklDb21wb25lbnQoXG4gICAgICBkZXN0aW5hdGlvbldpdGhvdXRIb3N0XG4gICAgKX0mJHt1c2VybmFtZUFuZFRva2VufWA7XG4gIH0gZWxzZSB7XG4gICAgcmV0dXJuIGAke2Rlc3RpbmF0aW9ufT8ke3VzZXJuYW1lQW5kVG9rZW59YDtcbiAgfVxufVxuXG5leHBvcnQgZGVmYXVsdCBVc2VyQ29udHJvbGxlcjtcbiJdLCJtYXBw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