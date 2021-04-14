"use strict";

Object.defineProperty(exports, "__esModule", {
  value: true
});
exports.default = exports.Config = void 0;

var _cache = _interopRequireDefault(require("./cache"));

var _DatabaseController = _interopRequireDefault(require("./Controllers/DatabaseController"));

var _net = _interopRequireDefault(require("net"));

var _Definitions = require("./Options/Definitions");

var _lodash = require("lodash");

function _interopRequireDefault(obj) { return obj && obj.__esModule ? obj : { default: obj }; }

// A Config object provides information about how a specific app is
// configured.
// mount is the URL for the root of the API; includes http, domain, etc.
function removeTrailingSlash(str) {
  if (!str) {
    return str;
  }

  if (str.endsWith('/')) {
    str = str.substr(0, str.length - 1);
  }

  return str;
}

class Config {
  static get(applicationId, mount) {
    const cacheInfo = _cache.default.get(applicationId);

    if (!cacheInfo) {
      return;
    }

    const config = new Config();
    config.applicationId = applicationId;
    Object.keys(cacheInfo).forEach(key => {
      if (key == 'databaseController') {
        config.database = new _DatabaseController.default(cacheInfo.databaseController.adapter);
      } else {
        config[key] = cacheInfo[key];
      }
    });
    config.mount = removeTrailingSlash(mount);
    config.generateSessionExpiresAt = config.generateSessionExpiresAt.bind(config);
    config.generateEmailVerifyTokenExpiresAt = config.generateEmailVerifyTokenExpiresAt.bind(config);
    return config;
  }

  static put(serverConfiguration) {
    Config.validate(serverConfiguration);

    _cache.default.put(serverConfiguration.appId, serverConfiguration);

    Config.setupPasswordValidator(serverConfiguration.passwordPolicy);
    return serverConfiguration;
  }

  static validate({
    verifyUserEmails,
    userController,
    appName,
    publicServerURL,
    revokeSessionOnPasswordReset,
    expireInactiveSessions,
    sessionLength,
    maxLimit,
    emailVerifyTokenValidityDuration,
    accountLockout,
    passwordPolicy,
    masterKeyIps,
    masterKey,
    readOnlyMasterKey,
    allowHeaders,
    idempotencyOptions,
    emailVerifyTokenReuseIfValid,
    fileUpload,
    pages,
    security
  }) {
    if (masterKey === readOnlyMasterKey) {
      throw new Error('masterKey and readOnlyMasterKey should be different');
    }

    const emailAdapter = userController.adapter;

    if (verifyUserEmails) {
      this.validateEmailConfiguration({
        emailAdapter,
        appName,
        publicServerURL,
        emailVerifyTokenValidityDuration,
        emailVerifyTokenReuseIfValid
      });
    }

    this.validateAccountLockoutPolicy(accountLockout);
    this.validatePasswordPolicy(passwordPolicy);
    this.validateFileUploadOptions(fileUpload);

    if (typeof revokeSessionOnPasswordReset !== 'boolean') {
      throw 'revokeSessionOnPasswordReset must be a boolean value';
    }

    if (publicServerURL) {
      if (!publicServerURL.startsWith('http://') && !publicServerURL.startsWith('https://')) {
        throw 'publicServerURL should be a valid HTTPS URL starting with https://';
      }
    }

    this.validateSessionConfiguration(sessionLength, expireInactiveSessions);
    this.validateMasterKeyIps(masterKeyIps);
    this.validateMaxLimit(maxLimit);
    this.validateAllowHeaders(allowHeaders);
    this.validateIdempotencyOptions(idempotencyOptions);
    this.validatePagesOptions(pages);
    this.validateSecurityOptions(security);
  }

  static validateSecurityOptions(security) {
    if (Object.prototype.toString.call(security) !== '[object Object]') {
      throw 'Parse Server option security must be an object.';
    }

    if (security.enableCheck === undefined) {
      security.enableCheck = _Definitions.SecurityOptions.enableCheck.default;
    } else if (!(0, _lodash.isBoolean)(security.enableCheck)) {
      throw 'Parse Server option security.enableCheck must be a boolean.';
    }

    if (security.enableCheckLog === undefined) {
      security.enableCheckLog = _Definitions.SecurityOptions.enableCheckLog.default;
    } else if (!(0, _lodash.isBoolean)(security.enableCheckLog)) {
      throw 'Parse Server option security.enableCheckLog must be a boolean.';
    }
  }

  static validatePagesOptions(pages) {
    if (Object.prototype.toString.call(pages) !== '[object Object]') {
      throw 'Parse Server option pages must be an object.';
    }

    if (pages.enableRouter === undefined) {
      pages.enableRouter = _Definitions.PagesOptions.enableRouter.default;
    } else if (!(0, _lodash.isBoolean)(pages.enableRouter)) {
      throw 'Parse Server option pages.enableRouter must be a boolean.';
    }

    if (pages.enableLocalization === undefined) {
      pages.enableLocalization = _Definitions.PagesOptions.enableLocalization.default;
    } else if (!(0, _lodash.isBoolean)(pages.enableLocalization)) {
      throw 'Parse Server option pages.enableLocalization must be a boolean.';
    }

    if (pages.localizationJsonPath === undefined) {
      pages.localizationJsonPath = _Definitions.PagesOptions.localizationJsonPath.default;
    } else if (!(0, _lodash.isString)(pages.localizationJsonPath)) {
      throw 'Parse Server option pages.localizationJsonPath must be a string.';
    }

    if (pages.localizationFallbackLocale === undefined) {
      pages.localizationFallbackLocale = _Definitions.PagesOptions.localizationFallbackLocale.default;
    } else if (!(0, _lodash.isString)(pages.localizationFallbackLocale)) {
      throw 'Parse Server option pages.localizationFallbackLocale must be a string.';
    }

    if (pages.placeholders === undefined) {
      pages.placeholders = _Definitions.PagesOptions.placeholders.default;
    } else if (Object.prototype.toString.call(pages.placeholders) !== '[object Object]' && typeof pages.placeholders !== 'function') {
      throw 'Parse Server option pages.placeholders must be an object or a function.';
    }

    if (pages.forceRedirect === undefined) {
      pages.forceRedirect = _Definitions.PagesOptions.forceRedirect.default;
    } else if (!(0, _lodash.isBoolean)(pages.forceRedirect)) {
      throw 'Parse Server option pages.forceRedirect must be a boolean.';
    }

    if (pages.pagesPath === undefined) {
      pages.pagesPath = _Definitions.PagesOptions.pagesPath.default;
    } else if (!(0, _lodash.isString)(pages.pagesPath)) {
      throw 'Parse Server option pages.pagesPath must be a string.';
    }

    if (pages.pagesEndpoint === undefined) {
      pages.pagesEndpoint = _Definitions.PagesOptions.pagesEndpoint.default;
    } else if (!(0, _lodash.isString)(pages.pagesEndpoint)) {
      throw 'Parse Server option pages.pagesEndpoint must be a string.';
    }

    if (pages.customUrls === undefined) {
      pages.customUrls = _Definitions.PagesOptions.customUrls.default;
    } else if (Object.prototype.toString.call(pages.customUrls) !== '[object Object]') {
      throw 'Parse Server option pages.customUrls must be an object.';
    }

    if (pages.customRoutes === undefined) {
      pages.customRoutes = _Definitions.PagesOptions.customRoutes.default;
    } else if (!(pages.customRoutes instanceof Array)) {
      throw 'Parse Server option pages.customRoutes must be an array.';
    }
  }

  static validateIdempotencyOptions(idempotencyOptions) {
    if (!idempotencyOptions) {
      return;
    }

    if (idempotencyOptions.ttl === undefined) {
      idempotencyOptions.ttl = _Definitions.IdempotencyOptions.ttl.default;
    } else if (!isNaN(idempotencyOptions.ttl) && idempotencyOptions.ttl <= 0) {
      throw 'idempotency TTL value must be greater than 0 seconds';
    } else if (isNaN(idempotencyOptions.ttl)) {
      throw 'idempotency TTL value must be a number';
    }

    if (!idempotencyOptions.paths) {
      idempotencyOptions.paths = _Definitions.IdempotencyOptions.paths.default;
    } else if (!(idempotencyOptions.paths instanceof Array)) {
      throw 'idempotency paths must be of an array of strings';
    }
  }

  static validateAccountLockoutPolicy(accountLockout) {
    if (accountLockout) {
      if (typeof accountLockout.duration !== 'number' || accountLockout.duration <= 0 || accountLockout.duration > 99999) {
        throw 'Account lockout duration should be greater than 0 and less than 100000';
      }

      if (!Number.isInteger(accountLockout.threshold) || accountLockout.threshold < 1 || accountLockout.threshold > 999) {
        throw 'Account lockout threshold should be an integer greater than 0 and less than 1000';
      }

      if (accountLockout.unlockOnPasswordReset === undefined) {
        accountLockout.unlockOnPasswordReset = _Definitions.AccountLockoutOptions.unlockOnPasswordReset.default;
      } else if (!(0, _lodash.isBoolean)(accountLockout.unlockOnPasswordReset)) {
        throw 'Parse Server option accountLockout.unlockOnPasswordReset must be a boolean.';
      }
    }
  }

  static validatePasswordPolicy(passwordPolicy) {
    if (passwordPolicy) {
      if (passwordPolicy.maxPasswordAge !== undefined && (typeof passwordPolicy.maxPasswordAge !== 'number' || passwordPolicy.maxPasswordAge < 0)) {
        throw 'passwordPolicy.maxPasswordAge must be a positive number';
      }

      if (passwordPolicy.resetTokenValidityDuration !== undefined && (typeof passwordPolicy.resetTokenValidityDuration !== 'number' || passwordPolicy.resetTokenValidityDuration <= 0)) {
        throw 'passwordPolicy.resetTokenValidityDuration must be a positive number';
      }

      if (passwordPolicy.validatorPattern) {
        if (typeof passwordPolicy.validatorPattern === 'string') {
          passwordPolicy.validatorPattern = new RegExp(passwordPolicy.validatorPattern);
        } else if (!(passwordPolicy.validatorPattern instanceof RegExp)) {
          throw 'passwordPolicy.validatorPattern must be a regex string or RegExp object.';
        }
      }

      if (passwordPolicy.validatorCallback && typeof passwordPolicy.validatorCallback !== 'function') {
        throw 'passwordPolicy.validatorCallback must be a function.';
      }

      if (passwordPolicy.doNotAllowUsername && typeof passwordPolicy.doNotAllowUsername !== 'boolean') {
        throw 'passwordPolicy.doNotAllowUsername must be a boolean value.';
      }

      if (passwordPolicy.maxPasswordHistory && (!Number.isInteger(passwordPolicy.maxPasswordHistory) || passwordPolicy.maxPasswordHistory <= 0 || passwordPolicy.maxPasswordHistory > 20)) {
        throw 'passwordPolicy.maxPasswordHistory must be an integer ranging 0 - 20';
      }

      if (passwordPolicy.resetTokenReuseIfValid && typeof passwordPolicy.resetTokenReuseIfValid !== 'boolean') {
        throw 'resetTokenReuseIfValid must be a boolean value';
      }

      if (passwordPolicy.resetTokenReuseIfValid && !passwordPolicy.resetTokenValidityDuration) {
        throw 'You cannot use resetTokenReuseIfValid without resetTokenValidityDuration';
      }
    }
  } // if the passwordPolicy.validatorPattern is configured then setup a callback to process the pattern


  static setupPasswordValidator(passwordPolicy) {
    if (passwordPolicy && passwordPolicy.validatorPattern) {
      passwordPolicy.patternValidator = value => {
        return passwordPolicy.validatorPattern.test(value);
      };
    }
  }

  static validateEmailConfiguration({
    emailAdapter,
    appName,
    publicServerURL,
    emailVerifyTokenValidityDuration,
    emailVerifyTokenReuseIfValid
  }) {
    if (!emailAdapter) {
      throw 'An emailAdapter is required for e-mail verification and password resets.';
    }

    if (typeof appName !== 'string') {
      throw 'An app name is required for e-mail verification and password resets.';
    }

    if (typeof publicServerURL !== 'string') {
      throw 'A public server url is required for e-mail verification and password resets.';
    }

    if (emailVerifyTokenValidityDuration) {
      if (isNaN(emailVerifyTokenValidityDuration)) {
        throw 'Email verify token validity duration must be a valid number.';
      } else if (emailVerifyTokenValidityDuration <= 0) {
        throw 'Email verify token validity duration must be a value greater than 0.';
      }
    }

    if (emailVerifyTokenReuseIfValid && typeof emailVerifyTokenReuseIfValid !== 'boolean') {
      throw 'emailVerifyTokenReuseIfValid must be a boolean value';
    }

    if (emailVerifyTokenReuseIfValid && !emailVerifyTokenValidityDuration) {
      throw 'You cannot use emailVerifyTokenReuseIfValid without emailVerifyTokenValidityDuration';
    }
  }

  static validateFileUploadOptions(fileUpload) {
    try {
      if (fileUpload == null || typeof fileUpload !== 'object' || fileUpload instanceof Array) {
        throw 'fileUpload must be an object value.';
      }
    } catch (e) {
      if (e instanceof ReferenceError) {
        return;
      }

      throw e;
    }

    if (fileUpload.enableForAnonymousUser === undefined) {
      fileUpload.enableForAnonymousUser = _Definitions.FileUploadOptions.enableForAnonymousUser.default;
    } else if (typeof fileUpload.enableForAnonymousUser !== 'boolean') {
      throw 'fileUpload.enableForAnonymousUser must be a boolean value.';
    }

    if (fileUpload.enableForPublic === undefined) {
      fileUpload.enableForPublic = _Definitions.FileUploadOptions.enableForPublic.default;
    } else if (typeof fileUpload.enableForPublic !== 'boolean') {
      throw 'fileUpload.enableForPublic must be a boolean value.';
    }

    if (fileUpload.enableForAuthenticatedUser === undefined) {
      fileUpload.enableForAuthenticatedUser = _Definitions.FileUploadOptions.enableForAuthenticatedUser.default;
    } else if (typeof fileUpload.enableForAuthenticatedUser !== 'boolean') {
      throw 'fileUpload.enableForAuthenticatedUser must be a boolean value.';
    }
  }

  static validateMasterKeyIps(masterKeyIps) {
    for (const ip of masterKeyIps) {
      if (!_net.default.isIP(ip)) {
        throw `Invalid ip in masterKeyIps: ${ip}`;
      }
    }
  }

  get mount() {
    var mount = this._mount;

    if (this.publicServerURL) {
      mount = this.publicServerURL;
    }

    return mount;
  }

  set mount(newValue) {
    this._mount = newValue;
  }

  static validateSessionConfiguration(sessionLength, expireInactiveSessions) {
    if (expireInactiveSessions) {
      if (isNaN(sessionLength)) {
        throw 'Session length must be a valid number.';
      } else if (sessionLength <= 0) {
        throw 'Session length must be a value greater than 0.';
      }
    }
  }

  static validateMaxLimit(maxLimit) {
    if (maxLimit <= 0) {
      throw 'Max limit must be a value greater than 0.';
    }
  }

