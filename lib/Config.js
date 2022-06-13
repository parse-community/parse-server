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
//# sourceMappingURL=data:application/json;charset=utf-8;base64,eyJ2ZXJzaW9uIjozLCJzb3VyY2VzIjpbIi4uL3NyYy9Db25maWcuanMiXSwibmFtZXMiOlsicmVtb3ZlVHJhaWxpbmdTbGFzaCIsInN0ciIsImVuZHNXaXRoIiwic3Vic3RyIiwibGVuZ3RoIiwiQ29uZmlnIiwiZ2V0IiwiYXBwbGljYXRpb25JZCIsIm1vdW50IiwiY2FjaGVJbmZvIiwiQXBwQ2FjaGUiLCJjb25maWciLCJPYmplY3QiLCJrZXlzIiwiZm9yRWFjaCIsImtleSIsImRhdGFiYXNlIiwiRGF0YWJhc2VDb250cm9sbGVyIiwiZGF0YWJhc2VDb250cm9sbGVyIiwiYWRhcHRlciIsImdlbmVyYXRlU2Vzc2lvbkV4cGlyZXNBdCIsImJpbmQiLCJnZW5lcmF0ZUVtYWlsVmVyaWZ5VG9rZW5FeHBpcmVzQXQiLCJwdXQiLCJzZXJ2ZXJDb25maWd1cmF0aW9uIiwidmFsaWRhdGUiLCJhcHBJZCIsInNldHVwUGFzc3dvcmRWYWxpZGF0b3IiLCJwYXNzd29yZFBvbGljeSIsInZlcmlmeVVzZXJFbWFpbHMiLCJ1c2VyQ29udHJvbGxlciIsImFwcE5hbWUiLCJwdWJsaWNTZXJ2ZXJVUkwiLCJyZXZva2VTZXNzaW9uT25QYXNzd29yZFJlc2V0IiwiZXhwaXJlSW5hY3RpdmVTZXNzaW9ucyIsInNlc3Npb25MZW5ndGgiLCJtYXhMaW1pdCIsImVtYWlsVmVyaWZ5VG9rZW5WYWxpZGl0eUR1cmF0aW9uIiwiYWNjb3VudExvY2tvdXQiLCJtYXN0ZXJLZXlJcHMiLCJtYXN0ZXJLZXkiLCJyZWFkT25seU1hc3RlcktleSIsImFsbG93SGVhZGVycyIsImlkZW1wb3RlbmN5T3B0aW9ucyIsImVtYWlsVmVyaWZ5VG9rZW5SZXVzZUlmVmFsaWQiLCJmaWxlVXBsb2FkIiwicGFnZXMiLCJzZWN1cml0eSIsImVuZm9yY2VQcml2YXRlVXNlcnMiLCJzY2hlbWEiLCJyZXF1ZXN0S2V5d29yZERlbnlsaXN0IiwiYWxsb3dFeHBpcmVkQXV0aERhdGFUb2tlbiIsIkVycm9yIiwiZW1haWxBZGFwdGVyIiwidmFsaWRhdGVFbWFpbENvbmZpZ3VyYXRpb24iLCJ2YWxpZGF0ZUFjY291bnRMb2Nrb3V0UG9saWN5IiwidmFsaWRhdGVQYXNzd29yZFBvbGljeSIsInZhbGlkYXRlRmlsZVVwbG9hZE9wdGlvbnMiLCJzdGFydHNXaXRoIiwidmFsaWRhdGVTZXNzaW9uQ29uZmlndXJhdGlvbiIsInZhbGlkYXRlTWFzdGVyS2V5SXBzIiwidmFsaWRhdGVNYXhMaW1pdCIsInZhbGlkYXRlQWxsb3dIZWFkZXJzIiwidmFsaWRhdGVJZGVtcG90ZW5jeU9wdGlvbnMiLCJ2YWxpZGF0ZVBhZ2VzT3B0aW9ucyIsInZhbGlkYXRlU2VjdXJpdHlPcHRpb25zIiwidmFsaWRhdGVTY2hlbWFPcHRpb25zIiwidmFsaWRhdGVFbmZvcmNlUHJpdmF0ZVVzZXJzIiwidmFsaWRhdGVBbGxvd0V4cGlyZWRBdXRoRGF0YVRva2VuIiwidmFsaWRhdGVSZXF1ZXN0S2V5d29yZERlbnlsaXN0IiwidW5kZWZpbmVkIiwiZGVmYXVsdCIsIkFycmF5IiwiaXNBcnJheSIsInByb3RvdHlwZSIsInRvU3RyaW5nIiwiY2FsbCIsImVuYWJsZUNoZWNrIiwiU2VjdXJpdHlPcHRpb25zIiwiZW5hYmxlQ2hlY2tMb2ciLCJkZWZpbml0aW9ucyIsIlNjaGVtYU9wdGlvbnMiLCJzdHJpY3QiLCJkZWxldGVFeHRyYUZpZWxkcyIsInJlY3JlYXRlTW9kaWZpZWRGaWVsZHMiLCJsb2NrU2NoZW1hcyIsImJlZm9yZU1pZ3JhdGlvbiIsImFmdGVyTWlncmF0aW9uIiwiZW5hYmxlUm91dGVyIiwiUGFnZXNPcHRpb25zIiwiZW5hYmxlTG9jYWxpemF0aW9uIiwibG9jYWxpemF0aW9uSnNvblBhdGgiLCJsb2NhbGl6YXRpb25GYWxsYmFja0xvY2FsZSIsInBsYWNlaG9sZGVycyIsImZvcmNlUmVkaXJlY3QiLCJwYWdlc1BhdGgiLCJwYWdlc0VuZHBvaW50IiwiY3VzdG9tVXJscyIsImN1c3RvbVJvdXRlcyIsInR0bCIsIklkZW1wb3RlbmN5T3B0aW9ucyIsImlzTmFOIiwicGF0aHMiLCJkdXJhdGlvbiIsIk51bWJlciIsImlzSW50ZWdlciIsInRocmVzaG9sZCIsInVubG9ja09uUGFzc3dvcmRSZXNldCIsIkFjY291bnRMb2Nrb3V0T3B0aW9ucyIsIm1heFBhc3N3b3JkQWdlIiwicmVzZXRUb2tlblZhbGlkaXR5RHVyYXRpb24iLCJ2YWxpZGF0b3JQYXR0ZXJuIiwiUmVnRXhwIiwidmFsaWRhdG9yQ2FsbGJhY2siLCJkb05vdEFsbG93VXNlcm5hbWUiLCJtYXhQYXNzd29yZEhpc3RvcnkiLCJyZXNldFRva2VuUmV1c2VJZlZhbGlkIiwicGF0dGVyblZhbGlkYXRvciIsInZhbHVlIiwidGVzdCIsImUiLCJSZWZlcmVuY2VFcnJvciIsImVuYWJsZUZvckFub255bW91c1VzZXIiLCJGaWxlVXBsb2FkT3B0aW9ucyIsImVuYWJsZUZvclB1YmxpYyIsImVuYWJsZUZvckF1dGhlbnRpY2F0ZWRVc2VyIiwiaXAiLCJuZXQiLCJpc0lQIiwiX21vdW50IiwibmV3VmFsdWUiLCJpbmNsdWRlcyIsImhlYWRlciIsInRyaW0iLCJub3ciLCJEYXRlIiwiZ2V0VGltZSIsImdlbmVyYXRlUGFzc3dvcmRSZXNldFRva2VuRXhwaXJlc0F0IiwiaW52YWxpZExpbmtVUkwiLCJjdXN0b21QYWdlcyIsImludmFsaWRMaW5rIiwiaW52YWxpZFZlcmlmaWNhdGlvbkxpbmtVUkwiLCJpbnZhbGlkVmVyaWZpY2F0aW9uTGluayIsImxpbmtTZW5kU3VjY2Vzc1VSTCIsImxpbmtTZW5kU3VjY2VzcyIsImxpbmtTZW5kRmFpbFVSTCIsImxpbmtTZW5kRmFpbCIsInZlcmlmeUVtYWlsU3VjY2Vzc1VSTCIsInZlcmlmeUVtYWlsU3VjY2VzcyIsImNob29zZVBhc3N3b3JkVVJMIiwiY2hvb3NlUGFzc3dvcmQiLCJyZXF1ZXN0UmVzZXRQYXNzd29yZFVSTCIsInBhc3N3b3JkUmVzZXRTdWNjZXNzVVJMIiwicGFzc3dvcmRSZXNldFN1Y2Nlc3MiLCJwYXJzZUZyYW1lVVJMIiwidmVyaWZ5RW1haWxVUkwiLCJtb2R1bGUiLCJleHBvcnRz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QUFiMEgsYUFBYSxHQUFHO0FBQ2xCLFdBQU8sS0FBS2YsV0FBTCxDQUFpQmUsYUFBeEI7QUFDRDs7QUFFaUIsTUFBZEMsY0FBYyxHQUFHO0FBQ25CLFdBQVEsR0FBRSxLQUFLM0gsZUFBZ0IsSUFBRyxLQUFLZ0UsYUFBYyxJQUFHLEtBQUt6RixhQUFjLGVBQTNFO0FBQ0QsR0FuaEJpQixDQXFoQmxCO0FBQ0E7OztBQUNpQixNQUFieUYsYUFBYSxHQUFHO0FBQ2xCLFdBQU8sS0FBS2xELEtBQUwsSUFBYyxLQUFLQSxLQUFMLENBQVcwQyxZQUF6QixJQUF5QyxLQUFLMUMsS0FBTCxDQUFXa0QsYUFBcEQsR0FDSCxLQUFLbEQsS0FBTCxDQUFXa0QsYUFEUixHQUVILE1BRko7QUFHRDs7QUEzaEJpQjs7O2VBOGhCTDNGLE07O0FBQ2Z1SixNQUFNLENBQUNDLE9BQVAsR0FBaUJ4SixNQUFqQiIsInNvdXJjZXNDb250ZW50IjpbIi8vIEEgQ29uZmlnIG9iamVjdCBwcm92aWRlcyBpbmZvcm1hdGlvbiBhYm91dCBob3cgYSBzcGVjaWZpYyBhcHAgaXNcbi8vIGNvbmZpZ3VyZWQuXG4vLyBtb3VudCBpcyB0aGUgVVJMIGZvciB0aGUgcm9vdCBvZiB0aGUgQVBJOyBpbmNsdWRlcyBodHRwLCBkb21haW4sIGV0Yy5cblxuaW1wb3J0IEFwcENhY2hlIGZyb20gJy4vY2FjaGUnO1xuaW1wb3J0IERhdGFiYXNlQ29udHJvbGxlciBmcm9tICcuL0NvbnRyb2xsZXJzL0RhdGFiYXNlQ29udHJvbGxlcic7XG5pbXBvcnQgbmV0IGZyb20gJ25ldCc7XG5pbXBvcnQge1xuICBJZGVtcG90ZW5jeU9wdGlvbnMsXG4gIEZpbGVVcGxvYWRPcHRpb25zLFxuICBBY2NvdW50TG9ja291dE9wdGlvbnMsXG4gIFBhZ2VzT3B0aW9ucyxcbiAgU2VjdXJpdHlPcHRpb25zLFxuICBTY2hlbWFPcHRpb25zLFxufSBmcm9tICcuL09wdGlvbnMvRGVmaW5pdGlvbnMnO1xuaW1wb3J0IHsgaXNCb29sZWFuLCBpc1N0cmluZyB9IGZyb20gJ2xvZGFzaCc7XG5cbmZ1bmN0aW9uIHJlbW92ZVRyYWlsaW5nU2xhc2goc3RyKSB7XG4gIGlmICghc3RyKSB7XG4gICAgcmV0dXJuIHN0cjtcbiAgfVxuICBpZiAoc3RyLmVuZHNXaXRoKCcvJykpIHtcbiAgICBzdHIgPSBzdHIuc3Vic3RyKDAsIHN0ci5sZW5ndGggLSAxKTtcbiAgfVxuICByZXR1cm4gc3RyO1xufVxuXG5leHBvcnQgY2xhc3MgQ29uZmlnIHtcbiAgc3RhdGljIGdldChhcHBsaWNhdGlvbklkOiBzdHJpbmcsIG1vdW50OiBzdHJpbmcpIHtcbiAgICBjb25zdCBjYWNoZUluZm8gPSBBcHBDYWNoZS5nZXQoYXBwbGljYXRpb25JZCk7XG4gICAgaWYgKCFjYWNoZUluZm8pIHtcbiAgICAgIHJldHVybjtcbiAgICB9XG4gICAgY29uc3QgY29uZmlnID0gbmV3IENvbmZpZygpO1xuICAgIGNvbmZpZy5hcHBsaWNhdGlvbklkID0gYXBwbGljYXRpb25JZDtcbiAgICBPYmplY3Qua2V5cyhjYWNoZUluZm8pLmZvckVhY2goa2V5ID0+IHtcbiAgICAgIGlmIChrZXkgPT0gJ2RhdGFiYXNlQ29udHJvbGxlcicpIHtcbiAgICAgICAgY29uZmlnLmRhdGFiYXNlID0gbmV3IERhdGFiYXNlQ29udHJvbGxlcihjYWNoZUluZm8uZGF0YWJhc2VDb250cm9sbGVyLmFkYXB0ZXIsIGNvbmZpZyk7XG4gICAgICB9IGVsc2Uge1xuICAgICAgICBjb25maWdba2V5XSA9IGNhY2hlSW5mb1trZXldO1xuICAgICAgfVxuICAgIH0pO1xuICAgIGNvbmZpZy5tb3VudCA9IHJlbW92ZVRyYWlsaW5nU2xhc2gobW91bnQpO1xuICAgIGNvbmZpZy5nZW5lcmF0ZVNlc3Npb25FeHBpcmVzQXQgPSBjb25maWcuZ2VuZXJhdGVTZXNzaW9uRXhwaXJlc0F0LmJpbmQoY29uZmlnKTtcbiAgICBjb25maWcuZ2VuZXJhdGVFbWFpbFZlcmlmeVRva2VuRXhwaXJlc0F0ID0gY29uZmlnLmdlbmVyYXRlRW1haWxWZXJpZnlUb2tlbkV4cGlyZXNBdC5iaW5kKFxuICAgICAgY29uZmlnXG4gICAgKTtcbiAgICByZXR1cm4gY29uZmlnO1xuICB9XG5cbiAgc3RhdGljIHB1dChzZXJ2ZXJDb25maWd1cmF0aW9uKSB7XG4gICAgQ29uZmlnLnZhbGlkYXRlKHNlcnZlckNvbmZpZ3VyYXRpb24pO1xuICAgIEFwcENhY2hlLnB1dChzZXJ2ZXJDb25maWd1cmF0aW9uLmFwcElkLCBzZXJ2ZXJDb25maWd1cmF0aW9uKTtcbiAgICBDb25maWcuc2V0dXBQYXNzd29yZFZhbGlkYXRvcihzZXJ2ZXJDb25maWd1cmF0aW9uLnBhc3N3b3JkUG9saWN5KTtcbiAgICByZXR1cm4gc2VydmVyQ29uZmlndXJhdGlvbjtcbiAgfVxuXG4gIHN0YXRpYyB2YWxpZGF0ZSh7XG4gICAgdmVyaWZ5VXNlckVtYWlscyxcbiAgICB1c2VyQ29udHJvbGxlcixcbiAgICBhcHBOYW1lLFxuICAgIHB1YmxpY1NlcnZlclVSTCxcbiAgICByZXZva2VTZXNzaW9uT25QYXNzd29yZFJlc2V0LFxuICAgIGV4cGlyZUluYWN0aXZlU2Vzc2lvbnMsXG4gICAgc2Vzc2lvbkxlbmd0aCxcbiAgICBtYXhMaW1pdCxcbiAgICBlbWFpbFZlcmlmeVRva2VuVmFsaWRpdHlEdXJhdGlvbixcbiAgICBhY2NvdW50TG9ja291dCxcbiAgICBwYXNzd29yZFBvbGljeSxcbiAgICBtYXN0ZXJLZXlJcHMsXG4gICAgbWFzdGVyS2V5LFxuICAgIHJlYWRPbmx5TWFzdGVyS2V5LFxuICAgIGFsbG93SGVhZGVycyxcbiAgICBpZGVtcG90ZW5jeU9wdGlvbnMsXG4gICAgZW1haWxWZXJpZnlUb2tlblJldXNlSWZWYWxpZCxcbiAgICBmaWxlVXBsb2FkLFxuICAgIHBhZ2VzLFxuICAgIHNlY3VyaXR5LFxuICAgIGVuZm9yY2VQcml2YXRlVXNlcnMsXG4gICAgc2NoZW1hLFxuICAgIHJlcXVlc3RLZXl3b3JkRGVueWxpc3QsXG4gICAgYWxsb3dFeHBpcmVkQXV0aERhdGFUb2tlbixcbiAgfSkge1xuICAgIGlmIChtYXN0ZXJLZXkgPT09IHJlYWRPbmx5TWFzdGVyS2V5KSB7XG4gICAgICB0aHJvdyBuZXcgRXJyb3IoJ21hc3RlcktleSBhbmQgcmVhZE9ubHlNYXN0ZXJLZXkgc2hvdWxkIGJlIGRpZmZlcmVudCcpO1xuICAgIH1cblxuICAgIGNvbnN0IGVtYWlsQWRhcHRlciA9IHVzZXJDb250cm9sbGVyLmFkYXB0ZXI7XG4gICAgaWYgKHZlcmlmeVVzZXJFbWFpbHMpIHtcbiAgICAgIHRoaXMudmFsaWRhdGVFbWFpbENvbmZpZ3VyYXRpb24oe1xuICAgICAgICBlbWFpbEFkYXB0ZXIsXG4gICAgICAgIGFwcE5hbWUsXG4gICAgICAgIHB1YmxpY1NlcnZlclVSTCxcbiAgICAgICAgZW1haWxWZXJpZnlUb2tlblZhbGlkaXR5RHVyYXRpb24sXG4gICAgICAgIGVtYWlsVmVyaWZ5VG9rZW5SZXVzZUlmVmFsaWQsXG4gICAgICB9KTtcbiAgICB9XG5cbiAgICB0aGlzLnZhbGlkYXRlQWNjb3VudExvY2tvdXRQb2xpY3koYWNjb3VudExvY2tvdXQpO1xuICAgIHRoaXMudmFsaWRhdGVQYXNzd29yZFBvbGljeShwYXNzd29yZFBvbGljeSk7XG4gICAgdGhpcy52YWxpZGF0ZUZpbGVVcGxvYWRPcHRpb25zKGZpbGVVcGxvYWQpO1xuXG4gICAgaWYgKHR5cGVvZiByZXZva2VTZXNzaW9uT25QYXNzd29yZFJlc2V0ICE9PSAnYm9vbGVhbicpIHtcbiAgICAgIHRocm93ICdyZXZva2VTZXNzaW9uT25QYXNzd29yZFJlc2V0IG11c3QgYmUgYSBib29sZWFuIHZhbHVlJztcbiAgICB9XG5cbiAgICBpZiAocHVibGljU2VydmVyVVJMKSB7XG4gICAgICBpZiAoIXB1YmxpY1NlcnZlclVSTC5zdGFydHNXaXRoKCdodHRwOi8vJykgJiYgIXB1YmxpY1NlcnZlclVSTC5zdGFydHNXaXRoKCdodHRwczovLycpKSB7XG4gICAgICAgIHRocm93ICdwdWJsaWNTZXJ2ZXJVUkwgc2hvdWxkIGJlIGEgdmFsaWQgSFRUUFMgVVJMIHN0YXJ0aW5nIHdpdGggaHR0cHM6Ly8nO1xuICAgICAgfVxuICAgIH1cbiAgICB0aGlzLnZhbGlkYXRlU2Vzc2lvbkNvbmZpZ3VyYXRpb24oc2Vzc2lvbkxlbmd0aCwgZXhwaXJlSW5hY3RpdmVTZXNzaW9ucyk7XG4gICAgdGhpcy52YWxpZGF0ZU1hc3RlcktleUlwcyhtYXN0ZXJLZXlJcHMpO1xuICAgIHRoaXMudmFsaWRhdGVNYXhMaW1pdChtYXhMaW1pdCk7XG4gICAgdGhpcy52YWxpZGF0ZUFsbG93SGVhZGVycyhhbGxvd0hlYWRlcnMpO1xuICAgIHRoaXMudmFsaWRhdGVJZGVtcG90ZW5jeU9wdGlvbnMoaWRlbXBvdGVuY3lPcHRpb25zKTtcbiAgICB0aGlzLnZhbGlkYXRlUGFnZXNPcHRpb25zKHBhZ2VzKTtcbiAgICB0aGlzLnZhbGlkYXRlU2VjdXJpdHlPcHRpb25zKHNlY3VyaXR5KTtcbiAgICB0aGlzLnZhbGlkYXRlU2NoZW1hT3B0aW9ucyhzY2hlbWEpO1xuICAgIHRoaXMudmFsaWRhdGVFbmZvcmNlUHJpdmF0ZVVzZXJzKGVuZm9yY2VQcml2YXRlVXNlcnMpO1xuICAgIHRoaXMudmFsaWRhdGVBbGxvd0V4cGlyZWRBdXRoRGF0YVRva2VuKGFsbG93RXhwaXJlZEF1dGhEYXRhVG9rZW4pO1xuICAgIHRoaXMudmFsaWRhdGVSZXF1ZXN0S2V5d29yZERlbnlsaXN0KHJlcXVlc3RLZXl3b3JkRGVueWxpc3QpO1xuICB9XG5cbiAgc3RhdGljIHZhbGlkYXRlUmVxdWVzdEtleXdvcmREZW55bGlzdChyZXF1ZXN0S2V5d29yZERlbnlsaXN0KSB7XG4gICAgaWYgKHJlcXVlc3RLZXl3b3JkRGVueWxpc3QgPT09IHVuZGVmaW5lZCkge1xuICAgICAgcmVxdWVzdEtleXdvcmREZW55bGlzdCA9IHJlcXVlc3RLZXl3b3JkRGVueWxpc3QuZGVmYXVsdDtcbiAgICB9IGVsc2UgaWYgKCFBcnJheS5pc0FycmF5KHJlcXVlc3RLZXl3b3JkRGVueWxpc3QpKSB7XG4gICAgICB0aHJvdyAnUGFyc2UgU2VydmVyIG9wdGlvbiByZXF1ZXN0S2V5d29yZERlbnlsaXN0IG11c3QgYmUgYW4gYXJyYXkuJztcbiAgICB9XG4gIH1cblxuICBzdGF0aWMgdmFsaWRhdGVFbmZvcmNlUHJpdmF0ZVVzZXJzKGVuZm9yY2VQcml2YXRlVXNlcnMpIHtcbiAgICBpZiAodHlwZW9mIGVuZm9yY2VQcml2YXRlVXNlcnMgIT09ICdib29sZWFuJykge1xuICAgICAgdGhyb3cgJ1BhcnNlIFNlcnZlciBvcHRpb24gZW5mb3JjZVByaXZhdGVVc2VycyBtdXN0IGJlIGEgYm9vbGVhbi4nO1xuICAgIH1cbiAgfVxuXG4gIHN0YXRpYyB2YWxpZGF0ZUFsbG93RXhwaXJlZEF1dGhEYXRhVG9rZW4oYWxsb3dFeHBpcmVkQXV0aERhdGFUb2tlbikge1xuICAgIGlmICh0eXBlb2YgYWxsb3dFeHBpcmVkQXV0aERhdGFUb2tlbiAhPT0gJ2Jvb2xlYW4nKSB7XG4gICAgICB0aHJvdyAnUGFyc2UgU2VydmVyIG9wdGlvbiBhbGxvd0V4cGlyZWRBdXRoRGF0YVRva2VuIG11c3QgYmUgYSBib29sZWFuLic7XG4gICAgfVxuICB9XG5cbiAgc3RhdGljIHZhbGlkYXRlU2VjdXJpdHlPcHRpb25zKHNlY3VyaXR5KSB7XG4gICAgaWYgKE9iamVjdC5wcm90b3R5cGUudG9TdHJpbmcuY2FsbChzZWN1cml0eSkgIT09ICdbb2JqZWN0IE9iamVjdF0nKSB7XG4gICAgICB0aHJvdyAnUGFyc2UgU2VydmVyIG9wdGlvbiBzZWN1cml0eSBtdXN0IGJlIGFuIG9iamVjdC4nO1xuICAgIH1cbiAgICBpZiAoc2VjdXJpdHkuZW5hYmxlQ2hlY2sgPT09IHVuZGVmaW5lZCkge1xuICAgICAgc2VjdXJpdHkuZW5hYmxlQ2hlY2sgPSBTZWN1cml0eU9wdGlvbnMuZW5hYmxlQ2hlY2suZGVmYXVsdDtcbiAgICB9IGVsc2UgaWYgKCFpc0Jvb2xlYW4oc2VjdXJpdHkuZW5hYmxlQ2hlY2spKSB7XG4gICAgICB0aHJvdyAnUGFyc2UgU2VydmVyIG9wdGlvbiBzZWN1cml0eS5lbmFibGVDaGVjayBtdXN0IGJlIGEgYm9vbGVhbi4nO1xuICAgIH1cbiAgICBpZiAoc2VjdXJpdHkuZW5hYmxlQ2hlY2tMb2cgPT09IHVuZGVmaW5lZCkge1xuICAgICAgc2VjdXJpdHkuZW5hYmxlQ2hlY2tMb2cgPSBTZWN1cml0eU9wdGlvbnMuZW5hYmxlQ2hlY2tMb2cuZGVmYXVsdDtcbiAgICB9IGVsc2UgaWYgKCFpc0Jvb2xlYW4oc2VjdXJpdHkuZW5hYmxlQ2hlY2tMb2cpKSB7XG4gICAgICB0aHJvdyAnUGFyc2UgU2VydmVyIG9wdGlvbiBzZWN1cml0eS5lbmFibGVDaGVja0xvZyBtdXN0IGJlIGEgYm9vbGVhbi4nO1xuICAgIH1cbiAgfVxuXG4gIHN0YXRpYyB2YWxpZGF0ZVNjaGVtYU9wdGlvbnMoc2NoZW1hOiBTY2hlbWFPcHRpb25zKSB7XG4gICAgaWYgKCFzY2hlbWEpIHJldHVybjtcbiAgICBpZiAoT2JqZWN0LnByb3RvdHlwZS50b1N0cmluZy5jYWxsKHNjaGVtYSkgIT09ICdbb2JqZWN0IE9iamVjdF0nKSB7XG4gICAgICB0aHJvdyAnUGFyc2UgU2VydmVyIG9wdGlvbiBzY2hlbWEgbXVzdCBiZSBhbiBvYmplY3QuJztcbiAgICB9XG4gICAgaWYgKHNjaGVtYS5kZWZpbml0aW9ucyA9PT0gdW5kZWZpbmVkKSB7XG4gICAgICBzY2hlbWEuZGVmaW5pdGlvbnMgPSBTY2hlbWFPcHRpb25zLmRlZmluaXRpb25zLmRlZmF1bHQ7XG4gICAgfSBlbHNlIGlmICghQXJyYXkuaXNBcnJheShzY2hlbWEuZGVmaW5pdGlvbnMpKSB7XG4gICAgICB0aHJvdyAnUGFyc2UgU2VydmVyIG9wdGlvbiBzY2hlbWEuZGVmaW5pdGlvbnMgbXVzdCBiZSBhbiBhcnJheS4nO1xuICAgIH1cbiAgICBpZiAoc2NoZW1hLnN0cmljdCA9PT0gdW5kZWZpbmVkKSB7XG4gICAgICBzY2hlbWEuc3RyaWN0ID0gU2NoZW1hT3B0aW9ucy5zdHJpY3QuZGVmYXVsdDtcbiAgICB9IGVsc2UgaWYgKCFpc0Jvb2xlYW4oc2NoZW1hLnN0cmljdCkpIHtcbiAgICAgIHRocm93ICdQYXJzZSBTZXJ2ZXIgb3B0aW9uIHNjaGVtYS5zdHJpY3QgbXVzdCBiZSBhIGJvb2xlYW4uJztcbiAgICB9XG4gICAgaWYgKHNjaGVtYS5kZWxldGVFeHRyYUZpZWxkcyA9PT0gdW5kZWZpbmVkKSB7XG4gICAgICBzY2hlbWEuZGVsZXRlRXh0cmFGaWVsZHMgPSBTY2hlbWFPcHRpb25zLmRlbGV0ZUV4dHJhRmllbGRzLmRlZmF1bHQ7XG4gICAgfSBlbHNlIGlmICghaXNCb29sZWFuKHNjaGVtYS5kZWxldGVFeHRyYUZpZWxkcykpIHtcbiAgICAgIHRocm93ICdQYXJzZSBTZXJ2ZXIgb3B0aW9uIHNjaGVtYS5kZWxldGVFeHRyYUZpZWxkcyBtdXN0IGJlIGEgYm9vbGVhbi4nO1xuICAgIH1cbiAgICBpZiAoc2NoZW1hLnJlY3JlYXRlTW9kaWZpZWRGaWVsZHMgPT09IHVuZGVmaW5lZCkge1xuICAgICAgc2NoZW1hLnJlY3JlYXRlTW9kaWZpZWRGaWVsZHMgPSBTY2hlbWFPcHRpb25zLnJlY3JlYXRlTW9kaWZpZWRGaWVsZHMuZGVmYXVsdDtcbiAgICB9IGVsc2UgaWYgKCFpc0Jvb2xlYW4oc2NoZW1hLnJlY3JlYXRlTW9kaWZpZWRGaWVsZHMpKSB7XG4gICAgICB0aHJvdyAnUGFyc2UgU2VydmVyIG9wdGlvbiBzY2hlbWEucmVjcmVhdGVNb2RpZmllZEZpZWxkcyBtdXN0IGJlIGEgYm9vbGVhbi4nO1xuICAgIH1cbiAgICBpZiAoc2NoZW1hLmxvY2tTY2hlbWFzID09PSB1bmRlZmluZWQpIHtcbiAgICAgIHNjaGVtYS5sb2NrU2NoZW1hcyA9IFNjaGVtYU9wdGlvbnMubG9ja1NjaGVtYXMuZGVmYXVsdDtcbiAgICB9IGVsc2UgaWYgKCFpc0Jvb2xlYW4oc2NoZW1hLmxvY2tTY2hlbWFzKSkge1xuICAgICAgdGhyb3cgJ1BhcnNlIFNlcnZlciBvcHRpb24gc2NoZW1hLmxvY2tTY2hlbWFzIG11c3QgYmUgYSBib29sZWFuLic7XG4gICAgfVxuICAgIGlmIChzY2hlbWEuYmVmb3JlTWlncmF0aW9uID09PSB1bmRlZmluZWQpIHtcbiAgICAgIHNjaGVtYS5iZWZvcmVNaWdyYXRpb24gPSBudWxsO1xuICAgIH0gZWxzZSBpZiAoc2NoZW1hLmJlZm9yZU1pZ3JhdGlvbiAhPT0gbnVsbCAmJiB0eXBlb2Ygc2NoZW1hLmJlZm9yZU1pZ3JhdGlvbiAhPT0gJ2Z1bmN0aW9uJykge1xuICAgICAgdGhyb3cgJ1BhcnNlIFNlcnZlciBvcHRpb24gc2NoZW1hLmJlZm9yZU1pZ3JhdGlvbiBtdXN0IGJlIGEgZnVuY3Rpb24uJztcbiAgICB9XG4gICAgaWYgKHNjaGVtYS5hZnRlck1pZ3JhdGlvbiA9PT0gdW5kZWZpbmVkKSB7XG4gICAgICBzY2hlbWEuYWZ0ZXJNaWdyYXRpb24gPSBudWxsO1xuICAgIH0gZWxzZSBpZiAoc2NoZW1hLmFmdGVyTWlncmF0aW9uICE9PSBudWxsICYmIHR5cGVvZiBzY2hlbWEuYWZ0ZXJNaWdyYXRpb24gIT09ICdmdW5jdGlvbicpIHtcbiAgICAgIHRocm93ICdQYXJzZSBTZXJ2ZXIgb3B0aW9uIHNjaGVtYS5hZnRlck1pZ3JhdGlvbiBtdXN0IGJlIGEgZnVuY3Rpb24uJztcbiAgICB9XG4gIH1cblxuICBzdGF0aWMgdmFsaWRhdGVQYWdlc09wdGlvbnMocGFnZXMpIHtcbiAgICBpZiAoT2JqZWN0LnByb3RvdHlwZS50b1N0cmluZy5jYWxsKHBhZ2VzKSAhPT0gJ1tvYmplY3QgT2JqZWN0XScpIHtcbiAgICAgIHRocm93ICdQYXJzZSBTZXJ2ZXIgb3B0aW9uIHBhZ2VzIG11c3QgYmUgYW4gb2JqZWN0Lic7XG4gICAgfVxuICAgIGlmIChwYWdlcy5lbmFibGVSb3V0ZXIgPT09IHVuZGVmaW5lZCkge1xuICAgICAgcGFnZXMuZW5hYmxlUm91dGVyID0gUGFnZXNPcHRpb25zLmVuYWJsZVJvdXRlci5kZWZhdWx0O1xuICAgIH0gZWxzZSBpZiAoIWlzQm9vbGVhbihwYWdlcy5lbmFibGVSb3V0ZXIpKSB7XG4gICAgICB0aHJvdyAnUGFyc2UgU2VydmVyIG9wdGlvbiBwYWdlcy5lbmFibGVSb3V0ZXIgbXVzdCBiZSBhIGJvb2xlYW4uJztcbiAgICB9XG4gICAgaWYgKHBhZ2VzLmVuYWJsZUxvY2FsaXphdGlvbiA9PT0gdW5kZWZpbmVkKSB7XG4gICAgICBwYWdlcy5lbmFibGVMb2NhbGl6YXRpb24gPSBQYWdlc09wdGlvbnMuZW5hYmxlTG9jYWxpemF0aW9uLmRlZmF1bHQ7XG4gICAgfSBlbHNlIGlmICghaXNCb29sZWFuKHBhZ2VzLmVuYWJsZUxvY2FsaXphdGlvbikpIHtcbiAgICAgIHRocm93ICdQYXJzZSBTZXJ2ZXIgb3B0aW9uIHBhZ2VzLmVuYWJsZUxvY2FsaXphdGlvbiBtdXN0IGJlIGEgYm9vbGVhbi4nO1xuICAgIH1cbiAgICBpZiAocGFnZXMubG9jYWxpemF0aW9uSnNvblBhdGggPT09IHVuZGVmaW5lZCkge1xuICAgICAgcGFnZXMubG9jYWxpemF0aW9uSnNvblBhdGggPSBQYWdlc09wdGlvbnMubG9jYWxpemF0aW9uSnNvblBhdGguZGVmYXVsdDtcbiAgICB9IGVsc2UgaWYgKCFpc1N0cmluZyhwYWdlcy5sb2NhbGl6YXRpb25Kc29uUGF0aCkpIHtcbiAgICAgIHRocm93ICdQYXJzZSBTZXJ2ZXIgb3B0aW9uIHBhZ2VzLmxvY2FsaXphdGlvbkpzb25QYXRoIG11c3QgYmUgYSBzdHJpbmcuJztcbiAgICB9XG4gICAgaWYgKHBhZ2VzLmxvY2FsaXphdGlvbkZhbGxiYWNrTG9jYWxlID09PSB1bmRlZmluZWQpIHtcbiAgICAgIHBhZ2VzLmxvY2FsaXphdGlvbkZhbGxiYWNrTG9jYWxlID0gUGFnZXNPcHRpb25zLmxvY2FsaXphdGlvbkZhbGxiYWNrTG9jYWxlLmRlZmF1bHQ7XG4gICAgfSBlbHNlIGlmICghaXNTdHJpbmcocGFnZXMubG9jYWxpemF0aW9uRmFsbGJhY2tMb2NhbGUpKSB7XG4gICAgICB0aHJvdyAnUGFyc2UgU2VydmVyIG9wdGlvbiBwYWdlcy5sb2NhbGl6YXRpb25GYWxsYmFja0xvY2FsZSBtdXN0IGJlIGEgc3RyaW5nLic7XG4gICAgfVxuICAgIGlmIChwYWdlcy5wbGFjZWhvbGRlcnMgPT09IHVuZGVmaW5lZCkge1xuICAgICAgcGFnZXMucGxhY2Vob2xkZXJzID0gUGFnZXNPcHRpb25zLnBsYWNlaG9sZGVycy5kZWZhdWx0O1xuICAgIH0gZWxzZSBpZiAoXG4gICAgICBPYmplY3QucHJvdG90eXBlLnRvU3RyaW5nLmNhbGwocGFnZXMucGxhY2Vob2xkZXJzKSAhPT0gJ1tvYmplY3QgT2JqZWN0XScgJiZcbiAgICAgIHR5cGVvZiBwYWdlcy5wbGFjZWhvbGRlcnMgIT09ICdmdW5jdGlvbidcbiAgICApIHtcbiAgICAgIHRocm93ICdQYXJzZSBTZXJ2ZXIgb3B0aW9uIHBhZ2VzLnBsYWNlaG9sZGVycyBtdXN0IGJlIGFuIG9iamVjdCBvciBhIGZ1bmN0aW9uLic7XG4gICAgfVxuICAgIGlmIChwYWdlcy5mb3JjZVJlZGlyZWN0ID09PSB1bmRlZmluZWQpIHtcbiAgICAgIHBhZ2VzLmZvcmNlUmVkaXJlY3QgPSBQYWdlc09wdGlvbnMuZm9yY2VSZWRpcmVjdC5kZWZhdWx0O1xuICAgIH0gZWxzZSBpZiAoIWlzQm9vbGVhbihwYWdlcy5mb3JjZVJlZGlyZWN0KSkge1xuICAgICAgdGhyb3cgJ1BhcnNlIFNlcnZlciBvcHRpb24gcGFnZXMuZm9yY2VSZWRpcmVjdCBtdXN0IGJlIGEgYm9vbGVhbi4nO1xuICAgIH1cbiAgICBpZiAocGFnZXMucGFnZXNQYXRoID09PSB1bmRlZmluZWQpIHtcbiAgICAgIHBhZ2VzLnBhZ2VzUGF0aCA9IFBhZ2VzT3B0aW9ucy5wYWdlc1BhdGguZGVmYXVsdDtcbiAgICB9IGVsc2UgaWYgKCFpc1N0cmluZyhwYWdlcy5wYWdlc1BhdGgpKSB7XG4gICAgICB0aHJvdyAnUGFyc2UgU2VydmVyIG9wdGlvbiBwYWdlcy5wYWdlc1BhdGggbXVzdCBiZSBhIHN0cmluZy4nO1xuICAgIH1cbiAgICBpZiAocGFnZXMucGFnZXNFbmRwb2ludCA9PT0gdW5kZWZpbmVkKSB7XG4gICAgICBwYWdlcy5wYWdlc0VuZHBvaW50ID0gUGFnZXNPcHRpb25zLnBhZ2VzRW5kcG9pbnQuZGVmYXVsdDtcbiAgICB9IGVsc2UgaWYgKCFpc1N0cmluZyhwYWdlcy5wYWdlc0VuZHBvaW50KSkge1xuICAgICAgdGhyb3cgJ1BhcnNlIFNlcnZlciBvcHRpb24gcGFnZXMucGFnZXNFbmRwb2ludCBtdXN0IGJlIGEgc3RyaW5nLic7XG4gICAgfVxuICAgIGlmIChwYWdlcy5jdXN0b21VcmxzID09PSB1bmRlZmluZWQpIHtcbiAgICAgIHBhZ2VzLmN1c3RvbVVybHMgPSBQYWdlc09wdGlvbnMuY3VzdG9tVXJscy5kZWZhdWx0O1xuICAgIH0gZWxzZSBpZiAoT2JqZWN0LnByb3RvdHlwZS50b1N0cmluZy5jYWxsKHBhZ2VzLmN1c3RvbVVybHMpICE9PSAnW29iamVjdCBPYmplY3RdJykge1xuICAgICAgdGhyb3cgJ1BhcnNlIFNlcnZlciBvcHRpb24gcGFnZXMuY3VzdG9tVXJscyBtdXN0IGJlIGFuIG9iamVjdC4nO1xuICAgIH1cbiAgICBpZiAocGFnZXMuY3VzdG9tUm91dGVzID09PSB1bmRlZmluZWQpIHtcbiAgICAgIHBhZ2VzLmN1c3RvbVJvdXRlcyA9IFBhZ2VzT3B0aW9ucy5jdXN0b21Sb3V0ZXMuZGVmYXVsdDtcbiAgICB9IGVsc2UgaWYgKCEocGFnZXMuY3VzdG9tUm91dGVzIGluc3RhbmNlb2YgQXJyYXkpKSB7XG4gICAgICB0aHJvdyAnUGFyc2UgU2VydmVyIG9wdGlvbiBwYWdlcy5jdXN0b21Sb3V0ZXMgbXVzdCBiZSBhbiBhcnJheS4nO1xuICAgIH1cbiAgfVxuXG4gIHN0YXRpYyB2YWxpZGF0ZUlkZW1wb3RlbmN5T3B0aW9ucyhpZGVtcG90ZW5jeU9wdGlvbnMpIHtcbiAgICBpZiAoIWlkZW1wb3RlbmN5T3B0aW9ucykge1xuICAgICAgcmV0dXJuO1xuICAgIH1cbiAgICBpZiAoaWRlbXBvdGVuY3lPcHRpb25zLnR0bCA9PT0gdW5kZWZpbmVkKSB7XG4gICAgICBpZGVtcG90ZW5jeU9wdGlvbnMudHRsID0gSWRlbXBvdGVuY3lPcHRpb25zLnR0bC5kZWZhdWx0O1xuICAgIH0gZWxzZSBpZiAoIWlzTmFOKGlkZW1wb3RlbmN5T3B0aW9ucy50dGwpICYmIGlkZW1wb3RlbmN5T3B0aW9ucy50dGwgPD0gMCkge1xuICAgICAgdGhyb3cgJ2lkZW1wb3RlbmN5IFRUTCB2YWx1ZSBtdXN0IGJlIGdyZWF0ZXIgdGhhbiAwIHNlY29uZHMnO1xuICAgIH0gZWxzZSBpZiAoaXNOYU4oaWRlbXBvdGVuY3lPcHRpb25zLnR0bCkpIHtcbiAgICAgIHRocm93ICdpZGVtcG90ZW5jeSBUVEwgdmFsdWUgbXVzdCBiZSBhIG51bWJlcic7XG4gICAgfVxuICAgIGlmICghaWRlbXBvdGVuY3lPcHRpb25zLnBhdGhzKSB7XG4gICAgICBpZGVtcG90ZW5jeU9wdGlvbnMucGF0aHMgPSBJZGVtcG90ZW5jeU9wdGlvbnMucGF0aHMuZGVmYXVsdDtcbiAgICB9IGVsc2UgaWYgKCEoaWRlbXBvdGVuY3lPcHRpb25zLnBhdGhzIGluc3RhbmNlb2YgQXJyYXkpKSB7XG4gICAgICB0aHJvdyAnaWRlbXBvdGVuY3kgcGF0aHMgbXVzdCBiZSBvZiBhbiBhcnJheSBvZiBzdHJpbmdzJztcbiAgICB9XG4gIH1cblxuICBzdGF0aWMgdmFsaWRhdGVBY2NvdW50TG9ja291dFBvbGljeShhY2NvdW50TG9ja291dCkge1xuICAgIGlmIChhY2NvdW50TG9ja291dCkge1xuICAgICAgaWYgKFxuICAgICAgICB0eXBlb2YgYWNjb3VudExvY2tvdXQuZHVyYXRpb24gIT09ICdudW1iZXInIHx8XG4gICAgICAgIGFjY291bnRMb2Nrb3V0LmR1cmF0aW9uIDw9IDAgfHxcbiAgICAgICAgYWNjb3VudExvY2tvdXQuZHVyYXRpb24gPiA5OTk5OVxuICAgICAgKSB7XG4gICAgICAgIHRocm93ICdBY2NvdW50IGxvY2tvdXQgZHVyYXRpb24gc2hvdWxkIGJlIGdyZWF0ZXIgdGhhbiAwIGFuZCBsZXNzIHRoYW4gMTAwMDAwJztcbiAgICAgIH1cblxuICAgICAgaWYgKFxuICAgICAgICAhTnVtYmVyLmlzSW50ZWdlcihhY2NvdW50TG9ja291dC50aHJlc2hvbGQpIHx8XG4gICAgICAgIGFjY291bnRMb2Nrb3V0LnRocmVzaG9sZCA8IDEgfHxcbiAgICAgICAgYWNjb3VudExvY2tvdXQudGhyZXNob2xkID4gOTk5XG4gICAgICApIHtcbiAgICAgICAgdGhyb3cgJ0FjY291bnQgbG9ja291dCB0aHJlc2hvbGQgc2hvdWxkIGJlIGFuIGludGVnZXIgZ3JlYXRlciB0aGFuIDAgYW5kIGxlc3MgdGhhbiAxMDAwJztcbiAgICAgIH1cblxuICAgICAgaWYgKGFjY291bnRMb2Nrb3V0LnVubG9ja09uUGFzc3dvcmRSZXNldCA9PT0gdW5kZWZpbmVkKSB7XG4gICAgICAgIGFjY291bnRMb2Nrb3V0LnVubG9ja09uUGFzc3dvcmRSZXNldCA9IEFjY291bnRMb2Nrb3V0T3B0aW9ucy51bmxvY2tPblBhc3N3b3JkUmVzZXQuZGVmYXVsdDtcbiAgICAgIH0gZWxzZSBpZiAoIWlzQm9vbGVhbihhY2NvdW50TG9ja291dC51bmxvY2tPblBhc3N3b3JkUmVzZXQpKSB7XG4gICAgICAgIHRocm93ICdQYXJzZSBTZXJ2ZXIgb3B0aW9uIGFjY291bnRMb2Nrb3V0LnVubG9ja09uUGFzc3dvcmRSZXNldCBtdXN0IGJlIGEgYm9vbGVhbi4nO1xuICAgICAgfVxuICAgIH1cbiAgfVxuXG4gIHN0YXRpYyB2YWxpZGF0ZVBhc3N3b3JkUG9saWN5KHBhc3N3b3JkUG9saWN5KSB7XG4gICAgaWYgKHBhc3N3b3JkUG9saWN5KSB7XG4gICAgICBpZiAoXG4gICAgICAgIHBhc3N3b3JkUG9saWN5Lm1heFBhc3N3b3JkQWdlICE9PSB1bmRlZmluZWQgJiZcbiAgICAgICAgKHR5cGVvZiBwYXNzd29yZFBvbGljeS5tYXhQYXNzd29yZEFnZSAhPT0gJ251bWJlcicgfHwgcGFzc3dvcmRQb2xpY3kubWF4UGFzc3dvcmRBZ2UgPCAwKVxuICAgICAgKSB7XG4gICAgICAgIHRocm93ICdwYXNzd29yZFBvbGljeS5tYXhQYXNzd29yZEFnZSBtdXN0IGJlIGEgcG9zaXRpdmUgbnVtYmVyJztcbiAgICAgIH1cblxuICAgICAgaWYgKFxuICAgICAgICBwYXNzd29yZFBvbGljeS5yZXNldFRva2VuVmFsaWRpdHlEdXJhdGlvbiAhPT0gdW5kZWZpbmVkICYmXG4gICAgICAgICh0eXBlb2YgcGFzc3dvcmRQb2xpY3kucmVzZXRUb2tlblZhbGlkaXR5RHVyYXRpb24gIT09ICdudW1iZXInIHx8XG4gICAgICAgICAgcGFzc3dvcmRQb2xpY3kucmVzZXRUb2tlblZhbGlkaXR5RHVyYXRpb24gPD0gMClcbiAgICAgICkge1xuICAgICAgICB0aHJvdyAncGFzc3dvcmRQb2xpY3kucmVzZXRUb2tlblZhbGlkaXR5RHVyYXRpb24gbXVzdCBiZSBhIHBvc2l0aXZlIG51bWJlcic7XG4gICAgICB9XG5cbiAgICAgIGlmIChwYXNzd29yZFBvbGljeS52YWxpZGF0b3JQYXR0ZXJuKSB7XG4gICAgICAgIGlmICh0eXBlb2YgcGFzc3dvcmRQb2xpY3kudmFsaWRhdG9yUGF0dGVybiA9PT0gJ3N0cmluZycpIHtcbiAgICAgICAgICBwYXNzd29yZFBvbGljeS52YWxpZGF0b3JQYXR0ZXJuID0gbmV3IFJlZ0V4cChwYXNzd29yZFBvbGljeS52YWxpZGF0b3JQYXR0ZXJuKTtcbiAgICAgICAgfSBlbHNlIGlmICghKHBhc3N3b3JkUG9saWN5LnZhbGlkYXRvclBhdHRlcm4gaW5zdGFuY2VvZiBSZWdFeHApKSB7XG4gICAgICAgICAgdGhyb3cgJ3Bhc3N3b3JkUG9saWN5LnZhbGlkYXRvclBhdHRlcm4gbXVzdCBiZSBhIHJlZ2V4IHN0cmluZyBvciBSZWdFeHAgb2JqZWN0Lic7XG4gICAgICAgIH1cbiAgICAgIH1cblxuICAgICAgaWYgKFxuICAgICAgICBwYXNzd29yZFBvbGljeS52YWxpZGF0b3JDYWxsYmFjayAmJlxuICAgICAgICB0eXBlb2YgcGFzc3dvcmRQb2xpY3kudmFsaWRhdG9yQ2FsbGJhY2sgIT09ICdmdW5jdGlvbidcbiAgICAgICkge1xuICAgICAgICB0aHJvdyAncGFzc3dvcmRQb2xpY3kudmFsaWRhdG9yQ2FsbGJhY2sgbXVzdCBiZSBhIGZ1bmN0aW9uLic7XG4gICAgICB9XG5cbiAgICAgIGlmIChcbiAgICAgICAgcGFzc3dvcmRQb2xpY3kuZG9Ob3RBbGxvd1VzZXJuYW1lICYmXG4gICAgICAgIHR5cGVvZiBwYXNzd29yZFBvbGljeS5kb05vdEFsbG93VXNlcm5hbWUgIT09ICdib29sZWFuJ1xuICAgICAgKSB7XG4gICAgICAgIHRocm93ICdwYXNzd29yZFBvbGljeS5kb05vdEFsbG93VXNlcm5hbWUgbXVzdCBiZSBhIGJvb2xlYW4gdmFsdWUuJztcbiAgICAgIH1cblxuICAgICAgaWYgKFxuICAgICAgICBwYXNzd29yZFBvbGljeS5tYXhQYXNzd29yZEhpc3RvcnkgJiZcbiAgICAgICAgKCFOdW1iZXIuaXNJbnRlZ2VyKHBhc3N3b3JkUG9saWN5Lm1heFBhc3N3b3JkSGlzdG9yeSkgfHxcbiAgICAgICAgICBwYXNzd29yZFBvbGljeS5tYXhQYXNzd29yZEhpc3RvcnkgPD0gMCB8fFxuICAgICAgICAgIHBhc3N3b3JkUG9saWN5Lm1heFBhc3N3b3JkSGlzdG9yeSA+IDIwKVxuICAgICAgKSB7XG4gICAgICAgIHRocm93ICdwYXNzd29yZFBvbGljeS5tYXhQYXNzd29yZEhpc3RvcnkgbXVzdCBiZSBhbiBpbnRlZ2VyIHJhbmdpbmcgMCAtIDIwJztcbiAgICAgIH1cblxuICAgICAgaWYgKFxuICAgICAgICBwYXNzd29yZFBvbGljeS5yZXNldFRva2VuUmV1c2VJZlZhbGlkICYmXG4gICAgICAgIHR5cGVvZiBwYXNzd29yZFBvbGljeS5yZXNldFRva2VuUmV1c2VJZlZhbGlkICE9PSAnYm9vbGVhbidcbiAgICAgICkge1xuICAgICAgICB0aHJvdyAncmVzZXRUb2tlblJldXNlSWZWYWxpZCBtdXN0IGJlIGEgYm9vbGVhbiB2YWx1ZSc7XG4gICAgICB9XG4gICAgICBpZiAocGFzc3dvcmRQb2xpY3kucmVzZXRUb2tlblJldXNlSWZWYWxpZCAmJiAhcGFzc3dvcmRQb2xpY3kucmVzZXRUb2tlblZhbGlkaXR5RHVyYXRpb24pIHtcbiAgICAgICAgdGhyb3cgJ1lvdSBjYW5ub3QgdXNlIHJlc2V0VG9rZW5SZXVzZUlmVmFsaWQgd2l0aG91dCByZXNldFRva2VuVmFsaWRpdHlEdXJhdGlvbic7XG4gICAgICB9XG4gICAgfVxuICB9XG5cbiAgLy8gaWYgdGhlIHBhc3N3b3JkUG9saWN5LnZhbGlkYXRvclBhdHRlcm4gaXMgY29uZmlndXJlZCB0aGVuIHNldHVwIGEgY2FsbGJhY2sgdG8gcHJvY2VzcyB0aGUgcGF0dGVyblxuICBzdGF0aWMgc2V0dXBQYXNzd29yZFZhbGlkYXRvcihwYXNzd29yZFBvbGljeSkge1xuICAgIGlmIChwYXNzd29yZFBvbGljeSAmJiBwYXNzd29yZFBvbGljeS52YWxpZGF0b3JQYXR0ZXJuKSB7XG4gICAgICBwYXNzd29yZFBvbGljeS5wYXR0ZXJuVmFsaWRhdG9yID0gdmFsdWUgPT4ge1xuICAgICAgICByZXR1cm4gcGFzc3dvcmRQb2xpY3kudmFsaWRhdG9yUGF0dGVybi50ZXN0KHZhbHVlKTtcbiAgICAgIH07XG4gICAgfVxuICB9XG5cbiAgc3RhdGljIHZhbGlkYXRlRW1haWxDb25maWd1cmF0aW9uKHtcbiAgICBlbWFpbEFkYXB0ZXIsXG4gICAgYXBwTmFtZSxcbiAgICBwdWJsaWNTZXJ2ZXJVUkwsXG4gICAgZW1haWxWZXJpZnlUb2tlblZhbGlkaXR5RHVyYXRpb24sXG4gICAgZW1haWxWZXJpZnlUb2tlblJldXNlSWZWYWxpZCxcbiAgfSkge1xuICAgIGlmICghZW1haWxBZGFwdGVyKSB7XG4gICAgICB0aHJvdyAnQW4gZW1haWxBZGFwdGVyIGlzIHJlcXVpcmVkIGZvciBlLW1haWwgdmVyaWZpY2F0aW9uIGFuZCBwYXNzd29yZCByZXNldHMuJztcbiAgICB9XG4gICAgaWYgKHR5cGVvZiBhcHBOYW1lICE9PSAnc3RyaW5nJykge1xuICAgICAgdGhyb3cgJ0FuIGFwcCBuYW1lIGlzIHJlcXVpcmVkIGZvciBlLW1haWwgdmVyaWZpY2F0aW9uIGFuZCBwYXNzd29yZCByZXNldHMuJztcbiAgICB9XG4gICAgaWYgKHR5cGVvZiBwdWJsaWNTZXJ2ZXJVUkwgIT09ICdzdHJpbmcnKSB7XG4gICAgICB0aHJvdyAnQSBwdWJsaWMgc2VydmVyIHVybCBpcyByZXF1aXJlZCBmb3IgZS1tYWlsIHZlcmlmaWNhdGlvbiBhbmQgcGFzc3dvcmQgcmVzZXRzLic7XG4gICAgfVxuICAgIGlmIChlbWFpbFZlcmlmeVRva2VuVmFsaWRpdHlEdXJhdGlvbikge1xuICAgICAgaWYgKGlzTmFOKGVtYWlsVmVyaWZ5VG9rZW5WYWxpZGl0eUR1cmF0aW9uKSkge1xuICAgICAgICB0aHJvdyAnRW1haWwgdmVyaWZ5IHRva2VuIHZhbGlkaXR5IGR1cmF0aW9uIG11c3QgYmUgYSB2YWxpZCBudW1iZXIuJztcbiAgICAgIH0gZWxzZSBpZiAoZW1haWxWZXJpZnlUb2tlblZhbGlkaXR5RHVyYXRpb24gPD0gMCkge1xuICAgICAgICB0aHJvdyAnRW1haWwgdmVyaWZ5IHRva2VuIHZhbGlkaXR5IGR1cmF0aW9uIG11c3QgYmUgYSB2YWx1ZSBncmVhdGVyIHRoYW4gMC4nO1xuICAgICAgfVxuICAgIH1cbiAgICBpZiAoZW1haWxWZXJpZnlUb2tlblJldXNlSWZWYWxpZCAmJiB0eXBlb2YgZW1haWxWZXJpZnlUb2tlblJldXNlSWZWYWxpZCAhPT0gJ2Jvb2xlYW4nKSB7XG4gICAgICB0aHJvdyAnZW1haWxWZXJpZnlUb2tlblJldXNlSWZWYWxpZCBtdXN0IGJlIGEgYm9vbGVhbiB2YWx1ZSc7XG4gICAgfVxuICAgIGlmIChlbWFpbFZlcmlmeVRva2VuUmV1c2VJZlZhbGlkICYmICFlbWFpbFZlcmlmeVRva2VuVmFsaWRpdHlEdXJhdGlvbikge1xuICAgICAgdGhyb3cgJ1lvdSBjYW5ub3QgdXNlIGVtYWlsVmVyaWZ5VG9rZW5SZXVzZUlmVmFsaWQgd2l0aG91dCBlbWFpbFZlcmlmeVRva2VuVmFsaWRpdHlEdXJhdGlvbic7XG4gICAgfVxuICB9XG5cbiAgc3RhdGljIHZhbGlkYXRlRmlsZVVwbG9hZE9wdGlvbnMoZmlsZVVwbG9hZCkge1xuICAgIHRyeSB7XG4gICAgICBpZiAoZmlsZVVwbG9hZCA9PSBudWxsIHx8IHR5cGVvZiBmaWxlVXBsb2FkICE9PSAnb2JqZWN0JyB8fCBmaWxlVXBsb2FkIGluc3RhbmNlb2YgQXJyYXkpIHtcbiAgICAgICAgdGhyb3cgJ2ZpbGVVcGxvYWQgbXVzdCBiZSBhbiBvYmplY3QgdmFsdWUuJztcbiAgICAgIH1cbiAgICB9IGNhdGNoIChlKSB7XG4gICAgICBpZiAoZSBpbnN0YW5jZW9mIFJlZmVyZW5jZUVycm9yKSB7XG4gICAgICAgIHJldHVybjtcbiAgICAgIH1cbiAgICAgIHRocm93IGU7XG4gICAgfVxuICAgIGlmIChmaWxlVXBsb2FkLmVuYWJsZUZvckFub255bW91c1VzZXIgPT09IHVuZGVmaW5lZCkge1xuICAgICAgZmlsZVVwbG9hZC5lbmFibGVGb3JBbm9ueW1vdXNVc2VyID0gRmlsZVVwbG9hZE9wdGlvbnMuZW5hYmxlRm9yQW5vbnltb3VzVXNlci5kZWZhdWx0O1xuICAgIH0gZWxzZSBpZiAodHlwZW9mIGZpbGVVcGxvYWQuZW5hYmxlRm9yQW5vbnltb3VzVXNlciAhPT0gJ2Jvb2xlYW4nKSB7XG4gICAgICB0aHJvdyAnZmlsZVVwbG9hZC5lbmFibGVGb3JBbm9ueW1vdXNVc2VyIG11c3QgYmUgYSBib29sZWFuIHZhbHVlLic7XG4gICAgfVxuICAgIGlmIChmaWxlVXBsb2FkLmVuYWJsZUZvclB1YmxpYyA9PT0gdW5kZWZpbmVkKSB7XG4gICAgICBmaWxlVXBsb2FkLmVuYWJsZUZvclB1YmxpYyA9IEZpbGVVcGxvYWRPcHRpb25zLmVuYWJsZUZvclB1YmxpYy5kZWZhdWx0O1xuICAgIH0gZWxzZSBpZiAodHlwZW9mIGZpbGVVcGxvYWQuZW5hYmxlRm9yUHVibGljICE9PSAnYm9vbGVhbicpIHtcbiAgICAgIHRocm93ICdmaWxlVXBsb2FkLmVuYWJsZUZvclB1YmxpYyBtdXN0IGJlIGEgYm9vbGVhbiB2YWx1ZS4nO1xuICAgIH1cbiAgICBpZiAoZmlsZVVwbG9hZC5lbmFibGVGb3JBdXRoZW50aWNhdGVkVXNlciA9PT0gdW5kZWZpbmVkKSB7XG4gICAgICBmaWxlVXBsb2FkLmVuYWJsZUZvckF1dGhlbnRpY2F0ZWRVc2VyID0gRmlsZVVwbG9hZE9wdGlvbnMuZW5hYmxlRm9yQXV0aGVudGljYXRlZFVzZXIuZGVmYXVsdDtcbiAgICB9IGVsc2UgaWYgKHR5cGVvZiBmaWxlVXBsb2FkLmVuYWJsZUZvckF1dGhlbnRpY2F0ZWRVc2VyICE9PSAnYm9vbGVhbicpIHtcbiAgICAgIHRocm93ICdmaWxlVXBsb2FkLmVuYWJsZUZvckF1dGhlbnRpY2F0ZWRVc2VyIG11c3QgYmUgYSBib29sZWFuIHZhbHVlLic7XG4gICAgfVxuICB9XG5cbiAgc3RhdGljIHZhbGlkYXRlTWFzdGVyS2V5SXBzKG1hc3RlcktleUlwcykge1xuICAgIGZvciAoY29uc3QgaXAgb2YgbWFzdGVyS2V5SXBzKSB7XG4gICAgICBpZiAoIW5ldC5pc0lQKGlwKSkge1xuICAgICAgICB0aHJvdyBgSW52YWxpZCBpcCBpbiBtYXN0ZXJLZXlJcHM6ICR7aXB9YDtcbiAgICAgIH1cbiAgICB9XG4gIH1cblxuICBnZXQgbW91bnQoKSB7XG4gICAgdmFyIG1vdW50ID0gdGhpcy5fbW91bnQ7XG4gICAgaWYgKHRoaXMucHVibGljU2VydmVyVVJMKSB7XG4gICAgICBtb3VudCA9IHRoaXMucHVibGljU2VydmVyVVJMO1xuICAgIH1cbiAgICByZXR1cm4gbW91bnQ7XG4gIH1cblxuICBzZXQgbW91bnQobmV3VmFsdWUpIHtcbiAgICB0aGlzLl9tb3VudCA9IG5ld1ZhbHVlO1xuICB9XG5cbiAgc3RhdGljIHZhbGlkYXRlU2Vzc2lvbkNvbmZpZ3VyYXRpb24oc2Vzc2lvbkxlbmd0aCwgZXhwaXJlSW5hY3RpdmVTZXNzaW9ucykge1xuICAgIGlmIChleHBpcmVJbmFjdGl2ZVNlc3Npb25zKSB7XG4gICAgICBpZiAoaXNOYU4oc2Vzc2lvbkxlbmd0aCkpIHtcbiAgICAgICAgdGhyb3cgJ1Nlc3Npb24gbGVuZ3RoIG11c3QgYmUgYSB2YWxpZCBudW1iZXIuJztcbiAgICAgIH0gZWxzZSBpZiAoc2Vzc2lvbkxlbmd0aCA8PSAwKSB7XG4gICAgICAgIHRocm93ICdTZXNzaW9uIGxlbmd0aCBtdXN0IGJlIGEgdmFsdWUgZ3JlYXRlciB0aGFuIDAuJztcbiAgICAgIH1cbiAgICB9XG4gIH1cblxuICBzdGF0aWMgdmFsaWRhdGVNYXhMaW1pdChtYXhMaW1pdCkge1xuICAgIGlmIChtYXhMaW1pdCA8PSAwKSB7XG4gICAgICB0aHJvdyAnTWF4IGxpbWl0IG11c3QgYmUgYSB2YWx1ZSBncmVhdGVyIHRoYW4gMC4nO1xuICAgIH1cbiAgfVxuXG4gIHN0YXRpYyB2YWxpZGF0ZUFsbG93SGVhZGVycyhhbGxvd0hlYWRlcnMpIHtcbiAgICBpZiAoIVtudWxsLCB1bmRlZmluZWRdLmluY2x1ZGVzKGFsbG93SGVhZGVycykpIHtcbiAgICAgIGlmIChBcnJheS5pc0FycmF5KGFsbG93SGVhZGVycykpIHtcbiAgICAgICAgYWxsb3dIZWFkZXJzLmZvckVhY2goaGVhZGVyID0+IHtcbiAgICAgICAgICBpZiAodHlwZW9mIGhlYWRlciAhPT0gJ3N0cmluZycpIHtcbiAgICAgICAgICAgIHRocm93ICdBbGxvdyBoZWFkZXJzIG11c3Qgb25seSBjb250YWluIHN0cmluZ3MnO1xuICAgICAgICAgIH0gZWxzZSBpZiAoIWhlYWRlci50cmltKCkubGVuZ3RoKSB7XG4gICAgICAgICAgICB0aHJvdyAnQWxsb3cgaGVhZGVycyBtdXN0IG5vdCBjb250YWluIGVtcHR5IHN0cmluZ3MnO1xuICAgICAgICAgIH1cbiAgICAgICAgfSk7XG4gICAgICB9IGVsc2Uge1xuICAgICAgICB0aHJvdyAnQWxsb3cgaGVhZGVycyBtdXN0IGJlIGFuIGFycmF5JztcbiAgICAgIH1cbiAgICB9XG4gIH1cblxuICBnZW5lcmF0ZUVtYWlsVmVyaWZ5VG9rZW5FeHBpcmVzQXQoKSB7XG4gICAgaWYgKCF0aGlzLnZlcmlmeVVzZXJFbWFpbHMgfHwgIXRoaXMuZW1haWxWZXJpZnlUb2tlblZhbGlkaXR5RHVyYXRpb24pIHtcbiAgICAgIHJldHVybiB1bmRlZmluZWQ7XG4gICAgfVxuICAgIHZhciBub3cgPSBuZXcgRGF0ZSgpO1xuICAgIHJldHVybiBuZXcgRGF0ZShub3cuZ2V0VGltZSgpICsgdGhpcy5lbWFpbFZlcmlmeVRva2VuVmFsaWRpdHlEdXJhdGlvbiAqIDEwMDApO1xuICB9XG5cbiAgZ2VuZXJhdGVQYXNzd29yZFJlc2V0VG9rZW5FeHBpcmVzQXQoKSB7XG4gICAgaWYgKCF0aGlzLnBhc3N3b3JkUG9saWN5IHx8ICF0aGlzLnBhc3N3b3JkUG9saWN5LnJlc2V0VG9rZW5WYWxpZGl0eUR1cmF0aW9uKSB7XG4gICAgICByZXR1cm4gdW5kZWZpbmVkO1xuICAgIH1cbiAgICBjb25zdCBub3cgPSBuZXcgRGF0ZSgpO1xuICAgIHJldHVybiBuZXcgRGF0ZShub3cuZ2V0VGltZSgpICsgdGhpcy5wYXNzd29yZFBvbGljeS5yZXNldFRva2VuVmFsaWRpdHlEdXJhdGlvbiAqIDEwMDApO1xuICB9XG5cbiAgZ2VuZXJhdGVTZXNzaW9uRXhwaXJlc0F0KCkge1xuICAgIGlmICghdGhpcy5leHBpcmVJbmFjdGl2ZVNlc3Npb25zKSB7XG4gICAgICByZXR1cm4gdW5kZWZpbmVkO1xuICAgIH1cbiAgICB2YXIgbm93ID0gbmV3IERhdGUoKTtcbiAgICByZXR1cm4gbmV3IERhdGUobm93LmdldFRpbWUoKSArIHRoaXMuc2Vzc2lvbkxlbmd0aCAqIDEwMDApO1xuICB9XG5cbiAgZ2V0IGludmFsaWRMaW5rVVJMKCkge1xuICAgIHJldHVybiB0aGlzLmN1c3RvbVBhZ2VzLmludmFsaWRMaW5rIHx8IGAke3RoaXMucHVibGljU2VydmVyVVJMfS9hcHBzL2ludmFsaWRfbGluay5odG1sYDtcbiAgfVxuXG4gIGdldCBpbnZhbGlkVmVyaWZpY2F0aW9uTGlua1VSTCgpIHtcbiAgICByZXR1cm4gKFxuICAgICAgdGhpcy5jdXN0b21QYWdlcy5pbnZhbGlkVmVyaWZpY2F0aW9uTGluayB8fFxuICAgICAgYCR7dGhpcy5wdWJsaWNTZXJ2ZXJVUkx9L2FwcHMvaW52YWxpZF92ZXJpZmljYXRpb25fbGluay5odG1sYFxuICAgICk7XG4gIH1cblxuICBnZXQgbGlua1NlbmRTdWNjZXNzVVJMKCkge1xuICAgIHJldHVybiAoXG4gICAgICB0aGlzLmN1c3RvbVBhZ2VzLmxpbmtTZW5kU3VjY2VzcyB8fCBgJHt0aGlzLnB1YmxpY1NlcnZlclVSTH0vYXBwcy9saW5rX3NlbmRfc3VjY2Vzcy5odG1sYFxuICAgICk7XG4gIH1cblxuICBnZXQgbGlua1NlbmRGYWlsVVJMKCkge1xuICAgIHJldHVybiB0aGlzLmN1c3RvbVBhZ2VzLmxpbmtTZW5kRmFpbCB8fCBgJHt0aGlzLnB1YmxpY1NlcnZlclVSTH0vYXBwcy9saW5rX3NlbmRfZmFpbC5odG1sYDtcbiAgfVxuXG4gIGdldCB2ZXJpZnlFbWFpbFN1Y2Nlc3NVUkwoKSB7XG4gICAgcmV0dXJuIChcbiAgICAgIHRoaXMuY3VzdG9tUGFnZXMudmVyaWZ5RW1haWxTdWNjZXNzIHx8XG4gICAgICBgJHt0aGlzLnB1YmxpY1NlcnZlclVSTH0vYXBwcy92ZXJpZnlfZW1haWxfc3VjY2Vzcy5odG1sYFxuICAgICk7XG4gIH1cblxuICBnZXQgY2hvb3NlUGFzc3dvcmRVUkwoKSB7XG4gICAgcmV0dXJuIHRoaXMuY3VzdG9tUGFnZXMuY2hvb3NlUGFzc3dvcmQgfHwgYCR7dGhpcy5wdWJsaWNTZXJ2ZXJVUkx9L2FwcHMvY2hvb3NlX3Bhc3N3b3JkYDtcbiAgfVxuXG4gIGdldCByZXF1ZXN0UmVzZXRQYXNzd29yZFVSTCgpIHtcbiAgICByZXR1cm4gYCR7dGhpcy5wdWJsaWNTZXJ2ZXJVUkx9LyR7dGhpcy5wYWdlc0VuZHBvaW50fS8ke3RoaXMuYXBwbGljYXRpb25JZH0vcmVxdWVzdF9wYXNzd29yZF9yZXNldGA7XG4gIH1cblxuICBnZXQgcGFzc3dvcmRSZXNldFN1Y2Nlc3NVUkwoKSB7XG4gICAgcmV0dXJuIChcbiAgICAgIHRoaXMuY3VzdG9tUGFnZXMucGFzc3dvcmRSZXNldFN1Y2Nlc3MgfHxcbiAgICAgIGAke3RoaXMucHVibGljU2VydmVyVVJMfS9hcHBzL3Bhc3N3b3JkX3Jlc2V0X3N1Y2Nlc3MuaHRtbGBcbiAgICApO1xuICB9XG5cbiAgZ2V0IHBhcnNlRnJhbWVVUkwoKSB7XG4gICAgcmV0dXJuIHRoaXMuY3VzdG9tUGFnZXMucGFyc2VGcmFtZVVSTDtcbiAgfVxuXG4gIGdldCB2ZXJpZnlFbWFpbFVSTCgpIHtcbiAgICByZXR1cm4gYCR7dGhpcy5wdWJsaWNTZXJ2ZXJVUkx9LyR7dGhpcy5wYWdlc0VuZHBvaW50fS8ke3RoaXMuYXBwbGljYXRpb25JZH0vdmVyaWZ5X2VtYWlsYDtcbiAgfVxuXG4gIC8vIFRPRE86IFJlbW92ZSB0aGlzIGZ1bmN0aW9uIG9uY2UgUGFnZXNSb3V0ZXIgcmVwbGFjZXMgdGhlIFB1YmxpY0FQSVJvdXRlcjtcbiAgLy8gdGhlIChkZWZhdWx0KSBlbmRwb2ludCBoYXMgdG8gYmUgZGVmaW5lZCBpbiBQYWdlc1JvdXRlciBvbmx5LlxuICBnZXQgcGFnZXNFbmRwb2ludCgpIHtcbiAgICByZXR1cm4gdGhpcy5wYWdlcyAmJiB0aGlzLnBhZ2VzLmVuYWJsZVJvdXRlciAmJiB0aGlzLnBhZ2VzLnBhZ2VzRW5kcG9pbnRcbiAgICAgID8gdGhpcy5wYWdlcy5wYWdlc0VuZHBvaW50XG4gICAgICA6ICdhcHBzJztcbiAgfVxufVxuXG5leHBvcnQgZGVmYXVsdCBDb25maWc7XG5tb2R1bGUuZXhwb3J0cyA9IENvbmZpZztcbiJdfQ==