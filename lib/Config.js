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
    requestKeywordDenylist
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
//# sourceMappingURL=data:application/json;charset=utf-8;base64,eyJ2ZXJzaW9uIjozLCJzb3VyY2VzIjpbIi4uL3NyYy9Db25maWcuanMiXSwibmFtZXMiOlsicmVtb3ZlVHJhaWxpbmdTbGFzaCIsInN0ciIsImVuZHNXaXRoIiwic3Vic3RyIiwibGVuZ3RoIiwiQ29uZmlnIiwiZ2V0IiwiYXBwbGljYXRpb25JZCIsIm1vdW50IiwiY2FjaGVJbmZvIiwiQXBwQ2FjaGUiLCJjb25maWciLCJPYmplY3QiLCJrZXlzIiwiZm9yRWFjaCIsImtleSIsImRhdGFiYXNlIiwiRGF0YWJhc2VDb250cm9sbGVyIiwiZGF0YWJhc2VDb250cm9sbGVyIiwiYWRhcHRlciIsImdlbmVyYXRlU2Vzc2lvbkV4cGlyZXNBdCIsImJpbmQiLCJnZW5lcmF0ZUVtYWlsVmVyaWZ5VG9rZW5FeHBpcmVzQXQiLCJwdXQiLCJzZXJ2ZXJDb25maWd1cmF0aW9uIiwidmFsaWRhdGUiLCJhcHBJZCIsInNldHVwUGFzc3dvcmRWYWxpZGF0b3IiLCJwYXNzd29yZFBvbGljeSIsInZlcmlmeVVzZXJFbWFpbHMiLCJ1c2VyQ29udHJvbGxlciIsImFwcE5hbWUiLCJwdWJsaWNTZXJ2ZXJVUkwiLCJyZXZva2VTZXNzaW9uT25QYXNzd29yZFJlc2V0IiwiZXhwaXJlSW5hY3RpdmVTZXNzaW9ucyIsInNlc3Npb25MZW5ndGgiLCJtYXhMaW1pdCIsImVtYWlsVmVyaWZ5VG9rZW5WYWxpZGl0eUR1cmF0aW9uIiwiYWNjb3VudExvY2tvdXQiLCJtYXN0ZXJLZXlJcHMiLCJtYXN0ZXJLZXkiLCJyZWFkT25seU1hc3RlcktleSIsImFsbG93SGVhZGVycyIsImlkZW1wb3RlbmN5T3B0aW9ucyIsImVtYWlsVmVyaWZ5VG9rZW5SZXVzZUlmVmFsaWQiLCJmaWxlVXBsb2FkIiwicGFnZXMiLCJzZWN1cml0eSIsImVuZm9yY2VQcml2YXRlVXNlcnMiLCJzY2hlbWEiLCJyZXF1ZXN0S2V5d29yZERlbnlsaXN0IiwiRXJyb3IiLCJlbWFpbEFkYXB0ZXIiLCJ2YWxpZGF0ZUVtYWlsQ29uZmlndXJhdGlvbiIsInZhbGlkYXRlQWNjb3VudExvY2tvdXRQb2xpY3kiLCJ2YWxpZGF0ZVBhc3N3b3JkUG9saWN5IiwidmFsaWRhdGVGaWxlVXBsb2FkT3B0aW9ucyIsInN0YXJ0c1dpdGgiLCJ2YWxpZGF0ZVNlc3Npb25Db25maWd1cmF0aW9uIiwidmFsaWRhdGVNYXN0ZXJLZXlJcHMiLCJ2YWxpZGF0ZU1heExpbWl0IiwidmFsaWRhdGVBbGxvd0hlYWRlcnMiLCJ2YWxpZGF0ZUlkZW1wb3RlbmN5T3B0aW9ucyIsInZhbGlkYXRlUGFnZXNPcHRpb25zIiwidmFsaWRhdGVTZWN1cml0eU9wdGlvbnMiLCJ2YWxpZGF0ZVNjaGVtYU9wdGlvbnMiLCJ2YWxpZGF0ZUVuZm9yY2VQcml2YXRlVXNlcnMiLCJ2YWxpZGF0ZVJlcXVlc3RLZXl3b3JkRGVueWxpc3QiLCJ1bmRlZmluZWQiLCJkZWZhdWx0IiwiQXJyYXkiLCJpc0FycmF5IiwicHJvdG90eXBlIiwidG9TdHJpbmciLCJjYWxsIiwiZW5hYmxlQ2hlY2siLCJTZWN1cml0eU9wdGlvbnMiLCJlbmFibGVDaGVja0xvZyIsImRlZmluaXRpb25zIiwiU2NoZW1hT3B0aW9ucyIsInN0cmljdCIsImRlbGV0ZUV4dHJhRmllbGRzIiwicmVjcmVhdGVNb2RpZmllZEZpZWxkcyIsImxvY2tTY2hlbWFzIiwiYmVmb3JlTWlncmF0aW9uIiwiYWZ0ZXJNaWdyYXRpb24iLCJlbmFibGVSb3V0ZXIiLCJQYWdlc09wdGlvbnMiLCJlbmFibGVMb2NhbGl6YXRpb24iLCJsb2NhbGl6YXRpb25Kc29uUGF0aCIsImxvY2FsaXphdGlvbkZhbGxiYWNrTG9jYWxlIiwicGxhY2Vob2xkZXJzIiwiZm9yY2VSZWRpcmVjdCIsInBhZ2VzUGF0aCIsInBhZ2VzRW5kcG9pbnQiLCJjdXN0b21VcmxzIiwiY3VzdG9tUm91dGVzIiwidHRsIiwiSWRlbXBvdGVuY3lPcHRpb25zIiwiaXNOYU4iLCJwYXRocyIsImR1cmF0aW9uIiwiTnVtYmVyIiwiaXNJbnRlZ2VyIiwidGhyZXNob2xkIiwidW5sb2NrT25QYXNzd29yZFJlc2V0IiwiQWNjb3VudExvY2tvdXRPcHRpb25zIiwibWF4UGFzc3dvcmRBZ2UiLCJyZXNldFRva2VuVmFsaWRpdHlEdXJhdGlvbiIsInZhbGlkYXRvclBhdHRlcm4iLCJSZWdFeHAiLCJ2YWxpZGF0b3JDYWxsYmFjayIsImRvTm90QWxsb3dVc2VybmFtZSIsIm1heFBhc3N3b3JkSGlzdG9yeSIsInJlc2V0VG9rZW5SZXVzZUlmVmFsaWQiLCJwYXR0ZXJuVmFsaWRhdG9yIiwidmFsdWUiLCJ0ZXN0IiwiZSIsIlJlZmVyZW5jZUVycm9yIiwiZW5hYmxlRm9yQW5vbnltb3VzVXNlciIsIkZpbGVVcGxvYWRPcHRpb25zIiwiZW5hYmxlRm9yUHVibGljIiwiZW5hYmxlRm9yQXV0aGVudGljYXRlZFVzZXIiLCJpcCIsIm5ldCIsImlzSVAiLCJfbW91bnQiLCJuZXdWYWx1ZSIsImluY2x1ZGVzIiwiaGVhZGVyIiwidHJpbSIsIm5vdyIsIkRhdGUiLCJnZXRUaW1lIiwiZ2VuZXJhdGVQYXNzd29yZFJlc2V0VG9rZW5FeHBpcmVzQXQiLCJpbnZhbGlkTGlua1VSTCIsImN1c3RvbVBhZ2VzIiwiaW52YWxpZExpbmsiLCJpbnZhbGlkVmVyaWZpY2F0aW9uTGlua1VSTCIsImludmFsaWRWZXJpZmljYXRpb25MaW5rIiwibGlua1NlbmRTdWNjZXNzVVJMIiwibGlua1NlbmRTdWNjZXNzIiwibGlua1NlbmRGYWlsVVJMIiwibGlua1NlbmRGYWlsIiwidmVyaWZ5RW1haWxTdWNjZXNzVVJMIiwidmVyaWZ5RW1haWxTdWNjZXNzIiwiY2hvb3NlUGFzc3dvcmRVUkwiLCJjaG9vc2VQYXNzd29yZCIsInJlcXVlc3RSZXNldFBhc3N3b3JkVVJMIiwicGFzc3dvcmRSZXNldFN1Y2Nlc3NVUkwiLCJwYXNzd29yZFJlc2V0U3VjY2VzcyIsInBhcnNlRnJhbWVVUkwiLCJ2ZXJpZnlFbWFpbFVSTCIsIm1vZHVsZSIsImV4cG9ydHMiXSwibWFwcGluZ3MiOiI7Ozs7Ozs7QUFJQTs7QUFDQTs7QUFDQTs7QUFDQTs7QUFRQTs7OztBQWZBO0FBQ0E7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YyxLQUFLQSxLQUFMLENBQVd3QyxZQUF6QixJQUF5QyxLQUFLeEMsS0FBTCxDQUFXZ0QsYUFBcEQsR0FDSCxLQUFLaEQsS0FBTCxDQUFXZ0QsYUFEUixHQUVILE1BRko7QUFHRDs7QUFuaEJpQjs7O2VBc2hCTHpGLE07O0FBQ2ZxSixNQUFNLENBQUNDLE9BQVAsR0FBaUJ0SixNQUFqQiIsInNvdXJjZXNDb250ZW50IjpbIi8vIEEgQ29uZmlnIG9iamVjdCBwcm92aWRlcyBpbmZvcm1hdGlvbiBhYm91dCBob3cgYSBzcGVjaWZpYyBhcHAgaXNcbi8vIGNvbmZpZ3VyZWQuXG4vLyBtb3VudCBpcyB0aGUgVVJMIGZvciB0aGUgcm9vdCBvZiB0aGUgQVBJOyBpbmNsdWRlcyBodHRwLCBkb21haW4sIGV0Yy5cblxuaW1wb3J0IEFwcENhY2hlIGZyb20gJy4vY2FjaGUnO1xuaW1wb3J0IERhdGFiYXNlQ29udHJvbGxlciBmcm9tICcuL0NvbnRyb2xsZXJzL0RhdGFiYXNlQ29udHJvbGxlcic7XG5pbXBvcnQgbmV0IGZyb20gJ25ldCc7XG5pbXBvcnQge1xuICBJZGVtcG90ZW5jeU9wdGlvbnMsXG4gIEZpbGVVcGxvYWRPcHRpb25zLFxuICBBY2NvdW50TG9ja291dE9wdGlvbnMsXG4gIFBhZ2VzT3B0aW9ucyxcbiAgU2VjdXJpdHlPcHRpb25zLFxuICBTY2hlbWFPcHRpb25zLFxufSBmcm9tICcuL09wdGlvbnMvRGVmaW5pdGlvbnMnO1xuaW1wb3J0IHsgaXNCb29sZWFuLCBpc1N0cmluZyB9IGZyb20gJ2xvZGFzaCc7XG5cbmZ1bmN0aW9uIHJlbW92ZVRyYWlsaW5nU2xhc2goc3RyKSB7XG4gIGlmICghc3RyKSB7XG4gICAgcmV0dXJuIHN0cjtcbiAgfVxuICBpZiAoc3RyLmVuZHNXaXRoKCcvJykpIHtcbiAgICBzdHIgPSBzdHIuc3Vic3RyKDAsIHN0ci5sZW5ndGggLSAxKTtcbiAgfVxuICByZXR1cm4gc3RyO1xufVxuXG5leHBvcnQgY2xhc3MgQ29uZmlnIHtcbiAgc3RhdGljIGdldChhcHBsaWNhdGlvbklkOiBzdHJpbmcsIG1vdW50OiBzdHJpbmcpIHtcbiAgICBjb25zdCBjYWNoZUluZm8gPSBBcHBDYWNoZS5nZXQoYXBwbGljYXRpb25JZCk7XG4gICAgaWYgKCFjYWNoZUluZm8pIHtcbiAgICAgIHJldHVybjtcbiAgICB9XG4gICAgY29uc3QgY29uZmlnID0gbmV3IENvbmZpZygpO1xuICAgIGNvbmZpZy5hcHBsaWNhdGlvbklkID0gYXBwbGljYXRpb25JZDtcbiAgICBPYmplY3Qua2V5cyhjYWNoZUluZm8pLmZvckVhY2goa2V5ID0+IHtcbiAgICAgIGlmIChrZXkgPT0gJ2RhdGFiYXNlQ29udHJvbGxlcicpIHtcbiAgICAgICAgY29uZmlnLmRhdGFiYXNlID0gbmV3IERhdGFiYXNlQ29udHJvbGxlcihjYWNoZUluZm8uZGF0YWJhc2VDb250cm9sbGVyLmFkYXB0ZXIsIGNvbmZpZyk7XG4gICAgICB9IGVsc2Uge1xuICAgICAgICBjb25maWdba2V5XSA9IGNhY2hlSW5mb1trZXldO1xuICAgICAgfVxuICAgIH0pO1xuICAgIGNvbmZpZy5tb3VudCA9IHJlbW92ZVRyYWlsaW5nU2xhc2gobW91bnQpO1xuICAgIGNvbmZpZy5nZW5lcmF0ZVNlc3Npb25FeHBpcmVzQXQgPSBjb25maWcuZ2VuZXJhdGVTZXNzaW9uRXhwaXJlc0F0LmJpbmQoY29uZmlnKTtcbiAgICBjb25maWcuZ2VuZXJhdGVFbWFpbFZlcmlmeVRva2VuRXhwaXJlc0F0ID0gY29uZmlnLmdlbmVyYXRlRW1haWxWZXJpZnlUb2tlbkV4cGlyZXNBdC5iaW5kKFxuICAgICAgY29uZmlnXG4gICAgKTtcbiAgICByZXR1cm4gY29uZmlnO1xuICB9XG5cbiAgc3RhdGljIHB1dChzZXJ2ZXJDb25maWd1cmF0aW9uKSB7XG4gICAgQ29uZmlnLnZhbGlkYXRlKHNlcnZlckNvbmZpZ3VyYXRpb24pO1xuICAgIEFwcENhY2hlLnB1dChzZXJ2ZXJDb25maWd1cmF0aW9uLmFwcElkLCBzZXJ2ZXJDb25maWd1cmF0aW9uKTtcbiAgICBDb25maWcuc2V0dXBQYXNzd29yZFZhbGlkYXRvcihzZXJ2ZXJDb25maWd1cmF0aW9uLnBhc3N3b3JkUG9saWN5KTtcbiAgICByZXR1cm4gc2VydmVyQ29uZmlndXJhdGlvbjtcbiAgfVxuXG4gIHN0YXRpYyB2YWxpZGF0ZSh7XG4gICAgdmVyaWZ5VXNlckVtYWlscyxcbiAgICB1c2VyQ29udHJvbGxlcixcbiAgICBhcHBOYW1lLFxuICAgIHB1YmxpY1NlcnZlclVSTCxcbiAgICByZXZva2VTZXNzaW9uT25QYXNzd29yZFJlc2V0LFxuICAgIGV4cGlyZUluYWN0aXZlU2Vzc2lvbnMsXG4gICAgc2Vzc2lvbkxlbmd0aCxcbiAgICBtYXhMaW1pdCxcbiAgICBlbWFpbFZlcmlmeVRva2VuVmFsaWRpdHlEdXJhdGlvbixcbiAgICBhY2NvdW50TG9ja291dCxcbiAgICBwYXNzd29yZFBvbGljeSxcbiAgICBtYXN0ZXJLZXlJcHMsXG4gICAgbWFzdGVyS2V5LFxuICAgIHJlYWRPbmx5TWFzdGVyS2V5LFxuICAgIGFsbG93SGVhZGVycyxcbiAgICBpZGVtcG90ZW5jeU9wdGlvbnMsXG4gICAgZW1haWxWZXJpZnlUb2tlblJldXNlSWZWYWxpZCxcbiAgICBmaWxlVXBsb2FkLFxuICAgIHBhZ2VzLFxuICAgIHNlY3VyaXR5LFxuICAgIGVuZm9yY2VQcml2YXRlVXNlcnMsXG4gICAgc2NoZW1hLFxuICAgIHJlcXVlc3RLZXl3b3JkRGVueWxpc3QsXG4gIH0pIHtcbiAgICBpZiAobWFzdGVyS2V5ID09PSByZWFkT25seU1hc3RlcktleSkge1xuICAgICAgdGhyb3cgbmV3IEVycm9yKCdtYXN0ZXJLZXkgYW5kIHJlYWRPbmx5TWFzdGVyS2V5IHNob3VsZCBiZSBkaWZmZXJlbnQnKTtcbiAgICB9XG5cbiAgICBjb25zdCBlbWFpbEFkYXB0ZXIgPSB1c2VyQ29udHJvbGxlci5hZGFwdGVyO1xuICAgIGlmICh2ZXJpZnlVc2VyRW1haWxzKSB7XG4gICAgICB0aGlzLnZhbGlkYXRlRW1haWxDb25maWd1cmF0aW9uKHtcbiAgICAgICAgZW1haWxBZGFwdGVyLFxuICAgICAgICBhcHBOYW1lLFxuICAgICAgICBwdWJsaWNTZXJ2ZXJVUkwsXG4gICAgICAgIGVtYWlsVmVyaWZ5VG9rZW5WYWxpZGl0eUR1cmF0aW9uLFxuICAgICAgICBlbWFpbFZlcmlmeVRva2VuUmV1c2VJZlZhbGlkLFxuICAgICAgfSk7XG4gICAgfVxuXG4gICAgdGhpcy52YWxpZGF0ZUFjY291bnRMb2Nrb3V0UG9saWN5KGFjY291bnRMb2Nrb3V0KTtcbiAgICB0aGlzLnZhbGlkYXRlUGFzc3dvcmRQb2xpY3kocGFzc3dvcmRQb2xpY3kpO1xuICAgIHRoaXMudmFsaWRhdGVGaWxlVXBsb2FkT3B0aW9ucyhmaWxlVXBsb2FkKTtcblxuICAgIGlmICh0eXBlb2YgcmV2b2tlU2Vzc2lvbk9uUGFzc3dvcmRSZXNldCAhPT0gJ2Jvb2xlYW4nKSB7XG4gICAgICB0aHJvdyAncmV2b2tlU2Vzc2lvbk9uUGFzc3dvcmRSZXNldCBtdXN0IGJlIGEgYm9vbGVhbiB2YWx1ZSc7XG4gICAgfVxuXG4gICAgaWYgKHB1YmxpY1NlcnZlclVSTCkge1xuICAgICAgaWYgKCFwdWJsaWNTZXJ2ZXJVUkwuc3RhcnRzV2l0aCgnaHR0cDovLycpICYmICFwdWJsaWNTZXJ2ZXJVUkwuc3RhcnRzV2l0aCgnaHR0cHM6Ly8nKSkge1xuICAgICAgICB0aHJvdyAncHVibGljU2VydmVyVVJMIHNob3VsZCBiZSBhIHZhbGlkIEhUVFBTIFVSTCBzdGFydGluZyB3aXRoIGh0dHBzOi8vJztcbiAgICAgIH1cbiAgICB9XG4gICAgdGhpcy52YWxpZGF0ZVNlc3Npb25Db25maWd1cmF0aW9uKHNlc3Npb25MZW5ndGgsIGV4cGlyZUluYWN0aXZlU2Vzc2lvbnMpO1xuICAgIHRoaXMudmFsaWRhdGVNYXN0ZXJLZXlJcHMobWFzdGVyS2V5SXBzKTtcbiAgICB0aGlzLnZhbGlkYXRlTWF4TGltaXQobWF4TGltaXQpO1xuICAgIHRoaXMudmFsaWRhdGVBbGxvd0hlYWRlcnMoYWxsb3dIZWFkZXJzKTtcbiAgICB0aGlzLnZhbGlkYXRlSWRlbXBvdGVuY3lPcHRpb25zKGlkZW1wb3RlbmN5T3B0aW9ucyk7XG4gICAgdGhpcy52YWxpZGF0ZVBhZ2VzT3B0aW9ucyhwYWdlcyk7XG4gICAgdGhpcy52YWxpZGF0ZVNlY3VyaXR5T3B0aW9ucyhzZWN1cml0eSk7XG4gICAgdGhpcy52YWxpZGF0ZVNjaGVtYU9wdGlvbnMoc2NoZW1hKTtcbiAgICB0aGlzLnZhbGlkYXRlRW5mb3JjZVByaXZhdGVVc2VycyhlbmZvcmNlUHJpdmF0ZVVzZXJzKTtcbiAgICB0aGlzLnZhbGlkYXRlUmVxdWVzdEtleXdvcmREZW55bGlzdChyZXF1ZXN0S2V5d29yZERlbnlsaXN0KTtcbiAgfVxuXG4gIHN0YXRpYyB2YWxpZGF0ZVJlcXVlc3RLZXl3b3JkRGVueWxpc3QocmVxdWVzdEtleXdvcmREZW55bGlzdCkge1xuICAgIGlmIChyZXF1ZXN0S2V5d29yZERlbnlsaXN0ID09PSB1bmRlZmluZWQpIHtcbiAgICAgIHJlcXVlc3RLZXl3b3JkRGVueWxpc3QgPSByZXF1ZXN0S2V5d29yZERlbnlsaXN0LmRlZmF1bHQ7XG4gICAgfSBlbHNlIGlmICghQXJyYXkuaXNBcnJheShyZXF1ZXN0S2V5d29yZERlbnlsaXN0KSkge1xuICAgICAgdGhyb3cgJ1BhcnNlIFNlcnZlciBvcHRpb24gcmVxdWVzdEtleXdvcmREZW55bGlzdCBtdXN0IGJlIGFuIGFycmF5Lic7XG4gICAgfVxuICB9XG5cbiAgc3RhdGljIHZhbGlkYXRlRW5mb3JjZVByaXZhdGVVc2VycyhlbmZvcmNlUHJpdmF0ZVVzZXJzKSB7XG4gICAgaWYgKHR5cGVvZiBlbmZvcmNlUHJpdmF0ZVVzZXJzICE9PSAnYm9vbGVhbicpIHtcbiAgICAgIHRocm93ICdQYXJzZSBTZXJ2ZXIgb3B0aW9uIGVuZm9yY2VQcml2YXRlVXNlcnMgbXVzdCBiZSBhIGJvb2xlYW4uJztcbiAgICB9XG4gIH1cblxuICBzdGF0aWMgdmFsaWRhdGVTZWN1cml0eU9wdGlvbnMoc2VjdXJpdHkpIHtcbiAgICBpZiAoT2JqZWN0LnByb3RvdHlwZS50b1N0cmluZy5jYWxsKHNlY3VyaXR5KSAhPT0gJ1tvYmplY3QgT2JqZWN0XScpIHtcbiAgICAgIHRocm93ICdQYXJzZSBTZXJ2ZXIgb3B0aW9uIHNlY3VyaXR5IG11c3QgYmUgYW4gb2JqZWN0Lic7XG4gICAgfVxuICAgIGlmIChzZWN1cml0eS5lbmFibGVDaGVjayA9PT0gdW5kZWZpbmVkKSB7XG4gICAgICBzZWN1cml0eS5lbmFibGVDaGVjayA9IFNlY3VyaXR5T3B0aW9ucy5lbmFibGVDaGVjay5kZWZhdWx0O1xuICAgIH0gZWxzZSBpZiAoIWlzQm9vbGVhbihzZWN1cml0eS5lbmFibGVDaGVjaykpIHtcbiAgICAgIHRocm93ICdQYXJzZSBTZXJ2ZXIgb3B0aW9uIHNlY3VyaXR5LmVuYWJsZUNoZWNrIG11c3QgYmUgYSBib29sZWFuLic7XG4gICAgfVxuICAgIGlmIChzZWN1cml0eS5lbmFibGVDaGVja0xvZyA9PT0gdW5kZWZpbmVkKSB7XG4gICAgICBzZWN1cml0eS5lbmFibGVDaGVja0xvZyA9IFNlY3VyaXR5T3B0aW9ucy5lbmFibGVDaGVja0xvZy5kZWZhdWx0O1xuICAgIH0gZWxzZSBpZiAoIWlzQm9vbGVhbihzZWN1cml0eS5lbmFibGVDaGVja0xvZykpIHtcbiAgICAgIHRocm93ICdQYXJzZSBTZXJ2ZXIgb3B0aW9uIHNlY3VyaXR5LmVuYWJsZUNoZWNrTG9nIG11c3QgYmUgYSBib29sZWFuLic7XG4gICAgfVxuICB9XG5cbiAgc3RhdGljIHZhbGlkYXRlU2NoZW1hT3B0aW9ucyhzY2hlbWE6IFNjaGVtYU9wdGlvbnMpIHtcbiAgICBpZiAoIXNjaGVtYSkgcmV0dXJuO1xuICAgIGlmIChPYmplY3QucHJvdG90eXBlLnRvU3RyaW5nLmNhbGwoc2NoZW1hKSAhPT0gJ1tvYmplY3QgT2JqZWN0XScpIHtcbiAgICAgIHRocm93ICdQYXJzZSBTZXJ2ZXIgb3B0aW9uIHNjaGVtYSBtdXN0IGJlIGFuIG9iamVjdC4nO1xuICAgIH1cbiAgICBpZiAoc2NoZW1hLmRlZmluaXRpb25zID09PSB1bmRlZmluZWQpIHtcbiAgICAgIHNjaGVtYS5kZWZpbml0aW9ucyA9IFNjaGVtYU9wdGlvbnMuZGVmaW5pdGlvbnMuZGVmYXVsdDtcbiAgICB9IGVsc2UgaWYgKCFBcnJheS5pc0FycmF5KHNjaGVtYS5kZWZpbml0aW9ucykpIHtcbiAgICAgIHRocm93ICdQYXJzZSBTZXJ2ZXIgb3B0aW9uIHNjaGVtYS5kZWZpbml0aW9ucyBtdXN0IGJlIGFuIGFycmF5Lic7XG4gICAgfVxuICAgIGlmIChzY2hlbWEuc3RyaWN0ID09PSB1bmRlZmluZWQpIHtcbiAgICAgIHNjaGVtYS5zdHJpY3QgPSBTY2hlbWFPcHRpb25zLnN0cmljdC5kZWZhdWx0O1xuICAgIH0gZWxzZSBpZiAoIWlzQm9vbGVhbihzY2hlbWEuc3RyaWN0KSkge1xuICAgICAgdGhyb3cgJ1BhcnNlIFNlcnZlciBvcHRpb24gc2NoZW1hLnN0cmljdCBtdXN0IGJlIGEgYm9vbGVhbi4nO1xuICAgIH1cbiAgICBpZiAoc2NoZW1hLmRlbGV0ZUV4dHJhRmllbGRzID09PSB1bmRlZmluZWQpIHtcbiAgICAgIHNjaGVtYS5kZWxldGVFeHRyYUZpZWxkcyA9IFNjaGVtYU9wdGlvbnMuZGVsZXRlRXh0cmFGaWVsZHMuZGVmYXVsdDtcbiAgICB9IGVsc2UgaWYgKCFpc0Jvb2xlYW4oc2NoZW1hLmRlbGV0ZUV4dHJhRmllbGRzKSkge1xuICAgICAgdGhyb3cgJ1BhcnNlIFNlcnZlciBvcHRpb24gc2NoZW1hLmRlbGV0ZUV4dHJhRmllbGRzIG11c3QgYmUgYSBib29sZWFuLic7XG4gICAgfVxuICAgIGlmIChzY2hlbWEucmVjcmVhdGVNb2RpZmllZEZpZWxkcyA9PT0gdW5kZWZpbmVkKSB7XG4gICAgICBzY2hlbWEucmVjcmVhdGVNb2RpZmllZEZpZWxkcyA9IFNjaGVtYU9wdGlvbnMucmVjcmVhdGVNb2RpZmllZEZpZWxkcy5kZWZhdWx0O1xuICAgIH0gZWxzZSBpZiAoIWlzQm9vbGVhbihzY2hlbWEucmVjcmVhdGVNb2RpZmllZEZpZWxkcykpIHtcbiAgICAgIHRocm93ICdQYXJzZSBTZXJ2ZXIgb3B0aW9uIHNjaGVtYS5yZWNyZWF0ZU1vZGlmaWVkRmllbGRzIG11c3QgYmUgYSBib29sZWFuLic7XG4gICAgfVxuICAgIGlmIChzY2hlbWEubG9ja1NjaGVtYXMgPT09IHVuZGVmaW5lZCkge1xuICAgICAgc2NoZW1hLmxvY2tTY2hlbWFzID0gU2NoZW1hT3B0aW9ucy5sb2NrU2NoZW1hcy5kZWZhdWx0O1xuICAgIH0gZWxzZSBpZiAoIWlzQm9vbGVhbihzY2hlbWEubG9ja1NjaGVtYXMpKSB7XG4gICAgICB0aHJvdyAnUGFyc2UgU2VydmVyIG9wdGlvbiBzY2hlbWEubG9ja1NjaGVtYXMgbXVzdCBiZSBhIGJvb2xlYW4uJztcbiAgICB9XG4gICAgaWYgKHNjaGVtYS5iZWZvcmVNaWdyYXRpb24gPT09IHVuZGVmaW5lZCkge1xuICAgICAgc2NoZW1hLmJlZm9yZU1pZ3JhdGlvbiA9IG51bGw7XG4gICAgfSBlbHNlIGlmIChzY2hlbWEuYmVmb3JlTWlncmF0aW9uICE9PSBudWxsICYmIHR5cGVvZiBzY2hlbWEuYmVmb3JlTWlncmF0aW9uICE9PSAnZnVuY3Rpb24nKSB7XG4gICAgICB0aHJvdyAnUGFyc2UgU2VydmVyIG9wdGlvbiBzY2hlbWEuYmVmb3JlTWlncmF0aW9uIG11c3QgYmUgYSBmdW5jdGlvbi4nO1xuICAgIH1cbiAgICBpZiAoc2NoZW1hLmFmdGVyTWlncmF0aW9uID09PSB1bmRlZmluZWQpIHtcbiAgICAgIHNjaGVtYS5hZnRlck1pZ3JhdGlvbiA9IG51bGw7XG4gICAgfSBlbHNlIGlmIChzY2hlbWEuYWZ0ZXJNaWdyYXRpb24gIT09IG51bGwgJiYgdHlwZW9mIHNjaGVtYS5hZnRlck1pZ3JhdGlvbiAhPT0gJ2Z1bmN0aW9uJykge1xuICAgICAgdGhyb3cgJ1BhcnNlIFNlcnZlciBvcHRpb24gc2NoZW1hLmFmdGVyTWlncmF0aW9uIG11c3QgYmUgYSBmdW5jdGlvbi4nO1xuICAgIH1cbiAgfVxuXG4gIHN0YXRpYyB2YWxpZGF0ZVBhZ2VzT3B0aW9ucyhwYWdlcykge1xuICAgIGlmIChPYmplY3QucHJvdG90eXBlLnRvU3RyaW5nLmNhbGwocGFnZXMpICE9PSAnW29iamVjdCBPYmplY3RdJykge1xuICAgICAgdGhyb3cgJ1BhcnNlIFNlcnZlciBvcHRpb24gcGFnZXMgbXVzdCBiZSBhbiBvYmplY3QuJztcbiAgICB9XG4gICAgaWYgKHBhZ2VzLmVuYWJsZVJvdXRlciA9PT0gdW5kZWZpbmVkKSB7XG4gICAgICBwYWdlcy5lbmFibGVSb3V0ZXIgPSBQYWdlc09wdGlvbnMuZW5hYmxlUm91dGVyLmRlZmF1bHQ7XG4gICAgfSBlbHNlIGlmICghaXNCb29sZWFuKHBhZ2VzLmVuYWJsZVJvdXRlcikpIHtcbiAgICAgIHRocm93ICdQYXJzZSBTZXJ2ZXIgb3B0aW9uIHBhZ2VzLmVuYWJsZVJvdXRlciBtdXN0IGJlIGEgYm9vbGVhbi4nO1xuICAgIH1cbiAgICBpZiAocGFnZXMuZW5hYmxlTG9jYWxpemF0aW9uID09PSB1bmRlZmluZWQpIHtcbiAgICAgIHBhZ2VzLmVuYWJsZUxvY2FsaXphdGlvbiA9IFBhZ2VzT3B0aW9ucy5lbmFibGVMb2NhbGl6YXRpb24uZGVmYXVsdDtcbiAgICB9IGVsc2UgaWYgKCFpc0Jvb2xlYW4ocGFnZXMuZW5hYmxlTG9jYWxpemF0aW9uKSkge1xuICAgICAgdGhyb3cgJ1BhcnNlIFNlcnZlciBvcHRpb24gcGFnZXMuZW5hYmxlTG9jYWxpemF0aW9uIG11c3QgYmUgYSBib29sZWFuLic7XG4gICAgfVxuICAgIGlmIChwYWdlcy5sb2NhbGl6YXRpb25Kc29uUGF0aCA9PT0gdW5kZWZpbmVkKSB7XG4gICAgICBwYWdlcy5sb2NhbGl6YXRpb25Kc29uUGF0aCA9IFBhZ2VzT3B0aW9ucy5sb2NhbGl6YXRpb25Kc29uUGF0aC5kZWZhdWx0O1xuICAgIH0gZWxzZSBpZiAoIWlzU3RyaW5nKHBhZ2VzLmxvY2FsaXphdGlvbkpzb25QYXRoKSkge1xuICAgICAgdGhyb3cgJ1BhcnNlIFNlcnZlciBvcHRpb24gcGFnZXMubG9jYWxpemF0aW9uSnNvblBhdGggbXVzdCBiZSBhIHN0cmluZy4nO1xuICAgIH1cbiAgICBpZiAocGFnZXMubG9jYWxpemF0aW9uRmFsbGJhY2tMb2NhbGUgPT09IHVuZGVmaW5lZCkge1xuICAgICAgcGFnZXMubG9jYWxpemF0aW9uRmFsbGJhY2tMb2NhbGUgPSBQYWdlc09wdGlvbnMubG9jYWxpemF0aW9uRmFsbGJhY2tMb2NhbGUuZGVmYXVsdDtcbiAgICB9IGVsc2UgaWYgKCFpc1N0cmluZyhwYWdlcy5sb2NhbGl6YXRpb25GYWxsYmFja0xvY2FsZSkpIHtcbiAgICAgIHRocm93ICdQYXJzZSBTZXJ2ZXIgb3B0aW9uIHBhZ2VzLmxvY2FsaXphdGlvbkZhbGxiYWNrTG9jYWxlIG11c3QgYmUgYSBzdHJpbmcuJztcbiAgICB9XG4gICAgaWYgKHBhZ2VzLnBsYWNlaG9sZGVycyA9PT0gdW5kZWZpbmVkKSB7XG4gICAgICBwYWdlcy5wbGFjZWhvbGRlcnMgPSBQYWdlc09wdGlvbnMucGxhY2Vob2xkZXJzLmRlZmF1bHQ7XG4gICAgfSBlbHNlIGlmIChcbiAgICAgIE9iamVjdC5wcm90b3R5cGUudG9TdHJpbmcuY2FsbChwYWdlcy5wbGFjZWhvbGRlcnMpICE9PSAnW29iamVjdCBPYmplY3RdJyAmJlxuICAgICAgdHlwZW9mIHBhZ2VzLnBsYWNlaG9sZGVycyAhPT0gJ2Z1bmN0aW9uJ1xuICAgICkge1xuICAgICAgdGhyb3cgJ1BhcnNlIFNlcnZlciBvcHRpb24gcGFnZXMucGxhY2Vob2xkZXJzIG11c3QgYmUgYW4gb2JqZWN0IG9yIGEgZnVuY3Rpb24uJztcbiAgICB9XG4gICAgaWYgKHBhZ2VzLmZvcmNlUmVkaXJlY3QgPT09IHVuZGVmaW5lZCkge1xuICAgICAgcGFnZXMuZm9yY2VSZWRpcmVjdCA9IFBhZ2VzT3B0aW9ucy5mb3JjZVJlZGlyZWN0LmRlZmF1bHQ7XG4gICAgfSBlbHNlIGlmICghaXNCb29sZWFuKHBhZ2VzLmZvcmNlUmVkaXJlY3QpKSB7XG4gICAgICB0aHJvdyAnUGFyc2UgU2VydmVyIG9wdGlvbiBwYWdlcy5mb3JjZVJlZGlyZWN0IG11c3QgYmUgYSBib29sZWFuLic7XG4gICAgfVxuICAgIGlmIChwYWdlcy5wYWdlc1BhdGggPT09IHVuZGVmaW5lZCkge1xuICAgICAgcGFnZXMucGFnZXNQYXRoID0gUGFnZXNPcHRpb25zLnBhZ2VzUGF0aC5kZWZhdWx0O1xuICAgIH0gZWxzZSBpZiAoIWlzU3RyaW5nKHBhZ2VzLnBhZ2VzUGF0aCkpIHtcbiAgICAgIHRocm93ICdQYXJzZSBTZXJ2ZXIgb3B0aW9uIHBhZ2VzLnBhZ2VzUGF0aCBtdXN0IGJlIGEgc3RyaW5nLic7XG4gICAgfVxuICAgIGlmIChwYWdlcy5wYWdlc0VuZHBvaW50ID09PSB1bmRlZmluZWQpIHtcbiAgICAgIHBhZ2VzLnBhZ2VzRW5kcG9pbnQgPSBQYWdlc09wdGlvbnMucGFnZXNFbmRwb2ludC5kZWZhdWx0O1xuICAgIH0gZWxzZSBpZiAoIWlzU3RyaW5nKHBhZ2VzLnBhZ2VzRW5kcG9pbnQpKSB7XG4gICAgICB0aHJvdyAnUGFyc2UgU2VydmVyIG9wdGlvbiBwYWdlcy5wYWdlc0VuZHBvaW50IG11c3QgYmUgYSBzdHJpbmcuJztcbiAgICB9XG4gICAgaWYgKHBhZ2VzLmN1c3RvbVVybHMgPT09IHVuZGVmaW5lZCkge1xuICAgICAgcGFnZXMuY3VzdG9tVXJscyA9IFBhZ2VzT3B0aW9ucy5jdXN0b21VcmxzLmRlZmF1bHQ7XG4gICAgfSBlbHNlIGlmIChPYmplY3QucHJvdG90eXBlLnRvU3RyaW5nLmNhbGwocGFnZXMuY3VzdG9tVXJscykgIT09ICdbb2JqZWN0IE9iamVjdF0nKSB7XG4gICAgICB0aHJvdyAnUGFyc2UgU2VydmVyIG9wdGlvbiBwYWdlcy5jdXN0b21VcmxzIG11c3QgYmUgYW4gb2JqZWN0Lic7XG4gICAgfVxuICAgIGlmIChwYWdlcy5jdXN0b21Sb3V0ZXMgPT09IHVuZGVmaW5lZCkge1xuICAgICAgcGFnZXMuY3VzdG9tUm91dGVzID0gUGFnZXNPcHRpb25zLmN1c3RvbVJvdXRlcy5kZWZhdWx0O1xuICAgIH0gZWxzZSBpZiAoIShwYWdlcy5jdXN0b21Sb3V0ZXMgaW5zdGFuY2VvZiBBcnJheSkpIHtcbiAgICAgIHRocm93ICdQYXJzZSBTZXJ2ZXIgb3B0aW9uIHBhZ2VzLmN1c3RvbVJvdXRlcyBtdXN0IGJlIGFuIGFycmF5Lic7XG4gICAgfVxuICB9XG5cbiAgc3RhdGljIHZhbGlkYXRlSWRlbXBvdGVuY3lPcHRpb25zKGlkZW1wb3RlbmN5T3B0aW9ucykge1xuICAgIGlmICghaWRlbXBvdGVuY3lPcHRpb25zKSB7XG4gICAgICByZXR1cm47XG4gICAgfVxuICAgIGlmIChpZGVtcG90ZW5jeU9wdGlvbnMudHRsID09PSB1bmRlZmluZWQpIHtcbiAgICAgIGlkZW1wb3RlbmN5T3B0aW9ucy50dGwgPSBJZGVtcG90ZW5jeU9wdGlvbnMudHRsLmRlZmF1bHQ7XG4gICAgfSBlbHNlIGlmICghaXNOYU4oaWRlbXBvdGVuY3lPcHRpb25zLnR0bCkgJiYgaWRlbXBvdGVuY3lPcHRpb25zLnR0bCA8PSAwKSB7XG4gICAgICB0aHJvdyAnaWRlbXBvdGVuY3kgVFRMIHZhbHVlIG11c3QgYmUgZ3JlYXRlciB0aGFuIDAgc2Vjb25kcyc7XG4gICAgfSBlbHNlIGlmIChpc05hTihpZGVtcG90ZW5jeU9wdGlvbnMudHRsKSkge1xuICAgICAgdGhyb3cgJ2lkZW1wb3RlbmN5IFRUTCB2YWx1ZSBtdXN0IGJlIGEgbnVtYmVyJztcbiAgICB9XG4gICAgaWYgKCFpZGVtcG90ZW5jeU9wdGlvbnMucGF0aHMpIHtcbiAgICAgIGlkZW1wb3RlbmN5T3B0aW9ucy5wYXRocyA9IElkZW1wb3RlbmN5T3B0aW9ucy5wYXRocy5kZWZhdWx0O1xuICAgIH0gZWxzZSBpZiAoIShpZGVtcG90ZW5jeU9wdGlvbnMucGF0aHMgaW5zdGFuY2VvZiBBcnJheSkpIHtcbiAgICAgIHRocm93ICdpZGVtcG90ZW5jeSBwYXRocyBtdXN0IGJlIG9mIGFuIGFycmF5IG9mIHN0cmluZ3MnO1xuICAgIH1cbiAgfVxuXG4gIHN0YXRpYyB2YWxpZGF0ZUFjY291bnRMb2Nrb3V0UG9saWN5KGFjY291bnRMb2Nrb3V0KSB7XG4gICAgaWYgKGFjY291bnRMb2Nrb3V0KSB7XG4gICAgICBpZiAoXG4gICAgICAgIHR5cGVvZiBhY2NvdW50TG9ja291dC5kdXJhdGlvbiAhPT0gJ251bWJlcicgfHxcbiAgICAgICAgYWNjb3VudExvY2tvdXQuZHVyYXRpb24gPD0gMCB8fFxuICAgICAgICBhY2NvdW50TG9ja291dC5kdXJhdGlvbiA+IDk5OTk5XG4gICAgICApIHtcbiAgICAgICAgdGhyb3cgJ0FjY291bnQgbG9ja291dCBkdXJhdGlvbiBzaG91bGQgYmUgZ3JlYXRlciB0aGFuIDAgYW5kIGxlc3MgdGhhbiAxMDAwMDAnO1xuICAgICAgfVxuXG4gICAgICBpZiAoXG4gICAgICAgICFOdW1iZXIuaXNJbnRlZ2VyKGFjY291bnRMb2Nrb3V0LnRocmVzaG9sZCkgfHxcbiAgICAgICAgYWNjb3VudExvY2tvdXQudGhyZXNob2xkIDwgMSB8fFxuICAgICAgICBhY2NvdW50TG9ja291dC50aHJlc2hvbGQgPiA5OTlcbiAgICAgICkge1xuICAgICAgICB0aHJvdyAnQWNjb3VudCBsb2Nrb3V0IHRocmVzaG9sZCBzaG91bGQgYmUgYW4gaW50ZWdlciBncmVhdGVyIHRoYW4gMCBhbmQgbGVzcyB0aGFuIDEwMDAnO1xuICAgICAgfVxuXG4gICAgICBpZiAoYWNjb3VudExvY2tvdXQudW5sb2NrT25QYXNzd29yZFJlc2V0ID09PSB1bmRlZmluZWQpIHtcbiAgICAgICAgYWNjb3VudExvY2tvdXQudW5sb2NrT25QYXNzd29yZFJlc2V0ID0gQWNjb3VudExvY2tvdXRPcHRpb25zLnVubG9ja09uUGFzc3dvcmRSZXNldC5kZWZhdWx0O1xuICAgICAgfSBlbHNlIGlmICghaXNCb29sZWFuKGFjY291bnRMb2Nrb3V0LnVubG9ja09uUGFzc3dvcmRSZXNldCkpIHtcbiAgICAgICAgdGhyb3cgJ1BhcnNlIFNlcnZlciBvcHRpb24gYWNjb3VudExvY2tvdXQudW5sb2NrT25QYXNzd29yZFJlc2V0IG11c3QgYmUgYSBib29sZWFuLic7XG4gICAgICB9XG4gICAgfVxuICB9XG5cbiAgc3RhdGljIHZhbGlkYXRlUGFzc3dvcmRQb2xpY3kocGFzc3dvcmRQb2xpY3kpIHtcbiAgICBpZiAocGFzc3dvcmRQb2xpY3kpIHtcbiAgICAgIGlmIChcbiAgICAgICAgcGFzc3dvcmRQb2xpY3kubWF4UGFzc3dvcmRBZ2UgIT09IHVuZGVmaW5lZCAmJlxuICAgICAgICAodHlwZW9mIHBhc3N3b3JkUG9saWN5Lm1heFBhc3N3b3JkQWdlICE9PSAnbnVtYmVyJyB8fCBwYXNzd29yZFBvbGljeS5tYXhQYXNzd29yZEFnZSA8IDApXG4gICAgICApIHtcbiAgICAgICAgdGhyb3cgJ3Bhc3N3b3JkUG9saWN5Lm1heFBhc3N3b3JkQWdlIG11c3QgYmUgYSBwb3NpdGl2ZSBudW1iZXInO1xuICAgICAgfVxuXG4gICAgICBpZiAoXG4gICAgICAgIHBhc3N3b3JkUG9saWN5LnJlc2V0VG9rZW5WYWxpZGl0eUR1cmF0aW9uICE9PSB1bmRlZmluZWQgJiZcbiAgICAgICAgKHR5cGVvZiBwYXNzd29yZFBvbGljeS5yZXNldFRva2VuVmFsaWRpdHlEdXJhdGlvbiAhPT0gJ251bWJlcicgfHxcbiAgICAgICAgICBwYXNzd29yZFBvbGljeS5yZXNldFRva2VuVmFsaWRpdHlEdXJhdGlvbiA8PSAwKVxuICAgICAgKSB7XG4gICAgICAgIHRocm93ICdwYXNzd29yZFBvbGljeS5yZXNldFRva2VuVmFsaWRpdHlEdXJhdGlvbiBtdXN0IGJlIGEgcG9zaXRpdmUgbnVtYmVyJztcbiAgICAgIH1cblxuICAgICAgaWYgKHBhc3N3b3JkUG9saWN5LnZhbGlkYXRvclBhdHRlcm4pIHtcbiAgICAgICAgaWYgKHR5cGVvZiBwYXNzd29yZFBvbGljeS52YWxpZGF0b3JQYXR0ZXJuID09PSAnc3RyaW5nJykge1xuICAgICAgICAgIHBhc3N3b3JkUG9saWN5LnZhbGlkYXRvclBhdHRlcm4gPSBuZXcgUmVnRXhwKHBhc3N3b3JkUG9saWN5LnZhbGlkYXRvclBhdHRlcm4pO1xuICAgICAgICB9IGVsc2UgaWYgKCEocGFzc3dvcmRQb2xpY3kudmFsaWRhdG9yUGF0dGVybiBpbnN0YW5jZW9mIFJlZ0V4cCkpIHtcbiAgICAgICAgICB0aHJvdyAncGFzc3dvcmRQb2xpY3kudmFsaWRhdG9yUGF0dGVybiBtdXN0IGJlIGEgcmVnZXggc3RyaW5nIG9yIFJlZ0V4cCBvYmplY3QuJztcbiAgICAgICAgfVxuICAgICAgfVxuXG4gICAgICBpZiAoXG4gICAgICAgIHBhc3N3b3JkUG9saWN5LnZhbGlkYXRvckNhbGxiYWNrICYmXG4gICAgICAgIHR5cGVvZiBwYXNzd29yZFBvbGljeS52YWxpZGF0b3JDYWxsYmFjayAhPT0gJ2Z1bmN0aW9uJ1xuICAgICAgKSB7XG4gICAgICAgIHRocm93ICdwYXNzd29yZFBvbGljeS52YWxpZGF0b3JDYWxsYmFjayBtdXN0IGJlIGEgZnVuY3Rpb24uJztcbiAgICAgIH1cblxuICAgICAgaWYgKFxuICAgICAgICBwYXNzd29yZFBvbGljeS5kb05vdEFsbG93VXNlcm5hbWUgJiZcbiAgICAgICAgdHlwZW9mIHBhc3N3b3JkUG9saWN5LmRvTm90QWxsb3dVc2VybmFtZSAhPT0gJ2Jvb2xlYW4nXG4gICAgICApIHtcbiAgICAgICAgdGhyb3cgJ3Bhc3N3b3JkUG9saWN5LmRvTm90QWxsb3dVc2VybmFtZSBtdXN0IGJlIGEgYm9vbGVhbiB2YWx1ZS4nO1xuICAgICAgfVxuXG4gICAgICBpZiAoXG4gICAgICAgIHBhc3N3b3JkUG9saWN5Lm1heFBhc3N3b3JkSGlzdG9yeSAmJlxuICAgICAgICAoIU51bWJlci5pc0ludGVnZXIocGFzc3dvcmRQb2xpY3kubWF4UGFzc3dvcmRIaXN0b3J5KSB8fFxuICAgICAgICAgIHBhc3N3b3JkUG9saWN5Lm1heFBhc3N3b3JkSGlzdG9yeSA8PSAwIHx8XG4gICAgICAgICAgcGFzc3dvcmRQb2xpY3kubWF4UGFzc3dvcmRIaXN0b3J5ID4gMjApXG4gICAgICApIHtcbiAgICAgICAgdGhyb3cgJ3Bhc3N3b3JkUG9saWN5Lm1heFBhc3N3b3JkSGlzdG9yeSBtdXN0IGJlIGFuIGludGVnZXIgcmFuZ2luZyAwIC0gMjAnO1xuICAgICAgfVxuXG4gICAgICBpZiAoXG4gICAgICAgIHBhc3N3b3JkUG9saWN5LnJlc2V0VG9rZW5SZXVzZUlmVmFsaWQgJiZcbiAgICAgICAgdHlwZW9mIHBhc3N3b3JkUG9saWN5LnJlc2V0VG9rZW5SZXVzZUlmVmFsaWQgIT09ICdib29sZWFuJ1xuICAgICAgKSB7XG4gICAgICAgIHRocm93ICdyZXNldFRva2VuUmV1c2VJZlZhbGlkIG11c3QgYmUgYSBib29sZWFuIHZhbHVlJztcbiAgICAgIH1cbiAgICAgIGlmIChwYXNzd29yZFBvbGljeS5yZXNldFRva2VuUmV1c2VJZlZhbGlkICYmICFwYXNzd29yZFBvbGljeS5yZXNldFRva2VuVmFsaWRpdHlEdXJhdGlvbikge1xuICAgICAgICB0aHJvdyAnWW91IGNhbm5vdCB1c2UgcmVzZXRUb2tlblJldXNlSWZWYWxpZCB3aXRob3V0IHJlc2V0VG9rZW5WYWxpZGl0eUR1cmF0aW9uJztcbiAgICAgIH1cbiAgICB9XG4gIH1cblxuICAvLyBpZiB0aGUgcGFzc3dvcmRQb2xpY3kudmFsaWRhdG9yUGF0dGVybiBpcyBjb25maWd1cmVkIHRoZW4gc2V0dXAgYSBjYWxsYmFjayB0byBwcm9jZXNzIHRoZSBwYXR0ZXJuXG4gIHN0YXRpYyBzZXR1cFBhc3N3b3JkVmFsaWRhdG9yKHBhc3N3b3JkUG9saWN5KSB7XG4gICAgaWYgKHBhc3N3b3JkUG9saWN5ICYmIHBhc3N3b3JkUG9saWN5LnZhbGlkYXRvclBhdHRlcm4pIHtcbiAgICAgIHBhc3N3b3JkUG9saWN5LnBhdHRlcm5WYWxpZGF0b3IgPSB2YWx1ZSA9PiB7XG4gICAgICAgIHJldHVybiBwYXNzd29yZFBvbGljeS52YWxpZGF0b3JQYXR0ZXJuLnRlc3QodmFsdWUpO1xuICAgICAgfTtcbiAgICB9XG4gIH1cblxuICBzdGF0aWMgdmFsaWRhdGVFbWFpbENvbmZpZ3VyYXRpb24oe1xuICAgIGVtYWlsQWRhcHRlcixcbiAgICBhcHBOYW1lLFxuICAgIHB1YmxpY1NlcnZlclVSTCxcbiAgICBlbWFpbFZlcmlmeVRva2VuVmFsaWRpdHlEdXJhdGlvbixcbiAgICBlbWFpbFZlcmlmeVRva2VuUmV1c2VJZlZhbGlkLFxuICB9KSB7XG4gICAgaWYgKCFlbWFpbEFkYXB0ZXIpIHtcbiAgICAgIHRocm93ICdBbiBlbWFpbEFkYXB0ZXIgaXMgcmVxdWlyZWQgZm9yIGUtbWFpbCB2ZXJpZmljYXRpb24gYW5kIHBhc3N3b3JkIHJlc2V0cy4nO1xuICAgIH1cbiAgICBpZiAodHlwZW9mIGFwcE5hbWUgIT09ICdzdHJpbmcnKSB7XG4gICAgICB0aHJvdyAnQW4gYXBwIG5hbWUgaXMgcmVxdWlyZWQgZm9yIGUtbWFpbCB2ZXJpZmljYXRpb24gYW5kIHBhc3N3b3JkIHJlc2V0cy4nO1xuICAgIH1cbiAgICBpZiAodHlwZW9mIHB1YmxpY1NlcnZlclVSTCAhPT0gJ3N0cmluZycpIHtcbiAgICAgIHRocm93ICdBIHB1YmxpYyBzZXJ2ZXIgdXJsIGlzIHJlcXVpcmVkIGZvciBlLW1haWwgdmVyaWZpY2F0aW9uIGFuZCBwYXNzd29yZCByZXNldHMuJztcbiAgICB9XG4gICAgaWYgKGVtYWlsVmVyaWZ5VG9rZW5WYWxpZGl0eUR1cmF0aW9uKSB7XG4gICAgICBpZiAoaXNOYU4oZW1haWxWZXJpZnlUb2tlblZhbGlkaXR5RHVyYXRpb24pKSB7XG4gICAgICAgIHRocm93ICdFbWFpbCB2ZXJpZnkgdG9rZW4gdmFsaWRpdHkgZHVyYXRpb24gbXVzdCBiZSBhIHZhbGlkIG51bWJlci4nO1xuICAgICAgfSBlbHNlIGlmIChlbWFpbFZlcmlmeVRva2VuVmFsaWRpdHlEdXJhdGlvbiA8PSAwKSB7XG4gICAgICAgIHRocm93ICdFbWFpbCB2ZXJpZnkgdG9rZW4gdmFsaWRpdHkgZHVyYXRpb24gbXVzdCBiZSBhIHZhbHVlIGdyZWF0ZXIgdGhhbiAwLic7XG4gICAgICB9XG4gICAgfVxuICAgIGlmIChlbWFpbFZlcmlmeVRva2VuUmV1c2VJZlZhbGlkICYmIHR5cGVvZiBlbWFpbFZlcmlmeVRva2VuUmV1c2VJZlZhbGlkICE9PSAnYm9vbGVhbicpIHtcbiAgICAgIHRocm93ICdlbWFpbFZlcmlmeVRva2VuUmV1c2VJZlZhbGlkIG11c3QgYmUgYSBib29sZWFuIHZhbHVlJztcbiAgICB9XG4gICAgaWYgKGVtYWlsVmVyaWZ5VG9rZW5SZXVzZUlmVmFsaWQgJiYgIWVtYWlsVmVyaWZ5VG9rZW5WYWxpZGl0eUR1cmF0aW9uKSB7XG4gICAgICB0aHJvdyAnWW91IGNhbm5vdCB1c2UgZW1haWxWZXJpZnlUb2tlblJldXNlSWZWYWxpZCB3aXRob3V0IGVtYWlsVmVyaWZ5VG9rZW5WYWxpZGl0eUR1cmF0aW9uJztcbiAgICB9XG4gIH1cblxuICBzdGF0aWMgdmFsaWRhdGVGaWxlVXBsb2FkT3B0aW9ucyhmaWxlVXBsb2FkKSB7XG4gICAgdHJ5IHtcbiAgICAgIGlmIChmaWxlVXBsb2FkID09IG51bGwgfHwgdHlwZW9mIGZpbGVVcGxvYWQgIT09ICdvYmplY3QnIHx8IGZpbGVVcGxvYWQgaW5zdGFuY2VvZiBBcnJheSkge1xuICAgICAgICB0aHJvdyAnZmlsZVVwbG9hZCBtdXN0IGJlIGFuIG9iamVjdCB2YWx1ZS4nO1xuICAgICAgfVxuICAgIH0gY2F0Y2ggKGUpIHtcbiAgICAgIGlmIChlIGluc3RhbmNlb2YgUmVmZXJlbmNlRXJyb3IpIHtcbiAgICAgICAgcmV0dXJuO1xuICAgICAgfVxuICAgICAgdGhyb3cgZTtcbiAgICB9XG4gICAgaWYgKGZpbGVVcGxvYWQuZW5hYmxlRm9yQW5vbnltb3VzVXNlciA9PT0gdW5kZWZpbmVkKSB7XG4gICAgICBmaWxlVXBsb2FkLmVuYWJsZUZvckFub255bW91c1VzZXIgPSBGaWxlVXBsb2FkT3B0aW9ucy5lbmFibGVGb3JBbm9ueW1vdXNVc2VyLmRlZmF1bHQ7XG4gICAgfSBlbHNlIGlmICh0eXBlb2YgZmlsZVVwbG9hZC5lbmFibGVGb3JBbm9ueW1vdXNVc2VyICE9PSAnYm9vbGVhbicpIHtcbiAgICAgIHRocm93ICdmaWxlVXBsb2FkLmVuYWJsZUZvckFub255bW91c1VzZXIgbXVzdCBiZSBhIGJvb2xlYW4gdmFsdWUuJztcbiAgICB9XG4gICAgaWYgKGZpbGVVcGxvYWQuZW5hYmxlRm9yUHVibGljID09PSB1bmRlZmluZWQpIHtcbiAgICAgIGZpbGVVcGxvYWQuZW5hYmxlRm9yUHVibGljID0gRmlsZVVwbG9hZE9wdGlvbnMuZW5hYmxlRm9yUHVibGljLmRlZmF1bHQ7XG4gICAgfSBlbHNlIGlmICh0eXBlb2YgZmlsZVVwbG9hZC5lbmFibGVGb3JQdWJsaWMgIT09ICdib29sZWFuJykge1xuICAgICAgdGhyb3cgJ2ZpbGVVcGxvYWQuZW5hYmxlRm9yUHVibGljIG11c3QgYmUgYSBib29sZWFuIHZhbHVlLic7XG4gICAgfVxuICAgIGlmIChmaWxlVXBsb2FkLmVuYWJsZUZvckF1dGhlbnRpY2F0ZWRVc2VyID09PSB1bmRlZmluZWQpIHtcbiAgICAgIGZpbGVVcGxvYWQuZW5hYmxlRm9yQXV0aGVudGljYXRlZFVzZXIgPSBGaWxlVXBsb2FkT3B0aW9ucy5lbmFibGVGb3JBdXRoZW50aWNhdGVkVXNlci5kZWZhdWx0O1xuICAgIH0gZWxzZSBpZiAodHlwZW9mIGZpbGVVcGxvYWQuZW5hYmxlRm9yQXV0aGVudGljYXRlZFVzZXIgIT09ICdib29sZWFuJykge1xuICAgICAgdGhyb3cgJ2ZpbGVVcGxvYWQuZW5hYmxlRm9yQXV0aGVudGljYXRlZFVzZXIgbXVzdCBiZSBhIGJvb2xlYW4gdmFsdWUuJztcbiAgICB9XG4gIH1cblxuICBzdGF0aWMgdmFsaWRhdGVNYXN0ZXJLZXlJcHMobWFzdGVyS2V5SXBzKSB7XG4gICAgZm9yIChjb25zdCBpcCBvZiBtYXN0ZXJLZXlJcHMpIHtcbiAgICAgIGlmICghbmV0LmlzSVAoaXApKSB7XG4gICAgICAgIHRocm93IGBJbnZhbGlkIGlwIGluIG1hc3RlcktleUlwczogJHtpcH1gO1xuICAgICAgfVxuICAgIH1cbiAgfVxuXG4gIGdldCBtb3VudCgpIHtcbiAgICB2YXIgbW91bnQgPSB0aGlzLl9tb3VudDtcbiAgICBpZiAodGhpcy5wdWJsaWNTZXJ2ZXJVUkwpIHtcbiAgICAgIG1vdW50ID0gdGhpcy5wdWJsaWNTZXJ2ZXJVUkw7XG4gICAgfVxuICAgIHJldHVybiBtb3VudDtcbiAgfVxuXG4gIHNldCBtb3VudChuZXdWYWx1ZSkge1xuICAgIHRoaXMuX21vdW50ID0gbmV3VmFsdWU7XG4gIH1cblxuICBzdGF0aWMgdmFsaWRhdGVTZXNzaW9uQ29uZmlndXJhdGlvbihzZXNzaW9uTGVuZ3RoLCBleHBpcmVJbmFjdGl2ZVNlc3Npb25zKSB7XG4gICAgaWYgKGV4cGlyZUluYWN0aXZlU2Vzc2lvbnMpIHtcbiAgICAgIGlmIChpc05hTihzZXNzaW9uTGVuZ3RoKSkge1xuICAgICAgICB0aHJvdyAnU2Vzc2lvbiBsZW5ndGggbXVzdCBiZSBhIHZhbGlkIG51bWJlci4nO1xuICAgICAgfSBlbHNlIGlmIChzZXNzaW9uTGVuZ3RoIDw9IDApIHtcbiAgICAgICAgdGhyb3cgJ1Nlc3Npb24gbGVuZ3RoIG11c3QgYmUgYSB2YWx1ZSBncmVhdGVyIHRoYW4gMC4nO1xuICAgICAgfVxuICAgIH1cbiAgfVxuXG4gIHN0YXRpYyB2YWxpZGF0ZU1heExpbWl0KG1heExpbWl0KSB7XG4gICAgaWYgKG1heExpbWl0IDw9IDApIHtcbiAgICAgIHRocm93ICdNYXggbGltaXQgbXVzdCBiZSBhIHZhbHVlIGdyZWF0ZXIgdGhhbiAwLic7XG4gICAgfVxuICB9XG5cbiAgc3RhdGljIHZhbGlkYXRlQWxsb3dIZWFkZXJzKGFsbG93SGVhZGVycykge1xuICAgIGlmICghW251bGwsIHVuZGVmaW5lZF0uaW5jbHVkZXMoYWxsb3dIZWFkZXJzKSkge1xuICAgICAgaWYgKEFycmF5LmlzQXJyYXkoYWxsb3dIZWFkZXJzKSkge1xuICAgICAgICBhbGxvd0hlYWRlcnMuZm9yRWFjaChoZWFkZXIgPT4ge1xuICAgICAgICAgIGlmICh0eXBlb2YgaGVhZGVyICE9PSAnc3RyaW5nJykge1xuICAgICAgICAgICAgdGhyb3cgJ0FsbG93IGhlYWRlcnMgbXVzdCBvbmx5IGNvbnRhaW4gc3RyaW5ncyc7XG4gICAgICAgICAgfSBlbHNlIGlmICghaGVhZGVyLnRyaW0oKS5sZW5ndGgpIHtcbiAgICAgICAgICAgIHRocm93ICdBbGxvdyBoZWFkZXJzIG11c3Qgbm90IGNvbnRhaW4gZW1wdHkgc3RyaW5ncyc7XG4gICAgICAgICAgfVxuICAgICAgICB9KTtcbiAgICAgIH0gZWxzZSB7XG4gICAgICAgIHRocm93ICdBbGxvdyBoZWFkZXJzIG11c3QgYmUgYW4gYXJyYXknO1xuICAgICAgfVxuICAgIH1cbiAgfVxuXG4gIGdlbmVyYXRlRW1haWxWZXJpZnlUb2tlbkV4cGlyZXNBdCgpIHtcbiAgICBpZiAoIXRoaXMudmVyaWZ5VXNlckVtYWlscyB8fCAhdGhpcy5lbWFpbFZlcmlmeVRva2VuVmFsaWRpdHlEdXJhdGlvbikge1xuICAgICAgcmV0dXJuIHVuZGVmaW5lZDtcbiAgICB9XG4gICAgdmFyIG5vdyA9IG5ldyBEYXRlKCk7XG4gICAgcmV0dXJuIG5ldyBEYXRlKG5vdy5nZXRUaW1lKCkgKyB0aGlzLmVtYWlsVmVyaWZ5VG9rZW5WYWxpZGl0eUR1cmF0aW9uICogMTAwMCk7XG4gIH1cblxuICBnZW5lcmF0ZVBhc3N3b3JkUmVzZXRUb2tlbkV4cGlyZXNBdCgpIHtcbiAgICBpZiAoIXRoaXMucGFzc3dvcmRQb2xpY3kgfHwgIXRoaXMucGFzc3dvcmRQb2xpY3kucmVzZXRUb2tlblZhbGlkaXR5RHVyYXRpb24pIHtcbiAgICAgIHJldHVybiB1bmRlZmluZWQ7XG4gICAgfVxuICAgIGNvbnN0IG5vdyA9IG5ldyBEYXRlKCk7XG4gICAgcmV0dXJuIG5ldyBEYXRlKG5vdy5nZXRUaW1lKCkgKyB0aGlzLnBhc3N3b3JkUG9saWN5LnJlc2V0VG9rZW5WYWxpZGl0eUR1cmF0aW9uICogMTAwMCk7XG4gIH1cblxuICBnZW5lcmF0ZVNlc3Npb25FeHBpcmVzQXQoKSB7XG4gICAgaWYgKCF0aGlzLmV4cGlyZUluYWN0aXZlU2Vzc2lvbnMpIHtcbiAgICAgIHJldHVybiB1bmRlZmluZWQ7XG4gICAgfVxuICAgIHZhciBub3cgPSBuZXcgRGF0ZSgpO1xuICAgIHJldHVybiBuZXcgRGF0ZShub3cuZ2V0VGltZSgpICsgdGhpcy5zZXNzaW9uTGVuZ3RoICogMTAwMCk7XG4gIH1cblxuICBnZXQgaW52YWxpZExpbmtVUkwoKSB7XG4gICAgcmV0dXJuIHRoaXMuY3VzdG9tUGFnZXMuaW52YWxpZExpbmsgfHwgYCR7dGhpcy5wdWJsaWNTZXJ2ZXJVUkx9L2FwcHMvaW52YWxpZF9saW5rLmh0bWxgO1xuICB9XG5cbiAgZ2V0IGludmFsaWRWZXJpZmljYXRpb25MaW5rVVJMKCkge1xuICAgIHJldHVybiAoXG4gICAgICB0aGlzLmN1c3RvbVBhZ2VzLmludmFsaWRWZXJpZmljYXRpb25MaW5rIHx8XG4gICAgICBgJHt0aGlzLnB1YmxpY1NlcnZlclVSTH0vYXBwcy9pbnZhbGlkX3ZlcmlmaWNhdGlvbl9saW5rLmh0bWxgXG4gICAgKTtcbiAgfVxuXG4gIGdldCBsaW5rU2VuZFN1Y2Nlc3NVUkwoKSB7XG4gICAgcmV0dXJuIChcbiAgICAgIHRoaXMuY3VzdG9tUGFnZXMubGlua1NlbmRTdWNjZXNzIHx8IGAke3RoaXMucHVibGljU2VydmVyVVJMfS9hcHBzL2xpbmtfc2VuZF9zdWNjZXNzLmh0bWxgXG4gICAgKTtcbiAgfVxuXG4gIGdldCBsaW5rU2VuZEZhaWxVUkwoKSB7XG4gICAgcmV0dXJuIHRoaXMuY3VzdG9tUGFnZXMubGlua1NlbmRGYWlsIHx8IGAke3RoaXMucHVibGljU2VydmVyVVJMfS9hcHBzL2xpbmtfc2VuZF9mYWlsLmh0bWxgO1xuICB9XG5cbiAgZ2V0IHZlcmlmeUVtYWlsU3VjY2Vzc1VSTCgpIHtcbiAgICByZXR1cm4gKFxuICAgICAgdGhpcy5jdXN0b21QYWdlcy52ZXJpZnlFbWFpbFN1Y2Nlc3MgfHxcbiAgICAgIGAke3RoaXMucHVibGljU2VydmVyVVJMfS9hcHBzL3ZlcmlmeV9lbWFpbF9zdWNjZXNzLmh0bWxgXG4gICAgKTtcbiAgfVxuXG4gIGdldCBjaG9vc2VQYXNzd29yZFVSTCgpIHtcbiAgICByZXR1cm4gdGhpcy5jdXN0b21QYWdlcy5jaG9vc2VQYXNzd29yZCB8fCBgJHt0aGlzLnB1YmxpY1NlcnZlclVSTH0vYXBwcy9jaG9vc2VfcGFzc3dvcmRgO1xuICB9XG5cbiAgZ2V0IHJlcXVlc3RSZXNldFBhc3N3b3JkVVJMKCkge1xuICAgIHJldHVybiBgJHt0aGlzLnB1YmxpY1NlcnZlclVSTH0vJHt0aGlzLnBhZ2VzRW5kcG9pbnR9LyR7dGhpcy5hcHBsaWNhdGlvbklkfS9yZXF1ZXN0X3Bhc3N3b3JkX3Jlc2V0YDtcbiAgfVxuXG4gIGdldCBwYXNzd29yZFJlc2V0U3VjY2Vzc1VSTCgpIHtcbiAgICByZXR1cm4gKFxuICAgICAgdGhpcy5jdXN0b21QYWdlcy5wYXNzd29yZFJlc2V0U3VjY2VzcyB8fFxuICAgICAgYCR7dGhpcy5wdWJsaWNTZXJ2ZXJVUkx9L2FwcHMvcGFzc3dvcmRfcmVzZXRfc3VjY2Vzcy5odG1sYFxuICAgICk7XG4gIH1cblxuICBnZXQgcGFyc2VGcmFtZVVSTCgpIHtcbiAgICByZXR1cm4gdGhpcy5jdXN0b21QYWdlcy5wYXJzZUZyYW1lVVJMO1xuICB9XG5cbiAgZ2V0IHZlcmlmeUVtYWlsVVJMKCkge1xuICAgIHJldHVybiBgJHt0aGlzLnB1YmxpY1NlcnZlclVSTH0vJHt0aGlzLnBhZ2VzRW5kcG9pbnR9LyR7dGhpcy5hcHBsaWNhdGlvbklkfS92ZXJpZnlfZW1haWxgO1xuICB9XG5cbiAgLy8gVE9ETzogUmVtb3ZlIHRoaXMgZnVuY3Rpb24gb25jZSBQYWdlc1JvdXRlciByZXBsYWNlcyB0aGUgUHVibGljQVBJUm91dGVyO1xuICAvLyB0aGUgKGRlZmF1bHQpIGVuZHBvaW50IGhhcyB0byBiZSBkZWZpbmVkIGluIFBhZ2VzUm91dGVyIG9ubHkuXG4gIGdldCBwYWdlc0VuZHBvaW50KCkge1xuICAgIHJldHVybiB0aGlzLnBhZ2VzICYmIHRoaXMucGFnZXMuZW5hYmxlUm91dGVyICYmIHRoaXMucGFnZXMucGFnZXNFbmRwb2ludFxuICAgICAgPyB0aGlzLnBhZ2VzLnBhZ2VzRW5kcG9pbnRcbiAgICAgIDogJ2FwcHMnO1xuICB9XG59XG5cbmV4cG9ydCBkZWZhdWx0IENvbmZpZztcbm1vZHVsZS5leHBvcnRzID0gQ29uZmlnO1xuIl19