  static validateAllowHeaders(allowHeaders) {
    if (![null, undefined].includes(allowHeaders)) {
      if (Array.isArray(allowHeaders)) {
        allowHeaders.forEach(header => {
          if (typeof header !== 'string') {
            throw 'Allow headers must only contain strings';
          } else if (!header.trim().length) {
            throw 'Allow headers must not contain empty strings';
          }
        });
      } else {
        throw 'Allow headers must be an array';
      }
    }
  }

  generateEmailVerifyTokenExpiresAt() {
    if (!this.verifyUserEmails || !this.emailVerifyTokenValidityDuration) {
      return undefined;
    }

    var now = new Date();
    return new Date(now.getTime() + this.emailVerifyTokenValidityDuration * 1000);
  }

  generatePasswordResetTokenExpiresAt() {
    if (!this.passwordPolicy || !this.passwordPolicy.resetTokenValidityDuration) {
      return undefined;
    }

    const now = new Date();
    return new Date(now.getTime() + this.passwordPolicy.resetTokenValidityDuration * 1000);
  }

  generateSessionExpiresAt() {
    if (!this.expireInactiveSessions) {
      return undefined;
    }

    var now = new Date();
    return new Date(now.getTime() + this.sessionLength * 1000);
  }

  get invalidLinkURL() {
    return this.customPages.invalidLink || `${this.publicServerURL}/apps/invalid_link.html`;
  }

  get invalidVerificationLinkURL() {
    return this.customPages.invalidVerificationLink || `${this.publicServerURL}/apps/invalid_verification_link.html`;
  }

  get linkSendSuccessURL() {
    return this.customPages.linkSendSuccess || `${this.publicServerURL}/apps/link_send_success.html`;
  }

  get linkSendFailURL() {
    return this.customPages.linkSendFail || `${this.publicServerURL}/apps/link_send_fail.html`;
  }

  get verifyEmailSuccessURL() {
    return this.customPages.verifyEmailSuccess || `${this.publicServerURL}/apps/verify_email_success.html`;
  }

  get choosePasswordURL() {
    return this.customPages.choosePassword || `${this.publicServerURL}/apps/choose_password`;
  }

  get requestResetPasswordURL() {
    return `${this.publicServerURL}/${this.pagesEndpoint}/${this.applicationId}/request_password_reset`;
  }

  get passwordResetSuccessURL() {
    return this.customPages.passwordResetSuccess || `${this.publicServerURL}/apps/password_reset_success.html`;
  }

  get parseFrameURL() {
    return this.customPages.parseFrameURL;
  }

  get verifyEmailURL() {
    return `${this.publicServerURL}/${this.pagesEndpoint}/${this.applicationId}/verify_email`;
  } // TODO: Remove this function once PagesRouter replaces the PublicAPIRouter;
  // the (default) endpoint has to be defined in PagesRouter only.


  get pagesEndpoint() {
    return this.pages && this.pages.enableRouter && this.pages.pagesEndpoint ? this.pages.pagesEndpoint : 'apps';
  }

}

