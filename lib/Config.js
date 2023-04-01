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
        config.database = new _DatabaseController.default(cacheInfo.databaseController.adapter, config);
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
    security,
    enforcePrivateUsers,
    schema,
    requestKeywordDenylist,
    allowExpiredAuthDataToken
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
    this.validateSchemaOptions(schema);
    this.validateEnforcePrivateUsers(enforcePrivateUsers);
    this.validateAllowExpiredAuthDataToken(allowExpiredAuthDataToken);
    this.validateRequestKeywordDenylist(requestKeywordDenylist);
  }
  static validateRequestKeywordDenylist(requestKeywordDenylist) {
    if (requestKeywordDenylist === undefined) {
      requestKeywordDenylist = requestKeywordDenylist.default;
    } else if (!Array.isArray(requestKeywordDenylist)) {
      throw 'Parse Server option requestKeywordDenylist must be an array.';
    }
  }
  static validateEnforcePrivateUsers(enforcePrivateUsers) {
    if (typeof enforcePrivateUsers !== 'boolean') {
      throw 'Parse Server option enforcePrivateUsers must be a boolean.';
    }
  }
  static validateAllowExpiredAuthDataToken(allowExpiredAuthDataToken) {
    if (typeof allowExpiredAuthDataToken !== 'boolean') {
      throw 'Parse Server option allowExpiredAuthDataToken must be a boolean.';
    }
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
  static validateSchemaOptions(schema) {
    if (!schema) return;
    if (Object.prototype.toString.call(schema) !== '[object Object]') {
      throw 'Parse Server option schema must be an object.';
    }
    if (schema.definitions === undefined) {
      schema.definitions = _Definitions.SchemaOptions.definitions.default;
    } else if (!Array.isArray(schema.definitions)) {
      throw 'Parse Server option schema.definitions must be an array.';
    }
    if (schema.strict === undefined) {
      schema.strict = _Definitions.SchemaOptions.strict.default;
    } else if (!(0, _lodash.isBoolean)(schema.strict)) {
      throw 'Parse Server option schema.strict must be a boolean.';
    }
    if (schema.deleteExtraFields === undefined) {
      schema.deleteExtraFields = _Definitions.SchemaOptions.deleteExtraFields.default;
    } else if (!(0, _lodash.isBoolean)(schema.deleteExtraFields)) {
      throw 'Parse Server option schema.deleteExtraFields must be a boolean.';
    }
    if (schema.recreateModifiedFields === undefined) {
      schema.recreateModifiedFields = _Definitions.SchemaOptions.recreateModifiedFields.default;
    } else if (!(0, _lodash.isBoolean)(schema.recreateModifiedFields)) {
      throw 'Parse Server option schema.recreateModifiedFields must be a boolean.';
    }
    if (schema.lockSchemas === undefined) {
      schema.lockSchemas = _Definitions.SchemaOptions.lockSchemas.default;
    } else if (!(0, _lodash.isBoolean)(schema.lockSchemas)) {
      throw 'Parse Server option schema.lockSchemas must be a boolean.';
    }
    if (schema.beforeMigration === undefined) {
      schema.beforeMigration = null;
    } else if (schema.beforeMigration !== null && typeof schema.beforeMigration !== 'function') {
      throw 'Parse Server option schema.beforeMigration must be a function.';
    }
    if (schema.afterMigration === undefined) {
      schema.afterMigration = null;
    } else if (schema.afterMigration !== null && typeof schema.afterMigration !== 'function') {
      throw 'Parse Server option schema.afterMigration must be a function.';
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
  }

  // if the passwordPolicy.validatorPattern is configured then setup a callback to process the pattern
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
  }

  // TODO: Remove this function once PagesRouter replaces the PublicAPIRouter;
  // the (default) endpoint has to be defined in PagesRouter only.
  get pagesEndpoint() {
    return this.pages && this.pages.enableRouter && this.pages.pagesEndpoint ? this.pages.pagesEndpoint : 'apps';
  }
}
exports.Config = Config;
var _default = Config;
exports.default = _default;
module.exports = Config;
//# sourceMappingURL=data:application/json;charset=utf-8;base64,eyJ2ZXJzaW9uIjozLCJuYW1lcyI6WyJfY2FjaGUiLCJfaW50ZXJvcFJlcXVpcmVEZWZhdWx0IiwicmVxdWlyZSIsIl9EYXRhYmFzZUNvbnRyb2xsZXIiLCJfbmV0IiwiX0RlZmluaXRpb25zIiwiX2xvZGFzaCIsIm9iaiIsIl9fZXNNb2R1bGUiLCJkZWZhdWx0IiwicmVtb3ZlVHJhaWxpbmdTbGFzaCIsInN0ciIsImVuZHNXaXRoIiwic3Vic3RyIiwibGVuZ3RoIiwiQ29uZmlnIiwiZ2V0IiwiYXBwbGljYXRpb25JZCIsIm1vdW50IiwiY2FjaGVJbmZvIiwiQXBwQ2FjaGUiLCJjb25maWciLCJPYmplY3QiLCJrZXlzIiwiZm9yRWFjaCIsImtleSIsImRhdGFiYXNlIiwiRGF0YWJhc2VDb250cm9sbGVyIiwiZGF0YWJhc2VDb250cm9sbGVyIiwiYWRhcHRlciIsImdlbmVyYXRlU2Vzc2lvbkV4cGlyZXNBdCIsImJpbmQiLCJnZW5lcmF0ZUVtYWlsVmVyaWZ5VG9rZW5FeHBpcmVzQXQiLCJwdXQiLCJzZXJ2ZXJDb25maWd1cmF0aW9uIiwidmFsaWRhdGUiLCJhcHBJZCIsInNldHVwUGFzc3dvcmRWYWxpZGF0b3IiLCJwYXNzd29yZFBvbGljeSIsInZlcmlmeVVzZXJFbWFpbHMiLCJ1c2VyQ29udHJvbGxlciIsImFwcE5hbWUiLCJwdWJsaWNTZXJ2ZXJVUkwiLCJyZXZva2VTZXNzaW9uT25QYXNzd29yZFJlc2V0IiwiZXhwaXJlSW5hY3RpdmVTZXNzaW9ucyIsInNlc3Npb25MZW5ndGgiLCJtYXhMaW1pdCIsImVtYWlsVmVyaWZ5VG9rZW5WYWxpZGl0eUR1cmF0aW9uIiwiYWNjb3VudExvY2tvdXQiLCJtYXN0ZXJLZXlJcHMiLCJtYXN0ZXJLZXkiLCJyZWFkT25seU1hc3RlcktleSIsImFsbG93SGVhZGVycyIsImlkZW1wb3RlbmN5T3B0aW9ucyIsImVtYWlsVmVyaWZ5VG9rZW5SZXVzZUlmVmFsaWQiLCJmaWxlVXBsb2FkIiwicGFnZXMiLCJzZWN1cml0eSIsImVuZm9yY2VQcml2YXRlVXNlcnMiLCJzY2hlbWEiLCJyZXF1ZXN0S2V5d29yZERlbnlsaXN0IiwiYWxsb3dFeHBpcmVkQXV0aERhdGFUb2tlbiIsIkVycm9yIiwiZW1haWxBZGFwdGVyIiwidmFsaWRhdGVFbWFpbENvbmZpZ3VyYXRpb24iLCJ2YWxpZGF0ZUFjY291bnRMb2Nrb3V0UG9saWN5IiwidmFsaWRhdGVQYXNzd29yZFBvbGljeSIsInZhbGlkYXRlRmlsZVVwbG9hZE9wdGlvbnMiLCJzdGFydHNXaXRoIiwidmFsaWRhdGVTZXNzaW9uQ29uZmlndXJhdGlvbiIsInZhbGlkYXRlTWFzdGVyS2V5SXBzIiwidmFsaWRhdGVNYXhMaW1pdCIsInZhbGlkYXRlQWxsb3dIZWFkZXJzIiwidmFsaWRhdGVJZGVtcG90ZW5jeU9wdGlvbnMiLCJ2YWxpZGF0ZVBhZ2VzT3B0aW9ucyIsInZhbGlkYXRlU2VjdXJpdHlPcHRpb25zIiwidmFsaWRhdGVTY2hlbWFPcHRpb25zIiwidmFsaWRhdGVFbmZvcmNlUHJpdmF0ZVVzZXJzIiwidmFsaWRhdGVBbGxvd0V4cGlyZWRBdXRoRGF0YVRva2VuIiwidmFsaWRhdGVSZXF1ZXN0S2V5d29yZERlbnlsaXN0IiwidW5kZWZpbmVkIiwiQXJyYXkiLCJpc0FycmF5IiwicHJvdG90eXBlIiwidG9TdHJpbmciLCJjYWxsIiwiZW5hYmxlQ2hlY2siLCJTZWN1cml0eU9wdGlvbnMiLCJpc0Jvb2xlYW4iLCJlbmFibGVDaGVja0xvZyIsImRlZmluaXRpb25zIiwiU2NoZW1hT3B0aW9ucyIsInN0cmljdCIsImRlbGV0ZUV4dHJhRmllbGRzIiwicmVjcmVhdGVNb2RpZmllZEZpZWxkcyIsImxvY2tTY2hlbWFzIiwiYmVmb3JlTWlncmF0aW9uIiwiYWZ0ZXJNaWdyYXRpb24iLCJlbmFibGVSb3V0ZXIiLCJQYWdlc09wdGlvbnMiLCJlbmFibGVMb2NhbGl6YXRpb24iLCJsb2NhbGl6YXRpb25Kc29uUGF0aCIsImlzU3RyaW5nIiwibG9jYWxpemF0aW9uRmFsbGJhY2tMb2NhbGUiLCJwbGFjZWhvbGRlcnMiLCJmb3JjZVJlZGlyZWN0IiwicGFnZXNQYXRoIiwicGFnZXNFbmRwb2ludCIsImN1c3RvbVVybHMiLCJjdXN0b21Sb3V0ZXMiLCJ0dGwiLCJJZGVtcG90ZW5jeU9wdGlvbnMiLCJpc05hTiIsInBhdGhzIiwiZHVyYXRpb24iLCJOdW1iZXIiLCJpc0ludGVnZXIiLCJ0aHJlc2hvbGQiLCJ1bmxvY2tPblBhc3N3b3JkUmVzZXQiLCJBY2NvdW50TG9ja291dE9wdGlvbnMiLCJtYXhQYXNzd29yZEFnZSIsInJlc2V0VG9rZW5WYWxpZGl0eUR1cmF0aW9uIiwidmFsaWRhdG9yUGF0dGVybiIsIlJlZ0V4cCIsInZhbGlkYXRvckNhbGxiYWNrIiwiZG9Ob3RBbGxvd1VzZXJuYW1lIiwibWF4UGFzc3dvcmRIaXN0b3J5IiwicmVzZXRUb2tlblJldXNlSWZWYWxpZCIsInBhdHRlcm5WYWxpZGF0b3IiLCJ2YWx1ZSIsInRlc3QiLCJlIiwiUmVmZXJlbmNlRXJyb3IiLCJlbmFibGVGb3JBbm9ueW1vdXNVc2VyIiwiRmlsZVVwbG9hZE9wdGlvbnMiLCJlbmFibGVGb3JQdWJsaWMiLCJlbmFibGVGb3JBdXRoZW50aWNhdGVkVXNlciIsImlwIiwibmV0IiwiaXNJUCIsIl9tb3VudCIsIm5ld1ZhbHVlIiwiaW5jbHVkZXMiLCJoZWFkZXIiLCJ0cmltIiwibm93IiwiRGF0ZSIsImdldFRpbWUiLCJnZW5lcmF0ZVBhc3N3b3JkUmVzZXRUb2tlbkV4cGlyZXNBdCIsImludmFsaWRMaW5rVVJMIiwiY3VzdG9tUGFnZXMiLCJpbnZhbGlkTGluayIsImludmFsaWRWZXJpZmljYXRpb25MaW5rVVJMIiwiaW52YWxpZFZlcmlmaWNhdGlvbkxpbmsiLCJsaW5rU2VuZFN1Y2Nlc3NVUkwiLCJsaW5rU2VuZFN1Y2Nlc3MiLCJsaW5rU2VuZEZhaWxVUkwiLCJsaW5rU2VuZEZhaWwiLCJ2ZXJpZnlFbWFpbFN1Y2Nlc3NVUkwiLCJ2ZXJpZnlFbWFpbFN1Y2Nlc3MiLCJjaG9vc2VQYXNzd29yZFVSTCIsImNob29zZVBhc3N3b3JkIiwicmVxdWVzdFJlc2V0UGFzc3dvcmRVUkwiLCJwYXNzd29yZFJlc2V0U3VjY2Vzc1VSTCIsInBhc3N3b3JkUmVzZXRTdWNjZXNzIiwicGFyc2VGcmFtZVVSTCIsInZlcmlmeUVtYWlsVVJMIiwiZXhwb3J0cyIsIl9kZWZhdWx0IiwibW9kdWxlIl0sInNvdXJjZXMiOlsiLi4vc3JjL0NvbmZpZy5qcyJdLCJzb3VyY2VzQ29udGVudCI6WyIvLyBBIENvbmZpZyBvYmplY3QgcHJvdmlkZXMgaW5mb3JtYXRpb24gYWJvdXQgaG93IGEgc3BlY2lmaWMgYXBwIGlzXG4vLyBjb25maWd1cmVkLlxuLy8gbW91bnQgaXMgdGhlIFVSTCBmb3IgdGhlIHJvb3Qgb2YgdGhlIEFQSTsgaW5jbHVkZXMgaHR0cCwgZG9tYWluLCBldGMuXG5cbmltcG9ydCBBcHBDYWNoZSBmcm9tICcuL2NhY2hlJztcbmltcG9ydCBEYXRhYmFzZUNvbnRyb2xsZXIgZnJvbSAnLi9Db250cm9sbGVycy9EYXRhYmFzZUNvbnRyb2xsZXInO1xuaW1wb3J0IG5ldCBmcm9tICduZXQnO1xuaW1wb3J0IHtcbiAgSWRlbXBvdGVuY3lPcHRpb25zLFxuICBGaWxlVXBsb2FkT3B0aW9ucyxcbiAgQWNjb3VudExvY2tvdXRPcHRpb25zLFxuICBQYWdlc09wdGlvbnMsXG4gIFNlY3VyaXR5T3B0aW9ucyxcbiAgU2NoZW1hT3B0aW9ucyxcbn0gZnJvbSAnLi9PcHRpb25zL0RlZmluaXRpb25zJztcbmltcG9ydCB7IGlzQm9vbGVhbiwgaXNTdHJpbmcgfSBmcm9tICdsb2Rhc2gnO1xuXG5mdW5jdGlvbiByZW1vdmVUcmFpbGluZ1NsYXNoKHN0cikge1xuICBpZiAoIXN0cikge1xuICAgIHJldHVybiBzdHI7XG4gIH1cbiAgaWYgKHN0ci5lbmRzV2l0aCgnLycpKSB7XG4gICAgc3RyID0gc3RyLnN1YnN0cigwLCBzdHIubGVuZ3RoIC0gMSk7XG4gIH1cbiAgcmV0dXJuIHN0cjtcbn1cblxuZXhwb3J0IGNsYXNzIENvbmZpZyB7XG4gIHN0YXRpYyBnZXQoYXBwbGljYXRpb25JZDogc3RyaW5nLCBtb3VudDogc3RyaW5nKSB7XG4gICAgY29uc3QgY2FjaGVJbmZvID0gQXBwQ2FjaGUuZ2V0KGFwcGxpY2F0aW9uSWQpO1xuICAgIGlmICghY2FjaGVJbmZvKSB7XG4gICAgICByZXR1cm47XG4gICAgfVxuICAgIGNvbnN0IGNvbmZpZyA9IG5ldyBDb25maWcoKTtcbiAgICBjb25maWcuYXBwbGljYXRpb25JZCA9IGFwcGxpY2F0aW9uSWQ7XG4gICAgT2JqZWN0LmtleXMoY2FjaGVJbmZvKS5mb3JFYWNoKGtleSA9PiB7XG4gICAgICBpZiAoa2V5ID09ICdkYXRhYmFzZUNvbnRyb2xsZXInKSB7XG4gICAgICAgIGNvbmZpZy5kYXRhYmFzZSA9IG5ldyBEYXRhYmFzZUNvbnRyb2xsZXIoY2FjaGVJbmZvLmRhdGFiYXNlQ29udHJvbGxlci5hZGFwdGVyLCBjb25maWcpO1xuICAgICAgfSBlbHNlIHtcbiAgICAgICAgY29uZmlnW2tleV0gPSBjYWNoZUluZm9ba2V5XTtcbiAgICAgIH1cbiAgICB9KTtcbiAgICBjb25maWcubW91bnQgPSByZW1vdmVUcmFpbGluZ1NsYXNoKG1vdW50KTtcbiAgICBjb25maWcuZ2VuZXJhdGVTZXNzaW9uRXhwaXJlc0F0ID0gY29uZmlnLmdlbmVyYXRlU2Vzc2lvbkV4cGlyZXNBdC5iaW5kKGNvbmZpZyk7XG4gICAgY29uZmlnLmdlbmVyYXRlRW1haWxWZXJpZnlUb2tlbkV4cGlyZXNBdCA9IGNvbmZpZy5nZW5lcmF0ZUVtYWlsVmVyaWZ5VG9rZW5FeHBpcmVzQXQuYmluZChcbiAgICAgIGNvbmZpZ1xuICAgICk7XG4gICAgcmV0dXJuIGNvbmZpZztcbiAgfVxuXG4gIHN0YXRpYyBwdXQoc2VydmVyQ29uZmlndXJhdGlvbikge1xuICAgIENvbmZpZy52YWxpZGF0ZShzZXJ2ZXJDb25maWd1cmF0aW9uKTtcbiAgICBBcHBDYWNoZS5wdXQoc2VydmVyQ29uZmlndXJhdGlvbi5hcHBJZCwgc2VydmVyQ29uZmlndXJhdGlvbik7XG4gICAgQ29uZmlnLnNldHVwUGFzc3dvcmRWYWxpZGF0b3Ioc2VydmVyQ29uZmlndXJhdGlvbi5wYXNzd29yZFBvbGljeSk7XG4gICAgcmV0dXJuIHNlcnZlckNvbmZpZ3VyYXRpb247XG4gIH1cblxuICBzdGF0aWMgdmFsaWRhdGUoe1xuICAgIHZlcmlmeVVzZXJFbWFpbHMsXG4gICAgdXNlckNvbnRyb2xsZXIsXG4gICAgYXBwTmFtZSxcbiAgICBwdWJsaWNTZXJ2ZXJVUkwsXG4gICAgcmV2b2tlU2Vzc2lvbk9uUGFzc3dvcmRSZXNldCxcbiAgICBleHBpcmVJbmFjdGl2ZVNlc3Npb25zLFxuICAgIHNlc3Npb25MZW5ndGgsXG4gICAgbWF4TGltaXQsXG4gICAgZW1haWxWZXJpZnlUb2tlblZhbGlkaXR5RHVyYXRpb24sXG4gICAgYWNjb3VudExvY2tvdXQsXG4gICAgcGFzc3dvcmRQb2xpY3ksXG4gICAgbWFzdGVyS2V5SXBzLFxuICAgIG1hc3RlcktleSxcbiAgICByZWFkT25seU1hc3RlcktleSxcbiAgICBhbGxvd0hlYWRlcnMsXG4gICAgaWRlbXBvdGVuY3lPcHRpb25zLFxuICAgIGVtYWlsVmVyaWZ5VG9rZW5SZXVzZUlmVmFsaWQsXG4gICAgZmlsZVVwbG9hZCxcbiAgICBwYWdlcyxcbiAgICBzZWN1cml0eSxcbiAgICBlbmZvcmNlUHJpdmF0ZVVzZXJzLFxuICAgIHNjaGVtYSxcbiAgICByZXF1ZXN0S2V5d29yZERlbnlsaXN0LFxuICAgIGFsbG93RXhwaXJlZEF1dGhEYXRhVG9rZW4sXG4gIH0pIHtcbiAgICBpZiAobWFzdGVyS2V5ID09PSByZWFkT25seU1hc3RlcktleSkge1xuICAgICAgdGhyb3cgbmV3IEVycm9yKCdtYXN0ZXJLZXkgYW5kIHJlYWRPbmx5TWFzdGVyS2V5IHNob3VsZCBiZSBkaWZmZXJlbnQnKTtcbiAgICB9XG5cbiAgICBjb25zdCBlbWFpbEFkYXB0ZXIgPSB1c2VyQ29udHJvbGxlci5hZGFwdGVyO1xuICAgIGlmICh2ZXJpZnlVc2VyRW1haWxzKSB7XG4gICAgICB0aGlzLnZhbGlkYXRlRW1haWxDb25maWd1cmF0aW9uKHtcbiAgICAgICAgZW1haWxBZGFwdGVyLFxuICAgICAgICBhcHBOYW1lLFxuICAgICAgICBwdWJsaWNTZXJ2ZXJVUkwsXG4gICAgICAgIGVtYWlsVmVyaWZ5VG9rZW5WYWxpZGl0eUR1cmF0aW9uLFxuICAgICAgICBlbWFpbFZlcmlmeVRva2VuUmV1c2VJZlZhbGlkLFxuICAgICAgfSk7XG4gICAgfVxuXG4gICAgdGhpcy52YWxpZGF0ZUFjY291bnRMb2Nrb3V0UG9saWN5KGFjY291bnRMb2Nrb3V0KTtcbiAgICB0aGlzLnZhbGlkYXRlUGFzc3dvcmRQb2xpY3kocGFzc3dvcmRQb2xpY3kpO1xuICAgIHRoaXMudmFsaWRhdGVGaWxlVXBsb2FkT3B0aW9ucyhmaWxlVXBsb2FkKTtcblxuICAgIGlmICh0eXBlb2YgcmV2b2tlU2Vzc2lvbk9uUGFzc3dvcmRSZXNldCAhPT0gJ2Jvb2xlYW4nKSB7XG4gICAgICB0aHJvdyAncmV2b2tlU2Vzc2lvbk9uUGFzc3dvcmRSZXNldCBtdXN0IGJlIGEgYm9vbGVhbiB2YWx1ZSc7XG4gICAgfVxuXG4gICAgaWYgKHB1YmxpY1NlcnZlclVSTCkge1xuICAgICAgaWYgKCFwdWJsaWNTZXJ2ZXJVUkwuc3RhcnRzV2l0aCgnaHR0cDovLycpICYmICFwdWJsaWNTZXJ2ZXJVUkwuc3RhcnRzV2l0aCgnaHR0cHM6Ly8nKSkge1xuICAgICAgICB0aHJvdyAncHVibGljU2VydmVyVVJMIHNob3VsZCBiZSBhIHZhbGlkIEhUVFBTIFVSTCBzdGFydGluZyB3aXRoIGh0dHBzOi8vJztcbiAgICAgIH1cbiAgICB9XG4gICAgdGhpcy52YWxpZGF0ZVNlc3Npb25Db25maWd1cmF0aW9uKHNlc3Npb25MZW5ndGgsIGV4cGlyZUluYWN0aXZlU2Vzc2lvbnMpO1xuICAgIHRoaXMudmFsaWRhdGVNYXN0ZXJLZXlJcHMobWFzdGVyS2V5SXBzKTtcbiAgICB0aGlzLnZhbGlkYXRlTWF4TGltaXQobWF4TGltaXQpO1xuICAgIHRoaXMudmFsaWRhdGVBbGxvd0hlYWRlcnMoYWxsb3dIZWFkZXJzKTtcbiAgICB0aGlzLnZhbGlkYXRlSWRlbXBvdGVuY3lPcHRpb25zKGlkZW1wb3RlbmN5T3B0aW9ucyk7XG4gICAgdGhpcy52YWxpZGF0ZVBhZ2VzT3B0aW9ucyhwYWdlcyk7XG4gICAgdGhpcy52YWxpZGF0ZVNlY3VyaXR5T3B0aW9ucyhzZWN1cml0eSk7XG4gICAgdGhpcy52YWxpZGF0ZVNjaGVtYU9wdGlvbnMoc2NoZW1hKTtcbiAgICB0aGlzLnZhbGlkYXRlRW5mb3JjZVByaXZhdGVVc2VycyhlbmZvcmNlUHJpdmF0ZVVzZXJzKTtcbiAgICB0aGlzLnZhbGlkYXRlQWxsb3dFeHBpcmVkQXV0aERhdGFUb2tlbihhbGxvd0V4cGlyZWRBdXRoRGF0YVRva2VuKTtcbiAgICB0aGlzLnZhbGlkYXRlUmVxdWVzdEtleXdvcmREZW55bGlzdChyZXF1ZXN0S2V5d29yZERlbnlsaXN0KTtcbiAgfVxuXG4gIHN0YXRpYyB2YWxpZGF0ZVJlcXVlc3RLZXl3b3JkRGVueWxpc3QocmVxdWVzdEtleXdvcmREZW55bGlzdCkge1xuICAgIGlmIChyZXF1ZXN0S2V5d29yZERlbnlsaXN0ID09PSB1bmRlZmluZWQpIHtcbiAgICAgIHJlcXVlc3RLZXl3b3JkRGVueWxpc3QgPSByZXF1ZXN0S2V5d29yZERlbnlsaXN0LmRlZmF1bHQ7XG4gICAgfSBlbHNlIGlmICghQXJyYXkuaXNBcnJheShyZXF1ZXN0S2V5d29yZERlbnlsaXN0KSkge1xuICAgICAgdGhyb3cgJ1BhcnNlIFNlcnZlciBvcHRpb24gcmVxdWVzdEtleXdvcmREZW55bGlzdCBtdXN0IGJlIGFuIGFycmF5Lic7XG4gICAgfVxuICB9XG5cbiAgc3RhdGljIHZhbGlkYXRlRW5mb3JjZVByaXZhdGVVc2VycyhlbmZvcmNlUHJpdmF0ZVVzZXJzKSB7XG4gICAgaWYgKHR5cGVvZiBlbmZvcmNlUHJpdmF0ZVVzZXJzICE9PSAnYm9vbGVhbicpIHtcbiAgICAgIHRocm93ICdQYXJzZSBTZXJ2ZXIgb3B0aW9uIGVuZm9yY2VQcml2YXRlVXNlcnMgbXVzdCBiZSBhIGJvb2xlYW4uJztcbiAgICB9XG4gIH1cblxuICBzdGF0aWMgdmFsaWRhdGVBbGxvd0V4cGlyZWRBdXRoRGF0YVRva2VuKGFsbG93RXhwaXJlZEF1dGhEYXRhVG9rZW4pIHtcbiAgICBpZiAodHlwZW9mIGFsbG93RXhwaXJlZEF1dGhEYXRhVG9rZW4gIT09ICdib29sZWFuJykge1xuICAgICAgdGhyb3cgJ1BhcnNlIFNlcnZlciBvcHRpb24gYWxsb3dFeHBpcmVkQXV0aERhdGFUb2tlbiBtdXN0IGJlIGEgYm9vbGVhbi4nO1xuICAgIH1cbiAgfVxuXG4gIHN0YXRpYyB2YWxpZGF0ZVNlY3VyaXR5T3B0aW9ucyhzZWN1cml0eSkge1xuICAgIGlmIChPYmplY3QucHJvdG90eXBlLnRvU3RyaW5nLmNhbGwoc2VjdXJpdHkpICE9PSAnW29iamVjdCBPYmplY3RdJykge1xuICAgICAgdGhyb3cgJ1BhcnNlIFNlcnZlciBvcHRpb24gc2VjdXJpdHkgbXVzdCBiZSBhbiBvYmplY3QuJztcbiAgICB9XG4gICAgaWYgKHNlY3VyaXR5LmVuYWJsZUNoZWNrID09PSB1bmRlZmluZWQpIHtcbiAgICAgIHNlY3VyaXR5LmVuYWJsZUNoZWNrID0gU2VjdXJpdHlPcHRpb25zLmVuYWJsZUNoZWNrLmRlZmF1bHQ7XG4gICAgfSBlbHNlIGlmICghaXNCb29sZWFuKHNlY3VyaXR5LmVuYWJsZUNoZWNrKSkge1xuICAgICAgdGhyb3cgJ1BhcnNlIFNlcnZlciBvcHRpb24gc2VjdXJpdHkuZW5hYmxlQ2hlY2sgbXVzdCBiZSBhIGJvb2xlYW4uJztcbiAgICB9XG4gICAgaWYgKHNlY3VyaXR5LmVuYWJsZUNoZWNrTG9nID09PSB1bmRlZmluZWQpIHtcbiAgICAgIHNlY3VyaXR5LmVuYWJsZUNoZWNrTG9nID0gU2VjdXJpdHlPcHRpb25zLmVuYWJsZUNoZWNrTG9nLmRlZmF1bHQ7XG4gICAgfSBlbHNlIGlmICghaXNCb29sZWFuKHNlY3VyaXR5LmVuYWJsZUNoZWNrTG9nKSkge1xuICAgICAgdGhyb3cgJ1BhcnNlIFNlcnZlciBvcHRpb24gc2VjdXJpdHkuZW5hYmxlQ2hlY2tMb2cgbXVzdCBiZSBhIGJvb2xlYW4uJztcbiAgICB9XG4gIH1cblxuICBzdGF0aWMgdmFsaWRhdGVTY2hlbWFPcHRpb25zKHNjaGVtYTogU2NoZW1hT3B0aW9ucykge1xuICAgIGlmICghc2NoZW1hKSByZXR1cm47XG4gICAgaWYgKE9iamVjdC5wcm90b3R5cGUudG9TdHJpbmcuY2FsbChzY2hlbWEpICE9PSAnW29iamVjdCBPYmplY3RdJykge1xuICAgICAgdGhyb3cgJ1BhcnNlIFNlcnZlciBvcHRpb24gc2NoZW1hIG11c3QgYmUgYW4gb2JqZWN0Lic7XG4gICAgfVxuICAgIGlmIChzY2hlbWEuZGVmaW5pdGlvbnMgPT09IHVuZGVmaW5lZCkge1xuICAgICAgc2NoZW1hLmRlZmluaXRpb25zID0gU2NoZW1hT3B0aW9ucy5kZWZpbml0aW9ucy5kZWZhdWx0O1xuICAgIH0gZWxzZSBpZiAoIUFycmF5LmlzQXJyYXkoc2NoZW1hLmRlZmluaXRpb25zKSkge1xuICAgICAgdGhyb3cgJ1BhcnNlIFNlcnZlciBvcHRpb24gc2NoZW1hLmRlZmluaXRpb25zIG11c3QgYmUgYW4gYXJyYXkuJztcbiAgICB9XG4gICAgaWYgKHNjaGVtYS5zdHJpY3QgPT09IHVuZGVmaW5lZCkge1xuICAgICAgc2NoZW1hLnN0cmljdCA9IFNjaGVtYU9wdGlvbnMuc3RyaWN0LmRlZmF1bHQ7XG4gICAgfSBlbHNlIGlmICghaXNCb29sZWFuKHNjaGVtYS5zdHJpY3QpKSB7XG4gICAgICB0aHJvdyAnUGFyc2UgU2VydmVyIG9wdGlvbiBzY2hlbWEuc3RyaWN0IG11c3QgYmUgYSBib29sZWFuLic7XG4gICAgfVxuICAgIGlmIChzY2hlbWEuZGVsZXRlRXh0cmFGaWVsZHMgPT09IHVuZGVmaW5lZCkge1xuICAgICAgc2NoZW1hLmRlbGV0ZUV4dHJhRmllbGRzID0gU2NoZW1hT3B0aW9ucy5kZWxldGVFeHRyYUZpZWxkcy5kZWZhdWx0O1xuICAgIH0gZWxzZSBpZiAoIWlzQm9vbGVhbihzY2hlbWEuZGVsZXRlRXh0cmFGaWVsZHMpKSB7XG4gICAgICB0aHJvdyAnUGFyc2UgU2VydmVyIG9wdGlvbiBzY2hlbWEuZGVsZXRlRXh0cmFGaWVsZHMgbXVzdCBiZSBhIGJvb2xlYW4uJztcbiAgICB9XG4gICAgaWYgKHNjaGVtYS5yZWNyZWF0ZU1vZGlmaWVkRmllbGRzID09PSB1bmRlZmluZWQpIHtcbiAgICAgIHNjaGVtYS5yZWNyZWF0ZU1vZGlmaWVkRmllbGRzID0gU2NoZW1hT3B0aW9ucy5yZWNyZWF0ZU1vZGlmaWVkRmllbGRzLmRlZmF1bHQ7XG4gICAgfSBlbHNlIGlmICghaXNCb29sZWFuKHNjaGVtYS5yZWNyZWF0ZU1vZGlmaWVkRmllbGRzKSkge1xuICAgICAgdGhyb3cgJ1BhcnNlIFNlcnZlciBvcHRpb24gc2NoZW1hLnJlY3JlYXRlTW9kaWZpZWRGaWVsZHMgbXVzdCBiZSBhIGJvb2xlYW4uJztcbiAgICB9XG4gICAgaWYgKHNjaGVtYS5sb2NrU2NoZW1hcyA9PT0gdW5kZWZpbmVkKSB7XG4gICAgICBzY2hlbWEubG9ja1NjaGVtYXMgPSBTY2hlbWFPcHRpb25zLmxvY2tTY2hlbWFzLmRlZmF1bHQ7XG4gICAgfSBlbHNlIGlmICghaXNCb29sZWFuKHNjaGVtYS5sb2NrU2NoZW1hcykpIHtcbiAgICAgIHRocm93ICdQYXJzZSBTZXJ2ZXIgb3B0aW9uIHNjaGVtYS5sb2NrU2NoZW1hcyBtdXN0IGJlIGEgYm9vbGVhbi4nO1xuICAgIH1cbiAgICBpZiAoc2NoZW1hLmJlZm9yZU1pZ3JhdGlvbiA9PT0gdW5kZWZpbmVkKSB7XG4gICAgICBzY2hlbWEuYmVmb3JlTWlncmF0aW9uID0gbnVsbDtcbiAgICB9IGVsc2UgaWYgKHNjaGVtYS5iZWZvcmVNaWdyYXRpb24gIT09IG51bGwgJiYgdHlwZW9mIHNjaGVtYS5iZWZvcmVNaWdyYXRpb24gIT09ICdmdW5jdGlvbicpIHtcbiAgICAgIHRocm93ICdQYXJzZSBTZXJ2ZXIgb3B0aW9uIHNjaGVtYS5iZWZvcmVNaWdyYXRpb24gbXVzdCBiZSBhIGZ1bmN0aW9uLic7XG4gICAgfVxuICAgIGlmIChzY2hlbWEuYWZ0ZXJNaWdyYXRpb24gPT09IHVuZGVmaW5lZCkge1xuICAgICAgc2NoZW1hLmFmdGVyTWlncmF0aW9uID0gbnVsbDtcbiAgICB9IGVsc2UgaWYgKHNjaGVtYS5hZnRlck1pZ3JhdGlvbiAhPT0gbnVsbCAmJiB0eXBlb2Ygc2NoZW1hLmFmdGVyTWlncmF0aW9uICE9PSAnZnVuY3Rpb24nKSB7XG4gICAgICB0aHJvdyAnUGFyc2UgU2VydmVyIG9wdGlvbiBzY2hlbWEuYWZ0ZXJNaWdyYXRpb24gbXVzdCBiZSBhIGZ1bmN0aW9uLic7XG4gICAgfVxuICB9XG5cbiAgc3RhdGljIHZhbGlkYXRlUGFnZXNPcHRpb25zKHBhZ2VzKSB7XG4gICAgaWYgKE9iamVjdC5wcm90b3R5cGUudG9TdHJpbmcuY2FsbChwYWdlcykgIT09ICdbb2JqZWN0IE9iamVjdF0nKSB7XG4gICAgICB0aHJvdyAnUGFyc2UgU2VydmVyIG9wdGlvbiBwYWdlcyBtdXN0IGJlIGFuIG9iamVjdC4nO1xuICAgIH1cbiAgICBpZiAocGFnZXMuZW5hYmxlUm91dGVyID09PSB1bmRlZmluZWQpIHtcbiAgICAgIHBhZ2VzLmVuYWJsZVJvdXRlciA9IFBhZ2VzT3B0aW9ucy5lbmFibGVSb3V0ZXIuZGVmYXVsdDtcbiAgICB9IGVsc2UgaWYgKCFpc0Jvb2xlYW4ocGFnZXMuZW5hYmxlUm91dGVyKSkge1xuICAgICAgdGhyb3cgJ1BhcnNlIFNlcnZlciBvcHRpb24gcGFnZXMuZW5hYmxlUm91dGVyIG11c3QgYmUgYSBib29sZWFuLic7XG4gICAgfVxuICAgIGlmIChwYWdlcy5lbmFibGVMb2NhbGl6YXRpb24gPT09IHVuZGVmaW5lZCkge1xuICAgICAgcGFnZXMuZW5hYmxlTG9jYWxpemF0aW9uID0gUGFnZXNPcHRpb25zLmVuYWJsZUxvY2FsaXphdGlvbi5kZWZhdWx0O1xuICAgIH0gZWxzZSBpZiAoIWlzQm9vbGVhbihwYWdlcy5lbmFibGVMb2NhbGl6YXRpb24pKSB7XG4gICAgICB0aHJvdyAnUGFyc2UgU2VydmVyIG9wdGlvbiBwYWdlcy5lbmFibGVMb2NhbGl6YXRpb24gbXVzdCBiZSBhIGJvb2xlYW4uJztcbiAgICB9XG4gICAgaWYgKHBhZ2VzLmxvY2FsaXphdGlvbkpzb25QYXRoID09PSB1bmRlZmluZWQpIHtcbiAgICAgIHBhZ2VzLmxvY2FsaXphdGlvbkpzb25QYXRoID0gUGFnZXNPcHRpb25zLmxvY2FsaXphdGlvbkpzb25QYXRoLmRlZmF1bHQ7XG4gICAgfSBlbHNlIGlmICghaXNTdHJpbmcocGFnZXMubG9jYWxpemF0aW9uSnNvblBhdGgpKSB7XG4gICAgICB0aHJvdyAnUGFyc2UgU2VydmVyIG9wdGlvbiBwYWdlcy5sb2NhbGl6YXRpb25Kc29uUGF0aCBtdXN0IGJlIGEgc3RyaW5nLic7XG4gICAgfVxuICAgIGlmIChwYWdlcy5sb2NhbGl6YXRpb25GYWxsYmFja0xvY2FsZSA9PT0gdW5kZWZpbmVkKSB7XG4gICAgICBwYWdlcy5sb2NhbGl6YXRpb25GYWxsYmFja0xvY2FsZSA9IFBhZ2VzT3B0aW9ucy5sb2NhbGl6YXRpb25GYWxsYmFja0xvY2FsZS5kZWZhdWx0O1xuICAgIH0gZWxzZSBpZiAoIWlzU3RyaW5nKHBhZ2VzLmxvY2FsaXphdGlvbkZhbGxiYWNrTG9jYWxlKSkge1xuICAgICAgdGhyb3cgJ1BhcnNlIFNlcnZlciBvcHRpb24gcGFnZXMubG9jYWxpemF0aW9uRmFsbGJhY2tMb2NhbGUgbXVzdCBiZSBhIHN0cmluZy4nO1xuICAgIH1cbiAgICBpZiAocGFnZXMucGxhY2Vob2xkZXJzID09PSB1bmRlZmluZWQpIHtcbiAgICAgIHBhZ2VzLnBsYWNlaG9sZGVycyA9IFBhZ2VzT3B0aW9ucy5wbGFjZWhvbGRlcnMuZGVmYXVsdDtcbiAgICB9IGVsc2UgaWYgKFxuICAgICAgT2JqZWN0LnByb3RvdHlwZS50b1N0cmluZy5jYWxsKHBhZ2VzLnBsYWNlaG9sZGVycykgIT09ICdbb2JqZWN0IE9iamVjdF0nICYmXG4gICAgICB0eXBlb2YgcGFnZXMucGxhY2Vob2xkZXJzICE9PSAnZnVuY3Rpb24nXG4gICAgKSB7XG4gICAgICB0aHJvdyAnUGFyc2UgU2VydmVyIG9wdGlvbiBwYWdlcy5wbGFjZWhvbGRlcnMgbXVzdCBiZSBhbiBvYmplY3Qgb3IgYSBmdW5jdGlvbi4nO1xuICAgIH1cbiAgICBpZiAocGFnZXMuZm9yY2VSZWRpcmVjdCA9PT0gdW5kZWZpbmVkKSB7XG4gICAgICBwYWdlcy5mb3JjZVJlZGlyZWN0ID0gUGFnZXNPcHRpb25zLmZvcmNlUmVkaXJlY3QuZGVmYXVsdDtcbiAgICB9IGVsc2UgaWYgKCFpc0Jvb2xlYW4ocGFnZXMuZm9yY2VSZWRpcmVjdCkpIHtcbiAgICAgIHRocm93ICdQYXJzZSBTZXJ2ZXIgb3B0aW9uIHBhZ2VzLmZvcmNlUmVkaXJlY3QgbXVzdCBiZSBhIGJvb2xlYW4uJztcbiAgICB9XG4gICAgaWYgKHBhZ2VzLnBhZ2VzUGF0aCA9PT0gdW5kZWZpbmVkKSB7XG4gICAgICBwYWdlcy5wYWdlc1BhdGggPSBQYWdlc09wdGlvbnMucGFnZXNQYXRoLmRlZmF1bHQ7XG4gICAgfSBlbHNlIGlmICghaXNTdHJpbmcocGFnZXMucGFnZXNQYXRoKSkge1xuICAgICAgdGhyb3cgJ1BhcnNlIFNlcnZlciBvcHRpb24gcGFnZXMucGFnZXNQYXRoIG11c3QgYmUgYSBzdHJpbmcuJztcbiAgICB9XG4gICAgaWYgKHBhZ2VzLnBhZ2VzRW5kcG9pbnQgPT09IHVuZGVmaW5lZCkge1xuICAgICAgcGFnZXMucGFnZXNFbmRwb2ludCA9IFBhZ2VzT3B0aW9ucy5wYWdlc0VuZHBvaW50LmRlZmF1bHQ7XG4gICAgfSBlbHNlIGlmICghaXNTdHJpbmcocGFnZXMucGFnZXNFbmRwb2ludCkpIHtcbiAgICAgIHRocm93ICdQYXJzZSBTZXJ2ZXIgb3B0aW9uIHBhZ2VzLnBhZ2VzRW5kcG9pbnQgbXVzdCBiZSBhIHN0cmluZy4nO1xuICAgIH1cbiAgICBpZiAocGFnZXMuY3VzdG9tVXJscyA9PT0gdW5kZWZpbmVkKSB7XG4gICAgICBwYWdlcy5jdXN0b21VcmxzID0gUGFnZXNPcHRpb25zLmN1c3RvbVVybHMuZGVmYXVsdDtcbiAgICB9IGVsc2UgaWYgKE9iamVjdC5wcm90b3R5cGUudG9TdHJpbmcuY2FsbChwYWdlcy5jdXN0b21VcmxzKSAhPT0gJ1tvYmplY3QgT2JqZWN0XScpIHtcbiAgICAgIHRocm93ICdQYXJzZSBTZXJ2ZXIgb3B0aW9uIHBhZ2VzLmN1c3RvbVVybHMgbXVzdCBiZSBhbiBvYmplY3QuJztcbiAgICB9XG4gICAgaWYgKHBhZ2VzLmN1c3RvbVJvdXRlcyA9PT0gdW5kZWZpbmVkKSB7XG4gICAgICBwYWdlcy5jdXN0b21Sb3V0ZXMgPSBQYWdlc09wdGlvbnMuY3VzdG9tUm91dGVzLmRlZmF1bHQ7XG4gICAgfSBlbHNlIGlmICghKHBhZ2VzLmN1c3RvbVJvdXRlcyBpbnN0YW5jZW9mIEFycmF5KSkge1xuICAgICAgdGhyb3cgJ1BhcnNlIFNlcnZlciBvcHRpb24gcGFnZXMuY3VzdG9tUm91dGVzIG11c3QgYmUgYW4gYXJyYXkuJztcbiAgICB9XG4gIH1cblxuICBzdGF0aWMgdmFsaWRhdGVJZGVtcG90ZW5jeU9wdGlvbnMoaWRlbXBvdGVuY3lPcHRpb25zKSB7XG4gICAgaWYgKCFpZGVtcG90ZW5jeU9wdGlvbnMpIHtcbiAgICAgIHJldHVybjtcbiAgICB9XG4gICAgaWYgKGlkZW1wb3RlbmN5T3B0aW9ucy50dGwgPT09IHVuZGVmaW5lZCkge1xuICAgICAgaWRlbXBvdGVuY3lPcHRpb25zLnR0bCA9IElkZW1wb3RlbmN5T3B0aW9ucy50dGwuZGVmYXVsdDtcbiAgICB9IGVsc2UgaWYgKCFpc05hTihpZGVtcG90ZW5jeU9wdGlvbnMudHRsKSAmJiBpZGVtcG90ZW5jeU9wdGlvbnMudHRsIDw9IDApIHtcbiAgICAgIHRocm93ICdpZGVtcG90ZW5jeSBUVEwgdmFsdWUgbXVzdCBiZSBncmVhdGVyIHRoYW4gMCBzZWNvbmRzJztcbiAgICB9IGVsc2UgaWYgKGlzTmFOKGlkZW1wb3RlbmN5T3B0aW9ucy50dGwpKSB7XG4gICAgICB0aHJvdyAnaWRlbXBvdGVuY3kgVFRMIHZhbHVlIG11c3QgYmUgYSBudW1iZXInO1xuICAgIH1cbiAgICBpZiAoIWlkZW1wb3RlbmN5T3B0aW9ucy5wYXRocykge1xuICAgICAgaWRlbXBvdGVuY3lPcHRpb25zLnBhdGhzID0gSWRlbXBvdGVuY3lPcHRpb25zLnBhdGhzLmRlZmF1bHQ7XG4gICAgfSBlbHNlIGlmICghKGlkZW1wb3RlbmN5T3B0aW9ucy5wYXRocyBpbnN0YW5jZW9mIEFycmF5KSkge1xuICAgICAgdGhyb3cgJ2lkZW1wb3RlbmN5IHBhdGhzIG11c3QgYmUgb2YgYW4gYXJyYXkgb2Ygc3RyaW5ncyc7XG4gICAgfVxuICB9XG5cbiAgc3RhdGljIHZhbGlkYXRlQWNjb3VudExvY2tvdXRQb2xpY3koYWNjb3VudExvY2tvdXQpIHtcbiAgICBpZiAoYWNjb3VudExvY2tvdXQpIHtcbiAgICAgIGlmIChcbiAgICAgICAgdHlwZW9mIGFjY291bnRMb2Nrb3V0LmR1cmF0aW9uICE9PSAnbnVtYmVyJyB8fFxuICAgICAgICBhY2NvdW50TG9ja291dC5kdXJhdGlvbiA8PSAwIHx8XG4gICAgICAgIGFjY291bnRMb2Nrb3V0LmR1cmF0aW9uID4gOTk5OTlcbiAgICAgICkge1xuICAgICAgICB0aHJvdyAnQWNjb3VudCBsb2Nrb3V0IGR1cmF0aW9uIHNob3VsZCBiZSBncmVhdGVyIHRoYW4gMCBhbmQgbGVzcyB0aGFuIDEwMDAwMCc7XG4gICAgICB9XG5cbiAgICAgIGlmIChcbiAgICAgICAgIU51bWJlci5pc0ludGVnZXIoYWNjb3VudExvY2tvdXQudGhyZXNob2xkKSB8fFxuICAgICAgICBhY2NvdW50TG9ja291dC50aHJlc2hvbGQgPCAxIHx8XG4gICAgICAgIGFjY291bnRMb2Nrb3V0LnRocmVzaG9sZCA+IDk5OVxuICAgICAgKSB7XG4gICAgICAgIHRocm93ICdBY2NvdW50IGxvY2tvdXQgdGhyZXNob2xkIHNob3VsZCBiZSBhbiBpbnRlZ2VyIGdyZWF0ZXIgdGhhbiAwIGFuZCBsZXNzIHRoYW4gMTAwMCc7XG4gICAgICB9XG5cbiAgICAgIGlmIChhY2NvdW50TG9ja291dC51bmxvY2tPblBhc3N3b3JkUmVzZXQgPT09IHVuZGVmaW5lZCkge1xuICAgICAgICBhY2NvdW50TG9ja291dC51bmxvY2tPblBhc3N3b3JkUmVzZXQgPSBBY2NvdW50TG9ja291dE9wdGlvbnMudW5sb2NrT25QYXNzd29yZFJlc2V0LmRlZmF1bHQ7XG4gICAgICB9IGVsc2UgaWYgKCFpc0Jvb2xlYW4oYWNjb3VudExvY2tvdXQudW5sb2NrT25QYXNzd29yZFJlc2V0KSkge1xuICAgICAgICB0aHJvdyAnUGFyc2UgU2VydmVyIG9wdGlvbiBhY2NvdW50TG9ja291dC51bmxvY2tPblBhc3N3b3JkUmVzZXQgbXVzdCBiZSBhIGJvb2xlYW4uJztcbiAgICAgIH1cbiAgICB9XG4gIH1cblxuICBzdGF0aWMgdmFsaWRhdGVQYXNzd29yZFBvbGljeShwYXNzd29yZFBvbGljeSkge1xuICAgIGlmIChwYXNzd29yZFBvbGljeSkge1xuICAgICAgaWYgKFxuICAgICAgICBwYXNzd29yZFBvbGljeS5tYXhQYXNzd29yZEFnZSAhPT0gdW5kZWZpbmVkICYmXG4gICAgICAgICh0eXBlb2YgcGFzc3dvcmRQb2xpY3kubWF4UGFzc3dvcmRBZ2UgIT09ICdudW1iZXInIHx8IHBhc3N3b3JkUG9saWN5Lm1heFBhc3N3b3JkQWdlIDwgMClcbiAgICAgICkge1xuICAgICAgICB0aHJvdyAncGFzc3dvcmRQb2xpY3kubWF4UGFzc3dvcmRBZ2UgbXVzdCBiZSBhIHBvc2l0aXZlIG51bWJlcic7XG4gICAgICB9XG5cbiAgICAgIGlmIChcbiAgICAgICAgcGFzc3dvcmRQb2xpY3kucmVzZXRUb2tlblZhbGlkaXR5RHVyYXRpb24gIT09IHVuZGVmaW5lZCAmJlxuICAgICAgICAodHlwZW9mIHBhc3N3b3JkUG9saWN5LnJlc2V0VG9rZW5WYWxpZGl0eUR1cmF0aW9uICE9PSAnbnVtYmVyJyB8fFxuICAgICAgICAgIHBhc3N3b3JkUG9saWN5LnJlc2V0VG9rZW5WYWxpZGl0eUR1cmF0aW9uIDw9IDApXG4gICAgICApIHtcbiAgICAgICAgdGhyb3cgJ3Bhc3N3b3JkUG9saWN5LnJlc2V0VG9rZW5WYWxpZGl0eUR1cmF0aW9uIG11c3QgYmUgYSBwb3NpdGl2ZSBudW1iZXInO1xuICAgICAgfVxuXG4gICAgICBpZiAocGFzc3dvcmRQb2xpY3kudmFsaWRhdG9yUGF0dGVybikge1xuICAgICAgICBpZiAodHlwZW9mIHBhc3N3b3JkUG9saWN5LnZhbGlkYXRvclBhdHRlcm4gPT09ICdzdHJpbmcnKSB7XG4gICAgICAgICAgcGFzc3dvcmRQb2xpY3kudmFsaWRhdG9yUGF0dGVybiA9IG5ldyBSZWdFeHAocGFzc3dvcmRQb2xpY3kudmFsaWRhdG9yUGF0dGVybik7XG4gICAgICAgIH0gZWxzZSBpZiAoIShwYXNzd29yZFBvbGljeS52YWxpZGF0b3JQYXR0ZXJuIGluc3RhbmNlb2YgUmVnRXhwKSkge1xuICAgICAgICAgIHRocm93ICdwYXNzd29yZFBvbGljeS52YWxpZGF0b3JQYXR0ZXJuIG11c3QgYmUgYSByZWdleCBzdHJpbmcgb3IgUmVnRXhwIG9iamVjdC4nO1xuICAgICAgICB9XG4gICAgICB9XG5cbiAgICAgIGlmIChcbiAgICAgICAgcGFzc3dvcmRQb2xpY3kudmFsaWRhdG9yQ2FsbGJhY2sgJiZcbiAgICAgICAgdHlwZW9mIHBhc3N3b3JkUG9saWN5LnZhbGlkYXRvckNhbGxiYWNrICE9PSAnZnVuY3Rpb24nXG4gICAgICApIHtcbiAgICAgICAgdGhyb3cgJ3Bhc3N3b3JkUG9saWN5LnZhbGlkYXRvckNhbGxiYWNrIG11c3QgYmUgYSBmdW5jdGlvbi4nO1xuICAgICAgfVxuXG4gICAgICBpZiAoXG4gICAgICAgIHBhc3N3b3JkUG9saWN5LmRvTm90QWxsb3dVc2VybmFtZSAmJlxuICAgICAgICB0eXBlb2YgcGFzc3dvcmRQb2xpY3kuZG9Ob3RBbGxvd1VzZXJuYW1lICE9PSAnYm9vbGVhbidcbiAgICAgICkge1xuICAgICAgICB0aHJvdyAncGFzc3dvcmRQb2xpY3kuZG9Ob3RBbGxvd1VzZXJuYW1lIG11c3QgYmUgYSBib29sZWFuIHZhbHVlLic7XG4gICAgICB9XG5cbiAgICAgIGlmIChcbiAgICAgICAgcGFzc3dvcmRQb2xpY3kubWF4UGFzc3dvcmRIaXN0b3J5ICYmXG4gICAgICAgICghTnVtYmVyLmlzSW50ZWdlcihwYXNzd29yZFBvbGljeS5tYXhQYXNzd29yZEhpc3RvcnkpIHx8XG4gICAgICAgICAgcGFzc3dvcmRQb2xpY3kubWF4UGFzc3dvcmRIaXN0b3J5IDw9IDAgfHxcbiAgICAgICAgICBwYXNzd29yZFBvbGljeS5tYXhQYXNzd29yZEhpc3RvcnkgPiAyMClcbiAgICAgICkge1xuICAgICAgICB0aHJvdyAncGFzc3dvcmRQb2xpY3kubWF4UGFzc3dvcmRIaXN0b3J5IG11c3QgYmUgYW4gaW50ZWdlciByYW5naW5nIDAgLSAyMCc7XG4gICAgICB9XG5cbiAgICAgIGlmIChcbiAgICAgICAgcGFzc3dvcmRQb2xpY3kucmVzZXRUb2tlblJldXNlSWZWYWxpZCAmJlxuICAgICAgICB0eXBlb2YgcGFzc3dvcmRQb2xpY3kucmVzZXRUb2tlblJldXNlSWZWYWxpZCAhPT0gJ2Jvb2xlYW4nXG4gICAgICApIHtcbiAgICAgICAgdGhyb3cgJ3Jlc2V0VG9rZW5SZXVzZUlmVmFsaWQgbXVzdCBiZSBhIGJvb2xlYW4gdmFsdWUnO1xuICAgICAgfVxuICAgICAgaWYgKHBhc3N3b3JkUG9saWN5LnJlc2V0VG9rZW5SZXVzZUlmVmFsaWQgJiYgIXBhc3N3b3JkUG9saWN5LnJlc2V0VG9rZW5WYWxpZGl0eUR1cmF0aW9uKSB7XG4gICAgICAgIHRocm93ICdZb3UgY2Fubm90IHVzZSByZXNldFRva2VuUmV1c2VJZlZhbGlkIHdpdGhvdXQgcmVzZXRUb2tlblZhbGlkaXR5RHVyYXRpb24nO1xuICAgICAgfVxuICAgIH1cbiAgfVxuXG4gIC8vIGlmIHRoZSBwYXNzd29yZFBvbGljeS52YWxpZGF0b3JQYXR0ZXJuIGlzIGNvbmZpZ3VyZWQgdGhlbiBzZXR1cCBhIGNhbGxiYWNrIHRvIHByb2Nlc3MgdGhlIHBhdHRlcm5cbiAgc3RhdGljIHNldHVwUGFzc3dvcmRWYWxpZGF0b3IocGFzc3dvcmRQb2xpY3kpIHtcbiAgICBpZiAocGFzc3dvcmRQb2xpY3kgJiYgcGFzc3dvcmRQb2xpY3kudmFsaWRhdG9yUGF0dGVybikge1xuICAgICAgcGFzc3dvcmRQb2xpY3kucGF0dGVyblZhbGlkYXRvciA9IHZhbHVlID0+IHtcbiAgICAgICAgcmV0dXJuIHBhc3N3b3JkUG9saWN5LnZhbGlkYXRvclBhdHRlcm4udGVzdCh2YWx1ZSk7XG4gICAgICB9O1xuICAgIH1cbiAgfVxuXG4gIHN0YXRpYyB2YWxpZGF0ZUVtYWlsQ29uZmlndXJhdGlvbih7XG4gICAgZW1haWxBZGFwdGVyLFxuICAgIGFwcE5hbWUsXG4gICAgcHVibGljU2VydmVyVVJMLFxuICAgIGVtYWlsVmVyaWZ5VG9rZW5WYWxpZGl0eUR1cmF0aW9uLFxuICAgIGVtYWlsVmVyaWZ5VG9rZW5SZXVzZUlmVmFsaWQsXG4gIH0pIHtcbiAgICBpZiAoIWVtYWlsQWRhcHRlcikge1xuICAgICAgdGhyb3cgJ0FuIGVtYWlsQWRhcHRlciBpcyByZXF1aXJlZCBmb3IgZS1tYWlsIHZlcmlmaWNhdGlvbiBhbmQgcGFzc3dvcmQgcmVzZXRzLic7XG4gICAgfVxuICAgIGlmICh0eXBlb2YgYXBwTmFtZSAhPT0gJ3N0cmluZycpIHtcbiAgICAgIHRocm93ICdBbiBhcHAgbmFtZSBpcyByZXF1aXJlZCBmb3IgZS1tYWlsIHZlcmlmaWNhdGlvbiBhbmQgcGFzc3dvcmQgcmVzZXRzLic7XG4gICAgfVxuICAgIGlmICh0eXBlb2YgcHVibGljU2VydmVyVVJMICE9PSAnc3RyaW5nJykge1xuICAgICAgdGhyb3cgJ0EgcHVibGljIHNlcnZlciB1cmwgaXMgcmVxdWlyZWQgZm9yIGUtbWFpbCB2ZXJpZmljYXRpb24gYW5kIHBhc3N3b3JkIHJlc2V0cy4nO1xuICAgIH1cbiAgICBpZiAoZW1haWxWZXJpZnlUb2tlblZhbGlkaXR5RHVyYXRpb24pIHtcbiAgICAgIGlmIChpc05hTihlbWFpbFZlcmlmeVRva2VuVmFsaWRpdHlEdXJhdGlvbikpIHtcbiAgICAgICAgdGhyb3cgJ0VtYWlsIHZlcmlmeSB0b2tlbiB2YWxpZGl0eSBkdXJhdGlvbiBtdXN0IGJlIGEgdmFsaWQgbnVtYmVyLic7XG4gICAgICB9IGVsc2UgaWYgKGVtYWlsVmVyaWZ5VG9rZW5WYWxpZGl0eUR1cmF0aW9uIDw9IDApIHtcbiAgICAgICAgdGhyb3cgJ0VtYWlsIHZlcmlmeSB0b2tlbiB2YWxpZGl0eSBkdXJhdGlvbiBtdXN0IGJlIGEgdmFsdWUgZ3JlYXRlciB0aGFuIDAuJztcbiAgICAgIH1cbiAgICB9XG4gICAgaWYgKGVtYWlsVmVyaWZ5VG9rZW5SZXVzZUlmVmFsaWQgJiYgdHlwZW9mIGVtYWlsVmVyaWZ5VG9rZW5SZXVzZUlmVmFsaWQgIT09ICdib29sZWFuJykge1xuICAgICAgdGhyb3cgJ2VtYWlsVmVyaWZ5VG9rZW5SZXVzZUlmVmFsaWQgbXVzdCBiZSBhIGJvb2xlYW4gdmFsdWUnO1xuICAgIH1cbiAgICBpZiAoZW1haWxWZXJpZnlUb2tlblJldXNlSWZWYWxpZCAmJiAhZW1haWxWZXJpZnlUb2tlblZhbGlkaXR5RHVyYXRpb24pIHtcbiAgICAgIHRocm93ICdZb3UgY2Fubm90IHVzZSBlbWFpbFZlcmlmeVRva2VuUmV1c2VJZlZhbGlkIHdpdGhvdXQgZW1haWxWZXJpZnlUb2tlblZhbGlkaXR5RHVyYXRpb24nO1xuICAgIH1cbiAgfVxuXG4gIHN0YXRpYyB2YWxpZGF0ZUZpbGVVcGxvYWRPcHRpb25zKGZpbGVVcGxvYWQpIHtcbiAgICB0cnkge1xuICAgICAgaWYgKGZpbGVVcGxvYWQgPT0gbnVsbCB8fCB0eXBlb2YgZmlsZVVwbG9hZCAhPT0gJ29iamVjdCcgfHwgZmlsZVVwbG9hZCBpbnN0YW5jZW9mIEFycmF5KSB7XG4gICAgICAgIHRocm93ICdmaWxlVXBsb2FkIG11c3QgYmUgYW4gb2JqZWN0IHZhbHVlLic7XG4gICAgICB9XG4gICAgfSBjYXRjaCAoZSkge1xuICAgICAgaWYgKGUgaW5zdGFuY2VvZiBSZWZlcmVuY2VFcnJvcikge1xuICAgICAgICByZXR1cm47XG4gICAgICB9XG4gICAgICB0aHJvdyBlO1xuICAgIH1cbiAgICBpZiAoZmlsZVVwbG9hZC5lbmFibGVGb3JBbm9ueW1vdXNVc2VyID09PSB1bmRlZmluZWQpIHtcbiAgICAgIGZpbGVVcGxvYWQuZW5hYmxlRm9yQW5vbnltb3VzVXNlciA9IEZpbGVVcGxvYWRPcHRpb25zLmVuYWJsZUZvckFub255bW91c1VzZXIuZGVmYXVsdDtcbiAgICB9IGVsc2UgaWYgKHR5cGVvZiBmaWxlVXBsb2FkLmVuYWJsZUZvckFub255bW91c1VzZXIgIT09ICdib29sZWFuJykge1xuICAgICAgdGhyb3cgJ2ZpbGVVcGxvYWQuZW5hYmxlRm9yQW5vbnltb3VzVXNlciBtdXN0IGJlIGEgYm9vbGVhbiB2YWx1ZS4nO1xuICAgIH1cbiAgICBpZiAoZmlsZVVwbG9hZC5lbmFibGVGb3JQdWJsaWMgPT09IHVuZGVmaW5lZCkge1xuICAgICAgZmlsZVVwbG9hZC5lbmFibGVGb3JQdWJsaWMgPSBGaWxlVXBsb2FkT3B0aW9ucy5lbmFibGVGb3JQdWJsaWMuZGVmYXVsdDtcbiAgICB9IGVsc2UgaWYgKHR5cGVvZiBmaWxlVXBsb2FkLmVuYWJsZUZvclB1YmxpYyAhPT0gJ2Jvb2xlYW4nKSB7XG4gICAgICB0aHJvdyAnZmlsZVVwbG9hZC5lbmFibGVGb3JQdWJsaWMgbXVzdCBiZSBhIGJvb2xlYW4gdmFsdWUuJztcbiAgICB9XG4gICAgaWYgKGZpbGVVcGxvYWQuZW5hYmxlRm9yQXV0aGVudGljYXRlZFVzZXIgPT09IHVuZGVmaW5lZCkge1xuICAgICAgZmlsZVVwbG9hZC5lbmFibGVGb3JBdXRoZW50aWNhdGVkVXNlciA9IEZpbGVVcGxvYWRPcHRpb25zLmVuYWJsZUZvckF1dGhlbnRpY2F0ZWRVc2VyLmRlZmF1bHQ7XG4gICAgfSBlbHNlIGlmICh0eXBlb2YgZmlsZVVwbG9hZC5lbmFibGVGb3JBdXRoZW50aWNhdGVkVXNlciAhPT0gJ2Jvb2xlYW4nKSB7XG4gICAgICB0aHJvdyAnZmlsZVVwbG9hZC5lbmFibGVGb3JBdXRoZW50aWNhdGVkVXNlciBtdXN0IGJlIGEgYm9vbGVhbiB2YWx1ZS4nO1xuICAgIH1cbiAgfVxuXG4gIHN0YXRpYyB2YWxpZGF0ZU1hc3RlcktleUlwcyhtYXN0ZXJLZXlJcHMpIHtcbiAgICBmb3IgKGNvbnN0IGlwIG9mIG1hc3RlcktleUlwcykge1xuICAgICAgaWYgKCFuZXQuaXNJUChpcCkpIHtcbiAgICAgICAgdGhyb3cgYEludmFsaWQgaXAgaW4gbWFzdGVyS2V5SXBzOiAke2lwfWA7XG4gICAgICB9XG4gICAgfVxuICB9XG5cbiAgZ2V0IG1vdW50KCkge1xuICAgIHZhciBtb3VudCA9IHRoaXMuX21vdW50O1xuICAgIGlmICh0aGlzLnB1YmxpY1NlcnZlclVSTCkge1xuICAgICAgbW91bnQgPSB0aGlzLnB1YmxpY1NlcnZlclVSTDtcbiAgICB9XG4gICAgcmV0dXJuIG1vdW50O1xuICB9XG5cbiAgc2V0IG1vdW50KG5ld1ZhbHVlKSB7XG4gICAgdGhpcy5fbW91bnQgPSBuZXdWYWx1ZTtcbiAgfVxuXG4gIHN0YXRpYyB2YWxpZGF0ZVNlc3Npb25Db25maWd1cmF0aW9uKHNlc3Npb25MZW5ndGgsIGV4cGlyZUluYWN0aXZlU2Vzc2lvbnMpIHtcbiAgICBpZiAoZXhwaXJlSW5hY3RpdmVTZXNzaW9ucykge1xuICAgICAgaWYgKGlzTmFOKHNlc3Npb25MZW5ndGgpKSB7XG4gICAgICAgIHRocm93ICdTZXNzaW9uIGxlbmd0aCBtdXN0IGJlIGEgdmFsaWQgbnVtYmVyLic7XG4gICAgICB9IGVsc2UgaWYgKHNlc3Npb25MZW5ndGggPD0gMCkge1xuICAgICAgICB0aHJvdyAnU2Vzc2lvbiBsZW5ndGggbXVzdCBiZSBhIHZhbHVlIGdyZWF0ZXIgdGhhbiAwLic7XG4gICAgICB9XG4gICAgfVxuICB9XG5cbiAgc3RhdGljIHZhbGlkYXRlTWF4TGltaXQobWF4TGltaXQpIHtcbiAgICBpZiAobWF4TGltaXQgPD0gMCkge1xuICAgICAgdGhyb3cgJ01heCBsaW1pdCBtdXN0IGJlIGEgdmFsdWUgZ3JlYXRlciB0aGFuIDAuJztcbiAgICB9XG4gIH1cblxuICBzdGF0aWMgdmFsaWRhdGVBbGxvd0hlYWRlcnMoYWxsb3dIZWFkZXJzKSB7XG4gICAgaWYgKCFbbnVsbCwgdW5kZWZpbmVkXS5pbmNsdWRlcyhhbGxvd0hlYWRlcnMpKSB7XG4gICAgICBpZiAoQXJyYXkuaXNBcnJheShhbGxvd0hlYWRlcnMpKSB7XG4gICAgICAgIGFsbG93SGVhZGVycy5mb3JFYWNoKGhlYWRlciA9PiB7XG4gICAgICAgICAgaWYgKHR5cGVvZiBoZWFkZXIgIT09ICdzdHJpbmcnKSB7XG4gICAgICAgICAgICB0aHJvdyAnQWxsb3cgaGVhZGVycyBtdXN0IG9ubHkgY29udGFpbiBzdHJpbmdzJztcbiAgICAgICAgICB9IGVsc2UgaWYgKCFoZWFkZXIudHJpbSgpLmxlbmd0aCkge1xuICAgICAgICAgICAgdGhyb3cgJ0FsbG93IGhlYWRlcnMgbXVzdCBub3QgY29udGFpbiBlbXB0eSBzdHJpbmdzJztcbiAgICAgICAgICB9XG4gICAgICAgIH0pO1xuICAgICAgfSBlbHNlIHtcbiAgICAgICAgdGhyb3cgJ0FsbG93IGhlYWRlcnMgbXVzdCBiZSBhbiBhcnJheSc7XG4gICAgICB9XG4gICAgfVxuICB9XG5cbiAgZ2VuZXJhdGVFbWFpbFZlcmlmeVRva2VuRXhwaXJlc0F0KCkge1xuICAgIGlmICghdGhpcy52ZXJpZnlVc2VyRW1haWxzIHx8ICF0aGlzLmVtYWlsVmVyaWZ5VG9rZW5WYWxpZGl0eUR1cmF0aW9uKSB7XG4gICAgICByZXR1cm4gdW5kZWZpbmVkO1xuICAgIH1cbiAgICB2YXIgbm93ID0gbmV3IERhdGUoKTtcbiAgICByZXR1cm4gbmV3IERhdGUobm93LmdldFRpbWUoKSArIHRoaXMuZW1haWxWZXJpZnlUb2tlblZhbGlkaXR5RHVyYXRpb24gKiAxMDAwKTtcbiAgfVxuXG4gIGdlbmVyYXRlUGFzc3dvcmRSZXNldFRva2VuRXhwaXJlc0F0KCkge1xuICAgIGlmICghdGhpcy5wYXNzd29yZFBvbGljeSB8fCAhdGhpcy5wYXNzd29yZFBvbGljeS5yZXNldFRva2VuVmFsaWRpdHlEdXJhdGlvbikge1xuICAgICAgcmV0dXJuIHVuZGVmaW5lZDtcbiAgICB9XG4gICAgY29uc3Qgbm93ID0gbmV3IERhdGUoKTtcbiAgICByZXR1cm4gbmV3IERhdGUobm93LmdldFRpbWUoKSArIHRoaXMucGFzc3dvcmRQb2xpY3kucmVzZXRUb2tlblZhbGlkaXR5RHVyYXRpb24gKiAxMDAwKTtcbiAgfVxuXG4gIGdlbmVyYXRlU2Vzc2lvbkV4cGlyZXNBdCgpIHtcbiAgICBpZiAoIXRoaXMuZXhwaXJlSW5hY3RpdmVTZXNzaW9ucykge1xuICAgICAgcmV0dXJuIHVuZGVmaW5lZDtcbiAgICB9XG4gICAgdmFyIG5vdyA9IG5ldyBEYXRlKCk7XG4gICAgcmV0dXJuIG5ldyBEYXRlKG5vdy5nZXRUaW1lKCkgKyB0aGlzLnNlc3Npb25MZW5ndGggKiAxMDAwKTtcbiAgfVxuXG4gIGdldCBpbnZhbGlkTGlua1VSTCgpIHtcbiAgICByZXR1cm4gdGhpcy5jdXN0b21QYWdlcy5pbnZhbGlkTGluayB8fCBgJHt0aGlzLnB1YmxpY1NlcnZlclVSTH0vYXBwcy9pbnZhbGlkX2xpbmsuaHRtbGA7XG4gIH1cblxuICBnZXQgaW52YWxpZFZlcmlmaWNhdGlvbkxpbmtVUkwoKSB7XG4gICAgcmV0dXJuIChcbiAgICAgIHRoaXMuY3VzdG9tUGFnZXMuaW52YWxpZFZlcmlmaWNhdGlvbkxpbmsgfHxcbiAgICAgIGAke3RoaXMucHVibGljU2VydmVyVVJMfS9hcHBzL2ludmFsaWRfdmVyaWZpY2F0aW9uX2xpbmsuaHRtbGBcbiAgICApO1xuICB9XG5cbiAgZ2V0IGxpbmtTZW5kU3VjY2Vzc1VSTCgpIHtcbiAgICByZXR1cm4gKFxuICAgICAgdGhpcy5jdXN0b21QYWdlcy5saW5rU2VuZFN1Y2Nlc3MgfHwgYCR7dGhpcy5wdWJsaWNTZXJ2ZXJVUkx9L2FwcHMvbGlua19zZW5kX3N1Y2Nlc3MuaHRtbGBcbiAgICApO1xuICB9XG5cbiAgZ2V0IGxpbmtTZW5kRmFpbFVSTCgpIHtcbiAgICByZXR1cm4gdGhpcy5jdXN0b21QYWdlcy5saW5rU2VuZEZhaWwgfHwgYCR7dGhpcy5wdWJsaWNTZXJ2ZXJVUkx9L2FwcHMvbGlua19zZW5kX2ZhaWwuaHRtbGA7XG4gIH1cblxuICBnZXQgdmVyaWZ5RW1haWxTdWNjZXNzVVJMKCkge1xuICAgIHJldHVybiAoXG4gICAgICB0aGlzLmN1c3RvbVBhZ2VzLnZlcmlmeUVtYWlsU3VjY2VzcyB8fFxuICAgICAgYCR7dGhpcy5wdWJsaWNTZXJ2ZXJVUkx9L2FwcHMvdmVyaWZ5X2VtYWlsX3N1Y2Nlc3MuaHRtbGBcbiAgICApO1xuICB9XG5cbiAgZ2V0IGNob29zZVBhc3N3b3JkVVJMKCkge1xuICAgIHJldHVybiB0aGlzLmN1c3RvbVBhZ2VzLmNob29zZVBhc3N3b3JkIHx8IGAke3RoaXMucHVibGljU2VydmVyVVJMfS9hcHBzL2Nob29zZV9wYXNzd29yZGA7XG4gIH1cblxuICBnZXQgcmVxdWVzdFJlc2V0UGFzc3dvcmRVUkwoKSB7XG4gICAgcmV0dXJuIGAke3RoaXMucHVibGljU2VydmVyVVJMfS8ke3RoaXMucGFnZXNFbmRwb2ludH0vJHt0aGlzLmFwcGxpY2F0aW9uSWR9L3JlcXVlc3RfcGFzc3dvcmRfcmVzZXRgO1xuICB9XG5cbiAgZ2V0IHBhc3N3b3JkUmVzZXRTdWNjZXNzVVJMKCkge1xuICAgIHJldHVybiAoXG4gICAgICB0aGlzLmN1c3RvbVBhZ2VzLnBhc3N3b3JkUmVzZXRTdWNjZXNzIHx8XG4gICAgICBgJHt0aGlzLnB1YmxpY1NlcnZlclVSTH0vYXBwcy9wYXNzd29yZF9yZXNldF9zdWNjZXNzLmh0bWxgXG4gICAgKTtcbiAgfVxuXG4gIGdldCBwYXJzZUZyYW1lVVJMKCkge1xuICAgIHJldHVybiB0aGlzLmN1c3RvbVBhZ2VzLnBhcnNlRnJhbWVVUkw7XG4gIH1cblxuICBnZXQgdmVyaWZ5RW1haWxVUkwoKSB7XG4gICAgcmV0dXJuIGAke3RoaXMucHVibGljU2VydmVyVVJMfS8ke3RoaXMucGFnZXNFbmRwb2ludH0vJHt0aGlzLmFwcGxpY2F0aW9uSWR9L3ZlcmlmeV9lbWFpbGA7XG4gIH1cblxuICAvLyBUT0RPOiBSZW1vdmUgdGhpcyBmdW5jdGlvbiBvbmNlIFBhZ2VzUm91dGVyIHJlcGxhY2VzIHRoZSBQdWJsaWNBUElSb3V0ZXI7XG4gIC8vIHRoZSAoZGVmYXVsdCkgZW5kcG9pbnQgaGFzIHRvIGJlIGRlZmluZWQgaW4gUGFnZXNSb3V0ZXIgb25seS5cbiAgZ2V0IHBhZ2VzRW5kcG9pbnQoKSB7XG4gICAgcmV0dXJuIHRoaXMucGFnZXMgJiYgdGhpcy5wYWdlcy5lbmFibGVSb3V0ZXIgJiYgdGhpcy5wYWdlcy5wYWdlc0VuZHBvaW50XG4gICAgICA/IHRoaXMucGFnZXMucGFnZXNFbmRwb2ludFxuICAgICAgOiAnYXBwcyc7XG4gIH1cbn1cblxuZXhwb3J0IGRlZmF1bHQgQ29uZmlnO1xubW9kdWxlLmV4cG9ydHMgPSBDb25maWc7XG4iXSwibWFwcGluZ3MiOiI7Ozs7OztBQUlBLElBQUFBLE1BQUEsR0FBQUMsc0JBQUEsQ0FBQUMsT0FBQTtBQUNBLElBQUFDLG1CQUFBLEdBQUFGLHNCQUFBLENBQUFDLE9BQUE7QUFDQSxJQUFBRSxJQUFBLEdBQUFILHNCQUFBLENBQUFDLE9BQUE7QUFDQSxJQUFBRyxZQUFBLEdBQUFILE9BQUE7QUFRQSxJQUFBSSxPQUFBLEdBQUFKLE9BQUE7QUFBNkMsU0FBQUQsdUJBQUFNLEdBQUEsV0FBQUEsR0FBQSxJQUFBQSxHQUFBLENBQUFDLFVBQUEsR0FBQUQsR0FBQSxLQUFBRSxPQUFBLEVBQUFGLEdBQUE7QUFmN0M7QUFDQTtBQUNBOztBQWVBLFNBQVNHLG1CQUFtQkEsQ0FBQ0MsR0FBRyxFQUFFO0VBQ2hDLElBQUksQ0FBQ0EsR0FBRyxFQUFFO0lBQ1IsT0FBT0EsR0FBRztFQUNaO0VBQ0EsSUFBSUEsR0FBRyxDQUFDQyxRQUFRLENBQUMsR0FBRyxDQUFDLEVBQUU7SUFDckJELEdBQUcs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