exports.Config = Config;
var _default = Config;
exports.default = _default;
module.exports = Config;
//# sourceMappingURL=data:application/json;charset=utf-8;base64,eyJ2ZXJzaW9uIjozLCJzb3VyY2VzIjpbIi4uL3NyYy9Db25maWcuanMiXSwibmFtZXMiOlsicmVtb3ZlVHJhaWxpbmdTbGFzaCIsInN0ciIsImVuZHNXaXRoIiwic3Vic3RyIiwibGVuZ3RoIiwiQ29uZmlnIiwiZ2V0IiwiYXBwbGljYXRpb25JZCIsIm1vdW50IiwiY2FjaGVJbmZvIiwiQXBwQ2FjaGUiLCJjb25maWciLCJPYmplY3QiLCJrZXlzIiwiZm9yRWFjaCIsImtleSIsImRhdGFiYXNlIiwiRGF0YWJhc2VDb250cm9sbGVyIiwiZGF0YWJhc2VDb250cm9sbGVyIiwiYWRhcHRlciIsImdlbmVyYXRlU2Vzc2lvbkV4cGlyZXNBdCIsImJpbmQiLCJnZW5lcmF0ZUVtYWlsVmVyaWZ5VG9rZW5FeHBpcmVzQXQiLCJwdXQiLCJzZXJ2ZXJDb25maWd1cmF0aW9uIiwidmFsaWRhdGUiLCJhcHBJZCIsInNldHVwUGFzc3dvcmRWYWxpZGF0b3IiLCJwYXNzd29yZFBvbGljeSIsInZlcmlmeVVzZXJFbWFpbHMiLCJ1c2VyQ29udHJvbGxlciIsImFwcE5hbWUiLCJwdWJsaWNTZXJ2ZXJVUkwiLCJyZXZva2VTZXNzaW9uT25QYXNzd29yZFJlc2V0IiwiZXhwaXJlSW5hY3RpdmVTZXNzaW9ucyIsInNlc3Npb25MZW5ndGgiLCJtYXhMaW1pdCIsImVtYWlsVmVyaWZ5VG9rZW5WYWxpZGl0eUR1cmF0aW9uIiwiYWNjb3VudExvY2tvdXQiLCJtYXN0ZXJLZXlJcHMiLCJtYXN0ZXJLZXkiLCJyZWFkT25seU1hc3RlcktleSIsImFsbG93SGVhZGVycyIsImlkZW1wb3RlbmN5T3B0aW9ucyIsImVtYWlsVmVyaWZ5VG9rZW5SZXVzZUlmVmFsaWQiLCJmaWxlVXBsb2FkIiwicGFnZXMiLCJzZWN1cml0eSIsIkVycm9yIiwiZW1haWxBZGFwdGVyIiwidmFsaWRhdGVFbWFpbENvbmZpZ3VyYXRpb24iLCJ2YWxpZGF0ZUFjY291bnRMb2Nrb3V0UG9saWN5IiwidmFsaWRhdGVQYXNzd29yZFBvbGljeSIsInZhbGlkYXRlRmlsZVVwbG9hZE9wdGlvbnMiLCJzdGFydHNXaXRoIiwidmFsaWRhdGVTZXNzaW9uQ29uZmlndXJhdGlvbiIsInZhbGlkYXRlTWFzdGVyS2V5SXBzIiwidmFsaWRhdGVNYXhMaW1pdCIsInZhbGlkYXRlQWxsb3dIZWFkZXJzIiwidmFsaWRhdGVJZGVtcG90ZW5jeU9wdGlvbnMiLCJ2YWxpZGF0ZVBhZ2VzT3B0aW9ucyIsInZhbGlkYXRlU2VjdXJpdHlPcHRpb25zIiwicHJvdG90eXBlIiwidG9TdHJpbmciLCJjYWxsIiwiZW5hYmxlQ2hlY2siLCJ1bmRlZmluZWQiLCJTZWN1cml0eU9wdGlvbnMiLCJkZWZhdWx0IiwiZW5hYmxlQ2hlY2tMb2ciLCJlbmFibGVSb3V0ZXIiLCJQYWdlc09wdGlvbnMiLCJlbmFibGVMb2NhbGl6YXRpb24iLCJsb2NhbGl6YXRpb25Kc29uUGF0aCIsImxvY2FsaXphdGlvbkZhbGxiYWNrTG9jYWxlIiwicGxhY2Vob2xkZXJzIiwiZm9yY2VSZWRpcmVjdCIsInBhZ2VzUGF0aCIsInBhZ2VzRW5kcG9pbnQiLCJjdXN0b21VcmxzIiwiY3VzdG9tUm91dGVzIiwiQXJyYXkiLCJ0dGwiLCJJZGVtcG90ZW5jeU9wdGlvbnMiLCJpc05hTiIsInBhdGhzIiwiZHVyYXRpb24iLCJOdW1iZXIiLCJpc0ludGVnZXIiLCJ0aHJlc2hvbGQiLCJ1bmxvY2tPblBhc3N3b3JkUmVzZXQiLCJBY2NvdW50TG9ja291dE9wdGlvbnMiLCJtYXhQYXNzd29yZEFnZSIsInJlc2V0VG9rZW5WYWxpZGl0eUR1cmF0aW9uIiwidmFsaWRhdG9yUGF0dGVybiIsIlJlZ0V4cCIsInZhbGlkYXRvckNhbGxiYWNrIiwiZG9Ob3RBbGxvd1VzZXJuYW1lIiwibWF4UGFzc3dvcmRIaXN0b3J5IiwicmVzZXRUb2tlblJldXNlSWZWYWxpZCIsInBhdHRlcm5WYWxpZGF0b3IiLCJ2YWx1ZSIsInRlc3QiLCJlIiwiUmVmZXJlbmNlRXJyb3IiLCJlbmFibGVGb3JBbm9ueW1vdXNVc2VyIiwiRmlsZVVwbG9hZE9wdGlvbnMiLCJlbmFibGVGb3JQdWJsaWMiLCJlbmFibGVGb3JBdXRoZW50aWNhdGVkVXNlciIsImlwIiwibmV0IiwiaXNJUCIsIl9tb3VudCIsIm5ld1ZhbHVlIiwiaW5jbHVkZXMiLCJpc0FycmF5IiwiaGVhZGVyIiwidHJpbSIsIm5vdyIsIkRhdGUiLCJnZXRUaW1lIiwiZ2VuZXJhdGVQYXNzd29yZFJlc2V0VG9rZW5FeHBpcmVzQXQiLCJpbnZhbGlkTGlua1VSTCIsImN1c3RvbVBhZ2VzIiwiaW52YWxpZExpbmsiLCJpbnZhbGlkVmVyaWZpY2F0aW9uTGlua1VSTCIsImludmFsaWRWZXJpZmljYXRpb25MaW5rIiwibGlua1NlbmRTdWNjZXNzVVJMIiwibGlua1NlbmRTdWNjZXNzIiwibGlua1NlbmRGYWlsVVJMIiwibGlua1NlbmRGYWlsIiwidmVyaWZ5RW1haWxTdWNjZXNzVVJMIiwidmVyaWZ5RW1haWxTdWNjZXNzIiwiY2hvb3NlUGFzc3dvcmRVUkwiLCJjaG9vc2VQYXNzd29yZCIsInJlcXVlc3RSZXNldFBhc3N3b3JkVVJMIiwicGFzc3dvcmRSZXNldFN1Y2Nlc3NVUkwiLCJwYXNzd29yZFJlc2V0U3VjY2VzcyIsInBhcnNlRnJhbWVVUkwiLCJ2ZXJpZnlFbWFpbFVSTCIsIm1vZHVsZSIsImV4cG9ydHMiXSwibWFwcGluZ3MiOiI7Ozs7Ozs7QUFJQTs7QUFDQTs7QUFDQTs7QUFDQTs7QUFPQTs7OztBQWRBO0FBQ0E7QUFDQTtBQWNBLFNBQVNBLG1CQUFULENBQTZCQyxHQUE3QixFQUFrQztBQUNoQyxNQUFJLENBQUNBLEdBQUwsRUFBVTtBQUNSLFdBQU9BLEdBQVA7QUFDRDs7QUFDRCxNQUFJQSxHQUFHLENBQUNDLFFBQUosQ0FBYSxHQUFiLENBQUosRUFBdUI7QUFDckJELElBQUFBLEdBQUcsR0FBR0EsR0FBRyxDQUFDRSxNQUFKLENBQVcsQ0FBWCxFQUFjRixHQUFHLENBQUNHLE1BQUosR0FBYSxDQUEzQixDQUFOO0FBQ0Q7O0FBQ0QsU0FBT0gsR0FBUDtBQUNEOztBQUVNLE1BQU1JLE1BQU4sQ0FBYTtBQUNSLFNBQUhDLEdBQUcsQ0FBQ0MsYUFBRCxFQUF3QkMsS0FBeEIsRUFBdUM7QUFDL0MsVUFBTUMsU0FBUyxHQUFHQyxlQUFTSixHQUFULENBQWFDLGFBQWIsQ0FBbEI7O0FBQ0EsUUFBSSxDQUFDRSxTQUFMLEVBQWdCO0FBQ2Q7QUFDRDs7QUFDRCxVQUFNRSxNQUFNLEdBQUcsSUFBSU4sTUFBSixFQUFmO0FBQ0FNLElBQUFBLE1BQU0sQ0FBQ0osYUFBUCxHQUF1QkEsYUFBdkI7QUFDQUssSUFBQUEsTUFBTSxDQUFDQyxJQUFQLENBQVlKLFNBQVosRUFBdUJLLE9BQXZCLENBQStCQyxHQUFHLElBQUk7QUFDcEMsVUFBSUEsR0FBRyxJQUFJLG9CQUFYLEVBQWlDO0FBQy9CSixRQUFBQSxNQUFNLENBQUNLLFFBQVAsR0FBa0IsSUFBSUMsMkJBQUosQ0FBdUJSLFNBQVMsQ0FBQ1Msa0JBQVYsQ0FBNkJDLE9BQXBELENBQWxCO0FBQ0QsT0FGRCxNQUVPO0FBQ0xSLFFBQUFBLE1BQU0sQ0FBQ0ksR0FBRCxDQUFOLEdBQWNOLFNBQVMsQ0FBQ00sR0FBRCxDQUF2QjtBQUNEO0FBQ0YsS0FORDtBQU9BSixJQUFBQSxNQUFNLENBQUNILEtBQVAsR0FBZVIsbUJBQW1CLENBQUNRLEtBQUQsQ0FBbEM7QUFDQUcsSUFBQUEsTUFBTSxDQUFDUyx3QkFBUCxHQUFrQ1QsTUFBTSxDQUFDUyx3QkFBUCxDQUFnQ0MsSUFBaEMsQ0FBcUNWLE1BQXJDLENBQWxDO0FBQ0FBLElBQUFBLE1BQU0sQ0FBQ1csaUNBQVAsR0FBMkNYLE1BQU0sQ0FBQ1csaUNBQVAsQ0FBeUNELElBQXpDLENBQ3pDVixNQUR5QyxDQUEzQztBQUdBLFdBQU9BLE1BQVA7QUFDRDs7QUFFUyxTQUFIWSxHQUFHLENBQUNDLG1CQUFELEVBQXNCO0FBQzlCbkIsSUFBQUEsTUFBTSxDQUFDb0IsUUFBUCxDQUFnQkQsbUJBQWhCOztBQUNBZCxtQkFBU2EsR0FBVCxDQUFhQyxtQkFBbUIsQ0FBQ0UsS0FBakMsRUFBd0NGLG1CQUF4Qzs7QUFDQW5CLElBQUFBLE1BQU0sQ0FBQ3NCLHNCQUFQLENBQThCSCxtQkFBbUIsQ0FBQ0ksY0FBbEQ7QUFDQSxXQUFPSixtQkFBUDtBQUNEOztBQUVjLFNBQVJDLFFBQVEsQ0FBQztBQUNkSSxJQUFBQSxnQkFEYztBQUVkQyxJQUFBQSxjQUZjO0FBR2RDLElBQUFBLE9BSGM7QUFJZEMsSUFBQUEsZUFKYztBQUtkQyxJQUFBQSw0QkFMYztBQU1kQyxJQUFBQSxzQkFOYztBQU9kQyxJQUFBQSxhQVBjO0FBUWRDLElBQUFBLFFBUmM7QUFTZEMsSUFBQUEsZ0NBVGM7QUFVZEMsSUFBQUEsY0FWYztBQVdkVixJQUFBQSxjQVhjO0FBWWRXLElBQUFBLFlBWmM7QUFhZEMsSUFBQUEsU0FiYztBQWNkQyxJQUFBQSxpQkFkYztBQWVkQyxJQUFBQSxZQWZjO0FBZ0JkQyxJQUFBQSxrQkFoQmM7QUFpQmRDLElBQUFBLDRCQWpCYztBQWtCZEMsSUFBQUEsVUFsQmM7QUFtQmRDLElBQUFBLEtBbkJjO0FBb0JkQyxJQUFBQTtBQXBCYyxHQUFELEVBcUJaO0FBQ0QsUUFBSVAsU0FBUyxLQUFLQyxpQkFBbEIsRUFBcUM7QUFDbkMsWUFBTSxJQUFJTyxLQUFKLENBQVUscURBQVYsQ0FBTjtBQUNEOztBQUVELFVBQU1DLFlBQVksR0FBR25CLGNBQWMsQ0FBQ1gsT0FBcEM7O0FBQ0EsUUFBSVUsZ0JBQUosRUFBc0I7QUFDcEIsV0FBS3FCLDBCQUFMLENBQWdDO0FBQzlCRCxRQUFBQSxZQUQ4QjtBQUU5QmxCLFFBQUFBLE9BRjhCO0FBRzlCQyxRQUFBQSxlQUg4QjtBQUk5QkssUUFBQUEsZ0NBSjhCO0FBSzlCTyxRQUFBQTtBQUw4QixPQUFoQztBQU9EOztBQUVELFNBQUtPLDRCQUFMLENBQWtDYixjQUFsQztBQUNBLFNBQUtjLHNCQUFMLENBQTRCeEIsY0FBNUI7QUFDQSxTQUFLeUIseUJBQUwsQ0FBK0JSLFVBQS9COztBQUVBLFFBQUksT0FBT1osNEJBQVAsS0FBd0MsU0FBNUMsRUFBdUQ7QUFDckQsWUFBTSxzREFBTjtBQUNEOztBQUVELFFBQUlELGVBQUosRUFBcUI7QUFDbkIsVUFBSSxDQUFDQSxlQUFlLENBQUNzQixVQUFoQixDQUEyQixTQUEzQixDQUFELElBQTBDLENBQUN0QixlQUFlLENBQUNzQixVQUFoQixDQUEyQixVQUEzQixDQUEvQyxFQUF1RjtBQUNyRixjQUFNLG9FQUFOO0FBQ0Q7QUFDRjs7QUFDRCxTQUFLQyw0QkFBTCxDQUFrQ3BCLGFBQWxDLEVBQWlERCxzQkFBakQ7QUFDQSxTQUFLc0Isb0JBQUwsQ0FBMEJqQixZQUExQjtBQUNBLFNBQUtrQixnQkFBTCxDQUFzQnJCLFFBQXRCO0FBQ0EsU0FBS3NCLG9CQUFMLENBQTBCaEIsWUFBMUI7QUFDQSxTQUFLaUIsMEJBQUwsQ0FBZ0NoQixrQkFBaEM7QUFDQSxTQUFLaUIsb0JBQUwsQ0FBMEJkLEtBQTFCO0FBQ0EsU0FBS2UsdUJBQUwsQ0FBNkJkLFFBQTdCO0FBQ0Q7O0FBRTZCLFNBQXZCYyx1QkFBdUIsQ0FBQ2QsUUFBRCxFQUFXO0FBQ3ZDLFFBQUluQyxNQUFNLENBQUNrRCxTQUFQLENBQWlCQyxRQUFqQixDQUEwQkMsSUFBMUIsQ0FBK0JqQixRQUEvQixNQUE2QyxpQkFBakQsRUFBb0U7QUFDbEUsWUFBTSxpREFBTjtBQUNEOztBQUNELFFBQUlBLFFBQVEsQ0FBQ2tCLFdBQVQsS0FBeUJDLFNBQTdCLEVBQXdDO0FBQ3RDbkIsTUFBQUEsUUFBUSxDQUFDa0IsV0FBVCxHQUF1QkUsNkJBQWdCRixXQUFoQixDQUE0QkcsT0FBbkQ7QUFDRCxLQUZELE1BRU8sSUFBSSxDQUFDLHVCQUFVckIsUUFBUSxDQUFDa0IsV0FBbkIsQ0FBTCxFQUFzQztBQUMzQyxZQUFNLDZEQUFOO0FBQ0Q7O0FBQ0QsUUFBSWxCLFFBQVEsQ0FBQ3NCLGNBQVQsS0FBNEJILFNBQWhDLEVBQTJDO0FBQ3pDbkIsTUFBQUEsUUFBUSxDQUFDc0IsY0FBVCxHQUEwQkYsNkJBQWdCRSxjQUFoQixDQUErQkQsT0FBekQ7QUFDRCxLQUZELE1BRU8sSUFBSSxDQUFDLHVCQUFVckIsUUFBUSxDQUFDc0IsY0FBbkIsQ0FBTCxFQUF5QztBQUM5QyxZQUFNLGdFQUFOO0FBQ0Q7QUFDRjs7QUFFMEIsU0FBcEJULG9CQUFvQixDQUFDZCxLQUFELEVBQVE7QUFDakMsUUFBSWxDLE1BQU0sQ0FBQ2tELFNBQVAsQ0FBaUJDLFFBQWpCLENBQTBCQyxJQUExQixDQUErQmxCLEtBQS9CLE1BQTBDLGlCQUE5QyxFQUFpRTtBQUMvRCxZQUFNLDhDQUFOO0FBQ0Q7O0FBQ0QsUUFBSUEsS0FBSyxDQUFDd0IsWUFBTixLQUF1QkosU0FBM0IsRUFBc0M7QUFDcENwQixNQUFBQSxLQUFLLENBQUN3QixZQUFOLEdBQXFCQywwQkFBYUQsWUFBYixDQUEwQkYsT0FBL0M7QUFDRCxLQUZELE1BRU8sSUFBSSxDQUFDLHVCQUFVdEIsS0FBSyxDQUFDd0IsWUFBaEIsQ0FBTCxFQUFvQztBQUN6QyxZQUFNLDJEQUFOO0FBQ0Q7O0FBQ0QsUUFBSXhCLEtBQUssQ0FBQzBCLGtCQUFOLEtBQTZCTixTQUFqQyxFQUE0QztBQUMxQ3BCLE1BQUFBLEtBQUssQ0FBQzBCLGtCQUFOLEdBQTJCRCwwQkFBYUMsa0JBQWIsQ0FBZ0NKLE9BQTNEO0FBQ0QsS0FGRCxNQUVPLElBQUksQ0FBQyx1QkFBVXRCLEtBQUssQ0FBQzBCLGtCQUFoQixDQUFMLEVBQTBDO0FBQy9DLFlBQU0saUVBQU47QUFDRDs7QUFDRCxRQUFJMUIsS0FBSyxDQUFDMkIsb0JBQU4sS0FBK0JQLFNBQW5DLEVBQThDO0FBQzVDcEIsTUFBQUEsS0FBSyxDQUFDMkIsb0JBQU4sR0FBNkJGLDBCQUFhRSxvQkFBYixDQUFrQ0wsT0FBL0Q7QUFDRCxLQUZELE1BRU8sSUFBSSxDQUFDLHNCQUFTdEIsS0FBSyxDQUFDMkIsb0JBQWYsQ0FBTCxFQUEyQztBQUNoRCxZQUFNLGtFQUFOO0FBQ0Q7O0FBQ0QsUUFBSTNCLEtBQUssQ0FBQzRCLDBCQUFOLEtBQXFDUixTQUF6QyxFQUFvRDtBQUNsRHBCLE1BQUFBLEtBQUssQ0FBQzRCLDBCQUFOLEdBQW1DSCwwQkFBYUcsMEJBQWIsQ0FBd0NOLE9BQTNFO0FBQ0QsS0FGRCxNQUVPLElBQUksQ0FBQyxzQkFBU3RCLEtBQUssQ0FBQzRCLDBCQUFmLENBQUwsRUFBaUQ7QUFDdEQsWUFBTSx3RUFBTjtBQUNEOztBQUNELFFBQUk1QixLQUFLLENBQUM2QixZQUFOLEtBQXVCVCxTQUEzQixFQUFzQztBQUNwQ3BCLE1BQUFBLEtBQUssQ0FBQzZCLFlBQU4sR0FBcUJKLDBCQUFhSSxZQUFiLENBQTBCUCxPQUEvQztBQUNELEtBRkQsTUFFTyxJQUNMeEQsTUFBTSxDQUFDa0QsU0FBUCxDQUFpQkMsUUFBakIsQ0FBMEJDLElBQTFCLENBQStCbEIsS0FBSyxDQUFDNkIsWUFBckMsTUFBdUQsaUJBQXZELElBQ0EsT0FBTzdCLEtBQUssQ0FBQzZCLFlBQWIsS0FBOEIsVUFGekIsRUFHTDtBQUNBLFlBQU0seUVBQU47QUFDRDs7QUFDRCxRQUFJN0IsS0FBSyxDQUFDOEIsYUFBTixLQUF3QlYsU0FBNUIsRUFBdUM7QUFDckNwQixNQUFBQSxLQUFLLENBQUM4QixhQUFOLEdBQXNCTCwwQkFBYUssYUFBYixDQUEyQlIsT0FBakQ7QUFDRCxLQUZELE1BRU8sSUFBSSxDQUFDLHVCQUFVdEIsS0FBSyxDQUFDOEIsYUFBaEIsQ0FBTCxFQUFxQztBQUMxQyxZQUFNLDREQUFOO0FBQ0Q7O0FBQ0QsUUFBSTlCLEtBQUssQ0FBQytCLFNBQU4sS0FBb0JYLFNBQXhCLEVBQW1DO0FBQ2pDcEIsTUFBQUEsS0FBSyxDQUFDK0IsU0FBTixHQUFrQk4sMEJBQWFNLFNBQWIsQ0FBdUJULE9BQXpDO0FBQ0QsS0FGRCxNQUVPLElBQUksQ0FBQyxzQkFBU3RCLEtBQUssQ0FBQytCLFNBQWYsQ0FBTCxFQUFnQztBQUNyQyxZQUFNLHVEQUFOO0FBQ0Q7O0FBQ0QsUUFBSS9CLEtBQUssQ0FBQ2dDLGFBQU4sS0FBd0JaLFNBQTVCLEVBQXVDO0FBQ3JDcEIsTUFBQUEsS0FBSyxDQUFDZ0MsYUFBTixHQUFzQlAsMEJBQWFPLGFBQWIsQ0FBMkJWLE9BQWpEO0FBQ0QsS0FGRCxNQUVPLElBQUksQ0FBQyxzQkFBU3RCLEtBQUssQ0FBQ2dDLGFBQWYsQ0FBTCxFQUFvQztBQUN6QyxZQUFNLDJEQUFOO0FBQ0Q7O0FBQ0QsUUFBSWhDLEtBQUssQ0FBQ2lDLFVBQU4sS0FBcUJiLFNBQXpCLEVBQW9DO0FBQ2xDcEIsTUFBQUEsS0FBSyxDQUFDaUMsVUFBTixHQUFtQlIsMEJBQWFRLFVBQWIsQ0FBd0JYLE9BQTNDO0FBQ0QsS0FGRCxNQUVPLElBQUl4RCxNQUFNLENBQUNrRCxTQUFQLENBQWlCQyxRQUFqQixDQUEwQkMsSUFBMUIsQ0FBK0JsQixLQUFLLENBQUNpQyxVQUFyQyxNQUFxRCxpQkFBekQsRUFBNEU7QUFDakYsWUFBTSx5REFBTjtBQUNEOztBQUNELFFBQUlqQyxLQUFLLENBQUNrQyxZQUFOLEtBQXVCZCxTQUEzQixFQUFzQztBQUNwQ3BCLE1BQUFBLEtBQUssQ0FBQ2tDLFlBQU4sR0FBcUJULDBCQUFhUyxZQUFiLENBQTBCWixPQUEvQztBQUNELEtBRkQsTUFFTyxJQUFJLEVBQUV0QixLQUFLLENBQUNrQyxZQUFOLFlBQThCQyxLQUFoQyxDQUFKLEVBQTRDO0FBQ2pELFlBQU0sMERBQU47QUFDRDtBQUNGOztBQUVnQyxTQUExQnRCLDBCQUEwQixDQUFDaEIsa0JBQUQsRUFBcUI7QUFDcEQsUUFBSSxDQUFDQSxrQkFBTCxFQUF5QjtBQUN2QjtBQUNEOztBQUNELFFBQUlBLGtCQUFrQixDQUFDdUMsR0FBbkIsS0FBMkJoQixTQUEvQixFQUEwQztBQUN4Q3ZCLE1BQUFBLGtCQUFrQixDQUFDdUMsR0FBbkIsR0FBeUJDLGdDQUFtQkQsR0FBbkIsQ0FBdUJkLE9BQWhEO0FBQ0QsS0FGRCxNQUVPLElBQUksQ0FBQ2dCLEtBQUssQ0FBQ3pDLGtCQUFrQixDQUFDdUMsR0FBcEIsQ0FBTixJQUFrQ3ZDLGtCQUFrQixDQUFDdUMsR0FBbkIsSUFBMEIsQ0FBaEUsRUFBbUU7QUFDeEUsWUFBTSxzREFBTjtBQUNELEtBRk0sTUFFQSxJQUFJRSxLQUFLLENBQUN6QyxrQkFBa0IsQ0FBQ3VDLEdBQXBCLENBQVQsRUFBbUM7QUFDeEMsWUFBTSx3Q0FBTjtBQUNEOztBQUNELFFBQUksQ0FBQ3ZDLGtCQUFrQixDQUFDMEMsS0FBeEIsRUFBK0I7QUFDN0IxQyxNQUFBQSxrQkFBa0IsQ0FBQzBDLEtBQW5CLEdBQTJCRixnQ0FBbUJFLEtBQW5CLENBQXlCakIsT0FBcEQ7QUFDRCxLQUZELE1BRU8sSUFBSSxFQUFFekIsa0JBQWtCLENBQUMwQyxLQUFuQixZQUFvQ0osS0FBdEMsQ0FBSixFQUFrRDtBQUN2RCxZQUFNLGtEQUFOO0FBQ0Q7QUFDRjs7QUFFa0MsU0FBNUI5Qiw0QkFBNEIsQ0FBQ2IsY0FBRCxFQUFpQjtBQUNsRCxRQUFJQSxjQUFKLEVBQW9CO0FBQ2xCLFVBQ0UsT0FBT0EsY0FBYyxDQUFDZ0QsUUFBdEIsS0FBbUMsUUFBbkMsSUFDQWhELGNBQWMsQ0FBQ2dELFFBQWYsSUFBMkIsQ0FEM0IsSUFFQWhELGNBQWMsQ0FBQ2dELFFBQWYsR0FBMEIsS0FINUIsRUFJRTtBQUNBLGNBQU0sd0VBQU47QUFDRDs7QUFFRCxVQUNFLENBQUNDLE1BQU0sQ0FBQ0MsU0FBUCxDQUFpQmxELGNBQWMsQ0FBQ21ELFNBQWhDLENBQUQsSUFDQW5ELGNBQWMsQ0FBQ21ELFNBQWYsR0FBMkIsQ0FEM0IsSUFFQW5ELGNBQWMsQ0FBQ21ELFNBQWYsR0FBMkIsR0FIN0IsRUFJRTtBQUNBLGNBQU0sa0ZBQU47QUFDRDs7QUFFRCxVQUFJbkQsY0FBYyxDQUFDb0QscUJBQWYsS0FBeUN4QixTQUE3QyxFQUF3RDtBQUN0RDVCLFFBQUFBLGNBQWMsQ0FBQ29ELHFCQUFmLEdBQXVDQyxtQ0FBc0JELHFCQUF0QixDQUE0Q3RCLE9BQW5GO0FBQ0QsT0FGRCxNQUVPLElBQUksQ0FBQyx1QkFBVTlCLGNBQWMsQ0FBQ29ELHFCQUF6QixDQUFMLEVBQXNEO0FBQzNELGNBQU0sNkVBQU47QUFDRDtBQUNGO0FBQ0Y7O0FBRTRCLFNBQXRCdEMsc0JBQXNCLENBQUN4QixjQUFELEVBQWlCO0FBQzVDLFFBQUlBLGNBQUosRUFBb0I7QUFDbEIsVUFDRUEsY0FBYyxDQUFDZ0UsY0FBZixLQUFrQzFCLFNBQWxDLEtBQ0MsT0FBT3RDLGNBQWMsQ0FBQ2dFLGNBQXRCLEtBQXlDLFFBQXpDLElBQXFEaEUsY0FBYyxDQUFDZ0UsY0FBZixHQUFnQyxDQUR0RixDQURGLEVBR0U7QUFDQSxjQUFNLHlEQUFOO0FBQ0Q7O0FBRUQsVUFDRWhFLGNBQWMsQ0FBQ2lFLDBCQUFmLEtBQThDM0IsU0FBOUMsS0FDQyxPQUFPdEMsY0FBYyxDQUFDaUUsMEJBQXRCLEtBQXFELFFBQXJELElBQ0NqRSxjQUFjLENBQUNpRSwwQkFBZixJQUE2QyxDQUYvQyxDQURGLEVBSUU7QUFDQSxjQUFNLHFFQUFOO0FBQ0Q7O0FBRUQsVUFBSWpFLGNBQWMsQ0FBQ2tFLGdCQUFuQixFQUFxQztBQUNuQyxZQUFJLE9BQU9sRSxjQUFjLENBQUNrRSxnQkFBdEIsS0FBMkMsUUFBL0MsRUFBeUQ7QUFDdkRsRSxVQUFBQSxjQUFjLENBQUNrRSxnQkFBZixHQUFrQyxJQUFJQyxNQUFKLENBQVduRSxjQUFjLENBQUNrRSxnQkFBMUIsQ0FBbEM7QUFDRCxTQUZELE1BRU8sSUFBSSxFQUFFbEUsY0FBYyxDQUFDa0UsZ0JBQWYsWUFBMkNDLE1BQTdDLENBQUosRUFBMEQ7QUFDL0QsZ0JBQU0sMEVBQU47QUFDRDtBQUNGOztBQUVELFVBQ0VuRSxjQUFjLENBQUNvRSxpQkFBZixJQUNBLE9BQU9wRSxjQUFjLENBQUNvRSxpQkFBdEIsS0FBNEMsVUFGOUMsRUFHRTtBQUNBLGNBQU0sc0RBQU47QUFDRDs7QUFFRCxVQUNFcEUsY0FBYyxDQUFDcUUsa0JBQWYsSUFDQSxPQUFPckUsY0FBYyxDQUFDcUUsa0JBQXRCLEtBQTZDLFNBRi9DLEVBR0U7QUFDQSxjQUFNLDREQUFOO0FBQ0Q7O0FBRUQsVUFDRXJFLGNBQWMsQ0FBQ3NFLGtCQUFmLEtBQ0MsQ0FBQ1gsTUFBTSxDQUFDQyxTQUFQLENBQWlCNUQsY0FBYyxDQUFDc0Usa0JBQWhDLENBQUQsSUFDQ3RFLGNBQWMsQ0FBQ3NFLGtCQUFmLElBQXFDLENBRHRDLElBRUN0RSxjQUFjLENBQUNzRSxrQkFBZixHQUFvQyxFQUh0QyxDQURGLEVBS0U7QUFDQSxjQUFNLHFFQUFOO0FBQ0Q7O0FBRUQsVUFDRXRFLGNBQWMsQ0FBQ3VFLHNCQUFmLElBQ0EsT0FBT3ZFLGNBQWMsQ0FBQ3VFLHNCQUF0QixLQUFpRCxTQUZuRCxFQUdFO0FBQ0EsY0FBTSxnREFBTjtBQUNEOztBQUNELFVBQUl2RSxjQUFjLENBQUN1RSxzQkFBZixJQUF5QyxDQUFDdkUsY0FBYyxDQUFDaUUsMEJBQTdELEVBQXlGO0FBQ3ZGLGNBQU0sMEVBQU47QUFDRDtBQUNGO0FBQ0YsR0ExUWlCLENBNFFsQjs7O0FBQzZCLFNBQXRCbEUsc0JBQXNCLENBQUNDLGNBQUQsRUFBaUI7QUFDNUMsUUFBSUEsY0FBYyxJQUFJQSxjQUFjLENBQUNrRSxnQkFBckMsRUFBdUQ7QUFDckRsRSxNQUFBQSxjQUFjLENBQUN3RSxnQkFBZixHQUFrQ0MsS0FBSyxJQUFJO0FBQ3pDLGVBQU96RSxjQUFjLENBQUNrRSxnQkFBZixDQUFnQ1EsSUFBaEMsQ0FBcUNELEtBQXJDLENBQVA7QUFDRCxPQUZEO0FBR0Q7QUFDRjs7QUFFZ0MsU0FBMUJuRCwwQkFBMEIsQ0FBQztBQUNoQ0QsSUFBQUEsWUFEZ0M7QUFFaENsQixJQUFBQSxPQUZnQztBQUdoQ0MsSUFBQUEsZUFIZ0M7QUFJaENLLElBQUFBLGdDQUpnQztBQUtoQ08sSUFBQUE7QUFMZ0MsR0FBRCxFQU05QjtBQUNELFFBQUksQ0FBQ0ssWUFBTCxFQUFtQjtBQUNqQixZQUFNLDBFQUFOO0FBQ0Q7O0FBQ0QsUUFBSSxPQUFPbEIsT0FBUCxLQUFtQixRQUF2QixFQUFpQztBQUMvQixZQUFNLHNFQUFOO0FBQ0Q7O0FBQ0QsUUFBSSxPQUFPQyxlQUFQLEtBQTJCLFFBQS9CLEVBQXlDO0FBQ3ZDLFlBQU0sOEVBQU47QUFDRDs7QUFDRCxRQUFJSyxnQ0FBSixFQUFzQztBQUNwQyxVQUFJK0MsS0FBSyxDQUFDL0MsZ0NBQUQsQ0FBVCxFQUE2QztBQUMzQyxjQUFNLDhEQUFOO0FBQ0QsT0FGRCxNQUVPLElBQUlBLGdDQUFnQyxJQUFJLENBQXhDLEVBQTJDO0FBQ2hELGNBQU0sc0VBQU47QUFDRDtBQUNGOztBQUNELFFBQUlPLDRCQUE0QixJQUFJLE9BQU9BLDRCQUFQLEtBQXdDLFNBQTVFLEVBQXVGO0FBQ3JGLFlBQU0sc0RBQU47QUFDRDs7QUFDRCxRQUFJQSw0QkFBNEIsSUFBSSxDQUFDUCxnQ0FBckMsRUFBdUU7QUFDckUsWUFBTSxzRkFBTjtBQUNEO0FBQ0Y7O0FBRStCLFNBQXpCZ0IseUJBQXlCLENBQUNSLFVBQUQsRUFBYTtBQUMzQyxRQUFJO0FBQ0YsVUFBSUEsVUFBVSxJQUFJLElBQWQsSUFBc0IsT0FBT0EsVUFBUCxLQUFzQixRQUE1QyxJQUF3REEsVUFBVSxZQUFZb0MsS0FBbEYsRUFBeUY7QUFDdkYsY0FBTSxxQ0FBTjtBQUNEO0FBQ0YsS0FKRCxDQUlFLE9BQU9zQixDQUFQLEVBQVU7QUFDVixVQUFJQSxDQUFDLFlBQVlDLGNBQWpCLEVBQWlDO0FBQy9CO0FBQ0Q7O0FBQ0QsWUFBTUQsQ0FBTjtBQUNEOztBQUNELFFBQUkxRCxVQUFVLENBQUM0RCxzQkFBWCxLQUFzQ3ZDLFNBQTFDLEVBQXFEO0FBQ25EckIsTUFBQUEsVUFBVSxDQUFDNEQsc0JBQVgsR0FBb0NDLCtCQUFrQkQsc0JBQWxCLENBQXlDckMsT0FBN0U7QUFDRCxLQUZELE1BRU8sSUFBSSxPQUFPdkIsVUFBVSxDQUFDNEQsc0JBQWxCLEtBQTZDLFNBQWpELEVBQTREO0FBQ2pFLFlBQU0sNERBQU47QUFDRDs7QUFDRCxRQUFJNUQsVUFBVSxDQUFDOEQsZUFBWCxLQUErQnpDLFNBQW5DLEVBQThDO0FBQzVDckIsTUFBQUEsVUFBVSxDQUFDOEQsZUFBWCxHQUE2QkQsK0JBQWtCQyxlQUFsQixDQUFrQ3ZDLE9BQS9EO0FBQ0QsS0FGRCxNQUVPLElBQUksT0FBT3ZCLFVBQVUsQ0FBQzhELGVBQWxCLEtBQXNDLFNBQTFDLEVBQXFEO0FBQzFELFlBQU0scURBQU47QUFDRDs7QUFDRCxRQUFJOUQsVUFBVSxDQUFDK0QsMEJBQVgsS0FBMEMxQyxTQUE5QyxFQUF5RDtBQUN2RHJCLE1BQUFBLFVBQVUsQ0FBQytELDBCQUFYLEdBQXdDRiwrQkFBa0JFLDBCQUFsQixDQUE2Q3hDLE9BQXJGO0FBQ0QsS0FGRCxNQUVPLElBQUksT0FBT3ZCLFVBQVUsQ0FBQytELDBCQUFsQixLQUFpRCxTQUFyRCxFQUFnRTtBQUNyRSxZQUFNLGdFQUFOO0FBQ0Q7QUFDRjs7QUFFMEIsU0FBcEJwRCxvQkFBb0IsQ0FBQ2pCLFlBQUQsRUFBZTtBQUN4QyxTQUFLLE1BQU1zRSxFQUFYLElBQWlCdEUsWUFBakIsRUFBK0I7QUFDN0IsVUFBSSxDQUFDdUUsYUFBSUMsSUFBSixDQUFTRixFQUFULENBQUwsRUFBbUI7QUFDakIsY0FBTywrQkFBOEJBLEVBQUcsRUFBeEM7QUFDRDtBQUNGO0FBQ0Y7O0FBRVEsTUFBTHJHLEtBQUssR0FBRztBQUNWLFFBQUlBLEtBQUssR0FBRyxLQUFLd0csTUFBakI7O0FBQ0EsUUFBSSxLQUFLaEYsZUFBVCxFQUEwQjtBQUN4QnhCLE1BQUFBLEtBQUssR0FBRyxLQUFLd0IsZUFBYjtBQUNEOztBQUNELFdBQU94QixLQUFQO0FBQ0Q7O0FBRVEsTUFBTEEsS0FBSyxDQUFDeUcsUUFBRCxFQUFXO0FBQ2xCLFNBQUtELE1BQUwsR0FBY0MsUUFBZDtBQUNEOztBQUVrQyxTQUE1QjFELDRCQUE0QixDQUFDcEIsYUFBRCxFQUFnQkQsc0JBQWhCLEVBQXdDO0FBQ3pFLFFBQUlBLHNCQUFKLEVBQTRCO0FBQzFCLFVBQUlrRCxLQUFLLENBQUNqRCxhQUFELENBQVQsRUFBMEI7QUFDeEIsY0FBTSx3Q0FBTjtBQUNELE9BRkQsTUFFTyxJQUFJQSxhQUFhLElBQUksQ0FBckIsRUFBd0I7QUFDN0IsY0FBTSxnREFBTjtBQUNEO0FBQ0Y7QUFDRjs7QUFFc0IsU0FBaEJzQixnQkFBZ0IsQ0FBQ3JCLFFBQUQsRUFBVztBQUNoQyxRQUFJQSxRQUFRLElBQUksQ0FBaEIsRUFBbUI7QUFDakIsWUFBTSwyQ0FBTjtBQUNEO0FBQ0Y7O0FBRTBCLFNBQXBCc0Isb0JBQW9CLENBQUNoQixZQUFELEVBQWU7QUFDeEMsUUFBSSxDQUFDLENBQUMsSUFBRCxFQUFPd0IsU0FBUCxFQUFrQmdELFFBQWxCLENBQTJCeEUsWUFBM0IsQ0FBTCxFQUErQztBQUM3QyxVQUFJdUMsS0FBSyxDQUFDa0MsT0FBTixDQUFjekUsWUFBZCxDQUFKLEVBQWlDO0FBQy9CQSxRQUFBQSxZQUFZLENBQUM1QixPQUFiLENBQXFCc0csTUFBTSxJQUFJO0FBQzdCLGNBQUksT0FBT0EsTUFBUCxLQUFrQixRQUF0QixFQUFnQztBQUM5QixrQkFBTSx5Q0FBTjtBQUNELFdBRkQsTUFFTyxJQUFJLENBQUNBLE1BQU0sQ0FBQ0MsSUFBUCxHQUFjakgsTUFBbkIsRUFBMkI7QUFDaEMsa0JBQU0sOENBQU47QUFDRDtBQUNGLFNBTkQ7QUFPRCxPQVJELE1BUU87QUFDTCxjQUFNLGdDQUFOO0FBQ0Q7QUFDRjtBQUNGOztBQUVEa0IsRUFBQUEsaUNBQWlDLEdBQUc7QUFDbEMsUUFBSSxDQUFDLEtBQUtPLGdCQUFOLElBQTBCLENBQUMsS0FBS1EsZ0NBQXBDLEVBQXNFO0FBQ3BFLGFBQU82QixTQUFQO0FBQ0Q7O0FBQ0QsUUFBSW9ELEdBQUcsR0FBRyxJQUFJQyxJQUFKLEVBQVY7QUFDQSxXQUFPLElBQUlBLElBQUosQ0FBU0QsR0FBRyxDQUFDRSxPQUFKLEtBQWdCLEtBQUtuRixnQ0FBTCxHQUF3QyxJQUFqRSxDQUFQO0FBQ0Q7O0FBRURvRixFQUFBQSxtQ0FBbUMsR0FBRztBQUNwQyxRQUFJLENBQUMsS0FBSzdGLGNBQU4sSUFBd0IsQ0FBQyxLQUFLQSxjQUFMLENBQW9CaUUsMEJBQWpELEVBQTZFO0FBQzNFLGFBQU8zQixTQUFQO0FBQ0Q7O0FBQ0QsVUFBTW9ELEdBQUcsR0FBRyxJQUFJQyxJQUFKLEVBQVo7QUFDQSxXQUFPLElBQUlBLElBQUosQ0FBU0QsR0FBRyxDQUFDRSxPQUFKLEtBQWdCLEtBQUs1RixjQUFMLENBQW9CaUUsMEJBQXBCLEdBQWlELElBQTFFLENBQVA7QUFDRDs7QUFFRHpFLEVBQUFBLHdCQUF3QixHQUFHO0FBQ3pCLFFBQUksQ0FBQyxLQUFLYyxzQkFBVixFQUFrQztBQUNoQyxhQUFPZ0MsU0FBUDtBQUNEOztBQUNELFFBQUlvRCxHQUFHLEdBQUcsSUFBSUMsSUFBSixFQUFWO0FBQ0EsV0FBTyxJQUFJQSxJQUFKLENBQVNELEdBQUcsQ0FBQ0UsT0FBSixLQUFnQixLQUFLckYsYUFBTCxHQUFxQixJQUE5QyxDQUFQO0FBQ0Q7O0FBRWlCLE1BQWR1RixjQUFjLEdBQUc7QUFDbkIsV0FBTyxLQUFLQyxXQUFMLENBQWlCQyxXQUFqQixJQUFpQyxHQUFFLEtBQUs1RixlQUFnQix5QkFBL0Q7QUFDRDs7QUFFNkIsTUFBMUI2RiwwQkFBMEIsR0FBRztBQUMvQixXQUNFLEtBQUtGLFdBQUwsQ0FBaUJHLHVCQUFqQixJQUNDLEdBQUUsS0FBSzlGLGVBQWdCLHNDQUYxQjtBQUlEOztBQUVxQixNQUFsQitGLGtCQUFrQixHQUFHO0FBQ3ZCLFdBQ0UsS0FBS0osV0FBTCxDQUFpQkssZUFBakIsSUFBcUMsR0FBRSxLQUFLaEcsZUFBZ0IsOEJBRDlEO0FBR0Q7O0FBRWtCLE1BQWZpRyxlQUFlLEdBQUc7QUFDcEIsV0FBTyxLQUFLTixXQUFMLENBQWlCTyxZQUFqQixJQUFrQyxHQUFFLEtBQUtsRyxlQUFnQiwyQkFBaEU7QUFDRDs7QUFFd0IsTUFBckJtRyxxQkFBcUIsR0FBRztBQUMxQixXQUNFLEtBQUtSLFdBQUwsQ0FBaUJTLGtCQUFqQixJQUNDLEdBQUUsS0FBS3BHLGVBQWdCLGlDQUYxQjtBQUlEOztBQUVvQixNQUFqQnFHLGlCQUFpQixHQUFHO0FBQ3RCLFdBQU8sS0FBS1YsV0FBTCxDQUFpQlcsY0FBakIsSUFBb0MsR0FBRSxLQUFLdEcsZUFBZ0IsdUJBQWxFO0FBQ0Q7O0FBRTBCLE1BQXZCdUcsdUJBQXVCLEdBQUc7QUFDNUIsV0FBUSxHQUFFLEtBQUt2RyxlQUFnQixJQUFHLEtBQUs4QyxhQUFjLElBQUcsS0FBS3ZFLGFBQWMseUJBQTNFO0FBQ0Q7O0FBRTBCLE1BQXZCaUksdUJBQXVCLEdBQUc7QUFDNUIsV0FDRSxLQUFLYixXQUFMLENBQWlCYyxvQkFBakIsSUFDQyxHQUFFLEtBQUt6RyxlQUFnQixtQ0FGMUI7QUFJRDs7QUFFZ0IsTUFBYjBHLGFBQWEsR0FBRztBQUNsQixXQUFPLEtBQUtmLFdBQUwsQ0FBaUJlLGFBQXhCO0FBQ0Q7O0FBRWlCLE1BQWRDLGNBQWMsR0FBRztBQUNuQixXQUFRLEdBQUUsS0FBSzNHLGVBQWdCLElBQUcsS0FBSzhDLGFBQWMsSUFBRyxLQUFLdkUsYUFBYyxlQUEzRTtBQUNELEdBN2NpQixDQStjbEI7QUFDQTs7O0FBQ2lCLE1BQWJ1RSxhQUFhLEdBQUc7QUFDbEIsV0FBTyxLQUFLaEMsS0FBTCxJQUFjLEtBQUtBLEtBQUwsQ0FBV3dCLFlBQXpCLElBQXlDLEtBQUt4QixLQUFMLENBQVdnQyxhQUFwRCxHQUNILEtBQUtoQyxLQUFMLENBQVdnQyxhQURSLEdBRUgsTUFGSjtBQUdEOztBQXJkaUI7OztlQXdkTHpFLE07O0FBQ2Z1SSxNQUFNLENBQUNDLE9BQVAsR0FBaUJ4SSxNQUFqQiIsInNvdXJjZXNDb250ZW50IjpbIi8vIEEgQ29uZmlnIG9iamVjdCBwcm92aWRlcyBpbmZvcm1hdGlvbiBhYm91dCBob3cgYSBzcGVjaWZpYyBhcHAgaXNcbi8vIGNvbmZpZ3VyZWQuXG4vLyBtb3VudCBpcyB0aGUgVVJMIGZvciB0aGUgcm9vdCBvZiB0aGUgQVBJOyBpbmNsdWRlcyBodHRwLCBkb21haW4sIGV0Yy5cblxuaW1wb3J0IEFwcENhY2hlIGZyb20gJy4vY2FjaGUnO1xuaW1wb3J0IERhdGFiYXNlQ29udHJvbGxlciBmcm9tICcuL0NvbnRyb2xsZXJzL0RhdGFiYXNlQ29udHJvbGxlcic7XG5pbXBvcnQgbmV0IGZyb20gJ25ldCc7XG5pbXBvcnQge1xuICBJZGVtcG90ZW5jeU9wdGlvbnMsXG4gIEZpbGVVcGxvYWRPcHRpb25zLFxuICBBY2NvdW50TG9ja291dE9wdGlvbnMsXG4gIFBhZ2VzT3B0aW9ucyxcbiAgU2VjdXJpdHlPcHRpb25zLFxufSBmcm9tICcuL09wdGlvbnMvRGVmaW5pdGlvbnMnO1xuaW1wb3J0IHsgaXNCb29sZWFuLCBpc1N0cmluZyB9IGZyb20gJ2xvZGFzaCc7XG5cbmZ1bmN0aW9uIHJlbW92ZVRyYWlsaW5nU2xhc2goc3RyKSB7XG4gIGlmICghc3RyKSB7XG4gICAgcmV0dXJuIHN0cjtcbiAgfVxuICBpZiAoc3RyLmVuZHNXaXRoKCcvJykpIHtcbiAgICBzdHIgPSBzdHIuc3Vic3RyKDAsIHN0ci5sZW5ndGggLSAxKTtcbiAgfVxuICByZXR1cm4gc3RyO1xufVxuXG5leHBvcnQgY2xhc3MgQ29uZmlnIHtcbiAgc3RhdGljIGdldChhcHBsaWNhdGlvbklkOiBzdHJpbmcsIG1vdW50OiBzdHJpbmcpIHtcbiAgICBjb25zdCBjYWNoZUluZm8gPSBBcHBDYWNoZS5nZXQoYXBwbGljYXRpb25JZCk7XG4gICAgaWYgKCFjYWNoZUluZm8pIHtcbiAgICAgIHJldHVybjtcbiAgICB9XG4gICAgY29uc3QgY29uZmlnID0gbmV3IENvbmZpZygpO1xuICAgIGNvbmZpZy5hcHBsaWNhdGlvbklkID0gYXBwbGljYXRpb25JZDtcbiAgICBPYmplY3Qua2V5cyhjYWNoZUluZm8pLmZvckVhY2goa2V5ID0+IHtcbiAgICAgIGlmIChrZXkgPT0gJ2RhdGFiYXNlQ29udHJvbGxlcicpIHtcbiAgICAgICAgY29uZmlnLmRhdGFiYXNlID0gbmV3IERhdGFiYXNlQ29udHJvbGxlcihjYWNoZUluZm8uZGF0YWJhc2VDb250cm9sbGVyLmFkYXB0ZXIpO1xuICAgICAgfSBlbHNlIHtcbiAgICAgICAgY29uZmlnW2tleV0gPSBjYWNoZUluZm9ba2V5XTtcbiAgICAgIH1cbiAgICB9KTtcbiAgICBjb25maWcubW91bnQgPSByZW1vdmVUcmFpbGluZ1NsYXNoKG1vdW50KTtcbiAgICBjb25maWcuZ2VuZXJhdGVTZXNzaW9uRXhwaXJlc0F0ID0gY29uZmlnLmdlbmVyYXRlU2Vzc2lvbkV4cGlyZXNBdC5iaW5kKGNvbmZpZyk7XG4gICAgY29uZmlnLmdlbmVyYXRlRW1haWxWZXJpZnlUb2tlbkV4cGlyZXNBdCA9IGNvbmZpZy5nZW5lcmF0ZUVtYWlsVmVyaWZ5VG9rZW5FeHBpcmVzQXQuYmluZChcbiAgICAgIGNvbmZpZ1xuICAgICk7XG4gICAgcmV0dXJuIGNvbmZpZztcbiAgfVxuXG4gIHN0YXRpYyBwdXQoc2VydmVyQ29uZmlndXJhdGlvbikge1xuICAgIENvbmZpZy52YWxpZGF0ZShzZXJ2ZXJDb25maWd1cmF0aW9uKTtcbiAgICBBcHBDYWNoZS5wdXQoc2VydmVyQ29uZmlndXJhdGlvbi5hcHBJZCwgc2VydmVyQ29uZmlndXJhdGlvbik7XG4gICAgQ29uZmlnLnNldHVwUGFzc3dvcmRWYWxpZGF0b3Ioc2VydmVyQ29uZmlndXJhdGlvbi5wYXNzd29yZFBvbGljeSk7XG4gICAgcmV0dXJuIHNlcnZlckNvbmZpZ3VyYXRpb247XG4gIH1cblxuICBzdGF0aWMgdmFsaWRhdGUoe1xuICAgIHZlcmlmeVVzZXJFbWFpbHMsXG4gICAgdXNlckNvbnRyb2xsZXIsXG4gICAgYXBwTmFtZSxcbiAgICBwdWJsaWNTZXJ2ZXJVUkwsXG4gICAgcmV2b2tlU2Vzc2lvbk9uUGFzc3dvcmRSZXNldCxcbiAgICBleHBpcmVJbmFjdGl2ZVNlc3Npb25zLFxuICAgIHNlc3Npb25MZW5ndGgsXG4gICAgbWF4TGltaXQsXG4gICAgZW1haWxWZXJpZnlUb2tlblZhbGlkaXR5RHVyYXRpb24sXG4gICAgYWNjb3VudExvY2tvdXQsXG4gICAgcGFzc3dvcmRQb2xpY3ksXG4gICAgbWFzdGVyS2V5SXBzLFxuICAgIG1hc3RlcktleSxcbiAgICByZWFkT25seU1hc3RlcktleSxcbiAgICBhbGxvd0hlYWRlcnMsXG4gICAgaWRlbXBvdGVuY3lPcHRpb25zLFxuICAgIGVtYWlsVmVyaWZ5VG9rZW5SZXVzZUlmVmFsaWQsXG4gICAgZmlsZVVwbG9hZCxcbiAgICBwYWdlcyxcbiAgICBzZWN1cml0eSxcbiAgfSkge1xuICAgIGlmIChtYXN0ZXJLZXkgPT09IHJlYWRPbmx5TWFzdGVyS2V5KSB7XG4gICAgICB0aHJvdyBuZXcgRXJyb3IoJ21hc3RlcktleSBhbmQgcmVhZE9ubHlNYXN0ZXJLZXkgc2hvdWxkIGJlIGRpZmZlcmVudCcpO1xuICAgIH1cblxuICAgIGNvbnN0IGVtYWlsQWRhcHRlciA9IHVzZXJDb250cm9sbGVyLmFkYXB0ZXI7XG4gICAgaWYgKHZlcmlmeVVzZXJFbWFpbHMpIHtcbiAgICAgIHRoaXMudmFsaWRhdGVFbWFpbENvbmZpZ3VyYXRpb24oe1xuICAgICAgICBlbWFpbEFkYXB0ZXIsXG4gICAgICAgIGFwcE5hbWUsXG4gICAgICAgIHB1YmxpY1NlcnZlclVSTCxcbiAgICAgICAgZW1haWxWZXJpZnlUb2tlblZhbGlkaXR5RHVyYXRpb24sXG4gICAgICAgIGVtYWlsVmVyaWZ5VG9rZW5SZXVzZUlmVmFsaWQsXG4gICAgICB9KTtcbiAgICB9XG5cbiAgICB0aGlzLnZhbGlkYXRlQWNjb3VudExvY2tvdXRQb2xpY3koYWNjb3VudExvY2tvdXQpO1xuICAgIHRoaXMudmFsaWRhdGVQYXNzd29yZFBvbGljeShwYXNzd29yZFBvbGljeSk7XG4gICAgdGhpcy52YWxpZGF0ZUZpbGVVcGxvYWRPcHRpb25zKGZpbGVVcGxvYWQpO1xuXG4gICAgaWYgKHR5cGVvZiByZXZva2VTZXNzaW9uT25QYXNzd29yZFJlc2V0ICE9PSAnYm9vbGVhbicpIHtcbiAgICAgIHRocm93ICdyZXZva2VTZXNzaW9uT25QYXNzd29yZFJlc2V0IG11c3QgYmUgYSBib29sZWFuIHZhbHVlJztcbiAgICB9XG5cbiAgICBpZiAocHVibGljU2VydmVyVVJMKSB7XG4gICAgICBpZiAoIXB1YmxpY1NlcnZlclVSTC5zdGFydHNXaXRoKCdodHRwOi8vJykgJiYgIXB1YmxpY1NlcnZlclVSTC5zdGFydHNXaXRoKCdodHRwczovLycpKSB7XG4gICAgICAgIHRocm93ICdwdWJsaWNTZXJ2ZXJVUkwgc2hvdWxkIGJlIGEgdmFsaWQgSFRUUFMgVVJMIHN0YXJ0aW5nIHdpdGggaHR0cHM6Ly8nO1xuICAgICAgfVxuICAgIH1cbiAgICB0aGlzLnZhbGlkYXRlU2Vzc2lvbkNvbmZpZ3VyYXRpb24oc2Vzc2lvbkxlbmd0aCwgZXhwaXJlSW5hY3RpdmVTZXNzaW9ucyk7XG4gICAgdGhpcy52YWxpZGF0ZU1hc3RlcktleUlwcyhtYXN0ZXJLZXlJcHMpO1xuICAgIHRoaXMudmFsaWRhdGVNYXhMaW1pdChtYXhMaW1pdCk7XG4gICAgdGhpcy52YWxpZGF0ZUFsbG93SGVhZGVycyhhbGxvd0hlYWRlcnMpO1xuICAgIHRoaXMudmFsaWRhdGVJZGVtcG90ZW5jeU9wdGlvbnMoaWRlbXBvdGVuY3lPcHRpb25zKTtcbiAgICB0aGlzLnZhbGlkYXRlUGFnZXNPcHRpb25zKHBhZ2VzKTtcbiAgICB0aGlzLnZhbGlkYXRlU2VjdXJpdHlPcHRpb25zKHNlY3VyaXR5KTtcbiAgfVxuXG4gIHN0YXRpYyB2YWxpZGF0ZVNlY3VyaXR5T3B0aW9ucyhzZWN1cml0eSkge1xuICAgIGlmIChPYmplY3QucHJvdG90eXBlLnRvU3RyaW5nLmNhbGwoc2VjdXJpdHkpICE9PSAnW29iamVjdCBPYmplY3RdJykge1xuICAgICAgdGhyb3cgJ1BhcnNlIFNlcnZlciBvcHRpb24gc2VjdXJpdHkgbXVzdCBiZSBhbiBvYmplY3QuJztcbiAgICB9XG4gICAgaWYgKHNlY3VyaXR5LmVuYWJsZUNoZWNrID09PSB1bmRlZmluZWQpIHtcbiAgICAgIHNlY3VyaXR5LmVuYWJsZUNoZWNrID0gU2VjdXJpdHlPcHRpb25zLmVuYWJsZUNoZWNrLmRlZmF1bHQ7XG4gICAgfSBlbHNlIGlmICghaXNCb29sZWFuKHNlY3VyaXR5LmVuYWJsZUNoZWNrKSkge1xuICAgICAgdGhyb3cgJ1BhcnNlIFNlcnZlciBvcHRpb24gc2VjdXJpdHkuZW5hYmxlQ2hlY2sgbXVzdCBiZSBhIGJvb2xlYW4uJztcbiAgICB9XG4gICAgaWYgKHNlY3VyaXR5LmVuYWJsZUNoZWNrTG9nID09PSB1bmRlZmluZWQpIHtcbiAgICAgIHNlY3VyaXR5LmVuYWJsZUNoZWNrTG9nID0gU2VjdXJpdHlPcHRpb25zLmVuYWJsZUNoZWNrTG9nLmRlZmF1bHQ7XG4gICAgfSBlbHNlIGlmICghaXNCb29sZWFuKHNlY3VyaXR5LmVuYWJsZUNoZWNrTG9nKSkge1xuICAgICAgdGhyb3cgJ1BhcnNlIFNlcnZlciBvcHRpb24gc2VjdXJpdHkuZW5hYmxlQ2hlY2tMb2cgbXVzdCBiZSBhIGJvb2xlYW4uJztcbiAgICB9XG4gIH1cblxuICBzdGF0aWMgdmFsaWRhdGVQYWdlc09wdGlvbnMocGFnZXMpIHtcbiAgICBpZiAoT2JqZWN0LnByb3RvdHlwZS50b1N0cmluZy5jYWxsKHBhZ2VzKSAhPT0gJ1tvYmplY3QgT2JqZWN0XScpIHtcbiAgICAgIHRocm93ICdQYXJzZSBTZXJ2ZXIgb3B0aW9uIHBhZ2VzIG11c3QgYmUgYW4gb2JqZWN0Lic7XG4gICAgfVxuICAgIGlmIChwYWdlcy5lbmFibGVSb3V0ZXIgPT09IHVuZGVmaW5lZCkge1xuICAgICAgcGFnZXMuZW5hYmxlUm91dGVyID0gUGFnZXNPcHRpb25zLmVuYWJsZVJvdXRlci5kZWZhdWx0O1xuICAgIH0gZWxzZSBpZiAoIWlzQm9vbGVhbihwYWdlcy5lbmFibGVSb3V0ZXIpKSB7XG4gICAgICB0aHJvdyAnUGFyc2UgU2VydmVyIG9wdGlvbiBwYWdlcy5lbmFibGVSb3V0ZXIgbXVzdCBiZSBhIGJvb2xlYW4uJztcbiAgICB9XG4gICAgaWYgKHBhZ2VzLmVuYWJsZUxvY2FsaXphdGlvbiA9PT0gdW5kZWZpbmVkKSB7XG4gICAgICBwYWdlcy5lbmFibGVMb2NhbGl6YXRpb24gPSBQYWdlc09wdGlvbnMuZW5hYmxlTG9jYWxpemF0aW9uLmRlZmF1bHQ7XG4gICAgfSBlbHNlIGlmICghaXNCb29sZWFuKHBhZ2VzLmVuYWJsZUxvY2FsaXphdGlvbikpIHtcbiAgICAgIHRocm93ICdQYXJzZSBTZXJ2ZXIgb3B0aW9uIHBhZ2VzLmVuYWJsZUxvY2FsaXphdGlvbiBtdXN0IGJlIGEgYm9vbGVhbi4nO1xuICAgIH1cbiAgICBpZiAocGFnZXMubG9jYWxpemF0aW9uSnNvblBhdGggPT09IHVuZGVmaW5lZCkge1xuICAgICAgcGFnZXMubG9jYWxpemF0aW9uSnNvblBhdGggPSBQYWdlc09wdGlvbnMubG9jYWxpemF0aW9uSnNvblBhdGguZGVmYXVsdDtcbiAgICB9IGVsc2UgaWYgKCFpc1N0cmluZyhwYWdlcy5sb2NhbGl6YXRpb25Kc29uUGF0aCkpIHtcbiAgICAgIHRocm93ICdQYXJzZSBTZXJ2ZXIgb3B0aW9uIHBhZ2VzLmxvY2FsaXphdGlvbkpzb25QYXRoIG11c3QgYmUgYSBzdHJpbmcuJztcbiAgICB9XG4gICAgaWYgKHBhZ2VzLmxvY2FsaXphdGlvbkZhbGxiYWNrTG9jYWxlID09PSB1bmRlZmluZWQpIHtcbiAgICAgIHBhZ2VzLmxvY2FsaXphdGlvbkZhbGxiYWNrTG9jYWxlID0gUGFnZXNPcHRpb25zLmxvY2FsaXphdGlvbkZhbGxiYWNrTG9jYWxlLmRlZmF1bHQ7XG4gICAgfSBlbHNlIGlmICghaXNTdHJpbmcocGFnZXMubG9jYWxpemF0aW9uRmFsbGJhY2tMb2NhbGUpKSB7XG4gICAgICB0aHJvdyAnUGFyc2UgU2VydmVyIG9wdGlvbiBwYWdlcy5sb2NhbGl6YXRpb25GYWxsYmFja0xvY2FsZSBtdXN0IGJlIGEgc3RyaW5nLic7XG4gICAgfVxuICAgIGlmIChwYWdlcy5wbGFjZWhvbGRlcnMgPT09IHVuZGVmaW5lZCkge1xuICAgICAgcGFnZXMucGxhY2Vob2xkZXJzID0gUGFnZXNPcHRpb25zLnBsYWNlaG9sZGVycy5kZWZhdWx0O1xuICAgIH0gZWxzZSBpZiAoXG4gICAgICBPYmplY3QucHJvdG90eXBlLnRvU3RyaW5nLmNhbGwocGFnZXMucGxhY2Vob2xkZXJzKSAhPT0gJ1tvYmplY3QgT2JqZWN0XScgJiZcbiAgICAgIHR5cGVvZiBwYWdlcy5wbGFjZWhvbGRlcnMgIT09ICdmdW5jdGlvbidcbiAgICApIHtcbiAgICAgIHRocm93ICdQYXJzZSBTZXJ2ZXIgb3B0aW9uIHBhZ2VzLnBsYWNlaG9sZGVycyBtdXN0IGJlIGFuIG9iamVjdCBvciBhIGZ1bmN0aW9uLic7XG4gICAgfVxuICAgIGlmIChwYWdlcy5mb3JjZVJlZGlyZWN0ID09PSB1bmRlZmluZWQpIHtcbiAgICAgIHBhZ2VzLmZvcmNlUmVkaXJlY3QgPSBQYWdlc09wdGlvbnMuZm9yY2VSZWRpcmVjdC5kZWZhdWx0O1xuICAgIH0gZWxzZSBpZiAoIWlzQm9vbGVhbihwYWdlcy5mb3JjZVJlZGlyZWN0KSkge1xuICAgICAgdGhyb3cgJ1BhcnNlIFNlcnZlciBvcHRpb24gcGFnZXMuZm9yY2VSZWRpcmVjdCBtdXN0IGJlIGEgYm9vbGVhbi4nO1xuICAgIH1cbiAgICBpZiAocGFnZXMucGFnZXNQYXRoID09PSB1bmRlZmluZWQpIHtcbiAgICAgIHBhZ2VzLnBhZ2VzUGF0aCA9IFBhZ2VzT3B0aW9ucy5wYWdlc1BhdGguZGVmYXVsdDtcbiAgICB9IGVsc2UgaWYgKCFpc1N0cmluZyhwYWdlcy5wYWdlc1BhdGgpKSB7XG4gICAgICB0aHJvdyAnUGFyc2UgU2VydmVyIG9wdGlvbiBwYWdlcy5wYWdlc1BhdGggbXVzdCBiZSBhIHN0cmluZy4nO1xuICAgIH1cbiAgICBpZiAocGFnZXMucGFnZXNFbmRwb2ludCA9PT0gdW5kZWZpbmVkKSB7XG4gICAgICBwYWdlcy5wYWdlc0VuZHBvaW50ID0gUGFnZXNPcHRpb25zLnBhZ2VzRW5kcG9pbnQuZGVmYXVsdDtcbiAgICB9IGVsc2UgaWYgKCFpc1N0cmluZyhwYWdlcy5wYWdlc0VuZHBvaW50KSkge1xuICAgICAgdGhyb3cgJ1BhcnNlIFNlcnZlciBvcHRpb24gcGFnZXMucGFnZXNFbmRwb2ludCBtdXN0IGJlIGEgc3RyaW5nLic7XG4gICAgfVxuICAgIGlmIChwYWdlcy5jdXN0b21VcmxzID09PSB1bmRlZmluZWQpIHtcbiAgICAgIHBhZ2VzLmN1c3RvbVVybHMgPSBQYWdlc09wdGlvbnMuY3VzdG9tVXJscy5kZWZhdWx0O1xuICAgIH0gZWxzZSBpZiAoT2JqZWN0LnByb3RvdHlwZS50b1N0cmluZy5jYWxsKHBhZ2VzLmN1c3RvbVVybHMpICE9PSAnW29iamVjdCBPYmplY3RdJykge1xuICAgICAgdGhyb3cgJ1BhcnNlIFNlcnZlciBvcHRpb24gcGFnZXMuY3VzdG9tVXJscyBtdXN0IGJlIGFuIG9iamVjdC4nO1xuICAgIH1cbiAgICBpZiAocGFnZXMuY3VzdG9tUm91dGVzID09PSB1bmRlZmluZWQpIHtcbiAgICAgIHBhZ2VzLmN1c3RvbVJvdXRlcyA9IFBhZ2VzT3B0aW9ucy5jdXN0b21Sb3V0ZXMuZGVmYXVsdDtcbiAgICB9IGVsc2UgaWYgKCEocGFnZXMuY3VzdG9tUm91dGVzIGluc3RhbmNlb2YgQXJyYXkpKSB7XG4gICAgICB0aHJvdyAnUGFyc2UgU2VydmVyIG9wdGlvbiBwYWdlcy5jdXN0b21Sb3V0ZXMgbXVzdCBiZSBhbiBhcnJheS4nO1xuICAgIH1cbiAgfVxuXG4gIHN0YXRpYyB2YWxpZGF0ZUlkZW1wb3RlbmN5T3B0aW9ucyhpZGVtcG90ZW5jeU9wdGlvbnMpIHtcbiAgICBpZiAoIWlkZW1wb3RlbmN5T3B0aW9ucykge1xuICAgICAgcmV0dXJuO1xuICAgIH1cbiAgICBpZiAoaWRlbXBvdGVuY3lPcHRpb25zLnR0bCA9PT0gdW5kZWZpbmVkKSB7XG4gICAgICBpZGVtcG90ZW5jeU9wdGlvbnMudHRsID0gSWRlbXBvdGVuY3lPcHRpb25zLnR0bC5kZWZhdWx0O1xuICAgIH0gZWxzZSBpZiAoIWlzTmFOKGlkZW1wb3RlbmN5T3B0aW9ucy50dGwpICYmIGlkZW1wb3RlbmN5T3B0aW9ucy50dGwgPD0gMCkge1xuICAgICAgdGhyb3cgJ2lkZW1wb3RlbmN5IFRUTCB2YWx1ZSBtdXN0IGJlIGdyZWF0ZXIgdGhhbiAwIHNlY29uZHMnO1xuICAgIH0gZWxzZSBpZiAoaXNOYU4oaWRlbXBvdGVuY3lPcHRpb25zLnR0bCkpIHtcbiAgICAgIHRocm93ICdpZGVtcG90ZW5jeSBUVEwgdmFsdWUgbXVzdCBiZSBhIG51bWJlcic7XG4gICAgfVxuICAgIGlmICghaWRlbXBvdGVuY3lPcHRpb25zLnBhdGhzKSB7XG4gICAgICBpZGVtcG90ZW5jeU9wdGlvbnMucGF0aHMgPSBJZGVtcG90ZW5jeU9wdGlvbnMucGF0aHMuZGVmYXVsdDtcbiAgICB9IGVsc2UgaWYgKCEoaWRlbXBvdGVuY3lPcHRpb25zLnBhdGhzIGluc3RhbmNlb2YgQXJyYXkpKSB7XG4gICAgICB0aHJvdyAnaWRlbXBvdGVuY3kgcGF0aHMgbXVzdCBiZSBvZiBhbiBhcnJheSBvZiBzdHJpbmdzJztcbiAgICB9XG4gIH1cblxuICBzdGF0aWMgdmFsaWRhdGVBY2NvdW50TG9ja291dFBvbGljeShhY2NvdW50TG9ja291dCkge1xuICAgIGlmIChhY2NvdW50TG9ja291dCkge1xuICAgICAgaWYgKFxuICAgICAgICB0eXBlb2YgYWNjb3VudExvY2tvdXQuZHVyYXRpb24gIT09ICdudW1iZXInIHx8XG4gICAgICAgIGFjY291bnRMb2Nrb3V0LmR1cmF0aW9uIDw9IDAgfHxcbiAgICAgICAgYWNjb3VudExvY2tvdXQuZHVyYXRpb24gPiA5OTk5OVxuICAgICAgKSB7XG4gICAgICAgIHRocm93ICdBY2NvdW50IGxvY2tvdXQgZHVyYXRpb24gc2hvdWxkIGJlIGdyZWF0ZXIgdGhhbiAwIGFuZCBsZXNzIHRoYW4gMTAwMDAwJztcbiAgICAgIH1cblxuICAgICAgaWYgKFxuICAgICAgICAhTnVtYmVyLmlzSW50ZWdlcihhY2NvdW50TG9ja291dC50aHJlc2hvbGQpIHx8XG4gICAgICAgIGFjY291bnRMb2Nrb3V0LnRocmVzaG9sZCA8IDEgfHxcbiAgICAgICAgYWNjb3VudExvY2tvdXQudGhyZXNob2xkID4gOTk5XG4gICAgICApIHtcbiAgICAgICAgdGhyb3cgJ0FjY291bnQgbG9ja291dCB0aHJlc2hvbGQgc2hvdWxkIGJlIGFuIGludGVnZXIgZ3JlYXRlciB0aGFuIDAgYW5kIGxlc3MgdGhhbiAxMDAwJztcbiAgICAgIH1cblxuICAgICAgaWYgKGFjY291bnRMb2Nrb3V0LnVubG9ja09uUGFzc3dvcmRSZXNldCA9PT0gdW5kZWZpbmVkKSB7XG4gICAgICAgIGFjY291bnRMb2Nrb3V0LnVubG9ja09uUGFzc3dvcmRSZXNldCA9IEFjY291bnRMb2Nrb3V0T3B0aW9ucy51bmxvY2tPblBhc3N3b3JkUmVzZXQuZGVmYXVsdDtcbiAgICAgIH0gZWxzZSBpZiAoIWlzQm9vbGVhbihhY2NvdW50TG9ja291dC51bmxvY2tPblBhc3N3b3JkUmVzZXQpKSB7XG4gICAgICAgIHRocm93ICdQYXJzZSBTZXJ2ZXIgb3B0aW9uIGFjY291bnRMb2Nrb3V0LnVubG9ja09uUGFzc3dvcmRSZXNldCBtdXN0IGJlIGEgYm9vbGVhbi4nO1xuICAgICAgfVxuICAgIH1cbiAgfVxuXG4gIHN0YXRpYyB2YWxpZGF0ZVBhc3N3b3JkUG9saWN5KHBhc3N3b3JkUG9saWN5KSB7XG4gICAgaWYgKHBhc3N3b3JkUG9saWN5KSB7XG4gICAgICBpZiAoXG4gICAgICAgIHBhc3N3b3JkUG9saWN5Lm1heFBhc3N3b3JkQWdlICE9PSB1bmRlZmluZWQgJiZcbiAgICAgICAgKHR5cGVvZiBwYXNzd29yZFBvbGljeS5tYXhQYXNzd29yZEFnZSAhPT0gJ251bWJlcicgfHwgcGFzc3dvcmRQb2xpY3kubWF4UGFzc3dvcmRBZ2UgPCAwKVxuICAgICAgKSB7XG4gICAgICAgIHRocm93ICdwYXNzd29yZFBvbGljeS5tYXhQYXNzd29yZEFnZSBtdXN0IGJlIGEgcG9zaXRpdmUgbnVtYmVyJztcbiAgICAgIH1cblxuICAgICAgaWYgKFxuICAgICAgICBwYXNzd29yZFBvbGljeS5yZXNldFRva2VuVmFsaWRpdHlEdXJhdGlvbiAhPT0gdW5kZWZpbmVkICYmXG4gICAgICAgICh0eXBlb2YgcGFzc3dvcmRQb2xpY3kucmVzZXRUb2tlblZhbGlkaXR5RHVyYXRpb24gIT09ICdudW1iZXInIHx8XG4gICAgICAgICAgcGFzc3dvcmRQb2xpY3kucmVzZXRUb2tlblZhbGlkaXR5RHVyYXRpb24gPD0gMClcbiAgICAgICkge1xuICAgICAgICB0aHJvdyAncGFzc3dvcmRQb2xpY3kucmVzZXRUb2tlblZhbGlkaXR5RHVyYXRpb24gbXVzdCBiZSBhIHBvc2l0aXZlIG51bWJlcic7XG4gICAgICB9XG5cbiAgICAgIGlmIChwYXNzd29yZFBvbGljeS52YWxpZGF0b3JQYXR0ZXJuKSB7XG4gICAgICAgIGlmICh0eXBlb2YgcGFzc3dvcmRQb2xpY3kudmFsaWRhdG9yUGF0dGVybiA9PT0gJ3N0cmluZycpIHtcbiAgICAgICAgICBwYXNzd29yZFBvbGljeS52YWxpZGF0b3JQYXR0ZXJuID0gbmV3IFJlZ0V4cChwYXNzd29yZFBvbGljeS52YWxpZGF0b3JQYXR0ZXJuKTtcbiAgICAgICAgfSBlbHNlIGlmICghKHBhc3N3b3JkUG9saWN5LnZhbGlkYXRvclBhdHRlcm4gaW5zdGFuY2VvZiBSZWdFeHApKSB7XG4gICAgICAgICAgdGhyb3cgJ3Bhc3N3b3JkUG9saWN5LnZhbGlkYXRvclBhdHRlcm4gbXVzdCBiZSBhIHJlZ2V4IHN0cmluZyBvciBSZWdFeHAgb2JqZWN0Lic7XG4gICAgICAgIH1cbiAgICAgIH1cblxuICAgICAgaWYgKFxuICAgICAgICBwYXNzd29yZFBvbGljeS52YWxpZGF0b3JDYWxsYmFjayAmJlxuICAgICAgICB0eXBlb2YgcGFzc3dvcmRQb2xpY3kudmFsaWRhdG9yQ2FsbGJhY2sgIT09ICdmdW5jdGlvbidcbiAgICAgICkge1xuICAgICAgICB0aHJvdyAncGFzc3dvcmRQb2xpY3kudmFsaWRhdG9yQ2FsbGJhY2sgbXVzdCBiZSBhIGZ1bmN0aW9uLic7XG4gICAgICB9XG5cbiAgICAgIGlmIChcbiAgICAgICAgcGFzc3dvcmRQb2xpY3kuZG9Ob3RBbGxvd1VzZXJuYW1lICYmXG4gICAgICAgIHR5cGVvZiBwYXNzd29yZFBvbGljeS5kb05vdEFsbG93VXNlcm5hbWUgIT09ICdib29sZWFuJ1xuICAgICAgKSB7XG4gICAgICAgIHRocm93ICdwYXNzd29yZFBvbGljeS5kb05vdEFsbG93VXNlcm5hbWUgbXVzdCBiZSBhIGJvb2xlYW4gdmFsdWUuJztcbiAgICAgIH1cblxuICAgICAgaWYgKFxuICAgICAgICBwYXNzd29yZFBvbGljeS5tYXhQYXNzd29yZEhpc3RvcnkgJiZcbiAgICAgICAgKCFOdW1iZXIuaXNJbnRlZ2VyKHBhc3N3b3JkUG9saWN5Lm1heFBhc3N3b3JkSGlzdG9yeSkgfHxcbiAgICAgICAgICBwYXNzd29yZFBvbGljeS5tYXhQYXNzd29yZEhpc3RvcnkgPD0gMCB8fFxuICAgICAgICAgIHBhc3N3b3JkUG9saWN5Lm1heFBhc3N3b3JkSGlzdG9yeSA+IDIwKVxuICAgICAgKSB7XG4gICAgICAgIHRocm93ICdwYXNzd29yZFBvbGljeS5tYXhQYXNzd29yZEhpc3RvcnkgbXVzdCBiZSBhbiBpbnRlZ2VyIHJhbmdpbmcgMCAtIDIwJztcbiAgICAgIH1cblxuICAgICAgaWYgKFxuICAgICAgICBwYXNzd29yZFBvbGljeS5yZXNldFRva2VuUmV1c2VJZlZhbGlkICYmXG4gICAgICAgIHR5cGVvZiBwYXNzd29yZFBvbGljeS5yZXNldFRva2VuUmV1c2VJZlZhbGlkICE9PSAnYm9vbGVhbidcbiAgICAgICkge1xuICAgICAgICB0aHJvdyAncmVzZXRUb2tlblJldXNlSWZWYWxpZCBtdXN0IGJlIGEgYm9vbGVhbiB2YWx1ZSc7XG4gICAgICB9XG4gICAgICBpZiAocGFzc3dvcmRQb2xpY3kucmVzZXRUb2tlblJldXNlSWZWYWxpZCAmJiAhcGFzc3dvcmRQb2xpY3kucmVzZXRUb2tlblZhbGlkaXR5RHVyYXRpb24pIHtcbiAgICAgICAgdGhyb3cgJ1lvdSBjYW5ub3QgdXNlIHJlc2V0VG9rZW5SZXVzZUlmVmFsaWQgd2l0aG91dCByZXNldFRva2VuVmFsaWRpdHlEdXJhdGlvbic7XG4gICAgICB9XG4gICAgfVxuICB9XG5cbiAgLy8gaWYgdGhlIHBhc3N3b3JkUG9saWN5LnZhbGlkYXRvclBhdHRlcm4gaXMgY29uZmlndXJlZCB0aGVuIHNldHVwIGEgY2FsbGJhY2sgdG8gcHJvY2VzcyB0aGUgcGF0dGVyblxuICBzdGF0aWMgc2V0dXBQYXNzd29yZFZhbGlkYXRvcihwYXNzd29yZFBvbGljeSkge1xuICAgIGlmIChwYXNzd29yZFBvbGljeSAmJiBwYXNzd29yZFBvbGljeS52YWxpZGF0b3JQYXR0ZXJuKSB7XG4gICAgICBwYXNzd29yZFBvbGljeS5wYXR0ZXJuVmFsaWRhdG9yID0gdmFsdWUgPT4ge1xuICAgICAgICByZXR1cm4gcGFzc3dvcmRQb2xpY3kudmFsaWRhdG9yUGF0dGVybi50ZXN0KHZhbHVlKTtcbiAgICAgIH07XG4gICAgfVxuICB9XG5cbiAgc3RhdGljIHZhbGlkYXRlRW1haWxDb25maWd1cmF0aW9uKHtcbiAgICBlbWFpbEFkYXB0ZXIsXG4gICAgYXBwTmFtZSxcbiAgICBwdWJsaWNTZXJ2ZXJVUkwsXG4gICAgZW1haWxWZXJpZnlUb2tlblZhbGlkaXR5RHVyYXRpb24sXG4gICAgZW1haWxWZXJpZnlUb2tlblJldXNlSWZWYWxpZCxcbiAgfSkge1xuICAgIGlmICghZW1haWxBZGFwdGVyKSB7XG4gICAgICB0aHJvdyAnQW4gZW1haWxBZGFwdGVyIGlzIHJlcXVpcmVkIGZvciBlLW1haWwgdmVyaWZpY2F0aW9uIGFuZCBwYXNzd29yZCByZXNldHMuJztcbiAgICB9XG4gICAgaWYgKHR5cGVvZiBhcHBOYW1lICE9PSAnc3RyaW5nJykge1xuICAgICAgdGhyb3cgJ0FuIGFwcCBuYW1lIGlzIHJlcXVpcmVkIGZvciBlLW1haWwgdmVyaWZpY2F0aW9uIGFuZCBwYXNzd29yZCByZXNldHMuJztcbiAgICB9XG4gICAgaWYgKHR5cGVvZiBwdWJsaWNTZXJ2ZXJVUkwgIT09ICdzdHJpbmcnKSB7XG4gICAgICB0aHJvdyAnQSBwdWJsaWMgc2VydmVyIHVybCBpcyByZXF1aXJlZCBmb3IgZS1tYWlsIHZlcmlmaWNhdGlvbiBhbmQgcGFzc3dvcmQgcmVzZXRzLic7XG4gICAgfVxuICAgIGlmIChlbWFpbFZlcmlmeVRva2VuVmFsaWRpdHlEdXJhdGlvbikge1xuICAgICAgaWYgKGlzTmFOKGVtYWlsVmVyaWZ5VG9rZW5WYWxpZGl0eUR1cmF0aW9uKSkge1xuICAgICAgICB0aHJvdyAnRW1haWwgdmVyaWZ5IHRva2VuIHZhbGlkaXR5IGR1cmF0aW9uIG11c3QgYmUgYSB2YWxpZCBudW1iZXIuJztcbiAgICAgIH0gZWxzZSBpZiAoZW1haWxWZXJpZnlUb2tlblZhbGlkaXR5RHVyYXRpb24gPD0gMCkge1xuICAgICAgICB0aHJvdyAnRW1haWwgdmVyaWZ5IHRva2VuIHZhbGlkaXR5IGR1cmF0aW9uIG11c3QgYmUgYSB2YWx1ZSBncmVhdGVyIHRoYW4gMC4nO1xuICAgICAgfVxuICAgIH1cbiAgICBpZiAoZW1haWxWZXJpZnlUb2tlblJldXNlSWZWYWxpZCAmJiB0eXBlb2YgZW1haWxWZXJpZnlUb2tlblJldXNlSWZWYWxpZCAhPT0gJ2Jvb2xlYW4nKSB7XG4gICAgICB0aHJvdyAnZW1haWxWZXJpZnlUb2tlblJldXNlSWZWYWxpZCBtdXN0IGJlIGEgYm9vbGVhbiB2YWx1ZSc7XG4gICAgfVxuICAgIGlmIChlbWFpbFZlcmlmeVRva2VuUmV1c2VJZlZhbGlkICYmICFlbWFpbFZlcmlmeVRva2VuVmFsaWRpdHlEdXJhdGlvbikge1xuICAgICAgdGhyb3cgJ1lvdSBjYW5ub3QgdXNlIGVtYWlsVmVyaWZ5VG9rZW5SZXVzZUlmVmFsaWQgd2l0aG91dCBlbWFpbFZlcmlmeVRva2VuVmFsaWRpdHlEdXJhdGlvbic7XG4gICAgfVxuICB9XG5cbiAgc3RhdGljIHZhbGlkYXRlRmlsZVVwbG9hZE9wdGlvbnMoZmlsZVVwbG9hZCkge1xuICAgIHRyeSB7XG4gICAgICBpZiAoZmlsZVVwbG9hZCA9PSBudWxsIHx8IHR5cGVvZiBmaWxlVXBsb2FkICE9PSAnb2JqZWN0JyB8fCBmaWxlVXBsb2FkIGluc3RhbmNlb2YgQXJyYXkpIHtcbiAgICAgICAgdGhyb3cgJ2ZpbGVVcGxvYWQgbXVzdCBiZSBhbiBvYmplY3QgdmFsdWUuJztcbiAgICAgIH1cbiAgICB9IGNhdGNoIChlKSB7XG4gICAgICBpZiAoZSBpbnN0YW5jZW9mIFJlZmVyZW5jZUVycm9yKSB7XG4gICAgICAgIHJldHVybjtcbiAgICAgIH1cbiAgICAgIHRocm93IGU7XG4gICAgfVxuICAgIGlmIChmaWxlVXBsb2FkLmVuYWJsZUZvckFub255bW91c1VzZXIgPT09IHVuZGVmaW5lZCkge1xuICAgICAgZmlsZVVwbG9hZC5lbmFibGVGb3JBbm9ueW1vdXNVc2VyID0gRmlsZVVwbG9hZE9wdGlvbnMuZW5hYmxlRm9yQW5vbnltb3VzVXNlci5kZWZhdWx0O1xuICAgIH0gZWxzZSBpZiAodHlwZW9mIGZpbGVVcGxvYWQuZW5hYmxlRm9yQW5vbnltb3VzVXNlciAhPT0gJ2Jvb2xlYW4nKSB7XG4gICAgICB0aHJvdyAnZmlsZVVwbG9hZC5lbmFibGVGb3JBbm9ueW1vdXNVc2VyIG11c3QgYmUgYSBib29sZWFuIHZhbHVlLic7XG4gICAgfVxuICAgIGlmIChmaWxlVXBsb2FkLmVuYWJsZUZvclB1YmxpYyA9PT0gdW5kZWZpbmVkKSB7XG4gICAgICBmaWxlVXBsb2FkLmVuYWJsZUZvclB1YmxpYyA9IEZpbGVVcGxvYWRPcHRpb25zLmVuYWJsZUZvclB1YmxpYy5kZWZhdWx0O1xuICAgIH0gZWxzZSBpZiAodHlwZW9mIGZpbGVVcGxvYWQuZW5hYmxlRm9yUHVibGljICE9PSAnYm9vbGVhbicpIHtcbiAgICAgIHRocm93ICdmaWxlVXBsb2FkLmVuYWJsZUZvclB1YmxpYyBtdXN0IGJlIGEgYm9vbGVhbiB2YWx1ZS4nO1xuICAgIH1cbiAgICBpZiAoZmlsZVVwbG9hZC5lbmFibGVGb3JBdXRoZW50aWNhdGVkVXNlciA9PT0gdW5kZWZpbmVkKSB7XG4gICAgICBmaWxlVXBsb2FkLmVuYWJsZUZvckF1dGhlbnRpY2F0ZWRVc2VyID0gRmlsZVVwbG9hZE9wdGlvbnMuZW5hYmxlRm9yQXV0aGVudGljYXRlZFVzZXIuZGVmYXVsdDtcbiAgICB9IGVsc2UgaWYgKHR5cGVvZiBmaWxlVXBsb2FkLmVuYWJsZUZvckF1dGhlbnRpY2F0ZWRVc2VyICE9PSAnYm9vbGVhbicpIHtcbiAgICAgIHRocm93ICdmaWxlVXBsb2FkLmVuYWJsZUZvckF1dGhlbnRpY2F0ZWRVc2VyIG11c3QgYmUgYSBib29sZWFuIHZhbHVlLic7XG4gICAgfVxuICB9XG5cbiAgc3RhdGljIHZhbGlkYXRlTWFzdGVyS2V5SXBzKG1hc3RlcktleUlwcykge1xuICAgIGZvciAoY29uc3QgaXAgb2YgbWFzdGVyS2V5SXBzKSB7XG4gICAgICBpZiAoIW5ldC5pc0lQKGlwKSkge1xuICAgICAgICB0aHJvdyBgSW52YWxpZCBpcCBpbiBtYXN0ZXJLZXlJcHM6ICR7aXB9YDtcbiAgICAgIH1cbiAgICB9XG4gIH1cblxuICBnZXQgbW91bnQoKSB7XG4gICAgdmFyIG1vdW50ID0gdGhpcy5fbW91bnQ7XG4gICAgaWYgKHRoaXMucHVibGljU2VydmVyVVJMKSB7XG4gICAgICBtb3VudCA9IHRoaXMucHVibGljU2VydmVyVVJMO1xuICAgIH1cbiAgICByZXR1cm4gbW91bnQ7XG4gIH1cblxuICBzZXQgbW91bnQobmV3VmFsdWUpIHtcbiAgICB0aGlzLl9tb3VudCA9IG5ld1ZhbHVlO1xuICB9XG5cbiAgc3RhdGljIHZhbGlkYXRlU2Vzc2lvbkNvbmZpZ3VyYXRpb24oc2Vzc2lvbkxlbmd0aCwgZXhwaXJlSW5hY3RpdmVTZXNzaW9ucykge1xuICAgIGlmIChleHBpcmVJbmFjdGl2ZVNlc3Npb25zKSB7XG4gICAgICBpZiAoaXNOYU4oc2Vzc2lvbkxlbmd0aCkpIHtcbiAgICAgICAgdGhyb3cgJ1Nlc3Npb24gbGVuZ3RoIG11c3QgYmUgYSB2YWxpZCBudW1iZXIuJztcbiAgICAgIH0gZWxzZSBpZiAoc2Vzc2lvbkxlbmd0aCA8PSAwKSB7XG4gICAgICAgIHRocm93ICdTZXNzaW9uIGxlbmd0aCBtdXN0IGJlIGEgdmFsdWUgZ3JlYXRlciB0aGFuIDAuJztcbiAgICAgIH1cbiAgICB9XG4gIH1cblxuICBzdGF0aWMgdmFsaWRhdGVNYXhMaW1pdChtYXhMaW1pdCkge1xuICAgIGlmIChtYXhMaW1pdCA8PSAwKSB7XG4gICAgICB0aHJvdyAnTWF4IGxpbWl0IG11c3QgYmUgYSB2YWx1ZSBncmVhdGVyIHRoYW4gMC4nO1xuICAgIH1cbiAgfVxuXG4gIHN0YXRpYyB2YWxpZGF0ZUFsbG93SGVhZGVycyhhbGxvd0hlYWRlcnMpIHtcbiAgICBpZiAoIVtudWxsLCB1bmRlZmluZWRdLmluY2x1ZGVzKGFsbG93SGVhZGVycykpIHtcbiAgICAgIGlmIChBcnJheS5pc0FycmF5KGFsbG93SGVhZGVycykpIHtcbiAgICAgICAgYWxsb3dIZWFkZXJzLmZvckVhY2goaGVhZGVyID0+IHtcbiAgICAgICAgICBpZiAodHlwZW9mIGhlYWRlciAhPT0gJ3N0cmluZycpIHtcbiAgICAgICAgICAgIHRocm93ICdBbGxvdyBoZWFkZXJzIG11c3Qgb25seSBjb250YWluIHN0cmluZ3MnO1xuICAgICAgICAgIH0gZWxzZSBpZiAoIWhlYWRlci50cmltKCkubGVuZ3RoKSB7XG4gICAgICAgICAgICB0aHJvdyAnQWxsb3cgaGVhZGVycyBtdXN0IG5vdCBjb250YWluIGVtcHR5IHN0cmluZ3MnO1xuICAgICAgICAgIH1cbiAgICAgICAgfSk7XG4gICAgICB9IGVsc2Uge1xuICAgICAgICB0aHJvdyAnQWxsb3cgaGVhZGVycyBtdXN0IGJlIGFuIGFycmF5JztcbiAgICAgIH1cbiAgICB9XG4gIH1cblxuICBnZW5lcmF0ZUVtYWlsVmVyaWZ5VG9rZW5FeHBpcmVzQXQoKSB7XG4gICAgaWYgKCF0aGlzLnZlcmlmeVVzZXJFbWFpbHMgfHwgIXRoaXMuZW1haWxWZXJpZnlUb2tlblZhbGlkaXR5RHVyYXRpb24pIHtcbiAgICAgIHJldHVybiB1bmRlZmluZWQ7XG4gICAgfVxuICAgIHZhciBub3cgPSBuZXcgRGF0ZSgpO1xuICAgIHJldHVybiBuZXcgRGF0ZShub3cuZ2V0VGltZSgpICsgdGhpcy5lbWFpbFZlcmlmeVRva2VuVmFsaWRpdHlEdXJhdGlvbiAqIDEwMDApO1xuICB9XG5cbiAgZ2VuZXJhdGVQYXNzd29yZFJlc2V0VG9rZW5FeHBpcmVzQXQoKSB7XG4gICAgaWYgKCF0aGlzLnBhc3N3b3JkUG9saWN5IHx8ICF0aGlzLnBhc3N3b3JkUG9saWN5LnJlc2V0VG9rZW5WYWxpZGl0eUR1cmF0aW9uKSB7XG4gICAgICByZXR1cm4gdW5kZWZpbmVkO1xuICAgIH1cbiAgICBjb25zdCBub3cgPSBuZXcgRGF0ZSgpO1xuICAgIHJldHVybiBuZXcgRGF0ZShub3cuZ2V0VGltZSgpICsgdGhpcy5wYXNzd29yZFBvbGljeS5yZXNldFRva2VuVmFsaWRpdHlEdXJhdGlvbiAqIDEwMDApO1xuICB9XG5cbiAgZ2VuZXJhdGVTZXNzaW9uRXhwaXJlc0F0KCkge1xuICAgIGlmICghdGhpcy5leHBpcmVJbmFjdGl2ZVNlc3Npb25zKSB7XG4gICAgICByZXR1cm4gdW5kZWZpbmVkO1xuICAgIH1cbiAgICB2YXIgbm93ID0gbmV3IERhdGUoKTtcbiAgICByZXR1cm4gbmV3IERhdGUobm93LmdldFRpbWUoKSArIHRoaXMuc2Vzc2lvbkxlbmd0aCAqIDEwMDApO1xuICB9XG5cbiAgZ2V0IGludmFsaWRMaW5rVVJMKCkge1xuICAgIHJldHVybiB0aGlzLmN1c3RvbVBhZ2VzLmludmFsaWRMaW5rIHx8IGAke3RoaXMucHVibGljU2VydmVyVVJMfS9hcHBzL2ludmFsaWRfbGluay5odG1sYDtcbiAgfVxuXG4gIGdldCBpbnZhbGlkVmVyaWZpY2F0aW9uTGlua1VSTCgpIHtcbiAgICByZXR1cm4gKFxuICAgICAgdGhpcy5jdXN0b21QYWdlcy5pbnZhbGlkVmVyaWZpY2F0aW9uTGluayB8fFxuICAgICAgYCR7dGhpcy5wdWJsaWNTZXJ2ZXJVUkx9L2FwcHMvaW52YWxpZF92ZXJpZmljYXRpb25fbGluay5odG1sYFxuICAgICk7XG4gIH1cblxuICBnZXQgbGlua1NlbmRTdWNjZXNzVVJMKCkge1xuICAgIHJldHVybiAoXG4gICAgICB0aGlzLmN1c3RvbVBhZ2VzLmxpbmtTZW5kU3VjY2VzcyB8fCBgJHt0aGlzLnB1YmxpY1NlcnZlclVSTH0vYXBwcy9saW5rX3NlbmRfc3VjY2Vzcy5odG1sYFxuICAgICk7XG4gIH1cblxuICBnZXQgbGlua1NlbmRGYWlsVVJMKCkge1xuICAgIHJldHVybiB0aGlzLmN1c3RvbVBhZ2VzLmxpbmtTZW5kRmFpbCB8fCBgJHt0aGlzLnB1YmxpY1NlcnZlclVSTH0vYXBwcy9saW5rX3NlbmRfZmFpbC5odG1sYDtcbiAgfVxuXG4gIGdldCB2ZXJpZnlFbWFpbFN1Y2Nlc3NVUkwoKSB7XG4gICAgcmV0dXJuIChcbiAgICAgIHRoaXMuY3VzdG9tUGFnZXMudmVyaWZ5RW1haWxTdWNjZXNzIHx8XG4gICAgICBgJHt0aGlzLnB1YmxpY1NlcnZlclVSTH0vYXBwcy92ZXJpZnlfZW1haWxfc3VjY2Vzcy5odG1sYFxuICAgICk7XG4gIH1cblxuICBnZXQgY2hvb3NlUGFzc3dvcmRVUkwoKSB7XG4gICAgcmV0dXJuIHRoaXMuY3VzdG9tUGFnZXMuY2hvb3NlUGFzc3dvcmQgfHwgYCR7dGhpcy5wdWJsaWNTZXJ2ZXJVUkx9L2FwcHMvY2hvb3NlX3Bhc3N3b3JkYDtcbiAgfVxuXG4gIGdldCByZXF1ZXN0UmVzZXRQYXNzd29yZFVSTCgpIHtcbiAgICByZXR1cm4gYCR7dGhpcy5wdWJsaWNTZXJ2ZXJVUkx9LyR7dGhpcy5wYWdlc0VuZHBvaW50fS8ke3RoaXMuYXBwbGljYXRpb25JZH0vcmVxdWVzdF9wYXNzd29yZF9yZXNldGA7XG4gIH1cblxuICBnZXQgcGFzc3dvcmRSZXNldFN1Y2Nlc3NVUkwoKSB7XG4gICAgcmV0dXJuIChcbiAgICAgIHRoaXMuY3VzdG9tUGFnZXMucGFzc3dvcmRSZXNldFN1Y2Nlc3MgfHxcbiAgICAgIGAke3RoaXMucHVibGljU2VydmVyVVJMfS9hcHBzL3Bhc3N3b3JkX3Jlc2V0X3N1Y2Nlc3MuaHRtbGBcbiAgICApO1xuICB9XG5cbiAgZ2V0IHBhcnNlRnJhbWVVUkwoKSB7XG4gICAgcmV0dXJuIHRoaXMuY3VzdG9tUGFnZXMucGFyc2VGcmFtZVVSTDtcbiAgfVxuXG4gIGdldCB2ZXJpZnlFbWFpbFVSTCgpIHtcbiAgICByZXR1cm4gYCR7dGhpcy5wdWJsaWNTZXJ2ZXJVUkx9LyR7dGhpcy5wYWdlc0VuZHBvaW50fS8ke3RoaXMuYXBwbGljYXRpb25JZH0vdmVyaWZ5X2VtYWlsYDtcbiAgfVxuXG4gIC8vIFRPRE86IFJlbW92ZSB0aGlzIGZ1bmN0aW9uIG9uY2UgUGFnZXNSb3V0ZXIgcmVwbGFjZXMgdGhlIFB1YmxpY0FQSVJvdXRlcjtcbiAgLy8gdGhlIChkZWZhdWx0KSBlbmRwb2ludCBoYXMgdG8gYmUgZGVmaW5lZCBpbiBQYWdlc1JvdXRlciBvbmx5LlxuICBnZXQgcGFnZXNFbmRwb2ludCgpIHtcbiAgICByZXR1cm4gdGhpcy5wYWdlcyAmJiB0aGlzLnBhZ2VzLmVuYWJsZVJvdXRlciAmJiB0aGlzLnBhZ2VzLnBhZ2VzRW5kcG9pbnRcbiAgICAgID8gdGhpcy5wYWdlcy5wYWdlc0VuZHBvaW50XG4gICAgICA6ICdhcHBzJztcbiAgfVxufVxuXG5leHBvcnQgZGVmYXVsdCBDb25maWc7XG5tb2R1bGUuZXhwb3J0cyA9IENvbmZpZztcbiJdfQ==